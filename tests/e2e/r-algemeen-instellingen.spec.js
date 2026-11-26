// BESLISSING 308: de responsive weergave van Algemeen (#/meer), de instellingenschermen Drinken, Gewicht, Vergrendeling (ook de pincode instellen),
// Naam en profielfoto, Favorieten en Badges, en het welkomscherm, op iPhone en iPad, met aanraking (dus zonder hover).
// Per scherm en breedte: geen horizontale scroll, niets buiten het venster, geen afgebroken, afgekapte of overlappende tekst, tikdoelen van minstens 44 px,
// invoervelden van minstens 16 px, de laatste kaart boven de tabbalk, geen leeg vlak boven 32 px in een kaart, kaarten in één rij die gelijk eindigen
// en geen rij hoger dan 80 px. Verzonnen gegevens: leeg, gewoon (twee badges, drie favorieten) en vol (veel badges, acht favorieten, lange naam, foto).
import { test, expect } from '@playwright/test';
import { ALLE_BADGES } from '../../src/logica/badgeregels.js';
import { buitenVenster, afbrekingen, tikdoelen, laatsteKaartZichtbaar, ongelijkeRijen, horizontaleScroll } from './r-meting.js';
import { zaaiAlgemeen, meetLegeVlakken } from './r-algemeen-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { wachtOpRust, wachtTotStil } from './r-wacht.js';
import { domRustig } from './wacht.js';

const MATEN = [
  [360, 740, 'iPhone klein'], [390, 844, 'iPhone'], [430, 932, 'iPhone Max'], [844, 390, 'iPhone liggend'],
  [744, 1133, 'iPad mini'], [768, 1024, 'iPad'], [810, 1080, 'iPad 10,2'], [820, 1180, 'iPad Air'], [834, 1194, 'iPad Pro 11'], [1024, 1366, 'iPad Pro 12,9'],
  [1133, 744, 'iPad mini liggend'], [1024, 768, 'iPad liggend'], [1080, 810, 'iPad 10,2 liggend'], [1180, 820, 'iPad Air liggend'], [1194, 834, 'iPad Pro 11 liggend'], [1366, 1024, 'iPad Pro 12,9 liggend'],
  [507, 1024, 'iPad gesplitst 507'], [678, 1024, 'iPad gesplitst 678'], [320, 1024, 'iPad slide-over'],
  // 10 px onder en boven de breekpunten
  [710, 900, '710'], [730, 900, '730'], [950, 800, '950'], [970, 800, '970'], [1090, 800, '1090'], [1110, 800, '1110'], [1270, 900, '1270'], [1290, 900, '1290'],
];
const KERN = [390, 744, 1024, 1180, 1366]; // de formaten waarop ook de lege en gewone gebruiker getest worden

// [route, naam, soorten gegevens]
const SCHERMEN = [
  ['meer', 'Algemeen', ['vol', 'leeg', 'gewoon']],
  ['meer/instellingen', 'Drinken (instellingen)', ['gewoon']],
  ['meer/gewicht', 'Gewicht (instellingen)', ['gewoon']],
  ['meer/vergrendeling', 'Vergrendeling', ['gewoon']],
  ['meer/profiel', 'Naam en profielfoto', ['vol', 'leeg', 'gewoon']],
  ['meer/favorieten', 'Favorieten', ['vol', 'leeg', 'gewoon']],
  ['meer/badges', 'Badges', ['vol', 'leeg', 'gewoon']],
];

// Invoervelden met een letter kleiner dan 16 px (Safari zoomt dan in).
const kleineLetters = (page) =>
  page.evaluate(() => {
    const uit = [];
    for (const e of document.querySelectorAll('#scherm input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), #scherm select, #scherm textarea, #slot input, .welkom input')) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || e.getBoundingClientRect().width < 1) continue;
      if (parseFloat(s.fontSize) < 16) uit.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${s.fontSize}`);
    }
    return uit;
  });

// Tekst die over andere tekst of over een icoon loopt: blaadjes (elementen met eigen tekst) waarvan de vakken elkaar raken.
const overlappen = (page, wortel = '#scherm') =>
  page.evaluate((sel) => {
    const uit = [];
    const houder = document.querySelector(sel);
    const lijst = [];
    // Aantoonbaar visueel verborgen: een vak van hooguit 2 x 2 px dat door overflow en een clip of clip-path wordt afgeknipt (de toelichting bij een optie in Welkom, BESLISSING 513,
    // scherm-algemeen.css: 1 x 1 px, clip-path inset(50%)), zelf of via een voorouder binnen de houder. Alleen die vorm telt; een gewoon klein element blijft meetellen.
    const visueelVerborgen = (e) => {
      for (let p = e; p && p !== houder; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const pr = p.getBoundingClientRect();
        if (pr.width <= 2 && pr.height <= 2 && ps.overflow !== 'visible' && (ps.clipPath !== 'none' || ps.clip !== 'auto')) return true;
      }
      return false;
    };
    for (const e of houder.querySelectorAll('*')) {
      if (e.closest('.is-meet, [hidden], .medaille-tip, svg, .sr-only, .alleen-lezer, dialog:not([open])') || visueelVerborgen(e)) continue; // schermlezertekst (.alleen-lezer, BESLISSING 495) en visueel verborgen tekst zijn geen opmaakfout
      const eigen = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
      if (!eigen) continue;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0) continue;
      // het vak van de tekst zelf (niet van het blok eromheen)
      const bereik = document.createRange();
      bereik.selectNodeContents(e);
      const rects = [...bereik.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (!rects.length) continue;
      lijst.push({ e, rects });
    }
    for (let i = 0; i < lijst.length; i++) {
      for (let j = i + 1; j < lijst.length; j++) {
        const a = lijst[i];
        const b = lijst[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const raak = a.rects.some((r1) => b.rects.some((r2) => Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left) > 2 && Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top) > 3));
        if (raak) uit.push(`${String(a.e.className).split(' ')[0] || a.e.tagName} "${a.e.textContent.trim().slice(0, 18)}" / ${String(b.e.className).split(' ')[0] || b.e.tagName} "${b.e.textContent.trim().slice(0, 18)}"`);
      }
    }
    return uit.slice(0, 10);
  }, wortel);

// Inhoud die rechts of links buiten zijn kaart valt (een rij medailles die over de rand loopt).
const uitDeKaart = (page) =>
  page.evaluate(() => {
    const uit = [];
    for (const k of document.querySelectorAll('#scherm .kaart')) {
      if (k.offsetParent === null) continue;
      const r = k.getBoundingClientRect();
      for (const e of k.querySelectorAll('*')) {
        if (e.closest('.medaille-tip, [hidden], .is-meet') || e.matches('svg, path, g, use, .icoonknop')) continue; // de icoonknoppen (bewerken, weghalen) hebben een groter tikvlak dan hun zichtbare icoon en reiken met opzet in de rand
        const s = getComputedStyle(e);
        if (s.position === 'absolute' && e.matches('::after') || s.display === 'none' || s.visibility === 'hidden') continue;
        const b = e.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        if (b.right > r.right + 1 || b.left < r.left - 1) uit.push(String(k.className).split(' ').slice(0, 2).join('.') + ' > ' + String(e.className).split(' ')[0] + ' ' + Math.round(b.left) + '..' + Math.round(b.right) + ' (kaart ' + Math.round(r.left) + '..' + Math.round(r.right) + ')');
      }
    }
    return uit.slice(0, 6);
  });

// Rijen rekken nooit: een rij hoger dan 80 px mag alleen hoger zijn omdat haar inhoud (twee of drie regels tekst) hoger is; staat er meer dan 2 x 12 px lucht
// om haar inhoud, dan is ze uitgerekt.
const hogeRijen = (page) =>
  page.evaluate(() => {
    const uit = [];
    for (const e of document.querySelectorAll('#scherm .rij, #scherm .meer__favrij, #scherm .slot__optie')) {
      if (e.offsetParent === null || e.closest('.medaille-tip')) continue;
      const r = e.getBoundingClientRect();
      let boven = Infinity;
      let onder = -Infinity;
      for (const k of e.querySelectorAll('*')) {
        const kr = k.getBoundingClientRect();
        if (kr.height < 1 || kr.width < 1) continue;
        boven = Math.min(boven, kr.top);
        onder = Math.max(onder, kr.bottom);
      }
      const lucht = r.height - (onder - boven);
      if (r.height > 80.5 && lucht > 28) uit.push(`${String(e.className).split(' ')[0]} ${Math.round(r.height)} px (inhoud ${Math.round(onder - boven)})`);
    }
    return uit.slice(0, 8);
  });

async function begin(page, route, soort) {
  await vasteKlok(page); // do 12 november 2026, 12:00: de datums "Behaald op ..." hangen niet van de rundag af
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await zaaiAlgemeen(page, soort ?? 'gewoon', ALLE_BADGES.map((b) => b.id));
  await page.goto('./#/' + route);
  await expect(page.locator('#scherm h1').first()).toBeVisible();
  await wachtOpRust(page); // de kaarten komen zacht op en het glas en de cijfers tellen op
}

async function meetAlles(page, soort, uitzonderingen = /$^/) {
  // de lange favoriet op Algemeen staat bewust op één regel met een afkapping (...): een kaart met rijen van gelijke hoogte
const geheel = { scroll: await horizontaleScroll(page), buiten: (await buitenVenster(page)).filter((x) => !/^(g|path)\.\[object/.test(x)) /* de golf van het water in het glas loopt breder dan haar svg en wordt erdoor afgeknipt */, afbrekingen: (await afbrekingen(page)).filter((x) => !/Pasta met groenten/.test(x)), overlap: await overlappen(page), letters: await kleineLetters(page), hoogteRij: await hogeRijen(page), uitKaart: await uitDeKaart(page) };
  expect.soft(geheel, 'scroll, buiten het venster, afbrekingen, overlappende tekst, kleine letters, hoge rijen').toEqual({ scroll: [], buiten: [], afbrekingen: [], overlap: [], letters: [], hoogteRij: [], uitKaart: [] });
  expect.soft(await tikdoelen(page, { wortel: '#scherm' }), 'tikdoelen').toEqual([]);
  // Op Favorieten en Gewicht (het voorbeeld is zo hoog als zijn inhoud en staat bovenaan; bij Favorieten loopt het over twee kaarten en is zo hoog als zijn inhoud) en op Drinken, Vergrendeling en Naam en profielfoto staat "Goed om te weten" links onder de kaart met de instellingen, in het vlak dat zo hoog is als het voorbeeld: de kaart zelf eindigt dan hoger dan het voorbeeld (ontwerp van BESLISSING 231 en 232).
  expect.soft((await ongelijkeRijen(page)).filter((x) => !/^(instellingen__(drinken|profiel|gewicht)|slot__kaart|favorieten__nieuw|favorieten__lijst) /.test(x)), 'kaarten in één rij eindigen gelijk').toEqual([]);
  const kaarten = await page.evaluate(meetLegeVlakken, '#scherm');
  // Een medaillekaart staat met haar buur in één rij en rekt mee tot diens hoogte (kaarten in één rij eindigen gelijk). Heeft de buur
  // twee tekstregels meer (een naam en een datum die afbreken, bv. op 360 px "Twee weken op rij" naast "Drie op rij"), dan staat
  // onder de kortere kaart tot ± 46 px lucht. Die lucht komt van het gelijk eindigen, niet van de kaart zelf: tel ze niet mee,
  // de kaart op haar eigen hoogte mag nog steeds geen leeg vlak boven 34 px hebben.
  const rek = await page.evaluate(() =>
    [...document.querySelectorAll('#scherm .kaart')].filter((k) => k.offsetParent !== null).map((k) => {
      if (!k.classList.contains('medaillekaart')) return 0;
      const voor = k.getBoundingClientRect().height;
      const oud = k.style.cssText;
      k.style.alignSelf = 'start';
      k.style.height = 'auto';
      // .medaillekaart deelt haar drie rijen met haar buren (subgrid): met eigen rijen heeft ze haar eigen hoogte
      k.style.gridTemplateRows = 'none';
      k.style.gridRow = 'auto';
      const eigen = k.getBoundingClientRect().height;
      k.style.cssText = oud;
      return Math.max(0, voor - eigen);
    }),
  );
  const leeg = kaarten.map((k, i) => ({ ...k, gat: k.gat - (rek[i] ?? 0) })).filter((k) => k.gat > 34 && soort !== 'leeg' && !uitzonderingen.test(k.naam)).map((k) => `${k.naam}: ${Math.round(k.gat)} px tussen ${k.tussen}`);
  expect.soft(leeg, 'leeg vlak in een kaart').toEqual([]);
  expect.soft(await laatsteKaartZichtbaar(page), 'laatste kaart boven de tabbalk').toEqual([]);
}

for (const [breedte, hoogte, naam] of MATEN) {
  test.describe(`${naam} ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: breedte < 600 || hoogte < 500 });

    for (const [route, schermNaam, soorten] of SCHERMEN) {
      for (const soort of soorten) {
        if (soort !== 'vol' && soorten.length > 1 && !KERN.includes(breedte)) continue;
        test(`${schermNaam} (${soort})`, async ({ page }) => {
          await begin(page, route, soort);
          // een lege lijst (Favorieten zonder favorieten, Badges zonder badges) mag ruimte laten: de rustige lege toestand is een eigen ontwerp
          await meetAlles(page, soort, soort === 'leeg' ? /favorieten|badge/ : /$^/);
        });
      }
    }

    test('Vergrendeling: de pincode instellen (cijferblok) past en blijft boven de tabbalk', async ({ page }) => {
      await begin(page, 'meer/vergrendeling', 'gewoon');
      await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).tap();
      await expect(page.locator('.cijferblok')).toBeVisible();
      // het cijferblok is opgekomen en het scherm is uitgebouwd (geen vaste wachttijd)
      await wachtOpRust(page);
      await domRustig(page);
      const geheel = { scroll: await horizontaleScroll(page), buiten: await buitenVenster(page), afbrekingen: await afbrekingen(page), overlap: await overlappen(page), letters: await kleineLetters(page) };
      expect(geheel, 'scroll, buiten het venster, afbrekingen, overlappende tekst, kleine letters').toEqual({ scroll: [], buiten: [], afbrekingen: [], overlap: [], letters: [] });
      expect(await tikdoelen(page, { wortel: '#scherm' }), 'tikdoelen').toEqual([]);
      // het cijferblok: elke toets minstens 44 px en minstens 8 px tussen de toetsen
      const m = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.cijferblok__toets')].map((e) => e.getBoundingClientRect());
        const kleinste = Math.min(...t.map((r) => Math.min(r.width, r.height)));
        const kb = document.querySelector('.cijferblok').getBoundingClientRect();
        const tab = document.querySelector('#tabbalk');
        const grens = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight;
        return { aantal: t.length, kleinste: Math.round(kleinste), rechts: Math.round(kb.right), links: Math.round(kb.left), breedte: innerWidth, onder: Math.round(kb.bottom), grens: Math.round(grens) };
      });
      expect(m.aantal, "cijfertoetsen").toBeGreaterThanOrEqual(10);
      expect(m.kleinste, 'kleinste cijfertoets').toBeGreaterThanOrEqual(44);
      expect(m.links).toBeGreaterThanOrEqual(0);
      expect(m.rechts).toBeLessThanOrEqual(m.breedte);
      // het cijferblok is bereikbaar: na scrollen ligt elke toets in beeld en niets (de tabbalk) ligt erover
      for (const nr of [0, 4, 9]) {
        const toets = page.locator('.cijferblok__toets').nth(nr);
        await toets.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await wachtTotStil(page, () => toets.boundingBox()); // de pagina schuift niet meer (geen vaste wachttijd)
        const bovenaan = await toets.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return e === el || el.contains(e);
        });
        expect(bovenaan, `toets ${nr} ligt vrij van de tabbalk`).toBe(true);
      }
    });

    // De medaille-tip op aanraking: een tik opent hem, hij valt binnen het venster, niets bedekt hem en een tik ernaast sluit hem.
    for (const pad of ['meer', 'meer/badges']) {
      test(`#/${pad}: een tik op een medaille opent de tip binnen het venster, een tik ernaast sluit hem`, async ({ page }) => {
        // plaats() in src/ui/medaille.js neemt de bovenkant van de tabbalk als ondergrens: ook op een telefoon liggend (390 px hoog) valt het kaartje helemaal boven de tabbalk.
                await begin(page, pad, 'vol');
        const wortel = pad === 'meer' ? '.meer__badges' : '.badgescherm';
        if (pad === 'meer/badges') {
          // Op het scherm Badges opent een tik op een medaillekaart een blad met de medaille (geen zwevend kaartje): het blad valt binnen het venster en sluit met een tik ernaast.
          await page.locator('.medaillekaart').first().scrollIntoViewIfNeeded();
          await page.locator('.medaillekaart').first().tap({ timeout: 5000 });
          await expect(page.locator('dialog[open] .medailleblad')).toBeVisible();
          // het blad is opgekomen en ligt stil (geen vaste wachttijd)
          await wachtOpRust(page);
          const bl = await wachtTotStil(page, () => page.locator('dialog[open] .dialoog__blad').boundingBox());
          expect(bl.x).toBeGreaterThanOrEqual(-0.5);
          expect(bl.x + bl.width).toBeLessThanOrEqual(breedte + 0.5);
          expect(bl.y + bl.height).toBeLessThanOrEqual(hoogte + 0.5);
          await page.touchscreen.tap(2, 2);
          await expect(page.locator('dialog[open]')).toHaveCount(0);
          return;
        }
        const aantal = Math.min(await page.locator(`${wortel} .medaille-hover:visible`).count(), 5);
        expect(aantal).toBeGreaterThan(0);
        for (let i = 0; i < aantal; i++) {
          const el = page.locator(`${wortel} .medaille-hover:visible`).nth(i);
          await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
          await wachtTotStil(page, () => el.boundingBox()); // de pagina schuift niet meer voor de tik (geen vaste wachttijd)
          await el.tap({ timeout: 5000 });
          await expect(page.locator('.medaille-hover.is-uitleg .medaille-tip'), `tip ${i} is open na een tik`).toHaveCount(1);
          // het kaartje is opgekomen en op zijn plek geschoven (geen vaste wachttijd)
          await wachtOpRust(page);
          await wachtTotStil(page, () => page.locator('.medaille-hover.is-uitleg .medaille-tip').boundingBox());
          const fout = await page.evaluate(() => {
            const tip = document.querySelector('.medaille-hover.is-uitleg .medaille-tip');
            const r = tip.getBoundingClientRect();
            const tab = document.querySelector('#tabbalk');
            const onder = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight;
            if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5) return `buiten het venster ${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)}`;
            if (r.bottom > onder + 0.5) return `onder de tabbalk ${Math.round(r.bottom)} > ${Math.round(onder)}`;
            const pts = [[r.left + 10, r.top + 10], [r.right - 10, r.top + 10], [r.left + 10, r.bottom - 10], [r.right - 10, r.bottom - 10], [r.left + r.width / 2, r.top + r.height / 2]];
            const slecht = pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !tip.contains(e); });
            return slecht.length ? `${slecht.length} punten bedekt` : '';
          });
          expect(fout, `tip ${i}`).toBe('');
          // een tik naast de medaille (op de pagina-achtergrond bovenaan) sluit de tip
          await page.touchscreen.tap(2, 2);
          await expect(page.locator('.medaille-hover.is-uitleg'), `tip ${i} sluit na een tik ernaast`).toHaveCount(0);
          await wachtOpRust(page); // het sluiten is voorbij voor de volgende tik (geen vaste wachttijd)
        }
      });
    }

    test('Welkom: de kaart staat gecentreerd, niet breder dan 520 px, en alles past', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: breedte < 600 || hoogte < 500, storageState: { cookies: [], origins: [] }, locale: 'nl-BE', timezoneId: 'Europe/Brussels' });
      const page = await ctx.newPage();
      await page.goto('http://localhost:' + (process.env.PW_POORT || '4173') + '/');
      await expect(page.locator('.welkom__kaart')).toBeVisible();
      await wachtOpRust(page); // de kaart is opgekomen (geen vaste wachttijd)
      for (const stap of [1, 2, 3, 4]) { // BESLISSING 444: de laatste stap is Bloei vergrendelen (stap 2 is sinds 0.4.5 de geboortedatum; geen weegdag sinds 0.6.3)
        if (stap === 2) {
          await page.getByRole('textbox', { name: 'Je naam' }).fill('Een heel erg lange naam van dertig');
          await page.getByRole('button', { name: 'Verder' }).tap();
        }
        if (stap >= 3) await page.getByRole('button', { name: 'Verder' }).tap();
        // de overgang naar deze stap is voorbij en de kaart ligt stil (geen vaste wachttijd)
        await expect(page.getByText(`Stap ${stap} van 4`)).toBeVisible();
        await wachtOpRust(page);
        await wachtTotStil(page, () => page.locator('.welkom__kaart').boundingBox());
        const geheel = { scroll: await horizontaleScroll(page), buiten: await buitenVenster(page), afbrekingen: await afbrekingen(page, '.welkom'), overlap: await overlappen(page, '.welkom'), letters: await kleineLetters(page) };
        expect(geheel, `stap ${stap}: scroll, buiten, afbrekingen, overlap, letters`).toEqual({ scroll: [], buiten: [], afbrekingen: [], overlap: [], letters: [] });
        expect(await tikdoelen(page, { wortel: '.welkom' }), `stap ${stap}: tikdoelen`).toEqual([]);
        const k = await page.locator('.welkom__kaart').boundingBox();
        // BESLISSING 672 (goedgekeurd, de regels van 660 tot 664): op een liggende telefoon staat het welkomscherm in twee even brede kolommen van
        // hoogstens 21rem met 32 px ertussen en 16 px binnenruimte, dus de kaart is daar hoogstens 2 x 336 + 32 + 2 x 16 = 736 px breed
        // (scherm-algemeen.css, zelfde voorwaarde: breder dan hoog en hoogstens 500 px hoog). Op elke andere maat blijft de grens 520 px.
        const liggendeTelefoon = breedte >= hoogte && hoogte <= 500;
        expect(k.width, `stap ${stap}: kaartbreedte`).toBeLessThanOrEqual(liggendeTelefoon ? 736.5 : 520.5);
        expect(Math.abs(k.x + k.width / 2 - breedte / 2), `stap ${stap}: gecentreerd`).toBeLessThanOrEqual(1.5);
        // de kaart staat ook onder en boven het midden van het venster in balans als ze lager is dan het venster
        const verder = page.locator('.welkom__knoppen .knop--primair').first();
        await verder.scrollIntoViewIfNeeded();
        const kn = await verder.boundingBox();
        expect(kn.y + kn.height, `stap ${stap}: de hoofdknop is bereikbaar`).toBeLessThanOrEqual(hoogte + 0.5);
      }
      await ctx.close();
    });
  });
}

// Het schermtoetsenbord: een venster zonder de onderste ± 300 px (staand) of 190 px (liggend). De knop moet bereikbaar zijn.
for (const [breedte, hoogte, toets] of [[390, 844, 336], [430, 932, 336], [844, 390, 200], [768, 1024, 400]]) {
  test.describe(`toetsenbord ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: breedte < 600 || hoogte < 500 });
    test('Welkom: met het toetsenbord open is Verder bereikbaar', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: breedte, height: hoogte - toets }, hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] }, locale: 'nl-BE' });
      const page = await ctx.newPage();
      await page.goto('http://localhost:' + (process.env.PW_POORT || '4173') + '/');
      await expect(page.locator('.welkom__kaart')).toBeVisible();
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      const verder = page.getByRole('button', { name: 'Verder' });
      await verder.scrollIntoViewIfNeeded();
      const kn = await verder.boundingBox();
      expect(kn.y + kn.height, 'Verder binnen het zichtbare deel').toBeLessThanOrEqual(hoogte - toets + 0.5);
      expect(kn.y).toBeGreaterThanOrEqual(0);
      await ctx.close();
    });
  });
}

// Steekproeven in Salie en Nacht.
for (const thema of ['salie', 'nacht']) {
  for (const [breedte, hoogte] of [[390, 844], [820, 1180], [1180, 820]]) {
    test.describe(`${thema} ${breedte}x${hoogte}`, () => {
      test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: breedte < 600 });
      for (const [route, schermNaam] of [['meer', 'Algemeen'], ['meer/profiel', 'Profiel'], ['meer/badges', 'Badges']]) {
        test(`${schermNaam}`, async ({ page }) => {
          await page.addInitScript((t) => localStorage.setItem('bloei-thema', t), thema);
          await begin(page, route, 'vol');
          await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), thema);
          await meetAlles(page, 'vol');
        });
      }
    });
  }
}

// Het brede scherm (1690 x 950, met muis) met een gebruiker met veel badges (alle 33): de rij kleine medailles op Algemeen blijft binnen haar kaart,
// de pagina is niet breder dan het venster en de kaarten Badges en Favorieten overlappen niet.
test.describe('breed 1690x950 (muis)', () => {
  test.use({ viewport: { width: 1690, height: 950 }, hasTouch: false, isMobile: false });
  for (const [route, schermNaam] of [['meer', 'Algemeen'], ['meer/badges', 'Badges'], ['meer/favorieten', 'Favorieten']]) {
    test(`${schermNaam}: veel badges, geen overloop`, async ({ page }) => {
      await begin(page, route, 'vol');
      expect.soft(await horizontaleScroll(page), 'horizontale scroll').toEqual([]);
      expect.soft(await uitDeKaart(page), 'inhoud buiten zijn kaart').toEqual([]);
      expect.soft(await buitenVenster(page), 'buiten het venster').toEqual([]);
      if (route === 'meer') {
        const m = await page.evaluate(() => {
          const rij = document.querySelector('.meer__kleinemedailles');
          const kaart = document.querySelector('.meer__badges').getBoundingClientRect();
          const zichtbaar = [...rij.children].filter((e) => e.offsetParent !== null);
          return { rechts: Math.max(...zichtbaar.map((e) => e.getBoundingClientRect().right)), kaartRechts: kaart.right, aantal: zichtbaar.length };
        });
        expect.soft(m.rechts, 'de laatste kleine medaille valt binnen de kaart').toBeLessThanOrEqual(m.kaartRechts);
        expect.soft(m.aantal, 'zeven kleine medailles en "+ n" op het brede scherm').toBe(8);
      }
    });
  }
});
