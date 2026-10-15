# Forum build plan — robwattfilms.com

A Roger Deakins–style forum (categories → topics → replies, member accounts,
recent activity, search, moderation) built into the existing static site.

- **Front end:** plain HTML/CSS/JS pages in this repo, hosted on GitHub Pages like the rest of the site.
- **Back end:** Supabase (free plan) for the database, logins and security rules.
- **Database:** `supabase/schema.sql` (already written and tested — run it, don't rewrite it).

> **For Claude Code:** work through the phases in order. Finish each phase's
> "Done when" checks and show Rob the result in Live Server before starting the
> next one. Match the existing site style in `css/style.css` (minimal, lowercase,
> Helvetica, black on white) and reuse the header/footer markup from `html/about.html`.

---

## Phase 0 — Supabase setup (Rob does this, ~15 min)

1. Sign up at supabase.com → **New project**. Name it `robwattfilms-forum`, choose the region closest to you, save the database password somewhere safe.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**. It should finish with no errors.
3. **Table Editor**: you should see `profiles`, `categories` (10 rows), `topics`, `replies`, `reports`.
4. **Authentication → Sign In / Providers**: keep **Email** on (magic link + password). Optional: turn on **Google** later.
5. **Authentication → URL Configuration**:
   - Site URL: `https://robwattfilms.com`
   - Redirect URLs: add `https://robwattfilms.com/**` and `http://127.0.0.1:5500/**` (Live Server).
6. **Authentication settings → Bot and Abuse Protection**: turn on **Enable CAPTCHA protection**, choose **Cloudflare Turnstile** (free; create a Turnstile widget at cloudflare.com and paste its secret key here). Keep the Turnstile *site* key for Phase 3.
7. **Custom email (required before launch).** Supabase's built-in email only sends to your own team's addresses and about 2 emails an hour, so members couldn't confirm accounts. Sign up for an email service such as Resend (free tier), verify `robwattfilms.com` there by adding the DNS records it gives you, then in Supabase **Authentication settings → SMTP** enter its host, port, username and password, with sender `forum@robwattfilms.com`. Then raise the email limit under **Rate Limits** if needed.
8. **Project Settings → API**: copy the **Project URL** and the **publishable / anon key**.
   - These two are safe to put in the website code — the security rules protect the data.
   - **Never** put the `service_role` / secret key in the website or commit it to GitHub.

Give Claude Code the Project URL, publishable key and Turnstile site key.

---

## Phase 1 — Wiring and file structure

Create:

```
js/forum/config.js        ← SUPABASE_URL, SUPABASE_KEY, TURNSTILE_SITE_KEY
js/forum/client.js        ← creates the Supabase client, shared helpers (auth state, time-ago, render text)
html/forum.html           ← forum index (Deakins-style category table)
html/forum/category.html  ← topics in one category      ?c=lighting
html/forum/topic.html     ← one thread + replies         ?id=123
html/forum/new.html       ← start a topic                ?c=lighting
html/forum/login.html     ← sign in / sign up / reset password
html/forum/profile.html   ← member profile; edit your own ?u=username
html/forum/search.html    ← search results               ?q=drone+permits
html/forum/mod.html       ← moderator queue (reports)
```

- Load the client from the CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (exposes `supabase.createClient`).
- Add **forum** to the main nav on every page, plus `sitemap.xml` and `llms.txt` entries for `html/forum.html`.
- Add forum styles to the bottom of `css/style.css` under a `/* ---------- Forum ---------- */` heading.

**Done when:** the forum page loads in Live Server and logs the 10 categories to the console.

---

## Phase 2 — Read-only forum (no login yet)

**Forum index (`html/forum.html`)** — mirror the Deakins layout:
- Table with columns **Forum · Topics · Replies · Last post**, from the `category_stats` view, ordered by `position`.
- Each row: category name (link) + one-line description; last post shown as "3 hours ago".
- Below: **Recent topics** (latest 8 from `topics`, with author username) and **Recent replies** (latest 8 from `replies`, with a short excerpt and the thread title).
- Small search box at the top.

**Category page:** pinned topics first, then by `last_post_at` newest first. Columns **Topic · Started by · Replies · Last post**. Paginate 25 per page.

**Topic page:** the opening post, then replies oldest → newest, each with author, time, and "edited" if `edited_at` is set. Paginate 30 replies per page. Show a "locked" note if `is_locked`.

Rules for all pages:
- **Never insert member text with `innerHTML`.** Use `textContent`, or (if adding Markdown later) render with `marked` and clean with `DOMPurify`. This stops people injecting scripts.
- Turn line breaks into paragraphs and plain URLs into links (`rel="nofollow ugc noopener"`).
- Avatars: a circle with the member's initials (no external avatar service).
- Show friendly empty states ("no topics yet — start one") and an error message if Supabase can't be reached.
- Set each page's `<title>` and meta description from the data (e.g. topic title).

**Done when:** you can browse index → category → topic with seeded test data (add 2–3 test topics from the Supabase Table Editor).

---

## Phase 3 — Accounts

**Login page:** tabs for **Sign in** (email + password, or "email me a magic link"), **Create account**, **Forgot password**. Include the Turnstile widget on sign-up and magic-link forms and pass its token as `options: { captchaToken }` (once CAPTCHA is on, Supabase requires it on sign-up and sign-in calls — check the current docs for each method).

- Header shows "sign in" or the member's username + "sign out" on every forum page.
- New accounts get a placeholder username (`user_ab12cd34`). After first sign-in, send them to their profile to pick a username (3–24 chars: lowercase letters, numbers, underscore) — show a clear message if it's taken.
- Profile page: username, display name, short bio, join date, and their recent topics/replies. Editable only by the owner.
- Link **Terms & forum rules** and a short **privacy note** (we store your email to sign you in; we don't share it) from the sign-up form.

Then make Rob admin: sign up on the site, then run the last statement in `schema.sql` (section 7) in the SQL Editor with Rob's email.

**Done when:** you can sign up, confirm by email, choose a username, sign out and back in.

---

## Phase 4 — Posting

- **New topic:** category (pre-selected from `?c=`), title (5–150 chars), body (up to 20,000). Character counter. On success go to the new topic.
- **Reply** box at the bottom of each topic (hidden if signed out → "sign in to reply"; hidden if locked).
- **Edit** button on your own topics/replies (inline edit, then save).
- **Report** link on every post → short reason → inserts into `reports`.
- Show database errors in plain language, especially "You are posting too fast" (20-second flood limit) and permission errors.
- Disable the submit button while sending to prevent double posts.

**Done when:** two test accounts can start topics, reply to each other, edit their own posts, and **cannot** edit each other's (try it in the browser console too — it must fail).

---

## Phase 5 — Moderation (Rob + any moderators)

Shown only when the signed-in profile's `role` is `moderator` or `admin`:

- On each post: **hide / unhide**, **delete**.
- On each topic: **pin / unpin**, **lock / unlock**, **move to category**.
- On a profile: **ban / unban**, and (admin only) **make moderator**.
- `html/forum/mod.html`: list open reports with links to the post, buttons **resolve** / **dismiss**.

The database already enforces all of this — the buttons are just a UI for it.

**Done when:** a moderator can lock a thread (members can no longer reply), hide a reply (the reply count drops), and ban a test account (it can no longer post).

---

## Phase 6 — Search

- Search page calls `supabase.rpc('search_forum', { q })` and lists matching topics with a short snippet and date.
- Supports quotes and `-exclude` words (Postgres web search syntax).

**Done when:** searching "drone" finds a test topic containing that word in a reply.

---

## Phase 7 — SEO pages + keep the free project awake

Forum threads loaded by JavaScript are hard for Google and AI tools to read. Fix it with a nightly GitHub Action:

1. `.github/workflows/forum-pages.yml` runs daily (and on demand).
2. A small Node script reads public topics and replies through the Supabase API (publishable key, stored as a GitHub Actions secret) and writes a plain HTML page per thread to `html/forum/t/<id>-<slug>.html`, with:
   - the full thread text in the HTML,
   - `<title>`, meta description, canonical link,
   - `DiscussionForumPosting` schema (author, date, comment count),
   - a "join the discussion" link to the live `topic.html?id=…`.
3. Regenerates the forum section of `sitemap.xml`, then commits and pushes the changes.
4. Category and index links point to these static pages, so crawlers can follow them.

The daily database read also counts as activity, which should stop the free Supabase project pausing after a quiet week. Check the dashboard after launch to confirm; if it still pauses, upgrade to Pro ($25/month).

**Done when:** the workflow runs green and a generated thread page shows the full conversation with JavaScript turned off.

---

## Phase 8 — Launch

1. Seed 6–10 real threads from Rob (welcome + rules pinned in Site News, an aerial breakdown, an Ask Rob thread, a podcast episode thread).
2. Test on a phone: browse, sign up, post, reply.
3. Push to GitHub, check the live site, submit the updated sitemap in Google Search Console.
4. Announce on Instagram and the Getting Made Podcast.

---

## Later (optional)

- **Email notifications** for replies to your threads (Supabase Edge Function + an email service like Resend).
- **Images in posts** via Supabase Storage (size limits, images only).
- **Markdown** formatting (`marked` + `DOMPurify`).
- **Subforums** — the `categories.parent_id` column is already there (e.g. Podcast → Guest suggestions).
- **Sign in with Google.**

---

## Security checklist (re-check before launch)

- [ ] Only the publishable/anon key is in the site code; no `service_role` key anywhere in the repo.
- [ ] Row Level Security is **on** for every table (Supabase dashboard shows no "RLS disabled" warnings).
- [ ] No member content is ever written with `innerHTML` unless it's been through DOMPurify.
- [ ] A signed-out visitor cannot post; a member cannot edit someone else's post; a member cannot make themselves admin — all tried from the browser console.
- [ ] CAPTCHA is on for sign-up.
