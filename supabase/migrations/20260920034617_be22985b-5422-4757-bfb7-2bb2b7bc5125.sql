DROP FUNCTION IF EXISTS public.settle_game(uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION public.settle_game(_user_id uuid, _bet bigint, _payout bigint, _label text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _balance BIGINT; _net BIGINT; _after BIGINT; _max BIGINT;
BEGIN
  SELECT COALESCE((value->>'max_bet')::bigint, 200000000) INTO _max FROM public.app_settings WHERE key = 'limits';
  _max := COALESCE(_max, 200000000);
  IF _bet < 10 OR _bet > _max THEN
    RAISE EXCEPTION 'مبلغ الرهان يجب أن يكون بين 10 و % كوينز', _max;
  END IF;
  IF _payout < 0 OR _payout > _bet * 100 THEN
    RAISE EXCEPTION 'قيمة الربح غير صالحة';
  END IF;

  SELECT coins INTO _balance FROM public.coin_wallets WHERE user_id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN RAISE EXCEPTION 'لا توجد محفظة لهذا المستخدم'; END IF;
  IF _balance < _bet THEN RAISE EXCEPTION 'رصيدك غير كافٍ'; END IF;

  _net := _payout - _bet;
  _after := _balance + _net;
  UPDATE public.coin_wallets SET coins = _after, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
  VALUES (_user_id, 'game', _net, _balance, _after, _label);
  RETURN _after;
END $function$;

REVOKE ALL ON FUNCTION public.settle_game(uuid, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_game(uuid, bigint, bigint, text) TO service_role;

INSERT INTO public.app_settings(key, value) VALUES ('limits', jsonb_build_object('min_bet', 10, 'max_bet', 200000000))
ON CONFLICT (key) DO UPDATE SET value = public.app_settings.value || jsonb_build_object('max_bet', GREATEST(COALESCE((public.app_settings.value->>'max_bet')::bigint,0), 200000000)), updated_at = now();