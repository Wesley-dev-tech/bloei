// Bovengrenzen voor vrije tekst (OW-05, OWASP ASVS V5): één bron voor de gegevenslaag. Ruim gekozen, zodat geen echte invoer ze
// raakt; ze houden alleen een per ongeluk (of met opzet) geplakte lap tekst van megabytes tegen, die de app bij het herladen liet
// vastlopen. Bij het schrijven wordt te lange tekst afgekapt (nooit een fout: er gaat geen invoer verloren behalve het teveel).
// Bij het lezen wordt niets afgekapt: wat al bewaard is, blijft zoals het is.
// De invoervelden (maxlength in src/schermen en src/ui) horen dezelfde getallen te gebruiken.
export const MAX_LENGTE = Object.freeze({
  naam: 60, // 'profiel.naam' (het welkomveld heeft maxLength 40)
  maaltijd: 4000, // de tekst bij een maaltijd
  favoriet: 4000, // een favoriet is een maaltijdtekst: minstens even lang als 'maaltijd'
  notitie: 20000, // de dagboeknotitie (± 3000 woorden)
  supplementNaam: 100,
  supplementDosis: 300, // de oorspronkelijke vrije notitie bij een supplement
  supplementVeld: 120, // hoeveelheid en aanwijzing (die grens bestond al)
});

let segmenteerder;
function grafemen() {
  if (segmenteerder === undefined) {
    try {
      segmenteerder = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    } catch {
      segmenteerder = null;
    }
  }
  return segmenteerder;
}

// Kapt tekst af op hoogstens `max` UTF-16-eenheden (zoals maxlength telt), zonder een teken te splitsen: geen half
// surrogaatpaar en, waar de browser het kent (Intl.Segmenter), ook geen half samengesteld teken (emoji met huidskleur, letter met
// los accent). Niet-tekst wordt tekst (zoals de schrijfpaden al deden).
export function begrens(tekst, max) {
  const s = String(tekst ?? '');
  if (s.length <= max) return s;
  let einde = max;
  const seg = grafemen();
  if (seg) {
    // Alleen een venster rond de snede segmenteren: ook een tekst van megabytes kost zo niets.
    const begin = Math.max(0, max - 64);
    einde = begin;
    for (const { index } of seg.segment(s.slice(begin, max + 64))) {
      if (begin + index > max) break;
      einde = begin + index;
    }
  } else {
    const code = s.charCodeAt(max - 1);
    if (code >= 0xd800 && code <= 0xdbff) einde = max - 1;
  }
  return s.slice(0, einde);
}
