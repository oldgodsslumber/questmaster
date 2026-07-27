/* Questmaster — game-icons.net integration.
 *
 * game-icons.net publishes no REST API, so we bundle the full slug manifest
 * (data/icons-manifest.json, 4,229 entries generated from the source repo) and
 * pull individual SVGs from jsDelivr on demand.
 *
 * The critical constraint: html2canvas taints on cross-origin images, which
 * would break PNG export of the character sheet. So icons are never <img> —
 * we fetch the markup and inline a real <svg> node. Fetched markup is cached in
 * localStorage so the sheet renders instantly offline and export never waits
 * on the network.
 *
 * Icons are CC BY 3.0. The credits line in the footer is not optional.
 */
window.Icons = (function () {

  var manifest = null;        /* ['lorc/sword-wound', ...] */
  var manifestPromise = null;
  var memCache = {};          /* slug -> svg markup */
  var inflight = {};          /* slug -> Promise, so 20 sword icons fetch once */

  /* ---- Cache ------------------------------------------------------------- */

  function loadCache() {
    try {
      var raw = localStorage.getItem(CONFIG.iconCacheKey);
      if (raw) memCache = JSON.parse(raw) || {};
    } catch (e) { memCache = {}; }
  }

  function saveCache() {
    try {
      var keys = Object.keys(memCache);
      /* Bounded: drop the oldest half rather than letting the cache grow until
       * localStorage throws and takes the character data down with it. */
      if (keys.length > CONFIG.iconCacheLimit) {
        keys.slice(0, keys.length - Math.floor(CONFIG.iconCacheLimit / 2))
          .forEach(function (k) { delete memCache[k]; });
      }
      localStorage.setItem(CONFIG.iconCacheKey, JSON.stringify(memCache));
    } catch (e) { /* quota — the in-memory cache still works this session */ }
  }

  /* ---- Manifest ---------------------------------------------------------- */

  function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch('data/icons-manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (list) { manifest = list; return list; })
      .catch(function (e) {
        console.warn('[qm] icon manifest failed to load', e);
        manifest = [];
        return manifest;
      });
    return manifestPromise;
  }

  /* 'lorc/sword-wound' -> 'Sword Wound' */
  function prettyName(slug) {
    return String(slug).split('/').pop().replace(/-/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function search(query, limit) {
    if (!manifest) return [];
    var q = String(query || '').trim().toLowerCase();
    if (!q) return manifest.slice(0, limit || 120);

    var terms = q.split(/\s+/);
    var starts = [], contains = [];
    for (var i = 0; i < manifest.length; i++) {
      var slug = manifest[i];
      var name = slug.split('/')[1].replace(/-/g, ' ');
      var all = true;
      for (var t = 0; t < terms.length; t++) {
        if (name.indexOf(terms[t]) === -1) { all = false; break; }
      }
      if (!all) continue;
      (name.indexOf(terms[0]) === 0 ? starts : contains).push(slug);
      if (starts.length + contains.length > 400) break;
    }
    return starts.concat(contains).slice(0, limit || 120);
  }

  /* ---- Fetching ----------------------------------------------------------- */

  /* The raw files are 512x512 with the glyph as solid black paths, and most
   * carry a full-canvas background path first. We strip that background and
   * force currentColor so an icon inherits the surrounding text colour. */
  function normalize(markup) {
    var doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    var svg = doc.querySelector('svg');
    if (!svg || doc.querySelector('parsererror')) return null;

    /* Full-canvas rectangle = the background plate. Matches both the path form
     * (M0 0h512v512H0z) and an actual <rect>. */
    Array.prototype.slice.call(svg.querySelectorAll('path')).forEach(function (p) {
      var d = (p.getAttribute('d') || '').replace(/\s+/g, '');
      if (/^M0,?0h512v512H0z?$/i.test(d) || /^M0,?0h512v512H0V0z?$/i.test(d)) p.remove();
    });
    Array.prototype.slice.call(svg.querySelectorAll('rect')).forEach(function (r) {
      if (r.getAttribute('width') === '512' && r.getAttribute('height') === '512') r.remove();
    });

    svg.setAttribute('fill', 'currentColor');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    return new XMLSerializer().serializeToString(svg);
  }

  function fetchSvg(slug) {
    if (!slug) return Promise.resolve(null);
    if (memCache[slug]) return Promise.resolve(memCache[slug]);
    if (inflight[slug]) return inflight[slug];

    inflight[slug] = fetch(CONFIG.iconCdn + slug + '.svg')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (txt) {
        var norm = normalize(txt);
        if (!norm) throw new Error('unparseable svg');
        memCache[slug] = norm;
        saveCache();
        return norm;
      })
      .catch(function (e) {
        console.warn('[qm] icon fetch failed: ' + slug, e);
        return null;
      })
      .then(function (v) { delete inflight[slug]; return v; });

    return inflight[slug];
  }

  /* ---- Rendering ---------------------------------------------------------- */

  /* Returns a node immediately and fills it in when the SVG lands, so callers
   * never have to await an icon just to build a row. A missing or failed icon
   * degrades to a neutral glyph rather than a hole in the layout. */
  function node(slug, className) {
    var host = el('span.gi' + (className ? '.' + className : ''));
    if (!slug) {
      host.textContent = '◆';
      host.classList.add('gi-empty');
      return host;
    }
    if (memCache[slug]) {
      host.innerHTML = memCache[slug];
      return host;
    }
    host.textContent = '◆';
    host.classList.add('gi-loading');
    fetchSvg(slug).then(function (markup) {
      host.classList.remove('gi-loading');
      if (markup) { host.innerHTML = markup; }
      else { host.textContent = '◆'; host.classList.add('gi-empty'); }
    });
    return host;
  }

  /* Warm the cache for everything about to be drawn, so PNG export (which is
   * synchronous over the DOM) never catches a half-loaded sheet. */
  function preload(slugs) {
    var uniq = {};
    (slugs || []).filter(Boolean).forEach(function (s) { uniq[s] = 1; });
    return Promise.all(Object.keys(uniq).map(fetchSvg));
  }

  /* ---- The picker modal ---------------------------------------------------- */

  /* pick(currentSlug, onPick) — search by name, tap to choose. */
  function pick(current, onPick) {
    var results = el('div.icon-grid');
    var input = el('input.input', { type: 'search', placeholder: 'Search 4,229 icons — sword, potion, wolf…' });
    var status = el('div.icon-status', {}, 'Loading icons…');

    function render(list) {
      clear(results);
      if (!list.length) {
        results.appendChild(emptyState('🔍', 'No icons match', 'Try a simpler word — "axe" rather than "battle axe".'));
        return;
      }
      list.forEach(function (slug) {
        var btn = el('button.icon-cell' + (slug === current ? '.selected' : ''), {
          type: 'button',
          title: prettyName(slug),
          onclick: function () { onPick(slug); close(); }
        }, node(slug), el('span.icon-cell-name', {}, prettyName(slug)));
        results.appendChild(btn);
      });
    }

    var debounce = null;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        var list = search(input.value);
        status.textContent = input.value.trim()
          ? list.length + ' match' + (list.length === 1 ? '' : 'es')
          : 'Showing the first 120 of ' + (manifest ? manifest.length : 0);
        render(list);
      }, 140);
    });

    var close = openModal({
      title: 'Choose an icon',
      body: el('div.icon-picker', {},
        input,
        status,
        results,
        el('p.credit-line', {},
          'Icons from game-icons.net, licensed ',
          el('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'),
          '.')),
      actions: [
        { label: 'Clear icon', kind: 'ghost', onClick: function () { onPick(null); } },
        { label: 'Cancel', kind: 'ghost' }
      ]
    });

    loadManifest().then(function (list) {
      status.textContent = 'Showing the first 120 of ' + list.length;
      render(search(''));
    });

    return close;
  }

  /* A reusable "icon + change" control for entity forms. */
  function iconField(currentSlug, onChange) {
    var host = el('button.icon-choose', { type: 'button' });
    var slug = currentSlug || null;

    function paint() {
      clear(host);
      host.appendChild(node(slug, 'lg'));
      host.appendChild(el('span.icon-choose-label', {}, slug ? prettyName(slug) : 'Choose icon'));
    }
    host.addEventListener('click', function () {
      pick(slug, function (picked) { slug = picked; paint(); onChange(picked); });
    });
    paint();
    host.getSlug = function () { return slug; };
    return host;
  }

  loadCache();
  loadManifest();

  return {
    loadManifest: loadManifest, search: search, prettyName: prettyName,
    fetchSvg: fetchSvg, node: node, preload: preload, pick: pick, iconField: iconField
  };
})();
