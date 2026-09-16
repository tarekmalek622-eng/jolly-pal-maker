revoke all on function public.refund_item(uuid) from public, anon;
grant execute on function public.refund_item(uuid) to authenticated;