-- ===== 1) صندوق الكنز =====
CREATE TABLE public.room_treasure (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1,
  progress bigint NOT NULL DEFAULT 0,
  total_opened integer NOT NULL DEFAULT 0,
  last_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.room_treasure TO authenticated;
GRANT ALL ON public.room_treasure TO service_role;
ALTER TABLE public.room_treasure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasure readable" ON public.room_treasure FOR SELECT TO authenticated USING (true);

CREATE TABLE public.room_treasure_contribs (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
GRANT SELECT ON public.room_treasure_contribs TO authenticated;
GRANT ALL ON public.room_treasure_contribs TO service_role;
ALTER TABLE public.room_treasure_contribs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasure contribs readable" ON public.room_treasure_contribs FOR SELECT TO authenticated USING (true);

CREATE TABLE public.room_treasure_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  level integer NOT NULL,
  target bigint NOT NULL,
  total_prize bigint NOT NULL DEFAULT 0,
  winners integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_treasure_opens_room ON public.room_treasure_opens(room_id, created_at DESC);
GRANT SELECT ON public.room_treasure_opens TO authenticated;
GRANT ALL ON public.room_treasure_opens TO service_role;
ALTER TABLE public.room_treasure_opens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasure opens readable" ON public.room_treasure_opens FOR SELECT TO authenticated USING (true);

CREATE TABLE public.room_treasure_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_id uuid NOT NULL REFERENCES public.room_treasure_opens(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  contribution bigint NOT NULL DEFAULT 0,
  coins bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_treasure_payouts_room ON public.room_treasure_payouts(room_id, created_at DESC);
GRANT SELECT ON public.room_treasure_payouts TO authenticated;
GRANT ALL ON public.room_treasure_payouts TO service_role;
ALTER TABLE public.room_treasure_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasure payouts readable" ON public.room_treasure_payouts FOR SELECT TO authenticated USING (true);

-- ===== 2) نشاطات الغرفة =====
CREATE TABLE public.room_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'chat',
  description text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_room_activities_room ON public.room_activities(room_id, starts_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_activities TO authenticated;
GRANT ALL ON public.room_activities TO service_role;
ALTER TABLE public.room_activities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_room(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = _room_id AND r.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.room_moderators m WHERE m.room_id = _room_id AND m.user_id = _user_id)
      OR public.is_admin(_user_id);
$$;

CREATE POLICY "activities readable" ON public.room_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "activities managed by room staff" ON public.room_activities FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_room(room_id, auth.uid()));
CREATE POLICY "activities updated by room staff" ON public.room_activities FOR UPDATE TO authenticated
  USING (public.can_manage_room(room_id, auth.uid())) WITH CHECK (public.can_manage_room(room_id, auth.uid()));
CREATE POLICY "activities deleted by room staff" ON public.room_activities FOR DELETE TO authenticated
  USING (public.can_manage_room(room_id, auth.uid()));

CREATE TRIGGER trg_room_activities_updated BEFORE UPDATE ON public.room_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 3) دعم وجوائز الغرفة =====
CREATE TABLE public.room_support_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL UNIQUE REFERENCES public.rooms(id) ON DELETE CASCADE,
  registered_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.room_support_registrations TO authenticated;
GRANT ALL ON public.room_support_registrations TO service_role;
ALTER TABLE public.room_support_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support registrations readable" ON public.room_support_registrations FOR SELECT TO authenticated USING (true);

CREATE TABLE public.room_reward_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  revenue bigint NOT NULL DEFAULT 0,
  owner_coins bigint NOT NULL DEFAULT 0,
  admin_coins bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'settled',
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, week_start)
);
GRANT SELECT ON public.room_reward_weeks TO authenticated;
GRANT ALL ON public.room_reward_weeks TO service_role;
ALTER TABLE public.room_reward_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward weeks readable" ON public.room_reward_weeks FOR SELECT TO authenticated USING (true);

CREATE TABLE public.room_reward_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.room_reward_weeks(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  coins bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reward_payouts_room ON public.room_reward_payouts(room_id, created_at DESC);
GRANT SELECT ON public.room_reward_payouts TO authenticated;
GRANT ALL ON public.room_reward_payouts TO service_role;
ALTER TABLE public.room_reward_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward payouts readable" ON public.room_reward_payouts FOR SELECT TO authenticated USING (true);

-- ===== 4) الإعدادات القابلة للتعديل من الإدارة =====
INSERT INTO public.app_settings (key, value) VALUES (
  'room_treasure',
  jsonb_build_object(
    'enabled', true,
    'levels', jsonb_build_array(
      jsonb_build_object('level',1,'name','صندوق برونزي','target',2000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',300000), jsonb_build_object('rank',2,'coins',150000), jsonb_build_object('rank',3,'coins',50000))),
      jsonb_build_object('level',2,'name','صندوق فضي','target',10000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',1500000), jsonb_build_object('rank',2,'coins',700000), jsonb_build_object('rank',3,'coins',300000))),
      jsonb_build_object('level',3,'name','صندوق أزرق','target',50000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',7000000), jsonb_build_object('rank',2,'coins',3000000), jsonb_build_object('rank',3,'coins',1500000))),
      jsonb_build_object('level',4,'name','صندوق بنفسجي','target',200000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',28000000), jsonb_build_object('rank',2,'coins',12000000), jsonb_build_object('rank',3,'coins',6000000))),
      jsonb_build_object('level',5,'name','صندوق ذهبي','target',1000000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',140000000), jsonb_build_object('rank',2,'coins',60000000), jsonb_build_object('rank',3,'coins',30000000))),
      jsonb_build_object('level',6,'name','صندوق ملكي','target',5000000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',700000000), jsonb_build_object('rank',2,'coins',300000000), jsonb_build_object('rank',3,'coins',150000000))),
      jsonb_build_object('level',7,'name','صندوق الأسطورة','target',20000000000,'prizes',jsonb_build_array(
        jsonb_build_object('rank',1,'coins',2800000000), jsonb_build_object('rank',2,'coins',1200000000), jsonb_build_object('rank',3,'coins',600000000)))
    )
  )
) ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

INSERT INTO public.app_settings (key, value) VALUES (
  'room_rewards',
  jsonb_build_object(
    'min_weekly_cup', 200000,
    'tiers', jsonb_build_array(
      jsonb_build_object('revenue',200000,'owner_coins',7000,'admin_coins',16000,'admins_min',2,'admins_max',4,'percent',5,'weekly_cap',3000000),
      jsonb_build_object('revenue',1000000,'owner_coins',40000,'admin_coins',80000,'admins_min',2,'admins_max',4,'percent',6,'weekly_cap',4000000),
      jsonb_build_object('revenue',4000000,'owner_coins',200000,'admin_coins',240000,'admins_min',3,'admins_max',6,'percent',7,'weekly_cap',5000000),
      jsonb_build_object('revenue',10000000,'owner_coins',500000,'admin_coins',640000,'admins_min',4,'admins_max',8,'percent',8,'weekly_cap',5000000),
      jsonb_build_object('revenue',30000000,'owner_coins',1500000,'admin_coins',1800000,'admins_min',6,'admins_max',12,'percent',9,'weekly_cap',6000000),
      jsonb_build_object('revenue',60000000,'owner_coins',1800000,'admin_coins',3000000,'admins_min',6,'admins_max',15,'percent',10,'weekly_cap',6000000),
      jsonb_build_object('revenue',100000000,'owner_coins',2000000,'admin_coins',6000000,'admins_min',10,'admins_max',20,'percent',11,'weekly_cap',7000000),
      jsonb_build_object('revenue',200000000,'owner_coins',4000000,'admin_coins',7000000,'admins_min',10,'admins_max',20,'percent',11,'weekly_cap',15000000),
      jsonb_build_object('revenue',400000000,'owner_coins',6000000,'admin_coins',10000000,'admins_min',10,'admins_max',20,'percent',11,'weekly_cap',30000000),
      jsonb_build_object('revenue',600000000,'owner_coins',7500000,'admin_coins',15000000,'admins_min',10,'admins_max',20,'percent',11,'weekly_cap',30000000),
      jsonb_build_object('revenue',1000000000,'owner_coins',10000000,'admin_coins',20000000,'admins_min',10,'admins_max',20,'percent',11,'weekly_cap',30000000)
    )
  )
) ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

-- ===== 5) دوال الإعدادات والقراءة =====
CREATE OR REPLACE FUNCTION public.room_treasure_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'room_treasure'), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.room_rewards_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'room_rewards'), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.room_week_start()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh'))::date);
$$;

-- حالة صندوق الكنز لغرفة: المستوى، التقدم، الهدف، الجوائز، أكبر المساهمين
CREATE OR REPLACE FUNCTION public.room_treasure_state(_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; box public.room_treasure; lvl jsonb; contribs jsonb; opens jsonb;
BEGIN
  s := public.room_treasure_settings();
  SELECT * INTO box FROM public.room_treasure WHERE room_id = _room_id;
  lvl := (SELECT l FROM jsonb_array_elements(COALESCE(s->'levels','[]'::jsonb)) l
          WHERE (l->>'level')::int = COALESCE(box.level, 1) LIMIT 1);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', c.user_id, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'amount', c.amount
         ) ORDER BY c.amount DESC), '[]'::jsonb)
    INTO contribs
    FROM public.room_treasure_contribs c
    LEFT JOIN public.profiles p ON p.id = c.user_id
   WHERE c.room_id = _room_id AND c.amount > 0;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('level', o.level, 'total_prize', o.total_prize, 'created_at', o.created_at)
           ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO opens
    FROM (SELECT * FROM public.room_treasure_opens WHERE room_id = _room_id ORDER BY created_at DESC LIMIT 5) o;
  RETURN jsonb_build_object(
    'level', COALESCE(box.level, 1),
    'progress', COALESCE(box.progress, 0),
    'total_opened', COALESCE(box.total_opened, 0),
    'current', COALESCE(lvl, '{}'::jsonb),
    'levels', COALESCE(s->'levels','[]'::jsonb),
    'contributors', COALESCE(contribs, '[]'::jsonb),
    'recent_opens', COALESCE(opens, '[]'::jsonb)
  );
END;
$$;

-- فتح الصندوق وتوزيع الجوائز على أكبر المساهمين
CREATE OR REPLACE FUNCTION public.room_treasure_open(_room_id uuid, _level integer, _target bigint, _s jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lvl jsonb; open_id uuid; total bigint := 0; cnt integer := 0; r record; max_level integer;
BEGIN
  lvl := (SELECT l FROM jsonb_array_elements(COALESCE(_s->'levels','[]'::jsonb)) l WHERE (l->>'level')::int = _level LIMIT 1);
  INSERT INTO public.room_treasure_opens (room_id, level, target) VALUES (_room_id, _level, _target) RETURNING id INTO open_id;

  FOR r IN
    SELECT p.rank, p.coins, c.user_id, c.amount
      FROM (SELECT (x->>'rank')::int AS rank, (x->>'coins')::bigint AS coins
              FROM jsonb_array_elements(COALESCE(lvl->'prizes','[]'::jsonb)) x) p
      JOIN (SELECT user_id, amount, row_number() OVER (ORDER BY amount DESC) AS rn
              FROM public.room_treasure_contribs WHERE room_id = _room_id AND amount > 0) c
        ON c.rn = p.rank
  LOOP
    INSERT INTO public.room_treasure_payouts (open_id, room_id, user_id, rank, contribution, coins)
    VALUES (open_id, _room_id, r.user_id, r.rank, r.amount, r.coins);

    INSERT INTO public.coin_wallets (user_id, coins) VALUES (r.user_id, 0) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET coins = coins + r.coins, updated_at = now() WHERE user_id = r.user_id;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference, status)
    SELECT r.user_id, 'treasure_prize', r.coins, w.coins - r.coins, w.coins, 'treasure:' || open_id::text, 'completed'
      FROM public.coin_wallets w WHERE w.user_id = r.user_id;
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (r.user_id, 'treasure', 'جائزة صندوق الكنز', 'حصلت على ' || r.coins::text || ' عملة من فتح صندوق كنز الغرفة');
    total := total + r.coins;
    cnt := cnt + 1;
  END LOOP;

  UPDATE public.room_treasure_opens SET total_prize = total, winners = cnt WHERE id = open_id;
  DELETE FROM public.room_treasure_contribs WHERE room_id = _room_id;

  SELECT MAX((l->>'level')::int) INTO max_level FROM jsonb_array_elements(COALESCE(_s->'levels','[]'::jsonb)) l;
  UPDATE public.room_treasure
     SET progress = GREATEST(progress - _target, 0),
         level = CASE WHEN _level >= COALESCE(max_level, _level) THEN COALESCE(max_level, _level) ELSE _level + 1 END,
         total_opened = total_opened + 1,
         last_opened_at = now(),
         updated_at = now()
   WHERE room_id = _room_id;
END;
$$;

-- تقدّم الصندوق تلقائيًا مع كل هدية داخل الغرفة
CREATE OR REPLACE FUNCTION public.room_treasure_on_gift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; box public.room_treasure; target bigint; guard integer := 0;
BEGIN
  IF NEW.room_id IS NULL THEN RETURN NEW; END IF;
  s := public.room_treasure_settings();
  IF COALESCE((s->>'enabled')::boolean, true) = false THEN RETURN NEW; END IF;

  INSERT INTO public.room_treasure (room_id) VALUES (NEW.room_id) ON CONFLICT (room_id) DO NOTHING;
  INSERT INTO public.room_treasure_contribs (room_id, user_id, amount)
  VALUES (NEW.room_id, NEW.sender_id, NEW.total_price)
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET amount = public.room_treasure_contribs.amount + EXCLUDED.amount, updated_at = now();

  UPDATE public.room_treasure SET progress = progress + NEW.total_price, updated_at = now() WHERE room_id = NEW.room_id;

  LOOP
    guard := guard + 1;
    EXIT WHEN guard > 10;
    SELECT * INTO box FROM public.room_treasure WHERE room_id = NEW.room_id;
    SELECT (l->>'target')::bigint INTO target
      FROM jsonb_array_elements(COALESCE(s->'levels','[]'::jsonb)) l
     WHERE (l->>'level')::int = box.level LIMIT 1;
    EXIT WHEN target IS NULL OR target <= 0 OR box.progress < target;
    PERFORM public.room_treasure_open(NEW.room_id, box.level, target, s);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_room_treasure_on_gift AFTER INSERT ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.room_treasure_on_gift();

-- حالة دعم/جوائز الغرفة
CREATE OR REPLACE FUNCTION public.room_rewards_state(_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; wk date; rev bigint; last_rev bigint; tier jsonb; reg text; last_week jsonb;
BEGIN
  s := public.room_rewards_settings();
  wk := public.room_week_start();
  SELECT COALESCE(SUM(total_price), 0) INTO rev FROM public.gift_transactions
   WHERE room_id = _room_id AND created_at >= wk;
  SELECT COALESCE(SUM(total_price), 0) INTO last_rev FROM public.gift_transactions
   WHERE room_id = _room_id AND created_at >= wk - 7 AND created_at < wk;
  SELECT l INTO tier FROM jsonb_array_elements(COALESCE(s->'tiers','[]'::jsonb)) l
   WHERE rev >= (l->>'revenue')::bigint ORDER BY (l->>'revenue')::bigint DESC LIMIT 1;
  SELECT status INTO reg FROM public.room_support_registrations WHERE room_id = _room_id;
  SELECT to_jsonb(w) INTO last_week FROM public.room_reward_weeks w
   WHERE w.room_id = _room_id ORDER BY w.week_start DESC LIMIT 1;
  RETURN jsonb_build_object(
    'week_start', wk,
    'weekly_revenue', rev,
    'last_week_revenue', last_rev,
    'tier', COALESCE(tier, '{}'::jsonb),
    'tiers', COALESCE(s->'tiers','[]'::jsonb),
    'min_weekly_cup', COALESCE((s->>'min_weekly_cup')::bigint, 200000),
    'registration', COALESCE(reg, 'none'),
    'last_settlement', COALESCE(last_week, '{}'::jsonb)
  );
END;
$$;

-- تسجيل الغرفة في خطة الدعم — لمالك الغرفة فقط بعد بلوغ الحد
CREATE OR REPLACE FUNCTION public.room_support_register(_room_id uuid)
RETURNS public.room_support_registrations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); owner uuid; rev bigint; min_cup bigint; row public.room_support_registrations;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT owner_id INTO owner FROM public.rooms WHERE id = _room_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'الغرفة غير موجودة'; END IF;
  IF owner <> uid THEN RAISE EXCEPTION 'التسجيل متاح لمالك الغرفة فقط'; END IF;
  min_cup := COALESCE((public.room_rewards_settings()->>'min_weekly_cup')::bigint, 200000);
  SELECT COALESCE(SUM(total_price), 0) INTO rev FROM public.gift_transactions
   WHERE room_id = _room_id AND created_at >= public.room_week_start();
  IF rev < min_cup THEN RAISE EXCEPTION 'كأس الغرفة الأسبوعي أقل من الحد المطلوب للتسجيل'; END IF;
  INSERT INTO public.room_support_registrations (room_id, registered_by, status)
  VALUES (_room_id, uid, 'active')
  ON CONFLICT (room_id) DO UPDATE SET status = 'active', registered_by = uid, updated_at = now()
  RETURNING * INTO row;
  INSERT INTO public.audit_logs (actor_id, target_id, action, new_value)
  VALUES (uid, _room_id::text, 'room_support_registered', jsonb_build_object('weekly_revenue', rev));
  RETURN row;
END;
$$;

-- تسوية مكافآت أسبوع لغرفة مسجّلة — من الخادم فقط
CREATE OR REPLACE FUNCTION public.room_reward_settle_week(_room_id uuid, _week_start date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; tier jsonb; rev bigint; owner uuid; week_id uuid; cap bigint;
        admins uuid[]; n integer; share bigint; total_admin bigint; a uuid; pay bigint;
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

  -- مكافأة المالك
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

  -- مكافأة الادمن موزّعة بالتساوي على مشرفي الغرفة
  SELECT COALESCE(array_agg(user_id), '{}') INTO admins FROM public.room_moderators WHERE room_id = _room_id;
  n := COALESCE(array_length(admins, 1), 0);
  IF n > 0 AND total_admin > 0 THEN
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
          jsonb_build_object('week_start', _week_start, 'revenue', rev, 'owner_coins', pay, 'admin_coins', total_admin));
  RETURN week_id;
END;
$$;

-- صلاحيات التنفيذ
REVOKE ALL ON FUNCTION public.room_treasure_open(uuid, integer, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_reward_settle_week(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_treasure_open(uuid, integer, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.room_reward_settle_week(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.room_treasure_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_rewards_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_treasure_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_rewards_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_support_register(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_room(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_week_start() TO authenticated, service_role;