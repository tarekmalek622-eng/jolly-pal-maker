ALTER TABLE public.gifts
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS thumb_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INT NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS display_scale INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS required_vip INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.send_gift_bulk(_gift_id UUID, _receiver_ids UUID[], _room_id UUID DEFAULT NULL, _quantity INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; per_cost BIGINT; total BIGINT;
        ids UUID[]; rid UUID; sender_before BIGINT; receiver_before BIGINT; vip INT; n INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_receiver_ids, '{}'::uuid[])) AS x
               WHERE x IS NOT NULL AND x <> uid
                 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x AND NOT p.is_suspended)) INTO ids;
  n := COALESCE(array_length(ids, 1), 0);
  IF n = 0 THEN RAISE EXCEPTION 'اختر مستلمًا واحدًا على الأقل'; END IF;
  IF n > 50 THEN RAISE EXCEPTION 'الحد الأقصى 50 مستلمًا في المرة'; END IF;

  qty := LEAST(GREATEST(COALESCE(_quantity, 1), 1), 99);
  SELECT * INTO g FROM public.gifts WHERE id = _gift_id AND is_active;
  IF g.id IS NULL THEN RAISE EXCEPTION 'الهدية غير متوفرة'; END IF;

  SELECT vip_level INTO vip FROM public.profiles WHERE id = uid;
  IF COALESCE(vip, 0) < g.required_vip THEN RAISE EXCEPTION 'هذه الهدية تتطلب VIP %', g.required_vip; END IF;

  per_cost := g.price * qty;
  total := per_cost * n;

  SELECT coins INTO sender_before FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF sender_before IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF sender_before < total THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;

  UPDATE public.coin_wallets SET coins = coins - total, total_sent = total_sent + total, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'gift_sent', -total, sender_before, sender_before - total, g.name || ' ×' || qty || ' → ' || n);

  FOREACH rid IN ARRAY ids LOOP
    INSERT INTO public.coin_wallets (user_id, coins) VALUES (rid, 0) ON CONFLICT (user_id) DO NOTHING;
    SELECT coins INTO receiver_before FROM public.coin_wallets WHERE user_id = rid FOR UPDATE;
    UPDATE public.coin_wallets SET coins = coins + per_cost, total_received = total_received + per_cost, updated_at = now() WHERE user_id = rid;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    VALUES (rid, 'gift_received', per_cost, receiver_before, receiver_before + per_cost, g.name);
    INSERT INTO public.gift_transactions (gift_id, sender_id, receiver_id, room_id, quantity, total_price)
    VALUES (_gift_id, uid, rid, _room_id, qty, per_cost);
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (rid, 'gift', 'وصلتك هدية', 'استلمت ' || g.name, jsonb_build_object('gift_id', _gift_id, 'sender_id', uid, 'quantity', qty));
  END LOOP;

  UPDATE public.profiles SET xp = xp + (total / 10)::int,
    level = LEAST(100, 1 + ((xp + (total / 10)::int) / 500)::int) WHERE id = uid;

  RETURN jsonb_build_object('receivers', n, 'total', total, 'gift', g.name);
END; $$;
REVOKE ALL ON FUNCTION public.send_gift_bulk(UUID, UUID[], UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_gift_bulk(UUID, UUID[], UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gift_stats(_since TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); res JSONB;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT jsonb_build_object(
    'total_gifts', (SELECT COALESCE(SUM(quantity), 0) FROM public.gift_transactions t WHERE _since IS NULL OR t.created_at >= _since),
    'total_coins', (SELECT COALESCE(SUM(total_price), 0) FROM public.gift_transactions t WHERE _since IS NULL OR t.created_at >= _since),
    'top_gifts', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT g.name, SUM(t.quantity) AS qty, SUM(t.total_price) AS coins
        FROM public.gift_transactions t JOIN public.gifts g ON g.id = t.gift_id
        WHERE _since IS NULL OR t.created_at >= _since
        GROUP BY g.name ORDER BY SUM(t.total_price) DESC LIMIT 10) x),
    'top_senders', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.display_name, p.public_id, SUM(t.total_price) AS coins
        FROM public.gift_transactions t JOIN public.profiles p ON p.id = t.sender_id
        WHERE _since IS NULL OR t.created_at >= _since
        GROUP BY p.display_name, p.public_id ORDER BY SUM(t.total_price) DESC LIMIT 10) x),
    'top_receivers', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.display_name, p.public_id, SUM(t.total_price) AS coins
        FROM public.gift_transactions t JOIN public.profiles p ON p.id = t.receiver_id
        WHERE _since IS NULL OR t.created_at >= _since
        GROUP BY p.display_name, p.public_id ORDER BY SUM(t.total_price) DESC LIMIT 10) x)
  ) INTO res;
  RETURN res;
END; $$;
REVOKE ALL ON FUNCTION public.gift_stats(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gift_stats(TIMESTAMPTZ) TO authenticated;