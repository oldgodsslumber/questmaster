/* Questmaster — the party & friends layer (M5).
 *
 * The one place two people touch the same documents, so the one place that
 * subscribes to live snapshots instead of the fetch-once rule the rest of the
 * app follows. A crawler can now belong to several parties at once, and keeps a
 * friends list on the side.
 *
 * Shapes:
 *   parties/{CODE}                 { name, inviteCode, memberUids[], profiles{}, createdBy }
 *   parties/{CODE}/feed/{postId}   a status/turn-in/note
 *   crawlers/{uid}                 public card: { uid, name, level, className, raceName, friendCode }
 *   crawlerCodes/{CODE}            { uid } — friend-code -> uid index
 *   character.partyIds[]           parties this crawler is in (migrated from partyId)
 *   character.friendCode           this crawler's own shareable code
 *   character.friendUids[]         crawlers this one has added
 *
 * A party is keyed by its own invite code, so joining is a direct read of
 * parties/CODE — no query, no index. Friends work the same way through the
 * crawlerCodes index. Everything is cloud-only; local mode reports unavailable
 * and the views render a sign-in prompt.
 */
window.Party = (function () {

  var MAX_MEMBERS = 8;                 /* mirrors firestore.rules */
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  /* no 0/O/1/I ambiguity */

  var parties = {};        /* code -> party doc */
  var feeds = {};          /* code -> [posts] (newest first not guaranteed; combined sorts) */
  var unsubs = {};         /* code -> { party: fn, feed: fn } */
  var friendCards = {};    /* uid -> public crawler card */
  var friendUnsubs = {};   /* uid -> fn */
  var walls = {};          /* uid -> [wall posts]: mine + each friend I follow */
  var wallUnsubs = {};     /* uid -> fn */
  var worldPosts = [];     /* global admin broadcasts (system / AI / world quest) */
  var worldUnsub = null;
  var listeners = [];

  /* ---- Availability & getters -------------------------------------------- */

  function available() { return Store.isCloud() && !!Store.state.character; }
  function myUid() { return Store.uid(); }
  function myChar() { return Store.state.character || {}; }

  function partyList() {
    return Object.keys(parties).map(function (k) { return parties[k]; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }
  function inAnyParty() { return partyList().length > 0; }
  function partyCount() { return partyList().length; }
  function maxMembersOf() { return MAX_MEMBERS; }

  function codeOf(p) { return p ? (p.inviteCode || p.id) : null; }

  /* Roster of one party, resolved from its profiles map, filtered to live
   * members so a stale profile never shows as present. */
  function rosterOf(p) {
    if (!p) return [];
    var profiles = p.profiles || {};
    return (p.memberUids || []).map(function (uid) {
      var pr = profiles[uid] || {};
      return {
        uid: uid,
        name: pr.name || 'Crawler',
        level: pr.level || 1,
        className: pr.className || null,
        raceName: pr.raceName || null,
        isMe: uid === myUid(),
        isLeader: uid === p.createdBy
      };
    });
  }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* view fell away */ } }); }

  function myProfile() {
    var c = myChar();
    return {
      name: c.name || 'Crawler',
      level: c.level || 1,
      className: c.className || null,
      raceName: c.raceName || null
    };
  }

  function genCode() {
    var s = '';
    for (var i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }

  /* ---- Attach / teardown -------------------------------------------------- */

  /* Called after Store.load(). Migrates a legacy single partyId, connects to
   * every party, publishes this crawler's public card, and watches friends. */
  function attach() {
    teardown();
    if (!available()) { emit(); return Promise.resolve(null); }

    var c = myChar();
    var ids = (c.partyIds && c.partyIds.slice()) || [];
    if (!ids.length && c.partyId) {          /* migrate the old single-party field */
      ids = [c.partyId];
      Store.saveCharacter({ partyIds: ids }).catch(function () {});
    }

    ensureIdentity();
    ids.forEach(connectParty);
    watchWall(myUid());                            /* my own wall */
    (c.friendUids || []).forEach(function (uid) { watchFriend(uid); watchWall(uid); });
    watchWorld();                                  /* global admin broadcasts */
    emit();
    return Promise.resolve(null);
  }

  /* Every signed-in crawler follows the one global broadcast stream. */
  function watchWorld() {
    if (worldUnsub) return;
    worldUnsub = Store.subscribeWorld(function (posts) { worldPosts = posts || []; emit(); });
  }

  function teardown() {
    Object.keys(unsubs).forEach(function (code) { dropSubs(code); });
    Object.keys(friendUnsubs).forEach(function (uid) { try { friendUnsubs[uid](); } catch (e) {} });
    Object.keys(wallUnsubs).forEach(function (uid) { try { wallUnsubs[uid](); } catch (e) {} });
    if (worldUnsub) { try { worldUnsub(); } catch (e) {} worldUnsub = null; }
    parties = {}; feeds = {}; unsubs = {}; friendCards = {}; friendUnsubs = {}; walls = {}; wallUnsubs = {}; worldPosts = [];
  }

  function watchWall(uid) {
    if (wallUnsubs[uid]) return;
    wallUnsubs[uid] = Store.subscribeWall(uid, function (posts) { walls[uid] = posts || []; emit(); });
  }
  function unwatchWall(uid) {
    if (wallUnsubs[uid]) { try { wallUnsubs[uid](); } catch (e) {} delete wallUnsubs[uid]; }
    delete walls[uid];
  }
  function detach() { teardown(); }

  function dropSubs(code) {
    var u = unsubs[code];
    if (u) { try { u.party && u.party(); } catch (e) {} try { u.feed && u.feed(); } catch (e) {} }
    delete unsubs[code];
  }
  function dropPartyLocal(code) {
    dropSubs(code);
    delete parties[code];
    delete feeds[code];
  }

  function connectParty(code) {
    if (unsubs[code]) return;
    unsubs[code] = {};
    unsubs[code].party = Store.subscribeParty(code, function (doc) {
      if (!doc || (doc.memberUids && doc.memberUids.indexOf(myUid()) === -1)) {
        /* Party deleted, or we were removed — drop it locally and from our list. */
        dropPartyLocal(code);
        removeFromMyParties(code);
      } else {
        parties[code] = doc;
      }
      emit();
    });
    unsubs[code].feed = Store.subscribeFeed(code, function (posts) {
      feeds[code] = posts;
      emit();
    });
  }

  function removeFromMyParties(code) {
    var ids = (myChar().partyIds || []).filter(function (c) { return c !== code; });
    if (ids.length !== (myChar().partyIds || []).length) {
      Store.saveCharacter({ partyIds: ids }).catch(function () {});
    }
  }

  /* ---- Identity / public card -------------------------------------------- */

  /* Mint or refresh this crawler's friend code. The code is written to our OWN
   * character first — a write we are always allowed to make — so it appears in
   * the Friends tab even if the public-directory writes are blocked (e.g. the
   * new firestore.rules haven't been deployed yet). The directory (the
   * crawlerCodes index + the public card) is then filled in best-effort: adding
   * friends by code needs it, but the code itself still shows. */
  function idxWarn(e) {
    console.warn('[qm] friend-directory write failed — deploy firestore.rules for friends to fully work.', e);
  }

  function ensureIdentity() {
    var c = myChar();
    if (c.friendCode) {
      publishCard(c.friendCode);
      Store.saveCrawlerCode(c.friendCode, { uid: myUid() }).catch(idxWarn);
      return;
    }
    mintCode(4);
  }

  function mintCode(tries) {
    var code = genCode();
    function commit() {
      publishCard(code);
      Store.saveCrawlerCode(code, { uid: myUid() }).catch(idxWarn);
      return Store.saveCharacter({ friendCode: code }).then(emit)
        .catch(function (e) { console.warn('[qm] could not save friend code', e); });
    }
    Store.getCrawlerCode(code).then(function (ex) {
      if (ex && ex.uid && ex.uid !== myUid() && tries > 0) return mintCode(tries - 1);
      return commit();
    }).catch(function () {
      /* Directory read blocked (rules) — still stamp a code on our own character
       * so it appears; the index write is attempted regardless and will land
       * once the rules are deployed. */
      commit();
    });
  }

  function publishCard(code) {
    var p = myProfile();
    Store.saveCrawler(myUid(), {
      uid: myUid(), name: p.name, level: p.level,
      className: p.className, raceName: p.raceName, friendCode: code
    }).catch(function () {});
  }

  function myFriendCode() { return myChar().friendCode || null; }

  /* ---- Parties: create / join / leave ------------------------------------ */

  function addMyParty(code) {
    var ids = (myChar().partyIds || []).slice();
    if (ids.indexOf(code) === -1) ids.push(code);
    return Store.saveCharacter({ partyIds: ids });
  }

  function createParty(name) {
    if (!available()) return Promise.reject(new Error('Parties need cloud sync — sign in with Google first.'));
    var code = genCode();
    var uid = myUid();
    var profiles = {}; profiles[uid] = myProfile();
    var doc = {
      name: (name || '').trim() || 'The Party',
      inviteCode: code, memberUids: [uid], profiles: profiles,
      createdBy: uid, createdAt: Date.now()
    };
    return Store.getParty(code).then(function (existing) {
      if (existing) { code = genCode(); doc.inviteCode = code; }
      return Store.saveParty(code, doc);
    })
      .then(function () { return addMyParty(code); })
      .then(function () { connectParty(code); emit(); return doc; });
  }

  function joinByCode(rawCode) {
    if (!available()) return Promise.reject(new Error('Parties need cloud sync — sign in with Google first.'));
    var code = String(rawCode || '').trim().toUpperCase();
    if (!code) return Promise.reject(new Error('Enter an invite code.'));
    if (parties[code]) return Promise.reject(new Error('You are already in that party.'));
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
      .then(function () { return addMyParty(code); })
      .then(function () { connectParty(code); emit(); return code; });
  }

  function leaveParty(code) {
    var p = parties[code];
    if (!p) return Promise.resolve();
    var uid = myUid();
    var members = (p.memberUids || []).filter(function (u) { return u !== uid; });
    var profiles = Object.assign({}, p.profiles || {});
    delete profiles[uid];

    dropPartyLocal(code);
    return Store.saveParty(code, { memberUids: members, profiles: profiles })
      .then(function () { return removeFromMyParties(code); })
      .then(function () { emit(); });
  }

  /* ---- Feed -------------------------------------------------------------- */

  /* One stream across your parties AND your friends' walls, each post tagged
   * with where it came from. filter is a party code, the string 'friends'
   * (walls only), or null (everything). */
  function combinedFeed(filter) {
    var out = [];
    if (filter === 'friends' || !filter) {
      Object.keys(walls).forEach(function (uid) {
        (walls[uid] || []).forEach(function (p) {
          out.push(Object.assign({ _wallUid: uid, _partyName: 'Friends' }, p));
        });
      });
      /* Global admin broadcasts show in the everything view and the Friends
       * view — they're addressed to the whole crawl, not any one party. */
      worldPosts.forEach(function (p) {
        out.push(Object.assign({ _world: true, _partyName: 'World' }, p));
      });
    }
    if (filter !== 'friends') {
      Object.keys(feeds).forEach(function (code) {
        if (filter && filter !== code) return;
        var pname = parties[code] ? parties[code].name : 'Party';
        (feeds[code] || []).forEach(function (p) {
          out.push(Object.assign({ _partyCode: code, _partyName: pname }, p));
        });
      });
    }
    return out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  /* Post to a destination: 'friends' writes to your own wall (your followers see
   * it); any other value is a party code. Every caller passes one target string,
   * so friends and parties share the same path. */
  function post(body, kind, extra, target) {
    var c = myChar();
    var doc = Object.assign({
      authorUid: myUid(), authorName: c.name || 'Crawler', authorLevel: c.level || 1,
      kind: kind || 'manual', body: body
    }, extra || {});

    if (target === 'friends') {
      if (!available()) return Promise.reject(new Error('Sign in to post to friends.'));
      return Store.addWallPost(myUid(), doc);
    }
    var code = target || (partyCount() === 1 ? codeOf(partyList()[0]) : null);
    if (!code || !parties[code]) return Promise.reject(new Error('Pick a destination to post to.'));
    return Store.addFeedPost(code, doc);
  }

  /* Delete a post given the post object — it knows whether it lives on your wall
   * or in a party feed. */
  function removePost(p) {
    if (!p) return Promise.resolve();
    if (p._wallUid != null) return Store.removeWallPost(p._wallUid, p.id);
    if (p._partyCode) return Store.removeFeedPost(p._partyCode, p.id);
    return Promise.resolve();
  }

  /* Called from Progress.completeQuest. A shared quest broadcasts its turn-in to
   * the single party it was shared with (quest.partyId), if we are still in it. */
  function autoPost(quest, kind, streak) {
    if (!available()) return;
    if (quest.visibility !== 'party' && quest.visibility !== 'shared') return;
    var code = quest.partyId;
    if (!code || !parties[code]) return;
    var name = (myChar().name) || 'A crawler';
    var body = name + ' turned in "' + quest.title + '"' +
      (streak > 1 ? ' — ' + streak + ' in a row. 🔥' : '.');
    post(body, 'quest-complete', { questTitle: quest.title, streak: streak || 0 }, code)
      .catch(function (e) { console.warn('[qm] party auto-post failed', e); });
  }

  /* ---- Friends ----------------------------------------------------------- */

  function watchFriend(uid) {
    if (friendUnsubs[uid]) return;
    friendUnsubs[uid] = Store.subscribeCrawler(uid, function (card) {
      if (card) friendCards[uid] = card;
      emit();
    });
  }

  function sharesPartyWith(uid) {
    return partyList().some(function (p) { return (p.memberUids || []).indexOf(uid) !== -1; });
  }

  function friends() {
    return (myChar().friendUids || []).map(function (uid) {
      var c = friendCards[uid] || {};
      return {
        uid: uid,
        name: c.name || 'Crawler',
        level: c.level || 1,
        className: c.className || null,
        raceName: c.raceName || null,
        friendCode: c.friendCode || null,
        sharesParty: sharesPartyWith(uid),
        loaded: !!friendCards[uid]
      };
    });
  }

  function addFriendByCode(rawCode) {
    if (!available()) return Promise.reject(new Error('Friends need cloud sync — sign in with Google first.'));
    var code = String(rawCode || '').trim().toUpperCase();
    if (!code) return Promise.reject(new Error('Enter a friend code.'));
    if (code === myFriendCode()) return Promise.reject(new Error("That's your own friend code."));
    return Store.getCrawlerCode(code).then(function (idx) {
      if (!idx || !idx.uid) throw new Error('No crawler found for code ' + code + '.');
      var uid = idx.uid;
      var list = (myChar().friendUids || []).slice();
      if (list.indexOf(uid) !== -1) throw new Error('They are already on your friends list.');
      list.push(uid);
      return Store.saveCharacter({ friendUids: list }).then(function () { watchFriend(uid); watchWall(uid); emit(); return uid; });
    });
  }

  function removeFriend(uid) {
    var list = (myChar().friendUids || []).filter(function (u) { return u !== uid; });
    if (friendUnsubs[uid]) { try { friendUnsubs[uid](); } catch (e) {} delete friendUnsubs[uid]; }
    delete friendCards[uid];
    unwatchWall(uid);
    return Store.saveCharacter({ friendUids: list }).then(function () { emit(); });
  }

  /* ---- World broadcasts (read side) -------------------------------------- */

  function worldFeed() { return worldPosts.slice(); }

  /* Has this crawler already added the given World Quest to their own log? We
   * stamp the origin id on the copied quest so the feed can show "Accepted". */
  function hasAcceptedWorldQuest(worldId) {
    return (Store.state.quests || []).some(function (q) { return q.worldQuestId === worldId; });
  }

  /* Opt in to a World Quest: copy the admin's template into this crawler's own
   * quests subcollection, where the normal quest engine tracks and completes it.
   * Idempotent — a second tap is a no-op that just resolves. */
  function acceptWorldQuest(wp) {
    if (!available()) return Promise.reject(new Error('Sign in to accept World Quests.'));
    if (!wp || wp.kind !== 'world-quest') return Promise.reject(new Error('Not a World Quest.'));
    if (hasAcceptedWorldQuest(wp.id)) return Promise.resolve(null);

    var tasks = (wp.tasks && wp.tasks.length ? wp.tasks : [wp.questTitle || wp.title || 'Complete the World Quest']);
    var patch = {
      title: wp.questTitle || wp.title || 'World Quest',
      description: wp.body || '',
      cadence: 'oneoff',
      visibility: 'private',
      bonusXp: wp.xpReward || 0,
      iconSlug: wp.iconSlug || null,
      worldQuestId: wp.id
    };
    patch.nextResetAt = (window.Engine && Engine.nextResetAt) ? Engine.nextResetAt('oneoff', Date.now(), patch) : null;
    return Store.addQuest(patch).then(function (quest) {
      return Promise.all(tasks.map(function (t, i) {
        return Store.addTask(quest.id, {
          title: String(t),
          xpReward: wp.xpReward ? Math.round(wp.xpReward / tasks.length) : CONFIG.xpPerTaskDefault,
          order: i
        });
      })).then(function () { emit(); return quest; });
    });
  }

  return {
    available: available, myUid: myUid,
    onChange: onChange, attach: attach, detach: detach,
    /* parties */
    partyList: partyList, inAnyParty: inAnyParty, partyCount: partyCount,
    rosterOf: rosterOf, codeOf: codeOf, maxMembers: MAX_MEMBERS, maxMembersOf: maxMembersOf,
    createParty: createParty, joinByCode: joinByCode, leaveParty: leaveParty,
    /* feed */
    combinedFeed: combinedFeed, post: post, removePost: removePost, autoPost: autoPost,
    /* friends */
    myFriendCode: myFriendCode, friends: friends, addFriendByCode: addFriendByCode, removeFriend: removeFriend,
    /* world broadcasts */
    worldFeed: worldFeed, acceptWorldQuest: acceptWorldQuest, hasAcceptedWorldQuest: hasAcceptedWorldQuest
  };
})();
