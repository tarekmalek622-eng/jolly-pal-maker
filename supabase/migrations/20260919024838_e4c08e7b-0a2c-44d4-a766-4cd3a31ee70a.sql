CREATE OR REPLACE FUNCTION public.wheel_round_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  r public.wheel_rounds;
  sess public.wheel_sessions;
BEGIN
  r := public.wheel_tick();
  IF r.id IS NULL THEN RETURN jsonb_build_object('round', NULL); END IF;
  SELECT * INTO sess FROM public.wheel_sessions WHERE id = r.session_id;
  RETURN jsonb_build_object(
    'round', jsonb_build_object(
      'id', r.id, 'round_no', coalesce(r.session_round_no, r.round_no), 'status', r.status,
      'slots', r.slots,
      'winning_key', CASE WHEN r.status IN ('betting','waiting','processing') THEN NULL ELSE r.winning_key END,
      'ends_at', r.ends_at,
      'settled_at', r.settled_at, 'total_bets', r.total_bets,
      'total_amount', r.total_amount, 'total_payout', r.total_payout),
    'session', CASE WHEN sess.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', sess.id, 'date', sess.session_date, 'round', sess.total_rounds,
      'max_rounds', sess.max_rounds, 'status', sess.status) END,
    'slot_totals', coalesce((
      SELECT jsonb_object_agg(slot_key, jsonb_build_object('total', total, 'players', players))
        FROM (SELECT slot_key, sum(amount)::bigint AS total, count(DISTINCT user_id)::int AS players
                FROM public.wheel_bets WHERE round_id = r.id GROUP BY slot_key) t
    ), '{}'::jsonb),
    'mine', coalesce((
      SELECT jsonb_object_agg(slot_key, amount) FROM (
        SELECT slot_key, sum(amount)::bigint AS amount FROM public.wheel_bets
         WHERE round_id = r.id AND user_id = uid GROUP BY slot_key) m
    ), '{}'::jsonb),
    'my_payout', coalesce((SELECT sum(payout)::bigint FROM public.wheel_bets
       WHERE round_id = r.id AND user_id = uid), 0)
  );
END $function$;