// Thema's van Bloei: Poeder (licht), Salie (pastel) en Nacht (donker), plus "auto" (volgt het toestel).
// De keuze staat in de instelling 'thema.keuze' en wordt gespiegeld naar localStorage ('bloei-thema'),
// zodat het kleine script in index.html het thema vóór de eerste verf kan zetten (geen flits).
// De kleuren zelf staan in bloei-huisstijl/tokens.css, onder [data-theme="salie"] en [data-theme="nacht"].
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { OPSLAG_VOORVOEGSEL } from '../kern/demo.js';

export const THEMAS = ['poeder', 'salie', 'nacht'];
export const KEUZES = [...THEMAS, 'auto'];
const STANDAARD_KEUZE = 'poeder';
// 'bloei-thema'; in de demo 'bloei-demo-thema' (kern/demo.js). Het script in index.html leest alleen 'bloei-thema' en blijft in beide
// versies gelijk (de CSP-hash in vercel.json geldt voor beide); in de demo zet thema.js het thema dus pas bij het opstarten.
export const OPSLAGSLEUTEL = OPSLAG_VOORVOEGSEL + 'thema';

// ---- Pure delen (getest in tests/pwa/thema.test.js) ----

// Een onbekende of ontbrekende keuze wordt Poeder.
export function normaliseerKeuze(keuze) {
  return KEUZES.includes(keuze) ? keuze : STANDAARD_KEUZE;
}

// Welk thema hoort bij een keuze? 'auto' = Poeder bij een licht toestel, Nacht bij een donker toestel.
export function themaVoorKeuze(keuze, toestelDonker = false) {
  const k = normaliseerKeuze(keuze);
  if (k === 'auto') return toestelDonker ? 'nacht' : 'poeder';
  return k;
}

// De waarde van data-theme: voor Poeder geen attribuut (de standaardtokens gelden).
export function dataThemaVoor(thema) {
  return thema === 'salie' || thema === 'nacht' ? thema : null;
}

// ---- Toepassen in de pagina ----

function toestelIsDonker() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function leesLokaleKeuze() {
  try {
    return localStorage.getItem(OPSLAGSLEUTEL);
  } catch {
    return null;
  }
}

function bewaarLokaleKeuze(keuze) {
  try {
    localStorage.setItem(OPSLAGSLEUTEL, keuze);
  } catch {
    /* localStorage niet beschikbaar: de instelling in de database blijft de bron */
  }
}

let huidigeKeuze = STANDAARD_KEUZE;
let luistert = false;

function zetOpPagina() {
  const thema = themaVoorKeuze(huidigeKeuze, toestelIsDonker());
  const wortel = document.documentElement;
  const waarde = dataThemaVoor(thema);
  if (waarde) wortel.setAttribute('data-theme', waarde);
  else wortel.removeAttribute('data-theme');
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  // <meta name="theme-color"> kent geen CSS-variabelen: lees de echte achtergrondkleur uit tokens.css
  // (Porselein in Poeder, de nachtachtergrond in Nacht), zodat er geen hexwaarden in de code staan.
  const kleur = getComputedStyle(wortel).getPropertyValue('--c-bg').trim();
  if (kleur) meta.content = kleur.toUpperCase(); // de bouw schrijft hex in kleine letters
}

function volgToestel() {
  if (luistert || typeof window.matchMedia !== 'function') return;
  luistert = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (huidigeKeuze === 'auto') zetOpPagina();
  });
}

export async function leesThemaKeuze() {
  return normaliseerKeuze(await leesInstelling('thema.keuze'));
}

// Leest de keuze en zet data-theme op <html>. Gebruik bij het opstarten.
export async function pasThemaToe() {
  huidigeKeuze = await leesThemaKeuze();
  bewaarLokaleKeuze(huidigeKeuze);
  volgToestel();
  zetOpPagina();
}

// Bewaart de keuze ('poeder' | 'salie' | 'nacht' | 'auto') en past ze meteen toe.
export async function zetThema(keuze) {
  huidigeKeuze = normaliseerKeuze(keuze);
  bewaarLokaleKeuze(huidigeKeuze);
  volgToestel();
  zetOpPagina();
  await zetInstelling('thema.keuze', huidigeKeuze);
}
