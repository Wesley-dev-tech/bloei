// Dagboek (stap H5, acceptatie van stap 5 en 11 uit PLAN.md §10): dag, week en maand.
import { test, expect } from '@playwright/test';
import { wachtTotWaar, wachtOpRust, maaltijdblad, bovensteVenster, BEWAAR_MAALTIJD } from './r-wacht.js'; // wachtTotWaar: page.waitForFunction wacht niet op een Promise
import { vasteKlok } from './vaste-klok.js';
import { domRustig } from './wacht.js';

// Vaste klok voor het hele bestand (do 12 november 2026, 12:00): de week- en maandgrenzen (maandagVan, vorigeMaand, weekStartVan,
// lokaleDatum(-45)) hingen van de rundag af: maandag, zondag, de eerste van de maand (R4-18, R4-20).
test.beforeEach(async ({ page }) => {
  await vasteKlok(page);
});

const maaltijd = (page, soort) => page.locator(`.maaltijd[data-soort="${soort}"]`);
const kop = (page, soort) => maaltijd(page, soort).locator('> .rij');
// BESLISSING 419: het invulvenster van een maaltijd is een blad boven het scherm; Klaar bewaart en sluit, het kruisje (Sluiten) doet hetzelfde.
const blad = (page, soort) => maaltijdblad(page, soort);
async function klaar(page, soort) {
  await blad(page, soort).getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(blad(page, soort)).toHaveCount(0);
}
async function sluitMetKruisje(page, soort) {
  await blad(page, soort).getByRole('button', { name: 'Sluiten', exact: true }).click();
  await expect(blad(page, soort)).toHaveCount(0);
}

// Wacht tot een waarde van de dag echt in de database staat: de schermen tonen een keuze meteen, de
// opslag volgt een paar milliseconden later. Zonder te wachten kan een herlading de schrijfactie afbreken.
async function wachtOpDag(page, veld, waarde) {
  await wachtTotWaar(page,
    ([v, w]) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(false);
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction('dagen').objectStore('dagen').getAll();
          vraag.onsuccess = () => {
            db.close();
            klaar(vraag.result.some((d) => d[v] === w));
          };
          vraag.onerror = () => klaar(false);
        };
      }),
    [veld, waarde],
  );
}

const lokaleDatum = (page, dagen = 0) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const t = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t(d.getMonth() + 1)}-${t(d.getDate())}`;
  }, dagen);

test('V1: een maaltijd invullen met uur, tekst en gevoel (zonder foto), en na herladen is alles er nog', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await page.goto('./#/dagboek');
  await expect(page.locator('.maaltijd')).toHaveCount(6);

  await kop(page, 'ontbijt').click();
  await expect(blad(page, 'ontbijt')).toHaveAccessibleName('Ontbijt');
  await expect(blad(page, 'ontbijt').locator('input[type="time"]')).toHaveValue(/^\d\d:\d\d$/);
  await blad(page, 'ontbijt').locator('input[type="time"]').fill('07:15');
  await blad(page, 'ontbijt').locator('textarea').fill('havermout met banaan');
  await blad(page, 'ontbijt').locator('.gevoel__optie[data-stap="3"]').click();
  await expect(blad(page, 'ontbijt').locator('input[type="file"], .foto')).toHaveCount(0);
  await expect(blad(page, 'ontbijt').getByRole('button', { name: /foto/i })).toHaveCount(0);

  await klaar(page, 'ontbijt');
  await page.locator('.dagboek .dag textarea').last().fill('rustige dag');
  await page.locator('.dagboek .dag textarea').last().blur();
  await expect(kop(page, 'ontbijt')).toContainText('havermout met banaan');
  await expect(kop(page, 'ontbijt')).toContainText('07:15');
  await expect(kop(page, 'ontbijt').locator('.gevoelicoon[data-stap="3"]')).toBeVisible();
  await expect(kop(page, 'ontbijt').locator('img')).toHaveCount(0);

  await page.reload();
  await expect(kop(page, 'ontbijt')).toContainText('havermout met banaan');
  await expect(kop(page, 'ontbijt')).toContainText('07:15');
  await expect(kop(page, 'ontbijt').locator('.gevoelicoon[data-stap="3"]')).toBeVisible();
  await expect(kop(page, 'ontbijt').locator('img')).toHaveCount(0);
  await expect(page.locator('.dagboek .dag textarea').last()).toHaveValue('rustige dag');
  expect(fouten).toEqual([]);
});

test('V1: gisteren aanvullen, morgen alleen-lezen, een maaltijd verwijderen', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('.maaltijd')).toHaveCount(6);

  await page.getByRole('button', { name: 'Vorige' }).click();
  await expect(page).toHaveURL(new RegExp(`dag/${await lokaleDatum(page, -1)}$`));
  await kop(page, 'avondmaal').click();
  await expect(blad(page, 'avondmaal').locator('input[type="time"]')).toHaveValue('18:30');
  await blad(page, 'avondmaal').locator('textarea').fill('soep met brood');
  await klaar(page, 'avondmaal');
  await expect(kop(page, 'avondmaal')).toContainText('soep met brood');

  // Naar vandaag en dan morgen
  await page.getByRole('button', { name: 'Naar vandaag' }).click();
  await expect(page).toHaveURL(new RegExp(`dag/${await lokaleDatum(page, 0)}$`));
  await page.getByRole('button', { name: 'Volgende' }).click();
  await expect(page).toHaveURL(new RegExp(`dag/${await lokaleDatum(page, 1)}$`));
  await expect(page.getByText('Deze dag is nog niet aan de beurt.')).toBeVisible();
  await kop(page, 'ontbijt').click({ force: true });
  await expect(kop(page, 'ontbijt')).not.toHaveAttribute('aria-haspopup', 'dialog'); // alleen-lezen: de rij opent geen blad
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('dialog textarea')).toHaveCount(0);

  // Gisteren staat er na herladen nog, en verwijderen werkt
  await page.goto(`./#/dagboek/dag/${await lokaleDatum(page, -1)}`);
  await page.reload();
  await expect(kop(page, 'avondmaal')).toContainText('soep met brood');
  await kop(page, 'avondmaal').click();
  await blad(page, 'avondmaal').getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await expect(bovensteVenster(page)).toContainText('Dit avondmaal verwijderen?');
  await bovensteVenster(page).getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0); // het blad gaat mee dicht
  await expect(kop(page, 'avondmaal')).not.toContainText('soep met brood');
  await page.reload();
  await expect(kop(page, 'avondmaal')).not.toContainText('soep met brood');
});

test('E2: stemming en energie kiezen en wissen, en de week en de maand tonen wat er staat', async ({ page }) => {
  await page.goto('./#/dagboek');
  const vandaag = await lokaleDatum(page, 0);
  await page.locator('.dagboek .gevoel__optie[data-stap="4"]').click();
  await page.locator('.dagboek .energie__tik').nth(1).click();
  await wachtOpDag(page, 'stemming', 4);
  await wachtOpDag(page, 'energie', 2);
  await page.reload();
  await expect(page.locator('.dagboek .gevoel__optie[data-stap="4"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.dagboek .energie__tik[aria-checked="true"]')).toHaveAttribute('aria-label', 'rustig'); // BESLISSING 468: de keuze via aria-checked

  // Week
  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('.wk__compactitem')).toHaveCount(7); // zeven rijen op een telefoon, vijf kaartjes in de samenvatting
  await expect(page.locator('.wk__samenvatting')).toBeVisible();
  await expect(page.locator('.week .gevoelicoon[data-stap="4"]').first()).toBeVisible();
  await expect(page.locator('.wk__skaart').first()).toContainText('Eten');

  // Maand
  await page.getByRole('radio', { name: 'Maand' }).click();
  const dag = page.locator(`.mk__dag[data-datum="${vandaag}"]`);
  // BESLISSING 294: geen gezichtje in de cel; de stemming staat in het paneel van de gekozen dag
  await expect(dag).toBeVisible();
  await expect(dag.locator('.mk__stemming, .mk__blad, .mk__energie')).toHaveCount(0);
  await dag.click();
  await expect(page.locator('.maand__dag')).toContainText('blij');
  await page.reload();
  await expect(page.locator(`.mk__dag[data-datum="${vandaag}"]`)).toBeVisible();
  await expect(page.locator(`.mk__dag[data-datum="${vandaag}"] .mk__stemming`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Dag openen' }).click();
  await expect(page).toHaveURL(new RegExp(`dag/${vandaag}$`));

  // Nog eens tikken wist de keuze
  await page.locator('.dagboek .gevoel__optie[data-stap="4"]').click();
  await page.locator('.dagboek .energie__tik').nth(1).click();
  await wachtOpDag(page, 'stemming', null);
  await wachtOpDag(page, 'energie', null);
  await page.reload();
  await expect(page.locator('.dagboek .gevoel__optie[aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator('.dagboek .energie__tik[aria-checked="true"]')).toHaveCount(0); // BESLISSING 468
});

test('Een ongeldige datum, week of maand in de adresbalk gaat terug naar vandaag en zet de hash recht', async ({ page }) => {
  const vandaag = await lokaleDatum(page, 0);
  const maand = vandaag.slice(0, 7);
  const gevallen = [
    ['./#/dagboek/dag/2026-13-45', new RegExp(`#/dagboek/dag/${vandaag}$`)],
    ['./#/dagboek/dag/foo', new RegExp(`#/dagboek/dag/${vandaag}$`)],
    ['./#/dagboek/maand/2026-13', new RegExp(`#/dagboek/maand/${maand}$`)],
    ['./#/dagboek/foo/bar', new RegExp(`#/dagboek/dag/${vandaag}$`)],
    ['./#/drinken/foo', /#\/drinken$/],
    ['./#/drinken/2026-02-30', /#\/drinken$/],
    ['./#/supplementen/foo', /#\/supplementen$/],
  ];
  for (const [pad, verwacht] of gevallen) {
    await page.goto(pad);
    await page.reload();
    await expect(page.locator('#scherm h1').first()).toBeVisible();
    await expect(page).toHaveURL(verwacht);
  }
  // Een echte datum blijft ongemoeid
  await page.goto('./#/dagboek/dag/2026-02-28');
  await expect(page).toHaveURL(/#\/dagboek\/dag\/2026-02-28$/);
  await expect(page.locator('.dagboek')).toContainText('zaterdag 28 februari');
});

test('Bij nul staat er geen telling: geen "0 van" bij supplementen in week en dag', async ({ page }) => {
  await page.goto('./#/dagboek');
  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('.week')).not.toContainText(/Supplementen op 0|0 van \d supplementen/);
  await page.getByRole('radio', { name: 'Maand' }).click();
  await expect(page.locator('.maand')).not.toContainText(/0 van \d supplementen/);
});

const SOORTEN = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
const verwijderKnop = (page, soort) => blad(page, soort).getByRole('button', { name: 'Verwijderen', exact: true });
const bevestigVerwijderen = (page) => bovensteVenster(page).getByRole('button', { name: 'Verwijderen', exact: true }).click();

test('Elke maaltijd is altijd te heropenen, te wijzigen en te verwijderen (alle zes momenten, vandaag en gisteren)', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => ['error', 'warning'].includes(b.type()) && fouten.push(b.text()));
  for (const dag of ['vandaag', 'gisteren']) {
    await page.goto(dag === 'gisteren' ? `./#/dagboek/dag/${await lokaleDatum(page, -1)}` : './#/dagboek');
    await expect(page.locator('.maaltijd')).toHaveCount(6);
    for (const soort of SOORTEN) {
      // Invullen en sluiten
      await kop(page, soort).click();
      await expect(blad(page, soort)).toBeVisible();
      await expect(verwijderKnop(page, soort)).toBeHidden(); // nog niets ingevuld: niets om te verwijderen
      await blad(page, soort).locator('textarea').fill(`eerste ${soort}`);
      await expect(verwijderKnop(page, soort)).toBeVisible(); // meteen zichtbaar tijdens het typen
      await blad(page, soort).locator('input[type="time"]').fill('06:30');
      await blad(page, soort).locator('.gevoel__optie[data-stap="2"]').click();
      await klaar(page, soort);
      await expect(kop(page, soort)).toContainText(`eerste ${soort}`);

      // Heropenen en tekst, uur en gevoel wijzigen
      await kop(page, soort).click();
      await expect(blad(page, soort).locator('textarea')).toHaveValue(`eerste ${soort}`);
      await blad(page, soort).locator('textarea').fill(`tweede ${soort}`);
      await blad(page, soort).locator('input[type="time"]').fill('07:45');
      await blad(page, soort).locator('.gevoel__optie[data-stap="5"]').click();
      await klaar(page, soort);
      await expect(kop(page, soort)).toContainText(`tweede ${soort}`);
      await expect(kop(page, soort)).toContainText('07:45');
    }
    await page.reload();
    for (const soort of SOORTEN) {
      await expect(kop(page, soort)).toContainText(`tweede ${soort}`);
      await expect(kop(page, soort)).toContainText('07:45');
      await expect(kop(page, soort).locator('.gevoelicoon[data-stap="5"]')).toBeVisible();
    }

    // Verwijderen: de rij is leeg, en blijft leeg na herladen
    for (const soort of SOORTEN) {
      await kop(page, soort).click();
      await expect(verwijderKnop(page, soort)).toBeVisible();
      await verwijderKnop(page, soort).click();
      await bevestigVerwijderen(page);
      await expect(kop(page, soort)).not.toContainText(`tweede ${soort}`);
      await expect(kop(page, soort)).not.toContainText('07:45');
      await expect(page.locator('dialog[open]')).toHaveCount(0); // het blad gaat dicht
    }
    await page.reload();
    for (const soort of SOORTEN) await expect(kop(page, soort)).not.toContainText(`tweede ${soort}`);
  }
  expect(fouten).toEqual([]);
});

test('Een lege maaltijd openen, typen, Verwijderen verschijnt, verwijderen en Ongedaan maken zet alles terug', async ({ page }) => {
  await page.goto('./#/dagboek');
  await kop(page, 'tussendoortje').click();
  await expect(blad(page, 'tussendoortje')).toBeVisible();
  await expect(verwijderKnop(page, 'tussendoortje')).toBeHidden();
  await blad(page, 'tussendoortje').locator('input[type="time"]').fill('10:20');
  await blad(page, 'tussendoortje').locator('textarea').fill('een koekje');
  await expect(verwijderKnop(page, 'tussendoortje')).toBeVisible();
  await blad(page, 'tussendoortje').locator('.gevoel__optie[data-stap="4"]').click();
  await klaar(page, 'tussendoortje');
  await expect(kop(page, 'tussendoortje')).toContainText('een koekje');

  await kop(page, 'tussendoortje').click();
  await verwijderKnop(page, 'tussendoortje').click();
  await expect(bovensteVenster(page)).toContainText('Dit tussendoortje verwijderen?');
  await bovensteVenster(page).getByRole('button', { name: 'Laten staan' }).click();
  await expect(blad(page, 'tussendoortje')).toBeVisible(); // "Laten staan" laat het blad open
  await expect(kop(page, 'tussendoortje')).toContainText('een koekje');

  await verwijderKnop(page, 'tussendoortje').click();
  await bevestigVerwijderen(page);
  await expect(page.getByText('Verwijderd', { exact: true })).toBeVisible();
  await expect(kop(page, 'tussendoortje')).not.toContainText('een koekje');
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(kop(page, 'tussendoortje')).toContainText('een koekje');
  await expect(kop(page, 'tussendoortje')).toContainText('10:20');
  await expect(kop(page, 'tussendoortje').locator('.gevoelicoon[data-stap="4"]')).toBeVisible();
  await page.reload();
  await expect(kop(page, 'tussendoortje')).toContainText('een koekje');
  await expect(kop(page, 'tussendoortje')).toContainText('10:20');
  await expect(kop(page, 'tussendoortje').locator('.gevoelicoon[data-stap="4"]')).toBeVisible();
});

test('Een maaltijd met alleen een gevoel, een heel lange tekst of een chip blijft te heropenen en te verwijderen', async ({ page }) => {
  await page.goto('./#/dagboek');
  // Alleen een gevoel
  await kop(page, 'ontbijt').click();
  await blad(page, 'ontbijt').locator('.gevoel__optie[data-stap="3"]').click();
  await expect(verwijderKnop(page, 'ontbijt')).toBeVisible();
  await expect(blad(page, 'ontbijt').getByRole('button', BEWAAR_MAALTIJD)).toBeDisabled(); // Klaar is uit bij een leeg tekstvak
  await sluitMetKruisje(page, 'ontbijt'); // het kruisje doet wat Klaar doet, ook zonder tekst
  await expect(kop(page, 'ontbijt').locator('.gevoelicoon[data-stap="3"]')).toBeVisible();
  await kop(page, 'ontbijt').click();
  await expect(blad(page, 'ontbijt').locator('textarea')).toBeVisible();
  await verwijderKnop(page, 'ontbijt').click();
  await bevestigVerwijderen(page);
  await expect(kop(page, 'ontbijt').locator('.gevoelicoon')).toHaveCount(0);

  // Een heel lange tekst
  const lang = 'havermout met banaan en noten en een lepel honing '.repeat(12);
  await kop(page, 'middagmaal').click();
  await blad(page, 'middagmaal').locator('textarea').fill(lang);
  await klaar(page, 'middagmaal');
  await expect(kop(page, 'middagmaal')).toContainText('havermout met banaan');
  await page.reload();
  await kop(page, 'middagmaal').click();
  await expect(blad(page, 'middagmaal').locator('textarea')).toHaveValue(lang);
  await expect(verwijderKnop(page, 'middagmaal')).toBeVisible();
  await klaar(page, 'middagmaal');

  // Net ingevuld met een favoriet-chip, daarna wijzigen en verwijderen
  await kop(page, 'vieruurtje').click();
  await blad(page, 'vieruurtje').locator('textarea').fill('appel');
  await blad(page, 'vieruurtje').locator('.maaltijd__hart').click();
  await expect(blad(page, 'vieruurtje').locator('.maaltijd__hart')).toHaveAttribute('aria-pressed', 'true');
  await klaar(page, 'vieruurtje');
  await kop(page, 'avondmaal').click();
  await blad(page, 'avondmaal').locator('.chip', { hasText: 'appel' }).click();
  await expect(blad(page, 'avondmaal').locator('textarea')).toHaveValue('appel');
  await expect(verwijderKnop(page, 'avondmaal')).toBeVisible();
  await blad(page, 'avondmaal').locator('textarea').fill('appel met kaas');
  await klaar(page, 'avondmaal');
  await expect(kop(page, 'avondmaal')).toContainText('appel met kaas');
  await kop(page, 'avondmaal').click();
  await verwijderKnop(page, 'avondmaal').click();
  await bevestigVerwijderen(page);
  await expect(kop(page, 'avondmaal')).not.toContainText('appel');
});

test('Dag: drinken toevoegen en weghalen in het Dagboek, met de stand in de kop van de kaart', async ({ page }) => {
  await page.goto('./#/dagboek');
  const drinken = page.getByRole('region', { name: 'Drinken' });
  await expect(drinken).toContainText('0 l van 2,5 l');
  await drinken.locator('.dagdrank[data-soort="water"]').click();
  await expect(drinken).toContainText('0,8 l van 2,5 l');
  await expect(drinken.locator('.dagdranklijst__rij')).toHaveCount(1);
  await drinken.getByRole('button', { name: 'Eén water weghalen' }).click();
  await expect(drinken).toContainText('0 l van 2,5 l');
  await expect(drinken.locator('.dagdranklijst__rij')).toHaveCount(0);
});

test('Dag: zonder supplementen staat er een rustige uitnodiging, en de kaart leidt naar het tabblad', async ({ page }) => {
  await page.goto('./#/dagboek');
  const supplementen = page.getByRole('region', { name: 'Supplementen' });
  await expect(supplementen).toContainText('Nog geen supplementen in je lijst.');
  await supplementen.getByRole('button', { name: 'Eerste supplement toevoegen' }).click();
  await expect(page).toHaveURL(/#\/supplementen$/);
});

test('Week: zeven statische rijen, vandaag is gemarkeerd en een tik op een rij doet niets (BESLISSING 262)', async ({ page }) => {
  await page.goto('./#/dagboek/week');
  await expect(page.locator('.wk__compact')).toHaveCount(7);
  await expect(page.locator('.wk__compact.is-vandaag')).toHaveCount(1);
  const hash = await page.evaluate(() => location.hash);
  await page.locator('.wk__compact.is-vandaag').click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
});

test('Bladeren: de pijltjestoetsen gaan naar de vorige en volgende dag, week en maand', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('.dag__raster')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(new RegExp(`dag/${await lokaleDatum(page, -1)}$`));
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(new RegExp(`dag/${await lokaleDatum(page, 0)}$`));
  await page.goto('./#/dagboek/week');
  await expect(page.locator('.wk__samenvatting')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#\/dagboek\/week\/\d{4}-\d{2}-\d{2}$/);
  await page.getByRole('radio', { name: 'Maand' }).click();
  await expect(page.locator('.maand__kolommen')).toBeVisible();
  await page.evaluate(() => document.activeElement?.blur()); // een keuzerondje houdt de pijltjes voor zichzelf (Dag, Week, Maand)
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#\/dagboek\/maand\/\d{4}-\d{2}$/);
});

// De agenda van periodieke supplementen (BESLISSING 208): een reeks van 14 dagen telt altijd door en staat ook op toekomstige dagen, in volgende
// maanden. Verzonnen supplement; de reeks begint vandaag.
test('Agenda: een periodiek supplement staat om de 14 dagen in de maandkalender, ook in de volgende maanden, en afvinken maakt het teken gevuld', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const start = await lokaleDatum(page, 0);
  await page.evaluate(
    (start) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen'], 'readwrite');
          tx.objectStore('supplementen').add({ naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    start,
  );
  // De verwachte dagen: start + 14 k, per maand, voor deze en de twee volgende maanden
  const verwacht = await page.evaluate((start) => {
    const [j, m, d] = start.split('-').map(Number);
    const t = (x) => String(x).padStart(2, '0');
    const uit = {};
    for (let k = 0; k < 12; k += 1) {
      const x = new Date(j, m - 1, d + 14 * k);
      const sleutel = `${x.getFullYear()}-${t(x.getMonth() + 1)}`;
      (uit[sleutel] ??= []).push(t(x.getDate()));
    }
    return uit;
  }, start);
  for (const maand of Object.keys(verwacht).slice(0, 3)) {
    await page.goto(`./#/dagboek/maand/${maand}`);
    await expect(page.locator('.mk')).toBeVisible();
    const dagen = await page.locator('.mk__dag .kalender__spuit').evaluateAll((els) => els.map((e) => e.closest('.mk__dag').dataset.datum.slice(8)));
    expect(dagen, maand).toEqual(verwacht[maand]);
    // BESLISSING 255: het spuitje is groot genoeg en staat in elke cel op dezelfde plaats (rechtsonder), niet meer onder het cijfer
    const maten = await page.locator('.mk__dag .kalender__spuit').evaluateAll((els) =>
      els.map((e) => {
        const cel = e.closest('.mk__dag').getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return { breedte: r.width, rechts: Math.round(cel.right - r.right), onder: Math.round(cel.bottom - r.bottom) };
      }),
    );
    const minimum = (await page.evaluate(() => window.innerWidth)) < 720 ? 18 : 24;
    for (const m of maten) expect(m.breedte).toBeGreaterThanOrEqual(minimum);
    if (maten.length > 1) for (const m of maten) expect(Math.abs(m.rechts - maten[0].rechts) + Math.abs(m.onder - maten[0].onder)).toBeLessThanOrEqual(2);
  }
  // Vandaag afvinken: het teken wordt gevuld en de reeks verschuift niet
  await page.goto('./#/dagboek/maand');
  await page.locator(`.mk__dag[data-datum="${start}"]`).click();
  await expect(page.locator('.maand__paneel')).toContainText('een halve ampule');
  await page.locator('.maand__paneel').getByRole('button', { name: 'Afvinken' }).click();
  await expect(page.locator(`.mk__dag[data-datum="${start}"] .kalender__spuit`)).toHaveClass(/is-afgevinkt/);
  const na = await page.locator('.mk__dag .kalender__spuit').evaluateAll((els) => els.map((e) => e.closest('.mk__dag').dataset.datum.slice(8)));
  expect(na).toEqual(verwacht[Object.keys(verwacht)[0]]);
});

// BESLISSING 211: een maandreeks met tot op haar eerste datum heeft precies één beurt: in die maand staat het teken alleen op die dag, in de maand erna niet.
test('Agenda: een gestopte reeks heeft het teken alleen op de laatste datum (tot), en niet in de maanden erna', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const einde = await lokaleDatum(page, 20);
  await page.evaluate(
    (einde) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen'], 'readwrite');
          tx.objectStore('supplementen').add({ naam: 'Stopkuur', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'maand', start: einde }, tot: einde, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    einde,
  );
  await page.goto(`./#/dagboek/maand/${einde.slice(0, 7)}`);
  await expect(page.locator('.mk')).toBeVisible();
  const dagen = await page.locator('.mk__dag .kalender__spuit').evaluateAll((els) => els.map((e) => e.closest('.mk__dag').dataset.datum));
  expect(dagen).toEqual([einde]);
  for (const n of [1, 2, 3]) {
    const [j, m] = einde.split('-').map(Number);
    const x = new Date(j, m - 1 + n, 1);
    await page.goto(`./#/dagboek/maand/${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
    await expect(page.locator('.mk')).toBeVisible();
    await expect(page.locator('.mk__dag .kalender__spuit')).toHaveCount(0);
  }
});

// BESLISSING 260: het dagoverzicht is compact en gevuld. Geen uitgerekte maaltijdrij, geen leeg vlak in een kaart, de twee kolommen eindigen gelijk,
// en op een telefoon geen horizontale scroll.
import { vul, meetKaarten } from './leeg-vlak.js';

// Vult de opslag aan met wat vul() niet kent: lange maaltijdteksten, drie supplementen (ochtend, middag, avond) met twee afgevinkte momenten en een geplande spuit.
async function vulDagExtra(page, { lang = false, supplementen = false, spuit = false } = {}) {
  const vandaag = await lokaleDatum(page, 0);
  await page.evaluate(
    ([dag, langTekst, metSupp, metSpuit]) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          if (langTekst) {
            const lees = tx.objectStore('maaltijden').getAll();
            lees.onsuccess = () => lees.result.forEach((m) => tx.objectStore('maaltijden').put({ ...m, tekst: 'Pasta met groenten, kaas en een grote kom tomatensaus en daarna nog een stuk fruit en een glas melk voor het slapengaan' }));
          }
          if (metSupp) {
            ['ochtend', 'middag', 'avond'].forEach((m, i) => tx.objectStore('supplementen').add({ naam: 'Testmiddel ' + m, dosis: '', hoeveelheid: '', aanwijzing: '', momenten: [m], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }));
            [1, 2].forEach((id, i) => tx.objectStore('momentinnames').add({ datum: dag, supplementId: id, moment: ['ochtend', 'middag'][i], tijdstip: Date.now(), voorbeeld: false }));
          }
          if (metSpuit) tx.objectStore('supplementen').add({ naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: dag }, volgorde: 9, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => fout(tx.error);
        };
      }),
    [vandaag, lang, supplementen, spuit],
  );
  await page.reload();
}

const COMBINATIES = [
  { naam: 'leeg dag', dranken: 0, maaltijden: 0, lang: false, supplementen: false, spuit: false },
  { naam: '3 dranken, 3 maaltijden, 2 van 3 momenten', dranken: 3, maaltijden: 3, lang: false, supplementen: true, spuit: false },
  { naam: '3 dranken, 3 maaltijden, met geplande spuit', dranken: 3, maaltijden: 3, lang: false, supplementen: true, spuit: true },
  { naam: '15 dranken, 6 lange maaltijden, met spuit', dranken: 15, maaltijden: 6, lang: true, supplementen: true, spuit: true },
  { naam: '15 dranken, geen maaltijden, zonder spuit', dranken: 15, maaltijden: 0, lang: false, supplementen: true, spuit: false },
];

for (const [breedte, hoogte] of [[1690, 1230], [1720, 950]]) {
  for (const c of COMBINATIES) {
    test(`Dag ${breedte}x${hoogte} (${c.naam}): geen uitgerekte rij, geen leeg vlak, de kolommen eindigen gelijk (BESLISSING 260)`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await page.goto('./#/dagboek');
      await expect(page.locator('.dag__eten')).toBeVisible();
      await vul(page, { dranken: c.dranken, maaltijden: c.maaltijden });
      await vulDagExtra(page, c);
      await expect(page.locator('.dag__eten')).toBeVisible();
      await wachtOpRust(page); // de kaarten komen zacht op
      const rijen = await page.locator('.dag__eten .maaltijd').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(rijen).toHaveLength(6);
      for (const hoogteRij of rijen) expect(hoogteRij, 'een maaltijdrij is hoger dan 70 px').toBeLessThanOrEqual(70);
      const kaarten = await meetKaarten(page, '.dag__raster');
      for (const k of kaarten) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { eten: r('.dag__eten'), drinken: r('.dag__drinken'), supp: r('.dag__supplementen'), stemming: r('.dag__stemming'), notitie: r('.dag__notitie') };
      });
      // Opbouw (BESLISSING 299): twee kolommen waarin de Notitie de kortste vult, Stemming en energie eronder; welke kaart in welke kolom staat, wisselt met de vulling
      // (het gelijk eindigen van de kolommen en de plaats van de Notitie meet b-dagboek-dag.spec.js)
      const kolomVan = (k) => (k.left < m.stemming.left + m.stemming.width / 2 ? 'links' : 'rechts');
      expect(Math.abs(m.eten.left - m.stemming.left)).toBeLessThanOrEqual(1);
      expect(kolomVan(m.eten)).toBe('links');
      expect(kolomVan(m.supp) === kolomVan(m.drinken) || kolomVan(m.notitie) === kolomVan(m.supp) || kolomVan(m.notitie) === kolomVan(m.drinken)).toBe(true);
      expect(m.stemming.top).toBeGreaterThanOrEqual(Math.max(m.eten.bottom, m.drinken.bottom, m.supp.bottom, m.notitie.bottom) - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

for (const [breedte, hoogte] of [[390, 844], [360, 780]]) {
  test(`Dag ${breedte}: één kolom, maaltijdrijen compact en geen horizontale scroll (BESLISSING 260)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dag__eten')).toBeVisible();
    await vul(page, { dranken: 15, maaltijden: 6 });
    await vulDagExtra(page, { lang: true, supplementen: true, spuit: true });
    await expect(page.locator('.dag__eten')).toBeVisible();
    await wachtOpRust(page);
    const rijen = await page.locator('.dag__eten .maaltijd').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const hoogteRij of rijen) expect(hoogteRij).toBeLessThanOrEqual(70);
    const volgorde = await page.evaluate(() => ['.dag__eten', '.dag__drinken', '.dag__supplementen', '.dag__stemming', '.dag__notitie'].map((s) => document.querySelector(s).getBoundingClientRect().top));
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
    const kaarten = await meetKaarten(page, '.dag__raster');
    for (const k of kaarten) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

// BESLISSING 260: alles staat op twee lijnen, de linker- en rechterbinnenrand van de kaart: koptegel, balk, eerste en laatste dranktegel, tegel en kruisje van de rij per soort,
// vinkvakken, het uur van Eten en de stand in de kop.
for (const [breedte, hoogte] of [[1690, 1230], [1280, 800], [390, 844], [360, 780]]) {
  test(`Dag ${breedte}: Eten, Drinken en Supplementen staan op de linker- en rechterbinnenrand van hun kaart (BESLISSING 260)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dag__eten')).toBeVisible();
    await vul(page, { dranken: 3, maaltijden: 3 });
    await vulDagExtra(page, { supplementen: true, spuit: true });
    await expect(page.locator('.dag__drinken .dagdranklijst__rij')).toHaveCount(3);
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const binnen = (k) => { const b = r(k); const s = getComputedStyle(k); return { l: b.left + parseFloat(s.paddingLeft), r: b.right - parseFloat(s.paddingRight) }; };
      const links = (k, sel) => [...k.querySelectorAll(sel)].map((e) => r(e).left);
      const rechts = (k, sel) => [...k.querySelectorAll(sel)].map((e) => r(e).right);
      const dr = document.querySelector('.dag__drinken'); const su = document.querySelector('.dag__supplementen'); const et = document.querySelector('.dag__eten');
      // BESLISSING 384: de eerste en laatste dranktegel staan niet meer op de binnenrand; elk icoon staat boven zijn eigen naam (zie r-telefoon.spec.js)
      return {
        dr: binnen(dr), su: binnen(su), et: binnen(et),
        drL: [...links(dr, '.kaartkop .tegel'), ...links(dr, '.drinkbaan'), ...links(dr, '.dagdranklijst__rij .tegel')],
        drR: [...rechts(dr, '.kaartkop__eind'), ...rechts(dr, '.drinkbaan'), ...rechts(dr, '.drank__weg path')],
        suL: [...links(su, '.kaartkop .tegel'), ...links(su, '.momentrij .tegel'), ...links(su, '.dag__spuit .tegel')],
        suR: [...rechts(su, '.kaartkop__eind svg'), ...rechts(su, '.vinkvak__vak'), ...rechts(su, '.dag__spuit .vinkvak__vak')],
        etL: [...links(et, '.kaartkop .tegel'), ...links(et, '.maaltijd > .rij .tegel')],
        etR: [...rechts(et, '.kaartkop__eind'), ...[...et.querySelectorAll('.maaltijd > .rij')].map((x) => r([...x.querySelectorAll('svg')].at(-1)).right)],
      };
    });
    for (const [lijst, rand] of [[m.drL, m.dr.l], [m.drR, m.dr.r], [m.suL, m.su.l], [m.suR, m.su.r], [m.etL, m.et.l], [m.etR, m.et.r]]) {
      expect(lijst.length).toBeGreaterThan(0);
      for (const x of lijst) expect(Math.abs(x - rand), `${x} ligt niet op de binnenrand ${rand}`).toBeLessThanOrEqual(1);
    }
    // Compact ritme in Drinken: de tussenruimtes tussen kop, balk, tegels en de rij per soort zijn klein (de balk zit dicht bij de kop, zodat een lege dag geen leeg vlak krijgt)
    const af = await page.evaluate(() => {
      const d = document.querySelector('.dag__drinken'); const b = (s) => d.querySelector(s).getBoundingClientRect();
      const tegel = d.querySelector('.dagdrank .tegel').getBoundingClientRect(); const naam = [...d.querySelectorAll('.dagdrank__naam')].at(-1).getBoundingClientRect(); // de laatste naam (op de telefoon staan de dranken in twee rijen)
      const rijTegel = d.querySelector('.dagdranklijst__rij .tegel').getBoundingClientRect();
      return [b('.drinkbaan').top - b('.kaartkop').bottom, tegel.top - b('.drinkbaan').bottom, rijTegel.top - naam.bottom];
    });
    for (const x of af) expect(x).toBeLessThanOrEqual(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Dag: dranken staan als één rij per soort; weghalen past aantal en liters aan en laat bij 1x de rij verdwijnen (BESLISSING 260)', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek');
  const drinken = page.getByRole('region', { name: 'Drinken' });
  await expect(drinken).toContainText('0 l van 2,5 l');
  await expect(drinken.locator('.dagdranklijst__rij')).toHaveCount(0);
  for (let i = 0; i < 5; i += 1) await drinken.locator('.dagdrank[data-soort="water"]').click();
  await drinken.locator('.dagdrank[data-soort="thee"]').click();
  await expect(drinken.locator('.dagdranklijst__rij')).toHaveCount(2);
  const water = drinken.locator('.dagdranklijst__rij[data-soort="water"]');
  await expect(water).toContainText('Water');
  await expect(water).toContainText('5x · 4 l');
  // De weghaal-knop: een tikvlak van minstens 44 px, binnen de kaart, zonder een andere tekst of rij te overlappen
  const meet = await water.evaluate((rij) => {
    const knop = rij.querySelector('.drank__weg').getBoundingClientRect();
    const kaart = rij.closest('.kaart').getBoundingClientRect();
    const teksten = [...rij.querySelectorAll('.dagdranklijst__naam, .dagdranklijst__stand, .tegel')].map((e) => e.getBoundingClientRect());
    const snijdt = teksten.some((t) => t.left < knop.right && t.right > knop.left && t.top < knop.bottom && t.bottom > knop.top);
    return { w: knop.width, h: knop.height, binnen: knop.left >= kaart.left && knop.right <= kaart.right && knop.top >= kaart.top && knop.bottom <= kaart.bottom, snijdt };
  });
  expect(meet.w).toBeGreaterThanOrEqual(44);
  expect(meet.h).toBeGreaterThanOrEqual(44);
  expect(meet.binnen).toBe(true);
  expect(meet.snijdt).toBe(false);
  await drinken.getByRole('button', { name: 'Eén water weghalen' }).click();
  await expect(water).toContainText('4x · 3,2 l');
  for (let over = 3; over >= 1; over -= 1) {
    await drinken.getByRole('button', { name: 'Eén water weghalen' }).click();
    await expect(water).toContainText(`${over}x ·`);
  }
  await expect(water).toContainText('1x · 0,8 l');
  await drinken.getByRole('button', { name: 'Eén water weghalen' }).click();
  await expect(drinken.locator('.dagdranklijst__rij[data-soort="water"]')).toHaveCount(0);
  await expect(drinken.locator('.dagdranklijst__rij[data-soort="thee"]')).toHaveCount(1);
});

test('Dag: de momenten tonen het tijdvak of "Genomen om ... uur" en de spuit is een eigen rij die je afvinkt (BESLISSING 260)', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek');
  await expect(page.locator('.dag__eten')).toBeVisible();
  await vulDagExtra(page, { supplementen: true, spuit: true });
  const supp = page.getByRole('region', { name: 'Supplementen' });
  await expect(supp.locator('.momentrij:not(.dag__spuit)')).toHaveCount(3);
  await expect(supp.locator('.momentrij[data-moment="ochtend"]')).toContainText(/Genomen om \d+\.\d\d uur/);
  await expect(supp.locator('.momentrij[data-moment="avond"]')).toContainText('vanaf 17 uur');
  await supp.locator('.momentrij[data-moment="avond"]').click();
  await expect(supp.locator('.momentrij[data-moment="avond"]')).toHaveAttribute('aria-checked', 'true');
  await expect(supp.locator('.momentrij[data-moment="avond"]')).toContainText(/Genomen om/);
  await expect(supp.locator('.kaartkop__eind')).toContainText('3 van 3');
  await expect(supp.locator('.dag__spuit')).toContainText('Testspuit');
  await supp.getByRole('checkbox', { name: /Afvinken: Testspuit/ }).click();
  await expect(supp.locator('.dag__spuit')).toContainText('Afgevinkt');
  await supp.locator('.kaartkop__eind').click();
  await expect(page).toHaveURL(/#\/supplementen\/\d{4}-\d{2}-\d{2}$/);
});

// BESLISSING 260 (uitgangspunt 237 en 241): Stemming en energie is één kaart zoals op het hoofdscherm; gezichtjes en blaadjes staan op dezelfde vijf plaatsen,
// de hint staat in de kaart, de Notitie staat ernaast met een tekstvak dat de kaart vult.
for (const [breedte, hoogte] of [[1690, 1230], [1280, 800], [390, 844]]) {
  for (const [naam, lang, kies] of [['leeg', false, false], ['met keuzes', false, true], ['met lange notitie en keuzes', true, true]]) {
    test(`Dag ${breedte}x${hoogte}: Stemming en energie en Notitie, ${naam} (BESLISSING 260)`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await page.goto('./#/dagboek');
      await expect(page.locator('.dag__notitie')).toBeVisible();
      if (kies) {
        await page.locator('.dag__stemming .gevoel__optie').nth(2).click();
        await page.locator('.dag__stemming .energie__tik').nth(3).click();
        await expect(page.locator('.dag__stemming .gevoel__optie[aria-checked="true"] .gevoel__label')).toHaveText('goed'); // BESLISSING 468: het woord onder de gekozen knop
        await expect(page.locator('.dag__stemming .energie__tik[aria-checked="true"]')).toHaveAttribute('aria-label', 'goed'); // BESLISSING 468: de keuze via aria-checked
        await expect(page.locator('.dag__stemming .dag__wis')).toBeVisible();
      }
      if (lang) await page.locator('.dag__notitie textarea').fill('Een lange notitie over de dag. '.repeat(150));
      await domRustig(page); // de notitie wordt bewaard en de dag opnieuw gemeten
      await wachtOpRust(page);
      const m = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const k = document.querySelector('.dag__stemming');
        const x = (sel) => [...k.querySelectorAll(sel)].map((e) => { const b = r(e); return b.left + b.width / 2; });
        const vak = document.querySelector('.dag__notitie textarea');
        const nk = document.querySelector('.dag__notitie');
        const wis = k.querySelector('.dag__wis');
        return {
          gezicht: x('.gevoel__tegel'), blad: x('.energie__blad'), wisAantal: document.querySelectorAll('.dag__wis').length,
          stemming: r(k), notitie: r(nk), vakBodem: r(vak).bottom, vakHoogte: r(vak).height, notitieBinnenBodem: r(nk).bottom - parseFloat(getComputedStyle(nk).paddingBottom),
          wisBinnen: wis ? r(wis).top >= r(k).top && r(wis).bottom <= r(k).bottom : false,
          scrolt: vak.scrollHeight > vak.clientHeight,
        };
      });
      expect(m.gezicht).toHaveLength(5);
      expect(m.blad).toHaveLength(5);
      // op een telefoon staan de twee delen onder elkaar (dezelfde vijf x-posities); vanaf 1100 px naast elkaar (zie b-dagboek-dag.spec.js)
      if (breedte < 1100) m.gezicht.forEach((g, i) => expect(Math.abs(g - m.blad[i]), 'gezichtje en blaadje delen niet dezelfde x').toBeLessThanOrEqual(1));
      expect(m.wisAantal).toBe(1);
      expect(m.wisBinnen).toBe(true);
      if (breedte >= 1100) {
        // de Notitie staat links onder Eten; Stemming en energie staat eronder over de volle breedte
        expect(m.stemming.top).toBeGreaterThanOrEqual(m.notitie.bottom - 1);
        expect(Math.abs(m.vakBodem - m.notitieBinnenBodem), 'het tekstvak vult de kaart niet').toBeLessThanOrEqual(1);
        expect(m.vakHoogte).toBeGreaterThanOrEqual(96);
        if (lang) expect(m.scrolt).toBe(true);
      } else {
        expect(m.vakHoogte).toBeGreaterThanOrEqual(130);
        expect(m.vakHoogte).toBeLessThanOrEqual(5 * 48 + 2);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// BESLISSING 253: Week = een samenvatting van vijf kaartjes en een weekschema (tabel op een groot scherm, rijen op een telefoon).
// De week van de test is de vorige week, zodat alle zeven dagen voorbij zijn; de gegevens zijn verzonnen.
const maandagVan = (page, dagenTerug) =>
  page.evaluate((n) => {
    const nu = new Date();
    const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - ((nu.getDay() + 6) % 7) - n);
    const t = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t(d.getMonth() + 1)}-${t(d.getDate())}`;
  }, dagenTerug);

const plusDag = (page, datum, n) =>
  page.evaluate(
    ([a, k]) => {
      const [y, mm, dd] = a.split('-').map(Number);
      const x = new Date(y, mm - 1, dd + k);
      const t = (z) => String(z).padStart(2, '0');
      return `${x.getFullYear()}-${t(x.getMonth() + 1)}-${t(x.getDate())}`;
    },
    [datum, n],
  );

const wisAlles = (page) =>
  page.evaluate(
    () =>
      new Promise((k) => {
        const o = indexedDB.open('bloei-dagboek');
        o.onsuccess = () => {
          const db = o.result;
          const winkels = ['dagen', 'maaltijden', 'dranken', 'momentinnames', 'supplementen', 'wegingen'];
          const tx = db.transaction(winkels, 'readwrite');
          for (const s of winkels) tx.objectStore(s).clear();
          tx.oncomplete = () => {
            db.close();
            k();
          };
        };
      }),
  );

// Maandag: 3 maaltijden, 2,25 l, alle drie de momenten, stemming blij, energie 3, een notitie, een geplande beurt en een weging.
// Dinsdag: 1 maaltijd, 0,8 l, alleen de ochtend, stemming blij, geen energie en geen notitie.
async function vulWeek(page, maandag) {
  await page.evaluate(
    (ma) =>
      new Promise((klaar, fout) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const [j, m, d] = ma.split('-').map(Number);
        const dag = (n) => {
          const x = new Date(j, m - 1, d + n);
          return `${x.getFullYear()}-${t2(x.getMonth() + 1)}-${t2(x.getDate())}`;
        };
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const winkels = ['dagen', 'maaltijden', 'dranken', 'momentinnames', 'supplementen', 'wegingen'];
          const tx = idb.transaction(winkels, 'readwrite');
          for (const w of winkels) tx.objectStore(w).clear();
          tx.objectStore('supplementen').put({ id: 1, naam: 'Testmix', dosis: '', hoeveelheid: '1', aanwijzing: '', momenten: ['ochtend', 'middag', 'avond'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.objectStore('supplementen').put({ id: 2, naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: ma }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          const maaltijd = (datum, soort, tekst) => tx.objectStore('maaltijden').put({ datum, soort, tijd: '12:00', tekst, fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
          maaltijd(dag(0), 'ontbijt', 'Havermout met banaan');
          maaltijd(dag(0), 'middagmaal', 'Soep en brood');
          maaltijd(dag(0), 'avondmaal', 'Pasta met groenten');
          maaltijd(dag(1), 'ontbijt', 'Yoghurt');
          for (const [n, ml] of [[0, 250], [0, 500], [0, 1000], [0, 500], [1, 800]]) tx.objectStore('dranken').add({ datum: dag(n), tijdstip: n * 1000 + ml, soort: 'water', ml, voorbeeld: false });
          for (const mo of ['ochtend', 'middag', 'avond']) tx.objectStore('momentinnames').put({ datum: dag(0), supplementId: 1, moment: mo, tijdstip: 1, voorbeeld: false });
          tx.objectStore('momentinnames').put({ datum: dag(1), supplementId: 1, moment: 'ochtend', tijdstip: 1, voorbeeld: false });
          tx.objectStore('dagen').put({ datum: dag(0), notitie: 'Rustige dag, lang gewandeld\nTweede regel', stemming: 4, energie: 3, doelGehaald: true, voorbeeld: false, gewijzigdOp: 1 });
          tx.objectStore('dagen').put({ datum: dag(1), notitie: '', stemming: 4, energie: null, doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
          tx.objectStore('wegingen').put({ week: ma, datum: ma, kg: 71.4, voorbeeld: false, gewijzigdOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    maandag,
  );
  // Het dagdoel staat in deze weektests expliciet op 2000 ml (BESLISSING 274 maakte 2500 ml de standaard); de vlag voorkomt de eenmalige omzetting
  await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'drinken.dagdoelMl', waarde: 2000 });
          tx.objectStore('instellingen').put({ sleutel: 'drinken.dagdoelOmgezet', waarde: true });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
  await page.reload();
}

test('Week (253): de samenvatting en elke rij tonen de juiste cijfers en tekens, een tik opent de dag, bladeren werkt', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(String(e)));
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const ma = await maandagVan(page, 7);
  await vulWeek(page, ma);
  await page.goto(`./#/dagboek/week/${ma}`);
  const kaartjes = page.locator('.wk__skaart');
  await expect(kaartjes).toHaveCount(5);
  await expect(kaartjes.nth(0)).toContainText('Eten');
  await expect(kaartjes.nth(0).locator('.wk__sgetal')).toHaveText('4');
  await expect(kaartjes.nth(0)).toContainText('van 42');
  await expect(kaartjes.nth(1).locator('.wk__sgetal')).toHaveText('3,05'); // 2,25 + 0,8 liter
  await expect(kaartjes.nth(1)).toContainText('dagdoel gehaald op 1 van 7 dagen');
  await expect(kaartjes.nth(2)).toContainText('1 van 7 dagen'); // alle momenten alleen op maandag
  await expect(kaartjes.nth(2)).not.toContainText(/\d+ supplementen/);
  await expect(kaartjes.nth(3)).toContainText('blij');
  await expect(kaartjes.nth(3).locator('.gevoelicoon[data-stap="4"]')).toBeVisible();
  await expect(kaartjes.nth(4)).toContainText('71,4');

  const rijen = page.locator('.wk__rij');
  await expect(rijen).toHaveCount(7);
  await expect(page.locator('table.wk__tabel thead th[scope="col"]').first()).toBeVisible();
  await expect(page.locator('table.wk__tabel tbody th[scope="row"]')).toHaveCount(7);
  const [, m, d] = ma.split('-');
  await expect(rijen.nth(0)).toContainText(`ma ${d}/${m}`);
  const maandag = rijen.nth(0);
  await expect(maandag.locator('.wk__teken--eten')).toHaveCount(6);
  await expect(maandag.locator('.wk__teken--eten.is-aan')).toHaveCount(3);
  await expect(maandag.locator('.wk__teken--eten.is-aan').first()).toContainText('Havermout met banaan'); // tekstalternatief met de tekst van de maaltijd
  await expect(maandag.locator('.wk__teken--moment.is-aan')).toHaveCount(3);
  await expect(maandag.locator('progress')).toHaveAttribute('value', '2000'); // tot het dagdoel
  await expect(maandag).toContainText('2,25 l');
  await expect(maandag.locator('.wk__gezicht')).toContainText('blij');
  await expect(maandag.locator('.energie__blad.is-gevuld')).toHaveCount(3);
  await expect(maandag.locator('.wk__notitie')).toHaveText('Rustige dag, lang gewandeld');
  await expect(maandag.locator('.kalender__spuit')).toHaveCount(1);
  const dinsdag = rijen.nth(1);
  await expect(dinsdag.locator('.wk__teken--eten.is-aan')).toHaveCount(1);
  await expect(dinsdag.locator('.wk__teken--moment.is-aan')).toHaveCount(1);
  await expect(dinsdag).toContainText('0,8 l');
  await expect(dinsdag.locator('.energie')).toHaveCount(0);
  await expect(dinsdag.locator('.wk__notitie')).toHaveCount(0);
  await expect(dinsdag.locator('.kalender__spuit')).toHaveCount(0);
  await expect(page.locator('.wk__rij.is-vandaag')).toHaveCount(0); // de vorige week bevat vandaag niet

  // BESLISSING 262: de week is statisch: geen link, knop of tabindex in de kaart, een klik op een rij verandert niets, de weekzin staat in de kaart
  const kaartVak = page.locator('.wk__schemakaart');
  await expect(kaartVak.locator('a, button, [role="button"], [role="link"]')).toHaveCount(0);
  await expect(page.locator('.wk__skaart').locator('a, button')).toHaveCount(0);
  // focusbaar is alleen de dagrij (BESLISSING 330: één tabstop per dag); de tekens zelf niet
  await expect(page.locator('.wk [tabindex]:not(.wk__rij):not(.wk__compact)')).toHaveCount(0);
  await expect(page.locator('.wk__rij[tabindex="0"]')).toHaveCount(7);
  const hash = await page.evaluate(() => location.hash);
  await dinsdag.locator('.wk__c-notitie').click();
  await dinsdag.locator('.wk__teken--eten').first().click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(await dinsdag.evaluate((e) => getComputedStyle(e).cursor)).not.toBe('pointer');
  const voor = await dinsdag.evaluate((e) => getComputedStyle(e.firstElementChild).backgroundColor + getComputedStyle(e).boxShadow);
  await dinsdag.hover();
  expect(await dinsdag.evaluate((e) => getComputedStyle(e.firstElementChild).backgroundColor + getComputedStyle(e).boxShadow)).toBe(voor);
  const zinBinnen = await page.evaluate(() => {
    const z = document.querySelector('.week__zin').getBoundingClientRect();
    const k = document.querySelector('.wk__schemakaart').getBoundingClientRect();
    return z.top >= k.top && z.bottom <= k.bottom && z.left >= k.left && z.right <= k.right;
  });
  expect(zinBinnen).toBe(true);

  // Bladeren: volgende week is de huidige week, met vandaag gemarkeerd
  await page.goto(`./#/dagboek/week/${ma}`);
  await page.getByRole('button', { name: 'Volgende' }).click();
  await expect(page).toHaveURL(new RegExp(`week/${await maandagVan(page, 0)}$`));
  await expect(page.locator('.wk__rij.is-vandaag')).toHaveCount(1);
  await expect(page.locator('.wk__rij.is-vandaag')).toHaveAttribute('aria-current', 'date');
  await page.getByRole('button', { name: 'Vorige' }).click();
  await expect(page).toHaveURL(new RegExp(`week/${ma}$`));
  expect(fouten).toEqual([]);
});

test('Week (253): een lege week toont streepjes en lege tekens zonder fout', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(String(e)));
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  await wisAlles(page);
  await page.goto(`./#/dagboek/week/${await maandagVan(page, 14)}`);
  await expect(page.locator('.wk__skaart')).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    // BESLISSING 501: de tegel Gewicht heeft een tweede blok (het verschil met de vorige weging), dus twee getallen; ook zonder weging een streepje
    const verwacht = (await page.locator('.wk__skaart').nth(i).evaluate((e) => e.classList.contains('wk__skaart--gewicht'))) ? ['-', '-'] : ['-'];
    await expect(page.locator('.wk__skaart').nth(i).locator('.wk__sgetal')).toHaveText(verwacht);
  }
  await expect(page.locator('.wk__rij')).toHaveCount(7);
  await expect(page.locator('.wk__teken.is-aan')).toHaveCount(0);
  await expect(page.locator('.wk__rij progress')).toHaveCount(0);
  expect(fouten).toEqual([]);
});

// Geen leeg vlak (BESLISSING 148): op 1690x1230 geen leeg vlak hoger dan 80 px in een kaart en niet meer dan 120 px wit onder het laatste onderdeel;
// op elke breedte geen horizontale scroll, ook op 360 px.
for (const [breedte, hoogte] of [[1690, 1230], [1720, 950], [1100, 900], [390, 844], [360, 740]]) {
  test(`Week (253) ${breedte}x${hoogte}: geen leeg vlak en geen horizontale scroll`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dagboek__kop')).toBeVisible();
    await vulWeek(page, await maandagVan(page, 0));
    await page.goto('./#/dagboek/week');
    await expect(page.locator('.wk__skaart')).toHaveCount(5);
    await wachtOpRust(page);
    const kaarten = await meetKaarten(page, '.wk');
    for (const k of kaarten) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (breedte >= 1400) {
      await expect(page.locator('.wk__rij').first()).toBeVisible();
      const rij = await page.locator('.wk__rij').first().evaluate((e) => e.getBoundingClientRect().height);
      expect(rij).toBeGreaterThanOrEqual(56);
      expect(rij).toBeLessThanOrEqual(72);
      if (hoogte >= 1200) {
        const onder = await page.evaluate(() => {
          const lijst = [...document.querySelectorAll('.wk > *')].filter((e) => e.getBoundingClientRect().height > 0);
          return window.innerHeight - lijst.at(-1).getBoundingClientRect().bottom;
        });
        expect(onder).toBeLessThanOrEqual(120);
      }
    } else {
      await expect(page.locator('.wk__compact')).toHaveCount(7);
      await expect(page.locator('.wk__tabel')).toBeHidden();
    }
  });
}

// BESLISSING 254: Dag, Week en Maand zijn drie gelijke knoppen in de kleur van het tabblad Dagboek.
for (const [breedte, hoogte] of [[1690, 1230], [390, 844]]) {
  test(`Dagboek ${breedte}: Dag, Week en Maand hebben gelijke maat en het gekozen deel de tabbladkleur (BESLISSING 254)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek/week');
    await expect(page.locator('.dagboek__segment .segment__deel')).toHaveCount(3);
    const m = await page.evaluate(() => {
      const knoppen = [...document.querySelectorAll('.dagboek__segment .segment__deel')];
      const probe = document.createElement('div');
      probe.style.background = 'var(--knop-bg)';
      document.querySelector('.dagboek').append(probe);
      const knopKleur = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        maten: knoppen.map((k) => {
          const r = k.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height), getComputedStyle(k).fontSize, Math.round(r.height - 2 * parseFloat(getComputedStyle(k).borderTopWidth))];
        }),
        actief: getComputedStyle(knoppen[1]).backgroundColor,
        inactief: getComputedStyle(knoppen[0]).backgroundColor,
        knopKleur,
        checked: knoppen.map((k) => k.getAttribute('aria-checked')),
      };
    });
    expect(new Set(m.maten.map((x) => x[0])).size).toBe(1);
    expect(new Set(m.maten.map((x) => x[1])).size).toBe(1);
    expect(new Set(m.maten.map((x) => x[2])).size).toBe(1);
    expect(m.maten[0][1]).toBe(breedte >= 960 ? 44 : 48);
    // BESLISSING 508: op de telefoon een kleinere letter (14 px) en zichtbaar 38 px hoog binnen een tikvlak van 48 px
    expect(new Set(m.maten.map((x) => x[3])).size).toBe(1);
    expect(m.maten[0][2]).toBe(breedte >= 960 ? '15px' : '14px');
    if (breedte < 720) expect(m.maten[0][3]).toBe(38);
    expect(m.actief).toBe(m.knopKleur);
    expect(m.inactief).not.toBe(m.actief);
    expect(m.checked).toEqual(['false', 'true', 'false']);
  });
}

// Een afgevinkte spuit hoort niet in de telling van de dagelijkse momenten (BESLISSING 209 en 219).
test('Maand: na het afvinken van alleen een spuit blijft de regel Supplementen op "-" staan', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const vandaag0 = await lokaleDatum(page, 0);
  await vulWeek(page, vandaag0); // een dagelijks supplement met drie momenten en een kuur die vandaag begint
  await page.evaluate(() => new Promise((k) => { const o = indexedDB.open('bloei-dagboek'); o.onsuccess = () => { const db = o.result; const tx = db.transaction(['momentinnames'], 'readwrite'); tx.objectStore('momentinnames').clear(); tx.oncomplete = () => { db.close(); k(); }; }; }));
  await page.goto('./#/dagboek/maand');
  await page.locator(`.mk__dag[data-datum="${vandaag0}"]`).click();
  const supp = page.locator('.maand__paneel .maand__blok', { hasText: 'Supplementen' });
  await expect(supp).toContainText('-');
  await page.locator('.maand__paneel').getByRole('button', { name: 'Afvinken' }).click();
  await expect(page.locator('.maand__paneel')).toContainText('Afgevinkt');
  await expect(supp).not.toContainText(/0 van 3/);
  await expect(supp).toContainText('-');
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// BESLISSING 255 (herzien): de maandkalender heeft rustige cellen (nummer, gezichtje en spuitje) en de pagina eromheen
// is gevuld met wat er is: kerncijfers (alleen die met een waarde), het paneel van de gekozen dag en "Gepland deze maand" (komende beurten). De gegevens zijn verzonnen en staan in de
// vorige maand (alle dagen voorbij), zodat de verwachtingen niet van de dag van uitvoering afhangen.
const vorigeMaand = (page) =>
  page.evaluate(() => {
    const nu = new Date();
    const d = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
    const t2 = (x) => String(x).padStart(2, '0');
    return { sleutel: `${d.getFullYear()}-${t2(d.getMonth() + 1)}`, dagen: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
  });

async function vulMaand(page, sleutel, dagen) {
  await page.evaluate(
    ([maand, aantal]) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const winkels = ['dagen', 'maaltijden', 'dranken', 'momentinnames', 'supplementen', 'wegingen'];
          const tx = idb.transaction(winkels, 'readwrite');
          for (const w of winkels) tx.objectStore(w).clear();
          const d = (n) => `${maand}-${String(n).padStart(2, '0')}`;
          const soorten = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
          tx.objectStore('supplementen').add({ id: 1, naam: 'Testdruppels', dosis: '', hoeveelheid: '1 pipetje', aanwijzing: '', momenten: ['ochtend', 'middag', 'avond'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.objectStore('supplementen').add({ id: 2, naam: 'Testspuit', dosis: '', hoeveelheid: 'een ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 7, start: d(3) }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.objectStore('momentinnames').put({ datum: d(10), supplementId: 2, moment: 'dag', tijdstip: 1, voorbeeld: false });
          for (let n = 1; n <= aantal; n++) {
            if (n % 9 === 0) continue; // lege dagen
            tx.objectStore('dagen').put({ datum: d(n), notitie: n === 4 ? 'Een rustige dag.' : '', stemming: (n % 5) + 1, energie: ((n + 1) % 5) + 1, doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
            for (let i = 0; i < n % 7; i++) tx.objectStore('maaltijden').put({ datum: d(n), soort: soorten[i], tijd: '12:00', tekst: 'Soep', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
            const ml = n % 3 === 0 ? 2200 : n % 3 === 1 ? 900 : 0;
            if (ml) tx.objectStore('dranken').add({ datum: d(n), tijdstip: 1000 + n, soort: 'water', ml, voorbeeld: false });
            const momenten = n % 4 === 0 ? ['ochtend', 'middag', 'avond'] : n % 4 === 1 ? ['ochtend'] : [];
            for (const m of momenten) tx.objectStore('momentinnames').put({ datum: d(n), supplementId: 1, moment: m, tijdstip: 1, voorbeeld: false });
          }
          tx.objectStore('wegingen').put({ week: d(1), datum: d(2), kg: 70, voorbeeld: false, gewijzigdOp: 1 });
          tx.objectStore('wegingen').put({ week: d(8), datum: d(10), kg: 69.5, voorbeeld: false, gewijzigdOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    [sleutel, dagen],
  );
}

// De maandtests (cellen, overzicht, paneel, legenda, verhoudingen, telefoon) staan in b-dagboek-maand.spec.js.

// De drinkbalk heeft in elke rij dezelfde baan en toont de liters tegenover het dagdoel (begrensd op 100 %); de getallen staan op één rechterlijn.
test('Week: de drinkbalken staan op dezelfde plek en 1 l, 2 l en 2,18 l zijn 50 %, 100 % en 100 % van een dagdoel van 2 l', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const ma = await maandagVan(page, 7);
  await vulWeek(page, ma);
  await page.evaluate(
    (maandag) =>
      new Promise((k) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const [j, m, d] = maandag.split('-').map(Number);
        const dag = (n) => { const x = new Date(j, m - 1, d + n); return `${x.getFullYear()}-${t2(x.getMonth() + 1)}-${t2(x.getDate())}`; };
        const o = indexedDB.open('bloei-dagboek');
        o.onsuccess = () => {
          const db = o.result;
          const tx = db.transaction(['dranken'], 'readwrite');
          tx.objectStore('dranken').clear();
          [[2, 1000], [3, 2000], [4, 2180]].forEach(([n, ml]) => tx.objectStore('dranken').add({ datum: dag(n), tijdstip: n, soort: 'water', ml, voorbeeld: false }));
          tx.oncomplete = () => { db.close(); k(); };
        };
      }),
    ma,
  );
  await page.goto(`./#/dagboek/week/${ma}`);
  await expect(page.locator('.wk__rij')).toHaveCount(7);
  await wachtOpRust(page);
  // (vulWeek zet het dagdoel op 2000 ml, zie daar)
  const m = await page.evaluate(() =>
    [...document.querySelectorAll('.wk__rij .wk__drank')].map((e) => {
      const b = e.querySelector('progress');
      const l = e.querySelector('.wk__liter').getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return { links: r.left, rechts: r.right, getalRechts: l.right, max: Number(b.max), value: Number(b.value), vulling: Math.round((Number(b.value) / Number(b.max)) * 100) };
    }),
  );
  expect(m.length).toBe(3);
  for (const x of m) {
    expect(Math.abs(x.links - m[0].links)).toBeLessThanOrEqual(1);
    expect(Math.abs(x.rechts - m[0].rechts)).toBeLessThanOrEqual(1);
    expect(Math.abs(x.getalRechts - m[0].getalRechts)).toBeLessThanOrEqual(1);
    expect(x.max).toBe(2000);
  }
  expect(m.map((x) => x.vulling)).toEqual([50, 100, 100]);
});

// BESLISSING 261: de letters O, M en A staan exact in het midden van hun ronde teken (gevuld, leeg en gedempt), in de tabel en in de compacte rijen.
for (const [breedte, hoogte] of [[1690, 1230], [390, 844]]) {
  test(`Week (261) ${breedte}: de letters O, M en A staan in het midden van hun cirkel`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dagboek__kop')).toBeVisible();
    const ma = await maandagVan(page, 7);
    await vulWeek(page, ma);
    await page.goto(`./#/dagboek/week/${ma}`);
    await expect(page.locator('.wk__skaart')).toHaveCount(5);
    await wachtOpRust(page);
    const m = await page.evaluate(() =>
      [...document.querySelectorAll('.wk__teken--moment')]
        .filter((e) => e.offsetParent)
        .map((e) => {
          const s = e.querySelector('span[aria-hidden]');
          const r = document.createRange();
          r.selectNodeContents(s);
          const a = r.getBoundingClientRect();
          const c = e.getBoundingClientRect();
          return { letter: s.textContent, stand: e.className, dx: a.left + a.width / 2 - c.left - c.width / 2, dy: a.top + a.height / 2 - c.top - c.height / 2, b: c.width, h: c.height };
        }),
    );
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(new Set(m.map((x) => x.letter))).toEqual(new Set(['O', 'M', 'A']));
    expect(m.some((x) => x.stand.includes('is-aan'))).toBe(true);
    expect(m.some((x) => !x.stand.includes('is-aan'))).toBe(true);
    for (const x of m) {
      expect(Math.abs(x.dx), `${x.letter} horizontaal`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(x.dy), `${x.letter} verticaal`).toBeLessThanOrEqual(1);
      expect(x.b).toBe(x.h);
    }
  });
}

// BESLISSING 263: bij hover, focus of een tik op een teken of cel in de rijen verschijnt een klein, dekkend uitlegkaartje binnen de kaart.
// De kerncijfers en de kolomkoppen hebben er geen.
const tipTekst = (page) => page.locator('.wk__tip');
async function controleerTip(page, doel, verwacht) {
  const hash = await page.evaluate(() => location.hash);
  await doel.scrollIntoViewIfNeeded();
  await doel.hover();
  await expect(tipTekst(page)).toHaveCount(1);
  await expect(tipTekst(page)).toContainText(verwacht);
  const m = await page.evaluate(() => {
    const tip = document.querySelector('.wk__tip');
    const kaart = tip.closest('.kaart').getBoundingClientRect();
    const r = tip.getBoundingClientRect();
    const kleur = getComputedStyle(tip).backgroundColor;
    return { binnen: r.left >= kaart.left - 0.5 && r.right <= kaart.right + 0.5 && r.top >= kaart.top - 0.5 && r.bottom <= kaart.bottom + 0.5, alfa: kleur.startsWith('rgba') ? Number(kleur.split(',')[3]) : 1, z: getComputedStyle(tip).zIndex };
  });
  expect(m.binnen).toBe(true);
  expect(m.alfa).toBe(1);
  expect(Number(m.z)).toBeGreaterThan(0);
  await doel.click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
}
test('Week (263) 1690: een uitlegkaartje met de juiste tekst bij tekens en cellen, niet bij kerncijfers en kolomkoppen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const ma = await maandagVan(page, 7);
  await vulWeek(page, ma);
  await page.goto(`./#/dagboek/week/${ma}`);
  await expect(page.locator('.wk__skaart')).toHaveCount(5);
  await wachtOpRust(page);
  const maandag = page.locator('.wk__rij').nth(0);
  await controleerTip(page, maandag.locator('.wk__teken--eten').nth(0), 'Ontbijt · 12.00 uur · Havermout met banaan');
  await controleerTip(page, maandag.locator('.wk__teken--eten').nth(1), 'Tussendoortje: niet ingevuld');
  await controleerTip(page, maandag.locator('.wk__drank'), '2,25 l van 2 l · dagdoel gehaald');
  await expect(tipTekst(page)).toContainText('Water 4x');
  await controleerTip(page, maandag.locator('.wk__teken--moment').nth(0), /Ochtend: genomen om \d+\.\d\d uur/);
  await controleerTip(page, page.locator('.wk__rij').nth(1).locator('.wk__teken--moment').nth(1), 'Middag: niet afgevinkt');
  await controleerTip(page, maandag.locator('.wk__gezicht'), 'Stemming: blij');
  await controleerTip(page, maandag.locator('.energie'), 'Energie: gewoon (3 van 5)');
  await controleerTip(page, maandag.locator('.wk__notitie'), 'Tweede regel');
  await controleerTip(page, maandag.locator('.wk__spuit'), 'Testspuit · een halve ampule');
  // Kerncijfers en kolomkoppen: gewone tekst, geen kaartje, geen tabindex, geen data-tip
  await expect(page.locator('.wk__skaart[tabindex], .wk__skaart [data-tip], .wk__tabel thead [tabindex], .wk__tabel thead [data-tip]')).toHaveCount(0);
  await page.locator('.wk__skaart').nth(0).hover();
  await page.locator('.wk__tabel thead th').nth(1).hover();
  await expect(tipTekst(page)).toHaveCount(0);
  // Escape sluit het kaartje; met het toetsenbord is de dagrij de stop en vertelt haar label wat de tekens tonen (BESLISSING 330)
  await maandag.locator('.wk__teken--eten').nth(2).hover();
  await expect(tipTekst(page)).toContainText('Middagmaal · 12.00 uur · Soep en brood');
  await page.keyboard.press('Escape');
  await expect(tipTekst(page)).toHaveCount(0);
});
test('Week (263) 390: een tik op een teken opent het uitlegkaartje, een tik ernaast sluit het', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const ma = await maandagVan(page, 7);
  await vulWeek(page, ma);
  await page.goto(`./#/dagboek/week/${ma}`);
  await expect(page.locator('.wk__compact')).toHaveCount(7);
  await wachtOpRust(page);
  const eerste = page.locator('.wk__compact').nth(0);
  const hash = await page.evaluate(() => location.hash);
  await eerste.locator('.wk__teken--moment').nth(1).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await eerste.locator('.wk__teken--moment').nth(1).tap();
  await expect(tipTekst(page)).toContainText(/Middag: genomen om \d+\.\d\d uur/);
  const binnen = await page.evaluate(() => {
    const tip = document.querySelector('.wk__tip');
    const k = tip.closest('.kaart').getBoundingClientRect();
    const r = tip.getBoundingClientRect();
    return r.left >= k.left && r.right <= k.right && r.top >= k.top && r.bottom <= k.bottom && document.documentElement.scrollWidth <= innerWidth;
  });
  expect(binnen).toBe(true);
  await eerste.locator('.wk__teken--eten').nth(0).tap();
  await expect(tipTekst(page)).toContainText('Ontbijt · 12.00 uur · Havermout met banaan');
  await page.locator('.dagboek__kop h1').tap();
  await expect(tipTekst(page)).toHaveCount(0);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
});

// BESLISSING 330: één tabstop per dagrij (geen 90 voor één week), met een samenvattend label in gewone taal; de tekens zijn geen tabstops en de
// gezichttegels zijn voor een schermlezer verborgen (het woord staat in het rijlabel). Pijl omhoog en omlaag gaan van rij naar rij.
for (const [breedte, hoogte, rijKlasse] of [[1690, 1230, '.wk__rij'], [390, 844, '.wk__compact']]) {
  test(`Week (330) ${breedte}: één tabstop per dagrij met een samenvattend label, de tekens zijn geen tabstops`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dagboek__kop')).toBeVisible();
    const ma = await maandagVan(page, 7);
    await vulWeek(page, ma);
    await page.goto(`./#/dagboek/week/${ma}`);
    await expect(page.locator(rijKlasse)).toHaveCount(7);
    await wachtOpRust(page);

    // Tab van het begin van het scherm tot de focus het scherm verlaat: de stops in de weekkaart zijn precies de zeven dagrijen
    await page.locator('#scherm').evaluate((e) => e.focus());
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body || !e.closest('#scherm')) return null;
        return { rij: !!e.closest('.wk__schemakaart'), klasse: e.className.toString() };
      });
      if (!s) break;
      stops.push(s);
    }
    const inKaart = stops.filter((s) => s.rij);
    expect(inKaart, 'tabstops in de weekkaart').toHaveLength(7);
    for (const s of inKaart) expect(s.klasse).toMatch(/wk__rij|wk__compact/);
    expect(stops.length - inKaart.length, 'vaste bediening naast de zeven dagrijen').toBeLessThanOrEqual(9);
    await expect(page.locator('.wk [data-tip][tabindex], .wk__teken[tabindex], .wk__liter[tabindex], .wk__gezichttegel[tabindex], .wk__spuit[tabindex]')).toHaveCount(0);

    // Het label vertelt wat de rij toont, alleen wat er is
    const maandag = page.locator(rijKlasse).nth(0);
    const label = ((await maandag.getAttribute('aria-label')) ?? '').replace(/ | /g, ' ');
    expect(label).toMatch(/^maandag \d{1,2} \p{L}+/u);
    for (const deel of ['Eten: 3 van 6', 'Drinken: 2,25 l van 2 l', 'Supplementen: 3 van 3', 'Stemming: blij', 'Energie: gewoon (3 van 5)', 'Rustige dag, lang gewandeld', 'Testspuit']) expect(label).toContain(deel);
    expect(label).not.toContain('Tweede regel');
    const dinsdag = (await page.locator(rijKlasse).nth(1).getAttribute('aria-label')) ?? '';
    for (const deel of ['dinsdag', 'Eten: 1 van 6', 'Supplementen: 1 van 3', 'Stemming: blij']) expect(dinsdag).toContain(deel);
    for (const deel of ['Energie', 'Notitie', 'Testspuit']) expect(dinsdag).not.toContain(deel);
    const leeg = (await page.locator(rijKlasse).nth(2).getAttribute('aria-label')) ?? '';
    expect(leeg).not.toMatch(/Eten:|Drinken:|Stemming:/);

    // Elke gezichttegel is verborgen voor een schermlezer; er is geen groep zonder naam
    await expect(page.locator('.wk__schemakaart .wk__gezichttegel[data-stap]:not([aria-hidden="true"])')).toHaveCount(0);
    expect(await page.locator('.wk [role="group"]:not([aria-label])').count()).toBe(0);

    // Pijl omlaag en omhoog van dagrij naar dagrij
    await maandag.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(rijKlasse).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(maandag).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(maandag).toBeFocused();

    // De focusring ligt zichtbaar op de rij
    const ring = await maandag.evaluate((e) => ({ stijl: getComputedStyle(e).outlineStyle, breedte: parseFloat(getComputedStyle(e).outlineWidth) }));
    expect(ring.stijl).not.toBe('none');
    expect(ring.breedte).toBeGreaterThan(0);
  });
}

// BESLISSING 372 (herzien): de knop "Delen" staat in de kop van het Dagboek, tussen Rondleiding en het huisje, net als op de andere
// tabbladen. In dag, week en maand staat ze op dezelfde plaats en opent ze Delen met precies de periode die je ziet.
const dagenTussen = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000) + 1;
const weekStartVan = (page, datum) =>
  page.evaluate((d) => {
    const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    const t = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${t(x.getMonth() + 1)}-${t(x.getDate())}`;
  }, datum);
const delenKnop = (page, soort) => page.getByRole('link', { name: `Deze ${soort} delen` });

for (const [breedte, hoogte] of [[1690, 1230], [820, 1180], [390, 844]]) {
  test.describe(`Dagboek: knop Delen (${breedte} px)`, () => {
    test.use({ viewport: { width: breedte, height: hoogte } });

    test('dezelfde plaats, maat en vorm in dag, week en maand; de maand houdt haar maat; de dagkolommen eindigen gelijk', async ({ page }) => {
      const boxen = {};
      const regels = {};
      for (const [soort, route, volgende] of [['dag', './#/dagboek', '.dag__raster'], ['week', './#/dagboek/week', '.wk__samenvatting'], ['maand', './#/dagboek/maand', '.maand__kolommen']]) {
        await page.goto(route);
        const knop = delenKnop(page, soort);
        await expect(knop).toBeVisible();
        await expect(knop).toHaveClass(/dagboek__delen/);
        await expect(knop.locator('svg')).toHaveCount(1);
        if (soort === 'dag') await expect(page.locator('.dag__raster')).not.toHaveClass(/is-meet/);
        await wachtOpRust(page);
        boxen[soort] = await knop.boundingBox();
        // In de kop: na Rondleiding en voor het huisje, en de volgende sectie begint gewoon onder de kop.
        regels[soort] = await page.evaluate((sel) => {
          const d = document.querySelector('.dagboek__delen').getBoundingClientRect();
          const uitleg = document.querySelector('.dagboek__kop .schermkop__uitleg');
          const home = document.querySelector('.dagboek__home').getBoundingClientRect();
          const na = document.querySelector(sel).getBoundingClientRect();
          return {
            naUitleg: uitleg ? d.left - uitleg.getBoundingClientRect().right : 0,
            voorHome: home.left - d.right,
            onder: na.top - document.querySelector('.dagboek__kop').getBoundingClientRect().bottom,
            kleur: getComputedStyle(document.querySelector('.dagboek__delen')).color,
          };
        }, volgende);
        expect(boxen[soort].width).toBeGreaterThanOrEqual(44);
        expect(boxen[soort].height).toBeGreaterThanOrEqual(44);
        expect(regels[soort].naUitleg).toBeGreaterThanOrEqual(0);
        expect(regels[soort].voorHome).toBeGreaterThanOrEqual(0);
        if (soort === 'dag' && breedte >= 1100) {
          const eind = await page.evaluate(() => [...document.querySelectorAll('.dag__links, .dag__zij')].map((k) => k.getBoundingClientRect().bottom));
          expect(Math.abs(eind[0] - eind[1])).toBeLessThanOrEqual(2);
        }
        if (soort === 'maand' && breedte >= 1100) {
          const eind = await page.evaluate(() => [document.querySelector('.maand__kalkaart'), document.querySelector('.maand__paneel')].map((k) => k.getBoundingClientRect().bottom));
          expect(Math.abs(eind[0] - eind[1])).toBeLessThanOrEqual(1);
        }
      }
      for (const soort of ['week', 'maand']) {
        expect(Math.abs(boxen[soort].x - boxen.dag.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(boxen[soort].y - boxen.dag.y)).toBeLessThanOrEqual(1);
        expect(regels[soort].kleur).toBe(regels.dag.kleur);
        expect(Math.abs(regels[soort].onder - regels.dag.onder)).toBeLessThanOrEqual(1);
      }
      // De kalender van de maand houdt dezelfde maat in een andere maand (BESLISSING 272)
      const maat = async () => page.evaluate(() => { const r = document.querySelector('.maand__kalkaart').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      await page.goto('./#/dagboek/maand');
      await expect(page.locator('.maand__kalkaart')).toBeVisible();
      const nu = await maat();
      const vorige = (await lokaleDatum(page, -45)).slice(0, 7);
      await page.goto(`./#/dagboek/maand/${vorige}`);
      await expect(page.locator('.maand__kalkaart')).toBeVisible();
      expect(await maat()).toEqual(nu);
    });
  });
}

test.describe('Dagboek: de knop Delen opent Delen met de periode van die dag, week of maand', () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  const naarDelen = async (page, route, soort, van, tot, chip) => {
    await page.goto(route);
    await delenKnop(page, soort).click();
    await expect(page).toHaveURL(new RegExp(`#/delen/${van}/${tot}$`));
    await expect(page.locator('.delen__samenvatting')).toContainText(new RegExp(`^${dagenTussen(van, tot)} dag`));
    await expect(page.locator('.delen__periode .chip.is-actief')).toHaveText(chip ?? 'Aangepast');
    await expect(page.locator('.delen__eigen input').first()).toHaveValue(van);
    await expect(page.locator('.delen__eigen input').last()).toHaveValue(tot);
    // de terugweg: dezelfde weergave en dezelfde dag, week of maand
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(route.replace('./', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await expect(delenKnop(page, soort)).toBeVisible();
  };

  test('dag: vandaag, gisteren en een dag van vorige week', async ({ page }) => {
    const vandaag = await lokaleDatum(page, 0);
    const gisteren = await lokaleDatum(page, -1);
    const oud = await lokaleDatum(page, -8);
    await naarDelen(page, './#/dagboek', 'dag', vandaag, vandaag, 'Vandaag');
    await naarDelen(page, `./#/dagboek/dag/${gisteren}`, 'dag', gisteren, gisteren, 'Gisteren');
    await naarDelen(page, `./#/dagboek/dag/${oud}`, 'dag', oud, oud, null);
  });

  test('dag in de toekomst: de knop blijft staan en Delen toont zijn lege toestand', async ({ page }) => {
    const later = await lokaleDatum(page, 3);
    await page.goto(`./#/dagboek/dag/${later}`);
    await delenKnop(page, 'dag').click();
    await expect(page).toHaveURL(new RegExp(`#/delen/${later}/${later}$`));
    await expect(page.locator('.delen__samenvatting')).toContainText('1 dag');
    await expect(page.locator('.verslagvel')).toBeVisible();
  });

  test('week: de lopende week (tot en met vandaag) en een vorige week', async ({ page }) => {
    const vandaag = await lokaleDatum(page, 0);
    const start = await weekStartVan(page, vandaag);
    await naarDelen(page, './#/dagboek/week', 'week', start, vandaag, 'Deze week'); // ook op een maandag (één dag): vanuit de week is het 'Deze week'
    const vorige = await weekStartVan(page, await lokaleDatum(page, -7));
    const eind = await lokaleDatum(page, dagenTussen(vandaag, vorige) - 1 + 6);
    await naarDelen(page, `./#/dagboek/week/${vorige}`, 'week', vorige, eind, 'Vorige week'); // BESLISSING 474: de hele vorige week is de knop Vorige week, niet Aangepast
  });

  test('maand: de lopende maand (tot en met vandaag) en een vorige maand (de hele maand)', async ({ page }) => {
    const vandaag = await lokaleDatum(page, 0);
    const eerste = `${vandaag.slice(0, 7)}-01`;
    await naarDelen(page, './#/dagboek/maand', 'maand', eerste, vandaag, eerste === vandaag ? 'Vandaag' : null);
    const vorige = (await lokaleDatum(page, -(Number(vandaag.slice(8)) + 1))).slice(0, 7); // een dag voor de eerste van deze maand
    const laatste = await lokaleDatum(page, -Number(vandaag.slice(8)));
    await naarDelen(page, `./#/dagboek/maand/${vorige}`, 'maand', `${vorige}-01`, laatste, null);
  });

  test('Delen via de navigatie opent nog steeds op Vandaag', async ({ page }) => {
    await page.goto('./#/dagboek/maand');
    await page.goto('./#/delen');
    await expect(page.locator('.delen__periode .chip.is-actief')).toHaveText('Vandaag');
  });
});
