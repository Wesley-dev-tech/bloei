// Afdrukken van het verslag (BESLISSING 574): wat naar de printer gaat is dezelfde tekening als de bewaarde pdf.
// De pdf-schrijver (verslag-pdf.js) legt bij elke pagina ook een vectorlijst vast (bestand.afdruk); hier wordt elke pagina daaruit als svg
// getekend, op precies het paginaformaat van de pdf (A4 staand, of de lagere hoogte van een kort verslag), zonder marge van de printer
// (de marges van de pdf zitten in de tekening), met dezelfde pagina's, afbrekingen en tekst. Er is geen tweede indeling die kan afwijken.
// Waarom niet de pdf zelf openen in een verborgen frame: de CSP van de app heeft frame-src en object-src op 'none', en iOS Safari drukt een pdf
// in een frame niet betrouwbaar af.
import { iconenBron } from './iconen.js';
import { svg } from './dom.js';
import markLicht from '../../bloei-huisstijl/logo/bloei-mark.svg?raw';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LETTER = {
  serif: ['Cormorant Garamond', 500, 'normal'],
  serifSchuin: ['Cormorant Garamond', 500, 'italic'],
  sans: ['Jost', 400, 'normal'],
  sansMedium: ['Jost', 500, 'normal'],
};
const getal = (n) => String(Math.round(n * 1000) / 1000);
const kleurTekst = (c) => `color(srgb ${c.map((v) => getal(v)).join(' ')})`; // de kleuren komen als 0 tot 1 uit de tokens; geen hexkleur in de code

function el(naam, attrs = {}) {
  const e = document.createElementNS(SVG_NS, naam);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? getal(v) : v);
  return e;
}

// De blaadjes van het beeldmerk: dezelfde paden als in de pdf, met vermenigvuldigen (zoals het beeldmerk zelf).
function merk(o) {
  const s = el('svg', { x: o.x, y: o.y, width: o.grootte, height: o.grootte, viewBox: '0 0 100 100' });
  const g = el('g');
  g.style.mixBlendMode = 'multiply';
  for (const m of markLicht.matchAll(/<path\b([^>]*?)\/?>/g)) {
    const attr = (naam) => new RegExp(`\\b${naam}="([^"]*)"`).exec(m[1])?.[1] ?? null;
    const p = el('path', { d: attr('d') ?? '', fill: attr('fill') ?? 'black' });
    if (attr('transform')) p.setAttribute('transform', attr('transform'));
    if (attr('opacity')) p.setAttribute('opacity', attr('opacity'));
    g.append(p);
  }
  s.append(g);
  return s;
}

function icoon(o) {
  const bron = iconenBron(o.naam, o.stijl);
  const s = bron ? svg(bron) : null;
  if (!s) return null;
  for (const [k, v] of Object.entries({ x: getal(o.x), y: getal(o.y), width: getal(o.grootte), height: getal(o.grootte), fill: kleurTekst(o.vul) })) s.setAttribute(k, v);
  return s;
}

function onderdeel(o) {
  if (o.t === 'r') {
    const e = el('rect', { x: o.x, y: o.y, width: o.w, height: o.h });
    if (o.r) {
      e.setAttribute('rx', getal(o.r));
      e.setAttribute('ry', getal(o.r));
    }
    if (o.vul) e.setAttribute('fill', kleurTekst(o.vul));
    else {
      e.setAttribute('fill', 'none');
      e.setAttribute('stroke', kleurTekst(o.lijn));
      e.setAttribute('stroke-width', getal(o.dikte));
    }
    return e;
  }
  if (o.t === 'l') return el('line', { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, stroke: kleurTekst(o.lijn), 'stroke-width': o.dikte });
  if (o.t === 'i') return icoon(o);
  if (o.t === 'm') return merk(o);
  const [familie, gewicht, stand] = LETTER[o.font];
  const e = el('text', { x: o.x, y: o.y, fill: kleurTekst(o.vul), 'font-family': `"${familie}", "Times New Roman", serif`, 'font-size': o.grootte, 'font-weight': gewicht, 'font-style': stand });
  if (o.font.startsWith('sans')) e.setAttribute('font-family', `"${familie}", system-ui, sans-serif`);
  if (o.spatiering) e.setAttribute('letter-spacing', getal(o.spatiering));
  e.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  e.textContent = o.tekst;
  return e;
}

// De pagina's als svg: één per pagina, in punten, zodat 1 eenheid van de tekening 1 punt op papier is.
export function bouwAfdruk(afdruk) {
  const huis = document.createElement('div');
  huis.className = 'afdruk';
  huis.setAttribute('aria-hidden', 'true');
  for (const lijst of afdruk.paginas) {
    const blad = el('svg', { class: 'afdruk__blad', width: `${getal(afdruk.b)}pt`, height: `${getal(afdruk.h)}pt`, viewBox: `0 0 ${getal(afdruk.b)} ${getal(afdruk.h)}` });
    for (const o of lijst) {
      const e = onderdeel(o);
      if (e) blad.append(e);
    }
    huis.append(blad);
  }
  return huis;
}

// Het paginaformaat van de afdruk is dat van de pdf: een @page-regel met die maat, via de stijlobjecten (geen inline stijl: de CSP laat die niet toe).
function zetPagina(afdruk) {
  const regel = `@page { size: ${getal(afdruk.b)}pt ${getal(afdruk.h)}pt; margin: 0; }`;
  try {
    const blad = new CSSStyleSheet();
    blad.replaceSync(regel);
    const rest = document.adoptedStyleSheets.filter((b) => !b.afdrukBlad);
    blad.afdrukBlad = true;
    document.adoptedStyleSheets = [...rest, blad];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((b) => b !== blad);
    };
  } catch {
    return () => {};
  }
}

let opruimer = null;

// Drukt de pagina's af: vel erin, lettertypen klaar, venster open, daarna weer opruimen (ook als afterprint niet komt).
export async function drukAf(afdruk) {
  opruimer?.();
  await Promise.all(['500 10px "Cormorant Garamond"', 'italic 500 10px "Cormorant Garamond"', '400 10px "Jost"', '500 10px "Jost"'].map((f) => document.fonts?.load(f).catch(() => {})));
  const huis = bouwAfdruk(afdruk);
  const weg = zetPagina(afdruk);
  document.body.append(huis);
  let klaar = false;
  const opruim = () => {
    if (klaar) return;
    klaar = true;
    window.removeEventListener('afterprint', opruim);
    huis.remove();
    weg();
    if (opruimer === opruim) opruimer = null;
  };
  opruimer = opruim;
  window.addEventListener('afterprint', opruim);
  window.print();
}

// Bij het verlaten van het scherm: een eventueel achtergebleven afdrukvel verwijderen.
export const ruimAfdrukOp = () => opruimer?.();
