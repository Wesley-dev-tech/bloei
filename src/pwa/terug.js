// "Terug" bij een open venster (BESLISSING 423, AN-06 en AN-07): de terugknop of -veeg van Android, de terugveeg van Safari en de
// terugknop van een browser sluiten eerst het open venster (blad, bevestiging, supplementkaart, rondleiding) en laten het scherm staan.
//
// Hoe: een venster dat opent, meldt zich aan en krijgt een eigen geschiedenisingang (dezelfde url, een merkteken in history.state).
//   - "Terug" haalt die ingang weg (popstate): het venster sluit, zoals bij Escape. Wil het venster blijven (de supplementkaart vraagt
//     eerst of de wijzigingen bewaard moeten worden), dan komt de ingang terug.
//   - Sluit het venster zelf (kruisje, Escape, Bewaren, de close request van Chrome op Android), dan verdwijnt de ingang weer
//     (history.back, en die popstate wordt herkend en genegeerd).
//   - Chrome vanaf 120 op Android stuurt bij een open modale <dialog> eerst een close request (het event cancel): het venster sluit dan
//     zoals bij Escape en de ingang verdwijnt mee. Dat gedrag blijft dus.
// Waarom niet alleen CloseWatcher: Chrome op desktop kent CloseWatcher, maar zijn terugknop is geen close request; Safari en Firefox
// kennen het niet. De geschiedenisingang werkt overal; CloseWatcher komt er voor de rondleiding bij (zie rondleiding.js).
//
// Een ingang die achterbleef (het venster sloot en er volgde in dezelfde taak een navigatie, zodat history.back te laat zou komen) is een
// "dode stap": dezelfde url, geen venster. Bloei slaat die stap over in dezelfde richting, zodat één keer terug altijd iets doet.

const SLEUTEL = 'bloeiVenster';
let teller = Date.now(); // stijgend, ook over herladen heen: de nummers ordenen de ingangen
const stapel = []; // { id, href, opTerug, slokOp }
let verwachtVan = null; // het nummer van de ingang die we zelf weghalen (history.back na een gewone sluiting)
let vorige = null; // { href, nr } van de huidige ingang, na de laatste stap
let geinstalleerd = false;

export const merkVan = (state) => (state && typeof state === 'object' && typeof state[SLEUTEL] === 'number' ? state[SLEUTEL] : null);
const nu = () => ({ href: location.href, nr: merkVan(history.state) });

function installeer() {
  if (geinstalleerd || typeof window === 'undefined' || typeof history === 'undefined') return;
  geinstalleerd = true;
  vorige = nu();
  window.addEventListener('popstate', opPopstate);
  window.addEventListener('hashchange', () => {
    vorige = nu();
    if (verwachtVan == null) return;
    verwachtVan = null;
    duwUitgesteld();
  });
}

function pushMerk(id) {
  try {
    history.pushState({ [SLEUTEL]: id }, '', location.href);
    vorige = nu();
  } catch {
    /* geen geschiedenis: dan sluit terug het venster niet, de rest werkt gewoon */
  }
}

function opPopstate() {
  const was = vorige;
  const hier = nu();
  vorige = hier;
  // Onze eigen history.back na een gewone sluiting.
  if (verwachtVan != null && was?.nr === verwachtVan) {
    verwachtVan = null;
    ruimOp();
    if (verwachtVan == null) duwUitgesteld();
    return;
  }
  // Zit de slot erover, dan blijft alles staan (het slot gaat voor; de vensters komen na het openen terug).
  const slot = document.getElementById('slot');
  if (slot && slot.hidden === false) {
    for (const v of stapel) if (hier.nr == null || v.id > hier.nr) pushMerk(v.id);
    return;
  }
  // Vensters waarvan de ingang weg is (terug): van boven naar onder sluiten, tot er één wil blijven.
  const weg = stapel.filter((v) => hier.nr == null || v.id > hier.nr).reverse();
  if (weg.length) {
    for (const v of weg) {
      // Eerst van de stapel: een los() tijdens het sluiten weet dan dat de ingang al weg is.
      verwijder(v.id);
      let gesloten = true;
      try {
        gesloten = v.opTerug() !== false;
      } catch (fout) {
        console.error(fout);
      }
      if (!gesloten) {
        stapel.push(v);
        stapel.sort((a, b) => a.id - b.id);
        break;
      }
    }
    // Een venster dat bleef: zijn ingang terug (en die van wat erboven nog openstaat).
    for (const v of stapel) if (hier.nr == null || v.id > hier.nr) pushMerk(v.id);
    return;
  }
  // Een dode stap: dezelfde url, alleen een achtergebleven merkteken verschilt, en er staat geen venster open dat erbij hoort.
  if (was && was.href === hier.href && was.nr !== hier.nr && (was.nr != null || hier.nr != null)) {
    const richting = was.nr != null && hier.nr != null ? Math.sign(hier.nr - was.nr) : hier.nr != null ? 1 : -1;
    try {
      history.go(richting);
    } catch {
      /* niets aan te doen */
    }
  }
}

function verwijder(id) {
  const i = stapel.findIndex((v) => v.id === id);
  if (i >= 0) stapel.splice(i, 1);
}

// Na een gewone sluiting: staat de geschiedenis nog op de ingang van een gesloten venster (en op dezelfde url), haal ze dan weg.
const teSluiten = new Map(); // id → href
function ruimOp() {
  if (verwachtVan != null) return;
  const nr = merkVan(history.state);
  if (nr == null || !teSluiten.has(nr)) return;
  const href = teSluiten.get(nr);
  teSluiten.delete(nr);
  if (location.href !== href || stapel.some((v) => v.id === nr)) return;
  verwachtVan = nr;
  try {
    history.back();
  } catch {
    verwachtVan = null;
    return;
  }
  // Komt de popstate van die stap niet (een browser die ze inslikt), dan niet blijven wachten.
  clearTimeout(vangnet);
  vangnet = setTimeout(() => {
    if (verwachtVan !== nr) return;
    verwachtVan = null;
    duwUitgesteld();
  }, 1000);
}

// Een venster dat opent terwijl onze eigen history.back nog onderweg is: zijn ingang komt pas daarna, anders zou die stap terug de
// nieuwe ingang weghalen (en het nieuwe venster sluiten) in plaats van de oude.
let uitgesteld = [];
let vangnet = null;
function duwUitgesteld() {
  const lijst = uitgesteld;
  uitgesteld = [];
  for (const id of lijst) if (stapel.some((v) => v.id === id)) pushMerk(id);
}

// bewaakTerug({ opTerug, slokOp }): een venster opent. opTerug() sluit het (geeft false als het blijft staan, bv. met een vraag).
// slokOp: zolang dit venster openstaat, krijgen vensters die het zelf opent geen eigen ingang (de rondleiding opent een blad in kijkstand:
// terug sluit dan de rondleiding, die ruimt haar blad zelf op). Geeft { los() }: roep los() aan bij elke gewone sluiting.
export function bewaakTerug({ opTerug, slokOp = false } = {}) {
  installeer();
  if (!geinstalleerd || stapel.some((v) => v.slokOp)) return { los() {} };
  const id = ++teller;
  const v = { id, href: location.href, opTerug: typeof opTerug === 'function' ? opTerug : () => true, slokOp };
  stapel.push(v);
  if (verwachtVan != null) uitgesteld.push(id);
  else pushMerk(id);
  let los = false;
  return {
    los() {
      if (los) return;
      los = true;
      const nogOpen = stapel.some((x) => x.id === id);
      verwijder(id);
      if (!nogOpen) return; // al gesloten via terug: de ingang is er al niet meer
      teSluiten.set(id, v.href);
      // Pas na de huidige taak: volgt er meteen een navigatie (een knop in het blad die naar een ander scherm gaat), dan blijft die staan.
      queueMicrotask(ruimOp);
    },
  };
}

// Voor de tests.
export const _intern = { stapel, reset() { stapel.length = 0; teSluiten.clear(); verwachtVan = null; vorige = typeof location !== 'undefined' && typeof history !== 'undefined' ? nu() : null; } };
