CREATE OR REPLACE FUNCTION public.events_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ev public.cup_events; changed INT := 0; nxt public.cup_events;
        win_text TEXT; dur INTERVAL; r RECORD; medals TEXT[] := ARRAY['🥇','🥈','🥉'];
        winners jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('events_tick')) THEN RETURN 0; END IF;

  FOR ev IN SELECT * FROM public.cup_events WHERE status IN ('active','settling') AND ends_at <= now() LOOP
    PERFORM public.settle_cup_event(ev.id, NULL);
    changed := changed + 1;

    win_text := '';
    FOR r IN
      SELECT p.rank, p.coins, p.score, COALESCE(pr.display_name, 'مستخدم') AS name, pr.public_id
        FROM public.cup_event_payouts p
        LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
       WHERE p.event_id = ev.id AND p.rank <= 3 ORDER BY p.rank
    LOOP
      win_text := win_text || COALESCE(medals[r.rank], '🏅') || ' ' || r.name ||
                  ' (ID ' || COALESCE(r.public_id, '—') || ') — ' || r.coins || ' كوينز' || E'\n';
    END LOOP;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'rank', p.rank, 'coins', p.coins, 'score', p.score,
             'name', COALESCE(pr.display_name, 'مستخدم'),
             'public_id', pr.public_id, 'avatar_url', pr.avatar_url) ORDER BY p.rank), '[]'::jsonb)
      INTO winners
      FROM public.cup_event_payouts p
      LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
     WHERE p.event_id = ev.id AND p.rank <= 10;

    INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
    VALUES ('👑 نتائج ' || ev.title,
            CASE WHEN win_text = '' THEN 'انتهى الحدث دون مشاركين مؤهلين.'
                 ELSE 'انتهى الحدث وتوزّعت الجوائز على الفائزين — مبروك للأبطال!' END,
            ev.image_url, 'event_result', ev.id,
            jsonb_build_object('event', ev.title, 'event_id', ev.id, 'winners', winners));

    dur := GREATEST(ev.ends_at - ev.starts_at, interval '1 day');
    SELECT * INTO nxt FROM public.cup_events WHERE status = 'scheduled' ORDER BY starts_at LIMIT 1;
    IF nxt.id IS NOT NULL THEN
      UPDATE public.cup_events
         SET status = 'active', starts_at = now(),
             ends_at = now() + GREATEST(nxt.ends_at - nxt.starts_at, interval '1 day'),
             updated_at = now()
       WHERE id = nxt.id RETURNING * INTO nxt;
    ELSE
      INSERT INTO public.cup_events (title, subtitle, description, image_url, ranking_kind,
                                     starts_at, ends_at, status, rules, points_note)
      VALUES (ev.title, ev.subtitle, ev.description, ev.image_url, ev.ranking_kind,
              now(), now() + dur, 'active', ev.rules, ev.points_note)
      RETURNING * INTO nxt;
      INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
        SELECT nxt.id, rank_from, rank_to, coins, label
          FROM public.cup_event_prizes WHERE event_id = ev.id;
    END IF;

    INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
    VALUES ('🔥 بدأ حدث جديد: ' || nxt.title,
            COALESCE(NULLIF(nxt.subtitle, ''), NULLIF(nxt.description, ''), 'حدث جديد مفتوح الآن — شارك وتنافس على الجوائز.'),
            nxt.image_url, 'event_start', nxt.id,
            jsonb_build_object('event', nxt.title, 'event_id', nxt.id,
                               'starts_at', nxt.starts_at, 'ends_at', nxt.ends_at,
                               'top_prize', (SELECT MAX(coins) FROM public.cup_event_prizes WHERE event_id = nxt.id)));
    changed := changed + 1;
  END LOOP;

  UPDATE public.cup_events SET status = 'active', updated_at = now()
   WHERE status = 'scheduled' AND starts_at <= now();
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.events_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.events_tick() TO service_role;