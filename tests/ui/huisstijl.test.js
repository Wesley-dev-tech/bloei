// Bewaakt de huisstijl Bloei (HUISSTIJL.md): lettertypes, iconenlijst, geen kleuren buiten tokens.css,
// geen emoji en geen externe lettertypes.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const wortel = join(import.meta.dirname, '..', '..');

function bestanden(map, uitgesloten = []) {
  const uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (uitgesloten.some((u) => pad.startsWith(u))) continue;
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, uitgesloten));
    else uit.push(pad);
  }
  return uit;
}

const src = join(wortel, 'src');
const data = join(src, 'data');
const code = bestanden(src, [join(src, 'iconen')]).filter((p) => /\.(css|js)$/.test(p));
const codeZonderData = code.filter((p) => !p.startsWith(data + sep));
const wijs = (p) => relative(wortel, p);

describe('huisstijl', () => {
  it('heeft de vier lettertypebestanden', () => {
    for (const f of ['cormorant-garamond-500.woff2', 'cormorant-garamond-600.woff2', 'cormorant-garamond-500-italic.woff2', 'jost-variable.woff2']) {
      expect(existsSync(join(wortel, 'fonts', f)), f).toBe(true);
    }
  });

  it('heeft in src/iconen precies de iconen uit HUISSTIJL.md §5', () => {
    const verwacht = {
      solid: ['sun', 'book-open', 'glass-water', 'weight-scale', 'ellipsis', 'mug-saucer', 'apple-whole', 'bowl-food', 'cookie-bite', 'utensils', 'moon', 'mug-hot', 'lemon', 'bottle-water', 'seedling', 'award', 'camera', 'pen', 'heart', 'chevron-left', 'chevron-right', 'rotate-left', 'sliders', 'lock',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 131): icoon van het tabblad Supplementen.
        'capsules',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 136): de home-knop naar Vandaag.
        'house',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 155): het deelteken van het scherm Delen.
        'arrow-up-from-bracket',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 167): de knop Uitleg.
        'circle-question',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 172): kaart van begrippen voor de instellingen en de schermen eromheen.
        'calendar-day', 'calendar-days', 'user', 'palette', 'file-lines', 'circle-info', 'fingerprint', 'bullseye', 'floppy-disk', 'plus', 'xmark',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 243): de knop Profiel verwijderen.
        'trash-can',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 251): het spuitje van een geplande beurt van een periodiek supplement.
        'syringe',
        // Toegevoegd op vraag van de eigenaar (BESLISSING 320): het belletje van Herinneringen is gevuld, zoals zijn buren op Algemeen.
        'bell',
        // Toegevoegd op vraag van de eigenaar: het tandwiel van Algemeen, op Vandaag en in de zijbalk, nu Algemeen geen tabblad meer is op de telefoon.
        'gear',
        // Toegevoegd op vraag van de eigenaar (0.4.5): elke medaille haar eigen icoon, en de iconen van de feestdagen en de verjaardag.
        'book', 'book-bookmark', 'bottle-droplet', 'bowl-rice', 'bread-slice', 'briefcase', 'bucket', 'burst', 'cake-candles',
        'calendar', 'calendar-check', 'calendar-plus', 'calendar-week', 'carrot', 'certificate', 'champagne-glasses', 'check-double', 'church', 'circle-check',
        'clipboard-check', 'clipboard-list', 'cloud', 'cloud-sun', 'cross', 'crown', 'door-open', 'dove', 'droplet', 'egg',
        'face-kiss-wink-heart', 'faucet-drip', 'feather-pointed', 'fire',
        'flag', 'gauge', 'gem', 'ghost', 'gift', 'glass-water-droplet', 'graduation-cap', 'hand-holding-droplet', 'hand-holding-heart', 'hand-holding-medical',
        'hands-clapping', 'heart-circle-plus', 'holly-berry', 'horse', 'hourglass-half', 'infinity', 'kitchen-set', 'list-check', 'medal',
        'mobile-screen-button', 'mountain', 'mountain-sun', 'note-sticky', 'paper-plane', 'peace', 'pen-to-square', 'person-hiking', 'person-running', 'person-walking',
        'pills', 'plate-wheat', 'prescription-bottle', 'prescription-bottle-medical', 'rainbow', 'ranking-star', 'rocket', 'ruler', 'scale-balanced', 'shoe-prints',
        'snowman', 'spa', 'square-check', 'stairs', 'star', 'tablets', 'tree', 'trophy', 'vial', 'water',
        'weight-hanging', 'wind',
        // De iconen van het weerbericht (0.4.8) zijn weg sinds 0.7.5: het weer heeft eigen tekeningen (eigen/weer-*).
        // Toegevoegd op vraag van de eigenaar (0.5.8): de nieuwe medailles voor notities en verslagen.
        'align-left', 'box-archive', 'clipboard', 'envelope', 'file-circle-check', 'folder-open', 'handshake-simple', 'message', 'pen-clip', 'pen-fancy', 'pen-nib',
        'quote-left', 'scroll',
        // Toegevoegd op vraag van de eigenaar (0.7.0): de thermometer van de kaart Het weer, vorst, en de waarschuwing van het KMI.
        'temperature-half', 'triangle-exclamation'],
      regular: ['heart', 'bell'],
    };
    // BESLISSING 606: een eigen bestand, op vraag van de eigenaar: het teken voor Face ID; de gratis iconenset heeft er geen.
    // BESLISSING 702: en een kan water, om dezelfde reden: de set heeft geen kan, en "Kan water" en "Glas water" mogen niet hetzelfde icoon dragen.
    expect(readdirSync(join(src, 'iconen')).sort()).toEqual(['eigen', 'regular', 'solid']);
    // 0.7.5, op vraag van de eigenaar: elk weerbeeld zijn eigen icoon, allemaal eigen tekeningen in een stijl (weer-*).
    const WEER = ['bewolkt', 'buien', 'buien-licht', 'buien-licht-nacht', 'buien-nacht', 'buien-zwaar', 'buien-zwaar-nacht', 'half-bewolkt', 'half-bewolkt-nacht', 'helder',
      'ijzel', 'mist', 'motregen', 'onweer', 'onweer-hagel', 'onweer-hagel-zwaar', 'onweer-zwaar', 'regen', 'regen-licht', 'regen-zwaar', 'sneeuw', 'sneeuw-licht',
      'sneeuw-zwaar', 'sneeuwbuien', 'sneeuwbuien-nacht', 'sneeuwbuien-zwaar', 'sneeuwbuien-zwaar-nacht', 'storm', 'vorst', 'vrij-helder', 'vrij-zonnig', 'zonnig'].map((naam) => `weer-${naam}.svg`);
    expect(readdirSync(join(src, 'iconen', 'eigen')).sort()).toEqual(['face-id.svg', 'kan-water.svg', ...WEER].sort());
    for (const [stijl, namen] of Object.entries(verwacht)) {
      const aanwezig = readdirSync(join(src, 'iconen', stijl)).map((f) => f.replace(/\.svg$/, '')).sort();
      expect(aanwezig).toEqual([...namen].sort());
    }
  });

  it('bewaart het licentiecommentaar in elk icoon', () => {
    // het eigen bestand (BESLISSING 606) is geen icoon van Font Awesome en draagt een eigen commentaar
    for (const f of bestanden(join(src, 'iconen'))) expect(readFileSync(f, 'utf8'), wijs(f)).toContain(f.replaceAll('\\', '/').includes('/iconen/eigen/') ? 'Eigen tekening voor Bloei' : 'Font Awesome Free');
  });

  it('gebruikt geen hexkleur, rgb( of hsl( in src (behalve src/data)', () => {
    // Het feest (ui/feest.js) tekent confetti, ballonnen en vuurwerk op een canvas. Dat zijn de kleuren van papier en vonken, geen kleuren
    // van de huisstijl: ze horen in elk thema dezelfde te zijn en worden per vonk berekend. Alleen dat ene bestand is uitgezonderd.
    const feest = join(src, 'ui', 'feest.js');
    for (const f of codeZonderData) {
      if (f === feest) continue;
      const tekst = readFileSync(f, 'utf8');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(tekst.replace(/&#\d+;/g, '')), `${wijs(f)}: hexkleur`).toBe(false);
      expect(/\brgba?\(|\bhsla?\(/i.test(tekst), `${wijs(f)}: rgb/hsl`).toBe(false);
    }
  });

  it('gebruikt nergens een emoji', () => {
    for (const f of code) expect(/\p{Extended_Pictographic}/u.test(readFileSync(f, 'utf8')), wijs(f)).toBe(false);
  });

  it('linkt nergens naar fonts.googleapis of een CDN', () => {
    const alles = [...code, join(wortel, 'index.html'), join(wortel, 'stijl.html')];
    for (const f of alles) expect(/fonts\.googleapis|fonts\.gstatic|cdn\./i.test(readFileSync(f, 'utf8')), wijs(f)).toBe(false);
  });

  it('heeft geen verwijzing meer naar de oude stijl in de bestanden van spoor A', () => {
    const eigen = code.filter((p) => /src[\/](ui|stijl)[\/]|stijlpagina\.js$|app\.js$|main\.js$/.test(p));
    for (const f of eigen) expect(/Fraunces|Atkinson|data-kaft|data-modus/.test(readFileSync(f, 'utf8')), wijs(f)).toBe(false);
  });

  it('importeert tokens.css rechtstreeks uit bloei-huisstijl', () => {
    expect(readFileSync(join(src, 'main.js'), 'utf8')).toContain("../bloei-huisstijl/tokens.css");
    expect(readFileSync(join(src, 'stijlpagina.js'), 'utf8')).toContain("../bloei-huisstijl/tokens.css");
    expect(existsSync(join(src, 'stijl', 'tokens.css'))).toBe(false);
  });

  // BESLISSING 609 en 613: de dikkere lijn is goedgekeurd
  it('legt de lijndikte van het eigen Face ID-icoon vast', () => {
    const tekst = readFileSync(join(src, 'iconen', 'eigen', 'face-id.svg'), 'utf8');
    expect(tekst).toContain('viewBox="0 0 512 512"');
    const breedtes = [...tekst.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]);
    expect(breedtes).toEqual(['40']);
  });
});
