CREATE OR REPLACE FUNCTION public.send_gift(_gift_id uuid, _receiver_id uuid, _room_id uuid, _quantity integer DEFAULT 1)
 RETURNS gift_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; cost BIGINT;
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

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (_receiver_id, 'gift', 'وصلتك هدية', 'استلمت ' || g.name);
  RETURN tx;
END; $function$;