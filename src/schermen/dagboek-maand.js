// Dagboek · Maand (BESLISSING 255, herzien): een rustige kalender (per dag het nummer, een salie bolletje bij alle supplementen genomen en een eventueel spuitje) met
// eromheen: bovenaan het overzicht van de volle maand (acht cijfers), naast de kalender het paneel van de gekozen dag (alle detail uit de cel) en
// daaronder een compact blok "Gepland deze maand". Alles komt uit haar echte gegevens. Op een telefoon staan ze onder elkaar.
// Vandaag is bij het openen gekozen (in een andere maand de eerste dag), zodat het paneel nooit leeg is.
import { h } from '../ui/dom.js';
import { kaart, kaartkop, bladerkop, knop, rij } from '../ui/componenten.js';
import { maandkalender } from '../ui/maandkalender.js';
import { eersteToon, komOp, vervaag } from '../ui/beweging.js';
import { beheerScherm } from './hulp.js';
import { t } from '../teksten.js';
import { naarDatum, naarSleutel, opmaakDatum, vandaag } from '../kern/datum.js';
import { opmaakLiter, opmaakKg } from '../kern/getal.js';
import { leesMaand } from '../data/statistiek.js';
import { leesInstelling } from '../data/instellingen.js';
import { leesWegingen } from '../data/wegingen.js';
import { MAALTIJDSOORTEN, isIngevuld, leesMaaltijden } from '../data/maaltijden.js';
import { leesAgenda, leesBegindagen } from '../data/agenda.js';
import { zetBeurt } from '../ui/beurt.js';
import { schemaVanDag } from '../data/supplementen.js';
import { telMomenten } from '../logica/supplementen.js';
import { gemiddeldOverDagen } from '../logica/drinken-week.js';
import { begripOpties, begripIcoon, begripTegel } from '../ui/iconenkaart.js';

const kleineKnop = (tekst, opKlik, label) => {
  const k = knop(tekst, { soort: 'secundair', opKlik, label });
  k.classList.add('knop--klein');
  return k;
};

// Een blok van het paneel van de dag: het icoon in de kleur van zijn begrip, de naam, de waarde rechts en eventueel inhoud eronder.
const blok = (begrip, titel, waarde, ...inhoud) =>
  h('div', { class: 'maand__blok' }, h('div', { class: 'maand__blokkop' }, h('span', { class: 'maand__teken--' + begrip, 'aria-hidden': 'true' }, begripIcoon(begrip, { grootte: 20 })), h('span', { class: 'maand__bloktitel' }, titel), h('span', { class: 'maand__blokwaarde cijfer' }, waarde)), ...inhoud);

const ga = (pad) => {
  window.location.hash = pad;
};

function verschuif(jaarMaand, n) {
  const [j, m] = jaarMaand.split('-').map(Number);
  const d = new Date(j, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function toon(houder, params = {}) {
  const jaarMaand = params.sleutel;
  const volgende = verschuif(jaarMaand, 1);
  const staat = { gekozen: params.gekozen?.startsWith(jaarMaand) ? params.gekozen : vandaag().startsWith(jaarMaand) ? vandaag() : `${jaarMaand}-01` };

  return beheerScherm(houder, async () => {
    const gegevens = await leesMaand(jaarMaand); // alleen de bijgehouden dagen; de cijfers tellen hieruit
    // De agenda van periodieke supplementen (BESLISSING 208): ook op toekomstige dagen en in volgende maanden.
    const laatsteDag = naarSleutel(new Date(Number(jaarMaand.slice(0, 4)), Number(jaarMaand.slice(5)), 0));
    const agenda = await leesAgenda(`${jaarMaand}-01`, laatsteDag);
    const begindagen = await leesBegindagen(`${jaarMaand}-01`, laatsteDag); // een dagelijks supplement dat begint: één regel op de begindag, geen teken per dag
    const kalGegevens = { ...gegevens };
    for (const [datum, lijst] of Object.entries(agenda)) kalGegevens[datum] = { ...(gegevens[datum] ?? {}), spuit: lijst };
    const doelMl = await leesInstelling('drinken.dagdoelMl');
    const wegingenMaand = (await leesWegingen(`${jaarMaand}-01`)).filter((w) => w.datum <= laatsteDag).sort((x, y) => (x.datum < y.datum ? -1 : 1));
    const opent = !params.bladeren && eersteToon('dagboek:maand');
    const dagkaart = h('div', { class: 'maand__dag' });

    // Het paneel van de gekozen dag: eten (de maaltijden met hun uur), drinken (een baan tot het dagdoel), supplementen als
    // momenten (BESLISSING 150), de geplande beurt en de knop naar de dag. De notitie staat niet in de maand (0.5.8): die lees je in de dag.
    let tekening = 0;
    async function vulDag() {
      const mijn = ++tekening;
      const datum = staat.gekozen;
      if (!datum) {
        dagkaart.replaceChildren(kaart({ klasse: 'maand__paneel' }, kaartkop({ tegel: begripOpties('dagboek'), label: t('maand.gekozenDag') }), h('p', { class: 'maand__tik t-cursief' }, t('maand.tikDag'))));
        return;
      }
      const [maaltijden, schema] = await Promise.all([leesMaaltijden(datum), schemaVanDag(datum)]);
      if (mijn !== tekening) return; // intussen is er een andere dag gekozen
      const g = gegevens[datum] ?? { maaltijden: 0, ml: 0 };
      // De momenten komen uit het schema van die dag, zonder periodieke supplementen (BESLISSING 209 en 219): een afgevinkte spuit telt hier niet mee.
      const m = telMomenten(schema);
      const dagelijksGenomen = schema.momenten.some((mo) => mo.items.some((i) => i.genomen));
      const pillen = dagelijksGenomen && m.totaal > 0 ? t('supplementen.momentStand', { genomen: m.klaar, totaal: m.totaal }) : '-';
      const gegeten = MAALTIJDSOORTEN.filter((soort) => maaltijden[soort] && isIngevuld(maaltijden[soort]));
      // Eten: altijd de zes maaltijden op hun vaste plaats: het uur (of een streepje bij wat nog open staat), de naam en eronder wat er
      // gegeten is. Dit blok rekt mee met de hoogte van het paneel en past zijn indeling aan de hoogte aan (scherm-dagboek-maand.css):
      // twee kolommen of één, met of zonder de regel met wat er gegeten is. Zo is het paneel op elke dag en op elke breedte tot onderaan
      // gevuld met haar eigen dagboek, zonder iets van een ander tabblad.
      const etenBlok = blok(
        'eten',
        t('dag.eten'),
        gegeten.length ? t('maand.etenWaarde', { aantal: gegeten.length, totaal: MAALTIJDSOORTEN.length }) : '-',
        h(
          'div',
          { class: 'maand__etenlijst' },
          h(
            'ul',
            { class: 'maand__maaltijden' },
            ...MAALTIJDSOORTEN.map((soort) => {
              const klaar = gegeten.includes(soort);
              const wat = klaar ? (maaltijden[soort].tekst ?? '').trim().split('\n')[0] : t('maand.maaltijdOpen');
              return h(
                'li',
                { class: ['maand__maaltijd', !klaar && 'is-open'] },
                h('span', { class: 'maand__maaltijdkop' }, h('span', { class: 'cijfer t-gedempt' }, klaar ? maaltijden[soort].tijd : '-'), h('span', { class: 'maand__maaltijdnaam' }, t('maaltijd.' + soort))),
                h('span', { class: 'maand__maaltijdtekst' }, wat),
              );
            }),
          ),
        ),
      );
      etenBlok.classList.add('maand__blok--rek');
      dagkaart.replaceChildren(
        kaart(
          { klasse: 'maand__paneel' },
          // (zie onderaan: de vervaging boven "Dag openen" als er toch iets weg te scrollen valt)
          kaartkop({ tegel: begripOpties('dagboek'), label: opmaakDatum(datum, 'lang') }),
          // De inhoud scrolt binnen het paneel als een dag meer heeft dan er past; de kop en "Dag openen" blijven staan.
          h(
            'div',
            { class: 'maand__paneelinhoud' },
          etenBlok,
          blok(
            'drinken',
            t('tab.drinken'),
            g.ml > 0 ? t('drinken.stand', { liter: opmaakLiter(g.ml), doel: opmaakLiter(doelMl) }) : '-',
            h('progress', { class: 'maand__baan', max: String(doelMl), value: String(Math.min(g.ml ?? 0, doelMl)), 'aria-label': t('tab.drinken') }),
          ),
          // Supplementen op één regel: het icoon, de naam, de momenten als pilletjes en de telling
          h(
            'div',
            { class: 'maand__blok' },
            h(
              'div',
              { class: 'maand__blokkop' },
              h('span', { class: 'maand__teken--supplementen', 'aria-hidden': 'true' }, begripIcoon('supplementen', { grootte: 20 })),
              h('span', { class: 'maand__bloktitel maand__bloktitel--supp' }, t('tab.supplementen')),
              schema.momenten.length
                ? h(
                    'div',
                    { class: 'maand__momenten' },
                    ...schema.momenten.map((mo) => {
                      const stand = mo.items.every((i) => i.genomen) ? 'vol' : mo.items.some((i) => i.genomen) ? 'deel' : 'leeg';
                      return h('span', { class: ['maand__moment', 'is-' + stand], 'aria-label': `${t('supplementen.moment.' + mo.moment)}: ${t({ vol: 'maand.momAfgevinkt', deel: 'maand.momDeels', leeg: 'maand.momNiet' }[stand])}` }, t('supplementen.moment.' + mo.moment));
                    }),
                  )
                : null,
              h('span', { class: 'maand__blokwaarde cijfer' }, pillen),
            ),
          ),
          ...(agenda[datum] ?? []).map((x) =>
            rij({
              tegel: begripOpties(x.spuit ? 'spuit' : 'supplementen'),
              titel: x.naam,
              tekst: [t('agenda.kop'), x.hoeveelheid].filter(Boolean).join(' · '),
              eind: datum <= vandaag() ? kleineKnop(x.status === 'afgevinkt' ? t('agenda.afgevinkt') : t('agenda.afvinken'), () => zetBeurt({ datum, supplementId: x.supplementId, naam: x.naam, genomen: x.status !== 'afgevinkt' }), x.status === 'afgevinkt' ? t('agenda.terugzetten') : undefined) : h('span', { class: 't-gedempt' }, t('agenda.gepland')),
            }),
          ),
          ...(begindagen[datum] ?? []).map((x) => rij({ tegel: begripOpties('supplementen'), titel: t(datum <= vandaag() ? 'agenda.begonnen' : 'agenda.begint', { naam: x.naam }), tekst: x.hoeveelheid || null })),
          ),
          knop(t('maand.openen'), { soort: 'secundair', breed: true, opKlik: () => ga(`#/dagboek/dag/${datum}`) }),
        ),
      );
      // Past een uitzonderlijk volle dag toch niet, dan vervaagt de inhoud zacht boven "Dag openen" zolang er nog iets weg te scrollen valt
      const inhoud = dagkaart.querySelector('.maand__paneelinhoud');
      const werk = () => inhoud.classList.toggle('kan-scrollen', inhoud.scrollHeight - inhoud.scrollTop - inhoud.clientHeight > 2);
      inhoud.addEventListener('scroll', werk, { passive: true });
      requestAnimationFrame(werk);
      setTimeout(werk, 400);
    }

    const kies = (datum) => {
      staat.gekozen = datum;
      kal.kies(datum);
      vulDag();
    };
    const kal = maandkalender({ jaarMaand, gegevens: kalGegevens, doelMl, gekozen: staat.gekozen, opKies: kies });
    await vulDag();

    // ---- De kerncijfers van de maand, uit haar echte gegevens (leesMaand en leesWegingen)
    // Het overzicht rekent over de volle maand: de noemers zijn alle dagen van de maand (niet "tot en met vandaag") en zes maaltijden per dag.
    const dagenInMaand = naarDatum(laatsteDag).getDate();
    const bijgehouden = Object.entries(gegevens)
      .filter(([d]) => d.startsWith(jaarMaand))
      .sort(([x], [y]) => (x < y ? -1 : 1));
    const aantalDoel = bijgehouden.filter(([, g]) => g.ml >= doelMl && g.ml > 0).length;
    const aantalSupp = bijgehouden.filter(([, g]) => (g.supplementMomenten?.totaal ?? 0) > 0 && g.supplementMomenten.klaar >= g.supplementMomenten.totaal).length;
    const aantalMaaltijden = bijgehouden.reduce((som, [, g]) => som + (g.maaltijden ?? 0), 0);
    const totaalMl = bijgehouden.reduce((som, [, g]) => som + (g.ml ?? 0), 0);
    // De langste reeks van de maand: het grootste aantal dagen op rij dat ze iets bijhield.
    let langsteReeks = 0;
    for (let i = 0, loop = 0; i < bijgehouden.length; i++) {
      loop = i > 0 && naarDatum(bijgehouden[i][0]) - naarDatum(bijgehouden[i - 1][0]) < 36 * 3600000 ? loop + 1 : 1;
      langsteReeks = Math.max(langsteReeks, loop);
    }
    // BESLISSING 456: gemiddeld over de dagen van de maand die voorbij zijn (vandaag inbegrepen; een eerdere maand: alle dagen), een lege dag telt als 0
    const gemiddeldMl = gemiddeldOverDagen(`${jaarMaand}-01`, laatsteDag, (d) => (d.startsWith(jaarMaand) ? gegevens[d]?.ml ?? 0 : 0), vandaag());
    const alleBeurtenMaand = Object.values(agenda).flat();
    const gezet = alleBeurtenMaand.filter((x) => x.status === 'afgevinkt').length;
    const spuitenMaand = alleBeurtenMaand.filter((x) => x.spuit);
    const anderenMaand = alleBeurtenMaand.filter((x) => !x.spuit);
    // Een cijfer zonder gegevens toont "-"; de onderregel blijft staan zodat alle regels op dezelfde lijnen liggen.
    const kc = (begrip, label, { waarde = null, eenheid = null, tekst = false, teken = null, naam = null, sub = '' }) =>
      h(
        'li',
        { class: 'maand__kc' },
        begripTegel(begrip),
        h('p', { class: 'maand__kclabel' }, label),
        naam
          ? h('p', { class: 'maand__kcwaarde maand__kcwaarde--teken', role: 'img', 'aria-label': naam }, teken)
          : h('p', { class: 'maand__kcwaarde' }, teken, waarde ?? '-', waarde != null && eenheid ? h('span', { class: 'maand__kceenheid' }, ' ' + eenheid) : null),
        h('p', { class: 'maand__kcsub' }, sub),
      );
    // "4,18 l" en "70,0 kg": het getal groot, de eenheid klein erachter
    const metEenheid = (tekst) => {
      const m = /^(.*?)[\s ]+(\S+)$/.exec(tekst);
      return m ? { waarde: m[1], eenheid: m[2] } : { waarde: tekst };
    };
    const laatsteWeging = wegingenMaand.at(-1);
    const lijstCijfers = [
      kc('dagboek', t('maand.kcBijgehouden'), { waarde: bijgehouden.length || null, sub: t('maand.kcSubDagen', { totaal: dagenInMaand }) }),
      kc('eten', t('maand.kcMaaltijden'), { waarde: aantalMaaltijden || null, sub: t('maand.kcSubIngevuld', { totaal: dagenInMaand * MAALTIJDSOORTEN.length }) }),
      kc('drinken', t('maand.kcGedronken'), { ...(totaalMl ? metEenheid(opmaakLiter(totaalMl)) : {}), sub: totaalMl && gemiddeldMl != null ? t('maand.kcSubGemiddeld', { liter: opmaakLiter(gemiddeldMl) }) : '' }),
      kc('drinken', t('maand.kcDoel'), { waarde: aantalDoel || null, sub: t('maand.kcSubDoel', { totaal: dagenInMaand }) }),
      kc('supplementen', t('maand.kcSupplementen'), { waarde: aantalSupp || null, sub: t('maand.kcSubSupplementen', { totaal: dagenInMaand }) }),
      // De langste reeks van de maand. Zo blijven het acht cijfers en blijft elke rij gevuld.
      kc('reeks', t('maand.kcReeks'), { waarde: langsteReeks || null, sub: t('maand.kcSubReeks') }),
      kc('gewicht', t('maand.kcGewicht'), { ...(laatsteWeging ? metEenheid(opmaakKg(laatsteWeging.kg)) : {}), sub: laatsteWeging ? t(wegingenMaand.length === 1 ? 'maand.kcSubWeging' : 'maand.kcSubWegingen', { aantal: wegingenMaand.length }) : '' }),
      // Alleen echte spuiten tellen als "Spuiten"; zijn er geen spuiten maar wel andere geplande beurten, dan heet het "Gepland" (BESLISSING 275).
      spuitenMaand.length || !anderenMaand.length
        ? kc('spuit', t('maand.kcSpuiten'), { waarde: spuitenMaand.length || null, sub: spuitenMaand.length ? t('maand.kcSubGeplandGezet', { aantal: spuitenMaand.filter((x) => x.status === 'afgevinkt').length }) : t('maand.kcSubGeenBeurt') })
        : kc('supplementen', t('maand.kcGepland'), { waarde: anderenMaand.length, sub: t('maand.kcSubGeplandAfgevinkt', { aantal: gezet }) }),
    ];
    const cijferkaart = kaart({ klasse: 'maand__cijferkaart' }, h('ul', { class: 'maand__overzicht', 'aria-label': t('maand.maandKop') }, ...lijstCijfers));

    // ---- Gepland deze maand: de komende beurten van periodieke supplementen als compact blok onder het paneel van de dag; elk aantikbaar
    // naar die dag in de kalender. Zonder komende beurten blijft het blok weg.
    const alleBeurten = Object.entries(agenda)
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .flatMap(([datum, lijst]) => lijst.map((x) => ({ datum, ...x })));
    // Alle beurten van de maand, op datum; hoogstens zes rijen (twee kolommen), de rest als één regel (het overzicht bovenaan telt ze allemaal)
    const komend = alleBeurten;
    const beurten = komend.slice(0, 6);
    const standNaam = { gepland: 'maand.gepGepland', afgevinkt: 'maand.gepAfgevinkt', gemist: 'maand.gepVoorbij' };
    const beurtBegrip = (b) => (b.spuit ? 'spuit' : 'supplementen'); // het spuitje alleen bij een spuit (BESLISSING 275)
    const gepkaart = beurten.length
      ? kaart(
          { klasse: 'maand__gepkaart' },
          kaartkop({ tegel: begripOpties(beurten.some((b) => b.spuit) ? 'spuit' : 'supplementen'), label: t('maand.gepKop') }),
          h(
            'ul',
            { class: ['maand__geplandlijst', beurten.length >= 2 && 'maand__geplandlijst--twee'] },
            ...beurten.map((b) =>
              h(
                'li',
                null,
                h(
                  'button',
                  { type: 'button', class: 'maand__beurt', onclick: () => kies(b.datum) },
                  begripTegel(beurtBegrip(b), { gedimd: b.status === 'gemist' }),
                  h('span', { class: 'maand__beurttekst' }, h('span', { class: 'maand__beurtnaam' }, b.naam), b.hoeveelheid ? h('span', { class: 'maand__beurtsub t-gedempt' }, b.hoeveelheid) : null),
                  h('span', { class: 'maand__beurtdatum cijfer' }, opmaakDatum(b.datum, 'kort')),
                  h('span', { class: ['maand__beurtstand', b.status === 'gepland' ? 't-gedempt' : null] }, t(b.spuit || b.status !== 'gemist' ? standNaam[b.status] : 'agenda.nietAfgevinkt')),
                ),
              ),
            ),
          ),
          komend.length > beurten.length ? h('p', { class: 'maand__gepnog t-klein t-gedempt' }, t('maand.gepNog', { aantal: komend.length - beurten.length })) : null,
        )
      : null;

    // ---- De legenda: losse paren van een teken en zijn woord, de tekens zoals ze in de kalender staan
    const spuitje = (stand, begrip = 'spuit') => h('span', { class: ['kalender__spuit', 'mk__spuit', 'is-' + stand] }, begripIcoon(begrip, { grootte: 16 }));
    const paar = (teken, woord) => h('li', { class: 'maand__legitem' }, h('span', { class: 'maand__legteken', 'aria-hidden': 'true' }, teken), h('span', { class: 'maand__legwoord' }, woord));
    const legenda = h(
      'ul',
      { class: 'label maand__legenda', 'aria-label': t('maand.legendaKop') },
      // Het salie bolletje staat er als een dag in deze maand alle momenten afgevinkt heeft (dezelfde telling als het kerncijfer Supplementen); komt er geen enkel teken voor, dan toch het bolletje met zijn uitleg.
      aantalSupp > 0 || !(spuitenMaand.length || anderenMaand.length) ? paar(h('span', { class: 'mk__klaar mk__klaar--legenda' }), t('maand.legKlaar')) : null,
      // Alleen de tekens die in deze maand voorkomen: het spuitje bij een spuit, het supplement-icoon bij een andere beurt ("gepland" als beide voorkomen).
      spuitenMaand.length ? paar(spuitje('gepland'), t('maand.legSpuitGepland')) : null,
      anderenMaand.length ? paar(spuitje('gepland', 'supplementen'), t('maand.legBeurtGepland')) : null,
    );

    const kalkaart = kaart({ klasse: 'maand__kalkaart' }, kal, legenda);
    if (opent) komOp([cijferkaart, kalkaart, dagkaart, gepkaart].filter(Boolean), { stap: 90 });

    const inhoud = h(
      'div',
      { class: 'stapel maand' },
      bladerkop({
        titel: opmaakDatum(jaarMaand, 'maand'),
        opVorige: () => ga(`#/dagboek/maand/${verschuif(jaarMaand, -1)}`),
        opVolgende: () => ga(`#/dagboek/maand/${volgende}`),
        volgendeUit: false,
      }),
      // Zweeft binnen de ruimte van de bladerkop en neemt dus nooit hoogte in: de kalender verspringt niet bij het bladeren (in de huidige maand onzichtbaar)
      h('div', { class: ['dag__naarvandaag', vandaag().startsWith(jaarMaand) && 'is-stil'] }, knop(t('maand.naarDezeMaand'), { soort: 'tekst', opKlik: () => ga('#/dagboek/maand/' + vandaag().slice(0, 7)) })),
      h('div', { class: 'maand__kolommen' }, cijferkaart, kalkaart, dagkaart, gepkaart),
    );
    if (params.bladeren) vervaag(inhoud);
    return inhoud;
  });
}
