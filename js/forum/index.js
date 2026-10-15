/* Forum index — category table + recent topics + recent replies */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }

  Promise.all([
    F.db.from('category_stats').select('*').is('parent_id', null).order('position'),
    F.db.from('topics').select(F.SELECT.topicRow + ', category:categories(slug, name)')
      .order('created_at', { ascending: false }).limit(8),
    F.db.from('replies').select(F.SELECT.reply + ', topic:topics(id, title, reply_count)')
      .order('created_at', { ascending: false }).limit(8)
  ]).then(function (res) {
    var failed = res.filter(function (r) { return r.error; });
    if (failed.length) {
      console.error('Forum: could not load the index', failed.map(function (r) { return r.error; }));
      F.message(root, F.OFFLINE, 'error');
      return;
    }
    console.log('Forum: ' + res[0].data.length + ' categories', res[0].data);

    root.textContent = '';
    root.appendChild(searchBox());
    root.appendChild(categoryTable(res[0].data));

    var recent = el('div', { class: 'forum-recent' });
    recent.appendChild(recentTopics(res[1].data));
    recent.appendChild(recentReplies(res[2].data));
    root.appendChild(recent);
  }, function (err) {
    console.error('Forum: network error', err);
    F.message(root, F.OFFLINE, 'error');
  });

  function searchBox() {
    return el('form', { class: 'forum-search', action: '/forum/search/', method: 'get', role: 'search' }, [
      el('label', { for: 'forum-q', class: 'visually-hidden' }, 'Search the forum'),
      el('input', { id: 'forum-q', type: 'search', name: 'q', placeholder: 'search the forum', autocomplete: 'off' }),
      el('button', { type: 'submit' }, 'search')
    ]);
  }

  function categoryTable(cats) {
    var tbody = el('tbody');
    cats.forEach(function (c) {
      tbody.appendChild(el('tr', null, [
        el('td', { class: 'forum-cell-main' }, [
          el('a', { href: '/forum/category/?c=' + encodeURIComponent(c.slug), class: 'forum-cat-name' }, c.name),
          c.description ? el('p', { class: 'forum-cat-desc' }, c.description) : null
        ]),
        el('td', { class: 'forum-num', 'data-label': 'topics' }, String(c.topic_count)),
        el('td', { class: 'forum-num', 'data-label': 'replies' }, String(c.reply_count)),
        el('td', { class: 'forum-last', 'data-label': 'last post' }, c.last_post_at ? F.timeEl(c.last_post_at) : el('span', { class: 'forum-muted' }, '—'))
      ]));
    });
    return el('table', { class: 'forum-table' }, [
      el('thead', null, el('tr', null, [
        el('th', { scope: 'col' }, 'forum'),
        el('th', { scope: 'col', class: 'forum-num' }, 'topics'),
        el('th', { scope: 'col', class: 'forum-num' }, 'replies'),
        el('th', { scope: 'col', class: 'forum-last' }, 'last post')
      ])),
      tbody
    ]);
  }

  function recentTopics(topics) {
    var box = el('section', { class: 'forum-recent-col' }, el('h2', null, 'recent topics'));
    if (!topics.length) {
      box.appendChild(el('p', { class: 'forum-msg' }, ['no topics yet — ', el('a', { href: '/forum/new/' }, 'start one'), '.']));
      return box;
    }
    var list = el('ul', { class: 'forum-list' });
    topics.forEach(function (t) {
      list.appendChild(el('li', null, [
        el('a', { href: F.topicHref(t.id), class: 'forum-list-title' }, t.title),
        el('span', { class: 'forum-list-meta' }, [
          'by ', F.userLink(t.author),
          t.category ? [' in ', el('a', { href: '/forum/category/?c=' + encodeURIComponent(t.category.slug) }, t.category.name)] : null,
          ' · ', F.timeEl(t.created_at)
        ].flat())
      ]));
    });
    box.appendChild(list);
    return box;
  }

  function recentReplies(replies) {
    var box = el('section', { class: 'forum-recent-col' }, el('h2', null, 'recent replies'));
    if (!replies.length) {
      box.appendChild(el('p', { class: 'forum-msg' }, 'no replies yet.'));
      return box;
    }
    var list = el('ul', { class: 'forum-list' });
    replies.forEach(function (r) {
      if (!r.topic) return;
      var lastPage = Math.max(1, Math.ceil(r.topic.reply_count / F.REPLIES_PER_PAGE));
      list.appendChild(el('li', null, [
        el('a', { href: F.topicHref(r.topic.id, lastPage, '#r' + r.id), class: 'forum-list-title' }, r.topic.title),
        el('span', { class: 'forum-list-excerpt' }, '“' + F.excerpt(r.body, 110) + '”'),
        el('span', { class: 'forum-list-meta' }, ['by ', F.userLink(r.author), ' · ', F.timeEl(r.created_at)])
      ]));
    });
    box.appendChild(list);
    return box;
  }
})();
