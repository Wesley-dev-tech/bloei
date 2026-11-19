import { NAZORG_TOESTEL_MS, metVrijstelling } from './vrijstelling.js';
import { isAndroid } from '../kern/toestel.js';
import { t, TEKSTEN } from '../teksten.js';

// Face ID via een passkey (WebAuthn, platformauthenticator). Er is geen server. Elk antwoord van het toestel dat iets opent of toelaat (het slot
// openen, de bevestiging van de huidige code bij wijzigen, uitzetten en een nieuwe herstelcode, Face ID instellen en het herstel na een vergeten
// code) gaat door dezelfde controle in de pagina: controleerBevestiging, via vraagToestel hieronder. Er is geen tweede, zwakkere weg.
// Wat die controle bewijst en wat niet: zie de uitleg bij controleerBevestiging (besluit 57: de app zegt dat eerlijk). Contract: PLAN.md §6.5.

function naarBase64url(bytes) {
  let tekst = '';
  for (const b of new Uint8Array(bytes)) tekst += String.fromCharCode(b);
  return btoa(tekst).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function vanBase64url(tekst) {
  const b64 = tekst.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (tekst.length % 4)) % 4);
  const bin = atob(b64);
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

export async function passkeyMogelijk() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// De opties van een nieuwe sleutel op de platformauthenticator, met UV verplicht. naam: hoe de sleutel in de wachtwoordbeheerder heet.
const nieuweSleutel = ({ naam, residentKey }) => ({
  rp: { name: 'Bloei' },
  user: { id: crypto.getRandomValues(new Uint8Array(16)), name: naam, displayName: naam },
  pubKeyCredParams: [
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 },
  ],
  authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey, ...(residentKey === 'discouraged' ? { requireResidentKey: false } : {}) },
  timeout: 60000,
  attestation: 'none',
});
const bestaandeSleutel = (id) => ({ allowCredentials: [{ type: 'public-key', id: vanBase64url(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 });

// De enige plek die het toestel iets vraagt. soort 'create' of 'get'; publicKey zonder challenge: die maakt deze functie, vers voor elke vraag.
// Het systeemvenster valt onder de vrijstelling (BESLISSING 530, vrijstelling.js), zodat het slot er niet van dichtgaat.
// Geeft { ok, id }: ok alleen als controleerBevestiging het antwoord goedkeurt; id het base64url-id van een met create gemaakte sleutel (ook als
// ok false is, zodat de oproeper hem kan vergeten). Annuleren, een time-out of een fout: { ok: false, id: null }. Nooit een uitzondering.
// fout: true als het toestel de vraag niet KON stellen (InvalidStateError, SecurityError, NotSupportedError, een onbekende fout, of een
// NotAllowedError die zo snel terugkomt dat er geen venster kan geweest zijn, alleen met snelWeigerenIsFout:
// c-slot.spec.js legt nu vast dat een meteen geweigerde tik stil blijft); false bij annuleren door de gebruiker of afbreken (stil).
// Er loopt hoogstens een vraag: een nieuwe breekt de lopende eerst af (een browser weigert een tweede vraag zolang de eerste loopt, en een
// automatische vraag zonder tik kan in de app op het beginscherm onzichtbaar blijven hangen). Het afbreken en de nieuwe vraag gebeuren in
// dezelfde taak als de tik, zonder await ervoor: iOS eist een verse handeling van de gebruiker.
// stopBijVerbergen: breek af zodra de pagina verborgen raakt. Er is geen eigen tijdsgrens: het venster van Face ID mag open blijven (ook voor
// de toegangscode van het toestel); de vraag zelf heeft timeout 60000.
let lopendeVraag = null;
const SNEL_GEWEIGERD_MS = 300;

function isEchteFout(fout, { afgebroken, snel }) {
  if (afgebroken || fout?.name === 'AbortError') return false;
  if (fout?.name === 'NotAllowedError') return snel;
  return true;
}

async function vraagToestel(soort, publicKey, { credentialId = null, stopBijVerbergen = false, snelWeigerenIsFout = false } = {}) {
  if (!window.PublicKeyCredential || !navigator.credentials) return { ok: false, id: null, fout: false };
  lopendeVraag?.abort();
  const regie = new AbortController();
  lopendeVraag = regie;
  const bijZicht = () => {
    if (document.visibilityState === 'hidden') regie.abort();
    // Een afgebroken vraag die nog niet terug is (iOS laat ze soms hangen) geldt niet meer als lopend: de volgende tik stelt een verse vraag.
    if (regie.signal.aborted && lopendeVraag === regie) lopendeVraag = null;
  };
  if (stopBijVerbergen) document.addEventListener('visibilitychange', bijZicht);
  const start = Date.now();
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const vraag = { publicKey: { ...publicKey, challenge }, signal: regie.signal };
    const credential = await metVrijstelling(() => (soort === 'create' ? navigator.credentials.create(vraag) : navigator.credentials.get(vraag)), { nazorgMs: NAZORG_TOESTEL_MS });
    if (regie.signal.aborted) return { ok: false, id: null, fout: false };
    const rawId = alsBytes(credential?.rawId);
    const id = soort === 'create' && rawId?.length ? naarBase64url(rawId) : null;
    const plek = globalThis.location;
    const ok = await controleerBevestiging(credential, { soort, challenge, rpId: plek.hostname, origin: plek.origin, credentialId });
    return { ok, id, fout: false };
  } catch (e) {
    return { ok: false, id: null, fout: isEchteFout(e, { afgebroken: regie.signal.aborted, snel: snelWeigerenIsFout && Date.now() - start < SNEL_GEWEIGERD_MS }) };
  } finally {
    if (stopBijVerbergen) document.removeEventListener('visibilitychange', bijZicht);
    if (lopendeVraag === regie) lopendeVraag = null;
  }
}

// Een sleutel vergeten zonder lang te wachten (hoogstens 2 s).
const vergeetKort = (id) => Promise.race([vergeetPasskey(id), new Promise((klaar) => setTimeout(klaar, 2000))]);

// Maakt de passkey van het slot aan op dit toestel (Face ID instellen). Geeft het credential-id (base64url), of null als ze annuleert, het mislukt
// of het antwoord niet door de controle komt. Een gemaakte sleutel die niet door de controle komt, wordt niet bewaard en meteen weer vergeten.
export async function maakPasskey(naam) {
  const { ok, id } = await vraagToestel('create', nieuweSleutel({ naam: naam || 'Bloei', residentKey: 'preferred' }));
  if (ok) return id;
  if (id) await vergeetKort(id);
  return null;
}

// Het slot openen en de huidige code bevestigen met de passkey van het slot (methode Face ID). true alleen als het antwoord door de controle komt
// (deze vraag, deze site, UV, dezelfde sleutel); false bij annuleren, een fout of een antwoord dat niet klopt. Zonder id: false, zonder vraag.
export async function vraagPasskey(id) {
  if (!id) return false;
  return (await vraagToestel('get', bestaandeSleutel(id), { credentialId: id })).ok;
}

// Het slotscherm: zoals vraagPasskey, maar geeft { ok, fout } (fout: zie vraagToestel). automatisch: de vraag bij het openen, zonder tik. Die krijgt
// geen eigen tijdsgrens en stopt als de pagina verborgen raakt, zodat ze niet onzichtbaar blijft hangen. Een tik op de knop breekt een lopende vraag af en vraagt opnieuw.
export async function openMetPasskey(id, { automatisch = false } = {}) {
  if (!id) return { ok: false, fout: false };
  const opties = automatisch ? { credentialId: id, stopBijVerbergen: true } : { credentialId: id };
  const { ok, fout } = await vraagToestel('get', bestaandeSleutel(id), opties);
  return { ok, fout };
}

// ---- BESLISSING 541: bevestigen met het toestel als ze haar code niet meer weet, zonder vooraf te koppelen ----
// Er bestaat geen sleutel om naar te vragen (get), dus vraagt Bloei het toestel op dat moment een NIEUWE sleutel te maken (create) met
// userVerification 'required' op de platformauthenticator: het toestel vraagt dan Face ID, een vingerafdruk of zijn schermslot. Lukt dat en
// staat in het antwoord de vlag "gebruiker geverifieerd" (UV), dan geldt dat als bevestiging. De sleutel dient nergens anders voor: Bloei
// bewaart hem niet en meldt hem meteen als onbekend (vergeetPasskey, de Signal API), zodat de wachtwoordbeheerder hem mag opruimen.
// Bij de methode Face ID bestaat de passkey van het slot al: dan vraagt Bloei die (get), zoals op het slotscherm, en maakt het niets nieuws.
// Wat dit bewijst: dat iemand het schermslot of de biometrie van dit toestel kon gebruiken. Niet meer: er is geen server, de controle gebeurt
// in de pagina zelf, en het dagboek is niet versleuteld. Elke mislukking (annuleren, time-out, geen sleutelhanger, geen UV-vlag, een antwoord
// dat niet bij deze vraag of deze site hoort) geeft false en wijzigt niets.
// De vlaggen in de authenticatordata: UP, de gebruiker was aanwezig; UV, het toestel heeft de gebruiker geverifieerd (biometrie of schermslot);
// AT, er zit een nieuwe sleutel in (alleen bij create).
const VLAG_UP = 0x01;
const VLAG_UV = 0x04;
const VLAG_AT = 0x40;

function alsBytes(waarde) {
  if (waarde instanceof ArrayBuffer) return new Uint8Array(waarde);
  if (ArrayBuffer.isView(waarde)) return new Uint8Array(waarde.buffer, waarde.byteOffset, waarde.byteLength);
  return null;
}

const gelijk = (a, b) => Boolean(a && b) && a.length === b.length && a.every((x, i) => x === b[i]);

// Het veld authData uit een attestationObject (CBOR, RFC 8949), voor een browser zonder getAuthenticatorData(). Leest alleen wat nodig is en
// faalt dicht: alles wat niet klopt of niet verwacht is (onbepaalde lengtes, te lange getallen, buiten de grenzen), geeft null.
export function authDataUitAttestatie(attestatie) {
  const b = alsBytes(attestatie);
  if (!b) return null;
  let i = 0;
  const lengte = (info) => {
    if (info < 24) return info;
    const n = { 24: 1, 25: 2, 26: 4 }[info];
    if (!n || i + n > b.length) return -1;
    let w = 0;
    for (let k = 0; k < n; k += 1) w = w * 256 + b[i++];
    return w;
  };
  // Leest één item; geeft { soort, waarde } (waarde alleen voor tekst en bytes) of null.
  const item = (diepte = 0) => {
    if (diepte > 8 || i >= b.length) return null;
    const kop = b[i++];
    const soort = kop >> 5;
    const n = lengte(kop & 31);
    if (n < 0) return null;
    if (soort === 0 || soort === 1) return { soort };
    if (soort === 2 || soort === 3) {
      if (i + n > b.length) return null;
      const stuk = b.subarray(i, i + n);
      i += n;
      return { soort, waarde: soort === 3 ? new TextDecoder().decode(stuk) : stuk };
    }
    if (soort === 4 || soort === 5) {
      for (let k = 0; k < n * (soort === 5 ? 2 : 1); k += 1) if (!item(diepte + 1)) return null;
      return { soort };
    }
    if (soort === 6) return item(diepte + 1) && { soort };
    if (soort === 7) return { soort };
    return null;
  };
  const kop = b[i++];
  if (kop === undefined || kop >> 5 !== 5) return null;
  const paren = lengte(kop & 31);
  if (paren < 0) return null;
  for (let k = 0; k < paren; k += 1) {
    const sleutel = item();
    const waarde = item();
    if (!sleutel || !waarde) return null;
    if (sleutel.soort === 3 && sleutel.waarde === 'authData') return waarde.soort === 2 ? waarde.waarde : null;
  }
  return null;
}

// Controleert het antwoord van het toestel in de pagina, zoals een server dat zou doen voor zover dat zonder server kan. soort 'create' of 'get'.
// Geeft true alleen als alles klopt: een sleutel van het type public-key, van de platformauthenticator (als de browser dat meldt), clientData voor
// deze vraag (type, dezelfde challenge, deze oorsprong, niet uit een ander venster), authenticatordata voor deze site (de hash van het rpId) met de
// vlaggen UP en UV, bij create de nieuwe sleutel zelf (AT, hetzelfde id) en bij get het id van de bewaarde passkey.
// Wat dit NIET is: een controle door een server. Alles gebeurt in de pagina zelf. Een handtekening wordt niet nagerekend: bij create is er geen
// (attestation 'none') en bij get bewaart Bloei de publieke sleutel niet. Dit houdt een fout, onvolledig of verkeerd gericht antwoord tegen
// (bv. zonder verificatie van de gebruiker), maar wie de pagina of de browser zelf kan nabootsen of aanpassen, omzeilt het. Het dagboek is niet
// versleuteld (zie het rapport bij BESLISSING 541).
export async function controleerBevestiging(credential, { soort, challenge, rpId, origin, credentialId = null, sha256 = (d) => crypto.subtle.digest('SHA-256', d) }) {
  try {
    if (!credential || credential.type !== 'public-key') return false;
    if (typeof credential.authenticatorAttachment === 'string' && credential.authenticatorAttachment !== 'platform') return false;
    const rawId = alsBytes(credential.rawId);
    const antwoord = credential.response;
    if (!rawId || !rawId.length || !antwoord) return false;
    const client = JSON.parse(new TextDecoder().decode(alsBytes(antwoord.clientDataJSON)));
    if (client?.type !== (soort === 'create' ? 'webauthn.create' : 'webauthn.get')) return false;
    if (client.challenge !== naarBase64url(challenge) || client.origin !== origin || client.crossOrigin === true) return false;
    let data;
    if (soort === 'create') {
      data = typeof antwoord.getAuthenticatorData === 'function' ? alsBytes(antwoord.getAuthenticatorData()) : authDataUitAttestatie(antwoord.attestationObject);
    } else data = alsBytes(antwoord.authenticatorData);
    if (!data || data.length < 37) return false;
    const rpHash = new Uint8Array(await sha256(new TextEncoder().encode(rpId)));
    if (!gelijk(data.subarray(0, 32), rpHash)) return false;
    const vlaggen = data[32];
    if (!(vlaggen & VLAG_UP) || !(vlaggen & VLAG_UV)) return false;
    if (soort === 'create') {
      // rpIdHash (32), vlaggen (1), teller (4), aaguid (16), lengte van het id (2), het id
      if (!(vlaggen & VLAG_AT) || data.length < 55) return false;
      const n = data[53] * 256 + data[54];
      if (!gelijk(data.subarray(55, 55 + n), rawId)) return false;
    } else if (credentialId && !gelijk(rawId, vanBase64url(credentialId))) return false;
    return true;
  } catch {
    return false;
  }
}

let bevestigtNu = false;

// true als het toestel bevestigde (met de UV-vlag); false bij annuleren, een time-out, een fout of een antwoord dat niet klopt. Nooit een uitzondering.
// passkeyId: de passkey van het slot bij de methode Face ID (dan get); zonder: een sleutel voor één keer (create), meteen weer vergeten.
export async function bevestigMetToestel({ passkeyId = null } = {}) {
  if (bevestigtNu) return false;
  bevestigtNu = true;
  try {
    // Bij Face ID precies dezelfde vraag en controle als op het slotscherm.
    if (passkeyId) return await vraagPasskey(passkeyId);
    // Geen naam van de gebruiker: als de sleutel toch even in de wachtwoordbeheerder staat, heet hij zo.
    const { ok, id } = await vraagToestel('create', nieuweSleutel({ naam: 'Bloei herstel', residentKey: 'discouraged' }));
    // De sleutel van één keer meteen vergeten, ook als de controle mislukte; hoogstens even wachten.
    if (id) await vergeetKort(id);
    return ok;
  } catch {
    return false;
  } finally {
    bevestigtNu = false;
  }
}

// Een web-app kan een passkey niet zelf wissen. Waar de browser het kan (WebAuthn Signal API), zegt Bloei na het wissen wel dat deze
// sleutel niet meer bestaat; de wachtwoordbeheerder van het toestel mag hem dan opruimen. Kan het niet, dan gebeurt er niets.
export async function vergeetPasskey(id) {
  try {
    const PKC = globalThis.PublicKeyCredential;
    if (!id || typeof PKC?.signalUnknownCredential !== 'function') return false;
    await PKC.signalUnknownCredential({ rpId: globalThis.location.hostname, credentialId: id });
    return true;
  } catch {
    return false;
  }
}

// De optie heet "Face ID" (BESLISSING 192), op iPhone, iPad en desktop, en er staat nergens een andere naam of hint (BESLISSING 193).
// Alleen op Android (BESLISSING 423, AN-04) heet ze "vingerafdruk of schermslot": daar bestaat Face ID niet.
export const FACE_ID = 'Face ID';
export const ANDROID_METHODE = 'vingerafdruk of schermslot';
const hoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// De naam van de methode. begin: als woord vooraan (een knop, een label); midden in een zin zonder hoofdletter. Face ID altijd zo.
export function methodeNaam({ begin = false, android = isAndroid() } = {}) {
  if (!android) return FACE_ID;
  return begin ? hoofdletter(ANDROID_METHODE) : ANDROID_METHODE;
}
// De naam als label of knop (de optie, "... gebruiken" in het voorbeeld). Buiten Android precies "Face ID", zoals altijd.
export const faceIdNaam = (opties = {}) => methodeNaam({ ...opties, begin: true });

// Een tekst met {naam}: buiten Android letterlijk t(sleutel, { naam: 'Face ID' }); op Android met de naam midden in de zin en een
// hoofdletter vooraan. Een tekst die de naam letterlijk noemt (slot.faceHint, slot.hoeFaceId) heeft op Android een variant <sleutel>Android.
export function methodeTekst(sleutel, { android = isAndroid() } = {}) {
  if (!android) return t(sleutel, { naam: FACE_ID });
  const variant = sleutel + 'Android';
  const bestaat = typeof variant.split('.').reduce((o, d) => (o == null ? o : o[d]), TEKSTEN) === 'string';
  return hoofdletter(t(bestaat ? variant : sleutel, { naam: ANDROID_METHODE }));
}
