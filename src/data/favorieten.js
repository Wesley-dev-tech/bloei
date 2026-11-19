// Favoriete maaltijdteksten (42 tot 44). Een favoriet is alleen tekst; de sleutel is de tekst in
// kleine letters en getrimd, zodat "Havermout" en "havermout " dezelfde favoriet zijn.
import { db } from './db.js';
import { zend } from '../kern/bus.js';
import { MAX_LENGTE, begrens } from './grenzen.js';

export const maakSleutel = (tekst) => String(tekst ?? '').trim().toLowerCase();

// Laatst gebruikt eerst.
export async function leesFavorieten() {
  const alle = await db.favorieten.toArray();
  return alle.sort((a, b) => b.laatstGebruikt - a.laatstGebruikt || b.id - a.id);
}

// Bestaat de tekst al, dan komt de bestaande favoriet terug (zonder dubbel).
export async function voegFavorietToe(tekst) {
  const schoon = begrens(String(tekst ?? '').trim(), MAX_LENGTE.favoriet).trim();
  const sleutel = maakSleutel(schoon);
  if (sleutel === '') throw new Error('leeg');
  const bestaand = await db.favorieten.where('sleutel').equals(sleutel).first();
  if (bestaand) return bestaand;
  const favoriet = { tekst: schoon, sleutel, laatstGebruikt: Date.now() };
  favoriet.id = await db.favorieten.add(favoriet);
  zend('data:gewijzigd', { store: 'favorieten' });
  return favoriet;
}

export async function verwijderFavoriet(id) {
  await db.favorieten.delete(id);
  zend('data:gewijzigd', { store: 'favorieten' });
}

// Annuleren in het maaltijdblad (BESLISSING 434): een favoriet die in het blad is weggehaald komt precies terug zoals ze was (dezelfde
// id, tekst, sleutel en laatstGebruikt, dus op dezelfde plaats in de volgorde). Staat er intussen een ander record met dezelfde sleutel
// (opnieuw aangemaakt in het blad), dan maakt dat plaats voor de teruggezette favoriet: de sleutel is uniek.
export async function zetFavorietTerug(oud) {
  await db.transaction('rw', db.favorieten, async () => {
    const zelfde = await db.favorieten.where('sleutel').equals(oud.sleutel).first();
    if (zelfde && zelfde.id !== oud.id) await db.favorieten.delete(zelfde.id);
    await db.favorieten.put({ ...oud });
  });
  zend('data:gewijzigd', { store: 'favorieten' });
}

export async function isFavoriet(tekst) {
  const sleutel = maakSleutel(tekst);
  if (sleutel === '') return false;
  return (await db.favorieten.where('sleutel').equals(sleutel).count()) > 0;
}

export async function markeerGebruikt(id) {
  await db.favorieten.update(id, { laatstGebruikt: Date.now() });
  zend('data:gewijzigd', { store: 'favorieten' });
}
