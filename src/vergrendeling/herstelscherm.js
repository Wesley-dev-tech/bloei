// De onderdelen van het herstellen (BESLISSING 518) die op meer dan één plek staan: het welkomscherm (stap 4), het scherm Vergrendeling en
// het slotscherm. Opmaak: src/stijl/slot.css (.herstel). De logica en de opslag staan in herstel.js.
//  - herstelcodeStap: de herstelcode één keer tonen, met Kopiëren, Bewaren als bestand en het vinkje "Ik heb ze bewaard" (verplicht voor Verder);
//  - toestelOpnieuw: bij het instellen met de methode Face ID, als de vraag van het toestel niet lukte (BESLISSING 530). De vraag "Je toestel
//    als hulp" bij Pincode bestaat niet meer (BESLISSING 541);
//  - herstelInvoer: de herstelcode ingeven op het slotscherm.
// De code staat alleen in deze stap in het geheugen: nergens in de opslag, de adresbalk of de console.
import { h } from '../ui/dom.js';
import { knop, vinkvak } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { isAndroid, isIos } from '../kern/toestel.js';
import { methodeTekst } from './passkey.js';
import { BESTANDSNAAM, bestandTekst, voorleesbaar } from './herstel.js';

let teller = 0;
const nieuwId = (basis) => `${basis}-${(teller += 1)}`;

// Bij ECHT verlaten (verborgen of pagehide; niet bij blur alleen, BESLISSING 532) staat een herstelcode niet meer in de pagina: de momentopname
// van de app-wisselaar kan ze dan niet tonen, ook niet in het welkomscherm of bij het aanzetten (daar staat het slot nog uit) en niet tijdens een
// herstel op het slotscherm (daar ligt geen gordijn). verberg() haalt ze uit de pagina, toon() zet ze terug: de code blijft in het geheugen van deze
// stap, dus bij terugkeer kan ze gewoon verder. Ruimt zichzelf op zodra de stap niet meer in de pagina staat.
function verbergBijVerlaten(el, { verberg, toon }) {
  let gezien = false;
  const los = () => {
    document.removeEventListener('visibilitychange', opZicht);
    window.removeEventListener('pagehide', opWeg);
    window.removeEventListener('pageshow', opTerug);
  };
  const weg = () => {
    if (el.isConnected) gezien = true;
    if (gezien && !el.isConnected) return los(), false;
    return true;
  };
  const opZicht = () => weg() && (document.visibilityState === 'hidden' ? verberg() : toon());
  const opWeg = () => weg() && verberg();
  const opTerug = () => weg() && document.visibilityState !== 'hidden' && toon();
  document.addEventListener('visibilitychange', opZicht);
  window.addEventListener('pagehide', opWeg);
  window.addEventListener('pageshow', opTerug);
}

// Het bestandje: op een iPhone, iPad of Android-toestel via het deelmenu (daar kies je "Bewaar in Bestanden" of een map), elders als download.
// Geeft 'gedeeld', 'gedownload', 'geannuleerd' of 'mislukt'.
export async function bewaarAlsBestand(code) {
  const tekst = bestandTekst(code, { kop: t('slot.bestandKop'), uitleg: t('slot.bestandUitleg'), wie: t('slot.herstelWie') });
  let bestand;
  try {
    bestand = new File([tekst], BESTANDSNAAM, { type: 'text/plain' });
  } catch {
    return 'mislukt';
  }
  if ((isIos() || isAndroid()) && typeof navigator.share === 'function') {
    let kan = false;
    try {
      kan = typeof navigator.canShare === 'function' && navigator.canShare({ files: [bestand] });
    } catch {
      kan = false;
    }
    if (kan) {
      try {
        await navigator.share({ files: [bestand] }); // de schil zet hier een vrijstelling rond (vrijstelling.js)
        return 'gedeeld';
      } catch (fout) {
        if (fout?.name === 'AbortError') return 'geannuleerd';
        // anders: de gewone download hieronder
      }
    }
  }
  try {
    const url = URL.createObjectURL(bestand);
    const a = h('a', { href: url, download: BESTANDSNAAM, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'gedownload';
  } catch {
    return 'mislukt';
  }
}

async function kopieer(code) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}

// herstelcodeStap({ code, titel, kop = 'h2', extra, opVerder, opTerug })
//   opVerder(): wordt opgeroepen als het vinkje aan staat en ze op Verder tikt; een fout daarin toont een melding en laat de stap staan.
//   opTerug: optioneel (Annuleren); alleen waar er nog niets bewaard is.
// Geeft { el, focus() }.
export function herstelcodeStap({ code, titel = t('slot.herstelTitel'), kop = 'h2', extra = null, opVerder, opTerug = null }) {
  const titelId = nieuwId('herstel-titel');
  const uitlegId = nieuwId('herstel-uitleg');
  const titelEl = h(kop, { class: [kop === 'h1' ? 't-h1 slot__titel' : 't-h2', 'herstel__titel'], id: titelId, tabindex: '-1' }, titel);
  const melding = h('p', { class: 'slot__boodschap herstel__melding', role: 'status', 'aria-live': 'polite' });
  const voorlezen = t('slot.herstelVoorlezen', { code: voorleesbaar(code) });
  const codeEl = h('p', { class: 'herstel__code', 'aria-hidden': 'true', translate: 'no' }, code);
  const leesEl = h('p', { class: 'alleen-lezer' }, voorlezen);
  let bewaard = false;
  let bezig = false;

  const verder = knop(t('slot.herstelVerder'), {
    soort: 'primair',
    breed: true,
    uitgeschakeld: true,
    opKlik: async () => {
      if (!bewaard || bezig) return;
      bezig = true;
      verder.disabled = true;
      try {
        await opVerder?.();
      } catch {
        melding.textContent = t('algemeen.foutOpslag');
        bezig = false;
        verder.disabled = !bewaard;
      }
    },
  });
  const vink = vinkvak({
    label: t('slot.herstelBewaard'),
    opWissel: (aan) => {
      bewaard = aan;
      verder.disabled = !aan || bezig;
    },
  });
  vink.classList.add('herstel__vink');

  const knoppen = h(
    'div',
    { class: 'herstel__knoppen' },
    knop(t('slot.herstelKopieer'), {
      soort: 'secundair',
      opKlik: async () => {
        melding.textContent = (await kopieer(code)) ? t('slot.herstelGekopieerd') : t('slot.herstelKopieerNiet');
      },
    }),
    knop(t('slot.herstelBestand'), {
      soort: 'secundair',
      opKlik: async () => {
        const uit = await bewaarAlsBestand(code);
        if (uit === 'mislukt') melding.textContent = t('slot.herstelBestandNiet');
        else if (uit !== 'geannuleerd') melding.textContent = t('slot.herstelBestandKlaar', { bestand: BESTANDSNAAM });
      },
    }),
  );

  const el = h(
    'div',
    { class: 'slot__instel herstel', role: 'group', 'aria-labelledby': titelId, 'aria-describedby': uitlegId, 'data-herstelstap': '' },
    titelEl,
    // Groot en leesbaar; een schermlezer leest de code teken per teken (de zichtbare vorm is voor hem verborgen).
    codeEl,
    leesEl,
    h('p', { class: 'slot__uitleg herstel__uitleg', id: uitlegId }, [extra, t('slot.herstelUitleg'), t('slot.herstelWie')].filter(Boolean).join(' ')),
    // slot__kant: telt niet mee als vak (slot.css); op een liggende telefoon in het slot de rechterkolom (BESLISSING 654)
    h('div', { class: 'slot__kant' }, knoppen, melding, vink, verder, opTerug ? knop(t('slot.annuleer'), { soort: 'tekst', opKlik: opTerug }) : null),
  );
  verbergBijVerlaten(el, {
    verberg: () => {
      codeEl.textContent = '';
      leesEl.textContent = '';
    },
    toon: () => {
      codeEl.textContent = code;
      leesEl.textContent = voorlezen;
    },
  });
  return { el, focus: () => titelEl.focus({ preventScroll: true }) };
}

// BESLISSING 530: lukte de vraag van het toestel bij de methode Face ID (of vingerafdruk of schermslot) niet (geannuleerd, mislukt, time-out), dan
// blijft de gekozen code in het geheugen: opnieuw proberen, of verder met alleen de pincode. Nooit de code nog eens laten intikken.
export function toestelOpnieuw({ opJa, opNee, opTerug, kop = 'h2' }) {
  return toestelKeuze({ kop, titel: t('slot.toestelOpnieuwTitel'), tekst: methodeTekst('slot.toestelOpnieuwTekst'), jaTekst: t('slot.toestelOpnieuw'), neeTekst: t('slot.toestelZonder'), opJa, opNee, opTerug, data: 'data-toestelopnieuw' });
}

// Een vraag met twee gelijkwaardige knoppen naast elkaar (BESLISSING 522: even breed en gecentreerd; op een smalle telefoon onder elkaar).
function toestelKeuze({ kop, titel, tekst, jaTekst, neeTekst, opJa, opNee, opTerug = null, data }) {
  const titelId = nieuwId('toestel-titel');
  const titelEl = h(kop, { class: [kop === 'h1' ? 't-h1 slot__titel' : 't-h2', 'herstel__titel'], id: titelId, tabindex: '-1' }, titel);
  const melding = h('p', { class: 'slot__boodschap', role: 'status', 'aria-live': 'polite' });
  let bezig = false;
  const ja = knop(jaTekst, {
    soort: 'primair',
    breed: true,
    opKlik: async () => {
      if (bezig) return;
      bezig = true;
      ja.disabled = nee.disabled = true;
      try {
        await opJa?.();
      } finally {
        bezig = false;
        if (ja.isConnected) ja.disabled = nee.disabled = false;
      }
    },
  });
  const nee = knop(neeTekst, { soort: 'secundair', breed: true, opKlik: () => !bezig && opNee?.() });
  const el = h(
    'div',
    { class: 'slot__instel herstel herstel--toestel', role: 'group', 'aria-labelledby': titelId, [data]: '' },
    titelEl,
    h('p', { class: 'slot__uitleg' }, tekst),
    melding,
    h('div', { class: 'herstel__keuze' }, ja, nee),
    opTerug ? knop(t('slot.annuleer'), { soort: 'tekst', opKlik: () => !bezig && opTerug() }) : null,
  );
  return {
    el,
    focus: () => titelEl.focus({ preventScroll: true }),
    meld: (tekst) => {
      melding.textContent = tekst;
    },
  };
}

// herstelInvoer({ opIngave(tekst) geeft een Promise<string|null>, opTerug }): een veld voor de herstelcode op het slotscherm. opIngave geeft een
// melding terug (fout, wachttijd) of null als het lukte. Enter of Verder bevestigt. Geeft { el, focus(), boodschap, zetUit(bool) }.
export function herstelInvoer({ opIngave, opTerug }) {
  const veldId = nieuwId('herstel-veld');
  const hulpId = nieuwId('herstel-hulp');
  const boodschap = h('p', { class: 'slot__boodschap', id: hulpId, role: 'status', 'aria-live': 'polite' });
  const veld = h('input', {
    class: 'veld__invoer herstel__veld',
    id: veldId,
    type: 'text',
    name: 'herstelcode',
    autocomplete: 'off',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: 'text',
    maxlength: '24',
    'aria-describedby': hulpId,
    translate: 'no',
  });
  let bezig = false;
  let uit = false;
  const verder = knop(t('slot.herstelVerder'), { soort: 'primair', breed: true, type: 'submit' });
  const zetUit = (waarde) => {
    uit = Boolean(waarde);
    veld.disabled = uit;
    verder.disabled = uit || bezig;
  };
  const formulier = h(
    'form',
    { class: 'herstel__formulier', novalidate: true },
    h('label', { class: 'label herstel__label', for: veldId }, t('slot.herstelVeld')),
    veld,
    boodschap,
    verder,
  );
  formulier.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (bezig || uit) return;
    bezig = true;
    verder.disabled = true;
    try {
      const fout = await opIngave(veld.value);
      if (fout) {
        boodschap.textContent = fout;
        if (!veld.disabled) {
          veld.focus({ preventScroll: true });
          veld.select();
        }
      }
    } finally {
      bezig = false;
      verder.disabled = uit;
    }
  });
  const el = h('div', { class: 'slot__instel herstel herstel--invoer' }, formulier, knop(t('slot.terug'), { soort: 'tekst', opKlik: opTerug }));
  // een ingetikte herstelcode verdwijnt bij echt verlaten uit het veld en komt bij terugkeer terug
  let bewaardeInvoer = null;
  verbergBijVerlaten(el, {
    verberg: () => {
      if (bewaardeInvoer === null) bewaardeInvoer = veld.value;
      veld.value = '';
    },
    toon: () => {
      if (bewaardeInvoer !== null && !veld.value) veld.value = bewaardeInvoer;
      bewaardeInvoer = null;
    },
  });
  return { el, focus: () => veld.focus({ preventScroll: true }), boodschap, zetUit };
}
