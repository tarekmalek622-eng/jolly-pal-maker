revoke all on function public.domino_settings() from public, anon, authenticated;
revoke all on function public.domino_log(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.domino_settings() to service_role;
grant execute on function public.domino_log(jsonb, jsonb) to service_role;