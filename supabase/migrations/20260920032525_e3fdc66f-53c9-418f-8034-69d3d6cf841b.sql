-- 1) رصيد الدعم + سجل إيرادات المنصة
ALTER TABLE public.coin_wallets ADD COLUMN IF NOT EXISTS support_coins BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  amount BIGINT NOT NULL,
  reference TEXT,
  from_user UUID REFERENCES auth.users,
  to_user UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_revenue TO service_role;
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revenue admin read" ON public.platform_revenue FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_platform_revenue_created ON public.platform_revenue (created_at DESC);

-- 2) إعدادات المحفظة
INSERT INTO public.app_settings (key, value)
VALUES ('wallet', jsonb_build_object('support_share_percent', 50, 'conversion_percent', 100))
ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

-- 3) دالة قراءة إعدادات المحفظة
CREATE OR REPLACE FUNCTION public.wallet_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'wallet'),
                  jsonb_build_object('support_share_percent', 50, 'conversion_percent', 100))
$$;
REVOKE ALL ON FUNCTION public.wallet_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_settings() TO authenticated, service_role;

-- 4) استبدال رصيد الدعم إلى رصيد قابل للاستخدام
CREATE OR REPLACE FUNCTION public.convert_support_balance(_amount bigint)
RETURNS coin_wallets LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid UUID := auth.uid(); pct INT; gross BIGINT; net BIGINT; fee BIGINT;
        sup BIGINT; before_coins BIGINT; w public.coin_wallets;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  gross := COALESCE(_amount, 0);
  IF gross <= 0 THEN RAISE EXCEPTION 'حدد مبلغًا صحيحًا للاستبدال'; END IF;
  SELECT COALESCE((public.wallet_settings()->>'conversion_percent')::int, 100) INTO pct;
  pct := LEAST(GREATEST(pct, 1), 100);

  SELECT support_coins, coins INTO sup, before_coins FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF sup IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF sup < gross THEN RAISE EXCEPTION 'رصيد الدعم غير كافٍ'; END IF;

  net := (gross * pct) / 100;
  fee := gross - net;

  UPDATE public.coin_wallets
     SET support_coins = support_coins - gross, coins = coins + net, updated_at = now()
   WHERE user_id = uid;

  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'conversion', net, before_coins, before_coins + net,
          'استبدال رصيد دعم ' || gross || ' بنسبة ' || pct || '%');

  IF fee > 0 THEN
    INSERT INTO public.platform_revenue (source, amount, reference, from_user)
    VALUES ('conversion_fee', fee, 'convert:' || uid, uid);
  END IF;

  SELECT * INTO w FROM public.coin_wallets WHERE user_id = uid;
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.convert_support_balance(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_support_balance(bigint) TO authenticated, service_role;