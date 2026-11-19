// De stukken van een stap (STUKKEN in src/uitleg/stappen.js, BESLISSINGEN 627 en 694): de tekst van elk afgerond deel op een telefoon.
// Een reeks met uitZinnen verdeelt de goedgekeurde staptekst per zin: geen woord erbij, geen woord weg, dezelfde volgorde.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STAPPEN, STUKKEN, stappenVoor } from '../../src/uitleg/stappen.js';
import { TEKSTEN } from '../../src/teksten.js';

const TOESTEL = { android: false, chrome: false, apk: false };

// Elke stap die naar een reeks stukken verwijst, met haar sleutel.
const metStukken = Object.entries(STAPPEN).flatMap(([sleutel, lijst]) =>
  lijst.filter((s) => typeof s.stukken === 'string').map((s) => ({ sleutel, id: s.id, reeks: s.stukken })),
);

// Alle tekstwaarden uit teksten.js (voor de titels: een bestaande naam van een onderdeel).
const alleTeksten = new Set();
(function verzamel(o) {
  for (const v of Object.values(o)) {
    if (typeof v === 'string') alleTeksten.add(v);
    else if (v && typeof v === 'object') verzamel(v);
  }
})(TEKSTEN);

// De broncode van de schermen, om te zien of de klassen van een selector echt bestaan.
function bronnen(map) {
  return readdirSync(map, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? bronnen(join(map, d.name)) : d.name.endsWith('.js') ? [readFileSync(join(map, d.name), 'utf8')] : []));
}
const BRON = bronnen(join(import.meta.dirname, '..', '..', 'src')).join('\n');

// Een selector is geldig als haken en aanhalingstekens kloppen, hij niet leeg is en elke klasse in de broncode voorkomt.
function selectorFouten(sel) {
  const fouten = [];
  if (typeof sel !== 'string' || !sel.trim()) return ['leeg'];
  let rond = 0;
  let recht = 0;
  for (const c of sel) {
    if (c === '(') rond++;
    if (c === ')') rond--;
    if (c === '[') recht++;
    if (c === ']') recht--;
    if (rond < 0 || recht < 0) fouten.push('haak dicht voor open');
  }
  if (rond !== 0 || recht !== 0) fouten.push('haken kloppen niet');
  if ((sel.match(/"/g) ?? []).length % 2) fouten.push('aanhalingstekens kloppen niet');
  if (/(^|,)\s*(,|$)|[>+~]\s*($|,)/.test(sel)) fouten.push('lege of afgebroken selector');
  const zonderAttr = sel.replace(/\[[^\]]*\]/g, '');
  for (const [, klasse] of zonderAttr.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    if (!BRON.includes(klasse)) fouten.push('klasse ' + klasse + ' niet in src');
  }
  return fouten;
}

describe('stukken van een stap', () => {
  it('elke verwijzing naar stukken bestaat', () => {
    for (const { sleutel, id, reeks } of metStukken) expect(STUKKEN[reeks], `${sleutel}.${id}`).toBeTruthy();
  });

  it('geen twee stukken in dezelfde reeks met dezelfde titel of dezelfde tekst', () => {
    for (const [naam, r] of Object.entries(STUKKEN)) {
      const titels = r.stukken.map((s) => s.titel);
      const teksten = r.stukken.map((s) => s.tekst);
      expect(new Set(titels).size, naam + ' titels').toBe(titels.length);
      expect(new Set(teksten).size, naam + ' teksten').toBe(teksten.length);
    }
  });

  it('elk stuk heeft een doel dat als selector geldig is', () => {
    for (const [naam, r] of Object.entries(STUKKEN)) {
      for (const s of r.stukken) expect(selectorFouten(s.bij), `${naam}: ${s.bij}`).toEqual([]);
    }
  });

  it('de controle van een selector keurt een kapotte af', () => {
    expect(selectorFouten('.dag__eten > ')).not.toEqual([]);
    expect(selectorFouten('.dag__eten:nth-child(2')).not.toEqual([]);
    expect(selectorFouten('.bestaat__niet-in-de-bron')).not.toEqual([]);
    expect(selectorFouten('')).not.toEqual([]);
  });
});

describe('stukken uit de zinnen van de staptekst (uitZinnen)', () => {
  const uitZinnen = metStukken.filter(({ reeks }) => STUKKEN[reeks]?.uitZinnen);

  it('er zijn zulke reeksen, en elke reeks hoort bij een stap', () => {
    expect(uitZinnen.length).toBeGreaterThan(0);
    for (const naam of Object.keys(STUKKEN).filter((k) => STUKKEN[k].uitZinnen)) expect(uitZinnen.some((x) => x.reeks === naam), naam).toBe(true);
  });

  it('de stukken samen zijn letterlijk de staptekst, in volgorde, niets erbij en niets weg', () => {
    for (const { sleutel, id, reeks } of uitZinnen) {
      const stap = stappenVoor(sleutel, TOESTEL).find((s) => s.id === id);
      const stukken = STUKKEN[reeks].stukken;
      expect(stukken.length, reeks).toBeGreaterThan(1);
      expect(stukken.map((s) => s.tekst).join(' '), reeks).toBe(stap.tekst);
      // elk stuk is een of meer hele zinnen
      for (const s of stukken) expect(s.tekst, reeks).toMatch(/^[A-ZÉ].*[.?!]$/u);
      // geen vervolgtekst en geen kortere tekst: alleen de zinnen zelf
      expect(STUKKEN[reeks].vervolg, reeks).toBeUndefined();
      for (const s of stukken) expect(s.kort, reeks).toBeUndefined();
    }
  });

  it('het eerste stuk draagt de titel van de stap; een volgend stuk een bestaande naam uit teksten.js', () => {
    for (const { sleutel, id, reeks } of uitZinnen) {
      const stap = stappenVoor(sleutel, TOESTEL).find((s) => s.id === id);
      const [eerste, ...rest] = STUKKEN[reeks].stukken;
      expect(eerste.titel, reeks).toBe(stap.titel);
      for (const s of rest) {
        expect(alleTeksten.has(s.titel), `${reeks}: ${s.titel}`).toBe(true);
        expect(s.titel, reeks).not.toBe(stap.titel);
      }
    }
  });

  it('stukken veranderen het aantal stappen niet: een stuk is een deel van een stap', () => {
    for (const [sleutel, lijst] of Object.entries(STAPPEN)) expect(stappenVoor(sleutel, TOESTEL).length, sleutel).toBe(lijst.length);
  });
  // De verboden tekens (lang streepje en zo) bewaakt tests/logica/geen-lange-streepjes.test.js voor alle bestanden, ook stappen.js.
});
