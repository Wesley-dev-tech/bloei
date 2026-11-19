// De supplementenlijst als bestand (BESLISSING 696): de pure kant. Geen database en geen DOM.
//
// Het bestand bevat alleen de lijst zelf: per supplement de naam, de hoeveelheid, de aanwijzing, het ritme, de momenten en de periode
// (ook van een spuit: dat is gewoon een periodiek supplement met "spuit" of "injectie" in de naam, BESLISSING 275). Geen naam van de
// gebruiker, geen dagboek, geen afgevinkte dagen, geen id, geen volgnummer, geen tijdstip van aanmaken en geen dag van toevoegen (teltVanaf,
// BESLISSING 698: dat zegt iets over de gebruiker; wie het bestand overneemt, telt vanaf de dag van overnemen). De volgorde van de lijst is de
// volgorde van de rij in het bestand.
//
// Voorbeeld:
//   {
//     "soort": "bloei-supplementenlijst",
//     "versie": 1,
//     "supplementen": [
//       { "naam": "Multivitamine", "hoeveelheid": "1 pilletje", "aanwijzing": "bij het ontbijt", "ritme": { "soort": "dagelijks" }, "momenten": ["ochtend"] },
//       { "naam": "Voorbeeldspuit", "hoeveelheid": "1 ampul", "aanwijzing": "", "ritme": { "soort": "interval", "dagen": 14, "start": "2026-11-09" }, "momenten": [], "tot": "2027-03-01" }
//     ]
//   }
//
// leesBestand is streng (OWASP: het bestand is onbetrouwbare invoer, het kan van iemand anders komen of aangepast zijn): klopt er één ding
// niet, dan wordt het hele bestand geweigerd. Er wordt nooit een deel overgenomen.
import { MAX_LENGTE, begrens } from '../data/grenzen.js';
import { isDatum } from '../kern/datum.js';
import { MOMENTEN } from './supplementen.js';
import { MAX_INTERVAL_DAGEN, MAX_JAAR, MIN_JAAR, controleer, formulierVan, isEchteDatum, naarAanroep } from './supplementformulier.js';

// De grenzen van een ritme en een datum komen uit supplementformulier.js (een bron); hier opnieuw uitgevoerd voor wie ze uit dit bestand haalt.
export { MAX_INTERVAL_DAGEN, isEchteDatum };

export const SOORT = 'bloei-supplementenlijst';
export const VERSIE = 1;
export const BESTANDSNAAM = 'bloei-supplementenlijst.txt';
export const BESTANDSTYPE = 'text/plain';

// Grenzen. Een echte lijst telt een handvol tot een twintigtal supplementen; 100 is ruim vijf keer dat. Eén supplement met alle teksten op
// hun grens (100 + 120 + 120 tekens, tot 4 bytes per teken in UTF-8) plus de rest is hoogstens zowat 1,6 kB, dus 100 supplementen passen
// ruim in 256 kB, ook met inspringing. Wat groter is, is geen supplementenlijst: het wordt geweigerd vóór het gelezen wordt.
export const MAX_SUPPLEMENTEN = 100;
export const MAX_BESTAND_BYTES = 256 * 1024;

// De redenen waarmee leesBestand een bestand weigert. Het scherm vertaalt elke reden naar een gewone zin (zie het rapport van deel 1).
export const REDENEN = Object.freeze(['leeg', 'te-groot', 'onleesbaar', 'ander-bestand', 'nieuwere-versie', 'lege-lijst', 'te-veel', 'ongeldig']);

// De velden die in het bestand mogen staan: een lijst van toegelaten velden, zodat een veld dat de database later bijkrijgt nooit vanzelf
// meekomt. Per veld waarom het erin zit:
//   naam        wat ze neemt, en waaraan het overnemen herkent of een supplement er al staat (en of het een spuit is)
//   hoeveelheid wat ze per keer neemt ("1 pilletje")
//   aanwijzing  hoe ze het neemt ("oplossen in water")
//   ritme       dagelijks, om de N dagen of elke maand; bij periodiek ook de start, want daarop ligt de hele reeks vast (BESLISSING 208)
//   momenten    ochtend, middag, avond (leeg bij een periodiek supplement)
//   vanaf, tot  de periode (BESLISSING 211); alleen als ze er is
const VELDEN = Object.freeze(['naam', 'hoeveelheid', 'aanwijzing', 'ritme', 'momenten', 'vanaf', 'tot']);
const VERPLICHT = Object.freeze(['naam', 'hoeveelheid', 'aanwijzing', 'ritme', 'momenten']);
const RITME_VELDEN = Object.freeze({ dagelijks: ['soort'], interval: ['soort', 'dagen', 'start'], maand: ['soort', 'start'] });
const KOP_VELDEN = Object.freeze(['soort', 'versie', 'supplementen']);

// Besturingstekens (C0, DEL, C1), regel- en alineascheiders, tekens die de schrijfrichting omdraaien (Trojan Source) en het BOM-teken.
const VERBODEN = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;
const VERBODEN_ALLE = new RegExp(VERBODEN.source, 'g');
// Een halve surrogaat is geen geldig teken (JSON.parse laat "\ud800" toe). Zonder lookbehind in een regex: oudere Safari kent dat niet.
function zonderHalveSurrogaten(s) {
  let uit = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const volgende = s.charCodeAt(i + 1);
      if (volgende >= 0xdc00 && volgende <= 0xdfff) {
        uit += s[i] + s[i + 1];
        i += 1;
      }
    } else if (!(c >= 0xdc00 && c <= 0xdfff)) {
      uit += s[i];
    }
  }
  return uit;
}
const heeftHalveSurrogaat = (s) => zonderHalveSurrogaten(s).length !== s.length;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const eigenSleutels = (o) => Reflect.ownKeys(o);
const alleenToegelaten = (o, toegelaten) => eigenSleutels(o).every((k) => typeof k === 'string' && toegelaten.includes(k));

// Onzichtbare tekens (L1 van de beveiligingsscan). Een naam die er leeg uitziet, of die er hetzelfde uitziet als een andere naam, mag niet.
// Bron: \p{Default_Ignorable_Code_Point} van Unicode (nulbreedte-tekens U+200B tot U+200F, woordverbinder U+2060 tot U+206F, zacht afbreekteken
// U+00AD, U+034F, U+061C, U+180E, variantkiezers U+FE00 tot U+FE0F, U+FEFF, tag-tekens U+E0000 tot U+E0FFF, de Hangul-vulletters U+115F,
// U+1160, U+3164, U+FFA0) en daarbovenop de lege braillecel U+2800 (die staat er niet in, maar toont als een leeg vakje). De Hangul-vulletters
// en U+180E, U+034F staan er ook apart in, voor het geval een JavaScript-motor de klasse met een oudere Unicode-versie kent.
// Wat de gebruiker echt tikt, blijft: accenten (samengestelde tekens zijn geen onzichtbare tekens), het koppelteken, cijfers, de gewone spatie
// en emoji, ook samengestelde: de woordverbinder U+200D tussen twee emoji (familie, beroep) en de variantkiezer U+FE0F achter een emoji of
// cijfer (rood hartje, toetsen) horen erbij en worden dan wel aanvaard. De app bewaart zulke namen, dus het bestand moet ze terug kunnen lezen.
const ONZICHTBAAR = '\\p{Default_Ignorable_Code_Point}\\u2800\\u115F\\u1160\\u3164\\uFFA0\\u180E\\u034F';
const EMOJI_DEEL = new RegExp(
  `(\\p{Extended_Pictographic}[\\uFE0E\\uFE0F\\u{1F3FB}-\\u{1F3FF}]*\\u200D(?=\\p{Extended_Pictographic}))|([\\p{Extended_Pictographic}0-9#*][\\uFE0E\\uFE0F])|[${ONZICHTBAAR}]`,
  'gu',
);
// De tekst zonder onzichtbare tekens (de toegelaten emoji-verbinders blijven staan).
const zonderOnzichtbaar = (s) => s.replace(EMOJI_DEEL, (m, a, b) => (a || b ? m : ''));
const heeftOnzichtbaar = (s) => zonderOnzichtbaar(s) !== s;
// Minstens een teken dat je ziet: geen spatie, geen onzichtbaar teken, geen los combinatieteken, geen besturingsteken.
const ZICHTBAAR = new RegExp(`[^\\s\\p{M}\\p{Cf}\\p{Cc}${ONZICHTBAAR}]`, 'u');
const heeftZichtbaarTeken = (s) => ZICHTBAAR.test(s);

// Tekst zoals ze in het bestand mag: zonder verboden en onzichtbare tekens, binnen de grens, zonder spaties voor en na.
function schoneTekst(x, max) {
  const zonder = zonderHalveSurrogaten(zonderOnzichtbaar(String(x ?? '').replace(VERBODEN_ALLE, ' ')));
  return begrens(zonder.trim(), max).trim();
}

// Een datum die buiten de grenzen valt of niet bestaat (30 februari), vastgezet op de dichtstbijzijnde toegelaten dag. null als er niets van te maken is.
function binnenGrenzen(x) {
  if (!isDatum(x)) return null;
  const jaar = Number(x.slice(0, 4));
  const maand = Number(x.slice(5, 7));
  let dag = Number(x.slice(8, 10));
  if (maand < 1 || maand > 12 || dag < 1) return null;
  if (jaar < MIN_JAAR) return `${MIN_JAAR}-01-01`;
  if (jaar > MAX_JAAR) return `${MAX_JAAR}-12-31`;
  const twee = (n) => String(n).padStart(2, '0');
  while (dag > 28 && !isEchteDatum(`${jaar}-${twee(maand)}-${twee(dag)}`)) dag -= 1;
  return `${jaar}-${twee(maand)}-${twee(dag)}`;
}

// ---------------------------------------------------------------- bewaren

// Van de lijst uit de database (leesSupplementen: de actieve supplementen) naar de tekst van het bestand.
// Stabiele volgorde (volgorde, dan id), alleen de toegelaten velden, teksten opgeschoond en begrensd zoals leesBestand ze eist, zodat
// een bestand van de app zelf altijd weer gelezen kan worden. Inactieve supplementen (weggehaald, met vroegere vinkjes) gaan niet mee.
export function maakBestand(supplementen) {
  const lijst = (Array.isArray(supplementen) ? supplementen : [])
    .filter((s) => s && s.actief !== false)
    .sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  const uit = [];
  for (const s of lijst) {
    // Dezelfde vertaling als het formulier: een oud supplement zonder hoeveelheid krijgt zijn dosis, een periodiek supplement geen momenten.
    const a = naarAanroep(formulierVan(s, s.ritme?.start ?? ''));
    const naam = schoneTekst(a.naam, MAX_LENGTE.supplementNaam);
    if (!naam || !heeftZichtbaarTeken(naam)) continue;
    // De grenzen van het bestand (ook die van het formulier): een supplement van vóór die grenzen wordt vastgezet op de rand, zodat de lijst
    // altijd terug kan. Een interval van meer dan MAX_INTERVAL_DAGEN is in de praktijk "nooit"; een datum buiten de jaren ligt op de rand.
    const start = a.ritme.soort === 'dagelijks' ? '' : binnenGrenzen(a.ritme.start);
    if (a.ritme.soort !== 'dagelijks' && !start) continue;
    let vanaf = a.vanaf ? binnenGrenzen(a.vanaf) : '';
    const tot = a.tot ? binnenGrenzen(a.tot) : '';
    if (vanaf && tot && tot < vanaf) vanaf = tot;
    const item = {
      naam,
      hoeveelheid: schoneTekst(a.hoeveelheid, MAX_LENGTE.supplementVeld),
      aanwijzing: schoneTekst(a.aanwijzing, MAX_LENGTE.supplementVeld),
      ritme: a.ritme.soort === 'interval' ? { soort: 'interval', dagen: Math.min(a.ritme.dagen, MAX_INTERVAL_DAGEN), start } : a.ritme.soort === 'maand' ? { soort: 'maand', start } : { soort: 'dagelijks' },
      momenten: [...a.momenten],
    };
    if (vanaf) item.vanaf = vanaf;
    if (tot) item.tot = tot;
    uit.push(item);
  }
  return JSON.stringify({ soort: SOORT, versie: VERSIE, supplementen: uit }, null, 2) + '\n';
}

// ---------------------------------------------------------------- overnemen

const weiger = (reden, extra = {}) => ({ ok: false, reden, ...extra });

// Eén tekstveld uit het bestand: een string, zonder verboden tekens, binnen de grens. Geeft de tekst zonder spaties voor en na, of null.
function leesTekst(x, max) {
  if (typeof x !== 'string') return null;
  if (VERBODEN.test(x) || heeftOnzichtbaar(x) || heeftHalveSurrogaat(x)) return null;
  const schoon = x.trim();
  if (schoon.length > max) return null;
  return schoon;
}

// Eén supplement uit het bestand naar de vorm van leesSupplementen-invoer ({ naam, hoeveelheid, aanwijzing, ritme, momenten, vanaf?, tot? }),
// of null als er iets niet klopt.
function leesSupplement(ruw) {
  if (!isObject(ruw) || !alleenToegelaten(ruw, VELDEN)) return null;
  if (!VERPLICHT.every((k) => Object.hasOwn(ruw, k))) return null;
  const naam = leesTekst(ruw.naam, MAX_LENGTE.supplementNaam);
  const hoeveelheid = leesTekst(ruw.hoeveelheid, MAX_LENGTE.supplementVeld);
  const aanwijzing = leesTekst(ruw.aanwijzing, MAX_LENGTE.supplementVeld);
  if (!naam || !heeftZichtbaarTeken(naam) || hoeveelheid === null || aanwijzing === null) return null;

  const r = ruw.ritme;
  if (!isObject(r) || typeof r.soort !== 'string' || !Object.hasOwn(RITME_VELDEN, r.soort)) return null;
  const ritmeVelden = RITME_VELDEN[r.soort];
  if (!alleenToegelaten(r, ritmeVelden) || !ritmeVelden.every((k) => Object.hasOwn(r, k))) return null;
  if (r.soort === 'interval' && !(Number.isInteger(r.dagen) && r.dagen >= 2 && r.dagen <= MAX_INTERVAL_DAGEN)) return null;
  if (r.soort !== 'dagelijks' && !isEchteDatum(r.start)) return null;

  if (!Array.isArray(ruw.momenten) || ruw.momenten.length > MOMENTEN.length || ruw.momenten.some((m) => typeof m !== 'string' || !MOMENTEN.includes(m))) return null;
  if (r.soort !== 'dagelijks' && ruw.momenten.length > 0) return null; // een periodiek supplement heeft geen momenten

  for (const k of ['vanaf', 'tot']) if (Object.hasOwn(ruw, k) && !isEchteDatum(ruw[k])) return null;

  // Dezelfde regels als het formulier (supplementformulier.js): verplichte naam, minstens één moment bij dagelijks, een geldig ritme, tot niet vóór vanaf.
  const f = {
    naam,
    hoeveelheid,
    aanwijzing,
    soort: r.soort,
    dagen: r.soort === 'interval' ? r.dagen : 14,
    start: r.soort === 'dagelijks' ? '' : r.start,
    momenten: [...ruw.momenten],
    vanaf: ruw.vanaf ?? '',
    tot: ruw.tot ?? '',
  };
  if (controleer(f)) return null;
  const a = naarAanroep(f);
  const uit = { naam: a.naam, hoeveelheid: a.hoeveelheid, aanwijzing: a.aanwijzing, ritme: a.ritme, momenten: a.momenten };
  if (a.vanaf) uit.vanaf = a.vanaf;
  if (a.tot) uit.tot = a.tot;
  return uit;
}

// Leest de tekst van een bestand. Geeft { ok: true, supplementen } of { ok: false, reden } met een reden uit REDENEN;
// bij 'ongeldig' ook nummer (het hoeveelste supplement, vanaf 1) als het aan één supplement ligt.
export function leesBestand(tekst) {
  if (typeof tekst !== 'string') return weiger('onleesbaar');
  // Eerst de lengte in tekens (goedkoop, één teken is minstens één byte), dan pas de echte grootte in bytes.
  if (tekst.length > MAX_BESTAND_BYTES || new TextEncoder().encode(tekst).length > MAX_BESTAND_BYTES) return weiger('te-groot');
  const zonderBom = tekst.replace(/^\uFEFF/, '');
  if (!zonderBom.trim()) return weiger('leeg');

  let data;
  try {
    data = JSON.parse(zonderBom);
  } catch {
    return weiger('onleesbaar');
  }
  if (!isObject(data) || data.soort !== SOORT) return weiger('ander-bestand');
  if (!Number.isInteger(data.versie) || data.versie < 1) return weiger('ongeldig');
  if (data.versie > VERSIE) return weiger('nieuwere-versie');
  if (!alleenToegelaten(data, KOP_VELDEN) || !Array.isArray(data.supplementen)) return weiger('ongeldig');
  if (data.supplementen.length === 0) return weiger('lege-lijst');
  if (data.supplementen.length > MAX_SUPPLEMENTEN) return weiger('te-veel');

  const supplementen = [];
  for (let i = 0; i < data.supplementen.length; i += 1) {
    const s = leesSupplement(data.supplementen[i]);
    if (!s) return weiger('ongeldig', { nummer: i + 1 });
    supplementen.push(s);
  }
  return { ok: true, supplementen };
}

// ---------------------------------------------------------------- vergelijken

// Wanneer is een supplement uit het bestand "hetzelfde" als een dat er al staat? Dezelfde naam, zonder hoofdletters en zonder spaties voor,
// na en dubbel ertussen. De hoeveelheid telt niet mee: "Kurkuma, 2 capsules" in het bestand naast "Kurkuma, 1 capsule" in de app is
// hetzelfde supplement met een andere hoeveelheid, niet een tweede magnesium (zie het rapport van deel 1).
export function sleutelVan(supplement) {
  // NFKC: volle breedte en samengestelde tekens tellen als hetzelfde; de onzichtbare tekens (ook die in een naam die de app zelf bewaarde) tellen niet mee.
  return String(supplement?.naam ?? '').normalize('NFKC').replace(new RegExp(`[${ONZICHTBAAR}]`, 'gu'), '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('nl');
}

// bestaand: de actieve supplementen van de app (leesSupplementen); nieuw: de supplementen uit leesBestand.
// Geeft wat elke keuze zou doen, zodat het scherm het vooraf kan zeggen:
//   toevoegen: { erbij: [nieuw], alAanwezig: [nieuw] }   wat er al staat, blijft ongemoeid en komt er niet dubbel bij
//   vervangen: { weg: [bestaand], blijft: [{ bestaand, nieuw }], erbij: [nieuw] }
//     blijft: hetzelfde supplement staat in beide; het houdt zijn plaats in het dagboek en krijgt de gegevens uit het bestand.
//     Twee keer dezelfde naam wordt per naam in volgorde gekoppeld; wat overschiet, valt onder weg of erbij.
// Het eindtotaal na vervangen is altijd nieuw.length; na toevoegen bestaand.length + erbij.length.
export function vergelijk(bestaand, nieuw) {
  const oud = Array.isArray(bestaand) ? bestaand : [];
  const komt = Array.isArray(nieuw) ? nieuw : [];
  const bekend = new Set(oud.map(sleutelVan));
  const toevoegen = { erbij: [], alAanwezig: [] };
  for (const n of komt) (bekend.has(sleutelVan(n)) ? toevoegen.alAanwezig : toevoegen.erbij).push(n);

  const vrij = new Map();
  for (const b of oud) {
    const k = sleutelVan(b);
    if (!vrij.has(k)) vrij.set(k, []);
    vrij.get(k).push(b);
  }
  const vervangen = { weg: [], blijft: [], erbij: [] };
  for (const n of komt) {
    const kandidaten = vrij.get(sleutelVan(n));
    if (kandidaten?.length) vervangen.blijft.push({ bestaand: kandidaten.shift(), nieuw: n });
    else vervangen.erbij.push(n);
  }
  const gekoppeld = new Set(vervangen.blijft.map((p) => p.bestaand));
  vervangen.weg = oud.filter((b) => !gekoppeld.has(b));
  return { toevoegen, vervangen };
}
