-- Anmeldelser: automatisk mail dagen efter festen, kunden anmelder via sit link, Viktor godkender.

create extension if not exists pg_cron;

alter table public.bookings add column if not exists review_requested_at timestamptz;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.bookings(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  text text,
  display_name text not null,
  event_label text,               -- fx "Bryllup, juni 2026" (sættes automatisk for bookinger)
  consent_publish boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

alter table public.reviews enable row level security;
create policy "admin alt" on public.reviews for all using (private.is_admin()) with check (private.is_admin());

-- Booking til anmeldelse (samme token som musikønsker; kun efter eventdagen)
create or replace function private.booking_for_review(p_token text)
returns public.bookings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from bookings
    where wishlist_token = p_token and length(p_token) >= 32
      and status in ('bekraeftet', 'afholdt') and event_date <= current_date;
  if not found then raise exception 'Linket er ugyldigt, eller festen er ikke holdt endnu'; end if;
  return b;
end;
$$;

create or replace function public.get_review_form(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings := private.booking_for_review(p_token);
begin
  return jsonb_build_object(
    'first_name', split_part(b.customer_name, ' ', 1),
    'event_type', (select name from event_types where id = b.event_type_id),
    'event_date', b.event_date,
    'review', (select jsonb_build_object('rating', r.rating, 'text', r.text, 'display_name', r.display_name,
                                         'consent_publish', r.consent_publish)
               from reviews r where r.booking_id = b.id)
  );
end;
$$;

create or replace function public.submit_review(p_token text, p_rating int, p_text text, p_display_name text, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings := private.booking_for_review(p_token);
  v_label text;
begin
  if p_rating not between 1 and 5 then raise exception 'Vælg 1–5 stjerner'; end if;
  if coalesce(trim(p_display_name), '') = '' then raise exception 'Skriv et navn'; end if;

  v_label := concat_ws(', ',
    (select name from event_types where id = b.event_type_id),
    (array['januar','februar','marts','april','maj','juni','juli','august','september','oktober','november','december'])
      [extract(month from b.event_date)::int] || ' ' || extract(year from b.event_date)::int);

  insert into reviews (booking_id, rating, text, display_name, event_label, consent_publish)
  values (b.id, p_rating, left(nullif(trim(p_text), ''), 1500), left(trim(p_display_name), 60), v_label, coalesce(p_consent, false))
  on conflict (booking_id) do update set
    rating = excluded.rating,
    text = excluded.text,
    display_name = excluded.display_name,
    consent_publish = excluded.consent_publish,
    approved = false;           -- ændret anmeldelse skal godkendes igen
end;
$$;

-- Godkendte anmeldelser til forsiden
create or replace function public.get_public_reviews()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'count', count(*),
    'average', round(avg(rating)::numeric, 1),
    'reviews', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'rating', rating, 'text', text, 'display_name', display_name, 'event_label', event_label
    ) order by created_at desc) filter (where true), '[]'::jsonb)
  )
  from (select * from reviews where approved and consent_publish order by created_at desc limit 30) r;
$$;

revoke execute on function private.booking_for_review(text) from public, anon, authenticated;
revoke execute on function public.get_review_form(text), public.submit_review(text, int, text, text, boolean),
  public.get_public_reviews() from public;
grant execute on function public.get_review_form(text), public.submit_review(text, int, text, text, boolean),
  public.get_public_reviews() to anon, authenticated;

-- Kald edge function booking-email (bruges af triggers og cron)
create or replace function private.call_booking_email(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://vubxctebuwiftamiskxs.supabase.co/functions/v1/booking-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnhjdGVidXdpZnRhbWlza3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzcwNzMsImV4cCI6MjEwNTkxMzA3M30.7Vpj4717GHiV7uDsHGBUxSQONqu1YH0R9L9dbbrlsyA'
    ),
    body := p_body
  );
end;
$$;
revoke execute on function private.call_booking_email(jsonb) from public, anon, authenticated;

-- Besked til Viktor når der kommer (eller ændres) en anmeldelse fra en kunde
create or replace function private.notify_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_id is not null and (tg_op = 'INSERT' or new.rating is distinct from old.rating or new.text is distinct from old.text) then
    perform private.call_booking_email(jsonb_build_object('id', new.id, 'kind', 'review_received'));
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_review() from public, anon, authenticated;

create trigger reviews_notify after insert or update on public.reviews
  for each row execute function private.notify_review();

-- Dagligt job: markér overståede jobs som afholdt og bed om anmeldelse (op til 7 dage efter)
create or replace function private.daily_after_party()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update bookings set status = 'afholdt' where status = 'bekraeftet' and event_date < current_date;

  for r in
    select id from bookings
    where status = 'afholdt'
      and event_date between current_date - 7 and current_date - 1
      and review_requested_at is null
      and not exists (select 1 from reviews where booking_id = bookings.id)
  loop
    perform private.call_booking_email(jsonb_build_object('id', r.id, 'kind', 'review_request'));
  end loop;
end;
$$;
revoke execute on function private.daily_after_party() from public, anon, authenticated;

-- Kl. 10:05 UTC hver dag (kl. 11/12 dansk tid)
select cron.schedule('djl-after-party', '5 10 * * *', $$select private.daily_after_party()$$);
