-- Live-ønsker til festen: gæster scanner en QR-kode, ønsker sange og stemmer.
-- Gæster har eget token (live_token), adskilt fra værtens ønskeliste-link.

alter table public.bookings
  add column if not exists live_token text unique not null default encode(extensions.gen_random_bytes(12), 'hex'),
  add column if not exists live_open boolean not null default false;

create type public.live_status as enum ('queued', 'played', 'rejected');

create table public.live_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  title text not null,
  artist text not null,
  artwork_url text,
  preview_url text,
  guest_name text,
  voter text not null,           -- anonym browser-id for den der ønskede
  votes int not null default 1,
  status public.live_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index live_requests_booking_idx on public.live_requests (booking_id, status);

create table public.live_votes (
  request_id uuid not null references public.live_requests(id) on delete cascade,
  voter text not null,
  primary key (request_id, voter)
);

create trigger live_requests_touch before update on public.live_requests
  for each row execute function public.touch_updated_at();

alter table public.live_requests enable row level security;
alter table public.live_votes enable row level security;
create policy "admin alt" on public.live_requests for all using (private.is_admin()) with check (private.is_admin());
create policy "admin alt" on public.live_votes for all using (private.is_admin()) with check (private.is_admin());

-- Booking for et gæste-token (kun bekræftede)
create or replace function private.booking_for_live(p_token text)
returns public.bookings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from bookings where live_token = p_token and length(p_token) >= 24 and status = 'bekraeftet';
  if not found then raise exception 'Linket er ugyldigt'; end if;
  return b;
end;
$$;

create or replace function public.get_live_queue(p_token text, p_voter text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings := private.booking_for_live(p_token);
begin
  return jsonb_build_object(
    'open', b.live_open,
    'event_type', (select name from event_types where id = b.event_type_id),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'artist', r.artist, 'artwork_url', r.artwork_url,
        'guest_name', r.guest_name, 'votes', r.votes,
        'voted', exists (select 1 from live_votes v where v.request_id = r.id and v.voter = p_voter)
      ) order by r.votes desc, r.created_at)
      from live_requests r where r.booking_id = b.id and r.status = 'queued'
    ), '[]'::jsonb),
    'played', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'artist', r.artist, 'artwork_url', r.artwork_url)
        order by r.updated_at desc)
      from (select * from live_requests where booking_id = b.id and status = 'played' order by updated_at desc limit 10) r
    ), '[]'::jsonb)
  );
end;
$$;

-- Ønsk en sang. Returnerer 'added', 'voted' (fandtes allerede – der stemmes i stedet),
-- 'already' (allerede stemt/spillet) eller 'blocked' (værten har sagt nej til sangen).
create or replace function public.request_live_song(p_token text, p_voter text, p_song jsonb, p_guest_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings := private.booking_for_live(p_token);
  v_title text := left(trim(p_song ->> 'title'), 200);
  v_artist text := left(coalesce(trim(p_song ->> 'artist'), ''), 200);
  existing public.live_requests;
begin
  if not b.live_open then raise exception 'Der er lukket for ønsker lige nu'; end if;
  if coalesce(length(p_voter), 0) < 8 or coalesce(v_title, '') = '' then raise exception 'Ugyldigt ønske'; end if;

  if exists (select 1 from song_wishes w where w.booking_id = b.id and w.kind = 'nope'
             and lower(w.title) = lower(v_title) and lower(w.artist) = lower(v_artist)) then
    return 'blocked';
  end if;

  select * into existing from live_requests
    where booking_id = b.id and lower(title) = lower(v_title) and lower(artist) = lower(v_artist)
    order by created_at desc limit 1;

  if found then
    if existing.status <> 'queued' then return 'already'; end if;
    insert into live_votes (request_id, voter) values (existing.id, p_voter) on conflict do nothing;
    if not found then return 'already'; end if;
    update live_requests set votes = votes + 1 where id = existing.id;
    return 'voted';
  end if;

  -- Simpel spam-beskyttelse
  if (select count(*) from live_requests where booking_id = b.id) >= 400 then
    raise exception 'Ønskelisten er fuld';
  end if;
  if (select count(*) from live_requests where booking_id = b.id and voter = p_voter and status = 'queued') >= 5 then
    raise exception 'Du har allerede 5 ønsker i køen – vent til der er spillet nogle af dem';
  end if;

  insert into live_requests (booking_id, title, artist, artwork_url, preview_url, guest_name, voter)
  values (
    b.id, v_title, v_artist,
    case when p_song ->> 'artwork_url' like 'https://%' then left(p_song ->> 'artwork_url', 500) end,
    case when p_song ->> 'preview_url' like 'https://%' then left(p_song ->> 'preview_url', 500) end,
    left(nullif(trim(p_guest_name), ''), 40),
    left(p_voter, 64)
  )
  returning * into existing;
  insert into live_votes (request_id, voter) values (existing.id, p_voter);
  return 'added';
end;
$$;

create or replace function public.vote_live_song(p_token text, p_voter text, p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings := private.booking_for_live(p_token);
begin
  if not b.live_open then raise exception 'Der er lukket for ønsker lige nu'; end if;
  if coalesce(length(p_voter), 0) < 8 then raise exception 'Ugyldig stemme'; end if;
  if not exists (select 1 from live_requests where id = p_request_id and booking_id = b.id and status = 'queued') then
    return 'already';
  end if;
  insert into live_votes (request_id, voter) values (p_request_id, left(p_voter, 64)) on conflict do nothing;
  if not found then return 'already'; end if;
  update live_requests set votes = votes + 1 where id = p_request_id;
  return 'voted';
end;
$$;

revoke execute on function private.booking_for_live(text) from public, anon, authenticated;
revoke execute on function public.get_live_queue(text, text), public.request_live_song(text, text, jsonb, text),
  public.vote_live_song(text, text, uuid) from public;
grant execute on function public.get_live_queue(text, text), public.request_live_song(text, text, jsonb, text),
  public.vote_live_song(text, text, uuid) to anon, authenticated;
