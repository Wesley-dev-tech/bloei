// Kopieert de opstartschermen uit bloei-huisstijl/ naar public/ (ongewijzigd) en tekent de app-iconen en de iPad-opstartschermen opnieuw.
// Draaien: node scripts/kopieer-pwa.mjs   (heeft Playwright en een browser nodig)
// Veilig: alles wordt eerst in een tijdelijke map (.pwa-nieuw/) gemaakt. Pas als alles gelukt is, vervangen icons/ en splash/
// in public/ de oude. Mislukt er iets, dan blijft public/ precies zoals het was.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// iPad: opstartschermen (staand en liggend, licht en Nacht) en de iPad-iconen worden hier getekend, in dezelfde
// stijl als de iPhone-beelden: vlak in de themakleur met het beeldmerk gecentreerd (iets boven het midden).
// Het beeldmerk is ongeveer 30% van de korte zijde breed en staat met zijn middelpunt op 42% van de hoogte.
// Elk beeld is één vlak met een logo en blijft daardoor klein (enkele kB).
// Formaten in punten (breed x hoog, staand) bij pixelverhouding 2; de media-regels in index.html horen daarbij.
export const IPAD_FORMATEN = [
  [744, 1133], // iPad mini (6e generatie)
  [768, 1024], // iPad 9,7" en mini 5
  [810, 1080], // iPad 10,2"
  [820, 1180], // iPad Air 10,9" / 11", iPad 10e generatie
  [834, 1194], // iPad Pro 11"
  [834, 1210], // iPad Pro 11" (nieuwste)
  [1024, 1366], // iPad Pro 12,9" / Air 13"
  [1032, 1376], // iPad Pro 13" (nieuwste)
];
const THEMAS = [
  { naam: 'poeder', achtergrond: '#FBF7F4', logo: 'bloei-mark.svg' },
  { naam: 'nacht', achtergrond: '#1F1720', logo: 'bloei-mark-nacht.svg' },
];

// Alle app-iconen: het beeldmerk in de kleuren van het logo in de zijbalk (bloei-mark.svg) op porselein, niet op aubergine.
// De PNG's in bloei-huisstijl/icons/ (bron van de eigenaar) tonen de nachtkleuren op aubergine en worden daarom hier opnieuw
// getekend; het favicon is een eigen svg met dezelfde tekening. Volle vlakken: iOS en Android ronden zelf af.
// Het beeldmerk is 72% van de zijde breed (maskable: 64%, ruim binnen de veilige cirkel) en staat op zijn optische
// middelpunt (de blaadjes lopen in de tekening van y=10 tot y=82, dus het midden ligt op y=46 van 100).
const PORSELEIN = '#FBF7F4';
const APP_ICONEN = [
  { px: 180, naam: 'apple-touch-icon.png', aandeel: 0.72 },
  { px: 167, naam: 'apple-touch-icon-167x167.png', aandeel: 0.72 },
  { px: 152, naam: 'apple-touch-icon-152x152.png', aandeel: 0.72 },
  { px: 192, naam: 'icon-192.png', aandeel: 0.72 },
  { px: 512, naam: 'icon-512.png', aandeel: 0.72 },
  { px: 512, naam: 'icon-maskable-512.png', aandeel: 0.64 },
];

// AN-10 (BESLISSING 423): het meldingsicoon voor de statusbalk van Android (de optie badge van showNotification). Android gebruikt
// alleen de alfa: een effen silhouet van het beeldmerk op een doorzichtige achtergrond, 96x96 px. iOS gebruikt het niet.
export const BADGE = { px: 96, naam: 'badge-96.png', aandeel: 0.86 };

const zonderMetadata = (svg) => svg.replace(/\s+xmlns:c2pa="[^"]*"/g, '').replace(/<metadata>[\s\S]*?<\/metadata>\s*/g, '');

// Vervangt public/<map> door de nieuwe map. De oude gaat eerst opzij en komt terug als het vervangen mislukt.
function verwissel(wortel, nieuw, maps) {
  const oud = join(wortel, '.pwa-oud');
  rmSync(oud, { recursive: true, force: true });
  mkdirSync(oud, { recursive: true });
  const verplaatst = [];
  try {
    for (const map of maps) {
      const doel = join(wortel, 'public', map);
      if (existsSync(doel)) renameSync(doel, join(oud, map));
      verplaatst.push(map);
      renameSync(join(nieuw, map), doel);
    }
  } catch (fout) {
    for (const map of verplaatst) {
      const doel = join(wortel, 'public', map);
      if (existsSync(join(oud, map))) {
        rmSync(doel, { recursive: true, force: true });
        renameSync(join(oud, map), doel);
      }
    }
    throw fout;
  }
  rmSync(oud, { recursive: true, force: true });
}

export async function bouwPwa({ wortel, log = console.log } = {}) {
  const nieuw = join(wortel, '.pwa-nieuw');
  rmSync(nieuw, { recursive: true, force: true });
  try {
    for (const map of ['icons', 'splash']) {
      const van = join(wortel, 'bloei-huisstijl', map);
      const naar = join(nieuw, map);
      mkdirSync(naar, { recursive: true });
      for (const naam of readdirSync(van)) {
        copyFileSync(join(van, naam), join(naar, naam));
        // Het icoon bevat een c2pa-herkomststempel (metadata met een naamruimte-tekst, geen verzoek). Weg uit de
        // kopie in public/; het getekende icoon blijft ongewijzigd. De bron in bloei-huisstijl/ blijft zoals ze is.
        if (naam.endsWith('.svg')) writeFileSync(join(naar, naam), zonderMetadata(readFileSync(join(naar, naam), 'utf8')));
      }
      log(`${map}: ${readdirSync(naar).length} bestanden gekopieerd`);
    }

    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
    try {
      const pagina = await browser.newPage();
      const svgUrl = (pad) =>
        'data:image/svg+xml;base64,' + Buffer.from(zonderMetadata(readFileSync(join(wortel, 'bloei-huisstijl', pad), 'utf8'))).toString('base64');

      async function teken(breed, hoog, html, bestand) {
        await pagina.setViewportSize({ width: breed, height: hoog });
        await pagina.setContent(`<!doctype html><style>html,body{margin:0;width:${breed}px;height:${hoog}px;overflow:hidden}</style>${html}`);
        await pagina.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
        await pagina.screenshot({ path: bestand, type: 'png' });
      }

      let aantal = 0;
      for (const [b, h] of IPAD_FORMATEN) {
        for (const [pb, ph] of [[b * 2, h * 2], [h * 2, b * 2]]) {
          for (const thema of THEMAS) {
            const zijde = Math.min(pb, ph) * 0.3;
            const html = `<body style="background:${thema.achtergrond}"><img src="${svgUrl(`logo/${thema.logo}`)}" style="position:absolute;width:${zijde}px;height:${zijde}px;left:${(pb - zijde) / 2}px;top:${ph * 0.42 - zijde / 2}px">`;
            await teken(pb, ph, html, join(nieuw, 'splash', `splash-${thema.naam}-${pb}x${ph}.png`));
            aantal += 1;
          }
        }
      }
      log(`splash: ${aantal} iPad-opstartschermen getekend`);

      for (const { px, naam, aandeel } of APP_ICONEN) {
        const zijde = px * aandeel;
        const html = `<body style="background:${PORSELEIN}"><img src="${svgUrl('logo/bloei-mark.svg')}" style="position:absolute;width:${zijde}px;height:${zijde}px;left:${(px - zijde) / 2}px;top:${(px - zijde) / 2 + ((50 - 46) / 100) * zijde}px">`;
        await teken(px, px, html, join(nieuw, 'icons', naam));
      }
      log(`icons: ${APP_ICONEN.length} app-iconen getekend (beeldmerk in logokleuren op porselein)`);
      await tekenBadge(pagina, svgUrl('logo/bloei-mark.svg'), join(nieuw, 'icons', BADGE.naam));
      log(`icons: ${BADGE.naam} getekend (silhouet voor de meldingen op Android)`);
    } finally {
      await browser.close();
    }

    // Favicon: afgerond vierkant van porselein met hetzelfde beeldmerk, iets groter dan in het app-icoon omdat het klein getoond wordt.
    const blaadjes = readFileSync(join(wortel, 'bloei-huisstijl', 'logo', 'bloei-mark.svg'), 'utf8').match(/<g[\s\S]*?<\/g>/)[0];
    writeFileSync(
      join(nieuw, 'icons', 'favicon.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${PORSELEIN}"/><g transform="translate(9 9.5) scale(.82)">${blaadjes}</g></svg>\n`,
    );
    log('icons: favicon.svg geschreven');

    // Alles is gelukt: pas nu vervangen.
    mkdirSync(join(wortel, 'public'), { recursive: true });
    verwissel(wortel, nieuw, ['icons', 'splash']);
  } finally {
    rmSync(nieuw, { recursive: true, force: true });
  }
}

// Tekent het meldingsicoon: het beeldmerk volledig zwart (alleen de vorm telt) op een doorzichtige achtergrond.
export async function tekenBadge(pagina, svgBron, bestand) {
  const { px, aandeel } = BADGE;
  const zijde = px * aandeel;
  await pagina.setViewportSize({ width: px, height: px });
  await pagina.setContent(
    `<!doctype html><style>html,body{margin:0;width:${px}px;height:${px}px;overflow:hidden;background:transparent}</style>` +
      `<img src="${svgBron}" style="position:absolute;width:${zijde}px;height:${zijde}px;left:${(px - zijde) / 2}px;top:${(px - zijde) / 2 + ((50 - 46) / 100) * zijde}px;filter:brightness(0)">`,
  );
  await pagina.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await pagina.screenshot({ path: bestand, type: 'png', omitBackground: true });
}

// Alleen het meldingsicoon (de andere iconen en de opstartschermen blijven onaangeroerd): node scripts/kopieer-pwa.mjs --badge
export async function bouwBadge({ wortel, log = console.log } = {}) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  try {
    const pagina = await browser.newPage();
    const bron = 'data:image/svg+xml;base64,' + Buffer.from(zonderMetadata(readFileSync(join(wortel, 'bloei-huisstijl', 'logo', 'bloei-mark.svg'), 'utf8'))).toString('base64');
    mkdirSync(join(wortel, 'public', 'icons'), { recursive: true });
    await tekenBadge(pagina, bron, join(wortel, 'public', 'icons', BADGE.naam));
    log(`icons: ${BADGE.naam} getekend`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const badge = process.argv.includes('--badge');
  const pad = process.argv.slice(2).find((a) => !a.startsWith('--'));
  // Eventueel een andere wortel als argument (om op een kopie te proberen).
  const wortel = pad ? resolve(pad) : join(import.meta.dirname, '..');
  if (badge) await bouwBadge({ wortel });
  else await bouwPwa({ wortel });
}
