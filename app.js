(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = 'https://www.sefaria.org/api';
  const KEY_SET = 'sefer-reader-settings';
  const KEY_HIST = 'sefer-reader-history';
  const libEl = $('lib'), reader = $('reader'), clip = $('clip'), flow = $('flow');

  // Fill the library view; null/false children are skipped.
  const setLib = (...kids) => libEl.replaceChildren(...kids.flat().filter(Boolean));

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
  const DEFAULTS = { lang: 'he', theme: 'auto', heFont: 'Frank Ruhl Libre', enFont: 'Crimson Pro', size: 21, lh: 1.78, margin: 2, cols: 'auto', nums: true, vowels: 'all', align: 'auto', ahead: 10, yomiHidden: [], comm: {}, commFont: 'rashi', print: { count: 0, paper: 'A4', cols: '2', size: 'M', margin: 'normal', comm: true } };
  const SET = Object.assign({}, DEFAULTS, readJSON(KEY_SET, {}));

  function readJSON(k, fallback) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch { return fallback; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  const loadedFonts = new Map([['Frank Ruhl Libre', Promise.resolve()], ['Crimson Pro', Promise.resolve()]]);
  function ensureFont(family) {
    if (!loadedFonts.has(family)) {
      loadedFonts.set(family, new Promise(res => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=swap`;
        l.onload = l.onerror = () => res();
        document.head.append(l);
        setTimeout(res, 4000);
      }));
    }
    return loadedFonts.get(family);
  }
  // Fonts that draw cantillation marks properly; others fall back to Noto Serif Hebrew when trop is shown.
  const TROP_FONTS = new Set(['Noto Serif Hebrew']);
  const TROP_RE = /[\u0591-\u05AF]/;
  function prepHe(t) {
    if (!t) return t;
    if (SET.vowels === 'notrop' || SET.vowels === 'none') t = t.replace(/[\u0591-\u05AF\u05BD]/g, '');
    if (SET.vowels === 'none') t = t.replace(/[\u05B0-\u05BC\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '');
    return t;
  }
  function applySettings() {
    // Remember the current pasuk before the change reflows the text.
    if (S.data && !reader.hidden && !S.keep) S.keep = { a: getAnchor(), frac: S.pages > 1 ? S.page / S.pages : 0 };
    ensureFont(SET.heFont); ensureFont(SET.enFont);
    const st = document.documentElement.style;
    st.setProperty('--he', `"${SET.heFont}", "Frank Ruhl Libre", "Noto Serif Hebrew", "Times New Roman", serif`);
    st.setProperty('--en', `"${SET.enFont}", "Crimson Pro", Georgia, "Times New Roman", serif`);
    st.setProperty('--fs', SET.size + 'px');
    if (SET.commFont === 'rashi') ensureFont('Noto Rashi Hebrew');
    st.setProperty('--comm-he', SET.commFont === 'rashi' ? '"Noto Rashi Hebrew", var(--he)' : 'var(--he)');
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
        he: flat(d.he), en: flat(d.text), heRaw: d.he, enRaw: d.text, next: d.next || null, prev: d.prev || null,
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
        he: he ? flat(he.text) : [], en: en ? flat(en.text) : [], heRaw: he && he.text, enRaw: en && en.text, next: d.next || null, prev: d.prev || null,
      };
    }
  }
  const getText = ref => once('t:' + ref, () => fetchText(ref));
  const getLinks = ref => once('l:' + ref, () => getJSON(`${API}/links/${enc(ref)}?with_text=0`));

  // ================= Commentaries =================
  const COMM_CATS = new Set(['Commentary', 'Targum']);
  function commName(l) {
    const ct = l.collectiveTitle || {};
    return { en: ct.en || (l.index_title || '').replace(/ on .+$/, '') || l.category, he: ct.he || '' };
  }
  function anchorIndex(l) {
    const ex = Array.isArray(l.anchorRefExpanded) && l.anchorRefExpanded.length ? l.anchorRefExpanded[l.anchorRefExpanded.length - 1] : l.anchorRef;
    const m = String(ex || '').match(/:(\d+)$/);
    return m ? Number(m[1]) - 1 : null;
  }
  // Commentaries available on a section, most comments first.
  async function commAvailable(sectionRef) {
    const links = await getLinks(sectionRef);
    const counts = new Map();
    (Array.isArray(links) ? links : []).forEach(l => {
      if (!COMM_CATS.has(l.category) || anchorIndex(l) == null) return;
      const n = commName(l);
      const c = counts.get(n.en) || { en: n.en, he: n.he, n: 0 };
      c.n++; counts.set(n.en, c);
    });
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }
  function pickAt(arr, parts) {
    let cur = arr;
    for (const p of parts) {
      if (!Array.isArray(cur)) return [];
      const m = p.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return [];
      if (m[2]) return flat(cur.slice(Number(m[1]) - 1, Number(m[2])));
      cur = cur[Number(m[1]) - 1];
    }
    return flat(cur);
  }
  // Load the chosen commentaries for a section: Map(segment index -> [{who, he, en}]).
  function loadComm(data) {
    const chosen = (SET.comm[data.title] || []).slice();
    if (!chosen.length || /-/.test(data.ref)) return Promise.resolve(null);
    return once('c:' + data.sectionRef + '|' + chosen.join('|'), async () => {
      const links = (await getLinks(data.sectionRef)) || [];
      const wanted = links.filter(l => COMM_CATS.has(l.category) && chosen.includes(commName(l).en) && anchorIndex(l) != null);
      const units = new Map();
      wanted.forEach(l => {
        const m = String(l.ref || l.sourceRef || '').match(/^(.+) (\d+[ab]?(?::\d+(?:-\d+)?)*)$/);
        if (!m) return;
        const parts = m[2].split(':');
        const unit = m[1] + ' ' + parts[0];
        if (!units.has(unit)) units.set(unit, getText(unit).catch(() => null));
        l._unit = unit; l._rest = parts.slice(1);
      });
      const texts = new Map();
      await Promise.all([...units].map(async ([u, p]) => texts.set(u, await p)));
      const map = new Map();
      wanted.forEach(l => {
        const t = texts.get(l._unit);
        if (!t) return;
        const he = pickAt(t.heRaw, l._rest).filter(Boolean).join(' ');
        const en = pickAt(t.enRaw, l._rest).filter(Boolean).join(' ');
        if (!he && !en) return;
        const i = anchorIndex(l), who = commName(l);
        if (!map.has(i)) map.set(i, []);
        map.get(i).push({ who, he, en, order: chosen.indexOf(who.en), ref: l.ref || '' });
      });
      const num = r => (r.match(/\d+/g) || []).map(Number);
      map.forEach(list => list.sort((a, b) => a.order - b.order || cmpNums(num(a.ref), num(b.ref))));
      return { ref: data.sectionRef, map };
    });
  }
  function cmpNums(a, b) { for (let k = 0; k < Math.max(a.length, b.length); k++) { const d = (a[k] || 0) - (b[k] || 0); if (d) return d; } return 0; }

  const getShape = title => once('s:' + title, async () => {
    const raw = await getJSON(`${API}/shape/${enc(title)}`);
    return (Array.isArray(raw) ? raw : [raw]).filter(x => x && x.title && 'chapters' in x);
  });
  function getCalendar() {
    let tz = 'UTC';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch {}
    const diaspora = tz === 'Asia/Jerusalem' ? 0 : 1;
    const d = new Date();
    const day = `year=${d.getFullYear()}&month=${d.getMonth() + 1}&day=${d.getDate()}`;
    return once('cal:' + day, async () => {
      const r = await getJSON(`${API}/calendars?diaspora=${diaspora}&timezone=${encodeURIComponent(tz)}&${day}`);
      return (r.calendar_items || [])
        .map(it => ({ ...it, ref: it.ref || (Array.isArray(it.refs) && it.refs[0]) || null, title: it.title || { en: it.category || '' } }))
        .filter(it => it.ref && it.title && it.title.en)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    });
  }
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
    libEl.hidden = r; reader.hidden = !r; $('status').hidden = !r; $('bar').hidden = !r;
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
    const today = h('div', { class: 'yomi' }, loadingEl("Loading today's learning…"));
    const editBtn = h('button', { class: 'linkish', onclick: () => {
      const on = today.classList.toggle('editing');
      editBtn.textContent = on ? 'Done' : 'Choose';
    } }, 'Choose');
    setLib(
      masthead(),
      navigator.onLine === false ? h('p', { class: 'offline-note' }, "You're offline. Books you've downloaded or recently read still open.") : null,
      searchBox(false), cont,
      h('section', { class: 'lib-section' }, h('h2', { class: 'with-action' }, h('span', null, "Today's learning"), editBtn), today),
      h('section', { class: 'lib-section' }, h('h2', null, 'Browse the library'), cats),
      foot());
    window.scrollTo(0, 0);
    getCalendar().then(items => {
      if (tok !== viewToken) return;
      const cards = items.map(it => {
        const key = it.title.en;
        const a = h('a', { class: 'yomi-card' + (SET.yomiHidden.includes(key) ? ' off' : ''), href: refHash(it.ref) },
          h('span', { class: 'y-top' }, h('span', { class: 'y-en' }, it.title.en), h('span', { class: 'y-he', lang: 'he' }, it.title.he || '')),
          h('span', { class: 'y-val', lang: 'he', dir: 'rtl' }, (it.displayValue && it.displayValue.he) || it.heRef || it.ref),
          h('span', { class: 'y-sub' }, (it.displayValue && it.displayValue.en) || it.ref),
          h('span', { class: 'y-check', 'aria-hidden': 'true' }));
        a.addEventListener('click', ev => {
          if (!today.classList.contains('editing')) return;
          ev.preventDefault();
          const off = a.classList.toggle('off');
          SET.yomiHidden = off ? [...new Set([...SET.yomiHidden, key])] : SET.yomiHidden.filter(x => x !== key);
          writeJSON(KEY_SET, SET);
        });
        return a;
      });
      today.replaceChildren(...cards);
      if (!cards.length) today.replaceChildren(h('div', { class: 'loading' }, "Sefaria didn't list any learning for today."));
    }).catch(e => { if (tok === viewToken) today.replaceChildren(errorEl(e, renderHome)); });
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
    setLib(masthead(), loadingEl());
    try { await getTOC(); } catch (e) { if (tok === viewToken) setLib(masthead(), errorEl(e, () => renderCategory(path))); return; }
    if (tok !== viewToken) return;
    const node = findCat(path);
    if (!node) { setLib(masthead(), errorEl({ code: 'not_found' }, renderHome)); return; }
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
    setLib(
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
    setLib(masthead(), loadingEl('Loading…'));
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

    setLib(
      masthead(), searchBox(false), crumbs(path),
      h('div', { class: 'page-head', style: `--c:${catColor(path[0])}` },
        h('div', { class: 'names' }, h('h1', null, title), h('span', { class: 'he-name', lang: 'he', dir: 'rtl' }, heTitle)),
        meta ? h('p', { class: 'meta' }, meta) : null,
        desc ? h('p', { class: 'desc' }, desc) : null,
        h('div', { class: 'actions' },
          hist ? h('a', { class: 'btn primary', href: refHash(hist.ref) }, 'Continue at ', h('span', { lang: 'he', dir: 'rtl' }, hist.heRef || hist.ref)) : null,
          h('a', { class: 'btn' + (hist ? '' : ' primary'), href: refHash(firstRef) }, hist ? 'Start from the beginning' : 'Start reading'),
          h('button', { class: 'btn', onclick: () => openMenu() }, 'Reading settings')),
        offlineControl(title, [...parts.filter(p => !p.isDefault).map(p => p.ref), ...sections.map(s => s.ref)])),
      parts.filter(p => !p.isDefault).length ? h('section', { class: 'lib-section' }, h('h2', null, 'Parts'),
        h('div', { class: 'list parts' }, parts.map(p => p.isDefault
          ? (sections.length ? null : null)
          : h('a', { class: 'item', href: refHash(p.ref) }, h('span', { class: 'item-en' }, p.en), h('span', { class: 'item-he', lang: 'he', dir: 'rtl' }, p.he || ''))))) : null,
      grid ? h('section', { class: 'lib-section' }, h('h2', null, isTalmud(shapes[0]) ? 'Dapim' : 'Chapters'), grid) : null,
      foot());
    window.scrollTo(0, 0);
  }

  // ================= Offline downloads =================
  const textURL = ref => `${API}/texts/${enc(ref)}?context=0&commentary=0&pad=0`;
  async function countSaved(refs) {
    if (!('caches' in window)) return 0;
    let n = 0;
    try {
      const c = await caches.open('sefer-texts-v1');
      for (const r of refs) if (await c.match(textURL(r))) n++;
    } catch {}
    return n;
  }
  function offlineControl(title, refs) {
    if (!refs.length || !('serviceWorker' in navigator) || !('caches' in window)) return null;
    const label = refs.length === 1 ? 'section' : 'sections';
    const status = h('span', { class: 'off-status' });
    const btn = h('button', { class: 'btn' }, `Download for offline (${refs.length} ${label})`);
    const wrap = h('div', { class: 'offline' }, btn, status);
    countSaved(refs).then(n => {
      if (n === refs.length) { btn.hidden = true; status.textContent = '✓ Saved for offline reading'; }
      else if (n) status.textContent = `${n} of ${refs.length} already saved`;
    });
    btn.onclick = async () => {
      btn.disabled = true;
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
      try { await Promise.race([navigator.serviceWorker.ready, sleep(3000)]); } catch {}
      let done = 0, failed = 0, i = 0;
      const tick = () => { status.textContent = `Downloading ${done} of ${refs.length}…`; };
      tick();
      const worker = async () => {
        while (i < refs.length) {
          const r = refs[i++];
          try {
            const c = await caches.open('sefer-texts-v1');
            if (!(await c.match(textURL(r)))) {
              const res = await fetch(textURL(r));
              if (!res.ok) throw new Error();
              // The service worker normally stores it; store it here too in case it isn't running yet.
              if (!(await c.match(textURL(r)))) await c.put(textURL(r), res);
            }
          } catch { failed++; }
          done++; tick();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const saved = await countSaved(refs);
      btn.disabled = false;
      if (saved === refs.length) { btn.hidden = true; status.textContent = '✓ Saved for offline reading'; }
      else { btn.textContent = 'Try again'; status.textContent = `${saved} of ${refs.length} saved${failed ? `. ${failed} couldn't be downloaded.` : '.'}`; }
    };
    return wrap;
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
    const p = h('p', { class: 'seg ' + cls, dir: rtl ? 'rtl' : 'ltr', lang: cls === 'en' ? 'en' : 'he', 'data-i': i });
    p.append(h('span', { class: 'a' }));
    if (i != null) p.append(h('span', { class: 'n' }, rtl ? gem(i + 1, false) : String(i + 1)));
    p.append(clean(html));
    return p;
  }
  function commFor(i) { return commOf(S.comm, S.data, i); }
  function commOf(c, data, i) { return c && c.ref === data.sectionRef ? (c.map.get(i) || []) : []; }
  function commBlock(list, mode) {
    const box = h('div', { class: 'comm-block' });
    list.forEach((c, k) => {
      const useEn = mode === 'en' ? !!c.en : !c.he;
      const first = k === 0 || list[k - 1].who.en !== c.who.en;
      const p = h('p', { class: 'comm ' + (useEn ? 'c-en' : 'c-he'), dir: useEn ? 'ltr' : 'rtl', lang: useEn ? 'en' : 'he' },
        first ? h('cite', null, useEn ? c.who.en : (c.who.he || c.who.en)) : null);
      p.append(first ? ' ' : '', clean(useEn ? c.en : prepHe(c.he)));
      box.append(p);
    });
    return box;
  }
  function render() {
    const en = S.data.en, he = S.data.he.map(prepHe);
    let mode = SET.lang, note = '';
    const hasEn = en.some(Boolean), hasHe = he.some(Boolean);
    if (mode === 'en' && !hasEn) { mode = 'he'; note = 'No English translation on Sefaria for this section.'; }
    if (mode === 'both' && !hasEn) mode = 'he';
    if (mode !== 'en' && !hasHe) mode = 'en';
    S.rtl = mode !== 'en';

    flow.replaceChildren();
    flow.dir = S.rtl ? 'rtl' : 'ltr';
    flow.classList.toggle('nonums', !SET.nums);
    const trop = mode !== 'en' && !TROP_FONTS.has(SET.heFont) && TROP_RE.test(he.join(''));
    flow.classList.toggle('trop', trop);
    S.fontWait = trop ? ensureFont('Noto Serif Hebrew') : null;
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
        commFor(i).forEach((c, k, list) => {
          const first = k === 0 || list[k - 1].who.en !== c.who.en;
          S.rows.push({
            comm: true,
            he: c.he ? (first ? `<cite>${esc(c.who.he || c.who.en)}</cite> ` : '') + cleanHtml(prepHe(c.he)) : '',
            en: c.en ? (first ? `<cite>${esc(c.who.en)}</cite> ` : '') + cleanHtml(c.en) : '',
            i: null,
          });
        });
      }
      return;
    }
    flow.append(...head);

    let last = null;
    const arr = mode === 'en' ? en : he;
    arr.forEach((t, i) => {
      if (!t) return;
      flow.append(last = para(t, mode === 'en' ? 'en' : 'he', i, S.rtl));
      const list = commFor(i);
      if (list.length) { const b = commBlock(list, mode); flow.append(b); last = b.lastChild; }
    });
    if (!last) flow.append(last = h('p', { class: 'note' }, 'This section has no text on Sefaria.'));
    last.append(h('span', { id: 'end' }));
  }

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    const row = h('div', { class: r.comm ? 'brow comm-row' : 'brow', 'data-i': r.i });
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
    flow.classList.toggle('align-start', SET.align === 'start' || (SET.align === 'auto' && W < 960));
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
    flow.classList.toggle('align-start', SET.align === 'start' || (SET.align === 'auto' && colW < 480));
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
    S.data = data; S.ref = /-/.test(data.ref) ? data.ref : data.sectionRef;
    document.title = `${data.ref} · Sefer Reader`;
    syncSection();
    S.commAvail = null;
    const commP = loadComm(data).catch(() => null);
    S.comm = await Promise.race([commP, sleep(4000).then(() => undefined)]);
    if (token !== S.loadToken) return;
    hideMsg();
    render();
    await waitFonts();
    if (token !== S.loadToken) return;
    layout();
    S.page = at === 'last' ? S.pages - 1 : Math.min(S.pages - 1, Math.floor((at || 0) * S.pages + 0.0001));
    show(false);
    S.loading = false;
    if (S.comm === undefined) commP.then(c => { if (token === S.loadToken && c) { S.comm = c; rerender(); } });
    commAvailable(data.sectionRef).then(a => { if (token === S.loadToken) { S.commAvail = a; if (!$('menu').hidden) renderCommMenu(); } }).catch(() => {});
    if (S.cur >= 0) $('m-sec').value = String(S.cur);
    loadShape(data.title);
    readAhead(data, token);
  }
  async function waitFonts() {
    try {
      if (S.fontWait) { await S.fontWait; await document.fonts.load('400 20px "Noto Serif Hebrew"', '\u05D0\u0591'); }
      await document.fonts.ready;
    } catch {}
  }
  // Fetch the next few sections in the background so they open instantly and are saved for offline.
  async function readAhead(data, token) {
    let d = data;
    for (let k = 0; k < (SET.ahead || 1) && d && d.next; k++) {
      if (token !== S.loadToken) return;
      try { d = await getText(d.next); await loadComm(d).catch(() => null); } catch { return; }
      await sleep(120);
    }
  }
  // Keep the reader on the same pasuk/segment when the layout changes.
  function getAnchor() {
    if (!S.data) return null;
    if (S.both) {
      const pg = flow.querySelectorAll('.bpage')[S.page];
      const el = pg && pg.querySelector('[data-i]');
      return el ? Number(el.dataset.i) : null;
    }
    const cr = clip.getBoundingClientRect();
    for (const a of flow.querySelectorAll('.seg > .a')) {
      const r = a.getBoundingClientRect();
      if (r.left >= cr.left - 2 && r.right <= cr.right + 2) return Number(a.parentNode.dataset.i);
    }
    return null;
  }
  function pageOf(i) {
    if (i == null) return null;
    if (S.both) {
      const pages = [...flow.querySelectorAll('.bpage')];
      const k = pages.findIndex(p => p.querySelector(`[data-i="${i}"]`));
      return k >= 0 ? k : null;
    }
    const a = flow.querySelector(`.seg[data-i="${i}"] > .a`);
    if (!a) return null;
    const prev = flow.style.transform;
    flow.classList.add('instant');
    flow.style.transform = 'none';
    const fr = flow.getBoundingClientRect(), r = a.getBoundingClientRect();
    flow.style.transform = prev;
    const off = S.rtl ? fr.right - r.right : r.left - fr.left;
    return Math.max(0, Math.min(S.pages - 1, Math.floor((off + 1) / S.step)));
  }
  function place(anchor, frac) {
    const p = pageOf(anchor);
    S.page = p != null ? p : Math.min(S.pages - 1, Math.floor(frac * S.pages + 0.0001));
  }
  function takeAnchor() {
    const k = S.keep || { a: getAnchor(), frac: S.pages > 1 ? S.page / S.pages : 0 };
    clearTimeout(S.keepT); S.keepT = setTimeout(() => { S.keep = null; }, 400);
    return k;
  }
  function relayout() {
    if (!S.data || reader.hidden) return;
    const { a, frac } = takeAnchor();
    layout();
    place(a, frac);
    show(false);
  }
  function rerender() {
    if (!S.data || reader.hidden) return;
    const { a, frac } = takeAnchor();
    render(); layout(); place(a, frac); show(false);
    if (S.fontWait || SET.commFont === 'rashi') relayoutAfterFonts();
  }
  let fontT;
  function relayoutAfterFonts() {
    clearTimeout(fontT);
    fontT = setTimeout(async () => { await waitFonts(); relayout(); }, 60);
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
    if (!$('pdlg').hidden) { if (e.key === 'Escape') closePrint(); return; }
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
    pressGroup('m-vowels', SET.vowels); pressGroup('m-align', SET.align); pressGroup('m-commfont', SET.commFont);
    $('m-ahead').value = String(SET.ahead);
  }
  function openMenu() {
    const inReader = !reader.hidden && S.data;
    $('menu').hidden = false; $('scrim').hidden = false;
    $('m-he').textContent = inReader ? (S.data.heTitle || '') : 'הגדרות קריאה';
    $('m-en').textContent = inReader ? (S.data.title || '') : 'Reading settings';
    if (inReader) {
      renderCommMenu();
      $('m-about').href = bookHash(S.data.title);
      $('m-about').hidden = !S.data.title;
      $('m-goto').hidden = !S.sections.length;
      if (S.cur >= 0) $('m-sec').value = String(S.cur);
    }
    syncControls();
  }
  function closeMenu() { $('menu').hidden = true; $('scrim').hidden = true; }
  $('m-close').onclick = closeMenu;
  $('scrim').onclick = () => { closeMenu(); closePrint(); };
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
  bindGroup('m-vowels', 'vowels', rerender);
  bindGroup('m-align', 'align', relayout);
  bindGroup('m-commfont', 'commFont', relayoutAfterFonts);

  // ================= Print =================
  // The text is reflowed for paper (not copied from the screen pages): two columns on A4,
  // or Hebrew/English side by side, with chosen commentaries under each segment.
  const P_SIZE = { S: '10.5pt', M: '12pt', L: '14pt' };
  const P_MARGIN = { narrow: '10mm 10mm 12mm', normal: '15mm 14mm 17mm', wide: '22mm 20mm 24mm' };
  SET.print = Object.assign({}, DEFAULTS.print, SET.print);
  function syncPrint() {
    const P = SET.print;
    $('p-count').value = String(P.count);
    pressGroup('p-paper', P.paper); pressGroup('p-cols', P.cols); pressGroup('p-size', P.size); pressGroup('p-margin', P.margin);
    const chosen = S.data ? (SET.comm[S.data.title] || []) : [];
    $('p-comm-wrap').hidden = !chosen.length;
    $('p-comm').checked = P.comm;
    $('p-comm-names').textContent = chosen.length ? `(${chosen.join(', ')})` : '';
    $('p-cols').closest('.opt').hidden = SET.lang === 'both';
  }
  function openPrint() {
    closeMenu();
    $('pdlg').hidden = false; $('scrim').hidden = false;
    $('p-status').textContent = '';
    syncPrint();
  }
  function closePrint() { $('pdlg').hidden = true; if ($('menu').hidden) $('scrim').hidden = true; }
  $('m-print').onclick = openPrint;
  $('p-close').onclick = closePrint;
  ['p-paper', 'p-cols', 'p-size', 'p-margin'].forEach(id => document.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.onclick = () => {
    SET.print[id.slice(2)] = b.dataset.v; pressGroup(id, b.dataset.v); writeJSON(KEY_SET, SET);
  }));
  $('p-count').onchange = e => { SET.print.count = Number(e.target.value); writeJSON(KEY_SET, SET); };
  $('p-comm').onchange = e => { SET.print.comm = e.target.checked; writeJSON(KEY_SET, SET); };

  function printSection(data, comm) {
    const en = data.en, he = data.he.map(prepHe);
    let mode = SET.lang;
    const hasEn = en.some(Boolean), hasHe = he.some(Boolean);
    if ((mode === 'en' || mode === 'both') && !hasEn) mode = 'he';
    if (mode !== 'en' && !hasHe) mode = 'en';
    const rtl = mode !== 'en';
    const trop = mode !== 'en' && !TROP_FONTS.has(SET.heFont) && TROP_RE.test(he.join(''));
    const sec = h('section', { class: 'p-sec' + (trop ? ' trop' : ''), dir: rtl ? 'rtl' : 'ltr' },
      h('h2', { class: 'sec', dir: rtl ? 'rtl' : 'ltr' }, rtl ? data.heRef : data.ref));
    if (mode === 'both') {
      const len = Math.max(he.length, en.length);
      for (let i = 0; i < len; i++) {
        if (!he[i] && !en[i]) continue;
        sec.append(rowEl({ he: he[i] ? cleanHtml(he[i]) : '', en: en[i] ? cleanHtml(en[i]) : '', i }));
        commOf(comm, data, i).forEach((c, k, list) => {
          const first = k === 0 || list[k - 1].who.en !== c.who.en;
          sec.append(rowEl({ comm: true, i: null,
            he: c.he ? (first ? `<cite>${esc(c.who.he || c.who.en)}</cite> ` : '') + cleanHtml(prepHe(c.he)) : '',
            en: c.en ? (first ? `<cite>${esc(c.who.en)}</cite> ` : '') + cleanHtml(c.en) : '' }));
        });
      }
    } else {
      (mode === 'en' ? en : he).forEach((t, i) => {
        if (!t) return;
        sec.append(para(t, mode === 'en' ? 'en' : 'he', i, rtl));
        const list = commOf(comm, data, i);
        if (list.length) sec.append(commBlock(list, mode));
      });
    }
    return { sec, trop, rtl };
  }
  function buildPrint(list, comms) {
    const P = SET.print;
    const both = SET.lang === 'both';
    const parts = list.map((d, k) => printSection(d, comms[k]));
    const rtl = parts.length ? parts[0].rtl : true;
    const first = list[0], last = list[list.length - 1];
    const range = list.length > 1 ? `${rtl ? first.heRef : first.ref} – ${rtl ? last.heRef : last.ref}` : (rtl ? first.heRef : first.ref);
    const flowEl = h('div', { class: 'p-flow' + (both ? ' p-both' : (P.cols === '2' ? ' cols2' : '')), dir: rtl ? 'rtl' : 'ltr' }, parts.map(p => p.sec));
    flowEl.classList.toggle('nonums', !SET.nums);
    $('print').replaceChildren(
      h('h1', { class: 'p-title', dir: rtl ? 'rtl' : 'ltr' }, rtl ? (first.heTitle || first.title) : first.title,
        rtl && first.title ? h('span', { class: 'en' }, first.title) : null),
      flowEl);
    const q = t => '"' + String(t).replace(/["\\]/g, '') + '"';
    $('pstyle').textContent = `@page { size: ${P.paper === 'letter' ? 'letter' : 'A4'} portrait; margin: ${P_MARGIN[P.margin] || P_MARGIN.normal};
      @top-center { content: ${q(range)}; font: 9pt "Frank Ruhl Libre", serif; color: #666; }
      @bottom-center { content: counter(page); font: 9pt system-ui, sans-serif; color: #666; } }
      @page :first { @top-center { content: none; } }
      #print { --pfs: ${P_SIZE[P.size] || P_SIZE.M}; }`;
    return parts.some(p => p.trop);
  }
  async function loadPrintFonts(trop) {
    const fams = [SET.heFont, SET.enFont];
    if (trop) fams.push('Noto Serif Hebrew');
    if (SET.commFont === 'rashi') fams.push('Noto Rashi Hebrew');
    await Promise.all(fams.map(f => ensureFont(f).then(() => Promise.all([
      document.fonts.load(`400 12pt "${f}"`, 'אבג abc'), document.fonts.load(`700 12pt "${f}"`, 'אבג abc')])).catch(() => {})));
  }
  $('p-go').onclick = async () => {
    if (!S.data) return;
    const P = SET.print, btn = $('p-go'), status = $('p-status');
    btn.disabled = true;
    const list = [S.data];
    try {
      let d = S.data;
      for (let k = 0; k < P.count && d.next; k++) {
        status.textContent = `Getting ${k + 2} of ${P.count + 1}…`;
        d = await getText(d.next); list.push(d);
      }
    } catch { status.textContent = `Couldn't get everything; printing ${list.length}.`; }
    const withComm = P.comm && (SET.comm[S.data.title] || []).length;
    const comms = [];
    for (let k = 0; k < list.length; k++) {
      if (withComm) status.textContent = `Getting commentaries ${k + 1} of ${list.length}…`;
      comms.push(withComm ? (list[k] === S.data && S.comm ? S.comm : await loadComm(list[k]).catch(() => null)) : null);
    }
    status.textContent = 'Preparing pages…';
    const trop = buildPrint(list, comms);
    await loadPrintFonts(trop);
    btn.disabled = false;
    status.textContent = '';
    closePrint();
    window.print();
  };
  // Printing from the browser's own menu prints the current section with the saved print options.
  window.addEventListener('beforeprint', () => {
    if (!$('print').childElementCount && S.data && !reader.hidden) buildPrint([S.data], [SET.print.comm ? S.comm : null]);
  });
  window.addEventListener('afterprint', () => { $('print').replaceChildren(); });
  function renderCommMenu() {
    const box = $('m-comm');
    if (!S.data) return;
    if (/-/.test(S.data.ref)) { box.replaceChildren(h('p', { class: 'help' }, 'Open a single chapter or daf to show commentaries.')); return; }
    if (!S.commAvail) { box.replaceChildren(h('p', { class: 'help' }, 'Finding commentaries…')); return; }
    if (!S.commAvail.length) { box.replaceChildren(h('p', { class: 'help' }, 'Sefaria has no commentaries linked to this section.')); return; }
    const chosen = SET.comm[S.data.title] || [];
    const list = [...S.commAvail].sort((a, b) => (chosen.includes(b.en) - chosen.includes(a.en)) || b.n - a.n);
    const top = list.slice(0, 12), more = list.slice(12);
    const chip = c => h('button', { class: 'chip-btn', 'aria-pressed': String(chosen.includes(c.en)), onclick: () => toggleComm(c.en) },
      h('span', { class: 'ch-he', lang: 'he' }, c.he || c.en), h('span', { class: 'ch-en' }, c.he ? c.en : ''), h('span', { class: 'ch-n' }, String(c.n)));
    const kids = [h('div', { class: 'chips-row' }, top.map(chip))];
    if (more.length) {
      const sel = h('select', { id: 'm-comm-more', 'aria-label': 'More commentaries' }, h('option', { value: '' }, `More (${more.length})…`),
        more.map(c => h('option', { value: c.en }, `${c.en}${c.he ? ' · ' + c.he : ''} (${c.n})`)));
      sel.onchange = () => { if (sel.value) toggleComm(sel.value); };
      kids.push(sel);
    }
    if (chosen.length) kids.push(h('button', { class: 'linkish', onclick: () => { SET.comm[S.data.title] = []; applySettings(); refreshComm(); } }, 'Hide all'));
    box.replaceChildren(...kids);
  }
  function toggleComm(name) {
    const t = S.data.title;
    const cur = SET.comm[t] || [];
    SET.comm[t] = cur.includes(name) ? cur.filter(x => x !== name) : [...cur, name];
    if (!SET.comm[t].length) delete SET.comm[t];
    applySettings();
    refreshComm();
  }
  async function refreshComm() {
    renderCommMenu();
    const data = S.data, token = S.loadToken;
    $('m-comm-status').textContent = (SET.comm[data.title] || []).length ? 'Loading…' : '';
    let c = null;
    try { c = await loadComm(data); } catch {}
    if (token !== S.loadToken || S.data !== data) return;
    $('m-comm-status').textContent = '';
    S.comm = c;
    rerender();
  }
  $('m-ahead').onchange = e => { SET.ahead = Number(e.target.value); applySettings(); };
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
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { if (!reader.hidden && S.data && !S.loading) relayoutAfterFonts(); });
  window.addEventListener('online', () => { if (!libEl.hidden) route(); });
  window.addEventListener('offline', () => { if (!libEl.hidden) route(); });
})();
