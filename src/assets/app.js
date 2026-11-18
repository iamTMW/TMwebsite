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

  if (isProd) {
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
