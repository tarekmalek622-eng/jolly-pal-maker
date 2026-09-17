CREATE OR REPLACE FUNCTION public.sync_room_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_room uuid := COALESCE(NEW.room_id, OLD.room_id);
BEGIN
  UPDATE public.rooms
  SET member_count = (SELECT count(*)::integer FROM public.room_members WHERE room_id = target_room),
      updated_at = now()
  WHERE id = target_room;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_room_member_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_room_member_count() TO service_role;

DROP TRIGGER IF EXISTS room_members_sync_count ON public.room_members;
CREATE TRIGGER room_members_sync_count
AFTER INSERT OR DELETE OR UPDATE OF room_id ON public.room_members
FOR EACH ROW EXECUTE FUNCTION public.sync_room_member_count();

UPDATE public.rooms r
SET member_count = (SELECT count(*)::integer FROM public.room_members rm WHERE rm.room_id = r.id);