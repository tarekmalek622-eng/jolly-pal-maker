create or replace function public.mic_protection_for(_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(v.mic_protection), 0)
  from public.profiles p
  left join public.vip_levels v on v.level = p.vip_level
  where p.id = _user_id
$$;

revoke execute on function public.mic_protection_for(uuid) from public, anon;
grant execute on function public.mic_protection_for(uuid) to authenticated, service_role;

create or replace function public.enforce_mic_protection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  owner uuid;
  target_prot int;
  actor_prot int;
  hostile boolean;
begin
  -- service role / internal calls bypass
  if actor is null then
    return new;
  end if;

  hostile := old.user_id is not null
    and old.user_id <> actor
    and ((new.user_id is distinct from old.user_id) or (new.is_muted and not old.is_muted) or (new.is_locked and not old.is_locked));

  if not hostile then
    return new;
  end if;

  select r.owner_id into owner from public.rooms r where r.id = old.room_id;
  if owner = actor or app_internal.has_role(actor, 'admin') or app_internal.has_role(actor, 'super_admin') then
    return new;
  end if;

  target_prot := public.mic_protection_for(old.user_id);
  if target_prot = 0 then
    return new;
  end if;

  actor_prot := public.mic_protection_for(actor);
  if actor_prot > target_prot then
    return new;
  end if;

  raise exception 'هذا المستخدم محمي بمستوى VIP ولا يمكن إنزاله أو كتمه';
end;
$$;

drop trigger if exists trg_enforce_mic_protection on public.room_mics;
create trigger trg_enforce_mic_protection
before update on public.room_mics
for each row execute function public.enforce_mic_protection();