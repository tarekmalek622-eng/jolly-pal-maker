CREATE OR REPLACE FUNCTION public.send_direct_gift(_gift_id UUID, _receiver_id UUID, _quantity INT DEFAULT 1)
RETURNS public.gift_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; cost BIGINT;
        sender_before BIGINT; receiver_before BIGINT; tx public.gift_transactions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _receiver_id IS NULL OR _receiver_id = uid THEN RAISE EXCEPTION 'يجب تحديد مستلم آخر'; END IF;
  IF EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = uid AND blocked_id = _receiver_id) OR (blocker_id = _receiver_id AND blocked_id = uid)) THEN RAISE EXCEPTION 'لا يمكن إرسال الهدية'; END IF;
  qty := LEAST(GREATEST(COALESCE(_quantity, 1), 1), 99);
  SELECT * INTO g FROM public.gifts WHERE id = _gift_id AND is_active;
  IF g.id IS NULL THEN RAISE EXCEPTION 'الهدية غير متوفرة'; END IF;
  cost := g.price * qty;
  SELECT coins INTO sender_before FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  SELECT coins INTO receiver_before FROM public.coin_wallets WHERE user_id = _receiver_id FOR UPDATE;
  IF sender_before IS NULL OR sender_before < cost THEN RAISE EXCEPTION 'الرصيد غير كافٍ'; END IF;
  IF receiver_before IS NULL THEN RAISE EXCEPTION 'المستلم غير متاح'; END IF;
  UPDATE public.coin_wallets SET coins = coins - cost, updated_at = now() WHERE user_id = uid;
  UPDATE public.coin_wallets SET coins = coins + cost, updated_at = now() WHERE user_id = _receiver_id;
  INSERT INTO public.gift_transactions (sender_id, receiver_id, gift_id, room_id, quantity, total_price)
  VALUES (uid, _receiver_id, g.id, NULL, qty, cost) RETURNING * INTO tx;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference_id, description)
  VALUES
    (uid, 'gift_sent', -cost, sender_before, sender_before - cost, tx.id, 'هدية خاصة: ' || g.name),
    (_receiver_id, 'gift_received', cost, receiver_before, receiver_before + cost, tx.id, 'هدية خاصة: ' || g.name);
  RETURN tx;
END; $$;
REVOKE ALL ON FUNCTION public.send_direct_gift(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_direct_gift(UUID, UUID, INT) TO authenticated;