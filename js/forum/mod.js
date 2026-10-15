/* Moderator queue — /forum/mod/?status=open|resolved|dismissed
   Only moderators/admins can read reports (enforced by the database). */

(function () {
  var F = window.Forum, el = F.el;
  var root = document.getElementById('forum-root');
  var status = ['open', 'resolved', 'dismissed'].indexOf(F.param('status')) > -1 ? F.param('status') : 'open';

  if (!F.db) { F.message(root, F.OFFLINE, 'error'); return; }

  F.me().then(function (me) {
    if (!me) {
      root.textContent = '';
      root.appendChild(el('p', { class: 'forum-msg forum-gate' }, [el('a', { href: F.loginHref() }, 'Sign in'), ' to see the moderator queue.']));
      return;
    }
    if (!F.isMod(me)) { F.message(root, 'This page is for moderators.'); return; }
    load();
  });

  function load() {
    F.setPage({ heading: 'moderator queue', crumbs: [{ text: 'moderation' }] });
    F.db.from('reports')
      .select('id, reason, status, created_at, topic_id, reply_id, ' +
              'reporter:profiles!reports_reporter_id_fkey(username), ' +
              'topic:topics(id, title, body, is_hidden, author:profiles!topics_author_id_fkey(username)), ' +
              'reply:replies(id, body, topic_id, is_hidden, created_at, author:profiles!replies_author_id_fkey(username))')
      .eq('status', status)
      .order('created_at', { ascending: status === 'open' })
      .limit(100)
      .then(function (res) {
        if (res.error) { console.error(res.error); F.message(root, F.dbError(res.error), 'error'); return; }
        render(res.data);
      });
  }

  function render(reports) {
    root.textContent = '';
    var tabs = el('nav', { class: 'forum-tabs forum-tabs--links', 'aria-label': 'Report status' });
    ['open', 'resolved', 'dismissed'].forEach(function (s) {
      tabs.appendChild(el('a', { href: '/forum/mod/' + (s === 'open' ? '' : '?status=' + s), 'aria-current': s === status ? 'page' : null }, s));
    });
    root.appendChild(tabs);

    if (!reports.length) {
      root.appendChild(el('p', { class: 'forum-msg forum-empty' }, status === 'open' ? 'No open reports. All clear.' : 'Nothing here yet.'));
      return;
    }

    var list = el('div', { class: 'forum-reports' });
    reports.forEach(function (r) { list.appendChild(reportCard(r)); });
    root.appendChild(list);
  }

  function reportCard(r) {
    var isReply = !!r.reply_id;
    var target = isReply ? r.reply : r.topic;
    var topicId = isReply ? (r.reply && r.reply.topic_id) : r.topic_id;
    var link = el('a', { href: F.topicHref(topicId, 1, isReply ? '#r' + r.reply_id : '#t' + topicId) }, isReply ? 'view reply' : 'view topic');

    // Work out which page the reported reply is on, so the link lands on it
    if (isReply && r.reply) {
      F.db.from('replies').select('id', { count: 'exact', head: true })
        .eq('topic_id', r.reply.topic_id).lt('created_at', r.reply.created_at)
        .then(function (c) {
          if (c.error) return;
          var pg = Math.floor((c.count || 0) / F.REPLIES_PER_PAGE) + 1;
          link.href = F.topicHref(topicId, pg, '#r' + r.reply_id);
        });
    }

    var quote = el('blockquote', { class: 'forum-report-quote' });
    if (target) {
      if (!isReply) quote.appendChild(el('strong', null, target.title));
      quote.appendChild(el('span', null, F.excerpt(target.body, 300)));
    } else {
      quote.appendChild(el('span', { class: 'forum-muted' }, 'This post no longer exists.'));
    }

    var flags = [];
    if (target && target.is_hidden) flags.push(el('span', { class: 'forum-flag forum-flag--warn' }, 'hidden'));

    var msg = el('span', { class: 'forum-msg', role: 'status', 'aria-live': 'polite' });
    var card = el('article', { class: 'forum-report-card' }, [
      el('p', { class: 'forum-list-meta' }, [
        isReply ? 'reply' : 'topic', ' by ', F.userLink(target && target.author),
        ' · reported by ', F.userLink(r.reporter), ' · ', F.timeEl(r.created_at), ' '
      ].concat(flags)),
      el('p', { class: 'forum-report-reason' }, ['“', r.reason, '”']),
      quote
    ]);
    card.appendChild(el('div', { class: 'forum-post-actions' }, [link].concat(actionButtons(r, card, msg)).concat([msg])));
    return card;
  }

  function actionButtons(r, card, msg) {
    var out = [];
    var choices = status === 'open' ? [['resolve', 'resolved'], ['dismiss', 'dismissed']] : [['reopen', 'open']];
    choices.forEach(function (c) {
      var b = el('button', { type: 'button', class: 'forum-linkbutton' }, c[0]);
      b.addEventListener('click', function () {
        b.disabled = true;
        msg.textContent = ' saving…';
        F.db.from('reports').update({ status: c[1] }).eq('id', r.id).select('id').single().then(function (res) {
          if (res.error) { b.disabled = false; msg.textContent = ' ' + F.dbError(res.error); msg.className = 'forum-msg forum-msg--error'; return; }
          card.remove();
          if (!document.querySelector('.forum-report-card')) load();
        });
      });
      out.push(document.createTextNode(' · '), b);
    });
    return out;
  }
})();
