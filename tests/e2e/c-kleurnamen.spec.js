// BESLISSING 648 (namen: BESLISSING 653): een tekst die een kleur noemt, noemt de kleur die op dat scherm en in dat thema echt te zien is.
// Per thema (Poeder, Salie, Nacht), per scherm (Vandaag, Dagboek maand, Supplementen) en per maat: de rondleiding van het scherm wordt met
// echte tikken (of klikken) afgelopen. Noemt een stap een kleur ("een groen bolletje", "het paarse rondje", "vandaag is paars"), dan wordt
// op dat moment de berekende kleur van het echte element gelezen en moet het woord bij die kleur passen (een bereik in tint, verzadiging en
// helderheid). De gegevens tonen het bolletje echt: een dagelijks supplement, afgevinkt op de meeste dagen van de maand.
// Ook: wisselt het thema terwijl de rondleiding openstaat, dan volgt de naam (Dagboek: bruin in Poeder, roze in Nacht).
// Beelden (voor het nakijken): zet KLEUR_BEELDEN op een map; dan bewaart de test een beeld van elke stap met een kleur en van de laatste stap.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TEKSTEN } from '../../src/teksten.js';
import { STAND_BESTAND } from '../stand.js';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';
import { uitlegRust } from './x-uitleg-meting.js';

const BASIS = `http://localhost:${process.env.PW_POORT || '4173'}/`;
const BEELDEN = process.env.KLEUR_BEELDEN || '';
if (BEELDEN) mkdirSync(BEELDEN, { recursive: true });

// Het bereik van elk kleurwoord dat een tekst mag gebruiken: tint in graden (van, tot; over 0 heen mag), verzadiging en helderheid in procent.
const BEREIK = {
  salie: { tint: [80, 150], verz: [5, 35], helder: [45, 80] }, // het bolletje "alle supplementen genomen": #8EA58C (Poeder, Salie) en #A9C0A6 (Nacht); "groen" is geen toegelaten woord meer (BESLISSING 657)
  bruin: { tint: [0, 45], verz: [20, 80], helder: [15, 50] },
  roze: { tint: [330, 40], verz: [20, 100], helder: [65, 95] },
  paars: { tint: [265, 325], verz: [10, 70], helder: [25, 80] },
  // (oude of eerder voorgestelde namen: zo faalt een vaste of verkeerde naam op de juiste reden)
  lichtgroen: { tint: [70, 170], verz: [5, 70], helder: [60, 85] },
  terracotta: { tint: [5, 30], verz: [30, 80], helder: [35, 55] },
  perzik: { tint: [15, 40], verz: [40, 100], helder: [70, 90] },
  lila: { tint: [265, 325], verz: [10, 60], helder: [60, 85] },
};
const VORMEN = { groene: 'groen', bruine: 'bruin', paarse: 'paars', lichtgroene: 'lichtgroen' };
const grondvorm = (w) => VORMEN[w.toLowerCase()] ?? w.toLowerCase();

// Welk element een tekst bedoelt: het bolletje "alle supplementen genomen" en het rondje van vandaag.
const ELEMENT = {
  vandaag: {
    klaar: [{ sel: '.kalkaart .kalender__dag .kalender__klaar:not(.kalender__klaar--legenda)' }, { sel: '.kalkaart__legenda .kalender__klaar--legenda', mag: true }],
    vandaag: [{ sel: '.kalkaart .kalender__dag.is-vandaag .kalender__nr', pseudo: '::before' }],
  },
  dagboek: {
    klaar: [{ sel: '.mk__dag .mk__klaar:not(.mk__klaar--legenda)' }, { sel: '.maand__legenda .mk__klaar--legenda', mag: true }],
    vandaag: [{ sel: '.mk__dag.is-vandaag .mk__nr', pseudo: '::before' }],
  },
  supplementen: {
    klaar: [{ sel: '.weekdag.is-klaar .weekdag__bol' }],
  },
};
const SCHERMEN = [
  { id: 'vandaag', route: 'vandaag', rollen: ['klaar', 'vandaag'] },
  { id: 'dagboek', route: 'dagboek/maand/2026-11', rollen: ['klaar', 'vandaag'] },
  { id: 'supplementen', route: 'supplementen', rollen: ['klaar'] },
];
const THEMAS = ['poeder', 'salie', 'nacht'];
const MATEN = [
  { naam: '390x844', viewport: { width: 390, height: 844 }, aanraak: true },
  { naam: '390x660', viewport: { width: 390, height: 660 }, aanraak: true },
  { naam: '1280x800', viewport: { width: 1280, height: 800 }, aanraak: false },
];

// De kleurwoorden in een tekst, met de rol van het element.
function genoemd(tekst) {
  const uit = [];
  for (const m of tekst.matchAll(/\b(\p{L}+) bolletje\b/gu)) uit.push({ rol: 'klaar', woord: m[1] });
  for (const m of tekst.matchAll(/\b(\p{L}+) rondje\b/gu)) uit.push({ rol: 'vandaag', woord: m[1] });
  for (const m of tekst.matchAll(/\bvandaag is (\p{L}+)\b/giu)) uit.push({ rol: 'vandaag', woord: m[1] });
  return uit.filter((x) => !['een', 'het', 'dit', 'dat', 'elk', 'ieder'].includes(x.woord.toLowerCase()));
}

// De berekende kleur (via een canvas, zodat color-mix en oklch ook rgb worden) en haar tint, verzadiging en helderheid.
async function leesKleur(page, { sel, pseudo }) {
  return page.evaluate(
    ({ sel, pseudo }) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      if (!el) return null;
      const css = getComputedStyle(el, pseudo || null).backgroundColor;
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#000';
      x.fillStyle = css;
      x.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
      const [R, G, B] = [r / 255, g / 255, b / 255];
      const max = Math.max(R, G, B);
      const min = Math.min(R, G, B);
      const l = (max + min) / 2;
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      let h = 0;
      if (d) h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
      if (h < 0) h += 360;
      return { css, a, hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    },
    { sel, pseudo: pseudo || null },
  );
}
function past(woord, k) {
  const b = BEREIK[grondvorm(woord)];
  if (!b) return false;
  const [van, tot] = b.tint;
  const inTint = van <= tot ? k.h >= van && k.h <= tot : k.h >= van || k.h <= tot;
  return inTint && k.s >= b.verz[0] && k.s <= b.verz[1] && k.l >= b.helder[0] && k.l <= b.helder[1];
}

// Een dagelijks supplement, afgevinkt op elke dag van november tot vandaag behalve elke derde dag; het thema van de test.
function zaai(page, thema) {
  return page.evaluate(
    (thema) =>
      new Promise((klaar, fout) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const iso = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['supplementen', 'momentinnames', 'instellingen'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: thema });
          const vraag = tx.objectStore('supplementen').add({ naam: 'Magnesium', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          vraag.onsuccess = () => {
            for (let n = 1; n <= nu.getDate(); n++) {
              if (n % 3 === 0) continue;
              const d = new Date(nu.getFullYear(), nu.getMonth(), n, 8);
              tx.objectStore('momentinnames').put({ datum: iso(d), supplementId: vraag.result, moment: 'ochtend', tijdstip: d.getTime(), voorbeeld: false });
            }
          };
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    thema,
  );
}

const kaart = (page) => page.locator('.uitleg__kaart[role="dialog"]');
async function tik(page, loc, aanraak) {
  if (aanraak) await loc.tap();
  else await loc.click();
}

async function nieuw(browser, maat, thema, scherm) {
  const opt = maat.aanraak ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { hasTouch: false, isMobile: false, deviceScaleFactor: 1 };
  const context = await browser.newContext({ ...opt, viewport: maat.viewport, baseURL: BASIS, storageState: STAND_BESTAND, locale: 'nl-BE', timezoneId: 'Europe/Brussels' });
  const page = await context.newPage();
  const fouten = [];
  page.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
  page.on('pageerror', (e) => fouten.push(String(e)));
  await vasteKlok(page);
  await page.goto('./');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await zaai(page, thema);
  await page.goto('./#/' + scherm.route);
  await page.reload();
  await schermKlaar(page, scherm.id);
  // Een rondleiding die vanzelf start, eerst wegdoen: de test start ze zelf met het vraagteken.
  if (await kaart(page).isVisible()) await tik(page, kaart(page).locator('.uitleg__overslaan'), maat.aanraak);
  expect(await page.evaluate(() => document.documentElement.dataset.theme || 'poeder'), 'het thema van de test staat aan').toBe(thema);
  return { context, page, fouten };
}

// Toetst de namen in de tekst die nu op de kaart staat tegen de echte kleuren. Geeft de rollen die genoemd werden.
async function toetsNamen(page, scherm, tekst, wie, fouten) {
  const rollen = new Set();
  for (const { rol, woord } of genoemd(tekst)) {
    rollen.add(rol);
    const els = ELEMENT[scherm.id][rol];
    if (!els) {
      fouten.push(`${wie}: "${woord}" bij een ${rol} dat op dit scherm niet bestaat`);
      continue;
    }
    let gemeten = 0;
    for (const e of els) {
      const k = await leesKleur(page, e);
      if (!k) {
        if (!e.mag) fouten.push(`${wie}: het element ${e.sel} staat niet in beeld (de gegevens tonen het niet)`);
        continue;
      }
      gemeten++;
      if (!past(woord, k)) fouten.push(`${wie}: de tekst zegt "${woord}", het element ${e.sel}${e.pseudo ?? ''} is ${k.hex} (tint ${k.h}, verzadiging ${k.s}, helderheid ${k.l})`);
    }
    if (!gemeten) fouten.push(`${wie}: geen element gemeten voor "${woord}"`);
  }
  return rollen;
}

for (const maat of MATEN) {
  for (const thema of THEMAS) {
    for (const scherm of SCHERMEN) {
      test(`kleurnamen: ${scherm.id} in ${thema} op ${maat.naam}: de naam in de rondleiding is de kleur die je ziet`, async ({ browser }) => {
        test.setTimeout(150000);
        const { context, page, fouten: consolefouten } = await nieuw(browser, maat, thema, scherm);
        const fouten = [];
        const gezien = new Set();
        await tik(page, page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first(), maat.aanraak);
        await expect(kaart(page)).toBeVisible();
        for (let i = 0; i < 60; i++) {
          await uitlegRust(page);
          const titel = (await page.locator('#uitleg-titel').textContent()).trim();
          const tekst = (await page.locator('#uitleg-tekst').textContent()).trim();
          const label = (await kaart(page).locator('.uitleg__stap').textContent()).trim();
          const wie = `${scherm.id} ${thema} ${maat.naam}, ${label} "${titel}"`;
          expect(tekst, wie).not.toMatch(/\{kleur/);
          const rollen = await toetsNamen(page, scherm, `${titel} ${tekst}`, wie, fouten);
          for (const r of rollen) gezien.add(r);
          const volgende = kaart(page).locator('.uitleg__volgende');
          const laatste = (await volgende.textContent()).trim() === TEKSTEN.uitleg.klaar;
          if (BEELDEN && (rollen.size || laatste)) await page.screenshot({ path: join(BEELDEN, `${scherm.id}__${thema}__${maat.naam}__${laatste && !rollen.size ? 'einde' : label.replace(/\s+/g, '-')}.png`) });
          // Dagboek, Poeder: het thema wisselt terwijl de stap openstaat; de naam volgt (bruin wordt roze) en past weer bij de kleur.
          if (scherm.id === 'dagboek' && thema === 'poeder' && rollen.has('klaar')) {
            await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'nacht'));
            await expect(page.locator('#uitleg-tekst')).not.toHaveText(tekst);
            await uitlegRust(page);
            const tekst2 = (await page.locator('#uitleg-tekst').textContent()).trim();
            const rollen2 = await toetsNamen(page, scherm, tekst2, wie + ' na de wissel naar Nacht', fouten);
            expect([...rollen2], 'na de wissel noemt de stap het bolletje nog').toContain('klaar');
            if (BEELDEN) await page.screenshot({ path: join(BEELDEN, `${scherm.id}__poeder-naar-nacht__${maat.naam}__${label.replace(/\s+/g, '-')}.png`) });
            await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
            await expect(page.locator('#uitleg-tekst')).toHaveText(tekst);
          }
          if (laatste) break;
          await tik(page, volgende, maat.aanraak);
          await expect(kaart(page).locator('.uitleg__stap')).not.toHaveText(label);
        }
        for (const rol of scherm.rollen) expect([...gezien], `${scherm.id}: de rondleiding noemt de kleur van ${rol}`).toContain(rol);
        expect(fouten).toEqual([]);
        expect(consolefouten.filter((x) => /Kleurnaam ontbreekt|kleur\./.test(x))).toEqual([]);
        await context.close();
      });
    }
  }
}
