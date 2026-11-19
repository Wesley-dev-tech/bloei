// Hulpen voor de beveiligingstests van het slot (c-beveiliging.spec.js en x-android.spec.js), BESLISSING 518 en 541: na de twee keer zes cijfers volgt
// altijd de herstelcode met het vinkje "Ik heb ze bewaard"; de vraag "Je toestel als hulp" bestaat niet meer (herstel met het toestel kan altijd,
// zonder koppelen). Gebruik alleen deze twee bestanden; x-herstel.spec.js en c-slot.spec.js hebben hun eigen hulpen.
import { expect } from '@playwright/test';

export const stap = (page) => page.locator('[data-herstelstap]');
// Bestaat sinds BESLISSING 541 niet meer: wordt alleen gebruikt om te controleren dat het aanbod er niet is.
export const aanbod = (page) => page.locator('[data-toestelaanbod]');

export async function tik(page, code) {
  for (const cijfer of code) await page.locator(`.cijferblok__toets[data-cijfer="${cijfer}"]`).click();
}

// De stap na de code bij het instellen: de herstelcode met het vinkje. Geeft de getoonde herstelcode.
export async function rondAf(page) {
  await expect(stap(page)).toBeVisible();
  await expect(aanbod(page)).toHaveCount(0);
  const code = (await stap(page).locator('.herstel__code').textContent()).trim();
  await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap(page).getByRole('button', { name: 'Verder' }).click();
  return code;
}

// Antwoorden zoals een echte platformauthenticator ze geeft (zoals pkBouwer in x-herstel.spec.js): clientDataJSON met challenge en oorsprong,
// authenticatordata met de hash van het rpId en de vlaggen, bij create een attestationObject en getAuthenticatorData. Met sessionStorage:
//   '__uv' = 'nee'           laat de vlag UV weg (een toestel dat de gebruiker niet verifieerde);
//   '__pkfout' = 'challenge' een antwoord op een andere challenge; 'oorsprong' een antwoord van een andere oorsprong; 'rp' een andere rpId-hash;
//                            'type' het verkeerde type (webauthn.get bij create); 'id' een ander id in de authenticatordata dan rawId.
function pkBouwer() {
  const tekst = (s) => new TextEncoder().encode(s);
  const b64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const samen = (...delen) => Uint8Array.from(delen.flatMap((d) => [...d]));
  const kop = (soort, n) => (n < 24 ? [(soort << 5) | n] : n < 256 ? [(soort << 5) | 24, n] : [(soort << 5) | 25, n >> 8, n & 255]);
  const tk = (s) => [...kop(3, s.length), ...tekst(s)];
  const fout = () => sessionStorage.getItem('__pkfout');
  let teller = 0;
  async function data(o, soort, id) {
    const rp = fout() === 'rp' ? 'ander.example' : o.publicKey.rp?.id || o.publicKey.rpId || location.hostname;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', tekst(rp)));
    const uv = sessionStorage.getItem('__uv') === 'nee' ? 0 : 0x04;
    const delen = [hash, Uint8Array.of(0x01 | uv | (soort === 'create' ? 0x40 : 0)), new Uint8Array(4)];
    if (soort === 'create') {
      const zichtbaar = fout() === 'id' ? Uint8Array.from(id, (x) => x ^ 0xff) : id;
      delen.push(new Uint8Array(16), Uint8Array.of(0, zichtbaar.length), zichtbaar, Uint8Array.of(0xa0));
    }
    return samen(...delen);
  }
  const client = (o, soort) => {
    const challenge = fout() === 'challenge' ? b64url(new Uint8Array(32)) : b64url(o.publicKey.challenge);
    const type = fout() === 'type' ? 'webauthn.' + (soort === 'create' ? 'get' : 'create') : 'webauthn.' + soort;
    return tekst(JSON.stringify({ type, challenge, origin: fout() === 'oorsprong' ? 'https://ander.example' : location.origin, crossOrigin: false }));
  };
  window.__pkBouw = {
    create: async (o) => {
      const id = Uint8Array.from({ length: 16 }, (_, i) => (i === 2 ? ++teller : 0x30 + ((i * 7 + 3) % 64))); // een id van 16 bytes, per sleutel anders
      const ad = await data(o, 'create', id);
      const att = Uint8Array.from([...kop(5, 3), ...tk('fmt'), ...tk('none'), ...tk('attStmt'), 0xa0, ...tk('authData'), ...kop(2, ad.length), ...ad]);
      return { type: 'public-key', id: b64url(id), rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client(o, 'create').buffer, attestationObject: att.buffer, getAuthenticatorData: () => ad.buffer, getTransports: () => ['internal'] }, getClientExtensionResults: () => ({}) };
    },
    get: async (o) => {
      const id = new Uint8Array(o.publicKey.allowCredentials?.[0]?.id ?? new Uint8Array(16));
      return { type: 'public-key', id: b64url(id), rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client(o, 'get').buffer, authenticatorData: (await data(o, 'get')).buffer, signature: new ArrayBuffer(8), userHandle: null }, getClientExtensionResults: () => ({}) };
    },
  };
}

// Een nagebootste platformauthenticator: 'ok' of 'geen'. sessionStorage '__pk' = 'annuleer' laat de bevestiging (get) mislukken, '__pkc' = 'fout'
// het aanmaken (create); '__uv' en '__pkfout': zie pkBouwer. Bewaart ook de opties van elke aanroep (window.__pkOpties) en de id's die de app als
// onbekend meldde (window.__pkVergeten).
export async function authenticator(page, modus = 'ok') {
  await page.addInitScript(pkBouwer);
  await page.addInitScript((m) => {
    window.__pkGemaakt = 0;
    window.__pkAanroepen = 0;
    window.__pkOpties = [];
    // De id's die de app als onbekend meldde, ook na een herlading (window.name blijft staan; sessionStorage wist de app zelf bij het wissen).
    try {
      window.__pkVergeten = JSON.parse(window.name);
    } catch {
      window.__pkVergeten = [];
    }
    if (!Array.isArray(window.__pkVergeten)) window.__pkVergeten = [];
    // De opties van een aanroep, als gewone waarden (bytes als getallenlijst), om na te kijken wat de app het toestel vraagt.
    const zuiver = (soort, o) => {
      const k = o.publicKey;
      return {
        soort,
        challenge: Array.from(new Uint8Array(k.challenge)),
        userVerification: k.userVerification ?? k.authenticatorSelection?.userVerification ?? null,
        aanhechting: k.authenticatorSelection?.authenticatorAttachment ?? null,
        attestation: k.attestation ?? null,
        toegestaan: (k.allowCredentials ?? []).map((c) => Array.from(new Uint8Array(c.id))),
        naam: k.user?.name ?? null,
        residentKey: k.authenticatorSelection?.residentKey ?? null,
      };
    };
    if (m === 'geen') {
      window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => false };
      return;
    }
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
    window.PublicKeyCredential.signalUnknownCredential = async (o) => {
      window.__pkVergeten.push(o.credentialId);
      window.name = JSON.stringify(window.__pkVergeten);
    };
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: async (o) => {
          window.__pkGemaakt++;
          window.__pkOpties.push(zuiver('create', o));
          if (sessionStorage.getItem('__pkc') === 'fout') throw new DOMException('geannuleerd', 'NotAllowedError');
          return window.__pkBouw.create(o);
        },
        get: async (o) => {
          window.__pkAanroepen++;
          window.__pkOpties.push(zuiver('get', o));
          if (sessionStorage.getItem('__pk') === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
          return window.__pkBouw.get(o);
        },
      },
    });
  }, modus);
}

export const zetPk = (page, modus) => page.evaluate((m) => sessionStorage.setItem('__pk', m), modus);
// Zet (of wist met null) een sleutel in sessionStorage, voor '__pkc', '__uv' en '__pkfout'.
export const zetSessie = (page, sleutel, waarde) => page.evaluate(([s, w]) => (w === null ? sessionStorage.removeItem(s) : sessionStorage.setItem(s, w)), [sleutel, waarde]);

// Een instelling uit de database van de app (null als ze er niet is).
export const instelling = (page, sleutel) =>
  page.evaluate(
    (k) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('instellingen').objectStore('instellingen').get(k);
          v.onsuccess = () => {
            open.result.close();
            klaar(v.result?.waarde ?? null);
          };
        };
      }),
    sleutel,
  );
