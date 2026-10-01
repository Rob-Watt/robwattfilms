/* Rob Watt Films — site behaviour
   1. Mobile menu toggle
   2. Video lightbox with prev / next (reads data-* from each .tile)  */

(function () {
  // ---------- 1. Mobile menu ----------
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open);
      toggle.textContent = open ? 'close' : 'menu';
    });
  }

  // ---------- 2. Lightbox ----------
  var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile[data-video]'));
  var box = document.querySelector('.lightbox');
  if (!tiles.length || !box) return;

  var frame = box.querySelector('.lightbox-frame');
  var title = box.querySelector('.lightbox-title');
  var credit = box.querySelector('.lightbox-credit');
  var count = box.querySelector('.lightbox-count');
  var current = 0;
  var lastFocus = null;

  function embedUrl(url) {
    // Accepts Vimeo or YouTube links in any common form.
    var v = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (v) return 'https://player.vimeo.com/video/' + v[1] + '?autoplay=1&title=0&byline=0&portrait=0';
    var y = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    if (y) return 'https://www.youtube-nocookie.com/embed/' + y[1] + '?autoplay=1&rel=0';
    return url;
  }

  function show(i) {
    current = (i + tiles.length) % tiles.length;
    var t = tiles[current];
    if (/\.(mp4|mov|webm)$/i.test(t.dataset.video)) {
      // Self-hosted file in /videos
      frame.innerHTML = '';
      var v = document.createElement('video');
      v.src = t.dataset.video;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      frame.appendChild(v);
    } else {
      frame.innerHTML = '<iframe src="' + embedUrl(t.dataset.video) +
        '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="' +
        (t.dataset.title || 'film') + '"></iframe>';
    }
    title.textContent = t.dataset.title || '';
    credit.textContent = t.dataset.credit || '';
    count.textContent = (current + 1) + ' / ' + tiles.length;
  }

  function open(i) {
    lastFocus = document.activeElement;
    show(i);
    box.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    box.querySelector('.lightbox-close').focus();
  }

  function close() {
    box.classList.remove('is-open');
    frame.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  tiles.forEach(function (t, i) {
    t.addEventListener('click', function () { open(i); });
  });

  box.querySelector('.lightbox-close').addEventListener('click', close);
  box.querySelector('.lightbox-prev').addEventListener('click', function () { show(current - 1); });
  box.querySelector('.lightbox-next').addEventListener('click', function () { show(current + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });

  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();
