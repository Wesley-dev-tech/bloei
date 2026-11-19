// BESLISSING 644: de schermen van het slot passen op een lage telefoon (de zichtbare hoogte met de balken van de browser, CLAUDE.md): alles staat
// samen in beeld zonder scrollen op 320x480, 360x560 en 445x580. Dat gebeurt met kleinere marges, een kleiner logo en kleinere tussenruimtes op lage
// schermen (slot.css, @media (max-height: ...)) en met tikvlakken van minstens 44 px. De letter blijft dezelfde, met een uitzondering die de eigenaar
// goedkeurde (649): onder 500 px zichtbare hoogte staat de uitleg van "Je code niet meer weten" in de kleine letter van de app (14 px). Op 390x660 en
// groter en op desktop verandert er niets: de maten op 390x660, 390x844 en 1280x800 liggen hieronder vast (door de eigenaar goedgekeurd).
// BESLISSING 654: ook liggend (844x390, 667x375; de tekst links en de knoppen rechts, zoals het cijferblok) en in een laag venster op laptop of
// tablet (1280x560, 1024x560: de compacte marges van de lage telefoon) staat alles in beeld zonder scrollen.
// "Je code niet meer weten" in beide methodes (Face ID en Pincode), met en zonder de meldingsregel (ook de langste zin van de terugval), en op
// Android (de langere zinnen met "je vingerafdruk of schermslot"); verder de andere schermen van het slot: de twee wisvragen (met de zin van de
// terugval), "Alles wissen kan hier niet", de herstelcode intikken (met een melding) en een nieuwe code kiezen.
// Schermafbeeldingen alleen op verzoek: SHOTDIR. De maten van elk element als JSON: MATENDIR (om voor en na te vergelijken).
import { test, expect, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { authenticator, rondAf, tik, zetPk } from './slot-hulp.js';
import { TEKSTEN } from '../../src/teksten.js';

const CODE = '123456';
const ANDROID_UA = devices['Pixel 7'].userAgent;
const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });
const FACE = (page) => page.getByRole('radio', { name: /^(Face ID|Vingerafdruk of schermslot)/ });
const LAAG = [[320, 480], [360, 560], [445, 580]];
// Goedgekeurd (649): daar verandert niets. LIGGEND en LAAG_VENSTER: BESLISSING 654.
const GEWOON = [[390, 660], [390, 844], [820, 1180], [1180, 820], [1280, 800], [1440, 900], [1690, 1230]];
const LIGGEND = [[844, 390], [667, 375], [568, 320]];
const LAAG_VENSTER = [[1280, 560], [1024, 560]];
const ALLE = [...LAAG, ...GEWOON, ...LIGGEND, ...LAAG_VENSTER];

// Het slot aanzetten (Pincode of Face ID) met een herstelcode; daarna dicht, zonder dat de vraag van het slotscherm het opent.
async function slotDicht(page, { methode = 'pin', toestel = 'ok' } = {}) {
  await vasteKlok(page);
  await authenticator(page, toestel);
  await page.goto('./#/meer/vergrendeling');
  await schermKlaar(page, '#/meer/vergrendeling');
  if (methode === 'faceid') await FACE(page).click();
  else await SLOT(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  const herstelcode = await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await zetPk(page, 'annuleer');
  await page.reload();
  await expect(page.locator('#slot .cijferblok')).toBeVisible();
  return herstelcode;
}

// Elk zichtbaar onderdeel van het slotscherm met zijn plaats, en wat het slot zelf meet.
async function maten(page) {
  await animatiesKlaar(page);
  return page.evaluate(() => {
    const slot = document.getElementById('slot');
    const binnen = slot.querySelector('.slot__binnen');
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, x: Math.round(b.x * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
    };
    const delen = [...binnen.querySelectorAll('.logo, h1, h2, p, button, input, label, .cijferblok__stippen')]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.parentElement.closest('svg');
      })
      .map((e) => ({
        wat: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '') + (e.textContent.trim() ? ' "' + e.textContent.trim().slice(0, 40) + '"' : ''),
        letter: parseFloat(getComputedStyle(e).fontSize),
        ...r(e),
        // de breedte van de tekst zelf (de langste regel), voor het lege vlak naast een alinea
        ...(e.tagName === 'P' ? (() => { const g = document.createRange(); g.selectNodeContents(e); return { tw: Math.round(g.getBoundingClientRect().width * 10) / 10 }; })() : {}),
      }));
    // de kolommen van het blok (liggend twee, BESLISSING 660), anders leeg
    const stijl = getComputedStyle(binnen);
    const kolommen = stijl.display === 'grid' ? stijl.gridTemplateColumns : '';
    return { vh: window.innerHeight, vw: window.innerWidth, scrollH: slot.scrollHeight, clientH: slot.clientHeight, scrollW: document.documentElement.scrollWidth, binnen: r(binnen), kolommen, delen };
  });
}

// Alles binnen de zichtbare hoogte, geen scroll, tikvlakken van minstens 44 px, geen letter kleiner dan 12 px (--fs-label, de kleinste van de app;
// dat de letters zelf niet veranderen, toont de vergelijking met de vaste maten en de JSON van voor en na).
function pastInBeeld(m, naam) {
  expect.soft(m.scrollH, `${naam}: het slot scrollt niet`).toBeLessThanOrEqual(m.clientH);
  expect.soft(m.scrollW, `${naam}: geen horizontale scroll`).toBeLessThanOrEqual(m.vw);
  for (const d of m.delen) {
    expect.soft(d.top, `${naam}: ${d.wat} begint in beeld`).toBeGreaterThanOrEqual(0);
    expect.soft(d.bottom, `${naam}: ${d.wat} eindigt in beeld`).toBeLessThanOrEqual(m.vh);
    if (d.wat.startsWith('button')) expect.soft(d.h, `${naam}: tikvlak ${d.wat}`).toBeGreaterThanOrEqual(43.5);
    if (!d.wat.startsWith('span.logo')) expect.soft(d.letter, `${naam}: letter ${d.wat}`).toBeGreaterThanOrEqual(12);
  }
}

// De drie knoppen van "Je code niet meer weten" vormen een groep (BESLISSING 522): even breed, op dezelfde lijn gecentreerd; Terug staat in hun midden.
function knoppenGroep(m, naam) {
  const breed = m.delen.filter((d) => d.wat.startsWith('button.knop.knop--primair.knop--breed') || d.wat.startsWith('button.knop.knop--secundair.knop--breed'));
  const terug = m.delen.find((d) => d.wat.startsWith('button.knop.knop--tekst'));
  const midden = (d) => d.x + d.w / 2;
  expect.soft(breed.length, `${naam}: drie knoppen`).toBe(3);
  for (const d of breed) {
    expect.soft(Math.abs(d.w - breed[0].w), `${naam}: ${d.wat} even breed`).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(midden(d) - midden(breed[0])), `${naam}: ${d.wat} gecentreerd`).toBeLessThanOrEqual(1);
  }
  expect.soft(Math.abs(midden(terug) - midden(breed[0])), `${naam}: Terug in het midden van de groep`).toBeLessThanOrEqual(1);
}

// BESLISSING 660 tot 662: liggend en in een laag venster zijn de slotschermen evenredig, met vaste regels in plaats van maten per scherm.
// Liggend: twee kolommen van gelijke breedte (21rem, kleiner als het venster smaller is) met 32 px ertussen, hun middens op dezelfde hoogte; laag venster: een
// kolom. Overal: dezelfde tussenruimte (8 px) tussen alle delen van een kolom, even veel ruimte boven als onder het blok, elke brede knop even breed (liggend
// de kolombreedte, in het lage venster 21rem) en het paar Kopiëren en Bewaren samen ook; per maat dezelfde letter voor titel, tekst en melding.
// De verwachte waarden per maat: kolom (px), knop (px), letters [titel, tekst, melding]. Op 568x320 staat de uitleg van "Je code niet meer weten" in 14 px
// (BESLISSING 649, regel 3 van 660); de uitleg bij een nieuwe herstelcode is overal de kleine letter van de app (.herstel__uitleg).
// BESLISSING 660 tot 664: dezelfde regels staand, op de tablet en op de desktop. Per weergave een set tussenruimtes: t tussen de delen, n binnen een groep
// (knoppen onderling, de laatste knop naar de tekstknop, het label naar zijn veld), logo: de ruimte van het logo naar de titel. Elke brede knop en het paar
// zijn 21rem breed (hoogstens de houder); op het slotscherm met het cijferblok is de knop zo breed als het blok (228 px). De uitleg bij de nieuwe herstelcode
// staat in de letter van de andere teksten; de kleine letter alleen op 320x480 bij "Je code niet meer weten" (649).
const HOOG = { t: 16, n: 8, logo: 24 };
const LAAG_STAAND = { t: 8, n: 4, logo: 8 };
// BESLISSING 676 (3): op 320x480 staat tussen de delen van de korte slotschermen 8 px, binnen een groep 4; alleen "Je code niet meer weten" (kwijt) houdt 4 px tussen de delen (LAAGSTE_KWIJT).
const LAAGSTE = { t: 8, n: 4, logo: 8 };
const LAAGSTE_KWIJT = { t: 4, n: 4, logo: 4 };
// BESLISSING 676 (1): op de staande telefoon (tot 480 px breed, vanaf 390) zijn de brede knoppen 324 px (20,25rem), onder de 330 px van BESLISSING 522; tablet en desktop blijven 21rem.
const TELEFOON = { titel: 22, tekst: 16, melding: 14 };
const DESKTOP = { titel: 24.75, tekst: 18, melding: 15.75 };
const EVENREDIG = {
  '844x390': { kol: 336, knop: 336, titel: 22, tekst: 16, melding: 14 },
  '667x375': { kol: 297.5, knop: 297.5, titel: 22, tekst: 16, melding: 14 },
  '568x320': { kol: 248, knop: 248, titel: 22, tekst: 16, melding: 14 },
  '1280x560': { kol: null, knop: 378, titel: 24.75, tekst: 18, melding: 15.75, herstelKlein: true },
  '1024x560': { kol: null, knop: 357, titel: 23.375, tekst: 17, melding: 14.875, herstelKlein: true },
  '320x480': { kol: null, knop: 288, ...TELEFOON, ...LAAGSTE },
  '360x560': { kol: null, knop: 320, ...TELEFOON, ...LAAG_STAAND },
  '445x580': { kol: null, knop: 324, ...TELEFOON, ...LAAG_STAAND },
  '390x660': { kol: null, knop: 324, ...TELEFOON, ...HOOG },
  '390x844': { kol: null, knop: 324, ...TELEFOON, ...HOOG },
  '820x1180': { kol: null, knop: 336, ...TELEFOON, ...HOOG },
  '1180x820': { kol: null, knop: 357, titel: 23.375, tekst: 17, melding: 14.875, ...HOOG },
  '1280x800': { kol: null, knop: 378, ...DESKTOP, ...HOOG },
  '1440x900': { kol: null, knop: 378, ...DESKTOP, ...HOOG },
  '1690x1230': { kol: null, knop: 378, ...DESKTOP, ...HOOG },
};
const TUSSEN = 8;
// de verwachte tussenruimte voor een deel, naar de soort (zonder set: overal 8 px, liggend en in het lage venster)
const knop = (d) => /^button\.knop/.test(d.wat);
function verwacht(v, vorige, d) {
  if (!v.t) return TUSSEN;
  if (/^h1/.test(d.wat)) return v.logo;
  if (knop(d) && knop(vorige)) return v.n;
  if (/^input/.test(d.wat) && /^label/.test(vorige.wat)) return v.n;
  return v.t;
}
function evenredig(m, maat, naam) {
  const v = maat === '320x480' && /^kwijt/.test(naam) ? { ...EVENREDIG[maat], ...LAAGSTE_KWIJT } : EVENREDIG[maat];
  if (!v) return;
  const midX = m.binnen.x + m.binnen.w / 2;
  const kolommen = m.kolommen ? m.kolommen.trim().split(/\s+/).map(parseFloat) : [];
  // het cijferblok telt als een deel; de stippen en de toetsen niet apart
  const blok = m.delen.filter((d) => /cijferblok__/.test(d.wat));
  const delen = m.delen.filter((d) => !/cijferblok__|alleen-lezer/.test(d.wat));
  if (blok.length) {
    const top = Math.min(...blok.map((d) => d.top)), bottom = Math.max(...blok.map((d) => d.bottom)), x = Math.min(...blok.map((d) => d.x));
    delen.push({ wat: 'cijferblok', top, bottom, x, w: Math.max(...blok.map((d) => d.x + d.w)) - x, h: bottom - top });
  }
  const kol = (links) => delen.filter((d) => !v.kol || (d.x + d.w / 2 < midX) === links).sort((a, b) => a.top - b.top || a.x - b.x);
  const stapel = (lijst, wat) => {
    for (let i = 1; i < lijst.length; i++) {
      if (Math.abs(lijst[i].top - lijst[i - 1].top) < 1) continue; // het paar naast elkaar
      const gat = lijst[i].top - Math.max(...lijst.slice(0, i).map((d) => d.bottom));
      const moet = verwacht(v, lijst[i - 1], lijst[i]);
      expect.soft(Math.abs(gat - moet), `${naam}: tussenruimte ${wat} voor ${lijst[i].wat} (${gat.toFixed(1)} px, verwacht ${moet})`).toBeLessThanOrEqual(1);
    }
    return { top: Math.min(...lijst.map((d) => d.top)), bottom: Math.max(...lijst.map((d) => d.bottom)) };
  };
  const boven = m.binnen.top, onder = m.vh - m.binnen.top - m.binnen.h;
  expect.soft(Math.abs(boven - onder), `${naam}: even veel ruimte boven (${boven}) als onder (${onder}) het blok`).toBeLessThanOrEqual(2);
  if (v.kol) {
    expect.soft(kolommen.length, `${naam}: twee kolommen`).toBe(2);
    // met het cijferblok rechts is de rechterkolom zo breed als het cijferblok (228 px, BESLISSING 536), de linker zoals op elk slotscherm
    const rechtsB = blok.length ? 228 : v.kol;
    // "Een nieuwe code" heeft links geen brede knop: de kolom is niet breder dan haar langste zin (hoogstens 21rem, 336 px)
    const linksB = naam.startsWith('nieuwe code') ? Math.min(kolommen[0], 336) : v.kol;
    expect.soft(Math.abs(kolommen[0] - linksB), `${naam}: linkerkolom ${kolommen[0]} px`).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(kolommen[1] - rechtsB), `${naam}: rechterkolom ${kolommen[1]} px`).toBeLessThanOrEqual(1);
    const L = stapel(kol(true), 'links'), R = stapel(kol(false), 'rechts');
    expect.soft(Math.abs((L.top + L.bottom) / 2 - (R.top + R.bottom) / 2), `${naam}: de twee kolommen op dezelfde middenlijn`).toBeLessThanOrEqual(2);
    // geen groter leeg vlak tussen de kolommen dan hun tussenruimte: links reikt de tekst tot zijn kolomrand, rechts de knoppen
    const rand = m.binnen.x + (m.binnen.w - kolommen[0] - kolommen[1] - 32) / 2 + kolommen[0];
    // (een alinea staat gecentreerd: ze reikt tot de helft van haar langste regel voorbij het midden; een regel valt nooit meer dan een woord korter uit)
    const rechterrand = (d) => (d.tw ? d.x + (d.w + d.tw) / 2 : d.x + d.w);
    const breedLinks = Math.max(...kol(true).map(rechterrand)), breedRechts = Math.min(...kol(false).map((d) => d.x));
    expect.soft(breedRechts - breedLinks, `${naam}: leeg vlak tussen de kolommen`).toBeLessThanOrEqual(32 + 24);
    expect.soft(breedRechts - rand, `${naam}: de rechterkolom begint op haar rand`).toBeLessThanOrEqual(32 + 1);
  } else {
    stapel(kol(true), '');
  }
  // staand, tablet en desktop: op het slotscherm met het cijferblok is de knop zo breed als het blok (228 px, hoogstens de houder)
  // BESLISSING 676 (2): bewuste uitzondering op "een knop die alleen staat is gevuld": "Face ID gebruiken" onder het cijferblok blijft zacht en is 228 px breed.
  const knopB = !v.kol && v.t && naam.startsWith('slotscherm') ? Math.min(228, v.knop) : v.knop;
  for (const d of m.delen.filter((d) => /^button\.knop\.knop--(primair|secundair).*knop--breed/.test(d.wat))) {
    expect.soft(Math.abs(d.w - knopB), `${naam}: knopbreedte ${d.wat} (${d.w} px)`).toBeLessThanOrEqual(1);
  }
  const paar = m.delen.filter((d) => /^button\.knop\.knop--secundair/.test(d.wat) && !/knop--breed/.test(d.wat));
  if (paar.length === 2) expect.soft(Math.abs(paar[1].x + paar[1].w - paar[0].x - v.knop), `${naam}: het paar Kopiëren en Bewaren samen even breed als een knop`).toBeLessThanOrEqual(1);
  // 568x320: de kleine letter voor de hele uitleg van "Je code niet meer weten" en van de nieuwe herstelcode (anders past het niet); in het lage venster
  // staat de uitleg bij de nieuwe herstelcode in de kleine letter, zoals op 1280x800 (BESLISSING 660, regel 4)
  const klein = (maat === '568x320' && /^(kwijt|nieuwe herstelcode)/.test(naam)) || (maat === '320x480' && /^kwijt/.test(naam));
  for (const d of m.delen) {
    if (/^h1/.test(d.wat)) expect.soft(d.letter, `${naam}: letter titel`).toBe(v.titel);
    if (/^p\.slot__(uitleg|eerlijk)/.test(d.wat)) {
      const herstel = /herstel__uitleg/.test(d.wat) && v.herstelKlein;
      expect.soft(d.letter, `${naam}: letter tekst ${d.wat}`).toBe(klein ? 14 : herstel ? v.melding : v.tekst);
    }
    if (/slot__boodschap/.test(d.wat)) expect.soft(d.letter, `${naam}: letter melding`).toBe(v.melding);
  }
}

async function bewaar(page, naam, m) {
  if (process.env.MATENDIR) writeFileSync(`${process.env.MATENDIR}/${naam}.json`, JSON.stringify(m, null, 1));
  if (!process.env.SHOTDIR) return;
  await page.screenshot({ path: `${process.env.SHOTDIR}/${naam}.png`, scale: 'css' });
  // NACHTMATEN (bv. "390x844,1280x800"): op die maten ook een beeld in het thema Nacht
  const maat = naam.match(/\d+x\d+/)?.[0];
  if (maat && (process.env.NACHTMATEN || '').split(',').includes(maat)) {
    const oud = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'nacht'));
    await animatiesKlaar(page);
    await page.screenshot({ path: `${process.env.SHOTDIR}/${naam}-nacht.png`, scale: 'css' });
    await page.evaluate((t) => (t === null ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', t)), oud);
  }
}

const naarKwijt = async (page) => {
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
};
const bevestigKnop = (page) => page.locator('#slot .slot__wegen .knop').first();

// ---- "Je code niet meer weten": op de lage maten in beeld; op de gewone maten (en desktop) ook, ter vergelijking met de vaste maten ----
for (const android of [false, true]) {
  test.describe(android ? 'Android' : 'iPhone en desktop', () => {
    if (android) test.use({ userAgent: ANDROID_UA });
    for (const methode of ['faceid', 'pin']) {
      for (const [b, h] of ALLE) {
        const naam = `kwijt-${android ? 'android' : 'ios'}-${methode}-${b}x${h}`;
        test(`Je code niet meer weten past in beeld: ${naam}`, async ({ page }) => {
          await page.setViewportSize({ width: b, height: h });
          await slotDicht(page, { methode });
          await naarKwijt(page);
          const zonder = await maten(page);
          await bewaar(page, `${naam}-zonder`, zonder);
          pastInBeeld(zonder, `${naam} zonder melding`);
          evenredig(zonder, `${b}x${h}`, `${naam} zonder melding`);
          // de meldingsregel: bij Face ID de langste zin (de terugval, 638), bij Pincode de gewone (de eenmalige vraag mislukt)
          if (methode === 'pin') await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
          await bevestigKnop(page).click();
          const zin = methode === 'faceid' ? TEKSTEN.slot.toestelTerugval : TEKSTEN.slot.toestelMislukt;
          await expect(page.locator('#slot .slot__boodschap')).toHaveText(zin);
          const met = await maten(page);
          await bewaar(page, `${naam}-met`, met);
          pastInBeeld(met, `${naam} met melding`);
          evenredig(met, `${b}x${h}`, `${naam} met melding`);
          vergelijk(met, `${b}x${h}`, android, methode);
          knoppenGroep(met, `${naam} met melding`);
        });
      }
    }
  });
}

// ---- de andere schermen van het slot ----
for (const [b, h] of ALLE) {
  test(`de andere schermen van het slot passen in beeld (${b}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: b, height: h });
    await slotDicht(page, { methode: 'faceid' });
    // het slotscherm zelf (cijferblok en Face ID), met de melding van een foute code
    await tik(page, '999999');
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TEKSTEN.slot.pinFout);
    let m = await maten(page);
    await bewaar(page, `code-${b}x${h}`, m);
    pastInBeeld(m, `slotscherm ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `slotscherm ${b}x${h}`);
    await naarKwijt(page);
    // de twee wisvragen; de tweede met de zin van de terugval
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await expect(page.getByRole('button', { name: 'Doorgaan' })).toBeVisible();
    m = await maten(page);
    await bewaar(page, `wis1-${b}x${h}`, m);
    pastInBeeld(m, `wis1 ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `wis1 ${b}x${h}`);
    await page.getByRole('button', { name: 'Doorgaan' }).click();
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TEKSTEN.slot.wisTerugval);
    m = await maten(page);
    await bewaar(page, `wis2-${b}x${h}`, m);
    pastInBeeld(m, `wis2 ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `wis2 ${b}x${h}`);
    // de herstelcode intikken, met de melding van een verkeerde vorm
    await page.getByRole('button', { name: 'Laten staan' }).click();
    await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
    await page.getByRole('textbox', { name: 'Herstelcode' }).fill('abc');
    await page.keyboard.press('Enter');
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TEKSTEN.slot.herstelVorm);
    await page.locator('#slot input').blur();
    m = await maten(page);
    await bewaar(page, `invoer-${b}x${h}`, m);
    pastInBeeld(m, `herstelcode intikken ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `herstelcode intikken ${b}x${h}`);
    // een nieuwe code kiezen (na de terugval: de eenmalige weg)
    await page.getByRole('button', { name: 'Terug' }).click();
    await zetPk(page, 'ok');
    await bevestigKnop(page).click();
    await expect(page.getByText(TEKSTEN.slot.nieuweCodeIntro)).toBeVisible();
    m = await maten(page);
    await bewaar(page, `nieuwecode-${b}x${h}`, m);
    pastInBeeld(m, `nieuwe code kiezen ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `nieuwe code kiezen ${b}x${h}`);
  });

  // na de herstelcode en een nieuwe code: de nieuwe herstelcode met Kopiëren, Bewaren als bestand, het vinkje en Verder (liggend in twee kolommen)
  test(`de nieuwe herstelcode na een herstel past in beeld (${b}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: b, height: h });
    const herstelcode = await slotDicht(page);
    await naarKwijt(page);
    await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
    await page.getByRole('textbox', { name: 'Herstelcode' }).fill(herstelcode);
    await page.keyboard.press('Enter');
    await expect(page.getByText(TEKSTEN.slot.nieuweCodeIntro)).toBeVisible();
    await tik(page, '654321');
    await tik(page, '654321');
    await expect(page.locator('#slot [data-herstelstap]')).toBeVisible();
    const m = await maten(page);
    await bewaar(page, `stap-${b}x${h}`, m);
    pastInBeeld(m, `nieuwe herstelcode ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `nieuwe herstelcode ${b}x${h}`);
    // met het vinkje aan: Verder staat alleen en is gevuld (BESLISSING 662); alleen als beeld
    if (process.env.SHOTDIR) {
      await page.locator('#slot [data-herstelstap]').getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
      await expect(page.getByRole('button', { name: 'Verder' })).toBeEnabled();
      await animatiesKlaar(page);
      await page.screenshot({ path: `${process.env.SHOTDIR}/stap-${b}x${h}-vink.png`, scale: 'css' });
    }
  });

  test(`Alles wissen kan hier niet past in beeld (${b}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: b, height: h });
    await slotDicht(page, { toestel: 'geen' });
    await naarKwijt(page);
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await expect(page.getByRole('heading', { name: 'Alles wissen kan hier niet' })).toBeVisible();
    const m = await maten(page);
    await bewaar(page, `kannniet-${b}x${h}`, m);
    pastInBeeld(m, `wissen kan hier niet ${b}x${h}`);
    evenredig(m, `${b}x${h}`, `wissen kan hier niet ${b}x${h}`);
  });
}

// ---- de goedgekeurde maten op 390x660, 390x844 en 1280x800 (met de meldingsregel) veranderen niet ----
// Per onderdeel: boven, hoogte, links en breedte in px (afgerond op 1 px), gemeten voor BESLISSING 644.
// BESLISSING 660 tot 662: de regels liggend en in een laag venster veranderen hier niets (opnieuw gemeten op 18 november).
// BESLISSING 660 tot 664 en 676: staand en op de desktop is elke brede knop 324 px op de staande telefoon (676), 378 op 1280x800; de rest bleef gelijk (gemeten op 18 november).
const VAST = {
  '390x844-ios-faceid': [['span.logo', 125, 40, 138, 114], ['h1.t-h1.slot__titel', 189, 24, 92, 206], ['p.slot__uitleg', 229, 24, 81, 228], ['p.slot__uitleg', 269, 72, 20, 350], ['p.slot__uitleg', 357, 72, 20, 350], ['p.slot__boodschap', 445, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 503, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 559, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 615, 48, 33, 324], ['button.knop.knop--tekst', 671, 48, 164, 63]],
  '390x844-ios-pin': [['span.logo', 125, 40, 138, 114], ['h1.t-h1.slot__titel', 189, 24, 92, 206], ['p.slot__uitleg', 229, 24, 81, 228], ['p.slot__uitleg', 269, 72, 20, 350], ['p.slot__uitleg', 357, 72, 20, 350], ['p.slot__boodschap', 445, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 503, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 559, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 615, 48, 33, 324], ['button.knop.knop--tekst', 671, 48, 164, 63]],
  '390x844-android-faceid': [['span.logo', 125, 40, 138, 114], ['h1.t-h1.slot__titel', 189, 24, 92, 206], ['p.slot__uitleg', 229, 24, 81, 228], ['p.slot__uitleg', 269, 72, 20, 350], ['p.slot__uitleg', 357, 72, 20, 350], ['p.slot__boodschap', 445, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 503, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 559, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 615, 48, 33, 324], ['button.knop.knop--tekst', 671, 48, 164, 63]],
  '390x844-android-pin': [['span.logo', 125, 40, 138, 114], ['h1.t-h1.slot__titel', 189, 24, 92, 206], ['p.slot__uitleg', 229, 24, 81, 228], ['p.slot__uitleg', 269, 72, 20, 350], ['p.slot__uitleg', 357, 72, 20, 350], ['p.slot__boodschap', 445, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 503, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 559, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 615, 48, 33, 324], ['button.knop.knop--tekst', 671, 48, 164, 63]],
  // 390x660 (BESLISSING 649: "ongewijzigd vanaf 390 bij 660"), gemeten voor BESLISSING 654
  '390x660-ios-faceid': [['span.logo', 33, 40, 138, 114], ['h1.t-h1.slot__titel', 97, 24, 92, 206], ['p.slot__uitleg', 137, 24, 81, 228], ['p.slot__uitleg', 177, 72, 20, 350], ['p.slot__uitleg', 265, 72, 20, 350], ['p.slot__boodschap', 353, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 411, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 467, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 523, 48, 33, 324], ['button.knop.knop--tekst', 579, 48, 164, 63]],
  '390x660-ios-pin': [['span.logo', 33, 40, 138, 114], ['h1.t-h1.slot__titel', 97, 24, 92, 206], ['p.slot__uitleg', 137, 24, 81, 228], ['p.slot__uitleg', 177, 72, 20, 350], ['p.slot__uitleg', 265, 72, 20, 350], ['p.slot__boodschap', 353, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 411, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 467, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 523, 48, 33, 324], ['button.knop.knop--tekst', 579, 48, 164, 63]],
  '390x660-android-faceid': [['span.logo', 33, 40, 138, 114], ['h1.t-h1.slot__titel', 97, 24, 92, 206], ['p.slot__uitleg', 137, 24, 81, 228], ['p.slot__uitleg', 177, 72, 20, 350], ['p.slot__uitleg', 265, 72, 20, 350], ['p.slot__boodschap', 353, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 411, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 467, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 523, 48, 33, 324], ['button.knop.knop--tekst', 579, 48, 164, 63]],
  '390x660-android-pin': [['span.logo', 33, 40, 138, 114], ['h1.t-h1.slot__titel', 97, 24, 92, 206], ['p.slot__uitleg', 137, 24, 81, 228], ['p.slot__uitleg', 177, 72, 20, 350], ['p.slot__uitleg', 265, 72, 20, 350], ['p.slot__boodschap', 353, 42, 20, 350], ['button.knop.knop--primair.knop--breed', 411, 48, 33, 324], ['button.knop.knop--primair.knop--breed', 467, 48, 33, 324], ['button.knop.knop--secundair.knop--breed', 523, 48, 33, 324], ['button.knop.knop--tekst', 579, 48, 164, 63]],
  '1280x800-ios-faceid': [['span.logo', 122, 40, 583, 114], ['h1.t-h1.slot__titel', 186, 27, 524, 232], ['p.slot__uitleg', 229, 27, 512, 256], ['p.slot__uitleg', 272, 54, 370, 540], ['p.slot__uitleg', 342, 54, 370, 540], ['p.slot__boodschap', 412, 47, 370, 540], ['button.knop.knop--primair.knop--breed', 475, 45, 451, 378], ['button.knop.knop--primair.knop--breed', 528, 45, 451, 378], ['button.knop.knop--secundair.knop--breed', 581, 45, 451, 378], ['button.knop.knop--tekst', 634, 45, 609, 63]],
  '1280x800-ios-pin': [['span.logo', 133, 40, 583, 114], ['h1.t-h1.slot__titel', 198, 27, 524, 232], ['p.slot__uitleg', 241, 27, 512, 256], ['p.slot__uitleg', 284, 54, 370, 540], ['p.slot__uitleg', 354, 54, 370, 540], ['p.slot__boodschap', 424, 24, 440, 401], ['button.knop.knop--primair.knop--breed', 464, 45, 451, 378], ['button.knop.knop--primair.knop--breed', 516, 45, 451, 378], ['button.knop.knop--secundair.knop--breed', 569, 45, 451, 378], ['button.knop.knop--tekst', 622, 45, 609, 63]],
  '1280x800-android-faceid': [['span.logo', 108, 40, 583, 114], ['h1.t-h1.slot__titel', 172, 27, 524, 232], ['p.slot__uitleg', 216, 27, 512, 256], ['p.slot__uitleg', 259, 54, 370, 540], ['p.slot__uitleg', 329, 81, 370, 540], ['p.slot__boodschap', 426, 47, 370, 540], ['button.knop.knop--primair.knop--breed', 489, 45, 451, 378], ['button.knop.knop--primair.knop--breed', 542, 45, 451, 378], ['button.knop.knop--secundair.knop--breed', 594, 45, 451, 378], ['button.knop.knop--tekst', 647, 45, 609, 63]],
  '1280x800-android-pin': [['span.logo', 120, 40, 583, 114], ['h1.t-h1.slot__titel', 184, 27, 524, 232], ['p.slot__uitleg', 228, 27, 512, 256], ['p.slot__uitleg', 271, 54, 370, 540], ['p.slot__uitleg', 341, 81, 370, 540], ['p.slot__boodschap', 438, 24, 440, 401], ['button.knop.knop--primair.knop--breed', 477, 45, 451, 378], ['button.knop.knop--primair.knop--breed', 530, 45, 451, 378], ['button.knop.knop--secundair.knop--breed', 583, 45, 451, 378], ['button.knop.knop--tekst', 635, 45, 609, 63]],
};
function vergelijk(m, maat, android, methode) {
  const sleutel = `${maat}-${android ? 'android' : 'ios'}-${methode}`;
  const vast = VAST[sleutel];
  if (!vast) return;
  const nu = m.delen.map((d) => [d.wat.split(' ')[0], Math.round(d.top), Math.round(d.h), Math.round(d.x), Math.round(d.w)]);
  expect.soft(nu, `${sleutel}: de maten zijn die van voor BESLISSING 644`).toEqual(vast);
}
