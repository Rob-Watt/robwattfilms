-- =====================================================================
-- Rob Watt Films — forum database
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- Creates tables, security rules (RLS), counters, search and seed data.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- One profile per signed-up user (created automatically, see trigger below)
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  avatar_url   text,
  bio          text check (char_length(bio) <= 500),
  role         text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  is_banned    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Forum sections (Lighting, Camera, …). Managed from the dashboard only.
create table public.categories (
  id          bigint generated always as identity primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  description text,
  parent_id   bigint references public.categories(id) on delete set null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

-- A thread
create table public.topics (
  id           bigint generated always as identity primary key,
  category_id  bigint not null references public.categories(id),
  author_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title        text not null check (char_length(title) between 5 and 150),
  body         text not null check (char_length(body) between 1 and 20000),
  is_pinned    boolean not null default false,
  is_locked    boolean not null default false,
  is_hidden    boolean not null default false,
  reply_count  int not null default 0,
  last_post_at timestamptz not null default now(),
  last_post_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  search       tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored
);

-- A reply inside a thread
create table public.replies (
  id         bigint generated always as identity primary key,
  topic_id   bigint not null references public.topics(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 20000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  search     tsvector generated always as (to_tsvector('english', body)) stored
);

-- "Report this post" queue for moderators
create table public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  topic_id    bigint references public.topics(id) on delete cascade,
  reply_id    bigint references public.replies(id) on delete cascade,
  reason      text not null check (char_length(reason) between 3 and 1000),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  check (topic_id is not null or reply_id is not null)
);

create index topics_category_idx  on public.topics (category_id, is_pinned desc, last_post_at desc);
create index topics_author_idx    on public.topics (author_id);
create index topics_search_idx    on public.topics using gin (search);
create index replies_topic_idx    on public.replies (topic_id, created_at);
create index replies_author_idx   on public.replies (author_id);
create index replies_search_idx   on public.replies using gin (search);
create index reports_status_idx   on public.reports (status, created_at);


-- ---------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------

-- Is the signed-in user a moderator or admin?
create or replace function public.is_mod()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('moderator', 'admin')
  );
$$;

-- True for moderators/admins on the site, and for you working in the
-- Supabase dashboard / SQL editor (which doesn't run as a site visitor).
create or replace function public.is_privileged()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated') or public.is_mod();
$$;

-- Is the signed-in user allowed to post (has a profile and isn't banned)?
create or replace function public.can_post()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and not is_banned
  );
$$;


-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- 3a. Create a profile whenever someone signs up.
--     Starts as user_xxxxxxxx; they choose a real username on their profile page.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b. Members can't promote or unban themselves.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not public.is_privileged()
     and (new.role is distinct from old.role or new.is_banned is distinct from old.is_banned) then
    raise exception 'Only moderators can change role or ban status';
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3c. Basic flood control: one new topic or reply every 20 seconds per member.
create or replace function public.rate_limit_posts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- (is_mod, not is_privileged: this function runs with owner rights)
  if public.is_mod() then
    return new;
  end if;
  if exists (select 1 from public.topics  where author_id = new.author_id and created_at > now() - interval '20 seconds')
  or exists (select 1 from public.replies where author_id = new.author_id and created_at > now() - interval '20 seconds') then
    raise exception 'You are posting too fast. Please wait a few seconds.';
  end if;
  return new;
end;
$$;

create trigger topics_rate_limit  before insert on public.topics  for each row execute function public.rate_limit_posts();
create trigger replies_rate_limit before insert on public.replies for each row execute function public.rate_limit_posts();

-- 3d. New topics: server sets the counters, the "last post" fields and the timestamps,
--     so they can't be faked from the browser.
create or replace function public.prepare_topic()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.reply_count  := 0;
  new.created_at   := now();
  new.last_post_at := now();
  new.last_post_by := new.author_id;
  new.edited_at    := null;
  if not public.is_privileged() then
    new.is_pinned := false;
    new.is_locked := false;
    new.is_hidden := false;
  end if;
  return new;
end;
$$;

create trigger topics_prepare before insert on public.topics for each row execute function public.prepare_topic();

-- 3e. Topic edits: members may only change their title and body.
create or replace function public.protect_topic_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not public.is_privileged() then
    if new.is_pinned    is distinct from old.is_pinned
    or new.is_locked    is distinct from old.is_locked
    or new.is_hidden    is distinct from old.is_hidden
    or new.category_id  is distinct from old.category_id
    or new.author_id    is distinct from old.author_id
    or new.created_at   is distinct from old.created_at then
      raise exception 'Only moderators can change that';
    end if;
  end if;
  -- counters are only ever changed by the reply triggers
  if pg_trigger_depth() = 1 then
    new.reply_count  := old.reply_count;
    new.last_post_at := old.last_post_at;
    new.last_post_by := old.last_post_by;
  end if;
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger topics_protect before update on public.topics for each row execute function public.protect_topic_fields();

-- 3f. Reply inserts/edits: server-controlled timestamps; members may only edit body.
create or replace function public.prepare_reply()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.edited_at  := null;
    if not public.is_privileged() then
      new.is_hidden := false;
    end if;
  else
    if not public.is_privileged() and (
         new.is_hidden  is distinct from old.is_hidden
      or new.topic_id   is distinct from old.topic_id
      or new.author_id  is distinct from old.author_id
      or new.created_at is distinct from old.created_at) then
      raise exception 'Only moderators can change that';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger replies_prepare before insert or update on public.replies
  for each row execute function public.prepare_reply();

-- 3g. Keep each topic's reply count and "last post" up to date.
create or replace function public.update_topic_stats()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t_id bigint := coalesce(new.topic_id, old.topic_id);
begin
  update public.topics t
  set reply_count  = (select count(*) from public.replies r where r.topic_id = t_id and not r.is_hidden),
      last_post_at = coalesce((select max(r.created_at) from public.replies r where r.topic_id = t_id and not r.is_hidden), t.created_at),
      last_post_by = coalesce((select r.author_id from public.replies r where r.topic_id = t_id and not r.is_hidden
                               order by r.created_at desc limit 1), t.author_id)
  where t.id = t_id;
  return null;
end;
$$;

create trigger replies_stats
  after insert or delete or update of is_hidden on public.replies
  for each row execute function public.update_topic_stats();


-- ---------------------------------------------------------------------
-- 4. SECURITY (Row Level Security)
--    Anyone can read; only signed-in, non-banned members can post;
--    members edit their own posts; moderators manage everything.
-- ---------------------------------------------------------------------

alter table public.profiles   enable row level security;
alter table public.categories enable row level security;
alter table public.topics     enable row level security;
alter table public.replies    enable row level security;
alter table public.reports    enable row level security;

-- profiles
create policy "Profiles are public"       on public.profiles for select using (true);
create policy "Members edit own profile"  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Mods edit any profile"     on public.profiles for update to authenticated
  using (public.is_mod());

-- categories (read-only from the site; edit them in the dashboard)
create policy "Categories are public" on public.categories for select using (true);

-- topics
create policy "Visible topics are public" on public.topics for select
  using (not is_hidden or author_id = (select auth.uid()) or public.is_mod());
create policy "Members create topics" on public.topics for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_post());
create policy "Members edit own topics" on public.topics for update to authenticated
  using (author_id = (select auth.uid()) and public.can_post())
  with check (author_id = (select auth.uid()));
create policy "Mods edit any topic"   on public.topics for update to authenticated using (public.is_mod());
create policy "Mods delete topics"    on public.topics for delete to authenticated using (public.is_mod());

-- replies
create policy "Visible replies are public" on public.replies for select
  using (
    (not is_hidden or author_id = (select auth.uid()) or public.is_mod())
    and exists (select 1 from public.topics t where t.id = topic_id)   -- parent topic must be visible too
  );
create policy "Members reply to open topics" on public.replies for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_post()
    and exists (select 1 from public.topics t where t.id = topic_id and not t.is_locked and not t.is_hidden)
  );
create policy "Members edit own replies" on public.replies for update to authenticated
  using (author_id = (select auth.uid()) and public.can_post())
  with check (author_id = (select auth.uid()));
create policy "Mods edit any reply"  on public.replies for update to authenticated using (public.is_mod());
create policy "Mods delete replies"  on public.replies for delete to authenticated using (public.is_mod());

-- reports
create policy "Members file reports" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.can_post());
create policy "Mods read reports"    on public.reports for select to authenticated using (public.is_mod());
create policy "Mods update reports"  on public.reports for update to authenticated using (public.is_mod());


-- ---------------------------------------------------------------------
-- 5. READ HELPERS
-- ---------------------------------------------------------------------

-- Forum index: each category with topic/reply counts and last activity
create view public.category_stats with (security_invoker = true) as
select
  c.id, c.slug, c.name, c.description, c.parent_id, c.position,
  count(t.id)                       as topic_count,
  coalesce(sum(t.reply_count), 0)   as reply_count,
  max(t.last_post_at)               as last_post_at
from public.categories c
left join public.topics t on t.category_id = c.id
group by c.id;

-- Search topics and replies. Call from the site with supabase.rpc('search_forum', { q: '...' })
create or replace function public.search_forum(q text)
returns table (topic_id bigint, title text, snippet text, posted_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select topic_id, title, snippet, posted_at from (
    select t.id as topic_id, t.title, left(t.body, 200) as snippet, t.created_at as posted_at
    from public.topics t
    where t.search @@ websearch_to_tsquery('english', q)
    union all
    select t.id, t.title, left(r.body, 200), r.created_at
    from public.replies r
    join public.topics t on t.id = r.topic_id
    where r.search @@ websearch_to_tsquery('english', q)
  ) hits
  order by posted_at desc
  limit 50;
$$;


-- ---------------------------------------------------------------------
-- 6. STARTING CATEGORIES (edit freely)
-- ---------------------------------------------------------------------

insert into public.categories (slug, name, description, position) values
  ('aerial',      'Aerial & Drones',      'Aerial cinematography, drones, rigs, permits and flying for film.', 1),
  ('camera',      'Camera',               'Cameras, lenses, formats and how to choose them.',                  2),
  ('lighting',    'Lighting',             'Lighting, lamps and shaping light on set.',                         3),
  ('directing',   'Directing',            'Directing, working with actors and telling the story.',             4),
  ('screenwriting','Screenwriting',       'Writing for the screen: story, structure, drafts and getting scripts made.', 5),
  ('post-color',  'Post & Color',         'Editing, the grade, VFX and finishing.',                            6),
  ('set-talk',    'Set Talk',             'Life on set, crews, budgets and getting the day.',                  7),
  ('film-talk',   'Film Talk',            'Films old and new that are worth talking about.',                   8),
  ('podcast',     'Getting Made Podcast', 'Episode discussion and guest suggestions.',                         9),
  ('ask-rob',     'Ask Rob',              'Questions for Rob about his work and process.',                    10),
  ('site-news',   'Site News',            'Forum announcements, feedback and help.',                          11);


-- ---------------------------------------------------------------------
-- 7. AFTER YOU SIGN UP ON THE SITE: make yourself admin
--    (replace the email, then run just this statement)
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'you@example.com');
