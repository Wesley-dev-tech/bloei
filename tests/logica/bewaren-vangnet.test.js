// Het uitgesteld bewaren en het vangnet (R5-03) na de nalezing van 19 november: vijf bevindingen, elk met een test die eerst de fout toonde.
//   1 een oud vangnet blijft niet liggen en zet geen oudere tekst terug over een nieuwere
//   2 een mislukte schrijfactie van een maaltijd laat het vangnet liggen
//   3 een schrijfactie die nooit afrondt, houdt bewaarAlles() niet voor altijd tegen
//   4 de drie wachters in src/app.js vangen een mislukt bewaren op
//   5 het vangnet-item van een schrijfactie die onderweg is, houdt de dag waarop het typen begon
// Tweede nalezing: N1 (toets tijdens een lopende schrijfactie), N2 (mislukt zonder vangnet), A (verwijderen en annuleren ruimen op).
// De pagina wordt nagebootst met een eigen window en document (alleen gebeurtenissen), de browseropslag met een eenvoudige Storage.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class Opslag {
  #m = new Map();
  get length() {
    return this.#m.size;
  }
  key(i) {
    return [...this.#m.keys()][i] ?? null;
  }
  getItem(k) {
    return this.#m.has(k) ? this.#m.get(k) : null;
  }
  setItem(k, v) {
    this.#m.set(k, String(v));
  }
  removeItem(k) {
    this.#m.delete(k);
  }
  clear() {
    this.#m.clear();
  }
}

const SLEUTEL = 'bloei-vangnet';
const tik = (ms = 0) => new Promise((klaar) => setTimeout(klaar, ms));
const vangnet = () => JSON.parse(localStorage.getItem(SLEUTEL) ?? 'null');
// De pagina verdwijnt of wordt verborgen: hulp.js luistert naar pagehide op window.
const verberg = () => window.dispatchEvent(new Event('pagehide'));

let hulp;
let fouten;

beforeEach(async () => {
  vi.resetModules();
  globalThis.localStorage = new Opslag();
  globalThis.sessionStorage = new Opslag();
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  fouten = vi.spyOn(console, 'error').mockImplementation(() => {});
  hulp = await import('../../src/schermen/hulp.js');
});
afterEach(() => {
  fouten.mockRestore();
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.window;
  delete globalThis.document;
});

// Een nagebootste opslag voor één veld: schrijven duurt even en kan mislukken.
function veld({ duur = 5 } = {}) {
  const stand = { waarde: '', faal: false };
  stand.bewaar = async (tekst) => {
    await tik(duur);
    if (stand.faal) throw new Error('db');
    stand.waarde = tekst;
  };
  return stand;
}
const notitieItem = (tekst) => ({ soort: 'notitie', datum: '2026-11-18', tekst });

describe('bevinding 1: een oud vangnet blijft niet liggen', () => {
  test('de schrijfactie bij het verbergen mislukt, later typt ze verder en dat wordt bewaard: het vangnet is weg', async () => {
    const db = veld();
    const b = hulp.uitgesteldBewaren(db.bewaar, 400, notitieItem);
    db.faal = true;
    b.plan('abcd');
    verberg();
    await tik(30);
    // Zolang de tekst nergens bewaard is, beschermt het vangnet ze.
    expect(vangnet()).toMatchObject([{ soort: 'notitie', tekst: 'abcd' }]);
    db.faal = false;
    b.plan('abcdef');
    await b.nu();
    expect(db.waarde).toBe('abcdef');
    expect(vangnet()).toBeNull();
    verberg(); // de app sluit, niets wacht
    await tik(30);
    expect(vangnet()).toBeNull();
  });

  test('een ander veld dat bewaard wordt, haalt het item van het mislukte veld niet weg', async () => {
    const notitie = veld();
    const ander = veld();
    const a = hulp.uitgesteldBewaren(notitie.bewaar, 400, notitieItem);
    const c = hulp.uitgesteldBewaren(ander.bewaar, 400, (tekst) => ({ soort: 'maaltijd', datum: '2026-11-18', maaltijd: 'ontbijt', tekst }));
    notitie.faal = true;
    a.plan('abcd');
    verberg();
    await tik(30);
    c.plan('Havermout');
    await c.nu();
    expect(vangnet()).toMatchObject([{ soort: 'notitie', tekst: 'abcd' }]);
    notitie.faal = false;
    a.plan('abcde');
    await a.nu();
    expect(vangnet()).toBeNull();
  });

  test('typen terwijl de schrijfactie van het verbergen nog loopt: na het bewaren van de nieuwe tekst is het vangnet weg', async () => {
    const db = veld({ duur: 30 });
    const b = hulp.uitgesteldBewaren(db.bewaar, 50, notitieItem);
    b.plan('v1');
    verberg();
    await tik(10);
    b.plan('v2');
    await tik(60); // v1 staat in de database, v2 wacht nog of is onderweg: het vangnet beschermt nu v2
    await tik(140);
    expect(db.waarde).toBe('v2');
    expect(vangnet()).toBeNull();
  });

  test('de volgende start zet geen tekst terug over een record dat nieuwer is dan het vangnet-item', async () => {
    const { db, openDb } = await import('../../src/data/db.js');
    const { vandaag } = await import('../../src/kern/datum.js');
    const { bewaarMaaltijd, leesMaaltijden } = await import('../../src/data/maaltijden.js');
    const { leesDag, zetNotitie } = await import('../../src/data/dagen.js');
    const { herstelVangnet } = await import('../../src/data/vangnet.js');
    await db.delete();
    await openDb();
    const V = vandaag();
    const oud = Date.now() - 60000;
    await zetNotitie(V, 'nieuwe notitie');
    await bewaarMaaltijd(V, 'ontbijt', { tekst: 'nieuw ontbijt' });
    localStorage.setItem(
      SLEUTEL,
      JSON.stringify([
        { soort: 'notitie', datum: V, tekst: 'oude notitie', op: oud },
        { soort: 'maaltijd', datum: V, maaltijd: 'ontbijt', tekst: 'oud ontbijt', op: oud },
        { soort: 'maaltijd', datum: V, maaltijd: 'middagmaal', tekst: 'nog niet bewaard', op: oud },
      ]),
    );
    expect(await herstelVangnet()).toBe(1);
    expect(localStorage.getItem(SLEUTEL)).toBeNull();
    expect((await leesDag(V)).notitie).toBe('nieuwe notitie');
    const maaltijden = await leesMaaltijden(V);
    expect(maaltijden.ontbijt.tekst).toBe('nieuw ontbijt');
    expect(maaltijden.middagmaal.tekst).toBe('nog niet bewaard');
    // Een item dat nieuwer is dan het record, wordt wel teruggezet.
    localStorage.setItem(SLEUTEL, JSON.stringify([{ soort: 'notitie', datum: V, tekst: 'net getypt', op: Date.now() + 60000 }]));
    expect(await herstelVangnet()).toBe(1);
    expect((await leesDag(V)).notitie).toBe('net getypt');
  });

  test('elk item in het vangnet draagt het tijdstip van de laatste toets', async () => {
    const db = veld();
    const b = hulp.uitgesteldBewaren(db.bewaar, 400, notitieItem);
    const voor = Date.now();
    b.plan('abc');
    verberg();
    const [item] = vangnet();
    expect(item.op).toBeGreaterThanOrEqual(voor);
    expect(item.op).toBeLessThanOrEqual(Date.now());
    await tik(30);
    expect(vangnet()).toBeNull();
  });
});

describe('bevinding 2: een mislukte schrijfactie van een maaltijd laat het vangnet liggen', () => {
  test('de bewaarder van de maaltijdtekst geeft het mislukken door en meldt de fout één keer', async () => {
    const { maakTekstBewaarder } = await import('../../src/ui/maaltijdregel.js');
    const gemeld = [];
    const { bewaarder, typt } = maakTekstBewaarder({
      soort: 'ontbijt',
      dag: () => '2026-11-18',
      schrijf: async () => {
        await tik(5);
        throw new Error('db');
      },
      opFout: (fout) => gemeld.push(fout.message),
    });
    typt();
    bewaarder.plan('abcd');
    verberg();
    await tik(30);
    expect(gemeld).toEqual(['db']);
    expect(vangnet()).toMatchObject([{ soort: 'maaltijd', datum: '2026-11-18', maaltijd: 'ontbijt', tekst: 'abcd' }]);
    typt();
    bewaarder.plan('abcde');
    await expect(bewaarder.nu()).rejects.toThrow('db');
    expect(vangnet()).toMatchObject([{ tekst: 'abcde' }]);
  });

  test('in de bron: het venster van de maaltijd wacht nergens op bewaarder.nu() zonder de fout op te vangen', () => {
    const bron = readFileSync('src/ui/maaltijdregel.js', 'utf8');
    expect(bron).not.toMatch(/await bewaarder\.nu\(\)/);
    expect(bron).not.toMatch(/=> bewaarder\.nu\(\)[,;) ]/);
  });
});

describe('bevinding 3: een schrijfactie die nooit afrondt', () => {
  test('bewaarAlles() wacht hoogstens tot zijn grens, en een latere aanroep wacht niet opnieuw', async () => {
    const b = hulp.uitgesteldBewaren(() => new Promise(() => {}), 10);
    b.plan('x');
    await tik(30);
    const eerste = await Promise.race([hulp.bewaarAlles(60).then(() => 'klaar'), tik(600).then(() => 'hangt')]);
    expect(eerste).toBe('klaar');
    const start = Date.now();
    const tweede = await Promise.race([hulp.bewaarAlles(60).then(() => 'klaar'), tik(600).then(() => 'hangt')]);
    expect(tweede).toBe('klaar');
    expect(Date.now() - start).toBeLessThan(40);
  });

  test('de grens staat op enkele seconden', () => {
    expect(hulp.BEWAAR_GRENS_MS).toBeGreaterThanOrEqual(2000);
    expect(hulp.BEWAAR_GRENS_MS).toBeLessThanOrEqual(6000);
  });

  test('het vangnet blijft liggen zolang de tekst nergens staat, en gaat weg zodra hetzelfde veld bewaard is', async () => {
    let hang = true;
    const stand = { waarde: '' };
    const b = hulp.uitgesteldBewaren(
      (tekst) =>
        hang
          ? new Promise(() => {})
          : tik(5).then(() => {
              stand.waarde = tekst;
            }),
      400,
      notitieItem,
    );
    b.plan('abcd');
    verberg();
    await hulp.bewaarAlles(40);
    expect(vangnet()).toMatchObject([{ tekst: 'abcd' }]);
    // De oude waarde komt niet eindeloos terug: een latere, geslaagde schrijfactie van hetzelfde veld ruimt ze op.
    hang = false;
    b.plan('abcdef');
    await b.nu();
    expect(stand.waarde).toBe('abcdef');
    expect(vangnet()).toBeNull();
    verberg();
    await tik(20);
    expect(vangnet()).toBeNull();
  });
});

describe('bevinding 3, vervolg', () => {
  test('een losgelaten schrijfactie zonder vangnet: haar tekst gaat bij het volgende verbergen toch in het vangnet', async () => {
    const los = [];
    const b = hulp.uitgesteldBewaren(() => new Promise((klaar) => los.push(klaar)), 400, notitieItem);
    b.plan('abcd');
    await hulp.bewaarAlles(40);
    expect(vangnet()).toBeNull();
    verberg();
    expect(vangnet()).toMatchObject([{ tekst: 'abcd' }]);
    // Rondt ze later toch af, dan ruimt ze zelf op.
    los[0]();
    await tik(10);
    expect(vangnet()).toBeNull();
  });
});

describe('tweede nalezing: N1, N2 en A', () => {
  // Een opslag waarvan elke schrijfactie met de hand afgerond wordt; ze onthoudt wanneer het record geschreven is (gewijzigdOp).
  function handOpslag() {
    const stand = { waarde: '', gewijzigdOp: 0, open: [] };
    stand.bewaar = (tekst) =>
      new Promise((klaar) =>
        stand.open.push(() => {
          stand.waarde = tekst;
          stand.gewijzigdOp = Date.now();
          klaar();
        }),
      );
    return stand;
  }

  test('N1: een toets tijdens een lopende schrijfactie die nog wacht, is in het vangnet niet ouder dan het record', async () => {
    const db = handOpslag();
    const b = hulp.uitgesteldBewaren(db.bewaar, 400, notitieItem);
    b.plan('abc');
    b.nu(); // T1 onderweg
    b.plan('abcde'); // de toets, voor T1 het record schrijft
    await tik(15);
    db.open[0](); // T1 schrijft het record, later dan de toets
    await tik(5);
    expect(db.waarde).toBe('abc');
    verberg(); // de pagina gaat weg voor 'abcde' bewaard is
    const [item] = vangnet();
    expect(item.tekst).toBe('abcde');
    expect(item.op).toBeGreaterThanOrEqual(db.gewijzigdOp);
  });

  test('N1: hetzelfde als de nieuwere tekst zelf al onderweg is', async () => {
    const db = handOpslag();
    const b = hulp.uitgesteldBewaren(db.bewaar, 400, notitieItem);
    b.plan('abc');
    b.nu(); // T1 onderweg
    b.plan('abcde');
    b.nu(); // T2 onderweg, met het tijdstip van de toets
    await tik(15);
    db.open[0](); // T1 schrijft het record
    await tik(5);
    verberg();
    const [item] = vangnet();
    expect(item.tekst).toBe('abcde');
    expect(item.op).toBeGreaterThanOrEqual(db.gewijzigdOp);
  });

  test('N2: een schrijfactie die mislukt terwijl er geen vangnet ligt, gaat bij het verbergen toch in het vangnet', async () => {
    const db = veld();
    const b = hulp.uitgesteldBewaren(db.bewaar, 400, notitieItem);
    db.faal = true;
    b.plan('abcd');
    await expect(b.nu()).rejects.toThrow('db');
    expect(vangnet()).toBeNull(); // er lag geen vangnet en er komt er ook geen zolang de pagina zichtbaar blijft
    verberg();
    expect(vangnet()).toMatchObject([{ soort: 'notitie', tekst: 'abcd' }]);
    // Wordt hetzelfde veld later wel bewaard, dan gaat het weg.
    db.faal = false;
    b.plan('abcde');
    await b.nu();
    expect(vangnet()).toBeNull();
  });

  test('A: vergeetMislukt haalt het mislukte item van dat veld uit het vangnet, en alleen dat veld', async () => {
    const ontbijt = veld();
    const notitie = veld();
    const a = hulp.uitgesteldBewaren(ontbijt.bewaar, 400, (tekst) => ({ soort: 'maaltijd', datum: '2026-11-18', maaltijd: 'ontbijt', tekst }));
    const c = hulp.uitgesteldBewaren(notitie.bewaar, 400, notitieItem);
    ontbijt.faal = true;
    notitie.faal = true;
    a.plan('Havermout');
    c.plan('abcd');
    verberg();
    await tik(30);
    expect(vangnet()).toHaveLength(2);
    hulp.vergeetMislukt({ soort: 'maaltijd', datum: '2026-11-18', maaltijd: 'ontbijt' }); // de maaltijd is verwijderd
    expect(vangnet()).toMatchObject([{ soort: 'notitie', tekst: 'abcd' }]);
    hulp.vergeetMislukt({ soort: 'notitie', datum: '2026-11-18' });
    expect(vangnet()).toBeNull();
    verberg(); // ook bij het volgende verbergen komt niets terug
    await tik(20);
    expect(vangnet()).toBeNull();
  });

  test('A, in de bron: Verwijderen en Annuleren van een maaltijd vergeten het mislukte item', () => {
    const bron = readFileSync('src/ui/maaltijdregel.js', 'utf8');
    expect(bron).toMatch(/wisMaaltijd\(datum, soort\)\);\s*vergeetMislukt\(\{ soort: 'maaltijd', datum, maaltijd: soort \}\)/);
    expect(bron).toMatch(/zetMaaltijdTerug\(terug\?\.datum \?\? datum, soort, terug\)\);\s*vergeetMislukt\(\{ soort: 'maaltijd', datum: terug\?\.datum \?\? datum, maaltijd: soort \}\)/);
  });
});

describe('bevinding 4: de wachters in src/app.js', () => {
  test('elke bewaarAlles() in src/app.js vangt een mislukt bewaren op', () => {
    const bron = readFileSync('src/app.js', 'utf8');
    const aanroepen = bron.split('bewaarAlles()').slice(1);
    expect(aanroepen.length).toBeGreaterThanOrEqual(3);
    for (const na of aanroepen) expect(na.slice(0, 40)).toMatch(/^\.catch\(/);
  });

  test('een mislukt bewaren houdt wie erop wacht niet tegen als hij de fout opvangt', async () => {
    const b = hulp.uitgesteldBewaren(async () => {
      throw new Error('db');
    }, 400);
    b.plan('x');
    await expect(hulp.bewaarAlles()).rejects.toThrow('db');
    await expect(hulp.bewaarAlles()).resolves.toEqual([]);
  });
});

describe('bevinding 5: de dag van het vangnet-item rond middernacht', () => {
  test('het item van een schrijfactie die onderweg is, wordt één keer berekend, vóór het bewaren start', async () => {
    let typDag = null;
    let nu = '2026-11-18';
    const dag = () => nu;
    const b = hulp.uitgesteldBewaren(
      async () => {
        typDag = null;
        await tik(30);
      },
      400,
      (tekst) => ({ soort: 'maaltijd', datum: typDag ?? dag(), maaltijd: 'avondmaal', tekst }),
    );
    typDag = dag();
    b.plan('soep');
    nu = '2026-11-19';
    verberg();
    expect(vangnet()).toMatchObject([{ datum: '2026-11-18', tekst: 'soep' }]);
    verberg(); // pagehide na visibilitychange: de schrijfactie is onderweg
    expect(vangnet()).toMatchObject([{ datum: '2026-11-18', tekst: 'soep' }]);
    await tik(60);
    expect(vangnet()).toBeNull();
  });

  test('de bewaarder van de maaltijdtekst: tekst van voor middernacht blijft in het vangnet bij de dag waarop het typen begon', async () => {
    const { maakTekstBewaarder } = await import('../../src/ui/maaltijdregel.js');
    let nu = '2026-11-18';
    const geschreven = [];
    const { bewaarder, typt } = maakTekstBewaarder({
      soort: 'avondmaal',
      dag: () => nu,
      schrijf: async (wijziging, opDag) => {
        await tik(30);
        geschreven.push({ ...wijziging, opDag });
      },
      opFout: () => {},
    });
    typt();
    bewaarder.plan('soep');
    nu = '2026-11-19';
    verberg();
    verberg();
    expect(vangnet()).toMatchObject([{ soort: 'maaltijd', datum: '2026-11-18', maaltijd: 'avondmaal', tekst: 'soep' }]);
    await tik(60);
    expect(geschreven).toEqual([{ tekst: 'soep', opDag: '2026-11-18' }]);
    expect(vangnet()).toBeNull();
    // Een nieuwe tekst na middernacht hoort bij de nieuwe dag.
    typt();
    bewaarder.plan('ontbijt');
    verberg();
    expect(vangnet()).toMatchObject([{ datum: '2026-11-19', tekst: 'ontbijt' }]);
    await tik(60);
  });
});
