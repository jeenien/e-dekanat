// Копирует шрифт Manrope (SIL OFL 1.1) и собирает нужные иконки Lucide (ISC)
// в public/. Запускается вручную: npm run assets. Результат коммитится,
// поэтому на сервере сборка не нужна.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');

const fontDir = path.join(nm, '@fontsource/manrope/files');
for (const subset of ['cyrillic', 'latin']) {
  for (const w of [400, 500, 600, 700, 800]) {
    const f = `manrope-${subset}-${w}-normal.woff2`;
    fs.copyFileSync(path.join(fontDir, f), path.join(root, 'public/fonts', f));
  }
}

const icons = {
  home: 'house', calendar: 'calendar-days', grades: 'graduation-cap', docs: 'file-text',
  bell: 'bell', user: 'circle-user-round', logout: 'log-out', search: 'search', sun: 'sun',
  moon: 'moon', chevronLeft: 'chevron-left', chevronRight: 'chevron-right', plus: 'plus',
  clock: 'clock', map: 'map-pin', teacher: 'user-round', alert: 'triangle-alert',
  check: 'check', checkCircle: 'circle-check', x: 'x', send: 'send-horizontal',
  sparkles: 'sparkles', message: 'message-circle', download: 'download', shield: 'shield-check',
  inbox: 'inbox', arrowRight: 'arrow-right', trend: 'trending-up', trendDown: 'trending-down',
  wallet: 'wallet', book: 'book-open', flame: 'flame', filter: 'list-filter', menu: 'menu',
  info: 'info', calendarPlus: 'calendar-plus', lock: 'lock', monitor: 'monitor-smartphone',
  qr: 'qr-code', briefcase: 'briefcase', megaphone: 'megaphone', refresh: 'refresh-cw',
  eye: 'eye', eyeOff: 'eye-off', copy: 'copy', target: 'target', users: 'users', loader: 'loader-circle',
  coffee: 'coffee', pin: 'pin', printer: 'printer', key: 'key-round', ext: 'external-link', lite: 'feather',
};
const out = {};
for (const [k, name] of Object.entries(icons)) {
  const svg = fs.readFileSync(path.join(nm, 'lucide-static/icons', name + '.svg'), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
  out[k] = inner;
}
fs.writeFileSync(path.join(root, 'public/js/icons.js'),
  '// Сгенерировано scripts/build-assets.js из lucide-static (ISC License, https://lucide.dev)\n' +
  'export const ICONS = ' + JSON.stringify(out, null, 0) + ';\n');
console.log('ok', Object.keys(out).length, 'icons');
