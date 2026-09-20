CREATE OR REPLACE FUNCTION public.send_gift(_gift_id uuid, _receiver_id uuid, _room_id uuid, _quantity integer DEFAULT 1)
 RETURNS gift_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; cost BIGINT; share INT; user_part BIGINT; admin_part BIGINT;
        sender_before BIGINT; receiver_before BIGINT; tx public.gift_transactions; vip INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _receiver_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المستلم'; END IF;
  IF _receiver_id = uid THEN RAISE EXCEPTION 'لا يمكنك إرسال هدية لنفسك'; END IF;
  qty := LEAST(GREATEST(COALESCE(_quantity,1),1),100000);
  SELECT * INTO g FROM public.gifts WHERE id = _gift_id AND is_active;
  IF g.id IS NULL THEN RAISE EXCEPTION 'الهدية غير متوفرة'; END IF;
  SELECT vip_level INTO vip FROM public.profiles WHERE id = uid;
  IF COALESCE(vip, 0) < g.required_vip THEN RAISE EXCEPTION 'هذه الهدية تتطلب VIP %', g.required_vip; END IF;
  cost := g.price * qty;
  SELECT LEAST(GREATEST(COALESCE((public.wallet_settings()->>'support_share_percent')::int, 50), 0), 100) INTO share;
  user_part := (cost * share) / 100;
  admin_part := cost - user_part;

  SELECT coins INTO sender_before FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF sender_before IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF sender_before < cost THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;

  INSERT INTO public.coin_wallets (user_id, coins) VALUES (_receiver_id, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT support_coins INTO receiver_before FROM public.coin_wallets WHERE user_id = _receiver_id FOR UPDATE;

  UPDATE public.coin_wallets SET coins = coins - cost, total_sent = total_sent + cost, updated_at = now() WHERE user_id = uid;
  UPDATE public.coin_wallets SET support_coins = support_coins + user_part, total_received = total_received + cost, updated_at = now() WHERE user_id = _receiver_id;

  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'gift_sent', -cost, sender_before, sender_before - cost, g.name),
         (_receiver_id, 'gift_received', user_part, receiver_before, receiver_before + user_part, g.name || ' (رصيد دعم)');

  IF admin_part > 0 THEN
    INSERT INTO public.platform_revenue (source, amount, reference, from_user, to_user)
    VALUES ('gift_share', admin_part, g.name, uid, _receiver_id);
  END IF;

  INSERT INTO public.gift_transactions (gift_id, sender_id, receiver_id, room_id, quantity, total_price)
  VALUES (_gift_id, uid, _receiver_id, _room_id, qty, cost) RETURNING * INTO tx;

  PERFORM public.relationship_award(uid, _receiver_id, cost);

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (_receiver_id, 'gift', 'وصلتك هدية', 'استلمت ' || g.name);
  RETURN tx;
END; $function$;

CREATE OR REPLACE FUNCTION public.send_gift_bulk(_gift_id uuid, _receiver_ids uuid[], _room_id uuid DEFAULT NULL::uuid, _quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; per_cost BIGINT; total BIGINT;
        ids UUID[]; rid UUID; sender_before BIGINT; receiver_before BIGINT; vip INT; n INT;
        share INT; user_part BIGINT; admin_part BIGINT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_receiver_ids, '{}'::uuid[])) AS x
               WHERE x IS NOT NULL AND x <> uid
                 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x AND NOT p.is_suspended)) INTO ids;
  n := COALESCE(array_length(ids, 1), 0);
  IF n = 0 THEN RAISE EXCEPTION 'اختر مستلمًا واحدًا على الأقل'; END IF;
  IF n > 200 THEN RAISE EXCEPTION 'الحد التقني 200 مستلمًا في المرة'; END IF;
  qty := LEAST(GREATEST(COALESCE(_quantity, 1), 1), 100000);
  SELECT * INTO g FROM public.gifts WHERE id = _gift_id AND is_active;
  IF g.id IS NULL THEN RAISE EXCEPTION 'الهدية غير متوفرة'; END IF;
  SELECT vip_level INTO vip FROM public.profiles WHERE id = uid;
  IF COALESCE(vip, 0) < g.required_vip THEN RAISE EXCEPTION 'هذه الهدية تتطلب VIP %', g.required_vip; END IF;
  per_cost := g.price * qty;
  total := per_cost * n;
  SELECT LEAST(GREATEST(COALESCE((public.wallet_settings()->>'support_share_percent')::int, 50), 0), 100) INTO share;
  user_part := (per_cost * share) / 100;
  admin_part := per_cost - user_part;

  SELECT coins INTO sender_before FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF sender_before IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF sender_before < total THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;
  UPDATE public.coin_wallets SET coins = coins - total, total_sent = total_sent + total, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'gift_sent', -total, sender_before, sender_before - total, g.name || ' ×' || qty || ' → ' || n);
  FOREACH rid IN ARRAY ids LOOP
    INSERT INTO public.coin_wallets (user_id, coins) VALUES (rid, 0) ON CONFLICT (user_id) DO NOTHING;
    SELECT support_coins INTO receiver_before FROM public.coin_wallets WHERE user_id = rid FOR UPDATE;
    UPDATE public.coin_wallets SET support_coins = support_coins + user_part, total_received = total_received + per_cost, updated_at = now() WHERE user_id = rid;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    VALUES (rid, 'gift_received', user_part, receiver_before, receiver_before + user_part, g.name || ' (رصيد دعم)');
    IF admin_part > 0 THEN
      INSERT INTO public.platform_revenue (source, amount, reference, from_user, to_user)
      VALUES ('gift_share', admin_part, g.name, uid, rid);
    END IF;
    INSERT INTO public.gift_transactions (gift_id, sender_id, receiver_id, room_id, quantity, total_price)
    VALUES (_gift_id, uid, rid, _room_id, qty, per_cost);
    PERFORM public.relationship_award(uid, rid, per_cost);
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (rid, 'gift', 'وصلتك هدية', 'استلمت ' || g.name, jsonb_build_object('gift_id', _gift_id, 'sender_id', uid, 'quantity', qty));
  END LOOP;
  RETURN jsonb_build_object('receivers', n, 'total', total, 'gift', g.name, 'user_share', user_part);
END; $function$;