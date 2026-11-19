// Een bezoek aan de demo (BESLISSING 674). Alleen in de demo geladen (dynamische import in main.js, via start.js).
// Een bezoeker mag alles uitproberen, maar het blijft niet staan: bij elk nieuw bezoek staan het profiel van Sofie en haar voorbeeldgegevens er weer.
//
// Een nieuw bezoek: de demo opent in een tabblad of venster dat in dit bezoek nog niets van de demo toonde (geen kenmerk in sessionStorage), of het
// kenmerk is van een vroegere dag. Staat er dan al een ander tabblad van de demo open, dan telt de dag waarop de gegevens gevuld zijn ('demo.vulling'):
// is dat vandaag, dan sluit dit tabblad aan bij dat bezoek; is het een vroegere dag, dan begint er toch een nieuw bezoek (BESLISSING 674, bevinding L4).
//  - Herladen in hetzelfde tabblad houdt de wijzigingen (sessionStorage blijft); een nieuw tabblad, een nieuw venster of de browser opnieuw openen
//    zet alles terug. Een geinstalleerde demo (PWA) krijgt bij elke start een nieuw venster en begint dus opnieuw.
//  - Een bezoek eindigt hoe dan ook bij de dagwissel, ook als er andere tabbladen open staan (zo houdt niemand zijn eigen gegevens door een tabblad
//    dagenlang open te laten). Tijdens het gebruik meldt de wachter van de app de nieuwe dag ('dag:gewijzigd': bij terugkeer in beeld of na middernacht,
//    en pas als er geen venster of tekstveld meer open is en wat wacht bewaard is). Dan begint er een nieuw bezoek: Sofie en haar gegevens staan er weer.
//    Zijn de gegevens van dit tabblad niet gewijzigd, dan deed de app dat al stil (R5-09, vulDemoAlsLeeg); dit tabblad sluit dan aan.
//  - De andere open tabbladen krijgen een bericht (BroadcastChannel) en herladen zacht: pas als er geen venster of tekstveld meer open is. Ze houden
//    daarbij hun kenmerk van de nieuwe dag, zodat ze zich niet nog eens leegmaken.
//  - Twee tabbladen tegelijk: staat er al een tabblad van de demo open, dan sluit een nieuw tabblad aan bij dat bezoek en wist het niets. Elk tabblad
//    houdt daarvoor zolang het open is een gedeeld slot (Web Locks API) vast; de keuze zelf gebeurt onder een exclusief slot, zodat twee tabbladen die
//    tegelijk openen, of tegelijk de dagwissel zien, niet allebei wissen en vullen.
// De uitlegstand (welke rondleidingen al gezien zijn) blijft over bezoeken heen staan: dat zijn geen gegevens van Sofie, en zo krijgt een terugkerende
// bezoeker niet elke keer dezelfde rondleiding. "Opnieuw beginnen" in de balk wist ze wel, zoals voorheen.
import { begin, vulDemoAlsLeeg } from './voorbeelddata.js';
import { OPSLAG_VOORVOEGSEL } from '../kern/demo.js';
import { OPSLAGSLEUTEL as UITLEG_SLEUTEL } from '../uitleg/rondleiding.js';
import { pasThemaToe } from '../thema/thema.js';
import { vandaag as vandaagSleutel } from '../kern/datum.js';
import { db } from '../data/db.js';
import { luister } from '../kern/bus.js';
import { venster, tekstveldActief } from '../kern/invoer.js';

// In sessionStorage: de dag waarop dit tabblad zijn bezoek begon ('bloei-demo-bezoek').
export const BEZOEK_SLEUTEL = OPSLAG_VOORVOEGSEL + 'bezoek';
// De namen van de sloten (Web Locks): 'open' houdt elk tabblad gedeeld vast, 'start' is exclusief tijdens de keuze.
export const SLOT_OPEN = OPSLAG_VOORVOEGSEL + 'open';
export const SLOT_START = OPSLAG_VOORVOEGSEL + 'start';
// Het kanaal waarop een tabblad de andere meldt dat er een nieuw bezoek begon (dezelfde naam voor alle tabbladen van de demo).
export const KANAAL_BEZOEK = OPSLAG_VOORVOEGSEL + 'bezoek-kanaal';
// De instelling waarin voorbeelddata.js bewaart op welke dag de demo gevuld is (een test houdt deze naam gelijk aan die van voorbeelddata.js).
const SLEUTEL_VULLING = 'demo.vulling';

function sessie() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// Kiest bij de start: een nieuw bezoek (alles terug naar Sofie) of verder in het bezoek van dit tabblad of van een ander open tabblad.
// Geeft terug of het een nieuw bezoek is. Alles is in te vullen voor de tests.
export async function startBezoek({ nu = new Date(), opslag = sessie(), sloten = globalThis.navigator?.locks ?? null, herstelThema = pasThemaToe, bewaak = true } = {}) {
  const dag = vandaagSleutel(nu);
  let kenmerk = null;
  try {
    kenmerk = opslag?.getItem(BEZOEK_SLEUTEL) ?? null;
  } catch {
    /* geen sessionStorage: dan is elke start een nieuw bezoek */
  }

  const kies = async (anderOpen) => {
    // Een ander open tabblad telt alleen als zijn bezoek van vandaag is: staan de gegevens nog op een vroegere dag, dan eindigt dat bezoek nu.
    const nieuw = kenmerk !== dag && (!anderOpen || (await vullingDag()) !== dag);
    if (nieuw) {
      await begin(nu, { behoud: [UITLEG_SLEUTEL] });
      // Het thema van het vorige bezoek stond al op de pagina (main.js past het toe vóór de database open is): nu dat van Sofie.
      await herstelThema();
    } else {
      await vulDemoAlsLeeg(nu);
    }
    try {
      opslag?.setItem(BEZOEK_SLEUTEL, dag);
    } catch {
      /* zie boven */
    }
    return nieuw;
  };

  const klaar = (nieuw) => {
    if (bewaak) bewaakBezoekdag({ opslag, sloten, herstelThema, dag });
    return nieuw;
  };

  // Zonder Web Locks (heel oude browsers) is er geen zicht op andere tabbladen: dan telt alleen het kenmerk van dit tabblad.
  if (typeof sloten?.request !== 'function' || typeof sloten?.query !== 'function') return klaar(await kies(false));

  return sloten.request(SLOT_START, async () => {
    const { held = [] } = await sloten.query();
    const nieuw = await kies(held.some((slot) => slot.name === SLOT_OPEN));
    // Dit tabblad telt vanaf nu als open, tot het sluit (de browser geeft het slot dan vanzelf vrij). Pas verder als het slot er is,
    // zodat een tabblad dat net na dit tabblad opent het zeker ziet.
    await new Promise((klaar) => {
      sloten.request(SLOT_OPEN, { mode: 'shared' }, () => {
        klaar();
        return new Promise(() => {});
      });
    });
    return klaar(nieuw);
  });
}

// De dag waarop de demogegevens gevuld zijn (voorbeelddata.js zet ze bij elke vulling), of null.
async function vullingDag() {
  try {
    return (await db.instellingen.get(SLEUTEL_VULLING))?.waarde?.datum ?? null;
  } catch {
    return null;
  }
}

// Laat het bezoek van dit tabblad bij de dagwissel eindigen (zie de kop). Alles is in te vullen voor de tests. Geeft een stopfunctie terug
// (startBezoek roept dit maar een keer per pagina aan). nuFn geeft de klok, luisterDag meldt de dagwissel van de app, maakKanaal geeft een BroadcastChannel (of null),
// magHerladen zegt of er geen venster of tekstveld meer open is, wachtOpApp is de pauze waarin de app haar eigen stille vulling kan afronden.
export function bewaakBezoekdag({
  dag = vandaagSleutel(),
  opslag = sessie(),
  sloten = globalThis.navigator?.locks ?? null,
  herstelThema = pasThemaToe,
  nuFn = () => new Date(),
  luisterDag = (fn) => luister('dag:gewijzigd', fn),
  maakKanaal = () => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(KANAAL_BEZOEK) : null),
  magHerladen = () => !venster() && !tekstveldActief(document.getElementById('app')),
  herlaad = () => globalThis.location.reload(),
  wachtOpApp = 300,
} = {}) {
  let mijnDag = dag;
  let gestopt = false;
  let lopend = Promise.resolve();
  let herlaadTimer = null;
  const zetDag = (nieuweDag) => {
    mijnDag = nieuweDag;
    try {
      opslag?.setItem(BEZOEK_SLEUTEL, nieuweDag);
    } catch {
      /* geen sessionStorage: het kenmerk in het geheugen volstaat zolang het tabblad open blijft */
    }
  };

  let kanaal = null;
  try {
    kanaal = maakKanaal();
  } catch {
    /* geen kanaal: de andere tabbladen zien de nieuwe gegevens via 'elders:gewijzigd' en sluiten aan bij hun eigen dagwissel */
  }

  // Een ander tabblad begon een nieuw bezoek: dit tabblad herlaadt zacht, pas als er niets open staat. Een tweede melding wacht niet extra.
  const herlaadZacht = (doelDag) => {
    if (herlaadTimer !== null) return;
    const probeer = () => {
      herlaadTimer = null;
      if (gestopt || mijnDag === doelDag) return; // intussen is dit tabblad zelf bijgewerkt
      if (!magHerladen()) {
        herlaadTimer = setTimeout(probeer, 1000);
        return;
      }
      zetDag(doelDag); // na het herladen sluit het aan bij dat bezoek, ook als het andere tabblad intussen sluit
      herlaad();
    };
    probeer();
  };
  if (kanaal) {
    kanaal.onmessage = (e) => {
      const doel = e.data?.dag;
      if (typeof doel === 'string' && doel > mijnDag) herlaadZacht(doel);
    };
  }

  const naDagwissel = async () => {
    if (gestopt || vandaagSleutel(nuFn()) === mijnDag) return;
    // De app vult stil opnieuw als niets gewijzigd is (R5-09): even wachten, dan ziet het slot of dat al gebeurd is.
    if (wachtOpApp > 0) await new Promise((klaar) => setTimeout(klaar, wachtOpApp));
    const werk = async () => {
      const nu = nuFn();
      const dagNu = vandaagSleutel(nu);
      if (gestopt || dagNu === mijnDag) return;
      if ((await vullingDag()) === dagNu) {
        await herstelThema(); // een ander tabblad (of de app zelf) begon de nieuwe dag al: aansluiten
      } else {
        await begin(nu, { behoud: [UITLEG_SLEUTEL] });
        await herstelThema();
        try {
          kanaal?.postMessage({ dag: dagNu });
        } catch {
          /* zie boven */
        }
      }
      zetDag(dagNu);
    };
    if (typeof sloten?.request === 'function') await sloten.request(SLOT_START, werk);
    else await werk();
  };
  const stopLuisteren = luisterDag(() => {
    lopend = lopend.then(naDagwissel).catch((fout) => console.error('Bezoek bij de dagwissel', fout));
    return lopend; // de bus negeert dit; een test wacht erop
  });

  return () => {
    gestopt = true;
    stopLuisteren();
    clearTimeout(herlaadTimer);
    kanaal?.close?.();
  };
}
