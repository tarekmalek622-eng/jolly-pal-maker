UPDATE public.app_settings
   SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object('banner_retention_hours', 24)
 WHERE key = 'maintenance';

INSERT INTO public.app_settings (key, value)
SELECT 'maintenance', jsonb_build_object('banner_retention_hours', 24)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'maintenance');

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
  banner_hours int;
  d_chat int := 0;
  d_notif int := 0;
  d_bets int := 0;
  d_rounds int := 0;
  d_gs int := 0;
  d_audit int := 0;
  d_bags int := 0;
  d_banners int := 0;
BEGIN
  SELECT value INTO s FROM public.app_settings WHERE key = 'maintenance';
  chat_min := COALESCE((s->>'chat_retention_minutes')::int, 60);
  notif_days := COALESCE((s->>'notification_retention_days')::int, 14);
  bet_days := COALESCE((s->>'bet_retention_days')::int, 3);
  gs_days := COALESCE((s->>'game_session_retention_days')::int, 7);
  audit_days := COALESCE((s->>'audit_retention_days')::int, 90);
  banner_hours := COALESCE((s->>'banner_retention_hours')::int, 24);

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

  DELETE FROM public.banners
   WHERE (ends_at IS NOT NULL AND ends_at < now())
      OR created_at < now() - make_interval(hours => banner_hours);
  GET DIAGNOSTICS d_banners = ROW_COUNT;

  DELETE FROM public.audit_logs WHERE created_at < now() - make_interval(days => audit_days);
  GET DIAGNOSTICS d_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'room_messages', d_chat,
    'notifications', d_notif,
    'bets', d_bets,
    'rounds', d_rounds,
    'game_sessions', d_gs,
    'lucky_bags', d_bags,
    'banners', d_banners,
    'audit_logs', d_audit,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_cleanup() TO service_role;