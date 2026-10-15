-- =====================================================================
-- Rob Watt Films forum — extra moderation guards (run after schema.sql + grants.sql)
-- SQL Editor → new snippet → paste → Run. Safe to run more than once.
--
-- 1. Only ADMINS can change someone's role (moderators can't promote anyone).
-- 2. Moderators can't ban an admin.
-- 3. Reserved usernames (robwatt, admin, moderator, …) can only be taken by
--    moderators/admins — stops people posing as Rob or as staff.
-- Changes made by you in the dashboard / SQL editor are never blocked.
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  reserved text[] := array[
    'robwatt', 'rob_watt', 'rob_watt_', 'robwattfilms', 'admin', 'administrator',
    'moderator', 'mod', 'mods', 'staff', 'support', 'forum', 'help', 'official'
  ];
  from_site boolean := current_user in ('anon', 'authenticated');
begin
  if from_site and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change member roles';
  end if;

  if from_site and new.is_banned and not old.is_banned and old.role = 'admin' then
    raise exception 'Admins can''t be banned from the site';
  end if;

  if from_site and new.username is distinct from old.username
     and new.username = any (reserved) and not public.is_mod() then
    raise exception 'That username is reserved';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_changes();
