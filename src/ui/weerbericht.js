// Het weerbericht op Vandaag, onder de datum: het weer van nu op de plaats waar ze is (data/weer.js). Geen eigen kaart.
// Eerst het weer van nu: het icoon, de temperatuur, de naam van het weer en hoe het aanvoelt. Daarna, gedempt, wat vandaag brengt, elk met
// zijn woord erbij zodat een getal nooit alleen staat: de minimum- en de maximumtemperatuur, de wind, en de kans op regen met hoeveel er
// verwacht wordt. Op de telefoon staan die delen onder elkaar in regels; op een breed scherm naast elkaar over de volle breedte.
// Zonder weer (geen toestemming voor de locatie, geen netwerk, nog niets opgehaald) is het bericht er gewoon niet.
// weerbericht(weer) → { el, teken(weer) }: teken past het bericht ter plaatse aan telkens er nieuw weer binnenkomt ('weer:gewijzigd').
import { weerBeeld } from '../logica/weer.js';
import { t } from '../teksten.js';
import { h } from './dom.js';
import { icoon } from './iconen.js';

// Een hoeveelheid zoals ze hier gelezen wordt: 2 mm, 12 mm, 0,4 mm.
const hoeveel = (x) => (Number.isInteger(x) || x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace('.', ','));

export function weerbericht(weer) {
  const el = h('div', { class: 'weerbericht begroeting__weer' });
  const teken = (w) => {
    const beeld = weerBeeld(w);
    el.hidden = !beeld;
    if (!beeld) return void el.replaceChildren();
    const naam = t('weer.' + beeld.naam);
    // Hoe het aanvoelt staat er alleen bij als het verschilt van de temperatuur zelf.
    const metVoelt = w.gevoel != null && w.gevoel !== w.temp;
    const metBereik = w.min != null && w.max != null;
    const metKans = w.kans != null;
    const metWind = Number.isFinite(w.wind) && w.wind > 0;
    // Valt er vandaag sneeuw, dan gaat de kans over sneeuw (met de centimeters); anders over regen (met de millimeters).
    const sneeuw = Number.isFinite(w.sneeuw) && w.sneeuw > 0;
    const hoeveelheid = sneeuw ? w.sneeuw : w.mm;
    const metVerwacht = metKans && Number.isFinite(hoeveelheid) && hoeveelheid >= 0.1;
    // De plaats waar ze is (een gemeente, bv. Balen), als die bekend is: vooraan, met een speldje.
    const plaats = typeof w.plaats === 'string' ? w.plaats.trim() : '';
    // Geen naam gevonden: dat staat er dan, met kort waarom (welke bron wat antwoordde), in plaats van een lege plek.
    const plaatsStand = !plaats && typeof w.plaatsStand === 'string' ? w.plaatsStand.slice(0, 60) : '';
    // Een schermlezer krijgt het in gewone zinnen; de tekens en cijfers zelf leest hij niet voor.
    const voorLezer = [
      plaats ? t('weer.labelPlaats', { plaats, naam, aantal: w.temp }) : t('weer.label', { naam, aantal: w.temp }),
      metVoelt && t('weer.labelVoelt', { aantal: w.gevoel }),
      metBereik && t('weer.labelBereik', { min: w.min, max: w.max }),
      metKans && t(sneeuw ? 'weer.labelKansSneeuw' : 'weer.labelKansRegen', { aantal: w.kans }),
      metVerwacht && t(sneeuw ? 'weer.labelVerwachtSneeuw' : 'weer.labelVerwachtRegen', { aantal: hoeveel(hoeveelheid) }),
      metWind && t('weer.labelWind', { aantal: w.wind }),
    ];
    const deel = (klasse, ...kinderen) => h('span', { class: ['weerbericht__deel', klasse], 'aria-hidden': 'true' }, ...kinderen);
    el.replaceChildren(
      h('p', { class: 'alleen-lezer' }, voorLezer.filter(Boolean).join(' ')),
      plaats &&
        h(
          'p',
          { class: 'weerbericht__plaats', 'aria-hidden': 'true' },
          icoon('location-dot', { grootte: 13 }),
          h('span', {}, plaats),
          // Het toestel gaf alleen een grove plek: de gemeente kan ernaast zitten, en dat staat er dan bij.
          w.ruw === true && h('span', { class: 'weerbericht__reden weerbericht__ongeveer' }, `(${t('weer.plaatsOngeveer')})`),
        ),
      plaatsStand &&
        h(
          'p',
          { class: 'weerbericht__plaats weerbericht__plaats--niet', 'aria-hidden': 'true' },
          icoon('location-dot', { grootte: 13 }),
          h('span', {}, t('weer.plaatsNiet')),
          h('span', { class: 'weerbericht__reden' }, `(${plaatsStand})`),
        ),
      h(
        'p',
        { class: 'weerbericht__nu', 'aria-hidden': 'true' },
        icoon(beeld.icoon, { grootte: 20 }),
        h('span', { class: 'weerbericht__graden' }, t('weer.graden', { aantal: w.temp })),
        h('span', { class: 'weerbericht__naam' }, naam),
        metVoelt && h('span', { class: 'weerbericht__voelt' }, t('weer.voelt', { aantal: w.gevoel })),
      ),
      // Op de telefoon begint hier een nieuwe regel (de css verbergt dit op een breed scherm).
      h('span', { class: 'weerbericht__breuk', 'aria-hidden': 'true' }),
      metBereik && deel('weerbericht__min', t('weer.min', { aantal: w.min })),
      metBereik && deel('weerbericht__max', t('weer.max', { aantal: w.max })),
      metWind && deel('weerbericht__wind', icoon('wind', { grootte: 13 }), t('weer.wind', { aantal: w.wind })),
      metKans &&
        deel(
          'weerbericht__regen',
          icoon(sneeuw ? 'snowflake' : 'droplet', { grootte: 12 }),
          h('span', {}, t(sneeuw ? 'weer.kansSneeuw' : 'weer.kansRegen', { aantal: w.kans })),
          metVerwacht && h('span', { class: 'weerbericht__verwacht' }, t(sneeuw ? 'weer.verwachtSneeuw' : 'weer.verwachtRegen', { aantal: hoeveel(hoeveelheid) })),
        ),
    );
  };
  teken(weer);
  return { el, teken };
}
