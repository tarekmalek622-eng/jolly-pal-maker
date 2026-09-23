CREATE OR REPLACE FUNCTION public.admin_broadcast(_title text, _body text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  INSERT INTO notifications(user_id, kind, title, body) SELECT id, 'system', left(_title,80), left(_body,500) FROM profiles WHERE NOT is_suspended;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO audit_logs(actor_id, action, new_value) VALUES (auth.uid(), 'broadcast', jsonb_build_object('title', _title, 'count', n));
  RETURN n;
END $$;