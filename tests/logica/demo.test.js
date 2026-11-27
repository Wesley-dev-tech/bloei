// De demoversie (BESLISSING 364), spoor A: dezelfde code, gescheiden opslag, geen vergrendeling, geen meldingsdienst, en per bouw
// de juiste index.html, robots.txt en het juiste manifest. Elke module wordt per modus vers geladen (vi.resetModules), met VITE_DEMO
// gezet of niet: DEMO is in de app een constante die bij het laden vastligt.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORTEL = join(import.meta.dirname, '..', '..');
const lees = (p) => readFileSync(join(WORTEL, p), 'utf8');

async function laad(pad, { demo = false, env = {} } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_DEMO', demo ? 'true' : '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import(pad);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// Een kleine Storage zoals in de browser (localStorage en sessionStorage).
function nepOpslag(begin = {}) {
  const m = new Map(Object.entries(begin));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    sleutels: () => [...m.keys()].sort(),
  };
}

describe('namen per modus (src/kern/demo.js)', () => {
  it('de echte versie: bloei-dagboek, cache bloei, opslag bloei-', async () => {
    const d = await laad('../../src/kern/demo.js');
    expect([d.DEMO, d.DB_NAAM, d.CACHE_VOORVOEGSEL, d.OPSLAG_VOORVOEGSEL]).toEqual([false, 'bloei-dagboek', 'bloei', 'bloei-']);
  });
  it('de demo: bloei-demo voor database, cache en opslag', async () => {
    const d = await laad('../../src/kern/demo.js', { demo: true });
    expect([d.DEMO, d.DB_NAAM, d.CACHE_VOORVOEGSEL, d.OPSLAG_VOORVOEGSEL]).toEqual([true, 'bloei-demo', 'bloei-demo', 'bloei-demo-']);
  });
  it('alleen precies "true" zet de demo aan', async () => {
    for (const waarde of ['1', 'TRUE', 'ja', ' true']) {
      vi.resetModules();
      vi.stubEnv('VITE_DEMO', waarde);
      expect((await import('../../src/kern/demo.js')).DEMO, waarde).toBe(false);
    }
  });
  it('db.js opent de database van de eigen modus; thema en uitleg krijgen het eigen voorvoegsel', async () => {
    expect((await laad('../../src/data/db.js')).db.name).toBe('bloei-dagboek');
    expect((await laad('../../src/data/db.js', { demo: true })).db.name).toBe('bloei-demo');
    expect((await laad('../../src/thema/thema.js')).OPSLAGSLEUTEL).toBe('bloei-thema');
    expect((await laad('../../src/thema/thema.js', { demo: true })).OPSLAGSLEUTEL).toBe('bloei-demo-thema');
    expect((await laad('../../src/uitleg/rondleiding.js')).OPSLAGSLEUTEL).toBe('bloei-uitleg');
    expect((await laad('../../src/uitleg/rondleiding.js', { demo: true })).OPSLAGSLEUTEL).toBe('bloei-demo-uitleg');
  });
  it('nergens anders in src staat de naam van een database of een vaste opslagsleutel', () => {
    const fouten = [];
    const loop = (map) => {
      for (const naam of readdirSync(join(WORTEL, map))) {
        const pad = map + '/' + naam;
        if (statSync(join(WORTEL, pad)).isDirectory()) loop(pad);
        else if (pad.endsWith('.js') && pad !== 'src/kern/demo.js') {
          const tekst = lees(pad);
          if (/new Dexie\(\s*['"`]/.test(tekst)) fouten.push(pad + ': vaste databasenaam');
          if (/indexedDB\.(open|deleteDatabase)\(/.test(tekst)) fouten.push(pad + ': indexedDB rechtstreeks');
          if (/(localStorage|sessionStorage)\.(get|set|remove)Item\(\s*['"`]/.test(tekst)) fouten.push(pad + ': vaste opslagsleutel');
        }
      }
    };
    loop('src');
    expect(fouten).toEqual([]);
  });
});

describe('meldingen (src/meldingen/config.js)', () => {
  const DIENST = { VITE_PUSH_URL: 'https://dienst.example.com', VITE_VAPID_PUBLIEK: 'BNepSleutel' };
  it('de echte versie gebruikt de dienst als ze ingesteld is', async () => {
    const c = await laad('../../src/meldingen/config.js', { env: DIENST });
    expect(c.PUSH_URL).toBe('https://dienst.example.com');
    expect(c.dienstIngesteld()).toBe(true);
  });
  it('de demo: altijd "niet ingesteld", ook als VITE_PUSH_URL per ongeluk gezet is', async () => {
    const c = await laad('../../src/meldingen/config.js', { demo: true, env: DIENST });
    expect(c.PUSH_URL).toBe('');
    expect(c.VAPID_PUBLIEK).toBe('');
    expect(c.dienstIngesteld()).toBe(false);
    expect(c.pushBeschikbaar()).toBe(false);
    expect(c.pushToestand()).toBe('niet-beschikbaar');
  });
  it('de demo vraagt geen toestemming, abonneert niet en doet geen verzoek', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const p = await laad('../../src/meldingen/push.js', { demo: true, env: DIENST });
    expect(await p.zetMeldingenAan()).toBe('niet-beschikbaar');
    await p.zetMeldingenUit();
    expect(await p.werkUrenBij()).toBe('niet-beschikbaar');
    await p.meldAfBijWissen();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('vergrendeling (src/vergrendeling/slot.js)', () => {
  // Net genoeg van de browser om startSlot te laten luisteren.
  function nepPagina() {
    const slot = { hidden: true, replaceChildren: vi.fn(), classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
    vi.stubGlobal('document', { addEventListener() {}, getElementById: () => slot, body: { children: [], append() {} }, visibilityState: 'visible' });
    vi.stubGlobal('window', { addEventListener() {} });
    return slot;
  }
  it('het slot start nooit in de demo, ook niet met een ingestelde code in de demodatabase', async () => {
    const slot = nepPagina();
    const { zetInstelling } = await laad('../../src/data/instellingen.js', { demo: true });
    const { db } = await import('../../src/data/db.js');
    expect(db.name).toBe('bloei-demo');
    await zetInstelling('slot.pin', { hash: 'x', zout: 'y', rondes: 1, lengte: 6 });
    await zetInstelling('slot.aan', true);
    const s = await import('../../src/vergrendeling/slot.js');
    await expect(Promise.race([s.startSlot().then(() => 'open'), new Promise((r) => setTimeout(() => r('wacht'), 500))])).resolves.toBe('open');
    expect(s.isOpen()).toBe(true);
    expect(slot.replaceChildren).not.toHaveBeenCalled();
    s.vergrendel();
    await new Promise((r) => setTimeout(r, 50));
    expect(s.isOpen()).toBe(true);
    await db.delete();
  });
  it('in de echte versie houdt dezelfde instelling de app wel dicht (gelijk aan vroeger)', async () => {
    const src = lees('src/vergrendeling/slot.js');
    // De enige demo-regel staat bovenaan isAan(); de rest van het slot is ongewijzigd.
    expect(src.match(/\bDEMO\b/g).length).toBe(2);
    expect(src).toMatch(/async function isAan\(\) \{\n[^\n]*\n {2}if \(DEMO\) \{\n {4}aanBekend = false;\n {4}return false;\n {2}\}/);
  });
});

describe('wissen (src/data/wissen.js)', () => {
  async function zaaiEcht() {
    const echt = new Dexie('bloei-dagboek');
    echt.version(1).stores({ dagen: 'datum', instellingen: 'sleutel' });
    await echt.open();
    await echt.table('dagen').put({ datum: '2026-11-01', notitie: 'echte rij' });
    echt.close();
  }
  async function leesEcht() {
    const echt = new Dexie('bloei-dagboek');
    await echt.open();
    const rijen = await echt.table('dagen').toArray();
    echt.close();
    return rijen;
  }

  it('in de demo: alleen de eigen database en de eigen sleutels; de echte database en "bloei-thema" blijven', async () => {
    await zaaiEcht();
    const lokaal = nepOpslag({ 'bloei-thema': 'nacht', 'bloei-uitleg': '{}', 'bloei-demo-thema': 'salie', 'bloei-demo-uitleg': '{}', ander: '1' });
    const sessie = nepOpslag({ 'bloei-x': '1', 'bloei-demo-x': '1' });
    vi.stubGlobal('localStorage', lokaal);
    vi.stubGlobal('sessionStorage', sessie);
    vi.stubGlobal('fetch', vi.fn());
    const { db, openDb } = await laad('../../src/data/db.js', { demo: true });
    await openDb();
    await db.dagen.put({ datum: '2026-11-02', notitie: 'demo' });
    const { wisAlles } = await import('../../src/data/wissen.js');
    await wisAlles();
    expect(await db.dagen.count()).toBe(0);
    expect(await leesEcht()).toEqual([{ datum: '2026-11-01', notitie: 'echte rij' }]);
    expect(lokaal.sleutels()).toEqual(['ander', 'bloei-thema', 'bloei-uitleg']);
    expect(sessie.sleutels()).toEqual(['bloei-x']);
    expect(fetch).not.toHaveBeenCalled();
    await db.delete();
    await Dexie.delete('bloei-dagboek');
  });

  it('in de echte versie: zoals altijd, alles in localStorage en sessionStorage weg', async () => {
    const lokaal = nepOpslag({ 'bloei-thema': 'nacht', 'bloei-demo-thema': 'salie' });
    const sessie = nepOpslag({ 'bloei-x': '1' });
    vi.stubGlobal('localStorage', lokaal);
    vi.stubGlobal('sessionStorage', sessie);
    const { db, openDb } = await laad('../../src/data/db.js');
    await openDb();
    const { wisAlles } = await import('../../src/data/wissen.js');
    await wisAlles();
    expect(lokaal.sleutels()).toEqual([]);
    expect(sessie.sleutels()).toEqual([]);
    await db.delete();
  });

  it('wisEigenSleutels raakt alleen het voorvoegsel', async () => {
    const { wisEigenSleutels } = await laad('../../src/data/wissen.js');
    const o = nepOpslag({ 'bloei-demo-a': '1', 'bloei-a': '1', 'bloei-demo-b': '1' });
    wisEigenSleutels(o, 'bloei-demo-');
    expect(o.sleutels()).toEqual(['bloei-a']);
  });
});

describe('.env.example', () => {
  it('noemt elke VITE_-variabele die de code leest, en DEMO_ADRES', () => {
    const gelezen = new Set();
    const loop = (map) => {
      for (const naam of readdirSync(join(WORTEL, map))) {
        const pad = map + '/' + naam;
        if (statSync(join(WORTEL, pad)).isDirectory()) loop(pad);
        else if (/\.(js|mjs)$/.test(pad)) for (const m of lees(pad).matchAll(/import\.meta\.env\??\.(VITE_[A-Z0-9_]+)/g)) gelezen.add(m[1]);
      }
    };
    loop('src');
    for (const m of lees('vite.config.js').matchAll(/env\??\.((?:VITE_|DEMO_)[A-Z0-9_]+)/g)) gelezen.add(m[1]);
    expect([...gelezen].sort()).toEqual(expect.arrayContaining(['DEMO_ADRES', 'VITE_DEMO', 'VITE_PUSH_URL', 'VITE_VAPID_PUBLIEK']));
    const voorbeeld = lees('.env.example');
    for (const naam of gelezen) expect(voorbeeld, naam).toMatch(new RegExp('^' + naam + '=$', 'm'));
  });
  it('.env.demo zet alleen VITE_DEMO=true en laat de dienst leeg; geen geheim', () => {
    const regels = lees('.env.demo').split(/\r?\n/).filter((r) => r && !r.startsWith('#'));
    expect(regels).toEqual(['VITE_DEMO=true', 'VITE_PUSH_URL=', 'VITE_VAPID_PUBLIEK=']);
  });
  it('.gitignore houdt echte .env-bestanden buiten git, maar niet .env.example en .env.demo', () => {
    const regels = lees('.gitignore').split(/\r?\n/);
    for (const r of ['.env', '.env.*', '!.env.example', '!.env.demo', 'dist-*/']) expect(regels).toContain(r);
  });
});

describe('de bouw per versie (vite.config.js)', () => {
  const html = lees('index.html').replace(/\r\n/g, '\n');

  it('de echte versie: index.html letterlijk gelijk (met noindex), robots.txt Disallow, het manifest zoals het was', async () => {
    const { versieHtml, robotsTxt, manifestVoor } = await import('../../vite.config.js');
    expect(versieHtml(html, { demo: false })).toBe(html);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(robotsTxt(false)).toBe('User-agent: *\nDisallow: /\n');
    expect(lees('public/robots.txt').replace(/\r\n/g, '\n')).toBe(robotsTxt(false));
    const m = manifestVoor(false);
    expect(m.name).toBe('Bloei');
    expect(m.id).toBeUndefined();
    expect(m.start_url).toBe('/');
  });

  it('de demo: geen noindex, eigen titel, beschrijving, Open Graph en Twitter; het inline script (en dus de CSP-hash) blijft gelijk', async () => {
    const { versieHtml, robotsTxt, manifestVoor, DEMO_TITEL } = await import('../../vite.config.js');
    const { inlineScriptHashes } = await import('../../scripts/csp.mjs');
    const demo = versieHtml(html, { demo: true, adres: 'https://bloei-demo.example.com' });
    expect(demo).not.toMatch(/noindex/);
    expect(demo).toContain('<meta name="robots" content="index, follow" />');
    expect(demo).toContain(`<title>${DEMO_TITEL}</title>`);
    expect(DEMO_TITEL).toBe('Bloei · demo');
    for (const p of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"', 'name="twitter:image"']) expect(demo).toContain(p);
    expect(demo).toContain('<meta property="og:image" content="https://bloei-demo.example.com/og-bloei.png" />');
    expect(demo).toContain('<meta property="og:url" content="https://bloei-demo.example.com/" />');
    expect(inlineScriptHashes(demo)).toEqual(inlineScriptHashes(html));
    expect(versieHtml(html, { demo: true })).toContain('<meta property="og:image" content="/og-bloei.png" />');
    expect(robotsTxt(true)).toBe('User-agent: *\nAllow: /\n');
    const m = manifestVoor(true);
    expect([m.name, m.short_name]).toEqual(['Bloei demo', 'Bloei demo']);
    expect(m.id).toBeTruthy();
    expect(m.start_url).not.toBe('/');
  });

  it('de demo faalt luid als index.html niet meer de verwachte vorm heeft', async () => {
    const { versieHtml } = await import('../../vite.config.js');
    expect(() => versieHtml(html.replace('<title>Bloei</title>', '<title>Iets</title>'), { demo: true })).toThrow(/niet gevonden/);
  });

  it('demoAdres: DEMO_ADRES of het productieadres van Vercel, alleen https', async () => {
    const { demoAdres } = await import('../../vite.config.js');
    expect(demoAdres({})).toBe('');
    expect(demoAdres({ VERCEL_PROJECT_PRODUCTION_URL: 'bloei-demo.vercel.app' })).toBe('https://bloei-demo.vercel.app');
    expect(demoAdres({ DEMO_ADRES: 'https://demo.example.com/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe('https://demo.example.com');
    expect(demoAdres({ DEMO_ADRES: 'http://demo.example.com' })).toBe('');
  });

  it('de config per modus: demo bouwt in dist-demo met een eigen cache en maakt de dienst leeg; de echte niet', async () => {
    const { default: maakConfig } = await import('../../vite.config.js');
    const echt = maakConfig({ mode: 'production', command: 'build' });
    expect(echt.build.outDir).toBe('dist');
    expect(echt.define).toBeUndefined();
    expect(echt.cacheDir).toBeUndefined();
    const demo = maakConfig({ mode: 'demo', command: 'build' });
    expect(demo.build.outDir).toBe('dist-demo');
    expect(demo.cacheDir).toBe('node_modules/.vite-demo');
    expect(demo.define).toEqual({ 'import.meta.env.VITE_PUSH_URL': '""', 'import.meta.env.VITE_VAPID_PUBLIEK': '""' });
  });

  it('de csp-plugin: in de demo connect-src alleen self, ook met VITE_PUSH_URL', async () => {
    const { default: maakConfig } = await import('../../vite.config.js');
    const plugin = (cfg) => cfg.plugins.flat().find((p) => p?.name === 'bloei-csp');
    const meta = (env) => {
      const p = plugin(maakConfig({ mode: 'production', command: 'build' }));
      p.configResolved({ env });
      return p.transformIndexHtml.handler(html).match(/connect-src [^;]*/)[0];
    };
    // De echte app verbindt met de meldingsdienst, de weerdienst (Open-Meteo) en de waarschuwingen van het KMI (MeteoAlarm); de demo met geen.
    expect(meta({ VITE_PUSH_URL: 'https://dienst.example.com' })).toBe("connect-src 'self' https://dienst.example.com https://api.open-meteo.com https://feeds.meteoalarm.org");
    expect(meta({})).toBe("connect-src 'self' https://api.open-meteo.com https://feeds.meteoalarm.org");
    expect(meta({ VITE_PUSH_URL: 'https://dienst.example.com', VITE_DEMO: 'true' })).toBe("connect-src 'self'");
  });

  it('het Open Graph-beeld bestaat en is 1200x630', () => {
    const png = readFileSync(join(WORTEL, 'demo-publiek', 'og-bloei.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it('package.json: de scripts voor beide versies, zonder cross-env', () => {
    const p = JSON.parse(lees('package.json'));
    expect(p.scripts.dev).toBe('vite');
    expect(p.scripts.build).toBe('vite build');
    expect(p.scripts['dev:demo']).toBe('vite --mode demo --port 5230 --strictPort');
    expect(p.scripts['build:demo']).toBe('vite build --mode demo');
    expect(p.scripts['preview:demo']).toMatch(/^vite preview --mode demo /);
    expect(JSON.stringify(p)).not.toMatch(/cross-env/);
  });
});
