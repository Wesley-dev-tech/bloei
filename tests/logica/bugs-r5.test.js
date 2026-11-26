// Herstel van de bugs uit review R5 (randgevallen) en R2-18 (BESLISSING 409) in de gegevenslaag. Elke test toonde eerst de bug.
// Het schermgedrag (twee tabbladen, de kop van een maaltijd, Escape, herladen, middernacht, thema, demo, Delen) staat in
// tests/e2e/x-bugs-r5.spec.js.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister, zend } from '../../src/kern/bus.js';
import { plusDagen, vandaag, weekStart } from '../../src/kern/datum.js';
import { opmaakLiter } from '../../src/kern/getal.js';
import { bewaarMaaltijd, leesMaaltijden } from '../../src/data/maaltijden.js';
import { leesDag, zetNotitie } from '../../src/data/dagen.js';
import { leesInstelling, STANDAARD, zetInstelling } from '../../src/data/instellingen.js';
import { leesVerslag } from '../../src/data/verslag.js';
import { wisAlles } from '../../src/data/wissen.js';
import * as wegingen from '../../src/data/wegingen.js';

const V = vandaag();

// Een eenvoudige Storage voor Node (localStorage bestaat daar niet).
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

beforeEach(async () => {
  await db.delete();
  await openDb();
  globalThis.localStorage = new Opslag();
  globalThis.sessionStorage = new Opslag();
});
afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

function vang(naam) {
  const lijst = [];
  const meldAf = luister(naam, (detail) => lijst.push(detail));
  return { lijst, meldAf };
}

describe('R5-01 twee tabbladen overschrijven elkaar niet', () => {
  test('twee gelijktijdige wijzigingen van dezelfde maaltijd (tekst en uur) blijven allebei staan', async () => {
    await Promise.all([bewaarMaaltijd(V, 'ontbijt', { tekst: 'Havermout' }), bewaarMaaltijd(V, 'ontbijt', { tijd: '09:15' })]);
    expect((await leesMaaltijden(V)).ontbijt).toMatchObject({ tekst: 'Havermout', tijd: '09:15' });
  });

  test('een wijziging in dit tabblad gaat naar de andere tabbladen; een wijziging van elders komt binnen als elders:gewijzigd', async () => {
    const { startKanaal, KANAAL } = await import('../../src/data/kanaal.js');
    const ander = new BroadcastChannel(KANAAL);
    const ontvangen = [];
    ander.onmessage = (e) => ontvangen.push(e.data);
    const stop = startKanaal();
    const elders = vang('elders:gewijzigd');
    try {
      await zetNotitie(V, 'uit dit tabblad');
      await zetInstelling('drinken.dagdoelMl', 3000);
      await new Promise((klaar) => setTimeout(klaar, 50));
      expect(ontvangen).toEqual([
        { naam: 'data:gewijzigd', detail: { store: 'dagen', datum: V } },
        { naam: 'instelling:gewijzigd', detail: { sleutel: 'drinken.dagdoelMl', waarde: 3000 } },
      ]);
      // Wat van elders komt, wordt niet teruggestuurd en zet geen badges of meldingen in gang: alleen elders:gewijzigd.
      const data = vang('data:gewijzigd');
      ander.postMessage({ naam: 'data:gewijzigd', detail: { store: 'maaltijden', datum: V } });
      await new Promise((klaar) => setTimeout(klaar, 50));
      data.meldAf();
      expect(elders.lijst).toEqual([{ naam: 'data:gewijzigd', store: 'maaltijden', datum: V }]);
      expect(data.lijst).toEqual([]);
      expect(ontvangen).toHaveLength(2);
    } finally {
      stop();
      elders.meldAf();
      ander.close();
    }
  });
});

describe('R5-03 het vangnet voor tekst die nog niet bewaard was', () => {
  test('wat in het vangnet staat, wordt bij de volgende start bewaard en het vangnet is meteen weg', async () => {
    const { legInVangnet, herstelVangnet, VANGNET_SLEUTEL } = await import('../../src/data/vangnet.js');
    legInVangnet([
      { soort: 'maaltijd', datum: V, maaltijd: 'ontbijt', tekst: 'Half getypt' },
      { soort: 'notitie', datum: V, tekst: 'Notitie half' },
    ]);
    expect(localStorage.getItem(VANGNET_SLEUTEL)).toContain('Half getypt');
    expect(await herstelVangnet()).toBe(2);
    expect(localStorage.getItem(VANGNET_SLEUTEL)).toBeNull();
    expect((await leesMaaltijden(V)).ontbijt.tekst).toBe('Half getypt');
    expect((await leesDag(V)).notitie).toBe('Notitie half');
    expect(await herstelVangnet()).toBe(0);
  });

  test('een kapot of vreemd vangnet doet niets en wordt toch gewist', async () => {
    const { herstelVangnet, VANGNET_SLEUTEL } = await import('../../src/data/vangnet.js');
    localStorage.setItem(VANGNET_SLEUTEL, '{kapot');
    expect(await herstelVangnet()).toBe(0);
    localStorage.setItem(VANGNET_SLEUTEL, JSON.stringify([{ soort: 'iets', datum: V }, { soort: 'maaltijd', datum: 'gisteren', maaltijd: 'ontbijt', tekst: 'x' }]));
    expect(await herstelVangnet()).toBe(0);
    expect(localStorage.getItem(VANGNET_SLEUTEL)).toBeNull();
  });

  test('"Profiel verwijderen" wist ook het vangnet', async () => {
    const { legInVangnet, VANGNET_SLEUTEL } = await import('../../src/data/vangnet.js');
    legInVangnet([{ soort: 'notitie', datum: V, tekst: 'privé' }]);
    await wisAlles();
    expect(localStorage.getItem(VANGNET_SLEUTEL)).toBeNull();
  });
});

describe('R5-05 het gemiddelde in het verslag wordt één keer afgerond', () => {
  test('11 dagen samen 16 000 ml: 1,45 l gemiddeld (niet 1,46 l)', async () => {
    // BESLISSING 449: het gemiddelde deelt door alle verstreken dagen van de periode, dus een periode van precies 11 dagen (16 000 / 11 = 1 454,5 ml)
    const tot = plusDagen(V, -1);
    const van = plusDagen(tot, -10);
    const per = [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1000];
    for (let i = 0; i < per.length; i += 1) await db.dranken.add({ datum: plusDagen(van, i), tijdstip: i, soort: 'water', ml: per[i], voorbeeld: false });
    const v = await leesVerslag({ van, tot, onderdelen: { eten: true, drinken: true, gewicht: false, notities: false } });
    expect(opmaakLiter(v.samenvatting.gemiddeldMl)).toBe(opmaakLiter(1450)); // 1,45 l (met een vaste spatie)
  });
});

describe('R5-06 een ongeldig dagdoel in de opslag geldt als het standaard dagdoel', () => {
  test.each([0, -500, 10000, 'veel', null])('dagdoel %s → standaard', async (waarde) => {
    await db.instellingen.put({ sleutel: 'drinken.dagdoelMl', waarde });
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(STANDAARD['drinken.dagdoelMl']);
  });
  test('een dagdoel binnen de grenzen blijft', async () => {
    await zetInstelling('drinken.dagdoelMl', 3000);
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(3000);
  });
});

describe('R2-18 een weging naar een andere week verhuizen (BESLISSING 409)', () => {
  const W2 = weekStart(plusDagen(V, -14));
  const W1 = weekStart(plusDagen(V, -21));
  test('de oude week wordt leeg, de nieuwe krijgt de weging', async () => {
    const oud = await wegingen.bewaarWeging(plusDagen(W2, 1), 70);
    await wegingen.verhuisWeging(oud, plusDagen(W1, 2), 69.5);
    expect((await wegingen.leesWegingen()).map((w) => [w.week, w.kg])).toEqual([[W1, 69.5]]);
  });
  test('in dezelfde week is verhuizen gewoon aanpassen', async () => {
    const oud = await wegingen.bewaarWeging(W2, 70);
    await wegingen.verhuisWeging(oud, plusDagen(W2, 3), 71);
    expect((await wegingen.leesWegingen()).map((w) => [w.datum, w.kg])).toEqual([[plusDagen(W2, 3), 71]]);
  });
  test('herstelWegingen zet alles terug: de verhuisde én de vervangen weging', async () => {
    const oud = await wegingen.bewaarWeging(plusDagen(W2, 1), 70);
    const vervangen = await wegingen.bewaarWeging(plusDagen(W1, 4), 68);
    const nieuw = await wegingen.verhuisWeging(oud, plusDagen(W1, 2), 69.5);
    const data = vang('data:gewijzigd');
    await wegingen.herstelWegingen({ weg: [nieuw.week], terug: [oud, vervangen] });
    data.meldAf();
    expect(await wegingen.leesWegingen()).toEqual([vervangen, oud]);
    expect(data.lijst.length).toBeGreaterThan(0);
  });
});

test('zend blijft werken voor wie niets van tabbladen weet', () => {
  const d = vang('data:gewijzigd');
  zend('data:gewijzigd', { store: 'x' });
  d.meldAf();
  expect(d.lijst).toEqual([{ store: 'x' }]);
});
