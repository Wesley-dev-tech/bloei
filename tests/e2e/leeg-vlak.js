// Hulp voor de lay-outtests van Dagboek en Gewicht (BESLISSING 227 en 229): vult de opslag met een aantal dranken, wegingen
// en maaltijden, en meet of een kaart een leeg vlak heeft en of kaarten in één rij gelijk eindigen.

// Schrijft rechtstreeks in de opslag (de app moet één keer geopend zijn zodat de database bestaat) en herlaadt daarna.
export async function vul(page, { dranken = 0, wegingen = 0, maaltijden = 0 } = {}) {
  await page.evaluate(
    ([aantalDranken, aantalWegingen, aantalMaaltijden]) =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const naarTekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction(['dranken', 'wegingen', 'maaltijden'], 'readwrite');
          tx.objectStore('dranken').clear();
          tx.objectStore('wegingen').clear();
          tx.objectStore('maaltijden').clear();
          const soorten = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];
          const vandaag = naarTekst(nu);
          for (let i = 0; i < aantalDranken; i++) {
            tx.objectStore('dranken').add({ datum: vandaag, tijdstip: nu.getTime() - (aantalDranken - i) * 60000, soort: soorten[i % 6], ml: 200 + (i % 3) * 50, voorbeeld: false });
          }
          for (let i = 0; i < aantalWegingen; i++) {
            const d = new Date(nu);
            d.setDate(d.getDate() - 7 * (aantalWegingen - 1 - i));
            const maandag = new Date(d);
            maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            tx.objectStore('wegingen').put({ week: naarTekst(maandag), datum: naarTekst(d), kg: 70 + Math.round(Math.sin(i) * 20) / 10, voorbeeld: false, gewijzigdOp: Date.now() });
          }
          const soortenMaaltijd = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
          for (let i = 0; i < aantalMaaltijden; i++) {
            tx.objectStore('maaltijden').put({ datum: vandaag, soort: soortenMaaltijd[i], tijd: '12:00', tekst: 'Soep en brood', fotoId: null, voorbeeld: false, gewijzigdOp: Date.now() });
          }
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [dranken, wegingen, maaltijden],
  );
  await page.reload();
}

// Meet elke kaart binnen `wortel`: de grootste lege strook (zonder inhoud) in de kaart en de rand van de kaart.
export function meetKaarten(page, wortel) {
  return page.evaluate((sel) => {
    const houder = document.querySelector(sel);
    const kaarten = [...houder.querySelectorAll('.kaart')].filter((k) => k.offsetParent !== null);
    return kaarten.map((k) => {
      const r = k.getBoundingClientRect();
      const stijl = getComputedStyle(k);
      const binnenTop = r.top + parseFloat(stijl.paddingTop);
      const binnenBodem = r.bottom - parseFloat(stijl.paddingBottom);
      // De inhoud: alle elementen zonder kinderen die iets tonen (tekst, tegel, schuifveld, grafiek).
      const blokken = [];
      for (const e of k.querySelectorAll('*')) {
        const b = e.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        const toont = e.children.length === 0 || ['svg', 'textarea', 'input', 'button'].includes(e.tagName.toLowerCase());
        if (!toont) continue;
        blokken.push([Math.max(b.top, binnenTop), Math.min(b.bottom, binnenBodem)]);
      }
      blokken.sort((a, b) => a[0] - b[0]);
      let gat = 0;
      let tot = binnenTop;
      for (const [van, naar] of blokken) {
        if (naar <= van) continue;
        gat = Math.max(gat, van - tot);
        tot = Math.max(tot, naar);
      }
      gat = Math.max(gat, binnenBodem - tot);
      const naam = [...k.classList].find((c) => /^(dag__|gewichthoofd|gewicht__weegdag|gewichtstreef|gewichtgrafiek|gewicht__lijst|gewicht__weetjes|maand__|week__)/.test(c)) ?? k.className;
      return { naam, top: r.top, bodem: r.bottom, links: r.left, hoogte: r.height, gat };
    });
  }, wortel);
}
