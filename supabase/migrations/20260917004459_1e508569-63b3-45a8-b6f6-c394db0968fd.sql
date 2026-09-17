ALTER TABLE public.badge_definitions
  ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

UPDATE public.badge_definitions
SET permissions = CASE key
  WHEN 'admin_assistant_01' THEN ARRAY['room_view','participant_remove','room_background','wheel_close']
  WHEN 'admin_assistant_02' THEN ARRAY['room_view','participant_remove','room_background','wheel_close']
  WHEN 'admin_assistant_03' THEN ARRAY['room_view','participant_remove','room_background','wheel_close']
  WHEN 'admin_assistant_04' THEN ARRAY['room_view','participant_remove','room_background']
  WHEN 'admin_assistant_05' THEN ARRAY['room_view','participant_remove']
  WHEN 'admin_assistant_06' THEN ARRAY['room_view','participant_remove']
  WHEN 'admin_assistant_07' THEN ARRAY['user_view','participant_remove']
  WHEN 'admin_assistant_08' THEN ARRAY['user_view','room_view']
  WHEN 'admin_assistant_09' THEN ARRAY['support_view']
  WHEN 'admin_assistant_10' THEN ARRAY['reports_view']
  WHEN 'admin_assistant_11' THEN ARRAY['room_view','wheel_close']
  WHEN 'admin_assistant_12' THEN ARRAY['games_view','wheel_close']
  WHEN 'admin_assistant_13' THEN ARRAY['games_view','wheel_close']
  WHEN 'admin_assistant_14' THEN ARRAY['gifts_view']
  WHEN 'admin_assistant_15' THEN ARRAY['store_view']
  WHEN 'admin_assistant_16' THEN ARRAY['vip_view']
  WHEN 'admin_assistant_17' THEN ARRAY['svip_view']
  WHEN 'admin_assistant_18' THEN ARRAY['content_view','room_background']
  WHEN 'admin_assistant_19' THEN ARRAY['community_view']
  WHEN 'admin_assistant_20' THEN ARRAY['community_view','support_view']
  WHEN 'admin_assistant_21' THEN ARRAY['room_view']
  WHEN 'admin_assistant_22' THEN ARRAY['training_view']
  WHEN 'admin_assistant_23' THEN ARRAY['quality_view','room_view']
  WHEN 'admin_assistant_24' THEN ARRAY['security_view','participant_remove']
  WHEN 'admin_assistant_25' THEN ARRAY['room_view','participant_remove']
  WHEN 'admin_assistant_26' THEN ARRAY['room_view','participant_remove','room_background']
  WHEN 'admin_assistant_27' THEN ARRAY['chat_view','participant_remove']
  WHEN 'admin_assistant_28' THEN ARRAY['user_view']
  WHEN 'admin_assistant_29' THEN ARRAY['operations_view','room_view','wheel_close']
  WHEN 'admin_assistant_30' THEN ARRAY['room_view','participant_remove','room_background','wheel_close']
  ELSE permissions
END,
description = CASE
  WHEN key IN ('admin_assistant_01','admin_assistant_02','admin_assistant_03','admin_assistant_30') THEN 'رتبة مسؤول: سحب المشاركين وتخصيص الغرفة وإغلاق جولة العجلة'
  WHEN key IN ('admin_assistant_04','admin_assistant_26') THEN 'إدارة المشاركين وخلفية الغرفة'
  WHEN key IN ('admin_assistant_05','admin_assistant_06','admin_assistant_07','admin_assistant_24','admin_assistant_25','admin_assistant_27') THEN 'مراقبة الغرف وسحب المشاركين المخالفين'
  WHEN key IN ('admin_assistant_11','admin_assistant_12','admin_assistant_13','admin_assistant_29') THEN 'متابعة الألعاب وإغلاق الجولة عند الحاجة'
  ELSE 'رتبة مساعد متخصصة بصلاحيات قراءة ومتابعة محدودة'
END
WHERE kind = 'administrative';

INSERT INTO public.badge_definitions (key, name, description, kind, threshold, sort_order, style_key, permissions)
VALUES ('app_owner', 'مالك التطبيق', 'أعلى رتبة موثقة وصلاحيات الإدارة الكاملة', 'administrative', 1, 1, 'imperial', ARRAY['all'])
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  style_key = EXCLUDED.style_key,
  permissions = EXCLUDED.permissions,
  is_active = true;

INSERT INTO public.user_badges (user_id, badge_id, progress)
SELECT ur.user_id, bd.id, 1
FROM public.user_roles ur
JOIN public.badge_definitions bd ON bd.key = 'app_owner'
WHERE ur.role = 'super_admin'
ON CONFLICT (user_id, badge_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_badge_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_badges ub
    JOIN public.badge_definitions bd ON bd.id = ub.badge_id
    WHERE ub.user_id = _user_id
      AND bd.kind = 'administrative'
      AND bd.is_active
      AND ('all' = ANY(bd.permissions) OR _permission = ANY(bd.permissions))
  )
$$;
REVOKE ALL ON FUNCTION public.has_badge_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_badge_permission(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.badge_remove_room_participant(_room_id UUID, _target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid(); owner_id UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT r.owner_id INTO owner_id FROM public.rooms r WHERE r.id = _room_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'الغرفة غير موجودة'; END IF;
  IF _target_id = owner_id THEN RAISE EXCEPTION 'لا يمكن سحب مالك الغرفة'; END IF;
  IF uid <> owner_id AND NOT public.is_admin(uid) AND NOT public.has_badge_permission(uid, 'participant_remove') THEN
    RAISE EXCEPTION 'لا تملك صلاحية سحب المشاركين';
  END IF;
  DELETE FROM public.room_members WHERE room_id = _room_id AND user_id = _target_id;
  UPDATE public.room_mics SET user_id = NULL, is_muted = false WHERE room_id = _room_id AND user_id = _target_id;
  INSERT INTO public.audit_logs(actor_id, target_id, action, new_value)
  VALUES(uid, _target_id::TEXT, 'badge_room_participant_remove', jsonb_build_object('room_id', _room_id));
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.badge_remove_room_participant(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.badge_remove_room_participant(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.badge_close_wheel_round(_room_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid(); owner_id UUID; rid UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT r.owner_id INTO owner_id FROM public.rooms r WHERE r.id = _room_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'الغرفة غير موجودة'; END IF;
  IF uid <> owner_id AND NOT public.is_admin(uid) AND NOT public.has_badge_permission(uid, 'wheel_close') THEN
    RAISE EXCEPTION 'لا تملك صلاحية إغلاق الجولة';
  END IF;
  SELECT id INTO rid FROM public.wheel_rounds WHERE status = 'betting' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF rid IS NULL THEN RAISE EXCEPTION 'لا توجد جولة مفتوحة'; END IF;
  PERFORM public.wheel_settle(rid);
  INSERT INTO public.audit_logs(actor_id, target_id, action, new_value)
  VALUES(uid, rid::TEXT, 'badge_wheel_close', jsonb_build_object('room_id', _room_id));
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.badge_close_wheel_round(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.badge_close_wheel_round(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_gift_bulk(_gift_id UUID, _receiver_ids UUID[], _room_id UUID DEFAULT NULL, _quantity INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); g public.gifts; qty INT; per_cost BIGINT; total BIGINT;
        ids UUID[]; rid UUID; sender_before BIGINT; receiver_before BIGINT; vip INT; n INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_receiver_ids, '{}'::uuid[])) AS x
               WHERE x IS NOT NULL AND x <> uid
                 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x AND NOT p.is_suspended)) INTO ids;
  n := COALESCE(array_length(ids, 1), 0);
  IF n = 0 THEN RAISE EXCEPTION 'اختر مستلمًا واحدًا على الأقل'; END IF;
  IF n > 50 THEN RAISE EXCEPTION 'الحد الأقصى 50 مستلمًا في المرة'; END IF;
  qty := LEAST(GREATEST(COALESCE(_quantity, 1), 1), 99);
  SELECT * INTO g FROM public.gifts WHERE id = _gift_id AND is_active;
  IF g.id IS NULL THEN RAISE EXCEPTION 'الهدية غير متوفرة'; END IF;
  SELECT vip_level INTO vip FROM public.profiles WHERE id = uid;
  IF COALESCE(vip, 0) < g.required_vip THEN RAISE EXCEPTION 'هذه الهدية تتطلب VIP %', g.required_vip; END IF;
  per_cost := g.price * qty;
  total := per_cost * n;
  SELECT coins INTO sender_before FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF sender_before IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF sender_before < total THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;
  UPDATE public.coin_wallets SET coins = coins - total, total_sent = total_sent + total, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (uid, 'gift_sent', -total, sender_before, sender_before - total, g.name || ' ×' || qty || ' → ' || n);
  FOREACH rid IN ARRAY ids LOOP
    INSERT INTO public.coin_wallets (user_id, coins) VALUES (rid, 0) ON CONFLICT (user_id) DO NOTHING;
    SELECT coins INTO receiver_before FROM public.coin_wallets WHERE user_id = rid FOR UPDATE;
    UPDATE public.coin_wallets SET coins = coins + per_cost, total_received = total_received + per_cost, updated_at = now() WHERE user_id = rid;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    VALUES (rid, 'gift_received', per_cost, receiver_before, receiver_before + per_cost, g.name);
    INSERT INTO public.gift_transactions (gift_id, sender_id, receiver_id, room_id, quantity, total_price)
    VALUES (_gift_id, uid, rid, _room_id, qty, per_cost);
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    VALUES (rid, 'gift', 'وصلتك هدية', 'استلمت ' || g.name, jsonb_build_object('gift_id', _gift_id, 'sender_id', uid, 'quantity', qty));
  END LOOP;
  UPDATE public.profiles SET xp = xp + total,
    level = LEAST(100, 1 + ((xp + total) / 500)::int) WHERE id = uid;
  RETURN jsonb_build_object('receivers', n, 'total', total, 'gift', g.name);
END; $$;
REVOKE ALL ON FUNCTION public.send_gift_bulk(UUID, UUID[], UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_gift_bulk(UUID, UUID[], UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_coin_purchase(_request_id UUID, _admin UUID)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.coin_purchase_requests; bal BIGINT;
BEGIN
  SELECT * INTO r FROM public.coin_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'تمت مراجعة الطلب بالفعل'; END IF;
  SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = r.user_id FOR UPDATE;
  IF bal IS NULL THEN
    INSERT INTO public.coin_wallets (user_id, coins) VALUES (r.user_id, 0) ON CONFLICT (user_id) DO NOTHING;
    bal := 0;
  END IF;
  UPDATE public.coin_wallets SET coins = bal + r.coins, updated_at = now() WHERE user_id = r.user_id;
  UPDATE public.profiles SET xp = xp + r.coins,
    level = LEAST(100, 1 + ((xp + r.coins) / 500)::int) WHERE id = r.user_id;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (r.user_id, 'topup', r.coins, bal, bal + r.coins, 'شراء كوينز: ' || r.method);
  UPDATE public.coin_purchase_requests SET status = 'approved', reviewed_by = _admin, reviewed_at = now(), updated_at = now() WHERE id = r.id;
  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (r.user_id, 'wallet', 'تمت إضافة الكوينز وXP', 'تم تأكيد التحويل وإضافة ' || r.coins || ' كوينز وXP.');
  RETURN bal + r.coins;
END $$;
REVOKE ALL ON FUNCTION public.approve_coin_purchase(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_coin_purchase(UUID, UUID) TO service_role;