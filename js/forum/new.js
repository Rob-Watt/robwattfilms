/* Start a topic — /forum/new/?c=lighting */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var preset = F.param('c');

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }

  Promise.all([
    F.me(),
    F.db.from('categories').select('id, slug, name').is('parent_id', null).order('position')
  ]).then(function (r) {
    var me = r[0], cats = r[1];
    if (cats.error) { console.error(cats.error); F.message(root, F.OFFLINE, 'error'); return; }
    root.textContent = '';

    var block = F.postingBlocker(me);
    if (block) { root.appendChild(F.blockedNote(block, me, 'start a topic')); return; }

    root.appendChild(form(cats.data));
  }, function (err) {
    console.error(err);
    F.message(root, F.OFFLINE, 'error');
  });

  function form(cats) {
    var select = el('select', { id: 'nt-cat', name: 'category', required: true },
      [el('option', { value: '' }, 'choose a section…')].concat(cats.map(function (c) {
        return el('option', { value: String(c.id), selected: c.slug === preset }, c.name);
      })));
    var title = el('input', { id: 'nt-title', name: 'title', type: 'text', maxlength: '150', required: true, autocomplete: 'off' });
    var body = el('textarea', { id: 'nt-body', name: 'body', rows: '12', maxlength: '20000', required: true });
    var status = el('p', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
    var button = el('button', { type: 'submit', class: 'forum-button' }, 'post topic');

    var f = el('form', { class: 'forum-form forum-form--wide', novalidate: true }, [
      el('label', { for: 'nt-cat' }, 'section'), select,
      el('label', { for: 'nt-title' }, 'title'), title, F.counter(title, 150, 5),
      el('label', { for: 'nt-body' }, 'your post'), body, F.counter(body, 20000),
      el('p', { class: 'forum-help' }, ['Plain text. Blank lines start a new paragraph and web addresses become links. Please follow the ', el('a', { href: '/forum/rules/', target: '_blank', rel: 'noopener' }, 'forum rules'), '.']),
      el('div', { class: 'forum-form-actions' }, button),
      status
    ]);

    function say(t, k) { status.textContent = t; status.className = 'forum-msg' + (k ? ' forum-msg--' + k : ''); }

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = title.value.trim(), b = body.value.trim();
      if (!select.value) { say('Please choose a section.', 'error'); select.focus(); return; }
      if (t.length < 5 || t.length > 150) { say('Titles need to be 5–150 characters.', 'error'); title.focus(); return; }
      if (!b) { say('Please write something in your post.', 'error'); body.focus(); return; }
      if (b.length > 20000) { say('Posts can be up to 20,000 characters.', 'error'); body.focus(); return; }

      button.disabled = true;
      say('Posting…');
      F.db.from('topics').insert({ category_id: Number(select.value), title: t, body: b }).select('id').single()
        .then(function (res) {
          if (res.error) { button.disabled = false; say(F.dbError(res.error), 'error'); return; }
          window.location.href = F.topicHref(res.data.id);
        }, function (err) { button.disabled = false; say(F.dbError(err), 'error'); });
    });

    if (preset) setTimeout(function () { title.focus(); }, 0);
    return f;
  }
})();
