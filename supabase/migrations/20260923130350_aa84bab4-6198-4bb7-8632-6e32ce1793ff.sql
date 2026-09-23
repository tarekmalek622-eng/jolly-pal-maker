CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  last_day date NOT NULL,
  streak integer NOT NULL DEFAULT 1,
  total_days integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT ON public.daily_checkins TO authenticated;
GRANT ALL ON public.daily_checkins TO service_role;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checkins" ON public.daily_checkins FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_daily_checkins_updated BEFORE UPDATE ON public.daily_checkins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.gift_box_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tier text NOT NULL,
  cost bigint NOT NULL,
  reward bigint NOT NULL,
  rarity text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gift_box_opens TO authenticated;
GRANT ALL ON public.gift_box_opens TO service_role;
ALTER TABLE public.gift_box_opens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own box opens" ON public.gift_box_opens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_gift_box_opens_updated BEFORE UPDATE ON public.gift_box_opens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_gift_box_opens_user ON public.gift_box_opens (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.daily_checkin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  _row public.daily_checkins;
  _streak integer := 1;
  _reward bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _row FROM public.daily_checkins WHERE user_id = _uid;
  IF _row.id IS NOT NULL AND _row.last_day = _today THEN
    RETURN jsonb_build_object('claimed', false, 'streak', _row.streak, 'reward', 0, 'total_days', _row.total_days);
  END IF;
  IF _row.id IS NOT NULL THEN
    IF _row.last_day = _today - 1 THEN _streak := LEAST(_row.streak + 1, 7); ELSE _streak := 1; END IF;
  END IF;
  _reward := 1000 * _streak;
  IF _row.id IS NULL THEN
    INSERT INTO public.daily_checkins (user_id, last_day, streak, total_days)
    VALUES (_uid, _today, 1, 1);
  ELSE
    UPDATE public.daily_checkins
    SET last_day = _today, streak = _streak, total_days = _row.total_days + 1
    WHERE user_id = _uid;
  END IF;
  INSERT INTO public.coin_wallets (user_id, balance) VALUES (_uid, _reward)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.coin_wallets.balance + _reward;
  INSERT INTO public.coin_transactions (user_id, amount, kind, description)
  VALUES (_uid, _reward, 'reward', 'مكافأة حضور يومي - يوم ' || _streak);
  RETURN jsonb_build_object('claimed', true, 'streak', _streak, 'reward', _reward, 'total_days', COALESCE(_row.total_days, 0) + 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.daily_checkin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_checkin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_gift_box(_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cost bigint;
  _balance bigint;
  _roll numeric := random();
  _mult numeric;
  _rarity text;
  _reward bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _cost := CASE _tier WHEN 'bronze' THEN 10000 WHEN 'silver' THEN 50000 WHEN 'gold' THEN 200000 ELSE NULL END;
  IF _cost IS NULL THEN RAISE EXCEPTION 'invalid box'; END IF;
  SELECT balance INTO _balance FROM public.coin_wallets WHERE user_id = _uid FOR UPDATE;
  IF COALESCE(_balance, 0) < _cost THEN RAISE EXCEPTION 'الرصيد غير كافٍ'; END IF;
  IF _roll < 0.55 THEN _mult := 0.5; _rarity := 'عادي';
  ELSIF _roll < 0.85 THEN _mult := 1.2; _rarity := 'جيد';
  ELSIF _roll < 0.97 THEN _mult := 2.5; _rarity := 'نادر';
  ELSE _mult := 6; _rarity := 'أسطوري';
  END IF;
  _reward := FLOOR(_cost * _mult);
  UPDATE public.coin_wallets SET balance = balance - _cost + _reward WHERE user_id = _uid;
  INSERT INTO public.coin_transactions (user_id, amount, kind, description)
  VALUES (_uid, _reward - _cost, 'game', 'صندوق هدايا ' || _tier || ' - ' || _rarity);
  INSERT INTO public.gift_box_opens (user_id, tier, cost, reward, rarity)
  VALUES (_uid, _tier, _cost, _reward, _rarity);
  RETURN jsonb_build_object('reward', _reward, 'cost', _cost, 'rarity', _rarity);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_gift_box(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_gift_box(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.family_war_leaderboard(_limit integer DEFAULT 10)
RETURNS TABLE(family_id uuid, name text, logo_url text, points bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.name, f.logo_url, COALESCE(SUM(g.total_price), 0)::bigint AS points
  FROM public.families f
  LEFT JOIN public.family_members fm ON fm.family_id = f.id
  LEFT JOIN public.gift_transactions g
    ON g.sender_id = fm.user_id
   AND g.created_at >= date_trunc('week', now())
  GROUP BY f.id, f.name, f.logo_url
  ORDER BY points DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
$$;
REVOKE EXECUTE ON FUNCTION public.family_war_leaderboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_war_leaderboard(integer) TO authenticated, service_role;