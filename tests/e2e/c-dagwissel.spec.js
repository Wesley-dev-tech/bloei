// De dagwissel (BESLISSING 203): blijft de app open over middernacht, dan springen de schermen die "vandaag" tonen mee,
// gaat 'dag:gewijzigd' één keer uit, blijft een route met een datum in de hash staan en gaat een half getypte invoer niet verloren.
// De klok wordt verschoven met een vervangen Date (window.__verschil, in ms), zodat de app zelf niet stilvalt.
import { test, expect } from '@playwright/test';
import { maaltijdblad, BEWAAR_MAALTIJD } from './r-wacht.js';
import { naTekenen, schermKlaar } from './wacht.js';

// Dag 1 om 23:50 (lokale tijd), dag 2 om 08:00.
const DAG1 = '2026-11-13';
const DAG2 = '2026-11-14';

async function startOp(page, datumTijd) {
  await page.addInitScript((doel) => {
    const Echt = Date;
    const verschil0 = new Echt(doel).getTime() - Echt.now();
    window.__verschil = window.__verschil ?? verschil0;
    class Verschoven extends Echt {
      constructor(...a) {
        if (a.length === 0) super(Echt.now() + window.__verschil);
        else super(...a);
      }
      static now() {
        return Echt.now() + window.__verschil;
      }
    }
    window.Date = Verschoven;
    window.__dagEvents = [];
    document.addEventListener('dag:gewijzigd', (e) => window.__dagEvents.push(e.detail));
  }, datumTijd);
}

// Zet de klok op een nieuw tijdstip en doet alsof de app weer zichtbaar wordt.
async function naarMorgen(page, datumTijd) {
  await page.evaluate((doel) => {
    window.__verschil = new Date(doel).getTime() - (Date.now() - window.__verschil);
    document.dispatchEvent(new Event('visibilitychange'));
  }, datumTijd);
}

const instelling = (page, sleutel) =>
  page.evaluate(
    (k) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('instellingen').objectStore('instellingen').get(k);
          v.onsuccess = () => {
            open.result.close();
            klaar(v.result?.waarde ?? null);
          };
        };
      }),
    sleutel,
  );
const maaltijden = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('maaltijden').objectStore('maaltijden').getAll();
          v.onsuccess = () => {
            open.result.close();
            klaar(v.result);
          };
        };
      }),
  );

test('Vandaag springt mee over middernacht: nieuwe datum en begroeting, en het event gaat één keer uit', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto('./#/vandaag');
  await expect(page.locator('.begroeting__datum')).toContainText('vrijdag 13 november');
  await expect(page.locator('.begroeting__groet')).toContainText('Goeienavond');
  await naarMorgen(page, `${DAG2}T08:00:00`);
  await expect(page.locator('.begroeting__datum')).toContainText('zaterdag 14 november');
  await expect(page.locator('.begroeting__groet')).toContainText('Goeiemorgen');
  // Nog eens zichtbaar worden zonder dat de dag verandert: geen tweede event.
  // De wachter kijkt meteen bij de gebeurtenis (synchroon: dezelfde dag, dus niets te doen); twee beeldjes later is alles verwerkt.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await naTekenen(page);
  const events = await page.evaluate(() => window.__dagEvents);
  expect(events).toEqual([{ oud: DAG1, nieuw: DAG2 }]);
});

test('Drinken toont na de dagwissel de nieuwe dag, ook zonder herladen', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto('./#/drinken');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.cijfer-groot').first()).toContainText('0,8');
  await naarMorgen(page, `${DAG2}T08:00:00`);
  // Het glas van gisteren telt niet meer mee voor vandaag.
  await expect(page.locator('.cijfer-groot').first()).not.toContainText('0,8');
});

test('een route met een datum in de hash blijft op die datum staan', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto(`./#/supplementen/${DAG1}`);
  await schermKlaar(page, `supplementen/${DAG1}`);
  await naarMorgen(page, `${DAG2}T08:00:00`);
  await expect.poll(() => page.evaluate(() => window.__dagEvents.length)).toBe(1); // de wissel is verwerkt
  await schermKlaar(page, `supplementen/${DAG1}`);
  await expect(page).toHaveURL(new RegExp(`#/supplementen/${DAG1}$`));
  const events = await page.evaluate(() => window.__dagEvents);
  expect(events).toHaveLength(1); // de dag is wel veranderd; alleen dit scherm springt niet mee
});

test('een half getypte maaltijd verliest zijn tekst niet: ze wordt bewaard op de dag waarvoor ze bedoeld was', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto('./#/vandaag');
  const regel = page.locator('.maaltijd').first();
  await regel.locator('> .rij').click();
  // BESLISSING 419: de maaltijd staat in een blad (een open <dialog>); de dagwissel wacht tot het dicht is (app.js, bewaakDagwissel).
  const blad = maaltijdblad(page);
  await blad.locator('textarea').fill('late yoghurt'); // het vak heeft nog focus, er is niet weggeklikt
  await expect.poll(async () => (await maaltijden(page)).map((m) => `${m.datum}:${m.tekst}`)).toContain(`${DAG1}:late yoghurt`); // vanzelf bewaard
  await naarMorgen(page, `${DAG2}T08:00:00`);
  await expect(blad.locator('textarea')).toHaveValue('late yoghurt'); // het blad en de tekst blijven staan
  await expect(blad.locator('textarea')).toBeFocused();
  await blad.getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(blad).toHaveCount(0);
  // Nu het blad dicht is, volgt de nieuwe dag; de maaltijd blijft bij de dag waarvoor ze bedoeld was.
  await expect(page.locator('.begroeting__datum')).toContainText('zaterdag 14 november');
  expect((await maaltijden(page)).map((m) => `${m.datum}:${m.tekst}`)).toEqual([`${DAG1}:late yoghurt`]);
  // Op de nieuwe dag staat de rij leeg.
  await expect(regel.locator('> .rij')).not.toContainText('late yoghurt');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('een open venster wordt niet weggegooid: de dagwissel wacht tot het dicht is', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto('./#/gewicht');
  await page.getByRole('button', { name: /Weging noteren/ }).first().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await naarMorgen(page, `${DAG2}T08:00:00`);
  // Er mag net niets gebeuren: geen toestand om op te wachten. De wachter kijkt elke seconde opnieuw (app.js): 1,2 s dekt één herhaling.
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__dagEvents.length)).toBe(0); // de wachter wacht
  await expect(page.locator('dialog[open]')).toBeVisible(); // nog open
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__dagEvents.length), { timeout: 8000 }).toBe(1);
});

test('met het slot aan ziet ze bij terugkeer eerst het slot en daarachter de nieuwe dag', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto('./#/vandaag');
  await expect(page.locator('.begroeting__datum')).toBeVisible(); // de app is gestart; pas daarna gaat het slot aan
  await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'slot.aan', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'slot.pin', waarde: { zout: 'AAAAAAAAAAAAAAAAAAAAAA==', hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', rondes: 1000, lengte: 6 } });
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
  );
  // De app staat open, het slot staat aan. De pagina gaat naar de achtergrond en komt de volgende ochtend terug.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate((doel) => {
    window.__verschil = new Date(doel).getTime() - (Date.now() - window.__verschil);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, `${DAG2}T08:00:00`);
  await expect(page.locator('#slot .cijferblok')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden(); // het scherm van gisteren (of van vandaag) is niet te zien
  const zichtbaar = await page.evaluate(() => getComputedStyle(document.getElementById('app')).display);
  expect(zichtbaar).toBe('none');
  await expect.poll(() => page.evaluate(() => window.__dagEvents)).toEqual([{ oud: DAG1, nieuw: DAG2 }]);
  expect(await instelling(page, 'slot.aan')).toBe(true);
});

test('een open supplementkaart wordt niet weggegooid: de dagwissel wacht, en het slot komt boven de kaart', async ({ page }) => {
  await startOp(page, `${DAG1}T23:50:00`);
  await page.goto('./#/supplementen');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'supplementen');
  await page.getByRole('button', { name: /Supplement toevoegen|Eerste supplement toevoegen/ }).first().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await naarMorgen(page, `${DAG2}T08:00:00`);
  // Er mag net niets gebeuren: de wachter kijkt elke seconde opnieuw (app.js); 1,2 s dekt één herhaling.
  await page.waitForTimeout(1200);
  await expect(page.locator('dialog[open]')).toBeVisible(); // nog open, niet weggegooid
  expect(await page.evaluate(() => window.__dagEvents.length)).toBe(0); // de wachter wacht
  // Het slot gaat aan terwijl de kaart open staat: het slot ligt boven de kaart en de kaart is niet bereikbaar.
  await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'slot.aan', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'slot.pin', waarde: { zout: 'AAAAAAAAAAAAAAAAAAAAAA==', hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', rondes: 1000, lengte: 6 } });
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#slot .cijferblok')).toBeVisible();
  // De kaart is verborgen en niet bereikbaar zolang het slot erover ligt.
  const kaart = await page.evaluate(() => {
    const d = document.querySelector('dialog[open]');
    return { zichtbaar: d ? d.checkVisibility() : false, inert: d ? Boolean(d.closest('[inert]')) || d.inert : true };
  });
  expect(kaart.zichtbaar).toBe(false);
});
