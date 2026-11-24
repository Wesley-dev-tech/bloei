// Onthoudt tijdens deze sessie de stand van vandaag en wat er sinds de vorige tekening van Vandaag gebeurde, zodat de motivator kan
// reageren op wat ze net deed (logica/motivatie.js, reactieUit). Niets wordt bewaard: na herladen kijkt de zin weer naar de stand van de dag.
import { luister } from '../kern/bus.js';
import { reactieUit } from '../logica/motivatie.js';

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

// Alleen voor tests.
export function wisMotivatiestand() {
  stand = null;
  gebeurd = null;
}
