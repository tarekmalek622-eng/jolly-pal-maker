create or replace function public.domino_pips(state jsonb, seat text)
returns integer
language sql
immutable
set search_path to ''
as $$
  select coalesce(sum(public.domino_tile_a(t) + public.domino_tile_b(t)), 0)::integer
  from unnest(array(select jsonb_array_elements_text(state->'hands'->seat))::integer[]) t
$$;