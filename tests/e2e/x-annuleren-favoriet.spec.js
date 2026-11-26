// BESLISSING 434: "Annuleren" in het maaltijdblad zet ook de favoriet terug; "Klaar", het kruisje en Escape bewaren alles.
// BESLISSING 435: een tik op een favorietknopje op Vandaag vult de maaltijd meteen in en het blad blijft dicht.
// Lengtegrenzen (OW-05): de invoervelden hebben maxlength uit data/grenzen.js. BESLISSING 427: de link naar de licenties onder Over.
// Alle teksten zijn verzonnen. De klok staat vast (vasteKlok): donderdag 12 november 2026, 12:00; dan is "Tussendoortje" de volgende maaltijd.
import { test, expect } from '@playwright/test';
import { vasteKlok, VASTE_DATUM } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';

const D = VASTE_DATUM;
const DEMO = process.env.PW_RONDE === 'demo';
const DB = DEMO ? 'bloei-demo' : 'bloei-dagboek';

const rijen = (page, tabel) =>
  page.evaluate(
    ([naam, db]) =>
      new Promise((klaar) => {
        const open = indexedDB.open(db);
        open.onsuccess = () => {
          const vraag = open.result.transaction(naam).objectStore(naam).getAll();
          vraag.onsuccess = () => {
            open.result.close();
            klaar(vraag.result);
          };
        };
      }),
    [tabel, DB],
  );
const zetRij = (page, tabel, rij) =>
  page.evaluate(
    ([naam, waarde, db]) =>
      new Promise((klaar) => {
        const open = indexedDB.open(db);
        open.onsuccess = () => {
          const tx = open.result.transaction(naam, 'readwrite');
          tx.objectStore(naam).put(waarde);
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
    [tabel, rij, DB],
  );
const favoriet = (id, tekst, laatstGebruikt) => ({ id, tekst, sleutel: tekst.trim().toLowerCase(), laatstGebruikt });
const record = (soort, tekst, extra = {}) => ({ datum: D, soort, tijd: '12:30', tekst, fotoId: null, voorbeeld: false, gewijzigdOp: 1, ...extra });
const maaltijd = (page, soort) => rijen(page, 'maaltijden').then((l) => l.find((m) => m.soort === soort && m.datum === D) ?? null);

const blad = (page) => page.locator('dialog.dialoog[open]');
const hart = (page) => blad(page).locator('.maaltijd__hart');
const rij = (page, soort) => page.locator(`.vandaag .maaltijd[data-soort="${soort}"] > .rij`);

async function startVandaag(page, { favorieten = [], maaltijden = [] } = {}) {
  await vasteKlok(page);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  for (const f of favorieten) await zetRij(page, 'favorieten', f);
  for (const m of maaltijden) await zetRij(page, 'maaltijden', m);
  await page.reload(); // dezelfde url met een hash laadt niet opnieuw: de gezaaide gegevens moeten op het scherm komen
  await expect(page.locator('.vandaag')).toBeVisible();
  await schermKlaar(page, '#/vandaag'); // het scherm is uitgebouwd en de kaarten zijn opgekomen (geen vaste wachttijd)
}

test.describe('BESLISSING 434: Annuleren zet ook de favoriet terug', () => {
  test('een favoriet die met het hartje in het blad is gemaakt, is na Annuleren weer weg', async ({ page }) => {
    await startVandaag(page);
    await rij(page, 'middagmaal').click();
    await blad(page).locator('textarea').fill('Pasta met tomatensaus');
    await hart(page).click();
    await expect(hart(page)).toHaveAttribute('aria-pressed', 'true');
    expect((await rijen(page, 'favorieten')).map((f) => f.tekst)).toEqual(['Pasta met tomatensaus']);
    await blad(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
    await expect(blad(page)).toHaveCount(0);
    expect(await rijen(page, 'favorieten')).toEqual([]);
    expect(await maaltijd(page, 'middagmaal')).toBeNull();
  });

  test('een favoriet die in het blad is weggehaald, komt na Annuleren terug met dezelfde tekst, plaats in de volgorde en eigenschappen', async ({ page }) => {
    const alle = [favoriet(1, 'Havermout met fruit', 3000), favoriet(2, 'Soep met brood', 2000), favoriet(3, 'Rijstwafels', 1000)];
    await startVandaag(page, { favorieten: alle, maaltijden: [record('middagmaal', 'Soep met brood')] });
    await rij(page, 'middagmaal').click();
    await expect(hart(page)).toHaveAttribute('aria-pressed', 'true');
    await hart(page).click();
    await expect(hart(page)).toHaveAttribute('aria-pressed', 'false');
    expect((await rijen(page, 'favorieten')).map((f) => f.id).sort()).toEqual([1, 3]);
    await blad(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
    await expect(blad(page)).toHaveCount(0);
    const na = (await rijen(page, 'favorieten')).sort((a, b) => b.laatstGebruikt - a.laatstGebruikt);
    expect(na).toEqual(alle); // zelfde id, tekst, sleutel en laatstGebruikt: dus ook dezelfde plaats in de volgorde
    expect((await maaltijd(page, 'middagmaal')).tekst).toBe('Soep met brood');
  });

  test('hartje uit en weer aan, en een favorietknop gebruiken: Annuleren zet alles terug zoals bij het openen', async ({ page }) => {
    const alle = [favoriet(1, 'Havermout met fruit', 3000), favoriet(2, 'Soep met brood', 2000)];
    await startVandaag(page, { favorieten: alle, maaltijden: [record('middagmaal', 'Soep met brood')] });
    await rij(page, 'middagmaal').click();
    await hart(page).click(); // uit
    await expect(hart(page)).toHaveAttribute('aria-pressed', 'false');
    await hart(page).click(); // weer aan: een nieuwe favoriet met een nieuwe id
    await expect(hart(page)).toHaveAttribute('aria-pressed', 'true');
    await blad(page).locator('.maaltijd__chips .chip', { hasText: 'Havermout met fruit' }).click(); // markeert als gebruikt
    await expect.poll(async () => (await rijen(page, 'favorieten')).find((f) => f.id === 1).laatstGebruikt).toBeGreaterThan(3000);
    await blad(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
    await expect(blad(page)).toHaveCount(0);
    expect((await rijen(page, 'favorieten')).sort((a, b) => a.id - b.id)).toEqual(alle);
    expect(await maaltijd(page, 'middagmaal')).toMatchObject({ tekst: 'Soep met brood', tijd: '12:30' });
  });

  for (const [naam, sluit] of [
    ['Klaar', (p) => blad(p).getByRole('button', { name: 'Klaar', exact: true }).click()],
    ['het kruisje', (p) => blad(p).getByRole('button', { name: 'Sluiten', exact: true }).click()],
    ['Escape', (p) => p.keyboard.press('Escape')],
  ]) {
    test(`${naam} bewaart de favoriet die in het blad is gemaakt en de weggehaalde blijft weg`, async ({ page }) => {
      await startVandaag(page, { favorieten: [favoriet(1, 'Soep met brood', 2000)], maaltijden: [record('middagmaal', 'Soep met brood')] });
      await rij(page, 'middagmaal').click();
      await hart(page).click(); // Soep weg
      await expect(hart(page)).toHaveAttribute('aria-pressed', 'false');
      await blad(page).locator('textarea').fill('Salade met kip');
      await hart(page).click(); // Salade erbij
      await expect(hart(page)).toHaveAttribute('aria-pressed', 'true');
      await sluit(page);
      await expect(blad(page)).toHaveCount(0);
      expect((await rijen(page, 'favorieten')).map((f) => f.tekst)).toEqual(['Salade met kip']);
      expect((await maaltijd(page, 'middagmaal')).tekst).toBe('Salade met kip');
    });
  }

  test('ook in Dagboek·Dag zet Annuleren de favoriet terug', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./#/dagboek/dag');
    await zetRij(page, 'favorieten', favoriet(1, 'Soep met brood', 2000));
    await zetRij(page, 'maaltijden', record('middagmaal', 'Soep met brood'));
    await page.reload();
    await page.locator('.dag__eten .maaltijd[data-soort="middagmaal"] > .rij').click();
    await hart(page).click();
    await expect(hart(page)).toHaveAttribute('aria-pressed', 'false');
    await blad(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
    await expect(blad(page)).toHaveCount(0);
    expect(await rijen(page, 'favorieten')).toEqual([favoriet(1, 'Soep met brood', 2000)]);
  });
});

test.describe('BESLISSING 435: een favorietknopje op Vandaag vult de maaltijd meteen in', () => {
  const FAVORIETEN = [favoriet(1, 'Havermout met fruit', 3000), favoriet(2, 'Soep met brood', 2000)];

  test('één tik vult de volgende maaltijd in (tekst en uur), het blad blijft dicht', async ({ page }) => {
    await startVandaag(page, { favorieten: FAVORIETEN });
    const knop = page.locator('.eten__favorieten .chip', { hasText: 'Havermout met fruit' });
    await knop.click();
    await expect(page.locator('dialog.dialoog[open]')).toHaveCount(0);
    await expect(rij(page, 'tussendoortje')).toContainText('Havermout met fruit');
    await expect(rij(page, 'tussendoortje')).toContainText('12:00'); // het uur van nu
    const m = await maaltijd(page, 'tussendoortje');
    expect(m).toMatchObject({ tekst: 'Havermout met fruit', tijd: '12:00' });
    // Na herladen staat het er nog.
    await page.reload();
    await expect(rij(page, 'tussendoortje')).toContainText('Havermout met fruit');
  });

  test('de tik meldt het aan een schermlezer (aria-live) en "Ongedaan maken" draait het terug', async ({ page }) => {
    await startVandaag(page, { favorieten: FAVORIETEN });
    await page.locator('.eten__favorieten .chip', { hasText: 'Havermout met fruit' }).click();
    const melding = page.locator('.strokenhouder[aria-live="polite"]');
    await expect(melding).toContainText('Havermout met fruit', { timeout: 2000 });
    await melding.getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect(rij(page, 'tussendoortje')).not.toContainText('Havermout met fruit');
    expect(await maaltijd(page, 'tussendoortje')).toBeNull();
  });
});

test.describe('Lengtegrenzen op de invoervelden (data/grenzen.js)', () => {
  // De grenzen staan hier met opzet vast: wijzigt iemand grenzen.js, dan moet deze test het merken en bewust worden aangepast.
  const GRENS = { naam: 60, maaltijd: 4000, favoriet: 4000, notitie: 20000, supplementNaam: 100, supplementVeld: 120 };
  const lang = (n) => 'a'.repeat(n + 50);

  // Plakken: de browser begrenst de tekst zelf op maxlength.
  async function plak(page, veld, tekst) {
    await veld.focus();
    await page.keyboard.insertText(tekst);
  }

  test('profielnaam', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./#/meer/profiel');
    const veld = page.getByLabel('Je naam');
    await expect(veld).toHaveAttribute('maxlength', String(GRENS.naam));
    await veld.fill('');
    await plak(page, veld, lang(GRENS.naam));
    expect((await veld.inputValue()).length).toBe(GRENS.naam);
  });

  test('maaltijdtekst', async ({ page }) => {
    await startVandaag(page);
    await rij(page, 'middagmaal').click();
    const vak = blad(page).locator('textarea');
    await expect(vak).toHaveAttribute('maxlength', String(GRENS.maaltijd));
    await plak(page, vak, lang(GRENS.maaltijd));
    expect((await vak.inputValue()).length).toBe(GRENS.maaltijd);
  });

  test('nieuwe favoriet en een favoriet bewerken', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./#/meer/favorieten');
    const veld = page.getByLabel('Nieuwe favoriet');
    await expect(veld).toHaveAttribute('maxlength', String(GRENS.favoriet));
    await plak(page, veld, lang(GRENS.favoriet));
    expect((await veld.inputValue()).length).toBe(GRENS.favoriet);
  });

  test('dagboeknotitie', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./#/dagboek/dag');
    const vak = page.getByLabel('Nog iets over vandaag?');
    await expect(vak).toHaveAttribute('maxlength', String(GRENS.notitie));
    await plak(page, vak, lang(GRENS.notitie));
    expect((await vak.inputValue()).length).toBe(GRENS.notitie);
  });

  test('supplement: naam, hoeveelheid en aanwijzing', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./stijl.html');
    await page.getByRole('button', { name: 'Open supplementkaart (nieuw)' }).click();
    const kaart = page.locator('dialog.supplementkaart');
    for (const [label, max] of [['Naam', GRENS.supplementNaam], ['Hoeveelheid per keer', GRENS.supplementVeld], ['Hoe neem je het', GRENS.supplementVeld]]) {
      const veld = kaart.getByLabel(label);
      await expect(veld).toHaveAttribute('maxlength', String(max));
      await plak(page, veld, lang(max));
      expect((await veld.inputValue()).length).toBe(max);
    }
  });
});

test.describe('BESLISSING 427: de link naar de licenties onder Over', () => {
  const link = (page) => page.locator('.over').getByRole('link', { name: 'Licenties van gebruikte onderdelen' });

  test('de link staat in Over, naast de versie op dezelfde regel (BESLISSING 436), opent in een nieuw tabblad met rel=noopener en wijst naar licenties-derden.txt', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./#/meer');
    await expect(link(page)).toBeVisible();
    await expect(link(page)).toHaveAttribute('href', './licenties-derden.txt');
    await expect(link(page)).toHaveAttribute('target', '_blank');
    await expect(link(page)).toHaveAttribute('rel', 'noopener');
    expect(await link(page).evaluate((a) => a.closest('p').className)).toContain('t-klein t-gedempt');
    // Op een breed scherm: rechts van de versie, op dezelfde regel (zelfde verticale midden); op een smal scherm mag de regel afbreken.
    const versie = await page.locator('.over .over__versie').boundingBox();
    const l = await link(page).boundingBox();
    expect(l.x).toBeGreaterThan(versie.x + versie.width - 1);
    expect(Math.abs(l.y + l.height / 2 - (versie.y + versie.height / 2))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test('het bestand wordt als tekst geserveerd', async ({ page }) => {
    await page.goto('./#/meer');
    const antwoord = await page.request.get('./licenties-derden.txt');
    expect(antwoord.status()).toBe(200);
    expect(antwoord.headers()['content-type']).toMatch(/^text\/plain/);
    expect(await antwoord.text()).toContain('licenties van meegeleverde onderdelen');
  });

  test('het tikvlak van de link is minstens 44 px hoog', async ({ page }) => {
    await vasteKlok(page);
    await page.goto('./#/meer');
    const doos = await link(page).boundingBox();
    expect(doos.height).toBeGreaterThanOrEqual(44);
  });

  // In de geïnstalleerde app (met service worker) opent de tik de tekst, niet de app zelf (sw.js: bestanden met een extensie uit de cache).
  test('met een actieve service worker opent het nieuwe tabblad de licentietekst, niet de app', async ({ page, context }) => {
    await vasteKlok(page);
    await page.goto('./#/meer');
    await page.evaluate(() => navigator.serviceWorker?.ready);
    await page.reload();
    const [nieuw] = await Promise.all([context.waitForEvent('page'), link(page).click()]);
    await nieuw.waitForLoadState();
    await expect(nieuw.locator('body > pre')).toContainText('licenties van meegeleverde onderdelen', { timeout: 3000 });
  });
});

test.describe('de demo', { tag: '@demo' }, () => {
  test('de licentielink is ook in de demo zichtbaar', async ({ page }) => {
    await page.goto('./#/meer');
    await expect(page.locator('.over').getByRole('link', { name: 'Licenties van gebruikte onderdelen' })).toBeVisible();
  });
});
