ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_verified(_public_id text, _verified boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'للإدارة فقط'; END IF;
  SELECT id INTO uid FROM profiles WHERE public_id = _public_id;
  IF uid IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
  UPDATE profiles SET is_verified = _verified WHERE id = uid;
  INSERT INTO notifications(user_id, kind, title, body)
    VALUES (uid, 'system', CASE WHEN _verified THEN 'تم توثيق حسابك' ELSE 'تم إلغاء توثيق حسابك' END, 'التاج');
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'verify_set', 'user', uid::text, jsonb_build_object('verified', _verified));
  RETURN uid;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_verified(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(text, boolean) TO authenticated;

-- block self-editing of is_verified
CREATE OR REPLACE FUNCTION public.guard_is_verified() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_is_verified ON public.profiles;
CREATE TRIGGER guard_is_verified BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_is_verified();

UPDATE public.profiles SET is_verified = true WHERE public_id = 'A1';
INSERT INTO public.recharge_agents(user_id, is_active)
  SELECT id, true FROM public.profiles WHERE public_id = 'A1'
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;