// De demoversie van Bloei (BESLISSING 364). Eén bron voor de hele app: is dit de demo, en welke opslag hoort erbij.
// De demo staat alleen aan als de app gebouwd of gestart is met VITE_DEMO=true. Zonder die variabele is alles zoals altijd.
// Zonder optionele keten (?.): alleen zo ziet de bundelaar DEMO als constante en valt elke demo-tak uit de echte bouw.
export const DEMO = import.meta.env.VITE_DEMO === 'true';

// De echte app en de demo delen nooit een database of een cache, ook niet in dezelfde browser.
export const DB_NAAM = DEMO ? 'bloei-demo' : 'bloei-dagboek';
export const CACHE_VOORVOEGSEL = DEMO ? 'bloei-demo' : 'bloei';

// Sleutels in localStorage en sessionStorage beginnen hiermee ('bloei-thema', 'bloei-uitleg'; in de demo 'bloei-demo-thema', ...).
// Zo wist "Profiel verwijderen" of "Opnieuw beginnen" in de demo alleen haar eigen sleutels, ook als beide versies ooit op hetzelfde adres staan.
export const OPSLAG_VOORVOEGSEL = DEMO ? 'bloei-demo-' : 'bloei-';

// Wist in een Storage alleen de sleutels die met het voorvoegsel beginnen (standaard OPSLAG_VOORVOEGSEL). Staat hier en niet in data/wissen.js,
// zodat de demo dit kan gebruiken zonder meldingen en passkey mee te laden (R1-24).
export function wisEigenSleutels(opslag, voorvoegsel = OPSLAG_VOORVOEGSEL) {
  if (!opslag) return;
  const sleutels = [];
  for (let i = 0; i < opslag.length; i += 1) {
    const sleutel = opslag.key(i);
    if (sleutel?.startsWith(voorvoegsel)) sleutels.push(sleutel);
  }
  for (const sleutel of sleutels) opslag.removeItem(sleutel);
}
