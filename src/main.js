// Opstartvolgorde van de app (PLAN.md §6.5): thema → db → slot → app → service worker.

// Bootstrap: alleen reboot, raster en utilities. Geen componenten, geen Bootstrap-JS.
import 'bootstrap/dist/css/bootstrap-reboot.min.css';
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';

// De huisstijl: bloei-huisstijl/tokens.css is de enige bron van kleuren, lettertypes en maten
// (de lettertypes staan lokaal in fonts/). Daarna afgeleide maten en onze eigen opmaak.
import '../bloei-huisstijl/tokens.css';
import './stijl/streepje.css'; // het korte streepje recht in het sierlettertype (BESLISSING 460): vlak na tokens.css, want gelijke familie, het latere wint
import './stijl/afgeleid.css';
import './stijl/basis.css';
import './stijl/componenten.css';
import './stijl/herstel.css'; // teruggehaalde regels (BESLISSING 267), vóór schermen.css zodat de huidige regels winnen
import './stijl/schermen.css';
// Eén stijlbestand per scherm (BESLISSING 267): elke bouwer schrijft alleen in het bestand van zijn scherm.
import './stijl/scherm-vandaag.css';
import './stijl/scherm-dagboek.css';
import './stijl/scherm-dagboek-dag.css';
import './stijl/scherm-dagboek-maand.css';
import './stijl/scherm-drinken.css';
import './stijl/scherm-supplementen.css';
import './stijl/scherm-gewicht.css';
import './stijl/scherm-algemeen.css';
import './stijl/kaartkop-lijn.css'; // één lijn onder elke kaartkop in de hele app (BESLISSING 273)
import './stijl/layout.css';
import './stijl/slot.css';
import './stijl/uitleg.css';
import './stijl/tabkleur.css'; // elk tabblad in zijn eigen kleurfamilie (BESLISSINGEN 357 - 359); als laatste, zodat het de familietokens per scherm herbenoemt
import './stijl/telefoon.css'; // onder 720 px: "Goed om te weten" onderaan en gelijke ruimte (BESLISSING 363); na tabkleur.css, de laatste

// Dezelfde voorwaarde als DEMO in kern/demo.js, maar hier rechtstreeks: de bundelaar vervangt ze dan bij het bouwen door een letterlijke
// waarde en laat de demo-bestanden bij de echte versie weg. Met de optionele keten van DEMO gebeurt dat niet.
const IS_DEMO = import.meta.env.VITE_DEMO === 'true';
import { openDb } from './data/db.js';
import { startBadges } from './data/badges.js';
import { migreerKan } from './data/instellingen.js';
import { herstelVangnet } from './data/vangnet.js';
import { startKanaal } from './data/kanaal.js';
import { pasThemaToe } from './thema/thema.js';
import { startSlot } from './vergrendeling/slot.js';
import { startApp } from './app.js';
import { startVieringen } from './ui/vieringen.js';
import { registreerSw } from './pwa/registratie.js';
import { activeerWachtendeBijStart } from './pwa/opstart.js';
import { vraagBlijvendeOpslagStil } from './pwa/opslag.js';
import { startMeldingen } from './meldingen/push.js';
import { installeerVrijstellingen } from './vergrendeling/vrijstelling.js';
import { volgBediening } from './kern/bediening.js';

async function start() {
  // BESLISSING 405: wacht er een nieuwe versie, dan neemt die nu over en herlaadt de pagina één keer, vóór er iets getekend wordt.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    let opslag = null;
    try {
      opslag = window.sessionStorage;
    } catch {
      /* geen sessionStorage: dan nooit automatisch herladen */
    }
    const herlaadt = await activeerWachtendeBijStart({ sw: navigator.serviceWorker, opslag, herlaad: () => window.location.reload() });
    if (herlaadt) return;
  }
  volgBediening(); // data-bediening op html (aanraak, muis, toetsen): basis.css verbergt de ring bij aanraking, vóór het slot
  installeerVrijstellingen();
  await pasThemaToe();
  await openDb();
  vraagBlijvendeOpslagStil(); // AN-01/440: overal behalve Firefox, niet blokkerend, zonder venster (src/pwa/opslag.js)
  // demo: een nieuw bezoek zet Sofie en haar voorbeeldgegevens terug (BESLISSING 674, demo/bezoek.js), vóór de badges starten (die worden dan stil toegekend)
  if (IS_DEMO) await (await import('./demo/start.js')).startBezoek();
  await migreerKan(); // BESLISSING 270: water is een kan van 800 ml; een oude standaard van 250 gaat één keer mee
  await herstelVangnet(); // R5-03: tekst die vlak voor herladen of afsluiten getypt was, en wist het vangnet meteen
  startKanaal(); // R5-01: wat een ander tabblad bewaart, verschijnt ook hier
  await startSlot();
  startApp(document.getElementById('app'));
  if (IS_DEMO) (await import('./demo/start.js')).toonBalk(); // demo: de balk met "Opnieuw beginnen"
  // R5-09: blijft de demo over middernacht open, dan begint bij de dagwissel een nieuw bezoek met de voorbeeldgegevens van de nieuwe dag;
  // dat doet demo/bezoek.js (bewaakBezoekdag, onder het slot van de tabbladen), main.js luistert daar niet meer apart naar.
  startBadges();
  startVieringen();
  registreerSw();
  startMeldingen(); // doet niets zolang er geen push-dienst is ingesteld (BESLISSING 38)
}

start();
