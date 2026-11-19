// "Goed om te weten": twee tot vier korte regels onderaan het linkerdeel van een instelscherm, elk met een icoontegel en één zin
// (BESLISSING 164). Warm en zonder oordeel. De plaats van de tekst naast haar tegel: BESLISSING 565 (componenten.css en uitlijnWeetjes hieronder). weetjes([{ begrip, tekst }]) → element .instel__weetjes
import { h } from './dom.js';
import { t } from '../teksten.js';
import { begripTegel, begripOpties } from './iconenkaart.js';
import { kaartkop } from './componenten.js';

// BESLISSING 565: een tekst van één regel staat in het midden van haar tegel, een tekst van twee of meer regels begint met de bovenkant van haar hoofdletters
// op de bovenrand van de tegel (componenten.css). Het aantal regels hangt van de breedte af, dus .weetje__tekst--meer wordt gezet door uitlijnWeetjes, voor
// élke weetjestekst in de app (ook Privacy, Herinneringen en "Toon het me"): een waarnemer volgt elke tekst die in de pagina komt en elke verandering van haar
// breedte. De eerste melding van een ResizeObserver komt vóór de eerste tekening, dus er springt niets zichtbaar. Een scherm dat blokken verplaatst en meteen
// hoogtes meet (instel-balans.js, delen.js) roept uitlijnWeetjes(blok) zelf aan.
const TEKSTEN = '.weetje__tekst, .meldingen__weetjetekst';
const regelsVan = (el) => {
  const g = document.createRange();
  g.selectNodeContents(el);
  return new Set([...g.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
};
export function uitlijnWeetjes(wortel = document) {
  const lijst = [...wortel.querySelectorAll(TEKSTEN)];
  const meer = lijst.map((el) => regelsVan(el)); // eerst alles lezen, dan schrijven
  lijst.forEach((el, i) => {
    if (meer[i] > 0) el.classList.toggle('weetje__tekst--meer', meer[i] > 1);
  });
}
function startWaarnemer() {
  if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function' || !document.documentElement) return;
  const ro = new ResizeObserver((items) => {
    const lijst = items.map((i) => i.target).filter((el) => el.isConnected);
    const meer = lijst.map((el) => regelsVan(el));
    lijst.forEach((el, i) => {
      if (meer[i] > 0) el.classList.toggle('weetje__tekst--meer', meer[i] > 1);
    });
  });
  const neem = (node, aan) => {
    if (node.nodeType !== 1) return;
    for (const el of node.matches(TEKSTEN) ? [node] : []) aan ? ro.observe(el) : ro.unobserve(el);
    for (const el of node.querySelectorAll(TEKSTEN)) aan ? ro.observe(el) : ro.unobserve(el);
  };
  new MutationObserver((lijst) => {
    for (const m of lijst) {
      m.removedNodes.forEach((n) => neem(n, false));
      m.addedNodes.forEach((n) => neem(n, true));
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  neem(document.documentElement, true);
  document.fonts?.ready?.then(() => uitlijnWeetjes());
}
startWaarnemer();

// BESLISSING 296: de weetjes zijn statische blokken (tegel links, tekst ernaast) in een raster; alleen "Toon het me" (uitleghaken.js) licht op.
// BESLISSING 323: binnen één blok hebben alle tegels dezelfde familie (opties.familie; zonder optie neutraal, zoals de instellingenschermen).
export function weetjes(regels, opties = {}) {
  const familie = opties.familie ?? 'neutraal';
  // BESLISSING 362: dezelfde kaartkop als overal (icoontegel, titel, lijn eronder), zoals "Goed om te weten" op Herinneringen.
  const blok = h(
    'div',
    { class: 'instel__weetjes instel__weetjes--blokken' },
    kaartkop({ tegel: begripOpties('uitleg', { familie }), label: t('instellingen.goedOmTeWeten') }),
    h('div', { class: 'instel__weetjesrij' }, ...regels.map((r) => h('div', { class: 'weetje' }, begripTegel(r.begrip, { familie }), h('p', { class: 'weetje__tekst' }, r.tekst)))),
  );
  return blok;
}

// BESLISSING 351: elke "Toon het me" (of andere link in een blok "Goed om te weten") komt uit deze ene functie: tegel in de familie van het blok,
// tekst in de gedeelde linkopmaak (.weetje--link in componenten.css). opties: { begrip, label, klasse, data }.
export function toonHetMe({ familie, opKlik, begrip = 'herstelvraag', label = t('uitleg.toonHet'), klasse = '', data = null }) {
  const knop = h(
    'button',
    { type: 'button', class: ['weetje weetje--link licht-op-icoon', klasse], onclick: opKlik, ...(data ? { 'data-uitleg': data } : {}) },
    begripTegel(begrip, { familie }),
    h('span', { class: 'weetje__tekst' }, label),
  );
  return knop;
}

// De weetjes van een scherm uit teksten.js (instellingen.weetjes.<scherm>.1 tot .3), met een icoon en familie per regel.
export function weetjesVoor(scherm, begrippen) {
  return weetjes(begrippen.map((begrip, i) => ({ begrip, tekst: t(`instellingen.weetjes.${scherm}.${i + 1}`) })));
}
