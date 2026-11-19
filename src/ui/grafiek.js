// Gewichtsgrafiek (HUISSTIJL §7): dunne lijn oudroze 2 px, punten 6 px, streefgewicht als stippellijn in
// salie, geen rasterlijnen behalve één baseline. Stijging en daling zien er identiek uit; nooit rood, geen pijlen.
// Houvast zonder raster: de laagste en hoogste waarde en de maanden staan als kleine labels in de grafiek.
import { h } from './dom.js';
import { naarDatum, naarSleutel, vandaag } from '../kern/datum.js';
import { opmaakKg } from '../kern/getal.js';
import { magBewegen } from './beweging.js';

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAG_MS = 86400000;
const DAGEN = (a, b) => Math.round((naarDatum(b) - naarDatum(a)) / DAG_MS);
const rond = (n) => Math.round(n * 10) / 10;

// Binnenmarges in SVG-eenheden. Boven en onder het datagebied is ruimte voor de waardelabels.
const MARGE_X = 24;
const BOVEN = 36;
const LABEL_ONDER = 28; // ruimte onder de baseline voor de maandlabels
const LUCHT = 30; // ruimte tussen het laagste punt en de baseline

// Pure berekening, geen DOM.
// berekenGrafiek(wegingen, { van, tot, streefKg, breedte, hoogte }) →
//   { punten: [{ x, y, weging }], pad, yLijnen: [{ y, kg }], xLabels: [{ x, tekst }], streefY, basisY, links, rechts }
// - alleen wegingen met datum tussen van en tot (inclusief), op datum gesorteerd;
// - lege weken worden overbrugd (de lijn verbindt de punten ernaast); één weging = alleen het punt, pad '';
// - yLijnen zijn geen lijnen: de y van de hoogste en de laagste waarde voor de kleine labels (één als ze gelijk zijn).
export function berekenGrafiek(wegingen, { van, tot, streefKg = null, breedte, hoogte }) {
  const links = MARGE_X;
  const rechts = breedte - MARGE_X;
  const basisY = hoogte - LABEL_ONDER;
  const onder = basisY - LUCHT;
  const span = Math.max(1, DAGEN(van, tot));
  const xVan = (datum) => links + (DAGEN(van, datum) / span) * (rechts - links);

  const gebruikt = (wegingen || [])
    .filter((w) => w && w.datum >= van && w.datum <= tot && Number.isFinite(w.kg))
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));

  const waarden = gebruikt.map((w) => w.kg);
  const heeftStreef = streefKg != null && Number.isFinite(streefKg);
  const domein = heeftStreef ? [...waarden, streefKg] : waarden;
  let lo = domein.length ? Math.min(...domein) : 0;
  let hi = domein.length ? Math.max(...domein) : 1;
  if (hi - lo < 0.5) {
    const midden = (hi + lo) / 2;
    lo = midden - 0.5;
    hi = midden + 0.5;
  }
  const yVan = (kg) => onder - ((kg - lo) / (hi - lo)) * (onder - BOVEN);

  const punten = gebruikt.map((w) => ({ x: rond(xVan(w.datum)), y: rond(yVan(w.kg)), weging: w }));
  const pad = punten.length > 1 ? punten.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') : '';

  const yLijnen = [];
  if (waarden.length) {
    const laag = Math.min(...waarden);
    const hoog = Math.max(...waarden);
    yLijnen.push({ y: rond(yVan(hoog)), kg: hoog });
    if (laag !== hoog) yLijnen.push({ y: rond(yVan(laag)), kg: laag });
  }

  // Maanden: de eerste van elke maand binnen het bereik, met minstens 30 eenheden ertussen.
  const xLabels = [];
  const begin = naarDatum(van);
  const eind = naarDatum(tot);
  let d = new Date(begin.getFullYear(), begin.getMonth() + (begin.getDate() === 1 ? 0 : 1), 1);
  while (d <= eind) {
    const x = rond(xVan(naarSleutel(d)));
    if (!xLabels.length || x - xLabels[xLabels.length - 1].x >= 30) xLabels.push({ x, tekst: MAANDEN[d.getMonth()] });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  // Zonder maandwisseling in het bereik: de begindatum als label.
  if (!xLabels.length) xLabels.push({ x: rond(links), tekst: `${begin.getDate()} ${MAANDEN[begin.getMonth()]}` });

  return { punten, pad, yLijnen, xLabels, streefY: heeftStreef ? rond(yVan(streefKg)) : null, basisY, links, rechts };
}

// Eerste dag van de periode: 1, 3 of 12 kalendermaanden terug.
export function beginVanPeriode(periode, tot) {
  const maanden = { maand: 1, kwartaal: 3, jaar: 12 }[periode] ?? 3;
  const d = naarDatum(tot);
  d.setMonth(d.getMonth() - maanden);
  return naarSleutel(d);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(naam, attrs = {}, tekst) {
  const e = document.createElementNS(SVG_NS, naam);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  if (tekst != null) e.textContent = tekst;
  return e;
}

// grafiek({ wegingen, periode: 'maand' | 'kwartaal' | 'jaar', streefKg, opKiesPunt, tot, gekozen, streefLabel, animeer, vul })
// vul: de grafiek vult de hoogte van zijn (relatief gepositioneerde) vlak in plaats van een vaste hoogte te nemen.
// animeer: de lijn tekent zich één keer (bij het openen van een scherm); latere tekeningen (andere periode, een tik) staan stil.
// Geeft een element met .zet(opties) om te hertekenen (andere periode, nieuwe wegingen) en .kies(week).
// Het gekozen punt is zichtbaar gekozen (krans). Een tik kiest het dichtstbijzijnde punt (één tiklaag); met het toetsenbord loop je de punten op volgorde door.
export function grafiek(opties = {}) {
  let o = { periode: 'kwartaal', wegingen: [], streefKg: null, tot: vandaag(), streefLabel: 'streef', ...opties };
  let gekozen = opties.gekozen ?? null; // week-sleutel van de gekozen weging
  let tekenNog = Boolean(opties.animeer); // de eerste tekening met een echte breedte beweegt
  const houder = h('div', { class: ['grafiek', opties.vul && 'grafiek--vul'] });

  function kiesPunt(p) {
    gekozen = p.weging.week;
    teken();
    o.opKiesPunt?.(p.weging);
  }

  function teken() {
    // Had een punt van de grafiek de toetsenbordfocus, dan krijgt na het hertekenen hetzelfde punt ze terug (anders valt ze op <body>).
    const actief = document.activeElement;
    const focusIndex = actief && houder.contains(actief) ? [...houder.querySelectorAll('.grafiek__tikgroep')].indexOf(actief) : -1;
    const breedte = Math.max(240, Math.round(houder.clientWidth || 340));
    // De hoogte: standaard 200 (260 op een brede kaart); staat de grafiek in een vlak met een eigen hoogte (.grafiek--vul),
    // dan vult ze dat vlak.
    const basis = breedte >= 560 ? 260 : 200;
    const HOOGTE = houder.classList.contains('grafiek--vul') ? Math.max(o.minHoogte ?? 200, Math.round(houder.clientHeight || basis)) : basis;
    const van = beginVanPeriode(o.periode, o.tot);
    const g = berekenGrafiek(o.wegingen, { van, tot: o.tot, streefKg: o.streefKg, breedte, hoogte: HOOGTE });
    const wortel = el('svg', { viewBox: `0 0 ${breedte} ${HOOGTE}`, width: breedte, height: HOOGTE, role: 'group', focusable: 'false' });

    wortel.append(el('line', { class: 'grafiek__basis', x1: 0, x2: breedte, y1: g.basisY, y2: g.basisY }));
    if (g.streefY != null) {
      wortel.append(el('line', { class: 'grafiek__streef', x1: g.links, x2: g.rechts, y1: g.streefY, y2: g.streefY }));
      wortel.append(el('text', { class: 'grafiek__label grafiek__label--streef', x: g.links, y: g.streefY - 6, 'text-anchor': 'start' }, o.streefLabel));
    }
    for (const l of g.xLabels) {
      wortel.append(el('text', { class: 'grafiek__label', x: l.x, y: g.basisY + 20, 'text-anchor': l.x < 20 ? 'start' : 'middle' }, l.tekst));
    }
    // Eén tiklaag over de hele grafiek: een tik kiest altijd het dichtstbijzijnde punt (tikvlakken zouden
    // bij wekelijkse wegingen over een jaar overlappen).
    const laag = el('rect', { class: 'grafiek__tiklaag', x: 0, y: 0, width: breedte, height: g.basisY });
    laag.addEventListener('click', (e) => {
      if (!g.punten.length) return;
      const kader = wortel.getBoundingClientRect();
      const schaal = kader.width ? breedte / kader.width : 1;
      const x = (e.clientX - kader.left) * schaal;
      const y = (e.clientY - kader.top) * schaal;
      let beste = null;
      let afstand = Infinity;
      for (const p of g.punten) {
        const d = Math.hypot(p.x - x, (p.y - y) * 0.3); // vooral de horizontale afstand telt
        if (d < afstand) { afstand = d; beste = p; }
      }
      if (beste && afstand <= 48 && Math.abs(beste.y - y) <= 90) kiesPunt(beste);
    });
    wortel.append(laag);
    const beweegNu = tekenNog && houder.isConnected && houder.clientWidth > 0 && magBewegen();
    if (beweegNu) tekenNog = false;
    if (g.pad) wortel.append(el('path', { class: ['grafiek__lijn', beweegNu && 'grafiek__lijn--teken'].filter(Boolean).join(' '), d: g.pad, pathLength: beweegNu ? 1 : null }));

    // Labels bij de hoogste en de laagste waarde: boven respectievelijk onder het punt.
    g.yLijnen.forEach((l, i) => {
      const punt = g.punten.find((p) => p.weging.kg === l.kg);
      if (!punt) return;
      const x = Math.min(breedte - 28, Math.max(28, punt.x));
      wortel.append(el('text', { class: 'grafiek__label grafiek__label--waarde', x, y: i === 0 ? punt.y - 14 : punt.y + 24, 'text-anchor': 'middle' }, opmaakKg(l.kg)));
    });

    // De waarde van het gekozen punt staat zichtbaar bij het punt (tenzij het de hoogste of laagste is: die hebben al een label).
    const gekozenPunt = g.punten.find((p) => gekozen != null && p.weging.week === gekozen);
    if (gekozenPunt && !g.yLijnen.some((l) => l.kg === gekozenPunt.weging.kg)) {
      const x = Math.min(breedte - 28, Math.max(28, gekozenPunt.x));
      wortel.append(el('text', { class: 'grafiek__label grafiek__label--waarde', x, y: gekozenPunt.y - 14, 'text-anchor': 'middle' }, opmaakKg(gekozenPunt.weging.kg)));
    }

    // Roving tabindex: de grafiek is één tabstop (het gekozen punt, anders het laatste); pijlen, Home en End lopen door de punten.
    const gekozenIndex = g.punten.findIndex((p) => gekozen != null && p.weging.week === gekozen);
    const tabIndex = gekozenIndex >= 0 ? gekozenIndex : g.punten.length - 1;
    const naarPunt = (nummer) => {
      const doel = g.punten[nummer];
      if (!doel) return;
      kiesPunt(doel);
      houder.querySelectorAll('.grafiek__tikgroep')[nummer]?.focus();
    };
    g.punten.forEach((p, index) => {
      const isGekozen = gekozen != null && p.weging.week === gekozen;
      const datum = naarDatum(p.weging.datum);
      const groep = el('g', {
        class: 'grafiek__tikgroep',
        tabindex: index === tabIndex ? 0 : -1,
        role: 'button',
        'aria-pressed': String(isGekozen),
        'aria-label': `${opmaakKg(p.weging.kg)}, ${datum.getDate()} ${MAANDEN[datum.getMonth()]}`,
      });
      if (isGekozen) groep.append(el('circle', { class: 'grafiek__krans', cx: p.x, cy: p.y, r: 9 }));
      const puntEl = el('circle', { class: beweegNu ? 'grafiek__punt grafiek__punt--in' : 'grafiek__punt', cx: p.x, cy: p.y, r: 3 }); // 6 px
      // Via CSSOM, niet als style-attribuut: de CSP staat geen inline style toe
      if (beweegNu) puntEl.style.setProperty('animation-delay', Math.round(900 * (index / Math.max(1, g.punten.length - 1))) + 'ms');
      groep.append(puntEl);
      const kies = () => kiesPunt(p);
      groep.addEventListener('click', (e) => {
        e.stopPropagation();
        kies();
      });
      groep.addEventListener('keydown', (e) => {
        const sprong = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: g.punten.length - 1 }[e.key];
        if (sprong !== undefined) {
          e.preventDefault();
          if (sprong >= 0 && sprong < g.punten.length && sprong !== index) naarPunt(sprong);
          return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        kies();
        houder.querySelectorAll('.grafiek__tikgroep')[index]?.focus();
      });
      wortel.append(groep);
    });
    houder.replaceChildren(wortel);
    if (focusIndex >= 0) {
      const groepen = houder.querySelectorAll('.grafiek__tikgroep');
      groepen[Math.min(focusIndex, groepen.length - 1)]?.focus({ preventScroll: true });
    }
  }

  houder.zet = (nieuw) => {
    o = { ...o, ...nieuw };
    if ('gekozen' in nieuw) gekozen = nieuw.gekozen;
    teken();
  };
  houder.kies = (week) => {
    gekozen = week;
    teken();
  };

  // Tekenen zodra de breedte bekend is, en opnieuw bij een andere breedte. Verdwijnt de grafiek uit de pagina (het scherm hertekent of
  // wordt verlaten), dan koppelt de waarnemer zichzelf los (R2-17).
  teken();
  if (typeof ResizeObserver !== 'undefined') {
    let laatste = '';
    let inPagina = false; // pas loskoppelen als de grafiek al eens in de pagina stond (niet terwijl ze nog opgebouwd wordt)
    const waarnemer = new ResizeObserver(() => {
      if (!houder.isConnected) return inPagina && waarnemer.disconnect();
      inPagina = true;
      const maat = `${Math.round(houder.clientWidth)}x${houder.classList.contains('grafiek--vul') ? Math.round(houder.clientHeight) : 0}`;
      if (houder.clientWidth && maat !== laatste) {
        laatste = maat;
        teken();
      }
    });
    waarnemer.observe(houder);
    houder.stop = () => waarnemer.disconnect();
  }
  return houder;
}
