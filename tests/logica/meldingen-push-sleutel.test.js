// 18 november (BESLISSING 713, 714, 716): push.js stuurt de uren per minuut door (zonder afronding), elk dagboektijdstip uit de lijst,
// valt een keer terug op kwartieren als een oude dienst minuten weigert, en meldt zich vanzelf opnieuw aan als de dienst een nieuwe
// publieke sleutel kreeg. Alles met nepdiensten: er gaat geen verzoek naar buiten.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const opslag = new Map();
// 'AAAA' is de huidige publieke sleutel van de nepdienst: drie nulbytes.
vi.mock('../../src/meldingen/config.js', () => ({ PUSH_URL: 'https://dienst.test', VAPID_PUBLIEK: 'AAAA', pushBeschikbaar: () => true, pushToestand: () => 'beschikbaar' }));
vi.mock('../../src/data/instellingen.js', () => ({
  leesInstelling: async (sleutel) => structuredClone(opslag.get(sleutel) ?? null),
  zetInstelling: async (sleutel, waarde) => void opslag.set(sleutel, structuredClone(waarde)),
}));

const { werkUrenBij, startMeldingen, _zetTerugVoorTest, alleUren, sleutelStand, doorgevenNaWacht } = await import('../../src/meldingen/push.js');
const { luister } = await import('../../src/kern/bus.js');

const OUD = { endpoint: 'https://push.test/oud', keys: { p256dh: 'P1', auth: 'A1' } };
const NIEUW = { endpoint: 'https://push.test/nieuw', keys: { p256dh: 'P2', auth: 'A2' } };
const HUIDIGE_SLEUTEL = () => new Uint8Array([0, 0, 0]).buffer;
const OUDE_SLEUTEL = () => new Uint8Array([4, 1, 2]).buffer;

let verzoeken;
let fetchAntwoord;
let omgeving;
const stops = [];

// Een toestel met (of zonder) een bestaand abonnement. sleutel: wat options.applicationServerKey geeft (undefined: geen options).
function nepOmgeving({ metAbonnement = true, sleutel, abonneerFout = null } = {}) {
  const maakSub = (json, opties) => ({
    endpoint: json.endpoint,
    options: opties,
    toJSON: () => json,
    unsubscribe: vi.fn(async () => {
      if (omgeving.sub?.endpoint === json.endpoint) omgeving.sub = null;
      return true;
    }),
  });
  omgeving = {
    sub: metAbonnement ? maakSub(OUD, sleutel === undefined ? undefined : { userVisibleOnly: true, applicationServerKey: sleutel }) : null,
    subscribe: vi.fn(async (opties) => {
      if (abonneerFout) throw abonneerFout;
      omgeving.sub = maakSub(NIEUW, { userVisibleOnly: true, applicationServerKey: opties.applicationServerKey.buffer });
      return omgeving.sub;
    }),
  };
  omgeving.oud = omgeving.sub;
  const reg = { pushManager: { getSubscription: async () => omgeving.sub, subscribe: omgeving.subscribe } };
  const luisteraars = {};
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg), addEventListener: vi.fn() } });
  vi.stubGlobal('window', { addEventListener: (naam, fn) => (luisteraars['window:' + naam] = fn), location: { hash: '' } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (naam, fn) => (luisteraars['document:' + naam] = fn) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opties) => {
      const lichaam = JSON.parse(opties.body);
      verzoeken.push({ methode: opties.method, uren: lichaam.uren, endpoint: lichaam.abonnement?.endpoint ?? lichaam.endpoint });
      return fetchAntwoord(lichaam);
    }),
  );
  return luisteraars;
}

const ok = () => ({ ok: true, status: 204 });
// Een dienst van vóór 713: alleen kwartieren.
const oudeDienst = (lichaam) =>
  lichaam.uren && lichaam.uren.some((u) => Number(u.slice(3)) % 15 !== 0)
    ? { ok: false, status: 400, json: async () => ({ fout: 'ongeldig' }) }
    : ok();
const posts = () => verzoeken.filter((v) => v.methode === 'POST');
const wacht = () => new Promise((klaar) => setTimeout(klaar, 20));

beforeEach(() => {
  opslag.clear();
  opslag.set('meldingen.dagboek', { aan: true, uur: '18:07' });
  opslag.set('meldingen.drinken', [{ aan: true, uur: '11:00' }]);
  opslag.set('meldingen.supplementenUren', []);
  opslag.set('meldingen.abonnement', OUD);
  verzoeken = [];
  fetchAntwoord = ok;
  const leeg = new Map();
  vi.stubGlobal('localStorage', { getItem: (k) => leeg.get(k) ?? null, setItem: (k, v) => leeg.set(k, String(v)), removeItem: (k) => leeg.delete(k) });
  _zetTerugVoorTest();
});
afterEach(() => {
  while (stops.length) stops.pop()?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('uren per minuut en de lijst van dagboek (713, 714)', () => {
  it('stuurt de uren zoals ze gekozen zijn, zonder afronding', async () => {
    nepOmgeving();
    expect(await werkUrenBij()).toBe('ok');
    expect(posts()).toEqual([{ methode: 'POST', uren: ['11:00', '18:07'], endpoint: OUD.endpoint }]);
  });

  it('elk dagboektijdstip dat aan staat gaat mee; de oude vorm { aan, uur } ook', async () => {
    nepOmgeving();
    opslag.set('meldingen.dagboek', {
      aan: true,
      uur: '07:01',
      tijdstippen: [{ aan: true, uur: '07:01' }, { aan: false, uur: '12:00' }, { aan: true, uur: '21:59' }, { aan: true, uur: '23:59' }],
    });
    await werkUrenBij();
    // BESLISSING 736: hoogstens drie tijdstippen per soort; het vierde van een oude stand (23:59) gaat niet mee.
    expect(posts()[0].uren).toEqual(['07:01', '11:00', '21:59']);
    // De lijst uit (bovenaan aan: false), zoals zetKeuzesUit ze achterlaat: geen enkel dagboektijdstip.
    expect(alleUren({ dagboek: { aan: false, uur: '07:01', tijdstippen: [{ aan: true, uur: '07:01' }] }, drinken: [], supplementenUren: [] })).toEqual([]);
    expect(alleUren({ dagboek: { aan: true, uur: '19:44' } })).toEqual(['19:44']);
  });

  it('dubbels worden een, een ongeldig uur valt weg, en hoogstens drie per soort (BESLISSING 736)', () => {
    const tijdstippen = Array.from({ length: 10 }, (_, i) => ({ aan: true, uur: `${String(10 + i).padStart(2, '0')}:0${i % 10}` }));
    const keuzes = {
      dagboek: { aan: true, uur: '10:00', tijdstippen },
      drinken: [{ aan: true, uur: '10:00' }, { aan: true, uur: '08:30' }, { aan: true, uur: '24:00' }, { aan: true, uur: 'x' }],
      supplementenUren: [{ aan: true, uur: '07:05' }, { aan: true, uur: '22:22' }, { aan: true, uur: '23:00' }],
    };
    expect(alleUren(keuzes)).toEqual(['07:05', '08:30', '10:00', '11:01', '12:02', '22:22', '23:00']);
  });

  it('vier soorten met elk drie verschillende uren geven precies 12; een oude stand met vier blijft hoogstens 12 (BESLISSING 736)', () => {
    const lijst = (start) => [0, 1, 2, 3].map((i) => ({ aan: true, uur: `${String(start + i).padStart(2, '0')}:00` }));
    const keuzes = { dagboek: { aan: true, uur: '06:00', tijdstippen: lijst(6) }, eten: lijst(10).slice(0, 3), drinken: lijst(14), supplementenUren: lijst(19).slice(0, 3) };
    const uren = alleUren(keuzes);
    expect(uren).toHaveLength(12);
    expect(uren).not.toContain('09:00'); // het vierde van Dagboek
    expect(uren).not.toContain('17:00'); // het vierde van Drinken
    expect(uren).toContain('10:00'); // Eten gaat mee
  });
});

describe('overgang naar een dienst die minuten kent (713)', () => {
  it('400 ongeldig van een oude dienst: een keer opnieuw in kwartieren, daarna meteen in kwartieren', async () => {
    nepOmgeving();
    fetchAntwoord = oudeDienst;
    expect(await werkUrenBij()).toBe('ok');
    expect(posts().map((p) => p.uren)).toEqual([['11:00', '18:07'], ['11:00', '18:00']]);
    opslag.set('meldingen.dagboek', { aan: true, uur: '18:14' });
    expect(await werkUrenBij()).toBe('ok');
    expect(posts().map((p) => p.uren).slice(2)).toEqual([['11:00', '18:00']]);
  });

  it('een 400 op een lijst die al kwartieren is, of een andere fout, wordt niet herhaald', async () => {
    nepOmgeving();
    opslag.set('meldingen.dagboek', { aan: true, uur: '18:15' });
    fetchAntwoord = () => ({ ok: false, status: 400, json: async () => ({ fout: 'ongeldig' }) });
    expect(await werkUrenBij()).toBe('mislukt');
    expect(posts()).toHaveLength(1);
    opslag.set('meldingen.dagboek', { aan: true, uur: '18:07' });
    fetchAntwoord = () => ({ ok: false, status: 400, json: async () => ({ fout: 'te-groot' }) });
    expect(await werkUrenBij()).toBe('mislukt');
    expect(posts()).toHaveLength(2);
    // Weigert ook de dienst de kwartieren: een tweede verzoek en dan stoppen, en niets onthouden.
    fetchAntwoord = () => ({ ok: false, status: 400, json: async () => ({ fout: 'ongeldig' }) });
    expect(await werkUrenBij()).toBe('mislukt');
    expect(posts().map((p) => p.uren).slice(2)).toEqual([['11:00', '18:07'], ['11:00', '18:00']]);
    fetchAntwoord = ok;
    await werkUrenBij();
    expect(posts().at(-1).uren).toEqual(['11:00', '18:07']);
  });

  it('de wachttijden van 429 en 503 blijven werken, ook met minuten en ook in de terugval', async () => {
    const T = Date.parse('2026-11-18T09:00:00Z');
    nepOmgeving();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: T });
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    fetchAntwoord = () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '600' }) });
    expect(await werkUrenBij()).toBe('mislukt');
    expect(doorgevenNaWacht()).toBe(T + 600 * 1000);
    expect(gemeld).toHaveBeenCalledWith({ tot: T + 600 * 1000 });
    expect(await werkUrenBij()).toBe('uitgesteld');
    expect(posts()).toHaveLength(1);
    // Na de wachttijd: de oude dienst weigert minuten, en geeft op de kwartieren een 503 met Retry-After.
    vi.setSystemTime(T + 601 * 1000);
    _zetTerugVoorTest();
    let n = 0;
    fetchAntwoord = (l) => (n++ === 0 ? oudeDienst(l) : { ok: false, status: 503, headers: new Headers({ 'Retry-After': '60' }) });
    expect(await werkUrenBij()).toBe('mislukt');
    expect(posts().map((p) => p.uren).slice(1)).toEqual([['11:00', '18:07'], ['11:00', '18:00']]);
    expect(doorgevenNaWacht()).toBe(T + 661 * 1000);
    expect(gemeld.mock.calls.at(-1)[0]).toEqual({ tot: T + 661 * 1000 });
    stop();
  });
});

describe('een nieuwe sleutel van de dienst (716)', () => {
  it('sleutelStand: eerst de browser, dan de bewaarde sleutel, anders onbekend', () => {
    expect(sleutelStand({ options: { applicationServerKey: HUIDIGE_SLEUTEL() } }, null)).toBe('zelfde');
    expect(sleutelStand({ options: { applicationServerKey: OUDE_SLEUTEL() } }, { sleutel: 'AAAA' })).toBe('anders');
    expect(sleutelStand({ options: { applicationServerKey: null } }, { sleutel: 'BBBB' })).toBe('anders');
    expect(sleutelStand({}, { sleutel: 'AAAA' })).toBe('zelfde');
    expect(sleutelStand({}, OUD)).toBe('onbekend');
    expect(sleutelStand({ options: { applicationServerKey: null } }, null)).toBe('onbekend');
  });

  it('een andere sleutel bij de start van de app: afmelden, uitschrijven, opnieuw abonneren en de uren doorgeven, een keer', async () => {
    nepOmgeving({ sleutel: OUDE_SLEUTEL() });
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    stops.push(startMeldingen());
    await wacht();
    expect(verzoeken).toEqual([
      { methode: 'DELETE', uren: undefined, endpoint: OUD.endpoint },
      { methode: 'POST', uren: ['11:00', '18:07'], endpoint: NIEUW.endpoint },
    ]);
    expect(omgeving.oud.unsubscribe).toHaveBeenCalledTimes(1);
    expect(omgeving.subscribe).toHaveBeenCalledTimes(1);
    expect(opslag.get('meldingen.abonnement')).toEqual({ ...NIEUW, sleutel: 'AAAA' });
    // De keuzes van de gebruiker blijven staan.
    expect(opslag.get('meldingen.dagboek')).toEqual({ aan: true, uur: '18:07' });
    expect(gemeld).not.toHaveBeenCalled();
    // Een volgende wijziging: alleen de POST.
    await werkUrenBij();
    expect(verzoeken.slice(2)).toEqual([{ methode: 'POST', uren: ['11:00', '18:07'], endpoint: NIEUW.endpoint }]);
    expect(omgeving.subscribe).toHaveBeenCalledTimes(1);
    stop();
  });

  it('geen options in de browser, maar een bewaarde andere sleutel: ook vernieuwen', async () => {
    nepOmgeving();
    opslag.set('meldingen.abonnement', { ...OUD, sleutel: 'BBBB' });
    expect(await werkUrenBij()).toBe('ok');
    expect(verzoeken.map((v) => [v.methode, v.endpoint])).toEqual([['DELETE', OUD.endpoint], ['POST', NIEUW.endpoint]]);
  });

  it('dezelfde sleutel, of een onbekende (abonnement van voor deze wijziging zonder options): niets extra', async () => {
    nepOmgeving({ sleutel: HUIDIGE_SLEUTEL() });
    await werkUrenBij();
    expect(verzoeken.map((v) => v.methode)).toEqual(['POST']);
    expect(omgeving.subscribe).not.toHaveBeenCalled();
    _zetTerugVoorTest();
    verzoeken = [];
    nepOmgeving();
    await werkUrenBij();
    expect(verzoeken.map((v) => [v.methode, v.endpoint])).toEqual([['POST', OUD.endpoint]]);
    expect(omgeving.subscribe).not.toHaveBeenCalled();
  });

  it('mislukt het nieuwe abonnement, dan geen lus: een afmelding, en een nieuwe poging alleen bij een volgende aanleiding', async () => {
    const luisteraars = nepOmgeving({ sleutel: OUDE_SLEUTEL(), abonneerFout: new Error('AbortError') });
    const gemeld = vi.fn();
    const stop = luister('meldingen:mislukt', gemeld);
    stops.push(startMeldingen());
    await wacht();
    expect(verzoeken.map((v) => v.methode)).toEqual(['DELETE']);
    expect(omgeving.subscribe).toHaveBeenCalledTimes(1);
    expect(gemeld).toHaveBeenCalledTimes(1);
    // Niets vanzelf: geen timer, geen herhaling.
    await wacht();
    expect(omgeving.subscribe).toHaveBeenCalledTimes(1);
    // Weer online: een nieuwe poging in de browser, geen tweede afmelding; lukt het nu, dan gaan de uren mee.
    luisteraars['window:online']();
    await wacht();
    expect(omgeving.subscribe).toHaveBeenCalledTimes(2);
    expect(verzoeken.map((v) => v.methode)).toEqual(['DELETE']);
    omgeving.subscribe.mockImplementation(async () => {
      omgeving.sub = { endpoint: NIEUW.endpoint, options: { applicationServerKey: HUIDIGE_SLEUTEL() }, toJSON: () => NIEUW, unsubscribe: vi.fn() };
      return omgeving.sub;
    });
    luisteraars['document:visibilitychange']();
    await wacht();
    expect(verzoeken.map((v) => [v.methode, v.endpoint])).toEqual([['DELETE', OUD.endpoint], ['POST', NIEUW.endpoint]]);
    stop();
  });
});
