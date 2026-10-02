-- Kundeside ("Min booking") og tidsplan/praktisk info.
-- Kunden bruger samme hemmelige token som til musikønsker (bookings.wishlist_token).

alter table public.bookings
  add column if not exists event_plan jsonb not null default '{}'::jsonb,
  add column if not exists plan_updated_at timestamptz,
  add column if not exists plan_notified_at timestamptz;

-- Alt kunden ser på sin side
create or replace function public.get_customer_portal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings;
  s public.settings;
begin
  select * into b from bookings where wishlist_token = p_token and length(p_token) >= 32;
  if not found then raise exception 'Linket er ugyldigt'; end if;
  select * into s from settings limit 1;

  return jsonb_build_object(
    'status', b.status,
    'first_name', split_part(b.customer_name, ' ', 1),
    'customer_name', b.customer_name,
    'company', b.company,
    'event_type', (select name from event_types where id = b.event_type_id),
    'event_icon', (select icon from event_types where id = b.event_type_id),
    'event_theme', (select name from event_themes where id = b.event_theme_id),
    'event_date', b.event_date,
    'start_time', b.start_time,
    'hours', b.hours,
    'venue_address', b.venue_address,
    'guest_count', b.guest_count,
    'packages', coalesce((select jsonb_agg(p.name order by p.sort_order) from booking_packages bp
                          join sound_packages p on p.id = bp.package_id where bp.booking_id = b.id), '[]'::jsonb),
    'plan', b.event_plan,
    'plan_updated_at', b.plan_updated_at,
    'plan_editable', b.status in ('ny', 'tilbud_sendt', 'bekraeftet') and b.event_date >= current_date,
    'docs', coalesce((select jsonb_agg(jsonb_build_object(
                         'type', d.type, 'number', d.number, 'status', d.status, 'total', d.total,
                         'issue_date', d.issue_date, 'due_date', d.due_date, 'valid_until', d.valid_until,
                         'token', d.public_token) order by d.issue_date, d.number)
                       from docs d where d.booking_id = b.id and d.status <> 'kladde'), '[]'::jsonb),
    'music', case when b.status in ('tilbud_sendt', 'bekraeftet', 'afholdt') then jsonb_build_object(
               'wishes', (select count(*) from song_wishes w where w.booking_id = b.id),
               'genres', coalesce(array_length(b.music_genres, 1), 0)) end,
    'live_token', case when b.status in ('bekraeftet', 'afholdt') then b.live_token end,
    'review', case when b.status in ('bekraeftet', 'afholdt') and b.event_date <= current_date then jsonb_build_object(
               'done', exists (select 1 from reviews r where r.booking_id = b.id)) end,
    'contact', jsonb_build_object('email', s.company_email, 'phone', s.company_phone)
  );
end;
$$;

-- Kunden gemmer tidsplan og praktisk info. Kun kendte felter gemmes, og længder begrænses.
create or replace function public.save_event_plan(p_token text, p_plan jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  clean jsonb;
  t text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  select * into b from bookings where wishlist_token = p_token and length(p_token) >= 32 for update;
  if not found then raise exception 'Linket er ugyldigt'; end if;
  if not (b.status in ('ny', 'tilbud_sendt', 'bekraeftet') and b.event_date >= current_date) then
    raise exception 'Tidsplanen kan ikke længere ændres – skriv til DJ Lindstrøm, hvis noget er ændret';
  end if;
  if jsonb_typeof(p_plan) <> 'object' then raise exception 'Ugyldige data'; end if;

  clean := jsonb_strip_nulls(jsonb_build_object(
    'contact_name', nullif(left(trim(p_plan->>'contact_name'), 100), ''),
    'contact_phone', nullif(left(trim(p_plan->>'contact_phone'), 30), ''),
    'setup_from', case when p_plan->>'setup_from' ~ t then p_plan->>'setup_from' end,
    'location', case when p_plan->>'location' in ('inde', 'ude', 'begge') then p_plan->>'location' end,
    'power', case when p_plan->>'power' in ('ja', 'nej', 'ved_ikke') then p_plan->>'power' end,
    'access', nullif(left(trim(p_plan->>'access'), 1000), ''),
    'notes', nullif(left(trim(p_plan->>'notes'), 2000), ''),
    'program', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'time', case when e->>'time' ~ t then e->>'time' end,
               'label', left(trim(e->>'label'), 100),
               'note', nullif(left(trim(e->>'note'), 300), '')))
             order by coalesce(e->>'time', '99:99'), n), '[]'::jsonb)
      from (select e, n from jsonb_array_elements(
              case jsonb_typeof(p_plan->'program') when 'array' then p_plan->'program' else '[]'::jsonb end
            ) with ordinality as x(e, n)
            where jsonb_typeof(e) = 'object' and trim(coalesce(e->>'label', '')) <> ''
            limit 40) rows
    )
  ));

  update bookings set event_plan = clean, plan_updated_at = now() where id = b.id;

  -- Besked til Viktor – højst én mail pr. 30 minutter pr. booking
  if b.plan_notified_at is null or b.plan_notified_at < now() - interval '30 minutes' then
    update bookings set plan_notified_at = now() where id = b.id;
    perform private.call_edge('booking-email', jsonb_build_object('id', b.id, 'kind', 'plan_updated'));
  end if;
  return now();
end;
$$;

revoke execute on function public.get_customer_portal(text), public.save_event_plan(text, jsonb) from public;
grant execute on function public.get_customer_portal(text), public.save_event_plan(text, jsonb) to anon, authenticated;
