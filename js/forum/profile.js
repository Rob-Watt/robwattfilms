/* Member profile — /forum/profile/?u=username  (owner can edit; &setup=1 after first sign-in) */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var username = (F.param('u') || '').toLowerCase();

  // Names only Rob / moderators may use (stops people posing as Rob or staff)
  var RESERVED = ['robwatt', 'rob_watt', 'rob_watt_', 'robwattfilms', 'admin', 'administrator',
                  'moderator', 'mod', 'mods', 'staff', 'support', 'forum', 'help', 'official'];

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }

  Promise.all([F.me(), username ? loadProfile(username) : Promise.resolve(null)]).then(function (r) {
    var mine = r[0], profile = r[1];
    if (!username) {
      // /forum/profile/ with no name: go to your own profile, or sign in
      window.location.replace(mine ? F.profileHref(mine.username, F.needsUsername(mine)) : F.loginHref());
      return;
    }
    if (!profile) { notFound(); return; }
    var isOwner = !!(mine && mine.id === profile.id);
    render(profile, isOwner, mine);
  }, function (err) {
    console.error('Forum: could not load profile', err);
    F.message(root, F.OFFLINE, 'error');
  });

  function loadProfile(name) {
    return F.db.from('profiles').select('id, username, display_name, bio, role, is_banned, created_at')
      .eq('username', name).maybeSingle()
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  function notFound() {
    F.setPage({ title: 'Member not found', heading: 'member not found', crumbs: [{ text: 'not found' }] });
    F.message(root, 'There’s no member with that username. ');
    root.firstChild.appendChild(el('a', { href: '/forum/' }, 'Back to the forum.'));
  }

  function render(p, isOwner, mine) {
    var name = p.display_name || p.username;
    F.setPage({
      title: name + ' (@' + p.username + ')',
      description: p.bio || (name + ' on the Rob Watt Films forum.'),
      heading: isOwner && F.needsUsername(p) ? 'welcome' : name,
      crumbs: [{ text: p.username }]
    });
    root.textContent = '';

    if (isOwner && F.needsUsername(p)) {
      root.appendChild(el('p', { class: 'forum-notice' },
        'Welcome! Choose a username below — it’s how other members will see you on the forum.'));
    }

    // Card
    var badges = [];
    if (p.role === 'admin') badges.push(el('span', { class: 'forum-flag' }, 'admin'));
    else if (p.role === 'moderator') badges.push(el('span', { class: 'forum-flag' }, 'moderator'));
    if (p.is_banned) badges.push(el('span', { class: 'forum-flag forum-flag--warn' }, 'banned'));

    var bio = el('div', { class: 'forum-post-body forum-profile-bio' });
    if (p.bio) F.renderText(bio, p.bio);

    root.appendChild(el('div', { class: 'forum-profile' }, [
      F.avatar(p, 'lg'),
      el('div', null, [
        el('p', { class: 'forum-profile-name' }, [el('strong', null, name), ' ', el('span', { class: 'forum-muted' }, '@' + p.username)].concat(badges.length ? [' '].concat(badges) : [])),
        el('p', { class: 'forum-muted forum-profile-joined' }, 'joined ' + new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })),
        p.bio ? bio : null
      ])
    ]));

    if (isOwner) root.appendChild(editForm(p, mine));

    var activity = el('div', { class: 'forum-recent' });
    root.appendChild(activity);
    loadActivity(p, activity);
  }

  // ---------- edit form (owner only; the database also enforces this) ----------
  function editForm(p, mine) {
    var setup = F.needsUsername(p);
    var status = el('p', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
    var uInput = el('input', { id: 'pf-username', name: 'username', type: 'text', value: setup ? '' : p.username,
      placeholder: 'e.g. jane_doe', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '24', required: true });
    var dInput = el('input', { id: 'pf-display', name: 'display_name', type: 'text', value: p.display_name || '', maxlength: '60', autocomplete: 'name' });
    var bInput = el('textarea', { id: 'pf-bio', name: 'bio', rows: '4', maxlength: '500' });
    bInput.value = p.bio || '';
    var counter = el('span', { class: 'forum-muted forum-counter' });
    function count() { counter.textContent = bInput.value.length + ' / 500'; }
    bInput.addEventListener('input', count); count();
    uInput.addEventListener('input', function () { uInput.value = uInput.value.toLowerCase().replace(/\s/g, '_'); });

    var button = el('button', { type: 'submit', class: 'forum-button' }, setup ? 'save username' : 'save profile');
    var form = el('form', { class: 'forum-form forum-profile-form', novalidate: true }, [
      el('h2', null, setup ? 'choose your username' : 'edit your profile'),
      el('label', { for: 'pf-username' }, ['username ', el('span', { class: 'forum-muted' }, '(3–24 characters: lowercase letters, numbers and _)')]),
      uInput,
      el('label', { for: 'pf-display' }, ['display name ', el('span', { class: 'forum-muted' }, '(optional, e.g. your real name)')]),
      dInput,
      el('label', { for: 'pf-bio' }, ['short bio ', el('span', { class: 'forum-muted' }, '(optional)')]),
      bInput, counter,
      el('div', { class: 'forum-form-actions' }, button),
      status
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = uInput.value.trim().toLowerCase();
      var d = dInput.value.trim();
      var b = bInput.value.trim();
      function say(t, k) { status.textContent = t; status.className = 'forum-msg' + (k ? ' forum-msg--' + k : ''); }

      if (!F.USERNAME_RE.test(u)) { say('Usernames are 3–24 characters: lowercase letters, numbers and underscores only.', 'error'); uInput.focus(); return; }
      if (/^user_[0-9a-f]{8}$/.test(u)) { say('Please choose your own username.', 'error'); uInput.focus(); return; }
      if (RESERVED.indexOf(u) > -1 && !(mine && (mine.role === 'admin' || mine.role === 'moderator'))) {
        say('That username is reserved. Please choose another.', 'error'); uInput.focus(); return;
      }

      button.disabled = true;
      say('Saving…');
      F.db.from('profiles')
        .update({ username: u, display_name: d || null, bio: b || null })
        .eq('id', p.id).select('username').single()
        .then(function (res) {
          button.disabled = false;
          if (res.error) {
            var c = res.error.code;
            if (c === '23505') say('That username is taken. Please try another.', 'error');
            else if (c === '23514') say('That doesn’t fit the username rules (3–24 lowercase letters, numbers, _).', 'error');
            else if (c === 'PGRST116') say('You can only edit your own profile.', 'error');
            else say('Couldn’t save: ' + res.error.message, 'error');
            return;
          }
          // Reload so the header and address bar use the new name
          window.location.replace(F.profileHref(res.data.username) + '&saved=1');
        });
    });

    if (F.param('saved')) setTimeout(function () { status.textContent = 'Saved.'; status.className = 'forum-msg forum-msg--ok'; }, 0);
    if (setup) setTimeout(function () { uInput.focus(); }, 0);
    return form;
  }

  // ---------- recent topics / replies ----------
  function loadActivity(p, box) {
    Promise.all([
      F.db.from('topics').select('id, title, created_at, category:categories(slug, name)')
        .eq('author_id', p.id).order('created_at', { ascending: false }).limit(10),
      F.db.from('replies').select('id, body, created_at, topic:topics(id, title, reply_count)')
        .eq('author_id', p.id).order('created_at', { ascending: false }).limit(10)
    ]).then(function (r) {
      if (r[0].error || r[1].error) { console.error('Forum: activity', r[0].error || r[1].error); return; }

      var topics = el('section', { class: 'forum-recent-col' }, el('h2', null, 'recent topics'));
      if (!r[0].data.length) topics.appendChild(el('p', { class: 'forum-msg' }, 'no topics yet.'));
      else topics.appendChild(el('ul', { class: 'forum-list' }, r[0].data.map(function (t) {
        return el('li', null, [
          el('a', { href: F.topicHref(t.id), class: 'forum-list-title' }, t.title),
          el('span', { class: 'forum-list-meta' }, [t.category ? t.category.name + ' · ' : '', F.timeEl(t.created_at)])
        ]);
      })));

      var replies = el('section', { class: 'forum-recent-col' }, el('h2', null, 'recent replies'));
      var rows = r[1].data.filter(function (x) { return x.topic; });
      if (!rows.length) replies.appendChild(el('p', { class: 'forum-msg' }, 'no replies yet.'));
      else replies.appendChild(el('ul', { class: 'forum-list' }, rows.map(function (x) {
        var lastPage = Math.max(1, Math.ceil(x.topic.reply_count / F.REPLIES_PER_PAGE));
        return el('li', null, [
          el('a', { href: F.topicHref(x.topic.id, lastPage, '#r' + x.id), class: 'forum-list-title' }, x.topic.title),
          el('span', { class: 'forum-list-excerpt' }, '“' + F.excerpt(x.body, 110) + '”'),
          el('span', { class: 'forum-list-meta' }, F.timeEl(x.created_at))
        ]);
      })));

      box.appendChild(topics);
      box.appendChild(replies);
    });
  }
})();
