// Supplementen per moment van de dag (PLAN.md §16.12): op het tabblad Supplementen staan ze als leeslijst (BESLISSING 213): niets afvinken, een tik op een
// supplement opent zijn kaart. De kaart van één moment en de kaart "Vandaag ook te doen" voor periodieke supplementen. Afvinken gebeurt op Vandaag.
import { h } from '../ui/dom.js';
import { begripTegel, begripIcoon } from '../ui/iconenkaart.js';
import { kaart } from '../ui/componenten.js';
import { rij } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { opmaakDatum } from '../kern/datum.js';

// "3 van 11" voor de items van één moment.
export function standVan(items) {
  const genomen = items.filter((i) => i.genomen).length;
  return { genomen, totaal: items.length, tekst: t('supplementen.momentStand', { genomen, totaal: items.length }) };
}

// Het ritme in gewone taal: 'Elke maand', 'Om de 14 dagen'; niets voor een dagelijks supplement.
export function ritmeTekst(ritme) {
  if (ritme?.soort === 'maand') return t('supplementen.ritmeWoordMaand');
  if (ritme?.soort === 'interval') return t('supplementen.ritmeWoordInterval', { dagen: ritme.dagen });
  return '';
}

// Eén supplement als rij: naam, hoeveelheid en aanwijzing. Met opOpen is de rij één knop die de supplementkaart opent (aria-haspopup="dialog");
// zonder is ze een gewone rij (het voorbeeld in de lege toestand).
function supplementRij({ supplement, extra = '', opOpen = null }) {
  const toelichting = [supplement.hoeveelheid, supplement.aanwijzing].filter(Boolean).join(' · ');
  const tekst = [toelichting, extra].filter(Boolean).join(' · ');
  const el = rij({
    tegel: begripTegel('supplementen', { groot: true }),
    titel: supplement.naam,
    tekst: tekst || null,
    eind: opOpen ? h('span', { class: 'rij__pijl', 'aria-hidden': 'true' }, begripIcoon('bewerken', { grootte: 16 })) : null,
    label: opOpen ? t('supplementen.bewerkDit', { naam: supplement.naam }) : undefined,
    opKlik: opOpen ? () => opOpen(supplement.id, el) : undefined,
  });
  el.classList.add('afvinkrij', 'supplementrij');
  el.dataset.id = supplement.id;
  if (opOpen) el.setAttribute('aria-haspopup', 'dialog');
  return el;
}

// De kaart van één moment als leeslijst: de kop met "Nu" (het moment dat loopt) en, als het moment vandaag is afgevinkt, "Genomen om ... uur".
// tijd is het tijdstip als tekst ("8.15") of null.
export function momentKaart({ moment, items, isNu = false, tijd = null, opOpen = null }) {
  const stand = standVan(items);
  const klaar = stand.totaal > 0 && stand.genomen === stand.totaal;
  return kaart(
    { klasse: ['momentkaart', isNu && 'is-nu'].filter(Boolean).join(' '), dataset: { moment } },
    h(
      'div',
      { class: 'kaartkop momentkop' },
      begripTegel('supplementen'),
      h('div', { class: 'momentkop__tekst' }, h('span', { class: 'label' }, t('supplementen.moment.' + moment))),
      klaar && tijd ? h('span', { class: 'momentkop__stand' }, t('supplementen.genomenOm', { tijd })) : isNu ? h('span', { class: 'momentkop__stand momentkop__nu' }, t('supplementen.nuLabel')) : null,
    ),
    h('div', { class: 'afvinklijst' }, ...items.map((i) => supplementRij({ supplement: i.supplement, opOpen }))),
  );
}

// De kaart "Vandaag ook te doen": periodieke supplementen die vandaag aan de beurt zijn (of die dag afgevinkt werden).
// Wat nog te doen is, vink je af in het Dagboek (BESLISSING 213): onder de rij staat één link naar die dag. Geen kaart als er niets te doen is.
export function beurtKaart({ periodiek, datum, opOpen = null }) {
  const rijen = periodiek.filter((p) => p.aanDeBeurt || p.genomen);
  if (!rijen.length) return null;
  return kaart(
    { klasse: 'beurtkaart', 'data-uitleg': 'aan-de-beurt' },
    h('div', { class: 'kaartkop momentkop' }, begripTegel('supplementen'), h('div', { class: 'momentkop__tekst' }, h('span', { class: 'label' }, t('supplementen.aanDeBeurt')))),
    h(
      'div',
      { class: 'afvinklijst beurtlijst' },
      ...rijen.map((p) =>
        h(
          'div',
          { class: 'beurtblok' },
          supplementRij({ supplement: p.supplement, extra: [ritmeTekst(p.supplement.ritme), p.genomen ? t('supplementen.beurtGenomen') : ''].filter(Boolean).join(' · '), opOpen }),
          p.genomen
            ? null
            : h('a', { class: 'beurtblok__link pijllink', href: '#/dagboek/dag/' + (p.beurtDatum ?? datum), 'aria-label': t('supplementen.afvinkenDagboekLabel', { naam: p.supplement.naam }) }, t('supplementen.afvinkenDagboek'), h('span', { class: 'beurtblok__pijl pijllink__pijl', 'aria-hidden': 'true' }, begripIcoon('volgende', { grootte: 10 }))),
        ),
      ),
    ),
  );
}

// De kaart "Binnenkort": periodieke supplementen die niet vandaag aan de beurt zijn (met hun volgende of laatste keer) en supplementen die nog moeten beginnen.
export function binnenkortKaart({ periodiek, binnenkort, opOpen = null }) {
  const later = periodiek.filter((p) => !p.aanDeBeurt && !p.genomen);
  if (!later.length && !binnenkort.length) return null;
  const datumTekst = (d) => opmaakDatum(d, 'lang');
  const rijen = [
    ...later.map((p) => {
      const wanneer = p.volgende ? t(p.laatste ? 'supplementen.laatsteKeer' : 'supplementen.volgendeKeer', { datum: datumTekst(p.volgende) }) : '';
      return supplementRij({ supplement: p.supplement, extra: [ritmeTekst(p.supplement.ritme), wanneer].filter(Boolean).join(' · '), opOpen });
    }),
    ...binnenkort.map((b) => supplementRij({ supplement: b.supplement, extra: t('supplementen.beginOp', { datum: datumTekst(b.vanaf) }), opOpen })),
  ];
  return kaart(
    { klasse: 'laterkaart', 'data-uitleg': 'later' },
    h('div', { class: 'kaartkop momentkop' }, begripTegel('supplementen'), h('div', { class: 'momentkop__tekst' }, h('span', { class: 'label' }, t('supplementen.later')))),
    h('div', { class: 'afvinklijst' }, ...rijen),
  );
}
