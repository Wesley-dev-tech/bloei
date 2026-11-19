// Eén strenge controle voor elk antwoord van het toestel dat iets opent of toelaat (passkey.js, controleerBevestiging via vraagToestel):
//   vraagPasskey        het slot openen en de huidige code bevestigen bij wijzigen, uitzetten en een nieuwe herstelcode (methode Face ID);
//   maakPasskey         Face ID instellen (de passkey van het slot aanmaken);
//   bevestigMetToestel  het herstel na een vergeten code, met de passkey van het slot of met een sleutel voor één keer.
// Elk weigert een antwoord zonder de vlag UV, op een andere challenge, van een andere oorsprong, voor een ander rpId, van het verkeerde type of met
// een ander id, en slaagt met een goed antwoord. De controle gebeurt in de pagina, zonder server: dit bewijst geen handtekening (zie passkey.js).
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORTEL = join(import.meta.dirname, '..', '..');
const lees = (p) => readFileSync(join(WORTEL, p), 'utf8');
const zonderCommentaar = (tekst) => tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const OORSPRONG = 'https://bloei.example';
const tekst = (s) => new TextEncoder().encode(s);
const b64url = (b) => Buffer.from(b).toString('base64url');
const samen = (...delen) => Uint8Array.from(delen.flatMap((d) => [...d]));
const kop = (soort, n) => (n < 24 ? [(soort << 5) | n] : n < 256 ? [(soort << 5) | 24, n] : [(soort << 5) | 25, n >> 8, n & 255]);
const tk = (s) => [...kop(3, s.length), ...tekst(s)];

// Een nagebootste platformauthenticator die antwoordt zoals een echte, met één fout naar keuze:
//   'uv' zonder de vlag UV; 'challenge' een andere challenge; 'oorsprong' een andere oorsprong; 'rp' de hash van een ander rpId;
//   'type' het verkeerde type; 'id' een ander id (bij get een andere sleutel, bij create een ander id in de authenticatordata dan rawId);
//   'annuleer' het systeemvenster geannuleerd.
let fout = null;
let gevraagd = [];
let vergeten = [];
const NIEUW_ID = Uint8Array.of(9, 8, 7, 6);

async function antwoord(soort, o) {
  const pk = o.publicKey;
  const challenge = fout === 'challenge' ? new Uint8Array(32) : new Uint8Array(pk.challenge);
  const type = 'webauthn.' + (fout === 'type' ? (soort === 'create' ? 'get' : 'create') : soort);
  const client = tekst(JSON.stringify({ type, challenge: b64url(challenge), origin: fout === 'oorsprong' ? 'https://ander.example' : OORSPRONG, crossOrigin: false }));
  const rp = fout === 'rp' ? 'ander.example' : pk.rp?.id || pk.rpId || location.hostname;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', tekst(rp)));
  const vlaggen = 0x01 | (fout === 'uv' ? 0 : 0x04) | (soort === 'create' ? 0x40 : 0);
  if (soort === 'create') {
    const zichtbaar = fout === 'id' ? Uint8Array.of(1, 1, 1, 1) : NIEUW_ID;
    const data = samen(hash, [vlaggen], new Uint8Array(4), new Uint8Array(16), [0, zichtbaar.length], zichtbaar, [0xa0]);
    const att = Uint8Array.from([...kop(5, 3), ...tk('fmt'), ...tk('none'), ...tk('attStmt'), 0xa0, ...tk('authData'), ...kop(2, data.length), ...data]);
    return { type: 'public-key', rawId: NIEUW_ID.slice().buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client.buffer, attestationObject: att.buffer, getAuthenticatorData: () => data.buffer } };
  }
  const id = fout === 'id' ? Uint8Array.of(5, 5, 5) : new Uint8Array(pk.allowCredentials[0].id);
  const data = samen(hash, [vlaggen], new Uint8Array(4));
  return { type: 'public-key', rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client.buffer, authenticatorData: data.buffer, signature: new ArrayBuffer(8), userHandle: null } };
}

const passkey = await import('../../src/vergrendeling/passkey.js');
const PASSKEY_ID = b64url(Uint8Array.of(1, 2, 3, 4));
const FOUTEN = ['uv', 'challenge', 'oorsprong', 'rp', 'type', 'id'];

beforeEach(() => {
  fout = null;
  gevraagd = [];
  vergeten = [];
  globalThis.location = new URL(OORSPRONG);
  globalThis.window = globalThis;
  globalThis.PublicKeyCredential = { signalUnknownCredential: async ({ credentialId }) => vergeten.push(credentialId) };
  Object.defineProperty(globalThis.navigator, 'credentials', {
    configurable: true,
    value: {
      create: async (o) => {
        gevraagd.push(['create', o.publicKey]);
        if (fout === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
        return antwoord('create', o);
      },
      get: async (o) => {
        gevraagd.push(['get', o.publicKey]);
        if (fout === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
        return antwoord('get', o);
      },
    },
  });
});

// Elke stroom: hoe ze het toestel vraagt en wat "geslaagd" en "geweigerd" daar betekent.
const STROMEN = [
  { naam: 'het slot openen en de huidige code bevestigen (vraagPasskey)', soort: 'get', doe: () => passkey.vraagPasskey(PASSKEY_ID), ja: true, nee: false },
  { naam: 'Face ID instellen (maakPasskey)', soort: 'create', doe: () => passkey.maakPasskey('Bloei'), ja: b64url(NIEUW_ID), nee: null },
  { naam: 'het herstel met de passkey van Face ID (bevestigMetToestel)', soort: 'get', doe: () => passkey.bevestigMetToestel({ passkeyId: PASSKEY_ID }), ja: true, nee: false },
  { naam: 'het herstel met een sleutel voor één keer (bevestigMetToestel)', soort: 'create', doe: () => passkey.bevestigMetToestel(), ja: true, nee: false },
];

describe.each(STROMEN)('$naam', ({ soort, doe, ja, nee }) => {
  it('slaagt met een goed antwoord, met UV verplicht en een verse challenge van 32 bytes', async () => {
    expect(await doe()).toBe(ja);
    expect(gevraagd).toHaveLength(1);
    const [s, o] = gevraagd[0];
    expect(s).toBe(soort);
    expect(o.userVerification ?? o.authenticatorSelection?.userVerification).toBe('required');
    expect(new Uint8Array(o.challenge)).toHaveLength(32);
  });

  it.each(FOUTEN)('weigert een antwoord met de fout "%s"', async (f) => {
    fout = f;
    expect(await doe()).toBe(nee);
    expect(gevraagd).toHaveLength(1); // geen tweede systeemvenster
  });

  it('weigert bij annuleren, zonder fout naar buiten', async () => {
    fout = 'annuleer';
    expect(await doe()).toBe(nee);
  });

  it('elke vraag krijgt een andere challenge', async () => {
    await doe();
    await doe();
    expect(b64url(new Uint8Array(gevraagd[0][1].challenge))).not.toBe(b64url(new Uint8Array(gevraagd[1][1].challenge)));
  });
});

describe('opruimen en randgevallen', () => {
  it('Face ID instellen: een gemaakte sleutel die niet door de controle komt, wordt niet teruggegeven en meteen vergeten; een goede blijft', async () => {
    fout = 'uv';
    expect(await passkey.maakPasskey('Bloei')).toBeNull();
    expect(vergeten).toEqual([b64url(NIEUW_ID)]);
    fout = null;
    vergeten = [];
    expect(await passkey.maakPasskey('Bloei')).toBe(b64url(NIEUW_ID));
    expect(vergeten).toEqual([]);
  });

  it('vraagPasskey zonder id vraagt niets; een browser zonder WebAuthn geeft false en null zonder fout', async () => {
    expect(await passkey.vraagPasskey(null)).toBe(false);
    expect(gevraagd).toHaveLength(0);
    delete globalThis.PublicKeyCredential;
    expect(await passkey.vraagPasskey(PASSKEY_ID)).toBe(false);
    expect(await passkey.maakPasskey('Bloei')).toBeNull();
    expect(gevraagd).toHaveLength(0);
  });

  it('een leeg of half antwoord (zoals een oude nabootsing) opent niets', async () => {
    Object.defineProperty(globalThis.navigator, 'credentials', { configurable: true, value: { create: async () => ({ rawId: Uint8Array.of(1, 2, 3, 4).buffer }), get: async () => ({ id: 'ok' }) } });
    expect(await passkey.vraagPasskey(PASSKEY_ID)).toBe(false);
    expect(await passkey.maakPasskey('Bloei')).toBeNull();
    expect(vergeten).toEqual([b64url(Uint8Array.of(1, 2, 3, 4))]);
  });
});

describe('in de bron: geen tweede, zwakkere weg', () => {
  const bron = zonderCommentaar(lees('src/vergrendeling/passkey.js'));

  it('navigator.credentials.create en .get staan alleen in vraagToestel, en die kijkt elk antwoord na met controleerBevestiging', () => {
    const start = bron.indexOf('async function vraagToestel(');
    const eind = bron.indexOf('\n}\n', start);
    const vraag = bron.slice(start, eind);
    expect(start).toBeGreaterThan(-1);
    expect(vraag).toMatch(/controleerBevestiging\(credential,/);
    const buiten = bron.slice(0, start) + bron.slice(eind);
    expect(buiten).not.toMatch(/navigator\.credentials\.(create|get)\(/);
    expect(bron).not.toMatch(/Boolean\(credential\)/);
  });

  it('niemand buiten passkey.js vraagt het toestel zelf iets', () => {
    for (const bestand of ['slot.js', 'scherm.js', 'instellen.js', 'herstelscherm.js', 'herstel.js']) {
      expect(zonderCommentaar(lees('src/vergrendeling/' + bestand)), bestand).not.toMatch(/navigator\.credentials\.(create|get)\(/);
    }
  });
});
