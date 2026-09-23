ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_online boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

CREATE TABLE public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.profile_photos TO authenticated;
GRANT ALL ON public.profile_photos TO service_role;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos read" ON public.profile_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "photos add own" ON public.profile_photos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "photos del own" ON public.profile_photos FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.family_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.family_messages (family_id, created_at DESC);
GRANT SELECT, INSERT ON public.family_messages TO authenticated;
GRANT ALL ON public.family_messages TO service_role;
ALTER TABLE public.family_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family msgs read members" ON public.family_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_members m WHERE m.family_id = family_messages.family_id AND m.user_id = auth.uid()));
CREATE POLICY "family msgs write members" ON public.family_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.family_members m WHERE m.family_id = family_messages.family_id AND m.user_id = auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_messages;

CREATE TABLE public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_warnings TO authenticated;
GRANT ALL ON public.user_warnings TO service_role;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warnings read own or admin" ON public.user_warnings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "warnings admin add" ON public.user_warnings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());

CREATE TABLE public.market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_item_id uuid NOT NULL REFERENCES public.user_items(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  price bigint NOT NULL CHECK (price BETWEEN 1 AND 1000000000),
  status text NOT NULL DEFAULT 'active',
  buyer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz
);
CREATE UNIQUE INDEX market_one_active ON public.market_listings (user_item_id) WHERE status = 'active';
GRANT SELECT ON public.market_listings TO authenticated;
GRANT ALL ON public.market_listings TO service_role;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market read" ON public.market_listings FOR SELECT TO authenticated USING (status = 'active' OR seller_id = auth.uid() OR buyer_id = auth.uid());

-- helpers
CREATE OR REPLACE FUNCTION public._wallet_move(_uid uuid, _delta bigint, _kind text, _ref text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b bigint; a bigint;
BEGIN
  INSERT INTO coin_wallets(user_id) VALUES (_uid) ON CONFLICT DO NOTHING;
  SELECT coins INTO b FROM coin_wallets WHERE user_id = _uid FOR UPDATE;
  a := b + _delta;
  IF a < 0 THEN RAISE EXCEPTION 'رصيد غير كافٍ'; END IF;
  UPDATE coin_wallets SET coins = a, updated_at = now() WHERE user_id = _uid;
  INSERT INTO coin_transactions(user_id, kind, amount, balance_before, balance_after, reference, status)
    VALUES (_uid, _kind, _delta, b, a, _ref, 'completed');
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public._wallet_move(uuid,bigint,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transfer_coins(_to uuid, _amount bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); sent_today bigint; lim bigint := 1000000;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'غير مسجل'; END IF;
  IF _to = me THEN RAISE EXCEPTION 'لا يمكن التحويل لنفسك'; END IF;
  IF _amount < 100 THEN RAISE EXCEPTION 'الحد الأدنى 100'; END IF;
  IF NOT EXISTS (SELECT 1 FROM friends WHERE (user_id = me AND friend_id = _to) OR (user_id = _to AND friend_id = me)) THEN
    RAISE EXCEPTION 'التحويل للأصدقاء فقط'; END IF;
  SELECT coalesce(sum(-amount),0) INTO sent_today FROM coin_transactions
    WHERE user_id = me AND kind = 'transfer_out' AND created_at >= date_trunc('day', now());
  IF sent_today + _amount > lim THEN RAISE EXCEPTION 'تجاوزت الحد اليومي (1,000,000)'; END IF;
  PERFORM _wallet_move(me, -_amount, 'transfer_out', _to::text);
  PERFORM _wallet_move(_to, _amount, 'transfer_in', me::text);
  INSERT INTO notifications(user_id, kind, title, body) VALUES (_to, 'wallet', 'وصلك تحويل', 'استلمت ' || _amount || ' كوينز من صديق');
  RETURN (SELECT coins FROM coin_wallets WHERE user_id = me);
END $$;

CREATE OR REPLACE FUNCTION public.market_list(_user_item_id uuid, _price bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ui record; nid uuid;
BEGIN
  SELECT * INTO ui FROM user_items WHERE id = _user_item_id AND user_id = auth.uid();
  IF ui IS NULL THEN RAISE EXCEPTION 'العنصر غير موجود'; END IF;
  UPDATE user_items SET is_equipped = false WHERE id = ui.id;
  INSERT INTO market_listings(seller_id, user_item_id, item_id, price) VALUES (auth.uid(), ui.id, ui.item_id, _price) RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.market_cancel(_listing_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE market_listings SET status = 'cancelled' WHERE id = _listing_id AND seller_id = auth.uid() AND status = 'active';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.market_buy(_listing_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; fee bigint;
BEGIN
  SELECT * INTO l FROM market_listings WHERE id = _listing_id AND status = 'active' FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'العرض غير متاح'; END IF;
  IF l.seller_id = auth.uid() THEN RAISE EXCEPTION 'لا يمكنك شراء عرضك'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_items WHERE id = l.user_item_id AND user_id = l.seller_id) THEN
    UPDATE market_listings SET status = 'cancelled' WHERE id = l.id; RAISE EXCEPTION 'العنصر لم يعد متاحاً'; END IF;
  fee := l.price / 10;
  PERFORM _wallet_move(auth.uid(), -l.price, 'market_buy', l.id::text);
  PERFORM _wallet_move(l.seller_id, l.price - fee, 'market_sale', l.id::text);
  UPDATE user_items SET user_id = auth.uid(), is_equipped = false WHERE id = l.user_item_id;
  UPDATE market_listings SET status = 'sold', buyer_id = auth.uid(), sold_at = now() WHERE id = l.id;
  INSERT INTO notifications(user_id, kind, title, body) VALUES (l.seller_id, 'wallet', 'تم بيع عنصرك', 'بيع في السوق مقابل ' || l.price || ' (عمولة 10%)');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_broadcast(_title text, _body text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  INSERT INTO notifications(user_id, kind, title, body) SELECT id, 'system', left(_title,80), left(_body,500) FROM profiles WHERE NOT is_suspended;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO audit_logs(actor_id, action, target_type, details) VALUES (auth.uid(), 'broadcast', 'all', jsonb_build_object('title', _title));
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.admin_warn_user(_user_id uuid, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  INSERT INTO user_warnings(user_id, reason, created_by) VALUES (_user_id, left(_reason,300), auth.uid());
  INSERT INTO notifications(user_id, kind, title, body) VALUES (_user_id, 'system', 'تحذير من الإدارة', left(_reason,300));
  SELECT count(*) INTO c FROM user_warnings WHERE user_id = _user_id;
  RETURN c;
END $$;

REVOKE EXECUTE ON FUNCTION public.transfer_coins(uuid,bigint), public.market_list(uuid,bigint), public.market_cancel(uuid), public.market_buy(uuid), public.admin_broadcast(text,text), public.admin_warn_user(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_coins(uuid,bigint), public.market_list(uuid,bigint), public.market_cancel(uuid), public.market_buy(uuid), public.admin_broadcast(text,text), public.admin_warn_user(uuid,text) TO authenticated;