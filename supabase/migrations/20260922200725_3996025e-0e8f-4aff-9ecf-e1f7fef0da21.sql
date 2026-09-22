-- ============ 1) المهام اليومية والأسبوعية ============
create table if not exists public.task_definitions (
  key text primary key,
  title text not null,
  description text not null default '',
  period text not null default 'daily' check (period in ('daily','weekly')),
  metric text not null,
  target bigint not null default 1,
  reward_coins bigint not null default 0,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.task_definitions to authenticated, anon;
grant all on public.task_definitions to service_role;
alter table public.task_definitions enable row level security;
create policy "task defs readable" on public.task_definitions for select using (true);
create policy "task defs admin" on public.task_definitions for all to authenticated
  using (public.admin_has_section(auth.uid(),'tasks'))
  with check (public.admin_has_section(auth.uid(),'tasks'));

create table if not exists public.task_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null references public.task_definitions(key) on delete cascade,
  period_start date not null,
  reward_coins bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, task_key, period_start)
);
grant select on public.task_claims to authenticated;
grant all on public.task_claims to service_role;
alter table public.task_claims enable row level security;
create policy "own task claims" on public.task_claims for select to authenticated using (user_id = auth.uid());
create index if not exists task_claims_user_idx on public.task_claims(user_id, period_start);

insert into public.task_definitions (key,title,description,period,metric,target,reward_coins,sort_order) values
  ('daily_login','تسجيل الدخول اليومي','افتح التطبيق كل يوم واستلم مكافأتك','daily','login',1,20000,1),
  ('daily_gifts','أرسل 5 هدايا','أرسل 5 هدايا لأي مستخدم اليوم','daily','gift_count',5,50000,2),
  ('daily_chat','20 رسالة في الغرف','شارك بالدردشة داخل الغرف','daily','messages',20,30000,3),
  ('daily_games','العب 3 جولات','جرّب حظك في أي لعبة 3 مرات','daily','games',3,40000,4),
  ('weekly_gift_value','أهدِ 5 مليون','مجموع قيمة هداياك خلال الأسبوع','weekly','gift_value',5000000,300000,5),
  ('weekly_rooms','ادخل 10 غرف','انضم إلى 10 غرف مختلفة هذا الأسبوع','weekly','rooms_joined',10,150000,6)
on conflict (key) do nothing;

create or replace function public.task_period_start(_period text)
returns date language sql stable set search_path = public as $$
  select case when _period = 'weekly'
    then date_trunc('week', (now() at time zone 'Asia/Riyadh'))::date
    else (now() at time zone 'Asia/Riyadh')::date end;
$$;

create or replace function public.task_metric_value(_user_id uuid, _metric text, _since timestamptz)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v bigint := 0;
begin
  if _metric = 'login' then
    v := 1;
  elsif _metric = 'gift_count' then
    select coalesce(sum(quantity),0) into v from gift_transactions where sender_id=_user_id and created_at >= _since;
  elsif _metric = 'gift_value' then
    select coalesce(sum(total_price),0) into v from gift_transactions where sender_id=_user_id and created_at >= _since;
  elsif _metric = 'messages' then
    select count(*) into v from room_messages where user_id=_user_id and created_at >= _since;
  elsif _metric = 'games' then
    select count(*) into v from game_sessions where user_id=_user_id and created_at >= _since;
  elsif _metric = 'rooms_joined' then
    select count(distinct room_id) into v from room_members where user_id=_user_id and joined_at >= _since;
  end if;
  return coalesce(v,0);
end $$;

create or replace function public.tasks_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then raise exception 'غير مسجل'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', t.key, 'title', t.title, 'description', t.description, 'period', t.period,
    'target', t.target, 'reward', t.reward_coins,
    'progress', least(public.task_metric_value(v_uid, t.metric, public.task_period_start(t.period)::timestamptz), t.target),
    'claimed', exists (select 1 from task_claims c where c.user_id=v_uid and c.task_key=t.key and c.period_start=public.task_period_start(t.period))
  ) order by t.sort_order), '[]'::jsonb) into v
  from task_definitions t where t.is_active;
  return v;
end $$;

create or replace function public.task_claim(_key text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t task_definitions; v_start date; v_progress bigint; v_bal bigint;
begin
  if v_uid is null then raise exception 'غير مسجل'; end if;
  select * into t from task_definitions where key=_key and is_active;
  if t.key is null then raise exception 'المهمة غير متوفرة'; end if;
  v_start := public.task_period_start(t.period);
  v_progress := public.task_metric_value(v_uid, t.metric, v_start::timestamptz);
  if v_progress < t.target then raise exception 'لم تكتمل المهمة بعد'; end if;
  insert into task_claims (user_id, task_key, period_start, reward_coins)
    values (v_uid, t.key, v_start, t.reward_coins);
  select coins into v_bal from coin_wallets where user_id=v_uid for update;
  if v_bal is null then raise exception 'لا توجد محفظة'; end if;
  update coin_wallets set coins = v_bal + t.reward_coins, updated_at = now() where user_id=v_uid;
  insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (v_uid, 'reward', t.reward_coins, v_bal, v_bal + t.reward_coins, 'task:'||t.key);
  insert into notifications (user_id, kind, title, body)
    values (v_uid, 'reward', 'مكافأة مهمة', 'استلمت مكافأة مهمة «'||t.title||'»');
  return v_bal + t.reward_coins;
exception when unique_violation then
  raise exception 'استلمت مكافأة هذه المهمة بالفعل';
end $$;

-- ============ 2) دعوة الأصدقاء ============
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade unique,
  coins_inviter bigint not null default 0,
  coins_invitee bigint not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;
alter table public.referrals enable row level security;
create policy "own referrals" on public.referrals for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());
create index if not exists referrals_inviter_idx on public.referrals(inviter_id);

create or replace function public.referral_redeem(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_inviter uuid; v_created timestamptz;
  v_in bigint := 200000; v_out bigint := 100000; v_bal bigint;
begin
  if v_uid is null then raise exception 'غير مسجل'; end if;
  select id into v_inviter from profiles where lower(public_id) = lower(btrim(_code));
  if v_inviter is null then raise exception 'رمز الدعوة غير صحيح'; end if;
  if v_inviter = v_uid then raise exception 'لا يمكنك دعوة نفسك'; end if;
  select created_at into v_created from profiles where id = v_uid;
  if v_created < now() - interval '7 days' then raise exception 'رمز الدعوة يُستخدم خلال 7 أيام من إنشاء الحساب'; end if;
  insert into referrals (inviter_id, invitee_id, coins_inviter, coins_invitee)
    values (v_inviter, v_uid, v_in, v_out);

  select coins into v_bal from coin_wallets where user_id=v_inviter for update;
  if v_bal is not null then
    update coin_wallets set coins=v_bal+v_in, updated_at=now() where user_id=v_inviter;
    insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      values (v_inviter,'reward',v_in,v_bal,v_bal+v_in,'referral');
    insert into notifications (user_id, kind, title, body)
      values (v_inviter,'reward','مكافأة دعوة','صديق انضم برمز دعوتك — استلمت مكافأتك');
  end if;

  select coins into v_bal from coin_wallets where user_id=v_uid for update;
  if v_bal is not null then
    update coin_wallets set coins=v_bal+v_out, updated_at=now() where user_id=v_uid;
    insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      values (v_uid,'reward',v_out,v_bal,v_bal+v_out,'referral');
  end if;
  return jsonb_build_object('ok', true, 'coins', v_out);
exception when unique_violation then
  raise exception 'استخدمت رمز دعوة بالفعل';
end $$;

-- ============ 3) الدعم والشكاوى ============
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  category text not null default 'general',
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;
alter table public.support_tickets enable row level security;
create policy "own tickets" on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.admin_has_section(auth.uid(),'support'));
create policy "create tickets" on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid());
create policy "staff update tickets" on public.support_tickets for update to authenticated
  using (public.admin_has_section(auth.uid(),'support'))
  with check (public.admin_has_section(auth.uid(),'support'));

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert on public.support_messages to authenticated;
grant all on public.support_messages to service_role;
alter table public.support_messages enable row level security;
create policy "ticket messages read" on public.support_messages for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id
    and (t.user_id = auth.uid() or public.admin_has_section(auth.uid(),'support'))));
create policy "ticket messages write" on public.support_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from support_tickets t where t.id = ticket_id
    and (t.user_id = auth.uid() or public.admin_has_section(auth.uid(),'support'))));
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

create or replace function public.support_create_ticket(_subject text, _category text, _body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_open int;
begin
  if v_uid is null then raise exception 'غير مسجل'; end if;
  if length(btrim(coalesce(_subject,''))) < 3 then raise exception 'اكتب عنوانًا واضحًا'; end if;
  if length(btrim(coalesce(_body,''))) < 5 then raise exception 'اكتب تفاصيل الشكوى'; end if;
  select count(*) into v_open from support_tickets where user_id=v_uid and status <> 'closed';
  if v_open >= 3 then raise exception 'لديك 3 تذاكر مفتوحة — انتظر الرد عليها'; end if;
  insert into support_tickets (user_id, subject, category) values (v_uid, btrim(_subject), coalesce(_category,'general'))
    returning id into v_id;
  insert into support_messages (ticket_id, sender_id, body, is_staff) values (v_id, v_uid, btrim(_body), false);
  return v_id;
end $$;

create or replace function public.support_reply(_ticket_id uuid, _body text, _close boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t support_tickets; v_staff boolean;
begin
  if v_uid is null then raise exception 'غير مسجل'; end if;
  select * into t from support_tickets where id=_ticket_id;
  if t.id is null then raise exception 'التذكرة غير موجودة'; end if;
  v_staff := public.admin_has_section(v_uid,'support');
  if not v_staff and t.user_id <> v_uid then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_body,''))) < 2 then raise exception 'اكتب الرسالة'; end if;
  insert into support_messages (ticket_id, sender_id, body, is_staff) values (_ticket_id, v_uid, btrim(_body), v_staff);
  update support_tickets set
    status = case when _close then 'closed' when v_staff then 'answered' else 'open' end,
    updated_at = now()
  where id = _ticket_id;
  if v_staff then
    insert into notifications (user_id, kind, title, body)
      values (t.user_id, 'system', 'رد من الدعم', 'وصلك رد على شكوى: '||t.subject);
    insert into audit_logs (actor_id, target_id, action, new_value)
      values (v_uid, t.user_id, 'support_reply', jsonb_build_object('ticket', _ticket_id, 'closed', _close));
  end if;
  return true;
end $$;

-- ============ 4) مستوى الغرفة وشارة التوثيق ============
alter table public.rooms add column if not exists xp bigint not null default 0;
alter table public.rooms add column if not exists is_verified boolean not null default false;

create or replace function public.room_level_for(_xp bigint)
returns integer language sql immutable set search_path = public as $$
  select greatest(1, least(20, floor(sqrt(greatest(coalesce(_xp,0),0) / 1000000.0))::int + 1));
$$;

create or replace function public.room_xp_from_gift()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.room_id is not null then
    update rooms set xp = xp + new.total_price, updated_at = now() where id = new.room_id;
    update rooms set is_verified = true
      where id = new.room_id and is_verified = false and public.room_level_for(xp) >= 5;
  end if;
  return new;
end $$;
drop trigger if exists trg_room_xp_from_gift on public.gift_transactions;
create trigger trg_room_xp_from_gift after insert on public.gift_transactions
  for each row execute function public.room_xp_from_gift();

-- ============ 5) نوافذ الهدايا الموسمية ============
alter table public.gifts add column if not exists available_from timestamptz;
alter table public.gifts add column if not exists available_until timestamptz;
alter table public.gifts add column if not exists is_seasonal boolean not null default false;
create index if not exists gifts_window_idx on public.gifts(is_active, available_until);

-- ============ 6) الرسائل الصوتية في الخاص ============
alter table public.direct_messages add column if not exists audio_url text;
alter table public.direct_messages add column if not exists audio_duration_ms integer;

-- ============ 7) الترتيب الأسبوعي والجوائز التلقائية ============
create table if not exists public.weekly_rank_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  category text not null,
  settled_at timestamptz not null default now(),
  unique (week_start, category)
);
create table if not exists public.weekly_rank_payouts (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  category text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,
  score bigint not null default 0,
  coins bigint not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.weekly_rank_weeks to authenticated;
grant select on public.weekly_rank_payouts to authenticated;
grant all on public.weekly_rank_weeks, public.weekly_rank_payouts to service_role;
alter table public.weekly_rank_weeks enable row level security;
alter table public.weekly_rank_payouts enable row level security;
create policy "weeks readable" on public.weekly_rank_weeks for select to authenticated using (true);
create policy "payouts readable" on public.weekly_rank_payouts for select to authenticated using (true);
create index if not exists weekly_payouts_week_idx on public.weekly_rank_payouts(week_start, category, rank);

create or replace function public.weekly_ranking_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key='weekly_ranking'),
    '{"prizes":[500000,300000,150000],"categories":["gifter","receiver","recharge"]}'::jsonb);
$$;

create or replace function public.weekly_ranking_leaderboard(_category text, _week_start date, _limit int default 10)
returns table(user_id uuid, score bigint) language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := _week_start::timestamptz; v_to timestamptz := (_week_start + 7)::timestamptz;
begin
  if _category = 'gifter' then
    return query select g.sender_id, sum(g.total_price)::bigint from gift_transactions g
      where g.created_at >= v_from and g.created_at < v_to group by g.sender_id
      order by 2 desc limit _limit;
  elsif _category = 'receiver' then
    return query select g.receiver_id, sum(g.total_price)::bigint from gift_transactions g
      where g.created_at >= v_from and g.created_at < v_to group by g.receiver_id
      order by 2 desc limit _limit;
  else
    return query select r.user_id, sum(r.coins)::bigint from coin_purchase_requests r
      where r.status='approved' and r.created_at >= v_from and r.created_at < v_to group by r.user_id
      order by 2 desc limit _limit;
  end if;
end $$;

create or replace function public.weekly_ranking_settle(_week_start date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare s jsonb := public.weekly_ranking_settings();
  v_week date := coalesce(_week_start, public.room_week_start() - 7);
  v_cat text; v_row record; v_rank int; v_coins bigint; v_paid int := 0; v_bal bigint;
begin
  for v_cat in select jsonb_array_elements_text(s->'categories') loop
    if exists (select 1 from weekly_rank_weeks where week_start=v_week and category=v_cat) then
      continue;
    end if;
    insert into weekly_rank_weeks (week_start, category) values (v_week, v_cat);
    v_rank := 0;
    for v_row in select * from public.weekly_ranking_leaderboard(v_cat, v_week, jsonb_array_length(s->'prizes')) loop
      v_rank := v_rank + 1;
      v_coins := coalesce((s->'prizes'->>(v_rank-1))::bigint, 0);
      insert into weekly_rank_payouts (week_start, category, user_id, rank, score, coins)
        values (v_week, v_cat, v_row.user_id, v_rank, v_row.score, v_coins);
      select coins into v_bal from coin_wallets where user_id=v_row.user_id for update;
      if v_bal is not null and v_coins > 0 then
        update coin_wallets set coins=v_bal+v_coins, updated_at=now() where user_id=v_row.user_id;
        insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
          values (v_row.user_id,'reward',v_coins,v_bal,v_bal+v_coins,'weekly_rank:'||v_cat);
      end if;
      insert into notifications (user_id, kind, title, body)
        values (v_row.user_id,'reward','الترتيب الأسبوعي',
          'حصلت على المركز '||v_rank||' في تصنيف '||v_cat||' هذا الأسبوع');
      v_paid := v_paid + 1;
    end loop;
  end loop;
  return v_paid;
end $$;

-- ============ 8) تنبيهات الشحن غير المعتاد ============
create or replace function public.notify_unusual_recharge()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int; v_limit int := 3; v_admin uuid;
begin
  select count(*) into v_count from coin_purchase_requests
    where user_id = new.user_id and created_at >= now() - interval '24 hours';
  if v_count > v_limit or new.amount_cents >= 500000 then
    insert into audit_logs (actor_id, target_id, action, new_value)
      values (new.user_id, new.user_id, 'unusual_recharge',
        jsonb_build_object('requests_24h', v_count, 'amount_cents', new.amount_cents, 'request', new.id));
    for v_admin in select user_id from user_roles where role in ('super_admin','admin') loop
      insert into notifications (user_id, kind, title, body, metadata)
        values (v_admin, 'system', 'تنبيه شحن غير معتاد',
          'حساب سجّل '||v_count||' طلبات شحن خلال 24 ساعة', jsonb_build_object('user_id', new.user_id));
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_unusual_recharge on public.coin_purchase_requests;
create trigger trg_notify_unusual_recharge after insert on public.coin_purchase_requests
  for each row execute function public.notify_unusual_recharge();

-- ============ 9) لوحة إحصائيات المالك ============
create or replace function public.owner_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'غير مصرح'; end if;
  select jsonb_build_object(
    'users', (select count(*) from profiles),
    'online', (select count(*) from profiles where is_online),
    'rooms_active', (select count(*) from rooms where is_active and not is_disabled),
    'gifts_24h', (select coalesce(sum(total_price),0) from gift_transactions where created_at >= now() - interval '24 hours'),
    'recharge_7d', (select coalesce(sum(coins),0) from coin_purchase_requests where status='approved' and created_at >= now() - interval '7 days'),
    'pending_topups', (select count(*) from coin_purchase_requests where status='pending'),
    'open_tickets', (select count(*) from support_tickets where status <> 'closed'),
    'top_rooms', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select r.id, r.name, r.image_url, r.member_count, r.xp, public.room_level_for(r.xp) as level
        from rooms r where r.is_active order by r.xp desc limit 10) x),
    'top_gifters', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.display_name, p.public_id, p.avatar_url, sum(g.total_price) as total
        from gift_transactions g join profiles p on p.id = g.sender_id
        where g.created_at >= now() - interval '7 days'
        group by p.id, p.display_name, p.public_id, p.avatar_url order by total desc limit 10) x),
    'recharge_daily', (select coalesce(jsonb_agg(x order by (x->>'day')), '[]'::jsonb) from (
        select jsonb_build_object('day', d::date, 'coins', coalesce(sum(r.coins),0)) as x
        from generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d
        left join coin_purchase_requests r on r.status='approved' and r.created_at::date = d::date
        group by d) y)
  ) into v;
  return v;
end $$;

grant execute on function public.tasks_state(), public.task_claim(text), public.referral_redeem(text),
  public.support_create_ticket(text,text,text), public.support_reply(uuid,text,boolean),
  public.weekly_ranking_settle(date), public.weekly_ranking_leaderboard(text,date,int),
  public.weekly_ranking_settings(), public.owner_dashboard(), public.room_level_for(bigint),
  public.tasks_state() to authenticated;

-- تسوية الترتيب الأسبوعي كل اثنين 00:05 بتوقيت الرياض (21:05 UTC الأحد)
select cron.schedule('weekly-ranking-settle', '5 21 * * 0', $$select public.weekly_ranking_settle();$$)
where not exists (select 1 from cron.job where jobname = 'weekly-ranking-settle');