// Uniforme iconen (BESLISSING 320): op Algemeen hebben de vijf rijen van "Jouw instellingen" een gevuld icoon,
// en Herinneringen, Vergrendeling en Uitleg dragen exact dezelfde tegel- en icoonkleur.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const pad = (stijl, naam) => fs.readFileSync(path.resolve(process.cwd(), `src/iconen/${stijl}/${naam}.svg`), 'utf8').match(/<path[^>]* d="([^"]+)"/)[1];

const RIJEN = [
  [/^Drinken/, 'glass-water'],
  [/^Gewicht/, 'weight-scale'],
  [/Herinneringen/, 'bell'],
  [/Vergrendeling/, 'lock'],
  [/Rondleiding/, 'circle-info'], // BESLISSING 599: de rij heet Rondleiding in plaats van Uitleg
];

test('Algemeen: de vijf instellingen hebben een gevuld icoon en de neutrale tegels zijn identiek', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/meer');
  await expect(page.getByRole('heading', { name: 'Algemeen', level: 1 })).toBeVisible();
  const kaart = page.locator('.kaart', { hasText: 'Jouw instellingen' }).first();
  const meting = [];
  for (const [naam, icoonNaam] of RIJEN) {
    const tegel = kaart.getByRole('button', { name: naam }).first().locator('.tegel').first();
    await expect(tegel).toBeVisible();
    const m = await tegel.evaluate((el) => {
      const s = getComputedStyle(el);
      const svg = el.querySelector('svg');
      return { achtergrond: s.backgroundColor, kleur: getComputedStyle(svg).color, d: svg.querySelector('path').getAttribute('d') };
    });
    expect(m.d, String(naam)).toBe(pad('solid', icoonNaam));
    meting.push(m);
  }
  // BESLISSING 321: alle vijf de tegels, en ook de koptegel van de kaart, hebben exact dezelfde achtergrond- en icoonkleur.
  const kop = await kaart.locator('.tegel').first().evaluate((el) => ({ achtergrond: getComputedStyle(el).backgroundColor, kleur: getComputedStyle(el.querySelector('svg')).color }));
  for (const m of meting) {
    expect(m.achtergrond).toBe(meting[0].achtergrond);
    expect(m.kleur).toBe(meting[0].kleur);
  }
  expect(kop.achtergrond).toBe(meting[0].achtergrond);
  expect(kop.kleur).toBe(meting[0].kleur);
});

// BESLISSING 323: binnen één blok "Goed om te weten" hebben alle weetjestegels dezelfde achtergrond- en icoonkleur
// BESLISSING 351: de tegel van de link ("Toon het me" of een andere) telt mee en heeft dezelfde kleur.
const WEETJES = ['#/drinken', '#/gewicht', '#/delen', '#/meer/instellingen', '#/meer/gewicht', '#/meer/profiel', '#/meer/favorieten', '#/meer/vergrendeling', '#/meer/meldingen', '#/meer/uitleg'];
for (const route of WEETJES) {
  test(`Goed om te weten (${route}): alle weetjestegels hebben dezelfde kleur`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./' + route);
    const tegels = page.locator('.weetje .tegel, .meldingen__weetje .tegel');
    await expect(tegels.first()).toBeAttached();
    const kleuren = await tegels.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el.querySelector('svg')).color));
    expect(kleuren.length).toBeGreaterThan(1);
    expect(new Set(kleuren).size, kleuren.join(' ; ')).toBe(1);
    // De tekst van de link heeft kleur, maat en gewicht van de weetjestekst; tikvlak minstens 44 px hoog.
    const link = page.locator('.weetje--link').first();
    if (await link.count()) {
      const meting = await page.evaluate(() => {
        const m = (el) => ({ kleur: getComputedStyle(el).color, maat: getComputedStyle(el).fontSize, gewicht: getComputedStyle(el).fontWeight });
        const l = document.querySelector('.weetje--link');
        const buur = document.querySelector('.weetje:not(.weetje--link) .weetje__tekst');
        const r = l.getBoundingClientRect();
        return { link: m(l.querySelector('.weetje__tekst')), buur: m(buur), hoogte: r.height + 8 };
      });
      expect(meting.link).toEqual(meting.buur);
      expect(meting.hoogte).toBeGreaterThanOrEqual(44);
    }
  });
}
