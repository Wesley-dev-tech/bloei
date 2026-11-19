// Het cijferblok van Bloei: stippen (zes, of vier bij een oude code) en een eigen toetsenblok in de huisstijl (geen systeemlook).
// Gebruikt door het slotscherm en door het instelscherm. Opmaak: src/stijl/slot.css.
import { h } from '../ui/dom.js';
import { begripIcoon } from '../ui/iconenkaart.js';
import { tril } from '../ui/componenten.js';
import { t } from '../teksten.js';

export const STANDAARD_LENGTE = 6;

// cijferblok({ opKlaar(code) geeft een Promise<boolean|void>, lengte = 6, extra? })
//   opKlaar krijgt de cijfers (zodra het er `lengte` zijn); geeft het `false`, dan schudt het blok en wordt de invoer gewist.
//   extra: een element voor de vrije plek links van de 0 (bv. de Face ID-knop).
// Geeft { el, wis(), zetUit(bool), focus() }. Ook het toetsenbord van een computer werkt.
export function cijferblok({ opKlaar, lengte = STANDAARD_LENGTE, extra = null } = {}) {
  const LENGTE = lengte;
  let code = '';
  let bezig = false;
  let uit = false;

  const stippen = Array.from({ length: LENGTE }, () => h('span', { class: 'cijferblok__stip' }));
  const stipRij = h('div', { class: 'cijferblok__stippen', role: 'img', 'aria-label': '' }, ...stippen);
  const wisKnop = h(
    'button',
    { type: 'button', class: 'cijferblok__toets cijferblok__toets--wis', 'aria-label': t('slot.wiscijfer') },
    begripIcoon('ongedaan', { grootte: 24 }),
  );
  const toetsen = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => toets(n));
  const nul = toets(0);

  function toets(n) {
    const knop = h('button', { type: 'button', class: 'cijferblok__toets', 'data-cijfer': String(n), 'aria-label': t('slot.cijfer', { cijfer: String(n) }) }, String(n));
    knop.addEventListener('click', () => voegToe(String(n)));
    return knop;
  }

  const el = h(
    'div',
    { class: 'cijferblok' },
    stipRij,
    h('div', { class: 'cijferblok__rooster' }, ...toetsen, h('div', { class: 'cijferblok__vrij' }, extra), nul, wisKnop),
  );

  function teken() {
    stippen.forEach((s, i) => s.classList.toggle('is-gevuld', i < code.length));
    stipRij.setAttribute('aria-label', t('slot.pinLabel', { aantal: String(code.length), totaal: String(LENGTE) }));
  }
  function schakel() {
    const geblokkeerd = uit || bezig;
    for (const k of el.querySelectorAll('.cijferblok__toets')) k.disabled = geblokkeerd;
  }

  async function voegToe(cijfer) {
    if (uit || bezig || code.length >= LENGTE) return;
    tril();
    code += cijfer;
    teken();
    if (code.length < LENGTE) return;
    bezig = true;
    schakel();
    let goed = true;
    try {
      // Eerst een kort moment de zes gevulde stippen tonen, dan pas controleren.
      await new Promise((klaar) => setTimeout(klaar, 180));
      goed = (await opKlaar?.(code)) !== false;
    } finally {
      bezig = false;
    }
    if (!goed) {
      el.classList.remove('is-fout');
      void el.offsetWidth;
      el.classList.add('is-fout');
    }
    code = '';
    teken();
    schakel();
  }

  wisKnop.addEventListener('click', () => {
    if (uit || bezig || !code) return;
    tril();
    code = code.slice(0, -1);
    teken();
  });
  el.addEventListener('animationend', () => el.classList.remove('is-fout'));

  // Het toetsenbord van een computer (alleen zolang het blok in de pagina staat).
  function toetsenbord(e) {
    if (!el.isConnected) {
      document.removeEventListener('keydown', toetsenbord);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      voegToe(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      wisKnop.click();
    }
  }
  document.addEventListener('keydown', toetsenbord);

  teken();
  return {
    el,
    wis() {
      code = '';
      teken();
    },
    zetUit(waarde) {
      uit = Boolean(waarde);
      schakel();
    },
    focus() {
      nul.focus({ preventScroll: true });
    },
  };
}
