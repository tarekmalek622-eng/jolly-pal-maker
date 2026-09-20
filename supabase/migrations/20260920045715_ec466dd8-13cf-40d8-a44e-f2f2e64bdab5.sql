CREATE OR REPLACE FUNCTION public.room_treasure_on_gift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; box public.room_treasure; target bigint;
BEGIN
  IF NEW.room_id IS NULL THEN RETURN NEW; END IF;
  s := public.room_treasure_settings();
  IF COALESCE((s->>'enabled')::boolean, true) = false THEN RETURN NEW; END IF;

  INSERT INTO public.room_treasure (room_id) VALUES (NEW.room_id) ON CONFLICT (room_id) DO NOTHING;
  INSERT INTO public.room_treasure_contribs (room_id, user_id, amount)
  VALUES (NEW.room_id, NEW.sender_id, NEW.total_price)
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET amount = public.room_treasure_contribs.amount + EXCLUDED.amount, updated_at = now();

  SELECT * INTO box FROM public.room_treasure WHERE room_id = NEW.room_id;
  SELECT (l->>'target')::bigint INTO target
    FROM jsonb_array_elements(COALESCE(s->'levels','[]'::jsonb)) l
   WHERE (l->>'level')::int = box.level LIMIT 1;

  IF target IS NULL OR target <= 0 THEN
    UPDATE public.room_treasure SET progress = progress + NEW.total_price, updated_at = now() WHERE room_id = NEW.room_id;
    RETURN NEW;
  END IF;

  -- التقدّم لا يتجاوز هدف المستوى، والهدية الواحدة تفتح الصندوق مرة واحدة فقط
  UPDATE public.room_treasure
     SET progress = LEAST(progress + NEW.total_price, target), updated_at = now()
   WHERE room_id = NEW.room_id
  RETURNING * INTO box;

  IF box.progress >= target THEN
    PERFORM public.room_treasure_open(NEW.room_id, box.level, target, s);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.room_treasure_open(_room_id uuid, _level integer, _target bigint, _s jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lvl jsonb; open_id uuid; total bigint := 0; cnt integer := 0; r record; max_level integer;
BEGIN
  lvl := (SELECT l FROM jsonb_array_elements(COALESCE(_s->'levels','[]'::jsonb)) l WHERE (l->>'level')::int = _level LIMIT 1);
  INSERT INTO public.room_treasure_opens (room_id, level, target) VALUES (_room_id, _level, _target) RETURNING id INTO open_id;

  FOR r IN
    SELECT p.rank, p.coins, c.user_id, c.amount
      FROM (SELECT (x->>'rank')::int AS rank, (x->>'coins')::bigint AS coins
              FROM jsonb_array_elements(COALESCE(lvl->'prizes','[]'::jsonb)) x) p
      JOIN (SELECT user_id, amount, row_number() OVER (ORDER BY amount DESC) AS rn
              FROM public.room_treasure_contribs WHERE room_id = _room_id AND amount > 0) c
        ON c.rn = p.rank
  LOOP
    INSERT INTO public.room_treasure_payouts (open_id, room_id, user_id, rank, contribution, coins)
    VALUES (open_id, _room_id, r.user_id, r.rank, r.amount, r.coins);

    INSERT INTO public.coin_wallets (user_id, coins) VALUES (r.user_id, 0) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET coins = coins + r.coins, updated_at = now() WHERE user_id = r.user_id;
    INSERT INTO public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference, status)
    SELECT r.user_id, 'treasure_prize', r.coins, w.coins - r.coins, w.coins, 'treasure:' || open_id::text, 'completed'
      FROM public.coin_wallets w WHERE w.user_id = r.user_id;
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (r.user_id, 'treasure', 'جائزة صندوق الكنز', 'حصلت على ' || r.coins::text || ' عملة من فتح صندوق كنز الغرفة');
    total := total + r.coins;
    cnt := cnt + 1;
  END LOOP;

  UPDATE public.room_treasure_opens SET total_prize = total, winners = cnt WHERE id = open_id;
  DELETE FROM public.room_treasure_contribs WHERE room_id = _room_id;

  SELECT MAX((l->>'level')::int) INTO max_level FROM jsonb_array_elements(COALESCE(_s->'levels','[]'::jsonb)) l;
  UPDATE public.room_treasure
     SET progress = 0,
         level = CASE WHEN _level >= COALESCE(max_level, _level) THEN COALESCE(max_level, _level) ELSE _level + 1 END,
         total_opened = total_opened + 1,
         last_opened_at = now(),
         updated_at = now()
   WHERE room_id = _room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.room_treasure_on_gift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_treasure_open(uuid, integer, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_treasure_open(uuid, integer, bigint, jsonb) TO service_role;