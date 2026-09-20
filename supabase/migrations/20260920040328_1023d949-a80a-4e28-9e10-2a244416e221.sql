CREATE TABLE IF NOT EXISTS public.crown_reads (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.crown_reads TO authenticated;
GRANT ALL ON public.crown_reads TO service_role;
ALTER TABLE public.crown_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own crown read state" ON public.crown_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert own crown read state" ON public.crown_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own crown read state" ON public.crown_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());