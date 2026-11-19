// Gewicht: de drie blokken van BESLISSING 289 (Verloop in cijfers, Weg naar je streefgewicht, Weegkalender).
// Verzonnen gegevens: één weging per week, de laatste in de huidige week, de gewichten rond 70 kg.
import { test, expect } from '@playwright/test';
import { schermKlaar } from './wacht.js';

test.use({ hasTouch: false, isMobile: false, deviceScaleFactor: 1 });

const BREED = [
  [1690, 1230],
  [1720, 950],
];
const AANTALLEN = [0, 1, 2, 5, 20];
const STREEF = 66; // onder haar start van 70,0 (afvallen)

// Het gewicht van weging i (0 = de oudste): 70,0 · 71,7 · 71,8 · 70,3 · 68,5 · 68,1 ...
const kgVan = (i) => 70 + Math.round(Math.sin(i) * 20) / 10;

// Zaait wegingen op de weken (afstanden in weken tot de huidige week, 0 = deze week) in de opslag en geeft ze terug ({ week, datum, kg }).
// De opslag bestaat pas nadat de app één keer geopend is. Daarna herladen.
async function zaai(page, { afstanden = [], kgs = null, streef = null, weegdag = null, thema = null } = {}) {
  const lijst = await page.evaluate(
    ([weken, gewichten, streefKg, dag, themaKeuze]) =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const naarTekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction(['wegingen', 'instellingen'], 'readwrite');
          tx.objectStore('wegingen').clear();
          const gezaaid = [];
          weken.forEach((afstand, i) => {
            const d = new Date(nu);
            d.setDate(d.getDate() - 7 * afstand);
            const maandag = new Date(d);
            maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            const w = { week: naarTekst(maandag), datum: naarTekst(d), kg: gewichten[i], voorbeeld: false, gewijzigdOp: Date.now() };
            tx.objectStore('wegingen').put(w);
            gezaaid.push(w);
          });
          tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: streefKg });
          if (dag != null) tx.objectStore('instellingen').put({ sleutel: 'gewicht.weegdag', waarde: dag });
          if (themaKeuze) tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: themaKeuze });
          tx.oncomplete = () => {
            db.close();
            klaar({ gezaaid, vandaag: naarTekst(nu) });
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [afstanden, kgs ?? afstanden.map((_, i) => kgVan(i)), streef, weegdag, thema],
  );
  await page.reload();
  await page.waitForSelector('.gewicht .gewicht__weetjes');
  await page.waitForTimeout(2600); // het opkomen van de kaarten en het optellen van het getal
  return lijst;
}

// Opeenvolgende wekelijkse wegingen: n stuks, de laatste in de huidige week
const wekelijks = (n) => Array.from({ length: n }, (_, i) => n - 1 - i);

async function open(page, breed, hoog) {
  await page.setViewportSize({ width: breed, height: hoog });
  await page.goto('./#/gewicht');
  await page.waitForSelector('.gewicht .gewicht__weetjes');
  await page.waitForLoadState('load');
  await schermKlaar(page, '#/gewicht'); // de app is klaar met starten: het scherm Gewicht staat er uitgebouwd (geen vaste wachttijd)
}

// De opmaak zoals de app ze toont: komma, echt minteken, één decimaal
const komma = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const verschil = (x) => {
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '-' : ''}${komma(Math.abs(r))}`;
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Elke kaart in het raster: top, bodem, links, rechts en de grootste lege strook (de kop met zijn lijn telt als één blok)
const meetKaarten = (page) =>
  page.evaluate(() => {
    const kaarten = [...document.querySelectorAll('.gewicht__raster > .kaart')].filter((k) => k.offsetParent !== null);
    return kaarten.map((k) => {
      const r = k.getBoundingClientRect();
      const stijl = getComputedStyle(k);
      const binnenTop = r.top + parseFloat(stijl.paddingTop);
      const binnenBodem = r.bottom - parseFloat(stijl.paddingBottom);
      const blokken = [];
      for (const e of k.querySelectorAll('*')) {
        if (e.closest('.kaartkop') && !e.classList.contains('kaartkop')) continue;
        const b = e.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        const kop = e.classList.contains('kaartkop');
        if (!(kop || e.children.length === 0 || ['svg', 'textarea', 'input', 'button'].includes(e.tagName.toLowerCase()))) continue;
        const onder = kop ? b.bottom + parseFloat(getComputedStyle(e).marginBottom) : b.bottom;
        blokken.push([Math.max(b.top, binnenTop), Math.min(onder, binnenBodem)]);
      }
      blokken.sort((a, b) => a[0] - b[0]);
      let gat = 0;
      let tot = binnenTop;
      for (const [van, naar] of blokken) {
        if (naar <= van) continue;
        gat = Math.max(gat, van - tot);
        tot = Math.max(tot, naar);
      }
      gat = Math.max(gat, binnenBodem - tot);
      const naam = [...k.classList].find((c) => /^(gewichthoofd|gewicht__weegdag|gewichtstreef|gewichtgrafiek|gewicht__lijst|gewicht__cijferkaart|gewicht__kal|gewicht__weg|gewicht__weetjes)$/.test(c)) ?? k.className;
      const kop = k.querySelector(':scope > .kaartkop');
      const kr = kop?.getBoundingClientRect();
      return { naam, top: r.top, bodem: r.bottom, links: r.left, rechts: r.right, hoogte: r.height, gat, labelTop: k.querySelector('.kaartkop__label')?.getBoundingClientRect().top ?? null, lijnY: kr ? kr.bottom : null };
    });
  });

const perNaam = (kaarten) => Object.fromEntries(kaarten.map((k) => [k.naam, k]));

for (const [breed, hoog] of BREED) {
  for (const n of AANTALLEN) {
    for (const metStreef of [true, false]) {
      test(`Gewicht-blokken ${breed}x${hoog}, ${n} wegingen, ${metStreef ? 'met' : 'zonder'} streefgewicht`, async ({ page }) => {
        const fouten = [];
        page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
        await open(page, breed, hoog);
        const { gezaaid } = await zaai(page, { afstanden: wekelijks(n), streef: metStreef ? STREEF : null });
        const eerste = gezaaid[0];
        const laatste = gezaaid.at(-1);

        // ---- Verloop in cijfers
        if (n === 0) {
          await expect(page.locator('.gewicht__cijferkaart--leeg')).toContainText('Je cijfers verschijnen na je eerste weging.');
          await expect(page.locator('.gewicht__kc')).toHaveCount(0);
        } else {
          const kc = Object.fromEntries(
            await page.$$eval('.gewicht__kc', (lijst) => lijst.map((li) => [li.dataset.kc, { label: li.querySelector('.gewicht__kclabel').textContent.trim(), waarde: li.querySelector('.gewicht__kcwaarde').textContent.replace(/\s+/g, ' ').trim(), sub: li.querySelector('.gewicht__kcsub').textContent.trim() }])),
          );
          expect(Object.keys(kc)).toEqual(['vorige', 'eerste', 'laagste', 'hoogste', 'maand', 'aantal']);
          const kgs = gezaaid.map((w) => w.kg);
          if (n >= 2) {
            expect(kc.vorige.waarde).toBe(`${verschil(kgs.at(-1) - kgs.at(-2))} kg`);
            expect(kc.eerste.waarde).toBe(`${verschil(kgs.at(-1) - kgs[0])} kg`);
          } else {
            expect(kc.vorige.waarde).toBe('-');
            expect(kc.vorige.sub).toBe('na je tweede weging');
            expect(kc.eerste.waarde).toBe('-');
            expect(kc.eerste.sub).toBe('na je tweede weging');
          }
          expect(kc.laagste.waarde).toBe(`${komma(Math.min(...kgs))} kg`);
          expect(kc.hoogste.waarde).toBe(`${komma(Math.max(...kgs))} kg`);
          expect(kc.aantal.waarde).toBe(String(n));
          const maand = gezaaid.filter((w) => w.datum.slice(0, 7) === laatste.datum.slice(0, 7));
          expect(kc.maand.waarde).toBe(`${komma(maand.reduce((s, w) => s + w.kg, 0) / maand.length)} kg`);
          const maandNaam = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][Number(laatste.datum.slice(5, 7)) - 1];
          expect(kc.maand.sub).toBe(maand.length === 1 ? `${maandNaam} · 1 weging` : `${maandNaam} · ${maand.length} wegingen`);
          expect(kc.aantal.sub).toMatch(/^sinds /);
          expect(kc.laagste.sub.length).toBeGreaterThan(5);
          expect(eerste.datum.length).toBe(10);

          // Even brede kolommen op dezelfde lijnen (op breed: één rij van zes) en label, cijfer en onderregel op dezelfde y
          const raster = await page.$$eval('.gewicht__kc', (lijst) =>
            lijst.map((li) => {
              const r = li.getBoundingClientRect();
              const y = (s) => li.querySelector(s).getBoundingClientRect().top;
              return { breedte: r.width, top: r.top, bodem: r.bottom, links: r.left, label: y('.gewicht__kclabel'), waarde: y('.gewicht__kcwaarde'), sub: y('.gewicht__kcsub'), rand: getComputedStyle(li).borderLeftWidth };
            }),
          );
          expect(raster).toHaveLength(6);
          for (const k of raster) {
            expect(Math.abs(k.breedte - raster[0].breedte), 'even brede kolommen').toBeLessThanOrEqual(1);
            expect(Math.abs(k.top - raster[0].top), 'zelfde bovenlijn').toBeLessThanOrEqual(1);
            expect(Math.abs(k.bodem - raster[0].bodem), 'zelfde onderlijn').toBeLessThanOrEqual(1);
            expect(Math.abs(k.label - raster[0].label)).toBeLessThanOrEqual(1);
            expect(Math.abs(k.waarde - raster[0].waarde)).toBeLessThanOrEqual(1);
            expect(Math.abs(k.sub - raster[0].sub)).toBeLessThanOrEqual(1);
          }
          expect(raster[0].rand).toBe('0px');
          for (const k of raster.slice(1)) expect(k.rand).toBe('1px');

          // Neutraal: alle cijfers in dezelfde tekstkleur, geen groen of rood
          const kleuren = await page.$$eval('.gewicht__kcwaarde', (lijst) => [...new Set(lijst.map((e) => getComputedStyle(e).color))]);
          expect(kleuren).toHaveLength(1);
          await expect(page.locator('.gewicht__cijferkaart')).not.toContainText(/afgevallen|bijgekomen|goed|slecht|↑|↓/);
        }

        // ---- Weg naar je streefgewicht: alleen met een streefgewicht én een eerste weging
        if (metStreef && n >= 1) {
          await expect(page.locator('.gewicht__weg')).toHaveCount(1);
          const weg = await page.evaluate(() => {
            const k = document.querySelector('.gewicht__weg');
            const pad = k.querySelector('.gewicht__pad').getBoundingClientRect();
            const merk = k.querySelector('.gewicht__padmerk').getBoundingClientRect();
            const vul = k.querySelector('.gewicht__padvul').getBoundingClientRect();
            const tekst = (s) => k.querySelector(s).textContent.replace(/\s+/g, ' ').trim();
            const w = [...k.querySelectorAll('.gewicht__waarde')].map((e) => e.getBoundingClientRect());
            return { pad: { links: pad.left, breedte: pad.width }, merkLinks: merk.left - pad.left, merkBreedte: merk.width, vulRechts: vul.right - pad.left, start: tekst('.gewicht__waarde--start'), nu: tekst('.gewicht__waarde--nu'), streef: tekst('.gewicht__waarde--streef'), zin: tekst('.gewicht__wegzin'), waarden: w.map((r) => ({ top: r.top, links: r.left, rechts: r.right })) };
          });
          const fractie = Math.min(1, Math.max(0, (laatste.kg - eerste.kg) / (STREEF - eerste.kg)));
          expect(Math.abs(weg.merkLinks - (weg.pad.breedte - weg.merkBreedte) * fractie), 'de markering staat op de juiste plaats').toBeLessThanOrEqual(1.5);
          expect(Math.abs(weg.vulRechts - (weg.merkLinks + weg.merkBreedte / 2)), 'de vulling loopt tot de markering').toBeLessThanOrEqual(1.5);
          expect(weg.start).toContain(`${komma(eerste.kg)} kg`);
          expect(weg.nu).toContain(`${komma(laatste.kg)} kg`);
          expect(weg.streef).toContain(`${komma(STREEF)} kg`);
          const rest = laatste.kg - STREEF;
          expect(norm(weg.zin)).toBe(rest <= 0 ? 'Je bent op je streefgewicht.' : `Nog ${komma(rest)} kg tot je streefgewicht.`);
          // Start, Nu en Streef op één lijn: dezelfde bovenkant, links, midden en rechts
          for (const w of weg.waarden) expect(Math.abs(w.top - weg.waarden[0].top)).toBeLessThanOrEqual(1);
          expect(weg.waarden[0].links).toBeLessThan(weg.waarden[1].links);
          expect(weg.waarden[1].links).toBeLessThan(weg.waarden[2].links);
        } else {
          await expect(page.locator('.gewicht__weg'), 'zonder streefgewicht of weging geen streefkaart').toHaveCount(0);
        }

        // ---- Weegkalender
        if (n === 0) {
          await expect(page.locator('.gewicht__kal')).toContainText('Je weegkalender verschijnt na je eerste weging.');
          await expect(page.locator('.gewicht__week')).toHaveCount(0);
        } else {
          const weken = await page.$$eval('.gewicht__week', (lijst) => lijst.map((li) => ({ gevuld: li.classList.contains('is-gevuld'), nu: li.classList.contains('is-nu'), voor: li.classList.contains('is-voor'), datum: li.querySelector('.gewicht__weekdatum').textContent, maand: li.querySelector('.gewicht__weekmaand').textContent })));
          expect(weken).toHaveLength(12);
          const gevuld = Math.min(n, 12);
          expect(weken.filter((w) => w.gevuld)).toHaveLength(gevuld);
          expect(weken.slice(12 - gevuld).every((w) => w.gevuld), 'de laatste weken zijn gevuld').toBe(true);
          expect(weken.slice(0, 12 - gevuld).every((w) => !w.gevuld && w.voor), 'weken vóór de eerste weging zijn heel licht').toBe(true);
          expect(weken.filter((w) => w.nu)).toHaveLength(1);
          expect(weken.at(-1).nu).toBe(true);
          for (const w of weken) expect(w.datum).toMatch(/^\d\d\/\d\d$/);
          expect(weken[0].maand).not.toBe('');
          const zin = norm(await page.locator('.gewicht__kalregel').first().innerText());
          expect(zin).toBe(gevuld === 1 ? 'Gewogen in de laatste week.' : `Gewogen in ${gevuld} van de laatste ${gevuld} weken.`);
          await expect(page.locator('.gewicht__kalregel--volgende')).toContainText('Volgende weegdag:');
          // Statisch: niet aanklikbaar
          expect(await page.locator('.gewicht__week').evaluateAll((l) => l.every((e) => e.tagName === 'LI' && !e.onclick && e.querySelector('a, button') == null && getComputedStyle(e).cursor === 'default'))).toBe(true);
          // twaalf bolletjes op één rij en gelijke afstanden op breed
          const bollen = await page.$$eval('.gewicht__bol', (l) => l.map((e) => e.getBoundingClientRect()));
          for (const b of bollen) expect(Math.abs(b.top - bollen[0].top)).toBeLessThanOrEqual(1);
          const stappen = bollen.slice(1).map((b, i) => b.left - bollen[i].left);
          for (const s of stappen) expect(Math.abs(s - stappen[0])).toBeLessThanOrEqual(1);
        }

        // ---- Indeling: rijen eindigen gelijk, titels en lijnen van buren op dezelfde y, geen leeg vlak boven 32 px
        const kaarten = await meetKaarten(page);
        const per = perNaam(kaarten);
        for (const k of kaarten) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
        expect(per.gewicht__cijferkaart.top).toBeGreaterThanOrEqual(per.gewichtgrafiek.bodem);
        expect(per.gewicht__kal.top).toBeGreaterThanOrEqual(per.gewicht__cijferkaart.bodem);
        if (per.gewicht__weg) {
          expect(Math.abs(per.gewicht__kal.bodem - per.gewicht__weg.bodem), 'Weegkalender en Weg naar je streefgewicht eindigen gelijk').toBeLessThanOrEqual(1);
          expect(Math.abs(per.gewicht__kal.top - per.gewicht__weg.top)).toBeLessThanOrEqual(1);
          expect(Math.abs(per.gewicht__kal.labelTop - per.gewicht__weg.labelTop), 'titels op dezelfde y').toBeLessThanOrEqual(1);
          expect(Math.abs(per.gewicht__kal.lijnY - per.gewicht__weg.lijnY), 'lijnen op dezelfde y').toBeLessThanOrEqual(1);
          expect(per.gewicht__weetjes.top).toBeGreaterThanOrEqual(per.gewicht__kal.bodem);
        } else {
          // zonder streefkaart loopt de Weegkalender over de volle breedte
          expect(Math.abs(per.gewicht__kal.links - per.gewicht__cijferkaart.links)).toBeLessThanOrEqual(1);
          expect(Math.abs(per.gewicht__kal.rechts - per.gewicht__cijferkaart.rechts)).toBeLessThanOrEqual(1);
          expect(per.gewicht__weetjes.top).toBeGreaterThanOrEqual(per.gewicht__kal.bodem);
        }
        expect(Math.abs(per.gewichthoofd.bodem - per.gewicht__weegdag.bodem)).toBeLessThanOrEqual(2);
        expect(Math.abs(per.gewichtgrafiek.bodem - per.gewicht__lijst.bodem), 'Verloop en Je wegingen eindigen gelijk').toBeLessThanOrEqual(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(fouten).toEqual([]);
      });
    }
  }
}

// De balk in beide richtingen, en de randgevallen: bijkomen, voorbij het doel, verder van het doel dan bij de start
const RICHTINGEN = [
  { naam: 'afvallen, halverwege', kgs: [80, 78, 75], streef: 70, fractie: 0.5, zin: 'Nog 5,0 kg tot je streefgewicht.' },
  { naam: 'bijkomen, halverwege', kgs: [50, 52, 53], streef: 56, fractie: 0.5, zin: 'Nog 3,0 kg tot je streefgewicht.' },
  { naam: 'bijkomen, bijna er', kgs: [50, 54, 55.2], streef: 56, fractie: 5.2 / 6, zin: 'Nog 0,8 kg tot je streefgewicht.' },
  { naam: 'afvallen, op het streefgewicht', kgs: [80, 75, 70], streef: 70, fractie: 1, zin: 'Je bent op je streefgewicht.' },
  { naam: 'afvallen, voorbij het streefgewicht', kgs: [80, 75, 68.4], streef: 70, fractie: 1, zin: 'Je bent op je streefgewicht.' },
  { naam: 'bijkomen, voorbij het streefgewicht', kgs: [50, 55, 57], streef: 56, fractie: 1, zin: 'Je bent op je streefgewicht.' },
  { naam: 'verder van het doel dan bij de start (afvallen)', kgs: [80, 81, 82.5], streef: 70, fractie: 0, zin: 'Nog 12,5 kg tot je streefgewicht.' },
  { naam: 'verder van het doel dan bij de start (bijkomen)', kgs: [50, 49, 48.5], streef: 56, fractie: 0, zin: 'Nog 7,5 kg tot je streefgewicht.' },
  { naam: 'één weging: nog op de start', kgs: [72.4], streef: 65, fractie: 0, zin: 'Nog 7,4 kg tot je streefgewicht.' },
];

for (const r of RICHTINGEN) {
  test(`Weg naar je streefgewicht: ${r.naam}`, async ({ page }) => {
    await open(page, 1690, 1230);
    await zaai(page, { afstanden: wekelijks(r.kgs.length), kgs: r.kgs, streef: r.streef });
    const m = await page.evaluate(() => {
      const k = document.querySelector('.gewicht__weg');
      if (!k) return { fout: 'geen streefkaart' };
      const pad = k.querySelector('.gewicht__pad').getBoundingClientRect();
      const merk = k.querySelector('.gewicht__padmerk').getBoundingClientRect();
      const lees = (s) => [...k.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
      return { merkLinks: merk.left - pad.left, ruimte: pad.width - merk.width, zin: lees('.gewicht__wegzin')[0], start: lees('.gewicht__waarde--start p').join('|'), nu: lees('.gewicht__waarde--nu p').join('|'), streef: lees('.gewicht__waarde--streef p').join('|'), tekst: k.textContent };
    });
    expect(Math.abs(m.merkLinks - m.ruimte * r.fractie)).toBeLessThanOrEqual(1.5);
    expect(m.zin).toBe(r.zin);
    expect(m.start).toContain(`${komma(r.kgs[0])} kg`);
    expect(m.nu).toContain(`${komma(r.kgs.at(-1))} kg`);
    expect(m.streef).toContain(`${komma(r.streef)} kg`);
    expect(m.tekst).not.toMatch(/%|\bgoed\b|\bslecht\b/);
  });
}

test('Weegkalender: gaten, "5 van de laatste 8 weken", weken vóór de eerste weging tellen niet', async ({ page }) => {
  await open(page, 1690, 1230);
  // Eerste weging 7 weken terug, daarna 5, 4, 2 en 0 weken terug: 5 wegingen in 8 weken
  await zaai(page, { afstanden: [7, 5, 4, 2, 0] });
  const weken = await page.$$eval('.gewicht__week', (l) => l.map((li) => ({ gevuld: li.classList.contains('is-gevuld'), voor: li.classList.contains('is-voor'), nu: li.classList.contains('is-nu') })));
  expect(weken.map((w) => (w.gevuld ? 1 : 0)).join('')).toBe('000010110101');
  expect(weken.slice(0, 4).every((w) => w.voor && !w.gevuld)).toBe(true);
  expect(weken.slice(4).every((w) => !w.voor)).toBe(true);
  expect(weken.at(-1)).toMatchObject({ gevuld: true, nu: true });
  expect(norm(await page.locator('.gewicht__kalregel').first().innerText())).toBe('Gewogen in 5 van de laatste 8 weken.');
});

test('Weegkalender: de lopende week zonder weging is nog niet gemist, en de datum volgt de weegdag', async ({ page }) => {
  await open(page, 1690, 1230);
  // Wegingen 3, 2 en 1 week terug, nog niet deze week; weegdag donderdag
  const { gezaaid } = await zaai(page, { afstanden: [3, 2, 1], weegdag: 4 });
  const weken = await page.$$eval('.gewicht__week', (l) => l.map((li) => ({ gevuld: li.classList.contains('is-gevuld'), nu: li.classList.contains('is-nu'), datum: li.querySelector('.gewicht__weekdatum').textContent })));
  expect(weken.at(-1)).toMatchObject({ gevuld: false, nu: true });
  expect(norm(await page.locator('.gewicht__kalregel').first().innerText())).toBe('Gewogen in 3 van de laatste 3 weken.');
  // Elke datum is een donderdag: de weken liggen 7 dagen uit elkaar
  const dagen = await page.evaluate((lijst) => lijst.map((d) => { const [dd, mm] = d.split('/').map(Number); const nu = new Date(); let j = nu.getFullYear(); if (mm - 1 > nu.getMonth() + 1) j -= 1; return new Date(j, mm - 1, dd).getDay(); }), weken.map((w) => w.datum));
  expect(new Set(dagen)).toEqual(new Set([4]));
  expect(gezaaid).toHaveLength(3);
});

test('Gewicht-blokken in Poeder en Nacht: dezelfde opbouw, bolletjes in de kleur van Gewicht', async ({ page }) => {
  for (const thema of ['poeder', 'nacht']) {
    await open(page, 1690, 1230);
    await zaai(page, { afstanden: [7, 5, 4, 2, 0], streef: 66, thema });
    await expect(page.locator('.gewicht__kc')).toHaveCount(6);
    const kleur = await page.evaluate(() => {
      const gevuld = document.querySelector('.gewicht__week.is-gevuld .gewicht__bol');
      const gewicht = getComputedStyle(document.documentElement).getPropertyValue('--c-weight').trim();
      const probe = document.createElement('i');
      probe.style.color = gewicht;
      document.body.append(probe);
      const verwacht = getComputedStyle(probe).color;
      probe.remove();
      return { bol: getComputedStyle(gevuld).backgroundColor, verwacht };
    });
    expect(kleur.bol).toBe(kleur.verwacht);
  }
});

// Telefoon: één kolom, de kerncijfers in twee kolommen, de weegkalender in twee rijen van zes, niets scrolt zijwaarts of breekt af
for (const breed of [390, 360]) {
  for (const n of [0, 1, 5, 20]) {
    for (const metStreef of [true, false]) {
      test(`Gewicht-blokken ${breed} px, ${n} wegingen, ${metStreef ? 'met' : 'zonder'} streefgewicht: één kolom, geen zijwaartse scroll`, async ({ page }) => {
        await open(page, breed, 844);
        await zaai(page, { afstanden: wekelijks(n), streef: metStreef ? STREEF : null });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const kaarten = await meetKaarten(page);
        const eerste = kaarten[0];
        for (const k of kaarten) {
          expect(Math.abs(k.links - eerste.links), `${k.naam} staat in één kolom`).toBeLessThanOrEqual(1);
          expect(k.rechts).toBeLessThanOrEqual(breed);
          expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
        }
        if (n > 0) {
          const kc = await page.$$eval('.gewicht__kc', (l) =>
            l.map((li) => {
              const r = li.getBoundingClientRect();
              const afgebroken = ['.gewicht__kclabel', '.gewicht__kcwaarde', '.gewicht__kcsub'].some((s) => {
                const e = li.querySelector(s);
                const b = document.createRange();
                b.selectNodeContents(e);
                const stukken = [...b.getClientRects()].filter((q) => q.width > 0);
                const regels = new Set(stukken.map((q) => Math.round(q.top / 4)));
                // het cijfer en zijn kleine eenheid staan op één basislijn maar hebben een andere bovenkant: daar telt alleen of het afgekapt wordt
                return (s !== '.gewicht__kcwaarde' && regels.size > 1) || e.scrollWidth > e.clientWidth;
              });
              return { links: r.left, top: r.top, breedte: r.width, afgebroken };
            }),
          );
          expect(new Set(kc.map((k) => Math.round(k.links))).size, 'twee kolommen').toBe(2);
          expect(new Set(kc.map((k) => Math.round(k.top))).size, 'drie rijen').toBe(3);
          for (const k of kc) {
            expect(Math.abs(k.breedte - kc[0].breedte)).toBeLessThanOrEqual(1);
            expect(k.afgebroken, 'geen afgebroken of afgekapte tekst in het cijferraster').toBe(false);
          }
          const weken = await page.$$eval('.gewicht__week', (l) => l.map((li) => ({ top: li.getBoundingClientRect().top, links: li.getBoundingClientRect().left, rechts: li.getBoundingClientRect().right })));
          expect(weken).toHaveLength(12);
          expect(new Set(weken.map((w) => Math.round(w.top))).size, 'twee rijen van zes').toBe(2);
          expect(weken.slice(0, 6).every((w) => Math.abs(w.top - weken[0].top) <= 1)).toBe(true);
          const romp = await page.$eval('.gewicht__weken', (e) => ({ scroll: e.scrollWidth, breedte: e.clientWidth }));
          expect(romp.scroll).toBeLessThanOrEqual(romp.breedte + 1);
          const maandAfgebroken = await page.$$eval('.gewicht__weekmaand, .gewicht__weekdatum', (l) => l.some((e) => { const b = document.createRange(); b.selectNodeContents(e); return b.getClientRects().length > 1; }));
          expect(maandAfgebroken).toBe(false);
          if (metStreef) {
            const waarden = await page.$$eval('.gewicht__waarde', (l) => l.map((e) => ({ top: e.getBoundingClientRect().top, afgekapt: [...e.querySelectorAll('p')].some((p) => p.scrollWidth > p.clientWidth + 1) })));
            for (const w of waarden) {
              expect(Math.abs(w.top - waarden[0].top)).toBeLessThanOrEqual(1);
              expect(w.afgekapt).toBe(false);
            }
          }
        }
        const labels = await page.$$eval('.gewicht .kaartkop__label, .gewicht .gewicht__kclabel', (l) => l.map((e) => { const b = document.createRange(); b.selectNodeContents(e); return b.getClientRects().length; }));
        for (const regels of labels) expect(regels, 'een label op één regel').toBe(1);
      });
    }
  }
}
