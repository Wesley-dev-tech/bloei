// R6-07 en R6-08: werkUrenBij (src/meldingen/push.js) meldt een mislukte doorgave en herhaalt ze; een ingetrokken toestemming laat het
// abonnement niet op de dienst staan. Alles gespeeld met nepdiensten: er gaat geen verzoek naar buiten.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const opslag = new Map();
vi.mock('../../src/meldingen/config.js', () => ({ PUSH_URL: 'https://dienst.test', VAPID_PUBLIEK: 'AAAA', pushBeschikbaar: () => true, pushToestand: () => 'beschikbaar' }));
vi.mock('../../src/data/instellingen.js', () => ({
  leesInstelling: async (sleutel) => structuredClone(opslag.get(sleutel) ?? null),
  zetInstelling: async (sleutel, waarde) => void opslag.set(sleutel, structuredClone(waarde)),
}));

const { werkUrenBij, startMeldingen, _zetTerugVoorTest, WACHTTIJD_MS, wachtUit, doorgevenNaWacht } = await import('../../src/meldingen/push.js');
const { luister, zend } = await import('../../src/kern/bus.js');

const abonnement = { endpoint: 'https://push.test/x', keys: { p256dh: 'P', auth: 'A' } };
let sub;
let verzoeken;
let details = [];
let fetchAntwoord;
const wacht = () => new Promise((klaar) => setTimeout(klaar, 20));

function nepOmgeving({ toestemming = 'granted', metAbonnement = true } = {}) {
  sub = { endpoint: abonnement.endpoint, toJSON: () => abonnement, unsubscribe: vi.fn(async () => true) };
  const reg = { pushManager: { getSubscription: async () => (metAbonnement ? sub : null), subscribe: async () => sub } };
  const luisteraars = {};
  vi.stubGlobal('Notification', { permission: toestemming });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg), addEventListener: vi.fn() } });
  vi.stubGlobal('window', { addEventListener: (naam, fn) => (luisteraars['window:' + naam] = fn), location: { hash: '' } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (naam, fn) => (luisteraars['document:' + naam] = fn) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opties) => {
      verzoeken.push({ url, methode: opties.method });
      details.push({ methode: opties.method, uren: JSON.parse(opties.body).uren, keepalive: opties.keepalive });
      return fetchAntwoord();
    }),
  );
  return luisteraars;
}

beforeEach(() => {
  opslag.clear();
  opslag.set('meldingen.dagboek', { aan: true, uur: '20:00' });
  opslag.set('meldingen.drinken', [{ aan: true, uur: '11:00' }]);
  opslag.set('meldingen.supplementenUren', []);
  opslag.set('meldingen.abonnement', abonnement);
  verzoeken = [];
  details = [];
  fetchAntwoord = () => ({ ok: true, status: 200 });
  // Een 429 of 503 laat een wachttijd achter in push.js (Retry-After) en in localStorage: elke test begint zonder.
  const leeg = new Map();
  vi.stubGlobal('localStorage', { getItem: (k) => leeg.get(k) ?? null, setItem: (k, v) => leeg.set(k, String(v)), removeItem: (k) => leeg.delete(k) });
  _zetTerugVoorTest();
});
// startMeldingen geeft een functie terug die zijn luisteraars op de bus weghaalt: anders reageert elke vorige start mee.
const stops = [];
afterEach(() => {
  while (stops.length) stops.pop()?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mislukte doorgave (R6-07)', () => {
  it('geeft "mislukt" terug en meldt het via het event meldingen:mislukt', async () => {
    nepOmgeving();
    fetchAntwoord = () => ({ ok: false, status: 503 });
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    expect(await werkUrenBij()).toBe('mislukt');
    expect(gemeld).toHaveBeenCalledTimes(1);
    stop();
  });

  it('een geslaagde doorgave geeft "ok" en geen event', async () => {
    nepOmgeving();
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    expect(await werkUrenBij()).toBe('ok');
    expect(gemeld).not.toHaveBeenCalled();
    stop();
  });

  it('herhaalt de doorgave zodra het toestel weer online is, en daarna niet meer', async () => {
    const luisteraars = nepOmgeving();
    stops.push(startMeldingen());
    await wacht();
    // Het opstarten gaf "ok". Nu is de dienst onbereikbaar bij een volgende wijziging (geen netwerk: geen wachttijd van de dienst;
    // een 429 of 503 wacht op Retry-After, zie meldingen-push-wacht.test.js).
    fetchAntwoord = () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await werkUrenBij()).toBe('mislukt');
    const voor = verzoeken.length;
    fetchAntwoord = () => ({ ok: true, status: 200 });
    luisteraars['window:online']();
    await wacht();
    expect(verzoeken.length).toBe(voor + 1);
    // Gelukt: een volgende "online" doet niets meer.
    luisteraars['window:online']();
    await wacht();
    expect(verzoeken.length).toBe(voor + 1);
  });

  it('herhaalt ook als de app weer zichtbaar wordt', async () => {
    const luisteraars = nepOmgeving();
    stops.push(startMeldingen());
    await wacht();
    fetchAntwoord = () => {
      throw new TypeError('Failed to fetch');
    };
    await werkUrenBij();
    const voor = verzoeken.length;
    fetchAntwoord = () => ({ ok: true, status: 200 });
    luisteraars['document:visibilitychange']();
    await wacht();
    expect(verzoeken.length).toBe(voor + 1);
  });
});

describe('ingetrokken toestemming (R6-08)', () => {
  it('meldt het abonnement toch af, schrijft het lokaal uit en zet de keuzes uit (met behoud van de uren)', async () => {
    nepOmgeving({ toestemming: 'denied' });
    expect(await werkUrenBij()).toBe('geweigerd');
    expect(verzoeken).toEqual([{ url: 'https://dienst.test/abonnement', methode: 'DELETE' }]);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(opslag.get('meldingen.abonnement')).toBeNull();
    expect(opslag.get('meldingen.dagboek')).toEqual({ aan: false, uur: '20:00' });
    expect(opslag.get('meldingen.drinken')).toEqual([{ aan: false, uur: '11:00' }]);
  });

  it('zonder abonnement en zonder keuzes die aan staan gaat er geen enkel verzoek uit', async () => {
    nepOmgeving({ toestemming: 'denied', metAbonnement: false });
    opslag.set('meldingen.abonnement', null);
    opslag.set('meldingen.dagboek', { aan: false, uur: '20:00' });
    opslag.set('meldingen.drinken', [{ aan: false, uur: '11:00' }]);
    await werkUrenBij();
    expect(verzoeken).toEqual([]);
  });

  it('een toestel dat nog niet gevraagd is ("default") verandert niets en doet geen verzoek', async () => {
    nepOmgeving({ toestemming: 'default' });
    expect(await werkUrenBij()).toBe('geweigerd');
    expect(verzoeken).toEqual([]);
    expect(opslag.get('meldingen.dagboek').aan).toBe(true);
  });
});

// 18 november: de dienst laat hoogstens WIJZIGINGEN_PER_DAG wijzigingen per dag toe en zegt bij een 429 met Retry-After wanneer het
// weer kan. De app stuurt een reeks tikken als één wijziging door en vraagt niet opnieuw vóór dat tijdstip.
const T = Date.parse('2026-11-18T09:00:00Z');
const weiger = (status, retryAfter) => () => ({ ok: false, status, headers: new Headers(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }) });
const zetUur = (uur) => {
  opslag.set('meldingen.dagboek', { aan: true, uur });
  zend('instelling:gewijzigd', { sleutel: 'meldingen.dagboek' });
};
const posts = () => details.filter((d) => d.methode === 'POST');

describe('een reeks snelle wijzigingen wordt één doorgave', () => {
  it('twaalf tikken met telkens een halve seconde ertussen: één POST, WACHTTIJD_MS (3 s) na de laatste tik, met de laatste uren', async () => {
    expect(WACHTTIJD_MS).toBe(3000);
    const luisteraars = nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    stops.push(startMeldingen());
    await vi.advanceTimersByTimeAsync(50);
    details = [];
    for (let i = 0; i < 12; i++) {
      zetUur(`${String(8 + i).padStart(2, '0')}:00`);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(posts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(WACHTTIJD_MS - 500 - 1);
    expect(posts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].uren).toEqual(['11:00', '19:00']);
    expect(posts()[0].keepalive).toBe(true);
    expect(luisteraars['window:pagehide']).toBeTypeOf('function');
  });

  it('de app naar de achtergrond: wat nog wacht, gaat meteen (met keepalive) en daarna niet nog eens', async () => {
    const luisteraars = nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    stops.push(startMeldingen());
    await vi.advanceTimersByTimeAsync(50);
    details = [];
    zetUur('07:15');
    await vi.advanceTimersByTimeAsync(200);
    document.visibilityState = 'hidden';
    luisteraars['document:visibilitychange']();
    await vi.advanceTimersByTimeAsync(10);
    expect(posts()).toEqual([{ methode: 'POST', uren: ['07:15', '11:00'], keepalive: true }]);
    await vi.advanceTimersByTimeAsync(WACHTTIJD_MS * 2);
    expect(posts()).toHaveLength(1);
  });

  it('pagehide en het verlaten van het scherm geven ook meteen door; zonder openstaande tik gebeurt er niets', async () => {
    const luisteraars = nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    stops.push(startMeldingen());
    await vi.advanceTimersByTimeAsync(50);
    details = [];
    luisteraars['window:pagehide']();
    zend('route:gewijzigd', {});
    await vi.advanceTimersByTimeAsync(10);
    expect(posts()).toHaveLength(0);
    zetUur('06:00');
    luisteraars['window:pagehide']();
    await vi.advanceTimersByTimeAsync(10);
    expect(posts().map((p) => p.uren)).toEqual([['06:00', '11:00']]);
    zetUur('06:30');
    zend('route:gewijzigd', {});
    await vi.advanceTimersByTimeAsync(10);
    expect(posts().map((p) => p.uren)).toEqual([['06:00', '11:00'], ['06:30', '11:00']]);
  });
});

describe('een 429 van de dienst (de daggrens)', () => {
  it('één strook, daarna geen verzoek en geen strook bij elke tik; de uren blijven op het toestel en gaan vanzelf mee na Retry-After', async () => {
    const luisteraars = nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    stops.push(startMeldingen());
    await vi.advanceTimersByTimeAsync(50);
    details = [];
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    fetchAntwoord = weiger(429, '3600');
    zetUur('10:00');
    await vi.advanceTimersByTimeAsync(WACHTTIJD_MS + 10);
    expect(posts()).toHaveLength(1);
    expect(gemeld).toHaveBeenCalledTimes(1);
    expect(gemeld.mock.calls[0][0]).toEqual({ tot: T + 50 + WACHTTIJD_MS + 3600 * 1000 });
    expect(doorgevenNaWacht()).toBe(T + 50 + WACHTTIJD_MS + 3600 * 1000);
    // Nog tien wijzigingen, online komen en weer zichtbaar worden: geen verzoek, geen nieuwe strook.
    for (let i = 0; i < 10; i++) {
      zetUur(`${String(12 + i).padStart(2, '0')}:30`);
      await vi.advanceTimersByTimeAsync(WACHTTIJD_MS + 10);
    }
    luisteraars['window:online']();
    luisteraars['document:visibilitychange']();
    await vi.advanceTimersByTimeAsync(10);
    expect(posts()).toHaveLength(1);
    expect(gemeld).toHaveBeenCalledTimes(1);
    // Na het uur geeft de app vanzelf de laatste uren door, één keer.
    fetchAntwoord = () => ({ ok: true, status: 204 });
    await vi.advanceTimersByTimeAsync(3600 * 1000);
    expect(posts()).toHaveLength(2);
    expect(posts()[1].uren).toEqual(['11:00', '21:30']);
    expect(doorgevenNaWacht()).toBe(0);
    await vi.advanceTimersByTimeAsync(3600 * 1000);
    luisteraars['window:online']();
    await vi.advanceTimersByTimeAsync(10);
    expect(posts()).toHaveLength(2);
    expect(gemeld).toHaveBeenCalledTimes(1);
    stop();
  });

  it('een 429 tot morgen: de herstart van de app vraagt de dienst niets vóór dat tijdstip (localStorage), en toont geen strook', async () => {
    const lokaal = new Map();
    vi.stubGlobal('localStorage', { getItem: (k) => lokaal.get(k) ?? null, setItem: (k, v) => lokaal.set(k, String(v)), removeItem: (k) => lokaal.delete(k) });
    nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    fetchAntwoord = weiger(429, String(15 * 3600));
    expect(await werkUrenBij()).toBe('mislukt');
    expect([...lokaal.values()]).toEqual([String(T + 15 * 3600 * 1000)]);
    expect([...lokaal.keys()][0]).toMatch(/^bloei-/);
    // De app wordt gesloten en opnieuw geopend, twee uur later.
    _zetTerugVoorTest();
    vi.setSystemTime(T + 2 * 3600 * 1000);
    details = [];
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    nepOmgeving();
    stops.push(startMeldingen());
    await vi.advanceTimersByTimeAsync(50);
    expect(posts()).toHaveLength(0);
    expect(gemeld).not.toHaveBeenCalled();
    // Om middernacht UTC (plus de marge) vanzelf, als de app dan open is.
    fetchAntwoord = () => ({ ok: true, status: 204 });
    await vi.advanceTimersByTimeAsync(13 * 3600 * 1000 + 2100);
    expect(posts()).toHaveLength(1);
    expect(lokaal.size).toBe(0);
    stop();
  });

  it('alles uitzetten tijdens het wachten meldt wel meteen af (DELETE telt niet mee in de grens)', async () => {
    nepOmgeving();
    fetchAntwoord = weiger(429, '3600');
    expect(await werkUrenBij()).toBe('mislukt');
    fetchAntwoord = () => ({ ok: true, status: 204 });
    opslag.set('meldingen.dagboek', { aan: false, uur: '20:00' });
    opslag.set('meldingen.drinken', [{ aan: false, uur: '11:00' }]);
    expect(await werkUrenBij()).toBe('uit');
    expect(details.map((d) => d.methode)).toEqual(['POST', 'DELETE']);
    expect(doorgevenNaWacht()).toBe(0);
  });

  it('een 429 zonder Retry-After wacht 15 minuten, een 503 zonder Retry-After een minuut', async () => {
    nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    fetchAntwoord = weiger(429);
    await werkUrenBij();
    expect(doorgevenNaWacht()).toBe(T + 15 * 60 * 1000);
    // Een nieuwe start met lege opslag.
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
    _zetTerugVoorTest();
    fetchAntwoord = weiger(503);
    await werkUrenBij();
    expect(doorgevenNaWacht()).toBe(T + 60 * 1000);
  });

  it('wachtUit leest seconden en een datum, en houdt het binnen een dag', () => {
    expect(wachtUit('120', T)).toBe(120000);
    expect(wachtUit(new Date(T + 90000).toUTCString(), T)).toBe(90000);
    expect(wachtUit('999999', T)).toBe(24 * 3600 * 1000 + 60 * 1000);
    for (const fout of [null, '', 'morgen', '0', '-5']) expect(wachtUit(fout, T)).toBeNull();
  });
});
