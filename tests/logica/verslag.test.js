import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { zetEnergie, zetNotitie, zetStemming } from '../../src/data/dagen.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { voegSupplementToe, zetInname } from '../../src/data/supplementen.js';
import { leesVerslag, meldVerslagGemaakt, schoonOnderdelen, VERSLAG_ONDERDELEN } from '../../src/data/verslag.js';
import { leesInstelling } from '../../src/data/instellingen.js';
import { luister } from '../../src/kern/bus.js';

const dag = (n) => plusDagen(vandaag(), n);
const ALLES = { eten: true, drinken: true, gewicht: true, notities: true };
const STANDAARD = { eten: true, drinken: true, gewicht: false, notities: false };

beforeEach(async () => {
  await db.delete();
  await openDb();
});

async function vulWeek() {
  await bewaarMaaltijd(dag(-2), 'ontbijt', { tekst: 'havermout met fruit', tijd: '08:15', gevoel: 3 });
  await bewaarMaaltijd(dag(-2), 'middagmaal', { tekst: 'soep en brood', tijd: '12:30' });
  await voegDrankToe(dag(-2), 'water', 250);
  await voegDrankToe(dag(-2), 'thee', 200);
  await voegDrankToe(dag(-1), 'water', 500);
  await zetStemming(dag(-2), 3);
  await zetEnergie(dag(-2), 4);
  await zetNotitie(dag(-2), 'Goed geslapen.');
  await bewaarWeging(dag(-2), 68.4);
  const a = await voegSupplementToe({ naam: 'Vitamine D', dosis: '1x per dag 1 capsule', momenten: ['ochtend'] });
  const b = await voegSupplementToe({ naam: 'Magnesium', dosis: '2x per dag 1 tablet', momenten: ['ochtend', 'avond'] });
  await zetInname(dag(-2), a.id, 'ochtend', true);
  await zetInname(dag(-2), b.id, 'ochtend', true);
}

describe('leesVerslag', () => {
  test('een periode geeft elke dag, ook een lege, en een korte samenvatting zonder oordeel', async () => {
    await vulWeek();
    const v = await leesVerslag({ van: dag(-3), tot: dag(0), onderdelen: STANDAARD });
    expect(v.dagen.map((d) => d.datum)).toEqual([dag(-3), dag(-2), dag(-1), dag(0)]);
    expect(v.dagen.map((d) => d.leeg)).toEqual([true, false, false, true]);
    // alleen feiten: aantallen, het gemiddelde en op hoeveel dagen het dagdoel (2,5 l) gehaald is; geen score of percentage
    // BESLISSING 449: het gemiddelde over de 4 dagen (950 ml / 4), de lege dagen tellen als 0. BESLISSING 448: is dit toevallig de lopende week
    // (alleen als Delen de keuze "deze-week" meegeeft), dan is de noemer 7, anders het aantal dagen van de periode.
    expect(v.samenvatting).toEqual({ dagen: 4, noemer: 4, ingevuldeDagen: 2, gemiddeldMl: 237.5, maaltijden: 2, dagdoelMl: 2500, dagdoelDagen: 0 });
    expect(Object.keys(v.samenvatting)).toEqual(['dagen', 'noemer', 'ingevuldeDagen', 'gemiddeldMl', 'maaltijden', 'dagdoelMl', 'dagdoelDagen']);
  });

  test('onderdelen staan er alleen als ze aan staan; gewicht en notities standaard niet', async () => {
    await vulWeek();
    const v = await leesVerslag({ van: dag(-3), tot: dag(0), onderdelen: STANDAARD });
    const d = v.dagen[1];
    expect(Object.keys(d).sort()).toEqual(['datum', 'drinken', 'eten', 'leeg']);
    expect(v.gewicht).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain('68.4');
    expect(JSON.stringify(v)).not.toContain('Goed geslapen');
    expect(d.eten).toEqual([
      { soort: 'ontbijt', tekst: 'havermout met fruit' }, // het gevoel na de maaltijd (3) en het uur staan niet in het verslag
      { soort: 'middagmaal', tekst: 'soep en brood' },
    ]);
    expect(d.drinken).toEqual({ ml: 450, perSoort: { water: 250, thee: 200 }, aantalPerSoort: { water: 1, thee: 1 } });
  });

  test('met alles aan komen gewicht en notities erbij en niets anders', async () => {
    await vulWeek();
    const v = await leesVerslag({ van: dag(-3), tot: dag(0), onderdelen: ALLES });
    expect(v.gewicht).toEqual([{ datum: dag(-2), kg: 68.4 }]);
    expect(v.dagen[1].notitie).toBe('Goed geslapen.');
    expect(Object.keys(v.dagen[1]).sort()).toEqual(['datum', 'drinken', 'eten', 'leeg', 'notitie']);
    expect(Object.keys(v).sort()).toEqual(['dagen', 'gewicht', 'onderdelen', 'samenvatting', 'tot', 'van', 'vorigeWeging', 'weekverslag']);
  });

  test('een verdwenen onderdeel (supplementen, stemming) in een oude keuze komt nooit in het verslag', async () => {
    await vulWeek();
    const oud = { ...ALLES, supplementen: true, stemming: true, energie: true };
    const v = await leesVerslag({ van: dag(-2), tot: dag(-1), onderdelen: oud });
    expect(Object.keys(v.onderdelen)).toEqual(['eten', 'drinken', 'gewicht', 'notities']);
    const tekst = JSON.stringify(v);
    for (const woord of ['supplementen', 'stemming', 'energie', 'bijlage', 'Vitamine D', 'Magnesium']) expect(tekst).not.toContain(woord);
  });

  test('een dag met alleen een supplement of een stemming telt niet als ingevuld', async () => {
    const a = await voegSupplementToe({ naam: 'Vitamine D', dosis: '1x per dag 1 capsule', momenten: ['ochtend'] });
    await zetInname(dag(-1), a.id, 'ochtend', true);
    await zetStemming(dag(-1), 4);
    const v = await leesVerslag({ van: dag(-1), tot: dag(-1), onderdelen: ALLES });
    expect(v.dagen[0].leeg).toBe(true);
    expect(v.samenvatting.ingevuldeDagen).toBe(0);
  });

  test('de vier onderdelen in vaste volgorde; een oude bewaarde keuze wordt schoongemaakt', async () => {
    expect(VERSLAG_ONDERDELEN).toEqual(['eten', 'drinken', 'gewicht', 'notities']);
    expect(schoonOnderdelen({ eten: false, supplementen: true, stemming: true, gewicht: true })).toEqual({ eten: false, drinken: true, gewicht: true, notities: false });
    expect(schoonOnderdelen(null)).toEqual(STANDAARD);
    expect(await leesInstelling('delen.onderdelen')).toEqual(STANDAARD);
  });

  test('alleen de gekozen periode: gegevens erbuiten staan er niet in', async () => {
    await vulWeek();
    const v = await leesVerslag({ van: dag(-1), tot: dag(0), onderdelen: ALLES });
    expect(v.dagen).toHaveLength(2);
    expect(v.gewicht).toEqual([]);
    expect(v.samenvatting.ingevuldeDagen).toBe(1);
  });

  test('voorbeelddata telt niet mee', async () => {
    await db.maaltijden.put({ datum: dag(-1), soort: 'ontbijt', tijd: '08:00', tekst: 'voorbeeld', fotoId: null, gevoel: 3, voorbeeld: true, gewijzigdOp: 1 });
    await db.dranken.add({ datum: dag(-1), tijdstip: Date.now(), soort: 'water', ml: 250, voorbeeld: true });
    await db.dagen.put({ datum: dag(-1), stemming: 5, energie: 5, notitie: 'voorbeeld', voorbeeld: true });
    await db.wegingen.put({ week: dag(-1), datum: dag(-1), kg: 70, voorbeeld: true, gewijzigdOp: 1 });
    const v = await leesVerslag({ van: dag(-1), tot: dag(-1), onderdelen: ALLES });
    expect(v.dagen[0]).toMatchObject({ leeg: true, eten: [], drinken: { ml: 0, perSoort: {} }, notitie: '' });
    expect(v.gewicht).toEqual([]);
    expect(v.samenvatting).toEqual({ dagen: 1, noemer: 1, ingevuldeDagen: 0, gemiddeldMl: null, maaltijden: 0, dagdoelMl: 2500, dagdoelDagen: 0 });
  });

  test('een lege periode of een omgekeerde periode', async () => {
    const leeg = await leesVerslag({ van: dag(-6), tot: dag(0), onderdelen: STANDAARD });
    expect(leeg.samenvatting).toEqual({ dagen: 7, noemer: 7, ingevuldeDagen: 0, gemiddeldMl: null, maaltijden: 0, dagdoelMl: 2500, dagdoelDagen: 0 });
    await expect(leesVerslag({ van: dag(0), tot: dag(-1), onderdelen: STANDAARD })).rejects.toThrow('periode');
  });

  test('het dagdoel telt per dag: precies het doel is gehaald, iets minder niet', async () => {
    await voegDrankToe(dag(-2), 'water', 2500);
    await voegDrankToe(dag(-1), 'water', 1500);
    await voegDrankToe(dag(-1), 'thee', 1000);
    await voegDrankToe(dag(0), 'water', 2400);
    const v = await leesVerslag({ van: dag(-2), tot: dag(0), onderdelen: STANDAARD });
    expect(v.samenvatting).toMatchObject({ dagdoelMl: 2500, dagdoelDagen: 2 });
    expect(v.samenvatting.gemiddeldMl).toBeCloseTo(7400 / 3); // niet vooraf afgerond (R5-05)
  });

  test('verslag:gemaakt gaat één keer uit met van, tot en de manier', () => {
    const gezien = [];
    const stop = luister('verslag:gemaakt', (d) => gezien.push(d));
    meldVerslagGemaakt({ van: dag(-6), tot: dag(0) }, 'versturen');
    stop();
    meldVerslagGemaakt({ van: dag(-6), tot: dag(0) }, 'bewaren'); // niemand luistert meer
    expect(gezien).toEqual([{ van: dag(-6), tot: dag(0), manier: 'versturen' }]);
  });
});
