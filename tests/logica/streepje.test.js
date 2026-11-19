// BESLISSING 460: het korte streepje staat overal recht, met de maten van het oude schuine streepje van Cormorant Garamond.
// src/stijl/streepje.css zet voor het teken U+002D een eigen piepklein lettertype (public/fonts/streepje-*.woff, uit scripts/maak-streepjesfonts.mjs)
// onder dezelfde familienaam als het sierlettertype. Hier: de regels bestaan en passen bij tokens.css, de bestanden zijn lokaal en in de
// precache, en de glyph heeft de maten van het oude streepje (een blokje, te dik of te kort, is rood).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { TEKENS, maakFont } from '../../scripts/maak-streepjesfonts.mjs';

const WORTEL = join(import.meta.dirname, '..', '..');
const lees = (p) => readFileSync(join(WORTEL, p), 'utf8');
const regels = (css) => [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const eigenschap = (blok, naam) => (blok.match(new RegExp(`(?:^|[;\\s])${naam}\\s*:\\s*([^;]+)`)) ?? [])[1]?.trim();

const streepje = regels(lees('src/stijl/streepje.css'));
const tokens = regels(lees('bloei-huisstijl/tokens.css'));
const sleutel = (b) => `${eigenschap(b, 'font-family')}|${eigenschap(b, 'font-weight')}|${eigenschap(b, 'font-style')}`;

// Het oude streepje van Cormorant (gemeten op 500 px, in 1/1000 em): vooruitgang, lengte, dikte in het midden en hoogte van het midden.
const OUD = {
  'streepje-500': { adv: 323, lengte: 268, dikte: 45.2, midden: 208.4 },
  'streepje-600': { adv: 323, lengte: 268, dikte: 50.2, midden: 206.9 },
  'streepje-500-italic': { adv: 305, lengte: 256, dikte: 47, midden: 213 },
};
const PX = 42.667; // de grote cijfers (p.cijfer-groot op 390): 1 px is dan 23,4 duizendste em

describe('streepje.css (BESLISSING 460)', () => {
  it('heeft regels, elk met unicode-range U+002D en de familienaam van het sierlettertype', () => {
    expect(streepje.length).toBeGreaterThanOrEqual(3);
    for (const b of streepje) {
      expect(eigenschap(b, 'unicode-range')).toBe('U+002D');
      expect(eigenschap(b, 'font-family')).toBe('"Cormorant Garamond"');
    }
  });

  it('wijst naar lokale streepjesbestanden, zonder adres van buiten, en ze bestaan', () => {
    for (const b of streepje) {
      const url = b.match(/url\("([^"]+)"\)/)?.[1];
      expect(url).toBeTruthy();
      expect(url).not.toMatch(/^(https?:)?\/\//);
      // een absoluut adres naar public/: een klein bestand in src/ zou als data: in de css komen, en de CSP (font-src 'self') blokkeert dat
      expect(url).toMatch(/^\/fonts\/streepje-(500|600|500-italic)\.woff$/);
      expect(existsSync(join(WORTEL, 'public', url))).toBe(true);
    }
  });

  it('heeft voor elk gewicht en elke stijl van Cormorant in tokens.css een eigen regel', () => {
    const cormorant = tokens.filter((b) => /Cormorant/.test(eigenschap(b, 'font-family') ?? '')).map(sleutel);
    expect(cormorant.length).toBeGreaterThan(0);
    expect(streepje.map(sleutel).sort()).toEqual(cormorant.sort());
  });

  it('wordt in main.js vlak na tokens.css geladen, zodat de latere regel wint', () => {
    const main = lees('src/main.js');
    const i = main.indexOf("import '../bloei-huisstijl/tokens.css'");
    const j = main.indexOf("import './stijl/streepje.css'");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(main.slice(i, j).split('\n').filter((l) => l.startsWith('import ')).length).toBe(1);
  });

  it('de woff-bestanden zitten in de precache van de service worker (vite.config.js neemt woff mee)', () => {
    expect(lees('vite.config.js')).toMatch(/globPatterns: \[[^\]]*\bwoff\b/);
  });
});

describe('de streepjesbestanden (public/fonts/streepje-*.woff)', () => {
  for (const [naam, def] of Object.entries(TEKENS)) {
    const bestand = join(WORTEL, 'public', 'fonts', naam + '.woff');
    const oud = OUD[naam];
    const dik = def.y1 - def.y0;
    const midden = (def.y0 + def.y1) / 2;

    it(`${naam}: is een klein, geldig woff-bestand en is wat het script maakt`, () => {
      const b = readFileSync(bestand);
      expect(b.subarray(0, 4).toString()).toBe('wOFF');
      expect(b.length).toBeLessThan(2048);
      expect(Buffer.compare(b, maakFont(def))).toBe(0);
    });

    it(`${naam}: dezelfde vooruitgang als het oude streepje, zodat de tekst niet verspringt`, () => {
      expect(def.adv).toBe(oud.adv);
      const b = readFileSync(bestand);
      const n = b.readUInt16BE(12);
      let hmtx;
      for (let i = 0; i < n; i++) {
        const o = 44 + 20 * i;
        if (b.toString('latin1', o, o + 4) === 'hmtx') {
          const [off, cl, ol] = [b.readUInt32BE(o + 4), b.readUInt32BE(o + 8), b.readUInt32BE(o + 12)];
          hmtx = cl === ol ? b.subarray(off, off + ol) : inflateSync(b.subarray(off, off + cl));
        }
      }
      expect(hmtx.readUInt16BE(4)).toBe(oud.adv); // vooruitgang van glyph 1
    });

    it(`${naam}: lengte, dikte en hoogte van het oude streepje (±1 px, ±0,4 px, ±0,5 px op 42,7 px), lang:dik minstens 5:1`, () => {
      const px = 1000 / PX; // duizendste em per px
      expect(Math.abs(def.lengte - oud.lengte)).toBeLessThanOrEqual(1 * px);
      expect(Math.abs(dik - oud.dikte)).toBeLessThanOrEqual(0.4 * px);
      expect(Math.abs(midden - oud.midden)).toBeLessThanOrEqual(0.5 * px);
      expect(def.lengte / dik).toBeGreaterThanOrEqual(5);
    });
  }
});
