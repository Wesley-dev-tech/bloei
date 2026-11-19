// Tab Supplementen (E11, BESLISSINGEN 107 tot 113, 138 tot 141 en 213, 214): de eigen lijst van de gebruiker, per moment van de dag, als leeslijst.
// Op dit tabblad vink je niets af (afvinken doe je op Vandaag per moment, en een geplande spuit in het Dagboek). Een tik op een supplement opent zijn kaart
// (src/ui/supplementkaart.js) om het aan te passen of weg te halen; "Supplement toevoegen" opent dezelfde kaart leeg. Alles bewaart zichzelf.
import { h } from '../ui/dom.js';
import { ICOON, begripOpties } from '../ui/iconenkaart.js';
import { kaart, kaartkop, knop, legeToestand, schermkop, rij } from '../ui/componenten.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { registreerUitleg } from '../uitleg/rondleiding.js';
import { beheerScherm, geldigeDatum, zetHashRecht } from './hulp.js';
import { momentKaart, beurtKaart, binnenkortKaart, ritmeTekst } from './momenten.js';
import { openSupplementkaart, sluitSupplementkaart } from '../ui/supplementkaart.js';
import { lijstBestandKnoppen } from '../ui/supplementenlijst-bestand.js';
import { t } from '../teksten.js';
import { isToekomst, opmaakDatum, vandaag, weekStart } from '../kern/datum.js';
import { MOMENTEN, momentVanNu, leesSupplementen, schemaVanDag, innameTijdstippen } from '../data/supplementen.js';
import { leesWeekoverzicht } from '../data/statistiek.js';
import { suppWeekKaart } from './weekkaart.js';
import { eersteToon, komOp, bloeiOp } from '../ui/beweging.js';
import { heeftLangWoord } from '../kern/langwoord.js';

const isPeriodiekSupplement = (s) => s.ritme?.soort === 'interval' || s.ritme?.soort === 'maand';
const MOMENT_KORT = { ochtend: 'O', middag: 'M', avond: 'A' };
// De knop in het schema heet anders dan de rij in de momentkaarten ("<naam> aanpassen"), zodat een schermlezer twee verschillende knoppen hoort.

// Het dagschema "Mijn supplementen" (BESLISSINGEN 202, 209, 211): deel 1 "Elke dag" met een teken per moment, deel 2 "Niet elke dag" met ritme en volgende of laatste keer,
// deel 3 "Begint binnenkort" (supplementen die nog moeten beginnen) en deel 4 "Gestopt" (na hun laatste datum). Geen totalen.
// Echte tabellen voor de schermlezer; een tik op een rij opent de supplementkaart.
function overzichtKaart(lijst, schema, opOpen, toekomst = false) {
  const actief = lijst.filter((s) => s.actief !== false);
  if (!actief.length) return null;
  const vandaagDatum = vandaag();
  const nogNiet = (s) => !!s.vanaf && s.vanaf > vandaagDatum;
  const gestopt = (s) => !!s.tot && s.tot < vandaagDatum;
  const info = new Map(schema.periodiek.map((p) => [p.supplement.id, p]));
  const opNaam = (a, b) => a.naam.localeCompare(b.naam, 'nl', { sensitivity: 'base' });
  const lopend = actief.filter((s) => !nogNiet(s) && !gestopt(s));
  // Eerst wat ze drie keer per dag neemt, dan twee keer, dan één keer; binnen een groep op naam.
  const dagelijks = lopend.filter((s) => !isPeriodiekSupplement(s)).sort((a, b) => (b.momenten ?? []).length - (a.momenten ?? []).length || opNaam(a, b));
  const periodiek = lopend.filter(isPeriodiekSupplement).sort(opNaam);
  const komend = actief.filter(nogNiet).sort((a, b) => a.vanaf.localeCompare(b.vanaf) || opNaam(a, b));
  const gestopte = actief.filter((s) => !nogNiet(s) && gestopt(s)).sort((a, b) => b.tot.localeCompare(a.tot) || opNaam(a, b));

  const bewerkRij = (s, ...cellen) => h('tr', { class: 'overzicht__rij', dataset: { id: s.id }, onclick: (e) => opOpen(s.id, e.currentTarget.querySelector('.schema__knop')) }, ...cellen);
  // Een gewoon woord breekt nooit midden af; alleen tekst met een uitzonderlijk lang woord krijgt is-langwoord (src/kern/langwoord.js).
  const lang = (klasse, tekst) => (heeftLangWoord(tekst) ? klasse + ' is-langwoord' : klasse);
  const naamCel = (s, sub) =>
    h(
      'th',
      { scope: 'row', class: 'schema__naam' },
      h('button', { type: 'button', class: lang('schema__knop', s.naam), 'aria-haspopup': 'dialog', 'aria-label': t('supplementen.bewerkSchema', { naam: s.naam }), onclick: (e) => { e.stopPropagation(); opOpen(s.id, e.currentTarget); } }, s.naam),
      sub ? h('span', { class: lang('schema__sub t-klein t-gedempt', sub) }, sub) : null,
    );
  const hoeveelCel = (s) =>
    h(
      'td',
      { class: 'schema__hoeveel' },
      h('span', { class: lang('schema__hoofd', s.hoeveelheid) }, s.hoeveelheid || '-'),
      s.aanwijzing ? h('span', { class: lang('schema__extra t-klein t-gedempt', s.aanwijzing) }, s.aanwijzing) : null,
    );
  // Op een telefoon staat de hoeveelheid met de aanwijzing onder de naam (de kolom Hoeveelheid is dan weg).
  const subTelefoon = (s) => [s.hoeveelheid, s.aanwijzing].filter(Boolean).join(' · ');
  const kopCel = (tekst, kort) =>
    h('th', { scope: 'col', class: 'schema__moment', 'aria-label': tekst }, h('span', { class: 'schema__lang', 'aria-hidden': 'true' }, tekst), kort ? h('span', { class: 'schema__kort', 'aria-hidden': 'true' }, kort) : null);
  const datumTekst = (d) => opmaakDatum(d, 'lang');

  // Deel 1: elke dag
  const dagRijen = dagelijks.map((s) =>
    bewerkRij(
      s,
      naamCel(s, subTelefoon(s)),
      hoeveelCel(s),
      ...MOMENTEN.map((m) => {
        const neemt = (s.momenten ?? []).includes(m);
        const naam = t('supplementen.moment.' + m);
        return h(
          'td',
          { class: 'schema__teken' },
          neemt
            ? h('span', { class: 'schema__punt', role: 'img', 'aria-label': t('supplementen.schemaJa', { moment: naam }) })
            : h('span', { class: 'schema__geen', role: 'img', 'aria-label': t('supplementen.schemaNee', { moment: naam }) }),
        );
      }),
    ),
  );
  const dagTabel = dagelijks.length
    ? h(
        'table',
        { class: 'schema schema--dag' },
        h('caption', { class: 'schema__bijschrift label' }, t('supplementen.schemaDag')),
        h(
          'thead',
          null,
          h('tr', null, h('th', { scope: 'col', class: 'schema__kolom' }, t('supplementen.kolomSupplement')), h('th', { scope: 'col', class: 'schema__kolom schema__hoeveelkop' }, t('supplementen.kolomHoeveelheid')), ...MOMENTEN.map((m) => kopCel(t('supplementen.moment.' + m), MOMENT_KORT[m]))),
        ),
        h('tbody', null, ...dagRijen),
      )
    : null;

  // Delen met een ritme-achtige indeling: Supplement, Hoeveelheid, Ritme (of Momenten) en een datum.
  const ritmeTabel = ({ bijschrift, kopRitme, kopDatum, items }) =>
    items.length
      ? h(
          'table',
          { class: 'schema schema--periodiek' },
          h('caption', { class: 'schema__bijschrift label' }, bijschrift),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col', class: 'schema__kolom' }, t('supplementen.kolomSupplement')),
              h('th', { scope: 'col', class: 'schema__kolom schema__hoeveelkop' }, t('supplementen.kolomHoeveelheid')),
              h('th', { scope: 'col', class: 'schema__kolom schema__ritmekop' }, kopRitme),
              h('th', { scope: 'col', class: 'schema__kolom schema__volgendekop' }, kopDatum),
            ),
          ),
          h(
            'tbody',
            null,
            ...items.map(({ s, ritme, datum }) =>
              bewerkRij(s, naamCel(s, [subTelefoon(s), ritme, datum].filter((x) => x && x !== '-').join(' · ')), hoeveelCel(s), h('td', { class: 'schema__ritme' }, ritme || '-'), h('td', { class: 'schema__volgende' }, datum || '-')),
            ),
          ),
        )
      : null;
  const momentenTekst = (s) => (s.momenten ?? []).map((m) => t('supplementen.moment.' + m).toLowerCase()).join(', ');

  const periodiekTabel = ritmeTabel({
    bijschrift: t('supplementen.schemaNiet'),
    kopRitme: t('supplementen.kolomRitme'),
    kopDatum: t('supplementen.kolomVolgende'),
    items: periodiek.map((s) => {
      const p = info.get(s.id);
      const vol = p?.volgende;
      const datum = vol ? (p.laatste ? t('supplementen.laatsteKeer', { datum: datumTekst(vol) }) : vol < vandaagDatum ? t('supplementen.beurtSinds', { datum: datumTekst(vol) }) : datumTekst(vol)) : '';
      return { s, ritme: ritmeTekst(s.ritme), datum };
    }),
  });
  const komendTabel = ritmeTabel({
    bijschrift: t('supplementen.schemaBinnenkort'),
    kopRitme: t('supplementen.kolomWanneer'),
    kopDatum: t('supplementen.kolomBegint'),
    items: komend.map((s) => ({ s, ritme: isPeriodiekSupplement(s) ? ritmeTekst(s.ritme) : momentenTekst(s), datum: datumTekst(s.vanaf) })),
  });
  const gestoptTabel = ritmeTabel({
    bijschrift: t('supplementen.schemaGestopt'),
    kopRitme: t('supplementen.kolomWanneer'),
    kopDatum: t('supplementen.kolomGestopt'),
    items: gestopte.map((s) => ({ s, ritme: isPeriodiekSupplement(s) ? ritmeTekst(s.ritme) : momentenTekst(s), datum: datumTekst(s.tot) })),
  });
  if (!dagTabel && !periodiekTabel && !komendTabel && !gestoptTabel) return null;

  // Als laatste in de kaart: de lijst bewaren als bestand en uit een bestand overnemen (BESLISSINGEN 696 en 707); niet op een dag in de toekomst,
  // net als Supplement toevoegen.
  return kaart(
    { klasse: 'overzichtkaart', 'data-uitleg': 'lijst' },
    kaartkop({ tegel: begripOpties('supplementen'), label: t('supplementen.overzicht') }),
    dagTabel,
    periodiekTabel,
    komendTabel,
    gestoptTabel,
    toekomst ? null : lijstBestandKnoppen({ supplementen: lijst }),
  );
}

export function toon(houder, params = {}) {
  // Het oude adres van de bewerkpagina (#/supplementen/aanpassen, BESLISSING 212 vervalt) brengt gewoon naar het tabblad.
  if (params.datum !== undefined && !geldigeDatum(params.datum)) zetHashRecht('#/supplementen');
  // De datum leeft hoogstens één tekening lang (BESLISSING 203): elke tekening bepaalt hem opnieuw, dus na een dagwissel toont 'vandaag' de nieuwe dag.
  let datum, eerder, toekomst;
  const zetDag = () => {
    datum = geldigeDatum(params.datum) ? params.datum : vandaag();
    eerder = datum !== vandaag();
    toekomst = isToekomst(datum);
  };
  zetDag();

  // Een tik op een supplement (of op "Supplement toevoegen") opent de supplementkaart; daarna krijgt de rij weer focus.
  // Het scherm tekent zichzelf opnieuw bij gewijzigde gegevens (de kaart zendt 'data:gewijzigd').
  const opOpen = async (id, opener) => {
    const uit = await openSupplementkaart({ id: id ?? null, opener });
    const doelId = uit?.id ?? id;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (uit?.actie === 'bewaard' && id == null && doelId != null) houder.querySelectorAll('[data-id="' + doelId + '"]').forEach((el) => bloeiOp(el));
        const actief = document.activeElement;
        if (actief && actief !== document.body && actief.isConnected) return;
        const rij = doelId != null && uit?.actie !== 'weggehaald' ? houder.querySelector('.supplementrij[data-id="' + doelId + '"], .schema__knop[aria-label][data-id="' + doelId + '"], .overzicht__rij[data-id="' + doelId + '"] .schema__knop') : null;
        (rij ?? houder.querySelector('.sup-toevoegen'))?.focus({ preventScroll: true });
      }),
    );
  };

  const kop = (acties = []) =>
    h(
      'header',
      { class: 'drinken__kop' },
      schermkop({ titel: t('tab.supplementen'), acties }),
      eerder
        ? h(
            'div',
            { class: 'drinken__dag' },
            h('p', { class: 'label' }, opmaakDatum(datum, 'lang')),
            knop(t('dag.naarVandaag'), { soort: 'tekst', opKlik: () => (window.location.hash = '#/supplementen') }),
          )
        : null,
      toekomst ? h('p', { class: 'dag__toekomst t-cursief' }, t('dag.toekomst')) : null,
    );

  async function scherm() {
    const schema = await schemaVanDag(datum);
    const binnenkort = schema.binnenkort ?? [];
    const lijst = await leesSupplementen();
    const week = await leesWeekoverzicht(weekStart(datum));
    const tijdstippen = await innameTijdstippen(datum);

    if (!schema.momenten.length && !schema.periodiek.length && !binnenkort.length) {
      // Een echte lege toestand over de breedte: een uitnodiging, de uitleg in drie stappen en een voorbeeld van een moment.
      const voorbeeld = momentKaart({ moment: 'ochtend', items: [{ supplement: { id: 0, naam: t('supplementen.voorbeeldNaam'), hoeveelheid: '1 tablet', aanwijzing: t('supplementen.voorbeeldHoe') }, genomen: false }] });
      voorbeeld.classList.add('supplementen__voorbeeld');
      voorbeeld.setAttribute('aria-hidden', 'true');
      return h(
        'div',
        { class: 'stapel stapel--sectie supplementen' },
        kop(),
        h(
          'div',
          { class: 'raster raster--2 supplementen__leeg' },
          (() => {
            const leegKaart = kaart({ klasse: 'supplementen__leegkaart' }, legeToestand({ tekst: t('supplementen.leeg'), actie: toekomst ? null : { label: t('supplementen.eerste'), opKlik: () => opOpen(null, leegKaart.querySelector('button')) } }));
            leegKaart.querySelector('button')?.setAttribute('data-uitleg', 'momenten'); // de eerste stap van de uitleg wijst hier naartoe
            // Onder "Eerste supplement toevoegen" (dat de eerste knop van de kaart blijft): de lijst uit een bestand overnemen (696, 707).
            if (!toekomst) leegKaart.querySelector('.leeg')?.append(lijstBestandKnoppen({ supplementen: [] }));
            return leegKaart;
          })(),
          kaart(
            { klasse: 'supplementen__uitleg' },
            kaartkop({ tegel: begripOpties('supplementen'), label: t('supplementen.leegKop') }),
            rij({ tegel: begripOpties('toevoegen'), titel: t('supplementen.leegStap1') }),
            rij({ tegel: begripOpties('supplementen'), titel: t('supplementen.leegStap2') }),
            rij({ tegel: begripOpties('periode'), titel: t('supplementen.leegStap3') }),
            h('p', { class: 'label supplementen__voorbeeldlabel' }, t('supplementen.leegVoorbeeld')),
            voorbeeld,
          ),
        ),
      );
    }

    const nu = eerder ? null : momentVanNu();
    // Boven in de kop staat alleen "Supplement toevoegen"; op een telefoon staat dezelfde knop over de breedte onder de kop.
    const toevoegenKnop = (klasse) => {
      const k = knop(t('supplementen.toevoegenNu'), { soort: 'tekst', icoon: ICOON.toevoegen.naam, opKlik: () => opOpen(null, k) });
      k.classList.add('sup-toevoegen', klasse);
      k.setAttribute('data-uitleg', 'toevoegen');
      k.setAttribute('aria-haspopup', 'dialog');
      return k;
    };
    const toevoegenKop = toevoegenKnop('sup-toevoegen--kop');
    const toevoegenBreed = toevoegenKnop('sup-toevoegen--breed');
    const knopRij = h('div', { class: 'sup-knoprij' }, ...(toekomst ? [] : [toevoegenBreed]));
    const beurt = beurtKaart({ periodiek: schema.periodiek, datum, opOpen });
    const laterKaart = binnenkortKaart({ periodiek: schema.periodiek, binnenkort, opOpen });
    // Opbouw (BESLISSING 148, testronde): rij 1 Deze week, rij 2 de momenten, rij 3 "Vandaag ook te doen" en "Binnenkort" onder elkaar over de volle breedte, rij 4 het dagschema.
    // De DOM-volgorde is altijd Ochtend, Middag, Avond, Vandaag ook te doen, Binnenkort. Rij 2 heeft vanaf 1100 px twee kolommen (Ochtend links, Middag en Avond rechts, of
    // Ochtend en Middag links en Avond rechts als dat gelijker uitkomt), bij drie ongeveer even lange momenten vanaf 1280 px drie kolommen. Is de ene kolom een tikje korter,
    // dan verdeelt de CSS de rijen van haar laatste kaart over de hoogte (data-gelijk), zodat er nergens een leeg vlak valt en geen kaart hoger is dan haar inhoud.
    const momentKaarten = schema.momenten.map((m) => {
      const vink = tijdstippen?.[m.moment];
      const tijd = vink ? `${new Date(vink).getHours()}.${String(new Date(vink).getMinutes()).padStart(2, '0')}` : null;
      return momentKaart({ moment: m.moment, items: m.items, isNu: m.moment === nu, tijd, opOpen });
    });
    const extraKaarten = [beurt, laterKaart].filter(Boolean);
    [...momentKaarten, ...extraKaarten].forEach((k, i) => { k.dataset.volgorde = String(i); });
    // De rijen van de momenten, "Vandaag ook te doen" en "Binnenkort" (gebouwd in momenten.js): alleen een naam of regel met een uitzonderlijk lang woord breekt af.
    for (const k of [...momentKaarten, ...extraKaarten]) for (const el of k.querySelectorAll('.rij__titel, .rij__sub')) if (heeftLangWoord(el.textContent)) el.classList.add('is-langwoord');
    const gewicht = schema.momenten.map((m) => m.items.length + 1.3); // een rij is 1, een kop met lijn ongeveer 1,3
    const som = (lijst) => lijst.reduce((a, b) => a + b, 0);
    let splits = 1; // aantal momenten in de linkerkolom
    if (gewicht.length === 3) {
      const v1 = Math.abs(gewicht[0] - (gewicht[1] + gewicht[2] + 0.3));
      const v2 = Math.abs(gewicht[0] + gewicht[1] + 0.3 - gewicht[2]);
      splits = v2 < v1 ? 2 : 1;
    }
    const links = momentKaarten.slice(0, splits);
    const rechts = momentKaarten.slice(splits);
    const drie = gewicht.length === 3 && Math.max(...gewicht) - Math.min(...gewicht) <= 2;
    // Hoeveel hoger de rijen van de kortere kolom moeten worden om gelijk te eindigen (in rijen); tot 1,2 rij verschil is dat hooguit ± 12 px per rij.
    const kolomGewicht = [som(gewicht.slice(0, splits)) + 0.3 * (splits - 1), som(gewicht.slice(splits)) + 0.3 * Math.max(0, gewicht.length - splits - 1)];
    const korter = kolomGewicht[0] < kolomGewicht[1] ? splits : gewicht.length - splits;
    const kortereRijen = Math.max(1, (kolomGewicht[0] < kolomGewicht[1] ? schema.momenten[splits - 1] : schema.momenten[schema.momenten.length - 1])?.items.length ?? 1);
    const gelijk = rechts.length > 0 && korter > 0 && (Math.abs(kolomGewicht[0] - kolomGewicht[1]) * 85) / kortereRijen <= 14;
    const momentenRij = momentKaarten.length
      ? h(
          'div',
          { class: 'suppmomenten', dataset: { drie: drie ? 'ja' : 'nee', gelijk: gelijk ? 'ja' : 'nee' } },
          h('div', { class: 'suppkol' }, ...links),
          rechts.length ? h('div', { class: 'suppkol' }, ...rechts) : null,
        )
      : null;
    const kaartenRaster = momentenRij || extraKaarten.length ? h('div', { class: 'suppraster', 'data-uitleg': 'momenten' }, momentenRij, ...extraKaarten) : null;
    const el = h(
      'div',
      { class: 'stapel stapel--sectie supplementen' },
      kop(toekomst ? [] : [toevoegenKop]),
      knopRij,
      h(
        'div',
        { class: 'stapel supplementen__raster' },
        suppWeekKaart({ dagen: week.dagen.map((d) => ({ datum: d.datum, genomen: d.supplementen?.genomen ?? 0, totaal: d.supplementen?.totaal ?? 0, momenten: d.supplementMomenten })), vandaag: vandaag() }),
        kaartenRaster,
        overzichtKaart(lijst, schema, opOpen, toekomst),
      ),
    );
    // Bij het openen van het scherm komen de kaarten rustig op; bij een hertekening na een tik gebeurt er niets.
    if (eersteToon('supplementen:kaarten')) komOp(el.querySelectorAll('.supplementen__raster .kaart'));
    return el;
  }

  const opruimScherm = beheerScherm(houder, () => {
    zetDag();
    return scherm();
  }, { lichtOp: true });
  const stopHaken = haakUitleg(houder, {
    haken: [
      ['.momentkaart', 'supplement-moment'],
      ['.beurtkaart', 'aan-de-beurt'],
      ['.laterkaart', 'later'],
      ['.overzicht__rij', 'supplement-rij'],
    ],
  });
  const wacht = async (vind) => {
    for (let i = 0; i < 60; i++) {
      const el = vind();
      if (el) return el;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  // Uitleg: de supplementkaart opent zonder te bewaren; de teruggegeven functie sluit hem weer (sluitSupplementkaart bewaart niets).
  const stopUitleg = registreerUitleg('supplementen', {
    openNieuwSupplement: async () => {
      openSupplementkaart({ id: null });
      await wacht(() => document.querySelector('dialog[open]'));
      return () => sluitSupplementkaart();
    },
    // Opent de kaart van het eerste supplement in de lijst (of van het supplement met het opgegeven id). Is er nog geen supplement (BESLISSING 694),
    // dan het lege kaartje, zoals Eerste supplement toevoegen het opent: de handleiding legt dan de velden uit op dat kaartje. Ook dan wordt er
    // niets bewaard: de teruggegeven functie sluit het zonder te bewaren.
    openBewerkSupplement: async (id) => {
      const lijst = await leesSupplementen();
      const doel = typeof id === 'number' ? id : lijst.find((s) => s.actief !== false)?.id; // de rondleiding geeft { kijkstand: true } mee, geen id
      openSupplementkaart({ id: doel ?? null });
      await wacht(() => document.querySelector('dialog[open]'));
      return () => sluitSupplementkaart();
    },
  });
  return () => {
    stopHaken();
    stopUitleg();
    sluitSupplementkaart();
    opruimScherm();
  };
}
