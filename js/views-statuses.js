/* Questmaster — buffs, debuffs and achievements (M3).
 *
 * Both feed the same modifier engine; the difference is that a status is
 * temporary and self-inflicted, while an achievement is permanent and earned.
 * Nothing here expires on a timer server-side — an expiry is just a timestamp
 * the client compares against on render, which is why a stale buff quietly
 * stops applying rather than needing a cron job to clean it up.
 */
window.ViewStatuses = (function () {

  var tab = 'statuses';

  function render(host) {
    host.appendChild(el('div.tabs', {}, [
      ['statuses', 'Buffs & Debuffs'], ['achievements', 'Achievements']
    ].map(function (t) {
      return el('button.tab' + (tab === t[0] ? '.on' : ''), {
        onclick: function () { tab = t[0]; App.render(); }
      }, t[1], el('span.tab-count', {}, Store.state[t[0]].length));
    })));

    if (tab === 'statuses') renderStatuses(host);
    else renderAchievements(host);
  }

  /* ---- Statuses --------------------------------------------------------------- */

  function renderStatuses(host) {
    var now = Date.now();
    var list = Store.state.statuses;
    var active = list.filter(function (s) { return !s.expiresAt || s.expiresAt > now; });
    var lapsed = list.filter(function (s) { return s.expiresAt && s.expiresAt <= now; });

    if (!list.length) {
      host.appendChild(emptyState('✨', 'Nothing applied',
        'Apply a buff when something goes right, a debuff when it does not. Both feed straight into your effective stats.'));
    }

    if (active.length) {
      host.appendChild(el('h2.section-h', {}, 'Active'));
      active.forEach(function (s) { host.appendChild(statusRow(s, false)); });
    }

    if (lapsed.length) {
      host.appendChild(el('h2.section-h', {}, 'Expired'));
      host.appendChild(el('p.muted.small', {}, 'These no longer apply. Clear them out or extend them.'));
      lapsed.forEach(function (s) { host.appendChild(statusRow(s, true)); });
    }

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editStatus(null); } }, 'Apply a status')));
  }

  function statusRow(s, expired) {
    return el('div.inv-row.status-row.' + s.polarity + (expired ? '.expired' : ''), {},
      Icons.node(s.iconSlug, 'lg'),
      el('div.inv-main', { onclick: function () { editStatus(s); } },
        el('div.inv-name', {}, s.name,
          el('span.pol-chip.' + s.polarity, {}, s.polarity === 'buff' ? 'Buff' : 'Debuff')),
        s.description ? mdMuted(s.description) : null,
        statusModSummary(s),
        el('div.muted.small', {},
          'Applied ' + fmtDate(s.appliedAt) +
          (s.expiresAt ? (expired ? ' · expired ' + fmtDate(s.expiresAt) : ' · expires ' + fmtUntil(s.expiresAt)) : ' · until cleared'))),
      el('div.row-actions', {},
        (window.Party && Party.available()) ? el('button.btn.tiny.ghost', { onclick: function () { shareStatus(s); } }, 'Share') : null,
        el('button.btn.tiny.ghost', { onclick: function () { clearStatus(s); } }, 'Clear')));
  }

  function shareStatus(s) {
    var who = (Store.state.character && Store.state.character.name) || 'A crawler';
    shareToFeedModal({
      title: 'Share status',
      message: who + (s.polarity === 'buff' ? ' gained the buff "' : ' took on the debuff "') + s.name + '".',
      kind: 'status'
    });
  }

  /* A status description rendered as Markdown, styled to match the old muted
   * one-liner. */
  function mdMuted(text) {
    var d = renderMarkdown(text);
    d.className = 'md muted small';
    return d;
  }

  /* Debuffs are stored as positive values; render them as the opposite so the
   * card shows the reduction the player actually feels (−N, ÷N). */
  function statusModSummary(s) {
    var debuff = s.polarity === 'debuff';
    var mods = (s.modifiers || []).map(function (m) {
      var v = Math.abs(m.value);
      if (debuff) return { stat: m.stat, op: m.op === 'mult' ? 'div' : 'add', value: m.op === 'mult' ? v : -v };
      return { stat: m.stat, op: m.op, value: v };
    });
    return ModEditor.summary(mods);
  }

  function clearStatus(s) {
    Store.remove('statuses', s.id).then(function () {
      Store.logEvent('status-cleared', s.name + ' cleared.');
      toast(s.name + ' cleared.');
      App.render();
    });
  }

  /* Label one or more feed targets for the "posts to X" note. Accepts a single
   * value or an array. */
  function feedLabel(target) {
    var arr = Array.isArray(target) ? target : [target];
    var dests = feedDestinations();
    return arr.map(function (t) {
      var d = dests.filter(function (x) { return x.value === t; })[0];
      return d ? d.label : 'party';
    }).join(', ');
  }

  /* Normalise a forced target (opts.forceTarget) to a non-empty array, or null
   * if there's nothing to post to (so the optional picker is shown instead). */
  function forcedTargets(v) {
    if (!v) return null;
    var arr = Array.isArray(v) ? v.filter(Boolean) : [v];
    return arr.length ? arr : null;
  }

  /* editStatus(s, opts): opts.forceTarget makes a NEW status post to that feed
   * automatically (used from the Feed) instead of offering the optional picker. */
  function editStatus(s, opts) {
    opts = opts || {};
    var isNew = !s;
    var name = textInput(s ? s.name : '', 'Adrenaline');
    var desc = textArea(s ? s.description : '', '', 2);
    var polarity = selectInput([
      { value: 'buff', label: 'Buff' }, { value: 'debuff', label: 'Debuff' }
    ], s ? s.polarity : 'buff');
    var iconSlug = s ? s.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (v) { iconSlug = v; });
    var mods = ModEditor.create(s ? s.modifiers : [], { positiveOnly: true });

    var forced = isNew ? forcedTargets(opts.forceTarget) : null;
    var share = forced
      ? { node: el('p.muted.small', {}, 'Posts to ' + feedLabel(forced) + '.'), targets: function () { return forced; } }
      : (isNew ? partyPostControl('Also post to a feed') : { node: null, targets: function () { return []; } });

    var durMode = selectInput([
      { value: 'none', label: 'Until I clear it' },
      { value: 'mins', label: 'For a set time' }
    ], s && s.expiresAt ? 'mins' : 'none');
    var mins = numInput(s && s.expiresAt ? Math.max(1, Math.round((s.expiresAt - Date.now()) / 60000)) : 60, 1);
    var minsWrap = field('Minutes from now', mins);
    function syncDur() { minsWrap.style.display = durMode.value === 'mins' ? '' : 'none'; }
    durMode.addEventListener('change', syncDur);

    openModal({
      title: isNew ? 'Apply a status' : 'Edit status',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Polarity', polarity)),
        field('Description', desc, 'Markdown supported.'),
        field('Duration', durMode), minsWrap,
        el('div.field', {},
          el('span.field-label', {}, 'Modifiers'),
          el('span.field-hint', {}, 'Enter positive values with + or ×. A debuff applies the opposite automatically — +2 becomes −2, ×2 becomes ÷2.'),
          mods),
        share.node),
      actions: (isNew ? [] : [{
        label: 'Clear', kind: 'danger', onClick: function () { clearStatus(s); }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Apply' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              polarity: polarity.value,
              iconSlug: iconSlug,
              modifiers: mods.getMods(),
              expiresAt: durMode.value === 'mins'
                ? Date.now() + (parseInt(mins.value, 10) || 60) * 60000
                : null
            };
            if (isNew) patch.appliedAt = Date.now();

            var op = isNew ? Store.add('statuses', patch) : Store.update('statuses', s.id, patch);
            op.then(function () {
              if (isNew) {
                Store.logEvent('status-applied', patch.name + ' applied (' + patch.polarity + ').');
                var targets = share.targets();
                if (targets.length) {
                  var who = (Store.state.character && Store.state.character.name) || 'A crawler';
                  Party.post(who + (patch.polarity === 'buff' ? ' gained the buff "' : ' took on the debuff "') + patch.name + '".', 'status', { iconSlug: patch.iconSlug || null }, targets)
                    .catch(function () { toast('Applied, but the party post failed.', 'bad'); });
                }
                toast(patch.name + ' applied.');
              }
              App.render();
            });
          }
        }
      ])
    });

    syncDur();
  }

  /* ---- Achievements ------------------------------------------------------------ */

  function renderAchievements(host) {
    var list = Store.state.achievements;

    host.appendChild(el('div.view-intro', {},
      el('p.muted', {}, 'Permanent. Their modifiers always apply, whether or not anything is equipped. Award yourself one when you have genuinely earned it — nothing here checks.')));

    if (!list.length) {
      host.appendChild(emptyState('🏆', 'None yet', 'The System is watching, allegedly.'));
    }

    list.slice().sort(function (a, b) { return (b.earnedAt || 0) - (a.earnedAt || 0); }).forEach(function (a) {
      host.appendChild(achievementRow(a));
    });

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editAchievement(null); } }, 'Award an achievement')));
  }

  function achievementRow(a) {
    return el('div.inv-row', {},
      Icons.node(a.iconSlug, 'lg'),
      el('div.inv-main', { onclick: function () { editAchievement(a); } },
        el('div.inv-name', {}, a.name),
        a.description ? mdMuted(a.description) : null,
        ModEditor.summary(a.modifiers),
        el('div.muted.small', {}, 'Earned ' + fmtDate(a.earnedAt))),
      (window.Party && Party.available())
        ? el('div.row-actions', {}, el('button.btn.tiny.ghost', { onclick: function () { shareAchievement(a); } }, 'Share'))
        : null);
  }

  /* ---- Embeddable panel ------------------------------------------------------
   * Buffs/debuffs + achievements as two self-contained cards with Apply/Award
   * buttons, so the whole thing can live inside the Sheet and the Feed rather
   * than only on its own tab. */
  /* panel(host, opts): opts.postTarget (a feed target) makes the Apply/Award
   * buttons post the new status/achievement to that feed — that's what the Feed
   * passes so adding one there posts it directly. */
  function panel(host, opts) {
    opts = opts || {};
    var forced = opts.postTarget ? { forceTarget: opts.postTarget } : undefined;
    var now = Date.now();
    var statuses = Store.state.statuses || [];
    var active = statuses.filter(function (s) { return !s.expiresAt || s.expiresAt > now; });
    var lapsed = statuses.filter(function (s) { return s.expiresAt && s.expiresAt <= now; });
    var achievements = (Store.state.achievements || []).slice().sort(function (a, b) { return (b.earnedAt || 0) - (a.earnedAt || 0); });

    var stBody = [];
    active.forEach(function (s) { stBody.push(statusRow(s, false)); });
    if (lapsed.length) { stBody.push(el('div.section-h', {}, 'Expired')); lapsed.forEach(function (s) { stBody.push(statusRow(s, true)); }); }
    if (!statuses.length) stBody.push(el('p.muted.small', {}, 'No buffs or debuffs applied. Add one when something goes right — or wrong.'));

    host.appendChild(el('section.card', {},
      el('div.stage-head', {}, el('h2', {}, 'Buffs & Debuffs'),
        el('button.btn.tiny.primary', { onclick: function () { editStatus(null, forced); } }, 'Apply')),
      stBody));

    host.appendChild(el('section.card', {},
      el('div.stage-head', {}, el('h2', {}, 'Achievements'),
        el('button.btn.tiny.primary', { onclick: function () { editAchievement(null, forced); } }, 'Award')),
      achievements.length ? achievements.map(achievementRow) : el('p.muted.small', {}, 'No achievements yet. Award one when you have genuinely earned it.')));
  }

  function shareAchievement(a) {
    var who = (Store.state.character && Store.state.character.name) || 'A crawler';
    shareToFeedModal({
      title: 'Share achievement',
      message: who + ' earned the achievement "' + a.name + '". 🎖️',
      kind: 'achievement'
    });
  }

  function editAchievement(a, opts) {
    opts = opts || {};
    var isNew = !a;
    var name = textInput(a ? a.name : '', 'Thirty Days Unbroken');
    var desc = textArea(a ? a.description : '', 'What you did to get it.', 2);
    var iconSlug = a ? a.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (v) { iconSlug = v; });
    var mods = ModEditor.create(a ? a.modifiers : []);

    var forced = isNew ? forcedTargets(opts.forceTarget) : null;
    var share = forced
      ? { node: el('p.muted.small', {}, 'Announces on ' + feedLabel(forced) + '.'), targets: function () { return forced; } }
      : (isNew ? partyPostControl('Announce it on a feed') : { node: null, targets: function () { return []; } });

    openModal({
      title: isNew ? 'Award an achievement' : 'Edit achievement',
      body: el('div', {},
        field('Name', name),
        field('Icon', iconCtl),
        field('Description', desc),
        el('div.field', {},
          el('span.field-label', {}, 'Permanent modifiers'),
          el('span.field-hint', {}, 'Optional — plenty of achievements are just a record.'),
          mods),
        share.node),
      actions: (isNew ? [] : [{
        label: 'Delete', kind: 'danger', onClick: function () { Store.remove('achievements', a.id).then(App.render); }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Award' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              iconSlug: iconSlug,
              modifiers: mods.getMods()
            };
            if (isNew) {
              Progress.grantAchievement(patch).then(function () {
                var targets = share.targets();
                if (targets.length) {
                  var who = (Store.state.character && Store.state.character.name) || 'A crawler';
                  Party.post(who + ' earned the achievement "' + patch.name + '". 🎖️', 'achievement', { iconSlug: patch.iconSlug || null }, targets)
                    .catch(function () {});
                }
                App.render();
              });
              return;
            }
            Store.update('achievements', a.id, patch).then(App.render);
          }
        }
      ])
    });
  }

  return {
    render: render, panel: panel,
    /* Quick-create-and-post helpers for the Feed. Pass the feed target. */
    newStatus: function (target) { editStatus(null, { forceTarget: target }); },
    newAchievement: function (target) { editAchievement(null, { forceTarget: target }); }
  };
})();
