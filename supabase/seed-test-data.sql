-- =====================================================================
-- Rob Watt Films forum — TEST DATA (for building/checking the forum)
-- Run in Supabase: SQL Editor → new snippet → paste → Run
-- Remove it all before launch with supabase/remove-test-data.sql
--
-- Creates two test members (test_alice, test_ben — they can't sign in)
-- and a few topics/replies with realistic timestamps, so the index,
-- category and topic pages have something to show.
-- =====================================================================

-- 1. Two test members (the signup trigger creates their profiles)
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a11ce000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'test-alice@example.com', now() - interval '10 days', now(), '{}'::jsonb, '{}'::jsonb),
  ('b0b0b000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'test-ben@example.com',   now() - interval '9 days',  now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set username = 'test_alice', display_name = 'Alice (test)', bio = 'Test account.'
where id = 'a11ce000-0000-4000-a000-000000000001';
update public.profiles set username = 'test_ben',   display_name = 'Ben (test)',   bio = 'Test account.'
where id = 'b0b0b000-0000-4000-a000-000000000002';

-- 2. Let us back-date posts (these triggers normally stamp "now" and enforce flood control)
alter table public.topics  disable trigger topics_prepare;
alter table public.topics  disable trigger topics_rate_limit;
alter table public.replies disable trigger replies_prepare;
alter table public.replies disable trigger replies_rate_limit;

do $$
declare
  alice uuid := 'a11ce000-0000-4000-a000-000000000001';
  ben   uuid := 'b0b0b000-0000-4000-a000-000000000002';
  t_welcome bigint; t_permits bigint; t_quarry bigint; t_camera bigint; t_locked bigint;
  cat bigint;
begin
  -- Pinned welcome topic in Site News
  select id into cat from public.categories where slug = 'site-news';
  insert into public.topics (category_id, author_id, title, body, is_pinned, created_at, last_post_at, last_post_by)
  values (cat, alice, '[test] Welcome to the forum',
          E'This is a pinned test topic.\n\nIt should appear at the top of Site News with a "pinned" tag.',
          true, now() - interval '6 days', now() - interval '6 days', alice)
  returning id into t_welcome;

  -- Aerial topic with a link, two replies (one mentions "drone" for the search test later)
  select id into cat from public.categories where slug = 'aerial';
  insert into public.topics (category_id, author_id, title, body, created_at, last_post_at, last_post_by)
  values (cat, alice, '[test] Permits for a downtown aerial shot?',
          E'Planning a short aerial move over a downtown street at dawn.\nWhat paperwork do people usually need?\n\nI''ve been reading https://www.faa.gov/uas but it''s a lot.',
          now() - interval '3 days', now() - interval '3 days', alice)
  returning id into t_permits;
  insert into public.replies (topic_id, author_id, body, created_at)
  values (t_permits, ben, E'You''ll want a location permit from the city film office, and the pilot needs a Part 107 certificate.\n\nBudget extra time for the drone waiver if you''re near an airport.',
          now() - interval '2 days');
  insert into public.replies (topic_id, author_id, body, created_at, edited_at)
  values (t_permits, alice, 'Thanks, that helps a lot. Edited to add: we got the permit in 5 days.',
          now() - interval '1 day', now() - interval '20 hours');

  -- Ask Rob topic with one recent reply
  select id into cat from public.categories where slug = 'ask-rob';
  insert into public.topics (category_id, author_id, title, body, created_at, last_post_at, last_post_by)
  values (cat, ben, '[test] Lighting the quarry in Beneath the Mountain',
          'How did you light the underground quarry scenes? The excavator work lights looked practical.',
          now() - interval '5 hours', now() - interval '5 hours', ben)
  returning id into t_quarry;
  insert into public.replies (topic_id, author_id, body, created_at)
  values (t_quarry, alice, 'Following this one — I''d love to know too.', now() - interval '2 hours');

  -- Camera topic with no replies yet
  select id into cat from public.categories where slug = 'camera';
  insert into public.topics (category_id, author_id, title, body, created_at, last_post_at, last_post_by)
  values (cat, alice, '[test] Alexa Mini LF vs Venice 2 in low light',
          'Which would you take for a night exterior with mostly practicals?',
          now() - interval '2 days', now() - interval '2 days', alice)
  returning id into t_camera;

  -- Locked topic in Film Talk
  select id into cat from public.categories where slug = 'film-talk';
  insert into public.topics (category_id, author_id, title, body, is_locked, created_at, last_post_at, last_post_by)
  values (cat, ben, '[test] A locked thread',
          'This test topic is locked, so the page should say no new replies can be added.',
          true, now() - interval '1 day', now() - interval '1 day', ben)
  returning id into t_locked;
  insert into public.replies (topic_id, author_id, body, created_at)
  values (t_locked, alice, 'A reply from before it was locked.', now() - interval '23 hours');
end $$;

-- 3. Turn the safety triggers back on
alter table public.topics  enable trigger topics_prepare;
alter table public.topics  enable trigger topics_rate_limit;
alter table public.replies enable trigger replies_prepare;
alter table public.replies enable trigger replies_rate_limit;
