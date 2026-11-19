// BESLISSING 515: Android installeert Bloei met een apk die als download op de site staat.
// De strook op Vandaag (src/pwa/installatie.js), de koppen in vercel.json, het sjabloon voor assetlinks.json en de service worker.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';

const WORTEL = join(import.meta.dirname, '..', '..');
const lees = (pad) => readFileSync(join(WORTEL, pad), 'utf8');

// Geen DOM in deze omgeving: kaart, knop en h worden vervangen door platte objecten waar de test in kan zoeken.
vi.mock('../../src/ui/componenten.js', () => ({
  kaart: (opties, ...kinderen) => ({ soort: 'kaart', opties, kinderen, dataset: {}, remove() {} }),
  knop: (tekst, opties) => ({ soort: 'knop', tekst, opties }),
}));
vi.mock('../../src/ui/dom.js', () => ({ h: (tag, attrs, ...kinderen) => ({ soort: tag, attrs: attrs ?? {}, kinderen: kinderen.flat(Infinity) }) }));
let weggetikt = false;
vi.mock('../../src/data/instellingen.js', () => ({ leesInstelling: async () => weggetikt, zetInstelling: async () => {} }));

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

const alle = (el) => (el && typeof el === 'object' ? [el, ...(el.kinderen ?? []).flatMap(alle)] : [el]);
const link = (strook) => alle(strook).find((e) => e?.soort === 'a');

// Laadt installatie.js vers, met de bouwvlag, de demo, het toestel en de weergave zoals gevraagd.
async function strookMet({ apk = '1', demo = '', ua = ANDROID, standalone = false, referrer = '', sessie = {}, platform = 'Linux armv8l' } = {}) {
  vi.resetModules();
  weggetikt = false;
  vi.stubEnv('VITE_APK', apk);
  vi.stubEnv('VITE_DEMO', demo);
  vi.stubGlobal('navigator', { userAgent: ua, platform, maxTouchPoints: 5 });
  vi.stubGlobal('window', { addEventListener() {}, matchMedia: (q) => ({ matches: standalone && q.includes('standalone') }) });
  vi.stubGlobal('document', { referrer });
  vi.stubGlobal('sessionStorage', { getItem: (k) => sessie[k] ?? null, setItem: (k, v) => (sessie[k] = v) });
  const m = await import('../../src/pwa/installatie.js');
  return { m, strook: await m.installatiestrook() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('de Android-strook met de downloadlink', () => {
  it('op Android, met de bouwvlag, in de gewone app: een link naar /bloei.apk met download, plus Niet nu', async () => {
    const { strook } = await strookMet();
    expect(strook).not.toBeNull();
    expect(strook.dataset.toestel).toBe('android');
    const a = link(strook);
    expect(a.attrs.href).toBe('/bloei.apk');
    expect(a.attrs).toHaveProperty('download');
    expect(alle(a).some((e) => e === 'Download de app')).toBe(true);
    expect(alle(strook).some((e) => e?.soort === 'knop' && e.tekst === 'Niet nu')).toBe(true);
    expect(alle(strook).some((e) => e === 'Download Bloei voor je Android-toestel. Android vraagt je daarna om het bestand te openen en te installeren.')).toBe(true);
  });

  it('zonder de bouwvlag geen strook (geen dode knop)', async () => {
    expect((await strookMet({ apk: '' })).strook).toBeNull();
    expect((await strookMet({ apk: '0' })).strook).toBeNull();
  });

  it('in de demo geen strook, ook niet met de bouwvlag', async () => {
    expect((await strookMet({ demo: 'true' })).strook).toBeNull();
  });

  it('in de apk zelf (schermvullend, of een referrer android-app://) geen strook, en dat blijft de hele sessie zo', async () => {
    expect((await strookMet({ standalone: true })).strook).toBeNull();
    const sessie = {};
    expect((await strookMet({ referrer: 'android-app://be.voorbeeld.bloei', sessie })).strook).toBeNull();
    // een latere pagina zonder referrer, zelfde sessie
    expect((await strookMet({ referrer: '', sessie })).strook).toBeNull();
    // een andere sessie zonder referrer krijgt de strook wel
    expect((await strookMet({ referrer: '', sessie: {} })).strook).not.toBeNull();
  });

  it('niet meer na "Niet nu"', async () => {
    const { m } = await strookMet();
    weggetikt = true;
    expect(await m.installatiestrook()).toBeNull();
  });

  it('niet op desktop; op een iPhone blijft de eigen strook zonder download', async () => {
    const desktop = await strookMet({ ua: DESKTOP, platform: 'Win32' });
    expect(desktop.strook).toBeNull();
    const ios = await strookMet({ ua: IPHONE, platform: 'iPhone' });
    expect(ios.strook).not.toBeNull();
    expect(link(ios.strook)).toBeUndefined();
    expect(alle(ios.strook).some((e) => e === 'Tik op “Deel” en dan op “Zet op beginscherm”. Dan opent Bloei als een gewone app.')).toBe(true);
  });

  it('het apk-adres en de vlag staan op een plek', async () => {
    const { m } = await strookMet();
    expect(m.APK_ADRES).toBe('/bloei.apk');
    expect(m.apkBeschikbaar({ VITE_APK: '1' })).toBe(true);
    expect(m.apkBeschikbaar({ VITE_APK: '' })).toBe(false);
  });
});

describe('de bouwvlag in vite.config.js', () => {
  it('apkVlag is 1 alleen als public/bloei.apk bestaat en het niet de demo is', async () => {
    const { apkVlag } = await import('../../vite.config.js');
    const heeft = existsSync(join(WORTEL, 'public', 'bloei.apk'));
    expect(apkVlag(false)).toBe(heeft ? '1' : '');
    expect(apkVlag(true)).toBe('');
    expect(apkVlag(false, join(WORTEL, 'tests'))).toBe('');
  });
});

describe('vercel.json: de koppen voor de apk en assetlinks', () => {
  const json = JSON.parse(lees('vercel.json'));
  const koppen = json.headers;
  const van = (bron) => Object.fromEntries(koppen.find((k) => k.source === bron).headers.map((x) => [x.key, x.value]));

  it('/bloei.apk is een bijlage met het juiste type en wordt niet bewaard', () => {
    expect(van('/bloei.apk')).toEqual({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="bloei.apk"',
      'Cache-Control': 'no-cache',
    });
  });
  it('/.well-known/assetlinks.json is json', () => {
    expect(van('/.well-known/assetlinks.json')['Content-Type']).toBe('application/json');
  });
  it('de beveiligingskoppen gelden voor alle adressen, en geen omleiding of terugval onderschept assetlinks of de apk', () => {
    expect(koppen[0].source).toBe('/(.*)');
    expect(koppen[0].headers.map((x) => x.key)).toEqual(expect.arrayContaining(['Content-Security-Policy', 'X-Content-Type-Options', 'Strict-Transport-Security']));
    for (const sleutel of ['rewrites', 'redirects', 'routes', 'cleanUrls', 'trailingSlash']) expect(json[sleutel], sleutel).toBeUndefined();
  });
  it('de CSP laat een download van hetzelfde adres toe: default-src self; form-action none geldt voor formulieren, niet voor een link', () => {
    const csp = van('/(.*)')['Content-Security-Policy'];
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/form-action 'none'/);
  });
});

describe('assetlinks.json.voorbeeld', () => {
  it('is geldige json met de vorm die Android vraagt', () => {
    const sjabloon = JSON.parse(lees('docs/assetlinks.json.voorbeeld'));
    expect(sjabloon).toHaveLength(1);
    expect(sjabloon[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(sjabloon[0].target.namespace).toBe('android_app');
    expect(sjabloon[0].target.package_name).toMatch(/PLAATSHOUDER/);
    expect(sjabloon[0].target.sha256_cert_fingerprints).toHaveLength(1);
  });
  it('het echte bestand staat niet in de repo', () => {
    expect(existsSync(join(WORTEL, 'public', '.well-known', 'assetlinks.json'))).toBe(false);
  });
  it('het sjabloon staat buiten public/, zodat het niet in een bouw en dus niet op de site komt (OWASP-scan punt 11)', () => {
    expect(existsSync(join(WORTEL, 'public', '.well-known', 'assetlinks.json.voorbeeld'))).toBe(false);
  });
});

describe('de service worker', () => {
  const vite = lees('vite.config.js');
  it('de voorraadlijst slaat de apk en .well-known over', () => {
    expect(vite).toMatch(/globIgnores: \[[^\]]*'bloei\.apk'[^\]]*'\.well-known\/\*\*'[^\]]*\]/);
    expect(vite).not.toMatch(/globPatterns: \['[^']*\b(apk|json)\b[^']*'\]/);
  });
  it('de gebouwde sw.js bevat geen apk of .well-known (als er een bouw is)', () => {
    const sw = join(WORTEL, 'dist', 'sw.js');
    if (!existsSync(sw)) return; // zonder bouw valt er niets te lezen; de schermtest x-android controleert de bouw
    expect(readFileSync(sw, 'utf8')).not.toMatch(/bloei\.apk|well-known|assetlinks/);
  });
});

describe('de uitleg over installeren op Android', () => {
  it('met de apk gaat de uitleg over de download, zonder het menu van Chrome; zonder apk blijven de stappen van Chrome', async () => {
    vi.resetModules();
    const { stappenVoor } = await import('../../src/uitleg/stappen.js');
    const met = stappenVoor('h:beginscherm', { android: true, chrome: true, apk: true });
    expect(met.map((s) => s.id)).toEqual(['download', 'openen', 'toestaan', 'daarna']);
    expect(JSON.stringify(met)).not.toMatch(/Chrome|Safari|Deel|Voeg toe|Installeren en snelkoppeling/);
    expect(stappenVoor('beginscherm', { android: true, chrome: true, apk: true }).map((s) => s.id)).toEqual(['download', 'toestaan']);
    const zonder = stappenVoor('h:beginscherm', { android: true, chrome: true, apk: false });
    expect(zonder.map((s) => s.id)).toEqual(['chrome', 'menu', 'installeren', 'daarna']);
    // iOS blijft gelijk, ook als de apk er is
    expect(stappenVoor('h:beginscherm', { android: false, apk: true }).map((s) => s.id)).toEqual(['safari', 'deel', 'zet', 'voegToe', 'daarna']);
  });
});
