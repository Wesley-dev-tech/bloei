// De waarschuwingen van het KMI voor Bloei (src/data/kmi.js), op hetzelfde adres als de app: /api/kmi.
// Een functie van Vercel: ze haalt de waarschuwingen van heel België bij MeteoAlarm (waar het KMI ze deelt), houdt alleen over wat Bloei
// leest (src/logica/kmi.js, verkleinKmi) en stuurt ze door. Er komt geen plek binnen en er wordt niets bewaard of gelogd.
// Vercel bewaart het antwoord vijf minuten (s-maxage): zo vraagt de functie MeteoAlarm hoogstens een paar keer per kwartier, hoeveel
// toestellen er ook kijken.
// Lokaal (vite dev en vite preview) beantwoordt vite.config.js hetzelfde adres met dezelfde functie (kmiAntwoord).
import { kmiAdres, verkleinKmi } from '../src/logica/kmi.js';

const BEWAAR = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
const ONBEREIKBAAR = { status: 200, kop: { 'Cache-Control': 'no-store' }, tekst: '{"warnings":[],"onbereikbaar":true}' };

// Het antwoord voor /api/kmi: { status, kop, tekst }. Antwoordt MeteoAlarm niet, dan toch 200 (geen foutmelding in de browser), met
// onbereikbaar: true en niets bewaard: Bloei vraagt het dan rechtstreeks aan MeteoAlarm (src/data/kmi.js).
export async function kmiAntwoord(haal = fetch) {
  try {
    const antwoord = await haal(kmiAdres(), { signal: AbortSignal.timeout(9000), headers: { accept: 'application/json' } });
    if (!antwoord.ok) return ONBEREIKBAAR;
    return { status: 200, kop: { 'Cache-Control': BEWAAR }, tekst: JSON.stringify(verkleinKmi(await antwoord.json())) };
  } catch {
    return ONBEREIKBAAR;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }
  const { status, kop, tekst } = await kmiAntwoord();
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [naam, waarde] of Object.entries(kop)) res.setHeader(naam, waarde);
  return res.end(tekst);
}
