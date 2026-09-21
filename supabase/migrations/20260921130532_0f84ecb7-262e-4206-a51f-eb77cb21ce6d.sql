
CREATE TABLE IF NOT EXISTS public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  description text,
  leader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  level integer NOT NULL DEFAULT 1,
  points bigint NOT NULL DEFAULT 0,
  member_count integer NOT NULL DEFAULT 0,
  max_members integer NOT NULL DEFAULT 50,
  is_active boolean NOT NULL DEFAULT true,
  is_suspended boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families readable by authenticated" ON public.families;
CREATE POLICY "families readable by authenticated" ON public.families
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  points bigint NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members (family_id);
GRANT SELECT ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members readable by authenticated" ON public.family_members;
CREATE POLICY "family members readable by authenticated" ON public.family_members
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_families_updated_at BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_family_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.families f
     SET member_count = (SELECT count(*) FROM public.family_members m WHERE m.family_id = f.id)
   WHERE f.id = COALESCE(NEW.family_id, OLD.family_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_family_member_count
AFTER INSERT OR DELETE OR UPDATE OF family_id ON public.family_members
FOR EACH ROW EXECUTE FUNCTION public.sync_family_member_count();

-- family code generator
CREATE OR REPLACE FUNCTION public.gen_family_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE c text;
BEGIN
  LOOP
    c := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.families WHERE family_code = c);
  END LOOP;
  RETURN c;
END;
$$;

-- editable settings
INSERT INTO public.app_settings (key, value)
VALUES ('families', jsonb_build_object(
  'enabled', true,
  'max_deputies', 4,
  'default_max_members', 50,
  'levels', jsonb_build_array(
    jsonb_build_object('level', 1, 'name', 'عائلة ناشئة', 'points', 0, 'max_members', 30, 'style', 'bronze'),
    jsonb_build_object('level', 2, 'name', 'عائلة صاعدة', 'points', 10000000, 'max_members', 40, 'style', 'silver'),
    jsonb_build_object('level', 3, 'name', 'عائلة معروفة', 'points', 100000000, 'max_members', 50, 'style', 'blue'),
    jsonb_build_object('level', 4, 'name', 'عائلة قوية', 'points', 1000000000, 'max_members', 70, 'style', 'purple'),
    jsonb_build_object('level', 5, 'name', 'عائلة ذهبية', 'points', 10000000000, 'max_members', 100, 'style', 'gold'),
    jsonb_build_object('level', 6, 'name', 'عائلة ملكية', 'points', 100000000000, 'max_members', 150, 'style', 'royal'),
    jsonb_build_object('level', 7, 'name', 'عائلة أسطورية', 'points', 1000000000000, 'max_members', 200, 'style', 'legend')
  )
))
ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.family_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'families'), '{}'::jsonb) $$;

GRANT EXECUTE ON FUNCTION public.family_settings() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.family_level_for(_points bigint)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX((l->>'level')::int), 1)
  FROM jsonb_array_elements(COALESCE(public.family_settings()->'levels', '[]'::jsonb)) l
  WHERE COALESCE((l->>'points')::bigint, 0) <= COALESCE(_points, 0)
$$;

GRANT EXECUTE ON FUNCTION public.family_level_for(bigint) TO authenticated, service_role;

-- award family points from gifts (receiver's family grows)
CREATE OR REPLACE FUNCTION public.family_award_from_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE fid uuid; total bigint;
BEGIN
  SELECT family_id INTO fid FROM public.family_members WHERE user_id = NEW.receiver_id;
  IF fid IS NULL THEN RETURN NEW; END IF;
  total := COALESCE(NEW.total_price, 0);
  UPDATE public.family_members SET points = points + total WHERE user_id = NEW.receiver_id;
  UPDATE public.families
     SET points = points + total,
         level = public.family_level_for(points + total),
         updated_at = now()
   WHERE id = fid AND is_suspended = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_award_from_gift ON public.gift_transactions;
CREATE TRIGGER trg_family_award_from_gift
AFTER INSERT ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.family_award_from_gift();

-- stats for a family page
CREATE OR REPLACE FUNCTION public.family_stats(_family_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE f public.families; res jsonb;
BEGIN
  SELECT * INTO f FROM public.families WHERE id = _family_id;
  IF f.id IS NULL THEN RETURN NULL; END IF;
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
        SELECT m.user_id, m.role, m.points, p.display_name, p.avatar_url, p.public_id, p.vip_level
          FROM public.family_members m JOIN public.profiles p ON p.id = m.user_id
         WHERE m.family_id = f.id
         ORDER BY m.points DESC LIMIT 20
      ) x
    ), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.family_stats(uuid) TO authenticated, service_role;
