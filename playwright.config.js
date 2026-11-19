import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Schermtests draaien tegen een gebouwde app, in het formaat van een iPhone (390×844).
//
// Drie rondes (BESLISSING 408: nul rood en nul overgeslagen), elk met een eigen bouw, bouwmap en poort:
//   gewoon  npm run e2e        de echte bouw zonder meldingsdienst; alle tests zonder tag @demo of @push
//   demo    npm run e2e:demo   bouw met --mode demo (.env.demo, VITE_DEMO=true); alleen tests met de tag @demo
//   push    npm run e2e:push   bouw met een NEP-meldingsdienst (nooit het echte adres); alleen tests met de tag @push
//   npm run e2e:alles draait de drie na elkaar en faalt bij één rode of één overgeslagen test (tests/rondes.mjs).
// Een test die alleen in de demo of alleen met een meldingsdienst kan draaien, krijgt een tag in plaats van een test.skip:
//   test.describe('de demo', { tag: '@demo' }, () => { ... });      test.describe('met push-dienst', { tag: '@push' }, () => { ... });
// Rechtstreeks: PW_RONDE=demo npx playwright test c-demo  (zonder PW_RONDE: gewoon).
// PW_POORT en PW_OUTDIR kiezen poort en bouwmap; standaard per ronde een eigen poort en een map in de tempmap van het systeem.
// De config zet beide terug in process.env, zodat tests en tests/stand.js dezelfde waarden lezen.

export const RONDES = {
  gewoon: { poort: '4173', grepInvert: /@demo|@push/ },
  demo: { poort: '4177', grep: /@demo/ },
  push: { poort: '4178', grep: /@push/ },
};
// Een verzonnen meldingsdienst voor de push-ronde: localhost op een poort waar niets luistert; de tests vangen elk verzoek
// ernaar op met page.route (c-meldingen.spec.js). De sleutel is 65 verzonnen bytes in base64url (geen echte VAPID-sleutel).
export const NEP_DIENST = 'http://localhost:5299';
export const NEP_VAPID = 'B' + 'A'.repeat(86);

const RONDE = process.env.PW_RONDE || 'gewoon';
if (!RONDES[RONDE]) throw new Error(`Onbekende PW_RONDE "${RONDE}" (kies gewoon, demo of push)`);
const POORT = process.env.PW_POORT || RONDES[RONDE].poort;
const OUTDIR = resolve(process.env.PW_OUTDIR || join(tmpdir(), 'bloei-pw', `${RONDE}-${POORT}`));
process.env.PW_RONDE = RONDE;
process.env.PW_POORT = POORT;
process.env.PW_OUTDIR = OUTDIR;

// De bouw en de tests erven deze variabelen. Een waarde uit de shell telt niet: elke ronde zet precies haar eigen versie.
// (Vite laat een variabele uit de omgeving voorgaan op .env-bestanden; een lege waarde betekent "geen".)
process.env.VITE_DEMO = RONDE === 'demo' ? 'true' : '';
process.env.VITE_PUSH_URL = RONDE === 'push' ? NEP_DIENST : '';
process.env.VITE_VAPID_PUBLIEK = RONDE === 'push' ? NEP_VAPID : '';
// Een testbouw bevat ook de stijlpagina (stijl.html): c-skelet en a-supplementkaart openen ze. De productiebouw (Vercel)
// laat ze weg (vite.config.js, invoer()).
process.env.BLOEI_STIJLPAGINA = '1';

const MODUS = RONDE === 'demo' ? ' --mode demo' : '';
const bouw = `npx vite build${MODUS} --outDir "${OUTDIR}" --emptyOutDir && npx vite preview${MODUS} --outDir "${OUTDIR}" --port ${POORT} --strictPort`;

// De stand na de globale opstart, per poort (tests/stand.js leest PW_POORT).
const { STAND_BESTAND } = await import('./tests/stand.js');

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/globaal-opstart.js',
  grep: RONDES[RONDE].grep,
  grepInvert: RONDES[RONDE].grepInvert,
  fullyParallel: false,
  workers: 1,
  // Harde grens per test: een test die vastloopt (bijv. wachtend op een systeemvenster) faalt na 90 s in plaats van te blijven hangen.
  timeout: 90000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${POORT}/`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    // Eerste start: een lege database toont het welkomscherm. De bestaande tests verwachten meteen een tabblad; de globale
    // opstart (tests/globaal-opstart.js) bewaart een stand met start.klaar = true in de database van de app zelf (BESLISSING 288).
    // Een test voor het welkomscherm begint met test.use({ storageState: { cookies: [], origins: [] } }).
    storageState: STAND_BESTAND,
    locale: 'nl-BE',
    timezoneId: 'Europe/Brussels',
    // PW_CHANNEL=chrome gebruikt de geïnstalleerde Chrome in plaats van de Playwright-browser.
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: bouw,
    url: `http://localhost:${POORT}/`,
    // Nooit een server hergebruiken: die kan een oudere bouw of een andere ronde serveren. Is de poort bezet, dan faalt de run.
    reuseExistingServer: false,
    timeout: 180000,
  },
});
