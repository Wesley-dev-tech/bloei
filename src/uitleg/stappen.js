// De stappen van elke rondleiding. Een stap wijst een onderdeel aan met een CSS-selector (meerdere gescheiden door een komma: het
// eerste zichtbare treft). `ook: selector` licht een tweede onderdeel mee uit (de uitsnede is dan hun omhulsel). Staat het onderdeel niet op het scherm, dan slaat de rondleiding de stap over. `midden: true` is een stap
// zonder onderdeel, als kaartje midden op het scherm. `voor: 'naam'` is een stap die eerst iets moet openen (een maaltijdregel, een
// blad, een voorbeeldrij): het scherm registreert die functie met registreerUitleg(sleutel, { naam }) uit rondleiding.js. Is ze niet
// geregistreerd, dan slaat de rondleiding de stap over. De teksten staan in src/teksten.js onder uitleg.stap (per scherm) en
// uitleg.handeling (per handeling). `marge: px` en `straal: px` sturen het gat in de sluier bij als een onderdeel daar om vraagt
// (zonder: een kaart of knop precies op zijn rand, een rij of groep met de standaardmarge, zie MAAT in rondleiding.js).
// `als: selector` (BESLISSING 694) is een voorwaarde: staat dat onderdeel niet op het scherm wanneer de rondleiding start, dan hoort de stap er
// niet bij (stappenVoor laat ze weg, de teller telt ze niet). Voor een stap over iets wat bij een leeg profiel nog niet bestaat (een weging in de
// lijst, een punt in de grafiek, de knop Verwijderen van een bestaand supplement), ook als de stap eerst iets opent (voor).
//
// Twee soorten rondleidingen:
//   - een SCHERM (sleutel = route zonder #/): de knop Uitleg; elk tikbaar onderdeel één keer, van boven naar beneden;
//   - een HANDELING (sleutel 'h:<id>'): één taak van begin tot einde ("Een maaltijd noteren"), te starten vanuit Algemeen › Uitleg.
import { t, TEKSTEN } from '../teksten.js';
import { isAndroid, isChromeAndroid } from '../kern/toestel.js';

// Sleutel (route zonder #/, of 'h:<id>') naar het deel van de teksten.
const IDENT = {
  vandaag: 'stap.vandaag',
  dagboek: 'stap.dagboek',
  drinken: 'stap.drinken',
  supplementen: 'stap.supplementen',
  gewicht: 'stap.gewicht',
  meer: 'stap.meer',
  delen: 'stap.delen',
  'meer/instellingen': 'stap.instDrinken',
  'meer/gewicht': 'stap.instGewicht',
  'meer/vergrendeling': 'stap.vergrendeling',
  'meer/meldingen': 'stap.meldingen',
  'meer/profiel': 'stap.profiel',
  'meer/favorieten': 'stap.favorieten',
  'meer/badges': 'stap.badges',
  beginscherm: 'stap.beginscherm',
};

// De kaart Thema op Algemeen: een stap van de rondleiding van Algemeen en de hele handleiding "Een thema kiezen" (BESLISSING 645: een tekst,
// twee ingangen). Altijd een stap: past de hele kaart op een telefoon niet naast de uitlegkaart, dan de vier tegels met de zin eronder (klein).
// Vroeger in delen, waarvan het eerste alleen het kopje THEMA aanduidde.
const THEMA_KAART = { doel: '[data-uitleg="thema"], .meer__themakaart', tekstVan: 'handeling.thema.kaart', klein: [{ doel: '.meer__thema', ook: '.meer__themakaart > .meer__thema ~ *' }, { doel: '.meer__thema' }] };

export const STAPPEN = {
  vandaag: [
    { id: 'menu', doel: '#tabbalk, #zijbalk' },
    { id: 'kop', doel: '.begroeting__uitleg' }, // alleen het vraagteken: Delen en het tandwiel hebben elk een eigen stap
    // De drie knoppen bovenaan in de volgorde waarin ze staan: Rondleiding, Delen, het tandwiel.
    { id: 'delen', doel: '.begroeting__delen:not(.begroeting__uitleg):not(.begroeting__instellingen), .schermkop__delen' },
    // Alleen op een telefoon: daar staat Algemeen niet in de balk onderaan, maar achter dit tandwiel. Vanaf 720 px staat het weer
    // gewoon in het menu en slaat de rondleiding deze stap vanzelf over (de knop staat er niet).
    { id: 'instellingen', doel: '.begroeting__instellingen' },
    // Alleen op een telefoon: het weer in het kort onder de datum, in een afgeronde pil (ui/weerkaart.js, weerregel). Eén tik brengt haar
    // naar de kaart Het weer onderaan. Vanaf 720 px staat de pil er niet en slaat de rondleiding deze stap vanzelf over.
    { id: 'weerregel', doel: '.weerregel__pil' },
    { id: 'dag', doel: '.voortgang' },
    { id: 'badges', doel: '[data-uitleg="badges"]' },
    { id: 'week', doel: '[data-uitleg="week"]' },
    // De kaart met het weerbericht: naast de motivator, op een telefoon helemaal onderaan (ui/weerkaart.js).
    // Past de kaart op een telefoon niet naast de uitleg, dan krijgt elk deel zijn eigen tekst (STUKKEN: nu, de cijfers, de komende dagen).
    { id: 'weer', doel: '.weerkaart', stukken: 'vandaag.weer' },
    // BESLISSINGEN 548 en 570: de hele kaart Drinken; past ze niet, dan verdeelt de rondleiding ze in afgeronde delen (zie STUKKEN).
    { id: 'glas', doel: '.drinkkaart', stukken: 'vandaag.glas' },
    { id: 'afvinken', doel: '[data-uitleg="momenten"], .afvinklijst, .momentkop', stukken: 'vandaag.afvinken', zonderDeel: '.momentrij[data-moment="beurt"]' }, // zonderDeel: de spuit heeft een eigen stap
    { id: 'spuit', doel: '.suppmomenten .momentrij[data-moment="beurt"]' }, // alleen op de dag van een geplande spuit (of een ander periodiek supplement)
    // De tekst gaat over de hele kolom Eten: de hele kaart, met haar kop (BESLISSING 570); op een telefoon in delen.
    { id: 'maaltijd', doel: '.etenkaart, .maaltijd', stukken: 'vandaag.maaltijd' },
    { id: 'kalender', doel: '[data-uitleg="vandaag-kalender"], .kalkaart', stukken: 'vandaag.kalender' },
  ],
  // Het Dagboek heeft drie weergaven; de stappen van een andere weergave dan de huidige slaat de rondleiding vanzelf over (het onderdeel ontbreekt).
  dagboek: [
    // De knoppen Rondleiding, Delen en home in de kop, niet de hele kopband: die loopt op een telefoon van rand tot rand
    // (het vak viel buiten het scherm) en bevat ook Dag, Week en Maand, de volgende stap.
    { id: 'kop', doel: '.dagboek__kop .schermkop__uitleg', ook: '.dagboek__kop .schermkop__home' },
    { id: 'weergave', doel: '.segment' },
    { id: 'bladeren', doel: '.bladerkop' },
    { id: 'delen', doel: '.dagboek__delen' }, // in dag, week en maand: de knop in de kop, naast het huisje
    // dagweergave
    { id: 'eten', doel: '.dag__eten', stukken: 'dagboek.eten' }, // op een telefoon in delen: alle zes de momenten komen in beeld
    { id: 'notitie', doel: '.dag__notitie' },
    { id: 'drinken', doel: '.dag__drinken', stukken: 'dagboek.drinken' }, // in delen: de tegels, daarna de lijst met de kruisjes
    { id: 'supplementen', doel: '.dag__supplementen', stukken: 'dagboek.supplementen' },
    // weekweergave
    { id: 'weekcijfers', doel: '.wk__samenvatting', stukken: 'dagboek.weekcijfers' }, // in delen: elk deel noemt de cijfers die erin staan
    // heel (eigenaar, 0.5.8): op tablet en desktop altijd het hele weekschema; past het niet naast de kaart, dan ligt de kaart over het onderste
    // deel. Op een telefoon past het hele schema nooit naast de kaart: daar een afgerond blok van hele rijen (klein, BESLISSING 548), met de
    // vaste ruimte tussen het vak en de kaart (eigenaar: het vak en de tekst plakken niet tegen elkaar).
    { id: 'weekschema', doel: '.wk__schemakaart', heel: true, klein: [{ doel: '.wk__compactlijst' }, { doel: '.wk__compactlijst > .wk__compactitem:first-child', ook: '.wk__compactlijst > .wk__compactitem:nth-child(3)' }, { doel: '.wk__compactlijst > .wk__compactitem:first-child' }] },
    // maandweergave
    { id: 'cijfers', doel: '.maand__cijferkaart', stukken: 'dagboek.cijfers' }, // in delen: elk deel noemt de cijfers die erin staan
    // De kalender in een stap: de hele kaart, of op een telefoon het rooster zelf (klein), zonder de legenda: die heeft een eigen stap (tekens).
    // Vroeger in delen, gesneden tussen twee weken (BESLISSING 656): op een gewone telefoon stond de onderste week dan alleen, als een stap die
    // niets uitlegde. Op een kleine telefoon staat nu het bovenste deel van het rooster in het vak; de tekst gaat over elke dag.
    { id: 'maand', doel: '.maand__kalkaart', klein: [{ doel: '.maand__kalkaart .mk' }] },
    { id: 'tekens', doel: '.maand__legenda' },
    { id: 'paneel', doel: '.maand__dag', klein: [{ doel: '.maand__paneel > .kaartkop', ook: '.maand__paneelinhoud' }, { doel: '.maand__paneel > .kaartkop', ook: '.maand__paneelinhoud > :nth-child(3)' }, { doel: '.maand__paneel > .kaartkop', ook: '.maand__paneelinhoud > :first-child' }] }, // klein: de dag en haar waarden
    { id: 'dagOpenen', doel: '.maand__paneel > .knop' }, // de knop onder het paneel: hij viel buiten het vak van de stap erboven
    { id: 'beurt', doel: '.maand__gepkaart' },
  ],
  drinken: [
    { id: 'voortgang', doel: '.drinkhoofd__stand, .drinkhoofd' },
    { id: 'tegels', doel: '.drinken__andere .drankrij', ook: '.drinken__andere > .kaartkop', stukken: 'drinken.tegels' }, // de tegels zelf (eerste doel), met de kop Voeg toe (ook)
    { id: 'laatste', doel: '.drinken__laatste' },
    { id: 'lijst', doel: '.drinken__lijst', stukken: 'drinken.lijst' },
    { id: 'week', doel: '.drinken__week' },
    { id: 'cijfers', doel: '.drinken__cijferkaart', stukken: 'drinken.cijfers' }, // de kerncijfers en wat je het meest drinkt, onder de week
    // De hele kaart Goed om te weten, met de link naar de instellingen (vroeger alleen de link).
    { id: 'instellingen', doel: '.drinken__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopTab' },
  ],
  supplementen: [
    { id: 'week', doel: '.weekkaart--supp, .weekdagen' },
    // klein (BESLISSING 548): de momentkaarten zonder Vandaag ook te doen (dat is de volgende stap), anders de eerste
    // als (BESLISSING 694): zonder supplementen zijn er geen momenten; de lege kaart draagt dan ook data-uitleg="momenten", maar dat is de knop
    // van de stap Supplement toevoegen.
    { id: 'moment', doel: '[data-uitleg="momenten"], .momentkaart', als: '.suppraster', klein: [{ doel: '.suppraster .momentkaart', ook: '.suppkol + .suppkol > .momentkaart, .suppraster .momentkaart ~ .momentkaart' }, { doel: '.suppraster .momentkaart' }] },
    { id: 'beurt', doel: '[data-uitleg="aan-de-beurt"], .beurtkaart' },
    { id: 'later', doel: '[data-uitleg="later"], .laterkaart' },
    // De kop en het schema van Mijn supplementen, zonder het blok Lijst bewaren en overnemen onderaan (.lijstbestand): dat heeft een eigen stap
    // (bestand). Het vak loopt van de kop tot en met de laatste tabel; zonder dat blok (een dag in de toekomst) wordt het de hele kaart (maakHeel).
    { id: 'lijst', doel: '.overzichtkaart', zonderDeel: '.lijstbestand', stukken: 'supplementen.lijst' }, // op een telefoon in delen: Elke dag, daarna Niet elke dag
    // Zonder supplementen (BESLISSING 694): de hele lege kaart, met de tekst Nog geen supplementen (LEEG_TEKST) en daarna het aanbod om het
    // toevoegen stap voor stap te zien (AANBOD). klein: op een lage telefoon past de lege kaart niet naast de uitlegkaart; dan haar inhoud (het
    // merk, de zin en de knop), of de zin met de knop, in plaats van de kaart in twee delen met een tekst die er niet bij hoort. Met supplementen
    // is het doel de knop Supplement toevoegen, die altijd past: daar verandert niets.
    // BESLISSINGEN 696 en 718: de lege kaart draagt ook de tekstknop Lijst uit een bestand overnemen; de tekst bij een leeg profiel noemt hem,
    // dus het kleinste doel loopt van de zin tot en met die knop (de knop Eerste supplement toevoegen ligt ertussen).
    // laatste: past ook dat niet boven de uitlegkaart (320x480), dan zou het vak afgesneden worden, dwars door het merk van de kaart. Alleen dan
    // wordt het doel de knop Eerste supplement toevoegen (waar de tekst naartoe leidt), een geheel dat wel past (rondleiding.js, kiesDoelMetLucht).
    { id: 'toevoegen', doel: '[data-uitleg="toevoegen"], .supplementen__leegkaart', klein: [{ doel: '.supplementen__leegkaart .leeg' }, { doel: '.supplementen__leegkaart .leeg__tekst', ook: '.supplementen__leegkaart .lijstbestand' }, { doel: '.supplementen__leegkaart .leeg > .knop', laatste: true }] },
    { id: 'aanpassen', doel: '[data-uitleg="supplement-rij"], .overzicht__rij' },
    // BESLISSINGEN 696 en 718: de knoppen Lijst bewaren en Lijst overnemen onderaan Mijn supplementen. Bij een lege lijst staat daar alleen de
    // tekstknop in de lege kaart (is-leeg); die legt de stap toevoegen uit, dus dan valt deze stap weg.
    { id: 'bestand', doel: '.lijstbestand:not(.is-leeg)', als: '.lijstbestand:not(.is-leeg)' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopTab' },
  ],
  // De periodekeuze bestaat pas vanaf twee wegingen en "Weg naar je streefgewicht" alleen met een streefgewicht: zonder die onderdelen slaat de rondleiding de stap over.
  gewicht: [
    { id: 'weging', doel: '[data-uitleg="weging-knop"], .gewichthoofd .gewicht__actie .knop' },
    { id: 'weegdag', doel: '.gewicht__weegdag' },
    { id: 'streef', doel: '[data-uitleg="streefgewicht"], .streef' },
    { id: 'periode', doel: '[data-uitleg="grafiek-periode"], .gewichtgrafiek .chips, .gewichtgrafiek .segment' },
    { id: 'grafiek', doel: '[data-uitleg="grafiek-vlak"], .gewichtgrafiek__vlak' },
    { id: 'lijst', doel: '[data-uitleg="gewicht-lijst"], .gewicht__lijst' },
    { id: 'cijfers', doel: '.gewicht__cijferkaart' },
    { id: 'kalender', doel: '.gewicht__kal' },
    { id: 'weg', doel: '.gewicht__weg' },
    { id: 'weetjes', doel: '.gewicht__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopTab' },
  ],
  meer: [
    { id: 'profiel', doel: '[data-uitleg="profiel"], .meer__profiel', stukken: 'meer.profiel' },
    { id: 'thema', ...THEMA_KAART }, // dezelfde stap en tekst als de handleiding Een thema kiezen (h:thema)
    { id: 'favorieten', doel: '.meer__favorieten' },
    // Jouw instellingen: elke rij een eigen stap, in de volgorde van het scherm (zelf: de rij blijft zichzelf). Vroeger een stap voor de hele
    // kaart: op een telefoon paste die niet naast de uitlegkaart en verdween de onderste rij, Rondleiding, er half onder. In delen kan niet: de
    // rijen sluiten op elkaar aan.
    { id: 'instDrinken', doel: '.meer__menu > .rij:nth-of-type(1)', zelf: true },
    { id: 'instGewicht', doel: '.meer__menu > .rij:nth-of-type(2)', zelf: true },
    { id: 'instMeldingen', doel: '.meer__menu > .rij:nth-of-type(3)', zelf: true },
    { id: 'instSlot', doel: '.meer__menu > .rij:nth-of-type(4)', zelf: true },
    { id: 'instUitleg', doel: '.meer__menu > .rij:nth-of-type(5)', zelf: true },
    { id: 'badges', doel: '[data-uitleg="badges"], .meer__badges', stukken: 'meer.badges' },
    { id: 'licenties', doel: '.over__licenties' }, // de versie en de link Licenties, onder Over
    { id: 'nieuw', doel: '.over__nieuw' }, // de tekstknop Wat is er nieuw, onder Over
    { id: 'wissen', doel: '.knop--wis' },
    { id: 'privacy', doel: '.privacy' }, // de kaart Privacy, onder Over
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopTab' },
  ],
  delen: [
    { id: 'periode', doel: '[data-uitleg="delen-periode"], .delen__datum' },
    // het hele blok Onderdelen met zijn label: de rij Drinken viel buiten het vak
    // de vinkjes zelf (eerste doel, de haak), met hun label erboven (ook): samen het hele blok Onderdelen
    { id: 'inhoud', doel: '[data-uitleg="delen-onderdelen"], .delen__vinkjes', ook: '.delen__onderdelen > .delen__groeplabel', stukken: 'delen.inhoud' },
    { id: 'voorbeeld', doel: '[data-uitleg="delen-voorbeeld"], .verslagvel' },
    // De knoppen met de zin eronder die zegt wat er na een tik gebeurt (delen-standaard); samen een geheel, anders bleef die zin onbesproken.
    // zelf: de knoppen met hun zin blijven hun eigen vak. Zonder groeide het blok op een telefoon van 375 px tot de hele kolom, die dan in vier
    // delen viel met vulteksten ("Hier staan ook 1 dag, van, tot en wat komt erin").
    { id: 'bewaren', doel: '[data-uitleg="delen-knoppen"], .delen__knoppen', ook: '[data-uitleg="delen-standaard"]', zelf: true },
    { id: 'weetjes', doel: '.delen__weetjes' },
    { id: 'kop', doel: '.schermkop__acties' }, // hier zonder Delen: het vraagteken, het huisje en soms een knop terug
  ],
  // BESLISSINGEN 579, 627 en 645: de rondleiding van elk instelscherm is ook de handleiding van dat scherm. Het vraagteken start ze, en de rij
  // op het scherm Rondleiding start dezelfde stappen (ONDERWERPEN: de sleutel is de route); een tekst, twee ingangen. Elke stap licht een hele
  // kaart met haar kop op; past ze op een telefoon niet, dan verdeelt de rondleiding ze in delen met de teksten uit STUKKEN. De laatste stap zijn
  // de knoppen bovenaan, met een gedeelde tekst (tekstVan). Geen aanbod na afloop (AANBOD): het zou herhalen wat net getoond werd.
  'meer/instellingen': [
    { id: 'kaart', doel: '.instellingen__drinken', stukken: 'meer/instellingen.kaart' },
    { id: 'voorbeeld', doel: '.instel__voorbeeld', stukken: 'meer/instellingen.voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes', stukken: 'meer/instellingen.weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/gewicht': [
    { id: 'kaart', doel: '.instellingen__gewicht', stukken: 'meer/gewicht.kaart' },
    { id: 'voorbeeld', doel: '.instel__voorbeeld', stukken: 'meer/gewicht.voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes', stukken: 'meer/gewicht.weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/vergrendeling': [
    { id: 'aanzetten', doel: '[data-uitleg="slot-schakelaar"], .slot-scherm .schakelaar' },
    { id: 'faceid', doel: '[data-uitleg="slot-keuze"]' },
    // De rij Pincode met de knop Wijzigen bestaat alleen met het slot aan; anders valt de stap weg. Dezelfde tekst als in de handleiding.
    { id: 'wijzigen', doel: '[data-uitleg="slot-pin"]', tekstVan: 'handeling.slot.wijzigen' },
    // BESLISSINGEN 531, 538 en 541: één stap over een vergeten code. Ze wijst de rij Herstelcode aan (de rij van het toestel verdwijnt: herstel met
    // het toestel kan zonder koppelen). De rij bestaat alleen met het slot aan; anders valt de stap weg.
    { id: 'herstel', doel: '[data-uitleg="slot-herstel"]' },
    // Eén stap over het voorbeeld van het slotscherm, op de plaats waar het op het scherm staat. Vroeger wees ook een stap
    // "Een code van zes cijfers" (de tweede) dit voorbeeld aan: twee keer hetzelfde vak. Haar zin over de code staat nu hier.
    { id: 'voorbeeld', doel: '.slotvoorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  // Herinneringen: zonder haken, met klassen. Welke onderdelen er zijn hangt af van de toestand (beschikbaar, niet beschikbaar, installeren, geweigerd): de rest valt weg.
  'meer/meldingen': [
    { id: 'installeren', doel: '.meldingen__stappen' },
    { id: 'hoofd', doel: '.meldingen__hoofd' },
    // De drie soorten samen; op een klein scherm de eerste.
    { id: 'soort', doel: '.meldingen__soort', ook: '.meldingen__soort ~ .meldingen__soort ~ .meldingen__soort ~ .meldingen__soort', klein: [{ doel: '.meldingen__soort' }] },
    // zelf: alleen de rij van het tijdstip. Zonder groeide het vak tot de hele kaart, die dan in delen viel met de vultekst "Ook dit hoort erbij".
    { id: 'uur', doel: '.meldingen__uur, .meldingen__slot', zelf: true },
    { id: 'toevoegen', doel: '.meldingen__toevoegen' },
    // BESLISSING 710: de schakelaar Details tonen in meldingen, onder de soorten (ook als nep-rij zolang er niets aan staat).
    { id: 'details', doel: '.meldingen__details' },
    { id: 'voorbeeld', doel: '.meldingen__voorbeeldkaart, .instel__voorbeeld', klein: [{ doel: '.meldingen__telefoon' }, { doel: '.meldingen__stapel' }, { doel: '.meldingen__stapel > :first-child' }] }, // klein: het scherm met de melding
    { id: 'weetjes', doel: '.meldingen__goed:not(.meldingen__goed--gegevens)' },
    { id: 'gegevens', doel: '.meldingen__goed--gegevens' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/profiel': [
    { id: 'kaart', doel: '.instellingen__profiel', stukken: 'meer/profiel.kaart' },
    { id: 'voorbeeld', doel: '.instel__voorbeeld', stukken: 'meer/profiel.voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  // In de volgorde van het scherm. De drie stappen over de lijst verschijnen alleen als er al een favoriet staat.
  'meer/favorieten': [
    { id: 'toevoegen', doel: '[data-uitleg="favoriet-nieuw"], .favoriet__nieuw' },
    { id: 'lijst', doel: '[data-uitleg="favoriet-lijst"], .favorieten__lijst', stukken: 'meer/favorieten.lijst' }, // ook zonder favorieten: dan met de tekst uit LEEG_TEKST; een lange lijst in delen
    { id: 'aanpassen', doel: '[data-uitleg="favoriet-bewerk"], .favoriet__bewerk', als: '.favoriet__bewerk' },
    { id: 'weghalen', doel: '[data-uitleg="favoriet-weg"], .drank__weg', als: '.drank__weg' },
    { id: 'gebruiken', doel: '.instel__voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/badges': [
    // In de volgorde van het scherm: de bovenste kaart, de ring, de groepen, een medaille. Vroeger wezen de eerste en de laatste stap dezelfde medaille aan.
    { id: 'stand', doel: '.badgehero', stukken: 'meer/badges.stand' },
    { id: 'ring', doel: '.medaille.is-open, .medaillekaart' },
    { id: 'groepen', doel: '.badgegroep', klein: [{ doel: '.badgegroep__kop', ook: '.medailleraster > :nth-child(2)' }, { doel: '.badgegroep__kop' }] }, // klein: de eerste groep met haar titel en eerste rij
    { id: 'aantikken', doel: '.medailleraster button' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  beginscherm: [
    { id: 'deel', midden: true },
    { id: 'zet', midden: true },
  ],

  // ---- Handelingen: één taak van begin tot einde ----
  'h:maaltijd': [
    // BESLISSING 592: past de kaart Eten niet in één keer, dan in afgeronde delen, elk met een tekst over wat erin staat (STUKKEN). De favorieten
    // onder de momenten hebben hun eigen stap (gebruik) en tellen hier niet mee (zonderDeel).
    { id: 'regel', doel: '.etenkaart', zonderDeel: '.eten__favorieten', stukken: 'h:maaltijd.regel' },
    // Het blad van boven naar onder: het uur, het tekstvak, het hartje, de snelle keuzes, de knoppen. Daarna, met het blad dicht,
    // later aanpassen en de favorieten op Vandaag. Vroeger sprong de volgorde: blad dicht, open en weer dicht.
    { id: 'uur', doel: '[data-uitleg="maaltijd-uur"]', voor: 'openMaaltijd' },
    { id: 'open', doel: '.maaltijd__tekst textarea, .maaltijdblad textarea', voor: 'openMaaltijd' }, // BESLISSING 419: het tekstvak staat in het blad
    // BESLISSING 592 (M5): op een telefoon met het tekstvak ernaast (het hartje staat 8 px naast het tekstvak, dat er anders half onder de uitlegkaart uitsteekt).
    { id: 'favoriet', doel: '[data-uitleg="maaltijd-favoriet"]', voor: 'openMaaltijd', smal: { ook: '.maaltijd__tekst textarea, .maaltijdblad textarea' } },
    // vooraf: de snelle keuzes staan er alleen als er iets te kiezen valt; de teller weet dat van bij de eerste stap (rondleiding.js, meetVooraf).
    { id: 'snel', doel: '.maaltijd__chips', voor: 'openMaaltijd', vooraf: true },
    // Klaar, Annuleren en Verwijderen: elk een eigen stap met een eigen vak (zelf: de knop blijft zichzelf, ook al staan de buren 8 px ernaast).
    // Vroeger lichtte de stap Klaar op een telefoon ook Annuleren uit (BESLISSING 592, M5 en M6).
    { id: 'bewaard', doel: '[data-uitleg="maaltijd-bewaren"]', voor: 'openMaaltijd', zelf: true },
    { id: 'annuleer', doel: '.maaltijd__annuleer', voor: 'openMaaltijd', zelf: true },
    { id: 'weg', doel: '[data-uitleg="maaltijd-verwijderen"]', voor: 'openMaaltijd', zelf: true },
    { id: 'later', doel: '.maaltijd' },
    { id: 'gebruik', doel: '.eten__favorieten' },
  ],
  'h:drinken': [
    { id: 'tik', doel: '.drankknop' },
    { id: 'melding', doel: '.strook', voor: 'toonOngedaanMelding' },
    { id: 'laatste', doel: '.drinken__laatste, .drinkkaart__acties' },
    { id: 'regel', doel: '.drinken__lijst .drank__weg, .drinken__lijst', stukken: 'h:drinken.regel' },
    { id: 'doel', doel: '.drinkhoofd__stand, .drinkkaart' },
    { id: 'vorigeDag', doel: '.tabbalk__item--dagboek, .zijbalk__item--dagboek' }, // het tabblad Dagboek: vroeger een kaart zonder aanduiding
  ],
  // BESLISSING 563: elke stap een eigen onderdeel van de kaart Supplementen op Vandaag: de kaart, de stand rechtsboven, een moment, de extra rij
  // van een spuit (die stap valt weg op een dag zonder spuit of ander periodiek supplement).
  'h:supplementen': [
    { id: 'vandaag', doel: '[data-uitleg="momenten"], .afvinklijst, .momentkop' },
    { id: 'stand', doel: '.vc--supp .kaartkop__eind' },
    { id: 'terug', doel: '.vc--supp .momentrij[data-moment="ochtend"]' },
    { id: 'periodiek', doel: '.vc--supp .momentrij[data-moment="beurt"]' },
  ],
  // De kaart van een supplement, stap voor stap in de volgorde waarin ze op het scherm staat (ui/supplementkaart.js). Drie stappen
  // verschijnen alleen als het gekozen ritme ze toont: De momenten bij Elke dag, Om de hoeveel dagen en Volgende keer op bij de andere twee.
  'h:lijst': [
    { id: 'rij', doel: '[data-uitleg="supplement-rij"], .overzicht__rij' },
    { id: 'naam', doel: '[data-uitleg="kaart-naam"]', voor: 'openBewerkSupplement' },
    { id: 'hoeveelheid', doel: '[data-uitleg="kaart-hoeveelheid"]', voor: 'openBewerkSupplement' },
    { id: 'aanwijzing', doel: '[data-uitleg="kaart-aanwijzing"]', voor: 'openBewerkSupplement' },
    { id: 'ritme', doel: '[data-uitleg="kaart-ritme"]', voor: 'openBewerkSupplement' },
    // Geen 'als': die voorwaarde wordt gewogen voor het kaartje opengaat, en dan bestaan deze drie vakken nog niet, waardoor ze alle drie
    // wegvielen. Ze hangen af van het ritme. vooraf: de rondleiding opent het kaartje voor de eerste stap even onzichtbaar en kijkt welke
    // vakken er staan (rondleiding.js, meetVooraf); zo zegt de teller van bij stap 1 het juiste aantal (vroeger "van 14" en vanaf stap 7 "van 12").
    { id: 'momenten', doel: '[data-uitleg="kaart-momenten"]', voor: 'openBewerkSupplement', vooraf: true },
    { id: 'dagen', doel: '[data-uitleg="kaart-dagen"]', voor: 'openBewerkSupplement', vooraf: true },
    { id: 'volgende', doel: '[data-uitleg="kaart-volgende"]', voor: 'openBewerkSupplement', vooraf: true },
    // BESLISSINGEN 698, 702 en 703: Periode in twee stappen, elk over wat uitgelicht is: de kop met de zin en Begint op, daarna Stopt na. Het
    // hele blok paste op een telefoon niet naast de uitlegkaart in het blad (Stopt na viel buiten het vak terwijl de tekst het noemde).
    { id: 'periode', doel: '.supplementkaart__periodekop', ook: '.supplementkaart__periode .supplementkaart__velden > :first-child', voor: 'openBewerkSupplement', klein: [{ doel: '.supplementkaart__periode .supplementkaart__velden > :first-child' }] },
    { id: 'einde', doel: '.supplementkaart__periode .supplementkaart__velden > :nth-child(2)', voor: 'openBewerkSupplement' },
    { id: 'bewaren', doel: '[data-uitleg="kaart-bewaren"]', voor: 'openBewerkSupplement' },
    // Alleen Annuleren aanduiden: het kruisje staat helemaal bovenaan, samen zou het vak de hele kaart beslaan. De tekst noemt het kruisje.
    { id: 'annuleren', doel: '[data-uitleg="kaart-annuleren"]', voor: 'openBewerkSupplement' },
    // Zonder supplement opent openBewerkSupplement het lege kaartje (BESLISSING 694): daar staat geen Verwijderen.
    { id: 'weg', doel: '[data-uitleg="kaart-weghalen"]', voor: 'openBewerkSupplement', als: '.overzicht__rij' },
    { id: 'nieuw', doel: '[data-uitleg="toevoegen"], .supplementen__leegkaart .knop' },
  ],
  'h:gewicht': [
    { id: 'knop', doel: '[data-uitleg="weging-knop"]' },
    { id: 'getal', doel: '[data-uitleg="weging-getal"], .gewicht__invoer', voor: 'openWeging' },
    { id: 'datum', doel: '[data-uitleg="weging-datum"], .gewicht__invoer', voor: 'openWeging' },
    { id: 'bewaar', doel: '[data-uitleg="weging-bewaar"], .gewicht__acties', ook: '.wegingblad .knop--secundair', voor: 'openWeging' }, // Noteren met Annuleren ernaast: de tekst noemt ze allebei
    // als (BESLISSING 694): zonder wegingen staat er geen weging in de lijst en geen punt in de grafiek.
    // Zonder voor: het blad gaat dicht en de lijst Je wegingen is aangeduid (vroeger bleef het blad open en stond het vak rond het blad).
    { id: 'aanpassen', doel: '[data-uitleg="gewicht-lijst"], .gewicht__lijst', als: '.gewicht__rijen > :not(.gewicht__lijstleeg)' },
    { id: 'periode', doel: '[data-uitleg="grafiek-periode"]' },
    { id: 'punt', doel: '[data-uitleg="grafiek-vlak"], .gewichtgrafiek__vlak', als: '.gewichtgrafiek__vlak .grafiek__punt' },
    { id: 'streef', doel: '[data-uitleg="streefgewicht"], .streef' },
  ],
  'h:dagboek': [
    { id: 'weergave', doel: '.segment' },
    { id: 'bladeren', doel: '.bladerkop' },
    { id: 'vandaag', doel: '[data-uitleg="naar-vandaag"], .dag__naarvandaag, .bladerkop' },
    { id: 'dag', doel: '.dagboek__segment .segment__deel:last-child', zelf: true }, // de knop Maand: daar tik je een dag aan (vroeger een kaart zonder aanduiding)
    { id: 'notitie', doel: '.dag__notitie' },
  ],
  'h:slot': [
    { id: 'aanzetten', doel: '[data-uitleg="slot-schakelaar"], .slot-scherm .schakelaar' },
    // Het hele voorbeeld van het slotscherm, niet alleen de toetsen: daar tik je de code in. Past het niet naast de uitlegkaart, dan een kleiner deel (KLEIN).
    { id: 'code', doel: '.slotvoorbeeld' },
    { id: 'faceid', doel: '[data-uitleg="slot-keuze"], .slotvoorbeeld__faceid' },
    { id: 'terugkeer', doel: '.instel__weetjes, .meldingen__goed' }, // de weetjes van Vergrendeling (Herinneringen heeft .meldingen__goed)
    { id: 'wijzigen', doel: '[data-uitleg="slot-pin"]' },
    { id: 'vergeten', doel: '.slotvoorbeeld__kwijt' },
    // BESLISSING 563: Het slot uitzetten wees dezelfde schakelaar aan als Het slot aanzetten; die stap zegt het nu allebei.
  ],
  // BESLISSING 579: "Mijn instellingen" is vier korte handleidingen. Drie ervan zijn de rondleiding van hun instelscherm (645, zie hierboven);
  // "Een thema kiezen" is de stap Thema van Algemeen (THEMA_KAART).
  'h:thema': [{ id: 'kaart', ...THEMA_KAART }],
  // "Het weer lezen" (0.5.8): de kaart Het weer op Vandaag, deel per deel, waar het weer vandaan komt en de zin die het weer volgt.
  'h:weer': [
    { id: 'regel', doel: '.weerregel__pil' }, // alleen op een telefoon: het weer in het kort onder de datum, met de tik naar de kaart
    { id: 'nu', doel: '.weerkaart .weerkaart__nu' },
    { id: 'cijfers', doel: '.weerkaart .weerkaart__cijfers' },
    { id: 'week', doel: '.weerkaart .weerkaart__week' },
    { id: 'plek', midden: true },
    { id: 'zin', doel: '.voortgang > .voortgang__zin' },
  ],
  'h:beginscherm': [
    { id: 'safari', midden: true },
    { id: 'deel', midden: true },
    { id: 'zet', midden: true },
    { id: 'voegToe', midden: true },
    { id: 'daarna', midden: true },
  ],
};

// ---- Kleinere doelen op een klein scherm (BESLISSING 548), per stap: '<sleutel>.<id>' -> lijst van groot naar klein (zie doelKeuzes onderaan).
// Elk is het deel waar de tekst van de stap over gaat. Stappen met een eigen `klein` hierboven staan hier niet. stappenVoor() hangt ze aan de stap.
const SUPP_VANDAAG_KLEIN = [{ doel: '.vc--supp .suppmomenten' }, { doel: '.vc--supp .momentkant', ook: '.vc--supp .momentkant + .momentkant' }];
const MEDAILLE_KLEIN = [{ doel: '.medaillekaart .medaille-hover', ook: '.medaillekaart .medaillekaart__naam' }];
const VERSLAG_KLEIN = [{ doel: '.verslagvel__kop', ook: '.verslagvel__cijfers' }, { doel: '.verslagvel__kop', ook: '.verslagvel__periode' }];
const KLEIN = {
  'vandaag.dag': [{ doel: '.voortgang > .motiv__vakken', ook: '.voortgang > .voortgang__zin' }, { doel: '.voortgang > .motiv__vakken' }],
  'dagboek.notitie': [{ doel: '.dag__notitie textarea' }],
  'dagboek.supplementen': [{ doel: '.dag__supplementen .dag__momenten' }],
  'dagboek.beurt': [{ doel: '.maand__geplandlijst' }],
  'drinken.week': [{ doel: '.drinken__week .weekstaven' }],
  'gewicht.cijfers': [{ doel: '.gewicht__overzicht' }, { doel: '.gewicht__overzicht > li:first-child', ook: '.gewicht__overzicht > li:nth-child(4)' }],
  'gewicht.kalender': [{ doel: '.gewicht__kalromp' }, { doel: '.gewicht__weken' }],
  'gewicht.weetjes': [{ doel: '.gewicht__weetjesrij' }, { doel: '.gewicht__weetjesrij > .weetje:first-child', ook: '.gewicht__weetjesrij > .weetje:nth-child(3)' }],
  'meer.favorieten': [{ doel: '.meer__favrijen' }],
  'meer.privacy': [{ doel: '.privacy > .kaartkop', ook: '.privacy__lijst > li:first-child' }, { doel: '.privacy__lijst > li:first-child' }],
  'delen.voorbeeld': VERSLAG_KLEIN,
  'meer/vergrendeling.faceid': [{ doel: '.slot__optie[data-methode="pin"]' }],
  'h:slot.faceid': [{ doel: '.slot__optie[data-methode="pin"]' }],
  'h:slot.code': [{ doel: '.slotvoorbeeld > .logo', ook: '.slotvoorbeeld__kwijt' }, { doel: '.slotvoorbeeld > .logo', ook: '.slotvoorbeeld__rooster' }, { doel: '.slotvoorbeeld__rooster' }],
  'meer/vergrendeling.voorbeeld': [{ doel: '.slotvoorbeeld > .logo', ook: '.slotvoorbeeld__kwijt' }, { doel: '.slotvoorbeeld > .logo', ook: '.slotvoorbeeld__rooster' }, { doel: '.slotvoorbeeld__rooster' }],
  'h:slot.terugkeer': [{ doel: '.instel__weetjesrij' }, { doel: '.instel__weetjesrij > .weetje:first-child', ook: '.instel__weetjesrij > .weetje:nth-child(3)' }],
  'meer/favorieten.gebruiken': [{ doel: '.favorietvoorbeeld__maaltijden', ook: '.favorietvoorbeeld__chips' }, { doel: '.favorietvoorbeeld__chips' }],
  'meer/badges.aantikken': MEDAILLE_KLEIN,
  'meer/vergrendeling.weetjes': [{ doel: '.instel__weetjesrij' }],
  'meer/favorieten.weetjes': [{ doel: '.instel__weetjesrij' }],
  'delen.weetjes': [{ doel: '.delen__weetjesrij' }],
  'drinken.instellingen': [{ doel: '.drinken__weetjesrij' }],
  'h:supplementen.vandaag': SUPP_VANDAAG_KLEIN,
  'h:supplementen.stand': SUPP_VANDAAG_KLEIN,
  'h:supplementen.terug': SUPP_VANDAAG_KLEIN,
  'h:supplementen.periodiek': SUPP_VANDAAG_KLEIN,
  'h:dagboek.notitie': [{ doel: '.dag__notitie textarea' }],
};

// ---- Afgeronde delen (BESLISSINGEN 548 en 570) ----
// Past het aangeduide blok op een telefoon niet in één keer naast de uitlegkaart, dan verdeelt de rondleiding het in afgeronde delen: de rijen
// van het blok (de kop van een kaart hoort bij de eerste rij, de rand valt altijd tussen twee rijen), zoveel als er samen passen. Elk deel is een
// eigen stap; de teller telt wat getoond wordt. Waar het blok past, blijft het één stap met de gewone tekst.
// De tekst van een deel komt uit de stukken hieronder: elk stuk hoort bij het onderdeel 'bij' en gaat naar het deel waarin dat onderdeel staat.
// Komen er meer stukken in één deel, dan volgen hun teksten elkaar (de titel is die van het eerste stuk). Samen zeggen de stukken wat de gewone
// tekst zegt. 'kort': een kortere tekst met dezelfde inhoud, alleen als het deel met de gewone tekst niet naast de kaart past. 'alleen: true': dit stuk telt alleen als het een deel begint (anders zegt een eerder stuk in hetzelfde deel het al). 'eigen: true':
// dit stuk telt alleen als er geen ander stuk in hetzelfde deel staat (de kop van een kaart die apart getoond wordt). 'vervolg':
// de titel en tekst van een deel zonder eigen stuk (de rest van een lange lijst of rooster).
export const STUKKEN = {
  'vandaag.weer': {
    stukken: [
      { bij: '.weerkaart .weerkaart__nu', titel: 'Het weer van nu', tekst: 'Bovenaan staat het weer bij jou: de temperatuur van nu, het weerbeeld en hoe het aanvoelt.' },
      { bij: '.weerkaart .weerkaart__cijfers', titel: 'Vandaag in cijfers', tekst: 'Hier staan tien cijfers van vandaag, van regen en wind tot zon op en zon onder.' },
      { bij: '.weerkaart .weerkaart__week', titel: 'De komende dagen', tekst: 'Onderaan zie je de komende dagen: het weerbeeld, de hoogste en de laagste temperatuur en de kans op regen.' },
    ],
  },
  'vandaag.glas': {
    stukken: [
      { bij: '.drinkkaart > .kaartkop', eigen: true, titel: 'Drinken', tekst: 'De kaart Drinken heeft twee delen: wat je vandaag dronk en de dranken die je met één tik toevoegt.' },
      { bij: '.drinkkaart .drinkkaart__links', titel: 'Je drinken vandaag', tekst: 'Hier zie je hoeveel je vandaag dronk. Met Laatste weghalen zet je een vergissing recht.', kort: 'Zoveel dronk je vandaag. Laatste weghalen zet een vergissing recht.' },
      { bij: '.drinkkaart .drankrij > :first-child', titel: 'Een kan water erbij', tekst: 'Tik op een drank om ze toe te voegen. Eén tik op Kan water voegt een kan van 800 ml toe.' },
      { bij: '.drinkkaart .drankrij > :nth-child(4)', alleen: true, titel: 'Nog meer dranken', tekst: 'Ook sap, frisdrank en een glas water voeg je met één tik toe.' },
    ],
  },
  'vandaag.afvinken': {
    stukken: [
      // BESLISSING 592 (M6): de kop kan apart getoond worden, zonder de momenten; de zin noemt ze daarom niet.
      { bij: '.vc--supp > .kaartkop', titel: 'Je supplementen', tekst: 'Hier vink je je supplementen af zodra je ze nam, per moment van de dag.' },
      { bij: '.vc--supp .suppmomenten > :last-child', titel: 'Terugzetten', tekst: 'Eén tik is genoeg, en met nog een tik zet je het terug.' },
    ],
    vervolg: { naam: '.momentrij__naam', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook ${opsomming(n.map(klein))} vink je met één tik af.` }) },
  },
  'vandaag.maaltijd': {
    stukken: [
      { bij: '.etenkaart > .kaartkop', titel: 'Een maaltijd noteren', tekst: 'Hier noteer je wat je at. Tik op een moment van de dag, schrijf kort op wat je at en tik op Klaar.' },
      // na: deze zin komt achter de zin over de momenten in hetzelfde deel (de favorieten staan onder Late snack).
      { bij: '.etenkaart .eten__favorieten', na: true, titel: 'Je favorieten', tekst: 'Onder je maaltijden staan je favorieten: tik er een aan en hij wordt meteen ingevuld bij het moment dat aan de beurt is.' },
    ],
    vervolg: { naam: '.rij__titel', ookBijStuk: true, maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Hier ${n.length > 1 ? 'staan' : 'staat'} ${opsomming(n.map((x) => 'je ' + klein(x)))}.` }) },
  },
  // De handleiding "Een maaltijd noteren", stap 1 (BESLISSING 592, M6): elk deel noemt alleen de momenten die erin staan.
  'h:maaltijd.regel': {
    stukken: [{ bij: '.etenkaart > .kaartkop', titel: 'Kies een moment', tekst: 'Elk moment van de dag heeft een eigen regel. Tik op een regel om hem te openen.' }],
    vervolg: {
      naam: '.rij__titel',
      ookBijStuk: true,
      maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Hier ${n.length > 1 ? 'staan' : 'staat'} ${opsomming(n.map(klein))}.` }),
    },
  },
  // De rondleidingen van de instelschermen en de kaart Thema (BESLISSINGEN 579, 627 en 645): per deel van een kaart de tekst over wat erin staat.
  'meer/profiel.kaart': {
    stukken: [
      { bij: '.instellingen__profiel > .kaartkop', eigen: true, titel: 'Naam en profielfoto', tekst: 'In deze kaart stel je je naam, je profielfoto en je geboortedatum in.' },
      { bij: '.instellingen__profiel .rij:has(.profiel__naam)', titel: 'Je naam', tekst: 'Typ hier je voornaam. Bloei begroet je ermee op Vandaag en zet hem op je verslag. Je naam wordt vanzelf bewaard.' },
      { bij: '.instellingen__profiel .rij:has(.profiel__knoppen)', titel: 'Je profielfoto', tekst: 'Met Foto kiezen kies je een foto op je toestel. Staat er een foto, dan haal je ze weg met Foto weghalen en zie je weer je initiaal.' },
      { bij: '.instellingen__profiel .rij:has(.verjaardag)', titel: 'Je geboortedatum', tekst: 'Kies de dag, de maand en het jaar waarop je geboren bent. Op je verjaardag viert Bloei dan met je mee.' },
    ],
  },
  'meer/profiel.voorbeeld': {
    stukken: [
      { bij: '.profielvoorbeeld > .kaartkop', eigen: true, titel: 'Zo ziet het eruit', tekst: 'Dit voorbeeld toont hoe Bloei je begroet op Vandaag.' },
      { bij: '.profielvoorbeeld__begroeting', titel: 'Je begroeting', tekst: 'Zo staat je begroeting op Vandaag, met je voornaam en je foto. Ze verandert meteen mee terwijl je typt.' },
      { bij: '.profielvoorbeeld__vakken', titel: 'De vakken van je dag', tekst: 'Daaronder staan de vier vakken van je dag, zoals op Vandaag. Hier tik je niets aan: het is alleen een voorbeeld.' },
      // (een kleine telefoon: de zin onder het voorbeeld staat soms alleen in een deel; vroeger met de vultekst "Ook dit hoort erbij")
      { bij: '.profielvoorbeeld__uitleg', titel: 'Alleen een voorbeeld', tekst: 'De zin eronder zegt het nog eens: zo begroet Bloei je op Vandaag.' },
    ],
  },
  'meer/instellingen.kaart': {
    stukken: [
      { bij: '.instellingen__drinken > .kaartkop', eigen: true, titel: 'Drinken instellen', tekst: 'In deze kaart stel je je dagdoel in en hoeveel elke drank telt.' },
      { bij: '[data-uitleg="dagdoel-rij"]', titel: 'Je dagdoel', tekst: 'Met min en plus stel je in hoeveel je per dag wil drinken: een richting, geen eis. Elke wijziging wordt vanzelf bewaard.' },
      { bij: '[data-uitleg="groottes-groep"]', titel: 'Grootte per drank', tekst: 'Bij Water kies je hoeveel één tik op Kan water toevoegt, standaard 800 ml.' },
      { bij: '[data-uitleg="groottes-groep"] + .rij', titel: 'De andere dranken', tekst: 'Ook elke andere drank krijgt een eigen grootte: zoveel telt één tik op die tegel bij je dag.' },
    ],
    vervolg: { naam: '.rij__titel', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook ${opsomming(n.map(klein))} ${n.length > 1 ? 'krijgen' : 'krijgt'} een eigen grootte. Wat je hier kiest, staat meteen op de tegels van Drinken en Vandaag.` }) },
  },
  'meer/instellingen.voorbeeld': {
    stukken: [
      { bij: '.drinkvoorbeeld > .kaartkop', eigen: true, titel: 'Zo ziet het eruit', tekst: 'Dit voorbeeld toont wat je instellingen doen op Drinken.' },
      { bij: '.drinkvoorbeeld__glasrij', titel: 'Je dagdoel in kannen', tekst: 'Hier zie je je dagdoel als kannen water. Pas je het dagdoel of de kan aan, dan rekent het meteen mee.' },
      { bij: '.drinkvoorbeeld__dranken', titel: 'De tegels', tekst: 'Zo staan de tegels op Drinken, met de grootte die je koos. Hier tik je ze niet aan: het is alleen een voorbeeld.' },
      { bij: '.drinkvoorbeeld__week', titel: 'Je week', tekst: 'De staven tonen de dagen van deze week tegenover je dagdoel, zoals op Drinken. Verander je je dagdoel, dan schuiven ze mee.' },
    ],
  },
  'meer/gewicht.kaart': {
    stukken: [
      { bij: '.instellingen__gewicht > .kaartkop', eigen: true, titel: 'Gewicht instellen', tekst: 'In deze kaart kies je je weegdag en zet je een streefgewicht.' },
      { bij: '.instellingen__gewicht .instel__rijgroep', titel: 'Je weegdag', tekst: 'Tik op de dag waarop je je weegt. Je keuze wordt meteen bewaard en staat op het tabblad Gewicht, met de datum van je volgende weging.' },
      { bij: '.instellingen__gewicht .streefrijen', titel: 'Je streefgewicht', tekst: 'Heb je nog geen streefgewicht, dan kies je er een met Zetten. Daarna pas je het aan met min en plus of typ je het getal, en met Wissen haal je het weg.' },
    ],
  },
  'meer/gewicht.voorbeeld': {
    stukken: [
      { bij: '.gewvoorbeeld > .kaartkop', eigen: true, titel: 'Zo ziet het eruit', tekst: 'Dit voorbeeld toont wat je instellingen doen op Gewicht.' },
      { bij: '.gewvoorbeeld__zin', titel: 'Je weegdag in de week', tekst: 'Hier zie je je weegdag in de week en de datum van je volgende weging. Kies je een andere dag, dan verandert het meteen.' },
      { bij: '.gewvoorbeeld__grafiekhouder', titel: 'Je grafiek in het klein', tekst: 'Zo ziet je grafiek eruit, met je streefgewicht als stippellijn als je er een zette. Heb je nog geen weging, dan blijft het vlak leeg.' },
    ],
  },
  'vandaag.kalender': {
    stukken: [
      { bij: '.kalkaart > .kaartkop', titel: 'De kalender', tekst: 'Je maand in één blik. Met de pijlen ga je naar een andere maand.' },
      { bij: '.kalkaart .kalender__week:has(.is-vandaag)', titel: 'De dagen', tekst: 'Vandaag is het {kleur.vandaag:bij} rondje. Tik op een dag om hem te openen.' },
      { bij: '.kalkaart .kalkaart__legenda', titel: 'De tekens', tekst: 'Een {kleur.klaar} bolletje betekent dat je die dag al je supplementen nam, een spuitje dat er een spuit gepland is.' },
      { bij: '.kalkaart .kalkaart__onder', titel: 'Naar het Dagboek', tekst: 'Met Naar het Dagboek open je deze maand in je Dagboek.' },
    ],
    vervolg: {
      naam: '.kalender__nr',
      ookBijStuk: true, // ook in een deel met een eigen stuk: welke dagen erin staan
      maak: (n) => {
        const d = n.map(Number).filter(Number.isFinite);
        const [a, b] = [Math.min(...d), Math.max(...d)];
        return a === b ? { titel: `Dag ${a}`, tekst: `Hier staat dag ${a} van de maand.` } : { titel: `De dagen ${a} tot ${b}`, tekst: `Hier staan de dagen ${a} tot en met ${b} van de maand.` };
      },
    },
  },
  // BESLISSINGEN 627 en 694 (nacht van 18 november, S1): stukken die de goedgekeurde staptekst per zin verdelen over de rijen die de zin noemt.
  // uitZinnen: geen enkel nieuw woord; de teksten van de stukken samen zijn letterlijk de staptekst, in dezelfde volgorde (tests/logica/uitlegstukken.test.js).
  // De titel van het eerste stuk is die van de stap, die van een volgend stuk het label van dat onderdeel op het scherm (src/teksten.js).
  'delen.inhoud': {
    uitZinnen: true,
    stukken: [
      // het label Wat komt erin met Eten en Drinken; de zin noemt de vier onderdelen
      { bij: '.delen__onderdelen > .delen__groeplabel', titel: 'Wat erin komt', tekst: 'Je kiest wat er in je verslag komt: eten, drinken, gewicht en notities. Bij elk onderdeel staat hoeveel er in de periode staat.' },
      // de rijen Gewicht en Notities (delen.gewicht)
      { bij: '.delen__vinkjes > .delen__optie:nth-child(3)', titel: 'Gewicht', tekst: 'Gewicht en notities staan uit tot jij ze aanzet.' },
    ],
    // (een kleine telefoon: een deel met alleen de laatste rij krijgt een eigen zin in plaats van de vultekst "Hier staat ook notities")
    vervolg: { naam: '.rij__titel', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook ${opsomming(n.map(klein))} zet je met een tik aan of uit.` }) },
  },
  'dagboek.supplementen': {
    uitZinnen: true,
    stukken: [
      // de kop met de momenten van de dag; de stand rechts in de kop is ook de knop naar alle supplementen van die dag
      { bij: '.dag__supplementen > .kaartkop', titel: 'Supplementen', tekst: 'Hier vink je per moment af wat je nam. Met de stand rechtsboven, bijvoorbeeld 1 van 3, open je alle supplementen van die dag.' },
      // de rij van een geplande spuit (agenda.kop), alleen op een dag met een geplande beurt
      { bij: '.dag__supplementen .dag__spuit', titel: 'Geplande beurt', tekst: 'Is er die dag een spuit gepland, dan staat ze erbij en vink je ze hier af.' },
    ],
    // (een kleine telefoon: een deel met alleen momenten krijgt een eigen zin in plaats van de vultekst "Hier staat ook avond")
    vervolg: { naam: '.momentrij__naam, .rij__titel', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook ${opsomming(n.map(klein))} vink je hier met één tik af.` }) },
  },
  // ---- Controle van 22 november: kaarten die op een telefoon maar half in het vak stonden, nu in delen met een eigen tekst per deel.
  'dagboek.eten': {
    stukken: [{ bij: '.dag__eten > .kaartkop', titel: 'Eten', tekst: 'Hier staat je eten, per moment van de dag. Tik op een moment om te noteren of aan te passen wat je at.' }],
    vervolg: { naam: '.rij__titel', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Hier ${n.length > 1 ? 'staan' : 'staat'} ${opsomming(n.map((x) => 'je ' + klein(x)))}. Ook ${n.length > 1 ? 'die tik je aan om ze' : 'dat tik je aan om het'} te noteren of aan te passen.` }) },
  },
  'dagboek.drinken': {
    stukken: [
      { bij: '.dag__drinken .dagdranken', titel: 'Drinken', tekst: 'Tik op een drank om er één bij te zetten.' },
      { bij: '.dag__drinken .dagdranklijst', titel: 'Wat je dronk', tekst: 'Per soort zie je wat je dronk, en met het kruisje erbij haal je er één weg.' },
    ],
  },
  'dagboek.weekcijfers': {
    stukken: [{ bij: '.wk__skaart--eten', titel: 'De week in cijfers', tekst: 'Bovenaan staan de cijfers van de week.' }],
    vervolg: { naam: '.wk__skop .label, .wk__skop', ookBijStuk: true, maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Hier ${n.length > 1 ? 'staan de tegels' : 'staat de tegel'} ${opsomming(n.map(hoofdletter))}.` }) },
  },
  'dagboek.cijfers': {
    stukken: [{ bij: '.maand__overzicht > .maand__kc:first-child', titel: 'De maand in cijfers', tekst: 'Bovenaan staan de cijfers van de maand.' }],
    vervolg: { naam: '.maand__kclabel', ookBijStuk: true, maak: (n) => ({ titel: n.length > 2 ? 'Nog meer cijfers' : hoofdletter(opsomming(n.map(klein))), tekst: `Hier ${n.length > 1 ? 'staan de tegels' : 'staat de tegel'} ${opsomming(n.map(hoofdletter))}.` }) },
  },
  'drinken.cijfers': {
    stukken: [
      { bij: '.drinken__kern', titel: 'Je week in cijfers', tekst: 'Hier zie je hoeveel je gemiddeld dronk, hoe vaak je je dagdoel haalde, je beste dag en je reeks.' },
      { bij: '.drinken__meest', titel: 'Wat je het meest drinkt', tekst: 'Onderaan zie je wat je die week het meest dronk.' },
    ],
  },
  'supplementen.lijst': {
    stukken: [
      { bij: '.overzichtkaart .schema--dag', titel: 'Je schema', tekst: 'Onder Mijn supplementen staat je schema: wat je neemt, hoeveel en hoe, per moment van de dag.' },
      { bij: '.overzichtkaart .schema--periodiek', titel: 'Niet elke dag', tekst: 'Wat je niet elke dag neemt, staat apart. Staat er spuit of injectie in de naam, dan zie je een spuitje.' },
    ],
  },
  // ---- Een kleine telefoon (375 x 667): kaarten die daar in delen vallen, kregen voor hun vervolg de vultekst "Ook dit hoort erbij". Elk
  // vervolg heeft nu een eigen zin. Op een gewone telefoon past de kaart in een stap en geldt de tekst van de stap.
  'drinken.tegels': {
    stukken: [{ bij: '.drinken__andere > .kaartkop', titel: 'Voeg toe', tekst: 'Elke tegel is één portie. Eén tik op Kan water voegt 800 ml toe, bij de andere dranken de grootte die je instelde.' }],
    vervolg: { naam: '.drankknop__naam', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook ${opsomming(n.map(klein))} voeg je met één tik toe.` }) },
  },
  'drinken.lijst': {
    stukken: [{ bij: '.drinken__lijst .kaartkop', titel: 'Vandaag gedronken', tekst: 'Hier staat wat je vandaag dronk, per soort. Met de knop bij een soort haal je er één weg.' }],
    vervolg: { naam: '.soortblok__naam', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook bij ${opsomming(n.map(klein))} haal je er met het kruisje één weg.` }) },
  },
  'h:drinken.regel': {
    stukken: [{ bij: '.drinken__lijst .kaartkop', titel: 'Eén weghalen', tekst: 'Wil je een drank van eerder vandaag weghalen? Tik bij Vandaag gedronken op de knop bij die soort.' }],
    vervolg: { naam: '.soortblok__naam', maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Ook bij ${opsomming(n.map(klein))} staat het kruisje om er één weg te halen.` }) },
  },
  'meer.profiel': {
    stukken: [
      { bij: '.meer__profiel .meer__profielrij', titel: 'Je profiel', tekst: 'Tik op je profiel om je naam, je foto en je geboortedatum aan te passen.' },
      { bij: '.meer__profiel .meer__stats', titel: 'Je cijfers', tekst: 'Eronder zie je hoeveel dagen je bijhield, hoeveel dagen op rij en hoeveel badges je behaalde.' },
    ],
  },
  'meer/instellingen.weetjes': {
    stukken: [
      { bij: '.instel__weetjes .weetje:first-child', titel: 'Goed om te weten', tekst: 'Hier lees je in drie regels hoe drinken in Bloei telt.' },
      { bij: '.instel__weetjes .weetje--link', titel: 'Toon het me', tekst: 'Met Toon het me zie je deze stappen later nog eens.' },
    ],
  },
  'meer/gewicht.weetjes': {
    stukken: [
      { bij: '.instel__weetjes .weetje:first-child', titel: 'Goed om te weten', tekst: 'Hier lees je in drie regels hoe wegen in Bloei werkt.' },
      { bij: '.instel__weetjes .weetje--link', titel: 'Toon het me', tekst: 'Met Toon het me zie je deze stappen later nog eens.' },
    ],
  },
  // Een lange lijst favorieten past op een kleine telefoon niet in een vak: het vervolg krijgt een eigen zin in plaats van een vultekst.
  'meer/favorieten.lijst': {
    stukken: [{ bij: '.favorieten__lijst > .kaartkop', titel: 'Je favorieten', tekst: 'Hier staan al je favorieten, met de maaltijd waarbij je ze het laatst gebruikte.' }],
    vervolg: { maak: () => ({ titel: 'Nog meer favorieten', tekst: 'Hier staat de rest van je favorieten.' }) },
  },
  'meer/badges.stand': {
    stukken: [
      { bij: '.badgehero > .badgehero__laatst', titel: 'Je stand', tekst: 'Bovenaan staan je laatste medaille en de volgende die eraan komt.' },
      { bij: '.badgehero > .badgehero__reeks', titel: 'Je aantallen', tekst: 'Hier zie je hoeveel medailles je al hebt, hoeveel dagen je bijhield en je reeks.' },
    ],
  },
  'meer.badges': {
    stukken: [
      { bij: '.meer__badges .meer__medailles', titel: 'Je medailles', tekst: 'Hier zie je je laatste medaille en de volgende die eraan komt.' },
      { bij: '.meer__badges .meer__kleinemedailles', titel: 'Wat je al behaalde', tekst: 'Daaronder staan de medailles die je al behaalde.' },
      { bij: '.meer__badges > .meer__actie', titel: 'Alle badges', tekst: 'Met Alle badges bekijken open je ze allemaal, met wat ze betekenen.' },
    ],
  },
};

// Voor de teksten van een deel zonder eigen stuk: een opsomming ("a, b en c") en hoofd- of kleine letter vooraan.
function opsomming(lijst) {
  return lijst.length < 2 ? lijst.join('') : `${lijst.slice(0, -1).join(', ')} en ${lijst[lijst.length - 1]}`;
}
function hoofdletter(x) {
  return x.charAt(0).toUpperCase() + x.slice(1);
}
function klein(x) {
  return x.charAt(0).toLowerCase() + x.slice(1);
}

// Welke handeling een schermrondleiding aan het einde aanbiedt ("Wil je zien hoe je een maaltijd noteert?").
// rondleiding.js leest AANBOD[sleutel] pas in de laatste stap, op het scherm zelf.
const opScherm = (selector) => {
  try {
    return typeof document !== 'undefined' && Boolean(document.querySelector?.(selector));
  } catch {
    return false;
  }
};
export const AANBOD = {
  vandaag: 'maaltijd',
  dagboek: 'dagboek',
  drinken: 'drinken',
  // BESLISSING 694: zonder supplementen (de lege kaart staat op het scherm) is er niets af te vinken; het aanbod gaat dan naar het toevoegen:
  // de handleiding Een supplement aanpassen, die dan de velden uitlegt op het lege kaartje (openBewerkSupplement).
  get supplementen() {
    return opScherm('.supplementen__leegkaart') ? 'lijst' : 'supplementen';
  },
  gewicht: 'gewicht',
  'meer/vergrendeling': 'slot',
};

// BESLISSING 694: een handeling die bij een leeg profiel op haar eigen scherm niets te tonen heeft. Is isLeeg() waar, dan start rondleiding.js
// (startHandeling) in de plaats de rondleiding `sleutel` op `route`. "Supplementen afvinken" zonder supplementen: Vandaag tekent dan geen kaart
// Supplementen; de rondleiding van het tabblad Supplementen toont één stap op de lege kaart (Nog geen supplementen) met het aanbod om het
// toevoegen stap voor stap te zien. isLeeg laadt de gegevens pas bij de aanroep, zodat stappen.js in node te lezen blijft.
export const BIJ_LEEG = {
  supplementen: {
    route: 'supplementen',
    sleutel: 'supplementen',
    isLeeg: async () => {
      const { leesSupplementen } = await import('../data/supplementen.js');
      return (await leesSupplementen()).length === 0;
    },
  },
};

// Op welk scherm een handeling gebeurt (de route); 'hier' = op het huidige scherm.
export const HANDELING_SCHERM = {
  maaltijd: 'vandaag',
  drinken: 'drinken',
  supplementen: 'vandaag',
  lijst: 'supplementen',
  gewicht: 'gewicht',
  dagboek: 'dagboek',
  weer: 'vandaag',
  verslag: 'delen',
  slot: 'meer/vergrendeling',
  meldingen: 'meer/meldingen',
  profiel: 'meer/profiel',
  thema: 'meer',
  instDrinken: 'meer/instellingen',
  instGewicht: 'meer/gewicht',
  beginscherm: 'hier',
  badges: 'meer/badges',
};

// De onderwerpen van "Hoe doe ik dat?": elk start een handeling. begrip: uit src/ui/iconenkaart.js.
export const ONDERWERPEN = [
  { id: 'maaltijd', sleutel: 'h:maaltijd', begrip: 'eten' },
  { id: 'drinken', sleutel: 'h:drinken', begrip: 'drinken' },
  { id: 'supplementen', sleutel: 'h:supplementen', begrip: 'supplementen' },
  { id: 'lijst', sleutel: 'h:lijst', begrip: 'bewerken' },
  { id: 'gewicht', sleutel: 'h:gewicht', begrip: 'gewicht' },
  { id: 'dagboek', sleutel: 'h:dagboek', begrip: 'dagboek' },
  { id: 'weer', sleutel: 'h:weer', begrip: 'weer' },
  // BESLISSING 563: deze drie handelingen vielen volledig samen met de rondleiding van hun scherm; de rij start die rondleiding.
  { id: 'verslag', sleutel: 'delen', begrip: 'delen' },
  { id: 'meldingen', sleutel: 'meer/meldingen', begrip: 'herinneringen' },
  { id: 'slot', sleutel: 'h:slot', begrip: 'vergrendeling' },
  // BESLISSING 579: vier korte handleidingen in plaats van één over al je instellingen.
  // BESLISSING 645: drie ervan starten de rondleiding van hun instelscherm (een tekst, twee ingangen).
  { id: 'profiel', sleutel: 'meer/profiel', begrip: 'profiel' },
  { id: 'thema', sleutel: 'h:thema', begrip: 'thema' },
  { id: 'instDrinken', sleutel: 'meer/instellingen', begrip: 'drinken' },
  { id: 'instGewicht', sleutel: 'meer/gewicht', begrip: 'weegdag' },
  { id: 'beginscherm', sleutel: 'h:beginscherm', begrip: 'home' },
  { id: 'badges', sleutel: 'meer/badges', begrip: 'badge' },
];

// Het deel van de teksten voor een sleutel.
function tekstDeel(sleutel) {
  if (sleutel.startsWith('h:')) return 'handeling.' + sleutel.slice(2);
  return IDENT[sleutel];
}

// ---- Android (BESLISSING 423, AN-02 en AN-04) ----
// Op Android krijgt "Bloei op mijn beginscherm zetten" eigen stappen (Chrome, of een algemene stap in een andere browser), en een
// stap waarvan de tekst een Android-variant heeft (teksten: uitleg.<deel>Android.<id>) toont die. Op iPhone, iPad en desktop blijft alles
// zoals het was: daar wordt geen enkele variant gelezen.
// Is de apk er (BESLISSING 515), dan gaat de uitleg over de download in plaats van over het menu van Chrome.
const ANDROID_STAPPEN = {
  'h:beginscherm': (chrome, apk) =>
    apk
      ? { deel: 'handeling.beginschermApk', lijst: [{ id: 'download', midden: true }, { id: 'openen', midden: true }, { id: 'toestaan', midden: true }, { id: 'daarna', midden: true }] }
      : chrome
      ? { deel: 'handeling.beginschermAndroid', lijst: [{ id: 'chrome', midden: true }, { id: 'menu', midden: true }, { id: 'installeren', midden: true }, { id: 'daarna', midden: true }] }
      : { deel: 'handeling.beginschermAndroidAnder', lijst: [{ id: 'menu', midden: true }, { id: 'daarna', midden: true }] },
  beginscherm: (chrome, apk) =>
    apk
      ? { deel: 'stap.beginschermApk', lijst: [{ id: 'download', midden: true }, { id: 'toestaan', midden: true }] }
      : chrome
      ? { deel: 'stap.beginschermAndroid', lijst: [{ id: 'menu', midden: true }, { id: 'installeren', midden: true }] }
      : { deel: 'stap.beginschermAndroidAnder', lijst: [{ id: 'menu', midden: true }] },
};
const heeftTekst = (pad) => typeof pad.split('.').reduce((o, d) => (o == null ? o : o[d]), TEKSTEN) === 'string';

// De stappen van een rondleiding met hun teksten; [] als er geen uitleg is.
// toestel: { android, chrome, apk } (voor de tests); standaard het toestel van de pagina (src/kern/toestel.js).
// Of de apk er is, leest rondleiding.js (src/pwa/apk.js leest de bouwvariabelen); stappen.js zelf blijft zonder bouwvariabelen te laden,
// zodat ook de schermtests (node) de stappen en teksten kunnen inlezen.
let apkBron = () => false;
export function zetApkBron(fn) {
  apkBron = typeof fn === 'function' ? fn : () => false;
}
// als (BESLISSING 694): een stap met een voorwaarde hoort er alleen bij als dat onderdeel op het scherm staat. Zonder pagina (de tests in node)
// telt elke stap mee.
const voldaan = (s) => {
  if (!s.als || typeof document === 'undefined' || typeof document.querySelector !== 'function') return true;
  try {
    return Boolean(document.querySelector(s.als));
  } catch {
    return true;
  }
};
export function stappenVoor(sleutel, { android = isAndroid(), chrome = isChromeAndroid(), apk = apkBron() } = {}) {
  let lijst = STAPPEN[sleutel];
  if (!lijst) return [];
  let deel = tekstDeel(sleutel);
  if (android && ANDROID_STAPPEN[sleutel]) ({ lijst, deel } = ANDROID_STAPPEN[sleutel](chrome, apk));
  const deelVoor = (id) => (android && heeftTekst(`uitleg.${deel}Android.${id}.titel`) ? deel + 'Android' : deel);
  return lijst.filter(voldaan).map((s) => {
    // tekstVan: een tekst die meer stappen delen (de knoppen bovenaan op elk scherm onder Algemeen), zodat ze maar één keer in teksten.js staat.
    const ts = s.tekstVan ?? `${deelVoor(s.id)}.${s.id}`;
    const klein = s.klein ?? KLEIN[`${sleutel}.${s.id}`];
    const stukken = typeof s.stukken === 'string' ? STUKKEN[s.stukken] : s.stukken;
    return { ...s, ...(klein ? { klein } : {}), ...(stukken ? { stukken } : {}), tekstSleutel: ts, titel: t(`uitleg.${ts}.titel`), tekst: t(`uitleg.${ts}.tekst`) };
  });
}

export const heeftUitleg = (sleutel) => Boolean(STAPPEN[sleutel]);

// ---- Tekst per soort toestel (BESLISSING 590) ----
// Een tekst zegt niets over een ander toestel of een andere bediening dan die van wie leest. Twee kenmerken, zoals de app ze zelf gebruikt:
//   breed: het menu staat links (vanaf 960 px, layout.css); smal: de balk onderaan, met telefoon (onder 720 px) en tablet als fijnere maat;
//   muis: een muis of touchpad met hover ((hover: hover) and (pointer: fine)); anders aanraking.
// TOESTEL_TEKST geeft per tekst (deel van de teksten + id) de varianten; een variant vervangt titel of tekst. Met een muis wordt "tik" daarna
// "klik" (en aantikken, getikt, tikte), behalve in de teksten over iets op de telefoon zelf (Bloei op het beginscherm; ZONDER_KLIK).
export const TOESTEL_TEKST = {
  'stap.vandaag.menu': {
    // telefoon: vijf tabbladen, Algemeen zit achter het tandwiel bovenaan; tablet: zes tabbladen in dezelfde balk; breed: het menu links.
    telefoon: { titel: 'De balk onderaan', tekst: 'Onderaan kies je een tabblad: Vandaag, Dagboek, Drinken, Supplementen en Gewicht. Algemeen opent met het tandwiel bovenaan. Bij het tabblad waar je bent, licht het icoon op met een bolletje eronder.' },
    smal: { titel: 'De balk onderaan', tekst: 'Onderaan kies je een tabblad: Vandaag, Dagboek, Drinken, Supplementen, Gewicht en Algemeen. Bij het tabblad waar je bent, licht het icoon op met een bolletje eronder.' },
    breed: { titel: 'Het menu links', tekst: 'Links kies je een tabblad: Vandaag, Dagboek, Drinken, Supplementen, Gewicht en Algemeen. Het tabblad waar je bent, staat in een zacht vlak.' },
  },
  // Het tandwiel naar Algemeen staat alleen op een telefoon; op een tablet en een computer slaat de rondleiding die stap over.
  'stap.vandaag.instellingen': {
    telefoon: { tekst: 'Rechts naast Delen staat een tandwiel. Daarachter zit Algemeen: je profiel, je favoriete maaltijden, je badges en alle instellingen.' },
  },
  // kort: een kortere tekst met dezelfde inhoud, alleen als het blok met de gewone tekst niet naast de kaart past (BESLISSING 591).
  'stap.vandaag.dag': {
    kort: { tekst: 'De tegels tonen hoe je dag ervoor staat. Je hoeft er niets mee te doen: de cijfers tellen vanzelf mee.' },
  },
  'stap.vandaag.badges': {
    aanraak: { tekst: 'Hier staan je laatste medaille en de medailles die eraan komen. Tik erop om te lezen wat ze betekenen.' },
    muis: { tekst: 'Hier staan je laatste medaille en de medailles die eraan komen. Ga erover met de muis om te lezen wat ze betekenen.' },
  },
  'stap.dagboek.weekschema': {
    aanraak: { tekst: 'Eén rij per dag, met tekens voor eten, drinken, supplementen en notitie. Dit is alleen om te lezen. Tik op een teken om te zien wat het betekent.' },
    muis: { tekst: 'Eén rij per dag, met tekens voor eten, drinken, supplementen en notitie. Dit is alleen om te lezen. Ga met de muis over een teken om te zien wat het betekent.' },
  },
  // De knoppen bovenaan een scherm onder Algemeen: Delen staat in de kop tot 960 px, daarboven in de zijbalk (componenten.css).
  'stap.kopSub': {
    breed: { tekst: 'Met Algemeen ga je terug naar het tabblad Algemeen. Het vraagteken start de rondleiding van dit scherm en het huisje brengt je naar Vandaag.' },
  },
  // De knoppen bovenaan een tabblad (zonder terugknop) en op Delen (zonder Delen): dezelfde regel voor het brede scherm.
  'stap.kopTab': {
    breed: { tekst: 'Het vraagteken start de rondleiding van dit scherm en het huisje brengt je naar Vandaag.' },
  },
  // Het weetje op het scherm Uitleg (scherm.js): op een toestel zonder toetsenbord is er geen Escape.
  'uitleg.weetje1': {
    aanraak: { tekst: 'Je slaat een rondleiding over met Overslaan.' },
  },
};
const ZONDER_KLIK = ['stap.beginscherm', 'handeling.beginscherm'];
const KLIK = [[/\baantikken\b/g, 'aanklikken'], [/\bAantikken\b/g, 'Aanklikken'], [/\bgetikt\b/g, 'geklikt'], [/\btikte\b/g, 'klikte'], [/\btik\b/g, 'klik'], [/\bTik\b/g, 'Klik']];
const naarKlik = (x) => KLIK.reduce((a, [re, door]) => a.replace(re, door), String(x ?? ''));
function variant(sleutel, { muis = false, breed = false, telefoon = false } = {}) {
  const v = TOESTEL_TEKST[sleutel];
  if (!v) return {};
  // breed: het menu links (vanaf 960 px). Daaronder de balk onderaan: telefoon (onder 720 px) of tablet, met smal als gedeelde terugval.
  const maat = breed ? v.breed : { ...v.smal, ...(telefoon ? v.telefoon : v.tablet) };
  return { ...maat, ...(muis ? v.muis : v.aanraak) };
}
// ---- Tekst bij een leeg profiel (BESLISSING 694) ----
// Dezelfde stap, op hetzelfde onderdeel, maar het scherm toont nog niets van de gebruiker. Staat `als` op het scherm wanneer de stap getoond wordt
// (na de actie van de stap, voor), dan geldt de tekst onder uitleg.<tekst> (en de titel, als die er is). De gewone tekst blijft voor een gevuld profiel.
export const LEEG_TEKST = {
  'stap.supplementen.toevoegen': { als: '.supplementen__leegkaart', tekst: 'leeg.supplementen' },
  'stap.favorieten.lijst': { als: '.favorieten__lijst .leeg', tekst: 'leeg.favorieten' },
  // Algemeen: de knop Favoriet toevoegen staat er alleen zolang er geen favorieten zijn.
  'stap.meer.favorieten': { als: '.meer__link--plus', tekst: 'leeg.meerFavorieten' },
  // Het lege kaartje heeft geen Verwijderen; dat van een bestaand supplement altijd.
  'handeling.lijst.bewaren': { als: 'dialog[open].supplementkaart:not(:has([data-uitleg="kaart-weghalen"]))', tekst: 'leeg.bewaren' },
  'handeling.lijst.nieuw': { als: '.supplementen__leegkaart', tekst: 'leeg.nieuw' },
};
function leegVariant(sleutel) {
  const v = LEEG_TEKST[sleutel];
  if (!v || !opScherm(v.als)) return {};
  const titel = `uitleg.${v.tekst}.titel`;
  return { ...(heeftTekst(titel) ? { titel: t(titel) } : {}), tekst: t(`uitleg.${v.tekst}.tekst`) };
}

// De titel en tekst van een stap voor dit toestel. Een afgerond deel (stap.deel) heeft zijn eigen tekst (STUKKEN): alleen tik wordt klik.
export function tekstVoorToestel(stap, toestel = {}) {
  const v = stap.deel ? {} : { ...variant(stap.tekstSleutel, toestel), ...(stap.kort ? TOESTEL_TEKST[stap.tekstSleutel]?.kort : null), ...leegVariant(stap.tekstSleutel) };
  let titel = v.titel ?? stap.titel;
  let tekst = v.tekst ?? stap.tekst;
  if (toestel.muis && !ZONDER_KLIK.some((p) => String(stap.tekstSleutel || '').startsWith(p))) {
    titel = naarKlik(titel);
    tekst = naarKlik(tekst);
  }
  return { titel, tekst };
}
export const heeftKort = (stap) => Boolean(!stap.deel && TOESTEL_TEKST[stap.tekstSleutel]?.kort);
// Een losse tekst (zoals een weetje) voor dit toestel: de variant als die er is, anders de gewone.
export const toestelTekst = (sleutel, gewoon, toestel = {}) => variant(sleutel, toestel).tekst ?? gewoon;

// ---- Kleinere doelen op een klein scherm (BESLISSING 548) ----
// Op een telefoon (staand smaller dan 720 px, of liggend lager dan 560 px) moet het aangeduide onderdeel VOLLEDIG omkaderd en in beeld staan,
// samen met de kaart. Is het hele onderdeel daarvoor te hoog, dan wijst de stap het deel aan waar de tekst over gaat: `klein` is een lijst
// kleinere doelen, van groot naar klein ({ doel, ook?, marge?, straal? }). De rondleiding neemt het eerste doel dat volledig past (het
// gewone doel eerst); op tablet en desktop blijft het gewone doel.
export const isKleinScherm = ({ breed, hoog }) => breed < 720 || hoog < 560;
const DOELVELDEN = ['doel', 'ook', 'marge', 'straal', 'vlak'];
// smal (BESLISSING 592): op een telefoon (smaller dan 720 px) vult `smal` het gewone doel aan ({ ook }), zonder het vak op een groot scherm te veranderen.
export function doelKeuzes(stap, scherm = null) {
  if (!stap || stap.midden) return [];
  const gewoon = { ...Object.fromEntries(DOELVELDEN.map((k) => [k, stap[k] ?? null])), ...(stap.smal && scherm && scherm.breed < 720 ? stap.smal : {}) };
  if (!stap.klein?.length || (scherm && !isKleinScherm(scherm))) return [gewoon];
  return [gewoon, ...stap.klein.map((k) => ({ ...Object.fromEntries(DOELVELDEN.map((v) => [v, null])), ...k }))];
}
