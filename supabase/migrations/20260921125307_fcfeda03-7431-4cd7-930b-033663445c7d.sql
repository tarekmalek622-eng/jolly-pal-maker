REVOKE ALL ON FUNCTION public.award_gift_xp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_gift_xp() TO service_role;