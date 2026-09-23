CREATE TABLE public.recharge_agents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_recharged bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.recharge_agents TO authenticated;
GRANT ALL ON public.recharge_agents TO service_role;
ALTER TABLE public.recharge_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents visible" ON public.recharge_agents FOR SELECT TO authenticated USING (true);

CREATE TABLE public.agent_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL, -- 'fund' | 'recharge'
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_tx_agent_idx ON public.agent_transactions(agent_id, created_at DESC);
GRANT SELECT ON public.agent_transactions TO authenticated;
GRANT ALL ON public.agent_transactions TO service_role;
ALTER TABLE public.agent_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent tx own or admin" ON public.agent_transactions FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR target_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_set_agent(_public_id text, _active boolean, _whatsapp text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'للإدارة فقط'; END IF;
  SELECT id INTO uid FROM profiles WHERE public_id = _public_id;
  IF uid IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
  INSERT INTO recharge_agents(user_id, is_active, whatsapp) VALUES (uid, _active, _whatsapp)
  ON CONFLICT (user_id) DO UPDATE SET is_active = _active, whatsapp = COALESCE(_whatsapp, recharge_agents.whatsapp), updated_at = now();
  INSERT INTO notifications(user_id, kind, title, body)
    VALUES (uid, 'system', CASE WHEN _active THEN 'أصبحت وكيل شحن' ELSE 'تم إيقاف وكالة الشحن' END,
            CASE WHEN _active THEN 'حصلت على إطار وشارة وكيل الشحن' ELSE 'تم إيقاف صلاحية الشحن' END);
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'agent_set', 'user', uid::text, jsonb_build_object('active', _active));
  RETURN uid;
END $$;

CREATE OR REPLACE FUNCTION public.admin_fund_agent(_agent_id uuid, _amount bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nb bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'للإدارة فقط'; END IF;
  IF _amount = 0 THEN RAISE EXCEPTION 'مبلغ غير صالح'; END IF;
  UPDATE recharge_agents SET balance = balance + _amount, updated_at = now()
    WHERE user_id = _agent_id RETURNING balance INTO nb;
  IF nb IS NULL THEN RAISE EXCEPTION 'ليس وكيلاً'; END IF;
  INSERT INTO agent_transactions(agent_id, kind, amount, balance_after, actor_id)
    VALUES (_agent_id, 'fund', _amount, nb, auth.uid());
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'agent_fund', 'user', _agent_id::text, jsonb_build_object('amount', _amount));
  RETURN nb;
END $$;

CREATE OR REPLACE FUNCTION public.agent_recharge(_public_id text, _amount bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid; nb bigint;
BEGIN
  IF _amount < 1 THEN RAISE EXCEPTION 'مبلغ غير صالح'; END IF;
  SELECT id INTO tid FROM profiles WHERE public_id = _public_id;
  IF tid IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود'; END IF;
  IF tid = auth.uid() THEN RAISE EXCEPTION 'لا يمكنك شحن حسابك'; END IF;
  UPDATE recharge_agents SET balance = balance - _amount, total_recharged = total_recharged + _amount, updated_at = now()
    WHERE user_id = auth.uid() AND is_active AND balance >= _amount RETURNING balance INTO nb;
  IF nb IS NULL THEN RAISE EXCEPTION 'رصيد الوكالة غير كافٍ أو الوكالة غير مفعلة'; END IF;
  PERFORM public._wallet_move(tid, _amount, 'agent_recharge', auth.uid()::text);
  UPDATE coin_wallets SET recharge_points = recharge_points + _amount WHERE user_id = tid;
  INSERT INTO agent_transactions(agent_id, target_id, kind, amount, balance_after, actor_id)
    VALUES (auth.uid(), tid, 'recharge', _amount, nb, auth.uid());
  INSERT INTO notifications(user_id, kind, title, body)
    VALUES (tid, 'system', 'تم شحن حسابك', 'وصلك ' || _amount || ' كوينز من وكيل الشحن');
  RETURN nb;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_agent(text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_fund_agent(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_recharge(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_agent(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fund_agent(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_recharge(text, bigint) TO authenticated;

-- disable market & transfers
UPDATE public.market_listings SET status = 'cancelled' WHERE status = 'active';
REVOKE EXECUTE ON FUNCTION public.market_list(uuid, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.market_buy(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.market_cancel(uuid) FROM authenticated;
DO $$ BEGIN
  EXECUTE (SELECT string_agg('REVOKE EXECUTE ON FUNCTION '||oid::regprocedure||' FROM authenticated, PUBLIC, anon', '; ')
           FROM pg_proc WHERE proname='transfer_coins' AND pronamespace='public'::regnamespace);
END $$;