// Terugkeren op de plaats waar je was (BESLISSING 465).
//
// Het venster scrolt op elk formaat (telefoon, tablet en desktop: de pagina zelf; #scherm en de zijbalk hebben geen eigen scroll, de zijbalk
// is sticky). Daarom werkt alles hier met window en document.scrollingElement.
//
// Regel: bij het verlaten van een scherm onthoudt app.js { y, focus } per pad (in het geheugen). Bij terugkeren (een stap terug in de
// geschiedenis, of de terugknop van de schermkop naar het ouderscherm waar je vandaan kwam) komt die stand terug, nadat het scherm
// getekend en gevuld is. Vooruit (tabblad, rij, link, huisje) begint een scherm bovenaan; het tabblad van het scherm waarin ze al zit
// (Algemeen vanuit Vergrendeling) telt als terugkeren naar zijn beginscherm (zie isTerugkeer). Alleen de scrollhoogte staat daarnaast in
// history.state (per ingang), zodat een herlaadbeurt op zijn plaats blijft; geen localStorage en geen gezondheidsgegevens.

const SLEUTEL = 'bloeiScroll';
const MERK = 'bloeiId';
const heeftMerk = (state) => Boolean(state && typeof state === 'object' && state[MERK]);
const nieuwMerk = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---- Pure functies ----

// Een stabiele verwijzing naar een element: de href van een link, anders de tekst van een knop. Geen DOM-knoop.
// nr: de plaats onder de elementen met dezelfde href of tekst (Algemeen heeft meer dan één link naar Badges).
const LINKS = 'a[href]';
const KNOPPEN = 'button, [role="button"], summary';
export function focusSleutel(el, wortel = null) {
  const a = el?.closest?.(LINKS);
  if (a) {
    const href = a.getAttribute('href');
    const nr = wortel ? [...wortel.querySelectorAll(LINKS)].filter((x) => x.getAttribute('href') === href).indexOf(a) : 0;
    return { soort: 'href', waarde: href, nr: Math.max(0, nr) };
  }
  const b = el?.closest?.(KNOPPEN);
  const tekst = b?.textContent?.trim();
  if (tekst) {
    const nr = wortel ? [...wortel.querySelectorAll(KNOPPEN)].filter((x) => x.textContent.trim() === tekst).indexOf(b) : 0;
    return { soort: 'tekst', waarde: tekst, nr: Math.max(0, nr) };
  }
  return null;
}

export function vindFocus(wortel, sleutel) {
  if (!sleutel || !wortel) return null;
  const lijst = sleutel.soort === 'href'
    ? [...wortel.querySelectorAll(LINKS)].filter((a) => a.getAttribute('href') === sleutel.waarde)
    : [...wortel.querySelectorAll(KNOPPEN)].filter((b) => b.textContent.trim() === sleutel.waarde);
  return lijst[sleutel.nr || 0] || lijst[0] || null;
}

// Is dit een terugkeer (de oude stand komt terug) of een vooruit-navigatie (bovenaan)?
//  viaTerug: de wissel kwam uit een stap in de geschiedenis (terugknop, terugveeg, Alt+pijl, ook vooruit in de geschiedenis)
//  vooruit: een tik op een tabblad, de zijbalk of het huisje: een nieuw scherm, behalve het geval hieronder
//  komtVan: Map van pad naar het pad waaruit het geopend werd; de terugknop van de schermkop gaat naar dat ouderscherm
//  viaTab: die tik was op een tabblad (tabbalk of zijbalk), niet op het huisje
//  zelfdeTab: het nieuwe scherm hoort bij hetzelfde tabblad als het scherm dat verlaten wordt
// Een tik op het tabblad van het scherm waarin ze al zit (Algemeen > Vergrendeling, dan het tabblad Algemeen) brengt haar terug naar het
// beginscherm van dat tabblad, zoals een tabbalk op iOS: dat is terugkeren, op de plaats waar ze was. Een ander tabblad blijft vooruit.
export function isTerugkeer({ viaTerug, vooruit, viaTab = false, zelfdeTab = false, vorigePad, pad, komtVan }) {
  if (vorigePad == null || pad === vorigePad) return false;
  if (viaTerug) return true;
  if (vooruit) return Boolean(viaTab && zelfdeTab && isVoorouder(komtVan, vorigePad, pad));
  return komtVan?.get(vorigePad) === pad;
}

// Werd `kind` (rechtstreeks of langs tussenschermen) geopend vanuit `ouder`?
export function isVoorouder(komtVan, kind, ouder) {
  const gezien = new Set();
  for (let p = komtVan?.get(kind); p != null && !gezien.has(p); p = komtVan.get(p)) {
    if (p === ouder) return true;
    gezien.add(p);
  }
  return false;
}

// De hoogte die ze moet kunnen halen: de pagina moet minstens y + de hoogte van het venster zijn.
export const nodigeHoogte = (y, venster) => Math.ceil(y + venster);

export const leesStand = (state, pad) => (state && typeof state === 'object' && state[SLEUTEL]?.pad === pad && Number.isFinite(state[SLEUTEL].y) ? state[SLEUTEL].y : null);

// ---- Met de pagina ----

const scroller = () => document.scrollingElement || document.documentElement;
// Zet de scrollhoogte meteen, zonder te glijden. De stijl (Pico) zet scroll-behavior: smooth op <html>; een browser die behavior 'instant'
// niet kent (een oudere Safari gooit dan een TypeError) of die smooth uit de stijl laat voorgaan, zou anders glijden of niets doen. Daarom
// staat scroll-behavior even op auto, met de eenvoudige vorm scrollTo(x, y) als terugval.
export function zetScroll(y) {
  const html = document.documentElement;
  const oud = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  try {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  } catch {
    window.scrollTo(0, y);
  }
  if (Math.abs(scroller().scrollTop - y) > 1) scroller().scrollTop = y;
  html.style.scrollBehavior = oud;
}
const naarY = zetScroll;

function inhoudBodem(houder) {
  let m = 0;
  for (const kind of houder.children) m = Math.max(m, kind.getBoundingClientRect().bottom + scroller().scrollTop);
  return Math.round(m);
}

// Loopt er in het scherm nog een eindige animatie (de kaarten komen zacht op, ui/beweging.js)? Zolang dat zo is, blijft de stand vastgehouden:
// WebKit verschuift de pagina anders tijdens die animatie een paar px (gemeten in WebKit 27.2: 1628 werd 1625 na het loslaten), Chrome niet.
function komtNogOp(houder) {
  try {
    return houder.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime));
  } catch {
    return false;
  }
}

// Zet y terug en de focus op het element, terwijl het scherm (asynchroon) tekent. De positie staat er al vóór de eerste verf: de
// houder krijgt zolang een minimumhoogte zodat y haalbaar is, ook als de inhoud nog komt. Daarna elke beeldopbouw opnieuw tot de hoogte
// 400 ms stilstaat en het opkomen van het scherm voorbij is (hoogstens 2,5 s); een tik, wiel, aanraking of toets van de gebruiker stopt het meteen.
// Geeft een functie die het stopt.
export function herstelPositie({ houder, y = 0, focus = null, stopWanneer = () => false, max = 2500 }) {
  if (!(y > 0) && !focus) return () => {};
  const begin = performance.now();
  const gebeurtenissen = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  let klaar = false;
  let gefocust = !focus;
  let laatsteHoogte = -1;
  let stabielSinds = begin;
  // Een tik, wiel, aanraking of toets van de gebruiker stopt het vasthouden zonder de pagina nog eens terug te zetten: anders landt de klik
  // die volgt op een ander element dan waar ze drukte.
  const stop = () => eind(false);
  function eind(zetTerug = true) {
    if (klaar) return;
    klaar = true;
    gebeurtenissen.forEach((g) => window.removeEventListener(g, stop));
    houder.style.removeProperty('min-height');
    if (zetTerug && y > 0 && !stopWanneer() && Math.abs(scroller().scrollTop - y) > 1) naarY(y);
  }
  if (y > 0) {
    houder.style.minHeight = `${nodigeHoogte(y, window.innerHeight)}px`;
    naarY(y);
  }
  const probeerFocus = () => {
    if (gefocust) return;
    const el = vindFocus(houder, focus);
    if (el) {
      el.focus({ preventScroll: true });
      gefocust = true;
    }
  };
  probeerFocus();
  // Pas na het eigen scrollen van de gebruiker luisteren, niet op de tik die hier naartoe leidde.
  gebeurtenissen.forEach((g) => window.addEventListener(g, stop, { once: true, passive: true }));
  const stap = () => {
    if (klaar) return;
    if (stopWanneer()) return eind();
    const nu = performance.now();
    if (y > 0 && Math.abs(scroller().scrollTop - y) > 1) naarY(y);
    probeerFocus();
    const hoogte = inhoudBodem(houder);
    if (hoogte !== laatsteHoogte) {
      laatsteHoogte = hoogte;
      stabielSinds = nu;
    }
    if (nu - begin > max || (nu - stabielSinds > 400 && gefocust && !komtNogOp(houder))) return eind();
    requestAnimationFrame(stap);
  };
  requestAnimationFrame(stap);
  return eind;
}

// De waarnemer van wat er rond een navigatie gebeurt: de laatste tik (voor de focus), een tik op een tabblad of het huisje (vooruit),
// een stap in de geschiedenis (terug), en het bewaren van de scrollhoogte in history.state. app.js vraagt bij elke wissel neemRichting().
export function maakNavigatie(houder) {
  let vooruit = false;
  let viaTab = false; // de tik voor vooruit was op een tabblad (tabbalk of zijbalk)
  let vooruitTimer = null;
  let laatsteTik = null; // { pad, sleutel }
  let pad = null; // het pad van het scherm dat nu getekend is
  let bewaarTimer = null;

  const schrijf = (extra) => {
    try {
      const huidig = history.state && typeof history.state === 'object' ? history.state : {};
      history.replaceState({ ...huidig, ...extra }, '');
    } catch {
      /* geen geschiedenis of te vaak: dan blijft het bij het geheugen */
    }
  };
  // Schermen die hun adres netjes zetten (#/dagboek wordt #/dagboek/week/...) doen dat met history.replaceState(null, ...). Dat wist onze
  // merktekens en zou het scherm een ander pad geven dan waaronder zijn stand bewaard staat. Hier blijven de merktekens behouden, en het
  // nieuwe adres telt als hetzelfde scherm als het oude (kanon).
  let doel = null; // het pad dat nu getekend wordt (tussen begin() en zetPad())
  const alias = new Map(); // genormaliseerd pad -> het pad waarmee het scherm geopend werd
  const kanon = (p) => alias.get(p) ?? p;
  if (!history.__bloeiScroll) {
    const orig = history.replaceState.bind(history);
    history.replaceState = (state, titel, url) => {
      const voor = padNu();
      let nieuw = state;
      if (state === null || state === undefined || typeof state === 'object') {
        const nu = history.state && typeof history.state === 'object' ? history.state : {};
        nieuw = { ...(state || {}) };
        if (nu[MERK] && !nieuw[MERK]) nieuw[MERK] = nu[MERK];
        if (nu[SLEUTEL] && !nieuw[SLEUTEL]) nieuw[SLEUTEL] = nu[SLEUTEL];
      }
      const r = orig(nieuw, titel, url);
      const na = padNu();
      if (na !== voor && (voor === doel || (pad !== null && kanon(voor) === kanon(pad))) && kanon(na) !== kanon(voor)) alias.set(na, kanon(voor));
      return r;
    };
    history.__bloeiScroll = true;
  }
  const padNu = () => location.hash.replace(/^#\/?/, '');
  const bewaar = () => {
    clearTimeout(bewaarTimer);
    if (pad === null || kanon(padNu()) !== kanon(pad)) return;
    const y = Math.round(scroller().scrollTop);
    if (leesStand(history.state, pad) === y && history.state?.[SLEUTEL]?.pad === pad) return;
    schrijf({ [SLEUTEL]: { pad, y } });
  };

  document.addEventListener(
    'click',
    (e) => {
      bewaar(); // vóór de navigatie die deze tik start
      const doel = e.target;
      if (doel?.closest?.('#tabbalk a, #zijbalk a, .schermkop__home, .sla-over')) {
        vooruit = true;
        viaTab = Boolean(doel.closest('#tabbalk a, #zijbalk a'));
        clearTimeout(vooruitTimer);
        vooruitTimer = setTimeout(() => (vooruit = viaTab = false), 600);
      }
      if (doel && houder.contains(doel)) laatsteTik = { pad, sleutel: focusSleutel(doel, houder) };
    },
    true,
  );
  window.addEventListener('scroll', () => {
    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(bewaar, 150);
  }, { passive: true });
  window.addEventListener('pagehide', bewaar);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && bewaar());

  return {
    // Bij het begin van een wissel: wat was de richting? Wist de vlaggen. Een stap in de geschiedenis (terug, of vooruit in de geschiedenis)
    // herken je aan de ingang: die draagt een merkteken (bloeiId) uit een eerdere tekening; een nieuwe ingang (tik, link) heeft er nog geen.
    // popstate is daarvoor niet bruikbaar: Chrome stuurt het ook bij een gewone link naar een #-adres.
    neemRichting() {
      const r = { viaTerug: heeftMerk(history.state), vooruit, viaTab: vooruit && viaTab };
      vooruit = viaTab = false;
      return r;
    },
    // De focussleutel van het scherm dat verlaten wordt: de laatste tik daarop, anders het element met focus.
    focusVan(vorigPad, actief) {
      const tik = laatsteTik && laatsteTik.pad === vorigPad ? laatsteTik.sleutel : null;
      laatsteTik = null;
      return tik || (actief && houder.contains(actief) ? focusSleutel(actief, houder) : null);
    },
    kanon,
    begin(p) {
      doel = p;
    },
    stand(p) {
      const st = history.state?.[SLEUTEL];
      return st && Number.isFinite(st.y) && kanon(st.pad) === kanon(p) ? st.y : null;
    },
    zetPad(p) {
      pad = p;
      doel = null;
      if (!heeftMerk(history.state)) schrijf({ [MERK]: nieuwMerk() });
    },
  };
}
