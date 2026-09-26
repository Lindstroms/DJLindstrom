-- Send e-mails via edge function "booking-email", når der kommer en ny forespørgsel
create extension if not exists pg_net with schema extensions;

alter table public.bookings add column if not exists notified_at timestamptz;

create or replace function private.notify_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://vubxctebuwiftamiskxs.supabase.co/functions/v1/booking-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Offentlig anon-nøgle; funktionen sender kun for nye, ikke-notificerede forespørgsler
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnhjdGVidXdpZnRhbWlza3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzcwNzMsImV4cCI6MjEwNTkxMzA3M30.7Vpj4717GHiV7uDsHGBUxSQONqu1YH0R9L9dbbrlsyA'
    ),
    body := jsonb_build_object('id', new.id)
  );
  return new;
end;
$$;

revoke execute on function private.notify_new_booking() from public, anon, authenticated;

create trigger bookings_notify
  after insert on public.bookings
  for each row execute function private.notify_new_booking();
