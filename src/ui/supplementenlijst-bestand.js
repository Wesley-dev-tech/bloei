// De supplementenlijst bewaren als bestand en uit een bestand overnemen (BESLISSINGEN 696 en 707): het schermdeel.
// Een onderdeel dat alles zelf doet: de knoppenrij, bewaren (deelmenu of download), de bestandskiezer, lezen, vergelijken, de dialoog, overnemen
// en de meldingen. Het tabblad Supplementen (schermen/supplementen.js) plaatst het:
//   gevulde lijst:  in de kaart "Mijn supplementen" als laatste kind: lijstBestandKnoppen({ supplementen: lijst })
//   lege lijst:     in de lege kaart, onder "Eerste supplement toevoegen": lijstBestandKnoppen({ supplementen: [] })
// De pure kant staat in logica/supplementenbestand.js, de database in data/supplementenbestand.js. Opmaak: stijl/supplementenlijst-bestand.css.
// De teksten staan in teksten.js onder lijstBestand (707: geen bestandsnaam en geen aantallen in een tekst).
//
// Bewaren en de tik op iOS: navigator.share moet rechtstreeks uit de tik komen. Het bestand wordt daarom vooraf klaargemaakt, bij het tekenen
// van de knoppen (uit de lijst die het tabblad al gelezen heeft, zonder wachten) en opnieuw bij elke wijziging van de lijst ('data:gewijzigd').
// De tik op "Lijst bewaren als bestand" roept share() dan zonder await ervoor aan, zoals Versturen op Delen (schermen/delen.js).
//
// Alles met h() en textContent, geen innerHTML (Trusted Types).
import '../stijl/supplementenlijst-bestand.css';
import { h } from './dom.js';
import { knop, strook } from './componenten.js';
import { bewaakTerug } from '../pwa/terug.js';
import { luister } from '../kern/bus.js';
import { isAndroid, isIos } from '../kern/toestel.js';
import { leesSupplementen } from '../data/supplementen.js';
import { neemOver } from '../data/supplementenbestand.js';
import { BESTANDSNAAM, BESTANDSTYPE, MAX_BESTAND_BYTES, leesBestand, maakBestand, vergelijk } from '../logica/supplementenbestand.js';
import { t } from '../teksten.js';

const lt = (sleutel, waarden) => t('lijstBestand.' + sleutel, waarden);
const MELDING_MS = 6000; // een melding van twee zinnen blijft wat langer staan dan de gewone 3 s

// De vorm van de twee knoppen bij een gevulde lijst (BESLISSING 707, twee standen voor de eigenaar):
//   'knoppen' (stand A): twee kleine knoppen in de zachte tint van het tabblad, 44 px hoog, even breed, gecentreerd;
//   'tekst'   (stand B): twee tekstknoppen naast elkaar met een dunne scheiding (onder elkaar als ze niet naast elkaar passen).
// Het verschil zit alleen in de klasse lijstbestand--tekst (stijl/supplementenlijst-bestand.css).
export const KNOPSTAND = 'knoppen';

let teller = 0;
const nieuwId = (basis) => `${basis}-${(teller += 1)}`;

// ---------------------------------------------------------------- bewaren

// Mag dit toestel het deelmenu gebruiken? Zoals bewaarAlsBestand in vergrendeling/herstelscherm.js: alleen op een iPhone, iPad of Android-toestel
// (daar kies je "Bewaar in Bestanden" of een map); elders een gewone download. Een gedeelde helper voor beide kan later.
function kanDelen(bestand) {
  if (!(isIos() || isAndroid()) || typeof navigator.share !== 'function') return false;
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [bestand] });
  } catch {
    return false;
  }
}

function download(bestand) {
  try {
    const url = URL.createObjectURL(bestand);
    const a = h('a', { href: url, download: bestand.name, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

function maakFile(supplementen) {
  try {
    return new File([maakBestand(supplementen)], BESTANDSNAAM, { type: BESTANDSTYPE });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- de dialoog

// Toont de vraag voor het overnemen. bestaand: de actieve supplementen nu; nieuw: de supplementen uit het bestand.
// Geeft een belofte met de uitslag van neemOver (en de gekozen wijze), of null als ze annuleert.
function vraagOvernemen({ bestaand, nieuw }) {
  return new Promise((klaar) => {
    const titelId = nieuwId('lijstbestand-titel');
    const vraagId = nieuwId('lijstbestand-vraag');
    const plan = vergelijk(bestaand, nieuw);
    const leeg = bestaand.length === 0;
    const erbij = plan.toevoegen.erbij.length;

    const dlg = h('dialog', {
      class: 'dialoog lijstbestand__dialoog',
      'aria-labelledby': titelId,
      'aria-describedby': vraagId,
      dataset: { familie: 'gezond' }, // de kleur van het tabblad Supplementen, ook als de dialoog elders zou openen (tabkleur.css)
    });
    let bezig = false;
    let gesloten = false;
    let terugWacht = null;

    const sluit = (uitslag) => {
      if (gesloten) return;
      gesloten = true;
      terugWacht?.los();
      if (dlg.open) dlg.close();
      dlg.remove();
      klaar(uitslag);
    };
    const annuleer = () => {
      if (!bezig) sluit(null);
    };

    const keuze = (wijze) => async () => {
      if (bezig) return; // geen dubbele tik
      bezig = true;
      dlg.setAttribute('aria-busy', 'true');
      for (const b of dlg.querySelectorAll('button')) b.disabled = true;
      // Voor een schermlezer: de melding onderaan zegt dat het bezig is (ze blijft staan tot de uitkomst haar vervangt). In de dialoog zelf
      // verschuift niets, zodat ze ook op een lage telefoon niet gaat scrollen.
      strook(lt('bezig'), { duur: 0 });
      try {
        const uitslag = await neemOver(nieuw, { wijze });
        bezig = false;
        sluit({ wijze, leeg, ...uitslag });
      } catch (fout) {
        console.error(fout);
        bezig = false;
        sluit({ fout: true });
      }
    };

    const annuleerKnop = knop(lt('knopAnnuleren'), { soort: 'secundair', breed: true, opKlik: annuleer });
    const tekstEls = [];
    let acties;
    if (leeg) {
      tekstEls.push(h('p', { class: 'dialoog__tekst lijstbestand__vraag', id: vraagId }, lt('leegVraag')));
      acties = [knop(lt('knopJa'), { soort: 'primair', breed: true, opKlik: keuze('toevoegen') }), annuleerKnop];
    } else {
      const toevoegenId = nieuwId('lijstbestand-toevoegen');
      const vervangenId = nieuwId('lijstbestand-vervangen');
      tekstEls.push(h('p', { class: 'dialoog__tekst lijstbestand__vraag', id: vraagId }, lt('keuzeVraag')));
      // Geen aantallen (BESLISSING 707): alleen of er bij Toevoegen iets bijkomt of niet.
      const toevoegenTekst = erbij > 0 ? lt('toevoegenUitleg') : lt('toevoegenNiets');
      // Elke keuze in een zin, de naam van de keuze vet ervoor (zo blijft de dialoog ook op 320 x 480 zonder scrollen in beeld).
      const keuzeRegel = (id, naam, tekst) => h('p', { class: 'dialoog__tekst lijstbestand__keuze', id }, h('strong', { class: 'lijstbestand__keuzenaam' }, naam + ':'), ' ' + tekst);
      const keuzes = h(
        'div',
        { class: 'lijstbestand__keuzes' },
        keuzeRegel(toevoegenId, lt('knopToevoegen'), toevoegenTekst),
        keuzeRegel(vervangenId, lt('knopVervangen'), lt('vervangenUitleg') + ' ' + lt('vervangenDagboek')),
      );
      tekstEls.push(keuzes);
      // Komt er bij Toevoegen niets bij, dan zegt de dialoog dat (toevoegenNiets) en is Toevoegen geen knop (een handeling die niets doet).
      const toevoegenKnop = erbij > 0 ? knop(lt('knopToevoegen'), { soort: 'primair', breed: true, opKlik: keuze('toevoegen') }) : null;
      toevoegenKnop?.setAttribute('aria-describedby', toevoegenId);
      const vervangenKnop = knop(lt('knopVervangen'), { soort: 'primair', breed: true, opKlik: keuze('vervangen') });
      vervangenKnop.setAttribute('aria-describedby', vervangenId);
      acties = [toevoegenKnop, vervangenKnop, annuleerKnop].filter(Boolean);
    }
    dlg.append(
      h(
        'div',
        { class: 'dialoog__blad' },
        h('h2', { class: 't-h2 dialoog__titel', id: titelId }, lt('titel')),
        ...tekstEls,
        h('div', { class: 'dialoog__acties' }, ...acties),
      ),
    );
    // Escape en een tik naast de dialoog annuleren, zoals bij de andere vragen; tijdens het overnemen doen ze niets.
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      annuleer();
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) annuleer();
    });
    document.body.append(dlg);
    dlg.showModal();
    terugWacht = bewaakTerug({ opTerug: () => (annuleer(), true) });
    // De focus begint op Annuleren, zoals bij elke vraag in de app (bevestig, de wisdialoog): een vergissing doet niets.
    annuleerKnop.focus();
  });
}

// ---------------------------------------------------------------- het onderdeel

// lijstBestandKnoppen({ supplementen, opGewijzigd })
//   supplementen: de actieve supplementen die het tabblad al gelezen heeft (leesSupplementen()); [] bij een lege lijst. Laat je het weg, dan
//                 leest het onderdeel de lijst zelf (dan is het bestand pas klaar na dat lezen).
//   opGewijzigd:  optioneel; volgt na een geslaagd overnemen. Niet nodig op het tabblad Supplementen: neemOver zendt 'data:gewijzigd' en het
//                 tabblad tekent zichzelf dan opnieuw (beheerScherm in schermen/hulp.js).
// Geeft het element (een div met de knoppen en de verborgen bestandskiezer). Het ruimt zichzelf op als het uit de pagina verdwijnt.
export function lijstBestandKnoppen({ supplementen, opGewijzigd } = {}) {
  let lijst = Array.isArray(supplementen) ? supplementen : null;
  let bestand = lijst ? maakFile(lijst) : null;

  const invoer = h('input', { type: 'file', accept: '.txt,text/plain,.json,application/json', hidden: true, tabindex: '-1', 'aria-hidden': 'true', class: 'lijstbestand__invoer' });

  // Gevulde lijst: twee knoppen met een korte tekst ("Lijst bewaren", "Lijst overnemen"); de schermlezer hoort de volledige zin, die met de
  // zichtbare tekst begint (zo werkt ook spraakbediening met de woorden die je ziet). Lege lijst: een tekstknop zoals "Eerste supplement toevoegen".
  const bewaarKnop = knop(lt('knopBewaren'), { soort: 'secundair', label: lt('knopBewarenLabel'), opKlik: () => bewaar() });
  bewaarKnop.dataset.lijstbestand = 'bewaren';
  const overneemKnop = knop(lt('knopOvernemen'), { soort: 'secundair', label: lt('knopOvernemenLabel'), opKlik: () => invoer.click() });
  overneemKnop.dataset.lijstbestand = 'overnemen';
  overneemKnop.setAttribute('aria-haspopup', 'dialog');
  const overneemTekstknop = knop(lt('knopOvernemenLeeg'), { soort: 'tekst', opKlik: () => invoer.click() });
  overneemTekstknop.dataset.lijstbestand = 'overnemen';
  overneemTekstknop.setAttribute('aria-haspopup', 'dialog');

  const rij = h('div', { class: 'lijstbestand__knoppen' });
  const el = h('div', { class: ['lijstbestand', KNOPSTAND === 'tekst' && 'lijstbestand--tekst'], role: 'group', 'aria-label': lt('groep') }, rij, invoer);

  // Bij een lege lijst heeft bewaren geen zin: alleen de tekstknop "Lijst uit een bestand overnemen" (BESLISSING 707).
  const actieveKnop = () => (overneemTekstknop.isConnected ? overneemTekstknop : overneemKnop);
  const zetStand = () => {
    const aantal = lijst ? lijst.length : 0;
    rij.replaceChildren(...(aantal === 0 ? [overneemTekstknop] : [bewaarKnop, overneemKnop]));
    el.classList.toggle('is-leeg', aantal === 0);
  };
  zetStand();

  async function herlees() {
    try {
      lijst = await leesSupplementen();
      bestand = maakFile(lijst);
      zetStand();
    } catch (fout) {
      console.error(fout);
    }
  }
  if (!lijst) herlees();

  // Opnieuw klaarmaken bij elke wijziging van de lijst; los zodra het onderdeel niet meer in de pagina staat.
  let gezien = false;
  const los = luister('data:gewijzigd', (detail) => {
    if (el.isConnected) gezien = true;
    else if (gezien) return los();
    if (!detail?.store || detail.store === 'supplementen') herlees();
  });

  // De tik roept share() rechtstreeks aan: geen await ervoor (iOS eist een verse gebruikershandeling).
  function bewaar() {
    if (!bestand) {
      strook(lt('bewarenMislukt'), { duur: MELDING_MS });
      return;
    }
    const meldBewaard = () => strook(lt('bewaard'), { duur: MELDING_MS });
    if (kanDelen(bestand)) {
      navigator
        .share({ files: [bestand] }) // de schil zet hier een vrijstelling voor het slot rond (vergrendeling/vrijstelling.js)
        .then(meldBewaard)
        .catch((fout) => {
          if (fout?.name === 'AbortError') return; // zelf gesloten: stil
          if (download(bestand)) meldBewaard();
          else strook(lt('bewarenMislukt'), { duur: MELDING_MS });
        });
      return;
    }
    if (download(bestand)) meldBewaard();
    else strook(lt('bewarenMislukt'), { duur: MELDING_MS });
  }

  // De bestandskiezer: eerst de grootte, dan de tekst, leesBestand en de dialoog. Bij een fout de zin bij de reden; er verandert niets.
  invoer.addEventListener('change', async () => {
    const gekozen = invoer.files?.[0];
    invoer.value = ''; // zo kan hetzelfde bestand nog eens gekozen worden
    if (!gekozen) return;
    const weiger = (reden) => strook(lt('reden.' + reden), { duur: MELDING_MS });
    if (gekozen.size === 0) return weiger('leeg');
    if (gekozen.size > MAX_BESTAND_BYTES) return weiger('te-groot');
    let tekst;
    try {
      tekst = await gekozen.text();
    } catch {
      return weiger('onleesbaar');
    }
    const gelezen = leesBestand(tekst);
    if (!gelezen.ok) return weiger(gelezen.reden);

    let bestaand;
    try {
      bestaand = await leesSupplementen();
    } catch (fout) {
      console.error(fout);
      strook(lt('mislukt'), { duur: MELDING_MS });
      return;
    }
    const uitslag = await vraagOvernemen({ bestaand, nieuw: gelezen.supplementen });
    if (!uitslag) return zetFocusTerug(false);
    if (uitslag.fout) {
      strook(lt('mislukt'), { duur: MELDING_MS });
      return zetFocusTerug(false);
    }
    const zin = uitslag.leeg ? lt('klaarNieuw') : uitslag.wijze === 'vervangen' ? lt('klaarVervangen') : lt('klaarToevoegen');
    strook(zin, { duur: MELDING_MS });
    try {
      opGewijzigd?.(uitslag);
    } catch (fout) {
      console.error(fout);
    }
    zetFocusTerug(true);
  });

  // De focus keert terug naar de knop om over te nemen, zoals bij de andere dialogen. Na een geslaagd overnemen tekent het tabblad
  // zichzelf opnieuw (even later): dan krijgt de nieuwe knop de focus zodra hij er is.
  function zetFocusTerug(naWijziging) {
    const oud = actieveKnop();
    if (oud.isConnected) oud.focus({ preventScroll: true });
    if (!naWijziging) return;
    let pogingen = 0;
    const zoek = () => {
      const actief = document.activeElement;
      if (actief && actief !== document.body && actief.isConnected && actief !== oud) return;
      const nieuw = document.querySelector('[data-lijstbestand="overnemen"]');
      if (nieuw && nieuw !== oud) return nieuw.focus({ preventScroll: true });
      if ((pogingen += 1) < 40) setTimeout(zoek, 50);
    };
    setTimeout(zoek, 50);
  }

  return el;
}
