CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  bet BIGINT NOT NULL DEFAULT 0,
  payout BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'settled',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_sessions TO authenticated;
GRANT ALL ON public.game_sessions TO service_role;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions readable" ON public.game_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER game_sessions_updated BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX game_sessions_user_created_idx ON public.game_sessions (user_id, created_at DESC);

CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_index INT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  difficulty INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions readable" ON public.quiz_questions FOR SELECT TO authenticated USING (is_active);
CREATE POLICY "admins manage questions" ON public.quiz_questions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER quiz_questions_updated BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.quiz_questions (question, choices, correct_index, difficulty) VALUES
('ما هي أطول أنهار العالم؟', '["النيل","الأمازون","الفرات","دجلة"]', 0, 1),
('كم عدد أيام السنة الميلادية الكبيسة؟', '["364","365","366","367"]', 2, 1),
('ما عاصمة المملكة العربية السعودية؟', '["جدة","الرياض","مكة","الدمام"]', 1, 1),
('من كتب رواية "زقاق المدق"؟', '["طه حسين","نجيب محفوظ","توفيق الحكيم","جبران خليل جبران"]', 1, 2),
('كم عدد لاعبي فريق كرة القدم في الملعب؟', '["9","10","11","12"]', 2, 1),
('ما أكبر كوكب في المجموعة الشمسية؟', '["الأرض","زحل","المشتري","نبتون"]', 2, 1),
('في أي قارة تقع مصر؟', '["آسيا","أفريقيا","أوروبا","أستراليا"]', 1, 1),
('ما العنصر الكيميائي الذي رمزه O؟', '["الذهب","الأكسجين","الحديد","النحاس"]', 1, 1),
('كم عدد حروف اللغة العربية؟', '["26","28","30","32"]', 1, 2),
('ما هي عاصمة المغرب؟', '["الدار البيضاء","مراكش","الرباط","فاس"]', 2, 2);

CREATE OR REPLACE FUNCTION public.equip_item(_user_item_id uuid, _equip boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid(); ui public.user_items; it public.store_items; p public.profiles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO ui FROM public.user_items WHERE id = _user_item_id AND user_id = uid;
  IF ui.id IS NULL THEN RAISE EXCEPTION 'لا تملك هذا المنتج'; END IF;
  IF ui.expires_at IS NOT NULL AND ui.expires_at < now() THEN RAISE EXCEPTION 'انتهت صلاحية المنتج'; END IF;
  SELECT * INTO it FROM public.store_items WHERE id = ui.item_id;

  IF _equip THEN
    UPDATE public.user_items u SET is_equipped = false
    WHERE u.user_id = uid AND u.id <> _user_item_id
      AND u.item_id IN (SELECT s.id FROM public.store_items s WHERE s.category = it.category);
    UPDATE public.user_items SET is_equipped = true WHERE id = _user_item_id;
  ELSE
    UPDATE public.user_items SET is_equipped = false WHERE id = _user_item_id;
  END IF;

  IF it.category = 'profile_frame' THEN
    UPDATE public.profiles SET frame_url = CASE WHEN _equip THEN it.image_url ELSE NULL END
    WHERE id = uid RETURNING * INTO p;
  ELSIF it.category IN ('profile_background','profile_theme') THEN
    UPDATE public.profiles SET profile_background_url = CASE WHEN _equip THEN it.image_url ELSE NULL END
    WHERE id = uid RETURNING * INTO p;
  ELSE
    SELECT * INTO p FROM public.profiles WHERE id = uid;
  END IF;
  RETURN p;
END; $$;
REVOKE ALL ON FUNCTION public.equip_item(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_item(uuid, boolean) TO authenticated, service_role;