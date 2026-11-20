// BESLISSING 363: de telefoon (onder 720 px) op 390x844, 360x740 en 430x932, met aanraking en met drie soorten verzonnen gegevens (leeg, gewoon, vol).
// Op elk scherm met een blok "Goed om te weten" is dat blok het laatste van het scherm; tussen opeenvolgende kaarten en blokken is de afstand overal gelijk
// (± 2 px); geen leeg vlak boven 32 px in een kaart; geen twee bedienbare onderdelen dichter dan 8 px; niets buiten het venster; en de laatste kaart staat
// volledig boven de tabbalk op dezelfde afstand als tussen kaarten (16 px).
import { test, expect } from '@playwright/test';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { meetLegeVlakken } from './r-algemeen-gegevens.js';
import { meetPagina } from './r-tabbladen-meting.js';
import { horizontaleScroll, buitenVenster } from './r-meting.js';
import { wachtTotStil } from './r-wacht.js';

const MATEN = [[390, 844], [360, 740], [430, 932]];
const SCHERMEN = [
  ['vandaag', false], ['dagboek', false], ['dagboek/week', false], ['dagboek/maand', false], ['drinken', true], ['supplementen', false], ['gewicht', true],
  ['meer', false], ['meer/instellingen', true], ['meer/gewicht', true], ['meer/vergrendeling', true], ['meer/profiel', true], ['meer/favorieten', true],
  ['meer/badges', false], ['meer/meldingen', true], ['meer/uitleg', true], ['delen', true],
];
// [route, naam]: het kopblok van een scherm telt niet mee in de afstanden tussen kaarten (de ruimte onder de titel is voor alle schermen gelijk).
const KOP = /schermkop|dagboek__kop|vandaag__begroeting/;
// Bewuste uitzonderingen (zie het rapport): de tikvlakken van een kalenderdag, een dagnaam in de maand, een rij van een lijst (een rij is 48 tot 64 px hoog en de lijn
// ligt tussen twee rijen), een keuzevak en de naam in het dagschema liggen 1 tot 6 px uit elkaar, maar het zichtbare vlak (rondje, lijn of vlak) ligt er ruim 8 px vandaan.
const DICHT_OK = /kalender__dag|mk__dag|button.maand__beurt|button.dagdrank|button\.icoonknop \/ button\.icoonknop|button\.rij \/ button\.rij|button\.chip \/ button\.chip|a\.week__link \/ a\.week__link|schema__knop/; // week-stippen: twee volle tikvlakken van 44 px naast elkaar (z-toegankelijkheid eist 44 px); het zichtbare bolletje ligt er ruim vandaan
const LEEG_OK = /favorieten__lijst|wk__schemakaart|supplementen__uitleg|overzichtkaart|gewichtgrafiek|stemmingkaart|instellingen__gewicht|drinken__cijferkaart|weekkaart|drinkkaart|kalkaart|vc--kalender|badgehero|kaart--knop/;

async function open(page, route) {
  await page.goto(`./#/${route}`);
  await page.locator(`#scherm[data-scherm]`).waitFor({ state: 'attached' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.vieringhouder').forEach((e) => e.remove())); // de viering van een nieuwe badge ligt over de kaarten
}

// De blokken van het scherm, van boven naar beneden, met bovenkant en onderkant.
const blokken = (page) =>
  page.evaluate(() => {
    const zicht = (e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const naam = (e) => String(e.className).split(' ').filter(Boolean).slice(0, 2).join('.') || e.tagName.toLowerCase();
    const kies = '.kaart, .instel__weetjes, .instel__voorbeeld, .badgehero, .badgegroep, .meldingen .instel__lijst, .meldingen__goed, .delen__uitleg, .wk__samenvatting, .bladerkop, .dag__naarvandaag, .sup-knoprij, .suppraster, .drinken__lijst, .drinken__week, .drinken__cijfers, .vandaag__begroeting, .schermkop, .dagboek__kop, .maand__kolommen';
    const alle = [...document.querySelectorAll('#scherm ' + kies.split(', ').join(', #scherm '))].filter(zicht);
    let lijst = alle.filter((e) => !alle.some((o) => o !== e && o.contains(e) && !o.matches('.instelscherm')));
    lijst = lijst.filter((e) => !lijst.some((o) => o !== e && o.contains(e)));
    // De onderkant van een kaart met een eigen vlak is haar rand; een deel zonder eigen vlak (een stuk van een instelscherm) eindigt waar zijn laatste inhoud eindigt.
    const onderkant = (e) => {
      const st = getComputedStyle(e);
      const heeftVlak = st.backgroundColor !== 'rgba(0, 0, 0, 0)' || st.boxShadow !== 'none';
      const rb = e.getBoundingClientRect().bottom;
      if (heeftVlak || !e.closest('.instelscherm')) return rb;
      let diepste = 0;
      for (const d of e.querySelectorAll('*')) {
        const ds = getComputedStyle(d);
        const b = d.getBoundingClientRect();
        if (b.height < 1 || b.width < 1 || ds.display === 'none' || ds.visibility === 'hidden') continue;
        if (d.children.length > 0 && ds.backgroundColor === 'rgba(0, 0, 0, 0)' && ds.borderBottomWidth === '0px') continue;
        diepste = Math.max(diepste, b.bottom);
      }
      return diepste || rb;
    };
    const m = lijst.map((e) => {
      const r = e.getBoundingClientRect();
      return { n: naam(e), t: r.top + scrollY, b: onderkant(e) + scrollY, l: r.left, r: r.right };
    });
    // in een instelscherm (één kaart) tellen de delen binnen die kaart, in Herinneringen de losse kaarten
    return m.sort((a, b) => a.t - b.t || a.l - b.l);
  });

const gaten = (m) => {
  const uit = [];
  for (let i = 1; i < m.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const ov = Math.min(m[i].r, m[j].r) - Math.max(m[i].l, m[j].l);
      if (ov > 100 && m[j].b <= m[i].t + 1) {
        if (!KOP.test(m[j].n)) uit.push({ van: m[j].n, naar: m[i].n, gat: Math.round(m[i].t - m[j].b) });
        break;
      }
    }
  }
  return uit;
};

// Het blok "Goed om te weten" en alles wat er (zichtbaar) onder staat.
const weetjesOnder = (page) =>
  page.evaluate(() => {
    const zicht = (e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const koppen = [...document.querySelectorAll('#scherm .kaartkop, #scherm .label, #scherm h2, #scherm h3')].filter((e) => zicht(e) && /^goed om te weten$/i.test(e.textContent.trim()));
    const uit = { aantal: koppen.length, onder: [] };
    for (const k of koppen) {
      const blok = k.closest('.kaart, .instel__weetjes, .meldingen__goed') ?? k.parentElement;
      const eind = blok.getBoundingClientRect().bottom + scrollY;
      for (const o of document.querySelectorAll('#scherm *')) {
        if (blok.contains(o) || o.contains(blok) || !zicht(o)) continue;
        if (o.children.length > 0 && !o.matches('button, a, svg')) continue;
        if (getComputedStyle(o).position === 'fixed') continue;
        if (o.closest('.verslagvel')) continue; // het verslagvel (Delen) scrolt binnenin: wat onder zijn rand ligt, is niet zichtbaar
        if (o.getBoundingClientRect().bottom + scrollY > eind + 2) uit.onder.push(String(o.className).split(' ')[0] || o.tagName.toLowerCase());
      }
    }
    return uit;
  });

for (const [breed, hoog] of MATEN) {
  test.describe(`telefoon ${breed}x${hoog}`, () => {
    test.use({ viewport: { width: breed, height: hoog }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    for (const soort of ['leeg', 'gewoon', 'vol']) {
      test(`${soort}: "Goed om te weten" onderaan, gelijke ruimte, geen lege vlakken`, async ({ page }) => {
        test.setTimeout(240000);
        await vasteKlok(page); // vulGegevens zaait rond 'nu': een vaste dag en een vast uur (BESLISSING 408)
        await page.goto('./');
        await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
        await vulGegevens(page, soort);
        const fouten = [];
        for (const [route, heeftWeetjes] of SCHERMEN) {
          await open(page, route);
          const wat = `${route}/${soort}`;
          // 1. "Goed om te weten" is het laatste blok van het scherm
          const w = await weetjesOnder(page);
          if (heeftWeetjes && w.aantal === 0) fouten.push(`${wat}: geen blok "Goed om te weten" gevonden`);
          if (w.onder.length) fouten.push(`${wat}: onder "Goed om te weten" staat nog ${w.onder.slice(0, 4).join(', ')}`);
          // 2. dezelfde afstand tussen opeenvolgende kaarten en blokken (± 2 px)
          const g = gaten(await blokken(page));
          const eerste = g.length ? g[0].gat : 0;
          // een deel van een instelscherm (één kaart) eindigt op zijn laatste inhoud, die per voorbeeld 1 of 2 px afwijkt: daar ± 4 px
          const marge = route.startsWith('meer/') && route !== 'meer' && route !== 'meer/badges' ? 4 : 2;
          g.filter((x) => Math.abs(x.gat - eerste) > marge).forEach((x) => fouten.push(`${wat}: afstand ${x.van} > ${x.naar} is ${x.gat}, de eerste is ${eerste}`));
          // 3. geen leeg vlak boven 32 px in een kaart
          const leeg = (await page.evaluate(meetLegeVlakken, '#scherm')).filter((v) => v.gat > 32 && !(LEEG_OK.test(v.naam) && v.gat <= 57));
          leeg.forEach((v) => fouten.push(`${wat}: leeg vlak ${Math.round(v.gat)} px in ${v.naam}`));
          // 4. geen twee bedienbare onderdelen dichter dan 8 px
          const m = await meetPagina(page);
          m.dicht.filter((d) => !DICHT_OK.test(d)).forEach((d) => fouten.push(`${wat}: tikdoelen te dicht ${d}`));
          // 5. niets buiten het venster, geen horizontale scroll
          (await horizontaleScroll(page)).forEach((f) => fouten.push(`${wat}: ${f}`));
          (await buitenVenster(page)).forEach((f) => fouten.push(`${wat}: buiten venster ${f}`));
          // 6. de laatste kaart volledig boven de tabbalk, op dezelfde afstand als tussen kaarten (16 px)
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          // meten als de pagina niet meer schuift (een vlotte scroll of een balk die meeschuift; geen vaste wachttijd)
          const rest = await wachtTotStil(page, () => page.evaluate(() => {
            const tab = document.querySelector('#tabbalk');
            const grens = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight;
            const zicht = (e) => e.getBoundingClientRect().height > 1 && getComputedStyle(e).display !== 'none';
            const onder = Math.max(...[...document.querySelectorAll('#scherm .kaart, #scherm .badgegroep, #scherm .instelscherm, #scherm .meldingen__goed')].filter(zicht).map((k) => k.getBoundingClientRect().bottom));
            return Math.round(grens - onder);
          }));
          if (Math.abs(rest - 16) > 2) fouten.push(`${wat}: de laatste kaart staat ${rest} px boven de tabbalk, niet 16`);
        }
        expect(fouten, fouten.join('\n')).toEqual([]);
      });
    }
  });
}

// BESLISSING 382: in het Dagboek (dag) staan de dranken van de kaart Drinken op de telefoon in rijen van drie, elke naam op één regel en gecentreerd onder het icoon.
// Een ander aantal dranken (door de gebruiker ingesteld) houdt het raster van drie kolommen: dat wordt hier met 4 en met 7 dranken nagebootst.
for (const [breed, hoog] of MATEN) {
  test.describe(`dranken in het dagboek ${breed}x${hoog}`, () => {
    test.use({ viewport: { width: breed, height: hoog }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    test('rijen van drie, naam op één regel en gecentreerd onder het icoon, geen horizontale scroll', async ({ page }) => {
      await open(page, 'dagboek');
      const meet = () =>
        page.evaluate(() => {
          const r = (e) => e.getBoundingClientRect();
          const lijst = [...document.querySelectorAll('.dag__drinken .dagdrank')].map((d) => {
            const t = r(d.querySelector('.tegel'));
            const n = r(d.querySelector('.dagdrank__naam'));
            const lh = parseFloat(getComputedStyle(d.querySelector('.dagdrank__naam')).lineHeight) || 0;
            return { y: Math.round(t.top), tx: t.left + t.width / 2, nx: n.left + n.width / 2, nh: n.height, lh, naamRechts: n.right, naamLinks: n.left };
          });
          const kaart = r(document.querySelector('.dag__drinken'));
          return { lijst, kaartL: kaart.left, kaartR: kaart.right, scroll: document.documentElement.scrollWidth - innerWidth };
        });
      const controleer = (m, aantal) => {
        expect(m.lijst.length).toBe(aantal);
        expect(m.scroll).toBeLessThanOrEqual(0);
        const rijen = [...new Set(m.lijst.map((d) => d.y))];
        expect(rijen.length).toBe(Math.ceil(aantal / 3));
        // de rijen bevatten er drie (de laatste de rest), en de iconen van een rij staan in dezelfde kolommen als die van de andere rijen
        const kolommen = [...new Set(m.lijst.map((d) => Math.round(d.tx)))];
        expect(kolommen.length).toBe(Math.min(3, aantal));
        for (const d of m.lijst) {
          expect(d.nh, 'een naam is één regel hoog').toBeLessThanOrEqual((d.lh || 20) + 1);
          expect(Math.abs(d.nx - d.tx), 'naam gecentreerd onder het icoon').toBeLessThanOrEqual(1);
          expect(d.naamLinks).toBeGreaterThanOrEqual(m.kaartL - 1);
          expect(d.naamRechts).toBeLessThanOrEqual(m.kaartR + 1);
        }
        const afstanden = rijen.slice(1).map((y, i) => y - rijen[i]);
        afstanden.forEach((a) => expect(Math.abs(a - afstanden[0])).toBeLessThanOrEqual(1));
      };
      controleer(await meet(), 6);
      // 4 en 7 dranken nagebootst met kopieën van de eerste drank
      await page.evaluate(() => { const l = document.querySelector('.dag__drinken .dagdranken'); l.lastElementChild.remove(); l.lastElementChild.remove(); });
      controleer(await meet(), 4);
      await page.evaluate(() => { const l = document.querySelector('.dag__drinken .dagdranken'); for (let i = 0; i < 3; i++) l.append(l.firstElementChild.cloneNode(true)); });
      controleer(await meet(), 7);
    });
  });
}

// BESLISSING 384: op elke breedte (telefoon, tablet, desktop) staat elk icoon van de kaart Drinken op dezelfde middellijn als zijn eigen naam (± 1 px), de naam op één regel,
// in zes gelijke kolommen over de volle breedte van de kaart (ook de eerste en de laatste: niet aan de kaartrand uitgelijnd).
for (const [breed, hoog] of [[390, 844], [820, 1180], [1135, 800], [1690, 1000]]) {
  test(`dranken in het dagboek op ${breed}: icoon en naam op één middellijn`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await open(page, 'dagboek');
    const m = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      return [...document.querySelectorAll('.dag__drinken .dagdrank')].map((d) => {
        const t = r(d.querySelector('.tegel')), n = r(d.querySelector('.dagdrank__naam'));
        const lh = parseFloat(getComputedStyle(d.querySelector('.dagdrank__naam')).lineHeight) || 20;
        return { dx: t.left + t.width / 2 - (n.left + n.width / 2), nh: n.height, lh, x: t.left + t.width / 2, y: Math.round(t.top) };
      });
    });
    expect(m.length).toBe(6);
    m.forEach((d) => { expect(Math.abs(d.dx)).toBeLessThanOrEqual(1); expect(d.nh).toBeLessThanOrEqual(d.lh + 1); });
    // een rij (op de telefoon twee rijen van drie): de kolommen staan op gelijke afstand van elkaar
    const rij = m.filter((d) => d.y === m[0].y);
    const stap = rij.slice(1).map((d, i) => d.x - rij[i].x);
    stap.forEach((s) => expect(Math.abs(s - stap[0])).toBeLessThanOrEqual(1));
  });
}

// Algemeen: elk label van de kerncijfers bovenaan (ook "Dagen bijgehouden") is volledig leesbaar (niet afgekapt) en alle labels in die rij zijn even hoog.
for (const [breed, hoog] of [[360, 740], [390, 844], [430, 932], [820, 1180], [1180, 900]]) {
  test(`algemeen op ${breed}: kerncijferlabels niet afgekapt, gelijke hoogte`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await vasteKlok(page); // vulGegevens zaait rond 'nu': een vaste dag en een vast uur (BESLISSING 408)
    await page.goto('./');
    await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
    await vulGegevens(page, 'vol');
    await open(page, 'meer');
    const m = await page.evaluate(() =>
      [...document.querySelectorAll('.meer__stats .kerncijfer')].map((k) => {
        const l = k.querySelector('.kerncijfer__tekst > :not(.kerncijfer__waarde)') || k.querySelector('.kerncijfer__tekst > :first-child');
        const lh = parseFloat(getComputedStyle(l).lineHeight) || 16;
        return { t: l.textContent, sw: l.scrollWidth, cw: l.clientWidth, h: Math.round(l.getBoundingClientRect().height), lh, getalTop: Math.round(k.querySelector('.kerncijfer__getal').getBoundingClientRect().top) };
      }),
    );
    expect(m.length).toBe(3);
    m.forEach((d) => { expect(d.sw, d.t).toBeLessThanOrEqual(d.cw); });
    expect(new Set(m.map((d) => d.getalTop)).size, JSON.stringify(m)).toBe(1);
  });
}

// Delen: in het voorbeeldverslag breekt een maaltijdnaam van één woord nooit midden in het woord (hoogte van de naam is één regel).
for (const [breed, hoog] of MATEN) {
  test(`delen op ${breed}: maaltijdnaam in het voorbeeld breekt niet midden in een woord`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await vasteKlok(page); // vulGegevens zaait rond 'nu': een vaste dag en een vast uur (BESLISSING 408)
    await page.goto('./');
    await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
    await vulGegevens(page, 'vol');
    await open(page, 'delen');
    const m = await page.evaluate(() =>
      [...document.querySelectorAll('.verslagvel__rij .verslagvel__naam')].filter((n) => !/\s/.test(n.textContent.trim())).map((n) => ({
        t: n.textContent, h: n.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(n).lineHeight) || 20,
      })),
    );
    expect(m.length).toBeGreaterThan(0);
    m.forEach((d) => expect(d.h, d.t).toBeLessThanOrEqual(d.lh + 1));
  });
}
