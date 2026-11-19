// BESLISSING 537: elke omrande knop (.knop--secundair) heeft een zacht vlak in de kleurfamilie van haar tabblad. Eén regel op tokenniveau:
// --knop-zacht-bg = de familiekleur voor een vijfde in het zachte familievlak, --knop-zacht-fg = de gewone tekstkleur. Deze test rekent het
// contrast uit op de echte tokenwaarden in bloei-huisstijl/tokens.css (zelfde menging als in afgeleid.css) voor elke familie en elk thema.
// Met KNOP_ZACHT_TABEL=1 wordt de tabel geprint.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const CSS = readFileSync(new URL('../../bloei-huisstijl/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const TABKLEUR = readFileSync(new URL('../../src/stijl/tabkleur.css', import.meta.url), 'utf8');
const AFGELEID = readFileSync(new URL('../../src/stijl/afgeleid.css', import.meta.url), 'utf8');

function blok(selector) {
  const i = CSS.indexOf(selector + ' {');
  const j = CSS.indexOf('}', i);
  const uit = {};
  for (const m of CSS.slice(i, j).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) uit[m[1]] = m[2].trim();
  return uit;
}
const THEMAS = { poeder: blok(':root'), salie: { ...blok(':root'), ...blok('[data-theme="salie"]') }, nacht: { ...blok(':root'), ...blok('[data-theme="nacht"]') } };

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function waarde(t, naam) {
  let v = t[naam];
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return m ? waarde(t, m[1]) : hex(v);
}
function meng(a, p, b) { return a.map((x, i) => x * p + b[i] * (1 - p)); }
function lum(c) { const l = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; }
export function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// Familie: [basis, zacht, icoon]; staat in tabkleur.css (--f-<familie>-basis en -zacht)
export const FAMILIES = {
  Vandaag: ['--c-day', '--c-day-soft', '--c-day'], Dagboek: ['--c-book', '--c-book-soft', '--c-book-icoon'], Drinken: ['--c-water', '--c-water-soft', '--tile-drink-fg'],
  Supplementen: ['--c-health', '--c-health-soft', '--tile-health-fg'], Gewicht: ['--c-weight', '--c-weight-soft', '--c-weight'],
  Algemeen: ['--c-accent', '--c-accent-soft', '--c-accent-text'], Delen: ['--c-share-licht', '--c-share-soft', '--c-share'],
};
export const MENGING = 0.35;

export function tabel() {
  const rijen = [];
  for (const [thema, t] of Object.entries(THEMAS)) {
    const kaart = waarde(t, '--c-surface'), pagina = waarde(t, '--c-bg'), tekst = waarde(t, '--c-text');
    for (const [fam, [basis, zacht, icoon]] of Object.entries(FAMILIES)) {
      const vlak = meng(waarde(t, basis), MENGING, waarde(t, zacht));
      rijen.push({ thema, fam, tekst: contrast(tekst, vlak), kaart: contrast(vlak, kaart), pagina: contrast(vlak, pagina), icoon: contrast(waarde(t, icoon), vlak) });
    }
  }
  return rijen;
}

describe('zachte knop (BESLISSING 537)', () => {
  test('de menging in afgeleid.css en tabkleur.css is de gemeten menging', () => {
    const pct = Math.round(MENGING * 100);
    expect(AFGELEID).toContain(`--knop-zacht-bg: color-mix(in srgb, var(--c-accent) ${pct}%, var(--c-accent-soft))`);
    expect(TABKLEUR).toContain(`--knop-zacht-bg: color-mix(in srgb, var(--fam-basis) ${pct}%, var(--fam-zacht))`);
  });
  test('tekst op het vlak >= 4,5 en het vlak tekent zich af tegen kaart en pagina (>= 1,3)', () => {
    const rijen = tabel();
    if (process.env.KNOP_ZACHT_TABEL) for (const r of rijen) console.log(r.thema.padEnd(7), r.fam.padEnd(13), 'tekst', r.tekst.toFixed(2), 'kaart', r.kaart.toFixed(2), 'pagina', r.pagina.toFixed(2), 'icoon', r.icoon.toFixed(2));
    for (const r of rijen) {
      expect(r.tekst, `${r.thema} ${r.fam} tekst`).toBeGreaterThanOrEqual(4.5);
      expect(r.kaart, `${r.thema} ${r.fam} tegen de kaart`).toBeGreaterThanOrEqual(1.3);
      expect(r.pagina, `${r.thema} ${r.fam} tegen de pagina`).toBeGreaterThanOrEqual(1.3);
    }
  });
});

// BESLISSINGEN 519 en 546: de drie knoppen onderaan het supplementblad (Bewaren, Annuleren, Verwijderen) zijn het zachte vlak van de familie Supplementen,
// zoals overal; de gekozen chip houdt het vollere groen (--c-health). Er zijn geen eigen knoptokens meer.
const COMPONENTEN = readFileSync(new URL('../../src/stijl/componenten.css', import.meta.url), 'utf8');
describe('knoppen in het supplementblad (BESLISSING 546)', () => {
  test('het blad hoort bij de familie Supplementen en de drie knoppen zijn het zachte vlak', () => {
    expect(COMPONENTEN).toContain('.supplementkaart { --knop-zacht-bg: color-mix(in srgb, var(--f-gezond-basis) 35%, var(--f-gezond-zacht)); --knop-zacht-fg: var(--c-text); }');
    expect(COMPONENTEN).toContain('.supplementkaart__knoppen .knop--tekst { background: var(--knop-zacht-bg);');
    expect(COMPONENTEN).not.toContain('--supp-knop');
    expect(CSS).not.toContain('--c-health-knop');
    expect(TABKLEUR).not.toContain('--f-gezond-knop');
  });
  test('het zachte vlak van Supplementen: tekst 4,5 : 1 en een zichtbaar vlak tegen het blad in elk thema; de gekozen chip is voller dan het vlak van de knoppen', () => {
    for (const [thema, t] of Object.entries(THEMAS)) {
      const blad = waarde(t, '--c-surface');
      const vlak = meng(waarde(t, '--c-health'), MENGING, waarde(t, '--c-health-soft'));
      expect(contrast(waarde(t, '--c-text'), vlak), `${thema} tekst op de knop`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vlak, blad), `${thema} knop tegen het blad`).toBeGreaterThanOrEqual(1.3);
      expect(contrast(waarde(t, '--c-health'), blad), `${thema} gekozen chip`).toBeGreaterThan(contrast(vlak, blad));
    }
  });
});

// BESLISSING 544: een hoofdknop in een groep met andere knoppen heeft hetzelfde zachte vlak en dezelfde tekstkleur als haar buren. Eén regel in componenten.css
// (de houders van de groepen zetten --knop-bg en --knop-fg op de zachte tokens); de contrasten zijn die van de tabel hierboven (zelfde vlak, zelfde tekst).
describe('hoofdknop in een groep (BESLISSING 544)', () => {
  const REGEL = /:is\(([^{]*)\)\s*\{\s*--knop-bg: var\(--knop-zacht-bg\);\s*--knop-fg: var\(--knop-zacht-fg\);\s*\}/.exec(COMPONENTEN);
  test('de regel bestaat en noemt elke houder van een groep', () => {
    expect(REGEL, 'regel met --knop-bg: var(--knop-zacht-bg)').not.toBeNull();
    for (const houder of ['.maaltijd__acties', '.dialoog__acties', '.delen__knoppen', '.herstel__keuze', '.herstel__knoppen', '.slot__acties--kwijt', '.welkom__knoppen', '.installatiestrook__acties']) {
      expect(REGEL[1], houder).toContain(houder);
    }
  });
  test('de knoppen Ja en Nee in de balk van de demo krijgen dezelfde zachte tint, in de stijl van de demo', () => {
    const DEMO = readFileSync(new URL('../../src/stijl/demo.css', import.meta.url), 'utf8');
    expect(DEMO).toMatch(/\.demo-balk\.is-vraag\s*\{\s*--knop-bg: var\(--knop-zacht-bg\);\s*--knop-fg: var\(--knop-zacht-fg\);\s*\}/);
    expect(COMPONENTEN).not.toContain('demo');
  });
  test('de wisdialoog blijft buiten de regel, het supplementblad doet mee (BESLISSING 546)', () => {
    expect(REGEL[1]).toContain('.dialoog:not(.dialoog--wis)');
    expect(REGEL[1]).toContain('.supplementkaart__knoppen');
  });
  test('tekst op het zachte vlak haalt 4,5 : 1 in elke familie en elk thema (ook voor de hoofdknop, die nu dezelfde tekst heeft)', () => {
    for (const r of tabel()) expect(r.tekst, `${r.thema} ${r.fam}`).toBeGreaterThanOrEqual(4.5);
  });
  test('de gedeelde knoppenrij en de maaltijdknoppen houden hun uitgeschakelde stand (gedempt) en hover verandert de kleur niet', () => {
    expect(COMPONENTEN).toMatch(/\.knop:disabled \{ opacity: \.4;/);
    expect(COMPONENTEN).not.toMatch(/\.knop--primair:hover[^{]*\{[^}]*background/);
    expect(COMPONENTEN).not.toMatch(/\.knop--secundair:hover[^{]*\{[^}]*background/);
  });
  test('een bevestigingsvraag boven een blad volgt de familie van dat blad (tabkleur.css)', () => {
    for (const f of ['dagboek', 'drank', 'gezond', 'gewicht', 'algemeen', 'delen']) {
      expect(TABKLEUR, f).toContain(`body > .blad[data-familie="${f}"] > dialog[open]) body > dialog.dialoog:not(.supplementkaart, .dialoog--wis)`);
    }
  });
});
