// De apk van Bloei (BESLISSING 515): Android-gebruikers installeren Bloei met een apk (een Trusted Web Activity, gemaakt met
// Bubblewrap) die als download op de site staat. Eén plek voor de vraag "is die download er?".
// vite.config.js zet VITE_APK op '1' als public/bloei.apk bij het bouwen bestaat, en nooit in de demo. Zonder bestand dus geen dode knop.
import { DEMO } from '../kern/demo.js';

export const APK_ADRES = '/bloei.apk';

// env is voor de tests; standaard de omgeving van de bouw. Zonder optionele keten: de bundelaar ziet de constante.
export const apkBeschikbaar = (env = import.meta.env) => !DEMO && env.VITE_APK === '1';
