// Android (BESLISSING 423): de herkenning van het toestel (src/kern/toestel.js), de naam van de methode van het slot (AN-04), de uitleg
// "Bloei op mijn beginscherm zetten" (AN-02), de stappen bij geweigerde meldingen (AN-05), de installatievraag (AN-03) en de blijvende
// opslag (AN-01, BESLISSING 440: nu overal behalve Firefox). Telkens ook: op iPhone, iPad en desktop blijft alles zoals het was.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isAndroid, isChromeAndroid, isFirefox, isIos, isStandalone } from '../../src/kern/toestel.js';
import { methodeNaam, methodeTekst, faceIdNaam } from '../../src/vergrendeling/passkey.js';
import { stappenVoor } from '../../src/uitleg/stappen.js';
import { t } from '../../src/teksten.js';
import { vraagBlijvendeOpslagStil } from '../../src/pwa/opslag.js';

afterEach(() => vi.unstubAllGlobals());

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};
const nav = (soort, extra = {}) => {
  const platform = { iphone: 'iPhone', ipad: 'MacIntel', mac: 'MacIntel', desktopChrome: 'Win32', desktopFirefox: 'Win32' }[soort] ?? 'Linux armv8l';
  const maxTouchPoints = soort === 'ipad' ? 5 : soort === 'mac' || soort.startsWith('desktop') ? 0 : 5;
  return { userAgent: UA[soort], platform, maxTouchPoints, ...extra };
};

describe('toestel.js: welk toestel', () => {
  const verwacht = {
    iphone: { ios: true, android: false, chrome: false, firefox: false },
    ipad: { ios: true, android: false, chrome: false, firefox: false },
    chromeAndroid: { ios: false, android: true, chrome: true, firefox: false },
    samsung: { ios: false, android: true, chrome: false, firefox: false },
    firefoxAndroid: { ios: false, android: true, chrome: false, firefox: true },
    webview: { ios: false, android: true, chrome: false, firefox: false },
    desktopChrome: { ios: false, android: false, chrome: false, firefox: false },
    desktopFirefox: { ios: false, android: false, chrome: false, firefox: true },
    mac: { ios: false, android: false, chrome: false, firefox: false },
  };
  for (const [soort, v] of Object.entries(verwacht)) {
    it(soort, () => {
      const n = nav(soort);
      expect(isIos(n)).toBe(v.ios);
      expect(isAndroid(n)).toBe(v.android);
      expect(isChromeAndroid(n)).toBe(v.chrome);
      expect(isFirefox(n)).toBe(v.firefox);
    });
  }

  it('leest standaard de navigator van de pagina', () => {
    vi.stubGlobal('navigator', nav('chromeAndroid'));
    expect(isAndroid()).toBe(true);
    vi.stubGlobal('navigator', nav('iphone'));
    expect(isAndroid()).toBe(false);
    expect(isIos()).toBe(true);
  });

  it('isStandalone: navigator.standalone (iOS) of display-mode standalone', () => {
    expect(isStandalone({ standalone: true }, null)).toBe(true);
    expect(isStandalone({}, { matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isStandalone({}, { matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }) })).toBe(true);
    expect(isStandalone(undefined, undefined)).toBe(false);
  });
});

describe('AN-04: de naam van de methode van het slot', () => {
  it('buiten Android precies Face ID (BESLISSING 192/193)', () => {
    for (const soort of ['iphone', 'ipad', 'desktopChrome', 'mac']) {
      vi.stubGlobal('navigator', nav(soort));
      expect(faceIdNaam()).toBe('Face ID');
      expect(methodeNaam()).toBe('Face ID');
      expect(methodeTekst('slot.faceIdAan')).toBe(t('slot.faceIdAan', { naam: 'Face ID' }));
      expect(methodeTekst('slot.kwijtFaceId')).toBe(t('slot.kwijtFaceId', { naam: 'Face ID' }));
      expect(methodeTekst('slot.eerstCode')).toBe(t('slot.eerstCode', { naam: 'Face ID' }));
      expect(methodeTekst('slot.faceHint')).toBe(t('slot.faceHint'));
      expect(methodeTekst('slot.hoeFaceId')).toBe(t('slot.hoeFaceId'));
      expect(methodeTekst('slot.hoeCode')).toBe(t('slot.hoeCode'));
    }
  });

  it('op Android: vingerafdruk of schermslot, met een hoofdletter vooraan, en nergens Face ID', () => {
    vi.stubGlobal('navigator', nav('chromeAndroid'));
    expect(faceIdNaam()).toBe('Vingerafdruk of schermslot');
    expect(methodeNaam()).toBe('vingerafdruk of schermslot');
    expect(methodeTekst('slot.faceIdAan')).toBe('Vingerafdruk gebruiken'); // BESLISSING 712: past op een regel onder het cijferblok
    expect(methodeTekst('slot.kwijtFaceId')).toBe('Koos je vingerafdruk of schermslot, dan opent Bloei nog met vingerafdruk of schermslot.');
    expect(methodeTekst('slot.eerstCode')).toMatch(/^Kies eerst een code\. .*vingerafdruk of schermslot/);
    for (const s of ['slot.faceIdAan', 'slot.kwijtFaceId', 'slot.eerstCode', 'slot.faceHint', 'slot.hoeFaceId']) expect(methodeTekst(s), s).not.toMatch(/Face ID/);
    expect(methodeTekst('slot.hoeCode')).toBe(t('slot.hoeCode'));
  });

  it('de rondleidingen over het slot noemen op Android geen Face ID, elders letterlijk zoals voorheen', () => {
    for (const sleutel of ['h:slot', 'meer/vergrendeling']) {
      const ios = stappenVoor(sleutel, { android: false });
      const android = stappenVoor(sleutel, { android: true, chrome: true });
      expect(android.map((s) => s.id)).toEqual(ios.map((s) => s.id));
      for (const s of android) expect(`${s.titel} ${s.tekst}`, s.id).not.toMatch(/Face ID/);
      expect(JSON.stringify(ios)).toMatch(/Face ID/);
    }
  });
});

describe('AN-02: "Bloei op mijn beginscherm zetten"', () => {
  it('op iOS en desktop de bestaande vijf stappen, letterlijk', () => {
    const lijst = stappenVoor('h:beginscherm', { android: false });
    expect(lijst.map((s) => s.id)).toEqual(['safari', 'deel', 'zet', 'voegToe', 'daarna']);
    expect(lijst[0].titel).toBe('Open Bloei in Safari');
  });
  it('op Android in Chrome: de stappen van Chrome, zonder Safari, Deel of Voeg toe', () => {
    const lijst = stappenVoor('h:beginscherm', { android: true, chrome: true });
    expect(lijst.map((s) => s.id)).toEqual(['chrome', 'menu', 'installeren', 'daarna']);
    const alles = JSON.stringify(lijst);
    expect(alles).toMatch(/Installeren en snelkoppeling maken/);
    expect(alles).not.toMatch(/Safari|iPhone|Deel|Voeg toe|Face ID/);
  });
  it('op Android in een andere browser: één algemene stap en Daarna', () => {
    const lijst = stappenVoor('h:beginscherm', { android: true, chrome: false });
    expect(lijst.map((s) => s.id)).toEqual(['menu', 'daarna']);
    expect(JSON.stringify(lijst)).not.toMatch(/Safari|iPhone|Deel/);
  });
  it('de schermrondleiding beginscherm heeft ook een Android-variant', () => {
    expect(stappenVoor('beginscherm', { android: false }).map((s) => s.id)).toEqual(['deel', 'zet']);
    expect(JSON.stringify(stappenVoor('beginscherm', { android: true, chrome: true }))).not.toMatch(/Safari|Deel/);
  });
  it('andere rondleidingen zijn op Android gelijk aan iOS', () => {
    for (const sleutel of ['vandaag', 'h:maaltijd', 'h:meldingen', 'meer/meldingen', 'drinken']) {
      expect(stappenVoor(sleutel, { android: true, chrome: true }), sleutel).toEqual(stappenVoor(sleutel, { android: false }));
    }
  });
});

describe('AN-01 en BESLISSING 440: blijvende opslag, stil, overal behalve Firefox', () => {
  const opslag = ({ persisted = false, persist = true } = {}) => ({ persisted: vi.fn(async () => persisted), persist: vi.fn(async () => persist) });

  it('vraagt het op Android, iPhone, iPad en desktop zonder iets te tonen', async () => {
    for (const soort of ['chromeAndroid', 'samsung', 'webview', 'iphone', 'ipad', 'mac', 'desktopChrome']) {
      const storage = opslag();
      expect(await vraagBlijvendeOpslagStil(nav(soort, { storage })), soort).toBe(true);
      expect(storage.persist, soort).toHaveBeenCalledTimes(1);
    }
  });
  it('al blijvend: geen nieuwe vraag', async () => {
    for (const soort of ['chromeAndroid', 'iphone', 'desktopChrome']) {
      const storage = opslag({ persisted: true });
      expect(await vraagBlijvendeOpslagStil(nav(soort, { storage })), soort).toBe(true);
      expect(storage.persist, soort).not.toHaveBeenCalled();
    }
  });
  it('geweigerd: false, zonder fout', async () => {
    expect(await vraagBlijvendeOpslagStil(nav('iphone', { storage: opslag({ persist: false }) }))).toBe(false);
  });
  it('nooit in Firefox (die toont zelf een venster), op desktop en op Android', async () => {
    for (const soort of ['firefoxAndroid', 'desktopFirefox']) {
      const storage = opslag();
      expect(await vraagBlijvendeOpslagStil(nav(soort, { storage })), soort).toBe(false);
      expect(storage.persist, soort).not.toHaveBeenCalled();
      expect(storage.persisted, soort).not.toHaveBeenCalled();
    }
  });
  it('een fout of een ontbrekende API breekt niets', async () => {
    expect(await vraagBlijvendeOpslagStil(nav('iphone', { storage: { persisted: async () => { throw new Error('x'); } } }))).toBe(false);
    expect(await vraagBlijvendeOpslagStil(nav('chromeAndroid', { storage: { persist: async () => { throw new Error('x'); } } }))).toBe(false);
    expect(await vraagBlijvendeOpslagStil(nav('chromeAndroid'))).toBe(false);
    expect(await vraagBlijvendeOpslagStil(undefined)).toBe(false);
  });
});
