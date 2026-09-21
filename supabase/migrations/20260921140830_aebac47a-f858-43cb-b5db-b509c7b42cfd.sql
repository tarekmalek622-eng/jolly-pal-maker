REVOKE EXECUTE ON FUNCTION public.enforce_mic_protection() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_room_password(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wheel_bet(text, bigint, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wheel_daily_top(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wheel_round_state() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wheel_round_winners(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wheel_settings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wheel_tick() FROM PUBLIC, anon;

ALTER TABLE public.families
  DROP CONSTRAINT IF EXISTS families_join_mode_check;
ALTER TABLE public.families
  ADD CONSTRAINT families_join_mode_check CHECK (join_mode IN ('open', 'request', 'closed'));

DROP POLICY IF EXISTS "family requests visible to requester and managers" ON public.family_join_requests;
CREATE POLICY "family requests visible to requester and managers"
ON public.family_join_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.family_can(family_id, auth.uid(), 'family_manage_requests')
  OR public.family_can(family_id, auth.uid(), 'family_accept_members')
);

CREATE OR REPLACE FUNCTION public.family_stats(_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.families;
  res jsonb;
  uid uuid := auth.uid();
  viewer public.family_members;
  request_state text;
BEGIN
  SELECT * INTO f FROM public.families WHERE id = _family_id;
  IF f.id IS NULL THEN RETURN NULL; END IF;
  IF uid IS NOT NULL THEN
    SELECT * INTO viewer FROM public.family_members WHERE family_id = f.id AND user_id = uid;
    SELECT status INTO request_state
      FROM public.family_join_requests
     WHERE family_id = f.id AND user_id = uid
     LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
    'family', to_jsonb(f),
    'level_info', (
      SELECT l FROM jsonb_array_elements(COALESCE(public.family_settings()->'levels','[]'::jsonb)) l
       WHERE (l->>'level')::int = f.level LIMIT 1
    ),
    'next_level', (
      SELECT l FROM jsonb_array_elements(COALESCE(public.family_settings()->'levels','[]'::jsonb)) l
       WHERE (l->>'points')::bigint > f.points ORDER BY (l->>'points')::bigint LIMIT 1
    ),
    'members', f.member_count,
    'viewer', CASE WHEN viewer.id IS NULL THEN NULL ELSE jsonb_build_object(
      'role', viewer.role,
      'permissions', viewer.permissions,
      'can_accept_members', public.family_can(f.id, uid, 'family_accept_members'),
      'can_remove_members', public.family_can(f.id, uid, 'family_remove_members'),
      'can_manage_requests', public.family_can(f.id, uid, 'family_manage_requests'),
      'can_manage_profile', public.family_can(f.id, uid, 'family_manage_profile'),
      'can_manage_moderators', public.family_can(f.id, uid, 'family_manage_moderators')
    ) END,
    'join_request_status', request_state,
    'leader', (
      SELECT jsonb_build_object(
        'user_id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'public_id', p.public_id, 'vip_level', p.vip_level
      ) FROM public.profiles p WHERE p.id = f.leader_id
    ),
    'gifts_received', COALESCE((
      SELECT sum(g.total_price) FROM public.gift_transactions g
       JOIN public.family_members m ON m.user_id = g.receiver_id
       WHERE m.family_id = f.id
    ), 0),
    'gifts_sent', COALESCE((
      SELECT sum(g.total_price) FROM public.gift_transactions g
       JOIN public.family_members m ON m.user_id = g.sender_id
       WHERE m.family_id = f.id
    ), 0),
    'top_members', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT m.user_id, m.role, m.points, m.permissions,
               p.display_name, p.avatar_url, p.public_id, p.vip_level
          FROM public.family_members m JOIN public.profiles p ON p.id = m.user_id
         WHERE m.family_id = f.id
         ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'deputy' THEN 1 ELSE 2 END,
                  m.points DESC LIMIT 50
      ) x
    ), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.family_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_stats(uuid) TO authenticated, service_role;

ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.events_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev public.cup_events; changed INT := 0; nxt public.cup_events;
        win_text TEXT; r RECORD; medals TEXT[] := ARRAY['🥇','🥈','🥉'];
        winners jsonb; top_prize bigint; champion TEXT;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('events_tick')) THEN RETURN 0; END IF;

  FOR ev IN SELECT * FROM public.cup_events WHERE status IN ('active','settling') AND ends_at <= now() LOOP
    PERFORM public.settle_cup_event(ev.id, NULL);
    changed := changed + 1;
    win_text := ''; champion := NULL;
    FOR r IN
      SELECT p.rank, p.coins, p.score, COALESCE(pr.display_name, 'مستخدم') AS name, pr.public_id
        FROM public.cup_event_payouts p LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
       WHERE p.event_id = ev.id AND p.rank <= 3 ORDER BY p.rank
    LOOP
      win_text := win_text || COALESCE(medals[r.rank], '🏅') || ' ' || r.name ||
                  ' (ID ' || COALESCE(r.public_id, '—') || ') — ' || r.coins || ' كوينز' || E'\n';
      IF r.rank = 1 THEN champion := r.name; END IF;
    END LOOP;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'rank', p.rank, 'coins', p.coins, 'score', p.score,
             'name', COALESCE(pr.display_name, 'مستخدم'),
             'public_id', pr.public_id, 'avatar_url', pr.avatar_url) ORDER BY p.rank), '[]'::jsonb)
      INTO winners
      FROM public.cup_event_payouts p LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
     WHERE p.event_id = ev.id AND p.rank <= 10;

    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    SELECT p.beneficiary_user_id, 'event_prize', '🎉 مبروك! فزت في ' || ev.title,
           'مركزك ' || p.rank || ' وجائزتك ' || p.coins || ' كوينز — شكرًا لمشاركتك ودعمك!',
           jsonb_build_object('event', ev.title, 'rank', p.rank, 'coins', p.coins)
      FROM public.cup_event_payouts p WHERE p.event_id = ev.id;

    INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
    VALUES ('🎉👑 أبطال ' || ev.title,
            CASE WHEN win_text = '' THEN 'انتهى الحدث دون مشاركين مؤهلين — ننتظرك في الحدث القادم!'
                 ELSE '🏆 تهانينا الحارة لأبطال الحدث! تألقتم وصنعتم المنافسة.' || E'\n\n' || win_text ||
                      E'\n' || 'شكرًا من القلب لكل مشارك ولكل داعم كريم 💛' ||
                      E'\n' || 'والحدث القادم بدأ الآن بتصميم جديد… استعدوا للتاج القادم! 🔥' END,
            ev.image_url, 'event_result', ev.id,
            jsonb_build_object('event', ev.title, 'winners', winners, 'champion', champion, 'celebration', true))
    ON CONFLICT (event_id, kind) WHERE event_id IS NOT NULL DO NOTHING;

    UPDATE public.banners SET is_active = false WHERE kind IN ('event_winners','event_start') AND is_active;
    IF win_text <> '' THEN
      INSERT INTO public.banners (title, subtitle, image_url, link_url, kind, is_active, sort_order, metadata)
      VALUES ('👑 أبطال ' || ev.title, COALESCE(champion, '') || ' يتصدّر التاج — مبروك للفائزين!',
              ev.image_url, '/crown', 'event_winners', true, 0,
              jsonb_build_object('event', ev.title, 'winners', winners, 'champion', champion));
    END IF;

    nxt := public.spawn_next_event(ev.title);
    PERFORM public.purge_event(ev.id);
    IF nxt.id IS NOT NULL THEN
      SELECT MAX(coins) INTO top_prize FROM public.cup_event_prizes WHERE event_id = nxt.id;
      INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
      VALUES ('🔥 بدأ حدث جديد: ' || nxt.title,
              COALESCE(NULLIF(nxt.subtitle, ''), NULLIF(nxt.description, ''), 'حدث جديد مفتوح الآن — شارك وتنافس على الجوائز.') ||
              CASE WHEN top_prize IS NULL THEN '' ELSE E'\n' || 'أعلى جائزة: ' || top_prize || ' كوينز 🏆' END,
              nxt.image_url, 'event_start', nxt.id,
              jsonb_build_object('event', nxt.title, 'event_id', nxt.id, 'starts_at', nxt.starts_at,
                                 'ends_at', nxt.ends_at, 'top_prize', top_prize))
      ON CONFLICT (event_id, kind) WHERE event_id IS NOT NULL DO NOTHING;
      INSERT INTO public.banners (title, subtitle, image_url, link_url, kind, is_active, sort_order, metadata)
      VALUES ('🔥 ' || nxt.title, 'الحدث بدأ الآن — شارك وتنافس على التاج',
              nxt.image_url, '/events/' || nxt.id::text, 'event_start', true, 1,
              jsonb_build_object('event_id', nxt.id, 'starts_at', nxt.starts_at, 'ends_at', nxt.ends_at, 'top_prize', top_prize));
      changed := changed + 1;
    END IF;
  END LOOP;
  UPDATE public.cup_events SET status = 'active', updated_at = now()
   WHERE status = 'scheduled' AND starts_at <= now();
  FOR ev IN SELECT * FROM public.cup_events WHERE status = 'finished' LOOP
    PERFORM public.purge_event(ev.id);
  END LOOP;
  RETURN changed;
END $$;
REVOKE EXECUTE ON FUNCTION public.events_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.events_tick() TO service_role;