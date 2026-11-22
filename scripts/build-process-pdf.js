// Собирает docs/PROCESS.md со скриншотами в docs/PROCESS.pdf (для отправки на конкурс).
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { chromium } = require('playwright');
const dir = path.join(__dirname, '..', 'docs');
const md = fs.readFileSync(path.join(dir, 'PROCESS.md'), 'utf8');
const font = (w) => `@font-face{font-family:Manrope;font-weight:${w};src:url(../public/fonts/manrope-cyrillic-${w}-normal.woff2)}`;
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
${[400, 600, 800].map(font).join('')}
body{font:12px/1.55 Manrope,sans-serif;color:#121731;max-width:900px;margin:0 auto;padding:0 8px}
h1{font-size:26px;color:#1f3a7a}
h2{font-size:18px;margin-top:28px;border-bottom:2px solid #eceafe;padding-bottom:4px;page-break-after:avoid}h3{font-size:14px;page-break-after:avoid}
table{border-collapse:collapse;width:100%;margin:8px 0;page-break-inside:avoid}td,th{border:1px solid #e4e7f2;padding:5px 7px;vertical-align:top;text-align:left}th{background:#f4f5fb}
blockquote{margin:0;padding:8px 12px;background:#fff6e0;border-radius:8px;color:#7a4b00}
code{background:#f4f5fb;padding:1px 4px;border-radius:4px;font-size:11px}
p:has(img){display:flex;gap:8px;flex-wrap:wrap;page-break-inside:avoid}
img{max-height:430px;max-width:32%;border:1px solid #e4e7f2;border-radius:8px;object-fit:contain;object-position:top}
img[src*="desktop"],img[src*="history"]{max-width:49%;max-height:none}
p:has(img:only-child) img{max-width:100%;max-height:none}
</style></head><body>${marked.parse(md)}</body></html>`;
const tmp = path.join(dir, '_process.html');
fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] }); const p = await b.newPage();
  await p.goto('file://' + tmp); await p.waitForTimeout(500);
  // Скриншоты сняты с плотностью 2x: для PDF ужимаем их в JPEG, чтобы файл весил меньше
  await p.evaluate(async () => {
    for (const img of document.images) {
      await img.decode().catch(() => {});
      const k = Math.min(1, 1100 / img.naturalWidth);
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      img.src = c.toDataURL('image/jpeg', 0.82);
    }
  });
  await p.waitForTimeout(300);
  await p.pdf({ path: path.join(dir, 'PROCESS.pdf'), format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, printBackground: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Орбита — концепт для конкурса · стр. <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
  await b.close(); fs.unlinkSync(tmp);
  console.log('docs/PROCESS.pdf готов');
})();
