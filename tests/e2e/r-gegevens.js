// Hulp voor de responsive-tests (BESLISSING 308): vult de opslag met verzonnen gegevens in drie soorten:
//  'leeg'   : een nieuwe gebruiker, niets ingevuld;
//  'gewoon' : een gewone dag (twee maaltijden, een paar dranken, twee supplementen, een kort notitiezinnetje);
//  'vol'    : zes maaltijden met lange teksten, zes soorten dranken, een spuit vandaag, een lange notitie, een lange supplementnaam,
//             wegingen en een maand met ingevulde dagen.
// De app moet één keer geopend zijn, zodat de database bestaat. Daarna herlaadt de pagina.
// Alle datums komen uit de klok van de pagina ("vandaag", de maandag van de week, de dagen van deze maand tot gisteren): zet vóór de
// eerste page.goto de vaste klok (vasteKlok uit vaste-klok.js), anders hangt de volle maand van de rundag af (op de 1e is ze leeg, R4-21).

export const LANGE_TEKST =
  'Pasta met groenten, gesmolten kaas en een grote kom tomatensaus met basilicum, daarna nog een stuk fruit en een glas melk voor het slapengaan';

export async function vulGegevens(page, soort) {
  await page.evaluate(
    (s) =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const tekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const vandaag = tekst(nu);
        const lang =
          'Pasta met groenten, gesmolten kaas en een grote kom tomatensaus met basilicum, daarna nog een stuk fruit en een glas melk voor het slapengaan';
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const winkels = ['maaltijden', 'dranken', 'wegingen', 'supplementen', 'momentinnames', 'dagen'];
          const tx = idb.transaction(winkels, 'readwrite');
          for (const w of winkels) tx.objectStore(w).clear();
          const soortenMaaltijd = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
          const uren = ['08:00', '10:30', '12:30', '16:00', '18:30', '21:30'];
          const aantalM = s === 'vol' ? 6 : s === 'gewoon' ? 2 : 0;
          for (let i = 0; i < aantalM; i++) {
            tx.objectStore('maaltijden').put({ datum: vandaag, soort: soortenMaaltijd[i], tijd: uren[i], tekst: s === 'vol' ? lang : 'Soep en brood', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: Date.now() });
          }
          const dranken = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];
          const aantalD = s === 'vol' ? 14 : s === 'gewoon' ? 4 : 0;
          for (let i = 0; i < aantalD; i++) {
            tx.objectStore('dranken').add({ datum: vandaag, tijdstip: nu.getTime() - (aantalD - i) * 60000, soort: dranken[i % 6], ml: 200 + (i % 3) * 50, voorbeeld: false });
          }
          if (s !== 'leeg') {
            const namen = s === 'vol' ? ['Magnesiumbisglycinaat met extra vitamine B6 en zink (ochtend)', 'Middagmiddel', 'Avondmiddel'] : ['Magnesium', 'Vitamine D', 'Omega 3'];
            const momenten = ['ochtend', 'middag', 'avond'];
            const aantalS = s === 'vol' ? 3 : 2;
            for (let i = 0; i < aantalS; i++) tx.objectStore('supplementen').add({ naam: namen[i], dosis: '', hoeveelheid: '', aanwijzing: '', momenten: [momenten[i]], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
            tx.objectStore('momentinnames').add({ datum: vandaag, supplementId: 1, moment: 'ochtend', tijdstip: Date.now(), voorbeeld: false });
          }
          if (s === 'vol') {
            tx.objectStore('supplementen').add({ naam: 'Spuit ijzer met een lange naam erbij', dosis: '', hoeveelheid: 'een volledige ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: vandaag }, volgorde: 9, actief: true, voorbeeld: false, aangemaaktOp: 1 });
            for (let i = 0; i < 8; i++) {
              const d = new Date(nu);
              d.setDate(d.getDate() - 7 * (7 - i));
              const maandag = new Date(d);
              maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
              tx.objectStore('wegingen').put({ week: tekst(maandag), datum: tekst(d), kg: 70 + Math.round(Math.sin(i) * 20) / 10, voorbeeld: false, gewijzigdOp: Date.now() });
            }
            // de dagen van deze maand tot en met gisteren
            for (let dagnr = 1; dagnr < nu.getDate(); dagnr++) {
              const d = new Date(nu.getFullYear(), nu.getMonth(), dagnr);
              const ds = tekst(d);
              tx.objectStore('dagen').put({ datum: ds, stemming: 1 + (dagnr % 5), energie: 1 + ((dagnr * 2) % 5), notitie: dagnr % 3 === 0 ? 'Een rustige dag met een lange wandeling en veel te weinig slaap vannacht, dus morgen vroeg naar bed.' : '', gewijzigdOp: Date.now() });
              if (dagnr % 2 === 0) tx.objectStore('maaltijden').put({ datum: ds, soort: 'ontbijt', tijd: '08:00', tekst: 'Havermout met fruit', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: Date.now() });
              if (dagnr % 2 === 1) tx.objectStore('dranken').add({ datum: ds, tijdstip: d.getTime() + 36000000, soort: 'water', ml: 250, voorbeeld: false });
            }
          }
          if (s === 'vol') {
            tx.objectStore('dagen').put({ datum: vandaag, stemming: 4, energie: 3, notitie: 'Vandaag was een zware dag met veel moeheid in de ochtend, maar na de middag voelde ik me beter. '.repeat(6), gewijzigdOp: Date.now() });
          } else if (s === 'gewoon') {
            tx.objectStore('dagen').put({ datum: vandaag, stemming: 4, energie: 3, notitie: 'Rustige dag.', gewijzigdOp: Date.now() });
          }
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    soort,
  );
  await page.reload();
}
