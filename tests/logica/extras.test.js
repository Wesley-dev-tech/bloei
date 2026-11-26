import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { plusDagen, vandaag, weekStart } from '../../src/kern/datum.js';
import { zetInstelling } from '../../src/data/instellingen.js';
import { zetNotitie } from '../../src/data/dagen.js';
import { bewaarMaaltijd, suggesties } from '../../src/data/maaltijden.js';
import { voegDrankToe, verwijderDrank } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { isFavoriet, leesFavorieten, markeerGebruikt, verwijderFavoriet, voegFavorietToe } from '../../src/data/favorieten.js';
import { dagStatus, leesMaand, leesReeks, leesStats, leesWeekoverzicht } from '../../src/data/statistiek.js';
import { controleerBadges, leesBadges, markeerGezien } from '../../src/data/badges.js';

const VANDAAG = vandaag();
const dag = (n) => plusDagen(VANDAAG, n);

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('leesReeks', () => {
  test('leeg schrift', async () => {
    expect(await leesReeks()).toEqual({ dagenBijgehouden: 0, lopendeReeks: 0 });
  });

  test('één glas = 1 dag bijgehouden, reeks 1', async () => {
    await voegDrankToe(VANDAAG);
    expect(await leesReeks()).toEqual({ dagenBijgehouden: 1, lopendeReeks: 1 });
  });

  test('een maaltijd met alleen een uur is niet bijgehouden, tekst wel', async () => {
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tijd: '08:00' });
    expect((await leesReeks()).dagenBijgehouden).toBe(0);
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'boterham' });
    expect((await leesReeks()).dagenBijgehouden).toBe(1);
  });

  test('de teller daalt nooit, ook niet na verwijderen', async () => {
    const drank = await voegDrankToe(VANDAAG);
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'boterham' });
    expect((await leesReeks()).dagenBijgehouden).toBe(2);
    await controleerBadges(); // bewaart het hoogste; lezen alleen schrijft niets (R1-18)
    await verwijderDrank(drank.id);
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: '' });
    const reeks = await leesReeks();
    expect(reeks.dagenBijgehouden).toBe(2);
    expect(reeks.lopendeReeks).toBe(0);
    expect(await db.instellingen.get('teller.hoogste')).toMatchObject({ waarde: 2 });
  });

  test('voorbeelddata telt nooit mee', async () => {
    await db.maaltijden.put({ datum: dag(-1), soort: 'ontbijt', tijd: '08:00', tekst: 'x', fotoId: null, voorbeeld: true, gewijzigdOp: 1 });
    await db.dranken.add({ datum: dag(-2), tijdstip: 1, soort: 'water', ml: 250, voorbeeld: true });
    expect(await leesReeks()).toEqual({ dagenBijgehouden: 0, lopendeReeks: 0 });
    // eigen record erbij: alleen dat telt
    await voegDrankToe(dag(-3));
    expect((await leesReeks()).dagenBijgehouden).toBe(1);
  });

  test('een voorbeeldmaaltijd die de gebruiker aanpast telt wel mee', async () => {
    await db.maaltijden.put({ datum: dag(-1), soort: 'ontbijt', tijd: '08:00', tekst: 'x', fotoId: null, voorbeeld: true, gewijzigdOp: 1 });
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'mijn eigen' });
    expect((await leesReeks()).dagenBijgehouden).toBe(1);
  });
});

describe('badges bewaren', () => {
  // De app draait al: de eerste start na de uitbreiding (stil toekennen) is geweest, dus nieuwe badges worden gevierd.
  beforeEach(async () => {
    await db.instellingen.put({ sleutel: 'badges.uitgebreid', waarde: true });
  });

  test('eerste glas geeft eerste-bladzijde, één keer, met event', async () => {
    const gehaald = [];
    const meldAf = luister('badge:behaald', (d) => gehaald.push(d.id));
    await voegDrankToe(VANDAAG);
    expect(await controleerBadges()).toEqual(['eerste-bladzijde']);
    expect(await controleerBadges()).toEqual([]); // niet nog eens
    meldAf();
    expect(gehaald).toEqual(['eerste-bladzijde']);
    const bewaard = await leesBadges();
    expect(bewaard).toHaveLength(1);
    expect(bewaard[0]).toMatchObject({ id: 'eerste-bladzijde', gezien: false });
  });

  test('gelijktijdig nakijken bewaart niets dubbel', async () => {
    await voegDrankToe(VANDAAG);
    await Promise.all([controleerBadges(), controleerBadges(), controleerBadges()]);
    expect(await db.badges.count()).toBe(1);
  });

  test('de badge blijft staan als het glas verdwijnt', async () => {
    const drank = await voegDrankToe(VANDAAG);
    await controleerBadges();
    await verwijderDrank(drank.id);
    expect(await controleerBadges()).toEqual([]);
    expect((await leesBadges()).map((b) => b.id)).toEqual(['eerste-bladzijde']);
  });

  test('markeerGezien', async () => {
    await voegDrankToe(VANDAAG);
    await controleerBadges();
    await markeerGezien('eerste-bladzijde');
    expect((await leesBadges())[0].gezien).toBe(true);
  });

  test('doelDagen en notities tellen uit de gegevens', async () => {
    await zetInstelling('drinken.dagdoelMl', 500);
    await voegDrankToe(dag(-1), 'water', 500);
    await zetNotitie(dag(-1), 'iets');
    expect(await leesStats()).toMatchObject({ doelDagen: 1, notitieDagen: 1 });
    expect(await controleerBadges()).toEqual(expect.arrayContaining(['eerste-bladzijde', 'eerste-kan']));
    expect(await controleerBadges()).not.toContain('veilig');
  });

  test('voorbeelddagen tellen niet mee voor doel en notitie', async () => {
    await db.dagen.put({ datum: dag(-1), notitie: 'x', doelGehaald: true, voorbeeld: true, gewijzigdOp: 1 });
    expect(await leesStats()).toMatchObject({ doelDagen: 0, notitieDagen: 0 });
    expect(await controleerBadges()).toEqual([]);
  });
});

describe('favorieten', () => {
  test('toevoegen, dubbel vermijden, hoofdletters en spaties negeren', async () => {
    const a = await voegFavorietToe('  Havermout met banaan ');
    const b = await voegFavorietToe('havermout MET banaan');
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ tekst: 'Havermout met banaan', sleutel: 'havermout met banaan' });
    expect(await db.favorieten.count()).toBe(1);
    expect(await isFavoriet('HAVERMOUT met banaan')).toBe(true);
    expect(await isFavoriet('iets anders')).toBe(false);
    expect(await isFavoriet('')).toBe(false);
  });

  test('lege tekst mag niet', async () => {
    await expect(voegFavorietToe('   ')).rejects.toThrow('leeg');
  });

  test('laatst gebruikt eerst, markeerGebruikt, verwijderen, en data:gewijzigd', async () => {
    const lijst = [];
    const meldAf = luister('data:gewijzigd', (d) => lijst.push(d));
    const a = await voegFavorietToe('soep');
    await new Promise((r) => setTimeout(r, 5));
    const b = await voegFavorietToe('pasta');
    expect((await leesFavorieten()).map((f) => f.tekst)).toEqual(['pasta', 'soep']);
    await new Promise((r) => setTimeout(r, 5));
    await markeerGebruikt(a.id);
    expect((await leesFavorieten()).map((f) => f.tekst)).toEqual(['soep', 'pasta']);
    await verwijderFavoriet(b.id);
    expect((await leesFavorieten()).map((f) => f.tekst)).toEqual(['soep']);
    meldAf();
    expect(lijst.every((d) => d.store === 'favorieten')).toBe(true);
    expect(lijst).toHaveLength(4);
  });
});

describe('suggesties', () => {
  test('minstens twee keer; de vaakste eerst; per soort', async () => {
    for (const n of [-1, -2, -3]) await bewaarMaaltijd(dag(n), 'ontbijt', { tekst: 'havermout met banaan' });
    for (const n of [-4, -5]) await bewaarMaaltijd(dag(n), 'ontbijt', { tekst: 'boterham met kaas' });
    await bewaarMaaltijd(dag(-6), 'ontbijt', { tekst: 'eenmalig' });
    await bewaarMaaltijd(dag(-1), 'avondmaal', { tekst: 'soep' });
    await bewaarMaaltijd(dag(-2), 'avondmaal', { tekst: 'soep' });
    expect(await suggesties('ontbijt')).toEqual(['havermout met banaan', 'boterham met kaas']);
    expect(await suggesties('avondmaal')).toEqual(['soep']);
    expect(await suggesties('latesnack')).toEqual([]);
  });

  test('twee dagen dezelfde ontbijttekst is genoeg, hoofdletters tellen niet', async () => {
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'Havermout' });
    await bewaarMaaltijd(dag(-2), 'ontbijt', { tekst: 'havermout ' });
    expect(await suggesties('ontbijt')).toEqual(['Havermout']);
  });

  test('geen favorieten, max, laatste 90 dagen, geen voorbeelddata', async () => {
    let n = 0;
    for (const tekst of ['a', 'b', 'c', 'd']) {
      for (let k = 0; k < 2; k++) await bewaarMaaltijd(dag(--n), 'ontbijt', { tekst });
    }
    await voegFavorietToe('A');
    expect(await suggesties('ontbijt')).toHaveLength(3);
    expect(await suggesties('ontbijt')).not.toContain('a');
    expect(await suggesties('ontbijt', 1)).toHaveLength(1);

    for (const n of [-100, -101]) await bewaarMaaltijd(dag(n), 'tussendoortje', { tekst: 'oud' });
    expect(await suggesties('tussendoortje')).toEqual([]);

    for (const n of [-3, -4]) {
      await db.maaltijden.put({ datum: dag(n), soort: 'vieruurtje', tijd: '16:00', tekst: 'voorbeeld', fotoId: null, voorbeeld: true, gewijzigdOp: 1 });
    }
    expect(await suggesties('vieruurtje')).toEqual([]);
  });

  test('bij gelijke stand wint de recentste', async () => {
    for (const n of [-1, -9]) await bewaarMaaltijd(dag(n), 'ontbijt', { tekst: 'recent' });
    for (const n of [-5, -6]) await bewaarMaaltijd(dag(n), 'ontbijt', { tekst: 'ouder' });
    expect(await suggesties('ontbijt')).toEqual(['recent', 'ouder']);
  });
});

describe('weekoverzicht, maand en dagStatus uit de database', () => {
  test('leesWeekoverzicht voor een week met gegevens', async () => {
    const maandag = weekStart(dag(-7));
    const di = plusDagen(maandag, 1);
    const wo = plusDagen(maandag, 2);
    await bewaarMaaltijd(di, 'ontbijt', { tekst: 'a' });
    await voegDrankToe(di, 'water', 1000);
    await voegDrankToe(wo, 'water', 1250);
    const w = await leesWeekoverzicht(plusDagen(maandag, 3)); // elke dag van de week mag
    expect(w.dagen).toHaveLength(7);
    expect(w.dagen[0].datum).toBe(maandag);
    expect(w).toMatchObject({ ingevuldeDagen: 2 });
  });

  test('een lege week', async () => {
    const w = await leesWeekoverzicht(dag(-14));
    expect(w).toMatchObject({ ingevuldeDagen: 0 });
    expect(w.dagen).toHaveLength(7);
  });

  test('leesMaand: alleen dagen met inhoud', async () => {
    const d = dag(-1);
    await bewaarMaaltijd(d, 'ontbijt', { tekst: 'a' });
    await bewaarMaaltijd(d, 'avondmaal', { tekst: 'b' });
    await voegDrankToe(d, 'water', 500);
    await db.fotos.add({ blob: new Blob(['x']), miniatuur: new Blob(['x']), breedte: 1, hoogte: 1, voorbeeld: false, aangemaaktOp: 1 });
    const maand = await leesMaand(d.slice(0, 7));
    expect(maand[d]).toEqual({ maaltijden: 2, ml: 500, notitie: false, supplementen: { genomen: 0, totaal: 0 }, supplementMomenten: { klaar: 0, totaal: 0 } });
    expect(Object.keys(maand)).toEqual([d]);
  });

  test('dagStatus', async () => {
    const d = dag(0);
    expect(await dagStatus(d)).toEqual({ maaltijdenIngevuld: [], notitie: false, ml: 0, gewogenDezeWeek: false, supplementen: { genomen: 0, totaal: 0 }, bijgehouden: false });
    await bewaarMaaltijd(d, 'middagmaal', { tekst: 'soep' });
    await bewaarMaaltijd(d, 'ontbijt', { tijd: '08:00' }); // niet ingevuld
    await zetNotitie(d, 'ok');
    await voegDrankToe(d, 'water', 300);
    await bewaarWeging(d, 68.4);
    expect(await dagStatus(d)).toEqual({ maaltijdenIngevuld: ['middagmaal'], notitie: true, ml: 300, gewogenDezeWeek: true, supplementen: { genomen: 0, totaal: 0 }, bijgehouden: true });
  });
});

describe('leesStats: volledigeMomentDagen (BESLISSING 150)', () => {
  test('telt alleen dagen waarop elk moment afgevinkt is, niet het periodieke supplement', async () => {
    const { voegSupplementToe, zetInname } = await import('../../src/data/supplementen.js');
    // BESLISSING 698: een supplement telt vanaf de dag van toevoegen; A krijgt een vroegere begindatum zodat de afgevinkte dagen hieronder meetellen.
    const a = await voegSupplementToe({ naam: 'A', momenten: ['ochtend', 'avond'], vanaf: dag(-60) });
    await voegSupplementToe({ naam: 'Maandelijks', ritme: { soort: 'maand', start: dag(-1) } }); // periodiek, dag -1 is een datum van de reeks
    // dag -1: beide momenten afgevinkt, het periodieke supplement niet: volledig voor momenten, niet voor "alles"
    await zetInname(dag(-1), a.id, 'ochtend', true);
    await zetInname(dag(-1), a.id, 'avond', true);
    // dag -2: alleen de ochtend
    await zetInname(dag(-2), a.id, 'ochtend', true);
    const stats = await leesStats();
    expect(stats.volledigeMomentDagen).toBe(1);
  });
});

describe('een dag is bijgehouden zodra er iets genoteerd is (BESLISSING 168)', () => {
  test('isBijgehouden: elk soort notitie telt, een lege dag niet', async () => {
    const { isBijgehouden } = await import('../../src/logica/bijgehouden.js');
    expect(isBijgehouden({})).toBe(false);
    expect(isBijgehouden({ notitie: 'een zin' })).toBe(true);
    expect(isBijgehouden({ notitie: '   ' })).toBe(false);
    expect(isBijgehouden({ weging: true })).toBe(true);
    expect(isBijgehouden({ maaltijden: 1 })).toBe(true);
    expect(isBijgehouden({ ml: 250 })).toBe(true);
    expect(isBijgehouden({ innames: 1 })).toBe(true);
  });

  test('leesReeks en leesStats: een dag met alleen een notitie of een weging telt mee', async () => {
    await zetNotitie(dag(-2), 'rustig');
    await bewaarWeging(dag(-1), 68.4);
    const reeks = await leesReeks();
    expect(reeks.dagenBijgehouden).toBe(2);
    expect(reeks.lopendeReeks).toBeGreaterThanOrEqual(2 - 1); // de reeks vergeeft één dag per kalenderweek
    expect((await leesStats()).dagenBijgehouden).toBe(2);
  });

  test('een lege dag en een dag met alleen voorbeelddata tellen niet', async () => {
    await db.dagen.put({ datum: dag(-1), notitie: 'voorbeeld', voorbeeld: true });
    await db.wegingen.put({ week: weekStart(dag(-2)), datum: dag(-2), kg: 70, voorbeeld: true, gewijzigdOp: 1 });
    await db.maaltijden.put({ datum: dag(-3), soort: 'ontbijt', tijd: '08:00', tekst: 'voorbeeld', fotoId: null, voorbeeld: true, gewijzigdOp: 1 });
    expect((await leesReeks()).dagenBijgehouden).toBe(0);
    await zetNotitie(dag(-5), '   '); // alleen witruimte
    expect((await leesReeks()).dagenBijgehouden).toBe(0);
  });

  test('weekoverzicht, maand en dagStatus zeggen hetzelfde als de reeks', async () => {
    await bewaarWeging(dag(-1), 68.4);
    await zetNotitie(dag(-2), 'ok');
    const week = await leesWeekoverzicht(weekStart(dag(-1)));
    const inWeek = [dag(-1), dag(-2)].filter((d) => d >= weekStart(dag(-1))).length;
    expect(week.ingevuldeDagen).toBe(inWeek);
    const maand = await leesMaand(dag(-1).slice(0, 7));
    expect(Object.keys(maand)).toContain(dag(-1));
    expect((await dagStatus(dag(-1))).bijgehouden).toBe(true);
    expect((await dagStatus(dag(0))).bijgehouden).toBe(false);
  });
});
