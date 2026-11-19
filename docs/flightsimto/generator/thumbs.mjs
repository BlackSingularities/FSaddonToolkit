// Stylizowane ilustracje-miniatury dla przykładowych dodatków (SVG 640x400).
// /__img/<kind>/<seed>/<palette>[/<accent hex>]

const PAL = {
  day:     { s1: '#3d7cc9', s2: '#a9d4f2', sun: '#fff4cf', haze: '#d9ecf8', g1: '#5f8a4e', g2: '#3e6435', mt: '#7d9bb8', mt2: '#9fb7cc' },
  golden:  { s1: '#2d4a7a', s2: '#f2b36d', sun: '#ffe1a3', haze: '#f7c98f', g1: '#4a4458', g2: '#2e2a3d', mt: '#6b5a73', mt2: '#8f7486' },
  dusk:    { s1: '#18234a', s2: '#c46d7e', sun: '#ffc2a8', haze: '#d98a8a', g1: '#2a2740', g2: '#1a182c', mt: '#3d3558', mt2: '#5a4a6e' },
  dawn:    { s1: '#6f9bd4', s2: '#f8d3b0', sun: '#fff1dc', haze: '#f6dcc6', g1: '#6c8a5a', g2: '#4a6a40', mt: '#8fa2c4', mt2: '#b6bfd8' },
  alpine:  { s1: '#4f86c6', s2: '#cfe6f7', sun: '#ffffff', haze: '#e6f1f8', g1: '#5d7d58', g2: '#3c5a3c', mt: '#6f86a0', mt2: '#93a7bd' },
  night:   { s1: '#070b1f', s2: '#24305c', sun: '#e8ecff', haze: '#2e3b6b', g1: '#141a33', g2: '#0b0f22', mt: '#1d2547', mt2: '#283260' },
  tropic:  { s1: '#1f8fd1', s2: '#9fe3f2', sun: '#fffbe0', haze: '#c9f1f6', g1: '#2f9e8f', g2: '#1d7a6e', mt: '#3f8f7a', mt2: '#6cb7a0' },
  arctic:  { s1: '#5b7fa8', s2: '#dbe7f0', sun: '#ffffff', haze: '#eef4f8', g1: '#c9d6e0', g2: '#9fb2c3', mt: '#8ea4ba', mt2: '#b7c7d6' },
};

function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function sky(p, r, { stars = false, clouds = 3 } = {}) {
  let out = `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.s1}"/><stop offset="1" stop-color="${p.s2}"/></linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${p.sun}" stop-opacity="1"/><stop offset="0.25" stop-color="${p.sun}" stop-opacity="0.9"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.haze}" stop-opacity="0"/><stop offset="1" stop-color="${p.haze}" stop-opacity="0.75"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e9edf2"/><stop offset="1" stop-color="#b9c2cc"/></linearGradient>
  </defs><rect width="640" height="400" fill="url(#sky)"/>`;
  const sx = 120 + r() * 400; const sy = 70 + r() * 90;
  out += `<circle cx="${sx}" cy="${sy}" r="120" fill="url(#sun)"/>`;
  if (stars) for (let i = 0; i < 70; i++) out += `<circle cx="${(r() * 640).toFixed(1)}" cy="${(r() * 230).toFixed(1)}" r="${(r() * 1.3 + 0.3).toFixed(2)}" fill="#fff" opacity="${(r() * 0.7 + 0.2).toFixed(2)}"/>`;
  for (let i = 0; i < clouds; i++) {
    const cx = r() * 640; const cy = 40 + r() * 140; const w = 70 + r() * 120; const op = stars ? 0.08 : 0.35 + r() * 0.3;
    out += `<g fill="#fff" opacity="${op.toFixed(2)}"><ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${w * 0.16}"/><ellipse cx="${cx + w * 0.25}" cy="${cy - w * 0.1}" rx="${w * 0.45}" ry="${w * 0.17}"/><ellipse cx="${cx - w * 0.3}" cy="${cy - w * 0.05}" rx="${w * 0.35}" ry="${w * 0.12}"/></g>`;
  }
  return out;
}

function ridge(r, y, amp, color, step = 40, snow = false) {
  let d = `M0 400 L0 ${y}`;
  const peaks = [];
  for (let x = 0; x <= 680; x += step) {
    const py = y - r() * amp;
    d += ` L${x} ${py.toFixed(1)}`;
    peaks.push([x, py]);
  }
  d += ' L640 400 Z';
  let out = `<path d="${d}" fill="${color}"/>`;
  if (snow) {
    for (const [x, py] of peaks) if (py < y - amp * 0.6) out += `<path d="M${x - step * 0.32} ${py + amp * 0.18} L${x} ${py} L${x + step * 0.32} ${py + amp * 0.18} L${x + step * 0.12} ${py + amp * 0.13} L${x} ${py + amp * 0.2} L${x - step * 0.12} ${py + amp * 0.12} Z" fill="#fff" opacity="0.92"/>`;
  }
  return out;
}

function airport(seed, pal) {
  const p = PAL[pal] || PAL.day; const r = rng(seed); const night = pal === 'night';
  let s = sky(p, r, { stars: night, clouds: night ? 0 : 3 });
  const hy = 238;
  if (r() > 0.35) s += ridge(r, hy - 4, 70, p.mt2, 55, pal === 'alpine' || pal === 'arctic');
  s += ridge(r, hy, 30, p.mt, 35);
  s += `<rect y="${hy}" width="640" height="${400 - hy}" fill="${p.g1}"/><rect y="${hy}" width="640" height="18" fill="url(#fade)"/>`;
  s += `<path d="M0 400 L0 330 Q320 300 640 335 L640 400 Z" fill="${p.g2}" opacity="0.7"/>`;
  // Terminal i wieża na horyzoncie
  const tx = 40 + r() * 160;
  const bc = night ? '#2c3558' : '#c9d1db'; const gl = night ? '#ffd27a' : '#7fa4c4';
  s += `<rect x="${tx}" y="${hy - 16}" width="170" height="18" fill="${bc}"/><rect x="${tx + 6}" y="${hy - 12}" width="158" height="5" fill="${gl}" opacity="0.8"/>`;
  s += `<rect x="${tx + 190}" y="${hy - 58}" width="8" height="60" fill="${bc}"/><path d="M${tx + 182} ${hy - 58} L${tx + 206} ${hy - 58} L${tx + 202} ${hy - 72} L${tx + 186} ${hy - 72} Z" fill="${gl}"/><rect x="${tx + 184}" y="${hy - 76}" width="20" height="4" fill="${bc}"/>`;
  s += `<rect x="${tx + 420}" y="${hy - 12}" width="110" height="14" fill="${bc}" opacity="0.8"/>`;
  // Pas startowy w perspektywie
  s += `<path d="M300 ${hy + 2} L340 ${hy + 2} L560 400 L80 400 Z" fill="${night ? '#1d2133' : '#3b3f47'}"/>`;
  s += `<path d="M300 ${hy + 2} L304 ${hy + 2} L96 400 L84 400 Z M336 ${hy + 2} L340 ${hy + 2} L556 400 L544 400 Z" fill="#f2f2f2" opacity="0.85"/>`;
  for (let i = 0; i < 9; i++) {
    const t0 = i / 9; const t1 = t0 + 0.045;
    const y0 = hy + 2 + (400 - hy) * t0 ** 1.6; const y1 = hy + 2 + (400 - hy) * t1 ** 1.6;
    const w0 = 1 + 6 * t0 ** 1.6; const w1 = 1 + 6 * t1 ** 1.6;
    s += `<path d="M${320 - w0 / 2} ${y0} L${320 + w0 / 2} ${y0} L${320 + w1 / 2} ${y1} L${320 - w1 / 2} ${y1} Z" fill="#fff" opacity="0.9"/>`;
  }
  for (let k = -5; k <= 5; k++) { if (!k) continue; const x = 320 + k * 30; s += `<path d="M${x - 9} 386 L${x + 9} 386 L${x + 9.5} 400 L${x - 9.5} 400 Z" fill="#fff" opacity="0.9"/>`; }
  if (night) for (let i = 0; i < 14; i++) { const t0 = i / 14; const y = hy + 2 + (400 - hy) * t0 ** 1.6; const w = 20 + 220 * t0 ** 1.6; s += `<circle cx="${320 - w}" cy="${y}" r="${1 + t0 * 3}" fill="#ffd27a"/><circle cx="${320 + w}" cy="${y}" r="${1 + t0 * 3}" fill="#ffd27a"/>`; }
  return s;
}

function plane(cx, cy, sc, color, accent, tilt = -6) {
  const a = accent || '#2f6fd1';
  return `<g transform="translate(${cx} ${cy}) rotate(${tilt}) scale(${sc})">
    <ellipse cx="0" cy="58" rx="200" ry="10" fill="#000" opacity="0"/>
    <path d="M-150 -6 L-205 -88 L-176 -88 L-110 -12 Z" fill="${a}"/>
    <path d="M-170 -2 L-215 14 L-196 16 L-140 6 Z" fill="${a}" opacity="0.9"/>
    <path d="M-185 -16 C-150 -24 140 -26 190 -16 C222 -10 236 0 236 6 C236 14 222 22 190 24 L-140 24 C-170 22 -195 6 -185 -16 Z" fill="url(#metal)"/>
    <path d="M-183 6 C-120 12 150 12 233 8 C230 16 214 22 190 24 L-140 24 C-165 22 -182 14 -183 6 Z" fill="${color}" opacity="0.95"/>
    <path d="M-180 -2 L232 -2 L232 1 L-180 1 Z" fill="${a}" opacity="0.7"/>
    <path d="M196 -10 C206 -10 216 -6 222 -1 L198 -1 Z" fill="#1d2a3c"/>
    ${Array.from({ length: 26 }, (_, i) => `<rect x="${-120 + i * 12}" y="-10" width="5" height="6" rx="2" fill="#2b3a52" opacity="0.8"/>`).join('')}
    <path d="M30 14 L-60 70 L-36 72 L80 16 Z" fill="#c6ced8"/>
    <ellipse cx="0" cy="38" rx="40" ry="13" fill="#d7dde5"/><ellipse cx="38" cy="38" rx="5" ry="12" fill="#3a4556"/>
  </g>`;
}

function aircraft(seed, pal, accent) {
  const p = PAL[pal] || PAL.day; const r = rng(seed);
  let s = sky(p, r, { stars: pal === 'night', clouds: 4 });
  s += ridge(r, 330, 40, p.mt2, 60, pal === 'alpine' || pal === 'arctic');
  s += `<rect y="330" width="640" height="70" fill="${p.g1}" opacity="0.6"/><rect y="300" width="640" height="100" fill="url(#fade)"/>`;
  s += `<g fill="#fff" opacity="0.5"><ellipse cx="${100 + r() * 400}" cy="300" rx="260" ry="22"/></g>`;
  s += plane(330, 190, 1.05, '#e9edf2', accent || '#2f6fd1', -5 - r() * 6);
  return s;
}

function livery(seed, pal, accent) {
  const p = PAL[pal] || PAL.day; const r = rng(seed);
  const a = accent || '#d1462f';
  let s = sky(p, r, { clouds: 2 });
  s += `<rect y="300" width="640" height="100" fill="${p.g2}"/><rect y="300" width="640" height="8" fill="#000" opacity="0.15"/>`;
  // Duży statecznik z logo w zbliżeniu
  s += `<path d="M220 300 L330 40 L470 40 L430 300 Z" fill="${a}"/>`;
  s += `<path d="M232 300 L300 140 L460 140 L452 220 L420 300 Z" fill="#000" opacity="0.12"/>`;
  s += `<circle cx="375" cy="150" r="46" fill="#fff" opacity="0.95"/><path d="M352 168 L375 120 L398 168 L375 156 Z" fill="${a}"/>`;
  s += `<path d="M100 300 C130 270 560 262 640 270 L640 330 L100 330 Z" fill="url(#metal)"/>`;
  s += `<path d="M100 316 C240 306 520 300 640 300 L640 330 L100 330 Z" fill="${a}" opacity="0.9"/>`;
  return s;
}

function scenery(seed, pal) {
  const p = PAL[pal] || PAL.day; const r = rng(seed);
  let s = sky(p, r, { stars: pal === 'night', clouds: pal === 'night' ? 0 : 3 });
  if (seed % 2 === 0) {
    s += ridge(r, 190, 110, p.mt2, 70, true);
    s += ridge(r, 250, 80, p.mt, 50, pal !== 'tropic');
    s += `<rect y="300" width="640" height="100" fill="${pal === 'tropic' ? '#1aa3c2' : '#4f7fa6'}"/>`;
    s += `<rect y="300" width="640" height="100" fill="url(#fade)" opacity="0.6"/>`;
    s += ridge(r, 340, 20, p.g2, 30);
  } else {
    s += ridge(r, 270, 40, p.mt2, 60);
    const night = pal === 'night' || pal === 'dusk';
    for (let i = 0; i < 26; i++) {
      const w = 18 + r() * 26; const h = 40 + r() * 170; const x = i * 25 - 10 + r() * 8;
      const c = night ? '#151b36' : '#5b6f86';
      s += `<rect x="${x}" y="${310 - h}" width="${w}" height="${h + 10}" fill="${c}" opacity="${0.75 + r() * 0.25}"/>`;
      for (let j = 0; j < h / 12; j++) if (r() > 0.45) s += `<rect x="${x + 3 + (j % 2) * 7}" y="${312 - h + j * 12}" width="4" height="5" fill="${night ? '#ffd47a' : '#c6dbee'}" opacity="0.8"/>`;
    }
    s += `<rect y="310" width="640" height="90" fill="${p.g2}"/><rect y="310" width="640" height="4" fill="#fff" opacity="0.1"/>`;
  }
  return s;
}

function utility(seed, pal, accent) {
  const r = rng(seed); const a = accent || '#5cc4ff';
  let s = `<defs><linearGradient id="u" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#141a2b"/><stop offset="1" stop-color="#232c46"/></linearGradient>
    <radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${a}" stop-opacity="0.35"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient></defs>
    <rect width="640" height="400" fill="url(#u)"/><circle cx="420" cy="170" r="260" fill="url(#g)"/>`;
  for (let i = 0; i < 12; i++) s += `<line x1="0" y1="${i * 36}" x2="640" y2="${i * 36}" stroke="#fff" opacity="0.04"/>`;
  s += `<g transform="translate(420 175)"><circle r="92" fill="none" stroke="#fff" stroke-opacity="0.15" stroke-width="14"/><circle r="92" fill="none" stroke="${a}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${360 + r() * 150} 600" transform="rotate(-210)"/>
    <circle r="62" fill="#0e1322"/><rect x="-30" y="-6" width="60" height="12" rx="6" fill="${a}" opacity="0.85"/></g>`;
  for (let i = 0; i < 4; i++) s += `<rect x="60" y="${110 + i * 44}" width="190" height="26" rx="8" fill="#fff" opacity="0.07"/><rect x="60" y="${110 + i * 44}" width="${50 + r() * 140}" height="26" rx="8" fill="${a}" opacity="0.55"/>`;
  return s;
}

function library(seed, pal, accent) {
  const p = PAL[pal] || PAL.day; const r = rng(seed); const a = accent || '#ffc35a';
  let s = sky(p, r, { clouds: 2 });
  s += `<rect y="250" width="640" height="150" fill="${p.g1}"/>`;
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 68 + r() * 10; const y = 250 + (i % 3) * 40 + r() * 10; const w = 42 + r() * 20; const h = 28 + r() * 40;
    const c = ['#c9d1db', a, '#8da2b8', '#e6e2d6'][i % 4];
    s += `<path d="M${x} ${y} l${w} -14 l${w * 0.5} 10 l0 ${h} l-${w} 14 l-${w * 0.5} -10 Z" fill="${c}" opacity="0.92"/><path d="M${x} ${y} l${w * 0.5} 10 l0 ${h} l-${w * 0.5} -10 Z" fill="#000" opacity="0.18"/>`;
  }
  for (let i = 0; i < 14; i++) { const x = r() * 640; const y = 260 + r() * 130; s += `<circle cx="${x}" cy="${y}" r="${8 + r() * 10}" fill="${p.g2}"/>`; }
  return s;
}

export function thumbSvg(kind, seed, pal, accent) {
  const body = ({ airport, aircraft, livery, scenery, utility, library }[kind] || scenery)(seed, pal, accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">${body}</svg>`;
}
