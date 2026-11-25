// Het icoon van elke medaille. Elke medaille heeft haar eigen icoon: geen twee medailles delen er een, zodat je ze ook behaald (alle in
// dezelfde kleur) uit elkaar houdt. En elk icoon toont waar de medaille voor staat: een glas of een fles bij drinken, bestek of een kom bij
// eten, een pil of een vinkje bij supplementen, een gezichtje bij stemming, een boek of een kalender bij dagen bijhouden, een weg die je
// aflegt bij dagen op rij. Per medaille: [soort, icoon]. De soort bepaalt de kleur van een medaille die nog niet behaald is
// (ui/medaille.js); het icoon is de naam van een bestand in src/iconen/solid (Font Awesome Free). Zuivere gegevens, zonder imports, zodat de
// test (tests/logica/badgeiconen.test.js) ze kan nalezen.
export const BADGE_ICOON = {
  // bijhouden
  'eerste-bladzijde': ['reeks', 'book-open'],
  'week-vol': ['reeks', 'calendar-week'],
  'maand-vol': ['reeks', 'calendar-days'],
  honderd: ['reeks', 'certificate'],
  // drinken
  'eerste-kan': ['drinken', 'glass-water'],
  'tien-kannen': ['drinken', 'mug-hot'],
  // stemming
  kanttekening: ['notities', 'pen'],
  gemoed: ['stemming', 'face-smile'],
  // bijhouden
  'twee-weken': ['reeks', 'person-running'],
  // supplementen
  'eerste-potje': ['supplementen', 'capsules'],
  trouw: ['supplementen', 'tablets'],
  // bijhouden
  'drie-op-rij': ['reeks', 'seedling'],
  'week-op-rij': ['reeks', 'person-walking'],
  'maand-op-rij': ['reeks', 'person-hiking'],
  'vijftig-dagen': ['reeks', 'book'],
  'jaar-bloei': ['reeks', 'spa'],
  'weer-thuis': ['reeks', 'house'],
  // eten
  'eerste-maaltijd': ['eten', 'utensils'],
  'vijftig-maaltijden': ['eten', 'bowl-rice'],
  'eerste-favoriet': ['eten', 'heart'],
  // drinken
  'week-water': ['drinken', 'bottle-water'],
  'dertig-dagdoelen': ['drinken', 'mug-saucer'],
  // supplementen
  'alles-afgevinkt': ['supplementen', 'clipboard-check'],
  'week-trouw': ['supplementen', 'pills'],
  'dertig-vol': ['supplementen', 'prescription-bottle'],
  // stemming
  'dertig-stemmingen': ['stemming', 'face-smile-beam'],
  'zeven-energie': ['stemming', 'leaf'],
  'twintig-notities': ['notities', 'note-sticky'],
  // gewicht
  'eerste-weging': ['gewicht', 'weight-scale'],
  'vier-wegingen': ['gewicht', 'weight-hanging'],
  // dag
  'dag-rond': ['dag', 'bullseye'],
  'zeven-dagen-rond': ['dag', 'circle-check'],
  // delen
  'eerste-verslag': ['delen', 'arrow-up-from-bracket'],
  // bijhouden
  tweehonderd: ['reeks', 'book-bookmark'],
  vijfhonderd: ['reeks', 'ranking-star'],
  'twee-maanden-op-rij': ['reeks', 'mountain-sun'],
  'honderd-op-rij': ['reeks', 'rocket'],
  'volle-week': ['reeks', 'calendar-check'],
  'volle-maand': ['reeks', 'calendar'],
  'altijd-welkom': ['reeks', 'door-open'],
  'vijf-op-rij': ['reeks', 'shoe-prints'],
  'tien-op-rij': ['reeks', 'stairs'],
  'drie-weken-op-rij': ['reeks', 'fire'],
  'vijftig-op-rij': ['reeks', 'mountain'],
  'jaar-op-rij': ['reeks', 'infinity'],
  'duizend-dagen': ['reeks', 'gem'],
  'vier-volle-weken': ['reeks', 'calendar-plus'],
  // eten
  'honderd-maaltijden': ['eten', 'plate-wheat'],
  'vijfhonderd-maaltijden': ['eten', 'kitchen-set'],
  'vijf-favorieten': ['eten', 'hand-holding-heart'],
  'drie-op-een-dag': ['eten', 'bread-slice'],
  'tien-gevoel': ['eten', 'face-grin-tongue'],
  'tien-maaltijden': ['eten', 'bowl-food'],
  'tien-favorieten': ['eten', 'heart-circle-plus'],
  'zeven-drie-maaltijden': ['eten', 'apple-whole'],
  // drinken
  'vijftig-dagdoelen': ['drinken', 'hand-holding-droplet'],
  'honderd-dagdoelen': ['drinken', 'faucet-drip'],
  'twee-weken-water': ['drinken', 'bottle-droplet'],
  'maand-water': ['drinken', 'water'],
  'eerste-slok': ['drinken', 'droplet'],
  'drie-dagen-water': ['drinken', 'glass-water-droplet'],
  'honderd-liter': ['drinken', 'bucket'],
  'drie-soorten': ['drinken', 'lemon'],
  // supplementen
  'vijftig-vol': ['supplementen', 'prescription-bottle-medical'],
  'honderd-vol': ['supplementen', 'hand-holding-medical'],
  'op-ritme': ['supplementen', 'syringe'],
  'tien-ritme': ['supplementen', 'vial'],
  'eigen-lijst': ['supplementen', 'clipboard-list'],
  'honderd-vinkjes': ['supplementen', 'check-double'],
  'zeven-op-rij-afgevinkt': ['supplementen', 'list-check'],
  // stemming
  'vijftig-notities': ['notities', 'pen-to-square'],
  'honderd-stemmingen': ['stemming', 'face-grin-stars'],
  'dertig-energie': ['stemming', 'bolt'],
  'week-gezichtjes': ['stemming', 'face-grin-wide'],
  'honderd-notities': ['notities', 'feather-pointed'],
  'maand-gezichtjes': ['stemming', 'face-grin-hearts'],
  'gezichtje-en-blaadje': ['stemming', 'heart-pulse'],
  // gewicht
  'twaalf-wegingen': ['gewicht', 'scale-balanced'],
  'halfjaar-wegen': ['gewicht', 'ruler'],
  'jaar-wegen': ['gewicht', 'gauge'],
  'vier-weken-wegen': ['gewicht', 'calendar-day'],
  // dag
  'drie-rond-op-rij': ['dag', 'cloud-sun'],
  'week-rond': ['dag', 'rainbow'],
  'dertig-rond': ['dag', 'square-check'],
  'twee-weken-rond': ['dag', 'star'],
  'vijftig-rond': ['dag', 'hands-clapping'],
  'volledige-dag': ['dag', 'sun'],
  // delen
  'vijf-verslagen': ['delen', 'file-lines'],
  'tien-verslagen': ['delen', 'paper-plane'],
  // kennen
  'eerste-rondleiding': ['reeks', 'circle-question'],
  'eigen-kleur': ['reeks', 'palette'],
  'seintje-aan': ['reeks', 'bell'],
  'achter-slot': ['reeks', 'lock'],
  'op-beginscherm': ['reeks', 'mobile-screen-button'],
  'eigen-profiel': ['reeks', 'user'],
  'vijf-rondleidingen': ['reeks', 'graduation-cap'],
  // verzameling
  'tien-medailles': ['reeks', 'medal'],
  'vijfentwintig-medailles': ['reeks', 'award'],
  'vijftig-medailles': ['reeks', 'trophy'],
  'verzameling-compleet': ['ultiem', 'crown'], // de ultieme medaille: behaald is ze van goud (schermen.css, .medaille--ultiem)
  // verjaardag
  geboortedatum: ['reeks', 'gift'],
  jarig: ['reeks', 'cake-candles'],
  'jarig-genoteerd': ['reeks', 'champagne-glasses'],
  // feestdagen: het teken van de dag zelf
  'feest-nieuwjaar': ['reeks', 'burst'],
  'feest-valentijn': ['reeks', 'face-kiss-wink-heart'],
  'feest-pasen': ['reeks', 'egg'],
  'feest-paasmaandag': ['reeks', 'carrot'],
  'feest-arbeid': ['reeks', 'briefcase'],
  'feest-hemelvaart': ['reeks', 'cloud'],
  'feest-pinksteren': ['reeks', 'dove'],
  'feest-pinkstermaandag': ['reeks', 'wind'],
  'feest-nationaal': ['reeks', 'flag'],
  'feest-olv': ['reeks', 'church'],
  'feest-halloween': ['reeks', 'ghost'],
  'feest-allerheiligen': ['reeks', 'cross'],
  'feest-wapenstilstand': ['reeks', 'peace'],
  'feest-sinterklaas': ['reeks', 'horse'],
  'feest-kerstavond': ['reeks', 'holly-berry'],
  'feest-kerst': ['reeks', 'tree'],
  'feest-tweede-kerstdag': ['reeks', 'snowman'],
  'feest-oudjaar': ['reeks', 'hourglass-half'],
};
