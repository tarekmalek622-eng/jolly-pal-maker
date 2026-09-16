-- إعدادات الدومينو
insert into public.app_settings (key, value)
values ('domino', jsonb_build_object('enabled', true, 'min_bet', 10, 'max_bet', 100000, 'payout_multiplier', 2, 'refund_hours', 24))
on conflict (key) do update set value = public.app_settings.value || excluded.value, updated_at = now();

create or replace function public.domino_settings()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select value from app_settings where key = 'domino'), '{}'::jsonb)
$$;
revoke all on function public.domino_settings() from anon, authenticated;
grant execute on function public.domino_settings() to authenticated;

create or replace function public.domino_log(state jsonb, entry jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select jsonb_set(state, '{log}', jsonb_concat(coalesce(state->'log', '[]'::jsonb), jsonb_build_array(entry)))
$$;
revoke all on function public.domino_log(jsonb, jsonb) from anon, authenticated;

-- الانضمام: حدود الرهان من الإعدادات + تهيئة السجل والنقاط
create or replace function public.domino_join(_uid uuid, _bet integer, _room_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_game record; v_bal integer; v_state jsonb; v_new_id uuid; s jsonb;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  s := domino_settings();
  if coalesce((s->>'enabled')::boolean, true) = false then raise exception 'الدومينو موقوف حاليًا'; end if;
  if _bet < coalesce((s->>'min_bet')::integer, 10) or _bet > coalesce((s->>'max_bet')::integer, 100000) then
    raise exception 'الرهان يجب أن يكون بين % و % كوينز', coalesce((s->>'min_bet')::integer, 10), coalesce((s->>'max_bet')::integer, 100000);
  end if;

  if exists (select 1 from domino_games where status = 'playing' and (_uid in (player1_id, player2_id))) then
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
    update domino_games
      set player2_id = _uid,
          status = 'playing',
          state = domino_log(state, jsonb_build_object('at', now(), 'seat', 'p2', 'action', 'start')),
          updated_at = now()
      where id = v_game.id;
    return v_game.id;
  end if;

  v_state := domino_deal();
  v_state := jsonb_set(v_state, '{scores}', jsonb_build_object('p1', 0, 'p2', 0));
  v_state := jsonb_set(v_state, '{log}', jsonb_build_array(jsonb_build_object('at', now(), 'seat', 'p1', 'action', 'create')));
  insert into domino_games (bet, room_id, player1_id, state)
    values (_bet, _room_id, _uid, v_state)
    returning id into v_new_id;
  return v_new_id;
end $function$;

-- النقلة: سجل + نقاط من السيرفر + جائزة حسب الإعدادات
create or replace function public.domino_move(_uid uuid, _game_id uuid, _tile integer, _side text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g domino_games%rowtype;
  seat text; other_seat text;
  a integer; b integer; v_outer integer; v_inner integer;
  hand integer[];
  w_uid uuid; w_bal integer; v_prize integer; v_points integer;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if _side not in ('left', 'right') then raise exception 'جهة غير صالحة'; end if;
  if _tile < 0 or _tile > 54 or _tile / 8 > _tile % 8 or _tile % 8 > 6 then raise exception 'قطعة غير صالحة'; end if;

  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'playing' then raise exception 'المباراة انتهت'; end if;

  seat := case when g.player1_id = _uid then 'p1' when g.player2_id = _uid then 'p2' else null end;
  if seat is null then raise exception 'لست لاعبًا في هذه المباراة'; end if;
  if coalesce(g.state->>'turn', 'p1') <> seat then raise exception 'ليس دورك'; end if;
  other_seat := case when seat = 'p1' then 'p2' else 'p1' end;

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
    g.state := jsonb_set(g.state, '{board}', jsonb_concat(jsonb_build_array(jsonb_build_array(v_outer, v_inner)), g.state->'board'));
  else
    v_inner := (g.state->>'right')::integer;
    if a = v_inner then v_outer := b;
    elsif b = v_inner then v_outer := a;
    else raise exception 'لا يمكن وضع هذه القطعة على اليمين'; end if;
    g.state := jsonb_set(g.state, '{right}', to_jsonb(v_outer));
    g.state := jsonb_set(g.state, '{board}', jsonb_concat(g.state->'board', jsonb_build_array(jsonb_build_array(v_inner, v_outer))));
  end if;

  hand := array_remove(hand, _tile);
  g.state := jsonb_set(g.state, array['hands', seat], to_jsonb(hand));
  g.state := jsonb_set(g.state, '{passes}', '0'::jsonb);
  g.state := domino_log(g.state, jsonb_build_object(
    'at', now(), 'seat', seat, 'action', 'move', 'tile', jsonb_build_array(a, b), 'side', _side,
    'left', g.state->'left', 'right', g.state->'right', 'remaining', coalesce(array_length(hand, 1), 0)));

  if coalesce(array_length(hand, 1), 0) = 0 then
    w_uid := _uid;
    v_points := domino_pips(g.state, other_seat);
    v_prize := floor(g.bet * coalesce((domino_settings()->>'payout_multiplier')::numeric, 2))::integer;
    g.state := jsonb_set(g.state, array['scores', seat],
      to_jsonb(coalesce((g.state->'scores'->>seat)::integer, 0) + v_points));
    g.state := domino_log(g.state, jsonb_build_object(
      'at', now(), 'seat', seat, 'action', 'win', 'points', v_points, 'prize', v_prize));
    select coins into w_bal from coin_wallets where user_id = w_uid for update;
    update coin_wallets set coins = w_bal + v_prize, updated_at = now() where user_id = w_uid;
    insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      values (w_uid, 'game', v_prize, w_bal, w_bal + v_prize, 'domino:win');
    update domino_games set status = 'finished', winner_id = w_uid, state = g.state, updated_at = now()
      where id = g.id;
    return g.state;
  end if;

  g.state := jsonb_set(g.state, '{turn}', to_jsonb(other_seat));
  update domino_games set state = g.state, updated_at = now() where id = g.id;
  return g.state;
end $function$;

-- التمرير/السحب: سجل + نقاط
create or replace function public.domino_pass(_uid uuid, _game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g domino_games%rowtype;
  seat text; other_seat text;
  hand integer[]; bone integer[]; drawn integer; drew integer := 0;
  pips1 integer; pips2 integer; w_seat text;
  w_uid uuid; w_bal integer; v_prize integer;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'playing' then raise exception 'المباراة انتهت'; end if;

  seat := case when g.player1_id = _uid then 'p1' when g.player2_id = _uid then 'p2' else null end;
  if seat is null then raise exception 'لست لاعبًا في هذه المباراة'; end if;
  if coalesce(g.state->>'turn', 'p1') <> seat then raise exception 'ليس دورك'; end if;
  if domino_has_playable(g.state, seat) then raise exception 'لديك قطعة قابلة للعب'; end if;
  other_seat := case when seat = 'p1' then 'p2' else 'p1' end;

  hand := array(select jsonb_array_elements_text(g.state->'hands'->seat))::integer[];
  bone := array(select jsonb_array_elements_text(g.state->'boneyard'))::integer[];

  while not domino_has_playable(g.state, seat) and coalesce(array_length(bone, 1), 0) > 0 loop
    drawn := bone[array_length(bone, 1)];
    bone := bone[1:array_length(bone, 1) - 1];
    hand := hand || drawn;
    drew := drew + 1;
    g.state := jsonb_set(g.state, array['hands', seat], to_jsonb(hand));
    g.state := jsonb_set(g.state, '{boneyard}', to_jsonb(bone));
  end loop;

  if drew > 0 then
    g.state := domino_log(g.state, jsonb_build_object('at', now(), 'seat', seat, 'action', 'draw', 'count', drew));
  end if;

  if domino_has_playable(g.state, seat) then
    g.state := jsonb_set(g.state, '{passes}', '0'::jsonb);
    update domino_games set state = g.state, updated_at = now() where id = g.id;
    return g.state;
  end if;

  g.state := domino_log(g.state, jsonb_build_object('at', now(), 'seat', seat, 'action', 'pass'));

  if coalesce((g.state->>'passes')::integer, 0) + 1 >= 2 then
    pips1 := domino_pips(g.state, 'p1');
    pips2 := domino_pips(g.state, 'p2');
    if pips1 = pips2 then
      g.state := domino_log(g.state, jsonb_build_object('at', now(), 'action', 'draw_end', 'p1', pips1, 'p2', pips2));
      perform domino_credit(g.player1_id, g.bet, 'domino:refund');
      perform domino_credit(g.player2_id, g.bet, 'domino:refund');
      update domino_games set status = 'finished', state = g.state, updated_at = now() where id = g.id;
      return g.state;
    end if;
    w_seat := case when pips1 < pips2 then 'p1' else 'p2' end;
    w_uid := case when w_seat = 'p1' then g.player1_id else g.player2_id end;
    v_prize := floor(g.bet * coalesce((domino_settings()->>'payout_multiplier')::numeric, 2))::integer;
    g.state := jsonb_set(g.state, array['scores', w_seat],
      to_jsonb(coalesce((g.state->'scores'->>w_seat)::integer, 0) + abs(pips1 - pips2)));
    g.state := domino_log(g.state, jsonb_build_object(
      'at', now(), 'seat', w_seat, 'action', 'blocked_win', 'points', abs(pips1 - pips2), 'prize', v_prize));
    select coins into w_bal from coin_wallets where user_id = w_uid for update;
    update coin_wallets set coins = w_bal + v_prize, updated_at = now() where user_id = w_uid;
    insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      values (w_uid, 'game', v_prize, w_bal, w_bal + v_prize, 'domino:win');
    update domino_games set status = 'finished', winner_id = w_uid, state = g.state, updated_at = now()
      where id = g.id;
    return g.state;
  end if;

  g.state := jsonb_set(g.state, '{passes}', to_jsonb(coalesce((g.state->>'passes')::integer, 0) + 1));
  g.state := jsonb_set(g.state, '{turn}', to_jsonb(other_seat));
  update domino_games set state = g.state, updated_at = now() where id = g.id;
  return g.state;
end $function$;

-- الانسحاب: سجل + نقاط + جائزة حسب الإعدادات
create or replace function public.domino_forfeit(_uid uuid, _game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g domino_games%rowtype;
  seat text; w_seat text; w_uid uuid; w_bal integer; v_prize integer; v_points integer;
begin
  if _uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into g from domino_games where id = _game_id for update;
  if g.id is null then raise exception 'المباراة غير موجودة'; end if;
  if g.status <> 'playing' then raise exception 'المباراة انتهت بالفعل'; end if;

  seat := case when g.player1_id = _uid then 'p1' when g.player2_id = _uid then 'p2' else null end;
  if seat is null then raise exception 'لست لاعبًا في هذه المباراة'; end if;

  w_seat := case when seat = 'p1' then 'p2' else 'p1' end;
  w_uid := case when seat = 'p1' then g.player2_id else g.player1_id end;
  if w_uid is null then raise exception 'لا يوجد خصم'; end if;

  v_points := domino_pips(g.state, seat);
  v_prize := floor(g.bet * coalesce((domino_settings()->>'payout_multiplier')::numeric, 2))::integer;
  g.state := jsonb_set(g.state, array['scores', w_seat],
    to_jsonb(coalesce((g.state->'scores'->>w_seat)::integer, 0) + v_points));
  g.state := domino_log(g.state, jsonb_build_object(
    'at', now(), 'seat', seat, 'action', 'forfeit', 'points', v_points, 'prize', v_prize));

  select coins into w_bal from coin_wallets where user_id = w_uid for update;
  update coin_wallets set coins = w_bal + v_prize, updated_at = now() where user_id = w_uid;
  insert into coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (w_uid, 'game', v_prize, w_bal, w_bal + v_prize, 'domino:win');
  update domino_games set status = 'finished', winner_id = w_uid, state = g.state, updated_at = now() where id = g.id;
  return g.state;
end $function$;

-- استرداد منتج من المتجر وإرجاع الكوينز
create or replace function public.refund_item(_user_item_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ui public.user_items;
  it public.store_items;
  bal bigint;
  win_hours integer;
begin
  if uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into ui from public.user_items where id = _user_item_id and user_id = uid for update;
  if ui.id is null then raise exception 'العنصر غير موجود'; end if;
  if ui.is_equipped then raise exception 'ألغِ تفعيل العنصر قبل الاسترداد'; end if;
  if ui.expires_at is not null and ui.expires_at < now() then raise exception 'انتهت صلاحية العنصر'; end if;

  win_hours := coalesce((domino_settings()->>'refund_hours')::integer, 24);
  if ui.created_at < now() - make_interval(hours => win_hours) then
    raise exception 'مدة الاسترداد (% ساعة) انتهت', win_hours;
  end if;

  select * into it from public.store_items where id = ui.item_id;
  if it.id is null then raise exception 'المنتج غير موجود'; end if;

  select coins into bal from public.coin_wallets where user_id = uid for update;
  update public.coin_wallets set coins = coalesce(bal, 0) + it.price, updated_at = now() where user_id = uid;
  insert into public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (uid, 'refund', it.price, coalesce(bal, 0), coalesce(bal, 0) + it.price, 'استرداد: ' || it.name);
  delete from public.user_items where id = ui.id;
  return coalesce(bal, 0) + it.price;
end $function$;

revoke all on function public.refund_item(uuid) from anon;
grant execute on function public.refund_item(uuid) to authenticated;