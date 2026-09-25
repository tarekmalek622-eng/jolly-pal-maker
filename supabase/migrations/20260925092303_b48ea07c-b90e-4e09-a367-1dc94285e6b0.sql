CREATE TABLE public.sa_event (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  rate INT NOT NULL DEFAULT 3,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sa_event TO anon, authenticated;
GRANT ALL ON public.sa_event TO service_role;
ALTER TABLE public.sa_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_event readable by all" ON public.sa_event FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.sa_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  votes BIGINT NOT NULL CHECK (votes > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sa_votes TO authenticated;
GRANT ALL ON public.sa_votes TO service_role;
ALTER TABLE public.sa_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_votes readable" ON public.sa_votes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.sa_winners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  country TEXT,
  three_digit_id TEXT UNIQUE,
  assistants_count INT NOT NULL DEFAULT 0,
  salary BIGINT NOT NULL DEFAULT 0,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sa_winners TO anon, authenticated;
GRANT ALL ON public.sa_winners TO service_role;
ALTER TABLE public.sa_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_winners readable by all" ON public.sa_winners FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.sa_assistants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  winner_id UUID NOT NULL REFERENCES public.sa_winners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  three_digit_id TEXT,
  salary BIGINT NOT NULL DEFAULT 50000000000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (winner_id, user_id)
);
GRANT SELECT ON public.sa_assistants TO anon, authenticated;
GRANT ALL ON public.sa_assistants TO service_role;
ALTER TABLE public.sa_assistants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_assistants readable by all" ON public.sa_assistants FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.sa_event (title, starts_at, ends_at) VALUES ('سوبر أدمن العرب', now(), now() + interval '7 days');

CREATE OR REPLACE FUNCTION public.sa_current_event()
RETURNS public.sa_event
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.sa_event WHERE active ORDER BY created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.sa_my_votes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ev public.sa_event; sent BIGINT; earned BIGINT; gifted BIGINT;
BEGIN
  SELECT * INTO ev FROM public.sa_event WHERE active ORDER BY created_at DESC LIMIT 1;
  IF ev IS NULL THEN RETURN jsonb_build_object('earned',0,'gifted',0,'available',0); END IF;
  SELECT coalesce(sum(total_price),0) INTO sent FROM public.gift_transactions
    WHERE sender_id = auth.uid() AND created_at >= ev.starts_at AND created_at <= ev.ends_at;
  earned := floor(sent / ev.rate);
  SELECT coalesce(sum(votes),0) INTO gifted FROM public.sa_votes WHERE from_user = auth.uid();
  RETURN jsonb_build_object('earned', earned, 'gifted', gifted, 'available', greatest(earned - gifted, 0));
END $$;

CREATE OR REPLACE FUNCTION public.sa_gift_votes(_to UUID, _votes BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev public.sa_event; avail BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _votes IS NULL OR _votes <= 0 THEN RAISE EXCEPTION 'عدد أصوات غير صالح'; END IF;
  IF _to = auth.uid() THEN RAISE EXCEPTION 'لا يمكن الإهداء لنفسك'; END IF;
  SELECT * INTO ev FROM public.sa_event WHERE active AND now() BETWEEN starts_at AND ends_at ORDER BY created_at DESC LIMIT 1;
  IF ev IS NULL THEN RAISE EXCEPTION 'الحدث غير نشط حاليًا'; END IF;
  avail := (public.sa_my_votes() ->> 'available')::bigint;
  IF avail < _votes THEN RAISE EXCEPTION 'رصيد الأصوات غير كافٍ'; END IF;
  INSERT INTO public.sa_votes (from_user, to_user, votes) VALUES (auth.uid(), _to, _votes);
  RETURN avail - _votes;
END $$;

CREATE OR REPLACE FUNCTION public.sa_leaderboard(_limit INT DEFAULT 50)
RETURNS TABLE(user_id UUID, public_id TEXT, display_name TEXT, avatar_url TEXT, votes BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.public_id, p.display_name, p.avatar_url, sum(v.votes) AS votes
  FROM public.sa_votes v JOIN public.profiles p ON p.id = v.to_user
  GROUP BY p.id, p.public_id, p.display_name, p.avatar_url
  ORDER BY votes DESC LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.sa_settle_event()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev public.sa_event; r RECORD; i INT := 0; newid TEXT; winners jsonb := '[]'::jsonb;
  salaries BIGINT[] := array[100000000000, 90000000000, 80000000000];
  assists INT[] := array[5, 3, 2];
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO ev FROM public.sa_event WHERE active ORDER BY created_at DESC LIMIT 1;
  IF ev IS NULL THEN RAISE EXCEPTION 'لا يوجد حدث نشط'; END IF;
  DELETE FROM public.sa_assistants;
  DELETE FROM public.sa_winners;
  FOR r IN SELECT to_user, sum(votes) AS v FROM public.sa_votes GROUP BY to_user ORDER BY v DESC LIMIT 3 LOOP
    i := i + 1;
    LOOP
      newid := lpad(floor(random()*1000)::text, 3, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sa_winners WHERE three_digit_id = newid);
    END LOOP;
    INSERT INTO public.sa_winners (user_id, rank, assistants_count, salary, three_digit_id, ends_at)
      VALUES (r.to_user, i, assists[i], salaries[i], newid, now() + interval '90 days');
    winners := winners || jsonb_build_object('user_id', r.to_user, 'rank', i, 'votes', r.v, 'code', newid);
  END LOOP;
  UPDATE public.sa_event SET active = false WHERE id = ev.id;
  RETURN winners;
END $$;

CREATE OR REPLACE FUNCTION public.sa_add_assistant(_winner_id UUID, _user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.sa_winners; cnt INT; newid TEXT; newrow UUID;
BEGIN
  SELECT * INTO w FROM public.sa_winners WHERE id = _winner_id AND active AND ends_at > now();
  IF w IS NULL THEN RAISE EXCEPTION 'الفائز غير موجود أو انتهت ولايته'; END IF;
  IF auth.uid() <> w.user_id AND NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT count(*) INTO cnt FROM public.sa_assistants WHERE winner_id = w.id;
  IF cnt >= w.assistants_count THEN RAISE EXCEPTION 'اكتمل عدد المساعدين'; END IF;
  LOOP
    newid := lpad(floor(random()*1000)::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sa_winners WHERE three_digit_id = newid)
         AND NOT EXISTS (SELECT 1 FROM public.sa_assistants WHERE three_digit_id = newid);
  END LOOP;
  INSERT INTO public.sa_assistants (winner_id, user_id, three_digit_id) VALUES (w.id, _user_id, newid) RETURNING id INTO newrow;
  RETURN newrow;
END $$;

CREATE OR REPLACE FUNCTION public.sa_pay_salaries()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w RECORD; a RECORD; n INT := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  FOR w IN SELECT * FROM public.sa_winners WHERE active AND ends_at > now() LOOP
    PERFORM public._wallet_move(w.user_id, w.salary, 'sa_salary', 'sa:' || w.id::text);
    n := n + 1;
    FOR a IN SELECT * FROM public.sa_assistants WHERE winner_id = w.id LOOP
      PERFORM public._wallet_move(a.user_id, a.salary, 'sa_assistant_salary', 'sa:' || a.id::text);
      n := n + 1;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.sa_current_event() FROM anon;
REVOKE ALL ON FUNCTION public.sa_my_votes() FROM anon;
REVOKE ALL ON FUNCTION public.sa_gift_votes(UUID, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.sa_leaderboard(INT) FROM anon;
REVOKE ALL ON FUNCTION public.sa_settle_event() FROM anon;
REVOKE ALL ON FUNCTION public.sa_add_assistant(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.sa_pay_salaries() FROM anon;
GRANT EXECUTE ON FUNCTION public.sa_current_event() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sa_my_votes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sa_gift_votes(UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sa_leaderboard(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sa_settle_event() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sa_add_assistant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sa_pay_salaries() TO authenticated;