// BESLISSING 735: elk scherm en elke handeling binnen 1,5 seconde. Vandaag leest bij het tekenen de tabellen voor reeks, week, kalender,
// "welkom terug" en badges een keer (leesMomentopname in src/data/statistiek.js, elke tabel een eigen korte transactie) en rekent daarna in
// het geheugen, in plaats van dezelfde tabellen vele keren apart te lezen. Met een profiel van 31 dagen (maaltijden, dranken, wegingen,
// supplementen) deed een gewone koude start van Vandaag eerst 108 IndexedDB-transacties, nu 53 (de eerste start na het zaaien, met badges
// nakijken en een tweede tekening: eerst 184, nu 88). De grens laat een kleine marge.
// Geen lange transactie: een transactie die openblijft over een wachttijd die geen databasevraag is, sluit vanzelf (zie b-vandaag "Kalender op Vandaag").
import { test, expect } from '@playwright/test';

const GRENS = 58;

async function zaai(page) {
  await page.goto('/');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(async () => {
    const pad = (n) => String(n).padStart(2, '0');
    const sl = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const db = await new Promise((ok, no) => {
      const q = indexedDB.open('bloei-dagboek');
      q.onsuccess = () => ok(q.result);
      q.onerror = () => no(q.error);
    });
    const tx = db.transaction(['instellingen', 'maaltijden', 'dranken', 'wegingen', 'supplementen', 'momentinnames', 'dagen'], 'readwrite');
    const put = (s, v) => tx.objectStore(s).put(v);
    put('instellingen', { sleutel: 'start.klaar', waarde: true });
    put('instellingen', { sleutel: 'profiel.naam', waarde: 'Testnaam' });
    const nu = new Date();
    const soorten = [
      ['ontbijt', '08:00'],
      ['middagmaal', '12:30'],
      ['avondmaal', '18:30'],
      ['tussendoortje', '15:30'],
    ];
    for (let i = 0; i < 31; i++) {
      const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i);
      const dat = sl(d);
      for (const [soort, tijd] of soorten) put('maaltijden', { datum: dat, soort, tijd, tekst: `Voorbeeldmaaltijd ${soort} dag ${i}`, fotoId: null, gevoel: (i % 5) + 1, voorbeeld: false, gewijzigdOp: Date.now() });
      for (let k = 0; k < 6; k++) put('dranken', { datum: dat, tijdstip: d.getTime() + k * 3600000 + 28800000, soort: k % 3 === 0 ? 'thee' : 'water', ml: 250, voorbeeld: false });
      put('dagen', { datum: dat, notitie: `Voorbeeldnotitie ${i}`, stemming: (i % 5) + 1, energie: ((i + 2) % 5) + 1, doelGehaald: i % 2 === 0, voorbeeld: false, gewijzigdOp: Date.now() });
      for (const id of [1, 2, 3]) if (i > 0 || id < 3) put('momentinnames', { datum: dat, supplementId: id, moment: 'ochtend', tijdstip: Date.now(), voorbeeld: false });
    }
    for (let w = 0; w < 6; w++) {
      const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 7 * (w + 1));
      const dag = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const ma = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dag);
      put('wegingen', { week: sl(ma), datum: sl(ma), kg: 70 - w * 0.4, voorbeeld: false, gewijzigdOp: Date.now() });
    }
    ['Voorbeeldsupplement', 'Voorbeeldmineraal', 'Voorbeeldvitamine'].forEach((naam, k) =>
      put('supplementen', { id: k + 1, naam, dosis: '1 capsule', hoeveelheid: '1 capsule', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: k, actief: true, voorbeeld: false, aangemaaktOp: Date.now(), teltVanaf: sl(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 40)) }),
    );
    await new Promise((ok, no) => {
      tx.oncomplete = ok;
      tx.onerror = () => no(tx.error);
    });
    db.close();
  });
}

test('de koude start van Vandaag met 31 dagen gegevens doet hoogstens 58 IndexedDB-transacties', async ({ page }) => {
  await zaai(page);
  // Eerst een gewone start op de gezaaide gegevens: de badges worden nagekeken en bewaard (en 'teller.hoogste'), wat een tweede tekening geeft.
  // Gemeten wordt de start daarna, zoals bij de gebruiker elke dag: niets nieuws te bewaren, een tekening.
  await page.reload();
  await expect(page.locator('#scherm .drinkkaart')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.addInitScript(() => {
    window.__transacties = 0;
    const oud = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...a) {
      window.__transacties += 1;
      return oud.apply(this, a);
    };
  });
  await page.reload();
  await expect(page.locator('#scherm .drinkkaart')).toBeVisible();
  await expect(page.locator('#scherm')).toContainText('Voorbeeldmaaltijd');
  await page.waitForTimeout(1500); // ook wat na het tekenen nog leest (badges, een tweede tekening)
  const aantal = await page.evaluate(() => window.__transacties);
  expect(aantal).toBeGreaterThan(0);
  expect(aantal).toBeLessThanOrEqual(GRENS);
});
