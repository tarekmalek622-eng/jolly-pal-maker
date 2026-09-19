REVOKE ALL ON FUNCTION public.award_gift_xp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_profile_level() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_gift_xp() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_level() TO service_role;