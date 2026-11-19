// R6-06: een push die te laat aankomt (de dienst geeft hem een uur geldigheid) krijgt toch de tekst van de juiste soort.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../../src/data/db.js';
import { zetInstelling } from '../../src/data/instellingen.js';
import { LAAT_VENSTER_MINUTEN, VENSTER_MINUTEN, kiesMelding, kiesSoort } from '../../src/meldingen/tekst.js';
import { leesMeldingInvoer } from '../../src/meldingen/stand.js';

const op = (uur) => new Date(2026, 10, 16, ...uur.split(':').map(Number));

describe('late push (R6-06)', () => {
  beforeAll(async () => {
    await openDb();
    await zetInstelling('meldingen.dagboek', { aan: true, uur: '20:00' });
    await zetInstelling('meldingen.drinken', [{ aan: true, uur: '11:00' }]);
    await zetInstelling('meldingen.supplementenUren', []);
  });

  it('het venster van de service worker is zo lang als de geldigheid van het signaal (60 minuten), de standaard blijft 20', () => {
    expect(LAAT_VENSTER_MINUTEN).toBe(60);
    expect(VENSTER_MINUTEN).toBe(20);
  });

  it('een signaal van 11:00 dat om 11:40 aankomt, geeft een drinkherinnering en geen dagboektekst', async () => {
    const invoer = await leesMeldingInvoer(op('11:40'));
    expect(invoer.venster).toBe(60);
    expect(kiesSoort(invoer)).toBe('drinken');
    const melding = kiesMelding({ ...invoer, details: true });
    expect(melding.soort).toBe('drinken');
    expect(melding.tag).toBe('bloei-drinken');
  });

  it('zonder het ruimere venster zou het dagboek gekozen zijn (het oude gedrag)', async () => {
    const invoer = await leesMeldingInvoer(op('11:40'));
    expect(kiesSoort({ ...invoer, venster: undefined })).toBe('dagboek');
  });

  it('een signaal dat meer dan een uur te laat is, valt nog altijd terug op het dagboek', async () => {
    const invoer = await leesMeldingInvoer(op('12:30'));
    expect(kiesSoort(invoer)).toBe('dagboek');
  });
});
