// BESLISSING 518: een vergeten pincode herstellen met een herstelcode of het toestel (src/vergrendeling/herstel.js), zonder herstelvraag,
// server of account. Hier wat zonder browser na te gaan is: de vorm en de sterkte van de code, de bewaarde afgeleide, de opslag (alles of
// niets), het uitzetten en de regels in de bron (geen leesbare code in de opslag of de console, twee tabbladen, de eigen rem).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, openDb } from '../../src/data/db.js';
import { leesInstelling, zetInstelling, STANDAARD } from '../../src/data/instellingen.js';
import {
  ALFABET, LENGTE, SLOT_SLEUTELS, BESTANDSNAAM, bestandTekst, bewaarSamen, controleerHerstel, heeftBevestigdeHerstelcode, isGeldigeVorm,
  leesHerstel, maakHerstel, maakHerstelcode, normaliseer, ruimHerstelIdOp, toestelSleutel, voorleesbaar, wisSlotgegevens,
} from '../../src/vergrendeling/herstel.js';
import { RONDES } from '../../src/vergrendeling/pin.js';
import { TEKSTEN } from '../../src/teksten.js';

const WORTEL = join(import.meta.dirname, '..', '..');
const lees = (p) => readFileSync(join(WORTEL, p), 'utf8');
const zonderCommentaar = (tekst) => tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const VORM = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/;

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('de herstelcode zelf', () => {
  it('heeft twaalf tekens in drie groepen van vier, alleen uit het alfabet zonder 0, O, 1, I en L', () => {
    expect(ALFABET).toHaveLength(31);
    for (const verwarrend of ['0', 'O', '1', 'I', 'L']) expect(ALFABET).not.toContain(verwarrend);
    expect(new Set(ALFABET).size).toBe(ALFABET.length);
    for (let i = 0; i < 500; i += 1) {
      const code = maakHerstelcode();
      expect(code).toMatch(VORM);
      expect(normaliseer(code)).toHaveLength(LENGTE);
    }
  });

  it('is sterk genoeg: 12 tekens uit 31 geven meer dan 59 bits, en duizend codes zijn allemaal verschillend', () => {
    expect(LENGTE * Math.log2(ALFABET.length)).toBeGreaterThan(59);
    const codes = new Set(Array.from({ length: 1000 }, () => maakHerstelcode()));
    expect(codes.size).toBe(1000);
  });

  it('gebruikt elk teken even vaak: bytes boven 247 (8 x 31) tellen niet mee', () => {
    // 255 en 248 vallen weg; 0 is A, 31 is weer A, 30 is het laatste teken.
    const reeks = [255, 248, 0, 31, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const code = maakHerstelcode((n) => Uint8Array.from({ length: n }, (_, i) => reeks[i % reeks.length]));
    expect(normaliseer(code)).toBe('AA9BCDEFGHJK');
  });

  it('de invoer is niet hoofdlettergevoelig en negeert spaties en streepjes', () => {
    expect(normaliseer('k7m2 9qxa-4rtp')).toBe('K7M29QXA4RTP');
    expect(normaliseer('  K7M2\u20139QXA\u20144RTP ')).toBe('K7M29QXA4RTP');
    expect(isGeldigeVorm(normaliseer('k7m2-9qxa-4rtp'))).toBe(true);
    expect(isGeldigeVorm(normaliseer('K7M2-9QXA-4RT'))).toBe(false); // elf tekens
    expect(isGeldigeVorm(normaliseer('K7M2-9QXA-4RTO'))).toBe(false); // O staat niet in het alfabet
    expect(isGeldigeVorm(normaliseer(''))).toBe(false);
  });

  it('een schermlezer leest ze teken per teken, met een pauze tussen de groepen', () => {
    expect(voorleesbaar('K7M2-9QXA-4RTP')).toBe('K 7 M 2, 9 Q X A, 4 R T P');
  });

  it('het bestandje bevat de code en wat ze doet, geen naam', () => {
    const tekst = bestandTekst('K7M2-9QXA-4RTP', { kop: TEKSTEN.slot.bestandKop, uitleg: TEKSTEN.slot.bestandUitleg, wie: TEKSTEN.slot.herstelWie });
    expect(BESTANDSNAAM).toBe('bloei-herstelcode.txt');
    expect(tekst).toContain('K7M2-9QXA-4RTP');
    expect(tekst).toContain('Wie deze code heeft, kan een nieuwe pincode kiezen.');
    expect(tekst).not.toMatch(/\{naam\}|Testnaam/);
  });
});

describe('de bewaarde afgeleide', () => {
  it('bevat de code nooit leesbaar: PBKDF2 met 600 000 rondes en een eigen zout per keer', async () => {
    const code = 'K7M2-9QXA-4RTP';
    const a = await maakHerstel(code, { nu: 1000 });
    const b = await maakHerstel(code, { nu: 1000 });
    const json = JSON.stringify(a);
    for (const deel of ['K7M2', '9QXA', '4RTP', 'K7M29QXA4RTP', 'k7m2']) expect(json).not.toContain(deel);
    expect(Object.keys(a).sort()).toEqual(['bevestigd', 'gemaakt', 'hash', 'rondes', 'zout']);
    expect(a.rondes).toBe(RONDES);
    expect(RONDES).toBe(600000);
    expect(a.zout).not.toBe(b.zout);
    expect(a.hash).not.toBe(b.hash);
    expect(a.bevestigd).toBe(false);
    expect(a.gemaakt).toBe(1000);
  });

  it('klopt met kleine letters, spaties en streepjes; een andere of misvormde code klopt nooit', async () => {
    const bewaard = await maakHerstel('K7M2-9QXA-4RTP');
    expect(await controleerHerstel('k7m2 9qxa 4rtp', bewaard)).toBe(true);
    expect(await controleerHerstel('K7M29QXA4RTP', bewaard)).toBe(true);
    expect(await controleerHerstel('K7M2-9QXA-4RTQ', bewaard)).toBe(false);
    expect(await controleerHerstel('K7M2-9QXA', bewaard)).toBe(false);
    expect(await controleerHerstel('K7M2-9QXA-4RTP', null)).toBe(false);
    expect(await controleerHerstel('K7M2-9QXA-4RTP', { zout: 'x', hash: 'y' })).toBe(false);
  });

  it('een code in een verkeerde vorm wordt niet eens bewaard', async () => {
    await expect(maakHerstel('KORT')).rejects.toThrow();
  });
});

describe('de opslag', () => {
  it('de standaardwaarden: geen herstelcode, een eigen rem op nul; geen herstelsleutel meer (BESLISSING 541)', () => {
    expect(STANDAARD['slot.herstel']).toBeNull();
    expect('slot.herstelId' in STANDAARD).toBe(false);
    expect(SLOT_SLEUTELS).not.toContain('slot.herstelId');
    expect(STANDAARD['slot.herstelFouten']).toBe(0);
    expect(STANDAARD['slot.herstelWachtTot']).toBe(0);
    expect(STANDAARD['slot.herstelAanbod']).toBe(false);
  });

  it('bewaarSamen schrijft alles of niets (één transactie)', async () => {
    await zetInstelling('slot.pin', 'oud');
    await expect(bewaarSamen({ 'slot.pin': 'nieuw', 'slot.herstel': () => 'niet te bewaren' })).rejects.toBeTruthy();
    expect(await leesInstelling('slot.pin')).toBe('oud');
    expect(await leesInstelling('slot.herstel')).toBeNull();
    await bewaarSamen({ 'slot.pin': 'nieuw', 'slot.fouten': 0 });
    expect(await leesInstelling('slot.pin')).toBe('nieuw');
  });

  it('de bestaande sleutel van het toestel: bij Face ID de passkey van het slot, bij Pincode geen (ook geen oude herstelsleutel)', async () => {
    expect(await toestelSleutel()).toBeNull();
    await bewaarSamen({ 'slot.methode': 'pin', 'slot.passkeyId': null });
    expect(await toestelSleutel()).toBeNull();
    // een oude herstelsleutel (BESLISSING 518) telt niet meer mee (BESLISSING 541)
    await zetInstelling('slot.herstelId', 'herstel-1');
    expect(await toestelSleutel()).toBeNull();
    await bewaarSamen({ 'slot.methode': 'faceid', 'slot.passkeyId': 'face-1' });
    expect(await toestelSleutel()).toBe('face-1');
    // methode Pincode met een oude passkey: die opent niets en herstelt niets
    await bewaarSamen({ 'slot.methode': 'pin' });
    expect(await toestelSleutel()).toBeNull();
  });

  it('BESLISSING 541: een oude herstelsleutel wordt vergeten en de rij verdwijnt uit de opslag; de passkey van Face ID blijft', async () => {
    const vergeten = [];
    const vergeet = async (id) => vergeten.push(id);
    // niets te doen
    expect(await ruimHerstelIdOp({ vergeet })).toBe(false);
    expect(vergeten).toEqual([]);
    // een gekoppelde herstelsleutel
    await bewaarSamen({ 'slot.methode': 'pin', 'slot.herstelId': 'herstel-1' });
    expect(await ruimHerstelIdOp({ vergeet })).toBe(true);
    expect(vergeten).toEqual(['herstel-1']);
    expect(await db.instellingen.get('slot.herstelId')).toBeUndefined();
    // een lege rij verdwijnt ook, zonder iets te melden
    await zetInstelling('slot.herstelId', null);
    expect(await ruimHerstelIdOp({ vergeet })).toBe(true);
    expect(vergeten).toEqual(['herstel-1']);
    expect(await db.instellingen.get('slot.herstelId')).toBeUndefined();
    // dezelfde sleutel als de passkey van Face ID: die wordt nooit vergeten
    await bewaarSamen({ 'slot.methode': 'faceid', 'slot.passkeyId': 'face-1', 'slot.herstelId': 'face-1' });
    expect(await ruimHerstelIdOp({ vergeet })).toBe(true);
    expect(vergeten).toEqual(['herstel-1']);
    expect(await leesInstelling('slot.passkeyId')).toBe('face-1');
    // een melding die mislukt of blijft hangen, houdt het opruimen niet tegen
    await zetInstelling('slot.herstelId', 'herstel-2');
    expect(await ruimHerstelIdOp({ vergeet: async () => { throw new Error('kan niet'); } })).toBe(true);
    expect(await db.instellingen.get('slot.herstelId')).toBeUndefined();
    // in de demo (BESLISSING 364) raakt het niets aan
    await zetInstelling('slot.herstelId', 'herstel-3');
    expect(await ruimHerstelIdOp({ vergeet, demo: true })).toBe(false);
    expect(await leesInstelling('slot.herstelId')).toBe('herstel-3');
    expect(vergeten).toEqual(['herstel-1']);
  });

  it('een niet-bevestigde herstelcode werkt, maar telt als open punt', async () => {
    expect(await heeftBevestigdeHerstelcode()).toBe(false);
    const h = await maakHerstel('K7M2-9QXA-4RTP');
    await zetInstelling('slot.herstel', h);
    expect(await leesHerstel()).toEqual(h);
    expect(await heeftBevestigdeHerstelcode()).toBe(false);
    expect(await controleerHerstel('K7M2-9QXA-4RTP', await leesHerstel())).toBe(true);
    await zetInstelling('slot.herstel', { ...h, bevestigd: true });
    expect(await heeftBevestigdeHerstelcode()).toBe(true);
  });

  it('het slot uitzetten wist ook de herstelcode, een oude herstelsleutel en de rem', async () => {
    await bewaarSamen({
      'slot.aan': true,
      'slot.pin': { zout: 'a', hash: 'b' },
      'slot.methode': 'pin',
      'slot.herstel': await maakHerstel('K7M2-9QXA-4RTP', { bevestigd: true }),
      'slot.herstelId': 'herstel-1',
      'slot.herstelFouten': 6,
      'slot.herstelWachtTot': 99,
      'slot.herstelAanbod': true,
    });
    await wisSlotgegevens();
    for (const sleutel of SLOT_SLEUTELS) {
      const w = await leesInstelling(sleutel);
      expect([null, false, 0], sleutel).toContain(w);
    }
    expect(await toestelSleutel()).toBeNull();
    expect(await leesHerstel()).toBeNull();
    expect(await db.instellingen.get('slot.herstelId')).toBeUndefined();
  });
});

describe('bewaarNieuwSlot met herstelcode (instellen.js)', () => {
  it('bewaart de herstelcode vóór slot.aan, nooit een herstelsleutel (BESLISSING 541)', async () => {
    const { bewaarNieuwSlot } = await import('../../src/vergrendeling/instellen.js');
    const volgorde = [];
    const { luister } = await import('../../src/kern/bus.js');
    const af = luister('instelling:gewijzigd', ({ sleutel }) => volgorde.push(sleutel));
    const herstel = await maakHerstel('K7M2-9QXA-4RTP', { bevestigd: true });
    // een oude oproeper die nog een herstelId meegeeft: dat wordt niet bewaard
    expect(await bewaarNieuwSlot('123456', { methode: 'pin', herstel, herstelId: 'herstel-1' })).toBe(true);
    af();
    expect(volgorde.indexOf('slot.herstel')).toBeGreaterThan(-1);
    expect(volgorde.indexOf('slot.herstel')).toBeLessThan(volgorde.indexOf('slot.aan'));
    expect(volgorde[volgorde.length - 1]).toBe('slot.aan');
    expect(volgorde).not.toContain('slot.herstelId');
    expect(await db.instellingen.get('slot.herstelId')).toBeUndefined();
    expect(await heeftBevestigdeHerstelcode()).toBe(true);
    expect(await toestelSleutel()).toBeNull();
    // bij Face ID is de passkey de bestaande sleutel van het toestel
    await bewaarNieuwSlot('123456', { methode: 'faceid', passkeyId: 'face-1', herstel });
    expect(await db.instellingen.get('slot.herstelId')).toBeUndefined();
    expect(await toestelSleutel()).toBe('face-1');
  });
});

describe('regels in de bron', () => {
  const BESTANDEN = ['src/vergrendeling/herstel.js', 'src/vergrendeling/herstelscherm.js', 'src/vergrendeling/slot.js', 'src/vergrendeling/scherm.js', 'src/vergrendeling/instellen.js'];

  it('geen herstelcode of afgeleide in localStorage, sessionStorage, de adresbalk of de console', () => {
    for (const f of BESTANDEN) {
      const code = zonderCommentaar(lees(f));
      expect(code, f).not.toMatch(/localStorage|sessionStorage|history\.(push|replace)State|location\.search/);
      expect(code, f).not.toMatch(/console\.(log|info|debug|warn)\(/);
      // de enige console-regel in het slot is de foutmelding van het wissen, zonder code
      for (const m of code.matchAll(/console\.error\(([^)]*)\)/g)) expect(m[1], f).toBe('fout');
      expect(code, f).not.toMatch(/location\.hash\s*=\s*[^;]*(code|herstel)/i);
    }
  });

  it('geen herstelvraag en geen netwerk: alleen het toestel en de code', () => {
    for (const f of BESTANDEN) {
      const code = zonderCommentaar(lees(f));
      expect(code, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
    }
    expect(JSON.stringify(TEKSTEN.slot)).not.toMatch(/herstelvraag|geheime vraag|huisdier/i);
  });

  it('het slot leest de pincode bij elke poging opnieuw en luistert naar een ander tabblad', () => {
    const slot = zonderCommentaar(lees('src/vergrendeling/slot.js'));
    const probeer = slot.slice(slot.indexOf('async function probeer('), slot.indexOf('async function faceId('));
    expect(probeer).toMatch(/leesInstelling\('slot\.pin'\)/);
    expect(slot).toMatch(/luister\('elders:gewijzigd'/);
  });

  it('de herstelcode heeft een eigen rem, met dezelfde oplopende wachttijd als de pincode', () => {
    const slot = lees('src/vergrendeling/slot.js');
    expect(slot).toMatch(/HERSTEL_REM = \{ fouten: 'slot\.herstelFouten', wachtTot: 'slot\.herstelWachtTot' \}/);
    expect(slot).toMatch(/telFout\(HERSTEL_REM\)/);
    // foute pogingen wissen nooit iets: wisAlles staat alleen achter de tweede bevestiging en het toestel (BESLISSING 631, wisvanslot.js)
    expect(slot.match(/wisAlles\(\)/g)).toBeNull();
    expect(slot.match(/wisNaToestel\(/g)).toHaveLength(1);
    expect(lees('src/vergrendeling/wisvanslot.js').match(/wisAlles\b/g).length).toBeGreaterThan(0);
  });

  it('een nieuwe herstelcode, de code wijzigen en uitzetten vragen eerst de huidige code of het toestel', () => {
    const scherm = lees('src/vergrendeling/scherm.js');
    for (const fn of ['wijzigCode', 'nieuweHerstelcode', 'zetUit']) {
      const deel = scherm.slice(scherm.indexOf(`function ${fn}(`));
      expect(deel.slice(0, 200), fn).toMatch(/vraagHuidigeCode\(/);
    }
  });

  it('BESLISSING 541: geen koppelen meer, geen vraag "Je toestel als hulp" en geen herstelsleutel in de stroom', () => {
    for (const f of BESTANDEN) {
      const code = zonderCommentaar(lees(f));
      expect(code, f).not.toMatch(/koppelToestel|ontkoppelToestel|toestelAanbod|data-toestelaanbod|kanToestel/);
      expect(code, f).not.toMatch(/(zetInstelling|bewaarSamen)\([^)]*'slot\.herstelId'\s*,\s*[^n)]/);
    }
    for (const sleutel of ['toestelTitel', 'toestelVraag', 'toestelJa', 'toestelNee', 'toestelRij', 'toestelKoppel', 'toestelOntkoppel', 'toestelGekoppeld', 'toestelNietGekoppeld']) {
      expect(TEKSTEN.slot[sleutel], sleutel).toBeUndefined();
    }
    // het slot ruimt een oude herstelsleutel op bij het opstarten, zonder op het openen te wachten
    expect(zonderCommentaar(lees('src/vergrendeling/slot.js'))).toMatch(/\n\s+ruimHerstelIdOp\(\)\.catch\(/);
  });

  it('BESLISSING 541: het scherm "Je code niet meer weten" toont de weg van het toestel als het toestel het kan, zonder koppeling', () => {
    const slot = zonderCommentaar(lees('src/vergrendeling/slot.js'));
    const kwijt = slot.slice(slot.indexOf('async function tekenKwijt('), slot.indexOf('function tekenHerstelInvoer('));
    expect(kwijt).toMatch(/const metToestel = await passkeyMogelijk\(\);/);
    // BESLISSING 638: via toestelweg.js (bevestigMetToestel, met terugval op de eenmalige weg als de bewaarde sleutel niet lukt)
    expect(kwijt).toMatch(/bevestigMetTerugval\(\{ passkeyId \}\)/);
    expect(kwijt).not.toMatch(/vraagPasskey\(/);
  });

  it('alles wissen vergeet ook een oude herstelsleutel van het toestel', () => {
    const wissen = lees('src/data/wissen.js');
    expect(wissen).toMatch(/slot\.herstelId/);
    // gelezen vóór de transactie, gemeld pas als die lukte (tests/logica/wissen-volgorde.test.js)
    expect(wissen.indexOf("get('slot.herstelId')")).toBeLessThan(wissen.indexOf('tabel.clear()'));
    expect(wissen.indexOf('vergeetPasskey(')).toBeGreaterThan(wissen.indexOf('tabel.clear()'));
  });
});

// ---- BESLISSING 541: de bevestiging van het toestel zelf (passkey.js) ----
// Een antwoord zoals een platformauthenticator het geeft, met de vlaggen en het id naar keuze. rpId en oorsprong zoals op de echte site.
const RP = 'bloei.example';
const OORSPRONG = 'https://bloei.example';
const tekst = (s) => new TextEncoder().encode(s);
const b64url = (b) => Buffer.from(b).toString('base64url');
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', tekst(s)));

async function authData({ rp = RP, vlaggen, id = null }) {
  const delen = [await sha(rp), Uint8Array.of(vlaggen), new Uint8Array(4)];
  if (id) delen.push(new Uint8Array(16), Uint8Array.of(id.length >> 8, id.length & 255), id, Uint8Array.of(0xa0));
  return Uint8Array.from(delen.flatMap((d) => [...d]));
}
// CBOR: { fmt: "none", attStmt: {}, authData: <bytes> }
function attestatie(data) {
  const kop = (soort, n) => (n < 24 ? [(soort << 5) | n] : n < 256 ? [(soort << 5) | 24, n] : [(soort << 5) | 25, n >> 8, n & 255]);
  const tk = (s) => [...kop(3, s.length), ...tekst(s)];
  return Uint8Array.from([...kop(5, 3), ...tk('fmt'), ...tk('none'), ...tk('attStmt'), 0xa0, ...tk('authData'), ...kop(2, data.length), ...data]);
}
async function antwoord({ soort = 'create', challenge, vlaggen = 0x45, id = Uint8Array.of(9, 8, 7, 6), metGad = true, client = {}, rp = RP, bijlage = 'platform', ander = null }) {
  const clientData = tekst(JSON.stringify({ type: soort === 'create' ? 'webauthn.create' : 'webauthn.get', challenge: b64url(challenge), origin: OORSPRONG, crossOrigin: false, ...client }));
  const data = await authData({ rp, vlaggen, id: soort === 'create' ? ander ?? id : null });
  const response = soort === 'create'
    ? { clientDataJSON: clientData.buffer, attestationObject: attestatie(data).buffer, ...(metGad ? { getAuthenticatorData: () => data.buffer } : {}) }
    : { clientDataJSON: clientData.buffer, authenticatorData: data.buffer, signature: new ArrayBuffer(8) };
  return { type: 'public-key', rawId: id.buffer, authenticatorAttachment: bijlage, response };
}

describe('bevestigMetToestel: het antwoord van het toestel nakijken (BESLISSING 541)', async () => {
  const { authDataUitAttestatie, controleerBevestiging } = await import('../../src/vergrendeling/passkey.js');
  const challenge = Uint8Array.from({ length: 32 }, (_, i) => i * 7);
  const verwacht = { challenge, rpId: RP, origin: OORSPRONG };

  it('een sleutel voor één keer met de vlag UV is een bevestiging; ook in een browser zonder getAuthenticatorData (CBOR)', async () => {
    expect(await controleerBevestiging(await antwoord({ challenge }), { ...verwacht, soort: 'create' })).toBe(true);
    expect(await controleerBevestiging(await antwoord({ challenge, metGad: false }), { ...verwacht, soort: 'create' })).toBe(true);
    // een browser die authenticatorAttachment niet meldt
    expect(await controleerBevestiging(await antwoord({ challenge, bijlage: undefined }), { ...verwacht, soort: 'create' })).toBe(true);
  });

  it('weigert zonder de vlag UV (het toestel verifieerde de gebruiker niet) of zonder UP, ook als create slaagde', async () => {
    expect(await controleerBevestiging(await antwoord({ challenge, vlaggen: 0x41 }), { ...verwacht, soort: 'create' })).toBe(false);
    expect(await controleerBevestiging(await antwoord({ challenge, vlaggen: 0x44 }), { ...verwacht, soort: 'create' })).toBe(false);
    expect(await controleerBevestiging(await antwoord({ challenge, vlaggen: 0x41, metGad: false }), { ...verwacht, soort: 'create' })).toBe(false);
    expect(await controleerBevestiging(await antwoord({ soort: 'get', challenge, vlaggen: 0x01 }), { ...verwacht, soort: 'get' })).toBe(false);
  });

  it('weigert een antwoord dat niet bij deze vraag, deze site of dit toestel hoort', async () => {
    const ander = Uint8Array.from({ length: 32 }, () => 1);
    const nee = async (opties, extra = {}) => expect(await controleerBevestiging(await antwoord({ challenge, ...opties }), { ...verwacht, soort: 'create', ...extra })).toBe(false);
    await nee({ client: { challenge: b64url(ander) } }); // een oud of ander antwoord
    await nee({ client: { origin: 'https://elders.example' } });
    await nee({ client: { crossOrigin: true } });
    await nee({ client: { type: 'webauthn.get' } });
    await nee({ rp: 'elders.example' }); // de authenticatordata van een andere site
    await nee({ bijlage: 'cross-platform' }); // een beveiligingssleutel of een ander toestel
    await nee({ vlaggen: 0x05 }); // geen nieuwe sleutel in de data
    await nee({ ander: Uint8Array.of(1, 1, 1, 1) }); // een ander id in de data dan in rawId
    expect(await controleerBevestiging(null, { ...verwacht, soort: 'create' })).toBe(false);
    expect(await controleerBevestiging({ id: 'ok' }, { ...verwacht, soort: 'create' })).toBe(false); // zoals de oude nabootsing
    expect(await controleerBevestiging({ type: 'public-key', rawId: new ArrayBuffer(4), response: { clientDataJSON: tekst('{').buffer } }, { ...verwacht, soort: 'create' })).toBe(false);
  });

  it('bij Face ID (get): de passkey van het slot, met UV; een andere sleutel telt niet', async () => {
    const id = Uint8Array.of(1, 2, 3, 4);
    expect(await controleerBevestiging(await antwoord({ soort: 'get', challenge, vlaggen: 0x05, id }), { ...verwacht, soort: 'get', credentialId: b64url(id) })).toBe(true);
    expect(await controleerBevestiging(await antwoord({ soort: 'get', challenge, vlaggen: 0x05, id: Uint8Array.of(5) }), { ...verwacht, soort: 'get', credentialId: b64url(id) })).toBe(false);
    expect(await controleerBevestiging(await antwoord({ soort: 'get', challenge, vlaggen: 0x05, id }), { ...verwacht, soort: 'create' })).toBe(false);
  });

  it('de CBOR-lezer haalt authData eruit en faalt dicht bij rommel', async () => {
    const data = await authData({ vlaggen: 0x45, id: Uint8Array.of(1) });
    expect([...authDataUitAttestatie(attestatie(data))]).toEqual([...data]);
    for (const rommel of [new Uint8Array(0), Uint8Array.of(0xa3), Uint8Array.of(0xbf, 0xff), Uint8Array.of(0x80), attestatie(data).subarray(0, 30), Uint8Array.of(0xa1, 0x68, ...tekst('authData'), 0x5b, 0, 0, 0, 0, 0, 0, 0, 9)]) {
      expect(authDataUitAttestatie(rommel)).toBeNull();
    }
    expect(authDataUitAttestatie('geen bytes')).toBeNull();
  });
});

describe('bevestigMetToestel in een nagebootste browser (BESLISSING 541)', async () => {
  const passkey = await import('../../src/vergrendeling/passkey.js');
  let gevraagd;
  let vergeten;
  let gedrag;
  beforeEach(() => {
    gevraagd = [];
    vergeten = [];
    gedrag = 'ok';
    globalThis.location = new URL(OORSPRONG);
    globalThis.window = globalThis;
    globalThis.PublicKeyCredential = { signalUnknownCredential: async ({ credentialId }) => vergeten.push(credentialId) };
    Object.defineProperty(globalThis.navigator, 'credentials', {
      configurable: true,
      value: {
        create: async (o) => {
          gevraagd.push(['create', o.publicKey]);
          if (gedrag === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
          return antwoord({ challenge: new Uint8Array(o.publicKey.challenge), vlaggen: gedrag === 'zonderUV' ? 0x41 : 0x45 });
        },
        get: async (o) => {
          gevraagd.push(['get', o.publicKey]);
          if (gedrag === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
          return antwoord({ soort: 'get', challenge: new Uint8Array(o.publicKey.challenge), vlaggen: gedrag === 'zonderUV' ? 0x01 : 0x05, id: new Uint8Array(o.publicKey.allowCredentials[0].id) });
        },
      },
    });
  });

  it('zonder passkey: een sleutel voor één keer op de platformauthenticator met UV verplicht, zonder naam, en meteen vergeten', async () => {
    expect(await passkey.bevestigMetToestel()).toBe(true);
    expect(gevraagd).toHaveLength(1);
    const [soort, o] = gevraagd[0];
    expect(soort).toBe('create');
    expect(o.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' });
    expect(o.attestation).toBe('none');
    expect(o.user.name).toBe('Bloei herstel');
    expect(o.challenge).toHaveLength(32);
    expect(vergeten).toEqual([b64url(Uint8Array.of(9, 8, 7, 6))]);
  });

  it('zonder de vlag UV: geweigerd, en de gemaakte sleutel wordt toch vergeten; geannuleerd: geweigerd, niets te vergeten', async () => {
    gedrag = 'zonderUV';
    expect(await passkey.bevestigMetToestel()).toBe(false);
    expect(vergeten).toHaveLength(1);
    gedrag = 'annuleer';
    expect(await passkey.bevestigMetToestel()).toBe(false);
    expect(vergeten).toHaveLength(1);
  });

  it('met de passkey van Face ID: get op die sleutel, met UV verplicht; niets nieuws gemaakt of vergeten', async () => {
    const id = b64url(Uint8Array.of(1, 2, 3, 4));
    expect(await passkey.bevestigMetToestel({ passkeyId: id })).toBe(true);
    expect(gevraagd.map(([s]) => s)).toEqual(['get']);
    expect(gevraagd[0][1].userVerification).toBe('required');
    expect(vergeten).toEqual([]);
    gedrag = 'zonderUV';
    expect(await passkey.bevestigMetToestel({ passkeyId: id })).toBe(false);
  });

  it('twee keer tegelijk: de tweede vraag wacht niet en geldt niet', async () => {
    const [een, twee] = await Promise.all([passkey.bevestigMetToestel(), passkey.bevestigMetToestel()]);
    expect([een, twee]).toEqual([true, false]);
    expect(gevraagd).toHaveLength(1);
  });

  it('een browser zonder WebAuthn: geweigerd zonder fout', async () => {
    delete globalThis.PublicKeyCredential;
    expect(await passkey.bevestigMetToestel()).toBe(false);
  });
});
