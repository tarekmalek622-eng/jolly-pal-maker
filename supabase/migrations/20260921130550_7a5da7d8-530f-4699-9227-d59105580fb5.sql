
CREATE OR REPLACE FUNCTION public.gen_family_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE c text;
BEGIN
  LOOP
    c := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.families WHERE family_code = c);
  END LOOP;
  RETURN c;
END;
$$;

REVOKE ALL ON FUNCTION public.gen_family_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gen_family_code() TO service_role;

REVOKE ALL ON FUNCTION public.family_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_settings() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.family_level_for(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_level_for(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.family_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_stats(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_family_member_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.family_award_from_gift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_cleanup() FROM PUBLIC, anon, authenticated;
