/* Questmaster — the feed (M5), the newsfeed of the app.
 *
 * One stream blended across your Friends and every party you're in, each post
 * labelled with where it came from and filterable down to one. Quest turn-ins
 * post themselves (Party.autoPost); anyone can drop a manual line, push a
 * journal entry, or share a status/achievement across. Live snapshots keep it
 * current without a refresh.
 */
window.ViewFeed = (function () {

  var filter = null;   /* null = everything, 'friends', or a party code */

  /* Which destinations a new post/status/achievement should pre-select from the
   * Feed: the active filter if it's postable, otherwise the first one (Friends).
   * Returns an ARRAY, since posts can now go to several feeds at once. */
  function defaultTargets() {
    var dests = feedDestinations();
    if (!dests.length) return [];
    if (filter && dests.some(function (d) { return d.value === filter; })) return [filter];
    return [dests[0].value];
  }

  function render(host) {
    /* Buffs/debuffs + achievements are addable and visible right here on the
     * Feed too, folded into a collapsible so they don't crowd the stream. */
    if (window.ViewStatuses) {
      var statusBox = el('div');
      ViewStatuses.panel(statusBox, { postTarget: defaultTargets() });
      host.appendChild(el('details.feed-status', {},
        el('summary', {}, 'Your buffs, debuffs & achievements'), statusBox));
    }

    if (!Store.isCloud() || !Party.available()) {
      host.appendChild(el('section.card', {},
        emptyState('📰', 'The feed is a shared thing',
          'Sign in with Google to get a Friends feed and join parties. Your private journal works offline regardless.'),
        el('div.list-foot', {}, el('a.btn.ghost', { href: '#/party' }, 'Go to Party & Friends'))));
      return;
    }

    var parties = Party.partyList();

    /* Drop a stale party filter if we left it. */
    if (filter && filter !== 'friends' && !parties.some(function (p) { return Party.codeOf(p) === filter; })) filter = null;

    if (parties.length) host.appendChild(filterRow(parties));
    host.appendChild(composer());

    var posts = Party.combinedFeed(filter);
    if (!posts.length) {
      host.appendChild(emptyState('🌱', 'The feed is quiet',
        'Share a status or a note above, add friends on the Party tab, or turn in a shared quest.'));
      return;
    }
    host.appendChild(el('div.feed', {}, posts.map(postRow)));
  }

  function filterRow(parties) {
    function chip(label, code) {
      return el('button.feed-filter' + (filter === code ? '.on' : ''), {
        onclick: function () { filter = code; App.render(); }
      }, label);
    }
    return el('div.feed-filters', {}, [chip('All', null), chip('Friends', 'friends')].concat(
      parties.map(function (p) { return chip(p.name, Party.codeOf(p)); })));
  }

  function composer() {
    var area = textArea('', 'Say something…', 2);
    area.setAttribute('data-focus-key', 'feed-composer');

    var dests = feedDestinations();       /* [friends, ...parties] */
    /* Checkboxes so a post can go to one or more parties AND friends at once. */
    var checks = feedTargetChecks(defaultTargets());

    function targets() { return checks.targets(); }

    function send() {
      var body = area.value.trim();
      if (!body) return;
      var to = targets();
      if (!to.length) { toast('Pick where to post.', 'bad'); return; }
      area.value = '';
      Party.post(body, 'manual', null, to)
        .then(function () { toast(to.length > 1 ? 'Posted to ' + to.length + ' feeds.' : 'Posted.'); })
        .catch(function (e) { toast(e.message || 'Could not post.', 'bad'); });
    }

    return el('section.card.composer', {},
      area,
      el('div.composer-foot', {},
        dests.length > 1
          ? el('div.feed-target', {}, el('span.muted.small', {}, 'Post to'), checks.node)
          : el('span.muted.small', {}, 'Posting to your friends feed.'),
        el('button.btn.primary', { onclick: send }, 'Post')),
      /* Post a buff/debuff, achievement, kit item, or stat straight to the feed —
       * each carries its own game-icon and announces to the checked feeds above. */
      el('div.feed-quickpost', {},
        el('span.muted.small', {}, 'Or post a:'),
        el('button.btn.tiny.ghost', { onclick: function () { ViewStatuses.newStatus(targets()); } }, '✨ Buff / Debuff'),
        el('button.btn.tiny.ghost', { onclick: function () { ViewStatuses.newAchievement(targets()); } }, '🎖️ Achievement'),
        el('button.btn.tiny.ghost', { onclick: function () { shareItem(targets()); } }, '🎒 Item'),
        el('button.btn.tiny.ghost', { onclick: function () { shareStat(targets()); } }, '📊 Stat')));
  }

  /* ---- Sharing a kit item or a stat to the feed --------------------------- */

  /* Push one line to a destination, tagged with the entity's game-icon so the
   * feed avatar shows the item/stat's own art rather than a generic glyph. */
  function postEntity(body, kind, iconSlug, to) {
    if (!to || (Array.isArray(to) && !to.length)) { toast('Check at least one feed to post to.', 'bad'); return; }
    Party.post(body, kind, { iconSlug: iconSlug || null }, to)
      .then(function () { toast('Posted.'); })
      .catch(function (e) { toast(e.message || 'Could not post.', 'bad'); });
  }

  /* A tap-to-pick modal: each row is an entity with its icon; picking it posts. */
  function sharePicker(title, list, subOf, bodyOf, kind, to) {
    if (!list || !list.length) { toast('Nothing to share here yet.', 'bad'); return; }
    var close;
    var rows = list.map(function (ent) {
      var sub = subOf ? subOf(ent) : null;
      return el('button.share-pick-row', {
        type: 'button',
        onclick: function () {
          close();
          var who = (Store.state.character && Store.state.character.name) || 'A crawler';
          postEntity(bodyOf(who, ent), kind, ent.iconSlug, to);
        }
      },
        el('span.share-pick-icon', {}, Icons.node(ent.iconSlug)),
        el('span.share-pick-name', {}, ent.name || 'Unnamed'),
        sub ? el('span.muted.small.share-pick-sub', {}, sub) : null);
    });
    close = openModal({
      title: title,
      body: el('div.share-pick', {}, rows),
      actions: [{ label: 'Cancel', kind: 'ghost' }]
    });
  }

  function shareItem(to) {
    var items = (Store.state.equipment || []).concat(Store.state.items || []);
    sharePicker('Share an item', items,
      function (e) { return e.slot ? capitalize(e.slot.replace(/([A-Z])/g, ' $1')) : (e.rarity ? capitalize(e.rarity) : null); },
      function (who, e) { return who + ' shows off "' + (e.name || 'an item') + '".'; },
      'item', to);
  }

  function shareStat(to) {
    sharePicker('Share a stat', Store.state.skills || [],
      function (s) { return 'Rank ' + (s.rank || 1); },
      function (who, s) { return who + "'s " + (s.name || 'a stat') + ' reached rank ' + (s.rank || 1) + '.'; },
      'skill', to);
  }

  function capitalize(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var KIND_ICON = { 'quest-complete': '🏆', 'achievement': '🎖️', 'status': '✨', 'journal': '📖', 'item': '🎒', 'skill': '📊',
    'world-system': '🛠️', 'world-ai': '🤖', 'world-showrunner': '🎬', 'world-quest': '⚔️' };
  var SYSTEM_KIND = { 'quest-complete': 1, 'achievement': 1, 'status': 1, 'item': 1, 'skill': 1 };

  function postRow(p) {
    var mine = p.authorUid === Party.myUid();
    var isSystem = !!SYSTEM_KIND[p.kind];
    var initial = (p.authorName || '?').slice(0, 1).toUpperCase();

    /* A buff/debuff/achievement/item post carries the same game-icon the crawler
     * chose for it — show that in the avatar rather than the generic kind emoji,
     * so the feed matches what they see on the sheet and in their kit. */
    var avatar = (p.iconSlug && window.Icons)
      ? el('div.feed-avatar.feed-avatar-icon', {}, Icons.node(p.iconSlug))
      : el('div.feed-avatar', {}, KIND_ICON[p.kind] || initial);

    /* A global admin broadcast is colour-coded by type and can't be deleted from
     * the feed (the admin retires it from the World panel), so suppress the ✕. */
    var isWorld = !!p._world;
    var worldCls = isWorld && window.ViewAdmin ? ' ' + ViewAdmin.worldClass(p.kind) : '';
    var canDelete = mine && !isWorld;

    return el('div.feed-post' + (isSystem ? '.auto' : '') + worldCls, {},
      avatar,
      el('div.feed-body-wrap', {},
        el('div.feed-head', {},
          el('span.feed-author', {}, p.authorName || 'Crawler'),
          p.authorLevel ? el('span.muted.small', {}, 'Lv ' + p.authorLevel) : null,
          p._partyName ? el('span.feed-party-tag', {}, p._partyName) : null,
          el('span.muted.small.feed-time', {}, fmtDate(p.createdAt)),
          canDelete ? el('button.icon-btn.subtle', {
            title: 'Delete post',
            onclick: function () { Party.removePost(p).catch(function () {}); }
          }, '✕') : null),
        p.title && isWorld ? el('div.feed-world-title', {}, p.title) : null,
        el('div.feed-text', {}, p.body),
        (p.kind === 'world-quest') ? worldQuestAction(p) : null));
  }

  /* An Accept button on a World Quest post — copies the quest into the crawler's
   * own log via Party.acceptWorldQuest; shows an accepted state once they have. */
  function worldQuestAction(p) {
    var accepted = window.Party && Party.hasAcceptedWorldQuest && Party.hasAcceptedWorldQuest(p.id);
    if (accepted) return el('div.feed-wq-actions', {}, el('span.wc-accepted', {}, '✓ Accepted — in your quest log'));
    return el('div.feed-wq-actions', {},
      p.xpReward ? el('span.muted.small', {}, '+' + p.xpReward + ' XP') : null,
      el('button.btn.tiny.primary', {
        onclick: function (e) {
          e.target.disabled = true;
          Party.acceptWorldQuest(p)
            .then(function () { toast('World Quest added to your log.'); App.render(); })
            .catch(function (err) { e.target.disabled = false; toast(err.message || 'Could not accept.', 'bad'); });
        }
      }, 'Accept World Quest'));
  }

  return { render: render };
})();
