/* Forum search — /forum/search/?q=drone+permits
   Uses the database's search_forum() (Postgres web search syntax):
   "exact phrase", -excluded, or. Hidden posts are never returned to members. */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var q = (F.param('q') || '').trim();

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }

  root.textContent = '';
  root.appendChild(searchForm(q));
  var results = el('div', { class: 'forum-results', 'aria-live': 'polite' });
  root.appendChild(results);

  if (!q) {
    F.setPage({ heading: 'search', crumbs: [{ text: 'search' }] });
    results.appendChild(tips());
    return;
  }

  F.setPage({ title: 'Search: ' + q, heading: 'search', crumbs: [{ text: 'search' }] });
  results.appendChild(el('p', { class: 'forum-msg' }, 'searching…'));

  F.db.rpc('search_forum', { q: q }).then(function (res) {
    results.textContent = '';
    if (res.error) { console.error(res.error); F.message(results, F.dbError(res.error), 'error'); return; }
    render(groupByTopic(res.data || []));
  }, function (err) {
    console.error(err);
    F.message(results, F.OFFLINE, 'error');
  });

  function searchForm(value) {
    var input = el('input', { id: 'search-q', type: 'search', name: 'q', placeholder: 'search the forum', autocomplete: 'off' });
    input.value = value;
    var form = el('form', { class: 'forum-search', action: '/forum/search/', method: 'get', role: 'search' }, [
      el('label', { for: 'search-q', class: 'visually-hidden' }, 'Search the forum'),
      input,
      el('button', { type: 'submit' }, 'search')
    ]);
    if (!value) setTimeout(function () { input.focus(); }, 0);
    return form;
  }

  function tips() {
    return el('div', { class: 'forum-help forum-search-tips' }, [
      el('p', null, 'Search titles, posts and replies. A few tricks:'),
      el('ul', null, [
        el('li', null, [el('code', null, '"part 107"'), ' — an exact phrase']),
        el('li', null, [el('code', null, 'drone -permit'), ' — leave out posts mentioning a word']),
        el('li', null, [el('code', null, 'venice or alexa'), ' — either word'])
      ])
    ]);
  }

  // A topic can match in its opening post and in several replies; show it once
  function groupByTopic(rows) {
    var byId = {}, order = [];
    rows.forEach(function (r) {
      var g = byId[r.topic_id];
      if (!g) {
        g = byId[r.topic_id] = { topic_id: r.topic_id, title: r.title, snippet: r.snippet, posted_at: r.posted_at, matches: 0 };
        order.push(g);
      }
      g.matches++;
    });
    return order;   // already newest first from the database
  }

  function render(groups) {
    if (!groups.length) {
      results.appendChild(el('p', { class: 'forum-msg forum-empty' }, [
        'No results for “', q, '”. Try fewer or different words, or ',
        el('a', { href: '/forum/new/' }, 'start a topic'), ' to ask.'
      ]));
      return;
    }
    var n = groups.length;
    results.appendChild(el('p', { class: 'forum-msg' }, n + (n === 1 ? ' topic' : ' topics') + ' matching “' + q + '”' + (n === 50 ? ' (showing the 50 most recent)' : '')));

    var words = queryWords(q);
    var list = el('ul', { class: 'forum-list forum-search-results' });
    groups.forEach(function (g) {
      list.appendChild(el('li', null, [
        el('a', { href: F.topicHref(g.topic_id), class: 'forum-list-title' }, highlight(g.title, words)),
        el('span', { class: 'forum-list-excerpt' }, highlight(F.excerpt(g.snippet, 200), words)),
        el('span', { class: 'forum-list-meta' }, [
          F.timeEl(g.posted_at),
          g.matches > 1 ? ' · ' + g.matches + ' matching posts' : ''
        ])
      ]));
    });
    results.appendChild(list);
  }

  // Words to highlight: the query minus operators and excluded (-word) terms
  function queryWords(query) {
    return query.replace(/(^|\s)-\S+/g, ' ').replace(/["()]/g, ' ').split(/\s+/)
      .filter(function (w) { return w && w.toLowerCase() !== 'or' && w.length > 1; })
      .map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  }

  // Wrap matches in <mark> using text nodes only (never HTML)
  function highlight(text, words) {
    var frag = document.createDocumentFragment();
    if (!words.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    var re = new RegExp('(' + words.join('|') + ')', 'gi');
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(el('mark', null, m[0]));
      last = m.index + m[0].length;
      if (!m[0].length) re.lastIndex++;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
})();
