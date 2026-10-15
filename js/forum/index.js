/* Forum index — Phase 1: connect and list the categories.
   (Phase 2 replaces this with the full category table + recent activity.) */

(function () {
  var F = window.Forum;
  var root = document.getElementById('forum-root');

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }

  F.db.from('categories')
    .select('id, slug, name, description, position')
    .order('position')
    .then(function (res) {
      if (res.error) {
        console.error('Forum: could not load categories', res.error);
        F.message(root, F.OFFLINE, 'error');
        return;
      }
      console.log('Forum: ' + res.data.length + ' categories', res.data);

      root.textContent = '';
      var list = F.el('ul', { class: 'forum-cats-preview' });
      res.data.forEach(function (c) {
        list.appendChild(F.el('li', null, [
          F.el('a', { href: '/forum/category/?c=' + encodeURIComponent(c.slug) }, c.name),
          ' — ',
          F.el('span', { class: 'forum-muted' }, c.description || '')
        ]));
      });
      root.appendChild(list);
    });
})();
