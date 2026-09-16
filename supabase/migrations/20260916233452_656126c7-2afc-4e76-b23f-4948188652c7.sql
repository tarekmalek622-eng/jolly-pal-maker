CREATE OR REPLACE FUNCTION public.create_room(
  _name TEXT, _description TEXT, _category TEXT, _room_type public.room_type,
  _password TEXT, _mic_count INT, _image_url TEXT DEFAULT NULL, _background_url TEXT DEFAULT NULL
) RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); r public.rooms; i INT; mics INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _name IS NULL OR length(btrim(_name)) < 2 THEN RAISE EXCEPTION 'invalid room name'; END IF;
  IF EXISTS (SELECT 1 FROM public.rooms WHERE owner_id = uid AND is_active) THEN
    RAISE EXCEPTION 'لديك غرفة بالفعل — يمكنك امتلاك غرفة واحدة فقط';
  END IF;
  mics := LEAST(GREATEST(COALESCE(_mic_count,10), 4), 16);

  INSERT INTO public.rooms (room_code, name, description, category, room_type, password, mic_count, owner_id, image_url, background_url)
  VALUES (public.gen_room_code(), btrim(_name), _description, COALESCE(_category,'general'),
          COALESCE(_room_type,'public'), NULLIF(btrim(COALESCE(_password,'')),''), mics, uid, _image_url, _background_url)
  RETURNING * INTO r;

  FOR i IN 1..mics LOOP
    INSERT INTO public.room_mics (room_id, seat_index) VALUES (r.id, i);
  END LOOP;
  RETURN r;
END; $$;