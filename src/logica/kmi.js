// De waarschuwingen van het KMI voor gevaarlijk weer: de regels zonder netwerk (dat doet data/kmi.js). Pure functies.
// Het KMI deelt zijn waarschuwingen via MeteoAlarm (meteoalarm.org, de waarschuwingen van de Europese weerdiensten), per gebied: de
// provincies, Brabant en de kust (logica/kmigebieden.js). Bloei vraagt de waarschuwingen van heel België op, zonder plek, en kiest op het
// toestel zelf welke voor de plek van het toestel gelden. Zo gaat er naar deze tweede dienst niets over de plek.
//
// Een waarschuwing heeft een soort en een kleur, zoals bij het KMI: geel (wees waakzaam), oranje (wees voorbereid), rood (onderneem
// actie). Bloei toont de soorten waarvoor het KMI waarschuwt en die bij een weertype in Bloei horen: wind (storm), regen, onweer,
// gladheid (sneeuw en ijzel), mist, hitte (zonnig en heet) en koude (vorst). Stormtij en CO-intoxicatie toont Bloei niet.

export const KMI_ORIGIN = 'https://feeds.meteoalarm.org';
export const kmiAdres = () => `${KMI_ORIGIN}/api/v1/warnings/feeds-belgium`;
// Bloei vraagt de waarschuwingen eerst bij zichzelf op (api/kmi.js op Vercel, hetzelfde adres als de app): die haalt ze bij MeteoAlarm,
// houdt alleen over wat Bloei leest en stuurt ze door. Zo kan de browser het ophalen nooit tegenhouden (een andere site rechtstreeks
// vragen hangt af van wat die site toelaat). Lukt dat niet (een bouw zonder Vercel), dan vraagt Bloei het rechtstreeks aan MeteoAlarm.
export const KMI_EIGEN_PAD = '/api/kmi';

// De soort van MeteoAlarm (awareness_type, het nummer vooraan) → de naam in Bloei (TEKSTEN.weer.waarschuwing.*).
const SOORTEN = { 1: 'wind', 2: 'gladheid', 3: 'onweer', 4: 'mist', 5: 'hitte', 6: 'koude', 10: 'regen', 13: 'regen' };
// De kleur van MeteoAlarm (awareness_level, het nummer vooraan) → het niveau in Bloei. 1 is groen: geen waarschuwing.
const NIVEAUS = { 2: 'geel', 3: 'oranje', 4: 'rood' };
export const NIVEAU_ORDE = { geel: 1, oranje: 2, rood: 3 };

const nummer = (tekst) => {
  const n = Number.parseInt(String(tekst ?? '').split(';')[0], 10);
  return Number.isInteger(n) ? n : null;
};
const tijdstip = (tekst) => {
  const ms = Date.parse(tekst ?? '');
  return Number.isFinite(ms) ? ms : null;
};
const parameter = (info, naam) => (Array.isArray(info?.parameter) ? info.parameter.find((p) => p?.valueName === naam)?.value : undefined);
const gebiedcodes = (info) =>
  (Array.isArray(info?.area) ? info.area : []).flatMap((a) => (Array.isArray(a?.geocode) ? a.geocode.map((g) => (typeof g?.value === 'string' ? g.value : null)) : [])).filter(Boolean);

// Het antwoord van MeteoAlarm → de waarschuwing die nu geldt voor deze gebieden: { soort, niveau } (de hoogste; bij gelijke kleur de
// eerste in de volgorde van SOORTEN), of null. gebieden: wat waarschuwingsgebieden (logica/kmigebieden.js) gaf.
// Elke melding van het KMI (een "alert") heeft een tijdstip van verzending. Per gebied en soort telt alleen de laatste melding: een
// nieuwe melding vervangt de vorige (een update, een andere kleur, of groen: dan is de waarschuwing voorbij). Ze geldt van haar begin
// (onset, anders effective) tot haar einde (expires). Bloei toont een waarschuwing die nu geldt, of die later vandaag begint (tot
// eindeDag, het einde van vandaag in ms): de kaart gaat over vandaag.
export function leesKmi(json, gebieden, nu = Date.now(), eindeDag = nu) {
  const lijst = Array.isArray(json?.warnings) ? json.warnings : [];
  if (!gebieden?.length || !lijst.length) return null;
  const laatste = new Map(); // 'gebied|soort' → { verstuurd, niveau, van, tot, weg }
  for (const w of lijst) {
    const alert = w?.alert;
    if (!alert || typeof alert !== 'object') continue;
    const verstuurd = tijdstip(alert.sent) ?? 0;
    const weg = alert.msgType === 'Cancel';
    const infos = Array.isArray(alert.info) ? alert.info : [];
    const info = infos.find((i) => i?.language === 'nl-BE') ?? infos[0];
    if (!info) continue;
    const soort = SOORTEN[nummer(parameter(info, 'awareness_type'))];
    if (!soort) continue;
    const niveau = NIVEAUS[nummer(parameter(info, 'awareness_level'))] ?? null;
    const van = tijdstip(info.onset) ?? tijdstip(info.effective) ?? verstuurd;
    const tot = tijdstip(info.expires);
    for (const gebied of gebiedcodes(info)) {
      if (!gebieden.includes(gebied)) continue;
      const sleutel = `${gebied}|${soort}`;
      const vorige = laatste.get(sleutel);
      if (vorige && vorige.verstuurd > verstuurd) continue;
      laatste.set(sleutel, { verstuurd, soort, niveau, van, tot, weg });
    }
  }
  let beste = null;
  const volgorde = Object.values(SOORTEN);
  for (const m of laatste.values()) {
    if (m.weg || !m.niveau || m.tot == null || nu >= m.tot || m.van > Math.max(nu, eindeDag)) continue;
    const beter =
      !beste || NIVEAU_ORDE[m.niveau] > NIVEAU_ORDE[beste.niveau] || (NIVEAU_ORDE[m.niveau] === NIVEAU_ORDE[beste.niveau] && volgorde.indexOf(m.soort) < volgorde.indexOf(beste.soort));
    if (beter) beste = { soort: m.soort, niveau: m.niveau, tot: m.tot };
  }
  return beste;
}

// Het antwoord van MeteoAlarm, verkleind tot wat Bloei leest (api/kmi.js): alleen de meldingen die nog niet voorbij zijn, met per melding
// het tijdstip, de soort melding en de Nederlandse info (begin, einde, gebieden, soort en kleur). Zelfde vorm als het origineel, zodat
// leesKmi beide leest. Van een halve megabyte naar enkele kilobytes.
export function verkleinKmi(json, nu = Date.now()) {
  const lijst = Array.isArray(json?.warnings) ? json.warnings : [];
  const warnings = [];
  for (const w of lijst) {
    const alert = w?.alert;
    if (!alert || typeof alert !== 'object') continue;
    const infos = Array.isArray(alert.info) ? alert.info : [];
    const info = infos.find((i) => i?.language === 'nl-BE') ?? infos[0];
    if (!info) continue;
    const tot = tijdstip(info.expires);
    if (tot != null && tot <= nu) continue;
    warnings.push({
      alert: {
        sent: alert.sent,
        msgType: alert.msgType,
        info: [
          {
            language: info.language,
            onset: info.onset,
            effective: info.effective,
            expires: info.expires,
            area: (Array.isArray(info.area) ? info.area : []).map((a) => ({ geocode: Array.isArray(a?.geocode) ? a.geocode.map((g) => ({ valueName: g?.valueName, value: g?.value })) : [] })),
            parameter: (Array.isArray(info.parameter) ? info.parameter : []).filter((p) => p?.valueName === 'awareness_level' || p?.valueName === 'awareness_type').map((p) => ({ valueName: p.valueName, value: p.value })),
          },
        ],
      },
    });
  }
  return { warnings };
}
