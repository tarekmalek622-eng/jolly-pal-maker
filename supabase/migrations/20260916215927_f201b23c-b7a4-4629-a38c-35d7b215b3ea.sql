create table public.coin_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid references public.coin_packages(id),
  coins bigint not null check (coins > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EGP',
  method text not null check (method in ('vodafone_cash', 'instapay')),
  sender_reference text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert on public.coin_purchase_requests to authenticated;
grant all on public.coin_purchase_requests to service_role;

alter table public.coin_purchase_requests enable row level security;

create policy "own requests read" on public.coin_purchase_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "own requests create" on public.coin_purchase_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create trigger update_coin_purchase_requests_updated_at
  before update on public.coin_purchase_requests
  for each row execute function public.update_updated_at_column();

create index coin_purchase_requests_status_idx on public.coin_purchase_requests (status, created_at desc);
create index coin_purchase_requests_user_idx on public.coin_purchase_requests (user_id, created_at desc);

insert into public.app_settings (key, value)
values ('payment_accounts', jsonb_build_object('vodafone_cash', '', 'instapay', '', 'instructions', 'حوّل المبلغ ثم أدخل رقم عملية التحويل، وسيتم تأكيد الطلب من الإدارة.'))
on conflict (key) do nothing;

-- الموافقة على الطلب وإضافة الكوينز (يُنفَّذ من السيرفر فقط)
create or replace function public.approve_coin_purchase(_request_id uuid, _admin uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r public.coin_purchase_requests; bal bigint;
begin
  select * into r from public.coin_purchase_requests where id = _request_id for update;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then raise exception 'تمت مراجعة الطلب بالفعل'; end if;

  select coins into bal from public.coin_wallets where user_id = r.user_id for update;
  if bal is null then
    insert into public.coin_wallets (user_id, coins) values (r.user_id, 0) on conflict (user_id) do nothing;
    bal := 0;
  end if;

  update public.coin_wallets set coins = bal + r.coins, updated_at = now() where user_id = r.user_id;
  insert into public.coin_transactions (user_id, kind, amount, balance_before, balance_after, reference)
    values (r.user_id, 'topup', r.coins, bal, bal + r.coins, 'شراء كوينز: ' || r.method);
  update public.coin_purchase_requests
    set status = 'approved', reviewed_by = _admin, reviewed_at = now(), updated_at = now()
    where id = r.id;
  insert into public.notifications (user_id, kind, title, body)
    values (r.user_id, 'wallet', 'تمت إضافة الكوينز', 'تم تأكيد تحويلك وإضافة ' || r.coins || ' كوينز إلى محفظتك.');
  return bal + r.coins;
end $function$;

revoke all on function public.approve_coin_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_coin_purchase(uuid, uuid) to service_role;