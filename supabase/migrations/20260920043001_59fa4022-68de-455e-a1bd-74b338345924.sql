REVOKE ALL ON FUNCTION public.relationship_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relationship_settings() FROM anon;
REVOKE ALL ON FUNCTION public.relationship_settings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_settings() TO service_role;
REVOKE ALL ON FUNCTION public.relationship_level_for(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relationship_level_for(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.relationship_level_for(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_level_for(BIGINT) TO service_role;