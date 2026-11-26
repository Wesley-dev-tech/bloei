// De maandkalender van het Dagboek (BESLISSING 255, herzien; 294): rustige cellen met het dagnummer, een salie bolletje als alle supplementmomenten zijn afgevinkt en een
// eventueel spuitje van een geplande beurt. Eten, drinken en supplementen staan in het paneel van de gekozen dag. De kalender op Vandaag gebruikt een andere, compacte component
// (kalender.js) en blijft ongemoeid.
// maandkalender({ jaarMaand, gegevens: { [datum]: { maaltijden, ml, supplementMomenten: { klaar, totaal }, spuit: [{ naam, status }] } },
//                 doelMl, gekozen, opKies(datum) }) → een raster met .kies(datum)
import { h } from './dom.js';
import { t } from '../teksten.js';
import { maandRaster, opmaakDatum, plusDagen, vandaag } from '../kern/datum.js';
import { begripIcoon } from './iconenkaart.js';

const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const MAALTIJDEN_PER_DAG = 6;

// De stand van een dag per onderdeel, ook voor de beschrijving in woorden.
export function standVanDag(g = {}, doelMl = 2500) {
  const m = g.supplementMomenten ?? { klaar: 0, totaal: 0 };
  const spuit = g.spuit ?? [];
  return {
    maaltijden: g.maaltijden ?? 0,
    drinken: (g.ml ?? 0) >= doelMl && (g.ml ?? 0) > 0 ? 'vol' : (g.ml ?? 0) > 0 ? 'deel' : 'leeg',
    supplementen: m.totaal > 0 && m.klaar >= m.totaal ? 'vol' : m.klaar > 0 ? 'deel' : 'leeg',
    momenten: m,
    soort: spuit.some((x) => x.spuit) ? 'spuit' : 'beurt', // het teken van de dag: spuitje alleen bij een spuit, anders het supplement-icoon (BESLISSING 275)
    spuit:!spuit.length ? null : spuit.some((x) => x.status === 'gepland') ? 'gepland' : spuit.every((x) => x.status === 'afgevinkt') ? 'afgevinkt' : 'voorbij',
  };
}

function beschrijfDag(datum, g, doelMl, nu = vandaag()) {
  const s = standVanDag(g, doelMl);
  const delen = [opmaakDatum(datum, 'lang'), datum === nu ? t('maand.ariaVandaag') : null];
  if (datum <= nu) {
    if (s.maaltijden) delen.push(t('maand.ariaMaaltijden', { aantal: s.maaltijden, totaal: MAALTIJDEN_PER_DAG }));
    if (s.drinken === 'vol') delen.push(t('maand.ariaDrinkdoel'));
    else if (s.drinken === 'deel') delen.push(t('maand.ariaDrinkDeel'));
    if (s.supplementen === 'vol') delen.push(t('maand.ariaSupplementenAlle'));
    else if (s.supplementen === 'deel') delen.push(t('maand.ariaSupplementenDeel', { klaar: s.momenten.klaar, totaal: s.momenten.totaal }));
    if (!s.maaltijden && s.drinken === 'leeg' && s.supplementen === 'leeg') delen.push(t('maand.ariaNiets'));
  }
  if (s.spuit) delen.push(s.soort === 'spuit' ? { gepland: t('maand.ariaSpuitGepland'), afgevinkt: t('maand.ariaSpuitAfgevinkt'), voorbij: t('maand.ariaSpuitVoorbij') }[s.spuit] : { gepland: t('maand.ariaBeurtGepland'), afgevinkt: t('maand.ariaBeurtAfgevinkt'), voorbij: t('maand.ariaBeurtVoorbij') }[s.spuit]);
  return delen.filter(Boolean).join(', ');
}

// Een rustige cel (BESLISSING 255, herzien; 294): het dagnummer, het salie bolletje van een dag met alle momenten afgevinkt en, als het er is, het spuitje van een geplande
// beurt.
// Eten, drinken en supplementen staan in het paneel van de gekozen dag, niet in de cel.
function dagCel(datum, g, doelMl, nu) {
  const s = standVanDag(g, doelMl);
  const gevuld = datum <= nu && 'maaltijden' in g; // leesMaand geeft elke bijgehouden dag met dit veld; een dag met alleen een geplande beurt heeft het niet
  return [
    h('span', { class: 'mk__nr cijfer' }, opmaakDatum(datum, 'dag')),
    h(
      'span',
      { class: 'mk__tekens', 'aria-hidden': 'true' },
      // Op één lijn onder het nummer, op dezelfde linkerlijn als het nummer (op een telefoon samen gecentreerd): het salie bolletje (alle supplementmomenten afgevinkt),
      // dan het spuitje of pilletje van een geplande beurt.
      gevuld && s.supplementen === 'vol' ? h('span', { class: 'mk__plek mk__plek--bol' }, h('span', { class: 'mk__klaar' })) : null,
      s.spuit ? h('span', { class: 'mk__plek mk__plek--spuit mk__spuitplek' }, h('span', { class: ['kalender__spuit', 'mk__spuit', 'is-' + (s.spuit === 'voorbij' ? 'gemist' : s.spuit)] }, begripIcoon(s.soort === 'beurt' ? 'supplementen' : 'spuit', { grootte: 16 }), (g.spuit?.length ?? 0) > 1 ? h('span', { class: 'kalender__aantal' }, String(g.spuit.length)) : null)) : null,
    ),
  ];
}

export function maandkalender({ jaarMaand, gegevens = {}, doelMl = 2500, gekozen = null, opKies }) {
  const nu = vandaag();
  const knoppen = new Map();
  const maand = maandRaster(jaarMaand);
  const eersteDatum = maand[0].find(Boolean);
  const laatsteDatum = maand.at(-1).findLast(Boolean);
  const start = gekozen && knoppenStart(gekozen) ? gekozen : jaarMaand === nu.slice(0, 7) ? nu : eersteDatum;
  function knoppenStart(d) {
    return d >= eersteDatum && d <= laatsteDatum;
  }

  const kop = h(
    'div',
    { class: 'mk__week mk__kop', role: 'row' },
    ...DAGNAMEN.map((d) => h('span', { class: 'label mk__dagnaam', role: 'columnheader' }, d)),
  );

  const rijen = maand.map((week) =>
    h(
      'div',
      { class: 'mk__week', role: 'row' },
      ...week.map((datum) => {
        if (!datum) return h('span', { class: 'mk__leeg', role: 'gridcell', 'aria-hidden': 'true' });
        const g = gegevens[datum] ?? {};
        const knop = h(
          'button',
          {
            type: 'button',
            class: ['mk__dag', datum === nu && 'is-vandaag', datum > nu && 'is-toekomst', datum === gekozen && 'is-gekozen'],
            dataset: { datum },
            tabindex: datum === start ? '0' : '-1',
            'aria-label': beschrijfDag(datum, g, doelMl, nu),
            'aria-pressed': String(datum === gekozen),
            'aria-current': datum === nu ? 'date' : null,
            onclick: () => opKies?.(datum),
            onkeydown: (e) => {
              const stap = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
              if (!stap) return;
              const doel = plusDagen(datum, stap);
              if (!knoppen.has(doel)) return;
              e.preventDefault();
              e.stopPropagation(); // de pijltjes van het Dagboek bladeren anders naar een andere maand
              for (const k of knoppen.values()) k.tabIndex = -1;
              knoppen.get(doel).tabIndex = 0;
              knoppen.get(doel).focus();
            },
          },
          ...dagCel(datum, g, doelMl, nu),
        );
        knoppen.set(datum, knop);
        return h('div', { class: 'mk__cel', role: 'gridcell' }, knop);
      }),
    ),
  );

  const el = h('div', { class: 'mk', role: 'grid', 'aria-label': opmaakDatum(jaarMaand, 'maand') }, kop, ...rijen);
  el.kies = (datum) => {
    for (const [d, knop] of knoppen) {
      knop.classList.toggle('is-gekozen', d === datum);
      knop.setAttribute('aria-pressed', String(d === datum));
    }
  };
  return el;
}
