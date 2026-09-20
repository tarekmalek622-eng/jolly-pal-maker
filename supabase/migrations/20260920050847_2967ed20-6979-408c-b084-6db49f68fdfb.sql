ALTER TABLE public.room_support_registrations
  ADD COLUMN IF NOT EXISTS admin_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.room_support_set_admins(_room_id uuid, _ids uuid[])
RETURNS public.room_support_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid(); clean UUID[]; row public.room_support_registrations;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = _room_id AND r.owner_id = uid) THEN
    RAISE EXCEPTION 'مالك الغرفة فقط يمكنه تعديل القائمة';
  END IF;
  SELECT ARRAY(
    SELECT DISTINCT x FROM unnest(COALESCE(_ids, '{}'::uuid[])) AS x
     WHERE EXISTS (SELECT 1 FROM public.room_moderators m WHERE m.room_id = _room_id AND m.user_id = x)
     LIMIT 20
  ) INTO clean;

  INSERT INTO public.room_support_registrations (room_id, registered_by, status, admin_ids)
  VALUES (_room_id, uid, 'pending', clean)
  ON CONFLICT (room_id) DO UPDATE SET admin_ids = clean, updated_at = now()
  RETURNING * INTO row;

  INSERT INTO public.audit_logs (actor_id, target_id, action, new_value)
  VALUES (uid, _room_id::text, 'room_support_admins_updated', jsonb_build_object('admin_ids', to_jsonb(clean)));

  RETURN row;
END; $$;

REVOKE ALL ON FUNCTION public.room_support_set_admins(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_support_set_admins(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.room_rewards_state(_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s jsonb; wk date; rev bigint; prev bigint; tier jsonb; reg public.room_support_registrations; last public.room_reward_weeks;
BEGIN
  s := public.room_rewards_settings();
  wk := public.room_week_start();
  SELECT COALESCE(SUM(total_price), 0) INTO rev FROM public.gift_transactions
   WHERE room_id = _room_id AND created_at >= wk;
  SELECT COALESCE(SUM(total_price), 0) INTO prev FROM public.gift_transactions
   WHERE room_id = _room_id AND created_at >= wk - 7 AND created_at < wk;
  SELECT t INTO tier FROM jsonb_array_elements(COALESCE(s->'tiers', '[]'::jsonb)) t
   WHERE (t->>'revenue')::bigint <= rev ORDER BY (t->>'revenue')::bigint DESC LIMIT 1;
  SELECT * INTO reg FROM public.room_support_registrations WHERE room_id = _room_id;
  SELECT * INTO last FROM public.room_reward_weeks WHERE room_id = _room_id ORDER BY week_start DESC LIMIT 1;

  RETURN jsonb_build_object(
    'week_start', wk,
    'weekly_revenue', rev,
    'last_week_revenue', prev,
    'tier', COALESCE(tier, '{}'::jsonb),
    'tiers', COALESCE(s->'tiers', '[]'::jsonb),
    'min_weekly_cup', COALESCE((s->>'min_weekly_cup')::bigint, 200000),
    'registration', COALESCE(reg.status, 'none'),
    'admin_ids', COALESCE(to_jsonb(reg.admin_ids), '[]'::jsonb),
    'last_settlement', CASE WHEN last.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'week_start', last.week_start, 'revenue', last.revenue,
      'owner_coins', last.owner_coins, 'admin_coins', last.admin_coins) END
  );
END; $$;

REVOKE ALL ON FUNCTION public.room_rewards_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_rewards_state(uuid) TO authenticated, service_role;