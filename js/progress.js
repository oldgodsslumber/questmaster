/* Questmaster — progression side effects.
 *
 * Engine computes; this module commits. Everything that can move a character
 * forward (or back) funnels through here so the fanfare, the Chronicle entry
 * and the write all happen together and in one place — otherwise "level up"
 * ends up implemented three slightly different ways.
 *
 * Every function is reversible by passing a negative amount, because the quest
 * view lets you un-check a task and that has to be a true undo.
 */
window.Progress = (function () {

  /* ---- Character XP -------------------------------------------------------- */

  function awardXp(amount, reason) {
    if (!amount) return Promise.resolve(null);
    var c = Store.state.character;
    var next = Engine.grantXp(c, amount);

    return Store.saveCharacter({
      level: next.level,
      xp: next.xp,
      unspentAttributePoints: next.unspentAttributePoints
    }).then(function () {
      if (next.levelsGained > 0) {
        fanfare('Level ' + next.level, '+' + (CONFIG.attributePointsPerLevel * next.levelsGained) + ' attribute points to spend');
        Store.logEvent('level-up',
          'Reached level ' + next.level + '.' + (reason ? ' (' + reason + ')' : '') +
          ' The System awarded ' + (CONFIG.attributePointsPerLevel * next.levelsGained) + ' attribute points.');
      } else if (next.levelsGained < 0) {
        toast('Level fell back to ' + next.level + '.', 'bad');
      }
      return next;
    });
  }

  /* ---- Training ------------------------------------------------------------- */

  /* A task's optional trainingTarget: {kind:'skill'|'attribute', id, xp}. */
  function train(target, multiplier) {
    if (!target || !target.id) return Promise.resolve(null);
    var amount = (target.xp || CONFIG.skillTrainingXpDefault) * (multiplier === undefined ? 1 : multiplier);
    if (!amount) return Promise.resolve(null);

    if (target.kind === 'attribute') return trainAttribute(target.id, amount);
    return trainSkill(target.id, amount);
  }

  function trainSkill(skillId, amount) {
    var skill = Store.find('skills', skillId);
    if (!skill) return Promise.resolve(null);

    var next = Engine.grantSkillXp(skill, amount);
    return Store.update('skills', skillId, { rank: next.rank, xp: next.xp }).then(function () {
      if (next.ranksGained > 0) {
        fanfare(skill.name + ' Rank ' + next.rank, 'Stat advanced');
        Store.logEvent('skill-rank', skill.name + ' advanced to Rank ' + next.rank + '.');
      }
      return next;
    });
  }

  function trainAttribute(attrKey, amount) {
    var c = Store.state.character;
    if (CONFIG.attributeKeys.indexOf(attrKey) === -1) return Promise.resolve(null);

    var pool = Object.assign({}, c.attributeTraining || {});
    var attrs = Object.assign({}, c.attributes || {});
    pool[attrKey] = (pool[attrKey] || 0) + amount;

    var gained = 0;
    var threshold = CONFIG.attributeTrainingThreshold;
    while (pool[attrKey] >= threshold && attrs[attrKey] < CONFIG.attributeMax) {
      pool[attrKey] -= threshold;
      attrs[attrKey] = (attrs[attrKey] || 0) + 1;
      gained++;
    }
    /* Reversal: give the point back if the pool is drained below zero. */
    while (pool[attrKey] < 0 && attrs[attrKey] > 0) {
      pool[attrKey] += threshold;
      attrs[attrKey] -= 1;
      gained--;
    }
    if (pool[attrKey] < 0) pool[attrKey] = 0;
    /* At the cap there is nothing left to convert into, so hold the pool just
     * under a full point rather than letting it balloon invisibly forever. */
    if (attrs[attrKey] >= CONFIG.attributeMax && pool[attrKey] >= threshold) {
      pool[attrKey] = threshold - 1;
    }

    var patch = { attributeTraining: pool };
    if (gained !== 0) patch.attributes = attrs;

    return Store.saveCharacter(patch).then(function () {
      if (gained > 0) {
        fanfare(CONFIG.attributeNames[attrKey] + ' ' + attrs[attrKey], 'Trained through practice');
        Store.logEvent('level-up', CONFIG.attributeNames[attrKey] + ' rose to ' + attrs[attrKey] + ' through repeated practice.');
      }
      return { gained: gained, pool: pool[attrKey] };
    });
  }

  /* ---- Achievements ---------------------------------------------------------- */

  function grantAchievement(data) {
    return Store.add('achievements', Object.assign({ earnedAt: Date.now(), modifiers: [] }, data))
      .then(function (a) {
        fanfare('Achievement', a.name);
        Store.logEvent('achievement', 'Earned the achievement "' + a.name + '".');
        return a;
      });
  }

  /* ---- Quest completion & resets ---------------------------------------------- */

  /* Called after any task toggle. Handles the transition in both directions:
   * completing the last task pays the bonus and extends the streak; un-checking
   * a task after completion takes both back.
   *
   * Solo-only for now. The competitive co-op split (CONFIG.coopBonusTopShare)
   * lands with the party layer, where a second participant can exist — the
   * mechanism is a self-award on each participant's own client, since nobody
   * can write to anyone else's character document. */
  /* Called after a genuine task toggle. The streak and the bonus are gated on a
   * single per-period flag, `completedThisPeriod`, so they move exactly once no
   * matter how many times the last task is checked and unchecked in a window.
   * That flag is what lets structural edits (add/delete a task) reopen or close
   * a quest without ever paying or clawing a bonus a second time — see
   * syncQuestStatus. runResets clears it when a new period opens. */
  function reconcileQuest(quest) {
    var prog = Engine.questProgress(quest.tasks);
    var wasComplete = quest.status === 'completed';

    if (prog.complete && !wasComplete) return completeQuest(quest);
    if (!prog.complete && wasComplete) return uncompleteQuest(quest);
    return Promise.resolve(null);
  }

  function completeQuest(quest) {
    /* Already counted this period — e.g. the quest was completed, a task was
     * added (reopening it), and now that task is done. Mark it complete again
     * but do not pay the bonus or bump the streak twice for one window. */
    if (quest.completedThisPeriod) {
      clearNeglectDebuff(quest.id);
      return Store.updateQuest(quest.id, { status: 'completed', lastCompletedAt: Date.now() });
    }

    var bonus = quest.bonusXp === undefined ? CONFIG.questBonusXpDefault : quest.bonusXp;
    var streak = (quest.streak || 0) + 1;
    var priorBest = quest.bestStreak || 0;
    var best = Math.max(priorBest, streak);
    var newHigh = streak > priorBest;   /* re-hitting an old streak value must not re-fire the milestone */

    /* Finishing a quest lifts any neglect debuff it inflicted and clears its
     * overdue tally, so re-neglecting it later starts fresh. */
    clearNeglectDebuff(quest.id);

    return Store.updateQuest(quest.id, {
      status: 'completed',
      streak: streak,
      bestStreak: best,
      completedThisPeriod: true,
      lastCompletedAt: Date.now(),
      penaltyStepsCharged: 0
    }).then(function () {
      return awardXp(bonus, 'quest bonus: ' + quest.title);
    }).then(function () {
      fanfare('Quest complete', quest.title + ' · +' + bonus + ' bonus XP');
      Store.logEvent('quest-complete',
        'Turned in "' + quest.title + '" for ' + bonus + ' bonus XP.' +
        (streak > 1 ? ' Streak: ' + streak + '.' : ''));

      if (Engine.isStreakMilestone(streak) && newHigh) {
        fanfare(streak + ' in a row', quest.title);
        Store.logEvent('streak', '"' + quest.title + '" hit a ' + streak + '-period streak.');
      }
      /* Party members watching the feed hear about a turn-in, not every checkbox. */
      if (window.Party) Party.autoPost(quest, 'quest-complete', streak);
      /* Turning a quest in earns a loot box, its tier scaled to the quest's
       * size — daily/small chores drop Bronze, bigger quests drop better. */
      if (window.Loot) {
        Loot.awardBoxForQuest(quest).then(function (tier) {
          var meta = Loot.boxMeta(tier);
          fanfare(meta.label + ' earned', 'Open it in your Kit → Boxes tab');
          Store.logEvent('loot-box', 'Earned a ' + meta.label + ' from "' + quest.title + '".');
        }).catch(function (e) { console.warn('[qm] box award failed', e); });
      }
      return { bonus: bonus, streak: streak };
    });
  }

  function uncompleteQuest(quest) {
    /* Only reverse what was actually awarded. If the completion was never
     * counted this period (a structural reopen), there is nothing to claw. */
    if (!quest.completedThisPeriod) {
      return Store.updateQuest(quest.id, { status: 'active', lastCompletedAt: null });
    }

    var bonus = quest.bonusXp === undefined ? CONFIG.questBonusXpDefault : quest.bonusXp;
    var streak = Math.max(0, (quest.streak || 1) - 1);

    return Store.updateQuest(quest.id, {
      status: 'active',
      streak: streak,
      completedThisPeriod: false,
      lastCompletedAt: null
    }).then(function () {
      return awardXp(-bonus, 'quest bonus reverted');
    }).then(function () {
      toast('Quest reopened — bonus XP returned.');
      return null;
    });
  }

  /* For STRUCTURAL changes — adding or deleting a task — not a completion toggle.
   * It brings the quest's status in line with its tasks without ever touching
   * XP, the streak, or the per-period flag. So deleting the last unfinished task
   * no longer pays a phantom bonus, and adding a task to a finished quest no
   * longer claws its streak back. */
  function syncQuestStatus(quest) {
    var prog = Engine.questProgress(quest.tasks);
    var isComplete = quest.status === 'completed';
    if (prog.complete && !isComplete) {
      return Store.updateQuest(quest.id, { status: 'completed' });
    }
    if (!prog.complete && isComplete) {
      return Store.updateQuest(quest.id, { status: 'active' });
    }
    return Promise.resolve(null);
  }

  /* ---- Damage & death ---------------------------------------------------------- */

  /* Reduce current health. Health is normally player-managed on the sheet, so an
   * unset value is read as full — damage always means something. Reaching 0
   * triggers Death (die), the soft reset. */
  function applyDamage(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount <= 0) return Promise.resolve(null);
    var c = Store.state.character;
    var maxHp = Engine.derive(Store.state).maxHealth;
    var res = Object.assign({}, c.resources || {});
    var cur = (res.currentHealth == null) ? maxHp : Math.min(res.currentHealth, maxHp);
    var next = cur - amount;

    if (next <= 0) {
      res.currentHealth = 0;
      return Store.saveCharacter({ resources: res }).then(function () { return die(reason); });
    }
    res.currentHealth = next;
    return Store.saveCharacter({ resources: res }).then(function () {
      toast('−' + amount + ' HP' + (reason ? ' · ' + reason : ''), 'bad');
      return { damage: amount, currentHealth: next };
    });
  }

  /* Death: a SOFT reset. Keep what you invested effort into — attributes, skills,
   * quests, journal, statuses, traits, achievements. Lose the in-game spoils —
   * level, XP, unspent points, items, equipment, unopened boxes. */
  function die(cause) {
    var c = Store.state.character;
    var deaths = (c.deaths || 0) + 1;
    var maxHp = Engine.derive(Store.state).maxHealth;
    var res = Object.assign({}, c.resources || {}, { currentHealth: maxHp });

    var patch = { level: 1, xp: 0, unspentAttributePoints: 0, deaths: deaths, resources: res };
    if (CONFIG.deathBackup) {
      patch.deathBackup = {
        at: Date.now(),
        items: (Store.state.items || []).slice(),
        equipment: (Store.state.equipment || []).slice(),
        lootboxes: (Store.state.lootboxes || []).slice()
      };
    }

    return Store.saveCharacter(patch).then(function () {
      var wipes = [];
      ['items', 'equipment', 'lootboxes'].forEach(function (coll) {
        (Store.state[coll] || []).slice().forEach(function (d) { wipes.push(Store.remove(coll, d.id)); });
      });
      return Promise.all(wipes);
    }).then(function () {
      var fLine = CONFIG.deathFanfareLines[(deaths - 1) % CONFIG.deathFanfareLines.length];
      var aLine = CONFIG.deathAchievementLines[(deaths - 1) % CONFIG.deathAchievementLines.length];

      fanfare('You Died', fLine, CONFIG.deathIconSlug);
      Store.logEvent('death', 'The crawler died' + (cause ? ' (' + cause + ')' : '') +
        ' and was revived at Level 1 — items lost, routine intact. Death #' + deaths + '.');
      showRevivalNotice(deaths);

      /* Broadcast the gravestone to every feed we're in — this is the "post". */
      if (window.Party && Party.available && Party.available() && Party.broadcast) {
        Party.broadcast((c.name || 'A crawler') + ' died. ' + aLine + ' (Death #' + deaths + ')',
          'achievement', { iconSlug: CONFIG.deathIconSlug }).catch(function () {});
      }

      /* The trophy: a cosmetic achievement (no modifiers) that survives death and
       * piles up on the sheet. grantAchievement also logs it. */
      return grantAchievement({
        name: 'R.I.P. — Death #' + deaths,
        description: aLine,
        iconSlug: CONFIG.deathIconSlug
      });
    });
  }

  function showRevivalNotice(deaths) {
    if (typeof openModal !== 'function') return;
    openModal({
      title: 'You Died',
      body: el('div', {},
        (window.Icons && Icons.node) ? el('div.death-mark', {}, Icons.node(CONFIG.deathIconSlug, 'lg')) : null,
        el('p.modal-text', {}, 'Death #' + deaths + '. The System scraped you off the floor and rebooted you.'),
        el('p.modal-text', {}, el('b', {}, 'Kept: '), 'your attributes, stats, quests, journal, statuses and achievements — the whole routine.'),
        el('p.modal-text', {}, el('b', {}, 'Lost: '), 'your level and XP (back to Level 1) and everything in your pack.')),
      actions: [{ label: 'Rise again', kind: 'primary' }]
    });
  }

  /* ---- Neglect debuffs --------------------------------------------------------- */

  function activeNeglectFor(questId) {
    return (Store.state.statuses || []).filter(function (s) {
      return s.sourceQuestId === questId && (!s.expiresAt || s.expiresAt > Date.now());
    })[0] || null;
  }

  /* Apply (or refresh) a quest's neglect debuff. One live debuff per quest:
   * continued neglect extends the expiry rather than stacking a bigger number. */
  function applyNeglectDebuff(quest) {
    var def = Engine.resolveNeglectDebuff(quest);
    if (!def) return Promise.resolve(null);
    var expiresAt = Date.now() + CONFIG.neglectDebuffDurationH * 3600000;

    var existing = activeNeglectFor(quest.id);
    if (existing) return Store.update('statuses', existing.id, { expiresAt: expiresAt });

    return Store.add('statuses', {
      name: def.name,
      description: def.desc,
      polarity: 'debuff',
      iconSlug: def.iconSlug,
      /* Positive value + debuff polarity: the engine flips +1 to −1 for us. */
      modifiers: [{ stat: def.stat, op: 'add', value: 1 }],
      expiresAt: expiresAt,
      appliedAt: Date.now(),
      sourceQuestId: quest.id,
      neglectKey: def.key
    }).then(function (s) {
      Store.logEvent('status-applied', 'Neglecting "' + quest.title + '" inflicted ' + def.name + '.');
      return s;
    });
  }

  /* Finishing (or reopening a completed) quest lifts its neglect debuff. */
  function clearNeglectDebuff(questId) {
    var live = (Store.state.statuses || []).filter(function (s) { return s.sourceQuestId === questId; });
    if (!live.length) return Promise.resolve(null);
    return Promise.all(live.map(function (s) { return Store.remove('statuses', s.id); }));
  }

  /* Charge escalating damage for newly-overdue steps (fromStep, toStep], plus the
   * neglect debuff when a quest first goes overdue. Opt-in via penaltyEnabled. */
  function chargeOverdue(quest, fromStep, toStep, label) {
    if (!quest.penaltyEnabled || toStep <= fromStep) return Promise.resolve(0);
    var dmg = Engine.damageForSteps(quest, fromStep, toStep);
    var first = fromStep === 0 ? applyNeglectDebuff(quest) : Promise.resolve(null);
    return first
      .then(function () { return dmg > 0 ? applyDamage(dmg, (label || 'neglected') + ': ' + quest.title) : null; })
      .then(function () {
        if (dmg > 0) Store.logEvent('quest-penalty', '"' + quest.title + '" is overdue — took ' + dmg + ' damage.');
        return dmg;
      });
  }

  /* ---- Quest failure (manual & auto) ------------------------------------------- */

  /* Manual "Fail": break the streak (always, permanent), and — if damage is on —
   * inflict the neglect debuff plus one base-damage hit for giving up. */
  function failQuest(quest) {
    var priorStreak = quest.streak || 0;
    return Store.updateQuest(quest.id, {
      status: 'failed',
      failedAt: Date.now(),
      failCount: (quest.failCount || 0) + 1,
      streak: 0,
      completedThisPeriod: false
    }).then(function () {
      if (!quest.penaltyEnabled) return null;
      return applyNeglectDebuff(quest).then(function () {
        return applyDamage(Engine.baseStepDamage(quest), 'failed: ' + quest.title);
      });
    }).then(function () {
      fanfare('Quest failed', quest.title);
      Store.logEvent('quest-failed', 'Gave up on "' + quest.title + '".' +
        (priorStreak > 0 ? ' The streak broke at ' + priorStreak + '.' : ''));
      if (window.Party && Party.autoPostFail) Party.autoPostFail(quest, priorStreak);
      return null;
    });
  }

  /* Reopen a failed quest: reactivate it only. Does NOT restore the streak or
   * heal the damage — failing is meant to stick. */
  function reopenFailedQuest(quest) {
    return Store.updateQuest(quest.id, { status: 'active', failedAt: null }).then(function () {
      toast('Quest reopened. Your streak and health stay where they are.');
      return null;
    });
  }

  /* One-off quests never hit runResets, so their deadlines roll here on each load:
   * bill any newly-elapsed overdue steps once, and auto-fail past autoFailSteps. */
  function runDeadlines(now) {
    now = now || Date.now();
    var quests = Store.state.quests.filter(function (q) {
      return q.cadence === 'oneoff' && q.dueAt && q.status !== 'failed' && q.status !== 'archived'
        && !Engine.questProgress(q.tasks).complete;
    });
    if (!quests.length) return Promise.resolve([]);

    return Promise.all(quests.map(function (q) {
      var od = Engine.overdueSteps(q, now);
      var charged = q.penaltyStepsCharged || 0;
      if (od.steps <= charged) return null;   /* not overdue, or already billed */

      return chargeOverdue(q, charged, od.steps)
        .then(function () { return Store.updateQuest(q.id, { penaltyStepsCharged: od.steps }); })
        .then(function () {
          var limit = (q.penalty && q.penalty.autoFailSteps) || CONFIG.penaltyDefaults.autoFailSteps;
          if (limit && od.steps >= limit) {
            Store.logEvent('quest-failed', '"' + q.title + '" was neglected too long and auto-failed.');
            return Store.updateQuest(q.id, { status: 'failed', failedAt: now, failCount: (q.failCount || 0) + 1 });
          }
        })
        .then(function () { return q; });
    })).then(function (r) { return r.filter(Boolean); });
  }

  /* ---- Client-side reset ------------------------------------------------------- */

  /* There is no server and no cron, so periods roll over here: on every load we
   * ask each quest whether its window has closed. A quest completed in the
   * period keeps its streak; one left unfinished breaks it. Missing several
   * periods at once (you didn't open the app for a week) breaks the streak once,
   * not once per period — the punishment is for stopping, not for how long. */
  /* Count how many cadence windows have closed between a quest's due boundary
   * and now, and where the next boundary lands. More than one closed window
   * means the app went unopened across a full period — that period had no
   * completion, so the streak has to break even if the last visible period was
   * finished. Also returns the true next boundary, which for monthly quests can
   * differ from a naive "next after now". */
  function elapsedPeriods(quest, now) {
    var boundary = quest.nextResetAt;
    var count = 0;
    /* Guard against a pathological non-advancing boundary (defensive; the engine
     * fix keeps nextResetAt strictly increasing). */
    var guard = 0;
    while (boundary && boundary <= now && guard < 400) {
      count++;
      var next = Engine.nextResetAt(quest.cadence, boundary, quest);
      if (!next || next <= boundary) { next = now + 1; }
      boundary = next;
      guard++;
    }
    return { periods: count, nextResetAt: boundary };
  }

  function runResets() {
    var now = Date.now();
    var due = Store.state.quests.filter(function (q) { return Engine.needsReset(q, now); });
    if (!due.length) return Promise.resolve([]);

    return Promise.all(due.map(function (q) {
      var wasComplete = q.status === 'completed';
      var wasFailed = q.status === 'failed';   /* already penalized this period */
      var span = elapsedPeriods(q, now);
      /* Keep the streak only if the just-closed period was finished AND no whole
       * period was skipped in a multi-day absence. */
      var keptStreak = (wasComplete && span.periods <= 1) ? (q.streak || 0) : 0;
      var brokeByGap = wasComplete && span.periods > 1 && (q.streak || 0) > 0;
      /* Periods that closed unfinished. If this period was finished, only the
       * EXTRA skipped windows of a long absence count as misses. */
      var missedPeriods = wasComplete ? Math.max(0, span.periods - 1) : span.periods;

      /* A new period wipes the whole task clean — its own done flag AND every
       * subtask's, since subtasks are the steps of a task that repeats with it.
       * Reset a task if it's done OR any of its subtasks are checked. */
      var taskWrites = (q.tasks || []).filter(function (t) {
        return t.done || (t.subtasks || []).some(function (s) { return s.done; });
      }).map(function (t) {
        var patch = { done: false, completedBy: null, completedAt: null };
        if ((t.subtasks || []).some(function (s) { return s.done; })) {
          patch.subtasks = (t.subtasks || []).map(function (s) { return Object.assign({}, s, { done: false }); });
        }
        return Store.updateTask(q.id, t.id, patch);
      });

      return Promise.all(taskWrites).then(function () {
        return Store.updateQuest(q.id, {
          status: 'active',
          streak: keptStreak,
          completedThisPeriod: false,
          nextResetAt: span.nextResetAt,
          lastResetAt: now
        });
      }).then(function () {
        if (brokeByGap) {
          Store.logEvent('streak', '"' + q.title + '" missed a period — the streak broke at ' + (q.streak || 0) + '.');
        } else if (!wasComplete && (q.streak || 0) > 0) {
          Store.logEvent('streak', '"' + q.title + '" reset unfinished — the streak broke at ' + q.streak + '.');
        }
        return null;
      }).then(function () {
        /* Damage + neglect debuff for missed periods (opt-in). The streak break
         * above always happens; this is the extra bite for enabled quests. */
        if (q.penaltyEnabled && missedPeriods > 0 && !wasFailed) {
          return chargeOverdue(q, 0, missedPeriods, 'missed');
        }
        return null;
      }).then(function () { return q; });
    })).then(function (reset) {
      if (reset.length) {
        toast(reset.length + ' quest' + (reset.length === 1 ? '' : 's') + ' rolled over to a new period.');
      }
      return reset;
    });
  }

  return {
    awardXp: awardXp,
    train: train,
    trainSkill: trainSkill,
    trainAttribute: trainAttribute,
    grantAchievement: grantAchievement,
    reconcileQuest: reconcileQuest,
    syncQuestStatus: syncQuestStatus,
    runResets: runResets,
    applyDamage: applyDamage,
    die: die,
    applyNeglectDebuff: applyNeglectDebuff,
    clearNeglectDebuff: clearNeglectDebuff,
    failQuest: failQuest,
    reopenFailedQuest: reopenFailedQuest,
    runDeadlines: runDeadlines
  };
})();
