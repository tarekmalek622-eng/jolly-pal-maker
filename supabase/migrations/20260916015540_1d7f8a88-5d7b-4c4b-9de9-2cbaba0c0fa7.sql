-- ===== enums =====
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','moderator','host','user');
CREATE TYPE public.gender_type AS ENUM ('male','female');
CREATE TYPE public.room_type AS ENUM ('public','private');
CREATE TYPE public.friend_status AS ENUM ('pending','accepted','rejected');

-- ===== helpers =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.gen_public_id()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE candidate TEXT;
BEGIN
  LOOP
    candidate := (10000000 + floor(random()*89999999))::bigint::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_id = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.gen_room_code()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE candidate TEXT;
BEGIN
  LOOP
    candidate := (100000 + floor(random()*899999))::bigint::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

-- ===== profiles =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  birth_date DATE,
  gender public.gender_type,
  bio TEXT,
  avatar_url TEXT,
  frame_url TEXT,
  profile_background_url TEXT,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  vip_level INT NOT NULL DEFAULT 0,
  is_cvip BOOLEAN NOT NULL DEFAULT false,
  cvip_expires_at TIMESTAMPTZ,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profiles_public_id_idx ON public.profiles (public_id);
CREATE INDEX profiles_name_idx ON public.profiles (display_name);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== roles =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'));
$$;

CREATE POLICY "roles readable by self and admins" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- ===== wallets =====
CREATE TABLE public.coin_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  coins BIGINT NOT NULL DEFAULT 0,
  total_received BIGINT NOT NULL DEFAULT 0,
  total_sent BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coin_wallets TO authenticated;
GRANT ALL ON public.coin_wallets TO service_role;
ALTER TABLE public.coin_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet" ON public.coin_wallets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TABLE public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coin_tx_user_idx ON public.coin_transactions (user_id, created_at DESC);
GRANT SELECT ON public.coin_transactions TO authenticated;
GRANT ALL ON public.coin_transactions TO service_role;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.coin_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ===== rooms =====
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  background_url TEXT,
  theme TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  room_type public.room_type NOT NULL DEFAULT 'public',
  password TEXT,
  mic_count INT NOT NULL DEFAULT 10,
  max_users INT NOT NULL DEFAULT 100,
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  member_count INT NOT NULL DEFAULT 0,
  popularity INT NOT NULL DEFAULT 0,
  chat_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rooms_code_idx ON public.rooms (room_code);
CREATE INDEX rooms_active_idx ON public.rooms (is_active, popularity DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER rooms_updated BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.room_moderators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.room_moderators TO authenticated;
GRANT ALL ON public.room_moderators TO service_role;
ALTER TABLE public.room_moderators ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_room(_room_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rooms WHERE id = _room_id AND owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.room_moderators WHERE room_id = _room_id AND user_id = _user_id)
      OR public.is_admin(_user_id);
$$;

CREATE POLICY "rooms viewable by authenticated" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "create own room" ON public.rooms FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "manage own room" ON public.rooms FOR UPDATE TO authenticated USING (public.can_manage_room(id, auth.uid()));
CREATE POLICY "delete own room" ON public.rooms FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "moderators viewable" ON public.room_moderators FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manages moderators" ON public.room_moderators FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND (r.owner_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "owner removes moderators" ON public.room_moderators FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND (r.owner_id = auth.uid() OR public.is_admin(auth.uid()))));

CREATE TABLE public.room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX room_members_room_idx ON public.room_members (room_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_members TO authenticated;
GRANT ALL ON public.room_members TO service_role;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members viewable" ON public.room_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "join room" ON public.room_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update membership" ON public.room_members FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.can_manage_room(room_id, auth.uid()));
CREATE POLICY "leave room" ON public.room_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.can_manage_room(room_id, auth.uid()));

CREATE TABLE public.room_mics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  seat_index INT NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  decoration_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, seat_index)
);
CREATE INDEX room_mics_room_idx ON public.room_mics (room_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_mics TO authenticated;
GRANT ALL ON public.room_mics TO service_role;
ALTER TABLE public.room_mics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mics viewable" ON public.room_mics FOR SELECT TO authenticated USING (true);
CREATE POLICY "mics insert by manager" ON public.room_mics FOR INSERT TO authenticated WITH CHECK (public.can_manage_room(room_id, auth.uid()));
CREATE POLICY "mics update" ON public.room_mics FOR UPDATE TO authenticated
  USING (public.can_manage_room(room_id, auth.uid()) OR user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "mics delete by manager" ON public.room_mics FOR DELETE TO authenticated USING (public.can_manage_room(room_id, auth.uid()));

CREATE TABLE public.mic_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  seat_index INT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mic_requests TO authenticated;
GRANT ALL ON public.mic_requests TO service_role;
ALTER TABLE public.mic_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mic requests viewable" ON public.mic_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_room(room_id, auth.uid()));
CREATE POLICY "request mic" ON public.mic_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "resolve mic request" ON public.mic_requests FOR UPDATE TO authenticated USING (public.can_manage_room(room_id, auth.uid()));
CREATE POLICY "cancel mic request" ON public.mic_requests FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.can_manage_room(room_id, auth.uid()));

CREATE TABLE public.room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX room_messages_room_idx ON public.room_messages (room_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.room_messages TO authenticated;
GRANT ALL ON public.room_messages TO service_role;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room messages viewable" ON public.room_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "send room message" ON public.room_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete room message" ON public.room_messages FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.can_manage_room(room_id, auth.uid()));

-- ===== social =====
CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status public.friend_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own friend requests" ON public.friend_requests FOR SELECT TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY "send friend request" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());
CREATE POLICY "answer friend request" ON public.friend_requests FOR UPDATE TO authenticated USING (addressee_id = auth.uid());
CREATE POLICY "cancel friend request" ON public.friend_requests FOR DELETE TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE TABLE public.friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);
GRANT SELECT, INSERT, DELETE ON public.friends TO authenticated;
GRANT ALL ON public.friends TO service_role;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friends viewable" ON public.friends FOR SELECT TO authenticated USING (true);
CREATE POLICY "add friend row" ON public.friends FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());
CREATE POLICY "remove friend row" ON public.friends FOR DELETE TO authenticated USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows viewable" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follow" ON public.follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "unfollow" ON public.follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks" ON public.blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid() OR blocked_id = auth.uid());
CREATE POLICY "block user" ON public.blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "unblock user" ON public.blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dm_pair_idx ON public.direct_messages (sender_id, receiver_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dms" ON public.direct_messages FOR SELECT TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "send dm" ON public.direct_messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "mark dm read" ON public.direct_messages FOR UPDATE TO authenticated USING (receiver_id = auth.uid());

-- ===== gifts & store =====
CREATE TABLE public.gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  animation_url TEXT,
  sound_url TEXT,
  price BIGINT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'common',
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gifts TO authenticated;
GRANT ALL ON public.gifts TO service_role;
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gifts viewable" ON public.gifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage gifts" ON public.gifts FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.gift_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id UUID NOT NULL REFERENCES public.gifts ON DELETE RESTRICT,
  sender_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_price BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gift_tx_room_idx ON public.gift_transactions (room_id, created_at DESC);
GRANT SELECT ON public.gift_transactions TO authenticated;
GRANT ALL ON public.gift_transactions TO service_role;
ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gift tx viewable" ON public.gift_transactions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.store_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  image_url TEXT,
  price BIGINT NOT NULL DEFAULT 0,
  duration_days INT,
  rarity TEXT NOT NULL DEFAULT 'common',
  required_vip INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_items TO authenticated;
GRANT ALL ON public.store_items TO service_role;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store items viewable" ON public.store_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage store" ON public.store_items FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.user_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.store_items ON DELETE CASCADE,
  is_equipped BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
GRANT SELECT, UPDATE ON public.user_items TO authenticated;
GRANT ALL ON public.user_items TO service_role;
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user items viewable" ON public.user_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "equip own items" ON public.user_items FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.vip_levels (
  level INT PRIMARY KEY,
  name TEXT NOT NULL,
  price BIGINT NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  badge_url TEXT,
  frame_url TEXT,
  name_effect TEXT,
  profile_effect TEXT,
  room_effect TEXT,
  perks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.vip_levels TO authenticated;
GRANT ALL ON public.vip_levels TO service_role;
ALTER TABLE public.vip_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vip viewable" ON public.vip_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage vip" ON public.vip_levels FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.coin_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  coins BIGINT NOT NULL,
  price_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  image_url TEXT,
  bonus_coins BIGINT NOT NULL DEFAULT 0,
  discount_percent INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.coin_packages TO authenticated;
GRANT ALL ON public.coin_packages TO service_role;
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages viewable" ON public.coin_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage packages" ON public.coin_packages FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ===== notifications, reports, bans, audit =====
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "create notification" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update own notification" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own notification" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports visible to reporter and admins" ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "create report" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "admins update reports" ON public.reports FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'room',
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bans_user_idx ON public.bans (user_id);
GRANT SELECT, INSERT, DELETE ON public.bans TO authenticated;
GRANT ALL ON public.bans TO service_role;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bans viewable" ON public.bans FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage room bans" ON public.bans FOR INSERT TO authenticated
  WITH CHECK ((scope = 'room' AND room_id IS NOT NULL AND public.can_manage_room(room_id, auth.uid())) OR public.is_admin(auth.uid()));
CREATE POLICY "remove bans" ON public.bans FOR DELETE TO authenticated
  USING ((room_id IS NOT NULL AND public.can_manage_room(room_id, auth.uid())) OR public.is_admin(auth.uid()));

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users ON DELETE SET NULL,
  target_id TEXT,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ===== realtime =====
ALTER TABLE public.room_messages REPLICA IDENTITY FULL;
ALTER TABLE public.room_mics REPLICA IDENTITY FULL;
ALTER TABLE public.room_members REPLICA IDENTITY FULL;
ALTER TABLE public.gift_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.mic_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_mics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gift_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mic_requests;

-- ===== seed data =====
INSERT INTO public.vip_levels (level,name,price,duration_days,perks) VALUES
 (1,'VIP 1',10000,30,'["شارة VIP 1","إطار خاص","دخول مميز للغرفة"]'),
 (2,'VIP 2',30000,30,'["كل مزايا VIP 1","تأثير على الاسم","هدايا حصرية"]'),
 (3,'VIP 3',80000,30,'["كل مزايا VIP 2","خلفيات حصرية","حماية من الطرد"]'),
 (4,'VIP 4',200000,30,'["كل مزايا VIP 3","ديكورات مايك حصرية","ظهور في المتصدرين"]'),
 (5,'VIP 5',500000,30,'["كل مزايا VIP 4","تأثير دخول ملكي","أعلى الامتيازات"]');

INSERT INTO public.coin_packages (name,coins,price_cents,sort_order) VALUES
 ('باقة البداية',100,99,1),
 ('باقة صغيرة',500,499,2),
 ('باقة متوسطة',1000,899,3),
 ('باقة كبيرة',5000,3999,4),
 ('باقة ضخمة',10000,7499,5),
 ('باقة الماسية',50000,34999,6),
 ('باقة الأسطورية',100000,64999,7);

INSERT INTO public.gifts (name,price,rarity,category,sort_order) VALUES
 ('وردة',10,'common','رومانسي',1),
 ('قلب',20,'common','رومانسي',2),
 ('بالون',30,'common','احتفال',3),
 ('كيك',50,'common','احتفال',4),
 ('دبدوب',100,'rare','رومانسي',5),
 ('عطر',150,'rare','فخم',6),
 ('خاتم',300,'rare','رومانسي',7),
 ('تاج',500,'epic','فخم',8),
 ('سيارة',1000,'epic','فخم',9),
 ('يخت',5000,'legendary','فخم',10),
 ('طائرة خاصة',10000,'legendary','فخم',11),
 ('قصر',50000,'legendary','فخم',12);

INSERT INTO public.store_items (name,description,category,price,rarity,required_vip) VALUES
 ('إطار ذهبي','إطار لامع لصورتك','profile_frame',2000,'rare',0),
 ('إطار ألماسي','إطار ماسي متحرك','profile_frame',8000,'epic',2),
 ('إطار النار','إطار بتأثير نيران','profile_frame',5000,'epic',0),
 ('خلفية ليلية','خلفية ملف شخصي','profile_background',1500,'common',0),
 ('خلفية المجرة','خلفية متحركة','profile_background',6000,'epic',1),
 ('خلفية غرفة كلاسيك','خلفية للغرفة','room_background',3000,'common',0),
 ('خلفية غرفة نيون','خلفية غرفة متحركة','room_background',9000,'epic',2),
 ('ديكور مقعد ذهبي','ديكور للمايك','mic_decoration',4000,'rare',0),
 ('ديكور مقعد ملكي','ديكور مايك فخم','mic_decoration',12000,'legendary',3),
 ('أضواء الغرفة','ديكور إضاءة','room_decoration',3500,'rare',0),
 ('شارة النجم','شارة مميزة','badge',2500,'rare',0),
 ('تأثير دخول ملكي','تأثير عند الدخول','effect',15000,'legendary',4);