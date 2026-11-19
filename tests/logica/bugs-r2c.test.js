// Review R2, bug R2-12: "Terugzetten" na het weghalen van een drank zette een nieuwe drank met het uur van nu terug, niet de
// weggehaalde drank met haar eigen tijdstip. Een volgende "laatste weghalen" haalde dan die drank weg in plaats van de echte laatste.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import * as dranken from '../../src/data/dranken.js';
import { leesDag } from '../../src/data/dagen.js';
import { zetInstelling } from '../../src/data/instellingen.js';

const { leesDranken, verwijderDrank, verwijderLaatste, voegDrankToe } = dranken;
const V = vandaag();

beforeEach(async () => {
  await db.delete();
  await openDb();
});

function vang(naam) {
  const lijst = [];
  const meldAf = luister(naam, (detail) => lijst.push(detail));
  return { lijst, meldAf };
}

// Een drank met een vast tijdstip van vroeger op de dag (09.10), zoals een koffie van die ochtend.
async function koffieVanOchtend(datum = V) {
  const d = new Date(`${datum}T09:10:00`);
  const id = await db.dranken.add({ datum, tijdstip: d.getTime(), soort: 'koffie', ml: 150, voorbeeld: false });
  return db.dranken.get(id);
}

describe('R2-12 een weggehaalde drank terugzetten', () => {
  test('zetDrankTerug bestaat in data/dranken.js', () => {
    expect(typeof dranken.zetDrankTerug).toBe('function');
  });

  test('de drank komt terug met haar oorspronkelijke tijdstip, soort en hoeveelheid', async () => {
    const koffie = await koffieVanOchtend();
    await db.dranken.add({ datum: V, tijdstip: koffie.tijdstip + 60_000, soort: 'water', ml: 250, voorbeeld: false });
    const weg = await verwijderDrank(koffie.id).then(() => koffie);
    await dranken.zetDrankTerug(weg);
    const lijst = await leesDranken(V);
    expect(lijst).toHaveLength(2);
    const terug = lijst.find((d) => d.soort === 'koffie');
    expect(terug).toMatchObject({ datum: V, tijdstip: koffie.tijdstip, soort: 'koffie', ml: 150, voorbeeld: false });
    // De laatste drank van de dag blijft het water: "laatste weghalen" haalt dat weg, niet de teruggezette koffie.
    expect((await verwijderLaatste(V)).soort).toBe('water');
  });

  test('een drank van een vroegere dag komt terug op die dag en dat tijdstip', async () => {
    const gisteren = plusDagen(V, -1);
    const koffie = await koffieVanOchtend(gisteren);
    await verwijderDrank(koffie.id);
    await dranken.zetDrankTerug(koffie);
    expect(await leesDranken(gisteren)).toEqual([expect.objectContaining({ tijdstip: koffie.tijdstip, soort: 'koffie', ml: 150 })]);
  });

  test('geen nieuwe viering als het doel al gehaald was', async () => {
    await zetInstelling('drinken.dagdoelMl', 500);
    const drank = await voegDrankToe(V, 'water', 600);
    expect((await leesDag(V)).doelGehaald).toBe(true);
    await verwijderDrank(drank.id);
    const doel = vang('doel:gehaald');
    const data = vang('data:gewijzigd');
    await dranken.zetDrankTerug(drank);
    doel.meldAf();
    data.meldAf();
    expect(doel.lijst).toEqual([]);
    expect(data.lijst).toEqual([{ store: 'dranken', datum: V }]);
    expect((await leesDag(V)).doelGehaald).toBe(true);
  });

  test('dezelfde doelregel als voegDrankToe: haalt het terugzetten het doel pas, dan telt dat (en viert vandaag)', async () => {
    await zetInstelling('drinken.dagdoelMl', 500);
    const koffie = await koffieVanOchtend();
    await db.dranken.update(koffie.id, { ml: 600 });
    const drank = await db.dranken.get(koffie.id);
    await verwijderDrank(drank.id);
    const doel = vang('doel:gehaald');
    await dranken.zetDrankTerug(drank);
    doel.meldAf();
    expect(doel.lijst).toEqual([{ datum: V }]);
    expect((await leesDag(V)).doelGehaald).toBe(true);
  });

  test('de drie schermen zetten terug met zetDrankTerug, niet met een nieuwe drank', () => {
    for (const bestand of ['src/schermen/hulp.js', 'src/schermen/drinken.js', 'src/schermen/dagboek-dag.js']) {
      const bron = readFileSync(bestand, 'utf8');
      const acties = bron.split("t('drinken.terugzetten')").slice(1);
      expect(acties.length, bestand).toBeGreaterThan(0);
      for (const actie of acties) expect(actie.slice(0, 120), bestand).toMatch(/opKlik: \(\) => zetDrankTerug\(/);
    }
  });
});
