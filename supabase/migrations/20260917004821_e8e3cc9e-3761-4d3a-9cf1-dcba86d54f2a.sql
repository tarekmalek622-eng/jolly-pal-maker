GRANT SELECT ON public.user_badges TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can read awarded badges" ON public.user_badges;
CREATE POLICY "Authenticated users can read awarded badges"
ON public.user_badges
FOR SELECT
TO authenticated
USING (true);