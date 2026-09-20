CREATE TABLE public.supercar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_rounds integer NOT NULL DEFAULT 0,
  max_rounds integer NOT NULL DEFAULT 1143,
  status text NOT NULL DEFAULT 'active',
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supercar_sessions TO authenticated;
GRANT ALL ON public.supercar_sessions TO service_role;
ALTER TABLE public.supercar_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supercar_sessions_read" ON public.supercar_sessions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.supercar_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.supercar_sessions(id),
  session_round_no integer,
  round_no bigserial NOT NULL,
  status text NOT NULL DEFAULT 'betting',
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  winning_key text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  settled_at timestamptz,
  processing_started_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  total_bets integer NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL DEFAULT 0,
  total_payout bigint NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supercar_rounds TO authenticated;
GRANT ALL ON public.supercar_rounds TO service_role;
ALTER TABLE public.supercar_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supercar_rounds_read" ON public.supercar_rounds FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_supercar_rounds_status ON public.supercar_rounds (status, created_at DESC);
CREATE INDEX idx_supercar_rounds_session ON public.supercar_rounds (session_id, session_round_no DESC);

CREATE TABLE public.supercar_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.supercar_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  slot_key text NOT NULL,
  amount bigint NOT NULL,
  payout bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supercar_bets TO authenticated;
GRANT ALL ON public.supercar_bets TO service_role;
ALTER TABLE public.supercar_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supercar_bets_read" ON public.supercar_bets FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_supercar_bets_round ON public.supercar_bets (round_id);
CREATE INDEX idx_supercar_bets_round_slot ON public.supercar_bets (round_id, slot_key);
CREATE INDEX idx_supercar_bets_user ON public.supercar_bets (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.supercar_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce((SELECT value FROM app_settings WHERE key = 'supercar'), '{}'::jsonb) $$;

CREATE OR REPLACE FUNCTION public.supercar_session_today()
RETURNS supercar_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s public.supercar_sessions;
BEGIN
  SELECT * INTO s FROM public.supercar_sessions WHERE session_date = current_date;
  IF s.id IS NULL THEN
    INSERT INTO public.supercar_sessions (session_date) VALUES (current_date)
      ON CONFLICT (session_date) DO NOTHING;
    SELECT * INTO s FROM public.supercar_sessions WHERE session_date = current_date;
  END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.supercar_settle(_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r public.supercar_rounds;
  total numeric := 0;
  ticket numeric;
  slot jsonb;
  win_key text := NULL;
  mult numeric := 0;
BEGIN
  UPDATE public.supercar_rounds
     SET status = 'processing', processing_started_at = now(), attempts = attempts + 1
   WHERE id = _round_id
     AND (status = 'betting'
          OR (status = 'processing' AND processing_started_at < now() - interval '20 seconds'))
  RETURNING * INTO r;
  IF r.id IS NULL THEN RETURN; END IF;

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
    UPDATE public.supercar_rounds SET winning_key = win_key WHERE id = r.id;
  END IF;

  SELECT coalesce((s->>'multiplier')::numeric, 0) INTO mult
    FROM jsonb_array_elements(r.slots) s WHERE s->>'key' = win_key;
  mult := coalesce(mult, 0);

  WITH winners AS (
    UPDATE public.supercar_bets b SET payout = floor(b.amount * mult)::bigint
     WHERE b.round_id = r.id AND b.slot_key = win_key AND b.payout = 0 AND mult > 0
    RETURNING b.user_id, b.payout
  ), per_user AS (
    SELECT user_id, sum(payout)::bigint AS prize FROM winners GROUP BY user_id
  ), paid AS (
    UPDATE public.coin_wallets w SET coins = w.coins + p.prize, updated_at = now()
      FROM per_user p WHERE w.user_id = p.user_id
    RETURNING w.user_id, p.prize, w.coins AS after_balance
  )
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  SELECT user_id, 'game', prize, after_balance - prize, after_balance, 'supercar:win:' || r.id::text FROM paid;

  UPDATE public.supercar_rounds ro
     SET status = 'finished', settled_at = coalesce(ro.settled_at, now()),
         processing_started_at = NULL, last_error = NULL,
         total_bets = agg.cnt, total_amount = agg.amount, total_payout = agg.payout
    FROM (SELECT count(*)::int AS cnt, coalesce(sum(amount),0)::bigint AS amount,
                 coalesce(sum(payout),0)::bigint AS payout
            FROM public.supercar_bets WHERE round_id = r.id) agg
   WHERE ro.id = r.id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.supercar_rounds SET last_error = SQLERRM WHERE id = _round_id;
  RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.supercar_tick()
RETURNS supercar_rounds LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  s jsonb := public.supercar_settings();
  sess public.supercar_sessions;
  r public.supercar_rounds;
  stuck public.supercar_rounds;
  dur integer := greatest(coalesce((s->>'duration_seconds')::integer, 20), 5);
  gap integer := greatest(coalesce((s->>'result_seconds')::integer, 5), 1);
BEGIN
  IF coalesce((s->>'enabled')::boolean, true) = false THEN
    RAISE EXCEPTION 'لعبة سباق السيارات موقوفة حاليًا';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('supercar_tick')) THEN
    SELECT * INTO r FROM public.supercar_rounds ORDER BY created_at DESC LIMIT 1;
    RETURN r;
  END IF;

  FOR stuck IN SELECT * FROM public.supercar_rounds
     WHERE status = 'processing' AND processing_started_at < now() - interval '20 seconds'
     ORDER BY created_at LIMIT 3
  LOOP
    PERFORM public.supercar_settle(stuck.id);
  END LOOP;

  SELECT * INTO r FROM public.supercar_rounds
   WHERE status IN ('betting','processing') ORDER BY created_at DESC LIMIT 1;

  IF r.id IS NOT NULL AND r.status = 'betting' AND r.ends_at <= now() THEN
    PERFORM public.supercar_settle(r.id);
    SELECT * INTO r FROM public.supercar_rounds WHERE id = r.id;
  END IF;

  IF r.id IS NULL OR r.status = 'finished' THEN
    SELECT * INTO r FROM public.supercar_rounds ORDER BY created_at DESC LIMIT 1;
    IF r.id IS NULL OR (r.status = 'finished'
        AND coalesce(r.settled_at, r.ends_at) + make_interval(secs => gap) <= now()) THEN
      sess := public.supercar_session_today();
      IF sess.status = 'active' AND sess.total_rounds < sess.max_rounds THEN
        UPDATE public.supercar_sessions SET total_rounds = total_rounds + 1, updated_at = now()
         WHERE id = sess.id RETURNING * INTO sess;
        INSERT INTO public.supercar_rounds (slots, ends_at, session_id, session_round_no)
          VALUES (coalesce(s->'slots', '[]'::jsonb), now() + make_interval(secs => dur),
                  sess.id, sess.total_rounds)
          RETURNING * INTO r;
      ELSIF sess.status = 'active' AND sess.total_rounds >= sess.max_rounds THEN
        UPDATE public.supercar_sessions SET status = 'closed', ended_at = now(), updated_at = now()
         WHERE id = sess.id;
      END IF;
    END IF;
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.supercar_bet(_slot_key text, _amount bigint, _room_id uuid DEFAULT NULL::uuid)
RETURNS supercar_bets LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  s jsonb := public.supercar_settings();
  r public.supercar_rounds;
  bal bigint;
  b public.supercar_bets;
  min_bet bigint := coalesce((s->>'min_bet')::bigint, 100);
  max_bet bigint := coalesce((s->>'max_bet')::bigint, 200000000);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF coalesce((s->>'enabled')::boolean, true) = false THEN RAISE EXCEPTION 'لعبة سباق السيارات موقوفة حاليًا'; END IF;
  IF _amount < min_bet OR _amount > max_bet THEN
    RAISE EXCEPTION 'الرهان يجب أن يكون بين % و % كوينز', min_bet, max_bet;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_suspended) THEN
    RAISE EXCEPTION 'حسابك موقوف';
  END IF;

  SELECT * INTO r FROM public.supercar_rounds WHERE status = 'betting' AND ends_at > now()
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'انتهى وقت المراهنة، انتظر الجولة التالية'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.slots) x
                  WHERE x->>'key' = _slot_key AND coalesce((x->>'bettable')::boolean, true)) THEN
    RAISE EXCEPTION 'خانة غير صالحة';
  END IF;

  SELECT coins INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;
  IF bal IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة'; END IF;
  IF bal < _amount THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;

  UPDATE public.coin_wallets SET coins = bal - _amount, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    VALUES (uid, 'game', -_amount, bal, bal - _amount, 'supercar:bet:' || _slot_key);

  INSERT INTO public.supercar_bets (round_id, user_id, room_id, slot_key, amount)
    VALUES (r.id, uid, _room_id, _slot_key, _amount) RETURNING * INTO b;
  RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.supercar_round_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.supercar_rounds;
  sess public.supercar_sessions;
BEGIN
  r := public.supercar_tick();
  IF r.id IS NULL THEN RETURN jsonb_build_object('round', NULL); END IF;
  SELECT * INTO sess FROM public.supercar_sessions WHERE id = r.session_id;
  RETURN jsonb_build_object(
    'round', jsonb_build_object(
      'id', r.id, 'round_no', coalesce(r.session_round_no, r.round_no), 'status', r.status,
      'slots', r.slots,
      'winning_key', CASE WHEN r.status IN ('betting','waiting','processing') THEN NULL ELSE r.winning_key END,
      'ends_at', r.ends_at, 'settled_at', r.settled_at, 'total_bets', r.total_bets,
      'total_amount', r.total_amount, 'total_payout', r.total_payout),
    'session', CASE WHEN sess.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', sess.id, 'date', sess.session_date, 'round', sess.total_rounds,
      'max_rounds', sess.max_rounds, 'status', sess.status) END,
    'slot_totals', coalesce((
      SELECT jsonb_object_agg(slot_key, jsonb_build_object('total', total, 'players', players))
        FROM (SELECT slot_key, sum(amount)::bigint AS total, count(DISTINCT user_id)::int AS players
                FROM public.supercar_bets WHERE round_id = r.id GROUP BY slot_key) t), '{}'::jsonb),
    'mine', coalesce((
      SELECT jsonb_object_agg(slot_key, amount) FROM (
        SELECT slot_key, sum(amount)::bigint AS amount FROM public.supercar_bets
         WHERE round_id = r.id AND user_id = uid GROUP BY slot_key) m), '{}'::jsonb),
    'my_payout', coalesce((SELECT sum(payout)::bigint FROM public.supercar_bets
       WHERE round_id = r.id AND user_id = uid), 0),
    'history', coalesce((SELECT jsonb_agg(h.winning_key ORDER BY h.created_at DESC)
       FROM (SELECT winning_key, created_at FROM public.supercar_rounds
              WHERE winning_key IS NOT NULL AND status = 'finished'
              ORDER BY created_at DESC LIMIT 10) h), '[]'::jsonb),
    'top', coalesce((
      SELECT jsonb_agg(jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url,
                                          'public_id', p.public_id, 'payout', t.payout))
        FROM (SELECT user_id, sum(payout)::bigint AS payout FROM public.supercar_bets
               WHERE round_id = r.id AND payout > 0 GROUP BY user_id
               ORDER BY 2 DESC LIMIT 3) t
        JOIN public.profiles p ON p.id = t.user_id), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.supercar_daily_top(_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, public_id text, display_name text, avatar_url text,
              total_bet bigint, gross_win bigint, net_result bigint, rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH agg AS (
    SELECT b.user_id, sum(b.amount)::bigint AS total_bet, sum(b.payout)::bigint AS gross_win
      FROM public.supercar_bets b
      JOIN public.supercar_rounds r ON r.id = b.round_id
      JOIN public.supercar_sessions s ON s.id = r.session_id AND s.session_date = current_date
     GROUP BY b.user_id
  )
  SELECT a.user_id, p.public_id, p.display_name, p.avatar_url, a.total_bet, a.gross_win,
         (a.gross_win - a.total_bet)::bigint AS net_result,
         rank() OVER (ORDER BY (a.gross_win - a.total_bet) DESC)::int
    FROM agg a JOIN public.profiles p ON p.id = a.user_id
   ORDER BY net_result DESC LIMIT greatest(coalesce(_limit, 10), 1)
$$;

REVOKE ALL ON FUNCTION public.supercar_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supercar_session_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supercar_settle(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.supercar_session_today() TO service_role;
REVOKE ALL ON FUNCTION public.supercar_tick() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supercar_bet(text, bigint, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supercar_round_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supercar_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supercar_daily_top(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supercar_tick(), public.supercar_bet(text, bigint, uuid),
  public.supercar_round_state(), public.supercar_settings(), public.supercar_daily_top(integer)
  TO authenticated, service_role;