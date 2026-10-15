/* Rob Watt Films — forum client and shared helpers
   Load order on every forum page:
     supabase-js (CDN) → /js/forum/config.js → this file → the page's own script

   Rule: member-written text is only ever added with textContent / text nodes
   (see renderText), never innerHTML, so nobody can inject scripts. */

(function () {
  var cfg = window.FORUM_CONFIG || {};
  var ready = window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_KEY;

  var db = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;

  // ---------- small DOM helpers ----------

  // el('a', { href: '/x', class: 'y' }, ['text', childNode]) — strings become text nodes
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    [].concat(children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // ---------- time ----------

  function timeAgo(value) {
    if (!value) return '';
    var then = new Date(value).getTime();
    var secs = Math.round((Date.now() - then) / 1000);
    if (secs < 45) return 'just now';
    var units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < units.length; i++) {
      var n = Math.floor(secs / units[i][1]);
      if (n >= 1) return n + ' ' + units[i][0] + (n === 1 ? '' : 's') + ' ago';
    }
    return 'just now';
  }

  function fullDate(value) {
    return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }

  // <time> element showing "3 hours ago", with the exact date on hover
  function timeEl(value) {
    return el('time', { datetime: value, title: fullDate(value) }, timeAgo(value));
  }

  // ---------- member text ----------

  var URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

  // Append plain text to `parent`, turning URLs into safe links.
  function appendLinked(parent, text) {
    var last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      var url = m[0].replace(/[.,;:!?)\]]+$/, ''); // don't swallow trailing punctuation
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      parent.appendChild(el('a', { href: url, rel: 'nofollow ugc noopener', target: '_blank' }, url));
      last = m.index + url.length;
      URL_RE.lastIndex = last;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  // Render member text into `container`: blank lines → paragraphs,
  // single line breaks → <br>, URLs → nofollow links. Never uses innerHTML.
  function renderText(container, text) {
    container.textContent = '';
    String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).forEach(function (block) {
      if (!block.trim()) return;
      var p = el('p');
      block.split('\n').forEach(function (line, i) {
        if (i) p.appendChild(el('br'));
        appendLinked(p, line);
      });
      container.appendChild(p);
    });
  }

  // ---------- avatars ----------

  function initials(profile) {
    var name = (profile && (profile.display_name || profile.username)) || '?';
    var parts = name.replace(/_/g, ' ').trim().split(/\s+/);
    var s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
    return s.toUpperCase();
  }

  function avatar(profile, size) {
    return el('span', { class: 'forum-avatar' + (size ? ' forum-avatar--' + size : ''), 'aria-hidden': 'true' }, initials(profile));
  }

  // ---------- status messages ----------

  function message(container, text, kind) {
    container.textContent = '';
    container.appendChild(el('p', { class: 'forum-msg' + (kind ? ' forum-msg--' + kind : ''), role: kind === 'error' ? 'alert' : null }, text));
  }

  var OFFLINE = 'The forum can’t be reached right now. Please try again in a moment.';

  // ---------- links, excerpts, page meta, paging ----------

  // Link to a member's profile (falls back to plain text if the profile is missing)
  function userLink(profile) {
    if (!profile || !profile.username) return el('span', { class: 'forum-muted' }, 'deleted member');
    return el('a', { href: '/forum/profile/?u=' + encodeURIComponent(profile.username), class: 'forum-user' }, profile.username);
  }

  function topicHref(id, page, hash) {
    return '/forum/topic/?id=' + encodeURIComponent(id) + (page > 1 ? '&page=' + page : '') + (hash || '');
  }

  // One-line excerpt of member text (plain string, safe to put in textContent)
  function excerpt(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
  }

  // Set <title>, meta description and the visible breadcrumb from the data
  function setPage(opts) {
    if (opts.title) document.title = opts.title + ' | Forum | Rob Watt';
    if (opts.description) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', excerpt(opts.description, 155));
    }
    if (opts.heading !== undefined) {
      var h = document.querySelector('.forum-title');
      if (h) h.textContent = opts.heading;
    }
    if (opts.crumbs) {
      var nav = document.querySelector('.forum-crumbs');
      if (nav) {
        nav.textContent = '';
        nav.appendChild(el('a', { href: '/forum/' }, 'forum'));
        opts.crumbs.forEach(function (c) {
          nav.appendChild(el('span', { 'aria-hidden': 'true' }, '/'));
          nav.appendChild(c.href ? el('a', { href: c.href }, c.text) : el('span', null, c.text));
        });
      }
    }
  }

  function currentPage() {
    var p = parseInt(param('page'), 10);
    return p > 0 ? p : 1;
  }

  // "← newer · page 2 of 5 · older →" style pager; makeHref(n) builds each link
  function pager(page, totalPages, makeHref) {
    if (totalPages <= 1) return null;
    var nav = el('nav', { class: 'forum-pager', 'aria-label': 'Pages' });
    nav.appendChild(page > 1 ? el('a', { href: makeHref(page - 1), rel: 'prev' }, '← previous') : el('span', { class: 'forum-muted' }, '← previous'));
    nav.appendChild(el('span', null, 'page ' + page + ' of ' + totalPages));
    nav.appendChild(page < totalPages ? el('a', { href: makeHref(page + 1), rel: 'next' }, 'next →') : el('span', { class: 'forum-muted' }, 'next →'));
    return nav;
  }

  // Column lists for queries. topics/replies each have more than one link to
  // profiles, so the foreign key is named to say which one we mean.
  var SELECT = {
    topicRow: 'id, title, is_pinned, is_locked, reply_count, created_at, last_post_at, ' +
              'author:profiles!topics_author_id_fkey(username, display_name), ' +
              'last:profiles!topics_last_post_by_fkey(username, display_name)',
    reply:    'id, topic_id, body, created_at, edited_at, is_hidden, ' +
              'author:profiles!replies_author_id_fkey(username, display_name)'
  };

  var REPLIES_PER_PAGE = 30;
  var TOPICS_PER_PAGE = 25;

  // ---------- auth (filled out in Phase 3) ----------

  function getSession() {
    return db ? db.auth.getSession().then(function (r) { return r.data.session; }) : Promise.resolve(null);
  }

  // Header slot on forum pages: "sign in" or the member's name + "sign out"
  function renderAuthSlot() {
    var slot = document.querySelector('[data-forum-auth]');
    if (!slot) return;
    slot.textContent = '';
    slot.appendChild(el('a', { href: '/forum/login/' }, 'sign in'));
  }

  window.Forum = {
    db: db,
    config: cfg,
    el: el,
    param: param,
    timeAgo: timeAgo,
    fullDate: fullDate,
    timeEl: timeEl,
    renderText: renderText,
    initials: initials,
    avatar: avatar,
    message: message,
    OFFLINE: OFFLINE,
    userLink: userLink,
    topicHref: topicHref,
    excerpt: excerpt,
    setPage: setPage,
    currentPage: currentPage,
    pager: pager,
    SELECT: SELECT,
    REPLIES_PER_PAGE: REPLIES_PER_PAGE,
    TOPICS_PER_PAGE: TOPICS_PER_PAGE,
    getSession: getSession,
    renderAuthSlot: renderAuthSlot
  };

  if (!db) console.error('Forum: Supabase client not loaded — check the CDN script and js/forum/config.js');
  document.addEventListener('DOMContentLoaded', renderAuthSlot);
})();
