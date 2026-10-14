-- Spam-beskyttelse af bookingformularen + automatisk sletning af gamle persondata.

-- Log over forespørgsler til hastighedsbegrænsning. IP gemmes kun som hash (med dato,
-- så den ikke kan følges over flere dage), og rækker slettes efter 2 døgn (private.retention_cleanup).
create table if not exists private.request_log (
  kind text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_log_idx on private.request_log (kind, key, created_at);

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
  v_email text := lower(trim(payload ->> 'email'));
  v_ip text := split_part(coalesce(
                 current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
                 current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  v_ip_key text;
  v_too_fast boolean;
begin
  -- Bots: skjult felt udfyldt, eller formularen udfyldt urealistisk hurtigt.
  -- Svar "OK" uden at gemme noget, så botten ikke lærer noget.
  -- (plpgsql's IF kan ikke rumme CASE ... THEN, derfor en hjælpevariabel)
  v_too_fast := case when payload ->> 'form_ms' ~ '^\d{1,9}$' then (payload ->> 'form_ms')::int < 4000 else false end;
  if coalesce(payload ->> 'website', '') <> '' or v_too_fast then
    return gen_random_uuid();
  end if;

  v_ip_key := case when trim(v_ip) <> '' then encode(extensions.digest(trim(v_ip) || current_date::text, 'sha256'), 'hex') end;

  if v_ip_key is not null and (
       (select count(*) from private.request_log where kind = 'booking_ip' and key = v_ip_key and created_at > now() - interval '1 hour') >= 5
    or (select count(*) from private.request_log where kind = 'booking_ip' and key = v_ip_key and created_at > now() - interval '1 day') >= 10) then
    raise exception 'Du har sendt mange forespørgsler på kort tid. Prøv igen senere, eller skriv direkte til viktor@fam-lindstrom.dk';
  end if;
  if (select count(*) from private.request_log where kind = 'booking_email' and key = v_email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Vi har allerede modtaget flere forespørgsler fra din e-mail i dag – vi vender tilbage hurtigst muligt. Skriv til viktor@fam-lindstrom.dk, hvis noget skal ændres';
  end if;
  if (select count(*) from private.request_log where kind = 'booking_email' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Der er travlt lige nu – prøv igen om lidt, eller skriv til viktor@fam-lindstrom.dk';
  end if;

  select * into et from event_types
    where id = (payload ->> 'event_type_id')::uuid and active;
  if not found then
    raise exception 'Ukendt event-type';
  end if;

  if v_date < current_date then
    raise exception 'Datoen er overstået';
  end if;
  if v_date > current_date + interval '3 years' then
    raise exception 'Vælg en dato inden for de næste 3 år';
  end if;

  if exists (select 1 from blocked_dates where date = v_date) then
    raise exception 'Datoen er desværre ikke ledig';
  end if;

  if v_hours is null or v_hours < et.min_hours or v_hours > et.max_hours then
    raise exception 'Antal timer skal være mellem % og %', et.min_hours, et.max_hours;
  end if;

  if coalesce(trim(payload ->> 'customer_name'), '') = ''
     or coalesce(v_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or length(v_email) > 200
     or coalesce(trim(payload ->> 'phone'), '') = ''
     or coalesce(trim(payload ->> 'venue_address'), '') = '' then
    raise exception 'Udfyld venligst navn, e-mail, telefon og adresse';
  end if;

  if coalesce(payload ->> 'guest_count', '') <> '' and (payload ->> 'guest_count') !~ '^\d{1,5}$' then
    raise exception 'Antal gæster skal være et tal';
  end if;

  insert into private.request_log (kind, key) values ('booking_email', v_email);
  if v_ip_key is not null then
    insert into private.request_log (kind, key) values ('booking_ip', v_ip_key);
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

-- Sletning efter privatlivspolitikken (kører dagligt):
--  * gæsters live-ønsker og stemmer: 30 dage efter festen
--  * forespørgsler der aldrig blev til en booking (og ikke har tilbud/faktura): 12 måneder efter datoen
create or replace function private.retention_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from private.request_log where created_at < now() - interval '2 days';
  delete from live_requests r using bookings b
    where r.booking_id = b.id and b.event_date < current_date - 30;
  delete from bookings b
    where b.status in ('ny', 'tilbud_sendt', 'afvist', 'annulleret')
      and b.event_date < current_date - interval '12 months'
      and not exists (select 1 from docs d where d.booking_id = b.id);
end;
$$;
revoke execute on function private.retention_cleanup() from public, anon, authenticated;

select cron.schedule('djl-retention', '40 3 * * *', 'select private.retention_cleanup()');
