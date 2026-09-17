ALTER TABLE public.badge_definitions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS icon_key text NOT NULL DEFAULT 'shield',
  ADD COLUMN IF NOT EXISTS color_key text NOT NULL DEFAULT 'emerald',
  ADD COLUMN IF NOT EXISTS display_variant text NOT NULL DEFAULT 'crest',
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'assigned';

ALTER TABLE public.badge_definitions
  DROP CONSTRAINT IF EXISTS badge_definitions_display_variant_check;
ALTER TABLE public.badge_definitions
  ADD CONSTRAINT badge_definitions_display_variant_check
  CHECK (display_variant IN ('crest','ribbon','medal','glass'));

ALTER TABLE public.badge_definitions
  DROP CONSTRAINT IF EXISTS badge_definitions_audience_check;
ALTER TABLE public.badge_definitions
  ADD CONSTRAINT badge_definitions_audience_check
  CHECK (audience IN ('assigned','admin','moderator','host','vip','all'));

CREATE OR REPLACE FUNCTION public.lock_relationship_slot(_user_id uuid, _type public.relation_type)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _type::text, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.lock_relationship_slot(uuid, public.relation_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_relationship_slot(uuid, public.relation_type) TO service_role;

CREATE OR REPLACE FUNCTION public.request_relationship(_partner_id uuid, _type public.relation_type)
RETURNS public.relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF _partner_id IS NULL OR _partner_id = uid THEN RAISE EXCEPTION 'اختر مستخدمًا آخر'; END IF;
  IF coalesce((relationship_settings()->>_type::text)::boolean, true) = false THEN
    RAISE EXCEPTION 'هذا النوع من العلاقات موقوف حاليًا';
  END IF;
  PERFORM public.lock_relationship_slot(LEAST(uid, _partner_id), _type);
  PERFORM public.lock_relationship_slot(GREATEST(uid, _partner_id), _type);
  IF EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = uid AND blocked_id = _partner_id) OR (blocker_id = _partner_id AND blocked_id = uid)) THEN
    RAISE EXCEPTION 'لا يمكن إرسال الطلب';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND NOT is_suspended)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _partner_id AND NOT is_suspended) THEN
    RAISE EXCEPTION 'المستخدم غير متاح';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.relationships
    WHERE type = _type AND status IN ('pending','accepted')
      AND (uid IN (requester_id, partner_id) OR _partner_id IN (requester_id, partner_id))
  ) THEN RAISE EXCEPTION 'هذا النوع مستخدم بالفعل لدى أحد الطرفين'; END IF;

  INSERT INTO public.relationships (requester_id, partner_id, type)
  VALUES (uid, _partner_id, _type)
  RETURNING * INTO r;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (_partner_id, 'relationship', 'طلب علاقة جديد', 'وصلك طلب ' || _type::text,
          jsonb_build_object('relationship_id', r.id, 'type', _type));
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_relationship(_partner_id uuid, _type public.relation_type)
RETURNS public.relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); old_row public.relationships; new_row public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF _partner_id IS NULL OR _partner_id = uid THEN RAISE EXCEPTION 'اختر مستخدمًا آخر'; END IF;
  IF coalesce((relationship_settings()->>_type::text)::boolean, true) = false THEN
    RAISE EXCEPTION 'هذا النوع من العلاقات موقوف حاليًا';
  END IF;
  PERFORM public.lock_relationship_slot(LEAST(uid, _partner_id), _type);
  PERFORM public.lock_relationship_slot(GREATEST(uid, _partner_id), _type);
  IF EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = uid AND blocked_id = _partner_id) OR (blocker_id = _partner_id AND blocked_id = uid)) THEN
    RAISE EXCEPTION 'لا يمكن إرسال الطلب';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _partner_id AND NOT is_suspended) THEN
    RAISE EXCEPTION 'المستخدم غير متاح';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.relationships
    WHERE type = _type AND status IN ('pending','accepted')
      AND _partner_id IN (requester_id, partner_id)
  ) THEN RAISE EXCEPTION 'هذا النوع مستخدم بالفعل لدى الطرف الآخر'; END IF;

  SELECT * INTO old_row
  FROM public.relationships
  WHERE type = _type AND status IN ('pending','accepted') AND uid IN (requester_id, partner_id)
  ORDER BY created_at DESC
  FOR UPDATE
  LIMIT 1;

  IF old_row.id IS NOT NULL THEN
    UPDATE public.relationships SET status = 'ended', ended_at = now() WHERE id = old_row.id;
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (
      CASE WHEN uid = old_row.requester_id THEN old_row.partner_id ELSE old_row.requester_id END,
      'relationship', 'تم إنهاء العلاقة', NULL,
      jsonb_build_object('relationship_id', old_row.id, 'type', old_row.type)
    );
  END IF;

  INSERT INTO public.relationships (requester_id, partner_id, type)
  VALUES (uid, _partner_id, _type)
  RETURNING * INTO new_row;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (_partner_id, 'relationship', 'طلب علاقة جديد', 'وصلك طلب ' || _type::text,
          jsonb_build_object('relationship_id', new_row.id, 'type', _type));
  RETURN new_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.replace_relationship(uuid, public.relation_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_relationship(uuid, public.relation_type) TO service_role;

CREATE OR REPLACE FUNCTION public.respond_relationship(_relationship_id uuid, _accept boolean)
RETURNS public.relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO r FROM public.relationships WHERE id = _relationship_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'الطلب غير متاح'; END IF;
  IF r.partner_id <> uid THEN RAISE EXCEPTION 'لا يمكنك الرد على هذا الطلب'; END IF;

  IF _accept THEN
    PERFORM public.lock_relationship_slot(LEAST(r.requester_id, r.partner_id), r.type);
    PERFORM public.lock_relationship_slot(GREATEST(r.requester_id, r.partner_id), r.type);
    IF EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = r.requester_id AND blocked_id = r.partner_id) OR (blocker_id = r.partner_id AND blocked_id = r.requester_id)) THEN
      RAISE EXCEPTION 'لا يمكن قبول الطلب';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.relationships x
      WHERE x.id <> r.id AND x.type = r.type AND x.status IN ('pending','accepted')
        AND (r.requester_id IN (x.requester_id, x.partner_id) OR r.partner_id IN (x.requester_id, x.partner_id))
    ) THEN RAISE EXCEPTION 'هذا النوع مستخدم بالفعل لدى أحد الطرفين'; END IF;
  END IF;

  UPDATE public.relationships
  SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
      started_at = CASE WHEN _accept THEN now() ELSE NULL END,
      ended_at = CASE WHEN _accept THEN NULL ELSE now() END
  WHERE id = r.id RETURNING * INTO r;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (r.requester_id, 'relationship', CASE WHEN _accept THEN 'تم قبول طلب العلاقة' ELSE 'تم رفض طلب العلاقة' END,
          NULL, jsonb_build_object('relationship_id', r.id, 'type', r.type));
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_relationship(_relationship_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO r FROM public.relationships WHERE id = _relationship_id FOR UPDATE;
  IF r.id IS NULL OR r.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'العلاقة غير متاحة'; END IF;
  IF uid NOT IN (r.requester_id, r.partner_id) THEN RAISE EXCEPTION 'غير مسموح'; END IF;
  UPDATE public.relationships SET status = 'ended', ended_at = now() WHERE id = r.id;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (CASE WHEN uid = r.requester_id THEN r.partner_id ELSE r.requester_id END,
          'relationship', 'تم إنهاء العلاقة', NULL,
          jsonb_build_object('relationship_id', r.id, 'type', r.type));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_end_relationship(_relationship_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); r public.relationships;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO r FROM public.relationships WHERE id = _relationship_id FOR UPDATE;
  IF r.id IS NULL OR r.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'العلاقة غير متاحة'; END IF;
  UPDATE public.relationships SET status = 'ended', ended_at = now() WHERE id = r.id;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES
    (r.requester_id, 'relationship', 'تم إنهاء العلاقة بواسطة الإدارة', NULL, jsonb_build_object('relationship_id', r.id, 'type', r.type)),
    (r.partner_id, 'relationship', 'تم إنهاء العلاقة بواسطة الإدارة', NULL, jsonb_build_object('relationship_id', r.id, 'type', r.type));
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_end_relationship(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_end_relationship(uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'relationships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.relationships;
  END IF;
END $$;