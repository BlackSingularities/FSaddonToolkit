// FS Addon Toolkit – interfejs
import { icon } from './icons.js';
import { t, setLang, lang } from './i18n.js';

const T = window.__TAURI__;
const invoke = (cmd, args) => T.core.invoke(cmd, args);
const fileSrc = (p) => T.core.convertFileSrc(p);
const opener = T.opener;
const dlg = T.dialog;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const errMsg = (e) => (typeof e === 'string' ? e : e?.message || JSON.stringify(e));
const nf = () => new Intl.NumberFormat(lang() === 'pl' ? 'pl-PL' : 'en-GB');
function fmtSize(b) {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1).replace('.', lang() === 'pl' ? ',' : '.')} ${u[i]}`;
}
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(lang() === 'pl' ? 'pl-PL' : 'en-GB') : '—');
const fmtTime = (iso) => new Date(iso).toLocaleString(lang() === 'pl' ? 'pl-PL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const plural = (n, one, few, many) => {
  if (lang() !== 'pl') return n === 1 ? one : many;
  if (n === 1) return one;
  const d = n % 10; const h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};

// ───────────── Kategorie ─────────────
const CATS = [
  { id: 'aircraft', color: '#5cc4ff' },
  { id: 'airport', color: '#4fd18b' },
  { id: 'scenery', color: '#b7a2ff' },
  { id: 'livery', color: '#ff95b5' },
  { id: 'utility', color: '#ffc35a' },
  { id: 'library', color: '#7f8ea3' },
  { id: 'other', color: '#a3b1c4' },
];
const catOf = (p) => p.meta?.category || p.category || 'other';
const catColor = (c) => CATS.find((x) => x.id === c)?.color || '#a3b1c4';
const PROFILE_COLORS = ['#5cc4ff', '#4fd18b', '#ffc35a', '#ff95b5', '#b7a2ff', '#ff8a5c', '#7f8ea3'];

// ───────────── Stan ─────────────
const S = {
  info: {}, settings: {}, installs: [], scan: null, profiles: [], issues: null, official: null, history: null,
  status: { running: false, disks: [] },
  view: 'dashboard',
  collapsed: new Set(),
  f: { cat: 'all', state: 'all', source: 'all', q: '', fav: false, sort: 'title', dir: 1 },
  selecting: false, sel: new Set(),
  sheetId: null, busy: new Set(),
  map: null, mapLayers: null, plan: { dep: null, arr: null, radius: 60, corridor: 0, offOthers: true, aircraft: '', offAircraft: false },
  officialF: { cat: 'all', q: '', state: 'all' },
};
const pkgById = (id) => S.scan?.packages.find((p) => p.id === id);

// ───────────── Powiadomienia i okna ─────────────
function toast(msg, kind = 'ok', action) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'bad' ? 'error' : kind === 'warn' ? 'warn' : 'ok')}<div class="grow">${esc(msg)}</div>${action ? `<button class="btn sm">${esc(action.label)}</button>` : ''}`;
  if (action) $('button', el).onclick = () => { action.run(); el.remove(); };
  $('#dock').prepend(el);
  setTimeout(() => el.remove(), action ? 9000 : kind === 'bad' ? 8000 : 4200);
}
function dialog({ title, body, actions = [], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog ${wide ? 'wide' : ''}"><h2>${esc(title)}</h2><div class="db">${body}</div><div class="df"></div></div>`;
    const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = `btn ${a.kind || ''}`;
      b.textContent = a.label;
      b.onclick = () => close(a.value !== undefined ? (typeof a.value === 'function' ? a.value(wrap) : a.value) : a.label);
      $('.df', wrap).append(b);
    });
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
    $('#layers').append(wrap);
    onOpen?.(wrap, close);
    ($('input,select,textarea', wrap) || $('.df .primary', wrap))?.focus();
  });
}
const confirmBox = (title, body, ok = t('ok'), kind = 'primary') => dialog({ title, body, actions: [{ label: t('cancel'), value: false }, { label: ok, value: true, kind }] });
async function promptBox(title, label, value = '') {
  const r = await dialog({
    title,
    body: `<label class="field">${esc(label)}<input class="inp" id="pr-in" value="${esc(value)}"></label>`,
    actions: [{ label: t('cancel'), value: null }, { label: t('save'), kind: 'primary', value: (w) => $('#pr-in', w).value.trim() }],
    onOpen: (w, close) => { const i = $('#pr-in', w); i.select(); i.onkeydown = (e) => { if (e.key === 'Enter') close(i.value.trim()); }; },
  });
  return r || null;
}
function opErrors(res, okMsg) {
  if (res.errors?.length) {
    const list = res.errors.slice(0, 8).map((e) => `<div class="row"><div class="grow"><div class="t">${esc(e.title || '—')}</div><div class="d" style="white-space:normal">${esc(e.message)}</div></div></div>`).join('');
    dialog({ title: t('someFailed', res.errors.length), body: `<div class="card list">${list}</div>`, actions: [{ label: t('ok'), kind: 'primary' }] });
  } else if (okMsg) {
    toast(okMsg, 'ok', res.batch && res.changed ? { label: t('undo'), run: () => undoBatch(res.batch) } : null);
  }
}

// ───────────── Zadania w tle ─────────────
const jobs = new Map();
T.event.listen('job', ({ payload: j }) => {
  let el = jobs.get(j.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'job';
    $('#dock').append(el);
    jobs.set(j.id, el);
  }
  const pct = j.total ? Math.round((j.done / j.total) * 100) : j.finished ? 100 : 0;
  el.innerHTML = `<div class="t">${icon(j.finished ? 'ok' : 'refresh', j.finished ? '' : 'spin')}${esc(j.label)}</div>
    <div class="d">${j.steps > 1 ? `${j.step}/${j.steps} · ` : ''}${esc(j.detail)}${j.total ? ` · ${pct}%` : ''}</div>
    <div class="bar"><span style="width:${j.steps > 1 ? ((j.step - 1 + pct / 100) / j.steps) * 100 : pct}%"></span></div>`;
  if (j.finished) {
    setTimeout(() => { el.remove(); jobs.delete(j.id); }, 1800);
    if (j.errors.length) dialog({ title: t('jobErrors', j.label), body: `<div class="card list">${j.errors.map((e) => `<div class="row"><div class="grow d" style="white-space:normal">${esc(e)}</div></div>`).join('')}</div>`, actions: [{ label: t('ok'), kind: 'primary' }] });
    else toast(t('jobDone', j.label, j.changed));
    refresh();
  }
});

// ───────────── Dane ─────────────
async function loadScan(force = false) {
  try {
    S.scan = await invoke('scan', { force });
    S.liveryIndex = null;
    S.status.running = S.scan.simRunning;
  } catch (e) {
    toast(errMsg(e), 'bad');
  }
}
async function refresh(force = false) {
  await loadScan(force);
  S.issues = null;
  renderRail();
  renderView();
  if (S.sheetId) { if (pkgById(S.sheetId)) openSheet(S.sheetId, true); else closeSheet(); }
  loadIssues();
}
async function loadIssues() {
  try {
    S.issues = await invoke('health');
    renderRail();
    if (S.view === 'health' || S.view === 'dashboard') renderView();
  } catch { /* skan już pokazał błąd */ }
}
async function saveSettings() {
  try { S.settings = await invoke('save_settings', { settings: S.settings }); } catch (e) { toast(errMsg(e), 'bad'); }
}
const persist = debounce(saveSettings, 300);
function meta(key) {
  S.settings.meta ||= {};
  return (S.settings.meta[key] ||= { favorite: false, locked: false, category: '', tags: [], note: '' });
}
async function setMeta(p, patch) {
  Object.assign(meta(p.key), patch);
  await saveSettings();
  await loadScan();
  renderView();
  if (S.sheetId) openSheet(S.sheetId, true);
}

// ───────────── Przełączanie ─────────────
// Przy włączaniu samolotu pytamy o jego malowania (osobne dodatki), przy wyłączaniu – czy je też wyłączyć.
async function withLiveries(ids, on) {
  const mode = S.settings.liveryPrompt || 'ask';
  const extra = [];
  const seen = new Set(ids);
  for (const id of ids) {
    const p = pkgById(id);
    if (!p || catOf(p) !== 'aircraft') continue;
    for (const l of relatedOf(p)) if (l.enabled !== on && !seen.has(l.id)) { seen.add(l.id); extra.push(l); }
  }
  if (!extra.length || (on && mode === 'none')) return ids;
  if (on && mode === 'all') return [...ids, ...extra.map((l) => l.id)];
  const planes = ids.map(pkgById).filter((p) => p && catOf(p) === 'aircraft').map((p) => p.title).join(', ');
  const r = await dialog({
    title: on ? t('liveryQOn', planes) : t('liveryQOff', planes),
    body: `<div>${esc(on ? t('liveryQOnD', `${extra.length} ${plural(extra.length, t('liv1'), t('liv2'), t('liv5'))}`) : t('liveryQOffD', extra.length))}</div>
      <div style="display:flex;gap:8px"><button class="btn sm" id="lv-all">${esc(t('selectAll'))}</button><button class="btn sm ghost" id="lv-none">${esc(t('selectNone'))}</button></div>
      <div class="card list" style="max-height:360px;overflow:auto">${extra.map((l) => `<label class="rel" style="cursor:pointer"><input type="checkbox" value="${l.id}" ${on ? 'checked' : 'checked'} style="accent-color:var(--acc);width:16px;height:16px">
        <div class="th">${l.thumbs[0] ? `<img data-src="${esc(l.thumbs[0])}" alt="">` : ''}</div><div class="grow"><b>${esc(l.title)}</b><small>${esc(l.creator || l.folder)} · ${fmtSize(l.size)}${l.aircraft.length ? ` · ${l.aircraft.length} ${esc(t('variantsShort'))}` : ''}</small></div></label>`).join('')}</div>
      ${on ? `<div class="faint" style="font-size:12px">${esc(t('liveryPromptHint'))}</div>` : ''}`,
    wide: true,
    actions: [{ label: t('cancel'), value: null }, { label: on ? t('withoutLiveries') : t('keepLiveries'), value: [] }, { label: on ? t('enableSelected') : t('disableSelected'), kind: 'primary', value: (w) => $$('input:checked', w).map((i) => i.value) }],
    onOpen: (w) => {
      observeThumbs(w);
      $('#lv-all', w).onclick = () => $$('input', w).forEach((i) => (i.checked = true));
      $('#lv-none', w).onclick = () => $$('input', w).forEach((i) => (i.checked = false));
    },
  });
  if (r === null) return null;
  return [...ids, ...r];
}
async function toggle(ids, on, label) {
  ids = ids.filter((id) => { const p = pkgById(id); return p && p.enabled !== on; });
  if (!ids.length) return;
  ids = await withLiveries(ids, on);
  if (!ids) return;
  ids.forEach((id) => S.busy.add(id));
  ids.forEach((id) => $$(`[data-sw="${id}"]`).forEach((sw) => { sw.classList.add('busy'); sw.classList.toggle('on', on); }));
  try {
    const res = await invoke('set_enabled', { ids, enabled: on, label: label || (on ? t('lblEnable') : t('lblDisable')) });
    ids.forEach((id) => S.busy.delete(id));
    await loadScan();
    renderRail();
    renderView();
    if (S.sheetId) openSheet(S.sheetId, true);
    const p = ids.length === 1 ? pkgById(ids[0]) : null;
    opErrors(res, ids.length > 1 || res.changed !== 1 ? t(on ? 'enabledN' : 'disabledN', res.changed) : t(on ? 'enabledOne' : 'disabledOne', p?.title || ''));
    loadIssues();
  } catch (e) {
    ids.forEach((id) => S.busy.delete(id));
    toast(errMsg(e), 'bad');
    await loadScan();
    renderView();
  }
}
async function applyChanges(enable, disable, label, okMsg) {
  if (!enable.length && !disable.length) { toast(t('nothingToChange'), 'warn'); return null; }
  try {
    const res = await invoke('apply_changes', { enable, disable, label });
    await refresh();
    opErrors(res, okMsg || t('changedN', res.changed));
    return res;
  } catch (e) { toast(errMsg(e), 'bad'); return null; }
}
async function undoBatch(batch) {
  try {
    const res = await invoke('undo_batch', { batch });
    S.history = null;
    if (S.official) S.official = null;
    await refresh();
    opErrors(res, t('undone', res.changed));
  } catch (e) { toast(errMsg(e), 'bad'); }
}

// ───────────── Miniatury ─────────────
const thumbCache = new Map();
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    loadThumb(e.target);
  }
}, { rootMargin: '400px' });
async function loadThumb(img) {
  const path = img.dataset.src;
  if (!path) return;
  let url = thumbCache.get(path);
  if (!url) {
    try { url = fileSrc(await invoke('thumb', { path })); } catch { url = fileSrc(path); }
    thumbCache.set(path, url);
  }
  img.onload = () => img.classList.add('ready');
  img.onerror = () => img.remove();
  img.src = url;
}
function observeThumbs(root) { $$('img[data-src]', root).forEach((i) => io.observe(i)); }

// ───────────── Pasek nawigacji ─────────────
const VIEWS = [
  ['dashboard', 'dashboard'], ['addons', 'addons'], ['map', 'map'], ['profiles', 'profiles'],
  ['official', 'official'], ['health', 'health'], ['history', 'history'], ['settings', 'settings'],
];
function renderRail() {
  const issues = S.issues || [];
  const errs = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const inst = S.scan?.installation;
  $('#rail').innerHTML = `<div class="brand"><img src="assets/icon.png" alt=""></div>
    ${VIEWS.map(([v, ic]) => `<button class="nav-btn ${S.view === v ? 'active' : ''}" data-view="${v}" title="${esc(t('nav_' + v))}">
      <span class="pill">${icon(ic)}</span>${esc(t('nav_' + v))}
      ${v === 'health' && (errs || warns) ? `<span class="badge ${errs ? '' : 'warn'}">${errs || warns}</span>` : ''}</button>`).join('')}
    <div class="spacer"></div>
    <button class="sim-chip ${S.status.running ? 'on' : ''}" id="launch" ${!inst || S.status.running ? 'disabled' : ''} title="${esc(inst ? `${t('launch')} – ${inst.label || ''}` : t('noSim'))}">
      <span class="pill">${icon('play')}<span class="sim-dot"></span></span>
      <small>${esc(S.status.running ? t('simRunning') : inst ? `MSFS ${inst.sim}` : t('noSim'))}</small>
    </button>`;
  $$('.nav-btn', $('#rail')).forEach((b) => (b.onclick = () => go(b.dataset.view)));
  $('#launch').onclick = async () => {
    try { await invoke('launch_sim'); toast(t('launching')); setTimeout(pollStatus, 8000); } catch (e) { toast(errMsg(e), 'bad'); }
  };
}
function go(view) {
  if (S.view === 'map' && view !== 'map') { S.map?.remove(); S.map = null; S.mapMarkers = []; S.mapSelectMode = false; }
  S.view = view;
  S.selecting = false; S.sel.clear();
  renderRail();
  renderView();
  $('#view').scrollTop = 0;
}
async function pollStatus() {
  try {
    const st = await invoke('sim_status');
    const changed = st.running !== S.status.running;
    S.status = st;
    if (changed) renderRail();
    if (S.view === 'dashboard') renderDiskList();
  } catch { /* ignorujemy */ }
}

function topbar(title, sub = '', right = '') {
  $('#topbar').innerHTML = `<div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="grow"></div>${right}`;
}

function renderView() {
  const v = $('#view');
  v.classList.toggle('flush', S.view === 'map');
  $('#bulk').classList.remove('show');
  if (!S.scan) { topbar(t('appName')); v.innerHTML = `<div class="loading">${icon('refresh', 'spin')}<div>${esc(t('scanning'))}</div></div>`; return; }
  ({ dashboard: viewDashboard, addons: viewAddons, map: viewMap, profiles: viewProfiles, official: viewOfficial, health: viewHealth, history: viewHistory, settings: viewSettings }[S.view] || viewDashboard)(v);
}

// ───────────── Pulpit ─────────────
function viewDashboard(v) {
  const sc = S.scan;
  const inst = sc.installation;
  const pk = sc.packages;
  const on = pk.filter((p) => p.enabled);
  const sum = (l) => l.reduce((a, p) => a + p.size, 0);
  const sizeOn = sum(on);
  const sizeAll = sum(pk);
  topbar(t('nav_dashboard'), inst ? `${esc(inst.label)} · <span class="mono">${esc(sc.target)}</span>` : esc(t('noSim')),
    `<button class="btn primary" id="d-plan">${icon('target')}${esc(t('prepareFlight'))}</button>
     <button class="btn" id="d-light">${icon('bolt')}${esc(t('lightMode'))}</button>
     <button class="btn" id="d-save">${icon('save')}${esc(t('saveAsProfile'))}</button>
     <button class="btn" id="d-install">${icon('download')}${esc(t('install'))}</button>
     <button class="btn icon" id="d-refresh" title="${esc(t('refreshHint'))}">${icon('refresh')}</button>`);
  if (sc.error) {
    v.innerHTML = `<div class="empty">${icon('warn')}<h3>${esc(t('setupNeeded'))}</h3><div>${esc(sc.error)}</div><button class="btn primary" id="go-set">${icon('settings')}${esc(t('openSettings'))}</button></div>`;
    $('#go-set').onclick = () => go('settings');
    $('#d-refresh').onclick = (e) => refresh(e.shiftKey);
    $('#d-install').onclick = () => installDialog();
    ['#d-plan', '#d-light', '#d-save'].forEach((id) => ($(id).disabled = true));
    return;
  }
  const byCat = CATS.map((c) => ({ ...c, all: pk.filter((p) => catOf(p) === c.id), on: on.filter((p) => catOf(p) === c.id) })).filter((c) => c.all.length);
  const issues = S.issues || [];
  const errs = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const active = S.profiles.find((p) => profileMatch(p) === 1);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const bar = (a, b, color = 'var(--acc)') => `<div class="mbar"><span style="width:${b ? (a / b) * 100 : 0}%;background:${color}"></span></div>`;

  // Lotniska: każdy kod ICAO osobno, kraje wg pakietów.
  const apts = pk.filter((p) => catOf(p) === 'airport');
  const icaos = new Set(apts.flatMap((p) => p.airports.map((a) => a.icao)));
  const countries = byCountry(apts).filter((g) => g.cc);
  const planes = pk.filter((p) => catOf(p) === 'aircraft');
  const liveries = pk.filter((p) => catOf(p) === 'livery');
  const orphanLiv = liveries.filter((l) => !relatedOf(l).length).length;

  // Źródła: biblioteki + Community, wyłączone i zewnętrzne.
  const srcRows = [
    ...sc.libraries.map((l) => ({ name: l.name, path: l.path, n: l.count, on: l.enabled, size: l.size, missing: !l.exists, ic: 'library', f: `lib:${l.id}` })),
    ...['community', 'parking', 'external'].map((s) => { const l = pk.filter((p) => p.source === s); return { name: t('src_' + s), path: s === 'community' ? sc.target : s === 'parking' ? sc.parking : '', n: l.length, on: l.filter((p) => p.enabled).length, size: sum(l), ic: s === 'community' ? 'folder' : s === 'parking' ? 'eyeoff' : 'link', f: s }; }).filter((r) => r.n),
  ];
  const creators = Object.values(pk.reduce((m, p) => { const k = (p.creator || '').trim(); if (k) { (m[k] ||= { name: k, n: 0, on: 0, size: 0 }); m[k].n++; m[k].on += p.enabled; m[k].size += p.size; } return m; }, {})).sort((a, b) => b.n - a.n || b.size - a.size);
  const biggest = [...pk].sort((a, b) => b.size - a.size).slice(0, 8);
  const maxBig = biggest[0]?.size || 1;
  const recent = [...pk].sort((a, b) => b.modified - a.modified).slice(0, 12);
  const favs = pk.filter((p) => p.meta.favorite);
  const locked = pk.filter((p) => p.meta.locked).length;
  const noLayout = pk.filter((p) => p.hasManifest && !p.hasLayout).length;

  const kpi = (ic, label, val, sub, extra = '', go = '') => `<div class="kpi ${go ? 'click' : ''}" ${go}>
    <div class="k-top">${icon(ic)}<span>${esc(label)}</span></div><div class="k-val">${val}</div><div class="k-sub">${sub}</div>${extra}</div>`;
  const panel = (ic, title, body, action = '', cls = '') => `<div class="dpanel ${cls}"><div class="dp-h">${icon(ic)}<b>${esc(title)}</b><span class="grow"></span>${action}</div>${body}</div>`;
  const more = (id) => `<button class="btn sm ghost" id="${id}">${esc(t('details'))}${icon('chevron')}</button>`;

  v.innerHTML = `
    ${S.status.running ? `<div class="banner warn">${icon('warn')}<div class="grow">${esc(t('simRunningBanner'))}</div></div>` : ''}
    ${sc.suggestedLibraries.length ? `<div class="banner acc">${icon('library')}<div class="grow">${esc(t('suggestedLibBanner', sc.suggestedLibraries.length))}</div><button class="btn sm primary" id="d-sugg">${esc(t('review'))}</button></div>` : ''}
    <div class="kpis">
      ${kpi('power', t('activeAddons'), `${nf().format(on.length)}<small> / ${nf().format(pk.length)}</small>`, `${pct(on.length, pk.length)}% · ${active ? `${esc(t('profile'))}: <b>${esc(active.name)}</b>` : esc(t('dNoProfile'))}`,
        `<div class="meter">${byCat.filter((c) => c.on.length).map((c) => `<span style="width:${(c.on.length / Math.max(on.length, 1)) * 100}%;background:${c.color}" title="${esc(t('cat_' + c.id))}: ${c.on.length}"></span>`).join('')}</div>`)}
      ${kpi('drive', t('dLoaded'), fmtSize(sizeOn), esc(t('dOfTotal', fmtSize(sizeAll), pct(sizeOn, sizeAll))), bar(sizeOn, sizeAll))}
      ${kpi('airport', t('cat_airport'), `${nf().format(icaos.size)}<small> ICAO</small>`, esc(t('dAirportsSub', apts.length, countries.length)), '', `data-gocat="airport"`)}
      ${kpi('aircraft', t('cat_aircraft'), `${nf().format(planes.length)}`, esc(t('dPlanesSub', liveries.length, orphanLiv)), '', `data-gocat="aircraft"`)}
      ${kpi('library', t('dSources'), `${sc.libraries.length}`, esc(t('dSourcesSub', sc.communities.length, sc.broken.length)), '', `data-go="settings"`)}
      ${kpi(errs ? 'error' : warns ? 'warn' : 'ok', t('nav_health'), S.issues === null ? '…' : errs + warns ? `${errs}<small> / ${warns}</small>` : '0', esc(S.issues === null ? t('checking') : errs + warns ? t('dIssuesSub', errs, warns) : t('allGood')), '', `data-go="health"`)}
    </div>

    <div class="dgrid">
      ${panel('layers', t('categories'), `<div class="ctable">${byCat.map((c) => `<div class="crow click" data-gocat="${c.id}">
          <span class="cdot" style="background:${c.color}"></span><span class="cname">${esc(t('cat_' + c.id))}</span>
          <span class="mono cnum">${c.on.length}/${c.all.length}</span>${bar(c.on.length, c.all.length, c.color)}<span class="mono faint csize">${fmtSize(sum(c.all))}</span></div>`).join('')}</div>`)}
      ${panel('library', t('dSources'), `<div class="ctable">${srcRows.map((r) => `<div class="crow click" data-gosrc="${esc(r.f)}" title="${esc(r.path)}">
          ${icon(r.ic)}<span class="cname">${esc(r.name)}${r.missing ? ` <span class="tag bad">${esc(t('dMissing'))}</span>` : ''}</span>
          <span class="mono cnum">${r.on}/${r.n}</span>${bar(r.on, r.n)}<span class="mono faint csize">${fmtSize(r.size)}</span></div>`).join('') || `<div class="d faint">—</div>`}</div>`, more('d-libs'))}
      ${panel('profiles', t('quickProfiles'), `<div class="list">${S.profiles.length ? S.profiles.slice(0, 6).map((p) => `<div class="row click" data-prof="${p.id}">
          <span class="cdot" style="background:${p.color || PROFILE_COLORS[0]}"></span>
          <div class="grow"><div class="t">${esc(p.name)}</div><div class="d">${p.packages.length} ${esc(plural(p.packages.length, t('pkg1'), t('pkg2'), t('pkg5')))}</div></div>
          ${profileMatch(p) === 1 ? `<span class="tag ok">${icon('check')}${esc(t('active'))}</span>` : `<button class="btn sm" data-apply="${p.id}">${esc(t('apply'))}</button>`}</div>`).join('') : `<div class="row"><div class="grow d" style="white-space:normal">${esc(t('noProfilesHint'))}</div></div>`}</div>`, more('d-prof'))}

      ${panel('globe', t('dCountries'), `<div class="ctable">${countries.sort((a, b) => b.items.length - a.items.length).slice(0, 9).map((g) => { const n = g.items.filter((p) => p.enabled).length; return `<div class="crow click" data-gocountry="${esc(g.cc)}">
          ${flag(g.cc)}<span class="cname">${esc(g.name)}</span><span class="mono cnum">${n}/${g.items.length}</span>${bar(n, g.items.length, catColor('airport'))}</div>`; }).join('') || `<div class="d faint">—</div>`}</div>`, countries.length > 9 ? `<span class="faint mono">+${countries.length - 9}</span>` : '')}
      ${panel('tag', t('dCreators'), `<div class="ctable">${creators.slice(0, 9).map((c) => `<div class="crow click" data-gocreator="${esc(c.name)}">
          <span class="cname">${esc(c.name)}</span><span class="mono cnum">${c.on}/${c.n}</span>${bar(c.on, c.n)}<span class="mono faint csize">${fmtSize(c.size)}</span></div>`).join('') || `<div class="d faint">—</div>`}</div>`, `<span class="faint mono">${creators.length}</span>`)}
      ${panel('zip', t('dBiggest'), `<div class="ctable">${biggest.map((p) => `<div class="crow click" data-id="${p.id}">
          <span class="cdot" style="background:${p.enabled ? catColor(catOf(p)) : 'var(--s4)'}"></span><span class="cname">${esc(p.title)}</span>${bar(p.size, maxBig, p.enabled ? catColor(catOf(p)) : 'var(--text-3)')}<span class="mono faint csize">${fmtSize(p.size)}</span></div>`).join('')}</div>`)}

      ${panel('health', t('nav_health'), `<div class="list">${S.issues === null ? `<div class="row"><div class="grow d">${esc(t('checking'))}</div></div>` : issues.length ? issues.slice(0, 6).map((i) => `<div class="row click" data-go="health"><span class="sev ${i.severity}">${icon(i.severity === 'error' ? 'error' : i.severity === 'warn' ? 'warn' : 'info')}</span><div class="grow"><div class="t">${esc(i.title)}</div></div></div>`).join('') : `<div class="row"><span class="sev ok">${icon('ok')}</span><div class="grow t">${esc(t('allGood'))}</div></div>`}</div>
        <div class="facts"><span>${icon('star')}${favs.length} ${esc(t('favorites').toLowerCase())}</span><span>${icon('lock')}${locked} ${esc(t('dLocked'))}</span><span>${icon('file')}${noLayout} ${esc(t('dNoLayout'))}</span><span>${icon('unlink')}${sc.broken.length} ${esc(t('dBroken'))}</span><span>${icon('folder')}${sc.strays.length} ${esc(t('dStrays'))}</span></div>`, more('d-health'))}
      ${panel('drive', t('storage'), `<div class="list" id="disk-list"></div><div class="facts"><span>${icon('refresh')}${esc(t('dScanTook', (sc.tookMs / 1000).toFixed(1)))}</span></div>`)}
      ${panel('history', t('dActivity'), `<div class="list" id="d-activity"><div class="row"><div class="grow d">${esc(t('checking'))}</div></div></div>`, more('d-hist'))}
    </div>

    <div class="section-title">${icon('history')}${esc(t('recentlyAdded'))}</div>
    <div class="grid">${recent.map(cardHtml).join('')}</div>`;
  renderDiskList();
  renderActivity();
  observeThumbs(v);
  bindCards(v);
  $('#d-refresh').onclick = (e) => refresh(e.shiftKey);
  $('#d-install').onclick = () => installDialog();
  $('#d-plan').onclick = () => { go('map'); setTimeout(() => setMapTab('plan'), 50); };
  $('#d-light').onclick = lightMode;
  $('#d-save').onclick = () => saveCurrentAsProfile();
  $('#d-prof').onclick = () => go('profiles');
  $('#d-health').onclick = () => go('health');
  $('#d-hist').onclick = () => go('history');
  $('#d-libs').onclick = () => go('settings');
  $('#d-sugg') && ($('#d-sugg').onclick = () => onboarding(true));
  const toAddons = (patch) => { Object.assign(S.f, { cat: 'all', source: 'all', state: 'all', q: '', fav: false }, patch); go('addons'); };
  $$('[data-go]', v).forEach((r) => (r.onclick = () => go(r.dataset.go)));
  $$('[data-gocat]', v).forEach((c) => (c.onclick = () => toAddons({ cat: c.dataset.gocat })));
  $$('[data-gosrc]', v).forEach((c) => (c.onclick = () => toAddons({ source: c.dataset.gosrc })));
  $$('[data-gocreator]', v).forEach((c) => (c.onclick = () => toAddons({ q: c.dataset.gocreator })));
  $$('[data-gocountry]', v).forEach((c) => (c.onclick = () => {
    // Pokazujemy wszystkie lotniska pogrupowane, zwinięte poza wybranym krajem.
    S.settings.groupCountry = true;
    S.collapsed = new Set(countries.map((g) => g.cc).filter((x) => x !== c.dataset.gocountry).concat(''));
    toAddons({ cat: 'airport' });
    $(`[data-grp="${c.dataset.gocountry}"]`)?.scrollIntoView({ block: 'start' });
  }));
  $$('[data-apply]', v).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); applyProfile(b.dataset.apply); }));
  $$('[data-prof]', v).forEach((r) => (r.onclick = () => go('profiles')));
}
async function renderActivity() {
  try { S.history ||= await invoke('history'); } catch { S.history = []; }
  const el = $('#d-activity');
  if (!el) return;
  const batches = [];
  for (const e of S.history) {
    const b = batches[batches.length - 1];
    if (b && b.batch === e.batch) { b.n++; if (!e.undone) b.undone = false; } else batches.push({ batch: e.batch, label: e.label, at: e.at, n: 1, undone: e.undone });
  }
  el.innerHTML = batches.length ? batches.slice(0, 6).map((b) => `<div class="row click" data-go="history">
    <span class="sev ${b.undone ? '' : 'acc'}">${icon(b.undone ? 'undo' : 'history')}</span>
    <div class="grow"><div class="t">${esc(b.label)}</div><div class="d">${esc(fmtTime(b.at))} · ${b.n} ${esc(plural(b.n, t('op1'), t('op2'), t('op5')))}</div></div></div>`).join('')
    : `<div class="row"><div class="grow d">${esc(t('noHistory'))}</div></div>`;
  $$('[data-go]', el).forEach((r) => (r.onclick = () => go('history')));
}
function renderDiskList() {
  const el = $('#disk-list');
  if (!el) return;
  const roots = new Set([S.scan.target, ...(S.scan.libraries || []).map((l) => l.path)].map((p) => (p || '').slice(0, 3).toUpperCase()));
  const disks = S.status.disks.filter((d) => roots.has(d.mount.toUpperCase().slice(0, 3)));
  el.innerHTML = disks.length ? disks.map((d) => {
    const used = 1 - d.free / d.total;
    const libs = S.scan.libraries.filter((l) => l.path.toUpperCase().startsWith(d.mount.toUpperCase().slice(0, 3))).map((l) => l.name);
    const isCommunity = S.scan.target.toUpperCase().startsWith(d.mount.toUpperCase().slice(0, 3));
    return `<div class="row"><div class="disk" style="width:100%"><div class="disk-letter">${esc(d.mount.slice(0, 2))}</div>
      <div class="t" style="font-size:13px">${esc([isCommunity ? 'Community' : '', ...libs].filter(Boolean).join(' · ') || d.name)}</div>
      <div class="mono faint">${esc(t('freeOf', fmtSize(d.free), fmtSize(d.total)))}</div>
      <div class="bar"><span class="${d.free / d.total < 0.08 ? 'low' : ''}" style="width:${used * 100}%"></span></div></div></div>`;
  }).join('') : `<div class="row"><div class="grow d">—</div></div>`;
}

async function lightMode() {
  const off = S.scan.packages.filter((p) => p.enabled && !p.meta.locked).map((p) => p.id);
  const locked = S.scan.packages.filter((p) => p.meta.locked).length;
  if (!off.length) { toast(t('nothingToChange'), 'warn'); return; }
  const ok = await confirmBox(t('lightMode'), `<div>${esc(t('lightModeQ', off.length))}</div><div class="faint">${esc(t('lightModeLocked', locked))}</div>`, t('disableAll'));
  if (ok) applyChanges([], off, t('lightMode'));
}

// ───────────── Filtrowanie ─────────────
function filtered() {
  const f = S.f;
  const q = f.q.trim().toLowerCase();
  let list = S.scan.packages.filter((p) => {
    if (f.cat !== 'all' && catOf(p) !== f.cat) return false;
    if (f.state === 'on' && !p.enabled) return false;
    if (f.state === 'off' && p.enabled) return false;
    if (f.fav && !p.meta.favorite) return false;
    if (f.source !== 'all') {
      if (f.source.startsWith('lib:')) { if (p.libraryId !== f.source.slice(4)) return false; } else if (p.source !== f.source) return false;
    }
    if (q) {
      const hay = `${p.title} ${p.folder} ${p.creator} ${p.manufacturer} ${p.group} ${p.meta.tags.join(' ')} ${p.meta.note} ${p.airports.map((a) => `${a.icao} ${a.name} ${a.city} ${a.country} ${countryName(a.country)}`).join(' ')} ${p.aircraft.join(' ')}`.toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const dir = f.dir;
  const cmp = {
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    creator: (a, b) => (a.creator || '~').localeCompare(b.creator || '~') || a.title.localeCompare(b.title),
    size: (a, b) => b.size - a.size,
    date: (a, b) => b.modified - a.modified,
    state: (a, b) => (b.enabled - a.enabled) || a.title.localeCompare(b.title),
    category: (a, b) => catOf(a).localeCompare(catOf(b)) || a.title.localeCompare(b.title),
  }[f.sort] || ((a, b) => a.title.localeCompare(b.title));
  list.sort((a, b) => cmp(a, b) * dir);
  return list;
}

// Flaga jako tło spanu – reguły dla <img> miniatur (pozycjonowanie, leniwe ładowanie) jej nie dotyczą.
const flag = (cc) => /^[a-z]{2}$/i.test(cc || '') ? `<span class="flag" style="background-image:url(vendor/flags/${cc.toLowerCase()}.svg)"></span>` : '';
const icaoTag = (a) => `<span class="tag icao ${a.source === 'bgl' ? 'acc' : ''}" title="${esc(countryName(a.country))}">${flag(a.country)}${esc(a.icao)}</span>`;
let regionNames = null;
function countryName(cc) {
  if (!cc) return t('countryUnknown');
  try { regionNames ||= new Intl.DisplayNames([lang()], { type: 'region' }); return regionNames.of(cc.toUpperCase()) || cc; } catch { return cc; }
}
// Kraj pakietu – najczęstszy wśród jego lotnisk.
function countryOf(p) {
  const n = {};
  for (const a of p.airports) if (a.country) { const c = a.country.toUpperCase(); n[c] = (n[c] || 0) + 1; }
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
function byCountry(list) {
  const m = new Map();
  for (const p of list) { const c = countryOf(p); if (!m.has(c)) m.set(c, []); m.get(c).push(p); }
  return [...m.entries()].map(([cc, items]) => ({ cc, name: countryName(cc), items }))
    .sort((a, b) => (!a.cc - !b.cc) || a.name.localeCompare(b.name, lang()));
}

function badgeIcao(p) {
  if (!p.airports.length) return '';
  const first = p.airports.slice(0, 2).map(icaoTag).join('');
  return first + (p.airports.length > 2 ? `<span class="tag">+${p.airports.length - 2}</span>` : '');
}
function sourceLabel(p) {
  if (p.source === 'library') return p.libraryName + (p.group ? ` / ${p.group}` : '');
  return t('src_' + p.source);
}
function cardHtml(p) {
  const cat = catOf(p);
  const th = p.thumbs[0];
  const lv = cat === 'aircraft' ? liveryCount(p) : 0;
  const sub = cat === 'livery' && relatedOf(p)[0] ? `↳ ${esc(relatedOf(p)[0].title)}` : esc(p.creator || p.folder);
  return `<div class="pkg ${p.enabled ? '' : 'off'} ${S.sel.has(p.id) ? 'sel' : ''}" data-id="${p.id}" style="--cat:${catColor(cat)}">
    <div class="thumb">
      <div class="ph">${icon(cat)}</div>
      ${th ? `<img data-src="${esc(th)}" alt="" loading="lazy">` : ''}
      <div class="over"></div>
      <div class="check">${icon('check')}</div>
      <div class="tl">${badgeIcao(p)}${lv ? `<span class="tag" title="${esc(t('liveriesFor'))}">${icon('livery')}${lv}</span>` : ''}${p.meta.locked ? `<span class="tag" title="${esc(t('locked'))}">${icon('lock')}</span>` : ''}</div>
      <div class="tr"><button class="switch ${p.enabled ? 'on' : ''} ${S.busy.has(p.id) ? 'busy' : ''}" data-sw="${p.id}" title="${esc(p.enabled ? t('disable') : t('enable'))}"></button></div>
      <div class="cap">
        <div class="t" title="${esc(p.title)}">${p.meta.favorite ? `<span class="star">★</span>` : ''}${esc(p.title)}</div>
        <div class="d">${sub}</div>
      </div>
    </div>
    <div class="body">
      <span class="catpill">${icon(cat)}${esc(t('cat_' + cat))}</span>
      <span class="src" title="${esc(sourceLabel(p))}">${icon(p.link ? 'link' : p.source === 'community' ? 'folder' : p.source === 'parking' ? 'eyeoff' : 'library')}<span>${esc(sourceLabel(p))}</span></span>
      <span class="meta">${p.version ? `v${esc(p.version)} · ` : ''}${fmtSize(p.size)}</span>
    </div></div>`;
}
function rowHtml(p) {
  const cat = catOf(p);
  return `<tr class="${p.enabled ? '' : 'off'} ${S.sel.has(p.id) ? 'sel' : ''}" data-id="${p.id}">
    <td style="width:52px"><button class="switch ${p.enabled ? 'on' : ''}" data-sw="${p.id}"></button></td>
    <td style="width:76px"><div class="mini">${p.thumbs[0] ? `<img data-src="${esc(p.thumbs[0])}" alt="">` : ''}</div></td>
    <td><div class="lt">${p.meta.favorite ? '★ ' : ''}${esc(p.title)}</div><div class="ld mono">${esc(p.folder)}</div></td>
    <td><span class="tag" style="color:${catColor(cat)}">${icon(cat)}${esc(t('cat_' + cat))}</span></td>
    <td><div class="ld" style="color:var(--text-2)">${esc(p.creator)}</div></td>
    <td>${badgeIcao(p)}</td>
    <td><div class="ld">${p.link ? icon('link') : ''} ${esc(sourceLabel(p))}</div></td>
    <td class="num">${esc(p.version)}</td>
    <td class="num">${fmtSize(p.size)}</td></tr>`;
}

function viewAddons(v) {
  const sc = S.scan;
  const f = S.f;
  const list = filtered();
  const on = list.filter((p) => p.enabled).length;
  const grouped = S.settings.groupCountry && f.cat === 'airport';
  topbar(t('nav_addons'), esc(t('shownOf', list.length, sc.packages.length, on)),
    `<label class="search">${icon('search')}<input id="q" placeholder="${esc(t('searchPh'))}" value="${esc(f.q)}"><kbd>Ctrl F</kbd></label>
     <button class="btn" id="a-install">${icon('download')}${esc(t('install'))}</button>
     <button class="btn icon" id="a-refresh" title="${esc(t('refreshHint'))}">${icon('refresh')}</button>`);
  const countCat = (c) => sc.packages.filter((p) => c === 'all' || catOf(p) === c).length;
  const sources = [['all', t('allSources')], ['community', t('src_community')], ...sc.libraries.map((l) => [`lib:${l.id}`, l.name]), ['parking', t('src_parking')], ['external', t('src_external')]]
    .filter(([id]) => id === 'all' || id.startsWith('lib:') || sc.packages.some((p) => p.source === id));
  v.innerHTML = `
    <div class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px">
      <div class="chips cats">${['all', ...CATS.map((c) => c.id)].filter((c) => c === 'all' || countCat(c)).map((c) => `<button class="chip ${f.cat === c ? 'on' : ''}" data-fcat="${c}">${icon(c === 'all' ? 'all' : c)}${esc(c === 'all' ? t('all') : t('cat_' + c))}<span class="n">${countCat(c)}</span></button>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="seg">${[['all', t('all')], ['on', t('enabled')], ['off', t('disabled')]].map(([k, l]) => `<button data-fstate="${k}" class="${f.state === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <select class="inp" id="fsource" style="height:30px;border-radius:999px">${sources.map(([id, l]) => `<option value="${esc(id)}" ${f.source === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <button class="chip ${f.fav ? 'on' : ''}" id="ffav">${icon('star')}${esc(t('favorites'))}</button>
        ${f.cat === 'airport' ? `<button class="chip ${grouped ? 'on' : ''}" id="fgroup">${icon('globe')}${esc(t('groupByCountry'))}</button>` : ''}
        <span class="grow" style="flex:1"></span>
        <select class="inp" id="fsort" style="height:30px;border-radius:999px">${['title', 'creator', 'size', 'date', 'state', 'category'].map((k) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${esc(t('sort_' + k))}</option>`).join('')}</select>
        <button class="btn sm icon" id="fdir" title="${esc(t('reverse'))}">${icon('sort')}</button>
        <div class="seg"><button data-vw="grid" class="${S.settings.view !== 'list' ? 'on' : ''}" title="${esc(t('gridView'))}">${icon('grid')}</button><button data-vw="list" class="${S.settings.view === 'list' ? 'on' : ''}" title="${esc(t('listView'))}">${icon('list')}</button></div>
        <button class="btn sm ${S.selecting ? 'primary' : ''}" id="fselect">${icon('select')}${esc(t('select'))}</button>
      </div>
    </div>
    <div id="pkglist" class="${S.selecting ? 'selecting' : ''}"></div>`;
  const box = $('#pkglist');
  if (!list.length) {
    box.innerHTML = `<div class="empty">${icon('addons')}<h3>${esc(sc.packages.length ? t('noMatches') : t('noAddons'))}</h3><div>${esc(sc.packages.length ? t('noMatchesHint') : t('noAddonsHint'))}</div></div>`;
  } else if (grouped) {
    const groups = byCountry(list);
    list.splice(0, list.length, ...groups.flatMap((g) => g.items));
    const head = (g) => {
      const n = g.items.filter((p) => p.enabled).length;
      const all = n === g.items.length;
      return `<div class="grp-h ${S.collapsed.has(g.cc) ? 'shut' : ''}" data-grp="${esc(g.cc)}">${icon('chevron')}${flag(g.cc) || icon('globe')}<b>${esc(g.name)}</b><span class="n">${n}/${g.items.length}</span><span class="grow"></span><button class="switch ${all ? 'on' : ''}" data-grpsw="${esc(g.cc)}" title="${esc(all ? t('disableAll') : t('enableAll'))}"></button></div>`;
    };
    const body = (g) => S.settings.view === 'list'
      ? `<table class="table"><tbody>${g.items.map(rowHtml).join('')}</tbody></table>`
      : `<div class="grid">${g.items.map(cardHtml).join('')}</div>`;
    box.innerHTML = groups.map((g) => `<section class="grp">${head(g)}${S.collapsed.has(g.cc) ? '' : body(g)}</section>`).join('');
    $$('[data-grp]', box).forEach((h) => (h.onclick = () => { const c = h.dataset.grp; if (S.collapsed.has(c)) S.collapsed.delete(c); else S.collapsed.add(c); renderView(); }));
    $$('[data-grpsw]', box).forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const g = groups.find((x) => x.cc === b.dataset.grpsw);
      const all = g.items.every((p) => p.enabled);
      toggle(g.items.map((p) => p.id), !all, `${g.name}: ${all ? t('lblBulkDisable') : t('lblBulkEnable')}`);
    }));
  } else if (S.settings.view === 'list') {
    box.innerHTML = `<table class="table"><thead><tr><th></th><th></th><th data-sort="title">${esc(t('colName'))}</th><th data-sort="category">${esc(t('colCat'))}</th><th data-sort="creator">${esc(t('colCreator'))}</th><th>ICAO</th><th>${esc(t('colSource'))}</th><th class="num">${esc(t('colVer'))}</th><th class="num" data-sort="size">${esc(t('colSize'))}</th></tr></thead><tbody>${list.map(rowHtml).join('')}</tbody></table>`;
    $$('th[data-sort]', box).forEach((th) => (th.onclick = () => { if (f.sort === th.dataset.sort) f.dir *= -1; else { f.sort = th.dataset.sort; f.dir = 1; } renderView(); }));
  } else {
    box.innerHTML = `<div class="grid">${list.map(cardHtml).join('')}</div>`;
  }
  observeThumbs(box);
  bindCards(box, list);
  const q = $('#q');
  q.oninput = debounce(() => { f.q = q.value; const pos = q.selectionStart; renderView(); const nq = $('#q'); nq.focus(); nq.setSelectionRange(pos, pos); }, 160);
  $('#a-refresh').onclick = (e) => refresh(e.shiftKey);
  $('#a-install').onclick = () => installDialog();
  $$('[data-fcat]', v).forEach((b) => (b.onclick = () => { f.cat = b.dataset.fcat; renderView(); }));
  $$('[data-fstate]', v).forEach((b) => (b.onclick = () => { f.state = b.dataset.fstate; renderView(); }));
  $('#fsource').onchange = (e) => { f.source = e.target.value; renderView(); };
  $('#fsort').onchange = (e) => { f.sort = e.target.value; f.dir = 1; S.settings.sort = f.sort; persist(); renderView(); };
  $('#fdir').onclick = () => { f.dir *= -1; renderView(); };
  $('#ffav').onclick = () => { f.fav = !f.fav; renderView(); };
  if ($('#fgroup')) $('#fgroup').onclick = () => { S.settings.groupCountry = !grouped; persist(); renderView(); };
  $$('[data-vw]', v).forEach((b) => (b.onclick = () => { S.settings.view = b.dataset.vw; persist(); renderView(); }));
  $('#fselect').onclick = () => { S.selecting = !S.selecting; if (!S.selecting) S.sel.clear(); renderView(); };
  renderBulk(list);
}

let lastClicked = null;
function bindCards(root, list) {
  $$('[data-sw]', root).forEach((sw) => (sw.onclick = (e) => {
    e.stopPropagation();
    const p = pkgById(sw.dataset.sw);
    if (p) toggle([p.id], !p.enabled);
  }));
  $$('[data-id]', root).forEach((el) => (el.onclick = (e) => {
    const id = el.dataset.id;
    if (S.selecting || e.ctrlKey || e.metaKey || e.shiftKey) {
      if (!S.selecting) { S.selecting = true; $('#pkglist')?.classList.add('selecting'); }
      if (e.shiftKey && lastClicked && list) {
        const ids = list.map((p) => p.id);
        const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) ids.slice(a, b + 1).forEach((x) => S.sel.add(x));
      } else if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      lastClicked = id;
      $$('[data-id]', root).forEach((x) => x.classList.toggle('sel', S.sel.has(x.dataset.id)));
      renderBulk(list);
      return;
    }
    openSheet(id);
  }));
}
function renderBulk(list) {
  const b = $('#bulk');
  const n = S.sel.size;
  if (!S.selecting || S.view !== 'addons') { b.classList.remove('show'); return; }
  b.innerHTML = `<span class="n">${esc(t('selectedN', n))}</span>
    <button class="btn sm ghost" id="b-all">${esc(t('selectAll'))}</button>
    <button class="btn sm" id="b-on" ${n ? '' : 'disabled'}>${icon('power')}${esc(t('enable'))}</button>
    <button class="btn sm" id="b-off" ${n ? '' : 'disabled'}>${icon('eyeoff')}${esc(t('disable'))}</button>
    <button class="btn sm" id="b-prof" ${n ? '' : 'disabled'}>${icon('profiles')}${esc(t('toProfile'))}</button>
    <button class="btn sm" id="b-move" ${n && S.settings.libraries.length ? '' : 'disabled'}>${icon('move')}${esc(t('moveToLibrary'))}</button>
    <button class="btn sm danger" id="b-trash" ${n ? '' : 'disabled'}>${icon('trash')}</button>
    <button class="btn sm icon ghost" id="b-x" title="${esc(t('cancel'))}">${icon('close')}</button>`;
  b.classList.add('show');
  const ids = () => [...S.sel];
  $('#b-all').onclick = () => { const all = list || filtered(); if (S.sel.size >= all.length) S.sel.clear(); else all.forEach((p) => S.sel.add(p.id)); renderView(); };
  $('#b-on').onclick = () => toggle(ids(), true, t('lblBulkEnable'));
  $('#b-off').onclick = () => toggle(ids(), false, t('lblBulkDisable'));
  $('#b-prof').onclick = () => addToProfileDialog(ids());
  $('#b-move').onclick = () => relocateDialog(ids());
  $('#b-trash').onclick = () => trashDialog(ids());
  $('#b-x').onclick = () => { S.selecting = false; S.sel.clear(); renderView(); };
}

// ───────────── Arkusz pakietu ─────────────
let galleryIdx = 0;
let variantsOpen = false;
const lc = (s) => String(s || '').toLowerCase();
// Malowania ↔ samoloty: po nazwach folderów SimObjects i `base_container`.
function relatedOf(p) {
  const cat = catOf(p);
  if (cat === 'aircraft') {
    const mine = new Set((p.simObjects || []).map(lc));
    if (!mine.size) return [];
    return S.scan.packages.filter((x) => x.id !== p.id && catOf(x) === 'livery' && [...(x.baseAircraft || []), ...(x.simObjects || [])].some((n) => mine.has(lc(n))));
  }
  if (cat === 'livery') {
    const want = new Set([...(p.baseAircraft || []), ...(p.simObjects || [])].map(lc));
    return S.scan.packages.filter((x) => x.id !== p.id && catOf(x) === 'aircraft' && (x.simObjects || []).some((n) => want.has(lc(n))));
  }
  return [];
}
function liveryCount(p) {
  if (!S.liveryIndex) {
    S.liveryIndex = new Map();
    for (const x of S.scan.packages) if (catOf(x) === 'aircraft') S.liveryIndex.set(x.id, relatedOf(x).length);
  }
  return S.liveryIndex.get(p.id) || 0;
}
function sourceNode(p) {
  if (p.source === 'library') return { icon: 'drive', title: p.libraryName + (p.group ? ` / ${p.group}` : ''), path: p.path, cls: 'acc' };
  if (p.source === 'external') return { icon: 'link', title: t('src_external'), path: p.path, cls: 'acc' };
  if (p.source === 'parking') return { icon: 'folder', title: t('src_parking'), path: p.path, cls: '' };
  return { icon: 'folder', title: 'Community', path: p.path, cls: 'ok' };
}
function routeHtml(p) {
  const src = sourceNode(p);
  const community = S.scan.target;
  const linked = !!p.link;
  if (p.source === 'community') {
    return `<div class="route"><div class="node"><span class="ib ok">${icon('folder')}</span><div><b>Community</b><small>${esc(p.path)}</small></div></div>
      <div class="wire live"><i></i>${esc(t('routeNative'))}<i></i></div>
      <div class="node"><span class="ib ok">${icon('aircraft')}</span><div><b>MSFS</b><small>${esc(t('routeLoaded'))}</small></div></div></div>`;
  }
  return `<div class="route"><div class="node"><span class="ib ${src.cls}">${icon(src.icon)}</span><div><b>${esc(src.title)}</b><small>${esc(src.path)}</small></div></div>
    <div class="wire ${linked ? 'live' : ''}"><i></i>${esc(linked ? t('routeLinked') : t('routeNoLink'))}<i></i></div>
    <div class="node"><span class="ib ${linked ? 'ok' : ''}">${icon(linked ? 'link' : 'unlink')}</span><div><b>Community</b><small>${esc(linked ? p.link : community)}</small></div></div></div>`;
}
function relRow(x) {
  return `<div class="rel" data-open="${x.id}"><div class="th">${x.thumbs[0] ? `<img data-src="${esc(x.thumbs[0])}" alt="">` : ''}</div>
    <div class="grow"><b>${esc(x.title)}</b><small>${esc(x.creator || x.folder)} · ${fmtSize(x.size)}</small></div>
    <button class="switch ${x.enabled ? 'on' : ''}" data-sw="${x.id}"></button></div>`;
}
async function openSheet(id, keep = false) {
  const p = pkgById(id);
  if (!p) return;
  if (S.sheetId !== id) { galleryIdx = 0; variantsOpen = false; }
  S.sheetId = id;
  const cat = catOf(p);
  const sh = $('#sheet');
  const m = p.meta;
  const thumbs = p.thumbs;
  galleryIdx = Math.min(galleryIdx, Math.max(thumbs.length - 1, 0));
  const prof = S.profiles.filter((x) => x.packages.includes(p.key));
  const related = relatedOf(p);
  const scroll = keep ? $('.sheet-scroll', sh)?.scrollTop || 0 : 0;
  const variants = p.aircraft;
  const shownVariants = variantsOpen ? variants : variants.slice(0, 10);
  const powerSub = p.enabled ? (p.link ? t('powerOnLink') : t('powerOnNative')) : t('powerOff');
  sh.innerHTML = `<div class="sheet-scroll">
    <div class="hero">
      ${thumbs.length ? `<img id="g-img" alt="">` : `<div class="ph">${icon(cat)}</div>`}
      <div class="shade"></div>
      <div class="top">
        <span class="glass"><span class="dot ${p.enabled ? 'on' : ''}"></span>${esc(p.enabled ? t('enabled') : t('disabled'))}</span>
        ${m.locked ? `<span class="glass">${icon('lock')}${esc(t('locked'))}</span>` : ''}
        ${m.favorite ? `<span class="glass" style="color:var(--warn)">★</span>` : ''}
        <span class="grow"></span>
        <button class="glass icon" id="sh-close" title="Esc">${icon('close')}</button>
      </div>
      ${thumbs.length > 1 ? `<button class="nav prev" id="g-prev">${icon('chevron')}</button><button class="nav next" id="g-next">${icon('chevron')}</button>` : ''}
      <div class="title">
        <div class="eyebrow"><i style="background:${catColor(cat)}"></i>${esc(t('cat_' + cat))}${p.version ? ` · v${esc(p.version)}` : ''}</div>
        <h2>${esc(p.title)}</h2>
        <div class="by">${esc([p.creator, p.manufacturer && p.manufacturer !== p.creator ? p.manufacturer : ''].filter(Boolean).join(' · ') || p.folder)}</div>
      </div>
    </div>
    ${thumbs.length > 1 ? `<div class="strip">${thumbs.slice(0, 24).map((th, i) => `<button data-g="${i}" class="${i === galleryIdx ? 'on' : ''}"><img data-src="${esc(th)}" alt=""></button>`).join('')}</div>` : ''}
    <div class="cmd">
      <button class="power ${p.enabled ? 'on' : ''}" data-sw="${p.id}">
        <span class="lbl"><b>${esc(p.enabled ? t('powerOnTitle') : t('powerOffTitle'))}</b><small>${esc(powerSub)}</small></span>
        <span class="switch lg ${p.enabled ? 'on' : ''} ${S.busy.has(p.id) ? 'busy' : ''}"></span>
      </button>
      <button class="tool ${m.favorite ? 'on' : ''}" id="s-fav" title="${esc(m.favorite ? t('favorite') : t('addFavorite'))}">${icon('star')}</button>
      <button class="tool ${m.locked ? 'on acc' : ''}" id="s-lock" title="${esc(t('lockHint'))}">${icon(m.locked ? 'lock' : 'unlock')}</button>
      <button class="tool" id="s-open" title="${esc(t('openFolder'))}">${icon('folder')}</button>
      <button class="tool" id="s-prof" title="${esc(t('toProfile'))}">${icon('profiles')}</button>
    </div>
    <div class="gauges">
      <div class="gauge"><span>${esc(t('colSize'))}</span><b>${fmtSize(p.size)}</b></div>
      <div class="gauge"><span>${esc(t('files'))}</span><b>${nf().format(p.files)}</b></div>
      <div class="gauge"><span>${esc(t('colVer'))}</span><b title="${esc(p.version)}">${esc(p.version || '—')}</b></div>
      <div class="gauge"><span>${esc(t('installed'))}</span><b>${fmtDate(p.modified)}</b></div>
    </div>
    ${routeHtml(p)}
    <div class="sheet-body">
      ${prof.length ? `<div class="chips" style="margin-top:14px">${prof.map((x) => `<span class="tag" style="color:${x.color}">${icon('profiles')}${esc(x.name)}</span>`).join('')}</div>` : ''}
      ${!p.hasLayout ? `<div class="banner warn" style="margin:14px 0 0">${icon('warn')}<div class="grow">${esc(t('noLayoutBanner'))}</div><button class="btn sm" id="s-layout">${esc(t('regenerate'))}</button></div>` : ''}
      ${related.length ? `<div class="panel"><h4>${icon(cat === 'aircraft' ? 'livery' : 'aircraft')}${esc(cat === 'aircraft' ? t('liveriesFor') : t('baseAircraft'))} <span class="n">${related.length}</span><span class="grow"></span>
        ${cat === 'aircraft' ? `<button class="btn sm ghost" id="s-liv-on">${esc(t('enableAllN', related.filter((x) => !x.enabled).length))}</button>` : ''}</h4>
        <div style="padding-bottom:6px">${related.slice(0, 40).map(relRow).join('')}</div></div>` : ''}
      ${variants.length ? `<div class="panel"><h4>${icon('aircraft')}${esc(t('variants'))} <span class="n">${variants.length}</span></h4>
        <div class="vchips">${shownVariants.map((a) => `<span>${esc(a)}</span>`).join('')}${variants.length > shownVariants.length ? `<button id="s-more">${esc(t('showAll', variants.length))}</button>` : ''}</div></div>` : ''}
      ${p.airports.length ? `<div class="panel"><h4>${icon('airport')}${esc(t('airports'))} <span class="n">${p.airports.length}</span></h4><div class="mini-map" id="mini-map"></div>
        <div class="apt-list">${p.airports.slice(0, 120).map((a, i) => `<div class="apt" data-apt="${i}">${icaoTag(a)}<span class="grow">${esc(a.name || '—')}${a.city ? ` <span class="faint">· ${esc(a.city)}</span>` : ''}</span><span class="faint mono">${esc(a.country)}</span></div>`).join('')}</div>
        ${p.airports.some((a) => a.source === 'name') ? `<div class="faint" style="font-size:12px;padding:0 14px 12px">${esc(t('guessedAirports'))}</div>` : ''}</div>` : ''}
      ${p.dependencies.length ? `<div class="panel"><h4>${icon('merge')}${esc(t('dependencies'))} <span class="n">${p.dependencies.length}</span></h4><div class="apt-list">${p.dependencies.map((d) => { const dep = S.scan.packages.find((x) => x.key === d.name.toLowerCase()); return `<div class="apt" ${dep ? `data-open="${dep.id}"` : ''}><span class="grow mono">${esc(d.name)}</span>${dep ? `<span class="tag ${dep.enabled ? 'ok' : 'warn'}">${esc(dep.enabled ? t('enabled') : t('disabled'))}</span>` : `<span class="tag">${esc(t('notInstalled'))}</span>`}</div>`; }).join('')}</div></div>` : ''}
      <div id="dependents"></div>
      <div id="notes-box"></div>
      <div class="panel"><h4>${icon('tag')}${esc(t('organize'))}</h4><div class="pad" style="display:flex;flex-direction:column;gap:8px">
        <select class="inp" id="s-cat"><option value="">${esc(t('autoCategory'))}: ${esc(t('cat_' + p.category))}</option>${CATS.map((c) => `<option value="${c.id}" ${m.category === c.id ? 'selected' : ''}>${esc(t('cat_' + c.id))}</option>`).join('')}</select>
        <div class="tags-in" id="s-tags">${m.tags.map((tg, i) => `<span>${esc(tg)}<button data-rmtag="${i}">×</button></span>`).join('')}<input placeholder="${esc(t('tagsPh'))}"></div>
        <textarea class="inp" id="s-note" rows="2" placeholder="${esc(t('notePh'))}">${esc(m.note)}</textarea></div></div>
      <details class="panel"><summary>${icon('file')}${esc(t('technical'))}${icon('chevron', 'chev')}</summary>
        <dl class="kv">
          <dt>${esc(t('folder'))}</dt><dd class="mono">${esc(p.folder)}</dd>
          <dt>${esc(t('contentType'))}</dt><dd class="mono">${esc(p.contentType || '—')}</dd>
          ${p.minGameVersion ? `<dt>${esc(t('minSim'))}</dt><dd class="mono">${esc(p.minGameVersion)}</dd>` : ''}
          <dt>layout.json</dt><dd>${p.hasLayout ? 'OK' : esc(t('missing'))}</dd>
          ${(p.simObjects || []).length ? `<dt>SimObjects</dt><dd class="mono">${esc(p.simObjects.slice(0, 8).join(', '))}</dd>` : ''}
        </dl>
        <pre class="manifest" id="manifest">…</pre></details>
      <div class="sheet-foot">
        ${p.source !== 'library' && S.settings.libraries.length ? `<button class="btn sm" id="s-move">${icon('move')}${esc(t('moveToLibrary'))}</button>` : '<span></span>'}
        <button class="linkbtn" id="s-trash">${icon('trash')}${esc(t('toTrash'))}</button>
      </div>
    </div></div>`;
  sh.classList.add('show');
  $('#scrim').classList.add('show');
  $('.sheet-scroll', sh).scrollTop = scroll;
  observeThumbs(sh);
  const showImg = async () => {
    const img = $('#g-img');
    if (!img || !thumbs.length) return;
    const path = thumbs[galleryIdx];
    img.src = fileSrc(path);
    $$('.strip button', sh).forEach((b, i) => b.classList.toggle('on', i === galleryIdx));
    $(`.strip button[data-g="${galleryIdx}"]`, sh)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  showImg();
  const step = (d) => { galleryIdx = (galleryIdx + d + thumbs.length) % thumbs.length; showImg(); };
  if ($('#g-prev')) { $('#g-prev').onclick = () => step(-1); $('#g-next').onclick = () => step(1); }
  $$('.strip [data-g]', sh).forEach((b) => (b.onclick = () => { galleryIdx = +b.dataset.g; showImg(); }));
  sh.onkeydown = null;
  $('#sh-close').onclick = closeSheet;
  $$('[data-sw]', sh).forEach((sw) => (sw.onclick = (e) => { e.stopPropagation(); const x = pkgById(sw.dataset.sw); if (x) toggle([x.id], !x.enabled); }));
  $$('[data-open]', sh).forEach((el) => (el.onclick = () => openSheet(el.dataset.open)));
  $('#s-fav').onclick = () => setMeta(p, { favorite: !m.favorite });
  $('#s-lock').onclick = () => setMeta(p, { locked: !m.locked });
  $('#s-open').onclick = () => opener.openPath(p.path).catch((e) => toast(errMsg(e), 'bad'));
  $('#s-prof').onclick = () => addToProfileDialog([p.id]);
  $('#s-move') && ($('#s-move').onclick = () => relocateDialog([p.id]));
  $('#s-trash').onclick = () => trashDialog([p.id]);
  $('#s-more') && ($('#s-more').onclick = () => { variantsOpen = true; openSheet(p.id, true); });
  $('#s-liv-on') && ($('#s-liv-on').onclick = () => toggle(related.filter((x) => !x.enabled).map((x) => x.id), true, t('lblBulkEnable')));
  $('#s-layout') && ($('#s-layout').onclick = async () => {
    try { const n = await invoke('generate_layout', { id: p.id }); toast(t('layoutDone', n)); await refresh(); } catch (e) { toast(errMsg(e), 'bad'); }
  });
  $('#s-cat').onchange = (e) => setMeta(p, { category: e.target.value });
  const tagIn = $('#s-tags input');
  tagIn.onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagIn.value.trim()) { e.preventDefault(); setMeta(p, { tags: [...new Set([...m.tags, tagIn.value.trim().replace(/,$/, '')])] }); }
    if (e.key === 'Backspace' && !tagIn.value && m.tags.length) setMeta(p, { tags: m.tags.slice(0, -1) });
  };
  $$('[data-rmtag]', sh).forEach((b) => (b.onclick = () => setMeta(p, { tags: m.tags.filter((_, i) => i !== +b.dataset.rmtag) })));
  $('#s-note').onchange = (e) => setMeta(p, { note: e.target.value });
  if (p.airports.length && window.L) {
    setTimeout(() => {
      const mm = $('#mini-map');
      if (!mm) return;
      const map = L.map(mm, { zoomControl: false, attributionControl: false });
      tileLayer(S.settings.mapStyle).addTo(map);
      const pts = p.airports.map((a) => [a.lat, a.lon]);
      p.airports.slice(0, 300).forEach((a) => L.circleMarker([a.lat, a.lon], markerStyle(p.enabled, false)).addTo(map).bindTooltip(a.icao));
      if (pts.length === 1) map.setView(pts[0], 12); else map.fitBounds(pts, { padding: [20, 20], maxZoom: 11 });
      $$('[data-apt]', sh).forEach((el) => (el.onclick = () => { const a = p.airports[+el.dataset.apt]; map.setView([a.lat, a.lon], 13); }));
    }, 60);
  }
  try {
    const d = await invoke('package_details', { id: p.id });
    if (S.sheetId !== id) return;
    $('#manifest').textContent = d.manifest || '—';
    if (d.releaseNotes) $('#notes-box').innerHTML = `<div class="panel"><h4>${icon('note')}${esc(t('releaseNotes'))}</h4><div class="pad muted selectable" style="white-space:pre-wrap;font-size:13px">${esc(d.releaseNotes)}</div></div>`;
    const deps = d.dependents.map((x) => pkgById(x)).filter(Boolean);
    if (deps.length) {
      $('#dependents').innerHTML = `<div class="panel"><h4>${icon('link')}${esc(t('requiredBy'))} <span class="n">${deps.length}</span></h4><div style="padding-bottom:6px">${deps.map(relRow).join('')}</div></div>`;
      observeThumbs($('#dependents'));
      $$('#dependents [data-open]').forEach((el) => (el.onclick = () => openSheet(el.dataset.open)));
      $$('#dependents [data-sw]').forEach((sw) => (sw.onclick = (e) => { e.stopPropagation(); const x = pkgById(sw.dataset.sw); if (x) toggle([x.id], !x.enabled); }));
    }
  } catch { /* szczegóły są dodatkiem */ }
}
function closeSheet() {
  S.sheetId = null;
  $('#sheet').classList.remove('show');
  $('#scrim').classList.remove('show');
}

// ───────────── Operacje na wielu pakietach ─────────────
async function relocateDialog(ids) {
  const libs = S.settings.libraries;
  if (!libs.length) { toast(t('addLibraryFirst'), 'warn'); go('settings'); return; }
  const pk = ids.map(pkgById).filter(Boolean).filter((p) => p.source !== 'library');
  if (!pk.length) { toast(t('alreadyInLibrary'), 'warn'); return; }
  const size = pk.reduce((a, p) => a + p.size, 0);
  const r = await dialog({
    title: t('moveToLibrary'),
    body: `<div>${esc(t('moveQ', pk.length, fmtSize(size)))}</div>
      <label class="field">${esc(t('library'))}<select class="inp" id="mv-lib">${libs.map((l) => `<option value="${l.id}">${esc(l.name)} — ${esc(l.path)}</option>`).join('')}</select></label>
      <div class="faint">${esc(t('moveHint'))}</div>`,
    actions: [{ label: t('cancel'), value: null }, { label: t('move'), kind: 'primary', value: (w) => $('#mv-lib', w).value }],
  });
  if (!r) return;
  try { await invoke('relocate', { ids: pk.map((p) => p.id), libraryId: r }); S.sel.clear(); S.selecting = false; renderView(); } catch (e) { toast(errMsg(e), 'bad'); }
}
async function trashDialog(ids) {
  const pk = ids.map(pkgById).filter(Boolean);
  const ok = await confirmBox(t('toTrash'), `<div>${esc(t('trashQ', pk.length, fmtSize(pk.reduce((a, p) => a + p.size, 0))))}</div><div class="card list">${pk.slice(0, 6).map((p) => `<div class="row"><div class="grow"><div class="t">${esc(p.title)}</div><div class="d mono">${esc(p.path)}</div></div></div>`).join('')}</div>`, t('toTrash'), 'primary');
  if (!ok) return;
  try {
    const res = await invoke('trash_packages', { ids: pk.map((p) => p.id) });
    closeSheet(); S.sel.clear(); S.selecting = false;
    await refresh();
    opErrors(res, t('trashed', res.changed));
  } catch (e) { toast(errMsg(e), 'bad'); }
}

// ───────────── Instalacja ─────────────
async function installDialog(paths) {
  const libs = S.settings.libraries;
  if (!libs.length) {
    const ok = await confirmBox(t('install'), `<div>${esc(t('needLibrary'))}</div>`, t('addLibrary'));
    if (ok) { const lib = await pickLibrary(); if (!lib) return; } else return;
  }
  if (!paths) {
    const picked = await dlg.open({ multiple: true, title: t('pickArchives'), filters: [{ name: 'Archiwa', extensions: ['zip', 'rar', '7z'] }] });
    if (!picked) return;
    paths = Array.isArray(picked) ? picked : [picked];
  }
  const r = await dialog({
    title: t('install'),
    body: `<div class="card list">${paths.slice(0, 8).map((p) => `<div class="row">${icon(/\.(zip|rar|7z)$/i.test(p) ? 'zip' : 'folder')}<div class="grow"><div class="t">${esc(p.split(/[\\/]/).pop())}</div><div class="d mono">${esc(p)}</div></div></div>`).join('')}${paths.length > 8 ? `<div class="row"><div class="grow d">+${paths.length - 8}</div></div>` : ''}</div>
      <label class="field">${esc(t('library'))}<select class="inp" id="in-lib">${S.settings.libraries.map((l) => `<option value="${l.id}">${esc(l.name)} — ${esc(l.path)}</option>`).join('')}</select></label>
      <label class="check-row"><input type="checkbox" id="in-en" checked>${esc(t('enableAfter'))}</label>
      <label class="check-row"><input type="checkbox" id="in-rep">${esc(t('replaceExisting'))}</label>`,
    actions: [{ label: t('cancel'), value: null }, { label: t('install'), kind: 'primary', value: (w) => ({ lib: $('#in-lib', w).value, en: $('#in-en', w).checked, rep: $('#in-rep', w).checked }) }],
  });
  if (!r) return;
  try { await invoke('install_addons', { paths, libraryId: r.lib, enable: r.en, replace: r.rep }); } catch (e) { toast(errMsg(e), 'bad'); }
}

// ───────────── Mapa ─────────────
function tileLayer(style) {
  const attr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  if (style === 'satellite') return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
  if (style === 'osm') return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: attr });
  const dark = style === 'dark' || (style !== 'light' && document.documentElement.dataset.theme !== 'light');
  return L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap' });
}
const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
function markerStyle(on, selected) {
  return {
    radius: selected ? 8 : 6,
    color: selected ? cssVar('--acc', '#5cc4ff') : '#ffffff',
    weight: selected ? 3 : 1.5,
    fillColor: on ? cssVar('--ok', '#4fd18b') : '#7a8799',
    fillOpacity: on ? 0.95 : 0.8,
  };
}
const pin = (cls) => L.divIcon({ className: '', html: `<div class="apt-pin ${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
let mapTab = 'list';
function setMapTab(tab) { mapTab = tab; renderMapSide(); }
S.mapSel = new Set();
S.mapSelectMode = false;

function airportPoints() {
  const pts = [];
  for (const p of S.scan.packages) {
    if (!p.airports.length) continue;
    const list = p.airports.length > 40 ? p.airports.filter((a) => a.source === 'bgl').slice(0, 400) : p.airports;
    for (const a of list) pts.push({ ...a, pkg: p });
  }
  return pts;
}
function mapTopbar() {
  const pts = airportPoints();
  const pkgs = new Set(pts.map((x) => x.pkg.id));
  topbar(t('nav_map'), esc(t('mapSub', pts.length, pkgs.size)));
}
function viewMap(v) {
  // Mapa już stoi – po przełączeniu dodatku odświeżamy tylko znaczniki i panel.
  if (S.map && $('#map') && document.body.contains(S.map.getContainer())) {
    mapTopbar();
    refreshMarkers();
    renderMapSide();
    return;
  }
  mapTopbar();
  v.innerHTML = `<div class="map-wrap"><div id="map-holder"><div id="map"></div>
      <div class="map-tools"><button class="btn sm ${S.mapSelectMode ? 'primary' : ''}" id="m-select" title="${esc(t('boxSelectHint'))}">${icon('select')}${esc(t('boxSelect'))}</button></div>
      <div class="map-hint ${S.mapSelectMode ? '' : 'hidden'}" id="m-hint">${esc(t('boxSelectTip'))}</div>
      <div class="map-legend"><span><i style="background:${cssVar('--ok', '#4fd18b')}"></i>${esc(t('enabled'))}</span><span><i style="background:#7a8799"></i>${esc(t('disabled'))}</span><span><i style="background:transparent;border-color:${cssVar('--acc', '#5cc4ff')}"></i>${esc(t('selected'))}</span></div>
    </div><div class="map-side" id="map-side"></div></div>`;
  if (!window.L) { $('#map').innerHTML = `<div class="empty">${icon('map')}<div>Leaflet?</div></div>`; return; }
  const map = L.map('map', { worldCopyJump: true, preferCanvas: true, zoomControl: true, minZoom: 2, boxZoom: false });
  S.map = map;
  S.mapTiles = tileLayer(S.settings.mapStyle).addTo(map);
  S.mapLayers = { route: L.layerGroup().addTo(map), points: L.layerGroup().addTo(map) };
  S.mapMarkers = [];
  for (const a of airportPoints()) {
    const m = L.circleMarker([a.lat, a.lon], markerStyle(a.pkg.enabled, S.mapSel.has(a.pkg.id)));
    m.bindTooltip(`<b>${esc(a.icao)}</b> · ${esc(a.pkg.title)}`, { direction: 'top', offset: [0, -6] });
    m.on('click', (e) => {
      if (S.mapSelectMode || e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
        L.DomEvent.stop(e);
        if (S.mapSel.has(a.pkg.id)) S.mapSel.delete(a.pkg.id); else S.mapSel.add(a.pkg.id);
        mapTab = 'sel';
        refreshMarkers();
        renderMapSide();
        return;
      }
      L.popup({ maxWidth: 300 }).setLatLng([a.lat, a.lon]).setContent(popupHtml(a)).openOn(map);
      setTimeout(() => bindPopup(map, a.pkg), 0);
    });
    m.addTo(S.mapLayers.points);
    S.mapMarkers.push({ m, a });
  }
  const pts = S.mapMarkers.map(({ a }) => [a.lat, a.lon]);
  if (S.mapView) map.setView(S.mapView.center, S.mapView.zoom, { animate: false });
  else if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 8 });
  else map.setView([50, 15], 4);
  map.on('moveend', () => {
    S.mapView = { center: map.getCenter(), zoom: map.getZoom() };
    if (mapTab === 'list') debounceInView();
  });
  setupBoxSelect(map);
  $('#m-select').onclick = () => setSelectMode(!S.mapSelectMode);
  renderMapSide();
  setTimeout(() => map.invalidateSize(), 50);
  drawRoute(false);
}
const debounceInView = debounce(() => { if (mapTab === 'list') renderMapSide(); }, 150);
function setSelectMode(on) {
  S.mapSelectMode = on;
  $('#m-select')?.classList.toggle('primary', on);
  $('#m-hint')?.classList.toggle('hidden', !on);
  $('#map')?.classList.toggle('selecting', on);
}
function refreshMarkers() {
  for (const { m, a } of S.mapMarkers || []) {
    const p = pkgById(a.pkg.id) || a.pkg;
    a.pkg = p;
    m.setStyle(markerStyle(p.enabled, S.mapSel.has(p.id)));
    m.setRadius(S.mapSel.has(p.id) ? 8 : 6);
  }
}
// Zaznaczanie przeciągnięciem: w trybie zaznaczania albo z wciśniętym Shift.
// Shift/Ctrl dodaje do zaznaczenia, Alt odejmuje.
function setupBoxSelect(map) {
  const el = map.getContainer();
  let start = null; let rect = null; let mode = 'replace';
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !(S.mapSelectMode || e.shiftKey)) return;
    if (e.target.closest('.leaflet-control, .leaflet-popup, .map-tools')) return;
    e.preventDefault();
    e.stopPropagation();
    map.dragging.disable();
    start = map.mouseEventToLatLng(e);
    mode = e.altKey ? 'remove' : (e.shiftKey || e.ctrlKey) ? 'add' : 'replace';
    rect = L.rectangle([start, start], { color: cssVar('--acc', '#5cc4ff'), weight: 2, fillOpacity: 0.12, dashArray: '5 5', interactive: false }).addTo(map);
  }, true);
  const move = (e) => { if (start && rect) rect.setBounds(L.latLngBounds(start, map.mouseEventToLatLng(e))); };
  const up = (e) => {
    if (!start) return;
    const bounds = L.latLngBounds(start, map.mouseEventToLatLng(e));
    rect?.remove();
    rect = null;
    start = null;
    map.dragging.enable();
    const sw = map.latLngToContainerPoint(bounds.getSouthWest());
    const ne = map.latLngToContainerPoint(bounds.getNorthEast());
    if (Math.abs(sw.x - ne.x) < 6 && Math.abs(sw.y - ne.y) < 6) return;
    const hit = new Set(S.mapMarkers.filter(({ a }) => bounds.contains([a.lat, a.lon])).map(({ a }) => a.pkg.id));
    if (mode === 'replace') S.mapSel = hit;
    else if (mode === 'add') hit.forEach((id) => S.mapSel.add(id));
    else hit.forEach((id) => S.mapSel.delete(id));
    mapTab = 'sel';
    refreshMarkers();
    renderMapSide();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  map.on('unload', () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); });
}
function popupHtml(a) {
  const p = a.pkg;
  return `<div class="pop">${p.thumbs[0] ? `<img src="${esc(thumbCache.get(p.thumbs[0]) || fileSrc(p.thumbs[0]))}" alt="">` : ''}
    <div class="pb"><div class="pt">${esc(p.title)}</div><div class="pd"><span class="mono">${esc(a.icao)}</span> · ${esc(a.name || '')}${a.city ? `, ${esc(a.city)}` : ''}</div>
    <div class="pr"><button class="btn sm" data-pop-open>${esc(t('details'))}</button><button class="btn sm ghost" data-pop-sel>${esc(S.mapSel.has(p.id) ? t('unselect') : t('selectOne'))}</button><span class="grow"></span><button class="switch ${p.enabled ? 'on' : ''}" data-pop-sw></button></div></div></div>`;
}
function bindPopup(map, p) {
  const el = $('.leaflet-popup');
  if (!el) return;
  $('[data-pop-open]', el).onclick = () => openSheet(p.id);
  $('[data-pop-sel]', el).onclick = () => { if (S.mapSel.has(p.id)) S.mapSel.delete(p.id); else S.mapSel.add(p.id); map.closePopup(); mapTab = 'sel'; refreshMarkers(); renderMapSide(); };
  $('[data-pop-sw]', el).onclick = async (e) => { e.target.classList.add('busy'); await toggle([p.id], !p.enabled); map.closePopup(); };
}
function renderMapSide() {
  const side = $('#map-side');
  if (!side) return;
  side.innerHTML = `<div class="head"><div class="seg" style="align-self:flex-start">
      <button data-mt="list" class="${mapTab === 'list' ? 'on' : ''}">${icon('list')}${esc(t('inView'))}</button>
      <button data-mt="sel" class="${mapTab === 'sel' ? 'on' : ''}">${icon('select')}${esc(t('selectedTab', S.mapSel.size))}</button>
      <button data-mt="plan" class="${mapTab === 'plan' ? 'on' : ''}">${icon('target')}${esc(t('planTab'))}</button></div></div>
    <div class="scroll" id="map-scroll"></div>`;
  $$('[data-mt]', side).forEach((b) => (b.onclick = () => setMapTab(b.dataset.mt)));
  if (mapTab === 'plan') renderPlan(); else if (mapTab === 'sel') renderSelection(); else renderInView();
}
function sideList(items, removable) {
  return items.slice(0, 400).map(({ p, icaos }) => `<div class="row click" data-id="${p.id}">
      <div class="grow"><div class="t">${esc(p.title)}</div><div class="d mono">${esc(icaos.slice(0, 5).join(' · '))}${icaos.length > 5 ? ' …' : ''}</div></div>
      ${removable ? `<button class="btn sm icon ghost" data-unsel="${p.id}" title="${esc(t('unselect'))}">${icon('close')}</button>` : ''}
      <button class="switch ${p.enabled ? 'on' : ''}" data-sw="${p.id}"></button></div>`).join('');
}
function bindSideList(box) {
  $$('[data-sw]', box).forEach((sw) => (sw.onclick = (e) => { e.stopPropagation(); const p = pkgById(sw.dataset.sw); if (p) toggle([p.id], !p.enabled); }));
  $$('[data-unsel]', box).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.mapSel.delete(b.dataset.unsel); refreshMarkers(); renderMapSide(); }));
  $$('[data-id]', box).forEach((r) => (r.onclick = () => {
    const p = pkgById(r.dataset.id);
    const a = p?.airports[0];
    if (a && S.map) S.map.setView([a.lat, a.lon], Math.max(S.map.getZoom(), 10));
  }));
  $$('[data-id]', box).forEach((r) => (r.ondblclick = () => openSheet(r.dataset.id)));
}
function groupByPkg(filter) {
  const seen = new Map();
  for (const { a } of S.mapMarkers || []) {
    const p = pkgById(a.pkg.id) || a.pkg;
    if (!filter(p, a)) continue;
    if (!seen.has(p.id)) seen.set(p.id, { p, icaos: [] });
    seen.get(p.id).icaos.push(a.icao);
  }
  return [...seen.values()].sort((x, y) => (y.p.enabled - x.p.enabled) || x.p.title.localeCompare(y.p.title));
}
function renderInView() {
  const box = $('#map-scroll');
  if (!box || !S.map) return;
  const b = S.map.getBounds();
  const items = groupByPkg((p, a) => b.contains([a.lat, a.lon]));
  const offIds = items.filter((x) => !x.p.enabled).map((x) => x.p.id);
  const onIds = items.filter((x) => x.p.enabled && !x.p.meta.locked).map((x) => x.p.id);
  box.innerHTML = `<div class="sel-actions">
      <button class="btn sm" id="iv-on" ${offIds.length ? '' : 'disabled'}>${icon('power')}${esc(t('enableAllN', offIds.length))}</button>
      <button class="btn sm" id="iv-off" ${onIds.length ? '' : 'disabled'}>${icon('eyeoff')}${esc(t('disableAllN', onIds.length))}</button>
      <button class="btn sm ghost" id="iv-sel" ${items.length ? '' : 'disabled'}>${icon('select')}${esc(t('selectView'))}</button></div>
    <div class="list">${sideList(items, false) || `<div class="row"><div class="grow d">${esc(t('noAirportsInView'))}</div></div>`}</div>`;
  bindSideList(box);
  $('#iv-on').onclick = () => toggle(offIds, true, t('lblMapArea'));
  $('#iv-off').onclick = () => toggle(onIds, false, t('lblMapArea'));
  $('#iv-sel').onclick = () => { items.forEach(({ p }) => S.mapSel.add(p.id)); mapTab = 'sel'; refreshMarkers(); renderMapSide(); };
}
function renderSelection() {
  const box = $('#map-scroll');
  if (!box) return;
  const items = groupByPkg((p) => S.mapSel.has(p.id));
  if (!items.length) {
    box.innerHTML = `<div class="empty" style="padding:40px 20px">${icon('select')}<h3>${esc(t('noSelection'))}</h3><div style="font-size:13px">${esc(t('noSelectionHint'))}</div>
      <button class="btn primary" id="sel-mode">${icon('select')}${esc(t('boxSelect'))}</button></div>`;
    $('#sel-mode').onclick = () => setSelectMode(true);
    return;
  }
  const offIds = items.filter((x) => !x.p.enabled).map((x) => x.p.id);
  const onIds = items.filter((x) => x.p.enabled && !x.p.meta.locked).map((x) => x.p.id);
  const size = items.reduce((s, x) => s + x.p.size, 0);
  box.innerHTML = `<div style="padding:12px 16px 0" class="muted">${esc(t('selSummary', items.length, items.length - offIds.length, fmtSize(size)))}</div>
    <div class="sel-actions">
      <button class="btn sm primary" id="sel-on" ${offIds.length ? '' : 'disabled'}>${icon('power')}${esc(t('enableAllN', offIds.length))}</button>
      <button class="btn sm" id="sel-off" ${onIds.length ? '' : 'disabled'}>${icon('eyeoff')}${esc(t('disableAllN', onIds.length))}</button>
      <button class="btn sm" id="sel-only" title="${esc(t('onlySelectedHint'))}">${icon('target')}${esc(t('onlySelected'))}</button>
      <button class="btn sm" id="sel-prof">${icon('profiles')}${esc(t('toProfile'))}</button>
      <button class="btn sm ghost" id="sel-clear">${icon('close')}${esc(t('clearSelection'))}</button></div>
    <div class="list">${sideList(items, true)}</div>`;
  bindSideList(box);
  $('#sel-on').onclick = () => toggle(offIds, true, t('lblMapSel'));
  $('#sel-off').onclick = () => toggle(onIds, false, t('lblMapSel'));
  $('#sel-only').onclick = () => {
    const keep = new Set(items.map((x) => x.p.id));
    const disable = S.scan.packages.filter((p) => p.enabled && catOf(p) === 'airport' && !keep.has(p.id) && !p.meta.locked).map((p) => p.id);
    applyChanges(offIds, disable, t('lblMapSel'));
  };
  $('#sel-prof').onclick = () => addToProfileDialog(items.map((x) => x.p.id));
  $('#sel-clear').onclick = () => { S.mapSel.clear(); refreshMarkers(); renderMapSide(); };
}

// Planowanie lotu: lotniska w promieniu od startu i celu (i opcjonalnie wzdłuż trasy).
function haversine(a, b) {
  const R = 6371; const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r; const dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function routePoints(dep, arr) {
  const d = haversine(dep, arr);
  const n = Math.max(2, Math.ceil(d / 20));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ lat: dep.lat + ((arr.lat - dep.lat) * i) / n, lon: dep.lon + ((arr.lon - dep.lon) * i) / n });
  return pts;
}
function computePlan() {
  const P = S.plan;
  if (!P.dep) return null;
  const pts = P.arr ? routePoints(P.dep, P.arr) : [P.dep];
  const ends = [P.dep, P.arr].filter(Boolean);
  const match = new Map();
  for (const p of S.scan.packages) {
    if (catOf(p) !== 'airport' || !p.airports.length) continue;
    let best = Infinity; let which = '';
    for (const a of p.airports.slice(0, 200)) {
      for (const e of ends) { const d = haversine(a, e); if (d < best) { best = d; which = a.icao; } }
      if (P.corridor > 0 && best > P.radius) for (const q of pts) { const d = haversine(a, q); if (d <= P.corridor && d < best) { best = d; which = a.icao; } }
    }
    const within = best <= P.radius || (P.corridor > 0 && best <= P.corridor);
    if (within) match.set(p.id, { p, d: best, icao: which });
  }
  const enable = [...match.values()].filter((x) => !x.p.enabled).map((x) => x.p.id);
  let disable = [];
  if (P.offOthers) disable = S.scan.packages.filter((p) => p.enabled && catOf(p) === 'airport' && !match.has(p.id) && !p.meta.locked).map((p) => p.id);
  if (P.aircraft) {
    const ac = pkgById(P.aircraft);
    if (ac && !ac.enabled) enable.push(ac.id);
    if (P.offAircraft) disable.push(...S.scan.packages.filter((p) => p.enabled && catOf(p) === 'aircraft' && p.id !== P.aircraft && !p.meta.locked).map((p) => p.id));
  }
  return { match: [...match.values()].sort((a, b) => a.d - b.d), enable, disable };
}
function renderPlan() {
  const box = $('#map-scroll');
  const P = S.plan;
  const aircraft = S.scan.packages.filter((p) => catOf(p) === 'aircraft').sort((a, b) => a.title.localeCompare(b.title));
  box.innerHTML = `<div class="plan">
    <div class="two">
      <label>${esc(t('departure'))}<div class="ac-wrap"><input class="inp mono" id="pl-dep" placeholder="EPWA" value="${esc(P.dep?.icao || '')}" style="width:100%"></div></label>
      <label>${esc(t('arrival'))}<div class="ac-wrap"><input class="inp mono" id="pl-arr" placeholder="EPKK" value="${esc(P.arr?.icao || '')}" style="width:100%"></div></label>
    </div>
    <div class="faint" style="font-size:12px;min-height:16px">${esc([P.dep && `${P.dep.icao} – ${P.dep.name}`, P.arr && `${P.arr.icao} – ${P.arr.name}`, P.dep && P.arr && `${Math.round(haversine(P.dep, P.arr))} km`].filter(Boolean).join(' · '))}</div>
    <div class="two">
      <label>${esc(t('radius'))} · <b id="pl-rv">${P.radius} km</b><input type="range" id="pl-r" min="5" max="300" step="5" value="${P.radius}" style="accent-color:var(--acc)"></label>
      <label>${esc(t('corridor'))} · <b id="pl-cv">${P.corridor ? P.corridor + ' km' : t('off')}</b><input type="range" id="pl-c" min="0" max="150" step="5" value="${P.corridor}" style="accent-color:var(--acc)"></label>
    </div>
    <label>${esc(t('aircraftOpt'))}<select class="inp" id="pl-ac"><option value="">${esc(t('noChange'))}</option>${aircraft.map((a) => `<option value="${a.id}" ${P.aircraft === a.id ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>
    <label class="check-row" style="flex-direction:row;color:var(--text);font-size:13px;align-items:center;gap:8px"><input type="checkbox" id="pl-off" ${P.offOthers ? 'checked' : ''} style="accent-color:var(--acc)">${esc(t('offOtherAirports'))}</label>
    <label class="check-row" style="flex-direction:row;color:var(--text);font-size:13px;align-items:center;gap:8px"><input type="checkbox" id="pl-offac" ${P.offAircraft ? 'checked' : ''} style="accent-color:var(--acc)">${esc(t('offOtherAircraft'))}</label>
    <div id="pl-res"></div></div>`;
  const ac = (inp, key) => {
    let list;
    inp.oninput = debounce(async () => {
      list?.remove();
      const q = inp.value.trim();
      if (q.length < 2) return;
      const res = await invoke('airport_search', { query: q });
      list = document.createElement('div');
      list.className = 'ac-list';
      list.innerHTML = res.map((a, i) => `<div data-i="${i}"><b class="mono">${esc(a.icao)}</b> ${esc(a.name)} <span class="faint">${esc(a.city)} ${esc(a.country)}</span></div>`).join('');
      inp.parentElement.append(list);
      $$('[data-i]', list).forEach((d) => (d.onmousedown = () => { P[key] = res[+d.dataset.i]; list.remove(); renderPlan(); drawRoute(); }));
      if (res.length === 1 && res[0].icao === q.toUpperCase()) { P[key] = res[0]; list.remove(); renderPlan(); drawRoute(); }
    }, 220);
    inp.onblur = () => setTimeout(() => list?.remove(), 150);
  };
  ac($('#pl-dep'), 'dep');
  ac($('#pl-arr'), 'arr');
  $('#pl-r').oninput = (e) => { P.radius = +e.target.value; $('#pl-rv').textContent = `${P.radius} km`; renderPlanResult(); drawRoute(); };
  $('#pl-c').oninput = (e) => { P.corridor = +e.target.value; $('#pl-cv').textContent = P.corridor ? `${P.corridor} km` : t('off'); renderPlanResult(); drawRoute(); };
  $('#pl-ac').onchange = (e) => { P.aircraft = e.target.value; renderPlanResult(); };
  $('#pl-off').onchange = (e) => { P.offOthers = e.target.checked; renderPlanResult(); };
  $('#pl-offac').onchange = (e) => { P.offAircraft = e.target.checked; renderPlanResult(); };
  renderPlanResult();
  drawRoute();
}
function renderPlanResult() {
  const box = $('#pl-res');
  if (!box) return;
  const r = computePlan();
  if (!r) { box.innerHTML = `<div class="faint" style="font-size:13px">${esc(t('planHint'))}</div>`; return; }
  box.innerHTML = `<div class="section-title" style="margin:6px 0 8px;font-size:13px">${icon('airport')}${esc(t('matchedAirports', r.match.length))}</div>
    <div class="diff">${r.match.slice(0, 30).map((x) => `<div class="row"><span class="tag icao acc">${esc(x.icao)}</span><div class="grow"><div class="t" style="font-size:13px">${esc(x.p.title)}</div></div><span class="faint mono">${Math.round(x.d)} km</span>${x.p.enabled ? `<span class="tag ok">${icon('check')}</span>` : ''}</div>`).join('') || `<div class="faint" style="font-size:13px">${esc(t('noMatchedAirports'))}</div>`}</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <span class="tag ok">+${r.enable.length}</span><span class="tag bad">−${r.disable.length}</span></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn primary" id="pl-apply" ${r.enable.length || r.disable.length ? '' : 'disabled'}>${icon('check')}${esc(t('applyPlan'))}</button>
      <button class="btn" id="pl-save">${icon('save')}${esc(t('saveAsProfile'))}</button></div>`;
  $('#pl-apply').onclick = async () => {
    const P = S.plan;
    await applyChanges(r.enable, r.disable, `${t('lblFlight')} ${[P.dep?.icao, P.arr?.icao].filter(Boolean).join(' → ')}`);
  };
  $('#pl-save').onclick = () => {
    const keys = new Set(S.scan.packages.filter((p) => (p.enabled || r.enable.includes(p.id)) && !r.disable.includes(p.id)).map((p) => p.key));
    saveCurrentAsProfile([...keys], `${S.plan.dep?.icao || ''}${S.plan.arr ? ' → ' + S.plan.arr.icao : ''}`);
  };
}
function drawRoute(fit = true) {
  const g = S.mapLayers?.route;
  if (!g || !S.map) return;
  g.clearLayers();
  const P = S.plan;
  const style = { color: getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#ffbf5c', weight: 2, fillOpacity: 0.06 };
  for (const e of [P.dep, P.arr].filter(Boolean)) {
    L.circle([e.lat, e.lon], { radius: P.radius * 1000, ...style }).addTo(g);
    L.marker([e.lat, e.lon], { icon: L.divIcon({ className: '', html: '<div class="apt-pin route"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(g).bindTooltip(e.icao, { permanent: true, direction: 'top', offset: [0, -10] });
  }
  if (P.dep && P.arr) {
    L.polyline(routePoints(P.dep, P.arr).map((q) => [q.lat, q.lon]), { ...style, dashArray: '6 6' }).addTo(g);
    if (fit) S.map.fitBounds([[P.dep.lat, P.dep.lon], [P.arr.lat, P.arr.lon]], { padding: [80, 80], maxZoom: 9 });
  } else if (P.dep && fit) S.map.setView([P.dep.lat, P.dep.lon], 8);
}

// ───────────── Profile ─────────────
const catChecks = (id, selected) => `<div class="field" style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text-3)">${esc(t('profileScope'))}
  <div class="chips" id="${id}">${CATS.map((c) => `<label class="chip ${!selected?.length || selected.includes(c.id) ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" value="${c.id}" ${!selected?.length || selected.includes(c.id) ? 'checked' : ''} style="display:none">${icon(c.id)}${esc(t('cat_' + c.id))}</label>`).join('')}</div>
  <span class="faint" style="font-size:12px">${esc(t('profileScopeHint'))}</span></div>`;
const bindCatChecks = (w, id) => $$(`#${id} label`, w).forEach((l) => (l.onclick = (e) => { e.preventDefault(); const i = $('input', l); i.checked = !i.checked; l.classList.toggle('on', i.checked); }));
// Zakres: puste albo wszystkie kategorie = profil zarządza wszystkim.
const readCatChecks = (w, id) => { const all = $$(`#${id} input`, w); const on = all.filter((i) => i.checked).map((i) => i.value); return on.length === all.length ? [] : on; };
const inScope = (prof, p) => !prof.categories?.length || prof.categories.includes(catOf(p));
const scopeLabel = (prof) => (prof.categories?.length ? prof.categories.map((c) => t('cat_' + c)).join(', ') : '');
function profileMatch(prof) {
  if (!S.scan) return 0;
  const on = new Set(S.scan.packages.filter((p) => p.enabled && inScope(prof, p)).map((p) => p.key));
  const want = new Set(prof.packages);
  if (!want.size && !on.size) return 1;
  let hit = 0;
  want.forEach((k) => { if (on.has(k)) hit++; });
  const extra = [...on].filter((k) => !want.has(k) && !S.scan.packages.find((p) => p.key === k)?.meta.locked).length;
  return hit / Math.max(want.size + extra, 1);
}
function profileDiff(prof, additive = false) {
  const want = new Set(prof.packages);
  const byKey = new Map();
  for (const p of S.scan.packages) {
    const cur = byKey.get(p.key);
    // Z kilku kopii wybieramy włączoną, potem tę z biblioteki.
    const rank = (x) => (x.enabled ? 0 : x.source === 'library' ? 1 : 2);
    if (!cur || rank(p) < rank(cur)) byKey.set(p.key, p);
  }
  const enable = [...want].map((k) => byKey.get(k)).filter((p) => p && !p.enabled).map((p) => p.id);
  const missing = [...want].filter((k) => !byKey.has(k));
  const disable = additive ? [] : S.scan.packages.filter((p) => p.enabled && inScope(prof, p) && !want.has(p.key) && !p.meta.locked).map((p) => p.id);
  return { enable, disable, missing };
}
async function applyProfile(id, additive = false) {
  const prof = S.profiles.find((p) => p.id === id);
  if (!prof) return;
  const d = profileDiff(prof, additive);
  if (!d.enable.length && !d.disable.length && !prof.officialDisabled?.length) { toast(t('profileAlready', prof.name)); return; }
  if (S.settings.confirmBulk && d.enable.length + d.disable.length > 0) {
    const list = (ids, cls, sign) => ids.slice(0, 40).map((x) => pkgById(x)).filter(Boolean).map((p) => `<div class="row"><span class="tag ${cls}">${sign}</span><div class="grow"><div class="t" style="font-size:13px">${esc(p.title)}</div></div></div>`).join('');
    const ok = await confirmBox(`${t('apply')}: ${prof.name}`,
      `${prof.categories?.length ? `<div class="banner acc" style="margin:0">${icon('filter')}<div>${esc(t('scopeOnly', scopeLabel(prof)))}</div></div>` : ''}<div><span class="tag ok">+${d.enable.length}</span> <span class="tag bad">−${d.disable.length}</span>${d.missing.length ? ` <span class="tag warn">${esc(t('missingN', d.missing.length))}</span>` : ''}</div>
       <div class="diff" style="max-height:340px;overflow:auto">${list(d.enable, 'ok', '+')}${list(d.disable, 'bad', '−')}</div>`, t('apply'));
    if (!ok) return;
  }
  await applyChanges(d.enable, d.disable, `${t('profile')}: ${prof.name}`, t('profileApplied', prof.name));
  if (prof.officialDisabled?.length) {
    try {
      const list = S.official || (await invoke('official_list'));
      const changes = {};
      const off = new Set(prof.officialDisabled);
      for (const o of list.packages) { const want = !off.has(o.name); if (o.enabled !== want) changes[o.name] = want; }
      if (Object.keys(changes).length) { await invoke('official_set', { changes, label: `${t('profile')}: ${prof.name}` }); S.official = null; }
    } catch (e) { toast(errMsg(e), 'warn'); }
  }
}
async function saveProfiles() {
  try { S.profiles = await invoke('save_profiles', { profiles: S.profiles }); } catch (e) { toast(errMsg(e), 'bad'); }
}
async function saveCurrentAsProfile(keys, suggested = '', scope = []) {
  const r = await dialog({
    title: t('newProfile'),
    body: `<label class="field">${esc(t('name'))}<input class="inp" id="np-name" value="${esc(suggested)}" placeholder="${esc(t('profileNamePh'))}"></label>
      <label class="field">${esc(t('note'))}<input class="inp" id="np-note"></label>
      <div class="swatches" id="np-col">${PROFILE_COLORS.map((c, i) => `<button style="background:${c}" data-c="${c}" class="${i === 0 ? 'on' : ''}"></button>`).join('')}</div>
      ${catChecks('np-cats', scope)}
      ${S.scan.installation?.contentXml ? `<label class="check-row"><input type="checkbox" id="np-off">${esc(t('includeOfficial'))}</label>` : ''}`,
    actions: [{ label: t('cancel'), value: null }, { label: t('save'), kind: 'primary', value: (w) => ({ name: $('#np-name', w).value.trim(), note: $('#np-note', w).value.trim(), color: $('#np-col .on', w)?.dataset.c, official: $('#np-off', w)?.checked, categories: readCatChecks(w, 'np-cats') }) }],
    onOpen: (w) => { $$('#np-col button', w).forEach((b) => (b.onclick = () => { $$('#np-col button', w).forEach((x) => x.classList.remove('on')); b.classList.add('on'); })); bindCatChecks(w, 'np-cats'); },
  });
  if (!r || !r.name) return;
  let officialDisabled = [];
  if (r.official) {
    try { const l = await invoke('official_list'); officialDisabled = l.packages.filter((o) => !o.enabled).map((o) => o.name); } catch { /* bez oficjalnych */ }
  }
  const prof = { categories: r.categories };
  const base = keys ? keys.map((k) => S.scan.packages.find((p) => p.key === k)).filter(Boolean) : S.scan.packages.filter((p) => p.enabled);
  S.profiles.push({ id: '', name: r.name, note: r.note, color: r.color, categories: r.categories, packages: base.filter((p) => inScope(prof, p)).map((p) => p.key), officialDisabled, created: '', updated: '' });
  await saveProfiles();
  toast(t('profileSaved', r.name));
  if (S.view === 'profiles' || S.view === 'dashboard') renderView();
}
async function addToProfileDialog(ids) {
  const keys = ids.map(pkgById).filter(Boolean).map((p) => p.key);
  if (!S.profiles.length) { await saveCurrentAsProfile(keys); return; }
  const r = await dialog({
    title: t('toProfile'),
    body: `<div>${esc(t('toProfileQ', keys.length))}</div><div class="card list">${S.profiles.map((p) => `<label class="row click" style="gap:10px"><input type="checkbox" value="${p.id}" style="accent-color:var(--acc)" ${keys.every((k) => p.packages.includes(k)) ? 'checked' : ''}><span style="width:10px;height:10px;border-radius:50%;background:${p.color}"></span><div class="grow t">${esc(p.name)}</div></label>`).join('')}</div>`,
    actions: [{ label: t('cancel'), value: null }, { label: t('newProfile'), value: 'new' }, { label: t('save'), kind: 'primary', value: (w) => $$('input:checked', w).map((i) => i.value) }],
  });
  if (r === 'new') { await saveCurrentAsProfile(keys); return; }
  if (!r) return;
  for (const p of S.profiles) {
    if (r.includes(p.id)) p.packages = [...new Set([...p.packages, ...keys])];
    else if (keys.every((k) => p.packages.includes(k))) p.packages = p.packages.filter((k) => !keys.includes(k));
    p.updated = '';
  }
  await saveProfiles();
  toast(t('profilesUpdated'));
  if (S.sheetId) openSheet(S.sheetId, true);
}
function viewProfiles(v) {
  topbar(t('nav_profiles'), esc(t('profilesSub')),
    `<button class="btn" id="p-import">${icon('upload')}${esc(t('import'))}</button><button class="btn primary" id="p-new">${icon('plus')}${esc(t('saveCurrent'))}</button>`);
  const byKey = new Map(S.scan.packages.map((p) => [p.key, p]));
  v.innerHTML = S.profiles.length ? `<div class="prof-grid">${S.profiles.map((p) => {
    const match = profileMatch(p);
    const pk = p.packages.map((k) => byKey.get(k)).filter(Boolean);
    const missing = p.packages.length - pk.length;
    const cats = CATS.map((c) => [c, pk.filter((x) => catOf(x) === c.id).length]).filter(([, n]) => n);
    return `<div class="prof ${match === 1 ? 'active' : ''}" data-pid="${p.id}"><div class="stripe" style="background:${p.color || PROFILE_COLORS[0]}"></div>
      <div style="display:flex;align-items:center;gap:8px"><h3 style="flex:1">${esc(p.name)}</h3>${match === 1 ? `<span class="tag ok">${icon('check')}${esc(t('active'))}</span>` : `<span class="tag">${Math.round(match * 100)}%</span>`}</div>
      ${p.note ? `<div class="muted" style="font-size:13px">${esc(p.note)}</div>` : ''}
      <div class="faint" style="font-size:12.5px">${pk.length} ${esc(plural(pk.length, t('pkg1'), t('pkg2'), t('pkg5')))} · ${fmtSize(pk.reduce((a, x) => a + x.size, 0))}${missing ? ` · <span style="color:var(--warn)">${esc(t('missingN', missing))}</span>` : ''}${p.officialDisabled?.length ? ` · ${esc(t('officialOffN', p.officialDisabled.length))}` : ''}</div>
      ${p.categories?.length ? `<div class="faint" style="font-size:12.5px;display:flex;gap:6px;align-items:center">${icon('filter')}${esc(t('scopeOnly', scopeLabel(p)))}</div>` : ''}
      <div class="cats">${cats.map(([c, n]) => `<span class="tag" style="color:${c.color}">${icon(c.id)}${n}</span>`).join('')}</div>
      <div class="acts">
        <button class="btn sm primary" data-a="apply">${icon('check')}${esc(t('apply'))}</button>
        <button class="btn sm" data-a="add" title="${esc(t('additiveHint'))}">${icon('plus')}${esc(t('additive'))}</button>
        <button class="btn sm icon" data-a="update" title="${esc(t('updateFromCurrent'))}">${icon('refresh')}</button>
        <button class="btn sm icon" data-a="edit" title="${esc(t('edit'))}">${icon('edit')}</button>
        <button class="btn sm icon" data-a="dup" title="${esc(t('duplicate'))}">${icon('copy')}</button>
        <button class="btn sm icon" data-a="export" title="${esc(t('export'))}">${icon('download')}</button>
        <button class="btn sm icon danger" data-a="del" title="${esc(t('delete'))}">${icon('trash')}</button>
      </div></div>`;
  }).join('')}</div>` : `<div class="empty">${icon('profiles')}<h3>${esc(t('noProfiles'))}</h3><div style="max-width:520px">${esc(t('noProfilesHint'))}</div></div>`;
  $('#p-new').onclick = () => saveCurrentAsProfile();
  $('#p-import').onclick = importProfile;
  $$('[data-pid]', v).forEach((card) => {
    const prof = S.profiles.find((p) => p.id === card.dataset.pid);
    $$('[data-a]', card).forEach((b) => (b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'apply') applyProfile(prof.id);
      if (a === 'add') applyProfile(prof.id, true);
      if (a === 'update') {
        if (!(await confirmBox(t('updateFromCurrent'), `<div>${esc(t('updateFromCurrentQ', prof.name))}</div>`))) return;
        prof.packages = S.scan.packages.filter((p) => p.enabled && inScope(prof, p)).map((p) => p.key); prof.updated = '';
        await saveProfiles(); renderView(); toast(t('profileSaved', prof.name));
      }
      if (a === 'edit') {
        const r = await dialog({
          title: t('edit'),
          body: `<label class="field">${esc(t('name'))}<input class="inp" id="ep-name" value="${esc(prof.name)}"></label><label class="field">${esc(t('note'))}<input class="inp" id="ep-note" value="${esc(prof.note || '')}"></label>
            <div class="swatches" id="ep-col">${PROFILE_COLORS.map((c) => `<button style="background:${c}" data-c="${c}" class="${prof.color === c ? 'on' : ''}"></button>`).join('')}</div>
            ${catChecks('ep-cats', prof.categories)}`,
          actions: [{ label: t('cancel'), value: null }, { label: t('save'), kind: 'primary', value: (w) => ({ name: $('#ep-name', w).value.trim(), note: $('#ep-note', w).value.trim(), color: $('#ep-col .on', w)?.dataset.c || prof.color, categories: readCatChecks(w, 'ep-cats') }) }],
          onOpen: (w) => { $$('#ep-col button', w).forEach((x) => (x.onclick = () => { $$('#ep-col button', w).forEach((y) => y.classList.remove('on')); x.classList.add('on'); })); bindCatChecks(w, 'ep-cats'); },
        });
        if (!r || !r.name) return;
        Object.assign(prof, r, { updated: '' }); await saveProfiles(); renderView();
      }
      if (a === 'dup') { S.profiles.push({ ...prof, id: '', name: `${prof.name} (2)`, created: '', updated: '' }); await saveProfiles(); renderView(); }
      if (a === 'export') {
        const path = await dlg.save({ defaultPath: `${prof.name.replace(/[\\/:*?"<>|]/g, '_')}.fsat-profile.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!path) return;
        const data = { format: 'fs-addon-toolkit-profile', version: 1, profile: { ...prof, id: undefined }, titles: Object.fromEntries(prof.packages.map((k) => [k, byKey.get(k)?.title || k])) };
        try { await invoke('write_text', { path, text: JSON.stringify(data, null, 2) }); toast(t('exported')); } catch (e) { toast(errMsg(e), 'bad'); }
      }
      if (a === 'del') {
        if (!(await confirmBox(t('delete'), `<div>${esc(t('deleteProfileQ', prof.name))}</div>`, t('delete')))) return;
        S.profiles = S.profiles.filter((p) => p.id !== prof.id); await saveProfiles(); renderView();
      }
    }));
  });
}
async function importProfile() {
  const path = await dlg.open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!path) return;
  try {
    const data = JSON.parse(await invoke('read_text', { path }));
    const p = data.profile || data;
    if (!Array.isArray(p.packages)) throw new Error(t('badProfileFile'));
    S.profiles.push({ id: '', name: p.name || 'Profil', note: p.note || '', color: p.color || PROFILE_COLORS[0], packages: p.packages.map((k) => String(k).toLowerCase()), officialDisabled: p.officialDisabled || [], created: '', updated: '' });
    await saveProfiles(); renderView(); toast(t('imported', p.name));
  } catch (e) { toast(errMsg(e), 'bad'); }
}

// ───────────── Pakiety oficjalne ─────────────
async function viewOfficial(v) {
  const F = S.officialF;
  topbar(t('nav_official'), esc(t('officialSub')), `<label class="search">${icon('search')}<input id="oq" placeholder="${esc(t('searchPh'))}" value="${esc(F.q)}"></label><button class="btn icon" id="o-refresh" title="${esc(t('refresh'))}">${icon('refresh')}</button>`);
  $('#o-refresh').onclick = () => { S.official = null; renderView(); };
  if (!S.official) {
    v.innerHTML = `<div class="loading">${icon('refresh', 'spin')}<div>${esc(t('loading'))}</div></div>`;
    try { S.official = await invoke('official_list'); } catch (e) { v.innerHTML = `<div class="empty">${icon('official')}<h3>${esc(t('officialUnavailable'))}</h3><div>${esc(errMsg(e))}</div></div>`; return; }
    if (S.view !== 'official') return;
  }
  const L0 = S.official;
  const q = F.q.trim().toLowerCase();
  const cats = ['all', 'aircraft', 'livery', 'airport', 'scenery', 'library', 'core', 'other'];
  const count = (c) => L0.packages.filter((p) => c === 'all' || p.category === c).length;
  const list = L0.packages.filter((p) => (F.cat === 'all' || p.category === F.cat) && (F.state === 'all' || (F.state === 'on') === p.enabled) && (!q || `${p.title} ${p.name} ${p.icao} ${p.creator}`.toLowerCase().includes(q)));
  const off = L0.packages.filter((p) => !p.enabled).length;
  v.innerHTML = `
    <div class="banner warn">${icon('warn')}<div class="grow">${esc(t('officialWarn'))}</div></div>
    <div class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px">
      <div class="chips">${cats.filter((c) => count(c)).map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" data-oc="${c}">${icon(c === 'all' ? 'all' : c === 'core' ? 'official' : c)}${esc(c === 'all' ? t('all') : c === 'core' ? t('cat_core') : t('cat_' + c))}<span class="n">${count(c)}</span></button>`).join('')}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="seg">${[['all', t('all')], ['on', t('enabled')], ['off', `${t('disabled')} (${off})`]].map(([k, l]) => `<button data-os="${k}" class="${F.state === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <span style="flex:1"></span>
        <span class="faint mono" style="font-size:11.5px">${esc(L0.path)}</span>
        <button class="btn sm ${L0.readonly ? 'primary' : ''}" id="o-ro" title="${esc(t('readonlyHint'))}">${icon(L0.readonly ? 'lock' : 'unlock')}${esc(t('readonly'))}</button>
        <button class="btn sm" id="o-bak">${icon('history')}${esc(t('backups'))}</button>
        <button class="btn sm" id="o-on" ${list.some((p) => !p.enabled) ? '' : 'disabled'}>${icon('power')}${esc(t('enableShown'))}</button>
        <button class="btn sm" id="o-off" ${list.some((p) => p.enabled) ? '' : 'disabled'}>${icon('eyeoff')}${esc(t('disableShown'))}</button>
      </div>
    </div>
    ${list.length ? `<table class="table"><thead><tr><th></th><th></th><th>${esc(t('colName'))}</th><th>${esc(t('colCat'))}</th><th>${esc(t('colCreator'))}</th><th>ICAO</th><th>${esc(t('generation'))}</th></tr></thead><tbody>
      ${list.slice(0, 1500).map((p) => `<tr class="${p.enabled ? '' : 'off'}" data-on="${esc(p.name)}">
        <td style="width:52px"><button class="switch ${p.enabled ? 'on' : ''}" data-osw="${esc(p.name)}"></button></td>
        <td style="width:76px"><div class="mini">${p.thumb ? `<img data-src="${esc(p.thumb)}" alt="">` : ''}</div></td>
        <td><div class="lt">${esc(p.title)}</div><div class="ld mono">${esc(p.name)}</div></td>
        <td><span class="tag">${esc(p.category === 'core' ? t('cat_core') : t('cat_' + p.category))}</span></td>
        <td><div class="ld" style="color:var(--text-2)">${esc(p.creator)}</div></td>
        <td>${p.icao ? `<span class="tag icao acc">${esc(p.icao)}</span>` : ''}</td>
        <td class="num">${esc(p.generation.toUpperCase())}${p.onDisk ? ` · ${icon('drive')}` : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${icon('official')}<h3>${esc(t('noMatches'))}</h3></div>`}`;
  observeThumbs(v);
  const oq = $('#oq');
  oq.oninput = debounce(() => { F.q = oq.value; const pos = oq.selectionStart; renderView(); const n = $('#oq'); n.focus(); n.setSelectionRange(pos, pos); }, 160);
  $$('[data-oc]', v).forEach((b) => (b.onclick = () => { F.cat = b.dataset.oc; renderView(); }));
  $$('[data-os]', v).forEach((b) => (b.onclick = () => { F.state = b.dataset.os; renderView(); }));
  const setOfficial = async (changes, label) => {
    try {
      const n = await invoke('official_set', { changes, label });
      for (const p of S.official.packages) if (p.name in changes) p.enabled = changes[p.name];
      S.history = null;
      renderView();
      toast(t('officialChanged', n), 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  };
  $$('[data-osw]', v).forEach((sw) => (sw.onclick = () => { const p = L0.packages.find((x) => x.name === sw.dataset.osw); setOfficial({ [p.name]: !p.enabled }, p.enabled ? t('lblDisable') : t('lblEnable')); }));
  $('#o-on').onclick = () => setOfficial(Object.fromEntries(list.filter((p) => !p.enabled).map((p) => [p.name, true])), t('lblBulkEnable'));
  $('#o-off').onclick = async () => {
    const target = list.filter((p) => p.enabled);
    if (!(await confirmBox(t('disableShown'), `<div>${esc(t('officialOffQ', target.length))}</div>`, t('disable')))) return;
    setOfficial(Object.fromEntries(target.map((p) => [p.name, false])), t('lblBulkDisable'));
  };
  $('#o-ro').onclick = async () => { try { await invoke('official_readonly', { readonly: !L0.readonly }); L0.readonly = !L0.readonly; renderView(); } catch (e) { toast(errMsg(e), 'bad'); } };
  $('#o-bak').onclick = async () => {
    const list = await invoke('official_backups');
    const r = await dialog({
      title: t('backups'),
      body: list.length ? `<div>${esc(t('backupsHint'))}</div><div class="card list">${list.map((b) => `<label class="row click" style="gap:10px"><input type="radio" name="bk" value="${esc(b)}" style="accent-color:var(--acc)"><div class="grow mono" style="font-size:12px">${esc(b.split(/[\\/]/).pop())}</div></label>`).join('')}</div>` : `<div>${esc(t('noBackups'))}</div>`,
      actions: [{ label: t('cancel'), value: null }, ...(list.length ? [{ label: t('restore'), kind: 'primary', value: (w) => $('input:checked', w)?.value }] : [])],
    });
    if (!r) return;
    try { await invoke('official_restore', { backup: r }); S.official = null; renderView(); toast(t('restored')); } catch (e) { toast(errMsg(e), 'bad'); }
  };
}

// ───────────── Kondycja ─────────────
function viewHealth(v) {
  topbar(t('nav_health'), esc(t('healthSub')), `<button class="btn" id="h-refresh">${icon('refresh')}${esc(t('checkAgain'))}</button>`);
  $('#h-refresh').onclick = () => { S.issues = null; renderView(); loadIssues(); };
  if (S.issues === null) { v.innerHTML = `<div class="loading">${icon('refresh', 'spin')}<div>${esc(t('checking'))}</div></div>`; return; }
  const I = S.issues;
  const e = I.filter((i) => i.severity === 'error').length; const w = I.filter((i) => i.severity === 'warn').length; const n = I.length - e - w;
  const score = Math.max(0, 100 - e * 15 - w * 5 - n);
  const col = score > 85 ? 'var(--ok)' : score > 60 ? 'var(--warn)' : 'var(--bad)';
  const C = 2 * Math.PI * 30;
  v.innerHTML = `<div class="card health-score">
      <svg class="ring" viewBox="0 0 74 74"><circle cx="37" cy="37" r="30" fill="none" stroke="var(--s3)" stroke-width="8"/><circle cx="37" cy="37" r="30" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * score) / 100} ${C}" transform="rotate(-90 37 37)"/><text x="37" y="43" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor">${score}</text></svg>
      <div><div style="font:600 19px var(--font-display)">${esc(I.length ? t('issuesFound', I.length) : t('allGood'))}</div>
      <div class="chips" style="margin-top:8px"><span class="tag bad">${e} ${esc(t('errors'))}</span><span class="tag warn">${w} ${esc(t('warnings'))}</span><span class="tag acc">${n} ${esc(t('tips'))}</span></div></div></div>
    ${I.length ? `<div class="card list" style="margin-top:16px">${I.map((i) => `<div class="issue">
      <div class="sev ${i.severity}">${icon(i.severity === 'error' ? 'error' : i.severity === 'warn' ? 'warn' : 'info')}</div>
      <div class="grow"><div class="t">${esc(i.title)}</div><div class="d">${esc(i.detail)}</div>
        ${i.paths.length ? `<div class="paths">${i.paths.slice(0, 6).map((p) => `<span>${esc(p)}</span>`).join('')}</div>` : ''}
        ${i.packages.length && i.kind !== 'native' ? `<div class="chips" style="margin-top:8px">${i.packages.slice(0, 6).map((id) => pkgById(id)).filter(Boolean).map((p) => `<button class="chip" data-open="${p.id}" style="height:26px;font-size:12px">${esc(p.title)}</button>`).join('')}</div>` : ''}
      </div>
      ${i.fix ? `<button class="btn sm" data-fix="${esc(i.id)}">${icon('wand')}${esc(t('fix_' + i.fix) || i.fixLabel)}</button>` : ''}</div>`).join('')}</div>` : ''}`;
  $$('[data-open]', v).forEach((b) => (b.onclick = () => openSheet(b.dataset.open)));
  $$('[data-fix]', v).forEach((b) => (b.onclick = async () => {
    const i = I.find((x) => x.id === b.dataset.fix);
    if (i.fix === 'relocate') { relocateDialog(i.packages); return; }
    if (i.fix === 'install') { installDialog(i.paths); return; }
    if (i.fix === 'trash' && !(await confirmBox(t('toTrash'), `<div class="mono">${esc(i.paths.join('\n'))}</div>`, t('toTrash')))) return;
    b.disabled = true;
    try { const msg = await invoke('fix_issue', { fix: i.fix, packages: i.packages, paths: i.paths }); toast(msg); await refresh(); } catch (e2) { toast(errMsg(e2), 'bad'); b.disabled = false; }
  }));
}

// ───────────── Historia ─────────────
async function viewHistory(v) {
  topbar(t('nav_history'), esc(t('historySub')));
  if (!S.history) {
    v.innerHTML = `<div class="loading">${icon('refresh', 'spin')}</div>`;
    S.history = await invoke('history');
    if (S.view !== 'history') return;
  }
  const batches = [];
  for (const e of S.history) {
    let b = batches[batches.length - 1];
    if (!b || b.batch !== e.batch) { b = { batch: e.batch, label: e.label, at: e.at, items: [], undone: true }; batches.push(b); }
    b.items.push(e);
    if (!e.undone) b.undone = false;
  }
  const opIcon = (k) => ({ link: 'link', unlink: 'unlink', move: 'move', official: 'official' }[k] || 'info');
  v.innerHTML = batches.length ? `<div class="card list">${batches.slice(0, 300).map((b) => `<div class="batch ${b.undone ? 'undone' : ''}">
    <div class="head"><div class="grow"><div class="t" style="font-weight:650">${esc(b.label)}</div><div class="faint" style="font-size:12.5px">${esc(fmtTime(b.at))} · ${b.items.length} ${esc(plural(b.items.length, t('op1'), t('op2'), t('op5')))}</div></div>
    ${b.undone ? `<span class="tag">${esc(t('undoneTag'))}</span>` : `<button class="btn sm" data-undo="${b.batch}">${icon('undo')}${esc(t('undo'))}</button>`}</div>
    <div class="items">${b.items.slice(0, 24).map((e) => `<span class="tag" title="${esc(JSON.stringify(e.op))}">${icon(opIcon(e.op.kind))}${esc(e.title)}</span>`).join('')}${b.items.length > 24 ? `<span class="tag">+${b.items.length - 24}</span>` : ''}</div></div>`).join('')}</div>`
    : `<div class="empty">${icon('history')}<h3>${esc(t('noHistory'))}</h3><div>${esc(t('noHistoryHint'))}</div></div>`;
  $$('[data-undo]', v).forEach((b) => (b.onclick = () => undoBatch(b.dataset.undo)));
}

// ───────────── Ustawienia ─────────────
async function pickLibrary() {
  const dir = await dlg.open({ directory: true, title: t('pickLibrary') });
  if (!dir) return null;
  try {
    const lib = await invoke('check_library', { path: dir });
    S.settings.libraries.push(lib);
    await saveSettings();
    await refresh();
    toast(t('libraryAdded', lib.name));
    return lib;
  } catch (e) { toast(errMsg(e), 'bad'); return null; }
}
function viewSettings(v) {
  const s = S.settings;
  const sc = S.scan;
  topbar(t('nav_settings'));
  const sw = (k) => `<button class="switch ${s[k] ? 'on' : ''}" data-swk="${k}"></button>`;
  const row = (title, desc, ctl) => `<div class="set-row"><div class="grow"><div class="t">${title}</div>${desc ? `<div class="d">${desc}</div>` : ''}</div>${ctl}</div>`;
  const libStats = new Map((sc.libraries || []).map((l) => [l.id, l]));
  v.innerHTML = `<div class="settings">
    <div class="card set-card"><h3>${icon('aircraft')}${esc(t('setSim'))}</h3>
      ${row(esc(t('installation')), esc(t('installationD')), `<select class="inp" id="st-inst">${S.installs.map((i) => `<option value="${i.id}" ${(s.installationId || S.installs[0]?.id) === i.id ? 'selected' : ''}>${esc(i.label)}</option>`).join('') || `<option>${esc(t('noSim'))}</option>`}</select>`)}
      ${sc.installation ? row(esc(t('packagesPath')), `<span class="mono selectable">${esc(sc.installation.packagesPath)}</span>`, `<button class="btn sm" data-open-path="${esc(sc.installation.packagesPath)}">${icon('folder')}</button>`) : ''}
      ${row(esc(t('customCommunity')), esc(t('customCommunityD')), `<div style="display:flex;gap:6px"><input class="inp mono" id="st-cc" value="${esc(s.customCommunity)}" placeholder="${esc(t('auto'))}" style="width:280px"><button class="btn sm icon" id="st-cc-pick">${icon('folder')}</button></div>`)}
      ${(sc.communities || []).length > 1 ? row(esc(t('targetCommunity')), esc(t('targetCommunityD')), `<select class="inp" id="st-tc">${sc.communities.map((c) => `<option value="${esc(c)}" ${sc.target === c ? 'selected' : ''}>${esc(c.split('\\').pop())}</option>`).join('')}</select>`) : ''}
      ${row(esc(t('parking')), `${esc(t('parkingD'))}<br><span class="mono selectable">${esc(sc.parking || '')}</span>`, `<div style="display:flex;gap:6px"><input class="inp mono" id="st-park" value="${esc(s.parking)}" placeholder="${esc(t('auto'))}" style="width:280px"><button class="btn sm icon" id="st-park-pick">${icon('folder')}</button></div>`)}
    </div>
    <div class="card set-card"><h3>${icon('library')}${esc(t('libraries'))}<span style="flex:1"></span><button class="btn sm primary" id="st-addlib">${icon('plus')}${esc(t('addLibrary'))}</button></h3>
      <div class="set-row" style="border-top:0;padding-top:0"><div class="d">${esc(t('librariesD'))}</div></div>
      ${s.libraries.map((l) => { const st = libStats.get(l.id); return `<div class="lib-row"><div class="icon-box ${st && !st.exists ? 'bad' : ''}">${icon(st && !st.exists ? 'warn' : 'drive')}</div>
        <div class="grow"><input class="name" data-lname="${l.id}" value="${esc(l.name)}"><div class="d mono faint" style="font-size:12px">${esc(l.path)}</div>
        <div class="faint" style="font-size:12px">${st ? (st.exists ? esc(t('libStat', st.count, st.enabled, fmtSize(st.size))) : esc(t('libMissing'))) : ''}</div></div>
        <button class="btn sm icon" data-open-path="${esc(l.path)}" title="${esc(t('openFolder'))}">${icon('folder')}</button>
        <button class="btn sm icon danger" data-rmlib="${l.id}" title="${esc(t('remove'))}">${icon('trash')}</button></div>`; }).join('') || `<div class="lib-row"><div class="grow muted">${esc(t('noLibraries'))}</div></div>`}
      ${sc.suggestedLibraries?.length ? sc.suggestedLibraries.map((x) => `<div class="lib-row"><div class="icon-box">${icon('link')}</div><div class="grow"><div class="t">${esc(t('suggestedLib'))}</div><div class="d mono faint" style="font-size:12px">${esc(x.path)}</div><div class="faint" style="font-size:12px">${esc(t('suggestedLibD', x.links, x.packages))}</div></div><button class="btn sm" data-sugg="${esc(x.path)}">${icon('plus')}${esc(t('add'))}</button></div>`).join('') : ''}
    </div>
    <div class="card set-card"><h3>${icon('link')}${esc(t('setBehavior'))}</h3>
      ${row(esc(t('linkMode')), esc(t('linkModeD')), `<select class="inp" id="st-lm" style="width:240px"><option value="junction" ${s.linkMode !== 'symlink' ? 'selected' : ''}>${esc(t('junction'))}</option><option value="symlink" ${s.linkMode === 'symlink' ? 'selected' : ''}>${esc(t('symlink'))}</option></select>`)}
      ${row(esc(t('blockRunning')), esc(t('blockRunningD')), sw('blockWhileRunning'))}
      ${row(esc(t('confirmBulk')), esc(t('confirmBulkD')), sw('confirmBulk'))}
      ${row(esc(t('liveryPrompt')), esc(t('liveryPromptD')), `<select class="inp" id="st-lp" style="width:240px">${['ask', 'all', 'none'].map((k) => `<option value="${k}" ${(s.liveryPrompt || 'ask') === k ? 'selected' : ''}>${esc(t('lp_' + k))}</option>`).join('')}</select>`)}
      ${row(esc(t('autoUpdate')), esc(t('autoUpdateD')), sw('autoUpdateCheck'))}
    </div>
    <div class="card set-card"><h3>${icon('eye')}${esc(t('setLook'))}</h3>
      ${row(esc(t('theme')), '', `<select class="inp" id="st-theme" style="width:200px">${['dark', 'amoled', 'light', 'auto'].map((k) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${esc(t('theme_' + k))}</option>`).join('')}</select>`)}
      ${row(esc(t('mapStyle')), '', `<select class="inp" id="st-map" style="width:200px">${[['dark', t('mapDark')], ['light', t('mapLight')], ['osm', 'OpenStreetMap'], ['satellite', t('mapSat')]].map(([k, l]) => `<option value="${k}" ${(s.mapStyle || 'dark') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
      ${row(esc(t('accent')), '', `<div class="accent-pick">${['sky', 'amber', 'green', 'violet', 'rose'].map((a) => `<button data-acc="${a}" class="${s.accent === a ? 'on' : ''}" style="background:${{ sky: '#5cc4ff', amber: '#ffc35a', green: '#5fe0a0', violet: '#b7a2ff', rose: '#ff95b5' }[a]}"></button>`).join('')}</div>`)}
      ${row(esc(t('language')), '', `<select class="inp" id="st-lang" style="width:200px"><option value="pl" ${s.language === 'pl' ? 'selected' : ''}>Polski</option><option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option></select>`)}
      ${row(esc(t('cardSize')), '', `<input type="range" id="st-card" min="190" max="360" step="10" value="${s.cardSize || 240}">`)}
    </div>
    <div class="card set-card"><h3>${icon('info')}${esc(t('about'))}</h3>
      ${row(`FS Addon Toolkit ${esc(S.info.version)}${S.info.installKind === 'portable' ? ` <span class="tag">${esc(t('portable'))}</span>` : ''}`, esc(t('aboutD')), `<button class="btn sm" id="st-upd">${icon('update')}${esc(t('checkUpdates'))}</button>`)}
      ${row(esc(t('shortcuts')), esc(t('shortcutsD')), '')}
      ${row(esc(t('dataDir')), `<span class="mono selectable">${esc(S.info.dataDir)}</span>`, `<button class="btn sm icon" data-open-path="${esc(S.info.dataDir)}">${icon('folder')}</button>`)}
      ${row(esc(t('airportDb')), esc(t('airportDbD', nf().format(S.info.airports))), '')}
      ${row(esc(t('author')), 'Adam Rędzikowski · <a href="#" id="st-site">redzikowski.com</a> · <a href="#" id="st-mail">kontakt@redzikowski.com</a> · <a href="#" id="st-gh">GitHub</a>', `<button class="btn sm" id="st-coffee">${icon('coffee')}${esc(t('coffee'))}</button>`)}
    </div></div>`;
  $$('[data-swk]', v).forEach((b) => (b.onclick = () => { const k = b.dataset.swk; s[k] = !s[k]; b.classList.toggle('on', s[k]); persist(); }));
  $$('[data-open-path]', v).forEach((b) => (b.onclick = () => opener.openPath(b.dataset.openPath).catch((e) => toast(errMsg(e), 'bad'))));
  $('#st-inst').onchange = async (e) => { s.installationId = e.target.value; s.targetCommunity = ''; await saveSettings(); await refresh(true); };
  const pathField = (id, key) => {
    $(`#${id}`).onchange = async (e) => { s[key] = e.target.value.trim(); await saveSettings(); await refresh(); };
    $(`#${id}-pick`).onclick = async () => { const d = await dlg.open({ directory: true }); if (!d) return; s[key] = d; await saveSettings(); await refresh(); };
  };
  pathField('st-cc', 'customCommunity');
  pathField('st-park', 'parking');
  $('#st-tc') && ($('#st-tc').onchange = async (e) => { s.targetCommunity = e.target.value; await saveSettings(); await refresh(); });
  $('#st-addlib').onclick = pickLibrary;
  $$('[data-sugg]', v).forEach((b) => (b.onclick = async () => {
    try { const lib = await invoke('check_library', { path: b.dataset.sugg }); s.libraries.push(lib); await saveSettings(); await refresh(); toast(t('libraryAdded', lib.name)); } catch (e) { toast(errMsg(e), 'bad'); }
  }));
  $$('[data-lname]', v).forEach((inp) => (inp.onchange = async () => { const l = s.libraries.find((x) => x.id === inp.dataset.lname); l.name = inp.value.trim() || l.name; await saveSettings(); await loadScan(); }));
  $$('[data-rmlib]', v).forEach((b) => (b.onclick = async () => {
    const l = s.libraries.find((x) => x.id === b.dataset.rmlib);
    const st = libStats.get(l.id);
    const linked = st?.enabled || 0;
    if (!(await confirmBox(t('remove'), `<div>${esc(t('removeLibQ', l.name))}</div>${linked ? `<div class="banner warn" style="margin:0">${icon('warn')}<div>${esc(t('removeLibLinked', linked))}</div></div>` : ''}`, t('remove')))) return;
    s.libraries = s.libraries.filter((x) => x.id !== l.id);
    await saveSettings(); await refresh();
  }));
  $('#st-lm').onchange = (e) => { s.linkMode = e.target.value; persist(); };
  $('#st-lp').onchange = (e) => { s.liveryPrompt = e.target.value; persist(); };
  $('#st-map').onchange = (e) => { s.mapStyle = e.target.value; persist(); };
  $('#st-theme').onchange = (e) => { s.theme = e.target.value; applyTheme(); persist(); renderView(); };
  $$('[data-acc]', v).forEach((b) => (b.onclick = () => { s.accent = b.dataset.acc; applyTheme(); persist(); renderView(); }));
  $('#st-lang').onchange = (e) => { s.language = e.target.value; setLang(s.language); persist(); renderRail(); renderView(); };
  $('#st-card').oninput = (e) => { s.cardSize = +e.target.value; applyTheme(); persist(); };
  $('#st-upd').onclick = () => checkUpdate(false);
  $('#st-site').onclick = (e) => { e.preventDefault(); opener.openUrl('https://redzikowski.com'); };
  $('#st-mail').onclick = (e) => { e.preventDefault(); opener.openUrl('mailto:kontakt@redzikowski.com'); };
  $('#st-gh').onclick = (e) => { e.preventDefault(); opener.openUrl('https://github.com/BlackSingularities/FSaddonToolkit'); };
  $('#st-coffee').onclick = () => opener.openUrl('https://buycoffee.to/adamredzikowski');
}
function applyTheme() {
  const s = S.settings;
  let th = s.theme || 'dark';
  if (th === 'auto') th = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = th;
  document.documentElement.dataset.accent = s.accent || 'sky';
  document.documentElement.style.setProperty('--card-w', `${s.cardSize || 240}px`);
}

// ───────────── Kreator pierwszego uruchomienia ─────────────
async function onboarding(onlySuggestions = false) {
  const sc = S.scan;
  const inst = sc?.installation;
  const sugg = sc?.suggestedLibraries || [];
  const body = `
    ${onlySuggestions ? '' : `<div>${esc(t('welcomeD'))}</div>
    <div class="card list">${inst ? `<div class="row">${icon('ok')}<div class="grow"><div class="t">${esc(inst.label)}</div><div class="d mono">${esc(sc.target)}</div></div></div>` : `<div class="row">${icon('warn')}<div class="grow"><div class="t">${esc(t('noSim'))}</div><div class="d">${esc(t('noSimD'))}</div></div></div>`}
      <div class="row">${icon('addons')}<div class="grow"><div class="t">${esc(t('foundInCommunity', sc?.packages.length || 0))}</div><div class="d">${esc(t('foundLinks', (sc?.packages || []).filter((p) => p.link).length))}</div></div></div></div>`}
    ${sugg.length ? `<div><b>${esc(t('suggestedLib'))}</b><div class="faint">${esc(t('suggestedLibIntro'))}</div></div>
      <div class="card list">${sugg.map((x, i) => `<label class="row click" style="gap:10px"><input type="checkbox" data-sg="${i}" checked style="accent-color:var(--acc)"><div class="grow"><div class="t mono" style="font-size:12.5px">${esc(x.path)}</div><div class="d">${esc(t('suggestedLibD', x.links, x.packages))}</div></div></label>`).join('')}</div>` : onlySuggestions ? '' : `<div class="faint">${esc(t('noSuggestions'))}</div>`}`;
  const r = await dialog({
    title: onlySuggestions ? t('suggestedLib') : t('welcome'),
    body,
    wide: true,
    actions: [{ label: onlySuggestions ? t('cancel') : t('skip'), value: null }, ...(sugg.length ? [{ label: t('addSelected'), kind: 'primary', value: (w) => $$('[data-sg]:checked', w).map((i) => sugg[+i.dataset.sg].path) }] : [{ label: t('ok'), kind: 'primary', value: [] }])],
  });
  S.settings.onboarded = true;
  for (const path of r || []) {
    try { S.settings.libraries.push(await invoke('check_library', { path })); } catch (e) { toast(errMsg(e), 'bad'); }
  }
  await saveSettings();
  if (r?.length) { await refresh(); toast(t('librariesAddedN', r.length)); }
}

// ───────────── Aktualizacje ─────────────
async function checkUpdate(silent) {
  try {
    const u = await invoke('check_update');
    if (!u.available) { if (!silent) toast(t('upToDate', S.info.version)); return; }
    const ok = await dialog({
      title: t('updateAvailable', u.latest),
      body: `<div class="muted selectable" style="white-space:pre-wrap;max-height:300px;overflow:auto">${esc(u.notes || '')}</div>`,
      actions: [{ label: t('later'), value: false }, { label: t('changelog'), value: 'web' }, ...(u.canInstall && u.download ? [{ label: t('installUpdate'), kind: 'primary', value: true }] : [])],
    });
    if (ok === 'web') opener.openUrl('https://redzikowski.com/portfolio/fsaddontoolkit');
    if (ok === true) { toast(t('downloading')); await invoke('install_update', { url: u.download }); }
  } catch (e) { if (!silent) toast(errMsg(e), 'bad'); }
}

// ───────────── Przeciąganie plików i skróty ─────────────
function setupDrop() {
  const drop = $('#drop');
  T.webview.getCurrentWebview().onDragDropEvent((e) => {
    const p = e.payload;
    if (p.type === 'enter') { drop.querySelector('h3').textContent = t('dropTitle'); drop.querySelector('.muted').textContent = t('dropHint'); }
    if (p.type === 'enter' || p.type === 'over') drop.hidden = false;
    else if (p.type === 'leave') drop.hidden = true;
    else if (p.type === 'drop') { drop.hidden = true; if (p.paths?.length) installDialog(p.paths); }
  });
}
document.addEventListener('keydown', (e) => {
  if ($('.dialog-wrap')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if (S.sheetId) closeSheet();
    else if (S.view === 'map' && S.mapSelectMode) setSelectMode(false);
    else if (S.view === 'map' && S.mapSel.size) { S.mapSel.clear(); refreshMarkers(); renderMapSide(); }
    else if (S.selecting) { S.selecting = false; S.sel.clear(); renderView(); }
    return;
  }
  // F5 sprawdza tylko zmienione pakiety, Shift+F5 czyta wszystko od nowa.
  if (e.key === 'F5') { e.preventDefault(); refresh(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (S.view !== 'addons') go('addons'); setTimeout(() => $('#q')?.focus(), 30); return; }
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && S.view === 'addons') { e.preventDefault(); S.selecting = true; filtered().forEach((p) => S.sel.add(p.id)); renderView(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    invoke('history').then((h) => { const last = h.find((x) => !x.undone); if (last) undoBatch(last.batch); else toast(t('nothingToUndo'), 'warn'); });
    return;
  }
  if (!e.ctrlKey && !e.altKey && /^[1-8]$/.test(e.key)) go(VIEWS[+e.key - 1][0]);
});
$('#scrim').onclick = closeSheet;
window.addEventListener('focus', debounce(async () => {
  if (!S.scan || $('.dialog-wrap')) return;
  await loadScan();
  renderRail();
  if (['addons', 'dashboard'].includes(S.view) && !document.activeElement?.matches('input')) renderView();
}, 400));

// ───────────── Start ─────────────
(async function init() {
  try {
    [S.info, S.settings, S.installs, S.profiles] = await Promise.all([invoke('app_info'), invoke('get_settings'), invoke('installations'), invoke('get_profiles')]);
  } catch (e) { toast(errMsg(e), 'bad'); }
  setLang(S.settings.language || 'pl');
  S.f.sort = S.settings.sort || 'title';
  applyTheme();
  renderRail();
  renderView();
  setupDrop();
  await loadScan();
  renderRail();
  renderView();
  loadIssues();
  pollStatus();
  setInterval(pollStatus, 15000);
  if (!S.settings.onboarded) onboarding();
  if (S.settings.autoUpdateCheck) setTimeout(() => checkUpdate(true), 4000);
})();
