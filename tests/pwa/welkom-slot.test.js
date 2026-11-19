// BESLISSING 444: de vierde stap van het welkomscherm stelt de vergrendeling in met dezelfde stroom als het scherm Vergrendeling
// (src/vergrendeling/instellen.js). Hier: de gedeelde bewaarfunctie (niets bewaard als de toestelvraag mislukt, slot.aan als laatste,
// dezelfde pincode-opslag), dat beide schermen ze gebruiken, de teksten van de stap en dat de demo geen vierde stap heeft.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const bewaard = [];
let passkeyUit = 'id-1';
vi.mock('../../src/data/instellingen.js', () => ({
  zetInstelling: vi.fn(async (sleutel, waarde) => {
    bewaard.push([sleutel, waarde]);
  }),
  leesInstelling: vi.fn(async () => null),
}));
vi.mock('../../src/vergrendeling/passkey.js', () => ({ maakPasskey: vi.fn(async () => passkeyUit) }));
vi.mock('../../src/vergrendeling/slot.js', () => ({ ruimHerstelvraagOp: vi.fn(async () => {}) }));
vi.mock('../../src/ui/dom.js', () => ({ h: () => ({}) }));
vi.mock('../../src/ui/componenten.js', () => ({ knop: () => ({}) }));
vi.mock('../../src/vergrendeling/cijferblok.js', () => ({ cijferblok: () => ({}) }));

const { bewaarNieuwSlot } = await import('../../src/vergrendeling/instellen.js');
const { maakPasskey } = await import('../../src/vergrendeling/passkey.js');
const { TEKSTEN } = await import('../../src/teksten.js');
const { RONDES, controleer } = await import('../../src/vergrendeling/pin.js');

const lees = (f) => readFileSync(f, 'utf8');

describe('bewaarNieuwSlot (gedeeld door Vergrendeling en Welkom)', () => {
  beforeEach(() => {
    bewaard.length = 0;
    passkeyUit = 'id-1';
    maakPasskey.mockClear();
  });

  it('Pincode: bewaart de code met pin.js (600 000 rondes), geen passkey, en slot.aan als laatste', async () => {
    expect(await bewaarNieuwSlot('123456', { methode: 'pin' })).toBe(true);
    expect(maakPasskey).not.toHaveBeenCalled();
    const sleutels = bewaard.map(([s]) => s);
    expect(sleutels).toEqual(['slot.pin', 'slot.passkeyId', 'slot.methode', 'slot.fouten', 'slot.wachtTot', 'slot.aan']);
    const pin = Object.fromEntries(bewaard)['slot.pin'];
    expect(pin.rondes).toBe(RONDES);
    expect(RONDES).toBe(600000);
    expect(await controleer('123456', pin)).toBe(true);
    expect(JSON.stringify(pin)).not.toContain('123456');
    expect(Object.fromEntries(bewaard)['slot.methode']).toBe('pin');
    expect(Object.fromEntries(bewaard)['slot.aan']).toBe(true);
  });

  it('Face ID: eerst de code, dan de toestelvraag met de naam; methode faceid', async () => {
    expect(await bewaarNieuwSlot('654321', { methode: 'faceid', leesNaam: async () => 'Testnaam' })).toBe(true);
    expect(maakPasskey).toHaveBeenCalledWith('Testnaam');
    const w = Object.fromEntries(bewaard);
    expect(w['slot.passkeyId']).toBe('id-1');
    expect(w['slot.methode']).toBe('faceid');
    expect(w['slot.aan']).toBe(true);
  });

  it('een geannuleerde of mislukte toestelvraag bewaart niets', async () => {
    passkeyUit = null;
    expect(await bewaarNieuwSlot('654321', { methode: 'faceid' })).toBe(false);
    expect(bewaard).toEqual([]);
  });
});

describe('één instelstroom voor beide schermen', () => {
  it('het scherm Vergrendeling en het welkomscherm gebruiken instellen.js en kiezen geen eigen code', () => {
    const scherm = lees('src/vergrendeling/scherm.js');
    const welkom = lees('src/schermen/welkom.js');
    for (const [naam, code] of [['scherm', scherm], ['welkom', welkom]]) {
      expect(code, naam).toMatch(/from '\.{1,2}\/(vergrendeling\/)?instellen\.js'/);
      expect(code, naam).toMatch(/codeKiezer\(/);
      expect(code, naam).toMatch(/bewaarNieuwSlot\(/);
      // de tweede vraag naar de code staat alleen nog in instellen.js
      expect(code, naam).not.toMatch(/slot\.pinNogEens/);
    }
    expect(lees('src/vergrendeling/instellen.js')).toMatch(/slot\.pinNogEens/);
    // de welkomstap maakt zelf geen pincode of passkey
    expect(welkom).not.toMatch(/maakPin|maakPasskey|navigator\.credentials/);
  });

  it('geen eigen naam voor de methode: alleen faceIdNaam/methodeTekst; nergens Touch ID, Windows Hello of vingerafdruk in de code', () => {
    for (const f of ['src/schermen/welkom.js', 'src/vergrendeling/instellen.js']) {
      const code = lees(f).replace(/^\s*\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Windows Hello|Touch ID|vingerafdruk|schermslot|'Face ID'/i);
    }
  });

  // Het gedrag zelf staat in de schermtests: de echte app (c-welkom, x-welkom-slot: vier stappen) en het voorbeeld (c-demo-voorbeeld: vier stappen,
  // niets bewaard). Het eigen welkomscherm van de demo is in een schermtest niet te bereiken (Sofie heeft gegevens, dus start.klaar). Hier daarom
  // de regels in de code, zonder DOM (de unittests hebben er geen).
  const welkom = lees('src/schermen/welkom.js').replace(/^\s*\/\/.*$/gm, '');
  const functie = (naam) => {
    const begin = welkom.indexOf(`function ${naam}(`);
    expect(begin, naam).toBeGreaterThan(-1);
    return welkom.slice(begin, welkom.indexOf('\n  }\n', begin));
  };

  it('de demo heeft geen vierde stap (BESLISSING 364), behalve in het voorbeeld (BESLISSING 675); de echte app altijd vier', () => {
    // per aanroep: alleen het slot in de echte app (DEMO onwaar) of in het voorbeeld
    const metSlot = welkom.match(/const (\w+) = !DEMO \|\| Boolean\(voorbeeld\);/);
    expect(metSlot).not.toBeNull();
    const m = metSlot[1];
    expect(welkom).toMatch(new RegExp(`const \\w+ = ${m} \\? 4 : 3;`));
    expect(welkom).toMatch(new RegExp(`if \\(${m}\\) stappen\\.push\\(stapEl\\(SLOT_STAP`));
    // de router geeft gewone parameters mee ({}): zonder voorbeeld is het de gewone stroom
    expect(welkom).toMatch(/export function toon\(houder, \{ voorbeeld = null \} = \{\}\)/);
  });

  it('het voorbeeld bewaart niets en stelt geen slot in (BESLISSING 675)', () => {
    // klaar(): eerst het voorbeeld, vóór elke bewaarbeurt, strook of permanente opslag
    const klaar = functie('klaar');
    const voorbeeldAf = klaar.indexOf('if (voorbeeld) return voorbeeld.opKlaar()');
    expect(voorbeeldAf).toBeGreaterThan(-1);
    for (const bewaar of ['bewaarNieuwSlot(', 'zetInstelling(', 'zetStartKlaar(', 'strook(', 'location.hash']) {
      const plek = klaar.indexOf(bewaar);
      if (plek > -1) expect(plek, bewaar).toBeGreaterThan(voorbeeldAf);
    }
    expect(klaar.indexOf('vraagPermanenteOpslag(')).toBeGreaterThan(voorbeeldAf);
    // "Vergrendeling instellen" in het voorbeeld: opSlot in plaats van het cijferblok
    const verder = functie('verder');
    expect(verder).toMatch(/if \(voorbeeld\) voorbeeld\.opSlot\?\.\(\);[^\n]*\n\s*else if \(!bezig\) toonCode\(\);/);
  });
});

describe('teksten van de vierde stap', () => {
  const w = TEKSTEN.welkom;
  it('de teller rekent met het aantal stappen, en geen tekst zegt nog drie', () => {
    expect(w.stapVan).toBe('Stap {nr} van {totaal}');
    expect(w.intro).toMatch(/^Vier korte vragen/);
    expect(JSON.stringify(w)).not.toMatch(/\bdrie\b|van 3/i);
  });
  it('de stap heeft haar eigen teksten en hergebruikt de eerlijke regels', () => {
    for (const k of ['stap4', 'slotKeuzeLabel', 'slotLater', 'slotInstellen', 'nuNiet', 'slotMislukt']) expect(typeof w[k], k).toBe('string');
    expect(w.slotLater).toContain('Algemeen onder Vergrendeling');
    expect(TEKSTEN.privacy.regel4).toBe('Je pincode houdt meekijkers buiten. Je gegevens zelf zijn niet versleuteld.');
    expect(TEKSTEN.slot.kwijtGeen).toBe('Bloei kan je code niet terughalen.');
    const welkom = lees('src/schermen/welkom.js');
    expect(welkom).toContain("t('privacy.regel4')");
    expect(welkom).toContain("t('slot.kwijtGeen')");
  });
});
