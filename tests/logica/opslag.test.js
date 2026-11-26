import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb, SCHEMA_VERSIE } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { plusDagen, vandaag, weekStart } from '../../src/kern/datum.js';
import { alleInstellingen, leesInstelling, migreerKan, STANDAARD, zetInstelling } from '../../src/data/instellingen.js';
import { leesDag, zetNotitie } from '../../src/data/dagen.js';
import {
  bewaarMaaltijd, isIngevuld, leesMaaltijden, MAALTIJDSOORTEN, STANDAARDTIJD, wisMaaltijd, zelfdeAlsGisteren,
} from '../../src/data/maaltijden.js';
import { leesDranken, totaalMl, verwijderDrank, verwijderLaatste, voegDrankToe } from '../../src/data/dranken.js';
import {
  bewaarWeging, laatsteWeging, leesWegingen, verschilMetVorigeWeek, verwijderWeging, wegingVanWeek,
} from '../../src/data/wegingen.js';

const VANDAAG = vandaag();
const GISTEREN = plusDagen(VANDAAG, -1);
const MORGEN = plusDagen(VANDAAG, 1);

// Vangt events op tijdens één test.
function vang(naam) {
  const lijst = [];
  const meldAf = luister(naam, (detail) => lijst.push(detail));
  return { lijst, meldAf };
}

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('database', () => {
  test('schema 4 met de tien stores', () => {
    expect(SCHEMA_VERSIE).toBe(6);
    expect(db.verno).toBe(6);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['badges', 'dagen', 'dranken', 'favorieten', 'fotos', 'instellingen', 'maaltijden', 'momentinnames', 'supplementen', 'wegingen'],
    );
  });
});

describe('instellingen', () => {
  test('standaardwaarde zolang niets is ingesteld', async () => {
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2500);
    expect(await leesInstelling('drinken.glasMl')).toBe(800);
    expect(await leesInstelling('profiel.naam')).toBe(''); // geen standaardnaam
    expect(await leesInstelling('meldingen.dagboek')).toEqual({ aan: false, uur: '20:00' });
  });

  test('een gelezen standaardwaarde wijzigen raakt de standaard niet', async () => {
    const groottes = await leesInstelling('drinken.groottes');
    groottes.thee = 999;
    expect(STANDAARD['drinken.groottes'].thee).toBe(200);
  });

  test('zetten bewaart en zendt een event', async () => {
    const { lijst, meldAf } = vang('instelling:gewijzigd');
    await zetInstelling('drinken.glasMl', 300);
    meldAf();
    expect(await leesInstelling('drinken.glasMl')).toBe(300);
    expect(lijst).toEqual([{ sleutel: 'drinken.glasMl', waarde: 300 }]);
    expect((await alleInstellingen())['drinken.glasMl']).toBe(300);
    expect((await alleInstellingen())['drinken.dagdoelMl']).toBe(2500);
  });
});

describe('dagen', () => {
  test('een dag zonder record is een lege bladzijde en wordt niet bewaard', async () => {
    expect(await leesDag(VANDAAG)).toMatchObject({ datum: VANDAAG, notitie: '', doelGehaald: false });
    expect(await db.dagen.count()).toBe(0);
  });

  test('de notitie', async () => {
    const { lijst, meldAf } = vang('data:gewijzigd');
    await zetNotitie(VANDAAG, 'rustige dag');
    await zetNotitie(VANDAAG, 'rustige dag, vroeg naar bed');
    meldAf();
    expect(await leesDag(VANDAAG)).toMatchObject({ notitie: 'rustige dag, vroeg naar bed' });
    expect(lijst).toHaveLength(2);
    expect(lijst[0]).toEqual({ store: 'dagen', datum: VANDAAG });

    await zetNotitie(VANDAAG, '');
    expect((await leesDag(VANDAAG)).notitie).toBe('');
  });

  test('het verleden is aanvulbaar, de toekomst niet', async () => {
    await zetNotitie(plusDagen(VANDAAG, -400), 'lang geleden');
    await expect(zetNotitie(MORGEN, 'x')).rejects.toThrow('toekomst');
  });

  test('een voorbeelddag wijzigen maakt hem van de gebruiker, zonder de verzonnen velden (R1-05)', async () => {
    await db.dagen.put({ datum: GISTEREN, notitie: 'voorbeeld', doelGehaald: true, voorbeeld: true, gewijzigdOp: 1 });
    await zetNotitie(GISTEREN, 'van mij');
    expect(await leesDag(GISTEREN)).toMatchObject({ notitie: 'van mij', doelGehaald: false, voorbeeld: false });
  });
});

describe('maaltijden', () => {
  test('zes soorten, standaard allemaal leeg', async () => {
    expect(MAALTIJDSOORTEN).toHaveLength(6);
    const m = await leesMaaltijden(VANDAAG);
    expect(Object.keys(m)).toEqual(MAALTIJDSOORTEN);
    expect(Object.values(m).every((x) => x === null)).toBe(true);
  });

  test('aanmaken: vandaag met het huidige uur, een andere dag met het gewone uur', async () => {
    const nu = await bewaarMaaltijd(VANDAAG, 'ontbijt', { tekst: 'havermout met banaan' });
    expect(nu.tijd).toMatch(/^\d\d:\d\d$/);
    expect(nu).toMatchObject({ tekst: 'havermout met banaan', fotoId: null, voorbeeld: false });

    const toen = await bewaarMaaltijd(GISTEREN, 'avondmaal', { tekst: 'soep' });
    expect(toen.tijd).toBe(STANDAARDTIJD.avondmaal);
    expect((await leesMaaltijden(GISTEREN)).avondmaal.tekst).toBe('soep');
  });

  test('wijzigen houdt de andere velden', async () => {
    await bewaarMaaltijd(VANDAAG, 'ontbijt', { tekst: 'boterham' });
    await bewaarMaaltijd(VANDAAG, 'ontbijt', { tijd: '07:15' });
    expect((await leesMaaltijden(VANDAAG)).ontbijt).toMatchObject({ tekst: 'boterham', tijd: '07:15' });
  });

  test('alles leeg = het record verdwijnt', async () => {
    await bewaarMaaltijd(VANDAAG, 'ontbijt', { tekst: 'boterham' });
    expect(await bewaarMaaltijd(VANDAAG, 'ontbijt', { tekst: '   ' })).toBeNull();
    expect((await leesMaaltijden(VANDAAG)).ontbijt).toBeNull();
    expect(await db.maaltijden.count()).toBe(0);
    // Alleen een uur zonder inhoud wordt ook niet bewaard.
    expect(await bewaarMaaltijd(VANDAAG, 'middagmaal', { tijd: '12:00' })).toBeNull();
    expect(await db.maaltijden.count()).toBe(0);
  });

  test('ingevuld is een maaltijd met tekst of een foto', async () => {
    expect(isIngevuld({ tekst: '', fotoId: null })).toBe(false);
    expect(isIngevuld(null)).toBe(false);
    expect(isIngevuld({ tekst: 'x', fotoId: null })).toBe(true);
    expect(isIngevuld({ tekst: '', fotoId: 7 })).toBe(true);
  });

  test('weigert de toekomst, een onbekende soort en een fout uur', async () => {
    await expect(bewaarMaaltijd(MORGEN, 'ontbijt', { tekst: 'x' })).rejects.toThrow('toekomst');
    await expect(bewaarMaaltijd(VANDAAG, 'brunch', { tekst: 'x' })).rejects.toThrow('soort');
    await expect(bewaarMaaltijd(VANDAAG, 'ontbijt', { tijd: '25:00' })).rejects.toThrow('tijd');
  });

  test('een voorbeeldmaaltijd wijzigen maakt hem van de gebruiker', async () => {
    await db.maaltijden.put({ datum: GISTEREN, soort: 'ontbijt', tijd: '08:00', tekst: 'voorbeeld', fotoId: null, voorbeeld: true, gewijzigdOp: 1 });
    await bewaarMaaltijd(GISTEREN, 'ontbijt', { tijd: '09:30' });
    expect((await leesMaaltijden(GISTEREN)).ontbijt).toMatchObject({ tekst: 'voorbeeld', tijd: '09:30', voorbeeld: false });
  });

  test('wisMaaltijd en het event', async () => {
    await bewaarMaaltijd(VANDAAG, 'ontbijt', { tekst: 'x' });
    const { lijst, meldAf } = vang('data:gewijzigd');
    await wisMaaltijd(VANDAAG, 'ontbijt');
    meldAf();
    expect((await leesMaaltijden(VANDAAG)).ontbijt).toBeNull();
    expect(lijst).toEqual([{ store: 'maaltijden', datum: VANDAAG }]);
  });

  test('zelfde als gisteren neemt alleen de tekst over', async () => {
    expect(await zelfdeAlsGisteren(VANDAAG, 'ontbijt')).toBeNull();
    await db.maaltijden.put({ datum: GISTEREN, soort: 'ontbijt', tijd: '07:00', tekst: 'yoghurt', fotoId: 12, voorbeeld: false, gewijzigdOp: 1 });
    const m = await zelfdeAlsGisteren(VANDAAG, 'ontbijt');
    expect(m).toMatchObject({ tekst: 'yoghurt', fotoId: null });
    expect(m.tijd).not.toBe('07:00');
  });
});

describe('dranken', () => {
  test('één tik op Water is één kan van 800 ml, of de ingestelde grootte', async () => {
    const drank = await voegDrankToe(VANDAAG);
    expect(drank).toMatchObject({ datum: VANDAAG, soort: 'water', ml: 800, voorbeeld: false });
    expect(typeof drank.id).toBe('number');
    await zetInstelling('drinken.glasMl', 300);
    await voegDrankToe(VANDAAG);
    expect(await totaalMl(VANDAAG)).toBe(1100);
  });

  test('een oude drank van 250 ml blijft 250 ml naast een nieuwe kan', async () => {
    await db.dranken.add({ datum: VANDAAG, tijdstip: 1, soort: 'water', ml: 250, voorbeeld: false });
    await migreerKan();
    await voegDrankToe(VANDAAG);
    expect((await leesDranken(VANDAAG)).map((d) => d.ml)).toEqual([250, 800]);
    expect(await totaalMl(VANDAAG)).toBe(1050);
  });

  test('de migratie zet een oude standaard van 250 één keer om naar 800', async () => {
    await zetInstelling('drinken.glasMl', 250);
    await migreerKan();
    expect(await leesInstelling('drinken.glasMl')).toBe(800);
    await zetInstelling('drinken.glasMl', 250); // daarna zelf gekozen: blijft staan
    await migreerKan();
    expect(await leesInstelling('drinken.glasMl')).toBe(250);
  });

  test('de migratie zet een dagdoel van 2000 één keer om naar 2500', async () => {
    await zetInstelling('drinken.dagdoelMl', 2000);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2500);
    await zetInstelling('drinken.dagdoelMl', 2000); // daarna bewust gekozen: blijft staan
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(2000);
  });

  test('de migratie laat een eigen dagdoel staan en zet de vlag', async () => {
    await zetInstelling('drinken.dagdoelMl', 1500);
    await migreerKan();
    expect(await leesInstelling('drinken.dagdoelMl')).toBe(1500);
    expect(await leesInstelling('drinken.dagdoelOmgezet')).toBe(true);
  });

  test('de migratie laat een eigen grootte staan', async () => {
    await zetInstelling('drinken.glasMl', 300);
    await migreerKan();
    expect(await leesInstelling('drinken.glasMl')).toBe(300);
  });

  test('andere dranken hebben hun eigen grootte en tellen mee', async () => {
    await voegDrankToe(VANDAAG, 'thee');
    await voegDrankToe(VANDAAG, 'koffie');
    await voegDrankToe(VANDAAG, 'sap', 120);
    expect((await leesDranken(VANDAAG)).map((d) => d.ml)).toEqual([200, 150, 120]);
    expect(await totaalMl(VANDAAG)).toBe(470);
  });

  test('laatste weghalen en een tik apart weghalen', async () => {
    const eerste = await voegDrankToe(VANDAAG);
    await voegDrankToe(VANDAAG, 'thee');
    await voegDrankToe(VANDAAG);
    const weg = await verwijderLaatste(VANDAAG);
    expect(weg.soort).toBe('water');
    expect(await totaalMl(VANDAAG)).toBe(1000);
    await verwijderDrank(eerste.id);
    expect((await leesDranken(VANDAAG)).map((d) => d.soort)).toEqual(['thee']);
    await verwijderLaatste(VANDAAG);
    expect(await verwijderLaatste(VANDAAG)).toBeNull();
  });

  test('het doel wordt één keer per dag gehaald, ook na weghalen en opnieuw tikken', async () => {
    await zetInstelling('drinken.dagdoelMl', 1500);
    const { lijst, meldAf } = vang('doel:gehaald');
    await voegDrankToe(VANDAAG);
    expect(lijst).toHaveLength(0);
    expect((await leesDag(VANDAAG)).doelGehaald).toBe(false);
    await voegDrankToe(VANDAAG);
    expect(lijst).toEqual([{ datum: VANDAAG }]);
    expect((await leesDag(VANDAAG)).doelGehaald).toBe(true);

    await verwijderLaatste(VANDAAG);
    expect((await leesDag(VANDAAG)).doelGehaald).toBe(true);
    await voegDrankToe(VANDAAG);
    await voegDrankToe(VANDAAG); // boven het doel telt het gewoon door
    meldAf();
    expect(lijst).toHaveLength(1);
    expect(await totaalMl(VANDAAG)).toBe(2400);
  });

  test('een vroegere dag aanvullen onthoudt het doel maar viert niet', async () => {
    await zetInstelling('drinken.dagdoelMl', 500); // het kleinste dagdoel (GRENZEN); een kan water haalt het
    const { lijst, meldAf } = vang('doel:gehaald');
    const drank = await voegDrankToe(GISTEREN);
    meldAf();
    expect(lijst).toHaveLength(0);
    expect((await leesDag(GISTEREN)).doelGehaald).toBe(true);
    expect(weekStart(GISTEREN)).toBeTypeOf('string');
    expect(new Date(drank.tijdstip).getDate()).toBe(new Date(Date.now() - 86400000).getDate());
  });

  test('het doel halen laat de notitie staan', async () => {
    await zetInstelling('drinken.dagdoelMl', 500); // het kleinste dagdoel (GRENZEN); een kan water haalt het
    await zetNotitie(VANDAAG, 'blijft staan');
    await voegDrankToe(VANDAAG);
    expect(await leesDag(VANDAAG)).toMatchObject({ notitie: 'blijft staan', doelGehaald: true });
  });

  test('weigert de toekomst en een onbekende drank', async () => {
    await expect(voegDrankToe(MORGEN)).rejects.toThrow('toekomst');
    await expect(voegDrankToe(VANDAAG, 'wijn')).rejects.toThrow('soort');
  });
});

describe('wegingen', () => {
  const dezeWeek = weekStart(VANDAAG);
  const vorigeWeek = plusDagen(dezeWeek, -7);
  const tweeWekenTerug = plusDagen(dezeWeek, -14);

  test('één weging per week: een tweede in dezelfde week vervangt de eerste', async () => {
    await bewaarWeging(dezeWeek, 68.4);
    const tweede = await bewaarWeging(VANDAAG, 68.0);
    expect(tweede).toMatchObject({ week: dezeWeek, datum: VANDAAG, kg: 68, voorbeeld: false });
    expect(await leesWegingen()).toHaveLength(1);
    expect((await wegingVanWeek(VANDAAG)).kg).toBe(68);
  });

  test('afgerond op één decimaal', async () => {
    expect((await bewaarWeging(VANDAAG, 68.44)).kg).toBe(68.4);
  });

  test('verschil met vorige week, en null zonder weging vorige week', async () => {
    await bewaarWeging(tweeWekenTerug, 69.5);
    const nu = await bewaarWeging(VANDAAG, 68.4);
    expect(await verschilMetVorigeWeek(nu)).toBeNull();

    await bewaarWeging(plusDagen(vorigeWeek, 3), 69.0);
    expect(await verschilMetVorigeWeek(nu)).toBe(-0.6);

    await verwijderWeging(vorigeWeek);
    expect(await verschilMetVorigeWeek(nu)).toBeNull();
  });

  test('oplopend, met een begindatum, en de laatste', async () => {
    await bewaarWeging(VANDAAG, 68.4);
    await bewaarWeging(tweeWekenTerug, 69.5);
    await bewaarWeging(vorigeWeek, 69.0);
    expect((await leesWegingen()).map((w) => w.kg)).toEqual([69.5, 69, 68.4]);
    expect((await leesWegingen(vorigeWeek)).map((w) => w.kg)).toEqual([69, 68.4]);
    expect((await laatsteWeging()).kg).toBe(68.4);
  });

  test('leeg schrift', async () => {
    expect(await laatsteWeging()).toBeNull();
    expect(await wegingVanWeek(VANDAAG)).toBeNull();
    expect(await leesWegingen()).toEqual([]);
  });

  test('weigert de toekomst en onmogelijke waarden', async () => {
    await expect(bewaarWeging(MORGEN, 68)).rejects.toThrow('toekomst');
    await expect(bewaarWeging(VANDAAG, 5)).rejects.toThrow('kg');
    await expect(bewaarWeging(VANDAAG, NaN)).rejects.toThrow('kg');
  });
});
