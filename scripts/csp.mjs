// Eén bron voor de Content-Security-Policy van Bloei.
// - vite.config.js zet het beleid bij het bouwen als <meta> in elke gebouwde pagina, met in connect-src precies de
//   oorsprong van de meldingsdienst (VITE_PUSH_URL, BESLISSING 38) en in script-src de hash van elk inline script.
// - vercel.json stuurt hetzelfde beleid als kop (cspKop), met frame-ancestors erbij (dat kan niet in een meta).
//   vercel.json is statisch en kent het adres van de meldingsdienst niet: de kop laat daarom in connect-src elk
//   https-adres toe, en de meta ernaast beperkt dat tot de dienst. Een browser past beide beleidsregels toe en een
//   verzoek moet door allebei: het strengste wint, een tweede beleid kan nooit iets toelaten wat het eerste verbiedt.
// tests/logica/beveiliging.test.js controleert dat de kop in vercel.json gelijk is aan cspKop(...) hieronder.
import { createHash } from 'node:crypto';

// De hash van elk inline <script> zonder attributen (in index.html: het thema-script).
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => "'sha256-" + createHash('sha256').update(m[1]).digest('base64') + "'",
  );
}

// De oorsprong van de meldingsdienst, of '' als het adres leeg of ongeldig is (alleen https, of http op localhost).
export function dienstOrigin(waarde) {
  try {
    const url = new URL(String(waarde ?? '').trim());
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.origin;
  } catch {
    /* leeg of ongeldig: geen meldingsdienst */
  }
  return '';
}

export function cspBeleid({ scriptHashes = [], connect = [] } = {}) {
  return [
    "default-src 'self'",
    ['script-src', "'self'", ...scriptHashes].join(' '),
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    ['connect-src', "'self'", ...connect].filter(Boolean).join(' '),
    "object-src 'none'",
    // Bloei laadt zelf nooit een andere pagina in een frame.
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    // Trusted Types (BESLISSING 430): html- en script-sinks aanvaarden geen gewone tekst meer, alleen wat uit de twee eigen
    // policies komt (src/kern/trusted-types.js). Een browser die deze richtlijnen niet kent (Safari vóór 26, Firefox vóór 148),
    // negeert ze en werkt zoals voorheen.
    "require-trusted-types-for 'script'",
    'trusted-types bloei-svg bloei-sw',
  ].join('; ');
}

// Het beleid voor de kop in vercel.json: connect-src ruimer ('self' https:), en geen enkele site mag Bloei in een frame tonen.
export function cspKop(scriptHashes) {
  return cspBeleid({ scriptHashes, connect: ['https:'] }) + "; frame-ancestors 'none'";
}
