// Leest wat er op het toestel staat om de tekst van een melding te kiezen. Draait in de service worker: geen UI, geen DOM.
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { dagStatus } from '../data/dagstatus.js';
import { schemaVanDag } from '../data/supplementen.js';
import { isSpuit } from '../logica/supplementen.js';
import { vandaag } from '../kern/datum.js';
import { LAAT_VENSTER_MINUTEN } from './tekst.js';

export async function leesMeldingInvoer(nu = new Date()) {
  const datum = vandaag(nu);
  // BESLISSING 710: de vergrendeling telt niet mee voor de tekst; alleen de schakelaar "Details tonen in meldingen" beslist.
  const [dagboek, eten, drinken, supplementenUren, details, doelMl, status, schema] = await Promise.all([
    leesInstelling('meldingen.dagboek'),
    leesInstelling('meldingen.eten'),
    leesInstelling('meldingen.drinken'),
    leesInstelling('meldingen.supplementenUren'),
    leesInstelling('meldingen.details'),
    leesInstelling('drinken.dagdoelMl'),
    dagStatus(datum),
    schemaVanDag(datum),
  ]);
  const spuitVandaag = schema.periodiek.some((p) => p.geplandVandaag && !p.genomen && isSpuit(p.supplement));
  // Per tijdvak (ochtend, middag, avond): hoeveel supplementen er zijn en hoeveel er al afgevinkt zijn.
  const momenten = Object.fromEntries(schema.momenten.map((m) => [m.moment, { genomen: m.items.filter((i) => i.genomen).length, totaal: m.items.length }]));
  const afgehandeld = await leesAfgehandeld();
  return { nu, venster: LAAT_VENSTER_MINUTEN, dagboek, eten: Array.isArray(eten) ? eten : [], drinken, supplementenUren, details: details === true, doelMl, status, spuitVandaag, momenten, afgehandeld };
}

// BESLISSING 716: welke tijdstippen al een melding kregen ('JJJJ-MM-DD UU:MM', tekst.js kiesMeldingen). Bewaard als instelling op het
// toestel (gaat nooit naar de dienst; "Profiel verwijderen" wist ze mee met alle instellingen). Alleen tijdstippen, geen inhoud.
export const AFGEHANDELD = 'meldingen.afgehandeld';
const BEWAAR = 100; // ruim genoeg voor meer dan een dag aan tijdstippen

export async function leesAfgehandeld() {
  try {
    const lijst = await leesInstelling(AFGEHANDELD);
    return Array.isArray(lijst) ? lijst.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

// BESLISSING 754: de medaille Seintje aan vraagt een echte melding. De app ziet zelf niet of een melding afging (die stuurt de dienst),
// maar een tik op een melding wel: de service worker onthoudt hier het moment van de eerste tik. Alleen een tijdstip, geen inhoud.
export const GETIKT = 'meldingen.getikt';

export async function onthoudTik(nu = Date.now()) {
  try {
    if (!(await leesInstelling(GETIKT))) await zetInstelling(GETIKT, nu);
  } catch {
    // niet kunnen onthouden: de volgende tik probeert het opnieuw, de melding opent de app gewoon
  }
}

export async function bewaarAfgehandeld(sleutels) {
  if (!sleutels.length) return;
  const oud = await leesAfgehandeld();
  await zetInstelling(AFGEHANDELD, [...oud.filter((s) => !sleutels.includes(s)), ...sleutels].slice(-BEWAAR));
}
