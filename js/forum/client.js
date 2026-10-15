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
    topicRow: 'id, title, is_pinned, is_locked, is_hidden, reply_count, created_at, last_post_at, ' +
              'author:profiles!topics_author_id_fkey(username, display_name), ' +
              'last:profiles!topics_last_post_by_fkey(username, display_name)',
    reply:    'id, topic_id, body, created_at, edited_at, is_hidden, ' +
              'author:profiles!replies_author_id_fkey(username, display_name)'
  };

  var REPLIES_PER_PAGE = 30;
  var TOPICS_PER_PAGE = 25;

  // ---------- auth ----------

  // New accounts start with a placeholder like user_ab12cd34 until they pick one
  var PLACEHOLDER_RE = /^user_[0-9a-f]{8}$/;
  var USERNAME_RE = /^[a-z0-9_]{3,24}$/;

  function getSession() {
    return db ? db.auth.getSession().then(function (r) { return r.data.session; }) : Promise.resolve(null);
  }

  // The signed-in member's profile (or null). Cached until sign-in/out.
  var mePromise = null;
  function me() {
    if (!mePromise) {
      mePromise = getSession().then(function (session) {
        if (!session) return null;
        return db.from('profiles').select('id, username, display_name, bio, role, is_banned, created_at')
          .eq('id', session.user.id).maybeSingle()
          .then(function (r) {
            if (r.error) { console.error('Forum: could not load your profile', r.error); return null; }
            return r.data ? Object.assign(r.data, { email: session.user.email }) : null;
          });
      });
    }
    return mePromise;
  }

  function isMod(profile) {
    return !!(profile && (profile.role === 'moderator' || profile.role === 'admin'));
  }

  function needsUsername(profile) {
    return !!(profile && PLACEHOLDER_RE.test(profile.username));
  }

  function profileHref(username, setup) {
    return '/forum/profile/?u=' + encodeURIComponent(username) + (setup ? '&setup=1' : '');
  }

  // Where to go after signing in: pick a username first, otherwise back to `next`
  function afterSignIn(next) {
    return me().then(function (profile) {
      if (profile && needsUsername(profile)) return profileHref(profile.username, true);
      return safeNext(next);
    });
  }

  // Only allow returning to pages inside the forum (prevents open redirects)
  function safeNext(next) {
    return next && /^\/forum\/[^\/]/.test(next) && next.indexOf('//') === -1 ? next : '/forum/';
  }

  function loginHref() {
    var here = window.location.pathname + window.location.search;
    return '/forum/login/' + (here.indexOf('/forum/login/') === 0 ? '' : '?next=' + encodeURIComponent(here));
  }

  function signOut() {
    return db.auth.signOut().then(function () { window.location.href = '/forum/'; });
  }

  // Header slot on forum pages: "sign in" or the member's name + "sign out"
  function renderAuthSlot() {
    var slot = document.querySelector('[data-forum-auth]');
    if (!slot || !db) return;
    me().then(function (profile) {
      slot.textContent = '';
      if (!profile) {
        slot.appendChild(el('a', { href: loginHref() }, 'sign in'));
        return;
      }
      if (needsUsername(profile)) {
        slot.appendChild(el('a', { href: profileHref(profile.username, true), class: 'forum-attention' }, 'choose a username'));
      } else {
        slot.appendChild(el('a', { href: profileHref(profile.username) }, profile.username));
      }
      if (isMod(profile)) {
        slot.appendChild(document.createTextNode(' · '));
        slot.appendChild(el('a', { href: '/forum/mod/' }, 'mod queue'));
      }
      slot.appendChild(document.createTextNode(' · '));
      var out = el('a', { href: '#' }, 'sign out');
      out.addEventListener('click', function (e) { e.preventDefault(); signOut(); });
      slot.appendChild(out);
    });
  }

  // Keep the header in step if the member signs in/out in another tab
  if (db) {
    db.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        mePromise = null;
        if (document.readyState !== 'loading') renderAuthSlot();
      }
    });
  }

  // Turn Supabase auth errors into plain language
  function authError(err) {
    var m = String((err && err.message) || err || '').toLowerCase();
    if (m.indexOf('invalid login credentials') > -1) return 'That email and password don’t match.';
    if (m.indexOf('email not confirmed') > -1) return 'Please confirm your email first — check your inbox for the link.';
    if (m.indexOf('already registered') > -1) return 'There’s already an account with that email. Sign in instead.';
    if (m.indexOf('captcha') > -1) return 'The spam check didn’t go through. Please tick it again and retry.';
    if (m.indexOf('rate limit') > -1 || m.indexOf('too many') > -1) return 'Too many attempts. Please wait a few minutes and try again.';
    if (m.indexOf('signups not allowed') > -1 || m.indexOf('otp_disabled') > -1) return 'No account found for that email. Create an account first.';
    if (m.indexOf('password') > -1 && m.indexOf('least') > -1) return 'Please use a longer password (at least 8 characters).';
    if (m.indexOf('same password') > -1 || m.indexOf('different from the old') > -1) return 'Please choose a password you haven’t used here before.';
    if (m.indexOf('failed to fetch') > -1 || m.indexOf('network') > -1) return OFFLINE;
    return 'Something went wrong: ' + ((err && err.message) || 'please try again.');
  }

  // Turn database errors from posting/editing into plain language
  function dbError(err) {
    if (!err) return '';
    var m = String(err.message || '');
    if (/posting too fast/i.test(m)) return 'You’re posting too fast. Please wait about 20 seconds and try again.';
    if (/only moderators/i.test(m)) return 'Only moderators can do that.';
    if (/only admins/i.test(m)) return 'Only admins can change member roles.';
    if (/be banned from the site/i.test(m)) return 'Admins can\u2019t be banned.';
    if (/username is reserved/i.test(m)) return 'That username is reserved. Please choose another.';
    if (err.code === '42501' || /row-level security|permission denied/i.test(m))
      return 'You don’t have permission to do that. Make sure you’re signed in — and the topic may be locked, or your account may be suspended.';
    if (err.code === '23514' || /check constraint/i.test(m)) {
      if (/title/i.test(m)) return 'Titles need to be 5–150 characters.';
      if (/body/i.test(m)) return 'Posts need to be between 1 and 20,000 characters.';
      if (/reason/i.test(m)) return 'Please give a reason of at least a few words (up to 1,000 characters).';
      return 'That doesn’t meet the length rules. Please check and try again.';
    }
    if (err.code === 'PGRST116') return 'That couldn’t be saved — you can only edit your own posts.';
    if (/failed to fetch|network/i.test(m)) return OFFLINE;
    return 'Something went wrong: ' + (m || 'please try again.');
  }

  // Live "123 / 20,000" counter under a field; returns the counter element
  function counter(field, max, min) {
    var c = el('span', { class: 'forum-muted forum-counter', 'aria-live': 'off' });
    function update() {
      var n = field.value.trim().length;
      c.textContent = n.toLocaleString() + ' / ' + max.toLocaleString();
      c.classList.toggle('forum-attention', n > max || (min && n > 0 && n < min));
    }
    field.addEventListener('input', update);
    update();
    return c;
  }

  // Can the signed-in member post? Returns a reason string if not.
  function postingBlocker(profile) {
    if (!profile) return 'signin';
    if (profile.is_banned) return 'banned';
    if (needsUsername(profile)) return 'username';
    return null;
  }

  // Short explanation + link shown where a posting form would be
  function blockedNote(reason, profile, what) {
    if (reason === 'signin') return el('p', { class: 'forum-msg forum-gate' }, [el('a', { href: loginHref() }, 'Sign in'), ' or ', el('a', { href: '/forum/login/#signup' }, 'create an account'), ' to ' + what + '.']);
    if (reason === 'username') return el('p', { class: 'forum-msg forum-gate' }, [el('a', { href: profileHref(profile.username, true) }, 'Choose a username'), ' before you ' + what + '.']);
    if (reason === 'banned') return el('p', { class: 'forum-msg forum-gate' }, 'Your account has been suspended, so you can’t ' + what + '.');
    return null;
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
    me: me,
    needsUsername: needsUsername,
    isMod: isMod,
    profileHref: profileHref,
    afterSignIn: afterSignIn,
    safeNext: safeNext,
    loginHref: loginHref,
    signOut: signOut,
    authError: authError,
    dbError: dbError,
    counter: counter,
    postingBlocker: postingBlocker,
    blockedNote: blockedNote,
    USERNAME_RE: USERNAME_RE,
    renderAuthSlot: renderAuthSlot
  };

  if (!db) console.error('Forum: Supabase client not loaded — check the CDN script and js/forum/config.js');
  document.addEventListener('DOMContentLoaded', renderAuthSlot);
})();
