-- Forhindr sletning af event-typer/temaer/lydpakker der bruges af forespørgsler.
-- Admin kan i stedet skjule dem (active = false).
alter table public.bookings
  drop constraint bookings_event_type_id_fkey,
  add constraint bookings_event_type_id_fkey
    foreign key (event_type_id) references public.event_types(id) on delete restrict,
  drop constraint bookings_event_theme_id_fkey,
  add constraint bookings_event_theme_id_fkey
    foreign key (event_theme_id) references public.event_themes(id) on delete restrict;

alter table public.booking_packages
  drop constraint booking_packages_package_id_fkey,
  add constraint booking_packages_package_id_fkey
    foreign key (package_id) references public.sound_packages(id) on delete restrict;
