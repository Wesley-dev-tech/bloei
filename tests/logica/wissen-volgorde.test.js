// Alles wissen (src/data/wissen.js, wisAlles), de volgorde (bevinding van de nakijker): het afmelden bij de meldingsdienst en het melden van de
// passkeys als onbekend gebeuren pas NA een geslaagde transactie. Mislukt de transactie, dan blijft alles staan: de gegevens, het abonnement en de
// passkey van het slot. Wat het afmelden nodig heeft (het abonnement, de id's) wordt vóór de transactie gelezen en erna gebruikt.
// "Profiel verwijderen" (schermen/meer.js) en het wissen vanuit het slot (vergrendeling/wisvanslot.js) roepen allebei dezelfde wisAlles aan.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const verloop = vi.hoisted(() => ({ stappen: [], abonnementBijAfmelden: undefined, db: null }));

vi.mock('../../src/meldingen/push.js', () => ({
  meldAfBijWissen: vi.fn(async () => {
    // wat het echte afmelden (push.js, zetMeldingenUit) in de opslag vindt
    verloop.abonnementBijAfmelden = (await verloop.db.instellingen.get('meldingen.abonnement'))?.waarde ?? null;
    verloop.stappen.push('afgemeld');
  }),
}));
vi.mock('../../src/vergrendeling/passkey.js', () => ({
  vergeetPasskey: vi.fn(async (id) => {
    verloop.stappen.push('vergeten ' + id);
    return true;
  }),
}));

const { db, openDb } = await import('../../src/data/db.js');
const { wisAlles } = await import('../../src/data/wissen.js');
const { meldAfBijWissen } = await import('../../src/meldingen/push.js');
const { vergeetPasskey } = await import('../../src/vergrendeling/passkey.js');
verloop.db = db;

const ABONNEMENT = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };

beforeEach(async () => {
  verloop.stappen = [];
  verloop.abonnementBijAfmelden = undefined;
  vi.clearAllMocks();
  await db.delete();
  await openDb();
  await db.instellingen.bulkPut([
    { sleutel: 'slot.aan', waarde: true },
    { sleutel: 'slot.passkeyId', waarde: 'sleutel-van-het-slot' },
    { sleutel: 'slot.herstelId', waarde: 'oude-herstelsleutel' },
    { sleutel: 'meldingen.abonnement', waarde: ABONNEMENT },
  ]);
  await db.dranken.add({ datum: '2026-11-18', soort: 'water', ml: 800, tijd: 1 });
});
afterEach(() => vi.restoreAllMocks());

describe('wisAlles: afmelden en passkeys pas na een geslaagde transactie', () => {
  it('mislukt de transactie: niets gewist, niet afgemeld en niets als onbekend gemeld', async () => {
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('opslag stuk'));
    await expect(wisAlles()).rejects.toThrow('opslag stuk');
    expect(meldAfBijWissen).not.toHaveBeenCalled();
    expect(vergeetPasskey).not.toHaveBeenCalled();
    expect(verloop.stappen).toEqual([]);
    expect(await db.dranken.count()).toBe(1);
    expect((await db.instellingen.get('slot.passkeyId'))?.waarde).toBe('sleutel-van-het-slot');
    expect((await db.instellingen.get('meldingen.abonnement'))?.waarde).toEqual(ABONNEMENT);
  });

  it('mislukt het leegmaken midden in de transactie: alles blijft staan, ook het abonnement en de passkey', async () => {
    vi.spyOn(db.dranken, 'clear').mockRejectedValueOnce(new Error('halverwege stuk'));
    await expect(wisAlles()).rejects.toThrow();
    expect(meldAfBijWissen).not.toHaveBeenCalled();
    expect(vergeetPasskey).not.toHaveBeenCalled();
    expect(await db.dranken.count()).toBe(1);
    expect(await db.instellingen.count()).toBe(4);
  });

  it('lukt de transactie: eerst gewist, dan afgemeld met het bewaarde abonnement, dan beide passkeys gemeld; daarna is alles leeg', async () => {
    await wisAlles();
    expect(meldAfBijWissen).toHaveBeenCalledTimes(1);
    expect(verloop.abonnementBijAfmelden).toEqual(ABONNEMENT); // het afmelden vond het abonnement nog
    expect(verloop.stappen).toEqual(['afgemeld', 'vergeten sleutel-van-het-slot', 'vergeten oude-herstelsleutel']);
    expect(await db.dranken.count()).toBe(0);
    expect(await db.instellingen.count()).toBe(0); // ook de rij van het abonnement is weg
  });

  it('zonder abonnement en zonder passkey: geen rij teruggezet, niets gemeld, alles leeg', async () => {
    await db.instellingen.clear();
    await db.instellingen.put({ sleutel: 'slot.aan', waarde: false });
    await wisAlles();
    expect(verloop.abonnementBijAfmelden).toBeNull();
    expect(vergeetPasskey).not.toHaveBeenCalled();
    expect(await db.instellingen.count()).toBe(0);
  });

  it('een afmelding die mislukt, houdt het wissen niet tegen; de passkeys worden toch gemeld en de rij van het abonnement verdwijnt', async () => {
    meldAfBijWissen.mockRejectedValueOnce(new Error('offline'));
    await wisAlles();
    expect(vergeetPasskey).toHaveBeenCalledTimes(2);
    expect(await db.instellingen.count()).toBe(0);
    expect(await db.dranken.count()).toBe(0);
  });

  it('wint de time-out van het afmelden, dan schrijft het late einde van de afmelding geen lege rij van het abonnement meer', async () => {
    const { zetInstelling } = await import('../../src/data/instellingen.js');
    let laat;
    let geefVrij;
    const poort = new Promise((k) => (geefVrij = k));
    // zoals meldAfBijWissen bij een time-out: het wissen gaat verder terwijl zetMeldingenUit nog loopt en pas later null schrijft
    meldAfBijWissen.mockImplementationOnce(async () => {
      laat = poort.then(() => zetInstelling('meldingen.abonnement', null));
      laat.catch(() => {});
    });
    await wisAlles();
    expect(await db.instellingen.count()).toBe(0);
    geefVrij();
    await expect(laat).rejects.toThrow();
    expect(await db.instellingen.get('meldingen.abonnement')).toBeUndefined();
    expect(await db.instellingen.count()).toBe(0);
    // een echt nieuw abonnement mag wel (en daarna gewoon weer afgemeld worden)
    await zetInstelling('meldingen.abonnement', ABONNEMENT);
    expect((await db.instellingen.get('meldingen.abonnement'))?.waarde).toEqual(ABONNEMENT);
    await db.instellingen.delete('meldingen.abonnement');
    await zetInstelling('meldingen.abonnement', null);
    expect(await db.instellingen.get('meldingen.abonnement')).toEqual({ sleutel: 'meldingen.abonnement', waarde: null });
  });

  it('"Profiel verwijderen" houdt de dialoog open en uitgeschakeld tot wisAlles klaar is (niets tikbaar dat de wis overleeft)', () => {
    const meer = readFileSync(join(process.cwd(), 'src/schermen/meer.js'), 'utf8');
    const stap2 = meer.slice(meer.indexOf('const stap2'), meer.indexOf("window.location.hash = '#/welkom'"));
    expect(stap2).not.toMatch(/sluit\(\);\s*await wisAlles/);
    expect(stap2).toMatch(/bezig = true;[\s\S]*b\.disabled = true;[\s\S]*await wisAlles\(\);/);
    expect(meer).toMatch(/const sluit = \(\) => \{\n\s*if \(bezig\) return;/);
  });

  it('"Profiel verwijderen" en het wissen vanuit het slot gebruiken dezelfde wisAlles', () => {
    const lees = (p) => readFileSync(join(process.cwd(), p), 'utf8');
    expect(lees('src/schermen/meer.js')).toMatch(/import \{ wisAlles \} from '\.\.\/data\/wissen\.js'/);
    expect(lees('src/schermen/meer.js')).toMatch(/await wisAlles\(\);/);
    expect(lees('src/vergrendeling/wisvanslot.js')).toMatch(/wis = wisAlles/);
  });
});
