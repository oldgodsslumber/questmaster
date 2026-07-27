/* Questmaster — shell: auth gating, routing, render loop.
 *
 * The gate the spec asks for, in order: spinner → sign-in → character creation
 * → the app. Each stage only knows how to hand off to the next.
 *
 * Rendering is deliberately dumb. Every mutation calls App.render(), which
 * rebuilds the current view from Store.state. The state is small (one character
 * and its subcollections, all already in memory) so a full repaint is cheaper
 * than the bookkeeping that diffing would cost.
 */
window.App = (function () {

  var ROUTES = {
    '#/sheet': { label: 'Sheet', icon: '🧍', view: function () { return ViewSheet; } },
    '#/quests': { label: 'Quests', icon: '🗺️', view: function () { return ViewQuests; } },
    '#/skills': { label: 'Stats', icon: '📊', view: function () { return ViewSkills; } },
    '#/inventory': { label: 'Kit', icon: '🎒', view: function () { return ViewInventory; } },
    '#/statuses': { label: 'Status', icon: '✨', view: function () { return ViewStatuses; } },
    '#/build': { label: 'Build', icon: '🧬', view: function () { return ViewBuild; } },
    '#/party': { label: 'Party', icon: '👥', view: function () { return ViewParty; } },
    '#/feed': { label: 'Feed', icon: '📰', view: function () { return ViewFeed; } },
    '#/journal': { label: 'Journal', icon: '📖', view: function () { return ViewJournal; } },
    '#/admin': { label: 'World', icon: '🌐', view: function () { return ViewAdmin; } }
  };
  /* Stats (#/skills), Status (#/statuses) and Build (#/build) are intentionally
   * NOT in the nav — they're reached from the Sheet (Stats via "Manage", Build
   * via "Race & Class", and buffs/achievements are embedded straight into the
   * Sheet and the Feed). Their routes stay registered so those links still work.
   * #/admin is nav-gated too: only an admin (see isAdmin) ever sees the tab. */
  var NAV_ORDER = ['#/sheet', '#/quests', '#/inventory', '#/party', '#/feed', '#/journal'];

  var stage = 'boot';    /* boot | signin | create | app */

  /* The signed-in Google email, latched on auth so isAdmin() can gate the admin
   * tab. Null in local mode, so local play is never treated as admin. */
  var authEmail = null;
  function isAdmin() {
    if (!authEmail) return false;
    var list = (CONFIG.adminEmails || []).map(function (e) { return String(e).toLowerCase(); });
    return list.indexOf(String(authEmail).toLowerCase()) !== -1;
  }

  /* The render loop repaints the whole view on every mutation. Without help,
   * that throws away scroll position and keyboard focus — so tapping a checkbox
   * halfway down the quest list snapped the page back to the top. We remember
   * the hash we last painted; when a repaint stays on the same view we restore
   * the scroll offset and re-focus the control that had focus, keyed off a
   * stable data-focus-key the views stamp on interactive elements. */
  var lastPaintedHash = null;

  /* ---- Boot ------------------------------------------------------------------- */

  function start() {
    document.getElementById('build-tag').textContent = CONFIG.build;

    window.addEventListener('hashchange', function () { if (stage === 'app') render(); });

    /* A live party/feed snapshot arriving from another member repaints, but only
     * while those screens are open — otherwise a teammate's post would yank the
     * scroll position on an unrelated view. */
    if (window.Party) {
      Party.onChange(function () {
        if (stage === 'app' && (location.hash === '#/party' || location.hash === '#/feed' || location.hash === '#/admin')) render();
      });
    }

    /* firebase-config.js calls back once Google auth resolves. If the config is
     * still a placeholder it never loads, so we fall through to the local
     * backend after a beat rather than leaving a spinner up forever. */
    window.QM_onAuth = onAuth;
    window.QM_onAuthError = function (e) {
      toast('Sign-in failed: ' + (e && e.message ? e.message : 'unknown error'), 'bad');
      stage = 'signin';
      render();
    };

    /* Auth may already have resolved — module scripts run before this listener
     * is installed, so a cached session can beat us here. */
    if (window.QMAuthState && window.QMAuthState.resolved) {
      onAuth(window.QMAuthState.user);
      return;
    }

    setTimeout(function () {
      if (stage === 'boot') {
        console.info('[qm] no Firebase auth after 2.5s — offering local mode');
        stage = 'signin';
        render();
      }
    }, 2500);

    render();
  }

  function onAuth(user) {
    if (!user) {
      authEmail = null;
      if (window.Party) Party.detach();
      Store.detach();
      stage = 'signin';
      render();
      return;
    }
    authEmail = user.email || null;
    enter(user.uid, window.FirebaseCtx, user.displayName);
  }

  /* Attach a backend, pull everything, and decide whether this user still needs
   * to make a character. */
  function enter(uid, ctx, displayName) {
    stage = 'boot';
    render();

    Store.attach(uid, ctx);
    Store.load()
      .then(function (character) {
        if (!character) { stage = 'create'; safeRender(); return; }

        /* The character is loaded — you are IN. Nothing past this point may
         * bounce you back to sign-in: resets, the party layer, and even a
         * rendering hiccup are all best-effort. Only a genuine failure to read
         * the character document itself (the .catch below) is a real login
         * failure. This is why login broke twice — a downstream write or render
         * error was being treated as "couldn't log in". */
        stage = 'app';
        if (!location.hash || !ROUTES[location.hash]) location.hash = '#/quests';
        try { if (window.Party) Party.attach(); } catch (e) { console.warn('[qm] party attach failed', e); }
        safeRender();

        /* Resets can write to Firestore; a denied/failed write must never block
         * or undo entry. Run them after we're already in and repaint if they
         * changed anything. */
        Progress.runResets()
          .then(function () { if (stage === 'app') safeRender(); })
          .catch(function (e) { console.warn('[qm] resets failed (continuing)', e); });
      })
      .catch(function (e) {
        console.error('[qm] could not read character document', e);
        toast('Could not load your character — ' + (e.message || 'unknown error'), 'bad');
        stage = 'signin';
        safeRender();
      });
  }

  function afterCreate() {
    return Store.load().then(function () {
      stage = 'app';
      if (window.Party) Party.attach();
      location.hash = '#/sheet';
      render();
    });
  }

  /* ---- Render ------------------------------------------------------------------- */

  /* render() that can never throw out to its caller — a view or nav paint error
   * shows an in-place message instead of rejecting a promise chain (which, from
   * the post-login chain, would have kicked the user to the sign-in screen). */
  function safeRender() {
    try { render(); } catch (e) { console.error('[qm] render crashed', e); }
  }

  function render() {
    var main = document.getElementById('view');
    var nav = document.getElementById('nav');

    /* Snapshot what we're about to destroy, so a same-view repaint can put it
     * back. Only meaningful in the app stage; boot/signin/create always start
     * fresh at the top. */
    var keepPosition = stage === 'app' && lastPaintedHash === location.hash;
    var prevScroll = keepPosition ? (window.scrollY || document.documentElement.scrollTop || 0) : 0;
    var focusState = keepPosition ? captureFocus(main) : null;

    clear(main);

    if (stage === 'boot') {
      nav.hidden = true;
      lastPaintedHash = null;
      main.appendChild(el('div.boot', {},
        el('div.spinner'),
        el('p.muted', {}, 'Contacting the System…')));
      return;
    }

    if (stage === 'signin') { nav.hidden = true; lastPaintedHash = null; renderSignIn(main); return; }
    if (stage === 'create') { nav.hidden = true; lastPaintedHash = null; ViewCreate.render(main); return; }

    nav.hidden = false;
    try { paintNav(nav); } catch (e) { console.error('[qm] nav paint failed', e); }

    var route = ROUTES[location.hash] || ROUTES['#/quests'];
    var wrap = el('div.view.' + (location.hash || '#/quests').replace('#/', 'v-'));
    try {
      route.view().render(wrap);
    } catch (e) {
      console.error('[qm] view crashed', e);
      wrap.appendChild(emptyState('💥', 'This view failed to draw', e.message));
    }
    main.appendChild(wrap);

    lastPaintedHash = location.hash;
    if (keepPosition) {
      if (prevScroll) window.scrollTo(0, prevScroll);
      restoreFocus(main, focusState);
    }
  }

  /* Record which interactive element had focus and where its text caret sat, so
   * the freshly-rebuilt copy can inherit both. Elements opt in by carrying a
   * data-focus-key; that keeps the match stable across a repaint even though the
   * old node is discarded. */
  function captureFocus(root) {
    var a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    var key = a.getAttribute && a.getAttribute('data-focus-key');
    if (!key) return null;
    var st = { key: key };
    if ('selectionStart' in a) {
      st.selStart = a.selectionStart;
      st.selEnd = a.selectionEnd;
    }
    return st;
  }

  function restoreFocus(root, st) {
    if (!st) return;
    var next = root.querySelector('[data-focus-key="' + st.key.replace(/"/g, '\\"') + '"]');
    if (!next) return;
    next.focus();
    if (st.selStart != null && 'setSelectionRange' in next) {
      try { next.setSelectionRange(st.selStart, st.selEnd); } catch (e) { /* non-text input */ }
    }
  }

  function paintNav(nav) {
    clear(nav);
    var c = Store.state.character;

    nav.appendChild(el('div.nav-head', {},
      el('div.nav-who', {},
        el('span.nav-name', {}, c ? c.name : ''),
        el('span.nav-level', {}, 'Lv ' + (c ? c.level : 1))),
      Store.kind() === 'local'
        ? el('span.local-chip', { title: 'Firebase is not configured — data lives in this browser only.' }, 'Local')
        : el('button.icon-btn.subtle', { title: 'Sign out', onclick: signOut }, '⏻')));

    /* Admins get one extra tab at the end; nobody else sees it in the nav (and
     * the route itself re-checks isAdmin, so a hand-typed #/admin gets nothing). */
    var order = isAdmin() ? NAV_ORDER.concat(['#/admin']) : NAV_ORDER;

    nav.appendChild(el('div.nav-links', {}, order.map(function (hash) {
      var r = ROUTES[hash];
      var on = (location.hash || '#/quests') === hash;
      return el('a.nav-link' + (on ? '.on' : ''), { href: hash },
        el('span.nav-icon', {}, r.icon),
        el('span.nav-label', {}, r.label));
    })));
  }

  /* ---- Sign-in ------------------------------------------------------------------- */

  function renderSignIn(main) {
    var hasFirebase = !!(window.QMAuth && window.QMAuth.available);

    main.appendChild(el('div.signin', {},
      el('div.signin-mark', {}, 'QUESTMASTER'),
      el('p.signin-tag', {}, 'Do the real thing. The character is the reward.'),

      hasFirebase
        ? el('button.btn.primary.big', {
          onclick: function (e) {
            e.target.disabled = true;
            e.target.textContent = 'Opening Google…';
            window.QMAuth.signIn().catch(function (err) {
              console.error('[qm] sign-in failed', err);
              toast('Sign-in failed: ' + (err.message || 'unknown'), 'bad');
              e.target.disabled = false;
              e.target.textContent = 'Sign in with Google';
            });
          }
        }, 'Sign in with Google')
        : el('div.note', {},
          el('b', {}, 'Firebase is not configured yet. '),
          'Paste your project config into ', el('code', {}, 'js/firebase-config.js'),
          ' to sync across devices and unlock the party layer. Until then everything works locally.'),

      el('button.btn.ghost' + (hasFirebase ? '' : '.primary.big'), {
        onclick: function () { enter('local-crawler', null); }
      }, 'Continue on this device'),

      el('p.muted.small', {},
        'Local mode stores your character in this browser only. Nothing is uploaded, and clearing site data clears the character.')));
  }

  function signOut() {
    confirmModal('Sign out?', 'Your character stays in the cloud. You can sign back in any time.', function () {
      if (window.Party) Party.detach();
      if (window.QMAuth) window.QMAuth.signOut();
      Store.detach();
      stage = 'signin';
      render();
    }, 'Sign out');
  }

  function go(hash) {
    location.hash = hash;
    if (stage === 'app') render();
  }

  return { start: start, render: render, go: go, afterCreate: afterCreate, enter: enter, isAdmin: isAdmin };
})();

document.addEventListener('DOMContentLoaded', function () { App.start(); });
