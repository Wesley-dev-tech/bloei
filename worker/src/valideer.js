// Controle van alles wat binnenkomt. Alleen de toegelaten velden gaan door; al het andere wordt weggelaten.
export const MAX_BODY = 4096;
// Elke minuut van 00:00 tot 23:59 (BESLISSING 713; tot 18 november alleen kwartieren, en die blijven geldig: een oude app werkt
// zonder wijziging verder).
const UUR = /^([01]\d|2[0-3]):[0-5]\d$/;
const BASE64URL = /^[A-Za-z0-9_-]{16,512}$/;

// Alleen bekende pushdiensten (https, geen poort, geen inlog): zo kan de Worker niet worden gebruikt om willekeurige adressen aan te roepen.
export function isToegelatenEndpoint(waarde) {
  if (typeof waarde !== 'string' || waarde.length > 1024) return false;
  let url;
  try {
    url = new URL(waarde);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const h = url.hostname.toLowerCase();
  return (
    h === 'fcm.googleapis.com' ||
    h.endsWith('.push.apple.com') ||
    h.endsWith('.push.services.mozilla.com') ||
    h.endsWith('.notify.windows.com')
  );
}

// Welke pushdienst achter een (toegelaten) endpoint zit: 'fcm', 'apple', 'mozilla' of 'windows', anders null. Eén naam per dienst,
// niet per host: Microsoft en Apple hebben meerdere hosts achter dezelfde controle van de VAPID-handtekening.
export function dienstVan(waarde) {
  if (!isToegelatenEndpoint(waarde)) return null;
  const h = new URL(waarde).hostname.toLowerCase();
  if (h === 'fcm.googleapis.com') return 'fcm';
  if (h.endsWith('.push.apple.com')) return 'apple';
  if (h.endsWith('.push.services.mozilla.com')) return 'mozilla';
  return 'windows';
}

// De vaste vorm van een endpoint: host in kleine letters (dat doet URL zelf) en zonder fragment, dat nooit naar de pushdienst gaat.
// Zo geven varianten van hetzelfde adres (WEB.push.apple.com, of met #x erachter) dezelfde sleutel. De query blijft staan: het
// adres van Windows (WNS) draagt zijn token in de query (?token=). Geeft null voor een adres dat geen URL is.
export function normaalEndpoint(waarde) {
  try {
    const url = new URL(waarde);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

// Vergelijkt twee geheimen (het auth-geheim van een abonnement) zonder eerder te stoppen bij het eerste verschil.
// Een ontbrekende of ongeldige waarde is nooit gelijk.
export function gelijkGeheim(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !BASE64URL.test(a) || !BASE64URL.test(b)) return false;
  let verschil = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) verschil |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return verschil === 0;
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Het lijstje uren: elke dag dezelfde, zonder soort. Hoogstens MAX_UREN, elk 'UU:MM' per minuut; dubbels worden samengevoegd.
// 12 blijft: het scherm Herinneringen stuurt er hoogstens 8 (dagboek 1, drinken 4, supplementen 3: LIMIETEN in
// src/meldingen/push.js), en de app knipt zelf ook af op 12 (MAX_UREN daar). Zo is er ruimte voor een extra soort zonder dat een
// nieuwere app 400 krijgt, en blijft de rekensom per dag (hoogstens 12 signalen per abonnement) dezelfde.
export const MAX_UREN = 12;
function uren(x) {
  if (!Array.isArray(x) || x.length < 1 || x.length > MAX_UREN) return null;
  if (!x.every((u) => typeof u === 'string' && UUR.test(u))) return null;
  return [...new Set(x)].sort();
}

// Geeft { abonnement, uren } met alleen de toegelaten velden, of null. Niets anders wordt bewaard.
export function schoonAbonnement(invoer) {
  if (!isObject(invoer) || !isObject(invoer.abonnement)) return null;
  const { endpoint, keys } = invoer.abonnement;
  // Ook de vaste vorm moet door de controle: URL zet tekens om naar %XX, waardoor een adres van 436 tekens als 2436 tekens bewaard
  // zou worden. Het signaal slaat zo'n adres over (isToegelatenEndpoint), en dan bleef het een plaats bezetten.
  const vast = normaalEndpoint(endpoint);
  if (!isToegelatenEndpoint(endpoint) || !isToegelatenEndpoint(vast)) return null;
  if (!isObject(keys) || !BASE64URL.test(keys.p256dh ?? '') || !BASE64URL.test(keys.auth ?? '')) return null;
  const lijst = uren(invoer.uren);
  if (!lijst) return null;
  return { abonnement: { endpoint: vast, keys: { p256dh: keys.p256dh, auth: keys.auth } }, uren: lijst };
}
