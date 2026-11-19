// Een nieuwe versie wordt actief bij de volgende start van de app (BESLISSING 405).
// Staat er bij het opstarten al een wachtende service worker klaar, dan vraagt de pagina die over te nemen en herlaadt ze één keer,
// vóór de app iets tekent (main.js roept dit als eerste aan: nog geen slot, geen gegevens, geen invoer, dus nooit midden in het gebruik).
// Valkuilen:
// - herlaadlus: een vlag in sessionStorage. Staat ze er al en wacht er nog altijd een worker, dan probeert Bloei het niet opnieuw en
//   start de app gewoon (de melding "Updaten" van registratie.js verschijnt dan zoals altijd). Zonder wachtende worker gaat de vlag weg.
// - meerdere vensters: de wachtende worker antwoordt zelf (sw.js) of hij wisselt. Is er nog een ander venster van Bloei open, dan
//   zegt hij nee: dat venster mag niet midden in het gebruik herladen; hier start de app dan gewoon en blijft de melding.
// - offline of geen service worker: geen wachtende worker, dus niets te doen en geen wachttijd.
// - de demo: dezelfde stroom; de caches en de vlag zijn van haar eigen adres.
export const VLAG = 'bloei-sw-opstartwissel';
export const OPSTART_BERICHT = 'opstart-wisselen';

// De beslissing zelf, zonder browser: 'activeer' of 'niets'.
export function beslisOpstart({ heeftController, wachtend, vlag }) {
  if (!heeftController || !wachtend) return 'niets';
  return vlag ? 'niets' : 'activeer';
}

const wacht = (ms) => new Promise((klaar) => setTimeout(() => klaar(null), ms));

// Vraagt de wachtende worker of hij overneemt; antwoordt hij niet op tijd (een oudere worker kent het bericht niet), dan is het nee.
function vraagWissel(wachtend, ms) {
  return Promise.race([
    new Promise((klaar) => {
      const kanaal = new MessageChannel();
      kanaal.port1.onmessage = (e) => klaar(Boolean(e.data?.wisselt));
      wachtend.postMessage({ type: OPSTART_BERICHT }, [kanaal.port2]);
    }),
    wacht(ms).then(() => false),
  ]);
}

// Geeft true als de pagina herlaadt (de opstart moet dan stoppen), anders false.
// sw: navigator.serviceWorker; opslag: sessionStorage; herlaad: () => location.reload(). Allemaal in te vullen voor de tests.
export async function activeerWachtendeBijStart({ sw, opslag, herlaad, antwoordMs = 1500, overnameMs = 3000 } = {}) {
  try {
    if (!sw?.controller) return false;
    const registratie = await sw.getRegistration();
    const wachtend = registratie?.waiting ?? null;
    let vlag = null;
    try {
      vlag = opslag?.getItem(VLAG) ?? null;
    } catch {
      vlag = 'onbekend'; // geen sessionStorage: dan nooit automatisch herladen (een lus is niet uit te sluiten)
    }
    if (!wachtend) {
      try {
        opslag?.removeItem(VLAG);
      } catch {
        /* niets */
      }
      return false;
    }
    if (!opslag || beslisOpstart({ heeftController: true, wachtend, vlag }) !== 'activeer') return false;
    opslag.setItem(VLAG, String(Date.now()));
    const overgenomen = new Promise((klaar) => sw.addEventListener('controllerchange', () => klaar(true), { once: true }));
    if (!(await vraagWissel(wachtend, antwoordMs))) return false;
    // De worker neemt over (skipWaiting, clients.claim): wacht op de wissel, maar nooit eindeloos. Ook na de wachttijd herlaadt de
    // pagina: de app heeft nog niets getoond, en de vlag voorkomt een tweede poging.
    await Promise.race([overgenomen, wacht(overnameMs)]);
    herlaad();
    return true;
  } catch {
    return false;
  }
}
