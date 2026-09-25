CREATE OR REPLACE FUNCTION public.admin_registration_data(_search text DEFAULT NULL)
RETURNS TABLE(
  user_id uuid,
  public_id text,
  display_name text,
  phone text,
  registered_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح — هذه البيانات للمالك فقط';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    p.public_id,
    p.display_name,
    split_part(u.email, '@', 1) AS phone,
    u.created_at AS registered_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE _search IS NULL
     OR btrim(_search) = ''
     OR p.public_id ILIKE '%' || _search || '%'
     OR p.display_name ILIKE '%' || _search || '%'
     OR u.email ILIKE '%' || _search || '%'
  ORDER BY u.created_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_registration_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_registration_data(text) TO authenticated;