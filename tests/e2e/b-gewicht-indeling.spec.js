// Gewicht, de indeling van het hele tabblad en van "Goed om te weten" (opmerkingen van de eigenaar).
// Verzonnen gegevens; de hulp vul() zet het aantal wegingen (één per week, de laatste in de huidige week).
import { test, expect } from '@playwright/test';
import { vul, meetKaarten } from './leeg-vlak.js';
import { verwachtGelijkeWeetjes } from './weetjes-rij.js';
import { schermKlaar } from './wacht.js';

// De hover-regels gelden alleen met een muis: dit bestand draait dus als bureaublad.
test.use({ hasTouch: false, isMobile: false, deviceScaleFactor: 1 });

const BREED = [
  [1690, 1230],
  [1720, 950],
];
const AANTALLEN = [0, 1, 2, 5, 20];

// De grootste lege strook in elke kaart, zoals de hulp meetKaarten, maar de kop met zijn lijn (BESLISSING 273) telt als één blok
// tot en met zijn onderste marge: de ruimte tussen de lijn en de inhoud is bedoeld en geen leeg vlak.
const meetGaten = (page) =>
  page.evaluate(() => {
    const kaarten = [...document.querySelectorAll('.gewicht__raster .kaart')].filter((k) => k.offsetParent !== null);
    return Object.fromEntries(
      kaarten.map((k) => {
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
          const toont = kop || e.children.length === 0 || ['svg', 'textarea', 'input', 'button'].includes(e.tagName.toLowerCase());
          if (!toont) continue;
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
        const naam = [...k.classList].find((c) => /^(gewichthoofd|gewicht__weegdag|gewichtstreef|gewichtgrafiek|gewicht__lijst|gewicht__weetjes)/.test(c)) ?? k.className;
        return [naam, gat];
      }),
    );
  });

async function open(page, wegingen, breed, hoog) {
  await page.setViewportSize({ width: breed, height: hoog });
  await page.goto('./#/gewicht');
  await page.waitForSelector('.gewicht .gewicht__weetjes');
  await page.waitForLoadState('load');
  await schermKlaar(page, '#/gewicht'); // de app is klaar met starten: het scherm Gewicht staat er uitgebouwd (geen vaste wachttijd)
  await vul(page, { wegingen });
  await page.waitForSelector('.gewicht .gewicht__weetjes');
  await page.waitForTimeout(2600); // het opkomen van de kaarten en het optellen van het getal
}

for (const [breed, hoog] of BREED) {
  for (const n of AANTALLEN) {
    test(`Gewicht ${breed}x${hoog} met ${n} wegingen: gelijke weetjes, de bovenkaarten op vier lijnen en rijen die gelijk eindigen`, async ({ page }) => {
      await open(page, n, breed, hoog);
      await expect(page.locator('.gewicht__rijen .rij')).toHaveCount(n);

      // Vier weetjes, hun teksten op dezelfde hoogte en elk op één regel (op 1690 px)
      const weetjes = await page.evaluate(() =>
        [...document.querySelectorAll('.gewicht__weetjesrij .weetje')].map((w) => {
          const r = w.getBoundingClientRect();
          const tekst = w.querySelector('.weetje__tekst');
          const bereik = document.createRange();
          bereik.selectNodeContents(tekst);
          const regels = bereik.getClientRects();
          const tegel = w.querySelector('.tegel').getBoundingClientRect();
          return { breedte: r.width, tekstTop: regels[0].top, regels: regels.length, afgekapt: tekst.scrollWidth > tekst.clientWidth + 1 || [...regels].some((q) => q.right > r.right + 1 || q.left < r.left - 1), tegelTop: tegel.top, tegelMidden: tegel.top + tegel.height / 2, tekstMidden: (regels[0].top + regels[0].bottom) / 2 };
        }),
      );
      expect(weetjes.length).toBe(4);
      // BESLISSING 433: op één rij met gelijke zichtbare tussenruimte, eerste en laatste op de binnenrand; alle teksten op één regel
      await verwachtGelijkeWeetjes(page, '.gewicht__weetjes', 'Gewicht');
      for (const w of weetjes) {
        expect(w.regels, 'elke tekst op één regel').toBe(1);
        expect(Math.abs(w.tekstTop - weetjes[0].tekstTop)).toBeLessThanOrEqual(1);
        expect(Math.abs(w.tegelTop - weetjes[0].tegelTop)).toBeLessThanOrEqual(1);
        expect(w.afgekapt, 'geen tekst loopt buiten haar kolom of wordt afgekapt').toBe(false);
        expect(Math.abs(w.tegelMidden - w.tekstMidden), 'de tekst staat naast de tegel').toBeLessThanOrEqual(2);
      }

      // "Toon het me" is de vierde kolom, met een icoontegel ervoor; rechts in de kop staat niets; elke tegel op de linkerrand van zijn kolom
      const vierde = await page.evaluate(() => {
        const kaart = document.querySelector('.gewicht__weetjes');
        const stijl = getComputedStyle(kaart);
        const binnenLinks = kaart.getBoundingClientRect().left + parseFloat(stijl.paddingLeft);
        const kolommen = [...kaart.querySelectorAll('.gewicht__weetjesrij > .weetje')].map((w) => ({ links: w.getBoundingClientRect().left, tegel: w.querySelector('.tegel').getBoundingClientRect().left }));
        const knop = kaart.querySelector('.gewicht__weetjesrij > button.weetje');
        const rij = kaart.querySelector('.gewicht__weetjesrij').getBoundingClientRect();
        const knopTekstRechts = (() => { const b = document.createRange(); b.selectNodeContents(knop.querySelector('.weetje__tekst')); return b.getBoundingClientRect().right; })();
        return { binnenLinks, kolommen, binnenRechts: kaart.getBoundingClientRect().right - parseFloat(stijl.paddingRight), knopTekstRechts, knopIsVierde: knop === kaart.querySelector('.gewicht__weetjesrij').lastElementChild, knopHoogte: knop.getBoundingClientRect().height, knopTekst: knop.textContent, kopEind: kaart.querySelectorAll('.kaartkop__eind').length, onder: kaart.getBoundingClientRect().bottom - parseFloat(stijl.paddingBottom) - rij.bottom };
      });
      expect(vierde.knopIsVierde).toBe(true);
      expect(vierde.knopTekst).toContain('Toon het me');
      expect(vierde.knopHoogte).toBeGreaterThanOrEqual(44);
      expect(vierde.kopEind).toBe(0);
      expect(Math.abs(vierde.knopTekstRechts - vierde.binnenRechts), 'de link eindigt op de rechter binnenrand').toBeLessThanOrEqual(1);
      expect(Math.abs(vierde.kolommen[0].tegel - vierde.binnenLinks)).toBeLessThanOrEqual(1);
      for (const k of vierde.kolommen) expect(Math.abs(k.tegel - k.links)).toBeLessThanOrEqual(1);
      expect(vierde.onder).toBeLessThanOrEqual(8);

      // De drie bovenkaarten: label, kern, regel en knop op dezelfde vier lijnen
      const lijnen = await page.evaluate(() =>
        ['.gewichthoofd', '.gewicht__weegdag', '.gewichtstreef'].map((sel) => {
          const k = document.querySelector(sel);
          const top = (s) => k.querySelector(s).getBoundingClientRect().top;
          const bodem = (s) => k.querySelector(s).getBoundingClientRect().bottom;
          return { label: top('.kaartkop__label'), kern: bodem('.gewicht__kern'), regel: top('.gewicht__regel'), knop: top('.gewicht__actie .knop'), knopHoogte: k.querySelector('.gewicht__actie .knop').getBoundingClientRect().height };
        }),
      );
      for (const l of lijnen) {
        for (const as of ['label', 'kern', 'regel', 'knop', 'knopHoogte']) expect(Math.abs(l[as] - lijnen[0][as]), `lijn ${as}`).toBeLessThanOrEqual(1);
      }
      await expect(page.locator('.gewichthoofd .gewicht__actie .knop')).toHaveClass(/knop--primair/);
      await expect(page.locator('.gewicht__weegdag .gewicht__actie .knop')).toHaveClass(/knop--primair/); // BESLISSING 484: alle drie gevuld
      await expect(page.locator('.gewichtstreef .gewicht__actie .knop')).toHaveClass(/knop--primair/);

      // Rijen eindigen gelijk, en geen leeg vlak in een kaart
      const kaarten = await meetKaarten(page, '.gewicht__raster');
      for (const [naam, gat] of Object.entries(await meetGaten(page))) expect(gat, `${naam} heeft een leeg vlak van ${Math.round(gat)} px`).toBeLessThanOrEqual(32);
      const per = Object.fromEntries(kaarten.map((k) => [k.naam, k]));
      expect(Math.abs(per.gewichthoofd.bodem - per.gewicht__weegdag.bodem)).toBeLessThanOrEqual(2);
      expect(Math.abs(per.gewichthoofd.bodem - per.gewichtstreef.bodem)).toBeLessThanOrEqual(2);
      expect(Math.abs(per.gewichtgrafiek.bodem - per.gewicht__lijst.bodem), 'Verloop en Je wegingen eindigen gelijk').toBeLessThanOrEqual(2);
      expect(Math.abs(per.gewichtgrafiek.top - per.gewicht__lijst.top)).toBeLessThanOrEqual(2);
      if (n < 2) expect(per.gewichtgrafiek.hoogte, 'Verloop is compact').toBeLessThanOrEqual(240);
      else expect(per.gewichtgrafiek.hoogte).toBeLessThanOrEqual(480);
      // De pagina eindigt onder de laatste kaart
      expect(per.gewicht__weetjes.top).toBeGreaterThanOrEqual(per.gewichtgrafiek.bodem);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

// Telefoon: één kolom, de weetjes onder elkaar, geen horizontale scroll en geen afgebroken labels
for (const breed of [390, 360]) {
  for (const n of [0, 1, 20]) {
    test(`Gewicht ${breed} px met ${n} wegingen: één kolom, geen horizontale scroll, geen afgebroken labels`, async ({ page }) => {
      await open(page, n, breed, 844);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const meting = await page.evaluate(() => {
        const weetjes = [...document.querySelectorAll('.gewicht__weetjesrij .weetje')].map((w) => w.getBoundingClientRect());
        const labels = [...document.querySelectorAll('.gewicht .kaartkop__label, .gewicht .gewicht__stat .label')].map((l) => {
          const b = document.createRange();
          b.selectNodeContents(l);
          return b.getClientRects().length;
        });
        const kaarten = [...document.querySelectorAll('.gewicht__raster > .kaart')].map((k) => k.getBoundingClientRect());
        return { weetjes, labels, kaarten };
      });
      expect(meting.weetjes.length).toBe(4);
      for (let i = 1; i < 4; i++) expect(meting.weetjes[i].top).toBeGreaterThan(meting.weetjes[i - 1].bottom - 1);
      for (const regels of meting.labels) expect(regels, 'een label op één regel').toBe(1);
      for (const k of meting.kaarten) expect(Math.abs(k.left - meting.kaarten[0].left)).toBeLessThanOrEqual(1);
    });
  }
}
