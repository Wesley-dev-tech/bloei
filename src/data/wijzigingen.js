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
    versie: '0.4.5',
    datum: '2026-11-25',
    tijd: '08:50',
    punten: [
      { begrip: 'profiel', tekst: 'Bloei vraagt één keer naar je geboortedatum. Het hoeft niet, en later kan het nog onder Algemeen, Naam en foto.' },
      { begrip: 'profiel', tekst: 'Op je verjaardag is het feest bij het openen, met confetti, ballonnen en een slinger, en krijg je de hele dag je eigen zinnen.' },
      { begrip: 'algemeen', tekst: 'Bij de jaarwissel is er vuurwerk: precies om middernacht als Bloei openstaat, anders op 1 januari.' },
      { begrip: 'algemeen', tekst: 'De warme zin kent nu de Belgische feestdagen, de seizoenen en het uur van de dag.' },
      { begrip: 'algemeen', tekst: 'Elke warme zin is korter en past nu op twee regels.' },
      { begrip: 'algemeen', tekst: 'Drie nieuwe medailles rond je verjaardag, in de groep Je verjaardag.' },
      { begrip: 'badge', tekst: 'Voor elke feestdag is er een medaille: noteer iets op die dag. Die medailles en die van je verjaardag behaal je elk jaar opnieuw.' },
      { begrip: 'badge', tekst: 'Elke medaille heeft nu haar eigen icoon. Zo zien je behaalde medailles er niet meer allemaal hetzelfde uit.' },
      { begrip: 'badge', tekst: 'De ultieme medaille heet In volle bloei: je krijgt ze als je alle andere behaalde, met een eigen feest.' },
      { begrip: 'vergrendeling', tekst: 'Je geboortedatum blijft op je toestel. Dat staat nu ook bij Privacy en in de rondleidingen.' },
    ],
  },
  {
    versie: '0.4.4',
    datum: '2026-11-24',
    tijd: '21:27',
    punten: [
      { begrip: 'algemeen', tekst: 'Er zijn nu 100 medailles in plaats van 33, met twee nieuwe groepen: Bloei leren kennen en Je verzameling.' },
      { begrip: 'algemeen', tekst: 'Wat je al deed, telt mee: de medailles die je daardoor al hebt, staan er met de dag waarop je ze verdiende.' },
      { begrip: 'algemeen', tekst: 'Elke nieuwe medaille heeft haar eigen zin op Vandaag op de dag dat je ze behaalt.' },
      { begrip: 'delen', tekst: 'Bloei telt vanaf nu je verslagen, voor de medailles Vijf verslagen en Tien verslagen.' },
    ],
  },
  {
    versie: '0.4.3', // ging op 24 november eerst uit als 0.5.0: een fout nummer, hersteld in 0.4.4 (zie gezienVersie hieronder)
    datum: '2026-11-24',
    tijd: '21:01',
    punten: [
      { begrip: 'algemeen', tekst: 'De warme zin op Vandaag reageert nu op wat je net deed: een maaltijd, een drank, een vinkje, je stemming, een notitie of een weging.' },
      { begrip: 'algemeen', tekst: 'De zin kent je dagboek: je reeks, je totaal aantal dagen en hoe lang je Bloei al gebruikt.' },
      { begrip: 'algemeen', tekst: 'Elke medaille heeft haar eigen zin op de dag dat je ze behaalt, en de zin zegt het als een medaille dichtbij is.' },
      { begrip: 'dagboek', tekst: 'De zin boven de week vertelt het ook als je week voller is dan de vorige.' },
      { begrip: 'algemeen', tekst: 'Er zijn nu 500 zinnen in plaats van 52, en ze zijn allemaal positief.' },
    ],
  },
  {
    versie: '0.4.2',
    datum: '2026-11-23',
    tijd: '09:06',
    punten: [
      { begrip: 'vergrendeling', tekst: 'De rondleiding van Vergrendeling toont het voorbeeld van het slotscherm nog maar een keer, met een nieuwe tekst.' },
      { begrip: 'vergrendeling', tekst: 'In Bloei vergrendelen duidt de stap Een code van zes cijfers het hele voorbeeld aan, niet alleen de cijfers.' },
    ],
  },
  {
    versie: '0.4.1',
    datum: '2026-11-23',
    tijd: '08:46',
    punten: [
      { begrip: 'uitleg', tekst: 'Alle rondleidingen en handleidingen zijn nagekeken. De knoppen bovenaan en elk blok Goed om te weten hebben nu overal een eigen stap.' },
      { begrip: 'uitleg', tekst: 'Een stap toont het hele onderdeel waar de tekst over gaat, of verdeelt het in delen. Geen half vak meer.' },
      { begrip: 'eten', tekst: 'Een maaltijd noteren volgt het blad van boven naar onder, met Zelfde als gisteren en je favorieten erbij.' },
      { begrip: 'gewicht', tekst: 'In Een weging noteren heet de knop juist: Noteren. Aanpassen of verwijderen duidt de lijst Je wegingen aan.' },
      { begrip: 'herinneringen', tekst: 'De stap Het uur kiezen duidt het tijdstip zelf aan.' },
      { begrip: 'vergrendeling', tekst: 'De titels Vergrendeling en Herinneringen staan weer volledig bovenaan.' },
      { begrip: 'instellingen', tekst: 'Onder Jouw instellingen heeft elke rij nu evenveel ruimte boven en onder de tekst, ook als die over twee regels loopt.' },
    ],
  },
  {
    versie: '0.4.0',
    datum: '2026-11-22',
    tijd: '21:10',
    punten: [
      { begrip: 'supplementen', tekst: 'De stap Begint op in de rondleiding herhaalt het kaartje niet meer, maar zegt wat er na je keuze gebeurt.' },
    ],
  },
  {
    versie: '0.3.9',
    datum: '2026-11-22',
    tijd: '21:30',
    punten: [
      { begrip: 'supplementen', tekst: 'In de rondleiding Een supplement aanpassen duiden Begint op en Stopt na nu elk hun eigen vak aan.' },
    ],
  },
  {
    versie: '0.3.8',
    datum: '2026-11-22',
    tijd: '20:55',
    punten: [
      { begrip: 'uitleg', tekst: 'Een stap over een vak onderaan een kaartje duidt nu dat vak aan en niet meer het hele kaartje.' },
      { begrip: 'favoriet', tekst: 'De rondleiding van Favorieten vertelt ook iets zinnigs als je er nog geen hebt.' },
    ],
  },
  {
    versie: '0.3.7',
    datum: '2026-11-22',
    tijd: '20:45',
    punten: [
      { begrip: 'supplementen', tekst: 'In de rondleiding Een supplement aanpassen staan de stappen over het ritme er weer bij.' },
      { begrip: 'favoriet', tekst: 'De rondleiding van Favorieten legt nu ook de lijst, het potloodje en het vuilbakje uit.' },
      { begrip: 'eten', tekst: 'De handleiding Een maaltijd noteren vertelt dat je met Enter een nieuwe regel begint.' },
    ],
  },
  {
    versie: '0.3.6',
    datum: '2026-11-22',
    tijd: '20:30',
    punten: [
      { begrip: 'supplementen', tekst: 'De rondleiding Een supplement aanpassen loopt weer gelijk met het kaartje, met een stap per vak.' },
    ],
  },
  {
    versie: '0.3.5',
    datum: '2026-11-22',
    tijd: '19:42',
    punten: [
      { begrip: 'algemeen', tekst: 'Bovenaan een scherm staan de titel, Algemeen en de knoppen weer samen op een regel.' },
      { begrip: 'profiel', tekst: 'Naam en profielfoto heet voortaan Naam en foto.' },
    ],
  },
  {
    versie: '0.3.4',
    datum: '2026-11-22',
    tijd: '19:30',
    punten: [
      { begrip: 'algemeen', tekst: 'Bovenaan een scherm onder Algemeen staat de terugknop boven de titel, zodat de knoppen rechts op hun plaats blijven.' },
    ],
  },
  {
    versie: '0.3.3',
    datum: '2026-11-21',
    tijd: '13:25',
    punten: [
      { begrip: 'eten', tekst: 'In het vak voor je maaltijd begin je met Enter een nieuwe regel; het blad blijft gewoon open.' },
    ],
  },
  {
    versie: '0.3.2',
    datum: '2026-11-20',
    tijd: '20:40',
    punten: [
      { begrip: 'favoriet', tekst: 'Je favorieten staan nu twee aan twee onder het woord Favorieten, elk op een regel.' },
      { begrip: 'favoriet', tekst: 'Vanaf vijf favorieten blijft het vak even hoog en scrol je er binnenin door.' },
    ],
  },
  {
    versie: '0.3.1',
    datum: '2026-11-20',
    tijd: '19:09',
    punten: [
      { begrip: 'algemeen', tekst: 'In een melding zijn de tekst links en de knop rechts nu even groot.' },
    ],
  },
  {
    versie: '0.3.0',
    datum: '2026-11-20',
    tijd: '19:05',
    punten: [
      { begrip: 'algemeen', tekst: 'Een melding onderaan is nu even breed als de balk met je tabbladen en staat er netjes boven.' },
      { begrip: 'instellingen', tekst: 'Alle meldingen zien er hetzelfde uit en zijn even groot, ook die over een nieuwe versie.' },
    ],
  },
  {
    versie: '0.2.9',
    datum: '2026-11-20',
    tijd: '18:48',
    punten: [
      { begrip: 'algemeen', tekst: 'De balk onderaan is smaller geworden, met evenveel lucht tussen de tabbladen.' },
    ],
  },
  {
    versie: '0.2.8',
    datum: '2026-11-20',
    tijd: '18:36',
    punten: [
      { begrip: 'uitleg', tekst: 'De rondleiding van Vandaag neemt de drie knoppen bovenaan nu na elkaar: eerst het vraagteken, dan Delen, dan het tandwiel.' },
    ],
  },
  {
    versie: '0.2.7',
    datum: '2026-11-20',
    tijd: '18:40',
    punten: [
      { begrip: 'instellingen', tekst: 'Op je telefoon staat het tandwiel naar Algemeen nu helemaal rechts bovenaan, na Delen.' },
      { begrip: 'uitleg', tekst: 'De rondleiding van Vandaag en van Algemeen klopt weer: juiste titels, juiste teksten en een stap over Wat is er nieuw.' },
    ],
  },
  {
    versie: '0.2.6',
    datum: '2026-11-20',
    tijd: '18:05',
    punten: [
      { begrip: 'algemeen', tekst: 'Op je telefoon staan onderaan vijf tabbladen, zodat de keuze rustiger oogt. Algemeen opent er met het tandwiel bovenaan Vandaag.' },
      { begrip: 'instellingen', tekst: 'Algemeen en je instellingen dragen voortaan een tandwiel in plaats van de schuifjes.' },
    ],
  },
  {
    versie: '0.2.5',
    datum: '2026-11-20',
    tijd: '13:52',
    punten: [
      {
        begrip: 'dagboek',
        tekst: 'Een tekst die net niet bewaard raakte, komt bij de volgende start terug, ook als je daarna nog iets anders aantikte bij dezelfde maaltijd of dag.',
      },
    ],
  },
  {
    versie: '0.2.4',
    datum: '2026-11-20',
    tijd: '13:30',
    punten: [
      {
        begrip: 'delen',
        tekst: 'De knop Delen staat in het Dagboek nu bovenaan, naast het huisje, net als op de andere tabbladen. Ze deelt nog altijd de dag, week of maand die je op dat moment bekijkt.',
      },
    ],
  },
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

// Versie 0.4.3 ging eerst uit met het nummer 0.5.0, tegen de afspraak in dat elke versie één hoger is op het laatste cijfer. Een toestel
// dat toen '0.5.0' onthield, zag in feite 0.4.3: zonder deze correctie zou het blad "Nieuw in Bloei" daar zwijgen tot er echt een 0.5.1 is.
// Alleen zolang de app zelf onder 0.5.0 zit: komt de echte 0.5.0 er, dan betekent dat nummer weer gewoon wat het zegt.
export function gezienVersie(gezien, huidige) {
  return gezien === '0.5.0' && vergelijkVersies(huidige, '0.5.0') < 0 ? '0.4.3' : gezien;
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
