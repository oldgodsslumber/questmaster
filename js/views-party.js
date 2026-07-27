/* Questmaster — the Party screen (M5).
 *
 * Create a party or join one with an invite code, see the roster, share the
 * code, and leave. Cloud-only: without Firebase there is no one else to party
 * with, so local mode gets an honest explanation instead of a dead form.
 */
window.ViewParty = (function () {

  function render(host) {
    if (!Store.isCloud()) {
      host.appendChild(localState());
      return;
    }

    if (!Party.inParty()) {
      host.appendChild(el('div.view-intro', {},
        el('p.muted', {}, 'A party is up to ' + Party.maxMembers + ' crawlers who share a feed. Start one and hand out the code, or join with a code a friend gave you.')));
      host.appendChild(createCard());
      host.appendChild(joinCard());
      return;
    }

    host.appendChild(partyCard());
    host.appendChild(rosterCard());
    host.appendChild(el('div.list-foot', {},
      el('a.btn.ghost', { href: '#/feed' }, 'Open the feed →'),
      el('button.btn.danger', { onclick: confirmLeave }, 'Leave party')));
  }

  /* ---- Local-mode fallback ------------------------------------------------ */

  function localState() {
    return el('section.card', {},
      emptyState('👥', 'Parties need cloud sync',
        'Parties and the feed are shared between people, so they only work once you sign in with Google. On this device everything else keeps working locally.'),
      el('div.list-foot', {},
        window.QMAuth && window.QMAuth.available
          ? el('button.btn.primary', {
            onclick: function () {
              window.QMAuth.signIn().catch(function (e) { toast('Sign-in failed: ' + (e.message || 'unknown'), 'bad'); });
            }
          }, 'Sign in with Google')
          : el('p.muted.small', {}, 'Firebase is not configured yet — see js/firebase-config.js. Until then, parties stay offline.')));
  }

  /* ---- No party yet ------------------------------------------------------- */

  function createCard() {
    var name = textInput('', 'The Royal Roaders');
    name.setAttribute('data-focus-key', 'party-create-name');
    return el('section.card', {},
      el('h2', {}, 'Start a party'),
      field('Party name', name, 'You can rename it later by starting over.'),
      el('div.list-foot', {},
        el('button.btn.primary', {
          onclick: function (e) {
            var btn = e.target; btn.disabled = true;
            Party.createParty(name.value).then(function () {
              toast('Party created — share the code.');
              App.render();
            }).catch(function (err) {
              toast(err.message || 'Could not create the party.', 'bad');
              btn.disabled = false;
            });
          }
        }, 'Create party')));
  }

  function joinCard() {
    var code = el('input.input.code-input', { type: 'text', placeholder: 'ABC123', maxlength: 6, 'data-focus-key': 'party-join-code' });
    code.addEventListener('input', function () { code.value = code.value.toUpperCase(); });
    return el('section.card', {},
      el('h2', {}, 'Join a party'),
      field('Invite code', code, 'Six characters, case-insensitive.'),
      el('div.list-foot', {},
        el('button.btn.primary', {
          onclick: function (e) {
            var btn = e.target; btn.disabled = true;
            Party.joinByCode(code.value).then(function () {
              toast('Joined the party.');
              App.render();
            }).catch(function (err) {
              toast(err.message || 'Could not join.', 'bad');
              btn.disabled = false;
            });
          }
        }, 'Join')));
  }

  /* ---- In a party --------------------------------------------------------- */

  function partyCard() {
    var p = Party.current();
    var code = p.inviteCode || p.id;
    return el('section.card.party-banner', {},
      el('div.party-banner-main', {},
        el('div.party-name', {}, p.name || 'The Party'),
        el('div.muted.small', {}, (p.memberUids || []).length + ' of ' + Party.maxMembers + ' crawlers')),
      el('div.invite-box', {},
        el('span.invite-label', {}, 'Invite code'),
        el('div.invite-code-row', {},
          el('code.invite-code', {}, code),
          el('button.btn.tiny.ghost', {
            onclick: function (e) {
              copyText(code, e.target);
            }
          }, 'Copy'))));
  }

  function rosterCard() {
    var members = Party.roster();
    return el('section.card', {},
      el('h2', {}, 'Roster'),
      el('div.roster', {}, members.map(function (m) {
        return el('div.roster-row' + (m.isMe ? '.me' : ''), {},
          el('div.roster-avatar', {}, (m.name || '?').slice(0, 1).toUpperCase()),
          el('div.roster-main', {},
            el('div.roster-name', {}, m.name,
              m.isMe ? el('span.roster-tag', {}, 'you') : null,
              m.isLeader ? el('span.roster-tag.leader', {}, 'leader') : null),
            el('div.muted.small', {}, 'Level ' + m.level +
              (m.className ? ' · ' + m.className : '') +
              (m.raceName ? ' ' + m.raceName : ''))));
      })));
  }

  function confirmLeave() {
    confirmModal('Leave this party?',
      'You will stop seeing the feed and drop off the roster. You can rejoin with the code any time.',
      function () {
        Party.leaveParty().then(function () {
          toast('You left the party.');
          App.render();
        });
      }, 'Leave');
  }

  /* Clipboard with a graceful fallback for browsers that block the async API. */
  function copyText(text, btn) {
    function done() {
      if (btn) { var was = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = was; }, 1200); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { toast('Copy failed — code is ' + text, 'bad'); });
    } else {
      toast('Invite code: ' + text);
    }
  }

  return { render: render };
})();
