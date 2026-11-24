// Zonder naam (BESLISSING 319): de app heeft geen standaardnaam. Is er toch geen naam, dan valt elk scherm terug op niets: een begroeting
// zonder aanspreking, een zin zonder naam, "Je verslag", een neutraal icoon in de profielcirkel en een melding die nooit een naam draagt.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { leesInstelling, STANDAARD } from '../../src/data/instellingen.js';
import { groetVoor, initiaalVan, voornaamVan } from '../../src/logica/naam.js';
import { VOORBEELD_WAARDEN } from '../../src/logica/motivatie.js';
import { TEKSTEN, t, warmeZin } from '../../src/teksten.js';
import { bouwVerslagModel } from '../../src/ui/verslag-model.js';
import { kiesMelding } from '../../src/meldingen/tekst.js';

const GEEN_NAMEN = ['', '   ', null, undefined];

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('de naam in de instellingen', () => {
  test('is standaard leeg, in de standaardwaarden en in een lege database', async () => {
    expect(STANDAARD['profiel.naam']).toBe('');
    expect(await leesInstelling('profiel.naam')).toBe('');
  });
});

describe('voornaam en initiaal', () => {
  test('de voornaam is het eerste woord, zonder naam is er niets', () => {
    expect(voornaamVan('  Testnaam Achternaam ')).toBe('Testnaam');
    for (const n of GEEN_NAMEN) expect(voornaamVan(n)).toBe('');
  });

  test('de initiaal is een hoofdletter, zonder naam is er geen (dan komt er een icoon)', () => {
    expect(initiaalVan('testnaam')).toBe('T');
    expect(initiaalVan(' Andere Testnaam')).toBe('A');
    for (const n of GEEN_NAMEN) expect(initiaalVan(n)).toBe('');
  });
});

describe('begroeting', () => {
  test('met naam blijft de komma, zonder naam is het alleen het woord van het moment', () => {
    for (const dagdeel of ['ochtend', 'middag', 'avond']) {
      const voor = t('begroeting.' + dagdeel, { naam: '\u0001' }).split('\u0001')[0];
      expect(groetVoor(voor, 'Testnaam')).toMatch(/^Goeie\w+,$/);
      const zonder = groetVoor(voor, '');
      expect(zonder).toMatch(/^Goeie\w+$/);
      expect(zonder).not.toMatch(/[,\s]/);
    }
  });
});

describe('motivator', () => {
  test('elke zin klopt zonder naam: geen losse komma, geen dubbele spatie, geen leeg stuk', () => {
    const sleutels = Object.keys(TEKSTEN.motivatie).flatMap((groep) => Object.keys(TEKSTEN.motivatie[groep]).map((nr) => `motivatie.${groep}.${nr}`));
    expect(sleutels.length).toBeGreaterThan(50);
    for (const sleutel of sleutels) {
      for (const n of GEEN_NAMEN) {
        const zin = warmeZin(sleutel, n, VOORBEELD_WAARDEN);
        expect(zin, sleutel).not.toContain('{');
        expect(zin, sleutel).not.toMatch(/ ,|,\s*[.!?]|,$|\s{2}/);
        expect(zin, sleutel).toMatch(/[.?]$/);
      }
    }
  });
});

describe('verslagkop', () => {
  const leeg = { van: '2026-11-09', tot: '2026-11-15', samenvatting: {}, dagen: [], onderdelen: {} };

  test('zonder naam staat er geen naam in de kop, met naam wel de voornaam', () => {
    for (const n of GEEN_NAMEN) {
      const kop = bouwVerslagModel(leeg, n).kop;
      expect(kop.naam).toBe('');
      expect(kop.voornaam).toBe('');
    }
    const met = bouwVerslagModel(leeg, 'Testnaam Achternaam').kop;
    expect(met.naam).toBe('Testnaam');
    expect(met.voornaam).toBe('Van Testnaam');
  });

  test('de kop in vel en pdf is "Je verslag" zonder naam en "Verslag van ..." met naam', () => {
    expect(t('delen.pdfKopZonderNaam')).toBe('Je verslag');
    expect(t('delen.pdfKop', { naam: 'Testnaam' })).toBe('Verslag van Testnaam');
  });
});

describe('melding', () => {
  test('een melding draagt nooit een naam, ook niet met een naam in de instellingen', async () => {
    await db.instellingen.put({ sleutel: 'profiel.naam', waarde: 'Testnaam' });
    const basis = { nu: new Date(2026, 10, 13, 20, 0), dagboek: { aan: true, uur: '20:00' }, drinken: [], supplementenUren: [], doelMl: 2500, status: { bijgehouden: false } };
    for (const slotAan of [false, true]) {
      const m = kiesMelding({ ...basis, slotAan });
      expect(`${m.titel} ${m.tekst}`).not.toMatch(/Testnaam|\{naam\}/);
    }
    for (const [sleutel, tekst] of Object.entries(TEKSTEN.melding)) if (typeof tekst === 'string') expect(tekst, sleutel).not.toContain('{naam}');
  });
});
