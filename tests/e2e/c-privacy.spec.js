// Privacy en beveiliging van de gebouwde app: Content-Security-Policy, geen verzoeken buiten de eigen
// oorsprong, geen cookies en een bekende lijst met localStorage-sleutels.
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vasteKlok } from './vaste-klok.js';
import { maaltijdblad, BEWAAR_MAALTIJD } from './r-wacht.js';
import { schermKlaar, naTekenen } from './wacht.js';

const OORSPRONG = `http://localhost:${process.env.PW_POORT || '4173'}`;
const BOUWMAP = process.env.PW_OUTDIR || join(import.meta.dirname, '..', '..', 'dist');
const ZES = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer'];

test('dist/index.html heeft de CSP en de referrer-meta, met de hash van het inline thema-script', () => {
  const html = readFileSync(join(BOUWMAP, 'index.html'), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  expect(csp, 'CSP-meta ontbreekt').toBeTruthy();
  for (const regel of [
    "default-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Met een ingestelde meldingsdienst (VITE_PUSH_URL bij het bouwen) staat precies die oorsprong erbij, en niets anders.
    process.env.VITE_PUSH_URL ? `connect-src 'self' ${new URL(process.env.VITE_PUSH_URL).origin}` : "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ]) {
    expect(csp.split('; ')).toContain(regel);
  }
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  const script = csp.split('; ').find((r) => r.startsWith('script-src '));
  expect(script).toMatch(/^script-src 'self' 'sha256-[A-Za-z0-9+/=]+'$/);

  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  expect(script).toContain("'sha256-" + createHash('sha256').update(inline).digest('base64') + "'");
  expect(html).toMatch(/<meta name="referrer" content="no-referrer"/);
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  // De CSP staat vóór het eerste script.
  expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
});

// ---- Trusted Types (BESLISSING 430): de CSP eist ze, de app werkt ermee zonder één schending, en een html-sink weigert gewone tekst ----
test('Trusted Types: de CSP-meta eist ze en laat alleen de policies bloei-svg en bloei-sw toe', () => {
  const html = readFileSync(join(BOUWMAP, 'index.html'), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  expect(csp, 'CSP-meta ontbreekt').toBeTruthy();
  const regels = csp.split('; ');
  expect(regels).toContain("require-trusted-types-for 'script'");
  expect(regels).toContain('trusted-types bloei-svg bloei-sw');
});

// Alle schermen (en de bladen die er iets in tekenen): geen enkele securitypolicyviolation, geen svg die leeg bleef omdat haar markup geweigerd werd.
const ALLE_SCHERMEN = [
  'vandaag', 'dagboek', 'dagboek/week', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht', 'delen',
  'meer', 'meer/instellingen', 'meer/gewicht', 'meer/uitleg', 'meer/profiel', 'meer/favorieten', 'meer/badges', 'meer/meldingen', 'meer/vergrendeling',
];
test('Trusted Types: 0 schendingen en 0 lege svg\'s over alle schermen, ook met een open blad', async ({ page }) => {
  await vasteKlok(page);
  await page.addInitScript(() => {
    window.__schendingen = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__schendingen.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`));
  });
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  page.on('pageerror', (f) => fouten.push(String(f)));
  const legeSvgs = () => page.evaluate(() => [...document.querySelectorAll('svg')].filter((s) => s.childElementCount === 0).map((s) => s.parentElement?.className || s.parentElement?.tagName));
  const leeg = [];
  for (const route of ALLE_SCHERMEN) {
    await page.goto('./#/' + route);
    await schermKlaar(page, route);
    for (const s of await legeSvgs()) leeg.push(`${route}: ${s}`);
  }
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  for (const s of await legeSvgs()) leeg.push(`maaltijdblad: ${s}`);
  await page.keyboard.press('Escape');
  await page.goto('./#/gewicht');
  await schermKlaar(page, 'gewicht');
  await page.getByRole('button', { name: /Weging noteren/ }).first().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  for (const s of await legeSvgs()) leeg.push(`weegblad: ${s}`);
  expect(await page.evaluate(() => window.__schendingen), 'securitypolicyviolation').toEqual([]);
  expect(leeg, "lege svg's").toEqual([]);
  expect(fouten, 'console').toEqual([]);
});

test('Trusted Types: gewone tekst in innerHTML gooit een TypeError en voert niets uit', async ({ page }) => {
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  const uit = await page.evaluate(() => {
    window.__xss = 0;
    try {
      document.createElement('div').innerHTML = '<img src=x onerror="window.__xss=1">';
      return { fout: null };
    } catch (f) {
      return { fout: f?.name ?? String(f), tt: typeof window.trustedTypes };
    }
  });
  expect(uit.fout).toBe('TypeError');
  expect(uit.tt).toBe('object'); // Chrome kent Trusted Types
  await naTekenen(page);
  expect(await page.evaluate(() => window.__xss)).toBe(0);
});

// Controle 16 november: alleen het versienummer uit package.json mag in de bundel, niet de scripts, de afhankelijkheden of de auteur.
test('de gebouwde bundel bevat de inhoud van package.json niet (geen devDependencies, scripts of auteur)', () => {
  const pakket = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'));
  const assets = join(BOUWMAP, 'assets');
  const js = readdirSync(assets).filter((n) => n.endsWith('.js')).map((n) => readFileSync(join(assets, n), 'utf8'));
  expect(js.length).toBeGreaterThan(0);
  const alles = js.join('\n');
  expect(alles).not.toContain('devDependencies');
  expect(alles).not.toMatch(/"?scripts"?\s*:\s*\{/);
  for (const naam of Object.keys(pakket.devDependencies || {})) expect(alles, naam).not.toContain(`"${naam}":"${pakket.devDependencies[naam]}"`);
  // Het versienummer staat er wel (Algemeen › Over).
  expect(alles).toContain(pakket.version);
});

test('alle zes tabs, een glas, een maaltijd en een moment: elk verzoek gaat naar de eigen oorsprong en de console blijft leeg', async ({ page, context }) => {
  const verzoeken = [];
  const meldingen = [];
  page.on('request', (v) => verzoeken.push(v.url()));
  page.on('console', (b) => ['error', 'warning'].includes(b.type()) && meldingen.push(b.type() + ': ' + b.text()));
  page.on('pageerror', (e) => meldingen.push('pageerror: ' + String(e)));

  await page.goto('./#/vandaag');
  await expect(page.locator('.maaltijd')).toHaveCount(6);

  // Een glas
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
  // Een maaltijd
  await page.locator('.maaltijd.is-uitgelicht > .rij').click();
  const blad = maaltijdblad(page); // BESLISSING 419: het invulvenster is een blad
  await blad.locator('textarea').fill('yoghurt met noten');
  await blad.getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(blad).toHaveCount(0);

  for (const route of ZES) {
    await page.goto('./#/' + route);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route);
  }
  // Ook de thema's en een herlading met de service worker.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#scherm')).toBeVisible();

  const vreemd = verzoeken.filter((u) => {
    const url = new URL(u);
    // (de weerdienst van het weerbericht op Vandaag, sinds 0.5.8, en de waarschuwingen van het KMI, sinds 0.7.0, zonder plek)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== OORSPRONG && url.hostname !== 'api.open-meteo.com' && url.hostname !== 'feeds.meteoalarm.org';
  });
  expect(vreemd).toEqual([]);
  expect(meldingen.filter((m) => /content security policy|refused to|violat/i.test(m))).toEqual([]);
  expect(meldingen).toEqual([]);

  // Geen cookies, en localStorage kent alleen de bekende sleutels.
  expect(await context.cookies()).toEqual([]);
  const sleutels = await page.evaluate(() => Object.keys(localStorage));
  for (const s of sleutels) expect(['bloei-thema', 'bloei-vandaag-open', 'bloei-uitleg']).toContain(s);
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

// Een inline script in de pagina zelf (zoals een aanvaller het in de html zou krijgen): de html van de app wordt onderweg aangevuld met een
// <script> zonder hash, NA de CSP-meta. De CSP (script-src zonder 'unsafe-inline') weigert het: het script loopt niet en er komt een schending
// op script-src. Een script dat de pagina zelf maakt met tekst (een tekst-sink) weigert Trusted Types al eerder met een TypeError (BESLISSING 430).
// Een verzoek naar een vreemde host weigert connect-src.
test('een inline script of een verzoek naar een vreemde host wordt door de CSP geweigerd', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ingelezen = false;
    window.__schendingen = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__schendingen.push(e.effectiveDirective || e.violatedDirective));
  });
  await page.route((url) => url.pathname === '/' || url.pathname.endsWith('/index.html'), async (route) => {
    const antwoord = await route.fetch();
    const html = await antwoord.text();
    const meta = html.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0];
    expect(meta, 'CSP-meta').toBeTruthy();
    await route.fulfill({ response: antwoord, body: html.replace(meta, meta + '<script>window.__ingelezen = true</script>') });
  });
  await page.goto('./');
  await expect(page.locator('#scherm')).toBeVisible();
  const uitslag = await page.evaluate(async () => {
    const r = { inline: window.__ingelezen ? 'uitgevoerd' : 'geweigerd', schending: window.__schendingen.some((d) => d.startsWith('script-src')) };
    try {
      await fetch('https://example.com/', { mode: 'no-cors' });
      r.fetch = 'toegestaan';
    } catch {
      r.fetch = 'geweigerd';
    }
    const s = document.createElement('script');
    try {
      s.textContent = 'window.__ingelezen = true';
      document.head.append(s);
      r.dynamisch = 'toegestaan';
    } catch (f) {
      r.dynamisch = f?.name ?? 'fout';
    }
    r.daarna = window.__ingelezen ? 'uitgevoerd' : 'geweigerd';
    return r;
  });
  expect(uitslag).toEqual({ inline: 'geweigerd', schending: true, fetch: 'geweigerd', dynamisch: 'TypeError', daarna: 'geweigerd' });
});

test('de service worker zet alleen de app-schil in de cache, geen antwoorden met gegevens', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const urls = await page.evaluate(async () => {
    const uit = [];
    for (const naam of await caches.keys()) for (const v of await (await caches.open(naam)).keys()) uit.push(new URL(v.url));
    return uit;
  });
  expect(urls.length).toBeGreaterThan(5);
  // Alleen de app-schil: code, stijl, pagina's, beelden, lettertypes en het manifest; daarnaast precies twee vaste tekstbestanden bij naam:
  // de licenties (BESLISSING 427: ook offline te lezen) en robots.txt. Geen enkel ander bestand, dus ook geen antwoord met gegevens.
  const TEKSTBESTANDEN = ['/licenties-derden.txt', '/robots.txt'];
  for (const u of urls) {
    expect(u.origin).toBe(OORSPRONG);
    if (TEKSTBESTANDEN.includes(u.pathname)) continue;
    expect(u.pathname).toMatch(/\.(js|css|html|svg|png|woff|woff2|webmanifest)$|\/$/);
  }
});

test('een verslag maken en als pdf bewaren werkt ook offline (de lettertypes van de pdf zitten in de offline cache)', async ({ page, context }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  page.on('requestfailed', (v) => fouten.push('mislukt: ' + v.url()));
  // Een verslag heeft gegevens nodig: een glas water vandaag.
  await page.goto('./#/vandaag');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
  await page.goto('./#/delen');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // De pdf-lettertypes (.woff) staan in de cache.
  const woffs = await page.evaluate(async () => {
    const uit = [];
    for (const naam of await caches.keys()) for (const v of await (await caches.open(naam)).keys()) if (new URL(v.url).pathname.endsWith('.woff')) uit.push(v.url);
    return uit;
  });
  expect(woffs.length).toBeGreaterThanOrEqual(3);

  await context.setOffline(true);
  await page.reload();
  const bewaar = page.getByRole('button', { name: 'Bewaren', exact: true });
  await expect(bewaar).toBeVisible();
  await expect(bewaar).toBeEnabled({ timeout: 15000 });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), bewaar.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await context.setOffline(false);
  expect(fouten.filter((f) => !/favicon/.test(f))).toEqual([]);
});
