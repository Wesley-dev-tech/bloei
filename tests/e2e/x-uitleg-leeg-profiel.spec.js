// De uitleg met een vers profiel (de stand van de globale opstart: een naam, verder niets; geen supplementen, geen wegingen).
// Een stap die eerst iets opent (voor: openBewerkSupplement) en daarna haar onderdeel niet vindt, valt weg zoals elke stap zonder
// onderdeel; ze toont geen leeg vak met een tekst over iets wat niet op het scherm staat. Met supplementen blijven alle stappen (c-uitleg).
// BESLISSING 694: "Een supplement aanpassen" legt zonder supplementen de velden uit op het lege kaartje; de rondleiding van Supplementen toont
// één stap op de lege kaart met een aanbod naar het toevoegen; "Mijn gewicht noteren" zonder wegingen toont geen stap over een weging in de
// lijst of een punt in de grafiek. Bij een gevuld profiel blijven de stappen en teksten zoals ze waren (c-uitleg).
//
// In WebKit (de Safari-motor van Playwright): playwright.config.js blijft ongewijzigd; --browser kiest de motor voor één run:
//   PW_CHANNEL=chrome npx playwright test x-uitleg-leeg-profiel --browser=webkit
// (de globale opstart draait dan in Chrome; de tests zelf in WebKit, zonder kanaal, zie test.use hieronder).
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';

// WebKit kent het kanaal "chrome" niet: alleen Chromium krijgt het kanaal uit PW_CHANNEL.
test.use({ channel: async ({ browserName }, use) => use(browserName === 'chromium' ? process.env.PW_CHANNEL || undefined : undefined) });

const kaart = (page) => page.locator('.uitleg__kaart[role="dialog"]:not(.uitleg__kaart--welkom)');
const stapLabel = (page) => kaart(page).locator('.uitleg__stap');

// Het vak rond het onderdeel van de stap, zoals het getekend staat (custom properties van het gat).
async function vak(page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.uitleg__gat'));
    return { breed: parseFloat(s.getPropertyValue('--gb')) || 0, hoog: parseFloat(s.getPropertyValue('--gh')) || 0 };
  });
}

async function toonHetMe(page, onderwerp) {
  await page.goto('./#/meer/uitleg');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/uitleg');
  await page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp[onderwerp]}` }).click();
  await expect(kaart(page)).toBeVisible({ timeout: 10000 });
}

// Een handleiding met een actie (voor) of een stap midden op het scherm wacht toch op de onderdelen van het scherm zelf: in WebKit tekende
// toonde alleen "Waar je het terugziet"). In Chrome slaagt deze test ook zonder het herstel; de echte controle is de run in WebKit.
for (const [onderwerp, eerste] of [['maaltijd', 'regel']]) {
  test(`Toon het me: ${TEKSTEN.uitleg.onderwerp[onderwerp]} begint bij de eerste stap op Vandaag, met een onderdeel`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 660 });
    await toonHetMe(page, onderwerp);
    await expect(page).toHaveURL(/#\/vandaag$/);
    await expect(stapLabel(page)).toHaveText(/^Stap 1 van \d+$/);
    await expect(kaart(page)).toHaveAttribute('data-stap', new RegExp(`^${eerste}(\\.\\d+)?$`));
    await expect.poll(async () => { const v = await vak(page); return v.breed > 0 && v.hoog > 0; }).toBe(true);
    await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.overslaan }).click();
    await expect(page).toHaveURL(/#\/meer\/uitleg$/);
  });
}

// ---- BESLISSING 694 ----
const H = TEKSTEN.uitleg.handeling;
const LEEG = TEKSTEN.uitleg.leeg;
const KNOPPEN = [TEKSTEN.uitleg.volgende, TEKSTEN.uitleg.vorige, TEKSTEN.uitleg.overslaan];

// Het aantal supplementen in de database van de app (de uitleg bewaart niets).
const aantalSupplementen = (page) =>
  page.evaluate(() => new Promise((klaar, fout) => {
    const open = indexedDB.open('bloei-dagboek');
    open.onerror = () => fout(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('supplementen', 'readonly');
      const tel = tx.objectStore('supplementen').count();
      tel.onsuccess = () => { open.result.close(); klaar(tel.result); };
      tel.onerror = () => fout(tel.error);
    };
  }));

// Loopt een rondleiding af tot Klaar (of tot het aanbod, met { totAanbod: true }). Per stap: id, titel, tekst, of er een blad openstaat en
// de titel ervan. Elke stap: de teller blijft hetzelfde totaal tellen, het vak omvat een echt onderdeel en staat met de uitlegkaart in beeld, en
// de knoppen staan in de volgorde Volgende, Vorige, Overslaan (BESLISSING 549; Vorige niet in stap 1, Klaar in de laatste).
async function loopAf(page, { totAanbod = false } = {}) {
  const stappen = [];
  let totaal = null;
  for (let i = 1; i <= 15; i++) {
    await expect(stapLabel(page)).toHaveText(new RegExp(`^Stap ${i} van \\d+$`));
    const n = Number(((await stapLabel(page).textContent()) || '').match(/van (\d+)/)[1]);
    totaal ??= n;
    expect(n, 'de teller telt vanaf stap 1 hetzelfde totaal').toBe(totaal);
    const titel = ((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim();
    await expect.poll(async () => { const v = await vak(page); return v.breed > 0 && v.hoog > 0; }, { message: `stap ${i} (${titel}) heeft een onderdeel` }).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const g = getComputedStyle(document.querySelector('.uitleg__gat'));
      const top = parseFloat(g.getPropertyValue('--gt'));
      const k = document.querySelector('.uitleg__kaart[role="dialog"]').getBoundingClientRect();
      return top >= -1 && top + parseFloat(g.getPropertyValue('--gh')) <= innerHeight + 1 && k.top >= -1 && k.bottom <= innerHeight + 1;
    }), { message: `stap ${i} (${titel}): vak en uitlegkaart samen in beeld` }).toBe(true);
    const knoppen = (await kaart(page).locator('.uitleg__acties button:visible').allTextContents()).map((x) => x.trim());
    const laatste = i === totaal;
    expect(knoppen, `stap ${i}: de knoppen`).toEqual([laatste ? TEKSTEN.uitleg.klaar : KNOPPEN[0], ...(i > 1 ? [KNOPPEN[1]] : []), KNOPPEN[2]]);
    const blad = page.locator('dialog[open]');
    stappen.push({
      id: await kaart(page).getAttribute('data-stap'),
      titel,
      tekst: ((await kaart(page).locator('#uitleg-tekst').textContent()) || '').trim(),
      blad: (await blad.count()) ? ((await blad.locator('h2').first().textContent()) || '').trim() : null,
    });
    if (laatste) {
      if (!totAanbod) await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.klaar, exact: true }).click();
      break;
    }
    await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende, exact: true }).click();
  }
  return stappen;
}

// Wat het vak doorsnijdt in de lege kaart van Supplementen: elk zichtbaar onderdeel van de kaart (het merk, de zin, de knoppen) ligt helemaal in
// het vak of helemaal erbuiten, en het vak ligt binnen de kaart. Een lege lijst = niets doorgesneden. 10 px speling: het vak volgt de zichtbare
// inkt met lucht eromheen, en een tekstknop is hoger dan zijn letters (dat stuk zonder inkt mag buiten het vak vallen).
function gesnedenInLegeKaart(page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.uitleg__gat'));
    const [l, t, b, h] = ['--gl', '--gt', '--gb', '--gh'].map((n) => parseFloat(s.getPropertyValue(n)));
    const vak = { l, t, r: l + b, o: t + h };
    const SPELING = 10;
    const fout = [];
    const k = document.querySelector('.supplementen__leegkaart').getBoundingClientRect();
    if (vak.l < k.left - 2 || vak.t < k.top - 2 || vak.r > k.right + 2 || vak.o > k.bottom + 2) fout.push('het vak valt buiten de lege kaart');
    for (const e of document.querySelectorAll('.supplementen__leegkaart .leeg > *')) {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const binnen = r.top >= vak.t - SPELING && r.bottom <= vak.o + SPELING;
      const buiten = r.bottom <= vak.t + SPELING || r.top >= vak.o - SPELING;
      if (!binnen && !buiten) fout.push(`${e.tagName.toLowerCase()}.${String(e.getAttribute('class') || '').split(' ')[0]}: ${Math.round(r.top)} tot ${Math.round(r.bottom)}, het vak ${Math.round(vak.t)} tot ${Math.round(vak.o)}`);
    }
    return fout;
  });
}

// De stappen van "Een supplement aanpassen" op het lege kaartje: de velden, Bewaren en het toevoegen, met de teksten voor een leeg profiel.
const LIJST_LEEG = [
  { id: 'naam', titel: H.lijst.naam.titel, tekst: H.lijst.naam.tekst },
  { id: 'hoeveelheid', titel: H.lijst.hoeveelheid.titel, tekst: H.lijst.hoeveelheid.tekst },
  { id: 'ritme', titel: H.lijst.ritme.titel, tekst: H.lijst.ritme.tekst },
  { id: 'momenten', titel: H.lijst.momenten.titel, tekst: H.lijst.momenten.tekst },
  { id: 'periode', titel: H.lijst.periode.titel, tekst: H.lijst.periode.tekst },
  { id: 'einde', titel: H.lijst.einde.titel, tekst: H.lijst.einde.tekst },
  { id: 'bewaren', titel: H.lijst.bewaren.titel, tekst: LEEG.bewaren.tekst },
  { id: 'nieuw', titel: H.lijst.nieuw.titel, tekst: LEEG.nieuw.tekst },
];
const zonderDeel = (lijst) => lijst.map((s) => ({ ...s, id: s.id.replace(/\.\d+$/, '') }));

for (const [breed, hoog] of [[390, 660], [1280, 800]]) {
  // BESLISSING 694 (2): de handleiding opent zelf het lege kaartje en legt daarop de velden uit; Verwijderen bestaat daar niet en valt weg
  // vóór de teller begint. Er wordt niets bewaard.
  test(`Een supplement aanpassen zonder supplementen: de velden op het lege kaartje, de teller telt vanaf stap 1 juist (${breed}x${hoog})`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await toonHetMe(page, 'lijst');
    await expect(page).toHaveURL(/#\/supplementen$/);
    const stappen = await loopAf(page);
    expect(zonderDeel(stappen).map(({ id, titel, tekst }) => ({ id, titel, tekst }))).toEqual(LIJST_LEEG);
    // de velden en Bewaren staan op het lege kaartje (Supplement toevoegen); bij het toevoegen is het weer dicht
    for (const s of stappen.slice(0, -1)) expect(s.blad, s.id).toBe(TEKSTEN.supplementkaart.nieuw);
    expect(stappen.at(-1).blad).toBeNull();
    await expect(kaart(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/meer\/uitleg$/); // BESLISSING 549
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await aantalSupplementen(page)).toBe(0);
  });

  // BESLISSING 694 (1 en 3): de rondleiding van het tabblad Supplementen zonder supplementen: geen stap De momenten op de knop van de lege kaart
  // (en dus geen twee stappen op dezelfde knop), één stap Nog geen supplementen op de hele lege kaart, met een aanbod dat naar het toevoegen
  // leidt (geen doodlopende ingang). Het aanbod toont de stappen op het lege kaartje.
  test(`Supplementen zonder supplementen: één stap op de lege kaart en een aanbod naar het toevoegen (${breed}x${hoog})`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await page.goto('./#/supplementen');
    await expect(page.locator('.supplementen__leegkaart')).toBeVisible();
    await page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first().click();
    await expect(kaart(page)).toBeVisible({ timeout: 10000 });
    const stappen = await loopAf(page, { totAanbod: true });
    expect(stappen.map(({ id, titel, tekst }) => ({ id, titel, tekst }))).toEqual([{ id: 'toevoegen', titel: LEEG.supplementen.titel, tekst: LEEG.supplementen.tekst }]);
    // het vak is de hele lege kaart (met haar knop), niet alleen de knop. Op 390x660 past de hele kaart (268 px) niet meer boven de uitlegkaart
    // met de tekst over Lijst importeren en het aanbod (373 px): daar is het vak een heel blok in de kaart, van de zin tot en met Lijst importeren
    // (stappen.js, klein), en het snijdt niets door.
    const [gat, kaartRect] = await Promise.all([
      page.evaluate(() => { const s = getComputedStyle(document.querySelector('.uitleg__gat')); return ['--gl', '--gt', '--gb', '--gh'].map((n) => parseFloat(s.getPropertyValue(n))); }),
      page.locator('.supplementen__leegkaart').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }),
    ]);
    if (breed === 390) {
      await expect(kaart(page)).toHaveAttribute('data-doel', '.supplementen__leegkaart .leeg__tekst');
      expect(await gesnedenInLegeKaart(page)).toEqual([]);
    } else {
      gat.forEach((w, i) => expect(Math.abs(w - kaartRect[i]), 'het vak valt op de rand van de lege kaart').toBeLessThanOrEqual(2));
    }
    // het aanbod: naar het toevoegen, niet naar het afvinken
    const aanbod = kaart(page).locator('.uitleg__aanbod');
    await expect(aanbod).toBeVisible();
    await expect(aanbod.locator('.uitleg__tekst')).toHaveText(TEKSTEN.uitleg.aanbodVraag.lijst);
    await aanbod.getByRole('button', { name: `${TEKSTEN.uitleg.aanbodKnop}: ${TEKSTEN.uitleg.onderwerp.lijst}` }).click();
    await expect(stapLabel(page)).toHaveText(/^Stap 1 van \d+$/, { timeout: 10000 });
    const verder = await loopAf(page);
    expect(zonderDeel(verder).map(({ id, titel, tekst }) => ({ id, titel, tekst }))).toEqual(LIJST_LEEG);
    await expect(kaart(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/supplementen$/);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await aantalSupplementen(page)).toBe(0);
  });

  // Op een lage telefoon past de lege kaart niet naast de uitlegkaart: de stap licht dan haar inhoud uit (klein), in plaats van de kaart in twee
  // delen te verdelen met een tekst die niet bij een leeg profiel hoort.
  // De rand van het vak snijdt nooit door een element: op elke zichtbare telefoonmaat is het vak een geheel van de lege kaart (de hele kaart, de
  // zin tot en met Lijst importeren, of op 320x480 de knop Eerste supplement toevoegen), binnen de kaart en met de uitlegkaart samen in beeld.
  if (breed === 390) {
    for (const [b, h, doel] of [[445, 580, '.leeg__tekst'], [360, 560, '.leeg__tekst'], [320, 480, '.leeg > .knop']]) {
      test(`Supplementen zonder supplementen op een lage telefoon (${b}x${h}): nog altijd één stap Nog geen supplementen, het vak snijdt niets door`, async ({ page }) => {
        await page.setViewportSize({ width: b, height: h });
        await page.goto('./#/supplementen');
        await expect(page.locator('.supplementen__leegkaart')).toBeVisible();
        await page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first().click();
        await expect(kaart(page)).toBeVisible({ timeout: 10000 });
        const stappen = await loopAf(page, { totAanbod: true });
        expect(stappen.map(({ id, titel, tekst }) => ({ id, titel, tekst }))).toEqual([{ id: 'toevoegen', titel: LEEG.supplementen.titel, tekst: LEEG.supplementen.tekst }]);
        await expect(kaart(page).locator('.uitleg__aanbod button')).toBeVisible();
        await expect(kaart(page)).toHaveAttribute('data-doel', `.supplementen__leegkaart ${doel}`);
        expect(await gesnedenInLegeKaart(page)).toEqual([]);
      });
    }
  }

  // BESLISSING 694 (3): zonder wegingen vallen "Aanpassen of verwijderen" (een weging in de lijst) en "Een punt aantikken" (een punt in de grafiek)
  // weg, vóór de teller begint; de andere stappen en hun teksten blijven.
  test(`Mijn gewicht noteren zonder wegingen: geen stap over een weging in de lijst of een punt in de grafiek (${breed}x${hoog})`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await toonHetMe(page, 'gewicht');
    await expect(page).toHaveURL(/#\/gewicht$/);
    const stappen = await loopAf(page);
    const ids = [...new Set(zonderDeel(stappen).map((s) => s.id))];
    expect(ids).toEqual(['knop', 'getal', 'datum', 'bewaar', 'streef']);
    for (const s of zonderDeel(stappen)) expect(s.tekst, s.id).toBe(H.gewicht[s.id].tekst);
    await expect(page).toHaveURL(/#\/meer\/uitleg$/);
  });

  // BESLISSING 694 (1): "Supplementen afvinken" zonder supplementen gaat naar het tabblad Supplementen en toont daar één stap op de lege kaart,
  // met het aanbod naar het toevoegen. Na het aanbod de stappen op het lege kaartje; na Klaar terug op het scherm Rondleiding.
  test(`Toon het me: Supplementen afvinken zonder supplementen leidt naar het toevoegen (${breed}x${hoog})`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await toonHetMe(page, 'supplementen');
    await expect(page).toHaveURL(/#\/supplementen$/);
    const stappen = await loopAf(page, { totAanbod: true });
    expect(stappen.map(({ id, titel, tekst }) => ({ id, titel, tekst }))).toEqual([{ id: 'toevoegen', titel: LEEG.supplementen.titel, tekst: LEEG.supplementen.tekst }]);
    await kaart(page).locator('.uitleg__aanbod button').click();
    await expect(stapLabel(page)).toHaveText(/^Stap 1 van \d+$/, { timeout: 10000 });
    const verder = await loopAf(page);
    expect(zonderDeel(verder).map(({ id, titel, tekst }) => ({ id, titel, tekst }))).toEqual(LIJST_LEEG);
    await expect(page).toHaveURL(/#\/meer\/uitleg$/); // de keten begon op Rondleiding (BESLISSING 549)
    expect(await aantalSupplementen(page)).toBe(0);
  });

  // BESLISSING 694 (4), het vangnet: een handleiding die geen enkele stap kan tonen, toont de kaart Nog niets te zien (nooit stil niets).
  // Een supplement dat pas over een week begint: geen kaart Supplementen op Vandaag, geen lege kaart op het tabblad Supplementen.
  test(`Vangnet: een handleiding zonder enige stap toont Nog niets te zien (${breed}x${hoog})`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await page.evaluate(() => new Promise((klaar, fout) => {
      const open = indexedDB.open('bloei-dagboek');
      open.onerror = () => fout(open.error);
      open.onsuccess = () => {
        const x = new Date();
        const later = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 7, 12);
        const iso = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}`;
        const tx = open.result.transaction('supplementen', 'readwrite');
        tx.objectStore('supplementen').add({ naam: 'Vitamine D', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1, vanaf: iso });
        tx.oncomplete = () => { open.result.close(); klaar(); };
        tx.onerror = () => fout(tx.error);
      };
    }));
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await toonHetMe(page, 'supplementen');
    await expect(kaart(page).locator('.uitleg__titel')).toHaveText(LEEG.niets.titel, { timeout: 10000 });
    await expect(kaart(page).locator('#uitleg-tekst')).toHaveText(LEEG.niets.tekst);
    await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.klaar, exact: true }).click();
    await expect(page).toHaveURL(/#\/meer\/uitleg$/);
  });
}
