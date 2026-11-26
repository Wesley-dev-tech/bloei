// BESLISSING 275: een spuit herken je aan de naam ("spuit" of "injectie"); een ander periodiek supplement krijgt het supplement-icoon.
// Op de dag van een geplande beurt staat die ook als rij in de kaart Supplementen op Vandaag. Alleen verzonnen supplementnamen.
import { test, expect } from '@playwright/test';
import { vul } from './leeg-vlak.js';
import { schermKlaar } from './wacht.js';
import { wachtTotWaar } from './r-wacht.js'; // wachtTotWaar: page.waitForFunction wacht niet op een Promise

const DAG = '2026-11-14'; // een zaterdag
const NU = new Date(2026, 10, 14, 10, 0, 0);

const SPUIT = { naam: 'Testspuit ijzer', hoeveelheid: 'een volledige ampule', ritme: { soort: 'interval', dagen: 14, start: DAG } };
const SPUIT2 = { naam: 'Testinjectie', hoeveelheid: 'een halve ampule', ritme: { soort: 'interval', dagen: 14, start: DAG } };
const TABLET = { naam: 'Weektablet', hoeveelheid: 'een tablet', ritme: { soort: 'interval', dagen: 7, start: '2026-11-17' } };
const TABLET_VANDAAG = { ...TABLET, ritme: { soort: 'interval', dagen: 7, start: DAG } };

// Schrijft de supplementen rechtstreeks in de opslag: drie dagelijkse momenten en de gevraagde periodieke supplementen, zonder innames.
async function seed(page, periodiek) {
  await page.evaluate(
    ([lijst]) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          ['ochtend', 'middag', 'avond'].forEach((m, i) => tx.objectStore('supplementen').add({ naam: 'Testmiddel ' + m, dosis: '', hoeveelheid: '', aanwijzing: '', momenten: [m], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }));
          lijst.forEach((s, i) => tx.objectStore('supplementen').add({ naam: s.naam, dosis: '', hoeveelheid: s.hoeveelheid, aanwijzing: '', momenten: [], ritme: s.ritme, volgorde: 10 + i, actief: true, voorbeeld: false, aangemaaktOp: 1 }));
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => fout(tx.error);
        };
      }),
    [periodiek],
  );
  await page.reload();
}

async function begin(page, periodiek, hash = './#/vandaag', klok = NU) {
  await page.clock.setFixedTime(klok);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag h1')).toBeVisible();
  await seed(page, periodiek);
  if (hash !== './#/vandaag') await page.goto(hash);
  await page.waitForTimeout(1300); // de kaarten komen zacht op
}

// De paden van het icoon in een element, om spuitje en pilletje te kunnen onderscheiden.
const pad = (loc) => loc.locator('svg').first().evaluate((s) => s.innerHTML);

const rijen = (page) => page.locator('.suppkaart .momentrij');

// Wacht tot de beurt van DAG echt (niet) afgevinkt in de database staat: een afgevinkte beurt is een rij in momentinnames met
// moment 'dag' en een tijdstip (src/data/agenda.js). Het scherm toont het vinkje meteen, de opslag volgt; een herlading of een
// ander scherm te vroeg leest of breekt de oude stand.
const beurtInDb = (page, afgevinkt) =>
  wachtTotWaar(
    page,
    ([datum, verwacht]) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(false);
        open.onsuccess = () => {
          const vraag = open.result.transaction('momentinnames').objectStore('momentinnames').getAll();
          vraag.onsuccess = () => {
            open.result.close();
            klaar(vraag.result.some((r) => r.datum === datum && r.moment === 'dag' && r.tijdstip) === verwacht);
          };
          vraag.onerror = () => klaar(false);
        };
      }),
    [DAG, afgevinkt],
  );

test('Kalender: een supplement met "spuit" of "injectie" in de naam krijgt het spuitje, een ander periodiek supplement het pilletje', async ({ page }) => {
  await begin(page, [SPUIT, TABLET]);
  const spuitPad = await pad(page.locator('.suppkaart .kaartkop .tegel')); // het supplement-icoon (capsules)
  const cel = (n) => page.locator(`.kalkaart .kalender__dag[data-datum="2026-11-${n}"] .kalender__spuit`);
  await expect(cel(14)).toHaveCount(1);
  await expect(cel(17)).toHaveCount(1);
  const syringe = await pad(cel(14));
  const capsules = await pad(cel(17));
  expect(syringe).not.toBe(capsules);
  expect(capsules).toBe(spuitPad);
  expect(await pad(cel(28))).toBe(syringe);
  expect(await pad(cel(24))).toBe(capsules);
  const legenda = page.locator('.kalkaart__legenda .kalkaart__legendaitem');
  await expect(legenda).toHaveText(['geplande spuit', 'gepland']);
});

test('Kalender: zonder spuit zegt de legenda "gepland", zonder ander periodiek supplement blijft "geplande spuit"', async ({ page }) => {
  await begin(page, [TABLET]);
  await expect(page.locator('.kalkaart__legenda .kalkaart__legendaitem')).toHaveText(['gepland']);
  await seed(page, [SPUIT]);
  await schermKlaar(page, '#/vandaag'); // na het herladen is Vandaag opnieuw uitgebouwd (geen vaste wachttijd)
  await expect(page.locator('.kalkaart__legenda .kalkaart__legendaitem')).toHaveText(['geplande spuit']);
  await seed(page, []);
  await schermKlaar(page, '#/vandaag');
  // geen enkel teken in de maand: toch het bolletje van alle supplementen met zijn uitleg, zodat de kaart niet verspringt
  await expect(page.locator('.kalkaart__legenda .kalkaart__legendaitem')).toHaveText(['alle supplementen genomen']);
});

test('Maand: het kerncijfer telt alleen spuiten; zonder spuiten heet het Gepland; legenda en tegels volgen de naam', async ({ page }) => {
  await begin(page, [SPUIT, TABLET], './#/dagboek/maand/2026-11');
  const kc = page.locator('.maand__kc').last();
  await expect(kc.locator('.maand__kclabel')).toHaveText('Spuiten');
  await expect(kc.locator('.maand__kcwaarde')).toHaveText('2'); // 14 en 28 november; de tabletten (17 en 24) tellen niet mee
  await expect(page.locator('.maand__legenda .maand__legwoord')).toHaveText(['geplande spuit', 'gepland']);
  const dagSpuit = page.locator('.mk__dag[data-datum="2026-11-14"] .kalender__spuit');
  const dagTablet = page.locator('.mk__dag[data-datum="2026-11-17"] .kalender__spuit');
  expect(await pad(dagSpuit)).not.toBe(await pad(dagTablet));
  await expect(page.locator('.maand__dag')).toBeVisible();

  await begin(page, [TABLET], './#/dagboek/maand/2026-11');
  const kc2 = page.locator('.maand__kc').last();
  await expect(kc2.locator('.maand__kclabel')).toHaveText('Gepland');
  await expect(kc2.locator('.maand__kcwaarde')).toHaveText('2'); // 17 en 24 november
  await expect(page.locator('.maand__legenda .maand__legwoord')).toHaveText(['gepland']);
});

test('Vandaag: op de dag van een spuit staat de rij in de kaart, afvinken blijft na herladen en staat ook in de dag van het Dagboek', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await begin(page, [SPUIT, TABLET]);
  await expect(rijen(page)).toHaveCount(4);
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('0 van 4');
  const rij = page.locator('.suppkaart .momentrij[data-moment="beurt"]');
  await expect(rij).toHaveCount(1);
  await expect(rij.locator('.rij__titel')).toHaveText('Testspuit ijzer');
  await expect(rij.locator('.rij__sub')).toHaveText('een volledige ampule');
  // het spuitje, niet het pilletje
  expect(await pad(rij.locator('.tegel'))).not.toBe(await pad(page.locator('.suppkaart .momentrij[data-moment="ochtend"] .tegel')));
  // het bolletje van alle supplementen en de motivator blijven van de drie momenten afhangen: de spuit zelf is niet bij de momenten geteld
  await expect(page.locator('.vandaag .momentrij[data-moment="ochtend"]')).toHaveAttribute('aria-checked', 'false');

  await rij.click();
  await expect(rij).toHaveAttribute('aria-checked', 'true');
  await expect(rij.locator('.rij__sub')).toHaveText('Gezet om 10.00 uur');
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('1 van 4');
  await beurtInDb(page, true);
  await page.reload();
  await expect(rij).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('1 van 4');

  // dezelfde stand in de dag van het Dagboek
  await page.goto('./#/dagboek/dag/' + DAG);
  const dagRij = page.locator('.dag__spuit');
  await expect(dagRij).toHaveCount(1);
  await expect(dagRij).toHaveAttribute('aria-checked', 'true');

  // opnieuw tikken op Vandaag haalt het vinkje weg
  await page.goto('./#/vandaag');
  await rij.click();
  await expect(rij).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('0 van 4');
  await beurtInDb(page, false);

  // afvinken in de dag van het Dagboek staat daarna ook op Vandaag
  await page.goto('./#/dagboek/dag/' + DAG);
  await page.locator('.dag__spuit').click();
  await expect(page.locator('.dag__spuit')).toHaveAttribute('aria-checked', 'true');
  await beurtInDb(page, true);
  await page.goto('./#/vandaag');
  await expect(rij).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('1 van 4');
  expect(fouten).toEqual([]);
});

test('BESLISSING 286: afvinken en terugzetten in de dag, in het paneel van de maand en op Vandaag, overal dezelfde stand, ook na herladen', async ({ page }) => {
  await begin(page, [SPUIT], './#/dagboek/dag/' + DAG);
  const dagRij = page.locator('.dag__spuit');
  await dagRij.click();
  await expect(dagRij).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.strook__tekst').last()).toHaveText('Testspuit ijzer afgevinkt');
  await beurtInDb(page, true);
  // terugzetten in de dag
  await dagRij.click();
  await expect(dagRij).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.strook__tekst').last()).toHaveText('Testspuit ijzer teruggezet');
  // Ongedaan maken zet het vinkje weer
  await page.locator('.strook__actie').last().click();
  await expect(dagRij).toHaveAttribute('aria-checked', 'true');
  await beurtInDb(page, true);
  await page.reload();
  await expect(page.locator('.dag__spuit')).toHaveAttribute('aria-checked', 'true');
  // zichtbaar op Vandaag, daar terugzetten
  await page.goto('./#/vandaag');
  const rij = page.locator('.suppkaart .momentrij[data-moment="beurt"]');
  await expect(rij).toHaveAttribute('aria-checked', 'true');
  await rij.click();
  await expect(rij).toHaveAttribute('aria-checked', 'false');
  await beurtInDb(page, false);
  await page.reload();
  await expect(rij).toHaveAttribute('aria-checked', 'false');
  await page.goto('./#/dagboek/dag/' + DAG);
  await expect(page.locator('.dag__spuit')).toHaveAttribute('aria-checked', 'false');
  // het paneel van de maand: afvinken en terugzetten met dezelfde knop
  await page.goto('./#/dagboek/maand/2026-11');
  await page.locator(`.mk__dag[data-datum="${DAG}"]`).click();
  const paneelKnop = page.locator('.maand__paneel .knop--klein');
  await paneelKnop.click();
  await expect(paneelKnop).toHaveText('Afgevinkt');
  await beurtInDb(page, true);
  await page.goto('./#/vandaag');
  await expect(rij).toHaveAttribute('aria-checked', 'true');
  await page.goto('./#/dagboek/maand/2026-11');
  await page.locator(`.mk__dag[data-datum="${DAG}"]`).click();
  await page.locator('.maand__paneel .knop--klein').click();
  await expect(page.locator('.maand__paneel .knop--klein')).toHaveText('Afvinken');
  await beurtInDb(page, false);
  await page.goto('./#/vandaag');
  await expect(rij).toHaveAttribute('aria-checked', 'false');
});

test('Vandaag: een periodiek supplement zonder "spuit" in de naam staat als rij met het pilletje en "Genomen om"', async ({ page }) => {
  await begin(page, [SPUIT, TABLET], './#/vandaag', new Date(2026, 10, 17, 9, 30, 0));
  await expect(rijen(page)).toHaveCount(4);
  const rij = page.locator('.suppkaart .momentrij[data-moment="beurt"]');
  await expect(rij.locator('.rij__titel')).toHaveText('Weektablet');
  await expect(rij.locator('.rij__sub')).toHaveText('een tablet');
  expect(await pad(rij.locator('.tegel'))).toBe(await pad(page.locator('.suppkaart .kaartkop .tegel')));
  await rij.click();
  await expect(rij.locator('.rij__sub')).toHaveText('Genomen om 9.30 uur');
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('1 van 4');
});

test('Vandaag: op een dag zonder beurt verandert de kaart niet', async ({ page }) => {
  await begin(page, [TABLET], './#/vandaag');
  await expect(rijen(page)).toHaveCount(3);
  await expect(page.locator('.suppkaart .kaartkop .cijfer')).toHaveText('0 van 3');
});

for (const [breedte, hoogte] of [[1690, 1230], [1280, 900]]) {
  test(`Indeling ${breedte}x${hoogte}: Drinken en Supplementen even hoog met drie, vier en vijf rijen, vinkvakken op dezelfde x`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.clock.setFixedTime(NU);
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag h1')).toBeVisible();
    await vul(page, { dranken: 5, maaltijden: 3 });
    for (const [lijst, aantal] of [[[], 3], [[SPUIT], 4], [[SPUIT, SPUIT2], 5]]) {
      await seed(page, lijst);
      await page.waitForTimeout(1300);
      await expect(rijen(page)).toHaveCount(aantal);
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const rijHoogtes = [...document.querySelectorAll('.suppkaart .momentkant')].map((e) => e.getBoundingClientRect().height);
        const vinkx = [...document.querySelectorAll('.suppkaart .vinkvak__vak')].map((e) => e.getBoundingClientRect().right);
        const tegelx = [...document.querySelectorAll('.suppkaart .momentrij .tegel')].map((e) => e.getBoundingClientRect().left);
        return { drinken: r('.drinkkaart').height, supp: r('.suppkaart').height, drinkenTop: r('.drinkkaart').top, suppTop: r('.suppkaart').top, rijHoogtes, vinkx, tegelx };
      });
      expect(Math.abs(m.drinken - m.supp), `Drinken ${m.drinken} en Supplementen ${m.supp} bij ${aantal} rijen`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.drinkenTop - m.suppTop)).toBeLessThanOrEqual(1);
      expect(Math.max(...m.rijHoogtes) - Math.min(...m.rijHoogtes), `rijen ${m.rijHoogtes}`).toBeLessThanOrEqual(1.5);
      if (aantal > 3) expect(Math.min(...m.rijHoogtes), `rijhoogte bij ${aantal} rijen`).toBeGreaterThanOrEqual(52);
      expect(Math.max(...m.vinkx) - Math.min(...m.vinkx), 'vinkvakken op dezelfde x').toBeLessThanOrEqual(0.5);
      expect(Math.max(...m.tegelx) - Math.min(...m.tegelx), 'tegels op dezelfde x').toBeLessThanOrEqual(0.5);
      // Schermafbeelding alleen op verzoek (SHOTDIR)
      if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/spuit-${breedte}-${aantal}.png`, fullPage: false });
    }
  });
}

test('390 px: met een beurt vandaag geen horizontale scroll en de rij past in de kaart', async ({ page }) => {
  await begin(page, [SPUIT, SPUIT2]);
  await expect(rijen(page)).toHaveCount(5);
  const m = await page.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(m.breed).toBeLessThanOrEqual(m.scherm);
  const kader = await page.evaluate(() => {
    const k = document.querySelector('.suppkaart').getBoundingClientRect();
    return [...document.querySelectorAll('.suppkaart .momentrij')].every((r) => r.getBoundingClientRect().right <= k.right + 0.5 && r.getBoundingClientRect().left >= k.left - 0.5);
  });
  expect(kader).toBe(true);
  await page.goto('./#/dagboek/dag/' + DAG);
  await expect(page.locator('.dag__spuit')).toHaveCount(2);
  const breed = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(breed).toBe(true);
});
