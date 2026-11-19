// Geen inhoud uit een kaart: voor elke kaart (#scherm .kaart) op elk scherm
//   1. een kaart zonder eigen scroll heeft geen verborgen overloop: scrollHeight - clientHeight ≤ 1 px;
//   2. geen zichtbaar onderdeel van de kaart steekt onder de onderrand van de kaart uit (±1 px).
// Op de breedtes rond de breekpunten (721, 800 tot 1050 in stappen van 50, 959, 960, 1023, 1024, 1100, 1280, 1440, 1690) en de hoogtes 844 en 900,
// in de lege echte bouw (gewone ronde) en in de demo (tag @demo, met voorbeeldgegevens).
// Bewust uitgezonderd (gemeld door het stijlteamlid, 16 november): de voet van het scrollende verslagvel op Delen (.verslagvel__voet), de kop van een kaart
// (.kaartkop, .kaartkop__eind: een bewuste negatieve marge) en een overloop van 2 tot 6 px door .kaart__inhoud, .drinkkaart__rij, .drinkkaart__andere
// of .kalkaart__link (hun tikvlak steekt in de binnenruimte van de kaart).
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';

const SCHERMEN = [
  'vandaag', 'dagboek', 'dagboek/week', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht', 'delen',
  'meer', 'meer/instellingen', 'meer/gewicht', 'meer/uitleg', 'meer/profiel', 'meer/favorieten', 'meer/badges', 'meer/meldingen', 'meer/vergrendeling',
];
const BREEDTES = [721, 800, 850, 900, 950, 1000, 1050, 959, 960, 1023, 1024, 1100, 1280, 1440, 1690];
const HOOGTES = [844, 900];

// Meet alle kaarten van het getoonde scherm; geeft een lijst fouten (leeg = goed).
const meetUitloop = (page) =>
  page.evaluate(() => {
    const UITGEZONDERD = '.kaartkop, .kaartkop__eind, .verslagvel__voet';
    const KLEINE_UITLOOP = '.kaart__inhoud, .drinkkaart__rij, .drinkkaart__andere, .kalkaart__link';
    const naamVan = (e) => (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase());
    // Een SVG-onderdeel dat door een clip-path (userSpaceOnUse) binnen zijn svg wordt afgeknipt, is alleen zichtbaar waar het in het clipvak valt: het peil in het glas
    // (.watervulling__peil, src/ui/watervulling.js, BESLISSING 495 e.v.) staat bij 0 procent met zijn 220 hoge vlak ver onder het glas, maar het clipPath van de glasvorm knipt het af.
    // Gemeten wordt dus de onderkant van de doorsnede met het clipvak (de omhullende van de vormen in de clipPath), niet de onderkant van het element zelf.
    // Een element zonder clip-path, of een clipvak dat zelf onder de kaartrand uitsteekt, blijft gewoon een fout.
    const zichtbareOnderkant = (e, r, kaart) => {
      let onder = r.bottom;
      if (!(e instanceof SVGElement)) return onder;
      for (let p = e; p instanceof SVGElement && p !== kaart; p = p.parentElement) {
        const m = /^url\(["']?#(.+?)["']?\)$/.exec(getComputedStyle(p).clipPath);
        const knip = m && document.getElementById(m[1]);
        if (!knip || knip.getAttribute('clipPathUnits') === 'objectBoundingBox') continue;
        const ctm = p.getScreenCTM();
        if (!ctm) continue;
        let klipOnder = -Infinity;
        for (const vorm of knip.children) {
          const b = vorm.getBBox();
          for (const y of [b.y, b.y + b.height]) for (const x of [b.x, b.x + b.width]) klipOnder = Math.max(klipOnder, new DOMPoint(x, y).matrixTransform(ctm).y);
        }
        onder = Math.min(onder, klipOnder);
      }
      return onder;
    };
    const fouten = [];
    for (const k of document.querySelectorAll('#scherm .kaart')) {
      const kr = k.getBoundingClientRect();
      const ks = getComputedStyle(k);
      if (!kr.width || !kr.height || ks.visibility === 'hidden') continue;
      const naam = naamVan(k);
      // 1. verborgen overloop (alleen bij een kaart zonder eigen scroll)
      if (!/auto|scroll/.test(ks.overflowY)) {
        const over = k.scrollHeight - k.clientHeight;
        const klein = over <= 6 && (k.matches(KLEINE_UITLOOP) || k.querySelector(KLEINE_UITLOOP));
        if (over > 1 && !klein) fouten.push(`${naam}: scrollHeight ${k.scrollHeight} - clientHeight ${k.clientHeight} = ${over} px`);
      }
      // 2. een zichtbaar onderdeel onder de onderrand
      const onder = [];
      for (const e of k.querySelectorAll('*')) {
        if (e.closest(UITGEZONDERD)) continue;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || zichtbareOnderkant(e, r, k) <= kr.bottom + 1) continue;
        const s = getComputedStyle(e);
        if (s.visibility === 'hidden' || s.position === 'fixed' || Number(s.opacity) === 0) continue;
        // Wat binnen een knip- of scrollvlak staat (ook de kaart zelf), is buiten dat vlak niet te zien; dat vlak zelf wordt wel gemeten.
        let geknipt = false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).overflowY !== 'visible') {
            geknipt = true;
            break;
          }
          if (p === k) break;
        }
        if (!geknipt) onder.push(`${naamVan(e)} +${Math.round((zichtbareOnderkant(e, r, k) - kr.bottom) * 10) / 10} px`);
      }
      if (onder.length) fouten.push(`${naam}: onder de kaartrand: ${[...new Set(onder)].slice(0, 5).join(', ')}`);
    }
    return fouten;
  });

async function controleer(page, breedte, hoogte) {
  await page.setViewportSize({ width: breedte, height: hoogte });
  await vasteKlok(page);
  const fouten = [];
  for (const route of SCHERMEN) {
    await page.goto('./#/' + route);
    await schermKlaar(page, route);
    for (const f of await meetUitloop(page)) fouten.push(`${route}: ${f}`);
  }
  expect(fouten, `${breedte}x${hoogte}`).toEqual([]);
}

test.use({ isMobile: false, hasTouch: false });

for (const hoogte of HOOGTES) {
  for (const breedte of BREEDTES) {
    test(`geen inhoud uit een kaart, lege echte bouw ${breedte}x${hoogte}`, async ({ page }) => {
      test.setTimeout(120000);
      await controleer(page, breedte, hoogte);
    });
  }
}

test.describe('demo', { tag: '@demo' }, () => {
  for (const hoogte of HOOGTES) {
    for (const breedte of BREEDTES) {
      test(`geen inhoud uit een kaart, demo ${breedte}x${hoogte}`, async ({ page }) => {
        test.setTimeout(120000);
        await controleer(page, breedte, hoogte);
      });
    }
  }
});
