ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS animation_url text,
  ADD COLUMN IF NOT EXISTS join_mode text NOT NULL DEFAULT 'request';

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.family_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_join_requests_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  UNIQUE (family_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_join_requests TO authenticated;
GRANT ALL ON public.family_join_requests TO service_role;
ALTER TABLE public.family_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family requests visible to requester and managers"
ON public.family_join_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_members m
    WHERE m.family_id = family_join_requests.family_id
      AND m.user_id = auth.uid()
      AND m.role IN ('leader', 'deputy')
  )
  OR public.is_admin(auth.uid())
);
CREATE POLICY "users create own family request"
ON public.family_join_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "users cancel own pending request"
ON public.family_join_requests FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'cancelled');
CREATE POLICY "users delete own cancelled request"
ON public.family_join_requests FOR DELETE TO authenticated
USING (user_id = auth.uid() AND status = 'cancelled');

CREATE INDEX IF NOT EXISTS idx_family_join_requests_family_status
  ON public.family_join_requests (family_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_family_join_requests_user
  ON public.family_join_requests (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_family_join_requests_updated_at ON public.family_join_requests;
CREATE TRIGGER trg_family_join_requests_updated_at
BEFORE UPDATE ON public.family_join_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.family_can(_family_id uuid, _user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.family_members m
      WHERE m.family_id = _family_id
        AND m.user_id = _user_id
        AND (
          m.role = 'leader'
          OR (
            m.role = 'deputy'
            AND _permission = ANY (ARRAY[
              'family_accept_members',
              'family_remove_members',
              'family_manage_requests',
              'family_manage_profile',
              'family_manage_moderators'
            ])
            AND COALESCE((m.permissions ->> _permission)::boolean, false)
          )
        )
    )
$$;
REVOKE ALL ON FUNCTION public.family_can(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_can(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.family_request_join(_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  f public.families;
  existing_family uuid;
  req public.family_join_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO f FROM public.families WHERE id = _family_id AND is_active = true;
  IF f.id IS NULL THEN RAISE EXCEPTION 'العائلة غير موجودة'; END IF;
  IF f.is_suspended THEN RAISE EXCEPTION 'العائلة موقوفة'; END IF;
  SELECT family_id INTO existing_family FROM public.family_members WHERE user_id = uid;
  IF existing_family IS NOT NULL THEN
    IF existing_family = _family_id THEN RAISE EXCEPTION 'أنت عضو في هذه العائلة بالفعل'; END IF;
    RAISE EXCEPTION 'أنت عضو في عائلة أخرى بالفعل';
  END IF;
  IF f.member_count >= f.max_members THEN RAISE EXCEPTION 'العائلة وصلت للحد الأقصى للأعضاء'; END IF;

  IF f.join_mode = 'open' THEN
    INSERT INTO public.family_members (family_id, user_id, role)
    VALUES (_family_id, uid, 'member');
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (uid, 'family', 'تم الانضمام للعائلة', 'أصبحت عضوًا في ' || f.name, jsonb_build_object('family_id', f.id));
    RETURN jsonb_build_object('status', 'joined');
  END IF;
  IF f.join_mode = 'closed' THEN RAISE EXCEPTION 'الانضمام لهذه العائلة مغلق'; END IF;

  INSERT INTO public.family_join_requests (family_id, user_id, status, reviewed_by, reviewed_at)
  VALUES (_family_id, uid, 'pending', NULL, NULL)
  ON CONFLICT (family_id, user_id) DO UPDATE
    SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
  RETURNING * INTO req;
  RETURN jsonb_build_object('status', 'pending', 'request_id', req.id);
END;
$$;
REVOKE ALL ON FUNCTION public.family_request_join(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_request_join(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.family_respond_join_request(_request_id uuid, _accept boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  req public.family_join_requests;
  f public.families;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO req FROM public.family_join_requests WHERE id = _request_id FOR UPDATE;
  IF req.id IS NULL OR req.status <> 'pending' THEN RAISE EXCEPTION 'الطلب غير متاح'; END IF;
  IF NOT public.family_can(req.family_id, uid, 'family_manage_requests')
     AND NOT public.family_can(req.family_id, uid, 'family_accept_members') THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة الطلبات';
  END IF;
  SELECT * INTO f FROM public.families WHERE id = req.family_id FOR UPDATE;
  IF _accept THEN
    IF f.is_suspended THEN RAISE EXCEPTION 'العائلة موقوفة'; END IF;
    IF f.member_count >= f.max_members THEN RAISE EXCEPTION 'العائلة وصلت للحد الأقصى للأعضاء'; END IF;
    IF EXISTS (SELECT 1 FROM public.family_members WHERE user_id = req.user_id) THEN
      RAISE EXCEPTION 'المستخدم عضو في عائلة بالفعل';
    END IF;
    INSERT INTO public.family_members (family_id, user_id, role) VALUES (req.family_id, req.user_id, 'member');
  END IF;
  UPDATE public.family_join_requests
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
         reviewed_by = uid,
         reviewed_at = now()
   WHERE id = req.id;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (
    req.user_id,
    'family',
    CASE WHEN _accept THEN 'تم قبول طلب العائلة' ELSE 'تم رفض طلب العائلة' END,
    CASE WHEN _accept THEN 'أصبحت عضوًا في ' ELSE 'لم يتم قبول طلبك للانضمام إلى ' END || f.name,
    jsonb_build_object('family_id', f.id, 'request_id', req.id)
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.family_respond_join_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_respond_join_request(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.family_manage_member(
  _family_id uuid,
  _member_id uuid,
  _action text,
  _permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  member_role text;
  allowed_permissions text[] := ARRAY[
    'family_accept_members',
    'family_remove_members',
    'family_manage_requests',
    'family_manage_profile',
    'family_manage_moderators'
  ];
  permission_key text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT role INTO member_role FROM public.family_members WHERE family_id = _family_id AND user_id = _member_id;
  IF member_role IS NULL THEN RAISE EXCEPTION 'العضو غير موجود'; END IF;
  IF member_role = 'leader' THEN RAISE EXCEPTION 'لا يمكن تعديل قائد العائلة من هنا'; END IF;

  IF _action = 'remove' THEN
    IF NOT public.family_can(_family_id, uid, 'family_remove_members') THEN RAISE EXCEPTION 'لا تملك صلاحية إزالة الأعضاء'; END IF;
    DELETE FROM public.family_members WHERE family_id = _family_id AND user_id = _member_id;
  ELSIF _action = 'promote' THEN
    IF NOT public.family_can(_family_id, uid, 'family_manage_moderators') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة المشرفين'; END IF;
    FOR permission_key IN SELECT jsonb_object_keys(_permissions) LOOP
      IF NOT (permission_key = ANY (allowed_permissions)) THEN RAISE EXCEPTION 'صلاحية عائلية غير مسموحة'; END IF;
    END LOOP;
    UPDATE public.family_members SET role = 'deputy', permissions = _permissions WHERE family_id = _family_id AND user_id = _member_id;
  ELSIF _action = 'demote' THEN
    IF NOT public.family_can(_family_id, uid, 'family_manage_moderators') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة المشرفين'; END IF;
    UPDATE public.family_members SET role = 'member', permissions = '{}'::jsonb WHERE family_id = _family_id AND user_id = _member_id;
  ELSIF _action = 'permissions' THEN
    IF NOT public.family_can(_family_id, uid, 'family_manage_moderators') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة المشرفين'; END IF;
    IF member_role <> 'deputy' THEN RAISE EXCEPTION 'الصلاحيات تخصص لمشرف العائلة فقط'; END IF;
    FOR permission_key IN SELECT jsonb_object_keys(_permissions) LOOP
      IF NOT (permission_key = ANY (allowed_permissions)) THEN RAISE EXCEPTION 'صلاحية عائلية غير مسموحة'; END IF;
    END LOOP;
    UPDATE public.family_members SET permissions = _permissions WHERE family_id = _family_id AND user_id = _member_id;
  ELSE
    RAISE EXCEPTION 'إجراء غير صالح';
  END IF;

  INSERT INTO public.audit_logs (actor_id, target_id, action, new_value)
  VALUES (uid, _member_id::text, 'family_member_' || _action, jsonb_build_object('family_id', _family_id, 'permissions', _permissions));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.family_manage_member(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_manage_member(uuid, uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.family_update_own_profile(
  _family_id uuid,
  _description text,
  _logo_url text,
  _cover_url text,
  _animation_url text,
  _join_mode text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.family_can(_family_id, uid, 'family_manage_profile') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل بيانات العائلة';
  END IF;
  IF _join_mode NOT IN ('open', 'request', 'closed') THEN RAISE EXCEPTION 'طريقة الانضمام غير صالحة'; END IF;
  UPDATE public.families
     SET description = NULLIF(btrim(_description), ''),
         logo_url = NULLIF(btrim(_logo_url), ''),
         cover_url = NULLIF(btrim(_cover_url), ''),
         animation_url = NULLIF(btrim(_animation_url), ''),
         join_mode = _join_mode,
         updated_at = now()
   WHERE id = _family_id;
  INSERT INTO public.audit_logs (actor_id, target_id, action, new_value)
  VALUES (uid, _family_id::text, 'family_profile_update', jsonb_build_object('join_mode', _join_mode));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.family_update_own_profile(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_update_own_profile(uuid, text, text, text, text, text) TO authenticated, service_role;

UPDATE public.app_settings
SET value = value || jsonb_build_object(
  'join_modes', jsonb_build_array('open', 'request', 'closed'),
  'family_permissions', jsonb_build_array(
    'family_accept_members',
    'family_remove_members',
    'family_manage_requests',
    'family_manage_profile',
    'family_manage_moderators'
  )
), updated_at = now()
WHERE key = 'families';