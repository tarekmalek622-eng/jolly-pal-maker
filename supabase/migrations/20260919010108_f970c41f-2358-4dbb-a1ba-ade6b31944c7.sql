-- مستويات بلا حدود: منحنى تصاعدي
CREATE OR REPLACE FUNCTION public.level_for_xp(_xp bigint)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  lvl integer := 1;
  need numeric := 500;
  total numeric := 0;
BEGIN
  IF _xp IS NULL OR _xp <= 0 THEN RETURN 1; END IF;
  LOOP
    total := total + need;
    EXIT WHEN total > _xp OR lvl >= 100000;
    lvl := lvl + 1;
    need := need * 1.18;
  END LOOP;
  RETURN lvl;
END;
$$;

CREATE OR REPLACE FUNCTION public.xp_total_for_level(_level integer)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i integer := 1;
  need numeric := 500;
  total numeric := 0;
BEGIN
  IF _level IS NULL OR _level <= 1 THEN RETURN 0; END IF;
  WHILE i < _level LOOP
    total := total + need;
    need := need * 1.18;
    i := i + 1;
  END LOOP;
  RETURN total::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.level_for_xp(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.xp_total_for_level(integer) TO authenticated, service_role;

-- تحديث المستوى تلقائيًا من نقاط الخبرة
CREATE OR REPLACE FUNCTION public.sync_profile_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.level := public.level_for_xp(GREATEST(COALESCE(NEW.xp, 0), 0)::bigint);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_level ON public.profiles;
CREATE TRIGGER trg_sync_profile_level
BEFORE INSERT OR UPDATE OF xp ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_level();

-- منح خبرة عند إرسال/استلام الهدايا
CREATE OR REPLACE FUNCTION public.award_gift_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gained integer := GREATEST(1, LEAST(100000, (NEW.total_price / 100000)::integer));
BEGIN
  UPDATE public.profiles SET xp = GREATEST(0, COALESCE(xp, 0)) + gained WHERE id = NEW.sender_id;
  UPDATE public.profiles SET xp = GREATEST(0, COALESCE(xp, 0)) + GREATEST(1, gained / 2) WHERE id = NEW.receiver_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_gift_xp ON public.gift_transactions;
CREATE TRIGGER trg_award_gift_xp
AFTER INSERT ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.award_gift_xp();

-- إعادة حساب المستويات الحالية
UPDATE public.profiles SET xp = COALESCE(xp, 0);

-- فهارس تسريع
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON public.room_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members (room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members (user_id);
CREATE INDEX IF NOT EXISTS idx_room_mics_room_seat ON public.room_mics (room_id, seat_index);
CREATE INDEX IF NOT EXISTS idx_gift_tx_receiver_created ON public.gift_transactions (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_sender_created ON public.gift_transactions (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_room_created ON public.gift_transactions (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_created ON public.coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_active_popularity ON public.rooms (is_active, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_online_seen ON public.profiles (is_online, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_dm_pair_created ON public.direct_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lucky_bags_room_status ON public.lucky_bags (room_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_bets_round ON public.wheel_bets (round_id);
CREATE INDEX IF NOT EXISTS idx_mic_requests_room_status ON public.mic_requests (room_id, status);
CREATE INDEX IF NOT EXISTS idx_profiles_level ON public.profiles (level DESC);