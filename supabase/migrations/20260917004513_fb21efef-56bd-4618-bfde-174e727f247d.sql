REVOKE EXECUTE ON FUNCTION public.badge_remove_room_participant(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.badge_close_wheel_round(UUID) FROM authenticated;

CREATE OR REPLACE FUNCTION public.has_badge_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_badges ub
    JOIN public.badge_definitions bd ON bd.id = ub.badge_id
    WHERE ub.user_id = _user_id
      AND bd.kind = 'administrative'
      AND bd.is_active
      AND ('all' = ANY(bd.permissions) OR _permission = ANY(bd.permissions))
  )
$$;
REVOKE ALL ON FUNCTION public.has_badge_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_badge_permission(UUID, TEXT) TO authenticated, service_role;