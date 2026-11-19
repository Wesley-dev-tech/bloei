// Bloei-herinneringen: een kleine Cloudflare Worker (PLAN.md §6.5, BESLISSINGEN 30 tot 38).
// Hij bewaart per toestel het push-adres (met de sleutels van het abonnement) en de herinneringsuren, en stuurt op die uren een LEEG
// pushsignaal. De tekst van de melding kiest de app zelf, op het toestel. Daarnaast staan in de metadata van elk abonnement een
// paar kleine tellers (zie metadata() hieronder: a, g, f, ff, d, w, v), en buiten de abonnementen alleen sleutels zonder inhoud:
// de lijst van abonnementen (k:lijst, de sleutels en hun uur van aanmelding), het aantal nieuwe aanmeldingen per dag (n:...), een
// rem per IP-hash en uur (r:..., geen IP), per pushdienst het uur van de laatste geslaagde melding (h:...) en welke minuten van het
// laatste 15 minuten al een signaal kregen (v:verstuurd, zie de inhaalregel).
// Geen naam, geen dagboekgegevens, geen IP, geen logregels.
//
// ==== BESLISSING 713: een herinnering per minuut. De keuze en de rekensom. ====
// De Worker loopt elke minuut (cron '* * * * *', 1440 runs per dag). Het gratis abonnement laat per dag toe (bronnen, nagekeken op
// 18 november 2026): KV 100.000 leesopdrachten, 1000 schrijfopdrachten, 1000 wisopdrachten, 1000 lijstopvragingen, hoogstens één
// schrijfopdracht per seconde per sleutel, schrijven is pas na tot 60 seconden overal zichtbaar (developers.cloudflare.com
// /kv/platform/pricing, /kv/platform/limits, /kv/api/write-key-value-pairs); Workers 100.000 verzoeken per dag, 10 ms CPU per cron,
// 5 crons per account, 50 externe subverzoeken per aanroep, en elke minuut mag ('* * * * *' staat als voorbeeld in
// /workers/configuration/cron-triggers; geen belofte over stiptheid); Durable Objects op Free: alleen met SQLite, 100.000
// verzoeken en 100.000 geschreven rijen per dag (/durable-objects/platform/pricing).
// Een lijstopvraging per minuut kan dus niet (1440 > 1000). Drie opzetten doorgerekend:
//  A. Het rooster (de uren van alle abonnementen) in één sleutel, bijgewerkt bij elke aanmelding, wijziging en afmelding, en elk
//     kwartier gelijkgezet met de echte lijst. Per run één leesopdracht. Maar elke wijziging kost dan twee schrijfopdrachten (het
//     abonnement en het rooster): 30 abonnementen x 15 wijzigingen x 2 = 900 van de 1000, samen met de rest ongeveer 1350. Past
//     niet, tenzij WIJZIGINGEN_PER_DAG zakt (een beslissing van de eigenaar, 15 werd net gekozen).
//  B. Elk kwartier een lijstopvraging en het resultaat bewaren; de run per minuut leest alleen dat resultaat. Past wel (96
//     lijstopvragingen), maar een gewijzigd uur werkt pas door na de volgende gelijkzetting: tot 15 minuten te laat of gemist.
//  C. Een Durable Object (SQLite) met de abonnementen, een strikte teller en een wekker. Gratis en atomair, maar het is een
//     herbouw van de hele dienst (opslag, BESLISSING 630, 635 en 641 opnieuw, een migratie van de gegevens naar het object, een
//     nieuwe binding en migratie in wrangler.toml, een nep-object voor de tests): niet betrouwbaar af en getest tegen morgen.
// Gekozen: A zonder het rooster bij te werken. k:lijst bevat alleen WELKE abonnementen er zijn (en hun uur van aanmelding voor
// BESLISSING 630), niet hun uren. Elke run leest k:lijst en dan elk abonnement apart (zijn uren staan in zijn eigen metadata), dus
// een gewijzigd uur werkt na de vertraging van KV (tot een minuut) meteen door, zonder extra schrijfopdracht. k:lijst vervangt de
// telling t:aantal (het aantal is de lengte) en de lijst k:nieuw van voor 713, en wordt geschreven waar die vroeger geschreven
// werden: bij een nieuwe aanmelding, bij afmelden en hoogstens één keer per kwartier bij de gelijkzetting. Leesopdrachten in ruil:
// 2 + N per run (k:lijst, v:verstuurd en de N abonnementen), met N = 10 dus 12 x 1440 = 17.280 per dag.
// De rekensommen per soort opdracht staan hieronder bij "Grenzen tegen misbruik".
import { MINUUT_MS, urenVanMinuut } from './tijd.js';
import { MAX_BODY, dienstVan, gelijkGeheim, isToegelatenEndpoint, normaalEndpoint, schoonAbonnement } from './valideer.js';
import { importeerSleutel, vapidKop } from './vapid.js';

const SLEUTEL_VOORVOEGSEL = 'a:';

const encoder = new TextEncoder();
// De hash gaat over de vaste vorm van het endpoint (normaalEndpoint), zodat een variant van hetzelfde adres geen tweede plaats krijgt.
export async function sleutelVan(endpoint) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(normaalEndpoint(endpoint) ?? endpoint)));
  return SLEUTEL_VOORVOEGSEL + [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Op elk antwoord (OW-04, REST Security Cheat Sheet): niet raden naar het type, nergens bewaren (ook niet in een tussenliggende
// cache), en nooit als pagina tonen of inbedden.
export const VASTE_KOPPEN = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
});

function corsKoppen(origin) {
  return {
    ...VASTE_KOPPEN,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // Retry-After hoort niet bij de koppen die een browser zonder toelating aan de app toont: hier toelaten, zodat de app weet
    // wanneer ze opnieuw mag proberen na een 429.
    'Access-Control-Expose-Headers': 'Retry-After',
    Vary: 'Origin',
  };
}

// Een nette foutcode zonder details.
const fout = (status, code, koppen = {}) =>
  new Response(JSON.stringify({ fout: code }), { status, headers: { ...VASTE_KOPPEN, 'Content-Type': 'application/json', ...koppen } });

// Leest hoogstens MAX_BODY bytes: een lichaam zonder (of met een valse) Content-Length wordt niet eerst helemaal ingelezen.
async function leesBody(verzoek) {
  const lengte = Number(verzoek.headers.get('Content-Length') ?? 0);
  if (lengte > MAX_BODY) return { fout: 'te-groot' };
  const stukken = [];
  let totaal = 0;
  if (verzoek.body) {
    const lezer = verzoek.body.getReader();
    for (;;) {
      const { done, value } = await lezer.read();
      if (done) break;
      totaal += value.byteLength;
      if (totaal > MAX_BODY) {
        await lezer.cancel().catch(() => {});
        return { fout: 'te-groot' };
      }
      stukken.push(value);
    }
  }
  const bytes = new Uint8Array(totaal);
  let plek = 0;
  for (const s of stukken) {
    bytes.set(s, plek);
    plek += s.byteLength;
  }
  const tekst = new TextDecoder().decode(bytes);
  try {
    return { json: JSON.parse(tekst) };
  } catch {
    return { fout: 'ongeldig' };
  }
}

// Wat per abonnement in de KV-metadata komt: de uren (u, 'UU:MM' per minuut), en een paar kleine tellers: de reeks weigeringen
// van de pushdienst (f = aantal, ff = het uur van de eerste, als heel uur sinds 1970), het aantal wijzigingen vandaag (d =
// UTC-datum, w = aantal) en de minuut van de laatste aanmelding of wijziging (v, minuten sinds 1970; alleen voor de inhaalregel:
// een uur dat al voorbij was toen het gekozen werd, wordt niet ingehaald). Een nieuw abonnement begint met de uren, v en het uur
// van aanmelding (a, zie hieronder); na de eerste geslaagde melding valt a weg en staat er g = 1. Een abonnement van voor 713
// heeft geen v en kwartieren in u: dat blijft gewoon werken.
function metadata(w, extra = {}) {
  return { u: w.uren, ...extra };
}

// ---- BESLISSING 630: zijn de plaatsen vol, dan maakt een nieuwe aanmelding eerst plaats door het oudste abonnement te wissen
// dat al lang genoeg bestaat, nog nooit een geslaagde melding (2xx van de pushdienst) kreeg en door zijn pushdienst echt
// geweigerd werd, terwijl diezelfde dienst onze signalen wel aanvaardt. ----
// a: het uur van aanmelding, als heel uur sinds 1970 (UTC). Niet fijner: meer is voor deze regel niet nodig. Alleen een abonnement
//    MET a kan langs deze weg gewist worden; een abonnement zonder a (van voor deze regel) telt als ooit geslaagd.
// g: 1 zodra de pushdienst ooit 2xx antwoordde. Dan valt a weg. Dat kost hoogstens één schrijfopdracht per abonnement.
// Wisbaar is een abonnement pas als ALLE vier gelden:
//  1. het bestaat meer dan PROEF_UREN (48) hele uren en kreeg nog nooit 2xx (a staat er, g niet);
//  2. de pushdienst weigerde het minstens één keer echt (400, 401 of 403: f >= 1). Een vals adres krijgt dat bij zijn eerste
//     signaal. Een tijdelijke fout (429, 5xx), een netwerkfout of een gemiste run van het signaal laat geen f na, dus een echt
//     toestel dat alleen zulke pech had, blijft staan, hoe lang ook;
//  3. dezelfde pushdienst (dienstVan: fcm, apple, mozilla, windows) aanvaardde de laatste PROEF_UREN uur nog een signaal van ons
//     (sleutel h:<dienst>, het uur van de laatste 2xx). Weigert de dienst alles, bv. door een fout in onze eigen VAPID-instelling
//     of omdat hij ons blokkeert, dan wordt er niets gewist;
//  4. die 2xx kwam in een later uur dan de eerste weigering van deze reeks (ff). Zo telt een weigering die viel terwijl onze
//     instelling (nog) fout was, niet mee, ook als de dienst daarvoor of daarna wel werkte.
// Een echt toestel wordt zo niet gewist omdat het weinig kansen had (de overgang naar zomeruur, een late run, een pushdienst die
// even faalt): zonder echte weigering is het nooit wisbaar. Wat overblijft, is een toestel dat de dienst echt weigert terwijl hij
// andere toestellen wel bedient (bv. een abonnement op een oude VAPID-sleutel); dat krijgt ook nooit een melding en meldt zich bij
// de volgende start van de app opnieuw aan. PROEF_UREN houdt een nieuw abonnement de eerste twee dagen sowieso buiten schot.
// Voorwaarde 3 en 4 gelden ook voor de regel voor blijvende weigeringen (WEIGER_DREMPEL, hieronder). Gevolg: op een pushdienst
// zonder één werkend toestel wordt een vals abonnement dat 400, 401 of 403 krijgt langs geen van beide wegen gewist; het blijft
// een plaats bezetten tot die dienst een ander toestel weer bedient (of tot het 404 of 410 krijgt). Dat is de prijs: liever een
// bezette plaats dan echte toestellen wissen omdat onze eigen instelling fout staat.
export const PROEF_UREN = 48;
const uurVan = (nu) => Math.floor(nu / UUR_MS);
const minuutVan = (nu) => Math.floor(nu / MINUUT_MS);
const nogNooitGeslaagd = (m) => Number.isInteger(m?.a) && m.g !== 1;
const aantalWeigeringen = (m) => (Number.isInteger(m?.f) && m.f > 0 ? m.f : 0);
// ff als heel uur. Een oudere waarde in milliseconden (van voor 18 november) wordt omgerekend.
const eersteWeigering = (m) => (Number.isInteger(m?.ff) ? (m.ff > 1e9 ? Math.floor(m.ff / UUR_MS) : m.ff) : null);
// Voorwaarden 1 en 2: alleen uit de metadata van het abonnement.
const isWisbaar = (m, uur) => nogNooitGeslaagd(m) && uur - m.a > PROEF_UREN && aantalWeigeringen(m) > 0 && eersteWeigering(m) !== null;
// Voorwaarden 3 en 4: het uur van de laatste 2xx van dezelfde dienst.
const dienstWerkt = (laatste, m, uur) => Number.isInteger(laatste) && uur - laatste <= PROEF_UREN && laatste > eersteWeigering(m);
// Per pushdienst het uur van de laatste geslaagde melding. Het signaal schrijft ze alleen als het uur verandert
// (hoogstens 24 keer per dag per dienst) en ze verdwijnt vanzelf als ze te oud is om nog mee te tellen.
const DIENST_VOORVOEGSEL = 'h:';
async function leesDienstUur(env, dienst, cache) {
  if (!cache.has(dienst)) {
    const n = Number(await env.ABONNEMENTEN.get(DIENST_VOORVOEGSEL + dienst));
    cache.set(dienst, Number.isInteger(n) && n > 0 ? n : null);
  }
  return cache.get(dienst);
}
// ---- De lijst van abonnementen (BESLISSING 713): k:lijst = [[sleutel, a], ...], gesorteerd op sleutel, met a het uur van
// aanmelding zolang het abonnement nog nooit een geslaagde melding kreeg, anders null. Het aantal abonnementen is haar lengte; de
// kandidaten van BESLISSING 630 zijn de rijen met een a, de oudste eerst. Ze vervangt t:aantal en k:nieuw van voor 713.
// Wie schrijft ze: een nieuwe aanmelding (zet zichzelf erbij, en haalt het abonnement weg dat plaats maakt), een afmelding (haalt
// zichzelf weg) en de gelijkzetting elk kwartier (bouwt ze opnieuw uit een lijstopvraging, en schrijft alleen als ze verschilt).
// KV kent geen atomaire bijwerking: twee schrijvers tegelijk kunnen elkaars wijziging overschrijven. Dat kost nooit een abonnement
// (dat staat in zijn eigen sleutel), alleen een plaats in de lijst tot de volgende gelijkzetting, dus hoogstens 15 minuten (en tot
// een minuut meer, zolang KV de nieuwe sleutel nog niet in zijn lijst toont). Het gevolg voor een nieuw toestel: zijn signaal komt
// tot 15 minuten te laat (de inhaalregel haalt het in), niet nooit. Voor de telling: zoals vroeger kan er even één te veel of te
// weinig staan, tot de volgende gelijkzetting.
const LIJST = 'k:lijst';
// De sleutels van voor 713. De eerste gelijkzetting na de uitrol wist ze (twee wisopdrachten, één keer).
const OUDE_SLEUTELS = ['t:aantal', 'k:nieuw'];
const MAX_WIS_POGINGEN = 3;
// De bewaarde lijst, of null als ze ontbreekt of onleesbaar is (dan bouwt de volgende run ze opnieuw).
function leesLijst(ruw) {
  if (ruw === null || ruw === undefined) return null;
  try {
    const lijst = JSON.parse(ruw);
    if (!Array.isArray(lijst)) return null;
    return lijst.filter(
      (x) => Array.isArray(x) && typeof x[0] === 'string' && x[0].startsWith(SLEUTEL_VOORVOEGSEL) && (x[1] === null || Number.isInteger(x[1])),
    );
  } catch {
    return null;
  }
}
const gesorteerd = (lijst) => [...lijst].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
const schrijfLijst = (env, lijst) => env.ABONNEMENTEN.put(LIJST, JSON.stringify(gesorteerd(lijst)));
// De kandidaten van BESLISSING 630: de abonnementen met een uur van aanmelding, de oudste eerst.
const nooitGeslaagdVan = (lijst) =>
  lijst.filter(([, a]) => Number.isInteger(a)).sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
// Bouwt de lijst uit de echte opslag: een lijstopvraging (met de metadata, dus zonder elke waarde te lezen). Wat in de oude lijst
// staat maar (nog) niet in die van KV, blijft staan: een aanmelding van de laatste minuut zit er soms nog niet in. Of zo'n rij echt
// bestaat, ziet de run meteen daarna (hij leest elk abonnement); bestaat ze niet, dan valt ze weg.
async function bouwLijst(env, oud) {
  const rijen = new Map();
  let cursor;
  do {
    const lijst = await env.ABONNEMENTEN.list({ prefix: SLEUTEL_VOORVOEGSEL, cursor });
    for (const k of lijst.keys) rijen.set(k.name, nogNooitGeslaagd(k.metadata) ? k.metadata.a : null);
    cursor = lijst.list_complete ? undefined : lijst.cursor;
  } while (cursor);
  for (const [naam, a] of oud ?? []) if (!rijen.has(naam)) rijen.set(naam, a);
  return gesorteerd([...rijen]);
}
// Zoekt de oudste abonnementen die langs deze weg weg mogen (hoogstens `hoeveel`). De lijst kan achterlopen: elke kandidaat wordt
// nagekeken in zijn eigen metadata en waarde (bestaat hij nog, voorwaarden 1 tot 4). Hoogstens MAX_WIS_POGINGEN kandidaten
// (plus één per extra gezochte plaats) worden gelezen, wat er ook in de lijst staat. Geeft een lijst sleutels, mogelijk leeg.
async function zoekWisbaar(env, nu, lijst, dienstUren, hoeveel = 1) {
  const uur = uurVan(nu);
  const gevonden = [];
  let pogingen = 0;
  for (const [naam, a] of lijst) {
    if (gevonden.length >= hoeveel) break;
    if (uur - a <= PROEF_UREN) continue;
    if (pogingen++ >= MAX_WIS_POGINGEN + hoeveel - 1) break;
    const { value, metadata: m } = await env.ABONNEMENTEN.getWithMetadata(naam);
    if (value === null || !isWisbaar(m, uur)) continue;
    const dienst = dienstVan((await leesBewaard(env, naam, value))?.abonnement?.endpoint);
    if (dienst && dienstWerkt(await leesDienstUur(env, dienst, dienstUren), m, uur)) gevonden.push(naam);
  }
  return gevonden;
}

// ---- Grenzen tegen misbruik (OW-01b). Alles binnen het gratis abonnement van KV (per dag 1000 schrijf-, 1000 wis- en 1000
// lijstopdrachten). Een afgewezen verzoek schrijft nooit iets, zodat de rem zelf het dagquotum niet kan opmaken. Een verzoek dat
// botst op de dagteller (te veel tegelijk) evenmin: de dagteller is zijn eerste schrijfopdracht (BESLISSING 641). ----
// Hoogstens zoveel NIEUWE aanmeldingen per uur per IP (bijwerken en afmelden van een bestaand toestel vallen er niet onder).
export const REM_PER_UUR = 5;
// Hoogstens zoveel nieuwe aanmeldingen per UTC-dag voor de hele dienst (een persoonlijke app heeft een handvol toestellen).
export const NIEUW_PER_DAG = 20;
// Hoogstens zoveel echte wijzigingen per abonnement per UTC-dag (dezelfde aanmelding opnieuw sturen schrijft niets en telt niet).
// De rekensom hieronder is 492 + 30 x WIJZIGINGEN_PER_DAG (zonder afwisselende pushdienst; tot 713 was het 512 + 30 x ...).
// 15 geeft 942 en laat 58 over als marge (die vangt de benaderde telling van v:verstuurd op, zie hieronder). Per uur tellen helpt het budget niet: de schrijfopdrachten tellen
// per dag, en een grens per uur laat 24 keer zoveel per dag toe. De app stuurt een reeks tikken als één wijziging door
// (src/meldingen/push.js, WACHTTIJD_MS), dus wie de herinneringen voor het eerst instelt, blijft daar ruim onder. Tot 18 november
// stond hier 8.
export const WIJZIGINGEN_PER_DAG = 15;
// Rekensom, met de standaard MAX_ABONNEMENTEN = 10 (de KV-dag begint om 00:00 UTC). Ze geldt voor verzoeken die na elkaar komen,
// ook vanaf duizenden IP-adressen. Ze is GEEN harde grens bij gelijktijdige verzoeken: KV kent geen atomaire teller, dus een golf
// gelijktijdige aanmeldingen kan dezelfde oude stand van de dagteller en de telling lezen (zie BESLISSING 641 in verwerk).
// Op één dag bestaan dan hoogstens MAX_ABONNEMENTEN + NIEUW_PER_DAG = 30 verschillende abonnementen (de 10 van bij het begin van
// de dag en de 20 nieuwe).
//   Verzoeken:
//   - per nieuwe aanmelding 4 (dagteller, k:lijst, rem, abonnement; maakt een ander abonnement plaats, dan ook een wis). Een
//     aanmelding met een vreemd geheim op een bestaand adres schrijft de dagteller en de rem (2) en telt mee in de dagteller:
//     samen hoogstens 20 x 4 = 80;
//   - wijzigingen: elk van de 30 abonnementen hoogstens WIJZIGINGEN_PER_DAG keer: 30 x 15 = 450 (ook de 10 van bij het begin). De
//     nieuwe uren, de teller en v gaan in dezelfde schrijfopdracht; k:lijst verandert er niet door;
//   - afmelden: 1 (k:lijst) per abonnement, en elk abonnement kan maar één keer afgemeld worden: 30.
//   Samen 560.
//   Het signaal (1440 runs per dag, één per minuut):
//   - k:lijst gelijkzetten: alleen in de run van een kwartier en alleen als ze verschilt: hoogstens 96;
//   - weigeringen bijhouden: hoogstens WEIGER_DREMPEL + 1 per abonnement = 30 x 4 = 120, zolang een pushdienst niet afwisselt.
//     Wisselt een pushdienst af tussen 400, 401 of 403 en 2xx, dan begint elke weigering een nieuwe reeks en sluit elke 2xx ze af:
//     dan kost elk signaal een schrijfopdracht, hoogstens 12 per abonnement per dag (MAX_UREN): 30 x 12 = 360 in plaats van 120;
//   - BESLISSING 630: de vlag g hoogstens 1 per abonnement (30), en per pushdienst het uur van de laatste 2xx hoogstens 24 keer
//     (4 x 24 = 96). (De lijst k:nieuw van vroeger, 60, bestaat niet meer: haar inhoud zit in k:lijst.)
//   - v:verstuurd (de inhaalregel): alleen in een run die iets verstuurt, hoogstens MAX_VERSTUURD_PER_DAG = 40 per UTC-dag.
//     Daarna geen inhaalregel meer tot middernacht UTC; de signalen op hun eigen minuut blijven vertrekken. De teller staat in
//     v:verstuurd zelf en is bij benadering: leest een run een oude stand (KV, tot een minuut), dan telt hij een schrijfopdracht te
//     weinig. In het ergste geval (elke minuut een signaal en elke keer een oude stand) wordt het 2 x 40 = 80.
//   Samen 96 + 120 + 30 + 96 + 40 = 382, of hoogstens 622 bij een afwisselende pushdienst.
//   Totaal hoogstens 942 van de 1000 schrijfopdrachten (492 + 30 x WIJZIGINGEN_PER_DAG), 982 met de benaderde teller in het ergste
//   geval. Bij een pushdienst die afwisselt tussen een weigering en een geslaagde melding is 1000 NIET gegarandeerd: dan 732 + 30 x
//   WIJZIGINGEN_PER_DAG = 1182 met 12 signalen per abonnement per dag, en meer als een abonnement zijn uren wijzigt. Dat was voor
//   713 ook al zo (1202). Die afwisseling komt van de pushdienst, niet van een aanvaller: de dienst aanvaardt alleen adressen van
//   de vier pushdiensten (valideer.js). Gebeurt het toch, dan geldt hetzelfde gevolg als bij een golf hieronder: de rest van die
//   UTC-dag geen wijzigingen (503), de signalen blijven vertrekken. (De vlag g zit eigenlijk al in de 360, dus ruim gerekend; een
//   dag met een extra uur bij de overgang naar winteruur kan bij een afwisselende pushdienst een paar signalen meer geven.)
//   Wissen: elk abonnement hoogstens één keer, hoe ook (afmelden, 404 of 410, blijvende weigering, plaats maken, terug onder het
//   maximum): hoogstens 30 van de 1000, plus één keer t:aantal en k:nieuw na de uitrol van 713.
//   Lijstopvragingen: 96 voor de gelijkzetting per kwartier. Een verzoek doet er geen, behalve zolang k:lijst nog niet bestaat (na
//   de uitrol, tot de eerste run); een run zonder k:lijst bouwt ze en doet er dan één (zolang het schrijven van k:lijst dan
//   mislukt, bv. omdat de schrijfopdrachten van die dag op zijn, elke run één: alleen bij de eerste uitrol op zo'n dag).
//   Bij een golf gelijktijdige aanmeldingen geldt dit niet: dan kunnen er meer dan 20 nieuwe aanmeldingen per dag doorkomen en meer
//   abonnementen dan MAX_ABONNEMENTEN bestaan, en raakt het dagquotum van 1000 schrijfopdrachten in het ergste geval op. Het
//   gevolg: de rest van de UTC-dag geen nieuwe aanmeldingen en geen wijzigingen (503; afmelden wist het toestel nog wel, want
//   wissen heeft een eigen quotum, maar antwoordt ook 503); de signalen blijven vertrekken (het
//   versturen op de eigen minuut schrijft niets; alleen het bijhouden van weigeringen en tellingen en de inhaalregel vallen dan
//   stil tot middernacht UTC). De volgorde van
//   schrijven (BESLISSING 641) zorgt ervoor dat een poging die botst op de dagteller niets schrijft. Een strikte teller in een
//   Durable Object staat gepland voor een volgende versie.
//   Leesopdrachten (100.000 per dag; herzien na de beveiligingsnalezing van 18 november): eerst de rem in het geheugen (0
//   leesopdrachten, zie geheugenRem). Dan een aanmelding hoogstens 1 (het eigen adres) + 1 (k:lijst) + 2 (rem en dagteller)
//   + 2 x MAX_WIS_POGINGEN + 1 (een dienst) + 1 (de dagteller opnieuw) + 1 (k:lijst opnieuw) = 12 (hoogstens); een verzoek dat de rem of de
//   dagteller weigert er 4; een volle dienst zonder kandidaat 2, met kandidaten die niet wisbaar zijn hoogstens 2 + 2 + 3 + 3 = 10 (eigen adres en k:lijst, rem en dagteller, 3 kandidaten, tot 3 diensten),
//   en daarna 60 seconden lang 1 (de "vol"-stand); k:lijst ontbreekt: 2 en 503, geen lijstopvraging; afmelden 2; GET /gezond
//   hoogstens 1 per isolate per minuut. Het pad 'vol' vanaf één IP, in één isolate: hoogstens GEHEUGEN.perUur = 30 verzoeken per
//   uur. De "vol"-stand duurt maar 60 seconden: wie elke 61 seconden een verzoek stuurt, betaalt telkens het volle pad. Zonder
//   kandidaten 30 x 2 = 60 per uur (1440 per dag), in het ergste geval 30 x 10 = 300 per uur (7200 per dag); was: onbeperkt. Het ergste geval
//   blijft een aanvaller met veel IP-adressen of veel isolates: met de "vol"-stand ongeveer 1 per verzoek (2 zonder), dus tegen
//   de 100.000 verzoeken per dag van Workers zelf aan; dat is het plafond van het gratis plan, niet van deze code. Het signaal per run: k:lijst, v:verstuurd en elk abonnement één
//   keer (2 + N), plus 1 vlak voor elke schrijfopdracht op een abonnement en hoogstens 4 diensten. Een rustige run (niets te doen)
//   kost dus 2 + N leesopdrachten en geen enkele schrijfopdracht, en de gelijkzetting leest k:lijst vlak voor het schrijven nog eens
//   (1 erbij in de run van elk kwartier, 96 per dag): met N = 10 is dat 12 x 1440 + 96 = 17.376 per dag, met 30 abonnementen
//   (na een golf) 32 x 1440 + 96 = 46.176. Daarbovenop de verzoeken; ook een geweigerd verzoek kost er 1 tot 4, dus wie 30.000 verzoeken per
//   dag stuurt, maakt de leesopdrachten op (dat was voor 713 ook zo, met wat meer marge; het verweer is hetzelfde als tegen de
//   100.000 verzoeken per dag: geen op het gratis abonnement). Workers: 1440 cron-aanroepen per dag van de 100.000 verzoeken;
//   CPU per run ruim onder de 10 ms (een handvol JSON-waarden en tijden, en één ES256-handtekening per signaal).

const UUR_MS = 3600 * 1000;
const DAG_MS = 24 * UUR_MS;
const utcDag = (nu) => new Date(nu).toISOString().slice(0, 10);
// Retry-After (in hele seconden, minstens 1) bij een 429 'later': wanneer de grens die weigerde weer vrij is. De rem per IP telt
// per heel uur, de dagteller en de wijzigingen per UTC-dag. Zo probeert de app niet blind opnieuw.
const secondenTot = (nu, eenheid) => String(Math.max(1, Math.ceil(((Math.floor(nu / eenheid) + 1) * eenheid - nu) / 1000)));
const later = (cors, nu, eenheid) => fout(429, 'later', { ...cors, 'Retry-After': secondenTot(nu, eenheid) });

// Een sleutel per IP en per uur, zonder het IP zelf: HMAC-SHA-256 met een geheim (REM_ZOUT, anders de private VAPID-sleutel), zodat
// de hash niet terug te rekenen is door alle 2^32 IPv4-adressen te proberen. Het uur zit in de hash: elk uur een andere sleutel, en
// de waarde verdwijnt vanzelf (TTL). Cloudflare zet CF-Connecting-IP op elk verzoek; ontbreekt hij, dan één gedeelde emmer.
// Ontbreken beide geheimen, dan is er geen veilige sleutel: dan aanvaardt de dienst geen nieuwe aanmeldingen (503, zie verwerk).
const remGeheim = (env) => env.REM_ZOUT || env.VAPID_PRIVE || null;
// Het kenmerk is hetzelfde als dat van de rem in het geheugen (remSleutelGeheugen): een IPv6-adres telt per /64-blok, IPv4 als geheel,
// anders omzeilt een aanvaller met een /64-blok de 5 aanmeldingen per uur. Er komt nog altijd alleen een HMAC in KV, nooit een adres.
// De bestaande rijen r:* zijn rem-rijen met een korte levensduur (hoogstens een uur): een andere sleutel voor IPv6 is geen probleem.
export async function remSleutel(verzoek, env, nu) {
  const ip = remSleutelGeheugen(verzoek.headers.get('CF-Connecting-IP') || 'onbekend');
  const geheim = await crypto.subtle.importKey(
    'raw',
    encoder.encode('bloei-rem|' + remGeheim(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', geheim, encoder.encode(Math.floor(nu / UUR_MS) + '|' + ip)));
  return 'r:' + [...mac.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const telVan = (ruw) => {
  const n = Number(ruw);
  return ruw !== null && Number.isInteger(n) && n >= 0 ? n : 0;
};

// ---- Rem in het geheugen van de isolate (bevinding van de beveiligingsnalezing van 18 november) ----
// Een geweigerde aanmelding schrijft niets (BESLISSING 641), dus de rem r:... in KV telt die niet. Zonder deze rem kon één IP op
// een volle dienst onbeperkt leesopdrachten verbruiken (vroeger 8 per verzoek) en zo de 100.000 leesopdrachten van de dag opmaken:
// dan vertrekt er tot middernacht UTC geen enkele herinnering meer. Deze rem staat VOOR elke KV-opdracht en gebruikt zelf geen KV:
//  - per IP hoogstens GEHEUGEN_PER_MINUUT verzoeken per minuut en GEHEUGEN_PER_UUR per uur (429 'later' met Retry-After). Het IP
//    staat alleen als sleutel in een Map in het geheugen, wordt nooit bewaard of gelogd, en de Map telt hoogstens GEHEUGEN_MAX_IPS
//    rijen (de oudste valt eerst weg);
//  - een "vol"-stand: weigerde de dienst een nieuwe aanmelding omdat hij vol zit, dan weigert deze isolate de volgende 60 seconden
//    elke nieuwe aanmelding met 429 'vol' na één leesopdracht (het eigen adres: een bestaand toestel mag zijn uren nog wijzigen),
//    zonder de rem, de dagteller, k:lijst of kandidaten te lezen. Een afmelding in deze isolate heft de stand op.
// EERLIJK: dit is een dempende maatregel, geen harde grens. Cloudflare kan een isolate elk moment vervangen, en verzoeken van één
// IP kunnen over meer isolates en locaties verdeeld raken; elke nieuwe isolate begint met een lege Map. Ergste geval per IP en per
// isolate: 30 verzoeken per uur, en omdat de "vol"-stand maar 60 seconden duurt, betaalt wie elke 61 seconden
// een verzoek stuurt telkens het volle pad: 30 x 2 = 60 per uur (1440 per dag) zonder kandidaten, hoogstens 30 x 10 = 300 per uur
// (7200 per dag). Hetzelfde als het dagtotaal van nieuwe aanmeldingen bereikt is ("dag vol"-stand: elk volgend verzoek
// 1 leesopdracht, het eigen adres, tot middernacht UTC). Een afmelding valt ook onder de rem: zonder juist geheim kost ze 1
// leesopdracht, zonder rem dus onbeperkt. Een IPv6-adres telt per /64-blok, en een rij van een voorbij uur wordt opgeruimd. Er zijn dus tientallen IP-adressen nodig (ongeveer 14 in het ergste geval, 70 zonder kandidaten) om de 100.000 van de dag
// te halen; wie zoveel
// IP-adressen heeft, kan ook de 100.000 verzoeken per dag van Workers zelf opmaken, en daar helpt op het gratis plan niets tegen.
// De grenzen staan in een object zodat de oudere tests (die veel verzoeken van één IP sturen om andere grenzen te bewijzen) ze
// kunnen ophogen; de nieuwe tests zetten ze terug op deze standaard.
export const GEHEUGEN_STANDAARD = Object.freeze({ perMinuut: 6, perUur: 30, volMs: 60 * 1000 });
export const GEHEUGEN = { ...GEHEUGEN_STANDAARD };
const GEHEUGEN_MAX_IPS = 5000;
// Hoeveel rijen van een voorbij uur elke aanroep hoogstens opruimt (de run van elke minuut ruimt alles op).
const GEHEUGEN_OPRUIMEN = 20;
const geheugen = { ips: new Map(), volVan: 0, volTot: 0, dagVolTot: 0, gezond: null, lijst: null };
// Alleen voor de tests: een verse isolate nabootsen.
export function wisGeheugen() {
  geheugen.ips.clear();
  geheugen.volTot = 0;
  geheugen.dagVolTot = 0;
  geheugen.gezond = null;
  geheugen.lijst = null;
}
// Alleen voor de tests: hoeveel adressen de rem in het geheugen nu kent, en onder welke sleutels.
export const geheugenSleutels = () => [...geheugen.ips.keys()];
// De sleutel van de rem in het geheugen: een IPv4-adres als geheel, een IPv6-adres op zijn /64-voorvoegsel (de eerste vier groepen),
// want wie één IPv6-aansluiting heeft, krijgt doorgaans een heel /64-blok en kan anders elk verzoek van een ander adres sturen.
// Ook de verkorte schrijfwijze met :: telt juist; een IPv4-adres in IPv6-vorm (::ffff:a.b.c.d) telt als dat IPv4-adres.
export function remSleutelGeheugen(ip) {
  const adres = String(ip).trim().toLowerCase().split('%')[0];
  if (!adres.includes(':')) return adres;
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(adres);
  if (v4) return v4[1];
  const delen = adres.split('::');
  const voor = delen[0] ? delen[0].split(':') : [];
  let groepen = voor;
  if (delen.length > 1) {
    const na = delen[1] ? delen[1].split(':') : [];
    groepen = [...voor, ...Array(Math.max(0, 8 - voor.length - na.length)).fill('0'), ...na];
  }
  while (groepen.length < 4) groepen.push('0');
  return groepen.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':') + '::/64';
}
// Rijen van een voorbij uur weg: een adres blijft zo hoogstens ongeveer een uur in het geheugen. De Map staat op volgorde van het
// laatste gebruik (elke rij wordt bij gebruik achteraan opnieuw gezet), dus de oudste rijen staan vooraan.
export function ruimGeheugenOp(nu, hoogstens = Infinity) {
  const uur = uurVan(nu);
  let n = 0;
  for (const [ip, r] of geheugen.ips) {
    if (n >= hoogstens || r.uur >= uur) break;
    geheugen.ips.delete(ip);
    n += 1;
  }
}
// Geeft null als het verzoek door mag, anders de eenheid (MINUUT_MS of UUR_MS) voor Retry-After.
function geheugenRem(verzoek, nu) {
  const ip = remSleutelGeheugen(verzoek.headers.get('CF-Connecting-IP') || 'onbekend');
  const uur = uurVan(nu);
  const minuut = minuutVan(nu);
  ruimGeheugenOp(nu, GEHEUGEN_OPRUIMEN);
  let r = geheugen.ips.get(ip);
  if (!r || r.uur !== uur) r = { uur, nUur: 0, minuut, nMin: 0 };
  if (r.minuut !== minuut) {
    r.minuut = minuut;
    r.nMin = 0;
  }
  if (r.nUur >= GEHEUGEN.perUur) return UUR_MS;
  if (r.nMin >= GEHEUGEN.perMinuut) return MINUUT_MS;
  r.nMin += 1;
  r.nUur += 1;
  geheugen.ips.delete(ip);
  geheugen.ips.set(ip, r);
  while (geheugen.ips.size > GEHEUGEN_MAX_IPS) geheugen.ips.delete(geheugen.ips.keys().next().value);
  return null;
}

// ---- GET /gezond: kan de dienst signalen sturen? 204 als de VAPID-sleutel te importeren is en k:lijst leesbaar is en bestaat,
// anders 503. Geen lichaam, geen geheim, geen gegevens. Alleen zonder Origin (curl van de eigenaar) of met de toegelaten Origin.
// Valt onder de rem in het geheugen, en het antwoord wordt 60 seconden in de isolate bewaard: hoogstens één leesopdracht per
// isolate per minuut (1440 per dag per isolate), dus geen aanvalsvlak op de leesgrens dat groter is dan de aanmelding.
async function gezond(env, nu, koppen) {
  if (!geheugen.gezond || geheugen.gezond.tot <= nu) {
    let ok = false;
    try {
      await importeerSleutel(env.VAPID_PRIVE, env.VAPID_PUBLIEK);
      ok = (await env.ABONNEMENTEN.get(LIJST)) !== null;
    } catch {
      ok = false;
    }
    geheugen.gezond = { tot: nu + 60 * 1000, ok };
  }
  return new Response(null, { status: geheugen.gezond.ok ? 204 : 503, headers: koppen });
}

export async function verwerk(verzoek, env, nu = Date.now()) {
  const url = new URL(verzoek.url);
  const origin = verzoek.headers.get('Origin');
  if (url.pathname === '/gezond') {
    if (verzoek.method !== 'GET') return fout(405, 'methode');
    if (origin !== null && (!env.TOEGELATEN_ORIGIN || origin !== env.TOEGELATEN_ORIGIN)) return fout(403, 'verboden');
    const koppen = origin === null ? VASTE_KOPPEN : corsKoppen(origin);
    const eenheid = geheugenRem(verzoek, nu);
    if (eenheid) return later(koppen, nu, eenheid);
    return gezond(env, nu, koppen);
  }
  if (url.pathname !== '/abonnement') return fout(404, 'niet-gevonden');
  if (!['POST', 'DELETE', 'OPTIONS'].includes(verzoek.method)) return fout(405, 'methode');
  // Alleen de app zelf: een andere (of ontbrekende) Origin wordt geweigerd, ook bij OPTIONS.
  if (!env.TOEGELATEN_ORIGIN || origin !== env.TOEGELATEN_ORIGIN) return fout(403, 'verboden');
  const cors = corsKoppen(origin);
  if (verzoek.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  // De rem in het geheugen, voor elke KV-opdracht.
  const eenheid = geheugenRem(verzoek, nu);
  if (eenheid) return later(cors, nu, eenheid);

  const body = await leesBody(verzoek);
  if (body.fout) return fout(body.fout === 'te-groot' ? 413 : 400, body.fout, cors);

  // Een bestaand abonnement wissen of overschrijven kan alleen wie naast het endpoint ook het auth-geheim van dat abonnement kent.
  // Klopt het geheim niet (of ontbreekt het), dan gebeurt er niets en is het antwoord hetzelfde als bij een onbekend abonnement.
  if (verzoek.method === 'DELETE') {
    const endpoint = body.json?.endpoint;
    if (!isToegelatenEndpoint(endpoint)) return fout(400, 'ongeldig', cors);
    const sleutel = await sleutelVan(endpoint);
    const bewaard = await leesBewaard(env, sleutel);
    if (bewaard && gelijkGeheim(body.json?.auth, bewaard.abonnement?.keys?.auth)) {
      await env.ABONNEMENTEN.delete(sleutel);
      geheugen.volTot = 0;
      // Meteen een plaats vrij (anders pas na het volgende kwartier): k:lijst zonder dit abonnement. Staat het er niet in (of
      // ontbreekt de lijst), dan niets schrijven; de gelijkzetting per kwartier zet de lijst weer exact.
      const lijst = leesLijst(await env.ABONNEMENTEN.get(LIJST));
      if (lijst?.some(([naam]) => naam === sleutel)) await schrijfLijst(env, lijst.filter(([naam]) => naam !== sleutel));
    }
    return new Response(null, { status: 204, headers: cors });
  }

  const schoon = schoonAbonnement(body.json);
  if (!schoon) return fout(400, 'ongeldig', cors);
  const sleutel = await sleutelVan(schoon.abonnement.endpoint);
  const { value: ruwBewaard, metadata: oudeMeta } = await env.ABONNEMENTEN.getWithMetadata(sleutel);
  const bewaard = await leesBewaard(env, sleutel, ruwBewaard);
  const vanMij = bewaard !== null && gelijkGeheim(schoon.abonnement.keys.auth, bewaard.abonnement?.keys?.auth);
  // Een nieuw abonnement mag er alleen bij zolang de dienst niet vol zit. De Origin-controle houdt een script buiten de browser niet
  // tegen; deze grens wel: de opslag kan niet worden volgeschreven en het signaal blijft binnen de grenzen van de Worker.
  // (Een kapotte bewaarde waarde telt als een bestaande plaats en mag overschreven worden.)
  const vrijePlaatsNodig = ruwBewaard === null || (bewaard !== null && !vanMij);
  // Zonder geheim voor de rem geen nieuwe aanmeldingen: een vaste tekst als HMAC-sleutel maakt de hash van een IP terug te rekenen.
  // Bijwerken en afmelden van een bestaand toestel blijven werken.
  if (vrijePlaatsNodig && !remGeheim(env)) return fout(503, 'tijdelijk', cors);
  // De "vol"-stand in het geheugen (zie geheugenRem): geen enkele leesopdracht meer behalve die van het eigen adres hierboven.
  if (vrijePlaatsNodig && geheugen.volVan <= nu && nu < geheugen.volTot) return fout(429, 'vol', cors);
  // De "dag vol"-stand in het geheugen: is het dagtotaal van nieuwe aanmeldingen bereikt, dan weigert deze isolate tot middernacht
  // UTC elke nieuwe aanmelding na alleen de leesopdracht van het eigen adres (een bestaand toestel mag zijn uren nog wijzigen).
  if (vrijePlaatsNodig && nu < geheugen.dagVolTot) return later(cors, nu, DAG_MS);
  // Het pad 'vol' zo goedkoop mogelijk: eerst k:lijst (1 leesopdracht). Zit de dienst vol en staat er geen kandidaat in die oud
  // genoeg is om plaats te maken (BESLISSING 630, voorwaarde 1, alleen uit k:lijst), dan meteen 429 'vol': 2 leesopdrachten in
  // plaats van 8. Ontbreekt k:lijst, dan 503 'tijdelijk' zonder lijstopvraging (leesLijstVoorAanmelding).
  const lijst = vrijePlaatsNodig ? await leesLijstVoorAanmelding(env) : [];
  if (lijst === null) return fout(503, 'tijdelijk', cors);
  const aantal = lijst.length;
  const isVol = vrijePlaatsNodig && aantal >= maxAbonnementen(env);
  const kandidatenLijst = isVol ? nooitGeslaagdVan(lijst).filter(([, a]) => uurVan(nu) - a > PROEF_UREN) : [];
  if (isVol && kandidatenLijst.length === 0) {
    geheugen.volVan = nu;
    geheugen.volTot = nu + GEHEUGEN.volMs;
    return fout(429, 'vol', cors);
  }
  // De rem op nieuwe aanmeldingen (per IP en per uur) en de grens per dag, als eerste: een verzoek dat hier stopt, kost geen
  // leesopdrachten voor de telling of voor het zoeken naar een plaats. Ook een bestaand endpoint met een ander geheim krijgt
  // dezelfde behandeling als een nieuw abonnement. Een afgewezen verzoek schrijft niets.
  let rem = null;
  let dag = null;
  if (vrijePlaatsNodig) {
    rem = { sleutel: await remSleutel(verzoek, env, nu) };
    rem.aantal = telVan(await env.ABONNEMENTEN.get(rem.sleutel));
    dag = { sleutel: 'n:' + utcDag(nu) };
    // De dagteller met zijn merk (zie neemDagteller hieronder): zelfde leesopdracht, de metadata komt gratis mee.
    const { value, metadata: dagMeta } = await env.ABONNEMENTEN.getWithMetadata(dag.sleutel);
    dag.ruw = value ?? null;
    dag.merk = dagMeta?.m ?? null;
    dag.aantal = telVan(dag.ruw);
    if (dag.aantal >= NIEUW_PER_DAG) {
      geheugen.dagVolTot = (Math.floor(nu / DAG_MS) + 1) * DAG_MS;
      return later(cors, nu, DAG_MS);
    }
    if (rem.aantal >= REM_PER_UUR) return later(cors, nu, UUR_MS);
  }
  // Het aantal is de lengte van k:lijst (één leesopdracht), niet een lijstopvraging: het gratis abonnement van KV laat maar 1000
  // lijstopvragingen per dag toe, en die heeft de gelijkzetting nodig. Zo kan een stroom aanmeldingen op een volle dienst het
  // signaal niet stilleggen. (Alleen zolang k:lijst nog niet bestaat, na de uitrol van 713 tot de eerste run, telt een aanmelding
  // met een lijstopvraging.)
  // Vol: eerst kijken of er een abonnement plaats kan maken (BESLISSING 630, de vier voorwaarden hierboven). Het wissen zelf
  // gebeurt pas hieronder, als de aanmelding ook echt doorgaat. Geen kandidaat: 429 zoals altijd, en de "vol"-stand.
  let teWissen = null;
  if (isVol) {
    [teWissen = null] = await zoekWisbaar(env, nu, kandidatenLijst, new Map());
    if (!teWissen) {
      geheugen.volVan = nu;
      geheugen.volTot = nu + GEHEUGEN.volMs;
      return fout(429, 'vol', cors);
    }
  }
  // BESLISSING 641: de volgorde van schrijven. KV kent geen atomaire teller: bij een golf gelijktijdige aanmeldingen lezen ze
  // allemaal dezelfde stand van de dagteller en de telling. Daarom schrijft een aanmelding eerst de sleutels die ze met alle andere
  // deelt, en pas daarna wat van haar alleen is:
  //  1. de dagteller (gedeeld door de hele dienst). KV aanvaardt hoogstens één schrijfopdracht per seconde per sleutel: bij een golf
  //     botst hier bijna elk verzoek, en dan is er nog niets geschreven (de fout geeft 503);
  //  2. de dagteller opnieuw lezen: staat er het merk van een ander verzoek, dan schreef iemand anders tussen ons lezen en schrijven.
  //     Dan stopt dit verzoek met 503 en schrijft het verder niets (geen telling, geen rem, geen abonnement). Zo komt er per ronde
  //     gelijktijdige verzoeken meestal één door; niet gegarandeerd, want een verzoek dat zijn dagteller al opnieuw las voor een ander
  //     schreef gaat ook door, en een verliezer kan de dagteller één hoger laten staan, zonder rem en zonder abonnement. Staat er nog de oude stand (een trage kopie van KV), dan gaat het verder: een
  //     eerlijk verzoek wordt nooit geweigerd omdat KV zijn eigen schrijfopdracht nog niet toont. Kost één leesopdracht, geen
  //     schrijfopdracht;
  //  3. het wissen van het abonnement dat plaats maakt (als dat nodig is), en k:lijst (ook gedeeld; BESLISSING 713, voorheen de
  //     telling t:aantal);
  //  4. de rem van dit IP en dan het abonnement zelf (van dit verzoek alleen; die botsen niet met andere IP-adressen).
  // Dit maakt de wedloop kleiner, niet onmogelijk: een verzoek op een andere plaats van het Cloudflare-net kan tot een minuut een
  // oude stand van de dagteller lezen en ziet dan bij het opnieuw lezen gewoon zijn eigen merk. Een strikte teller (een Durable
  // Object) staat gepland voor een volgende versie.
  const neemDagteller = async () => {
    const merk = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await env.ABONNEMENTEN.put(dag.sleutel, String(dag.aantal + 1), { expirationTtl: 2 * 24 * 3600, metadata: { m: merk } });
    const { value, metadata: m } = await env.ABONNEMENTEN.getWithMetadata(dag.sleutel);
    const gelezen = m?.m ?? null;
    return gelezen === merk || ((value ?? null) === dag.ruw && gelezen === dag.merk);
  };
  const schrijfRem = () => env.ABONNEMENTEN.put(rem.sleutel, String(rem.aantal + 1), { expirationTtl: 2 * 3600 });
  // Bestaat het al met een ander geheim: niets overschrijven en niets wissen, maar wel hetzelfde antwoord en dezelfde rem en
  // dagteller als voor een nieuw abonnement (in dezelfde volgorde), zodat de rem niet verraadt of een adres al bestaat.
  if (bewaard !== null && !vanMij) {
    if (!(await neemDagteller())) return fout(503, 'tijdelijk', cors);
    await schrijfRem();
    return new Response(null, { status: 204, headers: cors });
  }
  const nieuw = JSON.stringify(schoon);
  // Niets veranderd: niet opnieuw schrijven (het gratis abonnement laat 1000 schrijfopdrachten per dag toe).
  if (vanMij && ruwBewaard === nieuw) return new Response(null, { status: 204, headers: cors });
  if (ruwBewaard === null) {
    // De volgorde hierboven (BESLISSING 641): eerst de gedeelde sleutels, dan wat van dit verzoek alleen is. Lukt een schrijfopdracht
    // niet (te veel tegelijk), dan volgt er niets meer: geen rem en geen abonnement.
    if (!(await neemDagteller())) return fout(503, 'tijdelijk', cors);
    if (teWissen) await env.ABONNEMENTEN.delete(teWissen);
    // k:lijst vlak voor het schrijven opnieuw lezen: wat een ander verzoek of de gelijkzetting intussen schreef, gaat zo minder snel
    // verloren. Dit abonnement erbij, en het abonnement dat plaats maakte eruit. Een schrijfopdracht, ook bij plaats maken.
    const vers = leesLijst(await env.ABONNEMENTEN.get(LIJST)) ?? lijst;
    await schrijfLijst(env, [...vers.filter(([naam]) => naam !== sleutel && naam !== teWissen), [sleutel, uurVan(nu)]]);
    await schrijfRem();
    await env.ABONNEMENTEN.put(sleutel, nieuw, { metadata: metadata(schoon, { a: uurVan(nu), v: minuutVan(nu) }) });
    return new Response(null, { status: 204, headers: cors });
  }
  // Een bestaand abonnement bijwerken: hoogstens WIJZIGINGEN_PER_DAG keer per dag, en een lopende reeks weigeringen blijft staan
  // (anders ontloopt wie een nepabonnement bezit het opruimen door telkens de uren te wijzigen).
  const m = oudeMeta ?? {};
  const vandaag = utcDag(nu);
  const w = m.d === vandaag && Number.isInteger(m.w) ? m.w : 0;
  // De teller hoort bij de UTC-datum (d): een abonnement dat gisteren of eerder aan de grens zat, begint vandaag weer bij 0. Een
  // hogere grens geldt meteen ook voor een abonnement dat vandaag al aan de oude grens zat.
  if (w >= WIJZIGINGEN_PER_DAG) return later(cors, nu, DAG_MS);
  const reeks = Number.isInteger(m.f) && m.f > 0 ? { f: m.f, ff: m.ff } : {};
  // Ook het uur van aanmelding en de vlag "ooit geslaagd" blijven staan: uren wijzigen maakt een abonnement niet jonger, en een
  // abonnement zonder a (van voor BESLISSING 630) krijgt er geen.
  const herkomst = { ...(Number.isInteger(m.a) ? { a: m.a } : {}), ...(m.g === 1 ? { g: 1 } : {}) };
  await env.ABONNEMENTEN.put(sleutel, nieuw, { metadata: metadata(schoon, { ...herkomst, ...reeks, d: vandaag, w: w + 1, v: minuutVan(nu) }) });
  return new Response(null, { status: 204, headers: cors });
}

// k:lijst voor een aanmelding, of null als ze ontbreekt of onleesbaar is. NOOIT een lijstopvraging: anders kon een stroom
// anonieme verzoeken zolang k:lijst ontbreekt (na de eerste uitrol) de 1000 lijstopvragingen van de dag opmaken, en dan kon de run
// k:lijst nooit bouwen. Ontbreekt ze, dan antwoordt de aanmelding 503 'tijdelijk' en probeert de app later opnieuw.
async function leesLijstVoorAanmelding(env) {
  return leesLijst(await env.ABONNEMENTEN.get(LIJST));
}

// De bewaarde waarde als object, of null (ook bij kapotte JSON).
async function leesBewaard(env, sleutel, ruw) {
  const tekst = ruw === undefined ? await env.ABONNEMENTEN.get(sleutel) : ruw;
  if (tekst === null || tekst === undefined) return null;
  try {
    return typeof tekst === 'string' ? JSON.parse(tekst) : tekst;
  } catch {
    return null;
  }
}

// Een persoonlijke app heeft een handvol toestellen. Standaard 10; aan te passen met de variabele MAX_ABONNEMENTEN.
export const STANDAARD_MAX_ABONNEMENTEN = 10;
function maxAbonnementen(env) {
  const n = Number(env.MAX_ABONNEMENTEN);
  return Number.isInteger(n) && n > 0 ? n : STANDAARD_MAX_ABONNEMENTEN;
}

// Stuurt één leeg pushsignaal. Geeft de statuscode terug (of 0 bij een netwerkfout).
export async function stuurSignaal(endpoint, sleutel, env, nu = Date.now()) {
  try {
    const antwoord = await fetch(endpoint, {
      method: 'POST',
      headers: {
        TTL: '3600',
        Urgency: 'normal',
        Authorization: await vapidKop(sleutel, { endpoint, onderwerp: env.VAPID_ONDERWERP, publiek: env.VAPID_PUBLIEK, nu }),
        'Content-Length': '0',
      },
      // Een pushdienst stuurt nooit door: een omleiding volgen zou de Worker naar een ander adres kunnen sturen.
      redirect: 'manual',
    });
    return antwoord.status;
  } catch {
    return 0;
  }
}

// Wat een antwoord van de pushdienst betekent (OW-01a):
// - 404 en 410: het abonnement bestaat niet meer (RFC 8030 §7.3; Apple 410 "The device token has expired"; Mozilla 404/410
//   "should not be used again"; web.dev: verwijderen): meteen wissen.
// - 400, 401 en 403: verzoek of VAPID-handtekening geweigerd. Dat kan aan het abonnement liggen (verzonnen adres, ander
//   sleutelpaar), maar evengoed aan ONZE instelling (RFC 8292 §4.2: 401/403 bij ontbrekende of ongeldige authenticatie; Apple 403
//   "error with your authentication" o.a. BadJwtToken, VapidPkHashMismatch, en 400 "Bad request"; FCM UnauthorizedRegistration).
//   Dus niet meteen wissen: pas na WEIGER_DREMPEL weigeringen op rij waarvan de eerste meer dan WEIGER_MIN_UREN hele uren
//   geleden was, EN als dezelfde pushdienst de laatste PROEF_UREN uur nog een signaal aan een ander toestel aanvaardde, in een
//   later uur dan de eerste weigering van de reeks (voorwaarde 3 en 4 van BESLISSING 630, hierboven). Weigert de dienst alles
//   (een fout in onze VAPID-instelling, of de dienst blokkeert ons), dan wordt er zo niets gewist, hoe lang het ook duurt.
//   (Voorwaarde 4 volgt hier al uit voorwaarde 3, zolang WEIGER_MIN_UREN niet kleiner is dan PROEF_UREN: de eerste weigering ligt
//   dan vóór het venster van 48 uur. Ze blijft staan als vangnet voor wie de getallen ooit wijzigt.) En per
//   run hoogstens een kwart van de abonnementen (minstens één). Een echt toestel dat zo toch verdwijnt, meldt zich bij de volgende
//   start van de app vanzelf opnieuw aan (werkUrenBij in src/meldingen/push.js).
// - al het andere (429, 5xx, netwerkfout): tijdelijk; telt niet mee en breekt de reeks niet.
// ff staat als heel uur (niet fijner dan nodig). Het verschil in hele uren moet groter zijn dan WEIGER_MIN_UREN, dus ligt er
// altijd echt meer dan 48 uur tussen de eerste weigering en het wissen.
export const WEIGER_DREMPEL = 3;
export const WEIGER_MIN_UREN = 48;
export const WEIGER_MIN_MS = WEIGER_MIN_UREN * UUR_MS;
const isWeigering = (status) => status === 400 || status === 401 || status === 403;

// Schrijft de metadata van één abonnement bij zonder een wijziging of afmelding die intussen binnenkwam ongedaan te maken: vlak
// ervoor opnieuw lezen; bestaat het niet meer, dan niets schrijven; anders de verse waarde met de verse metadata, waarin pas()
// alleen g, f en ff (en a bij de eerste geslaagde melding) aanpast. pas() geeft null als er niets te schrijven is.
// Geeft false als het abonnement niet meer bestaat.
async function werkBij(env, naam, pas) {
  const { value, metadata } = await env.ABONNEMENTEN.getWithMetadata(naam);
  if (value === null) return false;
  const nieuw = pas(metadata ?? {});
  if (nieuw) await env.ABONNEMENTEN.put(naam, value, { metadata: nieuw });
  return true;
}
const zonderReeks = (m) => {
  const { f: _f, ff: _ff, ...rest } = m;
  return rest;
};

// ---- De inhaalregel (BESLISSING 713): liever een melding een paar minuten te laat dan geen. ----
// Elke run stuurt naar wie op zijn eigen minuut een uur heeft. Daarnaast haalt hij in wat de laatste INHAAL_MINUTEN minuten
// gemist werd: een run die niet liep (bv. tot 15 minuten na een uitrol die de cron opnieuw zet, zie README), of een uur dat net
// gekozen was en dat KV op die minuut nog niet overal toonde (tot een minuut). Om niets twee keer te sturen, staat in v:verstuurd
// welke abonnementen de laatste INHAAL_MINUTEN minuten op welke minuut een signaal kregen (per abonnement 8 tekens van zijn
// sleutel, een stuk van een hash: geen adres, geen uur dat niet al in zijn metadata staat). Regels:
//  - inhalen gebeurt pas twee minuten later (tot minuut - 2): KV toont een schrijfopdracht na ongeveer een minuut overal, dus de run
//    van twee minuten later ziet wat de vorige runs vastlegden. Een gemiste minuut komt zo 2 tot INHAAL_MINUTEN minuten te laat;
//  - een run legt eerst vast en stuurt daarna. Lukt het vastleggen niet (een fout van KV, of MAX_VERSTUURD_PER_DAG is op), dan
//    stuurt hij alleen naar wie op deze minuut een uur heeft en haalt hij niets in. Zo geeft een opslag die niet meer schrijft
//    (het dagquotum is op) nooit een reeks dubbele meldingen;
//  - niet inhalen wat voor de laatste aanmelding of wijziging van het abonnement lag (v): wie om 18:10 een herinnering om 18:05
//    kiest, krijgt die niet meteen. Wie om 18:05:30 18:05 kiest, krijgt ze wel (om 18:07);
//  - niet inhalen van voor middernacht UTC (de grens van het dagquotum en van MAX_VERSTUURD_PER_DAG: wat toen niet vastgelegd kon
//    worden, staat er niet in), en niet van voor v:verstuurd bestond (b). Na de uitrol van 713 haalt de dienst dus pas in vanaf
//    het eerste signaal dat hij zelf stuurde;
//  - per abonnement hoogstens één signaal per run, ook als er twee minuten tegelijk te sturen zijn (de app kiest de tekst zelf).
// Wat dit niet dekt: dezelfde minuut die twee keer bijna tegelijk loopt (de tweede ziet de eerste misschien nog niet), en een
// vastlegging die mislukt terwijl een latere run wel schrijft: dan hoogstens één dubbele melding per herinnering.
const VERSTUURD = 'v:verstuurd';
export const INHAAL_MINUTEN = 15;
export const MAX_VERSTUURD_PER_DAG = 40;
const kortVan = (naam) => naam.slice(SLEUTEL_VOORVOEGSEL.length, SLEUTEL_VOORVOEGSEL.length + 8);
function leesVerstuurd(ruw) {
  if (ruw === null || ruw === undefined) return null;
  try {
    const s = JSON.parse(ruw);
    if (!s || typeof s !== 'object' || !Number.isInteger(s.b) || typeof s.d !== 'string' || !Number.isInteger(s.n)) return null;
    const l = {};
    for (const [t, namen] of Object.entries(s.l ?? {})) {
      if (/^\d+$/.test(t) && Array.isArray(namen)) l[t] = namen.filter((x) => typeof x === 'string');
    }
    const o = Array.isArray(s.o) ? s.o.filter((x) => Number.isInteger(x)) : [];
    return { b: s.b, d: s.d, n: s.n, l, m: Number.isInteger(s.m) ? s.m : null, o };
  } catch {
    return null;
  }
}

// De run van één minuut (minuten sinds 1970 uit de geplande tijd van de cron, dus ook een run die te laat start, doet zijn eigen
// minuut). Geeft de statuscodes van de verstuurde signalen.
export async function verstuurHerinneringen(env, nu = new Date()) {
  const tijd = nu.getTime();
  const minuut = minuutVan(tijd);
  const uurNu = uurVan(tijd);
  // De rem in het geheugen: rijen van een voorbij uur weg, ook als er geen verzoeken komen.
  ruimGeheugenOp(tijd);
  const verstuurd = [];
  const kandidaten = [];
  // Per pushdienst het uur van de laatste 2xx (gelezen en bijgewerkt in deze run).
  const dienstUren = new Map();
  // 1. Welke abonnementen er zijn: k:lijst. Elk kwartier, en als ze ontbreekt (de eerste run na de uitrol van 713), opnieuw
  // opgebouwd uit een lijstopvraging (96 per dag).
  // Wat misloopt zonder de run te stoppen, wordt hier verzameld; na het boekhouden gooit de run een fout, zodat Cron Events
  // "Exception" toont in plaats van een run die stil niets deed (geen logboek: alleen een vaste foutcode, geen gegevens).
  const fouten = new Set();
  // Kan k:lijst niet gelezen worden (bv. de 100.000 leesopdrachten van de dag zijn op), dan verder met de laatste lijst die deze
  // isolate kende (geheugen.lijst), en anders meteen een fout: zonder leesopdrachten kan geen enkel adres gelezen worden.
  let ruwBegin = null;
  let leesfout = false;
  try {
    ruwBegin = await env.ABONNEMENTEN.get(LIJST);
  } catch {
    leesfout = true;
    fouten.add('k:lijst-onleesbaar');
  }
  let lijst = leesfout ? geheugen.lijst : leesLijst(ruwBegin);
  const ontbrak = !leesfout && lijst === null;
  const gelijkzetten = ontbrak || minuut % 15 === 0;
  const namenBegin = new Set((lijst ?? []).map(([naam]) => naam));
  if (gelijkzetten && !leesfout) {
    try {
      lijst = await bouwLijst(env, lijst);
    } catch {
      // Een fout van de opslag (bv. de lijstopvragingen van vandaag zijn op): verder met de bewaarde lijst, of met de laatste lijst
      // die deze isolate kende. Zo blijven de signalen vertrekken en schrijft de gelijkzetting k:lijst toch.
      if (ontbrak) {
        fouten.add('lijstopvraging-mislukt');
        lijst = geheugen.lijst;
      }
    }
  }
  if (lijst === null) throw new Error('bloei: geen lijst van abonnementen (' + [...fouten].join(', ') + ')');
  geheugen.lijst = lijst;
  // 2. Elk abonnement één keer lezen: zijn uren en tellers (metadata) en zijn adres (waarde). Een abonnement dat niet meer bestaat,
  // valt weg; een leesfout telt als "bestaat nog" (niets wissen, niets versturen).
  const rijen = await Promise.all(
    lijst.map(async ([naam, a]) => {
      try {
        const { value, metadata: m } = await env.ABONNEMENTEN.getWithMetadata(naam);
        return { naam, a, value, m: m ?? {} };
      } catch {
        fouten.add('abonnement-onleesbaar');
        return { naam, a, value: undefined, m: null };
      }
    }),
  );
  const bestaand = new Map(rijen.filter((r) => r.value !== null).map((r) => [r.naam, r]));
  // De abonnementen die nog nooit een geslaagde melding kregen (BESLISSING 630), met hun uur van aanmelding.
  const nooitGeslaagd = new Map();
  for (const r of bestaand.values()) {
    if (r.m === null ? Number.isInteger(r.a) : nogNooitGeslaagd(r.m)) nooitGeslaagd.set(r.naam, r.m === null ? r.a : r.m.a);
  }
  // Een abonnement dat er niet meer is (gewist of intussen afgemeld).
  const weg = (naam) => {
    nooitGeslaagd.delete(naam);
    bestaand.delete(naam);
  };
  // 3. Wie een signaal krijgt: wie op deze minuut een uur heeft, en wat volgens de inhaalregel (hierboven) nog moet.
  const urenNu = urenVanMinuut(minuut);
  let s = null;
  try {
    s = leesVerstuurd(await env.ABONNEMENTEN.get(VERSTUURD));
  } catch {
    /* zonder v:verstuurd: niets inhalen */
  }
  const vandaag = utcDag(tijd);
  const magVastleggen = !s || s.d !== vandaag || s.n < MAX_VERSTUURD_PER_DAG;
  const inhaal = [];
  if (s && magVastleggen) {
    for (let t = Math.max(minuut - INHAAL_MINUTEN, s.b, Math.floor(minuut / 1440) * 1440); t <= minuut - 2; t++) {
      const uren = urenVanMinuut(t);
      if (uren.length) inhaal.push({ t, uren });
    }
  }
  // Een oude lezing (KV loopt tot 60 seconden achter): schreef de vorige run (minuut - 1) v:verstuurd, en zien wij die stand niet,
  // dan wist onze schrijfopdracht zijn vastlegging en zou een latere run die minuut "inhalen": een tweede melding. Daarom: is de
  // gelezen stand niet van de vorige minuut (s.m < minuut - 1), dan merken we minuut - 1 als onzeker (o), en een onzekere minuut
  // wordt nooit ingehaald. Bij twijfel dus geen inhaalmelding, nooit een dubbele. Kost: een gemiste minuut vlak voor een run die
  // iets stuurt, wordt niet ingehaald.
  const onzeker = new Set(s?.o ?? []);
  if (!s || !Number.isInteger(s.m) || s.m < minuut - 1) onzeker.add(minuut - 1);
  for (let i = inhaal.length - 1; i >= 0; i--) if (onzeker.has(inhaal[i].t)) inhaal.splice(i, 1);
  const al = (t, naam) => s?.l[t]?.includes(kortVan(naam)) ?? false;
  const raakt = (u, uren) => uren.some((x) => u.includes(x));
  const teSturen = [];
  for (const r of bestaand.values()) {
    const u = Array.isArray(r.m?.u) ? r.m.u : [];
    if (r.value === undefined || u.length === 0) continue;
    const gewoon = raakt(u, urenNu) && !al(minuut, r.naam);
    const v = Number.isInteger(r.m.v) ? r.m.v : -Infinity;
    const gemist = inhaal.filter(({ t, uren }) => t >= v && raakt(u, uren) && !al(t, r.naam)).map(({ t }) => t);
    if (gewoon || gemist.length) teSturen.push({ ...r, gewoon, gemist });
  }
  // 4. Eerst vastleggen, dan sturen. Alleen een run die iets te sturen heeft, schrijft (hoogstens MAX_VERSTUURD_PER_DAG per dag).
  // De sleutel VOOR het vastleggen inlezen: is ze kapot of ontbreekt ze, dan wordt niets vastgelegd (die minuten blijven
  // inhaalbaar zodra de sleutel weer werkt), wordt niets gestuurd, en gooit de run na het boekhouden een fout.
  let sleutel = null;
  if (teSturen.length) {
    try {
      sleutel = await importeerSleutel(env.VAPID_PRIVE, env.VAPID_PUBLIEK);
    } catch {
      fouten.add('vapid-sleutel-onbruikbaar');
    }
  }
  let vastgelegd = false;
  if (teSturen.length && sleutel && magVastleggen) {
    const l = {};
    for (const [t, namen] of Object.entries(s?.l ?? {})) if (Number(t) >= minuut - INHAAL_MINUTEN) l[t] = [...namen];
    const zet = (t, naam) => {
      const rij = (l[t] ??= []);
      if (!rij.includes(kortVan(naam))) rij.push(kortVan(naam));
    };
    for (const r of teSturen) {
      if (r.gewoon) zet(minuut, r.naam);
      for (const t of r.gemist) zet(t, r.naam);
    }
    const o = [...onzeker].filter((t) => t >= minuut - INHAAL_MINUTEN).sort((x, y) => x - y);
    const nieuw = { b: s?.b ?? minuut, d: vandaag, n: (s?.d === vandaag ? s.n : 0) + 1, l, m: minuut, o };
    try {
      await env.ABONNEMENTEN.put(VERSTUURD, JSON.stringify(nieuw), { expirationTtl: 2 * 24 * 3600 });
      vastgelegd = true;
    } catch {
      /* niet vastgelegd: alleen de eigen minuut, niets inhalen */
    }
  }
  for (const r of teSturen) {
    if (!sleutel) break;
    if (!r.gewoon && !vastgelegd) continue;
    const { naam, m } = r;
    // Eén kapot of onleesbaar abonnement houdt de andere niet tegen.
    let status;
    let dienst;
    try {
      const bewaard = JSON.parse(r.value);
      if (!bewaard?.abonnement || !isToegelatenEndpoint(bewaard.abonnement.endpoint)) continue;
      dienst = dienstVan(bewaard.abonnement.endpoint);
      status = await stuurSignaal(bewaard.abonnement.endpoint, sleutel, env, tijd);
      verstuurd.push(status);
      if (status === 404 || status === 410) {
        await env.ABONNEMENTEN.delete(naam);
        weg(naam);
      } else if (status >= 200 && status < 300 && (aantalWeigeringen(m) > 0 || nogNooitGeslaagd(m))) {
        // Gelukt: een lopende reeks is voorbij, en de eerste geslaagde melding zet g = 1 en haalt het uur van aanmelding weg.
        // Eén schrijfopdracht, alleen als er een reeks liep of als dit de eerste geslaagde melding is (daarna nooit meer).
        const bestaat = await werkBij(env, naam, (vers) => {
          if (aantalWeigeringen(vers) === 0 && !nogNooitGeslaagd(vers)) return null;
          if (!nogNooitGeslaagd(vers)) return zonderReeks(vers);
          const { a: _a, ...rest } = zonderReeks(vers);
          return { ...rest, g: 1 };
        });
        if (bestaat) nooitGeslaagd.delete(naam);
        else weg(naam);
      } else if (isWeigering(status)) {
        const bestaat = await werkBij(env, naam, (vers) => {
          const f = aantalWeigeringen(vers);
          const ff = f > 0 && eersteWeigering(vers) !== null ? eersteWeigering(vers) : uurNu;
          const nieuw = { ...vers, f: Math.min(f + 1, WEIGER_DREMPEL), ff };
          const gewijzigd = nieuw.f !== vers.f || nieuw.ff !== vers.ff;
          if (nieuw.f >= WEIGER_DREMPEL && uurNu - ff > WEIGER_MIN_UREN) {
            kandidaten.push({ naam, dienst, f: nieuw.f, ff, gewijzigd });
            return null;
          }
          // De teller blijft op WEIGER_DREMPEL staan: daarna kost een weigering geen schrijfopdracht meer.
          return gewijzigd ? nieuw : null;
        });
        if (!bestaat) weg(naam);
      }
    } catch {
      if (status === undefined) verstuurd.push(0);
    }
    // Deze dienst aanvaardt onze signalen: het uur bijhouden (voorwaarde 3 en 4 van BESLISSING 630). Alleen schrijven als het uur
    // veranderde; de sleutel verdwijnt vanzelf als ze te oud is om nog mee te tellen.
    if (dienst && status >= 200 && status < 300) {
      try {
        if ((await leesDienstUur(env, dienst, dienstUren)) !== uurNu) {
          await env.ABONNEMENTEN.put(DIENST_VOORVOEGSEL + dienst, String(uurNu), { expirationTtl: (PROEF_UREN + 1) * 3600 });
          dienstUren.set(dienst, uurNu);
        }
      } catch {
        /* het volgende signaal opnieuw */
      }
    }
  }
  // Blijvend geweigerd: alleen wissen als dezelfde pushdienst na de eerste weigering, en de laatste PROEF_UREN uur, een ander
  // toestel wel bediende (voorwaarde 3 en 4; het uur komt uit h:<dienst>, in deze run al bijgewerkt, dus geen extra
  // schrijfopdracht en hoogstens één leesopdracht per dienst). Weigert de dienst alles omdat onze VAPID-instelling fout is, dan
  // wordt er niets gewist. Daarbovenop nooit meer dan een deel per run (de oudste reeksen eerst).
  const ruimte = Math.max(1, Math.floor(bestaand.size / 4));
  kandidaten.sort((a, b) => a.ff - b.ff);
  let gewist = 0;
  for (const k of kandidaten) {
    try {
      const mag = gewist < ruimte && k.dienst && dienstWerkt(await leesDienstUur(env, k.dienst, dienstUren), k, uurNu);
      if (mag) {
        gewist += 1;
        await env.ABONNEMENTEN.delete(k.naam);
        weg(k.naam);
      } else if (k.gewijzigd) {
        const bestaat = await werkBij(env, k.naam, (vers) => ({ ...vers, f: k.f, ff: k.ff }));
        if (!bestaat) weg(k.naam);
      }
    } catch {
      /* de volgende run opnieuw */
    }
  }
  // Boven het maximum (twee aanmeldingen die tegelijk hetzelfde abonnement kozen om plaats te maken, of een verlaagd
  // MAX_ABONNEMENTEN): eerst terug naar het maximum met dezelfde regel als een aanmelding (BESLISSING 630, de vier voorwaarden),
  // de oudste eerst. Wat dan nog te veel is, blijft staan: geen echt toestel wordt gewist om een telling te halen. De telling zegt
  // dan eerlijk hoeveel er zijn, dus elke nieuwe aanmelding krijgt 429 tot er weer plaats is (afmelden, 404 of 410, een vals
  // abonnement dat wisbaar wordt). Kost geen schrijfopdracht per verzoek, alleen een wis per abonnement te veel.
  const nooitGeslaagdLijst = () => [...nooitGeslaagd].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
  // Alleen bij de gelijkzetting (elk kwartier), zoals voor 713: dit leest kandidaten, en hoeft niet elke minuut.
  const teVeel = bestaand.size - maxAbonnementen(env);
  if (gelijkzetten && teVeel > 0) {
    try {
      for (const naam of await zoekWisbaar(env, tijd, nooitGeslaagdLijst(), dienstUren, teVeel)) {
        await env.ABONNEMENTEN.delete(naam);
        weg(naam);
      }
    } catch {
      /* het volgende kwartier opnieuw */
    }
  }
  // 5. De gelijkzetting: k:lijst wordt de echte lijst van deze run (zonder wat wegviel, met het verse uur van aanmelding), alleen
  // geschreven als ze verschilt. Vlak ervoor opnieuw gelezen: een aanmelding die tijdens deze run k:lijst schreef, blijft erin.
  // In een andere run wordt k:lijst niet geschreven (een abonnement dat nu wegviel, telt tot het volgende kwartier nog mee; het
  // lezen ervan geeft niets meer).
  if (gelijkzetten) {
    try {
      const rijen = new Map([...bestaand.keys()].map((naam) => [naam, nooitGeslaagd.has(naam) ? nooitGeslaagd.get(naam) : null]));
      const ruwNu = await env.ABONNEMENTEN.get(LIJST);
      for (const [naam, a] of leesLijst(ruwNu) ?? []) if (!namenBegin.has(naam) && !rijen.has(naam)) rijen.set(naam, a);
      const nieuw = JSON.stringify(gesorteerd([...rijen]));
      if (nieuw !== ruwNu) {
        await env.ABONNEMENTEN.put(LIJST, nieuw);
        // Een plaats kan vrij gekomen zijn: de "vol"-stand van deze isolate vervalt.
        geheugen.volTot = 0;
      }
      // De eerste keer na de uitrol van 713: de telling en de lijst van vroeger zijn overbodig.
      if (ontbrak) for (const oud of OUDE_SLEUTELS) await env.ABONNEMENTEN.delete(oud);
    } catch {
      /* het volgende kwartier opnieuw */
    }
  }
  if (fouten.size) throw new Error('bloei: run onvolledig (' + [...fouten].join(', ') + ')');
  return verstuurd;
}

// Een fout van de opslag (bv. een dagelijkse grens van het gratis abonnement) geeft een kale 503, zonder details.
async function veiligVerwerk(verzoek, env) {
  try {
    return await verwerk(verzoek, env);
  } catch {
    const origin = verzoek.headers.get('Origin');
    return fout(503, 'tijdelijk', env.TOEGELATEN_ORIGIN && origin === env.TOEGELATEN_ORIGIN ? corsKoppen(origin) : {});
  }
}

export default {
  fetch: veiligVerwerk,
  scheduled: (controller, env, ctx) => ctx.waitUntil(verstuurHerinneringen(env, new Date(controller.scheduledTime))),
};
