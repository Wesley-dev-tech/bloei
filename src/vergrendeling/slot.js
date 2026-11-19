// Het vergrendelscherm (E10, besluiten 53 tot 57 en 160). Is de vergrendeling aan, dan staat er bij het openen van de app
// (een nieuwe start of een herlading) een slot over de app: #app en al het andere in <body> zijn dan verborgen en
// inert, dus er is niets van het dagboek te zien of voor een schermlezer te bereiken. Zodra de pagina naar de
// achtergrond gaat (visibilitychange, pagehide; ook de app-wisselaar van iOS; alleen focusverlies telt niet, BESLISSING 532) komt er meteen een gordijn met
// het logo. Wat er bij terugkeer gebeurt, staat op één plek: BIJ_TERUGKEER hieronder.
// Een vergeten code kan Bloei niet terughalen, maar ze kan wel een nieuwe kiezen (BESLISSING 518, vervangt 224): na een bevestiging met het toestel
// of met haar herstelcode (herstel.js). Geen herstelvraag. Foute pogingen wissen nooit iets: ze geven een oplopende wachttijd (pin.js), bewaard als
// eindtijd in 'slot.wachtTot' (de pincode) en 'slot.herstelWachtTot' (de herstelcode, een eigen teller).
// Bus: 'slot:dicht' en 'slot:open'.
import { h } from '../ui/dom.js';
import { knop, logo, strook } from '../ui/componenten.js';
import { luister, zend } from '../kern/bus.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { db } from '../data/db.js';
import { bepaalMethode, controleer, lengteVan, maakPin, naFout, resterendeWacht, zetOmIndienVerouderd } from './pin.js';
import { methodeTekst, openMetPasskey, passkeyMogelijk } from './passkey.js';
import { cijferblok } from './cijferblok.js';
import { wisNaToestel } from './wisvanslot.js';
import { bevestigMetTerugval, neemtTerugval, vergeetTerugval } from './toestelweg.js';
import { isVrijgesteld, naVrijstelling } from './vrijstelling.js';
import { t } from '../teksten.js';
import { DEMO } from '../kern/demo.js';
import { bewaarMetPincode, bewaarSamen, controleerHerstel, heeftBevestigdeHerstelcode, isGeldigeVorm, leesHerstel, maakHerstel, maakHerstelcode, normaliseer, ruimHerstelIdOp, toestelSleutel } from './herstel.js';
import { herstelInvoer, herstelcodeStap } from './herstelscherm.js';
import { codeKiezer } from './instellen.js';

// De twee remmen: de pincode en de herstelcode hebben elk hun eigen teller en wachttijd, met dezelfde oplopende tijden (pin.js).
const PIN_REM = { fouten: 'slot.fouten', wachtTot: 'slot.wachtTot' };
const HERSTEL_REM = { fouten: 'slot.herstelFouten', wachtTot: 'slot.herstelWachtTot' };

// Wat gebeurt er als ze naar de app terugkeert nadat die op de achtergrond stond?
//   'nooit'  : het gordijn verdwijnt zonder code, hoe lang ze ook weg was (de code komt alleen bij het openen)
//   'altijd' : het gordijn maakt plaats voor het slot met het cijferblok
export const BIJ_TERUGKEER = 'altijd';

// BESLISSING 532 (eigenaar: "Nooit, alleen bij echt verlaten"): alleen focusverlies (een ander venster, een schermafbeeldingsprogramma of een
// systeemoverlay ligt erover, maar het tabblad is nog te zien) doet niets: geen gordijn, geen code, hoe lang het ook duurt. Zo toont een
// schermafbeelding het dagboek. Bloei vergrendelt alleen bij echt verlaten: verborgen (visibilitychange), pagehide, sluiten en herladen.

let toestand = 'open'; // 'open' | 'gordijn' | 'dicht'
let vraagBijTerugkeer = false; // het gordijn kwam doordat de pagina echt verlaten werd (sinds BESLISSING 532 altijd zo)
let luistert = false;
let ontgrendelFn = null; // lost de belofte van startSlot op
let opruim = []; // timers en dergelijke van het getoonde slot
let verborgenDoor = new Map(); // body-kinderen die we verborgen hebben, met hun vorige stand
let scherm = null; // wat er in het slot staat: 'code', 'kwijt', 'herstel' (een herstel loopt) of null

const slotEl = () => {
  let el = document.getElementById('slot');
  if (!el) {
    el = h('div', { id: 'slot', hidden: true });
    document.body.append(el);
  }
  return el;
};

// ---- de rest van de pagina weghalen of terugzetten ----
// Zolang het slot of het gordijn erover ligt, is alles in <body> behalve het slot zelf verborgen en inert.
// Wat er tijdens het slot nieuw bij komt (een strook, een viering, een blad, de installatiestrook) wordt door een
// MutationObserver meteen ook verborgen. display:none staat als inline stijl (via CSSOM, dat mag onder de CSP) en wint
// van elke display-regel van een component; een open dialoog blijft bestaan en komt later terug zoals ze was.
let waarnemer = null;

function verbergKind(kind) {
  if (kind === slotEl() || kind.tagName === 'SCRIPT' || verborgenDoor.has(kind)) return;
  verborgenDoor.set(kind, {
    hidden: kind.hidden,
    inert: kind.inert,
    display: kind.style.getPropertyValue('display'),
    prioriteit: kind.style.getPropertyPriority('display'),
  });
  kind.hidden = true;
  kind.inert = true;
  kind.style.setProperty('display', 'none', 'important');
}

function verberg() {
  for (const kind of [...document.body.children]) verbergKind(kind);
  if (!waarnemer) {
    waarnemer = new MutationObserver((lijst) => {
      for (const m of lijst) for (const node of m.addedNodes) if (node.nodeType === 1 && node.parentNode === document.body) verbergKind(node);
    });
    waarnemer.observe(document.body, { childList: true });
  }
}

function toon() {
  waarnemer?.disconnect();
  waarnemer = null;
  for (const [kind, stand] of verborgenDoor) {
    kind.hidden = stand.hidden;
    kind.inert = stand.inert;
    if (stand.display) kind.style.setProperty('display', stand.display, stand.prioriteit);
    else kind.style.removeProperty('display');
  }
  verborgenDoor = new Map();
}

function ruimOp() {
  for (const stop of opruim) stop();
  opruim = [];
}

function sluitSlot() {
  ruimOp();
  const el = slotEl();
  el.hidden = true;
  el.classList.remove('slot--gordijn');
  el.replaceChildren();
  el.removeAttribute('role');
  el.removeAttribute('aria-modal');
  el.removeAttribute('aria-label');
}

// Spiegel in het geheugen van "staat het slot aan?". Het gordijn moet er meteen liggen als de pagina naar de achtergrond gaat:
// iOS maakt de momentopname voor de app-wisselaar op dat ogenblik, en een leesbeurt in IndexedDB kan te laat komen.
// Bijgewerkt bij elke lezing, bij een gewijzigde instelling en na het wissen; bij twijfel leest de app de database opnieuw.
let aanBekend = false;

async function isAan() {
  // In de demo (BESLISSING 364) staat de vergrendeling altijd uit, ook als er in de demodatabase toevallig een instelling staat.
  if (DEMO) {
    aanBekend = false;
    return false;
  }
  const aan = Boolean(await leesInstelling('slot.aan')) && Boolean(await leesInstelling('slot.pin'));
  aanBekend = aan;
  return aan;
}

// ---- gordijn: alleen het merk, zonder invoer ----
// vraag: true als de pagina echt verlaten wordt (naar de achtergrond, tab weg, pagehide); dan vraagt het slot bij terugkeer de code
// (zie BIJ_TERUGKEER). Een gewone blur legt sinds BESLISSING 532 geen gordijn meer; vraag = false blijft voor wie bedek zonder code wil.
// Wordt de pagina echt verlaten (vraag = true), dan gaat ook 'slot:dicht' uit: de app bewaart wat wacht en haalt het dagboek uit de pagina
// (app.js). Met vraag = false blijft het bij het gordijn en blijft de pagina staan.
function bedek(vraag = false) {
  if (toestand === 'gordijn') {
    if (vraag) {
      vraagBijTerugkeer = true;
      zend('slot:dicht', {});
    }
    return;
  }
  if (toestand !== 'open') return;
  toestand = 'gordijn';
  vraagBijTerugkeer = vraag;
  // 'slot:dicht' vóór het verbergen, in dezelfde synchrone stap (er komt dus geen beeld tussen): de app leest dan nog de echte scrollstand.
  if (vraag) zend('slot:dicht', {});
  verberg();
  const el = slotEl();
  el.classList.add('slot--gordijn');
  el.replaceChildren(h('div', { class: 'slot__binnen' }, logo({ grootte: 36 })));
  el.hidden = false;
}

// Het gordijn gaat weg zonder code. Had de app de pagina geleegd, dan tekent ze die bij 'slot:open' opnieuw (anders doet ze niets).
function ontdek() {
  if (toestand !== 'gordijn') return;
  toestand = 'open';
  sluitSlot();
  toon();
  zend('slot:open', {});
}

// ---- ontgrendelen ----
// melding: een korte bevestiging na een herstel; zonder melding kan het aanbod voor een herstelcode komen (zie biedHerstelcodeAan).
// naWissen: na "Alles wissen" wordt er niets meer weggeschreven (de app belooft dat alles gewist is): alleen de toestand gaat open.
// meldingDuur: hoe lang de strook van de melding blijft staan (standaard die van strook()).
async function ontgrendel({ melding = null, naWissen = false, meldingDuur } = {}) {
  if (toestand === 'open') return;
  if (!naWissen) {
    await zetInstelling('slot.fouten', 0);
    await zetInstelling('slot.wachtTot', 0);
    await zetInstelling('slot.herstelFouten', 0);
    await zetInstelling('slot.herstelWachtTot', 0);
  }
  toestand = 'open';
  scherm = null;
  // BESLISSING 638: het volgende slot begint weer met de bewaarde sleutel (toestelweg.js).
  vergeetTerugval();
  sluitSlot();
  toon();
  zend('slot:open', {});
  const klaar = ontgrendelFn;
  ontgrendelFn = null;
  klaar?.();
  if (melding) strook(melding, { duur: meldingDuur });
  else if (!naWissen) biedHerstelcodeAan();
}

// BESLISSING 518, bestaande gebruikers: wie het slot al aan had zonder (bevestigde) herstelcode, krijgt na het eerstvolgende ontgrendelen één keer een
// rustige strook met de weg naar Vergrendeling. Geen dwang: daar blijft het een open punt (scherm.js).
async function biedHerstelcodeAan() {
  try {
    if (!(await isAan()) || (await heeftBevestigdeHerstelcode()) || (await leesInstelling('slot.herstelAanbod'))) return;
    await zetInstelling('slot.herstelAanbod', true);
    strook(t('slot.aanbodTekst'), { actie: { label: t('slot.aanbodKnop'), opKlik: () => (window.location.hash = '#/meer/vergrendeling') }, duur: 12000 });
  } catch {
    /* een aanbod mag het openen nooit hinderen */
  }
}

async function wachtMs(rem = PIN_REM) {
  return resterendeWacht(await leesInstelling(rem.wachtTot), Date.now());
}

function wachtTekst(ms) {
  if (ms < 60000) return t('slot.pinWacht', { seconden: String(Math.ceil(ms / 1000)) });
  return t('slot.pinWachtMinuten', { minuten: String(Math.ceil(ms / 60000)) });
}

// Registreert een foute poging; geeft de nieuwe wachttijd in ms (0 = geen).
// Lezen en schrijven in één transactie (OWASP-scan punt 5): tabbladen die tegelijk proberen, verliezen zo geen telling.
async function telFout(rem = PIN_REM) {
  const stand = await db.transaction('rw', db.instellingen, async () => {
    const s = naFout({ fouten: await leesInstelling(rem.fouten) }, Date.now());
    await db.instellingen.bulkPut([{ sleutel: rem.fouten, waarde: s.fouten }, { sleutel: rem.wachtTot, waarde: s.wachtTot }]);
    return s;
  });
  zend('instelling:gewijzigd', { sleutel: rem.fouten, waarde: stand.fouten });
  zend('instelling:gewijzigd', { sleutel: rem.wachtTot, waarde: stand.wachtTot });
  return stand.wachtTot ? stand.wachtTot - Date.now() : 0;
}

// Houdt een boodschap bij met een aftelling zolang de wachttijd loopt; zet de invoer dan uit.
function wachtteller(boodschap, zetUit, rem = PIN_REM) {
  let timer = null;
  const ververs = async () => {
    const ms = await wachtMs(rem);
    if (ms > 0) {
      boodschap.textContent = wachtTekst(ms);
      zetUit(true);
      if (!timer) timer = setInterval(ververs, 1000);
    } else {
      if (timer) {
        clearInterval(timer);
        timer = null;
        boodschap.textContent = '';
      }
      zetUit(false);
    }
  };
  opruim.push(() => clearInterval(timer));
  return ververs;
}

// ---- het slotscherm ----
async function toonCode() {
  toestand = 'dicht';
  // Zelfde synchrone stap als het verbergen hieronder (zie bedek): eerst de app laten bewaren en leegmaken.
  zend('slot:dicht', {});
  verberg();
  const el = slotEl();
  el.classList.remove('slot--gordijn');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('slot.open'));
  el.hidden = false;
  await tekenCode();
}

async function tekenCode() {
  ruimOp();
  scherm = 'code';
  const el = slotEl();
  const bewaard = await leesInstelling('slot.pin');
  const passkeyId = await leesInstelling('slot.passkeyId');
  // Alleen bij de keuze Face ID vraagt Bloei het toestel iets en staat de knop er; bij Pincode raakt het slot het toestel niet aan (BESLISSING 194).
  const methode = bepaalMethode(await leesInstelling('slot.methode'), passkeyId);
  const kanFaceId = methode === 'faceid' && (await passkeyMogelijk());

  const boodschap = h('p', { class: 'slot__boodschap', role: 'status', 'aria-live': 'polite' });
  let blok = null;
  const ververs = wachtteller(boodschap, (u) => blok?.zetUit(u));

  async function probeer(code) {
    if ((await wachtMs()) > 0) {
      await ververs();
      return false;
    }
    // Altijd de bewaarde code van NU: een ander tabblad kan ze intussen gewijzigd of hersteld hebben (data/kanaal.js); de oude code werkt dan niet meer.
    const nu = await leesInstelling('slot.pin');
    if (await controleer(code, nu)) {
      await ontgrendel();
      // Een code met minder rondes (pin.js) pas NA het openen stil omzetten: het openen wacht er niet op, en lukt het niet, dan werkt de oude code gewoon verder.
      await zetOmIndienVerouderd(code, nu, { lees: () => leesInstelling('slot.pin'), bewaar: (w) => zetInstelling('slot.pin', w) });
      return true;
    }
    const wacht = await telFout();
    boodschap.textContent = wacht > 0 ? wachtTekst(wacht) : t('slot.pinFout');
    await ververs();
    return false;
  }

  // Annuleren of mislukken is geen foute poging: geen teller; het cijferblok staat er al. Kon het toestel de vraag niet stellen (passkey.js,
  // vraagToestel: fout), dan zegt een rustige zin dat de pincode werkt; annuleren of afbreken blijft stil. Een tik breekt een lopende vraag af
  // (bv. de automatische die onzichtbaar blijft hangen) en vraagt meteen opnieuw, in dezelfde taak als de tik.
  async function faceId({ automatisch = false } = {}) {
    // openMetPasskey is zelf vrijgesteld en kijkt het antwoord na zoals bij het herstel (passkey.js, controleerBevestiging); alleen ok opent.
    const { ok, fout } = await openMetPasskey(passkeyId, { automatisch });
    if (ok) await ontgrendel();
    else if (fout) boodschap.textContent = t('slot.faceIdMislukt');
  }

  blok = cijferblok({ opKlaar: probeer, lengte: lengteVan(bewaard) });
  const acties = h(
    'div',
    { class: 'slot__acties' },
    kanFaceId ? knop(methodeTekst('slot.faceIdAan'), { soort: 'secundair', breed: true, opKlik: () => faceId() }) : null,
    knop(t('slot.codeKwijt'), { soort: 'tekst', opKlik: () => tekenKwijt() }),
  );

  el.replaceChildren(
    h(
      'div',
      { class: 'slot__binnen' },
      logo({ grootte: 36 }),
      h('h1', { class: 't-h1 slot__titel' }, t('slot.open')),
      h('p', { class: 'slot__uitleg' }, t('slot.geefCode')),
      blok.el,
      boodschap,
      acties,
    ),
  );
  await ververs();
  blok.focus();
  if (kanFaceId && document.visibilityState !== 'hidden') faceId({ automatisch: true });
}

// ---- code niet meer weten (BESLISSING 518): Bloei haalt de code niet terug, maar ze kiest een nieuwe na een bevestiging. ----
// Twee wegen, elk alleen als ze bestaat (geen dode knop): bevestigen met het toestel en de herstelcode. "Alles wissen en opnieuw beginnen" staat
// onderaan, in twee stappen, en vraagt daarna het toestel (BESLISSING 631); kan het toestel dat niet, dan zegt de knop dat wissen hier niet kan. Alles staat in het slot zelf: een dialoog buiten #slot zou verborgen zijn zolang het slot dicht is.
// Zolang er geen nieuwe code bewaard is, verandert er niets en blijft het slot dicht.
// BESLISSING 541: de weg van het toestel staat er ALTIJD als het toestel een platformauthenticator met gebruikersverificatie heeft, zonder vooraf
// te koppelen (passkey.js, bevestigMetToestel: bij Face ID de passkey van het slot, anders een sleutel voor één keer die meteen vergeten wordt).
// Geen eigen rem: elke poging vraagt een tik en het toestel remt zelf (Face ID, vingerafdruk, schermslot). Annuleren of mislukken telt niet als
// foute poging, wijzigt niets en laat de andere wegen staan.
// BESLISSING 638: lukt het niet met de passkey van het slot (bv. verwijderd uit het wachtwoordbeheer), dan zegt een rustige zin dat de volgende
// tik op dezelfde knop het anders vraagt, en die tik neemt de sleutel voor één keer (toestelweg.js). Ook bij het wissen hieronder.
async function tekenKwijt() {
  ruimOp();
  scherm = 'kwijt';
  const el = slotEl();
  const passkeyId = await toestelSleutel();
  const metToestel = await passkeyMogelijk();
  const metCode = Boolean(await leesHerstel());
  const boodschap = h('p', { class: 'slot__boodschap', role: 'status', 'aria-live': 'polite' });
  let toestelKnop = null;
  let bezig = false;

  async function metHetToestel() {
    if (bezig) return;
    bezig = true;
    boodschap.textContent = '';
    toestelKnop.disabled = true;
    try {
      // BESLISSING 643: neemt deze tik de eenmalige weg terwijl er een passkey van het slot is (de vraag met die sleutel mislukte net), dan zet een
      // geslaagd herstel de methode op Pincode. Gelezen vóór de vraag en zonder await: de vraag moet nog in de tik zelf vertrekken.
      const viaTerugval = Boolean(passkeyId) && neemtTerugval();
      // BESLISSING 638: lukt het niet met de bewaarde sleutel, dan neemt deze knop bij de volgende tik de eenmalige weg (toestelweg.js).
      const { ok: gelukt, terugval } = await bevestigMetTerugval({ passkeyId });
      // Alleen verder als dit scherm er nog staat: Terug, een ander tabblad (het slot ging open of de code veranderde) of het wissen gaan voor.
      if (toestand !== 'dicht' || scherm !== 'kwijt' || !toestelKnop.isConnected) return;
      if (gelukt) tekenNieuweCode({ via: 'toestel', naarPincode: viaTerugval });
      else boodschap.textContent = t(terugval ? 'slot.toestelTerugval' : 'slot.toestelMislukt');
    } finally {
      bezig = false;
      toestelKnop.disabled = false;
    }
  }

  const weg = metToestel && metCode ? 'slot.kwijtBeide' : metToestel ? 'slot.kwijtToestel' : metCode ? 'slot.kwijtCode' : 'slot.kwijtGeenWeg';
  if (metToestel) toestelKnop = knop(methodeTekst('slot.herstelToestel'), { soort: 'primair', breed: true, opKlik: metHetToestel });
  el.replaceChildren(
    h(
      'div',
      // slot__wegenscherm: alleen dit scherm krijgt op de laagste telefoon de kleine tekstmaat (slot.css, BESLISSING 644)
      { class: 'slot__binnen slot__kwijt slot__wegenscherm' },
      logo({ grootte: 36 }),
      h('h1', { class: 't-h1 slot__titel' }, t('slot.kwijtTitel')),
      h('p', { class: 'slot__uitleg' }, t('slot.kwijtGeen')),
      h('p', { class: 'slot__uitleg' }, methodeTekst(weg)),
      // BESLISSING 631: opnieuw beginnen vraagt ook het toestel; kan het dat niet, dan zegt deze zin eerlijk dat wissen hier niet kan.
      h('p', { class: 'slot__uitleg' }, methodeTekst(metToestel ? 'slot.kwijtWissenToestel' : 'slot.kwijtWissenNiet')),
      // slot__kant: de meldingsregel en de knoppen; liggend de rechterkolom (slot.css, BESLISSING 654), anders telt de houder niet mee
      h(
        'div',
        { class: 'slot__kant' },
        boodschap,
        h(
          'div',
          { class: 'slot__acties slot__acties--kwijt' },
          // BESLISSING 522: de wegen naast elkaar, even breed en gecentreerd (op een smalle telefoon onder elkaar, even breed)
          metToestel || metCode
            ? h(
                'div',
                { class: 'slot__wegen' },
                toestelKnop,
                metCode ? knop(t('slot.herstelCodeKnop'), { soort: 'primair', breed: true, opKlik: () => tekenHerstelInvoer() }) : null,
              )
            : null,
          knop(t('slot.kwijtWis'), { soort: 'secundair', breed: true, opKlik: () => (metToestel ? tekenWisVraag(1, { passkeyId }) : tekenWisKanNiet()) }),
          knop(t('slot.terug'), { soort: 'tekst', opKlik: () => tekenCode() }),
        ),
      ),
    ),
  );
}

// De herstelcode ingeven, met een eigen rem (HERSTEL_REM): na vijf foute codes een oplopende wachttijd, zoals bij de pincode. Een code in een
// verkeerde vorm (geen twaalf tekens uit het alfabet) kan nooit kloppen en telt niet als poging. Foute pogingen wissen nooit iets.
function tekenHerstelInvoer() {
  ruimOp();
  scherm = 'herstel';
  const el = slotEl();
  let ververs = async () => {};
  const invoer = herstelInvoer({
    opTerug: () => tekenKwijt(),
    opIngave: async (tekst) => {
      const wacht = await wachtMs(HERSTEL_REM);
      if (wacht > 0) {
        await ververs();
        return wachtTekst(wacht);
      }
      if (!isGeldigeVorm(normaliseer(tekst))) return t('slot.herstelVorm');
      if (await controleerHerstel(tekst, await leesHerstel())) {
        await bewaarSamen({ 'slot.herstelFouten': 0, 'slot.herstelWachtTot': 0 });
        tekenNieuweCode({ via: 'code' });
        return null;
      }
      const ms = await telFout(HERSTEL_REM);
      if (ms > 0) await ververs();
      return ms > 0 ? wachtTekst(ms) : t('slot.herstelFout');
    },
  });
  ververs = wachtteller(invoer.boodschap, invoer.zetUit, HERSTEL_REM);
  el.replaceChildren(
    h(
      'div',
      { class: 'slot__binnen slot__kwijt' },
      logo({ grootte: 36 }),
      h('h1', { class: 't-h1 slot__titel' }, t('slot.herstelInvoerTitel')),
      h('p', { class: 'slot__uitleg' }, t('slot.herstelInvoerUitleg')),
      invoer.el,
    ),
  );
  ververs();
  invoer.focus();
}

// Na een geslaagde bevestiging: een nieuwe pincode kiezen (twee keer). Annuleren gaat terug zonder iets te wijzigen.
//   via 'toestel': de nieuwe code wordt bewaard en de app gaat open; de herstelcode blijft geldig.
//   via 'code': de oude herstelcode is verbruikt. De nieuwe code en een nieuwe herstelcode worden SAMEN bewaard (één transactie, herstel.js),
//   pas daarna toont Bloei de nieuwe herstelcode, met het vinkje. Sluit de app tussen kiezen en bewaren, dan gelden de oude code en de oude
//   herstelcode nog; sluit ze na het bewaren, dan kent ze haar nieuwe code. Het slot blijft dicht tot ze op Verder tikt.
//   naarPincode (BESLISSING 643, alleen via 'toestel'): het toestel bevestigde via de terugval (638), dus de passkey van het slot bestaat misschien
//   niet meer. De nieuwe code en de methode Pincode gaan samen in één transactie (herstel.js, bewaarMetPincode), daarna zegt een strook dat Bloei
//   nu met de code opent en waar Face ID weer aangaat.
function tekenNieuweCode({ via, naarPincode = false }) {
  ruimOp();
  scherm = 'herstel';
  const el = slotEl();
  const plaats = (...inhoud) => el.replaceChildren(h('div', { class: 'slot__binnen slot__kwijt' }, logo({ grootte: 36 }), ...inhoud));
  const kiezer = codeKiezer({
    intro: t('slot.nieuweCodeIntro'),
    opTerug: () => tekenKwijt(),
    opKlaar: async (code) => {
      try {
        const pin = await maakPin(code);
        const nieuw = { 'slot.pin': pin, 'slot.fouten': 0, 'slot.wachtTot': 0, 'slot.herstelFouten': 0, 'slot.herstelWachtTot': 0 };
        if (via !== 'code' && naarPincode) {
          await bewaarMetPincode(nieuw);
          await ruimHerstelvraagOp().catch(() => {});
          await ontgrendel({ melding: methodeTekst('slot.hersteldPincode'), meldingDuur: 8000 });
          return;
        }
        if (via !== 'code') {
          await bewaarSamen(nieuw);
          await ontgrendel({ melding: t('slot.hersteld') });
          return;
        }
        const herstelcode = maakHerstelcode();
        const herstel = await maakHerstel(herstelcode, { bevestigd: false });
        await bewaarSamen({ ...nieuw, 'slot.herstel': herstel });
        const stap = herstelcodeStap({
          code: herstelcode,
          kop: 'h1',
          titel: t('slot.herstelNieuwTitel'),
          extra: t('slot.herstelOudVervalt'),
          opVerder: async () => {
            await zetInstelling('slot.herstel', { ...herstel, bevestigd: true });
            await ontgrendel({ melding: t('slot.hersteld') });
          },
        });
        plaats(stap.el);
        stap.focus();
      } catch {
        // Niets of alles is bewaard (één transactie); bij een fout blijft de oude stand en kan ze het opnieuw proberen.
        tekenKwijt();
      }
    },
  });
  plaats(h('h1', { class: 't-h1 slot__titel' }, t('slot.nieuweCodeTitel')), kiezer.el);
  kiezer.focus();
}

// Twee stappen: eerst uitleggen wat er verdwijnt, dan nog eens vragen. Na de tweede Ja vraagt Bloei het toestel (BESLISSING 631, wisvanslot.js);
// pas als dat bevestigt, wist Bloei alles en begint het opnieuw. Annuleren of mislukken bij het toestel wist niets: ze blijft op deze vraag, met
// een rustige melding. Alleen bereikbaar als het toestel kan bevestigen (tekenKwijt); anders toont de knop tekenWisKanNiet.
async function tekenWisVraag(stap, { passkeyId = null } = {}) {
  ruimOp();
  scherm = 'wis';
  const el = slotEl();
  const boodschap = h('p', { class: 'slot__boodschap', role: 'status', 'aria-live': 'polite' });
  let bezig = false;
  let ga = null;
  async function wisMetToestel() {
    if (bezig) return;
    bezig = true;
    boodschap.textContent = '';
    ga.disabled = true;
    // Geen await vóór de vraag aan het toestel: die moet nog in de tik zelf vertrekken (wisvanslot.js).
    const uit = await wisNaToestel({ metToestel: true, passkeyId, nogGeldig: () => toestand === 'dicht' && scherm === 'wis' && ga.isConnected });
    if (uit === 'gewist') {
      await ontgrendel({ naWissen: true });
      window.location.hash = '';
      window.location.reload();
      return;
    }
    bezig = false;
    ga.disabled = false;
    // Terug, een ander tabblad of het slot dat openging, gaan voor: dan staat deze vraag er niet meer en is er niets te melden.
    if (uit === 'afgebroken' || !ga.isConnected) return;
    boodschap.textContent = t(uit === 'fout' ? 'algemeen.foutOpslag' : uit === 'terugval' ? 'slot.wisTerugval' : 'slot.wisMislukt');
  }
  ga =
    stap === 1
      ? knop(t('slot.wisDoorgaan'), { soort: 'secundair', breed: true, opKlik: () => tekenWisVraag(2, { passkeyId }) })
      : knop(t('slot.wisJa'), { breed: true, opKlik: wisMetToestel });
  el.replaceChildren(
    h(
      'div',
      { class: 'slot__binnen slot__kwijt' },
      logo({ grootte: 36 }),
      h('h1', { class: 't-h1 slot__titel' }, t(stap === 1 ? 'slot.wisTitel1' : 'slot.wisTitel2')),
      h('p', { class: 'slot__uitleg' }, t(stap === 1 ? 'slot.wisTekst1' : 'slot.wisTekst2')),
      h('div', { class: 'slot__kant' }, boodschap, h('div', { class: 'slot__acties' }, ga, knop(t(stap === 1 ? 'slot.terug' : 'slot.wisNee'), { soort: 'tekst', opKlik: () => tekenKwijt() }))),
    ),
  );
}

// BESLISSING 631: kan het toestel niet bevestigen (geen Face ID, vingerafdruk of schermslot dat de browser kan gebruiken, of een browser zonder
// WebAuthn), dan kan alles wissen vanuit het slot niet. De knop zegt dat eerlijk en waarom; er is bewust geen andere weg.
function tekenWisKanNiet() {
  ruimOp();
  scherm = 'wis';
  const el = slotEl();
  el.replaceChildren(
    h(
      'div',
      { class: 'slot__binnen slot__kwijt' },
      logo({ grootte: 36 }),
      h('h1', { class: 't-h1 slot__titel' }, t('slot.wisKanNietTitel')),
      h('p', { class: 'slot__uitleg' }, methodeTekst('slot.wisKanNietTekst')),
      h('div', { class: 'slot__kant' }, h('div', { class: 'slot__acties' }, knop(t('slot.terug'), { breed: true, opKlik: () => tekenKwijt() }))),
    ),
  );
}

// ---- openbare ingang ----

// De gekozen manier om te openen: 'pin' of 'faceid' (zie bepaalMethode in pin.js).
export async function leesMethode() {
  return bepaalMethode(await leesInstelling('slot.methode'), await leesInstelling('slot.passkeyId'));
}

// Hoeveel cijfers heeft de bewaarde code (zes, of vier bij een oude code)?
export async function leesPinLengte() {
  return lengteVan(await leesInstelling('slot.pin'));
}

// Voor het instelscherm (code wijzigen of uitzetten): controleert de huidige code met dezelfde teller en
// wachttijd als het slot zelf, zonder iets te ontgrendelen. Geeft { ok, wachtMs }.
export async function controleerHuidigeCode(code) {
  const wacht = await wachtMs();
  if (wacht > 0) return { ok: false, wachtMs: wacht };
  const bewaard = await leesInstelling('slot.pin');
  if (await controleer(code, bewaard)) {
    await zetInstelling('slot.fouten', 0);
    await zetInstelling('slot.wachtTot', 0);
    return { ok: true, wachtMs: 0 };
  }
  return { ok: false, wachtMs: await telFout() };
}

export { wachtTekst };

// Een herstelvraag uit een oudere versie wordt genegeerd en bij de eerstvolgende wijziging van het slot opgeruimd.
export async function ruimHerstelvraagOp() {
  for (const sleutel of ['slot.vraag', 'slot.antwoord']) if (await leesInstelling(sleutel)) await zetInstelling(sleutel, null);
}

// Wordt bij het opstarten aangeroepen en lost pas op als de app open mag.
export async function startSlot() {
  if (!luistert) {
    luistert = true;
    // Het gordijn komt zodra de pagina verborgen wordt of verdwijnt (pagehide), zodat een momentopname van de app-wisselaar niets toont.
    // Alleen focusverlies (blur) doet niets (BESLISSING 532). focus blijft een extra teken van terugkeer, naast visibilitychange en pageshow.
    // Terug (zichtbaar of focus): zie BIJ_TERUGKEER.
    // Een systeemvenster dat de app zelf opende (deelmenu, bestandskiezer, afdrukken, Face ID) is vrijgesteld (vrijstelling.js).
    // Het gordijn komt zonder te wachten (synchroon) als bekend is dat het slot aan staat; daarna wordt het nog eens nagekeken.
    // Beveiliging: ging de pagina echt naar de achtergrond terwijl een systeemvenster vrijgesteld was, dan onthouden we dat. Loopt de
    // vrijstelling af terwijl de pagina nog verborgen is (of loopt ze vast tot haar maximum), dan gaat het slot alsnog dicht.
    let gemist = false;
    const bedekIndienAan = (echtVerlaten) => {
      if (isVrijgesteld()) {
        if (echtVerlaten) gemist = true;
        return;
      }
      gemist = false;
      if (toestand === 'gordijn') {
        if (echtVerlaten) bedek(true);
        return;
      }
      if (toestand !== 'open') return;
      if (aanBekend) bedek(echtVerlaten);
      isAan().then((aan) => {
        if (aan && toestand === 'open') bedek(echtVerlaten);
        else if (!aan && toestand === 'gordijn') ontdek();
      });
    };
    naVrijstelling(() => {
      if (gemist && document.visibilityState === 'hidden') bedekIndienAan(true);
    });
    const terug = async () => {
      if (gemist && toestand === 'open') {
        // Terug terwijl het systeemvenster nog vrijgesteld is: de gewone weg (deelmenu, bestandskiezer). Anders was de pagina weg
        // zonder dat het slot dichtging: nu alsnog de code.
        if (isVrijgesteld()) gemist = false;
        else {
          gemist = false;
          // Na de await opnieuw kijken: een gelijktijdige terug() (focus, pageshow) kan het slot intussen al getoond hebben (R6-03).
          if ((await isAan()) && toestand === 'open') await toonCode();
          return;
        }
      }
      if (toestand !== 'gordijn') return;
      // visibilitychange, focus en pageshow komen bij terugkeer kort na elkaar en roepen elk terug() aan. Alleen de eerste die na de
      // await nog het gordijn ziet, toont het slot (toonCode zet de toestand meteen op 'dicht'); anders twee keer slot:dicht en twee
      // gelijktijdige Face ID-vragen die elkaar afbreken (R6-03).
      if (BIJ_TERUGKEER === 'altijd' && vraagBijTerugkeer && (await isAan())) {
        if (toestand === 'gordijn') await toonCode();
      } else ontdek();
    };
    luister('instelling:gewijzigd', ({ sleutel }) => {
      if (sleutel === 'slot.aan' || sleutel === 'slot.pin') isAan();
    });
    luister('data:gewijzigd', () => isAan());
    // Een ander tabblad van Bloei (data/kanaal.js) wijzigde of herstelde de code, of zette het slot uit (BESLISSING 518):
    //  - de code is gewijzigd en dit tabblad staat open: het gaat dicht en vraagt de nieuwe code (bij het eerste instellen niet: toen stond het slot nog uit);
    //  - dit tabblad toont het cijferblok: opnieuw tekenen (de lengte kan veranderd zijn; probeer() leest de code toch altijd opnieuw);
    //  - het slot is helemaal uit (geen code meer) en dit tabblad staat dicht: het gaat open, zoals bij een herlading.
    luister('elders:gewijzigd', async ({ naam, sleutel } = {}) => {
      if (naam !== 'instelling:gewijzigd' || (sleutel !== 'slot.pin' && sleutel !== 'slot.aan')) return;
      const was = aanBekend;
      const aan = await isAan();
      if (!aan) {
        if (toestand === 'dicht' && !(await leesInstelling('slot.pin'))) await ontgrendel();
        return;
      }
      if (sleutel !== 'slot.pin') return;
      if (toestand === 'dicht' && scherm === 'code') await tekenCode();
      else if (toestand === 'open' && was) await toonCode();
    });
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? bedekIndienAan(true) : terug()));
    window.addEventListener('pagehide', () => bedekIndienAan(true));
    window.addEventListener('focus', terug);
    window.addEventListener('pageshow', terug);
    // BESLISSING 541: een herstelsleutel uit de tijd van "Je toestel als hulp" opruimen (herstel.js). Eén keer per start, op de achtergrond: het
    // openen wacht er niet op en een mislukking houdt niets tegen. Dit opent niets en toont niets. In de demo doet het niets (herstel.js).
    ruimHerstelIdOp().catch(() => {});
  }
  if (!(await isAan())) return;
  await new Promise((klaar) => {
    ontgrendelFn = klaar;
    toonCode();
  });
}

// Vergrendelt meteen (als het slot aan staat).
export function vergrendel() {
  isAan().then((aan) => {
    if (aan && toestand === 'open') toonCode();
  });
}

export function isOpen() {
  return toestand === 'open';
}

