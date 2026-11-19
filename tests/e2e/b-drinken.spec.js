// Drinken (stap H6, V2-a tot V2-d en E4 uit PLAN.md §12).
import { test, expect } from '@playwright/test';
import { verwachtGelijkeWeetjes } from './weetjes-rij.js';
import { vulTabbladen } from './r-tabbladen-meting.js';
import { wachtOpRust, wachtTotStil } from './r-wacht.js';
import { vasteKlok } from './vaste-klok.js';

const stand = (page) => page.locator('.drinkhoofd .cijfer-groot');
const knopGlas = (page) => page.locator('.drankknop[data-soort="water"]');
// Het aantal dranken van de dag: elk soortblok draagt het aantal in data-aantal.
const aantal = (page) => page.evaluate(() => [...document.querySelectorAll('.drinken__lijst .soortblok[data-aantal]')].reduce((som, e) => som + Number(e.dataset.aantal), 0));

// De instellingen voor glasgrootte en dagdoel komen in een latere stap in Meer; hier gaan ze via de opslag.
async function zetInstelling(page, sleutel, waarde) {
  await page.evaluate(
    ([k, w]) =>
      new Promise((klaar, mislukt) => {
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: k, waarde: w });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [sleutel, waarde],
  );
}

const lokaleDatum = (page, dagen = 0) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const t = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t(d.getMonth() + 1)}-${t(d.getDate())}`;
  }, dagen);

test('V2-a: twee keer Kan erbij geeft 1,6 liter van 2,5 l en twee regels, ook na herladen', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await page.goto('./#/drinken');
  await expect(stand(page)).toContainText('0');
  await expect(page.getByText('Nog niets gedronken vandaag. Eén tik per drank.')).toBeVisible();
  for (let i = 0; i < 2; i++) await knopGlas(page).click();
  await expect(stand(page)).toContainText('1,6');
  await expect(stand(page)).toContainText('liter');
  await expect(page.locator('.drinkhoofd').getByText('van 2,5 l')).toBeVisible();
  await expect.poll(() => aantal(page)).toBe(2);
  await expect(page.locator('.watervulling')).toHaveAttribute('data-vulling', '0.64');
  await page.reload();
  await expect(stand(page)).toContainText('1,6');
  await expect.poll(() => aantal(page)).toBe(2);
  expect(fouten).toEqual([]);
});

test('V2-b: laatste weghalen en een regel weghalen, met terugzetten', async ({ page }) => {
  await page.goto('./#/drinken');
  for (let i = 0; i < 3; i++) await knopGlas(page).click();
  await expect.poll(() => aantal(page)).toBe(3);
  await page.getByRole('button', { name: 'Laatste weghalen' }).first().click();
  await expect(stand(page)).toContainText('1,6');
  await page.locator('.drank__weg').first().click();
  await expect(stand(page)).toContainText('0,8');
  await expect(page.getByText('Weggehaald')).toBeVisible();
  await page.getByRole('button', { name: 'Terugzetten' }).click();
  await expect(stand(page)).toContainText('1,6');
  await page.locator('.drank__weg').first().click();
  await expect(stand(page)).toContainText('0,8');
  await page.reload();
  await expect(stand(page)).toContainText('0,8');
});

test('V2-c: glasgrootte en dagdoel uit de instellingen worden gebruikt', async ({ page }) => {
  await page.goto('./#/drinken');
  await zetInstelling(page, 'drinken.glasMl', 300);
  await zetInstelling(page, 'drinken.dagdoelMl', 3000);
  await page.reload();
  await expect(page.locator('.drinkhoofd').getByText('van 3 l')).toBeVisible();
  await knopGlas(page).click();
  await expect(stand(page)).toContainText('0,3');
  await expect(page.locator('.drinken__lijst')).toContainText('300 ml'); // het bedrag van het dagdeel
  await page.reload();
  await expect(page.locator('.drinkhoofd').getByText('van 3 l')).toBeVisible();
  await expect(stand(page)).toContainText('0,3');
});

test('V2-d: boven het doel telt de teller door, het glas blijft vol en er is geen waarschuwing', async ({ page }) => {
  await page.goto('./#/drinken');
  await zetInstelling(page, 'drinken.glasMl', 500);
  await page.reload();
  await expect(page.getByText('Je dagdoel is gehaald.')).toBeHidden();
  for (let i = 0; i < 6; i++) await knopGlas(page).click(); // 3 l bij een doel van 2,5 l
  await expect(stand(page)).toContainText('3');
  await expect(page.getByText('Je dagdoel is gehaald.')).toBeVisible();
  await expect(page.locator('.watervulling')).toHaveAttribute('data-vulling', '1');
  await expect(page.locator('.watervulling')).toHaveClass(/is-gehaald/);
  await page.reload();
  await expect(stand(page)).toContainText('3');
  await expect(page.locator('.watervulling')).toHaveClass(/is-gehaald/);
  await expect(page.getByText(/waarschuw|te veel|opgelet/i)).toHaveCount(0);
});

test('Dranken: de watertegel voegt één kan van de ingestelde grootte toe (standaard 800 ml), met een melding met Ongedaan maken', async ({ page }) => {
  await page.goto('./#/drinken');
  await expect(page.locator('.drankknop')).toHaveCount(6);
  await expect(page.locator('.drankknop').first()).toHaveAttribute('data-soort', 'water');
  await expect(page.locator('.drankknop').first()).toContainText('Kan water');
  await expect(page.locator('.drankknop').first()).toContainText('800 ml');
  await expect(page.locator('.drinken__andere .label')).toHaveText('Voeg toe');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(stand(page)).toContainText('0,8');
  await expect(page.getByText('Kan water erbij: 800 ml')).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect.poll(() => aantal(page)).toBe(0);
  // Alle zes de tegels zijn minstens 48 px hoog en breed
  for (const k of await page.locator('.drankknop').all()) {
    const doos = await k.boundingBox();
    expect(doos.height).toBeGreaterThanOrEqual(48);
    expect(doos.width).toBeGreaterThanOrEqual(48);
  }
});

test('E4: thee en koffie tellen mee in hun standaardgrootte', async ({ page }) => {
  await page.goto('./#/drinken');
  await page.locator('.drankknop[data-soort="thee"]').click();
  await page.locator('.drankknop[data-soort="koffie"]').click();
  await expect(stand(page)).toContainText('0,35');
  await expect.poll(() => aantal(page)).toBe(2);
  await expect(page.locator('.drinken__lijst')).toContainText('200 ml');
  await expect(page.locator('.drinken__lijst')).toContainText('150 ml');
  await page.reload();
  await expect(stand(page)).toContainText('0,35');
  await expect.poll(() => aantal(page)).toBe(2);
});

test('Drinken: een kan hier is meteen zichtbaar op Vandaag en in het dagboek, en gisteren aanvullen kan', async ({ page }) => {
  await page.goto('./#/drinken');
  await knopGlas(page).click();
  await page.goto('./#/vandaag');
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
  await page.goto('./#/dagboek');
  await expect(page.getByRole('region', { name: 'Drinken' })).toContainText('0,8 l van 2,5 l');

  // Via de dag van gisteren een kan toevoegen aan gisteren
  await page.goto(`./#/drinken/${await lokaleDatum(page, -1)}`);
  await expect(page).toHaveURL(new RegExp(`drinken/${await lokaleDatum(page, -1)}$`));
  await expect(page.getByRole('button', { name: 'Naar vandaag' })).toBeVisible();
  await knopGlas(page).click();
  await expect(stand(page)).toContainText('0,8');
  await page.getByRole('button', { name: 'Naar vandaag' }).click();
  await expect(page).toHaveURL(/#\/drinken$/);
  await expect(stand(page)).toContainText('0,8');
  await page.reload();
  await page.goto(`./#/drinken/${await lokaleDatum(page, -1)}`);
  await expect(stand(page)).toContainText('0,8');
});

test('Ongedaan maken: een strook na elke tik en Laatste weghalen bij het glas, op Drinken en op Vandaag', async ({ page }) => {
  await page.goto('./#/drinken');
  const bovenaan = page.locator('.drinken__andere').getByRole('button', { name: 'Laatste weghalen' });
  await expect(bovenaan).toBeDisabled();
  await knopGlas(page).click();
  await expect(page.getByText('Kan water erbij: 800 ml')).toBeVisible();
  await expect(stand(page)).toContainText('0,8');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(stand(page)).toContainText('0');
  await expect.poll(() => aantal(page)).toBe(0);

  await page.locator('.drankknop[data-soort="thee"]').click();
  await expect(page.getByText('Thee: 200 ml')).toBeVisible();
  await knopGlas(page).click();
  await expect(bovenaan).toBeEnabled();
  await bovenaan.click();
  await expect.poll(() => aantal(page)).toBe(1);

  // Op Vandaag: een kan erbij, weghalen vlak bij de knop
  await page.goto('./#/vandaag');
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,2');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('1');
  await page.locator('.drinkkaart').getByRole('button', { name: 'Laatste weghalen' }).click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,2');
  await page.locator('.drankknop[data-soort="water"]').click();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,2');
  await page.reload();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,2');
});

test('Meer dan het dagdoel drinken kan: 4 kannen van 800 ml geven 3,2 liter bij een doel van 2,5 l', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await page.goto('./#/drinken'); // standaarddoel: 2,5 l, niets via de opslag gezet
  await expect(page.locator('.drinkhoofd').getByText('van 2,5 l')).toBeVisible();
  for (let i = 0; i < 4; i++) await knopGlas(page).click();
  await expect(stand(page)).toContainText('3,2');
  await expect(stand(page)).toContainText('liter');
  await expect(page.locator('.drinkhoofd').getByText('van 2,5 l')).toBeVisible();
  await expect(page.locator('.watervulling')).toHaveAttribute('data-vulling', '1');
  await expect(knopGlas(page)).toBeEnabled();
  await expect.poll(() => aantal(page)).toBe(4);
  await expect(page.locator('.drankknop[data-soort="thee"]')).toBeEnabled();
  await expect(page.getByText(/waarschuw|te veel|opgelet|maximum/i)).toHaveCount(0);

  await page.reload();
  await expect(stand(page)).toContainText('3,2');
  await expect(page.locator('.drinkhoofd').getByText('van 2,5 l')).toBeVisible();

  // Vandaag toont dezelfde stand en laat gewoon nog een kan toe
  await page.goto('./#/vandaag');
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('3,2');
  await expect(page.locator('.drinkkaart').getByText('van 2,5 l')).toBeVisible(); // op Vandaag heet de kaart .drinkkaart; .drinkhoofd bestaat alleen op het tabblad Drinken
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('4');
  await page.locator('.drinkkaart').getByRole('button', { name: 'Laatste weghalen' }).click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('3,2');

  // Laatste weghalen brengt het terug naar 2,4
  await page.goto('./#/drinken');
  await page.locator('.drinken__andere').getByRole('button', { name: 'Laatste weghalen' }).click();
  await expect(stand(page)).toContainText('2,4');
  await expect(page.locator('.drinkhoofd').getByText('van 2,5 l')).toBeVisible();
  await page.reload();
  await expect(stand(page)).toContainText('2,4');
  expect(fouten).toEqual([]);
});

test('Het doel haalt alleen de huidige stand: salie en de zin bij 2,5 l, weer water eronder, weer salie erboven', async ({ page }) => {
  await page.goto('./#/drinken');
  const zin = page.getByText('Je dagdoel is gehaald.', { exact: true }); // exact: de motivatiezin op Vandaag ("... en je dagdoel is gehaald.") bevat dezelfde woorden
  for (let i = 0; i < 4; i++) await knopGlas(page).click(); // 3,2 l
  await expect(stand(page)).toContainText('3,2');
  await expect(zin).toBeVisible();
  await expect(page.locator('.watervulling')).toHaveClass(/is-gehaald/);
  await page.reload();
  await expect(zin).toBeVisible();
  await expect(page.locator('.watervulling')).toHaveClass(/is-gehaald/);

  // Eén kan terug: onder het doel, dus weer gewoon water zonder de zin
  await page.locator('.drinken__andere').getByRole('button', { name: 'Laatste weghalen' }).click();
  await expect(stand(page)).toContainText('2,4');
  await expect(zin).toBeHidden();
  await expect(page.locator('.watervulling')).not.toHaveClass(/is-gehaald/);
  await page.goto('./#/vandaag');
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('2,4');
  await expect(zin).toHaveCount(0);
  await expect(page.locator('.drinkkaart .watervulling')).not.toHaveClass(/is-gehaald/);
  await page.reload();
  await expect(zin).toHaveCount(0);

  // Opnieuw erbij: weer salie met de zin
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('3,2');
  await expect(zin).toBeVisible();
  await expect(page.locator('.drinkkaart .watervulling')).toHaveClass(/is-gehaald/);
  await page.reload();
  await expect(zin).toBeVisible();
});

// BESLISSING 257: de indeling vult de breedte en hoogte, zonder uitgerekte kaarten.
import { vul, meetKaarten } from './leeg-vlak.js';
const rijen = (kaarten) => {
  const perTop = new Map();
  for (const k of kaarten) perTop.set(Math.round(k.top), [...(perTop.get(Math.round(k.top)) ?? []), k]);
  return [...perTop.values()];
};
for (const [b, hg] of [[1690, 1230], [1720, 950]]) {
  for (const n of [0, 2, 8, 15]) {
    test(`Drinken op ${b}x${hg} met ${n} dranken: geen groot leeg vlak, rijen eindigen gelijk en de grafiek houdt zijn hoogte`, async ({ page }) => {
      await page.setViewportSize({ width: b, height: hg });
      await page.goto('./#/drinken');
      const staven = page.locator('.drinken__week .weekstaven');
      await expect(staven).toBeVisible();
      const nul = (await staven.boundingBox()).height;
      await vul(page, { dranken: n });
      await expect(staven).toBeVisible();
      await expect.poll(() => aantal(page)).toBe(n);
      await wachtOpRust(page);
      expect(Math.abs((await staven.boundingBox()).height - nul)).toBeLessThanOrEqual(2);
      const kaarten = await meetKaarten(page, '.drinken__raster');
      expect(kaarten).toHaveLength(6);
      // "Je week in cijfers": de scheidingslijn is hier een lijn zonder eigen element en telt in deze meting als leeg; die kaart wordt met de inkt gemeten in b-drinken-indeling.spec.js (BESLISSING 354).
      for (const k of kaarten) if (!k.naam.includes('drinken__cijferkaart')) expect(k.gat, k.naam).toBeLessThanOrEqual(32);
      for (const rij of rijen(kaarten)) for (const k of rij) expect(Math.abs(k.bodem - rij[0].bodem)).toBeLessThanOrEqual(2);
      if (b === 1690 && n === 8) {
        const onder = await page.evaluate(() => {
          const laatste = [...document.querySelectorAll('.drinken__raster > *')].at(-1).getBoundingClientRect().bottom + scrollY;
          return Math.max(document.documentElement.scrollHeight, innerHeight) - laatste;
        });
        expect(onder).toBeLessThanOrEqual(120);
      }
    });
  }
}

test('Drinken: toevoegen en weghalen past alle kaarten aan', async ({ page }) => {
  await page.goto('./#/drinken');
  await expect(page.locator('.drinken__verloopkaart')).toContainText('Nog niets gedronken vandaag.');
  await page.locator('.drankknop[data-soort="koffie"]').click();
  await expect(stand(page)).toContainText('0,15');
  await expect(page.locator('.drinken__verloopkaart')).toContainText('150 ml');
  await expect(page.locator('.drinken__lijst')).toContainText('Koffie');
  await expect(page.locator('.drinken__cijfers')).toContainText('0,15');
  await expect(page.locator('.drinkhoofd')).toContainText('Nog 2,35 l te gaan.');
  await page.getByRole('button', { name: 'Eén koffie weghalen' }).click();
  await expect(stand(page)).toContainText('0');
  await expect(page.locator('.drinken__verloopkaart')).toContainText('Nog niets gedronken vandaag.');
});

test('Drinken: de kerncijfers kloppen met verzonnen gegevens over een week', async ({ page }) => {
  // Vaste klok (do 12 november 2026): de weekcijfers hingen van de weekdag af (op maandag valt gisteren in de vorige week, R4-19).
  await vasteKlok(page);
  await page.goto('./#/drinken');
  await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const naarTekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const v = indexedDB.open('bloei-dagboek');
        v.onerror = () => mislukt(v.error);
        v.onsuccess = () => {
          const db = v.result;
          const tx = db.transaction('dranken', 'readwrite');
          tx.objectStore('dranken').clear();
          // doel 2,5 l
          const zet = (dagen, soort, ml, aantal) => {
            for (let i = 0; i < aantal; i++) {
              const d = new Date(nu);
              d.setDate(d.getDate() - dagen);
              tx.objectStore('dranken').add({ datum: naarTekst(d), tijdstip: d.getTime() - i * 1000, soort, ml, voorbeeld: false });
            }
          };
          zet(0, 'water', 500, 5); // vandaag 2,5 l: doel gehaald
          zet(1, 'sap', 500, 2); // gisteren 1 l: niet gehaald, dus de reeks is 1
          tx.oncomplete = () => { db.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
  await page.reload();
  const cijfers = page.locator('.drinken__cijfers');
  const dagIndex = await page.evaluate(() => (new Date().getDay() + 6) % 7); // 0 = maandag: gisteren valt dan in de vorige week
  expect(dagIndex).toBe(3); // de vaste klok staat op donderdag
  // BESLISSINGEN 448 en 449: het gemiddelde per dag rekent over alle verstreken dagen van de week (een lege dag telt als 0) en de noemer is
  // altijd 7 dagen. Maandag tot donderdag: (0 + 0 + 1 + 2,5) / 4 = 0,875 l.
  await expect(cijfers).not.toContainText(/over \d+ dag/);
  await expect(cijfers.locator('.kerncijfer').nth(0)).toContainText(/0,8[78]/);
  await expect(cijfers.locator(".kerncijfer").nth(1)).toContainText(/1\s*van 7 dagen/);
  await expect(cijfers.locator('.kerncijfer').nth(2)).toContainText('2,5');
  await expect(cijfers.locator(".kerncijfer").nth(3)).toContainText(/1\s*dag/);
  await expect(cijfers.locator('.verdeling')).toHaveAttribute('aria-label', dagIndex === 0 ? 'Verdeling van deze week: Water 100%' : 'Verdeling van deze week: Water 71%, Sap 29%');
});

test('Drinken op 390 en 360 px: geen horizontale scroll, tikdoel van minstens 48 px', async ({ page }) => {
  for (const b of [390, 360]) {
    await page.setViewportSize({ width: b, height: 844 });
    await page.goto('./#/drinken');
    await vul(page, { dranken: 15 });
    await expect.poll(() => aantal(page)).toBe(15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const k of await page.locator('.drankknop').all()) expect((await k.boundingBox()).height).toBeGreaterThanOrEqual(48);
  }
});

// BESLISSING 257/264: de hele dag per soort in blokken naast elkaar, alle even breed en hoog, zonder scrollbalk.
for (const aantalDranken of [0, 1, 4, 6, 15]) {
  test(`Drinken met ${aantalDranken} dranken: de soortblokken zijn even groot en zonder scrollbalk, en er is geen onderscheid per moment`, async ({ page }) => {
    await page.setViewportSize({ width: 1690, height: 1230 });
    await page.goto('./#/drinken');
    await vul(page, { dranken: aantalDranken });
    await expect.poll(() => aantal(page)).toBe(aantalDranken);
    await expect(page.locator('.drinken__verloopkaart')).toBeVisible(); // bij 0 dranken is de telling meteen 0: wacht tot de kaart er staat
    await wachtOpRust(page); // de kaarten komen rustig op
    const m = await page.evaluate(() => {
      const blokken = [...document.querySelectorAll('.drinken__lijst .soortblok')].map((b) => b.getBoundingClientRect());
      const kaart = document.querySelector('.drinken__verloopkaart');
      return { aantal: blokken.length, breedtes: blokken.map((b) => b.width), hoogtes: blokken.map((b) => b.height), scroll: [kaart, ...kaart.querySelectorAll('*')].every((e) => e.scrollWidth <= e.clientWidth + 1), tekst: document.querySelector('.drinken').innerText };
    });
    expect(m.aantal).toBe(Math.min(aantalDranken, 6));
    if (m.aantal) {
      expect(Math.max(...m.breedtes) - Math.min(...m.breedtes)).toBeLessThanOrEqual(1);
      expect(Math.max(...m.hoogtes) - Math.min(...m.hoogtes)).toBeLessThanOrEqual(1);
    }
    expect(m.scroll).toBe(true);
    expect(m.tekst).not.toMatch(/ochtend|middag|avond/i);
  });
}

// BESLISSING 433: op 1690 px staan de weetjes op één rij met gelijke zichtbare tussenruimte (niet meer even brede kolommen).
test('Drinken: de weetjes staan met gelijke tussenruimte op één rij, beginnen op dezelfde hoogte en hebben de kleur van hun begrip', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/drinken');
  await expect(page.locator('.drinken__weetjes .weetje:not(.weetje--link)')).toHaveCount(3); // (het vierde blok is de link naar de instellingen) de kaart wordt pas getekend als de gegevens er zijn
  await wachtOpRust(page); // de kaarten komen rustig op
  const m = await page.evaluate(() => {
    const w = [...document.querySelectorAll('.drinken__weetjes .weetje:not(.weetje--link)')];
    return { breedtes: w.map((e) => e.getBoundingClientRect().width), tops: w.map((e) => e.querySelector('.weetje__tekst').getBoundingClientRect().top), regels: w.map((e) => Math.round(e.querySelector('.weetje__tekst').getBoundingClientRect().height)), klassen: w.map((e) => e.querySelector('.tegel').className) };
  });
  expect(m.breedtes).toHaveLength(3);
  await verwachtGelijkeWeetjes(page, '.drinken__weetjes', 'Drinken');
  expect(Math.max(...m.tops) - Math.min(...m.tops)).toBeLessThanOrEqual(1);
  expect(Math.max(...m.regels) - Math.min(...m.regels)).toBeLessThanOrEqual(1);
  expect(m.klassen[0]).toContain('tegel--drank');
  expect(m.klassen[2]).toContain('tegel--drank'); // binnen één blok "Goed om te weten" hebben alle tegels de kleur van het tabblad (BESLISSING 323)
});

test('Drinken: een soort weghalen past de dagkaart, de week en de cijfers aan', async ({ page }) => {
  await page.goto('./#/drinken');
  await page.locator('.drankknop[data-soort="water"]').click();
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.getByRole('button', { name: 'Eén water weghalen' })).toBeVisible();
  await page.getByRole('button', { name: 'Eén water weghalen' }).click();
  await expect(stand(page)).toContainText('0,8');
  await expect(page.locator('.drinken__cijfers')).toContainText('0,8');
  await page.getByRole('button', { name: 'Eén water weghalen' }).click();
  await expect(stand(page)).toContainText('0');
  await expect(page.locator('.drinken__lijst')).toContainText('Nog niets');
});

// Hover: alleen het icoon licht op, de knop zelf verandert niet (echte hover, zonder touch).
test.describe('hover op desktop', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1690, height: 1230 } });
  test('een dranktegel: knop gelijk, icoontegel schaalt', async ({ page }) => {
    await page.goto('./#/drinken');
    for (const soort of ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders']) {
      const knop = page.locator(`.drankknop[data-soort="${soort}"]`);
      const stijl = (el) => el.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.boxShadow, c.transform].join('|'); });
      const tegel = knop.locator('.tegel');
      const knopVoor = await stijl(knop);
      const tegelVoor = await stijl(tegel);
      await knop.hover();
      await wachtOpRust(page);
      expect(await stijl(knop), soort).toBe(knopVoor);
      expect(await stijl(tegel), soort).not.toBe(tegelVoor);
    }
  });
});

// ---- Bediening en toegankelijkheid (BESLISSING 330): toetsenbord en aanraking op Drinken.
async function openMetDranken(page, soort = 'gewoon') {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await vulTabbladen(page, soort);
  await page.goto('./#/drinken');
  await page.locator('.drinken__lijst .soortblok').first().waitFor();
  await wachtOpRust(page);
}

test.describe('Drinken met het toetsenbord', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('de focusring van elke weghaalknop valt binnen het vak dat afknipt: niets is afgesneden', async ({ page }) => {
    await openMetDranken(page, 'vol');
    const knoppen = page.locator('.drinken__lijst .drank__weg');
    const n = await knoppen.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      await knoppen.nth(i).focus();
      const r = await page.evaluate((k) => {
        const e = document.querySelectorAll('.drinken__lijst .drank__weg')[k];
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        const uit = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0);
        const ring = { l: b.left - uit, r: b.right + uit, t: b.top - uit, b: b.bottom + uit };
        const vak = e.closest('.drinken__soorten').getBoundingClientRect(); // het vak knipt op zijn eigen rand
        return { zichtbaar: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, links: ring.l - vak.left, rechts: vak.right - ring.r, boven: ring.t - vak.top, onder: vak.bottom - ring.b };
      }, i);
      expect(r.zichtbaar, `ring ${i}`).toBe(true);
      for (const kant of ['links', 'rechts', 'boven', 'onder']) expect(r[kant], `${kant} van ring ${i}`).toBeGreaterThanOrEqual(0);
    }
  });

  test('na een drank weghalen met het toetsenbord blijft de focus op een weghaalknop (en gaat niet naar de bovenkant van de pagina)', async ({ page }) => {
    await openMetDranken(page, 'gewoon');
    const voor = await page.locator('.drinken__lijst .drank__weg').count();
    await page.getByRole('button', { name: /^Eén .+ weghalen$/ }).nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.drinken__lijst .drank__weg')).toHaveCount(voor - 1);
    await expect(page.locator('.drinken__lijst .drank__weg:focus')).toHaveCount(1);
    // tot er niets meer is: de focus gaat naar de eerste drankknop
    for (let i = 0; i < voor; i++) {
      const nog = await page.locator('.drinken__lijst .drank__weg').count();
      if (!nog) break;
      await page.locator('.drinken__lijst .drank__weg').last().focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.drinken__lijst .drank__weg')).toHaveCount(nog - 1);
    }
    await expect(page.locator('.drinken__lijst .drank__weg')).toHaveCount(0);
    await expect(page.locator('.drankknop').first()).toBeFocused();
  });
});

test.describe('Drinken met aanraking', () => {
  test('de link "Dagdoel en groottes aanpassen" heeft een tikvlak van minstens 44 px hoog, zonder dat het blok hoger wordt', async ({ page }) => {
    await openMetDranken(page, 'gewoon');
    const m = await page.evaluate(() => {
      const l = document.querySelector('.drinken__weetjes .weetje--link');
      const na = getComputedStyle(l, '::after');
      const r = l.getBoundingClientRect();
      const s = getComputedStyle(l);
      // de ruimte die de rij op de indeling inneemt (marge-doos): de hoogte plus de (negatieve) marges boven en onder
      const inDeling = r.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
      return { hoogte: r.height, inDeling, vlakHoog: parseFloat(na.height), vlakBreed: parseFloat(na.width), breed: r.width };
    });
    // BESLISSING 182/426: het tikvlak is minstens 44 px hoog (de link zelf en het vlak eromheen)
    expect(m.hoogte, JSON.stringify(m)).toBeGreaterThanOrEqual(43.5);
    expect(m.vlakHoog, JSON.stringify(m)).toBeGreaterThanOrEqual(44);
    expect(m.vlakBreed).toBeGreaterThanOrEqual(m.breed - 1);
    // de rij neemt op de indeling haar ruimte van ± 40 px (de tegel) in: het tikvlak groeit zonder de rij mee te rekken
    expect(m.inDeling, JSON.stringify(m)).toBeLessThanOrEqual(41);
    // een tik 3 px boven de zichtbare rand van de link werkt ook
    await page.locator('.drinken__weetjes .weetje--link').evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await wachtTotStil(page, () => page.locator('.drinken__weetjes .weetje--link').boundingBox()); // de pagina schuift zacht; wacht tot ze stilstaat
    const doel = await page.locator('.drinken__weetjes .weetje--link').boundingBox();
    await page.touchscreen.tap(doel.x + doel.width / 2, doel.y - 3);
    await expect(page).toHaveURL(/#\/meer\/instellingen/);
  });

  test('elke weekstaaf is een tikvlak over de volle kolombreedte en -hoogte (de staaf zelf blijft smaller), minstens 44 px', async ({ page }) => {
    await openMetDranken(page, 'gewoon');
    const m = await page.evaluate(() =>
      [...document.querySelectorAll('.drinken__week .weekstaaf')].map((a) => {
        const r = a.getBoundingClientRect();
        return { b: r.width, h: r.height, balk: a.querySelector('.weekstaaf__balk').getBoundingClientRect().width };
      }),
    );
    expect(m).toHaveLength(7);
    for (const s of m) {
      expect(s.b).toBeGreaterThanOrEqual(43.5);
      expect(s.h).toBeGreaterThanOrEqual(43.5);
      expect(s.balk).toBeLessThan(s.b);
    }
  });
});

// BESLISSING 355 en 356: de kleuren van Drinken horen bij de familie van Drinken, niet bij het accent (roze) of de gezondheid (salie), in elk thema.
async function zaaiDagdoelGehaald(page) {
  await page.goto('./#/drinken');
  await page.waitForSelector('.drinken .drinkhoofd');
  await wachtOpRust(page);
  await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const nu = new Date();
        const v = indexedDB.open('bloei-dagboek');
        v.onerror = () => mislukt(v.error);
        v.onsuccess = () => {
          const db = v.result;
          const tx = db.transaction('dranken', 'readwrite');
          tx.objectStore('dranken').clear();
          for (let i = 0; i < 5; i++) tx.objectStore('dranken').add({ datum: `${nu.getFullYear()}-${t2(nu.getMonth() + 1)}-${t2(nu.getDate())}`, tijdstip: nu.getTime() - i * 1000, soort: 'water', ml: 500, voorbeeld: false });
          tx.oncomplete = () => { db.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
  await page.reload();
  await page.waitForSelector('.drinkhoofd__gehaald:not([hidden])');
  await wachtOpRust(page);
}

for (const thema of ['poeder', 'salie', 'nacht']) {
  test(`Drinken in ${thema}: drankknoppen, "Laatste weghalen" en het gehaalde dagdoel in de kleuren van Drinken`, async ({ page }) => {
    await zaaiDagdoelGehaald(page);
    await page.evaluate((t) => (t === 'poeder' ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', t)), thema);
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      // Elke kleur wordt via een canvas naar rgb omgezet, zodat color-mix-waarden vergelijkbaar zijn.
      const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgb = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const kaartVoor = (e) => { for (let x = e; x; x = x.parentElement) { const a = getComputedStyle(x).backgroundColor; if (!/rgba\(.*, 0\)|transparent/.test(a)) return a; } return 'rgb(255,255,255)'; };
      const probe = (token, eigenschap = 'color') => { const p = document.createElement('i'); p.style[eigenschap] = `var(${token})`; document.body.append(p); const k = rgb(getComputedStyle(p)[eigenschap]); p.remove(); return k; };
      const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const knop = document.querySelector('.drinken__andere .drankknop');
      const vlak = rgb(getComputedStyle(knop).backgroundColor);
      const naam = rgb(getComputedStyle(knop.querySelector('.drankknop__naam')).color);
      const ml = rgb(getComputedStyle(knop.querySelector('.drankknop__ml')).color);
      const weg = document.querySelector('.drinken__laatste .knop--tekst');
      const wegKleur = rgb(getComputedStyle(weg).color);
      const kaartKleur = rgb(kaartVoor(weg));
      const fill = rgb(getComputedStyle(document.querySelector('.drinkhoofd .watervulling__vlak')).fill);
      const baan = rgb(getComputedStyle(document.querySelector('.drinkhoofd .drinkbaan__vulling')).backgroundColor);
      return {
        vlak, drankVlak: probe('--drank-vlak', 'color'), accentSoft: probe('--c-accent-soft'), surfaceSoft: probe('--c-surface-soft'),
        naamContrast: contrast(naam, vlak), mlContrast: contrast(ml, vlak),
        wegKleur, waterTekst: probe('--c-water-text'), accentTekst: probe('--c-accent-text'), wegContrast: contrast(wegKleur, kaartKleur),
        fill, baan, gehaald: rgb(getComputedStyle(knop.querySelector('.tegel')).color), gezondheid: probe('--c-health'),
        zin: document.querySelector('.drinkhoofd__gehaald')?.textContent ?? '', zinZichtbaar: !document.querySelector('.drinkhoofd__gehaald').hidden,
      };
    });
    expect(m.vlak).toEqual(m.drankVlak);
    expect(m.vlak).not.toEqual(m.accentSoft);
    expect(m.vlak).not.toEqual(m.surfaceSoft);
    expect(m.naamContrast, 'naam op het vlak').toBeGreaterThanOrEqual(4.5);
    expect(m.mlContrast, 'milliliters op het vlak').toBeGreaterThanOrEqual(4.5);
    expect(m.wegKleur).toEqual(m.waterTekst);
    expect(m.wegKleur).not.toEqual(m.accentTekst);
    expect(m.wegContrast, 'Laatste weghalen op de kaart').toBeGreaterThanOrEqual(4.5);
    expect(m.fill, 'glas bij gehaald doel').toEqual(m.gehaald);
    expect(m.baan, 'balk bij gehaald doel').toEqual(m.gehaald);
    expect(m.fill).not.toEqual(m.gezondheid);
    expect(m.baan).not.toEqual(m.gezondheid);
    expect(m.zinZichtbaar).toBe(true);
    expect(m.zin).toContain('gehaald');
  });
}
