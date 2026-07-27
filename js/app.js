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
    '#/skills': { label: 'Skills', icon: '📜', view: function () { return ViewSkills; } },
    '#/inventory': { label: 'Kit', icon: '🎒', view: function () { return ViewInventory; } },
    '#/statuses': { label: 'Status', icon: '✨', view: function () { return ViewStatuses; } },
    '#/build': { label: 'Build', icon: '🧬', view: function () { return ViewBuild; } },
    '#/journal': { label: 'Journal', icon: '📖', view: function () { return ViewJournal; } }
  };
  var NAV_ORDER = ['#/sheet', '#/quests', '#/skills', '#/inventory', '#/statuses', '#/build', '#/journal'];

  var stage = 'boot';    /* boot | signin | create | app */

  /* ---- Boot ------------------------------------------------------------------- */

  function start() {
    document.getElementById('build-tag').textContent = CONFIG.build;

    window.addEventListener('hashchange', function () { if (stage === 'app') render(); });

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
      location.hash = '#/sheet';
      render();
    });
  }

  /* ---- Render ------------------------------------------------------------------- */

  function render() {
    var main = document.getElementById('view');
    var nav = document.getElementById('nav');
    clear(main);

    if (stage === 'boot') {
      nav.hidden = true;
      main.appendChild(el('div.boot', {},
        el('div.spinner'),
        el('p.muted', {}, 'Contacting the System…')));
      return;
    }

    if (stage === 'signin') { nav.hidden = true; renderSignIn(main); return; }
    if (stage === 'create') { nav.hidden = true; ViewCreate.render(main); return; }

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
