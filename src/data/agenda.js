// De agenda van de periodieke supplementen (BESLISSING 208): per dag welke beurt van een periodiek supplement gepland is, ook op toekomstige
// dagen. De reeks komt uit logica/supplementen.js: ze ligt vast vanaf de start en telt altijd door; afvinken verschuift niets.
// leesAgenda(van, tot) → { 'JJJJ-MM-DD': [{ supplementId, naam, hoeveelheid, aanwijzing, status }] } met status 'afgevinkt' | 'gepland' | 'gemist'
//   afgevinkt: er is een inname die bij deze datum van de reeks hoort;
//   gepland:   vandaag of later en nog niet afgevinkt (ook vandaag zelf);
//   gemist:    in het verleden en niet afgevinkt (alleen gedempt getoond, nooit als fout).
import { db } from './db.js';
import { vandaag } from '../kern/datum.js';
import { isPeriodiek, grensVan, isSpuit, reeksDatumVanInname, reeksdatums } from '../logica/supplementen.js';

// De begindag van een dagelijks supplement dat later begint (vanaf), voor één regel in het paneel van die dag (geen teken per dag in de kalender).
// leesBegindagen(van, tot) → { 'JJJJ-MM-DD': [{ naam, hoeveelheid }] }
export async function leesBegindagen(van, tot) {
  const alle = await db.supplementen.toArray();
  const uit = {};
  for (const s of alle) {
    if (!s.actief || isPeriodiek(s) || !s.vanaf || s.vanaf < van || s.vanaf > tot) continue;
    (uit[s.vanaf] ??= []).push({ naam: s.naam, hoeveelheid: s.hoeveelheid ?? '' });
  }
  return uit;
}

export async function leesAgenda(van, tot) {
  const alle = await db.supplementen.toArray();
  const periodiek = alle.filter((s) => s.actief && isPeriodiek(s));
  const nu = vandaag();
  const uit = {};
  for (const supplement of periodiek) {
    // De grens is "Begint op", anders de dag van toevoegen (BESLISSING 698): een beurt daarvoor is niet gepland en niet gemist.
    // Een beurt vóór de grens die al is afgevinkt blijft zichtbaar, zoals in het rooster. Niets na tot (BESLISSING 211).
    const grens = grensVan(supplement);
    const reeks = reeksdatums(supplement.ritme, van, tot, { tot: grens.tot });
    if (!reeks.length) continue;
    const innames = (await db.momentinnames.where('supplementId').equals(supplement.id).toArray()).filter((i) => i.moment === 'dag');
    const afgevinkt = new Set(innames.map((i) => reeksDatumVanInname(supplement.ritme, i.datum)));
    const datums = reeks.filter((d) => !grens.vanaf || d >= grens.vanaf || afgevinkt.has(d));
    for (const datum of datums) {
      const status = afgevinkt.has(datum) ? 'afgevinkt' : datum < nu ? 'gemist' : 'gepland';
      (uit[datum] ??= []).push({ supplementId: supplement.id, naam: supplement.naam, hoeveelheid: supplement.hoeveelheid ?? '', aanwijzing: supplement.aanwijzing ?? '', status, spuit: isSpuit(supplement) });
    }
  }
  return uit;
}

// Het tijdstip (ms) waarop de beurt van een periodiek supplement op een dag is afgevinkt, per supplement: { [supplementId]: ms } (BESLISSING 275).
export async function leesBeurtTijdstippen(datum) {
  const rijen = await db.momentinnames.where('datum').equals(datum).toArray();
  const uit = {};
  for (const r of rijen) if (r.moment === 'dag' && r.tijdstip && (!uit[r.supplementId] || r.tijdstip > uit[r.supplementId])) uit[r.supplementId] = r.tijdstip;
  return uit;
}
