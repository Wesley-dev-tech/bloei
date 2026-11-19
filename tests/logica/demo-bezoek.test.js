// Een bezoek aan de demo (BESLISSING 673 en 674, src/demo/bezoek.js): een nieuw bezoek zet Sofie en haar voorbeeldgegevens terug, herladen in
// hetzelfde tabblad houdt de wijzigingen, en een tweede tabblad maakt het eerste niet leeg. "Profiel verwijderen" wist in de demo niets.
// Elk tabblad is hier een eigen sessionStorage; de sloten (Web Locks) zijn een kleine nabouw die per tabblad bijhoudt wat het vasthoudt.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, openDb } from '../../src/data/db.js';
import { startBezoek, bewaakBezoekdag, BEZOEK_SLEUTEL, SLOT_OPEN } from '../../src/demo/bezoek.js';
import { DEMO_NAAM } from '../../src/demo/voorbeelddata.js';
import { leesInstelling, zetInstelling } from '../../src/data/instellingen.js';

const WORTEL = join(import.meta.dirname, '..', '..');
const NU = new Date(2026, 10, 18, 10, 0);
const MORGEN = new Date(2026, 10, 19, 9, 0);

function nepOpslag() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

// De sloten van een browser: exclusieve sloten wachten op elkaar, gedeelde worden meteen gegeven en blijven tot het tabblad sluit.
function nepSlotbeheer() {
  const vast = []; // { name, mode, tab }
  let rij = Promise.resolve();
  const voor = (tab) => ({
    query: async () => ({ held: vast.map(({ name, mode }) => ({ name, mode, clientId: 'tab' + tab })) }),
    request(name, opties, terugroep) {
      const cb = typeof opties === 'function' ? opties : terugroep;
      const mode = typeof opties === 'object' ? opties.mode ?? 'exclusive' : 'exclusive';
      if (mode === 'shared') {
        const slot = { name, mode, tab };
        vast.push(slot);
        return Promise.resolve(cb(slot));
      }
      const beurt = rij.then(async () => {
        const slot = { name, mode, tab };
        vast.push(slot);
        try {
          return await cb(slot);
        } finally {
          vast.splice(vast.indexOf(slot), 1);
        }
      });
      rij = beurt.catch(() => {});
      return beurt;
    },
  });
  return { voor, sluit: (tab) => vast.splice(0, vast.length, ...vast.filter((s) => s.tab !== tab)), vast };
}

let beheer;
let volgnummer = 0;
// Een tabblad openen: een eigen sessionStorage (of die van een herladen tabblad) en de sloten van dezelfde browser.
const tabblad = (opslag = nepOpslag()) => ({ nr: (volgnummer += 1), opslag });
const start = (tab, nu = NU) => startBezoek({ nu, opslag: tab.opslag, sloten: beheer.voor(tab.nr), herstelThema: async () => {}, bewaak: false });

// De BroadcastChannel van een browser: een bericht komt bij alle andere kanalen met dezelfde naam, niet bij de afzender.
function nepKanalen() {
  const alle = [];
  return {
    maak: () => {
      const k = {
        onmessage: null,
        postMessage: (data) => alle.filter((o) => o !== k).forEach((o) => o.onmessage?.({ data })),
        close: () => alle.splice(alle.indexOf(k), 1),
      };
      alle.push(k);
      return k;
    },
    alle,
  };
}
// Een tabblad dat zijn bezoek bewaakt (de dagwachter): geeft de functie terug die de dagwissel van de app nabootst.
function bewaakTab(tab, kanalen, extra = {}) {
  let wissel = null;
  const herlaad = vi.fn();
  const stop = bewaakBezoekdag({
    dag: tab.opslag.getItem(BEZOEK_SLEUTEL) ?? '2026-11-18',
    opslag: tab.opslag,
    sloten: beheer.voor(tab.nr),
    herstelThema: async () => {},
    luisterDag: (fn) => {
      wissel = fn;
      return () => {};
    },
    maakKanaal: kanalen.maak,
    magHerladen: () => true,
    herlaad,
    wachtOpApp: 0,
    ...extra,
  });
  return { wissel: () => wissel(), herlaad, stop };
}

const naam = () => leesInstelling('profiel.naam');
const eigenDrank = (datum = '2026-11-18') => db.dranken.add({ datum, tijdstip: NU.getTime(), soort: 'water', ml: 123, voorbeeld: false });
const eigenDranken = async () => (await db.dranken.toArray()).filter((d) => d.ml === 123).length;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NU });
  await db.delete();
  await openDb();
  beheer = nepSlotbeheer();
});
afterEach(() => vi.useRealTimers());

describe('een nieuw bezoek (BESLISSING 674)', () => {
  test('het eerste bezoek vult de demo en zet het kenmerk van vandaag in sessionStorage', async () => {
    const tab = tabblad();
    expect(await start(tab)).toBe(true);
    expect(await naam()).toBe(DEMO_NAAM);
    expect(tab.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-18');
    expect(beheer.vast.filter((s) => s.name === SLOT_OPEN && s.tab === tab.nr)).toHaveLength(1);
  });

  test('herladen in hetzelfde tabblad houdt de gewijzigde naam en een eigen drank', async () => {
    const tab = tabblad();
    await start(tab);
    await zetInstelling('profiel.naam', 'Iemand anders');
    await eigenDrank();
    beheer.sluit(tab.nr); // herladen: het slot gaat even weg, de sessionStorage blijft
    expect(await start(tabblad(tab.opslag))).toBe(false);
    expect(await naam()).toBe('Iemand anders');
    expect(await eigenDranken()).toBe(1);
  });

  test('een nieuw tabblad of de browser opnieuw open (alle tabbladen dicht): Sofie en haar gegevens staan er weer, ook de naam', async () => {
    const eerste = tabblad();
    await start(eerste);
    const voor = await db.dranken.count();
    await zetInstelling('profiel.naam', 'Iemand anders');
    await zetInstelling('thema.keuze', 'nacht');
    await eigenDrank();
    beheer.sluit(eerste.nr);
    expect(await start(tabblad())).toBe(true);
    expect(await naam()).toBe(DEMO_NAAM);
    expect(await leesInstelling('thema.keuze')).toBe('poeder');
    expect(await eigenDranken()).toBe(0);
    expect(await db.dranken.count()).toBe(voor);
  });

  test('een leeg gemaakte demo (alles gewist) komt bij een nieuw bezoek terug', async () => {
    const eerste = tabblad();
    await start(eerste);
    for (const tabel of db.tables) await tabel.clear();
    beheer.sluit(eerste.nr);
    expect(await start(tabblad())).toBe(true);
    expect(await naam()).toBe(DEMO_NAAM);
    expect(await leesInstelling('start.klaar')).toBe(true);
  });

  test('twee tabbladen: het tweede sluit aan bij het bezoek van het eerste en maakt niets leeg', async () => {
    const eerste = tabblad();
    await start(eerste);
    await zetInstelling('profiel.naam', 'Iemand anders');
    await eigenDrank();
    const tweede = tabblad();
    expect(await start(tweede)).toBe(false);
    expect(await naam()).toBe('Iemand anders');
    expect(await eigenDranken()).toBe(1);
    expect(tweede.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-18');
    // Het eerste tabblad sluit; het tweede herlaadt: nog altijd hetzelfde bezoek.
    beheer.sluit(eerste.nr);
    beheer.sluit(tweede.nr);
    expect(await start(tabblad(tweede.opslag))).toBe(false);
    expect(await naam()).toBe('Iemand anders');
  });

  test('twee tabbladen die tegelijk openen: één vult, het andere sluit aan; geen dubbele rijen', async () => {
    const [a, b] = await Promise.all([start(tabblad()), start(tabblad())]);
    expect([a, b].sort()).toEqual([false, true]);
    const eenmaal = await db.dranken.count();
    beheer.vast.length = 0; // beide tabbladen dicht
    await start(tabblad());
    expect(await db.dranken.count()).toBe(eenmaal);
  });

  test('herladen op een latere dag: een nieuw bezoek, de 28 dagen hangen weer aan vandaag', async () => {
    const tab = tabblad();
    await start(tab);
    await eigenDrank();
    beheer.sluit(tab.nr);
    vi.setSystemTime(MORGEN);
    expect(await start(tabblad(tab.opslag), MORGEN)).toBe(true);
    expect(await eigenDranken()).toBe(0);
    expect((await db.dagen.orderBy('datum').last()).datum).toBe('2026-11-19');
    expect(tab.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
  });

  test('een latere dag terwijl een ander tabblad nog open is: toch een nieuw bezoek (L4), de gegevens van het open tabblad gaan mee terug', async () => {
    const eerste = tabblad();
    await start(eerste);
    await eigenDrank();
    vi.setSystemTime(MORGEN);
    const tweede = tabblad();
    expect(await start(tweede, MORGEN)).toBe(true);
    expect(await eigenDranken()).toBe(0);
    expect(await naam()).toBe(DEMO_NAAM);
    expect((await db.dagen.orderBy('datum').last()).datum).toBe('2026-11-19');
    expect(tweede.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
  });

  test('zelfde dag met een ander tabblad open, ook met een kenmerk van een vroegere dag: aansluiten, niets gewist', async () => {
    const eerste = tabblad();
    await start(eerste);
    await eigenDrank();
    const oud = nepOpslag();
    oud.setItem(BEZOEK_SLEUTEL, '2026-11-10'); // een herladen tabblad dat zijn bezoek eerder begon
    expect(await start(tabblad(oud))).toBe(false);
    expect(await eigenDranken()).toBe(1);
  });

  test('twee tabbladen openen tegelijk op de nieuwe dag terwijl een oud tabblad open staat: een keer vullen', async () => {
    const eerste = tabblad();
    await start(eerste);
    const gevuld = await db.dranken.count();
    await eigenDrank();
    vi.setSystemTime(MORGEN);
    const uitslag = await Promise.all([start(tabblad(), MORGEN), start(tabblad(), MORGEN)]);
    expect(uitslag.sort()).toEqual([false, true]);
    expect(await eigenDranken()).toBe(0);
    expect(await db.dranken.count()).toBe(gevuld);
  });

  test('de naam van het vullingskenmerk in voorbeelddata.js is nog dezelfde', () => {
    expect(readFileSync(join(WORTEL, 'src/demo/voorbeelddata.js'), 'utf8')).toContain("const SLEUTEL_VULLING = 'demo.vulling';");
    expect(readFileSync(join(WORTEL, 'src/demo/bezoek.js'), 'utf8')).toContain("const SLEUTEL_VULLING = 'demo.vulling';");
  });

  test('zonder Web Locks en zonder sessionStorage: elke start is een nieuw bezoek (nooit een fout)', async () => {
    expect(await startBezoek({ nu: NU, opslag: null, sloten: null, herstelThema: async () => {}, bewaak: false })).toBe(true);
    await zetInstelling('profiel.naam', 'Iemand anders');
    expect(await startBezoek({ nu: NU, opslag: null, sloten: null, herstelThema: async () => {}, bewaak: false })).toBe(true);
    expect(await naam()).toBe(DEMO_NAAM);
  });
});

describe('een bezoek eindigt bij de dagwissel (bevinding L4)', () => {
  test('de dagwissel van de app, met een eigen wijziging: Sofie staat er weer, het kenmerk is van de nieuwe dag, de andere tabbladen krijgen bericht', async () => {
    const kanalen = nepKanalen();
    const tab = tabblad();
    await start(tab);
    await zetInstelling('profiel.naam', 'Iemand anders');
    await eigenDrank();
    const bewaakt = bewaakTab(tab, kanalen);
    const luisteraar = kanalen.maak();
    const bericht = vi.fn();
    luisteraar.onmessage = (e) => bericht(e.data);
    vi.setSystemTime(MORGEN);
    await bewaakt.wissel();
    expect(await naam()).toBe(DEMO_NAAM);
    expect(await eigenDranken()).toBe(0);
    expect((await db.dagen.orderBy('datum').last()).datum).toBe('2026-11-19');
    expect(tab.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
    expect(bericht).toHaveBeenCalledWith({ dag: '2026-11-19' });
    expect(bewaakt.herlaad).not.toHaveBeenCalled(); // het tabblad zelf tekent opnieuw via 'data:gewijzigd'; alleen de andere herladen
  });

  test('dezelfde dag (bv. een dagdeel of een timer die te vroeg afloopt): niets gebeurt', async () => {
    const tab = tabblad();
    await start(tab);
    await zetInstelling('profiel.naam', 'Iemand anders');
    await bewaakTab(tab, nepKanalen()).wissel();
    expect(await naam()).toBe('Iemand anders');
  });

  test('de app vulde stil opnieuw (niets gewijzigd, R5-09): het tabblad sluit aan zonder nog eens te wissen of te melden', async () => {
    const kanalen = nepKanalen();
    const tab = tabblad();
    await start(tab);
    const bewaakt = bewaakTab(tab, kanalen);
    const bericht = vi.fn();
    kanalen.maak().onmessage = bericht;
    vi.setSystemTime(MORGEN);
    await (await import('../../src/demo/voorbeelddata.js')).vulDemoAlsLeeg(MORGEN);
    const gevuld = await db.dranken.count();
    await bewaakt.wissel();
    expect(await db.dranken.count()).toBe(gevuld);
    expect(bericht).not.toHaveBeenCalled();
    expect(tab.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
  });

  test('twee tabbladen zien de dagwissel tegelijk: een keer vullen, het andere herlaadt zacht en sluit aan', async () => {
    const kanalen = nepKanalen();
    const a = tabblad();
    await start(a);
    const gevuld = await db.dranken.count();
    const b = tabblad();
    await start(b);
    await eigenDrank();
    const bewaaktA = bewaakTab(a, kanalen);
    const bewaaktB = bewaakTab(b, kanalen);
    vi.setSystemTime(MORGEN);
    await Promise.all([bewaaktA.wissel(), bewaaktB.wissel()]);
    expect(await db.dranken.count()).toBe(gevuld);
    expect(await eigenDranken()).toBe(0);
    expect(bewaaktA.herlaad.mock.calls.length + bewaaktB.herlaad.mock.calls.length).toBe(1);
    expect(a.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
    expect(b.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
  });

  test('zonder Web Locks gebeurt hetzelfde, zonder fout', async () => {
    const tab = tabblad();
    await start(tab);
    await zetInstelling('profiel.naam', 'Iemand anders');
    const bewaakt = bewaakTab(tab, nepKanalen(), { sloten: null });
    vi.setSystemTime(MORGEN);
    await bewaakt.wissel();
    expect(await naam()).toBe(DEMO_NAAM);
  });

  test('geen BroadcastChannel: de dagwissel werkt en meldt niets', async () => {
    const tab = tabblad();
    await start(tab);
    await zetInstelling('profiel.naam', 'Iemand anders');
    const bewaakt = bewaakTab(tab, nepKanalen(), { maakKanaal: () => null });
    vi.setSystemTime(MORGEN);
    await bewaakt.wissel();
    expect(await naam()).toBe(DEMO_NAAM);
  });

  describe('het zachte herladen van een ander tabblad', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NU });
    });

    test('wacht zolang er een venster of tekstveld open is, herlaadt dan een keer en zet eerst het nieuwe kenmerk', () => {
      const kanalen = nepKanalen();
      const tab = tabblad();
      tab.opslag.setItem(BEZOEK_SLEUTEL, '2026-11-18');
      let vrij = false;
      const bewaakt = bewaakTab(tab, kanalen, { magHerladen: () => vrij });
      const zender = kanalen.maak();
      zender.postMessage({ dag: '2026-11-19' });
      zender.postMessage({ dag: '2026-11-19' });
      expect(bewaakt.herlaad).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(bewaakt.herlaad).not.toHaveBeenCalled();
      vrij = true;
      vi.advanceTimersByTime(1000);
      expect(bewaakt.herlaad).toHaveBeenCalledTimes(1);
      expect(tab.opslag.getItem(BEZOEK_SLEUTEL)).toBe('2026-11-19');
      vi.advanceTimersByTime(5000);
      expect(bewaakt.herlaad).toHaveBeenCalledTimes(1);
    });

    test('een bericht over de dag van dit bezoek (of een oudere) doet niets', () => {
      const kanalen = nepKanalen();
      const tab = tabblad();
      tab.opslag.setItem(BEZOEK_SLEUTEL, '2026-11-18');
      const bewaakt = bewaakTab(tab, kanalen);
      const zender = kanalen.maak();
      zender.postMessage({ dag: '2026-11-18' });
      zender.postMessage({ dag: '2026-11-01' });
      zender.postMessage({ iets: 'anders' });
      vi.advanceTimersByTime(5000);
      expect(bewaakt.herlaad).not.toHaveBeenCalled();
    });

    test('stoppen ruimt alles op: geen herladen meer na stop()', () => {
      const kanalen = nepKanalen();
      const tab = tabblad();
      const bewaakt = bewaakTab(tab, kanalen, { magHerladen: () => false });
      kanalen.maak().postMessage({ dag: '2026-11-19' });
      bewaakt.stop();
      vi.advanceTimersByTime(5000);
      expect(bewaakt.herlaad).not.toHaveBeenCalled();
      expect(kanalen.alle).toHaveLength(1); // alleen de zender
    });
  });
});

describe('"Profiel verwijderen" in de demo (BESLISSING 673)', () => {
  const meer = readFileSync(join(WORTEL, 'src/schermen/meer.js'), 'utf8');
  const functie = meer.slice(meer.indexOf('function wisAllesMetVraag'), meer.indexOf('function themaVoorbeeld'));

  test('de eerste stap van de knop is de demotak: het kaartje, en terug vóór er iets gewist kan worden', () => {
    const tak = functie.indexOf("if (import.meta.env.VITE_DEMO === 'true') {");
    expect(tak).toBeGreaterThan(0);
    const blok = functie.slice(tak, functie.indexOf('}', functie.indexOf('return;', tak)) + 1);
    expect(blok).toContain("import('../demo/profiel.js')");
    expect(blok).toContain('return;');
    expect(blok).not.toContain('wisAlles');
    expect(functie.indexOf('wisAlles()')).toBeGreaterThan(tak);
  });

  test('het kaartje zelf wist niets en heeft één gevulde knop', () => {
    const profiel = readFileSync(join(WORTEL, 'src/demo/profiel.js'), 'utf8');
    expect(profiel).not.toMatch(/wisAlles|\.clear\(|\.delete\(|begin\(/);
    expect(profiel.match(/knop\(/g)).toHaveLength(1);
    expect(profiel).toContain("soort: 'primair'");
  });

  test('de zinnen van de demo staan alleen in src/demo/teksten.js, niet in src/teksten.js (zo blijven ze uit de echte bouw)', async () => {
    const gedeeld = readFileSync(join(WORTEL, 'src/teksten.js'), 'utf8');
    const { DEMO_TEKSTEN } = await import('../../src/demo/teksten.js');
    for (const sleutel of ['balk', 'balkKort', 'opnieuwLabel', 'zeker', 'bezig', 'profielTitel', 'profielTekst']) expect(gedeeld.includes(DEMO_TEKSTEN[sleutel]), sleutel).toBe(false);
    expect(DEMO_TEKSTEN.profielTitel).toBe('Dit is de demo');
    expect(DEMO_TEKSTEN.profielKnop).toBe('Begrepen');
    for (const tekst of Object.values(DEMO_TEKSTEN)) expect(tekst, tekst).not.toMatch(/!/);
  });

  test('elke dt()-sleutel in src/demo heeft een tekst', async () => {
    const { DEMO_TEKSTEN } = await import('../../src/demo/teksten.js');
    const ontbreekt = [];
    for (const naam of ['balk.js', 'profiel.js']) {
      const bron = readFileSync(join(WORTEL, 'src/demo', naam), 'utf8');
      const sleutels = [...bron.matchAll(/\bdt\(\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
      expect(sleutels.length, naam).toBeGreaterThan(2);
      for (const s of sleutels) if (typeof DEMO_TEKSTEN[s] !== 'string') ontbreekt.push(naam + ': ' + s);
    }
    expect(ontbreekt).toEqual([]);
  });
});
