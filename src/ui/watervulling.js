// Watervulling (HUISSTIJL §7): één afgeronde glasvorm in SVG met een vulling in --c-water en een zacht
// bewegende golflijn. Bij 1 of meer is het glas vol tot bovenaan en verandert het niet meer: nooit hoger
// dan vol, nooit buiten de vorm. Doel gehaald: de vulling wordt salie en het beeldmerk bloeit.
// Alleen tokens; werkt in alle thema's. Opmaak: .watervulling in componenten.css.
import { h, svg } from './dom.js';
import { beeldmerk } from './componenten.js';

// Geometrie in SVG-eenheden. Het glas loopt van y = RAND tot y = BODEM.
const BREEDTE = 120;
const HOOGTE = 196;
const RAND = 8;
const BODEM = 188;
const BINNEN = BODEM - RAND;
const VORM = 'M14 8 H106 L98 172 Q97 188 81 188 H39 Q23 188 22 172 Z';
// Golf: periode 60, amplitude 3; de golf schuift 60 per ronde zodat de lus naadloos is.
const GOLF = 'M0 0 Q15 -3 30 0 T60 0 T90 0 T120 0 T150 0 T180 0 T210 0 T240 0 V220 H0 Z';

const klem = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

// watervulling({ vulling: 0..1+, gehaald, grootte (hoogte in px), label })
// Geeft een element met .zet(vulling, gehaald). vulling >= 1 is vol; erboven verandert er niets.
export function watervulling({ vulling = 0, gehaald = false, grootte = 200, label } = {}) {
  const uniek = 'wv' + Math.random().toString(36).slice(2, 8);
  const glas = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BREEDTE} ${HOOGTE}" focusable="false" aria-hidden="true">
      <defs><clipPath id="${uniek}"><path d="${VORM}"/></clipPath></defs>
      <path class="watervulling__glas" d="${VORM}"/>
      <g clip-path="url(#${uniek})">
        <g class="watervulling__peil">
          <rect class="watervulling__vlak" x="0" y="0" width="${BREEDTE}" height="220"/>
          <g class="watervulling__golf"><path d="${GOLF}"/></g>
        </g>
      </g>
      <path class="watervulling__rand" d="${VORM}"/>
    </svg>`,
  );
  const peil = glas.querySelector('.watervulling__peil');

  const el = h(
    'div',
    { class: 'watervulling', role: label ? 'img' : null, 'aria-label': label, 'aria-hidden': label ? null : 'true', style: { '--wv-h': grootte + 'px' } },
    glas,
    h('span', { class: 'watervulling__bloei' }, beeldmerk({ variant: 'mono', grootte: 64 })),
  );

  const stil = stilLijst();
  let huidig = 0;
  let isGehaald = false;

  el.zet = (nieuw, doelGehaald) => {
    huidig = klem(nieuw);
    if (doelGehaald !== undefined) isGehaald = Boolean(doelGehaald);
    // Het peil is een verschuiving van het hele watervlak: lineair en vloeiend, nooit voorbij vol.
    peil.style.transform = `translateY(${RAND + (1 - huidig) * BINNEN}px)`;
    el.dataset.vulling = String(huidig);
    el.classList.toggle('is-leeg', huidig === 0);
    el.classList.toggle('is-vol', huidig >= 1);
    // Een golf alleen als er ruimte voor is en de gebruiker beweging toelaat; vol en leeg zijn vlak.
    el.classList.toggle('is-golvend', huidig > 0 && huidig < 1 && !(stil && stil.matches));
    el.classList.toggle('is-gehaald', isGehaald);
  };

  // De eerste stand zonder overgang, daarna beweegt het peil vloeiend.
  el.classList.add('is-start');
  el.zet(vulling, gehaald);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-start')));
  el.herzet = () => el.zet(huidig);
  houdBij(el);
  return el;
}

// Eén gedeelde mediaquery voor alle glazen (R2-08). Vroeger hield elk glas een eigen MediaQueryList met een luisteraar, die bleef
// leven nadat het glas verdween (Vandaag maakt bij elke tik een nieuw glas). De glazen staan hier als zwakke verwijzing: een glas
// dat weg is, kan gewoon opgeruimd worden.
let stilMq;
const glazen = new Set();
function stilLijst() {
  if (stilMq === undefined) {
    stilMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    stilMq?.addEventListener?.('change', () => {
      for (const ref of [...glazen]) {
        const glas = ref.deref();
        if (glas) glas.herzet();
        else glazen.delete(ref);
      }
    });
  }
  return stilMq;
}
function houdBij(el) {
  if (typeof WeakRef !== 'function') return;
  for (const ref of [...glazen]) if (!ref.deref()) glazen.delete(ref);
  glazen.add(new WeakRef(el));
}
