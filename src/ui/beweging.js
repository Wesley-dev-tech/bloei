// Eén bewegingstaal voor de hele app (BESLISSING 148): schermen komen rustig op bij het openen, een getal telt op,
// iets dat net klaar raakte bloeit één keer op. Alles is zacht (--ease, 260 tot 600 ms), nooit twee dingen tegelijk,
// en niets beweegt bij een hertekening na een tik. Bij prefers-reduced-motion beweegt er niets: het eindbeeld staat er meteen.
// De klassen staan in src/stijl/componenten.css (.komop, .bloeiop, .alleen-lezer).
import { luister } from '../kern/bus.js';

// Onwaar als de gebruiker verminderde beweging wil.
export function magBewegen() {
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Welke sleutels in deze routewissel al getoond zijn, en onder welk adres. De app tekent een scherm soms al voor het event
// route:gewijzigd komt; daarom telt ook het adres: wat onder het huidige adres al getoond is, blijft getoond.
let gezien = new Set();
let padVanLijst = null;
const huidigPad = () => (typeof location === 'undefined' ? '' : location.hash.split('?')[0]);
// Waar de gebruiker vandaan kwam bij de laatste echte routewissel (zonder '#/'), bv. 'meer' of 'dagboek/week'. Schermen die vanuit
// meerdere plekken bereikbaar zijn, tonen er een terugknop mee (Delen).
let herkomst = null;
export const routeHerkomst = () => herkomst;
luister('route:gewijzigd', (d) => {
  if (d?.vorigePad !== undefined && d.vorigePad !== d.pad) herkomst = d.vorigePad;
  if (padVanLijst !== huidigPad()) {
    gezien = new Set();
    padVanLijst = huidigPad();
  }
});

// Waar bij de eerste aanroep met deze sleutel na een routewissel, daarna onwaar tot de volgende routewissel. Zo beweegt een scherm
// bij het openen en niet bij elke hertekening na een tik. Bij het starten van de app telt de eerste tekening als openen.
// Gebruik een sleutel per onderdeel, bv. eersteToon('gewicht:kaarten').
export function eersteToon(sleutel) {
  const pad = huidigPad();
  if (padVanLijst !== pad) {
    gezien = new Set(); // het adres wisselde: dit is een nieuw scherm
    padVanLijst = pad;
  }
  if (gezien.has(sleutel)) return false;
  gezien.add(sleutel);
  return true;
}

// De elementen komen kort na elkaar op (opacity 0 naar 1, translateY van --s-5 (20 px) naar 0, 520 ms --ease), 90 ms tussen twee elementen.
// Hoogstens 5 stappen vertraging, zodat alles binnen ongeveer één seconde staat. Ruimt zijn klasse op na afloop.
// komOp(elementen: Element[] | NodeList, { stap = 70 (ms tussen twee elementen), start = 0 (ms voor het eerste) })
export const MAX_STAPPEN = 5;
export function komOp(elementen, { stap = 90, start = 0 } = {}) {
  if (!magBewegen()) return;
  [...elementen].filter(Boolean).forEach((el, i) => {
    el.style.setProperty('--komop-vertraging', `${start + Math.min(i, MAX_STAPPEN) * stap}ms`);
    el.classList.add('komop');
    const klaar = () => {
      el.classList.remove('komop');
      el.style.removeProperty('--komop-vertraging');
    };
    el.addEventListener('animationend', klaar, { once: true });
  });
}

// Eén keer van 0,9 naar 1 met een zachte vervaging, voor iets dat net klaar raakte (een badge, een gehaald doel).
export function bloeiOp(element) {
  if (!magBewegen() || !element) return;
  element.classList.remove('bloeiop');
  void element.offsetWidth; // opnieuw kunnen starten
  element.classList.add('bloeiop');
  element.addEventListener('animationend', () => element.classList.remove('bloeiop'), { once: true });
}

// Een korte vervaging van de inhoud (opacity 0 naar 1 in 260 ms): bij bladeren tussen dagen, weken en maanden, in plaats van de hele opkomst.
export function vervaag(element) {
  if (!magBewegen() || !element) return;
  element.classList.add('vervaag');
  element.addEventListener('animationend', () => element.classList.remove('vervaag'), { once: true });
}

const uitVertraagd = (t) => 1 - (1 - t) ** 3;

// Een getal telt op naar zijn waarde (van → naar, standaard 600 ms). Mag bewegen niet, dan staat de eindwaarde er meteen.
// Een schermlezer hoort alleen de eindwaarde (de tellende tekst is aria-hidden). Geeft een functie die het tellen stopt.
// telOp(element, naar, { van = 0, opmaak = (n) => String(Math.round(n)), duur = 600 })
export function telOp(element, naar, { van = 0, opmaak = (n) => String(Math.round(n)), duur = 600 } = {}) {
  const eind = opmaak(naar);
  if (!magBewegen() || van === naar) {
    element.textContent = eind;
    return () => {};
  }
  const tellend = document.createElement('span');
  tellend.setAttribute('aria-hidden', 'true');
  tellend.textContent = opmaak(van);
  const lezer = document.createElement('span');
  lezer.className = 'alleen-lezer';
  lezer.textContent = eind;
  element.replaceChildren(tellend, lezer);

  let gestopt = false;
  let begin = null;
  const stap = (nu) => {
    if (gestopt) return;
    begin ??= nu;
    const t = Math.min(1, (nu - begin) / duur);
    tellend.textContent = opmaak(van + (naar - van) * uitVertraagd(t));
    if (t < 1) requestAnimationFrame(stap);
    else element.textContent = eind; // klaar: gewone tekst zonder hulpelementen
  };
  requestAnimationFrame(stap);
  return () => {
    gestopt = true;
    element.textContent = eind;
  };
}
