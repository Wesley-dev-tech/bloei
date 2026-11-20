// Tab Dagboek: de kop (titel, het segment Dag · Week · Maand en rechts Delen en de home-knop op één lijn) en de gekozen weergave.
// Bladeren (vorige en volgende dag, week of maand) werkt ook met de pijltjestoetsen.
import { h } from '../ui/dom.js';
import { segment } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { vandaag, weekStart, weekDagen, plusDagen } from '../kern/datum.js';
import { geldigeDatum, geldigeMaand, zetHashRecht } from './hulp.js';
import { dagPeriode, weekPeriode, maandPeriode } from './dagboek-delen.js';
import * as dag from './dagboek-dag.js';
import * as week from './dagboek-week.js';
import * as maand from './dagboek-maand.js';
import { begripIcoon } from '../ui/iconenkaart.js';
import { haakUitleg } from '../ui/uitleghaken.js';

const WEERGAVEN = { dag, week, maand };
// Alleen een eigen sleutel: "#/dagboek/constructor" of "#/dagboek/__proto__" zou anders een erfde eigenschap vinden en het scherm laten vastlopen.
const bekend = (weergave) => typeof weergave === 'string' && Object.hasOwn(WEERGAVEN, weergave);

// De dag waar de andere weergaven naartoe springen: vandaag als die erin valt, anders het begin.
function referentie(weergave, sleutel) {
  const nu = vandaag();
  if (weergave === 'dag') return sleutel;
  if (weergave === 'week') return weekDagen(sleutel).includes(nu) ? nu : weekStart(sleutel);
  return nu.startsWith(sleutel) ? nu : sleutel + '-01';
}

function pad(weergave, ref) {
  const sleutel = weergave === 'maand' ? ref.slice(0, 7) : weergave === 'week' ? weekStart(ref) : ref;
  return `#/dagboek/${weergave}/${sleutel}`;
}

function verschuifMaand(jaarMaand, n) {
  const [j, m] = jaarMaand.split('-').map(Number);
  const d = new Date(j, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Het pad van de vorige of volgende dag, week of maand; null als er niet verder gebladerd kan worden (niet voorbij vandaag voor week en maand).
function buurPad(weergave, sleutel, richting) {
  const nu = vandaag();
  if (weergave === 'dag') return `#/dagboek/dag/${plusDagen(sleutel, richting)}`;
  if (weergave === 'week') {
    const nieuw = plusDagen(sleutel, 7 * richting);
    return richting > 0 && nieuw > nu ? null : `#/dagboek/week/${nieuw}`;
  }
  const nieuw = verschuifMaand(sleutel, richting);
  // De maandkalender blader je ook vooruit (de agenda van periodieke supplementen heeft geen eind); een toekomstige dag is er alleen-lezen.
  return `#/dagboek/maand/${nieuw}`;
}

// Het moment waarop een Dagboek-weergave voor het laatst verlaten werd: komt de volgende er meteen achteraan, dan is het
// bladeren en volstaat een korte vervaging in plaats van de hele opkomst.
let verlatenOp = 0;

export function toon(houder, params = {}) {
  const weergave = bekend(params.weergave) ? params.weergave : 'dag';
  let sleutel = params.sleutel;
  // Maand met een dag erin (vanaf de kalender op Vandaag, BESLISSING 245): de maand van die dag, met die dag gekozen.
  let gekozenDag = null;
  if (weergave === 'maand' && geldigeDatum(sleutel)) {
    gekozenDag = sleutel;
    sleutel = sleutel.slice(0, 7);
    zetHashRecht(`#/dagboek/maand/${sleutel}`);
  }
  const geldig =weergave === 'maand' ? geldigeMaand(sleutel) : geldigeDatum(sleutel);
  if (!geldig) sleutel = weergave === 'maand' ? vandaag().slice(0, 7) : vandaag();
  // Een onbekende weergave of een ongeldige datum, week of maand in de adresbalk: recht zetten naar vandaag.
  if ((params.weergave !== undefined && !bekend(params.weergave)) || (params.sleutel !== undefined && !geldig)) {
    zetHashRecht(`#/dagboek/${weergave}/${weergave === 'week' ? weekStart(sleutel) : sleutel}`);
  }
  if (weergave === 'week') sleutel = weekStart(sleutel);
  const bladeren = Date.now() - verlatenOp < 600;

  const schakelaar = segment({
    keuzes: [
      { id: 'dag', label: t('dag.weergaveDag') },
      { id: 'week', label: t('dag.weergaveWeek') },
      { id: 'maand', label: t('dag.weergaveMaand') },
    ],
    actief: weergave,
    label: t('dag.weergave'),
    opKies: (nieuw) => {
      window.location.hash = pad(nieuw, referentie(weergave, sleutel));
    },
  });
  schakelaar.classList.add('dagboek__segment');

  const inhoud = h('div', { class: 'dagboek__inhoud' });
  // Delen staat in de kop, naast het huisje, net als op de andere tabbladen (BESLISSING 372, herzien):
  // de knop deelt de periode die je op dat moment ziet, dus de dag, de week of de maand van deze weergave.
  const periode = weergave === 'week' ? weekPeriode(sleutel) : weergave === 'maand' ? maandPeriode(sleutel) : dagPeriode(sleutel);
  const kop = h(
    'header',
    { class: 'dagboek__kop' },
    h('h1', { class: 't-h1 schermkop__titel dagboek__titel' }, t('tab.dagboek')),
    schakelaar,
    // Dezelfde rij als op de andere tabbladen (.schermkop__acties): Rondleiding schuift ervoor, dan Delen en het huisje,
    // met de afstand van de schermkop zelf.
    h(
      'div',
      { class: 'schermkop__acties dagboek__acties' },
      h(
        'a',
        { class: 'icoonknop schermkop__delen dagboek__delen', href: `#/delen/${periode.van}/${periode.tot}`, 'aria-label': t('dagboek.delen.' + weergave) },
        begripIcoon('delen', { grootte: 24 }),
      ),
      h('a', { class: 'icoonknop schermkop__home dagboek__home', href: '#/vandaag', 'aria-label': t('dag.naarVandaag') }, begripIcoon('home', { grootte: 24 })),
    ),
  );
  houder.replaceChildren(h('div', { class: 'stapel stapel--sectie dagboek' }, kop, inhoud));

  // Pijltjestoetsen bladeren, behalve in een invoerveld of een open dialoog. actueel volgt elke sprong meteen: een tweede toets vóór de
  // hashwissel het scherm vervangt, rekent zo vanaf de dag waar de eerste naartoe ging (snel links en dan rechts = terug op dezelfde dag).
  let actueel = sleutel;
  const opToets = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || document.querySelector('dialog[open]')) return;
    const doel = e.target;
    if (doel instanceof Element && doel.closest('input, textarea, select, [contenteditable], [role="radio"], [role="slider"]')) return;
    const volgende = buurPad(weergave, actueel, e.key === 'ArrowRight' ? 1 : -1);
    if (volgende) {
      e.preventDefault();
      actueel = volgende.split('/').pop();
      window.location.hash = volgende;
    }
  };
  document.addEventListener('keydown', opToets);

  const opruim = WEERGAVEN[weergave].toon(inhoud, { sleutel, bladeren, gekozen: gekozenDag });
  const stopHaken = haakUitleg(houder, { haken: [['.dagboek__home', 'naar-vandaag']] });
  return () => {
    stopHaken();
    document.removeEventListener('keydown', opToets);
    verlatenOp = Date.now();
    if (typeof opruim === 'function') opruim();
  };
}
