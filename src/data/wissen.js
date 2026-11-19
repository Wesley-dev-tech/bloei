// Alles wissen: alle stores leeg, ook de instellingen (BESLISSING 63). Daarna is het een nieuw schrift.
import { db, verhoogEpoch } from './db.js';
import { zend } from '../kern/bus.js';
import { meldAfBijWissen } from '../meldingen/push.js';
import { vergeetPasskey } from '../vergrendeling/passkey.js';
import { DEMO, wisEigenSleutels } from '../kern/demo.js';

// Later op te ruimen: wisEigenSleutels staat sinds R1-24 in kern/demo.js; tests/logica/demo.test.js haalt het nog hier.
export { wisEigenSleutels };

const ALLE_TABELLEN = () => [db.dagen, db.maaltijden, db.fotos, db.dranken, db.wegingen, db.favorieten, db.badges, db.instellingen, db.supplementen, db.momentinnames];

// Het abonnement op de meldingsdienst (BESLISSING 38): het adres en de sleutels van dit toestel, nodig om af te melden.
const ABONNEMENT = 'meldingen.abonnement';

// Eén transactie: mislukt er iets, dan blijft de oude toestand staan, ook buiten de database.
// De volgorde (bevinding van de nakijker): eerst lezen wat het afmelden nodig heeft, dan de transactie, en pas als die lukte afmelden bij de
// meldingsdienst en de passkeys als onbekend melden. Mislukt de transactie, dan blijven de gegevens staan en dus ook het abonnement en de
// passkey van het slot (anders zou Face ID op het slot niet meer werken terwijl alles nog bewaard is).
export async function wisAlles() {
  // De passkey van Face ID en een oude sleutel van het toestel om te herstellen (BESLISSING 518, 541): vóór de transactie gelezen, erna gemeld.
  let ids = [];
  try {
    ids = [(await db.instellingen.get('slot.passkeyId'))?.waarde, (await db.instellingen.get('slot.herstelId'))?.waarde].filter(Boolean);
  } catch {
    /* het wissen mag hier niet op stuklopen */
  }
  verhoogEpoch();
  try {
    // Het abonnement blijft als enige rij staan tot het afgemeld is: het afmelden (meldingen/push.js, zetMeldingenUit) leest het daar, ook als
    // de browser het niet meer kent. Lezen, leegmaken en terugzetten in dezelfde transactie: er is geen ogenblik zonder.
    await db.transaction('rw', ALLE_TABELLEN(), async () => {
      const abonnement = await db.instellingen.get(ABONNEMENT);
      for (const tabel of ALLE_TABELLEN()) await tabel.clear();
      if (abonnement?.waarde) await db.instellingen.put(abonnement);
    });
  } finally {
    verhoogEpoch();
  }
  // Pas nu: het abonnement bij de meldingsdienst wissen en lokaal uitschrijven (BESLISSING 38). Zonder abonnement of zonder push-dienst gebeurt
  // er niets; mislukt het, dan blijft het wissen gelukt. Daarna gaat ook de rij van het abonnement weg. Sluit de app net daartussen, dan meldt
  // de volgende start het abonnement alsnog af (push.js, werkUrenBij: geen herinneringen meer, dus afmelden).
  try {
    await meldAfBijWissen();
  } catch {
    /* het wissen mag hier niet op stuklopen */
  }
  // Wint de time-out van meldAfBijWissen (5 s), dan loopt het afmelden nog verder en schrijft het op het einde een lege rij van het abonnement
  // (zetMeldingenUit). Die rij mag er na het wissen niet meer komen: vanaf hier weigert de tabel een lege rij van het abonnement (zie houdAbonnementWeg).
  houdAbonnementWeg();
  try {
    await db.instellingen.delete(ABONNEMENT);
  } catch {
    /* zelfde: de gegevens zijn al gewist */
  }
  // De browser laten weten dat de passkeys niet meer bestaan (waar dat kan). Wacht hoogstens even. De herstelcode zelf stond in de instellingen.
  try {
    if (ids.length) await Promise.race([Promise.all(ids.map((id) => vergeetPasskey(id))), new Promise((klaar) => setTimeout(klaar, 2000))]);
  } catch {
    /* het wissen mag hier niet op stuklopen */
  }
  wisBrowseropslag();
  zend('data:gewijzigd', { store: '*' });
}

// Na het wissen: een lege rij van het abonnement (waarde null, het einde van een afmelding die de time-out verloor) wordt geweigerd, zodat er in het
// nieuwe schrift niets van het oude bijkomt. Een echt nieuw abonnement (een waarde) mag wel en zet de weigering weer af. De weigering geldt tot de
// app herlaadt (dat doen "Profiel verwijderen" en het wissen vanuit het slot meteen na wisAlles). De afmelding die ze treft, faalt alleen in haar
// laatste stap: het verzoek aan de dienst en het uitschrijven bij de browser zijn dan al gebeurd.
let weigerLeeg = null;
function houdAbonnementWeg() {
  const tabel = db.instellingen;
  if (weigerLeeg?.tabel === tabel) {
    weigerLeeg.aan = true;
    return;
  }
  const stand = { tabel, aan: true };
  tabel.hook('creating', (sleutel, rij) => {
    if (!stand.aan || (sleutel ?? rij?.sleutel) !== ABONNEMENT) return;
    if (rij?.waarde != null) stand.aan = false;
    else throw new Error('na het wissen komt er geen lege rij van het abonnement meer bij');
  });
  weigerLeeg = stand;
}

// BESLISSING 277: ook wat buiten de database staat verdwijnt (thema-spiegel 'bloei-thema', uitlegstand 'bloei-uitleg').
// De service-workercache bevat alleen de app-bestanden, geen gegevens, en blijft dus staan.
// In de demo (BESLISSING 364) verdwijnen alleen de eigen sleutels ('bloei-demo-...'): wat de echte app op hetzelfde adres zou
// bewaren, blijft staan. De database is al de eigen database (db.js, DB_NAAM).
function wisBrowseropslag() {
  for (const opslag of ['localStorage', 'sessionStorage']) {
    try {
      if (DEMO) wisEigenSleutels(globalThis[opslag]);
      else globalThis[opslag]?.clear();
    } catch {
      /* opslag niet beschikbaar: niets te wissen */
    }
  }
}
