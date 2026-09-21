DROP POLICY IF EXISTS "lobby and players read domino games" ON public.domino_games;
DROP POLICY IF EXISTS "domino games readable" ON public.domino_games;
CREATE POLICY "participants and admins read domino games"
ON public.domino_games
FOR SELECT
TO authenticated
USING (
  player1_id = auth.uid()
  OR player2_id = auth.uid()
  OR public.is_admin(auth.uid())
);