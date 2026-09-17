REVOKE ALL ON FUNCTION public.trigger_award_gift_badges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_award_gift_badges() TO service_role;