// kiesMelding: welke tekst een herinnering krijgt, op basis van wat er op het toestel staat (BESLISSINGEN 33, 34, 110, 112, 278, 313).
// Vier soorten (BESLISSING 736): supplementen, drinken, eten en dagboek. Geen weegdag.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { kiesMelding, kiesMeldingen, kiesSoort, algemeneMelding, momentVanUur, tijdstipSleutel } from '../../src/meldingen/tekst.js';
import { t } from '../../src/teksten.js';

const op = (uur, dag = 16) => new Date(2026, 10, dag, ...uur.split(':').map(Number));
const leegStatus = { maaltijdenIngevuld: [], ml: 0, supplementen: { genomen: 0, totaal: 0 }, bijgehouden: false };
const basis = (extra = {}) => ({
  nu: op('20:00'),
  dagboek: { aan: true, uur: '20:00' },
  drinken: [],
  supplementenUren: [],
  slotAan: false,
  details: true,
  doelMl: 2500,
  spuitVandaag: false,
  status: leegStatus,
  ...extra,
});
const status = (extra) => ({ ...leegStatus, bijgehouden: true, ...extra });
const ROND = ['ontbijt', 'middagmaal', 'avondmaal'];

describe('kiesSoort', () => {
  it('kiest de herinnering die binnen 20 minuten van nu ligt', () => {
    const i = basis({ nu: op('08:10'), supplementenUren: [{ aan: true, uur: '08:00' }] });
    expect(kiesSoort(i)).toBe('supplementen');
    expect(kiesSoort({ ...i, nu: op('08:20') })).toBe('supplementen');
    expect(kiesSoort({ ...i, nu: op('08:21') })).toBe('dagboek'); // buiten het venster: altijd een melding, dan het dagboek
    expect(kiesSoort({ ...i, supplementenUren: [{ aan: false, uur: '08:00' }] })).toBe('dagboek'); // uit
    const d = basis({ nu: op('11:05'), drinken: [{ aan: true, uur: '11:00' }, { aan: false, uur: '15:00' }] });
    expect(kiesSoort(d)).toBe('drinken');
    expect(kiesSoort({ ...d, nu: op('15:00') })).toBe('dagboek'); // het uur van 15:00 staat uit
  });
  it('de dichtstbijzijnde wint; bij gelijkspel supplementen voor drinken voor dagboek', () => {
    const i = basis({ nu: op('19:50'), drinken: [{ aan: true, uur: '19:40' }], dagboek: { aan: true, uur: '20:00' } });
    expect(kiesSoort(i)).toBe('drinken'); // 10 minuten tegenover 10: drinken gaat voor dagboek
    expect(kiesSoort({ ...i, nu: op('19:55') })).toBe('dagboek');
    const gelijk = basis({ nu: op('08:00'), drinken: [{ aan: true, uur: '08:00' }], supplementenUren: [{ aan: true, uur: '08:00' }] });
    expect(kiesSoort(gelijk)).toBe('supplementen');
  });
  it('nooit twee tegelijk: één melding, ook als twee soorten op hetzelfde kwartier vallen', () => {
    const m = kiesMelding(basis({ nu: op('19:00'), drinken: [{ aan: true, uur: '19:00' }], supplementenUren: [{ aan: true, uur: '19:00' }], dagboek: { aan: true, uur: '19:00' } }));
    expect(m.soort).toBe('supplementen');
  });
  it('rekent ook over middernacht heen', () => {
    expect(kiesSoort(basis({ nu: op('23:50', 15), drinken: [{ aan: true, uur: '00:05' }] }))).toBe('drinken');
  });
  it('het tijdvak volgt de grenzen van de app', () => {
    expect(momentVanUur('08:00')).toBe('ochtend');
    expect(momentVanUur('13:00')).toBe('middag');
    expect(momentVanUur('19:00')).toBe('avond');
  });
});

describe('dagboekmelding', () => {
  it('niets ingevuld: de lege tekst', () => {
    expect(kiesMelding(basis())).toMatchObject({ soort: 'dagboek', tekst: t('melding.dagboekLeeg'), pad: '#/vandaag', tag: 'bloei-dagboek', titel: 'Bloei' });
  });
  it('noemt hoogstens twee dingen die nog open staan, ook een hoofdmaaltijd', () => {
    expect(kiesMelding(basis({ status: status({ maaltijdenIngevuld: ['ontbijt'] }) })).tekst).toBe('Nog open voor vandaag: je middagmaal en je avondmaal.');
    expect(kiesMelding(basis({ status: status({ maaltijdenIngevuld: [...ROND], ml: 1000 }) })).tekst).toBe('Nog open voor vandaag: je drinkdoel.');
    expect(kiesMelding(basis({ status: status() })).tekst).toBe('Nog open voor vandaag: je ontbijt en je middagmaal.');
  });
  it('tussendoortjes en stemming worden nooit genoemd', () => {
    const m = kiesMelding(basis({ status: status({ maaltijdenIngevuld: ['tussendoortje', 'vieruurtje', 'latesnack'] }) }));
    expect(m.tekst).not.toMatch(/tussendoor|vieruurtje|snack|stemming/i);
  });
  it('supplementen die nog open staan tellen mee voor een ronde dag', () => {
    expect(kiesMelding(basis({ status: status({ maaltijdenIngevuld: [...ROND], ml: 2500, supplementen: { genomen: 1, totaal: 2 } }) })).tekst).toBe('Nog open voor vandaag: je supplementen.');
  });
  it('alles in orde: een positieve tekst, ook met meer drinken dan het doel', () => {
    expect(kiesMelding(basis({ status: status({ maaltijdenIngevuld: [...ROND], ml: 3000, supplementen: { genomen: 2, totaal: 2 } }) })).tekst).toBe(t('melding.dagboekKlaar'));
  });
});

describe('drinkmelding', () => {
  const i = (extra = {}) => basis({ nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], ...extra });
  it('onder het dagdoel: noemt hoeveel er al is', () => {
    const m = kiesMelding(i({ status: status({ ml: 1200 }) }));
    expect(m).toMatchObject({ soort: 'drinken', titel: 'Drinken', pad: '#/drinken', tag: 'bloei-drinken' });
    expect(m.tekst.replace(/ | /g, ' ')).toBe('Je zit aan 1,2 l van 2,5 l. Tijd voor een glas water?');
  });
  it('nog niets gedronken: zonder "0 l"', () => {
    const m = kiesMelding(i());
    expect(m.tekst.replace(/ | /g, ' ')).toBe('Tijd voor een glas water? Je dagdoel is 2,5 l.');
    expect(m.tekst).not.toMatch(/\b0\b/);
  });
  it('dagdoel gehaald: positief', () => {
    expect(kiesMelding(i({ status: status({ ml: 2500 }) })).tekst).toBe('Je dagdoel is gehaald.');
    expect(kiesMelding(i({ status: status({ ml: 3200 }) })).tekst).toBe('Je dagdoel is gehaald.');
  });
});

describe('supplementenmelding', () => {
  const i = (extra = {}) => basis({ nu: op('08:00'), supplementenUren: [{ aan: true, uur: '08:00' }], momenten: { ochtend: { genomen: 0, totaal: 2 } }, ...extra });
  it('nog open, met het tijdvak van het uur', () => {
    expect(kiesMelding(i())).toMatchObject({ soort: 'supplementen', titel: 'Supplementen', tekst: 'Je supplementen van vanochtend staan nog open.', pad: '#/supplementen', tag: 'bloei-supplementen' });
    const middag = kiesMelding(basis({ nu: op('13:00'), supplementenUren: [{ aan: true, uur: '13:00' }], momenten: { middag: { genomen: 0, totaal: 1 } } }));
    expect(middag.tekst).toBe('Je supplementen van vanmiddag staan nog open.');
    const avond = kiesMelding(basis({ nu: op('19:00'), supplementenUren: [{ aan: true, uur: '19:00' }], momenten: { avond: { genomen: 0, totaal: 1 } } }));
    expect(avond.tekst).toBe('Je supplementen van vanavond staan nog open.');
  });
  it('alles van dat tijdvak afgevinkt: positief', () => {
    expect(kiesMelding(i({ momenten: { ochtend: { genomen: 2, totaal: 2 } } })).tekst).toBe('Je supplementen van vanochtend zijn afgevinkt.');
  });
  it('een tijdvak zonder supplementen: positief, nooit een herinnering', () => {
    expect(kiesMelding(i({ momenten: {} })).tekst).toBe('Je supplementen van vanochtend zijn afgevinkt.');
  });
  it('zonder tijdvakgegevens telt de hele dag', () => {
    const m = kiesMelding(basis({ nu: op('08:00'), supplementenUren: [{ aan: true, uur: '08:00' }], status: status({ supplementen: { genomen: 0, totaal: 3 } }) }));
    expect(m.tekst).toBe('Je supplementen van vanochtend staan nog open.');
  });
  it('op de dag van een geplande spuit staat dat erbij, zonder de naam van het middel', () => {
    expect(kiesMelding(i({ spuitVandaag: true })).tekst).toBe('Je supplementen van vanochtend staan nog open. Vandaag staat ook je spuit gepland.');
    expect(kiesMelding(i({ spuitVandaag: true, momenten: { ochtend: { genomen: 2, totaal: 2 } } })).tekst).toBe(t('melding.supplementenKlaar', { moment: 'vanochtend' }));
  });
});

describe('zonder details (BESLISSING 335)', () => {
  const rijk = status({ maaltijdenIngevuld: ['ontbijt'], ml: 500, supplementen: { genomen: 0, totaal: 2 } });
  const gevallen = () => [
    basis({ status: rijk }),
    basis({ nu: op('08:00'), supplementenUren: [{ aan: true, uur: '08:00' }], spuitVandaag: true, momenten: { ochtend: { genomen: 0, totaal: 2 } }, status: rijk }),
    basis({ nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], status: rijk }),
  ];
  it('elke soort toont alleen de algemene tekst, ook met de vergrendeling uit', () => {
    for (const g of gevallen()) {
      for (const zonder of [{ details: false }, { details: undefined }, { details: 'ja' }]) {
        const m = kiesMelding({ ...g, slotAan: false, ...zonder });
        expect(m.tekst).toBe(t('melding.algemeen'));
        expect(m.titel).toBe('Bloei');
        expect(`${m.titel} ${m.tekst}`).not.toMatch(/weeg|supplement|spuit|ontbijt|middagmaal|avondmaal|drink|gewogen|water|\d/i);
      }
    }
  });
  it('een ontbrekende waarde betekent uit', () => {
    const { details, ...zonder } = basis({ nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], status: rijk });
    expect(kiesMelding(zonder).tekst).toBe(t('melding.algemeen'));
  });
  it('een algemene melding opent Vandaag en heeft per tijdstip één tag, ongeacht de soort (BESLISSING 348)', () => {
    const [, supp, drink] = gevallen();
    const s = kiesMelding({ ...supp, details: false });
    expect(s).toMatchObject({ soort: 'supplementen', pad: '#/vandaag', tag: 'bloei-algemeen-08:00' });
    expect(kiesMelding({ ...drink, details: false })).toMatchObject({ soort: 'drinken', pad: '#/vandaag', tag: 'bloei-algemeen-15:00' });
    // drinken en supplementen op hetzelfde uur: dezelfde tag, dus één melding op het toestel
    const samen = basis({ nu: op('08:05'), drinken: [{ aan: true, uur: '08:00' }], supplementenUren: [{ aan: true, uur: '08:00' }], details: false });
    const a = kiesMelding(samen);
    const b = kiesMelding({ ...samen, supplementenUren: [] });
    expect(a.tag).toBe(b.tag);
    // een ander tijdstip: een andere tag
    expect(kiesMelding({ ...samen, nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], supplementenUren: [] }).tag).not.toBe(a.tag);
    // met details aan blijft elke soort een eigen tag
    expect(kiesMelding({ ...samen, details: true }).tag).toBe('bloei-supplementen');
    expect(kiesMelding({ ...samen, details: true, supplementenUren: [] }).tag).toBe('bloei-drinken');
  });
  it('met details aan staat de tekst van de soort er wel in', () => {
    const [, supp, drink] = gevallen();
    expect(kiesMelding(supp).tekst).toMatch(/spuit/);
    expect(kiesMelding(drink).tekst).toMatch(/glas water/);
  });
  // BESLISSING 710 (vroeger: "met de vergrendeling aan blijft het de algemene tekst, ook met details aan"): de gebruiker kiest zelf, ook met het slot aan.
  it('met de vergrendeling aan en details aan staan de details er wel in', () => {
    const [, supp, drink] = gevallen();
    expect(kiesMelding({ ...supp, slotAan: true, details: true }).tekst).toMatch(/spuit/);
    expect(kiesMelding({ ...drink, slotAan: true, details: true })).toMatchObject({ titel: t('melding.titelDrinken'), pad: '#/drinken', tag: 'bloei-drinken' });
    for (const g of gevallen()) expect(kiesMelding({ ...g, slotAan: true, details: true })).toEqual(kiesMelding({ ...g, slotAan: false, details: true }));
  });
});

// BESLISSING 710: de vergrendeling beslist niet meer mee; alleen de schakelaar "Details tonen in meldingen" telt.
describe('met de vergrendeling aan', () => {
  it('met details uit alleen de algemene tekst, voor elke soort en elke stand', () => {
    const rijk = status({ maaltijdenIngevuld: ['ontbijt'], ml: 500, supplementen: { genomen: 0, totaal: 2 } });
    const gevallen = [
      basis({ slotAan: true, details: false, status: rijk }),
      basis({ slotAan: true, details: false, nu: op('08:00'), supplementenUren: [{ aan: true, uur: '08:00' }], spuitVandaag: true, momenten: { ochtend: { genomen: 0, totaal: 2 } }, status: rijk }),
      basis({ slotAan: true, details: false, nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], status: rijk }),
      basis({ slotAan: true, details: false }),
    ];
    for (const g of gevallen) {
      const m = kiesMelding(g);
      expect(m.tekst).toBe(t('melding.algemeen'));
      expect(m.titel).toBe('Bloei');
      expect(`${m.titel} ${m.tekst}`).not.toMatch(/weeg|supplement|spuit|ontbijt|middagmaal|avondmaal|drink|gewogen|water/i);
    }
    // een algemene melding opent Vandaag, met één tag per tijdstip (BESLISSING 348)
    expect(kiesMelding(gevallen[2]).pad).toBe('#/vandaag');
    expect(kiesMelding(gevallen[1]).pad).toBe('#/vandaag');
    expect(kiesMelding(gevallen[2]).tag).toBe('bloei-algemeen-15:00');
  });
  it('de service worker leest de vergrendeling niet voor de tekst, en het slot aanzetten raakt de keuze niet aan', () => {
    const lees = (pad) => readFileSync(new URL('../../src/' + pad, import.meta.url), 'utf8');
    expect(lees('meldingen/stand.js')).not.toMatch(/'slot\.aan'/);
    expect(lees('meldingen/tekst.js')).not.toMatch(/slotAan\s*\|\|/);
    for (const bestand of readdirSync(new URL('../../src/vergrendeling/', import.meta.url))) {
      expect(lees('vergrendeling/' + bestand), bestand).not.toMatch(/meldingen\.details/);
    }
  });
  it('de algemene melding bij een leesfout is dezelfde algemene tekst', () => {
    expect(algemeneMelding()).toMatchObject({ titel: 'Bloei', tekst: t('melding.algemeen'), pad: '#/vandaag' });
  });
});

describe('toon', () => {
  it('geen uitroepteken en geen emoji in elke melding', () => {
    const teksten = [
      kiesMelding(basis()),
      kiesMelding(basis({ status: status({ maaltijdenIngevuld: ['ontbijt'] }) })),
      kiesMelding(basis({ nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], status: status({ ml: 800 }) })),
      kiesMelding(basis({ nu: op('15:00'), drinken: [{ aan: true, uur: '15:00' }], status: status({ ml: 2600 }) })),
      kiesMelding(basis({ nu: op('08:00'), supplementenUren: [{ aan: true, uur: '08:00' }], spuitVandaag: true, momenten: { ochtend: { genomen: 0, totaal: 1 } } })),
    ].map((m) => m.titel + ' ' + m.tekst);
    for (const tekst of teksten) {
      expect(tekst).not.toContain('!');
      expect(/\p{Extended_Pictographic}/u.test(tekst)).toBe(false);
    }
  });
});

// BESLISSING 716: bij een signaal een melding per soort die op het tijdstip van dat signaal staat.
describe('kiesMeldingen: een melding per soort (716)', () => {
  const drie = (extra = {}) =>
    basis({
      nu: op('19:00'),
      dagboek: { aan: true, uur: '19:00' },
      drinken: [{ aan: true, uur: '19:00' }],
      supplementenUren: [{ aan: true, uur: '19:00' }],
      momenten: { avond: { genomen: 0, totaal: 1 } },
      status: status({ ml: 800 }),
      ...extra,
    });
  const soorten = (lijst) => lijst.map((m) => m.soort);
  const tweeUren = basis({ dagboek: { aan: false, uur: '20:00' }, drinken: [{ aan: true, uur: '19:00' }], supplementenUren: [{ aan: true, uur: '19:05' }] });

  it('drie soorten op 19:00: drie meldingen, elk met een eigen tag, het eigen scherm en de volgorde van de voorrang', () => {
    const lijst = kiesMeldingen(drie());
    expect(soorten(lijst)).toEqual(['supplementen', 'drinken', 'dagboek']);
    expect(lijst.map((m) => m.tag)).toEqual(['bloei-supplementen-19:00', 'bloei-drinken-19:00', 'bloei-dagboek-19:00']);
    expect(lijst.map((m) => m.pad)).toEqual(['#/supplementen', '#/drinken', '#/vandaag']);
    expect(lijst.map((m) => m.titel)).toEqual(['Supplementen', 'Drinken', 'Bloei']);
    expect(new Set(lijst.map((m) => m.sleutel))).toEqual(new Set(['2026-11-16 19:00']));
    for (const m of lijst) expect(m.tekst).not.toBe(t('melding.algemeen'));
  });

  it('dezelfde soort twee keer op hetzelfde uur geeft een melding voor die soort', () => {
    expect(soorten(kiesMeldingen(basis({ nu: op('19:00'), dagboek: { aan: false, uur: '20:00' }, drinken: [{ aan: true, uur: '19:00' }, { aan: true, uur: '19:00' }] })))).toEqual(['drinken']);
  });

  it('Drinken 19:00 en Supplementen 19:05: het signaal van 19:00 geeft alleen Drinken, dat van 19:05 alleen Supplementen', () => {
    const eerste = kiesMeldingen({ ...tweeUren, nu: op('19:00') });
    expect(soorten(eerste)).toEqual(['drinken']);
    expect(eerste[0].sleutel).toBe('2026-11-16 19:00');
    const tweede = kiesMeldingen({ ...tweeUren, nu: op('19:05'), afgehandeld: [eerste[0].sleutel] });
    expect(soorten(tweede)).toEqual(['supplementen']);
    expect(tweede[0].sleutel).toBe('2026-11-16 19:05');
  });

  it('een signaal van 19:00 dat 8 minuten te laat komt, eet de melding van 19:05 niet op', () => {
    const laat = kiesMeldingen({ ...tweeUren, nu: op('19:08'), afgehandeld: [] });
    expect(soorten(laat)).toEqual(['drinken']);
    // het eigen signaal van 19:05 (op tijd of ook laat) geeft daarna Supplementen
    expect(soorten(kiesMeldingen({ ...tweeUren, nu: op('19:08'), afgehandeld: [laat[0].sleutel] }))).toEqual(['supplementen']);
    // komt het signaal van 19:05 vóór het late signaal van 19:00, dan krijgen beide tijdstippen toch elk hun melding
    const vroeg = kiesMeldingen({ ...tweeUren, nu: op('19:05') });
    const daarna = kiesMeldingen({ ...tweeUren, nu: op('19:08'), afgehandeld: [vroeg[0].sleutel] });
    expect(new Set([...soorten(vroeg), ...soorten(daarna)])).toEqual(new Set(['drinken', 'supplementen']));
  });

  it('hetzelfde signaal nog eens: dezelfde meldingen met dezelfde tags (het toestel vervangt ze)', () => {
    expect(kiesMeldingen(drie({ nu: op('19:01'), afgehandeld: ['2026-11-16 19:00'] })).map((m) => m.tag)).toEqual(kiesMeldingen(drie()).map((m) => m.tag));
    expect(soorten(kiesMeldingen({ ...tweeUren, nu: op('19:06'), afgehandeld: ['2026-11-16 19:00', '2026-11-16 19:05'] }))).toEqual(['supplementen']);
  });

  it('geen enkel tijdstip in de buurt: toch een melding (het dagboek met details, anders de algemene)', () => {
    const i = basis({ nu: op('03:00'), dagboek: { aan: true, uur: '20:00' } });
    expect(kiesMeldingen(i)).toEqual([expect.objectContaining({ soort: 'dagboek', tag: 'bloei-dagboek', pad: '#/vandaag', titel: 'Bloei', sleutel: null })]);
    expect(kiesMeldingen({ ...i, details: false })).toEqual([expect.objectContaining({ tekst: t('melding.algemeen'), pad: '#/vandaag', sleutel: null })]);
  });

  it('een signaal dat meer dan een kwartier te laat komt, valt terug op het dichtste uur binnen het venster van de service worker', () => {
    const i = basis({ nu: op('11:40'), venster: 60, dagboek: { aan: true, uur: '20:00' }, drinken: [{ aan: true, uur: '11:00' }] });
    expect(soorten(kiesMeldingen(i))).toEqual(['drinken']);
    expect(soorten(kiesMeldingen({ ...i, nu: op('12:30') }))).toEqual(['dagboek']);
    // een oudere dienst die per kwartier stuurt (18:07 op 18:00): het uur van 18:07 krijgt toch zijn melding
    expect(soorten(kiesMeldingen({ ...i, nu: op('18:00'), drinken: [{ aan: true, uur: '18:07' }] }))).toEqual(['drinken']);
  });

  it('een soort die uit staat, of een tijdstip dat uit staat, krijgt geen melding', () => {
    expect(soorten(kiesMeldingen(drie({ drinken: [{ aan: false, uur: '19:00' }] })))).toEqual(['supplementen', 'dagboek']);
    expect(soorten(kiesMeldingen(drie({ dagboek: { aan: false, uur: '19:00' } })))).toEqual(['supplementen', 'drinken']);
    expect(soorten(kiesMeldingen(drie({ dagboek: { aan: true, uur: '19:00', tijdstippen: [{ aan: false, uur: '19:00' }, { aan: true, uur: '08:00' }] } })))).toEqual(['supplementen', 'drinken']);
  });

  it('de hoofdschakelaar uit (alles uit): een enkele melding, nooit een per soort', () => {
    const uit = drie({ dagboek: { aan: false, uur: '19:00' }, drinken: [{ aan: false, uur: '19:00' }], supplementenUren: [{ aan: false, uur: '19:00' }] });
    expect(kiesMeldingen(uit)).toHaveLength(1);
    expect(kiesMeldingen(uit)[0]).toMatchObject({ soort: 'dagboek', sleutel: null });
  });

  it('over middernacht: een uur van 23:58 met een signaal om 00:03 hoort bij gisteren', () => {
    const i = basis({ nu: op('00:03', 17), dagboek: { aan: false, uur: '20:00' }, drinken: [{ aan: true, uur: '23:58' }] });
    expect(kiesMeldingen(i)[0]).toMatchObject({ soort: 'drinken', sleutel: '2026-11-16 23:58' });
    expect(tijdstipSleutel(op('23:59'), '00:01')).toBe('2026-11-17 00:01');
  });

  it('zonder details (710): EEN algemene melding per tijdstip, ook met drie soorten; de naam van een soort is ook een detail', () => {
    for (const extra of [{ details: false }, { details: undefined }, { details: false, slotAan: true }]) {
      const lijst = kiesMeldingen(drie(extra));
      expect(lijst).toHaveLength(1);
      expect(lijst[0]).toMatchObject({ titel: t('melding.titelDagboek'), tekst: t('melding.algemeen'), pad: '#/vandaag', tag: 'bloei-algemeen-19:00', sleutel: '2026-11-16 19:00' });
      expect(`${lijst[0].titel} ${lijst[0].tekst}`).not.toMatch(/drink|water|supplement|dagboek|ontbijt|spuit/i);
    }
  });

  it('met details en de vergrendeling aan: dezelfde meldingen als zonder vergrendeling (710)', () => {
    expect(kiesMeldingen(drie({ slotAan: true }))).toEqual(kiesMeldingen(drie({ slotAan: false })));
  });
});

// BESLISSING 736: een vierde soort, Eten, met een eigen melding die naar Vandaag leidt.
describe('Eten (736)', () => {
  const vier = (extra = {}) =>
    basis({
      nu: op('12:30'),
      dagboek: { aan: true, uur: '12:30' },
      eten: [{ aan: true, uur: '12:30' }],
      drinken: [{ aan: true, uur: '12:30' }],
      supplementenUren: [{ aan: true, uur: '12:30' }],
      ...extra,
    });

  it('vier soorten op hetzelfde uur geven vier meldingen, elk met een eigen tag', () => {
    const lijst = kiesMeldingen(vier());
    expect(lijst.map((m) => m.soort)).toEqual(['supplementen', 'drinken', 'eten', 'dagboek']);
    expect(new Set(lijst.map((m) => m.tag)).size).toBe(4);
    const eten = lijst.find((m) => m.soort === 'eten');
    expect(eten.tag).toBe('bloei-eten-12:30');
    expect(eten.pad).toBe('#/vandaag');
    expect(eten.titel).toBe('Eten');
  });

  const eten = (uur, ingevuld) =>
    kiesMeldingen(basis({ nu: op(uur), dagboek: { aan: false, uur: '20:00' }, eten: [{ aan: true, uur }], status: status({ maaltijdenIngevuld: ingevuld }) }))[0];

  it('met details: de maaltijd van het tijdvak als ze nog open staat, anders een vriendelijk berichtje', () => {
    expect(eten('12:30', []).tekst).toBe('Tijd om je middagmaal te noteren.');
    expect(eten('12:30', ['middagmaal']).tekst).toBe('Je middagmaal staat erin.');
    expect(eten('08:00', []).tekst).toBe('Tijd om je ontbijt te noteren.');
    expect(eten('08:00', ['ontbijt']).tekst).toBe('Je ontbijt staat erin.');
    expect(eten('18:30', []).tekst).toBe('Tijd om je avondmaal te noteren.');
    expect(eten('18:30', ['avondmaal']).tekst).toBe('Je avondmaal staat erin.');
  });

  it('met alles van de dag genoteerd vraagt Eten op geen enkel uur om te noteren', () => {
    for (let u = 0; u < 24; u++) {
      for (const m of ['00', '30']) {
        const tekst = eten(`${String(u).padStart(2, '0')}:${m}`, [...ROND]).tekst;
        expect(tekst).toMatch(/^Je (ontbijt|middagmaal|avondmaal) staat erin\.$/);
        expect(tekst).not.toMatch(/noteren/);
      }
    }
  });

  it('rond 23:00 lokale tijd: een genoteerd avondmaal geeft het vriendelijke berichtje, ook laat binnen het venster', () => {
    expect(eten('22:45', ['ontbijt', 'middagmaal', 'avondmaal']).tekst).toBe('Je avondmaal staat erin.');
    expect(eten('23:00', ['avondmaal']).tekst).toBe('Je avondmaal staat erin.');
    expect(eten('23:00', ['ontbijt', 'middagmaal']).tekst).toBe('Tijd om je avondmaal te noteren.');
    // Een tussendoortje, vieruurtje of late snack telt niet als de maaltijd van het tijdvak.
    expect(eten('23:00', ['latesnack', 'vieruurtje']).tekst).toBe('Tijd om je avondmaal te noteren.');
  });

  it('zonder details: een algemene melding, zoals bij de andere soorten', () => {
    const lijst = kiesMeldingen(vier({ details: false }));
    expect(lijst).toHaveLength(1);
    expect(lijst[0].tekst).toBe(t('melding.algemeen'));
  });

  describe('Dagboek laat de maaltijden weg als Eten aan staat (737)', () => {
    const dag = (extra = {}) => kiesMeldingen(basis({ status: status({ ml: 1000, supplementen: { genomen: 2, totaal: 2 } }), ...extra }))[0];

    it('Eten uit: de oude tekst met de maaltijden', () => {
      expect(dag().tekst).toBe('Nog open voor vandaag: je ontbijt en je middagmaal.');
      expect(dag({ eten: [{ aan: false, uur: '12:30' }] }).tekst).toBe('Nog open voor vandaag: je ontbijt en je middagmaal.');
    });
    it('Eten aan met maaltijden en iets anders open: alleen het andere', () => {
      expect(dag({ eten: [{ aan: true, uur: '12:30' }] }).tekst).toBe('Nog open voor vandaag: je drinkdoel.');
      const twee = dag({ eten: [{ aan: true, uur: '12:30' }], status: status({ ml: 1000, supplementen: { genomen: 0, totaal: 2 } }) });
      expect(twee.tekst).toBe('Nog open voor vandaag: je drinkdoel en je supplementen.');
    });
    it('Eten aan met alleen maaltijden open: bijna rond, niet klaar (738)', () => {
      const alleen = dag({ eten: [{ aan: true, uur: '08:00' }], status: status({ ml: 3000, supplementen: { genomen: 2, totaal: 2 } }) });
      expect(alleen.tekst).toBe('Je dagboek is bijna rond voor vandaag.');
      expect(alleen.tekst).toBe(t('melding.dagboekBijnaRond'));
    });
    it('Eten aan en echt niets open (ook geen maaltijd): alles staat erin', () => {
      const klaar = dag({ eten: [{ aan: true, uur: '08:00' }], status: status({ maaltijdenIngevuld: [...ROND], ml: 3000, supplementen: { genomen: 2, totaal: 2 } }) });
      expect(klaar.tekst).toBe(t('melding.dagboekKlaar'));
    });
    it('Eten aan op een ander uur dan Dagboek telt ook als aan; zonder details verandert niets', () => {
      expect(dag({ eten: [{ aan: false, uur: '20:00' }, { aan: true, uur: '07:30' }] }).tekst).toBe('Nog open voor vandaag: je drinkdoel.');
      expect(dag({ eten: [{ aan: true, uur: '07:30' }], details: false }).tekst).toBe(t('melding.algemeen'));
    });
  });

  it('een oude stand zonder eten: de soort staat uit, er komt geen melding van Eten', () => {
    const invoer = vier();
    delete invoer.eten;
    expect(kiesMeldingen(invoer).map((m) => m.soort)).not.toContain('eten');
  });

  it('een vierde tijdstip van een oude stand telt niet (strikt drie per soort)', () => {
    const drinken = ['08:00', '10:00', '12:00', '14:00'].map((uur) => ({ aan: true, uur }));
    const lijst = kiesMeldingen(basis({ nu: op('14:00'), dagboek: { aan: false, uur: '20:00' }, drinken }));
    expect(lijst.map((m) => m.soort)).not.toContain('drinken');
  });
});
