// Detectie "staat op het beginscherm" en de installatiestrook (HUISSTIJL §9).
// Spoor B plaatst de strook op Vandaag: const strook = await installatiestrook(); if (strook) ...append(strook).
//   iPhone en iPad (Safari): de strook met de uitleg Deel › Zet op beginscherm, zoals altijd.
//   Android (BESLISSING 515): de strook met een downloadlink naar de apk (/bloei.apk), alleen als de apk er is, niet in de demo en niet in de apk zelf.
//   Elders (desktop): geen strook.
import { kaart, knop } from '../ui/componenten.js';
import { h } from '../ui/dom.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { isAndroid, isIos as isIosToestel, isStandalone } from '../kern/toestel.js';
import { OPSLAG_VOORVOEGSEL } from '../kern/demo.js';
import { APK_ADRES, apkBeschikbaar } from './apk.js';
import { t } from '../teksten.js';

// Voorlopige teksten (spoor B beheert src/teksten.js en mag ze daarheen verhuizen).
export const TEKSTEN = {
  titel: 'Bloei op je beginscherm',
  uitleg: 'Tik op “Deel” en dan op “Zet op beginscherm”. Dan opent Bloei als een gewone app.',
  weg: 'Niet nu',
};

// Staat de app op het beginscherm (iOS: navigator.standalone; andere browsers: display-mode)?
export const isGeinstalleerd = () => isStandalone();

// iPhone, iPad of iPod. Een iPad met iPadOS meldt zich als Mac, maar heeft een aanraakscherm. (De regel staat in kern/toestel.js.)
export const isIos = () => isIosToestel();

// ---- Android (BESLISSING 515): de apk als download ----
// Android-gebruikers installeren Bloei met een apk (een Trusted Web Activity, gemaakt met Bubblewrap), niet met de installatievraag
// van Chrome. De strook is een gewone downloadlink naar /bloei.apk. Ze verschijnt alleen als de apk er bij het bouwen bij zat
// (vite.config.js zet VITE_APK op '1' als public/bloei.apk bestaat, nooit in de demo), dus er staat nooit een dode knop.
export { APK_ADRES, apkBeschikbaar };

// Draait Bloei als de apk (een TWA)? Dan is de weergave schermvullend (isStandalone), en de eerste navigatie heeft als referrer
// android-app://<pakket>. Dat laatste wordt voor de sessie onthouden, want bij latere pagina's is de referrer weg.
const TWA_SLEUTEL = OPSLAG_VOORVOEGSEL + 'twa';
export function draaitAlsApk(doc = globalThis.document, opslag = globalThis.sessionStorage) {
  const vanApp = String(doc?.referrer ?? '').startsWith('android-app://');
  try {
    if (opslag?.getItem(TWA_SLEUTEL) === '1') return true;
    if (vanApp) opslag?.setItem(TWA_SLEUTEL, '1');
  } catch {
    /* opslag niet beschikbaar: alleen de referrer telt */
  }
  return vanApp;
}
draaitAlsApk();

// Op Android houdt Bloei het beforeinstallprompt-event tegen (preventDefault), zodat Chrome naast de apk-knop geen eigen
// installatiebalk toont. Er is geen knop meer die prompt() oproept. Alleen op Android: elders blijft het gedrag van de browser.
// Exporteert voor de tests; de app roept dit één keer aan bij het laden van deze module.
export function luisterNaarInstallatie(win = globalThis.window, nav = globalThis.navigator) {
  if (!win || typeof win.addEventListener !== 'function' || !isAndroid(nav)) return false;
  win.addEventListener('beforeinstallprompt', (e) => e.preventDefault());
  return true;
}
luisterNaarInstallatie();

function androidStrook() {
  const el = kaart(
    { klasse: 'installatiestrook', titel: t('installatie.titel') },
    h('p', { class: 'installatiestrook__tekst' }, t('installatie.android')),
    h(
      'div',
      { class: 'installatiestrook__acties' },
      knop(t('installatie.weg'), {
        soort: 'secundair',
        opKlik: async () => {
          el.remove();
          await zetInstelling('installatie.strookWeg', true);
        },
      }),
      // Een gewone link in knopvorm: de browser downloadt het bestand, Android vraagt daarna om het te openen.
      h('a', { class: 'knop knop--primair', href: APK_ADRES, download: '' }, h('span', { class: 'knop__tekst' }, t('installatie.androidKnop'))),
    ),
  );
  el.dataset.toestel = 'android';
  return el;
}

// Geeft een element (een rustige kaart) of null: op iOS en op Android, niet op het beginscherm en niet weggetikt.
export async function installatiestrook() {
  if (isAndroid()) {
    if (!apkBeschikbaar() || isGeinstalleerd() || draaitAlsApk()) return null;
    if (await leesInstelling('installatie.strookWeg')) return null;
    return androidStrook();
  }
  if (!isIos() || isGeinstalleerd()) return null;
  if (await leesInstelling('installatie.strookWeg')) return null;

  const el = kaart(
    { klasse: 'installatiestrook', titel: TEKSTEN.titel },
    h('p', { class: 'installatiestrook__tekst' }, TEKSTEN.uitleg),
    h(
      'div',
      { class: 'installatiestrook__acties' },
      knop(TEKSTEN.weg, {
        soort: 'secundair',
        opKlik: async () => {
          el.remove();
          await zetInstelling('installatie.strookWeg', true);
        },
      }),
    ),
  );
  return el;
}
