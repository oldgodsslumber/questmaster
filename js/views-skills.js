/* Questmaster — skills (M3).
 *
 * Skills are XP pools that raise a Rank, capped at 20. The book advances them
 * with an end-of-session d20 checkmark roll; we advance them with XP fed by
 * tasks, for the same reason character levels come from tasks — there is no
 * session to end.
 */
window.ViewSkills = (function () {

  function render(host) {
    var skills = Store.state.skills;

    host.appendChild(el('div.view-intro', {},
      el('p.muted', {}, 'Link a task to a stat and finishing it trains that stat. Ranks cap at ' + CONFIG.skillRankMax + '.')));

    if (!skills.length) {
      host.appendChild(emptyState('📊', 'No stats', 'Your backgrounds should have seeded some. Add one manually if you cleared them out.'));
    }

    skills.slice().sort(function (a, b) {
      return (b.rank || 0) - (a.rank || 0) || String(a.name).localeCompare(b.name);
    }).forEach(function (s) {
      var capped = (s.rank || 0) >= CONFIG.skillRankMax;
      var need = Engine.skillXpForRank(s.rank || 0);
      var pct = capped ? 100 : ((s.xp || 0) / need) * 100;

      /* Which tasks feed this skill — otherwise a skill that never moves looks
       * broken rather than simply unlinked. */
      var feeders = tasksTraining(s.id);

      host.appendChild(el('div.skill-card', {},
        el('div.skill-card-head', { onclick: function () { editSkill(s); } },
          Icons.node(s.iconSlug, 'lg'),
          el('div.skill-card-main', {},
            el('div.skill-name', {}, s.name),
            s.description ? el('div.muted.small', {}, s.description) : null,
            el('div.skill-xp-row', {},
              bar(pct, 'skill'),
              el('span.muted.small', {}, capped ? 'Rank capped' : (s.xp || 0) + ' / ' + need + ' XP'))),
          el('div.skill-rank', {},
            el('span.rank-n', {}, String(s.rank || 0)),
            el('span.rank-word', {}, capped ? 'MAX' : 'Rank'))),
        el('div.skill-card-foot', {},
          feeders.length
            ? el('span.muted.small', {}, 'Trained by: ' + feeders.map(function (f) { return f.title; }).join(', '))
            : el('span.muted.small', {}, 'No task trains this yet.'),
          el('button.btn.tiny.ghost', { onclick: function () { practice(s); } }, 'Log practice'))));
    });

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editSkill(null); } }, 'New stat')));
  }

  function tasksTraining(skillId) {
    var out = [];
    Store.state.quests.forEach(function (q) {
      (q.tasks || []).forEach(function (t) {
        if (t.trainingTarget && t.trainingTarget.kind === 'skill' && t.trainingTarget.id === skillId) {
          out.push({ title: t.title, quest: q.title });
        }
      });
    });
    return out;
  }

  /* An escape hatch for practice that never became a task — you spent an hour
   * on the guitar, nobody needs a checkbox for that. */
  function practice(s) {
    var amount = numInput(CONFIG.skillTrainingXpDefault, 1);
    openModal({
      title: 'Log practice — ' + s.name,
      body: el('div', {},
        el('p.modal-text', {}, 'Add stat XP directly, for practice that did not run through a task.'),
        field('XP', amount)),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Add', kind: 'primary', onClick: function () {
            var n = parseInt(amount.value, 10) || 0;
            if (n <= 0) return false;
            Progress.trainSkill(s.id, n).then(function () { toast('+' + n + ' ' + s.name + ' XP'); App.render(); });
          }
        }
      ]
    });
  }

  function editSkill(s) {
    var isNew = !s;
    var name = textInput(s ? s.name : '', 'Lockpicking');
    var desc = textArea(s ? s.description : '', '', 2);
    var rank = numInput(s ? s.rank || 0 : 0, 0, CONFIG.skillRankMax);
    var iconSlug = s ? s.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (v) { iconSlug = v; });

    /* If you leave the icon blank, save() falls back to the seeded icon for a
     * known skill name — so typing "Stealth" gets you the hood without hunting
     * through 4,229 options. */
    openModal({
      title: isNew ? 'New stat' : 'Edit stat',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Rank', rank, 'Cap ' + CONFIG.skillRankMax)),
        field('Description', desc)),
      actions: (isNew ? [] : [{
        label: 'Delete', kind: 'danger', onClick: function () {
          confirmModal('Delete ' + s.name + '?',
            'Any task training it will keep its link but stop having an effect.',
            function () { Store.remove('skills', s.id).then(App.render); });
        }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              rank: Math.max(0, Math.min(CONFIG.skillRankMax, parseInt(rank.value, 10) || 0)),
              iconSlug: iconSlug || SEED.skillIcons[titleCase(name.value.trim())] || null
            };
            if (isNew) patch.xp = 0;
            var op = isNew ? Store.add('skills', patch) : Store.update('skills', s.id, patch);
            op.then(function () { App.render(); });
          }
        }
      ])
    });
  }

  return { render: render };
})();
