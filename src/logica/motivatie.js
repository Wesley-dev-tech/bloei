// Pure functies: welke warme zin past bij de dag (PLAN.md §15.2, beslissing 114; uitgebreid in 0.4.3).
// Ze geven een tekstsleutel terug (bv. 'motivatie.onderweg.2') met wat er in de zin komt ({aantal}, {badge}, {periode}); de zinnen zelf
// staan in teksten.js. Alles is positief: een zin zegt nooit wat er ontbreekt of minder goed ging, nooit iets over wat ze at en nooit een
// gewicht of een verschil (een weging krijgt alleen een zin over het noteren zelf).
//
// Welke groep? De eerste die klopt wint, in deze volgorde:
//   1. Het verleden      eersteDag, terugLang, terug, record, reeks, totaal, jubileum, terugKort. Alleen bij het openen van de app of als wat
//                        ze net deed de dag begon (reactie.nieuw.iets).
//   2. Medailles         badgeAlle, badgeTelling, badgeMeer of de eigen zin van de medaille (m-<id>): bij het openen de medailles van
//                        vandaag, na een handeling alleen de medailles die net behaald zijn.
//   3. De hele dag       rondTotaal, dagRondReeks, dagRond: bij het openen, of als wat ze net deed de dag rond maakte.
//   4. Wat ze net deed   de reactie (data/motivatiestand.js): een maaltijd, een drank, een vinkje, haar stemming, een weging, ...
//   5. De stand          niets vandaag: badgeGisteren, beginNaRond, nieuweMaand, beginWeek, beginNaDoel, daarna afwisselend begin, het
//                        dagdeel, beginReeks en beginBadge. Al iets: bijnaRond*, drinkenKlaar, supplementenKlaar, drinkenBijna, daarna
//                        afwisselend onderweg, het dagdeel, badgeStap en weekEinde.
// Binnen een groep hangt de zin af van de datum en niet van het toeval: dezelfde dag en dezelfde toestand geven altijd dezelfde zin, ook
// na herladen. Twee reacties na elkaar krijgen een andere zin (de teller van de reactie schuift de keuze op).
// Er wordt nergens met een vast aantal liters gerekend: de status brengt doelMl mee.

// Aantal zinnen per groep (de zinnen staan in teksten.js, genummerd vanaf 1). m-<id> is de eigen zin van een medaille.
export const GROEPEN = {
  eersteDag: 5,
  terugLang: 6,
  terug: 8,
  record: 5,
  reeks: 10,
  totaal: 6,
  jubileum: 5,
  terugKort: 6,
  dagRondReeks: 5,
  dagRond: 10,
  eersteMaaltijd: 8,
  maaltijd: 10,
  etenKlaar: 7,
  favoriet: 4,
  eersteDrank: 8,
  drinkenHalf: 7,
  drinkenBijna: 8,
  drinkenReeks: 4,
  drinkenKlaar: 8,
  supplementEerste: 6,
  supplementenReeks: 4,
  supplementenKlaar: 8,
  periodiek: 4,
  stemmingLaag: 6,
  stemmingMidden: 6,
  stemmingHoog: 7,
  energieLaag: 4,
  energie: 5,
  notitie: 7,
  weging: 6,
  wegingReeks: 3,
  verslag: 5,
  vorigeDag: 5,
  aangepast: 4,
  eigen: 3,
  herinnering: 3,
  slot: 3,
  beginNaRond: 5,
  beginNaDoel: 4,
  beginReeks: 4,
  beginWeek: 4,
  beginOchtend: 7,
  beginMiddag: 6,
  beginAvond: 6,
  begin: 10,
  onderwegAvond: 5,
  onderweg: 10,
  badgeMeer: 4,
  badgeTelling: 5,
  badgeAlle: 3,
  badgeBijna: 6,
  badgeHalf: 4,
  badgeStap: 5,
  badgeGisteren: 4,
  beginBadge: 4,
  maaltijdenTotaal: 4,
  doelTotaal: 3,
  supplementTotaal: 3,
  rondTotaal: 3,
  notitieTotaal: 3,
  stemmingTotaal: 3,
  wegingTotaal: 3,
  favorietTotaal: 2,
  drinkenMeer: 3,
  stemmingReeks: 3,
  bijnaRondDrinken: 4,
  bijnaRondSupplementen: 4,
  bijnaRondEten: 4,
  drank: 6,
  maaltijdGevoel: 3,
  supplementMoment: 4,
  supplementLijst: 3,
  dagdoel: 3,
  rondleiding: 3,
  onderwegOchtend: 5,
  onderwegMiddag: 5,
  weekEinde: 4,
  nieuweMaand: 4,
  'm-eerste-bladzijde': 2,
  'm-drie-op-rij': 2,
  'm-week-vol': 2,
  'm-week-op-rij': 2,
  'm-twee-weken': 2,
  'm-maand-vol': 2,
  'm-maand-op-rij': 2,
  'm-vijftig-dagen': 2,
  'm-honderd': 2,
  'm-jaar-bloei': 2,
  'm-weer-thuis': 2,
  'm-eerste-maaltijd': 2,
  'm-vijftig-maaltijden': 2,
  'm-eerste-favoriet': 2,
  'm-eerste-kan': 2,
  'm-tien-kannen': 2,
  'm-week-water': 2,
  'm-dertig-dagdoelen': 2,
  'm-eerste-potje': 2,
  'm-alles-afgevinkt': 2,
  'm-week-trouw': 2,
  'm-trouw': 2,
  'm-dertig-vol': 2,
  'm-kanttekening': 2,
  'm-twintig-notities': 2,
  'm-gemoed': 2,
  'm-dertig-stemmingen': 2,
  'm-zeven-energie': 2,
  'm-eerste-weging': 2,
  'm-vier-wegingen': 2,
  'm-dag-rond': 2,
  'm-zeven-dagen-rond': 2,
  'm-eerste-verslag': 2,
  'm-tweehonderd': 2,
  'm-vijfhonderd': 2,
  'm-twee-maanden-op-rij': 2,
  'm-honderd-op-rij': 2,
  'm-volle-week': 2,
  'm-volle-maand': 2,
  'm-altijd-welkom': 2,
  'm-vijf-op-rij': 2,
  'm-tien-op-rij': 2,
  'm-drie-weken-op-rij': 2,
  'm-vijftig-op-rij': 2,
  'm-jaar-op-rij': 2,
  'm-duizend-dagen': 2,
  'm-vier-volle-weken': 2,
  'm-honderd-maaltijden': 2,
  'm-vijfhonderd-maaltijden': 2,
  'm-vijf-favorieten': 2,
  'm-drie-op-een-dag': 2,
  'm-tien-gevoel': 2,
  'm-tien-maaltijden': 2,
  'm-tien-favorieten': 2,
  'm-zeven-drie-maaltijden': 2,
  'm-vijftig-dagdoelen': 2,
  'm-honderd-dagdoelen': 2,
  'm-twee-weken-water': 2,
  'm-maand-water': 2,
  'm-eerste-slok': 2,
  'm-drie-dagen-water': 2,
  'm-honderd-liter': 2,
  'm-drie-soorten': 2,
  'm-vijftig-vol': 2,
  'm-honderd-vol': 2,
  'm-op-ritme': 2,
  'm-tien-ritme': 2,
  'm-eigen-lijst': 2,
  'm-honderd-vinkjes': 2,
  'm-zeven-op-rij-afgevinkt': 2,
  'm-vijftig-notities': 2,
  'm-honderd-stemmingen': 2,
  'm-dertig-energie': 2,
  'm-week-gezichtjes': 2,
  'm-honderd-notities': 2,
  'm-maand-gezichtjes': 2,
  'm-gezichtje-en-blaadje': 2,
  'm-twaalf-wegingen': 2,
  'm-halfjaar-wegen': 2,
  'm-jaar-wegen': 2,
  'm-vier-weken-wegen': 2,
  'm-drie-rond-op-rij': 2,
  'm-week-rond': 2,
  'm-dertig-rond': 2,
  'm-twee-weken-rond': 2,
  'm-vijftig-rond': 2,
  'm-volledige-dag': 2,
  'm-vijf-verslagen': 2,
  'm-tien-verslagen': 2,
  'm-eerste-rondleiding': 2,
  'm-eigen-kleur': 2,
  'm-seintje-aan': 2,
  'm-achter-slot': 2,
  'm-op-beginscherm': 2,
  'm-eigen-profiel': 2,
  'm-vijf-rondleidingen': 2,
  'm-tien-medailles': 2,
  'm-vijfentwintig-medailles': 2,
  'm-vijftig-medailles': 2,
  'm-verzameling-compleet': 2,
};

export const WEEKGROEPEN = {
  week0: 5,
  week1: 6,
  week4: 6,
  week7: 6,
  weekEerste: 4,
  weekVolReeks: 3,
  weekMeer: 4,
  weekRecord: 3,
};

// Ronde getallen waarbij een teller een zin krijgt.
export const REEKS_MIJLPALEN = [3, 5, 7, 10, 14, 21, 30, 40, 50, 60, 75, 100];
export const MIJLPALEN = {
  totaal: [10, 25, 50, 75, 100, 150, 200, 250, 300, 365, 500],
  maaltijden: [10, 25, 50, 100, 250, 500, 1000],
  doel: [5, 10, 25, 50, 100, 200],
  supplement: [7, 14, 30, 50, 100],
  rond: [5, 10, 25, 50, 100],
  notitie: [5, 10, 20, 50, 100],
  stemming: [7, 30, 50, 100, 200],
  weging: [4, 8, 12, 26, 52],
  favoriet: [5, 10, 20],
  badges: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95],
};
const isReeksMijlpaal = (n) => REEKS_MIJLPALEN.includes(n) || (n > 100 && n % 50 === 0);
// Zo lang na de eerste dag: [maanden, woord in motivatieWoord.periode].
const JUBILEA = [[1, 'maand'], [3, 'kwartaal'], [6, 'halfjaar'], [12, 'jaar'], [24, 'tweejaar']];

// Voorbeelden voor wat er in een zin komt: de tests vullen er elke zin mee in.
export const VOORBEELD_WAARDEN = { aantal: 7, badge: 'Drie op rij', periode: 'een maand' };

// Een stabiel getal uit een tekst (som van tekens, geen toeval).
function getalUit(tekst) {
  let som = 0;
  for (const teken of String(tekst)) som = (som * 31 + teken.codePointAt(0)) % 100003;
  return som;
}

// De zin van een groep: vast per datum; schuif (de teller van de reactie) kiest de volgende; zonder = nummers die nu niet passen.
function kies(groep, bron, { waarden = {}, zonder = [], schuif = 0 } = {}) {
  const nummers = [];
  for (let nr = 1; nr <= GROEPEN[groep]; nr++) if (!zonder.includes(nr)) nummers.push(nr);
  const nr = nummers[(getalUit(bron + groep) + schuif) % nummers.length];
  return { groep, sleutel: `motivatie.${groep}.${nr}`, waarden };
}
// Eén van meerdere groepen die allemaal passen: vast per datum, zodat de dagen afwisselen.
const wissel = (groepen, datum) => groepen[getalUit(datum + 'wissel') % groepen.length];

// De datum k maanden na een datumsleutel (de 31e wordt de laatste dag van een kortere maand).
function maandenLater(sleutel, k) {
  const [j, m, d] = sleutel.split('-').map(Number);
  const doel = new Date(j, m - 1 + k, 1);
  const laatste = new Date(doel.getFullYear(), doel.getMonth() + 1, 0).getDate();
  const twee = (n) => String(n).padStart(2, '0');
  return `${doel.getFullYear()}-${twee(doel.getMonth() + 1)}-${twee(Math.min(d, laatste))}`;
}
const jubileumOp = (eerste, datum) => (eerste ? (JUBILEA.find(([k]) => maandenLater(eerste, k) === datum)?.[1] ?? null) : null);
// 1 = maandag ... 7 = zondag, of 0 zonder geldige datum.
function weekdag(sleutel) {
  const [j, m, d] = String(sleutel).split('-').map(Number);
  if (!j || !m || !d) return 0;
  return new Date(j, m - 1, d).getDay() || 7;
}
const DAGDEEL_NAAM = { ochtend: 'Ochtend', middag: 'Middag', avond: 'Avond' };

// Eten is klaar als deze drie maaltijden ingevuld zijn (BESLISSING 278). Eén plek voor die regel (R1-20).
export const ETEN_KLAAR = ['ontbijt', 'middagmaal', 'avondmaal'];

// De ene regel voor "de dag is rond" (BESLISSING 278), gedeeld door de motivatiezin en de badges dag-rond en zeven-dagen-rond:
// eten in orde (etenKlaar: ETEN_KLAAR ingevuld; zonder dat veld minstens drie maaltijden), supplementen in orde
// (alles afgevinkt, of geen supplementen) en gedronken >= dagdoel. De stemming speelt geen rol.
function dagOnderdelen({ etenKlaar, maaltijden = 0, supplementen, ml = 0, doelMl = 0 } = {}) {
  return {
    etenOk: etenKlaar ?? maaltijden >= 3,
    supplementenOk: (supplementen?.genomen ?? 0) >= (supplementen?.totaal ?? 0),
    drinkenOk: doelMl > 0 && ml >= doelMl,
  };
}
export function isDagRond(status) {
  const { etenOk, supplementenOk, drinkenOk } = dagOnderdelen(status);
  return etenOk && supplementenOk && drinkenOk;
}

// ---------------------------------------------------------------- wat ze net deed
// Vergelijkt de stand van vandaag vóór en na een wijziging en zegt wat er gebeurde. Pure functie; data/motivatiestand.js houdt de stand bij.
//   vorige, nu: { maaltijden, gevoel, ml, genomen, periodiek, momentenKlaar, stemming, energie, notitie, weging, favorieten, iets, rond,
//                 etenOk, suppOk, doelOk, badges: [id], volgende: { id, aantal } | null }
//   gebeurd:    { stores: ['maaltijden', ...] (de laatste achteraan), eerder: boolean (een wijziging op een vorige dag), soort: string | null
//                 (iets buiten het dagboek: verslag, eigen, herinnering, slot, dagdoel, rondleiding) }
// Geeft { soort, nieuw } of null als er niets te zeggen valt (dan blijft de vorige reactie staan).
export function reactieUit(vorige, nu, gebeurd) {
  if (!vorige || !nu || !gebeurd) return null;
  const v = vorige;
  const n = nu;
  const nieuw = {
    iets: !v.iets && Boolean(n.iets),
    rond: !v.rond && Boolean(n.rond),
    eten: !v.etenOk && Boolean(n.etenOk),
    supp: !v.suppOk && Boolean(n.suppOk),
    doel: !v.doelOk && Boolean(n.doelOk),
    moment: (n.momentenKlaar ?? 0) > (v.momentenKlaar ?? 0),
    badges: (n.badges ?? []).filter((id) => !(v.badges ?? []).includes(id)),
    stap: Boolean(n.volgende && v.volgende && n.volgende.id === v.volgende.id && n.volgende.aantal > v.volgende.aantal),
    eersteStemming: v.stemming == null,
    eersteNotitie: !v.notitie,
    eersteWeging: !v.weging,
    mlVoor: v.ml ?? 0,
  };
  const meer = (veld) => (n[veld] ?? 0) > (v[veld] ?? 0);
  const perStore = {
    maaltijden: () => (meer('maaltijden') ? 'maaltijd' : meer('gevoel') ? 'gevoel' : null),
    dranken: () => (meer('ml') ? 'drank' : null),
    innames: () => (meer('periodiek') ? 'periodiek' : meer('genomen') ? 'inname' : null),
    dagen: () => (n.stemming != null && n.stemming !== v.stemming ? 'stemming' : n.energie != null && n.energie !== v.energie ? 'energie' : n.notitie && n.notitie !== v.notitie ? 'notitie' : null),
    wegingen: () => (n.weging && n.weging !== v.weging ? 'weging' : null),
    favorieten: () => (meer('favorieten') ? 'favoriet' : null),
  };
  const stores = [...(gebeurd.stores ?? [])].reverse();
  for (const store of stores) {
    const soort = perStore[store]?.();
    if (soort) return { soort, nieuw };
  }
  if (gebeurd.soort) return { soort: gebeurd.soort, nieuw };
  if (gebeurd.eerder) return { soort: 'vorigeDag', nieuw };
  if (stores.includes('supplementen')) return { soort: 'supplementLijst', nieuw };
  // Iets van vandaag veranderde zonder dat er iets bij kwam: aangepast of weggehaald.
  const kern = (s) => JSON.stringify([s.maaltijden, s.gevoel, s.ml, s.genomen, s.periodiek, s.stemming, s.energie, s.notitie, s.weging, s.favorieten, s.tekst]);
  if (stores.some((s) => perStore[s]) && kern(v) !== kern(n)) return { soort: 'aangepast', nieuw };
  return null;
}

// ---------------------------------------------------------------- de zin van de dag
// status: { dagdeel, maaltijden, etenKlaar, ml, doelMl, supplementen: { genomen, totaal }, stemming, energie, lopendeReeks, dagenBijgehouden,
//           dagenSindsVorige: number | null, datum, iets?: boolean, drankenAantal?,
//           reactie?: { soort, nieuw, teller } | null   wat ze net deed (data/motivatiestand.js),
//           verleden?: zie data/verleden.js (alles is optioneel: zonder verleden vallen die groepen gewoon weg) }
// iets (optioneel): of er vandaag iets genoteerd staat, zoals dagStatus(datum).bijgehouden dat bepaalt (BESLISSING 168); zonder iets rekent kiesMotivatie het zelf uit.
// Geeft { groep, sleutel, waarden }.
export function kiesMotivatie(status) {
  const { maaltijden = 0, ml = 0, doelMl = 0, supplementen = { genomen: 0, totaal: 0 }, stemming = null, energie = null, lopendeReeks = 0, dagenBijgehouden = 0, dagenSindsVorige = null, datum = '', iets: ietsOpgegeven, etenKlaar, dagdeel = null, drankenAantal = 0, reactie = null } = status ?? {};
  const v = status?.verleden ?? {};
  const tot = v.totaal ?? {};
  const b = v.badges ?? {};
  const n = reactie?.nieuw ?? {};
  const eten = maaltijden > 0;
  const drank = ml > 0;
  const pillen = (supplementen?.genomen ?? 0) > 0;
  const gevoel = stemming != null;
  const iets = ietsOpgegeven ?? (eten || drank || pillen || gevoel);
  // BESLISSING 278: de dag is rond als eten, supplementen en drinkdoel in orde zijn; de stemming telt niet mee.
  const { etenOk, supplementenOk, drinkenOk } = dagOnderdelen({ etenKlaar, maaltijden, supplementen, ml, doelMl });
  const rond = etenOk && supplementenOk && drinkenOk;
  const heeftSupp = (supplementen?.totaal ?? 0) > 0;
  const K = (groep, waarden = {}, zonder = []) => kies(groep, datum, { waarden, zonder, schuif: reactie?.teller ?? 0 });
  const op = (lijst, aantal) => MIJLPALEN[lijst].includes(aantal);

  // 1. Het verleden: bij het openen, of als wat ze net deed de dag begon.
  if (iets && (!reactie || n.iets)) {
    if (dagenBijgehouden === 1 && v.eersteDatum === datum) return K('eersteDag');
    if (dagenSindsVorige != null && dagenSindsVorige >= 15) return K('terugLang');
    if (dagenSindsVorige != null && dagenSindsVorige >= 4) return K('terug');
    if ((v.besteEerdereReeks ?? 0) >= 3 && lopendeReeks === v.besteEerdereReeks + 1) return K('record', { aantal: lopendeReeks });
    if (isReeksMijlpaal(lopendeReeks)) return K('reeks', { aantal: lopendeReeks });
    if (v.eersteDatum && op('totaal', dagenBijgehouden)) return K('totaal', { aantal: dagenBijgehouden });
    const periode = jubileumOp(v.eersteDatum, datum);
    if (periode) return K('jubileum', { periode });
    if (dagenSindsVorige === 2 || dagenSindsVorige === 3) return K('terugKort');
  }

  // 2. Medailles: bij het openen die van vandaag, na een handeling alleen wat net behaald is.
  const medailles = reactie ? (n.badges ?? []) : iets ? (b.vandaag ?? []) : [];
  if (medailles.length) {
    if (b.aantal && b.aantal === b.totaal) return K('badgeAlle');
    if (!reactie && op('badges', b.aantal)) return K('badgeTelling', { aantal: b.aantal });
    if (medailles.length >= 2) return K('badgeMeer', { aantal: medailles.length });
    if (GROEPEN['m-' + medailles[0]]) return K('m-' + medailles[0]);
  }

  // 3. De hele dag: bij het openen, of als wat ze net deed de dag rond maakte.
  if (rond && (!reactie || n.rond)) {
    if (op('rond', tot.rondeDagen)) return K('rondTotaal', { aantal: tot.rondeDagen });
    if ((v.rondReeks ?? 0) >= 2) return K('dagRondReeks', { aantal: v.rondReeks });
    // De eerste zin noemt de supplementen: alleen voor wie er heeft.
    return K('dagRond', {}, heeftSupp ? [] : [1]);
  }

  // 4. Wat ze net deed.
  if (reactie) {
    // Een medaille die door deze stap heel dichtbij kwam of halfweg is (niet als de stap zelf iets afmaakte).
    if (n.stap && b.volgende && !n.doel && !n.supp && !n.eten) {
      const { id, aantal, doel } = b.volgende;
      if (doel >= 3 && doel - aantal === 1) return K('badgeBijna', { badge: id });
      if (doel >= 10 && aantal * 2 === doel) return K('badgeHalf', { badge: id });
    }
    switch (reactie.soort) {
      case 'maaltijd':
        if (op('maaltijden', tot.maaltijden)) return K('maaltijdenTotaal', { aantal: tot.maaltijden });
        if (n.eten) return K('etenKlaar');
        return maaltijden <= 1 ? K('eersteMaaltijd') : K('maaltijd');
      case 'gevoel':
        return K('maaltijdGevoel');
      case 'drank':
        if (drinkenOk) {
          if (n.doel && op('doel', tot.doelDagen)) return K('doelTotaal', { aantal: tot.doelDagen });
          if (n.doel && (v.doelReeks ?? 0) >= 3) return K('drinkenReeks', { aantal: v.doelReeks });
          return K('drinkenKlaar');
        }
        if (doelMl > 0 && ml >= doelMl * 0.75) return K('drinkenBijna');
        if (doelMl > 0 && ml >= doelMl * 0.5) return K('drinkenHalf');
        if ((v.gisterenMl ?? 0) > 0 && ml > v.gisterenMl && (n.mlVoor ?? 0) <= v.gisterenMl) return K('drinkenMeer');
        return drankenAantal <= 1 ? K('eersteDrank') : K('drank');
      case 'periodiek':
        return K('periodiek');
      case 'inname':
        if (heeftSupp && supplementenOk) {
          if (n.supp && op('supplement', tot.volledigeDagen)) return K('supplementTotaal', { aantal: tot.volledigeDagen });
          if (n.supp && (v.suppReeks ?? 0) >= 3) return K('supplementenReeks', { aantal: v.suppReeks });
          return K('supplementenKlaar');
        }
        if (n.moment) return K('supplementMoment');
        // De eerste zin zegt "je eerste supplement van vandaag": alleen bij het eerste vinkje.
        return K('supplementEerste', {}, (supplementen?.genomen ?? 0) > 1 ? [1] : []);
      case 'stemming':
        if (n.eersteStemming && op('stemming', tot.stemmingDagen)) return K('stemmingTotaal', { aantal: tot.stemmingDagen });
        if (stemming >= 4 && (v.stemmingReeks ?? 0) >= 3) return K('stemmingReeks', { aantal: v.stemmingReeks });
        return K(stemming <= 1 ? 'stemmingLaag' : stemming <= 3 ? 'stemmingMidden' : 'stemmingHoog');
      case 'energie':
        return K(energie != null && energie <= 2 ? 'energieLaag' : 'energie');
      case 'notitie':
        if (n.eersteNotitie && op('notitie', tot.notitieDagen)) return K('notitieTotaal', { aantal: tot.notitieDagen });
        return K('notitie');
      case 'weging':
        if (n.eersteWeging && op('weging', tot.wegingen)) return K('wegingTotaal', { aantal: tot.wegingen });
        if ((v.wegingReeks ?? 0) >= 3) return K('wegingReeks', { aantal: v.wegingReeks });
        return K('weging');
      case 'favoriet':
        if (op('favoriet', tot.favorieten)) return K('favorietTotaal', { aantal: tot.favorieten });
        return K('favoriet');
      case 'verslag':
      case 'vorigeDag':
      case 'aangepast':
      case 'eigen':
      case 'herinnering':
      case 'slot':
      case 'dagdoel':
      case 'supplementLijst':
      case 'rondleiding':
        return K(reactie.soort);
      default:
    }
  }

  // 5. De stand van de dag.
  const deelNaam = DAGDEEL_NAAM[dagdeel] ?? null;
  // Alleen een medaille waar elke bijgehouden dag voor telt: dan klopt "vandaag kan er een stap bij" altijd.
  const dagBadge = b.volgendeDag ?? (b.volgende?.dagTeller ? b.volgende : null);
  if (!iets) {
    const gisteren = b.gisteren ?? [];
    if (gisteren.length) return K('badgeGisteren', { badge: gisteren[gisteren.length - 1] });
    if (v.gisterenRond) return K('beginNaRond');
    if (datum.endsWith('-01') && (v.vorigeMaandDagen ?? 0) >= 1) return K('nieuweMaand', { aantal: v.vorigeMaandDagen });
    if (weekdag(datum) === 1 && v.eersteDatum) return K('beginWeek');
    if (v.gisterenDoel) return K('beginNaDoel');
    const groepen = ['begin'];
    if (deelNaam) groepen.push('begin' + deelNaam);
    if (lopendeReeks >= 2) groepen.push('beginReeks');
    if (dagBadge) groepen.push('beginBadge');
    const groep = wissel(groepen, datum);
    return K(groep, groep === 'beginReeks' ? { aantal: lopendeReeks } : groep === 'beginBadge' ? { badge: dagBadge.id } : {});
  }
  // Nog één onderdeel en de dag is rond (alleen voor wie supplementen heeft: de zinnen noemen ze).
  if (heeftSupp) {
    if (etenOk && supplementenOk && !drinkenOk && doelMl > 0) return ml >= doelMl * 0.75 ? K('drinkenBijna') : K('bijnaRondDrinken');
    if (etenOk && drinkenOk && !supplementenOk) return K('bijnaRondSupplementen');
    if (supplementenOk && drinkenOk && !etenOk) return K('bijnaRondEten');
  }
  if (drinkenOk) return K('drinkenKlaar');
  if (heeftSupp && supplementenOk) return K('supplementenKlaar');
  if (doelMl > 0 && ml >= doelMl * 0.75) return K('drinkenBijna');
  const groepen = ['onderweg'];
  if (deelNaam) groepen.push('onderweg' + deelNaam);
  if (dagBadge && dagBadge.aantal > 0) groepen.push('badgeStap');
  if (weekdag(datum) === 7 && (v.weekDagen ?? 0) >= 1) groepen.push('weekEinde');
  const groep = wissel(groepen, datum);
  return K(groep, groep === 'badgeStap' ? { badge: dagBadge.id } : groep === 'weekEinde' ? { aantal: v.weekDagen } : {});
}

// De sleutel alleen, zoals voorheen (de zin kan {aantal}, {badge} of {periode} bevatten: gebruik kiesMotivatie om ze in te vullen).
export function kiesZin(status) {
  return kiesMotivatie(status).sleutel;
}

// ---------------------------------------------------------------- de zin van de week
// info (optioneel, data/verleden.js weekVerleden): { eersteWeek, volleWeken (volle weken na elkaar tot en met deze), besteEerdere (de meeste
// dagen in een eerdere week, of null), vorigeWeek (dagen in de week ervoor, of null) }. Een vergelijking komt er alleen als ze gunstig is.
export function kiesWeekMotivatie(ingevuldeDagen, weekSleutel, info = {}) {
  const { eersteWeek = false, volleWeken = 0, besteEerdere = null, vorigeWeek = null } = info ?? {};
  const d = ingevuldeDagen;
  let groep;
  let waarden = {};
  if (eersteWeek && d >= 1 && d < 7) groep = 'weekEerste';
  else if (d >= 7 && volleWeken >= 2) [groep, waarden] = ['weekVolReeks', { aantal: volleWeken }];
  else if (d >= 7) groep = 'week7';
  else if (d >= 4 && besteEerdere != null && besteEerdere >= 1 && d > besteEerdere) [groep, waarden] = ['weekRecord', { aantal: d }];
  else if (vorigeWeek != null && vorigeWeek >= 1 && d > vorigeWeek) [groep, waarden] = ['weekMeer', { aantal: d }];
  else groep = d >= 4 ? 'week4' : d >= 1 ? 'week1' : 'week0';
  const nr = (getalUit(weekSleutel + groep) % WEEKGROEPEN[groep]) + 1;
  return { groep, sleutel: `motivatie.${groep}.${nr}`, waarden };
}
// Eén zin voor het weekoverzicht (alleen de sleutel).
export function kiesWeekZin(ingevuldeDagen, weekSleutel, info) {
  return kiesWeekMotivatie(ingevuldeDagen, weekSleutel, info).sleutel;
}
