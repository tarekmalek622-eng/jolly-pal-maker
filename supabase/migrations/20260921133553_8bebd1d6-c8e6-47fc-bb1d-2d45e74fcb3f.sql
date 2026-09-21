CREATE TABLE public.admin_sections (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sections text[] NOT NULL DEFAULT '{}',
  granted_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_sections TO authenticated;
GRANT ALL ON public.admin_sections TO service_role;

ALTER TABLE public.admin_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own admin sections readable" ON public.admin_sections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_sections_for(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_admin(_user_id) THEN ARRAY['*']::text[]
    ELSE COALESCE((SELECT sections FROM public.admin_sections WHERE user_id = _user_id), '{}'::text[])
  END
$$;

CREATE OR REPLACE FUNCTION public.admin_has_section(_user_id uuid, _section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
     OR EXISTS (
       SELECT 1 FROM public.admin_sections
       WHERE user_id = _user_id AND _section = ANY(sections)
     )
$$;

REVOKE ALL ON FUNCTION public.admin_sections_for(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_has_section(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sections_for(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_has_section(uuid, text) TO authenticated, service_role;

CREATE TRIGGER admin_sections_updated_at
  BEFORE UPDATE ON public.admin_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();