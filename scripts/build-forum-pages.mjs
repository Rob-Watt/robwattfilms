#!/usr/bin/env node
/* Build plain-HTML copies of every public forum thread so search engines and
   AI tools can read them without running JavaScript.

   Writes:
     forum/t/<id>-<slug>/index.html   one page per visible topic (full conversation)
     forum/t/index.html               "all threads" list, grouped by section
     sitemap.xml                      the block between the forum markers

   Reads the forum through the public (publishable) key in js/forum/config.js,
   so it only ever sees what a signed-out visitor can see — hidden posts never
   appear. Run locally:  node scripts/build-forum-pages.mjs
   In GitHub Actions it also tells IndexNow about pages that changed. */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://robwattfilms.com';
const OUT = join(ROOT, 'forum', 't');

// ---------- settings from the site's own config ----------
const cfg = readFileSync(join(ROOT, 'js/forum/config.js'), 'utf8');
const SUPABASE_URL = process.env.SUPABASE_URL || cfg.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const SUPABASE_KEY = process.env.SUPABASE_KEY || cfg.match(/SUPABASE_KEY:\s*'([^']+)'/)[1];

// ---------- Supabase REST (read-only, paged) ----------
async function fetchAll(table, query) {
  const rows = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${from}-${from + step - 1}` }
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < step) return rows;
  }
}

// ---------- text helpers (same rules as the live forum) ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function slugify(title) {
  return String(title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'topic';
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
function linkify(line) {
  let out = '', last = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(line))) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    out += esc(line.slice(last, m.index)) + `<a href="${esc(url)}" rel="nofollow ugc noopener" target="_blank">${esc(url)}</a>`;
    last = m.index + url.length;
    URL_RE.lastIndex = last;
  }
  return out + esc(line.slice(last));
}

// Blank lines → paragraphs, single newlines → <br>, URLs → nofollow links. Everything escaped.
function renderText(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
    .filter(b => b.trim())
    .map(b => '<p>' + b.split('\n').map(linkify).join('<br>') + '</p>')
    .join('\n          ');
}

const plain = (text, max) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
};
const day = iso => iso.slice(0, 10);
const human = iso => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).toLowerCase();
const initials = p => {
  const name = (p && (p.display_name || p.username)) || '?';
  const parts = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  if (!parts[0]) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
};
const profileUrl = p => p ? `${SITE}/forum/profile/?u=${encodeURIComponent(p.username)}` : undefined;
const personLd = p => p ? { '@type': 'Person', name: p.display_name || p.username, url: profileUrl(p) } : { '@type': 'Person', name: 'deleted member' };
const userLink = p => p ? `<a href="/forum/profile/?u=${esc(encodeURIComponent(p.username))}" class="forum-user">${esc(p.username)}</a>` : '<span class="forum-muted">deleted member</span>';

// ---------- page shell taken from the live forum index (header, footer, icons) ----------
const template = readFileSync(join(ROOT, 'forum/index.html'), 'utf8');
const pick = re => (template.match(re) || [''])[0];
const ICONS = pick(/  <link rel="icon" href="\/favicon\.ico"[\s\S]*?<link rel="stylesheet" href="\/css\/style\.css">/);
const HEADER = pick(/  <header class="site-header">[\s\S]*?<\/header>/);
const FOOTER = pick(/  <footer class="site-footer">[\s\S]*?<\/footer>/);
if (!ICONS || !HEADER || !FOOTER) throw new Error('Could not read the header/footer from forum/index.html');

function page({ title, description, canonical, jsonld, crumbs, heading, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(heading)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE}/images/og-image.jpg">
  <meta name="twitter:card" content="summary_large_image">
${ICONS}
${jsonld ? `
  <script type="application/ld+json">
  ${JSON.stringify(jsonld, null, 2).replace(/</g, '\\u003c').replace(/\n/g, '\n  ')}
  </script>` : ''}
</head>
<body>

${HEADER}

  <main class="forum forum-static">
    <div class="forum-bar">
      <nav class="forum-crumbs" aria-label="Forum">${crumbs}</nav>
      <div class="forum-bar-links">
        <a href="/forum/search/">search</a>
      </div>
    </div>

    <h1 class="forum-title">${esc(heading)}</h1>

${body}
  </main>

${FOOTER}

  <script src="/js/main.js"></script>
</body>
</html>
`;
}

// ---------- build ----------
const topics = await fetchAll('topics',
  'select=id,title,body,is_pinned,is_locked,reply_count,created_at,edited_at,last_post_at,' +
  'author:profiles!topics_author_id_fkey(username,display_name),category:categories(slug,name,position)' +
  '&order=id.asc');
const replies = await fetchAll('replies',
  'select=id,topic_id,body,created_at,edited_at,author:profiles!replies_author_id_fkey(username,display_name)' +
  '&order=created_at.asc,id.asc');

const byTopic = new Map();
for (const r of replies) {
  if (!byTopic.has(r.topic_id)) byTopic.set(r.topic_id, []);
  byTopic.get(r.topic_id).push(r);
}

mkdirSync(OUT, { recursive: true });
const changed = [];
const keep = new Set();
const writeIfChanged = (file, html, url) => {
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file) || readFileSync(file, 'utf8') !== html) { writeFileSync(file, html); changed.push(url); }
};

for (const t of topics) {
  const dir = `${t.id}-${slugify(t.title)}`;
  keep.add(dir);
  const url = `${SITE}/forum/t/${dir}/`;
  const live = `/forum/topic/?id=${t.id}`;
  const rs = byTopic.get(t.id) || [];
  const cat = t.category || { slug: '', name: 'forum' };
  const modified = [t.edited_at, t.last_post_at, ...rs.map(r => r.edited_at)].filter(Boolean).sort().pop() || t.created_at;

  const post = (item, anchor, op) => `      <article class="forum-post${op ? ' forum-post--op' : ''}" id="${anchor}">
        <header class="forum-post-head">
          <span class="forum-avatar" aria-hidden="true">${esc(initials(item.author))}</span>
          <span class="forum-post-meta">${userLink(item.author)} · <time datetime="${item.created_at}">${human(item.created_at)}</time>${item.edited_at ? ' <span class="forum-muted">· edited</span>' : ''}</span>
        </header>
        <div class="forum-post-body">
          ${renderText(item.body)}
        </div>
      </article>`;

  const flags = [t.is_pinned && 'pinned', t.is_locked && 'locked'].filter(Boolean)
    .map(f => `<span class="forum-flag">${f}</span>`).join('');

  const body = [
    flags ? `    <p class="forum-flags">${flags}</p>` : '',
    post(t, `t${t.id}`, true),
    rs.length ? `    <h2 class="forum-replies-head">${rs.length} ${rs.length === 1 ? 'reply' : 'replies'}</h2>` : '',
    ...rs.map(r => post(r, `r${r.id}`, false)),
    `    <p class="forum-join">${t.is_locked ? 'This topic is locked.' : `<a href="${live}" class="forum-button">join the discussion</a>`}
      <span class="forum-muted">This is a plain copy of the thread, updated daily. <a href="${live}">See the live thread</a> for the newest replies.</span></p>`
  ].filter(Boolean).join('\n');

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': url,
    mainEntityOfPage: url,
    url,
    headline: t.title,
    text: t.body,
    datePublished: t.created_at,
    dateModified: modified,
    author: personLd(t.author),
    articleSection: cat.name,
    commentCount: rs.length,
    interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: rs.length },
    comment: rs.map(r => ({
      '@type': 'Comment', url: `${url}#r${r.id}`, text: r.body,
      datePublished: r.created_at, ...(r.edited_at ? { dateModified: r.edited_at } : {}), author: personLd(r.author)
    }))
  };

  const html = page({
    title: `${t.title} | ${cat.name} | Rob Watt Films Forum`,
    description: plain(t.body, 155),
    canonical: url,
    jsonld,
    heading: t.title,
    crumbs: `<a href="/forum/">forum</a> <span aria-hidden="true">/</span> <a href="/forum/t/#${esc(cat.slug)}">${esc(cat.name)}</a>`,
    body
  });
  writeIfChanged(join(OUT, dir, 'index.html'), html, url);
  t._dir = dir; t._modified = modified; t._cat = cat;
}

// Remove pages for topics that were deleted, hidden or renamed
for (const name of readdirSync(OUT, { withFileTypes: true })) {
  if (name.isDirectory() && !keep.has(name.name)) { rmSync(join(OUT, name.name), { recursive: true }); changed.push(`${SITE}/forum/t/${name.name}/`); }
}

// "All threads" page, grouped by section
const sections = new Map();
for (const t of [...topics].sort((a, b) => (a._cat.position ?? 99) - (b._cat.position ?? 99) || b.last_post_at.localeCompare(a.last_post_at))) {
  if (!sections.has(t._cat.slug)) sections.set(t._cat.slug, { name: t._cat.name, items: [] });
  sections.get(t._cat.slug).items.push(t);
}
const listBody = sections.size ? [...sections].map(([slug, s]) => `    <section class="forum-archive" id="${esc(slug)}">
      <h2>${esc(s.name)}</h2>
      <ul class="forum-list">
${s.items.map(t => `        <li><a href="/forum/t/${t._dir}/" class="forum-list-title">${esc(t.title)}</a><span class="forum-list-meta">${userLink(t.author)} · ${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'} · <time datetime="${t.last_post_at}">${human(t.last_post_at)}</time></span></li>`).join('\n')}
      </ul>
    </section>`).join('\n') : '    <p class="forum-msg">No threads yet.</p>';

const indexHtml = page({
  title: 'All threads | Rob Watt Films Forum',
  description: 'Every discussion on the Rob Watt Films forum, by section: aerial cinematography, camera, lighting, directing, post, film and the Getting Made Podcast.',
  canonical: `${SITE}/forum/t/`,
  jsonld: null,
  heading: 'all threads',
  crumbs: '<a href="/forum/">forum</a> <span aria-hidden="true">/</span> <span>all threads</span>',
  body: `    <p class="forum-msg">A plain list of every public thread, updated daily. <a href="/forum/">Back to the live forum.</a></p>\n${listBody}`
});
writeIfChanged(join(OUT, 'index.html'), indexHtml, `${SITE}/forum/t/`);

// ---------- sitemap: replace the forum block ----------
const START = '  <!-- forum threads: generated by scripts/build-forum-pages.mjs -->';
const END = '  <!-- /forum threads -->';
const block = [START,
  `  <url><loc>${SITE}/forum/t/</loc><lastmod>${day(topics.map(t => t._modified).sort().pop() || new Date().toISOString())}</lastmod></url>`,
  ...topics.map(t => `  <url><loc>${SITE}/forum/t/${t._dir}/</loc><lastmod>${day(t._modified)}</lastmod></url>`),
  END].join('\n');
const sitemapPath = join(ROOT, 'sitemap.xml');
let sitemap = readFileSync(sitemapPath, 'utf8');
sitemap = sitemap.includes(START)
  ? sitemap.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block)
  : sitemap.replace('</urlset>', `${block}\n</urlset>`);
if (sitemap !== readFileSync(sitemapPath, 'utf8')) writeFileSync(sitemapPath, sitemap);

console.log(`Forum pages: ${topics.length} threads, ${replies.length} replies, ${changed.length} page(s) changed.`);
changed.forEach(u => console.log('  changed:', u));

// ---------- IndexNow (GitHub Actions only) ----------
if (process.env.GITHUB_ACTIONS && changed.length) {
  const keyFile = readdirSync(ROOT).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
  if (keyFile) {
    const key = keyFile.slice(0, -4);
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: 'robwattfilms.com', key, keyLocation: `${SITE}/${keyFile}`, urlList: changed })
    });
    console.log('IndexNow:', res.status);
  }
}
