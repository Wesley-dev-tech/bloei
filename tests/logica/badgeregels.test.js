// De uitgebreide badges (BESLISSING 166): per nieuwe badge net niet en net wel, de tellingen uit ruwe gegevens, voorbeelddata die niet telt,
// het stil toekennen bij de eerste start en het event verslag:gemaakt.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister, zend } from '../../src/kern/bus.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { voegFavorietToe } from '../../src/data/favorieten.js';
import { controleerBadges, leesBadges, leesBadgeStats, startBadges, stopBadges } from '../../src/data/badges.js';
import { ALLE_BADGES, GROEPEN, NIEUWE_BADGES, DOEL, dagRondDagen, langsteReeks, telBadges, terugDagen, verdiendAlle, voortgangVan } from '../../src/logica/badgeregels.js';
import { TEKSTEN } from '../../src/teksten.js';

const NUL = { dagenBijgehouden: 0, lopendeReeks: 0, doelDagen: 0, notitieDagen: 0, innameDagen: 0, volledigeMomentDagen: 0, maaltijden: 0, favorieten: 0, wegingen: 0, langsteDoelReeks: 0, dagRondDagen: 0, terugDagen: 0, verslagen: 0 };
const heeft = (id, stats) => verdiendAlle(stats).includes(id);

// [id, stat, drempel]: net niet (drempel min 1) en net wel (drempel)
const REGELS = [
  ['drie-op-rij', 'lopendeReeks', 3],
  ['week-op-rij', 'lopendeReeks', 7],
  ['maand-op-rij', 'lopendeReeks', 30],
  ['vijftig-dagen', 'dagenBijgehouden', 50],
  ['jaar-bloei', 'dagenBijgehouden', 365],
  ['weer-thuis', 'terugDagen', 1],
  ['eerste-maaltijd', 'maaltijden', 1],
  ['vijftig-maaltijden', 'maaltijden', 50],
  ['eerste-favoriet', 'favorieten', 1],
  ['week-water', 'langsteDoelReeks', 7],
  ['dertig-dagdoelen', 'doelDagen', 30],
  ['alles-afgevinkt', 'volledigeMomentDagen', 1],
  ['week-trouw', 'volledigeMomentDagen', 7],
  ['dertig-vol', 'volledigeMomentDagen', 30],
  ['twintig-notities', 'notitieDagen', 20],
  ['eerste-weging', 'wegingen', 1],
  ['vier-wegingen', 'wegingen', 4],
  ['dag-rond', 'dagRondDagen', 1],
  ['zeven-dagen-rond', 'dagRondDagen', 7],
  ['eerste-verslag', 'verslagen', 1],
  // de uitbreiding naar honderd medailles (DREMPELS)
  ['tweehonderd', 'dagenBijgehouden', 200],
  ['vijfhonderd', 'dagenBijgehouden', 500],
  ['twee-maanden-op-rij', 'lopendeReeks', 60],
  ['honderd-op-rij', 'lopendeReeks', 100],
  ['volle-week', 'volleWeken', 1],
  ['volle-maand', 'volleMaanden', 1],
  ['altijd-welkom', 'terugDagen', 3],
  ['vijf-op-rij', 'lopendeReeks', 5],
  ['tien-op-rij', 'lopendeReeks', 10],
  ['drie-weken-op-rij', 'lopendeReeks', 21],
  ['vijftig-op-rij', 'lopendeReeks', 50],
  ['jaar-op-rij', 'lopendeReeks', 365],
  ['duizend-dagen', 'dagenBijgehouden', 1000],
  ['vier-volle-weken', 'volleWeken', 4],
  ['honderd-maaltijden', 'maaltijden', 100],
  ['vijfhonderd-maaltijden', 'maaltijden', 500],
  ['vijf-favorieten', 'favorieten', 5],
  ['drie-op-een-dag', 'etenKlaarDagen', 1],
  ['tien-maaltijden', 'maaltijden', 10],
  ['tien-favorieten', 'favorieten', 10],
  ['zeven-drie-maaltijden', 'etenKlaarDagen', 7],
  ['vijftig-dagdoelen', 'doelDagen', 50],
  ['honderd-dagdoelen', 'doelDagen', 100],
  ['twee-weken-water', 'langsteDoelReeks', 14],
  ['maand-water', 'langsteDoelReeks', 30],
  ['eerste-slok', 'dranken', 1],
  ['drie-dagen-water', 'langsteDoelReeks', 3],
  ['honderd-liter', 'liters', 100],
  ['drie-soorten', 'drankSoorten', 3],
  ['vijftig-vol', 'volledigeMomentDagen', 50],
  ['honderd-vol', 'volledigeMomentDagen', 100],
  ['op-ritme', 'periodiekInnames', 1],
  ['tien-ritme', 'periodiekInnames', 10],
  ['eigen-lijst', 'supplementenAantal', 1],
  ['honderd-vinkjes', 'innames', 100],
  ['zeven-op-rij-afgevinkt', 'langsteVolReeks', 7],
  ['vijftig-notities', 'notitieDagen', 50],
  ['honderd-notities', 'notitieDagen', 100],
  ['eerste-notitie', 'notitieDagen', 1],
  ['tien-notities', 'notitieDagen', 10],
  ['tweehonderd-notities', 'notitieDagen', 200],
  ['drie-notities-op-rij', 'langsteNotitieReeks', 3],
  ['week-notities-op-rij', 'langsteNotitieReeks', 7],
  ['maand-notities-op-rij', 'langsteNotitieReeks', 30],
  ['lange-notitie', 'langeNotities', 1],
  ['twaalf-wegingen', 'wegingen', 12],
  ['halfjaar-wegen', 'wegingen', 26],
  ['jaar-wegen', 'wegingen', 52],
  ['vier-weken-wegen', 'langsteWeegReeks', 4],
  ['drie-rond-op-rij', 'langsteRondReeks', 3],
  ['week-rond', 'langsteRondReeks', 7],
  ['dertig-rond', 'dagRondDagen', 30],
  ['twee-weken-rond', 'langsteRondReeks', 14],
  ['vijftig-rond', 'dagRondDagen', 50],
  ['volledige-dag', 'helemaalDagen', 1],
  ['vijf-verslagen', 'verslagen', 5],
  ['tien-verslagen', 'verslagen', 10],
  ['twintig-verslagen', 'verslagen', 20],
  ['verslag-verstuurd', 'verslagenVerstuurd', 1],
  ['verslag-bewaard', 'verslagenBewaard', 1],
  ['volledig-verslag', 'verslagenVolledig', 1],
  ['weekverslag', 'verslagenWeek', 1],
  ['maandverslag', 'verslagenMaand', 1],
  ['maand-na-maand', 'verslagMaanden', 3],
  ['eerste-rondleiding', 'rondleidingen', 1],
  ['eigen-kleur', 'themaGekozen', 1],
  ['seintje-aan', 'meldingGetikt', 1],
  ['achter-slot', 'slotAan', 1],
  ['op-beginscherm', 'opBeginscherm', 1],
  ['eigen-profiel', 'eigenProfiel', 1],
  ['vijf-rondleidingen', 'rondleidingen', 5],
  ['tien-medailles', 'medailles', 10],
  ['vijfentwintig-medailles', 'medailles', 25],
  ['vijftig-medailles', 'medailles', 50],
  ['verzameling-compleet', 'medailles', 125],
  ['geboortedatum', 'geboortedatum', 1],
  ['jarig', 'jarigGeopend', 1],
  ['jarig-genoteerd', 'jarigGenoteerd', 1],
];

describe('badgeregels (puur)', () => {
  test('alle badges hebben een unieke sleutel, een groep, een naam, een uitleg en een voortgang', () => {
    const ids = ALLE_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(126);
    expect(ids).not.toContain('veilig');
    for (const b of ALLE_BADGES) {
      expect(GROEPEN, b.id).toContain(b.groep);
      expect(TEKSTEN.badge.namen[b.id], b.id).toBeTruthy();
      expect(TEKSTEN.badge.voorwaarden[b.id], b.id).toBeTruthy();
      expect(DOEL[b.id], b.id).toBeTruthy();
    }
    for (const groep of GROEPEN) expect(TEKSTEN.badge.groepen[groep], groep).toBeTruthy();
  });

  test('elke nieuwe badge staat in de tabel met regels', () => {
    expect(REGELS.map((r) => r[0]).sort()).toEqual(NIEUWE_BADGES.map((b) => b.id).sort());
  });

  test.each(REGELS)('%s: net niet en net wel', (id, stat, drempel) => {
    expect(heeft(id, { ...NUL, [stat]: drempel - 1 })).toBe(false);
    expect(heeft(id, { ...NUL, [stat]: drempel })).toBe(true);
    expect(heeft(id, NUL)).toBe(false);
  });

  test('de voortgang kapt af op het doel en kent geen percentage', () => {
    expect(voortgangVan('week-vol', { ...NUL, dagenBijgehouden: 3 })).toMatchObject({ aantal: 3, doel: 7, fractie: 3 / 7 });
    expect(voortgangVan('week-vol', { ...NUL, dagenBijgehouden: 99 }).fractie).toBe(1);
    expect(voortgangVan('onbekend', NUL)).toBeNull();
  });

  test('langsteReeks telt alleen dagen die direct op elkaar volgen', () => {
    const d = (n) => plusDagen('2026-01-01', n);
    expect(langsteReeks([])).toBe(0);
    expect(langsteReeks([d(0), d(1), d(2), d(4), d(5)])).toBe(3);
    expect(langsteReeks([d(0), d(0), d(1)])).toBe(2);
  });

  test('terugDagen: vier lege dagen of meer, de eerste dag telt niet', () => {
    const d = (n) => plusDagen('2026-01-01', n);
    expect(terugDagen([d(0)])).toBe(0);
    expect(terugDagen([d(0), d(4)])).toBe(0); // drie lege dagen
    expect(terugDagen([d(0), d(5)])).toBe(1); // vier lege dagen
    expect(terugDagen([d(0), d(5), d(12)])).toBe(2);
  });

  test('dagRondDagen: eten, supplementen en drinkdoel in orde (zelfde regel als de motivatiezin)', () => {
    const rond = { etenKlaar: true, supplementen: { genomen: 2, totaal: 2 }, ml: 2500, doelMl: 2500 };
    expect(dagRondDagen([rond])).toBe(1);
    expect(dagRondDagen([{ ...rond, supplementen: { genomen: 0, totaal: 0 } }])).toBe(1); // geen supplementen is in orde
    expect(dagRondDagen([{ ...rond, ml: 2180 }])).toBe(0); // drinkdoel niet gehaald
    expect(dagRondDagen([{ ...rond, etenKlaar: false }])).toBe(0);
    expect(dagRondDagen([{ ...rond, supplementen: { genomen: 1, totaal: 2 } }])).toBe(0);
    expect(dagRondDagen([rond, { ...rond }, { ...rond, ml: 0 }])).toBe(2);
    expect(dagRondDagen()).toBe(0);
  });

  test('trouw (veertien dagen vol) telt volgens de momenten', () => {
    expect(heeft('trouw', { ...NUL, volledigeMomentDagen: 13 })).toBe(false);
    expect(heeft('trouw', { ...NUL, volledigeMomentDagen: 14 })).toBe(true);
  });

  test('telBadges: behaald is nooit groter dan het totaal; een oude bewaarde rij "veilig" telt niet mee', () => {
    expect(telBadges([])).toEqual({ behaald: 0, totaal: 126 });
    expect(telBadges(['veilig', 'week-vol'])).toEqual({ behaald: 1, totaal: 126 });
    const alle = ALLE_BADGES.map((b) => b.id);
    expect(telBadges(alle)).toEqual({ behaald: 126, totaal: 126 });
    expect(telBadges(['onbekend']).behaald).toBe(0);
  });

  test('geen badge voor een gewicht of een verschil: de regels kennen geen kilo', () => {
    for (const b of NIEUWE_BADGES) expect(b.voorwaarde.toString(), b.id).not.toMatch(/kg|gewicht|streef|verschil|minder/i);
  });
});

const VANDAAG = vandaag();
const dag = (n) => plusDagen(VANDAAG, n);

beforeEach(async () => {
  stopBadges();
  await db.delete();
  await openDb();
});

describe('leesBadgeStats (eigen gegevens, nooit voorbeelddata)', () => {
  test('telt maaltijden, favorieten, wegingen en dagen rond', async () => {
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'havermout' });
    await voegFavorietToe('yoghurt');
    await bewaarWeging(dag(-1), 68.4);
    await voegDrankToe(dag(-1));
    const s = await leesBadgeStats();
    expect(s).toMatchObject({ maaltijden: 1, favorieten: 1, wegingen: 1 });
    expect(s.dagRondDagen).toBe(0); // alleen een ontbijt en een kan: eten en drinkdoel niet in orde
  });

  test('voorbeelddata telt nooit mee', async () => {
    await db.maaltijden.put({ datum: dag(-1), soort: 'ontbijt', tekst: 'voorbeeld', voorbeeld: true });
    await db.dranken.add({ datum: dag(-1), tijdstip: Date.now(), soort: 'water', ml: 250, voorbeeld: true });
    await db.dagen.put({ datum: dag(-1), notitie: 'x', doelGehaald: true, voorbeeld: true });
    await db.wegingen.put({ week: dag(-1), datum: dag(-1), kg: 70, voorbeeld: true });
    const s = await leesBadgeStats();
    expect(s).toMatchObject({ maaltijden: 0, wegingen: 0, langsteDoelReeks: 0, doelDagen: 0, dagRondDagen: 0, terugDagen: 0 });
  });

  test('weer thuis: iets noteren na vier lege dagen', async () => {
    await voegDrankToe(dag(-8));
    await voegDrankToe(dag(-2));
    expect((await leesBadgeStats()).terugDagen).toBe(1);
  });

  test('week vol water: zeven dagen na elkaar het dagdoel', async () => {
    for (let i = 7; i >= 1; i--) await zetNotitieOfDoel(dag(-i));
    expect((await leesBadgeStats()).langsteDoelReeks).toBe(7);
  });
});

async function zetNotitieOfDoel(datum) {
  await db.dagen.put({ datum, doelGehaald: true, voorbeeld: false });
}

describe('stil toekennen en het event verslag:gemaakt', () => {
  test('bij de eerste start na de uitbreiding: bestaande badges stil, één melding, geen vieringen', async () => {
    for (let i = 3; i >= 1; i--) await voegDrankToe(dag(-i)); // drie dagen op rij: eerste-bladzijde en drie-op-rij
    const vieringen = [];
    const stil = [];
    const af1 = luister('badge:behaald', (d) => vieringen.push(d.id));
    const af2 = luister('badges:stil', (d) => stil.push(d.aantal));
    const nieuw = await controleerBadges();
    af1();
    af2();
    expect(nieuw).toEqual(expect.arrayContaining(['eerste-bladzijde', 'drie-op-rij']));
    expect(vieringen).toEqual([]);
    expect(stil).toEqual([nieuw.length]);
    expect((await leesBadges()).every((b) => b.gezien)).toBe(true);
    // daarna viert een echt nieuwe badge weer
    const gevierd = [];
    const af3 = luister('badge:behaald', (d) => gevierd.push(d.id));
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'brood' });
    await controleerBadges();
    af3();
    expect(gevierd).toEqual(['eerste-maaltijd']);
  });

  // 0.5.8 (notities en verslagen): wie Bloei al gebruikte, heeft de drie oudere vlaggen al. De nieuwe medailles voor wat al in haar dagboek
  // staat komen stil, met één rustige melding, niet als een reeks vieringen. De vierde vlag onthoudt dat.
  test('na de uitbreiding van 0.5.8: de nieuwe medailles voor notities komen stil en de vierde vlag wordt gezet', async () => {
    for (const sleutel of ['badges.uitgebreid', 'badges.uitgebreid2', 'badges.uitgebreid3']) await db.instellingen.put({ sleutel, waarde: true });
    for (let i = 3; i >= 1; i--) await db.dagen.put({ datum: dag(-i), notitie: 'Een rustige dag.', doelGehaald: false, voorbeeld: false });
    const vieringen = [];
    const stil = [];
    const af1 = luister('badge:behaald', (d) => vieringen.push(d.id));
    const af2 = luister('badges:stil', (d) => stil.push(d.aantal));
    const nieuw = await controleerBadges();
    af1();
    af2();
    expect(nieuw).toEqual(expect.arrayContaining(['eerste-notitie', 'drie-notities-op-rij']));
    expect(vieringen).toEqual([]);
    expect(stil).toEqual([nieuw.length]);
    expect((await db.instellingen.get('badges.uitgebreid4'))?.waarde).toBe(true);
  });

  test('zonder gegevens bij de eerste start: niets te melden, en daarna wordt wel gevierd', async () => {
    const stil = [];
    const af = luister('badges:stil', (d) => stil.push(d));
    await controleerBadges();
    af();
    expect(stil).toEqual([]);
    const gevierd = [];
    const af2 = luister('badge:behaald', (d) => gevierd.push(d.id));
    await voegDrankToe(VANDAAG);
    await controleerBadges();
    af2();
    expect(gevierd).toEqual(['eerste-bladzijde']);
  });

  test('een verslag maken (verslag:gemaakt) geeft de badge Eerste verslag', async () => {
    await db.instellingen.put({ sleutel: 'badges.uitgebreid', waarde: true });
    startBadges();
    zend('verslag:gemaakt', { van: dag(-7), tot: VANDAAG, manier: 'pdf' });
    await new Promise((klaar) => setTimeout(klaar, 900));
    await controleerBadges();
    stopBadges();
    expect((await leesBadges()).map((b) => b.id)).toContain('eerste-verslag');
  });

  // 0.5.8: Bloei onthoudt hoe een verslag gemaakt werd (alleen aantallen en de maand), voor de nieuwe medailles van Bewaren en delen.
  test('een verstuurd verslag van een week met alle onderdelen geeft Verstuurd, Volledig verslag en Weekverslag, en niet Op je toestel of Maandverslag', async () => {
    await db.instellingen.put({ sleutel: 'badges.uitgebreid', waarde: true });
    startBadges();
    zend('verslag:gemaakt', { van: dag(-6), tot: VANDAAG, manier: 'versturen', onderdelen: { eten: true, drinken: true, gewicht: true, notities: true } });
    await new Promise((klaar) => setTimeout(klaar, 900));
    await controleerBadges();
    stopBadges();
    const ids = (await leesBadges()).map((b) => b.id);
    for (const id of ['eerste-verslag', 'verslag-verstuurd', 'volledig-verslag', 'weekverslag']) expect(ids, id).toContain(id);
    for (const id of ['verslag-bewaard', 'maandverslag', 'maand-na-maand', 'twintig-verslagen']) expect(ids, id).not.toContain(id);
    expect((await db.instellingen.get('delen.verslagTelling')).waarde).toEqual({ verstuurd: 1, bewaard: 0, volledig: 1, week: 1, maand: 0, maanden: [VANDAAG.slice(0, 7)] });
    const stats = await leesBadgeStats();
    expect(stats).toMatchObject({ verslagen: 1, verslagenVerstuurd: 1, verslagenBewaard: 0, verslagenVolledig: 1, verslagenWeek: 1, verslagenMaand: 0, verslagMaanden: 1 });
  });

  test('notities: dagen na elkaar en een lange notitie tellen mee in de stats', async () => {
    const lang = Array(50).fill('woord').join(' ');
    for (const [n, notitie] of [[-4, 'kort'], [-3, lang], [-2, 'ook kort'], [0, 'vandaag']]) await db.dagen.put({ datum: dag(n), notitie, doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
    const stats = await leesBadgeStats();
    expect(stats).toMatchObject({ notitieDagen: 4, langsteNotitieReeks: 3, langeNotities: 1 });
    expect(verdiendAlle(stats)).toEqual(expect.arrayContaining(['eerste-notitie', 'drie-notities-op-rij', 'lange-notitie']));
    expect(verdiendAlle(stats)).not.toContain('tien-notities');
  });
});
