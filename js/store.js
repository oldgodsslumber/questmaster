/* Questmaster — data layer.
 *
 * Two interchangeable backends behind one interface:
 *
 *   CloudBackend  Firestore, attached by firebase-config.js once Google auth
 *                 resolves. This is the real one.
 *   LocalBackend  localStorage. Used when Firebase isn't configured yet, so
 *                 the app is fully playable before you touch the console — and
 *                 so a dropped connection degrades to "your own device" rather
 *                 than a white screen.
 *
 * Reads follow the spec's fetch-once rule: on boot we pull the character and
 * every subcollection into `Store.state`, then render from memory and write
 * through. Nothing here subscribes to snapshots; that arrives with the party
 * layer, which is the only place two people can touch the same document.
 */
window.Store = (function () {

  var backend = null;
  var uid = null;

  /* The whole character, in memory. Views read this synchronously. */
  var state = {
    character: null,
    quests: [],        /* each quest carries a .tasks array, loaded with it */
    skills: [],
    equipment: [],
    items: [],
    spells: [],
    statuses: [],
    achievements: [],
    traits: [],
    logbooks: [],
    entries: []        /* entries of the currently-open logbook */
  };

  var SUBCOLLECTIONS = ['skills', 'equipment', 'items', 'spells', 'abilities', 'statuses', 'achievements', 'traits', 'lootboxes'];

  /* ---- Local backend ----------------------------------------------------- */

  function LocalBackend(userKey) {
    var ROOT = 'qm.local.' + userKey;

    function readAll() {
      try { return JSON.parse(localStorage.getItem(ROOT) || '{}'); }
      catch (e) { console.warn('[qm] local store unreadable, starting fresh', e); return {}; }
    }
    function writeAll(db) {
      try { localStorage.setItem(ROOT, JSON.stringify(db)); }
      catch (e) { toast('Local storage is full — cloud sync needed', 'bad'); }
    }
    function key(path) { return path.join('/'); }

    return {
      kind: 'local',
      getDoc: function (path) {
        var db = readAll();
        return Promise.resolve(db[key(path)] ? JSON.parse(JSON.stringify(db[key(path)])) : null);
      },
      setDoc: function (path, data) {
        var db = readAll();
        var k = key(path);
        db[k] = Object.assign({}, db[k] || {}, data);
        writeAll(db);
        return Promise.resolve();
      },
      deleteDoc: function (path) {
        var db = readAll();
        var k = key(path);
        delete db[k];
        /* Cascade: dropping a quest drops its tasks, a logbook its entries. */
        Object.keys(db).forEach(function (other) {
          if (other.indexOf(k + '/') === 0) delete db[other];
        });
        writeAll(db);
        return Promise.resolve();
      },
      listCollection: function (path) {
        var db = readAll();
        var prefix = key(path) + '/';
        var out = [];
        Object.keys(db).forEach(function (k) {
          if (k.indexOf(prefix) !== 0) return;
          var tail = k.slice(prefix.length);
          if (tail.indexOf('/') !== -1) return; /* direct children only */
          out.push(Object.assign({ id: tail }, JSON.parse(JSON.stringify(db[k]))));
        });
        return Promise.resolve(out);
      },
      addDoc: function (path, data) {
        var id = uidgen();
        return this.setDoc(path.concat(id), data).then(function () { return id; });
      },
      /* Local mode has no other players, so live subscription is a no-op that
       * simply hands back the current value once and an unsubscribe that does
       * nothing. The party layer is cloud-only and guards on kind === 'cloud'
       * before ever reaching here. */
      subscribeCollection: function (path, cb) {
        this.listCollection(path).then(cb);
        return function () {};
      },
      subscribeDoc: function (path, cb) {
        this.getDoc(path).then(cb);
        return function () {};
      }
    };
  }

  /* ---- Cloud backend ----------------------------------------------------- */

  function CloudBackend(ctx) {
    var db = ctx.db, fb = ctx.fb;
    function ref(path) { return fb.doc.apply(null, [db].concat(path)); }
    function coll(path) { return fb.collection.apply(null, [db].concat(path)); }

    return {
      kind: 'cloud',
      getDoc: function (path) {
        return fb.getDoc(ref(path)).then(function (snap) {
          return snap.exists() ? snap.data() : null;
        });
      },
      setDoc: function (path, data) {
        return fb.setDoc(ref(path), data, { merge: true });
      },
      deleteDoc: function (path) {
        /* Firestore does not cascade. Sweep known child collections first so a
         * deleted quest doesn't leave orphaned tasks billing storage forever. */
        var self = this;
        var children = path.length === 4 && path[2] === 'quests' ? ['tasks']
          : path.length === 4 && path[2] === 'logbooks' ? ['entries'] : [];
        return Promise.all(children.map(function (child) {
          return self.listCollection(path.concat(child)).then(function (docs) {
            return Promise.all(docs.map(function (d) {
              return fb.deleteDoc(ref(path.concat(child, d.id)));
            }));
          });
        })).then(function () { return fb.deleteDoc(ref(path)); });
      },
      listCollection: function (path) {
        return fb.getDocs(coll(path)).then(function (snap) {
          var out = [];
          snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
          return out;
        });
      },
      addDoc: function (path, data) {
        var id = uidgen();
        return fb.setDoc(ref(path.concat(id)), data).then(function () { return id; });
      },
      /* Live listeners — the party feed and roster are the one place two people
       * touch the same document, so this is where snapshots finally earn their
       * keep. Both return the Firestore unsubscribe function. */
      subscribeCollection: function (path, cb) {
        return fb.onSnapshot(coll(path), function (snap) {
          var out = [];
          snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
          cb(out);
        }, function (e) { console.warn('[qm] feed subscription error', e); });
      },
      subscribeDoc: function (path, cb) {
        return fb.onSnapshot(ref(path), function (snap) {
          cb(snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null);
        }, function (e) { console.warn('[qm] party subscription error', e); });
      }
    };
  }

  function uidgen() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---- Attach / boot ------------------------------------------------------ */

  function attach(userId, ctx) {
    uid = userId;
    backend = ctx ? CloudBackend(ctx) : LocalBackend(userId);
    return backend.kind;
  }

  function detach() { backend = null; uid = null; resetState(); }

  function resetState() {
    state.character = null;
    state.quests = [];
    SUBCOLLECTIONS.forEach(function (k) { state[k] = []; });
    state.logbooks = [];
    state.entries = [];
  }

  function base() { return ['characters', uid]; }

  /* Pull everything. One round of parallel reads, then the app renders from
   * memory until something writes.
   *
   * Every subcollection read is made fault-tolerant: a single denied or failing
   * read defaults to empty instead of rejecting the whole load. Otherwise adding
   * a new subcollection to the code (abilities, lootboxes) would lock out anyone
   * whose deployed firestore.rules predate it — one permission-denied would
   * bounce them straight back to the sign-in screen. Login only needs the
   * character document itself. */
  function load() {
    resetState();
    return backend.getDoc(base()).then(function (char) {
      if (!char) return null;
      state.character = Object.assign({ id: uid }, char);

      function soft(name, promise, onOk) {
        return promise.then(onOk).catch(function (e) {
          console.warn('[qm] could not read "' + name + '" — is firestore.rules deployed? Continuing without it.', e);
        });
      }

      var jobs = SUBCOLLECTIONS.map(function (name) {
        return soft(name, backend.listCollection(base().concat(name)), function (docs) { state[name] = docs; });
      });
      jobs.push(soft('quests', loadQuests()));
      jobs.push(soft('logbooks', backend.listCollection(base().concat('logbooks')), function (docs) { state.logbooks = docs; }));

      return Promise.all(jobs).then(function () {
        sortAll();
        return state.character;
      });
    });
  }

  /* Quests come with their tasks attached — the quest view always needs both,
   * and a quest's task list is small by construction. */
  function loadQuests() {
    return backend.listCollection(base().concat('quests')).then(function (quests) {
      return Promise.all(quests.map(function (q) {
        return backend.listCollection(base().concat('quests', q.id, 'tasks')).then(function (tasks) {
          q.tasks = tasks.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
          return q;
        });
      })).then(function (full) { state.quests = full; });
    });
  }

  function sortAll() {
    function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }
    SUBCOLLECTIONS.forEach(function (k) { state[k].sort(byName); });
    state.quests.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  /* ---- Character --------------------------------------------------------- */

  function createCharacter(data) {
    var doc = Object.assign({ createdAt: Date.now() }, data);
    return backend.setDoc(base(), doc).then(function () {
      state.character = Object.assign({ id: uid }, doc);
      return state.character;
    });
  }

  /* Optimistic: mutate memory, then write. Views re-render off `state`, so a
   * slow network never makes a tap feel dead. */
  function saveCharacter(patch) {
    Object.assign(state.character, patch);
    return backend.setDoc(base(), patch);
  }

  /* ---- Generic subcollection CRUD ---------------------------------------- */

  function add(collectionName, data) {
    var doc = Object.assign({ createdAt: Date.now() }, data);
    return backend.addDoc(base().concat(collectionName), doc).then(function (id) {
      var full = Object.assign({ id: id }, doc);
      state[collectionName].push(full);
      sortAll();
      return full;
    });
  }

  function update(collectionName, id, patch) {
    var doc = find(collectionName, id);
    if (doc) Object.assign(doc, patch);
    return backend.setDoc(base().concat(collectionName, id), patch).then(function () { return doc; });
  }

  function remove(collectionName, id) {
    state[collectionName] = state[collectionName].filter(function (d) { return d.id !== id; });
    return backend.deleteDoc(base().concat(collectionName, id));
  }

  function find(collectionName, id) {
    return (state[collectionName] || []).filter(function (d) { return d.id === id; })[0] || null;
  }

  /* ---- Quests & tasks ----------------------------------------------------- */

  function addQuest(data) {
    var doc = Object.assign({
      createdAt: Date.now(),
      ownerUid: uid,
      status: 'active',
      visibility: 'private',
      shareMode: 'view',
      sharedWith: [],
      partyId: (state.character && state.character.partyId) || null,
      streak: 0,
      bestStreak: 0,
      completedThisPeriod: false,
      lastCompletedAt: null
    }, data);
    return backend.addDoc(base().concat('quests'), doc).then(function (id) {
      var full = Object.assign({ id: id, tasks: [] }, doc);
      state.quests.unshift(full);
      return full;
    });
  }

  function updateQuest(questId, patch) {
    var q = findQuest(questId);
    if (q) Object.assign(q, patch);
    return backend.setDoc(base().concat('quests', questId), patch).then(function () { return q; });
  }

  function removeQuest(questId) {
    state.quests = state.quests.filter(function (q) { return q.id !== questId; });
    return backend.deleteDoc(base().concat('quests', questId));
  }

  function findQuest(questId) {
    return state.quests.filter(function (q) { return q.id === questId; })[0] || null;
  }

  function addTask(questId, data) {
    var q = findQuest(questId);
    var doc = Object.assign({
      done: false,
      completedBy: null,
      xpReward: CONFIG.xpPerTaskDefault,
      trainingTarget: null,
      subtasks: [],
      order: q ? q.tasks.length : 0,
      createdAt: Date.now()
    }, data);
    return backend.addDoc(base().concat('quests', questId, 'tasks'), doc).then(function (id) {
      var full = Object.assign({ id: id }, doc);
      if (q) q.tasks.push(full);
      return full;
    });
  }

  function updateTask(questId, taskId, patch) {
    var q = findQuest(questId);
    var t = q && q.tasks.filter(function (x) { return x.id === taskId; })[0];
    if (t) Object.assign(t, patch);
    return backend.setDoc(base().concat('quests', questId, 'tasks', taskId), patch)
      .then(function () { return t; });
  }

  function removeTask(questId, taskId) {
    var q = findQuest(questId);
    if (q) q.tasks = q.tasks.filter(function (t) { return t.id !== taskId; });
    return backend.deleteDoc(base().concat('quests', questId, 'tasks', taskId));
  }

  /* ---- Journal ------------------------------------------------------------ */

  function ensureDefaultLogbook() {
    var existing = state.logbooks.filter(function (l) { return l.isDefault; })[0];
    if (existing) return Promise.resolve(existing);
    var doc = { name: CONFIG.defaultLogbookName, isDefault: true, createdAt: Date.now() };
    return backend.addDoc(base().concat('logbooks'), doc).then(function (id) {
      var full = Object.assign({ id: id }, doc);
      state.logbooks.push(full);
      return full;
    });
  }

  function addLogbook(name) {
    var doc = { name: name, isDefault: false, createdAt: Date.now() };
    return backend.addDoc(base().concat('logbooks'), doc).then(function (id) {
      var full = Object.assign({ id: id }, doc);
      state.logbooks.push(full);
      return full;
    });
  }

  function removeLogbook(id) {
    state.logbooks = state.logbooks.filter(function (l) { return l.id !== id; });
    return backend.deleteDoc(base().concat('logbooks', id));
  }

  function loadEntries(logbookId) {
    return backend.listCollection(base().concat('logbooks', logbookId, 'entries')).then(function (docs) {
      state.entries = docs.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      return state.entries;
    });
  }

  function addEntry(logbookId, data) {
    var doc = Object.assign({ createdAt: Date.now(), postedToParty: false }, data);
    return backend.addDoc(base().concat('logbooks', logbookId, 'entries'), doc).then(function (id) {
      return Object.assign({ id: id }, doc);
    });
  }

  function removeEntry(logbookId, entryId) {
    state.entries = state.entries.filter(function (e) { return e.id !== entryId; });
    return backend.deleteDoc(base().concat('logbooks', logbookId, 'entries', entryId));
  }

  /* System-written events land in the default logbook. Fire-and-forget: an
   * auto-log failing must never block the action that caused it. */
  function logEvent(eventType, body) {
    return ensureDefaultLogbook().then(function (book) {
      return addEntry(book.id, { kind: 'auto', eventType: eventType, body: body });
    }).catch(function (e) { console.warn('[qm] auto-log failed', eventType, e); });
  }

  /* ---- Party layer (top-level docs, cloud-only) --------------------------- */

  /* Parties live outside the per-character tree, so these take absolute paths
   * rather than going through base(). Party documents are keyed by their own
   * invite code, which makes joining a direct read instead of a query — no
   * composite index, no `where`, just get(parties/CODE). */
  function isCloud() { return !!backend && backend.kind === 'cloud'; }

  function getParty(partyId) { return backend.getDoc(['parties', partyId]); }
  function saveParty(partyId, data) { return backend.setDoc(['parties', partyId], data); }
  function deleteParty(partyId) { return backend.deleteDoc(['parties', partyId]); }
  function subscribeParty(partyId, cb) { return backend.subscribeDoc(['parties', partyId], cb); }

  function addFeedPost(partyId, data) {
    var doc = Object.assign({ createdAt: Date.now() }, data);
    return backend.addDoc(['parties', partyId, 'feed'], doc).then(function (id) {
      return Object.assign({ id: id }, doc);
    });
  }
  function listFeed(partyId) { return backend.listCollection(['parties', partyId, 'feed']); }
  function removeFeedPost(partyId, postId) { return backend.deleteDoc(['parties', partyId, 'feed', postId]); }
  function subscribeFeed(partyId, cb) { return backend.subscribeCollection(['parties', partyId, 'feed'], cb); }

  /* Public crawler directory — friend cards keyed by uid, plus a CODE -> uid
   * index so "add by friend code" is a direct read. Both are top-level. */
  function getCrawler(cuid) { return backend.getDoc(['crawlers', cuid]); }
  function saveCrawler(cuid, data) { return backend.setDoc(['crawlers', cuid], data); }
  function subscribeCrawler(cuid, cb) { return backend.subscribeDoc(['crawlers', cuid], cb); }
  function getCrawlerCode(code) { return backend.getDoc(['crawlerCodes', code]); }
  function saveCrawlerCode(code, data) { return backend.setDoc(['crawlerCodes', code], data); }

  /* Personal wall — where "post to friends" lands. crawlers/{uid}/feed. */
  function addWallPost(cuid, data) {
    var doc = Object.assign({ createdAt: Date.now() }, data);
    return backend.addDoc(['crawlers', cuid, 'feed'], doc).then(function (id) { return Object.assign({ id: id }, doc); });
  }
  function removeWallPost(cuid, postId) { return backend.deleteDoc(['crawlers', cuid, 'feed', postId]); }
  function subscribeWall(cuid, cb) { return backend.subscribeCollection(['crawlers', cuid, 'feed'], cb); }

  /* World broadcasts — a single top-level 'world' collection every signed-in
   * crawler can read, but only an admin (enforced in firestore.rules by email)
   * may write. System messages, AI-world messages, and World Quests all live
   * here, distinguished by their `kind`. This is the one truly global stream. */
  function addWorldPost(data) {
    var doc = Object.assign({ createdAt: Date.now() }, data);
    return backend.addDoc(['world'], doc).then(function (id) { return Object.assign({ id: id }, doc); });
  }
  function removeWorldPost(postId) { return backend.deleteDoc(['world', postId]); }
  function listWorld() { return backend.listCollection(['world']); }
  function subscribeWorld(cb) { return backend.subscribeCollection(['world'], cb); }

  return {
    state: state,
    attach: attach, detach: detach, load: load, loadQuests: loadQuests,
    kind: function () { return backend ? backend.kind : null; },
    uid: function () { return uid; },
    createCharacter: createCharacter, saveCharacter: saveCharacter,
    add: add, update: update, remove: remove, find: find,
    addQuest: addQuest, updateQuest: updateQuest, removeQuest: removeQuest, findQuest: findQuest,
    addTask: addTask, updateTask: updateTask, removeTask: removeTask,
    ensureDefaultLogbook: ensureDefaultLogbook, addLogbook: addLogbook, removeLogbook: removeLogbook,
    loadEntries: loadEntries, addEntry: addEntry, removeEntry: removeEntry, logEvent: logEvent,
    isCloud: isCloud,
    getParty: getParty, saveParty: saveParty, deleteParty: deleteParty, subscribeParty: subscribeParty,
    addFeedPost: addFeedPost, listFeed: listFeed, removeFeedPost: removeFeedPost, subscribeFeed: subscribeFeed,
    getCrawler: getCrawler, saveCrawler: saveCrawler, subscribeCrawler: subscribeCrawler,
    getCrawlerCode: getCrawlerCode, saveCrawlerCode: saveCrawlerCode,
    addWallPost: addWallPost, removeWallPost: removeWallPost, subscribeWall: subscribeWall,
    addWorldPost: addWorldPost, removeWorldPost: removeWorldPost, listWorld: listWorld, subscribeWorld: subscribeWorld
  };
})();
