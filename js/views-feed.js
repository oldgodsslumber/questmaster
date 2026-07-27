/* Questmaster — the party feed (M5), the newsfeed of the app.
 *
 * One stream blended across every party you're in, each post labelled with its
 * party and filterable down to one. Quest turn-ins post themselves (Party.
 * autoPost); anyone can drop a manual line or push a journal entry across. A
 * live snapshot per party keeps it current without a refresh.
 */
window.ViewFeed = (function () {

  var filter = null;   /* null = all parties, or a party code */

  function render(host) {
    if (!Store.isCloud()) {
      host.appendChild(el('section.card', {},
        emptyState('📰', 'The feed is a party thing',
          'Sign in with Google and join a party to share a feed. Your private journal works offline regardless.'),
        el('div.list-foot', {}, el('a.btn.ghost', { href: '#/party' }, 'Go to Party'))));
      return;
    }

    var parties = Party.partyList();
    if (!parties.length) {
      host.appendChild(el('section.card', {},
        emptyState('📰', 'No party, no feed',
          'Start or join a party and this becomes a shared stream of everyone\'s turn-ins and notes.'),
        el('div.list-foot', {}, el('a.btn.primary', { href: '#/party' }, 'Find a party'))));
      return;
    }

    /* Drop a stale filter if we left that party. */
    if (filter && !parties.some(function (p) { return Party.codeOf(p) === filter; })) filter = null;

    if (parties.length > 1) host.appendChild(filterRow(parties));
    host.appendChild(composer(parties));

    var posts = Party.combinedFeed(filter);
    if (!posts.length) {
      host.appendChild(emptyState('🌱', 'The feed is quiet',
        'Turn in a shared quest, or post the first update above.'));
      return;
    }
    host.appendChild(el('div.feed', {}, posts.map(postRow)));
  }

  function filterRow(parties) {
    function chip(label, code) {
      return el('button.feed-filter' + ((filter === code) ? '.on' : ''), {
        onclick: function () { filter = code; App.render(); }
      }, label);
    }
    return el('div.feed-filters', {}, [chip('All', null)].concat(
      parties.map(function (p) { return chip(p.name, Party.codeOf(p)); })));
  }

  function composer(parties) {
    var area = textArea('', 'Say something to the party…', 2);
    area.setAttribute('data-focus-key', 'feed-composer');

    /* Where does a manual post land? If a filter is active, that party; else if
     * there's only one party, it; otherwise a selector so it's never ambiguous. */
    var targetSel = null;
    var single = parties.length === 1 ? Party.codeOf(parties[0]) : null;
    if (parties.length > 1 && !filter) {
      targetSel = selectInput(parties.map(function (p) { return { value: Party.codeOf(p), label: p.name }; }), Party.codeOf(parties[0]));
    }

    function target() { return filter || single || (targetSel && targetSel.value) || null; }

    function send() {
      var body = area.value.trim();
      if (!body) return;
      var to = target();
      if (!to) { toast('Pick a party to post to.', 'bad'); return; }
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
          : el('span.muted.small', {}, filter ? 'Posting to this party.' : 'Shared with your party in real time.'),
        el('button.btn.primary', { onclick: send }, 'Post')));
  }

  var KIND_ICON = { 'quest-complete': '🏆', 'achievement': '🎖️', 'status': '✨', 'journal': '📖' };
  var SYSTEM_KIND = { 'quest-complete': 1, 'achievement': 1, 'status': 1 };

  function postRow(p) {
    var mine = p.authorUid === Party.myUid();
    var isSystem = !!SYSTEM_KIND[p.kind];
    var initial = (p.authorName || '?').slice(0, 1).toUpperCase();

    return el('div.feed-post' + (isSystem ? '.auto' : ''), {},
      el('div.feed-avatar', {}, KIND_ICON[p.kind] || initial),
      el('div.feed-body-wrap', {},
        el('div.feed-head', {},
          el('span.feed-author', {}, p.authorName || 'Crawler'),
          p.authorLevel ? el('span.muted.small', {}, 'Lv ' + p.authorLevel) : null,
          p._partyName ? el('span.feed-party-tag', {}, p._partyName) : null,
          el('span.muted.small.feed-time', {}, fmtDate(p.createdAt)),
          mine ? el('button.icon-btn.subtle', {
            title: 'Delete post',
            onclick: function () { Party.removePost(p._partyCode, p.id).catch(function () {}); }
          }, '✕') : null),
        el('div.feed-text', {}, p.body)));
  }

  return { render: render };
})();
