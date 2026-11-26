// BESLISSING 660 tot 664: het welkomscherm volgt in elke weergave dezelfde vaste regels. Per maat en per stap (1 tot 4, het cijferblok en de herstelcode):
// - alles staat binnen de zichtbare hoogte (geen scroll), met evenveel ruimte boven als onder de kaart (1 px marge);
// - de kaart is in elke stap even hoog (BESLISSING 512) en de inhoud van de actieve stap staat in het midden (even veel lucht boven als onder);
// - tussen de delen van de kaart (kop, stapaanduiding, stappen, knoppen) overal dezelfde tussenruimte;
// - dezelfde soort tekst en knop heeft op elke stap dezelfde maat: de vraag, de uitleg, de hoofdknop, de tekstknoppen;
// - "Verder" staat alleen en is gevuld; "Vergrendeling instellen" en "Nu niet" zijn een groep: even breed, even hoog, samen in het midden, in dezelfde zachte tint;
// - geen tikvlak onder 44 px, niets buiten de kaart (ook "Annuleren" bij het cijferblok niet).
// BESLISSING 669: binnen een stap overal dezelfde tussenruimte (16 px, op de compacte maten 8 px): vraag, uitleg, bediening en knoppen.
// BESLISSING 670: de kortere deelstappen (het cijferblok, de herstelcode, "Dat lukte niet") staan in het midden: lucht boven en onder hoogstens 2 px verschil.
// BESLISSING 668: op Android staat "Vingerafdruk" in het keuzevak, op een regel; stap 4 past zonder scrollen op 320x480 en 360x560.
// De liggende telefoon (844x390, 667x375, 568x320) in twee kolommen: onderaan, in iPhone- en Android-tekst.
// De staande maten zijn gemeten met de tekst van een iPhone (Face ID).
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { authenticator } from './slot-hulp.js';

const LEEG = { cookies: [], origins: [] };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CODE = '123456';

// [breedte, hoogte, soort, de tussenruimte tussen de delen van de kaart]
const MATEN = [
  [320, 480, 'telefoon', 8], [360, 560, 'telefoon', 8], [445, 580, 'telefoon', 8], [390, 660, 'telefoon', 16], [390, 844, 'telefoon', 16],
  [820, 1180, 'tablet', 16], [1180, 820, 'tablet', 16],
  [1280, 800, 'desktop', 16], [1440, 900, 'desktop', 16], [1690, 1230, 'desktop', 16],
  [1280, 560, 'laag', 8], [1024, 560, 'laag', 8],
];

const verder = (page) => page.locator('.welkom__knoppen .knop--primair');
async function tik(page, code) {
  for (const c of code) await page.locator(`.welkom .cijferblok__toets[data-cijfer="${c}"]`).click();
}

// Alles wat de regels nodig hebben, in een keer uit de pagina.
function lees() {
  const zicht = (e) => {
    if (!e || !e.getClientRects().length) return false;
    for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const r = (e) => e.getBoundingClientRect();
  const kaart = document.querySelector('.welkom__kaart');
  const k = r(kaart);
  // de vakken van de kaart, door de houders heen die niet meetellen (display: contents)
  const plat = (o) => [...o.children].flatMap((e) => (getComputedStyle(e).display === 'contents' ? plat(e) : [e]));
  const vakken = plat(kaart).filter(zicht).map((e) => ({ kls: String(e.className).split(' ')[0], top: r(e).top, bottom: r(e).bottom }));
  const stap = document.querySelector('.welkom__stap.is-actief');
  const stappen = document.querySelector('.welkom__stappen').getBoundingClientRect();
  // elk deel met zijn marge (de marge van de bediening hoort bij de stap)
  const delen = [...stap.querySelectorAll(':scope > *')].filter(zicht).map((e) => { const b = r(e), s = getComputedStyle(e); return { top: b.top - parseFloat(s.marginTop), bottom: b.bottom + parseFloat(s.marginBottom) }; });
  const knop = (e) => ({ tekst: e.textContent.trim(), x: r(e).left, w: r(e).width, h: r(e).height, fs: getComputedStyle(e).fontSize, bg: getComputedStyle(e).backgroundColor });
  const knoppen = [...document.querySelectorAll('.welkom__knoppen > .knop')].filter(zicht).map(knop);
  const tekstknoppen = [...document.querySelectorAll('.welkom__rij .knop')].filter(zicht).map(knop);
  const fs = (sel) => { const e = stap.querySelector(sel); return e && zicht(e) ? getComputedStyle(e).fontSize : null; };
  const tikbaar = [...kaart.querySelectorAll('button, input, [role="radio"]')].filter(zicht).map((e) => ({ tekst: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30), h: r(e).height, w: r(e).width }));
  const buiten = [...kaart.querySelectorAll('*')].filter(zicht).filter((e) => { const b = r(e); return b.height > 1 && b.width > 1 && (b.bottom > k.bottom + 0.5 || b.top < k.top - 0.5 || b.right > k.right + 0.5 || b.left < k.left - 0.5); }).map((e) => e.textContent.trim().slice(0, 30) || e.className);
  return {
    vp: { w: innerWidth, h: innerHeight },
    scroll: { h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth },
    kaart: { top: k.top, bottom: k.bottom, left: k.left, right: k.right, h: k.height },
    vakken,
    lucht: delen.length ? { boven: delen[0].top - stappen.top, onder: stappen.bottom - delen[delen.length - 1].bottom } : null,
    // de tussenruimtes binnen de stap (vraag, uitleg, bediening) en van de bediening tot de knoppen
    binnen: delen.slice(1).map((d, i) => d.top - delen[i].bottom),
    totKnoppen: delen.length ? r(document.querySelector('.welkom__knoppen')).top - delen[delen.length - 1].bottom : null,
    knoppen,
    tekstknoppen,
    fs: { vraag: fs('.welkom__vraag'), hint: fs('.welkom__hint') },
    tikbaar,
    buiten,
  };
}

for (const [breed, hoog, soort, ruimte] of MATEN) {
  const mobiel = soort === 'telefoon' || soort === 'tablet';
  test.describe(`Welkom ${breed}x${hoog} (${soort})`, () => {
    test.use({ storageState: LEEG, viewport: { width: breed, height: hoog }, isMobile: mobiel, hasTouch: mobiel, ...(mobiel ? { userAgent: IPHONE_UA } : {}) });
    test.beforeEach(async ({ page }) => vasteKlok(page));

    test('elke stap past, even hoog, met dezelfde tussenruimtes, letter- en knopmaten', async ({ page }) => {
      await authenticator(page, 'ok');
      await page.goto('./');
      await expect(page).toHaveURL(/#\/welkom$/);
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      const standen = {};
      const meet = async (naam) => {
        await animatiesKlaar(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        standen[naam] = await page.evaluate(lees);
      };
      await meet('stap 1');
      for (const n of [2, 3, 4, 5]) {
        await verder(page).click();
        await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
        await meet(`stap ${n}`);
      }
      await page.getByRole('radio', { name: /^Face ID/ }).click();
      await verder(page).click();
      await expect(page.locator('.welkom .cijferblok')).toBeVisible();
      await meet('cijferblok');
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(page.locator('[data-herstelstap]')).toBeVisible();
      await meet('herstelcode');
      // "Dat lukte niet": de vraag van het toestel mislukt na de code (Annuleren brengt haar eerst terug bij de keuze)
      await page.locator('[data-herstelstap]').getByRole('button', { name: 'Annuleren' }).click();
      await expect(page.locator('.welkom__knoppen')).toBeVisible();
      await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
      await page.getByRole('radio', { name: /^Face ID/ }).click();
      await verder(page).click();
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
      await meet('Dat lukte niet');

      const h1 = standen['stap 1'].kaart.h;
      for (const [naam, s] of Object.entries(standen)) {
        const w = `${breed}x${hoog} ${naam}`;
        // in beeld, zonder scroll, evenveel ruimte boven als onder
        expect.soft(s.scroll.h, `${w}: geen verticale scroll`).toBeLessThanOrEqual(s.vp.h + 1);
        expect.soft(s.scroll.w, `${w}: geen horizontale scroll`).toBeLessThanOrEqual(s.vp.w);
        expect.soft(s.kaart.top, `${w}: kaart begint in beeld`).toBeGreaterThanOrEqual(0);
        expect.soft(s.kaart.bottom, `${w}: kaart eindigt in beeld`).toBeLessThanOrEqual(s.vp.h + 0.5);
        expect.soft(Math.abs(s.kaart.top - (s.vp.h - s.kaart.bottom)), `${w}: evenveel ruimte boven als onder`).toBeLessThanOrEqual(1);
        expect.soft(Math.abs(s.kaart.left - (s.vp.w - s.kaart.right)), `${w}: evenveel ruimte links als rechts`).toBeLessThanOrEqual(1);
        // even hoog in elke stap (BESLISSING 512) en niets buiten de kaart
        expect.soft(Math.abs(s.kaart.h - h1), `${w}: kaart even hoog als in stap 1`).toBeLessThanOrEqual(1);
        expect.soft(s.buiten, `${w}: niets buiten de kaart`).toEqual([]);
        // dezelfde tussenruimte tussen alle delen van de kaart
        for (let i = 1; i < s.vakken.length; i++) {
          const tussen = s.vakken[i].top - s.vakken[i - 1].bottom;
          expect.soft(Math.abs(tussen - ruimte), `${w}: ruimte tussen ${s.vakken[i - 1].kls} en ${s.vakken[i].kls} (${tussen.toFixed(1)})`).toBeLessThanOrEqual(1);
        }
        // de inhoud van een kortere stap staat in het midden: evenveel lucht boven als onder (de enige lege ruimte); BESLISSING 670: ook in de deelstappen
        const deelstap = !naam.startsWith('stap');
        if (s.lucht) expect.soft(Math.abs(s.lucht.boven - s.lucht.onder), `${w}: lucht boven en onder de stap`).toBeLessThanOrEqual(deelstap ? 2 : 1);
        if (deelstap) expect.soft(s.lucht, `${w}: de deelstap staat in het midden`).not.toBeNull();
        // geen tikvlak onder 44 px
        for (const t of s.tikbaar) expect.soft(t.h, `${w}: tikvlak "${t.tekst}"`).toBeGreaterThanOrEqual(44);
      }

      // BESLISSING 669: in de hoogste stap (4, zonder lucht) overal dezelfde tussenruimte: vraag, uitleg, bediening en de knoppen
      const s4 = standen['stap 5'];
      expect.soft(s4.binnen.length, `${breed}x${hoog}: vraag, uitleg en bediening`).toBe(2);
      for (const [i, tussen] of [...s4.binnen, s4.totKnoppen].entries()) {
        expect.soft(Math.abs(tussen - ruimte), `${breed}x${hoog}: tussenruimte ${i + 1} in stap 4 (${tussen.toFixed(1)})`).toBeLessThanOrEqual(1);
      }

      // dezelfde soort tekst en knop heeft op elke stap dezelfde maat
      const stappen = [1, 2, 3, 4, 5].map((n) => standen[`stap ${n}`]);
      for (const deel of ['vraag', 'hint']) expect.soft(new Set(stappen.map((s) => s.fs[deel])).size, `${breed}x${hoog}: lettermaat ${deel} in elke stap gelijk`).toBe(1);
      const hoofd = stappen.slice(0, 3).map((s) => s.knoppen);
      for (const k of hoofd) expect.soft(k.length, `${breed}x${hoog}: in stap 1 tot 3 staat Verder alleen`).toBe(1);
      expect.soft(new Set(hoofd.map((k) => Math.round(k[0].w))).size, `${breed}x${hoog}: Verder even breed in stap 1 tot 3`).toBe(1);
      const paar = standen['stap 5'].knoppen;
      expect.soft(paar.length).toBe(2);
      expect.soft(Math.abs(paar[0].w - paar[1].w), `${breed}x${hoog}: Vergrendeling instellen en Nu niet even breed`).toBeLessThanOrEqual(1);
      const k4 = standen['stap 5'].kaart;
      const links = paar[0].x - k4.left;
      const rechts = k4.right - (paar[1].x + paar[1].w);
      expect.soft(Math.abs(links - rechts), `${breed}x${hoog}: de groep staat in het midden`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(paar[0].h - hoofd[0][0].h), `${breed}x${hoog}: de knoppen van stap 4 even hoog als Verder`).toBeLessThanOrEqual(1);
      expect.soft(paar[0].bg, `${breed}x${hoog}: de groep heeft dezelfde tint`).toBe(paar[1].bg);
      expect.soft(hoofd[0][0].bg, `${breed}x${hoog}: Verder alleen is gevuld, niet de zachte tint van de groep`).not.toBe(paar[0].bg);
      expect.soft(new Set([...hoofd.map((k) => k[0].fs), ...paar.map((k) => k.fs)]).size, `${breed}x${hoog}: knoppen in dezelfde lettermaat`).toBe(1);
      const tekst = stappen.flatMap((s) => s.tekstknoppen);
      expect.soft(new Set(tekst.map((k) => k.fs)).size, `${breed}x${hoog}: Terug en Overslaan in dezelfde lettermaat`).toBe(1);
    });
  });
}

// ===================================================================== Android-tekst op de laagste staande telefoons (BESLISSING 668)
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
for (const [breed, hoog] of [[320, 480], [360, 560]]) {
  test.describe(`Welkom ${breed}x${hoog} (Android)`, () => {
    test.use({ storageState: LEEG, viewport: { width: breed, height: hoog }, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
    test.beforeEach(async ({ page }) => vasteKlok(page));

    test('stap 5 past zonder scrollen en "Vingerafdruk" staat op een regel in zijn keuzevak', async ({ page }) => {
      await authenticator(page, 'ok');
      await page.goto('./');
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      for (const n of [2, 3, 4, 5]) {
        await verder(page).click();
        await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
      }
      const bio = page.getByRole('radio', { name: /^Vingerafdruk/ });
      await expect(bio.locator('.slot__optielabel')).toHaveText('Vingerafdruk');
      await animatiesKlaar(page);
      const s = await page.evaluate(() => {
        const label = document.querySelector('.slot__optie[data-methode="faceid"] .slot__optielabel');
        const opties = [...document.querySelectorAll('.welkom__stap.is-actief .slot__optie')].map((e) => e.getBoundingClientRect().height);
        const k = document.querySelector('.welkom__kaart').getBoundingClientRect();
        return { regels: label.getClientRects().length, opties, kaart: { top: k.top, bottom: k.bottom }, scrollH: document.documentElement.scrollHeight, vpH: innerHeight };
      });
      expect.soft(s.regels, `${breed}x${hoog}: "Vingerafdruk" op een regel`).toBe(1);
      expect.soft(Math.max(...s.opties), `${breed}x${hoog}: de keuzes zijn niet hoger dan een tikvlak`).toBeLessThanOrEqual(44.5);
      expect.soft(s.scrollH, `${breed}x${hoog}: geen verticale scroll`).toBeLessThanOrEqual(s.vpH + 1);
      expect.soft(s.kaart.top, `${breed}x${hoog}: kaart begint in beeld`).toBeGreaterThanOrEqual(0);
      expect.soft(s.kaart.bottom, `${breed}x${hoog}: kaart eindigt in beeld`).toBeLessThanOrEqual(s.vpH + 0.5);
    });
  });
}

// ===================================================================== De liggende telefoon: twee kolommen (BESLISSING 667, de regels van 660 tot 662)
// Per maat, in iPhone- en Android-tekst, in elke stap en deelstap, met en zonder melding:
// - alles in beeld zonder scroll, evenveel ruimte boven als onder de kaart en het blok in de kaart;
// - twee kolommen van gelijke breedte (met het cijferblok rechts: 228 px) met 32 px ertussen, samen in het midden; beide op dezelfde middenlijn;
// - 8 px tussen alle delen van een kolom (in stap 1 tot 3 staat de kortere stap in het midden van haar vak);
// - elke brede knop vult zijn kolom (het paar van stap 4 samen); dezelfde lettermaat op elke stap; geen tikvlak onder 44 px.
const LIGGEND = [[844, 390], [667, 375], [568, 320]];

function liggend() {
  const zicht = (e) => {
    if (!e || !e.getClientRects().length) return false;
    for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    const b = e.getBoundingClientRect();
    return b.width > 1 && b.height > 1 && getComputedStyle(e).position !== 'absolute';
  };
  const r = (e) => e.getBoundingClientRect();
  const kaart = document.querySelector('.welkom__kaart');
  const k = r(kaart);
  const ks = getComputedStyle(kaart);
  const binnen = { l: k.left + parseFloat(ks.paddingLeft), r: k.right - parseFloat(ks.paddingRight), t: k.top + parseFloat(ks.paddingTop), b: k.bottom - parseFloat(ks.paddingBottom) };
  const kolommen = ks.gridTemplateColumns.split(' ').map(parseFloat);
  const tussen = parseFloat(ks.columnGap);
  const begin = binnen.l + (binnen.r - binnen.l - (kolommen[0] + tussen + kolommen[1])) / 2;
  const grens = begin + kolommen[0] + tussen / 2;
  const deel = (e) => { const b = r(e); return { tekst: (e.textContent || e.className).trim().slice(0, 24), l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, fs: getComputedStyle(e).fontSize }; };
  const SEL = ['.welkom__kop .logo', '.welkom__titel', '.welkom__intro', '.welkom__bolletjes', '.welkom__staptekst',
    '.welkom__stap.is-actief > .welkom__vraag', '.welkom__stap.is-actief > .welkom__hint', '.welkom__stap.is-actief .welkom__naamveld', '.welkom__stap.is-actief .stapper', '.welkom__stap.is-actief .weegdagen',
    '.welkom__stap.is-actief .slot__keuze', '.welkom__stap.is-actief .welkom__slot > p',
    // de zin onder de keuzes houdt haar plaats als de melding er staat (dezelfde plek, BESLISSING 660 tot 664): ze telt mee als vak
    '.welkom__stap.is-actief .welkom__slot > .welkom__slotlater',
    '.welkom__knoppen > .knop', '.welkom__rij',
    '.welkom__slotvak > .slot__instel > :is(p, h2, .knop, .cijferblok)', '.welkom__slotvak .slot__kant > *', '.welkom__slotvak .herstel__keuze > .knop'];
  const plaats = (e) => e.matches('.welkom__slotlater') && zicht(e.parentElement) && r(e).height > 1;
  const delen = [...new Set(SEL.flatMap((s) => [...document.querySelectorAll(s)]))].filter((e) => zicht(e) || plaats(e)).map(deel);
  const links = delen.filter((d) => d.l < grens).sort((a, b) => a.t - b.t);
  const rechts = delen.filter((d) => d.l >= grens).sort((a, b) => a.t - b.t);
  // de tussenruimtes tussen de rijen van een kolom (delen naast elkaar vormen een rij)
  const ruimtes = (lijst) => {
    const rijen = [];
    for (const d of lijst) {
      const rij = rijen.find((x) => d.t < x.b - 1 && d.b > x.t + 1);
      if (rij) { rij.t = Math.min(rij.t, d.t); rij.b = Math.max(rij.b, d.b); } else rijen.push({ t: d.t, b: d.b });
    }
    return rijen.slice(1).map((x, i) => +(x.t - rijen[i].b).toFixed(1));
  };
  const blok = (lijst) => ({ t: Math.min(...lijst.map((d) => d.t)), b: Math.max(...lijst.map((d) => d.b)), l: Math.min(...lijst.map((d) => d.l)), r: Math.max(...lijst.map((d) => d.r)) });
  const code = kaart.classList.contains('is-code');
  // in een gewone stap zijn de twee houders de kolommen; in een deelstap de delen zelf
  const kol = (sel, lijst) => (code ? blok(lijst) : (({ top, bottom, left, right }) => ({ t: top, b: bottom, l: left, r: right }))(r(document.querySelector(sel))));
  const L = kol('.welkom__kol--links', links);
  const R = kol('.welkom__kol--rechts', rechts);
  const stappen = document.querySelector('.welkom__stappen');
  const stapDelen = [...document.querySelectorAll('.welkom__stap.is-actief > *')].filter(zicht).map((e) => r(e));
  const fs = (sel) => { const e = [...document.querySelectorAll(sel)].find(zicht); return e ? getComputedStyle(e).fontSize : null; };
  const buiten = [...kaart.querySelectorAll('*')].filter(zicht).filter((e) => { const b = r(e); return b.bottom > k.bottom + 0.5 || b.top < k.top - 0.5 || b.right > k.right + 0.5 || b.left < k.left - 0.5; }).map((e) => e.textContent.trim().slice(0, 30) || e.className);
  const tikbaar = [...kaart.querySelectorAll('button, input:not([type="checkbox"]), [role="radio"], .vinkvak')].filter(zicht).map((e) => ({ tekst: (e.textContent || e.tagName).trim().slice(0, 30), h: r(e).height }));
  return {
    vp: { w: innerWidth, h: innerHeight },
    scroll: { h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth },
    kaart: { t: k.top, b: k.bottom, l: k.left, r: k.right, h: k.height },
    binnen,
    kolommen,
    tussen,
    begin,
    code,
    L,
    R,
    links: ruimtes(links),
    rechts: ruimtes(rechts),
    rechtsDelen: rechts.length,
    lucht: !code && stapDelen.length ? { boven: stapDelen[0].top - r(stappen).top, onder: r(stappen).bottom - stapDelen[stapDelen.length - 1].bottom } : null,
    knoppen: [...document.querySelectorAll('.welkom__knoppen > .knop, .welkom__slotvak .slot__kant > .knop--breed, .welkom__slotvak .herstel__keuze > .knop')].filter(zicht).map(deel),
    letter: { titel: fs('.welkom__titel'), intro: fs('.welkom__intro'), vraag: fs('.welkom__stap.is-actief > .welkom__vraag'), hint: fs('.welkom__stap.is-actief > .welkom__hint'), tekst: fs('.welkom__kaart.is-code .welkom__slotvak > .slot__instel > :is(.slot__uitleg, .slot__eerlijk)') },
    buiten,
    tikbaar,
  };
}

for (const [breed, hoog] of LIGGEND) {
  for (const [toestel, ua, methode] of [['iPhone', IPHONE_UA, /^Face ID/], ['Android', ANDROID_UA, /^Vingerafdruk/]]) {
    test.describe(`Welkom liggend ${breed}x${hoog} (${toestel})`, () => {
      test.use({ storageState: LEEG, viewport: { width: breed, height: hoog }, isMobile: true, hasTouch: true, userAgent: ua });
      test.beforeEach(async ({ page }) => vasteKlok(page));

      test('twee kolommen: in beeld, even breed, op dezelfde middenlijn, 8 px ertussen, knoppen vullen hun kolom', async ({ page }) => {
        await authenticator(page, 'ok');
        await page.goto('./');
        await expect(page).toHaveURL(/#\/welkom$/);
        const standen = {};
        const meet = async (naam) => {
          await animatiesKlaar(page);
          await page.evaluate(() => window.scrollTo(0, 0));
          standen[naam] = await page.evaluate(liggend);
        };
        const zet = (sel, tekst) => page.evaluate(([s, t]) => { document.querySelector(s).textContent = t; }, [sel, tekst]);
        // stap 1 met de melding onder het veld, dan ingevuld
        await page.getByRole('textbox', { name: 'Je naam' }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#welkom-naamhint')).not.toBeEmpty();
        await meet('stap 1 met melding');
        await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
        await meet('stap 1');
        for (const n of [2, 3, 4, 5]) {
          await verder(page).click();
          await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
          await meet(`stap ${n}`);
        }
        await zet('.welkom__slotmelding', 'Dat lukte niet. Er is nog niets ingesteld. Kies opnieuw of tik op Nu niet.');
        await meet('stap 5 met melding');
        await zet('.welkom__slotmelding', '');
        // het cijferblok (Pincode), met de melding als de codes verschillen, en de herstelcode met en zonder melding
        await verder(page).click();
        await expect(page.locator('.welkom .cijferblok')).toBeVisible();
        await meet('cijferblok');
        await tik(page, CODE);
        await tik(page, '654321');
        await expect(page.getByText('De codes komen niet overeen.')).toBeVisible();
        await meet('cijferblok met melding');
        await tik(page, CODE);
        await tik(page, CODE);
        await expect(page.locator('[data-herstelstap]')).toBeVisible();
        await meet('herstelcode');
        await zet('.herstel__melding', 'Kopiëren lukte niet. Schrijf de code over of bewaar ze als bestand.');
        await meet('herstelcode met melding');
        await page.locator('[data-herstelstap]').getByRole('button', { name: 'Annuleren' }).click();
        await expect(page.locator('.welkom__knoppen')).toBeVisible();
        // de methode van het toestel: eerst de zin over de terugval, dan "Dat lukte niet" met en zonder melding
        await page.getByRole('radio', { name: methode }).click();
        await verder(page).click();
        await expect(page.locator('.welkom .cijferblok')).toBeVisible();
        await meet('cijferblok met de zin over het toestel');
        await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
        await tik(page, CODE);
        await tik(page, CODE);
        await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
        await meet('Dat lukte niet');
        await zet('[data-toestelopnieuw] .slot__boodschap', 'Dat lukte niet. Probeer het nog eens of ga verder met alleen je pincode.');
        await meet('Dat lukte niet met melding');

        const h1 = standen['stap 1'].kaart.h;
        for (const [naam, s] of Object.entries(standen)) {
          const w = `${breed}x${hoog} ${toestel} ${naam}`;
          // alles in beeld, zonder scroll, evenveel ruimte boven als onder, links als rechts
          expect.soft(s.scroll.h, `${w}: geen verticale scroll`).toBeLessThanOrEqual(s.vp.h + 1);
          expect.soft(s.scroll.w, `${w}: geen horizontale scroll`).toBeLessThanOrEqual(s.vp.w);
          expect.soft(s.kaart.t, `${w}: kaart begint in beeld`).toBeGreaterThanOrEqual(0);
          expect.soft(s.kaart.b, `${w}: kaart eindigt in beeld`).toBeLessThanOrEqual(s.vp.h + 0.5);
          expect.soft(Math.abs(s.kaart.t - (s.vp.h - s.kaart.b)), `${w}: evenveel ruimte boven als onder de kaart`).toBeLessThanOrEqual(1);
          expect.soft(Math.abs(s.kaart.l - (s.vp.w - s.kaart.r)), `${w}: evenveel ruimte links als rechts`).toBeLessThanOrEqual(1);
          expect.soft(Math.abs(s.kaart.h - h1), `${w}: kaart even hoog als in stap 1`).toBeLessThanOrEqual(1);
          expect.soft(s.buiten, `${w}: niets buiten de kaart`).toEqual([]);
          // de kolommen: even breed (met het cijferblok rechts 228 px), 32 px ertussen, samen in het midden
          expect.soft(s.tussen, `${w}: 32 px tussen de kolommen`).toBe(32);
          if (naam.startsWith('cijferblok')) expect.soft(s.kolommen[1], `${w}: de rechterkolom is zo breed als het cijferblok`).toBe(228);
          else expect.soft(Math.abs(s.kolommen[0] - s.kolommen[1]), `${w}: de kolommen even breed (${s.kolommen.join(' en ')})`).toBeLessThanOrEqual(0.5);
          expect.soft(Math.abs(s.R.l - (s.begin + s.kolommen[0] + s.tussen)), `${w}: de rechterkolom begint 32 px na de linker`).toBeLessThanOrEqual(1);
          expect.soft(s.L.l, `${w}: de linkerkolom begint niet voor het blok`).toBeGreaterThanOrEqual(s.begin - 1);
          expect.soft(Math.abs(s.begin - s.binnen.l - (s.binnen.r - (s.begin + s.kolommen[0] + s.tussen + s.kolommen[1]))), `${w}: het blok staat in het midden van de kaart`).toBeLessThanOrEqual(1);
          // dezelfde middenlijn, en evenveel ruimte boven als onder het blok
          expect.soft(Math.abs((s.L.t + s.L.b) / 2 - (s.R.t + s.R.b) / 2), `${w}: beide kolommen op dezelfde middenlijn`).toBeLessThanOrEqual(1);
          const top = Math.min(s.L.t, s.R.t);
          const bodem = Math.max(s.L.b, s.R.b);
          expect.soft(Math.abs(top - s.binnen.t - (s.binnen.b - bodem)), `${w}: evenveel ruimte boven als onder het blok`).toBeLessThanOrEqual(1);
          // 8 px tussen alle delen van een kolom; in stap 1 tot 3 staat de kortere stap in het midden van haar vak
          for (const t of s.links) expect.soft(Math.abs(t - 8), `${w}: tussenruimte links (${s.links.join(', ')})`).toBeLessThanOrEqual(1);
          if (s.code || naam.startsWith('stap 5')) for (const t of s.rechts) expect.soft(Math.abs(t - 8), `${w}: tussenruimte rechts (${s.rechts.join(', ')})`).toBeLessThanOrEqual(1);
          if (s.lucht) expect.soft(Math.abs(s.lucht.boven - s.lucht.onder), `${w}: de stap staat in het midden van haar vak`).toBeLessThanOrEqual(1);
          // elke brede knop vult zijn kolom; het paar van stap 4 samen
          const kolom = s.kolommen[1];
          if (s.knoppen.length === 2 && Math.abs(s.knoppen[0].t - s.knoppen[1].t) < 1) {
            for (const k of s.knoppen) expect.soft(Math.abs(k.w - (kolom - 8) / 2), `${w}: "${k.tekst}" is de helft van de kolom`).toBeLessThanOrEqual(1);
          } else for (const k of s.knoppen) expect.soft(Math.abs(k.w - kolom), `${w}: "${k.tekst}" vult de kolom (${k.w})`).toBeLessThanOrEqual(1);
          // geen tikvlak onder 44 px
          for (const t of s.tikbaar) expect.soft(t.h, `${w}: tikvlak "${t.tekst}"`).toBeGreaterThanOrEqual(44);
        }
        // dezelfde lettermaat op elke stap van deze maat
        const alle = Object.values(standen);
        for (const deel of ['titel', 'intro', 'vraag', 'hint', 'tekst']) {
          const maten = new Set(alle.map((s) => s.letter[deel]).filter(Boolean));
          expect.soft(maten.size, `${breed}x${hoog} ${toestel}: lettermaat ${deel} op elke stap gelijk (${[...maten].join(', ')})`).toBe(1);
        }
        const knopLetter = new Set(alle.flatMap((s) => s.knoppen.map((k) => k.fs)));
        expect.soft(knopLetter.size, `${breed}x${hoog} ${toestel}: alle knoppen in dezelfde lettermaat`).toBe(1);
        const knopBreed = new Set(alle.flatMap((s) => s.knoppen.filter((k) => s.knoppen.length !== 2 || Math.abs(s.knoppen[0].t - s.knoppen[1].t) >= 1).map((k) => Math.round(k.w))));
        expect.soft(knopBreed.size, `${breed}x${hoog} ${toestel}: de brede knoppen even breed op elke stap (${[...knopBreed].join(', ')})`).toBe(1);
      });
    });
  }
}
