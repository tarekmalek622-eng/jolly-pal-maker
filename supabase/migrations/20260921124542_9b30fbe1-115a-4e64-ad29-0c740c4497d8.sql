REVOKE SELECT ON TABLE public.rooms FROM anon, authenticated;
GRANT SELECT (
  id,
  room_code,
  name,
  description,
  image_url,
  background_url,
  theme,
  category,
  room_type,
  mic_count,
  max_users,
  owner_id,
  is_active,
  is_disabled,
  member_count,
  popularity,
  chat_locked,
  created_at,
  updated_at
) ON TABLE public.rooms TO anon, authenticated;