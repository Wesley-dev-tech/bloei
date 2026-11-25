// Het weer op de plaats waar ze is, voor het weerbericht en de warme zin op Vandaag (logica/weer.js, logica/motivatie.js).
// Altijd aan, zonder schakelaar en zonder vraag van Bloei zelf. Het toestel vraagt wel één keer toestemming voor de locatie; zegt ze nee,
// dan komt er gewoon geen zin over het weer. Wat er het toestel verlaat: alleen de afgeronde plaats (ongeveer elf kilometer), naar
// Open-Meteo. Geen naam, geen dagboek, geen cookie. De plaats zelf wordt nergens bewaard; alleen het weer van daarnet (instelling 'weer.laatste').
//
// Vandaag wacht nooit op het netwerk: het krijgt het weer dat er al is (hoogstens drie uur oud) en op de achtergrond wordt het ververst.
// Het weerbericht is live (houdLive): zolang de app in beeld is, haalt Bloei om de tien minuten nieuw weer op, en meteen als ze terugkomt
// naar de app of het netwerk terug is. Komt er nieuw weer binnen, dan gaat 'weer:gewijzigd' uit: het weerbericht past zich ter plaatse
// aan, de warme zin blijft staan tot de volgende opening (zo verspringt ze niet een seconde na het openen).
import { zend } from '../kern/bus.js';
import { DEMO } from '../kern/demo.js';
import { leesAntwoord, voorbeeldWeer, weerAdres, weerSoort } from '../logica/weer.js';
import { db } from './db.js';

const SLEUTEL = 'weer.laatste'; // { tijd (ms), code, temp, gevoel, wind, dag, min, max, kans }
const VERS_MS = 10 * 60 * 1000; // ouder dan tien minuten: opnieuw ophalen
const GELDIG_MS = 3 * 60 * 60 * 1000; // ouder dan drie uur: niet meer het weer van nu
const OPNIEUW_MS = 2 * 60 * 1000; // na een mislukte poging: even wachten
const KIJK_MS = 60 * 1000; // zo vaak kijkt de app of het weer te oud is (een kleine vraag aan de eigen database, geen netwerk)

let bezig = null;
let laatstePoging = 0;
let geweigerd = false; // ze zei nee tegen de locatie: deze sessie niet opnieuw proberen
let live = false; // de wachter van houdLive loopt
let hadWeer = false; // er stond weer in beeld

const lees = async () => {
  try {
    const waarde = (await db.instellingen.get(SLEUTEL))?.waarde;
    return waarde && Number.isFinite(waarde.tijd) ? waarde : null;
  } catch {
    return null;
  }
};

const plaats = () =>
  new Promise((klaar, mis) => {
    // Geen nauwkeurige locatie nodig (dat spaart ook de batterij); een plaats van enkele minuten oud is goed genoeg voor het weer.
    navigator.geolocation.getCurrentPosition(klaar, mis, { enableHighAccuracy: false, timeout: 15000, maximumAge: VERS_MS });
  });

async function ververs() {
  if (typeof navigator === 'undefined' || !navigator.geolocation || navigator.onLine === false) return;
  try {
    // Staat de locatie voor Bloei al op geweigerd, dan vraagt Bloei niets (niet elke browser kent deze vraag: dan gewoon proberen).
    const stand = await navigator.permissions?.query?.({ name: 'geolocation' }).catch(() => null);
    if (stand?.state === 'denied') return void (geweigerd = true);
  } catch {
    /* gewoon proberen */
  }
  let positie;
  try {
    positie = await plaats();
  } catch (fout) {
    if (fout?.code === 1) geweigerd = true; // PERMISSION_DENIED
    return;
  }
  const adres = weerAdres(positie?.coords?.latitude, positie?.coords?.longitude);
  if (!adres) return;
  const antwoord = await fetch(adres, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
  });
  if (!antwoord.ok) return;
  const weer = leesAntwoord(await antwoord.json());
  if (!weer) return;
  // Rechtstreeks in de database, zonder 'instelling:gewijzigd': Vandaag hoeft er niet voor te hertekenen.
  const rij = { tijd: Date.now(), ...weer };
  await db.instellingen.put({ sleutel: SLEUTEL, waarde: rij });
  hadWeer = true;
  zend('weer:gewijzigd', { weer: rij });
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
  setInterval(kijk, KIJK_MS);
  document.addEventListener('visibilitychange', kijk);
  window.addEventListener('pageshow', kijk);
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
  if (oud && !bezig && !geweigerd && nu - laatstePoging > OPNIEUW_MS) {
    laatstePoging = nu;
    bezig = ververs()
      .catch(() => {})
      .finally(() => (bezig = null));
  }
  const weer = rij && nu - rij.tijd >= 0 && nu - rij.tijd <= GELDIG_MS ? rij : null;
  if (weer) hadWeer = true;
  return { weer, groep: weerSoort(weer) };
}
