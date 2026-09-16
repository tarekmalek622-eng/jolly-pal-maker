create schema if not exists app_internal;
revoke all on schema app_internal from anon, authenticated;

alter function public.domino_tile_a(integer) set search_path = '';
alter function public.domino_tile_b(integer) set search_path = '';
alter function public.domino_deal() set search_path = '';
alter function public.domino_has_playable(jsonb, text) set search_path = '';
alter function public.domino_pips(jsonb, text) set search_path = '';

alter function public.has_role(uuid, public.app_role) set schema app_internal;
alter function public.can_manage_room(uuid, uuid) set schema app_internal;