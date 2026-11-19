// BESLISSING 433: staan weetjes naast elkaar op één rij, dan is de zichtbare ruimte tussen de items overal gelijk; het eerste item begint op
// de linker binnenrand, het laatste eindigt op de rechter binnenrand. Staan ze in een raster (meer dan één rij), dan zijn de kolommen even
// breed en de rij-afstanden gelijk.
// De zichtbare inhoud van een weetje: van de linkerrand van zijn tegel tot het einde van zijn tekst (het tekstbereik, niet het vak van de kolom).
//   meetWeetjesRijen(page, wortel)   alle zichtbare weetjesrijen ([class*="__weetjesrij"]) onder wortel, met per item de zichtbare inhoud
//   controleerWeetjesRij(rij)        geeft een lijst fouten (leeg = goed) volgens de regels hierboven
import { expect } from '@playwright/test';

export function meetWeetjesRijen(page, wortel = '#scherm') {
  return page.evaluate((w) => {
    const zichtbaar = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    return [...document.querySelectorAll(`${w} [class*="__weetjesrij"]`)].filter(zichtbaar).map((rij) => {
      const kaart = rij.closest('.kaart') ?? rij.parentElement;
      const kr = kaart.getBoundingClientRect();
      const ks = getComputedStyle(kaart);
      const rr = rij.getBoundingClientRect();
      const rs = getComputedStyle(rij);
      // De binnenrand: van de kaart (zonder padding en rand), of van de rij zelf als die smaller is (een eigen padding).
      const binnenLinks = Math.max(kr.left + parseFloat(ks.paddingLeft) + parseFloat(ks.borderLeftWidth), rr.left + parseFloat(rs.paddingLeft));
      const binnenRechts = Math.min(kr.right - parseFloat(ks.paddingRight) - parseFloat(ks.borderRightWidth), rr.right - parseFloat(rs.paddingRight));
      const items = [...rij.children].filter(zichtbaar).map((item) => {
        const vak = item.getBoundingClientRect();
        const tegel = item.querySelector('.tegel')?.getBoundingClientRect();
        const tekst = item.querySelector('.weetje__tekst');
        let tekstR = null;
        let regels = 0;
        if (tekst) {
          const b = document.createRange();
          b.selectNodeContents(tekst);
          tekstR = b.getBoundingClientRect();
          regels = new Set([...b.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
        }
        const delen = [tegel, tekstR].filter(Boolean);
        const links = delen.length ? Math.min(...delen.map((q) => q.left)) : vak.left;
        const rechts = delen.length ? Math.max(...delen.map((q) => q.right)) : vak.right;
        // het midden van de tegel (of van het vak): een link kan een hoger tikvlak hebben met een negatieve marge, dus niet de bovenkant
        const midden = tegel ? (tegel.top + tegel.bottom) / 2 : (vak.top + vak.bottom) / 2;
        return { links, rechts, midden, boven: vak.top, onder: vak.bottom, kolomLinks: vak.left, kolomBreed: vak.width, regels };
      });
      return { naam: (rij.className.match(/[a-z]+__weetjesrij/) ?? [rij.className])[0], binnenLinks, binnenRechts, items };
    });
  }, wortel);
}

export function controleerWeetjesRij(rij) {
  const fouten = [];
  const { items } = rij;
  if (items.length < 2) return fouten;
  const r = (x) => Math.round(x * 10) / 10;
  // Op één rij en elke tekst op één regel: de items staan naar hun inhoud (gelijke tussenruimte). Breekt een tekst over meer regels, dan
  // vullen de items hun kolom (een raster van één rij): dan gelden de regels van het raster.
  const eenRij = items.every((i) => Math.abs(i.midden - items[0].midden) <= 1) && items.every((i) => i.regels <= 1);
  if (eenRij) {
    const gaten = items.slice(1).map((it, n) => it.links - items[n].rechts);
    const min = Math.min(...gaten);
    const max = Math.max(...gaten);
    if (max - min > 1) fouten.push(`${rij.naam}: ongelijke tussenruimtes ${gaten.map(r).join(', ')} px (verschil ${r(max - min)} px, toegestaan 1 px)`);
    if (min < 20 - 0.5) fouten.push(`${rij.naam}: tussenruimte ${r(min)} px is kleiner dan 20 px`);
    const begin = items[0].links - rij.binnenLinks;
    const eind = rij.binnenRechts - items.at(-1).rechts;
    if (Math.abs(begin) > 1) fouten.push(`${rij.naam}: het eerste item begint ${r(begin)} px van de linker binnenrand`);
    if (Math.abs(eind) > 1) fouten.push(`${rij.naam}: het laatste item eindigt ${r(eind)} px van de rechter binnenrand`);
  } else {
    // Een raster: de kolommen even breed (de link mag zijn eigen breedte hebben, zie hieronder) en de afstand tussen de rijen gelijk.
    const rijen = [...new Set(items.map((i) => Math.round(i.midden)))].sort((a, b) => a - b).filter((y, n, l) => n === 0 || y - l[n - 1] > 1);
    const perRij = rijen.map((y) => items.filter((i) => Math.abs(i.midden - y) <= 1.5));
    const volle = perRij.filter((l) => l.length === Math.max(...perRij.map((x) => x.length)));
    const kolomB = volle.flat().map((i) => i.kolomBreed);
    if (Math.max(...kolomB) - Math.min(...kolomB) > 1) fouten.push(`${rij.naam}: ongelijke kolombreedtes ${kolomB.map(r).join(', ')} px`);
    if (perRij.length > 2) {
      const afstanden = perRij.slice(1).map((l, n) => Math.min(...l.map((i) => i.boven)) - Math.max(...perRij[n].map((i) => i.onder)));
      if (Math.max(...afstanden) - Math.min(...afstanden) > 1) fouten.push(`${rij.naam}: ongelijke rij-afstanden ${afstanden.map(r).join(', ')} px`);
    }
  }
  return fouten;
}

// Eén bewering voor alle weetjesrijen onder wortel; geeft de metingen terug.
export async function verwachtGelijkeWeetjes(page, wortel = '#scherm', label = '') {
  const rijen = await meetWeetjesRijen(page, wortel);
  const fouten = rijen.flatMap(controleerWeetjesRij);
  expect(fouten, `${label} ${JSON.stringify(rijen)}`).toEqual([]);
  return rijen;
}
