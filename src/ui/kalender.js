// Kleine kalender (E2): per dag het dagcijfer, een salie bolletje als alle supplementmomenten van die dag zijn afgevinkt
// en het teken van een geplande beurt. Geen raster, geen celranden,
// geen bolletje zonder alle momenten, geen aparte kleur voor lege dagen. Week begint op maandag.
import { h, svg } from './dom.js';
import { t } from '../teksten.js';
import { maandRaster, naarDatum, opmaakDatum, vandaag } from '../kern/datum.js';
import { begripIcoon } from './iconenkaart.js';
import { standVanDag } from './maandkalender.js';

const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

// kalender({ jaarMaand: 'JJJJ-MM', gegevens: { [datum]: { supplementMomenten: { klaar, totaal }, spuit: [{ naam, status }] } }, gekozen, opKies(datum) })
// spuit: de geplande beurten van periodieke supplementen (agenda.js), ook op toekomstige dagen: een klein spuitje in salie, naast het salie bolletje onder het cijfer.
// navigatie (optioneel, standaard uit): de kalender is een kaart die naar het Dagboek leidt (Vandaag), geen keuzelijst: het label noemt de volledige
// weekdag en "vandaag" (zaterdag 14 november, vandaag) en de dagen hebben geen aria-pressed. Zonder deze optie is niets veranderd.
// Geeft een element met .kies(datum) om de aangetikte dag te markeren zonder hertekenen.
export function kalender({ jaarMaand, gegevens = {}, gekozen = null, opKies, navigatie = false }) {
  const nu = vandaag();
  const knoppen = new Map();

  const kop = h(
    'div',
    { class: 'kalender__week kalender__kop', 'aria-hidden': 'true' },
    ...DAGNAMEN.map((d) => h('span', { class: 'label kalender__dagnaam' }, d)),
  );

  const rijen = maandRaster(jaarMaand).map((week) =>
    h(
      'div',
      { class: 'kalender__week' },
      ...week.map((datum) => {
        if (!datum) return h('span', { class: 'kalender__leeg', 'aria-hidden': 'true' });
        const g = gegevens[datum] ?? {};
        const klaar = datum <= nu && standVanDag(g).supplementen === 'vol'; // alle momenten afgevinkt: dezelfde regel als het salie bolletje in Deze week (BESLISSING 219)
        const beschrijving = [
          navigatie ? opmaakDatum(datum, 'lang') : `${naarDatum(datum).getDate()} ${opmaakDatum(datum, 'maand').split(' ')[0]}`,
          navigatie && datum === nu ? t('vandaag.kalenderVandaag') : null,
          klaar ? t('maand.ariaSupplementenAlle') : null,
          ...(g.spuit ?? []).map((x) => t(x.status === 'afgevinkt' ? 'agenda.ariaAfgevinkt' : x.status === 'gepland' ? 'agenda.ariaGepland' : 'agenda.ariaNiet', { naam: x.naam })),
        ]
          .filter(Boolean)
          .join(', ');
        const knop = h(
          'button',
          {
            type: 'button',
            class: ['kalender__dag', datum === nu && 'is-vandaag', datum > nu && 'is-toekomst'],
            dataset: { datum },
            'aria-label': beschrijving,
            ...(navigatie ? {} : { 'aria-pressed': String(datum === gekozen) }),
            onclick: () => opKies?.(datum),
          },
          h('span', { class: 'kalender__nr cijfer' }, opmaakDatum(datum, 'dag')),
          // Het groepje onder het cijfer, exact gecentreerd onder het cijfer en op één horizontale lijn: het salie bolletje (alle supplementen genomen) en/of het teken
          // van een geplande beurt (BESLISSING 210); bij twee tekens staat het paar samen gecentreerd.
          // Twee beurten op één dag: één teken met een klein getal, zodat de cel niet te smal wordt.
          klaar || g.spuit?.length
            ? h(
                'span',
                { class: 'kalender__tekens' },
                klaar ? h('span', { class: 'kalender__plek kalender__plek--bol' }, h('span', { class: 'kalender__klaar', 'aria-hidden': 'true' })) : null,
                g.spuit?.length
                  ? h(
                      'span',
                      { class: 'kalender__plek kalender__plek--spuit' },
                      h(
                        'span',
                        { class: ['kalender__spuit', 'is-' + (g.spuit.some((x) => x.status === 'gepland') ? 'gepland' : g.spuit.every((x) => x.status === 'afgevinkt') ? 'afgevinkt' : 'gemist')], 'aria-hidden': 'true' },
                        begripIcoon(g.spuit.some((x) => x.spuit) ? 'spuit' : 'supplementen', { grootte: 12 }), // spuitje alleen als "spuit" of "injectie" in de naam staat (BESLISSING 275)
                        g.spuit.length > 1 ? h('span', { class: 'kalender__aantal' }, String(g.spuit.length)) : null,
                      ),
                    )
                  : null,
              )
            : null,
        );
        if (datum === gekozen) knop.classList.add('is-gekozen');
        knoppen.set(datum, knop);
        return knop;
      }),
    ),
  );

  const el = h('div', { class: 'kalender', role: 'group', 'aria-label': opmaakDatum(jaarMaand, 'maand') }, kop, ...rijen);
  el.kies = (datum) => {
    for (const [d, knop] of knoppen) {
      knop.classList.toggle('is-gekozen', d === datum);
      knop.setAttribute('aria-pressed', String(d === datum));
    }
  };
  return el;
}
