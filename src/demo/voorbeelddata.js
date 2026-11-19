// Voorbeeldgegevens voor de demoversie (BESLISSING 364). Dit bestand wordt alleen in de demo geladen (dynamische import in main.js)
// en zit dus niet in de bundel van de echte app. Vier weken verzonnen gegevens, relatief aan vandaag en zonder toeval:
// twee bezoekers zien hetzelfde. Het zijn gewone eigen gegevens (voorbeeld: false): zo rekent de app er zelf reeks en badges uit.
import { db, verhoogEpoch } from '../data/db.js';
import { leesBadgeStats } from '../data/badges.js';
import { wisEigenSleutels } from '../kern/demo.js';
import { verdiendAlle } from '../logica/badgeregels.js';
import { zend } from '../kern/bus.js';
import { naarDatum, plusDagen, vandaag as vandaagSleutel, weekStart, weekdag } from '../kern/datum.js';

export const DEMO_NAAM = 'Sofie';
// Alle namen van personen die in de voorbeeldgegevens voorkomen (een test houdt dit bij).
export const GEBRUIKTE_NAMEN = [DEMO_NAAM];

export const AANTAL_DAGEN = 28;
export const DOEL_ML = 2500;
const WEEGDAG = 1; // maandag
const STREEF_KG = 68;
const WEGINGEN_KG = [71.4, 71.0, 70.9, 70.5]; // oudste eerst

const SOORTEN = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
const STANDAARD_UUR = { ontbijt: [8, 0], tussendoortje: [10, 0], middagmaal: [12, 30], vieruurtje: [16, 0], avondmaal: [18, 30], latesnack: [21, 0] };
const ML = { water: 800, thee: 200, koffie: 150, sap: 200, frisdrank: 330, anders: 250 };

// Korte gewone namen: ze passen ook op 360 px zonder af te kappen.
const MENU = {
  ontbijt: ['Boterham met kaas', 'Havermout met banaan', 'Yoghurt met muesli', 'Pistolet met hesp', 'Boterham met confituur', 'Roerei op toast'],
  tussendoortje: ['Appel', 'Handvol noten', 'Peer', 'Stukje kaas', 'Banaan', 'Mandarijn'],
  middagmaal: ['Soep met brood', 'Pasta met tomatensaus', 'Salade met kip', 'Broodje tonijnsla', 'Stoofvlees met puree', 'Quiche met sla'],
  vieruurtje: ['Koekje', 'Fruit', 'Yoghurt', 'Koffiekoek', 'Boterham met choco'],
  avondmaal: ['Witloof met hesp', 'Visfilet met groenten', 'Spaghetti bolognese', 'Wraps met groenten', 'Ovenschotel met kip', 'Pannenkoeken'],
  latesnack: ['Stukje chocolade', 'Yoghurt', 'Handvol noten', 'Cracker met kaas'],
};

// Hoeveel van de zes maaltijden er per dag ingevuld zijn (oudste dag eerst, de laatste is vandaag: half).
const AANTAL_MAALTIJDEN = [5, 4, 5, 6, 4, 5, 3, 4, 5, 6, 2, 5, 4, 5, 6, 4, 5, 3, 5, 4, 6, 5, 4, 5, 4, 6, 5, 3];
// Welke van de drie vaste maaltijden (ontbijt, middagmaal, avondmaal) altijd meekomen; de andere drie wisselen per dag.
const VASTE = ['ontbijt', 'middagmaal', 'avondmaal'];
const WISSEL = ['tussendoortje', 'vieruurtje', 'latesnack'];

// Streefhoeveelheid drinken per dag (ml). Onder 2500 blijft de dag onder het doel, erboven gaat hij erover.
const DRINK_DOEL = [2600, 2400, 2900, 2100, 2450, 2550, 1900, 2500, 3000, 2650, 2200, 2500, 2450, 2600, 2550, 2900, 2700, 2550, 2600, 2800, 2500, 2650, 2550, 2550, 2300, 2900, 2600];
const ANDERE = ['thee', 'koffie', 'sap', 'koffie', 'thee', 'frisdrank', 'anders', 'thee', 'koffie', 'sap'];

// Stemming en energie (1 tot 5); null = niet ingevuld.
const STEMMING = [4, 3, 4, null, 5, 4, 2, 4, 5, 4, null, 3, 4, 4, 5, 4, 3, null, 4, 5, 4, 3, 4, null, 4, 5, 4, 4];
const ENERGIE = [3, 3, 4, null, 4, 4, 2, 3, 4, 4, null, 3, 4, 3, 4, 4, 3, null, 3, 4, 4, 3, 3, null, 4, 5, 4, 3];
const NOTITIES = {
  2: 'Lekker gewandeld na het middageten.',
  6: 'Wat moe vandaag, vroeg naar bed.',
  9: 'Gezellig gegeten met vrienden.',
  14: 'Rustige dag, veel gelezen.',
  19: 'Druk op het werk, maar het ging goed.',
  24: 'Fietstocht in de zon.',
};

// De momenten die op een dag niet afgevinkt zijn (dag-index → moment).
// Dertien dagen met één gemist moment: Sofie is niet elke dag even trouw, dus "Veertien dagen vol" is nog niet gehaald.
const GEMIST = { 1: 'middag', 3: 'ochtend', 5: 'avond', 7: 'avond', 9: 'middag', 11: 'middag', 13: 'ochtend', 14: 'avond', 19: 'middag', 20: 'ochtend', 21: 'ochtend', 22: 'avond', 25: 'middag' };
// De drie dagen (dag-index) waarop Sofie niets noteerde, een lang weekend weg. Drie op een rij onderbreken de reeks altijd (de app vergeeft er één per kalenderweek), op welke weekdag ook, en het zijn er minder dan vijf: geen "Weer thuis".
const LEGE_DAGEN = [15, 16, 17];
// De weging die ze oversloeg (volgnummer van de weegdag, 0 = de oudste): zo blijft "Vier wegingen" nog bijna.
const OVERGESLAGEN_WEGING = 1;

const FAVORIETEN = ['Havermout met banaan', 'Yoghurt met muesli', 'Soep met brood', 'Boterham met kaas'];

// ------------------------------------------------------------ hulp

function maakZaadje(zaad) {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const twee = (n) => String(n).padStart(2, '0');
const naarTijd = ([u, m]) => `${twee(u)}:${twee(m)}`;

// Tijdstip (ms) op een dag; op vandaag nooit later dan nu, en de volgorde blijft behouden.
function tijdstipVan(datum, uur, minuut, nu, vandaag, plekVanEinde = 0) {
  const d = naarDatum(datum);
  d.setHours(uur, minuut, 0, 0);
  if (datum !== vandaag) return d.getTime();
  const begin = naarDatum(datum).getTime();
  return Math.max(begin + 60000, Math.min(d.getTime(), nu.getTime() - plekVanEinde * 60000));
}

// ------------------------------------------------------------ opbouw

// Bouwt alle rijen, zonder iets te schrijven. nu: het moment van laden (alleen vandaag hangt ervan af).
export function bouwDemo(nu = new Date()) {
  const vandaag = vandaagSleutel(nu);
  const zaadje = maakZaadje(20261115);
  const dagen = [];
  const maaltijden = [];
  const dranken = [];
  const innames = [];

  const supplementen = [
    { id: 1, naam: 'Multivitamine', dosis: '1 tablet per dag', hoeveelheid: '1 tablet', aanwijzing: 'bij het ontbijt', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: nu.getTime() },
    { id: 2, naam: 'Vitamine C', dosis: '1 tablet per dag', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['middag'], ritme: { soort: 'dagelijks' }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: nu.getTime() },
    { id: 3, naam: 'Kurkuma', dosis: '1 capsule per dag', hoeveelheid: '1 capsule', aanwijzing: 'bij het avondeten', momenten: ['avond'], ritme: { soort: 'dagelijks' }, volgorde: 3, actief: true, voorbeeld: false, aangemaaktOp: nu.getTime() },
    // Een spuit herken je aan de naam (BESLISSING 275). Beurten: 23 en 9 dagen geleden, de volgende over 5 dagen.
    { id: 4, naam: 'Voorbeeldspuit', dosis: 'Om de 14 dagen', hoeveelheid: '1 ampul', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: plusDagen(vandaag, -23) }, volgorde: 4, actief: true, voorbeeld: false, aangemaaktOp: nu.getTime() },
  ];
  const UUR_MOMENT = { ochtend: [8, 10], middag: [12, 40], avond: [19, 15] };

  for (let i = 0; i < AANTAL_DAGEN; i++) {
    const datum = plusDagen(vandaag, i - (AANTAL_DAGEN - 1));
    const isVandaag = datum === vandaag;

    if (LEGE_DAGEN.includes(i)) {
      dagen.push({ datum, notitie: '', stemming: null, energie: null, doelGehaald: false, voorbeeld: false, gewijzigdOp: tijdstipVan(datum, 21, 0, nu, vandaag, 0) });
      continue;
    }

    // ---- maaltijden: de drie vaste, plus de wisselende tot het aantal van die dag
    const aantal = AANTAL_MAALTIJDEN[i];
    const kies = [];
    const vast = i === 10 ? ['ontbijt', 'avondmaal'] : isVandaag ? ['ontbijt', 'tussendoortje', 'middagmaal'] : VASTE.slice();
    for (const soort of vast) kies.push(soort);
    if (!isVandaag) {
      for (let w = 0; kies.length < aantal && w < 3; w++) kies.push(WISSEL[(i + w) % 3]);
    }
    kies.sort((a, b) => SOORTEN.indexOf(a) - SOORTEN.indexOf(b));
    kies.forEach((soort, nr) => {
      const pool = MENU[soort];
      const [u, m] = STANDAARD_UUR[soort];
      const verschuiving = ((i * 7 + nr * 3) % 4) * 5;
      const tijdstip = tijdstipVan(datum, u, m + verschuiving, nu, vandaag, 0);
      const d = new Date(tijdstip);
      maaltijden.push({
        datum,
        soort,
        tijd: isVandaag ? `${twee(d.getHours())}:${twee(d.getMinutes())}` : naarTijd([u, m + verschuiving]),
        tekst: pool[(i * 3 + SOORTEN.indexOf(soort)) % pool.length],
        fotoId: null,
        gevoel: ((i + nr) % 4) + 2,
        voorbeeld: false,
        gewijzigdOp: tijdstip,
      });
    });

    // ---- drinken
    let lijst;
    if (isVandaag) {
      lijst = ['water', 'thee', 'sap', 'anders']; // 1450 ml: de kan is bijna voor de helft vol
    } else {
      const doel = DRINK_DOEL[i];
      const kannen = doel >= 2800 ? 3 : 2;
      lijst = Array(kannen).fill('water');
      let totaal = kannen * ML.water;
      let k = i % ANDERE.length;
      for (let poging = 0; poging < 30; poging++) {
        const soort = ANDERE[k % ANDERE.length];
        k += 1;
        if (doel >= DOEL_ML ? totaal >= doel : totaal >= doel || totaal + ML[soort] >= DOEL_ML) break;
        lijst.push(soort);
        totaal += ML[soort];
      }
      // wisselende volgorde over de dag, vast door het zaadje (Fisher-Yates)
      for (let a = lijst.length - 1; a > 0; a--) {
        const b = Math.floor(zaadje() * (a + 1));
        [lijst[a], lijst[b]] = [lijst[b], lijst[a]];
      }
    }
    let totaalMl = 0;
    lijst.forEach((soort, nr) => {
      const uur = 7.5 + (nr * 13.5) / Math.max(lijst.length, 1);
      const u = Math.floor(uur);
      const m = Math.round((uur - u) * 12) * 5;
      totaalMl += ML[soort];
      dranken.push({ datum, tijdstip: tijdstipVan(datum, u, m, nu, vandaag, lijst.length - nr), soort, ml: ML[soort], voorbeeld: false });
    });

    // ---- supplementen: elk moment afgevinkt, behalve enkele gemiste; vandaag alleen de ochtend
    const dagelijks = supplementen.slice(0, 3);
    for (const sup of dagelijks) {
      const moment = sup.momenten[0];
      if (GEMIST[i] === moment) continue;
      if (isVandaag && moment !== 'ochtend') continue;
      const [u, m] = UUR_MOMENT[moment];
      innames.push({ datum, supplementId: sup.id, moment, tijdstip: tijdstipVan(datum, u, m, nu, vandaag, 0), voorbeeld: false });
    }
    if (i === 4 || i === 18) innames.push({ datum, supplementId: 4, moment: 'dag', tijdstip: tijdstipVan(datum, 9, 0, nu, vandaag, 0), voorbeeld: false });

    dagen.push({
      datum,
      notitie: NOTITIES[i] ?? '',
      stemming: STEMMING[i],
      energie: ENERGIE[i],
      doelGehaald: totaalMl >= DOEL_ML,
      voorbeeld: false,
      gewijzigdOp: tijdstipVan(datum, 21, 0, nu, vandaag, 0),
    });
  }

  // ---- gewicht: één weging per week op de weegdag (maandag); van de vier weegdagen van deze vier weken slaat ze er één over
  const beginDatum = plusDagen(vandaag, -(AANTAL_DAGEN - 1));
  const wegingen = [];
  let weegdagNr = 0;
  for (let n = 0; n < AANTAL_DAGEN && weegdagNr < WEGINGEN_KG.length; n++) {
    const datum = plusDagen(beginDatum, n);
    if (weekdag(datum) !== WEEGDAG) continue;
    // Valt de weegdag in het lange weekend, dan weegt ze zich de dag erna: op een lege dag staat nooit iets, wat de weekdag van vandaag ook is.
    const wegDatum = LEGE_DAGEN.includes(n) ? plusDagen(beginDatum, Math.max(...LEGE_DAGEN) + 1) : datum;
    if (weegdagNr !== OVERGESLAGEN_WEGING) wegingen.push({ week: weekStart(wegDatum), datum: wegDatum, kg: WEGINGEN_KG[weegdagNr], voorbeeld: false, gewijzigdOp: tijdstipVan(wegDatum, 7, 30, nu, vandaag, 0) });
    weegdagNr += 1;
  }

  const favorieten = FAVORIETEN.map((tekst, nr) => ({ id: nr + 1, tekst, sleutel: tekst.toLowerCase(), laatstGebruikt: nu.getTime() - (nr + 1) * 3600000 }));

  const instellingen = [
    ['start.klaar', true],
    ['profiel.naam', DEMO_NAAM],
    ['thema.keuze', 'poeder'],
    ['drinken.dagdoelMl', DOEL_ML],
    ['drinken.dagdoelOmgezet', true],
    ['drinken.kanOmgezet', true],
    ['gewicht.weegdag', WEEGDAG],
    ['gewicht.streefKg', STREEF_KG],
  ].map(([sleutel, waarde]) => ({ sleutel, waarde }));

  return { dagen, maaltijden, dranken, wegingen, favorieten, supplementen, innames, instellingen };
}

// ------------------------------------------------------------ schrijven en wissen

// Onthoudt op welke dag de demo gevuld is en hoe de gegevens er toen uitzagen, zodat een latere start kan zien of de bezoeker iets wijzigde.
const SLEUTEL_VULLING = 'demo.vulling';
const GEGEVENSTABELLEN = ['dagen', 'maaltijden', 'dranken', 'wegingen', 'favorieten', 'supplementen', 'momentinnames'];
async function vingerafdruk() {
  const delen = [];
  for (const naam of GEGEVENSTABELLEN) {
    const rijen = (await db.table(naam).toArray()).map((rij) => {
      const { id, ...rest } = rij; // het volgnummer telt niet mee: de inhoud wel
      return JSON.stringify(Object.entries(rest).sort(([a], [b]) => (a < b ? -1 : 1)));
    });
    delen.push(naam + ':' + rijen.sort().join('|'));
  }
  return delen.join('\n');
}

// Schrijft de voorbeeldgegevens in de (lege) demodatabase. Badges worden niet geschreven: de app rekent ze zelf uit de gegevens
// (data/badges.js) zodra ze starten, en kent ze stil toe omdat dit de eerste start is.
export async function vulDemo(nu = new Date()) {
  const r = bouwDemo(nu);
  verhoogEpoch();
  try {
    await db.transaction('rw', db.tables, async () => {
      await db.dagen.bulkPut(r.dagen);
      await db.maaltijden.bulkPut(r.maaltijden);
      await db.dranken.bulkAdd(r.dranken);
      await db.wegingen.bulkPut(r.wegingen);
      await db.favorieten.bulkPut(r.favorieten);
      await db.supplementen.bulkPut(r.supplementen);
      await db.momentinnames.bulkPut(r.innames);
      await db.instellingen.bulkPut(r.instellingen);
    });
  } finally {
    verhoogEpoch();
  }
  await kenBadgesToe(nu);
  await db.instellingen.put({ sleutel: SLEUTEL_VULLING, waarde: { datum: vandaagSleutel(nu), vingerafdruk: await vingerafdruk() } });
  zend('data:gewijzigd', { store: '*' });
}

// De badges die uit deze gegevens volgen, volgens dezelfde logica als de app (verdiendAlle op leesBadgeStats), als al gezien bewaard:
// zo staat er bij de start geen viering of melding "nieuwe badges", wel een gevuld badgescherm. De data zelf bepaalt welke het zijn.
async function kenBadgesToe(nu) {
  const ids = verdiendAlle(await leesBadgeStats());
  const rijen = ids.map((id, nr) => ({ id, behaaldOp: nu.getTime() - (ids.length - nr) * 3600000 * 20, gezien: true }));
  await db.transaction('rw', db.badges, db.instellingen, async () => {
    await db.badges.bulkPut(rijen);
    await db.instellingen.put({ sleutel: 'badges.uitgebreid', waarde: true });
  });
}

// Eerste bezoek: is de demodatabase helemaal leeg, dan wordt ze gevuld. Geeft terug of er gevuld is.
// Latere bezoeken (BESLISSING 401, review R6-04): is de demo op een andere dag gevuld dan vandaag en wijzigde de bezoeker niets,
// dan staan de 28 dagen een of meer dagen achter. Dan wordt stil opnieuw gevuld voor vandaag (alleen de database, zonder vraag).
// Wijzigde de bezoeker wel iets, dan blijft alles staan: daarvoor is "Opnieuw beginnen".
export async function vulDemoAlsLeeg(nu = new Date()) {
  let leeg = true;
  for (const tabel of db.tables) if ((await tabel.count()) > 0) leeg = false;
  if (leeg) {
    await vulDemo(nu);
    return true;
  }
  const vulling = (await db.instellingen.get(SLEUTEL_VULLING))?.waarde;
  if (!vulling || vulling.datum === vandaagSleutel(nu)) return false;
  if ((await vingerafdruk()) !== vulling.vingerafdruk) return false;
  verhoogEpoch();
  try {
    await db.transaction('rw', db.tables, async () => {
      for (const tabel of db.tables) await tabel.clear();
    });
  } finally {
    verhoogEpoch();
  }
  await vulDemo(nu);
  return true;
}

// "Opnieuw beginnen": wist alle tabellen van de demodatabase (db is de database met DB_NAAM; er bestaat geen andere) en vult opnieuw.
// Wat de app buiten de database onthoudt (themaspiegel en uitlegstand) gaat mee terug naar het begin.
// behoud: sleutels in localStorage die blijven staan (een nieuw bezoek houdt de uitlegstand, demo/bezoek.js).
export async function begin(nu = new Date(), { behoud = [] } = {}) {
  verhoogEpoch();
  try {
    await db.transaction('rw', db.tables, async () => {
      for (const tabel of db.tables) await tabel.clear();
    });
  } finally {
    verhoogEpoch();
  }
  // Alleen de sleutels van de demo zelf (voorvoegsel 'bloei-demo-'): de sleutels van de echte app blijven staan,
  // ook als beide versies ooit op hetzelfde adres draaien.
  try {
    const bewaard = behoud.map((sleutel) => [sleutel, localStorage.getItem(sleutel)]);
    wisEigenSleutels(localStorage);
    for (const [sleutel, waarde] of bewaard) if (waarde !== null) localStorage.setItem(sleutel, waarde);
  } catch {
    /* opslag niet beschikbaar */
  }
  await vulDemo(nu);
}
