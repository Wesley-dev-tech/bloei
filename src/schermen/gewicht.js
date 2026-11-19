// Tab Gewicht (V3): de laatste weging, het verloop in een eigen grafiek en een blad om te noteren.
// Neutraal: geen rood, geen groen als oordeel, geen pijlen, stijging en daling zien er hetzelfde uit.
import { h } from '../ui/dom.js';
import { kaart, kaartkop, knop, rij, chips, segment, stapper, tekstveld, bladerkop, blad, bevestig, strook, schermkop } from '../ui/componenten.js';
import { eersteToon, komOp, telOp } from '../ui/beweging.js';
import { grafiek } from '../ui/grafiek.js';
import { beheerScherm } from './hulp.js';
import { t } from '../teksten.js';
import { opmaakDatum, plusDagen, vandaag, weekdag, weekStart } from '../kern/datum.js';
import { opmaakKg, opmaakVerschil, leesKg } from '../kern/getal.js';
import { GRENZEN, leesInstelling, zetInstelling } from '../data/instellingen.js';
import { bewaarWeging, herstelWegingen, leesWegingen, verhuisWeging, verschilMetVorigeWeek, verwijderWeging, wegingVanWeek } from '../data/wegingen.js';
import { begripOpties, begripTegel, ICOON } from '../ui/iconenkaart.js';
import { startRondleiding, registreerUitleg } from '../uitleg/rondleiding.js';
import { toonHetMe } from '../ui/weetjes.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { MAANDEN_KORT, verloopCijfers, voortgangNaarStreef, weekKalender, wekenGewogen } from '../logica/gewichtcijfers.js';

const staat = { periode: 'maand', gekozen: null, focusNa: false, focusOp: null }; // focusOp: de knop (selector) die na een hertekening de focus terugkrijgt, als hij nergens anders heen ging

// Het blad "Weging noteren": datum (niet in de toekomst), gewicht met de stapper (tik op het getal om te
// typen; bij de allereerste weging meteen een typveld) en Noteren. Bestaat er die week al een weging, dan
// eerst de vraag "Vervangen?". Na het bewaren altijd dezelfde strook.
// kijkstand: voor de uitleg; het blad opent met een voorbeeldgetal, Bewaren schrijft niets en sluiten laat geen weging achter.
async function openWegingBlad({ weging = null, kijkstand = false } = {}) {
  const alle = await leesWegingen();
  const eerste = alle.length === 0;
  const laatste = alle.at(-1) ?? null;
  let datum = weging?.datum ?? vandaag();
  let kg = weging?.kg ?? laatste?.kg ?? null;

  const kopHouder = h('div');
  const fout = h('p', { class: 'dialoog__tekst', id: 'weging-fout', role: 'alert', hidden: true }, t('gewicht.ongeldig'));
  // De foutmelding hoort bij het gewichtsveld: aria-describedby op het veld, aria-invalid zolang de waarde niet klopt.
  const markeerFout = (invoerVeld, ongeldig) => {
    fout.hidden = !ongeldig;
    if (!invoerVeld) return;
    invoerVeld.setAttribute('aria-describedby', 'weging-fout');
    if (ongeldig) invoerVeld.setAttribute('aria-invalid', 'true');
    else invoerVeld.removeAttribute('aria-invalid');
  };
  const tekenKop = () =>
    kopHouder.replaceChildren(
      bladerkop({
        titel: opmaakDatum(datum, 'lang'),
        label: t('gewicht.datum'),
        opVorige: () => {
          datum = plusDagen(datum, -1);
          tekenKop();
        },
        opVolgende: () => {
          datum = plusDagen(datum, 1);
          tekenKop();
        },
        volgendeUit: plusDagen(datum, 1) > vandaag(),
      }),
    );
  tekenKop();

  // Gewicht: stapper met typen op het getal, of meteen een typveld bij de eerste weging
  let invoer;
  let veld = null;
  if (eerste && kg == null && !kijkstand) {
    veld = tekstveld({
      plaats: t('gewicht.typPlaats'),
      label: t('gewicht.waarde'),
      inputmode: 'decimal',
      opWijzig: (v) => {
        kg = leesKg(v);
        markeerFout(veld, false);
      },
    });
    veld.classList.add('gewicht__typveld');
    veld.setAttribute('aria-describedby', 'weging-fout');
    invoer = h('div', { class: 'gewicht__invoer' }, veld);
  } else {
    const stap = stapper({ waarde: kg ?? 68, stap: 0.1, min: 20, max: 300, opmaak: opmaakKg, label: t('gewicht.waarde'), opWijzig: (n) => (kg = n) });
    if (kg == null) kg = 68;
    const uitvoer = stap.querySelector('.stapper__waarde');
    uitvoer.classList.add('gewicht__getal');
    uitvoer.setAttribute('data-uitleg', 'weging-getal');
    uitvoer.setAttribute('title', t('gewicht.typ'));
    // Ook met het toetsenbord te typen: het getal is een knop (naam = de waarde, beschrijving = de hint ernaast); Enter of spatie opent het typveld.
    uitvoer.setAttribute('role', 'button');
    uitvoer.setAttribute('tabindex', '0');
    uitvoer.setAttribute('aria-describedby', 'weging-typhint');
    uitvoer.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      uitvoer.click();
    });
    uitvoer.addEventListener('click', () => {
      const typ = tekstveld({ waarde: String(kg).replace('.', ','), label: t('gewicht.waarde'), inputmode: 'decimal' });
      typ.classList.add('gewicht__typveld');
      uitvoer.hidden = true;
      uitvoer.after(typ);
      typ.focus();
      typ.select?.();
      const klaar = () => {
        const n = leesKg(typ.value);
        if (n != null) {
          kg = n;
          stap.zetWaarde(n);
        }
        typ.remove();
        uitvoer.hidden = false;
      };
      typ.addEventListener('blur', klaar);
      typ.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          typ.blur();
          uitvoer.focus(); // de focus blijft op het getal in plaats van te verdwijnen
        } else if (e.key === 'Escape') {
          e.stopPropagation(); // Escape sluit eerst het typveld; het blad blijft open
          e.preventDefault();
          typ.value = '';
          typ.blur();
          uitvoer.focus();
        }
      });
    });
    invoer = h('div', { class: 'gewicht__invoer' }, stap, h('p', { class: 't-klein t-gedempt gewicht__hint', id: 'weging-typhint' }, t('gewicht.typ')));
  }

  // R2-09: één bewaarbeurt tegelijk; een dubbele tik op Noteren bewaart één keer (de knop staat uit zolang het bewaren loopt).
  let bezig = false;
  // BESLISSING 492: Noteren en Annuleren staan gecentreerd naast elkaar, met dezelfde helper en klasse als de bladen Streefgewicht en Weegdag.
  const bewaarOpKlik = async () => {
      if (kijkstand) {
        b.sluit();
        return;
      }
      if (bezig) return;
      if (kg == null || kg < 20 || kg > 300) {
        markeerFout(veld, true);
        veld?.focus();
        return;
      }
      bezig = true;
      bewaarKnop.disabled = true;
      try {
        const bestaand = await wegingVanWeek(datum);
        if (bestaand && !(weging && weging.week === bestaand.week)) {
          const ja = await bevestig({
            titel: t('gewicht.noteren'),
            tekst: t('gewicht.vervangen', { kg: opmaakKg(bestaand.kg) }),
            ja: t('gewicht.vervangenJa'),
            nee: t('gewicht.vervangenNee'),
          });
          if (!ja) return;
        }
        // R2-18 (BESLISSING 409): een aangepaste weging met een datum in een andere week verhuist; de oude week wordt leeg.
        const verhuist = weging && weging.week !== weekStart(datum);
        const nieuw = verhuist ? await verhuisWeging(weging, datum, kg) : await bewaarWeging(datum, kg);
        b.sluit();
        // Altijd dezelfde tekst; Ongedaan maken zet de vorige stand terug: de vervangen weging van die week (of de week weer leeg),
        // en bij een verhuizing ook de weging in haar oude week.
        strook(t('gewicht.genoteerd'), {
          duur: 6000,
          actie: {
            label: t('algemeen.ongedaan'),
            opKlik: () =>
              verhuist
                ? herstelWegingen({ weg: [nieuw.week], terug: [bestaand, weging] })
                : bestaand
                  ? bewaarWeging(bestaand.datum, bestaand.kg)
                  : verwijderWeging(weekStart(datum)),
          },
        });
      } finally {
        bezig = false;
        bewaarKnop.disabled = false;
      }
  };
  const { klaarKnop: bewaarKnop, annuleerKnop } = klaarEnAnnuleer(bewaarOpKlik, () => b.sluit(), t('gewicht.bewaar'));
  const b = bladMetKnoppen({
    titel: t('gewicht.blad'),
    klasse: 'wegingblad',
    inhoud: [kopHouder, invoer, fout],
    klaarKnop: bewaarKnop,
    annuleerKnop,
  });
  kopHouder.setAttribute('data-uitleg', 'weging-datum');
  b.querySelector('.knop--primair')?.setAttribute('data-uitleg', 'weging-bewaar');
  b.open();
  if (!kijkstand) veld?.focus();
  return b;
}

// Het blad "Streefgewicht" (BESLISSING 463): je typt zelf een gewicht, in dezelfde vorm als het blad "Weging noteren" en het maaltijdblad
// (BESLISSING 412 en 417): Klaar links, Annuleren in het midden, Verwijderen rechts (alleen als er al een streefgewicht is).
// Er is geen tussentijdse opslag: Klaar bewaart; Annuleren, Escape, het kruisje en de terugknop sluiten zonder iets te wijzigen.
// Het streefgewicht staat in dezelfde instelling als bij Algemeen, Gewicht ('gewicht.streefKg').
// Gedeeld door de bladen Streefgewicht en Weegdag (BESLISSING 463, 469, 477): Klaar (gevuld, met vinkje) en Annuleren, gecentreerd onder de inhoud.
// bladMetKnoppen geeft het blad terug zonder het te openen; verwijderHouder is er alleen als er iets te verwijderen valt.
function klaarEnAnnuleer(opKlaar, opAnnuleer, klaarTekst = t('gewicht.klaar')) {
  const klaarKnop = knop(klaarTekst, { soort: 'primair', opKlik: opKlaar });
  klaarKnop.prepend(h('span', { class: 'maaltijd__vink', 'aria-hidden': 'true' }));
  klaarKnop.classList.add('maaltijd__bewaar');
  const annuleerKnop = knop(t('gewicht.annuleren'), { soort: 'secundair', opKlik: opAnnuleer });
  return { klaarKnop, annuleerKnop };
}
function bladMetKnoppen({ titel, klasse, inhoud, klaarKnop, annuleerKnop, verwijderHouder = null }) {
  const b = blad({
    titel,
    familie: 'gewicht',
    inhoud: h('div', { class: 'stapel' }, ...inhoud, h('div', { class: 'maaltijd__acties streefblad__knoppen' }, klaarKnop, annuleerKnop, verwijderHouder)), // BESLISSING 417: Klaar, Annuleren, Verwijderen; BESLISSING 469: gecentreerd
  });
  b.classList.add(klasse);
  return b;
}

// BESLISSING 494: de knop op de kaarten Streefgewicht en Weegdag heeft de volle tekst vanaf 390 px breed en daaronder de korte (Zetten, Aanpassen); css toont de ene of de andere,
// de schermlezernaam is altijd de volle tekst.
function kaartKnop(vol, kort, opties) {
  const k = knop(vol, { soort: 'primair', breed: true, label: vol, ...opties });
  k.querySelector('.knop__tekst').replaceChildren(h('span', { class: 'knop__vol' }, vol), h('span', { class: 'knop__kort' }, kort));
  return k;
}

const geldigKg = (n) => n != null && n >= GRENZEN.kg.min && n <= GRENZEN.kg.max;

export function openStreefBlad({ streef = null } = {}) {
  const bestaat = streef != null;
  let kg = bestaat ? streef : null;
  const fout = h('p', { class: 'dialoog__tekst', id: 'streef-fout', role: 'alert', hidden: true }, t('gewicht.ongeldig'));
  const invoerVeld = tekstveld({
    waarde: bestaat ? opmaakKg(streef).split(/\s/)[0] : '',
    plaats: t('gewicht.typPlaats'),
    label: t('gewicht.waarde'),
    inputmode: 'decimal',
    opWijzig: (v) => {
      kg = leesKg(v);
      zetStand(v.trim() !== '' && !geldigKg(kg));
    },
  });
  invoerVeld.classList.add('gewicht__typveld');
  invoerVeld.maxLength = 6; // "300,0" met ruimte voor een extra decimaal dat leesKg afrondt
  invoerVeld.setAttribute('aria-describedby', 'streef-fout');
  // De foutmelding hoort bij het veld (zoals bij een weging): aria-invalid zolang de waarde niet klopt; Klaar staat uit zolang het veld leeg of ongeldig is.
  function zetStand(ongeldig) {
    fout.hidden = !ongeldig;
    if (ongeldig) invoerVeld.setAttribute('aria-invalid', 'true');
    else invoerVeld.removeAttribute('aria-invalid');
    klaarKnop.disabled = !geldigKg(kg);
  }

  let bezig = false;
  async function bewaarEnSluit() {
    if (bezig) return;
    if (!geldigKg(kg)) {
      zetStand(true);
      invoerVeld.focus();
      return;
    }
    bezig = true;
    try {
      staat.focusOp = '.gewichtstreef .gewicht__actie .knop';
      b.sluit(); // eerst sluiten: de focus gaat naar de knop; die tekent daarna opnieuw met het streefgewicht en krijgt de focus terug (data-fk, en anders staat.focusOp)
      await zetInstelling('gewicht.streefKg', kg);
      strook(t('gewicht.streefBewaard'), { duur: 6000, actie: { label: t('algemeen.ongedaan'), opKlik: () => zetInstelling('gewicht.streefKg', streef) } });
    } finally {
      bezig = false;
    }
  }
  const { klaarKnop, annuleerKnop } = klaarEnAnnuleer(bewaarEnSluit, () => b.sluit());
  klaarKnop.disabled = !geldigKg(kg);
  // Zonder streefgewicht is er geen houder: een lege houder zou een tussenruimte meetellen en de gecentreerde groep scheeftrekken.
  const verwijderHouder = bestaat ? h('div', { class: 'maaltijd__verwijder' }) : null;
  if (bestaat) {
    verwijderHouder.append(
      knop(t('gewicht.verwijderen'), {
        soort: 'secundair',
        opKlik: async () => {
          const ja = await bevestig({ titel: t('gewicht.streefgewicht'), tekst: t('gewicht.streefWisVraag'), ja: t('gewicht.verwijderJa'), nee: t('gewicht.verwijderNee') });
          if (!ja) return;
          staat.focusOp = '.gewichtstreef .gewicht__actie .knop';
          b.sluit(); // eerst sluiten, dan wissen: de herteken krijgt de focus terug op de knop
          await zetInstelling('gewicht.streefKg', null);
          strook(t('gewicht.streefGewist'), { duur: 6000, actie: { label: t('algemeen.ongedaan'), opKlik: () => zetInstelling('gewicht.streefKg', streef) } });
        },
      }),
    );
  }
  invoerVeld.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    bewaarEnSluit();
  });
  const b = bladMetKnoppen({
    titel: t('gewicht.streefgewicht'),
    klasse: 'streefblad',
    inhoud: [h('div', { class: 'gewicht__invoer' }, invoerVeld), h('p', { class: 't-klein t-gedempt streefblad__regel' }, t('gewicht.streefHint')), fout],
    klaarKnop,
    annuleerKnop,
    verwijderHouder,
  });
  b.open();
  invoerVeld.focus();
  if (bestaat) invoerVeld.select();
  return b;
}

// Het blad "Weegdag" (BESLISSING 477): de zeven dagen als keuzegroep (hetzelfde onderdeel, chips, als bij Algemeen, Gewicht), de huidige dag
// voorgekozen. Klaar bewaart in dezelfde instelling als daar ('gewicht.weegdag', verder bijwerken is er niets: de kaart, de weegkalender en
// de voorbeeldweek lezen die instelling); dezelfde dag kiezen verandert niets en meldt niets. Annuleren, Escape, het kruisje en de terugknop sluiten zonder te wijzigen.
export function openWeegdagBlad({ weegdag = 1 } = {}) {
  let gekozen = weegdag;
  // BESLISSING 481: dezelfde rij als bij Algemeen, Gewicht: dezelfde chips in dezelfde houder (.weegdagen--breed: zeven gelijke kolommen) met de afkortingen.
  const groep = chips({
    keuzes: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: n, label: t('instellingen.dagen.' + n) })),
    actief: weegdag,
    label: t('gewicht.weegdag'),
    opKies: (n) => {
      gekozen = n;
      maakRadio();
    },
  });
  const knoppen = [...groep.querySelectorAll('.chip')];
  knoppen.forEach((k, i) => k.setAttribute('aria-label', t('algemeen.dagen.' + (i + 1)))); // de schermlezer hoort de volledige naam
  // Een keuze uit zeven dagen is een radiogroep: één tabstop, pijltjestoetsen binnen de groep, aria-checked in plaats van aria-pressed.
  function maakRadio() {
    groep.setAttribute('role', 'radiogroup');
    knoppen.forEach((k, i) => {
      k.setAttribute('role', 'radio');
      k.removeAttribute('aria-pressed');
      k.setAttribute('aria-checked', String(i + 1 === gekozen));
      k.tabIndex = i + 1 === gekozen ? 0 : -1;
    });
  }
  maakRadio();
  groep.addEventListener('keydown', (e) => {
    const nu = knoppen.indexOf(document.activeElement);
    if (nu < 0) return;
    const tel = knoppen.length;
    const volgende = { ArrowRight: (nu + 1) % tel, ArrowDown: (nu + 1) % tel, ArrowLeft: (nu - 1 + tel) % tel, ArrowUp: (nu - 1 + tel) % tel, Home: 0, End: tel - 1 }[e.key];
    if (volgende == null) return;
    e.preventDefault();
    knoppen[volgende].focus();
    knoppen[volgende].click();
  });

  let bezig = false;
  async function bewaarEnSluit() {
    if (bezig) return;
    bezig = true;
    try {
      b.sluit(); // eerst sluiten: de focus gaat naar de knop; die tekent daarna opnieuw en krijgt de focus terug (data-fk, en anders staat.focusOp)
      if (gekozen === weegdag) return; // dezelfde dag: er verandert niets en er komt geen melding
      staat.focusOp = '.gewicht__weegdag .gewicht__actie .knop';
      await zetInstelling('gewicht.weegdag', gekozen);
      strook(t('gewicht.weegdagBewaard'), { duur: 6000, actie: { label: t('algemeen.ongedaan'), opKlik: () => zetInstelling('gewicht.weegdag', weegdag) } });
    } finally {
      bezig = false;
    }
  }
  const { klaarKnop, annuleerKnop } = klaarEnAnnuleer(bewaarEnSluit, () => b.sluit());
  groep.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter op een dag = Klaar
    bewaarEnSluit();
  });
  const b = bladMetKnoppen({
    titel: t('gewicht.weegdag'),
    klasse: 'weegdagblad',
    inhoud: [h('p', { class: 't-klein t-gedempt streefblad__regel' }, t('instellingen.weegdagUitleg')), h('div', { class: 'weegdagen weegdagen--breed weegdagblad__dagen' }, groep)],
    klaarKnop,
    annuleerKnop,
  });
  b.open();
  (knoppen[gekozen - 1] ?? knoppen[0]).focus();
  return b;
}

export function toon(houder) {
  staat.periode = 'maand'; // BESLISSING 197: bij elk bezoek opent de grafiek op 1 maand; een eigen keuze geldt zolang ze op het scherm blijft

  const opruim = beheerScherm(houder, async () => {
    const [wegingen, streef, weegdag] = await Promise.all([
      leesWegingen(),
      leesInstelling('gewicht.streefKg'),
      leesInstelling('gewicht.weegdag'),
    ]);
    const laatste = wegingen.at(-1) ?? null;
    const verschil = laatste ? await verschilMetVorigeWeek(laatste) : null;
    if (staat.gekozen && !wegingen.some((w) => w.week === staat.gekozen)) staat.gekozen = null;
    // Beweging alleen bij het openen van het scherm, niet bij elke hertekening na een tik.
    const opent = eersteToon('gewicht');

    // Elke kaart in de bovenste rij heeft dezelfde bouw: kaartkop, een kern op dezelfde basislijn, een regel tekst en een actie.
    const bovenkaart = (klasse, kop, kern, regel, actie) =>
      kaart(
        { klasse: `gewicht__bovenkaart kaart--licht-op ${klasse}` },
        kaartkop(kop),
        h('div', { class: 'gewicht__kern' }, kern),
        h('p', { class: 'gewicht__regel' }, regel),
        // data-fk: na een hertekening (een streefgewicht gezet of gewist, een weging genoteerd) krijgt de knop op dezelfde plek weer de focus
        h('div', { class: 'gewicht__actie', dataset: { fk: 'actie-' + klasse.split(' ')[0] } }, actie),
      );

    // ---- De laatste weging: het getal (telt op), één zin zonder oordeel en de knop om te noteren
    const getal = h('span', { class: 'gewichthoofd__getal' }, laatste ? opmaakKg(laatste.kg).split(/\s/)[0] : '');
    const hoofd = bovenkaart(
      laatste ? 'gewichthoofd' : 'gewichthoofd gewichthoofd--leeg',
      // De datum staat in de kop; op een middelbare breedte met drie bovenkaarten naast elkaar (1100 tot 1399 px, een iPad liggend) past ze daar niet op één regel en staat ze
      // in de regel eronder (BESLISSING 308): CSS toont de ene of de andere.
      { tegel: begripOpties('gewicht'), label: t('gewicht.laatste') },
      laatste ? h('p', { class: 'cijfer-groot' }, getal, h('span', { class: 'cijfer-groot__eenheid' }, ' kg')) : h('p', { class: 'cijfer-groot is-leeg' }, '-'),
      laatste
        ? verschil != null
          ? h('span', { class: 'gewichthoofd__verschil', dataset: { datum: opmaakDatum(laatste.datum, 'kort') } }, t('gewicht.verschil', { verschil: opmaakVerschil(verschil).replace(/\s*kg$/, '') }))
          : h('span', { dataset: { datum: opmaakDatum(laatste.datum, 'kort') } }, t('gewicht.noteerHint'))
        : `${t('gewicht.nogGeen')} ${t('gewicht.noteerHint')}`,
      knop(t('gewicht.noteren'), { soort: 'primair', breed: true, opKlik: () => openWegingBlad() }), // BESLISSING 484: de drie bovenknoppen zijn alle drie de gevulde knop in de kleur van Gewicht
    );
    // De datum staat als ::after achter het label (data-datum, zie scherm-gewicht.css): het label blijft één stuk tekst op één regel.
    if (laatste) hoofd.querySelector('.kaartkop__label').dataset.datum = opmaakDatum(laatste.datum, 'kort');
    if (laatste && opent) telOp(getal, laatste.kg, { duur: 700, opmaak: (n) => n.toFixed(1).replace('.', ',') });

    // ---- De grafiek met periode en een gekozen punt
    const detail = h('div', { class: 'gewicht__detail' });
    const gr = grafiek({
      wegingen,
      periode: staat.periode,
      streefKg: streef,
      gekozen: staat.gekozen,
      streefLabel: t('gewicht.streef'),
      animeer: opent,
      vul: true,
      opKiesPunt: (w) => {
        staat.gekozen = w.week;
        tekenDetail();
      },
    });
    function tekenDetail() {
      const w = wegingen.find((x) => x.week === staat.gekozen);
      if (!w) {
        detail.replaceChildren();
        return;
      }
      detail.replaceChildren(
        h(
          'div',
          { class: 'gewicht__gekozen' },
          h('div', null, h('p', { class: 'label' }, opmaakDatum(w.datum, 'lang')), h('p', { class: 'gewicht__gekozenkg cijfer' }, opmaakKg(w.kg))),
          h(
            'div',
            { class: 'gewicht__acties' },
            knop(t('gewicht.aanpassen'), { soort: 'secundair', opKlik: () => openWegingBlad({ weging: w }) }),
            knop(t('gewicht.verwijderen'), {
              soort: 'tekst',
              opKlik: async () => {
                const ja = await bevestig({
                  titel: t('gewicht.verwijderen'),
                  tekst: t('gewicht.verwijderVraag'),
                  ja: t('gewicht.verwijderJa'),
                  nee: t('gewicht.verwijderNee'),
                });
                if (!ja) return;
                staat.gekozen = null;
                staat.focusNa = true; // de knop die hier stond verdwijnt: de focus gaat naar de lijst (of, als die leeg is, naar "Weging noteren")
                await verwijderWeging(w.week);
                strook(t('gewicht.verwijderd'), { duur: 6000, actie: { label: t('algemeen.ongedaan'), opKlik: () => bewaarWeging(w.datum, w.kg) } });
              },
            }),
          ),
        ),
      );
    }
    tekenDetail();

    const periodes = segment({
      keuzes: [
        { id: 'maand', label: t('gewicht.periode1') },
        { id: 'kwartaal', label: t('gewicht.periode3') },
        { id: 'jaar', label: t('gewicht.periodeJaar') },
      ],
      actief: staat.periode,
      label: t('gewicht.grafiek'),
      opKies: (id) => {
        staat.periode = id;
        gr.zet({ periode: id });
      },
    });
    const weinig = wegingen.length < 2;
    if (!weinig) periodes.classList.add('segment--vol');

    // De eerstvolgende weegdag (voor de weegdagkaart en, bij minder dan twee wegingen, voor het verloop)
    const vandaagDatum = vandaag();
    const dagenTot = (((weegdag ?? 1) - weekdag(vandaagDatum)) % 7 + 7) % 7;
    const volgende = plusDagen(vandaagDatum, dagenTot);

    // Vanaf twee wegingen: de grafiek met periodekeuze. Daarvoor een vriendelijke, compacte kaart: één zin, het ene punt met waarde
    // en datum en de volgende weging; geen bijna lege grafiek met een losse as.
    const grafiekKaart = weinig
      ? kaart(
          { klasse: 'gewichtgrafiek gewichtgrafiek--compact kaart--licht-op' },
          kaartkop({ tegel: begripOpties('gewicht'), label: t('gewicht.grafiek') }),
          h(
            'div',
            { class: 'gewichtgrafiek__vlak', role: 'group', 'aria-label': t('gewicht.grafiek') },
            h('p', { class: 'gewichtgrafiek__uitleg' }, t(wegingen.length === 0 ? 'gewicht.leeg' : 'gewicht.leegTwee')),
            laatste
              ? h(
                  'div',
                  { class: 'gewicht__punt' },
                  h('span', { class: 'gewicht__stip', 'aria-hidden': 'true' }),
                  h('span', { class: 'gewicht__puntkg cijfer' }, opmaakKg(laatste.kg)),
                  h('span', { class: 'label gewicht__puntdatum' }, opmaakDatum(laatste.datum, 'lang')),
                )
              : null,
            // De volgende weging staat op de weegdagkaart en in de Weegkalender; hier niet nog eens (anders blijft deze kaart hoger dan haar buurkaart).
          ),
          detail,
        )
      : kaart(
          { klasse: `gewichtgrafiek kaart--licht-op ${wegingen.length >= 5 ? 'gewichtgrafiek--ruim' : wegingen.length === 3 ? 'gewichtgrafiek--drie' : wegingen.length === 2 ? 'gewichtgrafiek--twee' : ''}` }, // de hoogte van de grafiek volgt het aantal rijen van de lijst ernaast
          kaartkop({ tegel: begripOpties('gewicht'), label: t('gewicht.grafiek') }),
          periodes,
          h('div', { class: 'gewichtgrafiek__vlak', role: 'group', 'aria-label': t('gewicht.grafiek') }, gr),
          detail,
        );

    const weegdagKaart = bovenkaart(
      'gewicht__weegdag',
      { tegel: begripOpties('weegdag'), label: t('gewicht.weegdag') },
      h('p', { class: 'cijfer-groot gewicht__weegdagnaam' }, t('algemeen.dagen.' + (weegdag ?? 1))),
      dagenTot === 0 ? t('gewicht.weegdagVandaag') : h('span', { class: 'label' }, opmaakDatum(volgende, 'lang')), // BESLISSING 467: een datum alleen als bijschrift is een label
      kaartKnop(t('gewicht.weegdagAanpassen'), t('gewicht.aanpassen'), { opKlik: async () => openWeegdagBlad({ weegdag: (await leesInstelling('gewicht.weegdag')) ?? 1 }) }), // BESLISSING 477: een pop-up, geen sprong naar Algemeen; de waarde wordt bij het openen vers gelezen (de knop kan van vóór een wijziging zijn)
    );

    // ---- Streefgewicht: een stapper of "Streefgewicht zetten". Hoeveel er nog te gaan is, staat in "Weg naar je streefgewicht" (BESLISSING 289 herroept het weglaten van "nog x kg").
    const streefKaart = bovenkaart(
      'gewichtstreef',
      { tegel: begripOpties('streefgewicht'), label: t('instellingen.streef') },
      streef == null
        ? h('p', { class: 'cijfer-groot is-leeg' }, '-')
        : h('p', { class: 'cijfer-groot', dataset: { fk: 'streef' } }, opmaakKg(streef).split(/\s/)[0], h('span', { class: 'cijfer-groot__eenheid' }, ' kg')),
      t('gewicht.streefHint'),
      // BESLISSING 463: beide knoppen openen het blad "Streefgewicht" waarin je zelf een gewicht typt (geen beginwaarde, geen stapper)
      kaartKnop(t(streef == null ? 'instellingen.streefZetten' : 'gewicht.streefAanpassen'), t(streef == null ? 'instellingen.streefZettenKort' : 'gewicht.aanpassen'), { opKlik: async () => openStreefBlad({ streef: await leesInstelling('gewicht.streefKg') }) }),
    );

    // ---- De lijst van wegingen: tikbaar naar hun punt in de grafiek; leeg een rustige lege toestand
    // De kerncijfers staan niet meer onder de lijst maar in "Verloop in cijfers" (BESLISSING 289).
    const lijst = kaart(
      { klasse: weinig ? 'gewicht__lijst kaart--licht-op gewicht__lijst--weinig' : 'gewicht__lijst kaart--licht-op' },
      kaartkop({ tegel: begripOpties('gewicht'), label: t('gewicht.lijst') }),
      h('div', { class: 'gewicht__rijen' }, ...(wegingen.length === 0
        ? [h('p', { class: 'gewicht__lijstleeg t-cursief' }, t('gewicht.lijstLeeg'))]
        : [...wegingen].reverse().slice(0, 60).map((w) =>
            rij({
              titel: opmaakDatum(w.datum, 'lang'),
              eind: opmaakKg(w.kg),
              opKlik: () => {
                staat.gekozen = w.week;
                gr.kies(w.week);
                tekenDetail();
              },
            }),
          ))),
    );

    // ---- Verloop in cijfers: een strak raster van kerncijfers uit de wegingen zelf (rekenwerk in logica/gewichtcijfers.js).
    // Neutraal: een verschil heeft alleen een teken, geen kleur. Een cijfer dat nog niets zegt toont "-" met wat er nodig is.
    const cijfers = verloopCijfers(wegingen, vandaagDatum);
    const jaarBij = (datum) => (datum.slice(0, 4) !== vandaagDatum.slice(0, 4) ? ` ${datum.slice(0, 4)}` : '');
    const kortMetJaar = (datum) => opmaakDatum(datum, 'kort') + jaarBij(datum);
    // "-0,6 kg": het getal groot, de eenheid klein erachter
    const metEenheid = (tekst) => {
      const m = /^(.*?)\s+(\S+)$/.exec(tekst);
      return m ? { waarde: m[1], eenheid: m[2] } : { waarde: tekst, eenheid: null };
    };
    const kc = (sleutel, label, tekst, sub) => {
      const { waarde, eenheid } = tekst == null ? { waarde: '-', eenheid: null } : metEenheid(tekst);
      return h(
        'li',
        { class: 'gewicht__kc', dataset: { kc: sleutel } },
        h('p', { class: 'gewicht__kclabel' }, label),
        h('p', { class: 'gewicht__kcwaarde' }, waarde, eenheid ? h('span', { class: 'gewicht__kceenheid' }, ' ' + eenheid) : null),
        h('p', { class: 'gewicht__kcsub' }, sub),
      );
    };
    const cijferKaart = kaart(
      { klasse: 'gewicht__cijferkaart kaart--licht-op' + (laatste ? '' : ' gewicht__cijferkaart--leeg') },
      kaartkop({ tegel: begripOpties('gewicht'), label: t('gewicht.cijfersKop') }),
      laatste
        ? h(
            'ul',
            { class: 'gewicht__overzicht', 'aria-label': t('gewicht.cijfersKop') },
            kc('vorige', t('gewicht.metVorige'), cijfers.sindsVorige != null ? opmaakVerschil(cijfers.sindsVorige) : null, cijfers.vorige ? kortMetJaar(cijfers.vorige.datum) : t('gewicht.kcSubTweede')),
            kc('eerste', t('gewicht.metEerste'), cijfers.sindsEerste != null ? opmaakVerschil(cijfers.sindsEerste) : null, cijfers.sindsEerste != null ? kortMetJaar(cijfers.eerste.datum) : t('gewicht.kcSubTweede')),
            kc('laagste', t('gewicht.kcLaagste'), opmaakKg(cijfers.laagste.kg), kortMetJaar(cijfers.laagste.datum)),
            kc('hoogste', t('gewicht.kcHoogste'), opmaakKg(cijfers.hoogste.kg), kortMetJaar(cijfers.hoogste.datum)),
            kc('maand', t('gewicht.kcMaand'), cijfers.maand ? opmaakKg(cijfers.maand.gemiddelde) : null, cijfers.maand ? t(cijfers.maand.aantal === 1 ? 'gewicht.kcEenWeging' : 'gewicht.kcAantalWegingen', { aantal: cijfers.maand.aantal, maand: MAANDEN_KORT[Number(vandaagDatum.slice(5, 7)) - 1] }) : t('gewicht.kcSubGeenMaand', { maand: MAANDEN_KORT[Number(vandaagDatum.slice(5, 7)) - 1] })),
            kc('aantal', t('gewicht.aantal'), String(cijfers.aantal), t('gewicht.kcSubSinds', { datum: kortMetJaar(cijfers.eerste.datum) })),
          )
        : h('p', { class: 'gewicht__leegregel' }, t('gewicht.cijfersLeeg')),
    );

    // ---- Weg naar je streefgewicht: alleen met een streefgewicht en een eerste weging. Een rustige balk van het startgewicht (de eerste
    // weging) naar het streefgewicht, met een markering waar ze nu staat. Beide richtingen; geen percentage, geen oordeel.
    const voortgang = streef != null && laatste ? voortgangNaarStreef(cijfers.eerste.kg, laatste.kg, streef) : null;
    const waarde = (klasse, label, tekst, sub) =>
      h('div', { class: `gewicht__waarde ${klasse}` }, h('p', { class: 'gewicht__kclabel' }, label), h('p', { class: 'gewicht__kcwaarde' }, metEenheid(tekst).waarde, h('span', { class: 'gewicht__kceenheid' }, ' kg')), h('p', { class: 'gewicht__kcsub' }, sub));
    const wegKaart = voortgang
      ? kaart(
          { klasse: 'gewicht__weg kaart--licht-op' },
          kaartkop({ tegel: begripOpties('streefgewicht'), label: t('gewicht.wegKop') }),
          h(
            'div',
            { class: 'gewicht__wegromp' },
            h(
              'div',
              { class: 'gewicht__pad', role: 'img', 'aria-label': t('gewicht.wegAria', { start: opmaakKg(cijfers.eerste.kg), streef: opmaakKg(streef), nu: opmaakKg(laatste.kg) }) },
              h('span', { class: 'gewicht__padvul', style: { '--f': voortgang.fractie } }),
              h('span', { class: 'gewicht__padmerk', style: { '--f': voortgang.fractie } }),
            ),
            h(
              'div',
              { class: 'gewicht__waarden' },
              waarde('gewicht__waarde--start', t('gewicht.wegStart'), opmaakKg(cijfers.eerste.kg), kortMetJaar(cijfers.eerste.datum)),
              waarde('gewicht__waarde--nu', t('gewicht.wegNu'), opmaakKg(laatste.kg), kortMetJaar(laatste.datum)),
              waarde('gewicht__waarde--streef', t('gewicht.wegStreef'), opmaakKg(streef), t('gewicht.wegDoel')),
            ),
            h('p', { class: 'gewicht__wegzin' }, voortgang.bereikt ? t('gewicht.wegBereikt') : t('gewicht.wegNog', { kg: opmaakKg(voortgang.rest) })),
          ),
        )
      : null;

    // ---- Weegkalender: de laatste twaalf weken, één bolletje per week (statisch: niet aanklikbaar). Gevuld als er die week een weging is,
    // een zachte ring als niet, de lopende week met een ring eromheen; weken vóór haar eerste weging zijn heel licht en tellen niet als gemist.
    const ddmm = (datum) => `${datum.slice(8, 10)}/${datum.slice(5, 7)}`;
    const weken = weekKalender(wegingen, vandaagDatum, weegdag);
    const telling = wekenGewogen(weken);
    const kalKaart = kaart(
      { klasse: 'gewicht__kal kaart--licht-op' + (laatste ? '' : ' gewicht__kal--leeg') },
      kaartkop({ tegel: begripOpties('weegdag'), label: t('gewicht.kalKop') }),
      laatste
        ? h(
            'div',
            { class: 'gewicht__kalromp' },
            h(
              'ol',
              { class: 'gewicht__weken', 'aria-label': t('gewicht.kalKop') },
              ...weken.map((w) =>
                h(
                  'li',
                  { class: ['gewicht__week', w.gevuld && 'is-gevuld', w.isNu && 'is-nu', w.voorEerste && 'is-voor'], 'aria-label': t('gewicht.kalWeek', { datum: opmaakDatum(w.datum, 'kort'), stand: t(w.gevuld ? 'gewicht.kalGewogen' : 'gewicht.kalNiet') }) },
                  h('span', { class: 'gewicht__weekmaand', 'aria-hidden': 'true' }, w.maandLabel),
                  h('span', { class: 'gewicht__bol', 'aria-hidden': 'true' }),
                  h('span', { class: 'gewicht__weekdatum cijfer', 'aria-hidden': 'true' }, ddmm(w.datum)),
                ),
              ),
            ),
            h(
              'div',
              { class: 'gewicht__kalregels' },
              h('p', { class: 'gewicht__kalregel' }, telling.van <= 1 ? t('gewicht.kalTellingEen') : t('gewicht.kalTelling', { gewogen: telling.gewogen, van: telling.van })),
              h('p', { class: 'gewicht__kalregel gewicht__kalregel--volgende t-gedempt' }, dagenTot === 0 ? t('gewicht.kalVandaag') : t('gewicht.kalVolgende', { datum: opmaakDatum(volgende, 'lang') })),
            ),
          )
        : h('p', { class: 'gewicht__leegregel' }, t('gewicht.kalLeeg')),
    );

    // ---- Goed om te weten: dezelfde opbouw als op Drinken: drie gelijke kolommen, "Toon het me" rechts in de kop
    const weetjes = kaart(
      { klasse: 'gewicht__weetjes kaart--licht-op' },
      kaartkop({ tegel: begripOpties('gewicht'), label: t('instellingen.goedOmTeWeten') }),
      // Vier gelijke kolommen: de drie weetjes en als vierde "Toon het me", in dezelfde vorm (tegel ervoor, tekst ernaast); de hele kolom is de knop.
      h(
        'div',
        { class: 'gewicht__weetjesrij' },
        // BESLISSING 567: elk weetje een eigen icoon (de weegdag, het aanpassen, het streefgewicht), in de familie van Gewicht
        ...['weegdag', 'bewerken', 'streefgewicht'].map((begrip, i) => h('div', { class: 'weetje' }, begripTegel(begrip, { familie: ICOON.gewicht.familie }), h('p', { class: 'weetje__tekst' }, t(`gewicht.weetje${i + 1}`)))),
        toonHetMe({ familie: ICOON.gewicht.familie, opKlik: () => startRondleiding({ sleutel: 'gewicht' }), klasse: 'gewicht__toon' }),
      ),
    );

    const kaarten = [hoofd, weegdagKaart, streefKaart, grafiekKaart, lijst, cijferKaart, kalKaart, wegKaart, weetjes].filter(Boolean);
    if (opent) komOp(kaarten, { stap: 90 });
    if (staat.focusOp) {
      const doel = staat.focusOp;
      staat.focusOp = null;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const actief = document.activeElement;
        if (actief && actief !== document.body && actief.isConnected && houder.contains(actief)) return;
        houder.querySelector(doel)?.focus({ preventScroll: true });
      }));
    }
    if (staat.focusNa) {
      staat.focusNa = false;
      requestAnimationFrame(() => {
        const actief = document.activeElement;
        if (actief && actief !== document.body && actief.isConnected) return;
        (houder.querySelector('.gewicht__rijen .rij') ?? houder.querySelector('.gewichthoofd .gewicht__actie .knop'))?.focus({ preventScroll: true });
      });
    }

    return h(
      'div',
      { class: 'stapel stapel--sectie gewicht' },
      schermkop({ titel: t('tab.gewicht') }),
      h('div', { class: ['raster gewicht__raster', wegingen.length < 2 && 'gewicht__raster--weinig', wegKaart ? 'gewicht__raster--weg' : 'gewicht__raster--zonderweg'] }, ...kaarten),
    );
  });

  const stopUitleg = registreerUitleg('gewicht', {
    openWeging: async () => {
      const b = await openWegingBlad({ kijkstand: true });
      return () => b.sluit();
    },
  });
  const stopHaken = haakUitleg(houder, {
    haken: [['.gewichthoofd .gewicht__actie .knop', 'weging-knop'], ['.gewicht__lijst', 'gewicht-lijst'], ['.gewichtgrafiek .segment', 'grafiek-periode'], ['.gewichtgrafiek__vlak', 'grafiek-vlak'], ['.gewichtstreef', 'streefgewicht']],
  });
  return () => {
    stopUitleg();
    stopHaken();
    opruim();
  };
}
