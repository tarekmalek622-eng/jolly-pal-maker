DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relation_type') THEN
    CREATE TYPE public.relation_type AS ENUM ('couple','soulmate','favorite_friend','close_friend');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.relation_type NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationships_status_check CHECK (status IN ('pending','accepted','rejected','ended')),
  CONSTRAINT relationships_distinct_check CHECK (requester_id <> partner_id)
);

GRANT SELECT ON public.relationships TO authenticated;
GRANT ALL ON public.relationships TO service_role;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own relationships readable" ON public.relationships;
CREATE POLICY "own relationships readable" ON public.relationships FOR SELECT TO authenticated
USING (auth.uid() IN (requester_id, partner_id) OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS relationships_requester_idx ON public.relationships (requester_id, status);
CREATE INDEX IF NOT EXISTS relationships_partner_idx ON public.relationships (partner_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS relationships_active_pair_idx ON public.relationships (
  LEAST(requester_id, partner_id), GREATEST(requester_id, partner_id)
) WHERE status IN ('pending','accepted');

DROP TRIGGER IF EXISTS relationships_updated ON public.relationships;
CREATE TRIGGER relationships_updated BEFORE UPDATE ON public.relationships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value)
VALUES ('relationships', jsonb_build_object('couple', true, 'soulmate', true, 'favorite_friend', true, 'close_friend', true))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.relationship_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'relationships'), '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.request_relationship(_partner_id uuid, _type public.relation_type)
RETURNS public.relationships LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF _partner_id IS NULL OR _partner_id = uid THEN RAISE EXCEPTION 'اختر مستخدمًا آخر'; END IF;
  IF coalesce((relationship_settings()->>_type::text)::boolean, true) = false THEN
    RAISE EXCEPTION 'هذا النوع من العلاقات موقوف حاليًا'; END IF;
  IF EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = uid AND blocked_id = _partner_id) OR (blocker_id = _partner_id AND blocked_id = uid)) THEN
    RAISE EXCEPTION 'لا يمكن إرسال الطلب'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _partner_id AND NOT is_suspended) THEN
    RAISE EXCEPTION 'المستخدم غير متاح'; END IF;
  IF EXISTS (
    SELECT 1 FROM relationships
    WHERE status IN ('pending','accepted')
      AND (uid IN (requester_id, partner_id) OR _partner_id IN (requester_id, partner_id))
  ) THEN RAISE EXCEPTION 'لديك أو لديه علاقة قائمة بالفعل'; END IF;

  INSERT INTO relationships (requester_id, partner_id, type) VALUES (uid, _partner_id, _type) RETURNING * INTO r;
  INSERT INTO notifications (user_id, kind, title, body, metadata)
  VALUES (_partner_id, 'relationship', 'طلب علاقة جديد', 'وصلك طلب علاقة اجتماعية', jsonb_build_object('relationship_id', r.id, 'type', _type));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.respond_relationship(_relationship_id uuid, _accept boolean)
RETURNS public.relationships LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO r FROM relationships WHERE id = _relationship_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'الطلب غير متاح'; END IF;
  IF r.partner_id <> uid THEN RAISE EXCEPTION 'لا يمكنك الرد على هذا الطلب'; END IF;
  UPDATE relationships
    SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
        started_at = CASE WHEN _accept THEN now() ELSE NULL END,
        ended_at = CASE WHEN _accept THEN NULL ELSE now() END
    WHERE id = r.id RETURNING * INTO r;
  INSERT INTO notifications (user_id, kind, title, body, metadata)
  VALUES (r.requester_id, 'relationship', CASE WHEN _accept THEN 'تم قبول طلب العلاقة' ELSE 'تم رفض طلب العلاقة' END,
          NULL, jsonb_build_object('relationship_id', r.id, 'type', r.type));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.end_relationship(_relationship_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO r FROM relationships WHERE id = _relationship_id FOR UPDATE;
  IF r.id IS NULL OR r.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'العلاقة غير متاحة'; END IF;
  IF uid NOT IN (r.requester_id, r.partner_id) THEN RAISE EXCEPTION 'غير مسموح'; END IF;
  UPDATE relationships SET status = 'ended', ended_at = now() WHERE id = r.id;
  INSERT INTO notifications (user_id, kind, title, body)
  VALUES (CASE WHEN uid = r.requester_id THEN r.partner_id ELSE r.requester_id END, 'relationship', 'تم إنهاء العلاقة', NULL);
  RETURN true;
END $$;