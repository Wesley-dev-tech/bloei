// Het weer op de plaats waar ze is, voor het weerbericht en de warme zin op Vandaag (logica/weer.js, logica/motivatie.js).
// Altijd aan, zonder schakelaar en zonder vraag van Bloei zelf. Het toestel vraagt wel één keer toestemming voor de locatie; zegt ze nee,
// dan komt er gewoon geen zin over het weer. Wat er het toestel verlaat: alleen de plaats, precies zoals het toestel ze geeft (niets
// wordt afgerond). Voor het weer naar Open-Meteo, voor de naam van de gemeente naar OpenStreetMap (Nominatim) en, als die niet antwoordt, naar BigDataCloud.
// Geen naam, geen dagboek, geen cookie.
// Bewaard wordt alleen het weer van daarnet met de naam van de gemeente (instelling 'weer.laatste'); de coördinaten zelf nooit.
//
// De plek moet de echte zijn. Een toestel geeft eerst vaak een ruwe plek (op zendmasten, kilometers ernaast: zo stond er in 0.5.3 een
// gemeente van tien kilometer verder). Bloei vraagt daarom de fijne locatie en neemt geen plek van daarnet over. Er wordt nergens op
// gewacht: de eerste meting gaat meteen naar buiten, en komt er daarna een fijnere, dan verbetert het bericht (ververs()). Blijft de
// meting ruw, dan staat dat bij de gemeente ("bij benadering").
//
// Vandaag wacht nooit op het netwerk: het krijgt het weer dat er al is (hoogstens drie uur oud) en op de achtergrond wordt het ververst.
// Verversen (de plek, het weer en zo nodig de gemeente) gebeurt bij elke opening van de app, telkens ze terugkomt naar de app, als het
// netwerk terug is, en zolang de app in beeld is om de tien minuten (houdLive). Komt er nieuw weer binnen, dan gaat 'weer:gewijzigd' uit:
// het weerbericht past zich ter plaatse aan, de warme zin blijft staan tot de volgende opening (zo verspringt ze niet na het openen).
import { zend } from '../kern/bus.js';
import { DEMO } from '../kern/demo.js';
import {
  besteMeting,
  isGoedeMeting,
  isRuweMeting,
  isVerplaatst,
  leesAntwoord,
  leesPlaats,
  leesPlaats2,
  plaatsAdres,
  plaatsAdres2,
  voorbeeldWeer,
  weerAdres,
  weerSoort,
} from '../logica/weer.js';
import { db } from './db.js';

const SLEUTEL = 'weer.laatste'; // { tijd (ms), code, temp, gevoel, wind, dag, min, max, kans, mm, sneeuw, plaats?, ruw?, plaatsStand? }
const VERS_MS = 10 * 60 * 1000; // ouder dan tien minuten: opnieuw ophalen
const GELDIG_MS = 3 * 60 * 60 * 1000; // ouder dan drie uur: niet meer het weer van nu
const OPNIEUW_MS = 2 * 60 * 1000; // na een mislukte poging: even wachten
const KIJK_MS = 60 * 1000; // zo vaak kijkt de app of het weer te oud is (een kleine vraag aan de eigen database, geen netwerk)
const TERUG_MS = 5 * 1000; // ze komt terug naar de app: meteen verversen, maar niet twee keer voor hetzelfde terugkomen
const LUISTER_MS = 6 * 1000; // is de eerste meting niet fijn, dan luistert Bloei nog zo lang naar een fijnere (het bericht staat er dan al)
const UITERST_MS = 20 * 1000; // komt er al die tijd geen enkele meting, dan is er deze keer geen plek

let bezig = null;
let laatstePoging = 0;
let geweigerd = false; // ze zei nee tegen de locatie: deze sessie niet opnieuw proberen
let live = false; // de wachter van houdLive loopt
let hadWeer = false; // er stond weer in beeld
let gemeente = null; // { b, l, naam }: waar de gemeente het laatst opgezocht is (alleen in het geheugen, deze sessie)
let eersteKeer = true; // deze sessie is er nog niet met succes ververst: bij de opening altijd, ook als het weer van daarnet nog vers is
let terug = false; // ze kwam net terug naar de app: verversen, ook als het weer van daarnet nog vers is
let osmVrij = 0; // vanaf wanneer OpenStreetMap opnieuw gevraagd mag worden (die dienst vraagt hoogstens één vraag per seconde)

const lees = async () => {
  try {
    const waarde = (await db.instellingen.get(SLEUTEL))?.waarde;
    return waarde && Number.isFinite(waarde.tijd) ? waarde : null;
  } catch {
    return null;
  }
};

// Eén vraag naar buiten, zonder iets over de gebruiker (geen cookie, geen herkomst, niets uit een tussenopslag).
const VRAAG = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
const metTijd = (ms) => (typeof AbortSignal?.timeout === 'function' ? { ...VRAAG, signal: AbortSignal.timeout(ms) } : VRAAG);

// De naam van de gemeente op deze plek: { naam } of { stand } (waarom er geen naam is, voor de regel "Plaats niet gevonden").
async function zoekGemeente(breedte, lengte) {
  if (!isVerplaatst(gemeente, breedte, lengte)) return { naam: gemeente.naam };
  const stand = [];
  const vraagBron = async (bron, adres, leesNaam, opties) => {
    try {
      const antwoord = await fetch(adres, opties);
      if (!antwoord.ok) return void stand.push(`${bron} ${antwoord.status}`);
      const gevonden = leesNaam(await antwoord.json());
      if (!gevonden) stand.push(`${bron} leeg`);
      return gevonden;
    } catch (fout) {
      // Een geblokkeerd adres, geen netwerk of te traag: de browser zegt niet welk van de drie.
      stand.push(`${bron} ${fout?.name === 'TimeoutError' || fout?.name === 'AbortError' ? 'traag' : 'geen antwoord'}`);
      return undefined;
    }
  };
  // Eerst OpenStreetMap (A): die zoekt binnen welke gemeentegrens de plek ligt. Ze wil weten welke app het vraagt: het adres van de app
  // als herkomst, niets over de gebruiker. Geeft ze geen naam, dan de reserve (B).
  // Volgen twee metingen elkaar binnen de seconde op, dan wacht de tweede vraag aan OpenStreetMap tot die seconde om is.
  const wacht = osmVrij - Date.now();
  osmVrij = Math.max(osmVrij, Date.now()) + 1100;
  if (wacht > 0) await new Promise((verder) => setTimeout(verder, wacht));
  const naam =
    (await vraagBron('A', plaatsAdres2(breedte, lengte), leesPlaats2, { ...metTijd(4000), referrerPolicy: 'origin' })) ||
    (await vraagBron('B', plaatsAdres(breedte, lengte), leesPlaats, metTijd(4000))) ||
    null;
  gemeente = naam ? { b: breedte, l: lengte, naam } : null;
  return naam ? { naam } : { stand: stand.join(', ') };
}

// Het weer (en de gemeente) voor één meting ophalen en tonen. metNaam false: de gemeente van daarnet blijft staan (een ruwe eerste
// meting mag een goede naam niet vervangen door een gok). pas(straal) zegt of dit antwoord nog mag: nooit over dat van een fijnere
// meting heen.
async function haal(meting, { metNaam, pas }) {
  const breedte = meting?.coords?.latitude;
  const lengte = meting?.coords?.longitude;
  const adres = weerAdres(breedte, lengte);
  if (!adres) return;
  const [antwoord, plek] = await Promise.all([fetch(adres, metTijd(8000)), metNaam ? zoekGemeente(breedte, lengte) : null]);
  if (!antwoord.ok) return;
  const weer = leesAntwoord(await antwoord.json());
  if (!weer || !pas()) return;
  // De gemeente: die van deze meting; anders die van daarnet. ruw: het toestel gaf alleen een grove plek (kilometers speling), het
  // weerbericht zet dan "bij benadering" bij de naam. Zonder naam gaat de reden mee (plaatsStand, bv. "A geen antwoord, B 403").
  let naam = {};
  if (plek?.naam) naam = { plaats: plek.naam, ...(isRuweMeting(meting) ? { ruw: true } : {}) };
  else if (plek?.stand) naam = { plaatsStand: plek.stand };
  else if (!plek) {
    const vorige = await lees();
    if (typeof vorige?.plaats === 'string') naam = { plaats: vorige.plaats, ...(vorige.ruw === true ? { ruw: true } : {}) };
  }
  // Rechtstreeks in de database, zonder 'instelling:gewijzigd': Vandaag hoeft er niet voor te hertekenen.
  const rij = { tijd: Date.now(), ...weer, ...naam };
  await db.instellingen.put({ sleutel: SLEUTEL, waarde: rij });
  eersteKeer = false;
  hadWeer = true;
  zend('weer:gewijzigd', { weer: rij });
}

// Verversen: de plek van het toestel, nu, en daarmee het weer en de gemeente. Er wordt nergens op gewacht: de eerste meting die het
// toestel geeft, gaat meteen naar buiten en komt meteen in beeld. Is die eerste meting niet fijn (een toestel begint vaak op zendmasten,
// kilometers ernaast), dan blijft Bloei nog even luisteren (LUISTER_MS) en verbetert het bericht zodra de fijne meting er is.
// Altijd de fijne locatie, en nooit een plek van daarnet (maximumAge 0).
async function ververs() {
  if (typeof navigator === 'undefined' || !navigator.geolocation || navigator.onLine === false) return;
  try {
    // Staat de locatie voor Bloei al op geweigerd, dan vraagt Bloei niets (niet elke browser kent deze vraag: dan gewoon proberen).
    const stand = await navigator.permissions?.query?.({ name: 'geolocation' }).catch(() => null);
    if (stand?.state === 'denied') return void (geweigerd = true);
  } catch {
    /* gewoon proberen */
  }
  const geo = navigator.geolocation;
  const opties = { enableHighAccuracy: true, timeout: UITERST_MS, maximumAge: 0 };
  const taken = [];
  await new Promise((klaar) => {
    let beste = null; // de fijnste meting die er kwam
    let gebruikt = null; // de meting waarmee het laatst opgehaald is
    let metNaamGebruikt = false;
    let getoond = Infinity; // de straal van de meting die nu in beeld staat
    let gedaan = false;
    let laat = false; // de luistertijd is om
    let wachter;
    let luisterKlok;
    let uiterstKlok;
    const straal = (meting) => (Number.isFinite(meting?.coords?.accuracy) ? meting.coords.accuracy : Infinity);
    const gebruik = (meting, metNaam) => {
      gebruikt = meting;
      metNaamGebruikt = metNaam;
      const mijn = straal(meting);
      // Een antwoord mag in beeld als er nog niets fijners staat (bij gelijk: het nieuwste, dat heeft de naam erbij).
      const pas = () => (mijn <= getoond ? ((getoond = mijn), true) : false);
      taken.push(haal(meting, { metNaam, pas }).catch(() => {}));
    };
    const sluit = () => {
      if (gedaan) return;
      gedaan = true;
      clearTimeout(luisterKlok);
      clearTimeout(uiterstKlok);
      try {
        geo.clearWatch?.(wachter);
      } catch {
        /* niets te stoppen */
      }
      // Er kwam geen fijne meting: de beste die er was telt, nu met haar gemeente erbij (en "bij benadering" als ze ruw is).
      if (beste && !isGoedeMeting(gebruikt) && (beste !== gebruikt || !metNaamGebruikt)) gebruik(beste, true);
      klaar();
    };
    const opMeting = (meting) => {
      if (gedaan) return;
      beste = besteMeting(beste, meting);
      if (isGoedeMeting(meting)) {
        gebruik(meting, true);
        return sluit();
      }
      // De eerste meting, nog niet fijn: meteen het weer van daar. De gemeente erbij, tenzij de meting ruw is: dan blijft de naam van
      // daarnet staan (of nog even geen naam) tot de fijne meting er is. Liever een tel geen naam dan een gemeente die er naast zit.
      if (!gebruikt) gebruik(meting, !isRuweMeting(meting));
    };
    // Een fout: bij een nee deze sessie niet meer vragen. Wat er al kwam, telt.
    const opFout = (fout) => {
      if (fout?.code === 1) geweigerd = true;
      sluit();
    };
    // Een toestel zonder doorlopende metingen: één vraag, en die telt.
    if (typeof geo.watchPosition !== 'function') {
      return void geo.getCurrentPosition(
        (meting) => {
          beste = meting;
          gebruik(meting, true);
          sluit();
        },
        opFout,
        opties,
      );
    }
    luisterKlok = setTimeout(() => {
      laat = true;
      if (beste) sluit();
    }, LUISTER_MS);
    uiterstKlok = setTimeout(sluit, UITERST_MS);
    wachter = geo.watchPosition(
      (meting) => {
        opMeting(meting);
        // Na de luistertijd telt de eerste meting die nog komt.
        if (laat) sluit();
      },
      opFout,
      opties,
    );
  });
  await Promise.all(taken);
}

// Het weerbericht live houden zolang de app open is. Elke minuut, en telkens ze terugkomt naar de app of het netwerk terug is, kijkt
// weerNu of het weer te oud is; zo ja, dan haalt het nieuw weer op. Uit beeld gebeurt er niets (geen verbruik op de achtergrond).
function houdLive() {
  if (live || typeof document === 'undefined' || typeof window === 'undefined') return;
  live = true;
  const kijk = async () => {
    if (document.visibilityState !== 'visible') return;
    const { weer } = await weerNu().catch(() => ({ weer: null }));
    // Lang zonder netwerk: het weer van daarnet is te oud geworden en het bericht verdwijnt, tot er weer nieuw weer is.
    if (!weer && hadWeer) zend('weer:gewijzigd', { weer: null });
    hadWeer = !!weer;
  };
  // Terug in beeld (de app opnieuw geopend vanuit de achtergrond): meteen de plek en het weer van nu.
  const kijkTerug = () => {
    if (document.visibilityState !== 'visible') return;
    // Loopt er al een verversing, of is er net een gestart (de opening zelf geeft ook dit seintje), dan is die het antwoord.
    if (!bezig && Date.now() - laatstePoging > TERUG_MS) terug = true;
    kijk();
  };
  setInterval(kijk, KIJK_MS);
  document.addEventListener('visibilitychange', kijkTerug);
  window.addEventListener('pageshow', kijkTerug);
  window.addEventListener('online', () => {
    laatstePoging = 0; // het netwerk is terug: meteen opnieuw proberen
    kijk();
  });
}

// weerNu(datum) → { weer, groep }: het weer van nu ({ code, temp, gevoel, wind, dag, min, max, kans }) en de groep zinnen die erbij hoort
// (bv. 'weerRegen'), elk null als er geen bruikbaar weer is. Start zo nodig een verversing op de achtergrond. datum is alleen voor de demo.
export async function weerNu(datum, nu = Date.now()) {
  if (DEMO) {
    const weer = voorbeeldWeer(datum);
    return { weer, groep: weerSoort(weer) };
  }
  houdLive();
  const rij = await lees();
  const oud = !rij || nu - rij.tijd > VERS_MS || rij.tijd > nu;
  // Bij elke opening en telkens ze terugkomt naar de app: meteen verversen, ook als het weer van daarnet nog vers is.
  // (Mislukt de eerste keer, dan opnieuw na OPNIEUW_MS, tot het een keer lukt.)
  if ((oud || eersteKeer || terug) && !bezig && !geweigerd && nu - laatstePoging > (terug ? TERUG_MS : OPNIEUW_MS)) {
    terug = false;
    laatstePoging = nu;
    bezig = ververs()
      .catch(() => {})
      .finally(() => (bezig = null));
  }
  const weer = rij && nu - rij.tijd >= 0 && nu - rij.tijd <= GELDIG_MS ? rij : null;
  if (weer) hadWeer = true;
  return { weer, groep: weerSoort(weer) };
}
