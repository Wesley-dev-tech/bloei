// Onthoudt tijdens deze sessie de stand van vandaag en wat er sinds de vorige tekening van Vandaag gebeurde, zodat de motivator kan
// reageren op wat ze net deed (logica/motivatie.js, reactieUit). De reactie zelf wordt niet bewaard: na herladen kijkt de zin weer naar de
// stand van de dag.
// Wat wel bewaard wordt, per dag (instelling 'motivatie.dag'): de hoeveelste keer ze de app vandaag opent en welke momenten (een mijlpaal, een
// medaille) ze al zag. Zo krijgt ze bij elke opening een andere zin en blijft een mijlpaal niet de hele dag staan (openingVoor, noteerMoment).
import { luister, zend } from '../kern/bus.js';
import { reactieUit } from '../logica/motivatie.js';
import { db } from './db.js';

let stand = null; // { datum, tel, reactie: { soort, nieuw, teller } | null, teller }
let gebeurd = null; // { stores: [], eerder: boolean, soort: string | null }

const noteer = (wijziging) => {
  if (!stand) return; // pas na de eerste tekening van Vandaag: wat de app bij het starten zelf bewaart, is geen handeling
  gebeurd ??= { stores: [], eerder: false, soort: null };
  wijziging(gebeurd);
};

// Een instelling die ze zelf koos, als soort handeling (of null: tellers en hulpwaarden die de app zelf bijhoudt).
function soortVanInstelling(sleutel, waarde) {
  if (sleutel.startsWith('thema.') || sleutel === 'profiel.naam' || sleutel === 'profiel.avatar') return 'eigen';
  if (sleutel === 'drinken.dagdoelMl' || sleutel === 'drinken.glasMl' || sleutel === 'drinken.groottes') return 'dagdoel';
  if (sleutel === 'slot.aan') return waarde ? 'slot' : null;
  if (sleutel === 'meldingen.dagboek' || sleutel === 'meldingen.drinken' || sleutel === 'meldingen.supplementenUren') {
    return [waarde].flat().some((m) => m?.aan) ? 'herinnering' : null;
  }
  return null;
}

luister('data:gewijzigd', ({ store, datum } = {}) => {
  if (store === '*') {
    // Alles gewist of vervangen: de stand begint opnieuw.
    stand = null;
    gebeurd = null;
    return;
  }
  noteer((g) => {
    g.stores = g.stores.filter((s) => s !== store).concat(store);
    if (datum && stand && datum < stand.datum) g.eerder = true;
  });
});
luister('instelling:gewijzigd', ({ sleutel, waarde } = {}) => {
  const soort = soortVanInstelling(String(sleutel ?? ''), waarde);
  if (soort) noteer((g) => (g.soort = soort));
});
luister('verslag:gemaakt', () => noteer((g) => (g.soort = 'verslag')));
luister('uitleg:klaar', () => noteer((g) => (g.soort = 'rondleiding')));

// De reactie die nu bij Vandaag hoort, of null (de app is net geopend, of er gebeurde nog niets). tel: de stand van vandaag (schermen/vandaag.js).
export function reactieVoor(datum, tel) {
  if (!stand || stand.datum !== datum) {
    stand = { datum, tel, reactie: null, teller: 0 };
    gebeurd = null;
    return null;
  }
  if (gebeurd) {
    const r = reactieUit(stand.tel, tel, gebeurd);
    if (r) {
      stand.teller += 1;
      stand.reactie = { ...r, teller: stand.teller };
    }
    gebeurd = null;
  } else if (stand.reactie) {
    // Een medaille wordt kort na de handeling toegekend (data/badges.js): ze hoort nog bij wat ze net deed.
    const erbij = (tel.badges ?? []).filter((id) => !(stand.tel.badges ?? []).includes(id));
    if (erbij.length) stand.reactie = { ...stand.reactie, nieuw: { ...stand.reactie.nieuw, badges: [...(stand.reactie.nieuw.badges ?? []), ...erbij] } };
  }
  stand.tel = tel;
  return stand.reactie;
}

// ---- De opening: de hoeveelste keer vandaag, en wat ze al zag ----
// Een opening is: de app start, of ze komt terug nadat de app minstens vijf minuten uit beeld was. Binnen één opening blijft alles vast,
// zodat de zin niet verspringt als Vandaag opnieuw getekend wordt.
const SLEUTEL = 'motivatie.dag'; // { datum, openingen, gehad: [moment, ...] }
const WEG_MS = 5 * 60 * 1000;
let dag = null; // { datum, nummer, gehad (wat ze voor deze opening al zag), bewaard (alles wat ze vandaag zag), weer? (Vandaag zet de weersoort van deze opening erbij) }
let dagBezig = null;

// Rechtstreeks in de database, zonder 'instelling:gewijzigd': het is een teller van de app zelf en Vandaag hoeft er niet voor te hertekenen.
const bewaarDag = () => db.instellingen.put({ sleutel: SLEUTEL, waarde: { datum: dag.datum, openingen: dag.nummer + 1, gehad: dag.bewaard } }).catch(() => {});

// openingVoor(datum) → { nummer, gehad }: nummer telt vanaf 0, gehad zijn de momenten uit eerdere openingen van vandaag.
export async function openingVoor(datum) {
  if (dag?.datum === datum) return dag;
  dagBezig ??= (async () => {
    let rij = null;
    try {
      rij = (await db.instellingen.get(SLEUTEL))?.waarde ?? null;
    } catch {
      rij = null; // zonder database: gewoon de eerste opening
    }
    const zelfde = rij?.datum === datum;
    const gehad = zelfde && Array.isArray(rij.gehad) ? rij.gehad.filter((m) => typeof m === 'string') : [];
    dag = { datum, nummer: zelfde && Number.isInteger(rij.openingen) && rij.openingen > 0 ? rij.openingen : 0, gehad, bewaard: [...gehad] };
    await bewaarDag();
    dagBezig = null;
    return dag;
  })();
  return dagBezig;
}

// Het moment dat de zin van nu toont (kiesMotivatie geeft het mee): bij een volgende opening komt het niet meer terug.
export function noteerMoment(datum, moment) {
  if (!moment || dag?.datum !== datum || dag.bewaard.includes(moment)) return;
  dag.bewaard.push(moment);
  bewaarDag();
}

// Terug na minstens vijf minuten uit beeld: een nieuwe opening. De reactie van daarnet hoort bij het vorige bezoek, en Vandaag tekent
// opnieuw ('motivatie:opnieuw') met de zin van deze opening.
let wegSinds = null;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      wegSinds = Date.now();
      return;
    }
    const lang = wegSinds != null && Date.now() - wegSinds >= WEG_MS;
    wegSinds = null;
    if (!lang || !stand) return;
    stand = null;
    gebeurd = null;
    dag = null;
    zend('motivatie:opnieuw');
  });
}

// Alleen voor tests.
export function wisMotivatiestand() {
  stand = null;
  gebeurd = null;
  dag = null;
  dagBezig = null;
  wegSinds = null;
}
