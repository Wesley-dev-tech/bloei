// De instelstroom van de vergrendeling, op één plek: een nieuwe code kiezen (twee keer) en het slot bewaren met Pincode of Face ID.
// Gebruikt door het scherm Vergrendeling (scherm.js) en door de laatste stap van het welkomscherm (schermen/welkom.js, BESLISSING 444).
// Zelfde regels als altijd: zes cijfers (PIN_LENGTE), de code twee keer, opslag via pin.js; bij Face ID eerst de code (de terugval,
// BESLISSING 194) en pas daarna de toestelvraag. Pas na alle stappen wordt er iets bewaard; slot.aan komt als laatste.
// BESLISSING 518: na de code volgt altijd de herstelcode (één keer getoond, met het vinkje "Ik heb ze bewaard"). Ook dan wordt er pas iets
// bewaard na de laatste stap: sluit de app tussendoor, dan staat het slot gewoon uit en is er geen half slot.
// BESLISSING 541: de vraag "Je toestel als hulp" vervalt. Het toestel helpt bij een vergeten code zonder koppeling (slot.js, passkey.js), dus bij
// Pincode opent er tijdens het instellen geen systeemvenster meer; alleen de methode Face ID vraagt het toestel iets.
import { h } from '../ui/dom.js';
import { knop } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { zetInstelling } from '../data/instellingen.js';
import { PIN_LENGTE, maakPin } from './pin.js';
import { maakPasskey, vergeetPasskey } from './passkey.js';
import { cijferblok } from './cijferblok.js';
import { ruimHerstelvraagOp } from './slot.js';
import { maakHerstel, maakHerstelcode } from './herstel.js';
import { herstelcodeStap, toestelOpnieuw } from './herstelscherm.js';

// Een nieuwe code kiezen: twee keer ingeven; verschillen ze, dan opnieuw. opKlaar(code) krijgt de bevestigde code, opTerug is Annuleren.
// intro: een zin boven de vraag (bij Face ID: eerst een code als terugval). Geeft { el, focus() }; de plaatsing doet de oproeper.
// bevestigen = false (BESLISSING 533, alleen bij Pincode wijzigen): de nieuwe code één keer; het vangnet is dan Ongedaan maken (scherm.js).
export function codeKiezer({ opKlaar, opTerug, intro = null, bevestigen = true }) {
  let eerste = null;
  const uitleg = h('p', { class: 'slot__uitleg' }, t(bevestigen ? 'slot.pinKies' : 'slot.pinNieuw'));
  const boodschap = h('p', { class: 'slot__boodschap', role: 'status', 'aria-live': 'polite' });
  const blok = cijferblok({
    lengte: PIN_LENGTE,
    opKlaar: async (code) => {
      if (!bevestigen) {
        opKlaar(code);
        return true;
      }
      if (eerste === null) {
        eerste = code;
        uitleg.textContent = t('slot.pinNogEens');
        boodschap.textContent = '';
        return true;
      }
      if (code !== eerste) {
        eerste = null;
        uitleg.textContent = t('slot.pinKies');
        boodschap.textContent = t('slot.pinVerschilt');
        return false;
      }
      opKlaar(code);
      return true;
    },
  });
  const el = h('div', { class: 'slot__instel' }, intro ? h('p', { class: 'slot__eerlijk' }, intro) : null, uitleg, blok.el, boodschap, knop(t('slot.annuleer'), { soort: 'tekst', opKlik: opTerug }));
  return { el, focus: () => blok.focus() };
}

// Bewaart een nieuw slot met de bevestigde code. methode 'pin' of 'faceid'; leesNaam() geeft de naam voor de passkey.
// passkeyId: een passkey die de stroom hieronder al maakte (anders vraagt deze functie het toestel bij Face ID zelf).
// herstel (BESLISSING 518): de afgeleide van de herstelcode; alleen als ze meegegeven is. (Een herstelsleutel van het toestel bestaat niet meer, 541.)
// Geeft true als alles bewaard is, false als de toestelvraag (Face ID, vingerafdruk) mislukte of geannuleerd werd: dan is er niets bewaard.
// Een fout bij het bewaren gaat door naar de oproeper (zoals altijd op het scherm Vergrendeling). slot.aan komt als laatste: tot dan blijft het slot uit.
export async function bewaarNieuwSlot(code, { methode = 'pin', leesNaam = async () => '', passkeyId = null, herstel } = {}) {
  const metFaceId = methode === 'faceid';
  const pin = await maakPin(code);
  let id = metFaceId ? passkeyId : null;
  if (metFaceId && !id) {
    id = await maakPasskey(await leesNaam());
    if (!id) return false;
  }
  await zetInstelling('slot.pin', pin);
  await ruimHerstelvraagOp();
  await zetInstelling('slot.passkeyId', id);
  await zetInstelling('slot.methode', metFaceId ? 'faceid' : 'pin');
  if (herstel !== undefined) {
    await zetInstelling('slot.herstel', herstel);
    await zetInstelling('slot.herstelFouten', 0);
    await zetInstelling('slot.herstelWachtTot', 0);
  }
  await zetInstelling('slot.fouten', 0);
  await zetInstelling('slot.wachtTot', 0);
  await zetInstelling('slot.aan', true);
  return true;
}

// De stappen na een bevestigde code bij het INSTELLEN (BESLISSING 518). Er wordt hier niets bewaard: opKlaar krijgt alles wat bewaarNieuwSlot nodig heeft.
//   toon(el, focus): de oproeper zet het onderdeel op zijn plaats (scherm Vergrendeling of de welkomkaart).
//   methode 'faceid': eerst de toestelvraag (zoals altijd). Lukt ze niet, dan blijft de gekozen code in het geheugen (BESLISSING 530): opnieuw
//   proberen, of verder met alleen de pincode. Ze tikt haar code dus nooit vaker dan twee keer in.
//   methode 'pin': meteen de herstelcode, zonder systeemvenster (BESLISSING 541: de vraag "Je toestel als hulp" vervalt).
//   Daarna de herstelcode, één keer getoond. Annuleren (opTerug) laat niets achter, ook geen passkey die al gemaakt was.
// opKlaar({ methode, passkeyId, herstel }) mag een fout gooien: de stap toont dan een melding en blijft staan.
// Een oude oproeper die nog kanToestel meegeeft, verandert niets: de parameter wordt genegeerd.
export function naNieuweCode({ methode, leesNaam = async () => '', toon, opKlaar, opTerug, kop = 'h2' }) {
  let metFaceId = methode === 'faceid';
  let passkeyId = null;
  // De naam meteen lezen: de vraag van het toestel volgt dan zonder wachten op de tik (sommige browsers eisen dat).
  const naam = Promise.resolve().then(leesNaam).catch(() => '');

  const annuleer = async () => {
    if (passkeyId) await vergeetPasskey(passkeyId);
    opTerug?.();
  };

  function toonHerstelcode() {
    const code = maakHerstelcode();
    const stap = herstelcodeStap({
      code,
      kop,
      opTerug: annuleer,
      opVerder: async () => {
        const herstel = await maakHerstel(code, { bevestigd: true });
        await opKlaar({ methode: metFaceId ? 'faceid' : 'pin', passkeyId, herstel });
      },
    });
    toon(stap.el, stap.focus);
  }

  // Face ID (of vingerafdruk of schermslot) als methode: lukt de vraag van het toestel niet, dan opnieuw of verder met de pincode.
  function toonOpnieuw() {
    const keuze = toestelOpnieuw({
      kop,
      opJa: async () => {
        passkeyId = await maakPasskey(await naam);
        if (passkeyId) toonHerstelcode();
        else keuze.meld(t('slot.toestelMislukt'));
      },
      opNee: () => {
        metFaceId = false;
        toonHerstelcode();
      },
      opTerug: annuleer,
    });
    toon(keuze.el, keuze.focus);
  }

  (async () => {
    if (metFaceId) {
      passkeyId = await maakPasskey(await naam);
      return passkeyId ? toonHerstelcode() : toonOpnieuw();
    }
    return toonHerstelcode();
  })();
}

// Eén keuze Pincode of Face ID (role radio), dezelfde opmaak als op het scherm Vergrendeling (slot.css: .slot__optie).
export function slotOptie({ id, begripTegel, label, hint, gekozen = false, uit = false, opKies }) {
  const k = h(
    'button',
    { type: 'button', role: 'radio', class: ['slot__optie', 'licht-op-icoon', gekozen && 'is-gekozen'], 'aria-checked': String(gekozen), tabindex: gekozen ? '0' : '-1', disabled: uit, 'data-methode': id },
    begripTegel,
    h('span', { class: 'slot__optietekst' }, h('span', { class: 'slot__optielabel' }, label), h('span', { class: 'slot__optiehint' }, hint)),
    h('span', { class: 'slot__radio', 'aria-hidden': 'true' }),
  );
  if (opKies) k.addEventListener('click', () => opKies(id));
  return k;
}
