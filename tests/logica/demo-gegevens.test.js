// De voorbeeldgegevens van de demoversie (BESLISSING 364): deterministisch, 28 dagen tot en met vandaag, kloppend met de regels van de app,
// en reeks en badges volgen uit de echte logica.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { bouwDemo, vulDemo, vulDemoAlsLeeg, begin, GEBRUIKTE_NAMEN, DEMO_NAAM, AANTAL_DAGEN, DOEL_ML } from '../../src/demo/voorbeelddata.js';
import { plusDagen, vandaag, weekStart, weekdag } from '../../src/kern/datum.js';
import { DRANKSOORTEN } from '../../src/data/dranken.js';
import { MAALTIJDSOORTEN } from '../../src/data/maaltijden.js';
import { leesReeks } from '../../src/data/statistiek.js';
import { leesBadgeStats } from '../../src/data/badges.js';
import { ALLE_BADGES, verdiendAlle, voortgangVan } from '../../src/logica/badgeregels.js';
import { isSpuit, MOMENTEN, reeksdatums } from '../../src/logica/supplementen.js';
import { leesInstelling } from '../../src/data/instellingen.js';

const NU = new Date(2026, 10, 15, 14, 30);
const DAG = vandaag(NU);

// De badges die de demo als behaald toont, en de nog niet behaalde met minstens 70 procent voortgang (BESLISSING 401).
const BEHAALD = ['eerste-bladzijde', 'week-vol', 'eerste-kan', 'tien-kannen', 'kanttekening', 'gemoed', 'eerste-potje', 'drie-op-rij', 'week-op-rij', 'eerste-maaltijd', 'vijftig-maaltijden', 'eerste-favoriet', 'alles-afgevinkt', 'week-trouw', 'zeven-energie', 'eerste-weging', 'dag-rond'];
const BIJNA = ['dertig-stemmingen', 'maand-vol', 'twee-weken', 'trouw', 'week-water', 'vier-wegingen', 'zeven-dagen-rond'];

afterEach(() => vi.useRealTimers());

// Vaste klok (net als de vaste tijdzone, BESLISSING 408): de reeks en de badges rekenen met de echte datum van vandaag (leesReeks gebruikt vandaag()).
// Zonder deze klok viel de test rood zodra de echte dag meer dan twee dagen na NU lag.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NU });
  await db.delete();
  await openDb();
});

describe('de rijen', () => {
  const r = bouwDemo(NU);

  test('twee keer bouwen geeft hetzelfde (geen toeval)', () => {
    expect(bouwDemo(NU)).toEqual(r);
  });

  test('28 dagen, tot en met vandaag; drie lege dagen op een rij (een lang weekend weg)', () => {
    expect(r.dagen).toHaveLength(AANTAL_DAGEN);
    expect(r.dagen[0].datum).toBe(plusDagen(DAG, -27));
    expect(r.dagen.at(-1).datum).toBe(DAG);
    expect(new Set(r.dagen.map((d) => d.datum)).size).toBe(28);
    const leeg = r.dagen.filter((d) => !r.maaltijden.some((m) => m.datum === d.datum) && !r.dranken.some((x) => x.datum === d.datum) && !r.innames.some((x) => x.datum === d.datum));
    expect(leeg.map((d) => d.datum).slice(0, 3)).toEqual([plusDagen(DAG, -12), plusDagen(DAG, -11), plusDagen(DAG, -10)]);
  });

  test('de enige naam is Sofie, en geen enkele rij is een voorbeeld-rij van de oude voorbeeldfunctie', () => {
    expect(GEBRUIKTE_NAMEN).toEqual(['Sofie']);
    expect(r.instellingen.find((i) => i.sleutel === 'profiel.naam').waarde).toBe(DEMO_NAAM);
    const alles = JSON.stringify(r);
    expect(alles.match(/Sofie/g)).toHaveLength(1);
    for (const lijst of [r.dagen, r.maaltijden, r.dranken, r.wegingen, r.innames, r.supplementen]) expect(lijst.every((x) => x.voorbeeld === false)).toBe(true);
  });

  test('maaltijden: bestaande momenten, geen foto, vandaag half ingevuld, uren die passen', () => {
    for (const m of r.maaltijden) {
      expect(MAALTIJDSOORTEN).toContain(m.soort);
      expect(m.fotoId).toBeNull();
      expect(m.tekst.length).toBeGreaterThan(0);
      expect(m.tekst.length).toBeLessThanOrEqual(24);
    }
    const vandaagM = r.maaltijden.filter((m) => m.datum === DAG);
    expect(vandaagM.map((m) => m.soort)).toEqual(['ontbijt', 'tussendoortje', 'middagmaal']);
    const perDag = new Map();
    for (const m of r.maaltijden) perDag.set(m.datum, (perDag.get(m.datum) ?? 0) + 1);
    const aantallen = r.dagen.map((d) => perDag.get(d.datum) ?? 0);
    expect(Math.max(...aantallen)).toBe(6);
    expect(aantallen.slice(0, 27).filter((n) => n >= 4).length).toBeGreaterThanOrEqual(17);
    expect(aantallen.slice(0, 27).filter((n) => n < 4).length).toBeGreaterThanOrEqual(2); // de drie lege dagen tellen mee
    for (const m of r.maaltijden.filter((x) => x.datum !== DAG && x.soort === 'ontbijt')) expect(m.tijd >= '07:00' && m.tijd <= '09:30').toBe(true);
    for (const m of r.maaltijden.filter((x) => x.datum !== DAG && x.soort === 'avondmaal')) expect(m.tijd >= '18:00' && m.tijd <= '19:30').toBe(true);
  });

  test('drinken: de zes soorten komen voor, dagen rond, boven en onder het doel, vandaag 1450 ml', () => {
    const ml = new Map();
    for (const d of r.dranken) {
      expect(DRANKSOORTEN).toContain(d.soort);
      expect(d.ml).toBeGreaterThan(0);
      ml.set(d.datum, (ml.get(d.datum) ?? 0) + d.ml);
    }
    expect(new Set(r.dranken.map((d) => d.soort)).size).toBeGreaterThanOrEqual(5);
    expect(ml.get(DAG)).toBe(1450);
    const eerder = r.dagen.slice(0, 27).map((d) => ml.get(d.datum) ?? 0);
    expect(eerder.filter((x) => x >= DOEL_ML).length).toBeGreaterThanOrEqual(15);
    expect(eerder.filter((x) => x < DOEL_ML).length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...eerder)).toBeGreaterThan(DOEL_ML + 300);
    for (const d of r.dagen) expect(d.doelGehaald).toBe((ml.get(d.datum) ?? 0) >= DOEL_ML);
  });

  test('niets ligt in de toekomst', () => {
    for (const lijst of [r.dranken, r.innames]) for (const x of lijst) expect(x.tijdstip).toBeLessThanOrEqual(NU.getTime());
    const vroeg = bouwDemo(new Date(2026, 10, 15, 6, 0));
    for (const x of [...vroeg.dranken, ...vroeg.innames]) expect(x.tijdstip).toBeLessThanOrEqual(new Date(2026, 10, 15, 6, 0).getTime());
  });

  test('stemming, energie en notities', () => {
    expect(r.dagen.filter((d) => d.stemming != null).length).toBeGreaterThanOrEqual(20);
    expect(r.dagen.filter((d) => d.energie != null).length).toBeGreaterThanOrEqual(20);
    for (const d of r.dagen) for (const w of [d.stemming, d.energie]) expect(w === null || (Number.isInteger(w) && w >= 1 && w <= 5)).toBe(true);
    expect(r.dagen.filter((d) => d.notitie).length).toBeGreaterThanOrEqual(5);
  });

  test('supplementen: algemene namen, drie momenten, een spuit om de 14 dagen met een geplande dag', () => {
    expect(r.supplementen.map((s) => s.naam)).toEqual(['Multivitamine', 'Vitamine C', 'Kurkuma', 'Voorbeeldspuit']);
    const dagelijks = r.supplementen.filter((s) => s.ritme.soort === 'dagelijks');
    expect(dagelijks.flatMap((s) => s.momenten).sort()).toEqual([...MOMENTEN].sort());
    const spuit = r.supplementen.find((s) => s.ritme.soort === 'interval');
    expect(isSpuit(spuit)).toBe(true);
    expect(spuit.ritme.dagen).toBe(14);
    const komend = reeksdatums(spuit.ritme, plusDagen(DAG, 1), plusDagen(DAG, 30));
    expect(komend.length).toBeGreaterThanOrEqual(1);
    expect(komend[0] <= plusDagen(DAG, 14)).toBe(true);
    // vandaag alleen de ochtend genomen
    expect(r.innames.filter((i) => i.datum === DAG).map((i) => i.moment)).toEqual(['ochtend']);
    // op veel dagen één moment gemist: "Veertien dagen vol" is nog niet gehaald, "Zeven dagen trouw" wel
    const volledig = r.dagen.slice(0, 27).filter((d) => r.innames.filter((i) => i.datum === d.datum && i.moment !== 'dag').length === 3).length;
    expect(volledig).toBeGreaterThanOrEqual(7);
    expect(volledig).toBeLessThan(14);
  });

  test('gewicht: drie wegingen (één weegdag overgeslagen), elk op de weegdag in een eigen week, licht dalend, met streefgewicht', () => {
    expect(r.wegingen).toHaveLength(3);
    for (const w of r.wegingen) {
      expect([1, 2]).toContain(weekdag(w.datum)); // de weegdag, of de dag erna als die in het lange weekend viel
      expect(w.week).toBe(weekStart(w.datum));
      expect(w.datum <= DAG).toBe(true);
    }
    expect(new Set(r.wegingen.map((w) => w.week)).size).toBe(3);
    const kg = r.wegingen.map((w) => w.kg);
    expect(kg[2]).toBeLessThan(kg[0]);
    const streef = r.instellingen.find((i) => i.sleutel === 'gewicht.streefKg').waarde;
    expect(streef).toBeLessThan(kg[2]);
  });

  test('favorieten: 3 tot 4, instellingen: welkom klaar, Poeder, 2,5 liter', () => {
    expect(r.favorieten.length).toBeGreaterThanOrEqual(3);
    expect(r.favorieten.length).toBeLessThanOrEqual(4);
    const inst = Object.fromEntries(r.instellingen.map((i) => [i.sleutel, i.waarde]));
    expect(inst['start.klaar']).toBe(true);
    expect(inst['thema.keuze']).toBe('poeder');
    expect(inst['drinken.dagdoelMl']).toBe(2500);
  });
});

describe('in de database, met de echte logica', () => {
  test('eerste bezoek vult één keer; een tweede keer niet', async () => {
    expect(await vulDemoAlsLeeg(NU)).toBe(true);
    expect(await db.dagen.count()).toBe(28);
    expect(await vulDemoAlsLeeg(NU)).toBe(false);
    expect(await leesInstelling('profiel.naam')).toBe('Sofie');
  });

  test('de reeks en de badges volgen uit de gegevens', async () => {
    await vulDemo(NU);
    const reeks = await leesReeks();
    expect(reeks.lopendeReeks).toBe(10); // onderbroken door het lange weekend
    expect(reeks.dagenBijgehouden).toBe(25);
    const stats = await leesBadgeStats();
    expect(stats.volledigeMomentDagen).toBe(11);
    expect(stats.dagRondDagen).toBe(6);
    const ids = verdiendAlle(stats);
    for (const id of BEHAALD) expect(ids).toContain(id);
    const bewaard = await db.badges.toArray();
    expect(bewaard.map((b) => b.id).sort()).toEqual([...ids].sort());
    expect(bewaard.every((b) => b.gezien === true)).toBe(true); // geen viering of melding bij de start
    expect(ids).not.toContain('maand-vol');
    expect(ids).not.toContain('eerste-verslag');
  });

  test('ongeveer de helft van de badges is behaald (BESLISSING 401) en een paar zijn bijna behaald', async () => {
    await vulDemo(NU);
    const stats = await leesBadgeStats();
    const ids = verdiendAlle(stats);
    expect(ids.slice().sort()).toEqual([...BEHAALD].sort());
    expect(ALLE_BADGES).toHaveLength(33);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(ids.length).toBeLessThanOrEqual(18);
    const bijna = ALLE_BADGES.filter((b) => !ids.includes(b.id)).filter((b) => (voortgangVan(b.id, stats)?.fractie ?? 0) >= 0.7).map((b) => b.id);
    expect(bijna.sort()).toEqual([...BIJNA].sort());
  });

  test('Opnieuw beginnen wist de database en vult opnieuw, ook na een eigen wijziging', async () => {
    await vulDemo(NU);
    await db.dranken.add({ datum: DAG, tijdstip: NU.getTime(), soort: 'water', ml: 800, voorbeeld: false });
    await db.maaltijden.put({ datum: DAG, soort: 'avondmaal', tijd: '18:00', tekst: 'Eigen maaltijd', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
    const voor = bouwDemo(NU);
    await begin(NU);
    expect(await db.dranken.count()).toBe(voor.dranken.length);
    expect(await db.maaltijden.count()).toBe(voor.maaltijden.length);
    expect(await db.maaltijden.get([DAG, 'avondmaal'])).toBeUndefined();
    expect(await db.dagen.count()).toBe(28);
  });
});

describe('stabiel over de dagen: de demo schuift mee met vandaag, de behaalde badges blijven dezelfde', () => {
  // Zestien opeenvolgende dagen (twee volle weken), de 1e en de 31e van een maand, jaarwissel, wintertijd en een schrikkeldag.
  const DAGEN = [];
  for (let d = 0; d < 16; d++) DAGEN.push(new Date(2026, 10, 9 + d));
  DAGEN.push(new Date(2026, 9, 31), new Date(2026, 10, 1), new Date(2026, 11, 1), new Date(2026, 11, 31), new Date(2027, 0, 1), new Date(2027, 0, 31), new Date(2027, 1, 1), new Date(2027, 2, 1), new Date(2027, 2, 31), new Date(2026, 9, 25), new Date(2028, 1, 29), new Date(2028, 2, 1));

  test.each([[14, 30], [6, 0]])('om %i:%i op alle geteste dagen', async (uur, minuut) => {
    for (const dag of DAGEN) {
      const nu = new Date(dag.getFullYear(), dag.getMonth(), dag.getDate(), uur, minuut);
      vi.useFakeTimers({ toFake: ['Date'], now: nu });
      await db.delete();
      await openDb();
      await vulDemo(nu);
      const stats = await leesBadgeStats();
      const label = vandaag(nu);
      expect(verdiendAlle(stats).sort(), label).toEqual([...BEHAALD].sort());
      expect((await db.badges.toArray()).map((b) => b.id).sort(), label).toEqual([...BEHAALD].sort());
      expect([stats.lopendeReeks, stats.dagenBijgehouden, stats.wegingen, stats.volledigeMomentDagen, stats.dagRondDagen], label).toEqual([10, 25, 3, 11, 6]);
      vi.useRealTimers();
    }
  }, 120000);
});

describe('terugkomen op een latere dag (review R6-04)', () => {
  const DAG1 = new Date(2026, 10, 9, 14, 30);
  const DAG8 = new Date(2026, 10, 16, 9, 0);

  test('niets gewijzigd: op dag 8 wordt stil opnieuw gevuld voor die dag', async () => {
    await vulDemoAlsLeeg(DAG1);
    expect(await db.dagen.get(vandaag(DAG8))).toBeUndefined();
    expect(await vulDemoAlsLeeg(DAG8)).toBe(true);
    expect(await db.dagen.count()).toBe(28);
    expect((await db.dagen.toArray()).map((d) => d.datum).sort().at(-1)).toBe(vandaag(DAG8));
    expect((await db.maaltijden.where('datum').equals(vandaag(DAG8)).count())).toBeGreaterThan(0);
    expect((await db.badges.count())).toBe(17);
  });

  test('zelfde dag: niets gebeurt', async () => {
    await vulDemoAlsLeeg(DAG1);
    expect(await vulDemoAlsLeeg(new Date(2026, 10, 9, 20, 0))).toBe(false);
  });

  test('eigen wijziging: op dag 8 blijft alles staan', async () => {
    await vulDemoAlsLeeg(DAG1);
    await db.dranken.add({ datum: vandaag(DAG1), tijdstip: DAG1.getTime(), soort: 'water', ml: 200, voorbeeld: false });
    expect(await vulDemoAlsLeeg(DAG8)).toBe(false);
    expect(await db.dagen.get(vandaag(DAG8))).toBeUndefined();
    expect(await db.dranken.where('datum').equals(vandaag(DAG1)).count()).toBeGreaterThan(0);
  });

  test('een gewijzigde weging of notitie telt ook als eigen wijziging', async () => {
    await vulDemoAlsLeeg(DAG1);
    await db.dagen.update(vandaag(DAG1), { notitie: 'Eigen notitie' });
    expect(await vulDemoAlsLeeg(DAG8)).toBe(false);
  });
});
