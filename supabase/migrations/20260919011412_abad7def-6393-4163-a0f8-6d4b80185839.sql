CREATE OR REPLACE FUNCTION public.break_app_stats(_period text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := public.cup_window_start(_period);
  _gifts jsonb;
  _games jsonb;
  _topups jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_value', COALESCE(SUM(total_price), 0),
    'count', COUNT(*),
    'senders', COUNT(DISTINCT sender_id),
    'receivers', COUNT(DISTINCT receiver_id),
    'rooms', COUNT(DISTINCT room_id)
  ) INTO _gifts
  FROM public.gift_transactions WHERE created_at >= _since;

  SELECT jsonb_build_object(
    'bets', COALESCE(SUM(bet), 0),
    'payouts', COALESCE(SUM(payout), 0),
    'net', COALESCE(SUM(payout - bet), 0),
    'rounds', COUNT(*),
    'max_bet', COALESCE(MAX(bet), 0),
    'max_payout', COALESCE(MAX(payout), 0)
  ) INTO _games
  FROM public.game_sessions WHERE created_at >= _since AND status <> 'pending';

  SELECT jsonb_build_object(
    'coins', COALESCE(SUM(coins), 0),
    'count', COUNT(*),
    'users', COUNT(DISTINCT user_id)
  ) INTO _topups
  FROM public.coin_purchase_requests WHERE created_at >= _since AND status = 'approved';

  RETURN jsonb_build_object('period', _period, 'since', _since, 'gifts', _gifts, 'games', _games, 'topups', _topups);
END;
$$;

REVOKE ALL ON FUNCTION public.break_app_stats(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.break_app_stats(text) TO service_role;