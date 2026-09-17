CREATE OR REPLACE FUNCTION public.suppress_duplicate_role_notification_marker()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$ SELECT $$;
REVOKE ALL ON FUNCTION public.suppress_duplicate_role_notification_marker() FROM PUBLIC, anon, authenticated, service_role;