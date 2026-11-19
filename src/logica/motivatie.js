// Pure functies: welke warme zin past bij de dag (PLAN.md §15.2, beslissing 114).
// Ze geven alleen een tekstsleutel terug (bv. 'motivatie.onderweg.2'); de zinnen zelf staan in teksten.js.
//
// Wanneer welke groep? De eerste die klopt wint, in deze volgorde:
//   1. terug             vandaag staat de eerste invoer na minstens drie lege dagen (dagenSindsVorige >= 4).
//                        Welkom terug, zonder verwijt. Gaat voor alles, ook voor 'begin' en 'reeks'.
//   2. reeks             vandaag staat er iets in en de lopende reeks is precies 7, 14 of 30 dagen.
//   3. dagRond           eten, supplementen en drinkdoel zijn in orde (stemming telt niet mee, BESLISSING 278). Gaat voor de losse
//                        'klaar'-groepen: een volle dag verdient een zin over de hele dag.
//   4. drinkenKlaar      het dagdoel voor drinken (doelMl, nu 2,5 liter, uit de instellingen) is gehaald.
//   5. supplementenKlaar alle supplementen van de lijst zijn afgevinkt (er is minstens één).
//   6. drinkenBijna      vanaf 75 % van het dagdoel.
//   7. onderweg          er staat vandaag iets in (een maaltijd, een drank, een inname of een stemming).
//   8. begin             vandaag staat er nog niets in. Geen verwijt: een lege dag is gewoon begin.
// Binnen een groep hangt de zin af van de datum en niet van het toeval: dezelfde dag en dezelfde toestand
// geven altijd dezelfde zin, ook na herladen. Het dagdeel zit al in de status, maar bepaalt de zin niet.
// Er wordt nergens met een vast aantal liters gerekend: de status brengt doelMl mee.

// Aantal zinnen per groep (de zinnen staan in teksten.js, genummerd vanaf 1).
export const GROEPEN = {
  begin: 5,
  onderweg: 5,
  drinkenBijna: 5,
  drinkenKlaar: 5,
  supplementenKlaar: 5,
  dagRond: 5,
  terug: 5,
  reeks: 5,
};

// Groepen voor het weekoverzicht: 0, 1 tot 3, 4 tot 6 en 7 bijgehouden dagen.
export const WEEKGROEPEN = { week0: 3, week1: 3, week4: 3, week7: 3 };

// Een stabiel getal uit een tekst (som van tekens, geen toeval).
function getalUit(tekst) {
  let som = 0;
  for (const teken of String(tekst)) som = (som * 31 + teken.codePointAt(0)) % 100003;
  return som;
}

const sleutel = (groep, aantal, bron) => `motivatie.${groep}.${(getalUit(bron + groep) % aantal) + 1}`;

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

// status: { dagdeel, maaltijden, ml, doelMl, supplementen: { genomen, totaal }, stemming, lopendeReeks,
//           dagenBijgehouden, dagenSindsVorige: number | null, datum, iets?: boolean }
// iets (optioneel): of er vandaag iets genoteerd staat, zoals dagStatus(datum).bijgehouden dat bepaalt (BESLISSING 168); zonder iets rekent kiesZin het zelf uit.
export function kiesZin(status) {
  const { maaltijden = 0, ml = 0, doelMl = 0, supplementen = { genomen: 0, totaal: 0 }, stemming = null, lopendeReeks = 0, dagenSindsVorige = null, datum = '', iets: ietsOpgegeven, etenKlaar } = status ?? {};
  const eten = maaltijden > 0;
  const drank = ml > 0;
  const pillen = (supplementen?.genomen ?? 0) > 0;
  const gevoel = stemming != null;
  const iets = ietsOpgegeven ?? (eten || drank || pillen || gevoel);
  // BESLISSING 278: de dag is rond als eten, supplementen en drinkdoel in orde zijn; de stemming telt niet mee.
  // Eten in orde: etenKlaar uit de status (ontbijt, middagmaal en avondmaal ingevuld, zoals op Vandaag); zonder dat veld minstens drie maaltijden.
  const { etenOk, supplementenOk, drinkenOk } = dagOnderdelen({ etenKlaar, maaltijden, supplementen, ml, doelMl });

  let groep;
  if (iets && dagenSindsVorige != null && dagenSindsVorige >= 4) groep = 'terug';
  else if (iets && [7, 14, 30].includes(lopendeReeks)) groep = 'reeks';
  else if (etenOk && supplementenOk && drinkenOk) groep = 'dagRond';
  else if (iets && etenOk && supplementenOk && doelMl > 0) groep = ml >= doelMl * 0.75 ? 'drinkenBijna' : 'onderweg'; // alleen het drinken ontbreekt
  else if (doelMl > 0 && ml >= doelMl) groep = 'drinkenKlaar';
  else if ((supplementen?.totaal ?? 0) > 0 && supplementen.genomen >= supplementen.totaal) groep = 'supplementenKlaar';
  else if (doelMl > 0 && ml >= doelMl * 0.75) groep = 'drinkenBijna';
  else if (iets) groep = 'onderweg';
  else groep = 'begin';

  return sleutel(groep, GROEPEN[groep], datum);
}

// Eén zin voor het weekoverzicht, zonder vergelijking met een andere week.
export function kiesWeekZin(ingevuldeDagen, weekSleutel) {
  const groep = ingevuldeDagen >= 7 ? 'week7' : ingevuldeDagen >= 4 ? 'week4' : ingevuldeDagen >= 1 ? 'week1' : 'week0';
  return sleutel(groep, WEEKGROEPEN[groep], weekSleutel);
}
