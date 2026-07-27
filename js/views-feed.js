/* Questmaster — the party feed (M5), the newsfeed of the app.
 *
 * A chronological stream of what the party is up to: quest turn-ins post
 * themselves (see Party.autoPost), and anyone can drop a manual line or push a
 * journal entry across. It reads from Party.feedPosts(), which a live snapshot
 * keeps current — so a teammate's post shows up here without a refresh.
 */
window.ViewFeed = (function () {

  function render(host) {
    if (!Store.isCloud()) {
      host.appendChild(el('section.card', {},
        emptyState('📰', 'The feed is a party thing',
          'Sign in with Google and join a party to share a feed. Your private journal on the Journal tab works offline regardless.'),
        el('div.list-foot', {}, el('a.btn.ghost', { href: '#/party' }, 'Go to Party'))));
      return;
    }

    if (!Party.inParty()) {
      host.appendChild(el('section.card', {},
        emptyState('📰', 'No party, no feed',
          'Start or join a party and this becomes a shared stream of everyone\'s turn-ins and notes.'),
        el('div.list-foot', {}, el('a.btn.primary', { href: '#/party' }, 'Find a party'))));
      return;
    }

    host.appendChild(composer());

    var posts = Party.feedPosts();
    if (!posts.length) {
      host.appendChild(emptyState('🌱', 'The feed is quiet',
        'Turn in a shared quest, or post the first update above.'));
      return;
    }

    host.appendChild(el('div.feed', {}, posts.map(postRow)));
  }

  function composer() {
    var area = textArea('', 'Say something to the party…', 2);
    area.setAttribute('data-focus-key', 'feed-composer');

    function send() {
      var body = area.value.trim();
      if (!body) return;
      area.value = '';
      Party.post(body, 'manual')
        .then(function () { toast('Posted.'); })
        .catch(function (e) { toast(e.message || 'Could not post.', 'bad'); });
    }

    return el('section.card.composer', {},
      area,
      el('div.composer-foot', {},
        el('span.muted.small', {}, 'Shared with your party in real time.'),
        el('button.btn.primary', { onclick: send }, 'Post')));
  }

  function postRow(p) {
    var mine = p.authorUid === Party.myUid();
    var isAuto = p.kind === 'quest-complete';
    var initial = (p.authorName || '?').slice(0, 1).toUpperCase();

    return el('div.feed-post' + (isAuto ? '.auto' : ''), {},
      el('div.feed-avatar', {}, isAuto ? '🏆' : initial),
      el('div.feed-body-wrap', {},
        el('div.feed-head', {},
          el('span.feed-author', {}, p.authorName || 'Crawler'),
          p.authorLevel ? el('span.muted.small', {}, 'Lv ' + p.authorLevel) : null,
          el('span.muted.small.feed-time', {}, fmtDate(p.createdAt)),
          mine ? el('button.icon-btn.subtle', {
            title: 'Delete post',
            onclick: function () { Party.removePost(p.id).catch(function () {}); }
          }, '✕') : null),
        el('div.feed-text', {}, p.body)));
  }

  return { render: render };
})();
