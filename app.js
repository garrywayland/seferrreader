(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = 'https://www.sefaria.org/api';
  const KEY_SET = 'sefer-reader-settings';
  const KEY_HIST = 'sefer-reader-history';
  const lib = $('lib'), reader = $('reader'), clip = $('clip'), flow = $('flow');

  // ================= Settings =================
  const HE_FONTS = [
    ['Frank Ruhl Libre', 'Frank Ruhl (classic sefer)'],
    ['Noto Serif Hebrew', 'Noto Serif (shows trop)'],
    ['David Libre', 'David'],
    ['Noto Rashi Hebrew', 'Rashi script'],
    ['Heebo', 'Heebo (sans)'],
  ];
  const EN_FONTS = [
    ['Crimson Pro', 'Crimson Pro'],
    ['EB Garamond', 'EB Garamond'],
    ['Source Serif 4', 'Source Serif'],
    ['Literata', 'Literata'],
    ['Inter', 'Inter (sans)'],
  ];
  const MARGINS = [0, 12, 32, 56, 88, 128];
  const DEFAULTS = { lang: 'he', theme: 'auto', heFont: 'Frank Ruhl Libre', enFont: 'Crimson Pro', size: 21, lh: 1.78, margin: 2, cols: 'auto', nums: true };
  const SET = Object.assign({}, DEFAULTS, readJSON(KEY_SET, {}));

  function readJSON(k, fallback) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch { return fallback; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  const loadedFonts = new Set(['Frank Ruhl Libre', 'Crimson Pro']);
  function ensureFont(family) {
    if (loadedFonts.has(family)) return;
    loadedFonts.add(family);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=swap`;
    document.head.append(l);
  }
  function applySettings() {
    ensureFont(SET.heFont); ensureFont(SET.enFont);
    const st = document.documentElement.style;
    st.setProperty('--he', `"${SET.heFont}", "Frank Ruhl Libre", "Noto Serif Hebrew", "Times New Roman", serif`);
    st.setProperty('--en', `"${SET.enFont}", "Crimson Pro", Georgia, "Times New Roman", serif`);
    st.setProperty('--fs', SET.size + 'px');
    st.setProperty('--lh', String(SET.lh));
    st.setProperty('--mx', MARGINS[SET.margin] + 'px');
    st.setProperty('--my', (SET.margin * 6) + 'px');
    if (SET.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', SET.theme);
    flow.classList.toggle('nonums', !SET.nums);
    writeJSON(KEY_SET, SET);
  }

  // ================= Reading history =================
  let HIST = readJSON(KEY_HIST, []);
  if (!Array.isArray(HIST)) HIST = [];
  function recordHistory() {
    if (!S.data || !S.data.title) return;
    const pct = S.sections.length && S.cur >= 0 ? (S.cur + (S.page + 1) / S.pages) / S.sections.length : null;
    const e = { title: S.data.title, heTitle: S.data.heTitle, ref: S.ref, heRef: S.data.heRef, frac: S.pages > 1 ? S.page / S.pages : 0, pct, t: Date.now() };
    HIST = [e, ...HIST.filter(h => h.title !== e.title)].slice(0, 12);
    writeJSON(KEY_HIST, HIST);
  }
  const histFor = title => HIST.find(h => h.title === title);

  // ================= Helpers =================
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }
  function gem(n, punct = true) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const hund = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
    let s = '';
    if (n >= 1000) { s += ones[Math.floor(n / 1000) % 10] + '׳'; n %= 1000; }
    s += hund[Math.floor(n / 100)];
    const r = n % 100;
    if (r === 15) s += 'טו'; else if (r === 16) s += 'טז';
    else s += tens[Math.floor(r / 10)] + ones[r % 10];
    if (!punct) return s;
    return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
  }
  function flat(t) {
    if (t == null) return [];
    if (typeof t === 'string') return [t];
    if (Array.isArray(t)) return t.flatMap(flat);
    return [];
  }
  function plain(html) {
    if (!html) return '';
    const t = document.createElement('template');
    t.innerHTML = String(html);
    return t.content.textContent.trim();
  }
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'BIG', 'SMALL', 'BR', 'U']);
  function clean(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('sup, .footnote, .footnote-marker, script, style, img, iframe').forEach(el => el.remove());
    const walk = node => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType !== 1) return;
        walk(ch);
        if (!ALLOWED.has(ch.tagName)) { ch.replaceWith(...ch.childNodes); return; }
        [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
      });
    };
    walk(t.content);
    return t.content;
  }
  let toastT;
  function toast(t) {
    const el = $('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800);
  }

  // ================= Links =================
  const refHash = ref => '#' + encodeURIComponent(ref.replace(/ /g, '_')).replace(/%2C/g, ',').replace(/%3A/g, ':');
  const bookHash = title => '#/b/' + encodeURIComponent(title);
  const catHash = path => '#/c/' + path.map(encodeURIComponent).join('/');

  // ================= Sefaria API =================
  class ApiError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
  async function getJSON(url, retried) {
    let r;
    try { r = await fetch(url); }
    catch {
      if (!retried) { await sleep(700); return getJSON(url, true); }
      throw new ApiError(navigator.onLine === false ? 'offline' : 'network');
    }
    if (r.status === 404) throw new ApiError('not_found');
    if (r.status >= 500 && !retried) { await sleep(900); return getJSON(url, true); }
    if (!r.ok) throw new ApiError('http', 'HTTP ' + r.status);
    const j = await r.json();
    if (j && !Array.isArray(j) && j.error) throw new ApiError('not_found', j.error);
    return j;
  }
  const enc = s => encodeURIComponent(s.trim().replace(/ /g, '_'));
  const memo = new Map();
  function once(key, fn) {
    if (!memo.has(key)) { const p = fn(); memo.set(key, p); p.catch(() => memo.delete(key)); }
    return memo.get(key);
  }

  // Normalized text: {ref, heRef, sectionRef, title, heTitle, he[], en[], next, prev}
  async function fetchText(ref) {
    try {
      const d = await getJSON(`${API}/texts/${enc(ref)}?context=0&commentary=0&pad=0`);
      if (d.text === undefined && d.he === undefined) throw new ApiError('bad_shape');
      return {
        ref: d.ref || ref, heRef: d.heRef || d.ref || ref, sectionRef: d.sectionRef || d.ref || ref,
        title: d.indexTitle || d.book || '', heTitle: d.heIndexTitle || d.heTitle || '',
        he: flat(d.he), en: flat(d.text), next: d.next || null, prev: d.prev || null,
      };
    } catch (e) {
      if (e.code === 'not_found' || e.code === 'offline') throw e;
      const d = await getJSON(`${API}/v3/texts/${enc(ref)}?version=hebrew&version=english&return_format=text_only`);
      const vs = d.versions || [];
      const isEn = v => v.languageFamilyName === 'english' || v.language === 'en';
      const en = vs.find(isEn), he = vs.find(v => v !== en);
      return {
        ref: d.ref || ref, heRef: d.heRef || d.ref || ref, sectionRef: d.sectionRef || d.ref || ref,
        title: d.indexTitle || d.book || d.title || '', heTitle: d.heIndexTitle || d.heTitle || '',
        he: he ? flat(he.text) : [], en: en ? flat(en.text) : [], next: d.next || null, prev: d.prev || null,
      };
    }
  }
  const getText = ref => once('t:' + ref, () => fetchText(ref));
  const getShape = title => once('s:' + title, async () => {
    const raw = await getJSON(`${API}/shape/${enc(title)}`);
    return (Array.isArray(raw) ? raw : [raw]).filter(x => x && x.title && 'chapters' in x);
  });
  const getIndex = title => once('i:' + title, () => getJSON(`${API}/v2/raw/index/${enc(title)}`));

  // Table of contents: the whole library tree, cached in the browser for a day.
  let TOC = null;
  const BOOKS = new Map(); // title -> {node, path}
  const getTOC = () => once('toc', async () => {
    let data = null;
    const url = `${API}/index`;
    try {
      if ('caches' in window) {
        const c = await caches.open('sefer-reader-toc');
        const hit = await c.match(url);
        if (hit && Date.now() - Number(hit.headers.get('x-saved') || 0) < 864e5) data = await hit.json();
        if (!data) {
          data = await getJSON(url);
          c.put(url, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-saved': String(Date.now()) } })).catch(() => {});
        }
      }
    } catch { data = null; }
    if (!data) data = await getJSON(url);
    TOC = Array.isArray(data) ? data : (data.contents || []);
    const walk = (nodes, path) => nodes.forEach(n => {
      if (!n) return;
      if (n.contents) walk(n.contents, [...path, n.category]);
      else if (n.title && !BOOKS.has(n.title)) BOOKS.set(n.title, { node: n, path });
    });
    walk(TOC, []);
    return TOC;
  });
  function findCat(path) {
    let nodes = TOC, node = null;
    for (const name of path) {
      node = (nodes || []).find(n => n && n.contents && n.category === name);
      if (!node) return null;
      nodes = node.contents;
    }
    return node;
  }

  // ================= Structure of a book =================
  function isTalmud(shape) {
    const ch = shape.chapters;
    return Array.isArray(ch) && ch.length > 2 && !ch[0] && !ch[1] && /^Seder /.test(shape.section || '')
      && !/^(Mishnah|Tosefta|Jerusalem)/.test(shape.title);
  }
  function buildSections(shape) {
    const t = shape.title, ch = shape.chapters;
    if (!Array.isArray(ch)) return [];
    const talmud = isTalmud(shape);
    const out = [];
    ch.forEach((c, i) => {
      const n = Array.isArray(c) ? c.length : c;
      if (!n) return;
      if (talmud) {
        const daf = Math.floor(i / 2) + 1, b = i % 2 === 1;
        out.push({ ref: `${t} ${daf}${b ? 'b' : 'a'}`, en: `${daf}${b ? 'b' : 'a'}`, he: `דף ${gem(daf)} ע״${b ? 'ב' : 'א'}`, short: gem(daf, false) + (b ? ':' : '.') });
      } else {
        out.push({ ref: `${t} ${i + 1}`, en: String(i + 1), he: gem(i + 1), short: gem(i + 1, false) });
      }
    });
    return out;
  }

  // Top-level categories: Sefaria-style colour stripe per area of the library.
  const CAT_COLORS = {
    'Tanakh': '#3f6fa3', 'Mishnah': '#3a8f84', 'Talmud': '#c39a3c', 'Midrash': '#6c9a48',
    'Halakhah': '#b2573f', 'Kabbalah': '#7a5aa8', 'Liturgy': '#c06c8b', 'Jewish Thought': '#4f6b8c',
    'Tosefta': '#4a9b9b', 'Chasidut': '#9b6c40', 'Musar': '#8b5a7c', 'Responsa': '#5b7f5b',
    'Second Temple': '#8d8b55', 'Reference': '#7a7a7a', 'Tanaitic': '#4a9b9b',
  };
  const catColor = name => CAT_COLORS[name] || 'var(--accent)';
  const countBooks = node => (node.contents || []).reduce((n, c) => n + (c.contents ? countBooks(c) : (c.title ? 1 : 0)), 0);

  // ================= Views =================
  function setMode(mode) {
    const r = mode === 'reader';
    document.body.classList.toggle('in-reader', r);
    document.body.classList.toggle('in-lib', !r);
    lib.hidden = r; reader.hidden = !r; $('status').hidden = !r; $('bar').hidden = !r;
    if (!r) hideMsg();
  }

  const searchIcon = () => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.innerHTML = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
    return s;
  };
  const gearIcon = () => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.innerHTML = '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>';
    return s;
  };

  function masthead() {
    return h('header', { class: 'masthead' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'mark', lang: 'he' }, 'ספר'), h('span', { class: 'name' }, 'Sefer Reader')),
      h('button', { class: 'icon-btn', onclick: () => openMenu() }, gearIcon(), 'Reading settings'));
  }
  function searchBox(autofocus) {
    const box = h('div', { class: 'sugg', role: 'listbox' });
    const input = h('input', { type: 'search', id: 'q', placeholder: 'Search for a sefer or reference: Berakhot, Mishnah Berurah, Genesis 12…', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Search' });
    attachSearch(input, box);
    if (autofocus) setTimeout(() => input.focus(), 30);
    return h('div', { class: 'search' }, searchIcon(), input, box);
  }
  function loadingEl(t = 'Loading the library…') { return h('div', { class: 'loading' }, t); }
  function errorEl(e, retry) {
    const msg = e && e.code === 'offline' ? "You're offline. Connect to the internet to browse the library."
      : e && e.code === 'not_found' ? "Sefaria doesn't have that page."
      : "Couldn't reach Sefaria. Check your connection and try again.";
    return h('div', { class: 'err' }, msg, h('button', { class: 'btn', onclick: retry }, 'Try again'));
  }
  function foot() {
    return h('footer', { class: 'foot' }, 'Texts, translations and the library catalogue come from ',
      h('a', { href: 'https://www.sefaria.org', target: '_blank', rel: 'noopener' }, 'Sefaria'),
      ', a free library of Jewish texts. Each text keeps the license of its edition on Sefaria.');
  }

  let viewToken = 0;
  function renderHome() {
    const tok = ++viewToken;
    setMode('lib');
    document.title = 'Sefer Reader';
    const cats = h('div', { class: 'cats' }, loadingEl());
    const cont = HIST.length ? h('section', { class: 'lib-section' },
      h('h2', null, 'Continue reading'),
      h('div', { class: 'continue' }, HIST.slice(0, 8).map(e => {
        const card = h('a', { class: 'cont', href: refHash(e.ref) },
          h('span', { class: 'he-t', lang: 'he', dir: 'rtl' }, e.heTitle || e.title),
          h('span', { class: 'en-t' }, e.title),
          h('span', { class: 'where' },
            h('span', null, e.pct != null ? Math.round(e.pct * 100) + '% through' : 'In progress'),
            h('span', { class: 'r', lang: 'he', dir: 'rtl' }, e.heRef || e.ref)),
          e.pct != null ? h('span', { class: 'prog' }, h('i', { style: `width:${Math.max(2, e.pct * 100).toFixed(1)}%` })) : null,
          h('button', { class: 'x', 'aria-label': `Remove ${e.title} from Continue reading`, onclick: ev => {
            ev.preventDefault(); ev.stopPropagation();
            HIST = HIST.filter(x => x.title !== e.title); writeJSON(KEY_HIST, HIST); renderHome();
          } }, '×'));
        return card;
      }))) : null;
    lib.replaceChildren(
      masthead(), searchBox(false), cont,
      h('section', { class: 'lib-section' }, h('h2', null, 'Browse the library'), cats),
      foot());
    window.scrollTo(0, 0);
    getTOC().then(toc => {
      if (tok !== viewToken) return;
      cats.replaceChildren(...toc.filter(c => c && c.contents).map(c =>
        h('a', { class: 'cat', href: catHash([c.category]), style: `--c:${catColor(c.category)}` },
          h('span', { class: 'cat-names' }, h('span', { class: 'cat-en' }, c.category), h('span', { class: 'cat-he', lang: 'he' }, c.heCategory || '')),
          h('span', { class: 'cat-desc' }, plain(c.enShortDesc || c.enDesc) || `${countBooks(c)} works`))));
    }).catch(e => { if (tok === viewToken) cats.replaceChildren(errorEl(e, renderHome)); });
  }

  function crumbs(path, extra) {
    const out = [h('a', { href: '#/' }, 'Library')];
    path.forEach((p, i) => { out.push(h('span', { 'aria-hidden': 'true' }, '›')); out.push(h('a', { href: catHash(path.slice(0, i + 1)) }, p)); });
    if (extra) { out.push(h('span', { 'aria-hidden': 'true' }, '›')); out.push(h('span', null, extra)); }
    return h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, out);
  }
  function bookRow(n) {
    return h('a', { class: 'item', href: bookHash(n.title) },
      h('span', { class: 'item-en' }, n.title),
      h('span', { class: 'item-he', lang: 'he', dir: 'rtl' }, n.heTitle || ''),
      plain(n.enShortDesc) ? h('span', { class: 'item-desc' }, plain(n.enShortDesc)) : null);
  }

  async function renderCategory(path) {
    const tok = ++viewToken;
    setMode('lib');
    lib.replaceChildren(masthead(), loadingEl());
    try { await getTOC(); } catch (e) { if (tok === viewToken) lib.replaceChildren(masthead(), errorEl(e, () => renderCategory(path))); return; }
    if (tok !== viewToken) return;
    const node = findCat(path);
    if (!node) { lib.replaceChildren(masthead(), errorEl({ code: 'not_found' }, renderHome)); return; }
    document.title = `${node.category} · Sefer Reader`;
    const color = catColor(path[0]);
    const body = h('div', { class: 'list' });
    let pendingBooks = [];
    const flushBooks = () => { pendingBooks.forEach(b => body.append(bookRow(b))); pendingBooks = []; };
    node.contents.forEach(c => {
      if (!c) return;
      if (!c.contents) { if (c.title) pendingBooks.push(c); return; }
      flushBooks();
      const sub = [...path, c.category];
      const books = c.contents.filter(x => x && x.title && !x.contents);
      const allBooks = books.length === c.contents.filter(Boolean).length;
      body.append(h('div', { class: 'subcat' },
        h('a', { class: 'subcat-head', href: catHash(sub) },
          h('span', { class: 'item-en' }, c.category),
          h('span', { class: 'item-he', lang: 'he' }, c.heCategory || '')),
        plain(c.enShortDesc) ? h('p', { class: 'item-desc' }, plain(c.enShortDesc)) : null,
        allBooks && books.length <= 80
          ? h('div', { class: 'chips' }, books.map(b => h('a', { class: 'chip', href: bookHash(b.title) },
            h('span', null, b.title), h('span', { class: 'h', lang: 'he', dir: 'rtl' }, b.heTitle || ''))))
          : h('p', { class: 'item-desc' }, h('a', { href: catHash(sub) }, `${countBooks(c)} works →`))));
    });
    flushBooks();
    lib.replaceChildren(
      masthead(), searchBox(false), crumbs(path.slice(0, -1)),
      h('div', { class: 'page-head', style: `--c:${color}` },
        h('div', { class: 'names' }, h('h1', null, node.category), h('span', { class: 'he-name', lang: 'he' }, node.heCategory || '')),
        plain(node.enDesc || node.enShortDesc) ? h('p', { class: 'desc' }, plain(node.enDesc || node.enShortDesc)) : null),
      body, foot());
    window.scrollTo(0, 0);
  }

  function fmtDate(d) {
    if (d == null) return '';
    const arr = (Array.isArray(d) ? d : [d]).map(Number).filter(n => !isNaN(n));
    if (!arr.length) return '';
    const f = y => y < 0 ? `${-y} BCE` : String(y);
    return arr.length > 1 && arr[0] !== arr[arr.length - 1] ? `c. ${f(arr[0])}–${f(arr[arr.length - 1])}` : `c. ${f(arr[0])}`;
  }
  function authorNames(a) {
    if (!Array.isArray(a)) return [];
    return a.map(x => typeof x === 'string'
      ? x.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : (x && (x.en || (x.title && x.title.en) || x.slug)) || '').filter(Boolean);
  }

  async function renderBook(title) {
    const tok = ++viewToken;
    setMode('lib');
    lib.replaceChildren(masthead(), loadingEl('Loading…'));
    getTOC().catch(() => {});
    let shapes = [], idx = null;
    const [sR, iR] = await Promise.allSettled([getShape(title), getIndex(title)]);
    if (tok !== viewToken) return;
    if (sR.status === 'fulfilled') shapes = sR.value;
    if (iR.status === 'fulfilled') idx = iR.value;
    if (!shapes.length && !idx) {
      // Not a book we can describe; open it directly.
      location.replace(refHash(title));
      return;
    }
    try { await getTOC(); } catch {}
    if (tok !== viewToken) return;
    const entry = BOOKS.get(title);
    const node = (entry && entry.node) || {};
    const path = (entry && entry.path) || (idx && idx.categories) || [];
    const heTitle = node.heTitle || (idx && idx.heTitle) || (shapes[0] && shapes[0].heTitle) || '';
    document.title = `${title} · Sefer Reader`;

    const desc = plain((idx && idx.enDesc) || node.enDesc || node.enShortDesc || (idx && idx.enShortDesc));
    const meta = [authorNames(idx && idx.authors).join(', '), fmtDate(idx && idx.compDate), idx && idx.compPlace ? String(idx.compPlace) : '']
      .filter(Boolean).join(' · ');
    const sections = shapes.length === 1 ? buildSections(shapes[0]) : [];
    const hist = histFor(title);

    // Named parts of complex books (e.g. an Introduction before the chapters).
    const parts = [];
    const nodes = idx && idx.schema && Array.isArray(idx.schema.nodes) ? idx.schema.nodes : [];
    nodes.forEach(n => {
      const titles = n.titles || [];
      const en = (titles.find(t => t.lang === 'en' && t.primary) || titles.find(t => t.lang === 'en') || {}).text;
      const he = (titles.find(t => t.lang === 'he' && t.primary) || titles.find(t => t.lang === 'he') || {}).text;
      if (n.key === 'default' || !en) parts.push({ isDefault: true });
      else parts.push({ ref: `${title}, ${en}`, en, he });
    });
    const firstRef = parts.length && !parts[0].isDefault ? parts[0].ref : (sections[0] ? sections[0].ref : title);

    const grid = sections.length ? h('div', { class: 'grid-sec' }, sections.map(s =>
      h('a', { href: refHash(s.ref), class: hist && hist.ref === s.ref ? 'here' : null, title: s.ref },
        h('span', { class: 'h', lang: 'he' }, s.short), h('span', { class: 'e' }, s.en)))) : null;

    lib.replaceChildren(
      masthead(), searchBox(false), crumbs(path),
      h('div', { class: 'page-head', style: `--c:${catColor(path[0])}` },
        h('div', { class: 'names' }, h('h1', null, title), h('span', { class: 'he-name', lang: 'he', dir: 'rtl' }, heTitle)),
        meta ? h('p', { class: 'meta' }, meta) : null,
        desc ? h('p', { class: 'desc' }, desc) : null,
        h('div', { class: 'actions' },
          hist ? h('a', { class: 'btn primary', href: refHash(hist.ref) }, 'Continue at ', h('span', { lang: 'he', dir: 'rtl' }, hist.heRef || hist.ref)) : null,
          h('a', { class: 'btn' + (hist ? '' : ' primary'), href: refHash(firstRef) }, hist ? 'Start from the beginning' : 'Start reading'),
          h('button', { class: 'btn', onclick: () => openMenu() }, 'Reading settings'))),
      parts.filter(p => !p.isDefault).length ? h('section', { class: 'lib-section' }, h('h2', null, 'Parts'),
        h('div', { class: 'list parts' }, parts.map(p => p.isDefault
          ? (sections.length ? null : null)
          : h('a', { class: 'item', href: refHash(p.ref) }, h('span', { class: 'item-en' }, p.en), h('span', { class: 'item-he', lang: 'he', dir: 'rtl' }, p.he || ''))))) : null,
      grid ? h('section', { class: 'lib-section' }, h('h2', null, isTalmud(shapes[0]) ? 'Dapim' : 'Chapters'), grid) : null,
      foot());
    window.scrollTo(0, 0);
  }

  // ================= Search (library and reader menu) =================
  function attachSearch(input, box, onPick) {
    let t, tok = 0;
    const pick = it => {
      box.replaceChildren(); input.value = '';
      if (onPick) onPick();
      location.hash = it.book ? bookHash(it.key) : refHash(it.key);
    };
    const render = (items, hint) => {
      box.replaceChildren(...(hint ? [h('div', { class: 'hint' }, hint)] : []), ...items.map(it =>
        h('button', { type: 'button', onclick: () => pick(it) }, h('span', null, it.label), h('span', { class: 'kind' }, it.book ? 'Book' : 'Open'))));
    };
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { box.replaceChildren(); return; }
      t = setTimeout(async () => {
        const my = ++tok;
        try {
          const [r] = await Promise.all([getJSON(`${API}/name/${encodeURIComponent(q)}?limit=12`), getTOC().catch(() => null)]);
          if (my !== tok) return;
          const items = [];
          if (r.is_ref && r.ref && /\d/.test(r.ref)) items.push({ key: r.ref, label: r.ref, book: false });
          (r.completion_objects || []).filter(o => o.type === 'ref').forEach(o => {
            if (items.some(i => i.key === o.key)) return;
            items.push({ key: o.key, label: o.title, book: BOOKS.has(o.key) });
          });
          render(items.slice(0, 10), items.length ? '' : 'No matching sefer. Press Enter to open it as typed.');
        } catch {
          if (my === tok) render([], 'Search is unavailable right now. Press Enter to open as typed.');
        }
      }, 220);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { box.replaceChildren(); return; }
      if (e.key !== 'Enter') return;
      const v = input.value.trim(); if (!v) return;
      e.preventDefault();
      const first = box.querySelector('button');
      if (first) first.click();
      else { if (onPick) onPick(); input.value = ''; location.hash = BOOKS.has(v) ? bookHash(v) : refHash(v); }
    });
  }

  // ================= Reader =================
  const S = { ref: null, data: null, sections: [], shapeFor: null, cur: -1, page: 0, pages: 1, step: 0, rtl: true, loadToken: 0, loading: false };

  function showMsg(text, sub = '', actions = []) {
    $('msg').hidden = false;
    $('msg-text').textContent = text;
    $('msg-sub').textContent = sub;
    $('msg-actions').replaceChildren(...actions.map(([label, fn, primary]) => h('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: fn }, label)));
  }
  function hideMsg() { $('msg').hidden = true; }
  function showError(e, retry, what) {
    const code = e && e.code;
    const libBtn = ['Back to the library', () => { location.hash = '#/'; }];
    if (code === 'offline') return showMsg("You're offline.", 'Connect to the internet to load the next section.', [['Try again', retry, true], libBtn]);
    if (code === 'not_found') return showMsg(`Sefaria couldn't find “${what}”.`, 'Check the name, or search the library.', [libBtn]);
    if (code === 'network') return showMsg("Couldn't reach Sefaria.", 'Check your connection and try again.', [['Try again', retry, true], libBtn]);
    return showMsg('Something went wrong loading the text.', e && e.message ? String(e.message).slice(0, 160) : '', [['Try again', retry, true], libBtn]);
  }

  async function loadShape(title) {
    if (!title || S.shapeFor === title) return;
    S.shapeFor = title; S.sections = []; S.cur = -1;
    try {
      const arr = await getShape(title);
      if (S.shapeFor !== title || arr.length !== 1) return;
      S.sections = buildSections(arr[0]);
    } catch { /* "Go to" simply stays hidden */ }
    if (S.shapeFor !== title) return;
    syncSection(); fillSectionSelect(); updateBar(); recordHistory();
  }
  function syncSection() { S.cur = S.data ? S.sections.findIndex(s => s.ref === S.data.sectionRef) : -1; }

  function para(html, cls, i, rtl) {
    const p = h('p', { class: 'seg ' + cls, dir: rtl ? 'rtl' : 'ltr', lang: cls === 'en' ? 'en' : 'he' });
    if (i != null) p.append(h('span', { class: 'n' }, rtl ? gem(i + 1, false) : String(i + 1)));
    p.append(clean(html));
    return p;
  }
  function render() {
    const { he, en } = S.data;
    let mode = SET.lang, note = '';
    const hasEn = en.some(Boolean), hasHe = he.some(Boolean);
    if (mode === 'en' && !hasEn) { mode = 'he'; note = 'No English translation on Sefaria for this section.'; }
    if (mode === 'both' && !hasEn) mode = 'he';
    if (mode !== 'en' && !hasHe) mode = 'en';
    S.rtl = mode !== 'en';

    flow.replaceChildren();
    flow.dir = S.rtl ? 'rtl' : 'ltr';
    flow.classList.toggle('nonums', !SET.nums);
    const head = [h('h2', { class: 'sec', dir: S.rtl ? 'rtl' : 'ltr' }, S.rtl ? S.data.heRef : S.data.ref)];
    if (note) head.push(h('p', { class: 'note' }, note));

    // Side-by-side bilingual text is paginated row by row in layoutBoth().
    S.both = mode === 'both';
    if (S.both) {
      S.head = head;
      S.rows = [];
      const len = Math.max(he.length, en.length);
      for (let i = 0; i < len; i++) {
        if (!he[i] && !en[i]) continue;
        S.rows.push({ he: he[i] ? cleanHtml(he[i]) : '', en: en[i] ? cleanHtml(en[i]) : '', i });
      }
      return;
    }
    flow.append(...head);

    let last = null;
    const arr = mode === 'en' ? en : he;
    arr.forEach((t, i) => { if (t) flow.append(last = para(t, mode === 'en' ? 'en' : 'he', i, S.rtl)); });
    if (!last) flow.append(last = h('p', { class: 'note' }, 'This section has no text on Sefaria.'));
    last.append(h('span', { id: 'end' }));
  }

  function cleanHtml(raw) { const d = document.createElement('div'); d.append(clean(raw)); return d.innerHTML; }
  const wordCount = html => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  // Split HTML after n words, closing and reopening any inline tags that span the cut.
  function splitHtml(html, n) {
    const toks = html.split(/(<[^>]+>|\s+)/).filter(Boolean);
    const stack = [];
    let i = 0, count = 0, headStr = '';
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t[0] === '<') {
        const m = t.match(/^<(\/)?([a-z0-9]+)/i);
        if (m && !/^br$/i.test(m[2])) { if (m[1]) stack.pop(); else stack.push(m[2].toLowerCase()); }
        headStr += t;
      } else if (/^\s+$/.test(t)) headStr += t;
      else { if (count === n) break; count++; headStr += t; }
    }
    const close = stack.slice().reverse().map(t => `</${t}>`).join('');
    const open = stack.map(t => `<${t}>`).join('');
    return [headStr.trim() + close, open + toks.slice(i).join('').trim()];
  }
  function rowEl(r) {
    const row = h('div', { class: 'brow' });
    const he = h('p', { class: 'seg he', dir: 'rtl', lang: 'he' });
    if (r.i != null && r.he) he.append(h('span', { class: 'n' }, gem(r.i + 1, false)));
    he.insertAdjacentHTML('beforeend', r.he);
    const en = h('p', { class: 'seg en', dir: 'ltr', lang: 'en' });
    if (r.i != null && !r.he) en.append(h('span', { class: 'n' }, String(r.i + 1)));
    en.insertAdjacentHTML('beforeend', r.en);
    row.append(he, en);
    return row;
  }
  // Fit as much of row r as possible onto page (height H): same fraction of words on each side.
  function splitRow(r, page, H, force) {
    const nh = wordCount(r.he), ne = wordCount(r.en);
    let lo = 0, hi = 1, best = null;
    for (let k = 0; k < 14; k++) {
      const f = (lo + hi) / 2;
      const a = { he: splitHtml(r.he, Math.round(nh * f))[0], en: splitHtml(r.en, Math.round(ne * f))[0], i: r.i };
      const el = rowEl(a);
      page.append(el);
      const fits = page.offsetHeight <= H;
      el.remove();
      if (fits) { best = f; lo = f; } else hi = f;
    }
    if (best == null || best < (force ? 0.0001 : 0.12)) {
      if (!force) return null;
      best = Math.max(best || 0, 1 / Math.max(nh, ne, 1));
    }
    const kh = Math.max(force ? 1 : 0, Math.round(nh * best)), ke = Math.round(ne * best);
    const [ha, hb] = splitHtml(r.he, Math.min(kh, nh)), [ea, eb] = splitHtml(r.en, ke);
    return [{ he: ha, en: ea, i: r.i }, { he: hb, en: eb, i: null }];
  }
  function layoutBoth(W, H) {
    const G = 48;
    S.step = W + G;
    flow.replaceChildren();
    flow.style.width = W + 'px';
    flow.style.height = H + 'px';
    flow.style.columnWidth = 'auto';
    flow.style.columnGap = 'normal';
    flow.classList.toggle('narrow', W < 560);
    let n = 0;
    const newPage = () => {
      const p = h('div', { class: 'bpage', style: `width:${W}px;left:${(S.rtl ? -1 : 1) * n * S.step}px` });
      n++; flow.append(p); return p;
    };
    let page = newPage();
    page.append(...S.head);
    const queue = S.rows.slice();
    while (queue.length) {
      const r = queue.shift();
      const el = rowEl(r);
      page.append(el);
      if (page.offsetHeight <= H) continue;
      el.remove();
      const empty = !page.querySelector('.brow');
      const parts = splitRow(r, page, H, empty && page.children.length === 0);
      if (parts) { page.append(rowEl(parts[0])); if (wordCount(parts[1].he) + wordCount(parts[1].en)) queue.unshift(parts[1]); }
      else if (empty && page.children.length) { const p2 = splitRow(r, page, H, true); page.append(rowEl(p2[0])); queue.unshift(p2[1]); }
      else queue.unshift(r);
      if (queue.length) page = newPage();
    }
    if (!S.rows.length) page.append(h('p', { class: 'note' }, 'This section has no text on Sefaria.'));
    S.pages = n;
  }

  function layout() {
    const W = clip.clientWidth, H = clip.clientHeight;
    if (!W || !H) return;
    if (S.both) return layoutBoth(W, H);
    flow.classList.remove('narrow');
    if (!$('end')) return;
    const two = SET.cols === '2' ? W >= 360 : SET.cols === '1' ? false : W >= 640;
    const G = two ? Math.round(Math.min(80, Math.max(32, W * 0.07))) : 48;
    const colW = two ? (W - G) / 2 : W;
    flow.style.width = W + 'px';
    flow.style.height = H + 'px';
    flow.style.columnWidth = colW + 'px';
    flow.style.columnGap = G + 'px';
    S.step = W + G;
    const prev = flow.style.transform;
    flow.classList.add('instant');
    flow.style.transform = 'none';
    const fr = flow.getBoundingClientRect(), er = $('end').getBoundingClientRect();
    const off = S.rtl ? fr.right - er.right : er.left - fr.left;
    S.pages = Math.max(1, Math.floor((off + 1) / S.step) + 1);
    flow.style.transform = prev;
  }
  function updateBar() {
    const total = S.sections.length;
    $('bar').style.width = total && S.cur >= 0 ? (((S.cur + (S.page + 1) / S.pages) / total) * 100).toFixed(2) + '%' : '0';
  }
  function show(animate = true) {
    S.page = Math.max(0, Math.min(S.page, S.pages - 1));
    flow.classList.toggle('instant', !animate);
    const x = S.page * S.step;
    flow.style.transform = `translateX(${S.rtl ? x : -x}px)`;
    $('st-title').textContent = S.rtl ? S.data.heRef : S.data.ref;
    $('st-title').dir = S.rtl ? 'rtl' : 'ltr';
    $('st-page').textContent = `${S.page + 1} / ${S.pages}`;
    updateBar();
    if (!animate) requestAnimationFrame(() => flow.classList.remove('instant'));
    const hsh = refHash(S.ref);
    if (location.hash !== hsh) try { history.replaceState(null, '', hsh); } catch {}
    recordHistory();
  }

  // Open any reference; `at` is a fraction of the section (0 = start) or 'last'.
  async function openRef(ref, at = 0) {
    const token = ++S.loadToken;
    setMode('reader');
    $('st-page').textContent = '…';
    if (!S.data) showMsg('Opening ' + ref + '…');
    S.loading = true;
    let data;
    try { data = await getText(ref); }
    catch (e) {
      if (token !== S.loadToken) return;
      S.loading = false;
      return showError(e, () => openRef(ref, at), ref);
    }
    if (token !== S.loadToken) return;
    S.data = data; S.ref = data.sectionRef;
    document.title = `${data.ref} · Sefer Reader`;
    syncSection();
    hideMsg();
    render();
    try { await document.fonts.ready; } catch {}
    if (token !== S.loadToken) return;
    layout();
    S.page = at === 'last' ? S.pages - 1 : Math.min(S.pages - 1, Math.floor((at || 0) * S.pages + 0.0001));
    show(false);
    S.loading = false;
    if (S.cur >= 0) $('m-sec').value = String(S.cur);
    loadShape(data.title);
    if (data.next) getText(data.next).catch(() => {});
  }
  function relayout() {
    if (!S.data || reader.hidden) return;
    const frac = S.pages > 1 ? S.page / S.pages : 0;
    layout();
    S.page = Math.min(S.pages - 1, Math.floor(frac * S.pages + 0.0001));
    show(false);
  }
  function rerender() { if (S.data && !reader.hidden) { render(); relayout(); } }
  let fontT;
  function relayoutAfterFonts() {
    clearTimeout(fontT);
    fontT = setTimeout(async () => { try { await document.fonts.ready; } catch {} relayout(); }, 60);
  }

  function next() {
    if (!S.data || S.loading) return;
    if (S.page < S.pages - 1) { S.page++; show(); }
    else if (S.data.next) openRef(S.data.next, 0);
    else toast(S.rtl ? 'סוף הספר' : 'End of the book');
  }
  function prev() {
    if (!S.data || S.loading) return;
    if (S.page > 0) { S.page--; show(); }
    else if (S.data.prev) openRef(S.data.prev, 'last');
  }

  let down = null;
  reader.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  reader.addEventListener('pointerup', e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    wake();
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // Hebrew: drag right reveals the next page (like turning a Hebrew book); English: the reverse.
      if ((dx > 0) === S.rtl) next(); else prev();
      return;
    }
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;
    const sel = window.getSelection();
    if (sel && String(sel).trim()) return;
    const w = window.innerWidth, x = e.clientX;
    if (x < w * 0.35) S.rtl ? next() : prev();
    else if (x > w * 0.65) S.rtl ? prev() : next();
    else openMenu();
  });
  reader.addEventListener('pointercancel', () => { down = null; });

  document.addEventListener('keydown', e => {
    if (!$('menu').hidden) { if (e.key === 'Escape') closeMenu(); return; }
    if (reader.hidden) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const k = e.key;
    if (k === 'ArrowLeft') { e.preventDefault(); S.rtl ? next() : prev(); }
    else if (k === 'ArrowRight') { e.preventDefault(); S.rtl ? prev() : next(); }
    else if (k === ' ' || k === 'PageDown' || k === 'ArrowDown') { e.preventDefault(); e.shiftKey ? prev() : next(); }
    else if (k === 'PageUp' || k === 'ArrowUp') { e.preventDefault(); prev(); }
    else if (k === 'm' || k === 'Escape' || k === 'Enter') { e.preventDefault(); openMenu(); }
  });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(relayout, 120); });

  let lock = null;
  async function wake() {
    if (lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !reader.hidden) wake(); });

  // ================= Settings sheet =================
  function fillSelect(sel, list, value) {
    sel.replaceChildren(...list.map(([v, label]) => h('option', { value: v }, label)));
    sel.value = value;
  }
  fillSelect($('m-hefont'), HE_FONTS, SET.heFont);
  fillSelect($('m-enfont'), EN_FONTS, SET.enFont);
  function pressGroup(id, v) { document.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
  function syncControls() {
    pressGroup('m-lang', SET.lang); pressGroup('m-theme', SET.theme); pressGroup('m-cols', SET.cols);
    $('m-hefont').value = SET.heFont; $('m-enfont').value = SET.enFont;
    $('m-size').value = SET.size; $('m-size-v').textContent = SET.size + 'px';
    $('m-lh').value = SET.lh; $('m-lh-v').textContent = Number(SET.lh).toFixed(2);
    $('m-margin').value = SET.margin; $('m-margin-v').textContent = ['None', 'Narrow', 'Normal', 'Wide', 'Wider', 'Widest'][SET.margin];
    $('m-nums').checked = SET.nums;
  }
  function openMenu() {
    const inReader = !reader.hidden && S.data;
    $('menu').hidden = false; $('scrim').hidden = false;
    $('m-he').textContent = inReader ? (S.data.heTitle || '') : 'הגדרות קריאה';
    $('m-en').textContent = inReader ? (S.data.title || '') : 'Reading settings';
    if (inReader) {
      $('m-about').href = bookHash(S.data.title);
      $('m-about').hidden = !S.data.title;
      $('m-goto').hidden = !S.sections.length;
      if (S.cur >= 0) $('m-sec').value = String(S.cur);
    }
    syncControls();
  }
  function closeMenu() { $('menu').hidden = true; $('scrim').hidden = true; }
  $('m-close').onclick = closeMenu;
  $('scrim').onclick = closeMenu;
  $('m-home').onclick = closeMenu;
  $('m-about').onclick = closeMenu;

  function fillSectionSelect() {
    const sel = $('m-sec');
    const opts = [];
    if (S.cur < 0 && S.data) opts.push(h('option', { value: '-1' }, SET.lang === 'en' ? S.data.ref : S.data.heRef));
    S.sections.forEach((s, i) => opts.push(h('option', { value: String(i) }, SET.lang === 'en' ? s.en : `${s.he}  (${s.en})`)));
    sel.replaceChildren(...opts);
    sel.value = String(S.cur);
    $('m-goto').hidden = !S.sections.length;
  }
  $('m-sec').onchange = e => { const i = Number(e.target.value); if (i >= 0) { closeMenu(); openRef(S.sections[i].ref, 0); } };
  $('m-prevsec').onclick = () => { if (S.data && S.data.prev) { closeMenu(); openRef(S.data.prev, 0); } };
  $('m-nextsec').onclick = () => { if (S.data && S.data.next) { closeMenu(); openRef(S.data.next, 0); } };
  attachSearch($('m-q'), $('m-sugg'), closeMenu);

  function bindGroup(id, key, after) {
    document.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.onclick = () => {
      SET[key] = b.dataset.v; pressGroup(id, SET[key]); applySettings(); after && after();
    });
  }
  bindGroup('m-lang', 'lang', () => { fillSectionSelect(); rerender(); });
  bindGroup('m-theme', 'theme');
  bindGroup('m-cols', 'cols', relayout);
  $('m-hefont').onchange = e => { SET.heFont = e.target.value; applySettings(); relayoutAfterFonts(); };
  $('m-enfont').onchange = e => { SET.enFont = e.target.value; applySettings(); relayoutAfterFonts(); };
  let rangeRAF;
  const onRange = (key, conv) => e => {
    SET[key] = conv(e.target.value); applySettings(); syncControls();
    cancelAnimationFrame(rangeRAF); rangeRAF = requestAnimationFrame(relayout);
  };
  $('m-size').addEventListener('input', onRange('size', Number));
  $('m-lh').addEventListener('input', onRange('lh', v => Math.round(Number(v) * 100) / 100));
  $('m-margin').addEventListener('input', onRange('margin', Number));
  $('m-nums').onchange = e => { SET.nums = e.target.checked; applySettings(); relayout(); };

  // ================= Router =================
  function route() {
    closeMenu();
    const raw = location.hash.slice(1);
    let hsh;
    try { hsh = decodeURIComponent(raw); } catch { hsh = raw; }
    if (!hsh || hsh === '/') return renderHome();
    if (hsh.startsWith('/c/')) return renderCategory(raw.slice(3).split('/').map(p => { try { return decodeURIComponent(p); } catch { return p; } }));
    if (hsh.startsWith('/b/')) return renderBook(hsh.slice(3));
    const ref = hsh.replace(/_/g, ' ').trim();
    if (S.data && S.ref === ref && !S.loading) { setMode('reader'); hideMsg(); relayout(); return; }
    const hst = HIST.find(x => x.ref === ref);
    openRef(ref, hst ? hst.frac : 0);
  }
  window.addEventListener('hashchange', route);

  applySettings();
  route();
})();
