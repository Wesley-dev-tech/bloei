// Registreert de service worker en meldt een nieuwe versie (PLAN.md §6.5).
import { strook } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { swScriptUrl } from '../kern/trusted-types.js';

// BESLISSING 704: de melding van een nieuwe versie blijft staan tot de gebruiker op Updaten tikt. Ze gaat niet vanzelf weg, ze
// verdwijnt niet achter een volgende melding, en er is geen manier om ze weg te klikken: de update is het enige wat haar sluit.
function meldNieuweVersie(wachtend) {
  strook(t('algemeen.nieuweVersie'), {
    duur: 0,
    vast: true,
    actie: {
      label: t('algemeen.updaten'),
      opKlik: () => wachtend.postMessage('nu-wisselen'),
    },
  });
}

// R6-11: de browser kijkt alleen bij een navigatie of er een nieuwe sw.js is. Een geïnstalleerde iPhone-app die dagen in het geheugen
// blijft, zou een nieuwe versie dan pas bij een koude start merken. Daarom: bij terugkeer naar de app (zichtbaar) hoogstens één keer
// per uur registratie.update(). Dat installeert een nieuwe versie alleen; ze wacht dan en de melding "Updaten" verschijnt
// (updatefound hieronder). Overnemen gebeurt nooit midden in het gebruik: pas na een tik op Herladen of bij de volgende start (opstart.js).
export const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
export function updateBijTerugkeer(registratie, { doc = document, nu = () => Date.now(), interval = UPDATE_INTERVAL_MS } = {}) {
  let laatste = nu();
  const bijZichtbaar = () => {
    if (doc.visibilityState !== 'visible' || nu() - laatste < interval) return;
    laatste = nu();
    registratie.update().catch(() => {}); // offline of de server antwoordt niet: gewoon later opnieuw
  };
  doc.addEventListener('visibilitychange', bijZichtbaar);
  return bijZichtbaar;
}

export async function registreerSw() {
  // In dev draait er geen service worker: zo blijft de dev-server altijd vers.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  try {
    const hadAlEenWorker = Boolean(navigator.serviceWorker.controller);
    // Het adres als TrustedScriptURL via de policy 'bloei-sw' (BESLISSING 430); zonder Trusted Types gewoon './sw.js'.
    const registratie = await navigator.serviceWorker.register(swScriptUrl(), { scope: './' });

    // Herlaad één keer zodra een nieuwe versie het overneemt (niet bij de allereerste installatie).
    let herladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadAlEenWorker || herladen) return;
      herladen = true;
      window.location.reload();
    });

    if (registratie.waiting && hadAlEenWorker) meldNieuweVersie(registratie.waiting);
    updateBijTerugkeer(registratie);

    registratie.addEventListener('updatefound', () => {
      const nieuw = registratie.installing;
      if (!nieuw) return;
      nieuw.addEventListener('statechange', () => {
        if (nieuw.state === 'installed' && navigator.serviceWorker.controller) meldNieuweVersie(nieuw);
      });
    });
  } catch (fout) {
    console.warn('Service worker niet geregistreerd:', fout);
  }
}
