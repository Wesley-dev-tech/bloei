// De warme zin van de dag en van de week (PLAN.md §15.2, uitgebreid in 0.5.0): pure functies, vaste keuze per dag.
import { describe, expect, test } from 'vitest';
import { GROEPEN, MIJLPALEN, WEEKGROEPEN, isDagRond, kiesMotivatie, kiesWeekMotivatie, kiesWeekZin, kiesZin, reactieUit } from '../../src/logica/motivatie.js';
import { besteEerdereReeks, verledenUit, weekVerledenUit } from '../../src/logica/verleden.js';
import { ALLE_BADGES } from '../../src/logica/badgeregels.js';
import { TEKSTEN, motivatieZin } from '../../src/teksten.js';

// Vrijdag 13 november 2026, zonder dagdeel: dan wisselt de stand alleen tussen de groepen zonder dagdeel.
const leeg = {
  dagdeel: null, maaltijden: 0, ml: 0, doelMl: 2000, supplementen: { genomen: 0, totaal: 0 }, stemming: null,
  lopendeReeks: 0, dagenBijgehouden: 0, dagenSindsVorige: null, datum: '2026-11-13',
};
const groepVan = (sleutel) => sleutel.split('.')[1];
const groep = (wijziging) => kiesMotivatie({ ...leeg, ...wijziging }).groep;
const reactie = (soort, nieuw = {}) => ({ soort, nieuw, teller: 1 });

describe('de groepen', () => {
  test('elke medaille heeft haar eigen groep met twee zinnen', () => {
    for (const b of ALLE_BADGES) expect(GROEPEN['m-' + b.id], b.id).toBe(2);
    expect(Object.keys(GROEPEN).filter((g) => g.startsWith('m-')).length).toBe(ALLE_BADGES.length);
  });
  test('elke groep heeft minstens twee zinnen en de weekgroepen staan apart', () => {
    for (const [g, aantal] of Object.entries({ ...GROEPEN, ...WEEKGROEPEN })) expect(aantal, g).toBeGreaterThanOrEqual(2);
    for (const g of Object.keys(WEEKGROEPEN)) expect(GROEPEN[g], g).toBeUndefined();
  });
});

describe('kiesMotivatie: de stand van de dag (bij het openen van de app)', () => {
  test('de juiste groep bij elke toestand', () => {
    const cases = [
      [{}, 'begin'],
      [{ maaltijden: 1 }, 'onderweg'],
      [{ stemming: 3 }, 'onderweg'],
      [{ ml: 1500 }, 'drinkenBijna'],
      [{ ml: 2000 }, 'drinkenKlaar'],
      [{ ml: 2400 }, 'drinkenKlaar'],
      [{ supplementen: { genomen: 2, totaal: 2 } }, 'supplementenKlaar'],
      [{ supplementen: { genomen: 1, totaal: 2 } }, 'onderweg'],
      [{ maaltijden: 2, ml: 600, supplementen: { genomen: 1, totaal: 2 }, stemming: 4 }, 'onderweg'],
      [{ maaltijden: 3, etenKlaar: true, ml: 2000, supplementen: { genomen: 2, totaal: 2 } }, 'dagRond'],
      [{ maaltijden: 3, etenKlaar: true, ml: 2000, supplementen: { genomen: 0, totaal: 0 } }, 'dagRond'],
      [{ maaltijden: 6, etenKlaar: true, ml: 2000, supplementen: { genomen: 2, totaal: 2 }, stemming: 1 }, 'dagRond'],
      [{ maaltijden: 6, etenKlaar: true, ml: 1750, supplementen: { genomen: 2, totaal: 2 }, stemming: 4 }, 'drinkenBijna'],
      [{ maaltijden: 6, etenKlaar: true, ml: 1999, supplementen: { genomen: 0, totaal: 0 }, stemming: 4 }, 'drinkenBijna'],
      // Nog één onderdeel en de dag is rond (alleen met supplementen: de zinnen noemen ze)
      [{ maaltijden: 6, etenKlaar: true, ml: 500, supplementen: { genomen: 2, totaal: 2 } }, 'bijnaRondDrinken'],
      [{ maaltijden: 6, etenKlaar: false, ml: 2000, supplementen: { genomen: 2, totaal: 2 } }, 'bijnaRondEten'],
      [{ maaltijden: 6, etenKlaar: true, ml: 2000, supplementen: { genomen: 1, totaal: 2 } }, 'bijnaRondSupplementen'],
      [{ maaltijden: 6, etenKlaar: false, ml: 2000 }, 'drinkenKlaar'], // zonder supplementen geen "bijna rond"
      [{ maaltijden: 1, dagenSindsVorige: 4 }, 'terug'],
      [{ maaltijden: 1, dagenSindsVorige: 14 }, 'terug'],
      [{ maaltijden: 1, dagenSindsVorige: 15 }, 'terugLang'],
      [{ maaltijden: 1, dagenSindsVorige: 2 }, 'terugKort'],
      [{ maaltijden: 1, dagenSindsVorige: 3 }, 'terugKort'],
      [{ maaltijden: 1, dagenSindsVorige: 1 }, 'onderweg'],
      [{ dagenSindsVorige: 9 }, 'begin'], // nog niets ingevuld: geen welkom-terug
      [{ maaltijden: 1, lopendeReeks: 3 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 7 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 14 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 30 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 150 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 8 }, 'onderweg'],
      [{ maaltijden: 1, lopendeReeks: 7, dagenSindsVorige: 5 }, 'terug'], // terug gaat voor reeks
      [{ maaltijden: 1, lopendeReeks: 7, dagenSindsVorige: 2 }, 'reeks'], // een mijlpaal gaat voor een dagje ertussenuit
    ];
    for (const [wijziging, verwacht] of cases) expect(groep(wijziging), JSON.stringify(wijziging)).toBe(verwacht);
  });

  test('zonder iets wisselen begin, het dagdeel, de reeks en de volgende medaille per dag af', () => {
    const gezien = new Set();
    for (let d = 1; d <= 28; d++) {
      const datum = `2026-12-${String(d).padStart(2, '0')}`;
      if (d === 1 || new Date(2026, 11, d).getDay() === 1) continue; // de eerste van de maand en maandag hebben hun eigen groep
      gezien.add(groep({ datum, dagdeel: 'ochtend', lopendeReeks: 4, verleden: { eersteDatum: '2026-10-01', badges: { volgendeDag: { id: 'week-op-rij', aantal: 4, doel: 7 } } } }));
    }
    expect([...gezien].sort()).toEqual(['begin', 'beginBadge', 'beginOchtend', 'beginReeks']);
    expect(groep({ dagdeel: 'avond' })).toMatch(/^begin(Avond)?$/);
    expect(groep({ maaltijden: 1, dagdeel: 'middag' })).toMatch(/^onderweg(Middag)?$/);
  });

  test('gisteren, maandag en de eerste van de maand bij een lege dag', () => {
    const v = { eersteDatum: '2026-09-01' };
    expect(groep({ verleden: { ...v, gisterenRond: true } })).toBe('beginNaRond');
    expect(groep({ verleden: { ...v, gisterenDoel: true } })).toBe('beginNaDoel');
    expect(groep({ verleden: { ...v, badges: { gisteren: ['week-op-rij'] } } })).toBe('badgeGisteren');
    expect(groep({ datum: '2026-11-16', verleden: v })).toBe('beginWeek'); // maandag
    const maand = kiesMotivatie({ ...leeg, datum: '2026-12-01', verleden: { ...v, vorigeMaandDagen: 22 } });
    expect(maand.groep).toBe('nieuweMaand');
    expect(maand.waarden).toEqual({ aantal: 22 });
  });

  test('het dagdoel komt uit de status', () => {
    expect(groep({ ml: 1500, doelMl: 1500 })).toBe('drinkenKlaar');
    expect(groep({ ml: 1500, doelMl: 2000 })).toBe('drinkenBijna');
    expect(groep({ ml: 1499, doelMl: 2000 })).toBe('onderweg');
  });

  test('dezelfde dag en dezelfde toestand geven altijd dezelfde zin; andere dagen wisselen', () => {
    const een = kiesZin({ ...leeg, maaltijden: 1 });
    for (let i = 0; i < 5; i++) expect(kiesZin({ ...leeg, maaltijden: 1 })).toBe(een);
    const verschillend = new Set();
    for (let dagNr = 1; dagNr <= 28; dagNr++) verschillend.add(kiesZin({ ...leeg, maaltijden: 1, datum: `2026-11-${String(dagNr).padStart(2, '0')}` }));
    expect(verschillend.size).toBeGreaterThan(2);
  });

  test('zonder status valt het terug op begin', () => {
    expect(groepVan(kiesZin(undefined))).toBe('begin');
  });

  test('iets (BESLISSING 168): een dag telt als begonnen zodra er iets genoteerd staat', () => {
    expect(groep({})).toBe('begin');
    expect(groep({ iets: true })).toBe('onderweg');
  });
});

describe('kiesMotivatie: het verleden', () => {
  const v = { eersteDatum: '2026-08-13' };
  test('de eerste dag, een record, het totaal en een jubileum, met het getal erbij', () => {
    expect(groep({ maaltijden: 1, dagenBijgehouden: 1, verleden: { eersteDatum: '2026-11-13' } })).toBe('eersteDag');
    const record = kiesMotivatie({ ...leeg, maaltijden: 1, lopendeReeks: 9, verleden: { ...v, besteEerdereReeks: 8 } });
    expect(record.groep).toBe('record');
    expect(record.waarden).toEqual({ aantal: 9 });
    expect(groep({ maaltijden: 1, lopendeReeks: 11, verleden: { ...v, besteEerdereReeks: 8 } })).not.toBe('record'); // alleen op de dag zelf
    expect(groep({ maaltijden: 1, lopendeReeks: 3, verleden: { ...v, besteEerdereReeks: 2 } })).toBe('reeks'); // een vorig record van 2 telt niet
    const totaal = kiesMotivatie({ ...leeg, maaltijden: 1, dagenBijgehouden: 50, verleden: { eersteDatum: '2026-08-01' } });
    expect(totaal.groep).toBe('totaal');
    expect(totaal.waarden).toEqual({ aantal: 50 });
    const jub = kiesMotivatie({ ...leeg, maaltijden: 1, verleden: v });
    expect(jub.groep).toBe('jubileum');
    expect(jub.waarden).toEqual({ periode: 'kwartaal' });
    expect(kiesMotivatie({ ...leeg, maaltijden: 1, datum: '2026-02-28', verleden: { eersteDatum: '2026-01-31' } }).waarden).toEqual({ periode: 'maand' }); // de 31e wordt de laatste dag
  });

  test('een mijlpaal komt bij het openen en bij het eerste wat ze die dag noteert, daarna reageert de zin weer op wat ze doet', () => {
    const basis = { maaltijden: 2, lopendeReeks: 7 };
    expect(groep(basis)).toBe('reeks');
    expect(groep({ ...basis, reactie: reactie('maaltijd', { iets: true }) })).toBe('reeks');
    expect(groep({ ...basis, reactie: reactie('maaltijd') })).toBe('maaltijd');
  });

  test('de dag rond: het aantal ronde dagen, meerdere na elkaar, en de zin over supplementen alleen met supplementen', () => {
    const rond = { maaltijden: 3, etenKlaar: true, ml: 2000 };
    expect(kiesMotivatie({ ...leeg, ...rond, verleden: { totaal: { rondeDagen: 10 } } }).waarden).toEqual({ aantal: 10 });
    expect(groep({ ...rond, verleden: { totaal: { rondeDagen: 10 } } })).toBe('rondTotaal');
    expect(groep({ ...rond, verleden: { rondReeks: 3 } })).toBe('dagRondReeks');
    expect(groep({ ...rond, verleden: { rondReeks: 1 } })).toBe('dagRond');
    expect(groep({ ...rond, reactie: reactie('notitie') })).toBe('notitie'); // de dag was al rond: de zin reageert op de notitie
    expect(groep({ ...rond, reactie: reactie('drank', { rond: true, doel: true }) })).toBe('dagRond');
    for (let d = 1; d <= 28; d++) {
      const datum = `2026-11-${String(d).padStart(2, '0')}`;
      expect(kiesZin({ ...leeg, ...rond, datum }), datum).not.toBe('motivatie.dagRond.1');
    }
    const met = new Set();
    for (let d = 1; d <= 28; d++) met.add(kiesZin({ ...leeg, ...rond, supplementen: { genomen: 1, totaal: 1 }, datum: `2026-11-${String(d).padStart(2, '0')}` }));
    expect(met.has('motivatie.dagRond.1')).toBe(true);
  });
});

describe('kiesMotivatie: medailles', () => {
  const b = (extra) => ({ verleden: { badges: { aantal: 3, totaal: 33, ...extra } } });
  test('de eigen zin van de medaille, meerdere op een dag, een rond aantal en alle medailles', () => {
    expect(groep({ maaltijden: 1, ...b({ vandaag: ['eerste-favoriet'] }) })).toBe('m-eerste-favoriet');
    expect(kiesMotivatie({ ...leeg, maaltijden: 1, ...b({ vandaag: ['eerste-favoriet', 'eerste-kan'] }) }).waarden).toEqual({ aantal: 2 });
    expect(groep({ maaltijden: 1, ...b({ vandaag: ['eerste-favoriet', 'eerste-kan'] }) })).toBe('badgeMeer');
    expect(groep({ maaltijden: 1, ...b({ vandaag: ['eerste-kan'], aantal: 10 }) })).toBe('badgeTelling');
    expect(groep({ maaltijden: 1, ...b({ vandaag: ['eerste-kan'], aantal: 33 }) })).toBe('badgeAlle');
  });
  test('na een handeling alleen de medaille die net behaald is', () => {
    const status = { maaltijden: 2, ...b({ vandaag: ['eerste-favoriet'] }) };
    expect(groep({ ...status, reactie: reactie('maaltijd') })).toBe('maaltijd');
    expect(groep({ ...status, reactie: reactie('favoriet', { badges: ['eerste-favoriet'] }) })).toBe('m-eerste-favoriet');
  });
  test('een medaille die één stap weg is of halfweg, met haar id voor de naam', () => {
    const bijna = kiesMotivatie({ ...leeg, maaltijden: 2, ...b({ volgende: { id: 'week-vol', aantal: 6, doel: 7 } }), reactie: reactie('maaltijd', { stap: true }) });
    expect(bijna.groep).toBe('badgeBijna');
    expect(bijna.waarden).toEqual({ badge: 'week-vol' });
    expect(groep({ maaltijden: 2, ...b({ volgende: { id: 'maand-vol', aantal: 15, doel: 30 } }), reactie: reactie('maaltijd', { stap: true }) })).toBe('badgeHalf');
    expect(groep({ maaltijden: 2, ...b({ volgende: { id: 'week-vol', aantal: 6, doel: 7 } }), reactie: reactie('maaltijd') })).toBe('maaltijd'); // geen stap door deze handeling
    expect(motivatieZin(bijna, 'Testnaam')).toContain('Zeven dagen');
  });
});

describe('kiesMotivatie: wat ze net deed', () => {
  test('elke handeling haar eigen groep', () => {
    const cases = [
      [{ maaltijden: 1 }, reactie('maaltijd'), 'eersteMaaltijd'],
      [{ maaltijden: 2 }, reactie('maaltijd'), 'maaltijd'],
      [{ maaltijden: 3, etenKlaar: true }, reactie('maaltijd', { eten: true }), 'etenKlaar'],
      [{ maaltijden: 4, etenKlaar: true }, reactie('maaltijd'), 'maaltijd'],
      [{ maaltijden: 2 }, reactie('gevoel'), 'maaltijdGevoel'],
      [{ ml: 250, drankenAantal: 1 }, reactie('drank'), 'eersteDrank'],
      [{ ml: 500, drankenAantal: 2 }, reactie('drank'), 'drank'],
      [{ ml: 1100, drankenAantal: 3 }, reactie('drank'), 'drinkenHalf'],
      [{ ml: 1600, drankenAantal: 4 }, reactie('drank'), 'drinkenBijna'],
      [{ ml: 2000, drankenAantal: 5 }, reactie('drank', { doel: true }), 'drinkenKlaar'],
      [{ ml: 2300, drankenAantal: 6 }, reactie('drank'), 'drinkenKlaar'],
      [{ supplementen: { genomen: 1, totaal: 3 } }, reactie('inname'), 'supplementEerste'],
      [{ supplementen: { genomen: 2, totaal: 3 } }, reactie('inname', { moment: true }), 'supplementMoment'],
      [{ supplementen: { genomen: 3, totaal: 3 } }, reactie('inname', { supp: true }), 'supplementenKlaar'],
      [{ supplementen: { genomen: 1, totaal: 3 } }, reactie('periodiek'), 'periodiek'],
      [{ stemming: 1 }, reactie('stemming'), 'stemmingLaag'],
      [{ stemming: 3 }, reactie('stemming'), 'stemmingMidden'],
      [{ stemming: 5 }, reactie('stemming'), 'stemmingHoog'],
      [{ stemming: 3, energie: 2 }, reactie('energie'), 'energieLaag'],
      [{ stemming: 3, energie: 4 }, reactie('energie'), 'energie'],
    ];
    for (const [wijziging, r, verwacht] of cases) expect(groep({ ...wijziging, reactie: r }), verwacht).toBe(verwacht);
    for (const soort of ['notitie', 'weging', 'favoriet', 'verslag', 'vorigeDag', 'aangepast', 'eigen', 'herinnering', 'slot', 'dagdoel', 'supplementLijst', 'rondleiding']) {
      expect(groep({ iets: true, reactie: reactie(soort) }), soort).toBe(soort);
    }
  });

  test('het verleden kleurt de reactie: tellers, reeksen en meer dan gisteren', () => {
    const met = (wijziging, r, verleden) => kiesMotivatie({ ...leeg, ...wijziging, reactie: r, verleden });
    expect(met({ maaltijden: 2 }, reactie('maaltijd'), { totaal: { maaltijden: 100 } }).groep).toBe('maaltijdenTotaal');
    expect(met({ ml: 2000 }, reactie('drank', { doel: true }), { totaal: { doelDagen: 25 } }).waarden).toEqual({ aantal: 25 });
    expect(met({ ml: 2000 }, reactie('drank', { doel: true }), { doelReeks: 4 }).groep).toBe('drinkenReeks');
    expect(met({ ml: 2000 }, reactie('drank'), { doelReeks: 4 }).groep).toBe('drinkenKlaar'); // het doel was al gehaald
    expect(met({ ml: 700, drankenAantal: 3 }, reactie('drank', { mlVoor: 450 }), { gisterenMl: 600 }).groep).toBe('drinkenMeer');
    expect(met({ ml: 900, drankenAantal: 4 }, reactie('drank', { mlVoor: 700 }), { gisterenMl: 600 }).groep).toBe('drank'); // alleen op het moment zelf
    expect(met({ ml: 300, drankenAantal: 2 }, reactie('drank', { mlVoor: 100 }), { gisterenMl: 600 }).groep).toBe('drank'); // minder dan gisteren: geen woord daarover
    expect(met({ supplementen: { genomen: 2, totaal: 2 } }, reactie('inname', { supp: true }), { suppReeks: 5 }).groep).toBe('supplementenReeks');
    expect(met({ supplementen: { genomen: 2, totaal: 2 } }, reactie('inname', { supp: true }), { totaal: { volledigeDagen: 30 } }).groep).toBe('supplementTotaal');
    expect(met({ stemming: 4 }, reactie('stemming'), { stemmingReeks: 3 }).groep).toBe('stemmingReeks');
    expect(met({ stemming: 2 }, reactie('stemming'), { stemmingReeks: 3 }).groep).toBe('stemmingMidden');
    expect(met({ stemming: 4 }, reactie('stemming', { eersteStemming: true }), { totaal: { stemmingDagen: 30 } }).groep).toBe('stemmingTotaal');
    expect(met({ iets: true }, reactie('weging', { eersteWeging: true }), { totaal: { wegingen: 8 } }).groep).toBe('wegingTotaal');
    expect(met({ iets: true }, reactie('weging'), { wegingReeks: 4 }).waarden).toEqual({ aantal: 4 });
    expect(met({ iets: true }, reactie('notitie', { eersteNotitie: true }), { totaal: { notitieDagen: 20 } }).groep).toBe('notitieTotaal');
    expect(met({ iets: true }, reactie('favoriet'), { totaal: { favorieten: 5 } }).groep).toBe('favorietTotaal');
  });

  test('twee reacties na elkaar geven een andere zin; het eerste vinkje zegt alleen de eerste keer "je eerste supplement"', () => {
    const een = kiesZin({ ...leeg, maaltijden: 2, reactie: { soort: 'maaltijd', nieuw: {}, teller: 1 } });
    const twee = kiesZin({ ...leeg, maaltijden: 3, reactie: { soort: 'maaltijd', nieuw: {}, teller: 2 } });
    expect(groepVan(een)).toBe('maaltijd');
    expect(twee).not.toBe(een);
    for (let teller = 1; teller <= 8; teller++) {
      expect(kiesZin({ ...leeg, supplementen: { genomen: 2, totaal: 4 }, reactie: { soort: 'inname', nieuw: {}, teller } })).not.toBe('motivatie.supplementEerste.1');
    }
  });
});

describe('reactieUit: wat er veranderde tussen twee standen', () => {
  const stand = { maaltijden: 1, gevoel: 0, tekst: 'a', ml: 250, genomen: 0, periodiek: 0, momentenKlaar: 0, stemming: null, energie: null, notitie: '', weging: '', favorieten: 0, iets: true, rond: false, etenOk: false, suppOk: false, doelOk: false, badges: [], volgende: { id: 'week-vol', aantal: 3 } };
  const soort = (nu, gebeurd) => reactieUit(stand, { ...stand, ...nu }, gebeurd)?.soort ?? null;
  test('de soort handeling volgt uit het verschil', () => {
    expect(soort({ maaltijden: 2 }, { stores: ['maaltijden'] })).toBe('maaltijd');
    expect(soort({ gevoel: 1 }, { stores: ['maaltijden'] })).toBe('gevoel');
    expect(soort({ tekst: 'b' }, { stores: ['maaltijden'] })).toBe('aangepast');
    expect(soort({ maaltijden: 0 }, { stores: ['maaltijden'] })).toBe('aangepast');
    expect(soort({ ml: 500 }, { stores: ['dranken'] })).toBe('drank');
    expect(soort({ ml: 0 }, { stores: ['dranken'] })).toBe('aangepast');
    expect(soort({ genomen: 1 }, { stores: ['innames'] })).toBe('inname');
    expect(soort({ genomen: 1, periodiek: 1 }, { stores: ['innames'] })).toBe('periodiek');
    expect(soort({ stemming: 4 }, { stores: ['dagen'] })).toBe('stemming');
    expect(soort({ energie: 2 }, { stores: ['dagen'] })).toBe('energie');
    expect(soort({ notitie: 'hallo' }, { stores: ['dagen'] })).toBe('notitie');
    expect(soort({ weging: '2026-11-13|70' }, { stores: ['wegingen'] })).toBe('weging');
    expect(soort({ favorieten: 1 }, { stores: ['favorieten'] })).toBe('favoriet');
    expect(soort({}, { stores: ['supplementen'] })).toBe('supplementLijst');
    expect(soort({}, { stores: [], soort: 'verslag' })).toBe('verslag');
    expect(soort({}, { stores: ['maaltijden'], eerder: true })).toBe('vorigeDag');
  });
  test('zonder verschil blijft de vorige reactie staan; bij meerdere wijzigingen telt de laatste', () => {
    expect(soort({}, { stores: ['dagen'] })).toBe(null); // bv. alleen de vlag "dagdoel gehaald" werd bewaard
    expect(soort({ maaltijden: 2, ml: 500 }, { stores: ['maaltijden', 'dranken'] })).toBe('drank');
    expect(soort({ maaltijden: 2, ml: 500 }, { stores: ['dranken', 'maaltijden'] })).toBe('maaltijd');
  });
  test('wat door de handeling klaar raakte', () => {
    const r = reactieUit({ ...stand, iets: false }, { ...stand, maaltijden: 2, rond: true, etenOk: true, doelOk: true, badges: ['dag-rond'], volgende: { id: 'week-vol', aantal: 4 } }, { stores: ['maaltijden'] });
    expect(r.nieuw.iets).toBe(true);
    expect(r.nieuw.rond).toBe(true);
    expect(r.nieuw.eten).toBe(true);
    expect(r.nieuw.badges).toEqual(['dag-rond']);
    expect(r.nieuw.stap).toBe(true);
  });
});

describe('het verleden uit het dagboek (logica/verleden.js)', () => {
  // Maandag 2 tot donderdag 5 november, daarna dinsdag 10 tot zaterdag 14 november.
  const datums = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
  test('de langste reeks van voor de lopende reeks', () => {
    expect(besteEerdereReeks(datums, '2026-11-14')).toBe(4);
    expect(besteEerdereReeks(datums.slice(0, 4), '2026-11-05')).toBe(0);
    expect(besteEerdereReeks([], '2026-11-05')).toBe(0);
  });
  test('reeksen, gisteren, medailles en de volgende medaille', () => {
    const op = (dag, uur) => new Date(2026, 10, dag, uur).getTime();
    const v = verledenUit({
      datum: '2026-11-14',
      datums,
      rondeDatums: ['2026-11-12', '2026-11-13', '2026-11-14'],
      doelDatums: ['2026-11-13'],
      volleDatums: ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'],
      wegingWeken: ['2026-10-26', '2026-11-02', '2026-11-09'],
      stemmingen: new Map([['2026-11-13', 4], ['2026-11-14', 5], ['2026-11-12', 2]]),
      mlGisteren: 1200,
      badges: [{ id: 'eerste-bladzijde', behaaldOp: op(2, 9) }, { id: 'drie-op-rij', behaaldOp: op(13, 9) }, { id: 'week-vol', behaaldOp: op(14, 9) }],
      badgeStats: { dagenBijgehouden: 9, lopendeReeks: 5, maaltijden: 12 },
    });
    expect(v.eersteDatum).toBe('2026-11-02');
    expect(v.dagenSinds).toBe(1);
    expect(v.besteEerdereReeks).toBe(4);
    expect(v.rondReeks).toBe(3);
    expect(v.gisterenRond).toBe(true);
    expect(v.gisterenDoel).toBe(true);
    expect(v.doelReeks).toBe(0);
    expect(v.suppReeks).toBe(4);
    expect(v.wegingReeks).toBe(3);
    expect(v.stemmingReeks).toBe(2);
    expect(v.gisterenMl).toBe(1200);
    expect(v.badges.vandaag).toEqual(['week-vol']);
    expect(v.badges.gisteren).toEqual(['drie-op-rij']);
    expect(v.badges.aantal).toBe(3);
    expect(v.badges.totaal).toBe(ALLE_BADGES.length);
    expect(v.badges.volgende.id).toBe('week-op-rij'); // 5 van 7
    expect(v.badges.volgendeDag.dagTeller).toBe(true);
    expect(verledenUit({ datum: '2026-12-01', datums }).vorigeMaandDagen).toBe(9);
    expect(verledenUit({ datum: '2026-11-14', datums: ['2026-09-01', '2026-11-14'] }).dagenSinds).toBe(74);
  });
  test('de week tegenover de weken ervoor', () => {
    expect(weekVerledenUit('2026-11-09', datums)).toEqual({ eersteWeek: false, volleWeken: 0, besteEerdere: 4, vorigeWeek: 4 });
    expect(weekVerledenUit('2026-11-02', datums)).toEqual({ eersteWeek: true, volleWeken: 0, besteEerdere: null, vorigeWeek: null });
    const vol = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    expect(weekVerledenUit('2026-11-09', vol).volleWeken).toBe(2);
  });
});

describe('kiesWeekMotivatie', () => {
  test('zonder verleden de groepen van vroeger: 0, 1 tot 3, 4 tot 6 en 7 dagen', () => {
    const verwacht = { 0: 'week0', 1: 'week1', 3: 'week1', 4: 'week4', 6: 'week4', 7: 'week7' };
    for (const [dagen, g] of Object.entries(verwacht)) {
      const sleutel = kiesWeekZin(Number(dagen), '2026-11-09');
      expect(groepVan(sleutel), dagen).toBe(g);
      expect(Number(sleutel.split('.')[2])).toBeLessThanOrEqual(WEEKGROEPEN[g]);
    }
    expect(kiesWeekZin(5, '2026-11-09')).toBe(kiesWeekZin(5, '2026-11-09'));
  });
  test('een vergelijking alleen als ze gunstig is', () => {
    const g = (dagen, info) => kiesWeekMotivatie(dagen, '2026-11-09', info).groep;
    expect(g(3, { eersteWeek: true })).toBe('weekEerste');
    expect(g(7, { volleWeken: 3 })).toBe('weekVolReeks');
    expect(kiesWeekMotivatie(7, '2026-11-09', { volleWeken: 3 }).waarden).toEqual({ aantal: 3 });
    expect(g(7, { volleWeken: 1, besteEerdere: 5, vorigeWeek: 5 })).toBe('week7');
    expect(g(5, { besteEerdere: 4, vorigeWeek: 2 })).toBe('weekRecord');
    expect(g(3, { besteEerdere: 6, vorigeWeek: 2 })).toBe('weekMeer');
    expect(g(2, { besteEerdere: 6, vorigeWeek: 5 })).toBe('week1'); // minder dan vorige week: geen woord daarover
    expect(g(5, { besteEerdere: 6, vorigeWeek: 5 })).toBe('week4');
    expect(g(3, { besteEerdere: null, vorigeWeek: 0 })).toBe('week1');
  });
});

describe('isDagRond (gedeeld met de badges dag-rond en zeven-dagen-rond)', () => {
  test('geeft precies dagRond voor de zin als de dag rond is', () => {
    const basis = { ...leeg, maaltijden: 3, etenKlaar: true, ml: 2000, supplementen: { genomen: 1, totaal: 1 } };
    for (const wijziging of [{}, { ml: 1900 }, { etenKlaar: false }, { supplementen: { genomen: 0, totaal: 1 } }, { supplementen: { genomen: 0, totaal: 0 } }, { stemming: 2 }]) {
      const status = { ...basis, ...wijziging };
      expect(isDagRond(status), JSON.stringify(wijziging)).toBe(groepVan(kiesZin(status)) === 'dagRond');
    }
  });
});

describe('elke keuze geeft een volledige zin', () => {
  // Een vaste reeks "toevallige" toestanden: geen enkele zin mag een lege plek ({aantal}, {badge}, {periode}) overhouden.
  test('duizenden toestanden, met en zonder verleden en reactie', () => {
    let zaad = 7;
    // mulberry32: een kleine, vaste generator (geen Math.random: de test geeft elke keer hetzelfde)
    const r = (n) => {
      zaad = (zaad + 0x6d2b79f5) | 0;
      let t = Math.imul(zaad ^ (zaad >>> 15), 1 | zaad);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const kies = (lijst) => lijst[r(lijst.length)];
    const soorten = ['maaltijd', 'gevoel', 'drank', 'periodiek', 'inname', 'stemming', 'energie', 'notitie', 'weging', 'favoriet', 'verslag', 'vorigeDag', 'aangepast', 'eigen', 'herinnering', 'slot', 'dagdoel', 'supplementLijst', 'rondleiding'];
    const ids = ALLE_BADGES.map((b) => b.id);
    const gezien = new Set();
    for (let i = 0; i < 6000; i++) {
      const totaalSupp = r(4);
      const status = {
        dagdeel: kies(['ochtend', 'middag', 'avond', null]), maaltijden: r(7), etenKlaar: r(2) === 1, ml: r(10) * 250, doelMl: kies([0, 1500, 2000]),
        supplementen: { genomen: r(totaalSupp + 1), totaal: totaalSupp }, stemming: kies([null, 1, 2, 3, 4, 5]), energie: kies([null, 1, 3, 5]),
        lopendeReeks: kies([0, 1, 2, 3, 7, 9, 14, 150]), dagenBijgehouden: kies([0, 1, 10, 50, 77]), dagenSindsVorige: kies([null, 1, 2, 5, 20]),
        datum: `2026-${String(1 + r(12)).padStart(2, '0')}-${String(1 + r(28)).padStart(2, '0')}`, drankenAantal: r(5),
        iets: kies([undefined, true, false]),
        reactie: r(3) === 0 ? null : { soort: kies(soorten), teller: 1 + r(9), nieuw: { iets: r(4) === 0, rond: r(4) === 0, eten: r(3) === 0, supp: r(3) === 0, doel: r(3) === 0, moment: r(3) === 0, stap: r(2) === 0, badges: r(5) === 0 ? [kies(ids)] : [], eersteStemming: r(2) === 0, eersteNotitie: r(2) === 0, eersteWeging: r(2) === 0, mlVoor: r(4) * 250 } },
        verleden: r(4) === 0 ? undefined : {
          eersteDatum: kies(['2026-01-15', '2025-06-01', null]), besteEerdereReeks: kies([0, 2, 8]), rondReeks: r(4), gisterenRond: r(3) === 0, gisterenDoel: r(3) === 0, gisterenMl: r(8) * 250,
          doelReeks: r(6), suppReeks: r(6), wegingReeks: r(6), stemmingReeks: r(6), weekDagen: r(8), vorigeMaandDagen: r(25),
          totaal: { maaltijden: kies([3, 10, 100]), doelDagen: kies([1, 5, 25]), volledigeDagen: kies([2, 7, 30]), rondeDagen: kies([1, 5, 10]), notitieDagen: kies([1, 5, 20]), stemmingDagen: kies([2, 7, 30]), wegingen: kies([1, 4, 8]), favorieten: kies([1, 5, 10]) },
          badges: { vandaag: r(4) === 0 ? [kies(ids), kies(ids)].slice(0, 1 + r(2)) : [], gisteren: r(5) === 0 ? [kies(ids)] : [], aantal: kies([1, 5, 12, 33]), totaal: 33, volgende: r(3) === 0 ? null : kies([{ id: 'week-vol', aantal: 6, doel: 7, dagTeller: true }, { id: 'maand-vol', aantal: 15, doel: 30, dagTeller: true }, { id: 'tien-kannen', aantal: 4, doel: 10, dagTeller: false }]), volgendeDag: r(2) === 0 ? null : { id: 'week-op-rij', aantal: 1 + r(5), doel: 7, dagTeller: true } },
        },
      };
      const keuze = kiesMotivatie(status);
      expect(GROEPEN[keuze.groep], keuze.groep).toBeDefined();
      expect(typeof TEKSTEN.motivatie[keuze.groep][keuze.sleutel.split('.')[2]], keuze.sleutel).toBe('string');
      for (const naam of ['Testnaam', '']) {
        const zin = motivatieZin(keuze, naam);
        expect(zin, keuze.sleutel).not.toContain('{');
        expect(zin, keuze.sleutel).not.toContain('undefined');
        expect(zin, keuze.sleutel).not.toContain('badge.namen');
      }
      gezien.add(keuze.groep);
    }
    // Vrijwel elke groep komt in zo een reeks voor: een groep die nooit gekozen wordt, is een fout in de volgorde.
    // (eersteDag vraagt dat de eerste dag vandaag is: die heeft haar eigen test hierboven)
    const nooit = Object.keys(GROEPEN).filter((g) => !g.startsWith('m-') && g !== 'eersteDag' && !gezien.has(g));
    expect(nooit).toEqual([]);
    for (const m of Object.keys(MIJLPALEN)) expect(MIJLPALEN[m].length).toBeGreaterThan(2);
  });
});
