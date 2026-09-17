CREATE OR REPLACE FUNCTION public.notify_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_user UUID := COALESCE(NEW.user_id, OLD.user_id);
DECLARE changed_role TEXT := COALESCE(NEW.role::TEXT, OLD.role::TEXT);
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (
    target_user,
    'role_change',
    CASE WHEN TG_OP = 'DELETE' THEN 'تم تغيير رتبتك' ELSE 'تمت ترقية رتبتك' END,
    CASE WHEN TG_OP = 'DELETE' THEN 'تم سحب رتبة ' || changed_role ELSE 'رتبتك الجديدة: ' || changed_role END,
    jsonb_build_object('role', changed_role, 'granted', TG_OP <> 'DELETE')
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.notify_user_role_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user_role_change() TO service_role;
DROP TRIGGER IF EXISTS notify_user_role_change_trigger ON public.user_roles;
CREATE TRIGGER notify_user_role_change_trigger
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.notify_user_role_change();