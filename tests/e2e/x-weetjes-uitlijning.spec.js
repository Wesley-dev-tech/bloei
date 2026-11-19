// BESLISSING 560 en 565: in elk blok "Goed om te weten" (en de kaart Privacy, en Herinneringen) staat elke tekst op dezelfde manier naast haar icoontegel:
//   A (de weetjesrij onderaan Drinken, Gewicht en Delen): een tekst van een regel: het midden van de inkt (de getekende letters) op het midden van de tegel,
//   binnen 1 px; twee of meer regels: de bovenkant van de inkt van de eerste regel (stokletters inbegrepen) gelijk met de bovenkant van de tegel (nooit
//   erboven, hoogstens 1 px eronder);
//   B (instelschermen, Privacy, Herinneringen, Vergrendeling, Uitleg): is het tekstblok niet hoger dan de tegel, dan valt het midden van het blok op het
//   midden van de tegel, anders de bovenkant van het blok op de bovenkant van de tegel (binnen 1 px); nooit inkt boven de tegel;
// en binnen een blok is dat overal hetzelfde. Gemeten op PIXELS: per weetje twee schermafbeeldingen op schaal 3 (een met alleen de tegel, een met alleen de
// tekst), per afbeelding de bovenste en onderste rij waar iets anders dan de achtergrond staat. Op 390, 820 en 1280 px, in Poeder en Nacht.
// Rapportage: METING_UIT=<bestand.json> schrijft de tabel weg; SHOTDIR=<map> bewaart schermafbeeldingen (schaal 3) van de blokken.
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { authenticator, rondAf, tik } from './slot-hulp.js';

const MATEN = [
  [390, 844],
  [820, 1180],
  [1280, 800],
];
const THEMAS = ['poeder', 'nacht'];
const ROUTES = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'delen', 'meer', 'meer/instellingen', 'meer/gewicht', 'meer/profiel', 'meer/favorieten', 'meer/badges', 'meer/meldingen', 'meer/uitleg'];
const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });
const CODE = '123456';
const BOVEN = { min: -0.4, max: 1 }; // meer regels: inkt-top min tegel-top (px)
const MIDDEN = 1; // B: |midden van het tekstblok - midden van de tegel| (px)
const MIDDEN_INKT = 1.25; // A, een regel: |midden van de inkt - midden van de tegel| (px); de inkt heeft stokletters boven en soms staarten onder, en meet op 1/3 px

// De bovenste en onderste rij (in css-px vanaf de bovenkant van de afbeelding) met meer dan 40% van het grootste verschil met de achtergrond
// (of, met `absoluut`, met een verschil van minstens dat getal).
async function inkt(page, b64, absoluut = null) {
  return page.evaluate(async ([b, abs]) => {
    const bytes = Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0)); // geen fetch van een data-adres: de pagina heeft een CSP
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const bg = [d[0], d[1], d[2]];
    const rij = [];
    for (let y = 0; y < c.height; y++) {
      let m = 0;
      for (let i = 0; i < c.width; i++) {
        const p = (y * c.width + i) * 4;
        m = Math.max(m, Math.abs(d[p] - bg[0]), Math.abs(d[p + 1] - bg[1]), Math.abs(d[p + 2] - bg[2]));
      }
      rij.push(m);
    }
    const max = Math.max(...rij);
    if (max < (abs ?? 8)) return null;
    const grens = abs ?? 0.4 * max;
    const dpr = window.devicePixelRatio || 1;
    const eerste = rij.findIndex((m) => m >= grens);
    const laatste = rij.length - 1 - [...rij].reverse().findIndex((m) => m >= grens);
    return { boven: eerste / dpr, onder: (laatste + 1) / dpr };
  }, [b64, absoluut]);
}

const TEKST = '.weetje__tekst, .meldingen__weetjetekst';

async function meetWeetjes(page, label) {
  const n = await page.evaluate((T) => {
    const zichtbaar = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    const lijst = [...document.querySelectorAll('#scherm .weetje, #scherm .meldingen__weetje')].filter((w) => zichtbaar(w) && w.querySelector('.tegel') && w.querySelector(T));
    lijst.forEach((w, i) => w.setAttribute('data-wm', i));
    return lijst.length;
  }, TEKST);
  const uit = [];
  for (let i = 0; i < n; i++) {
    const w = page.locator(`[data-wm="${i}"]`);
    await w.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' })); // midden in beeld: niet onder een vaste balk
    await animatiesKlaar(page);
    const g = await w.evaluate((e, T) => {
      const tekst = e.querySelector(T);
      const tegel = e.querySelector('.tegel');
      const r = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      const gr = document.createRange();
      gr.selectNodeContents(tekst);
      const regels = new Set([...gr.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
      const blok = e.closest('.kaart, .instel__weetjes, [class*="weetjes"]') ?? e.parentElement;
      return { tegel: r(tegel), tekst: r(tekst), regels, maat: parseFloat(getComputedStyle(tekst).fontSize), tekstTxt: tekst.textContent.trim().slice(0, 26), link: e.classList.contains('weetje--link'), blokNaam: (blok.className || blok.tagName).toString().split(' ').slice(0, 2).join('.'), blok: [...document.querySelectorAll('#scherm *')].indexOf(blok) };
    }, TEKST);
    const y0 = g.tegel.y - 8;
    const hoogte = Math.max(g.tegel.y + g.tegel.h, g.tekst.y + g.tekst.h) + 4 - y0;
    const knip = (x, b) => ({ x: Math.max(0, x), y: Math.max(0, y0), width: b, height: hoogte });
    await w.evaluate((e, T) => e.querySelector(T).style.setProperty('visibility', 'hidden'), TEKST);
    const fTegel = (await page.screenshot({ clip: knip(g.tegel.x - 4, g.tegel.w + 8) })).toString('base64');
    await w.evaluate((e, T) => {
      e.querySelector(T).style.removeProperty('visibility');
      e.querySelector('.tegel').style.setProperty('visibility', 'hidden');
    }, TEKST);
    const fTekst = (await page.screenshot({ clip: knip(g.tekst.x - 2, g.tekst.w + 4) })).toString('base64');
    await w.evaluate((e) => e.querySelector('.tegel').style.removeProperty('visibility'));
    const t = await inkt(page, fTegel, 3); // de tegel: elk verschil met de kaart (de tegel is een zacht vlak, het icoon erin is het donkerst)
    const k = await inkt(page, fTekst);
    if (!t || !k) {
      uit.push({ label, tekst: g.tekstTxt, fout: 'geen inkt gevonden' });
      continue;
    }
    // A: de weetjesrij onderaan Drinken, Gewicht en Delen (BESLISSING 566, 568): een regel in het midden, meer regels bovenaan (inkt-top op tegel-top).
    // B: de instelschermen en de kaart Privacy (BESLISSING 568): het tekstblok staat in het midden van de tegel zolang het er niet hoger dan is, anders
    // valt de bovenkant van het blok op de bovenkant van de tegel; er ligt nooit inkt boven de tegel.
    const A = /^(drinken|gewicht|delen)__weetjesrij/.test(g.blokNaam);
    const hoog = g.tekst.h > g.tegel.h + 0.5;
    let modus;
    let verschil;
    if (A) {
      modus = g.regels > 1 ? 'A-boven' : 'A-midden';
      verschil = g.regels > 1 ? k.boven - t.boven : (k.boven + k.onder) / 2 - (t.boven + t.onder) / 2;
    } else if (!hoog) {
      modus = 'B-midden';
      verschil = g.tekst.y + g.tekst.h / 2 - (g.tegel.y + g.tegel.h / 2);
    } else {
      modus = 'B-boven';
      verschil = g.tekst.y - g.tegel.y;
    }
    uit.push({ label, blok: g.blok, blokNaam: g.blokNaam, tekst: g.tekstTxt, link: g.link, regels: g.regels, modus, maat: g.maat, tegelHoogte: t.onder - t.boven, inktHoogte: k.onder - k.boven, inktBoven: Math.round((k.boven - t.boven) * 100) / 100, verschil: Math.round(verschil * 100) / 100 });
  }
  await page.evaluate(() => document.querySelectorAll('[data-wm]').forEach((e) => e.removeAttribute('data-wm')));
  return uit;
}

const tabel = [];
function controleer(rijen) {
  const fouten = [];
  for (const r of rijen) {
    tabel.push(r);
    const wat = `${r.label} ${r.blokNaam} "${r.tekst}" (${r.regels} regel(s), ${r.maat} px, ${r.modus})`;
    if (r.fout) fouten.push(`${r.label} "${r.tekst}": ${r.fout}`);
    else if (r.modus === 'A-boven' ? r.verschil < BOVEN.min || r.verschil > BOVEN.max : Math.abs(r.verschil) > (r.modus === 'A-midden' ? MIDDEN_INKT : MIDDEN)) fouten.push(`${wat}: ${r.verschil} px`);
    else if (r.modus.startsWith('B') && r.inktBoven < BOVEN.min) fouten.push(`${wat}: inkt ${-r.inktBoven} px boven de tegel`);
  }
  return fouten;
}

test.use({ isMobile: false, hasTouch: false });

for (const [b, hg] of MATEN) {
  for (const thema of THEMAS) {
    test(`weetjes ${b}x${hg} ${thema}: een regel in het midden van de tegel, meer regels met de bovenkant van de inkt op de bovenkant van de tegel (BESLISSING 560, 565)`, async ({ page }) => {
      test.setTimeout(300000);
      await page.setViewportSize({ width: b, height: hg });
      await vasteKlok(page);
      const zetThema = () => page.evaluate((th) => (th === 'poeder' ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', th)), thema);
      const fouten = [];
      let gemeten = 0;
      const klaar = async (route) => {
        await schermKlaar(page, route);
        await zetThema();
        await page.evaluate(() => document.fonts.ready);
        await animatiesKlaar(page);
      };
      const doe = async (label) => {
        const rijen = await meetWeetjes(page, `${label} ${b} ${thema}`);
        gemeten += rijen.length;
        fouten.push(...controleer(rijen));
        const map = process.env.SHOTDIR;
        if (map) {
          mkdirSync(map, { recursive: true });
          const bl = page.locator('#scherm .instel__weetjes, #scherm .delen__weetjes, #scherm .drinken__weetjes, #scherm .gewicht__weetjes, #scherm .privacy');
          for (let i = 0; i < (await bl.count()); i++) if (await bl.nth(i).isVisible()) await bl.nth(i).screenshot({ path: join(map, `${label.replace(/[^a-z0-9]+/gi, '-')}-${b}-${thema}-${i}.png`) });
        }
      };
      for (const route of ROUTES) {
        await page.goto('./#/' + route);
        await klaar(route);
        await doe(route);
      }
      for (const stand of ['uit', 'aan']) {
        await authenticator(page, stand === 'aan' ? 'geen' : 'ok');
        await page.goto('./#/meer/vergrendeling');
        await schermKlaar(page, '#/meer/vergrendeling');
        if (stand === 'aan') {
          await SLOT(page).click();
          await tik(page, CODE);
          await tik(page, CODE);
          await rondAf(page);
          await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
        }
        await klaar('#/meer/vergrendeling');
        await doe(`vergrendeling-${stand}`);
      }
      if (process.env.METING_UIT) {
        mkdirSync(join(process.env.METING_UIT, '..'), { recursive: true });
        writeFileSync(process.env.METING_UIT.replace(/\.json$/, `-${b}-${thema}.json`), JSON.stringify(tabel.filter((r) => r.label.endsWith(` ${b} ${thema}`)), null, 1));
      }
      expect(gemeten, 'er zijn weetjes gemeten').toBeGreaterThan(20);
      expect(fouten).toEqual([]);
    });
  }
}
