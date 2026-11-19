// Hulp voor r-algemeen-instellingen.spec.js (BESLISSING 308): vult de opslag met badges, favorieten, een naam en een profielfoto in drie soorten (leeg, gewoon, vol).
const NAAM_LANG = 'Een heel erg lange naam van dertig'.slice(0, 30);

// Vult de opslag voor Algemeen: badges, favorieten, naam en foto. De app moet één keer geopend zijn.
export async function zaaiAlgemeen(page, soort, badgeIds) {
  await page.evaluate(
    ([s, ids, naamLang]) =>
      new Promise(async (klaar, mislukt) => {
        const blob = s === 'vol' ? await new Promise((r) => { const c = document.createElement('canvas'); c.width = 240; c.height = 240; const x = c.getContext('2d'); x.fillStyle = '#8EA58C'; x.fillRect(0, 0, 240, 240); x.fillStyle = '#EED9D6'; x.beginPath(); x.arc(120, 100, 50, 0, 7); x.fill(); c.toBlob(r, 'image/jpeg', 0.8); }) : null;
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['badges', 'favorieten', 'instellingen', 'fotos', 'dagen', 'maaltijden', 'dranken', 'wegingen'], 'readwrite');
          for (const w of ['badges', 'favorieten', 'fotos', 'dagen', 'maaltijden', 'dranken', 'wegingen']) tx.objectStore(w).clear();
          const inst = tx.objectStore('instellingen');
          inst.put({ sleutel: 'badges.uitgebreid', waarde: true });
          inst.put({ sleutel: 'profiel.naam', waarde: s === 'leeg' ? 'Testnaam' : s === 'vol' ? naamLang : 'Testnaam' });
          if (s === 'gewoon') ids = ['eerste-favoriet', 'dag-rond']; // de badge die bij de favorieten hoort, zodat de app niets nieuws viert
          const aantalBadges = s === 'vol' ? ids.length : s === 'gewoon' ? 2 : 0;
          for (let i = 0; i < aantalBadges; i++) tx.objectStore('badges').add({ id: ids[i], behaaldOp: Date.now() - (aantalBadges - i) * 86400000, gezien: true });
          const aantalFav = s === 'vol' ? 8 : s === 'gewoon' ? 3 : 0;
          const teksten = ['Havermout met fruit', 'Pasta met groenten en een grote kom tomatensaus met basilicum', 'Soep en brood', 'Yoghurt met noten', 'Rijst met kip', 'Appel', 'Gebakken ei op toast', 'Smoothie van banaan'];
          for (let i = 0; i < aantalFav; i++) tx.objectStore('favorieten').add({ tekst: teksten[i], sleutel: teksten[i].toLowerCase(), laatstGebruikt: Date.now() - i * 1000 });
          if (s === 'vol' && blob) {
            const rq = tx.objectStore('fotos').add({ blob, miniatuur: blob, breedte: 240, hoogte: 240, voorbeeld: false, aangemaaktOp: Date.now() });
            rq.onsuccess = () => inst.put({ sleutel: 'profiel.avatar', waarde: { soort: 'foto', fotoId: rq.result } });
          } else inst.delete('profiel.avatar');
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [soort, badgeIds, NAAM_LANG],
  );
  await page.reload();
}


// Meet in elke kaart het grootste lege vlak: een strook zonder tekst, icoon, afbeelding of gekleurd vak (een gevulde cirkel of tegel telt mee).
// Anders dan leeg-vlak.js telt ook tekst in een element met kinderen (een alinea met een icoon erin) en tellen gekleurde vakken (een avatar) mee.
// Geeft per kaart { naam, gat, tussen } terug, met `tussen` de twee elementen waartussen het vlak ligt.
export function meetLegeVlakken(wortel) {
  const houder = document.querySelector(wortel);
  const naamVan = (e) => (e ? (String(e.className).split(' ')[0] || e.tagName) + (e.children.length === 0 && e.textContent ? ' "' + e.textContent.trim().slice(0, 14) + '"' : '') : 'rand');
  const uit = [];
  for (const k of houder.querySelectorAll('.kaart')) {
    if (k.offsetParent === null) continue;
    const r = k.getBoundingClientRect();
    const st = getComputedStyle(k);
    const top = r.top + parseFloat(st.paddingTop);
    const bodem = r.bottom - parseFloat(st.paddingBottom);
    const blokken = [];
    for (const e of k.querySelectorAll('*')) {
      if (e.closest('.is-meet, [hidden], .medaille-tip')) continue;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      const blad = e.children.length === 0 || ['svg', 'textarea', 'input', 'button', 'img'].includes(e.tagName.toLowerCase());
      const geverfd = (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || e.matches('.weekstaven, .gewvoorbeeld__echt')) && b.width >= 20 && b.height >= 20 && b.height < r.height - 24;
      if (blad || geverfd) blokken.push([Math.max(b.top, top), Math.min(b.bottom, bodem), e]);
      // tekst direct in dit element (naast kinderen)
      if (!blad) {
        for (const n of e.childNodes) {
          if (n.nodeType !== 3 || !n.textContent.trim()) continue;
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const t of rg.getClientRects()) if (t.height > 1) blokken.push([Math.max(t.top, top), Math.min(t.bottom, bodem), e]);
        }
      }
    }
    blokken.sort((a, b) => a[0] - b[0]);
    let gat = 0;
    let tussen = '';
    let tot = top;
    let vorige = null;
    for (const [van, naar, e] of blokken) {
      if (naar <= van) continue;
      if (van - tot > gat) { gat = van - tot; tussen = naamVan(vorige) + ' en ' + naamVan(e); }
      if (naar > tot) { tot = naar; vorige = e; }
    }
    if (bodem - tot > gat) { gat = bodem - tot; tussen = 'onder ' + naamVan(vorige); }
    uit.push({ naam: [...k.classList].filter((c) => c !== 'kaart').slice(0, 2).join('.') || 'kaart', gat, tussen });
  }
  return uit;
}
