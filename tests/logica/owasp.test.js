// OWASP-doorloop van 16 november, OW-05: bovengrenzen voor vrije tekst in de gegevenslaag. Te lange tekst wordt bij het schrijven
// afgekapt (geen fout, geen verloren invoer), op een tekengrens; wat al bewaard is, wordt bij het lezen niet afgekapt.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { MAX_LENGTE, begrens } from '../../src/data/grenzen.js';
import { leesInstelling, zetInstelling } from '../../src/data/instellingen.js';
import { leesDag, zetNotitie } from '../../src/data/dagen.js';
import { bewaarMaaltijd, leesMaaltijden } from '../../src/data/maaltijden.js';
import { voegFavorietToe, leesFavorieten } from '../../src/data/favorieten.js';
import { voegSupplementToe, wijzigSupplement, leesSupplementen } from '../../src/data/supplementen.js';
import { herstelVangnet, VANGNET_SLEUTEL } from '../../src/data/vangnet.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GISTEREN = plusDagen(vandaag(), -1);

beforeEach(async () => {
  await openDb();
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => vi.unstubAllGlobals());

describe('begrens', () => {
  it('laat korte tekst ongemoeid en kapt lange af op de grens', () => {
    expect(begrens('Lies', 60)).toBe('Lies');
    expect(begrens('a'.repeat(100), 60)).toBe('a'.repeat(60));
    expect(begrens(undefined, 5)).toBe('');
    expect(begrens(42, 5)).toBe('42');
  });
  it('splitst nooit een teken: geen half surrogaatpaar, geen halve emoji met huidskleur of ZWJ', () => {
    const uit = begrens('a'.repeat(59) + '😀', 60);
    expect(uit).toBe('a'.repeat(59));
    for (const emoji of ['👍🏽', '👩‍👩‍👧', 'é']) {
      const tekst = 'a'.repeat(58) + emoji + 'bbb';
      const r = begrens(tekst, 60);
      expect(r.length).toBeLessThanOrEqual(60);
      expect(tekst.startsWith(r)).toBe(true);
      // Ofwel het hele teken, ofwel niets ervan.
      expect([`${'a'.repeat(58)}`, `${'a'.repeat(58)}${emoji}`]).toContain(r.endsWith('b') ? r.replace(/b+$/, '') : r);
      expect(r).not.toMatch(/[\uD800-\uDBFF]$/);
    }
  });
  it('blijft snel bij een tekst van megabytes', () => {
    const groot = 'x'.repeat(5 * 1024 * 1024);
    const t0 = performance.now();
    expect(begrens(groot, MAX_LENGTE.notitie)).toHaveLength(MAX_LENGTE.notitie);
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it('de grenzen zijn ruim en staan op één plek', () => {
    expect(MAX_LENGTE.naam).toBeGreaterThanOrEqual(40); // het welkomveld heeft al maxLength 40
    expect(MAX_LENGTE.favoriet).toBeGreaterThanOrEqual(MAX_LENGTE.maaltijd);
    expect(MAX_LENGTE.notitie).toBeGreaterThanOrEqual(5000);
    expect(Object.isFrozen(MAX_LENGTE)).toBe(true);
  });
});

describe('OW-05: de schrijfpaden begrenzen', () => {
  it('profielnaam', async () => {
    await zetInstelling('profiel.naam', 'N'.repeat(5000));
    expect(await leesInstelling('profiel.naam')).toBe('N'.repeat(MAX_LENGTE.naam));
    // Andere instellingen blijven ongemoeid.
    await zetInstelling('thema.keuze', 'salie');
    expect(await leesInstelling('thema.keuze')).toBe('salie');
  });

  it('maaltijdtekst (ook via het vangnet)', async () => {
    await bewaarMaaltijd(GISTEREN, 'ontbijt', { tekst: 'm'.repeat(MAX_LENGTE.maaltijd + 500) });
    expect((await leesMaaltijden(GISTEREN)).ontbijt.tekst).toHaveLength(MAX_LENGTE.maaltijd);
    const kaart = new Map();
    vi.stubGlobal('localStorage', { getItem: (k) => kaart.get(k) ?? null, setItem: (k, v) => kaart.set(k, String(v)), removeItem: (k) => kaart.delete(k) });
    localStorage.setItem(VANGNET_SLEUTEL, JSON.stringify([{ soort: 'maaltijd', datum: GISTEREN, maaltijd: 'avondmaal', tekst: 'v'.repeat(1e6) }]));
    expect(await herstelVangnet()).toBe(1);
    expect((await leesMaaltijden(GISTEREN)).avondmaal.tekst).toHaveLength(MAX_LENGTE.maaltijd);
  });

  it('dagboeknotitie: 1 MB wordt afgekapt in plaats van bewaard', async () => {
    await zetNotitie(GISTEREN, 'n'.repeat(1024 * 1024));
    expect((await leesDag(GISTEREN)).notitie).toHaveLength(MAX_LENGTE.notitie);
  });

  it('favoriet', async () => {
    const f = await voegFavorietToe('f'.repeat(MAX_LENGTE.favoriet * 3));
    expect(f.tekst).toHaveLength(MAX_LENGTE.favoriet);
    expect((await leesFavorieten())[0].tekst).toHaveLength(MAX_LENGTE.favoriet);
  });

  it('supplement: naam en dosis bij toevoegen en wijzigen', async () => {
    const s = await voegSupplementToe({ naam: 'S'.repeat(1000), dosis: 'd'.repeat(1000) });
    expect(s.naam).toHaveLength(MAX_LENGTE.supplementNaam);
    expect(s.dosis).toHaveLength(MAX_LENGTE.supplementDosis);
    const w = await wijzigSupplement(s.id, { naam: 'T'.repeat(1000), dosis: 'e'.repeat(1000), hoeveelheid: 'h'.repeat(1000) });
    expect(w.naam).toHaveLength(MAX_LENGTE.supplementNaam);
    expect(w.dosis).toHaveLength(MAX_LENGTE.supplementDosis);
    expect(w.hoeveelheid).toHaveLength(MAX_LENGTE.supplementVeld);
  });

  it('wat al langer bewaard is, wordt bij het lezen niet afgekapt (en een wijziging van iets anders laat het staan)', async () => {
    const lang = 'L'.repeat(MAX_LENGTE.notitie * 2);
    await db.dagen.put({ datum: GISTEREN, notitie: lang, voorbeeld: false, gewijzigdOp: 1 });
    await db.instellingen.put({ sleutel: 'profiel.naam', waarde: 'X'.repeat(500) });
    await db.maaltijden.put({ datum: GISTEREN, soort: 'middagmaal', tijd: '12:00', tekst: 'M'.repeat(MAX_LENGTE.maaltijd * 2), fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
    const sid = await db.supplementen.add({ naam: 'Z'.repeat(500), dosis: '', hoeveelheid: '', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
    expect((await leesDag(GISTEREN)).notitie).toBe(lang);
    expect(await leesInstelling('profiel.naam')).toHaveLength(500);
    expect((await leesMaaltijden(GISTEREN)).middagmaal.tekst).toHaveLength(MAX_LENGTE.maaltijd * 2);
    expect((await leesSupplementen()).find((s) => s.id === sid).naam).toHaveLength(500);
    // Alleen het uur van de maaltijd wijzigen: de tekst blijft heel.
    await bewaarMaaltijd(GISTEREN, 'middagmaal', { tijd: '12:30' });
    expect((await leesMaaltijden(GISTEREN)).middagmaal.tekst).toHaveLength(MAX_LENGTE.maaltijd * 2);
    // Alleen de momenten van het supplement wijzigen: de naam blijft heel.
    await wijzigSupplement(sid, { momenten: ['avond'] });
    expect((await leesSupplementen()).find((s) => s.id === sid).naam).toHaveLength(500);
  });
});

// OW-09: de vermeldingen die de licenties van meegeleverde code, iconen en lettertypes vragen, staan in de gebouwde site
// (public/ wordt door Vite ongewijzigd naar dist/ gekopieerd). De teksten moeten letterlijk die uit node_modules zijn.
describe('OW-09: licenties van derden in de bouw', () => {
  const wortel = join(import.meta.dirname, '..', '..');
  const lees = (...p) => readFileSync(join(wortel, ...p), 'utf8').replace(/\r\n/g, '\n').trim();
  const pad = join(wortel, 'public', 'licenties-derden.txt');

  it('public/licenties-derden.txt bestaat en bevat elke vereiste licentietekst letterlijk', () => {
    expect(existsSync(pad)).toBe(true);
    const tekst = readFileSync(pad, 'utf8').replace(/\r\n/g, '\n');
    const vereist = {
      'Dexie (Apache-2.0 §4a: de licentie)': ['node_modules', 'dexie', 'LICENSE'],
      'Dexie (Apache-2.0 §4d: de NOTICE)': ['node_modules', 'dexie', 'NOTICE'],
      'fflate (MIT)': ['node_modules', 'fflate', 'LICENSE'],
      'Bootstrap (MIT)': ['node_modules', 'bootstrap', 'LICENSE'],
      'Font Awesome Free (CC BY 4.0 / OFL / MIT)': ['node_modules', '@fortawesome', 'fontawesome-free', 'LICENSE.txt'],
      'Jost (OFL 1.1)': ['node_modules', '@fontsource-variable', 'jost', 'LICENSE'],
      'Jost statisch (OFL 1.1)': ['node_modules', '@fontsource', 'jost', 'LICENSE'],
      'Cormorant Garamond (OFL 1.1)': ['node_modules', '@fontsource', 'cormorant-garamond', 'LICENSE'],
    };
    for (const [naam, bron] of Object.entries(vereist)) expect(tekst.includes(lees(...bron)), naam).toBe(true);
    // De versies kloppen met wat er geïnstalleerd is.
    for (const p of ['dexie', 'fflate', 'bootstrap']) {
      const { version } = JSON.parse(lees('node_modules', p, 'package.json'));
      expect(tekst, p).toContain(version);
    }
  });

  it('elk meegeleverd Font Awesome-icoon draagt zijn eigen vermelding', () => {
    for (const stijl of ['solid', 'regular']) {
      for (const n of readdirSync(join(wortel, 'src', 'iconen', stijl))) {
        expect(readFileSync(join(wortel, 'src', 'iconen', stijl, n), 'utf8'), n).toMatch(/Font Awesome Free .*CC BY 4\.0/);
      }
    }
  });
});
