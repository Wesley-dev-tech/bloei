// Het weerbericht op Vandaag: de plek van het toestel en het weer van daar (logica/weer.js, ui/weerkaart.js).
// Altijd aan, zonder schakelaar en zonder vraag van Bloei zelf. Het toestel vraagt wel één keer toestemming voor de locatie.
//
// Wat er het toestel verlaat: alleen een plaats, naar één dienst: Open-Meteo. Geen naam, geen dagboek, geen cookie. Daarnaast vraagt
// Bloei de waarschuwingen van het KMI op (data/kmi.js), voor heel België en zonder plek: welke voor de plek gelden, kiest het toestel.
//
// Het weer staat er altijd. Op de kaart komt nooit een zin dat het niet lukt, op geen enkel toestel:
// 1. De plek van nu. Bloei vraagt de fijne locatie en neemt nooit een plek van daarnet over (maximumAge 0). Een fijne meting
//    (logica/weer.js, FIJN_M) gaat meteen naar de weerdienst, precies zoals het toestel ze geeft. Geeft het toestel eerst een grovere,
//    dan luistert Bloei nog kort naar een fijnere en neemt dan de beste, hoe grof ook.
// 2. Geeft het toestel geen plek (de locatie staat uit, een computer zonder locatiedienst, de vraag van het toestel staat nog open),
//    dan rekent Bloei met de noodplek: de laatste plek die dit toestel gaf (afgerond op ongeveer een kilometer, alleen op het toestel
//    bewaard) en anders de hoofdstad van de tijdzone van het toestel. Is er na NOOD_MS nog niets in beeld, dan komt dat weer er al,
//    terwijl Bloei verder naar de plek luistert.
// 3. Antwoordt de weerdienst niet of is er geen netwerk, dan toont Bloei het weerbericht dat dit toestel het laatst kreeg: wat de
//    dienst toen voorspelde voor dit uur, voor vandaag en voor de zeven dagen erna (logica/weer.js, weerVoorNu). Dat weerbericht gaat
//    een week mee. Bloei probeert het intussen opnieuw: na 3, 6, 12 en 24 seconden en daarna elke minuut.
//    De kaart is dus alleen zonder weer zolang dit toestel nog nooit een antwoord van de weerdienst kreeg (of een week lang geen):
//    dan staat ze er met streepjes, zoals in de tel waarin het weer geladen wordt, tot het eerste antwoord er is.
// 4. Bij elke opening van de app en telkens ze terugkomt naar de app gebeurt dat opnieuw: de plek en het weer. De opening start hier
//    al voor het eerste scherm getekend is (main.js), als het toestel de locatie voor Bloei al toeliet. Bij de opening staat het
//    bewaarde weerbericht er meteen, tot het nieuwe er is.
//
// Wat het toestel bewaart (localStorage, sleutel 'bloei-weer'; nooit in de database, dus nooit in een reservekopie of een verslag): de
// laatste plek, afgerond, en het laatste weerbericht (vijftien dagen en de uren van een week). "Alles wissen" wist het mee.
//
// De stand gaat uit met 'weer:gewijzigd': { fase, weer?, tijd?, voorbeeld?, waarschuwing? }.
//   'laden'   er is nog geen weer (de kaart staat er met streepjes)
//   'klaar'   weer (logica/weer.js, leesAntwoord of weerVoorNu), tijd (ms: wanneer de dienst het gaf), en de waarschuwing van het
//             KMI voor die plek als er een is ({ soort, niveau }, data/kmi.js)
import { zend } from '../kern/bus.js';
import { DEMO, OPSLAG_VOORVOEGSEL } from '../kern/demo.js';
import { waarschuwingVoor } from './kmi.js';
import { vandaag } from '../kern/datum.js';
import { besteMeting, isBruikbaar, isFijn, leesAntwoord, plekVanTijdzone, rondePlek, voorbeeldWeer, weerAdres, weerBeeld, weerVoorNu } from '../logica/weer.js';

const LUISTER_MS = 10 * 1000; // zo lang wacht Bloei hoogstens op een eerste meting
const BETER_MS = 3 * 1000; // na een eerste, grovere meting: zo lang luistert Bloei nog naar een fijnere
const GEEN_DIENST_MS = 3 * 1000; // het toestel zegt dat er geen plek is en gaf er nog geen: zo lang wacht Bloei dan nog
const NOOD_MS = 1500; // staat er dan nog geen weer in beeld: het weer van de noodplek, terwijl Bloei verder luistert
const VERS_MS = 10 * 60 * 1000; // zolang de app in beeld blijft: om de tien minuten opnieuw
const OPNIEUW_MS = [3, 6, 12, 24, 60].map((s) => s * 1000); // na een mislukte poging: snel opnieuw, daarna elke minuut
const KIJK_MS = 30 * 1000; // zo vaak kijkt de app of het tijd is (geen netwerk, alleen de klok)
const TERUG_MS = 3 * 1000; // terugkomen geeft meer dan één seintje (zichtbaar, pageshow): samen één verversing
const OUD_MS = 60 * 60 * 1000; // weer in beeld dat niet ververst kon worden en ouder is: dan het bewaarde weerbericht voor dit uur
const SLEUTEL = OPSLAG_VOORVOEGSEL + 'weer';

let stand = { fase: 'laden' };
let gestart = false;
let beurt = 0; // het volgnummer van de verversing: een antwoord van een oudere beurt telt niet meer
let laatsteStart = 0;
let gelukt = false; // de laatste verversing gaf nieuw weer
let mislukt = 0; // zoveel pogingen na elkaar gaven geen nieuw weer
let opnieuwKlok = null;

export const weerStand = () => stand;

function zet(nieuw) {
  stand = nieuw;
  zend('weer:gewijzigd', stand);
}

// ---- Wat het toestel bewaart: { plek: [breedte, lengte] | null, weer, tijd } ----
function leesBewaard() {
  try {
    const b = JSON.parse(globalThis.localStorage?.getItem(SLEUTEL) ?? 'null');
    if (!b || typeof b !== 'object') return null;
    const plek = Array.isArray(b.plek) ? rondePlek(b.plek[0], b.plek[1]) : null;
    const weer = b.weer && typeof b.weer === 'object' && weerBeeld(b.weer) && Number.isFinite(b.weer.temp) && Number.isFinite(b.tijd) ? b.weer : null;
    return { plek, weer, tijd: weer ? b.tijd : null };
  } catch {
    return null;
  }
}
function bewaar(wijziging) {
  try {
    const oud = leesBewaard() ?? {};
    globalThis.localStorage?.setItem(SLEUTEL, JSON.stringify({ plek: oud.plek ?? null, weer: oud.weer ?? null, tijd: oud.tijd ?? null, ...wijziging }));
  } catch {
    /* geen opslag: het weerbericht werkt ook zonder */
  }
}
// Het bewaarde weerbericht voor dit uur: { fase: 'klaar', weer, tijd }, of null als er geen is dat nog een week vooruit reikt.
function bewaardVoorNu() {
  const b = leesBewaard();
  const weer = b?.weer ? weerVoorNu(b.weer, new Date()) : null;
  return weer && weerBeeld(weer) ? { fase: 'klaar', weer, tijd: b.tijd } : null;
}

// De noodplek: de laatste plek van dit toestel, en anders de hoofdstad van zijn tijdzone.
function noodplek() {
  const bewaard = leesBewaard()?.plek;
  if (bewaard) return bewaard;
  let tijdzone = null;
  try {
    tijdzone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* geen tijdzone: de standaardplek */
  }
  return plekVanTijdzone(tijdzone);
}

// De plek van het toestel, nu: { meting }, of { geen: true } als het toestel er geen geeft.
// vraagt: het toestel moet de gebruiker nog vragen of Bloei de locatie mag gebruiken (een PermissionStatus in de stand 'prompt'). Dan
// begint de wachttijd pas als ze geantwoord heeft: hoe lang ze over die vraag doet, telt niet mee.
function zoekPlek(vraagt = null) {
  return new Promise((klaar) => {
    const geo = navigator.geolocation;
    let beste = null;
    let gedaan = false;
    let wachter;
    let klok;
    let beterKlok;
    const sluit = (uit) => {
      if (gedaan) return;
      gedaan = true;
      clearTimeout(klok);
      clearTimeout(beterKlok);
      try {
        if (wachter != null) geo.clearWatch?.(wachter);
      } catch {
        /* niets te stoppen */
      }
      klaar(uit);
    };
    // De tijd is om: de beste meting telt, hoe grof ook (een grove plek geeft nog altijd het weer van de streek).
    const einde = () => sluit(beste ? { meting: beste } : { geen: true });
    const startKlok = () => {
      clearTimeout(klok);
      klok = setTimeout(einde, LUISTER_MS);
    };
    const opMeting = (meting) => {
      if (klok == null) startKlok(); // de eerste meting: ze heeft de locatie toegelaten
      beste = besteMeting(beste, meting);
      if (isFijn(meting)) return sluit({ meting });
      // Een grovere meting: een toestel begint vaak op zendmasten en geeft de fijne plek (gps, wifi) een tel later. Nog kort luisteren.
      if (beterKlok == null) beterKlok = setTimeout(einde, BETER_MS);
    };
    const volgt = typeof geo.watchPosition === 'function';
    const opFout = (fout) => {
      if (fout?.code === 1) return sluit({ geen: true }); // de locatie staat uit voor Bloei
      // Te laat (3), of een toestel zonder doorlopende metingen: wat er al kwam, telt.
      if (fout?.code === 3 || !volgt) return einde();
      // Even geen plek (2) terwijl Bloei luistert: dat gebeurt ook tussen een grove en een fijne meting in. Blijven luisteren tot de
      // klok. Kwam er nog helemaal niets, dan staat de locatiedienst wellicht uit: nog kort wachten, niet de hele wachttijd.
      if (!beste) {
        clearTimeout(klok);
        klok = setTimeout(einde, GEEN_DIENST_MS);
      }
    };
    const opties = { enableHighAccuracy: true, maximumAge: 0, timeout: LUISTER_MS };
    if (vraagt?.state === 'prompt' && typeof vraagt.addEventListener === 'function') {
      vraagt.addEventListener('change', () => !gedaan && vraagt.state === 'granted' && startKlok(), { once: true });
    } else startKlok();
    try {
      if (volgt) wachter = geo.watchPosition(opMeting, opFout, opties);
      else geo.getCurrentPosition(opMeting, opFout, opties);
    } catch {
      sluit({ geen: true });
    }
  });
}

// Eén vraag naar buiten, zonder iets over de gebruiker (geen cookie, geen herkomst, niets uit een tussenopslag).
async function haalWeer(breedte, lengte) {
  const vraag = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
  if (typeof AbortSignal?.timeout === 'function') vraag.signal = AbortSignal.timeout(8000);
  const antwoord = await fetch(weerAdres(breedte, lengte), vraag);
  if (!antwoord.ok) return null;
  return leesAntwoord(await antwoord.json());
}

// Hoe staat de locatie voor Bloei op dit toestel: een PermissionStatus (state 'granted', 'prompt' of 'denied'). Niet elke browser kent
// deze vraag: dan weten we het niet (null) en probeert Bloei het gewoon.
async function toestemming() {
  try {
    return (await navigator.permissions?.query?.({ name: 'geolocation' })) ?? null;
  } catch {
    return null;
  }
}

// Er kwam geen nieuw weer. Wat in beeld staat blijft staan zolang het vers is; anders komt het bewaarde weerbericht voor dit uur. Is
// er ook dat niet (dit toestel kreeg nog nooit weer), dan blijft de kaart met streepjes staan. Bloei probeert het snel opnieuw.
function valTerug() {
  gelukt = false;
  const vers = stand.fase === 'klaar' && Date.now() - stand.tijd < OUD_MS;
  if (!vers && !stand.voorbeeld) {
    const bewaard = bewaardVoorNu();
    if (bewaard) zet(bewaard);
    else if (stand.fase !== 'klaar' && stand.fase !== 'laden') zet({ fase: 'laden' });
  }
  clearTimeout(opnieuwKlok);
  opnieuwKlok = setTimeout(() => ververs(), OPNIEUW_MS[Math.min(mislukt, OPNIEUW_MS.length - 1)]);
  mislukt += 1;
}

// Verversen: de plek van nu, en daarmee het weer. Wat in beeld staat, blijft staan tot het nieuwe er is.
async function ververs() {
  const mijn = ++beurt;
  laatsteStart = Date.now();
  clearTimeout(opnieuwKlok);
  const geldt = () => mijn === beurt;
  if (stand.fase !== 'klaar') {
    // Nog niets in beeld (de app gaat open): het bewaarde weerbericht voor dit uur staat er meteen, tot het nieuwe er is.
    const bewaard = bewaardVoorNu();
    if (bewaard) zet(bewaard);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return void valTerug();

  let vanToestel = false; // het weer van een plek die het toestel nu gaf, staat in beeld
  // Het weer van één plek ophalen en tonen. nood: de plek is niet die van het toestel nu (de noodplek, of een heel grove meting).
  const toon = async (breedte, lengte, { nood, plek = undefined }) => {
    const weer = await haalWeer(breedte, lengte).catch(() => null);
    if (!geldt() || !weer || (nood && vanToestel)) return false;
    const tijd = Date.now();
    gelukt = true;
    mislukt = 0;
    zet({ fase: 'klaar', weer, tijd, waarschuwing: stand.waarschuwing ?? null });
    bewaar({ weer, tijd, ...(plek ? { plek } : {}) });
    // De waarschuwing van het KMI voor deze plek. Bij de noodplek alleen als het de laatste plek van dit toestel is (niet de hoofdstad
    // van de tijdzone: dat is niet haar plek). Ze komt los van het weer binnen; het weer wacht er nooit op.
    const waar = nood ? leesBewaard()?.plek : [breedte, lengte];
    waarschuwingVoor(...(waar ?? [NaN, NaN]))
      .catch(() => null)
      .then((waarschuwing) => {
        if (geldt() && stand.fase === 'klaar' && stand.tijd === tijd) zet({ ...stand, waarschuwing });
      });
    return true;
  };
  let nood = null; // één vraag voor de noodplek per verversing
  const toonNood = () => (nood ??= toon(...noodplek(), { nood: true }));
  // Weer van daarnet dat er al stond bij de opening (het bewaarde weerbericht) telt niet als "er staat al weer": de noodplek mag het vervangen.
  const alWeer = () => stand.fase === 'klaar' && Date.now() - stand.tijd < VERS_MS;

  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
  const mag = geo ? await toestemming() : null;
  if (!geldt()) return;
  // Geen locatie op dit toestel, of ze staat uit voor Bloei: meteen het weer van de noodplek. Bloei vraagt niets als het antwoord al nee is.
  if (!geo || mag?.state === 'denied') {
    if (!(await toonNood()) && geldt()) valTerug();
    return;
  }
  const noodKlok = setTimeout(() => geldt() && !vanToestel && !alWeer() && toonNood(), NOOD_MS);
  const plek = await zoekPlek(mag);
  clearTimeout(noodKlok);
  if (!geldt()) return;
  if (plek.meting) {
    const { latitude: breedte, longitude: lengte } = plek.meting.coords;
    const bruikbaar = isBruikbaar(plek.meting);
    vanToestel = bruikbaar; // een heel grove meting wint het niet van de noodplek die al in beeld staat
    if (await toon(breedte, lengte, { nood: !bruikbaar, plek: bruikbaar ? rondePlek(breedte, lengte) : undefined })) return;
    if (!geldt()) return;
    vanToestel = false;
  }
  // Geen plek van het toestel (of de weerdienst antwoordde niet voor die plek): het weer van de noodplek.
  if (!(await toonNood()) && geldt()) valTerug();
}

function houdLive() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  // Terug in beeld (de app opnieuw geopend vanuit de achtergrond): de plek en het weer van nu.
  const terug = () => {
    if (document.visibilityState !== 'visible' || Date.now() - laatsteStart < TERUG_MS) return;
    ververs();
  };
  document.addEventListener('visibilitychange', terug);
  window.addEventListener('pageshow', terug);
  window.addEventListener('online', () => ververs());
  // Zolang de app in beeld blijft: het weer bijhouden, en na een mislukte poging elke minuut opnieuw proberen.
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - laatsteStart > (gelukt ? VERS_MS : OPNIEUW_MS.at(-1))) ververs();
  }, KIJK_MS);
}

// Start het weerbericht. Twee keer aangeroepen: door main.js vóór het eerste scherm (vroeg: alleen als de locatie al toegelaten is,
// zodat het toestel niet om de locatie vraagt voor ze Bloei gezien heeft) en door Vandaag bij het tekenen. De tweede keer doet niets
// als de eerste al liep.
export async function startWeer({ vroeg = false } = {}) {
  if (gestart) return;
  if (DEMO) {
    // De demo verbindt met geen enkele dienst en vraagt geen locatie (BESLISSING 364): voorbeeldweer.
    gestart = true;
    stand = { fase: 'klaar', weer: voorbeeldWeer(vandaag()), voorbeeld: true, tijd: Date.now() };
    return;
  }
  if (vroeg && (await toestemming())?.state !== 'granted') return;
  if (gestart) return;
  gestart = true;
  houdLive();
  ververs();
}
