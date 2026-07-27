/* Questmaster — the shared modifier editor.
 *
 * Equipment, statuses and achievements all carry the same {stat, op, value}
 * list, so they all use this control. It offers the known stat keys as a
 * datalist but does not restrict to them — the engine happily tracks a stat
 * called "Focus" that exists only because you invented it on a trinket.
 */
window.ModEditor = (function () {

  function create(initial) {
    var mods = (initial || []).map(function (m) { return Object.assign({}, m); });
    var list = el('div.mod-editor');

    var datalistId = 'stat-keys-' + uid();
    var datalist = el('datalist', { id: datalistId },
      Object.keys(Engine.KNOWN_STATS).map(function (k) {
        return el('option', { value: k }, Engine.KNOWN_STATS[k]);
      }));

    function paint() {
      clear(list);
      list.appendChild(datalist);

      mods.forEach(function (m, i) {
        var statIn = el('input.input.stat', { type: 'text', value: m.stat || '', list: datalistId, placeholder: 'STR' });
        statIn.addEventListener('input', function () { mods[i].stat = statIn.value.trim(); });

        var opSel = selectInput([
          { value: 'add', label: '+' },
          { value: 'mult', label: '×' }
        ], m.op || 'add');
        opSel.classList.add('op');
        opSel.addEventListener('change', function () { mods[i].op = opSel.value; });

        var valIn = el('input.input.num', { type: 'number', step: 'any', value: m.value === undefined ? '' : m.value });
        valIn.addEventListener('input', function () { mods[i].value = parseFloat(valIn.value); });

        list.appendChild(el('div.mod-row', {}, statIn, opSel, valIn,
          el('button.icon-btn.subtle', {
            type: 'button',
            onclick: function () { mods.splice(i, 1); paint(); }
          }, '✕')));
      });

      list.appendChild(el('button.btn.tiny.ghost', {
        type: 'button',
        onclick: function () { mods.push({ stat: '', op: 'add', value: 1 }); paint(); }
      }, '+ Modifier'));

      if (!mods.length) {
        list.appendChild(el('p.muted.small', {},
          'None. Known stats: ' + Object.keys(Engine.KNOWN_STATS).join(', ') + ' — or invent your own.'));
      }
    }

    paint();

    /* Drops half-filled rows rather than persisting a modifier with no stat or
     * a NaN value, which would quietly poison every effective-stat calculation. */
    list.getMods = function () {
      return mods.filter(function (m) {
        return m.stat && typeof m.value === 'number' && !isNaN(m.value);
      }).map(function (m) {
        return { stat: m.stat, op: m.op === 'mult' ? 'mult' : 'add', value: m.value };
      });
    };

    return list;
  }

  /* Compact read-only rendering, used on cards and rows. */
  function summary(mods) {
    if (!mods || !mods.length) return null;
    return el('div.mod-summary', {}, mods.map(function (m) {
      return el('span.mod-tag' + (m.value < 0 ? '.neg' : ''), {},
        (m.op === 'mult' ? '×' + m.value : signed(m.value)) + ' ' + m.stat);
    }));
  }

  return { create: create, summary: summary };
})();
