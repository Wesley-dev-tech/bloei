// De volgende waarde van een stapper die op een raster loopt (BESLISSING 705).
//
// Een gewone stapper telt de stap bij de huidige waarde op. Dat loopt mis zodra de waarde niet op een veelvoud van de stap staat:
// frisdrank begint op 330 ml en met stappen van 50 kwam je op 380, 430, 480, 530, nooit op 500. Deze functie springt daarom naar
// het eerstvolgende veelvoud van de stap (330 -> 350 -> 400 -> 450 -> 500), in beide richtingen.
//
// stops: extra waarden waar de stapper ook halt houdt, naast de veelvouden. Zo blijft de standaardmaat bereikbaar nadat je ze
// verlaten hebt: van 350 terug naar 330 (een blikje) en dan pas naar 300.
//
// volgendeStapwaarde(huidig, richting, { stap, min, max, stops }) -> de nieuwe waarde, begrensd op min en max.
// richting: +1 of -1.
export function volgendeStapwaarde(huidig, richting, { stap, min = -Infinity, max = Infinity, stops = [] } = {}) {
  const EPS = 1e-9;
  const rond = (n) => Math.round(n * 1e6) / 1e6;
  const deel = huidig / stap;
  const opRaster = richting > 0 ? (Math.floor(deel + EPS) + 1) * stap : (Math.ceil(deel - EPS) - 1) * stap;
  let doel = rond(opRaster);
  for (const s of stops) {
    if (typeof s !== 'number' || !Number.isFinite(s)) continue;
    if (richting > 0 && s > huidig + EPS && s < doel) doel = s;
    if (richting < 0 && s < huidig - EPS && s > doel) doel = s;
  }
  return Math.min(max, Math.max(min, doel));
}
