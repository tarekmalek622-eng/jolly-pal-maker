-- 1) Remove the owner-phone bootstrap privilege-escalation path (owner already has roles)
DROP TRIGGER IF EXISTS grant_owner_admin_role ON auth.users;
DROP TRIGGER IF EXISTS trg_grant_owner_admin_role ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_owner_admin_role();

-- 2) Hide private-room passwords from direct reads; verify via definer function
REVOKE SELECT (password) ON public.rooms FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.verify_room_password(_room_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = _room_id
      AND is_active
      AND NOT is_disabled
      AND (password IS NULL OR password = '' OR password = _password)
  );
$$;
GRANT EXECUTE ON FUNCTION public.verify_room_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_room_password(uuid, text) TO service_role;

-- 3) Hide super_admin identity from the public badge policy (keep self/admin read policy)
DROP POLICY IF EXISTS "authenticated view public role badges" ON public.user_roles;
CREATE POLICY "authenticated view public role badges"
ON public.user_roles FOR SELECT TO authenticated
USING (role <> 'super_admin');

-- 4) wheel_bets: owner-only reads + secure winners RPC for the public leaderboard
DROP POLICY IF EXISTS wheel_bets_read ON public.wheel_bets;
CREATE POLICY wheel_bets_read_own
ON public.wheel_bets FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.wheel_round_winners(_round_id uuid)
RETURNS TABLE(user_id uuid, slot_key text, amount bigint, payout bigint, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.user_id, b.slot_key, b.amount, b.payout, p.display_name, p.avatar_url
  FROM public.wheel_bets b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE b.round_id = _round_id AND b.payout > 0
  ORDER BY b.payout DESC
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.wheel_round_winners(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wheel_round_winners(uuid) TO service_role;

-- 5) supercar_bets: owner-only reads
DROP POLICY IF EXISTS supercar_bets_read ON public.supercar_bets;
CREATE POLICY supercar_bets_read_own
ON public.supercar_bets FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 6) lucky_bag_claims: claimer, bag sender, or admin
DROP POLICY IF EXISTS lucky_bag_claims_read ON public.lucky_bag_claims;
CREATE POLICY lucky_bag_claims_read_scoped
ON public.lucky_bag_claims FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.lucky_bags b WHERE b.id = bag_id AND b.sender_id = auth.uid())
);

-- 7) room_reward_payouts: recipient, room owner, or admin
DROP POLICY IF EXISTS "reward payouts readable" ON public.room_reward_payouts;
CREATE POLICY "reward payouts scoped"
ON public.room_reward_payouts FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.owner_id = auth.uid())
);

-- 8) room_treasure_contribs: room members, owner, or admin
DROP POLICY IF EXISTS "treasure contribs readable" ON public.room_treasure_contribs;
CREATE POLICY "treasure contribs scoped"
ON public.room_treasure_contribs FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.room_members m WHERE m.room_id = room_treasure_contribs.room_id AND m.user_id = auth.uid())
);