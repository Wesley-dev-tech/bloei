// Gedeelde hulpjes van de schermen (spoor B): hertekenen bij gewijzigde gegevens zonder dat een open
// invoerveld zijn focus of tekst verliest, automatisch bewaren (400 ms na de laatste toets, bij verlaten)
// en de rustige stub voor schermen die nog gebouwd worden.
import { h } from '../ui/dom.js';
import { ICOON } from '../ui/iconenkaart.js';
import { legeToestand, knop, strook } from '../ui/componenten.js';
import { voegDrankToe, verwijderDrank, verwijderLaatste, zetDrankTerug } from '../data/dranken.js';
import { luister } from '../kern/bus.js';
import { fotoUrl } from '../data/fotos.js';
import { t } from '../teksten.js';
import { opmaakMl } from '../kern/getal.js';
import { naarDatum, naarSleutel, vandaag } from '../kern/datum.js';
import { leesMaand } from '../data/statistiek.js';
import { legInVangnet } from '../data/vangnet.js';

// ------------------------------------------------------------------ automatisch bewaren (PLAN.md §8.4)

const lopend = new Set();

// Het vangnet (R5-03, data/vangnet.js). De module houdt zelf bij of er een vangnet ligt en werkt het bij na elke schrijfactie van een
// bewaarder met vangnet: het wissen hangt dus niet aan die ene aanroep bij het verbergen van de pagina.
//   vangnetLigt    er staat (mogelijk) iets in de browseropslag
//   mislukt        per veld (soort, datum, maaltijd) het item van een schrijfactie die mislukte terwijl er een vangnet lag, of die
//                  niet afrondde en losgelaten is. Het hoort in het vangnet tot hetzelfde veld later wel bewaard is.
//   laatstBewaard  per veld het volgnummer van de laatste geslaagde schrijfactie: een oudere die daarna nog mislukt, telt niet meer.
let vangnetLigt = false;
const mislukt = new Map();
const laatstBewaard = new Map();
let taakNr = 0;
// Zo lang wacht bewaarAlles() hoogstens op schrijfacties die onderweg zijn. Een schrijfactie die nooit afrondt, mag het slot, de
// terugkeer naar Vandaag en de dagwissel niet voor altijd tegenhouden (src/app.js).
export const BEWAAR_GRENS_MS = 4000;

const veldSleutel = (item) => [item.soort, item.datum, item.maaltijd ?? ''].join('|');

// Alles wat in het vangnet hoort: wat mislukte en sindsdien niet bewaard is, en wat nog wacht of onderweg is (dat is nieuwer en wint).
function vangnetItems() {
  const perVeld = new Map();
  for (const [sleutel, { item }] of mislukt) perVeld.set(sleutel, item);
  for (const b of lopend) {
    const item = b.vangnetItem();
    if (item) perVeld.set(veldSleutel(item), item);
  }
  return [...perVeld.values()];
}

// Ligt er een vangnet, dan krijgt het de stand van nu. Is er niets meer dat wacht, onderweg is of mislukte, dan gaat het weg.
function werkVangnetBij() {
  if (!vangnetLigt) return;
  const items = vangnetItems();
  legInVangnet(items);
  if (!items.length) vangnetLigt = false;
}

function meldBewaard(taak) {
  if (!taak.item) return;
  const sleutel = veldSleutel(taak.item);
  if ((laatstBewaard.get(sleutel) ?? 0) < taak.nr) laatstBewaard.set(sleutel, taak.nr);
  const oud = mislukt.get(sleutel);
  if (oud && oud.nr <= taak.nr) mislukt.delete(sleutel);
  werkVangnetBij();
}

// Ook zonder vangnet wordt een mislukte schrijfactie onthouden (N2): verbergt ze daarna de app, dan gaat haar tekst mee in het vangnet
// (bewaarBijVerlaten). werkVangnetBij schrijft zelf alleen als er al een vangnet ligt.
function meldMislukt(taak) {
  if (!taak.item) return;
  const sleutel = veldSleutel(taak.item);
  if ((laatstBewaard.get(sleutel) ?? 0) > taak.nr) return; // intussen is een nieuwere tekst van dit veld wel bewaard
  const oud = mislukt.get(sleutel);
  if (!oud || oud.nr < taak.nr) mislukt.set(sleutel, { item: taak.item, nr: taak.nr });
  werkVangnetBij();
}

// Een veld dat bewust gewist of teruggezet is (een maaltijd verwijderen of annuleren): een mislukte schrijfactie van dat veld hoort
// niet meer in het vangnet, anders komt de verwijderde tekst bij de volgende start terug. item = { soort, datum, maaltijd }.
export function vergeetMislukt(item) {
  if (!item) return;
  mislukt.delete(veldSleutel(item));
  werkVangnetBij();
}

// Bewaart een waarde uitgesteld. plan(waarde) wacht 400 ms na de laatste aanroep; nu() bewaart meteen.
// Wat nog wacht, wordt ook bewaard als de pagina verborgen wordt of het scherm wordt verlaten.
// vangnet(waarde) (R5-03, data/vangnet.js): geeft het item dat bij pagehide synchroon in de browseropslag gaat, voor als de pagina
// verdwijnt voor het bewaren klaar is (een maaltijd of een notitie). Elk item krijgt het tijdstip van de laatste toets mee (op), zodat
// de volgende start geen tekst terugzet over een record dat intussen nieuwer is.
export function uitgesteldBewaren(bewaar, ms = 400, vangnet = null) {
  let timer = null;
  let wacht = null;
  // Het bewaren dat gestart is en nog niet in de database staat. Verdwijnt de pagina op dat moment (herladen net na de 0,4 s), dan
  // maakt ze die schrijfactie niet meer af: ook die waarde hoort dus in het vangnet, niet alleen wat nog op de timer wacht.
  let bezig = null;
  const maakItem = ({ waarde, op }) => {
    const item = vangnet ? vangnet(waarde) : null;
    return item ? { ...item, op } : null;
  };
  const bewaarder = {
    // Voor wat onderweg is: het item zoals het bij de start van die schrijfactie berekend is (de bewaarfunctie kan intussen haar eigen
    // stand, bv. de dag waarop het typen begon, al losgelaten hebben).
    vangnetItem: () => (wacht ? maakItem(wacht) : (bezig?.item ?? null)),
    plan(waarde) {
      wacht = { waarde, op: Date.now() };
      lopend.add(bewaarder);
      clearTimeout(timer);
      // Een fout die de bewaarfunctie zelf al meldde (fout.gemeld), hoeft hier niet nog eens in de console.
      timer = setTimeout(
        () =>
          bewaarder.nu().catch((fout) => {
            if (!fout?.gemeld) console.error(fout);
          }),
        ms,
      );
    },
    // Bewaart meteen wat wacht. Wacht er niets, dan is het antwoord het bewaren dat nog loopt: wie op nu() of bewaarAlles() wacht,
    // wacht zo tot alles echt in de database staat.
    nu() {
      clearTimeout(timer);
      if (!wacht) return bezig ? bezig.klaar : Promise.resolve();
      // Het vangnet-item wordt één keer berekend, vóór de bewaarfunctie start.
      const taak = { waarde: wacht.waarde, item: maakItem(wacht), nr: ++taakNr, klaar: null };
      wacht = null;
      bezig = taak;
      let belofte;
      try {
        belofte = Promise.resolve(bewaar(taak.waarde)); // start meteen (synchroon), zoals bij pagehide nodig is
      } catch (fout) {
        belofte = Promise.reject(fout);
      }
      const rond = () => {
        if (bezig === taak) bezig = null;
        if (!wacht && !bezig) lopend.delete(bewaarder);
      };
      taak.klaar = belofte.then(
        () => {
          rond();
          // N1: wat na de start van deze schrijfactie getypt is (het wacht nog of is al onderweg), is nieuwer dan het record dat ze net
          // schreef. Het tijdstip van die tekst mag dus niet ouder zijn dan nu, anders slaat de volgende start ze over (data/vangnet.js).
          const nu = Date.now();
          if (wacht) wacht.op = Math.max(wacht.op, nu);
          if (bezig && bezig.nr > taak.nr && bezig.item) bezig.item.op = Math.max(bezig.item.op ?? 0, nu);
          meldBewaard(taak); // alleen na een geslaagde schrijfactie kan het vangnet kleiner worden of weggaan
        },
        (fout) => {
          rond();
          meldMislukt(taak);
          throw fout;
        },
      );
      return taak.klaar;
    },
    lopendeTaak: () => bezig,
    // Een schrijfactie die niet afrondt, wordt losgelaten: wie op nu() of bewaarAlles() wacht, wacht er niet langer op. Haar item
    // blijft (of komt bij het volgende verbergen) in het vangnet tot hetzelfde veld wel bewaard is; rondt ze later toch af, dan ruimt
    // ze zelf op.
    geefOp(taak) {
      if (!taak || bezig !== taak) return;
      bezig = null;
      if (!wacht) lopend.delete(bewaarder);
      meldMislukt(taak);
    },
  };
  return bewaarder;
}

// Bewaar alles wat nog wacht (bij verlaten van een scherm of een verborgen pagina). Wacht hoogstens grensMs: wat dan nog niet afgerond
// is, wordt losgelaten, zodat een schrijfactie die blijft hangen niet elke latere aanroep meesleept.
export function bewaarAlles(grensMs = BEWAAR_GRENS_MS) {
  const taken = [...lopend].map((b) => {
    const klaar = b.nu();
    return { b, klaar, taak: b.lopendeTaak() };
  });
  if (!taken.length) return Promise.resolve([]);
  const beloften = taken.map((x) => x.klaar);
  return new Promise((los, faal) => {
    const wekker = setTimeout(() => {
      for (const { b, taak } of taken) b.geefOp(taak);
      los([]);
    }, grensMs);
    Promise.allSettled(beloften).then(() => clearTimeout(wekker));
    Promise.all(beloften).then(los, faal);
  });
}

// Bij een verborgen pagina of pagehide: wat wacht of nog onderweg is naar de database, gaat eerst synchroon in het vangnet (R5-03) en
// wordt meteen bewaard. Lukt dat bewaren nog (de pagina leeft verder of komt terug), dan gaat het vangnet weer weg; anders bewaart de
// volgende start het (main.js). Het vangnet volgt daarna elke schrijfactie (werkVangnetBij): het gaat pas weg als er niets meer wacht,
// onderweg is of mislukte, ook als dat pas door een latere schrijfactie zo wordt.
export function bewaarBijVerlaten() {
  const items = vangnetItems();
  if (items.length) {
    legInVangnet(items);
    vangnetLigt = true;
  }
  bewaarAlles().catch(() => {});
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') bewaarBijVerlaten();
  });
  window.addEventListener('pagehide', bewaarBijVerlaten);
}

// ------------------------------------------------------------------ hertekenen

const TEKSTINVOER = 'textarea, input:not([type="file"]):not([type="checkbox"]):not([type="radio"])';

function invoerActief(houder) {
  const a = document.activeElement;
  return Boolean(a && houder.contains(a) && a.matches(TEKSTINVOER));
}

// Onthoudt welke knop focus had, zodat die na het hertekenen weer focus krijgt (toetsenbordgebruik).
// Binnen een [data-fk]-blok telt de plaats in dat blok. Daarbuiten (een drankknop, een momentrij, een knop "weghalen") herkent
// de knop zichzelf aan zijn klassen en data-attributen, bv. button.drankknop[data-soort="thee"] (R2-05).
function bewaarFocus(houder) {
  const a = document.activeElement;
  if (!a || a === document.body || !houder.contains(a)) return null;
  const wrapper = a.closest('[data-fk]');
  if (!wrapper) return eigenSleutel(houder, a);
  const lijst = [...wrapper.querySelectorAll('button, input, textarea')];
  return { fk: wrapper.dataset.fk, i: lijst.indexOf(a) };
}

const dataNaam = (k) => 'data-' + k.replace(/[A-Z]/g, (l) => '-' + l.toLowerCase());
function eigenSleutel(houder, a) {
  // Een standklasse (is-klaar, is-nu ...) kan na de tik veranderen: die telt niet mee.
  const klassen = [...a.classList].filter((k) => !k.startsWith('is-'));
  if (!klassen.length || typeof CSS === 'undefined') return null;
  const basis = a.tagName.toLowerCase() + klassen.map((k) => '.' + CSS.escape(k)).join('');
  const precies = basis + Object.entries(a.dataset).map(([k, w]) => `[${dataNaam(k)}="${CSS.escape(w)}"]`).join('');
  return { basis, precies, i: [...houder.querySelectorAll(basis)].indexOf(a), j: [...houder.querySelectorAll(precies)].indexOf(a) };
}

// Het element op dezelfde plaats in een lijst, of het laatste als de lijst korter werd (een weggehaalde rij).
const opPlaats = (lijst, i) => (lijst.length && i >= 0 ? lijst[Math.min(i, lijst.length - 1)] : null);

function herstelFocus(houder, bewaard) {
  if (!bewaard || bewaard.i < 0) return;
  if (document.activeElement && document.activeElement !== document.body && houder.contains(document.activeElement)) return;
  let doel;
  if (bewaard.basis) {
    doel = opPlaats(houder.querySelectorAll(bewaard.precies), bewaard.j) ?? opPlaats(houder.querySelectorAll(bewaard.basis), bewaard.i);
  } else {
    const wrapper = [...houder.querySelectorAll('[data-fk]')].find((w) => w.dataset.fk === bewaard.fk);
    doel = wrapper?.querySelectorAll('button, input, textarea')[bewaard.i];
  }
  if (!doel) return;
  doel.focus({ preventScroll: true });
  // Een scherm dat na het tekenen nog meet (Dagboek·Dag houdt het raster even onzichtbaar, is-meet) laat nog geen focus toe:
  // dan de volgende beelden opnieuw proberen, zolang de focus nergens anders naartoe ging.
  let pogingen = 10;
  const opnieuw = () => {
    if (document.activeElement === doel || !doel.isConnected || pogingen-- <= 0) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    doel.focus({ preventScroll: true });
    requestAnimationFrame(opnieuw);
  };
  if (document.activeElement !== doel) requestAnimationFrame(opnieuw);
}

// Beheert een scherm: tekent het (asynchroon), hertekent bij `data:gewijzigd` en `instelling:gewijzigd`
// en geeft de opruimfunctie terug. bouw(ctx) geeft een Node terug. ctx.foto(id, formaat) levert een
// object-URL die bij het hertekenen of verlaten vanzelf wordt vrijgegeven; ctx.opruim(fn) meldt extra
// opruimwerk aan. Hertekenen wacht zolang een tekstveld focus heeft of een tik bezig is.
// Alle kaarten die niet zelf een knop zijn lichten bij een muis op (gedeelde klasse van spoor A).
export function lichtOp(wortel) {
  wortel.querySelectorAll('.maaltijd > .rij--knop').forEach((r) => r.classList.add('licht-op-icoon'));
}

// Schrijven na een dagwissel (BESLISSING 203): een scherm dat 'vandaag' toont, schrijft met vandaag() van het moment van de tik, niet met de datum van
// de laatste tekening. Een scherm met een gekozen dag (een eerdere dag) blijft die dag schrijven. Gebruik: const dag = dagBinder(datum); ... zetInname(dag(), ...).
export function dagBinder(datum) {
  const toondeVandaag = datum === vandaag();
  return () => (toondeVandaag ? vandaag() : datum);
}

export function beheerScherm(houder, bouw, opties = {}) {
  // 'elders:gewijzigd': een ander tabblad van Bloei wijzigde iets (R5-01, data/kanaal.js).
  const { events = ['data:gewijzigd', 'instelling:gewijzigd', 'elders:gewijzigd'], lichtOp: metLift = false } = opties;
  let urls = [];
  let opruimers = [];
  let nummer = 0;
  let weg = false;
  let timer = null;
  let uitgesteld = false;
  let tikt = false;
  let tikTimer = null;
  // Elke handeling van de gebruiker op het scherm (pointerdown, en click voor het toetsenbord) telt hier. Een tekening die bouwt terwijl er
  // gehandeld wordt, is door die handeling achterhaald: de handelaar werkte op het oude scherm (een maand verder, een dag gekozen) en een
  // tekening die al gelezen had, zou dat weer wegvegen. Zo'n tekening wordt weggegooid en na de handeling opnieuw gedaan.
  let handelingen = 0;
  let getekend = false;

  const geefVrij = (lijst) => lijst.forEach((u) => URL.revokeObjectURL(u));

  async function teken() {
    const mijn = ++nummer;
    const handelingenVoor = handelingen;
    const nieuweUrls = [];
    const nieuweOpruimers = [];
    const ctx = {
      async foto(id, formaat = 'klein') {
        if (id == null) return null;
        const url = await fotoUrl(id, formaat);
        if (url) nieuweUrls.push(url);
        return url;
      },
      opruim(fn) {
        nieuweOpruimers.push(fn);
      },
    };
    let inhoud;
    try {
      inhoud = await bouw(ctx);
    } catch (fout) {
      console.error(fout);
      inhoud = legeToestand({ tekst: t('algemeen.foutOpslag') });
    }
    // Achterhaald: er is intussen gehandeld, of er heeft nu een tekstveld focus (dezelfde regels als bij het starten, zie plan). Alleen als er
    // al een scherm staat; de eerste tekening gaat altijd door. Het oude scherm blijft onaangeroerd staan (geen focus, scroll of blad dat
    // verspringt, geen extra melding voor een schermlezer) en de tekening volgt via vrijgave(), na de tik of na het verlaten van het veld.
    // Geen lus: weggooien gebeurt alleen na een nieuwe handeling of focus van de gebruiker tijdens het bouwen; zonder die gaat de volgende
    // tekening door, en die start pas na de laatste wijziging, dus met de laatste stand van de database.
    const achterhaald = getekend && (handelingen !== handelingenVoor || invoerActief(houder));
    if (weg || mijn !== nummer || achterhaald) {
      geefVrij(nieuweUrls);
      nieuweOpruimers.forEach((f) => f());
      if (achterhaald && !weg && mijn === nummer) {
        uitgesteld = true;
        vrijgave();
      }
      return;
    }
    const eersteTekening = !getekend;
    getekend = true;
    const focus = bewaarFocus(houder);
    const y = window.scrollY;
    opruimers.forEach((f) => f());
    houder.replaceChildren(inhoud);
    // Het teken voor de uitleg (wachtOpEerste in uitleg/rondleiding.js): de eerste echte inhoud staat er, met de route van het scherm.
    if (eersteTekening) houder.setAttribute('data-getekend', houder.closest('#scherm')?.dataset.scherm || 'ja');
    if (metLift) lichtOp(houder);
    geefVrij(urls);
    urls = nieuweUrls;
    opruimers = nieuweOpruimers;
    herstelFocus(houder, focus);
    if (y > 0) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  }

  function plan() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (weg) return;
      if (invoerActief(houder) || tikt) {
        uitgesteld = true;
        return;
      }
      uitgesteld = false;
      teken();
    }, 40);
  }

  const vrijgave = () => {
    if (!uitgesteld) return;
    setTimeout(() => {
      if (weg || !uitgesteld || invoerActief(houder) || tikt) return;
      uitgesteld = false;
      teken();
    }, 60);
  };
  const tikStart = () => {
    handelingen += 1;
    tikt = true;
    clearTimeout(tikTimer);
    tikTimer = setTimeout(() => {
      tikt = false;
      vrijgave();
    }, 700);
  };
  const tikKlaar = () => {
    handelingen += 1; // ook een klik met Enter of de spatiebalk, die geen pointerdown heeft
    clearTimeout(tikTimer);
    tikTimer = setTimeout(() => {
      tikt = false;
      vrijgave();
    }, 80);
  };

  houder.addEventListener('pointerdown', tikStart, true);
  houder.addEventListener('click', tikKlaar, true);
  houder.addEventListener('pointercancel', tikKlaar, true);
  houder.addEventListener('focusout', vrijgave);

  const afmelders = events.map((e) => luister(e, plan));
  // Het teken staat op "nee" tot de eerste tekening er is: de uitleg weet zo dat dit scherm nog laadt.
  houder.setAttribute('data-getekend', 'nee');
  teken();

  return () => {
    weg = true;
    houder.removeAttribute('data-getekend');
    clearTimeout(timer);
    clearTimeout(tikTimer);
    afmelders.forEach((af) => af());
    houder.removeEventListener('pointerdown', tikStart, true);
    houder.removeEventListener('click', tikKlaar, true);
    houder.removeEventListener('pointercancel', tikKlaar, true);
    houder.removeEventListener('focusout', vrijgave);
    bewaarAlles();
    geefVrij(urls);
    opruimers.forEach((f) => f());
    urls = [];
    opruimers = [];
  };
}

// ------------------------------------------------------------------ onderliggende schermen van Meer

// Terug naar Meer: een tekstknop met de chevron-left.
export function terugKnop(naar = '#/meer') {
  const el = knop(t('meer.terug'), { soort: 'tekst', icoon: ICOON.terug.naam, opKlik: () => (window.location.hash = naar) });
  el.classList.add('schermkop__terug');
  return el;
}

// ------------------------------------------------------------------ drinken: voortgangsbaan en tikken

// Een slanke, afgeronde baan naar het dagdoel: de baan in poederroze, de vulling in mist (drinken) en salie als het
// doel gehaald is. Boven het doel blijft de balk vol. Geen percentage, geen "nog x te gaan".
export function drinkbaan(vulling = 0, gehaald = false) {
  const vulEl = h('span', { class: 'drinkbaan__vulling' });
  const el = h('div', { class: 'drinkbaan', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': t('drinken.kan') }, vulEl);
  el.zet = (v, g) => {
    const deel = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    vulEl.style.width = deel * 100 + '%';
    el.setAttribute('aria-valuenow', String(Math.round(deel * 100)));
    el.classList.toggle('is-gehaald', Boolean(g));
  };
  el.zet(vulling, gehaald);
  return el;
}

// ------------------------------------------------------------------ drinken: tikken en ongedaan maken

// Eén drank erbij, met meteen een strook die precies die drank weer weghaalt.
export async function drankErbij(datum, soort = 'water') {
  const drank = await voegDrankToe(datum, soort);
  const ml = opmaakMl(drank.ml);
  strook(soort === 'water' ? t('drinken.toegevoegdWater', { ml }) : t('drinken.toegevoegd', { naam: t('drank.' + soort), ml }), {
    duur: 5000,
    actie: { label: t('drinken.ongedaan'), opKlik: () => verwijderDrank(drank.id) },
  });
  return drank;
}

// Uitleg (BESLISSING 183): de melding met "Ongedaan maken" als voorbeeld, zonder een drank toe te voegen. Geeft de sluitfunctie terug.
export function toonOngedaanMelding() {
  strook(t('drinken.toegevoegdWater', { ml: opmaakMl(800) }), { duur: 0, actie: { label: t('drinken.ongedaan'), opKlik: () => {} } });
  return () => document.querySelector('.strokenhouder')?.replaceChildren();
}

// De laatste drank van de dag weghalen, met de mogelijkheid om ze terug te zetten.
export async function laatsteWeghalen(datum) {
  const drank = await verwijderLaatste(datum);
  if (drank) {
    strook(t('drinken.weggehaald'), {
      actie: { label: t('drinken.terugzetten'), opKlik: () => zetDrankTerug(drank) },
    });
  }
  return drank;
}

// Aantal dagen sinds de vorige bijgehouden dag vóór deze datum (of null): voor de zin "welkom terug".
export async function dagenSindsVorige(datum) {
  const [j, m] = datum.split('-').map(Number);
  const vorige = new Date(j, m - 2, 1);
  const vorigeMaand = vorige.getFullYear() + '-' + String(vorige.getMonth() + 1).padStart(2, '0');
  const gegevens = { ...(await leesMaand(vorigeMaand)), ...(await leesMaand(datum.slice(0, 7))) };
  const eerder = Object.keys(gegevens).filter((d) => d < datum).sort();
  if (!eerder.length) return null;
  return Math.round((naarDatum(datum) - naarDatum(eerder.at(-1))) / 86400000);
}

// ------------------------------------------------------------------ geldige datums in de route

// Een echte kalenderdatum in het formaat JJJJ-MM-DD (2026-13-45 is dat niet).
export function geldigeDatum(sleutel) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sleutel ?? '')) return false;
  return naarSleutel(naarDatum(sleutel)) === sleutel;
}

// Een maand in het formaat JJJJ-MM met een maandnummer van 1 tot en met 12.
export function geldigeMaand(sleutel) {
  if (!/^\d{4}-\d{2}$/.test(sleutel ?? '')) return false;
  const maand = Number(sleutel.slice(5));
  return maand >= 1 && maand <= 12;
}

// Zet de hash recht zonder het scherm opnieuw te laden (het scherm tekent zelf met de goede waarde).
export function zetHashRecht(pad) {
  try {
    history.replaceState(null, '', pad.startsWith('#') ? pad : '#' + pad);
  } catch {
    /* geen geschiedenis beschikbaar: de weergave klopt al, alleen de adresbalk niet */
  }
}
