// De pure kant van de supplementkaart (BESLISSINGEN 213 en 214): van formulier naar aanroep, controleren en de foutmeldingen.
// Geen database en geen DOM. Het formulier is één plat object:
//   { naam, hoeveelheid, aanwijzing, soort: 'dagelijks' | 'interval' | 'maand', dagen, start, momenten: [...], vanaf, tot }
import { MOMENTEN } from './supplementen.js';
import { isDatum, naarDatum, naarSleutel } from '../kern/datum.js';

// De grenzen van een ritme en een datum: EEN bron, voor het formulier en voor het supplementenbestand (BESLISSING 696). Wat het formulier
// aanvaardt, kan zo altijd in het bestand en weer terug. Een interval van meer dan tien jaar is geen ritme meer.
export const MAX_INTERVAL_DAGEN = 3650;
export const MIN_JAAR = 1970;
export const MAX_JAAR = 2099;

// Een echte kalenderdag in de vorm JJJJ-MM-DD, binnen MIN_JAAR en MAX_JAAR (isDatum controleert alleen de vorm).
export function isEchteDatum(x) {
  if (!isDatum(x)) return false;
  const jaar = Number(x.slice(0, 4));
  if (jaar < MIN_JAAR || jaar > MAX_JAAR) return false;
  return naarSleutel(naarDatum(x)) === x;
}

export const leegFormulier = (vandaagSleutel) => ({
  naam: '',
  hoeveelheid: '',
  aanwijzing: '',
  soort: 'dagelijks',
  dagen: 14,
  start: vandaagSleutel,
  momenten: ['ochtend'],
  vanaf: '',
  tot: '',
});

// Het formulier van een bestaand supplement.
export function formulierVan(supplement, vandaagSleutel) {
  const ritme = supplement.ritme ?? { soort: 'dagelijks' };
  const soort = ritme.soort === 'interval' || ritme.soort === 'maand' ? ritme.soort : 'dagelijks';
  return {
    naam: supplement.naam ?? '',
    hoeveelheid: supplement.hoeveelheid ?? supplement.dosis ?? '',
    aanwijzing: supplement.aanwijzing ?? '',
    soort,
    dagen: Number.isInteger(ritme.dagen) ? ritme.dagen : 14,
    start: ritme.start ?? vandaagSleutel,
    momenten: MOMENTEN.filter((m) => (supplement.momenten ?? []).includes(m)).length ? MOMENTEN.filter((m) => (supplement.momenten ?? []).includes(m)) : ['ochtend'],
    vanaf: supplement.vanaf ?? '',
    tot: supplement.tot ?? '',
  };
}

// Heeft de naam minstens een teken dat je ziet? Niet: alleen spaties, nulbreedte-tekens (U+200B tot U+200F, U+2060 en verder), het zachte
// afbreekteken, variantkiezers, tag-tekens, de Hangul-vulletters (U+115F, U+1160, U+3164, U+FFA0), de lege braillecel U+2800, losse
// combinatietekens of besturingstekens. Dezelfde regel als heeftZichtbaarTeken in logica/supplementenbestand.js; die is daar niet geexporteerd
// en dat bestand importeert zelf uit dit bestand. LATER SAMENVOEGEN: een van de twee hoort de ander te gebruiken.
const ONZICHTBAAR = '\\p{Default_Ignorable_Code_Point}\\u2800\\u115F\\u1160\\u3164\\uFFA0\\u180E\\u034F';
const ZICHTBAAR = new RegExp(`[^\\s\\p{M}\\p{Cf}\\p{Cc}${ONZICHTBAAR}]`, 'u');
export const heeftZichtbaarTeken = (s) => ZICHTBAAR.test(String(s ?? ''));

// Controleert het formulier vóór het bewaren. Geeft null als alles klopt, anders { code, veld } met code 'leeg' | 'momenten' | 'ritme' | 'periode'
// (dezelfde woorden als de Error-berichten van de datalaag) en het veld waar de melding bij hoort.
// Een naam zonder een enkel zichtbaar teken telt als leeg (dezelfde melding).
export function controleer(f) {
  if (!heeftZichtbaarTeken(f.naam)) return { code: 'leeg', veld: 'naam' };
  if (f.soort === 'dagelijks') {
    if (!Array.isArray(f.momenten) || f.momenten.length === 0 || f.momenten.some((m) => !MOMENTEN.includes(m))) return { code: 'momenten', veld: 'momenten' };
  } else {
    if (f.soort === 'interval' && !(Number.isInteger(Number(f.dagen)) && Number(f.dagen) >= 2 && Number(f.dagen) <= MAX_INTERVAL_DAGEN)) return { code: 'ritme', veld: 'dagen' };
    if (!isEchteDatum(f.start)) return { code: 'ritme', veld: 'start' };
  }
  if (f.vanaf && !isEchteDatum(f.vanaf)) return { code: 'periode', veld: 'vanaf' };
  if (f.tot && !isEchteDatum(f.tot)) return { code: 'periode', veld: 'tot' };
  if (f.vanaf && f.tot && f.tot < f.vanaf) return { code: 'periode', veld: 'tot' };
  return null;
}

// Vertaalt een Error van de datalaag naar { code, veld } (voor een fout die de controle niet ving), of null bij een onbekende fout.
export function foutVan(fout) {
  const velden = { leeg: 'naam', momenten: 'momenten', ritme: 'start', periode: 'tot' };
  const code = fout?.message;
  return velden[code] ? { code, veld: velden[code] } : null;
}

// De opties voor voegSupplementToe (nieuw) of wijzigSupplement (bestaand). Een lege vanaf of tot wordt '' zodat wijzigSupplement de grens weghaalt;
// voegSupplementToe laat lege waarden vallen. oud: een bestaand supplement van vóór de velden hoeveelheid en aanwijzing houdt zijn dosis bijgewerkt.
export function naarAanroep(f, { oud = false } = {}) {
  const ritme = f.soort === 'dagelijks' ? { soort: 'dagelijks' } : f.soort === 'interval' ? { soort: 'interval', dagen: Number(f.dagen), start: f.start } : { soort: 'maand', start: f.start };
  const opties = {
    naam: String(f.naam).trim(),
    hoeveelheid: f.hoeveelheid,
    aanwijzing: f.aanwijzing,
    ritme,
    momenten: f.soort === 'dagelijks' ? MOMENTEN.filter((m) => f.momenten.includes(m)) : [],
    vanaf: f.vanaf || '',
    tot: f.tot || '',
  };
  if (oud) opties.dosis = [f.hoeveelheid, f.aanwijzing].filter(Boolean).join(' · ');
  return opties;
}

// Is er iets gewijzigd ten opzichte van het begin?
export function isGewijzigd(begin, nu) {
  const norm = (f) => JSON.stringify({ ...f, naam: String(f.naam).trim(), momenten: [...f.momenten].sort(), dagen: Number(f.dagen) });
  return norm(begin) !== norm(nu);
}
