// BESLISSING 711: de rijen met een knop op het scherm Rondleiding (#/meer/uitleg) op een smalle telefoon.
// BESLISSING 719: onder 390 px staat de knop over de VOLLE BREEDTE van de rij, onder het icoon en de tekst.
// Onder 390 px bleef naast de knop een tekstkolom van 59 tot 114 px over: titels met een woord per regel en een afgekapte uitleg. Daar staat de knop nu
// onder de rij: de tekst over de volle breedte naast het icoon, de knop eronder van de linkerrand van het icoon tot de rechterrand van de rij, in dezelfde stijl, hoogte en lettermaat. Vanaf 390 px
// (goedgekeurd op 390 x 660) blijft de knop naast de tekst, met dezelfde maten als voorheen.
//   gewoon:  npm run e2e -- x-rondleiding-rijen-smal
import { test, expect } from '@playwright/test';
import { schermKlaar } from './wacht.js';

async function open(page, breed, hoog) {
  await page.setViewportSize({ width: breed, height: hoog });
  // geen rondleiding die vanzelf start: het scherm zelf wordt gemeten
  await page.addInitScript(() => localStorage.setItem('bloei-uitleg', JSON.stringify({ auto: false, gezien: {}, welkom: true })));
  await page.goto('./#/meer/uitleg');
  await schermKlaar(page, 'meer/uitleg');
  await expect(page.locator('.uitleg-scherm .rij .knop').first()).toBeVisible();
}

// Per rij met een knop: de titel, het aantal regels van titel en uitleg, of de uitleg afgekapt is, en waar tekst, icoon en knop staan (ten opzichte van de rij).
const meetRijen = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.uitleg-scherm .rij')]
      .filter((r) => r.querySelector(':scope > .rij__eind .knop'))
      .map((r) => {
        const q = (e) => e.getBoundingClientRect();
        const regels = (e) => {
          const g = document.createRange();
          g.selectNodeContents(e);
          return new Set([...g.getClientRects()].map((x) => Math.round(x.top))).size;
        };
        const rij = q(r);
        const titel = r.querySelector('.rij__titel');
        const sub = r.querySelector('.rij__sub');
        const tekst = q(r.querySelector('.rij__tekst'));
        const tegel = q(r.querySelector('.tegel'));
        const knopEl = r.querySelector('.rij__eind .knop');
        const knop = q(knopEl);
        return {
          titel: titel.textContent.trim(),
          woorden: titel.textContent.trim().split(/\s+/).length,
          titelRegels: regels(titel),
          subAfgekapt: sub ? sub.scrollHeight > sub.clientHeight + 1 : false,
          kolom: tekst.width,
          tekstLinks: tekst.left - rij.left,
          tekstOnder: tekst.bottom - rij.top,
          tegelLinks: tegel.left - rij.left,
          tegelOnder: tegel.bottom - rij.top,
          knopLinks: knop.left - rij.left,
          knopRechts: rij.right - knop.right,
          knopBoven: knop.top - rij.top,
          knopB: knop.width,
          knopH: knop.height,
          knopTekstGrootte: getComputedStyle(knopEl).fontSize,
          knopKlasse: knopEl.className,
          knopTekst: knopEl.textContent.trim(),
          rijH: rij.height,
          rijB: rij.width,
        };
      }),
  );

const horizontaal = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test.describe('711: de rijen met een knop op het scherm Rondleiding, smalle telefoon', () => {
  for (const [breed, hoog] of [[320, 480], [340, 660], [360, 560], [375, 660]]) {
    test(`${breed} x ${hoog}: de knop staat onder de rij over de volle breedte, geen woord per regel, niets afgekapt`, async ({ page }) => {
      await open(page, breed, hoog);
      const rijen = await meetRijen(page);
      // de rij "Alle rondleidingen opnieuw tonen" en de dertien rijen van "Hoe doe ik dat?"
      expect(rijen.length).toBeGreaterThanOrEqual(14);
      expect(await horizontaal(page)).toBe(false);
      for (const r of rijen) {
        const ctx = `${breed}: ${r.titel}`;
        // geen woord per regel en hoogstens twee regels titel, de uitleg volledig
        if (r.woorden > 1) expect(r.titelRegels, ctx + ' (regels titel)').toBeLessThan(r.woorden);
        expect(r.titelRegels, ctx + ' (regels titel)').toBeLessThanOrEqual(2);
        expect(r.subAfgekapt, ctx + ' (uitleg afgekapt)').toBe(false);
        // de tekst over de volle breedte naast het icoon: de rij min het icoon (40 px) en de tussenruimte (16 px)
        expect(Math.abs(r.kolom - (r.rijB - 56)), ctx + ' (breedte tekst)').toBeLessThanOrEqual(1);
        expect(r.tegelLinks, ctx).toBe(0);
        // de knop onder de tekst en onder het icoon, over de volle breedte van de rij (719)
        expect(r.knopBoven, ctx + ' (knop onder de tekst)').toBeGreaterThanOrEqual(Math.max(r.tekstOnder, r.tegelOnder) - 2);
        expect(Math.abs(r.knopLinks), ctx + ' (knop begint op de linkerrand van de rij, op de lijn van het icoon)').toBeLessThanOrEqual(1);
        expect(Math.abs(r.knopRechts), ctx + ' (knop eindigt op de rechterrand van de rij)').toBeLessThanOrEqual(1);
        expect(Math.abs(r.knopB - r.rijB), ctx + ' (knop even breed als de rij)').toBeLessThanOrEqual(1);
        // dezelfde knop als op 390: zachte stijl en 44 px hoog
        expect(r.knopKlasse, ctx).toMatch(/knop--secundair/);
        expect(r.knopH, ctx).toBe(44);
      }
    });
  }

  test('de knoppen hebben op 320 dezelfde hoogte en lettermaat als op 390 en zijn zo breed als hun rij, en elke knop is volledig tikbaar', async ({ page }) => {
    await open(page, 390, 660);
    const op390 = await meetRijen(page);
    await page.setViewportSize({ width: 320, height: 480 });
    await expect.poll(async () => (await meetRijen(page))[0].knopBoven).toBeGreaterThan(80);
    const op320 = await meetRijen(page);
    expect(op320.map((r) => [r.knopTekst, r.knopH, r.knopTekstGrootte])).toEqual(op390.map((r) => [r.knopTekst, r.knopH, r.knopTekstGrootte]));
    for (const r of op320) expect(Math.abs(r.knopB - r.rijB), r.titel).toBeLessThanOrEqual(1);
    // dezelfde tussenruimte tussen tekst en knop in elke rij, en dezelfde afstand tussen twee rijen
    expect(new Set(op320.map((r) => Math.round(r.knopBoven - Math.max(r.tekstOnder, r.tegelOnder)))).size).toBe(1);
    // het midden van elke knop is de knop zelf (niets ligt erover)
    const raak = await page.evaluate(() =>
      [...document.querySelectorAll('.uitleg-scherm .rij .rij__eind .knop')].map((k) => {
        k.scrollIntoView({ block: 'center', behavior: 'instant' });
        const q = k.getBoundingClientRect();
        return k.contains(document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2));
      }),
    );
    expect(raak.every(Boolean)).toBe(true);
  });

  // De goedgekeurde stand (390 x 660) en breder: de knop naast de tekst, rechts tegen de rij, met de maten van voor 711.
  for (const [breed, hoog] of [[390, 660], [412, 660], [445, 580]]) {
    test(`${breed} x ${hoog}: ongewijzigd, de knop naast de tekst`, async ({ page }) => {
      await open(page, breed, hoog);
      const rijen = await meetRijen(page);
      for (const r of rijen) {
        const ctx = `${breed}: ${r.titel}`;
        expect(r.knopRechts, ctx + ' (knop rechts in de rij)').toBeLessThanOrEqual(1);
        expect(r.knopBoven, ctx + ' (knop naast de tekst)').toBeLessThan(r.tekstOnder);
        expect(r.knopH, ctx).toBe(44);
        expect(r.subAfgekapt, ctx).toBe(false);
      }
      if (breed === 390) {
        // gemeten op 390 x 660 voor en na 711 (element per element gelijk): tekstkolom 148 px naast "Opnieuw", 129 px naast "Toon het me"
        expect(Math.round(rijen[0].kolom)).toBe(148);
        for (const r of rijen.slice(1)) expect(Math.round(r.kolom), r.titel).toBe(129);
        expect(rijen.map((r) => Math.round(r.knopB))).toEqual([90, ...Array(rijen.length - 1).fill(109)]);
        expect(Math.round(rijen[0].rijH)).toBe(115);
      }
    });
  }
});
