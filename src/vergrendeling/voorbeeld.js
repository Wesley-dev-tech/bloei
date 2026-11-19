// Het slotscherm in het klein, als levend voorbeeld op het instelscherm (alleen kijken, niet tikbaar): logo,
// zes stippen (of vier bij een oude code), het cijferblok, als Face ID aan staat de knop ervoor, en de link voor een vergeten code.
import { h } from '../ui/dom.js';
import { logo } from '../ui/componenten.js';
import { PIN_LENGTE } from './pin.js';
import { t } from '../teksten.js';

// slotVoorbeeld({ lengte = 6, faceIdNaam: string|null })
export function slotVoorbeeld({ lengte = PIN_LENGTE, faceIdNaam = null } = {}) {
  const toetsen = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('span', { class: 'slotvoorbeeld__toets' }, String(n)));
  return h(
    'div',
    { class: 'slotvoorbeeld', 'aria-hidden': 'true', inert: true },
    logo({ grootte: 20 }),
    h('div', { class: 'slotvoorbeeld__stippen' }, ...Array.from({ length: lengte }, (_, i) => h('span', { class: ['slotvoorbeeld__stip', i < 2 && 'is-gevuld'] }))),
    h('div', { class: 'slotvoorbeeld__rooster' }, ...toetsen, h('span'), h('span', { class: 'slotvoorbeeld__toets' }, '0'), h('span')),
    faceIdNaam ? h('span', { class: 'slotvoorbeeld__faceid' }, faceIdNaam + ' gebruiken') : null,
    h('span', { class: 'slotvoorbeeld__kwijt' }, t('slot.codeKwijt')),
  );
}
