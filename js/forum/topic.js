/* Topic page — opening post, replies oldest → newest, reply box, edit, report.
   /forum/topic/?id=123&page=2
   The database enforces every permission; the buttons only appear when they'd work. */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var id = parseInt(F.param('id'), 10);
  var page = F.currentPage();
  var me = null;

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }
  if (!id) { window.location.replace('/forum/'); return; }

  var TOPIC_COLS = 'id, title, body, is_pinned, is_locked, is_hidden, reply_count, created_at, edited_at, author_id, ' +
                   'author:profiles!topics_author_id_fkey(username, display_name), category:categories(slug, name)';
  var REPLY_COLS = F.SELECT.reply + ', author_id';

  Promise.all([
    F.me(),
    F.db.from('topics').select(TOPIC_COLS).eq('id', id).maybeSingle()
  ]).then(function (r) {
    me = r[0];
    var res = r[1];
    if (res.error) { fail(res.error); return; }
    if (!res.data) { notFound(); return; }
    var topic = res.data;
    var from = (page - 1) * F.REPLIES_PER_PAGE;
    return F.db.from('replies').select(REPLY_COLS, { count: 'exact' })
      .eq('topic_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + F.REPLIES_PER_PAGE - 1)
      .then(function (rr) {
        if (rr.error) { fail(rr.error); return; }
        render(topic, rr.data, rr.count || 0);
      });
  }, fail);

  function fail(err) {
    console.error('Forum: could not load topic', err);
    F.message(root, F.OFFLINE, 'error');
  }

  function notFound() {
    F.setPage({ title: 'Topic not found', heading: 'topic not found', crumbs: [{ text: 'not found' }] });
    F.message(root, 'This topic doesn’t exist or has been removed. ');
    root.firstChild.appendChild(el('a', { href: '/forum/' }, 'Back to the forum index.'));
  }

  function render(topic, replies, total) {
    var cat = topic.category || { slug: '', name: 'forum' };
    currentCategoryHref = cat.slug ? '/forum/category/?c=' + encodeURIComponent(cat.slug) : '/forum/';
    F.setPage({
      title: topic.title,
      description: topic.body,
      heading: topic.title,
      crumbs: [{ text: cat.name, href: '/forum/category/?c=' + encodeURIComponent(cat.slug) }]
    });

    root.textContent = '';
    var totalPages = Math.max(1, Math.ceil(total / F.REPLIES_PER_PAGE));

    var flags = [];
    if (topic.is_pinned) flags.push(el('span', { class: 'forum-flag' }, 'pinned'));
    if (topic.is_locked) flags.push(el('span', { class: 'forum-flag' }, 'locked'));
    if (topic.is_hidden) flags.push(el('span', { class: 'forum-flag forum-flag--warn' }, 'hidden'));
    if (flags.length) root.appendChild(el('p', { class: 'forum-flags' }, flags));

    if (page === 1) {
      root.appendChild(post(topic, 'topic'));
    } else {
      root.appendChild(el('p', { class: 'forum-msg' }, ['page ' + page + ' of the discussion · ', el('a', { href: F.topicHref(topic.id) }, 'back to the opening post')]));
    }

    if (replies.length) {
      root.appendChild(el('h2', { class: 'forum-replies-head' }, total + (total === 1 ? ' reply' : ' replies')));
      replies.forEach(function (r) { root.appendChild(post(r, 'reply')); });
    } else if (page === 1) {
      root.appendChild(el('p', { class: 'forum-msg forum-empty' }, 'no replies yet.'));
    }

    var p = F.pager(page, totalPages, function (n) { return F.topicHref(topic.id, n); });
    if (p) root.appendChild(p);

    root.appendChild(replyArea(topic, total));

    if (window.location.hash) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  // ---------- one post (opening post or reply) ----------
  function post(item, kind) {
    var anchor = (kind === 'topic' ? 't' : 'r') + item.id;
    var body = el('div', { class: 'forum-post-body' });
    F.renderText(body, item.body);

    var meta = [F.userLink(item.author), ' · ', el('a', { href: '#' + anchor, class: 'forum-permalink' }, F.timeEl(item.created_at))];
    if (item.edited_at) meta.push(el('span', { class: 'forum-muted', title: 'edited ' + F.fullDate(item.edited_at) }, ' · edited'));
    if (kind === 'reply' && item.is_hidden) meta.push(' ', el('span', { class: 'forum-flag forum-flag--warn' }, 'hidden'));

    var article = el('article', { class: 'forum-post' + (kind === 'topic' ? ' forum-post--op' : ''), id: anchor }, [
      el('header', { class: 'forum-post-head' }, [F.avatar(item.author), el('span', { class: 'forum-post-meta' }, meta)]),
      body
    ]);

    var actions = postActions(item, kind, article);
    if (actions) article.appendChild(actions);
    return article;
  }

  function postActions(item, kind, article) {
    if (!me) return null;
    var links = [];
    var mine = item.author_id === me.id;
    if (mine && !me.is_banned) links.push(actionLink('edit', function () { startEdit(item, kind, article); }));
    if (!mine && !me.is_banned) links.push(actionLink('report', function () { startReport(item, kind, article); }));

    var bar = el('div', { class: 'forum-post-actions' });
    links.forEach(function (l, i) { if (i) bar.appendChild(document.createTextNode(' · ')); bar.appendChild(l); });

    if (F.isMod(me)) {
      var mod = el('span', { class: 'forum-mod-actions' }, el('span', { class: 'forum-mod-label' }, 'mod:'));
      var table = kind === 'topic' ? 'topics' : 'replies';
      var status = el('span', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
      var add = function (text, fn) { mod.appendChild(document.createTextNode(' ')); mod.appendChild(actionLink(text, fn)); };
      var set = function (changes) { return function () { modUpdate(table, item.id, changes, status); }; };

      if (kind === 'topic') {
        add(item.is_pinned ? 'unpin' : 'pin', set({ is_pinned: !item.is_pinned }));
        add(item.is_locked ? 'unlock' : 'lock', set({ is_locked: !item.is_locked }));
        add(item.is_hidden ? 'unhide' : 'hide', set({ is_hidden: !item.is_hidden }));
        add('move', function () { startMove(item, article, status); });
      } else {
        add(item.is_hidden ? 'unhide' : 'hide', set({ is_hidden: !item.is_hidden }));
      }
      add('delete', function () { modDelete(table, item, kind, status); });
      mod.appendChild(status);
      bar.appendChild(mod);
    }
    return bar.childNodes.length ? bar : null;
  }

  // ---------- moderator actions (the database only allows these for moderators/admins) ----------
  function modUpdate(table, rowId, changes, status) {
    status.textContent = ' saving…';
    status.className = 'forum-msg';
    F.db.from(table).update(changes).eq('id', rowId).select('id').single().then(function (res) {
      if (res.error) { status.textContent = ' ' + F.dbError(res.error); status.className = 'forum-msg forum-msg--error'; return; }
      window.location.reload();
    }, function (err) { status.textContent = ' ' + F.dbError(err); status.className = 'forum-msg forum-msg--error'; });
  }

  function modDelete(table, item, kind, status) {
    var what = kind === 'topic' ? 'this whole topic and all its replies' : 'this reply';
    if (!window.confirm('Permanently delete ' + what + '? This can’t be undone. (To take it down but keep a copy, use “hide” instead.)')) return;
    status.textContent = ' deleting…';
    F.db.from(table).delete().eq('id', item.id).select('id').then(function (res) {
      if (res.error || !res.data.length) {
        status.textContent = ' ' + (res.error ? F.dbError(res.error) : 'Couldn’t delete that.');
        status.className = 'forum-msg forum-msg--error';
        return;
      }
      if (kind === 'topic') window.location.href = currentCategoryHref || '/forum/';
      else window.location.reload();
    });
  }

  var currentCategoryHref = null;
  var categoriesQuery = null;

  function startMove(item, article, status) {
    if (article.querySelector('.forum-move')) return;
    categoriesQuery = categoriesQuery || F.db.from('categories').select('id, slug, name').order('position');
    categoriesQuery.then(function (res) {
      if (res.error) { status.textContent = ' ' + F.dbError(res.error); return; }
      var select = el('select', { 'aria-label': 'move to section' }, res.data.map(function (c) {
        return el('option', { value: String(c.id), selected: c.slug === (item.category && item.category.slug) }, c.name);
      }));
      var go = el('button', { type: 'submit', class: 'forum-button' }, 'move');
      var cancel = el('button', { type: 'button', class: 'forum-button forum-button--quiet' }, 'cancel');
      var form = el('form', { class: 'forum-form forum-move' }, [select, el('div', { class: 'forum-form-actions' }, [go, cancel])]);
      cancel.addEventListener('click', function () { form.remove(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        go.disabled = true;
        modUpdate('topics', item.id, { category_id: Number(select.value) }, status);
      });
      article.appendChild(form);
    });
  }

  function actionLink(text, onClick) {
    var b = el('button', { type: 'button', class: 'forum-linkbutton' }, text);
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- edit your own post (inline) ----------
  function startEdit(item, kind, article) {
    if (article.querySelector('.forum-edit')) return;
    var bodyEl = article.querySelector('.forum-post-body');
    var actions = article.querySelector('.forum-post-actions');
    var titleInput = kind === 'topic' ? el('input', { type: 'text', maxlength: '150', 'aria-label': 'title' }) : null;
    if (titleInput) titleInput.value = item.title;
    var area = el('textarea', { rows: '8', maxlength: '20000', 'aria-label': 'post' });
    area.value = item.body;
    var status = el('p', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
    var save = el('button', { type: 'submit', class: 'forum-button' }, 'save');
    var cancel = el('button', { type: 'button', class: 'forum-button forum-button--quiet' }, 'cancel');

    var form = el('form', { class: 'forum-form forum-form--wide forum-edit', novalidate: true }, [
      titleInput, titleInput ? F.counter(titleInput, 150, 5) : null,
      area, F.counter(area, 20000),
      el('div', { class: 'forum-form-actions' }, [save, cancel]),
      status
    ]);

    bodyEl.hidden = true;
    if (actions) actions.hidden = true;
    article.appendChild(form);
    area.focus();

    function close() { form.remove(); bodyEl.hidden = false; if (actions) actions.hidden = false; }
    function say(t, k) { status.textContent = t; status.className = 'forum-msg' + (k ? ' forum-msg--' + k : ''); }

    cancel.addEventListener('click', close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = area.value.trim();
      var changes = { body: b };
      if (titleInput) {
        var t = titleInput.value.trim();
        if (t.length < 5 || t.length > 150) { say('Titles need to be 5–150 characters.', 'error'); return; }
        changes.title = t;
      }
      if (!b) { say('A post can’t be empty.', 'error'); return; }
      save.disabled = true;
      say('Saving…');
      var table = kind === 'topic' ? 'topics' : 'replies';
      F.db.from(table).update(changes).eq('id', item.id)
        .select(kind === 'topic' ? TOPIC_COLS : REPLY_COLS).single()
        .then(function (res) {
          if (res.error) { save.disabled = false; say(F.dbError(res.error), 'error'); return; }
          var fresh = post(res.data, kind);
          article.replaceWith(fresh);
          if (kind === 'topic') F.setPage({ title: res.data.title, heading: res.data.title });
        }, function (err) { save.disabled = false; say(F.dbError(err), 'error'); });
    });
  }

  // ---------- report a post ----------
  function startReport(item, kind, article) {
    if (article.querySelector('.forum-report')) return;
    var area = el('textarea', { rows: '3', maxlength: '1000', 'aria-label': 'reason for reporting' });
    var status = el('p', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
    var send = el('button', { type: 'submit', class: 'forum-button' }, 'send report');
    var cancel = el('button', { type: 'button', class: 'forum-button forum-button--quiet' }, 'cancel');
    var form = el('form', { class: 'forum-form forum-form--wide forum-report', novalidate: true }, [
      el('p', { class: 'forum-help' }, 'What’s wrong with this post? Only moderators will see your report.'),
      area,
      el('div', { class: 'forum-form-actions' }, [send, cancel]),
      status
    ]);
    article.appendChild(form);
    area.focus();

    function say(t, k) { status.textContent = t; status.className = 'forum-msg' + (k ? ' forum-msg--' + k : ''); }
    cancel.addEventListener('click', function () { form.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var reason = area.value.trim();
      if (reason.length < 3) { say('Please say briefly what’s wrong.', 'error'); return; }
      send.disabled = true;
      say('Sending…');
      var row = { reason: reason };
      if (kind === 'topic') row.topic_id = item.id; else { row.reply_id = item.id; row.topic_id = item.topic_id; }
      // No .select(): members can file reports but not read them back
      F.db.from('reports').insert(row).then(function (res) {
        if (res.error) { send.disabled = false; say(F.dbError(res.error), 'error'); return; }
        form.textContent = '';
        form.appendChild(el('p', { class: 'forum-msg forum-msg--ok' }, 'Thanks — a moderator will take a look.'));
      }, function (err) { send.disabled = false; say(F.dbError(err), 'error'); });
    });
  }

  // ---------- reply box ----------
  function replyArea(topic, total) {
    var wrap = el('section', { class: 'forum-reply', 'aria-label': 'Reply' });
    if (topic.is_locked) {
      wrap.appendChild(el('p', { class: 'forum-msg forum-locked' }, 'This topic is locked. No new replies can be added.'));
      return wrap;
    }
    var block = F.postingBlocker(me);
    if (block) { wrap.appendChild(F.blockedNote(block, me, 'reply')); return wrap; }

    var area = el('textarea', { id: 'reply-body', rows: '6', maxlength: '20000' });
    var status = el('p', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
    var button = el('button', { type: 'submit', class: 'forum-button' }, 'post reply');
    var form = el('form', { class: 'forum-form forum-form--wide', novalidate: true }, [
      el('label', { for: 'reply-body' }, 'your reply'),
      area, F.counter(area, 20000),
      el('div', { class: 'forum-form-actions' }, button),
      status
    ]);
    function say(t, k) { status.textContent = t; status.className = 'forum-msg' + (k ? ' forum-msg--' + k : ''); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = area.value.trim();
      if (!b) { say('Please write your reply first.', 'error'); return; }
      if (b.length > 20000) { say('Replies can be up to 20,000 characters.', 'error'); return; }
      button.disabled = true;
      say('Posting…');
      F.db.from('replies').insert({ topic_id: topic.id, body: b }).select('id').single()
        .then(function (res) {
          if (res.error) { button.disabled = false; say(F.dbError(res.error), 'error'); return; }
          // Go to the page the new reply is on, scrolled to it
          var lastPage = Math.max(1, Math.ceil((total + 1) / F.REPLIES_PER_PAGE));
          var href = F.topicHref(topic.id, lastPage, '#r' + res.data.id);
          if (lastPage === page) { window.location.hash = 'r' + res.data.id; window.location.reload(); }
          else window.location.href = href;
        }, function (err) { button.disabled = false; say(F.dbError(err), 'error'); });
    });

    wrap.appendChild(form);
    return wrap;
  }
})();
