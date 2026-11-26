// Kopieert alleen de nodige huisstijlbestanden uit node_modules (HUISSTIJL.md §4 en §5):
// vier lettertypes naar fonts/ en de toegelaten Font Awesome-iconen naar src/iconen/.
// Gebruik: npm run huisstijl
// Veilig: dit script wist nooit een bestand. Het werkt alleen bij en voegt toe. Staat er in src/iconen een icoon dat niet in de
// lijst ICONEN hieronder staat, dan stopt het met een duidelijke fout vóór er iets geschreven is (voeg het icoon dan aan de lijst toe).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LETTERTYPES = [
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2', 'cormorant-garamond-500.woff2'],
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2', 'cormorant-garamond-600.woff2'],
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2', 'cormorant-garamond-500-italic.woff2'],
  ['@fontsource-variable/jost/files/jost-latin-wght-normal.woff2', 'jost-variable.woff2'],
];

// Alle iconen die de app gebruikt (HUISSTIJL.md §5 plus de latere toevoegingen). Geen enkel ander icoon.
export const ICONEN = {
  solid: [
    'sun', 'book-open', 'glass-water', 'weight-scale', 'ellipsis',
    'mug-saucer', 'apple-whole', 'bowl-food', 'cookie-bite', 'utensils', 'moon',
    'mug-hot', 'lemon', 'bottle-water',
    'seedling', 'award', 'camera', 'pen', 'heart',
    'chevron-left', 'chevron-right', 'rotate-left', 'sliders', 'lock',
    // Toegevoegd op vraag van de eigenaar (BESLISSING 131): icoon van het tabblad Supplementen.
    'capsules',
    // Toegevoegd op vraag van de eigenaar (BESLISSING 136): de home-knop naar Vandaag.
    'house',
    // Later toegevoegd voor schermen, instellingen, delen, meldingen en de vergrendeling.
    'arrow-up-from-bracket', 'bell', 'bullseye', 'calendar-day', 'calendar-days', 'circle-info', 'circle-question',
    'file-lines', 'fingerprint', 'floppy-disk', 'palette', 'plus', 'syringe', 'trash-can', 'user', 'xmark',
    // Later toegevoegd: een eigen icoon per medaille (0.4.5), het weerbericht (0.4.8) en de medailles voor notities en verslagen (0.5.8).
    'align-left', 'book', 'book-bookmark', 'bottle-droplet', 'bowl-rice', 'box-archive', 'bread-slice', 'briefcase', 'bucket', 'burst',
    'cake-candles', 'calendar', 'calendar-check', 'calendar-plus', 'calendar-week', 'carrot', 'certificate', 'champagne-glasses', 'check-double', 'church',
    'circle-check', 'clipboard', 'clipboard-check', 'clipboard-list', 'cloud', 'cloud-bolt', 'cloud-moon', 'cloud-rain', 'cloud-showers-heavy', 'cloud-sun',
    'cross', 'crown', 'door-open', 'dove', 'droplet', 'egg', 'envelope', 'face-kiss-wink-heart', 'faucet-drip', 'feather-pointed',
    'file-circle-check', 'fire', 'flag', 'folder-open', 'gauge', 'gear', 'gem', 'ghost', 'gift', 'glass-water-droplet',
    'graduation-cap', 'hand-holding-droplet', 'hand-holding-heart', 'hand-holding-medical', 'hands-clapping', 'handshake-simple', 'heart-circle-plus', 'holly-berry', 'horse', 'hourglass-half',
    'infinity', 'kitchen-set', 'list-check', 'medal', 'message', 'mobile-screen-button', 'mountain', 'mountain-sun', 'note-sticky', 'paper-plane', 'peace',
    'pen-clip', 'pen-fancy', 'pen-nib', 'pen-to-square', 'person-hiking', 'person-running', 'person-walking', 'pills', 'plate-wheat',
    'prescription-bottle', 'prescription-bottle-medical', 'quote-left', 'rainbow', 'ranking-star', 'rocket', 'ruler', 'scale-balanced', 'scroll', 'shoe-prints',
    'smog', 'snowflake', 'snowman', 'spa', 'square-check', 'stairs', 'star', 'tablets', 'tree', 'trophy',
    'vial', 'water', 'weight-hanging', 'wind',
  ],
  regular: ['heart', 'bell'],
};

const lijstBestanden = (map) => (existsSync(map) ? readdirSync(map).filter((n) => n.endsWith('.svg')) : []);

export function kopieerHuisstijl({ wortel, nm = join(wortel, 'node_modules'), log = console.log } = {}) {
  const iconenMap = join(wortel, 'src', 'iconen');

  // 1. Controleer alles vóór er iets geschreven wordt.
  const bestaand = {};
  for (const stijl of Object.keys(ICONEN)) {
    bestaand[stijl] = lijstBestanden(join(iconenMap, stijl));
    const onbekend = bestaand[stijl].filter((n) => !ICONEN[stijl].includes(n.replace(/\.svg$/, '')));
    if (onbekend.length) {
      throw new Error(
        `Gestopt, er is niets gewijzigd: src/iconen/${stijl} bevat ${onbekend.join(', ')}, dat niet in de lijst ICONEN staat. ` +
          'Voeg die iconen aan de lijst toe in scripts/kopieer-huisstijl.mjs.',
      );
    }
    for (const naam of ICONEN[stijl]) {
      if (!existsSync(join(nm, '@fortawesome/fontawesome-free/svgs', stijl, naam + '.svg'))) {
        throw new Error('Gestopt, er is niets gewijzigd: icoon ontbreekt in Font Awesome: ' + stijl + '/' + naam);
      }
    }
  }
  for (const [bron] of LETTERTYPES) {
    if (!existsSync(join(nm, bron))) throw new Error('Gestopt, er is niets gewijzigd: lettertype ontbreekt: ' + bron);
  }

  // 2. Alleen toevoegen en bijwerken.
  mkdirSync(join(wortel, 'fonts'), { recursive: true });
  for (const [bron, doel] of LETTERTYPES) {
    copyFileSync(join(nm, bron), join(wortel, 'fonts', doel));
    log('font  ' + doel);
  }
  for (const stijl of Object.keys(ICONEN)) {
    const doelmap = join(iconenMap, stijl);
    mkdirSync(doelmap, { recursive: true });
    for (const naam of ICONEN[stijl]) {
      const bron = join(nm, '@fortawesome/fontawesome-free/svgs', stijl, naam + '.svg');
      // Het licentiecommentaar in het bestand blijft staan; de bestanden blijven onaangeroerd.
      writeFileSync(join(doelmap, naam + '.svg'), readFileSync(bron));
      log('icoon ' + stijl + '/' + naam);
    }
  }

  // 3. Naproef: wat er stond, staat er nog.
  for (const stijl of Object.keys(ICONEN)) {
    for (const n of bestaand[stijl]) {
      if (!existsSync(join(iconenMap, stijl, n))) throw new Error('Icoon verdwenen: ' + stijl + '/' + n);
    }
  }
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  kopieerHuisstijl({ wortel: join(dirname(fileURLToPath(import.meta.url)), '..') });
}
