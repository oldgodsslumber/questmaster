/* Questmaster — the rules engine.
 *
 * Pure functions over a character snapshot. Nothing here touches Firestore or
 * the DOM, which is what lets the sheet, the quest view and the build view all
 * agree about what a number means.
 *
 * The central idea: every source of bonuses — equipped gear, active statuses,
 * achievement permanents, race/class traits — emits the same shape:
 *
 *     {stat: 'STR', op: 'add'|'mult', value: 2}
 *
 * so `effective()` never needs to know where a modifier came from. Plain items
 * and spells deliberately emit nothing: items are inert until used, spells are
 * cast rather than worn.
 */
window.Engine = (function () {

  /* Stat keys the sheet knows how to render. A modifier may target any key at
   * all; unrecognised ones surface in the sheet's "Other" block rather than
   * being silently dropped. */
  var KNOWN_STATS = {
    STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
    INT: 'Intelligence', CHA: 'Charisma',
    maxHealth: 'Max Health', maxMana: 'Max Mana', evade: 'Passive Evade',
    aiFavor: 'AI Favor', size: 'Size', slotCapacity: 'Slot Capacity'
  };

  function mod(score) { return CONFIG.scoreToModifier(score); }

  /* ---- Modifier collection --------------------------------------------- */

  /* Everything currently applying to the character, tagged with its origin so
   * the UI can explain *why* a number is what it is. */
  function activeModifiers(state) {
    var out = [];
    var now = Date.now();

    function take(list, sourceKind) {
      (list || []).forEach(function (doc) {
        (doc.modifiers || []).forEach(function (m) {
          if (!m || !m.stat || typeof m.value !== 'number') return;
          out.push({
            stat: m.stat,
            op: m.op === 'mult' ? 'mult' : 'add',
            value: m.value,
            sourceKind: sourceKind,
            sourceName: doc.name || '(unnamed)',
            sourceId: doc.id
          });
        });
      });
    }

    take((state.equipment || []).filter(function (e) { return e.equipped; }), 'equipment');
    take((state.statuses || []).filter(function (s) { return !s.expiresAt || s.expiresAt > now; }), 'status');
    take(state.achievements, 'achievement');
    take(state.traits, 'trait');
    return out;
  }

  /* add before mult, per spec — so a "+2 STR" trinket and a "x1.5 STR" buff
   * compose predictably regardless of the order they were acquired. */
  function applyTo(baseValue, stat, mods) {
    var v = baseValue;
    mods.forEach(function (m) { if (m.stat === stat && m.op === 'add') v += m.value; });
    mods.forEach(function (m) { if (m.stat === stat && m.op === 'mult') v *= m.value; });
    return v;
  }

  /* ---- The main computation --------------------------------------------- */

  /* Returns everything the sheet needs, base and effective side by side. */
  function derive(state) {
    var c = state.character || {};
    var attrs = c.attributes || {};
    var mods = activeModifiers(state);

    var base = {}, eff = {};
    CONFIG.attributeKeys.forEach(function (k) {
      base[k] = attrs[k] || 0;
      eff[k] = Math.round(applyTo(base[k], k, mods));
    });

    var floorLevel = c.floorLevel || CONFIG.defaultFloorLevel;

    /* Derived stats are computed from EFFECTIVE attributes, then run through
     * the modifier pass again — so a "+5 Max Mana" item stacks on top of the
     * INT-derived pool rather than replacing it. */
    var slotCapBase = CONFIG.slotCapacity(mod(eff.CON));
    var slotCapacity = Math.max(1, Math.round(applyTo(slotCapBase, 'slotCapacity', mods)));

    var maxHealthBase = CONFIG.healthSlots * slotCapacity;
    var maxHealth = Math.max(1, Math.round(applyTo(maxHealthBase, 'maxHealth', mods)));

    var maxManaBase = CONFIG.maxMana(eff.INT);
    var maxMana = Math.max(0, Math.round(applyTo(maxManaBase, 'maxMana', mods)));

    var evadeBase = CONFIG.passiveEvade(mod(eff.DEX), floorLevel);
    var evade = Math.round(applyTo(evadeBase, 'evade', mods));

    var size = Math.round(applyTo(c.size || CONFIG.defaultSize, 'size', mods));

    /* Modifiers targeting keys we don't render explicitly — custom stats like
     * the spec's "+2 Focus" trinket. Grouped so the sheet can list them. */
    var custom = {};
    mods.forEach(function (m) {
      if (KNOWN_STATS[m.stat]) return;
      if (!custom[m.stat]) custom[m.stat] = { stat: m.stat, total: 0, sources: [] };
      if (m.op === 'add') custom[m.stat].total += m.value;
      else custom[m.stat].total = custom[m.stat].total * m.value;
      custom[m.stat].sources.push(m);
    });

    return {
      mods: mods,
      base: base,
      effective: eff,
      mods_by_stat: function (stat) {
        return mods.filter(function (m) { return m.stat === stat; });
      },
      modifiers: {
        STR: mod(eff.STR), DEX: mod(eff.DEX), CON: mod(eff.CON),
        INT: mod(eff.INT), CHA: mod(eff.CHA)
      },
      baseModifiers: {
        STR: mod(base.STR), DEX: mod(base.DEX), CON: mod(base.CON),
        INT: mod(base.INT), CHA: mod(base.CHA)
      },
      slotCapacity: slotCapacity,
      slotCapacityBase: slotCapBase,
      maxHealth: maxHealth, maxHealthBase: maxHealthBase,
      maxMana: maxMana, maxManaBase: maxManaBase,
      evade: evade, evadeBase: evadeBase,
      size: size,
      floorLevel: floorLevel,
      custom: Object.keys(custom).map(function (k) { return custom[k]; })
    };
  }

  /* ---- Health slots ------------------------------------------------------ */

  /* The book's health is 10 discrete slots, not a single pool, and the sheet
   * draws them that way. Damage fills the last partially-full slot first. */
  function healthSlots(currentHealth, slotCapacity) {
    var slots = [];
    var remaining = Math.max(0, currentHealth);
    for (var i = 0; i < CONFIG.healthSlots; i++) {
      var inSlot = Math.max(0, Math.min(slotCapacity, remaining));
      slots.push({ index: i, filled: inSlot, capacity: slotCapacity, pct: (inSlot / slotCapacity) * 100 });
      remaining -= inSlot;
    }
    return slots;
  }

  /* ---- Character XP ------------------------------------------------------ */

  function xpForLevel(level) { return CONFIG.xpForLevel(level); }

  /* Awards XP and rolls up as many levels as it covers — a big weekly quest
   * turn-in can legitimately be worth two levels. Returns a delta the caller
   * persists; it does not mutate.
   *
   * `amount` may be negative: un-checking a task has to be able to walk a level
   * back off, or a mis-tap becomes permanent progress. De-leveling reclaims the
   * points the level granted, which can leave `unspentAttributePoints` negative
   * if they were already spent — we clamp at zero and let the player keep the
   * spent point rather than trying to un-allocate an attribute behind their back. */
  function grantXp(character, amount) {
    var level = character.level || 1;
    var xp = (character.xp || 0) + amount;
    var points = character.unspentAttributePoints || 0;
    var levelsGained = 0;

    while (xp < 0 && level > 1) {
      level--;
      xp += xpForLevel(level);
      levelsGained--;
      points -= CONFIG.attributePointsPerLevel;
    }
    if (xp < 0) xp = 0;   /* floor: level 1 with negative XP is not a thing */
    points = Math.max(0, points);

    while (level < CONFIG.levelMax) {
      var need = xpForLevel(level);
      if (xp < need) break;
      xp -= need;
      level++;
      levelsGained++;
      points += CONFIG.attributePointsPerLevel;
    }
    if (level >= CONFIG.levelMax) xp = Math.min(xp, xpForLevel(level) - 1);

    return {
      level: level,
      xp: xp,
      unspentAttributePoints: points,
      levelsGained: levelsGained,
      xpNeeded: xpForLevel(level),
      pct: (xp / xpForLevel(level)) * 100
    };
  }

  /* ---- Skill ranks -------------------------------------------------------- */

  function skillXpForRank(rank) { return CONFIG.skillXpForRank(rank); }

  /* Same contract as grantXp, negatives included. */
  function grantSkillXp(skill, amount) {
    var rank = skill.rank || 0;
    var xp = (skill.xp || 0) + amount;
    var ranksGained = 0;

    while (xp < 0 && rank > 0) {
      rank--;
      xp += skillXpForRank(rank);
      ranksGained--;
    }
    if (xp < 0) xp = 0;

    while (rank < CONFIG.skillRankMax) {
      var need = skillXpForRank(rank);
      if (xp < need) break;
      xp -= need;
      rank++;
      ranksGained++;
    }
    if (rank >= CONFIG.skillRankMax) xp = 0;

    return {
      rank: rank, xp: xp, ranksGained: ranksGained,
      xpNeeded: skillXpForRank(rank),
      pct: rank >= CONFIG.skillRankMax ? 100 : (xp / skillXpForRank(rank)) * 100
    };
  }

  /* ---- Quest cadence & resets -------------------------------------------- */

  /* All boundaries are LOCAL time — a "daily" quest rolls over at the user's
   * midnight, not UTC. There is no server, so this is the only sane reading. */
  function nextResetAt(cadence, from, opts) {
    var d = new Date(from || Date.now());
    opts = opts || {};

    if (cadence === 'daily') {
      var n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
      return n.getTime();
    }
    if (cadence === 'weekly') {
      /* resetWeekday: 0=Sun..6=Sat, default Monday. */
      var target = (opts.resetWeekday === undefined || opts.resetWeekday === null) ? 1 : opts.resetWeekday;
      var delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      var w = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, 0, 0, 0, 0);
      return w.getTime();
    }
    if (cadence === 'monthly') {
      var day = opts.resetDayOfMonth || 1;
      /* Walk forward month by month, clamping the target day into each month's
       * real length, and return the first boundary strictly after `from`. The
       * old version clamped *after* its future-check, so on the last day of a
       * short month a day-31 quest produced a timestamp in the past and reset on
       * every load — this can't, because the clamp happens before the compare. */
      for (var addM = 0; addM < 24; addM++) {
        var y = d.getFullYear();
        var mo = d.getMonth() + addM;                 /* Date normalises month overflow */
        var daysInMonth = new Date(y, mo + 1, 0).getDate();
        var cand = new Date(y, mo, Math.min(day, daysInMonth), 0, 0, 0, 0);
        if (cand.getTime() > d.getTime()) return cand.getTime();
      }
      return null;
    }
    return null; /* one-time quests never reset */
  }

  /* Whether a quest period has lapsed and its tasks should roll over. */
  function needsReset(quest, now) {
    if (!quest || quest.cadence === 'oneoff') return false;
    if (quest.status === 'archived') return false;
    return !!quest.nextResetAt && quest.nextResetAt <= (now || Date.now());
  }

  /* A quest is complete when every task in it is done. Empty quests are not
   * complete — otherwise a freshly created quest would auto-pay its bonus. */
  function questProgress(tasks) {
    var total = (tasks || []).length;
    var done = (tasks || []).filter(function (t) { return t.done; }).length;
    return {
      done: done, total: total,
      pct: total ? (done / total) * 100 : 0,
      complete: total > 0 && done === total
    };
  }

  function isStreakMilestone(streak) {
    return CONFIG.streakMilestones.indexOf(streak) !== -1;
  }

  /* ---- Point-buy (races & classes) --------------------------------------- */

  /* Budget = base (x1.5 if the chosen class is Earth-gated) plus whatever the
   * accepted detriments returned, at the book's two-for-one deficit. */
  function buildBudget(character, traits) {
    var isEarth = !!(character && character.isEarthClass);
    var base = Math.floor(CONFIG.buildPointBudget * (isEarth ? CONFIG.earthClassBudgetMultiplier : 1));

    var detrimentPoints = 0, spent = 0;
    (traits || []).forEach(function (t) {
      var cost = CONFIG.tierCosts[t.tier] || 0;
      if (t.isDetriment) detrimentPoints += cost;
      else spent += cost;
    });
    detrimentPoints = Math.min(detrimentPoints, CONFIG.detrimentPointCap);

    var fromDetriments = Math.floor(detrimentPoints / CONFIG.detrimentDeficit);
    var total = base + fromDetriments;

    return {
      base: base, isEarth: isEarth,
      detrimentPoints: detrimentPoints,
      detrimentCap: CONFIG.detrimentPointCap,
      fromDetriments: fromDetriments,
      total: total, spent: spent,
      remaining: total - spent
    };
  }

  return {
    KNOWN_STATS: KNOWN_STATS,
    mod: mod,
    activeModifiers: activeModifiers,
    derive: derive,
    healthSlots: healthSlots,
    xpForLevel: xpForLevel,
    grantXp: grantXp,
    skillXpForRank: skillXpForRank,
    grantSkillXp: grantSkillXp,
    nextResetAt: nextResetAt,
    needsReset: needsReset,
    questProgress: questProgress,
    isStreakMilestone: isStreakMilestone,
    buildBudget: buildBudget
  };
})();
