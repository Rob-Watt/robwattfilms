/* Topic page — the opening post, then replies oldest → newest.
   /forum/topic/?id=123&page=2 */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var id = parseInt(F.param('id'), 10);
  var page = F.currentPage();

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }
  if (!id) { window.location.replace('/forum/'); return; }

  F.db.from('topics')
    .select('id, title, body, is_pinned, is_locked, reply_count, created_at, edited_at, ' +
            'author:profiles!topics_author_id_fkey(username, display_name), category:categories(slug, name)')
    .eq('id', id).maybeSingle()
    .then(function (res) {
      if (res.error) { fail(res.error); return; }
      if (!res.data) { notFound(); return; }
      var topic = res.data;
      var from = (page - 1) * F.REPLIES_PER_PAGE;
      return F.db.from('replies').select(F.SELECT.reply, { count: 'exact' })
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
    if (flags.length) root.appendChild(el('p', { class: 'forum-flags' }, flags));

    // Opening post on the first page; a short "continued" link on later pages
    if (page === 1) {
      root.appendChild(post(topic, 'forum-post--op', 't' + topic.id));
    } else {
      root.appendChild(el('p', { class: 'forum-msg' }, ['page ' + page + ' of the discussion · ', el('a', { href: F.topicHref(topic.id) }, 'back to the opening post')]));
    }

    if (replies.length) {
      root.appendChild(el('h2', { class: 'forum-replies-head' }, total + (total === 1 ? ' reply' : ' replies')));
      replies.forEach(function (r) { root.appendChild(post(r, '', 'r' + r.id)); });
    } else if (page === 1) {
      root.appendChild(el('p', { class: 'forum-msg forum-empty' }, 'no replies yet.'));
    }

    var p = F.pager(page, totalPages, function (n) { return F.topicHref(topic.id, n); });
    if (p) root.appendChild(p);

    if (topic.is_locked) {
      root.appendChild(el('p', { class: 'forum-msg forum-locked' }, 'This topic is locked. No new replies can be added.'));
    }

    // jump to #r123 once the replies are on the page
    if (window.location.hash) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  // One post (opening post or reply). Member text goes through renderText only.
  function post(item, extraClass, anchor) {
    var body = el('div', { class: 'forum-post-body' });
    F.renderText(body, item.body);
    var meta = [F.userLink(item.author), ' · ', el('a', { href: '#' + anchor, class: 'forum-permalink' }, F.timeEl(item.created_at))];
    if (item.edited_at) meta.push(el('span', { class: 'forum-muted', title: F.fullDate(item.edited_at) }, ' · edited'));
    if (item.is_hidden) meta.push(el('span', { class: 'forum-flag' }, 'hidden'));
    return el('article', { class: 'forum-post ' + (extraClass || ''), id: anchor }, [
      el('header', { class: 'forum-post-head' }, [F.avatar(item.author), el('span', { class: 'forum-post-meta' }, meta)]),
      body
    ]);
  }
})();
