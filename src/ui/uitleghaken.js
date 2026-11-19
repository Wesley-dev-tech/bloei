// Haakjes voor de uitgebreide uitleg (BESLISSING 183): zet data-uitleg="..." op de onderdelen van een scherm en voegt "Toon het me" toe aan het
// blok "Goed om te weten". Een scherm tekent zichzelf opnieuw na elke wijziging; een waarnemer zet de haakjes daarna weer terug.
// haakUitleg(houder, { haken: [['.selector', 'naam', index?]], toonHet: 'sleutel' }) geeft een functie terug die ophoudt.
import { h } from './dom.js';
import { knop } from './componenten.js';
import { t } from '../teksten.js';
import { startRondleiding } from '../uitleg/rondleiding.js';
import { heeftUitleg } from '../uitleg/stappen.js';
import { toonHetMe } from './weetjes.js';

// Het laatste blok van "Goed om te weten": de enige plek die reageert (BESLISSING 296).
export function toonHetBlok(opKlik, familie) {
  return toonHetMe({ familie, opKlik, klasse: 'toonhet' });
}

export function haakUitleg(houder, { haken = [], toonHet = null, blok = '.instel__weetjes, .gewicht__weetjes' } = {}) {
  const pas = () => {
    for (const [selector, naam, index = 0] of haken) {
      const el = houder.querySelectorAll(selector)[index];
      if (el && el.getAttribute('data-uitleg') !== naam) el.setAttribute('data-uitleg', naam);
    }
    if (toonHet && heeftUitleg(toonHet)) {
      const weetjes = houder.querySelector(blok);
      if (weetjes && !weetjes.querySelector('.toonhet')) {
        const rijEl = weetjes.querySelector('.instel__weetjesrij');
        // BESLISSING 351: de tegel van de link heeft de familie van de weetjestegels in hetzelfde blok.
        const familie = [...(weetjes.querySelector('.weetje:not(.weetje--link) .tegel')?.classList ?? [])].find((k) => k.startsWith('tegel--') && k !== 'tegel--groot' && k !== 'tegel--gedimd' && k !== 'tegel--rond')?.slice(7);
        if (rijEl) rijEl.append(toonHetBlok(() => startRondleiding({ sleutel: toonHet }), familie));
        else weetjes.append(h('div', { class: 'toonhet' }, knop(t('uitleg.toonHet'), { soort: 'tekst', opKlik: () => startRondleiding({ sleutel: toonHet }) })));
      }
    }
  };
  const waarnemer = new MutationObserver(pas);
  waarnemer.observe(houder, { childList: true, subtree: true });
  pas();
  return () => waarnemer.disconnect();
}
