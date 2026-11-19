// Gewicht (stap H6, V3-a tot V3-d uit PLAN.md §12).
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { vulTabbladen } from './r-tabbladen-meting.js';
import { animatiesKlaar, domRustig, schermKlaar } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

const noteer = async (page, tekst) => {
  await page.getByRole('button', { name: 'Weging noteren' }).click();
  await page.getByRole('textbox', { name: 'Gewicht in kg' }).fill(tekst);
  await page.getByRole('button', { name: 'Noteren', exact: true }).click();
};

// Met een bestaande weging staat er een stapper: tik op het getal om te typen.
async function noteerMetStapper(page, tekst, dagenTerug = 0) {
  await page.getByRole('button', { name: 'Weging noteren' }).click();
  for (let i = 0; i < dagenTerug; i++) await page.getByRole('button', { name: 'Vorige' }).click();
  await page.locator('.gewicht__getal').click();
  const veld = page.getByRole('textbox', { name: 'Gewicht in kg' });
  await veld.fill(tekst);
  await veld.press('Enter');
  await page.getByRole('button', { name: 'Noteren', exact: true }).click();
}

test('V3-a: leeg scherm, eerste weging noteren, groot getal met datum en een punt, ook na herladen', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await page.goto('./#/gewicht');
  await expect(page.getByText('Hier komt je eerste weging.')).toBeVisible();
  // Met minder dan twee wegingen is Verloop een compacte kaart zonder grafiek: geen losse as, wel het ene punt met zijn waarde
  await expect(page.locator('.gewichtgrafiek--compact')).toBeVisible();
  await expect(page.locator('.grafiek__basis')).toHaveCount(0);
  await expect(page.locator('.gewicht__punt')).toHaveCount(0);

  await noteer(page, '68,4');
  await expect(page.getByText('Genoteerd.')).toBeVisible();
  await expect(page.locator('.gewichthoofd .cijfer-groot')).toContainText('68,4');
  await expect(page.locator('.gewichthoofd .label')).toContainText(/Laatste weging/);
  await expect(page.locator('.gewicht__punt')).toHaveCount(1);
  await expect(page.locator('.gewicht__punt')).toContainText('68,4 kg');
  await page.reload();
  await expect(page.locator('.gewichthoofd .cijfer-groot')).toContainText('68,4');
  await expect(page.locator('.gewicht__punt')).toHaveCount(1);
  expect(fouten).toEqual([]);
});

test('V3-b en V3-c: een weging van vorige week, het verschil in gewone tekst en vervangen in dezelfde week', async ({ page }) => {
  await page.goto('./#/gewicht');
  await noteer(page, '68,4');
  await expect(page.getByText('Genoteerd.')).toBeVisible();

  await noteerMetStapper(page, '69', 7);
  await expect(page.locator('.grafiek__punt')).toHaveCount(2);
  const zin = page.locator('.gewichthoofd__verschil');
  await expect(zin).toHaveText('-0,6 sinds vorige week');
  // Gewone tekstkleur, geen pijlen of oordeel
  await expect(zin).toHaveCSS('color', await page.locator('.gewichthoofd .cijfer-groot').evaluate((e) => getComputedStyle(e).color));
  await expect(page.locator('.gewicht')).not.toContainText(/afgevallen|bijgekomen|opgelet|↑|↓/);

  // Deze week nog eens noteren: vragen, vervangen, en altijd dezelfde strook
  await noteerMetStapper(page, '68,9');
  await expect(page.getByText('Deze week staat er al 68,4 kg. Vervangen?')).toBeVisible();
  await page.getByRole('button', { name: 'Vervangen', exact: true }).click();
  await expect(page.getByText('Genoteerd.', { exact: true })).toBeVisible();
  await expect(zin).toHaveText('-0,1 sinds vorige week');
  await page.reload();
  await expect(page.locator('.gewichthoofd .cijfer-groot')).toContainText('68,9');
  await expect(zin).toHaveText('-0,1 sinds vorige week');
});

test('V3-d: een punt kiezen en verwijderen, streefgewicht en periode wisselen', async ({ page }) => {
  await page.goto('./#/gewicht');
  await noteer(page, '68,4');
  await noteerMetStapper(page, '69', 7);
  await expect(page.locator('.grafiek__punt')).toHaveCount(2);

  // Het oudste punt kiezen en verwijderen: de zin over het verschil verdwijnt
  await page.locator('.grafiek__punt').first().click({ force: true });
  await expect(page.locator('.gewicht__gekozen')).toContainText('69,0 kg');
  await page.getByRole('button', { name: 'Verwijderen' }).click();
  await page.getByRole('button', { name: 'Wissen' }).click();
  await expect(page.locator('.gewicht__punt')).toHaveCount(1);
  await expect(page.locator('.gewichthoofd__verschil')).toHaveCount(0);

  // Streefgewicht: met één weging nog geen grafiek; vanaf twee wegingen een stippellijn met "streef"; "nog x kg" staat in Weg naar je streefgewicht (BESLISSING 289)
  await page.getByRole('button', { name: 'Streefgewicht zetten' }).click();
  await page.locator('dialog[open]').getByRole('textbox', { name: 'Gewicht in kg' }).fill('68,4');
  await page.locator('dialog[open]').getByRole('button', { name: 'Klaar', exact: true }).click();
  await expect(page.locator('.gewichtstreef .cijfer-groot')).toContainText('68,4');
  await expect(page.locator('.grafiek__streef')).toHaveCount(0);
  await noteerMetStapper(page, '69', 7);
  await expect(page.locator('.grafiek__punt')).toHaveCount(2);
  await expect(page.locator('.grafiek__streef')).toHaveCount(1);
  await expect(page.locator('.grafiek__label--streef')).toHaveText('streef');
  // De streef is gelijk aan haar laatste weging (68,4): ze is er, dus geen "Nog x kg" maar de neutrale zin
  await expect(page.locator('.gewicht__wegzin')).toHaveText('Je bent op je streefgewicht.');

  // Periode wisselen
  for (const naam of ['1 maand', 'Jaar', '3 maanden']) {
    await page.getByRole('radio', { name: naam }).click();
    await expect(page.getByRole('radio', { name: naam })).toHaveAttribute('aria-checked', 'true');
  }

  await page.reload();
  await expect(page.locator('.gewichthoofd .cijfer-groot')).toContainText('68,4');
  await expect(page.locator('.grafiek__streef')).toHaveCount(1);
  await page.getByRole('button', { name: 'Streefgewicht aanpassen' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await page.getByRole('button', { name: 'Wissen', exact: true }).click();
  await expect(page.locator('.grafiek__streef')).toHaveCount(0);
});

test('Gewicht: kerncijfers, de lijst van wegingen kiest het punt en de weegdagkaart opent de pop-up Weegdag', async ({ page }) => {
  await page.goto('./#/gewicht');
  await expect(page.locator('.gewichthoofd--leeg')).toContainText('Nog geen weging.');
  await expect(page.locator('.gewicht__lijst')).toContainText('Hier komen je wegingen te staan.');
  await noteer(page, '68,4');
  await noteerMetStapper(page, '69', 7);
  await expect(page.locator('.gewicht__rijen .rij')).toHaveCount(2);

  // Een tik op een weging in de lijst kiest dat punt in de grafiek en toont zijn waarde
  await page.locator('.gewicht__rijen .rij').last().click();
  await expect(page.locator('.gewicht__gekozen')).toContainText('69,0 kg');
  await expect(page.locator('.grafiek__krans')).toHaveCount(1);

  // De weegdagkaart toont de weegdag en opent de pop-up Weegdag (BESLISSING 477)
  await expect(page.locator('.gewicht__weegdag')).toContainText('Weegdag');
  await page.getByRole('button', { name: 'Weegdag aanpassen' }).click();
  await expect(page.locator('dialog[open]').getByRole('radio')).toHaveCount(7);
  await expect(page).toHaveURL(/#\/gewicht$/);
});

test('Gewicht: het verloop opent op 1 maand, ook na herladen en bij een nieuw bezoek (BESLISSING 197)', async ({ page }) => {
  await page.goto('./#/gewicht');
  await vul(page, { wegingen: 3 }); // de periodekeuze hoort bij de grafiek, die er vanaf twee wegingen is
  await expect(page.getByRole('radio', { name: '1 maand' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Jaar' }).click();
  await expect(page.getByRole('radio', { name: 'Jaar' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('./#/vandaag');
  await page.goto('./#/gewicht');
  await expect(page.getByRole('radio', { name: '1 maand' })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('radio', { name: '1 maand' })).toHaveAttribute('aria-checked', 'true');
});

// BESLISSING 229: met elk aantal wegingen geen groot leeg vlak en kaarten in één rij die gelijk eindigen.
import { vul, meetKaarten } from './leeg-vlak.js';

for (const [breedte, hoogte] of [[1690, 1230], [1720, 950], [390, 844]]) {
  for (const wegingen of [0, 1, 2, 5, 20]) {
    test(`Gewicht ${breedte}x${hoogte}: ${wegingen} wegingen geven geen leeg vlak en kaarten sluiten aan (BESLISSING 229)`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await page.goto('./#/gewicht');
      await expect(page.locator('.gewichtgrafiek')).toBeVisible();
      await vul(page, { wegingen });
      await expect(page.locator('.gewichtgrafiek')).toBeVisible();
      await expect(page.locator('.gewicht__rijen .rij')).toHaveCount(wegingen);
      await page.waitForTimeout(1500);
      const kaarten = await meetKaarten(page, '.gewicht__raster');
      for (const k of kaarten) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(80);
      if (breedte >= 1100) {
        const per = Object.fromEntries(kaarten.map((k) => [k.naam, k]));
        // De drie kaarten bovenaan eindigen gelijk; de grafiek eindigt waar "Goed om te weten" eindigt
        expect(Math.abs(per.gewichthoofd.bodem - per.gewicht__weegdag.bodem)).toBeLessThanOrEqual(2);
        expect(Math.abs(per.gewichthoofd.bodem - per.gewichtstreef.bodem)).toBeLessThanOrEqual(2);
        if (wegingen < 2) {
          // Nog geen lijn te tekenen: een compacte grafiekkaart (niet hoger dan 240 px) naast Je wegingen in een rij van gelijke hoogte, met Goed om te weten eronder
          expect(per.gewichtgrafiek.hoogte).toBeLessThanOrEqual(240);
          expect(Math.abs(per.gewichtgrafiek.bodem - per.gewicht__lijst.bodem)).toBeLessThanOrEqual(2);
          expect(per.gewicht__weetjes.top).toBeGreaterThanOrEqual(per.gewichtgrafiek.bodem);
        } else {
          // Verloop en Je wegingen eindigen gelijk, "Goed om te weten" staat eronder over de volle breedte
          expect(Math.abs(per.gewichtgrafiek.bodem - per.gewicht__lijst.bodem)).toBeLessThanOrEqual(2);
          expect(per.gewicht__weetjes.top).toBeGreaterThanOrEqual(per.gewichtgrafiek.bodem);
          // De grafiekkaart blijft bescheiden van hoogte
          expect(per.gewichtgrafiek.hoogte).toBeLessThanOrEqual(640);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

// ---- Bediening en toegankelijkheid (BESLISSING 330): toetsenbord en aanraking op Gewicht.
async function openMetWegingen(page, soort = 'gewoon') {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await vulTabbladen(page, soort);
  await page.goto('./#/gewicht');
  await page.locator('.gewicht__rijen .rij').first().waitFor();
  await page.waitForTimeout(1000);
}

test.describe('Gewicht met het toetsenbord', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('de focusring van elke weging in de lijst wordt nergens afgesneden en er verschuift niets', async ({ page }) => {
    await openMetWegingen(page, 'vol');
    const maat = () =>
      page.evaluate(() => {
        const lijst = document.querySelector('.gewicht__lijst').getBoundingClientRect();
        const rijen = document.querySelector('.gewicht__rijen');
        const eerste = rijen.querySelector('.rij').getBoundingClientRect();
        // ten opzichte van de pagina, niet van het venster: focus laat de pagina soms schuiven
        return { kaartH: lijst.height, kaartTop: lijst.top + scrollY, eersteTop: eerste.top + scrollY, eersteL: eerste.left, eersteB: eerste.width };
      });
    const voor = await maat();
    const rijen = page.locator('.gewicht__rijen .rij');
    const n = await rijen.count();
    expect(n).toBeGreaterThan(5);
    for (const i of [0, 3, n - 1]) {
      await rijen.nth(i).focus();
      await expect(rijen.nth(i)).toBeFocused();
      // meten als de lijst niet meer schuift na de focus (geen vaste wachttijd)
      const r = await wachtTotStil(page, () => page.evaluate((k) => {
        const e = document.querySelectorAll('.gewicht__rijen .rij')[k];
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        const uit = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0);
        const vak = document.querySelector('.gewicht__rijen').getBoundingClientRect();
        return { zichtbaar: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, links: b.left - uit - vak.left, rechts: vak.right - (b.right + uit), boven: b.top - uit - vak.top, onder: vak.bottom - (b.bottom + uit) };
      }, i));
      expect(r.zichtbaar, `ring ${i}`).toBe(true);
      expect(r.links, `links ${i}`).toBeGreaterThanOrEqual(-0.5);
      expect(r.rechts, `rechts ${i}`).toBeGreaterThanOrEqual(-0.5);
      expect(r.boven, `boven ${i}`).toBeGreaterThanOrEqual(-0.5);
      expect(r.onder, `onder ${i}`).toBeGreaterThanOrEqual(-0.5);
    }
    // de kaart, de lijst en de eerste rij staan nog op dezelfde plek en zijn even groot (de lijst scrolt tot haar eerste rij terug)
    await page.locator('.gewicht__rijen').evaluate((e) => (e.scrollTop = 0));
    await rijen.nth(0).focus();
    const na = await maat();
    expect(na.kaartH).toBeCloseTo(voor.kaartH, 0);
    expect(na.kaartTop).toBeCloseTo(voor.kaartTop, 0);
    expect(na.eersteTop).toBeCloseTo(voor.eersteTop, 0);
    expect(na.eersteL).toBeCloseTo(voor.eersteL, 0);
    expect(na.eersteB).toBeCloseTo(voor.eersteB, 0);
  });

  test('het segment "1 maand / 3 maanden / Jaar": pijltjestoetsen verplaatsen keuze en focus, en de focus is zichtbaar', async ({ page }) => {
    await openMetWegingen(page, 'gewoon');
    const delen = page.getByRole('radio');
    await expect(delen).toHaveCount(3);
    await delen.first().focus();
    await expect(delen.first()).toHaveAttribute('aria-checked', 'true');
    expect(await delen.first().evaluate((e) => getComputedStyle(e).outlineStyle !== 'none')).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(delen.nth(1)).toBeFocused();
    await expect(delen.nth(1)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(delen.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(delen.nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(delen.first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(delen.nth(2)).toBeFocused();
    await expect(delen.nth(2)).toHaveAttribute('aria-checked', 'true');
  });

  test('het blad "Weging noteren": het getal is met het toetsenbord te typen en Escape sluit het blad met de focus terug op de knop', async ({ page }) => {
    await openMetWegingen(page, 'gewoon');
    await page.getByRole('button', { name: 'Weging noteren' }).focus();
    await page.keyboard.press('Enter');
    const blad = page.locator('dialog[open]');
    await expect(blad).toBeVisible();
    const getal = blad.locator('.gewicht__getal');
    await expect(getal).toHaveAttribute('role', 'button');
    await getal.focus();
    await page.keyboard.press('Enter');
    const veld = blad.getByRole('textbox', { name: 'Gewicht in kg' });
    await expect(veld).toBeFocused();
    await expect(veld).toHaveAttribute('inputmode', 'decimal');
    await page.keyboard.type('70,5');
    await page.keyboard.press('Enter');
    await expect(getal).toBeFocused();
    await expect(getal).toContainText('70,5');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Weging noteren' })).toBeFocused();
  });

  test('na een streefgewicht zetten of wissen met het toetsenbord blijft de focus op die knop', async ({ page }) => {
    await openMetWegingen(page, 'gewoon');
    const blad = page.locator('dialog[open]');
    await page.getByRole('button', { name: 'Streefgewicht aanpassen' }).focus();
    await page.keyboard.press('Enter');
    await blad.getByRole('button', { name: 'Verwijderen', exact: true }).click();
    await page.getByRole('button', { name: 'Wissen', exact: true }).click();
    await expect(blad).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Streefgewicht zetten' })).toBeFocused();
    await page.keyboard.press('Enter');
    await blad.getByRole('textbox', { name: 'Gewicht in kg' }).fill('66');
    await page.keyboard.press('Enter');
    await expect(blad).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Streefgewicht aanpassen' })).toBeFocused();
  });

  test('na een weging verwijderen gaat de focus naar de lijst in plaats van naar de bovenkant van de pagina', async ({ page }) => {
    await openMetWegingen(page, 'gewoon');
    await page.locator('.gewicht__rijen .rij').nth(1).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Verwijderen' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Wissen' }).click();
    await expect(page.locator('.gewicht__rijen .rij')).toHaveCount(4);
    await expect(page.locator('.gewicht__rijen .rij').first()).toBeFocused();
  });
});

test.describe('Gewicht met aanraking', () => {
  test('een tik naast een punt kiest het dichtstbijzijnde punt, ook vlak naast de lijn, en bij dicht op elkaar liggende punten wint het dichtstbijzijnde', async ({ page }) => {
    await openMetWegingen(page, 'vol');
    for (const periode of ['1 maand', 'Jaar']) {
      await page.getByRole('radio', { name: periode }).tap();
      // de grafiek is opnieuw getekend voor deze periode en de punten zijn opgekomen (geen vaste wachttijd)
      await expect(page.getByRole('radio', { name: periode })).toHaveAttribute('aria-checked', 'true');
      await domRustig(page);
      await animatiesKlaar(page);
      const punten = page.locator('.grafiek__tikgroep');
      const n = await punten.count();
      expect(n).toBeGreaterThan(3);
      const i = Math.floor(n / 2);
      await punten.nth(i).scrollIntoViewIfNeeded();
      for (const dx of [0, 12, 18, -18]) {
        await page.locator('.grafiek__tikgroep').first().dispatchEvent('click'); // begin steeds bij het eerste punt, zodat een gemiste tik opvalt
        await expect(page.locator('.grafiek__tikgroep').first()).toHaveAttribute('aria-pressed', 'true');
        // de plaats van de punten pas lezen als ze niet meer verschuift
        const alle = await wachtTotStil(page, () => page.locator('.grafiek__tikgroep').evaluateAll((l) => l.map((e) => { const r = e.querySelector('.grafiek__punt').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })));
        const doel = alle[i];
        const x = doel.x + dx;
        const dichtst = alle.reduce((b, p, k) => (Math.hypot(p.x - x, (p.y - doel.y) * 0.3) < Math.hypot(alle[b].x - x, (alle[b].y - doel.y) * 0.3) ? k : b), 0);
        await page.touchscreen.tap(x, doel.y);
        // de tik kiest synchroon een punt en tekent de grafiek opnieuw; wacht tot ook het scherm eromheen uitgebouwd is
        await domRustig(page);
        const gekozen = await page.locator('.grafiek__tikgroep').evaluateAll((l) => l.map((e, k) => (e.getAttribute('aria-pressed') === 'true' ? k : -1)).filter((k) => k >= 0));
        // bij een jaar liggen de punten ± 6 px uit elkaar: één punt verschil mag door afronding van de schaal van de grafiek
        expect(gekozen, `${periode}, ${dx} px naast punt ${i}`).toHaveLength(1);
        expect(Math.abs(gekozen[0] - dichtst), `${periode}, ${dx} px naast punt ${i}`).toBeLessThanOrEqual(periode === 'Jaar' ? 1 : 0);
      }
    }
  });

  test('het blad meldt een ongeldig gewicht bij het veld: aria-invalid en aria-describedby, en het veld vraagt het cijfertoetsenbord', async ({ page }) => {
    await page.goto('./#/gewicht');
    await page.getByRole('button', { name: 'Weging noteren' }).click();
    const veld = page.getByRole('textbox', { name: 'Gewicht in kg' });
    await expect(veld).toHaveAttribute('inputmode', 'decimal');
    await expect(veld).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Noteren', exact: true }).click();
    await expect(veld).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: /./ })).toBeVisible();
    const beschrijving = await veld.getAttribute('aria-describedby');
    expect(beschrijving).toBeTruthy();
    await expect(page.locator('#' + beschrijving)).toBeVisible();
    await expect(veld).toBeFocused();
    await veld.fill('68,4');
    await expect(veld).not.toHaveAttribute('aria-invalid', 'true');
  });
});

// De gewichtsgrafiek is één tabstop (roving tabindex): het gekozen punt, anders het laatste; pijlen, Home en End lopen door de punten; een tik naast een punt kiest het dichtstbijzijnde.
test.describe('Gewichtsgrafiek: één tabstop', () => {
  test.use({ viewport: { width: 1024, height: 900 }, hasTouch: false, isMobile: false });
  async function vulWegingen(page) {
    // Vaste klok (do 12 november 2026, 12:00): de 52 wekelijkse wegingen hangen niet van de dag van de run af.
    await vasteKlok(page, { stil: true });
    await page.goto('./#/vandaag');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await page.evaluate(
      () =>
        new Promise((klaar, mislukt) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onerror = () => mislukt(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction(['wegingen'], 'readwrite');
            const w = tx.objectStore('wegingen');
            const nu = new Date();
            const t2 = (x) => String(x).padStart(2, '0');
            for (let i = 0; i < 52; i++) {
              const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 7 * i);
              const datum = `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
              w.put({ week: datum, datum, kg: 70 - i * 0.1, voorbeeld: false });
            }
            tx.oncomplete = () => { idb.close(); klaar(); };
            tx.onerror = () => mislukt(tx.error);
          };
        }),
    );
  }
  const stops = (page) => page.locator('.grafiek__tikgroep[tabindex="0"]');
  for (const [naam, aantalMin] of [['1 maand', 4], ['3 maanden', 12], ['Jaar', 50]]) {
    test(`${naam}: één tabstop, pijlen, Home en End, Enter kiest`, async ({ page }) => {
      await vulWegingen(page);
      await page.goto('./#/gewicht');
      await page.reload();
      await page.getByRole('radio', { name: naam }).or(page.getByRole('tab', { name: naam })).first().click();
      const punten = page.locator('.grafiek__tikgroep');
      await expect.poll(() => punten.count()).toBeGreaterThanOrEqual(aantalMin);
      const n = await punten.count();
      await expect(stops(page)).toHaveCount(1);
      await expect(punten.nth(n - 1)).toHaveAttribute('tabindex', '0');
      await punten.nth(n - 1).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(punten.nth(n - 2)).toBeFocused();
      await expect(punten.nth(n - 2)).toHaveAttribute('aria-pressed', 'true');
      await expect(stops(page)).toHaveCount(1);
      await page.keyboard.press('Home');
      await expect(punten.nth(0)).toBeFocused();
      await expect(punten.nth(0)).toHaveAttribute('tabindex', '0');
      await page.keyboard.press('ArrowRight');
      await expect(punten.nth(1)).toBeFocused();
      await page.keyboard.press('End');
      await expect(punten.nth(n - 1)).toBeFocused();
      await expect(punten.nth(n - 1)).toHaveAttribute('aria-label', /\d.*kg|\d/);
      await expect(stops(page)).toHaveCount(1);
      await page.keyboard.press('Home');
      // Eerst wachten tot de focus echt op het eerste punt staat: Enter direct na Home viel soms nog op het vorige (of een
      // net hertekend) punt, en dan bleef het eerste punt op aria-pressed="false" (ronde van 16 november).
      await expect(punten.nth(0)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(punten.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await expect(punten.nth(0)).toBeFocused();
    });
  }

  test('een tik naast een punt kiest het dichtstbijzijnde punt', async ({ page }) => {
    await vulWegingen(page);
    await page.goto('./#/gewicht');
    await page.reload();
    const punten = page.locator('.grafiek__tikgroep');
    await expect.poll(() => punten.count()).toBeGreaterThan(2);
    await schermKlaar(page, 'gewicht'); // de grafiek tekent na het laden nog eens (op haar breedte): wacht tot het scherm uitgebouwd is
    await punten.nth(1).scrollIntoViewIfNeeded();
    const doel = await punten.nth(1).locator('.grafiek__punt').boundingBox();
    await page.mouse.click(doel.x + doel.width / 2 + 5, doel.y + doel.height / 2 + 10);
    await expect(punten.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });
});
