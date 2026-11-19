// De kleurnamen in de teksten van de uitleg (BESLISSING 648; de namen zelf: BESLISSING 653).
// Een tekst die een kleur noemt, noemt de kleur die op dat scherm en in dat thema echt te zien is. Daarom staat er in de tekst geen
// kleurwoord maar een plaatshouder: {kleur.<rol>} (de gewone vorm, "een groen bolletje") of {kleur.<rol>:bij} (de verbogen vorm,
// "het paarse rondje"). vulKleuren vult ze in voor het scherm waarop de stap loopt en het thema van dat moment.
//
// De tabel: per rol (welk element de tekst bedoelt), per scherm (de route in #scherm[data-scherm], met alles eronder: "dagboek" geldt ook
// voor dagboek/maand) en per thema (poeder, salie, nacht). Een naam wijzigen gebeurt alleen hier.
//   klaar:   het bolletje "alle supplementen genomen" (Vandaag .kalender__klaar, Supplementen .weekdag.is-klaar .weekdag__bol,
//            Dagboek maand .mk__klaar)
//   vandaag: het rondje van vandaag in de kalender (Vandaag .kalender__dag.is-vandaag, Dagboek maand .mk__dag.is-vandaag)
// De schermtest tests/e2e/c-kleurnamen.spec.js leest de echte kleur van die elementen en eist dat de naam erbij past: verandert een kleur
// in de stijl, dan wordt die test rood tot de naam hier mee verandert.

const naam = (gewoon, bij = gewoon) => ({ gewoon, bij });
const inElkThema = (n) => ({ poeder: n, salie: n, nacht: n });

export const KLEURNAMEN = {
  klaar: {
    vandaag: inElkThema(naam('salie')),
    supplementen: inElkThema(naam('salie')),
    dagboek: { poeder: naam('bruin', 'bruine'), salie: naam('bruin', 'bruine'), nacht: naam('roze') },
  },
  vandaag: {
    vandaag: inElkThema(naam('paars', 'paarse')),
    dagboek: inElkThema(naam('paars', 'paarse')),
  },
};

export const THEMAS = ['poeder', 'salie', 'nacht'];
export const PLAATSHOUDER = /\{kleur\.([A-Za-z]+)(:bij)?\}/g;

// Het scherm van de tabel bij een route: "dagboek/maand" hoort bij "dagboek".
function schermIn(tabel, scherm) {
  const s = String(scherm || '');
  return Object.keys(tabel).find((k) => s === k || s.startsWith(k + '/')) ?? null;
}

// De naam voor een rol op een scherm in een thema, of null als ze er niet is. vorm: 'gewoon' of 'bij'.
export function kleurnaam(rol, { scherm, thema } = {}, vorm = 'gewoon') {
  const perScherm = KLEURNAMEN[rol];
  if (!perScherm) return null;
  const s = schermIn(perScherm, scherm);
  const n = s ? perScherm[s][thema || 'poeder'] : null;
  return n ? n[vorm] : null;
}

// Vult de plaatshouders in. Een onbekende rol of een ontbrekende naam: een duidelijke fout in de console, en de plaatshouder verdwijnt
// (er blijft nooit "{kleur...}" zichtbaar staan).
export function vulKleuren(tekst, { scherm, thema } = {}) {
  const x = String(tekst ?? '');
  if (!x.includes('{kleur.')) return x;
  const th = thema || 'poeder';
  return x
    .replace(PLAATSHOUDER, (_, rol, bij) => {
      const n = kleurnaam(rol, { scherm, thema: th }, bij ? 'bij' : 'gewoon');
      if (n) return n;
      console.error(`Kleurnaam ontbreekt: {kleur.${rol}${bij || ''}} op scherm "${scherm || ''}" in thema "${th}" (src/uitleg/kleurnamen.js).`);
      return '';
    })
    .replace(/ {2,}/g, ' ')
    .replace(/ ([.,:;!?])/g, '$1');
}
