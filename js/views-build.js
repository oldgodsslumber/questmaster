/* Questmaster — Races & Classes point-buy (M4).
 *
 * The book unlocks this on Dungeon Floor 3 and describes the economy exactly:
 * five tiers, up to five points of permanent detriments returning points at a
 * two-for-one deficit, and Earth-gated classes worth roughly 50% more but
 * requiring an Earth-native ancestry. All of that is enforced here; the roster
 * itself lives in data-build.js.
 *
 * Bought traits become permanent modifiers in the character's `traits`
 * collection, which the effective-stat engine already treats as always-on — so
 * this view changes real numbers on the sheet the moment you spend a point.
 */
window.ViewBuild = (function () {

  function render(host) {
    var c = Store.state.character;
    var traits = Store.state.traits;
    var budget = Engine.buildBudget(c, traits);

    var floor = c.floorLevel || 1;
    if (CONFIG.buildUnlockFloor && floor < CONFIG.buildUnlockFloor) {
      host.appendChild(emptyState('🔒', 'Sealed until Floor ' + CONFIG.buildUnlockFloor,
        'The book gates races and classes behind Floor ' + CONFIG.buildUnlockFloor +
        '. You are on ' + floor + '. Raise your floor on the sheet, or set buildUnlockFloor to 0 in config.js.'));
      return;
    }

    host.appendChild(budgetBar(budget));
    host.appendChild(pickerRow(c));

    if (!c.raceName && !c.className) {
      host.appendChild(emptyState('🧬', 'Choose an ancestry',
        'Pick a race first — it decides which classes are open to you.'));
      return;
    }

    host.appendChild(traitSection(c, traits, budget));
    host.appendChild(detrimentSection(traits, budget));
  }

  /* ---- Budget header ----------------------------------------------------------- */

  function budgetBar(b) {
    var pct = b.total ? (b.spent / b.total) * 100 : 0;
    var over = b.remaining < 0;

    return el('section.card.budget', {},
      el('div.budget-row', {},
        el('div.budget-big' + (over ? '.over' : ''), {},
          el('span.budget-n', {}, String(b.remaining)),
          el('span.budget-label', {}, 'points left')),
        el('div.budget-detail', {},
          el('div', {}, 'Base budget ' + b.base + (b.isEarth ? ' (Earth class ×' + CONFIG.earthClassBudgetMultiplier + ')' : '')),
          el('div', {}, 'Detriments returned +' + b.fromDetriments +
            ' (' + b.detrimentPoints + '/' + b.detrimentCap + ' points at ' + CONFIG.detrimentDeficit + '-for-1)'),
          el('div', {}, 'Spent ' + b.spent + ' of ' + b.total))),
      bar(pct, over ? 'over' : 'budget'),
      over ? el('p.warn', {}, 'You are over budget. Sell something back or accept more detriments.') : null);
  }

  /* ---- Race & class pickers ------------------------------------------------------ */

  function pickerRow(c) {
    return el('section.card', {},
      el('div.form-row', {},
        el('div.picker-half', {},
          el('h3', {}, 'Race'),
          el('button.build-pick', { onclick: chooseRace },
            Icons.node(c.raceName ? (BUILD.findRace(c.raceName) || {}).iconSlug : null, 'lg'),
            el('div', {},
              el('div.build-pick-name', {}, c.raceName || 'Choose a race'),
              el('div.muted.small', {}, c.raceName ? (BUILD.findRace(c.raceName) || {}).blurb : 'Sets which classes you can take.')))),
        el('div.picker-half', {},
          el('h3', {}, 'Class'),
          el('button.build-pick', {
            disabled: !c.raceName,
            onclick: chooseClass
          },
            Icons.node(c.className ? (BUILD.findClass(c.className) || {}).iconSlug : null, 'lg'),
            el('div', {},
              el('div.build-pick-name', {}, c.className || (c.raceName ? 'Choose a class' : 'Pick a race first')),
              el('div.muted.small', {}, c.className ? (BUILD.findClass(c.className) || {}).blurb : ''))))));
  }

  function chooseRace() {
    var c = Store.state.character;
    var close = openModal({
      title: 'Choose a race',
      body: el('div.build-list', {}, BUILD.races.map(function (r) {
        return el('button.build-option' + (c.raceName === r.name ? '.on' : ''), {
          onclick: function () { close(); applyRace(r); }
        },
          Icons.node(r.iconSlug, 'lg'),
          el('div', {},
            el('div.build-pick-name', {}, r.name,
              r.isEarth ? el('span.earth-chip', {}, 'Earth-native') : null),
            el('div.muted.small', {}, r.blurb),
            r.innateNote ? el('div.innate-note', {}, r.innateNote) : null,
            el('div.tier-strip', {}, r.traits.map(function (t) {
              return el('span.tier-dot-lg', {
                style: { background: CONFIG.tierColors[t.tier] },
                title: t.tier + ': ' + t.name
              });
            }))));
      }))
    });
  }

  function chooseClass() {
    var c = Store.state.character;
    var earthOk = BUILD.earthUnlocked(c.raceName);

    var close = openModal({
      title: 'Choose a class',
      body: el('div', {},
        earthOk ? null : el('div.note', {},
          el('b', {}, 'Earth classes are locked. '),
          'They require an Earth-native ancestry — Human, or Primal if you want the extra points badly enough to take a permanent −1 to everything.'),
        el('div.build-list', {}, BUILD.classes.map(function (k) {
          var locked = k.isEarth && !earthOk;
          return el('button.build-option' + (c.className === k.name ? '.on' : '') + (locked ? '.locked' : ''), {
            disabled: locked,
            onclick: function () { close(); applyClass(k); }
          },
            Icons.node(k.iconSlug, 'lg'),
            el('div', {},
              el('div.build-pick-name', {}, k.name,
                k.isEarth ? el('span.earth-chip', {}, 'Earth · +50% points') : null,
                locked ? el('span.lock-chip', {}, 'Locked') : null),
              el('div.muted.small', {}, k.blurb),
              el('div.tier-strip', {}, k.traits.map(function (t) {
                return el('span.tier-dot-lg', {
                  style: { background: CONFIG.tierColors[t.tier] },
                  title: t.tier + ': ' + t.name
                });
              }))));
        })))
    });
  }

  /* Switching ancestry refunds every race trait — you cannot keep a Tigran's
   * claws after becoming a Dvergr. Class traits and detriments are untouched. */
  function applyRace(r) {
    var c = Store.state.character;
    var stale = Store.state.traits.filter(function (t) { return t.source === 'race'; });

    var chain = Promise.all(stale.map(function (t) { return Store.remove('traits', t.id); }));

    /* A race's innate package (Primal's −1 across the board) is a zero-cost
     * trait so it shows on the sheet and feeds the engine like anything else. */
    if (r.innate && r.innate.length) {
      chain = chain.then(function () {
        return Store.add('traits', {
          name: r.name + ' Ancestry',
          source: 'race', tier: null, isInnate: true, isDetriment: false,
          description: r.innateNote || 'Innate to ' + r.name + '.',
          modifiers: r.innate
        });
      });
    }

    /* An Earth class held by a race that no longer permits it has to go, or the
     * budget premium would survive the prerequisite that justified it. */
    var patch = { raceName: r.name };
    var currentClass = c.className ? BUILD.findClass(c.className) : null;
    if (currentClass && currentClass.isEarth && !r.isEarth) {
      patch.className = null;
      patch.isEarthClass = false;
      chain = chain.then(function () {
        return Promise.all(Store.state.traits
          .filter(function (t) { return t.source === 'earth' || t.source === 'class'; })
          .map(function (t) { return Store.remove('traits', t.id); }));
      });
    }

    chain.then(function () { return Store.saveCharacter(patch); })
      .then(function () {
        Store.logEvent('build', 'Ancestry set to ' + r.name + '.');
        if (patch.className === null) toast('Your Earth class was dropped — ' + r.name + ' is not Earth-native.', 'bad');
        else toast('Ancestry: ' + r.name + '.');
        App.render();
      });
  }

  function applyClass(k) {
    var stale = Store.state.traits.filter(function (t) { return t.source === 'class' || t.source === 'earth'; });

    Promise.all(stale.map(function (t) { return Store.remove('traits', t.id); }))
      .then(function () { return Store.saveCharacter({ className: k.name, isEarthClass: !!k.isEarth }); })
      .then(function () {
        Store.logEvent('build', 'Class set to ' + k.name + '.');
        toast('Class: ' + k.name + '.');
        App.render();
      });
  }

  /* ---- Trait purchase -------------------------------------------------------------- */

  function traitSection(c, owned, budget) {
    var available = BUILD.availableTraits(c.raceName, c.className)
      .filter(function (t) { return !t.isDetriment; });

    var groups = {};
    available.forEach(function (t) {
      groups[t.sourceName] = groups[t.sourceName] || [];
      groups[t.sourceName].push(t);
    });

    return el('section.card', {},
      el('h2', {}, 'Traits'),
      el('p.muted.small', {}, 'Buying a trait makes it a permanent modifier. Sell it back any time — nothing is locked in.'),
      Object.keys(groups).map(function (sourceName) {
        return el('div.trait-group', {},
          el('h3.trait-group-h', {}, sourceName),
          groups[sourceName].map(function (t) { return traitRow(t, owned, budget); }));
      }));
  }

  function detrimentSection(owned, budget) {
    var atCap = budget.detrimentPoints >= budget.detrimentCap;

    return el('section.card', {},
      el('h2', {}, 'Detriments'),
      el('p.muted.small', {},
        'Accept up to ' + budget.detrimentCap + ' points of permanent drawbacks. They pay back at ' +
        CONFIG.detrimentDeficit + '-for-1, so they never quite fund themselves — ' +
        budget.detrimentPoints + '/' + budget.detrimentCap + ' taken, returning ' + budget.fromDetriments + '.'),
      BUILD.detriments.map(function (t) {
        var tagged = Object.assign({ source: 'detriment', sourceName: 'Detriment', isDetriment: true }, t);
        return traitRow(tagged, owned, budget, atCap);
      }));
  }

  function traitRow(t, owned, budget, detrimentAtCap) {
    var mine = owned.filter(function (o) { return o.name === t.name && o.source === t.source; })[0];
    var cost = CONFIG.tierCosts[t.tier] || 0;

    /* Affordability differs by kind: a benefit needs points free, a detriment
     * needs room under the cap. */
    var blocked = mine ? false
      : t.isDetriment ? (detrimentAtCap || budget.detrimentPoints + cost > budget.detrimentCap)
        : cost > budget.remaining;

    return el('div.trait-row' + (mine ? '.owned' : '') + (blocked ? '.blocked' : ''), {},
      el('span.tier-dot', { style: { background: CONFIG.tierColors[t.tier] || '#555' } }),
      el('div.trait-main', {},
        el('div.trait-name', {}, t.name,
          el('span.tier-chip', { style: { color: CONFIG.tierColors[t.tier] } }, t.tier + ' · ' + cost + 'p')),
        el('div.muted.small', {}, t.description),
        ModEditor.summary(t.modifiers)),
      el('button.btn.tiny' + (mine ? '.ghost' : blocked ? '.disabled' : '.primary'), {
        disabled: blocked,
        title: blocked
          ? (t.isDetriment ? 'That would exceed the detriment cap.' : 'Not enough points.')
          : '',
        onclick: function () { mine ? sell(mine) : buy(t); }
      }, mine ? 'Sell back' : t.isDetriment ? 'Accept' : 'Buy'));
  }

  function buy(t) {
    Store.add('traits', {
      name: t.name,
      source: t.source,
      tier: t.tier,
      description: t.description,
      modifiers: t.modifiers || [],
      isDetriment: !!t.isDetriment
    }).then(function () {
      Store.logEvent('build', (t.isDetriment ? 'Accepted the detriment "' : 'Bought the trait "') + t.name + '".');
      toast(t.isDetriment ? 'Accepted ' + t.name + '.' : t.name + ' acquired.');
      App.render();
    });
  }

  function sell(mine) {
    Store.remove('traits', mine.id).then(function () {
      toast(mine.name + ' sold back.');
      App.render();
    });
  }

  return { render: render };
})();
