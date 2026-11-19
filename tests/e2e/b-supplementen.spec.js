// Supplementen en motivatie (stap 16): E11-a, E11-b, E11-c en E12 uit PLAN.md §15.4, telkens met herladen.
import { test, expect } from '@playwright/test';
import { wachtTotWaar, maaltijdblad, BEWAAR_MAALTIJD } from './r-wacht.js'; // page.waitForFunction wacht niet op een Promise
import { vulTabbladen } from './r-tabbladen-meting.js';
import { schermKlaar } from './wacht.js';

const lokaleDatum = (page, dagen = 0) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const t = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t(d.getMonth() + 1)}-${t(d.getDate())}`;
  }, dagen);

// De schermen tonen een vinkje meteen; de opslag volgt iets later. Wacht tot het aantal innames echt klopt.
async function wachtOpInnames(page, aantal) {
  await wachtTotWaar(page,
    (n) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(false);
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction('momentinnames').objectStore('momentinnames').count();
          vraag.onsuccess = () => {
            db.close();
            klaar(vraag.result === n);
          };
          vraag.onerror = () => klaar(false);
        };
      }),
    aantal,
  );
}

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

// Op Vandaag staat de kaart Supplementen standaard dicht.
const openSupp = async () => {}; // de kaart op Vandaag is altijd open

// Een supplement toevoegen via de knop bovenaan het tabblad: één tik opent het formulier met de focus in Naam.
async function voegToe(page, naam, hoeveelheid = '', extraMomenten = []) {
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await expect(blad.getByRole('textbox', { name: 'Naam' })).toBeFocused();
  await blad.getByRole('textbox', { name: 'Naam' }).fill(naam);
  if (hoeveelheid) await blad.getByRole('textbox', { name: 'Hoeveelheid per keer' }).fill(hoeveelheid);
  for (const m of extraMomenten) await blad.getByRole('button', { name: m, exact: true }).click();
  await blad.getByRole('button', { name: 'Bewaren' }).click();
  await expect(blad).toBeHidden();
}


const kaartDlg = (page) => page.getByRole('dialog');
const dag = (page, n) => lokaleDatum(page, n);

async function voegPeriodiekToe(page, naam, soort, start, extra = {}) {
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await blad.getByRole('textbox', { name: 'Naam' }).fill(naam);
  await blad.getByRole('radio', { name: soort }).click();
  await blad.getByLabel('Volgende keer op').fill(start);
  if (extra.vanaf) await blad.getByLabel('Begint op').fill(extra.vanaf);
  if (extra.tot) await blad.getByLabel('Stopt na').fill(extra.tot);
  await blad.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(blad).toBeHidden();
}

test('E11-a: een lijst opbouwen; op het tabblad is niets af te vinken en er is geen knop Aanpassen; alles blijft na herladen', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => ['error', 'warning'].includes(b.type()) && fouten.push(b.text()));
  await page.goto('./#/supplementen');
  await expect(page.getByText('Nog geen supplementen in je lijst.')).toBeVisible();
  await voegToe(page, 'Vitamine D', '1 druppel');
  await voegToe(page, 'Magnesium', '1 tablet');
  await voegToe(page, 'Zink');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Lijst )?aanpassen$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alles afvinken' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /supplement toevoegen$/i }).first()).toBeVisible();
  // Dagschema Mijn supplementen (BESLISSING 202): een rij per supplement, eerst wat het vaakst per dag wordt genomen, met een teken per moment; geen totaalrij (209)
  await expect(page.locator('.overzicht__rij')).toHaveCount(3);
  await expect(page.locator('.schema--dag tbody .overzicht__rij').first()).toContainText('Magnesium');
  const vitamine = page.locator('.overzicht__rij', { hasText: 'Vitamine D' });
  await expect(vitamine.locator('.schema__punt')).toHaveAttribute('aria-label', 'Ochtend: ja');
  await expect(page.locator('.schema__totaal')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.overzicht__rij')).toHaveCount(3);
  await expect(page.locator('.momentkaart[data-moment="ochtend"] .supplementrij')).toHaveCount(3);
  await expect(page.locator('.supplementen')).not.toContainText(/vergeten|gemist|%|!/);
  expect(fouten).toEqual([]);
});

test('Afvinken op Vandaag per moment: elk moment toont "Genomen om ... uur" in de kop op het tabblad en onder het moment op Vandaag, en het verdwijnt bij terugzetten', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Vitamine D', '1 druppel', ['Middag', 'Avond']);
  await page.goto('./#/vandaag');
  const rijV = (m) => page.locator('.vandaag .momentrij[data-moment="' + m + '"]');
  for (const m of ['ochtend', 'middag', 'avond']) {
    await expect(rijV(m)).toHaveAttribute('aria-checked', 'false');
    await expect(rijV(m)).toContainText(/van \d+ tot \d+ uur|vanaf \d+ uur/);
    await rijV(m).click();
    await expect(rijV(m)).toHaveAttribute('aria-checked', 'true');
    await expect(rijV(m)).toContainText(/Genomen om \d{1,2}\.\d{2} uur/);
  }
  await wachtOpInnames(page, 3);
  await page.reload();
  for (const m of ['ochtend', 'middag', 'avond']) await expect(rijV(m)).toContainText(/Genomen om \d{1,2}\.\d{2} uur/);
  await page.goto('./#/supplementen');
  for (const m of ['ochtend', 'middag', 'avond']) {
    const stand = page.locator(`.momentkaart[data-moment="${m}"] .momentkop__stand`);
    await expect(stand).toHaveText(/^Genomen om \d{1,2}\.\d{2} uur$/);
    await expect(page.locator(`.momentkaart[data-moment="${m}"]`).getByRole('checkbox')).toHaveCount(0);
  }
  // terugzetten op Vandaag: op het tabblad staat het uur niet meer in de kop (het lopende moment toont dan weer "Nu" of niets)
  await page.goto('./#/vandaag');
  await rijV('middag').click();
  await expect(rijV('middag')).not.toContainText('Genomen om');
  await expect(rijV('middag')).toContainText(/van \d+ tot \d+ uur/);
  await wachtOpInnames(page, 2);
  await page.goto('./#/supplementen');
  await expect(page.locator('.momentkaart[data-moment="middag"] .momentkop')).not.toContainText('Genomen om');
  await expect(page.locator('.momentkaart[data-moment="avond"] .momentkop__stand')).toContainText('Genomen om');
});

test('Een tik op een supplement opent zijn kaart met de juiste gegevens, op elke plaats: moment, Vandaag ook te doen, Binnenkort en het dagschema', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Magnesium', '2 tabletten');
  await voegPeriodiekToe(page, 'Ampul A', 'Om de ... dagen', await dag(page, 0));
  await voegPeriodiekToe(page, 'Ampul B', 'Elke maand', await dag(page, 9));
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const nieuw = page.getByRole('dialog');
  await nieuw.getByRole('textbox', { name: 'Naam' }).fill('Later begonnen');
  await nieuw.getByLabel('Begint op').fill(await dag(page, 5));
  await nieuw.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(nieuw).toBeHidden();

  const plaatsen = [
    ['momentkaart', 'Magnesium', page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' })],
    ['Vandaag ook te doen', 'Ampul A', page.locator('.beurtkaart .supplementrij', { hasText: 'Ampul A' })],
    ['Binnenkort (periodiek)', 'Ampul B', page.locator('.laterkaart .supplementrij', { hasText: 'Ampul B' })],
    ['Binnenkort (begint later)', 'Later begonnen', page.locator('.laterkaart .supplementrij', { hasText: 'Later begonnen' })],
    ['dagschema', 'Magnesium', page.locator('.overzicht__rij', { hasText: 'Magnesium' }).locator('.schema__knop')],
  ];
  for (const [plaats, naam, opener] of plaatsen) {
    await expect(opener, plaats).toBeVisible();
    await opener.click();
    const dlg = kaartDlg(page);
    await expect(dlg, plaats).toBeVisible();
    await expect(dlg.getByRole('textbox', { name: 'Naam' }), plaats).toHaveValue(naam);
    await dlg.getByRole('button', { name: 'Annuleren' }).first().click();
    await expect(dlg).toBeHidden();
    await expect(opener, 'focus terug naar de rij: ' + plaats).toBeFocused();
  }
  // de rij is één knop met aria-haspopup
  await expect(page.locator('.momentkaart .supplementrij').first()).toHaveAttribute('aria-haspopup', 'dialog');
  // "Begint op" in de toekomst: onder Binnenkort en niet in de momentkaarten; Binnenkort toont de begindatum
  await expect(page.locator('.momentkaart', { hasText: 'Later begonnen' })).toHaveCount(0);
  await expect(page.locator('.laterkaart')).toContainText(/Begint op \w+ \d{1,2} \w+/);
  await expect(page.locator('.laterkaart')).toContainText('Volgende keer:');
  // het dagschema zet wie nog moet beginnen in een eigen deel, niet tussen Elke dag
  await expect(page.locator('.schema--dag')).not.toContainText('Later begonnen');
  await expect(page.locator('.overzichtkaart')).toContainText('Begint binnenkort');
  await expect(page.locator('.overzichtkaart')).toContainText('Later begonnen');
});

test('Bewaren en verwijderen in de kaart: het scherm klopt erna; "Stopt na" vóór "Begint op" wordt geweigerd', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Magnesium', '1 tablet');
  await voegToe(page, 'Zink');
  await page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' }).click();
  const dlg = kaartDlg(page);
  await dlg.getByRole('textbox', { name: 'Hoeveelheid per keer' }).fill('3 tabletten');
  await dlg.getByLabel('Begint op').fill(await dag(page, 3));
  await dlg.getByLabel('Stopt na').fill(await dag(page, 1));
  await dlg.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(dlg).toBeVisible(); // geweigerd
  await dlg.getByLabel('Begint op').fill('');
  await dlg.getByLabel('Stopt na').fill('');
  await dlg.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' })).toContainText('3 tabletten');
  await page.reload();
  await expect(page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' })).toContainText('3 tabletten');
  // verwijderen met bevestiging in de kaart zelf
  await page.locator('.momentkaart .supplementrij', { hasText: 'Zink' }).click();
  await dlg.getByRole('button', { name: 'Verwijderen' }).click();
  await dlg.getByRole('group').getByRole('button', { name: 'Verwijderen' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.supplementrij', { hasText: 'Zink' })).toHaveCount(0);
  await expect(page.locator('.overzicht__rij')).toHaveCount(1);
  // Escape sluit zonder bewaren
  await page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' }).click();
  // Escape pas als de kaart echt open is en de focus erin staat: een Escape direct na de tik viel soms vóór het openen
  // (de kaart bleef daarna open staan, ronde van 16 november).
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('textbox', { name: 'Naam' })).toHaveValue('Magnesium');
  await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' })).toContainText('3 tabletten'); // zonder bewaren
});

test('Periodiek: een beurt die vandaag te doen is toont één link naar het Dagboek; zonder beurt geen lege kaart', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Magnesium');
  await expect(page.locator('.beurtkaart')).toHaveCount(0);
  await expect(page.locator('.laterkaart')).toHaveCount(0);
  await voegPeriodiekToe(page, 'Ampul A', 'Om de ... dagen', await dag(page, 0));
  const beurt = page.locator('.beurtkaart');
  await expect(beurt).toContainText('Ampul A');
  await expect(beurt.getByRole('checkbox')).toHaveCount(0);
  const link = beurt.getByRole('link', { name: /afvinken in het Dagboek/i });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', '#/dagboek/dag/' + (await dag(page, 0)));
  await link.click();
  await expect(page).toHaveURL(/#\/dagboek\/dag\/\d{4}-\d{2}-\d{2}$/);
});

test('Momentkaarten: een duidelijke scheiding onder de kop, met 8 px erboven en 12 px eronder, en de eerste rij springt niet in', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Magnesium', '1 tablet', ['Middag', 'Avond']);
  await voegPeriodiekToe(page, 'Ampul A', 'Om de ... dagen', await dag(page, 0));
  const maten = await page.evaluate(() =>
    [...document.querySelectorAll('.momentkaart, .beurtkaart')].map((k) => {
      const kop = k.querySelector('.momentkop');
      const kr = kop.getBoundingClientRect();
      const eerste = k.querySelector('.supplementrij').getBoundingClientRect();
      const cs = getComputedStyle(kop);
      const kaartR = k.getBoundingClientRect();
      const kaartCs = getComputedStyle(k);
      const binnenL = kaartR.left + parseFloat(kaartCs.paddingLeft);
      return { lijn: cs.borderBottomWidth, boven: parseFloat(cs.paddingBottom), onder: eerste.top - kr.bottom, hoogte: kr.height, links: kr.left - binnenL, rij: eerste.left - binnenL };
    }),
  );
  expect(maten.length).toBeGreaterThanOrEqual(3);
  for (const m of maten) {
    expect(m.lijn).toBe('1px');
    // BESLISSING 273/281: overal 8 px van de titel naar de lijn en 12 px van de lijn naar de inhoud
    expect(Math.abs(m.boven - 8), 'titel → lijn').toBeLessThanOrEqual(1);
    expect(Math.abs(m.onder - 12), 'lijn → eerste rij').toBeLessThanOrEqual(1);
    expect(Math.abs(m.hoogte - maten[0].hoogte)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.links)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.rij)).toBeLessThanOrEqual(1);
  }
});

test('E12: de voortgang vult zich per onderdeel, de zin past zich aan en blijft gelijk bij herladen', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Vitamine D', '1 druppel');
  await voegToe(page, 'Magnesium', '1 tablet');
  await voegToe(page, 'Zink');
  await page.goto('./#/vandaag');
  const delen = page.locator('.voortgang__deel');
  await expect(delen).toHaveCount(4);
  await expect(page.locator('.voortgang__deel.is-vol')).toHaveCount(0);
  const zin0 = await page.locator('.voortgang__zin').textContent();

  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.voortgang__deel[data-deel="glass-water"]')).toHaveClass(/is-vol/);
  const zin1 = await page.locator('.voortgang__zin').textContent();
  expect(zin1).not.toBe(zin0);

  await page.locator('.vandaag .momentrij[data-moment="ochtend"]').click();
  await expect(page.locator('.voortgang__deel[data-deel="capsules"]')).toHaveClass(/is-vol/);
  await wachtOpInnames(page, 3);

  await page.locator('.maaltijd[data-soort="ontbijt"] > .rij').click();
  await maaltijdblad(page, 'ontbijt').locator('textarea').fill('havermout'); // BESLISSING 419: het invulvenster is een blad
  await maaltijdblad(page, 'ontbijt').getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(maaltijdblad(page)).toHaveCount(0);
  await expect(page.locator('.voortgang__deel[data-deel="utensils"]')).toHaveClass(/is-vol/);

  await page.locator('.vc--stemming .gevoel__optie[data-stap="4"]').click();
  await expect(page.locator('.voortgang__deel[data-deel="face-smile"]')).toHaveClass(/is-vol/);
  await wachtOpDag(page, 'stemming', 4);
  await expect(page.locator('.voortgang__deel.is-vol')).toHaveCount(4);
  const zin2 = await page.locator('.voortgang__zin').textContent();

  // Een volle dag: nergens een score of een verwijt
  await expect(page.locator('.voortgang')).not.toContainText(/%|vergeten|gemist|!/);
  await page.reload();
  await expect(page.locator('.voortgang__deel.is-vol')).toHaveCount(4);
  await expect(page.locator('.voortgang__zin')).toHaveText(zin2);
  await page.reload();
  await expect(page.locator('.voortgang__zin')).toHaveText(zin2);
});

test('E12: zonder supplementen in de lijst telt dat onderdeel niet mee, en het weekoverzicht sluit af met een zin', async ({ page }) => {
  await page.goto('./#/vandaag');
  await expect(page.locator('.voortgang__deel')).toHaveCount(3);
  await expect(page.locator('.vandaag').getByRole('checkbox')).toHaveCount(0);
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.voortgang__deel.is-vol')).toHaveCount(1);

  await page.goto('./#/dagboek');
  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('.week__zin')).toBeVisible();
  await expect(page.locator('.week__zin')).not.toContainText(/vorige week|vergeten|gemist|!/);
  const zin = await page.locator('.week__zin').textContent();
  await page.reload();
  await expect(page.locator('.week__zin')).toHaveText(zin);
});

test('Een supplement verwijderen dat vandaag al afgevinkt was, haalt het ook uit de telling van vandaag; op morgen is er geen knop om toe te voegen', async ({ page }) => {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Magnesium', '1 tablet');
  await voegToe(page, 'Zink');
  await page.goto('./#/vandaag');
  await page.locator('.vandaag .momentrij[data-moment="ochtend"]').click();
  await wachtOpInnames(page, 2);
  await page.goto('./#/supplementen');
  await page.locator('.momentkaart .supplementrij', { hasText: 'Zink' }).click();
  await kaartDlg(page).getByRole('button', { name: 'Verwijderen' }).click();
  await kaartDlg(page).getByRole('group').getByRole('button', { name: 'Verwijderen' }).click();
  await expect(kaartDlg(page)).toBeHidden();
  await expect(page.locator('.momentkaart .supplementrij')).toHaveCount(1);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vc--supp .momentrij')).toHaveCount(1);
  const morgen = await lokaleDatum(page, 1);
  await page.goto(`./#/supplementen/${morgen}`);
  await expect(page.getByText('Deze dag is nog niet aan de beurt.')).toBeVisible();
  await expect(page.getByRole('button', { name: /supplement toevoegen$/i }).first()).toBeHidden();
});

test('Supplement toevoegen: de knop staat bovenaan zonder scrollen, annuleren bewaart niets, bewaren zet het in zijn momenten en blijft na herladen', async ({ page }) => {
  await page.goto('./#/supplementen');
  const knop = page.getByRole('button', { name: /supplement toevoegen$/i }).first();
  await expect(knop).toBeVisible();
  const onder = await knop.evaluate((e) => e.getBoundingClientRect().bottom);
  expect(onder).toBeLessThan(page.viewportSize().height);
  await knop.click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Naam' }).fill('Niet bewaren');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Niet bewaren' }).click(); // de vraag bij niet-bewaarde wijzigingen
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Niet bewaren')).toHaveCount(0);
  await voegToe(page, 'Vitamine D', '1 tablet', ['Avond']);
  await expect(page.locator('.momentkaart')).toHaveCount(2);
  await expect(page.locator('.overzicht__rij')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.momentkaart[data-moment="avond"]')).toContainText('Vitamine D');
});

for (const breedte of [390, 360]) {
  test(`Op ${breedte} px: geen horizontale scroll en de knoppen en rijen zijn bereikbaar`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 760 });
    await page.goto('./#/supplementen');
    await voegToe(page, 'Magnesium', '1 tablet', ['Middag', 'Avond']);
    await voegPeriodiekToe(page, 'Ampul A', 'Om de ... dagen', await dag(page, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /supplement toevoegen$/i }).first()).toBeVisible();
    await page.locator('.momentkaart .supplementrij').first().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('button', { name: 'Bewaren', exact: true })).toBeInViewport();
    await expect(dlg.getByRole('button', { name: 'Annuleren' }).first()).toBeInViewport();
    await dlg.getByRole('button', { name: 'Annuleren' }).first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('Kop: het huisje staat er en gaat naar Vandaag; er is geen knop Naar vandaag naast Supplement toevoegen', async ({ page }) => {
  await page.goto('./#/supplementen');
  const kop = page.locator('.supplementen .schermkop');
  await expect(kop.locator('a.schermkop__home')).toHaveCount(1);
  await expect(kop.getByRole('button', { name: 'Naar vandaag' })).toHaveCount(0);
  await kop.locator('a.schermkop__home').click();
  await expect(page).toHaveURL(/#\/vandaag$/);
});

// ---- Testronde: volgorde van de momenten, "Binnenkort" leesbaar, geen leeg vlak, gekozen chip, Bewaren en de sluier ----
async function vulTabblad(page) {
  await page.goto('./#/supplementen');
  await voegToe(page, 'Testmix een', '1 pipetje', []);
  await voegToe(page, 'Testmix twee', '2 capsules', ['Avond']);
  await voegToe(page, 'Testmix drie', '1 tablet', ['Middag', 'Avond']);
  await voegPeriodiekToe(page, 'Ampul maand', 'Elke maand', await dag(page, 6));
  await voegPeriodiekToe(page, 'Straks begonnen', 'Elke maand', await dag(page, 0), { vanaf: await dag(page, 7) });
}

for (const [breedte, hoogte] of [[390, 844], [1690, 1000]]) {
  test(`Op ${breedte} px staan de momentkaarten in de volgorde Ochtend, Middag, Avond (DOM en scherm)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await vulTabblad(page);
    const kaarten = await page.evaluate(() =>
      [...document.querySelectorAll('.momentkaart')].map((k) => {
        const r = k.getBoundingClientRect();
        return { naam: k.dataset.moment, top: r.top, left: r.left };
      }),
    );
    expect(kaarten.map((k) => k.naam)).toEqual(['ochtend', 'middag', 'avond']);
    if (breedte < 960) {
      expect(kaarten[0].top).toBeLessThan(kaarten[1].top);
      expect(kaarten[1].top).toBeLessThan(kaarten[2].top);
    } else {
      // Ochtend staat links boven; geen van de andere kaarten staat er (links of rechts) boven.
      expect(kaarten[0].left).toBeLessThanOrEqual(Math.min(kaarten[1].left, kaarten[2].left));
      expect(kaarten[0].top).toBeLessThanOrEqual(Math.min(kaarten[1].top, kaarten[2].top) + 1);
    }
    await page.reload();
    await expect(page.locator('.momentkaart')).toHaveCount(3);
  });
}

// Supplementen rechtstreeks in de opslag zetten (sneller dan via de kaart): n per moment.
async function zaaiDagelijks(page, verdeling) {
  await page.goto('./#/supplementen');
  await expect(page.locator('.supplementen')).toBeVisible();
  await page.evaluate(
    (v) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen'], 'readwrite');
          let i = 0;
          ['ochtend', 'middag', 'avond'].forEach((m, k) => {
            for (let n = 0; n < v[k]; n++) tx.objectStore('supplementen').add({ naam: 'Testmix ' + m + ' ' + (n + 1), dosis: '', hoeveelheid: '1 tablet', aanwijzing: '', momenten: [m], ritme: { soort: 'dagelijks' }, volgorde: ++i, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          });
          const later = new Date();
          later.setDate(later.getDate() + 7);
          const t2 = (x) => String(x).padStart(2, '0');
          tx.objectStore('supplementen').add({ naam: 'Straks begonnen', dosis: '', hoeveelheid: '1 zuigtablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, vanaf: `${later.getFullYear()}-${t2(later.getMonth() + 1)}-${t2(later.getDate())}`, volgorde: ++i, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    verdeling,
  );
  await page.reload();
}

const VERDELINGEN = { 'eigenaar 11/6/5': [11, 6, 5], 'gelijk 3/3/3': [3, 3, 3], 'scheef 12/2/1': [12, 2, 1] };
for (const breedte of [1280, 1440, 1690, 1720]) {
  for (const [naam, verdeling] of Object.entries(VERDELINGEN)) {
    test(`Op ${breedte} px (${naam}) is "Binnenkort" leesbaar, is geen kaart hoger dan haar inhoud en valt er geen gat groter dan de gap`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: 1000 });
      await zaaiDagelijks(page, verdeling);
      await voegPeriodiekToe(page, 'Ampul maand', 'Elke maand', await dag(page, 6));
      await voegPeriodiekToe(page, 'Ampul veertien', 'Om de ... dagen', await dag(page, 0));
      await expect(page.locator('.beurtkaart')).toBeVisible();
      await expect(page.locator('.laterkaart')).toBeVisible();
      const m = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const raster = document.querySelector('.supplementen__raster');
        const gap = parseFloat(getComputedStyle(raster).rowGap);
        const kaarten = [...raster.querySelectorAll('.suppraster .kaart')];
        const leeg = kaarten.map((k) => ({ naam: k.className, leeg: r(k).bottom - Math.max(...[...k.children].map((c) => r(c).bottom)), pad: parseFloat(getComputedStyle(k).paddingBottom) }));
        const week = r(raster.querySelector('.weekkaart'));
        const moment = [...raster.querySelectorAll('.momentkaart')].map(r);
        const beurt = raster.querySelector('.beurtkaart');
        const later = raster.querySelector('.laterkaart');
        const schema = r(raster.querySelector('.overzichtkaart'));
        const kolommen = new Map();
        for (const k of moment) kolommen.set(Math.round(k.left), Math.max(kolommen.get(Math.round(k.left)) ?? 0, k.bottom));
        const onderMomenten = Math.max(...moment.map((k) => k.bottom));
        const gaten = [Math.min(...moment.map((k) => k.top)) - week.bottom, r(beurt).top - onderMomenten, r(later).top - r(beurt).bottom, schema.top - r(later).bottom];
        // kaarten in dezelfde kolom (zelfde linkerrand): de afstand tussen opeenvolgende kaarten is de gap
        const perKolom = {};
        for (const k of moment) (perKolom[Math.round(k.left)] ??= []).push(k);
        for (const lijst of Object.values(perKolom)) for (let i = 1; i < lijst.length; i++) gaten.push(lijst[i].top - lijst[i - 1].bottom);
        const afgekapt = [...later.querySelectorAll('.rij__titel, .rij__sub')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length;
        const rijen = [...later.querySelectorAll('.supplementrij')];
        const inhoud = r(raster);
        return {
          gap, leeg, gaten, afgekapt,
          kolomOnder: [...kolommen.values()],
          volleBreedte: [r(beurt).width, r(later).width, schema.width].map((b) => b / inhoud.width),
          rijBreed: rijen.map((x) => r(x).width / r(later).width),
          tekst: later.textContent,
        };
      });
      expect(m.afgekapt).toBe(0);
      for (const b of m.volleBreedte) expect(b).toBeGreaterThan(0.99); // Vandaag ook te doen, Binnenkort en het dagschema over de volle breedte
      expect(m.rijBreed.length).toBeGreaterThanOrEqual(1);
      if (m.rijBreed.length >= 2) for (const b of m.rijBreed.slice(0, 2)) expect(b).toBeLessThanOrEqual(0.6); // de items van Binnenkort staan naast elkaar
      expect(m.tekst).toContain('Begint op');
      for (const k of m.leeg) expect(k.leeg, k.naam).toBeLessThanOrEqual(Math.max(k.pad, 24) + 8); // geen kaart is hoger dan haar inhoud
      for (const g of m.gaten) expect(Math.abs(g - m.gap)).toBeLessThanOrEqual(2); // nergens een gat groter dan de gap
      if (naam.startsWith('eigenaar')) expect(Math.abs(m.kolomOnder[0] - m.kolomOnder[1])).toBeLessThanOrEqual(8); // de kolommen eindigen op dezelfde lijn
    });
  }
}

// kleur uit een berekende waarde (rgb of color(srgb ...)) naar 0..1
const kleurNaarRgb = (s) => {
  const g = s.match(/-?[\d.]+/g).map(Number);
  return s.startsWith('color(') ? g.slice(0, 3) : g.slice(0, 3).map((x) => x / 255);
};
const lum = (c) => {
  const l = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (a, b) => {
  const [x, y] = [lum(kleurNaarRgb(a)), lum(kleurNaarRgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const thema of ['poeder', 'nacht']) {
  test(`Kaart in ${thema}: gekozen chip gevuld met lichte tekst, Bewaren in de knopkleur, donkere sluier erachter`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/supplementen');
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), thema);
    await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
    const blad = page.getByRole('dialog');
    await blad.getByRole('button', { name: 'Middag', exact: true }).click();
    await blad.getByRole('button', { name: 'Avond', exact: true }).click();
    const w = await page.evaluate(() => {
      const dlg = document.querySelector('dialog.supplementkaart');
      const chips = [...dlg.querySelectorAll('.chip')];
      const gekozen = chips.filter((c) => c.classList.contains('is-actief'));
      const stijl = (c) => ({ tekst: getComputedStyle(c).color, vlak: getComputedStyle(c, '::before').backgroundColor });
      const bewaar = [...dlg.querySelectorAll('.knop--primair')].find((k) => /bewaren/i.test(k.textContent));
      return { aantal: gekozen.length, gekozen: stijl(gekozen[0]), bewaar: { bg: getComputedStyle(bewaar).backgroundColor, tekst: getComputedStyle(bewaar).color, schaduw: getComputedStyle(bewaar).boxShadow }, sluier: getComputedStyle(dlg, '::backdrop').backgroundColor };
    });
    expect(w.aantal).toBe(3);
    // BESLISSING 546: Bewaren is het zachte vlak van de familie (zoals Annuleren en Verwijderen); de gekozen chip is het vollere groen en onderscheidt zich daarvan
    expect(w.gekozen.vlak).not.toBe(w.bewaar.bg);
    expect(contrast(w.gekozen.vlak, w.bewaar.bg)).toBeGreaterThanOrEqual(1.3);
    expect(contrast(w.gekozen.tekst, w.gekozen.vlak)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(w.bewaar.tekst, w.bewaar.bg)).toBeGreaterThanOrEqual(4.5);
    // de sluier is half doorzichtig en donker
    const c = kleurNaarRgb(w.sluier);
    expect(lum(c)).toBeLessThan(0.05);
  });
}

test('Elke supplementrij die de kaart opent toont een potloodje en geen pijltje naar rechts (de link naar het Dagboek houdt zijn pijltje)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await vulTabblad(page);
  // Het pijltje naar rechts zoals andere schermen het gebruiken (Algemeen) is de maat voor "chevron".
  await page.goto('./#/meer');
  await expect(page.locator('.rij__pijl svg').first()).toBeVisible();
  const chevron = await page.evaluate(() => document.querySelector('.rij__pijl svg').innerHTML);
  await page.goto('./#/supplementen');
  await expect(page.locator('.supplementrij').first()).toBeVisible();
  const rijen = await page.evaluate((chev) => {
    return [...document.querySelectorAll('.supplementrij')].map((r) => {
      const ico = r.querySelector('.rij__pijl svg');
      return { chevron: !!ico && ico.innerHTML === chev, pen: !!ico, aria: r.querySelector('.rij__pijl')?.getAttribute('aria-hidden'), bekend: !!chev };
    });
  }, chevron);
  expect(rijen[0].bekend).toBe(true);
  expect(rijen.length).toBeGreaterThan(3);
  for (const r of rijen) {
    expect(r.chevron).toBe(false);
    expect(r.pen).toBe(true);
    expect(r.aria).toBe('true');
  }
});

// ---- Bediening en toegankelijkheid (BESLISSING 330): het dagschema van Supplementen.
async function openMetSupplementen(page, soort = 'gewoon') {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await vulTabbladen(page, soort);
  await page.goto('./#/supplementen');
  await schermKlaar(page, 'supplementen'); // uitgebouwd en opgekomen
  await page.locator('.schema__knop').first().waitFor();
}

test('de knop in het dagschema heeft een eigen naam: geen twee knoppen met dezelfde naam voor dezelfde actie', async ({ page }) => {
  await openMetSupplementen(page, 'gewoon');
  const namen = await page.evaluate(() => [...document.querySelectorAll('#scherm button, #scherm a[href]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ')));
  const dubbel = namen.filter((n, i) => namen.indexOf(n) !== i);
  expect(dubbel).toEqual([]);
  const schema = await page.locator('.schema__knop').first().getAttribute('aria-label');
  expect(schema).toMatch(/^Schema van .+ aanpassen$/);
  // de knop blijft zijn eigen supplement openen
  await page.locator('.schema__knop').first().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.schema__knop').first()).toBeFocused();
});

test('de naam in het dagschema is een tikvlak van minstens 44 x 44 px, zonder dat de rijen hoger worden', async ({ page }) => {
  await openMetSupplementen(page, 'gewoon');
  const m = await page.evaluate(() => {
    const knoppen = [...document.querySelectorAll('.schema__knop')].map((k) => { const r = k.getBoundingClientRect(); return { b: r.width, h: r.height }; });
    // de rij is zo hoog als haar cel: 12 px boven, de tekst van één regel (24 px) en 12 px onder; het tikvlak (10 px erboven en eronder) valt binnen de ruimte van de cel
    const cel = [...document.querySelectorAll('.schema__naam')].map((th) => ({ cel: th.getBoundingClientRect().height, knop: th.querySelector('.schema__knop').getBoundingClientRect().height }));
    return { knoppen, cel };
  });
  for (const k of m.knoppen) {
    expect(k.b).toBeGreaterThanOrEqual(43.5);
    expect(k.h).toBeGreaterThanOrEqual(43.5);
  }
  // met 12 px opvulling boven en onder past een knop van 44 px (24 px tekst + 2 x 10) in een cel van minstens 48 px zonder haar hoger te maken
  for (const c of m.cel) expect(c.cel).toBeGreaterThanOrEqual(c.knop + 4 - 0.5);
});
