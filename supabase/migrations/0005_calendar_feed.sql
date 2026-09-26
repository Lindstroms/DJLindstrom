-- Hemmeligt token til iPhone-kalenderabonnement (edge function calendar-feed)
alter table public.settings
  add column if not exists calendar_token text not null default encode(extensions.gen_random_bytes(24), 'hex');

-- Kunder (anon) må kun læse show_prices – ikke tokenet
revoke select on public.settings from anon;
grant select (show_prices) on public.settings to anon;
