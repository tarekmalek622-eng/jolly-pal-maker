REVOKE ALL ON FUNCTION public.app_cup_leaderboard(text, text, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.room_cup_leaderboard(uuid, text, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.cup_event_leaderboard(uuid, integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.app_cup_leaderboard(_category text, _period text DEFAULT 'day', _limit integer DEFAULT 10)
RETURNS TABLE(entity_id uuid, public_id text, display_name text, avatar_url text, image_url text, score bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _since timestamptz := public.cup_window_start(_period); _take integer := LEAST(GREATEST(COALESCE(_limit,10),1),10);
BEGIN
  IF _category = 'supporters' THEN
    RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.profiles p ON p.id=g.sender_id WHERE g.created_at>=_since GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'receivers' THEN
    RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.profiles p ON p.id=g.receiver_id WHERE g.created_at>=_since GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'rooms' THEN
    RETURN QUERY SELECT r.id,r.room_code,r.name,NULL::text,r.image_url,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.rooms r ON r.id=g.room_id WHERE g.created_at>=_since AND g.room_id IS NOT NULL GROUP BY r.id,r.room_code,r.name,r.image_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'topups' THEN
    RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(c.coins)::bigint FROM public.coin_purchase_requests c JOIN public.profiles p ON p.id=c.user_id WHERE c.status='approved' AND c.created_at>=_since GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _category = 'game_wins' THEN
    RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(GREATEST(s.payout-s.bet,0))::bigint FROM public.game_sessions s JOIN public.profiles p ON p.id=s.user_id WHERE s.status='settled' AND s.created_at>=_since AND s.payout>s.bet GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSE RAISE EXCEPTION 'invalid category'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.app_cup_leaderboard(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.app_cup_leaderboard(text,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.room_cup_leaderboard(_room_id uuid, _period text DEFAULT 'day', _limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, public_id text, display_name text, avatar_url text, vip_level integer, score bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p.id,p.public_id,p.display_name,p.avatar_url,p.vip_level,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.profiles p ON p.id=g.sender_id WHERE g.room_id=_room_id AND g.created_at>=public.cup_window_start(_period) GROUP BY p.id,p.public_id,p.display_name,p.avatar_url,p.vip_level ORDER BY 6 DESC LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),10) $$;
REVOKE ALL ON FUNCTION public.room_cup_leaderboard(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.room_cup_leaderboard(uuid,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cup_event_leaderboard(_event_id uuid, _limit integer DEFAULT 10)
RETURNS TABLE(entity_id uuid, public_id text, display_name text, avatar_url text, image_url text, score bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _event public.cup_events%ROWTYPE; _take integer := LEAST(GREATEST(COALESCE(_limit,10),1),10);
BEGIN SELECT * INTO _event FROM public.cup_events WHERE id=_event_id; IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF _event.ranking_kind='supporters' THEN RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.profiles p ON p.id=g.sender_id WHERE g.created_at>=_event.starts_at AND g.created_at<_event.ends_at GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _event.ranking_kind='receivers' THEN RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.profiles p ON p.id=g.receiver_id WHERE g.created_at>=_event.starts_at AND g.created_at<_event.ends_at GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _event.ranking_kind='rooms' THEN RETURN QUERY SELECT r.id,r.room_code,r.name,NULL::text,r.image_url,SUM(g.total_price)::bigint FROM public.gift_transactions g JOIN public.rooms r ON r.id=g.room_id WHERE g.created_at>=_event.starts_at AND g.created_at<_event.ends_at AND g.room_id IS NOT NULL GROUP BY r.id,r.room_code,r.name,r.image_url ORDER BY 6 DESC LIMIT _take;
  ELSIF _event.ranking_kind='topups' THEN RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(c.coins)::bigint FROM public.coin_purchase_requests c JOIN public.profiles p ON p.id=c.user_id WHERE c.status='approved' AND c.created_at>=_event.starts_at AND c.created_at<_event.ends_at GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take;
  ELSE RETURN QUERY SELECT p.id,p.public_id,p.display_name,p.avatar_url,NULL::text,SUM(GREATEST(s.payout-s.bet,0))::bigint FROM public.game_sessions s JOIN public.profiles p ON p.id=s.user_id WHERE s.status='settled' AND s.payout>s.bet AND s.created_at>=_event.starts_at AND s.created_at<_event.ends_at GROUP BY p.id,p.public_id,p.display_name,p.avatar_url ORDER BY 6 DESC LIMIT _take; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cup_event_leaderboard(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cup_event_leaderboard(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_cup_event(_event_id uuid, _admin uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _event public.cup_events%ROWTYPE; _row record; _prize bigint; _before bigint; _paid integer:=0;
BEGIN
 IF NOT public.is_admin(_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO _event FROM public.cup_events WHERE id=_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
 IF _event.status='finished' THEN RETURN 0; END IF;
 IF now()<_event.ends_at THEN RAISE EXCEPTION 'event still active'; END IF;
 UPDATE public.cup_events SET status='settling' WHERE id=_event_id;
 FOR _row IN SELECT row_number() OVER (ORDER BY score DESC)::integer AS rank_no, ranked.* FROM public.cup_event_leaderboard(_event_id,10) ranked LOOP
   SELECT coins INTO _prize FROM public.cup_event_prizes WHERE event_id=_event_id AND _row.rank_no BETWEEN rank_from AND rank_to ORDER BY rank_from LIMIT 1;
   IF COALESCE(_prize,0)>0 AND _row.entity_id IS NOT NULL THEN
     INSERT INTO public.cup_event_payouts(event_id,beneficiary_user_id,rank,score,coins) VALUES(_event_id,_row.entity_id,_row.rank_no,_row.score,_prize) ON CONFLICT(event_id,beneficiary_user_id) DO NOTHING;
     IF FOUND THEN
       INSERT INTO public.coin_wallets(user_id,coins,total_received,total_sent) VALUES(_row.entity_id,_prize,_prize,0) ON CONFLICT(user_id) DO NOTHING;
       SELECT coins INTO _before FROM public.coin_wallets WHERE user_id=_row.entity_id FOR UPDATE;
       UPDATE public.coin_wallets SET coins=coins+_prize,total_received=total_received+_prize,updated_at=now() WHERE user_id=_row.entity_id;
       INSERT INTO public.coin_transactions(user_id,kind,amount,balance_before,balance_after,reference,status) VALUES(_row.entity_id,'event_prize',_prize,_before,_before+_prize,'cup_event:'||_event_id,'completed');
       _paid:=_paid+1;
     END IF;
   END IF;
 END LOOP;
 UPDATE public.cup_events SET status='finished',updated_at=now() WHERE id=_event_id;
 RETURN _paid;
END $$;
REVOKE ALL ON FUNCTION public.settle_cup_event(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cup_event(uuid,uuid) TO service_role;