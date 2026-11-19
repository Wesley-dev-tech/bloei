// Hulpfuncties om DOM op te bouwen (PLAN.md §6.4).
import { veiligeSvgHtml } from '../kern/trusted-types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'defs', 'clipPath', 'title', 'desc', 'use', 'mask']);

// Beveiliging: tekst wordt altijd als tekstknoop toegevoegd, nooit als html. Een attribuut is nooit een handler als tekst
// (on...="..."), en een adres (href, src, action, formaction, xlink:href) is nooit javascript:, vbscript: of data:text/html.
// Zo kan tekst van de gebruiker (een naam, een notitie, een supplementnaam) nooit code worden, ook niet bij een latere vergissing.
const ADRES_ATTRIBUTEN = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'poster']);
const GEVAARLIJK_ADRES = /^(?:javascript|vbscript):|^data:(?!image\/)/i;

// true als dit attribuut met deze waarde veilig gezet mag worden.
export function veiligAttribuut(naam, waarde) {
  const n = String(naam).toLowerCase();
  if (n.startsWith('on')) return false;
  if (ADRES_ATTRIBUTEN.has(n)) {
    // Browsers negeren witruimte en stuurtekens in een adres: die eerst weg, zoals de browser het leest.
    const schoon = String(waarde).replace(/[\u0000- \u007f-\u009f]/g, '');
    if (GEVAARLIJK_ADRES.test(schoon)) return false;
  }
  return true;
}

// h('button', { class: 'knop', dataset: { x: 1 }, onclick: fn, 'aria-label': 'tekst' }, 'tekst', kindEl)
// Waarden null/undefined/false worden overgeslagen; true zet een lege attribuutwaarde.
export function h(tag, attrs, ...kinderen) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [naam, waarde] of Object.entries(attrs || {})) {
    if (waarde == null || waarde === false) continue;
    if (naam === 'class') el.setAttribute('class', Array.isArray(waarde) ? waarde.filter(Boolean).join(' ') : waarde);
    else if (naam === 'dataset') Object.assign(el.dataset, waarde);
    else if (naam === 'style' && typeof waarde === 'object') {
      for (const [sleutel, w] of Object.entries(waarde)) {
        if (sleutel.startsWith('--')) el.style.setProperty(sleutel, w);
        else el.style[sleutel] = w;
      }
    }
    else if (naam.startsWith('on') && typeof waarde === 'function') el.addEventListener(naam.slice(2).toLowerCase(), waarde);
    else if (!veiligAttribuut(naam, waarde)) console.warn('Attribuut geweigerd:', naam);
    else el.setAttribute(naam, waarde === true ? '' : String(waarde));
  }
  voegToe(el, kinderen);
  return el;
}

function voegToe(el, kinderen) {
  for (const kind of kinderen.flat(Infinity)) {
    if (kind == null || kind === false) continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
}

export function leeg(el) {
  el.replaceChildren();
}

// Zet een stuk SVG-markup (met <svg ...> als wortel) om in een SVGElement. De markup gaat door de Trusted Types-policy
// 'bloei-svg' (kern/trusted-types.js, BESLISSING 430): alleen de eigen vaste svg komt erdoor. Wordt ze geweigerd (door de
// policy of door de browser), dan komt er een leeg <svg> in de plaats: nooit html, en de pagina blijft werken.
export function svg(markup) {
  const sjabloon = document.createElement('template');
  try {
    sjabloon.innerHTML = veiligeSvgHtml(String(markup).trim());
  } catch (fout) {
    console.warn('svg geweigerd:', fout?.message ?? fout);
    return document.createElementNS(SVG_NS, 'svg');
  }
  const el = sjabloon.content.firstElementChild;
  return el;
}
