// De waarschuwing van het KMI voor de plek van het weerbericht (logica/kmi.js, logica/kmigebieden.js).
// Bloei vraagt de waarschuwingen van heel België op, zonder plek, zonder cookie en zonder herkomst, en kiest op het toestel welke voor
// de plek gelden. Er gaat dus niets over de plek naar buiten. Eerst bij Bloei zelf (/api/kmi, api/kmi.js: dat kan de browser nooit
// tegenhouden), en lukt dat niet, rechtstreeks bij MeteoAlarm (logica/kmi.js).
// Lukt het niet (geen netwerk, de dienst antwoordt niet), dan is er gewoon geen waarschuwing: het weer zelf hangt hier nooit van af.
// Er wordt niets bewaard op het toestel: een waarschuwing is alleen nu van belang.
import { KMI_EIGEN_PAD, kmiAdres, leesKmi } from '../logica/kmi.js';
import { waarschuwingsgebieden } from '../logica/kmigebieden.js';

const VERS_MS = 15 * 60 * 1000; // zo lang gebruikt Bloei de waarschuwingen van daarnet, zonder opnieuw te vragen

let laatste = null; // { tijd, json }
let bezig = null;

async function haalFeed() {
  if (laatste && Date.now() - laatste.tijd < VERS_MS) return laatste.json;
  if (bezig) return bezig;
  bezig = (async () => {
    try {
      for (const adres of [KMI_EIGEN_PAD, kmiAdres()]) {
        const vraag = { credentials: 'omit', cache: 'no-cache', referrerPolicy: 'no-referrer' };
        if (typeof AbortSignal?.timeout === 'function') vraag.signal = AbortSignal.timeout(10000);
        const json = await fetch(adres, vraag)
          .then((a) => (a.ok ? a.json() : null))
          .catch(() => null);
        if (json && Array.isArray(json.warnings) && !json.onbereikbaar) {
          laatste = { tijd: Date.now(), json };
          return json;
        }
      }
      return laatste?.json ?? null;
    } catch {
      return laatste?.json ?? null;
    } finally {
      bezig = null;
    }
  })();
  return bezig;
}

// De waarschuwing van nu (of van later vandaag) voor een plek: { soort, niveau, tot }, of null.
export async function waarschuwingVoor(breedte, lengte, nu = new Date()) {
  const gebieden = waarschuwingsgebieden(breedte, lengte);
  if (!gebieden.length) return null; // buiten België: het KMI waarschuwt daar niet
  const json = await haalFeed();
  if (!json) return null;
  const einde = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + 1).getTime();
  return leesKmi(json, gebieden, nu.getTime(), einde);
}
