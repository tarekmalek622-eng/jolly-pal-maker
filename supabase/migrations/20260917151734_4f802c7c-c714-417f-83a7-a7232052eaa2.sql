CREATE TABLE public.banners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  subtitle text,
  image_url text,
  link_url text,
  kind text NOT NULL DEFAULT 'ad',
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.banners TO anon;
GRANT SELECT ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banners readable" ON public.banners FOR SELECT USING (true);

CREATE TRIGGER update_banners_updated_at BEFORE UPDATE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_banners_active ON public.banners (is_active, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rooms_discovery ON public.rooms (is_disabled, member_count DESC, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON public.room_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_round ON public.wheel_bets (round_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_receiver ON public.gift_transactions (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_sender ON public.gift_transactions (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON public.coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members (room_id);
CREATE INDEX IF NOT EXISTS idx_dm_pair ON public.direct_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);