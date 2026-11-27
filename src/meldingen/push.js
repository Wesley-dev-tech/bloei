// Toestemming, abonneren, uren doorgeven en afmelden (BESLISSINGEN 30 tot 38; PLAN.md §6.5).
// Privacy (38): staan alle herinneringen uit en is er geen abonnement, dan doet deze module GEEN enkel verzoek. Zonder .env ook niet.
// Naar de dienst gaan alleen het abonnement (adres en sleutels van het toestel) en de uren. Nooit iets uit het dagboek.
// Elk toestel heeft zijn eigen abonnement en zijn eigen keuzes.
import { PUSH_URL, VAPID_PUBLIEK, pushBeschikbaar } from './config.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { luister, zend } from '../kern/bus.js';
import { vraagBlijvendeOpslagStil } from '../pwa/opslag.js';
import { OPSLAG_VOORVOEGSEL } from '../kern/demo.js';
import { dagboekLijst } from './tekst.js';

// Zoveel ms na de laatste tik geeft de app de uren door (was 700): een reeks tikken wordt zo één wijziging bij de dienst.
export const WACHTTIJD_MS = 3000;

// Vier soorten (BESLISSINGEN 313 en 736): dagboek (een lijst tijdstippen, BESLISSING 714) tot 2 uren, eten en supplementen elk tot 3,
// en drinken tot 4. Op vraag van Caroline (versie 0.6.7) kreeg Drinken een vierde tijdstip en gaf Dagboek er een af, zodat het totaal
// op 12 blijft, de grens van de dienst (MAX_UREN in worker/src/valideer.js): 2 + 3 + 4 + 3 = 12. Een lijst met meer dan haar grens
// telt alleen tot die grens (het scherm Herinneringen haalt de rest een keer stil weg).
export const MAX_UREN = 12;
export const PER_SOORT = 3;
export const LIMIETEN = { dagboek: 2, eten: PER_SOORT, drinken: 4, supplementenUren: PER_SOORT };
const SLEUTELS_DIE_TELLEN = ['meldingen.dagboek', 'meldingen.eten', 'meldingen.drinken', 'meldingen.supplementenUren'];

// ---- hulpjes
export function vanBase64Url(tekst) {
  const b = atob(tekst.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (tekst.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

// Het kwartier vóór een uur. Sinds BESLISSING 713 kiest de gebruiker per minuut en gaan de uren zonder afronding naar de dienst; dit
// dient alleen nog voor de overgang: een dienst van vóór 713 kent alleen kwartieren (zie stuurUren).
export function kwartier(uur) {
  const [u, m] = String(uur ?? '').split(':').map(Number);
  if (!Number.isFinite(u) || !Number.isFinite(m)) return '20:00';
  return `${String(Math.min(23, Math.max(0, u))).padStart(2, '0')}:${String(Math.floor(Math.min(59, Math.max(0, m)) / 15) * 15).padStart(2, '0')}`;
}

// Een geldig uur 'UU:MM' (00:00 tot 23:59), of null. Dezelfde regel als geldigUur in scherm.js (dat bestand importeert deze module,
// dus hier een eigen kopie in plaats van een kringverwijzing).
export function schoonUur(waarde) {
  const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(waarde ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1]}:${m[2]}`;
}

// De lijst van uren waarop dit toestel een signaal wil: elke dag dezelfde, zonder soort, gesorteerd en zonder dubbels (twee gelijke
// uren zijn één signaal). Alleen wat aan staat telt, en alleen een geldig uur. Dagboek: elk tijdstip uit de lijst (ook de oude vorm
// { aan, uur }, via dagboekLijst). opties.kwartieren: elk uur afgerond op het kwartier ervoor (alleen voor een oude dienst).
export function alleUren(keuzes, { kwartieren = false } = {}) {
  // Per soort de geldige uren die aan staan, uit de eerste tijdstippen van de lijst tot de grens van die soort (BESLISSING 736; Dagboek 2, Drinken 4).
  const bronnen = [[dagboekLijst(keuzes.dagboek), LIMIETEN.dagboek], [keuzes.eten, LIMIETEN.eten], [keuzes.drinken, LIMIETEN.drinken], [keuzes.supplementenUren, LIMIETEN.supplementenUren]];
  const perSoort = bronnen.map(([lijst, grens]) => {
    const uren = [];
    for (const k of (Array.isArray(lijst) ? lijst : []).slice(0, grens)) {
      const uur = k?.aan ? schoonUur(k.uur) : null;
      const q = uur && (kwartieren ? kwartier(uur) : uur);
      if (q && !uren.includes(q)) uren.push(q);
    }
    return uren;
  });
  return [...new Set(perSoort.flat())].sort().slice(0, MAX_UREN);
}

// Het lichaam van het verzoek: alleen het abonnement en de lijst van uren. Nooit iets uit het dagboek, ook geen soort.
export function bouwLichaam(abonnement, keuzes, opties) {
  const { endpoint, keys } = abonnement;
  return { abonnement: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, uren: alleUren(keuzes, opties) };
}

// Met welke publieke sleutel van de dienst werd het abonnement gemaakt? 'zelfde', 'anders' of 'onbekend'. Eerst wat de browser zelf
// zegt (PushSubscription.options.applicationServerKey), anders de sleutel die de app bij het abonneren bewaarde. Een abonnement van
// vóór die bewaarde sleutel zonder leesbare sleutel in de browser is 'onbekend': dan niet blind opnieuw abonneren.
export function sleutelStand(sub, bewaard, publiek = VAPID_PUBLIEK) {
  const naarBytes = (waarde) => {
    try {
      if (typeof waarde === 'string') return vanBase64Url(waarde.trim());
      if (waarde instanceof ArrayBuffer || Object.prototype.toString.call(waarde) === '[object ArrayBuffer]') return new Uint8Array(waarde);
      if (ArrayBuffer.isView(waarde)) return new Uint8Array(waarde.buffer, waarde.byteOffset, waarde.byteLength);
    } catch {
      /* onleesbaar */
    }
    return null;
  };
  const huidig = naarBytes(publiek ?? '');
  if (!huidig?.length) return 'onbekend';
  const gelijk = (a) => a.length === huidig.length && a.every((b, i) => b === huidig[i]);
  let uitBrowser = null;
  try {
    uitBrowser = naarBytes(sub?.options?.applicationServerKey ?? null);
  } catch {
    uitBrowser = null;
  }
  if (uitBrowser?.length) return gelijk(uitBrowser) ? 'zelfde' : 'anders';
  const uitOpslag = typeof bewaard?.sleutel === 'string' && bewaard.sleutel ? naarBytes(bewaard.sleutel) : null;
  if (uitOpslag?.length) return gelijk(uitOpslag) ? 'zelfde' : 'anders';
  return 'onbekend';
}

// Het lichaam van een afmelding: het endpoint en het auth-geheim van het abonnement. De dienst wist alleen als dat geheim klopt, zodat
// wie alleen het endpoint kent niets kan wissen (BESLISSING 329). Geen andere sleutel, niets uit het dagboek.
export function afmeldLichaam(abonnement) {
  const lichaam = { endpoint: abonnement?.endpoint };
  if (typeof abonnement?.keys?.auth === 'string') lichaam.auth = abonnement.keys.auth;
  return lichaam;
}

async function leesKeuzes() {
  const [dagboek, eten, drinken, supplementenUren] = await Promise.all([
    leesInstelling('meldingen.dagboek'),
    leesInstelling('meldingen.eten'),
    leesInstelling('meldingen.drinken'),
    leesInstelling('meldingen.supplementenUren'),
  ]);
  return { dagboek, eten, drinken, supplementenUren };
}

// De registratie van de service worker; in dev (geen service worker) of als hij niet op tijd klaar is: null.
async function registratie() {
  if (!('serviceWorker' in navigator)) return null;
  if (!(await navigator.serviceWorker.getRegistration())) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((klaar) => setTimeout(() => klaar(null), 4000))]);
}

// Hoe lang de app wacht na een 429 of 503 als de dienst geen (bruikbare) Retry-After geeft, en hoogstens (de dienst telt per UTC-dag).
const STANDAARD_WACHT_MS = { 429: 15 * 60 * 1000, 503: 60 * 1000 };
const MAX_WACHT_MS = 24 * 3600 * 1000 + 60 * 1000;

// Retry-After: een aantal seconden of een datum. Geeft milliseconden, of null.
export function wachtUit(kop, nu = Date.now()) {
  if (typeof kop !== 'string' || !kop.trim()) return null;
  const s = Number(kop.trim());
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(kop) - nu;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_WACHT_MS) : null;
}

async function dienst(methode, lichaam) {
  const antwoord = await fetch(PUSH_URL + '/abonnement', {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lichaam),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    // Ook als de app net gesloten of naar de achtergrond gestuurd wordt, mag het verzoek nog vertrekken.
    keepalive: true,
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
  });
  if (!antwoord.ok) {
    const fout = new Error('dienst ' + antwoord.status);
    fout.status = antwoord.status;
    if (antwoord.status === 429 || antwoord.status === 503) {
      fout.wachtMs = wachtUit(antwoord.headers?.get?.('Retry-After') ?? null) ?? STANDAARD_WACHT_MS[antwoord.status];
    }
    if (antwoord.status === 400 && typeof antwoord.json === 'function') {
      try {
        fout.code = (await antwoord.json())?.fout ?? null;
      } catch {
        /* geen leesbaar lichaam */
      }
    }
    throw fout;
  }
}

async function abonneer(reg) {
  const opties = { userVisibleOnly: true, applicationServerKey: vanBase64Url(VAPID_PUBLIEK) };
  let sub;
  try {
    sub = await reg.pushManager.subscribe(opties);
  } catch (fout) {
    // Een oud abonnement met een andere sleutel blokkeert een nieuw: eerst weg, dan opnieuw.
    const oud = await reg.pushManager.getSubscription();
    if (!oud) throw fout;
    await oud.unsubscribe();
    sub = await reg.pushManager.subscribe(opties);
  }
  // Met de publieke sleutel erbij: zo ziet de app later zelf dat de dienst een nieuwe sleutel kreeg (sleutelStand), ook als de browser
  // options.applicationServerKey niet geeft. Die sleutel is publiek; naar de dienst gaan alleen endpoint en keys (bouwLichaam).
  await zetInstelling('meldingen.abonnement', { ...sub.toJSON(), sleutel: VAPID_PUBLIEK });
  return sub;
}

// De dienst kreeg een nieuw sleutelpaar: een abonnement van de oude sleutel krijgt van de pushdienst (Apple) geen enkel signaal meer.
// Het oude adres afmelden bij de dienst (zonder de keuzes van de gebruiker te wijzigen), uitschrijven en opnieuw abonneren met de
// nieuwe sleutel. De toestemming blijft: de gebruiker merkt niets. Mislukt het afmelden (offline), dan wist de dienst het oude adres
// bij het eerstvolgende signaal (410). Mislukt het nieuwe abonnement, dan gooit dit de fout door (werkUrenBij geeft 'mislukt').
async function vernieuwAbonnement(reg, oud, bewaard) {
  try {
    await dienst('DELETE', afmeldLichaam(oud.toJSON?.() ?? bewaard));
  } catch {
    /* zie hierboven */
  }
  try {
    await oud.unsubscribe();
  } catch {
    /* abonneer probeert het zo nodig nog eens */
  }
  await zetInstelling('meldingen.abonnement', null);
  return abonneer(reg);
}

// ---- de publieke functies

// Vraagt toestemming (moet direct uit een tik komen: roep dit aan in de tik zelf, vóór je iets anders afwacht), abonneert en bewaart het
// abonnement op het toestel. Stuurt zelf niets naar de dienst: dat doet werkUrenBij zodra de uren bewaard zijn.
export async function zetMeldingenAan() {
  if (!pushBeschikbaar()) return 'niet-beschikbaar';
  let toestemming = Notification.permission;
  if (toestemming === 'default') toestemming = await Notification.requestPermission();
  if (toestemming !== 'granted') return 'geweigerd';
  vraagBlijvendeOpslagStil(); // AN-01: met meldingstoestemming kent Chrome op Android de blijvende opslag eerder toe (niet blokkerend)
  try {
    const reg = await registratie();
    if (!reg) return 'niet-beschikbaar';
    if (!(await reg.pushManager.getSubscription())) await abonneer(reg);
    return 'ok';
  } catch {
    return 'niet-beschikbaar';
  }
}

// Meldt dit toestel af bij de dienst (DELETE) en schrijft het lokaal uit. Zonder abonnement gebeurt er niets, en zonder verzoek.
export async function zetMeldingenUit() {
  if (!PUSH_URL) return;
  const reg = await registratie().catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  const bewaard = await leesInstelling('meldingen.abonnement');
  const endpoint = sub?.endpoint ?? bewaard?.endpoint;
  if (!endpoint) return;
  try {
    await dienst('DELETE', afmeldLichaam(sub?.toJSON?.() ?? bewaard));
  } catch {
    // Offline: het lokale uitschrijven hieronder maakt het adres ongeldig; de dienst wist het bij het eerstvolgende signaal (410).
  }
  try {
    await sub?.unsubscribe();
  } catch {
    /* niets aan te doen */
  }
  await zetInstelling('meldingen.abonnement', null);
}

let keten = Promise.resolve();
const inRij = (taak) => (keten = keten.then(taak, taak));

// Is het laatste doorgeven mislukt (of uitgesteld)? Dan staan de uren op het toestel als "nog door te geven" en probeert
// startMeldingen het opnieuw zodra het toestel weer online is, de app weer zichtbaar wordt of de wachttijd van de dienst om is.
let openstaand = false;

// Zei de dienst "later" (429 of 503 met Retry-After), dan gaat er vóór dit tijdstip (ms sinds 1970) geen nieuwe POST naar de dienst:
// elke tik zou anders opnieuw een weigering krijgen. Het tijdstip staat ook in localStorage, zodat een herstart van de app het
// respecteert (alleen een getal; "Profiel verwijderen" wist het mee, want de sleutel heeft het voorvoegsel van de app). Afmelden
// (alles uit) wacht hier niet op: het telt niet mee voor de grens op nieuwe aanmeldingen. Wel valt het, zoals elk verzoek, onder de
// rem per IP en per minuut van de dienst (zonder die rem kostte elke afmelding zonder juist geheim een leesopdracht, onbeperkt).
const WACHT_SLEUTEL = OPSLAG_VOORVOEGSEL + 'meldingen-wacht';
let wachtTot = 0;
let wachtGemeld = 0; // het wachttijdstip waarvoor de gebruiker al één keer een strook kreeg
const lokaal = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
function leesWacht() {
  try {
    const n = Number(lokaal()?.getItem(WACHT_SLEUTEL));
    if (Number.isFinite(n) && n > wachtTot) wachtTot = Math.min(n, Date.now() + MAX_WACHT_MS);
  } catch {
    /* geen opslag: alleen in het geheugen */
  }
  return wachtTot;
}
function zetWacht(tot) {
  wachtTot = tot;
  try {
    if (tot > 0) lokaal()?.setItem(WACHT_SLEUTEL, String(tot));
    else lokaal()?.removeItem(WACHT_SLEUTEL);
  } catch {
    /* geen opslag: alleen in het geheugen */
  }
  plantHerhaling();
}
// Zolang de app open is: vanzelf opnieuw proberen zodra de wachttijd om is (met een kleine marge).
let herhaalTimer = null;
function plantHerhaling() {
  clearTimeout(herhaalTimer);
  herhaalTimer = null;
  if (wachtTot <= 0) return;
  herhaalTimer = setTimeout(() => {
    herhaalTimer = null;
    if (openstaand && Date.now() >= wachtTot) werkUrenBij({ stil: true });
  }, Math.max(0, wachtTot - Date.now()) + 2000);
}
// Wanneer de dienst de uren weer aanneemt (ms sinds 1970), of 0 als er niets wacht. Voor het scherm, zodat het eerlijk kan zeggen
// dat de uren op het toestel bewaard zijn en later doorgegeven worden.
export function doorgevenNaWacht() {
  return openstaand && leesWacht() > Date.now() ? wachtTot : 0;
}
// Alleen voor de tests: de toestand van deze module in het geheugen terug naar het begin, zoals bij een nieuwe start van de app
// (wat in localStorage staat, blijft staan).
export function _zetTerugVoorTest() {
  openstaand = false;
  alleenKwartieren = false;
  sleutelNagekeken = false;
  wachtGemeld = 0;
  wachtTot = 0;
  clearTimeout(herhaalTimer);
  herhaalTimer = null;
}

// De keuzes uit, met behoud van de uren: gebruikt als het toestel de toestemming heeft ingetrokken (de schakelaars zijn dan verborgen).
async function zetKeuzesUit(keuzes) {
  const uit = (k) => (k ? { ...k, aan: false } : k);
  if (keuzes.dagboek?.aan) await zetInstelling('meldingen.dagboek', uit(keuzes.dagboek));
  if (Array.isArray(keuzes.eten) && keuzes.eten.some((k) => k?.aan)) await zetInstelling('meldingen.eten', keuzes.eten.map(uit));
  if (keuzes.drinken?.some((k) => k?.aan)) await zetInstelling('meldingen.drinken', keuzes.drinken.map(uit));
  if (keuzes.supplementenUren?.some((k) => k?.aan)) await zetInstelling('meldingen.supplementenUren', keuzes.supplementenUren.map(uit));
}

// Brengt de dienst in lijn met de keuzes op dit toestel. Elke herinnering uit en geen abonnement: niets te doen. Alles uit met een
// abonnement: afmelden. Anders: het abonnement en de uren versturen (opnieuw versturen is veilig).
// Trekt het toestel de toestemming in terwijl er een abonnement of een aan-keuze is, dan wordt het abonnement toch afgemeld en gaan de keuzes uit
// (anders blijft het abonnement op de dienst staan en kan de gebruiker het niet meer uitzetten). Mislukt het doorgeven, dan geeft de functie
// 'mislukt' terug, volgt het event 'meldingen:mislukt' (het scherm toont een strook) en probeert startMeldingen het later opnieuw.
// Zei de dienst "later", dan geeft de functie tot het tijdstip uit Retry-After 'uitgesteld' terug zonder verzoek; de uren blijven op het
// toestel en gaan vanzelf mee zodra het weer mag. De strook komt dan één keer per wachttijd, niet bij elke tik.
// opties.stil: een herhaling of de start van de app (geen tik van de gebruiker): bij 'uitgesteld' geen strook.
export function werkUrenBij(opties = {}) {
  return inRij(async () => {
    const uitslag = await werkUrenBijNu();
    openstaand = uitslag === 'mislukt' || uitslag === 'uitgesteld';
    if (uitslag === 'mislukt') {
      wachtGemeld = wachtTot;
      zend('meldingen:mislukt', { tot: wachtTot > Date.now() ? wachtTot : 0 });
    } else if (uitslag === 'uitgesteld' && !opties.stil && wachtGemeld !== wachtTot) {
      wachtGemeld = wachtTot;
      zend('meldingen:mislukt', { tot: wachtTot });
    }
    if (!openstaand && wachtTot > 0) zetWacht(0);
    return uitslag;
  });
}

async function werkUrenBijNu() {
  if (!pushBeschikbaar()) return 'niet-beschikbaar';
  const keuzes = await leesKeuzes();
  if (alleUren(keuzes).length === 0) {
    await zetMeldingenUit();
    return 'uit';
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    await zetMeldingenUit();
    await zetKeuzesUit(keuzes);
    return 'geweigerd';
  }
  if (Notification.permission !== 'granted') return 'geweigerd';
  // De dienst zei "later": niet opnieuw vragen vóór het afgesproken tijdstip.
  if (leesWacht() > Date.now()) return 'uitgesteld';
  try {
    const reg = await registratie();
    if (!reg) return 'niet-beschikbaar';
    let sub = await reg.pushManager.getSubscription();
    // Een keer per sessie (de start van de app of de eerste wijziging): is het abonnement gemaakt met een andere sleutel dan die van
    // de dienst nu, dan opnieuw abonneren. Hoogstens een vernieuwing per sessie, zodat een mislukt nieuw abonnement nooit in een lus
    // raakt: een volgende poging in dezelfde sessie abonneert gewoon als er geen abonnement meer is (alleen in de browser, geen
    // verzoek aan de dienst tot dat lukt), en de volgende start van de app kijkt opnieuw.
    if (sub && !sleutelNagekeken) {
      sleutelNagekeken = true;
      const bewaard = await leesInstelling('meldingen.abonnement');
      if (sleutelStand(sub, bewaard) === 'anders') sub = await vernieuwAbonnement(reg, sub, bewaard);
    }
    sub ??= await abonneer(reg);
    await stuurUren(sub.toJSON(), keuzes);
    return 'ok';
  } catch (fout) {
    if (fout?.wachtMs > 0) zetWacht(Date.now() + fout.wachtMs);
    return 'mislukt';
  }
}

// Overgang (BESLISSING 713): de app en de dienst worden niet op hetzelfde ogenblik uitgerold. Een dienst van vóór 713 weigert een uur
// dat geen kwartier is met 400 'ongeldig'. Dan een keer opnieuw met elk uur afgerond op het kwartier ervoor, en voor de rest van de
// sessie meteen in kwartieren (anders kost elke wijziging twee verzoeken). Lukt ook dat niet, dan gaat de fout door: geen lus.
let alleenKwartieren = false;
let sleutelNagekeken = false;
async function stuurUren(abonnement, keuzes) {
  if (!alleenKwartieren) {
    try {
      await dienst('POST', bouwLichaam(abonnement, keuzes));
      return;
    } catch (fout) {
      const metMinuten = alleUren(keuzes).some((uur) => Number(uur.slice(3)) % 15 !== 0);
      const ongeldig = fout?.status === 400 && (fout.code ?? 'ongeldig') === 'ongeldig';
      if (!ongeldig || !metMinuten) throw fout;
    }
  }
  await dienst('POST', bouwLichaam(abonnement, keuzes, { kwartieren: true }));
  alleenKwartieren = true;
}

// "Profiel verwijderen": eerst afmelden en uitschrijven, vóór de gegevens weg zijn. Mislukt of duurt het te lang, dan gaat het wissen toch door.
export async function meldAfBijWissen() {
  await Promise.race([inRij(() => zetMeldingenUit()), new Promise((klaar) => setTimeout(klaar, 5000))]);
}

// Eén keer bij het opstarten van de app: luistert naar gewijzigde keuzes en naar een tik op een melding, en brengt de dienst in lijn.
export function startMeldingen() {
  if (typeof window === 'undefined') return;
  // Een reeks tikken (schakelaars en uren) wordt één wijziging: pas WACHTTIJD_MS na de laatste tik doorgeven. De dienst telt
  // wijzigingen per dag (WIJZIGINGEN_PER_DAG in worker/src/index.js).
  let timer = null;
  const geefNuDoor = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    werkUrenBij();
  };
  const stopGewijzigd = luister('instelling:gewijzigd', ({ sleutel }) => {
    if (!SLEUTELS_DIE_TELLEN.includes(sleutel)) return;
    clearTimeout(timer);
    timer = setTimeout(geefNuDoor, WACHTTIJD_MS);
  });
  // Wie het scherm verlaat of de app wegveegt, verliest niets: wat nog wacht, gaat meteen (het verzoek heeft keepalive). Lukt ook dat
  // niet meer, dan stuurt de volgende start de uren op het toestel toch door (werkUrenBij hieronder).
  const stopRoute = luister('route:gewijzigd', geefNuDoor);
  // Geeft een functie terug die de luisteraars op de bus weer weghaalt (voor de tests).
  const stop = () => {
    stopGewijzigd();
    stopRoute();
    clearTimeout(timer);
    timer = null;
  };
  if (!pushBeschikbaar()) return stop;
  // Een mislukte doorgave (dienst onbereikbaar, 429 of 503) wordt herhaald zodra het toestel weer online is of de app weer zichtbaar
  // wordt, maar niet vóór het tijdstip dat de dienst zelf noemde (Retry-After).
  const herhaal = () => {
    if (openstaand && leesWacht() <= Date.now()) werkUrenBij({ stil: true });
  };
  window.addEventListener('online', herhaal);
  window.addEventListener('pagehide', geefNuDoor);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') herhaal();
    else geefNuDoor();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.soort === 'ga' && typeof e.data.pad === 'string' && e.data.pad.startsWith('#/')) window.location.hash = e.data.pad;
  });
  // Bij de start: wacht er nog een tijdstip van de dienst, dan de herhaling plannen; anders de uren meteen in lijn brengen.
  leesWacht();
  openstaand = wachtTot > Date.now();
  plantHerhaling();
  werkUrenBij({ stil: true });
  return stop;
}
