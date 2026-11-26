// BESLISSING 493: Algemeen, Gewicht: het streefgewicht met plus en min en met een invoerveld tussen die twee (typen kan ook);
// de weegdag bestaat niet meer (0.6.3). De rij verandert niet van maat.
import { test, expect } from '@playwright/test';
import { vasteKlok, VASTE_DATUM } from './vaste-klok.js';
import { animatiesKlaar } from './wacht.js';
import { wachtOpInstelling } from './r-wacht.js';

const BEELDEN = process.env.PW_BEELDEN || '';

const leesInst = (page, sleutel) =>
  page.evaluate(
    (s) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('instellingen').objectStore('instellingen').get(s);
          v.onsuccess = () => {
            open.result.close();
            klaar(v.result?.waarde ?? null);
          };
        };
      }),
    sleutel,
  );

async function zaai(page, { streef = 66, thema = null } = {}) {
  await vasteKlok(page);
  await page.goto('./#/meer/gewicht');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    ([doel, themaKeuze, vandaag]) =>
      new Promise((klaar, mislukt) => {
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction(['wegingen', 'instellingen'], 'readwrite');
          tx.objectStore('wegingen').clear();
          tx.objectStore('wegingen').put({ week: '2026-11-09', datum: vandaag, kg: 68.4, voorbeeld: false, gewijzigdOp: Date.now() });
          if (doel == null) tx.objectStore('instellingen').delete('gewicht.streefKg');
          else tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: doel });
          if (themaKeuze) tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: themaKeuze });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [streef, thema, VASTE_DATUM],
  );
  await page.reload();
  await page.locator(streef == null ? '.streefbediening' : '.streefveld__invoer').waitFor();
  await animatiesKlaar(page);
}

const veld = (page) => page.locator('.streefveld__invoer');
const plus = (page) => page.locator('.streefbediening').getByRole('button', { name: /^Eentje meer/ });
const min = (page) => page.locator('.streefbediening').getByRole('button', { name: /^Eentje minder/ });
const melding = (page) => page.locator('.strook', { hasText: 'Vul een gewicht tussen 20 en 300 kg in.' });

test.describe('het streefgewicht typen bij Instellingen Gewicht', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('het veld toont de waarde, plus en min werken het veld bij, typen bewaart bij Enter en bij blur', async ({ page }) => {
    await zaai(page, { streef: 66 });
    await expect(veld(page)).toHaveValue('66,0');
    await expect(veld(page)).toHaveAttribute('inputmode', 'decimal');
    await expect(veld(page)).toHaveAccessibleName('Streefgewicht in kg');
    await expect(page.locator('.streefbediening .stapper')).toHaveAccessibleName('Streefgewicht');
    await expect(page.locator('.streefveld')).toContainText('kg');

    await plus(page).click();
    await expect(veld(page)).toHaveValue('66,1');
    await wachtOpInstelling(page, 'gewicht.streefKg', 66.1);
    await min(page).click();
    await min(page).click();
    await expect(veld(page)).toHaveValue('65,9');
    await wachtOpInstelling(page, 'gewicht.streefKg', 65.9);

    // Typen met een komma en Enter: meteen bewaard, het veld toont de nette vorm
    await veld(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('64,5');
    await page.keyboard.press('Enter');
    await wachtOpInstelling(page, 'gewicht.streefKg', 64.5);
    await expect(veld(page)).toHaveValue('64,5');
    await expect(melding(page)).toHaveCount(0);

    // Een punt kan ook; bewaren bij blur (de focus gaat naar een andere knop), en plus werkt vanaf de getypte waarde verder
    await veld(page).fill('70.2');
    await page.getByRole('button', { name: 'Wissen' }).focus();
    await wachtOpInstelling(page, 'gewicht.streefKg', 70.2);
    await expect(veld(page)).toHaveValue('70,2');
    await plus(page).click();
    await expect(veld(page)).toHaveValue('70,3');
    await wachtOpInstelling(page, 'gewicht.streefKg', 70.3);

    // Na herladen blijft het staan; ook op Gewicht
    await page.reload();
    await expect(veld(page)).toHaveValue('70,3');
    await page.goto('./#/gewicht');
    await expect(page.locator('.gewichtstreef .cijfer-groot')).toContainText('70,3');
  });

  test('een ongeldige waarde wordt niet bewaard: de melding, het veld valt terug op de laatste geldige', async ({ page }) => {
    await zaai(page, { streef: 66 });
    for (const slecht of ['abc', '19,9', '300,1', '65,4,1', '-65']) {
      await veld(page).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(slecht);
      await expect(veld(page)).toHaveAttribute('aria-invalid', 'true');
      await page.keyboard.press('Enter');
      await expect(melding(page), slecht).toHaveCount(1);
      await expect(veld(page), slecht).toHaveValue('66,0');
      await expect(veld(page)).not.toHaveAttribute('aria-invalid', 'true');
      expect(await leesInst(page, 'gewicht.streefKg'), slecht).toBe(66);
    }
    // Leeg laten: stil terug
    await veld(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    await expect(veld(page)).toHaveValue('66,0');
    expect(await leesInst(page, 'gewicht.streefKg')).toBe(66);
    // De grenzen zelf zijn geldig; plus of min staat dan uit
    await veld(page).fill('300');
    await veld(page).press('Enter');
    await wachtOpInstelling(page, 'gewicht.streefKg', 300);
    await expect(plus(page)).toBeDisabled();
    await veld(page).fill('20');
    await veld(page).press('Enter');
    await wachtOpInstelling(page, 'gewicht.streefKg', 20);
    await expect(min(page)).toBeDisabled();
  });

  test('Escape zet de oude waarde terug en Wissen en Zetten blijven werken', async ({ page }) => {
    await zaai(page, { streef: 66 });
    await veld(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('71');
    await page.keyboard.press('Escape');
    await expect(veld(page)).toHaveValue('66,0');
    await page.getByRole('button', { name: 'Wissen' }).click();
    await expect(page.locator('.streefveld')).toHaveCount(0);
    await wachtOpInstelling(page, 'gewicht.streefKg', null);
    await page.getByRole('button', { name: 'Instellen' }).click();
    await expect(veld(page)).toHaveValue('68,4'); // de laatste weging
  });

  test('er is geen keuze van een weegdag meer (0.6.3)', async ({ page }) => {
    await zaai(page);
    await expect(page.locator('.weegdagen, .gewvoorbeeld__week')).toHaveCount(0);
    await expect(page.locator('#scherm')).not.toContainText(/weegdag/i);
  });
});

// De rij verandert niet van hoogte of breedte: het veld staat op de plek van het getal. Voor/na: dezelfde pagina, eerst met het veld, dan met het
// oude getal (de uitvoer van het gedeelde onderdeel) terug op zijn plek; de rij, de stapper en de ruimte voor het getal zijn gelijk.
for (const [breed, hoog, touch] of [[390, 844, true], [360, 740, true], [820, 1180, true], [1280, 800, false], [1690, 1230, false]]) {
  test.describe(`de rij op ${breed}`, () => {
    test.use({ viewport: { width: breed, height: hoog }, hasTouch: touch, isMobile: touch });
    test('het veld verandert de maat van de rij niet', async ({ page }) => {
      await zaai(page, { streef: 66, thema: 'nacht' });
      const meet = () =>
        page.evaluate(() => {
          const r = (el) => {
            const b = el.getBoundingClientRect();
            return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10];
          };
          const rij = document.querySelector('.streefbediening').closest('.rij');
          const stap = document.querySelector('.streefbediening .stapper');
          const getal = stap.querySelector('.streefveld, output.stapper__waarde');
          return { rij: r(rij), stapper: r(stap), getal: r(getal), breedteDoc: document.documentElement.scrollWidth, scherm: innerWidth };
        });
      const nu = await meet();
      expect(nu.breedteDoc).toBeLessThanOrEqual(nu.scherm);
      // het oude getal terug op zijn plek
      await page.evaluate(() => {
        const stap = document.querySelector('.streefbediening .stapper');
        const houder = stap.querySelector('.streefveld');
        const uit = stap.querySelector('.stapper__lees');
        uit.className = 'stapper__waarde cijfer';
        houder.remove();
      });
      const voor = await meet();
      expect(nu.rij, `rij op ${breed}`).toEqual(voor.rij);
      expect(nu.stapper, `stapper op ${breed}`).toEqual(voor.stapper);
      // het getal: dezelfde plek en breedte; het veld is zo hoog als de knoppen (een groter tikvlak), het oude getal alleen zo hoog als zijn tekst
      expect([nu.getal[0], nu.getal[2]], `getal op ${breed}`).toEqual([voor.getal[0], voor.getal[2]]);
    });
    test('tikvlak van het veld en geen overloop met de langste waarde', async ({ page }) => {
      await zaai(page, { streef: 300, thema: 'nacht' });
      const m = await page.evaluate(() => {
        const houder = document.querySelector('.streefveld').getBoundingClientRect();
        const veld = document.querySelector('.streefveld__invoer');
        const eenheid = document.querySelector('.streefveld .stapper__eenheid').getBoundingClientRect();
        return { h: houder.height, eenheidRechts: eenheid.right, houderRechts: houder.right, over: veld.scrollWidth > veld.clientWidth + 1 };
      });
      expect(m.h).toBeGreaterThanOrEqual(40);
      expect(m.eenheidRechts).toBeLessThanOrEqual(m.houderRechts + 0.5);
      expect(m.over).toBe(false);
      if (BEELDEN) {
        await veld(page).focus();
        await page.screenshot({ path: `${BEELDEN}/streefveld-${breed}.png` });
      }
    });
  });
}
