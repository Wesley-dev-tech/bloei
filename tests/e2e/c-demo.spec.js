// De demoversie (BESLISSING 364), spoor A: gescheiden opslag, geen vergrendeling, geen meldingsdienst, geen verzoek naar buiten,
// en wel of geen noindex per versie. Twee bouwversies (playwright.config.js, BESLISSING 408):
//   echt:  npm run e2e -- c-demo         de ronde zonder tag
//   demo:  npm run e2e:demo -- c-demo    de ronde met de tag @demo (bouw met --mode demo)
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { naTekenen, schermKlaar } from './wacht.js';

const OORSPRONG = `http://localhost:${process.env.PW_POORT || '4173'}`;

// Elk scherm van de app (de routes uit app.js), en een paar met een handeling.
const SCHERMEN = [
  'vandaag', 'dagboek', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht', 'delen',
  'meer', 'meer/instellingen', 'meer/gewicht', 'meer/uitleg', 'meer/profiel', 'meer/favorieten', 'meer/badges', 'meer/meldingen', 'meer/vergrendeling',
];

// Leest of schrijft rechtstreeks in IndexedDB, buiten de app om.
const idb = (page, opdracht) =>
  page.evaluate(async ({ soort, naam, winkel, rij }) => {
    const open = (versie) =>
      new Promise((klaar, mis) => {
        const q = versie ? indexedDB.open(naam, versie) : indexedDB.open(naam);
        q.onupgradeneeded = () => {
          if (!q.result.objectStoreNames.contains(winkel)) q.result.createObjectStore(winkel, { keyPath: 'sleutel' });
        };
        q.onsuccess = () => klaar(q.result);
        q.onerror = () => mis(q.error);
      });
    const db = await open(soort === 'zaai' ? 1 : 0);
    const uit = { versie: db.version, winkels: [...db.objectStoreNames] };
    if (soort === 'zaai' || soort === 'zet') {
      await new Promise((klaar, mis) => {
        const tx = db.transaction(winkel, 'readwrite');
        tx.objectStore(winkel).put(rij);
        tx.oncomplete = klaar;
        tx.onerror = () => mis(tx.error);
      });
    }
    if (uit.winkels.includes(winkel)) {
      uit.rijen = await new Promise((klaar) => {
        const q = db.transaction(winkel).objectStore(winkel).getAll();
        q.onsuccess = () => klaar(q.result);
      });
    }
    db.close();
    return uit;
  }, opdracht);

const ECHTE_RIJ = { sleutel: 'proef.echt', waarde: 'van de echte versie' };

test.describe('de demo', { tag: '@demo' }, () => {
  // Een lege browser: het eerste bezoek van een bezoeker aan de demo.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context, page }) => {
    // De voorbeeldgegevens worden rond "nu" gezaaid: een vaste dag en een vast uur (BESLISSING 408).
    await vasteKlok(page);
    // Elke poging om toestemming voor meldingen te vragen of een push-abonnement te nemen wordt geteld (en nooit echt uitgevoerd).
    await context.addInitScript(() => {
      window.__push = { toestemming: 0, abonnement: 0 };
      if (window.Notification) {
        Notification.requestPermission = async () => {
          window.__push.toestemming += 1;
          return 'denied';
        };
      }
      if (window.PushManager) {
        PushManager.prototype.subscribe = async () => {
          window.__push.abonnement += 1;
          throw new Error('geen abonnement in de demo');
        };
      }
    });
  });

  test('op elk scherm en bij elke handeling gaat er geen enkel verzoek naar een ander adres; geen push-toestemming, geen abonnement', async ({ context, page }) => {
    const vreemd = [];
    context.on('request', (v) => {
      const url = v.url();
      if (!url.startsWith(OORSPRONG + '/') && !url.startsWith('data:') && !url.startsWith('blob:')) vreemd.push(url);
    });
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await expect(page.locator('.demo-balk')).toBeVisible();
    for (const scherm of SCHERMEN) {
      await page.goto('./#/' + scherm);
      // data-scherm is het patroon van de route zonder parameters: dagboek/maand heet daar "dagboek".
      await expect(page.locator(`#scherm[data-scherm="${scherm.startsWith('dagboek') ? 'dagboek' : scherm}"]`)).toBeAttached();
      await naTekenen(page);
    }
    // Handelingen: een glas erbij, de (uitgeschakelde) schakelaars van Herinneringen en Vergrendeling, een thema kiezen.
    await page.goto('./#/drinken');
    const erbij = page.getByRole('button', { name: /erbij|toevoegen/i }).first();
    if (await erbij.isVisible().catch(() => false)) await erbij.click();
    await page.goto('./#/meer/meldingen');
    await expect(page.getByText('In de demo staan meldingen uit.')).toBeVisible();
    await page.locator('.meldingen__nep').first().click({ force: true, timeout: 2000 });
    await page.goto('./#/meer/vergrendeling');
    await expect(page.getByRole('switch')).toBeDisabled();
    await page.getByRole('switch').click({ force: true, timeout: 2000 });
    await page.getByRole('radio').first().click({ force: true, timeout: 2000 });
    await expect(page.locator('#slot')).toBeHidden();
    await page.goto('./#/meer');
    await page.locator('.themategel').nth(2).click();
    // Herladen (ook de service worker en de offline cache halen dan bestanden op).
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await page.waitForTimeout(1000);
    expect(vreemd).toEqual([]);
    expect(await page.evaluate(() => window.__push)).toEqual({ toestemming: 0, abonnement: 0 });
    // De CSP-meta van de demo laat alleen het eigen adres toe.
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'self';");
  });

  test('Herinneringen: uitgegrijsd, met "In de demo staan meldingen uit."', async ({ page }) => {
    await page.goto('./#/meer/meldingen');
    await expect(page.getByText('In de demo staan meldingen uit.')).toBeVisible();
    await expect(page.locator('.meldingen__nep').first()).toBeVisible();
    await expect(page.locator('[data-meldingen="hoofd"]')).toHaveCount(0);
  });

  test('het slot verschijnt nooit, ook niet met een code in de demodatabase; Vergrendeling is uitgegrijsd met één regel', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    // Een ingestelde vergrendeling in de demodatabase (zoals een bezoeker ze nooit kan zetten).
    await idb(page, { soort: 'zet', naam: 'bloei-demo', winkel: 'instellingen', rij: { sleutel: 'slot.aan', waarde: true } });
    await idb(page, { soort: 'zet', naam: 'bloei-demo', winkel: 'instellingen', rij: { sleutel: 'slot.pin', waarde: { hash: 'x', zout: 'y', rondes: 1, lengte: 6 } } });
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
    // Naar de achtergrond en terug: geen gordijn, geen code.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await naTekenen(page);
    await expect(page.locator('#slot')).toBeHidden();
    await page.goto('./#/meer/vergrendeling');
    await expect(page.getByText('In de demo staat de vergrendeling uit.')).toBeVisible();
    await expect(page.getByRole('switch')).toBeDisabled();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    for (const optie of await page.getByRole('radio').all()) await expect(optie).toBeDisabled();
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('de database heet bloei-demo; een bestaande bloei-dagboek blijft onaangeroerd, ook na "Opnieuw beginnen" en "Profiel verwijderen"', async ({ page }) => {
    // Eerst een echte database in dezelfde browsercontext (zoals wanneer beide versies ooit op hetzelfde adres staan).
    await page.goto('./#/vandaag');
    const voor = await idb(page, { soort: 'zaai', naam: 'bloei-dagboek', winkel: 'instellingen', rij: ECHTE_RIJ });
    await page.evaluate(() => localStorage.setItem('bloei-uitleg-echt', 'blijft'));
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    const namen = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
    expect(namen).toEqual(['bloei-dagboek', 'bloei-demo']);

    // De demo gebruiken: elk scherm.
    for (const scherm of SCHERMEN) {
      await page.goto('./#/' + scherm);
      await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    }
    expect(await idb(page, { soort: 'lees', naam: 'bloei-dagboek', winkel: 'instellingen' })).toEqual({ ...voor, rijen: [ECHTE_RIJ] });

    // Opnieuw beginnen (de demo-balk).
    await page.goto('./#/vandaag');
    await page.locator('.demo-balk').getByRole('button', { name: /Opnieuw beginnen/ }).click();
    // De demo herlaadt zichzelf na het opnieuw vullen: eerst die herlading afwachten.
    await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.locator('.demo-balk').getByRole('button', { name: 'Ja' }).click()]);
    await expect(page).toHaveURL(/#\/vandaag$/);
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    expect(await idb(page, { soort: 'lees', naam: 'bloei-dagboek', winkel: 'instellingen' })).toEqual({ ...voor, rijen: [ECHTE_RIJ] });

    // Profiel verwijderen in de demo: wist niets (BESLISSING 673), alleen het kaartje.
    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('Dit is de demo');
    await dlg.getByRole('button', { name: 'Begrepen' }).click();
    await expect(dlg).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    expect(await idb(page, { soort: 'lees', naam: 'bloei-dagboek', winkel: 'instellingen' })).toEqual({ ...voor, rijen: [ECHTE_RIJ] });
    expect(await page.evaluate(() => localStorage.getItem('bloei-uitleg-echt'))).toBe('blijft');
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort())).toEqual(['bloei-dagboek', 'bloei-demo']);
  });

  test('de demo mag geïndexeerd worden: geen noindex, robots.txt laat toe; eigen titel, Open Graph en manifest', async ({ page, request }) => {
    await page.goto('./');
    expect(await (await request.get('./')).text()).toContain('<title>Bloei · demo</title>');
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('index, follow');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-bloei\.png$/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const robots = await (await request.get('./robots.txt')).text();
    expect(robots).toContain('Allow: /');
    expect(robots).not.toContain('Disallow');
    const beeld = await request.get('./og-bloei.png');
    expect(beeld.ok()).toBe(true);
    expect(beeld.headers()['content-type']).toContain('image/png');
    const manifest = await (await request.get('./manifest.webmanifest')).json();
    expect(manifest.name).toBe('Bloei demo');
    expect(manifest.id).toBeTruthy();
  });
});

test.describe('de echte versie', () => {
  test('noindex in de pagina en in robots.txt; geen demo-balk, de echte database', async ({ page, request }) => {
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    // De titel in het gebouwde bestand (de app zet daarna per scherm een eigen titel).
    expect(await (await request.get('./')).text()).toContain('<title>Bloei</title>');
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
    const robots = await (await request.get('./robots.txt')).text();
    expect(robots).toContain('Disallow: /');
    // Het Open Graph-beeld zit alleen in de demobouw (vite preview geeft hier hoogstens de terugval naar index.html).
    expect((await request.get('./og-bloei.png')).headers()['content-type'] ?? '').not.toContain('image/png');
    const manifest = await (await request.get('./manifest.webmanifest')).json();
    expect(manifest.name).toBe('Bloei');
    expect(manifest.id).toBeUndefined();
    await expect(page.locator('.demo-balk')).toHaveCount(0);
    const namen = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(namen).toContain('bloei-dagboek');
    expect(namen).not.toContain('bloei-demo');
  });
});
