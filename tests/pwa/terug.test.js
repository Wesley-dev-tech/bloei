// "Terug" bij een open venster (src/pwa/terug.js, AN-06 en AN-07), met een nagebootste sessiegeschiedenis (zoals een browser:
// pushState voegt een ingang toe en snoeit wat erna kwam, back/go zijn asynchroon en sturen popstate; een hash-navigatie stuurt hashchange).
// Daarnaast de installatievraag van Android (AN-03, src/pwa/installatie.js) met een nagebootst beforeinstallprompt, en de stappen bij
// geweigerde meldingen (AN-05).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function maakBrowser(start = 'http://x/#/vandaag') {
  const lijst = [{ url: start, state: null }];
  let i = 0;
  const luisteraars = { popstate: [], hashchange: [] };
  const zend = (soort) => luisteraars[soort].forEach((f) => f({ type: soort }));
  const ga = (delta) => {
    const doel = i + delta;
    if (doel < 0 || doel >= lijst.length) return;
    setTimeout(() => {
      const oud = lijst[i].url;
      i = doel;
      zend('popstate');
      if (lijst[i].url !== oud) zend('hashchange');
    }, 0);
  };
  const browser = {
    window: { addEventListener: (s, f) => luisteraars[s]?.push(f), removeEventListener() {} },
    history: {
      get state() {
        return lijst[i].state;
      },
      pushState(state, _t, url) {
        lijst.splice(i + 1);
        lijst.push({ url: url ?? lijst[i].url, state });
        i += 1;
      },
      replaceState(state, _t, url) {
        lijst[i] = { url: url ?? lijst[i].url, state };
      },
      back: () => ga(-1),
      forward: () => ga(1),
      go: (d) => ga(d),
    },
    location: {
      get href() {
        return lijst[i].url;
      },
    },
    document: { getElementById: () => null },
    // Een navigatie in de app (location.hash = ...): een nieuwe ingang, dan hashchange.
    navigeer(url) {
      lijst.splice(i + 1);
      lijst.push({ url, state: null });
      i += 1;
      zend('hashchange');
    },
    get lijst() {
      return lijst;
    },
    get index() {
      return i;
    },
  };
  return browser;
}
const wacht = () => new Promise((r) => setTimeout(r, 5));

describe('terug.js: terug sluit het open venster en laat het scherm staan', () => {
  let b;
  let terug;
  beforeEach(async () => {
    vi.resetModules();
    b = maakBrowser();
    vi.stubGlobal('window', b.window);
    vi.stubGlobal('history', b.history);
    vi.stubGlobal('location', b.location);
    vi.stubGlobal('document', b.document);
    terug = await import('../../src/pwa/terug.js');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('een venster krijgt een ingang met dezelfde url; terug sluit het en de url blijft', async () => {
    const opTerug = vi.fn(() => true);
    terug.bewaakTerug({ opTerug });
    expect(b.lijst).toHaveLength(2);
    expect(b.lijst[1].url).toBe('http://x/#/vandaag');
    b.history.back();
    await wacht();
    expect(opTerug).toHaveBeenCalledTimes(1);
    expect(b.location.href).toBe('http://x/#/vandaag');
    expect(terug._intern.stapel).toHaveLength(0);
  });

  it('gewoon sluiten (kruisje, Escape, close request) haalt de ingang weer weg, zonder het venster nog eens te sluiten', async () => {
    const opTerug = vi.fn(() => true);
    const w = terug.bewaakTerug({ opTerug });
    w.los();
    await wacht();
    expect(b.index).toBe(0);
    expect(opTerug).not.toHaveBeenCalled();
  });

  it('een venster dat blijft (de supplementkaart met een vraag) krijgt zijn ingang terug; terug gooit niets weg', async () => {
    let blijft = true;
    const opTerug = vi.fn(() => !blijft);
    terug.bewaakTerug({ opTerug });
    b.history.back();
    await wacht();
    expect(opTerug).toHaveBeenCalledTimes(1);
    expect(terug._intern.stapel).toHaveLength(1);
    expect(terug.merkVan(b.history.state)).not.toBeNull();
    // nog eens terug: weer de vraag, en weer blijft het venster
    b.history.back();
    await wacht();
    expect(opTerug).toHaveBeenCalledTimes(2);
    expect(terug._intern.stapel).toHaveLength(1);
    blijft = false;
    b.history.back();
    await wacht();
    expect(terug._intern.stapel).toHaveLength(0);
    expect(b.location.href).toBe('http://x/#/vandaag');
  });

  it('twee vensters op elkaar (blad + bevestiging): terug sluit eerst het bovenste', async () => {
    const onder = vi.fn(() => true);
    const boven = vi.fn(() => true);
    terug.bewaakTerug({ opTerug: onder });
    terug.bewaakTerug({ opTerug: boven });
    b.history.back();
    await wacht();
    expect(boven).toHaveBeenCalledTimes(1);
    expect(onder).not.toHaveBeenCalled();
    b.history.back();
    await wacht();
    expect(onder).toHaveBeenCalledTimes(1);
  });

  it('beide vensters sluiten na elkaar zelf: beide ingangen verdwijnen', async () => {
    const a = terug.bewaakTerug({});
    const c = terug.bewaakTerug({});
    c.los();
    a.los();
    await wacht();
    await wacht();
    expect(b.index).toBe(0);
  });

  it('sluiten gevolgd door een navigatie: de navigatie blijft, en de achtergebleven ingang wordt later overgeslagen', async () => {
    b.navigeer('http://x/#/meer'); // [vandaag, meer]
    const w = terug.bewaakTerug({}); // [vandaag, meer, meer+merk]
    w.los();
    b.navigeer('http://x/#/drinken'); // in dezelfde taak: [vandaag, meer, meer+merk, drinken]
    await wacht();
    expect(b.location.href).toBe('http://x/#/drinken');
    expect(b.lijst).toHaveLength(4);
    // terug: naar de achtergebleven ingang (url meer) ...
    b.history.back();
    await wacht();
    expect(b.location.href).toBe('http://x/#/meer');
    // ... nog eens terug: de dode stap (meer → meer) wordt overgeslagen, één keer terug brengt je naar vandaag
    b.history.back();
    await wacht();
    await wacht();
    expect(b.location.href).toBe('http://x/#/vandaag');
  });

  it('vooruit op een achtergebleven ingang slaat ook over, in de richting vooruit', async () => {
    b.navigeer('http://x/#/meer');
    const w = terug.bewaakTerug({});
    w.los();
    b.navigeer('http://x/#/drinken');
    await wacht();
    b.history.go(-3); // naar vandaag
    await wacht();
    expect(b.location.href).toBe('http://x/#/vandaag');
    b.history.forward(); // meer
    await wacht();
    b.history.forward(); // meer+merk (dood) → vanzelf door naar drinken
    await wacht();
    await wacht();
    expect(b.location.href).toBe('http://x/#/drinken');
  });

  it('een nieuw venster dat opent terwijl de eigen stap terug nog onderweg is, blijft open en krijgt daarna zijn ingang', async () => {
    const eerste = terug.bewaakTerug({});
    eerste.los();
    await Promise.resolve(); // de microtaak: history.back is onderweg
    const tweede = vi.fn(() => true);
    terug.bewaakTerug({ opTerug: tweede });
    await wacht();
    expect(tweede).not.toHaveBeenCalled();
    expect(terug._intern.stapel).toHaveLength(1);
    expect(b.lijst).toHaveLength(2);
    expect(terug.merkVan(b.history.state)).not.toBeNull();
    b.history.back();
    await wacht();
    expect(tweede).toHaveBeenCalledTimes(1);
    expect(b.location.href).toBe('http://x/#/vandaag');
  });

  it('slokOp: zolang de rondleiding loopt, krijgt een venster dat ze opent geen eigen ingang', async () => {
    const rondleiding = vi.fn(() => true);
    terug.bewaakTerug({ opTerug: rondleiding, slokOp: true });
    const kaart = vi.fn(() => true);
    terug.bewaakTerug({ opTerug: kaart });
    expect(b.lijst).toHaveLength(2);
    b.history.back();
    await wacht();
    expect(rondleiding).toHaveBeenCalledTimes(1);
    expect(kaart).not.toHaveBeenCalled();
  });

  it('met het slot dicht blijft alles staan', async () => {
    b.document.getElementById = (id) => (id === 'slot' ? { hidden: false } : null);
    const opTerug = vi.fn(() => true);
    terug.bewaakTerug({ opTerug });
    b.history.back();
    await wacht();
    expect(opTerug).not.toHaveBeenCalled();
    expect(terug.merkVan(b.history.state)).not.toBeNull();
  });
});

describe('installatie.js: het event beforeinstallprompt op Android (BESLISSING 515)', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
  const maakWin = () => {
    const l = {};
    return { l, addEventListener: (s, f) => (l[s] = f), matchMedia: () => ({ matches: false }) };
  };
  const event = (outcome = 'accepted') => ({ preventDefault: vi.fn(), prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('op Android: het event wordt tegengehouden (geen eigen installatiebalk van Chrome), er is geen prompt() meer (BESLISSING 515)', async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 });
    const m = await import('../../src/pwa/installatie.js');
    const win = maakWin();
    expect(m.luisterNaarInstallatie(win, { userAgent: ANDROID })).toBe(true);
    const e = event('accepted');
    win.l.beforeinstallprompt(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.prompt).not.toHaveBeenCalled();
    expect(m.vraagInstallatie).toBeUndefined();
    expect(m.heeftInstallatievraag).toBeUndefined();
  });

  it('op iPhone en desktop luistert Bloei niet naar beforeinstallprompt (het gedrag van de browser blijft)', async () => {
    vi.resetModules();
    const m = await import('../../src/pwa/installatie.js');
    for (const ua of [IPHONE, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36']) {
      const win = maakWin();
      expect(m.luisterNaarInstallatie(win, { userAgent: ua, platform: 'x', maxTouchPoints: 0 })).toBe(false);
      expect(win.l.beforeinstallprompt).toBeUndefined();
    }
  });

  it('geïnstalleerd op Android: geen strook', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APK', '1');
    vi.stubGlobal('navigator', { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 });
    vi.stubGlobal('window', { addEventListener() {}, matchMedia: (q) => ({ matches: q.includes('standalone') }) });
    const m = await import('../../src/pwa/installatie.js');
    expect(await m.installatiestrook()).toBeNull();
  });
});

describe('meldingen: de stappen bij geweigerde meldingen (AN-05)', () => {
  it('buiten Android de bestaande zin, op Android per situatie een eigen zin', async () => {
    const { geweigerdStappenSleutel } = await import('../../src/meldingen/scherm.js');
    const { t } = await import('../../src/teksten.js');
    expect(geweigerdStappenSleutel({ android: false, standalone: false, chrome: false })).toBe('meldingen.geweigerdStappen');
    expect(geweigerdStappenSleutel({ android: false, standalone: true, chrome: false })).toBe('meldingen.geweigerdStappen');
    expect(geweigerdStappenSleutel({ android: true, standalone: true, chrome: true })).toBe('meldingen.geweigerdStappenAndroidApp');
    expect(geweigerdStappenSleutel({ android: true, standalone: false, chrome: true })).toBe('meldingen.geweigerdStappenAndroid');
    expect(geweigerdStappenSleutel({ android: true, standalone: false, chrome: false })).toBe('meldingen.geweigerdStappenAndroidAnder');
    expect(t('meldingen.geweigerdStappenAndroid')).toMatch(/Pagina-informatie.*Rechten/);
    for (const s of ['meldingen.geweigerdStappenAndroid', 'meldingen.geweigerdStappenAndroidApp', 'meldingen.geweigerdStappenAndroidAnder']) expect(t(s)).not.toMatch(/iPhone|Safari/);
  });
});
