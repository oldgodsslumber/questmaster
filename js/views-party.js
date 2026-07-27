/* Questmaster — the Party & Friends screen (M5).
 *
 * Two tabs. "Parties" lists every party you're in (you can be in several now),
 * with create/join below. "Friends" is a lightweight directory: your shareable
 * friend code, an add-by-code box, and the crawlers you've added with their
 * live level and class. Cloud-only; local mode gets an honest sign-in prompt.
 */
window.ViewParty = (function () {

  var tab = 'parties';

  function render(host) {
    if (!Store.isCloud()) { host.appendChild(localState()); return; }

    host.appendChild(el('div.tabs', {}, [
      ['parties', 'Parties', Party.partyCount()],
      ['friends', 'Friends', Party.friends().length]
    ].map(function (t) {
      return el('button.tab' + (tab === t[0] ? '.on' : ''), {
        onclick: function () { tab = t[0]; App.render(); }
      }, t[1], el('span.tab-count', {}, t[2]));
    })));

    if (tab === 'parties') renderParties(host);
    else renderFriends(host);
  }

  function localState() {
    return el('section.card', {},
      emptyState('👥', 'Parties & friends need cloud sync',
        'These are shared between people, so they only work once you sign in with Google. Everything else keeps working locally on this device.'),
      el('div.list-foot', {},
        window.QMAuth && window.QMAuth.available
          ? el('button.btn.primary', {
            onclick: function () { window.QMAuth.signIn().catch(function (e) { toast('Sign-in failed: ' + (e.message || 'unknown'), 'bad'); }); }
          }, 'Sign in with Google')
          : el('p.muted.small', {}, 'Firebase is not configured yet — see js/firebase-config.js.')));
  }

  /* ---- Parties ------------------------------------------------------------ */

  function renderParties(host) {
    var parties = Party.partyList();

    if (!parties.length) {
      host.appendChild(el('div.view-intro', {},
        el('p.muted', {}, 'A party is up to ' + Party.maxMembers + ' crawlers who share a feed. Start one and hand out the code, or join with a code a friend gave you. You can be in as many as you like.')));
    } else {
      parties.forEach(function (p) { host.appendChild(partyCard(p)); });
    }

    host.appendChild(createCard());
    host.appendChild(joinCard());
  }

  function partyCard(p) {
    var code = Party.codeOf(p);
    var members = Party.rosterOf(p);
    return el('section.card.party-card', {},
      el('div.party-banner', {},
        el('div.party-banner-main', {},
          el('div.party-name', {}, p.name || 'The Party'),
          el('div.muted.small', {}, members.length + ' of ' + Party.maxMembers + ' crawlers')),
        el('div.invite-box', {},
          el('span.invite-label', {}, 'Invite code'),
          el('div.invite-code-row', {},
            el('code.invite-code', {}, code),
            el('button.btn.tiny.ghost', { onclick: function (e) { copyText(code, e.target); } }, 'Copy')))),
      el('div.roster', {}, members.map(function (m) {
        return el('div.roster-row' + (m.isMe ? '.me' : ''), {},
          el('div.roster-avatar', {}, (m.name || '?').slice(0, 1).toUpperCase()),
          el('div.roster-main', {},
            el('div.roster-name', {}, m.name,
              m.isMe ? el('span.roster-tag', {}, 'you') : null,
              m.isLeader ? el('span.roster-tag.leader', {}, 'leader') : null),
            el('div.muted.small', {}, 'Level ' + m.level + (m.className ? ' · ' + m.className : ''))));
      })),
      el('div.list-foot', {},
        el('a.btn.tiny.ghost', { href: '#/feed' }, 'Open feed →'),
        el('button.btn.tiny.danger', { onclick: function () { confirmLeave(p); } }, 'Leave')));
  }

  function createCard() {
    var name = textInput('', 'The Royal Roaders');
    name.setAttribute('data-focus-key', 'party-create-name');
    return el('section.card', {},
      el('h3', {}, 'Start a party'),
      field('Party name', name),
      el('div.list-foot', {},
        el('button.btn.primary', {
          onclick: function (e) {
            var btn = e.target; btn.disabled = true;
            Party.createParty(name.value).then(function () { toast('Party created — share the code.'); App.render(); })
              .catch(function (err) { toast(err.message || 'Could not create the party.', 'bad'); btn.disabled = false; });
          }
        }, 'Create party')));
  }

  function joinCard() {
    var code = el('input.input.code-input', { type: 'text', placeholder: 'ABC123', maxlength: 6, 'data-focus-key': 'party-join-code' });
    code.addEventListener('input', function () { code.value = code.value.toUpperCase(); });
    return el('section.card', {},
      el('h3', {}, 'Join a party'),
      field('Invite code', code, 'Six characters, case-insensitive.'),
      el('div.list-foot', {},
        el('button.btn.primary', {
          onclick: function (e) {
            var btn = e.target; btn.disabled = true;
            Party.joinByCode(code.value).then(function () { toast('Joined the party.'); App.render(); })
              .catch(function (err) { toast(err.message || 'Could not join.', 'bad'); btn.disabled = false; });
          }
        }, 'Join')));
  }

  function confirmLeave(p) {
    confirmModal('Leave "' + (p.name || 'this party') + '"?',
      'You will stop seeing its feed and drop off the roster. You can rejoin with the code any time.',
      function () { Party.leaveParty(Party.codeOf(p)).then(function () { toast('You left the party.'); App.render(); }); }, 'Leave');
  }

  /* ---- Friends ------------------------------------------------------------ */

  function renderFriends(host) {
    var myCode = Party.myFriendCode();

    host.appendChild(el('section.card', {},
      el('h3', {}, 'Your friend code'),
      el('p.muted.small', {}, 'Share this so people can add you. Adding a friend lets you see their level and status; add each other to be mutual.'),
      myCode
        ? el('div.invite-code-row', {},
          el('code.invite-code', {}, myCode),
          el('button.btn.tiny.ghost', { onclick: function (e) { copyText(myCode, e.target); } }, 'Copy'))
        : el('p.muted.small', {}, 'Minting your code… reopen this tab in a moment.')));

    var add = el('input.input.code-input', { type: 'text', placeholder: 'FRIEND', maxlength: 6, 'data-focus-key': 'friend-add-code' });
    add.addEventListener('input', function () { add.value = add.value.toUpperCase(); });
    host.appendChild(el('section.card', {},
      el('h3', {}, 'Add a friend'),
      field('Friend code', add),
      el('div.list-foot', {},
        el('button.btn.primary', {
          onclick: function (e) {
            var btn = e.target; btn.disabled = true;
            Party.addFriendByCode(add.value).then(function () { toast('Friend added.'); App.render(); })
              .catch(function (err) { toast(err.message || 'Could not add.', 'bad'); btn.disabled = false; });
          }
        }, 'Add friend'))));

    var friends = Party.friends();
    if (!friends.length) {
      host.appendChild(emptyState('🧑‍🤝‍🧑', 'No friends yet', 'Add someone by their friend code above.'));
      return;
    }

    host.appendChild(el('section.card', {},
      el('h3', {}, 'Friends'),
      el('div.roster', {}, friends.map(function (f) {
        return el('div.roster-row', {},
          el('div.roster-avatar', {}, (f.name || '?').slice(0, 1).toUpperCase()),
          el('div.roster-main', {},
            el('div.roster-name', {}, f.name,
              f.sharesParty ? el('span.roster-tag.leader', {}, 'in your party') : null),
            el('div.muted.small', {}, f.loaded ? ('Level ' + f.level + (f.className ? ' · ' + f.className : '')) : 'loading…')),
          el('button.icon-btn.subtle', { title: 'Remove friend', onclick: function () { confirmRemove(f); } }, '✕'));
      }))));
  }

  function confirmRemove(f) {
    confirmModal('Remove ' + f.name + '?', 'They drop off your friends list. You can add them again with their code.',
      function () { Party.removeFriend(f.uid).then(function () { toast('Removed.'); App.render(); }); }, 'Remove');
  }

  /* ---- Clipboard --------------------------------------------------------- */

  function copyText(text, btn) {
    function done() { if (btn) { var was = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = was; }, 1200); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { toast('Copy failed — code is ' + text, 'bad'); });
    } else { toast('Code: ' + text); }
  }

  return { render: render };
})();
