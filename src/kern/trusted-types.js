// Trusted Types (BESLISSING 430, OWASP OW-06). De CSP (scripts/csp.mjs) eist `require-trusted-types-for 'script'` en laat alleen
// de twee policies hieronder toe. Een browser die Trusted Types afdwingt, weigert dan elke tekst in een html- of script-sink
// (innerHTML, script.src, serviceWorker.register ...) die niet door een van deze policies kwam: een latere vergissing elders in
// de code wordt zo door de browser zelf tegengehouden.
// - 'bloei-svg' (createHTML): alleen de eigen, vaste svg-markup van svg() in ui/dom.js; al het andere wordt geweigerd.
// - 'bloei-sw' (createScriptURL): alleen './sw.js' voor de registratie van de service worker (pwa/registratie.js).
// Terugval: bestaat window.trustedTypes niet (Safari vóór 26, Firefox vóór 148) of lukt het aanmaken niet, dan werkt alles
// precies zoals zonder Trusted Types: de gecontroleerde tekst gaat als gewone tekst verder. De controle zelf geldt altijd.

export const POLICY_SVG = 'bloei-svg';
export const POLICY_SW = 'bloei-sw';
export const SW_URL = './sw.js';

// Wat een svg-markup nooit mag bevatten: een script, een handler-attribuut, een javascript:-adres, foreignObject (html in svg)
// of een verwijzing (href/xlink:href, ook in url(...)) naar iets anders dan een id in dezelfde svg (#...).
const VERBODEN = [
  /<\s*\/?\s*script\b/i,
  /<\s*\/?\s*foreignObject\b/i,
  /<\s*\/?\s*(?:iframe|object|embed|image|img|a|style|animate|set|animateTransform|animateMotion|handler|feImage)\b/i,
  /[\s"'/]on[a-z]+\s*=/i,
  /javascript\s*:/i,
  /\b(?:xlink:)?href\s*=\s*(?!["']#)/i,
  /url\(\s*(?!["']?#)/i,
  /<!ENTITY/i,
  /<\?/,
];

// true als dit de eigen, vaste svg-markup is: begint met <svg, eindigt op </svg> en bevat niets uit VERBODEN.
// Commentaar (licentie van Font Awesome) telt niet mee en mag erin staan.
export function isEigenSvg(markup) {
  if (typeof markup !== 'string') return false;
  const kaal = markup.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!/^<svg[\s>]/.test(kaal) || !/<\/svg>$/.test(kaal)) return false;
  return !VERBODEN.some((patroon) => patroon.test(kaal));
}

function maakHtml(markup) {
  if (!isEigenSvg(markup)) throw new TypeError('Bloei: geen eigen svg-markup');
  return markup;
}

function maakScriptUrl(url) {
  if (url !== SW_URL) throw new TypeError('Bloei: alleen ' + SW_URL + ' is toegelaten');
  return url;
}

// De policies, één keer per pagina aangemaakt (createPolicy met dezelfde naam een tweede keer faalt onder de CSP).
let policies;
function haal(omgeving) {
  if (policies && omgeving === undefined) return policies;
  const tt = (omgeving ?? globalThis).trustedTypes;
  const terugval = { svg: { createHTML: maakHtml }, sw: { createScriptURL: maakScriptUrl } };
  let gemaakt = terugval;
  if (tt && typeof tt.createPolicy === 'function') {
    try {
      gemaakt = {
        svg: tt.createPolicy(POLICY_SVG, { createHTML: maakHtml }),
        sw: tt.createPolicy(POLICY_SW, { createScriptURL: maakScriptUrl }),
      };
    } catch (fout) {
      // Aanmaken geweigerd of mislukt: zonder afdwinging werkt de terugval zoals vroeger; mét afdwinging weigert de browser de
      // sink, en svg() vangt dat op (een leeg icoon in plaats van een kapotte pagina).
      console.warn('Trusted Types: policies niet aangemaakt', fout);
      gemaakt = terugval;
    }
  }
  if (omgeving === undefined) policies = gemaakt;
  return gemaakt;
}

// Gecontroleerde svg-markup voor innerHTML: een TrustedHTML waar de browser het kent, anders dezelfde tekst. Gooit een
// TypeError als de markup niet de eigen vaste svg is.
export const veiligeSvgHtml = (markup) => haal().svg.createHTML(markup);

// Het adres van de service worker voor navigator.serviceWorker.register: een TrustedScriptURL waar de browser het kent.
export const swScriptUrl = () => haal().sw.createScriptURL(SW_URL);

// Alleen voor de tests: de policies opnieuw bepalen tegen een nagebootste omgeving (zonder het geheugen van de pagina te raken).
export const _policiesVoor = (omgeving) => haal(omgeving);
