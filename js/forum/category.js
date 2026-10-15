/* Category page — topics in one forum, pinned first, then newest activity.
   /forum/category/?c=lighting&page=2 */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var slug = F.param('c');
  var page = F.currentPage();

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }
  if (!slug) { window.location.replace('/forum/'); return; }

  F.db.from('categories').select('id, slug, name, description').eq('slug', slug).maybeSingle()
    .then(function (res) {
      if (res.error) { fail(res.error); return; }
      if (!res.data) {
        F.setPage({ title: 'Not found', heading: 'forum not found', crumbs: [{ text: 'not found' }] });
        F.message(root, 'That forum doesn’t exist. ');
        root.firstChild.appendChild(el('a', { href: '/forum/' }, 'Back to the forum index.'));
        return;
      }
      var cat = res.data;
      F.setPage({ title: cat.name, description: cat.description || cat.name, heading: cat.name, crumbs: [{ text: cat.name }] });

      var from = (page - 1) * F.TOPICS_PER_PAGE;
      return F.db.from('topics').select(F.SELECT.topicRow, { count: 'exact' })
        .eq('category_id', cat.id)
        .order('is_pinned', { ascending: false })
        .order('last_post_at', { ascending: false })
        .range(from, from + F.TOPICS_PER_PAGE - 1)
        .then(function (tr) {
          if (tr.error) { fail(tr.error); return; }
          render(cat, tr.data, tr.count || 0);
        });
    }, fail);

  function fail(err) {
    console.error('Forum: could not load category', err);
    F.message(root, F.OFFLINE, 'error');
  }

  function render(cat, topics, total) {
    root.textContent = '';
    var totalPages = Math.max(1, Math.ceil(total / F.TOPICS_PER_PAGE));

    root.appendChild(el('div', { class: 'forum-head' }, [
      cat.description ? el('p', { class: 'forum-cat-desc' }, cat.description) : el('span'),
      el('a', { href: '/forum/new/?c=' + encodeURIComponent(cat.slug), class: 'forum-button' }, 'start a topic')
    ]));

    if (!topics.length) {
      root.appendChild(el('p', { class: 'forum-msg forum-empty' }, page > 1
        ? ['no more topics. ', el('a', { href: href(1) }, 'back to page 1'), '.']
        : ['no topics yet — ', el('a', { href: '/forum/new/?c=' + encodeURIComponent(cat.slug) }, 'start one'), '.']));
      return;
    }

    var tbody = el('tbody');
    topics.forEach(function (t) {
      var flags = [];
      if (t.is_pinned) flags.push(el('span', { class: 'forum-flag' }, 'pinned'));
      if (t.is_locked) flags.push(el('span', { class: 'forum-flag' }, 'locked'));
      if (t.is_hidden) flags.push(el('span', { class: 'forum-flag forum-flag--warn' }, 'hidden'));
      tbody.appendChild(el('tr', { class: t.is_pinned ? 'is-pinned' : null }, [
        el('td', { class: 'forum-cell-main' }, [flags, el('a', { href: F.topicHref(t.id), class: 'forum-cat-name' }, t.title)].flat()),
        el('td', { class: 'forum-by', 'data-label': 'started by' }, [F.userLink(t.author), el('br'), F.timeEl(t.created_at)]),
        el('td', { class: 'forum-num', 'data-label': 'replies' }, String(t.reply_count)),
        el('td', { class: 'forum-last', 'data-label': 'last post' }, [F.timeEl(t.last_post_at), el('br'), 'by ', F.userLink(t.last || t.author)])
      ]));
    });

    root.appendChild(el('table', { class: 'forum-table' }, [
      el('thead', null, el('tr', null, [
        el('th', { scope: 'col' }, 'topic'),
        el('th', { scope: 'col', class: 'forum-by' }, 'started by'),
        el('th', { scope: 'col', class: 'forum-num' }, 'replies'),
        el('th', { scope: 'col', class: 'forum-last' }, 'last post')
      ])),
      tbody
    ]));

    var p = F.pager(page, totalPages, href);
    if (p) root.appendChild(p);
  }

  function href(n) {
    return '/forum/category/?c=' + encodeURIComponent(slug) + (n > 1 ? '&page=' + n : '');
  }
})();
