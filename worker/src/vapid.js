// VAPID (RFC 8292) met alleen crypto.subtle: een JWT met ES256 en de kop Authorization: vapid t=<jwt>, k=<publieke sleutel>.
const encoder = new TextEncoder();

export function naarBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function vanBase64Url(tekst) {
  const b = atob(tekst.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (tekst.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

// privateB64: de 32 bytes van de private sleutel (d), publiekB64: het ongecomprimeerde punt (65 bytes, begint met 0x04); beide base64url.
export async function importeerSleutel(privateB64, publiekB64) {
  const publiek = vanBase64Url(publiekB64);
  if (publiek.length !== 65 || publiek[0] !== 4) throw new Error('publieke sleutel ongeldig');
  const jwk = { kty: 'EC', crv: 'P-256', d: privateB64, x: naarBase64Url(publiek.slice(1, 33)), y: naarBase64Url(publiek.slice(33)), ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// aud = de origin van het endpoint, exp = hoogstens 12 uur vooruit (hier 12 uur min een marge), sub = mailto: of https:.
export async function maakJwt(sleutel, { endpoint, onderwerp, nu = Date.now() }) {
  const kop = naarBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = naarBase64Url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nu / 1000) + 11 * 3600, sub: onderwerp })),
  );
  const invoer = `${kop}.${claims}`;
  // crypto.subtle geeft de handtekening al als r||s (64 bytes), zoals JWT het wil.
  const handtekening = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sleutel, encoder.encode(invoer)));
  return `${invoer}.${naarBase64Url(handtekening)}`;
}

export async function vapidKop(sleutel, { endpoint, onderwerp, publiek, nu }) {
  return `vapid t=${await maakJwt(sleutel, { endpoint, onderwerp, nu })}, k=${publiek}`;
}
