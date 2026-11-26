// Het weerbericht op Vandaag: de regels zonder netwerk en zonder locatie (dat doet data/weer.js). Pure functies.
// Eén externe dienst: Open-Meteo (open-meteo.com, CC BY 4.0), gratis voor niet-commercieel gebruik, zonder account en zonder cookies.
// Voor België rekent die dienst met het fijnmazige model van het KNMI (vakjes van ongeveer 2 km). Bloei stuurt alleen de plaats, precies
// zoals het toestel ze geeft (er wordt niets afgerond), en krijgt het weer van het vakje waar die plaats in valt.
// Er is geen naam van een gemeente meer (0.4.8 tot 0.5.6 toonden er een, die ernaast kon zitten): het weer heeft die naam niet nodig, en
// zonder naam valt de tweede dienst weg.

export const WEER_ORIGIN = 'https://api.open-meteo.com';

// Een breedte of lengte zoals ze in een vraag staat: het getal van het toestel, onveranderd. Alleen de schrijfwijze ligt vast (nooit
// met een exponent, wat een heel klein getal anders krijgt).
export const graad = (graden) => {
  const tekst = String(graden);
  return /e/i.test(tekst) ? graden.toFixed(15) : tekst;
};

const geldigePlek = (breedte, lengte) =>
  typeof breedte === 'number' && typeof lengte === 'number' && Number.isFinite(breedte) && Number.isFinite(lengte) && Math.abs(breedte) <= 90 && Math.abs(lengte) <= 180;

// ---- Hoe fijn de meting van het toestel is ----
// Een toestel zegt bij elke meting zelf hoe fijn ze is (de straal in meter). Het weer verschilt nauwelijks over een paar kilometer, dus
// een meting hoeft niet op de meter te kloppen. Wel geldt:
//   tot FIJN_M     dit is de plek: meteen gebruiken, er hoeft geen betere meer te komen;
//   tot GRENS_M    bruikbaar: Bloei luistert nog even naar een fijnere en neemt dan de beste; die plek wordt (afgerond) onthouden;
//   grover         een plek op tientallen kilometers: goed genoeg voor het weer van de streek, maar ze wordt niet onthouden.
export const FIJN_M = 1000;
export const GRENS_M = 20000;

// De straal van een meting in meter, of Infinity als het toestel er geen opgeeft.
export const straalVan = (meting) => (Number.isFinite(meting?.coords?.accuracy) && meting.coords.accuracy >= 0 ? meting.coords.accuracy : Infinity);
const heeftPlek = (meting) => geldigePlek(meting?.coords?.latitude, meting?.coords?.longitude);
export const isFijn = (meting) => heeftPlek(meting) && straalVan(meting) <= FIJN_M;
// Geeft het toestel geen straal op, dan weten we niet hoe fijn de meting is: ze is bruikbaar, maar nooit "fijn".
export const isBruikbaar = (meting) => heeftPlek(meting) && (straalVan(meting) <= GRENS_M || straalVan(meting) === Infinity);
// De beste van twee metingen: de fijnste; bij gelijk de nieuwste.
export const besteMeting = (beste, nieuw) => (!beste || straalVan(nieuw) <= straalVan(beste) ? nieuw : beste);

// ---- Zonder plek van het toestel ----
// Het weerbericht staat er altijd, ook als het toestel geen plek geeft (de locatie staat uit, een computer zonder locatiedienst). Dan
// rekent Bloei met de laatste plek die dit toestel gaf (data/weer.js bewaart ze afgerond, alleen op het toestel) en anders met de
// hoofdstad van de tijdzone van het toestel. De tijdzone kent het toestel zelf: daar gaat niets voor naar buiten.
const TIJDZONEPLEK = {
  'Europe/Brussels': [50.85, 4.35],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Luxembourg': [49.61, 6.13],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/London': [51.51, -0.13],
};
export const STANDAARDPLEK = TIJDZONEPLEK['Europe/Brussels'];
// plekVanTijdzone('Europe/Amsterdam') → [breedte, lengte]; een tijdzone die Bloei niet kent, of geen: Brussel.
export const plekVanTijdzone = (tijdzone) => TIJDZONEPLEK[tijdzone] ?? STANDAARDPLEK;
// Een plek zoals ze op het toestel bewaard wordt: afgerond op twee cijfers na de komma (ongeveer een kilometer), of null.
export const rondePlek = (breedte, lengte) => (geldigePlek(breedte, lengte) ? [Math.round(breedte * 100) / 100, Math.round(lengte * 100) / 100] : null);

// ---- Het weer ----
export const WEEKDAGEN = 7; // zoveel dagen toont de kaart
export const BEWAARDAGEN = 14; // zoveel dagen vraagt Bloei: zo staat er een week vooruit, ook met een weerbericht van een week oud
export const BEWAARUREN = 168; // de uren vanaf nu, per uur: daarmee kent Bloei het weer van "nu" ook als de dienst een tijd niet antwoordt

// Het adres van de vraag: alleen de plaats en wat Bloei wil weten.
//   van nu       temperatuur, gevoelstemperatuur, luchtvochtigheid, weercode, wind (snelheid en richting), dag of nacht;
//   per uur      hetzelfde, voor de komende 168 uur;
//   per dag      veertien dagen vanaf vandaag: het weerbeeld, de laagste en de hoogste temperatuur, de kans op neerslag en hoeveel er
//                verwacht wordt, zonsopgang en zonsondergang en de uv-index (daarvoor wil de dienst een tijdzone: 'auto' is die van de plaats).
const NU = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day';
export function weerAdres(breedte, lengte) {
  if (!geldigePlek(breedte, lengte)) return null;
  const dag = 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,snowfall_sum,sunrise,sunset,uv_index_max';
  return `${WEER_ORIGIN}/v1/forecast?latitude=${graad(breedte)}&longitude=${graad(lengte)}&current=${NU}&hourly=${NU}&forecast_hours=${BEWAARUREN}&daily=${dag}&forecast_days=${BEWAARDAGEN}&timezone=auto`;
}

const getal = (w, laag, hoog) => (typeof w === 'number' && Number.isFinite(w) && w >= laag && w <= hoog ? w : null);
const heel = (w, laag, hoog) => (getal(w, laag, hoog) == null ? null : Math.round(w));
// Een hoeveelheid met één cijfer na de komma (0,4 mm blijft 0,4), of null.
const tiende = (w, hoog) => (getal(w, 0, hoog) == null ? null : Math.round(w * 10) / 10);
// Het uur uit een tijdstip van de dienst ('2026-11-25T08:14' → '08:14'), of null.
const uur = (tekst) => (typeof tekst === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(tekst) ? tekst.slice(11, 16) : null);
const weercode = (w) => (Number.isInteger(w) && w >= 0 && w <= 99 ? w : null);
// Het weer van één ogenblik (nu, of één uur): { code, temp, gevoel, vocht, wind, richting, dag }, of null zonder temperatuur of weercode.
const ogenblik = (bron, i) => {
  const op = (veld) => (i == null ? bron?.[veld] : Array.isArray(bron?.[veld]) ? bron[veld][i] : undefined);
  const code = weercode(Number(op('weather_code')));
  const temp = getal(Number(op('temperature_2m')), -90, 60);
  if (code == null || temp == null || op('temperature_2m') == null) return null;
  return { code, temp: Math.round(temp), gevoel: heel(op('apparent_temperature'), -90, 60), vocht: heel(op('relative_humidity_2m'), 0, 100), wind: heel(op('wind_speed_10m'), 0, 400), richting: getal(op('wind_direction_10m'), 0, 360), dag: op('is_day') !== 0 };
};

// Het antwoord van de dienst → het weer zoals de kaart het toont, of null als het niet is wat Bloei verwacht (dan komt er geen weer).
//   nu:       code, temp, gevoel, vocht (luchtvochtigheid in procent), wind (km per uur), richting (graden, waar de wind vandaan komt), dag (true overdag)
//   vandaag:  min, max, kans (procent), mm (verwachte neerslag), sneeuw (cm), zonOp, zonOnder ('UU:MM'), uv
//   dagen:    tot veertien dagen vanaf vandaag: [{ datum: 'JJJJ-MM-DD', code, min, max, kans, mm, sneeuw, zonOp, zonOnder, uv }]
//   uren:     tot 168 uur vanaf nu: [{ uur: 'JJJJ-MM-DDTUU:00', code, temp, gevoel, vocht, wind, richting, dag }]
// Ontbreekt een waarde, dan is ze null en toont de kaart een streepje.
export function leesAntwoord(json) {
  const nu = ogenblik(json?.current && typeof json.current === 'object' ? json.current : null, null);
  if (!nu) return null;
  const d = json.daily && typeof json.daily === 'object' ? json.daily : {};
  const op = (lijst, i) => (Array.isArray(lijst) ? lijst[i] : undefined);
  const dagVan = (i) => {
    let min = heel(op(d.temperature_2m_min, i), -90, 60);
    let max = heel(op(d.temperature_2m_max, i), -90, 60);
    if (min != null && max != null && min > max) [min, max] = [null, null];
    return {
      code: weercode(op(d.weather_code, i)),
      min,
      max,
      kans: heel(op(d.precipitation_probability_max, i), 0, 100),
      mm: tiende(op(d.precipitation_sum, i), 500),
      sneeuw: tiende(op(d.snowfall_sum, i), 300),
      zonOp: uur(op(d.sunrise, i)),
      zonOnder: uur(op(d.sunset, i)),
      uv: heel(op(d.uv_index_max, i), 0, 20),
    };
  };
  const datums = Array.isArray(d.time) ? d.time.filter((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, BEWAARDAGEN) : [];
  const u = json.hourly && typeof json.hourly === 'object' ? json.hourly : {};
  const uren = (Array.isArray(u.time) ? u.time : [])
    .slice(0, BEWAARUREN)
    .map((t, i) => (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(t) ? { uur: t, ...ogenblik(u, i) } : null))
    .filter((x) => x && x.code != null);
  const { code: _code, ...vandaag } = dagVan(0);
  return { ...nu, ...vandaag, dagen: datums.map((datum, i) => ({ datum, ...dagVan(i) })), uren };
}

// Het bewaarde weerbericht, voor nu: wat de dienst eerder voorspelde voor dit uur en voor vandaag en de zes dagen erna.
//   weer   wat leesAntwoord gaf (met dagen en uren), bewaard op het toestel
//   nu     het ogenblik van nu, in de tijd van het toestel
// Geeft het weer zoals de kaart het toont, of null als het bewaarde weerbericht daarvoor te oud is (dit uur staat er niet meer in, of er
// is geen volle week vooruit meer). Zo staat het weer er ook als de dienst een tijd niet antwoordt: het is dan de voorspelling van toen.
export function weerVoorNu(weer, nu = new Date()) {
  if (!weer || !Array.isArray(weer.dagen) || !Array.isArray(weer.uren)) return null;
  const p = (n) => String(n).padStart(2, '0');
  const vandaag = `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}`;
  const i = weer.dagen.findIndex((d) => d?.datum === vandaag);
  const ditUur = weer.uren.find((x) => x?.uur === `${vandaag}T${p(nu.getHours())}:00`);
  if (i < 0 || !ditUur || weer.dagen.length - i < WEEKDAGEN) return null;
  const dagen = weer.dagen.slice(i, i + WEEKDAGEN);
  const { datum: _datum, code: _code, ...vanVandaag } = dagen[0];
  const { uur: _uur, ...vanNu } = ditUur;
  return { ...vanNu, ...vanVandaag, dagen };
}

// De windkracht op de schaal van Beaufort (0 tot 12) bij een windsnelheid in km per uur, of null.
const BEAUFORT = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117];
export function windkracht(kmu) {
  if (!Number.isFinite(kmu) || kmu < 0) return null;
  const kracht = BEAUFORT.findIndex((grens) => kmu <= grens);
  return kracht === -1 ? 12 : kracht;
}

// De windrichting in letters (waar de wind vandaan komt), of null: N, NO, O, ZO, Z, ZW, W, NW.
const STREKEN = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
export function windrichting(graden) {
  if (!Number.isFinite(graden) || graden < 0 || graden > 360) return null;
  return STREKEN[Math.round(graden / 45) % 8];
}

// De uv-index in een woord (TEKSTEN.weer.uv<Woord>), of null: laag tot 2, matig tot 5, hoog tot 7, zeer hoog tot 10, daarboven extreem.
export function uvWoord(uv) {
  if (!Number.isFinite(uv) || uv < 0) return null;
  return uv <= 2 ? 'uvLaag' : uv <= 5 ? 'uvMatig' : uv <= 7 ? 'uvHoog' : uv <= 10 ? 'uvZeerHoog' : 'uvExtreem';
}

// Het weerbeeld: het icoon (src/iconen/solid) en de naam (TEKSTEN.weer) bij een weercode van de WMO, zoals Open-Meteo ze geeft.
// Open-Meteo is de maatstaf: waar de dienst zwaar meldt (65, 75, 82, 86, 97, 99), zegt de naam dat ook. Lichte en matige vormen
// van hetzelfde weer delen soms een korte naam (motregen, ijzel, mist).
// 's Nachts een maan in plaats van een zon (alleen voor het weer van nu; een dag in de week is altijd overdag).
const BEELD = {
  0: ['sun', 'zonnig'], 1: ['sun', 'vrijZonnig'], 2: ['cloud-sun', 'halfBewolkt'], 3: ['cloud', 'bewolkt'],
  45: ['smog', 'mist'], 48: ['smog', 'mist'],
  51: ['cloud-rain', 'motregen'], 53: ['cloud-rain', 'motregen'], 55: ['cloud-rain', 'motregen'],
  56: ['cloud-rain', 'ijzel'], 57: ['cloud-rain', 'ijzel'], 66: ['cloud-rain', 'ijzel'], 67: ['cloud-rain', 'ijzel'],
  61: ['cloud-rain', 'lichteRegen'], 63: ['cloud-rain', 'regen'], 65: ['cloud-showers-heavy', 'zwareRegen'],
  71: ['snowflake', 'lichteSneeuw'], 73: ['snowflake', 'sneeuw'], 75: ['snowflake', 'zwareSneeuw'], 77: ['snowflake', 'sneeuw'],
  80: ['cloud-rain', 'lichteBuien'], 81: ['cloud-showers-heavy', 'buien'], 82: ['cloud-showers-heavy', 'zwareBuien'],
  85: ['snowflake', 'sneeuwbuien'], 86: ['snowflake', 'zwareSneeuwbuien'],
  // Onweer: 95 onweer, 97 zwaar onweer. 96 en 99 (onweer met lichte of zware hagel) geven alleen de modellen die hagel voorspellen;
  // alle andere melden 95 en 97 (open-meteo.com/en/docs, de tabel met weercodes).
  95: ['cloud-bolt', 'onweer'], 96: ['cloud-bolt', 'onweerHagel'], 97: ['cloud-bolt', 'zwaarOnweer'], 99: ['cloud-bolt', 'onweerZwareHagel'],
};
const NACHT = { sun: 'moon', 'cloud-sun': 'cloud-moon' };
const NACHTNAAM = { zonnig: 'helder', vrijZonnig: 'vrijHelder' };
export const WEERNAMEN = [...new Set([...Object.values(BEELD).map((b) => b[1]), ...Object.values(NACHTNAAM)])];
export const WEERICONEN = [...new Set([...Object.values(BEELD).map((b) => b[0]), ...Object.values(NACHT)])];

// weerBeeld({ code, dag? }) → { icoon, naam }, of null zonder weercode. Een code die Bloei niet kent, is gewoon bewolkt.
export function weerBeeld(weer) {
  if (!weer || !Number.isFinite(weer.code)) return null;
  const [icoon, naam] = BEELD[weer.code] ?? ['cloud', 'bewolkt'];
  const nacht = weer.dag === false;
  return { icoon: nacht ? (NACHT[icoon] ?? icoon) : icoon, naam: nacht ? (NACHTNAAM[naam] ?? naam) : naam };
}

// De groep zinnen van de motivator die bij het weer van nu hoort (TEKSTEN.motivatie, logica/motivatie.js), of null als er niets over te
// zeggen valt (een zachte nacht zonder regen). Open-Meteo is de maatstaf: het weer zelf leest de zin alleen uit de weercode, zonder eigen
// grenzen op wind, regen of sneeuw. Eerst het zware weer zoals de dienst het meldt, waarbij de zin ook raad geeft (WEER_EXTREEM): zwaar
// onweer, zware sneeuw, ijzel, zware regen, en een hittegolf. Daarna het gewone weer, het opvallendste eerst: onweer en sneeuw, hitte en
// vorst, regen en mist, en pas daarna een warme dag, zon, kou of een grijze lucht. Voor warm en koud bestaat geen weercode: daar telt
// de temperatuur van de dienst.
const ONWEER = [95, 96, 97, 99];
const ZWAAR_ONWEER = [97, 99]; // wat Open-Meteo zelf zwaar noemt: zwaar onweer (97) en onweer met zware hagel (99)
const SNEEUW = [71, 73, 75, 77, 85, 86];
const ZWARE_SNEEUW = [75, 86]; // zware sneeuw en zware sneeuwbuien
const REGEN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
const ZWARE_REGEN = [65, 82]; // zware regen en zware buien
const IJZEL = [56, 57, 66, 67];
const MIST = [45, 48];
const HELDER = [0, 1];
const BEWOLKT = [2, 3];
export const HEET_GRADEN = 27; // vanaf hier geeft de zin raad: drinken, schaduw, koel blijven, zorgen voor jezelf
export const WARM_GRADEN = 25; // een zomerse dag
// Een hittegolf zoals het KMI ze telt (vijf dagen na elkaar minstens 25 graden, waarvan drie minstens 30), gelezen in de verwachting:
// vandaag en de vier dagen erna. Wat voorbij is, kent Bloei niet; een warme dag zonder zo'n verwachting krijgt de zinnen van weerHeet.
export function isHittegolf(weer) {
  const dagen = Array.isArray(weer?.dagen) ? weer.dagen.slice(0, 5) : [];
  if (dagen.length < 5 || !dagen.every((d) => Number.isFinite(d?.max) && d.max >= 25)) return false;
  return dagen.filter((d) => d.max >= 30).length >= 3;
}
export function weerSoort(weer) {
  if (!weer || !Number.isFinite(weer.code) || !Number.isFinite(weer.temp)) return null;
  const { code, temp, dag = true } = weer;
  // Zwaar weer, zoals de weerdienst het meldt: de zin geeft raad.
  if (ZWAAR_ONWEER.includes(code)) return 'weerZwaarOnweer';
  if (ZWARE_SNEEUW.includes(code)) return 'weerSneeuwval';
  if (IJZEL.includes(code)) return 'weerIjzel';
  if (ZWARE_REGEN.includes(code)) return 'weerStortregen';
  // Gewoon weer.
  if (ONWEER.includes(code)) return 'weerOnweer';
  if (SNEEUW.includes(code)) return 'weerSneeuw';
  if (isHittegolf(weer)) return 'weerHittegolf';
  if (temp >= HEET_GRADEN) return 'weerHeet';
  if (temp <= 0) return 'weerVorst';
  if (REGEN.includes(code)) return 'weerRegen';
  if (MIST.includes(code)) return 'weerMist';
  if (temp >= WARM_GRADEN) return 'weerWarm';
  if (HELDER.includes(code) && dag !== false) return 'weerZon';
  if (temp <= 7) return 'weerKoud';
  if (BEWOLKT.includes(code) && dag !== false) return 'weerGrijs';
  return null;
}
// De groepen waarbij de zin raad geeft: het extreme weer en een hete dag.
export const WEER_EXTREEM = ['weerZwaarOnweer', 'weerSneeuwval', 'weerIjzel', 'weerStortregen', 'weerHittegolf'];
// Alle weergroepen, voor de tests.
export const WEERGROEPEN = [...WEER_EXTREEM, 'weerOnweer', 'weerSneeuw', 'weerHeet', 'weerVorst', 'weerRegen', 'weerMist', 'weerWarm', 'weerZon', 'weerKoud', 'weerGrijs'];

// De demo verbindt met geen enkele dienst (BESLISSING 364) en vraagt geen locatie: ze krijgt voorbeeldweer dat bij de maand past, vast
// per dag, met een week erbij.
export function voorbeeldWeer(datumSleutel) {
  const [jaar, maand, dagNr] = String(datumSleutel).split('-').map((x) => Number(x) || 1);
  const winter = [{ code: 3, temp: 4, kans: 30, mm: 0.3 }, { code: 61, temp: 6, kans: 90, mm: 6 }, { code: 0, temp: 2, kans: 5, mm: 0 }, { code: 71, temp: -1, kans: 80, mm: 3, sneeuw: 2 }, { code: 2, temp: 5, kans: 15, mm: 0 }, { code: 80, temp: 7, kans: 70, mm: 4 }, { code: 45, temp: 3, kans: 20, mm: 0 }];
  const tussen = [{ code: 61, temp: 11, kans: 85, mm: 5 }, { code: 3, temp: 12, kans: 35, mm: 0.4 }, { code: 0, temp: 14, kans: 5, mm: 0 }, { code: 45, temp: 8, kans: 20, mm: 0 }, { code: 2, temp: 13, kans: 15, mm: 0 }, { code: 80, temp: 10, kans: 70, mm: 4 }, { code: 1, temp: 15, kans: 10, mm: 0 }];
  const zomer = [{ code: 0, temp: 23, kans: 0, mm: 0 }, { code: 2, temp: 20, kans: 15, mm: 0 }, { code: 0, temp: 29, kans: 5, mm: 0 }, { code: 80, temp: 18, kans: 70, mm: 4 }, { code: 1, temp: 24, kans: 5, mm: 0 }, { code: 95, temp: 22, kans: 80, mm: 9 }, { code: 3, temp: 19, kans: 30, mm: 0.5 }];
  const koud = [12, 1, 2].includes(maand);
  const warm = [6, 7, 8].includes(maand);
  const lijst = koud ? winter : warm ? zomer : tussen;
  const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dagen = Array.from({ length: WEEKDAGEN }, (_, i) => {
    const w = lijst[(dagNr + i) % lijst.length];
    return { datum: sleutel(new Date(jaar, maand - 1, dagNr + i, 12)), code: w.code, min: w.temp - 4, max: w.temp + 2, kans: w.kans, mm: w.mm };
  });
  const nu = lijst[dagNr % lijst.length];
  return {
    code: nu.code, temp: nu.temp, gevoel: nu.temp - 2, vocht: Math.min(95, 60 + Math.round(nu.kans / 3)), wind: 12, richting: 225, dag: true,
    min: dagen[0].min, max: dagen[0].max, kans: nu.kans, mm: nu.mm, sneeuw: nu.sneeuw ?? 0,
    zonOp: koud ? '08:20' : warm ? '05:40' : '07:10', zonOnder: koud ? '16:45' : warm ? '21:50' : '19:20', uv: koud ? 1 : warm ? 7 : 3,
    dagen,
  };
}
