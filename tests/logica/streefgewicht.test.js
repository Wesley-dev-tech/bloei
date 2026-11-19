// BESLISSING 463: het blad "Streefgewicht" hergebruikt leesKg, GRENZEN.kg en de instelling 'gewicht.streefKg'. Dezelfde instelling lees en schrijf
// je ook bij Algemeen, Gewicht (src/schermen/meer-gewicht.js): één waarde, één sleutel.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, openDb } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { GRENZEN, leesInstelling, zetInstelling } from '../../src/data/instellingen.js';
import { leesKg, opmaakKg } from '../../src/kern/getal.js';
import { TEKSTEN } from '../../src/teksten.js';

const bron = (pad) => readFileSync(join(import.meta.dirname, '..', '..', pad), 'utf8');

describe('invoerregels van het streefgewicht (leesKg en GRENZEN.kg)', () => {
  test('komma en punt geven hetzelfde getal', () => {
    expect(leesKg('65,4')).toBe(65.4);
    expect(leesKg('65.4')).toBe(65.4);
    expect(leesKg(' 65 ')).toBe(65);
  });
  test('leeg, letters en onzin zijn ongeldig', () => {
    for (const v of ['', ' ', 'abc', '6x', '-65', '65,', ',5', '65,4,1']) expect(leesKg(v), JSON.stringify(v)).toBeNull();
  });
  test('onder en boven de grens uit GRENZEN.kg zijn ongeldig; de grenzen zelf gelden', () => {
    expect(GRENZEN.kg.min).toBe(20);
    expect(GRENZEN.kg.max).toBe(300);
    expect(leesKg('19,9')).toBeNull();
    expect(leesKg('300,1')).toBeNull();
    expect(leesKg(String(GRENZEN.kg.min))).toBe(GRENZEN.kg.min);
    expect(leesKg(String(GRENZEN.kg.max))).toBe(GRENZEN.kg.max);
  });
  test('een tweede decimaal wordt, net als bij een weging, op één decimaal afgerond', () => {
    expect(leesKg('65,44')).toBe(65.4);
    expect(opmaakKg(leesKg('65,44'))).toBe('65,4 kg');
  });
});

describe('opslag van het streefgewicht', () => {
  beforeEach(async () => {
    await openDb();
    await db.instellingen.clear();
  });
  test('zetten, lezen, wissen en terugzetten (Ongedaan maken) gaan via dezelfde instelling als Algemeen, Gewicht', async () => {
    expect(await leesInstelling('gewicht.streefKg')).toBeNull();
    const meldingen = [];
    const af = luister('instelling:gewijzigd', (d) => meldingen.push(d));
    await zetInstelling('gewicht.streefKg', 64.5);
    expect(await leesInstelling('gewicht.streefKg')).toBe(64.5);
    await zetInstelling('gewicht.streefKg', null);
    expect(await leesInstelling('gewicht.streefKg')).toBeNull();
    await zetInstelling('gewicht.streefKg', 64.5);
    af();
    expect(meldingen.map((m) => m.waarde)).toEqual([64.5, null, 64.5]);
    expect(meldingen.every((m) => m.sleutel === 'gewicht.streefKg')).toBe(true);
  });
  test('beide plaatsen gebruiken dezelfde sleutel', () => {
    expect(bron('src/schermen/gewicht.js')).toContain("'gewicht.streefKg'");
    expect(bron('src/schermen/meer-gewicht.js')).toContain("'gewicht.streefKg'");
  });
});

describe('het blad Streefgewicht in de code', () => {
  const gewicht = bron('src/schermen/gewicht.js');
  const blad = gewicht.slice(gewicht.indexOf('export function openStreefBlad'), gewicht.indexOf('// Het blad "Weegdag"'));
  test('er is geen tussentijdse opslag: alleen Klaar en Verwijderen schrijven', () => {
    // zetInstelling staat alleen in bewaarEnSluit, de verwijderknop en de twee Ongedaan-maken-acties
    expect(blad.match(/zetInstelling\(/g)).toHaveLength(4);
    const invoerBlok = blad.slice(blad.indexOf('opWijzig'), blad.indexOf('invoerVeld.classList'));
    expect(invoerBlok).not.toContain('zetInstelling');
  });
  test('de kaart zet geen verzonnen beginwaarde meer en heeft geen eigen stapper', () => {
    const kaart = gewicht.slice(gewicht.indexOf('const streefKaart'), gewicht.indexOf('// ---- De lijst van wegingen'));
    expect(kaart).not.toContain('65');
    expect(kaart).not.toContain('stapper(');
    expect(kaart).toContain('openStreefBlad');
  });
});

describe('teksten van het blad Streefgewicht', () => {
  const sleutels = ['streefgewicht', 'klaar', 'annuleren', 'verwijderen', 'streefAanpassen', 'streefBewaard', 'streefGewist', 'streefWisVraag', 'streefHint', 'ongeldig', 'waarde', 'verwijderJa', 'verwijderNee'];
  test('elke tekst bestaat en bevat geen lang streepje en geen pijlteken', () => {
    for (const s of sleutels) {
      const tekst = TEKSTEN.gewicht[s];
      expect(typeof tekst, s).toBe('string');
      expect(tekst, s).not.toMatch(/[\u2013\u2014\u203a\u2039\u2192]/);
    }
  });
  test('de letterlijke teksten', () => {
    expect(TEKSTEN.gewicht.klaar).toBe('Klaar');
    expect(TEKSTEN.gewicht.streefAanpassen).toBe('Streefgewicht aanpassen');
    expect(TEKSTEN.instellingen.streefZetten).toBe('Streefgewicht zetten');
  });
});

describe('het blad Weegdag in de code (BESLISSING 477)', () => {
  const gewicht = bron('src/schermen/gewicht.js');
  const blad = gewicht.slice(gewicht.indexOf('export function openWeegdagBlad'), gewicht.indexOf('export function toon'));
  test('dezelfde instelling als Algemeen, Gewicht; alleen Klaar (en Ongedaan maken) schrijft', () => {
    expect(bron('src/schermen/meer-gewicht.js')).toContain("'gewicht.weegdag'");
    expect(blad.match(/zetInstelling\(/g)).toHaveLength(2);
    expect(blad).toContain("'gewicht.weegdag'");
    expect(blad).toContain('if (gekozen === weegdag) return'); // dezelfde dag: niets en geen melding
  });
  test('de knop opent het blad in plaats van naar Algemeen te springen', () => {
    expect(gewicht).toContain('openWeegdagBlad({ weegdag: (await leesInstelling(');
    expect(gewicht).not.toContain("window.location.hash = '#/meer/gewicht'");
  });
  test('de nieuwe tekst bestaat zonder lang streepje', () => {
    expect(TEKSTEN.gewicht.weegdagBewaard).toBe('Weegdag bewaard.');
    expect(TEKSTEN.gewicht.weegdagBewaard).not.toMatch(/[\u2013\u2014\u203a\u2039\u2192]/);
  });
});

describe('Gewicht: Weging noteren, het streefveld en de korte knoptekst (BESLISSING 492, 493, 494)', () => {
  const gewicht = bron('src/schermen/gewicht.js');
  const meerGewicht = bron('src/schermen/meer-gewicht.js');
  const wegingBlad = gewicht.slice(gewicht.indexOf('async function openWegingBlad'), gewicht.indexOf('function klaarEnAnnuleer'));
  test('492: het blad Weging noteren hergebruikt klaarEnAnnuleer en bladMetKnoppen (geen eigen knoppenrij)', () => {
    expect(wegingBlad).toContain('klaarEnAnnuleer(');
    expect(wegingBlad).toContain('bladMetKnoppen(');
    expect(wegingBlad).not.toContain('acties: [');
    expect(gewicht.match(/streefblad__knoppen/g)).toHaveLength(1); // de klasse staat alleen in de gedeelde helper
  });
  test('493: het gedeelde onderdeel stapper() is niet gewijzigd, het veld zit alleen in meer-gewicht', () => {
    expect(bron('src/ui/componenten.js')).not.toContain('streefveld');
    expect(meerGewicht).toContain('leesKg');
    expect(meerGewicht).toContain("inputmode: 'decimal'");
    expect(meerGewicht).toContain("t('instellingen.streefVeld')");
    expect(meerGewicht).toContain("setAttribute('aria-label', t('algemeen.dagen.'");
  });
  test('494: twee spans, de volle tekst als schermlezernaam; de korte teksten bestaan', () => {
    expect(gewicht).toContain("h('span', { class: 'knop__vol' }, vol)");
    expect(gewicht).toContain('label: vol');
    expect(TEKSTEN.instellingen.streefZettenKort).toBe('Zetten');
    expect(TEKSTEN.gewicht.aanpassen).toBe('Aanpassen');
    expect(TEKSTEN.gewicht.weegdagAanpassen).toBe('Weegdag aanpassen');
    expect(TEKSTEN.instellingen.streefVeld).toBe('Streefgewicht in kg');
    expect(TEKSTEN.instellingen.streefVeld).not.toMatch(/[\u2013\u2014\u203a\u2039\u2192\u00d7\u2212\u2026]/);
  });
});
