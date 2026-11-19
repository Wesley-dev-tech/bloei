// Maakt lokaal een VAPID-sleutelpaar (P-256) en toont het op het scherm. Er gaat niets naar buiten: geen verzoek, geen bestand.
// Gebruik: node scripts/maak-vapid.mjs
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const b64 = (s) => Buffer.from(s, 'base64url');
const publiek = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString('base64url');

console.log('VAPID_PUBLIEK (mag openbaar; ook voor VITE_VAPID_PUBLIEK in de app):');
console.log(publiek);
console.log('');
console.log('VAPID_PRIVE (geheim: nooit delen, nooit in git):');
console.log(jwk.d);
