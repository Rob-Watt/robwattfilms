-- =====================================================================
-- Rob Watt Films — forum table permissions
-- Run once AFTER schema.sql: Dashboard → SQL Editor → New query → paste → Run
--
-- Newer Supabase projects don't automatically let the website's key
-- (roles `anon` = signed-out visitors, `authenticated` = signed-in members)
-- use tables created in the SQL editor. These grants open the doors;
-- the Row Level Security policies in schema.sql still decide who can
-- read or change each row, so nothing here weakens security.
-- Safe to run more than once.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- Reading the forum (everyone)
grant select on public.categories, public.profiles, public.topics, public.replies
  to anon, authenticated;
grant select on public.category_stats to anon, authenticated;

-- Posting and editing (signed-in members; RLS limits them to their own rows)
grant insert, update on public.topics, public.replies to authenticated;
grant update on public.profiles to authenticated;

-- Moderator actions (RLS only allows moderators/admins to actually delete)
grant delete on public.topics, public.replies to authenticated;

-- Reports (members file them; RLS only lets moderators read/update them)
grant select, insert, update on public.reports to authenticated;

-- ID numbers for new topics, replies and reports
grant usage, select on all sequences in schema public to authenticated;

-- Functions used by the security rules and by search
grant execute on function public.is_mod()        to anon, authenticated;
grant execute on function public.can_post()      to anon, authenticated;
grant execute on function public.is_privileged() to anon, authenticated;
grant execute on function public.search_forum(text) to anon, authenticated;
