/* Questmaster — the World Admin panel (admin-only).
 *
 * A single gated screen where the admin posts to the one global broadcast
 * stream every crawler reads: System messages, AI-world messages, and World
 * Quests. Each type carries its own colour (see css .wc-*), and a World Quest
 * additionally ships a template every crawler can accept into their own log.
 *
 * Gating is defence-in-depth: this view refuses to draw for a non-admin, the
 * nav never shows the tab, and firestore.rules is the real lock — only an
 * allow-listed email may write /world, so a hand-typed hash achieves nothing.
 */
window.ViewAdmin = (function () {

  var TYPES = [
    { kind: 'world-system', label: 'System message', emoji: '🛠️', hint: 'Ops and status notices in the voice of the System.' },
    { kind: 'world-ai', label: 'AI world message', emoji: '🤖', hint: 'The dungeon AI speaking — lore, taunts, world events.' },
    { kind: 'world-showrunner', label: 'Showrunner announcement', emoji: '🎬', hint: 'The Showrunner addressing the crawl — hype, ratings, prize drops.' },
    { kind: 'world-quest', label: 'World Quest', emoji: '⚔️', hint: 'A shared objective every crawler can accept and complete.' }
  ];

  var draftKind = 'world-system';

  function typeOf(kind) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].kind === kind) return TYPES[i];
    return TYPES[0];
  }

  /* Shared colour class, used by both this panel and the feed post. */
  function worldClass(kind) {
    return kind === 'world-ai' ? 'wc-ai'
      : kind === 'world-showrunner' ? 'wc-showrunner'
      : kind === 'world-quest' ? 'wc-quest'
      : 'wc-system';
  }

  function render(host) {
    if (!App.isAdmin()) {
      host.appendChild(emptyState('🔒', 'Admins only', 'This panel is limited to the world admin.'));
      return;
    }
    if (!Store.isCloud()) {
      host.appendChild(emptyState('☁️', 'Sign in to broadcast',
        'World broadcasts are global — sign in with Google so they reach everyone.'));
      return;
    }

    host.appendChild(el('section.card', {},
      el('h1.admin-title', {}, '🌐 World Admin'),
      el('p.muted.small', {}, 'Anything you post here lands in every crawler’s feed. Pick a type — each shows in its own colour.')));

    host.appendChild(composer());
    host.appendChild(broadcastList());
  }

  function composer() {
    var typeSel = selectInput(TYPES.map(function (t) { return { value: t.kind, label: t.emoji + '  ' + t.label }; }), draftKind);
    var title = textInput('', 'Title (optional for messages, required for quests)');
    var body = textArea('', 'Message…', 3);
    var xp = numInput(50, 0);
    var tasks = textArea('', 'One task per line — leave blank for a single-step quest', 3);

    var iconSlug = null;
    var iconCtl = Icons.iconField(null, function (v) { iconSlug = v; });

    var questWrap = el('div.admin-quest-fields', {},
      field('Bonus XP', xp, 'Paid out when a crawler finishes the World Quest.'),
      field('Tasks', tasks, 'Each line becomes a checkable task on the accepted quest.'));

    var previewIcon = el('span.wc-avatar', {});
    var previewText = el('span.wc-preview-text', {});
    var preview = el('div.wc-preview', {}, previewIcon, previewText);

    function paintPreview() {
      var t = typeOf(typeSel.value);
      preview.className = 'wc-preview ' + worldClass(typeSel.value);
      clear(previewIcon);
      previewIcon.appendChild(iconSlug ? Icons.node(iconSlug) : document.createTextNode(t.emoji));
      previewText.textContent = (title.value.trim() ? title.value.trim() + ' — ' : '') + (body.value.trim() || t.hint);
    }

    function syncType() {
      draftKind = typeSel.value;
      questWrap.style.display = typeSel.value === 'world-quest' ? '' : 'none';
      paintPreview();
    }
    typeSel.addEventListener('change', syncType);
    title.addEventListener('input', paintPreview);
    body.addEventListener('input', paintPreview);

    /* Re-skin the picked icon into the preview whenever it changes. */
    var origOnChange = iconCtl.onchange;
    iconCtl.addEventListener('click', function () { setTimeout(paintPreview, 0); });

    function submit() {
      var kind = typeSel.value;
      var b = body.value.trim();
      var t = title.value.trim();
      if (kind === 'world-quest') {
        if (!t) { toast('A World Quest needs a title.', 'bad'); return; }
      } else if (!b) {
        toast('Write a message first.', 'bad'); return;
      }

      var doc = {
        kind: kind,
        title: t,
        body: b,
        authorName: (Store.state.character && Store.state.character.name) || 'The System',
        iconSlug: iconSlug || null
      };
      if (kind === 'world-quest') {
        doc.questTitle = t;
        doc.xpReward = Math.max(0, parseInt(xp.value, 10) || 0);
        doc.tasks = tasks.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      }

      Store.addWorldPost(doc)
        .then(function () {
          toast('Broadcast sent to everyone.');
          title.value = ''; body.value = ''; tasks.value = '';
          App.render();
        })
        .catch(function (e) { toast(e.message || 'Could not broadcast.', 'bad'); });
    }

    syncType();

    return el('section.card', {},
      field('Type', typeSel),
      field('Title', title),
      field('Message', body),
      field('Icon', iconCtl),
      questWrap,
      el('div.field', {}, el('span.field-label', {}, 'Preview'), preview),
      el('div.row-actions', {}, el('button.btn.primary', { onclick: submit }, 'Broadcast to everyone')));
  }

  function broadcastList() {
    var posts = (window.Party ? Party.worldFeed() : [])
      .slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    if (!posts.length) {
      return el('section.card', {}, emptyState('📡', 'No live broadcasts', 'What you post above shows up here, and you can retire it any time.'));
    }

    return el('section.card', {},
      el('h2.admin-subtitle', {}, 'Live broadcasts'),
      el('div.wc-list', {}, posts.map(function (p) {
        var t = typeOf(p.kind);
        return el('div.wc-item.' + worldClass(p.kind), {},
          el('span.wc-avatar', {}, p.iconSlug ? Icons.node(p.iconSlug) : document.createTextNode(t.emoji)),
          el('div.wc-item-body', {},
            el('div.wc-item-head', {},
              el('span.wc-kind', {}, t.label),
              p.title ? el('span.wc-item-title', {}, p.title) : null),
            p.body ? el('div.wc-item-text', {}, p.body) : null,
            p.kind === 'world-quest' && p.xpReward ? el('span.muted.small', {}, '+' + p.xpReward + ' XP') : null),
          el('button.btn.tiny.ghost', {
            onclick: function () {
              confirmModal('Retire this broadcast?', 'It disappears from everyone’s feed. Crawlers who already accepted a World Quest keep their copy.', function () {
                Store.removeWorldPost(p.id).then(App.render).catch(function (e) { toast(e.message || 'Could not remove.', 'bad'); });
              }, 'Retire');
            }
          }, 'Retire'));
      })));
  }

  return { render: render, worldClass: worldClass };
})();
