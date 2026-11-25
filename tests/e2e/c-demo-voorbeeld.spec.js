// Het welkomscherm als voorbeeld in de demo (BESLISSING 675) en de knop "Begrepen" op desktop (BESLISSING 682).
// Onder Rondleiding staat alleen in de demo een rij "Zo begint een nieuwe gebruiker"; ze toont het echte welkomscherm met vier stappen. Er wordt niets
// bewaard; na de laatste stap, bij "Terug naar de demo", Escape of de terugknop van de browser staat Rondleiding er weer, met Sofie.
//   demo:  npm run e2e:demo -- c-demo-voorbeeld
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';

const LEEG = { cookies: [], origins: [] };

// Alle instellingen van de demodatabase, buiten de app om.
const instellingen = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar, mis) => {
        const q = indexedDB.open('bloei-demo');
        q.onsuccess = () => {
          const r = q.result.transaction('instellingen').objectStore('instellingen').getAll();
          r.onsuccess = () => {
            q.result.close();
            klaar(Object.fromEntries(r.result.map((x) => [x.sleutel, x.waarde])));
          };
          r.onerror = () => mis(r.error);
        };
        q.onerror = () => mis(q.error);
      }),
  );

async function open(page, pad = 'meer/uitleg') {
  await page.goto('./#/' + pad);
  await expect(page.locator('.demo-balk')).toBeVisible();
  await schermKlaar(page, pad);
}

const rij = (page) => page.locator('.demo-voorbeeld__rij');
const welkom = (page) => page.locator('#scherm > .welkom');

async function startVoorbeeld(page) {
  await open(page);
  await expect(rij(page)).toBeVisible();
  await rij(page).getByRole('button', { name: /Toon het me/ }).click();
  await expect(welkom(page)).toBeVisible();
}

// Terug op Rondleiding, met navigatie, de gewone balk en Sofie; er staat geen welkomscherm meer.
async function terugOpRondleiding(page) {
  await expect(welkom(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/meer\/uitleg$/);
  await expect(page.locator('#scherm[data-scherm="meer/uitleg"]')).toBeAttached();
  await expect(page.locator('#app')).toHaveAttribute('data-nav', 'aan');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('.demo-balk').getByRole('button', { name: /Opnieuw beginnen/ })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/demo-voorbeeld/);
  await expect(rij(page)).toBeVisible();
}

test.describe('het welkomscherm als voorbeeld', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('675: de rij onder Rondleiding heeft de vorm van de andere rijen', async ({ page }) => {
    await open(page);
    const kaart = page.locator('.uitleg__kaart-links').first();
    await expect(kaart.locator('.kaartkop')).toContainText('Rondleiding');
    const r = kaart.locator('.demo-voorbeeld__rij');
    await expect(r).toHaveCount(1);
    await expect(r.locator('.rij__titel')).toHaveText('Zo begint een nieuwe gebruiker');
    await expect(r.locator('.rij__sub')).toHaveText('Vijf stappen, er wordt niets bewaard.');
    // de titel en de uitleg staan er volledig (niet afgekapt) op elke breedte vanaf 320; onder 390 staat de knop onder de tekst (BESLISSING 711,
    // voor alle rijen met een knop: tests/e2e/x-rondleiding-rijen-smal.spec.js), vanaf 390 ernaast.
    for (const breed of [320, 340, 360, 375, 390, 445]) {
      await page.setViewportSize({ width: breed, height: 700 });
      for (const sel of ['.rij__titel', '.rij__sub']) {
        const afgekapt = await r.locator(sel).evaluate((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
        expect(afgekapt, `${sel} op ${breed}`).toBe(false);
      }
      const m = await r.evaluate((e) => {
        const q = (x) => x.getBoundingClientRect();
        const titel = e.querySelector('.rij__titel');
        const g = document.createRange();
        g.selectNodeContents(titel);
        return { regels: new Set([...g.getClientRects()].map((x) => Math.round(x.top))).size, tekst: q(e.querySelector('.rij__tekst')), knop: q(e.querySelector('.rij__eind .knop')) };
      });
      expect(m.regels, `titel op ${breed}: geen woord per regel`).toBeLessThan(4);
      if (breed < 390) expect(m.knop.top, `knop onder de tekst op ${breed}`).toBeGreaterThanOrEqual(m.tekst.bottom - 2);
      else expect(m.knop.top, `knop naast de tekst op ${breed}`).toBeLessThan(m.tekst.bottom);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const knop = r.getByRole('button', { name: 'Toon het me: zo begint een nieuwe gebruiker' });
    await expect(knop).toHaveText('Toon het me');
    await expect(knop).toHaveClass(/knop--secundair/);
    // dezelfde hoogte als de knop "Opnieuw" van de rij erboven, een icoontegel die niet gelijk is aan die van de rij erboven
    const vorige = kaart.locator(':scope > .rij').nth(-2);
    expect((await knop.boundingBox()).height).toBe((await vorige.locator('.knop').boundingBox()).height);
    const icoon = (l) => l.locator('.tegel svg, .tegel use, .tegel i').first().evaluate((e) => e.outerHTML);
    expect(await icoon(r)).not.toBe(await icoon(vorige));
  });

  test('675: vier stappen, niets bewaard; "Vergrendeling instellen" toont het kaartje en daarna staat Rondleiding er weer met Sofie', async ({ page }) => {
    await startVoorbeeld(page);
    const voor = await instellingen(page);
    await expect(page.locator('#app')).toHaveAttribute('data-nav', 'uit');
    await expect(page.locator('#tabbalk')).toBeHidden();
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'welkom');
    const balk = page.locator('.demo-balk');
    await expect(balk).toContainText('Voorbeeld');
    await expect(balk.getByRole('button', { name: 'Terug naar de demo' })).toHaveClass(/knop--primair/);
    await expect(welkom(page).locator('.welkom__bolletje')).toHaveCount(4);
    await expect(welkom(page).locator('.welkom__staptekst')).toHaveText(/1.*4/);

    await welkom(page).locator('input').fill('Bezoeker');
    for (const nr of [2, 3, 4]) {
      await welkom(page).locator('.welkom__knoppen > .knop--primair').click();
      await expect(welkom(page).locator(`.welkom__stap[data-stap="${nr}"]`)).toHaveClass(/is-actief/);
    }
    await expect(welkom(page).locator('.welkom__knoppen > .knop--primair')).toHaveText('Vergrendeling instellen');
    await welkom(page).locator('.welkom__knoppen > .knop--primair').click();
    const dlg = page.getByRole('dialog', { name: 'Dit is de demo' });
    await expect(dlg).toContainText('In de echte app kies je hier je code. In de demo blijft Bloei open.');
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Begrepen' }).click();

    await terugOpRondleiding(page);
    await expect(rij(page).getByRole('button', { name: /Toon het me/ })).toBeFocused();
    await expect(page.locator('.strokenhouder')).toContainText('Er is niets bewaard: Sofie staat er nog.');
    expect(await instellingen(page)).toEqual(voor);
    expect(voor['profiel.naam']).toBe('Sofie');
    await page.reload();
    await schermKlaar(page, 'meer/uitleg');
    expect((await instellingen(page))['profiel.naam']).toBe('Sofie');
  });

  test('675: "Nu niet", "Terug naar de demo", Escape en de terugknop van de browser sluiten het voorbeeld', async ({ page }) => {
    // Nu niet in stap 4
    await startVoorbeeld(page);
    await welkom(page).locator('input').fill('Bezoeker');
    for (let i = 0; i < 3; i++) await welkom(page).locator('.welkom__knoppen > .knop--primair').click();
    await welkom(page).getByRole('button', { name: 'Nu niet' }).click();
    await terugOpRondleiding(page);

    // Terug naar de demo, midden in stap 2
    await rij(page).getByRole('button', { name: /Toon het me/ }).click();
    await welkom(page).locator('input').fill('Bezoeker');
    await welkom(page).locator('.welkom__knoppen > .knop--primair').click();
    await page.locator('.demo-balk').getByRole('button', { name: 'Terug naar de demo' }).click();
    await terugOpRondleiding(page);

    // Escape
    await rij(page).getByRole('button', { name: /Toon het me/ }).click();
    await expect(welkom(page).locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await terugOpRondleiding(page);

    // de terugknop van de browser: terug op Rondleiding, niet op het scherm ervoor
    await rij(page).getByRole('button', { name: /Toon het me/ }).click();
    await expect(welkom(page)).toBeVisible();
    await page.goBack();
    await terugOpRondleiding(page);
    // en een tweede keer terug gaat gewoon naar het vorige scherm (geen dode stap)
    expect((await instellingen(page))['profiel.naam']).toBe('Sofie');
  });

  // Het eigen welkomscherm van de demo (drie stappen, zonder voorbeeld) is in een schermtest niet te bereiken: wie gegevens heeft, krijgt start.klaar
  // terug (data/instellingen.js), en Sofie heeft altijd gegevens. De regel staat daarom in tests/pwa/welkom-slot.test.js.

  test('675: herladen midden in het voorbeeld toont gewoon Rondleiding met Sofie; een tweede tabblad merkt niets', async ({ context, page }) => {
    await startVoorbeeld(page);
    await welkom(page).locator('input').fill('Bezoeker');
    await welkom(page).locator('.welkom__knoppen > .knop--primair').click();
    const tweede = await context.newPage();
    await vasteKlok(tweede);
    await open(tweede, 'vandaag');
    await expect(tweede.locator('.vandaag h1')).toContainText('Sofie');
    await page.reload();
    await schermKlaar(page, 'meer/uitleg');
    await terugOpRondleiding(page);
    expect((await instellingen(page))['profiel.naam']).toBe('Sofie');
    await tweede.reload();
    await schermKlaar(tweede, 'vandaag');
    await expect(tweede.locator('.vandaag h1')).toContainText('Sofie');
  });
});

test.describe('682: "Begrepen" op desktop', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG, viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('gecentreerd en zo breed als een gewone enkele hoofdknop (13rem), gevuld', async ({ page }) => {
    await open(page, 'meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    const dlg = page.getByRole('dialog', { name: 'Dit is de demo' });
    await expect(dlg).toBeVisible();
    const knop = dlg.getByRole('button', { name: 'Begrepen' });
    await expect(knop).toHaveClass(/knop--primair/);
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const k = await knop.boundingBox();
    const d = await dlg.boundingBox();
    expect(Math.abs(k.width - 13 * rem)).toBeLessThan(1);
    expect(Math.abs(k.x + k.width / 2 - (d.x + d.width / 2))).toBeLessThan(1);
  });
});

// BESLISSING 711: het kaartje "Dit is de demo" staat in het midden van de pagina, nooit tegen de onderkant. Op de staande telefoon (goedgekeurd) en
// liggend blijft het het kadertje van de andere pop-ups (iets boven het midden, 16 px opzij); op de tablet en de desktop horizontaal en verticaal in het midden.
test.describe('711: het kaartje "Dit is de demo" in het midden', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  const meet = (page) =>
    page.evaluate(() => {
      const d = document.querySelector('dialog.dialoog--demo[open]').getBoundingClientRect();
      return { boven: d.top, onder: innerHeight - d.bottom, links: d.left, rechts: innerWidth - d.right, b: d.width, hoeken: getComputedStyle(document.querySelector('dialog.dialoog--demo[open]')).borderBottomLeftRadius };
    });

  for (const [breed, hoog, soort] of [[820, 1180, 'midden'], [768, 1024, 'midden'], [960, 700, 'midden'], [1280, 800, 'midden'], [390, 660, 'telefoon'], [320, 480, 'telefoon'], [844, 390, 'telefoon']]) {
    test(`${breed} x ${hoog}: ${soort === 'midden' ? 'in het midden, 480 px breed' : 'het kadertje van de telefoon, ongewijzigd'}`, async ({ page }) => {
      await page.setViewportSize({ width: breed, height: hoog });
      await open(page, 'meer');
      await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
      await expect(page.getByRole('dialog', { name: 'Dit is de demo' })).toBeVisible();
      await animatiesKlaar(page);
      const m = await meet(page);
      expect(m.hoeken, 'vier ronde hoeken').not.toBe('0px');
      expect(Math.abs(m.links - m.rechts), 'horizontaal in het midden').toBeLessThanOrEqual(1);
      if (soort === 'midden') {
        expect(Math.abs(m.boven - m.onder), 'verticaal in het midden').toBeLessThanOrEqual(1);
        expect(Math.round(m.b)).toBe(480);
      } else {
        // zoals de andere pop-ups op de telefoon (telefoon.css): iets boven het midden, nooit tegen een rand
        expect(m.onder, 'niet tegen de onderkant').toBeGreaterThan(m.boven);
        expect(m.boven).toBeGreaterThanOrEqual(16);
        if (breed < 720) expect(Math.round(m.links)).toBe(16);
      }
    });
  }
});

// BESLISSING 711: tijdens het voorbeeld hoeft er op een laag scherm niet gescrold te worden. Tot 700 px hoog is de balk 36 px (liggend en staand);
// past de kaart ook dan niet (320 x 480), dan zweeft alleen een klein knopje "Demo" met een pijltje linksboven en is de pagina even hoog als in de echte app.
// Elke stap, elke maat; de knop terug houdt een tikvlak van 44 px.
test.describe('711: de balk tijdens het voorbeeld op een laag scherm', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  const stand = (page) =>
    page.evaluate(() => {
      const balk = document.querySelector('.demo-balk');
      const knop = balk.querySelector('.knop');
      const k = knop.getBoundingClientRect();
      // het tikvlak in beeld: van het midden van de knop naar boven en naar onder, zolang het punt bij de knop hoort
      const mx = k.left + k.width / 2;
      let boven = k.top + k.height / 2;
      let onder = boven;
      while (boven > 0 && knop.contains(document.elementFromPoint(mx, boven - 1))) boven--;
      while (onder < innerHeight - 1 && knop.contains(document.elementFromPoint(mx, onder + 1))) onder++;
      const kaart = document.querySelector('.welkom__kaart').getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        balk: balk.getBoundingClientRect().height,
        zweeft: document.documentElement.classList.contains('demo-voorbeeld--zweef'),
        knopTekst: knop.innerText.trim(),
        tikvlak: onder - boven + 1,
        kaartOnder: innerHeight - kaart.bottom,
        kaartBoven: kaart.top,
      };
    });

  for (const [breed, hoog, verwacht] of [[320, 480, 'zweeft'], [360, 560, 36], [390, 660, 36], [844, 390, 36], [390, 844, 52]]) {
    test(`${breed} x ${hoog}: niet scrollen in elke stap (${verwacht === 'zweeft' ? 'zwevend knopje' : 'balk ' + verwacht + ' px'})`, async ({ page }) => {
      await page.setViewportSize({ width: breed, height: hoog });
      await startVoorbeeld(page);
      await welkom(page).locator('input').fill('Bezoeker');
      for (let stap = 1; stap <= 4; stap++) {
        await expect(welkom(page).locator(`.welkom__stap[data-stap="${stap}"]`)).toHaveClass(/is-actief/);
        await animatiesKlaar(page);
        const m = await stand(page);
        const ctx = `${breed} x ${hoog} stap ${stap}`;
        expect(m.scroll, ctx + ': scrollen').toBe(0);
        expect(m.kaartOnder, ctx + ': de kaart staat volledig in beeld').toBeGreaterThanOrEqual(0);
        expect(m.tikvlak, ctx + ': tikvlak').toBeGreaterThanOrEqual(44);
        if (verwacht === 'zweeft') {
          expect(m.zweeft, ctx).toBe(true);
          expect(m.knopTekst, ctx).toBe('Demo');
          expect(Math.abs(m.kaartBoven - 12), ctx + ': de kaart staat waar ze in de echte app staat (12 px)').toBeLessThanOrEqual(1);
        } else {
          expect(m.zweeft, ctx).toBe(false);
          expect(Math.round(m.balk), ctx).toBe(verwacht);
          expect(m.knopTekst, ctx).toBe('Terug naar de demo');
        }
        if (stap < 4) await welkom(page).locator('.welkom__knoppen > .knop--primair').click();
      }
      // de knop draagt altijd dezelfde naam en brengt je terug naar de demo; daarna staat de gewone balk er weer
      await page.locator('.demo-balk').getByRole('button', { name: 'Terug naar de demo' }).click();
      await terugOpRondleiding(page);
      await expect(page.locator('html')).not.toHaveClass(/demo-voorbeeld--zweef/);
      expect(Math.round((await page.locator('.demo-balk').boundingBox()).height)).toBe(hoog <= 500 && breed > hoog ? 48 : 52);
    });
  }
});

test.describe('682: "Begrepen" op de telefoon', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('blijft over de volle breedte van het kaartje', async ({ page }) => {
    await open(page, 'meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    const dlg = page.getByRole('dialog', { name: 'Dit is de demo' });
    const k = await dlg.getByRole('button', { name: 'Begrepen' }).boundingBox();
    const acties = await dlg.locator('.dialoog__acties').boundingBox();
    expect(Math.abs(k.width - acties.width)).toBeLessThan(1);
  });
});
