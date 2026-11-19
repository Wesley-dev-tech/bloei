// Meer › Vergrendeling (#/meer/vergrendeling) in de vaste opbouw van een instelscherm (layout.css): links de kaart met de
// schakelaar Vergrendeling en daaronder een keuze uit twee, Pincode of Face ID (precies één, BESLISSING 194), met het slot aan ook de
// kaart Ontgrendelen (de code); rechts een levend voorbeeld van het slotscherm dat meeverandert.
// Aanzetten: code 2x (altijd verplicht, ze is de terugval) en bij Face ID de toestelvraag, dan de herstelcode (BESLISSING 518). Geen herstelvraag.
// Wijzigen, uitzetten, overschakelen naar Face ID en een nieuwe herstelcode vragen eerst de huidige code (BESLISSING 403) of, bij Face ID, een
// bevestiging met de passkey van het slot: wie de ontgrendelde app in handen heeft, kan zonder dat niets overnemen.
// BESLISSING 541: de rij "Herstel met Face ID" (Koppelen, Ontkoppelen) vervalt; het toestel helpt bij een vergeten code zonder koppeling (slot.js).
import { h } from '../ui/dom.js';
import { bevestig, kaart, kaartkop, knop, rij, schakelaar, schermkop, strook } from '../ui/componenten.js';
import { eersteToon, komOp } from '../ui/beweging.js';
import { t } from '../teksten.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { PIN_LENGTE, maakPin } from './pin.js';
import { faceIdNaam, maakPasskey, methodeTekst, passkeyMogelijk, vergeetPasskey, vraagPasskey } from './passkey.js';
import { cijferblok } from './cijferblok.js';
import { bewaarNieuwSlot, codeKiezer, naNieuweCode, slotOptie } from './instellen.js';
import { bewaarSamen, heeftBevestigdeHerstelcode, leesHerstel, maakHerstel, maakHerstelcode, toestelSleutel, wisSlotgegevens } from './herstel.js';
import { herstelcodeStap } from './herstelscherm.js';
import { slotVoorbeeld } from './voorbeeld.js';
import { startRondleiding } from '../uitleg/rondleiding.js';
import { toonHetBlok } from '../ui/uitleghaken.js';
import { ICOON, begripOpties, begripTegel } from '../ui/iconenkaart.js';
import { controleerHuidigeCode, leesMethode, leesPinLengte, ruimHerstelvraagOp, wachtTekst } from './slot.js';
import { DEMO } from '../kern/demo.js';
import { isAndroid } from '../kern/toestel.js';
import { datumVoluit, naarSleutel } from '../kern/datum.js';
import { weetjes as maakWeetjes } from '../ui/weetjes.js';

// Hoe lang "Ongedaan maken" na het wijzigen van de pincode kan: dezelfde duur als de andere stroken met Ongedaan maken (gewicht.js).
const ONGEDAAN_MS = 6000;

export function toon(houder) {
  let weg = false;
  const stop = () => {
    weg = true;
  };
  const naam = faceIdNaam();
  const ft = (sleutel) => methodeTekst(sleutel); // buiten Android letterlijk t(sleutel, { naam: 'Face ID' }) (AN-04)

  const terugKnop = () => knop(t('meer.terug'), { soort: 'tekst', icoon: ICOON.terug.naam, opKlik: () => (window.location.hash = '#/meer') });
  const kop = () => schermkop({ titel: t('slot.titel'), acties: [terugKnop()] });
  // Alles staat in dezelfde schil als de andere subschermen van Meer.
  const zet = (...kinderen) => {
    if (!weg) houder.replaceChildren(h('div', { class: 'stapel stapel--sectie meer-sub slot-scherm' }, kop(), ...kinderen));
  };

  // ---- Een code ingeven en controleren (de huidige code) ----
  // Is er een sleutel van dit toestel gekoppeld (Face ID, of het toestel als herstelweg), dan kan ze ook met het toestel bevestigen (BESLISSING 518).
  // Annuleren of mislukken van de toestelvraag telt niet als foute poging. vraagPasskey kijkt het antwoord na zoals op het slotscherm en bij het
  // herstel (passkey.js, controleerBevestiging): een antwoord dat niet klopt, opent hier niets.
  async function vraagHuidigeCode(opKlaar, opTerug) {
    const lengte = await leesPinLengte();
    const toestelId = await toestelSleutel();
    const metToestel = Boolean(toestelId) && (await passkeyMogelijk());
    const boodschap = h('p', { class: 'slot__boodschap', role: 'status', 'aria-live': 'polite' });
    const blok = cijferblok({
      lengte,
      opKlaar: async (code) => {
        const uitslag = await controleerHuidigeCode(code);
        if (uitslag.ok) {
          opKlaar();
          return true;
        }
        boodschap.textContent = uitslag.wachtMs > 0 ? wachtTekst(uitslag.wachtMs) : t('slot.pinFout');
        return false;
      },
    });
    const toestelKnop = metToestel
      ? knop(ft('slot.herstelToestel'), {
          soort: 'secundair',
          breed: true,
          opKlik: async () => {
            if (await vraagPasskey(toestelId)) opKlaar();
            else boodschap.textContent = t('slot.toestelMislukt');
          },
        })
      : null;
    zet(h('div', { class: 'slot__instel' }, h('p', { class: 'slot__uitleg' }, t('slot.huidigeCode')), blok.el, boodschap, toestelKnop, knop(t('slot.annuleer'), { soort: 'tekst', opKlik: opTerug })));
    blok.focus();
  }

  // ---- Een nieuwe code kiezen (twee keer): de gedeelde stroom uit instellen.js ----
  function kiesCode(opKlaar, opTerug, intro = null) {
    const kiezer = codeKiezer({ opKlaar, opTerug, intro });
    zet(kiezer.el);
    kiezer.focus();
  }

  // ---- Aanzetten: code, bij Face ID de toestelvraag, en pas dan bewaren ----
  // methode 'pin' of 'faceid'. Bij Face ID eerst de code (de terugval) en meteen daarna de toestelvraag. Pas bij het afronden wordt alles
  // bewaard; annuleren of mislukken laat het slot uit. Er is geen herstelvraag meer (BESLISSING 224).
  // BESLISSING 518: na de code de herstelcode; pas na "Verder" bij de herstelcode wordt er iets bewaard. Annuleren laat het slot uit.
  // BESLISSING 541: bij Pincode geen vraag "Je toestel als hulp" en geen systeemvenster meer.
  function startInstellen(methode = 'pin') {
    const metFaceId = methode === 'faceid';
    const leesNaam = () => leesInstelling('profiel.naam');
    kiesCode(
      async (code) => {
        naNieuweCode({
          methode: metFaceId ? 'faceid' : 'pin',
          leesNaam,
          toon: (el, focus) => {
            zet(el);
            focus();
          },
          opTerug: overzicht,
          opKlaar: async (stand) => {
            const gelukt = await bewaarNieuwSlot(code, { ...stand, leesNaam });
            if (!gelukt) {
              strook(t('slot.faceIdMislukt'));
              overzicht();
              return;
            }
            strook(t('slot.ingesteld'));
            overzicht();
          },
        });
      },
      overzicht,
      metFaceId ? ft('slot.eerstCode') : null,
    );
  }

  // ---- Code wijzigen: huidige code (of het toestel), dan de nieuwe code EEN keer (BESLISSING 533): samen twee keer het cijferblok. Methode,
  // herstelcode en toestel blijven zoals ze waren: de herstelcode hangt niet aan de pincode, en wie de code wijzigt, bewees al dat ze de huidige kent.
  // Vangnet voor een tikfout: de strook "Je pincode is gewijzigd." met Ongedaan maken zet de vorige code terug. De vorige afgeleide (hash en zout,
  // nooit de code zelf) staat alleen in het geheugen van deze stap, tot de strook weg is of de pagina echt verlaten wordt; nooit in de opslag.
  // Is de code intussen opnieuw gewijzigd (bv. in een ander tabblad), dan doet Ongedaan maken niets. ----
  function wijzigCode() {
    vraagHuidigeCode(() => {
      const kiezer = codeKiezer({
        bevestigen: false,
        opTerug: overzicht,
        opKlaar: async (code) => {
          let vorige = await leesInstelling('slot.pin');
          const nieuw = await maakPin(code);
          await bewaarSamen({ 'slot.pin': nieuw, 'slot.fouten': 0, 'slot.wachtTot': 0 });
          await ruimHerstelvraagOp();
          const zonderHerstel = !(await heeftBevestigdeHerstelcode());
          let timer = null;
          const opZicht = () => document.visibilityState === 'hidden' && vergeet();
          const vergeet = () => {
            vorige = null;
            clearTimeout(timer);
            window.removeEventListener('pagehide', vergeet);
            document.removeEventListener('visibilitychange', opZicht);
          };
          timer = setTimeout(vergeet, ONGEDAAN_MS);
          window.addEventListener('pagehide', vergeet);
          document.addEventListener('visibilitychange', opZicht);
          strook(t(zonderHerstel ? 'slot.codeGewijzigdHerstel' : 'slot.codeGewijzigd'), {
            duur: ONGEDAAN_MS,
            actie: {
              label: t('algemeen.ongedaan'),
              opKlik: async () => {
                const terug = vorige;
                vergeet();
                if (!terug) return;
                const nu = await leesInstelling('slot.pin');
                if (!nu || nu.hash !== nieuw.hash || nu.zout !== nieuw.zout) return;
                await bewaarSamen({ 'slot.pin': terug });
                strook(t('slot.codeTerug'));
                overzicht();
              },
            },
          });
          overzicht();
        },
      });
      zet(kiezer.el);
      kiezer.focus();
    }, overzicht);
  }

  // ---- Een nieuwe herstelcode (BESLISSING 518): eerst de huidige code of het toestel, dan meteen bewaren (de oude vervalt op dat ogenblik) en
  // één keer tonen. Ze wordt bewaard vóór ze getoond wordt: wat ze ziet en overschrijft, is altijd de geldige code, ook als het scherm tussendoor
  // verdwijnt (het slot gaat dicht als ze de app verlaat). Tot ze het vinkje bevestigt, blijft het een open punt op dit scherm.
  function nieuweHerstelcode() {
    vraagHuidigeCode(async () => {
      const code = maakHerstelcode();
      const herstel = await maakHerstel(code, { bevestigd: false });
      await bewaarSamen({ 'slot.herstel': herstel, 'slot.herstelFouten': 0, 'slot.herstelWachtTot': 0 });
      const stap = herstelcodeStap({
        code,
        titel: t('slot.herstelNieuwTitel'),
        extra: t('slot.herstelOudVervalt'),
        opVerder: async () => {
          await zetInstelling('slot.herstel', { ...herstel, bevestigd: true });
          strook(t('slot.herstelKlaar'));
          overzicht();
        },
      });
      zet(stap.el);
      stap.focus();
    }, overzicht);
  }

  // Voor het wissen van slot.passkeyId vraagt Bloei het toestel de passkey op te ruimen (waar de browser dat kan); dit toont nooit iets en houdt niets tegen.
  async function vergeetOudePasskey() {
    try {
      const oudId = await leesInstelling('slot.passkeyId');
      if (oudId) await vergeetPasskey(oudId);
    } catch {
      /* de overschakeling gaat altijd door */
    }
  }

  // ---- Uitzetten: huidige code, dan bevestigen. Alles van het slot gaat mee weg, ook de herstelcode en de koppeling met het toestel (BESLISSING 518),
  // in één transactie (herstel.js, wisSlotgegevens). ----
  function zetUit() {
    vraagHuidigeCode(async () => {
      const ja = await bevestig({ titel: t('slot.uitzettenVraag'), tekst: t('slot.uitzettenTekst'), ja: t('slot.uitzettenJa'), nee: t('slot.annuleer') });
      if (ja) {
        await vergeetOudePasskey();
        try {
          const herstelId = await leesInstelling('slot.herstelId');
          if (herstelId) await vergeetPasskey(herstelId);
        } catch {
          /* het uitzetten gaat altijd door */
        }
        await wisSlotgegevens();
      }
      overzicht();
    }, overzicht);
  }

  // ---- Wisselen tussen Pincode en Face ID bij een bestaande vergrendeling (de code blijft altijd bewaard) ----
  // Naar Face ID (BESLISSING 403): eerst de huidige code, zoals bij wijzigen en uitzetten (zelfde teller en wachttijd), dan de toestelvraag;
  // lukt die niet, dan blijft het Pincode met een rustige melding. Naar Pincode: de passkey wordt vergeten (geen nieuwe weg naar binnen, dus geen codevraag).
  async function kiesMethode(nieuw) {
    if (nieuw === 'faceid') {
      vraagHuidigeCode(async () => {
        await ruimHerstelvraagOp();
        const id = await maakPasskey(await leesInstelling('profiel.naam'));
        if (id) {
          await zetInstelling('slot.passkeyId', id);
          await zetInstelling('slot.methode', 'faceid');
        } else strook(t('slot.faceIdMislukt'));
        overzicht();
      }, overzicht);
      return;
    }
    await ruimHerstelvraagOp();
    await vergeetOudePasskey();
    await zetInstelling('slot.passkeyId', null);
    await zetInstelling('slot.methode', 'pin');
    overzicht();
  }

  // ---- Overzicht: de vaste opbouw van een instelscherm (zie layout.css, BESLISSING 164) ----
  async function overzicht() {
    // In de demo (BESLISSING 364) staat de vergrendeling uit en is ze niet in te stellen: alles uitgegrijsd, met één regel uitleg.
    const aan = !DEMO && Boolean(await leesInstelling('slot.aan')) && Boolean(await leesInstelling('slot.pin'));
    const kanFaceId = await passkeyMogelijk();
    const methode = aan ? await leesMethode() : 'pin';
    const lengte = aan ? await leesPinLengte() : PIN_LENGTE;
    const opent = eersteToon('meer-vergrendeling');

    const metKlasse = (el, haak) => {
      el.classList.add('slot__rij');
      if (haak) el.dataset.uitleg = haak;
      return el;
    };
    // Eén schakelaar Vergrendeling en daaronder een keuze uit twee (radiogroup): Pincode of Face ID, precies één, altijd zichtbaar.
    // Staat het slot uit, dan zet een tik op een keuze het slot aan met die keuze. Uitzetten vraagt de code en een bevestiging.
    const hoofdSchakelaar = schakelaar({
      label: t('slot.pinSchakelaar'),
      uitleg: t('slot.slotHint'),
      aan,
      uitgeschakeld: DEMO,
      opWissel: (stand) => (stand ? startInstellen(methode) : zetUit()),
    });
    const optie = (id, tegelBegrip, label, hint, uit = false) =>
      slotOptie({
        id,
        begripTegel: begripTegel(tegelBegrip),
        label,
        hint,
        gekozen: methode === id,
        uit,
        opKies: () => {
          if (uit || (aan && methode === id)) return;
          if (!aan) startInstellen(id);
          else kiesMethode(id);
        },
      });
    // Alleen op Android zonder platformauthenticator (eigenaar, 16 november: "zonder dode knop"): geen uitgeschakelde tweede keuze, wel één
    // duidelijke regel. Op iPhone, iPad en desktop blijft de uitgeschakelde keuze met "Dit toestel kan dit niet." zoals ze was.
    const zonderMethode = !DEMO && !kanFaceId && isAndroid();
    const opties = [
      optie('pin', 'pincode', t('slot.pin'), t('slot.pinHint'), DEMO),
      zonderMethode ? null : optie('faceid', 'gezichtsherkenning', naam, kanFaceId ? methodeTekst('slot.faceHint') : t('slot.faceKanNiet'), DEMO || !kanFaceId),
    ].filter(Boolean);
    const geenMethodeRegel = zonderMethode ? h('p', { class: 'slot__optiehint', 'data-geen-methode': '' }, methodeTekst('slot.faceIdKanNiet')) : null;
    const keuze = h('div', { class: 'slot__keuze', role: 'radiogroup', 'aria-labelledby': 'slot-openen-met', 'data-uitleg': 'slot-keuze' }, ...opties);
    keuze.addEventListener('keydown', (e) => {
      const nu = opties.indexOf(document.activeElement);
      if (nu < 0 || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const volgende = opties[(nu + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1) + opties.length) % opties.length];
      if (volgende.disabled) return;
      e.preventDefault();
      volgende.focus();
      volgende.click();
    });
    const slotRij = h('div', { class: 'rij slot__rij', 'data-uitleg': 'slot-schakelaar' }, begripTegel('vergrendeling'), hoofdSchakelaar);
    // BESLISSING 234: de twee keuzes horen bij de schakelaar. Ze staan ingesprongen onder het kopje Openen met, met een lijn naar de schakelaar;
    // staat het slot uit, dan zijn ze gedempt maar nog aantikbaar (een tik zet het slot aan met die keuze).
    const groep = h('div', { class: ['slot__groep', !aan && 'is-uit'] }, h('p', { class: 'label slot__groepkop', id: 'slot-openen-met' }, t('slot.openenMet')), keuze, geenMethodeRegel);
    const demoRegel = DEMO ? h('p', { class: 'slot__uitleg', 'data-demo': 'slot-uit' }, t('demo.slotUit')) : null;
    const kaarten = [kaart({ klasse: 'slot__kaart' }, kaartkop({ tegel: begripOpties('vergrendeling'), label: t('slot.titel') }), demoRegel, slotRij, groep)];

    if (aan) {
      // BESLISSING 518: onder de pincode de herstelcode (met haar stand: gemaakt op, of een open punt). BESLISSING 541: daaronder één zin over
      // een vergeten code (met het toestel als het dat kan, en de herstelcode), in de plaats van de rij om het toestel te koppelen.
      const herstel = await leesHerstel();
      const datum = herstel?.gemaakt ? datumVoluit(naarSleutel(new Date(herstel.gemaakt))) : '';
      const herstelTekst = !herstel ? t('slot.herstelGeen') : herstel.bevestigd ? t('slot.herstelGemaakt', { datum }) : t('slot.herstelNietBevestigd', { datum });
      const herstelRij = metKlasse(
        rij({
          tegel: begripOpties('herstelvraag'),
          titel: t('slot.herstelRij'),
          tekst: herstelTekst,
          eind: knop(t('slot.herstelMaak'), { soort: 'secundair', label: t(herstel ? 'slot.herstelNieuwLabel' : 'slot.herstelMaakLabel'), opKlik: nieuweHerstelcode }),
        }),
        'slot-herstel',
      );
      if (!herstel?.bevestigd) herstelRij.dataset.openPunt = '';
      const vergeetZin = h('p', { class: 't-klein t-gedempt slot__vergeet', 'data-vergeet': '' }, kanFaceId ? ft('slot.vergeetToestel') : t('slot.vergeetCode'));
      kaarten.push(
        kaart(
          { klasse: 'slot__kaart' },
          kaartkop({ tegel: begripOpties('vergrendeling'), label: t('slot.ontgrendelen') }),
          metKlasse(
            rij({
              tegel: begripOpties('pincode'),
              titel: t('slot.pin'),
              tekst: t('slot.pinUitleg'),
              eind: knop(t('slot.wijzigen'), { soort: 'secundair', label: t('slot.pinWijzigen'), opKlik: wijzigCode }),
            }),
            'slot-pin',
          ),
          herstelRij,
          vergeetZin,
        ),
      );
    }

    // "Goed om te weten" met de drie regels van "Hoe het werkt" (slot uit én aan). BESLISSINGEN 538 en 545: met het slot uit staat het links onder de kaart
    // Vergrendeling en rechts alleen het voorbeeld; met het slot aan rechts onder het voorbeeld.
    // BESLISSING 362: het gedeelde blok uit ui/weetjes.js (kop met icoontegel en een lijn eronder), met "Toon het me" erbij.
    const weetjes = maakWeetjes([['pincode', 'slot.hoeCode'], ['gezichtsherkenning', 'slot.hoeFaceId'], ['home', 'slot.hoeOpenen']].map(([begrip, sleutel]) => ({ begrip, tekst: methodeTekst(sleutel) })));
    weetjes.querySelector('.instel__weetjesrij').append(toonHetBlok(() => startRondleiding({ sleutel: 'meer/vergrendeling' }), 'neutraal'));

    // Het levende voorbeeld: het slotscherm in het klein, zoals het met deze instellingen wordt of is.
    const voorbeeldInhoud = [h('div', { class: 'instel__groei' }, slotVoorbeeld({ lengte, faceIdNaam: aan && methode === 'faceid' && kanFaceId ? naam : null }))];
    const voorbeeld = h(
      'aside',
      { class: 'instel__voorbeeld' },
      kaart({ klasse: 'slot__kaart' }, kaartkop({ tegel: begripOpties('instellingen'), label: t('slot.voorbeeld') }), ...voorbeeldInhoud),
    );

    // BESLISSINGEN 538, 545 en 547. Slot uit: kaart Vergrendeling links, voorbeeld rechts en "Goed om te weten" onder beide kolommen over de volle breedte.
    // Slot aan: links de twee kaarten, rechts het voorbeeld met "Goed om te weten" eronder. De DOM-volgorde is in beide standen de leesvolgorde, ook op een kolom
    // (kaarten, voorbeeld, "Goed om te weten"); er is geen `order` nodig.
    zet(
      h(
        'div',
        { class: ['instelscherm', aan && 'slot-aan'] },
        h('div', { class: 'instel__lijst' }, ...kaarten),
        h('div', { class: 'instel__rechts' }, voorbeeld, aan ? weetjes : null),
        aan ? null : weetjes,
      ),
    );
    if (opent) komOp([...kaarten, voorbeeld.firstElementChild], { stap: 80 });
    else komOp([voorbeeld.querySelector('.slotvoorbeeld')], { stap: 0 });
  }

  overzicht();
  return stop;
}
