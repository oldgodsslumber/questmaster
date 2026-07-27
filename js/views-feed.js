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

  /* Where a new post/status/achievement should land from the Feed: the active
   * filter if it's a postable destination, otherwise the first one (Friends). */
  function defaultTarget() {
    var dests = feedDestinations();
    if (!dests.length) return null;
    if (filter && dests.some(function (d) { return d.value === filter; })) return filter;
    return dests[0].value;
  }

  function render(host) {
    /* Buffs/debuffs + achievements are addable and visible right here on the
     * Feed too, folded into a collapsible so they don't crowd the stream. */
    if (window.ViewStatuses) {
      var statusBox = el('div');
      ViewStatuses.panel(statusBox, { postTarget: defaultTarget() });
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
    var targetSel = null;
    if (dests.length > 1) {
      var def = (filter && filter !== null) ? filter : dests[0].value;
      if (!dests.some(function (d) { return d.value === def; })) def = dests[0].value;
      targetSel = selectInput(dests.map(function (d) { return { value: d.value, label: d.label }; }), def);
    }

    function target() { return targetSel ? targetSel.value : (dests[0] && dests[0].value) || null; }

    function send() {
      var body = area.value.trim();
      if (!body) return;
      var to = target();
      if (!to) { toast('Pick where to post.', 'bad'); return; }
      area.value = '';
      Party.post(body, 'manual', null, to)
        .then(function () { toast('Posted.'); })
        .catch(function (e) { toast(e.message || 'Could not post.', 'bad'); });
    }

    return el('section.card.composer', {},
      area,
      el('div.composer-foot', {},
        targetSel
          ? el('label.feed-target', {}, el('span.muted.small', {}, 'Post to'), targetSel)
          : el('span.muted.small', {}, 'Posting to your friends feed.'),
        el('button.btn.primary', { onclick: send }, 'Post')),
      /* Post a buff/debuff or achievement straight to the feed — creating one
       * here also announces it to the destination selected above. */
      el('div.feed-quickpost', {},
        el('span.muted.small', {}, 'Or post a:'),
        el('button.btn.tiny.ghost', { onclick: function () { ViewStatuses.newStatus(target()); } }, '✨ Buff / Debuff'),
        el('button.btn.tiny.ghost', { onclick: function () { ViewStatuses.newAchievement(target()); } }, '🎖️ Achievement')));
  }

  var KIND_ICON = { 'quest-complete': '🏆', 'achievement': '🎖️', 'status': '✨', 'journal': '📖' };
  var SYSTEM_KIND = { 'quest-complete': 1, 'achievement': 1, 'status': 1 };

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

    return el('div.feed-post' + (isSystem ? '.auto' : ''), {},
      avatar,
      el('div.feed-body-wrap', {},
        el('div.feed-head', {},
          el('span.feed-author', {}, p.authorName || 'Crawler'),
          p.authorLevel ? el('span.muted.small', {}, 'Lv ' + p.authorLevel) : null,
          p._partyName ? el('span.feed-party-tag', {}, p._partyName) : null,
          el('span.muted.small.feed-time', {}, fmtDate(p.createdAt)),
          mine ? el('button.icon-btn.subtle', {
            title: 'Delete post',
            onclick: function () { Party.removePost(p).catch(function () {}); }
          }, '✕') : null),
        el('div.feed-text', {}, p.body)));
  }

  return { render: render };
})();
