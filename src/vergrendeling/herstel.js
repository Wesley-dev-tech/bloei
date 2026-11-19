// Een vergeten pincode herstellen (BESLISSING 518, vervangt 224): zonder herstelvraag, zonder server, zonder account. Twee wegen:
//  1. bevestigen met het toestel (WebAuthn, platformauthenticator, userVerification 'required'), altijd als het toestel het kan, zonder vooraf
//     te koppelen (BESLISSING 541, passkey.js: bevestigMetToestel);
//  2. een herstelcode van twaalf tekens die Bloei één keer toont.
// Daarna kiest de gebruiker een nieuwe pincode; het dagboek blijft staan. Het slot blijft een schermslot: de gegevens zelf zijn niet versleuteld.
//
// Wat waar staat (IndexedDB, tabel 'instellingen', zoals de pincode; niets in localStorage of sessionStorage):
//   slot.herstel        { zout, hash, rondes, gemaakt, bevestigd } of null. PBKDF2-SHA-256 (pin.js, RONDES), eigen zout, van de genormaliseerde code
//                       (twaalf hoofdletters en cijfers, zonder streepjes). gemaakt: tijdstip in ms. bevestigd: de gebruiker vinkte "Ik heb ze bewaard" aan.
//   slot.herstelId      VERVALLEN (BESLISSING 541). Was het id van een gekoppelde sleutel om te herstellen. Een oude rij wordt bij de eerstvolgende
//                       start opgeruimd (ruimHerstelIdOp): de sleutel gemeld als onbekend, de rij uit de opslag.
//   slot.herstelFouten, slot.herstelWachtTot
//                       een eigen rem voor foute herstelcodes, met dezelfde oplopende wachttijd als de pincode (pin.js). Foute pogingen wissen nooit iets.
//   slot.herstelAanbod  true zodra een bestaande gebruiker zonder herstelcode het aanbod één keer zag.
// Dit bestand raakt de DOM niet (ook te testen zonder browser).
import { db } from '../data/db.js';
import { zend } from '../kern/bus.js';
import { bepaalMethode, controleer, maakHash } from './pin.js';
import { vergeetPasskey } from './passkey.js';
import { DEMO } from '../kern/demo.js';

// Geen 0 en O, geen 1, I en L: 23 letters en 8 cijfers, 31 tekens. Twaalf tekens geven 12 x log2(31) = 59,4 bits.
export const ALFABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LENGTE = 12;
export const GROEP = 4;

// Alle sleutels van de vergrendeling, voor uitzetten en voor het opruimen van een half slot (welkom.js).
export const SLOT_SLEUTELS = [
  'slot.aan',
  'slot.pin',
  'slot.passkeyId',
  'slot.methode',
  'slot.fouten',
  'slot.wachtTot',
  'slot.vraag',
  'slot.antwoord',
  'slot.herstel',
  'slot.herstelFouten',
  'slot.herstelWachtTot',
  'slot.herstelAanbod',
];
const UIT = { 'slot.aan': false, 'slot.fouten': 0, 'slot.wachtTot': 0, 'slot.herstelFouten': 0, 'slot.herstelWachtTot': 0 };

// Een nieuwe herstelcode, in drie groepen van vier ("K7M2-9QXA-4RTP"). Toevallig met crypto.getRandomValues; zonder voorkeur voor een teken
// (bytes vanaf 248 = 8 x 31 worden overgeslagen). willekeur(n) geeft n bytes (voor de tests).
export function maakHerstelcode(willekeur = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const grens = Math.floor(256 / ALFABET.length) * ALFABET.length;
  let tekens = '';
  while (tekens.length < LENGTE) {
    for (const b of willekeur(LENGTE * 2)) {
      if (b >= grens) continue;
      tekens += ALFABET[b % ALFABET.length];
      if (tekens.length === LENGTE) break;
    }
  }
  return groepeer(tekens);
}

export function groepeer(tekens) {
  const delen = [];
  for (let i = 0; i < tekens.length; i += GROEP) delen.push(tekens.slice(i, i + GROEP));
  return delen.join('-');
}

// Wat ze intikt: hoofdletters of kleine letters, met of zonder spaties en streepjes (ook een ander koppelteken), allemaal goed.
export function normaliseer(invoer) {
  return String(invoer ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-\u2010\u2011\u2012\u2013\u2014\u2212_.]/g, '');
}

export function isGeldigeVorm(genormaliseerd) {
  return genormaliseerd.length === LENGTE && [...genormaliseerd].every((c) => ALFABET.includes(c));
}

// Voor een schermlezer: teken per teken, met een korte pauze tussen de groepen ("K 7 M 2, 9 Q X A, 4 R T P").
export function voorleesbaar(code) {
  return normaliseer(code)
    .match(/.{1,4}/g)
    .map((groep) => [...groep].join(' '))
    .join(', ');
}

// De bewaarde vorm: nooit de code zelf, alleen PBKDF2 met een eigen zout (zelfde sterkte als de pincode).
export async function maakHerstel(code, { nu = Date.now(), bevestigd = false } = {}) {
  const n = normaliseer(code);
  if (!isGeldigeVorm(n)) throw new Error('ongeldige herstelcode');
  return { ...(await maakHash(n)), gemaakt: nu, bevestigd };
}

// true als de ingetikte code past bij de bewaarde (vergelijking in constante tijd, pin.js). Een code in een verkeerde vorm past nooit.
export async function controleerHerstel(invoer, bewaard) {
  const n = normaliseer(invoer);
  if (!isGeldigeVorm(n) || !bewaard) return false;
  return controleer(n, bewaard);
}

// De inhoud van het bestandje bloei-herstelcode.txt: de code en wat ze doet, geen naam en geen andere gegevens.
export function bestandTekst(code, regels) {
  return [regels.kop, '', code, '', regels.uitleg, regels.wie, ''].join('\n');
}
export const BESTANDSNAAM = 'bloei-herstelcode.txt';

// ---- opslag ----

// Schrijft meerdere instellingen in één transactie: alles of niets. Daarna gaat voor elke sleutel 'instelling:gewijzigd' uit (zoals zetInstelling).
export async function bewaarSamen(paren) {
  const lijst = Object.entries(paren);
  await db.transaction('rw', db.instellingen, async () => {
    for (const [sleutel, waarde] of lijst) await db.instellingen.put({ sleutel, waarde });
  });
  for (const [sleutel, waarde] of lijst) zend('instelling:gewijzigd', { sleutel, waarde });
}

async function lees(sleutel) {
  return (await db.instellingen.get(sleutel))?.waarde ?? null;
}

// De bestaande sleutel van het toestel: bij de methode Face ID de passkey van het slot, anders null (BESLISSING 541: geen herstelsleutel meer;
// zonder sleutel bevestigt het toestel met een sleutel voor één keer, passkey.js).
export async function toestelSleutel() {
  const [methode, passkeyId] = await Promise.all([lees('slot.methode'), lees('slot.passkeyId')]);
  return bepaalMethode(methode, passkeyId) === 'faceid' ? passkeyId || null : null;
}

// BESLISSING 643: na een herstel via de terugval (638) kan de passkey van het slot verdwenen zijn; Face ID zou dan op het slotscherm elke keer
// mislukken. De nieuwe code en de methode Pincode (zonder verwijzing naar de passkey) worden SAMEN bewaard, in één transactie (bewaarSamen):
// alles of niets. Pas daarna laat Bloei de browser weten dat de oude passkey niet meer gebruikt wordt (de Signal API, waar dat kan, hoogstens even
// wachten), zoals het scherm Vergrendeling dat doet bij de overstap van Face ID naar Pincode (scherm.js, kiesMethode). Mislukt de transactie, dan
// is er niets gewijzigd en niets gemeld. Geeft de oude passkey terug (of null).
export async function bewaarMetPincode(paren, { vergeet = vergeetPasskey } = {}) {
  // De oude passkey lezen in dezelfde transactie als het bewaren: een ander tabblad dat intussen Face ID koppelt of wijzigt, kan er zo niet tussen
  // komen (dan zou een andere sleutel gemeld worden dan die welke hier verdwijnt).
  const nieuw = { ...paren, 'slot.passkeyId': null, 'slot.methode': 'pin' };
  const lijst = Object.entries(nieuw);
  const oudId = await db.transaction('rw', db.instellingen, async () => {
    const oud = await lees('slot.passkeyId');
    for (const [sleutel, waarde] of lijst) await db.instellingen.put({ sleutel, waarde });
    return oud;
  });
  for (const [sleutel, waarde] of lijst) zend('instelling:gewijzigd', { sleutel, waarde });
  if (oudId) {
    try {
      await Promise.race([vergeet(oudId), new Promise((klaar) => setTimeout(klaar, 2000))]);
    } catch {
      /* de overstap is al bewaard; het melden mag niets tegenhouden */
    }
  }
  return oudId;
}

// BESLISSING 541: een herstelsleutel uit de tijd van "Je toestel als hulp" (slot.herstelId) opruimen: de browser laten weten dat de sleutel niet
// meer bestaat (waar dat kan, hoogstens even wachten) en de rij uit de opslag halen. Raakt de passkey van Face ID nooit. Geeft true als er een rij was.
// In de demo (BESLISSING 364) doet dit niets: daar is geen slot en schrijft de herstelstroom niets.
export async function ruimHerstelIdOp({ vergeet = vergeetPasskey, demo = DEMO } = {}) {
  if (demo) return false;
  const rij = await db.instellingen.get('slot.herstelId');
  if (!rij) return false;
  const id = rij.waarde;
  if (id && id !== (await lees('slot.passkeyId'))) {
    try {
      await Promise.race([vergeet(id), new Promise((klaar) => setTimeout(klaar, 2000))]);
    } catch {
      /* het opruimen gaat altijd door */
    }
  }
  await db.instellingen.delete('slot.herstelId');
  return true;
}

export async function leesHerstel() {
  const h = await lees('slot.herstel');
  return h && typeof h.hash === 'string' && typeof h.zout === 'string' ? h : null;
}

// Heeft ze een herstelcode die ze bevestigde te hebben bewaard? (Een niet-bevestigde code werkt wel, maar telt als open punt.)
export async function heeftBevestigdeHerstelcode() {
  return Boolean((await leesHerstel())?.bevestigd);
}

// Het slot uit: elke sleutel van de vergrendeling, ook de herstelcode (en een oude rij slot.herstelId), in één transactie.
export async function wisSlotgegevens() {
  const paren = Object.fromEntries(SLOT_SLEUTELS.map((s) => [s, s in UIT ? UIT[s] : null]));
  await db.transaction('rw', db.instellingen, async () => {
    for (const [sleutel, waarde] of Object.entries(paren)) await db.instellingen.put({ sleutel, waarde });
    await db.instellingen.delete('slot.herstelId');
  });
  for (const [sleutel, waarde] of Object.entries(paren)) zend('instelling:gewijzigd', { sleutel, waarde });
}
