CREATE TABLE IF NOT EXISTS public.lucky_bags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  total_amount bigint NOT NULL,
  winners_count int NOT NULL,
  remaining_amount bigint NOT NULL,
  claimed_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  message text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lucky_bags TO authenticated;
GRANT ALL ON public.lucky_bags TO service_role;
ALTER TABLE public.lucky_bags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lucky_bags_read" ON public.lucky_bags;
CREATE POLICY "lucky_bags_read" ON public.lucky_bags FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.lucky_bag_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_id uuid NOT NULL REFERENCES public.lucky_bags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bag_id, user_id)
);
GRANT SELECT ON public.lucky_bag_claims TO authenticated;
GRANT ALL ON public.lucky_bag_claims TO service_role;
ALTER TABLE public.lucky_bag_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lucky_bag_claims_read" ON public.lucky_bag_claims;
CREATE POLICY "lucky_bag_claims_read" ON public.lucky_bag_claims FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS lucky_bags_room_status ON public.lucky_bags(room_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS lucky_bag_claims_bag ON public.lucky_bag_claims(bag_id, created_at);

CREATE TABLE IF NOT EXISTS public.welcome_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  device_identifier text,
  claimed_by uuid,
  welcome_package jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_url text,
  status text NOT NULL DEFAULT 'delivered',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.welcome_claims TO authenticated;
GRANT ALL ON public.welcome_claims TO service_role;
ALTER TABLE public.welcome_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "welcome_claims_own" ON public.welcome_claims;
CREATE POLICY "welcome_claims_own" ON public.welcome_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR app_internal.has_role(auth.uid(), 'welcome_manager'::public.app_role));
CREATE INDEX IF NOT EXISTS welcome_claims_device ON public.welcome_claims(device_identifier);
CREATE INDEX IF NOT EXISTS welcome_claims_created ON public.welcome_claims(created_at DESC);

CREATE OR REPLACE FUNCTION public.create_lucky_bag(_room_id uuid, _total bigint, _winners int, _message text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _bal bigint; _bag uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF _winners < 1 OR _winners > 50 THEN RAISE EXCEPTION 'عدد الفائزين يجب أن يكون بين 1 و50'; END IF;
  IF _total < _winners OR _total < 1000000 THEN RAISE EXCEPTION 'أقل قيمة لحقيبة الحظ 1,000,000 كوينز'; END IF;

  UPDATE public.coin_wallets SET coins = coins - _total, updated_at = now()
  WHERE user_id = _uid AND coins >= _total RETURNING coins INTO _bal;
  IF _bal IS NULL THEN RAISE EXCEPTION 'رصيدك غير كافٍ لإنشاء هذه الحقيبة'; END IF;

  INSERT INTO public.lucky_bags(room_id, sender_id, total_amount, winners_count, remaining_amount, message)
  VALUES (_room_id, _uid, _total, _winners, _total, _message) RETURNING id INTO _bag;

  INSERT INTO public.coin_transactions(user_id, amount, kind, status, reference, description)
  VALUES (_uid, -_total, 'lucky_bag', 'completed', 'lucky_bag:' || _bag, 'إنشاء حقيبة حظ');
  RETURN _bag;
END; $$;
REVOKE ALL ON FUNCTION public.create_lucky_bag(uuid, bigint, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_lucky_bag(uuid, bigint, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_lucky_bag(uuid, bigint, int, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_lucky_bag(_bag_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _bag public.lucky_bags; _left int; _amount bigint; _max bigint;
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

  INSERT INTO public.coin_wallets(user_id, coins) VALUES (_uid, _amount)
  ON CONFLICT (user_id) DO UPDATE SET coins = public.coin_wallets.coins + _amount, updated_at = now();

  INSERT INTO public.coin_transactions(user_id, amount, kind, status, reference, description)
  VALUES (_uid, _amount, 'lucky_bag', 'completed', 'lucky_bag:' || _bag_id, 'فتح حقيبة حظ');
  RETURN _amount;
END; $$;
REVOKE ALL ON FUNCTION public.open_lucky_bag(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_lucky_bag(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_lucky_bag(uuid) TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.lucky_bags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lucky_bag_claims;