CREATE OR REPLACE FUNCTION public.grant_owner_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;
  IF v_email IN ('01016177688@sawtak.app', '201016177688@sawtak.app') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_owner_admin_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_grant_owner_admin_role ON public.profiles;
CREATE TRIGGER trg_grant_owner_admin_role
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_admin_role();

-- If the owner account already exists, grant now.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::public.app_role FROM auth.users u
WHERE u.email IN ('01016177688@sawtak.app','201016177688@sawtak.app')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
WHERE u.email IN ('01016177688@sawtak.app','201016177688@sawtak.app')
ON CONFLICT DO NOTHING;