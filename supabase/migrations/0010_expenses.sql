-- Udgifter: køb af udstyr, kørsel, musiktjenester mv. med kvitteringsbillede.
-- Beløb gemmes inkl. moms; momsdelen (købsmoms) gemmes separat, så den kan rettes
-- (fx 0 ved køb uden moms eller fra udlandet).

create type public.expense_category as enum ('udstyr', 'koersel', 'musik', 'markedsfoering', 'transport', 'andet');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  supplier text not null default '',
  description text not null default '',
  category public.expense_category not null default 'andet',
  amount numeric(12,2) not null check (amount >= 0),       -- inkl. moms
  vat numeric(12,2) not null default 0 check (vat >= 0),   -- købsmoms (fradrag)
  receipt_path text,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vat_not_above_amount check (vat <= amount)
);
create index expenses_date_idx on public.expenses (expense_date desc);

alter table public.expenses enable row level security;
create policy "admin alt" on public.expenses for all using (private.is_admin()) with check (private.is_admin());

-- Privat bucket til kvitteringer (kun admin kan se/uploade)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "admin kvitteringer læs" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and private.is_admin());
create policy "admin kvitteringer upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and private.is_admin());
create policy "admin kvitteringer ret" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and private.is_admin());
create policy "admin kvitteringer slet" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and private.is_admin());

-- Kun admin (authenticated + RLS) – anon har intet at gøre her
revoke all on public.expenses from anon;
