REVOKE ALL ON FUNCTION public.relationship_settings() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.request_relationship(uuid, public.relation_type) FROM anon;
REVOKE ALL ON FUNCTION public.respond_relationship(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.end_relationship(uuid) FROM anon;