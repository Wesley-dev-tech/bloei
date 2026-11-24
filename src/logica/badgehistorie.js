// Wanneer werd een medaille eigenlijk behaald? Na een uitbreiding krijgt ze wie Bloei al langer gebruikt de nieuwe medailles voor wat al in
// haar dagboek staat. Die horen bij de dag waarop ze ze echt verdiende, niet bij de dag van de update: deze pure functie loopt het dagboek
// van de eerste dag tot vandaag door en onthoudt per medaille de eerste dag waarop haar teller de drempel haalde (logica/badgeregels.js, DOEL).
// Tellers zonder datum in het dagboek (favorieten, verslagen, rondleidingen, een thema, een herinnering, het slot, het beginscherm, het
// profiel, de lijst met supplementen) hebben geen geschiedenis: die medailles krijgen de dag van vandaag.
import { plusDagen, weekStart } from '../kern/datum.js';
import { lopendeReeks } from './reeks.js';
import { DOEL } from './badgeregels.js';

// feiten: [{ datum, bij (bijgehouden), maaltijden, etenKlaar, gevoel, dranken, ml, soorten: [..], doel (dagdoel gehaald), innames, periodiek,
//            vol (alle momenten afgevinkt), stemming, energie, notitie (boolean), wegingen: [maandag van de week, ...], rond }]
// ids: de medailles waarvoor een datum gezocht wordt. Geeft een Map id → datumsleutel (alleen voor wie een datum heeft).
export function eersteDatums(feiten, ids) {
  const s = {
    dagenBijgehouden: 0, lopendeReeks: 0, terugDagen: 0, volleWeken: 0, volleMaanden: 0, maaltijden: 0, etenKlaarDagen: 0, gevoelMaaltijden: 0,
    dranken: 0, liters: 0, drankSoorten: 0, doelDagen: 0, langsteDoelReeks: 0, innameDagen: 0, innames: 0, periodiekInnames: 0,
    volledigeMomentDagen: 0, langsteVolReeks: 0, notitieDagen: 0, stemmingDagen: 0, energieDagen: 0, beideDagen: 0, langsteStemmingReeks: 0,
    wegingen: 0, langsteWeegReeks: 0, dagRondDagen: 0, langsteRondReeks: 0, helemaalDagen: 0,
  };
  const zoek = ids.filter((id) => DOEL[id] && DOEL[id][0] in s);
  const uit = new Map();
  const bijDatums = [];
  const perWeek = new Map();
  const perMaand = new Map();
  const soorten = new Set();
  let ml = 0;
  let vorigeBij = null;
  // Een reeks opeenvolgende dagen (of weken, met stap 7): { vorige, lopend }.
  const reeks = () => ({ vorige: null, lopend: 0 });
  const tel = (r, sleutel, stap = 1) => {
    if (r.vorige === sleutel) return r.lopend;
    r.lopend = r.vorige && plusDagen(r.vorige, stap) === sleutel ? r.lopend + 1 : 1;
    r.vorige = sleutel;
    return r.lopend;
  };
  const rDoel = reeks();
  const rVol = reeks();
  const rStemming = reeks();
  const rRond = reeks();
  const rWeeg = reeks();
  for (const f of [...feiten].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))) {
    const d = f.datum;
    if (f.bij) {
      bijDatums.push(d);
      s.dagenBijgehouden += 1;
      s.lopendeReeks = lopendeReeks(bijDatums, d);
      if (vorigeBij && plusDagen(vorigeBij, 5) <= d) s.terugDagen += 1; // zoals terugDagen (badgeregels.js): minstens vier lege dagen
      vorigeBij = d;
      const week = weekStart(d);
      perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
      if (perWeek.get(week) === 7) s.volleWeken += 1;
      const maand = d.slice(0, 7);
      perMaand.set(maand, (perMaand.get(maand) ?? 0) + 1);
      const [j, m] = maand.split('-').map(Number);
      if (perMaand.get(maand) === new Date(j, m, 0).getDate()) s.volleMaanden += 1;
    }
    s.maaltijden += f.maaltijden ?? 0;
    if (f.etenKlaar) s.etenKlaarDagen += 1;
    s.gevoelMaaltijden += f.gevoel ?? 0;
    s.dranken += f.dranken ?? 0;
    ml += f.ml ?? 0;
    s.liters = Math.floor(ml / 1000);
    for (const soort of f.soorten ?? []) soorten.add(soort);
    s.drankSoorten = soorten.size;
    if (f.doel) {
      s.doelDagen += 1;
      s.langsteDoelReeks = Math.max(s.langsteDoelReeks, tel(rDoel, d));
    }
    if ((f.innames ?? 0) > 0) s.innameDagen += 1;
    s.innames += f.innames ?? 0;
    s.periodiekInnames += f.periodiek ?? 0;
    if (f.vol) {
      s.volledigeMomentDagen += 1;
      s.langsteVolReeks = Math.max(s.langsteVolReeks, tel(rVol, d));
    }
    if (f.notitie) s.notitieDagen += 1;
    if (f.energie != null) s.energieDagen += 1;
    if (f.stemming != null) {
      s.stemmingDagen += 1;
      if (f.energie != null) s.beideDagen += 1;
      s.langsteStemmingReeks = Math.max(s.langsteStemmingReeks, tel(rStemming, d));
    }
    for (const week of f.wegingen ?? []) {
      s.wegingen += 1;
      s.langsteWeegReeks = Math.max(s.langsteWeegReeks, tel(rWeeg, week, 7));
    }
    if (f.rond) {
      s.dagRondDagen += 1;
      s.langsteRondReeks = Math.max(s.langsteRondReeks, tel(rRond, d));
      if (f.stemming != null && f.energie != null && f.notitie) s.helemaalDagen += 1;
    }
    for (const id of zoek) {
      if (uit.has(id)) continue;
      const [teller, drempel] = DOEL[id];
      if (s[teller] >= drempel) uit.set(id, d);
    }
  }
  return uit;
}
