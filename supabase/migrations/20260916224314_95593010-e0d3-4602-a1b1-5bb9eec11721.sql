CREATE OR REPLACE FUNCTION public.admin_set_profile_suspended(_user_id UUID, _suspended BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET is_suspended = _suspended,
      updated_at = now()
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_suspended(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_suspended(UUID, BOOLEAN) TO service_role;