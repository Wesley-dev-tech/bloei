// De supplementenlijst als bestand (BESLISSING 696): maakBestand, leesBestand, vergelijk en neemOver.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { leesSupplementen, schemaVanDag, voegSupplementToe, zetInname } from '../../src/data/supplementen.js';
import { wisAlles } from '../../src/data/wissen.js';
import { neemOver } from '../../src/data/supplementenbestand.js';
import { MAX_INTERVAL_DAGEN, controleer, leegFormulier, naarAanroep } from '../../src/logica/supplementformulier.js';
import {
  BESTANDSNAAM, BESTANDSTYPE, MAX_BESTAND_BYTES, MAX_SUPPLEMENTEN, REDENEN, SOORT, VERSIE, isEchteDatum, leesBestand, maakBestand, sleutelVan, vergelijk,
} from '../../src/logica/supplementenbestand.js';

const dagelijks = (naam, extra = {}) => ({ naam, hoeveelheid: '1 pilletje', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['ochtend'], ...extra });
const bestand = (supplementen, kop = {}) => JSON.stringify({ soort: SOORT, versie: VERSIE, supplementen, ...kop });
const gisteren = () => plusDagen(vandaag(), -1);

// Rijen zoals de database ze heeft, met alles erop en eraan.
const rij = (extra) => ({ id: 1, naam: 'Vitamine D', dosis: '1 pilletje per dag', hoeveelheid: '1 pilletje', aanwijzing: 'bij het ontbijt', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1731000000000, ...extra });

describe('maakBestand', () => {
  test('het formaat: soort, versie en per supplement alleen de lijst zelf', () => {
    const tekst = maakBestand([
      rij({ id: 2, naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' }, volgorde: 2, tot: '2027-03-01' }),
      rij(),
    ]);
    expect(JSON.parse(tekst)).toEqual({
      soort: 'bloei-supplementenlijst',
      versie: 1,
      supplementen: [
        { naam: 'Vitamine D', hoeveelheid: '1 pilletje', aanwijzing: 'bij het ontbijt', ritme: { soort: 'dagelijks' }, momenten: ['ochtend'] },
        { naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' }, momenten: [], tot: '2027-03-01' },
      ],
    });
    expect(BESTANDSNAAM).toBe('bloei-supplementenlijst.txt');
    expect(BESTANDSTYPE).toBe('text/plain');
  });

  test('een bestand uit de tijd van de oude naam (.json) wordt nog gelezen: alleen de inhoud telt', () => {
    const oud = JSON.stringify({ soort: SOORT, versie: VERSIE, supplementen: [dagelijks('Vitamine D')] }, null, 2) + '\n';
    const uit = leesBestand(oud);
    expect(uit.ok).toBe(true);
    expect(uit.supplementen.map((s) => s.naam)).toEqual(['Vitamine D']);
  });

  test('geen enkel ander veld komt mee, ook niet een veld dat de database later bijkrijgt', () => {
    const tekst = maakBestand([rij({ gebruiker: 'iemand', notitie: 'privé', innames: [{ datum: '2026-11-01' }], ritme: { soort: 'maand', start: '2026-10-05', extra: 1 }, momenten: [] })]);
    const data = JSON.parse(tekst);
    expect(Object.keys(data)).toEqual(['soort', 'versie', 'supplementen']);
    expect(Object.keys(data.supplementen[0])).toEqual(['naam', 'hoeveelheid', 'aanwijzing', 'ritme', 'momenten']);
    expect(data.supplementen[0].ritme).toEqual({ soort: 'maand', start: '2026-10-05' });
    for (const woord of ['id', 'volgorde', 'actief', 'voorbeeld', 'aangemaaktOp', 'dosis', 'gebruiker', 'notitie', 'innames', 'extra', '1731000000000']) {
      expect(tekst).not.toContain(`"${woord}"`);
    }
    expect(tekst).not.toContain('1731000000000');
  });

  test('stabiele volgorde (volgorde, dan id), zonder inactieve supplementen, telkens dezelfde tekst', () => {
    const lijst = [rij({ id: 3, naam: 'C', volgorde: 2 }), rij({ id: 1, naam: 'A', volgorde: 1 }), rij({ id: 2, naam: 'B', volgorde: 2 }), rij({ id: 4, naam: 'Weg', volgorde: 0, actief: false })];
    const tekst = maakBestand(lijst);
    expect(JSON.parse(tekst).supplementen.map((s) => s.naam)).toEqual(['A', 'B', 'C']);
    expect(maakBestand([...lijst].reverse())).toBe(tekst);
  });

  test('een oud supplement zonder hoeveelheid neemt zijn dosis, een periodiek supplement heeft geen momenten', () => {
    const tekst = maakBestand([rij({ hoeveelheid: undefined, aanwijzing: undefined, dosis: '1 schepje' }), rij({ id: 2, volgorde: 2, naam: 'B12', ritme: { soort: 'maand', start: '2026-10-05' }, momenten: ['ochtend'] })]);
    const [a, b] = JSON.parse(tekst).supplementen;
    expect(a).toMatchObject({ hoeveelheid: '1 schepje', aanwijzing: '' });
    expect(b.momenten).toEqual([]);
  });

  test('besturingstekens en te lange tekst worden opgeschoond, zodat het eigen bestand altijd weer leesbaar is', () => {
    const tekst = maakBestand([rij({ naam: 'Mag\tne\u202Esium\u0000' + 'x'.repeat(200), hoeveelheid: '1\nschepje', aanwijzing: '\ud800oplossen' })]);
    const uit = leesBestand(tekst);
    expect(uit.ok).toBe(true);
    expect(uit.supplementen[0].naam.length).toBeLessThanOrEqual(100);
    expect(uit.supplementen[0].hoeveelheid).toBe('1 schepje');
    expect(uit.supplementen[0].aanwijzing).toBe('oplossen');
  });

  test('heen en terug: wat maakBestand schrijft, geeft leesBestand ongewijzigd terug', () => {
    const lijst = [
      rij(),
      rij({ id: 2, volgorde: 2, naam: 'Magnesium', hoeveelheid: '1 schepje', aanwijzing: 'oplossen in water', momenten: ['middag', 'avond'], vanaf: '2026-11-01', tot: '2026-12-31' }),
      rij({ id: 3, volgorde: 3, naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' } }),
      rij({ id: 4, volgorde: 4, naam: 'B12-injectie', hoeveelheid: '', aanwijzing: '', momenten: [], ritme: { soort: 'maand', start: '2026-01-31' } }),
    ];
    const uit = leesBestand(maakBestand(lijst));
    expect(uit.ok).toBe(true);
    expect(uit.supplementen).toEqual(JSON.parse(maakBestand(lijst)).supplementen);
  });
});

describe('leesBestand: een goed bestand', () => {
  test('geeft de supplementen terug, ook met een BOM-teken vooraan en spaties rond de tekst', () => {
    const uit = leesBestand('\uFEFF' + bestand([dagelijks('  Vitamine D '), { naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' }, momenten: [], vanaf: '2026-11-01' }]));
    expect(uit).toEqual({
      ok: true,
      supplementen: [
        { naam: 'Vitamine D', hoeveelheid: '1 pilletje', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['ochtend'] },
        { naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' }, momenten: [], vanaf: '2026-11-01' },
      ],
    });
  });

  test('momenten komen in de vaste volgorde en elk één keer', () => {
    const uit = leesBestand(bestand([dagelijks('Magnesium', { momenten: ['avond', 'ochtend', 'avond'] })]));
    expect(uit.supplementen[0].momenten).toEqual(['ochtend', 'avond']);
  });

  test('de grenzen zelf zijn toegelaten: 100 supplementen, 100 tekens naam, 120 tekens hoeveelheid en aanwijzing, interval 3650', () => {
    const lang = dagelijks('n'.repeat(100), { hoeveelheid: 'h'.repeat(120), aanwijzing: 'a'.repeat(120) });
    expect(leesBestand(bestand(Array.from({ length: MAX_SUPPLEMENTEN }, () => lang))).ok).toBe(true);
    expect(leesBestand(bestand([{ ...dagelijks('X'), ritme: { soort: 'interval', dagen: 3650, start: '2026-01-01' }, momenten: [] }])).ok).toBe(true);
  });
});

describe('leesBestand: weigeren met een reden', () => {
  const reden = (tekst) => leesBestand(tekst).reden;

  test('elke reden komt uit de vaste lijst', () => {
    expect(REDENEN).toEqual(['leeg', 'te-groot', 'onleesbaar', 'ander-bestand', 'nieuwere-versie', 'lege-lijst', 'te-veel', 'ongeldig']);
  });

  test('leeg, geen tekst, geen JSON', () => {
    expect(reden('')).toBe('leeg');
    expect(reden('  \n ')).toBe('leeg');
    expect(reden(undefined)).toBe('onleesbaar');
    expect(reden('{"soort": "bloei-supplementenlijst"')).toBe('onleesbaar');
    expect(reden('Vitamine D, 1 pilletje')).toBe('onleesbaar');
  });

  test('te groot: in tekens en in bytes', () => {
    expect(reden(' '.repeat(MAX_BESTAND_BYTES + 1))).toBe('te-groot');
    expect(reden('é'.repeat(MAX_BESTAND_BYTES / 2 + 1))).toBe('te-groot'); // minder tekens dan de grens, maar twee bytes per teken
  });

  test('een ander bestand: geen object, een andere soort of geen soort', () => {
    expect(reden('[]')).toBe('ander-bestand');
    expect(reden('null')).toBe('ander-bestand');
    expect(reden('"bloei-supplementenlijst"')).toBe('ander-bestand');
    expect(reden(JSON.stringify({ soort: 'bloei-herstelcode', versie: 1, supplementen: [] }))).toBe('ander-bestand');
    expect(reden(JSON.stringify({ versie: 1, supplementen: [dagelijks('A')] }))).toBe('ander-bestand');
  });

  test('de versie: een nieuwere versie apart, een ongeldige als ongeldig', () => {
    expect(reden(bestand([dagelijks('A')], { versie: 2 }))).toBe('nieuwere-versie');
    for (const versie of [0, -1, 1.5, '1', null]) expect(reden(bestand([dagelijks('A')], { versie }))).toBe('ongeldig');
    expect(reden(JSON.stringify({ soort: SOORT, supplementen: [dagelijks('A')] }))).toBe('ongeldig');
  });

  test('een lege lijst, te veel supplementen, geen lijst', () => {
    expect(reden(bestand([]))).toBe('lege-lijst');
    expect(reden(bestand(Array.from({ length: MAX_SUPPLEMENTEN + 1 }, (_, i) => dagelijks('S' + i))))).toBe('te-veel');
    expect(reden(bestand({ 0: dagelijks('A') }))).toBe('ongeldig');
  });

  test('onbekende velden worden geweigerd: in de kop, in een supplement en in het ritme', () => {
    expect(reden(bestand([dagelijks('A')], { gebruiker: 'iemand' }))).toBe('ongeldig');
    expect(leesBestand(bestand([dagelijks('A'), dagelijks('B', { id: 7 })]))).toEqual({ ok: false, reden: 'ongeldig', nummer: 2 });
    expect(reden(bestand([dagelijks('A', { dosis: '1 pil' })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { ritme: { soort: 'dagelijks', start: '2026-11-01' } })]))).toBe('ongeldig');
    expect(reden(bestand([{ ...dagelijks('A'), ritme: { soort: 'maand', start: '2026-11-01', dagen: 30 }, momenten: [] }]))).toBe('ongeldig');
  });

  test('prototype-vervuiling: __proto__, constructor en prototype worden geweigerd en vervuilen niets', () => {
    const vuil = [
      `{"soort":"${SOORT}","versie":1,"supplementen":[{"naam":"A","hoeveelheid":"","aanwijzing":"","ritme":{"soort":"dagelijks"},"momenten":["ochtend"],"__proto__":{"vervuild":true}}]}`,
      `{"soort":"${SOORT}","versie":1,"__proto__":{"vervuild":true},"supplementen":[{"naam":"A","hoeveelheid":"","aanwijzing":"","ritme":{"soort":"dagelijks"},"momenten":["ochtend"]}]}`,
      `{"soort":"${SOORT}","versie":1,"supplementen":[{"naam":"A","hoeveelheid":"","aanwijzing":"","ritme":{"soort":"dagelijks","__proto__":{"vervuild":true}},"momenten":["ochtend"]}]}`,
      bestand([dagelijks('A', { constructor: { prototype: { vervuild: true } } })]),
      bestand([dagelijks('A', { prototype: {} })]),
    ];
    for (const tekst of vuil) expect(reden(tekst)).toBe('ongeldig');
    expect({}.vervuild).toBeUndefined();
    expect(Object.prototype.vervuild).toBeUndefined();
  });

  test('besturingstekens, omgekeerde schrijfrichting en halve tekens in een tekst', () => {
    for (const naam of ['Vit\u0000amine', 'Vitamine\nD', 'Vitamine\tD', 'Vitamine\u007F', 'Vitamine\u0085', '\u202EVitamine', 'Vit\u2066amine', 'Vit\u2028amine', 'Vit\uFEFFamine', 'Vitamine\ud800', '\udc00Vitamine']) {
      expect(reden(bestand([dagelijks(naam)]))).toBe('ongeldig');
    }
    expect(reden(bestand([dagelijks('A', { aanwijzing: 'los op\r\nin water' })]))).toBe('ongeldig');
    expect(leesBestand(bestand([dagelijks('Vitamine D3 \uD83C\uDF3F')])).ok).toBe(true); // een echt teken met twee helften mag
  });

  test('lengtegrenzen op elke tekst', () => {
    expect(reden(bestand([dagelijks('n'.repeat(101))]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { hoeveelheid: 'h'.repeat(121) })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { aanwijzing: 'a'.repeat(121) })]))).toBe('ongeldig');
  });

  test('verplichte velden en hun soort', () => {
    expect(reden(bestand([dagelijks('   ')]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks(42)]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { hoeveelheid: null })]))).toBe('ongeldig');
    for (const veld of ['naam', 'hoeveelheid', 'aanwijzing', 'ritme', 'momenten']) {
      const s = dagelijks('A');
      delete s[veld];
      expect(reden(bestand([s]))).toBe('ongeldig');
    }
    expect(reden(bestand(['Vitamine D']))).toBe('ongeldig');
    expect(reden(bestand([null]))).toBe('ongeldig');
    expect(reden(bestand([[]]))).toBe('ongeldig');
  });

  test('momenten en ritme: alleen toegelaten waarden, dezelfde regels als het formulier', () => {
    expect(reden(bestand([dagelijks('A', { momenten: [] })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { momenten: ['nacht'] })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { momenten: 'ochtend' })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { momenten: ['ochtend', 'ochtend', 'ochtend', 'ochtend'] })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { ritme: { soort: 'wekelijks' } })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { ritme: { soort: 'toString' } })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { ritme: 'dagelijks' })]))).toBe('ongeldig');
    const periodiek = (ritme, momenten = []) => ({ ...dagelijks('IJzerspuit'), ritme, momenten });
    expect(reden(bestand([periodiek({ soort: 'interval', dagen: 14, start: '2026-11-09' }, ['ochtend'])]))).toBe('ongeldig'); // periodiek zonder momenten
    for (const dagen of [1, 0, 2.5, '14', 3651, null]) expect(reden(bestand([periodiek({ soort: 'interval', dagen, start: '2026-11-09' })]))).toBe('ongeldig');
    expect(reden(bestand([periodiek({ soort: 'interval', dagen: 14 })]))).toBe('ongeldig');
    expect(reden(bestand([periodiek({ soort: 'maand' })]))).toBe('ongeldig');
  });

  test('datums: echte kalenderdagen binnen redelijke jaren, tot niet voor vanaf', () => {
    for (const d of ['2026-02-30', '2026-13-01', '2026-00-10', '26-11-01', '2026-1-01', '1969-12-31', '2100-01-01', '2026-11-01T00:00', 20261101]) {
      expect(isEchteDatum(d)).toBe(false);
      expect(reden(bestand([dagelijks('A', { vanaf: d })]))).toBe('ongeldig');
      expect(reden(bestand([{ ...dagelijks('A'), ritme: { soort: 'maand', start: d }, momenten: [] }]))).toBe('ongeldig');
    }
    expect(isEchteDatum('2028-02-29')).toBe(true);
    expect(reden(bestand([dagelijks('A', { vanaf: '' })]))).toBe('ongeldig');
    expect(reden(bestand([dagelijks('A', { vanaf: '2026-12-01', tot: '2026-11-30' })]))).toBe('ongeldig');
    expect(leesBestand(bestand([dagelijks('A', { vanaf: '2026-12-01', tot: '2026-12-01' })])).ok).toBe(true);
  });

  test('een bestand dat deels fout is, wordt helemaal geweigerd, met het nummer van het eerste foute supplement', () => {
    const uit = leesBestand(bestand([dagelijks('Vitamine D'), dagelijks('Magnesium'), dagelijks('Zink', { momenten: ['nacht'] }), dagelijks('Omega 3')]));
    expect(uit).toEqual({ ok: false, reden: 'ongeldig', nummer: 3 });
    expect(uit.supplementen).toBeUndefined();
  });
});

describe('vergelijk', () => {
  const bestaand = [{ id: 1, naam: 'Vitamine D', hoeveelheid: '1 pilletje' }, { id: 2, naam: 'Magnesium', hoeveelheid: '1 schepje' }, { id: 3, naam: 'Zink', hoeveelheid: '1 tablet' }];

  test('hetzelfde supplement: dezelfde naam, zonder hoofdletters en zonder spaties voor, na of dubbel ertussen', () => {
    expect(sleutelVan({ naam: '  vitamine  D ' })).toBe(sleutelVan({ naam: 'Vitamine D' }));
    expect(sleutelVan({ naam: 'VITAMINE D' })).toBe('vitamine d');
    expect(sleutelVan({ naam: 'Vitamine D3' })).not.toBe(sleutelVan({ naam: 'Vitamine D' }));
    expect(sleutelVan({ naam: 'Cafe\u0301' })).toBe(sleutelVan({ naam: 'Café' })); // hetzelfde teken op twee manieren geschreven
  });

  test('toevoegen: wat er al staat, wordt overgeslagen, ook met een andere hoeveelheid', () => {
    const nieuw = [{ naam: 'magnesium ', hoeveelheid: '2 schepjes' }, { naam: 'Omega 3' }, { naam: 'IJzerspuit' }, { naam: 'VITAMINE D' }];
    const { toevoegen } = vergelijk(bestaand, nieuw);
    expect(toevoegen.erbij.map((s) => s.naam)).toEqual(['Omega 3', 'IJzerspuit']);
    expect(toevoegen.alAanwezig.map((s) => s.naam)).toEqual(['magnesium ', 'VITAMINE D']);
  });

  test('vervangen: wat verdwijnt, wat blijft en wat erbij komt', () => {
    const nieuw = [{ naam: 'Omega 3' }, { naam: 'Magnesium', hoeveelheid: '2 schepjes' }];
    const { vervangen } = vergelijk(bestaand, nieuw);
    expect(vervangen.weg.map((s) => s.id)).toEqual([1, 3]);
    expect(vervangen.blijft).toEqual([{ bestaand: bestaand[1], nieuw: nieuw[1] }]);
    expect(vervangen.erbij.map((s) => s.naam)).toEqual(['Omega 3']);
  });

  test('twee keer dezelfde naam wordt in volgorde gekoppeld; wat overschiet, valt onder weg of erbij', () => {
    const oud = [{ id: 1, naam: 'Magnesium' }, { id: 2, naam: 'Magnesium' }];
    expect(vergelijk(oud, [{ naam: 'Magnesium' }]).vervangen).toMatchObject({ blijft: [{ bestaand: { id: 1 } }], weg: [{ id: 2 }], erbij: [] });
    const r = vergelijk([oud[0]], [{ naam: 'Magnesium', hoeveelheid: 'a' }, { naam: 'magnesium', hoeveelheid: 'b' }]);
    expect(r.vervangen).toMatchObject({ blijft: [{ bestaand: { id: 1 }, nieuw: { hoeveelheid: 'a' } }], weg: [], erbij: [{ hoeveelheid: 'b' }] });
    expect(r.toevoegen.erbij).toEqual([]); // bij toevoegen staat magnesium er al: niets dubbel
  });

  test('een lege app: alles komt erbij, er verdwijnt niets', () => {
    const r = vergelijk([], [{ naam: 'A' }, { naam: 'B' }]);
    expect(r.toevoegen.erbij).toHaveLength(2);
    expect(r.vervangen).toMatchObject({ weg: [], blijft: [], erbij: [{ naam: 'A' }, { naam: 'B' }] });
  });

  test('de andere definitie (naam en hoeveelheid) zou bij toevoegen een tweede magnesium zetten: daarom niet gekozen', () => {
    const sleutelMetHoeveelheid = (s) => sleutelVan(s) + '|' + String(s.hoeveelheid ?? '').trim().toLowerCase();
    const nieuw = [{ naam: 'Magnesium', hoeveelheid: '2 schepjes' }];
    const anders = nieuw.filter((n) => !bestaand.map(sleutelMetHoeveelheid).includes(sleutelMetHoeveelheid(n)));
    expect(anders).toHaveLength(1); // die definitie: Magnesium komt er een tweede keer bij
    expect(vergelijk(bestaand, nieuw).toevoegen.erbij).toHaveLength(0); // de gekozen definitie: niet dubbel
  });
});

describe('neemOver', () => {
  beforeEach(async () => {
    await openDb();
    await wisAlles();
  });

  const uitBestand = (lijst) => {
    const uit = leesBestand(bestand(lijst));
    expect(uit.ok).toBe(true);
    return uit.supplementen;
  };

  test('in een lege app: alles komt erbij, in de volgorde van het bestand, met dezelfde velden als een gewoon toegevoegd supplement', async () => {
    const gewoon = await voegSupplementToe({ naam: 'Proef', hoeveelheid: '1', aanwijzing: '', momenten: ['ochtend'] });
    await db.supplementen.clear();
    const uit = await neemOver(uitBestand([dagelijks('Vitamine D'), { naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' }, momenten: [], tot: '2027-03-01' }]), { wijze: 'toevoegen' });
    expect(uit).toEqual({ erbij: 2, alAanwezig: 0, bijgewerkt: 0, weg: 0, inactief: 0 });
    const lijst = await leesSupplementen();
    expect(lijst.map((s) => s.naam)).toEqual(['Vitamine D', 'IJzerspuit']);
    expect(Object.keys(lijst[0]).sort()).toEqual(Object.keys(gewoon).sort());
    expect(lijst[0]).toMatchObject({ actief: true, voorbeeld: false, dosis: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' } });
    expect(lijst[1]).toMatchObject({ momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' }, tot: '2027-03-01' });
  });

  test('toevoegen: wat er al staat blijft ongemoeid en komt er niet dubbel bij; het nieuwe komt achteraan', async () => {
    const mg = await voegSupplementToe({ naam: 'Magnesium', hoeveelheid: '1 schepje', aanwijzing: 'oplossen in water', momenten: ['avond'] });
    await zetInname(gisteren(), mg.id, 'avond', true);
    const uit = await neemOver(uitBestand([dagelijks('magnesium', { hoeveelheid: '2 schepjes' }), dagelijks('Omega 3')]), { wijze: 'toevoegen' });
    expect(uit).toMatchObject({ erbij: 1, alAanwezig: 1 });
    const lijst = await leesSupplementen();
    expect(lijst.map((s) => s.naam)).toEqual(['Magnesium', 'Omega 3']);
    expect(lijst[0]).toEqual(mg); // ongemoeid
    expect(await db.momentinnames.count()).toBe(1);
  });

  test('vervangen: de afgevinkte dagen blijven staan, hetzelfde supplement houdt zijn id, de rest wordt inactief of verdwijnt', async () => {
    const mg = await voegSupplementToe({ naam: 'Magnesium', hoeveelheid: '1 schepje', aanwijzing: '', momenten: ['ochtend'], vanaf: '2026-01-01' });
    const zink = await voegSupplementToe({ naam: 'Zink', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'] });
    const ijzer = await voegSupplementToe({ naam: 'IJzer', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['middag'] });
    await zetInname(gisteren(), mg.id, 'ochtend', true);
    await zetInname(gisteren(), zink.id, 'ochtend', true);
    const voor = await db.momentinnames.toArray();

    const uit = await neemOver(uitBestand([dagelijks('Vitamine D'), dagelijks('Magnesium', { hoeveelheid: '2 schepjes', momenten: ['avond'] })]), { wijze: 'vervangen' });
    expect(uit).toEqual({ erbij: 1, alAanwezig: 0, bijgewerkt: 1, weg: 2, inactief: 1 });

    // Het dagboek is niet aangeraakt.
    expect(await db.momentinnames.toArray()).toEqual(voor);
    // De lijst is die van het bestand, in de volgorde van het bestand.
    const lijst = await leesSupplementen();
    expect(lijst.map((s) => s.naam)).toEqual(['Vitamine D', 'Magnesium']);
    const nieuwMg = lijst[1];
    expect(nieuwMg).toMatchObject({ id: mg.id, hoeveelheid: '2 schepjes', momenten: ['avond'], dosis: '' });
    expect(nieuwMg.vanaf).toBeUndefined(); // de periode komt alleen uit het bestand
    // Zink had een vinkje: inactief bewaard. IJzer had er geen: echt weg.
    expect(await db.supplementen.get(zink.id)).toMatchObject({ actief: false });
    expect(await db.supplementen.get(ijzer.id)).toBeUndefined();

    // Wat ze gisteren ziet: Zink en Magnesium afgevinkt in de ochtend, Magnesium één keer (niet als oud afgevinkt en nieuw open ernaast).
    // Vitamine D is nieuw en telt vanaf de dag van overnemen (BESLISSING 698): gisteren staat het er niet.
    const schema = await schemaVanDag(gisteren());
    const ochtend = schema.momenten.find((m) => m.moment === 'ochtend');
    expect(ochtend.items.map((i) => [i.supplement.naam, i.genomen])).toEqual([['Zink', true], ['Magnesium', true]]);
    // Magnesium is vandaag toegevoegd en het bestand heeft geen vanaf: zijn nieuwe moment (avond) telt pas vanaf vandaag (BESLISSING 698).
    expect(schema.momenten.find((m) => m.moment === 'avond')).toBeUndefined();
    const allesGisteren = schema.momenten.flatMap((m) => m.items.map((i) => `${m.moment}:${i.supplement.id}`));
    expect(new Set(allesGisteren).size).toBe(allesGisteren.length);
    expect(schema.momenten.flatMap((m) => m.items).filter((i) => i.supplement.naam === 'Magnesium' && i.genomen)).toHaveLength(1);
    // Vandaag staat Zink er niet meer.
    const vandaagSchema = await schemaVanDag(vandaag());
    expect(vandaagSchema.momenten.flatMap((m) => m.items).map((i) => i.supplement.naam)).not.toContain('Zink');
  });

  test('een fout halverwege laat niets half achter', async () => {
    const mg = await voegSupplementToe({ naam: 'Magnesium', hoeveelheid: '1 schepje', aanwijzing: '', momenten: ['ochtend'] });
    const voor = await db.supplementen.toArray();
    // Het tweede supplement is fout (buiten leesBestand om aangereikt): de transactie breekt af.
    const fout = [dagelijks('Vitamine D'), dagelijks('Zink', { ritme: { soort: 'interval', dagen: 1, start: '2026-11-01' }, momenten: [] })];
    await expect(neemOver(fout, { wijze: 'toevoegen' })).rejects.toThrow('ritme');
    await expect(neemOver([dagelijks('Vitamine D'), dagelijks('  ')], { wijze: 'vervangen' })).rejects.toThrow('leeg');
    expect(await db.supplementen.toArray()).toEqual(voor);
    expect((await leesSupplementen()).map((s) => s.id)).toEqual([mg.id]);
  });

  test('een onbekende keuze of een lege lijst wordt geweigerd; het scherm hoort één keer dat de lijst veranderde', async () => {
    await expect(neemOver([dagelijks('A')], { wijze: 'samenvoegen' })).rejects.toThrow('wijze');
    await expect(neemOver([], { wijze: 'toevoegen' })).rejects.toThrow('leeg');
    let gehoord = 0;
    const af = luister('data:gewijzigd', (d) => d.store === 'supplementen' && (gehoord += 1));
    await neemOver(uitBestand([dagelijks('A'), dagelijks('B')]), { wijze: 'toevoegen' });
    af?.();
    expect(gehoord).toBe(1);
  });

  test('heen en terug tussen twee apps: bewaren in de ene, overnemen in een lege andere geeft dezelfde lijst', async () => {
    await voegSupplementToe({ naam: 'Vitamine D', hoeveelheid: '1 pilletje', aanwijzing: 'bij het ontbijt', momenten: ['ochtend'] });
    await voegSupplementToe({ naam: 'Magnesium', hoeveelheid: '1 schepje', aanwijzing: 'oplossen in water', momenten: ['middag', 'avond'], tot: '2027-01-31' });
    await voegSupplementToe({ naam: 'IJzerspuit', hoeveelheid: '1 ampul', aanwijzing: '', ritme: { soort: 'interval', dagen: 14, start: '2026-11-09' } });
    const tekst = maakBestand(await leesSupplementen());
    await wisAlles();
    const uit = leesBestand(tekst);
    await neemOver(uit.supplementen, { wijze: 'vervangen' });
    expect(maakBestand(await leesSupplementen())).toBe(tekst);
    expect(await db.momentinnames.count()).toBe(0);
  });
});

// L1 van de beveiligingsscan: onzichtbare tekens in een naam. Alle tekens met \u-escapes (geen letterlijke onzichtbare tekens in de bron).
describe('onzichtbare tekens in een tekst uit een bestand', () => {
  const reden = (tekst) => leesBestand(tekst).reden;
  const ONZICHTBAAR = {
    'U+200B nulbreedte-spatie': '\u200B', 'U+200C': '\u200C', 'U+200D alleen': '\u200D', 'U+2060 woordverbinder': '\u2060', 'U+00AD zacht afbreekteken': '\u00AD',
    'U+FE00 variantkiezer': '\uFE00', 'U+E0041 tag-teken': '\u{E0041}', 'U+3164 Hangul-vulteken': '\u3164', 'U+2800 lege braillecel': '\u2800',
    'U+115F': '\u115F', 'U+1160': '\u1160', 'U+FFA0': '\uFFA0', 'U+180E': '\u180E', 'U+034F': '\u034F', 'U+2063 onzichtbare scheider': '\u2063',
  };

  test('een naam die alleen uit onzichtbare tekens bestaat, wordt geweigerd', () => {
    for (const [soort, teken] of Object.entries(ONZICHTBAAR)) {
      expect(reden(bestand([dagelijks(teken)])), soort).toBe('ongeldig');
      expect(reden(bestand([dagelijks(` ${teken}${teken} `)])), soort).toBe('ongeldig');
    }
    expect(reden(bestand([dagelijks('\u0301')]))).toBe('ongeldig'); // een los combinatieteken is ook niets
  });

  test('een onzichtbaar teken in een naam, hoeveelheid of aanwijzing wordt geweigerd', () => {
    for (const [soort, teken] of Object.entries(ONZICHTBAAR)) {
      expect(reden(bestand([dagelijks(`Vitamine${teken} D`)])), soort).toBe('ongeldig');
      expect(reden(bestand([dagelijks('Vitamine D', { hoeveelheid: `1${teken}pil` })])), soort).toBe('ongeldig');
      expect(reden(bestand([dagelijks('Vitamine D', { aanwijzing: `met${teken}water` })])), soort).toBe('ongeldig');
    }
  });

  test('hoeveelheid en aanwijzing mogen leeg blijven, een naam niet', () => {
    expect(leesBestand(bestand([dagelijks('Vitamine D', { hoeveelheid: '', aanwijzing: '' })])).ok).toBe(true);
    expect(reden(bestand([dagelijks('')]))).toBe('ongeldig');
  });

  test('wat een gebruiker echt tikt, blijft toegelaten: accenten, koppelteken, cijfers, spatie, emoji ook samengesteld', () => {
    const namen = ['Café Mix', 'Cafe\u0301 Mix', 'Omega 3', 'Vitamine D3 1000', 'Über-Kur', 'Niño', '\u2764\uFE0F hartje', 'Pil \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', 'Toets 1\uFE0F\u20E3', '\u{1F3F3}\uFE0F\u200D\u{1F308} kleur', '\u{1F44D}\u{1F3FD}'];
    for (const naam of namen) {
      const uit = leesBestand(bestand([dagelijks(naam)]));
      expect(uit.ok, naam).toBe(true);
      expect(uit.supplementen[0].naam).toBe(naam);
    }
  });

  test('een lijst die de app zelf bewaarde met zulke namen, komt altijd terug (onzichtbare tekens vallen weg, emoji blijven)', () => {
    const lijst = [
      rij({ id: 1, naam: 'Vitamine\u200B D\u00AD', volgorde: 1 }),
      rij({ id: 2, naam: '\u3164', volgorde: 2 }),
      rij({ id: 3, naam: '\u2800\u2800', volgorde: 3 }),
      rij({ id: 4, naam: '\u2764\uFE0F Kurkuma', volgorde: 4 }),
      rij({ id: 5, naam: 'Pil \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', hoeveelheid: '1\u200Bpil', volgorde: 5 }),
      rij({ id: 6, naam: 'Tag\u{E0041}\uFE00', volgorde: 6 }),
    ];
    const uit = leesBestand(maakBestand(lijst));
    expect(uit.ok).toBe(true);
    expect(uit.supplementen.map((s) => s.naam)).toEqual(['Vitamine D', '\u2764\uFE0F Kurkuma', 'Pil \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', 'Tag']);
    expect(uit.supplementen[2].hoeveelheid).toBe('1pil');
  });

  test('sleutelVan: onzichtbare tekens, volle breedte en samengestelde tekens tellen als hetzelfde supplement, de naam zelf blijft', () => {
    const basis = sleutelVan({ naam: 'Vitamine D' });
    for (const naam of ['Vitamine\u200B D', 'Vita\u00ADmine D', 'Vitamine D\u{E0041}', 'Vitamine D\uFE00', '\u3164Vitamine D', '\uFF36itamine \uFF24', '\uFF56\uFF49\uFF54\uFF41\uFF4D\uFF49\uFF4E\uFF45 \uFF44', 'VITAMINE   D', 'Vitamine\u2060 D', 'Vitamine\u2800 D']) {
      expect(sleutelVan({ naam }), naam).toBe(basis);
    }
    expect(sleutelVan({ naam: 'Cafe\u0301' })).toBe(sleutelVan({ naam: 'Café' }));
    expect(sleutelVan({ naam: 'Vitamine E' })).not.toBe(basis);
    const x = { naam: '\uFF36itamine D' };
    sleutelVan(x);
    expect(x.naam).toBe('\uFF36itamine D'); // de bewaarde naam verandert niet
  });

  test('vergelijk: een naam met een onzichtbaar teken is hetzelfde supplement, niet een tweede', () => {
    const bestaand = [rij()];
    for (const naam of ['Vitamine\u200B D', '\uFF36itamine D']) {
      const v = vergelijk(bestaand, [{ naam }]);
      expect(v.toevoegen.alAanwezig).toHaveLength(1);
      expect(v.toevoegen.erbij).toHaveLength(0);
      expect(v.vervangen.blijft).toHaveLength(1);
    }
  });
});

// L2 van de beveiligingsscan: wat het formulier aanvaardt, moet in het bestand kunnen en weer terug.
describe('rondgang: een lijst die het formulier aanvaardt, komt via het bestand terug', () => {
  const nu = '2026-11-14';
  const periodiek = (naam, ritme, extra = {}) => ({ ...leegFormulier(nu), naam, ...ritme, momenten: [], ...extra });
  const lijstMetRanden = () => [
    { ...leegFormulier(nu), naam: 'Dagelijks', momenten: ['ochtend', 'avond'] },
    periodiek('Kortste interval', { soort: 'interval', dagen: 2, start: '1970-01-01' }),
    periodiek('Langste interval', { soort: 'interval', dagen: MAX_INTERVAL_DAGEN, start: '2099-12-31' }),
    periodiek('Maand', { soort: 'maand', start: '2028-02-29' }, { vanaf: '1970-01-01', tot: '2099-12-31' }),
    { ...leegFormulier(nu), naam: 'Periode op een dag', vanaf: '2026-12-01', tot: '2026-12-01' },
    { ...leegFormulier(nu), naam: 'N'.repeat(100), hoeveelheid: 'H'.repeat(120), aanwijzing: 'A'.repeat(120) },
    { ...leegFormulier(nu), naam: '\u2764\uFE0F Café Mix \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', hoeveelheid: '2 schepjes', aanwijzing: 'met water' },
  ];

  test('elk formulier uit de lijst is geldig en komt na maakBestand en leesBestand ongewijzigd terug', () => {
    const formulieren = lijstMetRanden();
    for (const f of formulieren) expect(controleer(f), f.naam).toBeNull();
    const verwacht = formulieren.map((f) => {
      const a = naarAanroep(f);
      const uit = { naam: a.naam, hoeveelheid: a.hoeveelheid, aanwijzing: a.aanwijzing, ritme: a.ritme, momenten: a.momenten };
      if (a.vanaf) uit.vanaf = a.vanaf;
      if (a.tot) uit.tot = a.tot;
      return uit;
    });
    const rijen = formulieren.map((f, i) => ({ id: i + 1, volgorde: i + 1, actief: true, ...naarAanroep(f) }));
    const uit = leesBestand(maakBestand(rijen));
    expect(uit.ok).toBe(true);
    expect(uit.supplementen).toEqual(verwacht);
  });

  test('het formulier en het bestand delen de grenzen: een formulier buiten de grens is ongeldig, net als het bestand', () => {
    expect(controleer(periodiek('A', { soort: 'interval', dagen: MAX_INTERVAL_DAGEN + 1, start: nu }))).toEqual({ code: 'ritme', veld: 'dagen' });
    expect(controleer(periodiek('A', { soort: 'interval', dagen: 4000, start: nu }))).toEqual({ code: 'ritme', veld: 'dagen' });
    expect(controleer(periodiek('A', { soort: 'maand', start: '1969-12-31' }))).toEqual({ code: 'ritme', veld: 'start' });
    expect(controleer(periodiek('A', { soort: 'maand', start: '2100-01-01' }))).toEqual({ code: 'ritme', veld: 'start' });
    expect(controleer(periodiek('A', { soort: 'maand', start: '2026-02-30' }))).toEqual({ code: 'ritme', veld: 'start' });
    expect(controleer({ ...leegFormulier(nu), naam: 'A', vanaf: '2100-01-01' })).toEqual({ code: 'periode', veld: 'vanaf' });
    expect(controleer({ ...leegFormulier(nu), naam: 'A', tot: '1900-01-01' })).toEqual({ code: 'periode', veld: 'tot' });
  });

  test('een supplement van vóór de grenzen (4000 dagen, 1900, 99999) wordt vastgezet op de rand: de lijst blijft terugleesbaar', () => {
    const rijen = [
      rij({ id: 1, volgorde: 1, ritme: { soort: 'interval', dagen: 4000, start: '2026-01-01' }, momenten: [] }),
      rij({ id: 2, volgorde: 2, ritme: { soort: 'interval', dagen: 99999, start: '1900-01-01' }, momenten: [] }),
      rij({ id: 3, volgorde: 3, ritme: { soort: 'maand', start: '2026-02-30' }, momenten: [], vanaf: '1950-05-05', tot: '2150-01-01' }),
      rij({ id: 4, volgorde: 4, ritme: { soort: 'maand', start: '2200-06-06' }, momenten: [], vanaf: '2150-01-01', tot: '1960-01-01' }),
    ];
    const uit = leesBestand(maakBestand(rijen));
    expect(uit.ok).toBe(true);
    expect(uit.supplementen[0].ritme).toEqual({ soort: 'interval', dagen: MAX_INTERVAL_DAGEN, start: '2026-01-01' });
    expect(uit.supplementen[1].ritme).toEqual({ soort: 'interval', dagen: MAX_INTERVAL_DAGEN, start: '1970-01-01' });
    expect(uit.supplementen[2].ritme.start).toBe('2026-02-28');
    expect(uit.supplementen[2]).toMatchObject({ vanaf: '1970-01-01', tot: '2099-12-31' });
    expect(uit.supplementen[3].ritme.start).toBe('2099-12-31');
    expect(uit.supplementen[3].vanaf).toBe(uit.supplementen[3].tot);
  });
});
