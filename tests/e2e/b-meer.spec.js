// Meer (stap H7): profiel, thema, instellingen, badges en favorieten, elk met een herlaadbeurt.
import { test, expect } from '@playwright/test';
import { schermKlaar } from './wacht.js';
import { ALLE_BADGES, GROEPEN } from '../../src/logica/badgeregels.js';
import { wachtOpRust, wachtOpInstelling, maaltijdblad, BEWAAR_MAALTIJD } from './r-wacht.js';

async function testFoto(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 320;
    const g = c.getContext('2d');
    g.fillStyle = '#c98b86';
    g.fillRect(0, 0, 320, 320);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  });
  return { name: 'profiel.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

const groep = (page, naam) => page.getByRole('group', { name: naam });

test('Meer: het menu toont alleen wat werkt en Over met het logo', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => ['error', 'warning'].includes(b.type()) && fouten.push(b.text()));
  await page.goto('./#/meer');
  await expect(page.getByRole('heading', { name: 'Algemeen', level: 1 })).toBeVisible();
  for (const naam of [/Drinken/, /^Gewicht/, /Vergrendeling/]) await expect(page.getByRole('button', { name: naam }).first()).toBeVisible();
  // R2-10: Badges en Favorieten zijn tikbare kaarten met een echte link, geen knop meer
  for (const naam of ['Alle badges bekijken', /Favoriet toevoegen|Alle favorieten/]) await expect(page.getByRole('link', { name: naam }).first()).toBeVisible();
  // Delen staat bewust niet meer bij "Jouw instellingen" (BESLISSING 311): het zit alleen in de navigatie.
  await expect(page.locator('.meer__menu').getByRole('button', { name: /Delen/ })).toHaveCount(0);
  // Stap 13 (BESLISSING 307): Herinneringen is nu een werkende rij in "Jouw instellingen".
  await expect(page.getByRole('button', { name: /Herinneringen/ })).toHaveCount(1);
  await expect(page.locator('.over .logo')).toBeVisible();
  await expect(page.locator('.over')).toContainText('Bloei is je persoonlijke dagboek voor wat je eet en drinkt, je supplementen en je gewicht.');
  await expect(page.locator('.over')).toContainText(/© 2026 .+ - Alle rechten voorbehouden/);
  await expect(page.locator('.over')).toContainText('Versie');
  await expect(page.locator('.over')).toContainText(/Met liefde bedacht en gebouwd door \S+/);
  await expect(page.locator('.over')).not.toContainText(/Font Awesome|Lettertypes/);
  expect(fouten).toEqual([]);
});

test('Algemeen: Profiel verwijderen heeft een icoon en vraagt twee keer, annuleren laat alles staan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/meer/backup');
  await expect(page).toHaveURL(/#\/meer$/);
  await expect(page.getByRole('button', { name: /Back-up/ })).toHaveCount(0);
  await page.goto('./#/meer/profiel');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Proef');
  await page.getByRole('heading', { level: 1 }).click();
  await page.goto('./#/meer');
  const wis = page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' });
  await expect(page.getByRole('button', { name: 'Alles wissen' })).toHaveCount(0);
  await expect(wis.locator('svg.icoon')).toHaveCount(1);
  const meet = async () => {
    const i = await wis.locator('svg.icoon').boundingBox();
    const v = await page.locator('.over .cijfer').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.left; });
    return { icoon: i.x, versie: v };
  };
  for (const breedte of [390, 1690]) {
    await page.setViewportSize({ width: breedte, height: 900 });
    const m = await meet();
    expect(Math.abs(m.icoon - m.versie)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const dlg = page.getByRole('dialog');
  const naamBlijft = async () => {
    await page.goto('./#/meer/profiel');
    await expect(page.getByRole('textbox', { name: 'Je naam' })).toHaveValue('Proef');
    await page.goto('./#/meer');
  };
  // Stap 1: Annuleren heeft de focus; Annuleren, Escape en een tik ernaast laten alles staan
  await wis.click();
  await expect(dlg.getByRole('heading', { name: 'Profiel verwijderen?' })).toBeVisible();
  await expect(dlg).toContainText('Dit kan je niet ongedaan maken');
  await expect(dlg.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dlg.getByRole('button', { name: 'Annuleren' }).click();
  await expect(dlg).toHaveCount(0);
  await naamBlijft();
  await wis.click();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await wis.click();
  await page.mouse.click(195, 5);
  await expect(dlg).toHaveCount(0);
  await naamBlijft();
  // Stap 2: de laatste knop is eerst uitgeschakeld; annuleren laat alles staan
  await wis.click();
  await dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
  await expect(dlg.getByRole('heading', { name: 'Ben je helemaal zeker?' })).toBeVisible();
  const laatste = dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' });
  await expect(laatste).toBeDisabled();
  await dlg.getByRole('button', { name: 'Annuleren' }).click();
  await naamBlijft();
  // Bevestigen: na de pauze is de knop aantikbaar, alles is weg en het welkomstscherm staat er
  await wis.click();
  await dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
  await expect(laatste).toBeDisabled();
  await expect(laatste).toBeEnabled({ timeout: 4000 });
  await laatste.click();
  await expect(dlg).toHaveCount(0);
  await expect(page).toHaveURL(/#\/welkom$/);
  await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
  const tellers = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const uit = {};
    for (const info of dbs) {
      const open = await new Promise((r) => { const q = indexedDB.open(info.name); q.onsuccess = () => r(q.result); });
      for (const naam of open.objectStoreNames) {
        // de herstart schrijft zelf migratievlaggen in instellingen; die zijn geen gegevens van het profiel
        const alle = await new Promise((r) => { const q = open.transaction(naam).objectStore(naam).getAll(); q.onsuccess = () => r(q.result); });
        uit[naam] = naam === 'instellingen' ? alle.filter((rij) => !/Omgezet$|uitgebreid$/.test(rij.sleutel)).length : alle.length;
      }
      open.close();
    }
    return uit;
  });
  expect(Object.values(tellers).every((n) => n === 0)).toBe(true);
});

test('Profiel: de naam wijzigt de begroeting op Vandaag en blijft na herladen', async ({ page }) => {
  await page.goto('./#/meer/profiel');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Sofie');
  await page.getByRole('heading', { level: 1 }).click(); // verlaat het veld
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag h1')).toHaveText(/, Sofie$/);
  await page.reload();
  await expect(page.locator('.vandaag h1')).toHaveText(/, Sofie$/);
  await page.goto('./#/meer');
  await expect(page.locator('.meer')).toContainText('Sofie');
});

test('Profiel: een volledige naam geeft op Vandaag alleen de voornaam, in Meer blijft de hele naam staan', async ({ page }) => {
  await page.goto('./#/meer/profiel');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Marie Peeters');
  await page.getByRole('heading', { level: 1 }).click();
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag h1')).toHaveText(/^Goeie(morgen|middag|navond), Marie$/);
  await page.reload();
  await expect(page.locator('.vandaag h1')).toHaveText(/, Marie$/);
  await page.goto('./#/meer');
  await expect(page.locator('.meer')).toContainText('Marie Peeters');
});

test('Profiel: een profielfoto kiezen en weghalen, zonder foto de initiaal', async ({ page }) => {
  await page.goto('./#/meer/profiel');
  await expect(page.locator('.profielfoto--initiaal .profielfoto__letter').first()).toHaveText('T'); // de initiaal van "Testnaam"
  await page.locator('input[type="file"]').setInputFiles(await testFoto(page));
  await expect(page.locator('.profielfoto__beeld').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.profielfoto__beeld').first()).toBeVisible();
  await page.goto('./#/meer');
  await expect(page.locator('.profielfoto__beeld').first()).toBeVisible();
  await page.goto('./#/meer/profiel');
  await page.getByRole('button', { name: 'Foto weghalen' }).click();
  await expect(page.locator('.profielfoto--initiaal .profielfoto__letter').first()).toHaveText('T');
  await page.reload();
  await expect(page.locator('.profielfoto--initiaal').first()).toBeVisible();
});

test('Thema: kiezen is meteen zichtbaar en blijft na herladen', async ({ page }) => {
  await page.goto('./#/meer');
  await page.getByRole('button', { name: 'Nacht', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacht');
  // Het scherm tekent opnieuw zodra de keuze bewaard is: wacht daarop voor het herladen.
  await expect(page.getByRole('button', { name: 'Nacht', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacht');
  await expect(page.getByRole('button', { name: 'Nacht', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Salie', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'salie');
  await page.getByRole('button', { name: 'Poeder', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await expect(page.getByRole('button', { name: 'Poeder', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Poeder', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Instellingen: kangrootte, dagdoel en weegdag volgen op Drinken, Vandaag en in het menu', async ({ page }) => {
  await page.goto('./#/meer');
  await page.locator('.meer .rij', { hasText: /^Drinken/ }).click();
  await expect(page).toHaveURL(/#\/meer\/instellingen$/);
  await expect(groep(page, 'Grootte van een kan water')).toContainText('800 ml');
  await groep(page, 'Grootte van een kan water').getByRole('button', { name: 'Eentje meer' }).click(); // 850 ml
  const doel = groep(page, 'Dagdoel');
  await doel.getByRole('button', { name: 'Eentje meer' }).click(); // 2,75 l (standaard 2,5 l)
  await wachtOpInstelling(page, 'drinken.glasMl', 850);
  await wachtOpInstelling(page, 'drinken.dagdoelMl', 2750);
  await page.goto('./#/meer/gewicht');
  await page.getByRole('button', { name: 'woensdag', exact: true }).click(); // weegdag woensdag
  await wachtOpInstelling(page, 'gewicht.weegdag', 3);

  await page.goto('./#/meer');
  await expect(page.locator('.meer .rij', { hasText: /^Drinken/ })).toContainText('Je dagdoel en de grootte van je dranken');
  await expect(page.locator('.meer .rij', { hasText: /^Gewicht/ })).toContainText('Je weegdag en je streefgewicht');
  await page.goto('./#/meer/instellingen');
  await expect(groep(page, 'Grootte van een kan water')).toContainText('850 ml');

  await page.goto('./#/drinken');
  await expect(page.getByText('van 2,75 l')).toBeVisible();
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkhoofd .cijfer-groot')).toContainText('0,85');
  await expect(page.locator('.drinken__lijst')).toContainText('850 ml');
  await page.goto('./#/vandaag');
  await expect(page.getByText('van 2,75 l')).toBeVisible();

  await page.reload();
  await page.goto('./#/meer/gewicht');
  await expect(page.getByRole('button', { name: 'woensdag', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./#/meer/instellingen');
  await expect(groep(page, 'Dagdoel')).toContainText('2,75 l');
  await expect(groep(page, 'Grootte van een kan water')).toContainText('850 ml');
});

test('Instellingen: een streefgewicht zetten en wissen', async ({ page }) => {
  await page.goto('./#/meer/gewicht');
  await page.getByRole('button', { name: 'Zetten' }).click();
  await expect(groep(page, 'Streefgewicht')).toContainText('65,0 kg');
  await wachtOpInstelling(page, 'gewicht.streefKg', 65);
  await page.reload();
  await expect(groep(page, 'Streefgewicht')).toContainText('65,0 kg');
  await page.getByRole('button', { name: 'Wissen' }).click();
  await wachtOpInstelling(page, 'gewicht.streefKg', undefined);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Zetten' })).toBeVisible();
});

test('Badges: per groep, met telling; na een eerste invoer staat de eerste badge er, met viering, blad en datum, en na herladen nog', async ({ page }) => {
  await page.goto('./#/meer/badges');
  // Zonder badges toont de brede kaart de volgende medaille; geen lege plek
  await expect(page.locator('.badgehero')).toContainText('De volgende');
  // Medailles per groep, nog niet behaalde omlijnd en gedempt; de telling staat bovenaan
  await expect(page.locator('.badgegroep')).toHaveCount(GROEPEN.length); // het aantal groepen en medailles volgt de app
  await expect(page.locator('.medaille.is-open').first()).toBeVisible();
  await expect(page.locator('.badgehero__telling')).toHaveText(`0 van ${ALLE_BADGES.length} behaald`);
  // Een kaart opent een blad met uitleg en de stand
  await page.getByRole('button', { name: /^Zeven dagen,/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Houd zeven dagen iets bij.');
  await expect(page.getByRole('dialog')).toContainText('0 van 7 dagen');
  // BESLISSING 422: rechts boven een kruisje "Sluiten", en onderaan de knop "Sluiten"; elk van beide sluit het blad
  const sluitKnoppen = page.getByRole('dialog').getByRole('button', { name: 'Sluiten', exact: true });
  await expect(sluitKnoppen).toHaveCount(2);
  await expect(page.getByRole('dialog').locator('.blad__kop .blad__sluit')).toHaveAccessibleName('Sluiten');
  await page.getByRole('dialog').locator('.knop', { hasText: 'Sluiten' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^Zeven dagen,/ }).click();
  await page.getByRole('dialog').locator('.blad__kop .blad__sluit').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('./#/vandaag');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.viering')).toContainText('Eerste dag', { timeout: 8000 });

  await page.goto('./#/meer/badges');
  // het eerste glas geeft twee medailles: Eerste dag en de eerste medaille van Drinken
  await expect(page.locator('.badgehero__telling')).toHaveText(`2 van ${ALLE_BADGES.length} behaald`);
  await expect(page.getByText(/Behaald op/).first()).toBeVisible();
  await expect(page.locator('.medaille.is-behaald')).not.toHaveCount(0);
  await expect(page.locator('.badgegroep').first().locator('.badgegroep__telling')).toContainText('1 van');
  await page.reload();
  await expect(page.getByText(/Behaald op/).first()).toBeVisible();
  await page.goto('./#/meer');
  await expect(page.locator('.meer__badges')).toContainText(/2 van [0-9]+ behaald/); // R2-10: de kaart is geen knop meer
});

test('Favorieten: bewaren bij een maaltijd, toevoegen en weghalen onder Meer', async ({ page }) => {
  await page.goto('./#/meer/favorieten');
  await expect(page.getByText('Nog geen favorieten. Tik op het hartje bij een maaltijd.')).toBeVisible();

  await page.goto('./#/dagboek');
  await page.locator('.maaltijd[data-soort="ontbijt"] > .rij').click();
  const blad = maaltijdblad(page, 'ontbijt'); // BESLISSING 419: het invulvenster is een blad
  await blad.locator('textarea').fill('havermout met banaan');
  await blad.locator('.maaltijd__hart').click();
  await expect(blad.locator('.maaltijd__hart.is-actief')).toBeVisible();
  await blad.getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(blad).toHaveCount(0);

  await page.goto('./#/meer/favorieten');
  await expect(page.locator('.rij', { hasText: 'havermout met banaan' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nieuwe favoriet' }).fill('yoghurt met noten');
  await page.getByRole('button', { name: 'Erbij schrijven' }).click();
  await expect(page.locator('.rij', { hasText: 'yoghurt met noten' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.rij', { hasText: 'yoghurt met noten' })).toBeVisible();
  await page.getByRole('button', { name: 'havermout met banaan weghalen' }).click();
  await expect(page.locator('.rij', { hasText: 'havermout met banaan' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.rij', { hasText: 'yoghurt met noten' })).toBeVisible();
  await expect(page.locator('.rij', { hasText: 'havermout met banaan' })).toHaveCount(0);
});

test('Meer: de kaarten zijn tikbaar naar hun detail en de themategels tonen een voorbeeld', async ({ page }) => {
  await page.goto('./#/meer');
  await expect(page.locator('.themategel')).toHaveCount(4);
  await expect(page.locator('.themavoorbeeld').first()).toBeVisible();
  // R2-10: de kaarten Badges en Favorieten zijn geen knop meer (er staan links in); de hele kaart blijft tikbaar en heeft één echte link
  await page.getByRole('link', { name: 'Alle badges bekijken' }).click();
  await expect(page).toHaveURL(/#\/meer\/badges$/);
  await page.goto('./#/meer');
  await schermKlaar(page, 'meer'); // het scherm is uitgebouwd en de opkomst is voorbij: de kaart staat stil onder de muis
  await page.locator('.meer__favorieten .kaartkop').click();
  await expect(page).toHaveURL(/#\/meer\/favorieten$/);
  await page.goto('./#/meer');
  await schermKlaar(page, 'meer');
  await page.locator('.meer__profiel').click();
  await expect(page).toHaveURL(/#\/meer\/profiel$/);
});

test('Meer: de rij Vergrendeling staat er en leidt naar haar scherm; Delen staat niet bij de instellingen', async ({ page }) => {
  await page.goto('./#/meer');
  const slot = page.locator('.meer .rij', { hasText: /^Vergrendeling/ });
  await expect(slot).toContainText('Bloei beveiligen met een pincode');
  await slot.click();
  await expect(page).toHaveURL(/#\/meer\/vergrendeling/);
  await page.goto('./#/meer');
  // BESLISSING 311: Delen is geen instelling meer; het staat alleen in de navigatie.
  await expect(page.locator('.meer .rij', { hasText: /^Vergrendeling/ })).toBeVisible();
  await expect(page.locator('.meer .rij', { hasText: /^Delen/ })).toHaveCount(0);
});

test('Elk scherm vanuit Meer heeft "‹ Meer" in de schermkop dat terugbrengt naar Meer, ook op een telefoon', async ({ page }) => {
  const paden = ['profiel', 'favorieten', 'instellingen', 'gewicht', 'vergrendeling', 'badges'];
  for (const breedte of [1280, 390]) {
    await page.setViewportSize({ width: breedte, height: 844 });
    for (const pad of paden) {
      await page.goto('./#/meer/' + pad);
      const terug = page.locator('.schermkop').getByRole('button', { name: 'Terug naar Algemeen', exact: true }); // de zichtbare tekst blijft "Algemeen"; de schermlezer hoort "Terug naar Algemeen"
      await expect(terug, `${pad} op ${breedte}`).toBeVisible();
      const vak = await terug.boundingBox();
      expect(vak.height, `${pad} tikvlak`).toBeGreaterThanOrEqual(44);
      await terug.click();
      await expect(page, `${pad} op ${breedte}`).toHaveURL(/#\/meer$/);
    }
  }
});

test('Meer: Drinken en Gewicht zijn aparte subschermen met hun eigen titel', async ({ page }) => {
  await page.goto('./#/meer/instellingen');
  await expect(page.getByRole('heading', { level: 1, name: 'Drinken' })).toBeVisible();
  await expect(groep(page, 'Dagdoel')).toBeVisible();
  await expect(groep(page, 'Grootte van een kan water')).toBeVisible();
  await expect(page.getByRole('button', { name: 'woensdag', exact: true })).toHaveCount(0); // weegdag staat bij Gewicht
  await page.goto('./#/meer/gewicht');
  await expect(page.getByRole('heading', { level: 1, name: 'Gewicht' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'woensdag', exact: true })).toBeVisible();
  await expect(groep(page, 'Dagdoel')).toHaveCount(0);
});

// BESLISSING 304 (herzien) en 311: het instelscherm Delen bestaat niet meer en de rij op Algemeen is weg; het oude adres stuurt door.
test('Meer: #/meer/delen stuurt door naar het scherm Delen', async ({ page }) => {
  await page.goto('./#/meer/delen');
  await expect(page).toHaveURL(/#\/delen$/);
  await expect(page.locator('.delen__vinkjes')).toBeVisible();
});

// BESLISSING 230 tot 233: op een breed scherm beginnen en eindigen beide kolommen op dezelfde lijn en staat er geen leeg vlak in een kaart.
test.describe('Algemeen en instelschermen op 1690 px', () => {
  test.use({ viewport: { width: 1690, height: 950 }, isMobile: false, hasTouch: false });
  for (const pad of ['profiel', 'instellingen', 'gewicht']) {
    test(`#/meer/${pad}: kolommen even hoog en zonder gat`, async ({ page }) => {
      await page.goto(`./#/meer/${pad}`);
      await expect(page.locator('.instel__voorbeeld')).toBeVisible();
      const m = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const l = r(document.querySelector('.instel__lijst'));
        const v = r(document.querySelector('.instel__voorbeeld'));
        // het grootste verticale gat tussen twee opeenvolgende blokken in de lijst (rijen mogen rekken, maar niet meer dan 80 px leeg)
        const kinderen = [...document.querySelectorAll('.instel__lijst .rij__tekst')].map(r);
        let gat = 0;
        kinderen.forEach((k, i) => { if (i) gat = Math.max(gat, k.top - kinderen[i - 1].bottom); });
        return { top: Math.abs(l.top - v.top), bottom: Math.abs(l.bottom - v.bottom), gat, scroll: document.documentElement.scrollWidth - innerWidth };
      });
      expect(m.top).toBeLessThanOrEqual(1);
      expect(m.bottom).toBeLessThanOrEqual(1);
      expect(m.scroll).toBeLessThanOrEqual(0);
      expect(m.gat).toBeLessThanOrEqual(80); // de rijen rekken niet meer: het voorbeeld volgt de hoogte van de lijst
    });
  }
});

// BESLISSING 247: op de kaart Badges (en op het scherm Badges) verandert het omhulsel van een medaille bij hover niets; alleen de medaille
// licht op zoals een icoon, en het kaartje met de betekenis verschijnt, binnen de kaart.
async function zetBehaaldeBadges(page, ids) {
  await page.goto('./#/meer');
  await page.evaluate(
    (lijst) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const d = open.result;
          const tx = d.transaction('badges', 'readwrite');
          const st = tx.objectStore('badges');
          st.clear();
          lijst.forEach((id, i) => st.put({ id, behaaldOp: Date.now() - i * 86400000, gezien: true }));
          tx.oncomplete = () => { d.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
    ids,
  );
  await page.reload();
}
const BEHAALD = ['eerste-bladzijde', 'week-vol', 'maand-vol', 'honderd', 'twee-weken', 'eerste-kan', 'tien-kannen', 'kanttekening'];
const stijlVan = (el) => {
  const c = getComputedStyle(el);
  return { bg: c.backgroundColor, schaduw: c.boxShadow, rand: c.borderColor, transform: c.transform };
};
test.describe('Medailles op Algemeen en Badges: hover op 1690 px', () => {
  test.use({ viewport: { width: 1690, height: 950 }, isMobile: false, hasTouch: false });
  for (const [pad, kaart, klein] of [['meer', '.meer__badges', '.meer__kleinemedailles .medaille-hover'], ['meer/badges', '.badgescherm', '.medaillekaart .medaille-hover, .medaillekaart .medaille']]) {
    test(`#/${pad}: omhulsel blijft gelijk, medaille licht op, kaartje met naam binnen de kaart`, async ({ page }) => {
      await zetBehaaldeBadges(page, BEHAALD);
      await page.goto(`./#/${pad}`);
      const omhulsel = page.locator(klein).first();
      await expect(omhulsel).toBeVisible();
      await wachtOpRust(page); // de opkomst van de kaart is klaar
      const medaille = omhulsel.locator('.medaille').first();
      const voor = await omhulsel.evaluate(stijlVan);
      const medVoor = await medaille.evaluate(stijlVan);
      await omhulsel.hover();
      await wachtOpRust(page); // de overgang van de medaille is klaar
      const na = await omhulsel.evaluate(stijlVan);
      const medNa = await medaille.evaluate(stijlVan);
      expect(na.bg).toBe(voor.bg);
      expect(na.schaduw).toBe(voor.schaduw);
      expect(na.rand).toBe(voor.rand);
      expect(na.transform).toBe(voor.transform);
      expect(medNa.transform).not.toBe(medVoor.transform);
      const tip = page.locator('.medaille-tip:visible').first();
      await expect(tip).toBeVisible();
      await expect(tip).toContainText(/\S/);
      const naam = await tip.locator('.medaille-tip__naam').innerText();
      expect(naam.length).toBeGreaterThan(2);
      if (process.env.SHOTDIR) await page.screenshot({ path: process.env.SHOTDIR + '/medaille-hover-' + pad.replace('/', '-') + '.png' });
      const r = await page.evaluate((k) => {
        const kr = document.querySelector(k).getBoundingClientRect();
        const t = document.querySelector('.medaille-hover.is-uitleg .medaille-tip').getBoundingClientRect();
        const m = document.querySelector('.medaille-hover.is-uitleg .medaille').getBoundingClientRect();
        return { links: t.left - kr.left, rechts: kr.right - t.right, boven: t.top - kr.top, onder: kr.bottom - t.bottom, overlap: !(t.bottom <= m.top || t.top >= m.bottom || t.right <= m.left || t.left >= m.right) };
      }, kaart);
      expect(r.links).toBeGreaterThanOrEqual(-0.5);
      expect(r.rechts).toBeGreaterThanOrEqual(-0.5);
      expect(r.boven).toBeGreaterThanOrEqual(-0.5);
      expect(r.onder).toBeGreaterThanOrEqual(-0.5);
      expect(r.overlap).toBe(false);
      await page.keyboard.press('Escape');
      await expect(page.locator('.medaille-tip:visible')).toHaveCount(0);
    });
  }
});

// BESLISSING 249: het kaartje van elke medaille is volledig zichtbaar (niets ligt eroverheen), op de kaart Badges en op het scherm Badges.
for (const [b, h, aanraking] of [[1690, 950, false], [1280, 800, false], [390, 844, true]]) {
  test.describe(`Kaartje boven alles ${b}`, () => {
    test.use({ viewport: { width: b, height: h }, isMobile: aanraking, hasTouch: aanraking });
    // Op een telefoon opent een tik op het scherm Badges een blad (geen zwevend kaartje): die combinatie bestaat niet en wordt
    // niet gemaakt (vroeger een test.skip, R4-02). Het blad zelf is gedekt in r-algemeen-instellingen.spec.js.
    const paden = [['meer', '.meer__badges'], ['meer/badges', '.badgescherm']].filter(([pad]) => !(aanraking && pad !== 'meer'));
    for (const [pad, kaart] of paden) {
      test(`#/${pad}: elk kaartje bovenaan op vier hoeken en het midden`, async ({ page }) => {
        await zetBehaaldeBadges(page, BEHAALD);
        await page.goto(`./#/${pad}`);
        await expect(page.locator(`${kaart} .medaille-hover:visible`).first()).toBeVisible();
        await wachtOpRust(page);
        const n = Math.min(await page.locator(`${kaart} .medaille-hover:visible`).count(), 12);
        expect(n).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) {
          const el = page.locator(`${kaart} .medaille-hover:visible`).nth(i);
          await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" })); // instant: de stijl (Pico) zet scroll-behavior: smooth; een glijdende scroll haalt de muis van de medaille
          await page.mouse.move(2, 2);
          await expect(page.locator('.medaille-hover.is-uitleg')).toHaveCount(0);
          if (aanraking) await el.tap(); else await el.hover();
          await expect(page.locator('.medaille-hover.is-uitleg .medaille-tip')).toBeVisible();
          await wachtOpRust(page);
          const fout = await page.evaluate((k) => {
            const tip = document.querySelector('.medaille-hover.is-uitleg .medaille-tip');
            if (!tip) return 'geen kaartje';
            const r = tip.getBoundingClientRect();
            let ouder = tip; const dun = [];
            while (ouder && ouder !== document.body) { if (parseFloat(getComputedStyle(ouder).opacity) < 1) dun.push(ouder.className); ouder = ouder.parentElement; }
            if (dun.length) return `${k}: doorschijnend via ${dun.join(' | ')}`;
            const bg = getComputedStyle(tip).backgroundColor;
            const kb = getComputedStyle(document.querySelector('.kaart')).backgroundColor;
            if (bg !== kb || /rgba|\/ /.test(bg)) return `${k}: achtergrond ${bg} is niet de kaartkleur ${kb}`;
            const pts = [[r.left + 10, r.top + 10], [r.right - 10, r.top + 10], [r.left + 10, r.bottom - 10], [r.right - 10, r.bottom - 10], [r.left + r.width / 2, r.top + r.height / 2]];
            const slecht = pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !tip.contains(e); });
            return slecht.length ? `${k}: ${slecht.length} punten bedekt door ` + pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.className : "-"; }).join(" / ") : "";
          }, i);
          expect(fout, `medaille ${i}`).toBe('');
          await page.keyboard.press('Escape');
        }
      });
    }
  });
}

test('Meer: op breed scherm sluiten "Jouw instellingen" en "Over" op dezelfde lijnen aan', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1000 });
  await page.goto('./#/meer');
  await expect(page.locator('.over .knop--wis')).toBeVisible();
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const a = r('.meer__menu'), b = r('.over');
    const leeg = (k, laatste) => { const el = document.querySelector(k); return el.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).paddingBottom) - document.querySelector(laatste).getBoundingClientRect().bottom; };
    return { top: Math.abs(a.top - b.top), bodem: Math.abs(a.bottom - b.bottom), leegMenu: leeg('.meer__menu', '.meer__menu > .rij:last-child'), leegOver: leeg('.over', '.over .knop--wis') };
  });
  expect(m.top).toBeLessThanOrEqual(1);
  expect(m.bodem).toBeLessThanOrEqual(1);
  expect(m.leegMenu).toBeLessThanOrEqual(32);
  expect(m.leegOver).toBeLessThanOrEqual(32);
});
