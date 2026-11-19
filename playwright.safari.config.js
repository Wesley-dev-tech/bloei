// De Safari-tests (tests/e2e/x-safari-*.spec.js) in de WebKit-motor van Playwright, in het formaat van een iPhone.
// Dezelfde bouw, poort en bouwmap als de gewone ronde (playwright.config.js: PW_POORT en PW_OUTDIR); alleen de motor en de testen verschillen.
// De drie gewone rondes draaien dezelfde bestanden in Chromium mee, deze config voegt WebKit toe:
//   PW_POORT=4671 PW_OUTDIR=<eigen map> npx playwright test -c playwright.safari.config.js
// Zonder globale opstart (die opent Chromium): elke test zet zelf zijn gegevens in de database van de app.
// Let op: WebKit op Windows is niet Safari op een iPhone; wat hier groen is, moet nog op het toestel zelf bevestigd worden.
import basis from './playwright.config.js';

export default {
  ...basis,
  testMatch: /x-safari-.*\.spec\.js$/,
  globalSetup: undefined,
  use: {
    ...basis.use,
    browserName: 'webkit',
    channel: undefined,
    storageState: undefined,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
};
