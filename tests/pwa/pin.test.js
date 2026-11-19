// De pincode (src/vergrendeling/pin.js): hash met zout en rondes, controle en wachttijd (er is geen herstelantwoord meer, BESLISSING 224).
import { describe, it, expect } from 'vitest';
import {
  RONDES,
  METHODEN,
  bepaalMethode,
  GRATIS_POGINGEN,
  MAX_WACHT_MS,
  maakHash,
  controleer,
  isVerouderd,
  gelijkInConstanteTijd,
  wachttijdMs,
  naFout,
  resterendeWacht,
} from '../../src/vergrendeling/pin.js';

describe('hash', () => {
  it('bewaart { zout, hash, rondes } in base64 en nooit de code zelf', async () => {
    const bewaard = await maakHash('1234');
    expect(Object.keys(bewaard).sort()).toEqual(['hash', 'rondes', 'zout']);
    expect(bewaard.rondes).toBe(600000);
    expect(RONDES).toBe(600000);
    expect(atob(bewaard.zout)).toHaveLength(16);
    expect(atob(bewaard.hash)).toHaveLength(32);
    expect(JSON.stringify(bewaard)).not.toContain('1234');
  });

  it('geeft bij dezelfde code elke keer een ander zout en dus een andere hash', async () => {
    const a = await maakHash('1234');
    const b = await maakHash('1234');
    expect(a.zout).not.toBe(b.zout);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('controleer', () => {
  it('neemt de juiste code aan en weigert een foute', async () => {
    const bewaard = await maakHash('4821');
    expect(await controleer('4821', bewaard)).toBe(true);
    for (const fout of ['4822', '0000', '482', '48210', '', 'abcd']) expect(await controleer(fout, bewaard)).toBe(false);
  });

  it('gebruikt de rondes uit de bewaarde waarde (een oudere waarde zonder rondes telt als 100 000)', async () => {
    const oud = await maakHash('1357', 100000);
    expect(await controleer('1357', oud)).toBe(true);
    const zonderRondes = { zout: oud.zout, hash: oud.hash };
    expect(await controleer('1357', zonderRondes)).toBe(true);
    expect(await controleer('1358', zonderRondes)).toBe(false);
    // Met de verkeerde rondes klopt de hash niet.
    expect(await controleer('1357', { ...oud, rondes: 210000 })).toBe(false);
    expect(isVerouderd(zonderRondes)).toBe(true);
    expect(isVerouderd(oud)).toBe(true);
    expect(isVerouderd(await maakHash('1357'))).toBe(false);
  });

  it('weigert kapotte of ontbrekende bewaarde waarden zonder een fout te geven', async () => {
    for (const kapot of [null, undefined, {}, { zout: 1, hash: 2 }, { zout: '###', hash: '###' }]) expect(await controleer('1234', kapot)).toBe(false);
  });
});

describe('vergelijking in constante tijd', () => {
  it('geeft hetzelfde antwoord als een gewone vergelijking, ook bij een verschil op de eerste of laatste plek', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    expect(gelijkInConstanteTijd(a, new Uint8Array([1, 2, 3, 4]))).toBe(true);
    expect(gelijkInConstanteTijd(a, new Uint8Array([9, 2, 3, 4]))).toBe(false);
    expect(gelijkInConstanteTijd(a, new Uint8Array([1, 2, 3, 9]))).toBe(false);
    expect(gelijkInConstanteTijd(a, new Uint8Array([1, 2, 3]))).toBe(false);
  });
  // De looptijd zelf is hier niet te meten (te ruisig); de functie loopt altijd over alle bytes zonder vroegtijdig stoppen.
});

describe('geen herstelantwoord meer', () => {
  it('pin.js kent geen normaliseerAntwoord meer', async () => {
    const pin = await import('../../src/vergrendeling/pin.js');
    expect(pin.normaliseerAntwoord).toBeUndefined();
  });
});

describe('wachttijd na foute pogingen', () => {
  it('is er niet voor de vijfde fout en loopt daarna op: 30 s, 1, 5 en 15 minuten', () => {
    expect(GRATIS_POGINGEN).toBe(5);
    for (let n = 0; n < 5; n++) expect(wachttijdMs(n)).toBe(0);
    expect([5, 6, 7, 8].map(wachttijdMs)).toEqual([30000, 60000, 300000, 900000]);
    expect(wachttijdMs(20)).toBe(900000);
    expect(MAX_WACHT_MS).toBe(900000);
  });

  it('telt fouten en zet het einde van de wachttijd met een nepklok', () => {
    let nu = 1_000_000;
    let stand = { fouten: 0, wachtTot: 0 };
    for (let n = 1; n <= 4; n++) {
      stand = naFout(stand, nu);
      expect(stand).toEqual({ fouten: n, wachtTot: 0 });
    }
    stand = naFout(stand, nu);
    expect(stand).toEqual({ fouten: 5, wachtTot: nu + 30000 });
    expect(resterendeWacht(stand.wachtTot, nu)).toBe(30000);
    expect(resterendeWacht(stand.wachtTot, nu + 10000)).toBe(20000);
    expect(resterendeWacht(stand.wachtTot, nu + 30000)).toBe(0);
    // Na de wachttijd telt de volgende fout zwaarder.
    nu += 31000;
    stand = naFout(stand, nu);
    expect(stand).toEqual({ fouten: 6, wachtTot: nu + 60000 });
  });

  it('klemt een eindtijd die verder weg ligt dan de langste wachttijd (klok teruggezet)', () => {
    expect(resterendeWacht(10_000_000_000, 1000)).toBe(900000);
    expect(resterendeWacht(0, 1000)).toBe(0);
    expect(resterendeWacht(undefined, 1000)).toBe(0);
  });
});

describe('lengte van de code', () => {
  it('bewaart de lengte mee: zes voor een nieuwe code, vier voor een oude zonder lengte', async () => {
    const { maakPin, lengteVan, PIN_LENGTE } = await import('../../src/vergrendeling/pin.js');
    expect(PIN_LENGTE).toBe(6);
    const nieuw = await maakPin('123456');
    expect(nieuw.lengte).toBe(6);
    expect(lengteVan(nieuw)).toBe(6);
    expect(await controleer('123456', nieuw)).toBe(true);
    // Een code van vier cijfers die nog zo bewaard is, houdt vier stippen.
    const oud = await maakHash('1234', 100000);
    expect(lengteVan(oud)).toBe(4);
    expect(lengteVan(null)).toBe(4);
    expect((await maakPin('1234')).lengte).toBe(4);
  });
});

describe('Pincode of Face ID: precies één keuze (BESLISSING 194)', () => {
  it('de keuze is er één van twee', () => {
    expect(METHODEN).toEqual(['pin', 'faceid']);
  });

  it('een bewaarde keuze telt, maar Face ID zonder passkey kan niet', () => {
    expect(bepaalMethode('pin', 'abc')).toBe('pin');
    expect(bepaalMethode('pin', null)).toBe('pin');
    expect(bepaalMethode('faceid', 'abc')).toBe('faceid');
    expect(bepaalMethode('faceid', null)).toBe('pin');
  });

  it('een oude stand zonder keuze: code met passkey is Face ID, alleen code is Pincode', () => {
    expect(bepaalMethode(null, 'abc')).toBe('faceid');
    expect(bepaalMethode(undefined, 'abc')).toBe('faceid');
    expect(bepaalMethode(null, null)).toBe('pin');
    expect(bepaalMethode('onzin', null)).toBe('pin');
  });
});
