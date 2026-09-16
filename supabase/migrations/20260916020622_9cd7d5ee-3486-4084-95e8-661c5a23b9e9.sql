CREATE OR REPLACE FUNCTION public.settle_game(_user_id UUID, _bet INT, _payout INT, _label TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance INT;
  _net INT;
  _after INT;
BEGIN
  IF _bet < 10 OR _bet > 100000 THEN
    RAISE EXCEPTION 'مبلغ الرهان غير صالح';
  END IF;
  IF _payout < 0 OR _payout > _bet * 10 THEN
    RAISE EXCEPTION 'قيمة الربح غير صالحة';
  END IF;

  SELECT coins INTO _balance FROM public.coin_wallets WHERE user_id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN
    RAISE EXCEPTION 'لا توجد محفظة لهذا المستخدم';
  END IF;
  IF _balance < _bet THEN
    RAISE EXCEPTION 'رصيدك غير كافٍ';
  END IF;

  _net := _payout - _bet;
  _after := _balance + _net;

  UPDATE public.coin_wallets SET coins = _after, updated_at = now() WHERE user_id = _user_id;

  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (_user_id, 'game', _net, _balance, _after, _label);

  RETURN _after;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_game(UUID, INT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_game(UUID, INT, INT, TEXT) TO service_role;