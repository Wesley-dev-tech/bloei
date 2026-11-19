// BESLISSING 465 in Safari (WebKit): wie teruggaat naar een scherm, komt terug op de plaats waar hij was, met de focus op de rij van vertrek.
// Wegen terug: de teruglink in de schermkop, de terugknop van de browser, en het tabblad van het scherm waarin ze zit (Algemeen vanuit een
// instelscherm: terug naar het beginscherm van dat tabblad, zoals een tabbalk op iOS). Een ander tabblad blijft vooruit: bovenaan.
// Draait in elke browser van de config; bedoeld voor WebKit met een iPhone-formaat (390x660 en 440x760, isMobile, hasTouch, deviceScaleFactor 3).
// Playwright kent in mobiel WebKit geen wiel- of veeggebaar (mouse.wheel: "not supported in mobile WebKit"): de stand wordt gezet met
// scrollTo, zoals een veeg ze achterlaat; elke tik is een echte tap().
import { test, expect } from '@playwright/test';
import { ALLE_BADGES } from '../../src/logica/badgeregels.js';
import { zaaiAlgemeen } from './r-algemeen-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar, naTekenen } from './wacht.js';

const scrollY = (page) => page.evaluate(() => Math.round(document.scrollingElement.scrollTop));

// Logt elke scroll, scrollTo-aanroep, hashwissel en aanraking vanaf nu; alleen getoond als een meting afwijkt.
async function startLog(page) {
  await page.evaluate(() => {
    const t0 = performance.now();
    const n = () => Math.round(performance.now() - t0);
    window.__log = [];
    if (window.__logAan) return;
    window.__logAan = true;
    window.addEventListener('scroll', () => window.__log.push(`${n()} scroll y=${Math.round(scrollY)} h=${document.scrollingElement.scrollHeight}`), { passive: true });
    window.addEventListener('hashchange', () => window.__log.push(`${n()} hashchange ${location.hash}`));
    for (const g of ['touchstart', 'pointerdown', 'wheel', 'keydown']) window.addEventListener(g, () => window.__log.push(`${n()} ${g}`), { capture: true, passive: true });
    const orig = window.scrollTo.bind(window);
    window.scrollTo = (...a) => {
      orig(...a);
      window.__log.push(`${n()} scrollTo(${JSON.stringify(a)}) y=${Math.round(scrollY)}`);
    };
  });
}

// Zet de stand zo dat het element midden in het venster staat (of 120 px onder de bovenrand); geeft de stand.
async function scrolNaar(page, loc, { boven = false } = {}) {
  await loc.evaluate((el, boven) => window.scrollTo({ top: Math.max(0, Math.round(window.scrollY + el.getBoundingClientRect().top - (boven ? 120 : window.innerHeight / 2))), behavior: 'instant' }), boven);
  await naTekenen(page);
  await page.waitForTimeout(300); // de bewaarde stand in history.state (150 ms)
  return scrollY(page);
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    const r = a.getBoundingClientRect();
    return { tekst: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), inBeeld: r.top >= 0 && r.bottom <= window.innerHeight };
  });
}

async function openAlgemeen(page) {
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  // 'gewoon': zonder profielfoto. Een Blob in IndexedDB lukt niet in een vluchtige WebKit-context van Playwright.
  await zaaiAlgemeen(page, 'gewoon', ALLE_BADGES.map((b) => b.id));
  await page.goto('./#/meer');
  await schermKlaar(page, 'meer');
}

const sch = (page) => page.locator('#scherm');
const menuRij = (page, naam) => sch(page).locator('.meer__menu').getByRole('button', { name: new RegExp('^' + naam) });
const kopKnop = (page, naam) => sch(page).locator('header').getByRole('button', { name: new RegExp(naam) }).first();
const tab = (page, href) => page.locator(`#tabbalk a[href="${href}"]:visible, #zijbalk a[href="${href}"]:visible`).first();

// Eén meting: rij in beeld, tikken, het doelscherm begint bovenaan, terugkeren met `terug`, dan (scherm klaar en 1 s later) stand en focus.
async function meet(page, { rij, doelPad, terugPad, terug, boven = false }) {
  const y = await scrolNaar(page, rij, { boven });
  const rijTekst = await rij.evaluate((el) => el.textContent.trim().replace(/\s+/g, ' ').slice(0, 12));
  await rij.tap();
  await schermKlaar(page, doelPad);
  const vooruit = await scrollY(page);
  await startLog(page);
  await terug(page);
  await schermKlaar(page, terugPad);
  await page.waitForTimeout(1000);
  return { y, rijTekst, vooruit, na: await scrollY(page), focus: await focusInfo(page), log: await page.evaluate(() => window.__log) };
}

function controleer(m, info, naam) {
  const afw = Math.abs(m.na - m.y);
  console.log(`SAFARI-TERUG | ${info.project.name} | ${naam} | voor ${m.y} | na ${m.na} | afwijking ${afw} px | focus "${m.focus.tekst}"`);
  if (afw > 2) console.log('  ' + m.log.join('\n  '));
  expect(m.y, 'de pagina stond naar beneden gescrold').toBeGreaterThan(50);
  expect(m.vooruit, 'vooruit begint bovenaan').toBe(0);
  expect(afw, `terug op de oude stand (${m.y}, gekregen ${m.na})`).toBeLessThanOrEqual(2);
  expect(m.focus.tekst.startsWith(m.rijTekst), `focus op de rij van vertrek ("${m.rijTekst}"), gekregen "${m.focus.tekst}"`).toBe(true);
  expect(m.focus.inBeeld).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await vasteKlok(page);
});

const NAAR_ALGEMEEN = {
  'de teruglink Algemeen': (page) => kopKnop(page, 'Algemeen').tap(),
  'de terugknop van de browser': (page) => page.goBack(),
  'het tabblad Algemeen': (page) => tab(page, '#/meer').tap(),
};

for (const [rijNaam, doelPad] of [
  ['Vergrendeling', 'meer/vergrendeling'],
  ['Herinneringen', 'meer/meldingen'],
]) {
  for (const [hoe, terug] of Object.entries(NAAR_ALGEMEEN)) {
    test(`Algemeen > ${rijNaam} > terug met ${hoe}: zelfde plaats, focus op de rij`, async ({ page }, info) => {
      await openAlgemeen(page);
      const m = await meet(page, { rij: menuRij(page, rijNaam), doelPad, terugPad: 'meer', terug });
      controleer(m, info, `Algemeen>${rijNaam}>${hoe}`);
    });
  }
}

test('Algemeen > Alle favorieten > terug met de teruglink Algemeen: zelfde plaats, focus op de link', async ({ page }, info) => {
  await openAlgemeen(page);
  const m = await meet(page, { rij: sch(page).locator('a[href="#/meer/favorieten"]').first(), doelPad: 'meer/favorieten', terugPad: 'meer', terug: NAAR_ALGEMEEN['de teruglink Algemeen'] });
  controleer(m, info, 'Algemeen>Favorieten>teruglink');
});

test('Dagboek maand > Dag openen > terug met de keuze Maand en met de browser: zelfde plaats, focus op Dag openen', async ({ page }, info) => {
  for (const [hoe, terug] of [
    ['keuze Maand', (p) => sch(p).getByRole('radio', { name: 'Maand' }).tap()],
    ['browser', (p) => p.goBack()],
  ]) {
    await page.goto('./#/dagboek/maand/2026-11-10');
    await schermKlaar(page, 'dagboek');
    const m = await meet(page, { rij: sch(page).getByRole('button', { name: 'Dag openen' }), doelPad: 'dagboek', terugPad: 'dagboek', terug });
    controleer(m, info, `Dagboek maand>Dag openen>${hoe}`);
  }
});

test('een ander tabblad blijft vooruit: Algemeen > tabblad Dagboek > tabblad Algemeen begint bovenaan', async ({ page }) => {
  await openAlgemeen(page);
  expect(await scrolNaar(page, menuRij(page, 'Vergrendeling'))).toBeGreaterThan(50);
  await tab(page, '#/dagboek').tap();
  await schermKlaar(page, 'dagboek');
  expect(await scrollY(page)).toBe(0);
  await tab(page, '#/meer').tap();
  await schermKlaar(page, 'meer');
  expect(await scrollY(page)).toBe(0);
});
