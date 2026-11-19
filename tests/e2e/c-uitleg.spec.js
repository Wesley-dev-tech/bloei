// De rondleidingen (BESLISSING 167): de knop Uitleg, de stappen, het scherm Meer › Uitleg en het onthouden.
// De automatische start staat in de code UIT; deze tests zetten hem aan met de proefvlag in 'bloei-uitleg'.
//
// Stabiliteit: een stap meten we pas als de pagina rustig is (zie rustig()): het scherm is klaar met tekenen, de openingsanimaties
// zijn afgelopen en het kaartje en de uitlichting staan stil. Vaste pauzes (waitForTimeout) gebruiken we niet; elke test wacht op
// de toestand die hij nodig heeft. Een test per rondleiding en per breedte houdt elke test ruim onder de twee minuten.
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';
import { AANBOD, STAPPEN, HANDELING_SCHERM, ONDERWERPEN, stappenVoor, tekstVoorToestel } from '../../src/uitleg/stappen.js';
import { BEWAAR_MAALTIJD, BEWAAR_MAALTIJD_TEKST, maaltijdblad } from './r-wacht.js'; // de knop van het maaltijdvenster (Klaar, BESLISSING 412): op één plaats instelbaar

const TERUG = TEKSTEN.meer.terug;

const kaart = (page) => page.locator('.uitleg__kaart[role="dialog"]');
const stapLabel = (page) => kaart(page).locator('.uitleg__stap');

// Zet de proefvlag (de automatische start) eenmalig, zodat herladen het gezien-lijstje niet wist.
async function zetProef(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bloei-uitleg')) localStorage.setItem('bloei-uitleg', JSON.stringify({ proef: true }));
  });
}

// ---- Wachten op de juiste toestand ----

// Rustig: geen lopende (eindige) animaties of overgangen en 300 ms lang geen enkele wijziging in de pagina. Daarmee is een scherm klaar met
// tekenen (ook na het laden van gegevens), zijn de openingsanimaties voorbij en staat het kaartje van de rondleiding op zijn plaats.
// Na 8 seconden geeft ze het op, zodat een pagina die nooit stilvalt geen test laat hangen (de volgende controle faalt dan zelf).
async function rustig(page, stil = 300) {
  await page.evaluate(
    (ms) =>
      new Promise((klaar) => {
        const begin = performance.now();
        let laatste = begin;
        const waarnemer = new MutationObserver(() => {
          laatste = performance.now();
        });
        waarnemer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
        const kijk = () => {
          const nu = performance.now();
          const bezig = document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
          if ((!bezig && nu - laatste >= ms) || nu - begin > 8000) {
            waarnemer.disconnect();
            klaar();
          } else requestAnimationFrame(kijk);
        };
        requestAnimationFrame(kijk);
      }),
    stil,
  );
}

// Opent een scherm en wacht tot het getekend en rustig is.
async function openScherm(page, hash, scherm = hash) {
  await page.goto('./#/' + hash);
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', scherm);
  await rustig(page);
}

// Start de rondleiding van het scherm met de knop Uitleg en wacht tot het kaartje er is.
async function startScherm(page) {
  await page.getByRole('button', { name: 'Rondleiding van dit scherm' }).first().click();
  await expect(kaart(page)).toBeVisible();
}

// Start een handeling vanuit Meer › Uitleg ("Toon het me") en wacht tot het kaartje er is.
async function startHandeling(page, onderwerp) {
  await page.goto('./#/meer/uitleg');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/uitleg');
  await page.getByRole('button', { name: 'Toon het me: ' + onderwerp }).click();
  await expect(kaart(page)).toBeVisible({ timeout: 10000 });
}

// Loopt een lopende rondleiding af tot en met Klaar. Bij elke stap wacht ze tot de pagina rustig is, geeft ze { i, totaal, titel } aan
// opStap, en wacht ze na Volgende tot het stapnummer echt veranderd is. Geeft de titels van alle stappen die ze zag.
async function loopStappen(page, opStap = async () => {}) {
  const titels = [];
  for (let i = 1; i <= 30; i++) {
    await rustig(page);
    const label = ((await stapLabel(page).textContent()) || '').trim();
    const totaal = Number(label.match(/van (\d+)/)[1]);
    expect(label, 'het stapnummer klopt').toBe(`Stap ${i} van ${totaal}`);
    const titel = ((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim();
    titels.push(titel);
    await opStap({ i, totaal, titel });
    const klaar = kaart(page).getByRole('button', { name: 'Klaar' });
    if (await klaar.count()) {
      expect(i, 'Klaar staat alleen bij de laatste stap').toBe(totaal);
      // Klikken via het DOM, zodat een kaartje buiten het venster als fout wordt gemeld in plaats van de test te laten hangen.
      await klaar.evaluate((el) => el.click());
      await expect(kaart(page)).toHaveCount(0);
      return titels;
    }
    await kaart(page).getByRole('button', { name: 'Volgende' }).evaluate((el) => el.click());
    await expect(stapLabel(page)).toHaveText(`Stap ${i + 1} van ${totaal}`);
  }
  throw new Error('de rondleiding eindigt niet: ' + titels.join(' > '));
}

// ---- Gegevens zaaien: genoeg om elke voorwaardelijke stap te laten verschijnen ----
// wegingen: aantal wegingen (0, 1 of meer; vanaf twee is er een periodekeuze); streef: een streefgewicht; spuit: een spuit die vandaag gepland staat.
// Het scherm moet daarna herladen worden.
function zaai(page, { wegingen = 3, streef = true, spuit = true } = {}) {
  return page.evaluate(
    (o) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = async () => {
          const db = open.result;
          const schrijf = (store, rij, wijze = 'put') =>
            new Promise((ok, no) => {
              const tx = db.transaction(store, 'readwrite');
              tx.objectStore(store)[wijze](rij);
              tx.oncomplete = ok;
              tx.onerror = () => no(tx.error);
            });
          const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
          const nu = new Date();
          try {
            await schrijf('supplementen', { naam: 'Vitamine D', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }, 'add');
            await schrijf('supplementen', { naam: 'Magnesium', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['avond'], ritme: { soort: 'dagelijks' }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 2 }, 'add');
            if (o.spuit) await schrijf('supplementen', { naam: 'IJzer spuit', dosis: '1 spuit', hoeveelheid: '1 spuit', aanwijzing: '', momenten: [], ritme: { soort: 'maand', start: iso(nu) }, volgorde: 3, actief: true, voorbeeld: false, aangemaaktOp: 3 }, 'add');
            if (o.streef) await schrijf('instellingen', { sleutel: 'gewicht.streefKg', waarde: 62 });
            for (let w = 0; w < o.wegingen; w++) {
              // in kalenderdagen, niet in 24 uur: rond de wissel van zomer- naar wintertijd lag de maandag soms een dag naast (R4-22)
              const x = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - w * 7, 12);
              const maandag = new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7), 12);
              await schrijf('wegingen', { week: iso(maandag), datum: iso(x), kg: 70 - (o.wegingen - 1 - w) * 0.6, voorbeeld: false, gewijzigdOp: Date.now() });
            }
            for (let k = 0; k < 4; k++) {
              const x = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - k, nu.getHours(), nu.getMinutes());
              const ds = iso(x);
              await schrijf('dagen', { datum: ds, notitie: k % 2 ? 'Rustige dag.' : '', stemming: 3 + (k % 3), energie: 2 + (k % 3), doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
              for (const [soort, ml] of [['water', 800], ['thee', 200], ['water', 800]]) await schrijf('dranken', { datum: ds, tijdstip: x.getTime() - 3600e3, soort, ml, voorbeeld: false }, 'add');
              await schrijf('maaltijden', { datum: ds, soort: 'ontbijt', tekst: 'havermout met banaan', fotoId: null, gevoel: 4, voorbeeld: false, gewijzigdOp: 1 });
            }
            db.close();
            klaar();
          } catch (e) {
            fout(e);
          }
        };
      }),
    { wegingen, streef, spuit },
  );
}

// Zaait en laadt de app opnieuw, zodat alle schermen de gegevens lezen.
async function zaaiEnLaad(page, opties) {
  await page.goto('./');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await zaai(page, opties);
  await page.reload();
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
}

test('de knop Uitleg staat in de kop; ze start de rondleiding, Volgende en Vorige lopen door, Escape sluit en de focus keert terug', async ({ page }) => {
  await openScherm(page, 'drinken');
  const knop = page.getByRole('button', { name: 'Rondleiding van dit scherm' });
  await expect(knop).toBeVisible();
  // Zonder proefvlag start niets vanzelf.
  await expect(kaart(page)).toHaveCount(0);

  await knop.click();
  await expect(kaart(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: stappenVoor('drinken')[0].titel })).toBeVisible();
  await expect(stapLabel(page)).toBeVisible();
  await expect(kaart(page).getByRole('button', { name: 'Volgende' })).toBeFocused();

  await kaart(page).getByRole('button', { name: 'Volgende' }).click();
  await expect(stapLabel(page)).toHaveText(/^Stap 2 van/);
  await kaart(page).getByRole('button', { name: 'Vorige' }).click();
  await expect(stapLabel(page)).toHaveText(/^Stap 1 van/);
  await page.keyboard.press('ArrowRight');
  await expect(stapLabel(page)).toHaveText(/^Stap 2 van/);

  await page.keyboard.press('Escape');
  await expect(kaart(page)).toHaveCount(0);
  await expect(knop).toBeFocused();
});

for (const [breed, hoog] of [[390, 844], [1280, 800]]) {
  test(`de laatste stap heet Klaar en sluit; het kaartje past in het venster (Vandaag, ${breed} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await zaaiEnLaad(page);
    await openScherm(page, 'vandaag');
    await startScherm(page);
    const titels = await loopStappen(page, async () => {
      const m = await page.evaluate(() => {
        const k = document.querySelector('.uitleg__kaart[role="dialog"]').getBoundingClientRect();
        return k.left < 0 || k.top < 0 || k.right > innerWidth || k.bottom > innerHeight;
      });
      expect(m, 'het kaartje past in het venster').toBe(false);
    });
    expect(titels.length).toBeGreaterThanOrEqual(10);
  });
}

test('een eerste bezoek start de rondleiding vanzelf, één keer; daarna niet meer', async ({ page }) => {
  await zetProef(page);
  await page.goto('./#/gewicht');
  await expect(kaart(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(kaart(page)).toHaveCount(0);
  const opgeslagen = await page.evaluate(() => JSON.parse(localStorage.getItem('bloei-uitleg')));
  expect(opgeslagen.gezien.gewicht).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((s) => s.startsWith('bloei')).sort())).toEqual(['bloei-thema', 'bloei-uitleg']);

  await page.reload();
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'gewicht');
  await rustig(page, 1500); // de automatische start wacht even op het scherm; ze hoort niet te komen
  await expect(kaart(page)).toHaveCount(0);
  // De knop start ze opnieuw.
  await startScherm(page);
});

test('een wissel van route stopt de rondleiding netjes', async ({ page }) => {
  await openScherm(page, 'drinken');
  await startScherm(page);
  await page.evaluate(() => (window.location.hash = '#/dagboek'));
  await expect(kaart(page)).toHaveCount(0);
  await expect(page.locator('.uitleg')).toHaveCount(0);
});

test('met het slot dicht start er geen rondleiding', async ({ page }) => {
  await page.goto('./#/meer/vergrendeling');
  const slotSchakelaar = page.getByRole('switch', { name: /^Bloei vergrendelen/ });
  await slotSchakelaar.click(); // aanzetten met Pincode: de toestelvraag komt er niet bij (BESLISSING 194)
  for (const c of '123456123456') await page.locator(`.cijferblok__toets[data-cijfer="${c}"]`).click();
  // BESLISSING 518: daarna (als het toestel het kan) de vraag of het toestel mag helpen, en altijd de herstelcode met het vinkje.
  const aanbod = page.locator('[data-toestelaanbod]');
  const herstel = page.locator('[data-herstelstap]');
  await expect(aanbod.or(herstel)).toBeVisible();
  if (await aanbod.isVisible()) await page.getByRole('button', { name: 'Nee, dank je' }).click();
  await expect(herstel).toBeVisible();
  await herstel.getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await herstel.getByRole('button', { name: 'Verder' }).click();
  await expect(slotSchakelaar).toHaveAttribute('aria-checked', 'true');
  // Pas nu de automatische start aanzetten, daarna met het slot dicht openen.
  await page.evaluate(() => localStorage.setItem('bloei-uitleg', JSON.stringify({ proef: true })));
  await page.goto('./#/drinken');
  await page.reload();
  await expect(page.locator('.cijferblok')).toBeVisible();
  await rustig(page, 1500);
  await expect(page.locator('.uitleg')).toHaveCount(0);
});

test('Meer › Uitleg: de schakelaar, alles opnieuw tonen en Toon het me brengt je naar het juiste scherm bij de juiste stap', async ({ page }) => {
  await openScherm(page, 'meer/uitleg');
  await expect(page.locator('#scherm .schermkop h1')).toHaveText('Rondleiding');
  await expect(page.getByRole('button', { name: `Terug naar ${TERUG}`, exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: /^Toon het me: / }).count()).toBeGreaterThanOrEqual(10);
  // Geen rondleiding op dit scherm zelf.
  await expect(page.getByRole('button', { name: 'Rondleiding van dit scherm' })).toHaveCount(0);

  // De schakelaar bewaart de voorkeur.
  await page.getByRole('switch').click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('bloei-uitleg')))).auto).toBe(false);
  await page.getByRole('switch').click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('bloei-uitleg')))).auto).toBe(true);

  await page.getByRole('button', { name: 'Alle rondleidingen opnieuw tonen' }).click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('bloei-uitleg')))).gezien).toEqual({});

  // Toon het me: Een maaltijd noteren, naar Vandaag, bij die stap.
  await page.getByRole('button', { name: 'Toon het me: Een maaltijd noteren' }).click();
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(page.getByRole('dialog', { name: 'Kies een moment' })).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');

  // BESLISSING 579: "Mijn instellingen" is vier korte handleidingen; elk gaat naar haar eigen scherm en komt na afloop terug op het scherm
  // Rondleiding (549). Drie ervan zijn de rondleiding van hun instelscherm (645): dezelfde stappen als het vraagteken op dat scherm.
  for (const [id, route] of [['profiel', 'meer/profiel'], ['thema', 'meer'], ['instDrinken', 'meer/instellingen'], ['instGewicht', 'meer/gewicht']]) {
    await openScherm(page, 'meer/uitleg');
    await page.getByRole('button', { name: 'Toon het me: ' + TEKSTEN.uitleg.onderwerp[id] }).click();
    await expect(page).toHaveURL(new RegExp('#/' + route + '$'));
    // De eerste stap, of op een telefoon het eerste afgeronde deel ervan (BESLISSING 627, STUKKEN).
    const eerste = stappenVoor(ONDERWERPEN.find((o) => o.id === id).sleutel)[0];
    await expect(kaart(page)).toBeVisible({ timeout: 10000 });
    const titels = [eerste.titel, ...(eerste.stukken?.stukken ?? []).map((x) => x.titel)];
    await expect.poll(async () => titels.includes(((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim()), id).toBe(true);
    await kaart(page).getByRole('button', { name: 'Overslaan' }).click();
    await expect(page).toHaveURL(/#\/meer\/uitleg$/);
  }
  await expect(page.getByRole('button', { name: 'Toon het me: Mijn instellingen' })).toHaveCount(0);
});

test('Bloei op mijn beginscherm zetten: stappen midden op het scherm, zonder uitlichting', async ({ page }) => {
  await startHandeling(page, 'Bloei op mijn beginscherm zetten');
  await expect(page.getByRole('dialog', { name: 'Open Bloei in Safari' })).toBeVisible();
  await expect(page.locator('.uitleg.is-midden')).toHaveCount(1);
  await kaart(page).getByRole('button', { name: 'Volgende' }).click();
  await expect(page.getByRole('dialog', { name: 'Tik op Deel' })).toBeVisible();
  for (let i = 0; i < 3; i++) await kaart(page).getByRole('button', { name: 'Volgende' }).click();
  await expect(page.getByRole('dialog', { name: 'Daarna' })).toBeVisible();
  await kaart(page).getByRole('button', { name: 'Klaar' }).click();
  await expect(kaart(page)).toHaveCount(0);
});

test('Vergrendeling: Toon het me in "Goed om te weten" start de rondleiding van dat scherm', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openScherm(page, 'meer/vergrendeling');
  await page.locator('.instel__weetjes').getByRole('button', { name: 'Toon het me' }).click();
  await expect(page.getByRole('dialog', { name: 'Het slot aanzetten' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(kaart(page)).toHaveCount(0);
});

test('Delen: Toon het me in "Goed om te weten" start de rondleiding van dat scherm', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openScherm(page, 'delen');
  await page.getByRole('button', { name: 'Toon het me' }).click();
  await expect(page.getByRole('dialog', { name: stappenVoor('delen')[0].titel })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(kaart(page)).toHaveCount(0);
});

const SCHERM_ROUTES = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer', 'delen', 'meer/instellingen', 'meer/gewicht', 'meer/vergrendeling', 'meer/meldingen', 'meer/profiel', 'meer/favorieten', 'meer/badges'];

for (const route of SCHERM_ROUTES) {
  test(`${route}: de knop Uitleg staat in de kop en de rondleiding start`, async ({ page }) => {
    await zaaiEnLaad(page);
    await openScherm(page, route);
    const knop = page.getByRole('button', { name: 'Rondleiding van dit scherm' });
    await expect(knop).toBeVisible();
    await knop.click();
    await expect(kaart(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(kaart(page)).toHaveCount(0);
  });
}

test('geen horizontaal scrollen en de knop Uitleg blijft tikbaar op 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ['vandaag', 'drinken', 'meer/vergrendeling']) {
    await openScherm(page, route);
    const knop = page.getByRole('button', { name: 'Rondleiding van dit scherm' });
    await expect(knop, route).toBeVisible();
    const b = await knop.boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), route).toBe(false);
  }
});

// ---- Het echte gedrag bij een eerste bezoek (de testvlag "echt" laat de automatische start ook onder automatisering werken) ----
async function zetEcht(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bloei-uitleg')) localStorage.setItem('bloei-uitleg', JSON.stringify({ echt: true }));
  });
}
const staat = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('bloei-uitleg')));

test('eerste bezoek: het welkomstkaartje komt één keer; Toon het me start de rondleiding en daarna start elk tabblad zijn korte rondleiding één keer', async ({ page }) => {
  await zetEcht(page);
  await page.goto('./#/vandaag');
  const welkom = page.locator('.uitleg--welkom .uitleg__kaart');
  await expect(welkom).toBeVisible({ timeout: 8000 });
  await expect(welkom).toContainText('Welkom bij Bloei. Wil je kort zien hoe het werkt?');
  await welkom.getByRole('button', { name: 'Toon het me' }).click();
  await expect(page.getByRole('dialog', { name: 'Het menu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => staat(page)).toMatchObject({ welkom: true, auto: true });

  // Het kaartje komt niet terug.
  await page.reload();
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
  await rustig(page, 2500);
  await expect(page.locator('.uitleg--welkom')).toHaveCount(0);

  // Elk tabblad start zijn korte rondleiding (hoogstens vier stappen) één keer.
  for (const route of ['drinken', 'dagboek']) {
    await page.goto('./#/' + route);
    await expect(kaart(page), route).toBeVisible({ timeout: 8000 });
    await expect(kaart(page).locator('.uitleg__stap'), route).toHaveText(/van \d+/); // het kaartje vult zijn teller pas na het tekenen
    const stappen = await kaart(page).locator('.uitleg__stap').textContent();
    expect(Number(stappen.match(/van (\d+)/)[1]), route).toBeLessThanOrEqual(4);
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route);
    await rustig(page, 2500);
    await expect(kaart(page), `${route} niet nog eens`).toHaveCount(0);
  }
});

test('eerste bezoek: bij Liever niet start er nooit iets vanzelf, ook niet op een ander tabblad of na herladen', async ({ page }) => {
  await zetEcht(page);
  await page.goto('./#/vandaag');
  const welkom = page.locator('.uitleg--welkom .uitleg__kaart');
  await expect(welkom).toBeVisible({ timeout: 8000 });
  await welkom.getByRole('button', { name: 'Liever niet' }).click();
  await expect.poll(() => staat(page)).toMatchObject({ welkom: true, auto: false });
  for (const route of ['drinken', 'gewicht', 'dagboek']) {
    await page.goto('./#/' + route);
    await rustig(page, 2200);
    await expect(page.locator('.uitleg'), route).toHaveCount(0);
  }
  await page.reload();
  await rustig(page, 2200);
  await expect(page.locator('.uitleg')).toHaveCount(0);
  // De knop Uitleg werkt nog steeds.
  await startScherm(page);
});

// ---- De rondleidingen veranderen niets aan de gegevens ----
const momentopname = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const namen = [...db.objectStoreNames].sort();
          const uit = {};
          let rest = namen.length;
          for (const naam of namen) {
            const v = db.transaction(naam).objectStore(naam).getAll();
            v.onsuccess = () => {
              uit[naam] = JSON.stringify(v.result);
              if (--rest === 0) {
                db.close();
                klaar(uit);
              }
            };
          }
        };
      }),
  );
// Alleen het scherm Badges zelf markeert medailles als gezien (gewoon gedrag van dat scherm, niet van de rondleiding).
const zonderGezien = (m) => ({ ...m, badges: m.badges.replace(/,"gezien":(true|false)/g, '') });

// ---- De handeling "Mijn gewicht noteren" met de registratie van het scherm Gewicht (openWeging) ----
test('Mijn gewicht noteren: het blad opent en sluit bij de juiste stappen en er komt geen weging bij', async ({ page }) => {
  await zaaiEnLaad(page);
  await openScherm(page, 'gewicht');
  const wegingen = () =>
    page.evaluate(
      () =>
        new Promise((klaar) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onsuccess = () => {
            const v = open.result.transaction('wegingen').objectStore('wegingen').getAll();
            v.onsuccess = () => {
              open.result.close();
              klaar(JSON.stringify(v.result));
            };
          };
        }),
    );
  const voor = await wegingen();

  await startHandeling(page, 'Mijn gewicht noteren');
  await expect(page).toHaveURL(/#\/gewicht$/);

  const blad = page.locator('dialog[open]');
  const gezien = [];
  const titels = await loopStappen(page, async ({ titel }) => {
    gezien.push({ titel, bladOpen: (await blad.count()) > 0 });
  });
  expect(titels, JSON.stringify(gezien)).toContain('Het getal');
  // Het blad is open bij Het getal, De datum en Bewaren, en dicht bij de stappen die op het scherm zelf wijzen.
  for (const naam of ['Het getal', 'De datum', 'Bewaren']) {
    const g = gezien.find((x) => x.titel === naam);
    if (g) expect(g.bladOpen, naam).toBe(true);
  }
  for (const naam of ['Weging noteren', 'Een punt aantikken', 'Je streefgewicht']) {
    const g = gezien.find((x) => x.titel === naam);
    if (g) expect(g.bladOpen, naam).toBe(false);
  }
  await expect(blad).toHaveCount(0); // na afloop is het blad weer dicht
  expect(await wegingen()).toBe(voor); // geen weging erbij
});

// ---- De handelingen met registraties van B: openMaaltijd, toonOngedaanMelding, openNieuwSupplement, openBewerkSupplement ----
// Doorloopt één handeling: per stap de titel en de stand van het onderdeel dat de registratie opent (sonde), tot Klaar.
async function doorloopHandeling(page, onderwerp, route, sonde) {
  await startHandeling(page, onderwerp);
  await expect(page).toHaveURL(new RegExp('#/' + route + '$'));
  const gezien = [];
  await loopStappen(page, async ({ titel }) => {
    gezien.push({ titel, open: await sonde() });
  });
  return gezien;
}
const stand = (gezien, titel) => gezien.find((g) => g.titel === titel)?.open;

test('Een maaltijd noteren (openMaaltijd): het maaltijdblad gaat open bij de juiste stappen en dicht erna, en de gegevens blijven gelijk', async ({ page }) => {
  await openScherm(page, 'vandaag');
  const regel = page.locator('.maaltijd').first();
  await regel.locator('> .rij').click();
  await maaltijdblad(page).locator('textarea').fill('yoghurt met noten'); // BESLISSING 419: het invulvenster is een blad
  await maaltijdblad(page).getByRole('button', BEWAAR_MAALTIJD).click(); // weer dicht voor de start
  await expect.poll(async () => (await momentopname(page)).maaltijden).toContain('yoghurt met noten');
  await expect(maaltijdblad(page)).toHaveCount(0);
  await rustig(page);
  const voor = await momentopname(page);

  // De rondleiding opent het blad in kijkstand (niet modaal): dialog[open] zonder :modal.
  const bladOpen = page.locator('body > .blad.maaltijdblad > dialog.dialoog[open]');
  const gezien = await doorloopHandeling(page, 'Een maaltijd noteren', 'vandaag', async () => (await bladOpen.count()) > 0);
  expect(gezien.length, JSON.stringify(gezien)).toBeGreaterThanOrEqual(8);
  for (const t of ['Schrijf wat je at', 'Het uur', 'Hoe voelde het?', BEWAAR_MAALTIJD_TEKST, 'Verwijderen', 'Een favoriet maken']) expect(stand(gezien, t), t + ' ' + JSON.stringify(gezien)).toBe(true);
  for (const t of ['Kies een moment', 'Later aanpassen', 'Een favoriet gebruiken']) if (stand(gezien, t) !== undefined) expect(stand(gezien, t), t).toBe(false);
  await expect(bladOpen).toHaveCount(0);
  expect(zonderGezien(await momentopname(page))).toEqual(zonderGezien(voor));
});

test('Drinken bijhouden (toonOngedaanMelding): de melding verschijnt bij haar stap en verdwijnt erna, en er komt geen drank bij', async ({ page }) => {
  await openScherm(page, 'drinken');
  const voor = await momentopname(page);
  const gezien = await doorloopHandeling(page, 'Drinken bijhouden', 'drinken', async () => (await page.locator('.strook:visible').count()) > 0);
  expect(stand(gezien, 'Ongedaan maken'), JSON.stringify(gezien)).toBe(true);
  expect(stand(gezien, 'Een drank aantikken'), JSON.stringify(gezien)).toBe(false);
  await expect(page.locator('.strook:visible')).toHaveCount(0);
  expect(await momentopname(page)).toEqual(voor);
});

test('Een supplement aanpassen (openBewerkSupplement): het kaartje opent bij de juiste stappen en sluit erna, de gegevens blijven gelijk', async ({ page }) => {
  await zaaiEnLaad(page);
  await openScherm(page, 'supplementen');
  await expect(page.locator('.overzicht__rij').first()).toBeVisible();
  const voor = await momentopname(page);

  const gezien = await doorloopHandeling(page, 'Een supplement aanpassen', 'supplementen', async () => (await page.locator('dialog[open]').count()) > 0);
  const info = JSON.stringify(gezien);
  for (const t of ['De naam', 'De hoeveelheid', 'Het ritme', 'De momenten', 'Begint op', 'Stopt na', 'Bewaren', 'Verwijderen']) expect(stand(gezien, t), t + ' ' + info).toBe(true);
  for (const t of ['Tik op een supplement', 'Een supplement toevoegen']) expect(stand(gezien, t), t + ' ' + info).toBe(false);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(zonderGezien(await momentopname(page))).toEqual(zonderGezien(voor));
});

test('Supplementen afvinken: de handeling start op Vandaag, bij de momenten', async ({ page }) => {
  await zaaiEnLaad(page);
  await openScherm(page, 'vandaag');
  await startHandeling(page, 'Supplementen afvinken');
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(kaart(page).locator('.uitleg__titel')).toHaveText('Op Vandaag afvinken');
  await expect(kaart(page)).toContainText('Vink Ochtend af');
});

// ---- Elke stap wijst het onderdeel aan waar de tekst over gaat (BESLISSING 223: stap 7 van Een maaltijd noteren wees het hartje van
// favoriet aan in plaats van de knop Verwijderen). Per stap staat hier wat het aangewezen element moet zijn: via de haak (data-uitleg),
// de rol, de naam (aria-label of tekst), het element of een selector. Een stap die niet in deze lijst staat, laat de test falen. ----
const GEEN = null; // stap zonder onderdeel (een kaartje midden op het scherm): niets te controleren
const VERWACHT = {
  'vandaag.menu': { sel: '#zijbalk, #tabbalk' },
  'vandaag.kop': { tag: 'button', naam: /Rondleiding/ }, // BESLISSING 593: de knop heet Rondleiding (met Delen erbij, ook)
  'vandaag.dag': { sel: '.voortgang' },
  'vandaag.badges': { haak: 'badges' },
  'vandaag.week': { haak: 'week' },
  'vandaag.gevoel': { sel: '.stemmingkaart' },
  'vandaag.glas': { sel: '.kaart.drinkkaart' }, // BESLISSINGEN 548 en 570: de hele kaart Drinken (op een telefoon in delen)
  'vandaag.afvinken': { haak: 'momenten' },
  'vandaag.spuit': { tag: 'button', sel: '.momentrij[data-moment="beurt"]', naam: /spuit/i, optioneel: true }, // alleen op de dag van een spuit
  'vandaag.maaltijd': { sel: '.kaart.etenkaart' }, // BESLISSING 570: de hele kolom Eten met haar kop (op een telefoon in delen)
  'vandaag.kalender': { haak: 'vandaag-kalender' },
  'vandaag.delen': { tag: 'a', naam: /^Delen/ },
  'dagboek.kop': { tag: 'button', sel: '.dagboek__kop .schermkop__uitleg', naam: /Rondleiding/ }, // BESLISSING 629: het vraagteken en het huisje (ook)
  'dagboek.weergave': { rol: 'radiogroup', naam: /Weergave/ },
  'dagboek.bladeren': { sel: '.bladerkop' },
  'dagboek.delen': { sel: '.week__delen .knop' },
  'dagboek.eten': { sel: '.dag__eten' },
  'dagboek.notitie': { sel: '.dag__notitie' },
  'dagboek.drinken': { sel: '.dag__drinken' },
  'dagboek.supplementen': { sel: '.dag__supplementen' },
  'dagboek.stemming': { sel: '.dag__stemming' },
  'dagboek.weekcijfers': { sel: '.wk__samenvatting' },
  'dagboek.weekschema': { sel: '.wk__schemakaart' },
  'dagboek.cijfers': { sel: '.maand__cijferkaart' },
  'dagboek.maand': { sel: '.maand__kalkaart' },
  'dagboek.tekens': { sel: '.maand__legenda' }, // BESLISSING 703: de legenda van de maandweergave heeft een eigen stap (alleen in maand)
  'dagboek.paneel': { sel: '.maand__dag' },
  'dagboek.beurt': { sel: '.maand__gepkaart' },
  'drinken.voortgang': { sel: '.drinkhoofd' },
  'drinken.tegels': { sel: '.drankrij' },
  'drinken.laatste': { sel: '.drinken__laatste' },
  'drinken.lijst': { sel: '.drinken__lijst' },
  'drinken.week': { haak: 'week' },
  'drinken.instellingen': { tag: 'button', haak: 'drinken-instellingen', naam: /Dagdoel en groottes aanpassen/ },
  'supplementen.week': { sel: '.weekkaart--supp' },
  'supplementen.moment': { haak: 'momenten' },
  'supplementen.beurt': { haak: 'aan-de-beurt' },
  'supplementen.later': { haak: 'later', optioneel: true },
  'supplementen.lijst': { sel: '.overzichtkaart > .kaartkop' }, // de kop en het schema, zonder het blok Lijst bewaren en overnemen (eigen stap)
  'supplementen.toevoegen': { tag: 'button', naam: /Supplement toevoegen/ },
  'supplementen.aanpassen': { haak: 'supplement-rij' },
  'supplementen.bestand': { sel: '.lijstbestand' }, // BESLISSING 703: het blok Lijst bewaren en overnemen, alleen bij een gevulde lijst
  'gewicht.weging': { tag: 'button', naam: /Weging noteren/ },
  'gewicht.weegdag': { sel: '.gewicht__weegdag' },
  'gewicht.streef': { haak: 'streefgewicht' },
  'gewicht.periode': { rol: 'radiogroup', haak: 'grafiek-periode' }, // alleen vanaf twee wegingen
  'gewicht.grafiek': { haak: 'grafiek-vlak' },
  'gewicht.lijst': { haak: 'gewicht-lijst' },
  'gewicht.cijfers': { sel: '.gewicht__cijferkaart' },
  'gewicht.kalender': { sel: '.gewicht__kal' },
  'gewicht.weg': { sel: '.gewicht__weg' }, // alleen met een streefgewicht
  'gewicht.weetjes': { sel: '.gewicht__weetjes' },
  'meer.profiel': { haak: 'profiel' },
  'meer.thema': { haak: 'thema', sel: '.kaart.meer__themakaart' }, // BESLISSING 645: dezelfde stap als de handleiding Een thema kiezen
  'meer.favorieten': { sel: '.meer__favorieten' },
  'meer.instellingen': { sel: '.meer__menu' },
  'meer.uitleg': { naam: /^Rondleiding/ }, // BESLISSING 600: de rij heet Rondleiding
  'meer.badges': { haak: 'badges' },
  'meer.wissen': { sel: '.knop--wis' },
  'meer.privacy': { sel: '.privacy' },
  'delen.periode': { haak: 'delen-periode' },
  'delen.inhoud': { haak: 'delen-onderdelen' },
  'delen.voorbeeld': { haak: 'delen-voorbeeld' },
  'delen.bewaren': { haak: 'delen-knoppen', naam: /Versturen.*Bewaren.*Afdrukken/ /* BESLISSING 561; de naam is de tekst van de hele knoppengroep */ }, // de knop Versturen kan even "Even geduld" heten
  // BESLISSINGEN 579, 627 en 645: de rondleiding van een instelscherm is ook zijn handleiding; elke stap een hele kaart met haar kop, of de knoppen bovenaan.
  'meer/instellingen.kaart': { sel: '.kaart.instellingen__drinken' },
  'meer/instellingen.voorbeeld': { sel: '.instel__voorbeeld:has(.drinkvoorbeeld)' },
  'meer/instellingen.weetjes': { sel: '.instel__weetjes' },
  'meer/instellingen.kop': { sel: '.schermkop__acties', naam: /Algemeen/ },
  'meer/gewicht.kaart': { sel: '.kaart.instellingen__gewicht' },
  'meer/gewicht.voorbeeld': { sel: '.instel__voorbeeld:has(.gewvoorbeeld)' },
  'meer/gewicht.weetjes': { sel: '.instel__weetjes' },
  'meer/gewicht.kop': { sel: '.schermkop__acties', naam: /Algemeen/ },
  'meer/vergrendeling.aanzetten': { haak: 'slot-schakelaar', naam: /Bloei vergrendelen/ },
  'meer/vergrendeling.code': { naam: /Bloei vergrendelen|Pincode/ },
  'meer/vergrendeling.faceid': { rol: 'radiogroup', haak: 'slot-keuze', naam: /Face ID/ },
  'meer/vergrendeling.herstel': { haak: 'slot-herstel', naam: /Herstelcode/, optioneel: true }, // alleen met het slot aan (BESLISSING 531)
  'meer/vergrendeling.voorbeeld': { sel: '.slotvoorbeeld' },
  // Herinneringen: in de ontwikkelversie is de dienst er niet ("niet beschikbaar"): dan staat alleen het voorbeeld op het scherm, de rest valt weg.
  'meer/meldingen.installeren': { sel: '.meldingen__stappen', optioneel: true },
  'meer/meldingen.hoofd': { sel: '.meldingen__hoofd', optioneel: true },
  'meer/meldingen.soort': { sel: '.meldingen__soort', optioneel: true },
  'meer/meldingen.uur': { sel: '.meldingen__uur, .meldingen__slot', optioneel: true },
  'meer/meldingen.toevoegen': { sel: '.meldingen__toevoegen', optioneel: true },
  'meer/meldingen.details': { sel: '.meldingen__details', optioneel: true }, // BESLISSING 710: de schakelaar Details tonen, net als de andere onderdelen alleen als de dienst er is
  'meer/meldingen.voorbeeld': { sel: '.meldingen__voorbeeldkaart, .instel__voorbeeld' },
  'meer/profiel.kaart': { sel: '.kaart.instellingen__profiel' },
  'meer/profiel.voorbeeld': { sel: '.instel__voorbeeld:has(.profielvoorbeeld)' }, // het zichtbare vlak rond de kaart (op desktop getint)
  'meer/profiel.weetjes': { sel: '.instel__weetjes' },
  'meer/profiel.kop': { sel: '.schermkop__acties', naam: /Algemeen/ },
  'meer/favorieten.toevoegen': { sel: '.favoriet__nieuw' },
  'meer/favorieten.gebruiken': { sel: '.instel__voorbeeld' },
  'meer/favorieten.weghalen': { sel: '.drank__weg', optioneel: true },
  'meer/badges.betekenis': { sel: '.medaillekaart' },
  'meer/badges.ring': { sel: '.medaille.is-open' },
  'meer/badges.groepen': { sel: '.badgegroep' },
  'meer/badges.aantikken': { sel: '.medaillekaart, .medailleraster button' },
  'h:maaltijd.regel': { sel: '.maaltijd' },
  'h:maaltijd.open': { tag: 'textarea' },
  'h:maaltijd.uur': { haak: 'maaltijd-uur', naam: /Uur/ },
  'h:maaltijd.gevoel': { haak: 'maaltijd-gevoel', naam: /Hoe voelde/ },
  'h:maaltijd.bewaard': { tag: 'button', haak: 'maaltijd-bewaren', naam: new RegExp(`^${BEWAAR_MAALTIJD_TEKST}$`) }, // BESLISSING 226
  'h:maaltijd.later': { sel: '.maaltijd' },
  'h:maaltijd.weg': { tag: 'button', haak: 'maaltijd-verwijderen', naam: /^Verwijderen$/ }, // BESLISSING 223: de knop Verwijderen, niet het hartje van favoriet
  'h:maaltijd.favoriet': { tag: 'button', haak: 'maaltijd-favoriet', naam: /favoriet/ },
  'h:maaltijd.gebruik': { sel: '.eten__favorieten', optioneel: true },
  'h:drinken.tik': { sel: '.drankknop' },
  'h:drinken.melding': { sel: '.strook', naam: /Ongedaan maken/ },
  'h:drinken.laatste': { sel: '.drinken__laatste, .drinkkaart__acties' },
  'h:drinken.regel': { sel: '.drinken__lijst' },
  'h:drinken.doel': { haak: 'voortgang' },
  'h:drinken.vorigeDag': GEEN,
  'h:supplementen.vandaag': { haak: 'momenten' },
  'h:supplementen.stand': { sel: '.vc--supp .kaartkop__eind' }, // BESLISSING 563: elke stap een eigen onderdeel
  'h:supplementen.terug': { sel: '.momentrij[data-moment="ochtend"]' },
  'h:supplementen.periodiek': { sel: '.momentrij[data-moment="beurt"]', optioneel: true },
  'h:lijst.rij': { haak: 'supplement-rij' },
  'h:lijst.naam': { haak: 'kaart-naam', naam: /Naam/ },
  'h:lijst.hoeveelheid': { haak: 'kaart-hoeveelheid', naam: /Hoeveelheid/ },
  'h:lijst.ritme': { haak: 'kaart-ritme', naam: /Ritme/ },
  'h:lijst.momenten': { haak: 'kaart-momenten', naam: /Momenten/ },
  // BESLISSING 703: Periode in twee stappen: de kop met Begint op, daarna Stopt na (geen haken: klassen).
  'h:lijst.periode': { sel: '.supplementkaart__periodekop' },
  'h:lijst.einde': { sel: '.supplementkaart__periode .supplementkaart__velden > :nth-child(2)' },
  'h:lijst.bewaren': { tag: 'button', naam: /^Bewaren$/ /* BESLISSING 561; de naam is de tekst van de hele knoppengroep */ },
  'h:lijst.weg': { tag: 'button', naam: /^Verwijderen$/ },
  'h:lijst.nieuw': { tag: 'button', naam: /Supplement toevoegen/ },
  'h:gewicht.knop': { tag: 'button', naam: /Weging noteren/ },
  'h:gewicht.getal': { sel: '.gewicht__invoer' },
  'h:gewicht.datum': { haak: 'weging-datum' },
  'h:gewicht.bewaar': { tag: 'button', haak: 'weging-bewaar' },
  'h:gewicht.aanpassen': { haak: 'gewicht-lijst' },
  'h:gewicht.periode': { rol: 'radiogroup', haak: 'grafiek-periode' }, // alleen vanaf twee wegingen
  'h:gewicht.punt': { haak: 'grafiek-vlak' },
  'h:gewicht.streef': { haak: 'streefgewicht' },
  'h:stemming.gezicht': { rol: 'radiogroup', sel: '.gevoel' },
  'h:stemming.energie': { rol: 'radiogroup', sel: '.energie' },
  'h:stemming.wissen': { sel: '.gevoel .is-gekozen' },
  'h:stemming.terug': GEEN,
  'h:dagboek.weergave': { rol: 'radiogroup', naam: /Weergave/ },
  'h:dagboek.bladeren': { sel: '.bladerkop' },
  'h:dagboek.vandaag': { sel: '.dagboek__home', naam: /Naar vandaag|Vandaag/ },
  'h:dagboek.dag': GEEN,
  'h:dagboek.notitie': { sel: '.dag__notitie' },
  'h:slot.aanzetten': { haak: 'slot-schakelaar', naam: /Bloei vergrendelen/ },
  'h:slot.code': { sel: '.slotvoorbeeld__rooster' },
  'h:slot.faceid': { haak: 'slot-keuze', naam: /Face ID/ },
  'h:slot.terugkeer': { sel: '.instel__weetjes, .meldingen__goed' },
  'h:slot.wijzigen': { haak: 'slot-pin', optioneel: true }, // alleen als het slot aan staat
  'h:slot.vergeten': { sel: '.slotvoorbeeld__kwijt', naam: /Ik ken mijn code niet meer/ },
  // BESLISSING 645: "Een thema kiezen" is dezelfde stap als Thema op Algemeen (de hele kaart met haar kop).
  'h:thema.kaart': { haak: 'thema', sel: '.kaart.meer__themakaart' },
};

test('elke stap heeft een verwachting, en elke verwachting hoort bij een stap', () => {
  const sleutels = Object.keys(STAPPEN).filter((k) => !k.endsWith('beginscherm'));
  const lijst = [];
  for (const k of sleutels) {
    for (const s of STAPPEN[k]) {
      const naam = k + '.' + s.id;
      if (!(naam in VERWACHT)) lijst.push(naam + ' heeft nog geen verwachting');
      else if (s.midden && VERWACHT[naam] !== null) lijst.push(naam + ' staat midden: geen onderdeel');
      else if (!s.midden && VERWACHT[naam] === null) lijst.push(naam + ' wijst een onderdeel aan');
    }
  }
  for (const naam of Object.keys(VERWACHT)) {
    const i = naam.lastIndexOf('.');
    if (!STAPPEN[naam.slice(0, i)]?.some((s) => s.id === naam.slice(i + 1))) lijst.push(naam + ' bestaat niet meer in stappen.js');
  }
  expect(lijst, lijst.join('\n')).toEqual([]);
});

// Eén test per rondleiding (en per weergave of gegevensstand): bij elke stap wijst de uitlichting het onderdeel aan waar de tekst over gaat, de
// stappen waarvan het onderdeel ontbreekt vallen weg zonder dat de rondleiding hapert, en de gegevens zijn na afloop exact zoals ze waren.
//  - alleen: de stappen die in deze variant op het scherm moeten komen (de rest hoort er niet te zijn);
//  - zonder: stappen die in deze variant moeten wegvallen; alle andere niet-optionele stappen moeten er zijn.
const SCHERM_SLEUTELS = Object.keys(STAPPEN).filter((k) => !k.startsWith('h:') && k !== 'beginscherm' && k !== 'dagboek');
const HANDELING_SLEUTELS = Object.keys(STAPPEN).filter((k) => k.startsWith('h:') && k !== 'h:beginscherm');
const VARIANTEN = [
  ...SCHERM_SLEUTELS.map((s) => ({ naam: s, sleutel: s, hash: s })),
  { naam: 'dagboek (dag)', sleutel: 'dagboek', hash: 'dagboek', alleen: ['kop', 'weergave', 'bladeren', 'delen', 'eten', 'notitie', 'drinken', 'supplementen', 'stemming'] },
  { naam: 'dagboek (week)', sleutel: 'dagboek', hash: 'dagboek/week', alleen: ['kop', 'weergave', 'bladeren', 'delen', 'weekcijfers', 'weekschema'] },
  { naam: 'dagboek (maand)', sleutel: 'dagboek', hash: 'dagboek/maand', alleen: ['kop', 'weergave', 'bladeren', 'delen', 'cijfers', 'maand', 'tekens', 'paneel', 'beurt'] }, // BESLISSING 703: tekens alleen in maand
  // Zonder spuit staat er op Vandaag geen rij voor een spuit.
  { naam: 'vandaag (zonder spuit)', sleutel: 'vandaag', hash: 'vandaag', zaai: { spuit: false }, zonder: ['spuit'] },
  // Minder dan twee wegingen: geen periodekeuze. Zonder streefgewicht: geen "Weg naar je streefgewicht".
  { naam: 'gewicht (één weging, zonder streefgewicht)', sleutel: 'gewicht', hash: 'gewicht', zaai: { wegingen: 1, streef: false }, zonder: ['periode', 'weg'] },
  { naam: 'gewicht (geen wegingen)', sleutel: 'gewicht', hash: 'gewicht', zaai: { wegingen: 0, streef: false }, zonder: ['periode', 'weg'] },
  { naam: 'gewicht (twee wegingen, met streefgewicht)', sleutel: 'gewicht', hash: 'gewicht', zaai: { wegingen: 2, streef: true } },
  ...HANDELING_SLEUTELS.map((s) => ({ naam: s, sleutel: s, hash: null })),
];

for (const v of VARIANTEN) {
  test(`rondleiding ${v.naam}: elke stap wijst het onderdeel aan waar de tekst over gaat en de gegevens blijven gelijk`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await zaaiEnLaad(page, v.zaai);
    const handeling = v.sleutel.startsWith('h:');
    const stappen = stappenVoor(v.sleutel);

    // De gegevens meten op het scherm waar de rondleiding gebeurt, nadat het klaar is met tekenen (een scherm mag bij het openen zelf iets bijwerken).
    const doelRoute = handeling ? HANDELING_SCHERM[v.sleutel.slice(2)] : v.hash;
    await openScherm(page, doelRoute, handeling || !v.hash.startsWith('dagboek/') ? doelRoute : 'dagboek');
    const voor = await momentopname(page);

    if (handeling) await startHandeling(page, TEKSTEN.uitleg.onderwerp[v.sleutel.slice(2)]);
    else await startScherm(page);

    const gezien = new Set();
    const fouten = [];
    await loopStappen(page, async ({ titel }) => {
      const st = stappen.find((x) => x.titel === titel);
      if (!st) {
        fouten.push(`titel "${titel}" hoort bij geen stap van ${v.sleutel}`);
        return;
      }
      const naam = v.sleutel + '.' + st.id;
      gezien.add(st.id);
      const spec = VERWACHT[naam];
      if (st.midden || !spec) return;
      const uit = await page.evaluate(
        ([doel, sp]) => {
          const el = [...document.querySelectorAll(doel)].find((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          if (!el) return 'niet gevonden';
          const naamVan = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim();
          const fout = [];
          if (sp.tag && el.tagName.toLowerCase() !== sp.tag) fout.push('element is ' + el.tagName.toLowerCase() + ', niet ' + sp.tag);
          if (sp.haak && el.getAttribute('data-uitleg') !== sp.haak) fout.push('haak is ' + el.getAttribute('data-uitleg') + ', niet ' + sp.haak);
          if (sp.rol && el.getAttribute('role') !== sp.rol) fout.push('rol is ' + el.getAttribute('role') + ', niet ' + sp.rol);
          if (sp.sel && !el.matches(sp.sel)) fout.push('past niet bij ' + sp.sel + ' (is ' + el.tagName.toLowerCase() + '.' + el.className + ')');
          if (sp.naam && !new RegExp(sp.naam.bron, sp.naam.vlag).test(naamVan(el))) fout.push('naam is "' + naamVan(el).slice(0, 60) + '", niet ' + sp.naam.bron);
          return fout.join('; ');
        },
        [st.doel, { ...spec, naam: spec.naam ? { bron: spec.naam.source, vlag: spec.naam.flags } : undefined }],
      );
      if (uit) fouten.push(naam + ' (' + titel + '): ' + uit);
    });

    // Welke stappen moesten er komen, welke moesten wegvallen?
    for (const s of stappen) {
      const naam = v.sleutel + '.' + s.id;
      const hoortErbij = v.alleen ? v.alleen.includes(s.id) : !(v.zonder ?? []).includes(s.id) && !VERWACHT[naam]?.optioneel;
      const hoortWeg = v.alleen ? !v.alleen.includes(s.id) : (v.zonder ?? []).includes(s.id);
      if (hoortErbij && !gezien.has(s.id)) fouten.push(naam + ': de stap komt niet op het scherm (het onderdeel ontbreekt)');
      if (hoortWeg && gezien.has(s.id)) fouten.push(naam + ': de stap hoort in deze variant weg te vallen, maar komt wel');
    }
    expect(fouten, fouten.join('\n')).toEqual([]);

    // De rondleiding veranderde niets aan de gegevens.
    await rustig(page);
    expect(zonderGezien(await momentopname(page))).toEqual(zonderGezien(voor));
  });
}

// ---- BESLISSING 236: het scherm Uitleg heeft links en rechts in evenwicht ----
for (const [breed, hoog] of [[1690, 950], [1280, 800], [390, 844]]) {
  test(`Meer › Uitleg op ${breed} px: links en rechts even breed en even hoog, geen leeg vlak, niets buiten beeld`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await openScherm(page, 'meer/uitleg');
    await expect(page.locator('#scherm .schermkop h1')).toHaveText('Rondleiding');
    const m = await page.evaluate(() => {
      const [l, r] = [...document.querySelectorAll('.uitleg__tweeen > .instel__lijst')].map((e) => e.getBoundingClientRect());
      const rijen = [...document.querySelectorAll('.uitleg__rechts .rij')].map((e) => e.getBoundingClientRect().height);
      const links = [...document.querySelectorAll('.uitleg__tweeen > .instel__lijst:first-child > *')].map((e) => e.getBoundingClientRect());
      const kaart = document.querySelector('.uitleg__tweeen').getBoundingClientRect();
      return { l: [l.left, l.top, l.width, l.height], r: [r.left, r.top, r.width, r.height], rijen, laatsteLinks: links[links.length - 1].bottom, kaartOnder: kaart.bottom, horizontaal: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(m.horizontaal).toBe(false);
    expect(m.rijen).toHaveLength(ONDERWERPEN.length);
    if (breed >= 960) {
      expect(Math.abs(m.l[2] - m.r[2]), 'even breed (1 op 1)').toBeLessThanOrEqual(2);
      expect(Math.abs(m.l[1] - m.r[1]), 'gelijke bovenlijn').toBeLessThanOrEqual(2);
      expect(Math.abs(m.l[3] - m.r[3]), 'gelijke onderlijn (even hoog)').toBeLessThanOrEqual(2);
      for (const h of m.rijen) expect(h, 'een rij rechts is niet leeg opgerekt').toBeLessThanOrEqual(100);
    } else {
      expect(m.r[1], 'onder elkaar op een telefoon').toBeGreaterThan(m.l[1] + m.l[3] - 2);
    }
    await expect(page.getByRole('button', { name: /^Toon het me: / })).toHaveCount(ONDERWERPEN.length);
  });
}

// ---- BESLISSING 248: het voorbeeld op Meer › Uitleg begint bij stap 1, met de echte eerste stap ----
for (const [breed, hoog] of [[1690, 950], [390, 844]]) {
  test(`Meer › Uitleg (${breed} px): het voorbeeld toont Stap 1 van n met de titel en tekst van de eerste stap, zonder Vorige en niet tikbaar`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await openScherm(page, 'meer/uitleg');
    const eerste = stappenVoor('drinken')[0];
    const v = page.locator('.uitleg__kaart--voorbeeld');
    await expect(v.locator('.uitleg__stap')).toHaveText(`Stap 1 van ${STAPPEN.drinken.length}`);
    await expect(v.locator('.uitleg__titel')).toHaveText(eerste.titel);
    await expect(v.locator('.uitleg__tekst')).toHaveText(eerste.tekst);
    await expect(v).not.toContainText('Vorige');
    await expect(v).toContainText('Volgende');
    await expect(v).toContainText('Overslaan');
    expect(await v.locator('button, a, input').count()).toBe(0);
    expect(await v.evaluate((el) => el.inert || Boolean(el.closest('[inert]')))).toBe(true);
    // BESLISSINGEN 346, 522 en 549: Volgende eerst, dan Overslaan. Geen lege ruimte: Volgende en Overslaan vullen samen de breedte van het kaartje (binnen zijn marges), even
    // breed en gecentreerd, zoals in stap 1 van de echte rondleiding.
    const m = await v.evaluate((el) => {
      const knoppen = [...el.querySelectorAll('.uitleg__nepknop')].map((k) => k.getBoundingClientRect());
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { breed: knoppen.map((k) => k.width), links: knoppen[0].left - r.left - parseFloat(cs.paddingLeft), rechts: r.right - parseFloat(cs.paddingRight) - knoppen[knoppen.length - 1].right, tekst: [...el.querySelectorAll('.uitleg__nepknop')].map((k) => k.textContent) };
    });
    expect(m.tekst).toEqual(['Volgende', 'Overslaan']);
    expect(Math.abs(m.breed[0] - m.breed[1]), 'even breed').toBeLessThanOrEqual(1);
    expect(Math.abs(m.links) + Math.abs(m.rechts), 'samen zo breed als het kaartje binnen zijn marges').toBeLessThanOrEqual(1);
  });
}

// ---- BESLISSING 346: "Goed om te weten" op Uitleg heeft drie weetjes en nooit een lege rastercel ----
for (const [breed, hoog] of [[1690, 1230], [1280, 800], [820, 1180], [390, 844]]) {
  test(`Meer › Uitleg op ${breed} px: de drie weetjes vullen hun raster (drie naast of onder elkaar, geen lege cel)`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await openScherm(page, 'meer/uitleg');
    const m = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const rij = document.querySelector('.uitleg__tweeen .instel__weetjesrij');
      const weetjes = [...rij.querySelectorAll('.weetje')];
      return {
        aantal: weetjes.length,
        kolommen: getComputedStyle(rij).gridTemplateColumns.split(' ').length,
        ys: weetjes.map((e) => Math.round(r(e).top)),
        breedtes: weetjes.map((e) => Math.round(r(e).width)),
        hoogtes: weetjes.map((e) => Math.round(r(e).height)),
        kop: (() => {
          const k = document.querySelector('.uitleg__weetjes');
          const kop = k.querySelector(':scope > .kaartkop');
          const cs = getComputedStyle(kop);
          const ks = getComputedStyle(k);
          return {
            tegel: Boolean(kop.querySelector('.tegel')),
            titel: kop.querySelector('.kaartkop__label').textContent.trim(),
            lijnOnder: parseFloat(cs.borderBottomWidth),
            lijnBoven: parseFloat(ks.borderTopWidth) + parseFloat(cs.borderTopWidth),
            naLijn: r(rij).top - r(kop).bottom,
          };
        })(),
        // BESLISSING 568 en 569 (vervangen 353, 560 en 566): een tekst van een of twee regels staat verticaal gecentreerd op haar tegel, een tekst van
        // drie of meer regels begint op de bovenrand van de tegel. Gemeten op de kaders van tegel en tekst (regels = hoogte van de tekst / 20 px regelhoogte).
        lijn: weetjes.map((e) => {
          const t = e.querySelector('.weetje__tekst');
          const tegel = r(e.firstElementChild);
          const tekst = r(t);
          const regels = Math.round(tekst.height / parseFloat(getComputedStyle(t).lineHeight));
          const afwijking = regels <= 2 ? (tekst.top + tekst.height / 2) - (tegel.top + tegel.height / 2) : tekst.top - tegel.top;
          return { regels, afwijking: Math.round(afwijking * 10) / 10 };
        }),
      };
    });
    expect(m.aantal).toBe(3);
    // BESLISSING 362: dezelfde kaartkop als elders: icoontegel, titel, een lijn eronder (12 px daaronder de weetjes) en geen lijn erboven.
    expect(m.kop.tegel, 'de kop heeft een icoontegel').toBe(true);
    expect(m.kop.titel).toBe('Goed om te weten');
    expect(m.kop.lijnOnder, 'een lijn onder de kop').toBeGreaterThanOrEqual(1);
    expect(m.kop.lijnBoven, 'geen lijn boven de kop').toBe(0);
    expect(m.kop.naLijn, 'de weetjes staan 12 px onder de lijn').toBeGreaterThanOrEqual(11);
    expect(m.kop.naLijn).toBeLessThanOrEqual(13);
    for (const v of m.lijn) expect(Math.abs(v.afwijking), `een tekst van ${v.regels} regel(s) staat ${v.regels <= 2 ? 'gecentreerd op' : 'bovenaan gelijk met'} de tegel (${JSON.stringify(m.lijn)})`).toBeLessThanOrEqual(1);
    // Een raster van 2 kolommen met drie weetjes laat een cel leeg: alleen 3 naast of 1 onder elkaar.
    expect([1, 3], `een raster van ${m.kolommen} kolommen met 3 weetjes heeft een lege cel`).toContain(m.kolommen);
    expect(Math.max(...m.breedtes) - Math.min(...m.breedtes), 'de weetjes zijn even breed').toBeLessThanOrEqual(1);
    if (m.kolommen === 3) expect(Math.max(...m.ys) - Math.min(...m.ys), 'de drie weetjes staan op één rij').toBeLessThanOrEqual(1);
  });
}

// ---- BESLISSING 346: geen lege ruimte op het scherm Uitleg; tikdoelen van minstens 44 px ----
for (const [breed, hoog] of [[1690, 1230], [1280, 800], [820, 1180], [390, 844]]) {
  test(`Meer › Uitleg op ${breed} px: geen leeg vlak boven 32 px, geen uitgerekte rijen, kolommen gelijk, tikdoelen van 44 px zonder hogere rijen`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await openScherm(page, 'meer/uitleg');
    const m = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const lijsten = [...document.querySelectorAll('.uitleg__tweeen > .instel__lijst')];
      const [links, rechts] = lijsten;
      // Het gat tussen twee opeenvolgende blokken in de linkerkolom (de zichtbare ruimte tussen de onderkant van het ene en de bovenkant van het volgende).
      // Onder elkaar (telefoon) staat "Goed om te weten" met order: 2 helemaal onderaan, onder de rechterkolom: dan tellen de blokken
      // van beide kolommen samen, in de volgorde op het scherm (niet in de DOM-volgorde: die gaf 983 px "gat" op de plek van de rechterkolom).
      const onderElkaar = r(rechts).top >= r(links).bottom - 2 || [...links.children].some((k) => r(k).top >= r(rechts).bottom - 2);
      const blokken = (onderElkaar ? [...links.children, ...rechts.children] : [...links.children]).map(r).sort((a, b) => a.top - b.top);
      const gaten = blokken.slice(1).map((b, i) => b.top - Math.max(...blokken.slice(0, i + 1).map((x) => x.bottom)));
      const voorbeeld = document.querySelector('.uitleg__kaart--voorbeeld');
      const houder = voorbeeld.parentElement;
      const rijen = [...document.querySelectorAll('.uitleg__rechts .rij')].map((e) => r(e).height);
      const knoppen = [...document.querySelectorAll('.uitleg-scherm .rij .knop')].map((k) => {
        const na = getComputedStyle(k, '::after');
        const ks = getComputedStyle(k);
        // inDeling: de ruimte die de knop op de indeling inneemt (hoogte plus de negatieve marges boven en onder)
        return { naam: k.textContent.trim(), hoogte: r(k).height, inDeling: r(k).height + parseFloat(ks.marginTop) + parseFloat(ks.marginBottom), vlak: Math.max(r(k).height, parseFloat(na.height) || 0), // het tikvlak: de knop zelf of het vlak eromheen (::after), het grootste
           vlakBreed: Math.max(r(k).width, parseFloat(na.width) || 0), breed: r(k).width };
      });
      const rijHoogtes = [...document.querySelectorAll('.uitleg-scherm .rij')].map((e) => Math.round(r(e).height));
      const stap1 = document.querySelector('.uitleg__kaart--voorbeeld .uitleg__acties');
      return {
        gaten,
        voorbeeldOnder: Math.round(r(voorbeeld).bottom),
        houderOnder: Math.round(r(houder).bottom),
        kolommen: [r(links).bottom, r(rechts).bottom],
        gestapeld: r(rechts).top >= r(links).bottom - 2,
        rijen,
        lucht: Math.min(
          ...[...document.querySelectorAll('.uitleg__rechts .rij')].flatMap((e) => {
            const kader = r(e);
            return [...e.querySelectorAll('.tegel, .knop')].flatMap((x) => [r(x).top - kader.top, kader.bottom - r(x).bottom]);
          }),
        ),
        knoppen,
        rijHoogtes,
        acties: Math.round(r(stap1).height),
        horizontaal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(m.horizontaal).toBe(false);
    // Geen leeg vlak: niets in de kolom met meer dan 32 px tussen twee blokken, en het voorbeeld eindigt waar zijn kaart eindigt.
    // BESLISSING 360: de tussenruimtes in de linkerkolom zijn hoogstens 32 px (vanaf 960 px precies 32 px).
    for (const g of m.gaten) expect(g, 'ruimte tussen twee blokken in de linkerkolom').toBeLessThanOrEqual(32);
    expect(Math.abs(m.houderOnder - m.voorbeeldOnder), 'de kaart van het voorbeeld is zo hoog als haar inhoud').toBeLessThanOrEqual(2);
    if (breed >= 960) {
      expect(Math.abs(m.kolommen[0] - m.kolommen[1]), 'links en rechts eindigen gelijk').toBeLessThanOrEqual(2);
      // BESLISSING 360: de dertien rijen rechts zijn alle even hoog (≤ 1 px), minstens 50 px, niet uitgerekt, met lucht rond de tegel en de knop.
      expect(Math.max(...m.rijen) - Math.min(...m.rijen), 'alle rijen rechts even hoog').toBeLessThanOrEqual(1);
      // Sinds de lijst zestien rijen heeft (vier instellingen kwamen in de plaats van "Mijn instellingen") zijn ze minstens 46 px: 16 x 51 px was hoger dan de linkerkolom.
      expect(Math.min(...m.rijen), 'rijen rechts minstens 46 px').toBeGreaterThanOrEqual(45.5);
      expect(Math.max(...m.rijen), 'een rij rechts is niet uitgerekt').toBeLessThanOrEqual(64);
      expect(m.lucht, 'ruimte tussen tegel of knop en de lijn').toBeGreaterThanOrEqual(3);
    } else {
      for (const h of m.rijen) expect(h, 'een rij is niet uitgerekt').toBeLessThanOrEqual(90);
    }
    // Tikdoelen: de knop "Alle rondleidingen opnieuw tonen" en de dertien "Toon het me" hebben een tikvlak van minstens 44 px hoog over de volle knopbreedte.
    expect(m.knoppen).toHaveLength(ONDERWERPEN.length + 1);
    for (const k of m.knoppen) {
      // BESLISSING 182/426: het tikvlak (de knop zelf of het onzichtbare vlak eromheen, het grootste) is minstens 44 px; de rij houdt haar
      // maat: de knop neemt op de indeling hoogstens 41 px in.
      expect(k.inDeling, `${k.naam}: de knop neemt ${k.inDeling} px in op de indeling`).toBeLessThanOrEqual(41);
      expect(k.vlak, `${k.naam}: tikvlak`).toBeGreaterThanOrEqual(44);
      expect(k.vlakBreed, `${k.naam}: tikvlak breed`).toBeGreaterThanOrEqual(k.breed - 1);
    }
  });
}

// ---- BESLISSING 250: een uitlegkaartje is zo hoog als zijn inhoud, nooit over de volle hoogte van het venster ----
for (const [breed, hoog] of [[1690, 950], [1280, 800], [390, 844]]) {
  test(`alle uitlegkaartjes (welkom, stap, laatste stap, midden) zijn zo hoog als hun inhoud op ${breed} px`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    const hoogteOk = async (selector, naam) => {
      await rustig(page);
      const m = await page.locator(selector).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        // De inhoud: de onderkant van het laatste zichtbare kind, plus de binnenruimte onderaan.
        const kinderen = [...el.children].filter((k) => k.getBoundingClientRect().height > 0 && !k.hidden);
        const onder = Math.max(...kinderen.map((k) => k.getBoundingClientRect().bottom));
        const stijl = getComputedStyle(el);
        return { hoogte: r.height, inhoud: onder - r.top + parseFloat(stijl.paddingBottom), venster: innerHeight };
      });
      expect(m.hoogte, `${naam}: hoogte ${m.hoogte} is meer dan de inhoud ${m.inhoud}`).toBeLessThanOrEqual(m.inhoud + 4);
      expect(m.hoogte, `${naam}: niet over de volle hoogte`).toBeLessThan(m.venster * (naam === 'welkom' ? 0.5 : 0.8));
    };
    // Het welkomstkaartje (eerste bezoek).
    await page.addInitScript(() => {
      if (!localStorage.getItem('bloei-uitleg')) localStorage.setItem('bloei-uitleg', JSON.stringify({ echt: true }));
    });
    await page.goto('./#/meer');
    await expect(page.locator('.uitleg--welkom .uitleg__kaart')).toBeVisible({ timeout: 8000 });
    await hoogteOk('.uitleg--welkom .uitleg__kaart', 'welkom');
    if (breed >= 1280) expect((await page.locator('.uitleg--welkom .uitleg__kaart').boundingBox()).height).toBeLessThan(220);
    await page.getByRole('button', { name: 'Liever niet' }).click();
    await expect(page.locator('.uitleg--welkom')).toHaveCount(0);
    // Een gewone stap, de laatste stap en een kaartje zonder doel (midden).
    await openScherm(page, 'drinken');
    await startScherm(page);
    await hoogteOk('.uitleg__kaart[role="dialog"]', 'stap');
    for (let i = 0; i < 30; i++) {
      if (await kaart(page).getByRole('button', { name: 'Klaar' }).count()) break;
      await kaart(page).getByRole('button', { name: 'Volgende' }).evaluate((el) => el.click());
      await expect(stapLabel(page)).toHaveText(new RegExp(`^Stap ${i + 2} van`));
    }
    await hoogteOk('.uitleg__kaart[role="dialog"]', 'laatste stap');
    await page.keyboard.press('Escape');
    await startHandeling(page, 'Bloei op mijn beginscherm zetten');
    await expect(page.locator('.uitleg.is-midden')).toHaveCount(1);
    await hoogteOk('.uitleg__kaart[role="dialog"]', 'midden');
  });
}

test('het welkomstkaartje komt alleen bij een eerste bezoek of na Alle rondleidingen opnieuw tonen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 950 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('bloei-uitleg')) localStorage.setItem('bloei-uitleg', JSON.stringify({ echt: true }));
  });
  await page.goto('./#/meer');
  await expect(page.locator('.uitleg--welkom')).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Liever niet' }).click();
  await page.reload();
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer');
  await rustig(page, 2500);
  await expect(page.locator('.uitleg--welkom')).toHaveCount(0);
  await page.goto('./#/meer/uitleg');
  await page.getByRole('button', { name: 'Alle rondleidingen opnieuw tonen' }).click();
  await expect.poll(async () => (await staat(page)).welkom).toBe(false);
  await page.reload();
  await expect(page.locator('.uitleg--welkom')).toBeVisible({ timeout: 8000 });
});

// ---- BESLISSINGEN 328 en 523: de uitlichting volgt het ZICHTBARE onderdeel en de kaart staat vrij, op elk toestel ----
// Die bewaking staat in x-uitleg-uitlichting.spec.js (met x-uitleg-meting.js): elke stap van elke rondleiding en elke handeling op acht formaten
// (iPhone 390 en 360, liggend 844, Pixel 7, iPad 820 en 1180, computer 1280 en 1690), met aanraking of muis. Ze vervangt de vroegere meting
// hier (vier formaten, het gat rond het element) door een strengere: het gat rond wat je ZIET (zonder tikvlak), het onderdeel niet bedekt,
// de kaart nooit over het onderdeel of de vaste kop, de kleuren van het scherm, gecentreerde en even brede knoppen, en ook het volgen na
// scrollen en na een andere venstermaat in elke stap.

// Een tik buiten het kaartje doet niets; de stap Uitleg en Delen op Vandaag licht beide knoppen samen uit (BESLISSING 258).
test('een tik op de sluier of in het gat doet niets en de rondleiding blijft staan; Uitleg en Delen staan samen in één gat', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await zaaiEnLaad(page);
  await openScherm(page, 'drinken');
  const voor = await momentopname(page);
  await startScherm(page);
  await rustig(page);
  // Midden in het gat (de kan van vandaag) en ergens op de sluier tikken.
  const g = await page.locator('.uitleg__gat').boundingBox();
  await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.click(5, 400);
  await expect(kaart(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/drinken$/);
  await expect(stapLabel(page)).toHaveText(/^Stap 1 van/);
  await page.keyboard.press('Escape');
  expect(await momentopname(page)).toEqual(voor);

  await openScherm(page, 'vandaag');
  await startScherm(page);
  await kaart(page).getByRole('button', { name: 'Volgende' }).click();
  await expect(kaart(page).locator('.uitleg__titel')).toHaveText('Rondleiding, Delen en home');
  await rustig(page);
  const omvat = await page.evaluate(() => {
    const l = document.querySelector('.uitleg__gat').getBoundingClientRect();
    return [...document.querySelectorAll('.begroeting__uitleg, a.begroeting__delen')].map((e) => {
      const r = e.getBoundingClientRect();
      return r.left >= l.left - 1 && r.right <= l.right + 1 && r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
    });
  });
  expect(omvat.length).toBe(2);
  expect(omvat.every(Boolean), String(omvat)).toBe(true);
});

// Een blad (dialog) dat een stap opent: het kaartje en de uitlichting liggen erboven, met één sluier (geen tweede dimvlak van het blad).
for (const [breed, hoog] of [[390, 844], [1180, 820]]) {
  test(`een onderdeel in een open blad is uitgelicht en het kaartje ligt boven het blad (${breed} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await zaaiEnLaad(page);
    await startHandeling(page, 'Een supplement aanpassen');
    // Het kaartje is eerst zichtbaar maar leeg: pas klikken als de eerste stap er echt staat.
    await expect(stapLabel(page)).toHaveText(/^Stap 1 van/);
    await kaart(page).getByRole('button', { name: 'Volgende' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await rustig(page);
    const m = await page.evaluate(() => {
      const k = document.querySelector('.uitleg__kaart[role="dialog"]').getBoundingClientRect();
      const midden = document.elementFromPoint(k.left + k.width / 2, k.top + 12);
      const veld = document.querySelector('[data-uitleg="kaart-naam"]').getBoundingClientRect();
      return {
        bovenop: Boolean(midden?.closest('.uitleg__kaart')),
        laagOpen: document.querySelector('.uitleg').matches(':popover-open'),
        dimvlak: getComputedStyle(document.querySelector('dialog[open]'), '::backdrop').backgroundColor,
        veldVrij: k.right <= veld.left || k.left >= veld.right || k.bottom <= veld.top || k.top >= veld.bottom,
      };
    });
    expect(m.bovenop, 'het kaartje ligt boven het blad').toBe(true);
    expect(m.laagOpen).toBe(true);
    expect(m.dimvlak, 'één sluier').toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(m.veldVrij, 'het kaartje staat niet over het veld').toBe(true);
    // Het kaartje is echt tikbaar (niet inert door het blad): een gewone klik op Volgende gaat naar de volgende stap.
    await kaart(page).getByRole('button', { name: 'Volgende' }).click();
    await expect(stapLabel(page)).toHaveText(/^Stap 3 van/);
    await expect(kaart(page).getByRole('button', { name: 'Volgende' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
}

// In elk thema springt het onderdeel eruit: de gedimde omgeving is duidelijk donkerder dan het uitgelichte onderdeel.
// Maat (gewijzigd, zie uitleg.css): de verhouding L* buiten / L* binnen is hoogstens 0,65 in elk thema. Het absolute verschil van 25 L* gold alleen in Poeder;
// in Nacht is de kaart zelf donker (binnen L* 13,8) en kan het verschil nooit 25 worden, terwijl het vak er duidelijk afsteekt (buiten 2,4, verhouding 0,18).
// Gemeten verhouding met de standaardsluier: Poeder 0,56 tot 0,60, Salie 0,56 tot 0,60, Nacht 0,14 tot 0,18; met een doorzichtige sluier (25 procent) 0,75 en 0,68.
async function zetThema(page, thema) {
  await page.evaluate(
    (keuze) =>
      new Promise((ok) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onsuccess = () => {
          const tx = q.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: keuze });
          tx.oncomplete = () => {
            q.result.close();
            ok();
          };
        };
      }),
    thema,
  );
  await page.reload();
}

// Mediaan van L* binnen het gat en in een ring van 24 tot 64 px eromheen, gemeten op een schermafbeelding.
async function helderheid(page) {
  const g = await page.locator('.uitleg__gat').boundingBox();
  const k = await page.locator('.uitleg__kaart[role="dialog"]').boundingBox();
  const beeld = await page.screenshot();
  return page.evaluate(
    async ({ data, g, k }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const schaal = img.width / innerWidth;
      const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lster = (px, py) => {
        const [r, gg, b] = x.getImageData(Math.round(px * schaal), Math.round(py * schaal), 1, 1).data;
        const y = 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
        return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
      };
      const inKaart = (px, py) => px >= k.x && px <= k.x + k.width && py >= k.y && py <= k.y + k.height;
      const binnen = [];
      const buiten = [];
      for (let i = 1; i < 12; i++) {
        for (let j = 1; j < 12; j++) {
          const px = g.x + (g.width * i) / 12;
          const py = g.y + (g.height * j) / 12;
          if (!inKaart(px, py)) binnen.push(lster(px, py));
        }
      }
      for (const d of [24, 40, 64]) {
        for (let i = 0; i <= 10; i++) {
          for (const [px, py] of [[g.x - d, g.y + (g.height * i) / 10], [g.x + g.width + d, g.y + (g.height * i) / 10], [g.x + (g.width * i) / 10, g.y - d], [g.x + (g.width * i) / 10, g.y + g.height + d]]) {
            if (px > 0 && py > 0 && px < innerWidth && py < innerHeight && !inKaart(px, py)) buiten.push(lster(px, py));
          }
        }
      }
      const med = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
      return { binnen: med(binnen), buiten: med(buiten) };
    },
    { data: beeld.toString('base64'), g, k },
  );
}

test('in Poeder, Salie en Nacht springt het uitgelichte onderdeel er even duidelijk uit', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await zaaiEnLaad(page);
  const verschil = {};
  for (const thema of ['poeder', 'salie', 'nacht']) {
    await zetThema(page, thema);
    await openScherm(page, 'drinken');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'poeder')).toBe(thema);
    await startScherm(page);
    await rustig(page);
    const h = await helderheid(page);
    verschil[thema] = { ...h, delta: h.binnen - h.buiten };
    await page.keyboard.press('Escape');
    await expect(kaart(page)).toHaveCount(0);
  }
  const info = JSON.stringify(verschil);
  for (const thema of ['poeder', 'salie', 'nacht']) {
    expect(verschil[thema].binnen, `${thema}: het onderdeel is lichter dan de omgeving: ${info}`).toBeGreaterThan(verschil[thema].buiten);
    expect(verschil[thema].buiten / verschil[thema].binnen, `${thema}: de omgeving is hoogstens 0,65 x zo licht als het onderdeel: ${info}`).toBeLessThanOrEqual(0.65);
  }
  test.info().annotations.push({ type: 'helderheid (L*)', description: info });
});

// ---- BESLISSING 549: een handeling die op het scherm Uitleg gestart werd ("Toon het me"), eindigt daar weer: na Klaar, Overslaan, Escape of de
// terugknop staat Uitleg er opnieuw, op dezelfde hoogte, met de focus op de knop die getikt werd. Een blad dat de handeling opende, is dicht
// en er is niets bewaard. Elke rij van het scherm, op een telefoon en op een computer. ----
for (const [breed, hoog] of [[390, 844], [1280, 800]]) {
  test(`Uitleg op ${breed} px: na elke handeling (Klaar, Overslaan, Escape, terugknop) terug op het scherm Uitleg, op dezelfde plaats en met de focus op de rij`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: breed, height: hoog });
    await zaaiEnLaad(page);
    await openScherm(page, 'meer/uitleg');
    const voor = zonderGezien(await momentopname(page));
    const manieren = ['Klaar', 'Overslaan', 'Escape', 'terugknop'];
    const fouten = [];
    for (const [n, o] of ONDERWERPEN.entries()) {
      const manier = manieren[n % manieren.length];
      const naam = `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp[o.id]}`;
      await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/uitleg');
      await rustig(page);
      const knop = page.getByRole('button', { name: naam });
      await knop.scrollIntoViewIfNeeded();
      // De hoogte op het moment van de tik (de klik van Playwright kan zelf nog scrollen om de knop vrij te krijgen).
      await page.evaluate(() => document.addEventListener('click', () => (window.__yBijTik = Math.round(window.scrollY)), { capture: true, once: true }));
      await knop.click();
      await expect(kaart(page)).toBeVisible({ timeout: 10000 });
      const y0 = await page.evaluate(() => window.__yBijTik);
      await rustig(page);
      if (manier === 'Klaar') await loopStappen(page);
      else if (manier === 'Overslaan') await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.overslaan }).click();
      else if (manier === 'Escape') await page.keyboard.press('Escape');
      else await page.goBack();
      await expect(kaart(page), `${o.id} (${manier})`).toHaveCount(0);
      await expect(page, `${o.id} (${manier})`).toHaveURL(/#\/meer\/uitleg$/);
      await expect(page.locator('#scherm'), `${o.id} (${manier})`).toHaveAttribute('data-scherm', 'meer/uitleg');
      await expect(page.locator('dialog[open]'), `${o.id} (${manier}): het blad van de handeling is dicht`).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), `${o.id} (${manier}): dezelfde hoogte`).toBeLessThanOrEqual(y0 + 2);
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), `${o.id} (${manier}): dezelfde hoogte`).toBeGreaterThanOrEqual(y0 - 2);
      const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim());
      if (focus !== naam) fouten.push(`${o.id} (${manier}): de focus staat op "${focus}" in plaats van "${naam}"`);
    }
    expect(fouten, fouten.join('\n')).toEqual([]);
    expect(zonderGezien(await momentopname(page)), 'er is niets bewaard').toEqual(voor);
  });
}

// BESLISSING 549: de knoppen van de kaart staan overal in de volgorde Volgende (of Klaar), Vorige, Overslaan: naast elkaar van links naar rechts,
// onder elkaar van boven naar onder. De DOM-, tab- en leesvolgorde is dezelfde; in stap 1 (geen Vorige) sluiten de twee knoppen aan zonder gat.
for (const [breed, hoog] of [[320, 568], [390, 844], [1280, 800]]) {
  test(`de knoppen van de kaart: Volgende, Vorige, Overslaan in beeld, in de DOM en met Tab (${breed} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await openScherm(page, 'drinken');
    await startScherm(page);
    const meet = () =>
      page.evaluate(() => {
        const knoppen = [...document.querySelectorAll('.uitleg__kaart[role="dialog"] .uitleg__acties > button')].filter((b) => !b.hidden);
        return knoppen.map((b) => {
          const r = b.getBoundingClientRect();
          return { tekst: b.textContent.trim(), l: r.left, t: r.top, r: r.right, b: r.bottom };
        });
      });
    const volgorde = (k) => {
      const onderElkaar = k.length > 1 && k[1].t >= k[0].b - 1;
      // zichtbaar: naast elkaar van links naar rechts, onder elkaar van boven naar onder
      return [...k].sort((a, b) => (onderElkaar ? a.t - b.t : a.l - b.l)).map((x) => x.tekst);
    };
    await rustig(page);
    const stap1 = await meet();
    expect(stap1.map((x) => x.tekst), 'stap 1: DOM').toEqual([TEKSTEN.uitleg.volgende, TEKSTEN.uitleg.overslaan]);
    expect(volgorde(stap1), 'stap 1: zichtbaar').toEqual([TEKSTEN.uitleg.volgende, TEKSTEN.uitleg.overslaan]);
    // geen gat tussen de twee knoppen (hoogstens de gewone tussenruimte van de rij)
    const tussen = stap1[1].t >= stap1[0].b - 1 ? stap1[1].t - stap1[0].b : stap1[1].l - stap1[0].r;
    expect(tussen, 'stap 1: de twee knoppen sluiten aan').toBeLessThanOrEqual(12);
    await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }).click();
    await expect(stapLabel(page)).toHaveText(/^Stap 2 van/);
    await rustig(page);
    const stap2 = await meet();
    const verwacht = [TEKSTEN.uitleg.volgende, TEKSTEN.uitleg.vorige, TEKSTEN.uitleg.overslaan];
    expect(stap2.map((x) => x.tekst), 'stap 2: DOM').toEqual(verwacht);
    expect(volgorde(stap2), 'stap 2: zichtbaar').toEqual(verwacht);
    // Tab loopt in dezelfde volgorde (vanaf Volgende, dat de focus heeft).
    await expect(kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende })).toBeFocused();
    const getabd = [];
    for (let i = 0; i < 3; i++) {
      getabd.push(await page.evaluate(() => document.activeElement?.textContent?.trim()));
      await page.keyboard.press('Tab');
    }
    expect(getabd, 'tabvolgorde').toEqual(verwacht);
    await page.keyboard.press('Escape');
    await expect(kaart(page)).toHaveCount(0);
  });
}

// ---- "De uitleg herhaalt zich" (melding van de eigenaar bij Delen, BESLISSINGEN 548 en 549): op elk formaat, met echte tikken, voor ELKE
// rondleiding en ELKE handeling. De teller loopt strikt op van 1 tot het einde, geen titel komt twee keer voor, de uitleg begint nooit vanzelf
// opnieuw (na Klaar, Overslaan, Escape, de terugknop, "Toon het stap voor stap" of het draaien van het toestel), en na het einde staat er geen
// uitlegkaart meer in de pagina, ook niet 2 seconden later en niet na een herlading. "Toon het stap voor stap" start de handeling (een andere
// sleutel) bij stap 1, met haar eigen titels en zonder een stap die de rondleiding ervoor net toonde. ----
const HERHAAL_ROUTES = ['vandaag', 'dagboek', 'dagboek/week', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht', 'meer', 'delen', 'meer/instellingen', 'meer/gewicht', 'meer/vergrendeling', 'meer/meldingen', 'meer/profiel', 'meer/favorieten', 'meer/badges'];
// Ook de titels van de afgeronde delen (STUKKEN, BESLISSING 627): op een telefoon toont een stap over een hoge kaart die in delen, elk met een eigen titel.
const titelsVan = (sleutel) => new Set([{}, { android: true, chrome: true }, { android: true, chrome: true, apk: true }, { android: true, chrome: false }].flatMap((o) => stappenVoor(sleutel, { android: false, chrome: false, apk: false, ...o }).flatMap((s) => [s.titel, tekstVoorToestel(s, { breed: true, muis: true }).titel, ...(s.stukken?.stukken ?? []).map((x) => x.titel)])));

// Een deel zonder eigen stuk krijgt een titel uit de namen van wat erin staat (STUKKEN, vervolg: "Sap, frisdrank en iets anders"). Zo'n titel
// is goed als de stap een vervolg heeft en elke naam erin een tekst van de app is.
const NAMEN_APP = new Set();
(function verzamel(o) {
  for (const w of Object.values(o)) typeof w === 'string' ? NAMEN_APP.add(w.toLowerCase()) : w && typeof w === 'object' && verzamel(w);
})(TEKSTEN);
const isVervolgTitel = (sleutel, titel) =>
  stappenVoor(sleutel, { android: false, chrome: false, apk: false }).some((s) => s.stukken?.vervolg) &&
  titel.replace(/^Ook /, '').split(/, | en /).every((n) => NAMEN_APP.has(n.trim().toLowerCase()));
const doelOpTitel = (sleutel, titel) => stappenVoor(sleutel, { android: false, chrome: false, apk: false }).find((s) => s.titel === titel && !s.midden)?.doel ?? null;

// Kijkt een tijdvak lang in de pagina of er een uitlegkaart verschijnt (geen pauze in de app: dit is het meetvenster van de test).
const kaartVerschijntIn = (page, ms) =>
  page.evaluate(
    (duur) =>
      new Promise((klaar) => {
        const KAART = '.uitleg[data-uitleg-laag], .uitleg--welkom'; // een lopende uitleg (niet het kaartje in het klein op het scherm Uitleg)
        let gezien = Boolean(document.querySelector(KAART));
        const w = new MutationObserver(() => {
          if (document.querySelector(KAART)) gezien = true;
        });
        w.observe(document.documentElement, { childList: true, subtree: true });
        const begin = performance.now();
        const kijk = () => {
          if (performance.now() - begin >= duur) {
            w.disconnect();
            klaar(gezien);
          } else requestAnimationFrame(kijk);
        };
        requestAnimationFrame(kijk);
      }),
    ms,
  );

for (const [breed, hoog, aanraak] of [[390, 844, true], [360, 740, true], [820, 1180, true], [1180, 820, true], [1280, 800, false], [1690, 1230, false]]) {
  test.describe(`geen herhaling en geen herstart op ${breed}x${hoog}`, () => {
    test.use({ viewport: { width: breed, height: hoog }, hasTouch: aanraak, isMobile: aanraak });
    const tik = (loc) => (aanraak ? loc.tap() : loc.click());
    let aanbodGetikt = false; // tikte loop() in de laatste stap op "Toon het stap voor stap"?

    // Loopt de lopende uitleg af met echte tikken. sluit: 'Klaar', 'Overslaan', 'Escape', 'terugknop' of 'aanbod' (de knop "Toon het stap voor
    // stap" in de laatste stap). draaien: in stap 2 het toestel draaien en terug. Geeft de titels.
    async function loop(page, wie, fouten, { sluit = 'Klaar', draaien = false } = {}) {
      const titels = [];
      let totaal = null;
      for (let i = 1; i <= 30; i++) {
        await rustig(page);
        const label = ((await stapLabel(page).textContent()) || '').trim();
        const m = label.match(/^Stap (\d+) van (\d+)$/);
        if (!m) {
          fouten.push(`${wie}: onleesbaar stapnummer "${label}"`);
          return titels;
        }
        totaal ??= Number(m[2]);
        if (Number(m[1]) !== i || Number(m[2]) !== totaal) fouten.push(`${wie}: stap ${i} toont "${label}" (de teller loopt niet strikt op)`);
        const titel = ((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim();
        if (titels.includes(titel)) fouten.push(`${wie}: "${titel}" komt twee keer voor`);
        titels.push(titel);
        if (draaien && i === 2) {
          await page.setViewportSize({ width: hoog, height: breed });
          await rustig(page);
          await page.setViewportSize({ width: breed, height: hoog });
          await rustig(page);
          const na = ((await stapLabel(page).textContent()) || '').trim();
          if (na !== label) fouten.push(`${wie}: na het draaien staat "${na}" in plaats van "${label}"`);
        }
        const laatste = i === totaal;
        if (!laatste && !['Klaar', 'aanbod'].includes(sluit) && i === Math.min(2, totaal)) {
          if (sluit === 'Overslaan') await tik(kaart(page).getByRole('button', { name: TEKSTEN.uitleg.overslaan }));
          else if (sluit === 'Escape') await page.keyboard.press('Escape');
          else await page.goBack();
          return titels;
        }
        if (laatste) {
          const aanbod = kaart(page).locator('.uitleg__aanbod .knop');
          aanbodGetikt = sluit === 'aanbod' && (await aanbod.isVisible());
          if (aanbodGetikt) await tik(aanbod);
          else await tik(kaart(page).getByRole('button', { name: TEKSTEN.uitleg.klaar }));
          return titels;
        }
        await tik(kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }));
        await expect(stapLabel(page)).toHaveText(`Stap ${i + 1} van ${totaal}`);
      }
      fouten.push(`${wie}: eindigt niet`);
      return titels;
    }
    // Na het einde: geen kaart, ook niet in de 2 seconden erna, en niet na een herlading.
    async function wegEnBlijftWeg(page, wie, fouten) {
      await expect(kaart(page), wie).toHaveCount(0);
      if (await kaartVerschijntIn(page, 2000)) fouten.push(`${wie}: binnen 2 s na het einde staat er weer een uitlegkaart`);
      await page.reload();
      await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
      await rustig(page);
      if (await kaartVerschijntIn(page, 2000)) fouten.push(`${wie}: na herladen staat er weer een uitlegkaart`);
    }

    test('elke schermrondleiding: oplopend, zonder dubbels, en weg na Klaar, Overslaan, Escape of terug (en na draaien)', async ({ page }) => {
      test.setTimeout(900000);
      await zaaiEnLaad(page);
      const fouten = [];
      const manieren = ['Klaar', 'Overslaan', 'Escape', 'terugknop'];
      for (const [n, route] of HERHAAL_ROUTES.entries()) {
        const sluit = manieren[n % manieren.length];
        await openScherm(page, route, route.startsWith('dagboek') ? 'dagboek' : route);
        await tik(page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first());
        await expect(kaart(page)).toBeVisible();
        await loop(page, `${route} (${sluit})`, fouten, { sluit, draaien: aanraak && n === 0 });
        await wegEnBlijftWeg(page, `${route} (${sluit})`, fouten);
      }
      expect(fouten, fouten.join('\n')).toEqual([]);
    });

    test('elke handeling vanuit Uitleg: oplopend, zonder dubbels, en weg na Klaar', async ({ page }) => {
      test.setTimeout(900000);
      await zaaiEnLaad(page);
      const fouten = [];
      for (const o of ONDERWERPEN) {
        await openScherm(page, 'meer/uitleg');
        const knop = page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp[o.id]}` });
        await knop.scrollIntoViewIfNeeded();
        await tik(knop);
        await expect(kaart(page)).toBeVisible({ timeout: 10000 });
        const titels = await loop(page, o.sleutel, fouten);
        const eigen = titelsVan(o.sleutel);
        for (const t of titels) if (!eigen.has(t) && !isVervolgTitel(o.sleutel, t)) fouten.push(`${o.sleutel}: "${t}" is geen stap van deze handeling`);
        await wegEnBlijftWeg(page, o.sleutel, fouten);
      }
      expect(fouten, fouten.join('\n')).toEqual([]);
    });

    test('"Toon het stap voor stap" start de handeling bij stap 1, zonder de stappen van de rondleiding te herhalen', async ({ page }) => {
      test.setTimeout(900000);
      await zaaiEnLaad(page);
      const fouten = [];
      for (const [route, handeling] of Object.entries(AANBOD)) {
        await openScherm(page, route, route);
        await tik(page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first());
        await expect(kaart(page)).toBeVisible();
        const rondleiding = await loop(page, route, fouten, { sluit: 'aanbod' });
        // Zonder aanbod in de laatste stap sloot de lus met Klaar: dan is er niets gestart.
        if (!aanbodGetikt) {
          await wegEnBlijftWeg(page, route, fouten);
          continue;
        }
        const wie = `${route} > h:${handeling}`;
        await expect(kaart(page), wie).toBeVisible({ timeout: 10000 }); // de handeling kan eerst naar haar eigen scherm gaan
        await expect(stapLabel(page), wie).toHaveText(/^Stap 1 van \d+$/, { timeout: 10000 });
        const titels = await loop(page, wie, fouten);
        const eigen = titelsVan('h:' + handeling);
        const gezien = new Set(rondleiding.map((t) => doelOpTitel(route, t)).filter(Boolean));
        for (const t of titels) {
          if (!eigen.has(t) && !isVervolgTitel('h:' + handeling, t)) fouten.push(`${wie}: "${t}" is geen stap van de handeling (dezelfde rondleiding opnieuw?)`);
          const d = doelOpTitel('h:' + handeling, t);
          if (rondleiding.includes(t) || (d && gezien.has(d))) fouten.push(`${wie}: "${t}" stond net al in de rondleiding (zelfde titel of zelfde onderdeel)`);
        }
        await wegEnBlijftWeg(page, wie, fouten);
      }
      expect(fouten, fouten.join('\n')).toEqual([]);
    });
  });
}

// BESLISSING 563: nergens dubbele uitleg. Binnen één rondleiding of handeling komt geen doel of titel twee keer voor (ook in de Android-varianten),
// en op het scherm Uitleg starten geen twee rijen dezelfde uitleg of dezelfde reeks stappen. (Zonder pagina: dit leest alleen stappen.js.)
test('geen doel of titel twee keer in één reeks, en geen twee rijen op Uitleg met dezelfde stappen', () => {
  const fouten = [];
  for (const toestel of [{ android: false, chrome: false, apk: false }, { android: true, chrome: true, apk: false }, { android: true, chrome: true, apk: true }]) {
    for (const sleutel of Object.keys(STAPPEN)) {
      const lijst = stappenVoor(sleutel, toestel);
      const doelen = lijst.filter((s) => !s.midden).map((s) => s.doel);
      const titels = lijst.map((s) => s.titel);
      for (const d of new Set(doelen)) if (doelen.filter((x) => x === d).length > 1) fouten.push(`${sleutel}: doel ${d} twee keer`);
      for (const x of new Set(titels)) if (titels.filter((y) => y === x).length > 1) fouten.push(`${sleutel}: titel "${x}" twee keer`);
    }
  }
  const reeks = (o) => stappenVoor(o.sleutel, { android: false, chrome: false, apk: false }).map((s) => s.doel || s.titel).join(' | ');
  for (const [i, a] of ONDERWERPEN.entries()) {
    for (const b of ONDERWERPEN.slice(i + 1)) {
      if (a.sleutel === b.sleutel) fouten.push(`Uitleg: ${a.id} en ${b.id} starten dezelfde uitleg (${a.sleutel})`);
      else if (reeks(a) === reeks(b)) fouten.push(`Uitleg: ${a.id} en ${b.id} tonen dezelfde stappen`);
    }
  }
  expect(fouten, fouten.join('\n')).toEqual([]);
});
