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
async function toggle(ids, on, label) {
  ids = ids.filter((id) => { const p = pkgById(id); return p && p.enabled !== on; });
  if (!ids.length) return;
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
    <div class="sim-chip" title="${esc(inst?.label || '')}">
      <span class="sim-dot ${S.status.running ? 'on' : ''}"></span>
      <small>${esc(S.status.running ? t('simRunning') : inst ? `MSFS ${inst.sim}` : t('noSim'))}</small>
      <button class="launch" id="launch" ${!inst || S.status.running ? 'disabled' : ''} title="${esc(t('launch'))}">${icon('play')}</button>
    </div>`;
  $$('.nav-btn', $('#rail')).forEach((b) => (b.onclick = () => go(b.dataset.view)));
  $('#launch').onclick = async () => {
    try { await invoke('launch_sim'); toast(t('launching')); setTimeout(pollStatus, 8000); } catch (e) { toast(errMsg(e), 'bad'); }
  };
}
function go(view) {
  if (S.view === 'map' && view !== 'map') { S.map?.remove(); S.map = null; }
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
  const sizeOn = on.reduce((a, p) => a + p.size, 0);
  const sizeAll = pk.reduce((a, p) => a + p.size, 0);
  topbar(t('nav_dashboard'), inst ? `${esc(inst.label)} · <span class="mono">${esc(sc.target)}</span>` : esc(t('noSim')),
    `<button class="btn" id="d-install">${icon('download')}${esc(t('install'))}</button><button class="btn icon" id="d-refresh" title="${esc(t('refresh'))} (F5)">${icon('refresh')}</button>`);
  if (sc.error) {
    v.innerHTML = `<div class="empty">${icon('warn')}<h3>${esc(t('setupNeeded'))}</h3><div>${esc(sc.error)}</div><button class="btn primary" id="go-set">${icon('settings')}${esc(t('openSettings'))}</button></div>`;
    $('#go-set').onclick = () => go('settings');
    $('#d-refresh').onclick = () => refresh(true);
    $('#d-install').onclick = () => installDialog();
    return;
  }
  const byCat = CATS.map((c) => ({ ...c, all: pk.filter((p) => catOf(p) === c.id), on: on.filter((p) => catOf(p) === c.id) }));
  const issues = S.issues || [];
  const active = S.profiles.find((p) => profileMatch(p) === 1);
  v.innerHTML = `
    ${S.status.running ? `<div class="banner warn">${icon('warn')}<div class="grow">${esc(t('simRunningBanner'))}</div></div>` : ''}
    ${sc.suggestedLibraries.length ? `<div class="banner acc">${icon('library')}<div class="grow">${esc(t('suggestedLibBanner', sc.suggestedLibraries.length))}</div><button class="btn sm primary" id="d-sugg">${esc(t('review'))}</button></div>` : ''}
    <div class="dash-hero">
      <div class="hero-card">
        <div class="muted" style="font-weight:600">${esc(t('activeAddons'))}</div>
        <div class="big">${nf().format(on.length)}<small> / ${nf().format(pk.length)}</small></div>
        <div class="muted">${esc(t('loadedSize', fmtSize(sizeOn), fmtSize(sizeAll)))}${active ? ` · ${esc(t('profile'))}: <b style="color:var(--text)">${esc(active.name)}</b>` : ''}</div>
        <div class="meter">${byCat.filter((c) => c.on.length).map((c) => `<span style="width:${(c.on.length / Math.max(on.length, 1)) * 100}%;background:${c.color}" title="${esc(t('cat_' + c.id))}: ${c.on.length}"></span>`).join('')}</div>
        <div class="legend">${byCat.filter((c) => c.on.length).map((c) => `<span><i style="background:${c.color}"></i>${esc(t('cat_' + c.id))} ${c.on.length}</span>`).join('')}</div>
        <div class="hero-actions">
          <button class="btn primary" id="d-plan">${icon('target')}${esc(t('prepareFlight'))}</button>
          <button class="btn" id="d-light">${icon('bolt')}${esc(t('lightMode'))}</button>
          <button class="btn" id="d-save">${icon('save')}${esc(t('saveAsProfile'))}</button>
        </div>
      </div>
      <div class="card" style="padding:6px 0">
        <div class="section-title" style="margin:10px 16px 6px">${icon('profiles')}${esc(t('quickProfiles'))}<span class="grow"></span><button class="btn sm ghost" id="d-prof">${esc(t('all'))}</button></div>
        <div class="list">${S.profiles.length ? S.profiles.slice(0, 5).map((p) => `<div class="row click" data-prof="${p.id}">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color || PROFILE_COLORS[0]}"></span>
          <div class="grow"><div class="t">${esc(p.name)}</div><div class="d">${p.packages.length} ${esc(plural(p.packages.length, t('pkg1'), t('pkg2'), t('pkg5')))}</div></div>
          ${profileMatch(p) === 1 ? `<span class="tag ok">${icon('check')}${esc(t('active'))}</span>` : `<button class="btn sm" data-apply="${p.id}">${esc(t('apply'))}</button>`}</div>`).join('') : `<div class="row"><div class="grow d" style="white-space:normal">${esc(t('noProfilesHint'))}</div></div>`}</div>
      </div>
    </div>
    <div class="section-title">${icon('layers')}${esc(t('categories'))}</div>
    <div class="stat-grid">${byCat.filter((c) => c.all.length).map((c) => `<div class="stat" data-cat="${c.id}">
      <div class="top">${icon(c.id)}${esc(t('cat_' + c.id))}</div>
      <div class="val">${c.on.length}<small> / ${c.all.length}</small></div>
      <div class="foot">${fmtSize(c.all.reduce((a, p) => a + p.size, 0))}</div></div>`).join('')}</div>
    <div class="dash-cols" style="margin-top:16px">
      <div class="card">
        <div class="section-title" style="margin:14px 16px 6px">${icon('health')}${esc(t('nav_health'))}<span class="grow"></span><button class="btn sm ghost" id="d-health">${esc(t('details'))}</button></div>
        <div class="list">${S.issues === null ? `<div class="row"><div class="grow d">${esc(t('checking'))}</div></div>` : issues.length ? issues.slice(0, 5).map((i) => `<div class="row click" data-go="health">${icon(i.severity === 'error' ? 'error' : i.severity === 'warn' ? 'warn' : 'info')}<div class="grow"><div class="t">${esc(i.title)}</div></div></div>`).join('') : `<div class="row">${icon('ok')}<div class="grow t">${esc(t('allGood'))}</div></div>`}</div>
      </div>
      <div class="card">
        <div class="section-title" style="margin:14px 16px 6px">${icon('drive')}${esc(t('storage'))}</div>
        <div class="list" id="disk-list"></div>
      </div>
    </div>
    <div class="section-title">${icon('history')}${esc(t('recentlyAdded'))}</div>
    <div class="grid">${[...pk].sort((a, b) => b.modified - a.modified).slice(0, 8).map(cardHtml).join('')}</div>`;
  renderDiskList();
  observeThumbs(v);
  bindCards(v);
  $('#d-refresh').onclick = () => refresh(true);
  $('#d-install').onclick = () => installDialog();
  $('#d-plan').onclick = () => { go('map'); setTimeout(() => setMapTab('plan'), 50); };
  $('#d-light').onclick = lightMode;
  $('#d-save').onclick = () => saveCurrentAsProfile();
  $('#d-prof').onclick = () => go('profiles');
  $('#d-health').onclick = () => go('health');
  $('#d-sugg') && ($('#d-sugg').onclick = () => onboarding(true));
  $$('[data-go]', v).forEach((r) => (r.onclick = () => go(r.dataset.go)));
  $$('[data-cat]', v).forEach((c) => (c.onclick = () => { S.f.cat = c.dataset.cat; go('addons'); }));
  $$('[data-apply]', v).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); applyProfile(b.dataset.apply); }));
  $$('[data-prof]', v).forEach((r) => (r.onclick = () => go('profiles')));
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
      const hay = `${p.title} ${p.folder} ${p.creator} ${p.manufacturer} ${p.group} ${p.meta.tags.join(' ')} ${p.meta.note} ${p.airports.map((a) => `${a.icao} ${a.name} ${a.city}`).join(' ')} ${p.aircraft.join(' ')}`.toLowerCase();
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

function badgeIcao(p) {
  if (!p.airports.length) return '';
  const first = p.airports.slice(0, 2).map((a) => `<span class="tag icao ${a.source === 'bgl' ? 'acc' : ''}">${esc(a.icao)}</span>`).join('');
  return first + (p.airports.length > 2 ? `<span class="tag">+${p.airports.length - 2}</span>` : '');
}
function sourceLabel(p) {
  if (p.source === 'library') return p.libraryName + (p.group ? ` / ${p.group}` : '');
  return t('src_' + p.source);
}
function cardHtml(p) {
  const cat = catOf(p);
  const th = p.thumbs[0];
  return `<div class="pkg ${p.enabled ? '' : 'off'} ${S.sel.has(p.id) ? 'sel' : ''}" data-id="${p.id}">
    <div class="thumb">
      <div class="ph">${icon(cat)}</div>
      ${th ? `<img data-src="${esc(th)}" alt="" loading="lazy">` : ''}
      <div class="over"></div>
      <div class="check">${icon('check')}</div>
      <div class="tl">${badgeIcao(p)}${p.meta.locked ? `<span class="tag">${icon('lock')}</span>` : ''}</div>
      <div class="tr"><button class="switch ${p.enabled ? 'on' : ''} ${S.busy.has(p.id) ? 'busy' : ''}" data-sw="${p.id}" title="${esc(p.enabled ? t('disable') : t('enable'))}"></button></div>
      <div class="bl">${icon(p.link ? 'link' : p.source === 'community' ? 'folder' : cat)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sourceLabel(p))}</span></div>
    </div>
    <div class="body">
      <div class="t" title="${esc(p.title)}">${p.meta.favorite ? `<span class="star">★</span> ` : ''}${esc(p.title)}</div>
      <div class="d">${esc(p.creator || p.folder)}</div>
      <div class="m"><span style="color:${catColor(cat)}">●</span><span>${esc(t('cat_' + cat))}</span><span class="grow"></span>${p.version ? `<span>v${esc(p.version)}</span>` : ''}<span>${fmtSize(p.size)}</span></div>
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
  topbar(t('nav_addons'), esc(t('shownOf', list.length, sc.packages.length, on)),
    `<label class="search">${icon('search')}<input id="q" placeholder="${esc(t('searchPh'))}" value="${esc(f.q)}"><kbd>Ctrl F</kbd></label>
     <button class="btn" id="a-install">${icon('download')}${esc(t('install'))}</button>
     <button class="btn icon" id="a-refresh" title="${esc(t('refresh'))} (F5)">${icon('refresh')}</button>`);
  const countCat = (c) => sc.packages.filter((p) => c === 'all' || catOf(p) === c).length;
  const sources = [['all', t('allSources')], ['community', t('src_community')], ...sc.libraries.map((l) => [`lib:${l.id}`, l.name]), ['parking', t('src_parking')], ['external', t('src_external')]]
    .filter(([id]) => id === 'all' || id.startsWith('lib:') || sc.packages.some((p) => p.source === id));
  v.innerHTML = `
    <div class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px">
      <div class="chips cats">${['all', ...CATS.map((c) => c.id)].filter((c) => c === 'all' || countCat(c)).map((c) => `<button class="chip ${f.cat === c ? 'on' : ''}" data-fcat="${c}">${icon(c === 'all' ? 'all' : c)}${esc(c === 'all' ? t('all') : t('cat_' + c))}<span class="n">${countCat(c)}</span></button>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="seg">${[['all', t('all')], ['on', t('enabled')], ['off', t('disabled')]].map(([k, l]) => `<button data-fstate="${k}" class="${f.state === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <select class="inp" id="fsource" style="height:34px;border-radius:999px">${sources.map(([id, l]) => `<option value="${esc(id)}" ${f.source === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <button class="chip ${f.fav ? 'on' : ''}" id="ffav">${icon('star')}${esc(t('favorites'))}</button>
        <span class="grow" style="flex:1"></span>
        <select class="inp" id="fsort" style="height:34px;border-radius:999px">${['title', 'creator', 'size', 'date', 'state', 'category'].map((k) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${esc(t('sort_' + k))}</option>`).join('')}</select>
        <button class="btn sm icon" id="fdir" title="${esc(t('reverse'))}">${icon('sort')}</button>
        <div class="seg"><button data-vw="grid" class="${S.settings.view !== 'list' ? 'on' : ''}" title="${esc(t('gridView'))}">${icon('grid')}</button><button data-vw="list" class="${S.settings.view === 'list' ? 'on' : ''}" title="${esc(t('listView'))}">${icon('list')}</button></div>
        <button class="btn sm ${S.selecting ? 'primary' : ''}" id="fselect">${icon('select')}${esc(t('select'))}</button>
      </div>
    </div>
    <div id="pkglist" class="${S.selecting ? 'selecting' : ''}"></div>`;
  const box = $('#pkglist');
  if (!list.length) {
    box.innerHTML = `<div class="empty">${icon('addons')}<h3>${esc(sc.packages.length ? t('noMatches') : t('noAddons'))}</h3><div>${esc(sc.packages.length ? t('noMatchesHint') : t('noAddonsHint'))}</div></div>`;
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
  $('#a-refresh').onclick = () => refresh(true);
  $('#a-install').onclick = () => installDialog();
  $$('[data-fcat]', v).forEach((b) => (b.onclick = () => { f.cat = b.dataset.fcat; renderView(); }));
  $$('[data-fstate]', v).forEach((b) => (b.onclick = () => { f.state = b.dataset.fstate; renderView(); }));
  $('#fsource').onchange = (e) => { f.source = e.target.value; renderView(); };
  $('#fsort').onchange = (e) => { f.sort = e.target.value; f.dir = 1; S.settings.sort = f.sort; persist(); renderView(); };
  $('#fdir').onclick = () => { f.dir *= -1; renderView(); };
  $('#ffav').onclick = () => { f.fav = !f.fav; renderView(); };
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
async function openSheet(id, keep = false) {
  const p = pkgById(id);
  if (!p) return;
  if (S.sheetId !== id) galleryIdx = 0;
  S.sheetId = id;
  const cat = catOf(p);
  const sh = $('#sheet');
  const m = p.meta;
  const thumbs = p.thumbs;
  const prof = S.profiles.filter((x) => x.packages.includes(p.key));
  const scroll = keep ? $('.sheet-scroll', sh)?.scrollTop || 0 : 0;
  sh.innerHTML = `<div class="sheet-scroll">
    <div class="gallery">${thumbs.length ? `<img id="g-img" alt="">` : `<div class="thumb" style="height:100%"><div class="ph">${icon(cat)}</div></div>`}
      <div class="over"></div>
      ${thumbs.length > 1 ? `<button class="nav prev" id="g-prev">${icon('chevron')}</button><button class="nav next" id="g-next">${icon('chevron')}</button><div class="dots">${thumbs.slice(0, 14).map((_, i) => `<i class="${i === galleryIdx ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      <button class="close" id="sh-close">${icon('close')}</button>
    </div>
    <div class="sheet-head">
      <div class="grow">
        <h2>${esc(p.title)}</h2>
        <div class="muted" style="margin-top:3px">${esc([p.creator, p.manufacturer && p.manufacturer !== p.creator ? p.manufacturer : ''].filter(Boolean).join(' · ') || p.folder)}</div>
        <div class="chips" style="margin-top:10px">
          <span class="tag" style="color:${catColor(cat)}">${icon(cat)}${esc(t('cat_' + cat))}</span>
          <span class="tag ${p.enabled ? 'ok' : ''}">${esc(p.enabled ? t('enabled') : t('disabled'))}</span>
          ${p.link ? `<span class="tag acc">${icon('link')}${esc(t('viaLink'))}</span>` : ''}
          ${m.locked ? `<span class="tag warn">${icon('lock')}${esc(t('locked'))}</span>` : ''}
          ${prof.map((x) => `<span class="tag" style="color:${x.color}">${icon('profiles')}${esc(x.name)}</span>`).join('')}
        </div>
      </div>
      <button class="switch lg ${p.enabled ? 'on' : ''}" data-sw="${p.id}"></button>
    </div>
    <div class="sheet-body">
      <div class="sheet-actions">
        <button class="btn sm ${m.favorite ? 'primary' : ''}" id="s-fav">${icon('star')}${esc(m.favorite ? t('favorite') : t('addFavorite'))}</button>
        <button class="btn sm ${m.locked ? 'primary' : ''}" id="s-lock" title="${esc(t('lockHint'))}">${icon(m.locked ? 'lock' : 'unlock')}${esc(m.locked ? t('locked') : t('lock'))}</button>
        <button class="btn sm" id="s-open">${icon('folder')}${esc(t('openFolder'))}</button>
        <button class="btn sm" id="s-prof">${icon('profiles')}${esc(t('toProfile'))}</button>
        ${p.source !== 'library' && S.settings.libraries.length ? `<button class="btn sm" id="s-move">${icon('move')}${esc(t('moveToLibrary'))}</button>` : ''}
      </div>
      <dl class="kv">
        <dt>${esc(t('colVer'))}</dt><dd class="mono">${esc(p.version || '—')}</dd>
        <dt>${esc(t('colSize'))}</dt><dd>${fmtSize(p.size)} <span class="faint">· ${nf().format(p.files)} ${esc(t('files'))}</span></dd>
        <dt>${esc(t('colSource'))}</dt><dd>${esc(sourceLabel(p))}</dd>
        <dt>${esc(t('folder'))}</dt><dd class="mono">${esc(p.path)}</dd>
        ${p.link ? `<dt>${esc(t('link'))}</dt><dd class="mono">${esc(p.link)}</dd>` : ''}
        <dt>${esc(t('contentType'))}</dt><dd class="mono">${esc(p.contentType || '—')}</dd>
        ${p.minGameVersion ? `<dt>${esc(t('minSim'))}</dt><dd class="mono">${esc(p.minGameVersion)}</dd>` : ''}
        <dt>${esc(t('installed'))}</dt><dd>${fmtDate(p.modified)}</dd>
        <dt>layout.json</dt><dd>${p.hasLayout ? `<span class="tag ok">${icon('check')}OK</span>` : `<span class="tag warn">${esc(t('missing'))}</span> <button class="btn sm" id="s-layout">${esc(t('regenerate'))}</button>`}</dd>
      </dl>
      ${p.airports.length ? `<div class="sheet-section"><h4>${icon('airport')}${esc(t('airports'))} · ${p.airports.length}</h4><div class="mini-map" id="mini-map"></div><div class="apt-list">${p.airports.slice(0, 120).map((a, i) => `<div class="apt" data-apt="${i}"><span class="tag icao ${a.source === 'bgl' ? 'acc' : ''}">${esc(a.icao)}</span><span class="grow">${esc(a.name || '—')}${a.city ? ` <span class="faint">· ${esc(a.city)}</span>` : ''}</span><span class="faint mono">${esc(a.country)}</span></div>`).join('')}</div>${p.airports.some((a) => a.source === 'name') ? `<div class="faint" style="font-size:12px;margin-top:6px">${esc(t('guessedAirports'))}</div>` : ''}</div>` : ''}
      ${p.aircraft.length ? `<div class="sheet-section"><h4>${icon('aircraft')}${esc(t('variants'))} · ${p.aircraft.length}</h4><div class="variants">${p.aircraft.map((a) => `<div>${esc(a)}</div>`).join('')}</div></div>` : ''}
      ${p.dependencies.length ? `<div class="sheet-section"><h4>${icon('merge')}${esc(t('dependencies'))}</h4><div class="apt-list">${p.dependencies.map((d) => { const dep = S.scan.packages.find((x) => x.key === d.name.toLowerCase()); return `<div class="apt" ${dep ? `data-open="${dep.id}"` : ''}><span class="grow mono">${esc(d.name)}</span>${dep ? `<span class="tag ${dep.enabled ? 'ok' : 'warn'}">${esc(dep.enabled ? t('enabled') : t('disabled'))}</span>` : `<span class="tag">${esc(t('notInstalled'))}</span>`}</div>`; }).join('')}</div></div>` : ''}
      <div class="sheet-section" id="dependents"></div>
      <div class="sheet-section"><h4>${icon('tag')}${esc(t('organize'))}</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <select class="inp" id="s-cat"><option value="">${esc(t('autoCategory'))} (${esc(t('cat_' + p.category))})</option>${CATS.map((c) => `<option value="${c.id}" ${m.category === c.id ? 'selected' : ''}>${esc(t('cat_' + c.id))}</option>`).join('')}</select>
          <input class="inp" id="s-tags" placeholder="${esc(t('tagsPh'))}" value="${esc(m.tags.join(', '))}">
        </div>
        <textarea class="inp" id="s-note" rows="2" placeholder="${esc(t('notePh'))}" style="width:100%;margin-top:8px">${esc(m.note)}</textarea>
      </div>
      <div class="sheet-section" id="notes-box"></div>
      <div class="sheet-section"><details><summary>manifest.json</summary><pre class="manifest" id="manifest" style="margin-top:8px">…</pre></details></div>
      <div class="sheet-actions" style="margin-top:22px"><button class="btn sm danger" id="s-trash">${icon('trash')}${esc(t('toTrash'))}</button></div>
    </div></div>`;
  sh.classList.add('show');
  $('#scrim').classList.add('show');
  $('.sheet-scroll', sh).scrollTop = scroll;
  const showImg = async () => {
    const img = $('#g-img');
    if (!img) return;
    const path = thumbs[galleryIdx];
    img.src = thumbCache.get(path) || fileSrc(path);
    $$('.gallery .dots i').forEach((d, i) => d.classList.toggle('on', i === galleryIdx));
  };
  showImg();
  if ($('#g-prev')) {
    $('#g-prev').onclick = () => { galleryIdx = (galleryIdx - 1 + thumbs.length) % thumbs.length; showImg(); };
    $('#g-next').onclick = () => { galleryIdx = (galleryIdx + 1) % thumbs.length; showImg(); };
  }
  $('#sh-close').onclick = closeSheet;
  bindCards(sh);
  $('#s-fav').onclick = () => setMeta(p, { favorite: !m.favorite });
  $('#s-lock').onclick = () => setMeta(p, { locked: !m.locked });
  $('#s-open').onclick = () => opener.openPath(p.path).catch((e) => toast(errMsg(e), 'bad'));
  $('#s-prof').onclick = () => addToProfileDialog([p.id]);
  $('#s-move') && ($('#s-move').onclick = () => relocateDialog([p.id]));
  $('#s-trash').onclick = () => trashDialog([p.id]);
  $('#s-layout') && ($('#s-layout').onclick = async () => {
    try { const n = await invoke('generate_layout', { id: p.id }); toast(t('layoutDone', n)); await refresh(); } catch (e) { toast(errMsg(e), 'bad'); }
  });
  $('#s-cat').onchange = (e) => setMeta(p, { category: e.target.value });
  $('#s-tags').onchange = (e) => setMeta(p, { tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) });
  $('#s-note').onchange = (e) => setMeta(p, { note: e.target.value });
  $$('[data-open]', sh).forEach((el) => (el.onclick = () => openSheet(el.dataset.open)));
  if (p.airports.length && window.L) {
    setTimeout(() => {
      const mm = $('#mini-map');
      if (!mm) return;
      const map = L.map(mm, { zoomControl: false, attributionControl: false });
      tileLayer(S.settings.mapStyle).addTo(map);
      const pts = p.airports.map((a) => [a.lat, a.lon]);
      p.airports.slice(0, 300).forEach((a) => L.marker([a.lat, a.lon], { icon: pin(p.enabled ? 'on' : 'off') }).addTo(map).bindTooltip(a.icao));
      if (pts.length === 1) map.setView(pts[0], 11); else map.fitBounds(pts, { padding: [20, 20], maxZoom: 11 });
      $$('[data-apt]', sh).forEach((el) => (el.onclick = () => { const a = p.airports[+el.dataset.apt]; map.setView([a.lat, a.lon], 13); }));
    }, 60);
  }
  try {
    const d = await invoke('package_details', { id: p.id });
    if (S.sheetId !== id) return;
    $('#manifest').textContent = d.manifest || '—';
    if (d.releaseNotes) $('#notes-box').innerHTML = `<h4>${icon('note')}${esc(t('releaseNotes'))}</h4><div class="muted selectable" style="white-space:pre-wrap;font-size:13px">${esc(d.releaseNotes)}</div>`;
    if (d.dependents.length) {
      $('#dependents').innerHTML = `<h4>${icon('link')}${esc(t('requiredBy'))}</h4><div class="apt-list">${d.dependents.map((x) => pkgById(x)).filter(Boolean).map((x) => `<div class="apt" data-open="${x.id}"><span class="grow">${esc(x.title)}</span><span class="tag ${x.enabled ? 'ok' : ''}">${esc(x.enabled ? t('enabled') : t('disabled'))}</span></div>`).join('')}</div>`;
      $$('#dependents [data-open]').forEach((el) => (el.onclick = () => openSheet(el.dataset.open)));
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
  const dark = style === 'dark' || (style !== 'light' && document.documentElement.dataset.theme === 'dark');
  return L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap' });
}
const pin = (cls) => L.divIcon({ className: '', html: `<div class="apt-pin ${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
let mapTab = 'list';
function setMapTab(tab) { mapTab = tab; renderMapSide(); }

function airportPoints() {
  const pts = [];
  for (const p of S.scan.packages) {
    if (!p.airports.length) continue;
    const list = p.airports.length > 40 ? p.airports.filter((a) => a.source === 'bgl').slice(0, 400) : p.airports;
    for (const a of list) pts.push({ ...a, pkg: p });
  }
  return pts;
}
function viewMap(v) {
  const pts = airportPoints();
  const pkgs = new Set(pts.map((x) => x.pkg.id));
  topbar(t('nav_map'), esc(t('mapSub', pts.length, pkgs.size)),
    `<div class="seg">${[['dark', t('mapDark')], ['light', t('mapLight')], ['osm', 'OSM'], ['satellite', t('mapSat')]].map(([k, l]) => `<button data-ms="${k}" class="${(S.settings.mapStyle || 'dark') === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`);
  v.innerHTML = `<div class="map-wrap"><div id="map"></div><div class="map-side" id="map-side"></div></div>`;
  $$('[data-ms]').forEach((b) => (b.onclick = () => { S.settings.mapStyle = b.dataset.ms; persist(); renderView(); }));
  if (!window.L) { $('#map').innerHTML = `<div class="empty">${icon('map')}<div>Leaflet?</div></div>`; return; }
  S.map?.remove();
  const map = L.map('map', { worldCopyJump: true, preferCanvas: true, zoomControl: true, minZoom: 2 }).setView([50, 15], 4);
  S.map = map;
  tileLayer(S.settings.mapStyle).addTo(map);
  const cluster = L.markerClusterGroup({ maxClusterRadius: 42, showCoverageOnHover: false, chunkedLoading: true });
  S.mapLayers = { cluster, route: L.layerGroup().addTo(map), official: L.layerGroup() };
  for (const a of pts) {
    const m = L.marker([a.lat, a.lon], { icon: pin(a.pkg.enabled ? 'on' : 'off'), title: `${a.icao} · ${a.pkg.title}` });
    m.bindPopup(() => popupHtml(a), { maxWidth: 300 });
    m.on('popupopen', (e) => bindPopup(e.popup, a.pkg));
    cluster.addLayer(m);
  }
  map.addLayer(cluster);
  if (pts.length) map.fitBounds(pts.map((a) => [a.lat, a.lon]), { padding: [30, 30], maxZoom: 8 });
  map.on('moveend', debounce(() => { if (mapTab === 'list') renderMapSide(); }, 150));
  renderMapSide();
  setTimeout(() => map.invalidateSize(), 50);
}
function popupHtml(a) {
  const p = a.pkg;
  return `<div class="pop">${p.thumbs[0] ? `<img src="${esc(thumbCache.get(p.thumbs[0]) || fileSrc(p.thumbs[0]))}" alt="">` : ''}
    <div class="pb"><div class="pt">${esc(p.title)}</div><div class="pd"><span class="mono">${esc(a.icao)}</span> · ${esc(a.name || '')}${a.city ? `, ${esc(a.city)}` : ''}</div>
    <div class="pr"><button class="btn sm" data-pop-open>${esc(t('details'))}</button><span class="grow"></span><button class="switch ${p.enabled ? 'on' : ''}" data-pop-sw></button></div></div></div>`;
}
function bindPopup(popup, p) {
  const el = popup.getElement();
  if (!el) return;
  $('[data-pop-open]', el).onclick = () => openSheet(p.id);
  $('[data-pop-sw]', el).onclick = async (e) => { e.target.classList.add('busy'); await toggle([p.id], !p.enabled); const map = S.map; if (map) { const c = map.getCenter(); const z = map.getZoom(); viewMap($('#view')); S.map.setView(c, z); } };
}
function renderMapSide() {
  const side = $('#map-side');
  if (!side) return;
  side.innerHTML = `<div class="head"><div class="seg" style="align-self:flex-start">
      <button data-mt="list" class="${mapTab === 'list' ? 'on' : ''}">${icon('list')}${esc(t('inView'))}</button>
      <button data-mt="plan" class="${mapTab === 'plan' ? 'on' : ''}">${icon('target')}${esc(t('prepareFlight'))}</button></div></div>
    <div class="scroll" id="map-scroll"></div>`;
  $$('[data-mt]', side).forEach((b) => (b.onclick = () => setMapTab(b.dataset.mt)));
  if (mapTab === 'plan') renderPlan(); else renderInView();
}
function renderInView() {
  const box = $('#map-scroll');
  if (!box || !S.map) return;
  const b = S.map.getBounds();
  const seen = new Map();
  for (const a of airportPoints()) if (b.contains([a.lat, a.lon])) { if (!seen.has(a.pkg.id)) seen.set(a.pkg.id, { p: a.pkg, icaos: [] }); seen.get(a.pkg.id).icaos.push(a.icao); }
  const items = [...seen.values()].sort((x, y) => (y.p.enabled - x.p.enabled) || x.p.title.localeCompare(y.p.title));
  const offIds = items.filter((x) => !x.p.enabled).map((x) => x.p.id);
  const onIds = items.filter((x) => x.p.enabled && !x.p.meta.locked).map((x) => x.p.id);
  box.innerHTML = `<div style="display:flex;gap:6px;padding:10px 16px">
      <button class="btn sm" id="iv-on" ${offIds.length ? '' : 'disabled'}>${icon('power')}${esc(t('enableAllN', offIds.length))}</button>
      <button class="btn sm" id="iv-off" ${onIds.length ? '' : 'disabled'}>${icon('eyeoff')}${esc(t('disableAllN', onIds.length))}</button></div>
    <div class="list">${items.slice(0, 300).map(({ p, icaos }) => `<div class="row click" data-id="${p.id}">
      <div class="grow"><div class="t">${esc(p.title)}</div><div class="d mono">${esc(icaos.slice(0, 5).join(' · '))}${icaos.length > 5 ? ' …' : ''}</div></div>
      <button class="switch ${p.enabled ? 'on' : ''}" data-sw="${p.id}"></button></div>`).join('') || `<div class="row"><div class="grow d">${esc(t('noAirportsInView'))}</div></div>`}</div>`;
  $$('[data-sw]', box).forEach((sw) => (sw.onclick = async (e) => { e.stopPropagation(); const p = pkgById(sw.dataset.sw); const c = S.map.getCenter(); const z = S.map.getZoom(); await toggle([p.id], !p.enabled); if (S.view === 'map') { viewMap($('#view')); S.map.setView(c, z); } }));
  $$('[data-id]', box).forEach((r) => (r.onclick = () => openSheet(r.dataset.id)));
  $('#iv-on').onclick = () => toggle(offIds, true, t('lblMapArea'));
  $('#iv-off').onclick = () => toggle(onIds, false, t('lblMapArea'));
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
    const c = S.map?.getCenter(); const z = S.map?.getZoom();
    await applyChanges(r.enable, r.disable, `${t('lblFlight')} ${[P.dep?.icao, P.arr?.icao].filter(Boolean).join(' → ')}`);
    if (S.view === 'map' && c) { viewMap($('#view')); S.map.setView(c, z); setMapTab('plan'); }
  };
  $('#pl-save').onclick = () => {
    const keys = new Set(S.scan.packages.filter((p) => (p.enabled || r.enable.includes(p.id)) && !r.disable.includes(p.id)).map((p) => p.key));
    saveCurrentAsProfile([...keys], `${S.plan.dep?.icao || ''}${S.plan.arr ? ' → ' + S.plan.arr.icao : ''}`);
  };
}
function drawRoute() {
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
    S.map.fitBounds([[P.dep.lat, P.dep.lon], [P.arr.lat, P.arr.lon]], { padding: [80, 80], maxZoom: 9 });
  } else if (P.dep) S.map.setView([P.dep.lat, P.dep.lon], 8);
}

// ───────────── Profile ─────────────
function profileMatch(prof) {
  if (!S.scan) return 0;
  const on = new Set(S.scan.packages.filter((p) => p.enabled).map((p) => p.key));
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
  const disable = additive ? [] : S.scan.packages.filter((p) => p.enabled && !want.has(p.key) && !p.meta.locked).map((p) => p.id);
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
      `<div><span class="tag ok">+${d.enable.length}</span> <span class="tag bad">−${d.disable.length}</span>${d.missing.length ? ` <span class="tag warn">${esc(t('missingN', d.missing.length))}</span>` : ''}</div>
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
async function saveCurrentAsProfile(keys, suggested = '') {
  const r = await dialog({
    title: t('newProfile'),
    body: `<label class="field">${esc(t('name'))}<input class="inp" id="np-name" value="${esc(suggested)}" placeholder="${esc(t('profileNamePh'))}"></label>
      <label class="field">${esc(t('note'))}<input class="inp" id="np-note"></label>
      <div class="swatches" id="np-col">${PROFILE_COLORS.map((c, i) => `<button style="background:${c}" data-c="${c}" class="${i === 0 ? 'on' : ''}"></button>`).join('')}</div>
      ${S.scan.installation?.contentXml ? `<label class="check-row"><input type="checkbox" id="np-off">${esc(t('includeOfficial'))}</label>` : ''}`,
    actions: [{ label: t('cancel'), value: null }, { label: t('save'), kind: 'primary', value: (w) => ({ name: $('#np-name', w).value.trim(), note: $('#np-note', w).value.trim(), color: $('#np-col .on', w)?.dataset.c, official: $('#np-off', w)?.checked }) }],
    onOpen: (w) => $$('#np-col button', w).forEach((b) => (b.onclick = () => { $$('#np-col button', w).forEach((x) => x.classList.remove('on')); b.classList.add('on'); })),
  });
  if (!r || !r.name) return;
  let officialDisabled = [];
  if (r.official) {
    try { const l = await invoke('official_list'); officialDisabled = l.packages.filter((o) => !o.enabled).map((o) => o.name); } catch { /* bez oficjalnych */ }
  }
  S.profiles.push({ id: '', name: r.name, note: r.note, color: r.color, packages: keys || S.scan.packages.filter((p) => p.enabled).map((p) => p.key), officialDisabled, created: '', updated: '' });
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
        prof.packages = S.scan.packages.filter((p) => p.enabled).map((p) => p.key); prof.updated = '';
        await saveProfiles(); renderView(); toast(t('profileSaved', prof.name));
      }
      if (a === 'edit') {
        const r = await dialog({
          title: t('edit'),
          body: `<label class="field">${esc(t('name'))}<input class="inp" id="ep-name" value="${esc(prof.name)}"></label><label class="field">${esc(t('note'))}<input class="inp" id="ep-note" value="${esc(prof.note || '')}"></label>
            <div class="swatches" id="ep-col">${PROFILE_COLORS.map((c) => `<button style="background:${c}" data-c="${c}" class="${prof.color === c ? 'on' : ''}"></button>`).join('')}</div>`,
          actions: [{ label: t('cancel'), value: null }, { label: t('save'), kind: 'primary', value: (w) => ({ name: $('#ep-name', w).value.trim(), note: $('#ep-note', w).value.trim(), color: $('#ep-col .on', w)?.dataset.c || prof.color }) }],
          onOpen: (w) => $$('#ep-col button', w).forEach((x) => (x.onclick = () => { $$('#ep-col button', w).forEach((y) => y.classList.remove('on')); x.classList.add('on'); })),
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
      ${row(esc(t('autoUpdate')), esc(t('autoUpdateD')), sw('autoUpdateCheck'))}
    </div>
    <div class="card set-card"><h3>${icon('eye')}${esc(t('setLook'))}</h3>
      ${row(esc(t('theme')), '', `<select class="inp" id="st-theme" style="width:200px">${['dark', 'light', 'auto'].map((k) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${esc(t('theme_' + k))}</option>`).join('')}</select>`)}
      ${row(esc(t('accent')), '', `<div class="accent-pick">${['sky', 'amber', 'green', 'violet', 'rose'].map((a) => `<button data-acc="${a}" class="${s.accent === a ? 'on' : ''}" style="background:${{ sky: '#5cc4ff', amber: '#ffc35a', green: '#5fe0a0', violet: '#b7a2ff', rose: '#ff95b5' }[a]}"></button>`).join('')}</div>`)}
      ${row(esc(t('language')), '', `<select class="inp" id="st-lang" style="width:200px"><option value="pl" ${s.language === 'pl' ? 'selected' : ''}>Polski</option><option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option></select>`)}
      ${row(esc(t('cardSize')), '', `<input type="range" id="st-card" min="190" max="360" step="10" value="${s.cardSize || 240}">`)}
    </div>
    <div class="card set-card"><h3>${icon('info')}${esc(t('about'))}</h3>
      ${row(`FS Addon Toolkit ${esc(S.info.version)}${S.info.installKind === 'portable' ? ` <span class="tag">${esc(t('portable'))}</span>` : ''}`, esc(t('aboutD')), `<button class="btn sm" id="st-upd">${icon('update')}${esc(t('checkUpdates'))}</button>`)}
      ${row(esc(t('shortcuts')), esc(t('shortcutsD')), '')}
      ${row(esc(t('dataDir')), `<span class="mono selectable">${esc(S.info.dataDir)}</span>`, `<button class="btn sm icon" data-open-path="${esc(S.info.dataDir)}">${icon('folder')}</button>`)}
      ${row(esc(t('airportDb')), esc(t('airportDbD', nf().format(S.info.airports))), '')}
      ${row(esc(t('author')), 'Adam Rędzikowski · <a href="#" id="st-site">redzikowski.com</a> · <a href="#" id="st-gh">GitHub</a>', `<button class="btn sm" id="st-coffee">${icon('coffee')}${esc(t('coffee'))}</button>`)}
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
  $('#st-theme').onchange = (e) => { s.theme = e.target.value; applyTheme(); persist(); };
  $$('[data-acc]', v).forEach((b) => (b.onclick = () => { s.accent = b.dataset.acc; applyTheme(); persist(); renderView(); }));
  $('#st-lang').onchange = (e) => { s.language = e.target.value; setLang(s.language); persist(); renderRail(); renderView(); };
  $('#st-card').oninput = (e) => { s.cardSize = +e.target.value; applyTheme(); persist(); };
  $('#st-upd').onclick = () => checkUpdate(false);
  $('#st-site').onclick = (e) => { e.preventDefault(); opener.openUrl('https://redzikowski.com'); };
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
    else if (S.selecting) { S.selecting = false; S.sel.clear(); renderView(); }
    return;
  }
  if (e.key === 'F5') { e.preventDefault(); refresh(true); return; }
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
