CREATE TABLE public.cvip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price BIGINT NOT NULL CHECK (price > 0),
  duration_days INT NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
  badge_url TEXT,
  frame_url TEXT,
  background_url TEXT,
  name_effect TEXT,
  room_effect TEXT,
  decorations JSONB NOT NULL DEFAULT '[]'::jsonb,
  perks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cvip_plans TO authenticated;
GRANT ALL ON public.cvip_plans TO service_role;
ALTER TABLE public.cvip_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active cvip plans viewable" ON public.cvip_plans FOR SELECT TO authenticated USING (is_active OR public.is_admin(auth.uid()));
CREATE POLICY "admins manage cvip plans" ON public.cvip_plans FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.cvip_plans (name, description, price, duration_days, name_effect, room_effect, decorations, perks, sort_order) VALUES
('SVIP شهري', 'هوية SVIP كاملة لمدة شهر مع شارة وإطار وتأثير اسم وغرفة حصري.', 120000, 30, 'لمعان كريستالي', 'هالة كريستالية', '["زينة مايك كريستالية","دخول مميز"]'::jsonb, '["متجر SVIP","هدايا حصرية","أولوية دخول الغرف"]'::jsonb, 1),
('SVIP موسمي', 'تفعيل SVIP لمدة ثلاثة أشهر مع مزايا موسعة وهوية ملكية.', 300000, 90, 'بريق ملكي متحرك', 'إضاءة ملكية', '["تاج الغرفة","مسار دخول مضيء"]'::jsonb, '["متجر SVIP","هدايا حصرية","خصومات عناصر","أولوية دعم"]'::jsonb, 2),
('SVIP سنوي', 'أعلى باقة SVIP لمدة عام مع جميع المزايا والتأثيرات الأسطورية.', 950000, 365, 'طيف أسطوري', 'مشهد أسطوري متحرك', '["تاج أسطوري","زينة مايك أسطورية","دخول احتفالي"]'::jsonb, '["كامل متجر SVIP","هدايا سنوية","خصومات موسعة","أولوية قصوى"]'::jsonb, 3);

CREATE OR REPLACE FUNCTION public.purchase_cvip(_plan_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); plan public.cvip_plans; bal BIGINT; p public.profiles; start_at TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO plan FROM public.cvip_plans WHERE id = _plan_id AND is_active;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'خطة SVIP غير متوفرة'; END IF;
  SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF COALESCE(bal, 0) < plan.price THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;
  UPDATE public.coin_wallets SET coins = coins - plan.price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'vip_purchase', -plan.price, bal, bal - plan.price, 'CVIP: ' || plan.name);
  SELECT CASE WHEN is_cvip AND cvip_expires_at > now() THEN cvip_expires_at ELSE now() END INTO start_at FROM public.profiles WHERE id = uid FOR UPDATE;
  UPDATE public.profiles SET is_cvip = true, cvip_expires_at = start_at + (plan.duration_days || ' days')::interval WHERE id = uid RETURNING * INTO p;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (uid, 'cvip', 'تم تفعيل SVIP', plan.name, jsonb_build_object('plan_id', plan.id, 'expires_at', p.cvip_expires_at));
  RETURN p;
END; $$;
REVOKE ALL ON FUNCTION public.purchase_cvip(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_cvip(UUID) TO authenticated;