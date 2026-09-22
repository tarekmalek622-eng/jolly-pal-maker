CREATE TABLE IF NOT EXISTS public.banned_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.banned_words TO authenticated;
GRANT ALL ON public.banned_words TO service_role;

ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage banned words" ON public.banned_words
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_banned_words_updated_at
  BEFORE UPDATE ON public.banned_words
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation members read reactions" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.direct_messages m
    WHERE m.id = message_reactions.message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  ));

CREATE POLICY "users add own reactions" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.direct_messages m
    WHERE m.id = message_reactions.message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  ));

CREATE POLICY "users update own reactions" ON public.message_reactions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own reactions" ON public.message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON public.message_reactions (message_id);

CREATE TRIGGER update_message_reactions_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.send_room_message(_room_id uuid, _body text)
 RETURNS room_messages
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE result public.room_messages;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(btrim(_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'الرسالة غير صالحة'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.banned_words w
    WHERE lower(btrim(_body)) LIKE '%' || lower(w.word) || '%'
  ) THEN
    RAISE EXCEPTION 'الرسالة تحتوي كلمات محظورة';
  END IF;
  INSERT INTO public.room_messages (room_id, user_id, body, kind)
  VALUES (_room_id, auth.uid(), btrim(_body), 'text')
  RETURNING * INTO result;
  RETURN result;
END;
$function$;