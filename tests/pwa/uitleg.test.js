// De motor van de rondleidingen: volgorde, overslaan bij een ontbrekend onderdeel, onthouden en de plaats van het kaartje.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kiesAanwezig, verloop, schikking, gatRond, MAAT, leesStaat, isAuto, zetAuto, isGezien, markeerGezien, wisGezien, OPSLAGSLEUTEL } from '../../src/uitleg/rondleiding.js';
import { STAPPEN, ONDERWERPEN, AANBOD, HANDELING_SCHERM, stappenVoor, tekstVoorToestel } from '../../src/uitleg/stappen.js';
import { TEKSTEN } from '../../src/teksten.js';

// Een nepopslag, zodat de tests niets van een echte browser nodig hebben.
function nepOpslag(begin = {}) {
  const data = { ...begin };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    data,
  };
}

describe('volgorde', () => {
  it('loopt vooruit en terug binnen de grenzen', () => {
    const g = verloop(3);
    expect([g.nr, g.isEerste, g.isLaatste]).toEqual([1, true, false]);
    expect(g.vorige()).toBe(false);
    expect(g.volgende()).toBe(true);
    expect(g.volgende()).toBe(true);
    expect([g.nr, g.isLaatste]).toEqual([3, true]);
    expect(g.volgende()).toBe(false); // na de laatste stap: Klaar
    expect(g.vorige()).toBe(true);
    expect(g.nr).toBe(2);
  });

  it('begint bij een gevraagde stap en klemt een rare waarde', () => {
    expect(verloop(4, 2).nr).toBe(3);
    expect(verloop(4, 99).nr).toBe(4);
    expect(verloop(4, -5).nr).toBe(1);
  });
});

describe('ontbrekende onderdelen', () => {
  const stappen = [{ id: 'a', doel: '.a' }, { id: 'b', doel: '.b' }, { id: 'c', doel: '.c' }, { id: 'm', midden: true }];
  it('slaat een stap zonder onderdeel over en houdt een stap in het midden', () => {
    const aanwezig = kiesAanwezig(stappen, (s) => s.doel === '.a' || s.doel === '.c');
    expect(aanwezig.map((s) => s.id)).toEqual(['a', 'c', 'm']);
  });
  it('geeft niets terug als er geen onderdeel is', () => {
    expect(kiesAanwezig(stappen.slice(0, 3), () => null)).toEqual([]);
  });
});

describe('onthouden', () => {
  it('start met de uitleg aan en niets gezien', () => {
    const o = nepOpslag();
    expect(leesStaat(o)).toEqual({ auto: true, gezien: {}, welkom: false, proef: false, proefWelkom: false, echt: false });
    expect(isAuto(o)).toBe(true);
  });

  it('onthoudt per scherm wat gezien is, in één sleutel', () => {
    const o = nepOpslag();
    markeerGezien('vandaag', o);
    markeerGezien('drinken', o);
    expect(isGezien('vandaag', o)).toBe(true);
    expect(isGezien('gewicht', o)).toBe(false);
    expect(Object.keys(o.data)).toEqual([OPSLAGSLEUTEL]);
  });

  it('zet de automatische uitleg uit en alles opnieuw tonen wist het gezien', () => {
    const o = nepOpslag();
    markeerGezien('vandaag', o);
    zetAuto(false, o);
    expect(isAuto(o)).toBe(false);
    expect(isGezien('vandaag', o)).toBe(true);
    wisGezien(o);
    expect(isGezien('vandaag', o)).toBe(false);
    expect(isAuto(o)).toBe(false); // de voorkeur blijft
  });

  it('overleeft kapotte of ontbrekende opslag', () => {
    expect(leesStaat(nepOpslag({ [OPSLAGSLEUTEL]: '{kapot' })).auto).toBe(true);
    expect(leesStaat({ getItem: () => { throw new Error('geweigerd'); } }).gezien).toEqual({});
  });
});

// BESLISSING 328: het gat volgt het onderdeel met een gelijke marge en meelopende hoeken; het kaartje staat ernaast, nooit erover.
describe('het gat rond het onderdeel', () => {
  it('heeft rondom dezelfde marge en de straal van het onderdeel plus die marge', () => {
    const g = gatRond({ left: 100, top: 50, width: 200, height: 80 }, { marge: 8, straal: 16 });
    expect(g).toEqual({ left: 92, top: 42, width: 216, height: 96, straal: 24 });
  });
  it('een pil blijft een pil, een hoekig onderdeel krijgt de marge als straal', () => {
    expect(gatRond({ left: 0, top: 0, width: 120, height: 44 }, { marge: 6, straal: 999 }).straal).toBe(28);
    expect(gatRond({ left: 0, top: 0, width: 120, height: 44 }, { marge: 6, straal: 0 }).straal).toBe(6);
  });
  it('de maten zijn dezelfde als in tests/e2e/x-uitleg-meting.js', () => {
    expect(MAAT).toMatchObject({ marge: 8, margeTelefoon: 12, afstand: 14, rand: 12 }); // BESLISSING 590: 12 px lucht op een telefoon
  });
  it('een stap kan zijn eigen straal meegeven', () => {
    expect(gatRond({ left: 0, top: 0, width: 120, height: 80 }, { marge: 8, straal: 16, eigenStraal: 12 }).straal).toBe(12);
  });
});

describe('plaats van het kaartje', () => {
  const venster = { breed: 1280, hoog: 800 };
  const kaart = { breed: 360, hoog: 220 };
  const overlapt = (g, p) => !(p.links >= g.left + g.width || p.links + p.breedte <= g.left || p.boven >= g.top + g.height || p.boven + kaart.hoog <= g.top);
  it('zonder onderdeel staat het in het midden', () => {
    const p = schikking({ gat: null, kaart, venster });
    expect(p.kant).toBe('midden');
    expect(p.links).toBe(460);
    expect(p.boven).toBe(290);
  });
  it('staat onder het onderdeel op een vaste afstand, met het pijltje naar het midden van het onderdeel', () => {
    const gat = { left: 400, top: 100, width: 300, height: 100 };
    const p = schikking({ gat, kaart, venster });
    expect(p.kant).toBe('onder');
    expect(p.schuif).toBe(0);
    expect(p.boven).toBe(200 + MAAT.afstand);
    expect(p.links + p.pijl).toBe(550);
  });
  it('staat erboven als onder geen plaats is', () => {
    const gat = { left: 400, top: 500, width: 300, height: 120 };
    const p = schikking({ gat, kaart, venster });
    expect(p.kant).toBe('boven');
    expect(p.boven + kaart.hoog).toBe(500 - MAAT.afstand);
  });
  it('staat ernaast bij een hoog onderdeel, rechts en anders links, binnen het inhoudsvlak', () => {
    const gebied = { links: 296, rechts: 1280 };
    const rechts = schikking({ gat: { left: 300, top: 100, width: 400, height: 600 }, kaart, venster, gebied });
    expect(rechts.kant).toBe('rechts');
    expect(rechts.links).toBe(700 + MAAT.afstand);
    const links = schikking({ gat: { left: 800, top: 100, width: 460, height: 600 }, kaart, venster, gebied });
    expect(links.kant).toBe('links');
    expect(links.links + links.breedte).toBe(800 - MAAT.afstand);
    expect(links.links).toBeGreaterThanOrEqual(gebied.links);
  });
  it('staat boven een vaste balk onderaan (de tabbalk op een iPad staand), met de afstand ertussen', () => {
    const p = schikking({ gat: { left: 0, top: 1116, width: 820, height: 64 }, kaart: { breed: 360, hoog: 320 }, venster: { breed: 820, hoog: 1180 }, zone: { top: 0, bottom: 1116 }, vast: true });
    expect(p.kant).toBe('boven');
    expect(p.boven + 320).toBe(1116 - MAAT.afstand);
  });
  it('schuift de pagina zo weinig mogelijk als onderdeel en kaartje samen niet in beeld staan', () => {
    const p = schikking({ gat: { left: 400, top: 700, width: 300, height: 100 }, kaart, venster });
    expect(p.kant).toBe('onder');
    expect(p.schuif).toBe(700 + 100 + MAAT.afstand + 220 - (800 - MAAT.rand));
  });
  // Eigenaar, 0.5.8: de aanduiding stopt nooit halverwege een blok. Past het blok niet naast het kaartje, dan blijft het hele blok aangeduid
  // en ligt het kaartje over zijn onderste deel.
  it('een onderdeel dat niets naast zich laat: bovenaan, het kaartje vast onderaan en over het blok, het gat niet afgesneden', () => {
    const gebied = { links: 296, rechts: 1280 };
    const p = schikking({ gat: { left: 300, top: 300, width: 970, height: 1500 }, kaart, venster, gebied });
    expect(p.kant).toBe('vast');
    expect(p.schuif).toBe(300 - MAAT.rand);
    expect(p.boven + kaart.hoog).toBe(800 - MAAT.rand);
    expect(p.snij).toBe(null);
    expect(p.over).toBe(true);
    expect(p.pijl).toBe(null);
  });
  it('op een telefoon met heel: het hele blok bovenaan, de kaart vast onderaan erover, en het vak eindigt achter de kaart', () => {
    const tel = { breed: 390, hoog: 844 };
    const k = { breed: 366, hoog: 360 };
    const zone = { top: 120, bottom: 760 };
    const gat = { left: 20, top: 400, width: 350, height: 520 };
    const gewoon = schikking({ gat, kaart: k, venster: tel, zone, telefoon: true });
    expect(gewoon.snij).not.toBe(null); // zonder heel: afgesneden boven de kaart, zoals voorheen
    expect(gewoon.over).toBe(undefined);
    const p = schikking({ gat, kaart: k, venster: tel, zone, telefoon: true, heel: true });
    expect(p.kant).toBe('vast-onder');
    expect(p.over).toBe(true);
    expect(p.snij).toBeGreaterThan(p.boven); // het einde van het vak ligt achter de kaart
    expect(p.snij).toBeLessThan(p.boven + k.hoog);
  });
  it('nooit over het onderdeel en altijd binnen het venster, voor veel standen', () => {
    const gebied = { links: 296, rechts: 1280 };
    for (let top = -200; top <= 900; top += 50) {
      for (const [w, hh] of [[60, 40], [300, 120], [600, 300], [900, 500]]) {
        for (const left of [300, 600, 1280 - w - 4]) {
          const gat = { left, top, width: w, height: hh };
          const p = schikking({ gat, kaart, venster, gebied });
          const na = { ...gat, top: gat.top - p.schuif };
          expect(overlapt(na, p), JSON.stringify({ gat, p })).toBe(false);
          expect(p.links).toBeGreaterThanOrEqual(gebied.links + MAAT.rand - 0.5);
          expect(p.links + p.breedte).toBeLessThanOrEqual(gebied.rechts - MAAT.rand + 0.5);
          expect(p.boven).toBeGreaterThanOrEqual(MAAT.rand - 0.5);
          expect(p.boven + kaart.hoog).toBeLessThanOrEqual(venster.hoog - MAAT.rand + 0.5);
        }
      }
    }
  });
});

describe('plaats op een telefoon', () => {
  const venster = { breed: 390, hoog: 844 };
  const kaart = { hoog: 220 };
  const zone = { top: 100, bottom: 780 };
  it('staat vast onderaan de zone, even breed als het venster min de marges', () => {
    // (de pagina staat bovenaan en kan niet verder omhoog: dan mag de ruimte tot de kaart groter zijn, BESLISSING 592 M1)
    const p = schikking({ gat: { left: 14, top: 120, width: 362, height: 100 }, kaart, venster, telefoon: true, zone, schuif: { min: 0, max: 2000 } });
    expect(p.kant).toBe('vast-onder');
    expect(p.boven + kaart.hoog).toBe(zone.bottom - MAAT.rand);
    expect([p.links, p.breedte]).toEqual([MAAT.rand, 390 - 2 * MAAT.rand]);
    expect(p.schuif).toBe(0);
  });
  // BESLISSING 592 (M1, M2): tussen het vak en de kaart precies 12 px, tussen het vak en de vaste kop of de balk minstens 12 px.
  it('de vaste maten: 12 px tot de kaart, 12 px tot de kop en de balk, 12 px lucht, 16 px straal, 8 px tot de zijrand', () => {
    expect(MAAT).toMatchObject({ afstandTelefoon: 12, randGatTelefoon: 12, margeTelefoon: 12, margeKrap: 6, straalTelefoon: 16, zijTelefoon: 8 });
  });
  it('schuift de pagina tot het vak precies 12 px boven de kaart staat, ook als het al vrij stond', () => {
    for (const top of [120, 300, 820]) {
      const p = schikking({ gat: { left: 14, top, width: 362, height: 100 }, kaart, venster, telefoon: true, zone });
      expect(p.kant).toBe('vast-onder');
      expect(p.boven - (top + 100 - p.schuif)).toBe(MAAT.afstandTelefoon);
      expect(top - p.schuif).toBeGreaterThanOrEqual(zone.top + MAAT.randGatTelefoon);
    }
  });
  it('kan de pagina niet verder schuiven, dan blijft de kaart op haar plaats en is de ruimte groter (nooit kleiner)', () => {
    const p = schikking({ gat: { left: 14, top: 150, width: 362, height: 100 }, kaart, venster, telefoon: true, zone, schuif: { min: -20, max: 0 } });
    expect(p.kant).toBe('vast-onder');
    expect(p.schuif).toBe(-20);
    expect(p.boven - (250 + 20)).toBeGreaterThan(MAAT.afstandTelefoon);
  });
  it('bovenaan: het vak staat precies 12 px onder de kaart en minstens 12 px boven de balk', () => {
    const p = schikking({ gat: { left: 14, top: 600, width: 362, height: 100 }, kaart, venster, telefoon: true, zone, voorkeur: 'vast-boven' });
    expect(p.kant).toBe('vast-boven');
    expect(600 - p.schuif - (p.boven + kaart.hoog)).toBe(MAAT.afstandTelefoon);
    expect(700 - p.schuif).toBeLessThanOrEqual(zone.bottom - MAAT.randGatTelefoon);
  });
  it('staat bovenaan als het onderdeel onderaan staat en niet kan schuiven (de tabbalk)', () => {
    const p = schikking({ gat: { left: -6, top: 774, width: 402, height: 82 }, kaart, venster, telefoon: true, zone, vast: true });
    expect(p.kant).toBe('vast-boven');
    expect(p.boven).toBe(zone.top + MAAT.rand);
  });
  it('schuift een onderdeel onder het kaartje omhoog tot 12 px erboven', () => {
    const p = schikking({ gat: { left: 14, top: 820, width: 362, height: 100 }, kaart, venster, telefoon: true, zone });
    expect(p.kant).toBe('vast-onder');
    expect(820 + 100 - p.schuif).toBe(p.boven - MAAT.afstandTelefoon);
  });
  it('een te hoog onderdeel: bovenaan, en het gat stopt boven het kaartje', () => {
    const p = schikking({ gat: { left: 14, top: 300, width: 362, height: 900 }, kaart, venster, telefoon: true, zone });
    expect(p.kant).toBe('vast-onder');
    expect(p.schuif).toBe(300 - zone.top - MAAT.randGatTelefoon);
    expect(p.snij).toBe(p.boven - MAAT.afstandTelefoon);
  });
});

// BESLISSING 579: "Een thema kiezen" is een korte handleiding over één kaart (de kaart Thema); op een telefoon toont de rondleiding ze in delen.
const KORT = new Set(['h:thema']);

describe('stappen en teksten', () => {
  it('elke stap heeft een titel van hoogstens vier woorden en een tekst van één of twee zinnen', () => {
    for (const sleutel of Object.keys(STAPPEN)) {
      const lijst = stappenVoor(sleutel);
      expect(lijst.length, sleutel).toBeGreaterThanOrEqual(KORT.has(sleutel) ? 1 : 2);
      // Het Dagboek telt de stappen van drie weergaven (dag, week, maand); een gebruiker ziet er hoogstens negen tegelijk (de andere weergaven vallen weg).
      // Zestien sinds de maand een eigen stap De tekens heeft (BESLISSING 703); zeventien sinds de knop Dag openen een eigen stap heeft.
      expect(lijst.length, sleutel).toBeLessThanOrEqual(17);
      for (const s of lijst) {
        expect(s.titel.split(/\s+/).length, `${sleutel}.${s.id}: ${s.titel}`).toBeLessThanOrEqual(5);
        expect((s.tekst.match(/[.?]\s|[.?]$/g) || []).length, `${sleutel}.${s.id}`).toBeLessThanOrEqual(3);
        expect(/[-\u2013\u2014]/.test((s.titel + ' ' + s.tekst).replace(/\w-\w/g, '')), `geen gedachtestreepje in ${sleutel}.${s.id}`).toBe(false);
      }
    }
  });

  it('elk onderwerp start een handeling of een schermrondleiding, met een scherm en teksten, en elk aanbod wijst naar een handeling', () => {
    for (const o of ONDERWERPEN) {
      expect(stappenVoor(o.sleutel).length, o.id).toBeGreaterThanOrEqual(KORT.has(o.sleutel) ? 1 : 4);
      expect(HANDELING_SCHERM[o.id], o.id).toBeTruthy(); // BESLISSING 563: een onderwerp kan ook de rondleiding van zijn scherm starten
      expect(TEKSTEN.uitleg.onderwerp[o.id], o.id).toBeTruthy();
    }
    for (const id of Object.values(AANBOD)) expect(ONDERWERPEN.some((o) => o.sleutel === 'h:' + id), id).toBe(true);
  });

  // BESLISSING 579: de handleiding "Mijn instellingen" is vier korte handleidingen, elk op het scherm waarover ze gaat. Elke stap licht een hele
  // kaart met haar kop op (627) of de knoppen bovenaan; een stap over een ander scherm of midden op het scherm is er niet meer.
  it('Mijn instellingen is vier korte handleidingen, elk op haar eigen scherm', () => {
    const vier = { profiel: 'meer/profiel', thema: 'meer', instDrinken: 'meer/instellingen', instGewicht: 'meer/gewicht' };
    const ids = ONDERWERPEN.map((o) => o.id);
    expect(ids).not.toContain('instellingen');
    expect(STAPPEN['h:instellingen']).toBeUndefined();
    expect(TEKSTEN.uitleg.handeling.instellingen).toBeUndefined();
    expect(TEKSTEN.uitleg.onderwerp.instellingen).toBeUndefined();
    const i = ids.indexOf('profiel');
    expect(ids.slice(i, i + 4)).toEqual(Object.keys(vier)); // samen, op de plaats van de oude rij
    for (const [id, scherm] of Object.entries(vier)) {
      expect(HANDELING_SCHERM[id], id).toBe(scherm);
      const sleutel = ONDERWERPEN.find((o) => o.id === id).sleutel;
      for (const s of stappenVoor(sleutel)) {
        expect(s.midden, `${id}.${s.id}`).toBeFalsy();
        expect(s.voor, `${id}.${s.id}`).toBeFalsy(); // op deze schermen opent niets
        expect(s.tekst, `${id}.${s.id}`).not.toMatch(/^uitleg\./); // de tekst bestaat
      }
    }
    // De knoppen bovenaan: één tekst voor de drie instelschermen; met Delen op een smal scherm, zonder vanaf 960 px.
    const kop = ['meer/profiel', 'meer/instellingen', 'meer/gewicht'].map((sleutel) => stappenVoor(sleutel).at(-1));
    for (const s of kop) expect([s.id, s.doel, s.tekstSleutel]).toEqual(['kop', '.schermkop__acties', 'stap.kopSub']);
    expect(tekstVoorToestel(kop[0], { breed: false, muis: false }).tekst).toMatch(/Delen/);
    expect(tekstVoorToestel(kop[0], { breed: true, muis: true }).tekst).not.toMatch(/Delen/);
    // Geen aanbod na de rondleiding van een instelscherm (ze zou er herhalen wat net getoond werd).
    for (const scherm of Object.values(vier)) expect(AANBOD[scherm], scherm).toBeUndefined();
  });

  // BESLISSING 645: de rondleiding van elk instelscherm toont dezelfde stappen als de handleiding van dat scherm: een tekst, twee ingangen.
  // Het vraagteken en de rij op het scherm Rondleiding starten dezelfde sleutel; de oude stappen en teksten zijn weg.
  it('een instelscherm heeft een tekst voor twee ingangen: het vraagteken en de rij op Rondleiding', () => {
    const drie = { profiel: 'meer/profiel', instDrinken: 'meer/instellingen', instGewicht: 'meer/gewicht' };
    for (const [id, route] of Object.entries(drie)) {
      expect(ONDERWERPEN.find((o) => o.id === id).sleutel, id).toBe(route); // de rij start de rondleiding van het scherm
      expect(STAPPEN['h:' + id], id).toBeUndefined();
      expect(TEKSTEN.uitleg.handeling[id], id).toBeUndefined();
      expect(stappenVoor(route).map((s) => s.id), route).toEqual(['kaart', 'voorbeeld', 'weetjes', 'kop']);
    }
    expect(TEKSTEN.uitleg.handeling.kopSub).toBeUndefined();
    expect(Object.keys(TEKSTEN.uitleg.stap.profiel).sort()).toEqual(['kaart', 'voorbeeld', 'weetjes']);
    expect(Object.keys(TEKSTEN.uitleg.stap.instDrinken).sort()).toEqual(['kaart', 'voorbeeld', 'weetjes']);
    expect(Object.keys(TEKSTEN.uitleg.stap.instGewicht).sort()).toEqual(['kaart', 'voorbeeld', 'weetjes']);
    // Geen zin die in de rondleiding naar diezelfde rondleiding verwijst ("Met Toon het me start je de rondleiding van dit scherm").
    for (const route of Object.values(drie)) for (const s of stappenVoor(route)) expect(s.tekst, `${route}.${s.id}`).not.toMatch(/Toon het me start/);
    // De stap Thema van Algemeen en de handleiding Een thema kiezen: dezelfde tekst en dezelfde delen, uit een bron.
    const opAlgemeen = stappenVoor('meer').find((s) => s.id === 'thema');
    const handleiding = stappenVoor('h:thema')[0];
    expect([opAlgemeen.titel, opAlgemeen.tekst, opAlgemeen.doel, opAlgemeen.stukken]).toEqual([handleiding.titel, handleiding.tekst, handleiding.doel, handleiding.stukken]);
    expect(TEKSTEN.uitleg.stap.meer.thema).toBeUndefined();
  });

  it('elke handleiding heeft een eigen, volledige vraag boven "Toon het stap voor stap"', () => {
    for (const o of ONDERWERPEN) {
      const vraag = TEKSTEN.uitleg.aanbodVraag[o.id];
      expect(vraag, o.id).toMatch(/^Wil je .+\?$/);
      expect(vraag, o.id).not.toMatch(/\{|uitleg/i);
    }
    expect(Object.keys(TEKSTEN.uitleg.aanbodVraag).sort()).toEqual(ONDERWERPEN.map((o) => o.id).sort());
  });

  it('een stap die iets opent heeft een naam voor de actie, en alleen de handelingen openen iets', () => {
    for (const [sleutel, lijst] of Object.entries(STAPPEN)) {
      for (const s of lijst) {
        if (s.voor) {
          expect(sleutel.startsWith('h:'), sleutel + '.' + s.id).toBe(true);
          expect(s.voor, sleutel + '.' + s.id).toMatch(/^[a-z][A-Za-z]+$/);
        }
      }
    }
  });

  it('de acties die schermen moeten registreren zijn geteld', async () => {
    const { registreerUitleg, vindActie } = await import('../../src/uitleg/rondleiding.js');
    expect(vindActie('openMaaltijd')).toBeNull();
    const stop = registreerUitleg('vandaag', { openMaaltijd: () => () => {} });
    expect(typeof vindActie('openMaaltijd')).toBe('function');
    stop();
    expect(vindActie('openMaaltijd')).toBeNull();
    const namen = new Set(Object.values(STAPPEN).flat().filter((s) => s.voor).map((s) => s.voor));
    expect([...namen].sort()).toEqual(['openBewerkSupplement', 'openMaaltijd', 'openWeging', 'toonOngedaanMelding']);
  });
});

describe('welkomstkaartje en automatische start', () => {
  it('een nieuw toestel krijgt eerst het kaartje; pas na Ja start elk scherm vanzelf', async () => {
    const { welkomNodig, autoStartToegestaan, markeerWelkom } = await import('../../src/uitleg/rondleiding.js');
    const o = nepOpslag();
    expect(welkomNodig(o)).toBe(true);
    expect(autoStartToegestaan(o)).toBe(false); // nog niet gevraagd
    markeerWelkom(true, o);
    expect(welkomNodig(o)).toBe(false);
    expect(autoStartToegestaan(o)).toBe(true);
    expect(isAuto(o)).toBe(true);
  });

  it('bij Liever niet start nooit iets vanzelf en komt het kaartje niet terug', async () => {
    const { welkomNodig, autoStartToegestaan, markeerWelkom } = await import('../../src/uitleg/rondleiding.js');
    const o = nepOpslag();
    markeerWelkom(false, o);
    expect(welkomNodig(o)).toBe(false);
    expect(autoStartToegestaan(o)).toBe(false);
    expect(isAuto(o)).toBe(false);
  });
});

// ---- De uitleg noemt knoppen en onderdelen bij hun naam: hernoemt iemand er één, dan wordt deze test rood ----
describe('de namen in de uitleg bestaan echt in de app', () => {
  // [naam zoals de uitleg hem noemt, sleutel in teksten.js waar de app die naam gebruikt]
  const NAMEN = [
    ['Laatste weghalen', 'drinken.laatsteWeg'],
    ['Ongedaan maken', 'drinken.ongedaan'],
    ['Supplement toevoegen', 'supplementen.toevoegenNu'],
    ['Binnenkort', 'supplementen.later'],
    ['Vandaag ook te doen', 'supplementen.aanDeBeurt'],
    ['Mijn supplementen', 'supplementen.overzicht'],
    ['Weging noteren', 'gewicht.noteren'],
    ['Aanpassen', 'gewicht.aanpassen'],
    ['Je wegingen', 'gewicht.lijst'],
    ['Versturen', 'delen.versturen'],
    ['Bewaren', 'delen.pdfBewaren'],
    ['Afdrukken', 'delen.afdrukken'],
    ['Naar vandaag', 'dag.naarVandaag'],
    ['Notitie', 'dag.notitieTitel'], // de zichtbare titel van het vak (dag.notitie is alleen de naam voor een schermlezer)
    // Controle van 22 november: de namen die de nieuwe en herschreven stappen noemen.
    ['Noteren', 'gewicht.bewaar'],
    ['Zelfde als gisteren', 'maaltijd.zelfde'],
    ['Dag openen', 'maand.openen'],
    ['Dagdoel en groottes aanpassen', 'drinken.instellingen'],
    ['Alle favorieten', 'meer.alleFavorieten'],
    ['Favoriet toevoegen', 'meer.favorietToevoegen'],
    ['Alle badges bekijken', 'meer.alleBadgesTonen'],
    ['Licenties van gebruikte onderdelen', 'meer.licentiesLink'],
    ['Wat is er nieuw', 'watnieuw.knop'],
    ['Profiel verwijderen', 'wissen.knop'],
    ['Je gegevens', 'meldingen.gegevens'],
    ['Tijdstip toevoegen', 'meldingen.tijdstipToevoegen'],
    ['Toon het me', 'uitleg.toonHet'],
    ['Ik ken mijn code niet meer', 'slot.codeKwijt'],
    ['Wijzigen', 'slot.wijzigen'],
    ['Klaar', 'maaltijd.bewaren'], // BESLISSING 412
    ['Annuleren', 'maaltijd.annuleren'],
    ['Verwijderen', 'maaltijd.verwijderen'],
    ['Alles wissen en opnieuw beginnen', 'slot.kwijtWis'],
  ];
  const alleUitleg = JSON.stringify(TEKSTEN.uitleg);

  it('elke genoemde naam is de tekst van die knop of dat onderdeel in de app', async () => {
    const { t } = await import('../../src/teksten.js');
    for (const [naam, sleutel] of NAMEN) expect(t(sleutel), `${sleutel} heet niet meer "${naam}"`).toBe(naam);
  });

  it('elke naam in de lijst komt ook echt in een uitlegtekst voor (de lijst blijft eerlijk)', () => {
    for (const [naam] of NAMEN) expect(alleUitleg.includes(naam), `"${naam}" staat in geen enkele uitlegtekst`).toBe(true);
  });

  it('geen uitlegtekst noemt het tabblad nog "Meer" (het heet Algemeen)', () => {
    const teksten = [];
    (function loop(o) {
      for (const w of Object.values(o)) typeof w === 'string' ? teksten.push(w) : loop(w);
    })(TEKSTEN.uitleg);
    for (const x of teksten) expect(/\bMeer\b/.test(x), x).toBe(false);
  });
});

// BESLISSING 346: het kaartje heeft geen onzichtbare knop meer; in stap 1 loopt Volgende over de volle breedte; tikdoelen op het scherm Uitleg.
describe('kaartje van de uitleg: geen lege ruimte (BESLISSING 346)', () => {
  const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
  const css = lees('../../src/stijl/uitleg.css');
  const motor = lees('../../src/uitleg/rondleiding.js');

  it('Vorige verdwijnt in stap 1 (hidden) en houdt geen plaats meer vast', () => {
    expect(motor).not.toMatch(/is-weg/);
    expect(motor).toMatch(/vorigeKnop\.hidden = gang\.isEerste/);
    expect(css).not.toMatch(/visibility:\s*hidden/);
    // BESLISSINGEN 522 en 549: één rij met even brede kolommen (Volgende, Vorige, Overslaan); een verborgen knop neemt geen kolom in.
    expect(css).toMatch(/\.uitleg__acties \{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.uitleg__acties > \.knop\[hidden\] \{ display: none; \}/);
    expect(motor).toMatch(/h\('div', \{ class: 'uitleg__acties' \}, volgendeKnop, vorigeKnop, overslaanKnop\)/);
    expect(css).not.toMatch(/\.uitleg__over \{ position: absolute/);
  });

  it('het voorbeeld op het scherm Uitleg toont Volgende en Overslaan naast elkaar (BESLISSING 549), zonder lege ruimte', () => {
    const scherm = lees('../../src/uitleg/scherm.js');
    expect(scherm).toMatch(/uitleg__nepknop--primair' \}, t\('uitleg\.volgende'\)\), h\('span', \{ class: 'uitleg__nepknop uitleg__nepknop--tekst' \}, t\('uitleg\.overslaan'\)\)/);
    expect(css).not.toMatch(/nepknop--primair \{ grid-column/);
  });

  it('elke knop in een rij van het scherm Uitleg heeft een tikvlak van 44 px of meer (inset -5px -1px, de rand van 1 px meegerekend)', () => {
    expect(css).toMatch(/\.uitleg-scherm \.rij \.knop::after \{[^}]*inset: -5px -1px;/);
  });
});
