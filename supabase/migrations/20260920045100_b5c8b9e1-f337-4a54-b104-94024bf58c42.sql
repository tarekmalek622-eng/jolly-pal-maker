CREATE OR REPLACE FUNCTION public.room_week_start()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh'))::date);
$$;

REVOKE ALL ON FUNCTION public.room_treasure_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.room_rewards_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.room_treasure_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.room_rewards_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.room_support_register(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_room(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.room_treasure_on_gift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_week_start() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.room_treasure_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_rewards_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_treasure_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_rewards_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_support_register(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_room(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_week_start() TO authenticated, service_role;