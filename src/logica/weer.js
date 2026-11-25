// Het weer van nu, voor de warme zin op Vandaag (logica/motivatie.js). Pure functies: geen netwerk, geen locatie (dat doet data/weer.js).
// De gegevens komen van Open-Meteo (open-meteo.com, CC BY 4.0): gratis voor niet-commercieel gebruik, zonder account en zonder cookies.
// De naam van de gemeente waar ze is (bv. Balen) komt van Nominatim, de zoekdienst van OpenStreetMap (die kijkt binnen welke
// gemeentegrens de plek ligt). Er is geen tweede bron meer (sinds 0.5.6: de reserve, BigDataCloud, antwoordde niet op een echt toestel).
// Aan beide diensten stuurt Bloei alleen de plaats, precies zoals het toestel ze geeft: er wordt niets afgerond (sinds 0.5.4; daarvoor op
// ongeveer een kilometer). Zo zijn het weer en de gemeente die van de plek waar ze echt is. Geen naam, geen dagboek, niets anders.

export const WEER_ORIGIN = 'https://api.open-meteo.com';

// Een breedte of lengte zoals ze in een vraag staat: het getal van het toestel, onveranderd. Alleen de schrijfwijze ligt vast (nooit
// met een exponent, wat een heel klein getal anders krijgt).
export const graad = (graden) => {
  const tekst = String(graden);
  return /e/i.test(tekst) ? graden.toFixed(15) : tekst;
};

const geldigePlek = (breedte, lengte) =>
  typeof breedte === 'number' && typeof lengte === 'number' && Number.isFinite(breedte) && Number.isFinite(lengte) && Math.abs(breedte) <= 90 && Math.abs(lengte) <= 180;

// De eerste bruikbare naam uit een rij kandidaten, of null. Alleen gewone tekst van redelijke lengte: de naam komt van buiten en gaat
// zo op het scherm (als tekst, nooit als opmaak).
const eersteNaam = (kandidaten) => {
  for (const kandidaat of kandidaten) {
    if (typeof kandidaat !== 'string') continue;
    const naam = kandidaat.replace(/\s+/g, ' ').trim();
    if (naam.length >= 2 && naam.length <= 40 && !/[<>{}\u0000-\u001f]/.test(naam)) return naam;
  }
  return null;
};
// ---- De naam van de plaats ----
// Nominatim, de zoekdienst van OpenStreetMap (gratis, zonder account; gegevens van de OpenStreetMap-bijdragers, licentie ODbL). Ze zoekt
// de gemeente op binnen wier grens de plek ligt. Het adres van de vraag bevat alleen de plaats (zoals voor het weer) en de taal.
export const PLAATS_ORIGIN = 'https://nominatim.openstreetmap.org';

// zoom=10 vraagt het gebied op het niveau van een stad of gemeente.
export function plaatsAdres(breedte, lengte) {
  if (!geldigePlek(breedte, lengte)) return null;
  return `${PLAATS_ORIGIN}/reverse?format=jsonv2&lat=${graad(breedte)}&lon=${graad(lengte)}&zoom=10&accept-language=nl`;
}

// Het antwoord van Nominatim → de naam van de gemeente, stad, het dorp, of van het gevonden gebied zelf; anders null.
// Het antwoord is het gebied op het niveau van een stad of gemeente waar de plek in ligt, met zijn adres. In België en Nederland
// staat de gemeente onder municipality (Balen), en onder city, town of village een kleiner deel ervan (Olmen): de gemeente telt eerst.
// (0.5.5 liet municipality vallen in de veronderstelling dat daar het arrondissement stond; op een echt toestel kwam er dan geen naam.)
// Is het antwoord zelf een groter gebied (addresstype county, state ...: arrondissement, provincie, land), dan kent de dienst de
// gemeente hier niet en komt er geen naam: liever geen dan een verkeerde.
const TE_GROOT = ['county', 'state_district', 'state', 'province', 'region', 'country', 'continent'];
export function leesPlaats(json) {
  const a = json?.address && typeof json.address === 'object' ? json.address : {};
  if (TE_GROOT.includes(json?.addresstype)) return null;
  return eersteNaam([a.municipality, a.city, a.town, a.village, json?.name]);
}

// Wat voor antwoord er kwam als er geen naam uit te halen was, voor de regel "Plaats niet gevonden": het soort gebied, of dat de dienst
// zelf een fout meldde. Alleen kleine letters en een streepje: het komt van buiten en gaat zo op het scherm.
export function soortAntwoord(json) {
  if (typeof json?.error === 'string' || (json?.error && typeof json.error === 'object')) return 'fout';
  const soort = typeof json?.addresstype === 'string' ? json.addresstype.toLowerCase() : '';
  return /^[a-z_]{2,20}$/.test(soort) ? soort : '';
}

// Is de plek anders dan bij de vorige vraag? Dan wordt de gemeente opnieuw opgezocht. Alleen exact dezelfde plek geeft zeker dezelfde
// gemeente: daarvoor hoeft er geen nieuwe vraag naar buiten.
export function isVerplaatst(vorige, breedte, lengte) {
  if (!vorige) return true;
  return vorige.b !== breedte || vorige.l !== lengte;
}

// ---- Hoe goed de meting van het toestel is ----
// Een toestel geeft eerst vaak een ruwe plek (op zendmasten, kilometers ernaast) en pas daarna een fijne (wifi, gps). Bloei
// gebruikt de eerste meting meteen en verbetert zodra er een fijne komt (data/weer.js). De nauwkeurigheid is de straal in meter die het
// toestel zelf opgeeft.
export const GOED_M = 150; // zo fijn: dit is de plek, er hoeft geen betere meer te komen
export const RUW_M = 1000; // grover dan dit: de gemeente kan ernaast zitten. Dan komt er geen naam, wel hoe ruw de plek is.

const straal = (meting) => (Number.isFinite(meting?.coords?.accuracy) && meting.coords.accuracy >= 0 ? meting.coords.accuracy : Infinity);

// De beste van twee metingen: de fijnste; bij gelijk de nieuwste.
export const besteMeting = (beste, nieuw) => (!beste || straal(nieuw) <= straal(beste) ? nieuw : beste);
export const isGoedeMeting = (meting) => straal(meting) <= GOED_M;
// Ruw alleen als het toestel het zelf zegt; geeft het geen straal op, dan weten we het niet en zeggen we niets.
export const isRuweMeting = (meting) => Number.isFinite(meting?.coords?.accuracy) && meting.coords.accuracy > RUW_M;
// De speling van een ruwe meting in hele kilometers (minstens 1), voor de regel in het weerbericht; null als de meting niet ruw is.
export const spelingKm = (meting) => (isRuweMeting(meting) ? Math.max(1, Math.round(meting.coords.accuracy / 1000)) : null);

// ---- Het weer ----
// Het adres van de vraag: alleen de plaats en wat Bloei wil weten. Van nu: temperatuur, gevoelstemperatuur, weercode, wind, dag of nacht. Van
// vandaag: de laagste en de hoogste temperatuur, de kans op neerslag en hoeveel er verwacht wordt (daarvoor wil de dienst een tijdzone:
// 'auto' is die van de plaats).
export function weerAdres(breedte, lengte) {
  if (!geldigePlek(breedte, lengte)) return null;
  return `${WEER_ORIGIN}/v1/forecast?latitude=${graad(breedte)}&longitude=${graad(lengte)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,snowfall_sum&forecast_days=1&timezone=auto`;
}

// Het antwoord van de dienst → { code, temp, gevoel, wind, dag, min, max, kans, mm, sneeuw }, of null als het niet is wat Bloei verwacht (dan komt er gewoon
// geen weer). gevoel is de gevoelstemperatuur van nu; min, max, kans (in procent), mm (de verwachte neerslag) en sneeuw (in cm) zijn die
// van vandaag. Ontbreekt er een, dan is ze null en laat het weerbericht ze weg.
export function leesAntwoord(json) {
  const nu = json?.current;
  if (!nu || typeof nu !== 'object') return null;
  const code = Number(nu.weather_code);
  const temp = Number(nu.temperature_2m);
  const wind = Number(nu.wind_speed_10m);
  if (!Number.isInteger(code) || code < 0 || code > 99 || !Number.isFinite(temp) || temp < -90 || temp > 60) return null;
  const eerste = (lijst, laag, hoog) => {
    const w = Array.isArray(lijst) && typeof lijst[0] === 'number' ? lijst[0] : NaN;
    return Number.isFinite(w) && w >= laag && w <= hoog ? Math.round(w) : null;
  };
  const d = json.daily ?? {};
  let min = eerste(d.temperature_2m_min, -90, 60);
  let max = eerste(d.temperature_2m_max, -90, 60);
  if (min != null && max != null && min > max) [min, max] = [null, null];
  const gevoel = typeof nu.apparent_temperature === 'number' && nu.apparent_temperature >= -90 && nu.apparent_temperature <= 60 ? Math.round(nu.apparent_temperature) : null;
  // Een hoeveelheid met één cijfer na de komma (0,4 mm blijft 0,4), of null.
  const hoeveel = (lijst, hoog) => {
    const w = Array.isArray(lijst) && typeof lijst[0] === 'number' ? lijst[0] : NaN;
    return Number.isFinite(w) && w >= 0 && w <= hoog ? Math.round(w * 10) / 10 : null;
  };
  return {
    code,
    temp: Math.round(temp),
    gevoel,
    wind: Number.isFinite(wind) && wind >= 0 ? Math.round(wind) : 0,
    dag: nu.is_day !== 0,
    min,
    max,
    kans: eerste(d.precipitation_probability_max, 0, 100),
    mm: hoeveel(d.precipitation_sum, 500),
    sneeuw: hoeveel(d.snowfall_sum, 300),
  };
}

// De weercodes van de WMO, zoals Open-Meteo ze geeft.
const ONWEER = [95, 96, 99];
const SNEEUW = [71, 73, 75, 77, 85, 86];
const REGEN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
const MIST = [45, 48];
const HELDER = [0, 1];
const BEWOLKT = [2, 3];

// De groep zinnen die bij dit weer hoort (TEKSTEN.motivatie), of null als er niets over te zeggen valt (een zachte, heldere nacht).
// Het opvallendste eerst: onweer en sneeuw, dan hitte en vorst, dan regen, mist en wind, en pas daarna zon, kou of een grijze lucht.
export function weerSoort(weer) {
  if (!weer || !Number.isFinite(weer.code) || !Number.isFinite(weer.temp)) return null;
  const { code, temp, wind = 0, dag = true } = weer;
  if (ONWEER.includes(code)) return 'weerOnweer';
  if (SNEEUW.includes(code)) return 'weerSneeuw';
  if (temp >= 27) return 'weerHeet';
  if (temp <= 0) return 'weerVorst';
  if (REGEN.includes(code)) return 'weerRegen';
  if (MIST.includes(code)) return 'weerMist';
  if (wind >= 40) return 'weerWind';
  if (HELDER.includes(code) && dag) return 'weerZon';
  if (temp <= 7) return 'weerKoud';
  if (BEWOLKT.includes(code) && dag) return 'weerGrijs';
  return null;
}

// Het weerbericht op Vandaag: het icoon (src/iconen/solid) en de naam (TEKSTEN.weer) bij een weercode. 's Nachts een maan in plaats van een zon.
const BEELD = {
  0: ['sun', 'zonnig'], 1: ['sun', 'vrijZonnig'], 2: ['cloud-sun', 'halfBewolkt'], 3: ['cloud', 'bewolkt'],
  45: ['smog', 'mist'], 48: ['smog', 'mist'],
  51: ['cloud-rain', 'motregen'], 53: ['cloud-rain', 'motregen'], 55: ['cloud-rain', 'motregen'],
  56: ['cloud-rain', 'ijzel'], 57: ['cloud-rain', 'ijzel'], 66: ['cloud-rain', 'ijzel'], 67: ['cloud-rain', 'ijzel'],
  61: ['cloud-rain', 'lichteRegen'], 63: ['cloud-rain', 'regen'], 65: ['cloud-showers-heavy', 'zwareRegen'],
  71: ['snowflake', 'lichteSneeuw'], 73: ['snowflake', 'sneeuw'], 75: ['snowflake', 'zwareSneeuw'], 77: ['snowflake', 'sneeuw'],
  80: ['cloud-rain', 'lichteBuien'], 81: ['cloud-showers-heavy', 'buien'], 82: ['cloud-showers-heavy', 'zwareBuien'],
  85: ['snowflake', 'sneeuwbuien'], 86: ['snowflake', 'sneeuwbuien'],
  95: ['cloud-bolt', 'onweer'], 96: ['cloud-bolt', 'onweerHagel'], 99: ['cloud-bolt', 'onweerHagel'],
};
const NACHT = { sun: 'moon', 'cloud-sun': 'cloud-moon' };
const NACHTNAAM = { zonnig: 'helder', vrijZonnig: 'vrijHelder' };
export const WEERNAMEN = [...new Set([...Object.values(BEELD).map((b) => b[1]), ...Object.values(NACHTNAAM)])];
export const WEERICONEN = [...new Set([...Object.values(BEELD).map((b) => b[0]), ...Object.values(NACHT)])];

// weerBeeld(weer) → { icoon, naam }, of null zonder bruikbaar weer. Een code die Bloei niet kent, is gewoon bewolkt.
export function weerBeeld(weer) {
  if (!weer || !Number.isFinite(weer.code) || !Number.isFinite(weer.temp)) return null;
  const [icoon, naam] = BEELD[weer.code] ?? ['cloud', 'bewolkt'];
  const nacht = weer.dag === false;
  return { icoon: nacht ? (NACHT[icoon] ?? icoon) : icoon, naam: nacht ? (NACHTNAAM[naam] ?? naam) : naam };
}

// Alle weergroepen, voor de tests en voor de demo.
export const WEERGROEPEN = ['weerOnweer', 'weerSneeuw', 'weerHeet', 'weerVorst', 'weerRegen', 'weerMist', 'weerWind', 'weerZon', 'weerKoud', 'weerGrijs'];

// De demo verbindt met geen enkele dienst (BESLISSING 364): ze krijgt voorbeeldweer dat bij de maand past, vast per dag.
export function voorbeeldWeer(datumSleutel) {
  const maand = Number(String(datumSleutel).slice(5, 7)) || 1;
  const dagNr = Number(String(datumSleutel).slice(8, 10)) || 1;
  const winter = [{ code: 3, temp: 4, kans: 30, mm: 0.3 }, { code: 61, temp: 6, kans: 90, mm: 6 }, { code: 0, temp: 2, kans: 5, mm: 0 }, { code: 71, temp: -1, kans: 80, mm: 3, sneeuw: 2 }];
  const tussen = [{ code: 61, temp: 11, kans: 85, mm: 5 }, { code: 3, temp: 12, kans: 35, mm: 0.4 }, { code: 0, temp: 14, kans: 5, mm: 0 }, { code: 45, temp: 8, kans: 20, mm: 0 }];
  const zomer = [{ code: 0, temp: 23, kans: 0, mm: 0 }, { code: 2, temp: 20, kans: 15, mm: 0 }, { code: 0, temp: 29, kans: 5, mm: 0 }, { code: 80, temp: 18, kans: 70, mm: 4 }];
  const lijst = [12, 1, 2].includes(maand) ? winter : [6, 7, 8].includes(maand) ? zomer : tussen;
  const weer = lijst[dagNr % lijst.length];
  // (de demo vraagt geen locatie: de plaats is een voorbeeld, zoals het weer zelf)
  return { sneeuw: 0, ...weer, gevoel: weer.temp - 2, wind: 12, dag: true, min: weer.temp - 4, max: weer.temp + 2, plaats: 'Brussel' };
}
