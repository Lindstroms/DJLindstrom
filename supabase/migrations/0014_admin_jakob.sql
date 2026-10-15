-- Jakob som ekstra admin (login oprettes i Supabase → Authentication → Users)
insert into public.admins (email) values ('jakob@fam-lindstrom.dk') on conflict do nothing;
