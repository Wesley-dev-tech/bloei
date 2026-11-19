// Beeldonderdelen volgens HUISSTIJL §6: maaltijdfoto, miniatuur, profielfoto en badge-tegel.
// Geen illustraties: zonder foto komt de icoontegel op dezelfde plek en in dezelfde maat.
import { h } from './dom.js';
import { icoontegel } from './componenten.js';
import { icoon } from './iconen.js';
import { t } from '../teksten.js';
import { initiaalVan } from '../logica/naam.js';

// Maaltijdmoment en drank naar icoon (HUISSTIJL §5). De lijst kent geen eigen icoon voor frisdrank: frisdrank houdt bottle-water.
// "Kan water" draagt de eigen tekening van een kan (BESLISSING 702, src/iconen/eigen/kan-water.svg), "Glas water" het glas:
// twee groottes, twee beelden, nooit hetzelfde icoon naast elkaar in dezelfde rij.
export const MAALTIJDICOON = {
  ontbijt: 'mug-saucer',
  tussendoortje: 'apple-whole',
  middagmaal: 'bowl-food',
  vieruurtje: 'cookie-bite',
  avondmaal: 'utensils',
  latesnack: 'moon',
};
export const DRANKICOON = {
  water: 'eigen/kan-water',
  thee: 'mug-hot',
  koffie: 'mug-saucer',
  sap: 'lemon',
  frisdrank: 'bottle-water',
  anders: 'glass-water',
};

// Maaltijdfoto in de kaart: 4:3, object-fit cover, radius --photo-radius, haarlijn --photo-ring.
// Staat er tekst op, dan altijd over --photo-tint. Geen filters op de foto zelf.
// foto({ url, alt, tekst })
export function foto({ url, alt = '', tekst } = {}) {
  return h(
    'figure',
    { class: ['foto', tekst && 'foto--tekst'] },
    url ? h('img', { class: 'foto__beeld', src: url, alt, loading: 'lazy', decoding: 'async' }) : null,
    h('span', { class: 'foto__ring', 'aria-hidden': 'true' }),
    tekst ? h('span', { class: 'foto__tint', 'aria-hidden': 'true' }) : null,
    tekst ? h('figcaption', { class: 'foto__tekst' }, tekst) : null,
  );
}

// Miniatuur in een lijst: 1:1, 56 px, radius 12. Zonder url: de maaltijdtegel (poederroze, oudroze icoon
// van dat moment) op dezelfde plek en in dezelfde maat, zodat de lijst strak uitlijnt.
// soort: ontbijt | tussendoortje | middagmaal | vieruurtje | avondmaal | latesnack
// miniatuur({ url, alt, soort })
export function miniatuur({ url, alt = '', soort = 'ontbijt' } = {}) {
  if (!url) {
    const tegel = icoontegel(MAALTIJDICOON[soort] || MAALTIJDICOON.ontbijt, 'maaltijd', { groot: true });
    tegel.classList.add('miniatuur', 'miniatuur--tegel');
    return tegel;
  }
  return h('span', { class: 'miniatuur' }, h('img', { class: 'miniatuur__beeld', src: url, alt, loading: 'lazy', decoding: 'async' }), h('span', { class: 'foto__ring', 'aria-hidden': 'true' }));
}

// Profielfoto: rond, ring 2 px --c-bg plus 1 px --c-line. Zonder foto de initiaal in Cormorant 600 op poederroze.
// Zonder foto én zonder naam: een neutraal gebruikersicoon in plaats van een letter.
// profielfoto({ url, naam, grootte = 40 })
export function profielfoto({ url, naam = '', grootte = 40 } = {}) {
  const kaleNaam = String(naam ?? '').trim();
  const initiaal = initiaalVan(kaleNaam);
  return h(
    'span',
    { class: ['profielfoto', !url && 'profielfoto--initiaal'], style: { '--pf': grootte + 'px' } },
    url
      ? h('img', { class: 'profielfoto__beeld', src: url, alt: kaleNaam || t('profiel.fotoAlt') })
      : initiaal
        ? h('span', { class: 'profielfoto__letter', 'aria-hidden': 'true' }, initiaal)
        : h('span', { class: 'profielfoto__icoon', 'aria-hidden': 'true' }, icoon('user', { grootte: Math.round(grootte * 0.5) })),
  );
}

// Badge: saliegroene tegel van 56 px met seedling of award. Nog niet behaald: neutrale tegel met het icoon
// op 40% dekking, nooit grijs uitgevaagd met een slotje.
// badgeTegel({ icoon: 'seedling' | 'award', behaald, label })
export function badgeTegel({ icoon = 'award', behaald = false, label } = {}) {
  const tegel = icoontegel(icoon, behaald ? 'gezondheid' : 'neutraal', { groot: true, gedimd: !behaald });
  tegel.classList.add('badgetegel');
  if (label) {
    tegel.setAttribute('role', 'img');
    tegel.setAttribute('aria-label', label);
  }
  return tegel;
}
