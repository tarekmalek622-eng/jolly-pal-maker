DROP TRIGGER IF EXISTS trg_sync_profile_level ON public.profiles;

ALTER TABLE public.profiles ALTER COLUMN xp TYPE bigint USING xp::bigint;

CREATE TRIGGER trg_sync_profile_level
BEFORE INSERT OR UPDATE OF xp ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_level();

CREATE OR REPLACE FUNCTION public.award_gift_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  gained bigint := GREATEST(1::bigint, LEAST(100000::bigint, NEW.total_price / 100000));
BEGIN
  UPDATE public.profiles
     SET xp = GREATEST(0::bigint, COALESCE(xp, 0::bigint)) + gained
   WHERE id = NEW.sender_id;

  UPDATE public.profiles
     SET xp = GREATEST(0::bigint, COALESCE(xp, 0::bigint)) + GREATEST(1::bigint, gained / 2)
   WHERE id = NEW.receiver_id;

  RETURN NEW;
END;
$function$;