REVOKE EXECUTE ON FUNCTION public.agent_my_balance(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_my_balance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.agent_my_balance(uuid) TO authenticated;