// Rekenwerk voor het tabblad Gewicht (BESLISSING 289): de kerncijfers, de weg naar het streefgewicht en de weegkalender.
// Zuivere functies zonder opslag of DOM. Neutraal: een verschil heeft alleen een teken, nooit een oordeel.
// Wegingen: oplopend op week, één per week: { week (de maandag), datum, kg }.
import { MAANDEN_KORT, plusDagen, weekStart } from '../kern/datum.js';
import { opEenDecimaal } from '../kern/getal.js';

// Later op te ruimen: schermen/gewicht.js haalt MAANDEN_KORT nog hier; de bron is kern/datum.js.
export { MAANDEN_KORT };

// Alle cijfers van "Verloop in cijfers". Een cijfer dat nog niets zegt (een verschil met één weging) is null.
// - sindsVorige: laatste min de weging daarvoor (de vorige die er is, ook als er een week tussen zit)
// - sindsEerste: laatste min eerste
// - laagste en hoogste: de waarde met de datum; bij gelijke waarden de meest recente
// - maand: gemiddelde (op één decimaal) van de wegingen in de lopende maand en hoeveel het er zijn; null zonder wegingen die maand
export function verloopCijfers(wegingen, vandaagSleutel) {
  const lijst = [...wegingen].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
  if (lijst.length === 0) {
    return { aantal: 0, eerste: null, laatste: null, vorige: null, sindsVorige: null, sindsEerste: null, laagste: null, hoogste: null, maand: null };
  }
  const eerste = lijst[0];
  const laatste = lijst.at(-1);
  const vorige = lijst.length >= 2 ? lijst.at(-2) : null;
  let laagste = lijst[0];
  let hoogste = lijst[0];
  for (const w of lijst) {
    if (w.kg <= laagste.kg) laagste = w;
    if (w.kg >= hoogste.kg) hoogste = w;
  }
  const maandSleutel = vandaagSleutel.slice(0, 7);
  const dezeMaand = lijst.filter((w) => w.datum.startsWith(maandSleutel));
  return {
    aantal: lijst.length,
    eerste,
    laatste,
    vorige,
    sindsVorige: vorige ? opEenDecimaal(laatste.kg - vorige.kg) : null,
    sindsEerste: lijst.length >= 2 ? opEenDecimaal(laatste.kg - eerste.kg) : null,
    laagste: { kg: laagste.kg, datum: laagste.datum },
    hoogste: { kg: hoogste.kg, datum: hoogste.datum },
    maand: dezeMaand.length ? { gemiddelde: opEenDecimaal(dezeMaand.reduce((som, w) => som + w.kg, 0) / dezeMaand.length), aantal: dezeMaand.length } : null,
  };
}

// De weg van het startgewicht (de eerste weging) naar het streefgewicht, in beide richtingen.
// fractie: 0 = nog op de start (of verder ervandaan), 1 = bij het streefgewicht of voorbij. rest: hoeveel kg er nog scheelt (≥ 0).
// bereikt: op of voorbij het streefgewicht, in de richting van start naar streef. Null als er een waarde ontbreekt.
export function voortgangNaarStreef(start, nu, streef) {
  if (start == null || nu == null || streef == null) return null;
  const s = Math.round(start * 10);
  const n = Math.round(nu * 10);
  const z = Math.round(streef * 10);
  const totaal = z - s;
  let bereikt;
  let fractie;
  if (totaal === 0) {
    bereikt = n === z;
    fractie = bereikt ? 1 : 0;
  } else {
    const richting = Math.sign(totaal);
    bereikt = richting * (n - z) >= 0;
    fractie = bereikt ? 1 : Math.min(1, Math.max(0, (n - s) / totaal));
  }
  return { fractie, bereikt, rest: bereikt ? 0 : Math.abs(z - n) / 10, richting: Math.sign(totaal) };
}

// De laatste `aantal` weken (oudste eerst, de lopende week laatst), elk met de maandag van die week als datum: een weging telt op
// elke dag van de week.
// - gevuld: er is in die week een weging
// - voorEerste: de week ligt voor haar eerste weging (telt niet als gemist)
// - isNu: de lopende week
// - maandWissel: de week waarin de maand (van de datum) wisselt t.o.v. de week ervoor, en de allereerste; met het label van de maand
export function weekKalender(wegingen, vandaagSleutel, aantal = 12) {
  const gewogen = new Set(wegingen.map((w) => w.week));
  const eersteWeek = wegingen.length ? wegingen.reduce((m, w) => (w.week < m ? w.week : m), wegingen[0].week) : null;
  const nu = weekStart(vandaagSleutel);
  const weken = [];
  for (let i = aantal - 1; i >= 0; i--) {
    const week = plusDagen(nu, -7 * i);
    const datum = week;
    const maand = Number(datum.slice(5, 7)) - 1;
    const vorige = weken.at(-1);
    weken.push({
      week,
      datum,
      gevuld: gewogen.has(week),
      voorEerste: eersteWeek == null || week < eersteWeek,
      isNu: week === nu,
      maandLabel: !vorige || vorige.maand !== maand ? MAANDEN_KORT[maand] : null,
      maand,
    });
  }
  return weken;
}

// "Gewogen in X van de laatste N weken": alleen weken vanaf haar eerste weging tellen. De lopende week telt pas mee als ze
// gewogen heeft; zolang ze nog kan, is ze niet gemist.
export function wekenGewogen(weken) {
  const tellend = weken.filter((w) => !w.voorEerste && (w.gevuld || !w.isNu));
  return { gewogen: tellend.filter((w) => w.gevuld).length, van: tellend.length };
}
