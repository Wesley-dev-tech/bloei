// Herstel van de bugs uit review R2 (schermen, ui, app) die in app.js, ui/, vandaag.js en hulp.js zaten. Elke test toonde eerst de bug.
// R2-01 dagdeelwissel tijdens invoer · R2-02 luisteraars van de medailles · R2-05 focus na hertekenen · R2-06 weekstrook "bijgehouden" ·
// R2-08 mediaquery per glas · R2-13 schrijfdag op Vandaag · R2-14 lui laden zonder foutafhandeling · R2-15 momentrij · R2-17 ResizeObservers.
import { test, expect } from '@playwright/test';
import { maaltijdblad, BEWAAR_MAALTIJD } from './r-wacht.js';
import { domRustig } from './wacht.js';

// Donderdag 19 november 2026: de week loopt van maandag 16 tot zondag 22 november.
const DONDERDAG = new Date(2026, 10, 19, 10, 0, 0);

// Leest alle rijen van een tabel uit de database van de app.
const rijen = (page, tabel) =>
  page.evaluate(
    (naam) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction(naam).objectStore(naam).getAll();
          vraag.onsuccess = () => {
            db.close();
            klaar(vraag.result);
          };
        };
      }),
    tabel,
  );
const datums = async (page, tabel) => (await rijen(page, tabel)).map((r) => r.datum).sort();

// Schrijft één rij rechtstreeks in de database (zoals een eerder bewaarde dag).
const zetRij = (page, tabel, rij) =>
  page.evaluate(
    ([naam, waarde]) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction(naam, 'readwrite');
          tx.objectStore(naam).put(waarde);
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
    [tabel, rij],
  );

// Een supplement met alleen het gekozen moment (standaard staat Ochtend aan).
async function voegSupplementToe(page, moment = 'Ochtend') {
  await page.goto('./#/supplementen');
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await blad.getByRole('textbox', { name: 'Naam' }).fill('Voorbeeld');
  if (moment !== 'Ochtend') {
    await blad.getByRole('button', { name: 'Ochtend', exact: true }).click();
    await blad.getByRole('button', { name: moment, exact: true }).click();
  }
  await blad.getByRole('button', { name: 'Bewaren' }).click();
  await expect(blad).toBeHidden();
}

const waterknop = (page) => page.locator('.vandaag .drankknop[data-soort="water"]');
async function drieGlazen(page) {
  for (let i = 1; i <= 3; i += 1) {
    await waterknop(page).click();
    await expect(page.locator('.vandaag .laatst__chip')).toHaveCount(i);
  }
  await domRustig(page); // de laatste hertekening is klaar
}

test.describe('R2-01 een wissel van dagdeel wacht tot de invoer klaar is', () => {
  test('om 12 uur blijft de open maaltijd open met de focus erin; daarna volgt de nieuwe begroeting', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 19, 11, 59, 50));
    await page.goto('./#/vandaag');
    await expect(page.locator('.begroeting__groet')).toContainText('Goeiemorgen');
    const regel = page.locator('.maaltijd').first();
    await regel.locator('> .rij').click();
    const blad = maaltijdblad(page); // BESLISSING 419: het invulvenster is een blad
    const vak = blad.locator('textarea');
    await vak.fill('yoghurt');
    // 12.00.05: de app komt terug (zoals na het wegleggen van de telefoon); er is geen herladen.
    await page.clock.setFixedTime(new Date(2026, 10, 19, 12, 0, 5));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    // Geen toestand om op te wachten (er mag net niets gebeuren): de wachter kijkt elke seconde opnieuw (app.js), dus 1,5 s.
    await page.waitForTimeout(1500);
    await expect(blad).toHaveCount(1);
    await expect(vak).toBeFocused();
    await vak.pressSequentially(' met fruit');
    await expect(vak).toHaveValue('yoghurt met fruit');
    await expect(page.locator('.begroeting__groet')).toContainText('Goeiemorgen');
    // Klaar met invullen: het blad gaat dicht, en dan pas komt de begroeting van de middag.
    await blad.getByRole('button', BEWAAR_MAALTIJD).click();
    await expect(blad).toHaveCount(0);
    await expect(page.locator('.begroeting__groet')).toContainText('Goeiemiddag', { timeout: 5000 });
    await expect.poll(async () => (await rijen(page, 'maaltijden')).map((m) => m.tekst)).toContain('yoghurt met fruit');
  });
});

test.describe('R2-02 en R2-08 Vandaag hertekenen laat geen luisteraars achter', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(DONDERDAG);
    await page.addInitScript(() => {
      // Telt de luisteraars op document (pointerdown, keydown) en de change-luisteraars op een mediaquery voor beweging.
      window.__docLuisteraars = 0;
      window.__mqLuisteraars = 0;
      const toevoegen = EventTarget.prototype.addEventListener;
      const weghalen = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (soort, f, o) {
        if (this === document && (soort === 'pointerdown' || soort === 'keydown')) window.__docLuisteraars += 1;
        if (typeof MediaQueryList !== 'undefined' && this instanceof MediaQueryList && soort === 'change' && /reduced-motion/.test(this.media)) window.__mqLuisteraars += 1;
        return toevoegen.call(this, soort, f, o);
      };
      EventTarget.prototype.removeEventListener = function (soort, f, o) {
        if (this === document && (soort === 'pointerdown' || soort === 'keydown')) window.__docLuisteraars -= 1;
        if (typeof MediaQueryList !== 'undefined' && this instanceof MediaQueryList && soort === 'change' && /reduced-motion/.test(this.media)) window.__mqLuisteraars -= 1;
        return weghalen.call(this, soort, f, o);
      };
    });
  });

  test('R2-02: drie glazen water zetten geen nieuwe luisteraars op document', async ({ page }) => {
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag .medaille-hover').first()).toBeVisible();
    await domRustig(page); // Vandaag is uitgebouwd
    const voor = await page.evaluate(() => window.__docLuisteraars);
    await drieGlazen(page);
    expect(await page.evaluate(() => window.__docLuisteraars)).toBe(voor);
  });

  test('R2-02: het kaartje van een medaille gaat nog dicht met Escape en met een tik ernaast', async ({ page }) => {
    await page.goto('./#/vandaag');
    const medaille = page.locator('.vandaag .medaille-hover').first();
    await medaille.focus();
    await expect(medaille).toHaveClass(/is-uitleg/);
    await page.keyboard.press('Escape');
    await expect(medaille).not.toHaveClass(/is-uitleg/);
    await medaille.evaluate((el) => el.blur());
    await medaille.focus();
    await expect(medaille).toHaveClass(/is-uitleg/);
    await page.locator('.begroeting__datum').dispatchEvent('pointerdown');
    await expect(medaille).not.toHaveClass(/is-uitleg/);
  });

  test('R2-08: drie glazen water maken geen nieuwe mediaquery-luisteraars', async ({ page }) => {
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag .watervulling')).toBeVisible();
    await domRustig(page); // Vandaag is uitgebouwd
    const voor = await page.evaluate(() => window.__mqLuisteraars);
    await drieGlazen(page);
    expect(await page.evaluate(() => window.__mqLuisteraars)).toBe(voor);
    expect(voor).toBeLessThanOrEqual(1);
  });

  test('R2-08: het glas volgt nog altijd "minder beweging"', async ({ page }) => {
    await page.goto('./#/vandaag');
    await waterknop(page).click();
    const glas = page.locator('.vandaag .watervulling');
    await expect(glas).toHaveClass(/is-golvend/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(glas).not.toHaveClass(/is-golvend/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(glas).toHaveClass(/is-golvend/);
  });
});

test.describe('R2-05 de focus blijft op de knop na het hertekenen', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(DONDERDAG);
  });

  const gefocust = (page) => page.evaluate(() => {
    const a = document.activeElement;
    return a === document.body ? 'body' : `${a.className.split(' ')[0]}|${a.dataset.soort ?? a.dataset.moment ?? ''}`;
  });

  test('Vandaag: Enter op de tegel Thee voegt thee toe en de focus blijft op Thee', async ({ page }) => {
    await page.goto('./#/vandaag');
    const thee = page.locator('.vandaag .drankknop[data-soort="thee"]');
    await thee.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.vandaag .laatst__chip')).toHaveCount(1);
    await domRustig(page); // de hertekening na de tik is klaar
    expect(await gefocust(page)).toBe('drankknop|thee');
    // De volgende Enter werkt meteen opnieuw op dezelfde knop.
    await page.keyboard.press('Enter');
    await expect(page.locator('.vandaag .laatst__chip')).toHaveCount(2);
  });

  test('Vandaag: Enter op een moment vinkt het af en de focus blijft op dat moment', async ({ page }) => {
    await voegSupplementToe(page);
    await page.goto('./#/vandaag');
    const rij = page.locator('.vandaag .momentrij[data-moment="ochtend"]');
    await rij.focus();
    await page.keyboard.press('Enter');
    await expect(rij).toHaveAttribute('aria-checked', 'true');
    await expect(rij).toContainText('Genomen om');
    await domRustig(page); // de hertekening na de tik is klaar
    expect(await gefocust(page)).toBe('momentrij|ochtend');
  });

  test('Dagboek·Dag: Enter op Water voegt water toe en de focus blijft op Water', async ({ page }) => {
    await page.goto('./#/dagboek/dag/2026-11-19');
    const water = page.locator('.dagdrank[data-soort="water"]');
    await water.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.dagdranklijst__rij[data-soort="water"]')).toHaveCount(1);
    await domRustig(page); // de hertekening na de tik is klaar
    expect(await gefocust(page)).toBe('dagdrank|water');
  });
});

test('R2-06 de weekstrook telt een dag met alleen een notitie als bijgehouden', async ({ page }) => {
  await page.clock.setFixedTime(DONDERDAG);
  await page.goto('./#/vandaag');
  await expect(page.locator('.motiv__week .week__dag')).toHaveCount(7);
  await zetRij(page, 'dagen', { datum: '2026-11-17', notitie: 'Rustige dag gehad.', voorbeeld: false });
  await page.reload();
  const dagen = page.locator('.motiv__week .week__dag');
  await expect(dagen.nth(1)).toHaveClass(/is-bijgehouden/); // dinsdag: alleen een notitie
  await expect(dagen.nth(2)).not.toHaveClass(/is-bijgehouden/); // woensdag: niets
  await expect(dagen.nth(0)).not.toHaveClass(/is-bijgehouden/); // maandag: niets
});

test.describe('R2-13 Vandaag schrijft met de dag van de tik', () => {
  const DAG1 = new Date(2026, 10, 13, 20, 0, 0);
  const DAG2 = new Date(2026, 10, 14, 8, 0, 0);

  test('Ongedaan maken van een moment net na middernacht zet het vinkje van de nieuwe dag terug', async ({ page }) => {
    await page.clock.setFixedTime(DAG1);
    await voegSupplementToe(page, 'Avond');
    await page.goto('./#/vandaag');
    const avond = page.locator('.vandaag .momentrij[data-moment="avond"]');
    await expect(avond).toBeVisible();
    await page.clock.setFixedTime(DAG2); // geen focus- of zichtbaarheidsevent: de tekening is nog van dag 1
    await avond.click();
    await expect.poll(() => datums(page, 'momentinnames')).toEqual(['2026-11-14']);
    await page.locator('.strook').getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect.poll(() => datums(page, 'momentinnames')).toEqual([]);
  });

  test('"Laatste weghalen" net na middernacht haalt geen drank van gisteren weg', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 }); // de knop staat in de drinkkaart vanaf een breder scherm
    await page.clock.setFixedTime(DAG1);
    await page.goto('./#/vandaag');
    await waterknop(page).click();
    await expect.poll(() => datums(page, 'dranken')).toEqual(['2026-11-13']);
    const weg = page.getByRole('button', { name: 'Laatste weghalen' });
    await expect(weg).toBeVisible();
    await page.waitForTimeout(1500); // alle hertekeningen na de tik (ook een eerste badge) zijn klaar
    await page.clock.setFixedTime(DAG2);
    await weg.click();
    await domRustig(page); // wat de tik doet, is getekend
    expect(await datums(page, 'dranken')).toEqual(['2026-11-13']);
  });
});

test.describe('R2-14 een scherm dat niet laadt', () => {
  test.use({ serviceWorkers: 'block' });

  test('toont een rustige melding met "Opnieuw proberen", en opnieuw proberen laadt het scherm', async ({ page }) => {
    await page.clock.setFixedTime(DONDERDAG);
    const fouten = [];
    page.on('pageerror', (e) => fouten.push(e.message));
    await page.route(/\/assets\/delen-[^/]*\.js$/, (route) => route.abort());
    await page.goto('./#/delen');
    const leeg = page.locator('#scherm .leeg');
    await expect(leeg).toContainText('Dit scherm kon niet laden');
    const opnieuw = leeg.getByRole('button', { name: 'Opnieuw proberen' });
    await expect(opnieuw).toBeVisible();
    await page.unroute(/\/assets\/delen-[^/]*\.js$/);
    await opnieuw.click();
    await expect(page.locator('#scherm .leeg')).toHaveCount(0);
    await expect(page.locator('#scherm h1')).toBeVisible();
    expect(fouten).toEqual([]);
  });
});

test.describe('R2-15 de momentrij op Vandaag wisselt meteen', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 19, 9, 5, 0));
    await voegSupplementToe(page);
    await page.goto('./#/vandaag');
  });

  test('aria-checked staat meteen na de tik op de nieuwe stand', async ({ page }) => {
    const rij = page.locator('.vandaag .momentrij[data-moment="ochtend"]');
    await expect(rij).toHaveAttribute('aria-checked', 'false');
    const meteen = await rij.evaluate((el) => {
      el.click();
      return el.getAttribute('aria-checked');
    });
    expect(meteen).toBe('true');
  });

  test('een dubbele tik vinkt af en weer uit', async ({ page }) => {
    const rij = page.locator('.vandaag .momentrij[data-moment="ochtend"]');
    await expect(rij).toHaveAttribute('aria-checked', 'false');
    await rij.dblclick();
    await page.waitForTimeout(1200);
    await expect(rij).toHaveAttribute('aria-checked', 'false');
    expect(await datums(page, 'momentinnames')).toEqual([]);
    await page.reload();
    await expect(page.locator('.vandaag .momentrij[data-moment="ochtend"]')).toHaveAttribute('aria-checked', 'false');
  });
});

test('R2-17 de ResizeObservers van de grafiek en van "Goed om te weten" worden losgekoppeld bij het verlaten', async ({ page }) => {
  await page.clock.setFixedTime(DONDERDAG);
  await page.addInitScript(() => {
    // Houdt per waarnemer bij welke elementen hij volgt en of hij losgekoppeld is.
    const Echt = window.ResizeObserver;
    window.__waarnemers = [];
    window.ResizeObserver = class extends Echt {
      constructor(f) {
        super(f);
        this.__info = { doelen: [], los: false };
        window.__waarnemers.push(this.__info);
      }
      observe(el, o) {
        this.__info.doelen.push(String(el.className?.baseVal ?? el.className));
        return super.observe(el, o);
      }
      disconnect() {
        this.__info.los = true;
        return super.disconnect();
      }
    };
  });
  const open = (page, soort) => page.evaluate((s) => window.__waarnemers.filter((w) => !w.los && w.doelen.some((d) => d.includes(s))).length, soort);
  await page.goto('./#/vandaag');
  await expect(page.locator('.begroeting__groet')).toBeVisible();
  await zetRij(page, 'wegingen', { week: '2026-11-09', datum: '2026-11-09', kg: 66.4, voorbeeld: false });
  await zetRij(page, 'wegingen', { week: '2026-11-16', datum: '2026-11-16', kg: 66.1, voorbeeld: false });
  await page.goto('./#/gewicht');
  await expect(page.locator('#scherm .grafiek').first()).toBeVisible();
  expect(await open(page, 'grafiek')).toBeGreaterThan(0);
  await page.goto('./#/meer/instellingen');
  await expect(page.locator('#scherm .instel__weetjes').first()).toBeVisible();
  // BESLISSING 568 en 569: de plaats van de tekst naast de tegel is zuiver css; alleen de weetjesrij van Drinken, Gewicht en Delen telt regels (ui/weetjes.js, een
  // waarnemer voor de hele app die elke tekst loslaat zodra ze uit de pagina verdwijnt). Op de instelschermen volgt geen waarnemer meer het blok "Goed om te weten".
  expect(await open(page, 'instel__weetjes')).toBe(0);
  await page.goto('./#/vandaag');
  await expect(page.locator('.begroeting__groet')).toBeVisible();
  await expect.poll(() => open(page, 'grafiek')).toBe(0);
});
