// "Een thema kiezen" via Toon het me: de themakaart staat laag op Algemeen, de pagina moet er eerst naartoe schuiven. Op een traag toestel
// viel het uitgelichte vak eerst op de plaats van voor het schuiven en sprong het daarna naar de thema's. Vastgelegd: vanaf het eerste beeld
// waarop de laag zichtbaar is (klasse is-zichtbaar) tot 1500 ms later verschuift het vak hoogstens 2 px, en de laag is niet zichtbaar voor de
// pagina geschoven is. Met CPU-vertraging (CDP), dus alleen in Chromium.
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';

test.use({ channel: async ({ browserName }, use) => use(browserName === 'chromium' ? process.env.PW_CHANNEL || undefined : undefined), hasTouch: true });

const VERTRAGING = 6;

for (const [breed, hoog] of [[390, 844], [390, 660]]) {
  test(`Een thema kiezen (${breed} bij ${hoog}, trage processor): het vak staat vanaf het eerste zichtbare beeld op zijn eindplaats`, async ({ page, browserName }) => {
    expect(browserName, 'deze test meet met CPU-vertraging van Chromium').toBe('chromium');
    await page.setViewportSize({ width: breed, height: hoog });
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await page.goto('./#/meer/uitleg');
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/uitleg');
    const knop = page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp.thema}` });
    await expect(knop).toBeVisible();
    await knop.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: VERTRAGING });
    // De meter in de pagina: elk beeld de stand van de laag, het vak, de uitlegkaart, de themakaart en de schuifstand.
    await page.evaluate(() => {
      const log = (window.__themaLog = []);
      const r = (e) => {
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
      };
      const meet = () => {
        const laag = document.querySelector('.uitleg[data-uitleg-laag]:not(.uitleg--welkom)');
        log.push({
          t: Math.round(performance.now()),
          zichtbaar: Boolean(laag?.classList.contains('is-zichtbaar')),
          gat: r(document.querySelector('.uitleg__gat')),
          kaart: r(document.querySelector('.uitleg__kaart[role="dialog"]:not(.uitleg__kaart--welkom)')),
          thema: r(document.querySelector('.meer__themakaart')),
          y: Math.round((document.scrollingElement || document.documentElement).scrollTop),
        });
        requestAnimationFrame(meet);
      };
      requestAnimationFrame(meet);
    });
    const vak = await knop.boundingBox();
    await page.touchscreen.tap(vak.x + vak.width / 2, vak.y + vak.height / 2);
    await expect(page.locator('.uitleg[data-uitleg-laag].is-zichtbaar')).toBeAttached({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const log = await page.evaluate(() => window.__themaLog);
    const eersteIndex = log.findIndex((b) => b.zichtbaar);
    expect(eersteIndex, 'de laag werd zichtbaar').toBeGreaterThanOrEqual(0);
    const eerste = log[eersteIndex];
    const venster = log.filter((b) => b.zichtbaar && b.t <= eerste.t + 1500);
    expect(venster.length, 'beelden gemeten tot 1500 ms na het eerste zichtbare beeld').toBeGreaterThan(3);
    expect(log[log.length - 1].t, 'de meting loopt tot voorbij 1500 ms').toBeGreaterThanOrEqual(eerste.t + 1500);
    const eind = venster[venster.length - 1];
    // Het vak ligt bij het eerste zichtbare beeld op de themakaart, met de pagina al geschoven.
    expect(eerste.gat[2], 'het vak heeft een maat').toBeGreaterThan(0);
    expect(eerste.thema, 'de themakaart staat op het scherm').not.toBeNull();
    expect(eerste.y, 'de pagina is al naar de themakaart geschoven').toBeGreaterThan(0);
    expect(Math.abs(eerste.y - eind.y), 'de pagina schuift niet meer na het eerste zichtbare beeld').toBeLessThanOrEqual(2);
    const overThema = (b) => b.gat[0] >= b.thema[0] - 2 && b.gat[1] >= b.thema[1] - 2 && b.gat[0] + b.gat[2] <= b.thema[0] + b.thema[2] + 2 && b.gat[1] + b.gat[3] <= b.thema[1] + b.thema[3] + 2;
    expect(overThema(eerste), `het vak ${JSON.stringify(eerste.gat)} ligt op de themakaart ${JSON.stringify(eerste.thema)}`).toBe(true);
    // Het vak en de uitlegkaart verschuiven daarna hoogstens 2 px.
    for (const b of venster) {
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(b.gat[i] - eerste.gat[i]), `het vak op ${b.t - eerste.t} ms: ${JSON.stringify(b.gat)} tegenover ${JSON.stringify(eerste.gat)}`).toBeLessThanOrEqual(2);
        expect(Math.abs(b.kaart[i] - eerste.kaart[i]), `de uitlegkaart op ${b.t - eerste.t} ms: ${JSON.stringify(b.kaart)} tegenover ${JSON.stringify(eerste.kaart)}`).toBeLessThanOrEqual(2);
      }
    }
    // De uitlegkaart staat binnen het venster (niet ongeplaatst).
    expect(eerste.kaart[0]).toBeGreaterThanOrEqual(0);
    expect(eerste.kaart[0] + eerste.kaart[2]).toBeLessThanOrEqual(breed + 1);
    expect(eerste.kaart[1] + eerste.kaart[3]).toBeLessThanOrEqual(hoog + 1);
  });
}

// De weg van de gebruiker: Algemeen, naar beneden tot de rij Uitleg, het scherm Uitleg, Toon het me bij "Een thema kiezen". Het scherm Uitleg
// werd dan vanuit Algemeen geopend; de wissel terug naar Algemeen telde als terugkeren, en de pagina werd tot 2,5 s vastgehouden op de oude
// schuifstand, tegen het schuiven van de uitleg in. Het vak lag eerst op een fout kader (een rij of kaart lager op Algemeen) en pas daarna
// op de thema's. Vastgelegd, ook met een trage database: vanaf het eerste zichtbare beeld blijven titel, teller, het onderdeel onder het
// vak en de schuifstand dezelfde.
function traagIdb() {
  // Elk resultaat van IndexedDB komt window.__idbTraag ms later; de transactie blijft open door lege leesvragen.
  const d = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
  const zet = d.set;
  const wikkel = (fn) =>
    function (ev) {
      const ms = Number(window.__idbTraag || 0);
      let bron = this.source;
      if (!ms || !bron || this instanceof IDBOpenDBRequest) return fn.call(this, ev);
      if (bron instanceof IDBCursor) bron = bron.source;
      const store = bron instanceof IDBIndex ? bron.objectStore : bron;
      const eind = performance.now() + ms;
      const lus = () => {
        if (performance.now() >= eind) return fn.call(this, ev);
        let r;
        try {
          r = store.get(-987654321);
        } catch {
          return fn.call(this, ev);
        }
        zet.call(r, lus);
        r.onerror = (e) => {
          e.preventDefault();
          fn.call(this, ev);
        };
      };
      lus();
    };
  Object.defineProperty(IDBRequest.prototype, 'onsuccess', {
    configurable: true,
    enumerable: true,
    get: d.get,
    set(fn) {
      zet.call(this, typeof fn === 'function' ? wikkel(fn) : fn);
    },
  });
  const voegToe = IDBRequest.prototype.addEventListener;
  IDBRequest.prototype.addEventListener = function (soort, fn, o) {
    return voegToe.call(this, soort, soort === 'success' && typeof fn === 'function' ? wikkel(fn) : fn, o);
  };
}

for (const [breed, hoog] of [[390, 844], [390, 660]]) {
  for (const traag of [0, 300]) {
    test(`Een thema kiezen vanuit Algemeen (${breed} bij ${hoog}, database ${traag} ms trager): titel, teller en onderdeel wisselen niet na het eerste zichtbare beeld`, async ({ page }) => {
      await page.addInitScript(traagIdb);
      await page.setViewportSize({ width: breed, height: hoog });
      await page.goto('./');
      await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
      await page.goto('./#/meer');
      await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer');
      const rij = page.locator('.meer__menu .rij').last();
      await expect(rij).toBeVisible();
      await rij.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.scrollY), 'Algemeen is naar beneden geschoven tot de rij Uitleg').toBeGreaterThan(200);
      await rij.tap();
      await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/uitleg');
      const knop = page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp.thema}` });
      await expect(knop).toBeVisible();
      await knop.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.evaluate((ms) => {
        window.__idbTraag = ms;
        const log = (window.__themaLog = []);
        const meet = () => {
          const laag = document.querySelector('.uitleg[data-uitleg-laag]:not(.uitleg--welkom)');
          const kaart = document.querySelector('.uitleg__kaart[role="dialog"]:not(.uitleg__kaart--welkom)');
          const gat = document.querySelector('.uitleg__gat')?.getBoundingClientRect();
          const thema = document.querySelector('.meer__themakaart')?.getBoundingClientRect();
          log.push({
            t: Math.round(performance.now()),
            zichtbaar: Boolean(laag?.classList.contains('is-zichtbaar')),
            titel: kaart?.querySelector('.uitleg__titel')?.textContent.trim() ?? null,
            teller: kaart?.querySelector('.uitleg__stap')?.textContent.trim() ?? null,
            // ligt het vak op de themakaart (2 px speling)?
            opThema: Boolean(gat && thema && gat.width > 0 && gat.left >= thema.left - 2 && gat.top >= thema.top - 2 && gat.right <= thema.right + 2 && gat.bottom <= thema.bottom + 2),
            inBeeld: Boolean(gat && gat.top >= 0 && gat.bottom <= window.innerHeight),
            y: Math.round((document.scrollingElement || document.documentElement).scrollTop),
          });
          requestAnimationFrame(meet);
        };
        requestAnimationFrame(meet);
      }, traag);
      const vak = await knop.boundingBox();
      await page.touchscreen.tap(vak.x + vak.width / 2, vak.y + vak.height / 2);
      await expect(page.locator('.uitleg[data-uitleg-laag].is-zichtbaar')).toBeAttached({ timeout: 15000 });
      await page.waitForTimeout(3000);
      const log = await page.evaluate(() => window.__themaLog);
      const beelden = log.filter((b) => b.zichtbaar);
      const eerste = beelden[0];
      expect(beelden.length, 'beelden gemeten met de laag zichtbaar').toBeGreaterThan(3);
      expect(log[log.length - 1].t, 'de meting loopt tot voorbij de 2,5 s waarin een oude schuifstand werd vastgehouden').toBeGreaterThanOrEqual(eerste.t + 2600);
      const standen = [...new Set(beelden.map((b) => `${b.titel} | ${b.teller} | op de themakaart: ${b.opThema} | in beeld: ${b.inBeeld} | y ${b.y}`))];
      expect(eerste.opThema, `het vak ligt bij het eerste zichtbare beeld op de themakaart (${standen[0]})`).toBe(true);
      expect(eerste.inBeeld, 'het vak staat bij het eerste zichtbare beeld in beeld').toBe(true);
      expect(standen, 'een stand vanaf het eerste zichtbare beeld: titel, teller, onderdeel en schuifstand').toHaveLength(1);
    });
  }
}
