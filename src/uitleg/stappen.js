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
// twee ingangen). Op een telefoon in delen (STUKKEN).
const THEMA_KAART = { doel: '[data-uitleg="thema"], .meer__themakaart', stukken: 'h:thema.kaart', tekstVan: 'handeling.thema.kaart' };

export const STAPPEN = {
  vandaag: [
    { id: 'menu', doel: '#tabbalk, #zijbalk' },
    { id: 'kop', doel: '.begroeting__uitleg', ook: 'a.begroeting__delen', marge: 0 }, // twee knoppen: het gat sluit ze precies in, zonder lichte pil eromheen
    { id: 'dag', doel: '.voortgang' },
    { id: 'badges', doel: '[data-uitleg="badges"], .vc--motivatie .medaille, .vc--motivatie' },
    { id: 'week', doel: '[data-uitleg="week"], .vandaag__week, .weekbolletjes' },
    { id: 'gevoel', doel: '.stemmingkaart, .gevoel, .energiekaart', stukken: 'vandaag.gevoel' },
    // BESLISSINGEN 548 en 570: de hele kaart Drinken; past ze niet, dan verdeelt de rondleiding ze in afgeronde delen (zie STUKKEN).
    { id: 'glas', doel: '.drinkkaart', stukken: 'vandaag.glas' },
    { id: 'afvinken', doel: '[data-uitleg="momenten"], .afvinklijst, .momentkop', stukken: 'vandaag.afvinken', zonderDeel: '.momentrij[data-moment="beurt"]' }, // zonderDeel: de spuit heeft een eigen stap
    { id: 'spuit', doel: '.suppmomenten .momentrij[data-moment="beurt"]' }, // alleen op de dag van een geplande spuit (of een ander periodiek supplement)
    // De tekst gaat over de hele kolom Eten: de hele kaart, met haar kop (BESLISSING 570); op een telefoon in delen.
    { id: 'maaltijd', doel: '.etenkaart, .maaltijd', stukken: 'vandaag.maaltijd' },
    { id: 'kalender', doel: '[data-uitleg="vandaag-kalender"], .kalkaart', stukken: 'vandaag.kalender' },
    { id: 'delen', doel: '.begroeting__delen:not(.begroeting__uitleg), .schermkop__delen' },
  ],
  // Het Dagboek heeft drie weergaven; de stappen van een andere weergave dan de huidige slaat de rondleiding vanzelf over (het onderdeel ontbreekt).
  dagboek: [
    // De knoppen Rondleiding en home in de kop, niet de hele kopband: die loopt op een telefoon van rand tot rand (het vak viel buiten
    // het scherm) en bevat ook Dag, Week en Maand, de volgende stap. Delen staat op het Dagboek niet in de kop maar onder de datum.
    { id: 'kop', doel: '.dagboek__kop .schermkop__uitleg', ook: '.dagboek__kop .schermkop__home' },
    { id: 'weergave', doel: '.segment' },
    { id: 'bladeren', doel: '.bladerkop' },
    { id: 'delen', doel: '.week__delen .knop' }, // in dag, week en maand: de knop onder de datum
    // dagweergave
    { id: 'eten', doel: '.dag__eten' },
    { id: 'notitie', doel: '.dag__notitie' },
    { id: 'drinken', doel: '.dag__drinken' },
    { id: 'supplementen', doel: '.dag__supplementen', stukken: 'dagboek.supplementen' },
    { id: 'stemming', doel: '.dag__stemming' },
    // weekweergave
    { id: 'weekcijfers', doel: '.wk__samenvatting' },
    { id: 'weekschema', doel: '.wk__schemakaart', klein: [{ doel: '.wk__compactlijst' }, { doel: '.wk__compactlijst > .wk__compactitem:first-child', ook: '.wk__compactlijst > .wk__compactitem:nth-child(3)' }, { doel: '.wk__compactlijst > .wk__compactitem:first-child' }] }, // klein: een paar rijen (BESLISSING 548)
    // maandweergave
    { id: 'cijfers', doel: '.maand__cijferkaart', klein: [{ doel: '.maand__overzicht' }, { doel: '.maand__overzicht > .maand__kc:first-child', ook: '.maand__overzicht > .maand__kc:nth-child(4)' }, { doel: '.maand__overzicht > .maand__kc:first-child', ook: '.maand__overzicht > .maand__kc:nth-child(2)' }] }, // klein: de bovenste cijfers
    // BESLISSING 656: op een telefoon in delen, gesneden tussen twee weken (raster, STUKKEN). De legenda heeft een eigen stap (tekens): zonder
    // haar neemt het laatste deel geen weekrijen mee die er niet bij horen.
    { id: 'maand', doel: '.maand__kalkaart', stukken: 'dagboek.maand', raster: true, zonderDeel: '.maand__legenda' },
    { id: 'tekens', doel: '.maand__legenda' },
    { id: 'paneel', doel: '.maand__dag', klein: [{ doel: '.maand__paneel > .kaartkop', ook: '.maand__paneelinhoud' }, { doel: '.maand__paneel > .kaartkop', ook: '.maand__paneelinhoud > :nth-child(3)' }, { doel: '.maand__paneel > .kaartkop', ook: '.maand__paneelinhoud > :first-child' }] }, // klein: de dag en haar waarden
    { id: 'beurt', doel: '.maand__gepkaart' },
  ],
  drinken: [
    { id: 'voortgang', doel: '.drinkhoofd__stand, .drinkhoofd' },
    { id: 'tegels', doel: '.drinken__andere .drankrij', ook: '.drinken__andere > .kaartkop' }, // de tegels zelf (eerste doel), met de kop Voeg toe (ook)
    { id: 'laatste', doel: '.drinken__laatste' },
    { id: 'lijst', doel: '.drinken__lijst' },
    { id: 'week', doel: '.drinken__week' },
    { id: 'instellingen', doel: '[data-uitleg="drinken-instellingen"], .weetje--link' },
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
    { id: 'lijst', doel: '.overzichtkaart > .kaartkop', ook: '.overzichtkaart > table.schema:last-of-type' },
    // Zonder supplementen (BESLISSING 694): de hele lege kaart, met de tekst Nog geen supplementen (LEEG_TEKST) en daarna het aanbod om het
    // toevoegen stap voor stap te zien (AANBOD). klein: op een lage telefoon past de lege kaart niet naast de uitlegkaart; dan haar inhoud (het
    // merk, de zin en de knop), of de zin met de knop, in plaats van de kaart in twee delen met een tekst die er niet bij hoort. Met supplementen
    // is het doel de knop Supplement toevoegen, die altijd past: daar verandert niets.
    // BESLISSINGEN 696 en 718: de lege kaart draagt ook de tekstknop Lijst uit een bestand overnemen; de tekst bij een leeg profiel noemt hem,
    // dus het kleinste doel loopt van de zin tot en met die knop (de knop Eerste supplement toevoegen ligt ertussen).
    // laatste: past ook dat niet boven de uitlegkaart (320x480), dan zou het vak afgesneden worden, dwars door het merk van de kaart. Alleen dan
    // wordt het doel de knop Eerste supplement toevoegen (waar de tekst naartoe leidt), een geheel dat wel past (rondleiding.js, kiesDoelMetLucht).
    { id: 'toevoegen', doel: '[data-uitleg="toevoegen"], .supplementen__toevoegen, .supplementen__leegkaart', klein: [{ doel: '.supplementen__leegkaart .leeg' }, { doel: '.supplementen__leegkaart .leeg__tekst', ook: '.supplementen__leegkaart .lijstbestand' }, { doel: '.supplementen__leegkaart .leeg > .knop', laatste: true }] },
    { id: 'aanpassen', doel: '[data-uitleg="supplement-rij"], .overzicht__rij' },
    // BESLISSINGEN 696 en 718: de knoppen Lijst bewaren en Lijst overnemen onderaan Mijn supplementen. Bij een lege lijst staat daar alleen de
    // tekstknop in de lege kaart (is-leeg); die legt de stap toevoegen uit, dus dan valt deze stap weg.
    { id: 'bestand', doel: '.lijstbestand:not(.is-leeg)', als: '.lijstbestand:not(.is-leeg)' },
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
  ],
  meer: [
    { id: 'profiel', doel: '[data-uitleg="profiel"], .meer__profiel' },
    { id: 'thema', ...THEMA_KAART }, // dezelfde stap en tekst als de handleiding Een thema kiezen (h:thema)
    { id: 'favorieten', doel: '.meer__favorieten' },
    { id: 'instellingen', doel: '[data-uitleg="menu-instellingen"], .meer__menu > .rij, .meer__menu' },
    { id: 'uitleg', doel: '.meer__menu > .rij:last-child' },
    { id: 'badges', doel: '[data-uitleg="badges"], .meer__badges' },
    { id: 'wissen', doel: '.knop--wis' },
    { id: 'privacy', doel: '.privacy' }, // de kaart Privacy, onder Over
  ],
  delen: [
    { id: 'periode', doel: '[data-uitleg="delen-periode"], .delen__datum' },
    // het hele blok Onderdelen met zijn label: de rij Drinken viel buiten het vak
    // de vinkjes zelf (eerste doel, de haak), met hun label erboven (ook): samen het hele blok Onderdelen
    { id: 'inhoud', doel: '[data-uitleg="delen-onderdelen"], .delen__vinkjes', ook: '.delen__onderdelen > .delen__groeplabel', stukken: 'delen.inhoud' },
    { id: 'voorbeeld', doel: '[data-uitleg="delen-voorbeeld"], .verslagvel' },
    { id: 'bewaren', doel: '[data-uitleg="delen-knoppen"], .delen__knoppen' },
  ],
  // BESLISSINGEN 579, 627 en 645: de rondleiding van elk instelscherm is ook de handleiding van dat scherm. Het vraagteken start ze, en de rij
  // op het scherm Rondleiding start dezelfde stappen (ONDERWERPEN: de sleutel is de route); een tekst, twee ingangen. Elke stap licht een hele
  // kaart met haar kop op; past ze op een telefoon niet, dan verdeelt de rondleiding ze in delen met de teksten uit STUKKEN. De laatste stap zijn
  // de knoppen bovenaan, met een gedeelde tekst (tekstVan). Geen aanbod na afloop (AANBOD): het zou herhalen wat net getoond werd.
  'meer/instellingen': [
    { id: 'kaart', doel: '.instellingen__drinken', stukken: 'meer/instellingen.kaart' },
    { id: 'voorbeeld', doel: '.instel__voorbeeld', stukken: 'meer/instellingen.voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/gewicht': [
    { id: 'kaart', doel: '.instellingen__gewicht', stukken: 'meer/gewicht.kaart' },
    { id: 'voorbeeld', doel: '.instel__voorbeeld', stukken: 'meer/gewicht.voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/vergrendeling': [
    { id: 'aanzetten', doel: '[data-uitleg="slot-schakelaar"], .slot-scherm .schakelaar' },
    { id: 'code', doel: '[data-uitleg="slot-pin"], [data-uitleg="slot-schakelaar"]' },
    { id: 'faceid', doel: '[data-uitleg="slot-keuze"]' },
    // BESLISSINGEN 531, 538 en 541: één stap over een vergeten code. Ze wijst de rij Herstelcode aan (de rij van het toestel verdwijnt: herstel met
    // het toestel kan zonder koppelen). De rij bestaat alleen met het slot aan; anders valt de stap weg.
    { id: 'herstel', doel: '[data-uitleg="slot-herstel"]' },
    { id: 'voorbeeld', doel: '.slotvoorbeeld' },
  ],
  // Herinneringen: zonder haken, met klassen. Welke onderdelen er zijn hangt af van de toestand (beschikbaar, niet beschikbaar, installeren, geweigerd): de rest valt weg.
  'meer/meldingen': [
    { id: 'installeren', doel: '.meldingen__stappen' },
    { id: 'hoofd', doel: '.meldingen__hoofd' },
    // De drie soorten samen; op een klein scherm de eerste.
    { id: 'soort', doel: '.meldingen__soort', ook: '.meldingen__soort ~ .meldingen__soort ~ .meldingen__soort ~ .meldingen__soort', klein: [{ doel: '.meldingen__soort' }] },
    { id: 'uur', doel: '.meldingen__uur, .meldingen__slot' },
    { id: 'toevoegen', doel: '.meldingen__toevoegen' },
    // BESLISSING 710: de schakelaar Details tonen in meldingen, onder de soorten (ook als nep-rij zolang er niets aan staat).
    { id: 'details', doel: '.meldingen__details' },
    { id: 'voorbeeld', doel: '.meldingen__voorbeeldkaart, .instel__voorbeeld', klein: [{ doel: '.meldingen__telefoon' }, { doel: '.meldingen__stapel' }, { doel: '.meldingen__stapel > :first-child' }] }, // klein: het scherm met de melding
  ],
  'meer/profiel': [
    { id: 'kaart', doel: '.instellingen__profiel', stukken: 'meer/profiel.kaart' },
    { id: 'voorbeeld', doel: '.instel__voorbeeld', stukken: 'meer/profiel.voorbeeld' },
    { id: 'weetjes', doel: '.instel__weetjes' },
    { id: 'kop', doel: '.schermkop__acties', tekstVan: 'stap.kopSub' },
  ],
  'meer/favorieten': [
    { id: 'toevoegen', doel: '.favoriet__nieuw' },
    { id: 'gebruiken', doel: '.instel__voorbeeld' },
    { id: 'weghalen', doel: '.drank__weg' },
  ],
  'meer/badges': [
    { id: 'betekenis', doel: '.medaillekaart, .medailleraster > *' },
    { id: 'ring', doel: '.medaille.is-open, .medaillekaart' },
    { id: 'groepen', doel: '.badgegroep', klein: [{ doel: '.badgegroep__kop', ook: '.medailleraster > :nth-child(2)' }, { doel: '.badgegroep__kop' }] }, // klein: de eerste groep met haar titel en eerste rij
    { id: 'aantikken', doel: '.medailleraster button' },
  ],
  beginscherm: [
    { id: 'deel', midden: true },
    { id: 'zet', midden: true },
  ],

  // ---- Handelingen: één taak van begin tot einde ----
  'h:maaltijd': [
    // BESLISSING 563: geen doel twee keer in één handeling. Kies een moment wijst alle regels aan, Later aanpassen de eerste regel.
    // BESLISSING 592: past de kaart Eten niet in één keer, dan in afgeronde delen, elk met een tekst over wat erin staat (STUKKEN).
    { id: 'regel', doel: '.maaltijd[data-soort="ontbijt"]', ook: '.maaltijd[data-soort="latesnack"]', stukken: 'h:maaltijd.regel' },
    { id: 'open', doel: '.maaltijdblad textarea', voor: 'openMaaltijd' }, // BESLISSING 419: het tekstvak staat in het blad
    { id: 'uur', doel: '[data-uitleg="maaltijd-uur"]', voor: 'openMaaltijd' },
    { id: 'gevoel', doel: '[data-uitleg="maaltijd-gevoel"]', voor: 'openMaaltijd' },
    // BESLISSING 592 (M5, M6): op een telefoon licht de stap ook Annuleren uit (de tekst noemt het, en het staat 8 px naast Klaar); op een groot scherm blijft het vak zoals goedgekeurd.
    { id: 'bewaard', doel: '[data-uitleg="maaltijd-bewaren"]', voor: 'openMaaltijd', smal: { ook: '.maaltijdblad .maaltijd__annuleer' } },
    { id: 'later', doel: '.maaltijd' },
    { id: 'weg', doel: '[data-uitleg="maaltijd-verwijderen"]', voor: 'openMaaltijd' },
    // BESLISSING 592 (M5): op een telefoon met het tekstvak ernaast (het hartje staat 8 px naast het tekstvak, dat er anders half onder de uitlegkaart uitsteekt).
    { id: 'favoriet', doel: '[data-uitleg="maaltijd-favoriet"]', voor: 'openMaaltijd', smal: { ook: '.maaltijdblad textarea' } },
    { id: 'gebruik', doel: '.eten__favorieten' },
  ],
  'h:drinken': [
    { id: 'tik', doel: '.drankknop' },
    { id: 'melding', doel: '.strook', voor: 'toonOngedaanMelding' },
    { id: 'laatste', doel: '.drinken__laatste, .drinkkaart__acties' },
    { id: 'regel', doel: '.drinken__lijst .drank__weg, .drinken__lijst' },
    { id: 'doel', doel: '.drinkhoofd__stand, .drinkkaart' },
    { id: 'vorigeDag', midden: true },
  ],
  // BESLISSING 563: elke stap een eigen onderdeel van de kaart Supplementen op Vandaag: de kaart, de stand rechtsboven, een moment, de extra rij
  // van een spuit (die stap valt weg op een dag zonder spuit of ander periodiek supplement).
  'h:supplementen': [
    { id: 'vandaag', doel: '[data-uitleg="momenten"], .afvinklijst, .momentkop' },
    { id: 'stand', doel: '.vc--supp .kaartkop__eind' },
    { id: 'terug', doel: '.vc--supp .momentrij[data-moment="ochtend"]' },
    { id: 'periodiek', doel: '.vc--supp .momentrij[data-moment="beurt"]' },
  ],
  'h:lijst': [
    { id: 'rij', doel: '[data-uitleg="supplement-rij"], .overzicht__rij' },
    { id: 'naam', doel: '[data-uitleg="kaart-naam"]', voor: 'openBewerkSupplement' },
    { id: 'hoeveelheid', doel: '[data-uitleg="kaart-hoeveelheid"]', voor: 'openBewerkSupplement' },
    { id: 'ritme', doel: '[data-uitleg="kaart-ritme"]', voor: 'openBewerkSupplement' },
    { id: 'momenten', doel: '[data-uitleg="kaart-momenten"]', voor: 'openBewerkSupplement' },
    // BESLISSINGEN 698, 702 en 703: Periode in twee stappen, elk over wat uitgelicht is: de kop met de zin en Begint op, daarna Stopt na. Het
    // hele blok paste op een telefoon niet naast de uitlegkaart in het blad (Stopt na viel buiten het vak terwijl de tekst het noemde).
    { id: 'periode', doel: '.supplementkaart__periodekop', ook: '.supplementkaart__periode .supplementkaart__velden > :first-child', voor: 'openBewerkSupplement', klein: [{ doel: '.supplementkaart__periode .supplementkaart__velden > :first-child' }] },
    { id: 'einde', doel: '.supplementkaart__periode .supplementkaart__velden > :nth-child(2)', voor: 'openBewerkSupplement' },
    { id: 'bewaren', doel: '[data-uitleg="kaart-bewaren"]', voor: 'openBewerkSupplement' },
    // Zonder supplement opent openBewerkSupplement het lege kaartje (BESLISSING 694): daar staat geen Verwijderen.
    { id: 'weg', doel: '[data-uitleg="kaart-weghalen"]', voor: 'openBewerkSupplement', als: '.overzicht__rij' },
    { id: 'nieuw', doel: '[data-uitleg="toevoegen"], .supplementen__toevoegen, .supplementen__leegkaart .knop' },
  ],
  'h:gewicht': [
    { id: 'knop', doel: '[data-uitleg="weging-knop"]' },
    { id: 'getal', doel: '[data-uitleg="weging-getal"], .gewicht__invoer', voor: 'openWeging' },
    { id: 'datum', doel: '[data-uitleg="weging-datum"], .gewicht__invoer', voor: 'openWeging' },
    { id: 'bewaar', doel: '[data-uitleg="weging-bewaar"], .gewicht__acties', voor: 'openWeging' },
    // als (BESLISSING 694): zonder wegingen staat er geen weging in de lijst en geen punt in de grafiek.
    { id: 'aanpassen', doel: '[data-uitleg="gewicht-lijst"], .gewicht__lijst', voor: 'openWeging', als: '.gewicht__rijen > :not(.gewicht__lijstleeg)' },
    { id: 'periode', doel: '[data-uitleg="grafiek-periode"]' },
    { id: 'punt', doel: '[data-uitleg="grafiek-vlak"], .gewichtgrafiek__vlak', als: '.gewichtgrafiek__vlak .grafiek__punt' },
    { id: 'streef', doel: '[data-uitleg="streefgewicht"], .streef' },
  ],
  'h:stemming': [
    { id: 'gezicht', doel: '.gevoel' },
    { id: 'energie', doel: '.energiekaart, .energie', ook: '.stemmingkaart .dag__wis' }, // met de zin eronder, die anders half onder het vak uitstak
    { id: 'wissen', doel: '.gevoel .is-gekozen' }, // BESLISSING 563: het gekozen gezichtje (zonder keuze valt de stap weg)
    { id: 'terug', midden: true },
  ],
  'h:dagboek': [
    { id: 'weergave', doel: '.segment' },
    { id: 'bladeren', doel: '.bladerkop' },
    { id: 'vandaag', doel: '[data-uitleg="naar-vandaag"], .dag__naarvandaag, .bladerkop' },
    { id: 'dag', midden: true },
    { id: 'notitie', doel: '.dag__notitie' },
  ],
  'h:slot': [
    { id: 'aanzetten', doel: '[data-uitleg="slot-schakelaar"], .slot-scherm .schakelaar' },
    { id: 'code', doel: '.slotvoorbeeld__rooster' },
    { id: 'faceid', doel: '[data-uitleg="slot-keuze"], .slotvoorbeeld__faceid' },
    { id: 'terugkeer', doel: '.instel__weetjes, .meldingen__goed' }, // de weetjes van Vergrendeling (Herinneringen heeft .meldingen__goed)
    { id: 'wijzigen', doel: '[data-uitleg="slot-pin"]' },
    { id: 'vergeten', doel: '.slotvoorbeeld__kwijt' },
    // BESLISSING 563: Het slot uitzetten wees dezelfde schakelaar aan als Het slot aanzetten; die stap zegt het nu allebei.
  ],
  // BESLISSING 579: "Mijn instellingen" is vier korte handleidingen. Drie ervan zijn de rondleiding van hun instelscherm (645, zie hierboven);
  // "Een thema kiezen" is de stap Thema van Algemeen (THEMA_KAART).
  'h:thema': [{ id: 'kaart', ...THEMA_KAART }],
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
  'dagboek.eten': [{ doel: '.dag__eten > .kaartkop', ook: '.dag__eten > .maaltijd:nth-child(4)' }, { doel: '.dag__eten > .kaartkop', ook: '.dag__eten > .maaltijd:nth-child(3)' }],
  'dagboek.notitie': [{ doel: '.dag__notitie textarea' }],
  // eerst met de kop van de kaart (de stand van de dag) tot en met de tegels; anders viel de kop buiten het vak
  'dagboek.drinken': [{ doel: '.dag__drinken > .kaartkop', ook: '.dag__drinken .dagdranken' }, { doel: '.dag__drinken .dagdranken', ook: '.dag__drinken .dagdranklijst' }, { doel: '.dag__drinken .dagdranken' }],
  'dagboek.supplementen': [{ doel: '.dag__supplementen .dag__momenten' }],
  'dagboek.weekcijfers': [{ doel: '.wk__skaart--eten', ook: '.wk__skaart--stemming' }, { doel: '.wk__skaart--eten', ook: '.wk__skaart--drinken' }],
  'dagboek.beurt': [{ doel: '.maand__geplandlijst' }],
  'drinken.week': [{ doel: '.drinken__week .weekstaven' }],
  'supplementen.lijst': [{ doel: '.overzichtkaart .schema--dag' }],
  'gewicht.cijfers': [{ doel: '.gewicht__overzicht' }, { doel: '.gewicht__overzicht > li:first-child', ook: '.gewicht__overzicht > li:nth-child(4)' }],
  'gewicht.kalender': [{ doel: '.gewicht__kalromp' }, { doel: '.gewicht__weken' }],
  'gewicht.weetjes': [{ doel: '.gewicht__weetjesrij' }, { doel: '.gewicht__weetjesrij > .weetje:first-child', ook: '.gewicht__weetjesrij > .weetje:nth-child(3)' }],
  'meer.favorieten': [{ doel: '.meer__favrijen' }],
  'meer.instellingen': [{ doel: '.meer__menu > .rij:first-of-type', ook: '.meer__menu > .rij:nth-of-type(3)' }],
  'meer.badges': [{ doel: '.meer__badges > .kaartkop', ook: '.meer__medailles' }, { doel: '.meer__medailles' }, { doel: '.meer__kleinemedailles' }],
  'meer.privacy': [{ doel: '.privacy > .kaartkop', ook: '.privacy__lijst > li:first-child' }, { doel: '.privacy__lijst > li:first-child' }],
  'delen.voorbeeld': VERSLAG_KLEIN,
  'meer/vergrendeling.faceid': [{ doel: '.slot__optie[data-methode="pin"]' }],
  'h:slot.faceid': [{ doel: '.slot__optie[data-methode="pin"]' }],
  'meer/vergrendeling.voorbeeld': [{ doel: '.slotvoorbeeld > .logo', ook: '.slotvoorbeeld__rooster' }, { doel: '.slotvoorbeeld__rooster' }],
  'h:slot.terugkeer': [{ doel: '.instel__weetjesrij' }, { doel: '.instel__weetjesrij > .weetje:first-child', ook: '.instel__weetjesrij > .weetje:nth-child(3)' }],
  'meer/favorieten.gebruiken': [{ doel: '.favorietvoorbeeld__maaltijden', ook: '.favorietvoorbeeld__chips' }, { doel: '.favorietvoorbeeld__chips' }],
  'meer/badges.betekenis': MEDAILLE_KLEIN,
  'meer/badges.aantikken': MEDAILLE_KLEIN,
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
  'vandaag.gevoel': {
    stukken: [
      { bij: '.stemmingkaart > .kaartkop', eigen: true, titel: 'Stemming en energie', tekst: 'In deze kaart hou je bij hoe je dag was: je stemming en je energie.' },
      { bij: '.stemmingkaart .stemming__vraag', titel: 'Je stemming', tekst: 'Kies het gezichtje dat bij je dag past.' },
      { bij: '.stemmingkaart .vandaag__energie', titel: 'Je energie', tekst: 'Tik op de blaadjes voor je energie. Je kan het altijd nog aanpassen.' },
    ],
  },
  'vandaag.glas': {
    stukken: [
      { bij: '.drinkkaart > .kaartkop', eigen: true, titel: 'Drinken', tekst: 'De kaart Drinken heeft twee delen: wat je vandaag dronk en de dranken die je met één tik toevoegt.' },
      { bij: '.drinkkaart .drinkkaart__links', titel: 'Je drinken vandaag', tekst: 'Hier zie je hoeveel je vandaag dronk. Met Laatste weghalen zet je een vergissing recht.', kort: 'Zoveel dronk je vandaag. Laatste weghalen zet een vergissing recht.' },
      { bij: '.drinkkaart .drankrij > :first-child', titel: 'Een kan water erbij', tekst: 'Tik op een drank om ze toe te voegen. Eén tik op Kan water voegt een kan van 800 ml toe.' },
      { bij: '.drinkkaart .drankrij > :nth-child(4)', alleen: true, titel: 'Nog meer dranken', tekst: 'Ook sap, frisdrank en iets anders voeg je met één tik toe.' },
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
    stukken: [{ bij: '.etenkaart > .kaartkop', titel: 'Een maaltijd noteren', tekst: 'Eten staat in één kolom. Tik op een moment van de dag, schrijf kort op wat je at en tik op Klaar.' }],
    vervolg: { naam: '.rij__titel', ookBijStuk: true, maak: (n) => ({ titel: hoofdletter(opsomming(n.map(klein))), tekst: `Hier ${n.length > 1 ? 'staan' : 'staat'} ${opsomming(n.map((x) => 'je ' + klein(x)))}.` }) },
  },
  // De handleiding "Een maaltijd noteren", stap 1 (BESLISSING 592, M6): elk deel noemt alleen de momenten die erin staan.
  'h:maaltijd.regel': {
    stukken: [{ bij: '.etenkaart > .kaartkop', titel: 'Kies een moment', tekst: 'Elk moment van de dag heeft een eigen regel.' }],
    vervolg: {
      naam: '.rij__titel',
      ookBijStuk: true,
      maak: (n) => ({ titel: `Ook ${opsomming(n.map(klein))}`, tekst: `Hier ${n.length > 1 ? 'staan' : 'staat'} ${opsomming(n.map(klein))}. Tik op een regel om hem te openen.` }),
    },
  },
  // De rondleidingen van de instelschermen en de kaart Thema (BESLISSINGEN 579, 627 en 645): per deel van een kaart de tekst over wat erin staat.
  'meer/profiel.kaart': {
    stukken: [
      { bij: '.instellingen__profiel > .kaartkop', eigen: true, titel: 'Naam en profielfoto', tekst: 'In deze kaart stel je je naam en je profielfoto in.' },
      { bij: '.instellingen__profiel .rij:has(.profiel__naam)', titel: 'Je naam', tekst: 'Typ hier je voornaam. Bloei begroet je ermee op Vandaag en zet hem op je verslag. Je naam wordt vanzelf bewaard.' },
      { bij: '.instellingen__profiel .rij:has(.profiel__knoppen)', titel: 'Je profielfoto', tekst: 'Met Foto kiezen kies je een foto op je toestel. Staat er een foto, dan haal je ze weg met Foto weghalen en zie je weer je initiaal.' },
    ],
  },
  'meer/profiel.voorbeeld': {
    stukken: [
      { bij: '.profielvoorbeeld > .kaartkop', eigen: true, titel: 'Zo ziet het eruit', tekst: 'Dit voorbeeld toont hoe Bloei je begroet op Vandaag.' },
      { bij: '.profielvoorbeeld__begroeting', titel: 'Je begroeting', tekst: 'Zo staat je begroeting op Vandaag, met je voornaam en je foto. Ze verandert meteen mee terwijl je typt.' },
      { bij: '.profielvoorbeeld__vakken', titel: 'De vakken van je dag', tekst: 'Daaronder staan de vier vakken van je dag, zoals op Vandaag. Hier tik je niets aan: het is alleen een voorbeeld.' },
    ],
  },
  'h:thema.kaart': {
    stukken: [
      { bij: '.meer__themakaart > .kaartkop', eigen: true, titel: 'Het thema', tekst: 'In deze kaart kies je in welke kleuren je Bloei ziet.' },
      // Elk deel noemt alleen de tegels die erin staan: op een telefoon staan Poeder en Salie in het eerste deel, Nacht en Toestel in het tweede.
      { bij: '.meer__thema > .themategel:first-child', titel: 'Een thema kiezen', tekst: 'Tik op een tegel om Bloei meteen in die kleuren te zien. Je keuze wordt vanzelf bewaard.' },
      { bij: '.meer__thema > .themategel:nth-child(3)', titel: 'Nacht en Toestel', tekst: 'Nacht toont Bloei in donkere kleuren. Kies je Toestel, dan volgt Bloei je toestel: Poeder als het licht staat, Nacht als het donker staat.' },
      { bij: '.meer__thema > .themategel:last-child', alleen: true, titel: 'Toestel', tekst: 'Kies je Toestel, dan volgt Bloei je toestel: Poeder als het licht staat, Nacht als het donker staat.' },
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
  // De kalender van het Dagboek (BESLISSING 656): op een telefoon in twee tot vier delen, gesneden tussen twee weken. De weekdagen staan altijd in
  // het eerste deel en de legenda in het laatste; vandaag staat in het deel met zijn week. Een deel zonder eigen stuk noemt zijn dagen.
  'dagboek.maand': {
    stukken: [
      { bij: '.maand__kalkaart .mk > .mk__kop', titel: 'De kalender', tekst: 'Bovenaan staan de dagen van de week.' },
      { bij: '.maand__kalkaart .mk__dag.is-vandaag', titel: 'Vandaag', tekst: 'Vandaag is het {kleur.vandaag:bij} rondje. Tik op een dag om hem te openen.' },
      // de onderste rij van de kalender: daar zie je dat er altijd plaats is voor zes weken
      { bij: '.maand__kalkaart .mk > .mk__week:last-child', titel: 'Altijd even groot', tekst: 'De kalender blijft even groot als je bladert.' },
    ],
    vervolg: {
      naam: '.mk__nr',
      maak: (n) => {
        const d = n.map(Number).filter(Number.isFinite);
        const [a, b] = [Math.min(...d), Math.max(...d)];
        return a === b ? { titel: `Dag ${a}`, tekst: `Hier staat dag ${a} van de maand.` } : { titel: `De dagen ${a} tot ${b}`, tekst: `Hier staan de dagen ${a} tot en met ${b} van de maand.` };
      },
    },
  },
  'vandaag.kalender': {
    stukken: [
      { bij: '.kalkaart > .kaartkop', titel: 'De kalender', tekst: 'Je maand in één blik. Met de pijlen ga je naar een andere maand.' },
      { bij: '.kalkaart .kalender__week:has(.is-vandaag)', titel: 'De dagen', tekst: 'Vandaag is het {kleur.vandaag:bij} rondje. Tik op een dag om hem te openen.' },
      { bij: '.kalkaart .kalkaart__legenda', titel: 'De tekens', tekst: 'Een {kleur.klaar} bolletje betekent dat je die dag al je supplementen nam en een spuitje is een geplande spuit.' },
      { bij: '.kalkaart .kalkaart__onder', alleen: true, titel: 'Naar het Dagboek', tekst: 'Met Naar het Dagboek open je deze maand in je Dagboek.' },
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
      { bij: '.delen__onderdelen > .delen__groeplabel', titel: 'Wat erin komt', tekst: 'Je kiest uit vier onderdelen: eten, drinken, gewicht en notities, elk met hoeveel er in de periode staat.' },
      // de rijen Gewicht en Notities (delen.gewicht)
      { bij: '.delen__vinkjes > .delen__optie:nth-child(3)', titel: 'Gewicht', tekst: 'Gewicht en notities staan uit tot jij ze aanzet.' },
    ],
  },
  'dagboek.supplementen': {
    uitZinnen: true,
    stukken: [
      // de kop met de momenten van de dag
      { bij: '.dag__supplementen > .kaartkop', titel: 'Supplementen', tekst: 'Hier vink je per moment af wat je nam.' },
      // de rij van een geplande spuit (agenda.kop), alleen op een dag met een geplande beurt
      { bij: '.dag__supplementen .dag__spuit', titel: 'Geplande beurt', tekst: 'Is er die dag een spuit gepland, dan staat ze erbij: je kan ze afvinken en op elke dag ook weer terugzetten.' },
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
  stemming: 'vandaag',
  dagboek: 'dagboek',
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
  { id: 'stemming', sleutel: 'h:stemming', begrip: 'stemming' },
  { id: 'dagboek', sleutel: 'h:dagboek', begrip: 'dagboek' },
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
//   breed: het menu staat links (vanaf 960 px, layout.css); smal: de balk onderaan;
//   muis: een muis of touchpad met hover ((hover: hover) and (pointer: fine)); anders aanraking.
// TOESTEL_TEKST geeft per tekst (deel van de teksten + id) de varianten; een variant vervangt titel of tekst. Met een muis wordt "tik" daarna
// "klik" (en aantikken, getikt, tikte), behalve in de teksten over iets op de telefoon zelf (Bloei op het beginscherm) of over het intikken
// van een code (ZONDER_KLIK).
export const TOESTEL_TEKST = {
  'stap.vandaag.menu': {
    smal: { tekst: 'Onderaan kies je een tabblad: Vandaag, Dagboek, Drinken, Supplementen, Gewicht en Algemeen. Bij het tabblad waar je bent, licht het icoon op met een bolletje eronder.' },
    breed: { tekst: 'Links kies je een tabblad: Vandaag, Dagboek, Drinken, Supplementen, Gewicht en Algemeen. Het tabblad waar je bent, staat in een zacht vlak.' },
  },
  // kort: een kortere tekst met dezelfde inhoud, alleen als het blok met de gewone tekst niet naast de kaart past (BESLISSING 591).
  'stap.vandaag.dag': {
    kort: { tekst: 'Vier tegels tonen hoe je dag ervoor staat. Ze zijn om naar te kijken: de cijfers lopen vanzelf mee.' },
  },
  'stap.vandaag.badges': {
    aanraak: { tekst: 'Hier staan je laatste medaille en de medailles die eraan komen. Tik erop om te lezen wat ze betekenen.' },
    muis: { tekst: 'Hier staan je laatste medaille en de medailles die eraan komen. Ga erover met de muis om te lezen wat ze betekenen.' },
  },
  'stap.dagboek.weekschema': {
    aanraak: { tekst: 'Eén rij per dag, met tekens voor eten, drinken, supplementen, stemming, energie en notitie. Je leest het alleen: tik op een teken om te zien wat het betekent.' },
    muis: { tekst: 'Eén rij per dag, met tekens voor eten, drinken, supplementen, stemming, energie en notitie. Je leest het alleen: ga met de muis over een teken om te zien wat het betekent.' },
  },
  // De knoppen bovenaan een scherm onder Algemeen: Delen staat in de kop tot 960 px, daarboven in de zijbalk (componenten.css).
  'stap.kopSub': {
    breed: { tekst: 'Met Algemeen ga je terug naar het tabblad Algemeen. Het vraagteken start de rondleiding van dit scherm en het huisje brengt je naar Vandaag.' },
  },
  // Het weetje op het scherm Uitleg (scherm.js): op een toestel zonder toetsenbord is er geen Escape.
  'uitleg.weetje1': {
    aanraak: { tekst: 'Je slaat een rondleiding over met Overslaan.' },
  },
};
const ZONDER_KLIK = ['stap.beginscherm', 'handeling.beginscherm', 'stap.vergrendeling.code'];
const KLIK = [[/\baantikken\b/g, 'aanklikken'], [/\bAantikken\b/g, 'Aanklikken'], [/\bgetikt\b/g, 'geklikt'], [/\btikte\b/g, 'klikte'], [/\btik\b/g, 'klik'], [/\bTik\b/g, 'Klik']];
const naarKlik = (x) => KLIK.reduce((a, [re, door]) => a.replace(re, door), String(x ?? ''));
function variant(sleutel, { muis = false, breed = false } = {}) {
  const v = TOESTEL_TEKST[sleutel];
  return v ? { ...(breed ? v.breed : v.smal), ...(muis ? v.muis : v.aanraak) } : {};
}
// ---- Tekst bij een leeg profiel (BESLISSING 694) ----
// Dezelfde stap, op hetzelfde onderdeel, maar het scherm toont nog niets van de gebruiker. Staat `als` op het scherm wanneer de stap getoond wordt
// (na de actie van de stap, voor), dan geldt de tekst onder uitleg.<tekst> (en de titel, als die er is). De gewone tekst blijft voor een gevuld profiel.
export const LEEG_TEKST = {
  'stap.supplementen.toevoegen': { als: '.supplementen__leegkaart', tekst: 'leeg.supplementen' },
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
