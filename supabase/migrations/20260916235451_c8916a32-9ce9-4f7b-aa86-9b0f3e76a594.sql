ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mic_decoration_url TEXT;

CREATE OR REPLACE FUNCTION public.equip_item(_user_item_id uuid, _equip boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid(); ui public.user_items; it public.store_items; p public.profiles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO ui FROM public.user_items WHERE id = _user_item_id AND user_id = uid;
  IF ui.id IS NULL THEN RAISE EXCEPTION 'لا تملك هذا المنتج'; END IF;
  IF ui.expires_at IS NOT NULL AND ui.expires_at < now() THEN RAISE EXCEPTION 'انتهت صلاحية المنتج'; END IF;
  SELECT * INTO it FROM public.store_items WHERE id = ui.item_id;

  IF _equip THEN
    UPDATE public.user_items u SET is_equipped = false
    WHERE u.user_id = uid AND u.id <> _user_item_id
      AND u.item_id IN (SELECT s.id FROM public.store_items s WHERE s.category = it.category);
    UPDATE public.user_items SET is_equipped = true WHERE id = _user_item_id;
  ELSE
    UPDATE public.user_items SET is_equipped = false WHERE id = _user_item_id;
  END IF;

  IF it.category = 'profile_frame' THEN
    UPDATE public.profiles SET frame_url = CASE WHEN _equip THEN it.image_url ELSE NULL END
    WHERE id = uid RETURNING * INTO p;
  ELSIF it.category IN ('profile_background','profile_theme') THEN
    UPDATE public.profiles SET profile_background_url = CASE WHEN _equip THEN it.image_url ELSE NULL END
    WHERE id = uid RETURNING * INTO p;
  ELSIF it.category = 'mic_decoration' THEN
    UPDATE public.profiles SET mic_decoration_url = CASE WHEN _equip THEN it.image_url ELSE NULL END
    WHERE id = uid RETURNING * INTO p;
  ELSE
    SELECT * INTO p FROM public.profiles WHERE id = uid;
  END IF;
  RETURN p;
END; $$;