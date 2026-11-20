// Wat er per versie veranderde, in de woorden van de app zelf (BESLISSING 701). Eén lijst, nieuwste versie bovenaan.
// De versie moet letterlijk gelijk zijn aan "version" in package.json: alleen dan toont Bloei na een update het blad
// "Nieuw in Bloei <versie>" (src/ui/watisnieuw.js). Een versie zonder regel hier toont niets; dat is gewoon stil.
//
// Elke versie: { versie, datum (JJJJ-MM-DD), tijd ('UU:MM', het uur waarop ze uitging; mag weg), punten }.
// Elke punt: { begrip, tekst }. begrip is een naam uit de iconenkaart (src/ui/iconenkaart.js), zodat de punt het icoon en de
// kleurfamilie van zijn onderwerp krijgt: drinken, gewicht, dagboek, supplementen, uitleg, instellingen, ...
// Hou de zinnen kort en in de taal van de app: wat zij nu ziet, niet wat er in de code veranderde.
export const WIJZIGINGEN = [
  {
    versie: '0.2.3',
    datum: '2026-11-20',
    tijd: '10:15',
    punten: [{ begrip: 'drinken', tekst: 'Bij de grootte van je dranken kom je nu op ronde maten uit, zoals 500 ml voor frisdrank. De standaardmaat blijft een halte.' }],
  },
  {
    versie: '0.2.2',
    datum: '2026-11-19',
    tijd: '23:05',
    punten: [
      { begrip: 'drinken', tekst: 'Kan water heeft een eigen kan als icoon, zodat je ze niet meer verwart met Glas water.' },
      { begrip: 'uitleg', tekst: 'Bij Over kijk je nu terug naar alles wat er in vorige versies veranderde.' },
      { begrip: 'herinneringen', tekst: 'De melding van een nieuwe versie blijft staan tot je op Updaten tikt.' },
    ],
  },
  {
    versie: '0.2.1',
    datum: '2026-11-19',
    tijd: '22:30',
    punten: [
      { begrip: 'gewicht', tekst: 'De zinnen op Gewicht staan nu in dezelfde letter en maat als de regels in Goed om te weten.' },
      { begrip: 'weegdag', tekst: 'De datum onder je weegdag heeft dezelfde maat als de tekst op de kaarten ernaast.' },
    ],
  },
  {
    versie: '0.2.0',
    datum: '2026-11-19',
    tijd: '21:58',
    punten: [
      { begrip: 'drinken', tekst: 'De dranktegel "Iets anders" heet nu "Glas water" en heeft een glas als icoon.' },
      { begrip: 'gewicht', tekst: 'Op Gewicht staan de zinnen onder een kaarttitel allemaal in dezelfde opmaak.' },
      { begrip: 'uitleg', tekst: 'Na een update zie je voortaan in het kort wat er veranderd is. Je vindt het ook terug bij Over.' },
    ],
  },
];

export const wijzigingenVan = (versie) => WIJZIGINGEN.find((w) => w.versie === versie) ?? null;
export const nieuwsteWijziging = () => WIJZIGINGEN[0] ?? null;

// Versies vergelijken zoals ze genummerd zijn (0.10.0 is nieuwer dan 0.9.0). Een deel dat geen getal is, telt als 0.
// Geeft een negatief getal als a ouder is dan b, 0 bij gelijk, een positief getal als a nieuwer is.
export function vergelijkVersies(a, b) {
  const delen = (v) => String(v ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [delen(a), delen(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const verschil = (x[i] ?? 0) - (y[i] ?? 0);
    if (verschil !== 0) return verschil;
  }
  return 0;
}

// Alles wat nieuwer is dan de versie die de gebruiker al zag, tot en met de versie die nu draait, nieuwste eerst.
// Zo mist wie twee of drie updates in één keer binnenhaalt niets: alle tussenliggende versies staan in hetzelfde blad.
// Zonder gezien (een toestel dat de sleutel nog niet heeft) alleen de versie die nu draait: wat daarvoor kwam, kende dit toestel al.
export function wijzigingenSinds(gezien, tot) {
  if (!gezien) {
    const enkel = wijzigingenVan(tot);
    return enkel ? [enkel] : [];
  }
  return WIJZIGINGEN.filter((w) => vergelijkVersies(w.versie, gezien) > 0 && vergelijkVersies(w.versie, tot) <= 0).sort((a, b) => vergelijkVersies(b.versie, a.versie));
}
