
ALTER TABLE public.cup_events ADD COLUMN IF NOT EXISTS style TEXT NOT NULL DEFAULT 'royal';

INSERT INTO public.app_settings (key, value)
VALUES ('event_templates', jsonb_build_object(
  'rotation_index', 0,
  'templates', jsonb_build_array(
    jsonb_build_object('title','تاج الدعم الذهبي','subtitle','الأكثر دعمًا يرتقي العرش','description','ادعم أصدقاءك بالهدايا واصعد لقائمة الدعم الذهبية.','ranking_kind','supporters','style','royal','duration_days',2,'rules','تُحسب نقاطك من قيمة الهدايا التي ترسلها خلال مدة الحدث.','points_note','كل 1 كوينز هدية = 1 نقطة','prizes',jsonb_build_array(
      jsonb_build_object('rank_from',1,'rank_to',1,'coins',5000000,'label','المركز الأول'),
      jsonb_build_object('rank_from',2,'rank_to',2,'coins',2500000,'label','المركز الثاني'),
      jsonb_build_object('rank_from',3,'rank_to',3,'coins',1000000,'label','المركز الثالث'),
      jsonb_build_object('rank_from',4,'rank_to',10,'coins',300000,'label','المراكز 4–10'))),
    jsonb_build_object('title','نجوم الاستقبال','subtitle','الأكثر استلامًا للهدايا','description','استقبل الهدايا من جمهورك وتصدّر قائمة النجوم.','ranking_kind','receivers','style','rose','duration_days',2,'rules','تُحسب نقاطك من قيمة الهدايا التي تستلمها خلال المدة.','points_note','كل 1 كوينز هدية مستلمة = 1 نقطة','prizes',jsonb_build_array(
      jsonb_build_object('rank_from',1,'rank_to',1,'coins',4000000,'label','المركز الأول'),
      jsonb_build_object('rank_from',2,'rank_to',2,'coins',2000000,'label','المركز الثاني'),
      jsonb_build_object('rank_from',3,'rank_to',3,'coins',900000,'label','المركز الثالث'),
      jsonb_build_object('rank_from',4,'rank_to',10,'coins',250000,'label','المراكز 4–10'))),
    jsonb_build_object('title','معركة الغرف','subtitle','أقوى غرفة تفوز','description','تنافس مع غرفتك على أعلى دعم داخل الغرف.','ranking_kind','rooms','style','ocean','duration_days',3,'rules','تُحسب نقاط الغرفة من مجموع الهدايا داخلها.','points_note','كل 1 كوينز داخل الغرفة = 1 نقطة','prizes',jsonb_build_array(
      jsonb_build_object('rank_from',1,'rank_to',1,'coins',6000000,'label','الغرفة الأولى'),
      jsonb_build_object('rank_from',2,'rank_to',2,'coins',3000000,'label','الغرفة الثانية'),
      jsonb_build_object('rank_from',3,'rank_to',3,'coins',1200000,'label','الغرفة الثالثة'),
      jsonb_build_object('rank_from',4,'rank_to',10,'coins',400000,'label','الغرف 4–10'))),
    jsonb_build_object('title','ليل الألماس','subtitle','سباق الشاحنين','description','اشحن رصيدك وتنافس على صدارة الألماس.','ranking_kind','topups','style','violet','duration_days',3,'rules','تُحسب نقاطك من الكوينز المشحونة المعتمدة خلال المدة.','points_note','كل 1 كوينز شحن = 1 نقطة','prizes',jsonb_build_array(
      jsonb_build_object('rank_from',1,'rank_to',1,'coins',5500000,'label','المركز الأول'),
      jsonb_build_object('rank_from',2,'rank_to',2,'coins',2600000,'label','المركز الثاني'),
      jsonb_build_object('rank_from',3,'rank_to',3,'coins',1100000,'label','المركز الثالث'),
      jsonb_build_object('rank_from',4,'rank_to',10,'coins',320000,'label','المراكز 4–10'))),
    jsonb_build_object('title','أسطورة الألعاب','subtitle','أعلى مكاسب في الألعاب','description','العب بذكاء وتصدّر قائمة مكاسب الألعاب.','ranking_kind','game_wins','style','emerald','duration_days',2,'rules','تُحسب نقاطك من صافي مكاسبك في الألعاب خلال المدة.','points_note','كل 1 كوينز ربح صافي = 1 نقطة','prizes',jsonb_build_array(
      jsonb_build_object('rank_from',1,'rank_to',1,'coins',3500000,'label','المركز الأول'),
      jsonb_build_object('rank_from',2,'rank_to',2,'coins',1800000,'label','المركز الثاني'),
      jsonb_build_object('rank_from',3,'rank_to',3,'coins',800000,'label','المركز الثالث'),
      jsonb_build_object('rank_from',4,'rank_to',10,'coins',220000,'label','المراكز 4–10'))),
    jsonb_build_object('title','عاصفة الكرم','subtitle','48 ساعة من الدعم الجنوني','description','عاصفة دعم قصيرة وجوائز سريعة — من يصمد للنهاية؟','ranking_kind','supporters','style','fire','duration_days',1,'rules','تُحسب نقاطك من قيمة الهدايا المرسلة خلال 24 ساعة.','points_note','كل 1 كوينز هدية = 1 نقطة','prizes',jsonb_build_array(
      jsonb_build_object('rank_from',1,'rank_to',1,'coins',3000000,'label','المركز الأول'),
      jsonb_build_object('rank_from',2,'rank_to',2,'coins',1500000,'label','المركز الثاني'),
      jsonb_build_object('rank_from',3,'rank_to',3,'coins',700000,'label','المركز الثالث'),
      jsonb_build_object('rank_from',4,'rank_to',10,'coins',200000,'label','المراكز 4–10'))))))
ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.event_templates()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'event_templates'), '{}'::jsonb)
$$;

REVOKE EXECUTE ON FUNCTION public.event_templates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_templates() TO authenticated, service_role;

-- إنشاء حدث جديد من القوالب بالتدوير (تصميم مختلف كل مرة)
CREATE OR REPLACE FUNCTION public.spawn_next_event(_avoid_title TEXT DEFAULT NULL)
RETURNS public.cup_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; tpl jsonb; arr jsonb; n INT; idx INT; ev public.cup_events; p jsonb; tries INT := 0;
BEGIN
  s := public.event_templates();
  arr := COALESCE(s->'templates', '[]'::jsonb);
  n := jsonb_array_length(arr);
  IF n = 0 THEN RETURN NULL; END IF;
  idx := COALESCE((s->>'rotation_index')::INT, 0);
  LOOP
    idx := (idx + 1) % n;
    tpl := arr->idx;
    tries := tries + 1;
    EXIT WHEN tries >= n OR _avoid_title IS NULL OR (tpl->>'title') <> _avoid_title;
  END LOOP;

  UPDATE public.app_settings
     SET value = value || jsonb_build_object('rotation_index', idx), updated_at = now()
   WHERE key = 'event_templates';

  INSERT INTO public.cup_events (title, subtitle, description, ranking_kind, style,
                                 starts_at, ends_at, status, rules, points_note)
  VALUES (tpl->>'title', tpl->>'subtitle', tpl->>'description',
          COALESCE(tpl->>'ranking_kind','supporters'), COALESCE(tpl->>'style','royal'),
          now(), now() + (GREATEST(COALESCE((tpl->>'duration_days')::INT, 2), 1) || ' days')::interval,
          'active', tpl->>'rules', tpl->>'points_note')
  RETURNING * INTO ev;

  FOR p IN SELECT * FROM jsonb_array_elements(COALESCE(tpl->'prizes','[]'::jsonb)) LOOP
    INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
    VALUES (ev.id, (p->>'rank_from')::INT, (p->>'rank_to')::INT, (p->>'coins')::BIGINT, p->>'label');
  END LOOP;

  RETURN ev;
END $$;

REVOKE EXECUTE ON FUNCTION public.spawn_next_event(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spawn_next_event(TEXT) TO service_role;

-- حذف حدث منتهٍ نهائيًا مع الحفاظ على رسائل التاج والبانرات
CREATE OR REPLACE FUNCTION public.purge_event(_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crown_messages SET event_id = NULL WHERE event_id = _event_id;
  DELETE FROM public.cup_event_payouts WHERE event_id = _event_id;
  DELETE FROM public.cup_event_prizes WHERE event_id = _event_id;
  DELETE FROM public.cup_events WHERE id = _event_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.purge_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_event(uuid) TO service_role;

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
        FROM public.cup_event_payouts p
        LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
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
      FROM public.cup_event_payouts p
      LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
     WHERE p.event_id = ev.id AND p.rank <= 10;

    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    SELECT p.beneficiary_user_id, 'event_prize',
           '🎉 مبروك! فزت في ' || ev.title,
           'مركزك ' || p.rank || ' وجائزتك ' || p.coins || ' كوينز — شكرًا لمشاركتك ودعمك!',
           jsonb_build_object('event', ev.title, 'rank', p.rank, 'coins', p.coins)
      FROM public.cup_event_payouts p
     WHERE p.event_id = ev.id;

    INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
    VALUES ('🎉👑 أبطال ' || ev.title,
            CASE WHEN win_text = '' THEN 'انتهى الحدث دون مشاركين مؤهلين — ننتظرك في الحدث القادم!'
                 ELSE '🏆 تهانينا الحارة لأبطال الحدث! تألقتم وصنعتم المنافسة.' || E'\n\n' || win_text ||
                      E'\n' || 'شكرًا من القلب لكل مشارك ولكل داعم كريم 💛' ||
                      E'\n' || 'والحدث القادم بدأ الآن بتصميم جديد… استعدوا للتاج القادم! 🔥'
            END,
            ev.image_url, 'event_result', ev.id,
            jsonb_build_object('event', ev.title, 'winners', winners,
                              'champion', champion, 'celebration', true))
    ON CONFLICT (event_id, kind) WHERE event_id IS NOT NULL DO NOTHING;

    UPDATE public.banners SET is_active = false
     WHERE kind IN ('event_winners','event_start') AND is_active;
    IF win_text <> '' THEN
      INSERT INTO public.banners (title, subtitle, image_url, link_url, kind, is_active, sort_order)
      VALUES ('👑 أبطال ' || ev.title, COALESCE(champion, '') || ' يتصدّر التاج — مبروك للفائزين!',
              ev.image_url, '/crown', 'event_winners', true, 0);
    END IF;

    -- حدث جديد بتصميم مختلف، ثم حذف المنتهي نهائيًا
    nxt := public.spawn_next_event(ev.title);
    PERFORM public.purge_event(ev.id);

    IF nxt.id IS NOT NULL THEN
      SELECT MAX(coins) INTO top_prize FROM public.cup_event_prizes WHERE event_id = nxt.id;

      INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
      VALUES ('🔥 بدأ حدث جديد: ' || nxt.title,
              COALESCE(NULLIF(nxt.subtitle, ''), NULLIF(nxt.description, ''),
                       'حدث جديد مفتوح الآن — شارك وتنافس على الجوائز.') ||
              CASE WHEN top_prize IS NULL THEN '' ELSE E'\n' || 'أعلى جائزة: ' || top_prize || ' كوينز 🏆' END,
              nxt.image_url, 'event_start', nxt.id,
              jsonb_build_object('event', nxt.title, 'event_id', nxt.id,
                                 'starts_at', nxt.starts_at, 'ends_at', nxt.ends_at,
                                 'top_prize', top_prize))
      ON CONFLICT (event_id, kind) WHERE event_id IS NOT NULL DO NOTHING;

      INSERT INTO public.banners (title, subtitle, image_url, link_url, kind, is_active, sort_order)
      VALUES ('🔥 ' || nxt.title, 'الحدث بدأ الآن — شارك وتنافس على التاج',
              nxt.image_url, '/events/' || nxt.id::text, 'event_start', true, 1);

      changed := changed + 1;
    END IF;
  END LOOP;

  UPDATE public.cup_events SET status = 'active', updated_at = now()
   WHERE status = 'scheduled' AND starts_at <= now();

  -- تنظيف: أي حدث منتهٍ متبقٍ يُحذف نهائيًا
  FOR ev IN SELECT * FROM public.cup_events WHERE status = 'finished' LOOP
    PERFORM public.purge_event(ev.id);
  END LOOP;

  RETURN changed;
END $$;

REVOKE EXECUTE ON FUNCTION public.events_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.events_tick() TO service_role;
