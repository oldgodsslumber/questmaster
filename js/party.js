/* Questmaster — the party layer (M5).
 *
 * This is the one part of the app where two people touch the same documents, so
 * it is also the one place that subscribes to live snapshots instead of the
 * fetch-once-and-render-from-memory rule the rest of the app follows. A party is
 * a top-level Firestore document keyed by its own invite code — joining is a
 * direct read of parties/CODE, which is why there is no query, no index, and no
 * `where` anywhere in here.
 *
 * Everything is cloud-only. In local mode `available()` is false and the Party
 * and Feed views render a "sign in to play with others" state rather than
 * anything broken — nobody else exists on a single device.
 */
window.Party = (function () {

  var MAX_MEMBERS = 8;                 /* mirrors firestore.rules */
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  /* no 0/O/1/I ambiguity */

  var party = null;                    /* current party doc, or null */
  var feed = [];                       /* feed posts, newest first */
  var unsubParty = null, unsubFeed = null;
  var listeners = [];

  /* ---- Availability & getters -------------------------------------------- */

  function available() { return Store.isCloud() && !!Store.state.character; }
  function inParty() { return !!party; }
  function current() { return party; }
  function feedPosts() { return feed; }
  function myUid() { return Store.uid(); }

  /* Roster resolved from the profiles map, filtered to the live member list so a
   * stale profile left behind by someone who bailed never shows as present. */
  function roster() {
    if (!party) return [];
    var profiles = party.profiles || {};
    return (party.memberUids || []).map(function (uid) {
      var p = profiles[uid] || {};
      return {
        uid: uid,
        name: p.name || 'Crawler',
        level: p.level || 1,
        className: p.className || null,
        raceName: p.raceName || null,
        isMe: uid === myUid(),
        isLeader: uid === party.createdBy
      };
    });
  }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* view fell away */ } }); }

  function myProfile() {
    var c = Store.state.character || {};
    return {
      name: c.name || 'Crawler',
      level: c.level || 1,
      className: c.className || null,
      raceName: c.raceName || null
    };
  }

  function genCode() {
    var s = '';
    for (var i = 0; i < 6; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  }

  /* ---- Attach / connect -------------------------------------------------- */

  /* Called after Store.load(): reconnect to whatever party the character belongs
   * to. Safe to call in local mode — it just clears out and returns. */
  function attach() {
    detachLive();
    party = null; feed = [];
    var c = Store.state.character;
    if (!available() || !c || !c.partyId) { emit(); return Promise.resolve(null); }
    return connect(c.partyId, true);
  }

  function connect(partyId, refreshProfile) {
    detachLive();

    unsubParty = Store.subscribeParty(partyId, function (doc) {
      if (!doc || (doc.memberUids && doc.memberUids.indexOf(myUid()) === -1)) {
        /* The party was deleted, or we were removed from the roster — drop the
         * link so we don't keep trying to read a party we can't see. */
        party = null;
        detachLive();
        Store.saveCharacter({ partyId: null });
      } else {
        party = doc;
      }
      emit();
    });

    unsubFeed = Store.subscribeFeed(partyId, function (posts) {
      feed = posts.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      emit();
    });

    /* Push a fresh profile once on connect so a level or class change since the
     * last session propagates to everyone's roster. Fire-and-forget. */
    if (refreshProfile) {
      var p = {}; p[myUid()] = myProfile();
      Store.saveParty(partyId, { profiles: p }).catch(function () {});
    }

    return Promise.resolve(party);
  }

  function detachLive() {
    if (unsubParty) { try { unsubParty(); } catch (e) {} unsubParty = null; }
    if (unsubFeed) { try { unsubFeed(); } catch (e) {} unsubFeed = null; }
  }

  /* Full teardown on sign-out. */
  function detach() { detachLive(); party = null; feed = []; }

  /* ---- Create / join / leave --------------------------------------------- */

  function createParty(name) {
    if (!available()) return Promise.reject(new Error('Parties need cloud sync — sign in with Google first.'));
    var code = genCode();
    var uid = myUid();
    var profiles = {}; profiles[uid] = myProfile();
    var doc = {
      name: (name || '').trim() || 'The Party',
      inviteCode: code,
      memberUids: [uid],
      profiles: profiles,
      createdBy: uid,
      createdAt: Date.now()
    };
    /* Guard against the rare code collision by refusing to clobber an existing
     * party document. */
    return Store.getParty(code).then(function (existing) {
      if (existing) { code = genCode(); doc.inviteCode = code; }
      return Store.saveParty(code, doc);
    })
      .then(function () { return Store.saveCharacter({ partyId: code }); })
      .then(function () { return connect(code, false); })
      .then(function () { return doc; });
  }

  function joinByCode(rawCode) {
    if (!available()) return Promise.reject(new Error('Parties need cloud sync — sign in with Google first.'));
    var code = String(rawCode || '').trim().toUpperCase();
    if (!code) return Promise.reject(new Error('Enter an invite code.'));
    var uid = myUid();

    return Store.getParty(code).then(function (doc) {
      if (!doc) throw new Error('No party found for code ' + code + '.');
      var members = (doc.memberUids || []).slice();
      if (members.indexOf(uid) === -1) {
        if (members.length >= MAX_MEMBERS) throw new Error('That party is full (' + MAX_MEMBERS + ' max).');
        members.push(uid);
      }
      var profiles = Object.assign({}, doc.profiles || {});
      profiles[uid] = myProfile();
      return Store.saveParty(code, { memberUids: members, profiles: profiles });
    })
      .then(function () { return Store.saveCharacter({ partyId: code }); })
      .then(function () { return connect(code, false); })
      .then(function () { return code; });
  }

  function leaveParty() {
    if (!party) return Promise.resolve();
    var code = party.inviteCode || party.id;
    var uid = myUid();
    var members = (party.memberUids || []).filter(function (u) { return u !== uid; });
    var profiles = Object.assign({}, party.profiles || {});
    delete profiles[uid];   /* merge won't drop the map key, but roster() filters by memberUids anyway */

    detachLive();
    party = null; feed = [];
    /* Even the last member just empties the roster — rules forbid deleting a
     * party document outright, and an empty one is harmless. */
    return Store.saveParty(code, { memberUids: members, profiles: profiles })
      .then(function () { return Store.saveCharacter({ partyId: null }); })
      .then(function () { emit(); });
  }

  /* ---- Feed posts -------------------------------------------------------- */

  function post(body, kind, extra) {
    if (!party) return Promise.reject(new Error('You are not in a party.'));
    var code = party.inviteCode || party.id;
    var c = Store.state.character || {};
    var doc = Object.assign({
      authorUid: myUid(),
      authorName: c.name || 'Crawler',
      authorLevel: c.level || 1,
      kind: kind || 'manual',
      body: body
    }, extra || {});
    return Store.addFeedPost(code, doc);
  }

  function removePost(postId) {
    if (!party) return Promise.resolve();
    return Store.removeFeedPost(party.inviteCode || party.id, postId);
  }

  /* Called from Progress.completeQuest. Only quests the player has actually
   * shared with the party get broadcast — a private quest stays private, so
   * turning sharing on is how you opt a quest's turn-ins into the feed. */
  function autoPost(quest, kind, streak) {
    if (!party || !available()) return;
    if (quest.visibility !== 'party' && quest.visibility !== 'shared') return;
    var name = (Store.state.character && Store.state.character.name) || 'A crawler';
    var body = name + ' turned in "' + quest.title + '"' +
      (streak > 1 ? ' — ' + streak + ' in a row. 🔥' : '.');
    post(body, 'quest-complete', { questTitle: quest.title, streak: streak || 0 })
      .catch(function (e) { console.warn('[qm] party auto-post failed', e); });
  }

  return {
    available: available, inParty: inParty, current: current,
    roster: roster, feedPosts: feedPosts, myUid: myUid,
    onChange: onChange,
    attach: attach, detach: detach,
    createParty: createParty, joinByCode: joinByCode, leaveParty: leaveParty,
    post: post, removePost: removePost, autoPost: autoPost,
    maxMembers: MAX_MEMBERS
  };
})();
