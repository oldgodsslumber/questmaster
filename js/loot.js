/* Questmaster — loot rolling & loot boxes.
 *
 * The catalog lives in data-loot.js (window.LOOT). This module turns a loot box
 * into actual inventory: it rolls a rarity from the box tier's weights, pulls a
 * matching item from the catalog, and materializes it as equipment / an item /
 * a granted spell or skill. It also decides which box a completed quest earns.
 *
 * Everything is client-side and manual, like the rest of the app — opening a box
 * is a button, not a background process.
 */
window.Loot = (function () {

  var SLOTS = ['head', 'body', 'hands', 'feet', 'mainHand', 'offHand', 'trinket'];

  function boxMeta(tier) { return CONFIG.lootBoxes.tiers[tier] || CONFIG.lootBoxes.tiers.bronze; }
  function rarityMeta(r) { return CONFIG.rarities[r] || CONFIG.rarities.common; }
  function rarityColor(r) { return rarityMeta(r).color; }
  function rarityLabel(r) { return rarityMeta(r).label; }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* Weighted rarity roll from a box tier's odds table. */
  function rollRarity(weights) {
    var total = 0, r;
    for (r in weights) total += weights[r];
    var n = Math.random() * total, acc = 0;
    for (r in weights) { acc += weights[r]; if (n < acc) return r; }
    return 'common';
  }

  /* Find a catalog entry of a given rarity, degrading gracefully if a pool is
   * empty (e.g. Bronze rolling a rarity the standard-item list doesn't have). */
  function poolFor(rarity) {
    var LOOT = window.LOOT || { equipment: {}, items: [] };
    /* ~22% of drops are standard (non-equippable) loot; the rest is gear. */
    if (Math.random() < 0.22) {
      var it = (LOOT.items || []).filter(function (x) { return x.rarity === rarity; });
      if (it.length) return { kind: 'item', entry: pick(it) };
    }
    var slot = pick(SLOTS);
    var eq = (LOOT.equipment[slot] || []).filter(function (x) { return x.rarity === rarity; });
    if (eq.length) return { kind: 'equipment', entry: pick(eq) };

    var all = [];
    SLOTS.forEach(function (s) { (LOOT.equipment[s] || []).forEach(function (x) { if (x.rarity === rarity) all.push(x); }); });
    if (all.length) return { kind: 'equipment', entry: pick(all) };

    var anyItem = (LOOT.items || []).filter(function (x) { return x.rarity === rarity; });
    if (anyItem.length) return { kind: 'item', entry: pick(anyItem) };
    return null;
  }

  function rollOne(tier) {
    var box = boxMeta(tier);
    for (var t = 0; t < 6; t++) {
      var p = poolFor(rollRarity(box.weights));
      if (p) return p;
    }
    var slot = pick(SLOTS), eq = (window.LOOT.equipment[slot] || []);
    return eq.length ? { kind: 'equipment', entry: pick(eq) } : null;
  }

  /* Turn a rolled catalog entry into a real inventory document, returning a
   * lightweight result for the reveal UI. */
  function materialize(kind, entry) {
    if (kind === 'item') {
      return Store.add('items', {
        name: entry.name, description: entry.desc, iconSlug: entry.icon || null,
        rarity: entry.rarity, quantity: 1, category: entry.category || 'junk'
      }).then(function () {
        return { kind: 'item', name: entry.name, rarity: entry.rarity, desc: entry.desc };
      });
    }

    var desc = entry.desc + (entry.grant && entry.grant.name ? ' — grants ' + entry.grant.name + '.' : '');
    return Store.add('equipment', {
      name: entry.name, slot: entry.slot, description: desc, iconSlug: entry.icon || null,
      rarity: entry.rarity, modifiers: entry.mods || [], equipped: false
    }).then(function () {
      if (entry.grant && entry.grant.name) {
        /* A granted spell/skill becomes a real, usable entry — permanently, once
         * looted (it doesn't vanish when the item is unequipped). */
        var col = entry.grant.type === 'spell' ? 'spells' : 'abilities';
        var doc = {
          name: entry.grant.name,
          description: entry.grant.desc || ('Granted by ' + entry.name + '.'),
          iconSlug: entry.icon || null, rank: 1, effect: null, effectValue: 0
        };
        if (col === 'spells') { doc.manaCost = 2; doc.onCastStatus = null; }
        else { doc.onUseStatus = null; }
        return Store.add(col, doc).then(function () {
          return { kind: 'equipment', name: entry.name, rarity: entry.rarity, desc: entry.desc, slot: entry.slot, grant: entry.grant };
        });
      }
      return { kind: 'equipment', name: entry.name, rarity: entry.rarity, desc: entry.desc, slot: entry.slot };
    });
  }

  /* Open a box: roll its items, drop them into inventory, delete the box, and
   * hand back the results so the caller can show the reveal. */
  function openBox(box) {
    var meta = boxMeta(box.tier || 'bronze');
    var n = meta.rolls[0] + Math.floor(Math.random() * (meta.rolls[1] - meta.rolls[0] + 1));
    var rolls = [];
    for (var i = 0; i < n; i++) { var r = rollOne(box.tier); if (r) rolls.push(r); }

    var results = [];
    var chain = Promise.resolve();
    rolls.forEach(function (r) {
      chain = chain.then(function () { return materialize(r.kind, r.entry).then(function (res) { results.push(res); }); });
    });
    return chain.then(function () { return Store.remove('lootboxes', box.id); }).then(function () { return results; });
  }

  /* Which box a completed quest earns. Daily → Bronze; weekly → Silver (Bronze
   * for tiny ones, Gold for big ones); monthly → Gold/Platinum; one-offs scale
   * with their bonus XP and task count. Bigger quests, better boxes. */
  function boxTierForQuest(q) {
    var bonus = q.bonusXp === undefined ? CONFIG.questBonusXpDefault : q.bonusXp;
    var tasks = (q.tasks || []).length;
    switch (q.cadence) {
      case 'daily': return 'bronze';
      case 'weekly': return (bonus < 50 && tasks < 3) ? 'bronze' : ((bonus >= 150 || tasks >= 6) ? 'gold' : 'silver');
      case 'monthly': return (bonus >= 250 || tasks >= 8) ? 'platinum' : 'gold';
      default:
        if (bonus >= 300 || tasks >= 10) return 'platinum';
        if (bonus >= 150 || tasks >= 6) return 'gold';
        if (bonus >= 50 || tasks >= 3) return 'silver';
        return 'bronze';
    }
  }

  function awardBoxForQuest(q) {
    var tier = boxTierForQuest(q);
    return Store.add('lootboxes', { tier: tier, source: 'quest', sourceTitle: q.title || '', createdAt: Date.now(), opened: false })
      .then(function () { return tier; });
  }

  return {
    rarityColor: rarityColor, rarityLabel: rarityLabel, boxMeta: boxMeta,
    openBox: openBox, boxTierForQuest: boxTierForQuest, awardBoxForQuest: awardBoxForQuest
  };
})();
