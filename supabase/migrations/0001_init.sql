-- DJ Lindstrom – databaseopsætning
-- Kør hele filen i Supabase: SQL Editor -> New query -> Run

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Admins: e-mails der må logge ind i admin
-- ---------------------------------------------------------------
create table public.admins (
  email text primary key
);

insert into public.admins (email) values ('viktor@fam-lindstrom.dk');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------
-- Indstillinger (fx om priser vises for kunder)
-- ---------------------------------------------------------------
create table public.settings (
  id boolean primary key default true check (id),  -- kun én række
  show_prices boolean not null default false,
  confirmation_text text not null default
    'Tak for din forespørgsel – vi kontakter dig og sender et tilbud inden for 24 timer.'
);

insert into public.settings default values;

-- ---------------------------------------------------------------
-- Event-typer, temaer og lydpakker (Viktor opretter selv)
-- ---------------------------------------------------------------
create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text,                       -- emoji, fx 🎉
  min_hours numeric(3,1) not null default 2,
  max_hours numeric(3,1) not null default 8,
  price numeric(10,2),             -- vises kun hvis settings.show_prices
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (min_hours > 0 and max_hours >= min_hours)
);

create table public.event_themes (
  id uuid primary key default gen_random_uuid(),
  event_type_id uuid not null references public.event_types(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.sound_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Blokerede datoer (ferie, eksamen mv.)
-- ---------------------------------------------------------------
create table public.blocked_dates (
  date date primary key,
  reason text
);

-- ---------------------------------------------------------------
-- Forespørgsler / bookinger
-- ---------------------------------------------------------------
create type public.booking_status as enum
  ('ny', 'tilbud_sendt', 'bekraeftet', 'afholdt', 'afvist', 'annulleret');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  status public.booking_status not null default 'ny',
  event_type_id uuid references public.event_types(id) on delete set null,
  event_theme_id uuid references public.event_themes(id) on delete set null,
  event_date date not null,
  start_time time not null,
  hours numeric(3,1) not null check (hours > 0 and hours <= 24),
  venue_address text not null,
  guest_count int check (guest_count is null or guest_count >= 0),
  customer_name text not null,
  company text,
  email text not null,
  phone text not null,
  message text,
  internal_notes text,
  quoted_price numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_event_date_idx on public.bookings (event_date);
create index bookings_status_idx on public.bookings (status);

create table public.booking_packages (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  package_id uuid not null references public.sound_packages(id) on delete cascade,
  primary key (booking_id, package_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Row Level Security
-- Kunder (anon) må kun læse aktive typer/pakker/blokerede datoer
-- og oprette forespørgsler via submit_booking_request().
-- Admin må alt.
-- ---------------------------------------------------------------
alter table public.admins           enable row level security;
alter table public.settings         enable row level security;
alter table public.event_types      enable row level security;
alter table public.event_themes     enable row level security;
alter table public.sound_packages   enable row level security;
alter table public.blocked_dates    enable row level security;
alter table public.bookings         enable row level security;
alter table public.booking_packages enable row level security;

create policy "admin alt" on public.admins           for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.settings         for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.event_types      for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.event_themes     for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.sound_packages   for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.blocked_dates    for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.bookings         for all using (public.is_admin()) with check (public.is_admin());
create policy "admin alt" on public.booking_packages for all using (public.is_admin()) with check (public.is_admin());

create policy "offentlig læs aktive" on public.event_types    for select to anon using (active);
create policy "offentlig læs aktive" on public.event_themes   for select to anon using (active);
create policy "offentlig læs aktive" on public.sound_packages for select to anon using (active);
create policy "offentlig læs"        on public.blocked_dates  for select to anon using (true);
create policy "offentlig læs"        on public.settings       for select to anon using (true);

-- Kunder må ikke se priser eller årsager til blokeringer, før det slås til.
-- Kolonne-rettigheder: anon får kun de kolonner, kundesiden skal bruge.
revoke select on public.event_types, public.sound_packages, public.blocked_dates from anon;
grant select (id, name, description, icon, min_hours, max_hours, sort_order, active)
  on public.event_types to anon;
grant select (id, name, description, sort_order, active)
  on public.sound_packages to anon;
grant select (date) on public.blocked_dates to anon;

-- Priser for kunder: returnerer kun noget, når show_prices er slået til
create or replace function public.public_prices()
returns table (kind text, id uuid, price numeric)
language sql
stable
security definer
set search_path = public
as $$
  select 'event_type', e.id, e.price from event_types e, settings s
    where s.show_prices and e.active
  union all
  select 'sound_package', p.id, p.price from sound_packages p, settings s
    where s.show_prices and p.active;
$$;

grant execute on function public.public_prices() to anon, authenticated;

-- ---------------------------------------------------------------
-- Opret forespørgsel (kaldes fra kundesiden)
-- ---------------------------------------------------------------
create or replace function public.submit_booking_request(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  et public.event_types;
  v_date date := (payload ->> 'event_date')::date;
  v_hours numeric := (payload ->> 'hours')::numeric;
begin
  select * into et from event_types
    where id = (payload ->> 'event_type_id')::uuid and active;
  if not found then
    raise exception 'Ukendt event-type';
  end if;

  if v_date < current_date then
    raise exception 'Datoen er overstået';
  end if;

  if exists (select 1 from blocked_dates where date = v_date) then
    raise exception 'Datoen er desværre ikke ledig';
  end if;

  if v_hours < et.min_hours or v_hours > et.max_hours then
    raise exception 'Antal timer skal være mellem % og %', et.min_hours, et.max_hours;
  end if;

  if coalesce(trim(payload ->> 'customer_name'), '') = ''
     or coalesce(trim(payload ->> 'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(trim(payload ->> 'phone'), '') = ''
     or coalesce(trim(payload ->> 'venue_address'), '') = '' then
    raise exception 'Udfyld venligst navn, e-mail, telefon og adresse';
  end if;

  insert into bookings (
    event_type_id, event_theme_id, event_date, start_time, hours,
    venue_address, guest_count, customer_name, company, email, phone, message
  ) values (
    et.id,
    (select id from event_themes
       where id = nullif(payload ->> 'event_theme_id', '')::uuid
         and event_type_id = et.id and active),
    v_date,
    (payload ->> 'start_time')::time,
    v_hours,
    left(trim(payload ->> 'venue_address'), 300),
    nullif(payload ->> 'guest_count', '')::int,
    left(trim(payload ->> 'customer_name'), 120),
    left(nullif(trim(payload ->> 'company'), ''), 120),
    left(trim(payload ->> 'email'), 200),
    left(trim(payload ->> 'phone'), 40),
    left(nullif(trim(payload ->> 'message'), ''), 2000)
  )
  returning id into new_id;

  insert into booking_packages (booking_id, package_id)
    select new_id, p.id from sound_packages p
    where p.active
      and p.id::text in (select jsonb_array_elements_text(coalesce(payload -> 'package_ids', '[]'::jsonb)));

  return new_id;
end;
$$;

revoke execute on function public.submit_booking_request(jsonb) from public;
grant execute on function public.submit_booking_request(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------
-- Eksempeldata (kan rettes/slettes i admin)
-- ---------------------------------------------------------------
insert into public.event_types (name, icon, description, min_hours, max_hours, sort_order) values
  ('18 års fødselsdag', '🎉', 'Fest med fuld dansegulv',        3, 8, 1),
  ('Rund fødselsdag',   '🎂', '30, 40, 50, 60 år …',             3, 8, 2),
  ('Bryllup',           '💍', 'Fra første dans til sidste sang', 4, 10, 3),
  ('Reception',         '🥂', 'Stemningsmusik i baggrunden',     1, 4, 4),
  ('Firmaevent',        '🏢', 'Julefrokost, sommerfest m.m.',    2, 8, 5),
  ('Club',              '🪩', 'Club-aften med tema',             2, 6, 6);

insert into public.event_themes (event_type_id, name, sort_order)
  select id, t.name, t.ord from public.event_types,
    (values ('90''er', 1), ('House / Techno', 2), ('Latin', 3), ('Hip hop / R&B', 4)) as t(name, ord)
  where event_types.name = 'Club';

insert into public.sound_packages (name, description, sort_order) values
  ('Lille lydanlæg',  'Op til ca. 50 gæster',                 1),
  ('Stort lydanlæg',  'Op til ca. 200 gæster, inkl. subwoofer', 2),
  ('Lys',             'Partylys og effekter',                 3),
  ('Røgmaskine',      'Til de rigtige lyseffekter',           4),
  ('Trådløs mikrofon','Til taler og annonceringer',           5);
