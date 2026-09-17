DROP POLICY IF EXISTS "own relationships readable" ON public.relationships;
CREATE POLICY "relationship participants and accepted profiles readable"
ON public.relationships
FOR SELECT
TO authenticated
USING (
  status = 'accepted'
  OR auth.uid() IN (requester_id, partner_id)
  OR public.is_admin(auth.uid())
);