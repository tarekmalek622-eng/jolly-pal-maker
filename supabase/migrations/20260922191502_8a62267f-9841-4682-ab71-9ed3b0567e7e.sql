CREATE OR REPLACE FUNCTION public.gift_vip(_receiver_id uuid, _level int)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v public.vip_levels;
  bal bigint;
  sender_name text;
  receiver public.profiles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _receiver_id = uid THEN RAISE EXCEPTION 'لا يمكنك إهداء نفسك'; END IF;

  SELECT * INTO v FROM public.vip_levels WHERE level = _level AND is_active;
  IF v.level IS NULL THEN RAISE EXCEPTION 'مستوى غير متوفر'; END IF;

  SELECT display_name INTO sender_name FROM public.profiles WHERE id = uid;
  SELECT * INTO receiver FROM public.profiles WHERE id = _receiver_id;
  IF receiver.id IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;

  SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF COALESCE(bal, 0) < v.price THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;

  UPDATE public.coin_wallets SET coins = coins - v.price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'vip_gift', -v.price, bal, bal - v.price, v.name || ' → ' || receiver.display_name);

  UPDATE public.profiles SET vip_level = GREATEST(vip_level, v.level)
   WHERE id = _receiver_id RETURNING * INTO receiver;

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (_receiver_id, 'vip', 'وصلتك هدية VIP', COALESCE(sender_name, 'صديق') || ' أهداك ' || v.name);
  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (uid, 'vip', 'تم إرسال هدية VIP', v.name || ' إلى ' || receiver.display_name);

  RETURN receiver;
END;
$$;

REVOKE ALL ON FUNCTION public.gift_vip(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gift_vip(uuid, int) TO authenticated;