/* Questmaster — quests & tasks (M2).
 *
 * The quest is the unit that matters: it carries the cadence, all its tasks
 * reset together, and the streak lives on it rather than on any individual
 * task. A quest auto-completes the moment its last task is checked, paying a
 * bonus on top of the per-task XP.
 *
 * Nothing floats loose — a quick-add spins up a one-time, single-task quest, so
 * "buy milk" and "Morning Routine" are the same shape underneath.
 */
window.ViewQuests = (function () {

  var expanded = {};       /* questId -> bool, survives re-renders */
  var showArchived = false;

  function render(host) {
    host.appendChild(quickAdd());

    var quests = Store.state.quests.filter(function (q) {
      return showArchived ? q.status === 'archived' : q.status !== 'archived';
    });

    if (!quests.length) {
      host.appendChild(emptyState('🗺️',
        showArchived ? 'Nothing archived' : 'No quests yet',
        showArchived ? null : 'Type something above to quick-add, or use New Quest for one with a cadence.'));
    }

    CONFIG.cadences.forEach(function (cadence) {
      var group = quests.filter(function (q) { return q.cadence === cadence; });
      if (!group.length) return;

      /* Unfinished first — the point of opening this view is to see what's left. */
      group.sort(function (a, b) {
        var ap = Engine.questProgress(a.tasks), bp = Engine.questProgress(b.tasks);
        if (ap.complete !== bp.complete) return ap.complete ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      host.appendChild(el('div.quest-group', {},
        el('div.group-head', {},
          el('h2', {}, CONFIG.cadenceLabels[cadence]),
          el('span.group-count', {}, group.length)),
        group.map(questCard)));
    });

    host.appendChild(el('div.quest-foot', {},
      el('button.btn.primary', { onclick: function () { editQuest(null); } }, 'New Quest'),
      el('button.btn.ghost', {
        onclick: function () { showArchived = !showArchived; App.render(); }
      }, showArchived ? 'Show active' : 'Show archived')));
  }

  /* ---- Quick add -------------------------------------------------------------- */

  function quickAdd() {
    var input = el('input.input', {
      type: 'text',
      placeholder: 'Quick-add a task…',
      'data-focus-key': 'quests-quickadd',
      onkeydown: function (e) { if (e.key === 'Enter') go(); }
    });

    function go() {
      var title = input.value.trim();
      if (!title) return;
      input.value = '';
      /* Wrapped in a one-time quest so the data model has no special case for
       * a "loose" task. It just happens to be a quest of one. */
      Store.addQuest({
        title: title,
        description: '',
        cadence: 'oneoff',
        bonusXp: 0,
        nextResetAt: null,
        iconSlug: null,
        quickAdd: true
      }).then(function (q) {
        return Store.addTask(q.id, { title: title, xpReward: CONFIG.xpPerTaskDefault });
      }).then(function () {
        toast('Added.');
        App.render();
      });
    }

    return el('div.quick-add', {}, input, el('button.btn.primary', { onclick: go }, 'Add'));
  }

  /* ---- Quest card -------------------------------------------------------------- */

  function questCard(q) {
    var prog = Engine.questProgress(q.tasks);
    var open = !!expanded[q.id];
    var complete = prog.complete;

    var head = el('div.quest-head', {
      onclick: function () { expanded[q.id] = !open; App.render(); }
    },
      Icons.node(q.iconSlug, 'lg'),
      el('div.quest-main', {},
        el('div.quest-title-row', {},
          el('span.quest-title', {}, q.title),
          q.streak > 0 ? el('span.streak', { title: 'Best: ' + (q.bestStreak || q.streak) }, '🔥 ' + q.streak) : null,
          el('span.vis-badge.' + (q.visibility || 'private'), { title: visTitle(q) }, visLabel(q))),
        q.description ? el('div.quest-desc', {}, q.description) : null,
        el('div.quest-progress', {},
          bar(prog.pct, complete ? 'done' : 'quest'),
          el('span.quest-count', {}, prog.total ? prog.done + '/' + prog.total : 'no tasks'))),
      el('div.quest-side', {},
        complete ? el('span.done-chip', {}, '✓') : null,
        el('span.caret' + (open ? '.open' : ''), {}, '▾')));

    var card = el('section.quest-card' + (complete ? '.complete' : '') + (open ? '.open' : ''), {}, head);

    if (q.nextResetAt) {
      card.appendChild(el('div.reset-banner', {},
        'Resets ' + fmtUntil(q.nextResetAt) +
        (complete ? ' — done for this period.' : prog.total ? ' — ' + (prog.total - prog.done) + ' left.' : '')));
    }

    if (open) {
      var hasTasks = (q.tasks || []).length;
      var listEl = el('div.task-list', {},
        hasTasks
          ? q.tasks.map(function (t) { return taskRow(q, t); })
          : el('p.muted.small.pad', {}, 'This quest has no tasks yet. Add one below.'));
      card.appendChild(listEl);
      if (hasTasks) enableTaskDrag(listEl, q);

      card.appendChild(el('div.quest-actions', {},
        el('button.btn.tiny.primary', { onclick: function () { editTask(q, null); } }, 'Add task'),
        el('button.btn.tiny.ghost', { onclick: function () { editQuest(q); } }, 'Edit quest'),
        q.status === 'archived'
          ? el('button.btn.tiny.ghost', { onclick: function () { setArchived(q, false); } }, 'Restore')
          : el('button.btn.tiny.ghost', { onclick: function () { setArchived(q, true); } }, 'Archive'),
        el('button.btn.tiny.danger', { onclick: function () { deleteQuest(q); } }, 'Delete')));
    }

    return card;
  }

  function visLabel(q) {
    if (q.visibility === 'party') return 'Party';
    if (q.visibility === 'shared') return q.shareMode === 'coop' ? 'Co-op' : 'Shared';
    return 'Private';
  }
  function visTitle(q) {
    if (q.visibility === 'private') return 'Only you can see this quest.';
    return 'Visible to ' + (q.visibility === 'party' ? 'your party' : 'chosen members') +
      ' — ' + (q.shareMode === 'coop' ? 'they can complete tasks' : 'view only') + '.';
  }

  /* ---- Task row ---------------------------------------------------------------- */

  function taskRow(q, t) {
    var subs = t.subtasks || [];
    var subsDone = subs.filter(function (st) { return st.done; }).length;

    var handle = el('span.drag-handle', { title: 'Drag to reorder', 'aria-label': 'Drag to reorder' }, '⠿');

    var row = el('div.task-row' + (t.done ? '.done' : ''), {},
      handle,
      el('button.check' + (t.done ? '.on' : ''), {
        'aria-label': t.done ? 'Mark undone' : 'Mark done',
        onclick: function () { toggleTask(q, t); }
      }, t.done ? '✓' : ''),
      el('div.task-main', {
        onclick: function () { editTask(q, t); }
      },
        el('div.task-title', {}, t.title),
        el('div.task-meta', {},
          el('span.xp-chip', {}, '+' + (t.xpReward || 0) + ' XP'),
          t.trainingTarget && t.trainingTarget.id ? el('span.train-chip', {}, trainLabel(t.trainingTarget)) : null,
          subs.length ? el('span.muted.small', {}, subsDone + '/' + subs.length + ' subtasks') : null)),
      el('button.icon-btn.subtle', {
        title: 'Delete task',
        onclick: function () { deleteTask(q, t); }
      }, '✕'));

    var node = !subs.length ? row : el('div.task-block', {}, row,
      el('div.subtask-list', {}, subs.map(function (st, i) {
        return el('div.subtask' + (st.done ? '.done' : ''), {},
          el('button.check.sm' + (st.done ? '.on' : ''), {
            onclick: function () { toggleSubtask(q, t, i); }
          }, st.done ? '✓' : ''),
          el('span', {}, st.title));
      })));

    node.setAttribute('data-task-id', t.id);
    node._dragHandle = handle;   /* enableTaskDrag wires this handle to move node */
    return node;
  }

  /* Pointer-based drag reorder — works with touch and mouse. Only the handle
   * starts a drag (so tapping a row still edits it); the node follows the
   * pointer by re-inserting among its siblings, and the new order is written to
   * each task's `order` on drop. */
  function enableTaskDrag(listEl, q) {
    var items = Array.prototype.slice.call(listEl.querySelectorAll(':scope > [data-task-id]'));
    items.forEach(function (node) {
      var handle = node._dragHandle;
      if (!handle) return;
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        node.classList.add('dragging');

        function onMove(ev) {
          var y = ev.clientY;
          var sibs = Array.prototype.slice.call(listEl.querySelectorAll(':scope > [data-task-id]'))
            .filter(function (n) { return n !== node; });
          var before = null;
          for (var i = 0; i < sibs.length; i++) {
            var r = sibs[i].getBoundingClientRect();
            if (y < r.top + r.height / 2) { before = sibs[i]; break; }
          }
          if (before) listEl.insertBefore(node, before);
          else listEl.appendChild(node);
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          node.classList.remove('dragging');
          commitTaskOrder(listEl, q);
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    });
  }

  /* Read the DOM order back into q.tasks and persist each task's index. */
  function commitTaskOrder(listEl, q) {
    var ids = Array.prototype.slice.call(listEl.querySelectorAll(':scope > [data-task-id]'))
      .map(function (n) { return n.getAttribute('data-task-id'); });
    var byId = {};
    (q.tasks || []).forEach(function (t) { byId[t.id] = t; });
    var ordered = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    (q.tasks || []).forEach(function (t) { if (ids.indexOf(t.id) === -1) ordered.push(t); });

    var changed = ordered.some(function (t, i) { return t.order !== i; });
    q.tasks = ordered;
    if (!changed) return;

    var writes = ordered.map(function (t, i) {
      return t.order === i ? null : Store.updateTask(q.id, t.id, { order: i });
    }).filter(Boolean);
    Promise.all(writes).then(function () { App.render(); }).catch(function () { App.render(); });
  }

  function trainLabel(target) {
    if (target.kind === 'attribute') {
      return 'trains ' + (CONFIG.attributeNames[target.id] || target.id);
    }
    var skill = Store.find('skills', target.id);
    return 'trains ' + (skill ? skill.name : 'a stat');
  }

  /* ---- Mutations ----------------------------------------------------------------- */

  /* Completing a task triggers a full repaint, which destroys and recreates the
   * checkbox. A second tap arriving right after — an impatient double-tap, or
   * the duplicate tap/click some mobile browsers emit for one press — would land
   * on the freshly-drawn button and flip the completion straight back off, so a
   * single intended "complete" read as "it unchecked itself". This guard drops
   * any second toggle of the same task within a short window; deliberate
   * un-checking still works, it just has to be a distinct tap a beat later. */
  var lastToggleAt = {};
  var TOGGLE_GUARD_MS = 500;

  /* One toggle fans out into four writes: the task, character XP, the linked
   * skill or attribute, and possibly the quest's completion + streak. They are
   * chained rather than parallel so the quest reconcile sees the task's new
   * state, and every step is signed by the direction so un-checking is a true
   * undo rather than a second, opposite-signed award that drifts. */
  function toggleTask(q, t) {
    var now = Date.now();
    if (now - (lastToggleAt[t.id] || 0) < TOGGLE_GUARD_MS) return Promise.resolve();
    lastToggleAt[t.id] = now;

    var next = !t.done;
    var dir = next ? 1 : -1;

    return Store.updateTask(q.id, t.id, {
      done: next,
      completedBy: next ? Store.uid() : null,
      completedAt: next ? Date.now() : null
    })
      .then(function () { return Progress.awardXp((t.xpReward || 0) * dir, 'task: ' + t.title); })
      .then(function () { return Progress.train(t.trainingTarget, dir); })
      .then(function () { return Progress.reconcileQuest(q); })
      .then(function () { App.render(); })
      .catch(function (e) {
        console.error('[qm] task toggle failed', e);
        toast('Could not save that — ' + (e.message || 'try again'), 'bad');
        /* Repaint so the checkbox reflects the real saved state instead of a
         * half-applied optimistic one. */
        App.render();
      });
  }

  /* Subtasks are checklist scaffolding, not XP-bearing. But finishing the last
   * one is unambiguously "the task is done", so we roll it up; un-checking one
   * rolls the parent back for the same reason. */
  function toggleSubtask(q, t, index) {
    var subs = (t.subtasks || []).map(function (s) { return Object.assign({}, s); });
    subs[index].done = !subs[index].done;
    var allDone = subs.length > 0 && subs.every(function (s) { return s.done; });

    return Store.updateTask(q.id, t.id, { subtasks: subs }).then(function () {
      if (allDone && !t.done) return toggleTask(q, t);
      if (!allDone && t.done) return toggleTask(q, t);
      App.render();
    });
  }

  function setArchived(q, archived) {
    /* Soft delete: archiving preserves the streak so a paused quest can be
     * resumed rather than restarted. */
    Store.updateQuest(q.id, { status: archived ? 'archived' : 'active' }).then(function () {
      toast(archived ? 'Quest archived — streak preserved.' : 'Quest restored.');
      App.render();
    });
  }

  function deleteQuest(q) {
    confirmModal('Delete quest?',
      '"' + q.title + '" and its ' + (q.tasks || []).length + ' task(s) will be permanently removed, streak included. Archive instead if you might come back to it.',
      function () {
        Store.removeQuest(q.id).then(function () { toast('Quest deleted.'); App.render(); });
      });
  }

  function deleteTask(q, t) {
    /* Removing a completed task claws back the XP it paid, otherwise deleting
     * finished tasks would be a free XP faucet. */
    var undo = t.done
      ? Progress.awardXp(-(t.xpReward || 0), 'task removed').then(function () { return Progress.train(t.trainingTarget, -1); })
      : Promise.resolve();

    undo.then(function () { return Store.removeTask(q.id, t.id); })
      /* Structural sync, not reconcile: deleting a task must never *pay* a
       * completion bonus. Removing the last unfinished task just closes the
       * quest silently; it does not earn the turn-in reward. */
      .then(function () { return Progress.syncQuestStatus(q); })
      .then(function () { App.render(); });
  }

  /* ---- Quest editor ------------------------------------------------------------- */

  function editQuest(q) {
    var isNew = !q;
    var draft = {
      title: q ? q.title : '',
      description: q ? q.description || '' : '',
      cadence: q ? q.cadence : 'daily',
      bonusXp: q ? (q.bonusXp === undefined ? CONFIG.questBonusXpDefault : q.bonusXp) : CONFIG.questBonusXpDefault,
      iconSlug: q ? q.iconSlug || null : null,
      resetWeekday: q && q.resetWeekday !== undefined ? q.resetWeekday : 1,
      resetDayOfMonth: q && q.resetDayOfMonth ? q.resetDayOfMonth : 1
    };

    var title = textInput(draft.title, 'Morning Routine');
    var desc = textArea(draft.description, 'What is this for?', 2);
    var bonus = numInput(draft.bonusXp, 0);

    var cadence = selectInput(CONFIG.cadences.map(function (c) {
      return { value: c, label: CONFIG.cadenceLabels[c] };
    }), draft.cadence);

    var weekdaySel = selectInput(
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .map(function (d, i) { return { value: String(i), label: d }; }),
      String(draft.resetWeekday));
    var domSel = numInput(draft.resetDayOfMonth, 1, 31);

    var weekWrap = field('Resets on', weekdaySel, 'The week rolls over at midnight on this day.');
    var monthWrap = field('Resets on day', domSel, 'Clamped to the last day in shorter months.');

    function syncCadence() {
      weekWrap.style.display = cadence.value === 'weekly' ? '' : 'none';
      monthWrap.style.display = cadence.value === 'monthly' ? '' : 'none';
    }
    cadence.addEventListener('change', syncCadence);

    var iconCtl = Icons.iconField(draft.iconSlug, function (slug) { draft.iconSlug = slug; });

    var share = shareControls(q);

    var body = el('div', {},
      field('Quest title', title),
      field('Description', desc),
      el('div.form-row', {}, field('Icon', iconCtl), field('Bonus XP', bonus, 'Paid when every task is done.')),
      field('Cadence', cadence, 'All tasks in the quest reset together on this rhythm.'),
      weekWrap, monthWrap,
      share.node);

    openModal({
      title: isNew ? 'New quest' : 'Edit quest',
      body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: function () {
            if (!title.value.trim()) { toast('A title is required.', 'bad'); return false; }
            var cad = cadence.value;
            var patch = {
              title: title.value.trim(),
              description: desc.value.trim(),
              cadence: cad,
              bonusXp: Math.max(0, parseInt(bonus.value, 10) || 0),
              iconSlug: draft.iconSlug,
              resetWeekday: parseInt(weekdaySel.value, 10),
              resetDayOfMonth: Math.max(1, Math.min(31, parseInt(domSel.value, 10) || 1))
            };
            patch.nextResetAt = Engine.nextResetAt(cad, Date.now(), patch);
            share.apply(patch, q);

            var op = isNew ? Store.addQuest(patch) : Store.updateQuest(q.id, patch);
            op.then(function (saved) {
              if (isNew) expanded[saved.id] = true;
              toast(isNew ? 'Quest created.' : 'Quest updated.');
              App.render();
            });
          }
        }
      ]
    });

    syncCadence();
  }

  /* Sharing controls, only meaningful in a cloud party. When you're not in one,
   * this collapses to an honest note rather than a dead dropdown. Returns the
   * node plus an apply() that writes visibility/shareMode/partyId onto a patch. */
  function shareControls(q) {
    if (!(window.Party && Party.available())) {
      return {
        node: el('div.note', {}, el('b', {}, 'Private. '),
          'Sign in with Google and join a party to share quests with other crawlers.'),
        apply: function () {}
      };
    }
    if (!Party.inAnyParty()) {
      return {
        node: el('div.note', {}, el('b', {}, 'Private. '),
          'Join a party on the Party tab to share quests and post turn-ins to a feed.'),
        apply: function () {}
      };
    }

    var parties = Party.partyList();
    /* The visibility dropdown is Private plus one entry per party — sharing a
     * quest means picking which party's feed its turn-ins go to. */
    var startVal = (q && (q.visibility === 'party' || q.visibility === 'shared') && q.partyId) ? q.partyId : 'private';
    if (startVal !== 'private' && !parties.some(function (p) { return Party.codeOf(p) === startVal; })) startVal = 'private';

    var visSel = selectInput([{ value: 'private', label: 'Private — only you' }].concat(
      parties.map(function (p) { return { value: Party.codeOf(p), label: 'Share with ' + p.name }; })
    ), startVal);

    var modeSel = selectInput([
      { value: 'view', label: 'View only — they can watch progress' },
      { value: 'coop', label: 'Co-op — they can complete tasks too' }
    ], q && q.shareMode === 'coop' ? 'coop' : 'view');

    var modeWrap = field('Party access', modeSel);
    function syncVis() { modeWrap.style.display = visSel.value === 'private' ? 'none' : ''; }
    visSel.addEventListener('change', syncVis);
    syncVis();

    return {
      node: el('div', {},
        field('Visibility', visSel, 'A shared quest posts its turn-ins to that party feed.'),
        modeWrap),
      apply: function (patch) {
        if (visSel.value !== 'private') {
          patch.visibility = 'party';
          patch.shareMode = modeSel.value === 'coop' ? 'coop' : 'view';
          patch.partyId = visSel.value;
        } else {
          patch.visibility = 'private';
          patch.shareMode = 'view';
          patch.partyId = null;
        }
      }
    };
  }

  /* ---- Task editor ---------------------------------------------------------------- */

  function editTask(q, t) {
    var isNew = !t;
    var title = textInput(t ? t.title : '', 'Do the thing');
    var xp = numInput(t ? t.xpReward : CONFIG.xpPerTaskDefault, 0);

    var target = (t && t.trainingTarget) || { kind: 'skill', id: '', xp: CONFIG.skillTrainingXpDefault };

    var kindSel = selectInput([
      { value: 'none', label: 'Nothing' },
      { value: 'skill', label: 'A stat' },
      { value: 'attribute', label: 'An attribute' }
    ], target.id ? target.kind : 'none');

    var skillSel = selectInput(
      [{ value: '', label: '— choose a stat —' }].concat(Store.state.skills.map(function (s) {
        return { value: s.id, label: s.name + ' (Rank ' + (s.rank || 0) + ')' };
      })),
      target.kind === 'skill' ? target.id : '');

    var attrSel = selectInput(CONFIG.attributeKeys.map(function (k) {
      return { value: k, label: CONFIG.attributeNames[k] };
    }), target.kind === 'attribute' ? target.id : 'STR');

    var trainXp = numInput(target.xp || CONFIG.skillTrainingXpDefault, 0);

    var skillWrap = field('Stat', skillSel);
    var attrWrap = field('Attribute', attrSel,
      'Attribute training fills a hidden pool; ' + CONFIG.attributeTrainingThreshold + ' points buy a permanent +1.');
    var trainXpWrap = field('Training XP', trainXp);

    function syncKind() {
      var k = kindSel.value;
      skillWrap.style.display = k === 'skill' ? '' : 'none';
      attrWrap.style.display = k === 'attribute' ? '' : 'none';
      trainXpWrap.style.display = k === 'none' ? 'none' : '';
    }
    kindSel.addEventListener('change', syncKind);

    /* Subtasks: a tiny inline editor. They carry no XP — they exist so a task
     * like "clear the garage" can be checked off in pieces. */
    var subs = ((t && t.subtasks) || []).map(function (s) { return Object.assign({}, s); });
    var subList = el('div.sub-editor');

    function paintSubs() {
      clear(subList);
      subs.forEach(function (s, i) {
        var inp = textInput(s.title, 'Subtask');
        inp.addEventListener('input', function () { subs[i].title = inp.value; });
        subList.appendChild(el('div.sub-editor-row', {}, inp,
          el('button.icon-btn.subtle', {
            onclick: function () { subs.splice(i, 1); paintSubs(); }
          }, '✕')));
      });
      subList.appendChild(el('button.btn.tiny.ghost', {
        onclick: function () { subs.push({ title: '', done: false }); paintSubs(); }
      }, '+ Subtask'));
    }
    paintSubs();

    openModal({
      title: isNew ? 'Add task' : 'Edit task',
      body: el('div', {},
        field('Task', title),
        field('XP reward', xp, 'Paid to your character the moment it is checked.'),
        field('Also trains', kindSel),
        skillWrap, attrWrap, trainXpWrap,
        el('div.field', {}, el('span.field-label', {}, 'Subtasks'), subList)),
      actions: isNew ? [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Add', kind: 'primary', onClick: save }
      ] : [
        { label: 'Delete', kind: 'danger', onClick: function () { deleteTask(q, t); } },
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Save', kind: 'primary', onClick: save }
      ]
    });

    syncKind();

    function save() {
      if (!title.value.trim()) { toast('A task needs a title.', 'bad'); return false; }

      var tt = null;
      if (kindSel.value === 'skill' && skillSel.value) {
        tt = { kind: 'skill', id: skillSel.value, xp: Math.max(0, parseInt(trainXp.value, 10) || 0) };
      } else if (kindSel.value === 'attribute') {
        tt = { kind: 'attribute', id: attrSel.value, xp: Math.max(0, parseInt(trainXp.value, 10) || 0) };
      }

      var patch = {
        title: title.value.trim(),
        xpReward: Math.max(0, parseInt(xp.value, 10) || 0),
        trainingTarget: tt,
        subtasks: subs.filter(function (s) { return s.title.trim(); })
      };

      var op = isNew ? Store.addTask(q.id, patch) : Store.updateTask(q.id, t.id, patch);
      /* Structural sync: adding a task to a finished quest reopens it without
       * clawing back the streak it already earned this period. */
      op.then(function () { return Progress.syncQuestStatus(q); }).then(function () { App.render(); });
    }
  }

  return { render: render };
})();
