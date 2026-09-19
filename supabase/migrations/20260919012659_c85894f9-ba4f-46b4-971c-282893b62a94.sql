REVOKE ALL ON FUNCTION public.wheel_settle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_settle(uuid) TO service_role;