CREATE TABLE public.profile_gift_totals (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES public.gifts(id) ON DELETE CASCADE,
  quantity BIGINT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  total_value BIGINT NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gift_id)
);
GRANT SELECT ON public.profile_gift_totals TO authenticated;
GRANT ALL ON public.profile_gift_totals TO service_role;
ALTER TABLE public.profile_gift_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated view profile gift totals"
ON public.profile_gift_totals FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sync_profile_gift_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_gift_totals (user_id, gift_id, quantity, total_value, updated_at)
  VALUES (NEW.receiver_id, NEW.gift_id, NEW.quantity, NEW.total_price, now())
  ON CONFLICT (user_id, gift_id) DO UPDATE SET
    quantity = public.profile_gift_totals.quantity + EXCLUDED.quantity,
    total_value = public.profile_gift_totals.total_value + EXCLUDED.total_value,
    updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_profile_gift_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_gift_total() TO service_role;

CREATE TRIGGER sync_profile_gift_total_after_insert
AFTER INSERT ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_gift_total();

INSERT INTO public.profile_gift_totals (user_id, gift_id, quantity, total_value, updated_at)
SELECT receiver_id, gift_id, SUM(quantity)::BIGINT, SUM(total_price)::BIGINT, MAX(created_at)
FROM public.gift_transactions
GROUP BY receiver_id, gift_id
ON CONFLICT (user_id, gift_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  total_value = EXCLUDED.total_value,
  updated_at = EXCLUDED.updated_at;

CREATE POLICY "authenticated view public role badges"
ON public.user_roles FOR SELECT TO authenticated
USING (true);