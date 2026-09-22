CREATE TABLE IF NOT EXISTS public.profile_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, visitor_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_visits TO authenticated;
GRANT ALL ON public.profile_visits TO service_role;

ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile visits readable" ON public.profile_visits
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);

CREATE POLICY "visitors can log visits" ON public.profile_visits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = visitor_id AND visitor_id <> profile_id);

CREATE POLICY "visitors can refresh visits" ON public.profile_visits
  FOR UPDATE TO authenticated USING (auth.uid() = visitor_id) WITH CHECK (auth.uid() = visitor_id);

CREATE INDEX IF NOT EXISTS profile_visits_profile_idx ON public.profile_visits (profile_id, updated_at DESC);

CREATE TRIGGER update_profile_visits_updated_at
  BEFORE UPDATE ON public.profile_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();