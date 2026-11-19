// Vieringen (HUISSTIJL §7 en §8): ingetogen en kort. Een nieuwe badge (`badge:behaald`) verschijnt als een
// rustige kaart met de salie-badgetegel en de naam, boven de tabbalk. Nooit confetti, nooit geluid.
// Het gehaalde drinkdoel zit al in de watervulling zelf (de vulling wordt salie en het beeldmerk bloeit).
// Meerdere badges komen na elkaar, nooit tegelijk. Bij prefers-reduced-motion verschijnt de kaart zonder beweging
// (dat regelt basis.css voor alle animaties).
import { h } from './dom.js';
import { medaille } from './medaille.js';
import { opmaakDatum, naarSleutel } from '../kern/datum.js';
import { luister } from '../kern/bus.js';
import { markeerGezien } from '../data/badges.js';
import { t } from '../teksten.js';

const TOONDUUR = 4500;
const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

let gestart = false;

// Meerdere keren aanroepen is veilig: er wordt maar één keer geluisterd.
export function startVieringen() {
  if (gestart) return;
  gestart = true;
  const wachtrij = [];
  let bezig = false;
  let houder = null;

  async function volgende() {
    if (bezig || !wachtrij.length) return;
    bezig = true;
    const id = wachtrij.shift();
    if (!houder) {
      houder = h('div', { class: 'vieringhouder', role: 'status', 'aria-live': 'polite' });
      document.body.append(houder);
    }
    let kaartje;
    if (typeof id === 'object') {
      // Bij de eerste start na een uitbreiding van de badges: één rustige melding, geen reeks vieringen.
      kaartje = h('div', { class: 'viering' }, h('div', { class: 'viering__tekst' }, h('p', { class: 'label' }, t('badge.nieuw')), h('p', { class: 'viering__naam t-h2' }, id.aantal === 1 ? t('badge.nieuweStil.een') : t('badge.nieuweStil.meer', { aantal: id.aantal }))));
      houder.replaceChildren(kaartje);
    } else {
      const medailleKlein = medaille({ badge: id, behaald: true, grootte: 'klein', datum: opmaakDatum(naarSleutel(new Date()), 'lang') });
      kaartje = h(
        'div',
        { class: 'viering' },
        medailleKlein,
        h('div', { class: 'viering__tekst' }, h('p', { class: 'label' }, t('badge.nieuw')), h('p', { class: 'viering__naam t-h2' }, t('badge.namen.' + id))),
      );
      houder.replaceChildren(kaartje);
      medailleKlein.glans(250); // dezelfde medaille als op het badgescherm, met één keer de glans
      markeerGezien(id).catch(() => {});
    }
    await wacht(TOONDUUR);
    kaartje.remove();
    await wacht(300);
    bezig = false;
    volgende();
  }

  luister('badges:stil', (d) => {
    if (!d?.aantal) return;
    wachtrij.push({ aantal: d.aantal });
    volgende();
  });

  luister('badge:behaald', (d) => {
    if (!d?.id) return;
    wachtrij.push(d.id);
    volgende();
  });
}
