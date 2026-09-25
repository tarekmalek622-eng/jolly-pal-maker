-- إخفاء رصيد الوكيل عن باقي المستخدمين: نسحب الصلاحية العامة ونمنحها على الأعمدة العامة فقط
REVOKE SELECT ON public.recharge_agents FROM authenticated;
GRANT SELECT (user_id, total_recharged, is_active, whatsapp, created_at, updated_at) ON public.recharge_agents TO authenticated;

-- دالة آمنة: كل وكيل يقرأ رصيده هو فقط (والأدمن يقدر يقرأ رصيد أي وكيل)
CREATE OR REPLACE FUNCTION public.agent_my_balance(_agent_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _agent_id IS NULL OR _agent_id = auth.uid() THEN
      (SELECT balance FROM public.recharge_agents WHERE user_id = auth.uid())
    WHEN public.is_super_admin(auth.uid()) OR public.is_admin(auth.uid()) THEN
      (SELECT balance FROM public.recharge_agents WHERE user_id = _agent_id)
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION public.agent_my_balance(uuid) TO authenticated;