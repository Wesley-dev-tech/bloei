import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';

// Zes tabs. De vierde heet overal 'Supplementen' (BESLISSING 325), in de tabbalk en in de zijbalk.
const SLUGS = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer'];
import { TEKSTEN } from '../../src/teksten.js';

// De naam van het laatste tabblad en van de terugknop komen uit teksten.js (BESLISSING 178: Algemeen).
const MEER = TEKSTEN.tab.meer;
const TERUG = TEKSTEN.meer.terug;
const TABS = ['Vandaag', 'Dagboek', 'Drinken', 'Supplementen', 'Gewicht', MEER];
const ZIJ = ['Vandaag', 'Dagboek', 'Drinken', 'Supplementen', 'Gewicht', MEER];

// Bewaart de themakeuze zoals thema.js dat doet: in de database en gespiegeld in localStorage.
async function bewaarThema(page, keuze) {
  await page.evaluate(
    (k) =>
      new Promise((klaar, mislukt) => {
        localStorage.setItem('bloei-thema', k);
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: k });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    keuze,
  );
}

test('vijf tabs wisselen van scherm en van hash', async ({ page }) => {
  const fouten = [];
  page.on('console', (bericht) => bericht.type() === 'error' && fouten.push(bericht.text()));
  page.on('pageerror', (fout) => fouten.push(String(fout)));

  await page.goto('./');
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(page.locator('#tabbalk a')).toHaveText(TABS);

  for (const [i, tab] of TABS.entries()) {
    await page.locator('#tabbalk a', { hasText: tab }).click();
    await expect(page).toHaveURL(new RegExp('#/' + SLUGS[i] + '$'));
    await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveText(tab);
    await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', SLUGS[i]);
  }

  // Een dag in de route houdt dezelfde tab actief.
  await page.goto('./#/supplementen/2026-11-12');
  await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveText('Supplementen');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'supplementen');

  await page.goto('./#/bestaat-niet');
  await expect(page).toHaveURL(/#\/vandaag$/);
  expect(fouten).toEqual([]);
});

test('manifest, noindex en de tags voor de iPhone kloppen', async ({ page, request }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/(^| · )Bloei$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl-BE');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Bloei');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FBF7F4');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href, page.url()).href)).json();
  expect(manifest.name).toBe('Bloei');
  expect(manifest.short_name).toBe('Bloei');
  expect(manifest.lang).toBe('nl-BE');
  expect(manifest.display).toBe('standalone');
  expect(manifest.background_color).toBe('#FBF7F4');
  expect(manifest.theme_color).toBe('#FBF7F4');
  // De app staat op de wortel van een eigen adres (Vercel).
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.orientation).toBeUndefined();
  expect(manifest.icons.map((i) => i.src + ' ' + (i.purpose || 'any'))).toEqual([
    'icons/icon-192.png any',
    'icons/icon-512.png any',
    'icons/icon-maskable-512.png maskable',
  ]);
});

test('alle iconen en opstartschermen waarnaar verwezen wordt bestaan en passen bij hun afmeting', async ({ page, request }) => {
  await page.goto('./');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(manifestHref, page.url()).href)).json();

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-startup-image"]')].map((l) => ({
      rel: l.rel,
      href: l.href,
      media: l.getAttribute('media') || '',
    })),
  );
  const startschermen = links.filter((l) => l.rel === 'apple-touch-startup-image');
  // 14 iPhone-beelden (staand) en 32 iPad-beelden (8 formaten, staand en liggend, licht en donker).
  expect(startschermen).toHaveLength(46);
  const iconen = links.filter((l) => l.rel === 'apple-touch-icon');
  expect(iconen).toHaveLength(4);
  for (const icoon of iconen) {
    const [, formaat] = icoon.href.match(/(\d+)x\d+\.png$/) || [];
    if (formaat) {
      const png = Buffer.from(await (await request.get(icoon.href)).body());
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], icoon.href).toEqual([Number(formaat), Number(formaat)]);
    }
  }

  const urls = [...links.map((l) => l.href), ...manifest.icons.map((i) => new URL(i.src, page.url()).href)];
  for (const url of urls) {
    const antwoord = await request.get(url);
    expect(antwoord.status(), url).toBe(200);
  }

  // De bestandsnaam (...-1170x2532.png) moet bij device-width, device-height en pixelratio van de media passen,
  // en het bestand zelf moet echt zo groot zijn.
  for (const link of startschermen) {
    const [, breed, hoog] = link.href.match(/(\d+)x(\d+)\.png$/);
    const m = link.media.match(/device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (portrait|landscape)\)/);
    expect(m, link.media).not.toBeNull();
    // device-width en device-height zijn altijd de staande waarden; bij liggend wisselen de pixels om.
    const staand = [Number(m[1]) * Number(m[3]), Number(m[2]) * Number(m[3])];
    expect([Number(breed), Number(hoog)], link.href).toEqual(m[4] === 'portrait' ? staand : [staand[1], staand[0]]);
    expect(link.media.includes('prefers-color-scheme: dark'), link.href).toBe(link.href.includes('splash-nacht'));
    const png = Buffer.from(await (await request.get(link.href)).body());
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], link.href).toEqual([Number(breed), Number(hoog)]);
  }
});

test('het thema wisselt data-theme en blijft na herladen, zonder flits van het verkeerde thema', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#tabbalk')).toBeVisible();
  expect(await page.locator('html').getAttribute('data-theme')).toBeNull();

  // Houd bij welke waarden data-theme krijgt, vanaf het allereerste moment van een nieuwe pagina.
  await page.addInitScript(() => {
    window.__themas = [];
    const zet = Element.prototype.setAttribute;
    const haal = Element.prototype.removeAttribute;
    Element.prototype.setAttribute = function (naam, waarde) {
      if (this === document.documentElement && naam === 'data-theme') window.__themas.push(waarde);
      return zet.call(this, naam, waarde);
    };
    Element.prototype.removeAttribute = function (naam) {
      if (this === document.documentElement && naam === 'data-theme') window.__themas.push(null);
      return haal.call(this, naam);
    };
  });

  for (const keuze of ['nacht', 'salie']) {
    await bewaarThema(page, keuze);
    await page.reload();
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', keuze);
    const geschiedenis = await page.evaluate(() => window.__themas);
    expect(geschiedenis.length).toBeGreaterThan(0);
    expect(geschiedenis.every((w) => w === keuze), JSON.stringify(geschiedenis)).toBe(true);
    if (keuze === 'salie') await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F7F8F4');
  }

  // theme-color volgt het thema
  await bewaarThema(page, 'nacht');
  await page.reload();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1F1720');

  await bewaarThema(page, 'poeder');
  await page.reload();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FBF7F4');
});

test('auto volgt het toestel, ook als het wisselt terwijl de app openstaat', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await bewaarThema(page, 'auto');
  await page.reload();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacht');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('telefoon: tabbalk zichtbaar, zijbalk niet', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#zijbalk')).toBeHidden();
  await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveText('Dagboek');
});

test('desktop: zijbalk zichtbaar, tabbalk niet, met dezelfde actieve tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/dagboek');
  await expect(page.locator('#zijbalk')).toBeVisible();
  await expect(page.locator('#tabbalk')).toBeHidden();
  await expect(page.locator('#zijbalk .zijbalk__lijst a')).toHaveText(ZIJ);
  await page.goto('./#/supplementen/2026-11-12');
  await expect(page.locator('#zijbalk .zijbalk__lijst a[aria-current="page"]')).toHaveText('Supplementen');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'supplementen');
  await page.goto('./#/dagboek');
  await expect(page.locator('#zijbalk .zijbalk__lijst a[aria-current="page"]')).toHaveText('Dagboek');
  await page.locator('#zijbalk .zijbalk__lijst a', { hasText: 'Gewicht' }).click();
  await expect(page).toHaveURL(/#\/gewicht$/);
  await expect(page.locator('#zijbalk .zijbalk__lijst a[aria-current="page"]')).toHaveText('Gewicht');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'gewicht');
  // Verborgen navigatie is ook weg voor schermlezers en toetsenbord.
  expect(await page.getByRole('navigation').count()).toBe(1);
});

test('desktop: het item Delen in de zijbalk heeft de lavendel van zijn tabblad en een actieve stand', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/vandaag');
  await expect(page.locator('#zijbalk .zijbalk__extra a')).toBeVisible();
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
  const kleuren = () => page.evaluate(() => {
    const kleurVan = (v) => { const p = document.createElement('span'); p.style.color = `var(${v})`; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
    const item = document.querySelector('#zijbalk .zijbalk__extra a');
    return {
      icoon: getComputedStyle(item.querySelector('.navicoon')).color,
      achtergrond: getComputedStyle(item).backgroundColor,
      tekst: kleurVan('--c-text'),
      lavendel: [kleurVan('--c-share'), kleurVan('--c-share-licht'), kleurVan('--c-share-text')],
      zacht: kleurVan('--c-share-soft'),
    };
  });
  const uit = await kleuren();
  expect(uit.lavendel).toContain(uit.icoon);
  expect(uit.icoon).not.toBe(uit.tekst);
  expect(uit.achtergrond).not.toBe(uit.zacht);
  await page.goto('./#/delen');
  await expect(page.locator('#zijbalk .zijbalk__extra a')).toHaveAttribute('aria-current', 'page');
  await animatiesKlaar(page); // de kleurovergang van het item is voorbij (geen vaste wachttijd)
  const aan = await kleuren();
  expect(aan.achtergrond).toBe(aan.zacht);
  expect(aan.lavendel).toContain(aan.icoon);
});

test('het omslagpunt ligt op 960 px', async ({ page }) => {
  await page.setViewportSize({ width: 959, height: 800 });
  await page.goto('./#/vandaag');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#zijbalk')).toBeHidden();
  await page.setViewportSize({ width: 960, height: 800 });
  await expect(page.locator('#zijbalk')).toBeVisible();
  await expect(page.locator('#tabbalk')).toBeHidden();
});

// De schermtests draaien op een testbouw met de stijlpagina (BLOEI_STIJLPAGINA=1 in playwright.config.js); de productiebouw
// laat stijl.html weg (tests/logica/beveiliging.test.js controleert invoer() in vite.config.js).
test('stijl.html is in de gebouwde testversie de stijlpagina, online en offline', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await page.goto('./stijl.html');
  await expect(page).toHaveTitle('Bloei stijlpagina');
  await expect(page.locator('#stijl')).toBeAttached();
  await expect(page.locator('#tabbalk')).toHaveCount(0);

  await context.setOffline(true);
  await page.goto('./stijl.html');
  await expect(page).toHaveTitle('Bloei stijlpagina');
  await expect(page.locator('#stijl')).toBeAttached();
  await page.goto('./');
  await expect(page).toHaveTitle(/(^| · )Bloei$/);
  await expect(page.locator('#tabbalk a')).toHaveText(TABS);
  await context.setOffline(false);
});

test('de offline cache bevat de app, lettertypes, iconen en manifest, maar geen opstartschermen', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const urls = await page.evaluate(async () => {
    const uit = [];
    for (const naam of await caches.keys()) for (const v of await (await caches.open(naam)).keys()) uit.push(new URL(v.url).pathname);
    return uit;
  });
  expect(urls.some((u) => u.endsWith('/index.html'))).toBe(true);
  expect(urls.some((u) => u.endsWith('.woff2'))).toBe(true);
  expect(urls.some((u) => u.endsWith('/icons/icon-192.png'))).toBe(true);
  expect(urls.some((u) => u.endsWith('.webmanifest'))).toBe(true);
  expect(urls.filter((u) => u.includes('/splash/'))).toEqual([]);
});

test('de app laadt offline na het eerste bezoek en doet geen externe verzoeken', async ({ page, context }) => {
  const extern = [];
  page.on('request', (verzoek) => {
    const url = new URL(verzoek.url());
    if (url.protocol.startsWith('http') && url.host !== `localhost:${process.env.PW_POORT || '4173'}`) extern.push(verzoek.url());
  });

  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Wacht tot de service worker de pagina bestuurt.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#tabbalk a')).toHaveText(TABS);
  await page.locator('#tabbalk a', { hasText: 'Drinken' }).click();
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'drinken');
  await context.setOffline(false);

  expect(extern).toEqual([]);
});

// Het inhoudsvlak (#scherm zonder padding) staat gecentreerd in de ruimte rechts van de zijbalk.
for (const [breed, hoog, max] of [[1280, 800, 1120], [1720, 950, 1320], [1920, 1080, 1320]]) {
  test(`desktop ${breed}x${hoog}: het inhoudsvlak is breed en gecentreerd naast de zijbalk`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await page.goto('./#/vandaag');
    await expect(page.locator('#zijbalk')).toBeVisible();
    const m = await page.evaluate(() => {
      const zij = document.getElementById('zijbalk').getBoundingClientRect();
      const sc = document.getElementById('scherm');
      const r = sc.getBoundingClientRect();
      const css = getComputedStyle(sc);
      const links = r.left + parseFloat(css.paddingLeft);
      const rechts = r.right - parseFloat(css.paddingRight);
      return { zijRechts: zij.right, links: links - zij.right, rechts: innerWidth - rechts, breedte: rechts - links, horizontaal: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(m.breedte).toBeGreaterThan(900);
    expect(m.breedte).toBeLessThanOrEqual(max + 1);
    if (breed >= 1600) expect(m.breedte).toBeGreaterThan(1300);
    expect(Math.abs(m.links - m.rechts)).toBeLessThanOrEqual(3);
    expect(m.horizontaal).toBe(false);
  });
}

test('tablet 768 px: inhoud gecentreerd, tot 720 breed, tabbalk onderaan', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('./#/vandaag');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#zijbalk')).toBeHidden();
  const r = await page.locator('#scherm').evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { breedte: b.width, links: b.left, rechts: innerWidth - b.right };
  });
  expect(r.breedte).toBeLessThanOrEqual(720);
  expect(r.breedte).toBeGreaterThan(600);
  expect(Math.abs(r.links - r.rechts)).toBeLessThanOrEqual(2);
});

test('telefoon 360, 390 en 430 px: schermmarge 20, niets horizontaal, inhoud boven de tabbalk', async ({ page }) => {
  for (const breed of [360, 390, 430]) {
    await page.setViewportSize({ width: breed, height: 800 });
    await page.goto('./#/dagboek');
    await expect(page.locator('#tabbalk')).toBeVisible();
    const m = await page.evaluate(() => {
      const sc = document.getElementById('scherm');
      return { padding: parseFloat(getComputedStyle(sc).paddingLeft), breedte: sc.getBoundingClientRect().width, horizontaal: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(m.padding).toBe(20);
    expect(m.breedte).toBe(breed);
    expect(m.horizontaal, String(breed)).toBe(false);
  }
});

test('bij een tabwissel komt het scherm zacht op en staat de pagina bovenaan', async ({ page }) => {
  await page.goto('./#/dagboek');
  await expect(page.locator('#tabbalk')).toBeVisible();
  // Maak de pagina lang en scrol omlaag.
  await page.evaluate(() => {
    const lang = document.createElement('div');
    lang.style.height = '3000px';
    document.getElementById('scherm').append(lang);
    window.scrollTo({ top: 1500, behavior: 'instant' });
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

  // Houd bij of #scherm de opkomstklasse krijgt (de routewissel gaat door app.js, met event vóór het tekenen).
  await page.evaluate(() => {
    window.__binnen = 0;
    new MutationObserver(() => document.getElementById('scherm').classList.contains('is-binnen') && window.__binnen++).observe(document.getElementById('scherm'), { attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('#tabbalk a', { hasText: MEER }).click();
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => window.__binnen)).toBeGreaterThan(0);
  // Na de animatie is de klasse weer weg (geen blijvende stapelcontext).
  await expect(page.locator('#scherm')).not.toHaveClass(/is-binnen/);
});

test('de tabbalk en de zijbalk geven de actieve tab een tikvlak van minstens 48 px', async ({ page }) => {
  await page.goto('./#/vandaag');
  for (const a of await page.locator('#tabbalk a').all()) {
    const b = await a.boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(48);
    expect(b.height).toBeGreaterThanOrEqual(48);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const a of await page.locator('#zijbalk .zijbalk__lijst a').all()) {
    expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(48);
  }
});

test('desktop: de schermtitel staat op de hoogte van het logo in de zijbalk', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/dagboek');
  await expect(page.locator('#zijbalk')).toBeVisible();
  const m = await page.evaluate(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    return { logo: mid(document.querySelector('#zijbalk .zijbalk__logo')), titel: mid(document.querySelector('#scherm h1')) };
  });
  expect(Math.abs(m.logo - m.titel)).toBeLessThanOrEqual(3);
});

test('geen horizontaal scrollen op elk scherm op 360 en 390 px', async ({ page }) => {
  for (const breed of [360, 390]) {
    await page.setViewportSize({ width: breed, height: 800 });
    for (const route of ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer']) {
      await page.goto('./#/' + route);
      await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route);
      const horizontaal = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(horizontaal, `${route} op ${breed}`).toBe(false);
    }
  }
});

test('Delen is een eigen bestemming: geen tab actief, in de zijbalk wel, en een ongeldig bereik gaat terug', async ({ page }) => {
  await page.goto('./#/delen');
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'delen');
  await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveCount(0);

  await page.goto('./#/delen/2026-11-01/2026-11-07');
  await expect(page).toHaveURL(/#\/delen\/2026-11-01\/2026-11-07$/);
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'delen');

  for (const slecht of ['abc/def', '2026-13-01/2026-11-07', '2026-11-07/2026-11-01']) {
    await page.goto('./#/delen/' + slecht);
    await expect(page).toHaveURL(/#\/delen$/);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/delen');
  await expect(page.locator('#zijbalk a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('#zijbalk .zijbalk__lijst a[aria-current="page"]')).toHaveCount(0);
});

const MEER_ROUTES = ['meer', 'meer/instellingen', 'meer/gewicht', 'meer/profiel', 'meer/favorieten', 'meer/badges', 'meer/meldingen', 'meer/vergrendeling'];

test('onder Meer blijft Meer actief in de tabbalk (390) en de zijbalk (1280), en een tik op Meer brengt je naar #/meer', async ({ page }) => {
  for (const route of MEER_ROUTES) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/' + route);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route);
    await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveText(MEER);
    if (route !== 'meer') {
      await page.locator('#tabbalk a', { hasText: MEER }).click();
      await expect(page).toHaveURL(/#\/meer$/);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./#/' + route);
    await expect(page.locator('#zijbalk .zijbalk__lijst a[aria-current="page"]')).toHaveText(MEER);
    if (route !== 'meer') {
      await page.locator('#zijbalk .zijbalk__lijst a', { hasText: MEER }).click();
      await expect(page).toHaveURL(/#\/meer$/);
    }
  }
});

test('elk subscherm van Meer heeft een zichtbare schermkop met titel en een knop "Meer" die terugbrengt (ook nog niet gebouwde)', async ({ page }) => {
  for (const route of MEER_ROUTES.filter((r) => r !== 'meer')) {
    await page.goto('./#/' + route);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route);
    await expect(page.locator('#scherm .schermkop h1')).toBeVisible();
    const terug = page.locator('#scherm').getByRole('button', { name: `Terug naar ${TERUG}`, exact: true });
    await expect(terug).toBeVisible();
    await terug.click();
    await expect(page).toHaveURL(/#\/meer$/);
  }
});

// ---- Supplementen kent geen bewerkstand en geen eigen adres meer (BESLISSING 214) ----
test('#/supplementen/aanpassen en #/supplementen/xyz gaan recht naar #/supplementen', async ({ page }) => {
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(e.message));
  for (const slecht of ['aanpassen', 'xyz']) {
    await page.goto('./#/supplementen/' + slecht);
    await expect(page).toHaveURL(/#\/supplementen$/);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'supplementen');
  }
  // Een geldige datum blijft staan.
  await page.goto('./#/supplementen/2026-11-13');
  await expect(page).toHaveURL(/#\/supplementen\/2026-11-13$/);
  expect(fouten).toEqual([]);
});
