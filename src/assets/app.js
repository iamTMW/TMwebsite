/* =========================================================
   Taha Mohyuddin: site behaviour
   One small script for every page. Each block checks that its
   markup exists first, and the site works without JavaScript.
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js-enhanced');

  /* ---- light / dark toggle ---- */
  var media = window.matchMedia('(prefers-color-scheme: light)');
  function currentTheme() {
    return root.getAttribute('data-theme') || (media.matches ? 'light' : 'dark');
  }
  function syncThemeMeta() {
    var dark = currentTheme() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      b.setAttribute('aria-pressed', dark ? 'false' : 'true');
    });
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
      syncThemeMeta();
    });
  });
  syncThemeMeta();

  /* ---- top bar hairline once you leave the top ---- */
  var bar = document.querySelector('.topbar');
  if (bar) {
    var onScroll = function () { bar.classList.toggle('is-stuck', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- mobile menu sheet ---- */
  var sheet = document.getElementById('sheet');
  if (sheet) {
    var lastTrigger = null;
    var setSheet = function (on) {
      sheet.classList.toggle('open', on);
      sheet.setAttribute('aria-hidden', on ? 'false' : 'true');
      sheet.inert = !on;
      document.body.style.overflow = on ? 'hidden' : '';
      document.querySelectorAll('[data-sheet-open]').forEach(function (b) {
        b.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      if (on) {
        var first = sheet.querySelector('a, button');
        if (first) first.focus();
      } else if (lastTrigger) {
        lastTrigger.focus();
      }
    };
    setSheet(false);
    document.querySelectorAll('[data-sheet-open]').forEach(function (b) {
      b.addEventListener('click', function () { lastTrigger = b; setSheet(true); });
    });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('[data-sheet-close]')) setSheet(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!sheet.classList.contains('open')) return;
      if (e.key === 'Escape') { setSheet(false); return; }
      if (e.key === 'Tab') {   // keep focus inside the open dialog
        var items = sheet.querySelectorAll('a, button');
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
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
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      rv.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---- tabs (about page): WAI-ARIA tabs pattern ---- */
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
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1
          : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (n === null) return;
        e.preventDefault();
        var next = tabs[(n + tabs.length) % tabs.length];
        next.focus(); select(next);
      });
    });
  }

  /* ---- contact form (FormSubmit, with client-side validation and a honeypot) ---- */
  var form = document.getElementById('contact-form');
  if (form) {
    var status = document.getElementById('form-status');
    var say = function (msg, ok) {
      status.textContent = msg;
      status.className = 'form-status ' + (ok ? 'ok' : 'err');
    };
    var rules = {
      name: function (v) { return v.length >= 2 && v.length <= 100 ? '' : 'Please enter your name (2 to 100 characters).'; },
      email: function (v) {
        return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Please enter a valid email address.';
      },
      company: function (v) { return v.length <= 120 ? '' : 'Please keep this under 120 characters.'; },
      message: function (v) { return v.length >= 10 && v.length <= 5000 ? '' : 'Please write between 10 and 5,000 characters.'; }
    };
    var check = function (name) {
      var el = form.elements[name];
      if (!el || !rules[name]) return true;
      var err = rules[name](el.value.trim());
      var out = document.getElementById(name + '-error');
      el.setAttribute('aria-invalid', err ? 'true' : 'false');
      if (out) out.textContent = err;
      return !err;
    };
    Object.keys(rules).forEach(function (n) {
      var el = form.elements[n];
      if (el) el.addEventListener('blur', function () { if (el.value) check(n); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valid = Object.keys(rules).map(check).every(Boolean);
      if (!valid) {
        var bad = form.querySelector('[aria-invalid="true"]');
        if (bad) bad.focus();
        say('Please fix the highlighted fields.', false);
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      var label = btn.textContent;
      // Bots that fill the hidden field get a quiet success and nothing is sent.
      if (form.elements._honey && form.elements._honey.value) {
        say('Message sent. Thanks for reaching out!', true);
        form.reset();
        return;
      }
      btn.disabled = true; btn.textContent = 'Sending…';
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : ''; });
      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        credentials: 'omit',
        referrerPolicy: 'strict-origin-when-cross-origin'
      })
        .then(function (r) {
          if (!r.ok) throw new Error('status ' + r.status);
          return r.json();
        })
        .then(function (d) {
          if (String(d.success) === 'true') {
            say('Message sent. Thanks for reaching out!', true);
            form.reset();
          } else {
            say('That didn’t go through. Please email me directly at tahamohyuddin30@gmail.com.', false);
          }
        })
        .catch(function () {
          say('That didn’t go through. Please email me directly at tahamohyuddin30@gmail.com.', false);
        })
        .finally(function () { btn.disabled = false; btn.textContent = label; });
    });
  }

  /* ---- hero typewriter ----
     The first phrase is already in the HTML, so nothing waits on this script.
     A hidden sizer holds whichever phrase wraps tallest, so the layout never shifts.
     Screen readers get a static sentence; reduced motion keeps the first phrase still. */
  var typer = document.querySelector('[data-typer]');
  if (typer) {
    var phrases = [];
    try { phrases = JSON.parse(typer.getAttribute('data-typer')); } catch (e) { phrases = []; }
    var textEl = typer.querySelector('.typer-text');
    var sizer = typer.querySelector('.typer-sizer');
    var fitSizer = function () {
      var tallest = phrases[0] || '', best = 0;
      phrases.forEach(function (p) {
        sizer.textContent = p;
        var h = sizer.getBoundingClientRect().height;
        if (h > best) { best = h; tallest = p; }
      });
      sizer.textContent = tallest;
    };
    if (phrases.length > 1 && textEl && sizer) {
      fitSizer();
      var resizeTimer;
      window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitSizer, 150); });
      if (reduce) {
        typer.classList.add('is-idle');
      } else {
        var idx = 0, chars = phrases[0].length, deleting = true, timer = null, running = true;
        var step = function () {
          if (!running) { timer = null; return; }
          var phrase = phrases[idx];
          if (deleting) {
            chars--;
            textEl.textContent = phrase.slice(0, Math.max(chars, 0));
            if (chars <= 0) { deleting = false; idx = (idx + 1) % phrases.length; typer.classList.remove('is-idle'); timer = setTimeout(step, 420); return; }
            timer = setTimeout(step, 22);
          } else {
            chars++;
            textEl.textContent = phrase.slice(0, chars);
            if (chars >= phrase.length) { deleting = true; typer.classList.add('is-idle'); timer = setTimeout(step, 2600); return; }
            timer = setTimeout(step, 38 + Math.random() * 28);
          }
        };
        var start = function () { if (!timer && running) timer = setTimeout(step, 2600); };
        typer.classList.add('is-idle');
        // Pause when the hero is off screen or the tab is hidden: no wasted work.
        var visible = true, tabVisible = !document.hidden;
        var sync = function () {
          var shouldRun = visible && tabVisible;
          if (shouldRun && !running) { running = true; start(); }
          if (!shouldRun) { running = false; }
        };
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(function (en) { visible = en[0].isIntersecting; sync(); }).observe(typer);
        }
        document.addEventListener('visibilitychange', function () { tabVisible = !document.hidden; sync(); });
        start();
      }
    }
  }

  /* ---- lightbox: links with data-lightbox open a native <dialog>.
     Without JavaScript the link simply opens the full-size image. ---- */
  var lbLinks = Array.prototype.slice.call(document.querySelectorAll('a[data-lightbox]'));
  if (lbLinks.length && typeof HTMLDialogElement === 'function') {
    var dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Image viewer');
    dlg.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<div class="lb-bar"><button type="button" class="lb-btn" data-lb="prev" aria-label="Previous image">&#8592;</button>' +
      '<span class="lb-count" aria-live="polite"></span>' +
      '<button type="button" class="lb-btn" data-lb="next" aria-label="Next image">&#8594;</button>' +
      '<button type="button" class="lb-btn" data-lb="close">Close</button></div>';
    document.body.appendChild(dlg);
    var lbImg = dlg.querySelector('img'), lbCap = dlg.querySelector('figcaption'), lbCount = dlg.querySelector('.lb-count');
    var group = [], pos = 0, opener = null;
    var show = function (i) {
      pos = (i + group.length) % group.length;
      var a = group[pos], thumb = a.querySelector('img');
      lbImg.src = a.getAttribute('href');
      lbImg.alt = thumb ? thumb.alt : '';
      lbCap.textContent = a.getAttribute('data-caption') || '';
      lbCount.textContent = group.length > 1 ? (pos + 1) + ' / ' + group.length : '';
      dlg.querySelectorAll('[data-lb="prev"],[data-lb="next"]').forEach(function (b) { b.hidden = group.length < 2; });
    };
    lbLinks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;  // let "open in new tab" work
        e.preventDefault();
        opener = a;
        var name = a.getAttribute('data-lightbox');
        group = lbLinks.filter(function (x) { return x.getAttribute('data-lightbox') === name; });
        show(group.indexOf(a));
        dlg.showModal();
        dlg.querySelector('[data-lb="close"]').focus();
      });
    });
    dlg.addEventListener('click', function (e) {
      var act = e.target.closest('[data-lb]');
      if (act) {
        var k = act.getAttribute('data-lb');
        if (k === 'close') dlg.close(); else show(pos + (k === 'next' ? 1 : -1));
      } else if (e.target === dlg) {
        dlg.close();   // click on the backdrop
      }
    });
    dlg.addEventListener('keydown', function (e) {
      if (group.length < 2) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(pos + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(pos - 1); }
    });
    dlg.addEventListener('close', function () { lbImg.removeAttribute('src'); if (opener) opener.focus(); });
  }

  /* ---- project filter (Work page) ---- */
  var filterBar = document.querySelector('[data-filters]');
  if (filterBar) {
    filterBar.hidden = false;
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-tags]'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-filter-section]'));
    var statusEl = filterBar.querySelector('[data-filter-status]');
    filterBar.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter]');
      if (!chip) return;
      var f = chip.getAttribute('data-filter');
      filterBar.querySelectorAll('[data-filter]').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      var shown = 0;
      items.forEach(function (it) {
        var match = f === 'all' || it.getAttribute('data-tags').split(' ').indexOf(f) > -1;
        it.classList.toggle('is-filtered-out', !match);
        if (match) { shown++; it.classList.add('in'); }
      });
      sections.forEach(function (s) { s.hidden = !s.querySelector('[data-tags]:not(.is-filtered-out)'); });
      statusEl.textContent = f === 'all' ? '' : shown + (shown === 1 ? ' project' : ' projects');
    });
  }

  /* ---- Loblaw progression: the timeline line fills as it scrolls through view ---- */
  var ladders = document.querySelectorAll('.ladder');
  if (ladders.length && !reduce) {
    var paint = function () {
      var vh = window.innerHeight;
      ladders.forEach(function (l) {
        var r = l.getBoundingClientRect();
        var p = Math.min(1, Math.max(0, (vh * 0.75 - r.top) / Math.max(r.height, 1)));
        l.style.setProperty('--progress', p.toFixed(3));
        l.querySelectorAll('.role').forEach(function (role) {
          role.classList.toggle('lit', role.getBoundingClientRect().top < vh * 0.75);
        });
      });
    };
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(function () { paint(); ticking = false; }); }
    }, { passive: true });
    paint();
  }

  /* ---- year stamp ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---- privacy-friendly analytics and the once-per-session visit notice ----
     Production only. Respects Global Privacy Control and Do Not Track.
     The visit beacon carries a random session ID, the path and the referring
     domain. No cookies, no fingerprinting. Email is sent server-side only. */
  var isProd = /(^|\.)tahamohyuddin\.com$/.test(location.hostname);
  var optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

  if (isProd && document.body.getAttribute('data-analytics') === 'vercel') {
    var va = document.createElement('script');
    va.src = '/_vercel/insights/script.js';
    va.defer = true;
    document.head.appendChild(va);
  }

  function sendVisit() {
    var key = 'tm_visit_sent';
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (e) { return; }  // without session storage we cannot dedupe, so do not send
    var sid = '';
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) sid += ('0' + a[i].toString(16)).slice(-2);
    } else { return; }
    var ref = '';
    try {
      if (document.referrer) {
        var host = new URL(document.referrer).hostname;
        if (host && host !== location.hostname) ref = host;
      }
    } catch (e) { /* malformed referrer */ }
    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: sid, path: location.pathname, ref: ref }),
      keepalive: true,
      credentials: 'omit'
    }).catch(function () { /* notifications are best-effort */ });
  }

  if ((isProd || window.__TM_VISIT_TEST__ === true) && !optedOut && !navigator.webdriver) {
    // Wait until the page has actually been visible for a moment: skips prerenders and most crawlers.
    var armed = false;
    var arm = function () {
      if (armed || document.visibilityState !== 'visible') return;
      armed = true;
      setTimeout(function () { if (document.visibilityState === 'visible') sendVisit(); else armed = false; }, 2500);
    };
    document.addEventListener('visibilitychange', arm);
    arm();
  }
})();
