// Hash-router, schil (tabbalk op de telefoon, zijbalk vanaf 960 px), schermen aan- en afkoppelen.
// Contract: PLAN.md §6.4. Zonder start.klaar is #/welkom de enige bestemming (toonRoute).
import { luister, zend } from './kern/bus.js';
import { t } from './teksten.js';
import { tabbalk as maakTabbalk, zijbalk as maakZijbalk, legeToestand, sluitAlleBladen } from './ui/componenten.js';
import { koppelGlaslens } from './ui/glaslens.js';
import { isOpen as slotIsOpen } from './vergrendeling/slot.js';
import { h } from './ui/dom.js';
import { dagdeel, vandaag as vandaagSleutel } from './kern/datum.js';
import { bewaarAlles } from './schermen/hulp.js';
import { isStartKlaar } from './data/instellingen.js';
import { tekstveldActief, venster } from './kern/invoer.js';
import { herstelPositie, isTerugkeer, maakNavigatie, zetScroll } from './kern/scroll.js';
import { isVrijgesteld } from './vergrendeling/vrijstelling.js';
import { OPSLAG_VOORVOEGSEL } from './kern/demo.js';
import { isStandalone } from './kern/toestel.js';

// ---- De app opent op Vandaag (BESLISSING 704, 715 en 721) ----
// Na het slot begint Bloei op het tabblad Vandaag, bovenaan, en niet op het scherm van de vorige keer; in de geinstalleerde app ook bij
// terugkeer uit de achtergrond zonder slot. BESLISSING 715: de grens is 0: elke keer naar Vandaag, ook na een blik van een seconde op een
// andere app. Een grens boven 0 laat een kortere afwezigheid staan. BESLISSING 721: een gewone herlading (F5, omlaag trekken, Herladen bij
// een nieuwe versie) houdt het scherm: herladen is niet opnieuw openen.
export const NAAR_VANDAAG_NA_MS = 0;
// Was ze `ms` weg, is dat lang genoeg voor Vandaag? Bij grens 0 altijd (ook als de klok terugliep en ms negatief is).
export const isLangGenoegWeg = (ms, grens = NAAR_VANDAAG_NA_MS) => grens <= 0 || ms >= grens;
// Het pad bij het laden van de pagina (deze module laadt vóór openDb en startSlot). Een ander pad op het moment van de startbeslissing is
// tijdens het opstarten gekozen (een goto, een tik op een melding) en gaat voor.
const huidigPad = () => window.location.hash.replace(/^#\/?/, '');
const PAD_BIJ_LADEN = huidigPad();
// Ging het slot dicht vóór de app tekende (het slot vroeg de code bij het opstarten)? De app luistert zelf pas vanaf startApp naar het slot.
let appGestart = false;
let slotBijStart = false;
luister('slot:dicht', () => {
  if (!appGestart) slotBijStart = true;
});

// Een laadbeurt: het adres openen zoals het is ('adres') of Vandaag bovenaan ('vandaag')?
//  soort: het type van de navigatie ('navigate', 'reload', 'back_forward'); padBijLaden: het pad (zonder '#/') toen de pagina laadde;
//  padNu: het pad nu, bij de beslissing; slot: vroeg het slot de code bij het opstarten?
// Een herlading of een stap terug in de geschiedenis houdt het scherm (721), tenzij het slot dichtging: na het slot altijd Vandaag. Een nieuwe
// navigatie naar een adres (een tik op een melding, een bladwijzer) is een gekozen bestemming en blijft staan, ook met het slot; zonder adres
// opent Vandaag sowieso (toonRoute). Een adres dat tijdens het opstarten gekozen werd, wordt nooit overschreven.
export function beslisStart({ soort, padBijLaden, padNu, slot }) {
  if (padNu !== padBijLaden) return 'adres';
  return slot && (soort === 'reload' || soort === 'back_forward') ? 'vandaag' : 'adres';
}

import * as vandaag from './schermen/vandaag.js';
import * as dagboek from './schermen/dagboek.js';
import * as drinken from './schermen/drinken.js';
import * as supplementen from './schermen/supplementen.js';
import * as gewicht from './schermen/gewicht.js';
import * as meer from './schermen/meer.js';
import * as meerInstellingen from './schermen/meer-instellingen.js';
import * as meerGewicht from './schermen/meer-gewicht.js';
import * as meerUitleg from './uitleg/scherm.js';
import { koppelUitleg } from './uitleg/rondleiding.js';
import * as meerProfiel from './schermen/meer-profiel.js';
import * as meerFavorieten from './schermen/meer-favorieten.js';
import * as meerBadges from './schermen/meer-badges.js';
import * as meerMeldingen from './meldingen/scherm.js';
import * as meerVergrendeling from './vergrendeling/scherm.js';
import * as welkom from './schermen/welkom.js';

// Een scherm dat pas bij het openen geladen wordt (aparte chunk, niet in de startbundel). De opruimfunctie werkt
// ook als het laden nog bezig is. Mislukt het laden (offline vlak na een update, een cache die niet klopt), dan staat er
// een rustige melding met "Opnieuw proberen" in plaats van een leeg scherm (R2-14).
function lui(laad) {
  return {
    toon(houder, params) {
      let weg = false;
      let opruim = null;
      const probeer = () => {
        laad()
          .then((module) => {
            if (!weg) opruim = module.toon(houder, params) || null;
          })
          .catch((fout) => {
            console.error(fout);
            if (weg) return;
            houder.replaceChildren(legeToestand({ tekst: t('algemeen.foutLaden'), actie: { label: t('algemeen.opnieuwProberen'), opKlik: probeer } }));
          });
      };
      probeer();
      return () => {
        weg = true;
        if (typeof opruim === 'function') opruim();
      };
    },
  };
}

// Twee echte datums (jjjj-mm-dd) in de volgorde van, tot.
const GELDIGE_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
function echteDatum(tekst) {
  const m = GELDIGE_DATUM.exec(tekst);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}
const geldigBereik = ({ van, tot }) => echteDatum(van) && echteDatum(tot) && van <= tot;

const delenScherm = lui(() => import('./schermen/delen.js'));

// Volgorde telt: het eerste patroon dat past, wint. ":naam" is een parameter.
const ROUTES = [
  { patroon: 'vandaag', tab: 'vandaag', scherm: vandaag },
  { patroon: 'dagboek', tab: 'dagboek', scherm: dagboek },
  { patroon: 'dagboek/:weergave', tab: 'dagboek', scherm: dagboek },
  { patroon: 'dagboek/:weergave/:sleutel', tab: 'dagboek', scherm: dagboek },
  { patroon: 'drinken', tab: 'drinken', scherm: drinken },
  { patroon: 'drinken/:datum', tab: 'drinken', scherm: drinken },
  { patroon: 'supplementen', tab: 'supplementen', scherm: supplementen },
  { patroon: 'supplementen/:datum', tab: 'supplementen', scherm: supplementen },
  { patroon: 'gewicht', tab: 'gewicht', scherm: gewicht },
  { patroon: 'meer', tab: 'meer', scherm: meer },
  { patroon: 'meer/instellingen', tab: 'meer', scherm: meerInstellingen },
  { patroon: 'meer/gewicht', tab: 'meer', scherm: meerGewicht },
  // Het instelscherm Delen is vervallen (BESLISSING 304, herzien): het oude adres gaat naar het scherm Delen zelf.
  { patroon: 'meer/delen', tab: 'meer', scherm: meer, geldig: () => false, omleiding: 'delen' },
  { patroon: 'meer/uitleg', tab: 'meer', scherm: meerUitleg },
  { patroon: 'meer/profiel', tab: 'meer', scherm: meerProfiel },
  { patroon: 'meer/favorieten', tab: 'meer', scherm: meerFavorieten },
  { patroon: 'meer/badges', tab: 'meer', scherm: meerBadges },
  // Het oude adres van de back-up (verwijderd, BESLISSING 225) gaat naar Algemeen.
  { patroon: 'meer/backup', tab: 'meer', scherm: meer, geldig: () => false, omleiding: 'meer' },
  { patroon: 'meer/meldingen', tab: 'meer', scherm: meerMeldingen },
  { patroon: 'meer/vergrendeling', tab: 'meer', scherm: meerVergrendeling },
  // Delen is een eigen bestemming buiten de zes tabs: geen tab actief, in de zijbalk het item Delen.
  { patroon: 'delen', tab: null, nav: 'delen', scherm: delenScherm },
  { patroon: 'delen/:van/:tot', tab: null, nav: 'delen', scherm: delenScherm, geldig: geldigBereik, omleiding: 'delen' },
  { patroon: 'welkom', tab: null, scherm: welkom },
];

// Beveiliging: een kapot adres (bv. "#/dagboek/dag/%E0" in een link) mag de app niet laten vastlopen; decodeURIComponent gooit dan een
// URIError. Zo'n stuk telt als onbekend, en een onbekend adres gaat naar Vandaag.
function ontcijfer(stuk) {
  try {
    return decodeURIComponent(stuk);
  } catch {
    return null;
  }
}

function zoekRoute(pad) {
  const delen = pad.split('/').filter(Boolean);
  if (delen.some((stuk) => ontcijfer(stuk) === null)) return null;
  for (const route of ROUTES) {
    const patroon = route.patroon.split('/');
    if (patroon.length !== delen.length) continue;
    const params = {};
    const past = patroon.every((stuk, i) => {
      if (stuk.startsWith(':')) {
        params[stuk.slice(1)] = ontcijfer(delen[i]);
        return true;
      }
      return stuk === delen[i];
    });
    if (past) return route.geldig && !route.geldig(params) ? { omleiding: route.omleiding } : { route, params };
  }
  return null;
}

export function ga(pad) {
  window.location.hash = pad.startsWith('#') ? pad : '#/' + pad.replace(/^\//, '');
}

export function startApp(houder) {
  const schermhouder = document.createElement('main');
  schermhouder.id = 'scherm';
  schermhouder.className = 'container-fluid';

  // Tabbalk (telefoon) en zijbalk (desktop) staan allebei in de schil; layout.css toont er één en zet de
  // andere op display: none, zodat die ook voor schermlezers en toetsenbord weg is.
  const { el: tabbalk, links: tabknoppen } = maakTabbalk();
  tabbalk.id = 'tabbalk';
  const zetLens = koppelGlaslens(tabbalk); // de glazen druppel rond de actieve tab (BESLISSING 753)
  const { el: zijbalk, links: zijknoppen } = maakZijbalk();
  zijbalk.id = 'zijbalk';
  houder.classList.add('schil');
  houder.append(zijbalk, schermhouder, tabbalk);

  // "Ga naar de inhoud": eerste tabstop, onzichtbaar tot hij focus krijgt (basis.css). Geen href naar een hash: dat zou de router starten.
  const slaOver = h('a', { class: 'sla-over', href: '#', role: 'link' }, t('algemeen.slaOver'));
  slaOver.addEventListener('click', (e) => {
    e.preventDefault();
    schermhouder.focus({ preventScroll: true });
    schermhouder.scrollIntoView?.({ block: 'start' });
  });
  houder.prepend(slaOver);
  schermhouder.setAttribute('tabindex', '-1');

  // De titel van het tabblad volgt het scherm: de kop (h1) van het scherm, of de tabnaam voor Vandaag (daar is de h1 een begroeting).
  // Schermen tekenen soms pas later, dus een waarnemer zet de titel opnieuw zodra de h1 er is.
  const zetTitel = (route) => {
    const kop = route.patroon === 'vandaag' ? t('tab.vandaag') : schermhouder.querySelector('h1')?.textContent?.trim();
    document.title = kop ? `${kop} · Bloei` : 'Bloei';
  };
  let titelWaarnemer = null;

  let ruimOp = null;
  let opruimUitleg = null; // de knop Uitleg en de automatische start van de rondleiding (src/uitleg)
  let vorigePad = null; // het pad van het scherm dat nu getoond wordt (null vóór de eerste tekening)
  let vorigeTab = null;
  const scrollPerPad = new Map(); // pad -> { y, focus }: de stand bij het verlaten, voor terugkeren (BESLISSING 465)
  const komtVan = new Map(); // pad -> het pad waaruit het geopend werd (de terugknop van de schermkop gaat daarheen)
  // Het venster scrolt op elk formaat (telefoon, tablet, desktop); de browser zet zelf niets terug: de app regelt het (src/kern/scroll.js).
  try {
    history.scrollRestoration = 'manual';
  } catch {
    /* niet te zetten: dan blijft het gedrag van de browser */
  }
  // BESLISSING 704 en 721: na het slot bij het opstarten begint ze op Vandaag, bovenaan. Vóór maakNavigatie: dit replaceState is nog het gewone
  // van de browser, dus de ingang krijgt een lege stand (geen merkteken, geen scrollhoogte van het oude scherm) en er komt geen stap in de geschiedenis bij.
  appGestart = true;
  try {
    // Een sleutel van een oudere versie (BESLISSING 715, het verlaten scherm) bleef soms achter in dit tabblad: weg ermee.
    window.sessionStorage.removeItem(OPSLAG_VOORVOEGSEL + 'verlaten');
  } catch {
    /* niets */
  }
  if (isStartKlaar()) {
    const soort = performance.getEntriesByType?.('navigation')?.[0]?.type ?? 'navigate';
    if (beslisStart({ soort, padBijLaden: PAD_BIJ_LADEN, padNu: huidigPad(), slot: slotBijStart }) === 'vandaag') {
      try {
        history.replaceState(null, '', '#/vandaag');
      } catch {
        /* geen geschiedenis: dan opent het adres zoals het is */
      }
    }
  }
  const navigatie = maakNavigatie(schermhouder);
  let stopHerstel = () => {};

  // Achter het slot (voorstel C, BESLISSING 329): zolang het slot dicht is, staat er niets van het dagboek in de pagina.
  let vergrendeld = false;
  let slotStand = null; // { pad, y } van het scherm dat openstond toen het slot dichtging
  let bewaren = null; // de belofte van wat er bij het sluiten nog bewaard werd
  let herstel = null; // tijdens de eerste tekening na het openen: dezelfde slotStand
  let geleegd = false; // werd de pagina bij het sluiten echt leeggemaakt (zie 'slot:dicht')
  let bewaardeVensters = []; // vensters met onbewaarde invoer die achter het slot stil dicht gingen
  let huidigeRoute = null; // de route die nu getekend is (voor de titel na het openen)
  // BESLISSING 704: hoe lang was ze weg? dichtOp: wanneer het slot dichtging; terugOp: wanneer de pagina daarna weer in beeld kwam (de tijd
  // om de code in te tikken telt niet). vrijBijVerlaten: de pagina ging naar de achtergrond terwijl een systeemvenster van de app openstond
  // (deelmenu, bestandskiezer, afdrukken, Face ID; vrijstelling.js): ze was de app niet echt uit.
  let dichtOp = 0;
  let terugOp = null;
  let vrijBijVerlaten = false;
  let nieuwBezoek = false; // de volgende tekening begint een nieuw bezoek: geen terugkeer, niets van het oude scherm onthouden
  let stilGezet = null; // het pad dat de app zelf al tekende vóór zijn hashchange binnenkwam (geen tweede tekening)
  // BESLISSING 715: in de geinstalleerde app (beginscherm) begint ze ook zonder slot op Vandaag, bovenaan, als ze uit de achtergrond terugkomt.
  // In een gewoon browsertabblad blijft het scherm staan. Met het slot aan (vergrendeld) doet het slot dit, precies een keer ('slot:open').
  // weggeweest: de pagina ging naar de achtergrond; padBijVerlaten: het scherm toen (een ander scherm bij terugkomst is een gekozen adres,
  // bv. een tik op een melding terwijl ze weg was, en gaat voor).
  let weggeweest = false;
  let padBijVerlaten = null;
  let terugBezig = false;
  const markeerWeg = () => {
    if (!weggeweest) padBijVerlaten = vorigePad;
    weggeweest = true;
  };
  async function terugUitAchtergrond() {
    if (!weggeweest || terugBezig) return;
    weggeweest = false;
    const vrij = vrijBijVerlaten;
    vrijBijVerlaten = false;
    if (!isStandalone() || vergrendeld || !slotIsOpen() || !isStartKlaar() || vrij || vorigePad === null || vorigePad === 'welkom') return;
    if (vorigePad !== padBijVerlaten) return; // een ander adres werd gekozen terwijl ze weg was
    // Vensters zonder onbewaarde invoer gaan dicht zoals bij het slot; blijft er een venster open, dan heeft het invoer die anders verloren gaat.
    sluitAlleBladen();
    if (document.querySelector('dialog[open]')) return;
    terugBezig = true;
    try {
      const actief = document.activeElement;
      if (actief && actief !== document.body && schermhouder.contains(actief)) actief.blur?.();
      await bewaarAlles().catch((fout) => console.error(fout));
    } finally {
      terugBezig = false;
    }
    const pad = window.location.hash.replace(/^#\/?/, '');
    if (vergrendeld || pad !== vorigePad || document.querySelector('dialog[open]')) return; // intussen veranderd: laat het zoals het is
    komtVan.clear();
    scrollPerPad.clear();
    if (pad !== 'vandaag') {
      nieuwBezoek = true;
      stilGezet = 'vandaag';
      window.location.replace('#/vandaag');
      toonRoute();
    } else if (!document.querySelector('.uitleg__kaart')) zetScroll(0); // een lopende rondleiding op Vandaag blijft zoals ze is
  }
  window.addEventListener('pagehide', () => {
    markeerWeg();
  });
  window.addEventListener('pageshow', () => {
    if (vergrendeld) weggeweest = false; // het slot regelt de terugkeer
    else terugUitAchtergrond();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      markeerWeg();
      vrijBijVerlaten = isVrijgesteld();
      terugOp = null;
    } else if (!vergrendeld) terugUitAchtergrond();
    else {
      weggeweest = false; // het slot regelt de terugkeer, precies een keer
      if (terugOp === null) terugOp = Date.now();
    }
  });
  // De laatst gekende scrollstand. Het slot verbergt de app vóór 'slot:dicht', waardoor window.scrollY dan al 0 is.
  let laatsteY = 0;
  window.addEventListener('scroll', () => {
    if (!vergrendeld) laatsteY = window.scrollY;
  }, { passive: true });

  // Laat het nieuwe scherm zacht opkomen (alleen opacity, zie layout.css); niets bij reduced motion.
  function laatOpkomen() {
    schermhouder.classList.remove('is-binnen');
    void schermhouder.offsetWidth; // herstart de animatie
    schermhouder.classList.add('is-binnen');
  }
  schermhouder.addEventListener('animationend', (e) => {
    if (e.target === schermhouder) schermhouder.classList.remove('is-binnen');
  });

  // AN-07 (c): bij een wissel van route (een tik op een melding, terug in een browser zonder geschiedenisingang) blijft er geen blad open
  // boven een ander scherm. Elk venster sluit zoals bij Escape; een venster met invoer die nog niet bewaard is, blijft staan (er gaat niets
  // verloren). Staat er daarna geen modaal venster meer open, dan verdwijnt ook een achtergebleven overflow: hidden op <html>.
  function sluitBijRoutewissel() {
    if (document.querySelector('dialog[open]')) sluitAlleBladen();
    if (!document.querySelector('dialog[open]') && document.documentElement.style.overflow === 'hidden') document.documentElement.style.removeProperty('overflow');
  }

  function toonRoute() {
    // Achter het slot wordt niets getekend (een tik op een melding, de dagwissel, een andere hash); bij het openen volgt de tekening.
    if (vergrendeld) return;
    const pad = window.location.hash.replace(/^#\/?/, '');
    const gevonden = zoekRoute(pad);
    if (gevonden?.omleiding) {
      ga(gevonden.omleiding);
      return;
    }
    if (!gevonden) {
      ga('vandaag');
      return;
    }
    const { route, params } = gevonden;
    // Eerste start: zonder 'start.klaar' is het welkomscherm de enige bestemming; met 'start.klaar' is het scherm er niet meer.
    if (route.patroon === 'welkom' && isStartKlaar()) return ga('vandaag');
    if (route.patroon !== 'welkom' && !isStartKlaar()) return ga('welkom');
    const eerste = vorigePad === null;
    const gewisseld = pad !== vorigePad; // een echte wissel van route; geen hertekening van dezelfde route
    // Na het slot naar Vandaag (BESLISSING 704): een nieuw bezoek, dus geen terugkeer en geen stand of herkomst van het oude scherm.
    const vers = nieuwBezoek;
    nieuwBezoek = false;
    const richting = gewisseld ? navigatie.neemRichting() : { viaTerug: false, vooruit: false };
    if (gewisseld) navigatie.begin(pad);
    const sleutel = navigatie.kanon(pad); // een scherm dat zijn adres netjes zet (#/dagboek > #/dagboek/week/...) blijft hetzelfde scherm
    // Ook het tabblad van het scherm waarin ze zit (Algemeen vanuit Vergrendeling) is terugkeren naar zijn beginscherm (src/kern/scroll.js).
    const zelfdeTab = route.tab != null && route.tab === vorigeTab;
    const terugkeer = !eerste && !vers && isTerugkeer({ ...richting, zelfdeTab, vorigePad: vorigePad === null ? null : navigatie.kanon(vorigePad), pad: sleutel, komtVan });
    const bewaard = scrollPerPad.get(sleutel);
    // Wat terugkomt: de stand uit het geheugen, of (een stap in de geschiedenis na een herlaadbeurt) die van de ingang zelf.
    const terugStand = terugkeer ? { y: bewaard?.y ?? navigatie.stand(pad) ?? 0, focus: bewaard?.focus ?? null } : null;
    // Na een herlaadbeurt blijft het scherm op zijn plaats, zoals de browser dat deed.
    const naLadenY = eerste && ['reload', 'back_forward'].includes(performance.getEntriesByType?.('navigation')?.[0]?.type) ? navigatie.stand(pad) : null;

    // Volgorde: 1. event, 2. oud scherm opruimen, 3. nieuw scherm tekenen, 4. navigatie bijwerken.
    // Het event gaat dus vóór het tekenen uit, zodat beweging.js weet dat dit scherm net opent.
    // Vorm: { pad, params, tab, vorigePad, vorigeTab, eerste }  (pad zonder '#/', bv. 'dagboek/maand').
    if (gewisseld) {
      // Na het slot is de pagina leeg en de scrollstand 0: die van het oude scherm werd al bij het sluiten onthouden.
      if (vorigePad !== null && !herstel && !vers) {
        scrollPerPad.set(navigatie.kanon(vorigePad), { y: window.scrollY, focus: navigatie.focusVan(vorigePad, document.activeElement) });
        if (!terugkeer) komtVan.set(sleutel, navigatie.kanon(vorigePad));
      }
      stopHerstel();
      zend('route:gewijzigd', { pad, params, tab: route.tab, vorigePad, vorigeTab, eerste });
      if (!eerste) sluitBijRoutewissel();
    }

    // Een keuzerij (Dag, Week, Maand) wisselt van route terwijl de focus erop staat: onthoud welke keuze, zodat de focus op de nieuwe keuze terugkomt.
    const gefocust = document.activeElement;
    const keuzeTekst = gefocust?.getAttribute?.('role') === 'radio' && schermhouder.contains(gefocust) ? gefocust.textContent.trim() : null;
    if (typeof ruimOp === 'function') ruimOp();
    schermhouder.replaceChildren();
    schermhouder.dataset.scherm = route.patroon.split('/:')[0];
    ruimOp = route.scherm.toon(schermhouder, params) || null;
    huidigeRoute = route;
    zetTitel(route);
    if (keuzeTekst) [...schermhouder.querySelectorAll('[role="radio"]')].find((r) => r.textContent.trim() === keuzeTekst)?.focus({ preventScroll: true });
    titelWaarnemer?.disconnect();
    titelWaarnemer = new MutationObserver(() => {
      zetTitel(route);
      if (route.patroon === 'vandaag' || schermhouder.querySelector('h1')) titelWaarnemer.disconnect();
    });
    titelWaarnemer.observe(schermhouder, { childList: true, subtree: true });
    // Na een wissel zit de focus niet meer op een onderdeel dat verdween: breng hem naar het scherm, zodat Tab bij de inhoud begint.
    if (gewisseld && !eerste && (document.activeElement === document.body || document.activeElement?.closest?.('#tabbalk, #zijbalk'))) schermhouder.focus({ preventScroll: true });
    // Hetzelfde scherm als vóór het slot: geen wissel (geen event, geen opkomen), wel de knop Uitleg opnieuw, dezelfde scrollstand en de
    // focus op het scherm.
    const naSlot = Boolean(herstel) && herstel.pad === pad;
    if (gewisseld || naSlot) {
      opruimUitleg?.();
      opruimUitleg = koppelUitleg(schermhouder, schermhouder.dataset.scherm);
    }
    if (naSlot) {
      herstelScroll(herstel.y);
      schermhouder.focus({ preventScroll: true });
    }
    if (gewisseld) laatOpkomen();

    for (const knoppen of [tabknoppen, zijknoppen]) {
      for (const [tab, link] of Object.entries(knoppen)) {
        if (tab === (route.tab ?? route.nav)) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    }
    // Het welkomstscherm heeft geen navigatie.
    const zonderNav = route.patroon === 'welkom';
    tabbalk.hidden = zonderNav;
    zijbalk.hidden = zonderNav;
    houder.dataset.nav = zonderNav ? 'uit' : 'aan';
    zetLens();

    // Vooruit naar een scherm: bovenaan. Terugkeren: de oude stand en de focus op de rij waarmee ze vertrok (BESLISSING 465); de stand
    // staat er vóór de eerste verf en wordt vastgehouden terwijl het scherm zijn gegevens laadt (src/kern/scroll.js).
    if (gewisseld) {
      // 'instant': de stijl (Pico) zet scroll-behavior: smooth op de pagina; een nieuw scherm hoort er meteen bovenaan te staan, niet erheen te glijden.
      zetScroll(0);
      if (terugStand) stopHerstel = herstelPositie({ houder: schermhouder, y: terugStand.y, focus: terugStand.focus, stopWanneer: () => vergrendeld });
    } else if (naLadenY > 0 && !naSlot) {
      stopHerstel = herstelPositie({ houder: schermhouder, y: naLadenY, stopWanneer: () => vergrendeld });
    }
    vorigePad = pad;
    vorigeTab = route.tab;
    navigatie.zetPad(pad);
  }

  // De scrollstand terugzetten terwijl het scherm (asynchroon) tekent: elke beeldopbouw opnieuw, tot ze klopt, hoogstens 2 seconden,
  // en meteen stoppen zodra ze zelf scrolt of tikt.
  function herstelScroll(y) {
    if (!y) return;
    const tot = performance.now() + 2000;
    let zelf = false;
    const stop = () => (zelf = true);
    const gebeurtenissen = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    gebeurtenissen.forEach((g) => window.addEventListener(g, stop, { once: true, passive: true }));
    const klaar = () => gebeurtenissen.forEach((g) => window.removeEventListener(g, stop));
    const stap = () => {
      if (zelf || vergrendeld) return klaar();
      zetScroll(y);
      if (Math.abs(window.scrollY - y) > 1 && performance.now() < tot) requestAnimationFrame(stap);
      else klaar();
    };
    requestAnimationFrame(stap);
  }

  // Het slot gaat dicht (bij het openen van de app, bij terugkeer met code, of als de pagina echt verlaten wordt; niet bij een gewone blur).
  // Eerst bewaren wat wacht, dan het scherm opruimen en de pagina leegmaken. Het slot ligt er al over, dus er flitst niets.
  // Uitzondering: staat er een venster open met invoer die nog niet bewaard is (een half ingevulde supplementkaart), dan blijft de pagina
  // staan, verborgen en onbereikbaar achter het slot, zodat er niets verloren gaat. Opruimen zou dat venster zonder bewaren sluiten.
  luister('slot:dicht', () => {
    if (vergrendeld) return;
    vergrendeld = true;
    dichtOp = Date.now();
    terugOp = document.visibilityState === 'hidden' ? null : dichtOp;
    // Een tekstveld met focus eerst laten loslaten: zijn eigen blur-afhandeling bewaart meteen.
    const actief = document.activeElement;
    if (actief && actief !== document.body && schermhouder.contains(actief)) actief.blur?.();
    bewaren = bewaarAlles().catch((fout) => console.error(fout));
    // Is de app al verborgen (het gordijn lag er al), dan is window.scrollY 0 en geldt de laatst gekende stand.
    const y = houder.hidden || houder.style.display === 'none' ? laatsteY : window.scrollY;
    slotStand = { pad: vorigePad, y };
    if (vorigePad !== null) scrollPerPad.set(navigatie.kanon(vorigePad), { ...scrollPerPad.get(navigatie.kanon(vorigePad)), y });
    titelWaarnemer?.disconnect();
    titelWaarnemer = null;
    document.title = 'Bloei';
    // Vensters zonder onbewaarde invoer gaan dicht zoals bij Escape. Wat dan nog openstaat, heeft invoer die anders verloren gaat.
    sluitAlleBladen();
    const open = [...document.querySelectorAll('dialog[open]')];
    geleegd = open.length === 0;
    if (!geleegd) {
      // Een modaal venster maakt de rest van de pagina inert, ook het slot: dan kan ze haar code niet intikken. Het venster gaat daarom
      // stil dicht (zonder zijn eigen afhandeling, dus zonder iets weg te gooien) en komt na het openen terug zoals het was.
      bewaardeVensters = open;
      for (const dlg of open) dlg.close();
      return;
    }
    if (typeof ruimOp === 'function') ruimOp();
    ruimOp = null;
    opruimUitleg?.();
    opruimUitleg = null;
    schermhouder.replaceChildren();
  });

  // Het slot gaat open: wachten tot het bewaren klaar is, dan hetzelfde scherm opnieuw tekenen (of het scherm van een nieuwe hash).
  luister('slot:open', async () => {
    if (!vergrendeld) return;
    await bewaren;
    if (!slotIsOpen()) return; // intussen weer dicht: blijft leeg
    bewaren = null;
    vergrendeld = false;
    const stand = slotStand;
    slotStand = null;
    const pad = window.location.hash.replace(/^#\/?/, '');
    const vensters = bewaardeVensters;
    bewaardeVensters = [];
    if (!geleegd) {
      // De pagina bleef staan: de titel, de scrollstand en de vensters terug. Een andere hash (een tik op een melding achter het slot)
      // zou het scherm en dus het half ingevulde venster opruimen: het scherm met het venster gaat voor.
      if (pad !== vorigePad && vorigePad !== null) history.replaceState(null, '', '#/' + vorigePad);
      if (huidigeRoute) zetTitel(huidigeRoute);
      herstelScroll(stand?.y);
      for (const dlg of vensters) if (dlg.isConnected && !dlg.open) dlg.showModal();
      return;
    }
    // BESLISSING 704: was het slot minstens NAAR_VANDAAG_NA_MS dicht (tot ze terug was) en was ze de app echt uit, dan begint ze op Vandaag,
    // bovenaan, als een nieuw bezoek: de herkomst en de vastgehouden standen van het vorige bezoek gaan weg. Uitzonderingen: een venster met
    // onbewaarde invoer (hierboven: alles blijft staan) en een ander adres dat achter het slot gekozen werd (een tik op een melding): dat gaat voor.
    const weg = (terugOp ?? Date.now()) - dichtOp;
    const vrij = vrijBijVerlaten;
    vrijBijVerlaten = false;
    if (isStartKlaar() && isLangGenoegWeg(weg) && !vrij && (pad === vorigePad || vorigePad === null)) {
      komtVan.clear();
      scrollPerPad.clear();
      if (pad !== 'vandaag') {
        // Vervangt de ingang (geen extra stap in de geschiedenis, een lege stand); de hashchange die volgt, tekent niet nog eens.
        nieuwBezoek = true;
        stilGezet = 'vandaag';
        window.location.replace('#/vandaag');
        toonRoute();
        return;
      }
      herstel = { pad, y: 0 };
      try {
        toonRoute();
      } finally {
        herstel = null;
      }
      zetScroll(0);
      return;
    }
    herstel = stand;
    try {
      toonRoute();
    } finally {
      herstel = null;
    }
  });

  // De vaste kop op een telefoon krijgt een fijne lijn zodra er gescrold is (layout.css).
  window.addEventListener('scroll', () => document.documentElement.classList.toggle('is-gescrold', window.scrollY > 4), { passive: true });
  window.addEventListener('hashchange', () => {
    const al = stilGezet;
    stilGezet = null;
    if (al !== null && al === vorigePad && window.location.hash.replace(/^#\/?/, '') === al) return;
    toonRoute();
  });
  toonRoute();
  bewaakDagwissel(toonRoute, schermhouder);
}

// ---- De dagwissel en het dagdeel (BESLISSING 203 en 145) ----
// Blijft de app open over middernacht, dan toonde ze nog de dag van gisteren en kwam een nieuwe invoer op gisteren terecht.
// Hier staat de ene wachter: hij onthoudt de dag en het dagdeel (ochtend vanaf 7, middag vanaf 12, avond vanaf 17 uur) en kijkt of ze veranderd zijn
// bij terugkeer naar de app (visibilitychange, pageshow, focus) en met een timer die kort na elke grens afloopt (middernacht, 7, 12 en 17 uur).
// Bij een andere dag: wat wacht wordt eerst bewaard, dan gaat 'dag:gewijzigd' uit ({ oud, nieuw }, ook als DOM-gebeurtenis) en de huidige route wordt opnieuw
// getekend, zodat elk scherm zijn datum opnieuw berekent. Een route met een uitdrukkelijke datum in de hash (een eerdere dag, een bereik) blijft staan.
// Bij een ander dagdeel hertekenen alleen de schermen die het tonen (Vandaag met de begroeting, Supplementen met de momenten).
// Staat er een venster open (een blad, de uitleg), dan wacht de wachter tot het dicht is.
const DATUM_PARAMS = ['sleutel', 'datum', 'van', 'tot'];
const DAGDEEL_SCHERMEN = ['vandaag', 'supplementen'];

function bewaakDagwissel(hertoon, schermhouder) {
  let bekendeDag = vandaagSleutel();
  let bekendDagdeel = dagdeel();
  let dagTimer = null;
  let wacht = null;

  async function controleer() {
    const dagNu = vandaagSleutel();
    const deelNu = dagdeel();
    if (dagNu === bekendeDag && deelNu === bekendDagdeel) return;
    // Een open venster (ook de supplementkaart, een <dialog>) of de uitleg: wachten tot het dicht is.
    // Alleen een ander dagdeel (de begroeting, het moment van nu) terwijl ze iets invult: een tekstveld met focus. Een maaltijd staat in een blad
    // (een <dialog>, BESLISSING 419) en wacht dus hierboven al. Hertekenen zou de focus wegnemen; dat wacht tot de invoer klaar is (R2-01). Een andere dag gaat wel
    // meteen door: wat getypt is, wordt eerst bewaard op de dag waarvoor het bedoeld was.
    if ((dagNu === bekendeDag && tekstveldActief(schermhouder)) || venster()) { // dezelfde voorwaarde als Vandaag gebruikt (kern/invoer.js)
      if (!wacht) {
        wacht = setTimeout(() => {
          wacht = null;
          controleer();
        }, 1000);
      }
      return;
    }
    const oudeDag = bekendeDag;
    const oudDeel = bekendDagdeel;
    bekendeDag = dagNu;
    bekendDagdeel = deelNu;
    const dagVeranderd = dagNu !== oudeDag;
    // Wat nog wacht (een half getypte maaltijd) gaat naar de dag waarvoor het bedoeld was. Mislukt dat bewaren, dan wordt de dagwissel toch gemeld.
    await bewaarAlles().catch((fout) => console.error(fout));
    if (dagVeranderd) {
      const detail = { oud: oudeDag, nieuw: dagNu };
      zend('dag:gewijzigd', detail);
      document.dispatchEvent(new CustomEvent('dag:gewijzigd', { detail }));
    }
    if (deelNu !== oudDeel) {
      const detail = { oud: oudDeel, nieuw: deelNu };
      zend('dagdeel:gewijzigd', detail);
      document.dispatchEvent(new CustomEvent('dagdeel:gewijzigd', { detail }));
    }
    const gevonden = zoekRoute(window.location.hash.replace(/^#\/?/, ''));
    if (!gevonden?.route || gevonden.route.patroon === 'welkom') return;
    if (DATUM_PARAMS.some((p) => p in gevonden.params)) return; // een uitdrukkelijke datum blijft staan
    if (!dagVeranderd && !DAGDEEL_SCHERMEN.includes(gevonden.route.patroon)) return;
    const hoogte = window.scrollY;
    hertoon();
    zetScroll(hoogte);
  }

  // De timer loopt af kort na de volgende grens: middernacht, 7, 12 of 17 uur.
  function plan() {
    clearTimeout(dagTimer);
    const nu = new Date();
    const grenzen = [0, 7, 12, 17, 24].map((uur) => new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), uur, 0, 1));
    const volgende = grenzen.find((g) => g > nu);
    dagTimer = setTimeout(() => {
      controleer();
      plan();
    }, Math.max(1000, volgende - nu));
  }
  const terug = () => {
    controleer();
    plan();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') terug();
  });
  window.addEventListener('pageshow', terug);
  window.addEventListener('focus', terug);
  // R5-04: een tik net na middernacht, voor de timer afliep (een trage of gepauzeerde timer), schrijft al op de nieuwe dag (BESLISSING 203).
  // Het scherm gaat dan meteen mee naar die dag, anders lijkt de tik niet te werken.
  luister('data:gewijzigd', () => {
    if (vandaagSleutel() !== bekendeDag) terug();
  });
  plan();
  return controleer;
}
