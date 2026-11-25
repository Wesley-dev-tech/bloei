// Welkom (#/welkom): de eerste start, en het begin na "Profiel verwijderen". Eén kaart met het logo, een warme titel en
// vier stappen, één per keer: je naam, je dagdoel voor drinken, je weegdag en (BESLISSING 444) de vergrendeling. Elke stap heeft Verder
// en Overslaan, vanaf stap 2 ook Terug. De stappen staan in hetzelfde vak boven elkaar (de hoogste bepaalt de hoogte), zodat de kaart niet
// verspringt en de knoppen op een vaste plaats staan. Na de laatste stap gaan de keuzes naar dezelfde instellingen als de gewone schermen.
// Stap 4 gebruikt de instelstroom van het scherm Vergrendeling (vergrendeling/instellen.js): Pincode, of de methode van het toestel (Face ID,
// op Android vingerafdruk of schermslot) als het toestel ze heeft, en dan altijd eerst een code als terugval (BESLISSING 194).
// "Nu niet" stelt niets in. In de demo (BESLISSING 364) is er geen vergrendeling en dus geen vierde stap.
// BESLISSING 675: de demo toont dit scherm ook als voorbeeld (src/demo/voorbeeld.js, toon(houder, { voorbeeld })): dan altijd vier stappen, en er
// wordt niets bewaard. Klaar roept voorbeeld.opKlaar(), "Vergrendeling instellen" voorbeeld.opSlot(), Escape voorbeeld.opSluit(). Het uitzicht is hetzelfde.
import { h } from '../ui/dom.js';
import { verjaardagKiezer } from '../ui/verjaardag.js';
import { naAndereBladen } from '../ui/feest.js';
import { kaart, knop, logo, stapper, tekstveld, chips, strook } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { opmaakLiter } from '../kern/getal.js';
import { GRENZEN, STANDAARD, zetInstelling, zetStartKlaar } from '../data/instellingen.js';
import { vraagPermanenteOpslag } from '../data/db.js';
import { DEMO } from '../kern/demo.js';
import { begripTegel } from '../ui/iconenkaart.js';
import { faceIdNaam, methodeTekst, passkeyMogelijk } from '../vergrendeling/passkey.js';
import { isAndroid } from '../kern/toestel.js';
import { bewaarNieuwSlot, codeKiezer, naNieuweCode, slotOptie } from '../vergrendeling/instellen.js';
import { SLOT_SLEUTELS } from '../vergrendeling/herstel.js';

// De stappen: 1 de naam, 2 de geboortedatum (vrijblijvend), 3 het dagdoel, 4 de weegdag en, als het toestel het kan, 5 de vergrendeling.
const GEBOORTE_STAP = 2;
const DOEL_STAP = 3;
const WEEG_STAP = 4;
const SLOT_STAP = 5;
const DAGEN = [1, 2, 3, 4, 5, 6, 7];

export function toon(houder, { voorbeeld = null } = {}) {
  const metSlot = !DEMO || Boolean(voorbeeld);
  const aantal = metSlot ? SLOT_STAP : WEEG_STAP;
  const stand = { naam: '', verjaardag: null, doel: STANDAARD['drinken.dagdoelMl'], weegdag: STANDAARD['gewicht.weegdag'], slotMethode: 'pin' };
  const overgeslagen = new Set(); // stappen waarvoor de standaard geldt
  let nr = 1;
  let bezig = false;

  // ---- Stap 1: de naam
  // De naam is verplicht (BESLISSING 287): zonder naam is Verder uitgeschakeld en is er in deze stap geen Overslaan.
  // De hint onder het veld komt pas nadat ze het probeerde (Enter of het veld verlaten zonder naam).
  const naamMelding = h('p', { class: 't-klein welkom__melding', id: 'welkom-naamhint', 'aria-live': 'polite' });
  const naamVeld = tekstveld({
    plaats: t('welkom.naamPlaats'),
    label: t('welkom.naamLabel'),
    naam: 'naam',
    opWijzig: (w) => {
      stand.naam = w;
      if (w.trim()) naamMelding.textContent = '';
      zetVerder();
    },
  });
  naamVeld.setAttribute('autocomplete', 'given-name');
  naamVeld.setAttribute('aria-describedby', 'welkom-naamhint');
  naamVeld.maxLength = 40;
  const naamLeeg = () => !stand.naam.trim();
  const meldNaam = () => {
    if (naamLeeg()) naamMelding.textContent = t('welkom.naamVerplicht');
  };
  naamVeld.addEventListener('blur', () => {
    if (nr === 1) meldNaam();
  });
  const naamBlok = h('div', { class: 'welkom__naamveld' }, naamVeld, naamMelding);

  // ---- Stap 2: de geboortedatum (dag, maand en jaar). Vrijblijvend: Verder zonder iets te kiezen of Overslaan bewaart niets, en later
  // kan het nog bij Algemeen > Naam en foto.
  const geboorte = verjaardagKiezer({ opWijzig: (waarde) => (stand.verjaardag = waarde) });

  // ---- Stap 2: het dagdoel, met dezelfde grenzen en stap als de instelling Drinken
  const doel = stapper({
    waarde: stand.doel,
    stap: GRENZEN.dagdoelMl.stap,
    min: GRENZEN.dagdoelMl.min,
    max: GRENZEN.dagdoelMl.max,
    opmaak: opmaakLiter,
    label: t('welkom.dagdoelLabel'),
    opWijzig: (n) => (stand.doel = n),
  });
  const doelWaarde = doel.querySelector('.stapper__waarde');
  doelWaarde.tabIndex = -1;

  // ---- Stap 3: de weegdag, dezelfde keuzerij als de instelling Gewicht
  const dagen = h(
    'div',
    { class: 'weegdagen weegdagen--breed' },
    chips({
      keuzes: DAGEN.map((n) => ({ id: n, label: t('instellingen.dagen.' + n) })),
      actief: stand.weegdag,
      label: t('welkom.weegdagLabel'),
      opKies: (n) => (stand.weegdag = n),
    }),
  );

  // ---- Stap 4: de vergrendeling (BESLISSING 444). Dezelfde keuzerijen als op het scherm Vergrendeling (.slot__optie); de tweede keuze
  // staat er alleen als het toestel ze heeft (passkeyMogelijk), met de naam uit passkey.js. Pincode is vooraf gekozen.
  let kanMethode = false;
  let inCode = false; // het cijferblok staat open
  const slotKeuze = h('div', { class: 'slot__keuze', role: 'radiogroup', 'aria-label': t('welkom.slotKeuzeLabel') });
  const slotMelding = h('p', { class: 'slot__boodschap welkom__slotmelding', role: 'status', 'aria-live': 'polite' });
  const slotKeuzeBlok = h(
    'div',
    { class: 'slot__instel welkom__slot' },
    slotKeuze,
    // BESLISSING 518: Bloei haalt de code niet terug, maar de herstelcode (die ze bij het instellen krijgt) helpt haar een nieuwe te kiezen. Met de
    // zin "Dit kan ook later" erbij werd dit op een telefoon drie regels en de kaart 21 px hoger (BESLISSING 514): die zin staat er daarom niet meer.
    h('p', { class: 't-klein slot__uitleg welkom__slotlater' }, t('slot.kwijtGeen') + ' ' + t('welkom.slotHerstel')),
    slotMelding,
  );
  const slotBediening = h('div', { class: 'welkom__slotvak' }, slotKeuzeBlok);
  const gekozenOptie = () => slotKeuze.querySelector('[aria-checked="true"]');
  function tekenSlotKeuze() {
    if (!kanMethode && stand.slotMethode === 'faceid') stand.slotMethode = 'pin';
    const kies = (id) => {
      stand.slotMethode = id;
      slotMelding.textContent = '';
      tekenSlotKeuze();
      gekozenOptie()?.focus({ preventScroll: true });
    };
    const opties = [slotOptie({ id: 'pin', begripTegel: begripTegel('pincode'), label: t('slot.pin'), hint: t('slot.pinHint'), gekozen: stand.slotMethode === 'pin', opKies: kies })];
    // BESLISSING 668: op Android staat in het keuzevak de korte naam (een eigen tekst van het welkomscherm); het scherm Vergrendeling en het slot houden de volle naam
    if (kanMethode) opties.push(slotOptie({ id: 'faceid', begripTegel: begripTegel('gezichtsherkenning'), label: isAndroid() ? t('welkom.methodeAndroid') : faceIdNaam(), hint: methodeTekst('slot.faceHint'), gekozen: stand.slotMethode === 'faceid', opKies: kies }));
    const hadFocus = slotKeuze.contains(document.activeElement);
    slotKeuze.replaceChildren(...opties);
    if (hadFocus) gekozenOptie()?.focus({ preventScroll: true });
  }
  // Pijltjes kiezen binnen de groep (zoals een radiogroep), zonder iets te starten.
  slotKeuze.addEventListener('keydown', (e) => {
    const opties = [...slotKeuze.querySelectorAll('.slot__optie')];
    const nu = opties.indexOf(document.activeElement);
    if (nu < 0 || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    opties[(nu + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1) + opties.length) % opties.length].click();
  });
  if (metSlot) {
    tekenSlotKeuze();
    passkeyMogelijk().then((kan) => {
      kanMethode = kan;
      tekenSlotKeuze();
    });
  }

  const stapEl = (n, vraag, hint, bediening, klasse) =>
    h('div', { class: ['welkom__stap', klasse], 'data-stap': n }, h('h2', { class: 't-h2 welkom__vraag' }, vraag), h('p', { class: 't-klein t-gedempt welkom__hint' }, hint), h('div', { class: 'welkom__bediening' }, bediening));
  const stappen = [
    stapEl(1, t('welkom.stap1'), t('welkom.stap1Hint'), naamBlok),
    stapEl(GEBOORTE_STAP, t('verjaardag.welkomVraag'), t('verjaardag.welkomHint'), geboorte, 'welkom__stap--geboorte'),
    stapEl(DOEL_STAP, t('welkom.stap2'), t('welkom.stap2Hint'), doel),
    stapEl(WEEG_STAP, t('welkom.stap3'), t('welkom.stap3Hint'), dagen),
  ];
  // De hint van stap 4 is de eerlijke regel van de kaart Privacy (BESLISSING 334): de pincode houdt meekijkers buiten, de gegevens zelf zijn niet versleuteld.
  if (metSlot) stappen.push(stapEl(SLOT_STAP, t('welkom.stap4'), t('privacy.regel4'), slotBediening, 'welkom__stap--slot'));
  const slotHint = metSlot ? stappen[SLOT_STAP - 1].querySelector('.welkom__hint') : null;

  // ---- Stapaanduiding
  const bolletjes = Array.from({ length: aantal }, () => h('span', { class: 'welkom__bolletje' }));
  const stapTekst = h('p', { class: 'label welkom__staptekst', 'aria-live': 'polite' });

  // ---- Knoppen
  const verderKnop = knop(t('welkom.verder'), { soort: 'primair', breed: true, opKlik: () => verder() });
  const terugKnop = knop(t('welkom.terug'), { soort: 'tekst', opKlik: () => terug() });
  const slaOverKnop = knop(t('welkom.overslaan'), { soort: 'tekst', opKlik: () => slaOver() });
  // BESLISSING 450: in de laatste stap is "Nu niet" een volwaardige knop (omlijnd, even groot als "Vergrendeling instellen"), onder de hoofdknop.
  // De plek blijft in de andere stappen vrij (onzichtbaar), zodat de kaart niet van hoogte verandert; daar is Overslaan de tekstlink in de rij.
  const nuNietKnop = knop(t('welkom.nuNiet'), { soort: 'secundair', breed: true, opKlik: () => slaOver() });
  nuNietKnop.classList.add('welkom__nuniet');
  const knoppen = h('div', { class: 'welkom__knoppen' }, verderKnop, nuNietKnop, h('div', { class: 'welkom__rij' }, terugKnop, slaOverKnop));

  const opSlotStap = () => metSlot && nr === SLOT_STAP;

  function zetKnopTekst(k, tekst) {
    const span = k.querySelector('.knop__tekst');
    if (span && span.textContent !== tekst) span.textContent = tekst;
  }

  function toonStap() {
    stappen.forEach((el, i) => {
      const actief = i + 1 === nr;
      el.classList.toggle('is-actief', actief);
      el.toggleAttribute('inert', !actief);
      el.setAttribute('aria-hidden', String(!actief));
    });
    bolletjes.forEach((b, i) => b.classList.toggle('is-actief', i + 1 <= nr));
    stapTekst.textContent = t('welkom.stapVan', { nr: String(nr), totaal: String(aantal) });
    // In de laatste stap (de vergrendeling) heten de knoppen "Vergrendeling instellen" en "Nu niet".
    zetKnopTekst(verderKnop, t(opSlotStap() ? 'welkom.slotInstellen' : 'welkom.verder'));
    terugKnop.classList.toggle('is-weg', nr === 1);
    terugKnop.toggleAttribute('inert', nr === 1);
    // In stap 1 is er geen Overslaan; de plek blijft vrij, zodat de knoppenrij en de kaart niet van hoogte veranderen.
    // In stap 4 neemt de knop "Nu niet" (onder de hoofdknop) de plaats van de tekstlink Overslaan in.
    const weg = nr === 1 || opSlotStap();
    slaOverKnop.classList.toggle('is-weg', weg);
    slaOverKnop.toggleAttribute('inert', weg);
    nuNietKnop.classList.toggle('is-weg', !opSlotStap());
    nuNietKnop.toggleAttribute('inert', !opSlotStap());
    nuNietKnop.setAttribute('aria-hidden', String(!opSlotStap()));
    zetVerder();
    zetFocus();
  }

  function zetVerder() {
    verderKnop.disabled = bezig || (nr === 1 && naamLeeg());
  }

  function zetFocus() {
    const doelEl =
      nr === 1 ? naamVeld : nr === GEBOORTE_STAP ? geboorte.querySelector('select') : nr === DOEL_STAP ? doelWaarde : nr === WEEG_STAP ? dagen.querySelector('.chip.is-actief') || dagen.querySelector('.chip') : gekozenOptie();
    doelEl?.focus({ preventScroll: true });
  }

  function terug() {
    if (nr <= 1 || bezig || inCode) return;
    nr -= 1;
    toonStap();
  }

  function slaOver() {
    if (nr === 1 || inCode) return; // de naam is verplicht
    overgeslagen.add(nr);
    if (nr === DOEL_STAP) {
      stand.doel = STANDAARD['drinken.dagdoelMl'];
      doel.zetWaarde(stand.doel);
    }
    gaDoor();
  }

  function verder() {
    if (inCode) return;
    if (opSlotStap()) {
      if (voorbeeld) voorbeeld.opSlot?.(); // geen cijferblok en geen slot in het voorbeeld
      else if (!bezig) toonCode();
      return;
    }
    if (nr === 1 && naamLeeg()) {
      meldNaam();
      return;
    }
    overgeslagen.delete(nr);
    gaDoor();
  }

  function gaDoor() {
    if (bezig || inCode) return;
    if (nr < aantal) {
      nr += 1;
      toonStap();
      return;
    }
    klaar();
  }

  // ---- Stap 4: het cijferblok (de gedeelde stroom van het scherm Vergrendeling). Zolang het openstaat, zijn Verder, Terug en Nu niet weg;
  // Annuleren brengt haar terug bij de keuze. Bij de methode van het toestel staat eerst dezelfde zin als op het scherm Vergrendeling.
  function toonCode() {
    inCode = true;
    slotMelding.textContent = '';
    const kiezer = codeKiezer({
      opKlaar: (code) => naCode(code),
      opTerug: () => toonKeuze(),
      intro: stand.slotMethode === 'faceid' ? methodeTekst('slot.eerstCode') : null,
    });
    // BESLISSING 514: de kaart houdt de hoogte van de stappen, ook met het cijferblok open (hoogte via CSSOM, mag onder de CSP)
    const kaartEl = slotBediening.closest('.welkom__kaart');
    if (kaartEl) { kaartEl.style.height = kaartEl.offsetHeight + 'px'; kaartEl.classList.add('is-code'); }
    zetKnoppen(false);
    if (slotHint) slotHint.hidden = true;
    slotBediening.replaceChildren(kiezer.el);
    kiezer.focus();
  }

  // BESLISSING 518: na de code (gedeelde stroom, instellen.js) de herstelcode, in dezelfde kaart met dezelfde hoogte (is-code). In die stap maakt
  // ook de kop (logo en titel) plaats (is-herstel); "Stap 4 van 4" blijft staan. BESLISSING 541: de vraag "Je toestel als hulp" bestaat niet
  // meer; bij Pincode opent er geen systeemvenster, bij de methode van het toestel eerst de vraag van het toestel (en zo nodig "Dat lukte niet").
  // Er wordt pas iets bewaard bij Verder onder de herstelcode (klaar); Annuleren brengt haar terug bij de keuze zonder iets te bewaren.
  function naCode(code) {
    const kaartEl = slotBediening.closest('.welkom__kaart');
    naNieuweCode({
      methode: stand.slotMethode,
      leesNaam: async () => stand.naam.trim(),
      toon: (el, focus) => {
        kaartEl?.classList.add('is-herstel');
        slotBediening.replaceChildren(el);
        focus();
      },
      opTerug: () => toonKeuze(),
      opKlaar: (voorbereid) => klaar({ code, ...voorbereid }),
    });
  }

  function toonKeuze(melding = '') {
    inCode = false;
    zetKnoppen(true);
    const kaartEl = slotBediening.closest('.welkom__kaart');
    if (kaartEl) { kaartEl.style.height = ''; kaartEl.classList.remove('is-code', 'is-herstel'); }
    if (slotHint) slotHint.hidden = false;
    slotBediening.replaceChildren(slotKeuzeBlok);
    slotMelding.textContent = melding;
    zetVerder();
    gekozenOptie()?.focus({ preventScroll: true });
  }

  // De knoppen onder de kaart weg (inert en niet getoond) of terug, zolang het cijferblok openstaat. display via CSSOM (mag onder de CSP).
  function zetKnoppen(zichtbaar) {
    knoppen.inert = !zichtbaar;
    if (zichtbaar) knoppen.style.removeProperty('display');
    else knoppen.style.setProperty('display', 'none');
  }

  // Een mislukte bewaarbeurt laat geen half slot achter: wat er al stond, gaat weer uit (zo goed als het lukt).
  async function ruimHalfSlotOp() {
    for (const sleutel of SLOT_SLEUTELS) {
      try {
        await zetInstelling(sleutel, sleutel === 'slot.aan' ? false : null);
      } catch {
        /* de rest proberen */
      }
    }
  }

  // Bewaart in dezelfde instellingen als de gewone schermen, zet start.klaar en gaat naar Vandaag.
  // slot: { code, methode, passkeyId, herstel } als ze in stap 4 een code koos en haar herstelcode bewaarde (naCode); zonder slot
  // ("Nu niet", of de demo) verandert er niets aan de vergrendeling.
  // Eerst het slot (lukt de toestelvraag niet, dan is er nog niets bewaard), dan de keuzes, en start.klaar als laatste.
  async function klaar(slot = null) {
    if (voorbeeld) return voorbeeld.opKlaar(); // het voorbeeld bewaart niets
    bezig = true;
    verderKnop.disabled = true;
    slaOverKnop.disabled = true;
    nuNietKnop.disabled = true;
    let slotBewaard = false;
    try {
      if (slot) {
        const { code, ...rest } = slot;
        slotBewaard = await bewaarNieuwSlot(code, { ...rest, leesNaam: async () => stand.naam.trim() });
        if (!slotBewaard) {
          // De toestelvraag werd geannuleerd of mislukte: niets ingesteld; ze blijft op deze stap en kiest opnieuw of Nu niet.
          bezig = false;
          slaOverKnop.disabled = nuNietKnop.disabled = false;
          toonKeuze(t('welkom.slotMislukt'));
          return;
        }
      }
      const naam = stand.naam.trim();
      if (naam) await zetInstelling('profiel.naam', naam);
      if (stand.verjaardag && !overgeslagen.has(GEBOORTE_STAP)) await zetInstelling('profiel.verjaardag', stand.verjaardag);
      await zetInstelling('profiel.verjaardagGevraagd', true); // de vraag is hier gesteld: het blad voor bestaande gebruikers komt niet meer (ui/verjaardag.js)
      await zetInstelling('drinken.dagdoelMl', overgeslagen.has(DOEL_STAP) ? STANDAARD['drinken.dagdoelMl'] : stand.doel);
      await zetInstelling('gewicht.weegdag', overgeslagen.has(WEEG_STAP) ? STANDAARD['gewicht.weegdag'] : stand.weegdag);
      await zetStartKlaar();
    } catch {
      // R2-16: het bewaren mislukte; ze blijft op deze stap met haar keuzes en kan het opnieuw proberen.
      if (slot) await ruimHalfSlotOp();
      bezig = false;
      slaOverKnop.disabled = nuNietKnop.disabled = false;
      if (inCode) toonKeuze(t('algemeen.foutOpslag'));
      zetVerder();
      strook(t('algemeen.foutOpslag'));
      return;
    }
    vraagPermanenteOpslag();
    window.location.hash = '#/vandaag';
    // Is het vandaag haar verjaardag (of 1 januari), dan viert Bloei dat meteen mee (ui/feest.js). Even wachten tot Vandaag er staat: een
    // wissel van scherm sluit wat er nog openstaat.
    setTimeout(() => naAndereBladen(), 1000);
    // De app blijft open (het slot vraagt de code pas bij de volgende keer openen of terugkeren), met de bevestiging van het scherm Vergrendeling.
    if (slotBewaard) strook(t('slot.ingesteld'));
  }

  // Enter gaat verder, ook vanuit het getal van de stapper en de dagkeuze (daar zou Enter anders iets kiezen).
  const opToets = (e) => {
    if (voorbeeld && e.key === 'Escape') return voorbeeld.opSluit?.();
    if (e.key !== 'Enter' || e.isComposing) return;
    const doelEl = e.target;
    if (doelEl instanceof HTMLInputElement || doelEl === doelWaarde || doelEl.closest?.('.weegdagen')) {
      e.preventDefault();
      verder();
    }
  };

  const el = h(
    'section',
    { class: 'welkom', 'aria-labelledby': 'welkom-titel' },
    kaart(
      { klasse: 'welkom__kaart' },
      // twee houders: op een liggende telefoon de linker- en de rechterkolom, op elke andere maat display: contents (scherm-algemeen.css)
      h(
        'div',
        { class: 'welkom__kol welkom__kol--links' },
        h('header', { class: 'welkom__kop' }, logo({ grootte: 34 }), h('h1', { class: 't-h1 welkom__titel', id: 'welkom-titel' }, t('welkom.titel')), h('p', { class: 'welkom__intro' }, t(metSlot ? 'welkom.intro' : 'welkom.introKort'))),
        h('div', { class: 'welkom__voortgang' }, h('div', { class: 'welkom__bolletjes', 'aria-hidden': 'true' }, ...bolletjes), stapTekst),
      ),
      h('div', { class: 'welkom__kol welkom__kol--rechts' }, h('div', { class: 'welkom__stappen' }, ...stappen), knoppen),
    ),
  );
  el.addEventListener('keydown', opToets);
  houder.replaceChildren(el);
  toonStap();
}
