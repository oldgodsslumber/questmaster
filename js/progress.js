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
      return Store.updateQuest(quest.id, { status: 'completed', lastCompletedAt: Date.now() });
    }

    var bonus = quest.bonusXp === undefined ? CONFIG.questBonusXpDefault : quest.bonusXp;
    var streak = (quest.streak || 0) + 1;
    var priorBest = quest.bestStreak || 0;
    var best = Math.max(priorBest, streak);
    var newHigh = streak > priorBest;   /* re-hitting an old streak value must not re-fire the milestone */

    return Store.updateQuest(quest.id, {
      status: 'completed',
      streak: streak,
      bestStreak: best,
      completedThisPeriod: true,
      lastCompletedAt: Date.now()
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
      var span = elapsedPeriods(q, now);
      /* Keep the streak only if the just-closed period was finished AND no whole
       * period was skipped in a multi-day absence. */
      var keptStreak = (wasComplete && span.periods <= 1) ? (q.streak || 0) : 0;
      var brokeByGap = wasComplete && span.periods > 1 && (q.streak || 0) > 0;

      var taskWrites = (q.tasks || []).filter(function (t) { return t.done; })
        .map(function (t) { return Store.updateTask(q.id, t.id, { done: false, completedBy: null, completedAt: null }); });

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
    runResets: runResets
  };
})();
