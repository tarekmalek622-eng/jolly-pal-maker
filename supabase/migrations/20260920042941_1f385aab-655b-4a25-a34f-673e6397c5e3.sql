ALTER TABLE public.relationships
  ADD COLUMN IF NOT EXISTS points BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_level_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.relationship_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  from_user UUID NOT NULL,
  to_user UUID NOT NULL,
  amount BIGINT NOT NULL,
  points BIGINT NOT NULL,
  level_after INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rel_points_log_rel ON public.relationship_points_log(relationship_id, created_at DESC);

GRANT SELECT ON public.relationship_points_log TO authenticated;
GRANT ALL ON public.relationship_points_log TO service_role;
ALTER TABLE public.relationship_points_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "participants read points log" ON public.relationship_points_log;
CREATE POLICY "participants read points log" ON public.relationship_points_log
FOR SELECT TO authenticated
USING (from_user = auth.uid() OR to_user = auth.uid());

INSERT INTO public.app_settings (key, value)
VALUES ('relationships', jsonb_build_object('levels', jsonb_build_array(
  jsonb_build_object('level',1,'name','بذرة الود','points',0,'style','spark'),
  jsonb_build_object('level',2,'name','صداقة دافئة','points',1000000,'style','sky'),
  jsonb_build_object('level',3,'name','رابط متين','points',10000000,'style','emerald'),
  jsonb_build_object('level',4,'name','ثقة عالية','points',100000000,'style','violet'),
  jsonb_build_object('level',5,'name','قلبان متحدان','points',1000000000,'style','rose'),
  jsonb_build_object('level',6,'name','رابط أسطوري','points',10000000000,'style','crimson'),
  jsonb_build_object('level',7,'name','تاج الأرواح','points',100000000000,'style','royal')
)))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.relationship_settings()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT value FROM public.app_settings WHERE key = 'relationships'
$$;

CREATE OR REPLACE FUNCTION public.relationship_level_for(_points BIGINT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(MAX((lvl->>'level')::int), 1)
  FROM jsonb_array_elements(COALESCE(public.relationship_settings()->'levels', '[]'::jsonb)) lvl
  WHERE COALESCE(_points, 0) >= (lvl->>'points')::bigint
$$;

CREATE OR REPLACE FUNCTION public.relationship_award(_a UUID, _b UUID, _amount BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.relationships; new_level INT;
BEGIN
  IF _a IS NULL OR _b IS NULL OR COALESCE(_amount, 0) <= 0 THEN RETURN; END IF;
  SELECT * INTO r FROM public.relationships
   WHERE status = 'accepted'
     AND ((requester_id = _a AND partner_id = _b) OR (requester_id = _b AND partner_id = _a))
   ORDER BY started_at NULLS LAST LIMIT 1 FOR UPDATE;
  IF r.id IS NULL THEN RETURN; END IF;

  UPDATE public.relationships SET points = points + _amount, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  new_level := public.relationship_level_for(r.points);

  INSERT INTO public.relationship_points_log (relationship_id, from_user, to_user, amount, points, level_after)
  VALUES (r.id, _a, _b, _amount, r.points, new_level);

  IF new_level > r.level THEN
    UPDATE public.relationships SET level = new_level, last_level_at = now() WHERE id = r.id;
    INSERT INTO public.notifications (user_id, kind, title, body, metadata)
    SELECT u, 'relationship', 'ترقية علاقتكما',
           'وصلت علاقتكما إلى المستوى ' || new_level,
           jsonb_build_object('relationship_id', r.id, 'level', new_level)
    FROM (SELECT r.requester_id AS u UNION SELECT r.partner_id) s;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.relationship_award(UUID, UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relationship_award(UUID, UUID, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.relationship_award(UUID, UUID, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_award(UUID, UUID, BIGINT) TO service_role;