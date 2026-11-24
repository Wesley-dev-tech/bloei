// De motor van de rondleidingen (BESLISSING 167): een rustige uitleg in stappen bovenop het scherm. Het onderdeel waar de
// stap over gaat is uitgelicht (de rest gedimd; een tik buiten het kaartje doet niets, scrollen blijft werken), met ernaast een
// kaartje met een korte titel, één of twee zinnen, "Stap n van m" en de knoppen Vorige, Volgende (laatste stap: Klaar) en Overslaan.
// Hoe het uitlichten en het kaartje werken: zie "de uitlichting en het kaartje" hieronder (BESLISSING 328).
//
// Gedrag: een stap waarvan het onderdeel er niet is, wordt overgeslagen. Een rondleiding start niet als het slot dicht is,
// een blad open staat of er al een loopt, en stopt bij een wissel van route. Onthouden wat ze zag of oversloeg staat in
// localStorage onder één sleutel, 'bloei-uitleg'. Beweging: alleen opacity en het schuiven van de uitlichting, en niets bij
// prefers-reduced-motion (basis.css zet dan alle animaties en overgangen uit). CSP: alleen el.style.setProperty.
import { h } from '../ui/dom.js';
import { zetScroll } from '../kern/scroll.js';
import { icoonknop, knop } from '../ui/componenten.js';
import { ICOON } from '../ui/iconenkaart.js';
import { luister, zend } from '../kern/bus.js';
import { t } from '../teksten.js';
import { AANBOD, BIJ_LEEG, HANDELING_SCHERM, ONDERWERPEN, doelKeuzes, heeftKort, heeftUitleg, isKleinScherm, stappenVoor, tekstVoorToestel, zetApkBron } from './stappen.js';
import { vulKleuren } from './kleurnamen.js';
import { apkBeschikbaar } from '../pwa/apk.js';
import { DEMO, OPSLAG_VOORVOEGSEL } from '../kern/demo.js';

// De vaste balk van de demo (src/demo/balk.js) telt als vaste kop en wordt mee inert. Alleen de demobouw noemt haar: de echte bouw bevat niets van
// de demo (c-demo-ervaring.spec.js), daarom wordt de klassenaam hier pas in de demo samengesteld.
const DEMO_KOP = DEMO ? '.' + ['demo', 'balk'].join('-') : null;
const metDemo = (lijst) => (DEMO_KOP ? `${DEMO_KOP}, ${lijst}` : lijst);
import { bewaakTerug, merkVan } from '../pwa/terug.js';
import { isAndroid } from '../kern/toestel.js';

// ---- De automatische start (BESLISSING 167). Eerst vraagt één welkomstkaartje of ze de uitleg wil; pas na een Ja start elk tabblad
// zijn rondleiding bij het eerste bezoek. Bij Liever niet start nooit iets vanzelf. Zo krijgt ook wie de app al gebruikte niet
// ongevraagd op elk tabblad een rondleiding. Voor browsertests (navigator.webdriver) staat de automatische start uit. ----
export const AUTO_START = true;

// De Android-stappen over de apk (BESLISSING 515) hangen af van de bouw: stappen.js krijgt de bron hier.
zetApkBron(() => apkBeschikbaar());

// ============================================================ onthouden (localStorage, één sleutel)
// 'bloei-uitleg'; in de demo 'bloei-demo-uitleg' (kern/demo.js, BESLISSING 364).
export const OPSLAGSLEUTEL = OPSLAG_VOORVOEGSEL + 'uitleg';

export function leesStaat(opslag = globalThis.localStorage) {
  try {
    const ruw = JSON.parse(opslag.getItem(OPSLAGSLEUTEL) || '{}') || {};
    return { auto: ruw.auto !== false, gezien: ruw.gezien && typeof ruw.gezien === 'object' ? ruw.gezien : {}, welkom: Boolean(ruw.welkom), proef: ruw.proef === true, proefWelkom: ruw.proefWelkom === true, echt: ruw.echt === true };
  } catch {
    return { auto: true, gezien: {}, welkom: false, proef: false, proefWelkom: false, echt: false };
  }
}

function schrijfStaat(staat, opslag = globalThis.localStorage) {
  try {
    opslag.setItem(OPSLAGSLEUTEL, JSON.stringify(staat));
  } catch {
    /* localStorage niet beschikbaar: de uitleg is er dan alleen deze keer */
  }
}

export const isAuto = (opslag) => leesStaat(opslag).auto;
export const isGezien = (sleutel, opslag) => Boolean(leesStaat(opslag).gezien[sleutel]);
export function zetAuto(aan, opslag) {
  schrijfStaat({ ...leesStaat(opslag), auto: Boolean(aan) }, opslag);
}
export function markeerGezien(sleutel, opslag) {
  const s = leesStaat(opslag);
  schrijfStaat({ ...s, gezien: { ...s.gezien, [sleutel]: true } }, opslag);
}
export function wisGezien(opslag) {
  schrijfStaat({ ...leesStaat(opslag), gezien: {}, welkom: false }, opslag);
}
export function markeerWelkom(antwoordJa, opslag) {
  schrijfStaat({ ...leesStaat(opslag), welkom: true, auto: Boolean(antwoordJa) }, opslag);
}
// echt: een testvlag die het gedrag van een gewone gebruiker laat zien, ook onder automatisering.
const geautomatiseerd = (s) => typeof navigator !== 'undefined' && navigator.webdriver === true && !s.echt;
// Mag een rondleiding bij een eerste bezoek vanzelf starten? Pas nadat het welkomstkaartje met Ja beantwoord is (of in een test).
export function autoStartToegestaan(opslag) {
  const s = leesStaat(opslag);
  if (!s.auto) return false;
  if (s.proef) return true;
  return AUTO_START && s.welkom && !geautomatiseerd(s);
}
// Moet het welkomstkaartje nog komen? Eén keer per toestel.
export function welkomNodig(opslag) {
  const s = leesStaat(opslag);
  if (s.welkom) return false;
  return s.proefWelkom || (AUTO_START && !geautomatiseerd(s));
}

// ============================================================ acties die een scherm registreert (BESLISSING 183)
// Een stap met voor: 'naam' opent eerst iets (een maaltijdregel, een blad, een voorbeeldrij). Het scherm registreert die functie:
//   const stop = registreerUitleg('vandaag', { openMaaltijd: async ({ kijkstand }) => { ...; return () => { ...sluiten en herstellen... }; } });
// De functie opent het onderdeel in een kijkstand (er wordt niets bewaard of gewijzigd) en geeft een sluitfunctie terug die alles
// herstelt. Zonder registratie slaat de rondleiding de stap over. Geef de stop-functie terug bij het afbreken van het scherm.
const geregistreerd = new Map(); // scherm -> { naam: functie }
export function registreerUitleg(scherm, acties) {
  geregistreerd.set(scherm, acties);
  return () => {
    if (geregistreerd.get(scherm) === acties) geregistreerd.delete(scherm);
  };
}
export function vindActie(naam) {
  for (const acties of geregistreerd.values()) if (typeof acties[naam] === 'function') return acties[naam];
  return null;
}

// ============================================================ pure delen (getest in tests/pwa/uitleg.test.js)

// Alleen de stappen waarvan het onderdeel er is (of die zonder onderdeel midden op het scherm staan).
export function kiesAanwezig(stappen, vindDoel) {
  return stappen.filter((s) => s.midden || Boolean(vindDoel(s)));
}

// De volgorde van een rondleiding: index, vooruit en terug binnen de grenzen, en de naam van de knop.
export function verloop(totaal, begin = 0) {
  let index = Math.min(Math.max(begin, 0), Math.max(totaal - 1, 0));
  return {
    get index() {
      return index;
    },
    get nr() {
      return index + 1;
    },
    get isEerste() {
      return index === 0;
    },
    get isLaatste() {
      return index === totaal - 1;
    },
    volgende() {
      if (index >= totaal - 1) return false;
      index += 1;
      return true;
    },
    vorige() {
      if (index <= 0) return false;
      index -= 1;
      return true;
    },
  };
}

// ============================================================ de uitlichting en het kaartje (BESLISSING 328)
// Eén sluier over het hele venster met een uitsparing (het gat) in de vorm van het onderdeel. Een kaart of knop (een onderdeel met een
// eigen vlak) krijgt een gat precies op zijn rand, met zijn eigen straal; een rij, groep of veld zonder eigen vlak krijgt een gelijke
// marge rondom en de straal plus die marge, zodat de hoeken meelopen. Geen rand, geen ring, geen plaat (258). Een stap kan in
// stappen.js een eigen marge of straal meegeven.
// Het kaartje staat met een vaste afstand en een klein pijltje naast het gat, volgens een vaste voorkeur: onder, boven, rechts, links,
// en als niets past vast onderaan. Op een telefoon staat het altijd vast onderaan boven de tabbalk, of bovenaan als het onderdeel
// onderaan staat (zo verspringt Volgende niet onder de vinger). Van stap naar stap schuiven het gat en het kaartje in één beweging.
export const MAAT = {
  marge: 8, // de ruimte tussen het onderdeel en de rand van het gat
  // BESLISSING 592, de vaste maten op een telefoon (zie "het vak op een telefoon" hieronder):
  margeTelefoon: 12, // de lucht rondom, van de zichtbare inkt tot de rand van het vak, aan alle vier de kanten gelijk
  margeKrap: 6, // past 12 niet (een buur, de ruimte), dan 6 aan alle vier de kanten; nooit ongelijk, nooit afsnijden
  straalTelefoon: 16, // --r-md, de straal van een kaart: elke hoek van elk vak; valt het vak op een kaart, dan haar eigen straal
  afstandTelefoon: 12, // de zichtbare ruimte tussen het vak en de uitlegkaart (de pagina schuift tot het precies 12 px is)
  randGatTelefoon: 12, // minstens zoveel tussen het vak en de vaste kop of de balk onderaan
  zijTelefoon: 8, // minstens zoveel tussen het vak en de zijrand van het scherm
  lijn: 2, // een scheidingslijn (een rand of element van hoogstens 2 px dik, zonder tekst) is geen inkt en geen buur
  afstand: 14, // tussen het gat en het kaartje (het pijltje zit daarin)
  rand: 12, // de kleinste ruimte tussen het kaartje en de rand van het venster, de vaste kop of de tabbalk
  kaartBreed: 360,
  kaartBreedLaag: 560, // op een laag scherm (minder dan 560 px hoog)
  duur: 280,
};

const klem = (x, min, max) => Math.max(min, Math.min(x, max));

// Het gat rond een rechthoek r ({ left, top, width, height }) met de straal van het onderdeel.
export function gatRond(r, { marge = MAAT.marge, straal = 0, eigenStraal = null } = {}) {
  const breed = r.width + 2 * marge;
  const hoog = r.height + 2 * marge;
  const s = eigenStraal ?? straal + marge;
  return { left: r.left - marge, top: r.top - marge, width: breed, height: hoog, straal: Math.max(0, Math.min(s, breed / 2, hoog / 2)) };
}

// Hoeveel moet de pagina schuiven om [boven, onder] binnen [min, max] te krijgen? Zo weinig mogelijk; past het niet, dan bovenaan.
function nodigeSchuif(boven, onder, min, max) {
  if (onder - boven > max - min) return boven - min;
  if (boven < min) return boven - min;
  if (onder > max) return onder - max;
  return 0;
}

// Waar komen het gat en het kaartje? Puur (getest in tests/pwa/uitleg.test.js).
//   gat: het gat in de huidige stand (venstercoördinaten) of null (een stap zonder onderdeel: het kaartje in het midden);
//   kaart: { breed?, hoog } (de hoogte bij de gekozen breedte); venster: { breed, hoog };
//   zone: { top, bottom } het vlak tussen de vaste kop en de tabbalk; gebied: { links, rechts } het inhoudsvlak (rechts van de zijbalk);
//   schuif: { min, max } hoe ver de pagina omhoog (negatief) en omlaag kan; vast: het onderdeel schuift niet mee met de pagina.
// Geeft { schuif, kant, links, boven, breedte, pijl, snij } terug: schuif = hoeveel de pagina moet schuiven, kant = waar het kaartje
// staat ten opzichte van het gat (onder, boven, rechts, links, vast, midden), pijl = de plaats van het pijltje langs de rand van het
// kaartje (null = geen pijltje), snij = de onderkant waarop een te hoog gat wordt afgesneden (null = niet).
//   inKop: het onderdeel staat in de vaste kop (telefoon): de kaart onderaan komt dan precies afstandTelefoon onder het vak (BESLISSING 634).
export function schikking({ gat: heelGat, kaart, venster, zone = null, uiterst = null, gebied = null, voorkeur = null, telefoon = false, schuif = { min: -Infinity, max: Infinity }, vast = false, vrij = null, inKop = false, maat = MAAT }) {
  const { rand, afstand } = maat;
  const z = zone || { top: 0, bottom: venster.hoog };
  const g = gebied || { links: 0, rechts: venster.breed };
  const breedte = telefoon ? venster.breed - 2 * rand : Math.min(kaart.breed || maat.kaartBreed, g.rechts - g.links - 2 * rand);
  const hoog = kaart.hoog;
  const minL = g.links + rand;
  const maxL = Math.max(minL, g.rechts - rand - breedte);
  if (!heelGat) {
    return { schuif: 0, kant: 'midden', links: Math.round(klem((g.links + g.rechts - breedte) / 2, minL, maxL)), boven: Math.round(Math.max(rand, (venster.hoog - hoog) / 2)), breedte, pijl: null, snij: null };
  }
  // Een vast onderdeel (de tabbalk, de zijbalk) mag met zijn marge buiten het venster vallen: alleen het zichtbare deel telt.
  const gat = vast ? { ...heelGat, top: Math.max(0, heelGat.top), height: Math.min(venster.hoog, heelGat.top + heelGat.height) - Math.max(0, heelGat.top) } : heelGat;
  const pas = (d) => (vast ? 0 : klem(d, schuif.min, schuif.max));
  const gatOnder = gat.top + gat.height;
  const midX = gat.left + gat.width / 2;
  const pijlX = (links) => klem(midX - links, 28, breedte - 28);

  // Het vlak waarin een onderdeel mag staan: tussen de vaste kop en de tabbalk; een vast onderdeel (de tabbalk zelf, de kop) mag overal.
  const vrijBoven = vast ? 0 : z.top + rand;
  const vrijOnder = vast ? venster.hoog : z.bottom - rand;

  if (telefoon) {
    // BESLISSING 592: de uitlegkaart staat vast onderaan (boven de balk) of bovenaan (onder de vaste kop), met haar eigen afstand tot de randen;
    // de pagina schuift zo dat tussen het vak en de kaart PRECIES afstandTelefoon (12 px) zichtbaar blijft. Meer alleen als de pagina niet verder
    // kan schuiven of het onderdeel vast staat (de balk, de kop, een blad). Het vak blijft minstens randGatTelefoon van de vaste kop en de balk.
    const af = maat.afstandTelefoon ?? afstand;
    // vrij: het zichtbare deel van een blad dat zelf schuift (BESLISSING 548): daarbinnen blijft het vak, met dezelfde rand.
    const vz = vrij || z;
    const gb = vast ? 0 : vz.top + (maat.randGatTelefoon ?? rand);
    const go = vast ? venster.hoog : vz.bottom - (maat.randGatTelefoon ?? rand);
    const kaartOnder = z.bottom - rand - hoog;
    const kaartBoven = z.top + rand;
    const opties = [
      { kant: 'vast-onder', boven: kaartOnder, min: gb, max: kaartOnder - af },
      { kant: 'vast-boven', boven: kaartBoven, min: kaartBoven + hoog + af, max: go },
    ];
    // BESLISSING 570: past het nergens tussen de kop en de balk, dan mag de kaart over de (gedimde) balk onderaan, nooit over het onderdeel.
    if (uiterst) {
      const kb = uiterst.bottom - rand - hoog;
      opties.push({ kant: 'vast-onder', boven: kb, min: gb, max: kb - af });
    }
    // voorkeur: de kant waar de kaart nu staat (M7: de kaart verspringt niet als het kan).
    if (voorkeur) opties.sort((a, b) => (b.kant === voorkeur) - (a.kant === voorkeur));
    // BESLISSING 750 (K2): past het ook zo niet, dan mag de kaart op een lage telefoon (uiterst.top boven de kop) over de gedimde vaste kop
    // bovenaan; het vak staat er dan onder, tot boven de balk. Altijd na de gewone plaatsen, nooit over het onderdeel.
    if (uiterst && uiterst.top < z.top - 0.5) {
      const kt = uiterst.top + rand;
      opties.push({ kant: 'vast-boven', boven: kt, min: Math.max(kt + hoog + af, gb), max: go });
    }
    const uit = (o, d, snij = null) => ({ schuif: d, kant: o.kant, links: rand, boven: Math.round(o.boven), breedte, pijl: null, snij });
    // Precies op afstand: onderaan sluit de onderrand van het vak op af boven de kaart, bovenaan de bovenrand op af onder de kaart.
    const plaats = (o) => {
      if (gat.height > o.max - o.min + 0.5) return null;
      const d = pas(o.kant === 'vast-onder' ? gatOnder - o.max : gat.top - o.min);
      return gat.top - d >= o.min - 0.5 && gatOnder - d <= o.max + 0.5 ? uit(o, d) : null;
    };
    for (const o of opties) {
      const p = plaats(o);
      // Een onderdeel in de vaste kop (het vraagteken en het huisje van het Dagboek) schuift nooit naar de kaart toe: dan komt de kaart naar het
      // vak, precies af eronder, in plaats van onderaan te blijven (BESLISSING 634). Nooit over de vaste kop zelf (staat het vak hoog in een hoge
      // kop, dan net onder de kop) en niet lager dan haar vaste plaats onderaan.
      if (p && inKop && vast && o.kant === 'vast-onder') return { ...p, boven: Math.round(Math.min(o.boven, Math.max(gatOnder + af, kaartBoven))) };
      if (p) return p;
    }
    // Past een blok dat niet kleiner kan (het glas van Drinken op een heel lage telefoon) ook zo niet, dan liever het hele vak met minder ruimte
    // tot de vaste kop (6, dan 0 px; de schermtest meldt het) dan een afgesneden vak.
    if (!vast) {
      for (const r of [maat.margeKrap ?? 6, 0]) {
        for (const o of opties) {
          const p = o.kant === 'vast-onder' ? plaats({ ...o, min: vz.top + r }) : null;
          if (p) return { ...p, nood: true }; // nood: kiesDoel neemt liever een kleiner doel dat wel past (staatVrij)
        }
      }
    }
    // Te hoog (hoort niet voor te komen: verdeel() maakt er afgeronde delen van): bovenaan, en het gat stopt boven de kaart.
    const o = opties.find((x) => x.kant === 'vast-onder' && x.boven === (uiterst ? uiterst.bottom - rand - hoog : kaartOnder)) || opties.find((x) => x.kant === 'vast-onder');
    return uit(o, pas(gat.top - o.min), o.max);
  }

  // Groot scherm: onder, boven, rechts, links; eerst zonder schuiven, dan met. Het gat moet in het vrije vlak staan, het kaartje in de
  // zone (nooit over de vaste kop of de tabbalk, en met de marge van het venster).
  const kaartMin = Math.max(rand, z.top);
  const kaartMax = z.bottom - rand;
  const kandidaten = [
    { kant: 'onder', blok: [gat.top, gatOnder + afstand + hoog] },
    { kant: 'boven', blok: [gat.top - afstand - hoog, gatOnder] },
    { kant: 'rechts', blok: [gat.top, gatOnder], naast: gat.left + gat.width + afstand + breedte <= g.rechts - rand },
    { kant: 'links', blok: [gat.top, gatOnder], naast: gat.left - afstand - breedte >= g.links + rand },
  ];
  if (voorkeur) kandidaten.sort((a, b) => (b.kant === voorkeur) - (a.kant === voorkeur));
  const kanNaast = (k) => k.naast !== false;
  const kaartVan = (k, d) => (k.kant === 'onder' ? [gatOnder - d + afstand, gatOnder - d + afstand + hoog] : k.kant === 'boven' ? [gat.top - d - afstand - hoog, gat.top - d - afstand] : null);
  const past = (k, d) => {
    if (gat.top - d < vrijBoven - 1 || gatOnder - d > vrijOnder + 1) return false;
    const kr = kaartVan(k, d);
    return !kr || (kr[0] >= kaartMin - 0.5 && kr[1] <= kaartMax + 0.5);
  };
  const plaatsVoor = (k, d) => {
    const top = gat.top - d;
    const onder = gatOnder - d;
    if (k.kant === 'onder' || k.kant === 'boven') {
      const links = klem(midX - breedte / 2, minL, maxL);
      return { schuif: d, kant: k.kant, links: Math.round(links), boven: Math.round(kaartVan(k, d)[0]), breedte, pijl: Math.round(pijlX(links)), snij: null };
    }
    const midY = (Math.max(top, vrijBoven) + Math.min(onder, vrijOnder)) / 2;
    const boven = klem(midY - hoog / 2, kaartMin, kaartMax - hoog);
    const links = k.kant === 'rechts' ? gat.left + gat.width + afstand : gat.left - afstand - breedte;
    return { schuif: d, kant: k.kant, links: Math.round(links), boven: Math.round(boven), breedte, pijl: Math.round(klem(midY - boven, 28, hoog - 28)), snij: null };
  };
  const ruimte = vrijOnder - vrijBoven;
  for (const k of kandidaten) if (kanNaast(k) && past(k, 0)) return plaatsVoor(k, 0);
  for (const k of kandidaten) {
    if (!kanNaast(k)) continue;
    // Naast een onderdeel dat hoger is dan het venster: het onderdeel bovenaan, het kaartje ernaast.
    const teHoog = gatOnder - gat.top > ruimte;
    if (teHoog && (k.kant === 'onder' || k.kant === 'boven')) continue;
    const grenzen = k.kant === 'onder' ? [vrijBoven, Math.min(vrijOnder, kaartMax)] : k.kant === 'boven' ? [Math.max(vrijBoven, kaartMin), vrijOnder] : [vrijBoven, vrijOnder];
    const d = pas(nodigeSchuif(k.blok[0], k.blok[1], grenzen[0], grenzen[1]));
    if (teHoog || past(k, d)) return plaatsVoor(k, d);
  }
  // Past de kaart net niet tussen het onderdeel en de balk onderaan (een laag scherm, een tablet), dan mag ze over die balk, onder of boven
  // het onderdeel: beter dan het onderdeel af te snijden.
  if (uiterst && !vast) {
    const kaartMaxU = uiterst.bottom - rand;
    for (const k of kandidaten.filter((x) => x.kant === 'onder' || x.kant === 'boven')) { // (na de voorkeur kunnen rechts of links vooraan staan)
      const grenzen = k.kant === 'onder' ? [vrijBoven, kaartMaxU] : [Math.max(vrijBoven, kaartMin), vrijOnder];
      const d = pas(nodigeSchuif(k.blok[0], k.blok[1], grenzen[0], grenzen[1]));
      const kr = kaartVan(k, d);
      if (gat.top - d >= vrijBoven - 1 && gatOnder - d <= vrijOnder + 1 && kr[0] >= kaartMin - 0.5 && kr[1] <= kaartMaxU + 0.5) return plaatsVoor(k, d);
    }
    // BESLISSING 750 (K2): op een laag scherm mag de kaart boven het onderdeel ook over de gedimde vaste kop (uiterst.top ligt dan boven de kop).
    if (uiterst.top < z.top - 0.5) {
      const k = kandidaten.find((x) => x.kant === 'boven');
      const kaartMinU = Math.max(rand, uiterst.top + rand);
      const d = pas(nodigeSchuif(k.blok[0], k.blok[1], kaartMinU, vrijOnder));
      const kr = kaartVan(k, d);
      if (gat.top - d >= vrijBoven - 1 && gatOnder - d <= vrijOnder + 1 && kr[0] >= kaartMinU - 0.5 && kr[1] <= kaartMaxU + 0.5) return plaatsVoor(k, d);
    }
  }
  // Niets past: het onderdeel bovenaan, het kaartje vast onderaan het inhoudsvlak, en het gat stopt boven het kaartje.
  const d = pas(gat.top - vrijBoven);
  const boven = (uiterst && !vast ? uiterst.bottom - rand : kaartMax) - hoog;
  const links = klem(midX - breedte / 2, minL, maxL);
  return { schuif: d, kant: 'vast', links: Math.round(links), boven: Math.round(boven), breedte, pijl: Math.round(pijlX(links)), snij: boven - afstand };
}

// ============================================================ onderdelen vinden

function zichtbaar(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.getClientRects().length > 0;
}
export function vindDoel(selector) {
  if (!selector) return null;
  try {
    return [...document.querySelectorAll(selector)].find(zichtbaar) || null;
  } catch {
    return null;
  }
}

// ============================================================ het ZICHTBARE onderdeel (BESLISSING 523)
// Het gat volgt wat je ziet, niet het (soms grotere) tikvlak: { left, top, width, height, straal, vlak }.
//  - een geschilderd vlak (vulling, zichtbare rand of schaduw): zijn rand; met een doorzichtige rand en de vulling alleen binnen die rand
//    (background-clip: padding-box, de ronde knoppen van 36 px in een tikvlak van 48, Dag/Week/Maand van 38 in 48) het vak binnen die rand,
//    en de straal min de rand;
//  - geen eigen vlak, wel een geschilderde ::before of ::after die het grootste deel beslaat (de zwevende balk onderaan, #tabbalk::before):
//    dat vlak, gemeten uit de berekende stijl van de pseudo;
//  - een houder zonder eigen vlak waarvan elk zichtbaar kind een vlak is (een groep knoppen): het omhulsel van die vlakken, met de straal
//    van de kinderen (vlak: false, dus met de marge van een groep); één kind: de vorm van dat kind;
//  - anders (een rij of groep in een kaart): het element zelf, vlak: false.
// Kleuren worden niet ontleed: alleen "doorzichtig of niet" (alfa 0, de browser schrijft die met een laatste getal 0).
const doorzichtig = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
const geschilderd = (s) => !doorzichtig(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && !doorzichtig(s[`border${k}Color`]));
// Alleen geschilderd door een rand aan een of enkele kanten (een rij met een lijn erboven), zonder vulling of schaduw.
const alleenRandStijl = (s) => doorzichtig(s.backgroundColor) && s.backgroundImage === 'none' && s.boxShadow === 'none' && !['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s[`border${k}Width`]) > 0 && !doorzichtig(s[`border${k}Color`])) && geschilderd(s);
function straalVan(s, w, h) {
  const ruw = s.borderTopLeftRadius || '0';
  const n = parseFloat(ruw) || 0;
  return ruw.trim().endsWith('%') ? (n / 100) * Math.min(w, h) : n;
}
// Het vak van een absolute pseudo binnen el (venstercoördinaten), of null als de browser de maten niet geeft.
function pseudoVak(el, r, s, p) {
  const ps = getComputedStyle(el, p);
  if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') return null;
  if (!['absolute', 'fixed'].includes(ps.position) || !geschilderd(ps)) return null;
  const bl = parseFloat(s.borderLeftWidth) || 0;
  const bt = parseFloat(s.borderTopWidth) || 0;
  const binnenB = r.width - bl - (parseFloat(s.borderRightWidth) || 0);
  const binnenH = r.height - bt - (parseFloat(s.borderBottomWidth) || 0);
  const [L, R, T, B, W, H] = ['left', 'right', 'top', 'bottom', 'width', 'height'].map((k) => parseFloat(ps[k]));
  const links = Number.isFinite(L) ? L : Number.isFinite(R) && Number.isFinite(W) ? binnenB - R - W : NaN;
  const boven = Number.isFinite(T) ? T : Number.isFinite(B) && Number.isFinite(H) ? binnenH - B - H : NaN;
  const breed = Number.isFinite(W) ? W : Number.isFinite(L) && Number.isFinite(R) ? binnenB - L - R : NaN;
  const hoog = Number.isFinite(H) ? H : Number.isFinite(T) && Number.isFinite(B) ? binnenH - T - B : NaN;
  if (![links, boven, breed, hoog].every(Number.isFinite) || breed <= 0 || hoog <= 0) return null;
  // Een verschuiving met transform (translate(-50%, -50%) om een rondje op een cijfer te centreren): de browser geeft ze als matrix.
  const m = /^matrix\(([^)]+)\)$/.exec(ps.transform || '');
  const [dx, dy] = m ? m[1].split(',').slice(4).map(parseFloat) : [0, 0];
  return { left: r.left + bl + links + (dx || 0), top: r.top + bt + boven + (dy || 0), width: breed, height: hoog, straal: straalVan(ps, breed, hoog) };
}
// De kinderen zoals je ze ziet: een kind met display: contents tekent zelf niets; zijn kinderen tellen in zijn plaats (de momentkaarten
// van Supplementen op een telefoon, BESLISSING 548).
const kinderenVan = (el) => [...el.children].flatMap((k) => (getComputedStyle(k).display === 'contents' ? kinderenVan(k) : [k]));
export function zichtbaarVlak(el, diep = 0) {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  if (geschilderd(s)) {
    const randen = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(s[`border${k}Width`]) || 0);
    const randWeg = ['Top', 'Right', 'Bottom', 'Left'].every((k, i) => randen[i] === 0 || doorzichtig(s[`border${k}Color`]));
    if (randWeg && s.boxShadow === 'none' && s.backgroundClip === 'padding-box' && randen.some((x) => x > 0)) {
      const [bt, br, bb, bl] = randen;
      return { left: r.left + bl, top: r.top + bt, width: r.width - bl - br, height: r.height - bt - bb, straal: Math.max(0, straalVan(s, r.width, r.height) - Math.max(bt, bl)), vlak: true };
    }
    return { left: r.left, top: r.top, width: r.width, height: r.height, straal: straalVan(s, r.width, r.height), vlak: true };
  }
  for (const p of ['::before', '::after']) {
    const v = pseudoVak(el, r, s, p);
    if (v && v.width * v.height >= 0.4 * r.width * r.height) return { ...v, vlak: true };
  }
  if (diep < 3) {
    const kinderen = kinderenVan(el).filter(zichtbaar).map((k) => zichtbaarVlak(k, diep + 1));
    if (kinderen.length === 1 && kinderen[0].vlak) return kinderen[0];
    if (kinderen.length > 1 && kinderen.every((k) => k.vlak)) {
      const links = Math.min(...kinderen.map((k) => k.left));
      const boven = Math.min(...kinderen.map((k) => k.top));
      return { left: links, top: boven, width: Math.max(...kinderen.map((k) => k.left + k.width)) - links, height: Math.max(...kinderen.map((k) => k.top + k.height)) - boven, straal: Math.max(...kinderen.map((k) => k.straal)), vlak: false };
    }
  }
  return { left: r.left, top: r.top, width: r.width, height: r.height, straal: straalVan(s, r.width, r.height), vlak: false };
}

// Staat het onderdeel vast op het scherm (de tabbalk, de zijbalk, de vaste kop, een open blad)? Dan schuift het niet mee met de pagina.
function staatVast(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const p = getComputedStyle(e).position;
    if (p === 'fixed' || p === 'sticky' || (e.tagName === 'DIALOG' && e.open)) return true;
  }
  return false;
}

// ============================================================ afgeronde vakken (BESLISSINGEN 548 en 570)
// Het vak is altijd een afgerond geheel: een hele kaart met haar kop, of een blok dat in de opmaak een eigen blok is (een rij, een groep
// knoppen). Drie regels, op elk formaat:
//  1. geen zichtbaar element (tekst, icoon, beeld, knop, geschilderd vlak) wordt door een rand van het vak doorsneden. De marge rond een
//     groep wijkt voor een buur (afgerond: zijden); snijdt het doel zelf iets door (een omhulsel over iets heen), dan groeit het doel tot het
//     kleinste blok eromheen dat niets doorsnijdt (groei);
//  2. de kop hoort bij de kaart: is het doel alles van een kaart behalve haar kop, dan is het doel de hele kaart (maakHeel);
//  3. past het blok op een telefoon niet naast de uitlegkaart, dan wordt de stap verdeeld in afgeronde delen: de rijen van het blok, zoveel
//     als er samen passen (delenVan; de teksten: STUKKEN in stappen.js).
const VASTE_HOUDERS = metDemo('.schermkop, .dagboek__kop, .vandaag__begroeting, #tabbalk, #zijbalk');
const KOPACHTIG = '.kaartkop, header, h1, h2, h3, h4, .label, .kalender__kop';
const EENHEID_TAGS = new Set(['img', 'svg', 'canvas', 'input', 'textarea', 'select', 'video', 'button']);
const TOL = 2.5; // zoveel mag een element over de rand van het vak steken zonder dat het "doorsneden" heet (een rand van 1 of 2 px)
const rh = (r) => ({ l: r.left, t: r.top, r: r.left + r.width, b: r.top + r.height });
const isLaag = () => window.innerHeight < 700; // BESLISSING 570: een lage telefoon (zichtbare hoogte onder 700 px)
// BESLISSING 750 (K2): onder 600 px zichtbare hoogte mag de uitlegkaart ook over de gedimde vaste kop bovenaan, zoals over de balk onderaan (570).
export const KOP_VRIJ_ONDER = 600;
const magOverKop = () => window.innerHeight < KOP_VRIJ_ONDER;
const kleinScherm = () => isKleinScherm({ breed: window.innerWidth, hoog: window.innerHeight });

// Het zichtbare vlak van een of meer elementen samen ({ left, top, width, height, straal, vlak }).
function omhulsel(els) {
  const v = els.map((e) => zichtbaarVlak(e));
  if (v.length === 1) return v[0];
  const l = Math.min(...v.map((x) => x.left));
  const t = Math.min(...v.map((x) => x.top));
  return { left: l, top: t, width: Math.max(...v.map((x) => x.left + x.width)) - l, height: Math.max(...v.map((x) => x.top + x.height)) - t, straal: Math.max(...v.map((x) => x.straal)), vlak: false };
}
function zichtbaarVoorOog(e, s) {
  if (s.visibility === 'hidden' || s.display === 'contents') return false;
  if (typeof e.checkVisibility === 'function') return e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  return parseFloat(s.opacity) > 0;
}
// Een element in iets dat vast op het scherm ligt (position fixed of sticky: de balken, een melding onderaan, een plakkende kop) of in een open blad.
function vasteOuder(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.tagName === 'DIALOG' && e.open) return e;
    const p = getComputedStyle(e).position;
    if (p === 'fixed' || p === 'sticky') return e;
  }
  return null;
}
// Waar de buren van een doel staan: in zijn blad of vaste balk, anders in het scherm. Wat vast over de pagina ligt (een balk, een melding), telt
// voor een doel in de pagina niet mee: dat schuift niet mee en hoort niet bij het blok.
// (Een element dat zelf plakt, zoals de knoppen Rondleiding en Delen in de kop van Vandaag: zijn buren staan in de vaste kop eromheen.)
const houderVan = (el) => {
  const vast = vasteOuder(el);
  if (vast && vast.tagName !== 'DIALOG' && telefoon()) return el.closest(VASTE_HOUDERS) || vast.parentElement || vast;
  return el.closest('dialog[open]') || vast || document.getElementById('scherm') || document.body;
};
// De zichtbare eenheden in een houder die vak v raken: { e, R }. Een eenheid is een element met eigen tekst, een beeld, icoon, veld of knop
// (wat in een knop staat, telt als de knop), of een geschilderd vlak. telt(e) sluit het doel zelf, zijn voorouders en de vaste balken uit.
// metZelf: ook de houder zelf telt (de inhoud van een blok: zijn eigen tekst of vlak hoort erbij).
// BESLISSING 592, op een telefoon: wat je echt ziet. Een element dat alleen door een rand aan één of enkele kanten geschilderd is (een rij met een
// lijn erboven), telt met die randen, niet met zijn hele vak; een scheidingslijn (hoogstens MAAT.lijn dik, zonder tekst) is geen inkt en geen buur.
// metLijn: de scheidingslijnen blijven erin, met lijn: true (inktVan: een lijn binnen een blok hoort bij zijn breedte).
function eenheden(houder, v, telt, metZelf = false, metLijn = false, anker = null) {
  const lijst = eenhedenRuw(houder, v, telt, metZelf);
  if (!telefoon()) return lijst;
  const uit = [];
  for (const u of lijst) {
    const s = u.pseudo ? null : getComputedStyle(u.e);
    const alleenRand = s && !u.tekst && alleenRandStijl(s);
    const delen = [];
    // een vulling alleen binnen een doorzichtige rand (de ronde knoppen van 36 px in een tikvlak van 48): het vak binnen die rand
    const doorzRand = s && ['Top', 'Right', 'Bottom', 'Left'].map((k) => (doorzichtig(s[`border${k}Color`]) ? parseFloat(s[`border${k}Width`]) || 0 : 0));
    if (s && !u.tekst && !alleenRand && geschilderd(s) && s.backgroundClip === 'padding-box' && s.boxShadow === 'none' && doorzRand.some((x) => x > 0)) {
      const [bt, br, bb, bl] = doorzRand;
      delen.push({ l: u.R.l + bl, t: u.R.t + bt, r: u.R.r - br, b: u.R.b - bb });
    } else if (alleenRand) {
      const r = u.e.getBoundingClientRect();
      const w = (k) => (!doorzichtig(s[`border${k}Color`]) ? parseFloat(s[`border${k}Width`]) || 0 : 0);
      if (w('Top')) delen.push({ l: r.left, t: r.top, r: r.right, b: r.top + w('Top') });
      if (w('Bottom')) delen.push({ l: r.left, t: r.bottom - w('Bottom'), r: r.right, b: r.bottom });
      if (w('Left')) delen.push({ l: r.left, t: r.top, r: r.left + w('Left'), b: r.bottom });
      if (w('Right')) delen.push({ l: r.right - w('Right'), t: r.top, r: r.right, b: r.bottom });
      // de eigen tekst van zo'n element blijft gewoon tekst
      if ([...u.e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
        const rg = document.createRange();
        rg.selectNodeContents(u.e);
        const t = rg.getBoundingClientRect();
        if (t.width > 0 && t.height > 0) uit.push({ ...u, R: rh(t), tekst: true });
      }
    } else delen.push(u.R);
    for (const R0 of delen) {
      // wat een ouder afknipt (een regel "Aan de beurt" die in een smalle rij op een tweede regel valt, maar niet te zien is), telt niet
      const R = afgeknipt(u.e, R0, anker);
      if (R.r - R.l <= 0.5 || R.b - R.t <= 0.5) continue;
      const lijn = !u.tekst && Math.min(R.r - R.l, R.b - R.t) <= MAAT.lijn + 0.01;
      if (!lijn || metLijn) uit.push({ ...u, R, lijn });
    }
  }
  return uit;
}
// R binnen wat de ouders van e met overflow: hidden of clip afknippen (tot en met een open blad). Een houder die schuift (auto, scroll) knipt hier
// niet: wat daarin buiten beeld valt, komt bij het schuiven weer in beeld (schoneSchuif rekent daarmee).
// anker: het doel. Een houder die schuift maar het doel NIET bevat (de romp van een blad boven zijn voet met Bewaren), knipt wel: wat daarin
// buiten beeld valt, blijft ook bij het schuiven buiten het vak rond het doel (het schuift alleen binnen die houder).
function afgeknipt(e, R, anker = null) {
  let r = { ...R };
  for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
    const s = getComputedStyle(x);
    const schuiftApart = anker && /auto|scroll/.test(s.overflowX + ' ' + s.overflowY) && !x.contains(anker);
    if (/hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY) || schuiftApart) {
      const q = x.getBoundingClientRect();
      r = { l: Math.max(r.l, q.left), t: Math.max(r.t, q.top), r: Math.min(r.r, q.right), b: Math.min(r.b, q.bottom) };
    }
    if (x.tagName === 'DIALOG') break;
  }
  return r;
}
function eenhedenRuw(houder, v, telt, metZelf = false) {
  const uit = [];
  for (const e of metZelf ? [houder, ...houder.querySelectorAll('*')] : houder.querySelectorAll('*')) {
    const tag = e.tagName.toLowerCase();
    if (tag !== 'svg' && e.closest('svg')) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.right <= v.l || r.left >= v.r || r.bottom <= v.t || r.top >= v.b) continue;
    // Een knop met een eigen vlak telt als één geheel; van een knop zonder vlak (een tekstknop) tellen zijn tekst en icoon.
    // Op een telefoon is een knop die alleen een lijn heeft (een rij met een lijn erboven: Delen, Algemeen, Instellingen) geen vlak: eenheden()
    // houdt van hem alleen die lijn over, dus tellen zijn tekst en icoon zelf (zoals in de schermtest, T3). Anders viel de inhoud van zo'n rij
    // weg uit de inkt van een blok en werd het vak afgesneden boven de eerste rij met een lijn (Delen, Wat erin komt: 88 px in plaats van 264).
    const knop = e.parentElement?.closest('button');
    const ks = knop ? getComputedStyle(knop) : null;
    // (Voorlopig alleen voor afvinkrijen, role="checkbox": op Meer liet het herstel de stap Rondleiding verdelen in een deel zonder eigen tekst.)
    if ((ks && geschilderd(ks) && !(telefoon() && alleenRandStijl(ks) && knop.getAttribute('role') === 'checkbox')) || e.closest('.uitleg, .uitleg__ruimte') || !telt(e)) continue;
    const eigenTekst = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const s = getComputedStyle(e);
    if (!zichtbaarVoorOog(e, s)) continue;
    // Een geschilderde ::before of ::after (het rondje van vandaag op het cijfer) is ook iets wat je ziet.
    for (const p of ['::before', '::after']) {
      const pv = pseudoVak(e, r, s, p);
      if (pv) uit.push({ e, R: rh(pv), pseudo: p });
    }
    const vlak = geschilderd(s);
    if (!((EENHEID_TAGS.has(tag) && (tag !== 'button' || vlak)) || eigenTekst || vlak)) continue;
    let R = rh(r);
    // Een knop zonder eigen vlak (een tekstknop, zoals de naam in het schema van Supplementen, met padding en een negatieve marge als tikvlak):
    // zijn tekst en icoon tellen, niet zijn hele vak met de lege binnenruimte erbij.
    const tekstknop = tag === 'button' && !vlak;
    if (eigenTekst && !vlak && (!EENHEID_TAGS.has(tag) || tekstknop)) {
      const rg = document.createRange();
      rg.selectNodeContents(e);
      const t = rg.getBoundingClientRect();
      // Tekst die afgekapt wordt (overflow: hidden, een regelgrens): alleen het zichtbare deel binnen het element telt.
      if (t.width > 0 && t.height > 0) R = s.overflow === 'visible' ? rh(t) : { l: Math.max(t.left, r.left), t: Math.max(t.top, r.top), r: Math.min(t.right, r.right), b: Math.min(t.bottom, r.bottom) };
    }
    uit.push({ e, R, tekst: eigenTekst && !vlak && (!EENHEID_TAGS.has(tag) || tekstknop) });
  }
  return uit;
}
const raakt = (els, e) => els.some((x) => x === e || x.contains(e) || e.contains(x));
// Het zichtbare omhulsel van elementen: hun vak en alles wat erin getekend staat, ook wat eruit steekt (de tekens onder een dag, een rondje).
function zichtOmhulsel(els) {
  let u = null;
  const neem = (R) => (u = u ? { l: Math.min(u.l, R.l), t: Math.min(u.t, R.t), r: Math.max(u.r, R.r), b: Math.max(u.b, R.b) } : { ...R });
  // BESLISSING 592: op een telefoon telt alleen de inkt (geen scheidingslijn, geen lege binnenruimte), zoals het vak zelf.
  if (telefoon()) {
    for (const x of els) neem(inktVan([x]) || rh(zichtbaarVlak(x)));
    return u;
  }
  for (const x of els) {
    neem(rh(zichtbaarVlak(x)));
    for (const { R } of eenheden(x, { l: -1e6, t: -1e6, r: 1e6, b: 1e6 }, () => true, true)) neem(R);
  }
  return u;
}
// Regel 1: snijdt het vak rond els (met marge) iets door? Geeft { heel, zijden, snij }: zijden = de marge per kant, ingekort waar een buur in de
// marge staat; snij = de elementen die het doel zelf doorsnijdt.
function afgerond(els, marge) {
  if (telefoon() && marge > 0) return afgerondTelefoon(els, marge);
  const basis = rh(omhulsel(els));
  // Een blok zonder eigen vlak (een rij, een groep): het vak volgt zijn INHOUD, met een gelijke marge eromheen (BESLISSING 590). Wat zichtbaar
  // uit het blok steekt (de linten onder een medaille), hoort erbij; lege binnenruimte niet.
  let kern = { ...basis };
  if (marge > 0) {
    let inhoud = null;
    for (const x of els) {
      const knip = getComputedStyle(x).overflow !== 'visible';
      const xr = rh(x.getBoundingClientRect());
      for (const { R: R0 } of eenheden(x, { l: -1e6, t: -1e6, r: 1e6, b: 1e6 }, () => true, true)) {
        const R = knip ? { l: Math.max(R0.l, xr.l), t: Math.max(R0.t, xr.t), r: Math.min(R0.r, xr.r), b: Math.min(R0.b, xr.b) } : R0;
        if (R.r <= R.l || R.b <= R.t) continue;
        inhoud = inhoud ? { l: Math.min(inhoud.l, R.l), t: Math.min(inhoud.t, R.t), r: Math.max(inhoud.r, R.r), b: Math.max(inhoud.b, R.b) } : { ...R };
      }
    }
    if (inhoud) kern = inhoud;
  }
  const v = { l: kern.l - marge, t: kern.t - marge, r: kern.r + marge, b: kern.b + marge };
  const inVast = Boolean(vasteOuder(els[0]));
  const telt = (e) => !raakt(els, e) && (inVast || (!e.closest(VASTE_HOUDERS) && !vasteOuder(e)));
  const zijden = { t: marge, r: marge, b: marge, l: marge };
  const snij = [];
  for (const { e, R } of eenheden(houderVan(els[0]), v, telt)) {
    if (R.l >= kern.l - TOL && R.r <= kern.r + TOL && R.t >= kern.t - TOL && R.b <= kern.b + TOL) continue; // ligt binnen het vak
    if (telefoon() && R.l <= kern.l + TOL && R.r >= kern.r - TOL && R.t <= kern.t + TOL && R.b >= kern.b - TOL) continue; // een vlak erachter (de band van de kop)
    const ox = Math.min(R.r, kern.r) - Math.max(R.l, kern.l);
    const oy = Math.min(R.b, kern.b) - Math.max(R.t, kern.t);
    if (ox > TOL && oy > TOL) {
      snij.push(e);
      continue;
    }
    if (R.b <= kern.t + TOL) zijden.t = Math.min(zijden.t, Math.max(0, kern.t - R.b));
    else if (R.t >= kern.b - TOL) zijden.b = Math.min(zijden.b, Math.max(0, R.t - kern.b));
    else if (R.r <= kern.l + TOL) zijden.l = Math.min(zijden.l, Math.max(0, kern.l - R.r));
    else if (R.l >= kern.r - TOL) zijden.r = Math.min(zijden.r, Math.max(0, R.l - kern.r));
  }
  // Op een telefoon blijft het vak minstens 8 px van de schermrand (BESLISSING 590).
  if (telefoon() && marge > 0) {
    zijden.l = Math.min(zijden.l, Math.max(0, kern.l - 8));
    zijden.r = Math.min(zijden.r, Math.max(0, window.innerWidth - 8 - kern.r));
  }
  // Gelijk rondom: links zoveel lucht als rechts en boven zoveel als onder, gemeten vanaf de inhoud. Moet een kant wijken (een buur, de
  // schermrand), dan wijkt de overkant evenveel mee.
  if (marge > 0) {
    zijden.l = zijden.r = Math.min(zijden.l, zijden.r);
    zijden.t = zijden.b = Math.min(zijden.t, zijden.b);
  }
  // De marge per kant, gerekend vanaf het zichtbare vlak van het doel (meetGat): kan negatief zijn als het blok lege binnenruimte heeft.
  const uit = { t: basis.t - (kern.t - zijden.t), r: kern.r + zijden.r - basis.r, b: kern.b + zijden.b - basis.b, l: basis.l - (kern.l - zijden.l) };
  return { heel: snij.length === 0, zijden: uit, snij, lucht: Math.min(zijden.t, zijden.r, zijden.b, zijden.l) };
}
// ============================================================ het vak op een telefoon (BESLISSING 592)
// Eén regel voor elk vak dat niet op de rand van een kaart valt: het vak is de zichtbare INKT van het blok (tekst, icoon, beeld, veld, tegel met haar
// vlak; geen scheidingslijn en geen lege binnenruimte) met aan alle vier de kanten dezelfde lucht: 12 px, of 6 px als 12 niet past. Een hoek is
// altijd 16 px rond (meetGat). De lucht past als:
//   - het vak minstens MAAT.zijTelefoon (8 px) van de zijranden van het scherm blijft;
//   - geen buur in de lucht staat (anders snijdt de rand hem door: dan groeit het blok, groei);
//   - wat van dezelfde kaart naast het blok staat, minstens lucht + afstandTelefoon van de inkt ligt: dan staat het ofwel helemaal achter de
//     uitlegkaart (die precies 12 px van het vak staat), ofwel helemaal te zien op minstens 12 px van het vak (M5). Lukt dat met 6 px niet, dan
//     blijft 6 px en lost de plaatsing het op waar ze kan (schoneSchuif); verdeel() deelt een kaart nooit op zo'n krappe plek (delenVan).
// Geeft hetzelfde als afgerond: { heel, zijden (vanaf het zichtbare vlak van els), snij, lucht }.
// zonderKop: zonder koppen en labels (KOPACHTIG): de inhoud eronder, om te zien of die in haar blok gecentreerd staat.
function inktVan(els, zonderKop = false) {
  let inhoud = null;
  const lijnen = [];
  const neem = (R) => (inhoud = inhoud ? { l: Math.min(inhoud.l, R.l), t: Math.min(inhoud.t, R.t), r: Math.max(inhoud.r, R.r), b: Math.max(inhoud.b, R.b) } : { ...R });
  for (const x of els) {
    const knip = getComputedStyle(x).overflow !== 'visible';
    const xr = rh(x.getBoundingClientRect());
    for (const { e, R: R0, lijn } of eenheden(x, { l: -1e6, t: -1e6, r: 1e6, b: 1e6 }, (u) => !zonderKop || !u.closest(KOPACHTIG), true, true)) {
      const R = knip ? { l: Math.max(R0.l, xr.l), t: Math.max(R0.t, xr.t), r: Math.min(R0.r, xr.r), b: Math.min(R0.b, xr.b) } : R0;
      if (R.r <= R.l || R.b <= R.t) continue;
      if (lijn) lijnen.push(R);
      else neem(R);
    }
  }
  // Een scheidingslijn BINNEN het blok (de lijn onder de kop van een kaart, tussen twee rijen) hoort bij zijn breedte: anders snijdt de zijrand
  // van het vak haar door. Een lijn op de buitenrand van het blok (de lijn boven een rij) niet.
  if (inhoud) {
    const k = { ...inhoud };
    for (const R of lijnen) {
      const liggend = R.b - R.t <= R.r - R.l;
      if (liggend ? R.t > k.t + 0.5 && R.b < k.b - 0.5 : R.l > k.l + 0.5 && R.r < k.r - 0.5) neem(R);
    }
  }
  return inhoud;
}
// De kaart waartoe een element hoort: een .kaart, een open blad, of anders de eerste ouder met een eigen vulling die niet vast staat.
function kaartVan(el) {
  // In een blad is de "kaart" de rij of het veld waarin het onderdeel staat: de eerste ouder die over de volle breedte van zijn houder loopt,
  // in een houder met minstens drie zichtbare blokken onder elkaar (het uur, de tekst, de keuzes, het gevoel, de knoppen).
  const blad = el.closest('dialog[open]');
  if (blad && !el.closest('.kaart')) {
    for (let e = el; e && e !== blad; e = e.parentElement) {
      const ouder = e.parentElement;
      if (!ouder || ouder === blad) break;
      const kinderen = kinderenVan(ouder).filter(zichtbaar);
      if (kinderen.length >= 3 && e.getBoundingClientRect().width >= 0.9 * ouder.getBoundingClientRect().width) return e;
    }
    return blad;
  }
  const k = el.closest(`.kaart, dialog[open], ${VASTE_HOUDERS}`);
  if (k) return k;
  for (let e = el.parentElement; e && !e.matches('#scherm, #app, body'); e = e.parentElement) {
    const s = getComputedStyle(e);
    if (!doorzichtig(s.backgroundColor) && s.position !== 'fixed' && s.position !== 'sticky') return e;
  }
  return null;
}
// De ruimte tussen de inkt van een blok en zijn buren: { snij (doorsneden), buur (de dichtste buur), kaart (de dichtste buur van dezelfde kaart) }.
// uitsluit: de rijen aan de overkant van een snede in een raster (BESLISSING 656): die staan met opzet zo dicht en tellen niet als buur.
function burenVan(els, kern, uitsluit = []) {
  const inVast = Boolean(vasteOuder(els[0]));
  const telt = (e) => !raakt(els, e) && !raakt(uitsluit, e) && (inVast || (!e.closest(VASTE_HOUDERS) && !vasteOuder(e)));
  const kaart = kaartVan(els[0]);
  const rond = MAAT.margeTelefoon + MAAT.afstandTelefoon + 2;
  const uit = { snij: [], buur: Infinity, kaart: Infinity };
  for (const { e, R } of eenheden(houderVan(els[0]), { l: kern.l - rond, t: kern.t - rond, r: kern.r + rond, b: kern.b + rond }, telt, false, false, els[0])) {
    if (R.l >= kern.l - TOL && R.r <= kern.r + TOL && R.t >= kern.t - TOL && R.b <= kern.b + TOL) continue; // ligt binnen het vak
    if (R.l <= kern.l + TOL && R.r >= kern.r - TOL && R.t <= kern.t + TOL && R.b >= kern.b - TOL) continue; // een vlak erachter (de band van de kop)
    const ox = Math.min(R.r, kern.r) - Math.max(R.l, kern.l);
    const oy = Math.min(R.b, kern.b) - Math.max(R.t, kern.t);
    if (ox > TOL && oy > TOL) {
      uit.snij.push(e);
      continue;
    }
    const afstand = Math.max(kern.t - R.b, R.t - kern.b, kern.l - R.r, R.l - kern.r);
    uit.buur = Math.min(uit.buur, afstand);
    (uit.lijst ||= []).push({ e, afstand });
    if (kaart && kaart.contains(e)) uit.kaart = Math.min(uit.kaart, afstand);
  }
  return uit;
}
function afgerondTelefoon(els, marge) {
  const basis = rh(omhulsel(els));
  let kern = inktVan(els) || { ...basis };
  // Staat de inhoud (zonder kop of label) in haar blok gecentreerd, zoals het raster van de dranken, dan staat het vak symmetrisch rond dat midden:
  // links en rechts evenveel ruimte tot de inhoud, ook als een label links tot de rand loopt (melding van de eigenaar, BESLISSING 592).
  const romp = inktVan(els, true);
  if (romp) {
    const doos = els.map((x) => rh(x.getBoundingClientRect())).reduce((a, r) => ({ l: Math.min(a.l, r.l), r: Math.max(a.r, r.r) }), { l: 1e9, r: -1e9 });
    const links = romp.l - doos.l;
    const rechts = doos.r - romp.r;
    if (links > 2 && Math.abs(links - rechts) <= 2) {
      const midden = (romp.l + romp.r) / 2;
      const half = Math.max(midden - kern.l, kern.r - midden);
      kern = { ...kern, l: midden - half, r: midden + half };
    }
  }
  // BESLISSING 656: een deel van een raster (de weken van de maandkalender) heeft aan een snede de lucht die er is: de helft van de ruimte tot
  // de rij aan de overkant. Die rij telt niet als buur; aan de andere kanten blijft de gewone regel.
  const rl = rasterLucht(els, kern);
  const b = burenVan(els, kern, rl ? [...(els.raster.boven ?? []), ...(els.raster.onder ?? [])] : []);
  const zij = Math.min(kern.l, window.innerWidth - kern.r) - MAAT.zijTelefoon;
  const keuzes = marge >= MAAT.margeTelefoon ? [MAAT.margeTelefoon, MAAT.margeKrap] : [MAAT.margeKrap];
  const kan = (L) => L <= zij + 0.01 && L <= b.buur + 0.01;
  // Lukt het ook met 6 px niet (de opmaak zet een buur te dicht), dan 6 px: zo blijft er zoveel mogelijk ruimte tussen het vak en die buur.
  const lucht = keuzes.find((L) => kan(L) && b.kaart >= L + MAAT.afstandTelefoon - 0.5) ?? MAAT.margeKrap;
  // Een buur die ook in 6 px lucht staat, wordt door de rand doorsneden: het blok moet groeien.
  const snij = [...b.snij];
  for (const { e, afstand } of b.lijst || []) if (afstand < lucht - 0.01 && !snij.includes(e)) snij.push(e);
  const zijden = { t: basis.t - (kern.t - (rl?.t ?? lucht)), r: kern.r + lucht - basis.r, b: kern.b + (rl?.b ?? lucht) - basis.b, l: basis.l - (kern.l - lucht) };
  return { heel: snij.length === 0, zijden, snij, lucht, krapBuur: b.kaart < lucht + MAAT.afstandTelefoon - 0.5 };
}
// BESLISSING 656: de lucht aan de sneden van een deel van een raster ({ t, b }: de helft van de ruimte tussen de inkt van het deel en die van de
// rij aan de overkant; null aan een kant zonder snede), of null als het deel geen raster snijdt (delenTelefoon zet els.raster).
function rasterLucht(els, kern) {
  const r = els.raster;
  if (!r || !kern) return null;
  return { t: r.boven ? Math.max(0, (kern.t - zichtOmhulsel(r.boven).b) / 2) : null, b: r.onder ? Math.max(0, (zichtOmhulsel(r.onder).t - kern.b) / 2) : null };
}
// BESLISSING 656: een raster van gelijke rijen (de weken van de maandkalender): minstens drie rijen na elkaar, elk één element in dezelfde ouder,
// even hoog en met dezelfde smalle tussenruimte (kleiner dan margeKrap). Tussen twee rijen van zo'n raster mag de snede van een deel vallen, in het
// midden van de tussenruimte (rij.rasterVoor = true op de tweede rij). Elk ander blok houdt de regel van 592: rijen die minder dan 6 px uit elkaar
// staan, blijven samen.
// (Een rij die rijenVan in haar kinderen verdeelde, omdat ze alleen al hoger is dan de ruimte, telt als het element waarin die kinderen staan:
// een week blijft een week.)
function markeerRaster(rijen) {
  const rijEl = (rij) => (rij.length === 1 ? rij[0] : rij.every((e) => e.parentElement === rij[0].parentElement) ? rij[0].parentElement : null);
  const doos = (rij) => rijEl(rij)?.getBoundingClientRect() ?? null;
  let i = 0;
  while (i < rijen.length) {
    const a = doos(rijen[i]);
    let j = i + 1;
    let tussen = null;
    while (a && j < rijen.length) {
      const b = doos(rijen[j]);
      const vorige = doos(rijen[j - 1]);
      if (!b || rijEl(rijen[j]).parentElement !== rijEl(rijen[i]).parentElement || Math.abs(b.height - a.height) > 1) break;
      const g = b.top - vorige.bottom;
      if (g < 1 || g >= MAAT.margeKrap + 0.5 || (tussen != null && Math.abs(g - tussen) > 1)) break;
      tussen ??= g;
      j++;
    }
    if (j - i >= 3) {
      for (let k = i + 1; k < j; k++) rijen[k].rasterVoor = true;
      // De kop van het raster (de weekdagen) staat met dezelfde tussenruimte boven de eerste rij: die hoort bij het eerste deel.
      const kop = i > 0 ? doos(rijen[i - 1]) : null;
      if (kop && rijEl(rijen[i - 1]).parentElement === rijEl(rijen[i]).parentElement && Math.abs(a.top - kop.bottom - tussen) <= 1) rijen[i].rasterKop = true;
      i = j;
    } else i += 1;
  }
}
// Regel 2: de kop hoort bij de kaart.
function isKopVan(kaart, e) {
  const k = e.closest(KOPACHTIG);
  return Boolean(k && kaart.contains(k) && (k.parentElement === kaart || k.closest('.kaartkop')));
}
function maakHeel(els) {
  const kaart = els[0].closest('.kaart');
  if (!kaart || els.includes(kaart) || !els.every((e) => kaart.contains(e))) return els;
  const kern = rh(omhulsel(els));
  const telt = (e) => !raakt(els, e) && !isKopVan(kaart, e);
  const rest = eenheden(kaart, rh(kaart.getBoundingClientRect()), telt).filter(({ R }) => !(R.l >= kern.l - TOL && R.r <= kern.r + TOL && R.t >= kern.t - TOL && R.b <= kern.b + TOL));
  return rest.length ? els : [kaart];
}
// BESLISSING 627: de rondleiding licht altijd de hele kaart met haar kop op. Is het blok een DEEL van een kaart (het neemt, met de lucht rondom,
// meer dan de helft van haar hoogte in) terwijl haar kop erbuiten valt, dan is het vak de hele kaart. Past die op een telefoon niet naast de
// uitlegkaart, dan verdeelt verdeel() ze in echte blokken (de kop hoort bij het eerste deel). Een klein onderdeel in een kaart (een knop, een
// veld, een rij) blijft zichzelf; een onderdeel in een vaste balk of kop (de knoppen in de schermkop) ook.
// De kaart en haar kop zoals de schermtest ze ziet (x-uitleg-meting.js, meetStreng): de eerste ouder met een eigen vlak of de klasse van een kaart.
const KAARTKOP = ':scope > .kaartkop, :scope > header, :scope > h2, :scope > h3, :scope > [class*="__kop"]';
function kaartRond(els) {
  let a = els[0];
  while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
  for (let e = a; e && !e.matches('dialog, #scherm, #app, body'); e = e.parentElement) {
    const s = getComputedStyle(e);
    if (s.position === 'fixed' || s.position === 'sticky') return null;
    if (e.matches('.kaart, [class*="kaart"]:not([class*="__"])') || geschilderd(s)) return e;
  }
  return null;
}
function metKop(els) {
  const kaart = kaartRond(els);
  if (!kaart || els.includes(kaart)) return els;
  const kop = [...kaart.querySelectorAll(KAARTKOP)].find(zichtbaar);
  if (!kop || els.some((e) => e === kop || e.contains(kop) || kop.contains(e))) return els;
  const k = kaart.getBoundingClientRect();
  const v = omhulsel(els);
  const m = telefoon() ? MAAT.margeTelefoon : MAAT.marge;
  const deel = Math.max(0, Math.min(k.bottom, v.top + v.height + m) - Math.max(k.top, v.top - m));
  if (deel <= 0.5 * k.height) return els;
  // Alleen als de hele kaart in beeld past: op een telefoon samen met de uitlegkaart erboven of eronder; op een groter scherm in het vrije vlak
  // (de uitlegkaart kan er dan naast). Past ze niet, dan blijft het doel zoals het was (de uitlegkaart naast een te hoog vak, BESLISSING 652,
  // en de delen met eigen tekst op een telefoon komen in een volgende sprint).
  const balk = balkBoven();
  const vrij = (balk ?? window.innerHeight) - kopOnder() - 2 * MAAT.rand;
  const uitleg = document.querySelector('.uitleg__kaart[role="dialog"]')?.offsetHeight ?? 0;
  const nodig = telefoon() ? k.height + uitleg + MAAT.afstandTelefoon + MAAT.randGatTelefoon : k.height;
  return nodig <= vrij + 0.5 ? [kaart] : els;
}
// Is blok b een deel van de kaart van het gewone doel (een hele kaart met een kop, zoals metKop ze maakt) zonder haar kop? Zo'n kleiner doel
// (stappen.js, klein) toont de kaart zonder kop: op een telefoon wordt de kaart dan verdeeld (de kop in het eerste deel), niet zo getoond.
function zonderKopVan(gewoon, b) {
  if (!gewoon || gewoon.els.length !== 1) return false;
  const kaart = gewoon.els[0];
  const kop = [...kaart.querySelectorAll(KAARTKOP)].find(zichtbaar);
  if (!kop || b.els.includes(kaart)) return false;
  // (een blok in een eigen kaart binnen die kaart, zoals het verslag in de kaart Je verslag, met zijn eigen kop: dat is geen deel zonder kop)
  return kaartRond(b.els) === kaart && b.els.every((e) => kaart.contains(e)) && !b.els.some((e) => e === kop || e.contains(kop) || kop.contains(e));
}
// Regel 1, het doel snijdt iets door: het kleinste blok eromheen dat niets doorsnijdt (hoogstens tot de kaart of het blad).
function groei(els, marge) {
  let nu = els;
  let a = afgerond(nu, marge);
  for (let i = 0; i < 6 && !a.heel; i++) {
    let ouder = nu[0].parentElement;
    while (ouder && !nu.every((e) => ouder.contains(e))) ouder = ouder.parentElement;
    if (!ouder || ouder.matches('#scherm, #app, body, dialog')) break;
    nu = metKop(maakHeel([ouder]));
    a = afgerond(nu, telefoon() ? margeVoor({ krap: marge > 0 && marge < MAAT.margeTelefoon }, nu) : zonderLucht(nu) ? 0 : marge);
    if (nu[0].matches('.kaart')) break;
  }
  return { els: nu, ...a };
}
// BESLISSING 592: op een telefoon valt het vak alleen op de rand van een KAART (een geschilderd vlak met ronde hoeken dat geen bediening is: een
// kaart, de zwevende balk onderaan); rond al het andere (een rij, een groep, een knop, een veld) staat de lucht van inktVan. Een eigen marge of
// straal uit stappen.js geldt op een telefoon niet: daar is de regel voor elke stap dezelfde.
const BEDIENING = 'button, a[href], input, textarea, select, [role="button"]';
function opKaartRand(els) {
  if (els.length !== 1) return false;
  const z = zichtbaarVlak(els[0]);
  if (!z.vlak || z.straal < 8) return false;
  // Een ronde knop (een cirkel, zoals Delen in de kop) is zelf een afgerond vak: het vak valt op zijn rand, met zijn eigen straal. Zo blijft er
  // tussen het vak en de knop ernaast 12 px in plaats van 6 (BESLISSING 592, M5).
  const rond = z.straal >= Math.min(z.width, z.height) / 2 - 1 && Math.abs(z.width - z.height) <= 2;
  if (els[0].matches(BEDIENING) && !rond) return false;
  // het vlak van een enig kind dat een bediening is (een houder rond één knop)
  const kind = [...els[0].querySelectorAll(BEDIENING)].find((k) => zichtbaar(k) && Math.abs(k.getBoundingClientRect().width - z.width) < 13 && Math.abs(k.getBoundingClientRect().height - z.height) < 13);
  if (kind) return false;
  // Steekt er inkt buiten het vlak (het glas van Drinken hangt onder zijn vlak uit), dan is de rand van het vlak niet de rand van het blok.
  const i = inktVan(els);
  return !i || (i.l >= z.left - TOL && i.t >= z.top - TOL && i.r <= z.left + z.width + TOL && i.b <= z.top + z.height + TOL);
}
const margeVoor = (stap, els) => {
  if (telefoon()) {
    const m = opKaartRand(els) ? 0 : MAAT.margeTelefoon;
    return stap.krap && m ? MAAT.margeKrap : m;
  }
  const m = stap.marge ?? (zonderLucht(els) ? 0 : MAAT.marge);
  return stap.krap ? Math.min(m, MAAT.margeKrap) : m;
};
// Op tablet en desktop: valt het vak op de rand van het vlak zelf (marge 0)? Ja voor een vlak met ronde hoeken (een kaart, een knop): het vak is
// zijn eigen vorm. Een vlak met rechte hoeken in de inhoud (een rij met alleen een lijn erboven, een kopband) krijgt lucht rondom en ronde hoeken,
// zoals op een telefoon (BESLISSING 590): anders is het vak recht en raakt het icoon de rand. Alleen een recht vlak dat vast op het scherm staat
// (de zijbalk, de tabbalk, de vaste kop: gelijk met de schermrand) blijft recht, zoals goedgekeurd (BESLISSING 611).
function zonderLucht(els) {
  if (els.length !== 1) return false;
  const z = zichtbaarVlak(els[0]);
  return z.vlak && (z.straal >= 1 || vastBuitenBlad(els[0]));
}
// Ligt het element in iets met position fixed of sticky, buiten een open blad (een blad zelf staat ook vast, maar zijn rijen zijn inhoud).
function vastBuitenBlad(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.tagName === 'DIALOG') return false;
    const p = getComputedStyle(e).position;
    if (p === 'fixed' || p === 'sticky') return true;
  }
  return false;
}
// Het doel van een keuze (stappen.js, doelKeuzes) als afgerond blok: { els, zijden, heel, snij }, of null als het er niet is.
// zelf: true in stappen.js: het doel blijft zoals het is (geen kaart eromheen), voor een blok waarvan de tekst alleen over dat blok gaat.
function blokVan(stap, k) {
  const een = vindDoel(k.doel);
  if (!een) return null;
  const ander = k.ook ? vindDoel(k.ook) : null;
  const meet = (k.vlak && (een.querySelector(k.vlak) || vindDoel(k.vlak))) || een;
  let els = ander && ander !== een ? [meet, ander] : [meet];
  // (zonderKopGroei: verdeel() vond voor deze stap geen delen met eigen tekst; dan blijft het doel zoals het was, BESLISSING 627)
  // Alleen het gewone doel groeit tot de hele kaart; een kleiner doel uit stappen.js (klein) is een uitdrukkelijke keuze en blijft zichzelf.
  const gewoon = k.doel === stap.doel;
  // (de toelichting eerst: neemt het blok met haar meer dan de helft van de kaart in, dan wordt het de hele kaart met haar kop, metKop)
  // zelf: ook niet groeien tot de kaart eromheen. Een rij die tegen haar buren aan staat (het tijdstip van een herinnering, de knop Maand in
  // Dag, Week, Maand) is nooit "heel"; vroeger groeide ze dan toch tot de hele kaart, die op een telefoon in delen viel met een vultekst.
  if (stap.zelf) {
    const a = afgerond(els, margeVoor({ ...stap, ...k }, els));
    // Het vak blijft binnen de eigen lijnen: een rij met een lijntje erboven (.rij + .rij) wordt aangeduid zonder dat lijntje, en ook zonder
    // het lijntje van de rij eronder, dat maar een paar pixels verder staat.
    const z = { ...a.zijden };
    // Opzij overal dezelfde smalle lucht: zo zijn de vakken van rijen onder elkaar even breed.
    z.l = Math.min(z.l, MAAT.margeKrap);
    z.r = Math.min(z.r, MAAT.margeKrap);
    // (alleen een scheidingslijn: een rand boven of onder zonder rand opzij. Een knop met een rand rondom houdt zijn rand in het vak.)
    const lijn = (e, kant) => {
      const st = getComputedStyle(e);
      return (parseFloat(st.borderLeftWidth) || 0) === 0 ? parseFloat(st[kant]) || 0 : 0;
    };
    const boven = lijn(els[0], 'borderTopWidth');
    if (boven > 0) z.t = Math.min(z.t, -(boven + 1));
    const laatste = els[els.length - 1];
    const onder = lijn(laatste, 'borderBottomWidth');
    if (onder > 0) z.b = Math.min(z.b, -(onder + 1));
    const buur = laatste.nextElementSibling;
    if (buur && zichtbaar(buur) && lijn(buur, 'borderTopWidth') > 0) {
      const afstand = buur.getBoundingClientRect().top - laatste.getBoundingClientRect().bottom;
      if (afstand >= 0) z.b = Math.min(z.b, Math.max(0, afstand - 1));
    }
    return { els, ...a, zijden: z };
  }
  els = !gewoon ? maakHeel(els) : stap.zonderKopGroei ? metNoot(maakHeel(els), stap) : metKop(metNoot(maakHeel(els), stap));
  return groei(els, margeVoor({ ...stap, ...k }, els));
}
// Een toelichting vlak onder het doel hoort bij het blok (telefoon): een korte zin in kleine letter, zonder bediening of beeld, in dezelfde
// houder, dichter dan de lucht plus de ruimte tot de uitlegkaart (12 + 12 px). Los van het vak steekt ze half uit tussen het vak en de
// uitlegkaart (zoals de zin onder Stemming en energie, die stappen.js met `ook` meegeeft). Alleen als het doel alleen op zijn rij staat (een
// zin onder twee velden naast elkaar hoort bij geen van beide) en niet zelf een kop of een hele kaart is. Een zin die zelf het onderdeel van een
// andere stap van de lopende reeks is (doelenVanReeks), blijft van die stap.
let doelenVanReeks = [];
const isDoelVanAndereStap = (e, stap) =>
  doelenVanReeks.some((sel) => {
    if (sel === stap.doel || sel === stap.ook) return false;
    try {
      return e.matches(sel) || Boolean(e.querySelector(sel));
    } catch {
      return false;
    }
  });
function metNoot(els, stap) {
  if (!telefoon() || !els.length || els.some((e) => e.matches('.kaart') || e.matches(KOPACHTIG))) return els;
  const onderkant = (e) => e.getBoundingClientRect().bottom;
  const laatste = els.reduce((a, b) => (onderkant(b) > onderkant(a) ? b : a));
  const ouder = laatste.parentElement;
  if (!ouder || laatste.closest(VASTE_HOUDERS)) return els;
  const r = laatste.getBoundingClientRect();
  const broers = kinderenVan(ouder).filter((e) => e !== laatste && zichtbaar(e) && !raakt(els, e));
  const naast = (e) => {
    const q = e.getBoundingClientRect();
    return q.top < r.bottom - TOL && q.bottom > r.top + TOL;
  };
  if (broers.some(naast)) return els;
  const noot = broers.filter((e) => e.getBoundingClientRect().top >= r.bottom - TOL).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  if (!noot) return els;
  const q = noot.getBoundingClientRect();
  if (q.top - r.bottom >= MAAT.margeTelefoon + MAAT.afstandTelefoon || q.height > 48 || !noot.textContent.trim()) return els;
  if (noot.matches(KOPACHTIG) || noot.matches(BEDIENING + ', svg, img') || noot.querySelector('button, input, a, svg, img, select, textarea')) return els;
  if (isDoelVanAndereStap(noot, stap)) return els;
  const klein = parseFloat(getComputedStyle(noot).fontSize) < parseFloat(getComputedStyle(document.documentElement).fontSize) - 0.5;
  return klein ? [...els, noot] : els;
}

// Regel 3: de rijen van een blok. De zichtbare kinderen in visuele rijen (wat verticaal overlapt, staat in één rij); een rij met één element
// dat zelf te hoog is, wordt opnieuw verdeeld. Een scheidingslijn (geen tekst, hoogstens 3 px) telt niet.
function rijenVan(els, max, marge) {
  const scheiding = (e) => e.getBoundingClientRect().height <= 3 && !e.textContent.trim();
  const rijen = [];
  // Een rij is wat je ervan ziet (een week met haar tekens eronder), niet alleen haar vak: zo valt de rand van een deel tussen twee rijen.
  const zicht = new Map([...els].filter((x) => zichtbaar(x) && !scheiding(x)).map((x) => [x, zichtOmhulsel([x])]));
  for (const e of [...zicht.keys()].sort((a, b) => zicht.get(a).t - zicht.get(b).t)) {
    const r = zicht.get(e);
    const laatste = rijen[rijen.length - 1];
    if (laatste && r.t < laatste.b - TOL) {
      laatste.els.push(e);
      laatste.b = Math.max(laatste.b, r.b);
    } else rijen.push({ els: [e], t: r.t, b: r.b });
  }
  const uit = [];
  for (const rij of rijen) {
    const te = rij.b - rij.t + 2 * marge > max;
    const kinderen = rij.els.length === 1 ? kinderenVan(rij.els[0]).filter(zichtbaar) : [];
    if (te && kinderen.length) {
      const sub = rijenVan(kinderen, max, marge);
      if (sub.length > 1 || sub[0].length > 1 || sub[0][0] !== rij.els[0]) {
        uit.push(...sub);
        continue;
      }
    }
    uit.push(rij.els);
  }
  return uit;
}
// De rijen samen in delen die passen: een kop (kopachtig) gaat mee met de rij eronder, een korte noot (alleen tekst) met de rij erboven.
// zonder: een selector voor rijen die een eigen stap hebben (de rij van een spuit): die vallen weg uit de delen.
// raster (BESLISSING 656): { past } voor een stap met raster: true in stappen.js (de maandkalender van het Dagboek): dan mag een snede tussen twee
// rijen van een raster vallen (markeerRaster) en toetst de verdeling elk deel met zijn eigen tekst (past, delenTelefoon). Zonder raster blijft
// alles zoals het was.
// kopTekst(els): heeft de stap een eigen tekst (een stuk) voor deze kop? Alleen dan mag een kop op een telefoon een deel op zich zijn (BESLISSING
// 627: een deel met alleen de kop en de tekst van de hele stap zou een tekst tonen over iets wat niet in het vak staat).
function delenVan(blok, max, marge, zonder = null, raster = null, kopTekst = null) {
  let rijen = rijenVan(blok.length === 1 ? kinderenVan(blok[0]).filter(zichtbaar) : blok, max, marge);
  if (zonder) {
    // Een rij die een rij met een eigen stap bevat, maar ook iets anders: eerst in haar eigen rijen; dan valt die rij weg.
    const gemengd = (rij) => rij.length === 1 && !rij[0].matches(zonder) && rij[0].querySelector(zonder);
    for (let n = 0; n < 4 && rijen.some(gemengd); n++) rijen = rijen.flatMap((rij) => (gemengd(rij) ? rijenVan(kinderenVan(rij[0]).filter(zichtbaar), max, marge) : [rij]));
    rijen = rijen.filter((rij) => !rij.every((e) => e.matches(zonder) || e.querySelector(zonder)));
  }
  // BESLISSING 592: op een telefoon valt de rand van een deel nooit tussen twee rijen die minder dan 6 px uit elkaar staan (een vraag en haar
  // gezichtjes): daar zou de rand van het vak de andere rij raken of doorsnijden. Zulke rijen blijven samen.
  // (BESLISSING 656: behalve tussen twee rijen van een raster, markeerRaster: daar mag de snede in het midden van de tussenruimte vallen.)
  const lijm = (lijst) => {
    if (!telefoon()) return lijst;
    if (raster) markeerRaster(lijst);
    const samen = [];
    for (const rij of lijst) {
      const vorige = samen[samen.length - 1];
      if (vorige && (rij.rasterKop || (!rij.rasterVoor && zichtOmhulsel(rij).t - zichtOmhulsel(vorige).b < MAAT.margeKrap + 0.5))) vorige.push(...rij);
      else {
        const nieuw = [...rij];
        if (rij.rasterVoor) nieuw.rasterVoor = true;
        samen.push(nieuw);
      }
    }
    return samen;
  };
  rijen = lijm(rijen);
  const hoogte = (els) => {
    const v = zichtOmhulsel(els);
    return v.b - v.t + 2 * marge;
  };
  const kop = (rij) => rij.length === 1 && rij[0].matches(KOPACHTIG);
  const noot = (rij) => rij.length === 1 && !kop(rij) && rij[0].getBoundingClientRect().height <= 48 && !rij[0].querySelector('button, input, a, svg, img') && Boolean(rij[0].textContent.trim());
  const brokken = [];
  for (let i = 0; i < rijen.length; i++) {
    const rij = rijen[i];
    const vorige = brokken[brokken.length - 1];
    if (noot(rij) && vorige && hoogte([...vorige, ...rij]) <= max) {
      vorige.push(...rij);
      continue;
    }
    if (kop(rij)) {
      // Een kop (en wat er nog aan koppen onder staat) gaat mee met de eerste rij inhoud eronder. Past die hele rij er niet bij, dan wordt ze
      // in haar eigen rijen verdeeld, zolang de kop dan met de eerste ervan past; anders staat de kop apart.
      const keten = (j) => {
        while (rijen[j] && kop(rijen[j])) j++;
        return j;
      };
      let j = keten(i + 1);
      const met = (tot) => rijen.slice(i, tot + 1).flat();
      if (rijen[j] && hoogte(met(j)) > max && rijen[j].length === 1) {
        const kinderen = kinderenVan(rijen[j][0]).filter(zichtbaar);
        const sub = kinderen.length > 1 ? lijm(rijenVan(kinderen, max, marge)) : [];
        const proef = [...rijen.slice(0, j), ...sub, ...rijen.slice(j + 1)];
        let k = j;
        while (proef[k] && kop(proef[k])) k++;
        if (sub.length > 1 && proef[k] && k < j + sub.length - 1 && hoogte(proef.slice(i, k + 1).flat()) <= max) {
          rijen.splice(j, 1, ...sub);
          j = k;
        }
      }
      if (rijen[j] && hoogte(met(j)) <= max) {
        if (telefoon()) {
          // (op een telefoon kiest de verdeling hieronder zelf of de kop bij die rij blijft: liever niet, maar wel als de grens anders op een
          // krappe plaats valt)
          const koppen = rijen.slice(i, j).flat();
          koppen.kop = true;
          if (rij.rasterVoor) koppen.rasterVoor = true;
          const rest = [...rijen[j]];
          rest.naKop = true;
          rest.enkel = rijen[j].length > 1 || kinderenVan(rijen[j][0]).filter(zichtbaar).length < 2;
          brokken.push(koppen, rest);
        } else brokken.push(met(j));
        i = j;
        continue;
      }
    }
    // Een rij die niet verder te verdelen is (elementen naast elkaar, zoals het glas met zijn stand, of één element zonder rijen erin).
    const b = [...rij];
    b.enkel = rij.length > 1 || kinderenVan(rij[0]).filter(zichtbaar).length < 2;
    if (rij.rasterVoor) b.rasterVoor = true;
    brokken.push(b);
  }
  if (telefoon() && brokken.length > 1) return delenTelefoon(brokken, max, hoogte, marge, raster?.past ?? null, kopTekst);
  const delen = [];
  for (const b of brokken) {
    const huidig = delen[delen.length - 1];
    if (huidig && hoogte([...huidig, ...b]) <= max) {
      huidig.push(...b);
      huidig.brokken += 1; // hoeveel stukken samen in dit deel staan
      huidig.enkel = false;
    } else {
      const nieuw = [...b];
      nieuw.brokken = 1;
      nieuw.enkel = Boolean(b.enkel); // één rij die niet kleiner kan: daarvoor verkleint de verdeling niet
      delen.push(nieuw);
    }
  }
  return delen;
}
// BESLISSING 592, op een telefoon: de brokken in delen die elk passen, met de grenzen zo ruim mogelijk. Een grens tussen twee rijen die minder dan
// 6 + 12 px uit elkaar staan, laat de volgende rij half onder de uitlegkaart uitsteken (of te dicht bij het vak staan); onder 12 + 12 px kan het
// vak er geen 12 px lucht hebben; een kop los van haar rij is ook liever niet. Eerst zo weinig mogelijk zulke grenzen, dan zo weinig mogelijk delen.
// BESLISSING 656: een snede in een raster (brok.rasterVoor) kost weinig: daar valt de rand in het midden van de tussenruimte, en het deel heeft aan
// die kant alleen die halve tussenruimte als lucht (dat telt mee in zijn hoogte). Elk deel dat een raster snijdt, krijgt de rijen aan de overkant
// mee (deel.raster = { boven, onder }); afgerondTelefoon zet daarmee de lucht aan die kant.
// past(deel, hoogte, eerste): voor een blok met een raster telt per deel ook of het met zijn EIGEN tekst naast de uitlegkaart past (verdeel geeft
// die toets mee). Zo bepaalt het deel met de langste tekst niet de grootte van alle andere delen. Voor elk ander blok blijft het zoals het was.
function delenTelefoon(brokken, max, hoogte, marge = MAAT.margeTelefoon, past = null, kopTekst = null, vrij = false) {
  const n = brokken.length;
  // een deel met alleen koppen (en niet het hele blok) zonder eigen tekst voor die kop: niet (kopTekst, BESLISSING 627)
  const losseKop = (i, j) => !vrij && typeof kopTekst === 'function' && j < n && brokken.slice(i, j).every((b) => b.kop) && !kopTekst(brokken.slice(i, j).flat());
  const metTekst = typeof past === 'function' && brokken.some((b) => b.rasterVoor);
  // een deel van brok i tot j, met de rijen aan de overkant van zijn sneden
  const kandidaat = (i, j) => {
    const d = brokken.slice(i, j).flat();
    const boven = brokken[i].rasterVoor ? brokken[i - 1] : null;
    const onder = j < n && brokken[j].rasterVoor ? brokken[j] : null;
    if (boven || onder) d.raster = { boven, onder };
    return d;
  };
  const half = (i) => Math.max(0, (zichtOmhulsel(brokken[i]).t - zichtOmhulsel(brokken[i - 1]).b) / 2);
  const hoogteDeel = (i, j) => hoogte(brokken.slice(i, j).flat()) - (brokken[i].rasterVoor ? marge - half(i) : 0) - (j < n && brokken[j].rasterVoor ? marge - half(j) : 0);
  const grens = (i) => {
    if (brokken[i].rasterVoor) return 1;
    const g = zichtOmhulsel(brokken[i]).t - zichtOmhulsel(brokken[i - 1]).b;
    let k = g < MAAT.margeKrap + MAAT.afstandTelefoon ? 4 : g < MAAT.margeTelefoon + MAAT.afstandTelefoon ? 1 : 0;
    if (brokken[i].naKop || brokken[i - 1].kop) k += 2;
    return k;
  };
  const best = [{ kost: 0, delen: 0, van: -1 }];
  for (let j = 1; j <= n; j++) {
    best[j] = null;
    for (let i = j - 1; i >= 0; i--) {
      if (!best[i]) continue;
      if (j - i > 1 && hoogteDeel(i, j) > max) break;
      if (metTekst && j - i > 1 && !past(kandidaat(i, j), hoogteDeel(i, j), i === 0)) continue;
      if (losseKop(i, j)) continue;
      const kost = best[i].kost + (i > 0 ? grens(i) : 0);
      const delen = best[i].delen + 1;
      if (!best[j] || kost < best[j].kost || (kost === best[j].kost && delen < best[j].delen)) best[j] = { kost, delen, van: i };
    }
  }
  if (!best[n]) return delenTelefoon(brokken, max, hoogte, marge, past, kopTekst, true); // (de kop past met niets erbij: dan toch apart)
  const delen = [];
  for (let j = n; j > 0; j = best[j].van) {
    const i = best[j].van;
    const d = kandidaat(i, j);
    d.brokken = j - i;
    d.enkel = j - i === 1 && Boolean(brokken[i].enkel);
    delen.unshift(d);
  }
  return delen;
}
// De namen van wat in een deel staat (de titels van de rijen), in volgorde en elk één keer: de eigen tekst van het element, zonder wat er in
// een kind staat ("Avond · nu" wordt "Avond").
function namenIn(els, kiezer) {
  const namen = [];
  for (const el of els) {
    for (const e of [el, ...el.querySelectorAll(kiezer)].filter((x) => x.matches(kiezer) && zichtbaar(x))) {
      const naam = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (naam && !namen.includes(naam)) namen.push(naam);
    }
  }
  return namen;
}
const opsomming = (lijst) => (lijst.length < 2 ? lijst.join('') : `${lijst.slice(0, -1).join(', ')} en ${lijst[lijst.length - 1]}`);
const hoofdletter = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const klein = (x) => x.charAt(0).toLowerCase() + x.slice(1);
// Een deel zonder eigen stuk: een titel en een zin over wat erin staat. stukken.vervolg kan een kiezer (naam) en een eigen opmaak (maak) geven.
function vervolgTekst(stap, deel) {
  const v = stap.stukken?.vervolg ?? {};
  const namen = namenIn(deel, v.naam ?? '.rij__titel, .kaartkop__label, .label');
  if (namen.length && typeof v.maak === 'function') return v.maak(namen);
  if (namen.length) return { titel: hoofdletter(opsomming(namen.map(klein))), tekst: `Hier ${namen.length > 1 ? 'staan' : 'staat'} ook ${opsomming(namen.map(klein))}.` };
  return { titel: `${stap.titel}, verder`, tekst: 'Ook dit hoort erbij.' };
}
// De titel en tekst van elk deel uit de stukken van de stap (stappen.js, STUKKEN).
function tekstenVoorDelen(stap, delen) {
  const st = stap.stukken;
  const per = delen.map(() => []);
  for (const stuk of st?.stukken ?? []) {
    const be = vindDoel(stuk.bij);
    if (!be) continue;
    // Het deel waarin het grootste stuk van dat onderdeel staat.
    const r = rh(be.getBoundingClientRect());
    const overlap = delen.map((d) => {
      const g = rh(omhulsel(d));
      return raakt(d, be) ? Math.max(0, Math.min(r.r, g.r) - Math.max(r.l, g.l)) * Math.max(0, Math.min(r.b, g.b) - Math.max(r.t, g.t)) + 0.001 : 0;
    });
    const beste = Math.max(...overlap);
    const i = beste > 0 ? overlap.indexOf(beste) : -1;
    if (i >= 0 && (!stuk.alleen || per[i].length === 0)) per[i].push(stuk);
  }
  return per.map((alle, i) => {
    // eigen: true telt alleen als er geen ander stuk in hetzelfde deel staat (de kop van een kaart die alleen staat).
    const lijst = alle.some((x) => !x.eigen) ? alle.filter((x) => !x.eigen) : alle;
    if (lijst.length) {
      // ookBijStuk: wat er in dit deel nog staat (de dagen, de momenten), in een zin erachter, zodat de tekst het hele deel beschrijft.
      const v = st?.vervolg;
      const namen = v?.ookBijStuk && typeof v.maak === 'function' && delen.length > 1 ? namenIn(delen[i], v.naam) : [];
      const vervolg = namen.length ? v.maak(namen) : null;
      const erbij = vervolg ? ' ' + vervolg.tekst : '';
      // na: een stuk waarvan de zin achter de zin over de rest van het deel komt (de favorieten onder Late snack). Staan er alleen zulke
      // stukken in het deel, dan is de titel die van de rest (Late snack), niet die van het stuk.
      const eerst = lijst.filter((x) => !x.na);
      const daarna = lijst.filter((x) => x.na);
      const titel = eerst.length || !vervolg ? lijst[0].titel : vervolg.titel;
      const tekst = [eerst.map((x) => x.tekst).join(' '), erbij.trim(), daarna.map((x) => x.tekst).join(' ')].filter(Boolean).join(' ');
      return { titel, tekst, bron: 'stuk', ...(lijst.length === 1 && lijst[0].kort && !erbij ? { kort: lijst[0].kort } : {}) };
    }
    if (i === 0) return { titel: stap.titel, tekst: stap.tekst, bron: 'heel' };
    return { ...vervolgTekst(stap, delen[i]), bron: 'vervolg' };
  });
}

// ============================================================ geen herhaling (BESLISSING 563)
// Wat een rondleiding toonde: de doelen (als tekst en als element op het scherm) en de titels van haar stappen.
export function alGezien(lijst) {
  const doelen = new Set();
  const elementen = new Set();
  const titels = new Set();
  for (const s of lijst) {
    titels.add(s.titel);
    if (s.deel) titels.add(s.deel.bron.titel); // een afgerond deel (BESLISSING 570) telt als zijn hele stap
    if (s.midden || !s.doel) continue;
    doelen.add(s.doel);
    const el = vindDoel(s.doel);
    if (el) elementen.add(el);
  }
  return { doelen, elementen, titels };
}
// De stappen van een handeling zonder wat al getoond werd (zelfde titel, zelfde doel of hetzelfde onderdeel op het scherm).
export function nieuweStappen(sleutel, gezien) {
  return stappenVoor(sleutel).filter((s) => {
    if (gezien.titels.has(s.titel)) return false;
    if (s.midden || !s.doel) return true;
    if (gezien.doelen.has(s.doel)) return false;
    const el = vindDoel(s.doel);
    return !(el && gezien.elementen.has(el));
  });
}

// ============================================================ starten, tonen en stoppen

let actief = null;
const telefoon = () => window.matchMedia('(max-width: 719px)').matches;
// Het soort toestel voor de teksten (BESLISSING 590): het menu links (breed) of de balk onderaan, en een muis of aanraking.
const toestel = () => ({ breed: window.matchMedia('(min-width: 960px)').matches, telefoon: window.matchMedia('(max-width: 719px)').matches, muis: window.matchMedia('(hover: hover) and (pointer: fine)').matches });

// De kleurfamilie van het scherm waarop de uitleg staat (BESLISSING 523; de families staan in src/stijl/tabkleur.css): Vandaag pruim,
// Dagboek abrikoos, Drinken mist, Supplementen salie, Gewicht duifblauw, Algemeen en de instellingen het accent van het thema, Delen lavendel.
// uitleg.css leidt daaruit de knoppen en accenten van de kaart af, met dezelfde tokens als de gewone knoppen op dat scherm.
const FAMILIES = [['vandaag', 'dag'], ['dagboek', 'dagboek'], ['drinken', 'drank'], ['supplementen', 'gezond'], ['gewicht', 'gewicht'], ['meer', 'algemeen'], ['delen', 'delen']];
export function familieVan(scherm) {
  const s = String(scherm || '');
  return FAMILIES.find(([route]) => s === route || s.startsWith(route + '/'))?.[1] ?? null;
}
// De knoppen van de kaart zijn exact de knoppen van het scherm: de waarden van --knop-bg, --knop-fg, --knop-zacht-bg en --knop-zacht-fg worden
// gelezen waar de gewone knoppen van het scherm ze lezen (#scherm; op Vandaag de bovenste kaart, BESLISSING 370) en op de laag gezet. Zo volgt de
// uitleg elke wijziging van de knoptokens zonder eigen kopie (uitleg.css geeft dezelfde waarden als terugval, uit de familie).
const KNOPTOKENS = ['--knop-bg', '--knop-fg', '--knop-zacht-bg', '--knop-zacht-fg'];
function zetFamilie(laag) {
  const scherm = document.getElementById('scherm');
  const f = familieVan(scherm?.dataset.scherm);
  if (f) laag.dataset.familie = f;
  else delete laag.dataset.familie;
  const bron = (scherm?.dataset.scherm === 'vandaag' && scherm.querySelector('.voortgang')) || scherm;
  const stijl = bron ? getComputedStyle(bron) : null;
  for (const token of KNOPTOKENS) {
    const waarde = stijl?.getPropertyValue(token).trim();
    if (waarde) laag.style.setProperty(token, waarde);
    else laag.style.removeProperty(token);
  }
}
// Alles behalve de uitleg (en een blad dat een stap opende) inert zolang een rondleiding loopt.
function zetInert(aan) {
  for (const el of document.querySelectorAll(DEMO_KOP ? `#app, body > ${DEMO_KOP}` : '#app')) el.inert = aan;
}

function slotIsDicht() {
  const slot = document.getElementById('slot');
  return Boolean(slot) && slot.hidden === false;
}

export function magStarten() {
  if (actief) return false;
  if (slotIsDicht()) return false;
  if (document.querySelector('dialog[open]')) return false;
  if (document.visibilityState === 'hidden') return false;
  return true;
}

export const isActief = () => Boolean(actief);
const zonderBeweging = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Het vlak tussen de vaste kop en de tabbalk (en binnen de veiligheidszones van het toestel), en het inhoudsvlak rechts van de zijbalk.
// veilig: een element met padding var(--safe-top) en var(--safe-bottom); zo leest de rondleiding de zones van iOS zonder env() in js.
// De vaste balken bovenaan: de demobalk, de schermkop en de kop van het Dagboek (plakken tot 959 px), en op Vandaag (telefoon) het logo met
// zijn vlak (::before) dat tot de randen loopt (BESLISSING 507). Alleen wat vast of plakkend in het bovenste derde staat, telt.
const KOPPEN = metDemo('.schermkop, .dagboek > .dagboek__kop, .vandaag > .vandaag__begroeting > .vandaag__logo');
function kopOnder() {
  let onder = 0;
  for (const e of document.querySelectorAll(KOPPEN)) {
    if (e.closest('dialog') || !zichtbaar(e)) continue;
    const s = getComputedStyle(e);
    if (s.position !== 'sticky' && s.position !== 'fixed') continue;
    const r = e.getBoundingClientRect();
    if (r.top > window.innerHeight / 3) continue;
    const p = pseudoVak(e, r, s, '::before');
    onder = Math.max(onder, r.bottom, p ? p.top + p.height : 0);
  }
  return onder;
}
// De balk onderaan: zijn zichtbare, zwevende vlak (BESLISSING 504), anders het element; null als hij er niet is (desktop).
function balkBoven() {
  const tab = document.getElementById('tabbalk');
  if (!tab || getComputedStyle(tab).display === 'none' || !zichtbaar(tab)) return null;
  const v = zichtbaarVlak(tab);
  return Math.min(v.top, tab.getBoundingClientRect().bottom);
}
function vlakken(veilig = null) {
  const inhoud = document.getElementById('scherm')?.getBoundingClientRect();
  const s = veilig ? getComputedStyle(veilig) : null;
  const veiligBoven = s ? parseFloat(s.paddingTop) || 0 : 0;
  const veiligOnder = s ? parseFloat(s.paddingBottom) || 0 : 0;
  const balk = balkBoven();
  return {
    zone: { top: Math.max(veiligBoven, kopOnder()), bottom: Math.min(window.innerHeight - veiligOnder, balk ?? window.innerHeight) },
    // Wat de kaart uiterst mag innemen als een hoog onderdeel anders niet past: tot de onderrand van het venster (over de balk onderaan).
    // BESLISSING 750 (K2): onder 600 px zichtbare hoogte ook tot de bovenrand van het venster (over de gedimde vaste kop).
    uiterst: { top: magOverKop() ? veiligBoven : Math.max(veiligBoven, kopOnder()), bottom: window.innerHeight - veiligOnder },
    gebied: !telefoon() && inhoud ? { links: Math.max(0, inhoud.left), rechts: Math.min(window.innerWidth, inhoud.right) } : null,
  };
}

// startRondleiding({ sleutel, vanaf = stap-id, opKlaar })
// Geeft true als ze startte. 'vanaf' begint bij die stap (voor "Toon het me" in de lijst met onderwerpen).
export const MAX_AUTO_STAPPEN = 4;
// terugNaarVorig (BESLISSING 549): de rondleiding werd gestart vanuit het scherm Uitleg, dat daarvoor naar dit scherm navigeerde. Na Klaar,
// Overslaan, Escape of de terugknop gaat ze één stap terug in de geschiedenis: het scherm Uitleg komt terug op zijn scrollhoogte, met de focus
// op de rij die getikt werd (src/kern/scroll.js, zoals bij elke terugkeer).
// zonder (BESLISSING 563): wat de rondleiding ervoor al toonde (alGezien); die stappen vallen weg en de teller telt alleen de rest.
// ingang (BESLISSING 694): de eigen geschiedenisingang van de rondleiding ervoor in dezelfde keten (het aanbod); deze rondleiding neemt ze over,
// zodat het scherm Uitleg pas na de laatste Klaar terugkomt.
// Het vangnet (BESLISSING 694): een handleiding (h:) of een start via "Toon het me" doet nooit stil niets; zonder enige stap toont ze één stap
// midden op het scherm: Nog niets te zien.
const stapNiets = () => ({ id: 'niets', midden: true, titel: t('uitleg.leeg.niets.titel'), tekst: t('uitleg.leeg.niets.tekst') });
// De opkom-animaties van een pas getekend scherm (beweging.js, componenten.css, layout.css): ze laten een kaart verschijnen of verschuiven.
const OPKOMST = new Set(['komop', 'bloeiop', 'vervaag', 'scherm-in', 'begroeting-op', 'bloei', 'groei']);
// Animaties die de plaats van een kaart niet veranderen (een lijn die tekent, de glans op een medaille, ook in een viering): niet afwachten
// bij een gevraagde start, tenzij ze op het doel zelf lopen.
const STIL_VAN_PLAATS = new Set(['lijn-teken', 'punt-in', 'medaille-glans', 'medaille-glans-zicht', 'golf']);
// Wat zelfs op het doel de plaats en de maat niet verandert: de glans die over een medaille strijkt (schermen.css, met een vertraging per
// medaille die op het scherm Badges tot ver na de opkomst loopt) en een ring die zich vult (de overgang van stroke-dasharray op .medaille__boog).
// Die afwachten hield de eerste kaart op Algemeen en Badges tot 1,7 s tegen.
const NOOIT_AFWACHTEN = new Set(['medaille-glans', 'medaille-glans-zicht']);
const STILLE_OVERGANG = new Set(['stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'fill', 'stroke', 'color', 'background-color', 'box-shadow']);

// Maakt de lopende opkom-animaties binnen #scherm meteen af (BESLISSING 735). Een blad of venster hangt buiten #scherm en blijft afgewacht.
function maakOpkomstAf() {
  const scherm = document.getElementById('scherm');
  if (!scherm) return;
  for (const a of document.getAnimations()) {
    const el = a.effect?.target ?? null;
    if (!el || !OPKOMST.has(a.animationName) || !(el === scherm || scherm.contains(el))) continue;
    if (el.closest?.('dialog')) continue;
    try {
      a.finish();
    } catch {
      // een animatie zonder eind kan niet afgemaakt worden: die blijft afgewacht (BESLISSING 570)
    }
  }
}

// Maakt de eindige animaties af die de plaats niet veranderen (STIL_VAN_PLAATS) en op een doel van de rondleiding lopen (BESLISSING 735).
// Buiten een doel lopen ze gewoon door: daar worden ze niet afgewacht. De glans van een medaille blijft (NOOIT_AFWACHTEN).
function maakStilAf(doelen) {
  if (!doelen.length) return;
  for (const a of document.getAnimations()) {
    const el = a.effect?.target ?? null;
    if (!el || !STIL_VAN_PLAATS.has(a.animationName) || NOOIT_AFWACHTEN.has(a.animationName)) continue;
    if (!Number.isFinite(a.effect?.getComputedTiming?.().endTime)) continue;
    if (!doelen.some((d) => d === el || d.contains(el))) continue;
    try {
      a.finish();
    } catch {
      // kan ze niet afgemaakt worden, dan blijft ze afgewacht (BESLISSING 570)
    }
  }
}

export function startRondleiding({ sleutel, vanaf = null, opKlaar = null, maxStappen = Infinity, terugNaarVorig = false, zonder = null, ingang = null, toonHetMe = false, snel = false } = {}) {
  if (!magStarten() || !heeftUitleg(sleutel)) return false;
  const vangnet = sleutel.startsWith('h:') || toonHetMe || terugNaarVorig || vanaf != null;
  let lijst = kiesAanwezig(zonder ? nieuweStappen(sleutel, zonder) : stappenVoor(sleutel), (s) => (s.voor ? vindActie(s.voor) : vindDoel(s.doel))).slice(0, maxStappen);
  if (!lijst.length) {
    if (!vangnet) return false;
    lijst = [stapNiets()];
  }
  // (voor metNoot: een toelichting die zelf het onderdeel van een stap van deze reeks is, hoort bij die stap)
  doelenVanReeks = stappenVoor(sleutel).flatMap((s) => [s.doel, s.ook, ...(s.klein ?? []).flatMap((k) => [k.doel, k.ook])]).filter((x) => typeof x === 'string' && x);
  let gang = null; // de volgorde, zodra de stappen verdeeld zijn (verdeelLijst, BESLISSING 570)

  const terugNaar = document.activeElement;
  const beginY = window.scrollY;
  // Het gat: een element zonder vulling met een zeer brede schaduw (de sluier). Het tekent zelf geen rand en geen vlak.
  const gat = h('div', { class: 'uitleg__gat', 'aria-hidden': 'true' });
  // Een tik buiten het kaartje doet niets: het vangvlak houdt hem tegen (scrollen blijft gewoon werken).
  const vanger = h('div', { class: 'uitleg__vanger', 'aria-hidden': 'true' });
  const stapLabel = h('p', { class: 'label uitleg__stap' });
  const titel = h('h2', { class: 't-h2 uitleg__titel', id: 'uitleg-titel' });
  const tekst = h('p', { class: 'uitleg__tekst', id: 'uitleg-tekst' });
  const status = h('p', { class: 'uitleg__status', role: 'status', 'aria-live': 'polite' });
  const vorigeKnop = knop(t('uitleg.vorige'), { soort: 'secundair', opKlik: () => ga(-1) });
  // BESLISSING 544: de knoppen van de kaart vormen één groep en hebben allemaal hetzelfde zachte vlak, ook Volgende (en Klaar).
  const volgendeKnop = knop(t('uitleg.volgende'), { soort: 'secundair', opKlik: () => ga(1) });
  // BESLISSING 528: Overslaan is een echte knop, in dezelfde vorm als Vorige (een zacht vlak in de kleur van het scherm, uitleg.css).
  const overslaanKnop = knop(t('uitleg.overslaan'), { soort: 'secundair', opKlik: () => sluit(true) });
  vorigeKnop.classList.add('uitleg__vorige');
  volgendeKnop.classList.add('uitleg__volgende');
  overslaanKnop.classList.add('uitleg__overslaan');
  const aanbodTekst = h('p', { class: 'uitleg__tekst' });
  const aanbodKnop = knop(t('uitleg.aanbodKnop'), { soort: 'secundair', breed: true });
  const aanbodRij = h('div', { class: 'uitleg__aanbod', hidden: true }, aanbodTekst, aanbodKnop);
  // BESLISSINGEN 346, 522 en 549: één rij, gecentreerd en even breed, in de volgorde Volgende (laatste stap: Klaar), Vorige (niet in stap 1),
  // Overslaan: naast elkaar van links naar rechts, onder elkaar van boven naar onder. De volgorde staat zo in de DOM, dus tab- en leesvolgorde
  // zijn gelijk aan wat je ziet; Volgende staat altijd eerst, op dezelfde plaats, zodat de knop niet onder de vinger verspringt.
  const kaart = h(
    'div',
    { class: 'uitleg__kaart', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'uitleg-titel', 'aria-describedby': 'uitleg-tekst', tabindex: '-1' },
    stapLabel,
    titel,
    tekst,
    aanbodRij,
    h('div', { class: 'uitleg__acties' }, volgendeKnop, vorigeKnop, overslaanKnop),
    status,
  );
  // De laag staat in de bovenste laag van de browser (popover), zodat ze ook boven een open blad (dialog) ligt. Ze draagt de kleurfamilie
  // van het scherm (data-familie, uitleg.css): de laag hangt buiten #scherm en erft die anders niet (BESLISSING 523).
  const laag = h('div', { class: 'uitleg', 'data-uitleg-laag': '', popover: 'manual' }, vanger, gat, kaart);
  zetFamilie(laag);

  let ontkoppel = [];
  let wacht = null;
  let beeld = null; // wat nu getekend staat: { gat, kaart: { links, boven } }
  let plan = null; // de schikking van de huidige stap
  let doelEl = null;
  let keuze = null; // het doel dat deze stap nu aanwijst (stappen.js, doelKeuzes): het gewone of, op een klein scherm, een kleiner deel
  const eff = (stap) => (keuze && !stap.midden ? { ...stap, ...keuze } : stap);
  let anim = null;
  let naAnim = false; // een maatwijziging tijdens de beweging: daarna opnieuw schikken

  // ---- tekenen (alleen custom properties, CSP: el.style.setProperty) ----
  function tekenGat(gr) {
    gat.style.setProperty('--gl', gr.left + 'px');
    gat.style.setProperty('--gt', gr.top + 'px');
    gat.style.setProperty('--gb', gr.width + 'px');
    gat.style.setProperty('--gh', gr.height + 'px');
    gat.style.setProperty('--gr', gr.straal + 'px');
  }
  function tekenKaart(k) {
    kaart.style.setProperty('--kl', k.links + 'px');
    kaart.style.setProperty('--kt', k.boven + 'px');
  }
  function teken(b) {
    tekenGat(b.gat);
    tekenKaart(b.kaart);
    beeld = b;
  }

  // Het gat rond het afgeronde blok van de stap (kiesDoel: stap.els en stap.zijden), afgesneden boven het kaartje als het onderdeel te hoog is.
  function meetGat(stap, el, snij = null) {
    if (!el) return { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0, straal: 0 };
    // Het zichtbare vlak (zie zichtbaarVlak) van de elementen van het blok; zonder blok het doel (met `vlak: selector` een ander element) en 'ook'.
    let els = stap.els?.length && stap.els.every((e) => e.isConnected) ? stap.els : null;
    if (!els) {
      const ander = stap.ook ? vindDoel(stap.ook) : null;
      els = [(stap.vlak && (el.querySelector(stap.vlak) || vindDoel(stap.vlak))) || el, ...(ander && ander !== el ? [ander] : [])];
    }
    const r = omhulsel(els);
    // Een onderdeel dat zelf een vlak is (een kaart, een knop, de zwevende balk): het gat is precies zijn zichtbare vorm, zonder rand van de
    // pagina eromheen (geen lichte plaat, BESLISSING 258). Een onderdeel zonder eigen vlak (een rij, een groep): een marge rondom, die per kant
    // wijkt voor een buur, zodat de rand van het gat niets doorsnijdt (afgerond, BESLISSING 570).
    const m = margeVoor(stap, els);
    const z = stap.zijden && stap.els === els ? stap.zijden : telefoon() && m > 0 ? afgerond(els, m).zijden : { t: m, r: m, b: m, l: m };
    const breed = r.width + z.l + z.r;
    const hoog = r.height + z.t + z.b;
    // Een vlak met lucht rondom (een recht vlak in de inhoud, zonderLucht): ronde hoeken zoals een blok zonder vlak, minstens de marge.
    const straal = stap.straal ?? (r.vlak && m === 0 ? r.straal + Math.max(0, Math.min(z.t, z.r, z.b, z.l)) : Math.max(r.straal + Math.max(0, Math.min(z.t, z.r, z.b, z.l)), m));
    const g = { left: r.left - z.l, top: r.top - z.t, width: breed, height: hoog, straal: Math.max(0, Math.min(straal, breed / 2, hoog / 2)) };
    // BESLISSING 592: op een telefoon heeft elk vak vier even ronde hoeken van 16 px (--r-md, de straal van een kaart), ook een deel van een
    // kaart; valt het vak op de rand van een kaart, dan haar eigen straal. Geen eigen straal per stap.
    if (telefoon()) g.straal = Math.max(0, Math.min(m === 0 && r.vlak ? r.straal : MAAT.straalTelefoon, g.width / 2, g.height / 2));
    if (snij != null && g.top + g.height > snij) {
      g.height = Math.max(0, snij - g.top);
      g.straal = Math.min(g.straal, g.height / 2);
    }
    return g;
  }

  // De schikking van de stap in de huidige stand: het kaartje heeft dan al zijn tekst en zijn breedte.
  function schik(stap, el, { zonderSchuiven = false, voorkeur = null } = {}) {
    const { zone, uiterst, gebied } = vlakken(vanger);
    const mobiel = telefoon();
    // Een laag scherm (een telefoon liggend): een bredere kaart is lager, zodat er meer plaats blijft voor het onderdeel. De kaart is nooit hoger
    // dan wat tussen de vaste kop en de onderrand past; is de tekst langer, dan schuift alleen de tekst binnen de kaart (uitleg.css).
    const krap = window.innerHeight < 560;
    const breedte = mobiel ? window.innerWidth - 2 * MAAT.rand : Math.min(krap ? MAAT.kaartBreedLaag : MAAT.kaartBreed, (gebied ? gebied.rechts - gebied.links : window.innerWidth) - 2 * MAAT.rand);
    kaart.style.setProperty('--kb', breedte + 'px');
    // (de hoogste kaart blijft die tussen de vaste kop en de onderrand, ook waar ze over de kop mag, BESLISSING 750)
    kaart.style.setProperty('--kmax', Math.max(120, uiterst.bottom - zone.top - 2 * MAAT.rand) + 'px');
    const hoog = kaart.offsetHeight;
    // BESLISSING 592: een onderdeel in een blad dat zelf schuift, schuift met het blad (niet met de pagina) tot het precies op afstand staat.
    const rol = el && mobiel ? bladRol(el) : null;
    const wortel = rol?.houder || document.scrollingElement || document.documentElement;
    const p = schikking({
      gat: el ? meetGat(stap, el) : null,
      kaart: { breed: breedte, hoog },
      venster: { breed: window.innerWidth, hoog: window.innerHeight },
      zone,
      // BESLISSING 570: alleen op een lage telefoon mag de kaart over de gedimde balk onderaan (nooit over het vak); en bij een onderdeel in een
      // open blad of vaste balk, dat niet schuift. Op hogere schermen blijft de balk de grens.
      uiterst: isLaag() || (el && staatVast(el)) ? uiterst : null,
      gebied,
      telefoon: mobiel,
      schuif: zonderSchuiven ? { min: 0, max: 0 } : { min: -wortel.scrollTop, max: wortel.scrollHeight - wortel.clientHeight - wortel.scrollTop },
      vast: el ? staatVast(el) && !rol : true,
      vrij: rol,
      voorkeur,
      inKop: Boolean(el && mobiel && (stap.els?.length ? stap.els : [el]).every((e) => e.closest(KOPPEN))),
    });
    if (rol) p.houder = rol.houder;
    return zonderSchuiven ? p : schoneSchuif(stap, el, p, rol);
  }
  // Het zichtbare deel van de schuivende houder van een onderdeel in een open blad: { houder, top, bottom }, of null (niet in een blad, of het
  // blad schuift niet).
  function bladRol(el) {
    const blad = el.closest('dialog[open]');
    if (!blad) return null;
    for (let e = el.parentElement; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        const r = e.getBoundingClientRect();
        return { houder: e, top: Math.max(0, r.top + e.clientTop), bottom: Math.min(window.innerHeight, r.top + e.clientTop + e.clientHeight) };
      }
      if (e === blad) break;
    }
    return null;
  }
  // Schuift de pagina (of de houder in een blad) met d.
  const schuifMet = (p, d) => d && (p.houder || window).scrollBy({ top: d, behavior: 'instant' });

  // BESLISSING 592 (M5): wat van dezelfde kaart buiten het vak valt, is ofwel helemaal te zien op minstens 12 px van het vak, ofwel helemaal
  // verborgen achter de vaste kop, de balk of de uitlegkaart; nooit half. Is dat met de kaart op haar vaste plaats niet zo, dan schuiven de pagina
  // EN de uitlegkaart samen (het vak blijft precies afstandTelefoon van de kaart en randGatTelefoon van de kop of de balk), zo weinig mogelijk weg
  // van de vaste plaats (M7: de kaart verspringt alleen als het moet); eerst aan de kant waar de kaart staat, dan aan de andere kant.
  function schoneSchuif(stap, el, p, rol = null) {
    if (!telefoon() || !el || (staatVast(el) && !rol) || !['vast-onder', 'vast-boven'].includes(p.kant) || p.snij != null || p.nood) return p;
    const g = meetGat(stap, el);
    const kh = kaart.offsetHeight;
    const { zone: paginaZone, uiterst } = vlakken(vanger);
    // in een blad: het vak blijft binnen het zichtbare deel van het blad, en wat erbuiten valt is verborgen
    const zone = rol ? { top: rol.top, bottom: rol.bottom } : paginaZone;
    const af = MAAT.afstandTelefoon;
    const rg = MAAT.randGatTelefoon;
    const wortel = rol?.houder || document.scrollingElement || document.documentElement;
    const sMin = -wortel.scrollTop;
    const sMax = wortel.scrollHeight - wortel.clientHeight - wortel.scrollTop;
    const G = { l: g.left, t: g.top, r: g.left + g.width, b: g.top + g.height };
    const doelEls = stap.els?.length ? stap.els : [el];
    const blok = kaartVan(doelEls[0]) || el;
    if (doelEls.includes(blok)) return p; // het vak is de hele kaart: niets van haar valt erbuiten
    // Wat de opmaak zelf dichter dan 10 px bij het vak zet, kan geen plaatsing oplossen (ook niet met 11 px tot de kaart; de schermtest meldt
    // het apart): dat telt hier niet mee.
    const afstandTot = (R) => Math.max(G.t - R.b, R.t - G.b, G.l - R.r, R.l - G.r);
    const buiten = eenheden(blok, { l: -1e6, t: -1e6, r: 1e6, b: 1e6 }, (e) => !doelEls.some((x) => e.contains(x) || x.contains(e)), true).filter(({ R }) => !(R.t >= G.t - 1 && R.b <= G.b + 1 && R.l >= G.l - 1 && R.r <= G.r + 1) && !(R.l < G.r - TOL && R.r > G.l + TOL && R.t < G.b - TOL && R.b > G.t + TOL) && afstandTot(R) >= MAAT.afstandTelefoon - 2.05 && !(R.t < G.b && R.b > G.t)); // (ook niet wat NAAST het vak staat: dat loopt mee met het vak)
    const kl = MAAT.rand;
    const kr = window.innerWidth - MAAT.rand;
    // Hoeveel eenheden staan er met deze schikking half in beeld of te dicht bij het vak?
    const slecht = (d, kt) => {
      const dek = [[-1e6, zone.top], [zone.bottom, 1e6], [kt, kt + kh]].sort((a, b) => a[0] - b[0]);
      return buiten.filter(({ R }) => {
        const t = R.t - d;
        const b = R.b - d;
        let zicht = b - t;
        let tot = t;
        for (const [a, z] of dek) {
          if (a === kt && !(R.r > kl && R.l < kr)) continue;
          const van = Math.max(a, tot);
          const naar = Math.min(z, b);
          if (naar > van) {
            zicht -= naar - van;
            tot = naar;
          }
        }
        if (zicht <= 1.5) return false; // een strook van hoogstens 1,5 px (afronding, onder de schaduw van de kaart) is niet te zien
        if (zicht < b - t - 1.5) return true;
        return Math.max(G.t - d - b, t - (G.b - d), G.l - R.r, R.l - G.r) < af - 1;
      }).length;
    };
    const eerst = slecht(p.schuif, p.boven);
    if (!eerst) return p;
    const kaartOnderMax = (isLaag() || rol ? uiterst.bottom : paginaZone.bottom) - MAAT.rand;
    // BESLISSING 750 (K2): koos de schikking de kaart over de vaste kop, dan is dat haar vaste plaats bovenaan; anders blijft ze onder de kop.
    const kaartBovenMin = (p.kant === 'vast-boven' && p.boven < paginaZone.top + MAAT.rand - 0.5 ? uiterst.top : paginaZone.top) + MAAT.rand;
    // De ruimte tot de kaart mag 11 tot 13 px zijn (BESLISSING 592, M1): 0,75 px meer of minder (de beeldpunten van het scherm ronden nog tot 0,25 px af) lost soms een rij op die anders 1 tot 2 px
    // onder de kaart uitsteekt. 12 heeft voorrang, en de kaart blijft zo dicht mogelijk bij haar vaste plaats.
    const zijden = {
      // kaart onderaan: de kaart staat a onder het vak, niet lager dan haar vaste plaats; het vak minstens rg onder de kop
      'vast-onder': (a) => {
        const van = Math.max(Math.ceil(G.b + a + kh - kaartOnderMax), Math.ceil(sMin));
        const tot = Math.min(Math.floor(G.t - zone.top - rg), Math.floor(sMax));
        const uit = [];
        for (let d = van; d <= tot; d++) uit.push({ d, kt: G.b - d + a, weg: d - van, a });
        return uit;
      },
      // kaart bovenaan: de kaart staat a boven het vak, niet hoger dan haar vaste plaats; het vak minstens rg boven de balk
      'vast-boven': (a) => {
        const van = Math.min(Math.floor(G.t - a - kh - kaartBovenMin), Math.floor(sMax));
        const tot = Math.max(Math.ceil(G.b - zone.bottom + rg), Math.ceil(sMin));
        const uit = [];
        for (let d = van; d >= tot; d--) uit.push({ d, kt: G.t - d - a - kh, weg: van - d, a });
        return uit;
      },
    };
    // De schikking met de minste halve of te dichte eenheden (een buur die de opmaak te dicht zet, kan er een blijven), eerst aan de kant waar de
    // kaart staat; bij gelijkstand de kleinste verschuiving van de kaart.
    let beste = { p, n: eerst };
    for (const kant of [p.kant, p.kant === 'vast-onder' ? 'vast-boven' : 'vast-onder']) {
      const lijst = [af, af - 0.75, af + 0.75].flatMap((a) => zijden[kant](a)).sort((x, y) => x.weg - y.weg || Math.abs(x.a - af) - Math.abs(y.a - af));
      for (const { d, kt } of lijst) {
        const n = slecht(d, kt);
        if (n < beste.n) beste = { p: { ...p, kant, schuif: d, boven: kt }, n };
        if (!n) return beste.p;
      }
    }
    return beste.p;
  }

  // BESLISSING 548: staat het onderdeel met deze schikking VOLLEDIG in het vrije vlak (tussen de vaste kop en de balk onderaan; in een blad of
  // de kop: in het venster), zonder dat de kaart erover ligt en zonder af te snijden?
  function staatVrij(p, s, el) {
    if (p.snij != null || p.nood) return false;
    const g = meetGat(s, el);
    const vast = staatVast(el) && !p.houder;
    const d = vast ? 0 : p.schuif;
    const boven = g.top - d;
    const onder = g.top + g.height - d;
    const kh = kaart.offsetHeight;
    const over = !(p.links + p.breedte <= g.left + 1 || p.links >= g.left + g.width - 1 || p.boven + kh <= boven + 1 || p.boven >= onder - 1);
    if (over) return false;
    if (vast) return boven >= -1 && onder <= window.innerHeight + 1;
    const rol = p.houder ? bladRol(el) : null;
    if (rol) return boven >= rol.top - 1 && onder <= rol.bottom + 1;
    const { zone } = vlakken(vanger);
    return boven >= zone.top - 1 && onder <= zone.bottom + 1;
  }
  // BESLISSING 548: een onderdeel in een open blad schuift niet mee met de pagina; wel met het blad zelf. Zoek de scrollende houder in het blad
  // en schuif die zo weinig mogelijk, zodat het onderdeel boven de kaart (kaart onderaan) of eronder (kaart bovenaan) volledig vrij staat.
  function schuifInBlad(el, s) {
    let houder = null;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        houder = e;
        break;
      }
      if (e.tagName === 'DIALOG') break;
    }
    if (!houder) return false;
    const { zone } = vlakken(vanger);
    const kh = kaart.offsetHeight;
    const g = meetGat(s, el);
    // Binnen het zichtbare deel van de houder, en boven een plakkende voet van het blad (de knoppen Bewaren en Annuleren).
    const hr = houder.getBoundingClientRect();
    let voet = hr.bottom;
    for (const e of el.closest('dialog').querySelectorAll('*')) {
      const p = getComputedStyle(e).position;
      if (p !== 'sticky' && p !== 'fixed') continue;
      const r = e.getBoundingClientRect();
      if (r.height > 0 && r.top > hr.top + hr.height / 2) voet = Math.min(voet, r.top);
    }
    const vlakken2 = [
      [Math.max(MAAT.rand, hr.top), Math.min(zone.bottom - MAAT.rand - kh - MAAT.afstand, voet)],
      [Math.max(zone.top + MAAT.rand + kh + MAAT.afstand, hr.top), Math.min(window.innerHeight - MAAT.rand, voet)],
    ];
    for (const [min, max] of vlakken2) {
      if (g.height > max - min) continue;
      const d = nodigeSchuif(g.top, g.top + g.height, min, max);
      const voor = houder.scrollTop;
      houder.scrollTop = voor + d;
      if (Math.abs(houder.scrollTop - voor - d) <= 1) return true;
      houder.scrollTop = voor;
    }
    return false;
  }
  // Schuift de houder van een open blad zo dat els er helemaal in staan, met ruimte eromheen: de lucht van het vak (margeTelefoon) plus de rand
  // tot de houder (randGatTelefoon). Staat een onderdeel tegen de onderrand van de houder (wat scrollIntoView doet), dan staat het tegen de
  // voet van het blad: de knoppen daar tellen als buren in de lucht, het blok is nooit heel en groeit door tot de hele inhoud van het blad.
  function brengInBlad(els) {
    if (!els.length || !els[0].closest('dialog')) return;
    let houder = null;
    for (let e = els[0].parentElement; e && e !== document.body; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        houder = e;
        break;
      }
      if (e.tagName === 'DIALOG') break;
    }
    if (!houder) return;
    const ruimte = MAAT.margeTelefoon + MAAT.randGatTelefoon;
    const hr = houder.getBoundingClientRect();
    const dozen = els.map((e) => e.getBoundingClientRect());
    const top = Math.min(...dozen.map((r) => r.top));
    const bottom = Math.max(...dozen.map((r) => r.bottom));
    if (bottom > hr.bottom - ruimte) houder.scrollTop += bottom - (hr.bottom - ruimte);
    else if (top < hr.top + ruimte) houder.scrollTop -= hr.top + ruimte - top;
  }
  // Het doel van de stap: het gewone onderdeel, of op een klein scherm het eerste kleinere deel dat volledig vrij past (stappen.js, `klein`).
  // Past niets volledig, dan het kleinste. De kaart heeft dan al haar tekst (haar hoogte telt mee).
  // inBlad: bij het begin van een stap mag een blad (dialog) eerst schuiven tot het onderdeel erin in beeld staat; bij het volgen niet.
  // BESLISSING 570: elke keuze wordt eerst een afgerond blok (blokVan: de kaart met haar kop, niets doorsneden); een keuze die toch iets
  // doorsnijdt, komt alleen als niets anders er is. Een afgerond deel (stap.deel, verdeelLijst) heeft zijn eigen rijen.
  function deelKeuze(stap) {
    const d = stap.deel;
    if (!d.els.every((e) => e.isConnected && zichtbaar(e))) {
      // Het scherm tekende opnieuw: dezelfde verdeling op de nieuwe elementen.
      const b = doelKeuzes(d.bron, { breed: window.innerWidth, hoog: window.innerHeight }).map((k) => blokVan(d.bron, k)).find(Boolean);
      // (de toets per deel zet even een andere tekst in de kaart om haar hoogte te meten: daarna staat de tekst van deze stap er weer)
      const bewaard = [stapLabel.textContent, titel.textContent, tekst.textContent, vorigeKnop.hidden];
      const nieuw = b ? delenVan(b.els, d.max, telefoon() ? MAAT.margeTelefoon : MAAT.marge, d.bron.zonderDeel, d.raster, d.kopTekst) : [];
      [stapLabel.textContent, titel.textContent, tekst.textContent, vorigeKnop.hidden] = bewaard;
      if (nieuw.length) d.els = nieuw[Math.min(d.nr, nieuw.length - 1)];
    }
    const a = afgerond(d.els, margeVoor(stap, d.els));
    // De hoeken van een deel volgen de kaart (hoogstens 12 px), niet de ronde vorm van een knop erin: zo snijdt een hoek niets af.
    return { keuze: { doel: stap.doel, ook: null, deel: `${d.nr + 1}/${d.van} ${d.tekst}`, els: d.els, zijden: a.zijden, lucht: a.lucht }, el: d.els[0] };
  }
  // BESLISSING 590 (teamlead): staat het gekozen blok met 12 px lucht niet volledig vrij (het valt net over de balk of onder de kop), dan
  // krimpt de lucht tot 6 px (krap) voor deze stap; nooit afsnijden.
  function kiesDoel(stap, opties = {}) {
    const k = kiesDoelMetLucht(stap, opties);
    if (!telefoon() || stap.krap || !k.el || !k.keuze) return k;
    const s = { ...stap, ...k.keuze };
    if (staatVrij(schik(s, k.el, { zonderSchuiven: false }), s, k.el)) return k;
    const krap = kiesDoelMetLucht({ ...stap, krap: true }, opties);
    if (!krap.el || !krap.keuze) return k;
    krap.keuze = { ...krap.keuze, krap: true };
    return krap;
  }
  function kiesDoelMetLucht(stap, { inBlad = false } = {}) {
    if (stap.midden) return { keuze: null, el: null };
    if (stap.deel) return deelKeuze(stap);
    const keuzes = doelKeuzes(stap, { breed: window.innerWidth, hoog: window.innerHeight });
    let beste = null;
    let reserve = null;
    let gesneden = false; // het laatst gekozen doel past niet: het vak zou boven de uitlegkaart afgesneden worden (schikking, snij)
    for (const k0 of keuzes) {
      // Een laatste redmiddel (stappen.js, klein met laatste: true) telt alleen als het doel ervoor afgesneden zou worden: de rand van het vak
      // snijdt nooit door een element. Staat dat doel in zijn geheel in beeld, dan blijft het.
      if (k0.laatste && beste && !gesneden) continue;
      // Een onderdeel in een open blad dat onder de onderrand van dat blad staat (Begint op en Stopt na in de supplementkaart): eerst in
      // beeld schuiven. Zonder dat is het blok nooit heel (het valt half buiten beeld) en groeit blokVan door tot de hele inhoud van het
      // blad, waardoor de stap het hele kaartje aanduidt in plaats van dat ene vak.
      if (inBlad) brengInBlad([vindDoel(k0.doel), vindDoel(k0.ook)].filter(Boolean));
      const b = blokVan(stap, k0);
      if (!b) continue;
      const k = { ...k0, els: b.els, zijden: b.zijden, lucht: b.lucht };
      const el = b.els[0];
      if (!b.heel) {
        reserve ||= { keuze: k, el };
        continue;
      }
      beste = { keuze: k, el };
      if (keuzes.length === 1 && !(inBlad && el.closest('dialog'))) break;
      const s = { ...stap, ...k };
      if (inBlad && el.closest('dialog')) el.scrollIntoView({ block: window.innerHeight < 560 ? 'start' : 'nearest', inline: 'nearest', behavior: 'instant' });
      const p = schik(s, el);
      if (staatVrij(p, s, el)) break;
      gesneden = p.snij != null;
      // Een onderdeel in een blad dat zelf scrolt: het blad zo schuiven dat het onderdeel boven of onder de kaart vrij staat.
      if (inBlad && el.closest('dialog') && schuifInBlad(el, s) && staatVrij(schik(s, el), s, el)) break;
    }
    return beste || reserve || { keuze: keuzes[0] ?? null, el: null };
  }
  function zetKeuze(k) {
    if (doelEl && doelEl !== k.el && maatWaarnemer) maatWaarnemer.unobserve(doelEl);
    if (k.el && k.el !== doelEl && maatWaarnemer) maatWaarnemer.observe(k.el);
    doelEl = k.el;
    keuze = k.keuze;
    kaart.dataset.doel = keuze?.doel ?? '';
    kaart.dataset.ook = keuze?.ook ?? '';
    kaart.dataset.deel = keuze?.deel ?? '';
  }

  // ---- BESLISSING 570: een stap waarvan het blok op een telefoon niet naast de uitlegkaart past, wordt verdeeld in afgeronde delen ----
  // BESLISSING 648: de titel en tekst van een stap voor dit toestel (BESLISSING 590), met de kleurnamen van het scherm waarop de stap loopt
  // en van het thema van dit moment (kleurnamen.js). Het scherm is #scherm[data-scherm] (een handleiding gaat eerst naar haar scherm, een
  // pop-up ligt boven het scherm); zonder #scherm het scherm van de rondleiding zelf. Wisselt het thema, dan rekent volg() de tekst opnieuw.
  function tekstHier(stap) {
    const tt = tekstVoorToestel(stap, toestel());
    const scherm = document.getElementById('scherm')?.dataset.scherm || (sleutel.startsWith('h:') ? HANDELING_SCHERM[sleutel.slice(2)] : sleutel);
    const stand = { scherm, thema: document.documentElement.dataset.theme || 'poeder' };
    return { titel: vulKleuren(tt.titel, stand), tekst: vulKleuren(tt.tekst, stand) };
  }
  // De kaart krijgt even de tekst van de stap om haar hoogte te meten; toon() zet daarna de echte tekst.
  function kaartHoogteVoor(stap0) {
    const stap = { ...stap0, ...tekstHier(stap0) };
    const { gebied } = vlakken(vanger);
    const breedte = telefoon() ? window.innerWidth - 2 * MAAT.rand : Math.min(window.innerHeight < 560 ? MAAT.kaartBreedLaag : MAAT.kaartBreed, (gebied ? gebied.rechts - gebied.links : window.innerWidth) - 2 * MAAT.rand);
    kaart.style.setProperty('--kb', breedte + 'px');
    stapLabel.textContent = t('uitleg.stapVan', { nr: '10', totaal: '10' });
    titel.textContent = stap.titel;
    tekst.textContent = stap.tekst;
    vorigeKnop.hidden = false;
    return kaart.offsetHeight;
  }
  // De hoogte die een blok mag hebben: tussen de vaste kop en de kaart onderaan (op een lage telefoon mag de kaart over de balk), nooit onder de balk.
  // overKop: reken ook met de kaart over de vaste kop (BESLISSING 750). Op een telefoon altijd (elk deel wordt daar met de echte plaatsing
  // getoetst); op een liggende telefoon alleen waar de aanroeper zelf de echte plaatsing toetst (past, in verdeel).
  function beschikbaar(kh, overKop = telefoon()) {
    const { zone, uiterst } = vlakken(vanger);
    const tel = telefoon();
    const af = tel ? MAAT.afstandTelefoon : MAAT.afstand;
    const rg = tel ? MAAT.randGatTelefoon : MAAT.rand;
    const onder = Math.min((isLaag() ? uiterst.bottom : zone.bottom) - MAAT.rand - kh - af, zone.bottom - rg);
    // BESLISSING 750 (K2): met de kaart over de vaste kop bovenaan (alleen onder 600 px hoogte: uiterst.top ligt dan boven de kop) staat het
    // blok onder de kaart, tot boven de balk.
    const metKaartBoven = overKop && uiterst.top < zone.top - 0.5 ? zone.bottom - rg - Math.max(uiterst.top + MAAT.rand + kh + af, zone.top + rg) - 12 : -Infinity;
    // 12 px veiligheid: het vak volgt de inhoud en kan daardoor een paar pixels anders uitvallen dan de rijen waarmee hier gerekend wordt
    return Math.max(onder - (zone.top + rg) - 12, metKaartBoven);
  }
  // (een deel van een raster heeft aan een snede alleen de halve tussenruimte als lucht, BESLISSING 656)
  const hoogteVan = (els, marge) => {
    const v = zichtOmhulsel(els);
    const rl = rasterLucht(els, v);
    return v.b - v.t + (rl?.t ?? marge) + (rl?.b ?? marge);
  };
  function verdeel(stap) {
    if (!kleinScherm() || stap.midden || stap.voor || !stap.doel || stap.zelf) return [stap]; // zelf: het doel blijft zoals het is, dus ook niet in delen
    const marge = telefoon() ? MAAT.margeTelefoon : MAAT.marge;
    // Past een doel van de stap (het gewone of een kleiner, klein) in één keer naast de kaart met deze tekst?
    let eerste = null;
    let vast = false;
    const past = (s) => {
      const kh = kaartHoogteVoor(s);
      const ruimte = beschikbaar(kh, true);
      const zonderKop = beschikbaar(kh, false); // de ruimte zonder de kaart over de vaste kop
      for (const k of doelKeuzes(s, { breed: window.innerWidth, hoog: window.innerHeight })) {
        const b = blokVan(s, k);
        if (!b) continue;
        if (staatVast(b.els[0])) vast = true;
        eerste ||= b;
        if (b !== eerste && s.stukken && !s.zonderKopGroei && zonderKopVan(eerste, b)) continue; // (alleen met eigen teksten per deel)
        const v = rh(omhulsel(b.els));
        if (b.heel && v.b - v.t + b.zijden.t + b.zijden.b <= ruimte + 0.5) {
          // BESLISSING 592: op een telefoon beslist de plaatsing zelf (met de echte kaart en de vaste maten), niet alleen de hoogte
          // (een liggende telefoon: past het blok alleen met de kaart over de vaste kop, BESLISSING 750, dan beslist ook daar de echte plaatsing)
          if (staatVast(b.els[0]) || (!telefoon() && v.b - v.t + b.zijden.t + b.zijden.b <= zonderKop + 0.5)) return true;
          const s2 = { ...s, ...k, els: b.els, zijden: b.zijden, lucht: b.lucht };
          if (staatVrij(schik(s2, b.els[0]), s2, b.els[0])) return true;
        }
      }
      return vast;
    };
    if (past(stap)) return [stap];
    // Met 6 px lucht in plaats van 12 (krap), dan een kortere telefoontekst met dezelfde inhoud (TOESTEL_TEKST, kort), en die twee samen.
    for (const proef of [{ krap: true }, { kort: true }, { krap: true, kort: true }]) {
      if (proef.kort && !heeftKort(stap)) continue;
      if (past({ ...stap, ...proef })) return [{ ...stap, ...proef }];
    }
    // Een stap met kleinere doelen (klein) gaat over dat ene deel; het grotere doel verdelen zou stappen tonen die er nog komen.
    // (BESLISSING 627: werd elk kleiner doel een deel van dezelfde kaart zonder haar kop, dan groeide het tot die hele kaart (metKop): past ze
    // niet, dan wordt ze verdeeld zoals elke andere kaart.)
    const scherm = { breed: window.innerWidth, hoog: window.innerHeight };
    const alleenKaart = !stap.zonderKopGroei && Boolean(eerste) && eerste.els.length === 1 && doelKeuzes(stap, scherm).map((k) => blokVan(stap, k)).filter(Boolean).every((b) => (b.els.length === 1 && b.els[0] === eerste.els[0]) || (stap.stukken && zonderKopVan(eerste, b)));
    if (!eerste || (stap.klein?.length && !alleenKaart)) return [{ ...stap, krap: true, ...(heeftKort(stap) ? { kort: true } : {}) }];
    // (staat de hele kaart met de echte plaatsing toch vrij, zoals kiesDoel ze kiest, dan blijft het die ene stap, op de rand van de kaart)
    if (stap.klein?.length && telefoon()) {
      const s2 = { ...stap, krap: true, els: eerste.els, zijden: eerste.zijden, lucht: eerste.lucht };
      kaartHoogteVoor(stap);
      if (eerste.heel && staatVrij(schik(s2, eerste.els[0]), s2, eerste.els[0])) return [{ ...stap, krap: true, ...(heeftKort(stap) ? { kort: true } : {}) }];
    }
    let max = beschikbaar(kaartHoogteVoor(stap));
    // Een deel met een langere tekst heeft een hogere kaart: dan opnieuw verdelen met wat dat deel werkelijk overlaat.
    // Zo weinig delen als kan: begin met de ruimte naast de laagste kaart (één regel tekst) en verklein tot elk deel met zijn eigen tekst past.
    max = Math.max(max, beschikbaar(kaartHoogteVoor({ ...stap, titel: stap.titel, tekst: '.' })));
    // BESLISSING 656: snijdt de verdeling een raster (de weken van de maandkalender), dan is die ruimte gemeten met de pagina geschoven tot bij het
    // blok: zo staat de vaste kop zoals hij staat wanneer het blok in beeld komt (lager dan bovenaan de pagina).
    // BESLISSING 627: heeft de stap een eigen tekst (een stuk) voor de kop van de kaart? Alleen dan mag die kop een deel op zich zijn.
    const kopTekst = (els) => (stap.stukken?.stukken ?? []).some((s) => {
      const b = vindDoel(s.bij);
      return Boolean(b) && els.some((e) => e === b || e.contains(b));
    });
    if (stap.raster && telefoon() && !gang && delenVan(eerste.els, max, marge, stap.zonderDeel, { past: null }, kopTekst).some((d) => d.raster)) {
      const y0 = window.scrollY;
      window.scrollTo({ top: Math.max(0, eerste.els[0].getBoundingClientRect().top + y0 - window.innerHeight / 3), behavior: 'instant' });
      try {
        max = Math.max(max, beschikbaar(kaartHoogteVoor({ ...stap, titel: stap.titel, tekst: '.' })));
      } finally {
        window.scrollTo({ top: y0, behavior: 'instant' });
      }
    }
    let delen = [];
    let teksten = [];
    const vorm = (lijst) => lijst.map((d) => d.length).join(',');
    // BESLISSING 592: op een telefoon telt ook of het deel met de echte plaatsing past (de vaste kop van Vandaag staat bovenaan de pagina lager
    // dan wanneer de pagina geschoven is: de hoogte alleen zegt dan te veel); past het niet, dan wordt de ruimte kleiner of de lucht 6 px.
    // BESLISSING 656: een deel van een raster (de weken van de maandkalender) staat lager op de pagina; zodra de pagina ernaartoe schuift, is de
    // vaste kop van het Dagboek lager. Bij het verdelen (de rondleiding staat nog bovenaan) meet de toets daarom met de pagina even geschoven
    // tot bij het deel, en zet ze daarna terug.
    const plaatsPast = (d, tekst, lucht) => {
      if (!telefoon()) return true;
      const y0 = window.scrollY;
      const schuif = Boolean(d.raster) && !gang;
      if (schuif) window.scrollTo({ top: Math.max(0, d[0].getBoundingClientRect().top + y0 - window.innerHeight / 3), behavior: 'instant' });
      try {
        kaartHoogteVoor({ ...stap, ...tekst });
        const a = afgerond(d, lucht);
        const s2 = { ...stap, ...tekst, els: d, zijden: a.zijden, lucht: a.lucht };
        return staatVrij(schik(s2, d[0]), s2, d[0]);
      } finally {
        if (schuif) window.scrollTo({ top: y0, behavior: 'instant' });
      }
    };
    // BESLISSING 656: een blok met een raster (de weken van de maandkalender) wordt verdeeld met per deel zijn eigen tekst (delenTelefoon): past
    // het deel met die tekst op de hoogte, of met de echte plaatsing (de vaste kop is lager zodra de pagina geschoven is).
    const pastMetTekst = (d, hoogte, eerste) => {
      let tk = tekstenVoorDelen(stap, [d])[0];
      if (tk.bron === 'heel' && !eerste) tk = vervolgTekst(stap, d);
      return hoogte <= beschikbaar(kaartHoogteVoor({ ...stap, ...tk })) + 0.5 || plaatsPast(d, tk, marge);
    };
    let nogTeKrap = false;
    for (let poging = 0; poging < 12; poging++) {
      const nieuw = delenVan(eerste.els, max, marge, stap.zonderDeel, stap.raster ? { past: pastMetTekst } : null, kopTekst);
      // Verandert de verdeling niet meer bij een kleinere ruimte (een deel van één beeld, zoals het glas), dan houdt het op.
      if (poging > 0 && vorm(nieuw) === vorm(delen) && !nogTeKrap) break; // (op een telefoon: zolang een deel met de echte plaatsing niet past, verder verkleinen)
      delen = nieuw;
      teksten = tekstenVoorDelen(stap, delen);
      const plaatsTekort = delen.some((d, i) => !d.enkel && !plaatsPast(d, teksten[i], marge));
      nogTeKrap = plaatsTekort;
      // (een deel van een raster: alleen de echte plaatsing telt, BESLISSING 656; de hoogte alleen rekent met de vaste kop van een ongeschoven pagina)
      const tekort = Math.min(0, ...delen.map((d, i) => (d.enkel || d.raster ? 0 : beschikbaar(kaartHoogteVoor({ ...stap, ...teksten[i] })) - hoogteVan(d, marge))), plaatsTekort ? -8 : 0);
      if (tekort >= -0.5) break;
      max += Math.min(tekort, -1) - 0.5;
    }
    if (!delen.length) return [stap];
    // BESLISSING 627, een stap met kleinere doelen die alle tot de hele kaart groeiden: lukt de verdeling niet in echte blokken (een kop alleen
    // zonder eigen tekst, omdat de rijen eronder niet te scheiden zijn; een deel dat iets doorsnijdt of niet past), dan blijft de stap zoals ze was.
    if (stap.klein?.length) {
      const losseKop = delen.some((d, i) => i < delen.length - 1 && d.every((e) => e.matches(KOPACHTIG)) && !kopTekst(d));
      if (losseKop || nogTeKrap || delen.some((d) => !afgerond(d, marge).heel)) return [{ ...stap, krap: true, ...(heeftKort(stap) ? { kort: true } : {}) }];
    }
    // BESLISSING 627, zonder eigen teksten per deel (STUKKEN in stappen.js): een deel mag nooit een vultekst ("..., verder", "Ook dit hoort
    // erbij") tonen. Zou de hele kaart met haar kop alleen in delen passen, dan blijft de stap zoals ze was (zonderKopGroei), tot de stap zijn
    // eigen teksten per deel heeft.
    if (delen.length > 1 && !stap.stukken && !stap.zonderKopGroei) return verdeel({ ...stap, zonderKopGroei: true });
    // Eén deel: het hele blok zonder de rijen met een eigen stap (zonderDeel), met de gewone tekst.
    if (delen.length === 1) teksten = [{ titel: stap.titel, tekst: stap.tekst, bron: 'heel' }];
    // Een deel dat ook alleen niet past (één beeld, zoals het glas van Drinken): 6 px lucht in plaats van 12.
    return delen.map((els, i) => {
      // Past ook dat niet, dan de kortere tekst van het stuk (kort), als die er is.
      if (teksten[i].kort && hoogteVan(els, MAAT.margeKrap) > beschikbaar(kaartHoogteVoor({ ...stap, ...teksten[i] })) + 0.5) teksten[i] = { ...teksten[i], tekst: teksten[i].kort };
      const krap = (!els.raster && hoogteVan(els, marge) > beschikbaar(kaartHoogteVoor({ ...stap, ...teksten[i] })) + 0.5) || !plaatsPast(els, teksten[i], marge);
      return { ...stap, id: `${stap.id}.${i + 1}`, titel: teksten[i].titel, tekst: teksten[i].tekst, ...(krap ? { krap: true } : {}), deel: { nr: i, van: delen.length, els, max, bron: stap, tekst: teksten[i].bron, raster: stap.raster ? { past: pastMetTekst } : null, kopTekst } };
    });
  }
  // De verdeling hoort bij een venstermaat (ontwerp 3.4): oorsprong onthoudt per getoonde stap de stap waaruit ze verdeeld werd.
  const oorsprong = new WeakMap();
  const venstermaat = () => `${window.innerWidth}x${window.innerHeight}`;
  let verdeeldOp = '';
  function verdeelLijst() {
    lijst = lijst.flatMap((s) => {
      const uit = verdeel(s);
      for (const x of uit) oorsprong.set(x, s);
      return uit;
    }).slice(0, Math.max(maxStappen, 0) || undefined);
    const beginIndex = Math.max(0, vanaf ? lijst.findIndex((s) => s.id === vanaf || s.deel?.bron.id === vanaf) : 0);
    gang = verloop(lijst.length, beginIndex);
    verdeeldOp = venstermaat();
  }
  // Een andere venstermaat (draaien, een kleiner venster): de lopende stap en haar delen opnieuw verdelen. De rondleiding blijft op het deel met
  // het element dat bovenaan het vak stond (niet op hetzelfde nummer); de teller rekent mee. Andere stappen worden verdeeld als ze aan de beurt zijn
  // niet opnieuw: alleen de lopende.
  function herverdeel() {
    if (!gang || verdeeldOp === venstermaat() || Number.isFinite(maxStappen)) return;
    verdeeldOp = venstermaat();
    const nu = lijst[gang.index];
    const bron = nu && oorsprong.get(nu);
    if (!bron || nu.midden || nu.voor) return;
    let van = gang.index;
    while (van > 0 && oorsprong.get(lijst[van - 1]) === bron) van -= 1;
    let tot = gang.index;
    while (tot < lijst.length - 1 && oorsprong.get(lijst[tot + 1]) === bron) tot += 1;
    const boven = nu.deel ? nu.deel.els[0] : doelEl;
    // (verdeel zet even een andere tekst in de kaart om haar hoogte te meten: daarna staat de tekst van deze stap er weer)
    const bewaard = [stapLabel.textContent, titel.textContent, tekst.textContent, vorigeKnop.hidden];
    let nieuw;
    try {
      nieuw = verdeel(bron);
    } finally {
      [stapLabel.textContent, titel.textContent, tekst.textContent, vorigeKnop.hidden] = bewaard;
    }
    // (BESLISSING 627: een deel zonder eigen tekst, met de hele tekst van de stap, komt er niet bij; dan blijft de stap zoals ze was, zoals
    // verdeel() dat ook doet zolang een stap geen eigen teksten per deel heeft)
    if (!nieuw?.length || (nieuw.length > 1 && nieuw.some((s) => s.deel?.tekst === 'heel'))) return;
    const oud = lijst.slice(van, tot + 1);
    const gelijk = (a, b) => a.titel === b.titel && a.tekst === b.tekst && Boolean(a.krap) === Boolean(b.krap) && Boolean(a.kort) === Boolean(b.kort) && (a.deel?.els ?? []).length === (b.deel?.els ?? []).length && (a.deel?.els ?? []).every((e, j) => e === b.deel.els[j]);
    if (nieuw.length === oud.length && nieuw.every((s, i) => gelijk(s, oud[i]))) return;
    for (const x of nieuw) oorsprong.set(x, bron);
    let i = boven ? nieuw.findIndex((s) => !s.deel || s.deel.els.some((e) => e === boven || e.contains(boven) || boven.contains(e))) : -1;
    if (i < 0) i = Math.min(gang.index - van, nieuw.length - 1);
    lijst.splice(van, tot - van + 1, ...nieuw);
    gang = verloop(lijst.length, van + i);
    stapLabel.textContent = t('uitleg.stapVan', { nr: String(gang.nr), totaal: String(lijst.length) });
    vorigeKnop.hidden = gang.isEerste;
    vorigeKnop.disabled = gang.isEerste;
    volgendeKnop.querySelector('.knop__tekst').textContent = gang.isLaatste ? t('uitleg.klaar') : t('uitleg.volgende');
  }

  // BESLISSING 590: de tekst voor dit toestel (smal of breed, aanraking of muis); bij een andere indeling (draaien, een groter venster) wisselt ze mee.
  function zetTeksten(stap) {
    const tt = tekstHier(stap);
    if (titel.textContent === tt.titel && tekst.textContent === tt.tekst) return;
    titel.textContent = tt.titel;
    tekst.textContent = tt.tekst;
    status.textContent = `${stapLabel.textContent}. ${tt.titel}. ${tt.tekst}`;
  }

  function zetKant(p) {
    kaart.dataset.kant = p.kant;
    if (p.pijl != null) kaart.style.setProperty('--pijl', p.pijl + 'px');
    laag.classList.toggle('is-midden', p.kant === 'midden');
  }

  // Volgt het scherm: bij scrollen, een andere venstermaat of inhoud die verandert blijft het gat op het onderdeel.
  // herschik = opnieuw kiezen waar het kaartje staat (na een maatwijziging); anders blijft de kant en volgt het kaartje het gat.
  function volg(herschik) {
    if (actief !== handvat || !gang) return; // (de lijst is pas verdeeld als het scherm stilstaat)
    if (anim) {
      naAnim ||= herschik;
      return;
    }
    if (herschik) herverdeel();
    const basis = lijst[gang.index];
    // Het scherm tekende opnieuw (een dagwissel, nieuwe gegevens): het onderdeel opnieuw zoeken en volgen.
    // Ook als het onderdeel niet meer zichtbaar is: na het draaien van een tablet wordt de balk onderaan de zijbalk (en omgekeerd).
    // Een andere maat (draaien, een grotere letter): opnieuw kiezen welk deel past (BESLISSING 548).
    if (!basis.midden && (herschik || !doelEl || !doelEl.isConnected || !zichtbaar(doelEl))) {
      const k = kiesDoel(basis);
      if (k.el) zetKeuze(k);
    }
    const stap = eff(basis);
    const el = stap.midden ? null : doelEl;
    if (herschik || !plan) {
      zetFamilie(laag); // een ander thema of een hertekend scherm: de knoptokens opnieuw lezen
      zetTeksten(basis); // een andere indeling: de tekst voor dat toestel
      plan = schik(stap, el, { voorkeur: plan?.kant ?? null });
      schuifMet(plan, plan.schuif);
      plan.schuif = 0;
      zetKant(plan);
      teken({ gat: meetGat(stap, el, plan.snij), kaart: { links: plan.links, boven: plan.boven } });
      return;
    }
    // Alleen scrollen: het gat volgt het onderdeel, het kaartje blijft op zijn kant (op een telefoon staat het vast).
    const g = meetGat(stap, el, plan.snij);
    let k = { links: plan.links, boven: plan.boven };
    if (!telefoon() && el && beeld) {
      const dy = g.top - beeld.gat.top;
      const { zone } = vlakken(vanger);
      if (plan.kant !== 'vast' && plan.kant !== 'midden') k = { links: beeld.kaart.links, boven: klem(beeld.kaart.boven + dy, zone.top + MAAT.rand, zone.bottom - MAAT.rand - kaart.offsetHeight) };
      plan.boven = k.boven;
    }
    // Op een telefoon staat de kaart nooit over de vaste kop. Na het scrollen kan die kop hoger worden (de schermkop gaat plakken): dan zakt
    // de kaart mee tot onder de kop. (plan.boven blijft haar plaats: wordt de kop weer lager, dan keert ze terug.)
    if (telefoon() && (plan.kant === 'vast-boven' || plan.kant === 'vast-onder')) k = { ...k, boven: Math.max(plan.boven, vlakken(vanger).zone.top + MAAT.rand) };
    // Zou de kaart nu over het onderdeel komen (de pagina schoof door een andere maat, de kaart werd tegen een rand geduwd), dan kiest ze
    // opnieuw haar plaats, zonder de pagina te verschuiven: wie zelf scrolt, wordt niet teruggezet.
    const kb = kaart.offsetWidth;
    const kh = kaart.offsetHeight;
    if (el && g.width > 0 && g.height > 0 && !(k.links + kb <= g.left + 1 || k.links >= g.left + g.width - 1 || k.boven + kh <= g.top + 1 || k.boven >= g.top + g.height - 1)) {
      plan = schik(stap, el, { zonderSchuiven: true, voorkeur: plan?.kant ?? null });
      plan.schuif = 0;
      zetKant(plan);
      teken({ gat: meetGat(stap, el, plan.snij), kaart: { links: plan.links, boven: plan.boven } });
      return;
    }
    teken({ gat: g, kaart: k });
  }

  // De overgang naar een stap: de pagina schuift, het gat en het kaartje bewegen in één rustige beweging naar hun plaats.
  function beweeg(stap, el) {
    cancelAnimationFrame(anim);
    anim = null;
    naAnim = false;
    // Bij een nieuwe stap blijft de kaart op dezelfde kant als dat kan (op een telefoon: onderaan of bovenaan), zodat Volgende onder de vinger blijft.
    const p = schik(stap, el, { voorkeur: plan?.kant ?? null });
    plan = p;
    const wortel = p.houder || document.scrollingElement || document.documentElement;
    const rolNaar = (y) => (p.houder || window).scrollTo({ top: y, behavior: 'instant' });
    const vanY = wortel.scrollTop;
    const naarY = vanY + p.schuif;
    const naarKaart = { links: p.links, boven: p.boven };
    zetKant(p);
    if (!beeld || zonderBeweging()) {
      if (p.schuif) rolNaar(naarY);
      plan.schuif = 0;
      teken({ gat: meetGat(stap, el, p.snij), kaart: naarKaart });
      return;
    }
    const van = beeld;
    const begin = performance.now();
    const zacht = (x) => 1 - Math.pow(1 - x, 3);
    const tussen = (a, b, f) => a + (b - a) * f;
    const stapje = (nu) => {
      const f = zacht(Math.min(1, (nu - begin) / MAAT.duur));
      if (p.schuif) rolNaar(tussen(vanY, naarY, f));
      const doel = meetGat(stap, el, p.snij);
      teken({
        gat: { left: tussen(van.gat.left, doel.left, f), top: tussen(van.gat.top, doel.top, f), width: tussen(van.gat.width, doel.width, f), height: tussen(van.gat.height, doel.height, f), straal: tussen(van.gat.straal, doel.straal, f) },
        kaart: { links: tussen(van.kaart.links, naarKaart.links, f), boven: tussen(van.kaart.boven, naarKaart.boven, f) },
      });
      if (f < 1) anim = requestAnimationFrame(stapje);
      else {
        anim = null;
        plan.schuif = 0;
        teken({ gat: meetGat(stap, el, p.snij), kaart: naarKaart });
        // Iets veranderde van maat terwijl het gat bewoog (een blad dat nog inschoof): nu opnieuw schikken.
        if (naAnim) {
          naAnim = false;
          volg(true);
        }
      }
    };
    anim = requestAnimationFrame(stapje);
  }

  // Op elk scherm krijgt de pagina tijdens de rondleiding extra ruimte onderaan, zodat ook een onderdeel onderaan boven het kaartje kan staan.
  const ruimte = h('div', { class: 'uitleg__ruimte', 'aria-hidden': 'true' });
  ruimte.style.setProperty('height', '70vh');
  (telefoon() ? document.getElementById('app') || document.body : document.getElementById('scherm') || document.body).append(ruimte);

  let opruimActie = null;
  let slag = 0; // een nieuwe stap maakt een lopende (async) stap ongeldig
  async function ruimActieOp() {
    const stop = opruimActie;
    opruimActie = null;
    try {
      await stop?.();
    } catch {
      /* een sluitfunctie die faalt mag de rondleiding niet breken */
    }
  }
  // Een blad (dialog) dat een stap opent ligt in de bovenste laag en maakt de rest van de pagina inert. De laag van de rondleiding
  // gaat dan ín het blad (zo blijft het kaartje tikbaar) en opnieuw bovenop (popover); daarna weer terug in de pagina.
  const isOpen = () => {
    try {
      return laag.matches(':popover-open');
    } catch {
      return false;
    }
  };
  function leg(ouder) {
    try {
      if (isOpen()) laag.hidePopover();
    } catch {
      /* geen popover */
    }
    if (laag.parentNode !== ouder) ouder.append(laag);
    try {
      laag.showPopover?.();
    } catch {
      /* zonder popover blijft de laag gewoon bovenaan de pagina */
    }
  }
  const bovenop = () => leg([...document.querySelectorAll('dialog[open]')].pop() || document.body);
  // vooraf (stappen.js): een stap die eerst iets opent (voor) en waarvan het onderdeel er niet altijd is (De momenten bij een supplement dat je
  // niet elke dag neemt). Voor de eerste stap opent de rondleiding dat blad een keer onzichtbaar (css: .uitleg-meet), kijkt welke onderdelen er
  // staan en sluit het weer. Wat er niet is, gaat nu al uit de lijst: de teller zegt van bij stap 1 het juiste aantal, in plaats van halverwege te
  // verspringen. Mislukt het meten, dan blijft alles zoals het was (de stap valt dan weg op het moment zelf, zie toon()).
  let voorafGemeten = false;
  async function meetVooraf() {
    const namen = [...new Set(lijst.filter((s) => s.vooraf && s.voor && s.doel && !s.midden).map((s) => s.voor))];
    if (!namen.length) return;
    const hier = lijst[gang.index];
    document.documentElement.classList.add('uitleg-meet');
    try {
      for (const naam of namen) {
        let sluitFn = null;
        try {
          sluitFn = await vindActie(naam)?.({ kijkstand: true });
          await new Promise((klaar) => requestAnimationFrame(() => requestAnimationFrame(klaar)));
          const weg = new Set(lijst.filter((s) => s.vooraf && s.voor === naam && !vindDoel(s.doel)));
          // (staat er niets van dit blad, dan opende de actie niets: dat regelt toon() zelf, met het vangnet)
          if (weg.size && lijst.some((s) => s.voor === naam && s.doel && vindDoel(s.doel))) lijst = lijst.filter((s) => !weg.has(s));
        } catch {
          /* niet gemeten: de stap valt weg wanneer ze aan de beurt is */
        }
        try {
          if (typeof sluitFn === 'function') await sluitFn();
        } catch {
          /* een sluitfunctie die faalt mag de rondleiding niet breken */
        }
      }
      // Het blad sluit soms met een korte beweging: onzichtbaar blijven tot het echt dicht is (hoogstens een halve seconde).
      for (let i = 0; i < 30 && document.querySelector('dialog[open]'); i++) await new Promise((klaar) => requestAnimationFrame(klaar));
    } finally {
      document.documentElement.classList.remove('uitleg-meet');
    }
    gang = verloop(lijst.length, Math.max(0, lijst.indexOf(hier)));
  }
  async function toon() {
    if (!voorafGemeten && gang) {
      voorafGemeten = true;
      const mijnStart = slag;
      await meetVooraf();
      if (mijnStart !== slag || actief !== handvat) return;
    }
    if (!lijst.length) {
      // Alles viel weg (verdeeld of zonder onderdeel): het vangnet, of dicht als er geen vangnet is.
      if (!vangnet) return sluit(false);
      lijst = [stapNiets()];
      gang = verloop(1, 0);
    }
    const mijn = ++slag;
    const stap = lijst[gang.index];
    if (laag.parentNode !== document.body) leg(document.body);
    await ruimActieOp();
    if (stap.voor) {
      try {
        const sluitFn = await vindActie(stap.voor)?.({ kijkstand: true });
        opruimActie = typeof sluitFn === 'function' ? sluitFn : null;
      } catch {
        opruimActie = null;
      }
      await new Promise((klaar) => requestAnimationFrame(() => requestAnimationFrame(klaar)));
    }
    if (mijn !== slag || actief !== handvat) {
      if (mijn === slag) await ruimActieOp();
      return;
    }
    // Een stap die eerst iets opent (voor): de actie is geregistreerd, maar opende niets met het onderdeel van de stap (een vers profiel zonder
    // supplement: er is geen supplement om te openen). Zoals elke stap zonder onderdeel valt ze weg (kiesAanwezig), in plaats van een leeg vak
    // te tonen met een tekst over iets wat niet op het scherm staat. De teller telt daarna alleen wat getoond wordt.
    if (stap.voor && !stap.midden && stap.doel && !vindDoel(stap.doel)) {
      await ruimActieOp();
      if (mijn !== slag || actief !== handvat) return;
      lijst.splice(gang.index, 1);
      if (!lijst.length) {
        // BESLISSING 694: de laatste stap viel weg; het vangnet toont Nog niets te zien in de plaats (zonder vangnet: dicht).
        if (!vangnet) {
          sluit(false);
          return;
        }
        lijst = [stapNiets()];
        gang = verloop(1, 0);
        toon();
        return;
      }
      const terug = richtingNu < 0 ? 1 : 0;
      gang = verloop(lijst.length, Math.min(Math.max(gang.index - terug, 0), lijst.length - 1));
      toon();
      return;
    }
    bovenop();
    aanbodRij.hidden = true;
    // BESLISSING 563: de handeling toont geen stap die deze rondleiding net toonde (zelfde doel of titel). Blijven er minder dan twee nieuwe
    // stappen over, dan is er geen vraag en geen knop.
    const gezien = gang.isLaatste && !sleutel.startsWith('h:') ? alGezien(lijst) : null;
    const aanbodId = gezien && AANBOD[sleutel] && nieuweStappen('h:' + AANBOD[sleutel], gezien).length >= 2 ? AANBOD[sleutel] : null;
    if (aanbodId) {
      // BESLISSING 579 (ontwerp deel D): de eigen, volledige vraag van het onderwerp. Ontbreekt ze, dan de knop alleen, zonder kromme zin.
      // (t geeft bij een ontbrekende tekst de sleutel zelf terug, met een waarschuwing in de console.)
      const vraagSleutel = 'uitleg.aanbodVraag.' + aanbodId;
      const vraag = t(vraagSleutel);
      aanbodTekst.textContent = vraag === vraagSleutel ? '' : vraag;
      aanbodTekst.hidden = vraag === vraagSleutel;
      aanbodKnop.setAttribute('aria-label', t('uitleg.aanbodKnop') + ': ' + t('uitleg.onderwerp.' + aanbodId));
      aanbodKnop.onclick = () => {
        // BESLISSING 694 (B): in een keten vanuit het scherm Uitleg (terugNaarVorig) en op hetzelfde scherm sluit deze rondleiding zonder terug
        // te keren en geeft ze haar geschiedenisingang door; het scherm Uitleg komt pas na de laatste Klaar terug. Elders zoals vroeger.
        const nu = window.location.hash.replace(/^#\/?/, '');
        const route = HANDELING_SCHERM[aanbodId];
        if (terugNaarVorig && (!route || route === 'hier' || route === nu)) {
          const doorgeven = sluit(true, 'aanbod');
          if (!startHandeling(aanbodId, { zonder: gezien, terugNaarVorig: true, ingang: doorgeven })) doorgeven?.los();
          return;
        }
        sluit(true);
        startHandeling(aanbodId, { zonder: gezien });
      };
      aanbodRij.hidden = false;
    }
    stapLabel.textContent = t('uitleg.stapVan', { nr: String(gang.nr), totaal: String(lijst.length) });
    zetTeksten(stap);
    // In stap 1 bestaat Vorige niet (geen onzichtbare knop, BESLISSING 346): de rij heeft dan twee even brede knoppen in plaats van drie.
    vorigeKnop.hidden = gang.isEerste;
    vorigeKnop.disabled = gang.isEerste;
    volgendeKnop.querySelector('.knop__tekst').textContent = gang.isLaatste ? t('uitleg.klaar') : t('uitleg.volgende');
    overslaanKnop.hidden = false;
    zetFamilie(laag);
    // Het onderdeel (BESLISSING 548: op een klein scherm het deel dat volledig past), pas nu de kaart haar tekst heeft. Het onderdeel zelf
    // veranderen van maat (een pop-up die openklapt, een andere lettergrootte): de maatwaarnemer meet dan opnieuw.
    // Een onderdeel in een blad dat zelf scrolt: eerst binnen het blad in beeld (op een laag scherm bovenaan, zodat het boven de kaart past).
    keuze = null;
    const gekozen = kiesDoel(stap, { inBlad: true });
    zetKeuze(gekozen);
    kaart.dataset.stap = stap.deel ? stap.deel.bron.id : stap.id; // voor de schermtests: welke stap (ook bij een afgerond deel)
    beweeg(eff(stap), doelEl);
    // De eerste stap: de laag komt pas in beeld als de pagina naar het doel geschoven is en de plaatsing een beeld later dezelfde bleef.
    // Een eerste plaats die nog verspringt (de pagina schoof nog niet, het venster of de kaart had nog niet haar maat) is zo nooit te zien.
    if (!laag.classList.contains('is-zichtbaar') && !(await wachtOpRust(mijn))) return;
    laag.classList.add('is-zichtbaar');
    volgendeKnop.focus({ preventScroll: true });
  }

  // Wacht tot de eerste plaatsing stilstaat: elk beeld opnieuw schikken (volg) tot het vak, de uitlegkaart, het venster en de schuifstand twee
  // beelden na elkaar gelijk zijn. Hard begrensd (EERSTE_RUST_MS, EERSTE_RUST_BEELDEN), zodat de start nooit blijft hangen; een beeld dat niet
  // komt (een tabblad op de achtergrond) houdt ze ook niet tegen. Geeft false als de stap of de rondleiding intussen wisselde.
  const standNu = () => {
    const wortel = plan?.houder || document.scrollingElement || document.documentElement;
    const g = gat.getBoundingClientRect();
    const k = kaart.getBoundingClientRect();
    return [window.innerWidth, window.innerHeight, wortel.scrollTop, window.scrollY, g.left, g.top, g.width, g.height, k.left, k.top, k.width, k.height, gang?.index, lijst.length].map((v) => Math.round(v)).join(',');
  };
  async function wachtOpRust(mijn) {
    const begin = performance.now();
    let vorige = standNu();
    for (let n = 0; n < EERSTE_RUST_BEELDEN && performance.now() - begin < EERSTE_RUST_MS; n++) {
      await new Promise((klaar) => {
        const tijd = setTimeout(klaar, 100);
        requestAnimationFrame(() => {
          clearTimeout(tijd);
          klaar();
        });
      });
      if (mijn !== slag || actief !== handvat) return false;
      volg(true);
      const nu = standNu();
      if (nu === vorige) return true;
      vorige = nu;
    }
    return true;
  }

  let richtingNu = 1; // de richting van de laatste stap (Volgende of Vorige): een stap die wegvalt, gaat in die richting verder
  function ga(richting) {
    if (!gang) return;
    richtingNu = richting;
    const gelukt = richting > 0 ? gang.volgende() : gang.vorige();
    if (!gelukt) {
      if (richting > 0) {
        zend('uitleg:klaar', { sleutel }); // de motivator reageert op een rondleiding die tot het einde gevolgd is (data/motivatiestand.js)
        sluit(true); // Klaar
      }
      return;
    }
    toon();
  }

  // gezien: het scherm telt als gezien (klaar of overgeslagen); bij stoppen door een routewissel niet.
  let terugWacht = null;
  let eigenMerk = null;
  let zetDoel = () => {}; // wie de terugknop van de eigen geschiedenisingang sluit (BESLISSING 694: over de keten van het aanbod heen)
  let wachter = null;
  // reden: 'route' (een andere route: het nieuwe scherm bepaalt zelf zijn scrollstand, src/kern/scroll.js) of 'gebruiker'.
  // 'aanbod' (BESLISSING 694): de volgende rondleiding van de keten neemt het over; sluit geeft dan de eigen geschiedenisingang terug
  // ({ wacht, merk, zet, los }) in plaats van ze weg te halen en naar het vorige scherm terug te keren.
  function sluit(gezien, reden = 'gebruiker') {
    if (actief !== handvat) return null;
    actief = null;
    zetInert(false);
    let doorgeven = null;
    if (reden === 'aanbod' && terugWacht) {
      const wacht = terugWacht;
      const merk = eigenMerk;
      doorgeven = {
        wacht,
        merk,
        zet: zetDoel,
        // Neemt niemand ze over: alsnog weghalen en terug naar het scherm Uitleg.
        los: () => {
          wacht.los();
          naarVorigScherm(merk);
        },
      };
    } else terugWacht?.los();
    terugWacht = null;
    try {
      wachter?.destroy();
    } catch {
      /* al weg */
    }
    wachter = null;
    slag += 1;
    ruimte.remove();
    const opgeruimd = ruimActieOp();
    for (const stop of ontkoppel) stop();
    ontkoppel = [];
    cancelAnimationFrame(wacht);
    cancelAnimationFrame(anim);
    anim = null;
    try {
      if (isOpen()) laag.hidePopover();
    } catch {
      /* geen popover */
    }
    laag.remove();
    if (gezien) markeerGezien(sleutel);
    // De pagina staat weer waar ze stond toen de uitleg begon (de uitleg scrolde zelf); bij een routewissel beslist het nieuwe scherm.
    if (reden !== 'route') window.scrollTo({ top: beginY, behavior: 'instant' });
    if (doorgeven) {
      opKlaar?.();
      return doorgeven;
    }
    // BESLISSING 549: gestart vanuit het scherm Uitleg? Eerst het blad van de handeling dicht (in kijkstand: er werd niets bewaard), dan terug.
    if (terugNaarVorig && reden !== 'route') {
      const merk = eigenMerk;
      Promise.resolve(opgeruimd).then(() => naarVorigScherm(merk));
      opKlaar?.();
      return null;
    }
    // De focus terug naar waar ze was, of (na een tik, of na "Toon het me" op een ander scherm) naar het vraagteken in de kop.
    const terug = terugNaar && terugNaar.isConnected && terugNaar !== document.body ? terugNaar : document.querySelector('#scherm .schermkop__uitleg');
    if (reden !== 'route') terug?.focus?.({ preventScroll: true });
    opKlaar?.();
    return null;
  }

  const handvat = { stop: () => sluit(false, 'route') };

  function opToets(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      sluit(true);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      ga(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      ga(-1);
    } else if (e.key === 'Tab') {
      // De focus blijft in het kaartje.
      const knoppen = [...kaart.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled);
      if (!knoppen.length) return;
      const eerste = knoppen[0];
      const laatste = knoppen[knoppen.length - 1];
      if (e.shiftKey && (document.activeElement === eerste || !kaart.contains(document.activeElement))) {
        e.preventDefault();
        laatste.focus();
      } else if (!e.shiftKey && (document.activeElement === laatste || !kaart.contains(document.activeElement))) {
        e.preventDefault();
        eerste.focus();
      }
    }
  }
  // Eén keer per beeld opnieuw meten, hoe vaak er ook iets gebeurt.
  let herschikNodig = false;
  const opWijziging = (herschik) => () => {
    herschikNodig ||= herschik;
    cancelAnimationFrame(wacht);
    wacht = requestAnimationFrame(() => {
      const h2 = herschikNodig;
      herschikNodig = false;
      volg(h2);
    });
  };
  const opScroll = opWijziging(false);
  const opMaat = opWijziging(true);
  // Vangnet: elk beeld kijkt of het onderdeel of het venster van plaats of maat veranderde zonder dat een gebeurtenis het meldde (een overgang
  // in de kop, een balk die later van hoogte wisselt). Eén meting per beeld; alleen bij een verschil wordt er opnieuw getekend.
  let vorigeStand = '';
  let vorigeKop = null;
  let wachter2 = 0;
  const kijk = () => {
    if (actief !== handvat) return;
    const r = doelEl?.isConnected ? doelEl.getBoundingClientRect() : null;
    const stand = [window.innerWidth, window.innerHeight, r && Math.round(r.left), r && Math.round(r.top), r && Math.round(r.width), r && Math.round(r.height)].join(',');
    if (vorigeStand && stand !== vorigeStand && !anim) {
      const andereMaat = stand.split(',').slice(0, 2).join() !== vorigeStand.split(',').slice(0, 2).join() || stand.split(',').slice(4).join() !== vorigeStand.split(',').slice(4).join();
      (andereMaat ? opMaat : opScroll)();
    }
    // De vaste kop kan na het scrollen van hoogte veranderen zonder dat het onderdeel beweegt of een gebeurtenis het meldt: dan volgt de kaart
    // (volg: een kaart bovenaan blijft onder de kop).
    const kop = telefoon() ? Math.round(kopOnder()) : 0;
    if (vorigeKop != null && kop !== vorigeKop && !anim && stand === vorigeStand) opScroll();
    vorigeKop = kop;
    vorigeStand = stand;
    wachter2 = requestAnimationFrame(kijk);
  };
  wachter2 = requestAnimationFrame(kijk);
  const tegenhouden = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  vanger.addEventListener('click', tegenhouden);
  vanger.addEventListener('pointerdown', tegenhouden);

  const maatWaarnemer = typeof ResizeObserver === 'function' ? new ResizeObserver(opMaat) : null;
  const inhoudWaarnemer = new MutationObserver(opMaat);
  const scherm = document.getElementById('scherm');
  if (maatWaarnemer) {
    maatWaarnemer.observe(document.body);
    maatWaarnemer.observe(kaart);
    if (scherm) maatWaarnemer.observe(scherm);
  }
  if (scherm) inhoudWaarnemer.observe(scherm, { childList: true, subtree: true });
  // Een pop-up (blad, dialog) die aan <body> opengaat of sluit, en een thema of demobalk op <html>: opnieuw schikken.
  inhoudWaarnemer.observe(document.body, { childList: true });
  inhoudWaarnemer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  document.addEventListener('keydown', opToets, true);
  window.addEventListener('resize', opMaat);
  window.addEventListener('scroll', opScroll, true);
  window.visualViewport?.addEventListener('resize', opMaat);
  // Een onderdeel dat nog inschuift of openklapt (een animatie of overgang): na afloop opnieuw meten.
  // Niet voor een overgang in de uitleg zelf (een knop onder de muis): anders schikt de kaart bij elke hover opnieuw en schuift de pagina mee.
  const opOvergang = (e) => {
    if (!laag.contains(e.target)) opMaat();
  };
  document.addEventListener('animationend', opOvergang, true);
  document.addEventListener('transitionend', opOvergang, true);
  ontkoppel.push(
    () => document.removeEventListener('animationend', opOvergang, true),
    () => document.removeEventListener('transitionend', opOvergang, true),
    () => document.removeEventListener('keydown', opToets, true),
    () => window.removeEventListener('resize', opMaat),
    () => window.removeEventListener('scroll', opScroll, true),
    () => window.visualViewport?.removeEventListener('resize', opMaat),
    () => maatWaarnemer?.disconnect(),
    () => cancelAnimationFrame(wachter2),
    () => inhoudWaarnemer.disconnect(),
    luister('route:gewijzigd', () => sluit(false, 'route')),
    luister('slot:dicht', () => sluit(false, 'route')),
  );

  actief = handvat;
  // De rest van de pagina is niet bedienbaar zolang de uitleg openstaat (ook niet met een schermlezer): de app en de demobalk zijn inert.
  // Een blad dat een stap opent, hangt aan <body> (buiten #app) en blijft dus bereikbaar voor de laag die erin ligt.
  zetInert(true);
  // AN-06: "terug" sluit de rondleiding (zoals Overslaan) en laat het scherm staan. Een eigen geschiedenisingang werkt in elke browser
  // (src/pwa/terug.js); op Android vangt een CloseWatcher de terugknop of -veeg op, want de rondleiding is geen modale dialog.
  // De ingang van de rondleiding ervoor in de keten (BESLISSING 694) wordt overgenomen: terug sluit dan deze rondleiding.
  if (ingang?.wacht) {
    terugWacht = ingang.wacht;
    eigenMerk = ingang.merk;
    zetDoel = ingang.zet;
  } else {
    let doel = null;
    terugWacht = bewaakTerug({ opTerug: () => (doel?.(), true), slokOp: true });
    eigenMerk = merkVan(history.state); // de eigen geschiedenisingang (null als er geen kwam)
    zetDoel = (fn) => {
      doel = fn;
    };
  }
  zetDoel(() => sluit(true));
  if (isAndroid() && typeof window.CloseWatcher === 'function') {
    try {
      wachter = new window.CloseWatcher();
      wachter.onclose = () => sluit(true);
    } catch {
      wachter = null;
    }
  }
  bovenop();
  // Het scherm kan nog bewegen (het schuift in, een melding vaagt weg): pas als die eindige animaties klaar zijn, wordt de lijst verdeeld
  // (BESLISSING 570). Geen vaste wachttijd: alleen op wat al loopt, en de eerste stap komt dan meteen.
  // BESLISSING 735: bij een gevraagde start (snel) worden de opkom-animaties van het scherm meteen afgemaakt, zodat de kaarten op hun
  // eindplaats staan voor er gemeten wordt; de balk met tabbladen verschuift het doel niet en wordt dan niet afgewacht.
  if (snel) maakOpkomstAf();
  const doelen = snel ? lijst.map((s) => (s.doel ? vindDoel(s.doel) : null)).filter(Boolean) : [];
  // Een animatie die de plaats niet verandert maar op een doel zelf loopt (de lijn en de punten van de grafiek van Gewicht, tot 1,2 s na het
  // tekenen): bij een gevraagde start meteen afgemaakt in plaats van afgewacht, zoals de opkomst. Het doel staat dan in zijn eindstand voor er
  // gemeten wordt, en "Mijn gewicht noteren" toont haar eerste kaart even snel als de andere handleidingen.
  if (snel) maakStilAf(doelen);
  const balken = snel ? [...document.querySelectorAll('#tabbalk, #zijbalk')].filter((b) => !doelen.some((d) => b.contains(d))) : [];
  const lopend = document.getAnimations().filter((a) => {
    if (a.playState !== 'running' || !Number.isFinite(a.effect?.getComputedTiming?.().endTime)) return false;
    const doelEl = a.effect?.target ?? null;
    if (laag.contains(doelEl)) return false;
    if (snel && doelEl && balken.some((b) => b.contains(doelEl))) return false;
    if (snel && (NOOIT_AFWACHTEN.has(a.animationName) || STILLE_OVERGANG.has(a.transitionProperty))) return false;
    if (snel && STIL_VAN_PLAATS.has(a.animationName) && !doelen.some((d) => d === doelEl || d.contains(doelEl))) return false;
    return true;
  });
  if (!lopend.length) {
    verdeelLijst();
    toon();
    return true;
  }
  // Hoogstens tot het geplande einde van die animaties (een animatie die stilgezet wordt, houdt de uitleg niet tegen).
  const rest = Math.max(0, ...lopend.map((a) => ((a.effect.getComputedTiming().endTime ?? 0) - (Number(a.currentTime) || 0)) / Math.abs(a.playbackRate || 1)));
  Promise.race([Promise.allSettled(lopend.map((a) => a.finished)), new Promise((klaar) => setTimeout(klaar, rest + 50))]).then(() => {
    if (gang) return;
    if (actief !== handvat) return;
    verdeelLijst();
    toon();
  });
  return true;
}

// Eén stap terug in de geschiedenis, zodra de eigen ingang van de rondleiding (src/pwa/terug.js) weg is: bij Klaar, Overslaan of Escape haalt
// terug.js die ingang zelf weg (een history.back), bij de terugknop deed de gebruiker dat. Daarna is de vorige ingang het scherm Uitleg.
function naarVorigScherm(merk) {
  const weg = () => merk == null || merkVan(history.state) !== merk;
  if (weg()) {
    history.back();
    return;
  }
  const op = () => {
    if (!weg()) return;
    window.removeEventListener('popstate', op);
    history.back();
  };
  window.addEventListener('popstate', op);
}

export function stopRondleiding() {
  actief?.stop();
}

// Het welkomstkaartje: één keer, rustig, midden onderaan. Ja zet de uitleg aan en start de rondleiding van dit scherm;
// Liever niet (ook Escape) zet de automatische uitleg uit. De uitleg blijft altijd te starten met de knop Uitleg.
export function toonWelkom(sleutel) {
  if (!magStarten() || !welkomNodig()) return false;
  const terugNaar = document.activeElement;
  const ja = knop(t('uitleg.welkomJa'), { soort: 'secundair', opKlik: () => sluit(true) }); // BESLISSING 544: zelfde zachte vlak als Liever niet
  const nee = knop(t('uitleg.welkomNee'), { soort: 'secundair', opKlik: () => sluit(false) });
  const kaart = h(
    'div',
    { class: 'uitleg__kaart uitleg__kaart--welkom', role: 'dialog', 'aria-modal': 'false', 'aria-label': t('uitleg.dialoog'), tabindex: '-1' },
    h('p', { class: 't-h2 uitleg__titel' }, t('uitleg.welkom')),
    h('div', { class: 'uitleg__acties' }, nee, ja),
  );
  const laag = h('div', { class: 'uitleg uitleg--welkom', 'data-uitleg-laag': '' }, kaart);
  zetFamilie(laag);
  let ontkoppel = [];
  const handvat = { stop: () => sluit(false, true) };
  function sluit(antwoordJa, zonderAntwoord = false) {
    if (actief !== handvat) return;
    actief = null;
    for (const stop of ontkoppel) stop();
    laag.remove();
    if (!zonderAntwoord) markeerWelkom(antwoordJa);
    if (terugNaar && terugNaar.isConnected) terugNaar.focus?.({ preventScroll: true });
    if (antwoordJa && !zonderAntwoord) startRondleiding({ sleutel });
  }
  const opToets = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      sluit(false);
    }
  };
  document.addEventListener('keydown', opToets, true);
  ontkoppel = [() => document.removeEventListener('keydown', opToets, true), luister('route:gewijzigd', () => sluit(false, true)), luister('slot:dicht', () => sluit(false, true))];
  actief = handvat;
  document.body.append(laag);
  ja.focus({ preventScroll: true });
  return true;
}

// ============================================================ koppeling met de schil (app.js)

// Een wens om bij het volgende getekende scherm te starten (van "Toon het me" in het scherm Uitleg).
let gevraagd = null;
export function vraagStart({ route, sleutel, vanaf = null, terugNaarVorig = false, zonder = null }) {
  gevraagd = { route: route ?? sleutel, sleutel, vanaf, terugNaarVorig, zonder };
}

// Start een handeling ("Een maaltijd noteren"): gaat naar het scherm waar ze gebeurt en start daar de rondleiding. 'hier' = nu.
// terugNaarVorig (BESLISSING 549, vanuit het scherm Uitleg): na afloop terug naar het scherm waarvandaan ze gestart werd.
// ingang (BESLISSING 694): de doorgegeven geschiedenisingang van de rondleiding ervoor (het aanbod in een keten vanuit het scherm Uitleg).
// BIJ_LEEG (BESLISSING 694): heeft de handeling bij een leeg profiel niets te tonen, dan de rondleiding van het scherm dat wel iets toont
// ("Supplementen afvinken" zonder supplementen: het tabblad Supplementen). isLeeg leest de gegevens; de start gebeurt dan asynchroon.
export function startHandeling(id, opties = {}) {
  const gewoon = () => startOp(HANDELING_SCHERM[id], ONDERWERPEN.find((o) => o.id === id)?.sleutel ?? 'h:' + id, opties);
  const leeg = BIJ_LEEG[id];
  if (!leeg) return gewoon();
  Promise.resolve()
    .then(() => leeg.isLeeg())
    .then(
      (isLeeg) => {
        const gestart = isLeeg ? startOp(leeg.route, leeg.sleutel, opties) : gewoon();
        if (!gestart) opties.ingang?.los();
      },
      () => {
        if (!gewoon()) opties.ingang?.los();
      },
    );
  return true;
}

// BESLISSING 563: de sleutel is soms de rondleiding van het scherm. Een rondleiding op het scherm van nu neemt de doorgegeven ingang over.
function startOp(route, sleutel, { terugNaarVorig = false, zonder = null, ingang = null } = {}) {
  const nu = window.location.hash.replace(/^#\/?/, '');
  if (!route || route === 'hier' || nu === route) return startRondleiding({ sleutel, zonder, terugNaarVorig: Boolean(ingang) && terugNaarVorig, ingang, snel: true });
  ingang?.wacht.los(); // een ander scherm: de doorgegeven ingang gaat weg, het nieuwe scherm keert zelf terug (terugNaarVorig)
  vraagStart({ route, sleutel, terugNaarVorig, zonder });
  window.location.hash = '#/' + route;
  return true;
}

// Wacht tot het eerste onderdeel van de rondleiding er is (schermen tekenen soms pas na het laden van gegevens).
// Een stap midden op het scherm of een geregistreerde actie (voor) zegt niets over of het scherm al getekend is: het scherm registreert zijn
// acties vóór het zijn gegevens gelezen heeft. Heeft de rondleiding stappen met een eigen onderdeel, dan wacht ze op zo'n onderdeel; anders
// (alleen stappen midden op het scherm) start ze meteen. In WebKit (Safari) tekent Vandaag na een routewissel later dan in Chrome: zonder
// dit wachten vielen de stappen op Vandaag weg ("Een maaltijd noteren" begon bij het tekstvak, "Stemming en energie kiezen" toonde één stap).
// Is er na het wachten geen eigen onderdeel, dan probeert ze het toch met wat er is (een actie of een stap midden op het scherm).
// BESLISSING 735: een gevraagde start (Toon het me) toont de eerste kaart binnen 1500 ms na de tik, de routewissel inbegrepen.
// Een gevraagde start wacht niet op een vaste grens maar op het teken dat het scherm getekend is (data-getekend, beheerScherm in
// schermen/hulp.js). Pas als het scherm na deze grens nog altijd niet getekend is, start ze toch: dan is het scherm zelf te traag.
const GEVRAAGD_MAX_MS = 2500;
// Ze start niet vóór deze tijd na de tik (de vroegere eerste blik): op Algemeen deelt de stap Thema pas na
// ongeveer 250 ms juist op ("Een thema kiezen, stap 1 van 2"); bij een start vlak na het tekenen kwam er "Het thema, stap 1 van 1" met een vak dat door de kaart sneed.
const GEVRAAGD_EERSTE_BLIK_MS = 250;
// De rust telt ook vanaf het tekenen zelf: op een traag toestel is het scherm pas na die 250 ms getekend, en een start in hetzelfde beeld
// mat de kaarten van Algemeen voor ze hun plaats hadden (het vak viel eerst op een fout kader en sprong daarna naar de thema's).
const GEVRAAGD_RUST_NA_TEKENEN_MS = 120;
// De eerste stap komt pas in beeld als haar plaatsing stilstaat (wachtOpRust): hoogstens zoveel beelden of milliseconden wachten.
const EERSTE_RUST_BEELDEN = 12;
const EERSTE_RUST_MS = 350;

// Is het scherm van deze sleutel getekend? Een scherm met beheerScherm zet data-getekend op zijn houder ("nee" zolang het laadt, daarna de
// route). Een scherm zonder beheerScherm tekent zelf, meteen: dan geldt #scherm met de juiste data-scherm en een kind met een maat.
function schermGetekend(sleutel) {
  const scherm = document.getElementById('scherm');
  if (!scherm || scherm.dataset.scherm !== sleutel) return false;
  const tekens = [scherm, ...scherm.querySelectorAll('[data-getekend]')].filter((el) => el.hasAttribute('data-getekend'));
  if (tekens.length) return tekens.every((el) => el.getAttribute('data-getekend') !== 'nee');
  return [...scherm.children].some((k) => {
    const r = k.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

// Een gevraagde start is een bezoek vooruit: het scherm begint bovenaan en de uitleg schuift zelf naar haar onderdeel. Gaat "Toon het me"
// naar het scherm waaruit het scherm Uitleg geopend werd (Algemeen, voor "Een thema kiezen"), dan ziet app.js dat als terugkeren en houdt
// herstelPositie (kern/scroll.js) de pagina tot 2,5 s vast op de oude schuifstand, tegen het schuiven van de uitleg in: het vak lag dan
// eerst op een fout kader (de kaart die op de oude stand onder die plaats stond) en pas daarna op het onderdeel. herstelPositie laat los
// bij een wiel, aanraking, tik of toets van de gebruiker op het venster; dat teken geven we hier, in het eerste beeld na de routewissel.
function laatOudeStandLos() {
  window.dispatchEvent(new Event('wheel'));
  if (window.scrollY > 0) zetScroll(0);
}

function wachtOpGetekend(sleutel, route, klaar) {
  const begin = performance.now();
  let stopt = false;
  let getekendOp = null;
  let raam = 0;
  let los = false;
  const probeer = () => {
    if (stopt) return;
    // Elk beeld tot de start, niet één keer: het terugzetten van de oude schuifstand (src/kern/scroll.js) kan op een toestel pas
    // beginnen NA het eerste beeld van deze wacht (de routewissel loopt daar later); één teken vooraf zou het dan missen.
    los = true;
    laatOudeStandLos();
    const nu = performance.now();
    if (getekendOp === null && schermGetekend(route)) getekendOp = nu;
    if (getekendOp !== null && nu - begin >= GEVRAAGD_EERSTE_BLIK_MS && nu - getekendOp >= GEVRAAGD_RUST_NA_TEKENEN_MS) {
      const lijst = stappenVoor(sleutel);
      const eigen = lijst.filter((s) => !s.midden && !s.voor && s.doel);
      if (eigen.some((s) => vindDoel(s.doel))) return klaar();
      const anders = lijst.some((s) => s.midden || (s.voor && vindActie(s.voor)));
      if (anders && !eigen.length) return klaar();
      // Het scherm staat er en na nog een blik is er geen eigen onderdeel: starten met wat er is (of het vangnet).
      if (nu > getekendOp) return klaar();
    } else if (getekendOp === null && nu - begin >= GEVRAAGD_MAX_MS) {
      console.warn(`Uitleg ${route}: het scherm was na ${Math.round(nu - begin)} ms nog niet getekend`);
      return klaar();
    }
    raam = requestAnimationFrame(probeer);
  };
  raam = requestAnimationFrame(probeer);
  return () => {
    stopt = true;
    cancelAnimationFrame(raam);
  };
}

function wachtOpEerste(sleutel, klaar, ms = 2500) {
  const begin = performance.now();
  let stopt = false;
  const probeer = () => {
    if (stopt) return;
    const lijst = stappenVoor(sleutel);
    const eigen = lijst.filter((s) => !s.midden && !s.voor && s.doel);
    if (eigen.some((s) => vindDoel(s.doel))) return klaar();
    const anders = lijst.some((s) => s.midden || (s.voor && vindActie(s.voor)));
    if (anders && !eigen.length) return klaar();
    // BESLISSING 694: na de wachttijd toch starten; startRondleiding toont dan wat er is, of (bij een handleiding) het vangnet.
    if (performance.now() - begin >= ms) return klaar();
    setTimeout(probeer, 150);
  };
  setTimeout(probeer, 250);
  return () => {
    stopt = true;
  };
}

// koppelUitleg(houder, sleutel): voor het scherm dat net getekend is. Zorgt voor de knop Uitleg in de kop (ook als het
// scherm later opnieuw tekent) en voor de automatische start of een gevraagde start. Geeft een opruimfunctie.
export function koppelUitleg(houder, sleutel) {
  const stoppers = [];
  if (heeftUitleg(sleutel)) {
    const voegKnopToe = () => {
      if (houder.querySelector('.schermkop__uitleg')) return;
      // Vaste volgorde: terug, eigen acties, Uitleg, Delen, home. Op Vandaag staat Uitleg als secundaire knop met icoon en
      // woord links van de knop Delen (dezelfde vorm; op een telefoon alleen het icoon); elders is het een icoonknop in de
      // kop, vóór de knop Delen (of vóór de home-knop, als Delen er op dat scherm niet staat).
      const delenKnop = houder.querySelector('.begroeting__delen');
      if (delenKnop) {
        const el = knop(t('uitleg.kortLabel'), { soort: 'secundair', icoon: ICOON.herstelvraag.naam, label: t('uitleg.knop'), opKlik: () => startRondleiding({ sleutel, snel: true }) });
        el.classList.add('begroeting__delen', 'begroeting__uitleg', 'schermkop__uitleg');
        delenKnop.parentNode.insertBefore(el, delenKnop);
        return;
      }
      const knopEl = icoonknop(ICOON.herstelvraag.naam, { label: t('uitleg.knop'), klasse: 'schermkop__uitleg', grootte: 24, opKlik: () => startRondleiding({ sleutel, snel: true }) });
      const ref = houder.querySelector('.schermkop__delen') || houder.querySelector('.schermkop__home');
      const kop = houder.querySelector('.schermkop__acties');
      if (ref) ref.parentNode.insertBefore(knopEl, ref);
      else if (kop) kop.append(knopEl);
    };
    voegKnopToe();
    const waarnemer = new MutationObserver(voegKnopToe);
    waarnemer.observe(houder, { childList: true, subtree: true });
    stoppers.push(() => waarnemer.disconnect());
  }

  // Een gevraagde start (Toon het me) gaat voor; anders de automatische start bij een eerste bezoek.
  const verzoek = gevraagd && gevraagd.route === sleutel ? gevraagd : null;
  if (verzoek) gevraagd = null;
  if (verzoek) {
    stoppers.push(wachtOpGetekend(verzoek.sleutel, sleutel, () => startRondleiding({ sleutel: verzoek.sleutel, vanaf: verzoek.vanaf, terugNaarVorig: verzoek.terugNaarVorig, zonder: verzoek.zonder, snel: true })));
  } else if (sleutel !== 'welkom' && welkomNodig()) {
    const timer = setTimeout(() => toonWelkom(sleutel), 1200);
    stoppers.push(() => clearTimeout(timer));
  } else if (heeftUitleg(sleutel) && autoStartToegestaan() && !isGezien(sleutel)) {
    stoppers.push(wachtOpEerste(sleutel, () => startRondleiding({ sleutel, maxStappen: MAX_AUTO_STAPPEN })));
  }
  return () => stoppers.forEach((stop) => stop());
}
