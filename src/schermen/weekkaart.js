// De kaart "Deze week" op Drinken (zeven staafjes, liter per dag, een rustige lijn op het dagdoel) en op Supplementen (zeven
// dagen, gevuld als alle momenten afgevinkt waren). Elke dag is tikbaar naar zijn detail. Geen oordeel: een lege dag is gewoon leeg.
import { h } from '../ui/dom.js';
import { begripOpties } from '../ui/iconenkaart.js';
import { kaart, kaartkop } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { opmaakLiter } from '../kern/getal.js';
import { opmaakDatum } from '../kern/datum.js';
import { weekPeriodeTekst } from '../logica/drinken-week.js';

const dagNaam = (i) => t('algemeen.dagen.' + (i + 1));
const letter = (i) => dagNaam(i)[0].toUpperCase();

// dagen: [{ datum, ml }] van maandag tot zondag; doel in ml; vandaag = de sleutel van vandaag
// datums: onder elke dag de datum (dd/mm) en in de kop de periode (Drinken); zonder staat in de kop alleen de periode (het voorbeeld in Instellingen, BESLISSING 495).
export function drinkWeekKaart({ dagen, doel, vandaag, datums = false }) {
  const hoogste = Math.max(doel * 1.25, ...dagen.map((d) => d.ml), 1);
  const staven = dagen.map((d, i) => {
    const toekomst = d.datum > vandaag;
    return h(
      'a',
      {
        class: ['weekstaaf', 'licht-op-icoon', d.datum === vandaag && 'is-vandaag', toekomst && 'is-toekomst', d.ml > 0 && 'is-gevuld'],
        href: '#/dagboek/dag/' + d.datum,
        'aria-label': `${dagNaam(i)}, ${d.ml > 0 ? opmaakLiter(d.ml) : t('drinken.weekLeeg')}`,
      },
      h('span', { class: 'weekstaaf__waarde cijfer', 'aria-hidden': 'true' }, d.ml > 0 ? opmaakLiter(d.ml).replace(/\s?l$/, '') : ''),
      h('span', { class: 'weekstaaf__veld', 'aria-hidden': 'true' }, h('span', { class: 'weekstaaf__balk licht-icoon', style: { height: Math.round((d.ml / hoogste) * 100) + '%' } })),
      h('span', { class: 'weekstaaf__letter', 'aria-hidden': 'true' }, letter(i)),
      datums ? h('span', { class: 'weekstaaf__datum cijfer', 'aria-hidden': 'true' }, cijferDatum(d.datum)) : null,
    );
  });
  const rij = h('div', { class: ['weekstaven', datums && 'weekstaven--datum'], role: 'group', 'aria-label': t('drinken.weekAlt', { dagen: dagen.map((d, i) => `${dagNaam(i)} ${d.ml > 0 ? opmaakLiter(d.ml) : t('drinken.weekLeeg')}`).join(', ') }), style: { '--doel': Math.round((doel / hoogste) * 100) + '%' } }, h('span', { class: 'weekstaven__lijn', 'aria-hidden': 'true' }), ...staven);
  return kaart(
    { klasse: 'weekkaart weekkaart--drinken' },
    kaartkop({ tegel: begripOpties('drinken'), label: t('vandaag.dezeWeek'), eind: datums ? `${weekPeriode(dagen)} · ${t('drinken.weekDoel', { doel: opmaakLiter(doel) })}` : voorbeeldPeriode(dagen[0].datum) }),
    rij,
  );
}

// BESLISSINGEN 475, 476 en 495: in het voorbeeld in Instellingen staat rechts in de kop alleen de periode, in labelvorm (het doel niet meer). Zoals bij
// "Je week in cijfers" (480) staan er drie vormen, waarvan de css er één toont naar de breedte van het voorbeeld (scherm-drinken.css): vol "9 - 15 november 2026",
// kort "9 - 15 nov 2026", kortst "9 - 15 nov". De schermlezer hoort de volle vorm.
function voorbeeldPeriode(start) {
  const vormen = [['vol', weekPeriodeTekst(start, { jaar: true })], ['kort', weekPeriodeTekst(start, { jaar: true, kort: true })], ['kortst', weekPeriodeTekst(start, { kort: true })]];
  return h('span', { class: 'label weekkaart__periode' }, h('span', { class: 'alleen-lezer' }, vormen[0][1]), ...vormen.map(([vorm, tekst]) => h('span', { class: 'weekkaart__periode--' + vorm, 'aria-hidden': 'true' }, tekst)));
}

// dd/mm met voorloopnullen (datum.js heeft geen korte cijfernotatie), uit de sleutel JJJJ-MM-DD
const cijferDatum = (sleutel) => `${sleutel.slice(8, 10)}/${sleutel.slice(5, 7)}`;

// "9 - 15 november" of "30 november - 6 december", uit de datums van de week zelf.
const maandNaam = (sleutel) => opmaakDatum(sleutel, 'maand').split(' ')[0];
function weekPeriode(dagen) {
  if (!dagen.length) return null;
  const a = dagen[0].datum;
  const b = dagen[dagen.length - 1].datum;
  const eind = `${opmaakDatum(b, 'dag')} ${maandNaam(b)}`;
  return maandNaam(a) === maandNaam(b) ? `${opmaakDatum(a, 'dag')} - ${eind}` : `${opmaakDatum(a, 'dag')} ${maandNaam(a)} - ${eind}`;
}

// dagen: [{ datum, genomen, totaal }]
export function suppWeekKaart({ dagen, vandaag }) {
  const items = dagen.map((d, i) => {
    // Salie alleen als alles wat op het hoofdscherm staat afgevinkt is (de dagelijkse momenten; spuiten tellen niet mee).
    const m = d.momenten;
    const klaar = m ? m.totaal > 0 && m.klaar >= m.totaal : d.totaal > 0 && d.genomen >= d.totaal;
    const toekomst = d.datum > vandaag;
    return h(
      'div',
      {
        // BESLISSING 242: enkel een aanduiding, niet aanklikbaar (lijst met een tekstalternatief per dag)
        class: ['weekdag', klaar && 'is-klaar', d.datum === vandaag && 'is-vandaag', toekomst && 'is-toekomst'],
        role: 'listitem',
        'data-datum': d.datum,
        'aria-label': `${opmaakDatum(d.datum, 'lang')}, ${klaar ? t('supplementen.weekKlaar') : toekomst ? t('supplementen.weekLeeg') : t('supplementen.weekNogNiet')}`,
      },
      h('span', { class: 'weekdag__bol licht-icoon', 'aria-hidden': 'true' }),
      h('span', { class: 'weekdag__letter', 'aria-hidden': 'true' }, letter(i)),
      // BESLISSING 244: het dagnummer; de eerste van een nieuwe maand (niet de eerste kolom) krijgt de korte maandnaam erbij
      h('span', { class: 'weekdag__datum cijfer', 'aria-hidden': 'true' }, cijferDatum(d.datum)),
    );
  });
  return kaart({ klasse: 'weekkaart weekkaart--supp' }, kaartkop({ tegel: begripOpties('supplementen'), label: t('vandaag.dezeWeek'), eind: h('span', { class: 'label' }, weekPeriode(dagen)) }), h('div', { class: 'weekdagen', role: 'list' }, ...items)); // BESLISSING 459: de week als label
}
