ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.create_lucky_bag(_room_id uuid, _total bigint, _winners int, _message text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _bal bigint; _bag uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF _winners < 1 OR _winners > 50 THEN RAISE EXCEPTION 'عدد الفائزين يجب أن يكون بين 1 و50'; END IF;
  IF _total < _winners OR _total < 1000000 THEN RAISE EXCEPTION 'أقل قيمة لحقيبة الحظ 1,000,000 كوينز'; END IF;

  SELECT coins INTO _bal FROM public.coin_wallets WHERE user_id = _uid FOR UPDATE;
  IF COALESCE(_bal, 0) < _total THEN RAISE EXCEPTION 'رصيدك غير كافٍ لإنشاء هذه الحقيبة'; END IF;
  UPDATE public.coin_wallets SET coins = coins - _total, updated_at = now() WHERE user_id = _uid;

  INSERT INTO public.lucky_bags(room_id, sender_id, total_amount, winners_count, remaining_amount, message)
  VALUES (_room_id, _uid, _total, _winners, _total, _message) RETURNING id INTO _bag;

  INSERT INTO public.coin_transactions(user_id, kind, amount, balance_before, balance_after, reference, status)
  VALUES (_uid, 'lucky_bag', -_total, _bal, _bal - _total, 'lucky_bag:' || _bag, 'completed');
  RETURN _bag;
END; $$;
REVOKE ALL ON FUNCTION public.create_lucky_bag(uuid, bigint, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_lucky_bag(uuid, bigint, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_lucky_bag(uuid, bigint, int, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_lucky_bag(_bag_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _bag public.lucky_bags; _left int; _amount bigint; _max bigint; _bal bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO _bag FROM public.lucky_bags WHERE id = _bag_id FOR UPDATE;
  IF _bag.id IS NULL THEN RAISE EXCEPTION 'الحقيبة غير موجودة'; END IF;
  IF _bag.status <> 'open' THEN RAISE EXCEPTION 'انتهت هذه الحقيبة'; END IF;
  IF _bag.expires_at <= now() THEN
    UPDATE public.lucky_bags SET status = 'expired' WHERE id = _bag_id;
    RAISE EXCEPTION 'انتهت مدة الحقيبة';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lucky_bag_claims WHERE bag_id = _bag_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'حصلت على هذه الحقيبة بالفعل';
  END IF;

  _left := _bag.winners_count - _bag.claimed_count;
  IF _left <= 0 THEN
    UPDATE public.lucky_bags SET status = 'full' WHERE id = _bag_id;
    RAISE EXCEPTION 'اكتمل عدد الفائزين';
  END IF;

  IF _left = 1 THEN
    _amount := _bag.remaining_amount;
  ELSE
    _max := GREATEST(1, (_bag.remaining_amount - (_left - 1)) / _left * 2);
    _amount := GREATEST(1, floor(random() * _max)::bigint);
    _amount := LEAST(_amount, _bag.remaining_amount - (_left - 1));
  END IF;

  INSERT INTO public.lucky_bag_claims(bag_id, user_id, amount) VALUES (_bag_id, _uid, _amount);
  UPDATE public.lucky_bags
    SET remaining_amount = remaining_amount - _amount,
        claimed_count = claimed_count + 1,
        status = CASE WHEN claimed_count + 1 >= winners_count THEN 'full' ELSE 'open' END
  WHERE id = _bag_id;

  SELECT coins INTO _bal FROM public.coin_wallets WHERE user_id = _uid FOR UPDATE;
  IF _bal IS NULL THEN
    INSERT INTO public.coin_wallets(user_id, coins) VALUES (_uid, _amount);
    _bal := 0;
  ELSE
    UPDATE public.coin_wallets SET coins = coins + _amount, updated_at = now() WHERE user_id = _uid;
  END IF;

  INSERT INTO public.coin_transactions(user_id, kind, amount, balance_before, balance_after, reference, status)
  VALUES (_uid, 'lucky_bag', _amount, _bal, _bal + _amount, 'lucky_bag:' || _bag_id, 'completed');
  RETURN _amount;
END; $$;
REVOKE ALL ON FUNCTION public.open_lucky_bag(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_lucky_bag(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_lucky_bag(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_due_vip()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.profiles SET vip_level = 0, vip_expires_at = NULL, updated_at = now()
  WHERE vip_expires_at IS NOT NULL AND vip_expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.expire_due_vip() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_due_vip() FROM anon;
REVOKE ALL ON FUNCTION public.expire_due_vip() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_vip() TO service_role;