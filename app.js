/* =========================================================
   Taha Mohyuddin — site behaviour
   One script for every page. Everything is optional:
   each block checks that its markup exists first.
   ========================================================= */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  /* ---- mark the current page in both navs ---- */
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    var match = a.getAttribute('data-nav').split(' ');
    if (match.indexOf(page) > -1) {
      a.classList.add('is-here');
      a.setAttribute('aria-current', 'page');
    }
  });

  /* ---- top bar gets a hairline once you leave the top ---- */
  var bar = document.querySelector('.topbar');
  if (bar) {
    var onScroll = function () { bar.classList.toggle('is-stuck', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- mobile menu sheet ---- */
  var sheet = document.getElementById('sheet');
  if (sheet) {
    var openSheet = function (on) {
      sheet.classList.toggle('open', on);
      document.body.style.overflow = on ? 'hidden' : '';
    };
    document.querySelectorAll('[data-sheet-open]').forEach(function (b) {
      b.addEventListener('click', function () { openSheet(true); });
    });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('[data-sheet-close]')) openSheet(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') openSheet(false);
    });
  }

  /* ---- missing images degrade into a labelled placeholder ---- */
  document.querySelectorAll('img[data-ph]').forEach(function (img) {
    img.addEventListener('error', function () {
      var slot = document.createElement('div');
      slot.className = img.classList.contains('co-logo') || img.closest('.logos') ? 'ph-chip' : 'ph-fill';
      slot.textContent = img.getAttribute('data-ph');
      if (img.parentNode) img.parentNode.replaceChild(slot, img);
    });
  });

  /* ---- hero: rotating role line ---- */
  var roleEl = document.querySelector('[data-roles]');
  if (roleEl) {
    var roles = JSON.parse(roleEl.getAttribute('data-roles'));
    var out = roleEl.querySelector('.role-text');
    if (reduce) {
      out.textContent = roles[0];
    } else {
      var r = 0, c = 0, del = false;
      (function tick() {
        var word = roles[r];
        out.textContent = word.slice(0, c);
        if (!del && c < word.length) { c++; }
        else if (del && c > 0) { c--; }
        else {
          del = !del;
          if (!del) r = (r + 1) % roles.length;
          return setTimeout(tick, del ? 1600 : 420);
        }
        setTimeout(tick, del ? 34 : 62);
      })();
    }
  }

  /* ---- subtle scroll reveal ---- */
  var rv = document.querySelectorAll('.rv');
  if (rv.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      rv.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      rv.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---- tabs (about page) ---- */
  var tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    var select = function (tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (tab.id === 'tab-experience') runBars();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (n === null) return;
        e.preventDefault();
        var next = tabs[(n + tabs.length) % tabs.length];
        next.focus(); select(next);
      });
    });
  }

  /* ---- duration bars ---- */
  var barsDone = false;
  function runBars() {
    if (barsDone) return;
    var items = document.querySelectorAll('.xp-item[data-start]');
    if (!items.length) return;
    barsDone = true;
    var first = new Date('2021-12-01').getTime();
    var now = Date.now();
    items.forEach(function (it, i) {
      var s = new Date(it.getAttribute('data-start')).getTime();
      var endAttr = it.getAttribute('data-end');
      var e = (!endAttr || endAttr === 'present') ? now : new Date(endAttr).getTime();
      var pct = Math.max(4, Math.min(100, Math.round(((e - s) / (now - first)) * 100)));
      var fill = it.querySelector('.xp-fill');
      if (fill) setTimeout(function () { fill.style.width = pct + '%'; }, reduce ? 0 : 90 * i);
    });
  }
  runBars();

  /* ---- flip cards (experience rail) ---- */
  document.querySelectorAll('.co').forEach(function (card) {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');
    var dragStartX = null, moved = false;
    var flip = function () {
      var on = card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    card.addEventListener('pointerdown', function (e) { dragStartX = e.clientX; moved = false; });
    card.addEventListener('pointermove', function (e) {
      if (dragStartX !== null && Math.abs(e.clientX - dragStartX) > 8) moved = true;
    });
    card.addEventListener('click', function () { if (!moved) flip(); dragStartX = null; });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });

  /* ---- horizontal rail arrows ---- */
  document.querySelectorAll('[data-rail]').forEach(function (rail) {
    var wrapEl = rail.closest('section') || document;
    wrapEl.querySelectorAll('[data-rail-go]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = btn.getAttribute('data-rail-go') === 'next' ? 1 : -1;
        rail.scrollBy({ left: dir * Math.min(rail.clientWidth * 0.8, 360), behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  });

  /* ---- contact form ---- */
  var form = document.getElementById('contact-form');
  if (form) {
    var toast = document.getElementById('toast');
    var say = function (msg, ok) {
      if (!toast) return;
      toast.textContent = msg;
      toast.style.background = ok ? 'var(--signal)' : '#C46A5A';
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 4000);
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (String(d.success) === 'true') { say('Message sent. I\u2019ll reply within a day or two.', true); form.reset(); }
          else { say('That didn\u2019t go through. Email me directly instead.', false); }
        })
        .catch(function () { say('That didn\u2019t go through. Email me directly instead.', false); })
        .finally(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
    });
  }

  /* ---- year stamp ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
