/* Questmaster — DOM, formatting and UI-chrome helpers.
 * Loaded first; everything else assumes these exist on window. */

/* ---- DOM ---------------------------------------------------------------- */

/* el('div.card', {onclick: fn}, 'text', childNode, ...)
 * The tag string takes emmet-ish shorthand: 'button.primary.wide', 'p#intro'. */
function el(spec, attrs) {
  var m = String(spec).match(/^([a-z0-9]+)?(.*)$/i);
  var node = document.createElement(m[1] || 'div');
  var rest = m[2] || '';
  var idm = rest.match(/#([\w-]+)/);
  if (idm) { node.id = idm[1]; rest = rest.replace(idm[0], ''); }
  var classes = rest.split('.').filter(Boolean);
  if (classes.length) node.className = classes.join(' ');

  var start = 2;
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node)) {
    for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
      else node.setAttribute(k, v);
    }
  } else { start = 1; }

  for (var i = start; i < arguments.length; i++) append(node, arguments[i]);
  return node;
}

function append(parent, child) {
  if (child === null || child === undefined || child === false) return parent;
  if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return parent; }
  parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  return parent;
}

function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ---- Formatting --------------------------------------------------------- */

function signed(n) { return (n >= 0 ? '+' : '') + n; }

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* Short, human date for journal entries and streak banners. */
function fmtDate(ms) {
  if (!ms) return '';
  var d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* "in 4h", "in 2d", "now" — used on quest reset banners. */
function fmtUntil(ms) {
  var delta = ms - Date.now();
  if (delta <= 0) return 'now';
  var mins = Math.round(delta / 60000);
  if (mins < 60) return 'in ' + mins + 'm';
  var hrs = Math.round(mins / 60);
  if (hrs < 24) return 'in ' + hrs + 'h';
  return 'in ' + Math.round(hrs / 24) + 'd';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---- Markdown ----------------------------------------------------------- */

/* A deliberately small, safe Markdown renderer for journal entries and status
 * descriptions. Everything is HTML-escaped first and only a whitelist of tags
 * is ever emitted, so there is no innerHTML injection path even though the
 * content is the user's own. Supports headings, bold, italic, inline code,
 * fenced code blocks, blockquotes, bullet and numbered lists, and
 * [text](url) links (http/https/mailto only). */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function mdInline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_([^_]+)_(?=$|[^\w])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, url) {
      var safe = /^(https?:|mailto:)/i.test(url) ? url : '#';
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
    });
}

function renderMarkdown(src) {
  var host = el('div.md');
  var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
  var html = [];
  var i = 0;
  var BLOCK = /^(#{1,6})\s|^>\s?|^\s*[-*+]\s+|^\s*\d+\.\s+|^```/;
  function line(s) { return mdInline(escapeHtml(s)); }

  while (i < lines.length) {
    var ln = lines[i];

    if (/^```/.test(ln)) {                       /* fenced code */
      var buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      html.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }
    var h = ln.match(/^(#{1,6})\s+(.*)$/);       /* heading */
    if (h) { var lv = h[1].length; html.push('<h' + lv + '>' + line(h[2]) + '</h' + lv + '>'); i++; continue; }
    if (/^>\s?/.test(ln)) {                       /* blockquote */
      var q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html.push('<blockquote>' + q.map(line).join('<br>') + '</blockquote>');
      continue;
    }
    if (/^\s*[-*+]\s+/.test(ln)) {                /* unordered list */
      var u = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { u.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
      html.push('<ul>' + u.map(function (x) { return '<li>' + line(x) + '</li>'; }).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(ln)) {                /* ordered list */
      var o = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { o.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      html.push('<ol>' + o.map(function (x) { return '<li>' + line(x) + '</li>'; }).join('') + '</ol>');
      continue;
    }
    if (/^\s*$/.test(ln)) { i++; continue; }      /* blank */

    var p = [];                                   /* paragraph */
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !BLOCK.test(lines[i])) { p.push(lines[i]); i++; }
    html.push('<p>' + p.map(line).join('<br>') + '</p>');
  }

  host.innerHTML = html.join('');
  return host;
}

/* ---- Chrome: toast, modal, confirm -------------------------------------- */

function toast(msg, kind) {
  var root = document.getElementById('toast');
  if (!root) return;
  var t = el('div.toast-item' + (kind ? '.' + kind : ''), {}, msg);
  root.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('in'); });
  setTimeout(function () {
    t.classList.remove('in');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, CONFIG.toastMs);
}

/* An achievement-style banner, louder than a toast. Used for level-ups,
 * rank-ups and quest completions. */
function fanfare(title, sub) {
  var root = document.getElementById('toast');
  if (!root) return;
  var t = el('div.fanfare', {},
    el('div.fanfare-title', {}, title),
    sub ? el('div.fanfare-sub', {}, sub) : null);
  root.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('in'); });
  setTimeout(function () {
    t.classList.remove('in');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
  }, CONFIG.toastMs + 1200);
}

/* openModal({title, body, actions:[{label, kind, onClick}], onClose})
 * `body` is a Node. Returns a close() function; actions close automatically
 * unless their handler returns the literal false. */
function openModal(opts) {
  var root = document.getElementById('modal-root');
  var closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.classList.remove('in');
    setTimeout(function () { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }, 200);
    if (opts.onClose) opts.onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  var actions = (opts.actions || []).map(function (a) {
    return el('button.btn' + (a.kind ? '.' + a.kind : ''), {
      onclick: function () { if (a.onClick && a.onClick() === false) return; close(); }
    }, a.label);
  });

  var sheet = el('div.modal', {},
    el('header.modal-head', {},
      el('h2', {}, opts.title || ''),
      el('button.icon-btn', { onclick: close, 'aria-label': 'Close' }, '✕')),
    el('div.modal-body', {}, opts.body),
    actions.length ? el('footer.modal-foot', {}, actions) : null);

  /* Close on a backdrop click — but ONLY when the press both started and ended
   * on the scrim itself. A browser fires `click` on the common ancestor of the
   * mousedown and mouseup nodes, so selecting text inside a field and releasing
   * over the backdrop (or the reverse) used to land a `click` on the scrim and
   * nuke the whole modal, losing everything typed. Tracking where the press
   * began fixes that: a drag that starts inside the sheet never closes it. */
  var pressedOnScrim = false;
  function markPress(e) { pressedOnScrim = (e.target === scrim); }
  var scrim = el('div.scrim', {
    onmousedown: markPress,
    ontouchstart: markPress,
    onclick: function (e) { if (e.target === scrim && pressedOnScrim) close(); }
  }, sheet);

  root.appendChild(scrim);
  requestAnimationFrame(function () { scrim.classList.add('in'); });

  document.addEventListener('keydown', onKey);
  var firstInput = sheet.querySelector('input, textarea, select');
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
  return close;
}

function confirmModal(title, message, onYes, yesLabel) {
  openModal({
    title: title,
    body: el('p.modal-text', {}, message),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: yesLabel || 'Delete', kind: 'danger', onClick: onYes }
    ]
  });
}

/* ---- Small form builders ------------------------------------------------ */

function field(label, input, hint) {
  return el('label.field', {},
    el('span.field-label', {}, label),
    input,
    hint ? el('span.field-hint', {}, hint) : null);
}

function textInput(value, placeholder) {
  return el('input.input', { type: 'text', value: value || '', placeholder: placeholder || '' });
}

function numInput(value, min, max) {
  return el('input.input.num', {
    type: 'number', value: (value === undefined || value === null) ? '' : value,
    min: min === undefined ? '' : min, max: max === undefined ? '' : max
  });
}

function textArea(value, placeholder, rows) {
  return el('textarea.input.area', { placeholder: placeholder || '', rows: rows || 3 }, value || '');
}

function selectInput(options, value) {
  var s = el('select.input');
  options.forEach(function (o) {
    var opt = el('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.appendChild(opt);
  });
  return s;
}

/* A labelled progress bar. Returns the wrapper; call setBar(node, pct) later. */
function bar(pct, className) {
  var fill = el('div.bar-fill', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } });
  return el('div.bar' + (className ? '.' + className : ''), {}, fill);
}

function setBar(barNode, pct) {
  var fill = barNode.querySelector('.bar-fill');
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function emptyState(icon, title, sub) {
  return el('div.empty', {},
    el('div.empty-icon', {}, icon),
    el('div.empty-title', {}, title),
    sub ? el('div.empty-sub', {}, sub) : null);
}

/* Where a post can go: your Friends feed (always available in cloud mode) plus
 * each party you're in. Returns [{value, label}] — 'friends' or a party code. */
function feedDestinations() {
  if (!(window.Party && Party.available())) return [];
  var dests = [{ value: 'friends', label: 'Friends' }];
  Party.partyList().forEach(function (p) { dests.push({ value: Party.codeOf(p), label: p.name }); });
  return dests;
}

/* Shared control for opting a journal entry, status or achievement into a feed
 * as you create it. Returns { node, target() }: target() is the chosen
 * destination ('friends' or a party code), or null for "don't post". Renders
 * nothing off the cloud; a checkbox when Friends is the only destination; a
 * select when there are several. */
function partyPostControl(label) {
  var none = { node: null, target: function () { return null; } };
  var dests = feedDestinations();
  if (!dests.length) return none;

  if (dests.length === 1) {
    var only = dests[0].value;
    var cb = el('input', { type: 'checkbox' });
    return {
      node: el('label.share-toggle', {}, cb, el('span', {}, label || 'Also post to your friends feed')),
      target: function () { return cb.checked ? only : null; }
    };
  }

  var sel = selectInput([{ value: '', label: "Don't post" }].concat(dests.map(function (d) {
    return { value: d.value, label: 'Post to ' + d.label };
  })), '');
  return {
    node: field(label || 'Share to a feed', sel),
    target: function () { return sel.value || null; }
  };
}

/* A modal for sharing something that already exists (a status, an achievement)
 * to a feed. Pick a destination and it posts opts.message. */
function shareToFeedModal(opts) {
  opts = opts || {};
  var dests = feedDestinations();
  if (!dests.length) { toast('Sign in and add friends or a party to share.', 'bad'); return; }

  var sel = dests.length > 1
    ? selectInput(dests.map(function (d) { return { value: d.value, label: d.label }; }), dests[0].value)
    : null;

  openModal({
    title: opts.title || 'Share',
    body: el('div', {},
      opts.message ? el('p.modal-text', {}, opts.message) : null,
      sel ? field('Share to', sel) : el('p.muted.small', {}, 'Sharing to your friends feed.')),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Share', kind: 'primary', onClick: function () {
          var to = sel ? sel.value : dests[0].value;
          Party.post(opts.message, opts.kind || 'manual', null, to)
            .then(function () { toast('Shared.'); })
            .catch(function (e) { toast(e.message || 'Could not share.', 'bad'); });
        }
      }
    ]
  });
}
