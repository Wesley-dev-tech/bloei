// BESLISSING 638: kan Bloei niet bevestigen met de bewaarde sleutel van het slot (methode Face ID, de passkey is bv. uit de sleutelhanger of het
// wachtwoordbeheer verwijderd), dan neemt de volgende tik de eenmalige bevestiging met het toestel (toestelweg.js), voor het herstel van de code
// (541) en voor het wissen vanuit het slot (631). Met de echte passkey.js in een nagebootste browser: dezelfde gebruikersverificatie en dezelfde
// strenge controle als voorheen. Een mislukte of geannuleerde vraag wist niets en geeft geen nieuwe code.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, openDb } from '../../src/data/db.js';
import { leesInstelling, zetInstelling } from '../../src/data/instellingen.js';
import { bevestigMetTerugval, neemtTerugval, vergeetTerugval } from '../../src/vergrendeling/toestelweg.js';
import { wisNaToestel } from '../../src/vergrendeling/wisvanslot.js';

const RP = 'bloei.example';
const OORSPRONG = 'https://bloei.example';
const tekst = (s) => new TextEncoder().encode(s);
const b64url = (b) => Buffer.from(b).toString('base64url');
const SLEUTEL = Uint8Array.of(1, 2, 3, 4);
const PASSKEY_ID = b64url(SLEUTEL);
const EENMALIG = Uint8Array.of(9, 8, 7, 6);

// Een antwoord zoals een platformauthenticator het geeft (zie herstel.test.js), met de vlaggen naar keuze.
async function antwoord({ soort, challenge, vlaggen, id }) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', tekst(RP)));
  const delen = [hash, Uint8Array.of(vlaggen), new Uint8Array(4)];
  if (soort === 'create') delen.push(new Uint8Array(16), Uint8Array.of(0, id.length), id, Uint8Array.of(0xa0));
  const data = Uint8Array.from(delen.flatMap((d) => [...d]));
  const clientDataJSON = tekst(JSON.stringify({ type: `webauthn.${soort}`, challenge: b64url(challenge), origin: OORSPRONG, crossOrigin: false })).buffer;
  const response = soort === 'create' ? { clientDataJSON, getAuthenticatorData: () => data.buffer } : { clientDataJSON, authenticatorData: data.buffer, signature: new ArrayBuffer(8) };
  return { type: 'public-key', rawId: id.buffer, authenticatorAttachment: 'platform', response };
}

// Het nagebootste toestel. sleutelWeg: de passkey van het slot bestaat niet meer (get geeft NotAllowedError, zoals een echte browser).
// get / create: 'ok', 'annuleer' (NotAllowedError) of 'zonderUV' (een antwoord zonder de vlag UV).
let toestel;
let gevraagd;
let vergeten;
const PIN = { zout: 'eA', hash: 'eA', rondes: 1000, lengte: 6 };
const nogAlles = async () => ({ aan: await leesInstelling('slot.aan'), pin: await leesInstelling('slot.pin'), dranken: await db.dranken.count() });

beforeEach(async () => {
  vergeetTerugval();
  toestel = { sleutelWeg: false, get: 'ok', create: 'ok' };
  gevraagd = [];
  vergeten = [];
  globalThis.location = new URL(OORSPRONG);
  globalThis.window = globalThis;
  globalThis.PublicKeyCredential = { signalUnknownCredential: async ({ credentialId }) => vergeten.push(credentialId) };
  Object.defineProperty(globalThis.navigator, 'credentials', {
    configurable: true,
    value: {
      get: async (o) => {
        gevraagd.push(['get', o.publicKey]);
        if (toestel.sleutelWeg || toestel.get === 'annuleer') throw new DOMException('geannuleerd of geen sleutel', 'NotAllowedError');
        return antwoord({ soort: 'get', challenge: new Uint8Array(o.publicKey.challenge), vlaggen: toestel.get === 'zonderUV' ? 0x01 : 0x05, id: new Uint8Array(o.publicKey.allowCredentials[0].id) });
      },
      create: async (o) => {
        gevraagd.push(['create', o.publicKey]);
        if (toestel.create === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
        return antwoord({ soort: 'create', challenge: new Uint8Array(o.publicKey.challenge), vlaggen: toestel.create === 'zonderUV' ? 0x41 : 0x45, id: EENMALIG });
      },
    },
  });
  await db.delete();
  await openDb();
  await zetInstelling('slot.aan', true);
  await zetInstelling('slot.pin', PIN);
  await db.dranken.add({ datum: '2026-11-18', soort: 'water', ml: 800, tijd: Date.now() });
});

const soorten = () => gevraagd.map(([s]) => s);

describe('BESLISSING 638: terugval op de eenmalige bevestiging (herstel van de code)', () => {
  it('de sleutel is er: get op de passkey van het slot, zoals voorheen; geen terugval, niets gemaakt of vergeten', async () => {
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: true, terugval: false });
    expect(soorten()).toEqual(['get']);
    expect(gevraagd[0][1].userVerification).toBe('required');
    expect(new Uint8Array(gevraagd[0][1].allowCredentials[0].id)).toEqual(SLEUTEL);
    expect(neemtTerugval()).toBe(false);
    expect(vergeten).toEqual([]);
  });

  it('de sleutel is weg: de eerste tik mislukt (één vraag, geen tweede vanzelf), de volgende tik neemt de eenmalige weg en lukt', async () => {
    toestel.sleutelWeg = true;
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: false, terugval: true });
    expect(soorten()).toEqual(['get']); // geen automatische tweede vraag zonder tik
    expect(neemtTerugval()).toBe(true);
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: true, terugval: false });
    expect(soorten()).toEqual(['get', 'create']);
    // dezelfde drempel: platformauthenticator, gebruikersverificatie verplicht, geen naam van de gebruiker, en de sleutel meteen vergeten
    expect(gevraagd[1][1].authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' });
    expect(gevraagd[1][1].user.name).toBe('Bloei herstel');
    expect(vergeten).toEqual([b64url(EENMALIG)]);
  });

  it('de vraag gaat zonder await vooraf naar het toestel (nog in de tik), ook bij de terugval', () => {
    const bevestig = vi.fn(async () => false);
    bevestigMetTerugval({ passkeyId: PASSKEY_ID, bevestig });
    expect(bevestig).toHaveBeenCalledWith({ passkeyId: PASSKEY_ID });
  });

  it('geannuleerd (de sleutel is er nog): niets bevestigd; de volgende tik neemt de eenmalige weg, met dezelfde gebruikersverificatie', async () => {
    toestel.get = 'annuleer';
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: false, terugval: true });
    toestel.create = 'annuleer';
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: false, terugval: false });
    expect(soorten()).toEqual(['get', 'create']);
  });

  it('zonder gebruikersverificatie: geweigerd, met de bewaarde sleutel en bij de terugval; de sleutel van één keer wordt toch vergeten', async () => {
    toestel.get = 'zonderUV';
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: false, terugval: true });
    toestel.create = 'zonderUV';
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: false, terugval: false });
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: false, terugval: false });
    expect(soorten()).toEqual(['get', 'create', 'create']);
    expect(vergeten).toHaveLength(2);
  });

  it('een uitzondering of een antwoord dat geen true is, geldt nooit als bevestiging', async () => {
    for (const bevestig of [async () => { throw new Error('stuk'); }, async () => 'ja', async () => ({ ok: true }), async () => 1]) {
      vergeetTerugval();
      expect((await bevestigMetTerugval({ passkeyId: PASSKEY_ID, bevestig })).ok).toBe(false);
      expect((await bevestigMetTerugval({ passkeyId: PASSKEY_ID, bevestig })).ok).toBe(false);
    }
  });

  it('zonder bewaarde sleutel (methode Pincode): meteen de eenmalige weg, zoals voorheen; een mislukking is geen terugval', async () => {
    toestel.create = 'annuleer';
    expect(await bevestigMetTerugval({ passkeyId: null })).toEqual({ ok: false, terugval: false });
    expect(soorten()).toEqual(['create']);
    expect(neemtTerugval()).toBe(false);
  });

  it('vergeetTerugval (het slot ging open): de volgende keer weer eerst de bewaarde sleutel', async () => {
    toestel.sleutelWeg = true;
    await bevestigMetTerugval({ passkeyId: PASSKEY_ID });
    vergeetTerugval();
    toestel.sleutelWeg = false;
    expect(await bevestigMetTerugval({ passkeyId: PASSKEY_ID })).toEqual({ ok: true, terugval: false });
    expect(soorten()).toEqual(['get', 'get']);
  });
});

// BESLISSING 643: na een geslaagd herstel via de terugval staat de methode op Pincode, zonder verwijzing naar de passkey (die bestaat misschien
// niet meer). De nieuwe code en de overstap in één transactie; pas daarna wordt de oude passkey als onbekend gemeld, zoals bij de overstap van
// Face ID naar Pincode op het scherm Vergrendeling.
describe('BESLISSING 643: na een herstel via de terugval Pincode', () => {
  const NIEUW = { 'slot.pin': { zout: 'bg', hash: 'bg', rondes: 1000, lengte: 6 }, 'slot.fouten': 0, 'slot.wachtTot': 0 };
  beforeEach(async () => {
    await zetInstelling('slot.passkeyId', PASSKEY_ID);
    await zetInstelling('slot.methode', 'faceid');
  });

  it('de nieuwe code, methode Pincode en geen passkeyId; daarna de oude passkey gemeld', async () => {
    const { bewaarMetPincode, toestelSleutel } = await import('../../src/vergrendeling/herstel.js');
    const stappen = [];
    const vergeet = async (id) => {
      stappen.push({ id, methode: await leesInstelling('slot.methode') });
      return true;
    };
    expect(await bewaarMetPincode(NIEUW, { vergeet })).toBe(PASSKEY_ID);
    expect(await leesInstelling('slot.pin')).toEqual(NIEUW['slot.pin']);
    expect(await leesInstelling('slot.methode')).toBe('pin');
    expect(await leesInstelling('slot.passkeyId')).toBeNull();
    expect(stappen).toEqual([{ id: PASSKEY_ID, methode: 'pin' }]); // pas gemeld toen de overstap bewaard was
    // het slot en het herstel vragen de passkey niet meer: het slotscherm toont geen Face ID, het herstel neemt meteen de eenmalige weg
    const { bepaalMethode } = await import('../../src/vergrendeling/pin.js');
    expect(bepaalMethode(await leesInstelling('slot.methode'), await leesInstelling('slot.passkeyId'))).toBe('pin');
    expect(await toestelSleutel()).toBeNull();
    // het dagboek blijft
    expect(await db.dranken.count()).toBe(1);
  });

  it('de oude passkey wordt gelezen in dezelfde transactie als het bewaren (een ander tabblad kan er niet tussen komen)', async () => {
    const { bewaarMetPincode } = await import('../../src/vergrendeling/herstel.js');
    const { default: Dexie } = await import('dexie');
    const lezingen = [];
    const echt = db.instellingen.get.bind(db.instellingen);
    const spion = vi.spyOn(db.instellingen, 'get').mockImplementation((sleutel) => {
      if (sleutel === 'slot.passkeyId') lezingen.push(Dexie.currentTransaction ? { modus: Dexie.currentTransaction.mode } : null);
      return echt(sleutel);
    });
    // een ander tabblad wijzigt de passkey vlak voor het bewaren: de gemelde sleutel is die van op het moment van de transactie
    await zetInstelling('slot.passkeyId', 'andere-sleutel');
    const gemeld = [];
    expect(await bewaarMetPincode(NIEUW, { vergeet: async (id) => gemeld.push(id) })).toBe('andere-sleutel');
    spion.mockRestore();
    expect(lezingen).toEqual([{ modus: 'readwrite' }]);
    expect(gemeld).toEqual(['andere-sleutel']);
    expect(await leesInstelling('slot.passkeyId')).toBeNull();
  });

  it('mislukt de transactie: niets gewijzigd en niets gemeld', async () => {
    const { bewaarMetPincode } = await import('../../src/vergrendeling/herstel.js');
    const vergeet = vi.fn(async () => true);
    const spion = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('opslag stuk'));
    await expect(bewaarMetPincode(NIEUW, { vergeet })).rejects.toThrow('opslag stuk');
    spion.mockRestore();
    expect(vergeet).not.toHaveBeenCalled();
    expect(await leesInstelling('slot.pin')).toEqual(PIN);
    expect(await leesInstelling('slot.methode')).toBe('faceid');
    expect(await leesInstelling('slot.passkeyId')).toBe(PASSKEY_ID);
  });

  it('een melding die mislukt of blijft hangen, houdt niets tegen (hoogstens even wachten)', async () => {
    const { bewaarMetPincode } = await import('../../src/vergrendeling/herstel.js');
    await expect(bewaarMetPincode(NIEUW, { vergeet: async () => { throw new Error('nee'); } })).resolves.toBe(PASSKEY_ID);
    expect(await leesInstelling('slot.methode')).toBe('pin');
    await zetInstelling('slot.passkeyId', PASSKEY_ID);
    const begin = Date.now();
    await expect(bewaarMetPincode(NIEUW, { vergeet: () => new Promise(() => {}) })).resolves.toBe(PASSKEY_ID);
    expect(Date.now() - begin).toBeLessThan(3000);
  }, 6000);
});

describe('BESLISSING 638: terugval bij alles wissen vanuit het slot (631)', () => {
  it('de sleutel is er: get zoals voorheen, alles gewist', async () => {
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID })).toBe('gewist');
    expect(soorten()).toEqual(['get']);
    expect(await db.dranken.count()).toBe(0);
  });

  it('de sleutel is weg: eerst niets gewist met de melding van de terugval, de volgende tik wist na de eenmalige bevestiging', async () => {
    toestel.sleutelWeg = true;
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID })).toBe('terugval');
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID })).toBe('gewist');
    expect(soorten()).toEqual(['get', 'create']);
    expect(await db.dranken.count()).toBe(0);
    expect(await db.instellingen.count()).toBe(0);
  });

  it('geannuleerd of zonder gebruikersverificatie bij de terugval: niets gewist', async () => {
    toestel.sleutelWeg = true;
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID })).toBe('terugval');
    toestel.create = 'annuleer';
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID })).toBe('mislukt');
    toestel.create = 'zonderUV';
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID })).toBe('mislukt');
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
  });

  it('bevestigd via de terugval, maar het scherm staat er niet meer: niets gewist', async () => {
    toestel.sleutelWeg = true;
    await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID });
    expect(await wisNaToestel({ metToestel: true, passkeyId: PASSKEY_ID, nogGeldig: () => false })).toBe('afgebroken');
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
  });

  it('het slot zet de terugval terug bij het openen, en meldt hem met een eigen zin bij herstel en wissen', () => {
    const slot = readFileSync(join(process.cwd(), 'src/vergrendeling/slot.js'), 'utf8');
    const ontgrendel = slot.slice(slot.indexOf('async function ontgrendel('), slot.indexOf('async function biedHerstelcodeAan('));
    expect(ontgrendel).toMatch(/vergeetTerugval\(\)/);
    expect(slot).toMatch(/terugval \? 'slot\.toestelTerugval' : 'slot\.toestelMislukt'/);
    expect(slot).toMatch(/uit === 'terugval' \? 'slot\.wisTerugval' : 'slot\.wisMislukt'/);
    // geen andere weg naar het toestel vanuit het slot dan via toestelweg.js (en vraagPasskey voor het openen zelf)
    expect(slot.replace(/\/\/.*$/gm, '')).not.toMatch(/bevestigMetToestel/);
  });

  it('BESLISSING 643: alleen een geslaagd herstel via de terugval zet de methode op Pincode, met een eigen strook', () => {
    const slot = readFileSync(join(process.cwd(), 'src/vergrendeling/slot.js'), 'utf8');
    const kwijt = slot.slice(slot.indexOf('async function tekenKwijt('), slot.indexOf('function tekenHerstelInvoer('));
    // gelezen vóór de vraag (zonder await ertussen), alleen met een passkey van het slot
    expect(kwijt).toMatch(/const viaTerugval = Boolean\(passkeyId\) && neemtTerugval\(\);\n(\s*\/\/.*\n)*\s*const \{ ok: gelukt, terugval \} = await bevestigMetTerugval\(\{ passkeyId \}\);/);
    expect(kwijt).toMatch(/tekenNieuweCode\(\{ via: 'toestel', naarPincode: viaTerugval \}\)/);
    // de herstelcode zet nooit om
    const invoer = slot.slice(slot.indexOf('function tekenHerstelInvoer('), slot.indexOf('function tekenNieuweCode('));
    expect(invoer).toMatch(/tekenNieuweCode\(\{ via: 'code' \}\)/);
    const nieuw = slot.slice(slot.indexOf('function tekenNieuweCode('), slot.indexOf('async function tekenWisVraag('));
    expect(nieuw).toMatch(/if \(via !== 'code' && naarPincode\) \{\n\s*await bewaarMetPincode\(nieuw\);/);
    expect(nieuw).toMatch(/melding: methodeTekst\('slot\.hersteldPincode'\)/);
  });

  it('BESLISSING 643: de zin bestaat, zonder uitroepteken, met Face ID en op Android met de vingerafdruk', async () => {
    const { methodeTekst } = await import('../../src/vergrendeling/passkey.js');
    const ios = methodeTekst('slot.hersteldPincode', { android: false });
    const android = methodeTekst('slot.hersteldPincode', { android: true });
    expect(ios).toBe('Je nieuwe code is ingesteld. Je opent Bloei nu met je code. Face ID zet je weer aan bij Vergrendeling.');
    expect(android).toBe('Je nieuwe code is ingesteld. Je opent Bloei nu met je code. Je vingerafdruk of schermslot zet je weer aan bij Vergrendeling.');
    // de verboden tekens zelf bewaakt tests/logica/geen-lange-streepjes.test.js voor heel teksten.js
    for (const z of [ios, android]) expect(z).not.toMatch(/[!{}]/);
    expect(android).not.toMatch(/Face ID/);
  });

  it('de twee zinnen bestaan, zonder uitroepteken, en zeggen niets wat de methode noemt (ook goed op Android)', async () => {
    const { TEKSTEN } = await import('../../src/teksten.js');
    for (const s of ['toestelTerugval', 'wisTerugval']) {
      expect(typeof TEKSTEN.slot[s], s).toBe('string');
      expect(TEKSTEN.slot[s], s).not.toMatch(/[!{}]|Face ID/);
    }
    expect(TEKSTEN.slot.wisTerugval).toMatch(/Er is niets gewist\./);
  });
});
