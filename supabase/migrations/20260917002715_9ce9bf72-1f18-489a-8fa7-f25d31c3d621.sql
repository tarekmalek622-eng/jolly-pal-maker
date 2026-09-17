CREATE TABLE public.badge_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'gift' CHECK (kind IN ('gift')),
  threshold BIGINT NOT NULL CHECK (threshold > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.badge_definitions TO authenticated;
GRANT ALL ON public.badge_definitions TO service_role;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated view badge definitions"
ON public.badge_definitions FOR SELECT TO authenticated
USING (is_active = true OR public.is_admin(auth.uid()));

CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  progress BIGINT NOT NULL DEFAULT 0,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);
GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated view awarded badges"
ON public.user_badges FOR SELECT TO authenticated
USING (true);

CREATE INDEX user_badges_user_awarded_idx ON public.user_badges(user_id, awarded_at DESC);
CREATE INDEX gift_transactions_sender_total_idx ON public.gift_transactions(sender_id);

CREATE TRIGGER update_badge_definitions_updated_at
BEFORE UPDATE ON public.badge_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.badge_definitions (key, name, description, threshold, sort_order) VALUES
  ('gift_1m', 'صانع البهجة', 'أرسل هدايا بقيمة مليون كوينز', 1000000, 10),
  ('gift_10m', 'نجم الهدايا', 'أرسل هدايا بقيمة 10 ملايين كوينز', 10000000, 20),
  ('gift_100m', 'أسطورة الكرم', 'أرسل هدايا بقيمة 100 مليون كوينز', 100000000, 30),
  ('gift_1b', 'تاج الداعمين', 'أرسل هدايا بقيمة مليار كوينز', 1000000000, 40);

CREATE OR REPLACE FUNCTION public.award_gift_badges(_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_sent BIGINT;
  awarded_count INTEGER := 0;
  badge_row public.badge_definitions;
BEGIN
  IF _user_id IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(total_price), 0)::BIGINT
  INTO total_sent
  FROM public.gift_transactions
  WHERE sender_id = _user_id;

  FOR badge_row IN
    SELECT * FROM public.badge_definitions
    WHERE is_active = true AND kind = 'gift' AND threshold <= total_sent
    ORDER BY sort_order
  LOOP
    INSERT INTO public.user_badges (user_id, badge_id, progress)
    VALUES (_user_id, badge_row.id, total_sent)
    ON CONFLICT (user_id, badge_id) DO UPDATE
      SET progress = GREATEST(public.user_badges.progress, EXCLUDED.progress);

    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = _user_id
        AND kind = 'badge_unlocked'
        AND metadata->>'badge_key' = badge_row.key
    ) THEN
      INSERT INTO public.notifications (user_id, kind, title, body, metadata)
      VALUES (
        _user_id,
        'badge_unlocked',
        'فتحت شارة جديدة',
        badge_row.name,
        jsonb_build_object('badge_key', badge_row.key, 'badge_id', badge_row.id)
      );
      awarded_count := awarded_count + 1;
    END IF;
  END LOOP;

  UPDATE public.user_badges ub
  SET progress = total_sent
  FROM public.badge_definitions bd
  WHERE ub.badge_id = bd.id AND ub.user_id = _user_id AND bd.kind = 'gift';

  RETURN awarded_count;
END;
$$;
REVOKE ALL ON FUNCTION public.award_gift_badges(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_gift_badges(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_award_gift_badges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_gift_badges(NEW.sender_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER award_badges_after_gift
AFTER INSERT ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_gift_badges();

DO $$
DECLARE uid UUID;
BEGIN
  FOR uid IN SELECT DISTINCT sender_id FROM public.gift_transactions LOOP
    PERFORM public.award_gift_badges(uid);
  END LOOP;
END;
$$;