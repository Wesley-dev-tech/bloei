// Tests voor de herinneringen-Worker. Nepversies van KV en fetch: er gaat geen enkel verzoek naar buiten.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import worker, { verwerk, verstuurHerinneringen, sleutelVan, wisGeheugen, GEHEUGEN } from '../../worker/src/index.js';
import { brusselsUur, urenVanMinuut } from '../../worker/src/tijd.js';
import { importeerSleutel, maakJwt, naarBase64Url, vanBase64Url } from '../../worker/src/vapid.js';
import { gelijkGeheim, isToegelatenEndpoint } from '../../worker/src/valideer.js';

const ORIGIN = 'https://voorbeeld.github.io';
const ENDPOINT = 'https://web.push.apple.com/QAbCdEf123';
const SLEUTELS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

function testSleutels() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publiek = naarBase64Url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  return { prive: jwk.d, publiek };
}

// opslag: de abonnementen (sleutels 'a:...'); overig: de rest (de telling 't:aantal'), apart zodat de tests de abonnementen tellen.
// tellers: hoeveel lijstopvragingen en schrijfopdrachten er waren (het gratis abonnement van KV laat er elk 1000 per dag toe).
class NepKv {
  constructor() {
    this.opslag = new Map();
    this.overig = new Map();
    this.tellers = { list: 0, put: 0 };
  }
  kaart(k) {
    return k.startsWith('a:') ? this.opslag : this.overig;
  }
  wis() {
    this.opslag.clear();
    this.overig.clear();
    this.overig.set('k:lijst', { v: '[]', metadata: null });
  }
  async put(k, v, opties = {}) {
    this.tellers.put++;
    this.kaart(k).set(k, { v, metadata: opties.metadata ?? null });
  }
  async get(k, type) {
    const r = this.kaart(k).get(k);
    if (!r) return null;
    return type === 'json' ? JSON.parse(r.v) : r.v;
  }
  async getWithMetadata(k) {
    const r = this.kaart(k).get(k);
    return r ? { value: r.v, metadata: r.metadata } : { value: null, metadata: null };
  }
  async delete(k) {
    this.kaart(k).delete(k);
  }
  async list({ prefix = '' } = {}) {
    this.tellers.list++;
    const keys = [...this.opslag, ...this.overig].filter(([k]) => k.startsWith(prefix)).map(([name, r]) => ({ name, metadata: r.metadata }));
    return { keys, list_complete: true };
  }
}

let env;
let kv;
let sleutels;
beforeEach(() => {
  kv = new NepKv();
  sleutels = testSleutels();
  env = { ABONNEMENTEN: kv, TOEGELATEN_ORIGIN: ORIGIN, VAPID_PRIVE: sleutels.prive, VAPID_PUBLIEK: sleutels.publiek, VAPID_ONDERWERP: 'mailto:test@example.invalid' };
  // Een dienst die al draait: k:lijst bestaat (een aanmelding zonder k:lijst krijgt 503, zie worker-herstel.test.js). De rem in het
  // geheugen speelt in deze tests niet mee (zie worker-herstel.test.js); elke test een verse isolate.
  kv.overig.set('k:lijst', { v: '[]', metadata: null });
  wisGeheugen();
  Object.assign(GEHEUGEN, { perMinuut: Infinity, perUur: Infinity, volMs: 0 });
});
afterEach(() => vi.unstubAllGlobals());

const lichaam = (extra = {}) => ({
  abonnement: { endpoint: ENDPOINT, keys: SLEUTELS },
  uren: ['11:00', '20:00'],
  ...extra,
});
// Elk verzoek van een ander IP: de rem per IP (REM_PER_UUR, getest in worker-owasp.test.js) speelt in deze tests niet mee.
let ipNr = 0;
const verzoek = (methode, body, origin = ORIGIN, pad = '/abonnement') =>
  new Request('https://worker.example.invalid' + pad, {
    method: methode,
    headers: origin ? { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${ipNr++ % 250}` } : {},
    body: body === undefined || methode === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('JWT en VAPID', () => {
  it('is een geldige ES256-JWT, controleerbaar met de publieke sleutel', async () => {
    const sleutel = await importeerSleutel(sleutels.prive, sleutels.publiek);
    const nu = Date.UTC(2026, 10, 15, 12, 0, 0);
    const jwt = await maakJwt(sleutel, { endpoint: ENDPOINT, onderwerp: 'mailto:test@example.invalid', nu });
    const [kop, claims, handtekening] = jwt.split('.');
    expect(JSON.parse(Buffer.from(kop, 'base64url'))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const c = JSON.parse(Buffer.from(claims, 'base64url'));
    expect(c.aud).toBe('https://web.push.apple.com');
    expect(c.sub).toBe('mailto:test@example.invalid');
    expect(c.exp - nu / 1000).toBeLessThanOrEqual(12 * 3600);
    expect(c.exp).toBeGreaterThan(nu / 1000);
    const publiek = await webcrypto.subtle.importKey('raw', vanBase64Url(sleutels.publiek), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const bytes = vanBase64Url(handtekening);
    expect(bytes.length).toBe(64);
    expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publiek, bytes, new TextEncoder().encode(`${kop}.${claims}`))).toBe(true);
    expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publiek, bytes, new TextEncoder().encode(`${kop}.${claims}x`))).toBe(false);
  });
});

// BESLISSING 713: per minuut, niet meer afgerond op het kwartier (tot 18 november: brusselsKwartier).
const minuutVan = (iso) => Date.parse(iso) / 60000;
describe('uur in Brussel', () => {
  it('rekent zomertijd (UTC+2) en wintertijd (UTC+1), per minuut', () => {
    expect(brusselsUur(new Date('2026-07-15T06:07:00Z'))).toBe('08:07');
    expect(brusselsUur(new Date('2026-11-16T07:44:59Z'))).toBe('08:44');
    expect(brusselsUur(new Date('2026-11-15T22:59:00Z'))).toBe('23:59');
    expect(urenVanMinuut(minuutVan('2026-11-16T07:44:00Z'))).toEqual(['08:44']);
  });
  it('klopt rond de overgang van zomer- naar wintertijd (25 oktober 2026): het dubbele uur geeft één keer een uur', () => {
    expect(brusselsUur(new Date('2026-10-24T22:30:00Z'))).toBe('00:30'); // CEST
    expect(brusselsUur(new Date('2026-10-25T00:30:00Z'))).toBe('02:30'); // nog CEST
    expect(brusselsUur(new Date('2026-10-25T01:30:00Z'))).toBe('02:30'); // CET: hetzelfde uur nog eens
    expect(brusselsUur(new Date('2026-10-25T02:00:00Z'))).toBe('03:00');
    expect(brusselsUur(new Date('2026-10-24T18:00:00Z'))).toBe('20:00'); // zomer
    expect(brusselsUur(new Date('2026-10-26T19:00:00Z'))).toBe('20:00'); // winter
    // De eerste keer 02:00 tot 02:59 (CEST) hoort er een uur bij, de tweede keer (CET) niet: een herinnering om 02:30 komt één keer.
    expect(urenVanMinuut(minuutVan('2026-10-25T00:00:00Z'))).toEqual(['02:00']);
    expect(urenVanMinuut(minuutVan('2026-10-25T00:30:00Z'))).toEqual(['02:30']);
    expect(urenVanMinuut(minuutVan('2026-10-25T00:59:00Z'))).toEqual(['02:59']);
    for (let m = 0; m < 60; m++) expect(urenVanMinuut(minuutVan('2026-10-25T01:00:00Z') + m), String(m)).toEqual([]);
    expect(urenVanMinuut(minuutVan('2026-10-25T02:00:00Z'))).toEqual(['03:00']);
    // Over de hele nacht: elk uur van 00:00 tot 05:59 precies één keer.
    const gezien = [];
    for (let m = minuutVan('2026-10-24T22:00:00Z'); m < minuutVan('2026-10-25T05:00:00Z'); m++) gezien.push(...urenVanMinuut(m));
    expect(gezien).toHaveLength(6 * 60);
    expect(new Set(gezien).size).toBe(6 * 60);
  });
  it('de lente-overgang (29 maart 2026) slaat 02:00 tot 02:59 over: die uren horen bij de minuut van 03:00', () => {
    expect(brusselsUur(new Date('2026-03-29T00:45:00Z'))).toBe('01:45');
    expect(brusselsUur(new Date('2026-03-29T01:00:00Z'))).toBe('03:00');
    expect(urenVanMinuut(minuutVan('2026-03-29T00:59:00Z'))).toEqual(['01:59']);
    const om3 = urenVanMinuut(minuutVan('2026-03-29T01:00:00Z'));
    expect(om3).toHaveLength(61);
    expect(om3[0]).toBe('02:00');
    expect(om3).toContain('02:30');
    expect(om3.at(-1)).toBe('03:00');
    expect(urenVanMinuut(minuutVan('2026-03-29T01:01:00Z'))).toEqual(['03:01']);
    // Over de hele nacht: elk uur van 00:00 tot 05:59 precies één keer, ook de overgeslagen.
    const gezien = [];
    for (let m = minuutVan('2026-03-28T23:00:00Z'); m < minuutVan('2026-03-29T04:00:00Z'); m++) gezien.push(...urenVanMinuut(m));
    expect(gezien).toHaveLength(6 * 60);
    expect(new Set(gezien).size).toBe(6 * 60);
  });
  it('over een hele gewone dag: elke minuut precies één uur, in volgorde', () => {
    const gezien = [];
    for (let m = minuutVan('2026-11-15T23:00:00Z'); m < minuutVan('2026-11-16T23:00:00Z'); m++) gezien.push(...urenVanMinuut(m));
    expect(gezien).toHaveLength(1440);
    expect(gezien[0]).toBe('00:00');
    expect(gezien[1439]).toBe('23:59');
    expect([...gezien].sort()).toEqual(gezien);
  });
});

describe('abonnementen bewaren en wissen', () => {
  it('bewaart alleen de toegelaten velden, onder een hash van het endpoint', async () => {
    const r = await verwerk(
      verzoek('POST', lichaam({ naam: 'Testnaam', maaltijden: ['soep'], gewicht: 70, ip: '1.2.3.4', soort: 'drinken', weegdag: { aan: true, dag: 1 }, uren: ['20:00', '11:00', '20:00'] })),
      env,
    );
    expect(r.status).toBe(204);
    expect([...kv.opslag.keys()]).toEqual([await sleutelVan(ENDPOINT)]);
    const bewaard = JSON.parse([...kv.opslag.values()][0].v);
    // gesorteerd, zonder dubbels, zonder enig ander veld
    expect(bewaard).toEqual({ abonnement: { endpoint: ENDPOINT, keys: SLEUTELS }, uren: ['11:00', '20:00'] });
    // Naast de uren alleen het uur van aanmelding, als heel uur (BESLISSING 630), en de minuut van de aanmelding (v, voor de
    // inhaalregel van BESLISSING 713): geen seconden.
    const meta = [...kv.opslag.values()][0].metadata;
    expect(meta).toEqual({ u: ['11:00', '20:00'], a: expect.any(Number), v: expect.any(Number) });
    expect(Number.isInteger(meta.a)).toBe(true);
    expect(Math.abs(meta.a - Date.now() / 3600000)).toBeLessThan(2);
    expect(Number.isInteger(meta.v)).toBe(true);
    expect(Math.abs(meta.v - Date.now() / 60000)).toBeLessThan(2);
    expect(JSON.stringify([...kv.opslag.values()])).not.toMatch(/Testnaam|soep|geheim|1\.2\.3\.4/);
    expect([...kv.opslag.keys()][0]).not.toContain('apple');
  });
  it('twee toestellen (iPhone en iPad) staan naast elkaar, elk met eigen uren', async () => {
    await verwerk(verzoek('POST', lichaam()), env);
    await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: 'https://web.push.apple.com/ander', keys: SLEUTELS }, uren: ['09:00'] })), env);
    expect(kv.opslag.size).toBe(2);
  });
  it('een nieuwe POST vervangt de oude lijst: het oude kwartier verdwijnt', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['11:00', '20:00'] })), env);
    await verwerk(verzoek('POST', lichaam({ uren: ['11:15', '20:00'] })), env);
    expect(kv.opslag.size).toBe(1);
    expect(JSON.parse([...kv.opslag.values()][0].v).uren).toEqual(['11:15', '20:00']);
  });
  it('DELETE wist het abonnement', async () => {
    await verwerk(verzoek('POST', lichaam()), env);
    expect((await verwerk(verzoek('DELETE', { endpoint: ENDPOINT, auth: SLEUTELS.auth }), env)).status).toBe(204);
    expect(kv.opslag.size).toBe(0);
  });
});

describe('beveiliging', () => {
  it('weigert een vreemde of ontbrekende origin, ook bij OPTIONS', async () => {
    for (const origin of ['https://kwaad.example', null]) {
      for (const m of ['POST', 'DELETE', 'OPTIONS']) expect((await verwerk(verzoek(m, lichaam(), origin), env)).status).toBe(403);
    }
    expect(kv.opslag.size).toBe(0);
  });
  it('geeft CORS alleen voor de toegelaten origin', async () => {
    const r = await verwerk(verzoek('OPTIONS', undefined), env);
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
  it('weigert andere methoden en andere paden', async () => {
    expect((await verwerk(verzoek('GET', undefined), env)).status).toBe(405);
    expect((await verwerk(verzoek('PUT', lichaam()), env)).status).toBe(405);
    expect((await verwerk(verzoek('POST', lichaam(), ORIGIN, '/ander'), env)).status).toBe(404);
  });
  it('weigert endpoints buiten de toegelaten pushdiensten', async () => {
    for (const endpoint of ['https://kwaad.example/x', 'http://web.push.apple.com/x', 'https://web.push.apple.com.kwaad.example/x', 'https://127.0.0.1/x', 'https://a:b@web.push.apple.com/x', 'https://web.push.apple.com:8443/x', 'javascript:alert(1)']) {
      expect(isToegelatenEndpoint(endpoint), endpoint).toBe(false);
    }
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: 'https://kwaad.example/x', keys: SLEUTELS } })), env)).status).toBe(400);
    expect((await verwerk(verzoek('DELETE', { endpoint: 'https://kwaad.example/x' }), env)).status).toBe(400);
    for (const ok of ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://wns2-par02p.notify.windows.com/w/?token=a', 'https://web.push.apple.com/a']) {
      expect(isToegelatenEndpoint(ok), ok).toBe(true);
    }
  });
  it('geeft varianten van hetzelfde endpoint (hoofdletters in de host, fragment) geen eigen plaats (OWASP-scan punt 3)', async () => {
    const varianten = ['https://WEB.push.apple.com/QAbCdEf123', 'https://web.push.apple.com/QAbCdEf123#x', 'https://Web.Push.Apple.Com/QAbCdEf123#'];
    for (const v of varianten) expect(await sleutelVan(v), v).toBe(await sleutelVan(ENDPOINT));
    // De query van Windows (WNS) blijft deel van het adres: een ander token is een ander toestel.
    expect(await sleutelVan('https://wns2-par02p.notify.windows.com/w/?token=a')).not.toBe(await sleutelVan('https://wns2-par02p.notify.windows.com/w/?token=b'));
    expect((await verwerk(verzoek('POST', lichaam()), env)).status).toBe(204);
    // Een variant met een eigen auth en eigen uren: zelfde antwoord, maar geen tweede abonnement en het eerste blijft ongewijzigd.
    const ander = { p256dh: 'C'.repeat(87), auth: 'b'.repeat(22) };
    for (const v of varianten) {
      expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: v, keys: ander }, uren: ['03:00'] })), env)).status).toBe(204);
    }
    expect([...kv.opslag.keys()]).toEqual([await sleutelVan(ENDPOINT)]);
    expect(JSON.parse([...kv.opslag.values()][0].v)).toEqual({ abonnement: { endpoint: ENDPOINT, keys: SLEUTELS }, uren: ['11:00', '20:00'] });
    // Een nieuw abonnement onder een variant wordt in de vaste vorm bewaard.
    kv.wis();
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: 'https://WEB.push.apple.com/QAbCdEf123#x', keys: SLEUTELS } })), env)).status).toBe(204);
    expect(JSON.parse([...kv.opslag.values()][0].v).abonnement.endpoint).toBe(ENDPOINT);
    // Afmelden lukt met het adres zoals het toestel het stuurt, ook als dat een variant is.
    expect((await verwerk(verzoek('DELETE', { endpoint: 'https://WEB.push.apple.com/QAbCdEf123#x', auth: SLEUTELS.auth }), env)).status).toBe(204);
    expect(kv.opslag.size).toBe(0);
  });
  it('een adres dat in de vaste vorm te lang wordt, wordt geweigerd en bezet geen plaats die het signaal overslaat', async () => {
    // 436 tekens, maar URL maakt van elke e een %C3%A9: de vaste vorm is 2436 tekens, boven de grens van isToegelatenEndpoint.
    const lang = 'https://fcm.googleapis.com/fcm/send/' + 'é'.repeat(400);
    expect(isToegelatenEndpoint(lang)).toBe(true);
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: lang, keys: SLEUTELS } })), env)).status).toBe(400);
    expect(kv.opslag.size).toBe(0);
  });
  it('weigert ongeldige uren, dagen en te grote of kapotte bodies', async () => {
    // BESLISSING 713: '20:07' is nu een geldig uur (per minuut); ongeldig blijven een minuut boven 59, een uur boven 23 en een
    // andere schrijfwijze.
    for (const slecht of [
      lichaam({ uren: ['20:60'] }),
      lichaam({ uren: ['24:00'] }),
      lichaam({ uren: ['7:05'] }),
      lichaam({ uren: ['20:7'] }),
      lichaam({ uren: ['20:07:00'] }),
      lichaam({ uren: ['20h07'] }),
      lichaam({ uren: [' 20:07'] }),
      lichaam({ uren: ['25:00'] }),
      lichaam({ uren: [] }),
      lichaam({ uren: 'ja' }),
      lichaam({ uren: [20] }),
      lichaam({ uren: undefined }),
      lichaam({ uren: Array.from({ length: 13 }, (_, i) => `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`) }), // 13 > 12
      lichaam({ abonnement: { endpoint: ENDPOINT, keys: { p256dh: '!', auth: 'a'.repeat(22) } } }),
    ]) {
      expect((await verwerk(verzoek('POST', slecht), env)).status).toBe(400);
    }
    expect((await verwerk(verzoek('POST', '{kapot'), env)).status).toBe(400);
    expect((await verwerk(verzoek('POST', lichaam({ naam: 'x'.repeat(6000) })), env)).status).toBe(413);
    // precies 12 uren mag wel
    const twaalf = Array.from({ length: 12 }, (_, i) => `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`);
    expect((await verwerk(verzoek('POST', lichaam({ uren: twaalf })), env)).status).toBe(204);
    kv.wis();
    expect(kv.opslag.size).toBe(0);
  });
  it('BESLISSING 713: elke minuut van 00:00 tot 23:59 is een geldig uur; de kwartieren van een oude app blijven geldig', async () => {
    for (const uren of [['00:00'], ['23:59'], ['20:07', '08:01', '13:59'], ['11:00', '20:00'], ['08:15', '12:30', '18:45']]) {
      kv.wis();
      expect((await verwerk(verzoek('POST', lichaam({ uren })), env)).status, uren.join()).toBe(204);
      expect(JSON.parse([...kv.opslag.values()][0].v).uren).toEqual([...uren].sort());
      expect([...kv.opslag.values()][0].metadata.u).toEqual([...uren].sort());
    }
    // Twaalf verschillende minuten mogen, dertien niet.
    const minuten = (n) => Array.from({ length: n }, (_, i) => `09:${String(i * 4 + 1).padStart(2, '0')}`);
    kv.wis();
    expect((await verwerk(verzoek('POST', lichaam({ uren: minuten(12) })), env)).status).toBe(204);
    kv.wis();
    expect((await verwerk(verzoek('POST', lichaam({ uren: minuten(13) })), env)).status).toBe(400);
  });
  it('foutantwoorden bevatten alleen een code', async () => {
    expect(await (await verwerk(verzoek('POST', '{kapot'), env)).json()).toEqual({ fout: 'ongeldig' });
  });
});

describe('scheduled', () => {
  let aanroepen;
  beforeEach(() => {
    aanroepen = [];
    vi.stubGlobal('fetch', async (url, opties) => {
      aanroepen.push({ url, opties });
      return new Response(null, { status: 201 });
    });
  });

  it('stuurt alleen naar abonnementen met een passend uur, leeg en met VAPID', async () => {
    await verwerk(verzoek('POST', lichaam()), env);
    await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: 'https://fcm.googleapis.com/fcm/send/ander', keys: SLEUTELS }, uren: ['21:00', '08:15'] })), env);
    // BESLISSING 713: om 20:03 krijgt een uur van 20:00 niets meer (vroeger rondde de dienst af op het kwartier).
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T19:03:00Z'))).toEqual([]);
    // maandag 16 november 2026, 20:00 in Brussel (19:00 UTC, wintertijd)
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T19:00:00Z'))).toEqual([201]);
    expect(aanroepen).toHaveLength(1);
    const { url, opties } = aanroepen[0];
    expect(url).toBe(ENDPOINT);
    expect(opties.method).toBe('POST');
    expect(opties.body).toBeUndefined();
    expect(opties.headers.TTL).toBe('3600');
    expect(opties.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${sleutels.publiek}$`));
  });
  it('een kwartier dat niet in de lijst staat, krijgt geen signaal', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['11:00'] })), env);
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T19:00:00Z'))).toEqual([]); // 20:00
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T10:15:00Z'))).toEqual([]); // 11:15
  });
  it('elke dag dezelfde uren: er is geen weegdag meer', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['08:15'] })), env);
    // BESLISSING 713: op de minuut zelf (vroeger 07:16 UTC, afgerond op het kwartier).
    for (const dag of ['2026-11-16', '2026-11-17', '2026-11-21']) expect(await verstuurHerinneringen(env, new Date(`${dag}T07:15:00Z`))).toEqual([201]);
  });
  it('een uur wijzigen: het oude kwartier krijgt niets meer, het nieuwe wel', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['11:00'] })), env);
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T10:00:00Z'))).toEqual([201]);
    await verwerk(verzoek('POST', lichaam({ uren: ['11:30'] })), env);
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T10:00:00Z'))).toEqual([]);
    expect(await verstuurHerinneringen(env, new Date('2026-11-16T10:30:00Z'))).toEqual([201]);
  });
  it('een uur blijft in zomer en winter hetzelfde uur in Brussel', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
    expect(await verstuurHerinneringen(env, new Date('2026-07-15T18:00:00Z'))).toEqual([201]);
    expect(await verstuurHerinneringen(env, new Date('2026-12-15T19:00:00Z'))).toEqual([201]);
    expect(await verstuurHerinneringen(env, new Date('2026-12-15T18:00:00Z'))).toEqual([]);
  });
  it('wist het abonnement bij 410 en 404, maar niet bij andere fouten', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }));
    await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
    await verstuurHerinneringen(env, new Date('2026-11-16T19:00:00Z'));
    expect(kv.opslag.size).toBe(1);
    // Elke keer een andere dag: dezelfde minuut nog eens lopen geeft geen tweede signaal (BESLISSING 713, v:verstuurd).
    for (const [status, dag] of [[410, 17], [404, 18]]) {
      await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
      vi.stubGlobal('fetch', async () => new Response(null, { status }));
      await verstuurHerinneringen(env, new Date(`2026-11-${dag}T19:00:00Z`));
      expect(kv.opslag.size).toBe(0);
    }
  });
  it('de scheduled-ingang gebruikt de geplande tijd', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
    const wachten = [];
    worker.scheduled({ scheduledTime: Date.parse('2026-11-16T19:00:00Z') }, env, { waitUntil: (p) => wachten.push(p) });
    await Promise.all(wachten);
    expect(aanroepen).toHaveLength(1);
  });
});

// Controle op beveiliging en privacy (BESLISSING 329): de Origin-kop is buiten een browser te vervalsen, dus de dienst moet ook
// zonder die controle niets kunnen lekken en niet vol te schrijven zijn.
describe('beveiliging: ook met een vervalste Origin', () => {
  it('weigert endpoints die op een pushdienst lijken maar het niet zijn', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com.kwaad.example/x',
      'https://kwaadfcm.googleapis.com/x',
      'https://push.apple.com/x',
      'https://fcm.googleapis.com./x',
      'https://web.push.apple.com./x',
      'https://web.push.apple.com@kwaad.example/x',
      'https://kwaad.example/web.push.apple.com',
      'https://kwaad.example?.push.apple.com',
      'https://kwaad.example#.push.apple.com',
      String.raw`https://kwaad.example\.push.apple.com`, // een backslash is voor de URL-lezer een slash: de host is kwaad.example
      'https://[::1]/x',
      'https://10.0.0.1/x',
      'file:///etc/passwd',
      'wss://web.push.apple.com/x',
      'https://web.push.apple.com/' + 'a'.repeat(1100),
      '',
      null,
      42,
      { toString: () => 'https://web.push.apple.com/x' },
    ]) {
      expect(isToegelatenEndpoint(endpoint), String(endpoint)).toBe(false);
    }
    // Hoofdletters en de standaardpoort zijn hetzelfde adres en dus goed.
    expect(isToegelatenEndpoint('https://WEB.PUSH.APPLE.COM/x')).toBe(true);
    expect(isToegelatenEndpoint('https://fcm.googleapis.com:443/fcm/send/x')).toBe(true);
  });

  it('een te groot lichaam zonder Content-Length wordt geweigerd zonder het helemaal in te lezen', async () => {
    let gelezen = 0;
    const stroom = new ReadableStream({
      pull(c) {
        gelezen += 1024;
        if (gelezen > 1024 * 1024) c.close();
        else c.enqueue(new Uint8Array(1024).fill(65));
      },
    });
    const r = await verwerk(new Request('https://worker.example.invalid/abonnement', { method: 'POST', headers: { Origin: ORIGIN }, body: stroom, duplex: 'half' }), env);
    expect(r.status).toBe(413);
    expect(gelezen).toBeLessThan(16 * 1024);
    expect(kv.opslag.size).toBe(0);
  });

  it('de dienst kan niet worden volgeschreven: hoogstens MAX_ABONNEMENTEN toestellen; een bestaand toestel bijwerken en wissen blijft kunnen', async () => {
    const ep = (i) => `https://fcm.googleapis.com/fcm/send/toestel${i}`;
    for (let i = 0; i < 10; i++) expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(i), keys: SLEUTELS } })), env)).status).toBe(204);
    const vol = await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(10), keys: SLEUTELS } })), env);
    expect(vol.status).toBe(429);
    expect(await vol.json()).toEqual({ fout: 'vol' });
    expect(kv.opslag.size).toBe(10);
    // Een bestaand toestel mag zijn uren nog wijzigen.
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(3), keys: SLEUTELS }, uren: ['07:00'] })), env)).status).toBe(204);
    // Na een DELETE is er weer plaats.
    await verwerk(verzoek('DELETE', { endpoint: ep(0), auth: SLEUTELS.auth }), env);
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(10), keys: SLEUTELS } })), env)).status).toBe(204);
    // De grens is in te stellen.
    kv.wis();
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    for (let i = 0; i < 2; i++) await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(i), keys: SLEUTELS } })), klein);
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(2), keys: SLEUTELS } })), klein)).status).toBe(429);
  });

  it('andermans abonnement overschrijven of wissen kan alleen met het volledige push-adres', async () => {
    await verwerk(verzoek('POST', lichaam()), env);
    const voor = JSON.stringify([...kv.opslag]);
    for (const ander of [ENDPOINT + 'x', ENDPOINT.slice(0, -1), ENDPOINT.toUpperCase(), ENDPOINT + '/', ENDPOINT + '?']) {
      await verwerk(verzoek('DELETE', { endpoint: ander, auth: SLEUTELS.auth }), env);
    }
    expect(JSON.stringify([...kv.opslag])).toBe(voor);
    // De sleutel in de opslag is een hash: wie de lijst ziet, kent het adres niet.
    expect([...kv.opslag.keys()][0]).toMatch(/^a:[0-9a-f]{64}$/);
  });

  it('met het juiste endpoint maar een fout of ontbrekend auth-geheim: niets gewist, niets overschreven, en hetzelfde antwoord als bij een onbekend abonnement', async () => {
    await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
    const voor = JSON.stringify([...kv.opslag]);
    const onbekend = 'https://web.push.apple.com/onbekend';
    const ANDER = 'b'.repeat(22);
    for (const auth of [undefined, null, '', ANDER, SLEUTELS.auth + 'x', SLEUTELS.auth.slice(1), 42, { a: 1 }, '!'.repeat(22)]) {
      const r = await verwerk(verzoek('DELETE', { endpoint: ENDPOINT, auth }), env);
      const ref = await verwerk(verzoek('DELETE', { endpoint: onbekend, auth }), env);
      expect([r.status, await r.text()], String(auth)).toEqual([ref.status, await ref.text()]);
    }
    // Overschrijven met dezelfde endpoint en een ander geheim: 204 zoals voor een nieuw abonnement, maar de uren blijven.
    const r = await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ENDPOINT, keys: { p256dh: SLEUTELS.p256dh, auth: ANDER } }, uren: ['03:00'] })), env);
    expect(r.status).toBe(204);
    expect(JSON.stringify([...kv.opslag])).toBe(voor);
    // Met het juiste geheim lukt bijwerken en wissen wel.
    await verwerk(verzoek('POST', lichaam({ uren: ['21:00'] })), env);
    expect(JSON.parse([...kv.opslag.values()][0].v).uren).toEqual(['21:00']);
    await verwerk(verzoek('DELETE', { endpoint: ENDPOINT, auth: SLEUTELS.auth }), env);
    expect(kv.opslag.size).toBe(0);
  });

  it('bij een volle dienst krijgt een vreemd geheim op een bestaand endpoint hetzelfde 429 als een nieuw abonnement', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '1' };
    await verwerk(verzoek('POST', lichaam()), klein);
    const vreemd = await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ENDPOINT, keys: { p256dh: SLEUTELS.p256dh, auth: 'c'.repeat(22) } } })), klein);
    const nieuw = await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: 'https://web.push.apple.com/nieuw', keys: SLEUTELS } })), klein);
    expect([vreemd.status, await vreemd.text()]).toEqual([nieuw.status, await nieuw.text()]);
    expect(vreemd.status).toBe(429);
    // Het eigen toestel mag nog bijwerken.
    expect((await verwerk(verzoek('POST', lichaam({ uren: ['06:00'] })), klein)).status).toBe(204);
  });

  it('een kapotte bewaarde waarde mag door een nieuwe aanmelding vervangen worden', async () => {
    kv.opslag.set(await sleutelVan(ENDPOINT), { v: '{kapot', metadata: { u: ['20:00'] } });
    expect((await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env)).status).toBe(204);
    expect(JSON.parse([...kv.opslag.values()][0].v).abonnement.keys).toEqual(SLEUTELS);
  });

  it('gelijkGeheim vergelijkt exact en weigert ontbrekende of ongeldige waarden', () => {
    expect(gelijkGeheim(SLEUTELS.auth, SLEUTELS.auth)).toBe(true);
    for (const [a, b] of [[SLEUTELS.auth, SLEUTELS.auth + 'a'], [SLEUTELS.auth, 'b'.repeat(22)], [undefined, undefined], ['', ''], [null, null], ['!'.repeat(22), '!'.repeat(22)]]) {
      expect(gelijkGeheim(a, b), `${a} ${b}`).toBe(false);
    }
  });

  it('een signaal volgt geen omleiding en draagt geen inhoud', async () => {
    const aanroepen = [];
    vi.stubGlobal('fetch', async (url, opties) => {
      aanroepen.push({ url, opties });
      return new Response(null, { status: 201 });
    });
    await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
    await verstuurHerinneringen(env, new Date('2026-11-16T19:00:00Z'));
    expect(aanroepen).toHaveLength(1);
    expect(aanroepen[0].opties.redirect).toBe('manual');
    expect(aanroepen[0].opties.body).toBeUndefined();
    expect(aanroepen[0].opties.headers['Content-Length']).toBe('0');
    expect(JSON.stringify(aanroepen[0].opties.headers)).not.toMatch(/Content-Encoding|Crypto-Key|Encryption/i);
  });

  it('één kapot abonnement in de opslag houdt de andere niet tegen', async () => {
    const aanroepen = [];
    vi.stubGlobal('fetch', async (url) => {
      aanroepen.push(url);
      return new Response(null, { status: 201 });
    });
    await verwerk(verzoek('POST', lichaam({ uren: ['20:00'] })), env);
    // Een rij met kapotte JSON en een rij met een vreemd adres, beide met hetzelfde kwartier.
    kv.opslag.set('a:00kapot', { v: '{kapot', metadata: { u: ['20:00'] } });
    kv.opslag.set('a:01vreemd', { v: JSON.stringify({ abonnement: { endpoint: 'https://kwaad.example/x', keys: SLEUTELS }, uren: ['20:00'] }), metadata: { u: ['20:00'] } });
    const uit = await verstuurHerinneringen(env, new Date('2026-11-16T19:00:00Z'));
    expect(aanroepen).toEqual([ENDPOINT]);
    expect(uit).toContain(201);
  });

  it('wrangler.toml zet de Workers Logs uit en bevat geen echte sleutel of e-mailadres', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/\[observability\]\s*\nenabled = false/);
    expect(toml).not.toMatch(/VAPID_PRIVE\s*=/);
    expect(toml).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});

// Controle van 16 november: de dagelijkse grenzen van het gratis abonnement (KV: 1000 lijstopvragingen en 1000 schrijfopdrachten
// per dag). Het signaal per kwartier heeft 96 lijstopvragingen per dag nodig; een aanvaller met een vervalste Origin mag die
// voorraad niet kunnen opmaken met aanmeldingen, anders komt er die dag geen enkele herinnering meer.
describe('beveiliging: de dagelijkse grenzen van KV', () => {
  const ep = (i) => `https://fcm.googleapis.com/fcm/send/toestel${i}`;

  it('een stroom nieuwe aanmeldingen op een volle dienst doet geen lijstopvragingen', async () => {
    for (let i = 0; i < 10; i++) await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(i), keys: SLEUTELS } })), env);
    const voor = kv.tellers.list;
    for (let i = 10; i < 60; i++) {
      expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(i), keys: SLEUTELS } })), env)).status).toBe(429);
    }
    expect(kv.tellers.list - voor).toBe(0);
    expect(kv.opslag.size).toBe(10);
    // Ook het opvullen zelf kost hoogstens één lijstopvraging (de eerste telling na het uitrollen).
    expect(voor).toBeLessThanOrEqual(1);
  });

  it('dezelfde aanmelding nog eens sturen schrijft niets', async () => {
    await verwerk(verzoek('POST', lichaam()), env);
    const voor = kv.tellers.put;
    for (let i = 0; i < 20; i++) expect((await verwerk(verzoek('POST', lichaam()), env)).status).toBe(204);
    expect(kv.tellers.put).toBe(voor);
    // Een echte wijziging wordt wel bewaard.
    await verwerk(verzoek('POST', lichaam({ uren: ['07:30'] })), env);
    expect(JSON.parse([...kv.opslag.values()][0].v).uren).toEqual(['07:30']);
  });

  // BESLISSING 713: het aantal is de lengte van k:lijst (vroeger de telling t:aantal).
  const aantalInLijst = async () => JSON.parse(await kv.get('k:lijst')).length;
  it('de gelijkzetting per kwartier zet de lijst gelijk: na een 410 is er weer plaats', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '2' };
    await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(0), keys: SLEUTELS }, uren: ['20:00'] })), klein);
    await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(1), keys: SLEUTELS }, uren: ['09:00'] })), klein);
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(2), keys: SLEUTELS } })), klein)).status).toBe(429);
    vi.stubGlobal('fetch', async () => new Response(null, { status: 410 }));
    await verstuurHerinneringen(klein, new Date('2026-11-16T19:00:00Z'));
    expect(kv.opslag.size).toBe(1);
    expect(await aantalInLijst()).toBe(1);
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(2), keys: SLEUTELS } })), klein)).status).toBe(204);
    // Een lijst die afwijkt (bv. na een wissing in het dashboard) wordt bij het volgende kwartier rechtgezet.
    await kv.put('k:lijst', JSON.stringify(Array.from({ length: 99 }, (_, i) => [`a:${String(i).padStart(64, '0')}`, null])));
    await verstuurHerinneringen(klein, new Date('2026-11-16T03:00:00Z'));
    expect(await aantalInLijst()).toBe(2);
  });

  it('afmelden maakt meteen een plaats vrij', async () => {
    const klein = { ...env, MAX_ABONNEMENTEN: '1' };
    await verwerk(verzoek('POST', lichaam()), klein);
    await verwerk(verzoek('DELETE', { endpoint: ENDPOINT, auth: SLEUTELS.auth }), klein);
    expect((await verwerk(verzoek('POST', lichaam({ abonnement: { endpoint: ep(5), keys: SLEUTELS } })), klein)).status).toBe(204);
  });

  it('wrangler.toml: geen Version/Preview URLs (die draaien ook oude versies), geen routes, een geldig VAPID-onderwerp', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/^preview_urls = false$/m);
    expect(toml).toMatch(/^workers_dev = true$/m);
    expect(toml).not.toMatch(/^\s*(\[\[routes\]\]|routes\s*=|route\s*=)/m);
    expect(toml).toMatch(/^VAPID_ONDERWERP = "(https:\/\/[^"\s]+|mailto:[^"\s]+@[^"\s]+)"$/m);
  });

  it('wrangler.toml: de cron loopt elke minuut (BESLISSING 713), en er is er maar één', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/^crons = \["\* \* \* \* \*"\]$/m);
    expect(toml.match(/^crons\s*=/gm)).toHaveLength(1);
  });

  it('een fout van de opslag geeft een kale 503 zonder details', async () => {
    kv.get = async () => {
      throw new Error('KV GET failed: 429 Too Many Requests (interne details)');
    };
    const r = await worker.fetch(verzoek('POST', lichaam()), env);
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('{"fout":"tijdelijk"}');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const vreemd = await worker.fetch(verzoek('POST', lichaam(), 'https://kwaad.example'), env);
    expect(vreemd.status).toBe(403);
  });
});
