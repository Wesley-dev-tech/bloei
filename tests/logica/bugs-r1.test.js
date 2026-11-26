// Herstel van de bugs R1-01 tot R1-08 uit de review van de datalaag (16 november). Elke test toonde eerst de bug.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { leesInstelling, migreerKan, STANDAARD, zetInstelling } from '../../src/data/instellingen.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { leesDag, zetNotitie } from '../../src/data/dagen.js';
import { leesBadgeStats } from '../../src/data/badges.js';
import { dagStatus, leesStats } from '../../src/data/statistiek.js';

const V = vandaag();

// Rijen met de vlag voorbeeld, zoals een bestaande gebruiker ze nog in haar database kan hebben. Laden kan niet meer (BESLISSING 407),
// maar wat er nog staat, mag nooit als eigen invoer tellen.
async function oudeVoorbeelddag(datum) {
  await db.dagen.put({ datum, notitie: 'verzonnen', doelGehaald: false, voorbeeld: true, gewijzigdOp: 1 });
  await db.maaltijden.put({ datum, soort: 'ontbijt', tijd: '08:00', tekst: 'boterham met kaas', fotoId: null, voorbeeld: true, gewijzigdOp: 1 });
  await db.dranken.add({ datum, tijdstip: 1, soort: 'water', ml: 800, voorbeeld: true });
}

beforeEach(async () => {
  await db.delete();
  await openDb();
});

function vang(naam) {
  const lijst = [];
  const meldAf = luister(naam, (detail) => lijst.push(detail));
  return { lijst, meldAf };
}

describe('R1-01 dag rond zonder bewaard dagdoel', () => {
  test('"Dag rond" telt met het standaard dagdoel als er geen dagdoelrij is', async () => {
    for (const soort of ['ontbijt', 'middagmaal', 'avondmaal']) await bewaarMaaltijd(V, soort, { tekst: 'iets' });
    await voegDrankToe(V, 'water', STANDAARD['drinken.dagdoelMl']);
    expect(await db.instellingen.get('drinken.dagdoelMl')).toBeUndefined();
    expect((await leesBadgeStats()).dagRondDagen).toBe(1);
  });

  test('onder het standaard dagdoel is de dag niet rond', async () => {
    for (const soort of ['ontbijt', 'middagmaal', 'avondmaal']) await bewaarMaaltijd(V, soort, { tekst: 'iets' });
    await voegDrankToe(V, 'water', STANDAARD['drinken.dagdoelMl'] - 1);
    expect((await leesBadgeStats()).dagRondDagen).toBe(0);
  });
});

describe('R1-02 dagdoelmigratie na een eerdere kanmigratie (BESLISSING 428)', () => {
  test('een bewaarde 2000 wordt één keer 2500 als de kan al eerder omgezet was, en de vlag staat', async () => {
    await zetInstelling('drinken.kanOmgezet', true);
    await zetInstelling('drinken.glasMl', 300); // de kanstap loopt niet opnieuw: een eigen grootte blijft
    await zetInstelling('drinken.dagdoelMl', 2000);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2500);
    expect(await leesInstelling('drinken.dagdoelOmgezet')).toBe(true);
    expect(await leesInstelling('drinken.glasMl')).toBe(300);
  });

  test('een ander dagdoel (1800) blijft staan, ook met de kan al omgezet, en de vlag staat', async () => {
    await zetInstelling('drinken.kanOmgezet', true);
    await zetInstelling('drinken.dagdoelMl', 1800);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(1800);
    expect(await leesInstelling('drinken.dagdoelOmgezet')).toBe(true);
  });

  test('na de omzetting zelf weer 2000 gekozen: blijft 2000 bij de volgende start', async () => {
    await zetInstelling('drinken.kanOmgezet', true);
    await zetInstelling('drinken.dagdoelMl', 2000);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2500);
    await zetInstelling('drinken.dagdoelMl', 2000);
    await migreerKan();
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2000);
  });

  test('met beide vlaggen al gezet blijft een bewaarde 2000 staan', async () => {
    await zetInstelling('drinken.kanOmgezet', true);
    await zetInstelling('drinken.dagdoelOmgezet', true);
    await zetInstelling('drinken.dagdoelMl', 2000);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2000);
  });

  test('verse installatie: geen dagdoelrij, standaard 2500, beide vlaggen gezet', async () => {
    await migreerKan();
    expect(await db.instellingen.get('drinken.dagdoelMl')).toBeUndefined();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2500);
    expect(await leesInstelling('drinken.dagdoelOmgezet')).toBe(true);
    expect(await leesInstelling('drinken.kanOmgezet')).toBe(true);
  });

  test('de gewone weg (beide vlaggen nog niet gezet) zet de oude standaard 2000 nog altijd om (BESLISSING 274)', async () => {
    await zetInstelling('drinken.dagdoelMl', 2000);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2500);
    expect(await leesInstelling('drinken.dagdoelOmgezet')).toBe(true);
  });
});

describe('R1-03 en R1-04 gelijktijdig bewaren', () => {
  test('twee snelle tikken over het doel geven één keer doel:gehaald', async () => {
    await zetInstelling('drinken.dagdoelMl', 1000);
    await voegDrankToe(V, 'water', 900);
    const { lijst, meldAf } = vang('doel:gehaald');
    await Promise.all([voegDrankToe(V, 'water', 200), voegDrankToe(V, 'water', 200)]);
    meldAf();
    expect(lijst).toHaveLength(1);
    expect((await leesDag(V)).doelGehaald).toBe(true);
  });

  test('een notitie die bewaart tijdens een tik over het doel gaat niet verloren', async () => {
    const fouten = [];
    for (let n = 0; n < 40; n++) {
      await db.delete();
      await openDb();
      await zetInstelling('drinken.dagdoelMl', 1000);
      await voegDrankToe(V, 'water', 900);
      const tik = voegDrankToe(V, 'water', 200);
      for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
      const notitie = zetNotitie(V, 'mijn notitie');
      await Promise.all([tik, notitie]);
      const dag = await leesDag(V);
      if (dag.notitie !== 'mijn notitie' || !dag.doelGehaald) fouten.push(n);
    }
    expect(fouten).toEqual([]);
  });
});

describe('R1-05 eigen invoer op een voorbeelddag', () => {
  // Een oude voorbeelddag: een verzonnen notitie, doel niet gehaald.
  const DAG = plusDagen(V, -18);

  test('een drank die het doel haalt, neemt de verzonnen notitie niet over', async () => {
    await oudeVoorbeelddag(DAG);
    const voor = await db.dagen.get(DAG);
    expect(voor).toMatchObject({ voorbeeld: true, doelGehaald: false });
    await voegDrankToe(DAG, 'water', 3000);
    expect(await leesDag(DAG)).toMatchObject({ voorbeeld: false, doelGehaald: true, notitie: '' });
  });

  test('een eigen notitie op een voorbeelddag neemt niets van de voorbeelddag over', async () => {
    await oudeVoorbeelddag(DAG);
    await zetNotitie(DAG, 'van mij');
    expect(await leesDag(DAG)).toMatchObject({ voorbeeld: false, notitie: 'van mij' });
  });
});

describe('R1-06 "Weer thuis" volgt BESLISSING 168', () => {
  test('dagen met alleen een notitie tellen als bijgehouden', async () => {
    const begin = plusDagen(V, -10);
    await bewaarMaaltijd(begin, 'ontbijt', { tekst: 'iets' });
    for (let i = 1; i <= 5; i++) await zetNotitie(plusDagen(begin, i), 'kort');
    await bewaarMaaltijd(plusDagen(begin, 6), 'ontbijt', { tekst: 'iets' });
    expect((await leesBadgeStats()).terugDagen).toBe(0);
  });

  test('een echte pauze telt nog altijd', async () => {
    const begin = plusDagen(V, -10);
    await bewaarMaaltijd(begin, 'ontbijt', { tekst: 'iets' });
    await bewaarMaaltijd(plusDagen(begin, 6), 'ontbijt', { tekst: 'iets' });
    expect((await leesBadgeStats()).terugDagen).toBe(1);
  });
});

describe('R1-07 dagStatus().bijgehouden volgt de reeks', () => {
  const dag = plusDagen(V, -21);

  test('een dag met alleen voorbeelddata is niet bijgehouden', async () => {
    await oudeVoorbeelddag(dag);
    expect((await dagStatus(dag)).maaltijdenIngevuld.length).toBeGreaterThan(0); // wat op het scherm staat, blijft
    expect((await dagStatus(dag)).bijgehouden).toBe(false);
  });

  test('eigen invoer op een voorbeelddag is wel bijgehouden', async () => {
    await oudeVoorbeelddag(dag);
    await voegDrankToe(dag, 'thee', 200);
    expect((await dagStatus(dag)).bijgehouden).toBe(true);
  });
});

// R1-08 (het dagdoel van de voorbeelddata) is vervallen met het laden van voorbeelddata (BESLISSING 407).
