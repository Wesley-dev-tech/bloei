// Pincode: nooit leesbaar bewaard. Dit is de enige plek waar een code
// verwerkt wordt (zo kan er later versleuteling bij komen zonder dat de pincode elders rondzwerft).
// Bewaard wordt { zout, hash, rondes } (alles base64): PBKDF2-SHA-256 met een eigen zout per code.
// Contract: PLAN.md §6.5, met twee afwijkingen (door de architect goedgekeurd): een 'rondes'-veld en een oplopende wachttijd.
// Rondes: wat de OWASP Password Storage Cheat Sheet aanbeveelt voor PBKDF2-HMAC-SHA256 (nagekeken 16 november 2026: 600 000).
// Een code die met minder rondes bewaard is (100 000 of 210 000), wordt met haar eigen aantal gecontroleerd en na de eerstvolgende
// juiste invoer stil omgezet (zetOmIndienVerouderd, OW-02).

export const RONDES = 600000;
const ZOUT_BYTES = 16;
const HASH_BITS = 256;
// Bewaarde waarden zonder 'rondes' komen uit het eerste ontwerp (100 000 rondes).
const OUDE_RONDES = 100000;

// ---- base64 ----
function naarBase64(bytes) {
  let tekst = '';
  for (const b of new Uint8Array(bytes)) tekst += String.fromCharCode(b);
  return btoa(tekst);
}
function vanBase64(tekst) {
  const bin = atob(tekst);
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

async function leid(geheim, zout, rondes) {
  const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(geheim)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: zout, iterations: rondes }, sleutel, HASH_BITS));
}

// Vergelijking die niet eerder stopt bij het eerste verschil.
export function gelijkInConstanteTijd(a, b) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a[i] ^ b[i];
  return verschil === 0;
}

export async function maakHash(geheim, rondes = RONDES) {
  const zout = crypto.getRandomValues(new Uint8Array(ZOUT_BYTES));
  const hash = await leid(geheim, zout, rondes);
  return { zout: naarBase64(zout), hash: naarBase64(hash), rondes };
}

export async function controleer(geheim, bewaard) {
  try {
    if (!bewaard || typeof bewaard.zout !== 'string' || typeof bewaard.hash !== 'string') return false;
    const rondes = Number.isInteger(bewaard.rondes) && bewaard.rondes > 0 ? bewaard.rondes : OUDE_RONDES;
    const verwacht = vanBase64(bewaard.hash);
    const nu = await leid(geheim, vanBase64(bewaard.zout), rondes);
    return gelijkInConstanteTijd(nu, verwacht);
  } catch {
    return false;
  }
}

// Een bewaarde waarde met minder rondes dan nu gebruikelijk mag bij de volgende juiste invoer vernieuwd worden.
export function isVerouderd(bewaard) {
  return !bewaard || !Number.isInteger(bewaard.rondes) || bewaard.rondes < RONDES;
}

// Zet een verouderde code (minder rondes) stil om naar RONDES, alleen na een JUISTE invoer van `code`. De lengte blijft die van de
// ingetikte code (een oude code van vier cijfers blijft vier stippen). Nooit iemand buitensluiten:
//  - lukt het niet (opslag, crypto), dan blijft de oude waarde staan en werkt ze gewoon verder; deze functie gooit nooit;
//  - is de bewaarde code intussen gewijzigd (bv. meteen na het openen een nieuwe code ingesteld), dan wordt niets overschreven.
// lees() geeft de huidige bewaarde waarde, bewaar(w) schrijft de nieuwe. Geeft true als er omgezet is.
export async function zetOmIndienVerouderd(code, bewaard, { lees, bewaar }) {
  try {
    if (!bewaard || !isVerouderd(bewaard)) return false;
    const nieuw = await maakPin(code);
    const nu = await lees();
    if (!nu || nu.hash !== bewaard.hash || nu.zout !== bewaard.zout) return false;
    await bewaar(nieuw);
    return true;
  } catch {
    return false;
  }
}

// ---- Wachttijd na foute pogingen (nooit iets wissen) ----
export const GRATIS_POGINGEN = 5;
// Na vijf fouten 30 s; elke volgende fout loopt de tijd op: 1, 5 en daarna steeds 15 minuten.
const WACHT_MS = [30000, 60000, 300000, 900000];
export const MAX_WACHT_MS = WACHT_MS[WACHT_MS.length - 1];

export function wachttijdMs(fouten) {
  if (!(fouten >= GRATIS_POGINGEN)) return 0;
  return WACHT_MS[Math.min(fouten - GRATIS_POGINGEN, WACHT_MS.length - 1)];
}

// Nieuwe stand na een foute poging: { fouten, wachtTot } (wachtTot is een tijdstip in ms).
export function naFout(stand, nu) {
  const fouten = (stand?.fouten || 0) + 1;
  return { fouten, wachtTot: wachttijdMs(fouten) ? nu + wachttijdMs(fouten) : 0 };
}

// Hoeveel ms moet er nog gewacht worden? Een tijdstip dat verder weg ligt dan de langste wachttijd (de klok
// is teruggezet) telt als de langste wachttijd.
export function resterendeWacht(wachtTot, nu) {
  if (!(wachtTot > nu)) return 0;
  return Math.min(wachtTot - nu, MAX_WACHT_MS);
}

// ---- Lengte van de pincode ----
// Een nieuwe code heeft zes cijfers. De lengte wordt mee bewaard ({ zout, hash, rondes, lengte }); een code die
// met vier cijfers is ingesteld (zonder 'lengte') blijft werken met vier stippen tot ze gewijzigd wordt.
export const PIN_LENGTE = 6;
export const OUDE_PIN_LENGTE = 4;

export function lengteVan(bewaard) {
  return Number.isInteger(bewaard?.lengte) && bewaard.lengte > 0 ? bewaard.lengte : OUDE_PIN_LENGTE;
}

// Hasht een pincode en bewaart haar lengte mee.
export async function maakPin(code) {
  return { ...(await maakHash(code)), lengte: String(code).length };
}

// De manier waarop Bloei opent (BESLISSING 194): precies één van de twee. 'pin' = alleen de code; 'faceid' = Face ID met de code als terugval.
// Een bewaarde keuze telt, maar Face ID zonder passkey kan niet (dan Pincode). Een oude stand zonder het veld: code + passkey is Face ID, alleen code is Pincode.
export const METHODEN = ['pin', 'faceid'];
export function bepaalMethode(methode, passkeyId) {
  if (methode === 'faceid') return passkeyId ? 'faceid' : 'pin';
  if (methode === 'pin') return 'pin';
  return passkeyId ? 'faceid' : 'pin';
}
