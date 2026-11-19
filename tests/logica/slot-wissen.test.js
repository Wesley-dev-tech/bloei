// BESLISSING 631 (OWASP-scan, wijzigt 518): "Alles wissen" vanuit het gesloten slot vraagt eerst het toestel (wisvanslot.js). Alleen een geslaagde
// bevestiging wist; geweigerd, geannuleerd, een fout van het toestel, een toestel dat het niet kan of een scherm dat intussen weg is: niets gewist.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, openDb } from '../../src/data/db.js';
import { leesInstelling, zetInstelling } from '../../src/data/instellingen.js';
import { wisNaToestel } from '../../src/vergrendeling/wisvanslot.js';
import { TEKSTEN } from '../../src/teksten.js';

const PIN = { zout: 'eA', hash: 'eA', rondes: 1000, lengte: 6 };

async function vulDagboek() {
  await zetInstelling('slot.aan', true);
  await zetInstelling('slot.pin', PIN);
  await db.dranken.add({ datum: '2026-11-18', soort: 'water', ml: 800, tijd: Date.now() });
}

const nogAlles = async () => ({ aan: await leesInstelling('slot.aan'), pin: await leesInstelling('slot.pin'), dranken: await db.dranken.count() });

beforeEach(async () => {
  await db.delete();
  await openDb();
  await vulDagboek();
});

describe('alles wissen vanuit het slot vraagt eerst het toestel (BESLISSING 631)', () => {
  it('het toestel bevestigt: alles is gewist', async () => {
    const bevestig = vi.fn(async () => true);
    expect(await wisNaToestel({ metToestel: true, bevestig })).toBe('gewist');
    expect(bevestig).toHaveBeenCalledTimes(1);
    expect(await db.dranken.count()).toBe(0);
    expect(await db.instellingen.count()).toBe(0);
  });

  it('bij de methode Face ID gaat de vraag naar de passkey van het slot', async () => {
    const bevestig = vi.fn(async () => true);
    await wisNaToestel({ metToestel: true, passkeyId: 'AQID', bevestig });
    expect(bevestig).toHaveBeenCalledWith({ passkeyId: 'AQID' });
  });

  it('de vraag aan het toestel vertrekt meteen, zonder await ervoor (nog in de tik)', () => {
    const bevestig = vi.fn(async () => false);
    wisNaToestel({ metToestel: true, bevestig });
    expect(bevestig).toHaveBeenCalledTimes(1);
  });

  for (const [naam, bevestig] of [
    ['geweigerd of geannuleerd (false)', async () => false],
    ['een fout van het toestel (uitzondering)', async () => { throw new DOMException('geannuleerd', 'NotAllowedError'); }],
    ['een antwoord dat geen true is', async () => 'ja'],
  ]) {
    it(`${naam}: niets gewist`, async () => {
      const wis = vi.fn();
      expect(await wisNaToestel({ metToestel: true, bevestig, wis })).toBe('mislukt');
      expect(wis).not.toHaveBeenCalled();
      expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
    });
  }

  it('een toestel dat niet kan bevestigen: het toestel wordt niets gevraagd en niets wordt gewist', async () => {
    const bevestig = vi.fn(async () => true);
    expect(await wisNaToestel({ metToestel: false, bevestig })).toBe('kanNiet');
    expect(bevestig).not.toHaveBeenCalled();
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
  });

  it('een browser zonder WebAuthn: de echte toestelweg geeft geen bevestiging, niets gewist', async () => {
    expect(globalThis.PublicKeyCredential).toBeUndefined();
    expect(await wisNaToestel({ metToestel: true })).toBe('mislukt');
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
  });

  it('bevestigd, maar het scherm staat er niet meer (Terug, een ander tabblad): niets gewist', async () => {
    expect(await wisNaToestel({ metToestel: true, bevestig: async () => true, nogGeldig: () => false })).toBe('afgebroken');
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
  });

  it('het wissen zelf mislukt: de oude stand blijft en de oproeper hoort het', async () => {
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await wisNaToestel({ metToestel: true, bevestig: async () => true, wis: async () => { throw new Error('opslag'); } })).toBe('fout');
    expect(await nogAlles()).toEqual({ aan: true, pin: PIN, dranken: 1 });
    fout.mockRestore();
  });

  it('het slotscherm wist alleen via wisNaToestel, en de vraag voor het wissen blijft in twee stappen', () => {
    const slot = readFileSync(join(process.cwd(), 'src/vergrendeling/slot.js'), 'utf8');
    expect(slot).not.toMatch(/wisAlles/);
    expect(slot).toMatch(/tekenWisVraag\(2, \{ passkeyId \}\)/);
    expect(slot).toMatch(/metToestel \? tekenWisVraag\(1, \{ passkeyId \}\) : tekenWisKanNiet\(\)/);
  });

  it('de teksten bestaan, ook op Android, zonder uitroepteken', () => {
    for (const s of ['kwijtWissenToestel', 'kwijtWissenToestelAndroid', 'kwijtWissenNiet', 'kwijtWissenNietAndroid', 'wisMislukt', 'wisKanNietTitel', 'wisKanNietTekst', 'wisKanNietTekstAndroid']) {
      expect(typeof TEKSTEN.slot[s], s).toBe('string');
      expect(TEKSTEN.slot[s], s).not.toMatch(/!/);
    }
    expect(TEKSTEN.slot.kwijtWissen).toBeUndefined();
    expect(TEKSTEN.slot.kwijtWissenAlleen).toBeUndefined();
  });
});
