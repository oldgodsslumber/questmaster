/* Questmaster — character creation (M1).
 *
 * Follows the book's creation flowchart in order: backgrounds -> attribute
 * array -> derived stats -> flavor & gear. The one liberty taken is showing the
 * derived stats live as you assign the array, because watching Mana track your
 * INT choice is the whole reason to assign it thoughtfully.
 */
window.ViewCreate = (function () {

  function render(host) {
    var draft = {
      name: '',
      picks: {},             /* stage key -> background object */
      weaponSkill: SEED.weaponSkills[0],
      gearPack: SEED.gearPacks[0],
      customGear: [],        /* homebrew gear packs added during creation */
      customSkills: [],      /* extra skills the player defined: {name, rank, iconSlug} */
      className: null,        /* optional starting calling */
      classBlurb: '',
      isEarthClass: false,
      customClass: false,
      assignment: {},        /* attr key -> score from the array */
      hinges: { pastTrauma: '', looseEnd: '', regret: '' }
    };

    var step = 0;
    var steps = [stepIdentity, stepBackgrounds, stepAttributes, stepCalling, stepFlavor];
    var stepNames = ['Identity', 'Background', 'Attributes', 'Calling', 'Psychology'];

    var body = el('div.create-body');
    var footer = el('div.create-foot');

    /* paint(resetScroll): rebuilds the current step. Picking a background or a
     * gear pack rebuilds the whole step, which collapses the page to zero height
     * and springs scroll back to the top — that's the "focus jumps up every time
     * I tap something" the wizard suffered from. So an in-step repaint restores
     * the scroll offset (and any focused field) it had before the rebuild;
     * moving between steps passes resetScroll=true to start fresh at the top. */
    function paint(resetScroll) {
      var prevScroll = resetScroll ? 0 : (window.scrollY || document.documentElement.scrollTop || 0);
      var focus = null;
      var active = document.activeElement;
      if (!resetScroll && active && active.getAttribute && active.getAttribute('data-focus-key') && body.contains(active)) {
        focus = { key: active.getAttribute('data-focus-key'), start: active.selectionStart, end: active.selectionEnd };
      }

      clear(body);
      clear(footer);
      steps[step](body, draft, paint);

      footer.appendChild(el('button.btn.ghost', {
        disabled: step === 0,
        onclick: function () { step--; paint(true); }
      }, 'Back'));

      var problem = validate(step, draft);
      footer.appendChild(el('div.create-problem', {}, problem || ''));

      if (step < steps.length - 1) {
        footer.appendChild(el('button.btn.primary', {
          disabled: !!problem,
          onclick: function () { step++; paint(true); }
        }, 'Continue'));
      } else {
        footer.appendChild(el('button.btn.primary', {
          disabled: !!problem,
          onclick: function (e) { submit(e.target, draft); }
        }, 'Enter the Dungeon'));
      }

      $$('.create-dot', crumbs).forEach(function (d, i) {
        d.classList.toggle('on', i === step);
        d.classList.toggle('done', i < step);
      });

      window.scrollTo(0, prevScroll);
      /* A tall step (Background) isn't fully laid out the instant we restore, so
       * the first scrollTo can clamp short; re-apply once the frame settles. */
      if (!resetScroll && prevScroll) {
        requestAnimationFrame(function () { window.scrollTo(0, prevScroll); });
      }
      if (focus) {
        var next = body.querySelector('[data-focus-key="' + focus.key + '"]');
        if (next) {
          next.focus();
          if (focus.start != null && next.setSelectionRange) {
            try { next.setSelectionRange(focus.start, focus.end); } catch (e) { /* non-text field */ }
          }
        }
      }
    }

    var crumbs = el('div.create-crumbs', {}, stepNames.map(function (n, i) {
      return el('div.create-dot', {}, el('span.create-dot-n', {}, String(i + 1)), el('span', {}, n));
    }));

    host.appendChild(el('div.create', {},
      el('header.create-head', {},
        el('h1', {}, 'Crawler Registration'),
        el('p.create-sub', {}, 'The System requires a complete record before floor entry. Answer honestly; it already knows.')),
      crumbs, body, footer));

    paint();
  }

  /* ---- Validation --------------------------------------------------------- */

  function validate(step, draft) {
    if (step === 0) {
      if (!draft.name.trim()) return 'Your crawler needs a name.';
      return null;
    }
    if (step === 1) {
      var missing = SEED.stages.filter(function (s) { return !draft.picks[s.key]; });
      if (missing.length) return 'Choose a ' + missing[0].label.toLowerCase() + '.';
      return null;
    }
    if (step === 2) {
      var used = CONFIG.attributeKeys.filter(function (k) { return draft.assignment[k] !== undefined; });
      if (used.length < CONFIG.attributeKeys.length) {
        return 'Assign all five values: ' + CONFIG.attributeArray.join(', ') + '.';
      }
      return null;
    }
    /* Step 3 (Calling) is entirely optional — a crawler can pick a class later
     * in the Build screen, so there is nothing to validate. */
    if (step === 4) {
      var h = draft.hinges;
      if (!h.pastTrauma || !h.looseEnd || !h.regret) return 'All three hinges are required.';
      return null;
    }
    return null;
  }

  /* ---- Step 1: identity + gear -------------------------------------------- */

  function stepIdentity(host, draft, paint) {
    var nameIn = textInput(draft.name, 'e.g. Carl');
    nameIn.addEventListener('input', function () { draft.name = nameIn.value; paint2(); });
    /* Repaint only the footer on typing, so the field doesn't lose focus. */
    function paint2() {
      var problem = validate(0, draft);
      var btn = $('.create-foot .btn.primary');
      var msg = $('.create-foot .create-problem');
      if (btn) btn.disabled = !!problem;
      if (msg) msg.textContent = problem || '';
    }

    host.appendChild(el('section.card', {},
      el('h2', {}, 'Who are you?'),
      field('Crawler name', nameIn, 'The name the announcers will mispronounce.')));

    var gearOptions = SEED.gearPacks.concat(draft.customGear);

    host.appendChild(el('section.card', {},
      el('h2', {}, 'What were you wearing?'),
      el('p.muted', {}, 'You had no warning. Whatever was on your body when the floor opened is what you have. Not on the list? Make your own.'),
      el('div.pick-grid', {}, gearOptions.map(function (pack) {
        return el('button.pick' + (draft.gearPack === pack ? '.on' : ''), {
          type: 'button',
          onclick: function () { draft.gearPack = pack; paint(); }
        },
          Icons.node(pack.icon, 'lg'),
          el('div.pick-name', {}, pack.name, pack.custom ? el('span.custom-chip', {}, 'custom') : null),
          el('div.pick-detail', {}, pack.items.join(' · ')));
      }).concat([
        el('button.pick.pick-add', {
          type: 'button',
          onclick: function () { addCustomGear(draft, paint); }
        }, el('div.pick-add-plus', {}, '+'), el('div.pick-name', {}, 'Custom pack'))
      ]))));
  }

  /* Homebrew gear: a name and a comma-separated list of whatever you decide you
   * were carrying. It joins the grid and is selected immediately. */
  function addCustomGear(draft, paint) {
    var name = textInput('', 'Bike Courier Pack');
    var items = textInput('', 'Messenger bag, U-lock, energy gel, one glove');
    openModal({
      title: 'Custom gear pack',
      body: el('div', {},
        field('Pack name', name),
        field('Items', items, 'Comma-separated. Deliberately useless is on-brand.')),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Add', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('Give the pack a name.', 'bad'); return false; }
            var list = items.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            if (!list.length) list = ['Whatever you had on'];
            var pack = { name: name.value.trim(), items: list, icon: 'delapouite/backpack', custom: true };
            draft.customGear.push(pack);
            draft.gearPack = pack;
            paint();
          }
        }
      ]
    });
  }

  /* ---- Step 2: backgrounds ------------------------------------------------- */

  function stepBackgrounds(host, draft, paint) {
    host.appendChild(el('section.card', {},
      el('h2', {}, 'Four stages of a life on Earth'),
      el('p.muted', {}, 'Each grants two stats at a fixed rank. Career counts for the most — it is what you actually spent your days doing.')));

    SEED.stages.forEach(function (stage) {
      var chosen = draft.picks[stage.key];
      host.appendChild(el('section.card', {},
        el('div.stage-head', {},
          el('h3', {}, stage.label),
          el('span.rank-chip', {}, 'Rank ' + stage.rank)),
        el('p.muted', {}, stage.blurb),
        el('div.pick-grid.compact', {}, SEED.backgrounds[stage.key].map(function (bg) {
          return el('button.pick' + (chosen === bg ? '.on' : ''), {
            type: 'button',
            onclick: function () { draft.picks[stage.key] = bg; paint(); }
          },
            el('div.pick-name', {}, bg.name),
            el('div.pick-detail', {}, bg.skills.join(' · ')));
        }))));
    });

    var weaponSel = selectInput(SEED.weaponSkills.map(function (w) {
      return { value: w, label: w };
    }), draft.weaponSkill);
    weaponSel.addEventListener('change', function () { draft.weaponSkill = weaponSel.value; });

    host.appendChild(el('section.card', {},
      el('div.stage-head', {}, el('h3', {}, 'Weapon training'), el('span.rank-chip', {}, 'Rank 3')),
      el('p.muted', {}, 'Everyone arrives knowing Unarmed Combat at Rank 3. Pick one weapon you also happen to know.'),
      field('Specialised weapon stat', weaponSel)));

    host.appendChild(customSkillCard(draft, paint));
    host.appendChild(previewSkills(draft));
  }

  /* Homebrew skills: whatever Earth taught you that isn't on the background
   * lists. They merge into your starting skills at the rank you set, and you can
   * always add more from the Skills tab later. */
  function customSkillCard(draft, paint) {
    return el('section.card', {},
      el('div.stage-head', {}, el('h3', {}, 'Stats of your own'), el('span.rank-chip', {}, 'Optional')),
      el('p.muted', {}, 'Add anything the lists missed — Parkour, Coding, Falconry. Duplicates of a granted stat keep the higher rank.'),
      draft.customSkills.length
        ? el('div.custom-skill-list', {}, draft.customSkills.map(function (s, i) {
          return el('div.custom-skill-row', {},
            Icons.node(s.iconSlug),
            el('span.custom-skill-name', {}, s.name),
            el('span.rank-chip', {}, 'R' + s.rank),
            el('button.icon-btn.subtle', {
              type: 'button',
              onclick: function () { draft.customSkills.splice(i, 1); paint(); }
            }, '✕'));
        }))
        : null,
      el('button.btn.tiny.primary', { type: 'button', onclick: function () { addCustomSkill(draft, paint); } }, '+ Add stat'));
  }

  function addCustomSkill(draft, paint) {
    var name = textInput('', 'Parkour');
    var rank = numInput(1, 0, CONFIG.skillRankMax);
    var iconSlug = null;
    var iconCtl = Icons.iconField(null, function (v) { iconSlug = v; });
    openModal({
      title: 'Custom stat',
      body: el('div', {},
        field('Name', name),
        el('div.form-row', {}, field('Icon', iconCtl), field('Starting rank', rank, 'Cap ' + CONFIG.skillRankMax))),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Add', kind: 'primary', onClick: function () {
            var nm = name.value.trim();
            if (!nm) { toast('A stat needs a name.', 'bad'); return false; }
            draft.customSkills.push({
              name: nm,
              rank: Math.max(0, Math.min(CONFIG.skillRankMax, parseInt(rank.value, 10) || 0)),
              iconSlug: iconSlug || SEED.skillIcons[titleCase(nm)] || null
            });
            paint();
          }
        }
      ]
    });
  }

  /* Shows exactly what the sheet will end up with, duplicates already merged. */
  function previewSkills(draft) {
    var merged = mergeSkills(draft);
    return el('section.card.preview', {},
      el('h3', {}, 'Stats you will start with'),
      el('div.skill-preview', {}, merged.map(function (s) {
        return el('span.skill-chip', {}, Icons.node(s.iconSlug), s.name, el('b', {}, 'R' + s.rank));
      })));
  }

  /* A skill granted twice takes the higher rank rather than stacking — two
   * backgrounds that both teach First Aid shouldn't outrun your career. */
  function mergeSkills(draft) {
    var byName = {};
    function put(name, rank) {
      if (!byName[name] || byName[name].rank < rank) {
        byName[name] = { name: name, rank: rank, xp: 0, iconSlug: SEED.skillIcons[name] || null, description: '' };
      }
    }
    function putSkill(name, rank, iconSlug) {
      if (!byName[name] || byName[name].rank < rank) {
        byName[name] = { name: name, rank: rank, xp: 0, iconSlug: iconSlug || SEED.skillIcons[name] || null, description: '' };
      }
    }
    SEED.stages.forEach(function (stage) {
      var bg = draft.picks[stage.key];
      if (bg) bg.skills.forEach(function (s) { put(s, stage.rank); });
    });
    SEED.starterSkills.forEach(function (s) { put(s.name, s.rank); });
    put(draft.weaponSkill, 3);
    (draft.customSkills || []).forEach(function (s) { putSkill(s.name, s.rank, s.iconSlug); });
    return Object.keys(byName).sort().map(function (k) { return byName[k]; });
  }

  /* ---- Step 3: the attribute array ----------------------------------------- */

  function stepAttributes(host, draft, paint) {
    var pool = CONFIG.attributeArray.slice();
    CONFIG.attributeKeys.forEach(function (k) {
      var v = draft.assignment[k];
      if (v === undefined) return;
      var i = pool.indexOf(v);
      if (i !== -1) pool.splice(i, 1);
    });

    host.appendChild(el('section.card', {},
      el('h2', {}, 'Distribute the array'),
      el('p.muted', {}, 'Five values — ' + CONFIG.attributeArray.join(', ') + ' — one to each attribute. Tap an attribute, then a value.'),
      el('div.array-pool', {}, CONFIG.attributeArray.map(function (v) {
        return el('span.array-chip' + (pool.indexOf(v) === -1 ? '.spent' : ''), {}, String(v));
      }))));

    host.appendChild(el('section.card', {}, CONFIG.attributeKeys.map(function (k) {
      var current = draft.assignment[k];

      return el('div.attr-assign', {},
        el('div.attr-assign-head', {},
          el('div', {},
            el('div.attr-name', {}, CONFIG.attributeNames[k]),
            el('div.muted.small', {}, CONFIG.attributeBlurbs[k])),
          el('div.attr-assign-val', {},
            current === undefined ? el('span.muted', {}, '—')
              : [el('b', {}, String(current)), el('span.mod-chip', {}, signed(CONFIG.scoreToModifier(current)))])),
        /* Every value in the array is always offered on every attribute — not
         * just the unassigned ones — so once all five are placed you can still
         * tap to swap. Offering only the free values used to strand a full
         * assignment with no way to rearrange it. Tapping the value another
         * attribute holds swaps the two. */
        el('div.array-choices', {}, uniq(CONFIG.attributeArray).map(function (v) {
          var heldBy = CONFIG.attributeKeys.filter(function (o) {
            return o !== k && draft.assignment[o] === v;
          })[0];
          return el('button.array-btn' + (v === current ? '.on' : '') + (heldBy ? '.taken' : ''), {
            type: 'button',
            title: heldBy ? 'Swap with ' + CONFIG.attributeNames[heldBy] : '',
            onclick: function () {
              /* Assigning a value another attribute holds swaps them, which is
               * how people actually want to rearrange five numbers. */
              CONFIG.attributeKeys.forEach(function (other) {
                if (other !== k && draft.assignment[other] === v) {
                  if (current === undefined) delete draft.assignment[other];
                  else draft.assignment[other] = current;
                }
              });
              draft.assignment[k] = v;
              paint();
            }
          }, String(v));
        })));
    })));

    host.appendChild(derivedPreview(draft));
  }

  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (v) { if (!seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort(function (a, b) { return b - a; });
  }

  function derivedPreview(draft) {
    var a = draft.assignment;
    var complete = CONFIG.attributeKeys.every(function (k) { return a[k] !== undefined; });
    if (!complete) {
      return el('section.card.preview', {}, el('p.muted', {}, 'Derived stats appear once all five are assigned.'));
    }
    var d = Engine.derive({ character: { attributes: a, floorLevel: CONFIG.defaultFloorLevel, size: CONFIG.defaultSize } });
    return el('section.card.preview', {},
      el('h3', {}, 'Derived stats'),
      el('div.derived-grid', {},
        stat('Health', d.maxHealth, CONFIG.healthSlots + ' slots × ' + d.slotCapacity),
        stat('Mana', d.maxMana, 'raw INT'),
        stat('Passive Evade', d.evade, '10 + DEX mod + floor'),
        stat('Size', d.size, 'human default'),
        stat('AI Favor', CONFIG.startingAiFavor, 'starting')));
  }

  function stat(label, value, note) {
    return el('div.derived', {},
      el('div.derived-val', {}, String(value)),
      el('div.derived-label', {}, label),
      el('div.derived-note', {}, note));
  }

  /* ---- Step 4: calling (optional class) ------------------------------------- */

  /* The book puts races and classes behind Floor 3 and the full point-buy lives
   * in the Build screen. This is the light on-ramp: pick a starting class (or
   * invent one) now if you already know what you are, or skip it and decide
   * later. Earth-gated classes are intentionally not offered here — they need an
   * Earth-native ancestry, which is a Build-screen decision. */
  function stepCalling(host, draft, paint) {
    host.appendChild(el('section.card', {},
      el('h2', {}, 'What are you becoming?'),
      el('p.muted', {}, 'Optional. Choose a starting class, write your own, or skip it and pick one later in the Build screen. Traits and point-buy always live there.')));

    var options = [{ name: null, blurb: 'Stay classless for now — decide in the Build screen once you are on your feet.', decideLater: true }]
      .concat(BUILD.classes.filter(function (c) { return !c.isEarth; }));

    host.appendChild(el('section.card', {},
      el('div.pick-grid.compact', {}, options.map(function (c) {
        var isDecideLater = c.decideLater;
        var on = isDecideLater
          ? (!draft.customClass && !draft.className)
          : (!draft.customClass && draft.className === c.name);
        return el('button.pick' + (on ? '.on' : ''), {
          type: 'button',
          onclick: function () {
            draft.customClass = false;
            draft.className = c.name;
            draft.classBlurb = c.blurb || '';
            draft.isEarthClass = false;
            paint();
          }
        },
          isDecideLater ? el('div.pick-add-plus', {}, '—') : Icons.node(c.iconSlug, 'lg'),
          el('div.pick-name', {}, isDecideLater ? 'Decide later' : c.name),
          el('div.pick-detail', {}, c.blurb));
      }))));

    var customOn = draft.customClass;
    host.appendChild(el('section.card', {},
      el('div.stage-head', {}, el('h3', {}, 'Homebrew a class'), el('span.rank-chip', {}, 'Custom')),
      el('p.muted', {}, 'Not on the list? Name your own calling. It has no preset traits — you can still buy race and detriment traits in the Build screen.'),
      el('button.pick' + (customOn ? '.on' : '') + '.pick-wide', {
        type: 'button',
        onclick: function () { addCustomClass(draft, paint); }
      },
        Icons.node('lorc/spikes-full', 'lg'),
        el('div', {},
          el('div.pick-name', {}, customOn && draft.className ? draft.className : 'Define a custom class',
            customOn ? el('span.custom-chip', {}, 'custom') : null),
          el('div.pick-detail', {}, customOn && draft.classBlurb ? draft.classBlurb : 'Tap to name your own.')))));
  }

  function addCustomClass(draft, paint) {
    var name = textInput(draft.customClass ? draft.className : '', 'Storm Chaser');
    var blurb = textArea(draft.customClass ? draft.classBlurb : '', 'One line on what this calling is.', 2);
    openModal({
      title: 'Custom class',
      body: el('div', {},
        field('Class name', name),
        field('Description', blurb)),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Use this class', kind: 'primary', onClick: function () {
            if (!name.value.trim()) { toast('Give the class a name.', 'bad'); return false; }
            draft.customClass = true;
            draft.className = name.value.trim();
            draft.classBlurb = blurb.value.trim();
            draft.isEarthClass = false;
            paint();
          }
        }
      ]
    });
  }

  /* ---- Step 5: hinges ------------------------------------------------------- */

  function stepFlavor(host, draft, paint) {
    host.appendChild(el('section.card', {},
      el('h2', {}, 'Three hinges'),
      el('p.muted', {}, 'The System catalogues your weak points on arrival. It will use them. Pick from the list or write your own.')));

    [
      { key: 'pastTrauma', label: 'Past Trauma' },
      { key: 'looseEnd', label: 'Loose End' },
      { key: 'regret', label: 'Regret' }
    ].forEach(function (h) {
      var custom = textInput(draft.hinges[h.key], 'Or write your own…');
      custom.setAttribute('data-focus-key', 'hinge-' + h.key);
      custom.addEventListener('input', function () {
        draft.hinges[h.key] = custom.value;
        /* Only clear the presets of THIS hinge — the old code scoped to `host`
         * and wiped the highlight on all three groups at once. */
        var group = custom.closest('section.card');
        $$('.hinge-opt', group || host).forEach(function (b) { b.classList.remove('on'); });
        var problem = validate(4, draft);
        var btn = $('.create-foot .btn.primary');
        if (btn) btn.disabled = !!problem;
        var msg = $('.create-foot .create-problem');
        if (msg) msg.textContent = problem || '';
      });

      host.appendChild(el('section.card', {},
        el('div.stage-head', {},
          el('h3', {}, h.label),
          el('button.btn.tiny.ghost', {
            type: 'button',
            onclick: function () { draft.hinges[h.key] = SEED.randomOf(SEED.hinges[h.key]); paint(); }
          }, 'Roll')),
        el('div.hinge-list', {}, SEED.hinges[h.key].map(function (opt) {
          return el('button.hinge-opt' + (draft.hinges[h.key] === opt ? '.on' : ''), {
            type: 'button',
            onclick: function () { draft.hinges[h.key] = opt; paint(); }
          }, opt);
        })),
        field('', custom)));
    });
  }

  /* ---- Submit ---------------------------------------------------------------- */

  function submit(button, draft) {
    button.disabled = true;
    button.textContent = 'Registering…';

    var attrs = {};
    CONFIG.attributeKeys.forEach(function (k) { attrs[k] = draft.assignment[k]; });

    var d = Engine.derive({ character: { attributes: attrs, floorLevel: CONFIG.defaultFloorLevel, size: CONFIG.defaultSize } });

    var character = {
      name: draft.name.trim(),
      level: 1,
      xp: 0,
      unspentAttributePoints: 0,
      attributes: attrs,
      floorLevel: CONFIG.defaultFloorLevel,
      size: CONFIG.defaultSize,
      hinges: {
        pastTrauma: draft.hinges.pastTrauma,
        looseEnd: draft.hinges.looseEnd,
        regret: draft.hinges.regret
      },
      backgrounds: SEED.stages.reduce(function (acc, s) {
        acc[s.key] = draft.picks[s.key] ? draft.picks[s.key].name : null;
        return acc;
      }, {}),
      gearPack: draft.gearPack.name,
      raceName: null,
      className: draft.className || null,
      classBlurb: draft.classBlurb || '',
      isEarthClass: !!draft.isEarthClass,
      resources: {
        currentHealth: d.maxHealth,
        currentMana: d.maxMana,
        aiFavor: CONFIG.startingAiFavor
      },
      partyId: null
    };

    Store.createCharacter(character)
      .then(function () {
        var jobs = [];

        mergeSkills(draft).forEach(function (s) { jobs.push(Store.add('skills', s)); });

        SEED.starterSpells.forEach(function (sp) {
          jobs.push(Store.add('spells', Object.assign({}, sp)));
        });

        draft.gearPack.items.forEach(function (name) {
          jobs.push(Store.add('items', { name: name, iconSlug: null, description: 'From the ' + draft.gearPack.name + '.', quantity: 1 }));
        });

        jobs.push(Store.ensureDefaultLogbook());
        return Promise.all(jobs);
      })
      .then(function () {
        return Store.logEvent('created',
          draft.name.trim() + ' entered the dungeon wearing the ' + draft.gearPack.name + '. The System recorded three hinges and began watching.');
      })
      .then(function () {
        fanfare('Registered', 'Welcome to the dungeon, ' + draft.name.trim() + '.');
        App.afterCreate();
      })
      .catch(function (e) {
        console.error('[qm] creation failed', e);
        toast('Registration failed — ' + (e.message || 'try again'), 'bad');
        button.disabled = false;
        button.textContent = 'Enter the Dungeon';
      });
  }

  return { render: render };
})();
