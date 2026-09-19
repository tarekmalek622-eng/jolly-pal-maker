-- ============ 1) جلسات يومية ============
CREATE TABLE IF NOT EXISTS public.wheel_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_rounds integer NOT NULL DEFAULT 0,
  max_rounds integer NOT NULL DEFAULT 1143,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wheel_sessions TO authenticated, anon;
GRANT ALL ON public.wheel_sessions TO service_role;
ALTER TABLE public.wheel_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wheel_sessions_read" ON public.wheel_sessions;
CREATE POLICY "wheel_sessions_read" ON public.wheel_sessions FOR SELECT USING (true);

-- ============ 2) أعمدة الجولة ============
ALTER TABLE public.wheel_rounds
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.wheel_sessions(id),
  ADD COLUMN IF NOT EXISTS session_round_no integer,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_bets integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_payout bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

-- ============ 3) نتائج اليوم لكل لاعب ============
CREATE TABLE IF NOT EXISTS public.wheel_daily_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.wheel_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  total_bet bigint NOT NULL DEFAULT 0,
  total_payout bigint NOT NULL DEFAULT 0,
  net_result bigint NOT NULL DEFAULT 0,
  rank integer,
  reward_coins bigint NOT NULL DEFAULT 0,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
GRANT SELECT ON public.wheel_daily_results TO authenticated;
GRANT ALL ON public.wheel_daily_results TO service_role;
ALTER TABLE public.wheel_daily_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wheel_daily_results_read" ON public.wheel_daily_results;
CREATE POLICY "wheel_daily_results_read" ON public.wheel_daily_results FOR SELECT TO authenticated USING (true);

-- ============ 4) فهارس الأداء ============
CREATE INDEX IF NOT EXISTS idx_wheel_bets_round ON public.wheel_bets(round_id);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_round_slot ON public.wheel_bets(round_id, slot_key);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_user_created ON public.wheel_bets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_rounds_status_created ON public.wheel_rounds(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_rounds_session ON public.wheel_rounds(session_id, session_round_no DESC);

-- ============ 5) جلسة اليوم ============
CREATE OR REPLACE FUNCTION public.wheel_session_today()
RETURNS public.wheel_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s public.wheel_sessions;
BEGIN
  SELECT * INTO s FROM public.wheel_sessions WHERE session_date = current_date;
  IF s.id IS NULL THEN
    INSERT INTO public.wheel_sessions (session_date) VALUES (current_date)
      ON CONFLICT (session_date) DO NOTHING;
    SELECT * INTO s FROM public.wheel_sessions WHERE session_date = current_date;
  END IF;
  RETURN s;
END $$;

-- ============ 6) تسوية الجولة: مطالبة الحالة + دفعات + idempotent ============
CREATE OR REPLACE FUNCTION public.wheel_settle(_round_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r public.wheel_rounds;
  total numeric := 0;
  ticket numeric;
  slot jsonb;
  win_key text := NULL;
  mult numeric := 0;
BEGIN
  -- مطالبة ذرّية: جولة مفتوحة انتهى وقتها، أو جولة معلّقة في المعالجة أكثر من 20 ثانية
  UPDATE public.wheel_rounds
     SET status = 'processing',
         processing_started_at = now(),
         attempts = attempts + 1
   WHERE id = _round_id
     AND (status = 'betting'
          OR (status = 'processing' AND processing_started_at < now() - interval '20 seconds'))
  RETURNING * INTO r;

  IF r.id IS NULL THEN
    RETURN; -- إما مُسوّاة بالفعل أو تحت المعالجة الآن
  END IF;

  -- النتيجة تُثبّت مرة واحدة فقط ولا تتأثر بحجم أو مكان الرهانات
  win_key := r.winning_key;
  IF win_key IS NULL THEN
    FOR slot IN SELECT * FROM jsonb_array_elements(r.slots) LOOP
      total := total + coalesce((slot->>'weight')::numeric, 1);
    END LOOP;
    ticket := random() * greatest(total, 0.000001);
    FOR slot IN SELECT * FROM jsonb_array_elements(r.slots) LOOP
      ticket := ticket - coalesce((slot->>'weight')::numeric, 1);
      IF win_key IS NULL AND ticket <= 0 THEN win_key := slot->>'key'; END IF;
    END LOOP;
    win_key := coalesce(win_key, r.slots->0->>'key');
    UPDATE public.wheel_rounds SET winning_key = win_key WHERE id = r.id;
  END IF;

  SELECT coalesce((s->>'multiplier')::numeric, 0) INTO mult
    FROM jsonb_array_elements(r.slots) s WHERE s->>'key' = win_key;
  mult := coalesce(mult, 0);

  -- (أ) تحديد جوائز الرهانات الفائزة التي لم تُدفع بعد — دفعة واحدة
  WITH winners AS (
    UPDATE public.wheel_bets b
       SET payout = floor(b.amount * mult)::bigint
     WHERE b.round_id = r.id AND b.slot_key = win_key AND b.payout = 0 AND mult > 0
    RETURNING b.user_id, b.payout
  ), per_user AS (
    SELECT user_id, sum(payout)::bigint AS prize FROM winners GROUP BY user_id
  ), paid AS (
    UPDATE public.coin_wallets w
       SET coins = w.coins + p.prize, updated_at = now()
      FROM per_user p
     WHERE w.user_id = p.user_id
    RETURNING w.user_id, p.prize, w.coins AS after_balance
  )
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  SELECT user_id, 'game', prize, after_balance - prize, after_balance, 'wheel:win:' || r.id::text
    FROM paid;

  -- (ب) إجماليات الجولة + إغلاقها
  UPDATE public.wheel_rounds ro
     SET status = 'finished',
         settled_at = coalesce(ro.settled_at, now()),
         processing_started_at = NULL,
         last_error = NULL,
         total_bets = agg.cnt,
         total_amount = agg.amount,
         total_payout = agg.payout
    FROM (
      SELECT count(*)::int AS cnt,
             coalesce(sum(amount), 0)::bigint AS amount,
             coalesce(sum(payout), 0)::bigint AS payout
        FROM public.wheel_bets WHERE round_id = r.id
    ) agg
   WHERE ro.id = r.id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.wheel_rounds SET last_error = SQLERRM WHERE id = _round_id;
  RAISE;
END $$;

-- ============ 7) نبضة اللعبة: خفيفة + استرجاع تلقائي ============
CREATE OR REPLACE FUNCTION public.wheel_tick()
RETURNS public.wheel_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  s jsonb := public.wheel_settings();
  sess public.wheel_sessions;
  r public.wheel_rounds;
  stuck public.wheel_rounds;
  dur integer := greatest(coalesce((s->>'duration_seconds')::integer, 10), 5);
  gap integer := greatest(coalesce((s->>'result_seconds')::integer, 3), 1);
BEGIN
  IF coalesce((s->>'enabled')::boolean, true) = false THEN
    RAISE EXCEPTION 'لعبة العجلة موقوفة حاليًا';
  END IF;

  -- نبضة واحدة فقط في اللحظة: بقية العملاء يقرأون الحالة بدون انتظار
  IF NOT pg_try_advisory_xact_lock(hashtext('wheel_tick')) THEN
    SELECT * INTO r FROM public.wheel_rounds ORDER BY created_at DESC LIMIT 1;
    RETURN r;
  END IF;

  -- استرجاع أي جولة عالقة في المعالجة
  FOR stuck IN
    SELECT * FROM public.wheel_rounds
     WHERE status = 'processing' AND processing_started_at < now() - interval '20 seconds'
     ORDER BY created_at LIMIT 3
  LOOP
    PERFORM public.wheel_settle(stuck.id);
  END LOOP;

  SELECT * INTO r FROM public.wheel_rounds
   WHERE status IN ('betting','processing') ORDER BY created_at DESC LIMIT 1;

  IF r.id IS NOT NULL AND r.status = 'betting' AND r.ends_at <= now() THEN
    PERFORM public.wheel_settle(r.id);
    SELECT * INTO r FROM public.wheel_rounds WHERE id = r.id;
  END IF;

  IF r.id IS NULL OR r.status = 'finished' THEN
    SELECT * INTO r FROM public.wheel_rounds ORDER BY created_at DESC LIMIT 1;
    IF r.id IS NULL OR (r.status = 'finished'
        AND coalesce(r.settled_at, r.ends_at) + make_interval(secs => gap) <= now()) THEN
      sess := public.wheel_session_today();
      IF sess.status = 'active' AND sess.total_rounds < sess.max_rounds THEN
        UPDATE public.wheel_sessions
           SET total_rounds = total_rounds + 1, updated_at = now()
         WHERE id = sess.id
        RETURNING * INTO sess;
        INSERT INTO public.wheel_rounds (slots, ends_at, session_id, session_round_no)
          VALUES (coalesce(s->'slots', '[]'::jsonb), now() + make_interval(secs => dur),
                  sess.id, sess.total_rounds)
          RETURNING * INTO r;
      ELSIF sess.status = 'active' AND sess.total_rounds >= sess.max_rounds THEN
        UPDATE public.wheel_sessions SET status = 'closed', ended_at = now(), updated_at = now()
         WHERE id = sess.id;
      END IF;
    END IF;
  END IF;
  RETURN r;
END $$;

-- ============ 8) حالة الجولة للواجهة: استعلام واحد مجمّع ============
CREATE OR REPLACE FUNCTION public.wheel_round_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.wheel_rounds;
  sess public.wheel_sessions;
BEGIN
  r := public.wheel_tick();
  IF r.id IS NULL THEN RETURN jsonb_build_object('round', NULL); END IF;
  SELECT * INTO sess FROM public.wheel_sessions WHERE id = r.session_id;
  RETURN jsonb_build_object(
    'round', jsonb_build_object(
      'id', r.id, 'round_no', coalesce(r.session_round_no, r.round_no), 'status', r.status,
      'slots', r.slots, 'winning_key', r.winning_key, 'ends_at', r.ends_at,
      'settled_at', r.settled_at, 'total_bets', r.total_bets,
      'total_amount', r.total_amount, 'total_payout', r.total_payout),
    'session', CASE WHEN sess.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', sess.id, 'date', sess.session_date, 'round', sess.total_rounds,
      'max_rounds', sess.max_rounds, 'status', sess.status) END,
    'slot_totals', coalesce((
      SELECT jsonb_object_agg(slot_key, jsonb_build_object('total', total, 'players', players))
        FROM (SELECT slot_key, sum(amount)::bigint AS total, count(DISTINCT user_id)::int AS players
                FROM public.wheel_bets WHERE round_id = r.id GROUP BY slot_key) t
    ), '{}'::jsonb),
    'mine', coalesce((
      SELECT jsonb_object_agg(slot_key, amount) FROM (
        SELECT slot_key, sum(amount)::bigint AS amount FROM public.wheel_bets
         WHERE round_id = r.id AND user_id = uid GROUP BY slot_key) m
    ), '{}'::jsonb),
    'my_payout', coalesce((SELECT sum(payout)::bigint FROM public.wheel_bets
       WHERE round_id = r.id AND user_id = uid), 0)
  );
END $$;

-- ============ 9) أفضل 10 يوميًا (صافي النتيجة) ============
CREATE OR REPLACE FUNCTION public.wheel_daily_top(_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, public_id text, display_name text, avatar_url text,
              total_bet bigint, gross_win bigint, net_result bigint, rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH agg AS (
    SELECT b.user_id,
           coalesce(sum(b.amount), 0)::bigint AS total_bet,
           coalesce(sum(b.payout), 0)::bigint AS gross_win
      FROM public.wheel_bets b
      JOIN public.wheel_rounds r ON r.id = b.round_id
      JOIN public.wheel_sessions s ON s.id = r.session_id AND s.session_date = current_date
     GROUP BY b.user_id
  )
  SELECT a.user_id, p.public_id, p.display_name, p.avatar_url,
         a.total_bet, a.gross_win, (a.gross_win - a.total_bet)::bigint AS net_result,
         row_number() OVER (ORDER BY (a.gross_win - a.total_bet) DESC)::int AS rank
    FROM agg a JOIN public.profiles p ON p.id = a.user_id
   ORDER BY net_result DESC
   LIMIT greatest(coalesce(_limit, 10), 1)
$$;

-- ============ 10) تسوية نهاية اليوم (idempotent) ============
CREATE OR REPLACE FUNCTION public.wheel_settle_day(_session_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  sess public.wheel_sessions;
  pct numeric := coalesce((public.wheel_settings()->>'daily_reward_percent')::numeric, 5);
  rewarded integer := 0;
  rec record;
  bal bigint;
BEGIN
  SELECT * INTO sess FROM public.wheel_sessions WHERE id = _session_id FOR UPDATE;
  IF sess.id IS NULL THEN RAISE EXCEPTION 'جلسة غير موجودة'; END IF;

  -- لا تُسوّى جلسة اليوم إلا بعد إغلاقها
  IF sess.status <> 'closed' THEN
    UPDATE public.wheel_sessions SET status = 'closed', ended_at = now(), updated_at = now()
     WHERE id = sess.id;
  END IF;

  INSERT INTO public.wheel_daily_results (session_id, user_id, total_bet, total_payout, net_result, rank)
  SELECT sess.id, t.user_id, t.total_bet, t.gross_win, t.net_result,
         row_number() OVER (ORDER BY t.net_result DESC)::int
    FROM (
      SELECT b.user_id,
             coalesce(sum(b.amount),0)::bigint AS total_bet,
             coalesce(sum(b.payout),0)::bigint AS gross_win,
             (coalesce(sum(b.payout),0) - coalesce(sum(b.amount),0))::bigint AS net_result
        FROM public.wheel_bets b
        JOIN public.wheel_rounds r ON r.id = b.round_id
       WHERE r.session_id = sess.id
       GROUP BY b.user_id
    ) t
  ON CONFLICT (session_id, user_id) DO NOTHING;

  -- المكافأة: نسبة من صافي النتيجة الموجب فقط، ولا تُدفع مرتين
  FOR rec IN
    SELECT * FROM public.wheel_daily_results
     WHERE session_id = sess.id AND rewarded_at IS NULL AND net_result > 0
  LOOP
    SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = rec.user_id FOR UPDATE;
    IF bal IS NULL THEN CONTINUE; END IF;
    UPDATE public.coin_wallets SET coins = bal + floor(rec.net_result * pct / 100)::bigint,
           updated_at = now() WHERE user_id = rec.user_id;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
      VALUES (rec.user_id, 'reward', floor(rec.net_result * pct / 100)::bigint, bal,
              bal + floor(rec.net_result * pct / 100)::bigint, 'wheel:daily:' || sess.id::text);
    UPDATE public.wheel_daily_results
       SET reward_coins = floor(rec.net_result * pct / 100)::bigint, rewarded_at = now()
     WHERE id = rec.id;
    rewarded := rewarded + 1;
  END LOOP;

  UPDATE public.wheel_sessions SET settled_at = now(), updated_at = now() WHERE id = sess.id;
  RETURN rewarded;
END $$;

REVOKE ALL ON FUNCTION public.wheel_settle_day(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_settle_day(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.wheel_session_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_session_today() TO service_role;
GRANT EXECUTE ON FUNCTION public.wheel_round_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_daily_top(integer) TO authenticated;

-- ============ 11) VIP 6/7/8 + حماية المايك ============
ALTER TABLE public.vip_levels
  ADD COLUMN IF NOT EXISTS mic_protection integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrance_animation text;

INSERT INTO public.vip_levels (level, name, price, duration_days, perks, is_active, mic_protection, name_effect)
VALUES
  (6, 'VIP 6', 20000000000, 30, '["إطار ملكي حصري","شارة VIP 6","تأثير دخول","حماية مايك مستوى 1"]'::jsonb, true, 1, 'vip6'),
  (7, 'VIP 7', 50000000000, 30, '["إطار أسطوري","شارة VIP 7","تأثير دخول متقدم","حماية مايك مستوى 2"]'::jsonb, true, 2, 'vip7'),
  (8, 'VIP 8', 120000000000, 30, '["إطار إمبراطوري","شارة VIP 8","تأثير دخول حصري","حماية مايك مستوى 3"]'::jsonb, true, 3, 'vip8')
ON CONFLICT (level) DO UPDATE SET
  mic_protection = EXCLUDED.mic_protection,
  is_active = true;
