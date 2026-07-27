/* Questmaster — inventory: items, equipment and spells (M3).
 *
 * The three are deliberately different kinds of thing:
 *   equipment  carries modifiers, but only while equipped
 *   items      carry none at all — they are inert flavour and consumables
 *   spells     are cast, spending mana; they never apply passively
 *
 * That split is what keeps the effective-stat engine honest.
 */
window.ViewInventory = (function () {

  var tab = 'equipment';

  function render(host) {
    host.appendChild(el('div.tabs', {}, [
      ['equipment', 'Equipment'], ['items', 'Items'], ['spells', 'Spells'], ['abilities', 'Skills'], ['lootboxes', 'Boxes']
    ].map(function (t) {
      return el('button.tab' + (tab === t[0] ? '.on' : ''), {
        onclick: function () { tab = t[0]; App.render(); }
      }, t[1], el('span.tab-count', {}, (Store.state[t[0]] || []).length));
    })));

    if (tab === 'equipment') renderEquipment(host);
    if (tab === 'items') renderItems(host);
    if (tab === 'spells') renderSpells(host);
    if (tab === 'abilities') renderAbilities(host);
    if (tab === 'lootboxes') renderBoxes(host);
  }

  /* A small coloured rarity tag, shown on looted gear and items. */
  function rarityChip(rarity) {
    if (!rarity || !CONFIG.rarities[rarity]) return null;
    var m = CONFIG.rarities[rarity];
    return el('span.rarity-chip', { style: { color: m.color, borderColor: m.color } }, m.label);
  }

  /* ---- Equipment ------------------------------------------------------------ */

  function renderEquipment(host) {
    var list = Store.state.equipment;

    if (!list.length) {
      host.appendChild(emptyState('🛡️', 'No equipment', 'Loot something, then give it modifiers.'));
    }

    /* Equipped first — those are the ones actually doing anything. */
    list.slice().sort(function (a, b) {
      if (!!a.equipped !== !!b.equipped) return a.equipped ? -1 : 1;
      return String(a.name).localeCompare(b.name);
    }).forEach(function (e) {
      host.appendChild(el('div.inv-row' + (e.equipped ? '.equipped' : '') + (e.rarity ? '.rar-' + e.rarity : ''), {},
        Icons.node(e.iconSlug, 'lg'),
        el('div.inv-main', { onclick: function () { editEquipment(e); } },
          el('div.inv-name', {},
            e.name,
            rarityChip(e.rarity),
            e.slot ? el('span.slot-chip', {}, SEED.slotLabel(e.slot)) : null),
          e.description ? el('div.muted.small', {}, e.description) : null,
          ModEditor.summary(e.modifiers)),
        el('button.btn.tiny' + (e.equipped ? '.ghost' : '.primary'), {
          onclick: function () { toggleEquip(e); }
        }, e.equipped ? 'Unequip' : 'Equip')));
    });

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editEquipment(null); } }, 'New equipment')));
  }

  /* Named slots hold one thing each, so equipping into an occupied slot swaps
   * rather than stacking two helmets' modifiers. */
  function toggleEquip(e) {
    if (e.equipped) {
      Store.update('equipment', e.id, { equipped: false }).then(function () {
        toast(e.name + ' unequipped.');
        App.render();
      });
      return;
    }
    if (!e.slot) {
      toast('Give it a slot first — nothing can be equipped nowhere.', 'bad');
      editEquipment(e);
      return;
    }
    var occupant = Store.state.equipment.filter(function (x) {
      return x.equipped && x.slot === e.slot && x.id !== e.id;
    })[0];

    var first = occupant ? Store.update('equipment', occupant.id, { equipped: false }) : Promise.resolve();
    first.then(function () { return Store.update('equipment', e.id, { equipped: true }); })
      .then(function () {
        toast(occupant ? e.name + ' equipped, ' + occupant.name + ' removed.' : e.name + ' equipped.');
        App.render();
      });
  }

  function editEquipment(e) {
    var isNew = !e;
    var name = textInput(e ? e.name : '', 'Cracked Riot Helmet');
    var desc = textArea(e ? e.description : '', 'Where it came from, what it smells like.', 2);
    var slot = selectInput(
      [{ value: '', label: '— no slot —' }].concat(SEED.equipSlots.map(function (s) {
        return { value: s.key, label: s.label };
      })), e ? e.slot || '' : '');
    var iconSlug = e ? e.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (s) { iconSlug = s; });
    var mods = ModEditor.create(e ? e.modifiers : []);

    openModal({
      title: isNew ? 'New equipment' : 'Edit equipment',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Slot', slot)),
        field('Description', desc),
        el('div.field', {},
          el('span.field-label', {}, 'Modifiers'),
          el('span.field-hint', {}, 'Applied only while equipped.'),
          mods)),
      actions: (isNew ? [] : [{
        label: 'Delete', kind: 'danger', onClick: function () {
          confirmModal('Delete ' + e.name + '?', 'This cannot be undone.', function () {
            Store.remove('equipment', e.id).then(App.render);
          });
        }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              slot: slot.value || null,
              iconSlug: iconSlug,
              modifiers: mods.getMods()
            };
            if (isNew) patch.equipped = false;
            /* Unequip if the slot moved out from under it, so a piece can never
             * be "equipped" to a slot it no longer occupies. */
            if (!isNew && e.equipped && patch.slot !== e.slot) patch.equipped = false;

            var op = isNew ? Store.add('equipment', patch) : Store.update('equipment', e.id, patch);
            op.then(function () { App.render(); });
          }
        }
      ])
    });
  }

  /* ---- Items ----------------------------------------------------------------- */

  function renderItems(host) {
    var list = Store.state.items;
    if (!list.length) {
      host.appendChild(emptyState('🎒', 'Empty pack', 'Items are inert — flavour, consumables, quest junk. Anything with a passive bonus belongs in Equipment.'));
    }

    list.forEach(function (it) {
      host.appendChild(el('div.inv-row' + (it.rarity ? '.rar-' + it.rarity : ''), {},
        Icons.node(it.iconSlug, 'lg'),
        el('div.inv-main', { onclick: function () { editItem(it); } },
          el('div.inv-name', {}, it.name,
            rarityChip(it.rarity),
            (it.quantity || 1) > 1 ? el('span.qty-chip', {}, '×' + it.quantity) : null),
          it.description ? el('div.muted.small', {}, it.description) : null),
        el('div.qty-controls', {},
          el('button.stepper-btn', { onclick: function () { setQty(it, (it.quantity || 1) - 1); } }, '−'),
          el('button.stepper-btn', { onclick: function () { setQty(it, (it.quantity || 1) + 1); } }, '+'))));
    });

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editItem(null); } }, 'New item')));
  }

  /* Dropping to zero removes the stack rather than leaving a ghost row. */
  function setQty(it, n) {
    if (n <= 0) {
      confirmModal('Use the last one?', 'That removes ' + it.name + ' from your pack.', function () {
        Store.remove('items', it.id).then(function () { toast(it.name + ' used up.'); App.render(); });
      }, 'Remove');
      return;
    }
    Store.update('items', it.id, { quantity: n }).then(App.render);
  }

  function editItem(it) {
    var isNew = !it;
    var name = textInput(it ? it.name : '', 'Half a sandwich');
    var desc = textArea(it ? it.description : '', '', 2);
    var qty = numInput(it ? it.quantity || 1 : 1, 1);
    var iconSlug = it ? it.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (s) { iconSlug = s; });

    openModal({
      title: isNew ? 'New item' : 'Edit item',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Quantity', qty)),
        field('Description', desc),
        el('div.note', {}, 'Items never apply passive modifiers. If it should buff you while carried, make it Equipment.')),
      actions: (isNew ? [] : [{
        label: 'Delete', kind: 'danger', onClick: function () { Store.remove('items', it.id).then(App.render); }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              quantity: Math.max(1, parseInt(qty.value, 10) || 1),
              iconSlug: iconSlug
            };
            var op = isNew ? Store.add('items', patch) : Store.update('items', it.id, patch);
            op.then(function () {
              if (isNew) Store.logEvent('item-gained', 'Acquired ' + patch.name + '.');
              App.render();
            });
          }
        }
      ])
    });
  }

  /* ---- Spells ----------------------------------------------------------------- */

  function renderSpells(host) {
    var list = Store.state.spells;
    var d = Engine.derive(Store.state);
    var mana = (Store.state.character.resources || {}).currentMana || 0;

    host.appendChild(el('div.mana-strip', {},
      el('span', {}, 'Mana'),
      bar(d.maxMana ? (mana / d.maxMana) * 100 : 0, 'mana'),
      el('b', {}, mana + ' / ' + d.maxMana)));

    if (!list.length) {
      host.appendChild(emptyState('✨', 'No spells', 'Every crawler starts with Heal. If yours is missing, add it back.'));
    }

    list.forEach(function (sp) {
      var affordable = mana >= (sp.manaCost || 0);
      host.appendChild(el('div.inv-row', {},
        Icons.node(sp.iconSlug, 'lg'),
        el('div.inv-main', { onclick: function () { editSpell(sp); } },
          el('div.inv-name', {}, sp.name,
            el('span.rank-chip', {}, 'Rank ' + (sp.rank || 1)),
            el('span.mana-chip', {}, (sp.manaCost || 0) + ' mana')),
          sp.description ? el('div.muted.small', {}, sp.description) : null),
        el('button.btn.tiny' + (affordable ? '.primary' : '.ghost'), {
          disabled: !affordable,
          title: affordable ? '' : 'Not enough mana',
          onclick: function () { cast(sp, d); }
        }, 'Cast')));
    });

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editSpell(null); } }, 'New spell')));
  }

  /* Casting is entirely manual, as the whole app is: it checks and spends mana,
   * applies whatever the spell says it does, and writes it to the Chronicle.
   * Nothing here simulates a combat round. */
  function cast(sp, d) {
    var c = Store.state.character;
    var res = Object.assign({}, c.resources || {});
    var cost = sp.manaCost || 0;

    if ((res.currentMana || 0) < cost) { toast('Not enough mana.', 'bad'); return; }
    res.currentMana -= cost;

    var note = '';
    if (sp.effect === 'heal') {
      /* BOOK: Heal restores whole Health Slots, not a flat number of points. */
      var restored = (sp.effectValue || 0) * d.slotCapacity;
      var before = res.currentHealth || 0;
      res.currentHealth = Math.min(d.maxHealth, before + restored);
      note = ' Restored ' + (res.currentHealth - before) + ' health (' + (sp.effectValue || 0) + ' slots).';
    }

    var chain = Store.saveCharacter({ resources: res });

    if (sp.onCastStatus && sp.onCastStatus.name) {
      chain = chain.then(function () {
        return Store.add('statuses', {
          name: sp.onCastStatus.name,
          iconSlug: sp.iconSlug,
          description: 'Applied by casting ' + sp.name + '.',
          polarity: sp.onCastStatus.polarity || 'buff',
          modifiers: sp.onCastStatus.modifiers || [],
          appliedAt: Date.now(),
          expiresAt: sp.onCastStatus.durationMins
            ? Date.now() + sp.onCastStatus.durationMins * 60000
            : null
        });
      });
      note += ' ' + sp.onCastStatus.name + ' applied.';
    }

    chain.then(function () {
      Store.logEvent('spell-cast', 'Cast ' + sp.name + ' for ' + cost + ' mana.' + note);
      toast('Cast ' + sp.name + '.' + note);
      App.render();
    });
  }

  function editSpell(sp) {
    var isNew = !sp;
    var name = textInput(sp ? sp.name : '', 'Heal');
    var desc = textArea(sp ? sp.description : '', '', 2);
    var rank = numInput(sp ? sp.rank || 1 : 1, 1);
    var cost = numInput(sp ? sp.manaCost || 0 : 2, 0);
    var iconSlug = sp ? sp.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (s) { iconSlug = s; });

    var effect = selectInput([
      { value: '', label: 'Nothing mechanical' },
      { value: 'heal', label: 'Restore health slots' }
    ], sp ? sp.effect || '' : '');
    var effectVal = numInput(sp ? sp.effectValue || 0 : 2, 0);
    var effectValWrap = field('Slots restored', effectVal);

    function syncEffect() { effectValWrap.style.display = effect.value === 'heal' ? '' : 'none'; }
    effect.addEventListener('change', syncEffect);

    /* Optional linked status — casting a buff spell should be one tap, not
     * "cast, then go to Buffs and add the thing it did". */
    var st = (sp && sp.onCastStatus) || null;
    var stName = textInput(st ? st.name : '', 'Leave blank for none');
    var stPolarity = selectInput([
      { value: 'buff', label: 'Buff' }, { value: 'debuff', label: 'Debuff' }
    ], st ? st.polarity : 'buff');
    var stDuration = numInput(st ? st.durationMins || '' : '', 0);
    var stMods = ModEditor.create(st ? st.modifiers : []);

    openModal({
      title: isNew ? 'New spell' : 'Edit spell',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Rank', rank), field('Mana cost', cost)),
        field('Description', desc),
        field('On cast', effect), effectValWrap,
        el('details.sub-form', {},
          el('summary', {}, 'Also apply a status'),
          field('Status name', stName),
          el('div.form-row', {}, field('Polarity', stPolarity), field('Duration (mins)', stDuration, 'Blank = until cleared')),
          el('div.field', {}, el('span.field-label', {}, 'Status modifiers'), stMods))),
      actions: (isNew ? [] : [{
        label: 'Delete', kind: 'danger', onClick: function () { Store.remove('spells', sp.id).then(App.render); }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              rank: Math.max(1, parseInt(rank.value, 10) || 1),
              manaCost: Math.max(0, parseInt(cost.value, 10) || 0),
              iconSlug: iconSlug,
              effect: effect.value || null,
              effectValue: parseInt(effectVal.value, 10) || 0,
              onCastStatus: stName.value.trim() ? {
                name: stName.value.trim(),
                polarity: stPolarity.value,
                durationMins: parseInt(stDuration.value, 10) || null,
                modifiers: stMods.getMods()
              } : null
            };
            var op = isNew ? Store.add('spells', patch) : Store.update('spells', sp.id, patch);
            op.then(function () { App.render(); });
          }
        }
      ])
    });

    syncEffect();
  }

  /* ---- Skills (abilities) ----------------------------------------------------
   * The same shape as spells, minus mana — free to use, on-tap. This is the
   * "Skills" panel: loot can grant these, and they apply a heal and/or a status
   * exactly like a spell would, without spending anything. */

  function renderAbilities(host) {
    var list = Store.state.abilities || [];
    var d = Engine.derive(Store.state);

    host.appendChild(el('div.view-intro', {},
      el('p.muted', {}, 'Skills are abilities you use freely — like spells, but they cost no mana. Some loot grants them.')));

    if (!list.length) {
      host.appendChild(emptyState('🎯', 'No skills', 'Add one, or loot an item that grants a skill.'));
    }

    list.forEach(function (ab) {
      host.appendChild(el('div.inv-row', {},
        Icons.node(ab.iconSlug, 'lg'),
        el('div.inv-main', { onclick: function () { editAbility(ab); } },
          el('div.inv-name', {}, ab.name,
            ab.rank ? el('span.rank-chip', {}, 'Rank ' + ab.rank) : null,
            el('span.slot-chip', {}, 'No cost')),
          ab.description ? el('div.muted.small', {}, ab.description) : null),
        el('button.btn.tiny.primary', { onclick: function () { useAbility(ab, d); } }, 'Use')));
    });

    host.appendChild(el('div.list-foot', {},
      el('button.btn.primary', { onclick: function () { editAbility(null); } }, 'New skill')));
  }

  function useAbility(ab, d) {
    var c = Store.state.character;
    var res = Object.assign({}, c.resources || {});
    var note = '';
    var chain = Promise.resolve();

    if (ab.effect === 'heal') {
      var restored = (ab.effectValue || 0) * d.slotCapacity;
      var before = res.currentHealth || 0;
      res.currentHealth = Math.min(d.maxHealth, before + restored);
      note = ' Restored ' + (res.currentHealth - before) + ' health (' + (ab.effectValue || 0) + ' slots).';
      chain = Store.saveCharacter({ resources: res });
    }

    if (ab.onUseStatus && ab.onUseStatus.name) {
      chain = chain.then(function () {
        return Store.add('statuses', {
          name: ab.onUseStatus.name,
          iconSlug: ab.iconSlug,
          description: 'Applied by using ' + ab.name + '.',
          polarity: ab.onUseStatus.polarity || 'buff',
          modifiers: ab.onUseStatus.modifiers || [],
          appliedAt: Date.now(),
          expiresAt: ab.onUseStatus.durationMins ? Date.now() + ab.onUseStatus.durationMins * 60000 : null
        });
      });
      note += ' ' + ab.onUseStatus.name + ' applied.';
    }

    chain.then(function () {
      Store.logEvent('ability-used', 'Used ' + ab.name + '.' + note);
      toast('Used ' + ab.name + '.' + note);
      App.render();
    });
  }

  function editAbility(ab) {
    var isNew = !ab;
    var name = textInput(ab ? ab.name : '', 'Adrenaline Rush');
    var desc = textArea(ab ? ab.description : '', '', 2);
    var rank = numInput(ab ? ab.rank || 1 : 1, 1);
    var iconSlug = ab ? ab.iconSlug : null;
    var iconCtl = Icons.iconField(iconSlug, function (s) { iconSlug = s; });

    var effect = selectInput([
      { value: '', label: 'Nothing mechanical' },
      { value: 'heal', label: 'Restore health slots' }
    ], ab ? ab.effect || '' : '');
    var effectVal = numInput(ab ? ab.effectValue || 0 : 1, 0);
    var effectValWrap = field('Slots restored', effectVal);
    function syncEffect() { effectValWrap.style.display = effect.value === 'heal' ? '' : 'none'; }
    effect.addEventListener('change', syncEffect);

    var st = (ab && ab.onUseStatus) || null;
    var stName = textInput(st ? st.name : '', 'Leave blank for none');
    var stPolarity = selectInput([{ value: 'buff', label: 'Buff' }, { value: 'debuff', label: 'Debuff' }], st ? st.polarity : 'buff');
    var stDuration = numInput(st ? st.durationMins || '' : '', 0);
    var stMods = ModEditor.create(st ? st.modifiers : []);

    openModal({
      title: isNew ? 'New skill' : 'Edit skill',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Rank', rank)),
        field('Description', desc),
        field('On use', effect), effectValWrap,
        el('details.sub-form', {},
          el('summary', {}, 'Also apply a status'),
          field('Status name', stName),
          el('div.form-row', {}, field('Polarity', stPolarity), field('Duration (mins)', stDuration, 'Blank = until cleared')),
          el('div.field', {}, el('span.field-label', {}, 'Status modifiers'), stMods))),
      actions: (isNew ? [] : [{
        label: 'Delete', kind: 'danger', onClick: function () { Store.remove('abilities', ab.id).then(App.render); }
      }]).concat([
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('A name is required.', 'bad'); return false; }
            var patch = {
              name: name.value.trim(),
              description: desc.value.trim(),
              rank: Math.max(1, parseInt(rank.value, 10) || 1),
              iconSlug: iconSlug,
              effect: effect.value || null,
              effectValue: parseInt(effectVal.value, 10) || 0,
              onUseStatus: stName.value.trim() ? {
                name: stName.value.trim(),
                polarity: stPolarity.value,
                durationMins: parseInt(stDuration.value, 10) || null,
                modifiers: stMods.getMods()
              } : null
            };
            var op = isNew ? Store.add('abilities', patch) : Store.update('abilities', ab.id, patch);
            op.then(function () { App.render(); });
          }
        }
      ])
    });

    syncEffect();
  }

  /* ---- Loot boxes ------------------------------------------------------------
   * Boxes earned from quests, grouped by tier. Opening one rolls its items into
   * the relevant inventory tabs and shows a reveal. */

  function renderBoxes(host) {
    var boxes = Store.state.lootboxes || [];

    host.appendChild(el('div.view-intro', {},
      el('p.muted', {}, 'Loot boxes come from turning in quests — bigger quests, better boxes. Open one to roll its contents into your Kit.')));

    if (!boxes.length) {
      host.appendChild(emptyState('🎁', 'No boxes', 'Complete a quest to earn one. Daily chores drop Bronze; larger quests drop better.'));
      return;
    }

    /* Group by tier, best first. */
    var order = CONFIG.lootBoxes.order.slice().reverse();
    var byTier = {};
    boxes.forEach(function (b) { (byTier[b.tier] = byTier[b.tier] || []).push(b); });

    order.forEach(function (tier) {
      var group = byTier[tier];
      if (!group || !group.length) return;
      var meta = CONFIG.lootBoxes.tiers[tier];
      host.appendChild(el('section.card.box-card', { style: { borderColor: meta.color } },
        el('div.box-head', {},
          Icons.node(meta.icon, 'lg'),
          el('div.box-main', {},
            el('div.box-name', { style: { color: meta.color } }, meta.label),
            el('div.muted.small', {}, group.length + ' unopened · ' + oddsLine(tier))),
          el('button.btn.primary', { onclick: function () { openOne(group[0]); } }, 'Open')),
        group.length > 1
          ? el('button.btn.tiny.ghost.box-openall', { onclick: function () { openAll(group.slice()); } }, 'Open all ' + group.length)
          : null));
    });
  }

  function oddsLine(tier) {
    var w = CONFIG.lootBoxes.tiers[tier].weights;
    var total = 0, k; for (k in w) total += w[k];
    return CONFIG.lootBoxes.order && ['common', 'uncommon', 'rare', 'epic', 'legendary']
      .filter(function (r) { return w[r]; })
      .map(function (r) { return Math.round((w[r] / total) * 100) + '% ' + CONFIG.rarities[r].label; })
      .join(' · ');
  }

  function openOne(box) {
    Loot.openBox(box).then(function (results) {
      revealModal(box.tier, results);
      App.render();
    }).catch(function (e) { toast('Could not open that box — ' + (e.message || 'try again'), 'bad'); });
  }

  function openAll(boxes) {
    var all = [];
    var chain = Promise.resolve();
    boxes.forEach(function (b) { chain = chain.then(function () { return Loot.openBox(b).then(function (r) { all = all.concat(r); }); }); });
    chain.then(function () { revealModal(boxes[0].tier, all, boxes.length); App.render(); })
      .catch(function (e) { toast('Could not open — ' + (e.message || 'try again'), 'bad'); });
  }

  function revealModal(tier, results, count) {
    var meta = CONFIG.lootBoxes.tiers[tier];
    openModal({
      title: (count && count > 1 ? count + ' ' : '') + meta.label + (count && count > 1 ? 'es opened' : ' opened'),
      body: el('div', {},
        el('p.muted.small', {}, results.length + ' item' + (results.length === 1 ? '' : 's') + ' found:'),
        el('div.reveal-list', {}, results.length
          ? results.map(function (r) {
            var m = CONFIG.rarities[r.rarity] || CONFIG.rarities.common;
            return el('div.reveal-row', { style: { borderColor: m.color } },
              el('div.reveal-main', {},
                el('div.reveal-name', { style: { color: m.color } }, r.name,
                  el('span.rarity-chip', { style: { color: m.color, borderColor: m.color } }, m.label)),
                el('div.muted.small', {},
                  (r.kind === 'equipment' ? SEED.slotLabel(r.slot) : 'Item') +
                  (r.grant ? ' · grants ' + r.grant.name : '') +
                  (r.desc ? ' — ' + r.desc : ''))));
          })
          : el('p.muted', {}, 'The box was empty. The System apologises to no one.'))),
      actions: [{ label: 'Nice', kind: 'primary' }]
    });
  }

  return { render: render };
})();
