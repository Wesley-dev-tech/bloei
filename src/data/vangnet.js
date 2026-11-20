// Vangnet voor tekst die nog niet bewaard was (R5-03). Wie typt en meteen herlaadt of de app wegveegt, verliest anders wat in de
// laatste 0,4 s getypt is: het bewaren bij pagehide start een IndexedDB-schrijfactie die de pagina niet meer afmaakt.
// Daarom zet hulp.js bij pagehide en bij een verborgen pagina wat nog wacht ook meteen (synchroon) in localStorage; is het bewaren
// daarna toch gelukt, dan gaat het vangnet weer weg. Bij de volgende start bewaart main.js wat er nog staat en wist het vangnet meteen,
// zodat er geen tekst over eten of een notitie in de browseropslag blijft staan. De sleutel begint met het voorvoegsel van de app
// ('bloei-vangnet', in de demo 'bloei-demo-vangnet'): "Profiel verwijderen" wist ze dus mee (data/wissen.js).
import { OPSLAG_VOORVOEGSEL } from '../kern/demo.js';
import { isDatum } from '../kern/datum.js';
import { bewaarMaaltijd, leesMaaltijden, MAALTIJDSOORTEN } from './maaltijden.js';
import { leesDag, zetNotitie } from './dagen.js';

export const VANGNET_SLEUTEL = OPSLAG_VOORVOEGSEL + 'vangnet';

const opslag = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

// items: [{ soort: 'maaltijd', datum, maaltijd, tekst, op } | { soort: 'notitie', datum, tekst, op }]. Synchroon.
// op = het tijdstip (ms) van de laatste toets van die tekst (hulp.js); een item zonder op is van een oudere versie en wordt altijd teruggezet.
export function legInVangnet(items) {
  try {
    if (items.length) opslag()?.setItem(VANGNET_SLEUTEL, JSON.stringify(items));
    else opslag()?.removeItem(VANGNET_SLEUTEL);
  } catch {
    /* opslag vol of uit: dan alleen het gewone bewaren */
  }
}

export function wisVangnet() {
  try {
    opslag()?.removeItem(VANGNET_SLEUTEL);
  } catch {
    /* niets te wissen */
  }
}

// Staat er in de database al een tekst die na het typen van dit item nog geschreven is? Dan is het vangnet-item ouder dan wat er staat
// (een vangnet dat bleef liggen terwijl ze later verder typte) en mag het die nieuwere tekst niet overschrijven.
// De vergelijking loopt met tekstOp, de stempel van het tekstveld zelf (maaltijden.js, dagen.js): gewijzigdOp geldt voor het hele record
// en verandert ook door gevoel, uur, stemming, energie of het drinkdoel, wat de nog niet bewaarde tekst zou tegenhouden.
// Een record van voor die stempel heeft geen tekstOp: daar beslist gewijzigdOp, zoals voorheen.
async function recordIsNieuwer(item) {
  if (typeof item.op !== 'number') return false;
  const record = item.soort === 'maaltijd' ? (await leesMaaltijden(item.datum))[item.maaltijd] : await leesDag(item.datum);
  const stempel = typeof record?.tekstOp === 'number' ? record.tekstOp : (record?.gewijzigdOp ?? 0);
  return stempel > item.op;
}

// Bij het opstarten: bewaart wat er nog in het vangnet staat en wist het meteen. Geeft het aantal bewaarde items.
export async function herstelVangnet() {
  let items = [];
  try {
    items = JSON.parse(opslag()?.getItem(VANGNET_SLEUTEL) ?? '[]');
  } catch {
    items = [];
  }
  wisVangnet();
  if (!Array.isArray(items)) return 0;
  let aantal = 0;
  for (const item of items) {
    if (!item || !isDatum(item.datum) || typeof item.tekst !== 'string') continue;
    try {
      const maaltijd = item.soort === 'maaltijd' && MAALTIJDSOORTEN.includes(item.maaltijd);
      if (!maaltijd && item.soort !== 'notitie') continue;
      if (await recordIsNieuwer(item)) continue;
      if (maaltijd) await bewaarMaaltijd(item.datum, item.maaltijd, { tekst: item.tekst });
      else await zetNotitie(item.datum, item.tekst);
      aantal += 1;
    } catch {
      /* een dag in de toekomst of een andere fout: overslaan */
    }
  }
  return aantal;
}
