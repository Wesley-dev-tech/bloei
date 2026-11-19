// De opruimweg na een onderbroken wis (src/data/wissen.js): sluit de app tussen het leegmaken en het afmelden, dan staat bij de volgende start alleen
// de rij 'meldingen.abonnement' nog in de opslag. startMeldingen (src/meldingen/push.js) brengt de dienst dan in lijn: er staan geen herinneringen
// meer aan, dus werkUrenBij meldt het abonnement af (zetMeldingenUit) met het bewaarde adres en geheim en schrijft het lokaal uit.
// Met de echte push.js en de echte opslag (fake-indexeddb); alleen de dienst, de service worker en de browser zijn nagebootst. Er gaat geen verzoek naar buiten.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/meldingen/config.js', () => ({ PUSH_URL: 'https://dienst.test', VAPID_PUBLIEK: 'AAAA', pushBeschikbaar: () => true, pushToestand: () => 'beschikbaar' }));

const { db, openDb } = await import('../../src/data/db.js');
const { leesInstelling } = await import('../../src/data/instellingen.js');
const { startMeldingen } = await import('../../src/meldingen/push.js');

const ABONNEMENT = { endpoint: 'https://push.test/oud', keys: { p256dh: 'P', auth: 'A' } };
let verzoeken;
let sub;

function nepOmgeving({ browserKentHet }) {
  sub = browserKentHet ? { endpoint: ABONNEMENT.endpoint, toJSON: () => ABONNEMENT, unsubscribe: vi.fn(async () => true) } : null;
  const reg = { pushManager: { getSubscription: async () => sub, subscribe: vi.fn() } };
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg), addEventListener: vi.fn() } });
  vi.stubGlobal('window', { addEventListener: vi.fn(), location: { hash: '' } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn() });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opties) => {
      verzoeken.push({ url, methode: opties.method, lichaam: JSON.parse(opties.body) });
      return { ok: true, status: 200 };
    }),
  );
}

// wacht tot de afmelding (in de rij van push.js) klaar is: de rij van het abonnement heeft dan geen waarde meer
async function totAfgemeld() {
  for (let i = 0; i < 100; i++) {
    if ((await db.instellingen.get('meldingen.abonnement'))?.waarde == null) return;
    await new Promise((k) => setTimeout(k, 10));
  }
}

beforeEach(async () => {
  verzoeken = [];
  await db.delete();
  await openDb();
  // de stand na een onderbroken wis: alles leeg, behalve de rij van het abonnement
  await db.instellingen.put({ sleutel: 'meldingen.abonnement', waarde: ABONNEMENT });
});
afterEach(() => vi.unstubAllGlobals());

describe('opruimen na een onderbroken wis (alleen de rij van het abonnement staat er nog)', () => {
  for (const browserKentHet of [true, false]) {
    it(`bij de start wordt het abonnement afgemeld en lokaal uitgeschreven (${browserKentHet ? 'de browser kent het nog' : 'de browser kent het niet meer'})`, async () => {
      nepOmgeving({ browserKentHet });
      startMeldingen();
      await totAfgemeld();
      // precies één verzoek: de afmelding met het bewaarde adres en het geheim (BESLISSING 329), niets uit het dagboek, geen uren
      expect(verzoeken).toEqual([{ url: 'https://dienst.test/abonnement', methode: 'DELETE', lichaam: { endpoint: ABONNEMENT.endpoint, auth: 'A' } }]);
      if (browserKentHet) expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
      // het abonnement is weg: de app kent geen abonnement meer. zetMeldingenUit (push.js) laat een rij met waarde null staan, geen adres en geen sleutels.
      expect(await leesInstelling('meldingen.abonnement')).toBeNull();
      expect((await db.instellingen.get('meldingen.abonnement'))?.waarde ?? null).toBeNull();
      expect(await db.instellingen.count()).toBeLessThanOrEqual(1);
      // geen andere rijen bijgekomen
      expect((await db.instellingen.toArray()).map((r) => r.sleutel).filter((s) => s !== 'meldingen.abonnement')).toEqual([]);
    });
  }
});
