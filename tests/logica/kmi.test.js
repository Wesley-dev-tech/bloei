// De waarschuwingen van het KMI (logica/kmi.js) en de gebieden waarin een plek ligt (logica/kmigebieden.js), zonder netwerk.
import { describe, expect, test } from 'vitest';
import { KMI_EIGEN_PAD, kmiAdres, leesKmi, verkleinKmi } from '../../src/logica/kmi.js';
import { kmiAntwoord } from '../../api/kmi.js';
import { waarschuwingsgebieden } from '../../src/logica/kmigebieden.js';
import { TEKSTEN } from '../../src/teksten.js';

// Een melding zoals MeteoAlarm ze geeft (CAP in JSON), met alleen wat Bloei leest.
const melding = ({ sent, gebied = 'BE21', soort = '1; wind', kleur = '2; yellow; Moderate', onset, expires, msgType = 'Alert', taal = 'nl-BE' }) => ({
  alert: {
    sent,
    msgType,
    info: [
      {
        language: taal,
        onset,
        expires,
        area: [{ areaDesc: 'gebied', geocode: [{ valueName: 'NUTS2', value: gebied }] }],
        parameter: [
          { valueName: 'awareness_level', value: kleur },
          { valueName: 'awareness_type', value: soort },
        ],
      },
    ],
  },
});
const NU = Date.parse('2026-11-27T12:00:00+01:00');
const EINDE = Date.parse('2026-11-28T00:00:00+01:00');
const feed = (...m) => ({ warnings: m });

describe('in welk gebied van het KMI ligt een plek', () => {
  test('de provincies, Brabant en de kust', () => {
    expect(waarschuwingsgebieden(51.168, 5.17)).toEqual(['BE21']); // Balen
    expect(waarschuwingsgebieden(50.93, 5.33)).toEqual(['BE22']); // Hasselt
    expect(waarschuwingsgebieden(51.05, 3.72)).toEqual(['BE23']); // Gent
    expect(waarschuwingsgebieden(51.21, 3.22)).toEqual(['BE25']); // Brugge
    expect(waarschuwingsgebieden(51.23, 2.92)).toEqual(['BE25', 'BE801']); // Oostende: ook de kust
    expect(waarschuwingsgebieden(50.85, 4.35)).toEqual(['BE004']); // Brussel hoort bij Brabant
    expect(waarschuwingsgebieden(50.88, 4.7)).toEqual(['BE004']); // Leuven
    expect(waarschuwingsgebieden(50.72, 4.61)).toEqual(['BE004']); // Waver
    expect(waarschuwingsgebieden(50.45, 3.95)).toEqual(['BE32']); // Bergen
    expect(waarschuwingsgebieden(50.63, 5.57)).toEqual(['BE33']); // Luik
    expect(waarschuwingsgebieden(49.68, 5.82)).toEqual(['BE34']); // Aarlen
    expect(waarschuwingsgebieden(50.47, 4.87)).toEqual(['BE35']); // Namen
  });

  test('buiten België geen gebied, en zonder plek ook niet', () => {
    expect(waarschuwingsgebieden(48.86, 2.35)).toEqual([]); // Parijs
    expect(waarschuwingsgebieden(52.37, 4.9)).toEqual([]); // Amsterdam
    expect(waarschuwingsgebieden(NaN, 4)).toEqual([]);
    expect(waarschuwingsgebieden(null, null)).toEqual([]);
  });
});

describe('de waarschuwing die nu geldt', () => {
  test('de vraag gaat naar MeteoAlarm, voor heel België, zonder plek', () => {
    expect(kmiAdres()).toBe('https://feeds.meteoalarm.org/api/v1/warnings/feeds-belgium');
  });

  test('een geldige waarschuwing voor het gebied: soort en kleur', () => {
    const json = feed(melding({ sent: '2026-11-27T08:00:00+01:00', soort: '1; wind', kleur: '3; orange; Severe', onset: '2026-11-27T10:00:00+01:00', expires: '2026-11-27T20:00:00+01:00' }));
    expect(leesKmi(json, ['BE21'], NU, EINDE)).toMatchObject({ soort: 'wind', niveau: 'oranje' });
    expect(leesKmi(json, ['BE22'], NU, EINDE)).toBe(null); // een ander gebied
  });

  test('alle soorten en kleuren', () => {
    const soorten = { '1; wind': 'wind', '2; snow-ice': 'gladheid', '3; thunderstorm': 'onweer', '4; fog': 'mist', '5; high-temperature': 'hitte', '6; low-temperature': 'koude', '10; rain': 'regen', '13; rain-flood': 'regen' };
    for (const [soort, naam] of Object.entries(soorten)) {
      for (const [kleur, niveau] of [['2; yellow; Moderate', 'geel'], ['3; orange; Severe', 'oranje'], ['4; red; Extreme', 'rood']]) {
        const json = feed(melding({ sent: '2026-11-27T08:00:00+01:00', soort, kleur, onset: '2026-11-27T08:00:00+01:00', expires: '2026-11-27T22:00:00+01:00' }));
        expect(leesKmi(json, ['BE21'], NU, EINDE), `${soort} ${kleur}`).toMatchObject({ soort: naam, niveau });
      }
      expect(TEKSTEN.weer.waarschuwing[naam], naam).toBeTruthy();
    }
  });

  test('stormtij, groen, voorbij en later dan vandaag tellen niet', () => {
    const tijd = { sent: '2026-11-27T08:00:00+01:00', onset: '2026-11-27T08:00:00+01:00', expires: '2026-11-27T22:00:00+01:00' };
    expect(leesKmi(feed(melding({ ...tijd, soort: '7; coastalevent' })), ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi(feed(melding({ ...tijd, kleur: '1; green; Minor' })), ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi(feed(melding({ ...tijd, expires: '2026-11-27T11:00:00+01:00' })), ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi(feed(melding({ ...tijd, onset: '2026-11-28T06:00:00+01:00', expires: '2026-11-28T18:00:00+01:00' })), ['BE21'], NU, EINDE)).toBe(null);
    // later vandaag telt wel: de kaart gaat over vandaag
    expect(leesKmi(feed(melding({ ...tijd, onset: '2026-11-27T18:00:00+01:00' })), ['BE21'], NU, EINDE)).toMatchObject({ niveau: 'geel' });
  });

  test('een nieuwere melding vervangt de vorige, ook een groene of een intrekking', () => {
    const oud = melding({ sent: '2026-11-27T06:00:00+01:00', kleur: '3; orange; Severe', onset: '2026-11-27T06:00:00+01:00', expires: '2026-11-27T22:00:00+01:00' });
    const geel = melding({ sent: '2026-11-27T09:00:00+01:00', kleur: '2; yellow; Moderate', onset: '2026-11-27T06:00:00+01:00', expires: '2026-11-27T22:00:00+01:00', msgType: 'Update' });
    const groen = melding({ sent: '2026-11-27T10:00:00+01:00', kleur: '1; green; Minor', onset: '2026-11-27T06:00:00+01:00', expires: '2026-11-27T22:00:00+01:00', msgType: 'Update' });
    const weg = melding({ sent: '2026-11-27T10:00:00+01:00', onset: '2026-11-27T06:00:00+01:00', expires: '2026-11-27T22:00:00+01:00', msgType: 'Cancel' });
    expect(leesKmi(feed(geel, oud), ['BE21'], NU, EINDE)).toMatchObject({ niveau: 'geel' });
    expect(leesKmi(feed(oud, geel, groen), ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi(feed(oud, weg), ['BE21'], NU, EINDE)).toBe(null);
  });

  test('meerdere waarschuwingen: de hoogste kleur, uit elk gebied van de plek', () => {
    const tijd = { sent: '2026-11-27T08:00:00+01:00', onset: '2026-11-27T08:00:00+01:00', expires: '2026-11-27T22:00:00+01:00' };
    const json = feed(
      melding({ ...tijd, gebied: 'BE25', soort: '10; rain', kleur: '2; yellow; Moderate' }),
      melding({ ...tijd, gebied: 'BE801', soort: '1; wind', kleur: '3; orange; Severe' }),
    );
    expect(leesKmi(json, ['BE25'], NU, EINDE)).toMatchObject({ soort: 'regen', niveau: 'geel' });
    expect(leesKmi(json, ['BE25', 'BE801'], NU, EINDE)).toMatchObject({ soort: 'wind', niveau: 'oranje' });
  });

  test('een kapot of leeg antwoord geeft geen waarschuwing', () => {
    expect(leesKmi(null, ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi({}, ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi({ warnings: [{}, { alert: { info: 'x' } }, null] }, ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi(feed(melding({ sent: 'x', onset: 'x', expires: 'x' })), ['BE21'], NU, EINDE)).toBe(null);
    expect(leesKmi(feed(melding({ sent: '2026-11-27T08:00:00+01:00', onset: '2026-11-27T08:00:00+01:00', expires: '2026-11-27T22:00:00+01:00' })), [], NU, EINDE)).toBe(null);
  });
});

describe('de waarschuwingen via Bloei zelf (api/kmi.js)', () => {
  test('eerst op hetzelfde adres als de app', () => {
    expect(KMI_EIGEN_PAD).toBe('/api/kmi');
  });

  test('verkleind tot wat Bloei leest, voorbije meldingen weg, en leesKmi leest het verkleinde antwoord', () => {
    const geldig = melding({ sent: '2026-11-27T08:00:00+01:00', soort: '1; wind', kleur: '3; orange; Severe', onset: '2026-11-27T08:00:00+01:00', expires: '2026-11-27T22:00:00+01:00' });
    geldig.alert.info.unshift({ language: 'fr-BE', headline: 'x' });
    geldig.alert.info[1].description = 'een lange tekst';
    geldig.alert.info[1].parameter.push({ valueName: 'impacts', value: 'x' });
    const voorbij = melding({ sent: '2026-11-26T08:00:00+01:00', onset: '2026-11-26T08:00:00+01:00', expires: '2026-11-26T22:00:00+01:00' });
    const klein = verkleinKmi(feed(geldig, voorbij), NU);
    expect(klein.warnings).toHaveLength(1);
    expect(klein.warnings[0].alert.info).toHaveLength(1);
    expect(klein.warnings[0].alert.info[0].language).toBe('nl-BE');
    expect(klein.warnings[0].alert.info[0].description).toBe(undefined);
    expect(klein.warnings[0].alert.info[0].parameter.map((p) => p.valueName)).toEqual(['awareness_level', 'awareness_type']);
    expect(leesKmi(klein, ['BE21'], NU, EINDE)).toMatchObject({ soort: 'wind', niveau: 'oranje' });
    expect(verkleinKmi(null)).toEqual({ warnings: [] });
  });

  test('de functie: bewaard bij Vercel als het lukt, en geen foutcode als MeteoAlarm niet antwoordt', async () => {
    const goed = await kmiAntwoord(async () => ({ ok: true, json: async () => feed() }));
    expect(goed.status).toBe(200);
    expect(goed.kop['Cache-Control']).toContain('s-maxage=300');
    expect(JSON.parse(goed.tekst)).toEqual({ warnings: [] });
    for (const haal of [async () => ({ ok: false }), async () => { throw new Error('geen netwerk'); }]) {
      const fout = await kmiAntwoord(haal);
      expect(fout.status).toBe(200);
      expect(fout.kop['Cache-Control']).toBe('no-store');
      expect(JSON.parse(fout.tekst)).toEqual({ warnings: [], onbereikbaar: true });
    }
  });
});
