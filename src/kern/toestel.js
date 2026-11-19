// Welk toestel en welke browser (BESLISSING 423: Bloei werkt op iPhone én op Android). Eén plek voor de herkenning, zodat elke
// Android-aanpassing achter dezelfde vraag staat en iPhone, iPad en desktop precies blijven zoals ze waren.
// Elke functie neemt optioneel een navigator (en een window) mee, voor de tests; standaard die van de pagina.

const ua = (nav) => (nav && typeof nav.userAgent === 'string' ? nav.userAgent : '');

// iPhone, iPad of iPod. Een iPad met iPadOS meldt zich als Mac, maar heeft een aanraakscherm. (Letterlijk de regel die
// src/pwa/installatie.js al gebruikte.)
export function isIos(nav = globalThis.navigator) {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(ua(nav))) return true;
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

// Een Android-toestel (Chrome, Samsung Internet, Firefox, Edge, een WebView). Nooit samen met iOS.
export function isAndroid(nav = globalThis.navigator) {
  if (!nav || isIos(nav)) return false;
  return /Android/i.test(ua(nav));
}

// Firefox (op Android heet hij in de user-agent ook Firefox). Firefox vraagt zelf met een venster om blijvende opslag.
export function isFirefox(nav = globalThis.navigator) {
  return /Firefox\/|FxiOS\//.test(ua(nav));
}

// Chrome op Android, en niet een andere Chromium-browser met een eigen menu (Samsung Internet, Edge, Opera, ...).
export function isChromeAndroid(nav = globalThis.navigator) {
  if (!isAndroid(nav)) return false;
  const tekst = ua(nav);
  return /Chrome\/\d/.test(tekst) && !/SamsungBrowser|EdgA|OPR\/|OPT\/|YaBrowser|UCBrowser|Firefox|; wv\)/.test(tekst);
}

// Staat de app op het beginscherm (iOS: navigator.standalone; andere browsers: display-mode)? (Letterlijk de regel van installatie.js.)
export function isStandalone(nav = globalThis.navigator, win = globalThis.window) {
  if (!nav) return false;
  if (nav.standalone === true) return true;
  return Boolean(win) && typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
}
