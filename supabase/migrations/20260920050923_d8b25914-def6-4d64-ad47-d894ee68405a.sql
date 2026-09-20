CREATE OR REPLACE FUNCTION public.room_reward_settle_week(_room_id uuid, _week_start date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE s jsonb; tier jsonb; rev bigint; owner uuid; week_id uuid; cap bigint;
        admins uuid[]; chosen uuid[]; n integer; share bigint; total_admin bigint; a uuid; pay bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.room_support_registrations WHERE room_id = _room_id AND status = 'active') THEN
    RAISE EXCEPTION 'الغرفة غير مسجّلة في خطة الدعم';
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_reward_weeks WHERE room_id = _room_id AND week_start = _week_start) THEN
    RETURN (SELECT id FROM public.room_reward_weeks WHERE room_id = _room_id AND week_start = _week_start);
  END IF;
  s := public.room_rewards_settings();
  SELECT COALESCE(SUM(total_price), 0) INTO rev FROM public.gift_transactions
   WHERE room_id = _room_id AND created_at >= _week_start AND created_at < _week_start + 7;
  SELECT l INTO tier FROM jsonb_array_elements(COALESCE(s->'tiers','[]'::jsonb)) l
   WHERE rev >= (l->>'revenue')::bigint ORDER BY (l->>'revenue')::bigint DESC LIMIT 1;
  IF tier IS NULL THEN RAISE EXCEPTION 'إيراد الأسبوع أقل من أول شريحة مكافأة'; END IF;

  cap := COALESCE((tier->>'weekly_cap')::bigint, 0);
  SELECT owner_id INTO owner FROM public.rooms WHERE id = _room_id;
  total_admin := COALESCE((tier->>'admin_coins')::bigint, 0);
  IF cap > 0 THEN total_admin := LEAST(total_admin, cap); END IF;

  INSERT INTO public.room_reward_weeks (room_id, week_start, revenue, owner_coins, admin_coins)
  VALUES (_room_id, _week_start, rev, COALESCE((tier->>'owner_coins')::bigint, 0), total_admin)
  RETURNING id INTO week_id;

  pay := COALESCE((tier->>'owner_coins')::bigint, 0);
  IF cap > 0 THEN pay := LEAST(pay, cap); END IF;
  IF pay > 0 AND owner IS NOT NULL THEN
    INSERT INTO public.room_reward_payouts (week_id, room_id, user_id, role, coins) VALUES (week_id, _room_id, owner, 'owner', pay);
    INSERT INTO public.coin_wallets (user_id, coins) VALUES (owner, 0) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET coins = coins + pay, updated_at = now() WHERE user_id = owner;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference, status)
    SELECT owner, 'room_reward', pay, w.coins - pay, w.coins, 'room_week:' || week_id::text, 'completed'
      FROM public.coin_wallets w WHERE w.user_id = owner;
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (owner, 'room_reward', 'مكافأة دعم الغرفة', 'استلمت مكافأة مالك الغرفة لهذا الأسبوع');
  END IF;

  -- قائمة المرشحين التي اختارها المالك، وإن كانت فارغة فكل مشرفي الغرفة
  SELECT admin_ids INTO chosen FROM public.room_support_registrations WHERE room_id = _room_id;
  SELECT COALESCE(array_agg(m.user_id), '{}') INTO admins
    FROM public.room_moderators m
   WHERE m.room_id = _room_id
     AND (COALESCE(array_length(chosen, 1), 0) = 0 OR m.user_id = ANY(chosen));
  n := LEAST(COALESCE(array_length(admins, 1), 0), 20);
  IF n > 0 AND total_admin > 0 THEN
    admins := admins[1:n];
    share := total_admin / n;
    IF share > 0 THEN
      FOREACH a IN ARRAY admins LOOP
        INSERT INTO public.room_reward_payouts (week_id, room_id, user_id, role, coins) VALUES (week_id, _room_id, a, 'admin', share);
        INSERT INTO public.coin_wallets (user_id, coins) VALUES (a, 0) ON CONFLICT (user_id) DO NOTHING;
        UPDATE public.coin_wallets SET coins = coins + share, updated_at = now() WHERE user_id = a;
        INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference, status)
        SELECT a, 'room_reward', share, w.coins - share, w.coins, 'room_week:' || week_id::text, 'completed'
          FROM public.coin_wallets w WHERE w.user_id = a;
        INSERT INTO public.notifications (user_id, kind, title, body)
        VALUES (a, 'room_reward', 'مكافأة ادمن الغرفة', 'استلمت مكافأة ادمن الغرفة لهذا الأسبوع');
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, target_id, action, new_value)
  VALUES (NULL, _room_id::text, 'room_reward_week_settled',
          jsonb_build_object('week_start', _week_start, 'revenue', rev, 'owner_coins', pay, 'admin_coins', total_admin, 'admins', to_jsonb(admins)));
  RETURN week_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.room_reward_settle_week(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_reward_settle_week(uuid, date) TO service_role;