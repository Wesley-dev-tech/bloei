// BESLISSING 610: op de telefoon (smaller dan 720 px) staat op het hoofdscherm 18 px tussen de badges en het label "Deze week" (was 8) en tussen
// het blok met het glas en het label "Dranken" (was 14). De maat is die van de rondleiding (x-uitleg-meting.js, meetMaten, M5): de afstand
// tussen de inkt van het uitgelichte blok en de rechthoek van de dichtste buur in dezelfde kaart. Onder 16 px kan de rondleiding die buur niet
// buiten het vak houden (uitzondering M5L "de opmaak zet een buur te dicht bij het blok").
// Per telefoonmaat en thema loopt de rondleiding van het hoofdscherm tot Klaar; in de stappen rond de badges, Deze week, het glas
// ("Je drinken vandaag") en de dranken wordt de maat genomen met meetMaten zelf (een extra regel geeft elke buur met zijn maat terug).
// Getoetst: 17,5 tot 19,5 px tussen badges en Deze week, 18 px (17,5 tot 18,5) tussen het glas en Dranken, en geen M5L in die stappen.
// Vanaf 720 px verandert niets: de hoogte van de twee kaarten en de twee kaderafstanden blijven zoals goedgekeurd.
// RUIMTE_MELDING=1 drukt de gemeten tabel af; RUIMTE_FOTO=<map> bewaart een schermafbeelding van elke betrokken stap.
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { meetMaten, referentie, uitlegRust, zaaiUitleg } from './x-uitleg-meting.js';

const TELEFOON = [
  [390, 660],
  [445, 580],
  [360, 560],
  [320, 480],
  [435, 470],
];
const BREED = [
  { b: 820, h: 1180, voortgang: 345.78, drink: 605.14, a: -73.6, bb: 16 },
  { b: 1280, h: 800, voortgang: 457.27, drink: 467.31, a: 20, bb: -358.3 },
];
const THEMAS = ['poeder', 'nacht'];
const DOEL = 18;
const MARGE = 0.5;
// De medailles schalen mee met de breedte, dus de ruimte tot Deze week loopt mee van 17,7 (390, 445, 435) via 18,3 (360) tot 19,4 (320): aanvaard 17,5 tot 19,5.
const MEDAILLES = [17.5, 19.5];

// De vier stappen (op hun titel: data-doel is bij een stap in delen het doel van de hele stap) en de buur die bij 610 hoort (naam uit meetMaten).
// "Een kan water erbij": de buur boven het blok is het glas (svg) of Laatste weghalen.
const PAREN = [
  { titel: 'Je badges', buur: /"Deze week/, plaats: 'badges tot Deze week' },
  { titel: 'Deze week', buur: /medaille|badgeblok/, plaats: 'badges tot Deze week' },
  { titel: 'Je drinken vandaag', buur: /"Dranken/, plaats: 'glas tot Dranken' },
  { titel: 'Een kan water erbij', buur: /^svg|watervulling|drinkkaart__acties|"Laatste weghalen/, plaats: 'glas tot Dranken' },
];

// meetMaten zelf, met een regel erbij die elke buur in dezelfde kaart met zijn maat (ruimte tot de inkt van het blok) teruggeeft.
const HAAK = 'if (zichtH <= 1.5) continue;';
const BRON = meetMaten.toString();
const MET_BUREN = BRON.replace(
  HAAK,
  '{ const r0 = Math.max(C.t - R.b, R.t - C.b, C.l - R.r, R.l - C.r); (uit.buren ||= []).push({ n: naam(u.e), r: Math.round(r0 * 10) / 10, z: Math.round(zichtH * 10) / 10 }); } ' + HAAK,
);

async function zetThema(page, thema) {
  await page.evaluate(
    (t) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: t });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    thema,
  );
}

const kaart = (page) => page.locator('.uitleg__kaart[role="dialog"]');
const stapLabel = (page) => kaart(page).locator('.uitleg__stap');

// Loopt de rondleiding van het hoofdscherm af en geeft per stap het doel, de titel, de uitzonderingen en de buren met hun maat.
async function rondleiding(page, foto) {
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(referentie);
  await page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first().tap();
  await expect(kaart(page)).toBeVisible();
  const stappen = [];
  for (let i = 1; i <= 40; i++) {
    await uitlegRust(page);
    const label = ((await stapLabel(page).textContent()) || '').trim();
    const totaal = Number(label.match(/van (\d+)/)?.[1]);
    const doel = (await kaart(page).getAttribute('data-doel')) || '';
    const titel = ((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim();
    const m = await page.evaluate(`(${MET_BUREN})()`);
    const stap = { i, doel, titel, uitz: m.uitzonderingen || [], buren: m.buren || [], fouten: m.fouten || [] };
    stappen.push(stap);
    if (foto && PAREN.some((p) => p.titel === titel)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(foto.map, { recursive: true });
      await page.screenshot({ path: `${foto.map}/${foto.naam}-stap${i}.png` });
    }
    if (i === totaal) {
      await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.klaar }).tap();
      await expect(kaart(page)).toHaveCount(0);
      return stappen;
    }
    await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }).tap();
    await expect(stapLabel(page)).toHaveText(`Stap ${i + 1} van ${totaal}`);
  }
  throw new Error('de rondleiding eindigt niet');
}

test.describe('BESLISSING 610: ruimte op het hoofdscherm', () => {
  const rapport = [];
  test.afterAll(() => {
    if (process.env.RUIMTE_MELDING) console.log('RUIMTETABEL\n' + rapport.map((x) => JSON.stringify(x)).join('\n'));
  });

  for (const thema of THEMAS) {
    test.describe(thema, () => {
      test('onder 720 px breed: in de rondleiding 18 px tussen de badges en Deze week en tussen het glas en Dranken, geen M5L', async ({ page }) => {
        test.setTimeout(240000);
        await vasteKlok(page);
        await page.goto('./');
        await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
        await zaaiUitleg(page);
        await zetThema(page, thema);
        await page.reload();
        await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
        if (thema !== 'poeder') await expect(page.locator('html')).toHaveAttribute('data-theme', thema);
        else await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
        expect(MET_BUREN, 'de haak in meetMaten').not.toBe(BRON);
        const fouten = [];
        for (const [b, h] of TELEFOON) {
          await page.setViewportSize({ width: b, height: h });
          const foto = process.env.RUIMTE_FOTO ? { map: process.env.RUIMTE_FOTO, naam: `${thema}-${b}x${h}` } : null;
          const stappen = await rondleiding(page, foto);
          if (process.env.RUIMTE_MELDING) {
            rapport.push({
              thema,
              b,
              h,
              kader: await page.evaluate(() => {
                const r = (s) => document.querySelector(s).getBoundingClientRect();
                return {
                  ga: Math.round((r('.vandaag .motiv__weekvak > .label').top - r('.vandaag .badgeblok__paar').bottom) * 10) / 10,
                  gb: Math.round((r('.vandaag .drinkkaart__andere > .label').top - r('.vandaag .drinkkaart__links').bottom) * 10) / 10,
                  links: Math.round(r('.vandaag .drinkkaart__links').height * 100) / 100,
                  voortgang: Math.round(r('.vandaag .voortgang').height * 100) / 100,
                  drink: Math.round(r('.vandaag .drinkkaart').height * 100) / 100,
                };
              }),
            });
          }
          const maat = {};
          for (const s of stappen) {
            const paar = PAREN.find((p) => p.titel === s.titel);
            if (!paar) {
              if (process.env.RUIMTE_MELDING) rapport.push({ thema, b, h, stap: s.i, titel: s.titel, doel: s.doel, uitz: s.uitz, buren: s.buren.filter((x) => x.r < 20) });
              continue;
            }
            const buren = s.buren.filter((x) => paar.buur.test(x.n));
            const r = buren.length ? Math.min(...buren.map((x) => x.r)) : null;
            const dichtste = s.buren.length ? Math.min(...s.buren.map((x) => x.r)) : null;
            rapport.push({ thema, b, h, stap: s.i, titel: s.titel, doel: s.doel, plaats: paar.plaats, maat: r, dichtste, uitz: s.uitz, buren: process.env.RUIMTE_MELDING ? s.buren.filter((x) => x.r < 40) : undefined });
            if (r != null) (maat[paar.plaats] ||= []).push(r);
            // M5L voor de buur van 610 (een andere buur in dezelfde stap, zoals het label Vandaag op een laag scherm, hoort niet bij 610)
            const m5l = s.uitz.flatMap((x) => x.replace(/^M5L[^:]*: /, '').split(' | ')).filter((x) => paar.buur.test(x));
            if (m5l.length) fouten.push(`${thema} ${b}x${h} stap ${s.i} (${s.titel}): M5L ${m5l.join(' | ')}`);
          }
          for (const plaats of ['badges tot Deze week', 'glas tot Dranken']) {
            const lijst = maat[plaats] || [];
            if (!lijst.length) fouten.push(`${thema} ${b}x${h}: ${plaats} niet gemeten`);
            for (const r of lijst) {
              if (plaats === 'badges tot Deze week') {
                if (r < MEDAILLES[0] || r > MEDAILLES[1]) fouten.push(`${thema} ${b}x${h}: ${plaats} ${r} px i.p.v. ${MEDAILLES[0]} tot ${MEDAILLES[1]}`);
              } else if (Math.abs(r - DOEL) > MARGE) fouten.push(`${thema} ${b}x${h}: ${plaats} ${r} px i.p.v. ${DOEL}`);
            }
          }
        }
        expect(fouten, fouten.join('\n')).toEqual([]);
      });

      test('vanaf 720 px breed: de kaarten en de twee afstanden blijven zoals goedgekeurd', async ({ page }) => {
        await vasteKlok(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('./');
        await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
        await zetThema(page, thema);
        await vulGegevens(page, 'vol');
        if (thema !== 'poeder') await expect(page.locator('html')).toHaveAttribute('data-theme', thema);
        else await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
        const alle = [];
        for (const v of BREED) {
          await page.setViewportSize({ width: v.b, height: v.h });
          await page.goto('./#/vandaag');
          await schermKlaar(page, 'vandaag');
          await animatiesKlaar(page);
          const m = await page.evaluate(() => ({
            voortgang: document.querySelector('.vandaag .voortgang').getBoundingClientRect().height,
            drink: document.querySelector('.vandaag .drinkkaart').getBoundingClientRect().height,
            ga: document.querySelector('.vandaag .motiv__weekvak > .label').getBoundingClientRect().top - document.querySelector('.vandaag .badgeblok__paar').getBoundingClientRect().bottom,
            gb: document.querySelector('.vandaag .drinkkaart__andere > .label').getBoundingClientRect().top - document.querySelector('.vandaag .drinkkaart__links').getBoundingClientRect().bottom,
          }));
          rapport.push({ thema, b: v.b, h: v.h, ...m });
          alle.push([v, m]);
        }
        for (const [v, m] of alle) {
          expect(m.voortgang, `kaart met de warme zin ${v.b}x${v.h}`).toBeCloseTo(v.voortgang, 0);
          expect(m.drink, `kaart Drinken ${v.b}x${v.h}`).toBeCloseTo(v.drink, 0);
          expect(m.ga, `medailles tot Deze week (kader) ${v.b}x${v.h}`).toBeCloseTo(v.a, 0);
          expect(m.gb, `kolom Vandaag tot Dranken (kader) ${v.b}x${v.h}`).toBeCloseTo(v.bb, 0);
        }
      });
    });
  }
});
