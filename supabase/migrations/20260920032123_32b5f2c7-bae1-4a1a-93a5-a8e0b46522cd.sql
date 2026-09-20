CREATE OR REPLACE FUNCTION public.room_couples(_room_id uuid)
RETURNS TABLE(user_a uuid, user_b uuid, type relation_type)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT LEAST(r.requester_id, r.partner_id), GREATEST(r.requester_id, r.partner_id), r.type
  FROM public.relationships r
  WHERE r.status = 'active'
    AND r.ended_at IS NULL
    AND EXISTS (SELECT 1 FROM public.room_mics m WHERE m.room_id = _room_id AND m.user_id = r.requester_id)
    AND EXISTS (SELECT 1 FROM public.room_mics m WHERE m.room_id = _room_id AND m.user_id = r.partner_id)
$$;

REVOKE ALL ON FUNCTION public.room_couples(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_couples(uuid) TO authenticated, service_role;