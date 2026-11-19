// Adres van de push-dienst en publieke VAPID-sleutel, uit .env (VITE_PUSH_URL en VITE_VAPID_PUBLIEK). Leeg = herinneringen zijn op dit
// toestel niet beschikbaar en de app doet geen enkel verzoek naar buiten (BESLISSING 38). Contract: PLAN.md §6.5.
import { isGeinstalleerd, isIos } from '../pwa/installatie.js';
import { DEMO } from '../kern/demo.js';

// Alleen https (of localhost bij het ontwikkelen) is een geldig adres; al het andere telt als niet ingevuld.
export function schoonAdres(waarde) {
  const tekst = String(waarde ?? '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(tekst);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))) return tekst;
  } catch {
    /* geen geldig adres */
  }
  return '';
}

// In de demo (BESLISSING 364) is de dienst nooit ingesteld, ook als VITE_PUSH_URL per ongeluk gezet is: geen abonnement, geen verzoek.
// vite.config.js maakt beide variabelen in een demobouw bovendien leeg, zodat het adres ook niet in de bundel staat.
export const PUSH_URL = DEMO ? '' : schoonAdres(import.meta.env?.VITE_PUSH_URL);
export const VAPID_PUBLIEK = DEMO ? '' : String(import.meta.env?.VITE_VAPID_PUBLIEK ?? '').trim();

export const dienstIngesteld = () => Boolean(PUSH_URL && VAPID_PUBLIEK);

// Beide ingevuld, de push-API bestaat, en op een iPhone of iPad staat Bloei op het beginscherm.
export function pushBeschikbaar() {
  if (!dienstIngesteld()) return false;
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (isIos() && !isGeinstalleerd()) return false;
  return true;
}

// De vier toestanden van het scherm: niet-beschikbaar, installeren (iPhone of iPad in Safari), geweigerd, beschikbaar.
export function pushToestand() {
  if (!dienstIngesteld()) return 'niet-beschikbaar';
  if (isIos() && !isGeinstalleerd()) return 'installeren';
  if (!pushBeschikbaar()) return 'niet-beschikbaar';
  if (Notification.permission === 'denied') return 'geweigerd';
  return 'beschikbaar';
}
