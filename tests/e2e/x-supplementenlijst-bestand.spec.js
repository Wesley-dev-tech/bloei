// De supplementenlijst bewaren als bestand en uit een bestand overnemen (BESLISSINGEN 696 en 707), het schermdeel: src/ui/supplementenlijst-bestand.js,
// in het tabblad Supplementen (schermen/supplementen.js): als laatste in de kaart "Mijn supplementen" en bij een lege lijst onder "Eerste supplement
// toevoegen". Bewaren (de download bevat de lijst en niets persoonlijks), overnemen in een lege lijst, Toevoegen en Vervangen (de lijst daarna, na
// herladen, de afgevinkte dagen blijven), elk fout bestand (de juiste zin, niets veranderd), annuleren (knop, Escape, tik ernaast), hetzelfde bestand
// twee keer, geen bestandsnaam en geen aantallen in de teksten (707), en de maten van de knoppen en de dialoog op telefoon, tablet en desktop.
// Draait tegen de gebouwde app, zoals de andere schermtests.
// Verzonnen supplementen: Multivitamine, Vitamine C, Kurkuma, Voorbeeldspuit, Visolie, Calcium. Verzonnen naam: Sofie.
import { test, expect } from '@playwright/test';
import { vasteKlok, VASTE_DATUM, datumVan } from './vaste-klok.js';

const BESTANDSNAAM = 'bloei-supplementenlijst.txt';

// ---------------------------------------------------------------- gegevens

const MULTI = { naam: 'Multivitamine', hoeveelheid: '1 tablet', aanwijzing: 'bij het ontbijt', ritme: { soort: 'dagelijks' }, momenten: ['ochtend'] };
const KURKUMA = { naam: 'Kurkuma', hoeveelheid: '1 capsule', aanwijzing: 'bij het eten', ritme: { soort: 'dagelijks' }, momenten: ['avond'] };
const SPUIT = { naam: 'Voorbeeldspuit', hoeveelheid: '1 ampul', aanwijzing: '', ritme: { soort: 'interval', dagen: 14, start: VASTE_DATUM }, momenten: [] };
const VISOLIE = { naam: 'Visolie', hoeveelheid: '1 tablet', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['middag'] };
const CALCIUM = { naam: 'Calcium', hoeveelheid: '1 tablet', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['avond'] };

// De teksten zoals de gebruiker ze ziet (707: geen bestandsnaam, geen aantallen).
const TEKST = {
  bewaard: 'Je lijst is geëxporteerd als bestand. Daarmee kan je ze op een ander toestel importeren.',
  leegVraag: 'De supplementen uit het bestand komen in je lijst.',
  keuzeVraag: 'Je hebt al supplementen in je lijst. Wat wil je doen met de lijst uit het bestand?',
  toevoegen: 'Toevoegen: wat nog niet in je lijst staat, komt erbij. Wat er al staat, blijft zoals het is.',
  toevoegenNiets: 'Toevoegen: alles uit het bestand staat al in je lijst. Er komt niets bij.',
  vervangen: 'Vervangen: je lijst wordt vervangen door de lijst uit het bestand. Wat je al afvinkte in je dagboek, blijft staan.',
  klaarNieuw: 'Importeren is gelukt.',
  klaarToevoegen: 'Je lijst is bijgewerkt.',
  klaarVervangen: 'Je lijst is vervangen.',
};

const bestandVan = (supplementen) => JSON.stringify({ soort: 'bloei-supplementenlijst', versie: 1, supplementen }, null, 2) + '\n';
const json = (tekst, naam = BESTANDSNAAM) => ({ name: naam, mimeType: naam.endsWith('.json') ? 'application/json' : 'text/plain', buffer: Buffer.from(tekst, 'utf8') });

// Zet de database klaar: alleen deze supplementen (met vaste id's) en deze afgevinkte momenten, en open het tabblad Supplementen.
async function zaai(page, supplementen = [], innames = []) {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    ({ supplementen, innames }) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction(['instellingen', 'supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'start.klaar', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Sofie' });
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          supplementen.forEach((s, i) => tx.objectStore('supplementen').put({ dosis: '', volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1, ...s }));
          for (const m of innames) tx.objectStore('momentinnames').add({ tijdstip: 1, voorbeeld: false, ...m });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    { supplementen, innames },
  );
  await openTabblad(page);
}

async function openTabblad(page) {
  await page.goto('./?opnieuw#/supplementen');
  await page.locator('#scherm[data-scherm="supplementen"]').waitFor();
  await expect(page.locator('.lijstbestand [data-lijstbestand="overnemen"]')).toBeVisible();
}

const lees = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction(['supplementen', 'momentinnames'], 'readonly');
          const uit = {};
          tx.objectStore('supplementen').getAll().onsuccess = (e) => (uit.supplementen = e.target.result);
          tx.objectStore('momentinnames').getAll().onsuccess = (e) => (uit.innames = e.target.result);
          tx.oncomplete = () => {
            db.close();
            klaar(uit);
          };
        };
      }),
  );
const actieveNamen = (stand) => stand.supplementen.filter((s) => s.actief).sort((a, b) => a.volgorde - b.volgorde || a.id - b.id).map((s) => s.naam);

// Kiest een bestand via de echte bestandskiezer: een tik op "Lijst uit een bestand overnemen" opent hem.
async function kies(page, bestand) {
  const kiezer = page.waitForEvent('filechooser');
  await page.locator('[data-lijstbestand="overnemen"]').click();
  await (await kiezer).setFiles(bestand);
}

const dialoog = (page) => page.locator('dialog.lijstbestand__dialoog[open]');
const strook = (page) => page.locator('.strokenhouder .strook__tekst');

test.describe('Supplementenlijst als bestand (696)', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('bewaren: de download bevat de lijst en niets persoonlijks, met een melding', async ({ page }, info) => {
    await zaai(page, [{ id: 1, ...MULTI, teltVanaf: VASTE_DATUM }, { id: 2, ...KURKUMA }, { id: 3, ...SPUIT, tot: '2027-03-01' }], [{ datum: VASTE_DATUM, supplementId: 1, moment: 'ochtend' }]);
    const rij = page.locator('.lijstbestand__knoppen');
    // Een korte zichtbare tekst; de schermlezer hoort de volledige zin (die met de zichtbare tekst begint).
    await expect(rij.locator('.knop')).toHaveText(['Exporteren', 'Importeren']);
    await expect(page.getByRole('button', { name: 'Exporteren als bestand', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importeren uit een bestand', exact: true })).toBeVisible();
    // BESLISSING 722: de groep heet naar de knoppen Exporteren en Importeren.
    await expect(page.getByRole('group', { name: 'Je supplementenlijst exporteren of importeren' })).toBeVisible();
    // Als laatste in de kaart "Mijn supplementen".
    expect(await page.locator('.overzichtkaart').evaluate((k) => k.lastElementChild.classList.contains('lijstbestand'))).toBe(true);
    const wacht = page.waitForEvent('download');
    await page.locator('[data-lijstbestand="bewaren"]').click();
    const download = await wacht;
    expect(download.suggestedFilename()).toBe(BESTANDSNAAM);
    const pad = info.outputPath(BESTANDSNAAM);
    await download.saveAs(pad);
    const tekst = (await import('node:fs')).readFileSync(pad, 'utf8');
    const data = JSON.parse(tekst);
    expect(data.soort).toBe('bloei-supplementenlijst');
    expect(data.versie).toBe(1);
    expect(data.supplementen.map((s) => s.naam)).toEqual(['Multivitamine', 'Kurkuma', 'Voorbeeldspuit']);
    expect(data.supplementen[2]).toEqual({ ...SPUIT, tot: '2027-03-01' });
    // Niets persoonlijks: geen naam van de gebruiker, geen id, geen dag van toevoegen, geen afgevinkte dagen.
    expect(tekst).not.toContain('Sofie');
    for (const veld of ['"id"', 'teltVanaf', 'aangemaaktOp', 'volgorde', 'actief', 'momentinnames', 'supplementId']) expect(tekst).not.toContain(veld);
    await expect(strook(page)).toHaveText(TEKST.bewaard);
  });

  test('een lege lijst: alleen overnemen als tekstknop, de bevestiging, daarna de lijst, ook na herladen', async ({ page }) => {
    await zaai(page);
    const leeg = page.locator('.supplementen__leegkaart .leeg');
    // Een tekstknop onder "Eerste supplement toevoegen", dat de eerste knop van de kaart blijft.
    await expect(leeg.locator('.knop')).toHaveText(['Eerste supplement toevoegen', 'Lijst importeren']);
    await expect(page.locator('.supplementen__leegkaart button').first()).toHaveText('Eerste supplement toevoegen');
    await expect(page.locator('[data-lijstbestand="overnemen"]')).toHaveClass(/knop--tekst/);
    await expect(page.locator('[data-lijstbestand="bewaren"]')).toHaveCount(0);
    await kies(page, json(bestandVan([MULTI, KURKUMA, SPUIT])));
    const d = dialoog(page);
    await expect(d.locator('.dialoog__titel')).toHaveText('Lijst importeren');
    await expect(d.locator('.lijstbestand__vraag')).toHaveText(TEKST.leegVraag);
    await expect(d.locator('.dialoog__acties .knop')).toHaveText(['Importeren', 'Annuleren']);
    await expect(d.getByRole('button', { name: 'Annuleren' })).toBeFocused();
    await d.getByRole('button', { name: 'Importeren' }).click();
    await expect(d).toHaveCount(0);
    await expect(strook(page)).toHaveText(TEKST.klaarNieuw);
    expect(actieveNamen(await lees(page))).toEqual(['Multivitamine', 'Kurkuma', 'Voorbeeldspuit']);
    await expect(page.locator('.overzichtkaart')).toContainText('Voorbeeldspuit');
    // De nieuwe knop krijgt de focus terug.
    await expect(page.locator('[data-lijstbestand="overnemen"]')).toBeFocused();
    await page.reload();
    await openTabblad(page);
    expect(actieveNamen(await lees(page))).toEqual(['Multivitamine', 'Kurkuma', 'Voorbeeldspuit']);
    await expect(page.locator('.overzichtkaart')).toContainText('Kurkuma');
    // Elk nieuw supplement telt vanaf de dag van overnemen (698).
    expect((await lees(page)).supplementen.every((s) => s.teltVanaf === VASTE_DATUM)).toBe(true);
  });

  test('een supplement in een lege lijst: dezelfde zinnen, zonder aantal', async ({ page }) => {
    await zaai(page);
    await kies(page, json(bestandVan([KURKUMA])));
    await expect(dialoog(page).locator('.lijstbestand__vraag')).toHaveText(TEKST.leegVraag);
    await dialoog(page).getByRole('button', { name: 'Importeren' }).click();
    await expect(strook(page)).toHaveText(TEKST.klaarNieuw);
  });

  test('namen met $&, $\' en $$ komen letterlijk over, in de lijst, in een zin en in een nieuw bestand', async ({ page }) => {
    const namen = ['A$&B', "50$'", 'C$$D'];
    await zaai(page);
    await kies(page, json(bestandVan(namen.map((naam) => ({ ...MULTI, naam })))));
    await expect(dialoog(page).locator('.lijstbestand__vraag')).toHaveText(TEKST.leegVraag);
    await dialoog(page).getByRole('button', { name: 'Importeren' }).click();
    await expect(strook(page)).toHaveText(TEKST.klaarNieuw);
    // De naam in een zin van t() (de knop in het schema heet "Schema van <naam> aanpassen").
    for (const naam of namen) await expect(page.getByRole('button', { name: `Schema van ${naam} aanpassen`, exact: true })).toHaveCount(1);
    expect(actieveNamen(await lees(page))).toEqual(namen);
    for (const naam of namen) await expect(page.locator('.overzichtkaart')).toContainText(naam);
    const wacht = page.waitForEvent('download');
    await page.locator('[data-lijstbestand="bewaren"]').click();
    const tekst = await (await wacht).createReadStream().then((s) => new Promise((klaar) => { let t = ''; s.on('data', (d) => (t += d)); s.on('end', () => klaar(t)); }));
    expect(JSON.parse(tekst).supplementen.map((s) => s.naam)).toEqual(namen);
  });

  test('Toevoegen: de keuze zonder aantallen, wat er al staat blijft, de afgevinkte dagen blijven, ook na herladen', async ({ page }) => {
    const innames = [
      { datum: datumVan(-1), supplementId: 1, moment: 'ochtend' },
      { datum: datumVan(-1), supplementId: 2, moment: 'middag' },
    ];
    await zaai(page, [{ id: 1, ...MULTI }, { id: 2, ...VISOLIE }], innames);
    await kies(page, json(bestandVan([MULTI, KURKUMA, SPUIT])));
    const d = dialoog(page);
    await expect(d.locator('.lijstbestand__vraag')).toHaveText(TEKST.keuzeVraag);
    await expect(d.locator('.lijstbestand__keuze').nth(0)).toHaveText(TEKST.toevoegen);
    await expect(d.locator('.lijstbestand__keuze').nth(1)).toHaveText(TEKST.vervangen);
    await expect(d.locator('.dialoog__acties .knop')).toHaveText(['Toevoegen', 'Vervangen', 'Annuleren']);
    // Geen enkel cijfer en geen bestandsnaam in de dialoog (707).
    expect(await d.innerText()).not.toMatch(/\d|json/i);
    await d.getByRole('button', { name: 'Toevoegen' }).click();
    await expect(strook(page)).toHaveText(TEKST.klaarToevoegen);
    let stand = await lees(page);
    expect(actieveNamen(stand)).toEqual(['Multivitamine', 'Visolie', 'Kurkuma', 'Voorbeeldspuit']);
    expect(stand.innames.length).toBe(2);
    await page.reload();
    await openTabblad(page);
    stand = await lees(page);
    expect(actieveNamen(stand)).toEqual(['Multivitamine', 'Visolie', 'Kurkuma', 'Voorbeeldspuit']);
    expect(stand.innames.map((i) => i.supplementId).sort()).toEqual([1, 2]);
  });

  test('Vervangen: de lijst wordt die van het bestand, wat afgevinkt was blijft, ook na herladen', async ({ page }) => {
    const innames = [
      { datum: datumVan(-1), supplementId: 1, moment: 'ochtend' },
      { datum: datumVan(-2), supplementId: 2, moment: 'middag' },
    ];
    await zaai(page, [{ id: 1, ...MULTI, hoeveelheid: '2 tabletten' }, { id: 2, ...VISOLIE }, { id: 3, ...CALCIUM }], innames);
    await kies(page, json(bestandVan([MULTI, KURKUMA, SPUIT])));
    const d = dialoog(page);
    await expect(d.locator('.lijstbestand__vraag')).toHaveText(TEKST.keuzeVraag);
    await expect(d.locator('.lijstbestand__keuze').nth(0)).toHaveText(TEKST.toevoegen);
    await d.getByRole('button', { name: 'Vervangen' }).click();
    await expect(strook(page)).toHaveText(TEKST.klaarVervangen);
    const controleer = async () => {
      const stand = await lees(page);
      expect(actieveNamen(stand)).toEqual(['Multivitamine', 'Kurkuma', 'Voorbeeldspuit']);
      const multi = stand.supplementen.find((s) => s.naam === 'Multivitamine');
      expect(multi.id).toBe(1); // houdt zijn id en dus zijn afgevinkte dagen
      expect(multi.hoeveelheid).toBe('1 tablet'); // met de gegevens uit het bestand
      expect(stand.supplementen.find((s) => s.naam === 'Visolie').actief).toBe(false); // met afgevinkte dagen: bewaard, niet meer in de lijst
      expect(stand.supplementen.some((s) => s.naam === 'Calcium')).toBe(false); // zonder afgevinkte dagen: weg
      expect(stand.innames.map((i) => i.supplementId).sort()).toEqual([1, 2]);
    };
    await controleer();
    await page.reload();
    await openTabblad(page);
    await controleer();
    await expect(page.locator('.overzichtkaart')).not.toContainText('Calcium');
  });

  test('alles staat er al: dat zegt de dialoog, en Toevoegen is geen knop', async ({ page }) => {
    await zaai(page, [{ id: 1, ...MULTI }, { id: 2, ...KURKUMA }]);
    await kies(page, json(bestandVan([KURKUMA, MULTI])));
    const d = dialoog(page);
    await expect(d.locator('.lijstbestand__keuze').nth(0)).toHaveText(TEKST.toevoegenNiets);
    await expect(d.locator('.dialoog__acties .knop')).toHaveText(['Vervangen', 'Annuleren']);
    await expect(d.locator('.lijstbestand__keuze').nth(1)).toHaveText(TEKST.vervangen);
  });

  test('een supplement in de lijst en een erbij: dezelfde zinnen, zonder aantal', async ({ page }) => {
    await zaai(page, [{ id: 1, ...MULTI }]);
    await kies(page, json(bestandVan([MULTI, KURKUMA])));
    const d = dialoog(page);
    await expect(d.locator('.lijstbestand__vraag')).toHaveText(TEKST.keuzeVraag);
    await expect(d.locator('.lijstbestand__keuze').nth(0)).toHaveText(TEKST.toevoegen);
    await d.getByRole('button', { name: 'Toevoegen' }).click();
    await expect(strook(page)).toHaveText(TEKST.klaarToevoegen);
  });

  test('een fout bestand: de zin bij elke reden, geen dialoog, en er verandert niets', async ({ page }) => {
    await zaai(page, [{ id: 1, ...MULTI }], [{ datum: datumVan(-1), supplementId: 1, moment: 'ochtend' }]);
    const voor = await lees(page);
    const honderdEen = Array.from({ length: 101 }, (_, i) => ({ ...MULTI, naam: 'Kuur ' + (i + 1) }));
    const gevallen = [
      [json(''), 'Dat bestand is leeg.'],
      [json('x'.repeat(256 * 1024 + 1)), 'Dat bestand is te groot voor een supplementenlijst.'],
      [json('{ dit is geen json'), 'Dat bestand kan Bloei niet lezen. Kies het bestand dat je met Exporteren maakte.'],
      [json(JSON.stringify({ soort: 'iets-anders', versie: 1, supplementen: [] }), 'ander.json'), 'Dat is geen supplementenlijst van Bloei. Kies het bestand dat je met Exporteren maakte.'],
      [json(JSON.stringify({ soort: 'bloei-supplementenlijst', versie: 2, supplementen: [MULTI] })), 'Dat bestand komt van een nieuwere versie van Bloei. Werk de app eerst bij.'],
      [json(bestandVan([])), 'In dat bestand staan geen supplementen.'],
      [json(bestandVan(honderdEen)), 'In dat bestand staan te veel supplementen. Dat importeert Bloei niet.'],
      [json(bestandVan([MULTI, { ...KURKUMA, momenten: ['nacht'] }])), 'Het bestand klopt niet. Er is niets geïmporteerd.'],
    ];
    for (const [bestand, zin] of gevallen) {
      expect(zin).not.toMatch(/\d|json/i); // geen aantal en geen bestandsnaam (707)
      await kies(page, bestand);
      await expect(strook(page)).toHaveText(zin);
      await expect(dialoog(page)).toHaveCount(0);
      expect(await page.locator('.lijstbestand__invoer').inputValue()).toBe('');
    }
    expect(await lees(page)).toEqual(voor);
  });

  test('annuleren met de knop, met Escape en met een tik ernaast: er verandert niets en de focus keert terug', async ({ page }) => {
    await zaai(page, [{ id: 1, ...MULTI }]);
    const voor = await lees(page);
    const bestand = json(bestandVan([MULTI, KURKUMA]));
    const knop = page.locator('[data-lijstbestand="overnemen"]');

    await kies(page, bestand);
    await dialoog(page).getByRole('button', { name: 'Annuleren' }).click();
    await expect(dialoog(page)).toHaveCount(0);
    await expect(knop).toBeFocused();

    // Hetzelfde bestand nog eens: de kiezer is leeggemaakt, dus de dialoog komt opnieuw.
    expect(await page.locator('.lijstbestand__invoer').inputValue()).toBe('');
    await kies(page, bestand);
    await expect(dialoog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialoog(page)).toHaveCount(0);
    await expect(knop).toBeFocused();

    await kies(page, bestand);
    await expect(dialoog(page)).toBeVisible();
    await page.mouse.click(4, 4); // naast het blad, op de achtergrond van de dialoog
    await expect(dialoog(page)).toHaveCount(0);

    expect(await lees(page)).toEqual(voor);
  });

  test('hetzelfde bestand twee keer overnemen: de tweede keer komt er niets bij', async ({ page }) => {
    await zaai(page, [{ id: 1, ...MULTI }]);
    const bestand = json(bestandVan([MULTI, KURKUMA]));
    await kies(page, bestand);
    await dialoog(page).getByRole('button', { name: 'Toevoegen' }).click();
    await expect(strook(page)).toHaveText(TEKST.klaarToevoegen);
    await kies(page, bestand);
    await expect(dialoog(page).locator('.lijstbestand__keuze').nth(0)).toHaveText(TEKST.toevoegenNiets);
    await dialoog(page).getByRole('button', { name: 'Annuleren' }).click();
    expect(actieveNamen(await lees(page))).toEqual(['Multivitamine', 'Kurkuma']);
  });

  test('tijdens het overnemen is de dialoog bezig: een tweede tik doet niets', async ({ page }) => {
    await zaai(page, [{ id: 1, ...MULTI }]);
    await kies(page, json(bestandVan([KURKUMA])));
    const toevoegen = dialoog(page).getByRole('button', { name: 'Toevoegen' });
    // Twee tikken vlak na elkaar: de eerste zet de dialoog op bezig (alle knoppen uit), de tweede verandert niets.
    await toevoegen.evaluate((b) => {
      b.click();
      b.click();
    });
    await expect(strook(page)).toHaveText(TEKST.klaarToevoegen);
    expect(actieveNamen(await lees(page))).toEqual(['Multivitamine', 'Kurkuma']);
  });

  // De maten (CLAUDE.md): telefoon 390 x 844 en de zichtbare maten, tablet en desktop. De knoppen even breed en gecentreerd in de kaart, niets erbuiten,
  // tikvlakken minstens 44 px, de dialoog volledig in beeld zonder scrollen.
  const MATEN = [
    [390, 844], [445, 580], [390, 660], [360, 560], [320, 480], [820, 1180], [1280, 800],
  ];
  const meetRij = (page) =>
    page.evaluate(() => {
      const el = document.querySelector('.lijstbestand');
      const kaart = el.closest('.kaart');
      const k = kaart.getBoundingClientRect();
      const stijl = getComputedStyle(kaart);
      const binnenL = k.left + parseFloat(stijl.paddingLeft);
      const binnenR = k.right - parseFloat(stijl.paddingRight);
      const kleur = (waarde) => {
        const p = document.createElement('div');
        p.style.background = waarde;
        el.append(p);
        const c = getComputedStyle(p).backgroundColor;
        p.remove();
        return c;
      };
      const maat = (b) => {
        const r = b.getBoundingClientRect();
        const s = getComputedStyle(b);
        const tekst = b.querySelector('.knop__tekst');
        return {
          l: r.left, r: r.right, b: r.width, h: r.height, top: r.top, bottom: r.bottom, bg: s.backgroundColor, fg: s.color, fs: s.fontSize,
          padL: parseFloat(s.paddingLeft), padR: parseFloat(s.paddingRight), tekstB: tekst ? tekst.getBoundingClientRect().width : 0,
          past: b.scrollWidth <= b.clientWidth + 1, klasse: b.className,
        };
      };
      const knoppen = [...el.querySelectorAll('.knop')].map(maat);
      const eerste = kaart.querySelector('.leeg > .knop');
      return { binnenL, binnenR, knoppen, eerste: eerste ? maat(eerste) : null, zacht: kleur('var(--knop-zacht-bg)'), pagina: document.documentElement.scrollWidth <= window.innerWidth };
    });
  const meetDialoog = (page) =>
    page.evaluate(() => {
      const d = document.querySelector('dialog.lijstbestand__dialoog[open]');
      const r = d.getBoundingClientRect();
      const blad = d.querySelector('.dialoog__blad');
      const knoppen = [...d.querySelectorAll('.dialoog__acties .knop')].map((b) => {
        const k = b.getBoundingClientRect();
        return { l: k.left, r: k.right, b: k.width, h: k.height, fs: getComputedStyle(b).fontSize, bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color, past: b.scrollWidth <= b.clientWidth + 1 };
      });
      const acties = d.querySelector('.dialoog__acties').getBoundingClientRect();
      return {
        top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: window.innerWidth, vh: window.innerHeight,
        scrollt: Math.max(d.scrollHeight - d.clientHeight, blad.scrollHeight - blad.clientHeight),
        knoppen, actiesMidden: (acties.left + acties.right) / 2, bladMidden: (blad.getBoundingClientRect().left + blad.getBoundingClientRect().right) / 2,
      };
    });
  const even = (knoppen) => Math.max(...knoppen.map((k) => k.b)) - Math.min(...knoppen.map((k) => k.b));

  for (const [b, hoogte] of MATEN) {
    test(`maten op ${b} x ${hoogte}: de knoppenrij en de dialoog`, async ({ page }) => {
      await page.setViewportSize({ width: b, height: hoogte });
      await zaai(page, [{ id: 1, ...MULTI }, { id: 2, ...VISOLIE }]);
      await page.locator('.lijstbestand').scrollIntoViewIfNeeded();
      const rij = await meetRij(page);
      expect(rij.pagina).toBe(true);
      expect(rij.knoppen.length).toBe(2);
      expect(even(rij.knoppen)).toBeLessThanOrEqual(1);
      // Stand A (707): de kleinste knopmaat van de app met een tikvlak van 44 px (de knoppen van het supplementblad): 44 px hoog, 14 px letter
      // op de telefoon en 15 px vanaf 720 px, 16 px binnenruimte opzij, niet breder dan de langste tekst met die binnenruimte.
      const langste = Math.max(...rij.knoppen.map((k) => k.tekstB));
      for (const k of rij.knoppen) {
        expect(k.h).toBeGreaterThanOrEqual(44);
        expect(k.h).toBeLessThanOrEqual(44.5);
        expect(k.fs).toBe(b < 720 ? '14px' : '15px');
        expect(k.padL).toBe(16);
        // BESLISSING 731: vanaf 960 breed is elke knop 10,5 rem (189 px) breed; daaronder tekst, binnenruimte, de rand van 1 px (transparant) en 1 px speling.
        if (b >= 960) expect(Math.abs(k.b - 189)).toBeLessThanOrEqual(1);
        else expect(k.b).toBeLessThanOrEqual(langste + 32 + 2 + 1);
        expect(k.l).toBeGreaterThanOrEqual(rij.binnenL - 0.5);
        expect(k.r).toBeLessThanOrEqual(rij.binnenR + 0.5);
        expect(k.past).toBe(true);
        expect(k.bg).not.toBe(k.fg); // nooit wit op wit
        expect(k.bg).toBe(rij.zacht); // een groep: de zachte tint van het tabblad
        expect(k.b).toBeLessThan((rij.binnenR - rij.binnenL) * 0.75); // niet over de volle breedte
      }
      // Naast elkaar waar het past (vanaf 360 px), op de smalste telefoon onder elkaar.
      if (b >= 360) expect(Math.abs(rij.knoppen[0].top - rij.knoppen[1].top)).toBeLessThanOrEqual(0.5);
      else expect(rij.knoppen[1].top).toBeGreaterThan(rij.knoppen[0].bottom - 0.5);
      // Gecentreerd: de rij staat op de middenlijn van de kaart.
      const midden = (Math.min(...rij.knoppen.map((k) => k.l)) + Math.max(...rij.knoppen.map((k) => k.r))) / 2;
      expect(Math.abs(midden - (rij.binnenL + rij.binnenR) / 2)).toBeLessThanOrEqual(1);

      await kies(page, json(bestandVan([MULTI, KURKUMA, SPUIT])));
      await expect(dialoog(page)).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
      const d = await meetDialoog(page);
      expect(d.top).toBeGreaterThanOrEqual(0);
      expect(d.left).toBeGreaterThanOrEqual(0);
      expect(d.bottom).toBeLessThanOrEqual(d.vh + 0.5);
      expect(d.right).toBeLessThanOrEqual(d.vw + 0.5);
      expect(d.scrollt).toBeLessThanOrEqual(1);
      expect(d.knoppen.length).toBe(3);
      expect(even(d.knoppen)).toBeLessThanOrEqual(1);
      for (const k of d.knoppen) {
        // Dezelfde knopmaat als de andere vragen van de app (bevestig, de wisdialoog): 48 px hoog, vanaf 960 px 44 px, letter 15 px.
        expect(Math.abs(k.h - (b < 960 ? 48 : 44))).toBeLessThanOrEqual(0.5);
        expect(k.fs).toBe('15px');
        expect(k.past).toBe(true);
        expect(k.bg).not.toBe(k.fg);
        expect(k.bg).toBe(d.knoppen[0].bg);
      }
      expect(Math.abs(d.actiesMidden - d.bladMidden)).toBeLessThanOrEqual(1);
    });
  }

  test('een lege lijst: een tekstknop zoals Eerste supplement toevoegen, eronder, gecentreerd, 8 px ertussen', async ({ page }) => {
    for (const [b, hoogte] of [[390, 844], [390, 660], [320, 480], [820, 1180], [1280, 800]]) {
      await page.setViewportSize({ width: b, height: hoogte });
      await zaai(page);
      const rij = await meetRij(page);
      expect(rij.knoppen.length).toBe(1);
      const [k] = rij.knoppen;
      const e = rij.eerste;
      expect(k.klasse).toContain('knop--tekst');
      // Zelfde stijl en maat als "Eerste supplement toevoegen".
      expect(k.h).toBe(e.h);
      expect(k.fs).toBe(e.fs);
      expect(k.padL).toBe(e.padL);
      expect(k.fg).toBe(e.fg);
      expect(k.bg).toBe(e.bg);
      expect(k.h).toBeGreaterThanOrEqual(44);
      // Eronder, met de tussenruimte tussen twee tekstknoppen onder elkaar (8 px, zoals op het slotscherm).
      expect(Math.abs(k.top - e.bottom - 8)).toBeLessThanOrEqual(0.5);
      expect(k.l).toBeGreaterThanOrEqual(rij.binnenL - 0.5);
      expect(k.r).toBeLessThanOrEqual(rij.binnenR + 0.5);
      expect(k.past).toBe(true);
      expect(Math.abs((k.l + k.r) / 2 - (rij.binnenL + rij.binnenR) / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs((k.l + k.r) / 2 - (e.l + e.r) / 2)).toBeLessThanOrEqual(1);
    }
  });
});
