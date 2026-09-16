CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- عمليات السيرفر الموثوقة (service_role) والدوال الداخلية تعمل بدون قيود
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.public_id IS DISTINCT FROM OLD.public_id
     OR NEW.level IS DISTINCT FROM OLD.level OR NEW.xp IS DISTINCT FROM OLD.xp
     OR NEW.vip_level IS DISTINCT FROM OLD.vip_level OR NEW.is_cvip IS DISTINCT FROM OLD.is_cvip
     OR NEW.cvip_expires_at IS DISTINCT FROM OLD.cvip_expires_at OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.is_online IS DISTINCT FROM OLD.is_online OR NEW.last_seen IS DISTINCT FROM OLD.last_seen
     OR NEW.frame_url IS DISTINCT FROM OLD.frame_url OR NEW.profile_background_url IS DISTINCT FROM OLD.profile_background_url THEN
    RAISE EXCEPTION 'لا يمكنك تعديل حقول الحساب المحمية';
  END IF;
  RETURN NEW;
END; $$;