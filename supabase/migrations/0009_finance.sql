-- Økonomi: tilbud, fakturaer og kreditnotaer med fortløbende numre, moms og rykkere.

-- Virksomhedsoplysninger og nummerserier
alter table public.settings
  add column if not exists company_name text not null default 'Lindstrøm Management',
  add column if not exists company_address text not null default 'Hjortevænget 205',
  add column if not exists company_zip_city text not null default '2980 Kokkedal',
  add column if not exists company_phone text not null default '50455055',
  add column if not exists company_email text not null default 'viktor@fam-lindstrom.dk',
  add column if not exists cvr text not null default '46097939',
  add column if not exists vat_registered boolean not null default true,
  add column if not exists mobilepay_number text,
  add column if not exists bank_reg text,
  add column if not exists bank_account text,
  add column if not exists payment_terms_days int not null default 8 check (payment_terms_days between 0 and 90),
  add column if not exists quote_valid_days int not null default 14 check (quote_valid_days between 1 and 180),
  add column if not exists next_invoice_number int not null default 1 check (next_invoice_number > 0),
  add column if not exists next_quote_number int not null default 1 check (next_quote_number > 0),
  add column if not exists doc_footer text;

create type public.doc_type as enum ('tilbud', 'faktura', 'kreditnota');
create type public.doc_status as enum ('kladde', 'sendt', 'accepteret', 'afvist', 'betalt', 'krediteret');

create table public.docs (
  id uuid primary key default gen_random_uuid(),
  type public.doc_type not null,
  number int,                                   -- tildeles først når dokumentet udstedes
  status public.doc_status not null default 'kladde',
  booking_id uuid references public.bookings(id) on delete set null,
  related_doc_id uuid references public.docs(id) on delete restrict,  -- faktura→tilbud, kreditnota→faktura
  customer_name text not null default '',
  customer_company text,
  customer_address text,
  customer_email text not null default '',
  customer_cvr text,
  issue_date date,
  due_date date,
  valid_until date,
  delivery_date date,
  note text,
  subtotal numeric(12,2) not null default 0,    -- ekskl. moms
  vat numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,       -- inkl. moms
  public_token text unique not null default encode(extensions.gen_random_bytes(16), 'hex'),
  sent_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  reminder_count int not null default 0,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index docs_invoice_number_uq on public.docs (number) where type in ('faktura', 'kreditnota');
create unique index docs_quote_number_uq on public.docs (number) where type = 'tilbud';
create index docs_booking_idx on public.docs (booking_id);

create table public.doc_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.docs(id) on delete cascade,
  sort int not null default 0,
  description text not null default '',
  quantity numeric(10,2) not null default 1,
  unit text not null default 'stk.',
  unit_price numeric(12,4) not null default 0   -- ekskl. moms
);
create index doc_lines_doc_idx on public.doc_lines (doc_id, sort);

create trigger docs_touch before update on public.docs
  for each row execute function public.touch_updated_at();

alter table public.docs enable row level security;
alter table public.doc_lines enable row level security;
create policy "admin alt" on public.docs for all using (private.is_admin()) with check (private.is_admin());
create policy "admin alt" on public.doc_lines for all using (private.is_admin()) with check (private.is_admin());

-- Totaler beregnes altid i databasen
create or replace function private.recalc_doc(p_doc uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub numeric;
  v_vat_reg boolean;
begin
  select coalesce(round(sum(quantity * unit_price), 2), 0) into v_sub from doc_lines where doc_id = p_doc;
  select vat_registered into v_vat_reg from settings;
  update docs set
    subtotal = v_sub,
    vat = case when v_vat_reg then round(v_sub * 0.25, 2) else 0 end,
    total = v_sub + case when v_vat_reg then round(v_sub * 0.25, 2) else 0 end
  where id = p_doc and status = 'kladde';
end;
$$;

-- Linjer på udstedte dokumenter kan ikke ændres
create or replace function private.guard_doc_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid := coalesce(new.doc_id, old.doc_id);
begin
  if (select status from docs where id = v_doc) <> 'kladde' then
    raise exception 'Dokumentet er udstedt og kan ikke ændres – lav en kreditnota i stedet';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.after_doc_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.recalc_doc(coalesce(new.doc_id, old.doc_id));
  return null;
end;
$$;

create trigger doc_lines_guard before insert or update or delete on public.doc_lines
  for each row execute function private.guard_doc_lines();
create trigger doc_lines_recalc after insert or update or delete on public.doc_lines
  for each row execute function private.after_doc_lines();

-- Udstedte dokumenter: kun status, betaling og rykkerfelter må ændres; de kan ikke slettes
create or replace function private.guard_docs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'kladde' then raise exception 'Udstedte dokumenter kan ikke slettes'; end if;
    return old;
  end if;
  if old.status <> 'kladde' and (
       new.type is distinct from old.type or new.number is distinct from old.number
    or new.customer_name is distinct from old.customer_name or new.customer_company is distinct from old.customer_company
    or new.customer_address is distinct from old.customer_address or new.customer_email is distinct from old.customer_email
    or new.customer_cvr is distinct from old.customer_cvr or new.issue_date is distinct from old.issue_date
    or new.due_date is distinct from old.due_date or new.valid_until is distinct from old.valid_until
    or new.delivery_date is distinct from old.delivery_date or new.note is distinct from old.note
    or new.subtotal is distinct from old.subtotal or new.vat is distinct from old.vat or new.total is distinct from old.total
  ) then
    raise exception 'Dokumentet er udstedt og kan ikke ændres – lav en kreditnota i stedet';
  end if;
  if new.status = 'kladde' and old.status <> 'kladde' then
    raise exception 'Et udstedt dokument kan ikke gøres til kladde igen';
  end if;
  return new;
end;
$$;

create trigger docs_guard before update or delete on public.docs
  for each row execute function private.guard_docs();

-- Udsted dokument: tildel fortløbende nummer og datoer (kun admin)
create or replace function public.finalize_doc(p_id uuid)
returns public.docs
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.docs;
  s public.settings;
  v_num int;
begin
  if not private.is_admin() then raise exception 'Ingen adgang'; end if;
  select * into d from docs where id = p_id for update;
  if not found then raise exception 'Dokumentet findes ikke'; end if;
  if d.status <> 'kladde' then return d; end if;
  if coalesce(trim(d.customer_name), '') = '' or coalesce(trim(d.customer_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Udfyld kundens navn og en gyldig e-mail';
  end if;
  if d.type in ('faktura', 'kreditnota') and coalesce(trim(d.customer_address), '') = '' then
    raise exception 'En faktura skal have kundens adresse';
  end if;
  if not exists (select 1 from doc_lines where doc_id = p_id) then raise exception 'Tilføj mindst én linje'; end if;

  perform private.recalc_doc(p_id);
  select * into s from settings limit 1 for update;
  if d.type = 'tilbud' then
    v_num := s.next_quote_number;
    update settings set next_quote_number = v_num + 1 where id;
  else
    v_num := s.next_invoice_number;
    update settings set next_invoice_number = v_num + 1 where id;
  end if;

  update docs set
    number = v_num,
    status = 'sendt',
    sent_at = now(),
    issue_date = coalesce(issue_date, current_date),
    due_date = case when type = 'faktura' then coalesce(due_date, current_date + s.payment_terms_days) end,
    valid_until = case when type = 'tilbud' then coalesce(valid_until, current_date + s.quote_valid_days) end
  where id = p_id
  returning * into d;

  -- Tilbud sendt → booking får status "tilbud sendt"
  if d.type = 'tilbud' and d.booking_id is not null then
    update bookings set status = 'tilbud_sendt' where id = d.booking_id and status = 'ny';
  end if;
  -- Kreditnota der dækker hele fakturaen → fakturaen markeres krediteret
  if d.type = 'kreditnota' and d.related_doc_id is not null then
    update docs set status = 'krediteret'
      where id = d.related_doc_id and type = 'faktura' and status in ('sendt', 'betalt')
        and d.total >= total;
  end if;
  return d;
end;
$$;
revoke execute on function public.finalize_doc(uuid) from public, anon;
grant execute on function public.finalize_doc(uuid) to authenticated;

-- Offentlig visning af et udstedt dokument
create or replace function public.get_public_doc(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.docs;
  s public.settings;
begin
  select * into d from docs where public_token = p_token and length(p_token) >= 32 and status <> 'kladde';
  if not found then raise exception 'Dokumentet findes ikke'; end if;
  select * into s from settings limit 1;
  return jsonb_build_object(
    'doc', to_jsonb(d) - 'public_token' - 'booking_id' - 'reminder_count' - 'last_reminder_at',
    'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'doc_id' order by l.sort) from doc_lines l where l.doc_id = d.id), '[]'::jsonb),
    'related_number', (select number from docs where id = d.related_doc_id),
    'company', jsonb_build_object(
      'name', s.company_name, 'address', s.company_address, 'zip_city', s.company_zip_city,
      'phone', s.company_phone, 'email', s.company_email, 'cvr', s.cvr, 'vat_registered', s.vat_registered,
      'mobilepay_number', s.mobilepay_number, 'bank_reg', s.bank_reg, 'bank_account', s.bank_account,
      'footer', s.doc_footer)
  );
end;
$$;

-- Kunden accepterer tilbud → booking bekræftes (det udløser bekræftelsesmail med musikønsker)
create or replace function public.accept_quote(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.docs;
begin
  select * into d from docs where public_token = p_token and length(p_token) >= 32 and type = 'tilbud' for update;
  if not found then raise exception 'Tilbuddet findes ikke'; end if;
  if d.status = 'accepteret' then return 'already'; end if;
  if d.status <> 'sendt' then raise exception 'Tilbuddet kan ikke længere accepteres'; end if;
  if d.valid_until < current_date then raise exception 'Tilbuddet er udløbet – kontakt DJ Lindstrøm for et nyt'; end if;

  update docs set status = 'accepteret', accepted_at = now() where id = d.id;
  if d.booking_id is not null then
    update bookings set status = 'bekraeftet', quoted_price = d.total
      where id = d.booking_id and status in ('ny', 'tilbud_sendt');
  end if;
  perform private.call_edge('doc-mail', jsonb_build_object('doc_id', d.id, 'kind', 'accepted'));
  return 'accepted';
end;
$$;

revoke execute on function public.get_public_doc(text), public.accept_quote(text) from public;
grant execute on function public.get_public_doc(text), public.accept_quote(text) to anon, authenticated;

-- Generel hjælper til at kalde edge functions fra databasen
create or replace function private.call_edge(p_function text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://vubxctebuwiftamiskxs.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnhjdGVidXdpZnRhbWlza3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzcwNzMsImV4cCI6MjEwNTkxMzA3M30.7Vpj4717GHiV7uDsHGBUxSQONqu1YH0R9L9dbbrlsyA'
    ),
    body := p_body
  );
end;
$$;
revoke execute on function private.call_edge(text, jsonb) from public, anon, authenticated;
revoke execute on function private.recalc_doc(uuid), private.guard_doc_lines(), private.after_doc_lines(), private.guard_docs()
  from public, anon, authenticated;

-- Dagligt: rykkere for forfaldne fakturaer (højst 3, mindst 7 dage imellem)
create or replace function private.daily_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from docs
    where type = 'faktura' and status = 'sendt' and due_date < current_date
      and reminder_count < 3
      and (last_reminder_at is null or last_reminder_at < now() - interval '7 days')
  loop
    perform private.call_edge('doc-mail', jsonb_build_object('doc_id', r.id, 'kind', 'reminder'));
  end loop;
end;
$$;
revoke execute on function private.daily_reminders() from public, anon, authenticated;

-- Kl. 08:15 UTC hver dag
select cron.schedule('djl-reminders', '15 8 * * *', $$select private.daily_reminders()$$);
