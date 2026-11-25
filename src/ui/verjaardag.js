// De geboortedatum in Bloei (dag, maand en jaar; mag leeg blijven): de drie lijsten voor het welkomscherm, het venster met die lijsten
// (de eenmalige vraag na de update) en dezelfde drie lijsten op Algemeen > Naam en foto.
// De viering zelf (confetti op haar verjaardag) staat in ui/feest.js.
import { h } from './dom.js';
import { knop, bladInhoud } from './componenten.js';
import { leesInstelling, zetInstelling, isStartKlaar } from '../data/instellingen.js';
import { DEMO } from '../kern/demo.js';
import { t } from '../teksten.js';
import { dagenInMaand, geldigeVerjaardag } from '../logica/kalender.js';
import { vandaag } from '../kern/datum.js';

const maandNaam = (maand) => new Date(2024, maand - 1, 1).toLocaleDateString('nl-BE', { month: 'long' });

// verjaardagKiezer({ waarde: { dag, maand, jaar } | null, opWijzig(waarde | null) })
// Drie keuzelijsten naast elkaar. opWijzig krijgt een geldige geboortedatum, of null zolang er een leeg is (of de datum niet bestaat of in
// de toekomst ligt).
// opStand({ geldig, leeg }) volgt elke wijziging, ook een half ingevulde datum: zo weet het venster of Bewaren mag.
export function verjaardagKiezer({ waarde = null, opWijzig, opStand } = {}) {
  const nu = vandaag();
  const ditJaar = Number(nu.slice(0, 4));
  const begin = geldigeVerjaardag(waarde);
  const optie = (tekst, w) => h('option', { value: String(w) }, tekst);
  const dag = h('select', { class: 'verjaardag__lijst', 'aria-label': t('verjaardag.dag') });
  const maand = h('select', { class: 'verjaardag__lijst verjaardag__lijst--maand', 'aria-label': t('verjaardag.maand') }, optie(t('verjaardag.maand'), ''), ...Array.from({ length: 12 }, (_, i) => optie(maandNaam(i + 1), i + 1)));
  const jaar = h('select', { class: 'verjaardag__lijst', 'aria-label': t('verjaardag.jaar') }, optie(t('verjaardag.jaar'), ''), ...Array.from({ length: 111 }, (_, i) => optie(String(ditJaar - i), ditJaar - i)));
  // De dagen volgen de gekozen maand (30 in april, 29 in februari); een dag die niet meer kan, valt terug op de laatste dag.
  const vulDagen = (gekozen) => {
    const hoogste = dagenInMaand(Number(maand.value) || 1);
    dag.replaceChildren(optie(t('verjaardag.dag'), ''), ...Array.from({ length: hoogste }, (_, i) => optie(String(i + 1), i + 1)));
    dag.value = gekozen ? String(Math.min(Number(gekozen), hoogste)) : '';
  };
  maand.value = begin ? String(begin.maand) : '';
  jaar.value = begin ? String(begin.jaar) : '';
  vulDagen(begin?.dag ?? '');
  const leeg = () => !dag.value && !maand.value && !jaar.value;
  // Alles leeg: de geboortedatum is gewist (null). Half ingevuld of ongeldig: nog niets melden, ze is bezig.
  const meld = () => {
    const geldig = geldigeVerjaardag({ dag: Number(dag.value), maand: Number(maand.value), jaar: Number(jaar.value) }, nu);
    opStand?.({ geldig, leeg: leeg() });
    if (geldig || leeg()) opWijzig?.(geldig);
  };
  maand.addEventListener('change', () => {
    vulDagen(dag.value);
    meld();
  });
  dag.addEventListener('change', meld);
  jaar.addEventListener('change', meld);
  return h('div', { class: 'verjaardag', role: 'group', 'aria-label': t('verjaardag.veld') }, dag, maand, jaar);
}

// Het venster met de drie lijsten. Het is het gewone venster van Bloei (bladInhoud in componenten.js): dezelfde maat, dezelfde titel en
// dezelfde rij van twee even brede knoppen als elke andere vraag in de app. De drie lijsten zijn samen even breed als die rij knoppen.
// geboortevenster({ tekst, nee }) → belofte met { waarde } na Bewaren, anders null. Bewaren kan alleen met een volledige, geldige datum.
function geboortevenster({ tekst, nee } = {}) {
  return new Promise((klaar) => {
    let gekozen = null;
    let antwoord = null;
    const venster = h('dialog', { class: 'dialoog geboortevraag', 'aria-labelledby': 'geboortevraag-titel' });
    const bewaar = knop(t('verjaardag.bewaren'), {
      soort: 'primair',
      breed: true,
      opKlik: () => {
        if (bewaar.disabled) return;
        antwoord = { waarde: gekozen };
        venster.close();
      },
    });
    bewaar.disabled = !gekozen;
    const kiezer = verjaardagKiezer({
      opStand: ({ geldig }) => {
        gekozen = geldig;
        bewaar.disabled = !geldig;
      },
    });
    venster.append(
      bladInhoud({
        id: 'geboortevraag',
        titel: t('verjaardag.welkomVraag'),
        inhoud: h('div', { class: 'geboortevraag__inhoud' }, h('p', { class: 'dialoog__tekst' }, tekst), kiezer),
        acties: [bewaar, knop(nee, { soort: 'secundair', breed: true, opKlik: () => venster.close() })],
      }),
    );
    // naast het venster tikken sluit het zonder te bewaren, zoals bij elke vraag
    venster.addEventListener('click', (e) => {
      if (e.target === venster) venster.close();
    });
    venster.addEventListener('close', () => {
      venster.remove();
      klaar(antwoord);
    });
    document.body.append(venster);
    venster.showModal();
  });
}

// Voor wie Bloei al gebruikte toen de geboortedatum erbij kwam: één keer een vraag om ze in te vullen. Vrijblijvend: Bewaren bewaart
// ze, Nu niet (of het blad sluiten) laat ze leeg. Hoe ze ook antwoordt, 'profiel.verjaardagGevraagd' onthoudt dat de vraag gesteld is:
// ze komt nooit terug. Later invullen kan nog onder Algemeen > Naam en foto. Wie nieuw begint, krijgt de vraag op het welkomscherm
// (schermen/welkom.js zet dezelfde vlag). In de demo nooit: daar begint elk bezoek opnieuw.
// Geeft een belofte die afloopt als het blad dicht is (meteen als er niets te vragen valt).
export async function vraagGeboortedatumEenKeer() {
  try {
    if (DEMO || !isStartKlaar()) return;
    const [verjaardag, gevraagd] = await Promise.all([leesInstelling('profiel.verjaardag'), leesInstelling('profiel.verjaardagGevraagd')]);
    if (gevraagd) return;
    await zetInstelling('profiel.verjaardagGevraagd', true);
    if (geldigeVerjaardag(verjaardag)) return;
    const antwoord = await geboortevenster({ tekst: t('verjaardag.vraagTekst'), nee: t('verjaardag.nuNiet') });
    if (antwoord?.waarde) await zetInstelling('profiel.verjaardag', antwoord.waarde);
  } catch {
    /* de vraag is een extraatje: mislukt ze, dan gaat de app gewoon verder */
  }
}
