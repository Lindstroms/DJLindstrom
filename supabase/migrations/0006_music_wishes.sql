-- Musikønsker: kunden får et hemmeligt link (uden login) til at ønske sange og vælge stemning.

alter table public.bookings
  add column if not exists wishlist_token text unique not null default encode(extensions.gen_random_bytes(16), 'hex'),
  add column if not exists music_genres text[] not null default '{}',
  add column if not exists music_energy int check (music_energy between 1 and 5),
  add column if not exists music_notes text,
  add column if not exists confirmed_notified_at timestamptz;

create type public.wish_kind as enum ('must', 'wish', 'nope');

create table public.song_wishes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind public.wish_kind not null,
  moment text,                 -- fx "Første dans" (kun for 'must')
  title text not null,
  artist text not null,
  artwork_url text,
  preview_url text,
  external_url text,
  created_at timestamptz not null default now()
);
create index song_wishes_booking_idx on public.song_wishes (booking_id);

alter table public.song_wishes enable row level security;
create policy "admin alt" on public.song_wishes for all using (private.is_admin()) with check (private.is_admin());

-- Finder bookingen for et token; kun aktive bookinger. editable = kan stadig ændres (før eventdagen).
create or replace function private.booking_for_token(p_token text, out b public.bookings, out editable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select * into b from bookings
    where wishlist_token = p_token and length(p_token) >= 32
      and status in ('tilbud_sendt', 'bekraeftet', 'afholdt');
  if not found then
    raise exception 'Linket er ugyldigt eller udløbet';
  end if;
  editable := b.status in ('tilbud_sendt', 'bekraeftet') and b.event_date >= current_date;
end;
$$;

create or replace function public.get_wishlist(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from private.booking_for_token(p_token);
  return jsonb_build_object(
    'editable', r.editable,
    'event_type', (select name from event_types where id = (r.b).event_type_id),
    'event_theme', (select name from event_themes where id = (r.b).event_theme_id),
    'event_date', (r.b).event_date,
    'start_time', (r.b).start_time,
    'hours', (r.b).hours,
    'first_name', split_part((r.b).customer_name, ' ', 1),
    'genres', to_jsonb((r.b).music_genres),
    'energy', (r.b).music_energy,
    'notes', (r.b).music_notes,
    'wishes', coalesce((
      select jsonb_agg(to_jsonb(w) - 'booking_id' order by w.created_at)
      from song_wishes w where w.booking_id = (r.b).id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_music_prefs(p_token text, p_genres text[], p_energy int, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from private.booking_for_token(p_token);
  if not r.editable then raise exception 'Ønskerne kan ikke længere ændres'; end if;
  update bookings set
    music_genres = coalesce(p_genres[1:20], '{}'),
    music_energy = case when p_energy between 1 and 5 then p_energy end,
    music_notes = left(nullif(trim(p_notes), ''), 2000)
  where id = (r.b).id;
end;
$$;

create or replace function public.add_song_wish(p_token text, p_wish jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_id uuid;
begin
  select * into r from private.booking_for_token(p_token);
  if not r.editable then raise exception 'Ønskerne kan ikke længere ændres'; end if;
  if (select count(*) from song_wishes where booking_id = (r.b).id) >= 150 then
    raise exception 'Du har nået det maksimale antal ønsker';
  end if;
  if coalesce(trim(p_wish ->> 'title'), '') = '' then raise exception 'Mangler sangtitel'; end if;

  insert into song_wishes (booking_id, kind, moment, title, artist, artwork_url, preview_url, external_url)
  values (
    (r.b).id,
    (p_wish ->> 'kind')::wish_kind,
    case when p_wish ->> 'kind' = 'must' then left(nullif(trim(p_wish ->> 'moment'), ''), 80) end,
    left(trim(p_wish ->> 'title'), 200),
    left(coalesce(trim(p_wish ->> 'artist'), ''), 200),
    case when p_wish ->> 'artwork_url' like 'https://%' then left(p_wish ->> 'artwork_url', 500) end,
    case when p_wish ->> 'preview_url' like 'https://%' then left(p_wish ->> 'preview_url', 500) end,
    case when p_wish ->> 'external_url' like 'https://%' then left(p_wish ->> 'external_url', 500) end
  )
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.remove_song_wish(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from private.booking_for_token(p_token);
  if not r.editable then raise exception 'Ønskerne kan ikke længere ændres'; end if;
  delete from song_wishes where id = p_id and booking_id = (r.b).id;
end;
$$;

revoke execute on function private.booking_for_token(text) from public, anon, authenticated;
revoke execute on function public.get_wishlist(text), public.save_music_prefs(text, text[], int, text),
  public.add_song_wish(text, jsonb), public.remove_song_wish(text, uuid) from public;
grant execute on function public.get_wishlist(text), public.save_music_prefs(text, text[], int, text),
  public.add_song_wish(text, jsonb), public.remove_song_wish(text, uuid) to anon, authenticated;

-- Send bekræftelsesmail (med link til musikønsker), når status skifter til 'bekraeftet'
create or replace function private.notify_confirmed_booking()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'bekraeftet' and old.status is distinct from 'bekraeftet' and new.confirmed_notified_at is null then
    perform net.http_post(
      url := 'https://vubxctebuwiftamiskxs.supabase.co/functions/v1/booking-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnhjdGVidXdpZnRhbWlza3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzcwNzMsImV4cCI6MjEwNTkxMzA3M30.7Vpj4717GHiV7uDsHGBUxSQONqu1YH0R9L9dbbrlsyA'
      ),
      body := jsonb_build_object('id', new.id, 'kind', 'confirmed')
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.notify_confirmed_booking() from public, anon, authenticated;

create trigger bookings_notify_confirmed
  after update of status on public.bookings
  for each row execute function private.notify_confirmed_booking();
