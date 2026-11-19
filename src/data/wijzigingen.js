// Wat er per versie veranderde, in de woorden van de app zelf (BESLISSING 701). Eén lijst, nieuwste versie bovenaan.
// De versie moet letterlijk gelijk zijn aan "version" in package.json: alleen dan toont Bloei na een update het blad
// "Nieuw in Bloei <versie>" (src/ui/watisnieuw.js). Een versie zonder regel hier toont niets; dat is gewoon stil.
//
// Elke punt: { begrip, tekst }. begrip is een naam uit de iconenkaart (src/ui/iconenkaart.js), zodat de punt het icoon en de
// kleurfamilie van zijn onderwerp krijgt: drinken, gewicht, dagboek, supplementen, uitleg, instellingen, ...
// Hou de zinnen kort en in de taal van de app: wat zij nu ziet, niet wat er in de code veranderde.
export const WIJZIGINGEN = [
  {
    versie: '0.2.0',
    datum: '2026-11-19',
    punten: [
      { begrip: 'drinken', tekst: 'De dranktegel "Iets anders" heet nu "Glas water" en heeft een glas als icoon.' },
      { begrip: 'gewicht', tekst: 'Op Gewicht staan de zinnen onder een kaarttitel allemaal in dezelfde opmaak.' },
      { begrip: 'uitleg', tekst: 'Na een update zie je voortaan in het kort wat er veranderd is. Je vindt het ook terug bij Over.' },
    ],
  },
];

export const wijzigingenVan = (versie) => WIJZIGINGEN.find((w) => w.versie === versie) ?? null;
export const nieuwsteWijziging = () => WIJZIGINGEN[0] ?? null;
