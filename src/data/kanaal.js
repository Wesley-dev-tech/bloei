// Meerdere tabbladen of vensters van Bloei (R5-01): wat het ene bewaart, ziet het andere meteen.
// Elke lokale 'data:gewijzigd' en 'instelling:gewijzigd' gaat over een BroadcastChannel naar de andere tabbladen van dezelfde app
// (dezelfde oorsprong en dus dezelfde database). Daar komt ze binnen als 'elders:gewijzigd' { naam, ...detail }: de schermen tekenen
// opnieuw (beheerScherm, met dezelfde regel als altijd: niet terwijl er een tekstveld focus heeft), maar badges, vieringen, meldingen
// en het slot reageren niet nog eens op iets wat het andere tabblad al afhandelde. Niets gaat terug naar de afzender.
// Kwam er iets binnen terwijl dit tabblad verborgen was, dan volgt bij terugkeer in beeld nog één 'elders:gewijzigd' (een hertekening die
// toen wachtte, gebeurt dan zeker).
import { luister, zend } from '../kern/bus.js';
import { DB_NAAM } from '../kern/demo.js';

export const KANAAL = DB_NAAM + '-gegevens'; // eigen kanaal per database: de demo en de echte app horen elkaar niet
const DOORGEVEN = ['data:gewijzigd', 'instelling:gewijzigd'];

// Geeft een stopfunctie terug. Zonder BroadcastChannel (heel oude browsers) gebeurt er niets.
export function startKanaal() {
  if (typeof BroadcastChannel !== 'function') return () => {};
  const kanaal = new BroadcastChannel(KANAAL);
  let gemist = false;
  const afmelders = DOORGEVEN.map((naam) =>
    luister(naam, (detail) => {
      try {
        kanaal.postMessage({ naam, detail });
      } catch {
        /* niet door te geven (bv. een waarde die niet te kopiëren is): het andere tabblad ziet het bij de volgende hertekening */
      }
    }),
  );
  kanaal.onmessage = (e) => {
    const { naam, detail } = e.data ?? {};
    if (!DOORGEVEN.includes(naam)) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') gemist = true;
    zend('elders:gewijzigd', { naam, ...(detail ?? {}) });
  };
  const zichtbaar = () => {
    if (document.visibilityState !== 'visible' || !gemist) return;
    gemist = false;
    zend('elders:gewijzigd', { naam: 'data:gewijzigd', store: '*' });
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', zichtbaar);
  return () => {
    afmelders.forEach((af) => af());
    kanaal.close();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', zichtbaar);
  };
}
