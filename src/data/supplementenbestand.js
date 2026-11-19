// De supplementenlijst uit een bestand overnemen (BESLISSING 696): de kant van de database.
// De supplementen komen uit leesBestand (logica/supplementenbestand.js), dus ze zijn al streng gecontroleerd; hier worden ze toch nog eens
// door dezelfde schoonmaak gehaald als bij voegSupplementToe (data/supplementen.js), zodat een fout nooit half in de database belandt.
//
// Alles gebeurt in één transactie over supplementen en momentinnames: lukt één stap niet, dan verandert er niets.
// De afgevinkte dagen (momentinnames) worden nooit aangeraakt, bij geen enkele keuze.
//   toevoegen: wat er nog niet staat (zelfde naam, zie sleutelVan), komt achteraan de lijst. Wat er al staat, blijft ongemoeid.
//   vervangen: de lijst wordt die van het bestand, in de volgorde van het bestand.
//     - hetzelfde supplement in beide (blijft): het bestaande supplement houdt zijn id en dus zijn afgevinkte dagen, en krijgt de gegevens
//       uit het bestand. Zo staat het op vroegere dagen niet twee keer (één keer afgevinkt als oud, één keer open als nieuw).
//     - alleen in de app (weg): zoals verwijderSupplement. Met afgevinkte dagen wordt het inactief: het verdwijnt uit de lijst en uit
//       vandaag, maar staat nog op de dagen waarop het afgevinkt was. Zonder afgevinkte dagen verdwijnt het echt.
//     - alleen in het bestand (erbij): een nieuw supplement.
import { db } from './db.js';
import { MAX_LENGTE, begrens } from './grenzen.js';
import { zend } from '../kern/bus.js';
import { vandaag } from '../kern/datum.js';
import { schoneMomenten, schoonPeriode, schoonRitme } from '../logica/supplementen.js';
import { vergelijk } from '../logica/supplementenbestand.js';

const kort = (tekst, max) => begrens(String(tekst ?? '').trim(), max).trim();

// De velden van een supplement zoals voegSupplementToe ze zet (zonder id, volgorde, actief, voorbeeld, aangemaaktOp en teltVanaf). Gooit Error('leeg'),
// Error('ritme'), Error('momenten') of Error('periode'), net als voegSupplementToe.
function gegevensVan(s) {
  const naam = kort(s?.naam, MAX_LENGTE.supplementNaam);
  if (!naam) throw new Error('leeg');
  const ritme = schoonRitme(s.ritme, vandaag());
  const momenten = ritme.soort === 'dagelijks' ? schoneMomenten(s.momenten) : [];
  if (ritme.soort === 'dagelijks' && momenten.length === 0) throw new Error('momenten');
  return {
    naam,
    dosis: '',
    hoeveelheid: kort(s.hoeveelheid, MAX_LENGTE.supplementVeld),
    aanwijzing: kort(s.aanwijzing, MAX_LENGTE.supplementVeld),
    momenten,
    ritme,
    ...schoonPeriode({ vanaf: s.vanaf, tot: s.tot }),
  };
}

// supplementen: de lijst uit leesBestand. wijze: 'toevoegen' of 'vervangen'.
// Geeft { erbij, alAanwezig, bijgewerkt, weg, inactief } (aantallen): erbij nieuwe supplementen, alAanwezig overgeslagen (toevoegen),
// bijgewerkt bestaande supplementen met de gegevens uit het bestand (vervangen), weg uit de lijst gehaald (vervangen), waarvan inactief
// het aantal dat met zijn afgevinkte dagen bewaard blijft.
// Fouten: Error('wijze') bij een onbekende keuze, Error('leeg') bij een lege lijst, en de fouten van gegevensVan; dan is er niets veranderd.
export async function neemOver(supplementen, { wijze } = {}) {
  if (wijze !== 'toevoegen' && wijze !== 'vervangen') throw new Error('wijze');
  if (!Array.isArray(supplementen) || supplementen.length === 0) throw new Error('leeg');
  const uitslag = await db.transaction('rw', db.supplementen, db.momentinnames, async () => {
    const alle = await db.supplementen.toArray();
    // Dezelfde volgorde als leesSupplementen, zodat het koppelen van twee keer dezelfde naam klopt met wat het scherm vooraf toonde.
    const actief = alle.filter((s) => s.actief).sort((a, b) => a.volgorde - b.volgorde || a.id - b.id);
    // De vergelijking gebeurt opnieuw binnen de transactie: wat het scherm vooraf toonde, kan intussen veranderd zijn (een tweede tabblad).
    const plan = vergelijk(actief, supplementen);
    let volgorde = alle.reduce((hoogste, s) => Math.max(hoogste, s.volgorde ?? 0), 0);
    // BESLISSING 698: een nieuw supplement uit het bestand telt vanaf de dag van overnemen (teltVanaf), tenzij het bestand een vanaf heeft
    // (die gaat voor, zie beginVan in logica/supplementen.js).
    const dagVanOvernemen = vandaag();
    const nieuwRecord = (s) => ({ ...gegevensVan(s), volgorde: (volgorde += 1), actief: true, voorbeeld: false, aangemaaktOp: Date.now(), teltVanaf: dagVanOvernemen });

    if (wijze === 'toevoegen') {
      for (const s of plan.toevoegen.erbij) await db.supplementen.add(nieuwRecord(s));
      return { erbij: plan.toevoegen.erbij.length, alAanwezig: plan.toevoegen.alAanwezig.length, bijgewerkt: 0, weg: 0, inactief: 0 };
    }

    let inactief = 0;
    for (const b of plan.vervangen.weg) {
      // Zoals verwijderSupplement: met afgevinkte dagen inactief, anders echt weg.
      const aantal = await db.momentinnames.where('supplementId').equals(b.id).count();
      if (aantal > 0) {
        await db.supplementen.put({ ...b, actief: false });
        inactief += 1;
      } else {
        await db.supplementen.delete(b.id);
      }
    }
    // In de volgorde van het bestand: elk supplement krijgt een volgnummer achter alle bestaande.
    const blijftVan = new Map(plan.vervangen.blijft.map((p) => [p.nieuw, p.bestaand]));
    for (const s of supplementen) {
      const bestaand = blijftVan.get(s);
      if (bestaand) {
        // De periode komt alleen uit het bestand: een oude vanaf of tot blijft niet hangen. De dag van toevoegen (teltVanaf) blijft wel die
        // van het bestaande supplement (of blijft weg bij een supplement van vóór BESLISSING 698): vervangen is geen nieuw toevoegen.
        const { vanaf: _v, tot: _t, ...zonderPeriode } = bestaand;
        await db.supplementen.put({ ...zonderPeriode, ...gegevensVan(s), volgorde: (volgorde += 1), actief: true, voorbeeld: false });
      } else {
        await db.supplementen.add(nieuwRecord(s));
      }
    }
    return { erbij: plan.vervangen.erbij.length, alAanwezig: 0, bijgewerkt: plan.vervangen.blijft.length, weg: plan.vervangen.weg.length, inactief };
  });
  zend('data:gewijzigd', { store: 'supplementen' });
  return uitslag;
}
