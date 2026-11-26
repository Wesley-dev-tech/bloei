// BESLISSING 574: Afdrukken volgt altijd het voorbeeld en de bewaarde pdf. Wat naar de printer gaat is dezelfde tekening als de pdf van Bewaren:
// zelfde paginaformaat (en dus dezelfde richting), zelfde aantal pagina's, dezelfde tekst per pagina, en niets van de rest van de app.
// Bewijs in Chromium: de pdf van Bewaren wordt gelezen (MediaBox en tekst per pagina) en de afdruk wordt vastgelegd met page.pdf() in printmedia
// (window.print wordt vervangen door een stub, zodat het afdrukvel blijft staan); beide worden vergeleken. Alle gegevens zijn verzonnen.
// NIET bewezen hier: het afdrukvenster van iOS en Android en een echte printer (zie het rapport).
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { domRustig } from './wacht.js';

test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

const UIT = process.env.PW_AFDRUK_UIT || '';

const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Eenendertig dagen met drie maaltijden, twee soorten drinken, om de drie dagen een notitie en drie wegingen.
async function vulDagen(page, aantal) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    (n) =>
      new Promise((klaar, fout) => {
        const sl = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'dranken', 'dagen', 'wegingen'], 'readwrite');
          for (let i = 0; i < n; i += 1) {
            const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i);
            const datum = sl(d);
            [['ontbijt', '08:15', 'testmaaltijd ontbijt'], ['middagmaal', '12:30', 'testmaaltijd middag'], ['avondmaal', '18:45', 'testmaaltijd avond']].forEach(([soort, tijd, tekst]) =>
              tx.objectStore('maaltijden').put({ datum, soort, tijd, tekst, fotoId: null, voorbeeld: false, gewijzigdOp: 1 }),
            );
            tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 1000 - i, soort: 'water', ml: 500 + (i % 4) * 500, voorbeeld: false });
            tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 900 - i, soort: 'thee', ml: 200, voorbeeld: false });
            tx.objectStore('dagen').put({ datum, notitie: i % 3 === 0 ? `Verzonnen notitie ${i}` : '', doelGehaald: false, voorbeeld: false });
            if (i === 0 || i === 9 || i === 20) {
              const maandag = sl(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
              tx.objectStore('wegingen').put({ week: maandag, datum, kg: 70.9 + i / 10, voorbeeld: false, gewijzigdOp: 1 });
            }
          }
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    aantal,
  );
}

// De pdf van Bewaren: MediaBox per pagina en de tekstblokken per pagina (volgorde van tekenen).
function leesPdf(buffer) {
  const tekst = buffer.toString('latin1');
  const objecten = new Map();
  const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj/g;
  let m;
  while ((m = re.exec(tekst))) {
    const wb = m[2];
    const stream = /\/Length (\d+) >>\nstream\n/.exec(wb);
    if (stream) {
      const begin = m.index + `${m[1]} 0 obj\n`.length + stream.index + stream[0].length;
      objecten.set(Number(m[1]), { wb: wb.slice(0, stream.index), data: buffer.subarray(begin, begin + Number(stream[1])) });
      re.lastIndex = begin + Number(stream[1]);
    } else objecten.set(Number(m[1]), { wb, data: null });
  }
  const kaarten = {};
  for (const { wb } of objecten.values()) {
    const f = /\/BaseFont \/Bloei-(\w+) \/Encoding \/Identity-H .*?\/ToUnicode (\d+) 0 R/.exec(wb);
    if (!f) continue;
    const cmap = inflateSync(objecten.get(Number(f[2])).data).toString('latin1');
    const kaart = new Map();
    for (const p of cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]{4})>/g)) kaart.set(parseInt(p[1], 16), String.fromCharCode(parseInt(p[2], 16)));
    kaarten[f[1]] = kaart;
  }
  const paginas = [];
  for (const [, { wb }] of [...objecten.entries()].sort((a, b) => a[0] - b[0])) {
    const pagina = /\/Type \/Page \/Parent.*?\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\].*?\/Contents (\d+) 0 R/.exec(wb);
    if (!pagina) continue;
    const inhoud = inflateSync(objecten.get(Number(pagina[3])).data).toString('latin1');
    const teksten = [];
    for (const t of inhoud.matchAll(/\/(\w+) [\d.]+ Tf (?:[-\d.]+ Tc )?[-\d.]+ [-\d.]+ Td <([0-9a-f]*)> Tj/g)) {
      let s = '';
      for (let i = 0; i < t[2].length; i += 4) s += kaarten[t[1]].get(parseInt(t[2].slice(i, i + 4), 16)) ?? '?';
      teksten.push(s.replace(/[  ]/g, ' '));
    }
    paginas.push({ b: Number(pagina[1]), h: Number(pagina[2]), teksten });
  }
  return paginas;
}

// De afdruk van Chromium: aantal pagina's en MediaBox per pagina (Chromium schrijft die als gewone woordenboeken)
function leesAfdrukPdf(buffer) {
  const tekst = buffer.toString('latin1');
  const boxen = [...tekst.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => ({ b: Number(m[1]), h: Number(m[2]) }));
  const aantal = Math.max(0, ...[...tekst.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1])), ...[...tekst.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map((m) => Number(m[1])));
  return { boxen, aantal };
}

const GEVALLEN = [
  { naam: 'vandaag', knop: 'Vandaag' },
  { naam: 'deze-week', knop: 'Deze week' },
  { naam: 'een-maand', knop: 'Een maand' },
];

async function zetOnderdelen(page, { gewicht, notities }) {
  for (const [naam, aan] of [['Gewicht', gewicht], ['Notities', notities]]) {
    const vink = page.getByRole('checkbox', { name: naam, exact: true });
    if ((await vink.getAttribute('aria-checked')) !== String(aan)) await vink.click();
  }
}

for (const { naam, knop } of GEVALLEN) {
  for (const metMeer of [false, true]) {
    test(`Afdrukken volgt de bewaarde pdf: ${naam}, ${metMeer ? 'met Gewicht en Notities' : 'alleen Eten en Drinken'}`, async ({ page }, info) => {
      test.skip(info.project.use.browserName && info.project.use.browserName !== 'chromium', 'page.pdf bestaat alleen in Chromium');
      await vulDagen(page, 31);
      await page.goto('./#/delen');
      await expect(page.getByRole('button', { name: knop, exact: true })).toBeVisible();
      await page.evaluate(() => {
        window.__gedrukt = 0;
        window.print = () => {
          window.__gedrukt += 1; // geen afterprint: het afdrukvel blijft staan om vast te leggen
        };
      });
      await page.getByRole('button', { name: knop, exact: true }).click();
      await zetOnderdelen(page, { gewicht: metMeer, notities: metMeer });
      await domRustig(page);

      const bewaar = page.getByRole('button', { name: 'Bewaren', exact: true });
      await expect(bewaar).toBeEnabled();
      const download = page.waitForEvent('download');
      await bewaar.click();
      const pdf = readFileSync(await (await download).path());
      const bewaard = leesPdf(pdf);
      expect(bewaard.length).toBeGreaterThan(0);

      const druk = page.getByRole('button', { name: 'Afdrukken', exact: true });
      await expect(druk).toBeEnabled();
      await druk.click();
      await expect.poll(() => page.evaluate(() => window.__gedrukt)).toBe(1);

      // Het afdrukvel: één svg per pagina, de tekst per pagina uit het vel zelf
      const vel = await page.evaluate(() =>
        [...document.querySelectorAll('.afdruk .afdruk__blad')].map((s) => ({
          b: parseFloat(s.getAttribute('viewBox').split(' ')[2]),
          h: parseFloat(s.getAttribute('viewBox').split(' ')[3]),
          teksten: [...s.querySelectorAll('text')].map((t) => t.textContent),
        })),
      );
      expect(vel.length).toBe(bewaard.length);
      vel.forEach((p, i) => {
        expect(p.b).toBeCloseTo(bewaard[i].b, 1);
        expect(p.h).toBeCloseTo(bewaard[i].h, 1);
        expect(p.teksten).toEqual(bewaard[i].teksten);
      });
      // Richting: nooit liggend, net als de pdf
      for (const p of bewaard) expect(p.h).toBeGreaterThan(p.b * 0.5);
      if (bewaard.length > 1) for (const p of bewaard) expect(p.h).toBeGreaterThan(p.b);

      // De echte afdruk van Chromium in printmedia, met het paginaformaat uit de css (preferCSSPageSize)
      if (UIT) {
        mkdirSync(UIT, { recursive: true });
        await page.evaluate(() => {
          document.querySelector('.afdruk').style.display = 'block';
        });
        writeFileSync(join(UIT, `${naam}${metMeer ? '-meer' : ''}-blad1.png`), await page.locator('.afdruk__blad').first().screenshot({ type: 'png' }));
        await page.evaluate(() => {
          document.querySelector('.afdruk').style.display = '';
        });
      }
      await page.emulateMedia({ media: 'print' });
      const zichtbaar = await page.evaluate(() => [...document.body.children].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0).map((e) => e.className || e.tagName));
      expect(zichtbaar).toEqual(['afdruk']); // geen navigatie, geen knoppen, niets van de app
      const afdruk = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      const gelezen = leesAfdrukPdf(afdruk);
      expect(gelezen.aantal).toBe(bewaard.length);
      expect(gelezen.boxen.length).toBe(bewaard.length);
      gelezen.boxen.forEach((box, i) => {
        expect(box.b).toBeCloseTo(bewaard[i].b, 0);
        expect(box.h).toBeCloseTo(bewaard[i].h, 0);
      });

      if (UIT) {
        mkdirSync(UIT, { recursive: true });
        writeFileSync(join(UIT, `${naam}${metMeer ? '-meer' : ''}-pdf.pdf`), pdf);
        writeFileSync(join(UIT, `${naam}${metMeer ? '-meer' : ''}-afdruk.pdf`), afdruk);
      }
    });
  }
}

test('Afdrukken is pas beschikbaar als de pdf klaar is en toont geen melding zonder pdf', async ({ page }) => {
  await page.goto('./#/delen');
  await expect(page.getByRole('button', { name: 'Afdrukken', exact: true })).toBeVisible();
  // een leeg verslag (geen gegevens) heeft geen pdf en dus geen actieve Afdrukken-knop
  await expect(page.getByRole('button', { name: 'Afdrukken', exact: true })).toBeDisabled();
});
