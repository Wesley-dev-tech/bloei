// Beveiliging en privacy (BESLISSING 329): kenmerken die zonder browser na te gaan zijn. De schermtests staan in
// tests/e2e/c-beveiliging.spec.js, de meldingsdienst in tests/worker/worker.test.js en de publieke bestanden in publiek.test.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { veiligAttribuut } from '../../src/ui/dom.js';
import { vergeetPasskey } from '../../src/vergrendeling/passkey.js';
import { kiesMelding, algemeneMelding } from '../../src/meldingen/tekst.js';
import { bouwLichaam } from '../../src/meldingen/push.js';
import { maakPin } from '../../src/vergrendeling/pin.js';
import { t } from '../../src/teksten.js';

const SRC = join(import.meta.dirname, '..', '..', 'src');
function alleJs(map) {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? alleJs(pad) : pad.endsWith('.js') ? [pad] : [];
  });
}
const BRONNEN = alleJs(SRC).map((pad) => ({ pad: relative(SRC, pad).replace(/\\/g, '/'), tekst: readFileSync(pad, 'utf8') }));
// Commentaar telt niet mee voor de zoektochten hieronder.
const zonderCommentaar = (tekst) => tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

afterEach(() => vi.unstubAllGlobals());

describe('tekst wordt nooit html', () => {
  it('innerHTML staat alleen in svg() van dom.js; geen eval, new Function, document.write, insertAdjacentHTML, outerHTML of DOMParser', () => {
    const fout = [];
    for (const { pad, tekst } of BRONNEN) {
      const code = zonderCommentaar(tekst);
      if (/\binnerHTML\s*=/.test(code) && pad !== 'ui/dom.js') fout.push(pad + ': innerHTML');
      for (const [naam, patroon] of [
        ['eval', /\beval\s*\(/],
        ['new Function', /\bnew\s+Function\s*\(/],
        ['document.write', /\bdocument\.write(ln)?\s*\(/],
        ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
        ['outerHTML', /\bouterHTML\s*=/],
        ['DOMParser', /\bDOMParser\b/],
        ['createContextualFragment', /\bcreateContextualFragment\b/],
        ['setTimeout met tekst', /\bset(?:Timeout|Interval)\s*\(\s*['"`]/],
      ]) {
        if (patroon.test(code)) fout.push(pad + ': ' + naam);
      }
    }
    expect(fout).toEqual([]);
    // In dom.js zelf: precies één innerHTML, in svg().
    const dom = zonderCommentaar(BRONNEN.find((b) => b.pad === 'ui/dom.js').tekst);
    expect(dom.match(/\binnerHTML\s*=/g)).toHaveLength(1);
  });

  it('svg() krijgt nergens tekst van de gebruiker: elke aanroep is vaste markup of een icoon uit de bundel', () => {
    // Een aanroep van svg( met een sjabloon mag alleen getallen, vaste namen en bundelbestanden invullen. We zoeken naar
    // namen die naar gebruikersgegevens wijzen binnen ${...} in een svg(-aanroep.
    const verdacht = /\b(naam|tekst|notitie|label|titel|omschrijving|hoeveelheid|aanwijzing|dosis|profiel)\b/i;
    const fout = [];
    for (const { pad, tekst } of BRONNEN) {
      const code = zonderCommentaar(tekst);
      // Elk sjabloon dat rechtstreeks aan svg( wordt gegeven, tot zijn sluitende backtick.
      for (const m of code.matchAll(/\bsvg\(\s*`([^`]*)`/g)) {
        for (const invul of m[1].matchAll(/\$\{([^}]*)\}/g)) if (verdacht.test(invul[1])) fout.push(`${pad}: \${${invul[1]}}`);
      }
    }
    expect(fout).toEqual([]);
  });

  it('h() zet geen handler als tekst en geen gevaarlijk adres', () => {
    for (const [naam, waarde] of [
      ['onclick', 'alert(1)'],
      ['onerror', 'x'],
      ['ONLOAD', 'x'],
      ['href', 'javascript:alert(1)'],
      ['href', ' JaVaScRiPt:alert(1)'],
      ['href', 'java\tscript:alert(1)'],
      ['href', '\u0001javascript:alert(1)'],
      ['src', 'vbscript:x'],
      ['href', 'data:text/html,<script>alert(1)</script>'],
      ['xlink:href', 'javascript:alert(1)'],
      ['action', 'javascript:alert(1)'],
      ['formaction', 'javascript:alert(1)'],
    ]) {
      expect(veiligAttribuut(naam, waarde), `${naam}=${JSON.stringify(waarde)}`).toBe(false);
    }
    for (const [naam, waarde] of [
      ['href', '#/vandaag'],
      ['href', '#/dagboek/dag/2026-11-15'],
      ['src', 'blob:http://localhost/abc'],
      ['src', 'data:image/png;base64,AAAA'],
      ['src', 'data:image/svg+xml,%3Csvg%3E'],
      ['src', './assets/icoon.png'],
      ['aria-label', '<img src=x onerror=alert(1)>'],
      ['title', 'javascript:alert(1)'], // geen adres: gewone tekst
      ['class', 'knop'],
      ['open', ''],
    ]) {
      expect(veiligAttribuut(naam, waarde), `${naam}=${JSON.stringify(waarde)}`).toBe(true);
    }
  });
});

describe('wat het toestel verlaat', () => {
  it('fetch staat alleen in de push-module (naar de ingestelde dienst), de service worker (eigen bestanden) en de pdf (eigen lettertypes); geen sendBeacon, XHR, WebSocket of EventSource', () => {
    const fout = [];
    for (const { pad, tekst } of BRONNEN) {
      const code = zonderCommentaar(tekst);
      if (/\bfetch\s*\(/.test(code) && !['meldingen/push.js', 'sw.js', 'ui/verslag-pdf.js'].includes(pad)) fout.push(pad + ': fetch');
      for (const [naam, patroon] of [
        ['sendBeacon', /\bsendBeacon\b/],
        ['XMLHttpRequest', /\bXMLHttpRequest\b/],
        ['WebSocket', /\bWebSocket\b/],
        ['EventSource', /\bEventSource\b/],
        ['importScripts', /\bimportScripts\b/],
        ['window.open', /\bwindow\.open\s*\(/],
        ['adres naar buiten', /['"`]https?:\/\/(?!www\.w3\.org\/)[^'"`\s]+/],
      ]) {
        if (patroon.test(code)) fout.push(pad + ': ' + naam);
      }
    }
    expect(fout).toEqual([]);
  });

  it('de pdf haalt alleen lettertypes uit de eigen bundel', () => {
    const pdf = BRONNEN.find((b) => b.pad === 'ui/verslag-pdf.js').tekst;
    for (const m of pdf.matchAll(/import\s+(\w+Url)\s+from\s+'([^']+)'/g)) expect(m[2], m[1]).toMatch(/^\.\.?\/.*\.woff2?\?url$|^@fontsource/);
  });

  it('het lichaam naar de dienst bevat alleen het abonnement en de uren, zonder soort, naam of dagboekgegevens', () => {
    const abonnement = { endpoint: 'https://web.push.apple.com/x', expirationTime: null, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) }, extra: 'weg' };
    const keuzes = {
      dagboek: { aan: true, uur: '20:00' },
      drinken: [{ aan: true, uur: '11:00' }],
      supplementenUren: [{ aan: true, uur: '08:07' }, { aan: false, uur: '13:00' }],
      naam: 'Testnaam',
    };
    const lichaam = bouwLichaam(abonnement, keuzes);
    // BESLISSING 713: het uur gaat per minuut door, zonder afronding op het kwartier.
    expect(lichaam).toEqual({ abonnement: { endpoint: abonnement.endpoint, keys: abonnement.keys }, uren: ['08:07', '11:00', '20:00'] });
    expect(JSON.stringify(lichaam)).not.toMatch(/Testnaam|drinken|supplement|dagboek|weg/);
  });

  it('een pushsignaal draagt geen inhoud: de service worker leest event.data nooit en kiest de tekst zelf', () => {
    const sw = zonderCommentaar(BRONNEN.find((b) => b.pad === 'sw.js').tekst);
    // De push-luisteraar en de functie die de melding toont (tot de volgende luisteraar).
    const push = sw.slice(sw.indexOf('async function toonMelding'), sw.indexOf("addEventListener('notificationclick'"));
    expect(push).toMatch(/addEventListener\('push'/);
    expect(push).not.toMatch(/\.data\b/);
    // BESLISSING 716: de service worker stelt elke melding van de lijst zelf samen uit wat op het toestel staat (kiesMeldingen), en
    // elke getoonde melding komt uit die lijst of uit de algemene melding: geen tekst van buiten.
    expect(push).toMatch(/kiesMeldingen\(await leesMeldingInvoer\(/);
    expect(push).toMatch(/meldingen\.map\(\(melding\) =>\s*self\.registration\.showNotification\(melding\.titel, \{\s*body: melding\.tekst,/);
    expect(push.match(/showNotification\(/g)).toHaveLength(1);
  });
});

// BESLISSING 710: de vergrendeling beslist niet meer mee over de details; de schakelaar "Details tonen in meldingen" (standaard uit) beslist.
describe('meldingen met de vergrendeling aan', () => {
  it('tonen met details uit voor elke soort alleen de algemene tekst, wat er ook op het toestel staat', () => {
    const nu = new Date(2026, 10, 16, 8, 0);
    const invoer = {
      nu,
      slotAan: true,
      details: false,
      doelMl: 2500,
      spuitVandaag: true,
      dagboek: { aan: true, uur: '08:00' },
      drinken: [{ aan: true, uur: '08:00' }],
      supplementenUren: [{ aan: true, uur: '08:00' }],
      momenten: { ochtend: { genomen: 0, totaal: 3 } },
      status: { maaltijdenIngevuld: [], ml: 400, supplementen: { genomen: 0, totaal: 3 }, bijgehouden: true },
    };
    for (const soort of ['supplementen', 'drinken', 'dagboek']) {
      const alleen = { ...invoer, dagboek: { aan: soort === 'dagboek', uur: '08:00' }, drinken: [{ aan: soort === 'drinken', uur: '08:00' }], supplementenUren: [{ aan: soort === 'supplementen', uur: '08:00' }] };
      const m = kiesMelding(alleen);
      expect(m.titel, soort).toBe(t('melding.titelDagboek'));
      expect(m.tekst, soort).toBe(t('melding.algemeen'));
      expect(m.tekst).not.toMatch(/spuit|liter|ontbijt|supplement/i);
    }
    expect(algemeneMelding().tekst).toBe(t('melding.algemeen'));
  });

  // BESLISSING 710 (vroeger: "met de vergrendeling aan staan er ook met details aan geen details in"): de gebruiker kiest zelf.
  it('met de vergrendeling aan en details aan staan de details erin, net als met de vergrendeling uit', () => {
    const invoer = { nu: new Date(2026, 10, 16, 8, 0), slotAan: true, details: true, doelMl: 2500, spuitVandaag: true, dagboek: { aan: true, uur: '08:00' }, drinken: [], supplementenUren: [], momenten: {}, status: { ml: 400, bijgehouden: true } };
    expect(kiesMelding(invoer).tekst).not.toBe(t('melding.algemeen'));
    expect(kiesMelding(invoer)).toEqual(kiesMelding({ ...invoer, slotAan: false }));
  });

  it('zonder de schakelaar (standaard uit) toont geen enkele soort details, ook met de vergrendeling uit', () => {
    const nu = new Date(2026, 10, 16, 8, 0);
    const invoer = {
      nu,
      slotAan: false,
      doelMl: 2500,
      spuitVandaag: true,
      momenten: { ochtend: { genomen: 0, totaal: 3 } },
      status: { maaltijdenIngevuld: [], ml: 400, supplementen: { genomen: 0, totaal: 3 }, bijgehouden: true },
    };
    for (const soort of ['supplementen', 'drinken', 'dagboek']) {
      const alleen = { ...invoer, dagboek: { aan: soort === 'dagboek', uur: '08:00' }, drinken: [{ aan: soort === 'drinken', uur: '08:00' }], supplementenUren: [{ aan: soort === 'supplementen', uur: '08:00' }] };
      for (const m of [kiesMelding(alleen), kiesMelding({ ...alleen, details: false })]) {
        expect(m.titel, soort).toBe(t('melding.titelDagboek'));
        expect(m.tekst, soort).toBe(t('melding.algemeen'));
        expect(m.tekst).not.toMatch(/spuit|liter|ontbijt|supplement|water/i);
      }
    }
  });
});

describe('de pincode', () => {
  it('staat nergens leesbaar in de bewaarde waarde, en het zout verschilt per keer', async () => {
    const a = await maakPin('482915');
    const b = await maakPin('482915');
    expect(JSON.stringify(a)).not.toContain('482915');
    expect(a.zout).not.toBe(b.zout);
    expect(a.hash).not.toBe(b.hash);
    expect(a.rondes).toBeGreaterThanOrEqual(210000);
    expect(Object.keys(a).sort()).toEqual(['hash', 'lengte', 'rondes', 'zout']);
  });
});

describe('de publicatie op Vercel (vercel.json)', () => {
  const WORTEL = join(import.meta.dirname, '..', '..');
  const vercel = JSON.parse(readFileSync(join(WORTEL, 'vercel.json'), 'utf8'));
  // De koppen per bron, als { source: { kop: waarde } }.
  const koppen = Object.fromEntries(vercel.headers.map((r) => [r.source, Object.fromEntries(r.headers.map((k) => [k.key, k.value]))]));
  const overal = koppen['/(.*)'];

  it('bouwt met npm en publiceert alleen dist; geen rewrites of redirects (de hash-router heeft ze niet nodig)', () => {
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites).toBeUndefined();
    expect(vercel.redirects).toBeUndefined();
    expect(vercel.routes).toBeUndefined();
  });

  it('de CSP-kop komt uit scripts/csp.mjs, met de hash van het thema-script in index.html en frame-ancestors none', async () => {
    const { cspKop, inlineScriptHashes } = await import('../../scripts/csp.mjs');
    // Vercel bouwt uit de repo (regeleinden LF); een Windows-kopie kan CRLF hebben. De hash geldt voor de LF-versie.
    const html = readFileSync(join(WORTEL, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const kop = overal['Content-Security-Policy'];
    expect(kop).toBe(cspKop(inlineScriptHashes(html)));
    const regels = kop.split('; ');
    expect(regels).toContain("frame-ancestors 'none'");
    expect(regels).toContain("object-src 'none'");
    expect(regels).toContain("default-src 'self'");
    const script = regels.find((r) => r.startsWith('script-src '));
    expect(script).toMatch(/^script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+$/);
    expect(kop).not.toMatch(/unsafe-inline|unsafe-eval|strict-dynamic|\*/);
  });

  it('stuurt de andere beveiligingskoppen op elke bron', () => {
    expect(overal['X-Content-Type-Options']).toBe('nosniff');
    expect(overal['Referrer-Policy']).toBe('no-referrer');
    expect(overal['X-Frame-Options']).toBe('DENY');
    expect(overal['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(overal['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}/);
    const pp = Object.fromEntries(overal['Permissions-Policy'].split(/,\s*/).map((r) => r.split('=')));
    for (const uit of ['camera', 'microphone', 'payment', 'usb']) expect(pp[uit], uit).toBe('()');
    // Wat de app wel gebruikt: Face ID via een passkey (WebAuthn), het delen van het verslag en de locatie voor het weer
    // (data/weer.js; alleen voor Bloei zelf, nooit voor een andere oorsprong).
    for (const aan of ['publickey-credentials-get', 'publickey-credentials-create', 'web-share', 'geolocation']) expect(pp[aan], aan).toBe('(self)');
  });

  it('cache: index.html, sw.js en het manifest nooit lang, de bestanden met een hash in assets/ een jaar en immutable', () => {
    for (const bron of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) expect(koppen[bron]?.['Cache-Control'], bron).toBe('no-cache');
    expect(koppen['/assets/(.*)']['Cache-Control']).toBe('public, max-age=31536000, immutable');
    // Cache-Control staat nergens dubbel op dezelfde bron.
    expect(overal['Cache-Control']).toBeUndefined();
  });

  it('de stijlpagina en bronkaarten zitten niet in de productiebouw; wel in een testbouw met BLOEI_STIJLPAGINA=1', async () => {
    const { invoer, default: maakConfig } = await import('../../vite.config.js');
    expect(Object.values(invoer({}))).toEqual(['index.html']);
    expect(Object.values(invoer({ BLOEI_STIJLPAGINA: '1' }))).toEqual(['index.html', 'stijl.html']);
    // De config is een functie van de modus (de demoversie, BESLISSING 364); de echte bouw en de demobouw delen deze regels.
    for (const mode of ['production', 'demo']) {
      const config = maakConfig({ mode, command: 'build' });
      expect(config.build.sourcemap).toBe(false);
      expect(config.base).toBe('/');
    }
  });
});

describe('package.json in de bundel (controle 16 november)', () => {
  it('de bron importeert uit package.json alleen losse velden (version), nooit het hele bestand', () => {
    const fout = [];
    for (const { pad, tekst } of BRONNEN) {
      const code = zonderCommentaar(tekst);
      for (const m of code.matchAll(/import\s+([^;]*?)\s+from\s+['"][^'"]*package\.json['"]/g)) {
        const wat = m[1].trim();
        // Toegestaan: { version } of { version as x }. Een standaardimport of * as neemt alles mee.
        if (!/^\{\s*version(\s+as\s+\w+)?\s*\}$/.test(wat)) fout.push(`${pad}: import ${wat}`);
      }
    }
    expect(fout).toEqual([]);
  });
});

describe('de vrijstelling voor systeemvensters (controle 16 november)', () => {
  it('meldt het einde van de laatste vrijstelling, zodat het slot alsnog kan dichtgaan als de pagina nog verborgen is', async () => {
    vi.useFakeTimers();
    try {
      const { metVrijstelling, naVrijstelling, isVrijgesteld } = await import('../../src/vergrendeling/vrijstelling.js');
      const gemeld = [];
      const stop = naVrijstelling(() => gemeld.push(isVrijgesteld()));
      let klaar;
      const deel = metVrijstelling(() => new Promise((r) => (klaar = r)));
      expect(isVrijgesteld()).toBe(true);
      klaar();
      await deel;
      expect(gemeld).toEqual([]); // nog in de korte marge
      await vi.advanceTimersByTimeAsync(2000);
      expect(gemeld).toEqual([false]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('slot.js luistert naar dat einde en vraagt de code na een gemiste achtergrond', () => {
    const slot = zonderCommentaar(BRONNEN.find((b) => b.pad === 'vergrendeling/slot.js').tekst);
    expect(slot).toMatch(/naVrijstelling\(/);
    expect(slot).toMatch(/gemist/);
  });
});

describe('de passkey vergeten bij het wissen', () => {
  it('meldt de sleutel als onbekend waar de browser dat kan, en doet niets waar het niet kan', async () => {
    const aanroepen = [];
    vi.stubGlobal('location', { hostname: 'voorbeeld.vercel.app' });
    vi.stubGlobal('PublicKeyCredential', { signalUnknownCredential: async (x) => aanroepen.push(x) });
    expect(await vergeetPasskey('abc_-')).toBe(true);
    expect(aanroepen).toEqual([{ rpId: 'voorbeeld.vercel.app', credentialId: 'abc_-' }]);
    expect(await vergeetPasskey(null)).toBe(false);
    vi.stubGlobal('PublicKeyCredential', {});
    expect(await vergeetPasskey('abc')).toBe(false);
    vi.stubGlobal('PublicKeyCredential', { signalUnknownCredential: async () => { throw new Error('nee'); } });
    expect(await vergeetPasskey('abc')).toBe(false);
  });

  // Bevinding van de nakijker: pas NA een geslaagde transactie (mislukt ze, dan blijft de passkey van het slot bruikbaar). De id's worden
  // vóór de transactie gelezen. Het gedrag zelf: tests/logica/wissen-volgorde.test.js.
  it('wissen.js leest de id\'s vóór de tabellen leeg zijn en meldt ze pas daarna', () => {
    const wissen = BRONNEN.find((b) => b.pad === 'data/wissen.js').tekst;
    expect(wissen.indexOf("get('slot.passkeyId')")).toBeGreaterThan(0);
    expect(wissen.indexOf("get('slot.passkeyId')")).toBeLessThan(wissen.indexOf('tabel.clear()'));
    expect(wissen.indexOf('vergeetPasskey(')).toBeGreaterThan(wissen.indexOf('tabel.clear()'));
  });
});
