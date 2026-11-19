// De optie heet Face ID (BESLISSING 192); er staat nergens een andere naam of hint (BESLISSING 193).
// Uitzondering (BESLISSING 423, AN-04): alleen op Android heet ze "vingerafdruk of schermslot" (src/vergrendeling/passkey.js);
// die teksten staan in teksten.js onder sleutels die op "Android" eindigen. Buiten Android blijft alles Face ID.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { faceIdNaam, FACE_ID } from '../../src/vergrendeling/passkey.js';
import { TEKSTEN } from '../../src/teksten.js';

// TEKSTEN zonder de Android-varianten (sleutels die op "Android" eindigen).
function zonderAndroid(o) {
  if (typeof o !== 'object' || o === null) return o;
  return Object.fromEntries(Object.entries(o).filter(([k]) => !/Android/.test(k)).map(([k, v]) => [k, zonderAndroid(v)]));
}

describe('Face ID heet overal Face ID (buiten Android)', () => {
  it('de naam van de optie is buiten Android Face ID', () => {
    expect(faceIdNaam()).toBe('Face ID');
    expect(faceIdNaam({ android: false })).toBe('Face ID');
    expect(FACE_ID).toBe('Face ID');
  });

  it('geen enkele tekst of code noemt Windows Hello, Touch ID of (buiten de Android-varianten) een vingerafdruk als naam of hint', () => {
    expect(JSON.stringify(TEKSTEN)).not.toMatch(/Windows Hello|Touch ID/i);
    expect(JSON.stringify(zonderAndroid(TEKSTEN))).not.toMatch(/vingerafdruk/i);
    for (const f of ['src/vergrendeling/passkey.js', 'src/vergrendeling/scherm.js', 'src/vergrendeling/slot.js', 'src/vergrendeling/voorbeeld.js']) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/Windows Hello|Touch ID/i);
      // De Android-naam staat op precies één plek: de constante ANDROID_METHODE in passkey.js.
      const zonderConstante = code.replace(/export const ANDROID_METHODE = '[^']*';/, '').replace(/^\s*\/\/.*$/gm, '');
      expect(zonderConstante, f).not.toMatch(/vingerafdruk/i);
    }
  });
});
