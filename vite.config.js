import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cspBeleid, dienstOrigin as leesDienstOrigin, inlineScriptHashes } from './scripts/csp.mjs';
import { PLAATS_ORIGIN, WEER_ORIGIN } from './src/logica/weer.js';

const WORTEL = import.meta.dirname;

// ============================================================ De demoversie (BESLISSING 364)
// Eén code, twee versies. De demo staat aan als VITE_DEMO bij het bouwen of starten precies 'true' is: lokaal met --mode demo
// (dat leest .env.demo), op Vercel met de variabele VITE_DEMO=true bij het demoproject. Zonder die variabele is alles zoals altijd:
// de echte versie houdt haar index.html (met noindex), haar robots.txt (Disallow: /) en haar manifest ongewijzigd.
export const isDemo = (env = {}) => env.VITE_DEMO === 'true';

export const DEMO_TITEL = 'Bloei · demo';
export const DEMO_BESCHRIJVING =
  'Bloei is een rustig dagboek voor eten, drinken, supplementen en gewicht. Deze demo draait helemaal in je browser, met verzonnen voorbeeldgegevens.';
// Het Open Graph-beeld (1200×630, het beeldmerk op porselein). Gemaakt met: node scripts/maak-og-beeld.mjs. Komt alleen in de demobouw.
export const OG_BEELD = 'og-bloei.png';
export const OG_BRON = join('demo-publiek', OG_BEELD);

// Het publieke adres van de demo, voor og:url en een absoluut og:image. DEMO_ADRES (bv. https://bloei-demo.vercel.app), anders
// het productieadres dat Vercel bij het bouwen meegeeft (VERCEL_PROJECT_PRODUCTION_URL, zonder https://). Leeg = relatieve adressen.
export function demoAdres(env = {}) {
  const ruw = String(env.DEMO_ADRES || env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (!ruw) return '';
  try {
    const url = new URL(/^https?:\/\//.test(ruw) ? ruw : 'https://' + ruw);
    if (url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
  } catch {
    /* geen geldig adres */
  }
  return '';
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// De apk (BESLISSING 515): VITE_APK is '1' als public/bloei.apk bij het bouwen bestaat, en nooit in de demo. De app toont de
// downloadknop op Android alleen met die vlag, zodat er zonder bestand geen dode knop staat. Geen verzoek bij het opstarten.
export const apkVlag = (demo, wortel = WORTEL) => (!demo && existsSync(join(wortel, 'public', 'bloei.apk')) ? '1' : '');

// robots.txt per versie: de echte versie wil niet in een zoekmachine (Disallow: /, zoals public/robots.txt), de demo wel.
export function robotsTxt(demo) {
  return demo ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
}

// index.html per versie. De echte versie blijft letterlijk gelijk. De demo: geen noindex, een eigen titel, een beschrijving en
// Open Graph- en Twitter-meta's. Het inline thema-script blijft onaangeroerd, zodat de CSP-hash in vercel.json voor beide geldt.
export function versieHtml(html, { demo = false, adres = '' } = {}) {
  if (!demo) return html;
  const robots = /<meta name="robots" content="noindex, nofollow" \/>/;
  const titel = /<title>Bloei<\/title>/;
  const appTitel = /<meta name="apple-mobile-web-app-title" content="Bloei" \/>/;
  for (const patroon of [robots, titel, appTitel]) {
    if (!patroon.test(html)) throw new Error('bloei-demo-versie: ' + patroon + ' niet gevonden in index.html');
  }
  const beeld = (adres ? adres + '/' : '/') + OG_BEELD;
  const meta = [
    `<title>${escHtml(DEMO_TITEL)}</title>`,
    `<meta name="description" content="${escHtml(DEMO_BESCHRIJVING)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Bloei" />`,
    `<meta property="og:locale" content="nl_BE" />`,
    `<meta property="og:title" content="${escHtml(DEMO_TITEL)}" />`,
    `<meta property="og:description" content="${escHtml(DEMO_BESCHRIJVING)}" />`,
    adres ? `<meta property="og:url" content="${escHtml(adres + '/')}" />` : null,
    `<meta property="og:image" content="${escHtml(beeld)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Het beeldmerk van Bloei: drie blaadjes op porselein" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escHtml(DEMO_TITEL)}" />`,
    `<meta name="twitter:description" content="${escHtml(DEMO_BESCHRIJVING)}" />`,
    `<meta name="twitter:image" content="${escHtml(beeld)}" />`,
  ]
    .filter(Boolean)
    .join('\n    ');
  return html
    .replace(robots, '<meta name="robots" content="index, follow" />')
    .replace(appTitel, '<meta name="apple-mobile-web-app-title" content="Bloei demo" />')
    .replace(titel, meta);
}

// Het manifest per versie. De echte versie houdt precies haar huidige manifest. De demo krijgt een eigen naam, id en start_url,
// zodat een geïnstalleerde demo geen tweede "Bloei" lijkt.
// Bewust geen `id` in het manifest van de echte versie (AN-11): zonder `id` is de identiteit van de app gelijk aan de start_url, en een `id` toevoegen
// zou bij een bestaande installatie een tweede app kunnen maken; tests/logica/demo.test.js legt vast dat het manifest zo blijft.
export function manifestVoor(demo) {
  const basis = {
    name: 'Bloei',
    short_name: 'Bloei',
    description: 'Een dagboek voor eten, drinken en gewicht.',
    lang: 'nl-BE',
    dir: 'ltr',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    // Een manifest kent geen CSS-variabelen: Porselein staat hier als hex (HUISSTIJL §9).
    background_color: '#FBF7F4',
    theme_color: '#FBF7F4',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  if (!demo) return basis;
  return { ...basis, id: '/?app=bloei-demo', name: 'Bloei demo', short_name: 'Bloei demo', description: 'De demo van Bloei, met verzonnen voorbeeldgegevens.', start_url: '/?app=bloei-demo' };
}

// De plugin: index.html per versie (ook in dev), en bij een demobouw robots.txt en het Open Graph-beeld in de uitvoermap.
export function demoVersie({ demo = false, adres = '' } = {}) {
  let uit = '';
  let bouw = false;
  return {
    name: 'bloei-demo-versie',
    configResolved(config) {
      uit = resolve(config.root, config.build.outDir);
      bouw = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!/(^|[\\/])index\.html$/.test(ctx?.filename ?? 'index.html')) return html;
        return versieHtml(html, { demo, adres });
      },
    },
    closeBundle() {
      if (!demo || !bouw) return;
      writeFileSync(join(uit, 'robots.txt'), robotsTxt(true));
      copyFileSync(join(WORTEL, OG_BRON), join(uit, OG_BEELD));
    },
  };
}

// Haalt de c2pa-metadata (een herkomststempel met een naamruimte-tekst) uit de svg's van de huisstijlmap
// voordat ze in de bundel komen. Alleen metadata, geen verzoek; zo blijft er ook geen url in de bundel.
export function zonderMetadata(svg) {
  return svg
    .replace(/\s+xmlns:c2pa="[^"]*"/g, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>\s*/g, '')
    // Een inline style-attribuut mag niet onder de CSP: dezelfde regel staat als klasse in layout.css.
    .replace(/\sstyle="mix-blend-mode:\s*multiply;?"/g, ' class="mengen"');
}

function svgZonderMetadata() {
  return {
    name: 'bloei-svg-zonder-metadata',
    enforce: 'pre',
    load(id) {
      if (!/bloei-huisstijl[\\/].*\.svg\?raw$/.test(id)) return null;
      const bron = readFileSync(id.replace(/\?raw$/, ''), 'utf8');
      return 'export default ' + JSON.stringify(zonderMetadata(bron));
    },
  };
}

// Content-Security-Policy als <meta> in de gebouwde pagina's (niet in dev: de dev-server van Vite heeft
// inline scripts nodig). De hash is die van het inline thema-script in index.html.
// Het beleid zelf staat in scripts/csp.mjs; vercel.json stuurt hetzelfde beleid als kop, met frame-ancestors erbij
// (dat kan niet in een meta). De meta blijft: ze beperkt connect-src tot precies de meldingsdienst, de weerdienst en de dienst voor de plaatsnaam en beschermt ook
// een gebouwde versie die zonder die koppen wordt bekeken (vite preview, de schermtests).
function csp() {
  // Het adres van de push-dienst komt alleen in connect-src als VITE_PUSH_URL bij het bouwen is ingevuld (BESLISSING 38).
  let dienstOrigin = '';
  // De weerdienst (Open-Meteo) en de dienst voor de naam van de gemeente (Nominatim van OpenStreetMap), beide in src/data/weer.js: de enige andere
  // adressen waarmee de app verbindt. Niet in de demo.
  let weerOrigin = '';
  let plaatsOrigin = '';
  return {
    name: 'bloei-csp',
    apply: 'build',
    configResolved(config) {
      // De demo (BESLISSING 364) verbindt met geen enkele dienst: connect-src 'self', ook als VITE_PUSH_URL gezet is.
      dienstOrigin = isDemo(config.env) ? '' : leesDienstOrigin(config.env?.VITE_PUSH_URL);
      weerOrigin = isDemo(config.env) ? '' : WEER_ORIGIN;
      plaatsOrigin = isDemo(config.env) ? '' : PLAATS_ORIGIN;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const beleid = cspBeleid({ scriptHashes: inlineScriptHashes(html), connect: [dienstOrigin, weerOrigin, plaatsOrigin] });
        const charset = /(<meta charset="utf-8"\s*\/?>)/i;
        let uit = html;
        if (!/http-equiv="Content-Security-Policy"/i.test(uit)) {
          uit = uit.replace(charset, (m) => m + '\n    <meta http-equiv="Content-Security-Policy" content="' + beleid + '" />');
        }
        if (!/name="referrer"/.test(uit)) {
          uit = uit.replace(charset, (m) => m + '\n    <meta name="referrer" content="no-referrer" />');
        }
        return uit;
      },
    },
  };
}

// Wat gebouwd wordt. De stijlpagina (stijl.html) is een hulpmiddel voor de bouw en hoort niet online: ze komt alleen in
// een testbouw, als BLOEI_STIJLPAGINA=1 (playwright.config.js zet dat voor de schermtests). In dev toont de dev-server
// stijl.html altijd, los van deze lijst.
export function invoer(env = process.env) {
  return env.BLOEI_STIJLPAGINA === '1' ? { main: 'index.html', stijl: 'stijl.html' } : { main: 'index.html' };
}

export default defineConfig(({ mode }) => {
  // Alle variabelen (bestanden .env, .env.<mode> en de omgeving zelf): VITE_DEMO beslist welke versie er gebouwd wordt.
  const env = loadEnv(mode, WORTEL, '');
  const demo = isDemo(env);
  return {
    // De app staat op de wortel van een eigen adres (Vercel: https://<project>.vercel.app/ of een eigen domein).
    base: '/',
    // npm run dev:demo draait naast de echte dev-server: een eigen cache voor de voorgebundelde pakketten, zodat de twee
    // elkaar niet storen. Met --mode demo komt de bouw in dist-demo (npm run build:demo); op Vercel (VITE_DEMO=true) in dist.
    cacheDir: demo ? 'node_modules/.vite-demo' : undefined,
    // In de demo zijn de meldingsdienst en zijn sleutel altijd leeg, ook als ze per ongeluk gezet zijn: ze komen niet in de bundel.
    // Met public/bloei.apk (nooit in de demo) komt daar VITE_APK='1' bij; zonder het bestand blijft define zoals het was (de echte versie: geen define).
    define: demo
      ? { 'import.meta.env.VITE_PUSH_URL': '""', 'import.meta.env.VITE_VAPID_PUBLIEK': '""' }
      : apkVlag(demo)
        ? { 'import.meta.env.VITE_APK': JSON.stringify('1') }
        : undefined,
    build: {
      outDir: mode === 'demo' ? 'dist-demo' : 'dist',
      // Geen bronkaarten in de publieke site.
      sourcemap: false,
      // AN-14 (BESLISSING 423): de minimumversies uitdrukkelijk. Chrome/WebView 117 (subgrid), Firefox 121 (:has()), Safari en iOS 16.4
      // (zoals de standaard van Vite). De js is daarmee gelijk aan die met de standaard (vergeleken bij het invoeren). De css houdt de
      // standaard van Vite 8 (baseline-widely-available): met het hogere doel werd ze 6 kB kleiner en dus anders, ook op iPhone.
      target: ['chrome117', 'edge117', 'firefox121', 'safari16.4', 'ios16.4'],
      cssTarget: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
      rollupOptions: {
        input: invoer(),
      },
    },
    plugins: [
      svgZonderMetadata(),
      demoVersie({ demo, adres: demo ? demoAdres(env) : '' }),
      csp(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectRegister: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,webmanifest,txt}'],
          // De opstartschermen (splash/) zijn groot en alleen nodig bij het installeren: niet offline bewaren.
          // Het Open Graph-beeld van de demo is voor sociale netwerken, niet voor de app.
          // De apk (BESLISSING 515) is een download, geen onderdeel van de app, en .well-known/ is voor Android (assetlinks.json): nooit offline bewaren.
          globIgnores: ['splash/**', OG_BEELD, 'bloei.apk', '.well-known/**'],
        },
        manifest: manifestVoor(demo),
      }),
    ],
    test: {
      include: ['tests/logica/**/*.test.js', 'tests/ui/**/*.test.js', 'tests/pwa/**/*.test.js', 'tests/worker/**/*.test.js'],
      passWithNoTests: true,
      // Vaste tijdzone voor de hele run (BESLISSING 408); tests/vitest-tijdzone.js controleert ze in elke worker.
      env: { TZ: 'Europe/Brussels' },
      setupFiles: ['tests/vitest-tijdzone.js'],
    },
  };
});
