// Delen (BESLISSING 300): twee kolommen. Links "Stel je verslag samen" en "Bewaren of versturen", rechts het verslag als vel dat binnenin scrolt.
// Metingen met 0, 1, 7 en 30 dagen verzonnen gegevens op vier breedtes, en de telefoon. Met PW_OUTDIR gezet worden er schermafbeeldingen bewaard.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { meetKaarten as meetKaartenZonderTegel } from './leeg-vlak.js';
import { wachtOpRust, wachtTotStil } from './r-wacht.js';

// BESLISSING 567 en 568: in "Goed om te weten" heeft elk weetje een eigen icoontegel (een zichtbaar vlak van 40 px) en staat de tekst in het midden van
// die tegel. De gedeelde meting (leeg-vlak.js) telt alleen elementen zonder kinderen en dus niet de tegel zelf; de strook boven de tekst (10 px) leek daardoor
// leeg. Hier telt de tegel van de weetjes mee als inhoud; elke andere kaart blijft zoals de gedeelde meting haar telt.
async function meetKaarten(page, wortel) {
  const gaten = await meetKaartenZonderTegel(page, wortel);
  const weetjes = await page.evaluate((sel) => {
    const k = document.querySelector(sel + ' .delen__weetjes');
    if (!k || k.offsetParent === null) return null;
    const r = k.getBoundingClientRect();
    const stijl = getComputedStyle(k);
    const binnenTop = r.top + parseFloat(stijl.paddingTop);
    const binnenBodem = r.bottom - parseFloat(stijl.paddingBottom);
    const blokken = [];
    for (const e of k.querySelectorAll('*')) {
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      const toont = e.children.length === 0 || e.classList.contains('tegel') || ['svg', 'textarea', 'input', 'button'].includes(e.tagName.toLowerCase());
      if (toont) blokken.push([Math.max(b.top, binnenTop), Math.min(b.bottom, binnenBodem)]);
    }
    blokken.sort((a, b) => a[0] - b[0]);
    let gat = 0;
    let tot = binnenTop;
    for (const [van, naar] of blokken) {
      if (naar <= van) continue;
      gat = Math.max(gat, van - tot);
      tot = Math.max(tot, naar);
    }
    return Math.max(gat, binnenBodem - tot);
  }, wortel);
  return gaten.map((k) => (/delen__weetjes/.test(k.naam) && weetjes !== null ? { ...k, gat: weetjes } : k));
}

test.use({ hasTouch: false, isMobile: false });

// Schermafbeeldingen alleen op verzoek (SHOTDIR); PW_OUTDIR is sinds de nieuwe config altijd gezet (de bouwmap) en is daar niet voor.
const map = process.env.SHOTDIR;

// De klok staat vast op donderdag 12 november 2026, zodat "Deze week" (maandag tot en met vandaag) niet van de weekdag van de testrun afhangt.
test.beforeEach(async ({ page }) => {
  await vasteKlok(page, { stil: true });
});

// Verzonnen gegevens voor de laatste `dagen` dagen (vandaag meegeteld): twee maaltijden, twee dranken en een notitie per dag, en elke zeven dagen een weging.
async function vulDagen(page, dagen) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  if (!dagen) return;
  await page.evaluate(
    (aantal) =>
      new Promise((klaar, fout) => {
        const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'dranken', 'dagen', 'wegingen'], 'readwrite');
          for (let i = 0; i < aantal; i += 1) {
            const datum = sleutel(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i));
            tx.objectStore('maaltijden').put({ datum, soort: 'ontbijt', tijd: '08:15', tekst: 'havermout met fruit', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
            tx.objectStore('maaltijden').put({ datum, soort: 'avondmaal', tijd: '18:30', tekst: 'groentesoep met brood', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
            tx.objectStore('dranken').add({ datum, tijdstip: nu.getTime() - i * 1000, soort: 'water', ml: 500, voorbeeld: false });
            tx.objectStore('dranken').add({ datum, tijdstip: nu.getTime() - i * 1000 - 500, soort: 'thee', ml: 250, voorbeeld: false });
            tx.objectStore('dagen').put({ datum, stemming: 3, energie: 4, notitie: 'Een rustige verzonnen dag', doelGehaald: false, voorbeeld: false });
            if (i % 7 === 0) tx.objectStore('wegingen').put({ week: datum, datum, kg: 70 + i / 10, voorbeeld: false, gewijzigdOp: 1 });
          }
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    dagen,
  );
}

const PERIODE = { 0: 'Vandaag', 1: 'Vandaag', 7: 'Twee weken', 30: 'Een maand' };

async function openMet(page, breedte, hoogte, dagen, { alles = false, thema = null } = {}) {
  await page.setViewportSize({ width: breedte, height: hoogte });
  await vulDagen(page, dagen);
  await page.goto('./#/delen');
  await expect(page.locator('.delen__weetjes')).toBeVisible();
  if (thema) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), thema);
  await page.getByRole('button', { name: PERIODE[dagen], exact: true }).click();
  if (alles) for (const n of ['Gewicht', 'Notities']) await page.getByRole('checkbox', { name: n, exact: true }).click();
  if (dagen) await expect(page.locator('.verslagvel .verslagvel__titel')).toBeVisible();
  else await expect(page.locator('.verslag__leeg')).toBeVisible();
  await wachtOpRust(page); // de kaarten zijn opgekomen
}

// ---- BESLISSING 331 en 333: een kort verslag laat geen leeg vlak achter ("Goed om te weten" komt in de kortste kolom), en de kerncijfers van één dag.
const SOORTEN_MAALTIJD = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
async function vulGeval(page, { maaltijden = 0, dranken = 0, notitie = false, weging = false, dagen = 1 }) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    ([m, d, n, w, aantal, soorten]) =>
      new Promise((klaar, fout) => {
        const sleutel = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'dranken', 'dagen', 'wegingen'], 'readwrite');
          for (const s of ['maaltijden', 'dranken', 'dagen', 'wegingen']) tx.objectStore(s).clear();
          for (let i = 0; i < aantal; i += 1) {
            const datum = sleutel(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i));
            for (let j = 0; j < m; j += 1) tx.objectStore('maaltijden').put({ datum, soort: soorten[j], tijd: `${String(8 + j * 2).padStart(2, '0')}:15`, tekst: 'havermout met fruit en een glas melk', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
            for (let j = 0; j < d; j += 1) tx.objectStore('dranken').add({ datum, tijdstip: nu.getTime() - i * 1000 - j * 100, soort: ['water', 'thee', 'koffie'][j % 3], ml: 2980 / d, voorbeeld: false });
            if (n) tx.objectStore('dagen').put({ datum, stemming: 3, energie: 4, notitie: 'Een rustige dag, wat moe na de middag.', doelGehaald: false, voorbeeld: false });
            if (w && i % 7 === 0) tx.objectStore('wegingen').put({ week: datum, datum, kg: 70 + i / 10, voorbeeld: false, gewijzigdOp: 1 });
          }
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    [maaltijden, dranken, notitie, weging, dagen, SOORTEN_MAALTIJD],
  );
}
const GEVALLEN = {
  leeg: { cfg: {}, periode: 'Vandaag', alles: false, soort: 'leeg' },
  'één maaltijd': { cfg: { maaltijden: 1 }, periode: 'Vandaag', alles: false, soort: 'kort' },
  'zes maaltijden': { cfg: { maaltijden: 6, dranken: 6, notitie: true }, periode: 'Vandaag', alles: false, soort: 'kort' },
  'alle onderdelen': { cfg: { maaltijden: 6, dranken: 6, notitie: true, weging: true }, periode: 'Vandaag', alles: true, soort: 'kort' },
  week: { cfg: { maaltijden: 2, dranken: 2, notitie: true, weging: true, dagen: 7 }, periode: 'Deze week', alles: true, soort: 'lang' },
  maand: { cfg: { maaltijden: 2, dranken: 2, notitie: true, weging: true, dagen: 30 }, periode: 'Een maand', alles: true, soort: 'lang' },
};
async function openGeval(page, breedte, hoogte, geval) {
  const g = GEVALLEN[geval];
  await page.setViewportSize({ width: breedte, height: hoogte });
  await vulGeval(page, g.cfg);
  await page.goto('./#/delen');
  await expect(page.locator('.delen__weetjes')).toBeVisible();
  await page.getByRole('button', { name: g.periode, exact: true }).click();
  if (g.alles) for (const n of ['Gewicht', 'Notities']) await page.getByRole('checkbox', { name: n, exact: true }).click();
  if (g.soort === 'leeg') await expect(page.locator('.verslag__leeg')).toBeVisible();
  else await expect(page.locator('.verslagvel .verslagvel__titel')).toBeVisible();
  await wachtOpRust(page);
}

for (const [breedte, hoogte] of [[1690, 1230], [1440, 900], [1280, 800]]) {
  for (const geval of Object.keys(GEVALLEN)) {
    test(`Delen ${breedte}x${hoogte}, ${geval}: de kolommen eindigen gelijk, geen leeg vlak, "Goed om te weten" in de kortste kolom`, async ({ page }) => {
      await openGeval(page, breedte, hoogte, geval);
      const soort = GEVALLEN[geval].soort;
      const maten = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const weetjes = document.querySelector('.delen__weetjes');
        const rechts = r('.delen__rechts');
        const velEl = document.querySelector('.verslagvel');
        return {
          linksOnder: r('.delen__bewaren').bottom,
          rechtsOnder: rechts.bottom,
          weetjesBinnen: Boolean(weetjes.closest('.delen__rechts')),
          weetjesOnder: weetjes.getBoundingClientRect().bottom,
          verslagOnder: r('.delen__verslag').bottom,
          velScrolt: velEl.scrollHeight > velEl.clientHeight + 1,
          // per rij: hoeveel hoger ze is dan haar tekstregels (opvulling 2 x 6 px, hoogstens + 6 px rek en de tegel van 20 px)
          rijen: [...document.querySelectorAll('.verslagvel__rij')].map((e) => {
            const regels = Math.max(...[...e.children].map((c) => Math.round((c.scrollHeight - parseFloat(getComputedStyle(c).paddingTop) - parseFloat(getComputedStyle(c).paddingBottom)) / (parseFloat(getComputedStyle(c).lineHeight) || 18))));
            return e.getBoundingClientRect().height - regels * (parseFloat(getComputedStyle(e.children[0]).lineHeight) || 18);
          }),
          weetjesHoogte: [...weetjes.querySelectorAll('.weetje')].map((e) => e.getBoundingClientRect().height),
          paginaOnder: weetjes.getBoundingClientRect().bottom,
        };
      });
      // De kolommen eindigen op dezelfde lijn: links de kaart Bewaren, rechts de laatste kaart van de rechterkolom
      expect(Math.abs(maten.linksOnder - maten.rechtsOnder), 'onderkant links en rechts').toBeLessThanOrEqual(2);
      if (maten.weetjesBinnen) {
        expect(Math.abs(maten.weetjesOnder - maten.rechtsOnder), 'weetjes eindigen op de lijn van links').toBeLessThanOrEqual(2);
        expect(maten.verslagOnder).toBeLessThan(maten.weetjesOnder);
      }
      if (geval === 'één maaltijd') expect(maten.weetjesBinnen, 'bij een heel kort vel staan de weetjes rechts').toBe(true);
      if (soort === 'lang' || soort === 'leeg') expect(maten.weetjesBinnen, 'een lang of leeg verslag: de weetjes onderaan').toBe(false);
      // Niets opgeblazen: geen rij van de dagtabel hoger dan 48 px, geen weetje hoger dan 72 px
      for (const extra of maten.rijen) expect(extra, 'rij van de dagtabel: hoogte boven haar tekstregels').toBeLessThanOrEqual(12 + 6 + 8); // opvulling, rek en de tegel in de eerste cel
      for (const h of maten.weetjesHoogte) expect(h, 'weetje').toBeLessThanOrEqual(72);
      // Geen leeg vlak boven 32 px in een kaart (het scrollende vel van een lang verslag en de lege toestand tellen niet)
      const gaten = await meetKaarten(page, '.delen');
      for (const k of gaten) {
        if (/delen__verslag/.test(k.naam)) continue; // het vel is papier met een eigen opmaak: daar telt of er onder het vel niets leeg blijft (hieronder)
        // Een dag met één maaltijd en niets anders heeft te weinig inhoud om de rest ongemerkt te verdelen: daar is ruimte tot 80 px boven en onder de weetjes toegestaan
        expect(k.gat, `leeg vlak in ${k.naam}`).toBeLessThanOrEqual(geval === 'één maaltijd' && /weetjes/.test(k.naam) ? 80 : 32);
      }
      if (soort === 'kort' && !maten.velScrolt) {
        const onderVel = await page.evaluate(() => document.querySelector('.delen__velhouder').getBoundingClientRect().bottom - document.querySelector('.verslagvel').getBoundingClientRect().bottom);
        expect(onderVel, 'onder het vel in de kaart').toBeLessThanOrEqual(32);
      }
      if (map) await page.screenshot({ path: `${map}/delenkort-${breedte}-${geval.replace(/\W+/g, '-')}.png`, fullPage: true });
    });
  }
}

test('Delen: de kaarten verspringen niet terwijl een datumveld focus heeft', async ({ page }) => {
  await openGeval(page, 1440, 900, 'zes maaltijden');
  await page.getByRole('button', { name: 'Aangepast', exact: true }).click();
  await expect(page.locator('.delen__eigen input[type="date"]')).toHaveCount(2);
  const doosjes = () => page.evaluate(() => ['.delen__verslag', '.delen__weetjes', '.delen__bewaren'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; }));
  // Eerst wachten tot de kaarten na de klik op Aangepast stilstaan: de meting liep vroeger soms terwijl ze nog opkwamen.
  await wachtOpRust(page);
  const voor = await wachtTotStil(page, doosjes);
  const veld = page.locator('.delen__eigen input[type="date"]').first();
  await veld.focus();
  const waarde = await veld.inputValue();
  await page.keyboard.press('ArrowUp');
  await expect(veld).not.toHaveValue(waarde); // de datum is echt veranderd
  await expect(veld).toBeFocused();
  await wachtOpRust(page);
  expect(await wachtTotStil(page, doosjes)).toEqual(voor);
});

// BESLISSING 333: de kerncijfers van één dag en van een periode zijn één systeem: even brede blokken, één gezamenlijke basislijn, de eenheid in één maat.
for (const [breedte, hoogte] of [[1690, 1230], [1280, 800], [390, 844]]) {
  for (const geval of ['alle onderdelen', 'week']) {
    test(`Delen ${breedte}x${hoogte}, ${geval}: kerncijfers even breed, op één basislijn en met de eenheid in één maat`, async ({ page }) => {
      await openGeval(page, breedte, hoogte, geval);
      const blokken = await page.locator('.verslagvel__cijfer').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const rec = (s) => e.querySelector(s).getBoundingClientRect();
          const eenheid = e.querySelector('.verslagvel__cijfereenheid');
          const getal = e.querySelector('.verslagvel__cijfergetal');
          return {
            breed: r.width,
            top: r.top,
            hoog: r.height,
            label: rec('.verslagvel__cijferlabel').top,
            waarde: rec('.verslagvel__cijfergetal').bottom,
            onder: rec('.verslagvel__cijferonder').top,
            eenheidMaat: eenheid ? parseFloat(getComputedStyle(eenheid).fontSize) / parseFloat(getComputedStyle(getal).fontSize) : null,
            eenheidBasis: eenheid ? eenheid.getBoundingClientRect().bottom : null,
            getalBasis: getal.getBoundingClientRect().bottom,
            tekst: e.textContent,
          };
        }),
      );
      expect(blokken.length).toBeGreaterThanOrEqual(3);
      const getallen = await page.locator('.verslagvel__cijfergetal').allTextContents();
      for (const g of getallen) expect(g, 'alleen een getal in de cijferletter').toMatch(/^[\d.,-]+$/);
      // Per rij (zelfde top) dezelfde breedte, label, cijfer en onderregel op één lijn; de eenheid in één verhouding tot het cijfer
      const rijen = new Map();
      for (const b of blokken) rijen.set(Math.round(b.top), [...(rijen.get(Math.round(b.top)) ?? []), b]);
      for (const rij of rijen.values()) {
        for (const b of rij) {
          expect(Math.abs(b.label - rij[0].label), 'labels').toBeLessThanOrEqual(1);
          expect(Math.abs(b.waarde - rij[0].waarde), 'cijfers').toBeLessThanOrEqual(1);
          expect(Math.abs(b.onder - rij[0].onder), 'onderregels').toBeLessThanOrEqual(1);
        }
        if (rij.length > 1) for (const b of rij) expect(Math.abs(b.breed - rij[0].breed), 'even breed').toBeLessThanOrEqual(1);
      }
      for (const b of blokken) if (b.eenheidMaat != null) expect(b.eenheidMaat).toBeCloseTo(0.55, 1);
      // Nooit een weeskind alleen op een rij als er meer dan één blok is (bij drie of meer blokken niet één alleen op de laatste rij tenzij het zo breed is als de rest)
      const laatste = [...rijen.values()].at(-1);
      if (rijen.size > 1 && laatste.length === 1) expect(Math.abs(laatste[0].breed - [...rijen.values()][0][0].breed), 'het laatste blok loopt over de volle breedte of is zo breed als de rest').toBeLessThanOrEqual(1);
    });
  }
}

const doos = (page, sel) => page.locator(sel).first().boundingBox();

for (const [breedte, hoogte] of [[1690, 1230], [1720, 950], [1440, 900], [1280, 800]]) {
  for (const dagen of [0, 1, 7, 30]) {
    test(`Delen ${breedte}x${hoogte}, ${dagen} dagen: twee kolommen die gelijk beginnen en eindigen, geen leeg vlak, rijen en knoppen kloppen`, async ({ page }) => {
      await openMet(page, breedte, hoogte, dagen, { alles: true });
      const links1 = await doos(page, '.delen__samenstel');
      const links2 = await doos(page, '.delen__bewaren');
      const rechts = await doos(page, '.delen__rechts'); // BESLISSING 331: de rechterkolom (bij een kort verslag met "Goed om te weten" eronder)
      // Kolommen: de linkerkolom (twee kaarten) en de rechterkolom beginnen en eindigen op dezelfde lijn
      expect(Math.abs(links1.y - rechts.y), 'bovenkant').toBeLessThanOrEqual(1);
      expect(Math.abs(links2.y + links2.height - (rechts.y + rechts.height)), 'onderkant').toBeLessThanOrEqual(1);
      expect(links1.x + links1.width, 'links voor rechts').toBeLessThan(rechts.x);
      expect(links1.width, 'minstens 360 px').toBeGreaterThanOrEqual(359);
      expect(rechts.width / links1.width, 'ongeveer 1 : 2').toBeGreaterThan(1.2); // links minstens 360 px; op de breedste schermen 1 : 2
      // Titels en lijnen van de linker- en rechterkaart op dezelfde y
      const kop = (sel) => page.locator(sel + ' .kaartkop').evaluate((e) => ({ titel: e.querySelector('.kaartkop__label').getBoundingClientRect().top, lijn: e.getBoundingClientRect().bottom }));
      const kl = await kop('.delen__samenstel');
      const kr = await kop('.delen__verslag');
      expect(Math.abs(kl.titel - kr.titel), 'titel').toBeLessThanOrEqual(1);
      expect(Math.abs(kl.lijn - kr.lijn), 'lijn').toBeLessThanOrEqual(1);
      // Geen leeg vlak boven 32 px in de kaarten links en in "Goed om te weten"
      const gaten = await meetKaarten(page, '.delen');
      for (const k of gaten) if (!/delen__verslag/.test(k.naam) && k.naam !== 'kaart delen__verslag kaart--licht-op') expect(k.gat, `leeg vlak in ${k.naam}`).toBeLessThanOrEqual(32);
      // Vier rijen even hoog, de vinkvakken op de rechter binnenrand
      const rijen = await page.locator('.delen__optie').evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, rechts: e.querySelector('.vinkvak__vak').getBoundingClientRect().right, kaartRechts: e.closest('.kaart').getBoundingClientRect().right - parseFloat(getComputedStyle(e.closest('.kaart')).paddingRight) })));
      expect(rijen).toHaveLength(4);
      for (const r of rijen) {
        expect(Math.abs(r.h - rijen[0].h)).toBeLessThanOrEqual(1);
        expect(Math.abs(r.rechts - r.kaartRechts)).toBeLessThanOrEqual(1);
        expect(Math.abs(r.rechts - rijen[0].rechts)).toBeLessThanOrEqual(1);
      }
      // Knoppen: zonder gegevens uit, met gegevens aan
      for (const naam of ['Bewaren', 'Afdrukken']) {
        if (dagen) await expect(page.getByRole('button', { name: naam, exact: true })).toBeEnabled();
        else await expect(page.getByRole('button', { name: naam, exact: true })).toBeDisabled();
      }
      if (!dagen) await expect(page.locator('.delen__hint')).toContainText('zodra er iets in je verslag staat');
      // Het vel scrolt binnenin; het vel zelf groeit niet mee met zijn inhoud (de kaart blijft zo hoog als links)
      const vel = await page.locator('.verslagvel').evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight, hoogte: e.getBoundingClientRect().height }));
      if (dagen === 30) expect(vel.scroll).toBeGreaterThan(vel.client + 20);
      expect(vel.hoogte).toBeLessThan(rechts.height);
      // De pagina zelf scrolt hoogstens tot en met "Goed om te weten"
      const rest = await page.evaluate(() => {
        const w = document.querySelector('.delen__weetjes').getBoundingClientRect();
        const el = document.scrollingElement;
        // Past de pagina in het venster, dan scrolt ze niet en is er niets te meten (scrollHeight is dan het venster zelf)
        return { onderWeetjes: el.scrollHeight > window.innerHeight ? el.scrollHeight - (w.bottom + el.scrollTop) : 0, scrollBreedte: el.scrollWidth - el.clientWidth };
      });
      expect(rest.onderWeetjes, 'niets onder Goed om te weten').toBeLessThanOrEqual(130);
      expect(rest.scrollBreedte).toBeLessThanOrEqual(0);
      if (map) {
        await page.screenshot({ path: `${map}/delen-${breedte}-${dagen}-poeder.png`, fullPage: true });
        if (breedte === 1690 && (dagen === 0 || dagen === 7)) {
          await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'nacht'));
          await wachtOpRust(page);
          await page.screenshot({ path: `${map}/delen-${breedte}-${dagen}-nacht.png`, fullPage: true });
        }
      }
    });
  }
}

test('Delen: de periode staat in woorden en bij Aangepast verspringt de linkerkolom niet', async ({ page }) => {
  await openMet(page, 1690, 1230, 7);
  const woorden = page.locator('.delen__periodewoorden');
  await expect(woorden).toBeVisible();
  await expect(woorden).toContainText('14 dagen'); // Twee weken
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  await expect(woorden).toContainText('1 dag');
  const voor = [(await doos(page, '.delen__samenstel')).height, (await doos(page, '.delen__bewaren')).height, (await doos(page, '.delen__verslag')).height];
  await page.getByRole('button', { name: 'Aangepast' }).click();
  await expect(page.locator('.delen__datum')).toHaveCount(2);
  const velden = await page.locator('.delen__datum').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(Math.abs(velden[0] - velden[1])).toBeLessThanOrEqual(1); // van en tot op één rij
  const na = [(await doos(page, '.delen__samenstel')).height, (await doos(page, '.delen__bewaren')).height, (await doos(page, '.delen__verslag')).height];
  for (let i = 0; i < 3; i += 1) expect(Math.abs(na[i] - voor[i]), 'kaart ' + i).toBeLessThanOrEqual(1);
  if (map) await page.screenshot({ path: `${map}/delen-aangepast.png`, fullPage: true });
});

for (const [breedte, hoogte] of [[1690, 1230], [1280, 800], [390, 844]]) {
  // BESLISSING 474 en 485: zeven knoppen in drie rijen (3, 3 en 1): Vorige week, Gisteren, Vandaag / Deze week, Twee weken, Een maand / Aangepast over de volle breedte
  test(`Delen ${breedte}: de zeven periodeknoppen staan in drie rijen (3, 3 en 1), de eerste zes even groot en Aangepast over de volle breedte, met gelijke tussenruimte`, async ({ page }) => {
    await openMet(page, breedte, hoogte, 7);
    const chips = page.locator('.delen__periode .chips .chip');
    await expect(chips).toHaveCount(7);
    await expect(chips).toHaveText(['Vorige week', 'Gisteren', 'Vandaag', 'Deze week', 'Twee weken', 'Een maand', 'Aangepast']);
    const d = await chips.evaluateAll((els) => els.map((e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, afgekapt: e.scrollWidth > e.clientWidth };
    }));
    for (const [n, c] of d.entries()) {
      if (n < 6) expect(Math.abs(c.w - d[0].w), 'breedte').toBeLessThanOrEqual(1); // de zevende loopt over de volle breedte (hieronder)
      expect(Math.abs(c.h - d[0].h), 'hoogte').toBeLessThanOrEqual(1);
      expect(c.afgekapt, 'label afgekapt').toBe(false);
    }
    for (const [a, b, c] of [[0, 1, 2], [3, 4, 5]]) {
      expect(Math.abs(d[a].y - d[b].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(d[b].y - d[c].y)).toBeLessThanOrEqual(1);
    }
    expect(d[3].y, 'tweede rij').toBeGreaterThan(d[0].y + d[0].h - 1);
    expect(Math.abs(d[3].x - d[0].x)).toBeLessThanOrEqual(1);
    const tussen = d[1].x - (d[0].x + d[0].w);
    expect(Math.abs(d[2].x - (d[1].x + d[1].w) - tussen)).toBeLessThanOrEqual(1);
    const kaart = await doos(page, '.delen__samenstel');
    expect(d[2].x + d[2].w).toBeLessThanOrEqual(kaart.x + kaart.width);
    // derde rij: alleen "Aangepast", op dezelfde linkerrand als de rij erboven, tot de rechterrand van de derde knop, onder de tweede rij met dezelfde tussenruimte als tussen de eerste twee rijen
    expect(d[6].y, 'derde rij').toBeGreaterThan(d[3].y + d[3].h - 1);
    expect(Math.abs(d[6].x - d[0].x), 'linkerrand van Aangepast').toBeLessThanOrEqual(1);
    expect(Math.abs(d[6].x + d[6].w - (d[2].x + d[2].w)), 'rechterrand van Aangepast: de volle breedte').toBeLessThanOrEqual(1);
    expect(Math.abs(d[6].y - (d[3].y + d[3].h) - (d[3].y - (d[0].y + d[0].h))), 'verticale tussenruimte').toBeLessThanOrEqual(1);
    const fs =await chips.first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fs).toBeGreaterThanOrEqual(13);
  });
}

test('Delen: het aantal per onderdeel staat rechts in de rij, en weg als het er niet is', async ({ page }) => {
  await openMet(page, 1690, 1230, 7);
  await expect(page.locator('.delen__optie').nth(0).locator('.delen__tel')).toHaveText('14 maaltijden'); // 7 dagen met gegevens x 2
  await expect(page.locator('.delen__optie').nth(1).locator('.delen__tel')).toHaveText('7 dagen');
  await expect(page.locator('.delen__optie').nth(2).locator('.delen__tel')).toHaveCount(1);
  await expect(page.locator('.delen__optie').nth(2).locator('.delen__tel')).toBeHidden(); // Gewicht staat uit
  await page.getByRole('checkbox', { name: 'Notities', exact: true }).click();
  await expect(page.locator('.delen__optie').nth(3).locator('.delen__tel')).toHaveText('7 notities');
  await expect(page.locator('.delen__verslag .kaartkop__eind')).toContainText('14 dagen · 3 onderdelen');
});

test('Delen: de lege toestand vult het vel en zegt rustig wat kan', async ({ page }) => {
  await openMet(page, 1690, 1230, 0);
  const m = await page.evaluate(() => {
    const v = document.querySelector('.verslagvel').getBoundingClientRect();
    const houder = document.querySelector('.delen__velhouder').getBoundingClientRect();
    const l = document.querySelector('.verslag__leeg').getBoundingClientRect();
    return { vulHoogte: v.height - houder.height, midden: (l.top + l.height / 2) - (v.top + v.height / 2), logo: !!document.querySelector('.verslag__leeg svg') };
  });
  expect(Math.abs(m.vulHoogte)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.midden)).toBeLessThanOrEqual(2);
  expect(m.logo).toBe(true);
  await expect(page.locator('.verslag__leegtekst')).toHaveText('In deze periode staat nog niets.');
  await expect(page.locator('.verslag__leegtip')).toHaveText('Kies een langere periode.');
  await page.getByRole('button', { name: 'Een maand', exact: true }).click();
  await expect(page.locator('.verslag__leegtip')).toHaveCount(0); // een maand langer kan niet
});

for (const breedte of [390, 360]) {
  test(`Delen op ${breedte} px: één kolom in de volgorde samenstellen, verslag, bewaren, weetjes; knoppen minstens 48 px; geen horizontale scroll`, async ({ page }) => {
    await openMet(page, breedte, 844, 7);
    const y = [];
    for (const sel of ['.delen__periode', '.delen__onderdelen', '.delen__verslag', '.delen__bewaren', '.delen__weetjes']) y.push((await doos(page, sel)).y);
    for (let i = 1; i < y.length; i += 1) expect(y[i], 'volgorde ' + i).toBeGreaterThan(y[i - 1]);
    const vel = await doos(page, '.delen__velhouder');
    expect(vel.height).toBeGreaterThan(844 * 0.55);
    expect(vel.height).toBeLessThan(844 * 0.65);
    for (const naam of ['Bewaren', 'Afdrukken']) {
      const b = await page.getByRole('button', { name: naam, exact: true }).boundingBox();
      expect(b.height, naam).toBeGreaterThanOrEqual(48);
    }
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const sel of ['.delen__samenstel', '.delen__bewaren', '.delen__verslag']) {
      const b = await doos(page, sel);
      expect(b.x + b.width, sel).toBeLessThanOrEqual(breedte);
    }
    if (map) await page.screenshot({ path: `${map}/delen-${breedte}.png`, fullPage: true });
  });
}

test('Delen: de rondleiding vindt zijn haken op het nieuwe scherm', async ({ page }) => {
  await openMet(page, 1690, 1230, 7);
  for (const haak of ['delen-periode', 'delen-onderdelen', 'delen-voorbeeld', 'delen-knoppen', 'delen-standaard']) {
    await expect(page.locator(`[data-uitleg="${haak}"]`), haak).toHaveCount(1);
  }
});
