// De pdf van het verslag (BESLISSING 302): een afdrukbaar A4-document. Hier de echte pdf uit het scherm Delen, gelezen op tekst en structuur:
// kop en voet op elke pagina, een redelijk aantal pagina's, alleen de aangevinkte onderdelen, de dagen in volgorde en de kerncijfers.
// Alle gegevens zijn verzonnen.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pdfTekst } from './pdf-tekst.js';
import { domRustig } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

const DAGEN = 14;

// Veertien dagen met drie maaltijden, twee soorten drinken en om de drie dagen een notitie; twee wegingen in twee verschillende weken.
async function vulVeertienDagen(page) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    (aantal) =>
      new Promise((klaar, fout) => {
        const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'dranken', 'dagen', 'wegingen', 'supplementen', 'momentinnames'], 'readwrite');
          for (let i = 0; i < aantal; i += 1) {
            const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i);
            const datum = sleutel(d);
            [['ontbijt', '08:15', 'testmaaltijd ontbijt'], ['middagmaal', '12:30', 'testmaaltijd middag'], ['avondmaal', '18:45', 'testmaaltijd avond']].forEach(([soort, tijd, tekst]) =>
              tx.objectStore('maaltijden').put({ datum, soort, tijd, tekst, fotoId: null, voorbeeld: false, gewijzigdOp: 1 }),
            );
            tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 1000 - i, soort: 'water', ml: 500 + (i % 4) * 500, voorbeeld: false });
            tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 900 - i, soort: 'thee', ml: 200, voorbeeld: false });
            tx.objectStore('dagen').put({ datum, notitie: i % 3 === 0 ? `Verzonnen notitie ${i}` : '', doelGehaald: false, voorbeeld: false });
            if (i === 0 || i === 9) {
              const maandag = sleutel(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
              tx.objectStore('wegingen').put({ week: maandag, datum, kg: i === 0 ? 70.9 : 71.3, voorbeeld: false, gewijzigdOp: 1 });
            }
          }
          const sup = tx.objectStore('supplementen').add({ naam: 'Vitamine D', dosis: '1x per dag 1 capsule', hoeveelheid: '1 capsule', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          sup.onsuccess = () => tx.objectStore('momentinnames').put({ datum: sleutel(nu), supplementId: sup.result, moment: 'ochtend', tijdstip: Date.now() - 500, voorbeeld: false });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    DAGEN,
  );
}

const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const titel = (d) => {
  const t = new Intl.DateTimeFormat('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  return t.toLocaleUpperCase('nl-BE'); // BESLISSING 459: in de pdf staan dagkoppen en periodes echt in hoofdletters
};
const KORTE_PERIODE = /^[A-Z]{2} \d+ [A-Z.]+ \d{4} - [A-Z]{2} \d+ [A-Z.]+ \d{4}$/;

async function bewaarPdf(page) {
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  const bestand = await download;
  return { bestand, buffer: readFileSync(await bestand.path()) };
}

test('Delen: de pdf van twee weken heeft kop en voet op elke pagina, de dagen in volgorde, de juiste kerncijfers en alleen de aangevinkte onderdelen; ook offline', async ({ page, context }) => {
  const extern = [];
  const fouten = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) extern.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
  page.on('pageerror', (e) => fouten.push(String(e)));

  await vulVeertienDagen(page);
  const nu = new Date();
  const van = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - (DAGEN - 1));
  await page.goto(`./#/delen/${sleutel(van)}/${sleutel(nu)}`);
  await expect(page.getByRole('button', { name: 'Aangepast' })).toHaveAttribute('aria-pressed', 'true');
  const naam = ((await page.locator('.verslagvel .verslagvel__naamkop').textContent()) ?? '').trim().replace(/^Verslag van /, '');
  expect(naam.length).toBeGreaterThan(0);

  // Standaard: Eten en Drinken
  await expect(page.getByRole('checkbox', { name: 'Gewicht', exact: true })).toHaveAttribute('aria-checked', 'false');
  const standaard = await bewaarPdf(page);
  expect(standaard.bestand.suggestedFilename()).toMatch(/^bloei-verslag-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/);
  const ruw = standaard.buffer.toString('latin1');
  expect(ruw.match(/\/Type \/Page /g)?.length).toBeGreaterThanOrEqual(1);
  const paginas = ruw.match(/\/Type \/Page /g).length;
  expect(paginas).toBeLessThanOrEqual(3); // twee weken met gewone gegevens: hoogstens drie pagina's
  expect(ruw).toContain('/Lang (nl-BE)');
  expect(ruw).toContain('/MediaBox [0 0 595.28 841.89]'); // altijd A4 staand
  expect(ruw).not.toContain('/MediaBox [0 0 841.89 595.28]');
  expect(standaard.buffer.length).toBeLessThan(400 * 1024);

  const tekst = pdfTekst(standaard.buffer);
  const regels = tekst.split('\n');
  // kop en voet op elke pagina
  expect(regels.filter((r) => r === `Verslag van ${naam}`)).toHaveLength(paginas);
  expect(regels.filter((r) => r === 'bloei')).toHaveLength(paginas);
  for (let i = 1; i <= paginas; i += 1) expect(regels).toContain(`Pagina ${i} van ${paginas}`);
  expect(regels.filter((r) => /^Gemaakt op [a-z]+ \d+ [a-z]+ \d{4}$/.test(r))).toHaveLength(paginas);
  // BESLISSING 461: de titel is het woord "Verslag", daaronder de periode in hoofdletters, voluit en met " - " (de pdf mag ze op twee regels zetten)
  const iTitel = regels.indexOf('Verslag');
  expect(iTitel, 'de titel "Verslag"').toBeGreaterThan(0);
  const volPeriode = `${titel(van)} - ${titel(nu)}`;
  expect([regels[iTitel + 1], `${regels[iTitel + 1]} ${regels[iTitel + 2]}`], 'de periode onder de titel').toContain(volPeriode);
  // BESLISSING 490: pagina 1 heeft in de kop alleen "Verslag van <naam>"; elke volgende pagina heeft er de korte periode in hoofdletters bij
  const eindPagina1 = regels.indexOf(`Pagina 1 van ${paginas}`);
  expect(regels.slice(0, eindPagina1).filter((r) => KORTE_PERIODE.test(r)), 'pagina 1: geen korte periode in de kop').toEqual([]);
  const korteKoppen = regels.slice(eindPagina1).filter((r) => KORTE_PERIODE.test(r));
  expect(korteKoppen, 'elke volgende pagina heeft de korte periode in de kop').toHaveLength(paginas - 1);
  for (const kort of korteKoppen) expect(kort.match(/\d+/g)).toEqual(volPeriode.match(/\d+/g));
  // de titel met de periode en de kerncijfers kloppen met wat gezaaid is: 14 dagen met 3 maaltijden en 1,2 tot 3 l water
  expect(regels).toEqual(expect.arrayContaining(['DAGEN INGEVULD', '14', 'van 14 dagen', 'MAALTIJDEN', '42', 'genoteerd', 'GEDRONKEN', 'gemiddeld per dag', 'DAGDOEL GEHAALD']));
  // de dagen in volgorde, elk met jaar
  let vorige = -1;
  for (let i = 0; i < DAGEN; i += 1) {
    const d = new Date(van.getFullYear(), van.getMonth(), van.getDate() + i);
    const plek = regels.indexOf(titel(d));
    expect(plek, titel(d)).toBeGreaterThan(vorige);
    vorige = plek;
  }
  expect(tekst).toContain('testmaaltijd ontbijt');
  expect(tekst).toMatch(/l van 2,5 l/);
  for (const stuk of ['Verzonnen notitie', 'Notitie', '70,9 kg', 'LAATSTE WEGING', 'Gewicht']) expect(tekst, stuk).not.toContain(stuk);
  for (const woord of ['upplement', 'Vitamine D']) expect(tekst, woord).not.toContain(woord);

  // Alle vier de onderdelen, en dat zonder verbinding: de pdf wordt op het toestel gemaakt
  await context.setOffline(true);
  await page.getByRole('checkbox', { name: 'Gewicht', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Notities', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeDisabled(); // even geduld: de pdf wordt opnieuw gemaakt
  const alles = await bewaarPdf(page);
  const volledig = pdfTekst(alles.buffer);
  const volRegels = volledig.split('\n');
  const volPaginas = alles.buffer.toString('latin1').match(/\/Type \/Page /g).length;
  expect(volPaginas).toBeLessThanOrEqual(4);
  for (let i = 1; i <= volPaginas; i += 1) expect(volRegels).toContain(`Pagina ${i} van ${volPaginas}`);
  expect(volRegels.filter((r) => r === `Verslag van ${naam}`)).toHaveLength(volPaginas);
  for (const stuk of ['Verzonnen notitie 0', 'Notitie', 'Gewicht', '70,9 kg', '71,3 kg', 'LAATSTE WEGING', 'VERSCHIL']) expect(volledig, stuk).toContain(stuk);
  expect(volRegels).toContain('-0,4 kg'); // 71,3 naar 70,9: het verschil met de vorige weging, zonder oordeel
  expect(volledig).not.toContain('%');
  for (const woord of ['upplement', 'Vitamine D']) expect(volledig, woord).not.toContain(woord);

  expect(extern).toEqual([]);
  expect(fouten).toEqual([]);
});

test('Delen: een periode zonder gegevens geeft geen pdf maar de melding "In deze periode staat nog niets." (de lege pdf-pagina zelf staat in de unit-tests)', async ({ page }) => {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.goto('./#/delen/2020-01-06/2020-01-12');
  await expect(page.getByRole('button', { name: 'Aangepast' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.delen')).toContainText('In deze periode staat nog niets.');
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeDisabled();
});

// BESLISSING 332: een verslag van één dag dat op één pagina past en die niet vult, is een blad zo hoog als zijn inhoud (breedte van een A4, de voet direct
// onder de tabel); een periode van twee weken blijft gewone A4-pagina's. Het vel op het scherm heeft dezelfde verhouding als dat blad.
test('Delen: de pdf van één dag is zo hoog als zijn inhoud en de verhouding komt overeen met het vel; twee weken blijft A4', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 }); // op een breed scherm is het vel zo breed als het blad; op een smal scherm loopt de verhouding uiteen
  await vulVeertienDagen(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  await expect(page.locator('.verslagvel__titel')).toBeVisible();
  // Geen vaste wachttijd: de pdf van deze keuze is klaar (Bewaren staat aan), het scherm is uitgebouwd en de maat van het vel ligt vast
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  await domRustig(page);
  const vel = await wachtTotStil(page, () => page.locator('.verslagvel').evaluate((e) => ({ b: e.getBoundingClientRect().width, h: e.scrollHeight })));
  const { buffer } = await bewaarPdf(page);
  const tekst = buffer.toString('latin1');
  const dozen = [...tekst.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(dozen).toHaveLength(1); // precies één pagina
  expect(dozen[0][0]).toBeCloseTo(595.28, 1);
  expect(dozen[0][1], 'korter dan een A4').toBeLessThan(842 * 0.85 + 1);
  expect(Number.isInteger(dozen[0][1]), 'hele punten').toBe(true);
  const verhoudingPdf = dozen[0][1] / dozen[0][0];
  const verhoudingVel = vel.h / vel.b;
  console.log('VERHOUDING pdf', verhoudingPdf.toFixed(3), 'vel', verhoudingVel.toFixed(3));
  expect(Math.abs(verhoudingPdf - verhoudingVel) / verhoudingPdf, 'vel en pdf-blad: dezelfde verhouding (binnen 25 %)').toBeLessThan(0.25);
  await page.getByRole('button', { name: 'Twee weken', exact: true }).click();
  await expect(page.locator('.verslagvel__periode')).toContainText(' - '); // BESLISSING 461: een bereik met " - " onder de titel "Verslag"
  // bewaarPdf wacht tot Bewaren aanstaat: elke keuze zet die knop meteen uit tot de pdf van díe keuze klaar is
  const lang = (await bewaarPdf(page)).buffer.toString('latin1');
  const langeDozen = [...lang.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => Number(m[2]));
  expect(langeDozen.length).toBeGreaterThan(1);
  for (const h of langeDozen) expect(h).toBeCloseTo(841.89, 1);
});
