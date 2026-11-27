// Delen (stap 19a): een verslag van een week maken en als pdf bewaren; gewicht en notities staan standaard niet in het verslag,
// de keuze blijft na herladen, en er gaat geen enkel verzoek naar een andere host. Alle gegevens zijn verzonnen.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pdfTekst } from './pdf-tekst.js';
import { animatiesKlaar, domRustig, naTekenen } from './wacht.js';

// De bewaarde keuze van de onderdelen (delen.onderdelen) zoals ze in de database staat, of null zonder rij.
const leesOnderdelen = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(null);
        open.onsuccess = () => {
          const r = open.result.transaction(['instellingen']).objectStore('instellingen').get('delen.onderdelen');
          r.onsuccess = () => {
            open.result.close();
            klaar(r.result?.waarde ?? null);
          };
          r.onerror = () => klaar(null);
        };
      }),
  );

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

// BESLISSING 342 en 372: Delen opent via de navigatie altijd op Vandaag, ook na een bezoek aan het Dagboek met een eigen periode.
test('Delen: via de navigatie opent het op Vandaag, ook na een periode vanuit het Dagboek', async ({ page }) => {
  await page.goto('./#/dagboek/week');
  await page.getByRole('link', { name: 'Deze week delen' }).click();
  await expect(page.locator('.delen__periode .chip.is-actief')).toBeVisible();
  await page.goto('./#/vandaag');
  await page.goto('./#/delen');
  await expect(page.locator('.delen__periode .chip.is-actief')).toHaveText('Vandaag');
  await expect(page.locator('.delen__samenvatting')).toContainText('1 dag');
});

// Zet verzonnen gegevens van twee dagen in de database (via de app zelf geopend, zodat het schema er is).
async function vul(page, dagenGeleden = 1) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    (dagenGeleden) =>
      new Promise((klaar, fout) => {
        const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const nu = new Date();
        const gisteren = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - dagenGeleden);
        const datum = sleutel(gisteren);
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'dranken', 'dagen', 'wegingen', 'supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('maaltijden').put({ datum, soort: 'ontbijt', tijd: '08:15', tekst: 'havermout met fruit', fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
          tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 1000, soort: 'water', ml: 500, voorbeeld: false });
          tx.objectStore('dagen').put({ datum, notitie: 'Geheime verzonnen notitie', doelGehaald: false, voorbeeld: false });
          tx.objectStore('wegingen').put({ week: datum, datum, kg: 71.3, voorbeeld: false, gewijzigdOp: 1 });
          const sup = tx.objectStore('supplementen').add({ naam: 'Vitamine D', dosis: '1x per dag 1 capsule', hoeveelheid: '1 capsule', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          sup.onsuccess = () => tx.objectStore('momentinnames').put({ datum, supplementId: sup.result, moment: 'ochtend', tijdstip: Date.now() - 500, voorbeeld: false });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    dagenGeleden,
  );
}

test('Delen zonder naam: de kop van het vel is "Je verslag"', async ({ page }) => {
  await vul(page, 0);
  await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').delete('profiel.naam'); // zonder rij geldt de standaardwaarde: geen naam
          tx.oncomplete = () => { open.result.close(); klaar(); };
        };
      }),
  );
  await page.goto('./#/delen');
  await page.reload();
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  await expect(page.locator('.verslagvel')).toContainText('havermout met fruit');
  await expect(page.locator('.verslagvel__naamkop')).toHaveText('Je verslag');
});

test('Delen: een verslag van twee weken, gewicht en notities standaard niet erin, de keuze blijft, pdf bewaren en nul externe verzoeken', async ({ page }) => {
  const extern = [];
  const fouten = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    // de weerdienst van het weerbericht op Vandaag (sinds 0.5.8) is de enige externe dienst en telt hier niet mee
    if (!['localhost', '127.0.0.1', 'api.open-meteo.com', 'feeds.meteoalarm.org'].includes(url.hostname) && url.protocol.startsWith('http')) extern.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
  page.on('pageerror', (e) => fouten.push(String(e)));

  await vul(page, 0);
  await page.goto('./#/delen');
  await expect(page.getByRole('heading', { level: 1, name: 'Delen' })).toBeVisible();
  await expect(page.locator('.delen__uitleg')).toContainText('verslag van je dagboek');
  await expect(page.locator('.delen__weetjes')).toContainText('op je toestel gemaakt'); // BESLISSING 297: de privacyzin staat in "Goed om te weten"

  // Vandaag: één dag, in blokken
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  const vel = page.locator('.verslagvel');
  await expect(vel).toContainText('havermout met fruit');
  await expect(vel).toContainText('0,5 l');
  // BESLISSING 461: de titel is het woord "Verslag"; één dag: de periode eronder is de datum voluit, met jaar, als label (hoofdletters via css, gewone DOM-tekst)
  await expect(vel.locator('.verslagvel__titel')).toHaveText('Verslag');
  await expect(vel.locator('.verslagvel__periode')).toHaveText(/^[A-Z][a-z]+ \d+ [a-z]+ \d{4}$/);
  await expect(vel.locator('.verslagvel__periode')).toHaveCSS('text-transform', 'uppercase');
  await expect(vel.locator('.verslagvel__naamkop')).toHaveText('Verslag van Testnaam');
  // Standaard niet: gewicht en notities
  await expect(page.getByRole("checkbox", { name: "Gewicht" })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: 'Notities' })).toHaveAttribute('aria-checked', 'false');
  await expect(vel).not.toContainText('71,3');
  await expect(vel).not.toContainText('Geheime verzonnen notitie');
  // Geen oordeel of score; het enige percentage is het dagdoel van die dag (BESLISSING 333), en dat staat alleen in het kerncijfer
  await expect(vel.locator('.verslagvel__cijfer', { hasText: '%' })).toHaveCount(1);
  await expect(vel.locator('.verslagvel__tabel')).not.toContainText('%');
  await expect(vel).not.toContainText(/score|goed gedaan|helaas/i);

  // Aanvinken zet ze erin
  await page.getByRole("checkbox", { name: "Gewicht" }).click();
  await page.getByRole('checkbox', { name: 'Notities' }).click();
  await expect(vel).toContainText('71,3 kg');
  await expect(vel).toContainText('Geheime verzonnen notitie');

  // De keuze blijft na herladen; eerst staat ze echt in de database (de opslag volgt de tik, een herlading te vroeg breekt ze af)
  await expect.poll(() => leesOnderdelen(page)).toMatchObject({ gewicht: true, notities: true });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Gewicht" })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole("checkbox", { name: "Gewicht" }).click(); // en weer uit
  await page.getByRole('checkbox', { name: 'Notities' }).click();
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();

  // Bewaren: een echt pdf-bestand met de bestandsnaam uit de periode
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  const bestand = await download;
  expect(bestand.suggestedFilename()).toMatch(/^bloei-verslag-\d{4}-\d{2}-\d{2}(-\d{4}-\d{2}-\d{2})?\.pdf$/);
  const inhoud = readFileSync(await bestand.path());
  expect(inhoud.subarray(0, 5).toString()).toBe('%PDF-');
  expect(inhoud.subarray(-6).toString()).toContain('%%EOF');
  const tekst = inhoud.toString('latin1');
  expect(tekst).toContain('/FontFile2'); // lettertypes ingebed: Cormorant Garamond en Jost
  expect(tekst).not.toContain('/Helvetica');
  expect(tekst).not.toContain('/Subtype /Image'); // iconen en beeldmerk als vector, geen rasterbeeld
  expect(inhoud.length).toBeLessThan(1024 * 1024);
  await expect(page.locator('.strook')).toContainText('Je verslag is bewaard.');

  expect(extern).toEqual([]);
  expect(fouten).toEqual([]);
});

test('Delen: precies vier opties in de volgorde Eten, Drinken, Gewicht, Notities; standaard Eten en Drinken aan; een oude keuze met een verdwenen onderdeel laadt zonder fout en komt niet in het verslag', async ({ page }) => {
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(String(e)));
  await vul(page, 0);
  await page.evaluate(
    () =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['instellingen'], 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'delen.onderdelen', waarde: { eten: true, drinken: false, supplementen: true, gewicht: false, notities: false } });
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
  );
  await page.goto('./#/delen');
  const vinkjes = page.locator('.delen__vinkjes [role="checkbox"]');
  await expect(vinkjes).toHaveCount(4);
  await expect(page.locator('.delen__optie .rij__titel')).toHaveText(['Eten', 'Drinken', 'Gewicht', 'Notities']);
  await expect(vinkjes.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(vinkjes.nth(1)).toHaveAttribute('aria-checked', 'false'); // wat de oude keuze zei over de onderdelen die blijven
  const vel = page.locator('.verslagvel');
  await expect(vel).toContainText('havermout met fruit');
  for (const woord of ['upplement', 'temming', 'nergie', 'Vitamine D']) await expect(vel).not.toContainText(woord);
  // Bewaren laat de verdwenen onderdelen weg
  await vinkjes.nth(1).click();
  // De opslag volgt de tik: wacht tot de nieuwe keuze in de database staat, precies zonder de verdwenen onderdelen
  await expect.poll(() => leesOnderdelen(page)).toEqual({ eten: true, drinken: true, gewicht: false, notities: false });
  expect(fouten).toEqual([]);
});

test('Delen: een verslag met alle vier de onderdelen heeft de vier secties en geen supplementen; met Gewicht en Notities uit ontbreken die', async ({ page }) => {
  await vul(page, 0);
  await page.goto('./#/delen');
  const vel = page.locator('.verslagvel');
  await expect(vel).toContainText('havermout met fruit');
  await expect(vel).not.toContainText('71,3');
  await expect(vel).not.toContainText('Geheime verzonnen notitie');
  await page.getByRole('checkbox', { name: 'Gewicht', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Notities', exact: true }).click();
  await expect(vel).toContainText('havermout met fruit');
  await expect(vel).toContainText('0,5 l');
  await expect(vel).toContainText('71,3 kg');
  await expect(vel).toContainText('Geheime verzonnen notitie');
  for (const woord of ['Supplementen', 'Mijn supplementen', 'Vitamine D']) await expect(vel).not.toContainText(woord);
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  const tekst = pdfTekst(readFileSync(await (await download).path()));
  for (const marker of ['havermout met fruit', 'Water', '71,3', 'Geheime verzonnen notitie']) expect(tekst).toContain(marker); // getal en eenheid van een kerncijfer staan apart in de pdf
  for (const woord of ['upplement', 'Vitamine D']) expect(tekst).not.toContain(woord);
});

for (const [breedte, hoogte] of [[1690, 1230], [390, 844]]) {
  test(`Delen: de vier opties vormen gelijke rijen zonder leeg vlak en zonder horizontale scroll (${breedte} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await vul(page, 0);
    await page.goto('./#/delen');
    const opties = page.locator('.delen__optie');
    await expect(opties).toHaveCount(4);
    const dozen = [];
    for (let i = 0; i < 4; i += 1) dozen.push(await opties.nth(i).boundingBox());
    for (const d of dozen) {
      expect(d.width).toBeCloseTo(dozen[0].width, 0);
      expect(d.height).toBeCloseTo(dozen[0].height, 0);
    }
    for (let i = 0; i < 4; i += 1) expect(await opties.nth(i).locator('svg, .icoon, i').count(), 'icoon bij optie ' + i).toBeGreaterThan(0);
    for (let i = 1; i < 4; i += 1) expect(dozen[i].y).toBeGreaterThan(dozen[i - 1].y); // BESLISSING 300: vier rijen onder elkaar, op elke breedte
    // De kaart eindigt vlak onder de laatste optie: geen lege ruimte boven 32 px
    const kaart = await page.locator('.delen__samenstel').boundingBox();
    const onder = Math.max(...dozen.map((d) => d.y + d.height));
    expect(kaart.y + kaart.height - onder).toBeLessThanOrEqual(32 + 24); // de binnenmarge van de kaart zelf
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Delen: een periode zonder gegevens zegt dat rustig en zet de knoppen uit; eigen datums via de link', async ({ page }) => {
  await page.goto('./#/vandaag');
  await page.goto('./#/delen/2020-01-06/2020-01-12');
  await expect(page.locator('.verslag__leeg')).toContainText('In deze periode staat nog niets.');
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Afdrukken' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Aangepast' })).toHaveAttribute('aria-pressed', 'true');
});

test('Delen: de knop staat in de zijbalk en op een telefoon in de schermkop', async ({ page }) => {
  await page.goto('./#/dagboek');
  const item = page.locator('.zijbalk__extra a');
  await expect(item).toHaveText('Delen');
  await item.click();
  await expect(page).toHaveURL(/#\/delen$/);
  await expect(page.locator('.zijbalk__extra a')).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/gewicht');
  await expect(page.getByRole('link', { name: 'Delen' }).first()).toBeVisible();
  await page.goto('./#/delen');
  await expect(page.locator('.schermkop__delen')).toHaveCount(0);
});

test('Delen: een tik op Versturen roept share precies één keer aan met één pdf-bestand', async ({ page }) => {
  await page.addInitScript(() => {
    window.__delingen = [];
    navigator.canShare = (gegevens) => !!gegevens?.files?.length;
    navigator.share = (gegevens) => {
      window.__delingen.push({ aantal: gegevens.files.length, naam: gegevens.files[0].name, type: gegevens.files[0].type, grootte: gegevens.files[0].size });
      return Promise.resolve();
    };
  });
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Twee weken' }).click();
  const versturen = page.getByRole('button', { name: 'Versturen' });
  await expect(versturen).toBeEnabled(); // de pdf is vooraf klaargemaakt
  await expect(versturen).toHaveClass(/knop--primair/);
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toHaveClass(/knop--secundair/);
  await expect(page.getByRole('button', { name: 'Afdrukken' })).toBeVisible();
  await expect(page.locator('.delen__hint')).toHaveText('Kies Mail, WhatsApp of Messenger in het venster dat opent.');
  await versturen.click();
  await expect(page.locator('.strook')).toContainText('klaar om te delen');
  const delingen = await page.evaluate(() => window.__delingen);
  expect(delingen).toHaveLength(1);
  expect(delingen[0]).toMatchObject({ aantal: 1, type: 'application/pdf' });
  expect(delingen[0].naam).toMatch(/^bloei-verslag-\d{4}-\d{2}-\d{2}(-\d{4}-\d{2}-\d{2})?\.pdf$/);
  expect(delingen[0].grootte).toBeGreaterThan(500);
});

test('Delen: een geannuleerd deelmenu geeft geen melding', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    // De nep-share telt de oproepen en zegt wanneer haar afwijzing afgehandeld kan zijn
    window.__afgewezen = 0;
    navigator.share = () => {
      const belofte = Promise.reject(new DOMException('geannuleerd', 'AbortError'));
      belofte.catch(() => {}).finally(() => (window.__afgewezen += 1));
      return belofte;
    };
  });
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Twee weken' }).click();
  await page.getByRole('button', { name: 'Versturen' }).click();
  // Geen vaste wachttijd: share is echt aangeroepen en afgewezen, en na twee beeldjes heeft de app haar .catch() gedraaid
  // (een strook zou daar meteen verschijnen). Pas dan zegt "geen strook" iets.
  await expect.poll(() => page.evaluate(() => window.__afgewezen)).toBe(1);
  await naTekenen(page);
  await expect(page.locator('.strook')).toHaveCount(0);
});

test('Delen: zonder bestanden delen is Bewaren de hoofdknop en staat er geen Versturen', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => false;
  });
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Twee weken' }).click();
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toHaveClass(/knop--primair/);
  await expect(page.getByRole('button', { name: 'Versturen' })).toHaveCount(0);
  await expect(page.locator('.delen__hint')).toHaveText('Bewaar de pdf en voeg hem toe aan je mail of bericht.');
});

test('Delen: in elke combinatie van de vier onderdelen staat nergens null, undefined, NaN of [object in het voorbeeld', async ({ page }) => {
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Twee weken' }).click();
  const namen = ['Eten', 'Drinken', 'Gewicht', 'Notities'];
  const vel = page.locator('.verslagvel');
  const stand = [true, true, false, false];
  const kapot = /\bnull\b|undefined|NaN|\[object/;
  for (const periode of ['Twee weken', 'Aangepast']) {
    await page.getByRole('button', { name: periode }).click();
    if (periode === 'Aangepast') {
      const velden = page.locator('.delen__datum input');
      await velden.nth(0).fill('2020-01-06');
      await velden.nth(1).fill('2020-01-12'); // een periode zonder gegevens
    }
    for (let i = 0; i < 16; i += 1) {
      const gray = i ^ (i >> 1);
      for (let b = 0; b < 4; b += 1) {
        const aan = Boolean(gray & (1 << b));
        if (aan !== stand[b]) {
          await page.getByRole('checkbox', { name: namen[b], exact: true }).click();
          stand[b] = aan;
        }
      }
      // Het voorbeeld is opnieuw getekend voor deze stand: het scherm verandert niet meer (geen vaste wachttijd)
      await domRustig(page);
      const tekst = await vel.innerText();
      expect(tekst, `${periode}, onderdelen ${gray.toString(2).padStart(4, '0')}`).not.toMatch(kapot);
    }
  }
});

test('Delen: Vandaag staat vooraan, geeft één dag zonder samenvatting en een bestandsnaam met één datum; zeven chips passen op 360 px', async ({ page }) => {
  await vul(page, 0);
  await page.goto('./#/delen');
  const chips = page.locator('.delen__periode .chips .chip');
  await expect(chips).toHaveText(['Vorige week', 'Gisteren', 'Vandaag', 'Deze week', 'Twee weken', 'Een maand', 'Aangepast']);
  await expect(page.getByRole('button', { name: 'Vandaag', exact: true })).toHaveAttribute('aria-pressed', 'true'); // standaard
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  const vel = page.locator('.verslagvel');
  await expect(vel).toContainText('havermout met fruit');
  await expect(vel.locator('.verslagvel__cijfers')).toHaveCount(1); // BESLISSING 331: ook één dag heeft een rij kerncijfers, voor die dag
  await expect(vel.locator('.verslagvel__cijferlabel')).toHaveText(['Maaltijden', 'Gedronken', 'Dagdoel']);
  await expect(vel).not.toContainText('Dagen ingevuld');
  await expect(vel).not.toContainText('Gemiddeld gedronken');
  await expect(vel.locator('.verslagvel__tabel')).toHaveCount(1); // één dag: één tabel (Onderdeel, Wat), zonder band
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^bloei-verslag-\d{4}-\d{2}-\d{2}\.pdf$/);
  for (const breedte of [390, 360]) {
    await page.setViewportSize({ width: breedte, height: 800 });
    const kaart = await page.locator('.delen__samenstel').boundingBox();
    for (let i = 0; i < 7; i += 1) {
      const b = await chips.nth(i).boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(kaart.x);
      expect(b.x + b.width).toBeLessThanOrEqual(kaart.x + kaart.width + 0.5);
    }
  }
});

test('Delen: Gisteren geeft precies de vorige dag, in het voorbeeld en in woorden; de periode wordt niet onthouden', async ({ page }) => {
  await vul(page, 1);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Gisteren', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gisteren', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const verwacht = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dag = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'][d.getDay()]; // BESLISSING 473: de gekozen periode staat voluit geschreven
    const maand = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'][d.getMonth()];
    return `${dag} ${d.getDate()} ${maand} ${d.getFullYear()}`;
  });
  const woorden = page.locator('.delen__periodewoorden');
  await expect(woorden).toContainText(verwacht);
  await expect(woorden).toContainText('1 dag');
  await expect(page.locator('.verslagvel')).toContainText('havermout met fruit');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  const naam = (await download).suggestedFilename();
  const gisteren = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  expect(naam).toBe(`bloei-verslag-${gisteren}.pdf`);
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  await expect(page.locator('.verslagvel')).not.toContainText('havermout met fruit'); // vandaag is leeg
  await page.reload();
  await expect(page.getByRole('button', { name: 'Vandaag', exact: true })).toHaveAttribute('aria-pressed', 'true'); // de periode wordt niet onthouden
});

test('Delen: opent met Vandaag; de knop bij de week opent Delen met die week (Deze week actief), een eerdere week is Aangepast', async ({ page }) => {
  await vul(page, 1);
  await page.goto('./#/delen');
  await expect(page.getByRole('button', { name: 'Vandaag', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Een maand' }).click();
  await page.goto('./#/vandaag');
  await page.goto('./#/delen');
  await expect(page.getByRole('button', { name: 'Vandaag', exact: true })).toHaveAttribute('aria-pressed', 'true'); // de periode wordt niet onthouden
  await page.goto('./#/dagboek/week');
  await page.getByRole('link', { name: 'Deze week delen' }).click(); // de knop Delen van het Dagboek is een link naar Delen met die periode
  await expect(page).toHaveURL(/#\/delen\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('button', { name: 'Deze week' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./#/delen/2020-01-06/2020-01-12');
  await expect(page.getByRole('button', { name: 'Aangepast' })).toHaveAttribute('aria-pressed', 'true');
});

// Wat in het voorbeeld en in de pdf staat, per onderdeel: een stukje tekst dat er alleen staat als het onderdeel aanstaat.
const MARKERS = { Eten: 'havermout met fruit', Drinken: 'Water', Gewicht: '71,3', Notities: 'Geheime verzonnen notitie' };

async function controleerStand(page, stand, naam) {
  const vel = page.locator('.verslagvel');
  for (const [label, marker] of Object.entries(MARKERS)) {
    const vak = page.getByRole('checkbox', { name: label, exact: true });
    await expect(vak, naam + ' ' + label).toHaveAttribute('aria-checked', String(stand[label]));
    if (stand[label]) await expect(vel, naam + ' ' + label).toContainText(marker);
    else await expect(vel, naam + ' ' + label).not.toContainText(marker);
  }
}

test('Delen: snel achter elkaar vinkvakken aantikken, twintig keer: vakken, voorbeeld, bewaarde keuze en pdf blijven kloppen', async ({ page }) => {
  await vul(page, 0);
  await page.goto('./#/delen');
  const namen = Object.keys(MARKERS);
  const stand = Object.fromEntries(namen.map((n) => [n, !['Gewicht', 'Notities'].includes(n)]));
  // Eerst alles aan: de standaard is gewicht en notities uit
  for (const n of ['Gewicht', 'Notities']) {
    await page.getByRole('checkbox', { name: n, exact: true }).click();
    stand[n] = true;
  }
  const reeksen = [
    ['Notities', 'Drinken', 'Gewicht', 'Eten'],
    ['Drinken', 'Notities', 'Eten', 'Gewicht'],
    ['Gewicht', 'Notities', 'Eten', 'Drinken'],
    ['Eten', 'Drinken', 'Notities', 'Gewicht'],
  ];
  for (let ronde = 0; ronde < 20; ronde += 1) {
    for (const naam of reeksen[ronde % reeksen.length]) {
      await page.getByRole('checkbox', { name: naam, exact: true }).click(); // zonder te wachten op het voorbeeld
      stand[naam] = !stand[naam];
    }
    if (!namen.some((n) => stand[n])) {
      await page.getByRole('checkbox', { name: 'Eten', exact: true }).click();
      stand['Eten'] = true;
    }
    await controleerStand(page, stand, 'ronde ' + ronde);
    // De pdf hoort bij de laatste stand
    const bewaarKnop = page.getByRole('button', { name: 'Bewaren', exact: true });
    await expect(bewaarKnop).toBeEnabled();
    const download = page.waitForEvent('download');
    await bewaarKnop.click();
    const tekst = pdfTekst(readFileSync(await (await download).path()));
    for (const [label, marker] of Object.entries(MARKERS)) {
      if (stand[label]) expect(tekst, 'pdf ronde ' + ronde + ' ' + label).toContain(marker);
      else expect(tekst, 'pdf ronde ' + ronde + ' ' + label).not.toContain(marker);
    }
  }
  // Na herladen is de laatste keuze bewaard
  await page.reload();
  for (const n of namen) await expect(page.getByRole('checkbox', { name: n, exact: true })).toHaveAttribute('aria-checked', String(stand[n]));
});

test('Delen: snel wisselen van periode laat de laatste keuze winnen, in het voorbeeld en in de pdf', async ({ page }) => {
  await vul(page, 0);
  await page.goto('./#/delen');
  for (const naam of ['Een maand', 'Twee weken', 'Vandaag', 'Deze week', 'Vandaag', 'Een maand', 'Vandaag']) await page.getByRole('button', { name: naam, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vandaag', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.verslagvel__cijfers')).toHaveCount(1); // één dag: de rij kerncijfers van die dag
  await expect(page.locator('.verslagvel .verslagvel__tabel').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  const bestand = await download;
  expect(bestand.suggestedFilename()).toMatch(/^bloei-verslag-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(pdfTekst(readFileSync(await bestand.path()))).not.toContain('Dagen ingevuld');
});

for (const breedte of [390, 360]) {
  test(`Delen: de dagtabel in het voorbeeld heeft tabelrollen, twee cellen per rij zonder Uur, en ruimte tussen naam en tekst (${breedte} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 844 });
    await vul(page, 0);
    await page.goto('./#/delen');
    await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
    const vel = page.locator('.verslagvel');
    const raster = vel.getByRole('table').first();
    await expect(raster).toBeVisible();
    await expect(vel.locator('.verslagvel__kolomkop > span')).toHaveText(['Maaltijd', 'Wat']);
    await expect(vel).not.toContainText('Uur'); // BESLISSING 336
    await expect(raster.getByRole('row')).toHaveCount(2); // het ontbijt en Drinken
    await expect(raster.getByRole('cell')).toHaveCount(4);
    // De afstand tussen de naam en de tekst is minstens 8 px, zonder horizontale scroll
    const rij = raster.getByRole('row').nth(0);
    const naam = await rij.getByRole('cell').nth(0).evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    const wat = await rij.getByRole('cell').nth(1).evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().left;
    });
    expect(wat - naam).toBeGreaterThanOrEqual(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Schermafbeelding alleen op verzoek (SHOTDIR), na de opkomst van het scherm
    if (breedte === 390 && process.env.SHOTDIR) {
      await animatiesKlaar(page);
      await raster.screenshot({ path: process.env.SHOTDIR + '/delen-390.png' });
    }
  });
}
