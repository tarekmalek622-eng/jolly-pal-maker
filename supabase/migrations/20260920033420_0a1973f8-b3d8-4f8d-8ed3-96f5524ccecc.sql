-- رسائل التاج: رسائل رسمية من التطبيق
CREATE TABLE IF NOT EXISTS public.crown_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  kind TEXT NOT NULL DEFAULT 'announcement',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_id UUID REFERENCES public.cup_events(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crown_messages TO authenticated;
GRANT ALL ON public.crown_messages TO service_role;
ALTER TABLE public.crown_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crown read" ON public.crown_messages FOR SELECT TO authenticated USING (is_active);
CREATE INDEX IF NOT EXISTS idx_crown_messages_created ON public.crown_messages (created_at DESC);
CREATE TRIGGER trg_crown_messages_updated BEFORE UPDATE ON public.crown_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- تسلسل الأحداث تلقائيًا: إنهاء المنتهي، توزيع الجوائز، نشر رسالة التاج، وبدء التالي فورًا
CREATE OR REPLACE FUNCTION public.events_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ev public.cup_events; changed INT := 0; nxt public.cup_events;
        win_text TEXT; dur INTERVAL; r RECORD; medals TEXT[] := ARRAY['🥇','🥈','🥉'];
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('events_tick')) THEN RETURN 0; END IF;

  FOR ev IN SELECT * FROM public.cup_events WHERE status = 'active' AND ends_at <= now() LOOP
    PERFORM public.settle_cup_event(ev.id, NULL);
    UPDATE public.cup_events SET status = 'ended', updated_at = now() WHERE id = ev.id;
    changed := changed + 1;

    win_text := '';
    FOR r IN
      SELECT p.rank, p.coins, COALESCE(pr.display_name, 'مستخدم') AS name, pr.public_id
        FROM public.cup_event_payouts p
        LEFT JOIN public.profiles pr ON pr.id = p.beneficiary_user_id
       WHERE p.event_id = ev.id AND p.rank <= 3 ORDER BY p.rank
    LOOP
      win_text := win_text || COALESCE(medals[r.rank], '🏅') || ' ' || r.name ||
                  ' (ID ' || COALESCE(r.public_id, '—') || ') — ' || r.coins || ' كوينز' || E'\n';
    END LOOP;

    INSERT INTO public.crown_messages (title, body, image_url, kind, event_id, metadata)
    VALUES ('👑 نتائج ' || ev.title,
            CASE WHEN win_text = '' THEN 'انتهى الحدث دون مشاركين مؤهلين.'
                 ELSE 'انتهى الحدث وتوزّعت الجوائز على الفائزين:' || E'\n' || win_text END,
            ev.image_url, 'event_result', ev.id, jsonb_build_object('event', ev.title));

    -- بدء الحدث التالي فورًا بنفس المدة دون أي فترة توقف
    dur := ev.ends_at - ev.starts_at;
    SELECT * INTO nxt FROM public.cup_events
      WHERE status = 'scheduled' ORDER BY starts_at LIMIT 1;
    IF nxt.id IS NOT NULL THEN
      UPDATE public.cup_events
         SET status = 'active', starts_at = now(),
             ends_at = now() + GREATEST(nxt.ends_at - nxt.starts_at, interval '1 day'),
             updated_at = now()
       WHERE id = nxt.id;
    ELSE
      -- لا يوجد حدث مجهّز: أعِد تشغيل نفس الحدث بجولة جديدة فورًا
      INSERT INTO public.cup_events (title, subtitle, description, image_url, ranking_kind,
                                     starts_at, ends_at, status, rules, points_note)
      VALUES (ev.title, ev.subtitle, ev.description, ev.image_url, ev.ranking_kind,
              now(), now() + GREATEST(dur, interval '1 day'), 'active', ev.rules, ev.points_note)
      RETURNING * INTO nxt;
      INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
        SELECT nxt.id, rank_from, rank_to, coins, label
          FROM public.cup_event_prizes WHERE event_id = ev.id;
    END IF;

    INSERT INTO public.crown_messages (title, body, image_url, kind, event_id)
    VALUES ('🔥 بدأ حدث جديد: ' || nxt.title,
            'الحدث الجديد مفتوح الآن — شارك من قسم الاستكشاف وتنافس على الجوائز.',
            nxt.image_url, 'event_start', nxt.id);
    changed := changed + 1;
  END LOOP;

  -- تنشيط أي حدث مجهّز حان وقته
  UPDATE public.cup_events SET status = 'active', updated_at = now()
   WHERE status = 'scheduled' AND starts_at <= now();
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.events_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.events_tick() TO service_role;