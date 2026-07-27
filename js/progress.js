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
        fanfare(skill.name + ' Rank ' + next.rank, 'Skill advanced');
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
  function reconcileQuest(quest) {
    var prog = Engine.questProgress(quest.tasks);
    var wasComplete = quest.status === 'completed';

    if (prog.complete && !wasComplete) return completeQuest(quest);
    if (!prog.complete && wasComplete) return uncompleteQuest(quest);
    return Promise.resolve(null);
  }

  function completeQuest(quest) {
    var bonus = quest.bonusXp === undefined ? CONFIG.questBonusXpDefault : quest.bonusXp;
    var streak = (quest.streak || 0) + 1;
    var best = Math.max(quest.bestStreak || 0, streak);

    return Store.updateQuest(quest.id, {
      status: 'completed',
      streak: streak,
      bestStreak: best,
      lastCompletedAt: Date.now()
    }).then(function () {
      return awardXp(bonus, 'quest bonus: ' + quest.title);
    }).then(function () {
      fanfare('Quest complete', quest.title + ' · +' + bonus + ' bonus XP');
      Store.logEvent('quest-complete',
        'Turned in "' + quest.title + '" for ' + bonus + ' bonus XP.' +
        (streak > 1 ? ' Streak: ' + streak + '.' : ''));

      if (Engine.isStreakMilestone(streak)) {
        fanfare(streak + ' in a row', quest.title);
        Store.logEvent('streak', '"' + quest.title + '" hit a ' + streak + '-period streak.');
      }
      return { bonus: bonus, streak: streak };
    });
  }

  function uncompleteQuest(quest) {
    var bonus = quest.bonusXp === undefined ? CONFIG.questBonusXpDefault : quest.bonusXp;
    var streak = Math.max(0, (quest.streak || 1) - 1);

    return Store.updateQuest(quest.id, {
      status: 'active',
      streak: streak,
      lastCompletedAt: null
    }).then(function () {
      return awardXp(-bonus, 'quest bonus reverted');
    }).then(function () {
      toast('Quest reopened — bonus XP returned.');
      return null;
    });
  }

  /* ---- Client-side reset ------------------------------------------------------- */

  /* There is no server and no cron, so periods roll over here: on every load we
   * ask each quest whether its window has closed. A quest completed in the
   * period keeps its streak; one left unfinished breaks it. Missing several
   * periods at once (you didn't open the app for a week) breaks the streak once,
   * not once per period — the punishment is for stopping, not for how long. */
  function runResets() {
    var now = Date.now();
    var due = Store.state.quests.filter(function (q) { return Engine.needsReset(q, now); });
    if (!due.length) return Promise.resolve([]);

    return Promise.all(due.map(function (q) {
      var wasComplete = q.status === 'completed';
      var keptStreak = wasComplete ? (q.streak || 0) : 0;

      var taskWrites = (q.tasks || []).filter(function (t) { return t.done; })
        .map(function (t) { return Store.updateTask(q.id, t.id, { done: false, completedBy: null }); });

      return Promise.all(taskWrites).then(function () {
        return Store.updateQuest(q.id, {
          status: 'active',
          streak: keptStreak,
          nextResetAt: Engine.nextResetAt(q.cadence, now, q),
          lastResetAt: now
        });
      }).then(function () {
        if (wasComplete) return null;
        if ((q.streak || 0) > 0) {
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
    runResets: runResets
  };
})();
