// De kleuren en maten van het thema Poeder, gelezen uit bloei-huisstijl/tokens.css. Een verslag is papier: het toont altijd Poeder,
// ook als de app in Salie of Nacht staat. Geen kleurwaarden in de code: alles komt uit de tokens.
import tokensCss from '../../bloei-huisstijl/tokens.css?raw';

let cache = null;
let bron = tokensCss;

// Voor tests: Vitest laat css-bestanden leeg bij ?raw, daar geven we de tekst zelf mee.
export function zetTokensBron(tekst) {
  bron = tekst;
  cache = null;
}

// Alle tokens van het blok :root (het lichte thema Poeder), met var(...) ingevuld.
export function poederTokens() {
  if (cache) return cache;
  const ruw = {};
  for (const blok of bron.matchAll(/^:root\s*\{([\s\S]*?)^\}/gm)) {
    const schoon = blok[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of schoon.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) ruw[m[1]] = m[2].trim();
  }
  const oplossen = (waarde, diepte = 0) => (diepte > 8 ? waarde : waarde.replace(/var\((--[\w-]+)\)/g, (_, naam) => oplossen(ruw[naam] ?? '', diepte + 1)));
  cache = Object.fromEntries(Object.entries(ruw).map(([naam, waarde]) => [naam, oplossen(waarde)]));
  return cache;
}

// Een kleur als [r, g, b] tussen 0 en 1, of null als het token geen hexkleur is.
export function kleur(naam) {
  const waarde = poederTokens()[naam];
  const m = /^#([0-9a-f]{6})$/i.exec(waarde ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// De kleuren van het verslag (BESLISSING 373): de donkere tekstkleur, het gedempte grijs, de lijnen en één accentkleur, lavendel (de kleur van
// Delen), in drie tinten: vol (balken), zacht (tegelvlak, dagband, spoor van de balk) en donker (icoon in de tegel). De rest is wit papier.
export function papierKleuren() {
  const k = (naam) => {
    const c = kleur(naam);
    if (!c) throw new Error('token ' + naam);
    return c;
  };
  // Op papier moeten lijnen ook in zwart-wit te zien zijn: de lijnkleur van de app, voor de helft naar de gedempte tekstkleur toe.
  const lijn = k('--c-line');
  const gedempt = k('--c-text-muted');
  return {
    lijnSterk: lijn.map((v, i) => (v + gedempt[i]) / 2),
    tekst: k('--c-text'),
    gedempt,
    lavendel: { vol: k('--c-share-licht'), zacht: k('--c-share-soft'), donker: k('--c-share') },
  };
}

// Zet de Poeder-tokens op een element, zodat het daaronder (voorbeeld op het scherm) altijd het lichte thema toont.
export function zetPoeder(el) {
  for (const [naam, waarde] of Object.entries(poederTokens())) {
    if (/^--(c|mood|energy|tile|tegel|r|s|fs|lh|dur|ease)-/.test(naam) || naam.startsWith('--bloei-')) el.style.setProperty(naam, waarde);
  }
}
