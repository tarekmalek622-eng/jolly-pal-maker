CREATE OR REPLACE FUNCTION public.lock_relationship_slot(_user_id uuid, _type public.relation_type)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _type::text, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.lock_relationship_slot(uuid, public.relation_type) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_relationship_slot(uuid, public.relation_type) TO service_role;

REVOKE ALL ON FUNCTION public.request_relationship(uuid, public.relation_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_relationship(uuid, public.relation_type) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_relationship(uuid, public.relation_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_relationship(uuid, public.relation_type) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_relationship(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_relationship(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.end_relationship(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_relationship(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_end_relationship(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_end_relationship(uuid) TO authenticated, service_role;