// Responsive-controle van Drinken, Supplementen, Gewicht en de navigatie (BESLISSING 308): iPhone, iPad (staand, liggend en gesplitste weergave) en het brede scherm.
// Per breedte en per scherm, met drie soorten gegevens (leeg, gewoon, vol): geen horizontale scroll of element buiten het venster, geen afgekapte of afgebroken tekst,
// tikdoelen van minstens 44 px, geen overlap tussen tikdoelen, kaarten in één rij die gelijk eindigen, geen leeg vlak boven 32 px in een kaart, de laatste kaart
// boven de tabbalk, labels van de tabbalk zonder afkapping; de pop-upkaart van een supplement en het blad "Weging noteren" passen in het venster en hun knoppen zijn
// bereikbaar; het cijferblok van de vergrendeling (toetsen 52 px hoog, niets onder de rand, ook liggend).
// Gemeten in Chrome met aanraking (hasTouch, isMobile): wat alleen in Safari op een echt toestel te zien is, staat in het rapport bij BESLISSING 308.
import { test, expect } from '@playwright/test';
import { SOORTEN, vulTabbladen, meetPagina, meetLeegVlak } from './r-tabbladen-meting.js';
import { animatiesKlaar, domRustig } from './wacht.js';
import { wachtTotStil, wachtOpInstelling } from './r-wacht.js';

const TELEFOON = [[360, 740], [390, 844], [430, 932], [844, 390]];
const IPAD_STAAND = [[744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]];
const IPAD_LIGGEND = [[1133, 744], [1024, 768], [1080, 810], [1180, 820], [1194, 834], [1366, 1024]];
const GESPLITST = [[507, 1024], [678, 1024], [320, 1024]];
const BREED = [[1440, 900], [1500, 900], [1690, 1230]];
const SCHERMEN = ['drinken', 'supplementen', 'gewicht'];

// Bekende, bewuste uitzonderingen (zie het rapport):
//  - de zeven staven van "Deze week" (Drinken) zijn 256 px hoog en op een telefoon ± 40 px breed: ze zijn tikdoelen binnen een rij van zeven, begrensd door de kaartbreedte;
//  - de lege toestand van Supplementen (een gecentreerd beeldmerk met één zin) en het dagschema (een tabel met twee delen) hebben bewust ruimte.
const LEEG_OK = /supplementen__leegkaart|supplementen__uitleg|overzichtkaart/;
// (de drie icoonknoppen in de compacte schermkop zijn sinds 0.3.8 met opzet 40 x 40 px; eigenaar, 26 november 2026)
// (de knoppen op de kaarten van Gewicht zijn op een telefoon 36 px hoog met een onzichtbaar tikvlak van 44 px (::after); eigenaar, 26 november 2026)
const KLEIN_OK = /^a\.weekstaaf (3\d|4[0-3])x|^(button|a)\.icoonknop 40x40 "(Rondleiding van dit sche|Delen|Naar vandaag)|^button\.knop \d+x36 "(Weging noteren|Streefgewicht (instellen|aanpassen))"/;
const TEKST_OK = /alleen-lezer/;
//  - de naam in een rij van het dagschema (Supplementen) is een knop van 24 px hoog met een tikvlak van 44 px (10 px erboven en eronder, binnen de cel); de rijen van de tabel liggen 49 px
//    onder elkaar, dus de tikvlakken van twee rijen liggen 5 px uit elkaar. Elke rij opent bovendien zelf dezelfde kaart met een tik: een tik tussen twee namen opent het supplement van de rij waarin ze valt.
const DICHT_OK = /^\d+px: button\.schema__knop \/ button\.schema__knop$/;

async function start(page, breed, hoog) {
  await page.setViewportSize({ width: breed, height: hoog });
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  // de app is klaar met starten: het eerste scherm is uitgebouwd en opgekomen (geen vaste wachttijd)
  await domRustig(page);
  await animatiesKlaar(page);
}

async function open(page, scherm) {
  await page.goto(`./#/${scherm}`);
  await page.locator(`#scherm[data-scherm="${scherm}"]`).waitFor({ state: 'attached' }).catch(() => {});
  await page.waitForTimeout(1300); // de kaarten komen zacht op
}

const groep = (naam, groottes, opties = {}) => {
  test.describe(naam, () => {
    test.use({ hasTouch: opties.aanraking ?? true, isMobile: opties.aanraking ?? true, deviceScaleFactor: 1 });
    for (const [breed, hoog] of groottes) {
      test(`${naam} ${breed}x${hoog}: Drinken, Supplementen en Gewicht zonder fouten in de indeling`, async ({ page }) => {
        test.setTimeout(180000);
        await start(page, breed, hoog);
        const problemen = [];
        for (const soort of SOORTEN) {
          await vulTabbladen(page, soort);
          for (const scherm of SCHERMEN) {
            await open(page, scherm);
            const m = await meetPagina(page);
            // BESLISSING 354: in "Je week in cijfers" telt de meting de ruimte boven de scheidingslijn, de lijn en de ruimte eronder als één leeg vlak (de lijn is een pseudo-element); alleen dat ene vlak (tot 48 px) is hier toegestaan, de afzonderlijke ruimtes (elk ≤ 32 px) bewaakt b-drinken-indeling.spec.js.
            const gat = (await meetLeegVlak(page)).filter((g) => !LEEG_OK.test(g.naam)).filter((g) => !(g.naam.includes('drinken__cijferkaart') && g.gat <= 48));
            const wat = `${scherm}/${soort}`;
            m.fouten.filter((f) => !TEKST_OK.test(f)).forEach((f) => problemen.push(`${wat}: ${f}`));
            m.klein.filter((k) => !KLEIN_OK.test(k)).forEach((k) => problemen.push(`${wat}: tikdoel te klein ${k}`));
            m.dicht.filter((d) => !DICHT_OK.test(d)).forEach((d) => problemen.push(`${wat}: tikdoelen te dicht ${d}`));
            m.rijen.forEach((r) => problemen.push(`${wat}: ${r}`));
            m.tabs.filter((tab) => tab.over || tab.h < 44).forEach((tab) => problemen.push(`${wat}: tab ${tab.tekst} afgekapt of te laag`));
            gat.forEach((g) => problemen.push(`${wat}: leeg vlak ${g.gat}px in ${g.naam}`));
            // geen tooltip die alleen met hover bereikbaar is
            const titels = await page.locator('#scherm [title]').count();
            if (titels) problemen.push(`${wat}: ${titels} element(en) met een title (alleen met hover)`);
            // de laatste kaart is na scrollen volledig zichtbaar, boven de tabbalk
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            // meten als de pagina niet meer schuift (geen vaste wachttijd)
            const onder = await wachtTotStil(page, () => page.evaluate(() => {
              const kaarten = [...document.querySelectorAll('#scherm .kaart')].filter((k) => k.offsetParent !== null);
              const laatste = kaarten[kaarten.length - 1];
              const tb = document.querySelector('#tabbalk');
              const grens = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().top : window.innerHeight;
              return laatste ? { onderkant: laatste.getBoundingClientRect().bottom, grens } : null;
            }));
            if (onder && onder.onderkant > onder.grens + 1) problemen.push(`${wat}: de laatste kaart eindigt op ${Math.round(onder.onderkant)}, onder de tabbalk (${Math.round(onder.grens)})`);
          }
        }
        expect(problemen, problemen.join('\n')).toEqual([]);
      });
    }
  });
};

groep('iPhone', TELEFOON);
groep('iPad staand', IPAD_STAAND);
groep('iPad liggend', IPAD_LIGGEND);
groep('iPad gesplitst', GESPLITST);
groep('breed', BREED, { aanraking: false });

// ---------- De navigatie: welke indeling hoort bij welke breedte ----------
test.describe('navigatie', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const GRENZEN = [
    [719, 'tabbalk'], [720, 'tabbalk'], [959, 'tabbalk'], [960, 'zijbalk'], [1099, 'zijbalk'], [1100, 'zijbalk'], [1279, 'zijbalk'], [1280, 'zijbalk'], [1599, 'zijbalk'], [1600, 'zijbalk'],
  ];
  for (const [breed, verwacht] of GRENZEN) {
    test(`op ${breed} px staat de ${verwacht}, zonder horizontale scroll, met zes bereikbare tabs of items`, async ({ page }) => {
      await start(page, breed, 900);
      await vulTabbladen(page, 'gewoon');
      await open(page, 'drinken');
      const stand = await page.evaluate(() => {
        const zichtbaar = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
        const tab = document.querySelector('#tabbalk');
        const zij = document.querySelector('#zijbalk');
        const items = [...document.querySelectorAll(zichtbaar(tab) ? '#tabbalk .tabbalk__item' : '#zijbalk .zijbalk__item')];
        return {
          tabbalk: zichtbaar(tab),
          zijbalk: zichtbaar(zij),
          aantal: items.length,
          // (de tab Algemeen staat in de balk, maar wordt op een telefoon niet getoond: daar staat Algemeen als knop bij de begroeting)
          klein: items.filter((e) => e.getClientRects().length > 0 && (e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44)).length,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(verwacht === 'tabbalk' ? stand.tabbalk && !stand.zijbalk : stand.zijbalk && !stand.tabbalk).toBe(true);
      expect(stand.aantal).toBeGreaterThanOrEqual(6);
      expect(stand.klein).toBe(0);
      expect(stand.scroll).toBeLessThanOrEqual(0);
    });
  }
});

// ---------- De labels van de tabbalk (BESLISSING 325: overal "Supplementen", nergens "Vitamine") ----------
test.describe('tabbalk', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  for (const [breed, hoog] of [[320, 568], [360, 740], [390, 844], [430, 932]]) {
    test(`op ${breed} px past elk label binnen zijn tab, op één regel, in dezelfde lettermaat, zonder een buur te raken`, async ({ page }) => {
      await start(page, breed, hoog);
      await open(page, 'supplementen');
      const m = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('#tabbalk .tabbalk__item')].filter((e) => e.getClientRects().length > 0).map((e) => { // alleen de getoonde tabs (Algemeen niet op een telefoon)
          const l = e.querySelector('.tabbalk__label');
          const bereik = document.createRange();
          bereik.selectNodeContents(l);
          const t = bereik.getBoundingClientRect();
          const r = e.getBoundingClientRect();
          return { tekst: l.textContent, links: t.left, rechts: t.right, hoogte: t.height, tabLinks: r.left, tabRechts: r.right, tabBreed: r.width, letter: getComputedStyle(l).fontSize, regels: bereik.getClientRects().length };
        });
        return { tabs, pagina: document.body.innerText };
      });
      expect(m.tabs.map((x) => x.tekst)).toContain('Supplementen');
      for (const [i, x] of m.tabs.entries()) {
        expect(x.links, `${x.tekst} links`).toBeGreaterThanOrEqual(x.tabLinks);
        expect(x.rechts, `${x.tekst} rechts`).toBeLessThanOrEqual(x.tabRechts);
        expect(x.regels, `${x.tekst} regels`).toBe(1);
        expect(x.tabBreed, `${x.tekst} tikdoel`).toBeGreaterThanOrEqual(48);
        expect(x.letter).toBe(m.tabs[0].letter);
        if (i > 0) expect(x.links - m.tabs[i - 1].rechts, `${m.tabs[i - 1].tekst} / ${x.tekst}`).toBeGreaterThanOrEqual(2);
      }
      expect(parseFloat(m.tabs[0].letter)).toBeGreaterThanOrEqual(10.5);
      // BESLISSING 325 verbiedt het losse woord "Vitamine" als korte naam van het tabblad. De voorbeeldnaam "Multivitamine" op het lege
      // scherm Supplementen is een ander woord en is goedgekeurd (BESLISSING 718): een letter vlak voor "vitamine" telt daarom niet mee.
      for (const scherm of ['vandaag', 'supplementen', 'meer/profiel']) {
        await open(page, scherm);
        const tekst = await page.evaluate(() => document.body.innerText);
        expect(tekst, `${scherm} bevat "Vitamine"`).not.toMatch(/(?<![a-z])Vitamine(?! [A-Z])/i);
        if (scherm === 'supplementen') expect(tekst, 'het lege scherm toont de goedgekeurde voorbeeldnaam').toContain('Multivitamine');
      }
    });
  }
});

// ---------- Pop-upkaart en blad ----------
const VENSTERS = [[360, 740], [844, 390], [768, 1024]];
test.describe('dialogen', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const meetDialoog = (page) =>
    page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      // de knoppen onderaan (Bewaren, Annuleren, Verwijderen, Noteren) staan buiten het scrollvlak en moeten altijd te zien zijn; velden en keuzes scrollen binnenin
      const knoppen = [...d.querySelectorAll('.supplementkaart__onder button, .dialoog__acties button, .streefblad__knoppen button')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect());
      return {
        binnen: r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5,
        knoppenZichtbaar: knoppen.every((k) => k.bottom <= window.innerHeight + 0.5 && k.right <= window.innerWidth + 0.5),
        // een knop die onder de rand van een scrollende houder ligt, is bereikbaar door te scrollen; de knoppen onderaan staan buiten het scrollvlak
        scrollbreed: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        klein: knoppen.filter((k) => k.height < 43.5 && k.width < 43.5).length,
      };
    });
  for (const [breed, hoog] of VENSTERS) {
    test(`de supplementkaart (toevoegen en aanpassen) past op ${breed}x${hoog} en haar knoppen zijn bereikbaar`, async ({ page }) => {
      await start(page, breed, hoog);
      await vulTabbladen(page, 'vol');
      await open(page, 'supplementen');
      for (const kies of ['.sup-toevoegen', '.schema__knop']) {
        await page.locator(kies).locator('visible=true').first().click();
        // de kaart is open en opgekomen, haar maat ligt vast (geen vaste wachttijd)
        await expect(page.locator('dialog[open]')).toHaveCount(1);
        await animatiesKlaar(page);
        const m = await wachtTotStil(page, () => meetDialoog(page));
        expect(m, `dialoog bij ${kies}`).not.toBeNull();
        expect(m.binnen).toBe(true);
        expect(m.knoppenZichtbaar).toBe(true);
        expect(m.scrollbreed).toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await animatiesKlaar(page); // het sluiten is voorbij voor de volgende kaart opengaat (geen vaste wachttijd)
      }
    });
    test(`het blad "Weging noteren" past op ${breed}x${hoog} en sluit met Escape`, async ({ page }) => {
      await start(page, breed, hoog);
      await vulTabbladen(page, 'vol');
      await open(page, 'gewicht');
      await page.locator('.gewichthoofd .knop').locator('visible=true').first().click();
      // het blad is open en opgekomen, zijn maat ligt vast (geen vaste wachttijd)
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await animatiesKlaar(page);
      const m = await wachtTotStil(page, () => meetDialoog(page));
      expect(m).not.toBeNull();
      expect(m.binnen).toBe(true);
      expect(m.knoppenZichtbaar).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    });
  }
});

// ---------- Het slotscherm met het cijferblok ----------
test.describe('vergrendeling', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const SLOTMATEN = [[360, 740], [390, 844], [844, 390], [667, 375], [768, 1024], [1024, 768], [1180, 820], [507, 1024], [320, 1024]];
  for (const [breed, hoog] of SLOTMATEN) {
    test(`het cijferblok op ${breed}x${hoog}: toetsen van minstens 52 px hoog (liggende telefoon 46 px), niets onder de rand, niets buiten het venster`, async ({ page }) => {
      await start(page, breed, hoog);
      await page.goto('./#/meer/vergrendeling');
      await page.getByRole('switch').first().click();
      for (let ronde = 0; ronde < 2; ronde++) for (const c of '123456') await page.locator(`.cijferblok__toets[data-cijfer="${c}"]`).click();
      // BESLISSING 518: na de twee keer zes cijfers de vraag of het toestel mag helpen (hier Nee, als ze er is) en de herstelcode met het vinkje
      const aanbod = page.locator('[data-toestelaanbod]');
      const stap = page.locator('[data-herstelstap]');
      await expect(aanbod.or(stap)).toBeVisible();
      if (await aanbod.isVisible()) await page.getByRole('button', { name: 'Nee, dank je' }).click();
      await expect(stap).toBeVisible();
      await stap.getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
      await stap.getByRole('button', { name: 'Verder' }).click();
      // het slot staat echt aan in de database voor we herladen (een herlading te vroeg breekt de opslag af; geen vaste wachttijd).
      // De app bewaart eerst de pincode en pas daarna slot.aan (src/vergrendeling/scherm.js): slot.aan = true zegt dus dat beide er staan.
      await wachtOpInstelling(page, 'slot.aan', true);
      await page.reload();
      await page.locator('#slot .cijferblok').waitFor();
      // het slot is opgekomen en de toetsen liggen vast (geen vaste wachttijd)
      await animatiesKlaar(page);
      const m = await wachtTotStil(page, () => page.evaluate(() => {
        const toetsen = [...document.querySelectorAll('#slot .cijferblok__toets')].map((e) => e.getBoundingClientRect());
        return {
          aantal: toetsen.length,
          minB: Math.min(...toetsen.map((r) => r.width)),
          minH: Math.min(...toetsen.map((r) => r.height)),
          links: Math.min(...toetsen.map((r) => r.left)),
          rechts: Math.max(...toetsen.map((r) => r.right)),
          onder: Math.max(...toetsen.map((r) => r.bottom)),
          boven: Math.min(...toetsen.map((r) => r.top)),
          vw: window.innerWidth,
          vh: window.innerHeight,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      }));
      expect(m.aantal).toBeGreaterThanOrEqual(10);
      expect(m.minB).toBeGreaterThanOrEqual(56);
      expect(m.minH).toBeGreaterThanOrEqual(44);
      // BESLISSING 536: toetsen 52 px hoog (tikvlak minstens 44 px). BESLISSING 671 (goedgekeurd, wijzigt 308):
      // op een liggende telefoon (breder dan hoog, hoogstens 500 px hoog) zijn de cijfertoetsen 46 px.
      expect(m.minH).toBeGreaterThanOrEqual(breed >= hoog && hoog <= 500 ? 46 : 52);
      expect(m.links).toBeGreaterThanOrEqual(0);
      expect(m.rechts).toBeLessThanOrEqual(m.vw);
      expect(m.boven).toBeGreaterThanOrEqual(0);
      expect(m.onder).toBeLessThanOrEqual(m.vh);
      expect(m.scroll).toBeLessThanOrEqual(0);
    });
  }
});
