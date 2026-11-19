// Herstel na de beveiligingsnalezing van 18 november: de vier bevindingen (leesgrens op een volle dienst, lijstopvragingen zonder
// k:lijst, een kapotte sleutel die stil faalt, een dubbele melding na een oude lezing van v:verstuurd). Nepversies van KV en fetch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import worker, {
  verwerk,
  verstuurHerinneringen,
  sleutelVan,
  wisGeheugen,
  GEHEUGEN,
  GEHEUGEN_STANDAARD,
  NIEUW_PER_DAG,
  remSleutelGeheugen,
  geheugenSleutels,
} from '../../worker/src/index.js';
import { naarBase64Url } from '../../worker/src/vapid.js';

const ORIGIN = 'https://voorbeeld.github.io';
const SLEUTELS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const MIN = 60 * 1000;
const UUR = 60 * MIN;

function testSleutels() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publiek = naarBase64Url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  return { prive: jwk.d, publiek };
}

// oud: per sleutel een lijst oude waarden die de volgende get teruggeeft (een trage kopie van KV). leesFout: elke lezing faalt
// (de 100.000 leesopdrachten van de dag zijn op). lijstFout: elke lijstopvraging faalt.
class NepKv {
  constructor() {
    this.data = new Map([['k:lijst', { v: '[]', metadata: null }]]);
    this.tellers = { get: 0, put: 0, list: 0, delete: 0 };
    this.oud = new Map();
    this.leesFout = false;
    this.lijstFout = false;
  }
  async put(k, v, o = {}) {
    this.tellers.put++;
    this.data.set(k, { v, metadata: o.metadata ?? null });
  }
  async get(k) {
    this.tellers.get++;
    if (this.leesFout) throw new Error('KV GET failed: 429');
    if (this.oud.has(k)) {
      const v = this.oud.get(k);
      this.oud.delete(k);
      return v;
    }
    return this.data.get(k)?.v ?? null;
  }
  async getWithMetadata(k) {
    this.tellers.get++;
    if (this.leesFout) throw new Error('KV GET failed: 429');
    const r = this.data.get(k);
    return r ? { value: r.v, metadata: r.metadata } : { value: null, metadata: null };
  }
  async delete(k) {
    this.tellers.delete++;
    this.data.delete(k);
  }
  async list({ prefix = '' } = {}) {
    this.tellers.list++;
    if (this.lijstFout) throw new Error('KV LIST failed: 429');
    const keys = [...this.data].filter(([k]) => k.startsWith(prefix)).map(([name, r]) => ({ name, metadata: r.metadata }));
    return { keys, list_complete: true };
  }
}

let kv;
let env;
let verstuurdNaar;
beforeEach(() => {
  kv = new NepKv();
  const s = testSleutels();
  env = { ABONNEMENTEN: kv, TOEGELATEN_ORIGIN: ORIGIN, VAPID_PRIVE: s.prive, VAPID_PUBLIEK: s.publiek, VAPID_ONDERWERP: 'https://voorbeeld.github.io', REM_ZOUT: 'z'.repeat(32) };
  wisGeheugen();
  Object.assign(GEHEUGEN, GEHEUGEN_STANDAARD);
  verstuurdNaar = [];
  vi.stubGlobal('fetch', async (url) => {
    verstuurdNaar.push(String(url));
    return new Response(null, { status: 201 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(GEHEUGEN, GEHEUGEN_STANDAARD);
});

const ep = (i) => `https://fcm.googleapis.com/fcm/send/toestel${i}`;
const aanmelding = (i, uren, ip, origin = ORIGIN) =>
  new Request('https://worker.example.invalid/abonnement', {
    method: 'POST',
    headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
    body: JSON.stringify({ abonnement: { endpoint: ep(i), keys: SLEUTELS }, uren }),
  });
const gezond = (origin) =>
  new Request('https://worker.example.invalid/gezond', { method: 'GET', headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': '192.0.2.200' } });
// Een volle dienst: tien echte toestellen die al meldingen kregen (geen kandidaat om plaats te maken).
async function vulDienst() {
  const lijst = [];
  for (let i = 0; i < 10; i++) {
    const naam = await sleutelVan(ep(i));
    kv.data.set(naam, { v: JSON.stringify({ abonnement: { endpoint: ep(i), keys: SLEUTELS }, uren: ['20:00'] }), metadata: { u: ['20:00'], g: 1 } });
    lijst.push([naam, null]);
  }
  kv.data.set('k:lijst', { v: JSON.stringify(lijst.sort((x, y) => (x[0] < y[0] ? -1 : 1))), metadata: null });
}
const T = Date.parse('2026-11-16T09:00:00Z');
const AVOND = Date.parse('2026-11-16T19:00:00Z');

describe('bevinding 1: een volle dienst kan de leesopdrachten niet opmaken', () => {
  it('200 verzoeken van één IP op een volle dienst: na de rem in het geheugen geen enkele KV-lezing meer', async () => {
    await vulDienst();
    const statussen = [];
    const lezingen = [];
    for (let i = 0; i < 200; i++) {
      const voor = kv.tellers.get;
      const r = await verwerk(aanmelding(100 + i, ['10:00'], '203.0.113.9'), env, T + i * 100);
      statussen.push(r.status);
      lezingen.push(kv.tellers.get - voor);
    }
    expect(new Set(statussen)).toEqual(new Set([429]));
    // Het eerste verzoek: het eigen adres en k:lijst (2), dan de "vol"-stand: elk volgend verzoek alleen het eigen adres.
    expect(lezingen[0]).toBe(2);
    expect(lezingen.slice(1, GEHEUGEN.perMinuut)).toEqual(Array(GEHEUGEN.perMinuut - 1).fill(1));
    // Daarna weigert de rem in het geheugen, zonder KV.
    expect(lezingen.slice(GEHEUGEN.perMinuut).every((n) => n === 0)).toBe(true);
    expect(kv.tellers.put + kv.tellers.list + kv.tellers.delete).toBe(0);
    const later = await verwerk(aanmelding(999, ['10:00'], '203.0.113.9'), env, T + 30 * 1000);
    expect(later.status).toBe(429);
    expect(Number(later.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });

  it('de rem in het geheugen telt ook per uur, en een ander IP wordt niet geremd', async () => {
    await vulDienst();
    for (let i = 0; i < GEHEUGEN.perUur; i++) await verwerk(aanmelding(100 + i, ['10:00'], '203.0.113.9'), env, T + i * MIN);
    const voor = kv.tellers.get;
    const r = await verwerk(aanmelding(500, ['10:00'], '203.0.113.9'), env, T + 40 * MIN);
    expect(r.status).toBe(429);
    expect(kv.tellers.get - voor).toBe(0);
    // Een ander IP: de "vol"-stand geldt nog maar 60 seconden; daarna weer 2 leesopdrachten.
    const v2 = kv.tellers.get;
    expect((await verwerk(aanmelding(501, ['10:00'], '198.51.100.1'), env, T + 40 * MIN)).status).toBe(429);
    expect(kv.tellers.get - v2).toBe(2);
  });

  it('een bestaand toestel kan op een volle dienst (ook in de "vol"-stand) zijn uren nog wijzigen', async () => {
    await vulDienst();
    expect((await verwerk(aanmelding(100, ['10:00'], '203.0.113.9'), env, T)).status).toBe(429);
    expect((await verwerk(aanmelding(3, ['21:00'], '203.0.113.10'), env, T + 1000)).status).toBe(204);
    expect(kv.data.get(await sleutelVan(ep(3))).metadata.u).toEqual(['21:00']);
  });

  it('kan de run k:lijst niet lezen (leesgrens op), dan stuurt hij met de lijst die de isolate kent, en gooit hij een fout', async () => {
    await vulDienst();
    await verstuurHerinneringen(env, new Date(AVOND - 5 * MIN));
    // Alleen k:lijst faalt; de rest leest nog (bv. een fout van één lezing).
    const echt = kv.get.bind(kv);
    kv.get = async (k) => {
      if (k === 'k:lijst') throw new Error('KV GET failed: 429');
      return echt(k);
    };
    await expect(verstuurHerinneringen(env, new Date(AVOND))).rejects.toThrow(/k:lijst-onleesbaar/);
    expect(verstuurdNaar).toHaveLength(10);
  });

  it('kan de run helemaal niets lezen, dan gooit hij een fout (zichtbaar in Cron Events), niet stil niets', async () => {
    await vulDienst();
    kv.leesFout = true;
    await expect(verstuurHerinneringen(env, new Date(AVOND))).rejects.toThrow();
    expect(verstuurdNaar).toHaveLength(0);
  });
});

describe('bevinding 2: zonder k:lijst geen lijstopvraging uit een aanmelding', () => {
  it('k:lijst ontbreekt: 50 aanmeldingen geven 503 tijdelijk, geen enkele lijstopvraging, niets geschreven', async () => {
    Object.assign(GEHEUGEN, { perMinuut: Infinity, perUur: Infinity });
    kv.data.delete('k:lijst');
    for (let i = 0; i < 50; i++) {
      const r = await verwerk(aanmelding(i, ['10:00'], '203.0.113.9'), env, T + i);
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ fout: 'tijdelijk' });
    }
    expect(kv.tellers.list).toBe(0);
    expect(kv.tellers.put).toBe(0);
  });

  it('valt de lijstopvraging weg terwijl k:lijst ontbreekt, dan stuurt de run toch uit de laatste lijst van de isolate en schrijft k:lijst', async () => {
    await vulDienst();
    await verstuurHerinneringen(env, new Date(AVOND - 5 * MIN));
    kv.data.delete('k:lijst');
    kv.lijstFout = true;
    await expect(verstuurHerinneringen(env, new Date(AVOND))).rejects.toThrow(/lijstopvraging-mislukt/);
    expect(verstuurdNaar).toHaveLength(10);
    expect(JSON.parse(kv.data.get('k:lijst').v)).toHaveLength(10);
  });
});

describe('bevinding 3: een kapotte sleutel faalt zichtbaar', () => {
  it('een onleesbare of ontbrekende sleutel: de run gooit een fout, stuurt niets en legt niets vast', async () => {
    await vulDienst();
    const goed = env.VAPID_PRIVE;
    env.VAPID_PRIVE = 'kapot!!';
    await expect(verstuurHerinneringen(env, new Date(AVOND))).rejects.toThrow(/vapid-sleutel-onbruikbaar/);
    expect(verstuurdNaar).toHaveLength(0);
    expect(kv.data.has('v:verstuurd')).toBe(false);
    // Een ontbrekende sleutel net zo.
    delete env.VAPID_PRIVE;
    await expect(verstuurHerinneringen(env, new Date(AVOND + 24 * UUR))).rejects.toThrow(/vapid-sleutel-onbruikbaar/);
    expect(kv.data.has('v:verstuurd')).toBe(false);
    // De goede sleutel terug: de volgende run stuurt weer en legt vast.
    env.VAPID_PRIVE = goed;
    await verstuurHerinneringen(env, new Date(AVOND + 48 * UUR));
    expect(verstuurdNaar).toHaveLength(10);
    expect(kv.data.has('v:verstuurd')).toBe(true);
  });

  it('GET /gezond: 204 met een bruikbare sleutel en k:lijst, 503 anders; geen lichaam; vreemde Origin 403; hoogstens één lezing per minuut', async () => {
    const r = await verwerk(gezond(null), env, T);
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
    expect((await verwerk(gezond(ORIGIN), env, T + 1000)).status).toBe(204);
    expect((await verwerk(gezond('https://kwaad.example'), env, T + 1000)).status).toBe(403);
    expect(kv.tellers.get).toBe(1);
    wisGeheugen();
    env.VAPID_PRIVE = 'kapot!!';
    const kapot = await verwerk(gezond(null), env, T + 2000);
    expect(kapot.status).toBe(503);
    expect(await kapot.text()).toBe('');
    wisGeheugen();
    env.VAPID_PRIVE = testSleutels().prive;
    kv.data.delete('k:lijst');
    expect((await verwerk(gezond(null), env, T + 3000)).status).toBe(503);
  });

  it('GET /gezond valt onder de rem in het geheugen', async () => {
    const statussen = [];
    for (let i = 0; i < 40; i++) statussen.push((await verwerk(gezond(null), env, T + i)).status);
    expect(statussen.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(kv.tellers.get).toBe(1);
  });
});

describe('bevinding 4: een oude lezing van v:verstuurd geeft geen dubbele melding', () => {
  it('de run van 19:31 leest een oude stand: A (19:30) krijgt om 19:32 GEEN tweede melding', async () => {
    Object.assign(GEHEUGEN, { perMinuut: Infinity, perUur: Infinity });
    const T0 = Date.UTC(2026, 10, 17, 18, 0, 0); // 19:00 in Brussel
    const A = 'https://web.push.apple.com/AAAA';
    const B = 'https://web.push.apple.com/BBBB';
    const C = 'https://web.push.apple.com/CCCC';
    const meld = (endpoint, uren, i) =>
      verwerk(
        new Request('https://worker.example.invalid/abonnement', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'CF-Connecting-IP': `198.51.100.${i}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ abonnement: { endpoint, keys: SLEUTELS }, uren }),
        }),
        env,
        T0 - 2 * UUR,
      );
    await meld(A, ['19:30'], 1);
    await meld(B, ['19:31'], 2);
    await meld(C, ['19:00'], 3);
    await verstuurHerinneringen(env, new Date(T0));
    const oud = kv.data.get('v:verstuurd').v;
    verstuurdNaar = [];
    await verstuurHerinneringen(env, new Date(T0 + 30 * MIN));
    kv.oud.set('v:verstuurd', oud);
    await verstuurHerinneringen(env, new Date(T0 + 31 * MIN));
    for (let m = 32; m <= 45; m++) await verstuurHerinneringen(env, new Date(T0 + m * MIN));
    expect(verstuurdNaar.map((u) => u.slice(-4))).toEqual(['AAAA', 'BBBB']);
  });

  it('een gemiste run wordt nog steeds ingehaald (geen oude lezing)', async () => {
    Object.assign(GEHEUGEN, { perMinuut: Infinity, perUur: Infinity });
    const T0 = Date.UTC(2026, 10, 17, 18, 0, 0);
    await verwerk(aanmelding(1, ['19:00'], '198.51.100.1'), env, T0 - 2 * UUR);
    await verwerk(aanmelding(2, ['19:05'], '198.51.100.2'), env, T0 - 2 * UUR);
    await verstuurHerinneringen(env, new Date(T0));
    // 19:01 tot 19:07 lopen niet; 19:08 haalt 19:05 in.
    await verstuurHerinneringen(env, new Date(T0 + 8 * MIN));
    expect(verstuurdNaar.map((u) => u.slice(-8))).toEqual(['toestel1', 'toestel2']);
  });

  // NIET AF (punt 1 van de tweede nalezing): het herstel botst met de inhaalregel van BESLISSING 713; beslissing nodig. Het
  // scenario staat hieronder klaar (nu rood: toestel2 komt twee keer); zet het om in een test zodra de beslissing er is.
  const wachtOpBeslissing = async () => {
    Object.assign(GEHEUGEN, { perMinuut: Infinity, perUur: Infinity });
    const T0 = Date.UTC(2026, 10, 17, 18, 0, 0); // 19:00 in Brussel
    await verwerk(aanmelding(1, ['19:00'], '198.51.100.1'), env, T0 - 2 * UUR);
    await verwerk(aanmelding(2, ['19:05'], '198.51.100.2'), env, T0 - 2 * UUR);
    await verwerk(aanmelding(3, ['19:08'], '198.51.100.3'), env, T0 - 2 * UUR);
    await verstuurHerinneringen(env, new Date(T0));
    const oud = kv.data.get('v:verstuurd').v;
    // De run van 19:05 mist toestel 2 (KV loopt achter): hier nagebootst door die run niet te draaien.
    // De run van 19:07 haalt 19:05 in en legt dat vast.
    await verstuurHerinneringen(env, new Date(T0 + 7 * MIN));
    // De run van 19:08 leest nog de oude stand (van 19:00).
    kv.oud.set('v:verstuurd', oud);
    await verstuurHerinneringen(env, new Date(T0 + 8 * MIN));
    for (let m = 9; m <= 25; m++) await verstuurHerinneringen(env, new Date(T0 + m * MIN));
    expect(verstuurdNaar.map((u) => u.slice(-8))).toEqual(['toestel1', 'toestel2', 'toestel3']);
  };
  void wachtOpBeslissing;
});

describe('de rem in het geheugen: IPv6 per /64, "dag vol"-stand, opruimen', () => {
  it('een IPv6-adres telt op zijn /64-voorvoegsel, ook verkort geschreven; IPv4 als geheel', () => {
    expect(remSleutelGeheugen('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(remSleutelGeheugen('2001:DB8:0001:0002::ffff')).toBe('2001:db8:1:2::/64');
    expect(remSleutelGeheugen('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(remSleutelGeheugen('2001:db8:1::')).toBe('2001:db8:1:0::/64');
    expect(remSleutelGeheugen('::1')).toBe('0:0:0:0::/64');
    expect(remSleutelGeheugen('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(remSleutelGeheugen('192.0.2.1')).toBe('192.0.2.1');
  });

  it('verzoeken van verschillende adressen in een /64-blok delen een rem: daarna geen KV-lezing meer', async () => {
    await vulDienst();
    const lezingen = [];
    for (let i = 0; i < GEHEUGEN.perMinuut + 3; i++) {
      const voor = kv.tellers.get;
      const r = await verwerk(aanmelding(100 + i, ['10:00'], `2001:db8:1:2::${(i + 1).toString(16)}`), env, T + i * 100);
      expect(r.status).toBe(429);
      lezingen.push(kv.tellers.get - voor);
    }
    expect(lezingen.slice(GEHEUGEN.perMinuut)).toEqual([0, 0, 0]);
    // Een ander /64-blok wordt niet geremd.
    const voor = kv.tellers.get;
    await verwerk(aanmelding(900, ['10:00'], '2001:db8:1:3::1'), env, T + 1000);
    expect(kv.tellers.get - voor).toBeGreaterThan(0);
  });

  it('dagtotaal bereikt (dienst niet vol): elk volgend nieuw verzoek kost 1 leesopdracht tot middernacht UTC; een bestaand toestel mag wijzigen', async () => {
    expect((await verwerk(aanmelding(1, ['10:00'], '198.51.100.1'), env, T)).status).toBe(204);
    kv.data.set('n:' + new Date(T).toISOString().slice(0, 10), { v: String(NIEUW_PER_DAG), metadata: null });
    const eerste = await verwerk(aanmelding(2, ['10:00'], '198.51.100.2'), env, T + 1000);
    expect(eerste.status).toBe(429);
    for (let i = 0; i < 5; i++) {
      const voor = kv.tellers.get;
      const r = await verwerk(aanmelding(10 + i, ['10:00'], `198.51.100.${10 + i}`), env, T + 2000 + i);
      expect(r.status).toBe(429);
      expect(Number(r.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      expect(kv.tellers.get - voor).toBe(1);
    }
    expect((await verwerk(aanmelding(1, ['11:00'], '198.51.100.1'), env, T + 3000)).status).toBe(204);
    // Na middernacht UTC: de stand is weg.
    const morgen = Date.parse('2026-11-17T00:00:01Z');
    expect((await verwerk(aanmelding(20, ['10:00'], '198.51.100.20'), env, morgen)).status).toBe(204);
  });

  it('een adres blijft hoogstens ongeveer een uur in het geheugen', async () => {
    await verwerk(gezond(null), env, T);
    expect(geheugenSleutels()).toEqual(['192.0.2.200']);
    // Een verzoek van een ander adres in het volgende uur ruimt de oude rij op.
    await verwerk(aanmelding(1, ['10:00'], '198.51.100.1'), env, T + UUR);
    expect(geheugenSleutels()).toEqual(['198.51.100.1']);
    // Ook zonder verzoeken: de run van elke minuut ruimt op.
    await verstuurHerinneringen(env, new Date(T + 2 * UUR));
    expect(geheugenSleutels()).toEqual([]);
  });
});

describe('de cron gooit de fout door naar Cron Events', () => {
  it('scheduled geeft een afgewezen belofte aan waitUntil bij een kapotte sleutel', async () => {
    await vulDienst();
    env.VAPID_PRIVE = 'kapot!!';
    let belofte;
    worker.scheduled({ scheduledTime: AVOND }, env, { waitUntil: (p) => (belofte = p) });
    await expect(belofte).rejects.toThrow();
  });
});
