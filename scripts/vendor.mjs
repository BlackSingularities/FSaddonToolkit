// Kopiuje biblioteki interfejsu do ui/vendor i składa ui/icons.js z ikon Lucide (ISC).
// Uruchamiane ręcznie po zmianie wersji zależności: `npm run vendor`.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..')
const nm = path.join(root, 'node_modules')
const vendor = path.join(root, 'ui', 'vendor')
fs.mkdirSync(path.join(vendor, 'images'), { recursive: true })

const copy = (from, to) => fs.copyFileSync(path.join(nm, from), path.join(vendor, to))
copy('leaflet/dist/leaflet.js', 'leaflet.js')
copy('leaflet/dist/leaflet.css', 'leaflet.css')
for (const f of fs.readdirSync(path.join(nm, 'leaflet/dist/images'))) copy(`leaflet/dist/images/${f}`, `images/${f}`)
// Flagi krajów (flag-icons, MIT) – emoji flag nie wyświetlają się w Windows.
fs.mkdirSync(path.join(vendor, 'flags'), { recursive: true })
for (const f of fs.readdirSync(path.join(nm, 'flag-icons/flags/4x3'))) copy(`flag-icons/flags/4x3/${f}`, `flags/${f}`)

const icons = {
  dashboard: 'layout-dashboard', addons: 'package', map: 'map', profiles: 'layers', official: 'badge-check',
  health: 'heart-pulse', history: 'history', settings: 'settings', aircraft: 'plane', livery: 'paintbrush',
  airport: 'plane-landing', scenery: 'mountain', utility: 'wrench', library: 'library', other: 'shapes',
  all: 'layout-grid', search: 'search', close: 'x', check: 'check', folder: 'folder-open', link: 'link',
  unlink: 'unlink', move: 'folder-input', trash: 'trash-2', star: 'star', lock: 'lock', unlock: 'lock-open',
  refresh: 'refresh-cw', play: 'play', grid: 'layout-grid', list: 'list', plus: 'plus', minus: 'minus',
  download: 'download', upload: 'upload', undo: 'undo-2', warn: 'triangle-alert', error: 'circle-alert',
  info: 'info', ok: 'circle-check', drive: 'hard-drive', power: 'power', filter: 'list-filter',
  sort: 'arrow-down-up', edit: 'pencil', copy: 'copy', zip: 'file-archive', tag: 'tag', note: 'notebook-pen',
  external: 'external-link', update: 'circle-arrow-up', more: 'ellipsis-vertical', layers: 'layers',
  wand: 'wand-sparkles', file: 'file-json', globe: 'globe', select: 'square-check', deselect: 'square',
  chevron: 'chevron-right', back: 'arrow-left', eye: 'eye', eyeoff: 'eye-off', bolt: 'zap', coffee: 'coffee',
  rocket: 'rocket', image: 'image', pin: 'map-pin', target: 'crosshair', sliders: 'sliders-horizontal',
  save: 'save', merge: 'git-merge',
}
let out = '// Wygenerowane przez scripts/vendor.mjs – ikony Lucide (ISC), https://lucide.dev\nexport const ICONS = {\n'
for (const [key, name] of Object.entries(icons)) {
  const svg = fs.readFileSync(path.join(nm, 'lucide-static/icons', `${name}.svg`), 'utf8')
  const body = svg.replace(/<!--.*?-->/gs, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '').trim()
  out += `  ${key}: '${body.replace(/'/g, "\'")}',\n`
}
out += '};\n\nexport function icon(name, cls = \'\') {\n  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.other}</svg>`;\n}\n'
fs.writeFileSync(path.join(root, 'ui', 'icons.js'), out)
console.log(`ui/vendor gotowe, ${Object.keys(icons).length} ikon`)
