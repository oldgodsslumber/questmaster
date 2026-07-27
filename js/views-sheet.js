/* Questmaster — the character sheet (M1, with the M3/M4 blocks folded in).
 *
 * Everything here reads from Engine.derive(), so base and effective values can
 * sit next to each other and every effective number can explain itself: tap a
 * stat and you get the list of items, buffs and traits that moved it.
 */
window.ViewSheet = (function () {

  function render(host) {
    var s = Store.state;
    var c = s.character;
    var d = Engine.derive(s);

    var sheet = el('div.sheet#sheet-capture');

    sheet.appendChild(header(c, d));
    sheet.appendChild(resources(c, d));
    sheet.appendChild(attributes(c, d));
    if (d.custom.length) sheet.appendChild(customStats(d));
    sheet.appendChild(skills(s));
    sheet.appendChild(equipped(s, d));
    if (s.statuses.length) sheet.appendChild(statuses(s));
    if (s.traits.length) sheet.appendChild(traitBlock(s));
    if (s.achievements.length) sheet.appendChild(achievements(s));
    sheet.appendChild(hinges(c));

    host.appendChild(sheet);
    host.appendChild(el('div.sheet-actions', {},
      el('button.btn.ghost', { onclick: exportPng }, 'Export PNG'),
      el('button.btn.ghost', { onclick: function () { App.go('#/build'); } }, 'Race & Class'),
      el('button.btn.ghost', { onclick: editIdentity }, 'Edit details')));
    host.appendChild(el('p.credit-line', {},
      'Icons by ',
      el('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'),
      ', ',
      el('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'),
      '.'));
  }

  /* ---- Header + XP ---------------------------------------------------------- */

  function header(c, d) {
    var need = Engine.xpForLevel(c.level || 1);
    var pct = ((c.xp || 0) / need) * 100;

    var subtitle = [c.raceName, c.className].filter(Boolean).join(' · ') || 'Unaligned crawler';

    return el('section.card.sheet-head', {},
      el('div.sheet-head-top', {},
        el('div', {},
          el('h1.char-name', {}, c.name),
          el('div.char-sub', {}, subtitle)),
        el('div.level-badge', {},
          el('span.level-n', {}, String(c.level || 1)),
          el('span.level-label', {}, 'Level'))),
      el('div.xp-row', {},
        bar(pct, 'xp'),
        el('div.xp-text', {}, (c.xp || 0) + ' / ' + need + ' XP')),
      (c.unspentAttributePoints || 0) > 0
        ? el('div.points-nudge', {},
          el('span', {}, c.unspentAttributePoints + ' attribute point' + (c.unspentAttributePoints === 1 ? '' : 's') + ' unspent'))
        : null,
      el('div.floor-row', {},
        el('span.muted', {}, 'Dungeon floor'),
        el('button.stepper-btn', { onclick: function () { setFloor(Math.max(1, (c.floorLevel || 1) - 1)); } }, '−'),
        el('b', {}, String(c.floorLevel || 1)),
        el('button.stepper-btn', { onclick: function () { setFloor((c.floorLevel || 1) + 1); } }, '+'),
        el('span.muted.small', {}, 'feeds Passive Evade')));
  }

  function setFloor(n) {
    Store.saveCharacter({ floorLevel: n }).then(App.render);
  }

  /* ---- Resources ------------------------------------------------------------- */

  /* The book's health is ten discrete slots rather than one pool, and the Heal
   * spell restores *slots*, so the sheet draws slots and edits in slot units. */
  function resources(c, d) {
    var r = c.resources || {};
    var cur = Math.min(r.currentHealth || 0, d.maxHealth);
    var slots = Engine.healthSlots(cur, d.slotCapacity);

    var slotRow = el('div.hp-slots', {}, slots.map(function (slot) {
      return el('button.hp-slot' + (slot.filled === 0 ? '.empty' : '') + (slot.filled === slot.capacity ? '.full' : ''), {
        title: 'Slot ' + (slot.index + 1) + ': ' + slot.filled + '/' + slot.capacity,
        onclick: function () {
          /* Tapping the last full slot empties it; tapping any other fills up
           * to and including it. Two taps cover every common adjustment. */
          var target = (slot.filled === slot.capacity) ? slot.index * d.slotCapacity
            : (slot.index + 1) * d.slotCapacity;
          setResource('currentHealth', target, d);
        }
      }, el('span.hp-fill', { style: { height: slot.pct + '%' } }));
    }));

    return el('section.card', {},
      el('h2', {}, 'Resources'),

      el('div.res-block', {},
        el('div.res-head', {},
          el('span.res-label', {}, 'Health'),
          el('span.res-val', {}, cur + ' / ' + d.maxHealth),
          stepper(function (n) { setResource('currentHealth', cur + n, d); })),
        slotRow,
        el('div.muted.small', {}, CONFIG.healthSlots + ' slots × ' + d.slotCapacity + ' per slot (CON mod ' + signed(d.modifiers.CON) + ')')),

      el('div.res-block', {},
        el('div.res-head', {},
          el('span.res-label', {}, 'Mana'),
          el('span.res-val', {}, (r.currentMana || 0) + ' / ' + d.maxMana),
          stepper(function (n) { setResource('currentMana', (r.currentMana || 0) + n, d); })),
        bar(d.maxMana ? ((r.currentMana || 0) / d.maxMana) * 100 : 0, 'mana'),
        el('div.muted.small', {}, 'Maximum equals your raw Intelligence score.')),

      el('div.res-block', {},
        el('div.res-head', {},
          el('span.res-label', {}, 'AI Favor'),
          el('span.res-val', {}, String(r.aiFavor || 0)),
          stepper(function (n) { setResource('aiFavor', (r.aiFavor || 0) + n, d); })),
        el('div.muted.small', {}, 'Spend for rerolls and action bursts. Entirely manual — nothing here spends it for you.')),

      el('div.derived-grid', {},
        derivedTile('Passive Evade', d.evade, d.evadeBase, '10 + DEX mod + floor ' + d.floorLevel),
        derivedTile('Size', d.size, c.size || CONFIG.defaultSize, ''),
        derivedTile('Slot Capacity', d.slotCapacity, d.slotCapacityBase, 'per health slot')));
  }

  function stepper(onChange) {
    return el('span.stepper', {},
      el('button.stepper-btn', { onclick: function () { onChange(-1); } }, '−'),
      el('button.stepper-btn', { onclick: function () { onChange(1); } }, '+'));
  }

  function setResource(key, value, d) {
    var caps = { currentHealth: d.maxHealth, currentMana: d.maxMana, aiFavor: 999 };
    var v = Math.max(0, Math.min(caps[key], Math.round(value)));
    var next = Object.assign({}, Store.state.character.resources || {});
    next[key] = v;
    Store.saveCharacter({ resources: next }).then(App.render);
  }

  function derivedTile(label, value, base, note) {
    var changed = value !== base;
    return el('div.derived' + (changed ? '.changed' : ''), {},
      el('div.derived-val', {}, String(value)),
      changed ? el('div.derived-base', {}, 'base ' + base) : null,
      el('div.derived-label', {}, label),
      note ? el('div.derived-note', {}, note) : null);
  }

  /* ---- Attributes ------------------------------------------------------------ */

  function attributes(c, d) {
    var unspent = c.unspentAttributePoints || 0;

    return el('section.card', {},
      el('div.stage-head', {},
        el('h2', {}, 'Attributes'),
        unspent > 0 ? el('span.points-chip', {}, unspent + ' to spend') : null),
      el('div.attr-grid', {}, CONFIG.attributeKeys.map(function (k) {
        var base = d.base[k], eff = d.effective[k];
        var changed = eff !== base;
        var sources = d.mods_by_stat(k);

        return el('div.attr-card' + (changed ? '.changed' : ''), {
          onclick: sources.length ? function () { explain(CONFIG.attributeNames[k], base, eff, sources); } : null
        },
          el('div.attr-key', {}, k),
          el('div.attr-score', {},
            el('span.attr-eff', {}, String(eff)),
            changed ? el('span.attr-base', {}, base) : null),
          el('div.mod-chip', {}, signed(CONFIG.scoreToModifier(eff))),
          el('div.attr-full', {}, CONFIG.attributeNames[k]),
          unspent > 0
            ? el('button.btn.tiny.primary', {
              onclick: function (e) { e.stopPropagation(); spendPoint(k); }
            }, '+1')
            : null,
          sources.length ? el('div.attr-why', {}, sources.length + ' modifier' + (sources.length === 1 ? '' : 's')) : null);
      })));
  }

  function spendPoint(k) {
    var c = Store.state.character;
    if ((c.unspentAttributePoints || 0) <= 0) return;
    if ((c.attributes[k] || 0) >= CONFIG.attributeMax) {
      toast(CONFIG.attributeNames[k] + ' is already at the cap of ' + CONFIG.attributeMax + '.', 'bad');
      return;
    }
    var attrs = Object.assign({}, c.attributes);
    attrs[k] = (attrs[k] || 0) + 1;
    Store.saveCharacter({
      attributes: attrs,
      unspentAttributePoints: c.unspentAttributePoints - 1
    }).then(function () {
      toast(CONFIG.attributeNames[k] + ' raised to ' + attrs[k] + '.');
      App.render();
    });
  }

  /* The "why is this number what it is" modal. */
  function explain(label, base, eff, sources) {
    openModal({
      title: label,
      body: el('div', {},
        el('p.modal-text', {}, 'Base ' + base + ' → effective ' + eff + '.'),
        el('ul.mod-list', {}, sources.map(function (m) {
          return el('li', {},
            el('span.mod-source', {}, m.sourceName),
            el('span.mod-kind', {}, m.sourceKind),
            el('span.mod-value', {}, m.op === 'mult' ? '×' + m.value : signed(m.value)));
        })))
    });
  }

  function customStats(d) {
    return el('section.card', {},
      el('h2', {}, 'Other stats'),
      el('p.muted.small', {}, 'Modifiers targeting stats outside the core five. Anything can be a stat — name it in an item and it shows up here.'),
      el('div.derived-grid', {}, d.custom.map(function (cs) {
        return el('div.derived.changed', {
          onclick: function () { explain(cs.stat, 0, cs.total, cs.sources); }
        },
          el('div.derived-val', {}, signed(Math.round(cs.total))),
          el('div.derived-label', {}, cs.stat),
          el('div.derived-note', {}, cs.sources.length + ' source' + (cs.sources.length === 1 ? '' : 's')));
      })));
  }

  /* ---- Skills ----------------------------------------------------------------- */

  function skills(s) {
    if (!s.skills.length) {
      return el('section.card', {}, el('h2', {}, 'Skills'),
        emptyState('📜', 'No skills yet', 'Add one from the Skills view, or link a task to train one.'));
    }
    return el('section.card', {},
      el('div.stage-head', {},
        el('h2', {}, 'Skills'),
        el('button.btn.tiny.ghost', { onclick: function () { App.go('#/skills'); } }, 'Manage')),
      el('div.skill-list', {}, s.skills.slice().sort(function (a, b) {
        return (b.rank || 0) - (a.rank || 0) || String(a.name).localeCompare(b.name);
      }).map(function (sk) {
        var capped = (sk.rank || 0) >= CONFIG.skillRankMax;
        var need = Engine.skillXpForRank(sk.rank || 0);
        var pct = capped ? 100 : ((sk.xp || 0) / need) * 100;
        return el('div.skill-row', {},
          Icons.node(sk.iconSlug),
          el('div.skill-main', {},
            el('div.skill-name', {}, sk.name),
            bar(pct, 'skill')),
          el('div.skill-rank', {},
            el('span.rank-n', {}, String(sk.rank || 0)),
            el('span.rank-word', {}, capped ? 'MAX' : 'Rank')));
      })));
  }

  /* ---- Equipment -------------------------------------------------------------- */

  function equipped(s, d) {
    var bySlot = {};
    s.equipment.filter(function (e) { return e.equipped; }).forEach(function (e) { bySlot[e.slot] = e; });

    return el('section.card', {},
      el('div.stage-head', {},
        el('h2', {}, 'Equipped'),
        el('button.btn.tiny.ghost', { onclick: function () { App.go('#/inventory'); } }, 'Inventory')),
      el('div.slot-grid', {}, SEED.equipSlots.map(function (slot) {
        var item = bySlot[slot.key];
        return el('div.slot' + (item ? '.filled' : ''), {
          onclick: function () { App.go('#/inventory'); }
        },
          Icons.node(item ? item.iconSlug : null),
          el('div.slot-label', {}, slot.label),
          el('div.slot-item', {}, item ? item.name : '—'),
          item && item.modifiers && item.modifiers.length
            ? el('div.slot-mods', {}, item.modifiers.map(function (m) {
              return (m.op === 'mult' ? '×' + m.value : signed(m.value)) + ' ' + m.stat;
            }).join(' · '))
            : null);
      })));
  }

  /* ---- Statuses, traits, achievements ------------------------------------------ */

  function statuses(s) {
    var now = Date.now();
    var active = s.statuses.filter(function (st) { return !st.expiresAt || st.expiresAt > now; });
    if (!active.length) return el('section.card', {}, el('h2', {}, 'Buffs & Debuffs'), emptyState('✨', 'Nothing active', null));

    return el('section.card', {},
      el('div.stage-head', {},
        el('h2', {}, 'Buffs & Debuffs'),
        el('button.btn.tiny.ghost', { onclick: function () { App.go('#/statuses'); } }, 'Manage')),
      el('div.status-strip', {}, active.map(function (st) {
        return el('div.status-pill.' + st.polarity, {},
          Icons.node(st.iconSlug),
          el('span', {}, st.name),
          st.expiresAt ? el('span.muted.small', {}, fmtUntil(st.expiresAt)) : null);
      })));
  }

  function traitBlock(s) {
    return el('section.card', {},
      el('div.stage-head', {},
        el('h2', {}, 'Traits'),
        el('button.btn.tiny.ghost', { onclick: function () { App.go('#/build'); } }, 'Build')),
      el('div.trait-strip', {}, s.traits.map(function (t) {
        return el('div.trait-pill' + (t.isDetriment ? '.detriment' : ''), {
          style: { borderColor: CONFIG.tierColors[t.tier] || '#555' },
          title: t.description
        },
          el('span.tier-dot', { style: { background: CONFIG.tierColors[t.tier] || '#555' } }),
          el('span', {}, t.name));
      })));
  }

  function achievements(s) {
    return el('section.card', {},
      el('h2', {}, 'Achievements'),
      el('div.ach-list', {}, s.achievements.map(function (a) {
        return el('div.ach-row', {},
          Icons.node(a.iconSlug, 'lg'),
          el('div', {},
            el('div.ach-name', {}, a.name),
            el('div.muted.small', {}, a.description || ''),
            a.earnedAt ? el('div.muted.small', {}, fmtDate(a.earnedAt)) : null));
      })));
  }

  function hinges(c) {
    var h = c.hinges || {};
    return el('section.card.hinges', {},
      el('h2', {}, 'Hinges'),
      el('p.muted.small', {}, 'The System keeps these on file.'),
      el('div.hinge-grid', {},
        hingeCard('Past Trauma', h.pastTrauma),
        hingeCard('Loose End', h.looseEnd),
        hingeCard('Regret', h.regret)));
  }

  function hingeCard(label, text) {
    return el('div.hinge-card', {},
      el('div.hinge-label', {}, label),
      el('div.hinge-text', {}, text || '—'));
  }

  /* ---- Edit identity ------------------------------------------------------------ */

  function editIdentity() {
    var c = Store.state.character;
    var name = textInput(c.name);
    var h = c.hinges || {};
    var trauma = textInput(h.pastTrauma);
    var loose = textInput(h.looseEnd);
    var regret = textInput(h.regret);

    openModal({
      title: 'Edit details',
      body: el('div', {},
        field('Crawler name', name),
        field('Past Trauma', trauma),
        field('Loose End', loose),
        field('Regret', regret)),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            Store.saveCharacter({
              name: name.value.trim(),
              hinges: { pastTrauma: trauma.value, looseEnd: loose.value, regret: regret.value }
            }).then(App.render);
          }
        }
      ]
    });
  }

  /* ---- PNG export ---------------------------------------------------------------- */

  /* html2canvas taints on cross-origin <img>, which is precisely why icons are
   * inlined SVG. We still warm the icon cache first so no glyph is mid-fetch
   * when the canvas snapshot is taken. */
  function exportPng() {
    if (typeof html2canvas !== 'function') {
      toast('Export library did not load — check your connection.', 'bad');
      return;
    }
    var s = Store.state;
    var slugs = []
      .concat(s.skills.map(function (x) { return x.iconSlug; }))
      .concat(s.equipment.map(function (x) { return x.iconSlug; }))
      .concat(s.statuses.map(function (x) { return x.iconSlug; }))
      .concat(s.achievements.map(function (x) { return x.iconSlug; }));

    toast('Rendering sheet…');
    Icons.preload(slugs).then(function () {
      var node = document.getElementById('sheet-capture');
      return html2canvas(node, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        useCORS: false
      });
    }).then(function (canvas) {
      var a = document.createElement('a');
      a.download = (Store.state.character.name || 'crawler').replace(/\s+/g, '-').toLowerCase() + '-sheet.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      toast('Sheet exported.');
    }).catch(function (e) {
      console.error('[qm] export failed', e);
      toast('Export failed — ' + (e.message || 'unknown error'), 'bad');
    });
  }

  return { render: render };
})();
