-- is_admin() flyttes ud af det offentlige API-skema
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.is_admin() set schema private;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

alter function public.touch_updated_at() set search_path = public;
