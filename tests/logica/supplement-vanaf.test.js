// BESLISSING 698: een supplement telt vanaf de dag dat het toegevoegd wordt (met de hand of uit een bestand). Vroegere dagen blijven zoals ze
// waren en tellen niet als onvolledig. "Begint op" (vanaf) gaat voor, ook met een vroegere datum. De dag van toevoegen staat in teltVanaf en
// gaat nooit mee in een bestand. Supplementen van vóór deze beslissing hebben geen teltVanaf en tellen zoals vroeger.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag, weekStart } from '../../src/kern/datum.js';
import { schemaVanDag, voegSupplementToe, wijzigSupplement, zetInname } from '../../src/data/supplementen.js';
import { leesAgenda } from '../../src/data/agenda.js';
import { beginVan, grensVan, reeksdatums, rooster, telMomenten, telRooster } from '../../src/logica/supplementen.js';
import { formulierVan } from '../../src/logica/supplementformulier.js';
import { leesMaand, leesReeks, leesStats, leesWeekoverzicht } from '../../src/data/statistiek.js';
import { controleerBadges, leesBadgeStats } from '../../src/data/badges.js';
import { neemOver } from '../../src/data/supplementenbestand.js';
import { SOORT, VERSIE, leesBestand, maakBestand } from '../../src/logica/supplementenbestand.js';
import { wisAlles } from '../../src/data/wissen.js';

const dag = (n) => plusDagen(vandaag(), n);
const namenOp = (schema) => schema.momenten.flatMap((m) => m.items.map((i) => `${m.moment}:${i.supplement.naam}:${i.genomen ? 'ja' : 'nee'}`));

beforeEach(async () => {
  await openDb();
  await wisAlles();
});

describe('met de hand toevoegen', () => {
  test('vandaag toegevoegd: gisteren niet gepland, vandaag wel; het formulier houdt "Begint op" leeg', async () => {
    const a = await voegSupplementToe({ naam: 'Vitamine D', momenten: ['ochtend', 'avond'] });
    expect(a.teltVanaf).toBe(vandaag());
    expect(a.vanaf).toBeUndefined();
    expect(formulierVan(a, vandaag()).vanaf).toBe('');
    expect(namenOp(await schemaVanDag(dag(-1)))).toEqual([]);
    expect(namenOp(await schemaVanDag(dag(0)))).toEqual(['ochtend:Vitamine D:nee', 'avond:Vitamine D:nee']);
    expect(telRooster(await schemaVanDag(dag(-1)))).toEqual({ genomen: 0, totaal: 0 });
    // Ook morgen en later blijft het gepland.
    expect(namenOp(await schemaVanDag(dag(3)))).toHaveLength(2);
  });

  test('de dag van toevoegen is de lokale dag in Brussel, ook net na middernacht', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 00:30 in Brussel op 19 november is nog 18 november in UTC: de dag van toevoegen is 19 november.
      vi.setSystemTime(new Date('2026-11-18T23:30:00Z'));
      const a = await voegSupplementToe({ naam: 'Zink' });
      expect(a.teltVanaf).toBe('2026-11-19');
      // 23:30 in Brussel op 18 november.
      vi.setSystemTime(new Date('2026-11-18T22:30:00Z'));
      const b = await voegSupplementToe({ naam: 'Omega 3' });
      expect(b.teltVanaf).toBe('2026-11-18');
    } finally {
      vi.useRealTimers();
    }
  });

  test('"Begint op" vroeger ingevuld gaat voor: gepland vanaf die dag, niet de dag ervoor', async () => {
    const a = await voegSupplementToe({ naam: 'Magnesium', momenten: ['avond'], vanaf: dag(-5) });
    expect(a.teltVanaf).toBe(vandaag());
    expect(beginVan(a)).toBe(dag(-5));
    expect(namenOp(await schemaVanDag(dag(-6)))).toEqual([]);
    expect(namenOp(await schemaVanDag(dag(-5)))).toEqual(['avond:Magnesium:nee']);
    expect(namenOp(await schemaVanDag(dag(-1)))).toEqual(['avond:Magnesium:nee']);
  });

  test('"Begint op" later ingevuld: telt pas vanaf die dag en staat tot dan onder binnenkort', async () => {
    await voegSupplementToe({ naam: 'B12 tablet', vanaf: dag(3) });
    const nu = await schemaVanDag(dag(0));
    expect(nu.momenten).toEqual([]);
    expect(nu.binnenkort.map((b) => b.vanaf)).toEqual([dag(3)]);
    expect(namenOp(await schemaVanDag(dag(3)))).toEqual(['ochtend:B12 tablet:nee']);
  });

  test('een vroegere dag die afgevinkt is, blijft zichtbaar en telt, wat er ook in de velden staat', async () => {
    const a = await voegSupplementToe({ naam: 'Vitamine D', momenten: ['ochtend', 'avond'] });
    const p = await voegSupplementToe({ naam: 'IJzerspuit', ritme: { soort: 'interval', dagen: 14, start: dag(-4) } });
    // Een vinkje op een dag vóór de dag van toevoegen (zoals na vervangen uit een bestand, of bij gegevens van vroeger).
    await db.momentinnames.put({ datum: dag(-3), supplementId: a.id, moment: 'ochtend', tijdstip: 1, voorbeeld: false });
    await db.momentinnames.put({ datum: dag(-4), supplementId: p.id, moment: 'dag', tijdstip: 1, voorbeeld: false });
    const s3 = await schemaVanDag(dag(-3));
    expect(namenOp(s3)).toEqual(['ochtend:Vitamine D:ja']); // de avond was toen nog niet gepland
    expect(telRooster(s3)).toEqual({ genomen: 1, totaal: 1 });
    expect(telMomenten(s3)).toEqual({ klaar: 1, totaal: 1 });
    const s4 = await schemaVanDag(dag(-4));
    expect(s4.periodiek.map((x) => [x.supplement.naam, x.genomen])).toEqual([['IJzerspuit', true]]);
    expect(telRooster(s4)).toEqual({ genomen: 1, totaal: 1 });
    const maand = await leesMaand(dag(-3).slice(0, 7));
    expect(maand[dag(-3)].supplementen).toEqual({ genomen: 1, totaal: 1 });
    // Ook met "Begint op" later dan die dag blijft het vinkje staan.
    await wijzigSupplement(a.id, { vanaf: dag(2) });
    expect(namenOp(await schemaVanDag(dag(-3)))).toEqual(['ochtend:Vitamine D:ja']);
  });

  test('bewerken verschuift de dag van toevoegen niet; "Begint op" leegmaken valt terug op die dag', async () => {
    const a = await voegSupplementToe({ naam: 'Vitamine D' });
    // Toegevoegd tien dagen geleden.
    await db.supplementen.update(a.id, { teltVanaf: dag(-10) });
    const na = await wijzigSupplement(a.id, { naam: 'Vitamine D3', momenten: ['middag'], hoeveelheid: '2 pilletjes', vanaf: dag(-20) });
    expect(na.teltVanaf).toBe(dag(-10));
    expect((await db.supplementen.get(a.id)).teltVanaf).toBe(dag(-10));
    expect(namenOp(await schemaVanDag(dag(-20)))).toEqual(['middag:Vitamine D3:nee']);
    await wijzigSupplement(a.id, { vanaf: '' });
    const leeg = await db.supplementen.get(a.id);
    expect(leeg.vanaf).toBeUndefined();
    expect(leeg.teltVanaf).toBe(dag(-10));
    expect(namenOp(await schemaVanDag(dag(-11)))).toEqual([]);
    expect(namenOp(await schemaVanDag(dag(-10)))).toEqual(['middag:Vitamine D3:nee']);
    // Van dagelijks naar periodiek en terug: de dag van toevoegen blijft.
    await wijzigSupplement(a.id, { ritme: { soort: 'interval', dagen: 14, start: dag(-30) } });
    await wijzigSupplement(a.id, { ritme: { soort: 'dagelijks' }, momenten: ['avond'] });
    expect((await db.supplementen.get(a.id)).teltVanaf).toBe(dag(-10));
  });
});

describe('een spuit met een start in het verleden', () => {
  test('vandaag toegevoegd: de reeks ligt vast op de start, maar een beurt vóór vandaag is niet te doen en niet gemist', async () => {
    const p = await voegSupplementToe({ naam: 'IJzerspuit', ritme: { soort: 'interval', dagen: 14, start: dag(-9) } });
    const nu = await schemaVanDag(dag(0));
    expect(nu.periodiek[0]).toMatchObject({ aanDeBeurt: false, beurtDatum: null, volgende: dag(5), geplandVandaag: false });
    expect(telRooster(nu)).toEqual({ genomen: 0, totaal: 0 });
    // Op de startdag zelf (vóór de dag van toevoegen) telt de beurt niet als gepland.
    const start = await schemaVanDag(dag(-9));
    expect(start.periodiek[0]).toMatchObject({ aanDeBeurt: false, geplandVandaag: false, volgende: dag(5) });
    expect(telRooster(start)).toEqual({ genomen: 0, totaal: 0 });
    // De volgende datum van de reeks telt wel: start + 14.
    const later = await schemaVanDag(dag(5));
    expect(later.periodiek[0]).toMatchObject({ aanDeBeurt: true, geplandVandaag: true, beurtDatum: dag(5) });
    // De kalender van de spuiten (agenda) hoort dezelfde grens te gebruiken: grensVan geeft de datums vanaf vandaag.
    expect(reeksdatums(p.ritme, dag(-30), dag(30), grensVan(p))).toEqual([dag(5), dag(19)]);
    // Zonder die grens zou dag -9 als gemist verschijnen (zo rekende data/agenda.js vóór deze wijziging).
    expect(reeksdatums(p.ritme, dag(-30), dag(30), { vanaf: p.vanaf, tot: p.tot })).toEqual([dag(-9), dag(5), dag(19)]);
    // De agenda zelf: dag -9 staat er niet in, dag 5 en 19 zijn gepland.
    const agenda = await leesAgenda(dag(-30), dag(30));
    expect(Object.keys(agenda)).toEqual([dag(5), dag(19)]);
    expect(agenda[dag(5)][0]).toMatchObject({ naam: 'IJzerspuit', status: 'gepland' });
  });

  test('agenda: een beurt vóór de grens die al is afgevinkt blijft zichtbaar, een niet afgevinkte niet', async () => {
    const p = await voegSupplementToe({ naam: 'IJzerspuit', ritme: { soort: 'interval', dagen: 14, start: dag(-9) } });
    await db.momentinnames.put({ datum: dag(-9), supplementId: p.id, moment: 'dag', tijdstip: 1, voorbeeld: false });
    const agenda = await leesAgenda(dag(-30), dag(30));
    expect(Object.keys(agenda)).toEqual([dag(-9), dag(5), dag(19)]);
    expect(agenda[dag(-9)][0].status).toBe('afgevinkt');
    expect(agenda[dag(5)][0].status).toBe('gepland');
  });

  test('met "Begint op" vroeger dan de start: de beurt van de start is te doen, zoals vroeger', async () => {
    await voegSupplementToe({ naam: 'IJzerspuit', ritme: { soort: 'interval', dagen: 14, start: dag(-9) }, vanaf: dag(-20) });
    const nu = await schemaVanDag(dag(0));
    expect(nu.periodiek[0]).toMatchObject({ aanDeBeurt: true, beurtDatum: dag(-9), volgende: dag(5) });
    expect(telRooster(await schemaVanDag(dag(-9)))).toEqual({ genomen: 0, totaal: 1 });
  });

  test('een start in de toekomst (de gewone manier: de datum van de volgende keer) verandert niet', async () => {
    const p = await voegSupplementToe({ naam: 'B12 spuit', ritme: { soort: 'maand', start: dag(9) } });
    expect((await schemaVanDag(dag(0))).periodiek[0]).toMatchObject({ aanDeBeurt: false, volgende: dag(9) });
    expect(reeksdatums(p.ritme, dag(0), dag(9), grensVan(p))).toEqual([dag(9)]);
  });
});

describe('bestaande gegevens (zonder teltVanaf) tellen zoals vroeger', () => {
  // Een profiel van vóór BESLISSING 698: de rijen staan rechtstreeks in de database, zonder teltVanaf, zoals een bestaande gebruiker ze heeft.
  // De verwachte cijfers hieronder zijn met de code van vóór deze wijziging nagerekend (zelfde test, oude rooster): ze zijn gelijk.
  async function oudProfiel() {
    const basis = { dosis: '', aanwijzing: '', voorbeeld: false, actief: true, aangemaaktOp: Date.now() };
    await db.supplementen.bulkPut([
      { id: 1, naam: 'Vitamine D', hoeveelheid: '1 pilletje', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, ...basis },
      { id: 2, naam: 'Magnesium', hoeveelheid: '1 schepje', momenten: ['avond'], ritme: { soort: 'dagelijks' }, volgorde: 2, ...basis },
      { id: 3, naam: 'IJzerspuit', hoeveelheid: '1 ampul', momenten: [], ritme: { soort: 'interval', dagen: 14, start: dag(-20) }, volgorde: 3, ...basis },
    ]);
    const vink = (n, id, moment) => db.momentinnames.put({ datum: dag(n), supplementId: id, moment, tijdstip: 1, voorbeeld: false });
    // Twintig dagen terug: om de dag alles afgevinkt, de andere dagen alleen de ochtend.
    for (let n = -20; n <= -1; n += 1) {
      await vink(n, 1, 'ochtend');
      if (n % 2 === 0) await vink(n, 2, 'avond');
    }
    await vink(-20, 3, 'dag');
  }

  test('rooster, maand, week, stats, reeks en badges blijven gelijk', async () => {
    await oudProfiel();
    for (const s of await db.supplementen.toArray()) expect(s.teltVanaf).toBeUndefined();
    // Een dag van vóór de eerste inname: de supplementen stonden toen al gepland (zoals vroeger), niet weggevallen.
    expect(namenOp(await schemaVanDag(dag(-30)))).toEqual(['ochtend:Vitamine D:nee', 'avond:Magnesium:nee']);
    // Dag -6 is een datum van de spuit (start -20, om de 14 dagen) en die beurt is niet afgevinkt.
    expect(telRooster(await schemaVanDag(dag(-6)))).toEqual({ genomen: 2, totaal: 3 });
    expect(telRooster(await schemaVanDag(dag(-3)))).toEqual({ genomen: 1, totaal: 2 });
    expect(telMomenten(await schemaVanDag(dag(-3)))).toEqual({ klaar: 1, totaal: 2 });
    const stats = await leesStats();
    expect(stats.innameDagen).toBe(20);
    expect(stats.volledigeMomentDagen).toBe(10);
    const reeks = await leesReeks();
    expect(reeks).toEqual({ dagenBijgehouden: 20, lopendeReeks: 20 });
    const badgeStats = await leesBadgeStats();
    expect(badgeStats.dagRondDagen).toBe(0); // geen eten: geen ronde dagen
    const badges = await controleerBadges();
    expect(badges).toContain('eerste-potje');
    expect(badges).not.toContain('trouw'); // 10 volle dagen, de drempel is 14
    // Weekoverzicht van vorige week: elke dag heeft beide momenten in het totaal.
    const week = await leesWeekoverzicht(weekStart(dag(-7)));
    for (const d of week.dagen) expect(d.supplementMomenten.totaal).toBe(2);
  });

  test('een nieuw supplement naast oude gegevens maakt geen enkele vroegere dag onvolledig', async () => {
    await oudProfiel();
    const voor = [];
    for (let n = -25; n <= -1; n += 1) voor.push({ n, alles: telRooster(await schemaVanDag(dag(n))), momenten: telMomenten(await schemaVanDag(dag(n))) });
    const statsVoor = await leesStats();
    const reeksVoor = await leesReeks();
    const badgesVoor = await controleerBadges();
    const opgeslagenVoor = (await db.badges.toArray()).map((b) => b.id).sort();

    await voegSupplementToe({ naam: 'Omega 3', momenten: ['middag'] });
    await voegSupplementToe({ naam: 'B12 spuit', ritme: { soort: 'maand', start: dag(-15) } });

    for (const { n, alles, momenten } of voor) {
      expect(telRooster(await schemaVanDag(dag(n))), `dag ${n}`).toEqual(alles);
      expect(telMomenten(await schemaVanDag(dag(n))), `dag ${n}`).toEqual(momenten);
    }
    expect(await leesStats()).toEqual(statsVoor);
    expect(await leesReeks()).toEqual(reeksVoor);
    expect(await controleerBadges()).toEqual([]); // niets nieuws, niets kwijt
    expect((await db.badges.toArray()).map((b) => b.id).sort()).toEqual(opgeslagenVoor);
    expect(badgesVoor.length).toBeGreaterThan(0);
    // Vandaag telt het nieuwe dagelijkse supplement wel mee.
    expect(namenOp(await schemaVanDag(dag(0)))).toContain('middag:Omega 3:nee');
  });

  test('de pure regel: zonder teltVanaf en zonder vanaf geen ondergrens; een ongeldige teltVanaf wordt genegeerd', () => {
    const oud = { id: 1, naam: 'A', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, actief: true, volgorde: 1 };
    expect(beginVan(oud)).toBeUndefined();
    expect(rooster('2001-01-01', [oud], []).momenten).toHaveLength(1);
    expect(beginVan({ ...oud, teltVanaf: 'gisteren' })).toBeUndefined();
    expect(beginVan({ ...oud, teltVanaf: '2026-11-18' })).toBe('2026-11-18');
    expect(beginVan({ ...oud, teltVanaf: '2026-11-18', vanaf: '2026-11-01' })).toBe('2026-11-01');
    expect(rooster('2026-11-17', [{ ...oud, teltVanaf: '2026-11-18' }], []).momenten).toEqual([]);
    expect(rooster('2026-11-18', [{ ...oud, teltVanaf: '2026-11-18' }], []).momenten).toHaveLength(1);
  });
});

describe('uit een bestand', () => {
  const dagelijks = (naam, extra = {}) => ({ naam, hoeveelheid: '1 pilletje', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['ochtend'], ...extra });
  const lees = (lijst) => {
    const uit = leesBestand(JSON.stringify({ soort: SOORT, versie: VERSIE, supplementen: lijst }));
    expect(uit.ok).toBe(true);
    return uit.supplementen;
  };

  test('overnemen: een nieuw supplement telt vanaf de dag van overnemen, tenzij het bestand een begindatum heeft', async () => {
    await neemOver(lees([dagelijks('Vitamine D'), dagelijks('Zink', { vanaf: dag(-7) })]), { wijze: 'toevoegen' });
    const [d, z] = (await db.supplementen.toArray()).sort((a, b) => a.volgorde - b.volgorde);
    expect(d).toMatchObject({ teltVanaf: vandaag() });
    expect(d.vanaf).toBeUndefined();
    expect(z).toMatchObject({ teltVanaf: vandaag(), vanaf: dag(-7) });
    expect(namenOp(await schemaVanDag(dag(-1)))).toEqual(['ochtend:Zink:nee']);
    expect(namenOp(await schemaVanDag(dag(-8)))).toEqual([]);
    expect(namenOp(await schemaVanDag(dag(0)))).toEqual(['ochtend:Vitamine D:nee', 'ochtend:Zink:nee']);
  });

  test('vervangen: hetzelfde supplement houdt zijn id, zijn afgevinkte dagen en zijn dag van toevoegen', async () => {
    const mg = await voegSupplementToe({ naam: 'Magnesium', momenten: ['avond'] });
    await db.supplementen.update(mg.id, { teltVanaf: dag(-10) });
    await zetInname(dag(-4), mg.id, 'avond', true);
    // Een supplement van vóór BESLISSING 698 (zonder teltVanaf) blijft zonder.
    await db.supplementen.put({ id: 50, naam: 'Vitamine D', dosis: '', hoeveelheid: '1 pilletje', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 9, actief: true, voorbeeld: false, aangemaaktOp: 1 });
    await neemOver(lees([dagelijks('magnesium', { momenten: ['avond'] }), dagelijks('Vitamine D'), dagelijks('Omega 3')]), { wijze: 'vervangen' });
    const nieuwMg = await db.supplementen.get(mg.id);
    expect(nieuwMg).toMatchObject({ id: mg.id, naam: 'magnesium', teltVanaf: dag(-10), actief: true });
    const vitD = await db.supplementen.get(50);
    expect(vitD.teltVanaf).toBeUndefined();
    const omega = (await db.supplementen.toArray()).find((s) => s.naam === 'Omega 3');
    expect(omega.teltVanaf).toBe(vandaag());
    expect(await db.momentinnames.get([dag(-4), mg.id, 'avond'])).toBeTruthy();
    expect(namenOp(await schemaVanDag(dag(-4)))).toEqual(['ochtend:Vitamine D:nee', 'avond:magnesium:ja']);
    expect(namenOp(await schemaVanDag(dag(-11)))).toEqual(['ochtend:Vitamine D:nee']);
  });

  test('de dag van toevoegen gaat nooit mee in het bestand, en een bestand met teltVanaf wordt geweigerd', async () => {
    await voegSupplementToe({ naam: 'Vitamine D' });
    await voegSupplementToe({ naam: 'IJzerspuit', ritme: { soort: 'interval', dagen: 14, start: dag(-3) }, vanaf: dag(-30) });
    const tekst = maakBestand(await db.supplementen.toArray());
    expect(tekst).not.toContain('teltVanaf');
    expect(tekst).not.toContain('aangemaaktOp');
    const data = JSON.parse(tekst);
    for (const s of data.supplementen) expect(Object.keys(s).every((k) => ['naam', 'hoeveelheid', 'aanwijzing', 'ritme', 'momenten', 'vanaf', 'tot'].includes(k))).toBe(true);
    // "Begint op" gaat wel mee (het hoort bij de lijst zelf).
    expect(data.supplementen[1].vanaf).toBe(dag(-30));
    const metVeld = JSON.stringify({ soort: SOORT, versie: VERSIE, supplementen: [dagelijks('Zink', { teltVanaf: dag(-5) })] });
    expect(leesBestand(metVeld)).toEqual({ ok: false, reden: 'ongeldig', nummer: 1 });
  });
});
