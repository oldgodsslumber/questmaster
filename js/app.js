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
    '#/journal': { label: 'Journal', icon: '📖', view: function () { return ViewJournal; } }
  };
  /* Stats (#/skills), Status (#/statuses) and Build (#/build) are intentionally
   * NOT in the nav — they're reached from the Sheet (Stats via "Manage", Build
   * via "Race & Class", and buffs/achievements are embedded straight into the
   * Sheet and the Feed). Their routes stay registered so those links still work. */
  var NAV_ORDER = ['#/sheet', '#/quests', '#/inventory', '#/party', '#/feed', '#/journal'];

  var stage = 'boot';    /* boot | signin | create | app */

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
        if (stage === 'app' && (location.hash === '#/party' || location.hash === '#/feed')) render();
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
      if (window.Party) Party.detach();
      Store.detach();
      stage = 'signin';
      render();
      return;
    }
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
        if (!character) { stage = 'create'; render(); return null; }
        /* Resets run once per load, before anything is drawn — otherwise you
         * would see yesterday's checkmarks for a frame. */
        return Progress.runResets().then(function () {
          stage = 'app';
          if (window.Party) Party.attach();
          if (!location.hash || !ROUTES[location.hash]) location.hash = '#/quests';
          render();
        });
      })
      .catch(function (e) {
        console.error('[qm] load failed', e);
        toast('Could not load your character — ' + (e.message || 'unknown error'), 'bad');
        stage = 'signin';
        render();
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
    paintNav(nav);

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

    nav.appendChild(el('div.nav-links', {}, NAV_ORDER.map(function (hash) {
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

  return { start: start, render: render, go: go, afterCreate: afterCreate, enter: enter };
})();

document.addEventListener('DOMContentLoaded', function () { App.start(); });
