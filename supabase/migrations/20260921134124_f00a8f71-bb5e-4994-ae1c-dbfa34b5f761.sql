ALTER TABLE public.coin_wallets ADD COLUMN IF NOT EXISTS recharge_points BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cvip_level INT NOT NULL DEFAULT 0;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS art_key TEXT;

INSERT INTO public.app_settings(key, value) VALUES ('cvip', jsonb_build_object(
  'enabled', true,
  'tiers', jsonb_build_array(
    jsonb_build_object('level',1,'name','CVIP 1','points',250000,'style','bronze'),
    jsonb_build_object('level',2,'name','CVIP 2','points',1000000,'style','silver'),
    jsonb_build_object('level',3,'name','CVIP 3','points',5000000,'style','blue'),
    jsonb_build_object('level',4,'name','CVIP 4','points',20000000,'style','purple'),
    jsonb_build_object('level',5,'name','CVIP 5','points',100000000,'style','gold'),
    jsonb_build_object('level',6,'name','CVIP 6','points',500000000,'style','royal'),
    jsonb_build_object('level',7,'name','CVIP 7','points',2000000000,'style','legend')
  ),
  'duration_days', 30
)) ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.cvip_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'cvip'), '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.cvip_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cvip_settings() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cvip_level_for(_points BIGINT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX((t->>'level')::int), 0)
  FROM jsonb_array_elements(COALESCE(public.cvip_settings()->'tiers','[]'::jsonb)) t
  WHERE COALESCE(_points,0) >= (t->>'points')::bigint
$$;
REVOKE ALL ON FUNCTION public.cvip_level_for(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cvip_level_for(BIGINT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cvip_apply(_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pts BIGINT; lvl INT; cur INT; nm TEXT; days INT;
BEGIN
  IF COALESCE((public.cvip_settings()->>'enabled')::boolean, true) IS NOT TRUE THEN RETURN 0; END IF;
  SELECT COALESCE(recharge_points,0) INTO pts FROM public.coin_wallets WHERE user_id = _user_id;
  lvl := public.cvip_level_for(COALESCE(pts,0));
  SELECT COALESCE(cvip_level,0) INTO cur FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF lvl <= COALESCE(cur,0) THEN RETURN COALESCE(cur,0); END IF;
  days := COALESCE((public.cvip_settings()->>'duration_days')::int, 30);
  SELECT t->>'name' INTO nm FROM jsonb_array_elements(public.cvip_settings()->'tiers') t WHERE (t->>'level')::int = lvl LIMIT 1;
  UPDATE public.profiles
     SET cvip_level = lvl,
         is_cvip = true,
         cvip_expires_at = GREATEST(COALESCE(cvip_expires_at, now()), now()) + (days || ' days')::interval
   WHERE id = _user_id;
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (_user_id, 'cvip', 'ترقية CVIP', COALESCE(nm,'CVIP ' || lvl) || ' بفضل نقاط الشحن',
          jsonb_build_object('level', lvl, 'recharge_points', pts));
  INSERT INTO public.audit_logs (actor_id, target_id, action, new_value)
  VALUES (NULL, _user_id::text, 'cvip_auto_upgrade', jsonb_build_object('level', lvl, 'points', pts));
  RETURN lvl;
END $$;
REVOKE ALL ON FUNCTION public.cvip_apply(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cvip_apply(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_coin_purchase(_request_id uuid, _admin uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
  UPDATE public.coin_wallets
     SET coins = bal + r.coins,
         recharge_points = COALESCE(recharge_points,0) + r.coins,
         updated_at = now()
   WHERE user_id = r.user_id;
  UPDATE public.profiles SET xp = xp + r.coins,
    level = LEAST(100, 1 + ((xp + r.coins) / 500)::int) WHERE id = r.user_id;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (r.user_id, 'topup', r.coins, bal, bal + r.coins, 'شراء كوينز: ' || r.method);
  UPDATE public.coin_purchase_requests SET status = 'approved', reviewed_by = _admin, reviewed_at = now(), updated_at = now() WHERE id = r.id;
  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (r.user_id, 'wallet', 'تمت إضافة الكوينز وXP', 'تم تأكيد التحويل وإضافة ' || r.coins || ' كوينز وXP.');
  PERFORM public.cvip_apply(r.user_id);
  RETURN bal + r.coins;
END $function$;

CREATE OR REPLACE FUNCTION public.cvip_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); pts BIGINT; lvl INT; nxt jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT COALESCE(recharge_points,0) INTO pts FROM public.coin_wallets WHERE user_id = uid;
  pts := COALESCE(pts,0);
  lvl := public.cvip_level_for(pts);
  SELECT t INTO nxt FROM jsonb_array_elements(COALESCE(public.cvip_settings()->'tiers','[]'::jsonb)) t
   WHERE (t->>'points')::bigint > pts ORDER BY (t->>'points')::bigint ASC LIMIT 1;
  RETURN jsonb_build_object('recharge_points', pts, 'level', lvl, 'next', nxt,
    'tiers', COALESCE(public.cvip_settings()->'tiers','[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.cvip_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cvip_state() TO authenticated, service_role;