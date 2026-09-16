-- Security lockdown: trigger helpers and server-only functions must not be callable by clients
do $$
declare f record;
begin
  for f in
    select p.oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'sync_friend_request','sync_friend_delete','guard_profile_sensitive_fields',
        'grant_owner_admin_role','settle_game'
      )
  loop
    execute format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated, anon', f.oid::regprocedure);
    execute format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.oid::regprocedure);
  end loop;
end $$;

-- ============= الدومينو: لعبة جماعية حقيقية بتسوية على السيرفر =============

create table if not exists public.domino_games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting' check (status in ('waiting','playing','finished','cancelled')),
  bet integer not null check (bet >= 10 and bet <= 100000),
  room_id uuid references public.rooms(id) on delete set null,
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid references auth.users(id) on delete cascade,
  winner_id uuid references auth.users(id) on delete set null,
  state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists domino_games_waiting_idx on public.domino_games (bet, created_at) where status = 'waiting';
create index if not exists domino_games_players_idx on public.domino_games (player1_id, player2_id);

GRANT SELECT ON public.domino_games TO authenticated;
GRANT ALL ON public.domino_games TO service_role;

alter table public.domino_games enable row level security;

create policy "lobby and players read domino games"
  on public.domino_games for select to authenticated
  using (status = 'waiting' or player1_id = auth.uid() or player2_id = auth.uid());

create trigger domino_games_updated before update on public.domino_games
  for each row execute function public.update_updated_at_column();

do $$
begin
  alter publication supabase_realtime add table public.domino_games;
exception when duplicate_object then null;
end $$;

-- helpers (internal only)
create or replace function public.domino_tile_a(t integer) returns integer
language sql immutable as $$ select t / 8 $$;

create or replace function public.domino_tile_b(t integer) returns integer
language sql immutable as $$ select t % 8 $$;

create or replace function public.domino_deal() returns jsonb
language plpgsql volatile as $$
declare
  tiles integer[]; h1 integer[]; h2 integer[]; pool integer[]; i integer;
begin
  tiles := array(select a * 8 + b from generate_series(0, 6) a, generate_series(0, 6) b where b >= a order by random());
  h1 := '{}'; h2 := '{}';
  for i in 1..7 loop
    h1 := h1 || tiles[i];
    h2 := h2 || tiles[7 + i];
  end loop;
  pool := tiles[15:28];
  return jsonb_build_object(
    'hands', jsonb_build_object('p1', to_jsonb(h1), 'p2', to_jsonb(h2)),
    'board', '[]'::jsonb,
    'left', -1, 'right', -1,
    'boneyard', to_jsonb(pool),
    'turn', 'p1',
    'passes', 0
  );
end $$;

create or replace function public.domino_has_playable(state jsonb, seat text) returns boolean
language sql stable as $$
  select exists (
    select 1
    from unnest(array(select jsonb_array_elements_text(state->'hands'->seat))::integer[]) t
    where (state->>'left')::integer = -1
       or domino_tile_a(t) = (state->>'left')::integer
       or domino_tile_b(t) = (state->>'left')::integer
       or domino_tile_a(t) = (state->>'right')::integer
       or domino_tile_b(t) = (state->>'right')::integer
  )
$$;

create or replace function public.domino_pips(state jsonb, seat text) returns integer
language sql stable as $$
  select coalesce(sum(domino_tile_a(t) + domino_tile_b(t)), 0)
  from unnest(array(select jsonb_array_elements_text(state->'hands'->seat))::integer[]) t
$$;

create or replace function public.domino_credit(_user_id uuid, _amount integer, _ref text) returns void
language plpgsql security definer set search_path = public as $$
declare v_bal integer;
begin
  select coins into v_bal from coin_wallets where user_id = _user_id for update;
  if v_bal is null then raise exception 'لا توجد محفظة'; end if;
  update coin_wallets set coins = v_bal + _amount, updated_at = now() where user_id = _user_id;
  insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (_user_id, 'game', _amount, v_bal, v_bal + _amount, _ref);
end $$;

-- الانضمام أو إنشاء طاولة (خصم الرهان ذرّيًا)
create or replace function public.domino_join(_uid uuid, _bet integer, _room_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_game record;
  v_bal integer;
  v_state jsonb;
  v_new_id uuid;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if _bet < 10 or _bet > 100000 then raise exception 'مبلغ الرهان غير صالح'; end if;

  if exists (
    select 1 from domino_games
    where status = 'playing' and (_uid in (player1_id, player2_id))
  ) then
    raise exception 'لديك مباراة دومينو جارية بالفعل';
  end if;

  select coins into v_bal from coin_wallets where user_id = _uid for update;
  if v_bal is null then raise exception 'لا توجد محفظة'; end if;
  if v_bal < _bet then raise exception 'رصيدك غير كافٍ'; end if;

  select id into v_game
    from domino_games
    where status = 'waiting' and bet = _bet and player1_id <> _uid
      and room_id is not distinct from _room_id
    order by created_at
    for update skip locked
    limit 1;

  update coin_wallets set coins = v_bal - _bet, updated_at = now() where user_id = _uid;
  insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (_uid, 'game', -_bet, v_bal, v_bal - _bet, 'domino:entry');

  if v_game.id is not null then
    update domino_games set player2_id = _uid, status = 'playing', updated_at = now()
      where id = v_game.id;
    return v_game.id;
  end if;

  v_state := domino_deal();
  insert into domino_games (bet, room_id, player1_id, state)
    values (_bet, _room_id, _uid, v_state)
    returning id into v_new_id;
  return v_new_id;
end $$;

-- وضع قطعة على الطاولة
create or replace function public.domino_move(_uid uuid, _game_id uuid, _tile integer, _side text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g domino_games%rowtype;
  seat text;
  a integer; b integer; v_outer integer; v_inner integer;
  hand integer[];
  w_uid uuid; w_bal integer;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if _side not in ('left', 'right') then raise exception 'جهة غير صالحة'; end if;
  if _tile < 0 or _tile > 48 or _tile / 8 > _tile % 8 then raise exception 'قطعة غير صالحة'; end if;

  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'playing' then raise exception 'المباراة انتهت'; end if;

  seat := case when g.player1_id = _uid then 'p1' when g.player2_id = _uid then 'p2' else null end;
  if seat is null then raise exception 'لست لاعبًا في هذه المباراة'; end if;
  if coalesce(g.state->>'turn', 'p1') <> seat then raise exception 'ليس دورك'; end if;

  hand := array(select jsonb_array_elements_text(g.state->'hands'->seat))::integer[];
  if not (_tile = any(hand)) then raise exception 'هذه القطعة ليست معك'; end if;

  a := _tile / 8; b := _tile % 8;

  if (g.state->>'left')::integer = -1 then
    g.state := jsonb_set(jsonb_set(g.state, '{left}', to_jsonb(a)), '{right}', to_jsonb(b));
    g.state := jsonb_set(g.state, '{board}', jsonb_build_array(jsonb_build_array(a, b)));
  elsif _side = 'left' then
    v_inner := (g.state->>'left')::integer;
    if b = v_inner then v_outer := a;
    elsif a = v_inner then v_outer := b;
    else raise exception 'لا يمكن وضع هذه القطعة على اليسار'; end if;
    g.state := jsonb_set(g.state, '{left}', to_jsonb(v_outer));
    g.state := jsonb_set(g.state, '{board}', jsonb_build_array(jsonb_build_array(v_outer, v_inner)) || g.state->'board');
  else
    v_inner := (g.state->>'right')::integer;
    if a = v_inner then v_outer := b;
    elsif b = v_inner then v_outer := a;
    else raise exception 'لا يمكن وضع هذه القطعة على اليمين'; end if;
    g.state := jsonb_set(g.state, '{right}', to_jsonb(v_outer));
    g.state := jsonb_set(g.state, '{board}', (g.state->'board') || jsonb_build_array(jsonb_build_array(v_inner, v_outer)));
  end if;

  hand := array_remove(hand, _tile);
  g.state := jsonb_set(g.state, array['hands', seat], to_jsonb(hand));
  g.state := jsonb_set(g.state, '{passes}', '0'::jsonb);

  if coalesce(array_length(hand, 1), 0) = 0 then
    w_uid := _uid;
    select coins into w_bal from coin_wallets where user_id = w_uid for update;
    update coin_wallets set coins = w_bal + 2 * g.bet, updated_at = now() where user_id = w_uid;
    insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      values (w_uid, 'game', 2 * g.bet, w_bal, w_bal + 2 * g.bet, 'domino:win');
    update domino_games set status = 'finished', winner_id = w_uid, state = g.state, updated_at = now()
      where id = g.id;
    return g.state;
  end if;

  g.state := jsonb_set(g.state, '{turn}', to_jsonb(case when seat = 'p1' then 'p2' else 'p1' end));
  update domino_games set state = g.state, updated_at = now() where id = g.id;
  return g.state;
end $$;

-- سحب من البقرة أو تمرير، وحسم الطقيرة المسدودة
create or replace function public.domino_pass(_uid uuid, _game_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g domino_games%rowtype;
  seat text; other_seat text;
  hand integer[]; bone integer[]; drawn integer;
  pips1 integer; pips2 integer;
  w_uid uuid; w_bal integer;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'playing' then raise exception 'المباراة انتهت'; end if;

  seat := case when g.player1_id = _uid then 'p1' when g.player2_id = _uid then 'p2' else null end;
  if seat is null then raise exception 'لست لاعبًا في هذه المباراة'; end if;
  if coalesce(g.state->>'turn', 'p1') <> seat then raise exception 'ليس دورك'; end if;
  if domino_has_playable(g.state, seat) then raise exception 'لديك قطعة قابلة للعب'; end if;

  hand := array(select jsonb_array_elements_text(g.state->'hands'->seat))::integer[];
  bone := array(select jsonb_array_elements_text(g.state->'boneyard'))::integer[];

  while not domino_has_playable(g.state, seat) and coalesce(array_length(bone, 1), 0) > 0 loop
    drawn := bone[array_length(bone, 1)];
    bone := bone[1:array_length(bone, 1) - 1];
    hand := hand || drawn;
    g.state := jsonb_set(g.state, array['hands', seat], to_jsonb(hand));
    g.state := jsonb_set(g.state, '{boneyard}', to_jsonb(bone));
  end loop;

  if domino_has_playable(g.state, seat) then
    g.state := jsonb_set(g.state, '{passes}', '0'::jsonb);
    update domino_games set state = g.state, updated_at = now() where id = g.id;
    return g.state;
  end if;

  -- لا سحب ولا قطعة: تمرير
  if coalesce((g.state->>'passes')::integer, 0) + 1 >= 2 then
    -- طقيرة مسدودة: من يملك أقل مجموع يفوز، والتعادل يعيد الرهانات
    pips1 := domino_pips(g.state, 'p1');
    pips2 := domino_pips(g.state, 'p2');
    if pips1 = pips2 then
      perform domino_credit(g.player1_id, g.bet, 'domino:refund');
      perform domino_credit(g.player2_id, g.bet, 'domino:refund');
      update domino_games set status = 'finished', state = g.state, updated_at = now() where id = g.id;
      return g.state;
    end if;
    w_uid := case when pips1 < pips2 then g.player1_id else g.player2_id end;
    select coins into w_bal from coin_wallets where user_id = w_uid for update;
    update coin_wallets set coins = w_bal + 2 * g.bet, updated_at = now() where user_id = w_uid;
    insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      values (w_uid, 'game', 2 * g.bet, w_bal, w_bal + 2 * g.bet, 'domino:win');
    update domino_games set status = 'finished', winner_id = w_uid, state = g.state, updated_at = now()
      where id = g.id;
    return g.state;
  end if;

  other_seat := case when seat = 'p1' then 'p2' else 'p1' end;
  g.state := jsonb_set(g.state, '{passes}', to_jsonb(coalesce((g.state->>'passes')::integer, 0) + 1));
  g.state := jsonb_set(g.state, '{turn}', to_jsonb(other_seat));
  update domino_games set state = g.state, updated_at = now() where id = g.id;
  return g.state;
end $$;

-- الانسحاب: الخصم يفوز بالمرة
create or replace function public.domino_forfeit(_uid uuid, _game_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g domino_games%rowtype;
  seat text; w_uid uuid; w_bal integer;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'playing' then raise exception 'المباراة انتهت بالفعل'; end if;

  seat := case when g.player1_id = _uid then 'p1' when g.player2_id = _uid then 'p2' else null end;
  if seat is null then raise exception 'لست لاعبًا في هذه المباراة'; end if;

  w_uid := case when seat = 'p1' then g.player2_id else g.player1_id end;
  if w_uid is null then raise exception 'لا يوجد خصم'; end if;
  select coins into w_bal from coin_wallets where user_id = w_uid for update;
  update coin_wallets set coins = w_bal + 2 * g.bet, updated_at = now() where user_id = w_uid;
  insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (w_uid, 'game', 2 * g.bet, w_bal, w_bal + 2 * g.bet, 'domino:win');
  update domino_games set status = 'finished', winner_id = w_uid, updated_at = now() where id = g.id;
  return g.state;
end $$;

-- إلغاء طاولة انتظار: استرداد الرهان
create or replace function public.domino_cancel(_uid uuid, _game_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare g domino_games%rowtype;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'waiting' then raise exception 'لا يمكن الإلغاء الآن'; end if;
  if g.player1_id <> _uid then raise exception 'فقط صاحب الطاولة يمكنه الإلغاء'; end if;
  perform domino_credit(_uid, g.bet, 'domino:refund');
  update domino_games set status = 'cancelled', updated_at = now() where id = g.id;
end $$;

revoke execute on function public.domino_deal() from public, authenticated, anon;
revoke execute on function public.domino_tile_a(integer) from public, authenticated, anon;
revoke execute on function public.domino_tile_b(integer) from public, authenticated, anon;
revoke execute on function public.domino_has_playable(jsonb, text) from public, authenticated, anon;
revoke execute on function public.domino_pips(jsonb, text) from public, authenticated, anon;
revoke execute on function public.domino_credit(uuid, integer, text) from public, authenticated, anon;
revoke execute on function public.domino_join(uuid, integer, uuid) from public, authenticated, anon;
revoke execute on function public.domino_move(uuid, uuid, integer, text) from public, authenticated, anon;
revoke execute on function public.domino_pass(uuid, uuid) from public, authenticated, anon;
revoke execute on function public.domino_forfeit(uuid, uuid) from public, authenticated, anon;
revoke execute on function public.domino_cancel(uuid, uuid) from public, authenticated, anon;
grant execute on function public.domino_join(uuid, integer, uuid),
  public.domino_move(uuid, uuid, integer, text),
  public.domino_pass(uuid, uuid),
  public.domino_forfeit(uuid, uuid),
  public.domino_cancel(uuid, uuid)
  to service_role;