CREATE TABLE public.cup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  description text,
  image_url text,
  ranking_kind text NOT NULL CHECK (ranking_kind IN ('supporters','rooms','receivers','topups','game_wins')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','settling','finished','cancelled')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT ON public.cup_events TO authenticated;
GRANT ALL ON public.cup_events TO service_role;
ALTER TABLE public.cup_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can view cup events" ON public.cup_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.cup_event_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cup_events(id) ON DELETE CASCADE,
  rank_from integer NOT NULL CHECK (rank_from BETWEEN 1 AND 100),
  rank_to integer NOT NULL CHECK (rank_to BETWEEN 1 AND 100 AND rank_to >= rank_from),
  coins bigint NOT NULL CHECK (coins >= 0),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, rank_from, rank_to)
);
GRANT SELECT ON public.cup_event_prizes TO authenticated;
GRANT ALL ON public.cup_event_prizes TO service_role;
ALTER TABLE public.cup_event_prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can view cup prizes" ON public.cup_event_prizes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.cup_event_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cup_events(id) ON DELETE CASCADE,
  beneficiary_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  score bigint NOT NULL CHECK (score >= 0),
  coins bigint NOT NULL CHECK (coins >= 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, beneficiary_user_id)
);
GRANT SELECT ON public.cup_event_payouts TO authenticated;
GRANT ALL ON public.cup_event_payouts TO service_role;
ALTER TABLE public.cup_event_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can view cup results" ON public.cup_event_payouts FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_cup_events_updated_at BEFORE UPDATE ON public.cup_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX cup_events_status_dates_idx ON public.cup_events (status, starts_at, ends_at);
CREATE INDEX cup_event_prizes_event_rank_idx ON public.cup_event_prizes (event_id, rank_from, rank_to);
CREATE INDEX cup_event_payouts_event_rank_idx ON public.cup_event_payouts (event_id, rank);
CREATE INDEX gift_transactions_created_sender_idx ON public.gift_transactions (created_at DESC, sender_id);
CREATE INDEX gift_transactions_created_receiver_idx ON public.gift_transactions (created_at DESC, receiver_id);
CREATE INDEX gift_transactions_created_room_idx ON public.gift_transactions (created_at DESC, room_id) WHERE room_id IS NOT NULL;
CREATE INDEX coin_purchase_approved_created_user_idx ON public.coin_purchase_requests (created_at DESC, user_id) WHERE status = 'approved';
CREATE INDEX game_sessions_settled_created_user_idx ON public.game_sessions (created_at DESC, user_id) WHERE status = 'settled';

CREATE OR REPLACE FUNCTION public.cup_window_start(_period text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE _period
    WHEN 'day' THEN date_trunc('day', now())
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    ELSE date_trunc('day', now())
  END
$$;
REVOKE ALL ON FUNCTION public.cup_window_start(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cup_window_start(text) TO service_role;

CREATE OR REPLACE FUNCTION public.app_cup_leaderboard(_category text, _period text DEFAULT 'day', _limit integer DEFAULT 10)
RETURNS TABLE(entity_id uuid, public_id text, display_name text, avatar_url text, image_url text, score bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := public.cup_window_start(_period);
  _take integer := LEAST(GREATEST(COALESCE(_limit, 10), 1), 10);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _category = 'supporters' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(g.total_price)::bigint
    FROM public.gift_transactions g JOIN public.profiles p ON p.id = g.sender_id
    WHERE g.created_at >= _since GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'receivers' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(g.total_price)::bigint
    FROM public.gift_transactions g JOIN public.profiles p ON p.id = g.receiver_id
    WHERE g.created_at >= _since GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'rooms' THEN
    RETURN QUERY SELECT r.id, r.room_code, r.name, NULL::text, r.image_url, SUM(g.total_price)::bigint
    FROM public.gift_transactions g JOIN public.rooms r ON r.id = g.room_id
    WHERE g.created_at >= _since AND g.room_id IS NOT NULL GROUP BY r.id, r.room_code, r.name, r.image_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'topups' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(c.coins)::bigint
    FROM public.coin_purchase_requests c JOIN public.profiles p ON p.id = c.user_id
    WHERE c.status = 'approved' AND c.created_at >= _since GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'game_wins' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(GREATEST(s.payout - s.bet, 0))::bigint
    FROM public.game_sessions s JOIN public.profiles p ON p.id = s.user_id
    WHERE s.status = 'settled' AND s.created_at >= _since AND s.payout > s.bet
    GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSE
    RAISE EXCEPTION 'invalid category';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.app_cup_leaderboard(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_cup_leaderboard(text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.room_cup_leaderboard(_room_id uuid, _period text DEFAULT 'day', _limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, public_id text, display_name text, avatar_url text, vip_level integer, score bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.public_id, p.display_name, p.avatar_url, p.vip_level, SUM(g.total_price)::bigint
  FROM public.gift_transactions g JOIN public.profiles p ON p.id = g.sender_id
  WHERE auth.uid() IS NOT NULL AND g.room_id = _room_id AND g.created_at >= public.cup_window_start(_period)
  GROUP BY p.id, p.public_id, p.display_name, p.avatar_url, p.vip_level
  ORDER BY 6 DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 10)
$$;
REVOKE ALL ON FUNCTION public.room_cup_leaderboard(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_cup_leaderboard(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cup_event_leaderboard(_event_id uuid, _limit integer DEFAULT 10)
RETURNS TABLE(entity_id uuid, public_id text, display_name text, avatar_url text, image_url text, score bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event public.cup_events%ROWTYPE;
  _take integer := LEAST(GREATEST(COALESCE(_limit, 10), 1), 10);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _event FROM public.cup_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF _event.ranking_kind = 'supporters' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(g.total_price)::bigint
    FROM public.gift_transactions g JOIN public.profiles p ON p.id = g.sender_id
    WHERE g.created_at >= _event.starts_at AND g.created_at < _event.ends_at
    GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _event.ranking_kind = 'receivers' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(g.total_price)::bigint
    FROM public.gift_transactions g JOIN public.profiles p ON p.id = g.receiver_id
    WHERE g.created_at >= _event.starts_at AND g.created_at < _event.ends_at
    GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _event.ranking_kind = 'rooms' THEN
    RETURN QUERY SELECT r.id, r.room_code, r.name, NULL::text, r.image_url, SUM(g.total_price)::bigint
    FROM public.gift_transactions g JOIN public.rooms r ON r.id = g.room_id
    WHERE g.created_at >= _event.starts_at AND g.created_at < _event.ends_at AND g.room_id IS NOT NULL
    GROUP BY r.id, r.room_code, r.name, r.image_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _event.ranking_kind = 'topups' THEN
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(c.coins)::bigint
    FROM public.coin_purchase_requests c JOIN public.profiles p ON p.id = c.user_id
    WHERE c.status = 'approved' AND c.created_at >= _event.starts_at AND c.created_at < _event.ends_at
    GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSE
    RETURN QUERY SELECT p.id, p.public_id, p.display_name, p.avatar_url, NULL::text, SUM(GREATEST(s.payout - s.bet, 0))::bigint
    FROM public.game_sessions s JOIN public.profiles p ON p.id = s.user_id
    WHERE s.status = 'settled' AND s.payout > s.bet AND s.created_at >= _event.starts_at AND s.created_at < _event.ends_at
    GROUP BY p.id, p.public_id, p.display_name, p.avatar_url ORDER BY 6 DESC LIMIT _take;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.cup_event_leaderboard(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cup_event_leaderboard(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_cup_event(_event_id uuid, _admin uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event public.cup_events%ROWTYPE;
  _row record;
  _prize bigint;
  _beneficiary uuid;
  _before bigint;
  _paid integer := 0;
BEGIN
  IF NOT public.is_admin(_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _event FROM public.cup_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF _event.status = 'finished' THEN RETURN 0; END IF;
  IF now() < _event.ends_at THEN RAISE EXCEPTION 'event still active'; END IF;
  UPDATE public.cup_events SET status = 'settling' WHERE id = _event_id;

  FOR _row IN SELECT * FROM public.cup_event_leaderboard(_event_id, 10) LOOP
    SELECT coins INTO _prize FROM public.cup_event_prizes
    WHERE event_id = _event_id AND _row.rank_no BETWEEN rank_from AND rank_to LIMIT 1;
  END LOOP;
  RETURN _paid;
END
$$;
REVOKE ALL ON FUNCTION public.settle_cup_event(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cup_event(uuid, uuid) TO service_role;

INSERT INTO public.cup_events (title, subtitle, description, ranking_kind, starts_at, ends_at, status)
VALUES (
  'تحدي عرش صوتك',
  'أربعة أيام من الدعم والمنافسة',
  'اليوم الأول انطلاقة الدعم، اليوم الثاني مضاعفة الحماس، اليوم الثالث سباق المراكز، واليوم الرابع الحسم وتتويج أفضل 10 داعمين.',
  'supporters', now(), now() + interval '4 days', 'active'
);

INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
SELECT id, 1, 1, 1000000, 'بطل عرش صوتك' FROM public.cup_events WHERE title = 'تحدي عرش صوتك' ORDER BY created_at DESC LIMIT 1;
INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
SELECT id, 2, 2, 500000, 'وصيف العرش' FROM public.cup_events WHERE title = 'تحدي عرش صوتك' ORDER BY created_at DESC LIMIT 1;
INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
SELECT id, 3, 3, 250000, 'المركز الثالث' FROM public.cup_events WHERE title = 'تحدي عرش صوتك' ORDER BY created_at DESC LIMIT 1;
INSERT INTO public.cup_event_prizes (event_id, rank_from, rank_to, coins, label)
SELECT id, 4, 10, 50000, 'نجوم العشرة الأوائل' FROM public.cup_events WHERE title = 'تحدي عرش صوتك' ORDER BY created_at DESC LIMIT 1;