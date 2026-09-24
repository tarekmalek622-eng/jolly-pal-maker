CREATE OR REPLACE FUNCTION public.admin_set_agent(_public_id text, _active boolean, _whatsapp text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'للإدارة فقط'; END IF;
  SELECT id INTO uid FROM profiles WHERE public_id = _public_id;
  IF uid IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
  INSERT INTO recharge_agents(user_id, is_active, whatsapp) VALUES (uid, _active, _whatsapp)
  ON CONFLICT (user_id) DO UPDATE SET is_active = _active, whatsapp = COALESCE(_whatsapp, recharge_agents.whatsapp), updated_at = now();
  INSERT INTO notifications(user_id, kind, title, body)
    VALUES (uid, 'system', CASE WHEN _active THEN 'أصبحت وكيل شحن' ELSE 'تم إيقاف وكالة الشحن' END,
            CASE WHEN _active THEN 'حصلت على إطار وشارة وكيل الشحن' ELSE 'تم إيقاف صلاحية الشحن' END);
  IF _active THEN
    INSERT INTO direct_messages(sender_id, receiver_id, body)
      VALUES (auth.uid(), uid, '🎉 مبروك! تم تفعيل حسابك كوكيل شحن معتمد. ستظهر لك لوحة الوكيل في صفحة وكلاء الشحن، ويمكنك شحن أي مستخدم من رصيد وكالتك. بالتوفيق!');
  END IF;
  INSERT INTO audit_logs(actor_id, action, target_id, new_value)
    VALUES (auth.uid(), 'agent_set', uid::text, jsonb_build_object('active', _active));
  RETURN uid;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_fund_agent(_agent_id uuid, _amount bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE nb bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'للإدارة فقط'; END IF;
  IF _amount = 0 THEN RAISE EXCEPTION 'مبلغ غير صالح'; END IF;
  UPDATE recharge_agents SET balance = balance + _amount, updated_at = now()
    WHERE user_id = _agent_id RETURNING balance INTO nb;
  IF nb IS NULL THEN RAISE EXCEPTION 'ليس وكيلاً'; END IF;
  INSERT INTO agent_transactions(agent_id, kind, amount, balance_after, actor_id)
    VALUES (_agent_id, 'fund', _amount, nb, auth.uid());
  INSERT INTO direct_messages(sender_id, receiver_id, body)
    VALUES (auth.uid(), _agent_id,
      CASE WHEN _amount > 0
        THEN '💰 تم تمويل رصيد وكالتك بـ ' || _amount || ' كوينز. رصيدك الحالي: ' || nb
        ELSE '⚠️ تم خصم ' || abs(_amount) || ' كوينز من رصيد وكالتك. رصيدك الحالي: ' || nb
      END);
  INSERT INTO audit_logs(actor_id, action, target_id, new_value)
    VALUES (auth.uid(), 'agent_fund', _agent_id::text, jsonb_build_object('amount', _amount));
  RETURN nb;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_set_verified(_public_id text, _verified boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'للإدارة فقط'; END IF;
  SELECT id INTO uid FROM profiles WHERE public_id = _public_id;
  IF uid IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
  UPDATE profiles SET is_verified = _verified WHERE id = uid;
  INSERT INTO notifications(user_id, kind, title, body)
    VALUES (uid, 'system', CASE WHEN _verified THEN 'تم توثيق حسابك' ELSE 'تم إلغاء توثيق حسابك' END, 'التاج');
  INSERT INTO audit_logs(actor_id, action, target_id, new_value)
    VALUES (auth.uid(), 'verify_set', uid::text, jsonb_build_object('verified', _verified));
  RETURN uid;
END $function$;

CREATE OR REPLACE FUNCTION public.agent_recharge(_public_id text, _amount bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tid uuid; nb bigint;
BEGIN
  IF _amount < 1 THEN RAISE EXCEPTION 'مبلغ غير صالح'; END IF;
  SELECT id INTO tid FROM profiles WHERE public_id = _public_id;
  IF tid IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
  IF tid = auth.uid() THEN RAISE EXCEPTION 'لا يمكنك شحن حسابك'; END IF;
  UPDATE recharge_agents SET balance = balance - _amount, total_recharged = total_recharged + _amount, updated_at = now()
    WHERE user_id = auth.uid() AND is_active AND balance >= _amount RETURNING balance INTO nb;
  IF nb IS NULL THEN RAISE EXCEPTION 'رصيد الوكالة غير كافٍ أو الوكالة غير مفعلة'; END IF;
  PERFORM public._wallet_move(tid, _amount, 'agent_recharge', auth.uid()::text);
  UPDATE coin_wallets SET recharge_points = recharge_points + _amount WHERE user_id = tid;
  INSERT INTO agent_transactions(agent_id, target_id, kind, amount, balance_after, actor_id)
    VALUES (auth.uid(), tid, 'recharge', _amount, nb, auth.uid());
  INSERT INTO notifications(user_id, kind, title, body)
    VALUES (tid, 'system', 'تم شحن حسابك', 'وصلك ' || _amount || ' كوينز من وكيل الشحن');
  INSERT INTO direct_messages(sender_id, receiver_id, body)
    VALUES (auth.uid(), tid, '✅ تم شحن حسابك بـ ' || _amount || ' كوينز من وكيل الشحن المعتمد. شكراً لثقتك!');
  RETURN nb;
END $function$;