
-- speed indexes
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON public.room_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_messages_created ON public.room_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_created ON public.coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_round ON public.wheel_bets (round_id);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_created ON public.wheel_bets (created_at);
CREATE INDEX IF NOT EXISTS idx_supercar_bets_round ON public.supercar_bets (round_id);
CREATE INDEX IF NOT EXISTS idx_supercar_bets_created ON public.supercar_bets (created_at);
CREATE INDEX IF NOT EXISTS idx_wheel_rounds_created ON public.wheel_rounds (created_at);
CREATE INDEX IF NOT EXISTS idx_supercar_rounds_created ON public.supercar_rounds (created_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created ON public.game_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_gift_tx_created ON public.gift_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON public.direct_messages (sender_id, receiver_id, created_at DESC);

-- maintenance settings (editable without code)
INSERT INTO public.app_settings (key, value)
VALUES ('maintenance', jsonb_build_object(
  'chat_retention_minutes', 60,
  'notification_retention_days', 14,
  'bet_retention_days', 3,
  'game_session_retention_days', 7,
  'audit_retention_days', 90
))
ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.maintenance_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s jsonb;
  chat_min int;
  notif_days int;
  bet_days int;
  gs_days int;
  audit_days int;
  d_chat int := 0;
  d_notif int := 0;
  d_bets int := 0;
  d_rounds int := 0;
  d_gs int := 0;
  d_audit int := 0;
  d_bags int := 0;
BEGIN
  SELECT value INTO s FROM public.app_settings WHERE key = 'maintenance';
  chat_min := COALESCE((s->>'chat_retention_minutes')::int, 60);
  notif_days := COALESCE((s->>'notification_retention_days')::int, 14);
  bet_days := COALESCE((s->>'bet_retention_days')::int, 3);
  gs_days := COALESCE((s->>'game_session_retention_days')::int, 7);
  audit_days := COALESCE((s->>'audit_retention_days')::int, 90);

  DELETE FROM public.room_messages WHERE created_at < now() - make_interval(mins => chat_min);
  GET DIAGNOSTICS d_chat = ROW_COUNT;

  DELETE FROM public.notifications WHERE created_at < now() - make_interval(days => notif_days);
  GET DIAGNOSTICS d_notif = ROW_COUNT;

  DELETE FROM public.wheel_bets WHERE created_at < now() - make_interval(days => bet_days);
  GET DIAGNOSTICS d_bets = ROW_COUNT;
  DELETE FROM public.supercar_bets WHERE created_at < now() - make_interval(days => bet_days);

  DELETE FROM public.wheel_rounds
   WHERE created_at < now() - make_interval(days => bet_days)
     AND status <> 'open'
     AND NOT EXISTS (SELECT 1 FROM public.wheel_bets b WHERE b.round_id = wheel_rounds.id);
  GET DIAGNOSTICS d_rounds = ROW_COUNT;
  DELETE FROM public.supercar_rounds
   WHERE created_at < now() - make_interval(days => bet_days)
     AND status <> 'open'
     AND NOT EXISTS (SELECT 1 FROM public.supercar_bets b WHERE b.round_id = supercar_rounds.id);

  DELETE FROM public.game_sessions WHERE created_at < now() - make_interval(days => gs_days);
  GET DIAGNOSTICS d_gs = ROW_COUNT;

  DELETE FROM public.lucky_bags
   WHERE expires_at < now() - interval '1 day'
     AND status <> 'active';
  GET DIAGNOSTICS d_bags = ROW_COUNT;

  DELETE FROM public.audit_logs WHERE created_at < now() - make_interval(days => audit_days);
  GET DIAGNOSTICS d_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'room_messages', d_chat,
    'notifications', d_notif,
    'bets', d_bets,
    'rounds', d_rounds,
    'game_sessions', d_gs,
    'lucky_bags', d_bags,
    'audit_logs', d_audit,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_cleanup() TO service_role;
