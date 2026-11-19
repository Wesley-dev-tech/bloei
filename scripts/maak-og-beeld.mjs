// Maakt het Open Graph-beeld van de demo (BESLISSING 364): 1200x630, het beeldmerk van Bloei op porselein, met de naam eronder.
// Draaien: node scripts/maak-og-beeld.mjs  →  demo-publiek/og-bloei.png (vite.config.js zet het alleen in een demobouw).
// Net als scripts/kopieer-pwa.mjs tekent een browser van Playwright het beeld: geen extra afhankelijkheid. Het lettertype komt uit fonts/.
// Een schermafdruk van Playwright bevat geen metadata (geen pad, geen naam, geen herkomststempel).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const wortel = join(import.meta.dirname, '..');
const BREED = 1200;
const HOOG = 630;
// Een beeld kent geen CSS-variabelen van de app: de kleuren staan hier als hex, gelijk aan bloei-huisstijl/tokens.css
// (--c-bg Porselein en --c-text) (HUISSTIJL §9).
const PORSELEIN = '#FBF7F4';
const TEKST = '#3B2A3C';

const svg = readFileSync(join(wortel, 'bloei-huisstijl', 'logo', 'bloei-mark.svg'), 'utf8')
  .replace(/\s+xmlns:c2pa="[^"]*"/g, '')
  .replace(/<metadata>[\s\S]*?<\/metadata>\s*/g, '');
const merk = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const letter = 'data:font/woff2;base64,' + readFileSync(join(wortel, 'fonts', 'cormorant-garamond-500.woff2')).toString('base64');

const html = `<!doctype html><style>
@font-face { font-family: "Cormorant Garamond"; src: url("${letter}") format("woff2"); font-weight: 500; }
html, body { margin: 0; width: ${BREED}px; height: ${HOOG}px; overflow: hidden; background: ${PORSELEIN}; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
img { width: 260px; height: 260px; display: block; }
p { margin: 0; font-family: "Cormorant Garamond", serif; font-weight: 500; font-size: 96px; line-height: 1; color: ${TEKST}; letter-spacing: .01em; }
</style><img src="${merk}" alt=""><p>Bloei</p>`;

const uitMap = join(wortel, 'demo-publiek');
mkdirSync(uitMap, { recursive: true });

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const pagina = await browser.newPage({ viewport: { width: BREED, height: HOOG }, deviceScaleFactor: 1 });
await pagina.setContent(html);
await pagina.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
await pagina.screenshot({ path: join(uitMap, 'og-bloei.png'), type: 'png' });
await browser.close();
console.log('demo-publiek/og-bloei.png: 1200x630 getekend');
