CREATE OR REPLACE FUNCTION public.settle_cup_event(_event_id uuid, _admin uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _event public.cup_events%ROWTYPE; _row record; _prize bigint; _before bigint; _paid integer:=0; _ben uuid;
BEGIN
 IF _admin IS NOT NULL AND NOT public.is_admin(_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO _event FROM public.cup_events WHERE id=_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
 IF _event.status='finished' THEN RETURN 0; END IF;
 IF now()<_event.ends_at THEN RAISE EXCEPTION 'event still active'; END IF;
 UPDATE public.cup_events SET status='settling' WHERE id=_event_id;
 FOR _row IN SELECT row_number() OVER (ORDER BY score DESC)::integer AS rank_no, ranked.* FROM public.cup_event_leaderboard(_event_id,10) ranked LOOP
   SELECT coins INTO _prize FROM public.cup_event_prizes WHERE event_id=_event_id AND _row.rank_no BETWEEN rank_from AND rank_to ORDER BY rank_from LIMIT 1;
   -- أحداث الغرف: المستفيد هو مالك الغرفة
   _ben := _row.entity_id;
   IF _event.ranking_kind = 'rooms' THEN
     SELECT owner_id INTO _ben FROM public.rooms WHERE id = _row.entity_id;
   END IF;
   IF _ben IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _ben) THEN _ben := NULL; END IF;
   IF COALESCE(_prize,0)>0 AND _ben IS NOT NULL THEN
     INSERT INTO public.cup_event_payouts(event_id,beneficiary_user_id,rank,score,coins) VALUES(_event_id,_ben,_row.rank_no,_row.score,_prize) ON CONFLICT(event_id,beneficiary_user_id) DO NOTHING;
     IF FOUND THEN
       INSERT INTO public.coin_wallets(user_id,coins,total_received,total_sent) VALUES(_ben,_prize,_prize,0) ON CONFLICT(user_id) DO NOTHING;
       SELECT coins INTO _before FROM public.coin_wallets WHERE user_id=_ben FOR UPDATE;
       UPDATE public.coin_wallets SET coins=coins+_prize,total_received=total_received+_prize,updated_at=now() WHERE user_id=_ben;
       INSERT INTO public.coin_transactions(user_id,kind,amount,balance_before,balance_after,reference,status) VALUES(_ben,'event_prize',_prize,_before,_before+_prize,'cup_event:'||_event_id,'completed');
       _paid:=_paid+1;
     END IF;
   END IF;
 END LOOP;
 UPDATE public.cup_events SET status='finished',updated_at=now() WHERE id=_event_id;
 RETURN _paid;
END $function$;
REVOKE ALL ON FUNCTION public.settle_cup_event(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cup_event(uuid, uuid) TO service_role;