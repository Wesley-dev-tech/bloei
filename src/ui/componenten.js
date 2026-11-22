// Basiscomponenten van Bloei (HUISSTIJL.md §3 tot en met §8 en §10). Opmaak staat in
// src/stijl/componenten.css; kleuren, maten en lettertypes komen uit bloei-huisstijl/tokens.css.
// Geen Bootstrap-componentklassen: elk onderdeel is eigen werk.
import { h, svg } from './dom.js';
import { volgendeStapwaarde } from '../logica/stapwaarde.js';
import { icoon } from './iconen.js';
import { t } from '../teksten.js';
import { ICOON, begripIcoon } from './iconenkaart.js';
import { bewaakTerug } from '../pwa/terug.js';

import markLicht from '../../bloei-huisstijl/logo/bloei-mark.svg?raw';
import markNacht from '../../bloei-huisstijl/logo/bloei-mark-nacht.svg?raw';
import markMono from '../../bloei-huisstijl/logo/bloei-mark-mono.svg?raw';
import bladRaw from '../../bloei-huisstijl/energie/blad.svg?raw';

// ------------------------------------------------------------------ hulpjes

// Tikken geeft een korte trilling waar het toestel dat kan (HUISSTIJL §8).
export function tril() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* geen trilfunctie: niets aan de hand */
  }
}

// Het beeldmerk komt uit bloei-huisstijl/logo/. Metadata en toegankelijkheidsattributen eruit,
// want het woord ernaast is de naam en het beeld is decoratief.
function schoonMerk(bron, klasse) {
  const el = svg(
    bron
      .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
      .replace(/\sxmlns:c2pa="[^"]*"/g, '')
      // De CSP staat geen style-attribuut toe: de overvloeimodus gaat via de klasse .mengen (componenten.css)
      .replace(/\sstyle="mix-blend-mode:multiply"/g, ' class="mengen"')
      .replace(/\srole="img"\saria-label="[^"]*"/, ' aria-hidden="true" focusable="false"'),
  );
  el.setAttribute('class', klasse);
  return el;
}

function bladje() {
  const el = svg(bladRaw);
  el.setAttribute('focusable', 'false');
  return el;
}

// Roving tabindex en pijltjestoetsen voor een radiogroep.
function radioToetsen(groep, knoppen, kies) {
  groep.addEventListener('keydown', (e) => {
    const tel = knoppen.length;
    const nu = knoppen.indexOf(document.activeElement);
    let volgende = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') volgende = (nu + 1) % tel;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') volgende = (nu - 1 + tel) % tel;
    else if (e.key === 'Home') volgende = 0;
    else if (e.key === 'End') volgende = tel - 1;
    if (volgende == null || nu < 0) return;
    e.preventDefault();
    knoppen[volgende].focus();
    kies(volgende + 1);
  });
}

// ------------------------------------------------------------------ logo (§2)

// Beeldmerk plus het woord "bloei" als HTML-tekst in Cormorant Garamond Italic 500.
// grootte = lettergrootte van het woord in px; het beeldmerk is 1,1 x en de ruimte 0,4 x die hoogte.
// Het thema Nacht toont bloei-mark-nacht.svg (zie .logo__merk--nacht in componenten.css).
// link: true maakt van het logo een link naar #/vandaag (de home-knop), met dezelfde uitstraling.
// logo({ grootte = 28, klasse, link = false })
export function logo(opties = {}) {
  const { grootte = 28, klasse, link = false } = opties;
  return h(
    link ? 'a' : 'span',
    {
      class: ['logo', link && 'logo--link', klasse],
      style: { '--logo-t': grootte + 'px' },
      href: link ? '#/vandaag' : null,
      'aria-label': link ? 'Bloei, naar Vandaag' : null,
    },
    schoonMerk(markLicht, 'logo__merk logo__merk--licht'),
    schoonMerk(markNacht, 'logo__merk logo__merk--nacht'),
    h('span', { class: 'logo__woord' }, 'bloei'),
  );
}

// Het beeldmerk alleen: variant 'licht' (standaard), 'nacht', 'mono' (currentColor) of 'logo'. 'logo' is het meerkleurige
// beeldmerk zoals de zijbalk het toont: licht, en in Nacht de nachtvariant (dezelfde klassen als logo()); het kleurt nooit mee met een tabblad.
// beeldmerk({ variant, grootte (px), klasse })
export function beeldmerk(opties = {}) {
  const { variant = 'licht', grootte = 64, klasse } = opties;
  if (variant === 'logo') {
    const paar = h('span', { class: ['beeldmerk-paar', klasse] });
    for (const [bron, soort] of [[markLicht, 'licht'], [markNacht, 'nacht']]) {
      const el = schoonMerk(bron, `beeldmerk logo__merk--${soort}`);
      el.setAttribute('width', grootte);
      el.setAttribute('height', grootte);
      paar.append(el);
    }
    return paar;
  }
  const bron = { licht: markLicht, nacht: markNacht, mono: markMono }[variant] ?? markLicht;
  const el = schoonMerk(bron, ['beeldmerk', klasse].filter(Boolean).join(' '));
  el.setAttribute('width', grootte);
  el.setAttribute('height', grootte);
  return el;
}

// ------------------------------------------------------------------ icoontegel (§5.1)

// Een inhoudsicoon staat altijd in een tegel. familie: 'maaltijd' | 'drank' | 'gezondheid' | 'neutraal'.
// opties: { groot (56 px), gedimd (40% dekking, bv. badge nog niet behaald), stijl ('solid' | 'regular'), label }
export function icoontegel(naam, familie = 'neutraal', opties = {}) {
  const { groot = false, gedimd = false, stijl = 'solid', label, rond = false } = opties;
  return h(
    'span',
    { class: ['tegel', 'tegel--' + familie, groot && 'tegel--groot', gedimd && 'tegel--gedimd', rond && 'tegel--rond'] },
    icoon(naam, { grootte: groot ? 24 : 18, stijl, label }),
  );
}

// Een actie- of navigatie-icoon zonder tegel, 48 x 48 tikvlak (chevrons, ongedaan maken).
export function icoonknop(naam, opties = {}) {
  const { label, opKlik, uit = false, grootte = 20, stijl = 'solid', klasse } = opties; // 20 px: --icon-size-lijst
  const el = h(
    'button',
    { type: 'button', class: ['icoonknop', klasse], 'aria-label': label, disabled: uit },
    icoon(naam, { grootte, stijl }),
  );
  if (opKlik) {
    el.addEventListener('click', (e) => {
      tril();
      opKlik(e);
    });
  }
  return el;
}

// ------------------------------------------------------------------ knop (§7)

// soort: 'primair' (aubergine, pill, 52 px) | 'secundair' (omlijnd) | 'tekst' (licht, zonder rand)
// De oude namen 'inkt', 'potlood', 'lei' verwijzen door naar primair en secundair.
const SOORTEN = { inkt: 'primair', potlood: 'secundair', lei: 'secundair' };
export function knop(tekst, opties = {}) {
  const { soort = 'primair', icoon: iconNaam, opKlik, groot = false, breed = false, label, type = 'button', uitgeschakeld = false } = opties;
  const echt = SOORTEN[soort] || soort;
  const el = h(
    'button',
    { type, class: ['knop', 'knop--' + echt, groot && 'knop--groot', breed && 'knop--breed'], 'aria-label': label, disabled: uitgeschakeld },
    iconNaam ? icoon(iconNaam, { grootte: 18 }) : null,
    tekst ? h('span', { class: 'knop__tekst' }, tekst) : null,
  );
  if (opKlik) {
    el.addEventListener('click', (e) => {
      tril();
      opKlik(e);
    });
  }
  return el;
}

// ------------------------------------------------------------------ chip en segment (§7)

// Een chip is een keuzeknop: --c-surface-soft, actief --c-accent-soft met tekst --c-accent-text.
export function chip(tekst, opties = {}) {
  const { actief = false, opKlik, label, icoon: iconNaam, uitgeschakeld = false } = opties;
  const el = h(
    'button',
    { type: 'button', class: ['chip', actief && 'is-actief'], 'aria-pressed': String(actief), 'aria-label': label, disabled: uitgeschakeld },
    iconNaam ? icoon(iconNaam, { grootte: 16 }) : null,
    h('span', null, tekst),
  );
  if (opKlik) {
    el.addEventListener('click', (e) => {
      tril();
      opKlik(e);
    });
  }
  return el;
}

// Een rij chips waarvan er één actief is (bv. dranksoort). keuzes: [{ id, label }]
export function chips(opties) {
  const { keuzes, actief = null, opKies, label } = opties;
  let huidig = actief;
  const groep = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  const knoppen = keuzes.map((k) => {
    const b = chip(k.label, {
      actief: k.id === huidig,
      opKlik: () => {
        huidig = k.id;
        teken();
        opKies?.(k.id);
      },
    });
    return b;
  });
  function teken() {
    knoppen.forEach((b, i) => {
      const aan = keuzes[i].id === huidig;
      b.classList.toggle('is-actief', aan);
      b.setAttribute('aria-pressed', String(aan));
    });
  }
  groep.append(...knoppen);
  return groep;
}

// Segment: 1M · 3M · 1J, Dag · Week · Maand. Eén actief, in één vlak.
// opties: { keuzes: [{ id, label }], actief, opKies, label }
export function segment(opties) {
  const { keuzes, actief = null, opKies, label } = opties;
  let huidig = actief;
  const groep = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': label });
  const knoppen = keuzes.map((k, i) =>
    h(
      'button',
      {
        type: 'button',
        class: 'segment__deel',
        role: 'radio',
        onclick: () => kies(i, true),
      },
      k.label,
    ),
  );
  function teken() {
    knoppen.forEach((b, i) => {
      const aan = keuzes[i].id === huidig;
      b.classList.toggle('is-actief', aan);
      b.setAttribute('aria-checked', String(aan));
      b.tabIndex = aan || (huidig == null && i === 0) ? 0 : -1;
    });
  }
  function kies(i, trilt) {
    huidig = keuzes[i].id;
    if (trilt) tril();
    teken();
    opKies?.(huidig);
  }
  radioToetsen(groep, knoppen, (n) => kies(n - 1, false));
  groep.append(...knoppen);
  teken();
  return groep;
}

// ------------------------------------------------------------------ kaart (§7) en rij

// Kaart: wit, radius 16, padding 20, --shadow-card, geen rand. Eén accent per kaart.
// kaart({ titel?, label?, groot?, klasse?, tag? }, ...kinderen)
export function kaart(opties, ...kinderen) {
  let o = opties;
  if (o instanceof Node || typeof o === 'string' || o == null || Array.isArray(o)) {
    kinderen = [o, ...kinderen];
    o = {};
  }
  const { titel, label, groot = false, klasse, tag = 'div', opKlik, ...rest } = o;
  // Met opKlik is de hele kaart één knop (hover, lift bij een muis, schaal 0,98 bij drukken).
  const el = h(
    opKlik ? 'button' : tag,
    { class: ['kaart', groot && 'kaart--groot', opKlik && 'kaart--knop', klasse], type: opKlik ? 'button' : null, ...rest },
    label ? h('p', { class: 'label kaart__label' }, label) : null,
    titel ? h('h2', { class: 't-h2 kaart__titel' }, titel) : null,
    ...kinderen,
  );
  if (opKlik) {
    el.addEventListener('click', (e) => {
      tril();
      opKlik(e);
    });
  }
  return el;
}

// De kop van elke kaart in de app, met een vaste hoogte zodat ze overal gelijk staan: links een optionele icoontegel en het
// label (labelstijl), rechts een optionele stand of actie (tekst of Node).
// kaartkop({ tegel: { naam, familie, stijl? }, label, eind })
export function kaartkop({ tegel, label, eind } = {}) {
  return h(
    'div',
    { class: 'kaartkop' },
    tegel ? icoontegel(tegel.naam, tegel.familie, tegel) : null,
    h('p', { class: 'label kaartkop__label' }, label),
    eind != null ? h('div', { class: 'kaartkop__eind' }, eind) : null,
  );
}

// Een getal in groot Cormorant met een label, om ruimte te vullen met iets dat iets zegt. Het getal zelf staat in .kerncijfer__getal
// (geef dat element aan telOp om het te laten optellen); de eenheid staat er klein achter.
// kerncijfer({ label, waarde: string | number, eenheid, tegel: { naam, familie } }) → element met .getal (het getalelement)
export function kerncijfer({ label, waarde, eenheid, tegel } = {}) {
  const getal = h('span', { class: 'kerncijfer__getal cijfer' }, String(waarde ?? ''));
  const el = h(
    'div',
    { class: 'kerncijfer' },
    tegel ? icoontegel(tegel.naam, tegel.familie, tegel) : null,
    h(
      'div',
      { class: 'kerncijfer__tekst' },
      h('p', { class: 'label' }, label),
      h('p', { class: 'kerncijfer__waarde' }, getal, eenheid ? h('span', { class: 'kerncijfer__eenheid' }, eenheid) : null),
    ),
  );
  el.getal = getal;
  return el;
}

// Uitklapkaart: een kaart met een kop die één knop over de volle breedte is (tikvlak minstens 56 px): links een
// optionele icoontegel en het label (of de titel), rechts een korte samenvatting en een chevron die bij open
// een kwartslag draait. De inhoud schuift rustig open (260 ms --ease); dicht is ze echt weg (inert) voor
// toetsenbord en schermlezer. Alles blijft bestaan, dus een open invoerveld verliest zijn focus nooit door
// een nieuwe samenvatting.
// uitklapkaart({ label, titel, samenvatting: string | Node, tegel: { naam, familie, stijl? }, open = false, opWissel(open), id }, ...inhoud)
// → element met .zetOpen(waar), .isOpen() en .zetSamenvatting(tekstOfNode)
export function uitklapkaart(opties = {}, ...inhoud) {
  const { label, titel, samenvatting = '', tegel, open = false, opWissel, id = 'uitklap-' + Math.random().toString(36).slice(2, 8) } = opties;
  const samenEl = h('span', { class: 'uitklap__samenvatting' });
  const zetSamen = (waarde) => {
    if (waarde instanceof Node) samenEl.replaceChildren(waarde);
    else samenEl.textContent = waarde ?? '';
  };
  zetSamen(samenvatting);
  const beeld = tegel ? icoontegel(tegel.naam, tegel.familie, tegel) : null;
  const kop = h(
    'button',
    { type: 'button', class: 'uitklap__kop', 'aria-expanded': String(open), 'aria-controls': id + '-paneel' },
    beeld,
    h('span', { class: 'uitklap__tekst' }, label ? h('span', { class: 'label uitklap__label' }, label) : null, titel ? h('span', { class: 'uitklap__titel' }, titel) : null),
    samenEl,
    h('span', { class: 'uitklap__chevron', 'aria-hidden': 'true' }, begripIcoon('volgende', { grootte: 18 })),
  );
  const paneel = h('div', { class: 'uitklap__paneel', id: id + '-paneel' }, h('div', { class: 'uitklap__binnen' }, h('div', { class: 'uitklap__inhoud' }, ...inhoud)));
  const el = h('div', { class: ['kaart', 'uitklap', open && 'is-open'] }, kop, paneel);
  let staat = Boolean(open);
  const zet = (waar, meld) => {
    staat = Boolean(waar);
    el.classList.toggle('is-open', staat);
    kop.setAttribute('aria-expanded', String(staat));
    paneel.toggleAttribute('inert', !staat);
    if (meld) opWissel?.(staat);
  };
  paneel.toggleAttribute('inert', !staat);
  kop.addEventListener('click', () => {
    tril();
    zet(!staat, true);
  });
  el.zetOpen = (waar) => zet(waar, false);
  el.isOpen = () => staat;
  el.zetSamenvatting = zetSamen;
  return el;
}

// Rij in een kaart: tegel (of foto) links, tekst, iets aan het einde (bv. het uur).
// actie: een actie-icoon van 20 px aan het einde van de rij ({ icoon, stijl?, label, opKlik }).
// rij({ tegel: { naam, familie, stijl? } | Node, titel, tekst?, eind?, actie?, opKlik? })
export function rij(opties) {
  const { tegel, titel, tekst, eind, actie, opKlik, label } = opties;
  const beeld = tegel instanceof Node ? tegel : tegel ? icoontegel(tegel.naam, tegel.familie, tegel) : null;
  const inhoud = [
    beeld,
    h('span', { class: 'rij__tekst' }, h('span', { class: 'rij__titel' }, titel), tekst ? h('span', { class: 'rij__sub' }, tekst) : null),
    eind != null ? h('span', { class: 'rij__eind cijfer' }, eind) : null,
    actie ? icoonknop(actie.icoon, { label: actie.label, opKlik: actie.opKlik, stijl: actie.stijl, klasse: 'rij__actie' }) : null,
  ];
  if (!opKlik) return h('div', { class: 'rij' }, ...inhoud);
  const el = h('button', { type: 'button', class: 'rij rij--knop', 'aria-label': label }, ...inhoud);
  el.addEventListener('click', (e) => {
    tril();
    opKlik(e);
  });
  return el;
}

// ------------------------------------------------------------------ invoer

// Tekstveld: 16 px (iOS zoomt anders in), minstens 48 px hoog.
// tekstveld({ waarde, plaats, label, type, inputmode, opWijzig, naam })
export function tekstveld(opties = {}) {
  const { waarde = '', plaats, label, type = 'text', inputmode, opWijzig, naam, uitgeschakeld = false } = opties;
  const input = h('input', {
    class: 'veld__invoer',
    type,
    value: waarde,
    placeholder: plaats,
    inputmode,
    name: naam,
    'aria-label': label,
    disabled: uitgeschakeld,
    autocomplete: 'off',
  });
  if (opWijzig) input.addEventListener('input', () => opWijzig(input.value));
  return input;
}

// Tekstvak dat meegroeit met de tekst.
export function tekstvak(opties = {}) {
  const { waarde = '', plaats, label, rijen = 3, opWijzig, uitgeschakeld = false } = opties;
  const vak = h('textarea', { class: 'veld__invoer veld__vak', rows: rijen, placeholder: plaats, 'aria-label': label, disabled: uitgeschakeld });
  vak.value = waarde;
  const groei = () => {
    vak.style.height = 'auto';
    vak.style.height = vak.scrollHeight + 'px';
  };
  vak.addEventListener('input', () => {
    groei();
    opWijzig?.(vak.value);
  });
  requestAnimationFrame(groei);
  return vak;
}

// Tijdveld: eigen opmaak op een echte <input type="time">; de kiezer van het toestel opent bij een tik.
// tijdveld({ waarde: 'UU:MM', stap (minuten), opWijzig, label })
export function tijdveld(opties = {}) {
  const { waarde = '', stap = 5, opWijzig, label = t('maaltijd.tijd'), uitgeschakeld = false } = opties;
  const input = h('input', {
    class: 'veld__invoer tijdveld__invoer cijfer',
    type: 'time',
    value: waarde,
    step: stap * 60,
    'aria-label': label,
    disabled: uitgeschakeld,
  });
  input.addEventListener('click', () => {
    try {
      input.showPicker?.();
    } catch {
      /* de kiezer opent alleen na een echte tik; anders blijft het veld gewoon typbaar */
    }
  });
  input.addEventListener('input', () => {
    if (input.value) opWijzig?.(input.value);
  });
  return h('span', { class: 'tijdveld' }, input);
}

// Stapper: min, waarde, plus. Ingedrukt houden herhaalt. Waarde in Cormorant (groot cijfer).
// stapper({ waarde, stap, min, max, opmaak: (n) => string, opWijzig, label })
export function stapper(opties = {}) {
  // raster (BESLISSING 705): de stap brengt je naar het volgende veelvoud van de stap in plaats van de stap op te tellen, en houdt halt op
  // de waarden in stops. Zonder raster werkt de stapper zoals altijd.
  const { waarde = 0, stap = 1, min = -Infinity, max = Infinity, opmaak = String, opWijzig, label, raster = false, stops = [] } = opties;
  let huidig = waarde;
  const getal = h('output', { class: 'stapper__waarde cijfer', 'aria-live': 'polite' });
  const afronden = (n) => Math.round(n * 1e6) / 1e6;

  // Met een label zegt de naam ook waarop de knop werkt ("Eentje minder, Dagdoel"), want zeven stappers op één scherm mogen niet allemaal "Eentje minder" heten.
  const knopNaam = (basis) => (label ? `${basis}, ${label}` : basis);
  const minKnop = h('button', { type: 'button', class: 'stapper__knop', 'aria-label': knopNaam(t('algemeen.min')) }, '-');
  const plusKnop = h('button', { type: 'button', class: 'stapper__knop', 'aria-label': knopNaam(t('algemeen.plus')) }, '+');

  function teken() {
    // De eenheid (ml, l, kg) in een eigen span, zodat ze kleiner en gedempt kan; samen blijft het één leesbare tekst
    const tekst = String(opmaak(huidig));
    const m = /^(.*?)([\s\u00a0]+)([^\d\s\u00a0,.]+)$/.exec(tekst);
    if (m) getal.replaceChildren(m[1], h('span', { class: 'stapper__eenheid' }, m[2] + m[3]));
    else getal.textContent = tekst;
    minKnop.disabled = huidig <= min;
    plusKnop.disabled = huidig >= max;
  }
  function verander(richting) {
    const nieuw = raster ? volgendeStapwaarde(huidig, richting, { stap, min, max, stops }) : Math.min(max, Math.max(min, afronden(huidig + richting * stap)));
    if (nieuw === huidig) return false;
    huidig = nieuw;
    teken();
    opWijzig?.(huidig);
    return true;
  }

  // Ingedrukt houden: eerst één stap, na een korte pauze steeds sneller.
  function houdVast(knopEl, richting) {
    let wacht = null;
    let tikken = null;
    const stop = () => {
      clearTimeout(wacht);
      clearTimeout(tikken);
      wacht = tikken = null;
    };
    const herhaal = (vertraging) => {
      tikken = setTimeout(() => {
        if (!verander(richting)) return stop();
        herhaal(Math.max(60, vertraging - 15));
      }, vertraging);
    };
    knopEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || knopEl.disabled) return;
      tril();
      verander(richting);
      wacht = setTimeout(() => herhaal(140), 420);
    });
    for (const gebeurtenis of ['pointerup', 'pointerleave', 'pointercancel']) knopEl.addEventListener(gebeurtenis, stop);
    knopEl.addEventListener('contextmenu', (e) => e.preventDefault());
    // Toetsenbord: Enter en spatie geven een klik zonder pointerdown (detail 0).
    knopEl.addEventListener('click', (e) => {
      if (e.detail === 0) verander(richting);
    });
  }
  houdVast(minKnop, -1);
  houdVast(plusKnop, 1);

  const el = h('div', { class: 'stapper', role: 'group', 'aria-label': label }, minKnop, getal, plusKnop);
  el.zetWaarde = (n) => {
    huidig = Math.min(max, Math.max(min, n));
    teken();
  };
  teken();
  return el;
}

// Schakelaar: de hele rij is één tikvlak (role="switch").
// schakelaar({ label, uitleg?, aan, opWissel })
export function schakelaar(opties = {}) {
  const { label, uitleg, aan = false, opWissel, uitgeschakeld = false } = opties;
  let stand = aan;
  const el = h(
    'button',
    { type: 'button', class: 'schakelaar', role: 'switch', 'aria-checked': String(stand), disabled: uitgeschakeld },
    h('span', { class: 'schakelaar__tekst' }, h('span', { class: 'schakelaar__label' }, label), uitleg ? h('span', { class: 'schakelaar__uitleg' }, uitleg) : null),
    h('span', { class: 'schakelaar__baan', 'aria-hidden': 'true' }, h('span', { class: 'schakelaar__knop' })),
  );
  el.addEventListener('click', () => {
    stand = !stand;
    el.setAttribute('aria-checked', String(stand));
    tril();
    opWissel?.(stand);
  });
  return el;
}

// Vinkvak: afvinken met een met CSS getekend vinkje (er is geen vinkje-icoon in de huisstijl).
// vinkvak({ label, aan, opWissel })
export function vinkvak(opties = {}) {
  const { label, aan = false, opWissel, uitgeschakeld = false } = opties;
  let stand = aan;
  const el = h(
    'button',
    { type: 'button', class: 'vinkvak', role: 'checkbox', 'aria-checked': String(stand), disabled: uitgeschakeld },
    h('span', { class: 'vinkvak__vak', 'aria-hidden': 'true' }, h('span', { class: 'vinkje' })),
    h('span', { class: 'vinkvak__label' }, label),
  );
  el.addEventListener('click', () => {
    stand = !stand;
    el.setAttribute('aria-checked', String(stand));
    tril();
    opWissel?.(stand);
  });
  return el;
}

// ------------------------------------------------------------------ dialoog en melding (§7)

// De inhoud van het blad onderaan; ook los te tonen (stijlpagina). opKies(true | false)
export function bevestigBlad(opties, opKies) {
  const { titel, tekst, ja = t('algemeen.ja'), nee = t('algemeen.nee'), id = 'dialoog-' + Math.random().toString(36).slice(2, 8) } = opties;
  const neeKnop = knop(nee, { soort: 'secundair', breed: true, opKlik: () => opKies?.(false) });
  neeKnop.setAttribute('autofocus', '');
  return h(
    'div',
    { class: 'dialoog__blad' },
    h('h2', { class: 't-h2 dialoog__titel', id: id + '-titel' }, titel),
    tekst ? h('p', { class: 'dialoog__tekst', id: id + '-tekst' }, tekst) : null,
    h('div', { class: 'dialoog__acties' }, knop(ja, { soort: 'primair', breed: true, opKlik: () => opKies?.(true) }), neeKnop),
  );
}

// Blad onderaan met eigen inhoud, in dezelfde stijl als bevestig: titel, inhoud en knoppen.
// bladInhoud({ titel, inhoud: Node, acties: [Node], id }) → het blad zelf (ook los te tonen, stijlpagina).
// Met kruisje ({ sluitLabel, opSluit }, BESLISSINGEN 419 en 422): een titelrij .blad__kop met links de titel (.blad__titel) en rechts de
// sluitknop (.blad__sluit): een icoonknop met het xmark-icoon uit de huisstijl, zoals de icoonknoppen in de schermkop.
export function bladInhoud({ titel, inhoud, acties = [], id = 'blad-' + Math.random().toString(36).slice(2, 8), sluitLabel = null, opSluit = null } = {}) {
  const titelEl = h('h2', { class: ['t-h2 dialoog__titel', sluitLabel && 'blad__titel'], id: id + '-titel' }, titel);
  return h(
    'div',
    { class: 'dialoog__blad' },
    sluitLabel ? h('div', { class: 'blad__kop' }, titelEl, icoonknop(ICOON.weghalen.naam, { label: sluitLabel, klasse: 'blad__sluit', grootte: 24, opKlik: () => opSluit?.() })) : titelEl,
    inhoud ? h('div', { class: 'dialoog__inhoud' }, inhoud) : null,
    acties.length ? h('div', { class: 'dialoog__acties' }, ...acties) : null,
  );
}

// blad({ titel, inhoud: Node, acties: [knoppen], opSluit, familie })
// Geeft een element met .open() en .sluit(). Binnenin zit een native modale <dialog>: focus is gevangen,
// Escape en een tik naast het blad sluiten, en de focus keert terug naar wat hem had. opSluit() volgt na elke sluiting.
// Elk blad heeft rechts van de titel een kruisje (BESLISSING 422) dat sluit zoals Escape. familie (BESLISSING 422): de kleurfamilie van de kaart die
// het blad opent, als data-familie op de wortel (.blad): 'dagboek' (maaltijd), 'gewicht', 'gezond' (supplement), 'drank', 'algemeen', 'delen'
// (dezelfde namen als de rollen --f-<familie>-* in src/stijl/tabkleur.css). open({ modaal: false }) alleen voor de rondleiding.
export function blad({ titel, inhoud, acties = [], opSluit, sluitLabel = t('algemeen.sluiten'), familie = null } = {}) {
  const id = 'blad-' + Math.random().toString(36).slice(2, 8);
  const dlg = h('dialog', { class: 'dialoog', 'aria-labelledby': id + '-titel' });
  dlg.append(bladInhoud({ titel, inhoud, acties, id, sluitLabel, opSluit: () => houder.sluit() }));
  const houder = h('div', { class: 'blad', dataset: familie ? { familie } : undefined }, dlg);
  let terug = null;
  let terugWacht = null; // AN-07: "terug" (Android, Safari, browserknop) sluit het blad en laat het scherm staan (src/pwa/terug.js)
  houder.open = ({ modaal = true } = {}) => {
    if (dlg.hasAttribute('open')) return;
    terug = document.activeElement;
    if (!houder.isConnected) document.body.append(houder);
    if (modaal) {
      dlg.showModal();
      terugWacht = bewaakTerug({ opTerug: () => (houder.sluit(), true) });
      // De pagina erachter schuift niet mee terwijl het blad open is: dat doet basis.css (:root:has(.blad > dialog:modal), BESLISSING 419).
    } else dlg.show();
  };
  houder.sluit = () => {
    terugWacht?.los();
    terugWacht = null;
    if (dlg.hasAttribute('open')) dlg.close();
    houder.remove();
    if (terug && terug.isConnected) terug.focus?.();
    terug = null;
    opSluit?.();
  };
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    houder.sluit();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) houder.sluit();
  });
  return houder;
}

// Bevestigen: een blad onderaan met --r-lg, focus gevangen (native modale <dialog>), Escape sluit.
// bevestig({ titel, tekst, ja, nee }): Promise<boolean>
export function bevestig(opties) {
  return new Promise((resolve) => {
    const id = 'dialoog-' + Math.random().toString(36).slice(2, 8);
    const dlg = h('dialog', {
      class: 'dialoog',
      'aria-labelledby': id + '-titel',
      'aria-describedby': opties.tekst ? id + '-tekst' : null,
    });
    let klaar = false;
    let terugWacht = null; // AN-07: "terug" antwoordt Nee, zoals Escape (src/pwa/terug.js)
    const af = (antwoord) => {
      if (klaar) return;
      klaar = true;
      terugWacht?.los();
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(antwoord);
    };
    dlg.append(bevestigBlad({ ...opties, id }, af));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      af(false);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) af(false);
    });
    document.body.append(dlg);
    dlg.showModal();
    terugWacht = bewaakTerug({ opTerug: () => (af(false), true) });
  });
}

// Heeft dit venster invoer die nog niet bewaard is (een veld dat anders is dan bij het openen)?
function heeftOnbewaardeInvoer(wortel) {
  for (const el of wortel.querySelectorAll('input, textarea, select')) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked !== el.defaultChecked) return true;
    } else if (el.tagName === 'SELECT') {
      if ([...el.options].some((o) => o.selected !== o.defaultSelected)) return true;
    } else if (el.type !== 'file' && el.value !== el.defaultValue) return true;
  }
  return false;
}

// Sluit elk open venster (blad, bevestiging, supplementkaart) zoals Escape dat doet, behalve een venster met invoer die nog niet
// bewaard is: dat blijft staan, zodat er niets verloren gaat. Gebruikt door de vergrendeling (app.js) voordat de pagina geleegd wordt.
// Geeft het aantal vensters dat bleef staan.
export function sluitAlleBladen() {
  let gebleven = 0;
  for (const dlg of [...document.querySelectorAll('dialog[open]')]) {
    if (heeftOnbewaardeInvoer(dlg)) {
      gebleven += 1;
      continue;
    }
    // De eigen afhandeling van het venster, zoals bij Escape. Houdt het venster zichzelf open (het vraagt bv. eerst of wijzigingen
    // bewaard moeten worden), dan blijft het staan. Heeft het geen eigen afhandeling, dan gaat het dicht zoals de browser dat doet.
    const ev = new Event('cancel', { cancelable: true });
    dlg.dispatchEvent(ev);
    if (!dlg.open) continue;
    if (ev.defaultPrevented) {
      gebleven += 1;
      continue;
    }
    dlg.close();
  }
  return gebleven;
}

// Korte melding onderaan, boven de tabbalk. Eén tegelijk; role="status".
let stroken = null;
let strookTimer = null;

// De melding zelf, ook los te tonen. actie: { label, opKlik }
export function strookElement(tekst, actie) {
  return h(
    'div',
    { class: 'strook' },
    h('span', { class: 'strook__tekst' }, tekst),
    actie
      ? h('button', { type: 'button', class: 'strook__actie', onclick: () => actie.opKlik?.() }, actie.label)
      : null,
  );
}

// strook(tekst, { actie: { label, opKlik }, duur = 3000, vast = false }): duur 0 laat ze staan tot er een nieuwe komt.
// vast (BESLISSING 704): de strook blijft staan tot haar eigen knop getikt wordt. Ze verdwijnt niet vanzelf en een gewone strook
// ("Weggehaald", "Bewaard") schuift erboven in plaats van haar te vervangen. Alleen de melding van een nieuwe versie gebruikt dit:
// die mag niet verdwijnen zonder dat de update gebeurd is. Een tweede vaste strook vervangt de vorige, zodat er er nooit twee staan.
export function strook(tekst, opties = {}) {
  const { actie, duur = 3000, vast = false } = opties;
  if (!stroken) {
    stroken = h('div', { class: 'strokenhouder', role: 'status', 'aria-live': 'polite' });
    document.body.append(stroken);
  }
  const el = strookElement(
    tekst,
    actie && {
      label: actie.label,
      opKlik: () => {
        el.remove();
        actie.opKlik?.();
      },
    },
  );
  if (vast) {
    el.classList.add('strook--vast');
    stroken.querySelector('.strook--vast')?.remove();
    stroken.append(el); // onderaan: een gewone melding komt erboven
    return el;
  }
  clearTimeout(strookTimer);
  stroken.querySelector('.strook:not(.strook--vast)')?.remove();
  stroken.prepend(el);
  if (duur > 0) strookTimer = setTimeout(() => el.remove(), duur);
  return el;
}

// ------------------------------------------------------------------ bladerkop en lege toestand (§6)

// Vorige en volgende dag/week/maand: chevron-left, titel, chevron-right.
// BESLISSING 459: de titel is een datum als kop: de labelvorm (.label, hoofdletters via css) met .datumkop; de h2 blijft de kop voor een schermlezer,
// met een optionele voluit geschreven naam (titelNaam, bv. "Week van 16 tot 22 november" bij de titel "16 - 22 november").
// BESLISSING 489: met titelKort staan er twee vormen in de kop (.bladerkop__vorm--vol en --kort); de css toont er één (op een telefoon de korte,
// componenten.css), zonder meting in JS. Beide zijn aria-hidden: de schermlezer hoort altijd titelNaam, de volle vorm.
// bladerkop({ titel, titelKort?, titelNaam?, label?, opVorige, opVolgende, vorigeUit?, volgendeUit? })
export function bladerkop(opties) {
  const { titel, titelKort, titelNaam, label, opVorige, opVolgende, vorigeUit = false, volgendeUit = false } = opties;
  const inhoud = titelKort
    ? [h('span', { class: 'bladerkop__vorm bladerkop__vorm--vol', 'aria-hidden': 'true' }, titel), h('span', { class: 'bladerkop__vorm bladerkop__vorm--kort', 'aria-hidden': 'true' }, titelKort)]
    : [titel];
  const titelEl = h('h2', { class: 'label datumkop bladerkop__titel', 'aria-label': titelNaam || null }, ...inhoud);
  const el = h(
    'div',
    { class: 'bladerkop' },
    icoonknop('chevron-left', { label: t('algemeen.vorige'), opKlik: opVorige, uit: vorigeUit }),
    h('div', { class: 'bladerkop__midden' }, label ? h('p', { class: 'label' }, label) : null, titelEl),
    icoonknop('chevron-right', { label: t('algemeen.volgende'), opKlik: opVolgende, uit: volgendeUit }),
  );
  el.zetTitel = (tekst) => {
    titelEl.textContent = tekst;
  };
  return el;
}

// De kop van een scherm: links de titel in Cormorant met een optioneel label erboven, rechts de acties en
// (standaard) de huisje-knop: het icoon house zonder tegel, een link naar #/vandaag. Op elk scherm behalve Vandaag.
// schermkop({ titel, label, home = true, acties = [Node] }) → header met .zetTitel(tekst)
export function schermkop({ titel, label, home = true, delen = true, acties = [] } = {}) {
  // De terugknop van een subscherm heet zichtbaar alleen "Algemeen", net als het tabblad: de naam zegt dat hij teruggaat.
  for (const a of acties) {
    if (a?.tagName === 'BUTTON' && !a.hasAttribute('aria-label') && a.textContent.trim() === t('meer.terug')) a.setAttribute('aria-label', `${t('meer.terugNaar')} ${a.textContent.trim()}`);
  }
  const titelEl = h('h1', { class: 't-h1 schermkop__titel' }, titel);
  // De terugknop staat boven de titel, niet bij de icoonknoppen: zo blijven de icoonknoppen naast de titel staan, ook bij een lange titel.
  const terug = acties.filter((a) => a?.classList?.contains('schermkop__terug'));
  const rest = acties.filter((a) => !terug.includes(a));
  const el = h(
    'header',
    { class: ['schermkop', terug.length && 'schermkop--terug'] },
    h(
      'div',
      { class: 'schermkop__tekst' },
      terug.length ? h('div', { class: 'schermkop__terugrij' }, ...terug) : null,
      label ? h('p', { class: 'label' }, label) : null,
      titelEl,
    ),
    rest.length || home || delen
      ? h(
          'div',
          { class: 'schermkop__acties' },
          ...rest,
          // Delen: op een telefoon een icoonknop (geen zevende tab); vanaf 960 px staat het in de zijbalk (CSS verbergt deze dan)
          delen ? h('a', { class: 'icoonknop schermkop__delen', href: '#/delen', 'aria-label': t('delen.titel') }, begripIcoon('delen', { grootte: 24 })) : null,
          home ? h('a', { class: 'icoonknop schermkop__home', href: '#/vandaag', 'aria-label': t('dag.naarVandaag') }, begripIcoon('home', { grootte: 24 })) : null,
        )
      : null,
  );
  el.zetTitel = (tekst) => {
    titelEl.textContent = tekst;
  };
  return el;
}

// Lege toestand: het mono-beeldmerk (64 px, --c-accent-soft) en één zin in Cormorant Italic.
// legeToestand({ tekst, actie?: { label, opKlik } })
export function legeToestand(opties) {
  const { tekst, actie } = opties;
  return h(
    'div',
    { class: 'leeg' },
    schoonMerk(markLicht, 'leeg__merk logo__merk--licht'),
    schoonMerk(markNacht, 'leeg__merk logo__merk--nacht'),
    h('p', { class: 'leeg__tekst t-cursief' }, tekst),
    actie ? knop(actie.label, { soort: 'tekst', opKlik: actie.opKlik }) : null,
  );
}

// ------------------------------------------------------------------ gevoelschaal (§5.2)

const GEVOEL_ICONEN = ['face-tired', 'face-meh', 'face-smile', 'face-grin-beam', 'face-grin-hearts'];

// Vijf gezichtjes (Font Awesome regular). Niet gekozen: icoon in --c-text-muted. Gekozen: ronde tegel in
// de -soft-kleur, icoon in de stapkleur, schaal 1 → 1,08. Nog eens tikken op de gekozen stap wist de keuze.
// gevoelschaal({ waarde: 1..5|null, opKies: (waarde|null) => void, alleenLezen?, soort?: 'gevoel'|'stemming', label? })
export function gevoelschaal(opties = {}) {
  const { waarde = null, opKies, alleenLezen = false, soort = 'gevoel', label = t(soort + '.vraag') } = opties;
  let huidig = waarde;
  const groep = h('div', {
    class: ['gevoel', alleenLezen && 'gevoel--alleenlezen'],
    role: 'radiogroup',
    'aria-label': label,
    'aria-readonly': alleenLezen ? 'true' : null,
  });
  const knoppen = GEVOEL_ICONEN.map((naam, i) =>
    h(
      'button',
      { type: 'button', class: 'gevoel__optie', role: 'radio', dataset: { stap: i + 1 }, disabled: alleenLezen, onclick: () => kies(i + 1) },
      h('span', { class: 'gevoel__tegel' }, icoon(naam, { grootte: 26, stijl: 'regular' })),
      h('span', { class: 'gevoel__label' }, t(soort + '.' + (i + 1))),
    ),
  );
  function teken() {
    knoppen.forEach((b, i) => {
      const aan = huidig === i + 1;
      b.classList.toggle('is-gekozen', aan);
      b.setAttribute('aria-checked', String(aan));
      b.tabIndex = aan || (huidig == null && i === 0) ? 0 : -1;
    });
  }
  function kies(n) {
    huidig = huidig === n ? null : n; // nog eens tikken wist de keuze
    tril();
    teken();
    opKies?.(huidig);
  }
  radioToetsen(groep, knoppen, kies);
  groep.append(...knoppen);
  teken();
  groep.zetWaarde = (n) => {
    huidig = n;
    teken();
  };
  return groep;
}

// ------------------------------------------------------------------ energieschaal (§5.3)

const energieHoogtes = ['.7', '.775', '.85', '.925', '1'];

// Vijf blaadjes uit het logo, van klein naar groot (70 / 77,5 / 85 / 92,5 / 100 % van --energy-leaf-h),
// onderaan uitgelijnd. Gevuld = --energy-on, leeg = --energy-off. Alleen tonen.
// energieschaal({ waarde: 1..5|null, label? })
export function energieschaal(opties = {}) {
  const { waarde = null, label } = opties;
  const el = h('span', {
    class: 'energie',
    role: waarde ? 'img' : null,
    'aria-label': waarde ? (label ?? `${t('energie.titel')}: ${t('energie.' + waarde)}`) : null,
    'aria-hidden': waarde ? null : 'true',
  });
  energieHoogtes.forEach((hoogte, i) => {
    el.append(h('span', { class: ['energie__blad', i < waarde && 'is-gevuld'], style: { '--h': hoogte } }, bladje()));
  });
  el.zetWaarde = (n) => {
    [...el.children].forEach((blad, i) => blad.classList.toggle('is-gevuld', i < n));
  };
  return el;
}

// Kiezer: elk blaadje is een tikvlak van 44 x 48. Tikken op blaadje 4 vult 1 t.e.m. 4, met een korte
// groei-animatie (schaal 0,8 → 1 in 260 ms) en een trilling. Nog eens tikken op de gekozen stap wist de keuze.
// energiekiezer({ waarde, opKies: (waarde|null) => void, alleenLezen?, label? })
export function energiekiezer(opties = {}) {
  const { waarde = null, opKies, alleenLezen = false, label = t('energie.vraag'), woorden = false } = opties;
  let huidig = waarde;
  const groep = h('div', {
    class: ['energie', 'energie--kiezer', alleenLezen && 'energie--alleenlezen', woorden && 'energie--woorden'],
    role: 'radiogroup',
    'aria-label': label,
    'aria-readonly': alleenLezen ? 'true' : null,
  });
  const knoppen = energieHoogtes.map((hoogte, i) =>
    h(
      'button',
      {
        type: 'button',
        class: 'energie__tik',
        role: 'radio',
        'aria-label': t('energie.' + (i + 1)),
        disabled: alleenLezen,
        onclick: () => kies(i + 1),
      },
      h('span', { class: 'energie__blad', style: { '--h': hoogte } }, bladje()),
      woorden ? h('span', { class: 'energie__woord' }, t('energie.' + (i + 1))) : null,
    ),
  );
  function teken(groei) {
    knoppen.forEach((b, i) => {
      const vol = i < huidig;
      const blad = b.firstElementChild;
      blad.classList.toggle('is-gevuld', vol);
      b.setAttribute('aria-checked', String(huidig === i + 1));
      b.tabIndex = huidig === i + 1 || (huidig == null && i === 0) ? 0 : -1;
      if (groei && vol) {
        blad.classList.remove('is-groei');
        void blad.offsetWidth; // opnieuw starten
        blad.classList.add('is-groei');
      }
    });
  }
  function kies(n) {
    const wissen = huidig === n;
    huidig = wissen ? null : n;
    tril();
    teken(!wissen);
    opKies?.(huidig);
  }
  radioToetsen(groep, knoppen, kies);
  knoppen.forEach((b) => b.firstElementChild.addEventListener('animationend', (e) => e.currentTarget.classList.remove('is-groei')));
  groep.append(...knoppen);
  teken(false);
  groep.zetWaarde = (n) => {
    huidig = n;
    teken(false);
  };
  return groep;
}

// Energiekaart (voorbeeld-energiekaart.png): links het label ENERGIE met eronder het woord in Cormorant
// Italic 32 px, rechts de blaadjes. Met opKies is de kaart een kiezer, anders toont ze alleen.
// energiekaart({ waarde, opKies?, alleenLezen? })
export function energiekaart(opties = {}) {
  const { waarde = null, opKies, alleenLezen = false } = opties;
  const woord = h('p', { class: ['energiekaart__woord', 't-cursief', waarde == null && 'is-leeg'] }, waarde ? t('energie.' + waarde) : t('energie.geen'));
  const interactief = opKies && !alleenLezen;
  const schaalEl = interactief
    ? energiekiezer({
        waarde,
        opKies: (n) => {
          woord.textContent = n ? t('energie.' + n) : t('energie.geen');
          woord.classList.toggle('is-leeg', n == null);
          opKies(n);
        },
      })
    : energieschaal({ waarde });
  return kaart(
    { klasse: 'energiekaart kaart--licht-op' },
    h('div', { class: 'energiekaart__links' }, h('p', { class: 'label' }, t('energie.titel')), woord),
    h('div', { class: ['energiekaart__rechts', !interactief && 'energiekaart__rechts--tonen'] }, schaalEl),
  );
}

// ------------------------------------------------------------------ tabbalk en zijbalk (§7)

export const TABS = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer'];
// Elk tabblad heeft het icoon van zijn begrip (iconenkaart.js) in de kleur van zijn familie, zonder tegel (HUISSTIJL §5.1): Drinken mist,
// Supplementen salie, Gewicht en Meer neutraal; Vandaag en Dagboek in het accent.
// Zeven tabbladen, zeven kleuren (BESLISSING 181): pruim, kasjmier, mist, salie, duifblauw, neutraal (Algemeen) en aubergine (Delen).
const NAV_KLEUR = { vandaag: 'dag', dagboek: 'dagboek', drinken: 'drank', supplementen: 'gezondheid', gewicht: 'gewicht', meer: 'neutraal', delen: 'delen' };
// Het tabblad Meer heet nu Algemeen (BESLISSING 178): de route blijft, het begrip is algemeen. Een onbekend begrip laat het menu nooit crashen.
const TAB_BEGRIP = { meer: 'algemeen' };
function navIcoon(begrip, tab = begrip) {
  const b = TAB_BEGRIP[begrip] ?? begrip;
  const bekend = Boolean(ICOON[b]);
  return h('span', { class: ['navicoon', 'navicoon--' + (NAV_KLEUR[tab] ?? (bekend ? ICOON[b].familie : 'neutraal'))] }, bekend ? begripIcoon(b, { grootte: 20 }) : icoon('ellipsis', { grootte: 20 }));
}
// Elke tab heeft één label, in de tabbalk en in de zijbalk hetzelfde (BESLISSING 325: overal "Supplementen"); de tabbalk maakt zijn tabs gelijk smal in layout.css.
function tabLabel(tab) {
  return t('tab.' + tab);
}

function navLinks(klasse, { actief, voorbeeld }) {
  const links = {};
  for (const tab of TABS) {
    const a = h(
      'a',
      { class: [klasse + '__item', klasse + '__item--' + tab], href: '#/' + tab, 'data-kleur': NAV_KLEUR[tab], 'aria-current': tab === actief ? 'page' : null },
      // Het tabblad met route 'meer' heet Algemeen; zijn begrip in de iconenkaart is 'algemeen' (noodherstel teamlead, 13 nov).
      navIcoon(tab),
      h('span', { class: klasse + '__label' }, tabLabel(tab)),
    );
    if (voorbeeld) a.addEventListener('click', (e) => e.preventDefault());
    links[tab] = a;
  }
  return links;
}

// Tabbalk voor de telefoon: wit met 1 px bovenlijn, icoon + label 11 px; actief = oudroze icoon. Onder 720 px laat layout.css
// Algemeen weg (vijf tabs, het tandwiel op Vandaag is daar de ingang); op een tablet staan alle zes de tabs er gewoon.
// en een stipje van 4 px eronder. Hoogte 64 + safe-area. Geeft { el, links } (links per tabnaam).
// tabbalk({ actief: 'vandaag'|...|null, voorbeeld?: boolean }), voorbeeld: tikken navigeert niet
export function tabbalk({ actief = null, voorbeeld = false } = {}) {
  const links = navLinks('tabbalk', { actief, voorbeeld });
  const el = h('nav', { class: 'tabbalk', 'aria-label': t('tab.menu') }, ...Object.values(links));
  return { el, links };
}

// Zijbalk vanaf 960 px: dezelfde zes items verticaal, logo bovenaan, breedte 248 (--rail-width).
// zijbalk({ actief, voorbeeld }) → { el, links }
export function zijbalk({ actief = null, voorbeeld = false } = {}) {
  const links = navLinks('zijbalk', { actief, voorbeeld });
  // Delen is een actie, geen dagelijks tabblad: eigen item onderaan, gescheiden van de zes tabs
  const delenLink = h('a', { class: 'zijbalk__item', href: '#/delen', 'data-kleur': NAV_KLEUR.delen, 'aria-current': actief === 'delen' ? 'page' : null }, navIcoon('delen'), h('span', { class: 'zijbalk__label' }, t('delen.titel')));
  if (voorbeeld) delenLink.addEventListener('click', (e) => e.preventDefault());
  links.delen = delenLink;
  const zijLogo = logo({ grootte: 28, link: true });
  if (voorbeeld) zijLogo.addEventListener('click', (e) => e.preventDefault());
  const el = h(
    'nav',
    { class: 'zijbalk', 'aria-label': t('tab.menu') },
    h('div', { class: 'zijbalk__logo' }, zijLogo),
    h('div', { class: 'zijbalk__lijst' }, ...TABS.map((tab) => links[tab])),
    h('div', { class: 'zijbalk__extra' }, delenLink),
  );
  return { el, links };
}

// De schermkop plakt op een telefoon bovenaan (CSS); zodra er gescrold is krijgt hij een fijne lijn (.is-gescrold). Eén luisteraar voor alle koppen.
if (typeof window !== 'undefined' && !window.__schermkopLuister) {
  window.__schermkopLuister = true;
  const zet = () => {
    const gescrold = window.scrollY > 4;
    document.querySelectorAll('.schermkop').forEach((k) => k.classList.toggle('is-gescrold', gescrold));
  };
  window.addEventListener('scroll', zet, { passive: true });
  window.addEventListener('hashchange', () => setTimeout(zet, 0));
}
