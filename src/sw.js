// Service worker van Bloei (PLAN.md §6.5).
// Offline cache, wisselen naar een nieuwe versie (bericht 'nu-wisselen') en de push-meldingen (push en notificationclick).

import { kiesMeldingen, algemeneMelding } from './meldingen/tekst.js';
import { leesMeldingInvoer, bewaarAfgehandeld } from './meldingen/stand.js';
import { opneApp } from './meldingen/klik.js';
import { CACHE_VOORVOEGSEL } from './kern/demo.js';
import { OPSTART_BERICHT } from './pwa/opstart.js';
import { isEigenOudeCache } from './pwa/caches.js';

// vite-plugin-pwa vult hier bij het bouwen de lijst met bestanden in: [{ url, revision }].
const BESTANDEN = self.__WB_MANIFEST;

// Eén cache per build: de naam verandert zodra een bestand verandert.
function revisie(lijst) {
  let hash = 5381;
  for (const teken of JSON.stringify(lijst)) hash = ((hash * 33) ^ teken.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

// 'bloei-' of in de demo 'bloei-demo-' (kern/demo.js, BESLISSING 364): elke versie ruimt alleen haar eigen caches op. De gegevens die de
// service worker voor een melding leest, komen uit db.js en dus uit de eigen database (DB_NAAM).
const VOORVOEGSEL = CACHE_VOORVOEGSEL + '-';
const CACHE = VOORVOEGSEL + revisie(BESTANDEN);
const BEREIK = self.registration.scope;
const STARTPAGINA = new URL('index.html', BEREIK).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // De lijst kan dubbels bevatten (iconen, manifest); addAll weigert die.
      cache.addAll(
        [...new Set(BESTANDEN.map((bestand) => new URL(bestand.url, BEREIK).href))].map(
          (url) => new Request(url, { cache: 'reload' }),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) =>
        // Alleen de eigen oude caches: de echte app laat 'bloei-demo-...' staan en omgekeerd (R6-05, pwa/caches.js).
        Promise.all(namen.filter((naam) => isEigenOudeCache(naam, CACHE_VOORVOEGSEL, CACHE)).map((naam) => caches.delete(naam))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const verzoek = event.request;
  if (verzoek.method !== 'GET') return;
  // Alleen de eigen bestanden; verzoeken naar de push-dienst blijven onaangeroerd.
  if (!verzoek.url.startsWith(BEREIK)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreVary: de server stuurt een Vary-kop mee, maar er is van elk bestand maar één versie.
      const opties = { ignoreSearch: true, ignoreVary: true };
      if (verzoek.mode === 'navigate') {
        // Een pagina die zelf in de cache zit (stijl.html) krijgt haar eigen bestand; elke andere navigatie
        // (de app op een pad of met een hash) valt terug op index.html.
        const pad = new URL(verzoek.url).pathname;
        const laatste = pad.slice(pad.lastIndexOf('/') + 1);
        // Een pad met een andere extensie dan .html (licenties-derden.txt, BESLISSING 427) is een bestand, niet de app: uit de cache,
        // anders van het netwerk. index.html blijft alleen de terugval voor navigaties zonder extensie.
        if (laatste.includes('.') && !laatste.endsWith('.html')) return (await cache.match(verzoek.url, opties)) || fetch(verzoek);
        const eigen = pad.endsWith('.html') && pad !== new URL(STARTPAGINA).pathname ? await cache.match(verzoek.url, opties) : null;
        return eigen || (await cache.match(STARTPAGINA, opties)) || fetch(verzoek);
      }
      return (await cache.match(verzoek.url, opties)) || fetch(verzoek);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'nu-wisselen') self.skipWaiting();
  // BESLISSING 405: een venster dat net opstart (pwa/opstart.js) vraagt of deze wachtende versie nu overneemt. Alleen als dat het
  // enige venster van Bloei is: een ander open venster mag niet midden in het gebruik herladen (daar blijft de melding "Updaten").
  else if (event.data?.type === OPSTART_BERICHT) {
    event.waitUntil(
      (async () => {
        const vensters = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const wisselt = vensters.length <= 1;
        event.ports[0]?.postMessage({ wisselt });
        if (wisselt) await self.skipWaiting();
      })(),
    );
  }
});

// Een leeg pushsignaal wordt een of meer meldingen met de tekst die op dit toestel gekozen is (BESLISSINGEN 33, 34 en 716: met details een
// melding per soort die op dat tijdstip staat, elk met een eigen tag). Er verschijnt altijd een melding: iOS staat geen stille push toe.
// Lukt het lezen van de gegevens niet, dan staat er de algemene tekst. Daarna onthoudt het toestel dat dit tijdstip een melding kreeg.
async function toonMelding() {
  let meldingen;
  try {
    meldingen = kiesMeldingen(await leesMeldingInvoer(new Date()));
  } catch {
    meldingen = [algemeneMelding()];
  }
  await Promise.all(
    meldingen.map((melding) =>
      self.registration.showNotification(melding.titel, {
        body: melding.tekst,
        tag: melding.tag,
        icon: new URL('icons/icon-192.png', BEREIK).href,
        badge: new URL('icons/badge-96.png', BEREIK).href, // BESLISSING 441: eenkleurig silhouet voor de statusbalk van Android
        data: { pad: melding.pad },
      }),
    ),
  );
  const sleutels = [...new Set(meldingen.map((m) => m.sleutel).filter(Boolean))];
  try {
    await bewaarAfgehandeld(sleutels);
  } catch {
    // niet kunnen onthouden: het volgende signaal kiest dan zonder die kennis, er komt nog altijd een melding
  }
}
// Signalen na elkaar afhandelen: twee signalen die tegelijk binnenkomen, mogen niet allebei hetzelfde open tijdstip kiezen.
let wachtrij = Promise.resolve();
self.addEventListener('push', (event) => {
  const beurt = wachtrij.then(toonMelding);
  wachtrij = beurt.catch(() => {});
  event.waitUntil(beurt);
});

// Een tik op de melding opent of focust de app op het scherm van die melding (data.pad) en sluit alleen die melding; de andere blijven staan.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(opneApp(self.clients, BEREIK, event.notification.data?.pad));
});
