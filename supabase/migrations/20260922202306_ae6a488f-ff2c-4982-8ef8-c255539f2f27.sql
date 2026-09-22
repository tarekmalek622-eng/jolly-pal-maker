DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gifts','store_items','vip_levels','cvip_plans','coin_packages','badge_definitions','quiz_questions','task_definitions','banners','app_settings'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;