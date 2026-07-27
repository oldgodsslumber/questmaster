/* Questmaster — the journal.
 *
 * Strictly this is M5 territory, but M1-M4 all write auto-events (level-ups,
 * rank-ups, quest turn-ins, casts, build changes) and an event log nobody can
 * read is not worth writing. So the solo half ships now: named logbooks, the
 * templated composer, and the chronological feed. Posting an entry to the party
 * is the part that genuinely needs the party layer, and it is stubbed as such.
 */
window.ViewJournal = (function () {

  var currentId = null;
  var loading = false;

  function render(host) {
    var books = Store.state.logbooks;

    if (!books.length) {
      Store.ensureDefaultLogbook().then(App.render);
      host.appendChild(el('p.muted', {}, 'Opening your Chronicle…'));
      return;
    }

    if (!currentId || !books.filter(function (b) { return b.id === currentId; })[0]) {
      currentId = (books.filter(function (b) { return b.isDefault; })[0] || books[0]).id;
      loadThen(host);
      return;
    }

    host.appendChild(bookSwitcher(books));
    host.appendChild(composer());

    if (loading) {
      host.appendChild(el('p.muted', {}, 'Loading entries…'));
      return;
    }

    var entries = Store.state.entries;
    if (!entries.length) {
      host.appendChild(emptyState('📖', 'Nothing written yet',
        'Use a starter above, or just keep playing — the System logs the important parts on its own.'));
      return;
    }

    entries.forEach(function (e) { host.appendChild(entryRow(e)); });
  }

  function loadThen(host) {
    loading = true;
    host.appendChild(el('p.muted', {}, 'Loading entries…'));
    Store.loadEntries(currentId).then(function () { loading = false; App.render(); });
  }

  /* ---- Logbook switcher --------------------------------------------------------- */

  function bookSwitcher(books) {
    return el('div.tabs.book-tabs', {},
      books.map(function (b) {
        return el('button.tab' + (b.id === currentId ? '.on' : ''), {
          onclick: function () {
            currentId = b.id;
            loading = true;
            Store.loadEntries(b.id).then(function () { loading = false; App.render(); });
            App.render();
          }
        }, b.name, b.isDefault ? el('span.tab-count', {}, '★') : null);
      }).concat([
        el('button.tab.add', { onclick: newLogbook, title: 'New logbook' }, '+')
      ]));
  }

  function newLogbook() {
    var name = textInput('', 'Floor 3 Notes');
    openModal({
      title: 'New logbook',
      body: el('div', {},
        el('p.modal-text', {}, 'Separate logbooks for separate threads. Auto-events always land in your default Chronicle.'),
        field('Name', name)),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Create', kind: 'primary', onClick: function () {
            if (!name.value.trim()) return false;
            Store.addLogbook(name.value.trim()).then(function (b) {
              currentId = b.id;
              return Store.loadEntries(b.id);
            }).then(App.render);
          }
        }
      ]
    });
  }

  /* ---- Composer ------------------------------------------------------------------ */

  function composer() {
    var area = textArea('', 'What happened?', 3);
    var usedTemplate = null;

    var starters = el('div.starter-strip', {}, SEED.statusStarters.map(function (s) {
      return el('button.starter', {
        onclick: function () {
          usedTemplate = s;
          area.value = s;
          area.focus();
          /* Drop the caret on the blank so you can just start typing. */
          var i = s.indexOf('___');
          if (i !== -1) area.setSelectionRange(i, i + 3);
        }
      }, s.replace(' ___', '…').replace('___', '…'));
    }));

    function post() {
      var body = area.value.trim();
      if (!body) return;
      if (body.indexOf('___') !== -1) {
        toast('Fill in the blank first.', 'bad');
        return;
      }
      Store.addEntry(currentId, { kind: 'manual', body: body, template: usedTemplate })
        .then(function () { return Store.loadEntries(currentId); })
        .then(function () { toast('Logged.'); App.render(); });
    }

    return el('section.card.composer', {},
      el('details', {}, el('summary', {}, 'Starters'), starters),
      area,
      el('div.composer-foot', {},
        el('span.muted.small', {}, 'Private. Posting to a party feed arrives with the party layer.'),
        el('button.btn.primary', { onclick: post }, 'Log it')));
  }

  /* ---- Entries -------------------------------------------------------------------- */

  function entryRow(e) {
    var isAuto = e.kind === 'auto';
    return el('div.entry' + (isAuto ? '.auto' : ''), {},
      el('div.entry-head', {},
        el('span.entry-kind', {}, isAuto ? (SEED.eventLabels[e.eventType] || 'System') : 'Entry'),
        el('span.muted.small', {}, fmtDate(e.createdAt)),
        el('button.icon-btn.subtle', {
          title: 'Delete entry',
          onclick: function () {
            Store.removeEntry(currentId, e.id).then(App.render);
          }
        }, '✕')),
      el('div.entry-body', {}, e.body));
  }

  return { render: render };
})();
