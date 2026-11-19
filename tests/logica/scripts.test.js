// R6-01 en R6-02: de scripts in scripts/ wissen nooit iets wat de app gebruikt. Alles gespeeld op een kopie in een tijdelijke map.
import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ICONEN, kopieerHuisstijl } from '../../scripts/kopieer-huisstijl.mjs';

const WORTEL = join(import.meta.dirname, '..', '..');
const tijdelijk = [];
afterEach(() => {
  for (const m of tijdelijk.splice(0)) rmSync(m, { recursive: true, force: true });
});

function kopieWortel() {
  const map = mkdtempSync(join(tmpdir(), 'bloei-scripts-'));
  tijdelijk.push(map);
  mkdirSync(join(map, 'src'), { recursive: true });
  cpSync(join(WORTEL, 'src', 'iconen'), join(map, 'src', 'iconen'), { recursive: true });
  return map;
}
const lijst = (map) => ['solid', 'regular'].flatMap((s) => readdirSync(join(map, 'src', 'iconen', s)).map((n) => s + '/' + n));

// Alle bronbestanden van de app, zonder de iconenmap zelf.
function bronnen(map, uit = []) {
  for (const d of readdirSync(map, { withFileTypes: true })) {
    if (d.isDirectory()) {
      if (d.name !== 'iconen') bronnen(join(map, d.name), uit);
    } else if (d.name.endsWith('.js')) uit.push(join(map, d.name));
  }
  return uit;
}

describe('scripts/kopieer-huisstijl.mjs (R6-01)', () => {
  it('de lijst ICONEN bevat elk icoon dat in src/iconen staat', () => {
    for (const stijl of Object.keys(ICONEN)) {
      const opSchijf = readdirSync(join(WORTEL, 'src', 'iconen', stijl)).map((n) => n.replace(/\.svg$/, ''));
      expect(opSchijf.filter((n) => !ICONEN[stijl].includes(n))).toEqual([]);
    }
  });

  it('elk icoon dat de code gebruikt bestaat na het script nog (op een kopie)', () => {
    const map = kopieWortel();
    // De iconen die de code noemt: elke tekst tussen aanhalingstekens in src/ die gelijk is aan de naam van een icoon.
    const namen = new Map(lijst(map).map((p) => [p.split('/')[1].replace(/\.svg$/, ''), p]));
    const gebruikt = new Set();
    for (const bestand of bronnen(join(WORTEL, 'src'))) {
      for (const [, naam] of readFileSync(bestand, 'utf8').matchAll(/['"`]([a-z][a-z-]*[a-z])['"`]/g)) {
        if (namen.has(naam)) gebruikt.add(namen.get(naam));
      }
    }
    expect(gebruikt.size).toBeGreaterThan(30);
    const voor = lijst(map);
    kopieerHuisstijl({ wortel: map, nm: join(WORTEL, 'node_modules'), log: () => {} });
    const na = new Set(lijst(map));
    for (const p of voor) expect(na.has(p), p).toBe(true);
    for (const p of gebruikt) expect(na.has(p), p).toBe(true);
    // De fonts zijn erbij gekomen.
    expect(existsSync(join(map, 'fonts', 'jost-variable.woff2'))).toBe(true);
  });

  it('een niet getrackt icoon dat niet in de lijst staat: duidelijke fout vóór er iets geschreven is, en er verdwijnt niets', () => {
    const map = kopieWortel();
    writeFileSync(join(map, 'src', 'iconen', 'solid', 'zelfgemaakt.svg'), '<svg/>');
    const voor = lijst(map);
    expect(() => kopieerHuisstijl({ wortel: map, nm: join(WORTEL, 'node_modules'), log: () => {} })).toThrow(/zelfgemaakt\.svg.*ICONEN/s);
    expect(lijst(map)).toEqual(voor);
    expect(existsSync(join(map, 'fonts'))).toBe(false);
  });

  it('een ontbrekend icoon in Font Awesome stopt het script vóór er iets geschreven is', () => {
    const map = kopieWortel();
    const leegNm = join(map, 'leeg-nm');
    mkdirSync(leegNm);
    const voor = lijst(map);
    expect(() => kopieerHuisstijl({ wortel: map, nm: leegNm, log: () => {} })).toThrow(/niets gewijzigd/);
    expect(lijst(map)).toEqual(voor);
  });
});

describe('scripts/kopieer-pwa.mjs (R6-02)', () => {
  const bron = readFileSync(join(WORTEL, 'scripts', 'kopieer-pwa.mjs'), 'utf8');
  it('wist public/icons en public/splash niet vóór het tekenen: eerst een tijdelijke map, dan pas verwisselen', () => {
    // Het enige rmSync op een map in public/ staat in de herstelroute van verwissel(), nooit vóór het tekenen.
    expect(bron).not.toMatch(/rmSync\(join\(wortel, 'public'/);
    expect(bron).toMatch(/\.pwa-nieuw/);
    const tekenen = bron.indexOf('screenshot(');
    const verwissel = bron.lastIndexOf('verwissel(wortel, nieuw');
    expect(tekenen).toBeGreaterThan(0);
    expect(verwissel).toBeGreaterThan(tekenen);
  });
});
