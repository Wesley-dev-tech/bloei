// Iconen: Font Awesome Free 6, lokaal in src/iconen/ en inline getoond (HUISSTIJL §5).
// Alleen de iconen uit de lijst van HUISSTIJL.md §5. Eigen tekeningen bestaan niet meer.
import { svg } from './dom.js';

// Alle SVG's als tekst, bij het bouwen ingebakken.
const BRONNEN = import.meta.glob('../iconen/*/*.svg', { query: '?raw', import: 'default', eager: true });

const ICONEN = new Map();
for (const [pad, tekst] of Object.entries(BRONNEN)) {
  const [, stijl, bestand] = pad.match(/iconen\/([^/]+)\/([^/]+)\.svg$/);
  const viewBox = tekst.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 512 512';
  // Het licentiecommentaar blijft in het bestand op schijf staan; inline is het overbodig.
  const binnen = tekst.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');
  ICONEN.set(`${stijl}/${bestand}`, { viewBox, binnen });
}

// Alle beschikbare namen, als 'solid/sun' of 'regular/heart'.
export const ICOONNAMEN = [...ICONEN.keys()].sort();

// icoon('sun')            → solid
// icoon('regular/heart')  → regular via de naam
// icoon('heart', { stijl: 'regular' })
// Zonder label is het icoon decoratief (aria-hidden); mét label krijgt het role="img".
// Kleur is altijd currentColor. Een onbekende naam geeft een waarschuwing en een leeg element.
export function icoon(naam, opties = {}) {
  const { grootte = 24, stijl = 'solid', label, klasse } = opties;
  const sleutel = naam.includes('/') ? naam : `${stijl}/${naam}`;
  const bron = ICONEN.get(sleutel);
  if (!bron) {
    console.warn('Onbekend icoon:', sleutel);
    const leeg = document.createElement('span');
    leeg.className = 'icoon icoon--leeg';
    leeg.setAttribute('aria-hidden', 'true');
    return leeg;
  }
  const el = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bron.viewBox}" width="${grootte}" height="${grootte}" fill="currentColor" focusable="false">${bron.binnen}</svg>`,
  );
  el.setAttribute('class', ['icoon', klasse].filter(Boolean).join(' '));
  if (label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
  } else {
    el.setAttribute('aria-hidden', 'true');
  }
  return el;
}

// De SVG-tekst van een icoon (voor de pdf van Delen, die de paden als vector tekent). null als het icoon niet bestaat.
export function iconenBron(naam, stijl = 'solid') {
  const bron = ICONEN.get(naam.includes('/') ? naam : `${stijl}/${naam}`);
  return bron ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bron.viewBox}">${bron.binnen}</svg>` : null;
}
