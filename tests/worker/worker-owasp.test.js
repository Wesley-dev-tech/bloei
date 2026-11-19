// OWASP-doorloop van 16 november (OW-01, OW-04): koppen op elk antwoord, opruimen van abonnementen die de pushdienst blijvend
// weigert, en een rem per IP-hash op nieuwe aanmeldingen. Nepversies van KV en fetch: er gaat geen enkel verzoek naar buiten.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import worker, {
  verwerk,
  verstuurHerinneringen,
  sleutelVan,
  REM_PER_UUR,
  NIEUW_PER_DAG,
  WIJZIGINGEN_PER_DAG,
  WEIGER_DREMPEL,
  WEIGER_MIN_MS,
  PROEF_UREN,
  INHAAL_MINUTEN,
  MAX_VERSTUURD_PER_DAG,
  wisGeheugen,
  GEHEUGEN,
} from '../../worker/src/index.js';
import { MAX_UREN } from '../../worker/src/valideer.js';
import { naarBase64Url } from '../../worker/src/vapid.js';

const ORIGIN = 'https://voorbeeld.github.io';
const SLEUTELS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const ep = (i) => `https://fcm.googleapis.com/fcm/send/toestel${i}`;
const IP = '203.0.113.7';

function testSleutels() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publiek = naarBase64Url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  return { prive: jwk.d, publiek };
}

// Telt schrijf-, wis-, lees- en lijstopdrachten apart (het gratis abonnement: elk 1000 per dag, lezen 100.000) en onthoudt de TTL.
// perSoort telt de schrijfopdrachten per voorvoegsel ('a:', 't:', 'k:', 'h:', 'r:', 'n:'); gelezen en geschreven onthouden de
// sleutels. list geeft de sleutels in de volgorde van hun naam, zoals KV.
// Twee opties bootsen echte KV na (standaard uit): vertraging (ms per opdracht, zodat gelijktijdige verzoeken door elkaar lopen) en
// eenPerSeconde (hoogstens één schrijfopdracht per seconde per sleutel; een tweede binnen de seconde faalt met 429, zoals KV, en
// telt dan niet als schrijfopdracht maar in tellers.geweigerd).
class NepKv {
  constructor({ vertraging = 0, eenPerSeconde = false, klok = () => Date.now() } = {}) {
    this.data = new Map();
    // Een dienst die al draait: k:lijst bestaat, ook na data.clear() (een aanmelding zonder k:lijst krijgt 503, zie
    // worker-herstel.test.js). Telt niet als lees- of schrijfopdracht.
    const leeg = this.data.clear.bind(this.data);
    this.data.clear = () => {
      leeg();
      this.data.set('k:lijst', { v: '[]', metadata: null, ttl: null });
    };
    this.data.clear();
    this.tellers = { put: 0, delete: 0, list: 0, get: 0, geweigerd: 0 };
    this.perSoort = {};
    this.gelezen = [];
    this.geschreven = [];
    this.laatsteSchrijf = new Map();
    this.klok = klok;
    this.eenPerSeconde = eenPerSeconde;
    if (vertraging > 0) {
      for (const m of ['get', 'put', 'getWithMetadata', 'delete', 'list']) {
        const echt = this[m].bind(this);
        this[m] = async (...a) => {
          await new Promise((verder) => setTimeout(verder, vertraging));
          return echt(...a);
        };
      }
    }
  }
  async put(k, v, opties = {}) {
    if (this.eenPerSeconde) {
      const nu = this.klok();
      if (this.laatsteSchrijf.has(k) && nu - this.laatsteSchrijf.get(k) < 1000) {
        this.tellers.geweigerd++;
        throw new Error('KV PUT failed: 429 Too Many Requests');
      }
      this.laatsteSchrijf.set(k, nu);
    }
    this.tellers.put++;
    this.perSoort[k.slice(0, 2)] = (this.perSoort[k.slice(0, 2)] ?? 0) + 1;
    this.geschreven.push(k);
    this.data.set(k, { v, metadata: opties.metadata ?? null, ttl: opties.expirationTtl ?? null });
  }
  async get(k, type) {
    this.tellers.get++;
    this.gelezen.push(k);
    const r = this.data.get(k);
    if (!r) return null;
    return type === 'json' ? JSON.parse(r.v) : r.v;
  }
  async getWithMetadata(k) {
    this.tellers.get++;
    this.gelezen.push(k);
    const r = this.data.get(k);
    return r ? { value: r.v, metadata: r.metadata } : { value: null, metadata: null };
  }
  async delete(k) {
    this.tellers.delete++;
    this.data.delete(k);
  }
  async list({ prefix = '' } = {}) {
    this.tellers.list++;
    const keys = [...this.data]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([name, r]) => ({ name, metadata: r.metadata }));
    return { keys, list_complete: true };
  }
  abonnementen() {
    return [...this.data.keys()].filter((k) => k.startsWith('a:'));
  }
}

let env;
let kv;
beforeEach(() => {
  kv = new NepKv();
  const s = testSleutels();
  env = { ABONNEMENTEN: kv, TOEGELATEN_ORIGIN: ORIGIN, VAPID_PRIVE: s.prive, VAPID_PUBLIEK: s.publiek, VAPID_ONDERWERP: 'https://voorbeeld.github.io' };
  // Een dienst die al draait: k:lijst bestaat (zonder telt niet als lees- of schrijfopdracht). De rem in het geheugen speelt in
  // deze tests niet mee (zie worker-herstel.test.js); elke test een verse isolate.
  kv.data.set('k:lijst', { v: '[]', metadata: null, ttl: null });
  wisGeheugen();
  Object.assign(GEHEUGEN, { perMinuut: Infinity, perUur: Infinity, volMs: 0 });
});
afterEach(() => vi.unstubAllGlobals());

const lichaam = (i, uren = ['20:00']) => ({ abonnement: { endpoint: ep(i), keys: SLEUTELS }, uren });
const verzoek = (methode, body, { origin = ORIGIN, ip = IP, pad = '/abonnement' } = {}) =>
  new Request('https://worker.example.invalid' + pad, {
    method: methode,
    headers: { ...(origin ? { Origin: origin } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}), 'Content-Type': 'application/json' },
    body: body === undefined || methode === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const UUR = 3600 * 1000;
const T0 = Date.parse('2026-11-16T09:00:00Z');

describe('OW-04: nosniff en no-store op elk antwoord', () => {
  it('elk soort antwoord heeft X-Content-Type-Options: nosniff en Cache-Control: no-store', async () => {
    const antwoorden = [
      await worker.fetch(verzoek('POST', lichaam(1)), env), // 204
      await worker.fetch(verzoek('OPTIONS'), env), // 204 CORS
      await worker.fetch(verzoek('DELETE', { endpoint: ep(1), auth: SLEUTELS.auth }), env), // 204
      await worker.fetch(verzoek('POST', '{kapot'), env), // 400
      await worker.fetch(verzoek('POST', lichaam(2), { origin: 'https://kwaad.example' }), env), // 403 zonder CORS
      await worker.fetch(verzoek('POST', lichaam(2), { pad: '/ander' }), env), // 404
      await worker.fetch(verzoek('GET'), env), // 405
      await worker.fetch(verzoek('POST', { x: 'y'.repeat(6000) }), env), // 413
    ];
    expect(antwoorden.map((r) => r.status)).toEqual([204, 204, 204, 400, 403, 404, 405, 413]);
    for (const r of antwoorden) {
      expect(r.headers.get('X-Content-Type-Options'), String(r.status)).toBe('nosniff');
      expect(r.headers.get('Cache-Control'), String(r.status)).toBe('no-store');
    }
    // Ook de kale 503 bij een fout van de opslag.
    kv.get = async () => {
      throw new Error('KV kapot');
    };
    const r503 = await worker.fetch(verzoek('POST', lichaam(3)), env);
    expect(r503.status).toBe(503);
    expect(r503.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r503.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('OW-01a: abonnementen die de pushdienst blijvend weigert', () => {
  // Een adres met "/echt" is een echt toestel op dezelfde pushdienst (fcm) en krijgt altijd 201: zo toont de dienst dat hij onze
  // signalen aanvaardt (voorwaarde 3 en 4). Al de rest krijgt `status`.
  const signaal = (status) => vi.stubGlobal('fetch', async (url) => new Response(null, { status: String(url).includes('/echt') ? 201 : status }));
  const echt = (i) => `https://fcm.googleapis.com/fcm/send/echt${i}`;
  const metEcht = (i = 0) => verwerk(verzoek('POST', { abonnement: { endpoint: echt(i), keys: SLEUTELS }, uren: ['20:00'] }, { ip: `192.0.2.${100 + i}` }), env);
  const bestaat = async (endpoint) => kv.data.has(await sleutelVan(endpoint));
  // 20:00 in Brussel (wintertijd) op opeenvolgende dagen
  const avond = (dag) => new Date(Date.parse('2026-11-16T19:00:00Z') + dag * 24 * UUR);

  it('400, 401 en 403 wissen niet meteen (kan ook een fout in onze VAPID-instelling zijn)', async () => {
    for (const status of [400, 401, 403]) {
      kv.data.clear();
      await verwerk(verzoek('POST', lichaam(1)), env);
      signaal(status);
      await verstuurHerinneringen(env, avond(0));
      expect(kv.abonnementen(), String(status)).toHaveLength(1);
    }
  });

  it('na WEIGER_DREMPEL opeenvolgende weigeringen over minstens WEIGER_MIN_MS wordt een vals adres naast een werkend echt toestel gewist', async () => {
    // BESLISSING 713: drie uren op drie minuten na elkaar (dezelfde minuut drie keer lopen geeft maar één signaal).
    await verwerk(verzoek('POST', lichaam(1, ['20:00', '20:01', '20:02'])), env);
    await metEcht();
    signaal(403);
    let dag = 0;
    // Genoeg weigeringen, maar nog te kort na de eerste: blijft staan.
    for (let i = 0; i < WEIGER_DREMPEL; i++) await verstuurHerinneringen(env, new Date(avond(0).getTime() + i * 60000));
    expect(kv.abonnementen()).toHaveLength(2);
    // Pas als de reeks lang genoeg loopt, gaat het weg; het echte toestel blijft.
    while ((await bestaat(ep(1))) && dag < 10) await verstuurHerinneringen(env, avond(++dag));
    expect(await bestaat(ep(1))).toBe(false);
    expect(await bestaat(echt(0))).toBe(true);
    expect(dag * 24 * UUR).toBeGreaterThanOrEqual(WEIGER_MIN_MS);
    // De lijst (het aantal) is meteen rechtgezet: het wissen viel in de run van een kwartier (BESLISSING 713: k:lijst).
    expect(JSON.parse(await kv.get('k:lijst'))).toHaveLength(1);
  });

  it('een geslaagd signaal tussendoor zet de teller terug op nul', async () => {
    await verwerk(verzoek('POST', lichaam(1)), env);
    for (let dag = 0; dag < 10; dag++) {
      signaal(dag % 2 ? 201 : 400);
      await verstuurHerinneringen(env, avond(dag));
    }
    expect(kv.abonnementen()).toHaveLength(1);
    expect(kv.data.get(kv.abonnementen()[0]).metadata.f ?? 0).toBeLessThanOrEqual(1);
  });

  it('tijdelijke fouten (429, 500, netwerk) tellen niet mee en wissen nooit', async () => {
    await verwerk(verzoek('POST', lichaam(1)), env);
    for (let dag = 0; dag < 10; dag++) {
      signaal([429, 500, 503][dag % 3]);
      await verstuurHerinneringen(env, avond(dag));
    }
    expect(kv.abonnementen()).toHaveLength(1);
  });

  it('met een werkende dienst gaat er per run hoogstens een kwart van de abonnementen weg', async () => {
    for (let i = 0; i < 8; i++) await verwerk(verzoek('POST', lichaam(i), { ip: `198.51.100.${i}` }), { ...env });
    await metEcht();
    expect(kv.abonnementen()).toHaveLength(9);
    signaal(403);
    for (let dag = 0; dag < 3; dag++) await verstuurHerinneringen(env, avond(dag));
    const voor = kv.abonnementen().length;
    await verstuurHerinneringen(env, avond(3));
    const na = kv.abonnementen().length;
    expect(voor - na).toBeGreaterThan(0);
    expect(voor - na).toBeLessThanOrEqual(Math.max(1, Math.floor(voor / 4)));
    expect(await bestaat(echt(0))).toBe(true);
  });

  it('een aanvaller kan de teller van zijn nepabonnement niet terugzetten door het bij te werken', async () => {
    await verwerk(verzoek('POST', lichaam(1)), env);
    await metEcht();
    signaal(403);
    for (let dag = 0; dag < 5 && (await bestaat(ep(1))); dag++) {
      await verstuurHerinneringen(env, avond(dag));
      // Na elke weigering de uren wijzigen (met het juiste geheim): telt niet als nieuw begin.
      if (await bestaat(ep(1))) await verwerk(verzoek('POST', lichaam(1, dag % 2 ? ['20:00'] : ['20:00', '21:00'])), env);
    }
    expect(await bestaat(ep(1))).toBe(false);
    expect(await bestaat(echt(0))).toBe(true);
  });

  it('404 en 410 wissen nog altijd meteen', async () => {
    for (const status of [404, 410]) {
      kv.data.clear();
      await verwerk(verzoek('POST', lichaam(1)), env);
      signaal(status);
      await verstuurHerinneringen(env, avond(0));
      expect(kv.abonnementen()).toHaveLength(0);
    }
  });

  it('weigeringen bijhouden kost hoogstens een paar schrijfopdrachten per abonnement', async () => {
    for (let i = 0; i < 10; i++) await verwerk(verzoek('POST', lichaam(i, ['20:00', '20:15', '20:30', '20:45']), { ip: `198.51.100.${i}` }), env);
    signaal(403);
    const voor = kv.tellers.put;
    for (let dag = 0; dag < 3; dag++) for (let k = 0; k < 4; k++) await verstuurHerinneringen(env, new Date(avond(dag).getTime() + k * 15 * 60 * 1000));
    // Per abonnement hoogstens WEIGER_DREMPEL schrijfopdrachten voor de teller (plus hoogstens een paar voor de telling).
    expect(kv.tellers.put - voor).toBeLessThanOrEqual(10 * WEIGER_DREMPEL + 12);
  });
});

describe('OW-01b: rem per IP-hash op nieuwe aanmeldingen', () => {
  it('hoogstens REM_PER_UUR nieuwe aanmeldingen per uur per IP; een ander IP kan nog', async () => {
    for (let i = 0; i < REM_PER_UUR; i++) expect((await verwerk(verzoek('POST', lichaam(i)), env, T0)).status).toBe(204);
    const te = await verwerk(verzoek('POST', lichaam(99)), env, T0 + 1000);
    expect(te.status).toBe(429);
    expect(await te.json()).toEqual({ fout: 'later' });
    // De rem telt per heel uur: T0 is 09:00:00 UTC, dus vrij om 10:00:00, 3599 seconden na T0 + 1 s. De app mag die kop lezen.
    expect(te.headers.get('Retry-After')).toBe('3599');
    expect(te.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(kv.abonnementen()).toHaveLength(REM_PER_UUR);
    expect((await verwerk(verzoek('POST', lichaam(98), { ip: '198.51.100.1' }), env, T0 + 1000)).status).toBe(204);
    // Een uur later mag het eerste IP weer.
    expect((await verwerk(verzoek('POST', lichaam(99)), env, T0 + UUR + 1000)).status).toBe(204);
  });

  it('een bestaand toestel bijwerken en afmelden valt niet onder de rem', async () => {
    for (let i = 0; i < REM_PER_UUR; i++) await verwerk(verzoek('POST', lichaam(i)), env, T0);
    expect((await verwerk(verzoek('POST', lichaam(0, ['07:00'])), env, T0)).status).toBe(204);
    expect((await verwerk(verzoek('DELETE', { endpoint: ep(1), auth: SLEUTELS.auth }), env, T0)).status).toBe(204);
  });

  it('bewaart nooit een IP-adres, alleen een sleutel-hash met een TTL', async () => {
    await verwerk(verzoek('POST', lichaam(1)), env, T0);
    const alles = JSON.stringify([...kv.data]);
    expect(alles).not.toContain(IP);
    expect(alles).not.toContain('203.0.113');
    const rem = [...kv.data].filter(([k]) => k.startsWith('r:'));
    expect(rem).toHaveLength(1);
    expect(rem[0][0]).toMatch(/^r:[0-9a-f]{32}$/);
    expect(rem[0][1].ttl).toBeGreaterThanOrEqual(3600);
    expect(rem[0][1].ttl).toBeLessThanOrEqual(2 * 3600);
    // Een gewone SHA-256 van het IP (raadbaar: er zijn maar 2^32 IPv4-adressen) staat er niet in.
    const { createHash } = await import('node:crypto');
    expect(alles).not.toContain(createHash('sha256').update(IP).digest('hex').slice(0, 32));
  });

  it('afgewezen verzoeken (rem, vol, dagquotum) schrijven niets', async () => {
    for (let i = 0; i < REM_PER_UUR; i++) await verwerk(verzoek('POST', lichaam(i)), env, T0);
    const voor = kv.tellers.put;
    for (let i = 0; i < 200; i++) expect((await verwerk(verzoek('POST', lichaam(100 + i)), env, T0)).status).toBe(429);
    expect(kv.tellers.put).toBe(voor);
  });

  it('een hele UTC-dag misbruik, met 10 bestaande abonnementen en het signaal elke minuut, blijft binnen de rekensom (942 van 1000)', async () => {
    const dag0 = Date.parse('2026-11-16T00:00:00Z');
    // BESLISSING 713: per minuut. Elk abonnement krijgt zijn eigen minuut (m), zodat de signalen op zoveel mogelijk verschillende
    // minuten vallen (het ergste geval voor v:verstuurd). De wijzigingen schuiven ze telkens een kwartier op.
    const hhmm = (u, m) => `${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const uren = (start, m = 0) => Array.from({ length: MAX_UREN }, (_, i) => hhmm(start + 2 * i, m));
    const andere = (start, m = 0) => uren(start, (m + 15) % 60);
    // Echte toestellen (2xx) op alle vier de pushdiensten, samen elk uur van de dag; valse (403) ertussen.
    const diensten = ['https://fcm.googleapis.com/fcm/send/', 'https://web.push.apple.com/', 'https://updates.push.services.mozilla.com/wpush/v2/', 'https://wns2-par02p.notify.windows.com/w/?token='];
    const bestaand = diensten.flatMap((d, i) => [[d + `echt${i}a`, 0, 2 * i], [d + `echt${i}b`, 1, 2 * i + 1]]);
    bestaand.push([ep(900), 0, 8], [ep(901), 1, 9]);
    vi.stubGlobal('fetch', async (url) => new Response(null, { status: String(url).includes('echt') ? 201 : 403 }));
    let ipNr = 0;
    const ip = () => `198.51.${ipNr >> 8}.${ipNr++ & 255}`;
    const post = (endpoint, u, nu) => verwerk(verzoek('POST', { abonnement: { endpoint, keys: SLEUTELS }, uren: u }, { ip: ip() }), env, nu);
    const wijzig8 = async (endpoint, start, m, nu) => {
      // WIJZIGINGEN_PER_DAG echte wijzigingen (de naam komt van de oude grens van 8); de laatste zet de oorspronkelijke uren terug,
      // zodat het signaal ze de rest van de dag blijft raken.
      // Elke stap verschilt van de vorige (andere, derde, andere, ...), ook bij een oneven grens.
      const derde = (s) => uren(s, (m + 30) % 60);
      for (let w = 0; w < WIJZIGINGEN_PER_DAG; w++) {
        const u = w === WIJZIGINGEN_PER_DAG - 1 ? uren(start, m) : w % 2 ? derde(start) : andere(start, m);
        expect((await post(endpoint, u, nu)).status).toBe(204);
      }
    };
    const afmelden = async (endpoint, nu) => verwerk(verzoek('DELETE', { endpoint, auth: SLEUTELS.auth }, { ip: ip() }), env, nu);
    // De dag ervoor aangemeld, zonder signaal: alle vlaggen en reeksen beginnen vandaag (het ergste geval).
    for (const [e, start, m] of bestaand) expect((await post(e, uren(start, m), dag0 - 72 * UUR)).status).toBe(204);
    kv.tellers = { put: 0, delete: 0, list: 0, get: 0 };
    kv.perSoort = {};
    const nieuw = (i) => (i % 2 ? ep(1000 + i) : diensten[i % 4] + `echtnieuw${i}`);
    let aangemeld = 0;
    for (let minuut = 0; minuut < 1440; minuut++) {
      const nu = dag0 + minuut * 60 * 1000;
      await verstuurHerinneringen(env, new Date(nu));
      if (minuut % 15 !== 0) continue;
      const q = minuut / 15;
      if (q >= 4 && q < 4 + NIEUW_PER_DAG) {
        const i = q - 4;
        // Eerst een plaats vrijmaken (een bestaand abonnement, daarna een nieuw), dan een nieuw abonnement erbij.
        if (i < 10) {
          await wijzig8(bestaand[i][0], bestaand[i][1], bestaand[i][2], nu + 1);
          await afmelden(bestaand[i][0], nu + 2);
        } else await afmelden(nieuw(i - 10), nu + 2);
        if ((await post(nieuw(i), uren(i % 2, 10 + i), nu + 3)).status === 204) aangemeld++;
        await wijzig8(nieuw(i), i % 2, 10 + i, nu + 4);
      }
      // Het dagquotum is op: nog een aanmelding en een poging met een vreemd geheim worden geweigerd.
      if (q === 30) {
        expect((await post(ep(5000), uren(0), nu + 5)).status).toBe(429);
        const vreemd = { abonnement: { endpoint: nieuw(19), keys: { p256dh: SLEUTELS.p256dh, auth: 'z'.repeat(22) } }, uren: uren(0) };
        expect((await verwerk(verzoek('POST', vreemd, { ip: ip() }), env, nu + 5)).status).toBe(429);
      }
      // Op het einde van de dag de overige nieuwe afmelden.
      if (q >= 80 && q < 90) await afmelden(nieuw(q - 80 + 10), nu + 6);
    }
    expect(aangemeld).toBe(NIEUW_PER_DAG);
    expect(kv.abonnementen()).toHaveLength(0);
    const S = 10 + NIEUW_PER_DAG; // verschillende abonnementen op één dag
    const s = (k) => kv.perSoort[k] ?? 0;
    // Per soort de grens uit de rekensom in worker/src/index.js.
    expect(s('r:') + s('n:')).toBeLessThanOrEqual(2 * NIEUW_PER_DAG);
    // k:lijst: een per nieuwe aanmelding, een per afmelding, hoogstens een per kwartier (gelijkzetting). t:aantal en k:nieuw niet meer.
    expect(s('k:')).toBeLessThanOrEqual(NIEUW_PER_DAG + S + 96);
    expect(s('t:')).toBe(0);
    expect(s('a:')).toBeLessThanOrEqual(NIEUW_PER_DAG + S * WIJZIGINGEN_PER_DAG + S * (WEIGER_DREMPEL + 1) + S);
    expect(s('h:')).toBeLessThanOrEqual(4 * 24);
    expect(s('h:')).toBeGreaterThan(0);
    // v:verstuurd: de signalen vallen hier op honderden verschillende minuten; de grens per dag houdt het op MAX_VERSTUURD_PER_DAG.
    expect(s('v:')).toBe(MAX_VERSTUURD_PER_DAG);
    const grens = 4 * NIEUW_PER_DAG + S * WIJZIGINGEN_PER_DAG + S + 96 + S * (WEIGER_DREMPEL + 1) + S + 4 * 24 + MAX_VERSTUURD_PER_DAG;
    // 492 + 30 x WIJZIGINGEN_PER_DAG (BESLISSING 713; daarvoor 512 + 30 x ... = 962). Blijft onder 1000 met 58 marge, die de
    // benaderde teller van v:verstuurd opvangt (in het ergste geval 2 x 40, zie worker/src/index.js).
    expect(grens).toBe(942);
    expect(grens + MAX_VERSTUURD_PER_DAG).toBeLessThan(1000);
    expect(kv.tellers.put).toBeLessThanOrEqual(grens);
    expect(kv.tellers.delete).toBeLessThanOrEqual(S);
    // 96 gelijkzettingen; een verzoek doet er geen (k:lijst bestond al).
    expect(kv.tellers.list).toBe(96);
    // Leesopdrachten: ruim onder 100.000 (2 + N per run, plus de verzoeken).
    expect(kv.tellers.get).toBeLessThan(40000);
  });

  it('BESLISSING 713: een rustige dag (twee toestellen, elk 8 herinneringen per minuut, elke minuut een run) kost bijna niets', async () => {
    const dag0 = Date.parse('2026-11-16T00:00:00Z');
    const toestellen = ['https://web.push.apple.com/iphone', 'https://web.push.apple.com/ipad'];
    // 8 herinneringen per toestel (dagboek 1, drinken 4, supplementen 3), allemaal op een andere minuut.
    const uren = (k) => ['07:05', '08:12', '10:33', '12:47', '15:01', '17:29', '19:58', '21:14'].map((u) => u.slice(0, 3) + String((Number(u.slice(3)) + k) % 60).padStart(2, '0'));
    for (const [k, e] of toestellen.entries()) {
      expect((await verwerk(verzoek('POST', { abonnement: { endpoint: e, keys: SLEUTELS }, uren: uren(k) }, { ip: `192.0.2.${k}` }), env, dag0 - 72 * UUR)).status).toBe(204);
    }
    let signalen = 0;
    vi.stubGlobal('fetch', async () => (signalen++, new Response(null, { status: 201 })));
    // De dag ervoor al een signaal gekregen (g = 1): een gewone dag.
    await verstuurHerinneringen(env, new Date(Date.parse('2026-11-15T06:05:00Z')));
    await verstuurHerinneringen(env, new Date(Date.parse('2026-11-15T06:06:00Z')));
    signalen = 0;
    kv.tellers = { put: 0, delete: 0, list: 0, get: 0 };
    kv.perSoort = {};
    for (let minuut = 0; minuut < 1440; minuut++) await verstuurHerinneringen(env, new Date(dag0 + minuut * 60000));
    expect(signalen).toBe(16);
    // Schrijven: alleen v:verstuurd (een keer per minuut met een signaal) en het uur van de dienst (hoogstens een keer per uur).
    expect(kv.perSoort['v:']).toBe(16);
    expect(kv.perSoort['h:']).toBeLessThanOrEqual(16);
    // Plus één keer k:lijst bij de eerste gelijkzetting: de twee toestellen kregen gisteren hun eerste melding, hun uur van
    // aanmelding valt uit de lijst. Daarna verandert ze niet meer en wordt ze niet meer geschreven.
    expect(kv.perSoort['k:']).toBe(1);
    expect(kv.tellers.put).toBe(kv.perSoort['v:'] + kv.perSoort['h:'] + 1);
    expect(kv.tellers.delete).toBe(0);
    expect(kv.tellers.list).toBe(96);
    // Lezen: k:lijst, v:verstuurd en de 2 abonnementen per run (4 x 1440), k:lijst nog eens bij elke gelijkzetting (96) en het uur
    // van de dienst bij een signaal (hoogstens 16).
    expect(kv.tellers.get).toBeGreaterThanOrEqual(1440 * 4);
    expect(kv.tellers.get).toBeLessThanOrEqual(1440 * 4 + 96 + 16);
  });

  it('een abonnement wijzigt hoogstens WIJZIGINGEN_PER_DAG keer per dag; de volgende dag weer', async () => {
    await verwerk(verzoek('POST', lichaam(1)), env, T0);
    for (let w = 0; w < WIJZIGINGEN_PER_DAG; w++) expect((await verwerk(verzoek('POST', lichaam(1, [w % 2 ? '08:00' : '09:00'])), env, T0)).status).toBe(204);
    const voor = kv.tellers.put;
    const r = await verwerk(verzoek('POST', lichaam(1, ['10:00'])), env, T0);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ fout: 'later' });
    // Retry-After: tot middernacht UTC. T0 is 09:00 UTC, dus 15 uur.
    expect(r.headers.get('Retry-After')).toBe(String(15 * 3600));
    expect(r.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(kv.tellers.put).toBe(voor);
    // Dezelfde aanmelding nog eens sturen (zoals de app bij elke start doet) blijft 204 zonder te schrijven.
    const huidig = JSON.parse(await kv.get(await sleutelVan(ep(1)))).uren;
    expect((await verwerk(verzoek('POST', lichaam(1, huidig)), env, T0)).status).toBe(204);
    expect((await verwerk(verzoek('POST', lichaam(1, ['10:00'])), env, T0 + 24 * UUR)).status).toBe(204);
  });

  it('de grens is 15 wijzigingen per dag (18 november: 8 was te weinig om de herinneringen voor het eerst in te stellen)', () => {
    expect(WIJZIGINGEN_PER_DAG).toBe(15);
  });

  it('een abonnement dat vandaag al aan de oude grens van 8 zat, mag na de uitrol meteen weer wijzigen, tot 15', async () => {
    await verwerk(verzoek('POST', lichaam(1)), env, T0 - 72 * UUR);
    // De stand zoals de oude dienst ze achterliet: d = vandaag, w = 8, en de vlag g van een echt toestel.
    const sleutel = await sleutelVan(ep(1));
    const r0 = kv.data.get(sleutel);
    r0.metadata = { ...r0.metadata, d: '2026-11-16', w: 8, g: 1 };
    for (let w = 8; w < WIJZIGINGEN_PER_DAG; w++) {
      expect((await verwerk(verzoek('POST', lichaam(1, [w % 2 ? '08:00' : '09:00'])), env, T0)).status).toBe(204);
      expect(kv.data.get(sleutel).metadata).toMatchObject({ d: '2026-11-16', w: w + 1, g: 1 });
    }
    expect((await verwerk(verzoek('POST', lichaam(1, ['10:00'])), env, T0)).status).toBe(429);
  });

  it('Retry-After klopt ook vlak voor middernacht UTC (minstens 1 seconde)', async () => {
    const laat = Date.parse('2026-11-16T23:59:59.500Z');
    await verwerk(verzoek('POST', lichaam(1)), env, laat - 72 * UUR);
    for (let w = 0; w < WIJZIGINGEN_PER_DAG; w++) await verwerk(verzoek('POST', lichaam(1, [w % 2 ? '08:00' : '09:00'])), env, laat);
    const r = await verwerk(verzoek('POST', lichaam(1, ['10:00'])), env, laat);
    expect([r.status, r.headers.get('Retry-After')]).toEqual([429, '1']);
    // Een seconde later is het een nieuwe UTC-dag: de wijziging gaat door.
    expect((await verwerk(verzoek('POST', lichaam(1, ['10:00'])), env, laat + 1000)).status).toBe(204);
  });

  it('het dagquotum van nieuwe aanmeldingen geeft Retry-After tot middernacht UTC, ook als de rem van het IP ook op is', async () => {
    const ruim = { ...env, MAX_ABONNEMENTEN: '100' };
    let ipNr = 0;
    for (let i = 0; i < NIEUW_PER_DAG; i++) {
      const r = await verwerk(verzoek('POST', lichaam(200 + i), { ip: `198.51.100.${ipNr++}` }), ruim, T0 + i * 2000);
      expect(r.status).toBe(204);
    }
    const r = await verwerk(verzoek('POST', lichaam(300), { ip: '198.51.100.1' }), ruim, T0 + 60 * 1000);
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe(String(15 * 3600 - 60));
  });
});

// BESLISSING 713: de lijst k:lijst ([[sleutel, a], ...]) vervangt de telling t:aantal en de lijst k:nieuw. Het aantal is haar
// lengte; de kandidaten van BESLISSING 630 zijn de rijen met een a, de oudste eerst (wat vroeger in k:nieuw stond).
const leesKLijst = async () => JSON.parse(await kv.get('k:lijst'));
const nooitGeslaagdInLijst = async () =>
  (await leesKLijst())
    .filter(([, a]) => Number.isInteger(a))
    .sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));

// BESLISSING 630: zijn de plaatsen vol, dan maakt een nieuwe aanmelding plaats door het oudste abonnement te wissen dat ouder is dan
// PROEF_UREN en nog nooit een geslaagde melding (2xx) kreeg. Een abonnement dat ooit 2xx kreeg, of dat van voor deze regel is, nooit.
describe('BESLISSING 630: valse aanmeldingen houden geen plaats bezet', () => {
  // Echte toestellen hebben "echt" in hun adres en krijgen 201; al de rest (valse adressen) krijgt 403.
  const echt = (i) => `https://fcm.googleapis.com/fcm/send/echt${i}`;
  const metAdres = (endpoint, uren = ['20:00']) => ({ abonnement: { endpoint, keys: SLEUTELS }, uren });
  let ipNr = 0;
  const aanmelden = (body, nu, e = env, ip = `198.51.100.${ipNr++ % 250}`) => verwerk(verzoek('POST', body, { ip }), e, nu);
  const pushdienst = () => vi.stubGlobal('fetch', async (url) => new Response(null, { status: String(url).includes('/echt') ? 201 : 403 }));
  const meta = async (endpoint) => kv.data.get(await sleutelVan(endpoint))?.metadata;
  const bestaat = async (endpoint) => kv.data.has(await sleutelVan(endpoint));
  // 20:00 in Brussel (wintertijd) op 16 november 2026, en zoveel dagen later
  const avond = (dag) => new Date(Date.parse('2026-11-16T19:00:00Z') + dag * 24 * UUR);

  it('vol met valse aanmeldingen ouder dan PROEF_UREN: een nieuw toestel komt erin, de oudste valse is weg, zonder lijstopvraging', async () => {
    // Eén echt toestel op dezelfde pushdienst (om 21:00) toont dat de dienst onze signalen aanvaardt; negen valse (om 20:00).
    expect((await aanmelden(metAdres(echt(0), ['21:00']), T0)).status).toBe(204);
    for (let i = 1; i < 10; i++) expect((await aanmelden(lichaam(i), T0 + i * UUR)).status).toBe(204);
    pushdienst();
    await verstuurHerinneringen(env, avond(0)); // de valse: 403
    await verstuurHerinneringen(env, new Date(avond(0).getTime() + UUR)); // het echte: 201, een uur later
    const T1 = T0 + UUR; // de oudste valse
    // Een dag later zijn ze nog te jong: 429 zoals altijd, niemand weg.
    expect((await aanmelden(metAdres(echt(1)), T1 + 24 * UUR)).status).toBe(429);
    expect(kv.abonnementen()).toHaveLength(10);
    // Net niet oud genoeg (verschil van PROEF_UREN hele uren): nog altijd 429.
    expect((await aanmelden(metAdres(echt(1)), T1 + PROEF_UREN * UUR + 1000)).status).toBe(429);
    // Een uur later is de eerste (alleen die) oud genoeg.
    const lijstVoor = kv.tellers.list;
    const r = await aanmelden(metAdres(echt(1)), T1 + (PROEF_UREN + 1) * UUR + 1000);
    expect(r.status).toBe(204);
    expect(kv.tellers.list).toBe(lijstVoor);
    expect(await bestaat(ep(1))).toBe(false);
    for (let i = 2; i < 10; i++) expect(await bestaat(ep(i)), String(i)).toBe(true);
    expect(await bestaat(echt(0))).toBe(true);
    expect(await bestaat(echt(1))).toBe(true);
    expect(kv.abonnementen()).toHaveLength(10);
    // Het volgende kwartier telt er nog altijd 10, en de nieuwe staat als kandidaat in k:lijst (de gewiste niet meer).
    await verstuurHerinneringen(env, new Date(T1 + (PROEF_UREN + 2) * UUR));
    expect(await leesKLijst()).toHaveLength(10);
    const lijst = (await nooitGeslaagdInLijst()).map(([naam]) => naam);
    expect(lijst).not.toContain(await sleutelVan(ep(1)));
    expect(lijst).toContain(await sleutelVan(echt(1)));
  });

  it('vol met echte toestellen: 429; de vlag "geslaagd" wordt hoogstens een keer geschreven en het uur van aanmelding valt dan weg', async () => {
    for (let i = 0; i < 10; i++) await aanmelden(metAdres(echt(i)), T0);
    expect(Number.isInteger((await meta(echt(0))).a)).toBe(true);
    pushdienst();
    await verstuurHerinneringen(env, avond(0));
    for (let i = 0; i < 10; i++) {
      const m = await meta(echt(i));
      expect(m.g, String(i)).toBe(1);
      expect(m.a, String(i)).toBeUndefined();
    }
    // Volgende geslaagde meldingen schrijven niets meer op de abonnementen (alleen het uur van de dienst, een keer per uur, en
    // v:verstuurd van de inhaalregel, een keer per run met een signaal: BESLISSING 713).
    const voor = kv.geschreven.length;
    for (let dag = 1; dag < 5; dag++) await verstuurHerinneringen(env, avond(dag));
    expect(kv.geschreven.slice(voor).filter((k) => !k.startsWith('h:') && !k.startsWith('v:'))).toEqual([]);
    expect(kv.geschreven.slice(voor).filter((k) => k.startsWith('v:'))).toHaveLength(4);
    expect(kv.geschreven.slice(voor).filter((k) => k.startsWith('h:'))).toHaveLength(4);
    // Ook veel later maakt geen enkel echt toestel plaats.
    expect((await aanmelden(lichaam(50), T0 + 30 * 24 * UUR)).status).toBe(429);
    expect(kv.abonnementen()).toHaveLength(10);
    // Uren wijzigen haalt de vlag niet weg.
    expect((await verwerk(verzoek('POST', metAdres(echt(0), ['07:00'])), env, T0 + 30 * 24 * UUR)).status).toBe(204);
    expect((await meta(echt(0))).g).toBe(1);
  });

  it('een jong abonnement blijft: aangemeld om 21:00 met een herinnering om 20:00, de eerste kans komt pas 23 uur later', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    const aangemeld = Date.parse('2026-11-16T20:00:00Z'); // 21:00 in Brussel
    await aanmelden(metAdres(echt(1)), aangemeld, klein);
    await aanmelden(lichaam(2), aangemeld + 60 * 1000, klein);
    pushdienst();
    // 20:00 in Brussel de dag erna: de eerste kans voor het echte toestel.
    await verstuurHerinneringen(klein, new Date(aangemeld + 23 * UUR));
    expect((await meta(echt(1))).g).toBe(1);
    // Een half uur na die 24 uur is ook het valse nog te jong.
    expect((await aanmelden(metAdres(echt(3)), aangemeld + 24 * UUR + 30 * 60 * 1000, klein)).status).toBe(429);
    expect(await bestaat(ep(2))).toBe(true);
    // De weigering van het valse viel in hetzelfde uur als de geslaagde melding van het echte: dat telt nog niet als bewijs dat
    // de dienst ons aanvaardt. De dag erna wel.
    await verstuurHerinneringen(klein, new Date(aangemeld + 47 * UUR));
    // Later wel: het valse gaat weg, het echte blijft.
    expect((await aanmelden(metAdres(echt(3)), aangemeld + (PROEF_UREN + 1) * UUR, klein)).status).toBe(204);
    expect(await bestaat(ep(2))).toBe(false);
    expect(await bestaat(echt(1))).toBe(true);
    expect(await bestaat(echt(3))).toBe(true);
  });

  it('waarom ruimer dan 24 uur: mislukt de eerste kans tijdelijk (503), dan blijft een echt toestel nog een dag staan', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '1' };
    const aangemeld = Date.parse('2026-11-16T20:00:00Z'); // 21:00 in Brussel, herinnering om 20:00
    await aanmelden(metAdres(echt(1)), aangemeld, klein);
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));
    await verstuurHerinneringen(klein, new Date(aangemeld + 23 * UUR));
    expect((await aanmelden(metAdres(echt(2)), aangemeld + 26 * UUR, klein)).status).toBe(429);
    expect(await bestaat(echt(1))).toBe(true);
    // De tweede kans lukt: vanaf dan nooit meer langs deze weg te wissen.
    pushdienst();
    await verstuurHerinneringen(klein, new Date(aangemeld + 47 * UUR));
    expect((await aanmelden(metAdres(echt(2)), aangemeld + 100 * UUR, klein)).status).toBe(429);
    expect(await bestaat(echt(1))).toBe(true);
  });

  it('een oud abonnement zonder de nieuwe metadata (van voor deze regel) blijft, ook als de lijst het als kandidaat noemt', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '3' };
    // Twee echte toestellen van voor de regel (om 21:00) en een vals (om 20:00).
    const oud = [echt(70), echt(71)];
    for (const e of oud) kv.data.set(await sleutelVan(e), { v: JSON.stringify(metAdres(e, ['21:00'])), metadata: { u: ['21:00'] }, ttl: null });
    await aanmelden(lichaam(9), T0, klein);
    expect(kv.abonnementen()).toHaveLength(3);
    pushdienst();
    await verstuurHerinneringen(klein, avond(0));
    await verstuurHerinneringen(klein, new Date(avond(0).getTime() + UUR));
    // Alleen het nieuwe valse staat op de lijst. Daarna een lijst die (bv. door een fout) de oude vooraan zet: elke kandidaat
    // wordt in zijn eigen metadata nagekeken.
    const lijst = await nooitGeslaagdInLijst();
    expect(lijst.map(([naam]) => naam)).toEqual([await sleutelVan(ep(9))]);
    // BESLISSING 713: de kandidaten staan in k:lijst; hier krijgen de twee oude een (vals) uur van aanmelding.
    const oudeNamen = await Promise.all(oud.map((e) => sleutelVan(e)));
    const vervalst = (await leesKLijst()).map(([naam, a]) => [naam, oudeNamen.includes(naam) ? 0 : a]);
    kv.data.set('k:lijst', { v: JSON.stringify(vervalst), metadata: null, ttl: null });
    const later = T0 + 51 * UUR;
    expect((await aanmelden(metAdres(echt(1)), later, klein)).status).toBe(204);
    expect(await bestaat(ep(9))).toBe(false);
    for (const e of oud) expect(await bestaat(e), e).toBe(true);
    // Nu zijn er alleen nog plaatsen die langs deze weg nooit weg mogen: 429.
    expect((await aanmelden(metAdres(echt(2)), later, klein)).status).toBe(429);
    for (const e of oud) expect(await bestaat(e), e).toBe(true);
  });

  it('uren wijzigen maakt een vals abonnement niet jonger; zonder dagquotum of met een vreemd geheim wordt er niets gewist', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    await aanmelden(metAdres(echt(5), ['22:00']), T0, klein);
    await aanmelden(lichaam(1), T0, klein);
    const a = (await meta(ep(1))).a;
    expect((await verwerk(verzoek('POST', lichaam(1, ['21:00'])), klein, T0 + 30 * UUR)).status).toBe(204);
    expect((await meta(ep(1))).a).toBe(a);
    pushdienst();
    await verstuurHerinneringen(klein, new Date(T0 + 35 * UUR)); // 21:00 in Brussel: het valse krijgt 403
    await verstuurHerinneringen(klein, new Date(T0 + 36 * UUR)); // 22:00: het echte krijgt 201
    const later = T0 + (PROEF_UREN + 2) * UUR;
    // Het dagquotum van nieuwe aanmeldingen is op: 429 'later' en het valse blijft staan.
    const dagSleutel = 'n:' + new Date(later).toISOString().slice(0, 10);
    kv.data.set(dagSleutel, { v: String(NIEUW_PER_DAG), metadata: null, ttl: null });
    const r = await aanmelden(metAdres(echt(1)), later, klein);
    expect([r.status, await r.json()]).toEqual([429, { fout: 'later' }]);
    expect(await bestaat(ep(1))).toBe(true);
    kv.data.delete(dagSleutel);
    // Een verse isolate: zonder dat zou de "dag vol"-stand in het geheugen tot middernacht UTC blijven weigeren.
    wisGeheugen();
    // Hetzelfde adres met een vreemd geheim: hetzelfde antwoord als een nieuw toestel, maar niets gewist of overschreven.
    const vreemd = await aanmelden({ abonnement: { endpoint: ep(1), keys: { p256dh: SLEUTELS.p256dh, auth: 'c'.repeat(22) } }, uren: ['03:00'] }, later, klein);
    expect(vreemd.status).toBe(204);
    expect(JSON.parse(await kv.get(await sleutelVan(ep(1)))).uren).toEqual(['21:00']);
    // Een echt nieuw toestel komt er wel in.
    expect((await aanmelden(metAdres(echt(1)), later, klein)).status).toBe(204);
    expect(await bestaat(ep(1))).toBe(false);
  });
});

// Nakijk van 18 november (F1 tot F7). Elke test hieronder was rood op de stand van voor het herstel.
describe('nakijk 18 november: BESLISSING 630 verdringt geen echt toestel', () => {
  const echt = (i) => `https://fcm.googleapis.com/fcm/send/echt${i}`;
  const vals = (i) => `https://fcm.googleapis.com/fcm/send/vals${i}`;
  const appel = (i) => `https://web.push.apple.com/echt${i}`;
  const metAdres = (endpoint, uren = ['20:00'], keys = SLEUTELS) => ({ abonnement: { endpoint, keys }, uren });
  let ipNr = 0;
  const aanmelden = (body, nu, e = env, ip = `192.0.2.${ipNr++ % 250}`) => verwerk(verzoek('POST', body, { ip }), e, nu);
  const bestaat = async (endpoint) => kv.data.has(await sleutelVan(endpoint));
  const meta = async (endpoint) => kv.data.get(await sleutelVan(endpoint))?.metadata;
  // regel(url) geeft de status, of 'netwerk' voor een netwerkfout.
  const antwoord = (regel) =>
    vi.stubGlobal('fetch', async (url) => {
      const s = regel(String(url));
      if (s === 'netwerk') throw new TypeError('netwerk');
      return new Response(null, { status: s });
    });
  const signaal = (e, t) => verstuurHerinneringen(e, new Date(t));
  // maandag 16 november 2026: 09:00 UTC, en 20:00 in Brussel (19:00 UTC)
  const T = Date.parse('2026-11-16T09:00:00Z');
  const AVOND = Date.parse('2026-11-16T19:00:00Z');

  it('P1: weigert de pushdienst alles (een fout in onze VAPID-instelling), dan verdringt een nieuwe aanmelding geen enkel echt toestel', async () => {
    for (let i = 0; i < 10; i++) expect((await aanmelden(metAdres(echt(i)), AVOND + i * 60000)).status).toBe(204);
    antwoord(() => 403);
    await signaal(env, AVOND + 24 * UUR);
    await signaal(env, AVOND + 48 * UUR);
    const later = AVOND + 50 * UUR;
    for (let i = 0; i < 12; i++) {
      expect((await aanmelden(metAdres(vals(i)), later + i * 15 * 60000)).status, String(i)).toBe(429);
      await signaal(env, later + i * 15 * 60000 + 1000);
    }
    for (let i = 0; i < 10; i++) expect(await bestaat(echt(i)), String(i)).toBe(true);
    // De weigeringen zijn wel geteld; zonder 2xx van de dienst maken ze niets wisbaar.
    expect((await meta(echt(0))).f).toBe(2);
    expect(await kv.get('h:fcm')).toBeNull();
  });

  it('een andere pushdienst die wel werkt, telt niet: alleen een 2xx van dezelfde dienst maakt een weigering geloofwaardig', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '3' };
    await aanmelden(metAdres(echt(1)), T, klein);
    await aanmelden(metAdres(echt(2)), T, klein);
    await aanmelden(metAdres(appel(1), ['21:00']), T, klein);
    antwoord((u) => (u.includes('apple') ? 201 : 403));
    for (let d = 0; d < 3; d++) {
      await signaal(klein, AVOND + d * 24 * UUR);
      await signaal(klein, AVOND + d * 24 * UUR + UUR);
    }
    expect(await kv.get('h:apple')).not.toBeNull();
    expect((await aanmelden(metAdres(vals(1)), AVOND + 50 * UUR, klein)).status).toBe(429);
    expect(await bestaat(echt(1))).toBe(true);
    expect(await bestaat(echt(2))).toBe(true);
  });

  it('P4: zomeruur, maar één kans binnen 48 uur en die faalt tijdelijk: het echte toestel blijft', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    const aangemeld = Date.parse('2027-03-27T01:16:00Z'); // zaterdag 02:16, de nacht voor de overgang naar zomeruur
    await aanmelden(metAdres(echt(1), ['02:15']), aangemeld, klein);
    // Een ander echt toestel op dezelfde dienst krijgt wel 2xx: de dienst werkt, alleen de ene kans van echt1 faalt.
    await aanmelden(metAdres(echt(2), ['03:15']), aangemeld, klein);
    const kansen = [];
    vi.stubGlobal('fetch', async (url) => {
      if (String(url).includes('echt1')) {
        kansen.push(url);
        return new Response(null, { status: 503 });
      }
      return new Response(null, { status: 201 });
    });
    const KWARTIER = 15 * 60000;
    for (let t = Math.ceil(aangemeld / KWARTIER) * KWARTIER; t < aangemeld + 49 * UUR; t += KWARTIER) await signaal(klein, t);
    // BESLISSING 713: het overgeslagen uur 02:15 komt in de nacht van de overgang om 03:00 (liever wat later dan geen), en
    // maandag om 02:15: twee kansen, beide tijdelijk mislukt. Vroeger was het er één.
    expect(kansen).toHaveLength(2);
    expect((await aanmelden(metAdres(vals(9)), aangemeld + 49 * UUR + 60000, klein)).status).toBe(429);
    expect(await bestaat(echt(1))).toBe(true);
  });

  it('tijdelijke fouten, een netwerkfout of een signaal dat niet liep, maken een echt toestel nooit wisbaar, hoe lang ook', async () => {
    for (const fout of [429, 500, 503, 'netwerk', 'geen signaal']) {
      kv.data.clear();
      const klein = { ...env, MAX_ABONNEMENTEN: '2' };
      await aanmelden(metAdres(echt(1)), T, klein); // 20:00
      await aanmelden(metAdres(echt(2), ['21:00']), T, klein); // werkt
      antwoord((u) => (u.includes('echt1') ? fout : 201));
      for (let d = 0; d < 5; d++) {
        if (fout !== 'geen signaal') await signaal(klein, AVOND + d * 24 * UUR);
        await signaal(klein, AVOND + d * 24 * UUR + UUR);
      }
      expect((await aanmelden(metAdres(vals(1)), AVOND + 5 * 24 * UUR, klein)).status, String(fout)).toBe(429);
      expect(await bestaat(echt(1)), String(fout)).toBe(true);
    }
  });

  it('een vals abonnement gaat pas weg als dezelfde dienst na zijn eerste weigering, en de laatste 48 uur, nog een 2xx gaf', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    antwoord((u) => (u.includes('echt') ? 201 : 403));
    // A: de enige 2xx kwam een uur VOOR de weigering (de eigen instelling kan daarna fout gegaan zijn): niet wisbaar.
    await aanmelden(metAdres(echt(1), ['19:00']), T, klein);
    await aanmelden(metAdres(vals(1)), T, klein);
    await signaal(klein, AVOND - UUR); // 19:00: echt 201
    await signaal(klein, AVOND); // 20:00: vals 403
    const nu = T + 51 * UUR;
    expect((await aanmelden(metAdres(echt(3)), nu, klein)).status).toBe(429);
    expect(await bestaat(vals(1))).toBe(true);
    // Een dag later een 2xx NA de weigering: nu wel.
    await signaal(klein, AVOND + 23 * UUR);
    expect((await aanmelden(metAdres(echt(3)), nu + 1000, klein)).status).toBe(204);
    expect(await bestaat(vals(1))).toBe(false);

    // B: een 2xx na de weigering, maar meer dan 48 uur oud: niet wisbaar; binnen 48 uur wel.
    kv.data.clear();
    await aanmelden(metAdres(echt(1), ['21:00']), T, klein);
    await aanmelden(metAdres(vals(1)), T, klein);
    await signaal(klein, AVOND); // vals 403
    await signaal(klein, AVOND + UUR); // echt 201
    expect((await aanmelden(metAdres(echt(3)), AVOND + UUR + 49 * UUR, klein)).status).toBe(429);
    expect(await bestaat(vals(1))).toBe(true);
    expect((await aanmelden(metAdres(echt(4)), AVOND + UUR + 48 * UUR + 59 * 60000, klein)).status).toBe(204);
    expect(await bestaat(vals(1))).toBe(false);
  });

  it('hoogstens MAX_WIS_POGINGEN (3) kandidaten worden gelezen, wat er ook in k:lijst staat; plaats maken ruilt in k:lijst', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    await aanmelden(metAdres(echt(0), ['21:00']), T, klein);
    await aanmelden(metAdres(vals(1)), T, klein);
    antwoord((u) => (u.includes('echt') ? 201 : 403));
    await signaal(klein, AVOND);
    await signaal(klein, AVOND + UUR);
    // BESLISSING 713: de kandidaten staan in k:lijst (vroeger k:nieuw).
    const echteLijst = await kv.get('k:lijst');
    const rommel = (n) => Array.from({ length: n }, (_, i) => [`a:${String(i).padStart(64, '0')}`, 0]);
    const later = T + 51 * UUR;
    // Drie kandidaten die niet (meer) bestaan staan vooraan: het valse abonnement komt als vierde en wordt niet meer gelezen.
    kv.data.set('k:lijst', { v: JSON.stringify([...rommel(3), ...JSON.parse(echteLijst)]), metadata: null, ttl: null });
    let voor = kv.gelezen.length;
    expect((await aanmelden(metAdres(echt(5)), later, klein)).status).toBe(429);
    expect(kv.gelezen.slice(voor).filter((k) => k.startsWith('a:'))).toHaveLength(1 + 3); // het eigen adres en 3 kandidaten
    expect(await bestaat(vals(1))).toBe(true);
    // Met twee ervoor is het valse de derde: het gaat weg. Eén schrijfopdracht op k:lijst: het valse eruit, het nieuwe erin.
    kv.data.set('k:lijst', { v: JSON.stringify([...rommel(2), ...JSON.parse(echteLijst)]), metadata: null, ttl: null });
    voor = kv.geschreven.length;
    expect((await aanmelden(metAdres(echt(5)), later + 1000, klein)).status).toBe(204);
    expect(await bestaat(vals(1))).toBe(false);
    expect(kv.geschreven.slice(voor).filter((k) => k === 'k:lijst')).toHaveLength(1);
    const namen = (await leesKLijst()).map(([naam]) => naam);
    expect(namen).not.toContain(await sleutelVan(vals(1)));
    expect(namen).toContain(await sleutelVan(echt(5)));
    expect(kv.abonnementen()).toHaveLength(2);
    // De volgende gelijkzetting haalt de rommel eruit.
    await signaal(klein, later + 15 * 60000);
    expect((await leesKLijst()).map(([naam]) => naam).sort()).toEqual([...kv.abonnementen()].sort());
  });

  it('de kandidaten in k:lijst komen de oudste eerst, ook als de namen in KV anders liggen: een aanmelding wist dus de oudste', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '4' };
    // Drie valse adressen, aangemeld in de omgekeerde volgorde van hun sleutel (KV geeft de lijst in de volgorde van de naam).
    const metSleutel = await Promise.all([31, 32, 33, 34, 35, 36].map(async (i) => [vals(i), await sleutelVan(vals(i))]));
    metSleutel.sort((x, y) => (x[1] < y[1] ? 1 : -1));
    const drie = metSleutel.slice(0, 3).map(([e]) => e);
    await aanmelden(metAdres(echt(0), ['21:00']), T, klein);
    for (let i = 0; i < 3; i++) await aanmelden(metAdres(drie[i]), T + i * UUR, klein);
    antwoord((u) => (u.includes('echt') ? 201 : 403));
    await signaal(klein, AVOND);
    await signaal(klein, AVOND + UUR);
    const lijst = (await nooitGeslaagdInLijst()).map(([naam]) => naam);
    expect(lijst).toEqual(await Promise.all(drie.map((e) => sleutelVan(e))));
    expect((await aanmelden(metAdres(echt(1)), T + 53 * UUR, klein)).status).toBe(204);
    expect(await bestaat(drie[0])).toBe(false);
    expect(await bestaat(drie[1])).toBe(true);
    expect(await bestaat(drie[2])).toBe(true);
  });

  it('ook een 200 (zoals Windows antwoordt) telt als geslaagd: g = 1 en het uur van de dienst', async () => {
    const wns = 'https://wns2-par02p.notify.windows.com/w/?token=abc';
    await aanmelden(metAdres(wns), T);
    antwoord(() => 200);
    await signaal(env, AVOND);
    const m = await meta(wns);
    expect(m.g).toBe(1);
    expect(m.a).toBeUndefined();
    expect(await kv.get('h:windows')).toBe(String(Math.floor(AVOND / UUR)));
  });

  it('het uur van een dienst wordt alleen geschreven als het uur verandert, en verdwijnt vanzelf', async () => {
    const uren = ['20:00', '20:15', '20:30', '20:45', '21:00'];
    await aanmelden(metAdres(echt(1), uren), T);
    await aanmelden(metAdres(echt(2), uren), T);
    antwoord(() => 201);
    for (let k = 0; k < 5; k++) await signaal(env, AVOND + k * 15 * 60000);
    expect(kv.geschreven.filter((k) => k === 'h:fcm')).toHaveLength(2);
    expect(kv.data.get('h:fcm').ttl).toBe((PROEF_UREN + 1) * 3600);
  });

  it('P2 (F3): gelijktijdige aanmeldingen die hetzelfde abonnement kozen: het signaal brengt de dienst terug met dezelfde regel', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '3' };
    await aanmelden(metAdres(echt(0), ['21:00']), T, klein);
    await aanmelden(metAdres(vals(1)), T, klein);
    await aanmelden(metAdres(vals(2)), T + UUR, klein);
    antwoord((u) => (u.includes('echt') ? 201 : 403));
    await signaal(klein, AVOND);
    await signaal(klein, AVOND + UUR);
    const later = T + 51 * UUR;
    // De wedloop vastleggen: elk van de drie verzoeken wacht met wissen tot alle drie hun keuze maakten (zoals in KV, waar
    // een wis pas na tot een minuut overal te zien is).
    const echteDelete = kv.delete.bind(kv);
    const wachtend = [];
    kv.delete = async (k) => {
      if (k.startsWith('a:') && wachtend.length < 3) {
        await new Promise((verder) => {
          wachtend.push(verder);
          if (wachtend.length === 3) for (const w of wachtend) w();
        });
      }
      return echteDelete(k);
    };
    const r = await Promise.all([11, 12, 13].map((i) => aanmelden(metAdres(echt(i), ['08:00']), later, klein)));
    kv.delete = echteDelete;
    expect(r.map((x) => x.status)).toEqual([204, 204, 204]);
    // De wedloop zelf (KV kent geen transacties): alle drie kozen vals1, er staan er nu 5.
    expect(kv.abonnementen()).toHaveLength(5);
    await signaal(klein, later + 15 * 60000);
    // Het volgende signaal wist wat volgens de regel weg mag (vals2) en laat de echte toestellen staan.
    expect(await bestaat(vals(2))).toBe(false);
    for (const i of [0, 11, 12, 13]) expect(await bestaat(echt(i)), String(i)).toBe(true);
    // Nog altijd een boven het maximum en niets meer wisbaar: de lijst zegt het eerlijk en er komt niemand bij.
    expect(await leesKLijst()).toHaveLength(4);
    expect((await aanmelden(metAdres(echt(20)), later + UUR, klein)).status).toBe(429);
  });
});

describe('nakijk 18 november: het signaal maakt geen wijziging of afmelding ongedaan (F4)', () => {
  const echt = (i) => `https://fcm.googleapis.com/fcm/send/echt${i}`;
  const metAdres = (endpoint, uren = ['20:00'], keys = SLEUTELS) => ({ abonnement: { endpoint, keys }, uren });
  const AVOND = Date.parse('2026-11-16T19:00:00Z');
  const sleutel = () => sleutelVan(echt(1));
  // Tijdens het signaal (terwijl de pushdienst antwoordt) doet het toestel zelf iets.
  const tijdens = (status, actie) =>
    vi.stubGlobal('fetch', async () => {
      await actie();
      return new Response(null, { status });
    });

  for (const status of [201, 403]) {
    it(`P5: uren gewijzigd tijdens het signaal (${status}): de nieuwe uren blijven`, async () => {
      await verwerk(verzoek('POST', metAdres(echt(1)), { ip: '192.0.2.1' }), env, AVOND - 5 * UUR);
      tijdens(status, () => verwerk(verzoek('POST', metAdres(echt(1), ['07:00', '20:00'])), env, AVOND + 1000));
      await verstuurHerinneringen(env, new Date(AVOND));
      const r = kv.data.get(await sleutel());
      expect(JSON.parse(r.v).uren).toEqual(['07:00', '20:00']);
      expect(r.metadata.u).toEqual(['07:00', '20:00']);
      expect(r.metadata.w).toBe(1);
      if (status === 201) expect([r.metadata.g, r.metadata.a]).toEqual([1, undefined]);
      else expect([r.metadata.f, r.metadata.ff]).toEqual([1, Math.floor(AVOND / UUR)]);
    });

    it(`P8: afgemeld tijdens het signaal (${status}): het abonnement blijft weg`, async () => {
      await verwerk(verzoek('POST', metAdres(echt(1)), { ip: '192.0.2.1' }), env, AVOND - 5 * UUR);
      tijdens(status, () => verwerk(verzoek('DELETE', { endpoint: echt(1), auth: SLEUTELS.auth }), env, AVOND + 1000));
      await verstuurHerinneringen(env, new Date(AVOND));
      expect(kv.abonnementen()).toHaveLength(0);
      // BESLISSING 713: k:lijst (vroeger t:aantal en k:nieuw) is leeg.
      expect(await leesKLijst()).toEqual([]);
    });
  }

  it('een signaal dat niets hoeft te schrijven, leest het abonnement niet opnieuw', async () => {
    for (let i = 0; i < 5; i++) await verwerk(verzoek('POST', metAdres(echt(i)), { ip: `192.0.2.${i}` }), env, AVOND - 5 * UUR);
    vi.stubGlobal('fetch', async () => new Response(null, { status: 201 }));
    await verstuurHerinneringen(env, new Date(AVOND)); // de eerste keer: g zetten (5 keer lezen voor het signaal, 5 keer vlak voor het schrijven)
    const voor = kv.gelezen.length;
    await verstuurHerinneringen(env, new Date(AVOND + 24 * UUR));
    expect(kv.gelezen.slice(voor).filter((k) => k.startsWith('a:'))).toHaveLength(5);
  });
});

describe('nakijk 18 november: rem, dagteller en geheimen (F5, F6, F7)', () => {
  const T = Date.parse('2026-11-16T09:00:00Z');
  const vreemd = (i) => ({ abonnement: { endpoint: ep(i), keys: { p256dh: SLEUTELS.p256dh, auth: 'z'.repeat(22) } }, uren: ['20:00'] });

  it('F5: een verzoek dat de rem of de dagteller weigert, leest de telling en k:nieuw niet', async () => {
    // Herstel van 18 november (bevinding 1c): eerst k:lijst, zodat een volle dienst na 2 leesopdrachten weigert. Daarom hier een
    // dienst die niet vol is: de rem van dit IP op geeft 'later' na 4 leesopdrachten (het eigen adres, k:lijst, de rem, de dagteller).
    const klein = { ...env, MAX_ABONNEMENTEN: String(REM_PER_UUR + 5) };
    for (let i = 0; i < REM_PER_UUR; i++) expect((await verwerk(verzoek('POST', lichaam(i), { ip: '192.0.2.9' }), klein, T)).status).toBe(204);
    let voor = kv.gelezen.length;
    const r = await verwerk(verzoek('POST', lichaam(50), { ip: '192.0.2.9' }), klein, T + 1000);
    expect([r.status, await r.json()]).toEqual([429, { fout: 'later' }]);
    expect(kv.gelezen.slice(voor)).toHaveLength(4);
    expect(kv.gelezen.slice(voor)).not.toContain('t:aantal');
    expect(kv.gelezen.slice(voor)).not.toContain('k:nieuw');
    // Hetzelfde bij een vol dagquotum, van een ander IP.
    kv.data.set('n:' + new Date(T).toISOString().slice(0, 10), { v: String(NIEUW_PER_DAG), metadata: null, ttl: null });
    voor = kv.gelezen.length;
    expect((await verwerk(verzoek('POST', lichaam(51), { ip: '192.0.2.10' }), klein, T + 1000)).status).toBe(429);
    expect(kv.gelezen.slice(voor)).toHaveLength(4);
    // Een volle dienst zonder kandidaat om plaats te maken: 'vol' na 2 leesopdrachten (het eigen adres en k:lijst). Een verse
    // isolate: anders weigert de "dag vol"-stand al na 1 leesopdracht.
    wisGeheugen();
    voor = kv.gelezen.length;
    const vol = await verwerk(verzoek('POST', lichaam(52), { ip: '192.0.2.11' }), { ...env, MAX_ABONNEMENTEN: String(REM_PER_UUR) }, T + 1000);
    expect([vol.status, await vol.json()]).toEqual([429, { fout: 'vol' }]);
    expect(kv.gelezen.slice(voor)).toHaveLength(2);
  });

  it('F6: een bestaand adres met een vreemd geheim telt mee in de rem en de dagteller, net als een nieuwe aanmelding', async () => {
    await verwerk(verzoek('POST', lichaam(1), { ip: '192.0.2.1' }), env, T);
    const ip = '192.0.2.2';
    expect((await verwerk(verzoek('POST', vreemd(1), { ip }), env, T + 1)).status).toBe(204);
    let ok = 0;
    for (let i = 0; i < REM_PER_UUR + 1; i++) if ((await verwerk(verzoek('POST', lichaam(10 + i), { ip }), env, T + 2)).status === 204) ok++;
    // Zelfde rest als na een echte nieuwe aanmelding: de rem verraadt niet of het adres al bestond.
    expect(ok).toBe(REM_PER_UUR - 1);
    expect(await kv.get('n:' + new Date(T).toISOString().slice(0, 10))).toBe(String(1 + 1 + REM_PER_UUR - 1));
    // Niets overschreven.
    expect(JSON.parse(await kv.get(await sleutelVan(ep(1)))).abonnement.keys.auth).toBe(SLEUTELS.auth);
  });

  it('F7: zonder REM_ZOUT en zonder VAPID_PRIVE geen nieuwe aanmeldingen (503); bijwerken en afmelden blijven werken', async () => {
    expect((await verwerk(verzoek('POST', lichaam(1)), env, T)).status).toBe(204);
    const zonder = { ...env, VAPID_PRIVE: undefined, REM_ZOUT: undefined };
    const voor = kv.tellers.put;
    const r = await verwerk(verzoek('POST', lichaam(2)), zonder, T);
    expect([r.status, await r.json()]).toEqual([503, { fout: 'tijdelijk' }]);
    expect(kv.tellers.put).toBe(voor);
    expect((await verwerk(verzoek('POST', vreemd(1)), zonder, T)).status).toBe(503);
    expect((await verwerk(verzoek('POST', lichaam(1, ['07:00'])), zonder, T)).status).toBe(204);
    expect((await verwerk(verzoek('DELETE', { endpoint: ep(1), auth: SLEUTELS.auth }), zonder, T)).status).toBe(204);
    expect(kv.abonnementen()).toHaveLength(0);
    // Met alleen REM_ZOUT gaat het wel.
    expect((await verwerk(verzoek('POST', lichaam(2)), { ...zonder, REM_ZOUT: 'proef-zout-'.repeat(4) }, T)).status).toBe(204);
  });

  it('F7: ff staat als heel uur; een oudere waarde in milliseconden wordt omgerekend', async () => {
    const AVOND = Date.parse('2026-11-16T19:00:00Z');
    await verwerk(verzoek('POST', lichaam(1)), env, T);
    // Een echt toestel op dezelfde dienst (201) toont dat de dienst werkt; al de rest krijgt 403.
    await verwerk(verzoek('POST', { abonnement: { endpoint: 'https://fcm.googleapis.com/fcm/send/echt0', keys: SLEUTELS }, uren: ['20:00'] }, { ip: '192.0.2.50' }), env, T);
    vi.stubGlobal('fetch', async (url) => new Response(null, { status: String(url).includes('/echt') ? 201 : 403 }));
    // BESLISSING 713: op de minuut zelf (vroeger 20:10, afgerond op het kwartier van 20:00).
    await verstuurHerinneringen(env, new Date(AVOND));
    expect((kv.data.get(await sleutelVan(ep(1)))).metadata.ff).toBe(Math.floor(AVOND / UUR));
    // Een reeks van voor deze wijziging (ff in milliseconden, 3 dagen oud): wordt correct als oud genoeg gezien.
    const k = await sleutelVan(ep(2));
    kv.data.set(k, { v: JSON.stringify(lichaam(2)), metadata: { u: ['20:00'], f: WEIGER_DREMPEL - 1, ff: AVOND - 72 * UUR }, ttl: null });
    await verstuurHerinneringen(env, new Date(AVOND + 24 * UUR));
    expect(kv.data.has(k)).toBe(false);
  });
});

// Nakijk 2 van 18 november: de regel voor blijvende weigeringen (OW-01a) kijkt nu ook naar voorwaarde 3 en 4 van BESLISSING 630.
// Elke test hieronder (behalve 404 en 410, die al zo werkte) was rood op de stand van voor deze wijziging.
describe('nakijk 2: OW-01a wist geen echt toestel als de pushdienst alles weigert', () => {
  const fcm = (naam) => `https://fcm.googleapis.com/fcm/send/${naam}`;
  const appel = (naam) => `https://web.push.apple.com/${naam}`;
  const metAdres = (endpoint, uren = ['20:00']) => ({ abonnement: { endpoint, keys: SLEUTELS }, uren });
  let ipNr = 0;
  const aanmelden = (endpoint, nu, uren) => verwerk(verzoek('POST', metAdres(endpoint, uren), { ip: `192.0.2.${ipNr++ % 250}` }), env, nu);
  const bestaat = async (endpoint) => kv.data.has(await sleutelVan(endpoint));
  const meta = async (endpoint) => kv.data.get(await sleutelVan(endpoint))?.metadata;
  const antwoord = (regel) => vi.stubGlobal('fetch', async (url) => new Response(null, { status: regel(String(url)) }));
  const T = Date.parse('2026-11-16T09:00:00Z');
  // 20:00 in Brussel (wintertijd) op 16 november 2026, en zoveel dagen later
  const avond = (dag) => new Date(Date.parse('2026-11-16T19:00:00Z') + dag * 24 * UUR);

  it('alles 403 gedurende dagen (een fout in onze VAPID-instelling): geen enkel toestel gewist, ook niet na een week', async () => {
    // Zes echte toestellen die al werkten (op twee diensten) en twee die zich aanmeldden nadat de instelling fout ging.
    const oud = [fcm('echt1'), fcm('echt2'), fcm('echt3'), fcm('echt4'), appel('echt5'), appel('echt6')];
    for (const e of oud) await aanmelden(e, T);
    antwoord(() => 201);
    await verstuurHerinneringen(env, avond(0));
    for (const e of oud) expect((await meta(e)).g, e).toBe(1);
    const nieuw = [fcm('echt7'), appel('echt8')];
    for (const e of nieuw) await aanmelden(e, avond(0).getTime() + UUR);
    antwoord(() => 403);
    for (let dag = 1; dag <= 8; dag++) {
      for (let k = 0; k < 4; k++) await verstuurHerinneringen(env, new Date(avond(dag).getTime() + k * 15 * 60000));
    }
    for (const e of [...oud, ...nieuw]) expect(await bestaat(e), e).toBe(true);
    expect(kv.abonnementen()).toHaveLength(8);
    // De reeks is wel geteld (en blijft op WEIGER_DREMPEL staan).
    expect((await meta(oud[0])).f).toBe(WEIGER_DREMPEL);
    // De eigenaar zet de instelling recht: alle toestellen krijgen weer een melding en de reeks valt weg.
    antwoord(() => 201);
    await verstuurHerinneringen(env, avond(9));
    for (const e of [...oud, ...nieuw]) expect((await meta(e)).f, e).toBeUndefined();
  });

  it('een andere pushdienst die wel werkt, telt niet: de toestellen van de dienst die alles weigert blijven', async () => {
    for (const e of [fcm('echt1'), fcm('echt2'), appel('echt3')]) await aanmelden(e, T);
    antwoord((u) => (u.includes('apple') ? 201 : 403));
    for (let dag = 0; dag <= 5; dag++) await verstuurHerinneringen(env, avond(dag));
    expect(await kv.get('h:apple')).not.toBeNull();
    expect(await kv.get('h:fcm')).toBeNull();
    for (const e of [fcm('echt1'), fcm('echt2'), appel('echt3')]) expect(await bestaat(e), e).toBe(true);
  });

  it('weigert de dienst alles nadat hij eerder werkte, dan telt die oude 2xx niet: na 48 uur zonder 2xx wordt niets gewist', async () => {
    // Een vals adres en een echt toestel op dezelfde dienst. Dag 0 werkt het echte; vanaf dag 1 weigert de dienst alles.
    await aanmelden(fcm('vals1'), T);
    await aanmelden(fcm('echt1'), T, ['21:00']);
    let kapot = false;
    antwoord((u) => (u.includes('/echt') && !kapot ? 201 : 403));
    await verstuurHerinneringen(env, avond(0)); // vals: 403
    await verstuurHerinneringen(env, new Date(avond(0).getTime() + UUR)); // echt: 201
    kapot = true;
    for (let dag = 1; dag <= 6; dag++) {
      await verstuurHerinneringen(env, avond(dag));
      await verstuurHerinneringen(env, new Date(avond(dag).getTime() + UUR));
    }
    expect(await bestaat(fcm('echt1'))).toBe(true);
    // Ook het valse blijft: zonder recente 2xx van de dienst is een weigering geen bewijs.
    expect(await bestaat(fcm('vals1'))).toBe(true);
    // Werkt de dienst weer (het echte krijgt 201), dan gaat het valse bij zijn volgende weigering wel weg.
    kapot = false;
    await verstuurHerinneringen(env, new Date(avond(7).getTime() + UUR)); // 21:00: echt 201
    await verstuurHerinneringen(env, avond(8)); // 20:00 de dag erna: vals 403, en de dienst gaf binnen 48 uur een 2xx
    expect(await bestaat(fcm('vals1'))).toBe(false);
    expect(await bestaat(fcm('echt1'))).toBe(true);
  });

  it('404 en 410 wissen meteen, ook als de dienst verder alles weigert en geen enkel toestel werkt', async () => {
    for (const status of [404, 410]) {
      kv.data.clear();
      await aanmelden(fcm('weg1'), T);
      await aanmelden(fcm('vals2'), T);
      antwoord((u) => (u.includes('weg1') ? status : 403));
      await verstuurHerinneringen(env, avond(0));
      expect(await bestaat(fcm('weg1')), String(status)).toBe(false);
      expect(await bestaat(fcm('vals2')), String(status)).toBe(true);
      expect(await kv.get('h:fcm')).toBeNull();
    }
  });

  it('geen extra schrijfopdrachten: een kandidaat die niet gewist mag worden, kost na WEIGER_DREMPEL niets meer', async () => {
    await aanmelden(fcm('echt1'), T);
    antwoord(() => 403);
    for (let dag = 0; dag < 3; dag++) await verstuurHerinneringen(env, avond(dag));
    const voor = kv.geschreven.length;
    for (let dag = 3; dag < 10; dag++) await verstuurHerinneringen(env, avond(dag));
    // Behalve v:verstuurd (de inhaalregel van BESLISSING 713, een keer per run die iets stuurt) niets.
    expect(kv.geschreven.slice(voor).filter((k) => !k.startsWith('v:'))).toEqual([]);
    expect(await bestaat(fcm('echt1'))).toBe(true);
  });
});

// BESLISSING 641 (nakijk M1): KV kent geen atomaire teller. Een golf gelijktijdige nieuwe aanmeldingen las vroeger allemaal
// dezelfde stand, schreef eerst elk zijn eigen rem en botste pas daarna op de dagteller. Nu schrijft een aanmelding eerst de
// dagteller en leest ze hem opnieuw; wie botst of verliest, schrijft niets meer. Deze tests waren rood op de stand van daarvoor.
describe('BESLISSING 641: een golf gelijktijdige aanmeldingen (M1)', () => {
  const golfIp = (i) => `198.51.${i >> 8}.${i & 255}`;
  const soort = (sleutels) => sleutels.map((k) => k.slice(0, 2));
  const dagSleutel = (nu) => 'n:' + new Date(nu).toISOString().slice(0, 10);
  const vreemd = (i) => ({ abonnement: { endpoint: ep(i), keys: { p256dh: SLEUTELS.p256dh, auth: 'z'.repeat(22) } }, uren: ['20:00'] });

  it('een aanvaarde aanmelding schrijft eerst de dagteller, dan k:lijst, de rem en het abonnement; een vreemd geheim de dagteller en de rem', async () => {
    expect((await verwerk(verzoek('POST', lichaam(1)), env, T0)).status).toBe(204);
    // BESLISSING 713: k:lijst in de plaats van de telling t:aantal.
    expect(soort(kv.geschreven)).toEqual(['n:', 'k:', 'r:', 'a:']);
    const voor = kv.geschreven.length;
    expect((await verwerk(verzoek('POST', vreemd(1), { ip: '192.0.2.77' }), env, T0)).status).toBe(204);
    expect(soort(kv.geschreven.slice(voor))).toEqual(['n:', 'r:']);
    // Maakt een abonnement plaats (vol, een vals abonnement mag weg): het wissen komt na de dagteller, en de telling blijft staan.
    kv = new NepKv();
    const klein = { ...env, ABONNEMENTEN: kv, MAX_ABONNEMENTEN: '2' };
    const adres = (endpoint, uren = ['20:00']) => ({ abonnement: { endpoint, keys: SLEUTELS }, uren });
    const echtAdres = (i) => `https://fcm.googleapis.com/fcm/send/echt${i}`;
    const valsAdres = 'https://fcm.googleapis.com/fcm/send/vals1';
    const AVOND = Date.parse('2026-11-16T19:00:00Z');
    await verwerk(verzoek('POST', adres(echtAdres(0), ['21:00']), { ip: '192.0.2.10' }), klein, T0);
    await verwerk(verzoek('POST', adres(valsAdres), { ip: '192.0.2.11' }), klein, T0);
    vi.stubGlobal('fetch', async (u) => new Response(null, { status: String(u).includes('echt') ? 201 : 403 }));
    await verstuurHerinneringen(klein, new Date(AVOND));
    await verstuurHerinneringen(klein, new Date(AVOND + UUR));
    const volgorde = [];
    const echtePut = kv.put.bind(kv);
    const echteDelete = kv.delete.bind(kv);
    kv.put = async (k, v, o) => (volgorde.push('put ' + k.slice(0, 2)), echtePut(k, v, o));
    kv.delete = async (k) => (volgorde.push('delete ' + k.slice(0, 2)), echteDelete(k));
    const later = T0 + 51 * UUR;
    expect((await verwerk(verzoek('POST', adres(echtAdres(5)), { ip: '192.0.2.12' }), klein, later)).status).toBe(204);
    // BESLISSING 713: na het wissen ook k:lijst (het valse eruit, het nieuwe erin); vroeger bleef de telling dan staan.
    expect(volgorde).toEqual(['put n:', 'delete a:', 'put k:', 'put r:', 'put a:']);
    expect(volgorde.indexOf('put n:')).toBeLessThan(volgorde.indexOf('delete a:'));
    expect(kv.abonnementen()).toHaveLength(2);
  });

  it('proef Q3: 200 gelijktijdige aanmeldingen van verschillende IP-adressen (5 ms per KV-opdracht): niet boven het maximum, en wie niet doorkomt schrijft alleen de dagteller', async () => {
    kv = new NepKv({ vertraging: 5 });
    env = { ...env, ABONNEMENTEN: kv };
    const n = 200;
    const r = await Promise.all(Array.from({ length: n }, (_, i) => verwerk(verzoek('POST', lichaam(i), { ip: golfIp(i) }), env, T0)));
    const ok = r.filter((x) => x.status === 204).length;
    // Vroeger: 200 keer 204, 200 abonnementen bij een maximum van 10, 800 schrijfopdrachten.
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(ok).toBeLessThanOrEqual(10);
    expect(kv.abonnementen()).toHaveLength(ok);
    for (const x of r.filter((y) => y.status !== 204)) expect([x.status, await x.json()]).toEqual([503, { fout: 'tijdelijk' }]);
    // Een verzoek dat niet doorkomt, schreef geen rem, geen telling en geen abonnement.
    expect(kv.perSoort['r:']).toBe(ok);
    expect(kv.perSoort['a:']).toBe(ok);
    expect(kv.perSoort['k:']).toBe(ok);
    // De lijst zegt eerlijk hoeveel er zijn (BESLISSING 713: k:lijst in de plaats van t:aantal).
    expect(JSON.parse(await kv.get('k:lijst'))).toHaveLength(ok);
  });

  it('met de grens van echte KV (1 schrijfopdracht per seconde per sleutel): een poging die op de dagteller botst, schrijft niets', async () => {
    // Een vaste klok: de hele golf valt in dezelfde seconde.
    kv = new NepKv({ vertraging: 5, eenPerSeconde: true, klok: () => T0 });
    env = { ...env, ABONNEMENTEN: kv };
    const n = 200;
    const r = await Promise.all(Array.from({ length: n }, (_, i) => worker.fetch(verzoek('POST', lichaam(i), { ip: golfIp(i) }), env)));
    const ok = r.filter((x) => x.status === 204).length;
    expect(ok).toBe(1);
    expect(r.filter((x) => x.status === 503)).toHaveLength(n - 1);
    expect(kv.tellers.geweigerd).toBe(n - 1);
    // Vroeger schreef elk verzoek eerst zijn rem (200 schrijfopdrachten) en botste het pas daarna. Nu: alleen de 4 van de ene
    // aanmelding die doorkwam; de 199 geweigerde pogingen schreven samen nul.
    expect(kv.perSoort['r:']).toBe(1);
    expect(kv.tellers.put).toBe(4);
    expect(kv.abonnementen()).toHaveLength(1);
  });

  it('leest KV na het schrijven nog de oude stand van de dagteller (een trage kopie), dan gaat een eerlijke aanmelding gewoon door', async () => {
    for (const oud of [null, { v: '3', metadata: null, ttl: null }]) {
      kv.data.clear();
      const dag = dagSleutel(T0);
      if (oud) kv.data.set(dag, oud);
      const echt = kv.getWithMetadata.bind(kv);
      kv.getWithMetadata = async (k) => (k === dag ? (oud ? { value: oud.v, metadata: oud.metadata } : { value: null, metadata: null }) : echt(k));
      expect((await verwerk(verzoek('POST', lichaam(1)), env, T0)).status, String(oud?.v)).toBe(204);
      kv.getWithMetadata = echt;
      expect(kv.abonnementen()).toHaveLength(1);
      expect(kv.data.get(dag).v).toBe(oud ? '4' : '1');
    }
  });

  it('schreef een ander verzoek de dagteller tussen schrijven en opnieuw lezen, dan stopt dit verzoek met 503 en schrijft het verder niets', async () => {
    // Een bestaand abonnement, voor de poging met een vreemd geheim.
    expect((await verwerk(verzoek('POST', lichaam(5), { ip: '192.0.2.3' }), env, T0)).status).toBe(204);
    const echtePut = kv.put.bind(kv);
    // Na elke schrijfopdracht op de dagteller schrijft "een ander verzoek" er meteen overheen, met zijn eigen merk.
    kv.put = async (k, v, opties) => {
      await echtePut(k, v, opties);
      if (k.startsWith('n:')) kv.data.set(k, { v, metadata: { m: 'ander' }, ttl: null });
    };
    for (const [lichaamNu, ip] of [[lichaam(1), '192.0.2.1'], [vreemd(5), '192.0.2.2']]) {
      const voor = kv.geschreven.length;
      const r = await verwerk(verzoek('POST', lichaamNu, { ip }), env, T0);
      expect([r.status, await r.json()], ip).toEqual([503, { fout: 'tijdelijk' }]);
      expect(soort(kv.geschreven.slice(voor)), ip).toEqual(['n:']);
    }
    kv.put = echtePut;
    expect(kv.abonnementen()).toHaveLength(1);
    expect(JSON.parse(await kv.get(await sleutelVan(ep(5)))).abonnement.keys.auth).toBe(SLEUTELS.auth);
  });

  it('leest KV dezelfde waarde als voor het schrijven maar met het merk van een ander verzoek, dan stopt dit verzoek met 503 en schrijft alleen de dagteller', async () => {
    const dag = dagSleutel(T0);
    kv.data.set(dag, { v: '3', metadata: { m: 'oud' }, ttl: null });
    const echtePut = kv.put.bind(kv);
    // Na onze schrijfopdracht staat er weer de oude waarde, maar met het merk van een ander verzoek.
    kv.put = async (k, v, opties) => {
      await echtePut(k, v, opties);
      if (k === dag) kv.data.set(k, { v: '3', metadata: { m: 'ander' }, ttl: null });
    };
    const voor = kv.geschreven.length;
    const r = await verwerk(verzoek('POST', lichaam(1), { ip: '192.0.2.4' }), env, T0);
    kv.put = echtePut;
    expect([r.status, await r.json()]).toEqual([503, { fout: 'tijdelijk' }]);
    expect(soort(kv.geschreven.slice(voor))).toEqual(['n:']);
    expect(kv.abonnementen()).toHaveLength(0);
  });

  it('L1: een pushdienst die afwisselt tussen 403 en 201 kost hoogstens 12 schrijfopdrachten per abonnement per dag (rekensom 1202, niet gegarandeerd onder 1000)', async () => {
    const uren = Array.from({ length: 12 }, (_, i) => `${String(2 * i).padStart(2, '0')}:00`);
    await verwerk(verzoek('POST', lichaam(1, uren)), env, T0 - 72 * UUR);
    let k = 0;
    vi.stubGlobal('fetch', async () => new Response(null, { status: k++ % 2 ? 201 : 403 }));
    const dag0 = Date.parse('2026-11-16T00:00:00Z');
    const voor = kv.perSoort['a:'] ?? 0;
    for (let q = 0; q < 96; q++) await verstuurHerinneringen(env, new Date(dag0 + q * 15 * 60000));
    expect(k).toBe(12);
    // Elk signaal een schrijfopdracht: 12 in plaats van hoogstens WEIGER_DREMPEL + 1.
    expect((kv.perSoort['a:'] ?? 0) - voor).toBe(12);
    const S = 10 + NIEUW_PER_DAG;
    // 732 + 30 x WIJZIGINGEN_PER_DAG = 1182 (BESLISSING 713: zonder k:nieuw, met v:verstuurd; daarvoor 752 + 30 x ... = 1202). Dit
    // geval was en is niet gegarandeerd onder 1000; de afwisseling komt van de pushdienst, niet van een aanvaller (zie de rekensom in
    // worker/src/index.js).
    expect(4 * NIEUW_PER_DAG + S * WIJZIGINGEN_PER_DAG + S + 96 + S * MAX_UREN + S + 4 * 24 + MAX_VERSTUURD_PER_DAG).toBe(1182);
  });
});

// BESLISSING 713: een herinnering per minuut. De run loopt elke minuut, leest k:lijst en elk abonnement, en haalt gemiste minuten
// in (de inhaalregel in worker/src/index.js).
describe('BESLISSING 713: een herinnering per minuut', () => {
  const MIN = 60 * 1000;
  // 20:00 in Brussel (wintertijd) op maandag 16 november 2026.
  const AVOND = Date.parse('2026-11-16T19:00:00Z');
  const appel = (naam) => `https://web.push.apple.com/${naam}`;
  const metAdres = (endpoint, uren) => ({ abonnement: { endpoint, keys: SLEUTELS }, uren });
  let ipNr = 0;
  const aanmelden = (endpoint, uren, nu, e = env) => verwerk(verzoek('POST', metAdres(endpoint, uren), { ip: `192.0.2.${ipNr++ % 250}` }), e, nu);
  // De pushdienst onthoudt welk adres op welke (geplande) minuut een signaal kreeg.
  let ontvangen;
  let huidig;
  let status;
  beforeEach(() => {
    ontvangen = [];
    status = () => 201;
    vi.stubGlobal('fetch', async (url) => {
      ontvangen.push([String(url).split('/').pop(), (huidig - AVOND) / MIN]);
      return new Response(null, { status: status(String(url)) });
    });
  });
  const run = (t, e = env) => {
    huidig = t;
    return verstuurHerinneringen(e, new Date(t));
  };
  // Elke minuut van `van` tot en met `tot` (in minuten na 20:00).
  const runs = async (van, tot, e = env) => {
    for (let m = van; m <= tot; m++) await run(AVOND + m * MIN, e);
  };
  const voor = (naam) => ontvangen.filter(([n]) => n === naam).map(([, m]) => m);
  // Een signaal om 19:30 aan een ander toestel: zo bestaat v:verstuurd al (het inhalen begint pas vanaf het eerste signaal).
  const eerstEenSignaal = async () => {
    expect((await aanmelden(appel('vroeg'), ['19:30'], AVOND - 5 * UUR)).status).toBe(204);
    await run(AVOND - 30 * MIN);
    expect(voor('vroeg')).toEqual([-30]);
  };

  it('een uur per minuut: 20:07 krijgt zijn signaal om 20:07, niet om 20:00 of 20:15', async () => {
    expect((await aanmelden(appel('a'), ['20:07'], AVOND - 5 * UUR)).status).toBe(204);
    await runs(-2, 20);
    expect(ontvangen).toEqual([['a', 7]]);
  });

  it('een gewijzigd uur werkt bij de volgende run door, zonder schrijfopdracht op k:lijst', async () => {
    expect((await aanmelden(appel('a'), ['20:30'], AVOND - 5 * UUR)).status).toBe(204);
    await runs(0, 2);
    const geschreven = kv.geschreven.length;
    expect((await aanmelden(appel('a'), ['20:05'], AVOND + 2 * MIN + 10 * 1000)).status).toBe(204);
    expect(kv.geschreven.slice(geschreven)).toEqual([await sleutelVan(appel('a'))]);
    await runs(3, 40);
    expect(voor('a')).toEqual([5]);
  });

  it('een rustige run kost 2 + N leesopdrachten en verder niets; alleen de run van een kwartier doet een lijstopvraging', async () => {
    for (const n of ['a', 'b', 'c']) expect((await aanmelden(appel(n), ['08:00'], AVOND - 5 * UUR)).status).toBe(204);
    await run(AVOND);
    const stand = { ...kv.tellers };
    const fetchVoor = ontvangen.length;
    await run(AVOND + MIN);
    expect(kv.tellers.get - stand.get).toBe(2 + 3);
    expect([kv.tellers.put, kv.tellers.delete, kv.tellers.list]).toEqual([stand.put, stand.delete, stand.list]);
    expect(ontvangen.length).toBe(fetchVoor);
    await run(AVOND + 15 * MIN);
    expect(kv.tellers.list - stand.list).toBe(1);
  });

  it('inhaalregel: wat een run die niet liep (bv. na een uitrol) miste, komt één keer, 2 tot INHAAL_MINUTEN minuten later', async () => {
    await eerstEenSignaal();
    for (const [n, u] of [['a', '19:50'], ['b', '20:00'], ['c', '20:12']]) expect((await aanmelden(appel(n), [u], AVOND - 5 * UUR)).status).toBe(204);
    await run(AVOND - 10 * MIN); // 19:50: a
    // Geen runs van 19:51 tot 20:07 (een uitrol die de cron opnieuw zet, kan tot 15 minuten runs overslaan).
    await runs(8, 40);
    expect(voor('a')).toEqual([-10]);
    expect(voor('b')).toEqual([8]);
    expect(voor('c')).toEqual([12]);
    expect(INHAAL_MINUTEN).toBe(15);
  });

  it('inhaalregel: niet verder terug dan INHAAL_MINUTEN, en niet twee keer als dezelfde minuut twee keer loopt', async () => {
    await eerstEenSignaal();
    expect((await aanmelden(appel('b'), ['20:00'], AVOND - 5 * UUR)).status).toBe(204);
    expect((await aanmelden(appel('c'), ['20:20'], AVOND - 5 * UUR)).status).toBe(204);
    // b: de runs van 20:00 tot 20:16 liepen niet; om 20:17 ligt 20:00 net buiten het venster.
    await runs(INHAAL_MINUTEN + 2, 30);
    expect(voor('b')).toEqual([]);
    // c: de minuut van 20:20 loopt twee keer, en de volgende runs zien ze ook: één signaal.
    await run(AVOND + 20 * MIN);
    await runs(20, 30);
    expect(voor('c')).toEqual([20]);
  });

  it('inhaalregel: een uur dat al voorbij was toen het gekozen werd, komt niet; een uur van deze minuut komt twee minuten later', async () => {
    await eerstEenSignaal();
    expect((await aanmelden(appel('b'), ['21:00'], AVOND - 5 * UUR)).status).toBe(204);
    await runs(0, 10);
    // Om 20:10:20 kiest ze 20:05: voorbij, geen signaal.
    expect((await aanmelden(appel('b'), ['20:05'], AVOND + 10 * MIN + 20 * 1000)).status).toBe(204);
    await runs(11, 12);
    // Om 20:12:30 (na de run van 20:12) kiest ze 20:12: die komt om 20:14.
    expect((await aanmelden(appel('b'), ['20:12'], AVOND + 12 * MIN + 30 * 1000)).status).toBe(204);
    await runs(13, 35);
    expect(voor('b')).toEqual([14]);
  });

  it('inhaalregel: twee gemiste minuten van hetzelfde toestel geven één signaal', async () => {
    await eerstEenSignaal();
    expect((await aanmelden(appel('b'), ['20:00', '20:01'], AVOND - 5 * UUR)).status).toBe(204);
    await runs(3, 20);
    expect(voor('b')).toEqual([3]);
    const v = JSON.parse(await kv.get('v:verstuurd'));
    const kort = (await sleutelVan(appel('b'))).slice(2, 10);
    expect(v.l[String((AVOND - 0) / MIN)]).toContain(kort);
    expect(v.l[String(AVOND / MIN + 1)]).toContain(kort);
  });

  it('inhaalregel: schrijft KV niet meer (dagquotum op), dan alleen de eigen minuut, nooit een reeks dubbele', async () => {
    await eerstEenSignaal();
    expect((await aanmelden(appel('b'), ['20:00'], AVOND - 5 * UUR)).status).toBe(204);
    expect((await aanmelden(appel('c'), ['20:05'], AVOND - 5 * UUR)).status).toBe(204);
    expect((await aanmelden(appel('d'), ['20:08'], AVOND - 5 * UUR)).status).toBe(204);
    const echtePut = kv.put.bind(kv);
    kv.put = async (k, ...rest) => {
      if (k === 'v:verstuurd') throw new Error('KV PUT failed: 429 Too Many Requests');
      return echtePut(k, ...rest);
    };
    await runs(-1, 7); // 20:08 loopt niet
    await runs(9, 30);
    expect(voor('b')).toEqual([0]);
    expect(voor('c')).toEqual([5]);
    // Wat gemist werd terwijl KV niet schreef, wordt niet ingehaald (het zou niet vastgelegd kunnen worden).
    expect(voor('d')).toEqual([]);
  });

  it('inhaalregel: na MAX_VERSTUURD_PER_DAG schrijfopdrachten niets meer inhalen tot middernacht UTC; de eigen minuut blijft', async () => {
    expect((await aanmelden(appel('b'), ['20:00'], AVOND - 5 * UUR)).status).toBe(204);
    expect((await aanmelden(appel('c'), ['20:05'], AVOND - 5 * UUR)).status).toBe(204);
    const minuut = AVOND / MIN;
    kv.data.set('v:verstuurd', { v: JSON.stringify({ b: minuut - 600, d: '2026-11-16', n: MAX_VERSTUURD_PER_DAG, l: {} }), metadata: null, ttl: null });
    const schrijf = kv.tellers.put;
    await runs(1, 20); // 20:00 loopt niet
    expect(voor('b')).toEqual([]);
    expect(voor('c')).toEqual([5]);
    expect(kv.geschreven.slice(-(kv.tellers.put - schrijf)).filter((k) => k === 'v:verstuurd')).toEqual([]);
    // De volgende UTC-dag telt opnieuw: een gemiste minuut wordt weer ingehaald.
    const morgen = AVOND + 24 * 60 * MIN;
    await run(morgen - 30 * MIN); // 19:30: niets te doen, niets geschreven
    await run(morgen + 2 * MIN); // 20:02: de run van 20:00 liep niet; de teller is van gisteren, dus b wordt ingehaald
    expect(voor('b')).toEqual([24 * 60 + 2]);
    await run(morgen + 5 * MIN); // c op zijn minuut
    await run(morgen + 7 * MIN);
    expect(voor('c')).toEqual([5, 24 * 60 + 5]);
    expect(voor('b')).toEqual([24 * 60 + 2]);
    expect(JSON.parse(await kv.get('v:verstuurd'))).toMatchObject({ d: '2026-11-17', n: 2 });
    expect(MAX_VERSTUURD_PER_DAG).toBe(40);
  });

  it('inhaalregel: zolang v:verstuurd niet bestaat (net na de uitrol), haalt de dienst niets in', async () => {
    expect((await aanmelden(appel('b'), ['20:00'], AVOND - 5 * UUR)).status).toBe(204);
    expect((await aanmelden(appel('c'), ['20:05'], AVOND - 5 * UUR)).status).toBe(204);
    await runs(1, 4); // 20:00 loopt niet, v:verstuurd bestaat nog niet
    expect(await kv.get('v:verstuurd')).toBeNull();
    await runs(5, 20);
    expect(voor('b')).toEqual([]);
    expect(voor('c')).toEqual([5]);
    expect(JSON.parse(await kv.get('v:verstuurd')).b).toBe(AVOND / MIN + 5);
  });

  it('gelijktijdige wijzigingen van k:lijst: een verloren aanmelding staat er bij de volgende gelijkzetting weer in, en haar uur wordt ingehaald', async () => {
    await eerstEenSignaal();
    await runs(0, 0);
    // Om 20:01 meldt b zich aan voor 20:05; een gelijktijdige schrijver overschrijft k:lijst met een stand zonder b.
    const zonderB = await kv.get('k:lijst');
    expect((await aanmelden(appel('b'), ['20:05'], AVOND + MIN)).status).toBe(204);
    expect((await leesKLijst()).map(([n]) => n)).toContain(await sleutelVan(appel('b')));
    kv.data.set('k:lijst', { v: zonderB, metadata: null, ttl: null });
    await runs(1, 14);
    expect(voor('b')).toEqual([]);
    // 20:15: de gelijkzetting zet b terug in de lijst, en 20:05 valt binnen het venster van de inhaalregel.
    await runs(15, 30);
    expect(voor('b')).toEqual([15]);
    expect((await leesKLijst()).map(([n]) => n)).toContain(await sleutelVan(appel('b')));
  });

  it('een aanmelding tijdens de gelijkzetting gaat niet verloren', async () => {
    expect((await aanmelden(appel('a'), ['20:30'], AVOND - 5 * UUR)).status).toBe(204);
    await runs(0, 0);
    let gedaan = false;
    // Terwijl de run van 20:30 het signaal van a verstuurt, meldt c zich aan (en schrijft k:lijst).
    vi.stubGlobal('fetch', async () => {
      if (!gedaan) {
        gedaan = true;
        expect((await aanmelden(appel('c'), ['21:00'], AVOND + 30 * MIN + 1000)).status).toBe(204);
      }
      return new Response(null, { status: 201 });
    });
    await run(AVOND + 30 * MIN);
    expect(gedaan).toBe(true);
    const namen = (await leesKLijst()).map(([n]) => n);
    expect(namen).toContain(await sleutelVan(appel('c')));
    expect(namen).toContain(await sleutelVan(appel('a')));
  });

  it('zomer- en wintertijd: een herinnering om 02:30 komt elke nacht precies één keer, ook bij de wissel', async () => {
    const gezien = [];
    vi.stubGlobal('fetch', async () => (gezien.push(huidig), new Response(null, { status: 201 })));
    expect((await aanmelden(appel('nacht'), ['02:30'], Date.parse('2026-10-01T12:00:00Z'))).status).toBe(204);
    const nacht = async (vanIso, uren) => {
      const van = Date.parse(vanIso);
      for (let m = 0; m < uren * 60; m++) await run(van + m * MIN);
    };
    // Overgang naar winteruur (25 oktober 2026): 02:30 bestaat twee keer, het signaal komt de eerste keer (00:30 UTC).
    await nacht('2026-10-24T22:00:00Z', 7);
    expect(gezien).toEqual([Date.parse('2026-10-25T00:30:00Z')]);
    // Een gewone winternacht: 02:30 is 01:30 UTC.
    gezien.length = 0;
    await nacht('2026-11-15T23:00:00Z', 5);
    expect(gezien).toEqual([Date.parse('2026-11-16T01:30:00Z')]);
    // Overgang naar zomeruur (28 maart 2027): 02:30 bestaat niet en komt om 03:00 (01:00 UTC).
    gezien.length = 0;
    await nacht('2027-03-27T23:00:00Z', 5);
    expect(gezien).toEqual([Date.parse('2027-03-28T01:00:00Z')]);
    // Een gewone zomernacht: 02:30 is 00:30 UTC.
    gezien.length = 0;
    await nacht('2027-03-28T22:00:00Z', 5);
    expect(gezien).toEqual([Date.parse('2027-03-29T00:30:00Z')]);
  });

  it('migratie: twee abonnementen van voor 713 (kwartieren, geen v, t:aantal en k:nieuw) werken zonder dat de gebruiker iets doet', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    const uur = Math.floor(AVOND / UUR);
    // De vorm zoals de dienst van 18 november ze bewaarde: een iPhone die al meldingen kreeg (g), en een die nog niet, met een
    // weigering in haar reeks en wijzigingen van vandaag.
    const oud = [
      [appel('iphone'), ['08:15', '20:00'], { u: ['08:15', '20:00'], g: 1 }],
      [appel('ipad'), ['12:30', '20:00'], { u: ['12:30', '20:00'], a: uur - 2, f: 1, ff: uur - 1, d: '2026-11-16', w: 3 }],
    ];
    const namen = [];
    for (const [e, uren, metadata] of oud) {
      const naam = await sleutelVan(e);
      namen.push(naam);
      kv.data.set(naam, { v: JSON.stringify(metAdres(e, uren)), metadata, ttl: null });
    }
    kv.data.set('t:aantal', { v: '2', metadata: null, ttl: null });
    kv.data.set('k:nieuw', { v: JSON.stringify([[namen[1], uur - 2]]), metadata: null, ttl: null });
    kv.data.delete('k:lijst');
    // Een aanmelding voor de eerste run: k:lijst bestaat nog niet. Herstel van 18 november (bevinding 2): geen lijstopvraging, maar
    // 503 'tijdelijk' (de app probeert later opnieuw), en niets geschreven.
    const lijstVoor = kv.tellers.list;
    const putVoor = kv.tellers.put;
    const vol = await aanmelden(appel('nieuw'), ['09:00'], AVOND - 10 * MIN, klein);
    expect([vol.status, await vol.json()]).toEqual([503, { fout: 'tijdelijk' }]);
    expect(kv.tellers.list - lijstVoor).toBe(0);
    expect(kv.tellers.put - putVoor).toBe(0);
    // De eerste run (19:52): bouwt k:lijst met één lijstopvraging, wist t:aantal en k:nieuw, stuurt niets (niet hun minuut).
    await run(AVOND - 8 * MIN, klein);
    expect(ontvangen).toEqual([]);
    expect(await leesKLijst()).toEqual([[namen[0], null], [namen[1], uur - 2]].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
    expect(await kv.get('t:aantal')).toBeNull();
    expect(await kv.get('k:nieuw')).toBeNull();
    // 20:00: beide krijgen hun signaal, één keer.
    await runs(-7, 10, klein);
    expect(ontvangen.map(([n]) => n).sort()).toEqual(['ipad', 'iphone']);
    // De reeks van de iPad is voorbij en ze kreeg haar eerste melding; de tellers van vandaag blijven.
    const m = kv.data.get(namen[1]).metadata;
    expect(m).toMatchObject({ u: ['12:30', '20:00'], g: 1, d: '2026-11-16', w: 3 });
    expect([m.a, m.f, m.ff]).toEqual([undefined, undefined, undefined]);
    // Een oude app stuurt kwartieren: dat blijft gewoon werken.
    expect((await aanmelden(appel('iphone'), ['08:15', '20:15'], AVOND + 10 * MIN, klein)).status).toBe(204);
    await runs(11, 16, klein);
    expect(voor('iphone')).toEqual([0, 15]);
  });
});

describe('rem in KV: zelfde kenmerk als de rem in het geheugen (/64)', () => {
  const env = { REM_ZOUT: 'testzout' };
  const sl = async (ip) => (await import('../../worker/src/index.js')).remSleutel(new Request('https://x.test/', { headers: { 'CF-Connecting-IP': ip } }), env, 1000);
  it('twee IPv6-adressen uit hetzelfde /64-blok delen de rem, twee blokken niet, IPv4 per adres', async () => {
    expect(await sl('2001:db8:1:2::1')).toBe(await sl('2001:db8:1:2:ffff::9'));
    expect(await sl('2001:db8:1:2::1')).not.toBe(await sl('2001:db8:1:3::1'));
    expect(await sl('198.51.100.1')).toBe(await sl('198.51.100.1'));
    expect(await sl('198.51.100.1')).not.toBe(await sl('198.51.100.2'));
    expect(await sl('198.51.100.1')).toMatch(/^r:[0-9a-f]{32}$/);
  });
});
