// BESLISSING 434: "Annuleren" in het maaltijdblad zet ook de favoriet terug. De gegevenslaag biedt daarvoor zetFavorietTerug:
// een weggehaalde favoriet komt terug met dezelfde id, tekst, sleutel en laatstGebruikt (dus op dezelfde plaats in de volgorde).
// Het scherm (het hartje en Annuleren in het blad) staat in tests/e2e/x-annuleren-favoriet.spec.js.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { leesFavorieten, verwijderFavoriet, voegFavorietToe, zetFavorietTerug } from '../../src/data/favorieten.js';

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('zetFavorietTerug', () => {
  test('een weggehaalde favoriet komt terug met dezelfde id, tekst en plaats in de volgorde', async () => {
    const a = await voegFavorietToe('Havermout');
    await db.favorieten.update(a.id, { laatstGebruikt: 3000 });
    const b = await voegFavorietToe('Yoghurt met fruit');
    await db.favorieten.update(b.id, { laatstGebruikt: 2000 });
    const c = await voegFavorietToe('Soep');
    await db.favorieten.update(c.id, { laatstGebruikt: 1000 });
    const voor = await leesFavorieten();
    const oud = voor.find((f) => f.id === b.id);
    await verwijderFavoriet(b.id);
    expect((await leesFavorieten()).map((f) => f.tekst)).toEqual(['Havermout', 'Soep']);
    await zetFavorietTerug(oud);
    expect(await leesFavorieten()).toEqual(voor);
  });

  test('zet ook een gewijzigde laatstGebruikt terug en laat een ander record met dezelfde sleutel niet dubbel staan', async () => {
    const a = await voegFavorietToe('Havermout');
    const oud = { ...a };
    await verwijderFavoriet(a.id);
    const nieuw = await voegFavorietToe('havermout'); // in het blad opnieuw aangemaakt, andere id
    expect(nieuw.id).not.toBe(a.id);
    await zetFavorietTerug(oud);
    const lijst = await leesFavorieten();
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toEqual(oud);
  });
});
