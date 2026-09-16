-- create profile + wallet for the signed-in user
CREATE OR REPLACE FUNCTION public.setup_account(
  _display_name TEXT, _country TEXT, _city TEXT, _birth_date DATE,
  _gender public.gender_type, _avatar_url TEXT, _bio TEXT DEFAULT NULL
) RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); result public.profiles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _display_name IS NULL OR length(btrim(_display_name)) < 2 THEN RAISE EXCEPTION 'invalid name'; END IF;

  INSERT INTO public.profiles (id, public_id, display_name, country, city, birth_date, gender, avatar_url, bio)
  VALUES (uid, public.gen_public_id(), btrim(_display_name), _country, _city, _birth_date, _gender, _avatar_url, _bio)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name, country = EXCLUDED.country, city = EXCLUDED.city,
    birth_date = EXCLUDED.birth_date, gender = EXCLUDED.gender,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url)
  RETURNING * INTO result;

  INSERT INTO public.coin_wallets (user_id, coins) VALUES (uid, 5000)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  SELECT uid, 'bonus', 5000, 0, 5000, 'welcome'
  WHERE NOT EXISTS (SELECT 1 FROM public.coin_transactions WHERE user_id = uid AND reference = 'welcome');

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'user') ON CONFLICT DO NOTHING;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.setup_account(TEXT,TEXT,TEXT,DATE,public.gender_type,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setup_account(TEXT,TEXT,TEXT,DATE,public.gender_type,TEXT,TEXT) TO authenticated;

-- create room with mic seats
CREATE OR REPLACE FUNCTION public.create_room(
  _name TEXT, _description TEXT, _category TEXT, _room_type public.room_type,
  _password TEXT, _mic_count INT, _image_url TEXT DEFAULT NULL, _background_url TEXT DEFAULT NULL
) RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); r public.rooms; i INT; mics INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _name IS NULL OR length(btrim(_name)) < 2 THEN RAISE EXCEPTION 'invalid room name'; END IF;
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
REVOKE ALL ON FUNCTION public.create_room(TEXT,TEXT,TEXT,public.room_type,TEXT,INT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room(TEXT,TEXT,TEXT,public.room_type,TEXT,INT,TEXT,TEXT) TO authenticated;

-- send gift atomically
CREATE OR REPLACE FUNCTION public.send_gift(_gift_id UUID, _receiver_id UUID, _room_id UUID, _quantity INT DEFAULT 1)
RETURNS public.gift_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; cost BIGINT;
        sender_before BIGINT; receiver_before BIGINT; tx public.gift_transactions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _receiver_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المستلم'; END IF;
  IF _receiver_id = uid THEN RAISE EXCEPTION 'لا يمكنك إرسال هدية لنفسك'; END IF;
  qty := LEAST(GREATEST(COALESCE(_quantity,1),1),99);
  SELECT * INTO g FROM public.gifts WHERE id = _gift_id AND is_active;
  IF g.id IS NULL THEN RAISE EXCEPTION 'الهدية غير متوفرة'; END IF;
  cost := g.price * qty;

  SELECT coins INTO sender_before FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF sender_before IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF sender_before < cost THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;

  INSERT INTO public.coin_wallets (user_id, coins) VALUES (_receiver_id, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT coins INTO receiver_before FROM public.coin_wallets WHERE user_id = _receiver_id FOR UPDATE;

  UPDATE public.coin_wallets SET coins = coins - cost, total_sent = total_sent + cost, updated_at = now() WHERE user_id = uid;
  UPDATE public.coin_wallets SET coins = coins + cost, total_received = total_received + cost, updated_at = now() WHERE user_id = _receiver_id;

  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'gift_sent', -cost, sender_before, sender_before - cost, g.name),
         (_receiver_id, 'gift_received', cost, receiver_before, receiver_before + cost, g.name);

  INSERT INTO public.gift_transactions (gift_id, sender_id, receiver_id, room_id, quantity, total_price)
  VALUES (_gift_id, uid, _receiver_id, _room_id, qty, cost) RETURNING * INTO tx;

  UPDATE public.profiles SET xp = xp + (cost / 10)::int,
    level = LEAST(100, 1 + ((xp + (cost/10)::int) / 500)::int) WHERE id = uid;

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (_receiver_id, 'gift', 'وصلتك هدية', 'استلمت ' || g.name);
  RETURN tx;
END; $$;
REVOKE ALL ON FUNCTION public.send_gift(UUID,UUID,UUID,INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_gift(UUID,UUID,UUID,INT) TO authenticated;

-- purchase store item
CREATE OR REPLACE FUNCTION public.purchase_item(_item_id UUID)
RETURNS public.user_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); it public.store_items; bal BIGINT; ui public.user_items; vip INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO it FROM public.store_items WHERE id = _item_id AND is_active;
  IF it.id IS NULL THEN RAISE EXCEPTION 'المنتج غير متوفر'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_items WHERE user_id = uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'تملك هذا المنتج بالفعل'; END IF;
  SELECT vip_level INTO vip FROM public.profiles WHERE id = uid;
  IF COALESCE(vip,0) < it.required_vip THEN RAISE EXCEPTION 'يتطلب VIP %', it.required_vip; END IF;

  SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF COALESCE(bal,0) < it.price THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;
  UPDATE public.coin_wallets SET coins = coins - it.price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'item_purchase', -it.price, bal, bal - it.price, it.name);

  INSERT INTO public.user_items (user_id, item_id, expires_at)
  VALUES (uid, _item_id, CASE WHEN it.duration_days IS NULL THEN NULL ELSE now() + (it.duration_days || ' days')::interval END)
  RETURNING * INTO ui;
  RETURN ui;
END; $$;
REVOKE ALL ON FUNCTION public.purchase_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_item(UUID) TO authenticated;

-- purchase vip
CREATE OR REPLACE FUNCTION public.purchase_vip(_level INT)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); v public.vip_levels; bal BIGINT; p public.profiles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v FROM public.vip_levels WHERE level = _level AND is_active;
  IF v.level IS NULL THEN RAISE EXCEPTION 'مستوى غير متوفر'; END IF;
  SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF COALESCE(bal,0) < v.price THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;
  UPDATE public.coin_wallets SET coins = coins - v.price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'vip_purchase', -v.price, bal, bal - v.price, v.name);
  UPDATE public.profiles SET vip_level = GREATEST(vip_level, v.level) WHERE id = uid RETURNING * INTO p;
  INSERT INTO public.notifications (user_id, kind, title, body) VALUES (uid, 'vip', 'تم تفعيل VIP', v.name);
  RETURN p;
END; $$;
REVOKE ALL ON FUNCTION public.purchase_vip(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_vip(INT) TO authenticated;

-- take / leave mic
CREATE OR REPLACE FUNCTION public.take_mic(_room_id UUID, _seat INT)
RETURNS public.room_mics
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); m public.room_mics;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.bans WHERE user_id = uid AND (scope='global' OR room_id = _room_id)
             AND (expires_at IS NULL OR expires_at > now())) THEN RAISE EXCEPTION 'أنت محظور'; END IF;
  UPDATE public.room_mics SET user_id = NULL WHERE room_id = _room_id AND user_id = uid;
  UPDATE public.room_mics SET user_id = uid, is_muted = false, updated_at = now()
  WHERE room_id = _room_id AND seat_index = _seat AND user_id IS NULL AND NOT is_locked
  RETURNING * INTO m;
  IF m.id IS NULL THEN RAISE EXCEPTION 'المقعد غير متاح'; END IF;
  DELETE FROM public.mic_requests WHERE room_id = _room_id AND user_id = uid;
  RETURN m;
END; $$;
REVOKE ALL ON FUNCTION public.take_mic(UUID,INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_mic(UUID,INT) TO authenticated;