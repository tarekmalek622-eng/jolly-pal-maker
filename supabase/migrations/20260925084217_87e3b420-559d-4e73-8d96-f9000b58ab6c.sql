CREATE TABLE public.voice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid,
  event text NOT NULL,
  provider text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.voice_events TO authenticated;
GRANT SELECT ON public.voice_events TO authenticated;
GRANT ALL ON public.voice_events TO service_role;
ALTER TABLE public.voice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users log own voice events" ON public.voice_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read voice events" ON public.voice_events FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  seconds integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.voice_sessions TO authenticated;
GRANT ALL ON public.voice_sessions TO service_role;
ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own sessions" ON public.voice_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users finish own sessions" ON public.voice_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own sessions" ON public.voice_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE INDEX idx_voice_sessions_user_week ON public.voice_sessions (user_id, joined_at);
CREATE INDEX idx_voice_events_created ON public.voice_events (created_at DESC);