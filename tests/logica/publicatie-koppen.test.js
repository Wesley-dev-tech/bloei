// Controle van 16 november op de koppen in vercel.json, aanvullend op tests/logica/beveiliging.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const vercel = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'vercel.json'), 'utf8'));
const overal = Object.fromEntries(vercel.headers.find((r) => r.source === '/(.*)').headers.map((k) => [k.key, k.value]));

describe('koppen van de publieke site', () => {
  it('andere sites mogen de bestanden van Bloei niet insluiten (Cross-Origin-Resource-Policy)', () => {
    expect(overal['Cross-Origin-Resource-Policy']).toBe('same-origin');
  });

  it('Permissions-Policy zet ook de apparaat- en volgfuncties uit die de app niet gebruikt', () => {
    const pp = Object.fromEntries(overal['Permissions-Policy'].split(/,\s*/).map((r) => r.split('=')));
    for (const uit of ['bluetooth', 'hid', 'serial', 'idle-detection', 'browsing-topics', 'xr-spatial-tracking']) expect(pp[uit], uit).toBe('()');
    // Geen enkele functie staat open voor een andere oorsprong.
    for (const [functie, waarde] of Object.entries(pp)) expect(['()', '(self)'], functie).toContain(waarde);
  });

  // OW-03 (OWASP Secure Headers Project: "max-age=63072000; includeSubDomains"). Geen 'preload': het adres valt onder .app,
  // dat als geheel al in de HSTS-preloadlijst van de browsers staat (hstspreload.org: vercel.app → preloaded via "app"), en een
  // *.vercel.app-adres kan zelf niet ingediend worden (alleen het basisdomein). Bij een eigen domein beslist de eigenaar dat bewust.
  it('Strict-Transport-Security: twee jaar, met includeSubDomains, zonder preload', () => {
    const hsts = overal['Strict-Transport-Security'].split(/;\s*/);
    expect(hsts[0]).toBe('max-age=63072000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).not.toContain('preload');
  });

  it('geen kop laat de site indexeren of insluiten: geen X-Robots-Tag (gedeeld met de demo) en frame-ancestors none', () => {
    expect(overal['X-Robots-Tag']).toBeUndefined();
    expect(overal['Content-Security-Policy']).toMatch(/frame-ancestors 'none'$/);
  });
});
