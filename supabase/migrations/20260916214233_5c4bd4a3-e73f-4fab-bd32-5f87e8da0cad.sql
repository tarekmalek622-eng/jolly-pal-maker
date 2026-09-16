create or replace function public.domino_has_playable(state jsonb, seat text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(array(select jsonb_array_elements_text(state->'hands'->seat))::integer[]) t
    where (state->>'left')::integer = -1
       or public.domino_tile_a(t) = (state->>'left')::integer
       or public.domino_tile_b(t) = (state->>'left')::integer
       or public.domino_tile_a(t) = (state->>'right')::integer
       or public.domino_tile_b(t) = (state->>'right')::integer
  )
$$;