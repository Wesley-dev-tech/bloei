// BESLISSING 286: één gedeelde functie om de beurt van een periodiek supplement af te vinken of terug te zetten, voor Vandaag, de dag en de maand van het Dagboek.
// Ze schrijft via zetInname (moment 'dag'), meldt wat er gebeurde en biedt "Ongedaan maken" aan, zoals bij de momenten. Alle schermen herlezen daarna
// dezelfde gegevens (data:gewijzigd), dus ze tonen dezelfde stand.
import { zetInname } from '../data/supplementen.js';
import { strook } from './componenten.js';
import { t } from '../teksten.js';

// zetBeurt({ datum, supplementId, naam, genomen }): genomen = de nieuwe stand (true = afvinken, false = terugzetten).
export async function zetBeurt({ datum, supplementId, naam, genomen }) {
  try {
    await zetInname(datum, supplementId, 'dag', genomen);
    strook(t(genomen ? 'supplementen.beurtAf' : 'supplementen.beurtTerug', { naam }), {
      actie: { label: t('supplementen.ongedaan'), opKlik: () => zetInname(datum, supplementId, 'dag', !genomen).catch((fout) => console.error(fout)) },
    });
  } catch (fout) {
    console.error(fout);
    strook(t('algemeen.foutOpslag'));
  }
}
