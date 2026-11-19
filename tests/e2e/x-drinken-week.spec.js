// BESLISSING 437: "Je week in cijfers" op Drinken gaat over de lopende week (maandag tot zondag) en telt altijd "van 7 dagen";
// rechtsboven staat "deze week". Vaste klok op maandag 16, woensdag 18 en zondag 22 november 2026; verzonnen gegevens; dagdoel 2,5 l.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar, animatiesKlaar } from './wacht.js';

// dagen: { 'jjjj-mm-dd': ml } (één waterdrank per dag; een tweede soort via thee)
async function zaai(page, dagen, thee = {}) {
  await page.evaluate(
    ([d, th]) =>
      new Promise((klaar, mislukt) => {
        const v = indexedDB.open('bloei-dagboek');
        v.onerror = () => mislukt(v.error);
        v.onsuccess = () => {
          const db = v.result;
          const tx = db.transaction(['dranken'], 'readwrite');
          const w = tx.objectStore('dranken');
          w.clear();
          let n = 0;
          for (const [datum, ml] of Object.entries(d)) w.add({ datum, tijdstip: Date.parse(datum + 'T09:00:00') + n++, soort: 'water', ml, voorbeeld: false });
          for (const [datum, ml] of Object.entries(th)) w.add({ datum, tijdstip: Date.parse(datum + 'T10:00:00') + n++, soort: 'thee', ml, voorbeeld: false });
          tx.oncomplete = () => { db.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [dagen, thee],
  );
}

async function open(page, datum, dagen, thee) {
  await vasteKlok(page, { datum });
  await page.goto('./#/drinken');
  await page.waitForSelector('.drinken .drinkhoofd');
  await schermKlaar(page, '#/drinken');
  await zaai(page, dagen, thee);
  await page.reload();
  await page.waitForSelector('.drinken__cijferkaart .kerncijfer');
  await animatiesKlaar(page);
  const kaart = page.locator('.drinken__cijferkaart');
  const tekst = (await kaart.innerText()).replace(/\s+/g, ' ');
  return { kaart, tekst: tekst.toLowerCase() };
}

const GROOTTES = [[390, 844], [1280, 800]];

for (const [breed, hoog] of GROOTTES) {
  test.describe(`Je week in cijfers ${breed}x${hoog}`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width: breed, height: hoog }));

    test('maandag zonder dranken: "deze week", een streepje, 0 van 7 dagen, geen NaN', async ({ page }) => {
      const { kaart, tekst } = await open(page, '2026-11-16', {});
      await expect(kaart.locator('.kaartkop')).toContainText('deze week');
      expect(tekst).not.toMatch(/NaN|undefined|Infinity/);
      expect(tekst).not.toMatch(/over \d+ dag/);
      expect(tekst).toMatch(/gemiddeld per dag - /);
      expect(tekst).toMatch(/dagdoel gehaald 0 van 7 dagen/);
      expect(tekst).toMatch(/beste dag - /);
      expect(tekst).toMatch(/op rij gehaald 0 dagen/);
      await expect(kaart.locator('.drinken__meestleeg')).toBeVisible();
    });

    test('maandag met dranken: 1 van 7 dagen (nooit "1 van 1"), de reeks telt over de weekgrens heen', async ({ page }) => {
      const { kaart, tekst } = await open(page, '2026-11-16', { '2026-11-15': 2600, '2026-11-16': 2600 }, { '2026-11-16': 400 });
      await expect(kaart.locator('.kaartkop')).toContainText('deze week');
      expect(tekst).not.toMatch(/over \d+ dag|van 1 dagen|van 1 dag\b/);
      expect(tekst).toMatch(/dagdoel gehaald 1 van 7 dagen/);
      expect(tekst).toMatch(/gemiddeld per dag 3(,0)? liter/); // alleen maandag: 2600 + 400 ml; zondag 15 hoort bij de vorige week
      expect(tekst).toMatch(/beste dag 3(,0)? liter · maandag/);
      expect(tekst).toMatch(/op rij gehaald 2 dagen/); // zondag en maandag
      expect(tekst).toMatch(/water 87%/); // 2600 van 3000 (zondag telt niet mee in de verdeling)
    });

    test('woensdag: de dagen van maandag tot en met woensdag, nog steeds van 7', async ({ page }) => {
      const { kaart, tekst } = await open(page, '2026-11-18', { '2026-11-16': 2600, '2026-11-17': 1000, '2026-11-18': 2500, '2026-11-19': 4000 });
      await expect(kaart.locator('.kaartkop')).toContainText('deze week');
      expect(tekst).toMatch(/dagdoel gehaald 2 van 7 dagen/);
      expect(tekst).toMatch(/beste dag 2,6 liter · maandag/); // donderdag (toekomst) kan hier niet zomaar bij horen
      expect(tekst).toMatch(/gemiddeld per dag 2,03 liter/);
    });

    test('zondag met een volle week: 7 van 7 dagen is mogelijk, rechtsboven "deze week"', async ({ page }) => {
      const week = Object.fromEntries([16, 17, 18, 19, 20, 21, 22].map((d) => ['2026-11-' + d, 2600]));
      const { kaart, tekst } = await open(page, '2026-11-22', week);
      await expect(kaart.locator('.kaartkop')).toContainText('deze week');
      expect(tekst).toMatch(/dagdoel gehaald 7 van 7 dagen/);
      expect(tekst).toMatch(/op rij gehaald 7 dagen/);
      expect(tekst).toMatch(/gemiddeld per dag 2,6 liter/);
    });

    test('na herladen blijven de cijfers hetzelfde; een lege dinsdag telt als 0 in het gemiddelde (BESLISSING 449)', async ({ page }) => {
      const { tekst } = await open(page, '2026-11-18', { '2026-11-16': 2600, '2026-11-18': 2500 });
      expect(tekst).toMatch(/gemiddeld per dag 1,7 liter/); // (2600 + 0 + 2500) / 3 verstreken dagen
      await page.reload();
      await page.waitForSelector('.drinken__cijferkaart .kerncijfer');
      await animatiesKlaar(page);
      expect((await page.locator('.drinken__cijferkaart').innerText()).replace(/\s+/g, ' ').toLowerCase()).toBe(tekst);
    });
  });
}

// ---- BESLISSING 438: terugbladeren naar eerdere weken (pijlen, vegen, toetsenbord); beide kaarten volgen de gekozen week
const WEEK = '.drinken__week .weekkaart--drinken';
const CIJFERS = '.drinken__cijferkaart';
const datums = (page) => page.locator(`${WEEK} .weekstaaf__datum`).allInnerTexts();
const kopLabel = async (page) => (await page.locator(`${WEEK} .kaartkop__label`).innerText()).toLowerCase();
const cijfersTekst = async (page) => (await page.locator(CIJFERS).innerText()).replace(/\s+/g, ' ').toLowerCase();
// vorige week (9 t/m 15 november): ma 2600, di 1000, zo 2600; de week ervoor (2 t/m 8 november): niets
const ZAAD = { '2026-11-09': 2600, '2026-11-10': 1000, '2026-11-15': 2600, '2026-11-16': 2600 };

for (const [breed, hoog] of GROOTTES) {
  test.describe(`Terugbladeren ${breed}x${hoog}`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width: breed, height: hoog }));

    test('standaard de lopende week; pijl naar rechts uit; de pijlen zijn svg-iconen', async ({ page }) => {
      await open(page, '2026-11-18', ZAAD);
      expect(await kopLabel(page)).toContain('deze week');
      expect(await datums(page)).toEqual(['16/11', '17/11', '18/11', '19/11', '20/11', '21/11', '22/11']);
      await expect(page.getByRole('button', { name: 'Volgende week' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Vorige week' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Naar deze week' })).toHaveCount(0);
      for (const knop of await page.locator('.drinken__weekpijl').all()) {
        await expect(knop.locator('svg')).toHaveCount(1);
        expect((await knop.innerText()).trim()).toBe('');
      }
    });

    test('terug naar vorige week en weer vooruit: beide kaarten tonen dezelfde week met kloppende cijfers', async ({ page }) => {
      await open(page, '2026-11-18', ZAAD);
      await page.getByRole('button', { name: 'Vorige week' }).click();
      await expect.poll(() => kopLabel(page)).toContain('vorige week');
      expect(await datums(page)).toEqual(['09/11', '10/11', '11/11', '12/11', '13/11', '14/11', '15/11']);
      const t1 = await cijfersTekst(page);
      expect(t1).toContain('vorige week');
      expect(t1).not.toMatch(/deze week/);
      expect(t1).toMatch(/dagdoel gehaald 2 van 7 dagen/);
      expect(t1).toMatch(/gemiddeld per dag 0,89 liter/); // BESLISSING 449: (2600 + 1000 + 2600) / 7, een eerdere week deelt door 7
      expect(t1).toMatch(/beste dag 2,6 liter · maandag/);
      expect(t1).toMatch(/op rij gehaald 1 dag/); // zoals de reeks op zondag 15 november stond
      await expect(page.getByRole('button', { name: 'Volgende week' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Naar deze week' })).toHaveCount(0); // BESLISSING 471: geen link onder de kaart
      await page.getByRole('button', { name: 'Volgende week' }).click();
      await expect.poll(() => kopLabel(page)).toContain('deze week');
      expect(await cijfersTekst(page)).toContain('dagdoel gehaald 1 van 7 dagen');
      await expect(page.getByRole('button', { name: 'Volgende week' })).toBeDisabled();
    });

    test('twee weken terug: "Week van ...", een lege week met de lege toestand; met de pijl rechts weer terug', async ({ page }) => {
      await open(page, '2026-11-18', ZAAD);
      await page.getByRole('button', { name: 'Vorige week' }).click();
      await page.getByRole('button', { name: 'Vorige week' }).click();
      await expect.poll(() => kopLabel(page)).toBe('week');
      await expect(page.locator(`${WEEK} .drinken__weekperiode`)).toHaveText('2 - 8 november 2026');
      const t = await cijfersTekst(page);
      expect(t).toContain('2 - 8 november 2026');
      expect(t).not.toMatch(/NaN/);
      expect(t).toMatch(/gemiddeld per dag - /);
      expect(t).toMatch(/dagdoel gehaald 0 van 7 dagen/);
      await expect(page.locator('.drinken__meestleeg')).toBeVisible();
      // een voorbije week kan niet meer gevuld worden door te drinken: een eigen zin (niet "Zodra je deze week iets drinkt")
      await expect(page.locator('.drinken__meestleeg')).toHaveText('In deze week noteerde je geen drank.');
      await page.getByRole('button', { name: 'Volgende week' }).click();
      await expect.poll(() => kopLabel(page)).toContain('vorige week');
      await page.getByRole('button', { name: 'Volgende week' }).click();
      await expect.poll(() => kopLabel(page)).toContain('deze week');
      expect(await datums(page)).toContain('16/11');
    });

    test('toetsenbord: pijl links en rechts in de kaart wisselen van week, de focus blijft op de pijlknop', async ({ page }) => {
      await open(page, '2026-11-18', ZAAD);
      await page.getByRole('button', { name: 'Vorige week' }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => kopLabel(page)).toContain('vorige week');
      await expect(page.getByRole('button', { name: 'Vorige week' })).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => kopLabel(page)).toContain('deze week');
      await page.keyboard.press('ArrowRight'); // verder dan vandaag kan niet
      expect(await kopLabel(page)).toContain('deze week');
    });

    test('herladen brengt je terug naar de lopende week (de gekozen week staat niet in de route)', async ({ page }) => {
      await open(page, '2026-11-18', ZAAD);
      await page.getByRole('button', { name: 'Vorige week' }).click();
      await expect.poll(() => kopLabel(page)).toContain('vorige week');
      await page.reload();
      await page.waitForSelector(`${WEEK} .weekstaaf`);
      expect(await kopLabel(page)).toContain('deze week');
    });
  });
}

// Vegen met een echt aanraakscherm (CDP): links vegen = volgende week, rechts vegen = vorige week; een verticale veeg niet.
test('Vegen op 390x844: rechts vegen = vorige week, links vegen = volgende week, verticaal doet niets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '2026-11-18', ZAAD);
  await page.locator(`${WEEK} .weekstaven`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const doos = await page.locator(`${WEEK} .weekstaven`).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const veeg = async (dx, dy) => {
    const x = doos.x + doos.width / 2;
    const y = doos.y + doos.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  expect(await page.locator('.drinken__week').evaluate((e) => getComputedStyle(e).touchAction)).toBe('pan-y');
  await veeg(0, 120); // verticaal
  await veeg(-30, 5); // te kort
  expect(await kopLabel(page)).toContain('deze week');
  await veeg(120, 10); // naar rechts: vorige week
  await expect.poll(() => kopLabel(page)).toContain('vorige week');
  expect(page.url()).not.toContain('/dagboek/dag'); // geen tik op een dag
  await veeg(-120, 10); // naar links: volgende week
  await expect.poll(() => kopLabel(page)).toContain('deze week');
  await veeg(-120, 10); // verder dan vandaag niet
  expect(await kopLabel(page)).toContain('deze week');
});

// De pijlen van de weekkaart zijn exact de pijlen van de kalender op Vandaag: dezelfde icoonknop (maat, vorm, icoon), de kleur van de familie
// van het tabblad (op Drinken mist, in de kalender het Dagboek) en dezelfde uitgeschakelde stand. De opmaak komt uit scherm-drinken.css, niet inline.
async function pijlMaten(page, knop) {
  return knop.evaluate((el) => {
    const s = getComputedStyle(el);
    const svg = el.querySelector('svg');
    // de kleur van de familie op deze plek: een proefje met color: var(--fam-icoon) naast de knop
    const proef = document.createElement('span');
    proef.style.color = 'var(--fam-icoon)';
    el.parentElement.append(proef);
    const familie = getComputedStyle(proef).color;
    proef.remove();
    // de uitgeschakelde stand: een kloon met disabled op dezelfde plek
    const kloon = el.cloneNode(true);
    kloon.disabled = true;
    el.parentElement.append(kloon);
    const uit = { color: getComputedStyle(kloon).color, opacity: getComputedStyle(kloon).opacity };
    kloon.remove();
    return {
      klasse: el.classList.contains('icoonknop'),
      breed: el.getBoundingClientRect().width,
      hoog: el.getBoundingClientRect().height,
      radius: s.borderRadius,
      padding: s.padding,
      rand: s.borderStyle,
      achtergrond: s.backgroundColor,
      svg: { b: svg.getAttribute('width'), h: svg.getAttribute('height'), viewBox: svg.getAttribute('viewBox'), binnen: svg.innerHTML, w: svg.getBoundingClientRect().width },
      kleur: s.color,
      familie,
      opacity: s.opacity,
      uit,
      inline: el.getAttribute('style'),
    };
  });
}

for (const [breed, hoog] of GROOTTES) {
  test(`Pijlen ${breed}x${hoog}: dezelfde icoonknop als de kalender op Vandaag, in de kleur van Drinken, uitgeschakeld gelijk`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await vasteKlok(page, { datum: '2026-11-18' });
    await page.goto('./#/vandaag');
    await schermKlaar(page, '#/vandaag');
    const kal = page.locator('.kalkaart__blader .icoonknop');
    await expect(kal).toHaveCount(2);
    const kalL = await pijlMaten(page, kal.nth(0));
    const kalR = await pijlMaten(page, kal.nth(1));

    await open(page, '2026-11-18', ZAAD);
    const pijlen = page.locator(`${WEEK} .drinken__weekpijl`);
    const l = await pijlMaten(page, pijlen.nth(0));
    const r = await pijlMaten(page, pijlen.nth(1));
    for (const [a, b] of [[l, kalL], [r, kalR]]) {
      expect(a.klasse).toBe(true);
      for (const k of ['breed', 'hoog', 'radius', 'padding', 'rand', 'achtergrond']) expect(a[k], k).toBe(b[k]);
      expect(a.svg).toEqual(b.svg); // hetzelfde icoon (chevron-left / chevron-right) in dezelfde maat
      expect(a.uit).toEqual(b.uit); // uitgeschakeld: dezelfde gedempte kleur en doorzichtigheid
      expect(a.inline).toBeNull(); // geen inline stijl meer
    }
    // de kleur: de familie van de plek (Drinken), net zoals de kalender de familie van zijn kaart volgt
    expect(kalL.kleur).toBe(kalL.familie);
    expect(l.kleur).toBe(l.familie);
    expect(l.opacity).toBe('1');
    // de pijl naar rechts staat in de lopende week uit, in dezelfde stand als een uitgeschakelde kalenderpijl
    await expect(pijlen.nth(1)).toBeDisabled();
    expect({ color: r.kleur, opacity: r.opacity }).toEqual(kalR.uit);
    // de periode tussen de pijlen: gecentreerd, en de kop houdt geen inline opmaak meer
    const periode = page.locator(`${WEEK} .drinken__weekperiode`);
    expect(await periode.getAttribute('style')).toBeNull();
    expect(await page.locator(`${WEEK} .kaartkop`).getAttribute('style')).toBeNull();
    expect(await page.locator(`${WEEK} .drinken__weekbladeren`).getAttribute('style')).toBeNull();
    expect((await page.locator('.drinken__week').getAttribute('style')) ?? '').not.toMatch(/touch-action|display|flex|width|gap/); // de opkomst mag er een (lege) stijl op zetten, de opmaak niet
    const [pl, pr, pm] = await Promise.all([pijlen.nth(0).boundingBox(), pijlen.nth(1).boundingBox(), periode.boundingBox()]);
    expect(Math.abs(pm.x + pm.width / 2 - (pl.x + pl.width + pr.x) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(pm.y + pm.height / 2 - (pl.y + pl.height / 2))).toBeLessThanOrEqual(1.5);
  });
}

// De kop: op een smalle kaart (< 480 px, een container query) staan de pijlen met de periode op een eigen regel over de volle breedte; op een brede
// kaart staat alles op één regel en maken de pijlen de kop niet hoger dan de kop van "Je week in cijfers".
for (const [breed, hoog, smal] of [[360, 780, true], [390, 844, true], [820, 1180, false], [1280, 800, true], [1690, 1000, false]]) {
  test(`Kop van de weekkaart ${breed}x${hoog}: ${smal ? 'pijlen op een eigen regel' : 'één regel, niet hoger dan de andere kaartkop'}`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await open(page, '2026-11-18', ZAAD);
    const kaartBreed = (await page.locator('.drinken__week').boundingBox()).width;
    expect(kaartBreed < 480).toBe(smal);
    const kop = await page.locator(`${WEEK} .kaartkop`).boundingBox();
    const tegel = await page.locator(`${WEEK} .kaartkop .tegel`).boundingBox();
    const bladeren = await page.locator(`${WEEK} .drinken__weekbladeren`).boundingBox();
    const pijlen = page.locator(`${WEEK} .drinken__weekpijl`);
    const [pl, pr] = await Promise.all([pijlen.nth(0).boundingBox(), pijlen.nth(1).boundingBox()]);
    if (smal) {
      expect(bladeren.y).toBeGreaterThanOrEqual(tegel.y + tegel.height - 1); // onder de titel
      expect(Math.abs(pl.x - kop.x)).toBeLessThanOrEqual(1); // de linkerpijl op de linkerrand van de kop
      expect(Math.abs(pr.x + pr.width - (kop.x + kop.width))).toBeLessThanOrEqual(1); // de rechterpijl op de rechterrand
    } else {
      expect(Math.abs(pl.y + pl.height / 2 - (tegel.y + tegel.height / 2))).toBeLessThanOrEqual(1.5); // op de regel van de tegel
      const ander = await page.locator('.drinken__cijferkaart > .kaartkop').boundingBox();
      expect(Math.abs(kop.height - ander.height)).toBeLessThanOrEqual(0.5);
      expect(pr.x + pr.width).toBeLessThanOrEqual(kop.x + kop.width + 0.5);
    }
  });
}

// BESLISSING 471: geen link "Naar deze week" onder de kaart (wel nog in de week van het Dagboek). De kaart is in de lopende en in een eerdere week
// exact even hoog en eindigt gelijk met haar buur in de rij (waar die ernaast staat).
for (const [breed, hoog] of [[390, 844], [820, 1180], [1280, 800], [1690, 1000]]) {
  test(`Geen "Naar deze week" ${breed}x${hoog}: de kaart is in beide weken even hoog`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await open(page, '2026-11-18', ZAAD);
    const maat = () => page.evaluate(() => {
      const k = document.querySelector('.drinken__week .weekkaart--drinken').getBoundingClientRect();
      const b = document.querySelector('.drinken__cijfers > .kaart').getBoundingClientRect();
      return { hoog: k.height, onderVerschil: Math.abs(k.bottom - b.bottom), naast: Math.abs(k.top - b.top) < 1 };
    });
    const lopend = await maat();
    await page.getByRole('button', { name: 'Vorige week' }).click();
    await expect.poll(() => kopLabel(page)).toContain('vorige week');
    await expect(page.locator('.drinken__naardezeweek')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Naar deze week' })).toHaveCount(0);
    const eerder = await maat();
    expect(Math.abs(eerder.hoog - lopend.hoog)).toBeLessThanOrEqual(0.5);
    if (lopend.naast) {
      expect(lopend.onderVerschil).toBeLessThanOrEqual(0.5);
      expect(eerder.onderVerschil).toBeLessThanOrEqual(0.5);
    }
  });
}

// BESLISSING 445: tussen de pijlen staat alleen de periode (geen dagdoel), gecentreerd; de pijlen verspringen niet bij een langere tekst.
for (const [breed, hoog] of [...GROOTTES, [360, 780]]) {
  test(`Kop van de weekkaart ${breed}x${hoog}: alleen de periode tussen de pijlen, gecentreerd, pijlen blijven op hun plaats`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await open(page, '2026-11-18', ZAAD);
    const kop = page.locator(`${WEEK} .kaartkop`);
    const pijlen = page.locator(`${WEEK} .drinken__weekpijl`);
    const periode = page.locator(`${WEEK} .drinken__weekperiode`);
    await expect(periode).toHaveText('16 - 22 november 2026');
    expect((await kop.innerText()).toLowerCase()).not.toContain('dagdoel');
    const meet = async () => {
      const [l, r, m] = await Promise.all([pijlen.nth(0).boundingBox(), pijlen.nth(1).boundingBox(), periode.boundingBox()]);
      return { l, r, midden: m.x + m.width / 2, tussen: (l.x + l.width + r.x) / 2 };
    };
    const kort = await meet();
    expect(Math.abs(kort.midden - kort.tussen)).toBeLessThanOrEqual(2);
    for (let i = 0; i < 7; i += 1) await page.getByRole('button', { name: 'Vorige week' }).click();
    await expect(periode).toHaveText('28 september - 4 oktober 2026');
    const lang = await meet();
    expect(Math.abs(lang.l.x - kort.l.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lang.r.x - kort.r.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lang.midden - lang.tussen)).toBeLessThanOrEqual(2);
    // alles in de kaart blijft binnen het scherm
    const kaartRand = await page.locator(WEEK).boundingBox();
    expect(lang.r.x + lang.r.width).toBeLessThanOrEqual(kaartRand.x + kaartRand.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

// Een week zonder drank: de lopende week houdt haar zin, een eerdere week krijgt "In deze week noteerde je geen drank."; de kaart "Je week in cijfers"
// blijft in beide weken even hoog (zelfde aantal regels)
for (const [breed, hoog] of [[390, 844], [1280, 800]]) {
  test(`Lege week ${breed}x${hoog}: eigen zin voor een eerdere week, de cijferkaart even hoog`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await open(page, '2026-11-16', {}); // niets gedronken, ook niet in de weken ervoor
    const leeg = page.locator('.drinken__meestleeg');
    await expect(leeg).toHaveText('Zodra je deze week iets drinkt, zie je hier waaruit je dagen bestonden.');
    const maat = () => page.evaluate(() => {
      const z = document.querySelector('.drinken__meestleeg');
      const k = document.querySelector('.drinken__cijferkaart');
      return { regels: Math.round(z.getBoundingClientRect().height / parseFloat(getComputedStyle(z).lineHeight)), kaart: k.getBoundingClientRect().height, zin: z.getBoundingClientRect().height };
    });
    const lopend = await maat();
    await page.getByRole('button', { name: 'Vorige week' }).click();
    await expect.poll(() => kopLabel(page)).toContain('vorige week');
    await expect(leeg).toHaveText('In deze week noteerde je geen drank.');
    const eerder = await maat();
    expect(Math.abs(eerder.kaart - lopend.kaart)).toBeLessThanOrEqual(0.5);
    expect(eerder.zin).toBeLessThanOrEqual(lopend.zin + 0.5);
  });
}
