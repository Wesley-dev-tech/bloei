// Dagboek · Dag: een raster met Eten (de zes maaltijdregels), Drinken, Supplementen per moment, Stemming en energie en een
// notitie (V1, V2, E1, E2). Elke kaart begint met dezelfde kaartkop met de stand rechts. Op een groot scherm vult het raster
// de hoogte van het venster. Een dag in de toekomst is te bekijken maar niet in te vullen.
import { h } from '../ui/dom.js';
import { kaart, kaartkop, bladerkop, knop, icoontegel, gevoelschaal, energiekiezer, icoonknop, tekstvak, legeToestand, strook, tril } from '../ui/componenten.js';
import { maaltijdenRijen } from '../ui/maaltijdregel.js';
import { DRANKICOON } from '../ui/beeld.js';
import { bloeiOp, eersteToon, komOp, vervaag } from '../ui/beweging.js';
import { beheerScherm, uitgesteldBewaren, drinkbaan, drankErbij } from './hulp.js';
import { t } from '../teksten.js';
import { opmaakDatum, plusDagen, vandaag, isToekomst, DAGDEEL_UREN, datumVoluit, datumKortDag } from '../kern/datum.js';
import { opmaakLiter } from '../kern/getal.js';
import { leesDag, zetNotitie, zetStemming, zetEnergie } from '../data/dagen.js';
import { DRANKSOORTEN, leesDranken, totaalMl, verwijderDrank, zetDrankTerug } from '../data/dranken.js';
import { isIngevuld, leesMaaltijden } from '../data/maaltijden.js';
import { leesInstelling } from '../data/instellingen.js';
import { schemaVanDag, zetMoment, innameTijdstippen } from '../data/supplementen.js';
import { leesAgenda } from '../data/agenda.js';
import { MAX_LENGTE } from '../data/grenzen.js';
import { zetBeurt } from '../ui/beurt.js';
import { begripOpties, begripTegel, begripIcoon, ICOON } from '../ui/iconenkaart.js';
import { haakUitleg } from '../ui/uitleghaken.js';

const ga = (pad) => {
  window.location.hash = pad;
};

// Welke dagen alle momenten van hun supplementen afgevinkt hadden bij de vorige tekening: een nieuw volledige dag bloeit op.
const eerderKlaar = new Map();

// Eén moment als afvinkregel: één vinkvak; de hele regel is het tikvlak. Zoals op het hoofdscherm (BESLISSING 209) staat er geen aantal maar
// het tijdvak van het moment, en na het afvinken het tijdstip waarop het genomen is.
function momentRij({ moment, items, datum, alleenLezen, tijdstip }) {
  const genomen = items.filter((i) => i.genomen).length;
  const alle = genomen === items.length;
  const tot = { ochtend: DAGDEEL_UREN.middag, middag: DAGDEEL_UREN.avond }[moment];
  const vink = tijdstip ? `${new Date(tijdstip).getHours()}.${String(new Date(tijdstip).getMinutes()).padStart(2, '0')}` : null;
  const regel = alle ? (vink ? t('supplementen.genomenOm', { tijd: vink }) : '') : t('supplementen.tijdvak.' + moment, { van: DAGDEEL_UREN[moment], tot });
  const el = h(
    'button',
    { type: 'button', class: ['vinkvak momentrij licht-op-icoon', alle && 'is-klaar'], role: 'checkbox', 'aria-checked': String(alle), 'aria-label': t('supplementen.moment.' + moment), disabled: alleenLezen, dataset: { moment } },
    begripTegel('supplementen'),
    h('span', { class: 'momentrij__tekst' }, h('span', { class: 'rij__titel' }, t('supplementen.moment.' + moment)), regel ? h('span', { class: 'rij__sub' }, regel) : null),
    h('span', { class: 'vinkvak__vak', 'aria-hidden': 'true' }, h('span', { class: 'vinkje' })),
  );
  el.addEventListener('click', () => {
    tril();
    zetMoment(datum, moment, !alle).catch((fout) => {
      console.error(fout);
      strook(t('algemeen.foutOpslag'));
    });
  });
  return el;
}

// Op een breed scherm (twee kolommen) is de Notitie het elastische blok: haar kolom is korter dan de andere en ze vult het verschil, zodat beide
// kolommen gelijk eindigen. Standaard links Eten en rechts Drinken en Supplementen; de Notitie staat dan in de kortste van die twee. Past ze daar
// niet (het verschil is kleiner dan haar minimum), dan worden eerst de rijen van de andere kolom gelijk iets ruimer (--dag-rek, hoogstens 8 px per
// rij, zodat tussen twee rijen nooit meer dan 32 px lucht komt). Lukt dat ook niet, dan schuift Drinken of Supplementen naar de andere kolom
// (Eten + Supplementen | Drinken + Notitie, of Eten + Drinken | Supplementen + Notitie), zodat de Notitie een groter tekstvak krijgt in plaats van
// dat er een leeg vlak onder de kortste kolom blijft. Gemeten na het tekenen en bij elke verandering van een vaste kaart; tot de eerste meting is
// het raster onzichtbaar (is-meet), zodat er niets verspringt. Er wordt niets verplaatst zolang er focus binnen het raster staat.
const REK_MAX = 8;
function verdeelKolommen({ raster, links, zij, eten, drinken, supplementen, notitie, vak }) {
  const breed = window.matchMedia('(min-width: 1100px)');
  let raf = 0;
  let wacht = 0;
  const zet = (kolom, px) => kolom.style.setProperty('--dag-rek', `${px}px`);
  const meet = () => {
    cancelAnimationFrame(raf);
    clearTimeout(wacht);
    raf = 0;
    wacht = 0;
    if (!raster.isConnected) return;
    zet(links, 0);
    zet(zij, 0);
    raster.classList.remove('is-meet');
    if (!breed.matches) return;
    const gat = parseFloat(getComputedStyle(zij).rowGap) || 0;
    const minimum = notitie.offsetHeight - vak.offsetHeight + (parseFloat(getComputedStyle(vak).minHeight) || 0);
    const kaart_ = { e: { el: eten, h: eten.offsetHeight, rijen: eten.querySelectorAll('.maaltijd').length - 1 }, d: { el: drinken, h: drinken.offsetHeight, rijen: drinken.querySelectorAll('.dagdranklijst__rij').length }, s: { el: supplementen, h: supplementen.offsetHeight, rijen: supplementen.querySelectorAll('.momentrij').length - 1 } };
    const som = (lijst) => lijst.reduce((x, k) => x + kaart_[k].h, 0) + Math.max(0, lijst.length - 1) * gat;
    const rijenIn = (lijst) => lijst.reduce((x, k) => x + Math.max(0, kaart_[k].rijen), 0);
    // Alle indelingen: [links, rechts, zit de Notitie rechts]. De eerste twee zijn de standaard.
    const keuzes = [
      { l: ['e'], r: ['d', 's'], n: 'l', vast: true },
      { l: ['e'], r: ['d', 's'], n: 'r', vast: true },
      { l: ['e', 's'], r: ['d'], n: 'r', vast: false }, // leest rij voor rij nog als Eten, Drinken, Supplementen, Notitie
      { l: ['e', 'd'], r: ['s'], n: 'r', vast: false },
    ].map((k) => {
      const eigen = k.n === 'l' ? k.l : k.r;
      const andere = k.n === 'l' ? k.r : k.l;
      const nodig = som(eigen) + gat + minimum - som(andere); // > 0: de Notitie op haar minimum steekt zoveel uit
      const rek = nodig > 1 ? Math.min(REK_MAX, nodig / Math.max(1, rijenIn(andere))) : 0;
      const rest = nodig > 1 ? Math.max(0, nodig - rek * rijenIn(andere)) : 0;
      return { ...k, eigen, andere, nodig, rek, rest, hoogte: som(andere) - som(eigen) - gat };
    });
    const huidig = (k) => [...k.l].every((c) => kaart_[c].el.parentNode === links) && [...k.r].every((c) => kaart_[c].el.parentNode === zij);
    const vastgezet = raster.contains(document.activeElement);
    const lijst = vastgezet ? keuzes.filter((k) => huidig(k) && (k.n === 'r') === (notitie.parentNode === zij)) : keuzes;
    if (!lijst.length) return;
    const rest = (k) => (k.rest > 4 ? k.rest : 0);
    const kies = lijst.slice().sort((a, b) => rest(a) - rest(b) || Number(b.vast) - Number(a.vast) || (a.nodig > 1 ? 1 : 0) - (b.nodig > 1 ? 1 : 0) || (a.vast && b.vast ? a.hoogte - b.hoogte : 0))[0];
    if (!vastgezet) {
      kies.l.forEach((c, i) => { if (links.children[i] !== kaart_[c].el) links.insertBefore(kaart_[c].el, links.children[i] ?? null); });
      kies.r.forEach((c, i) => { if (zij.children[i] !== kaart_[c].el) zij.insertBefore(kaart_[c].el, zij.children[i] ?? null); });
      const kolom = kies.n === 'l' ? links : zij;
      if (notitie.parentNode !== kolom) kolom.append(notitie);
      else if (notitie !== kolom.lastElementChild) kolom.append(notitie);
    }
    if (kies.nodig > 1) zet(kies.n === 'l' ? zij : links, kies.rek);
  };
  const plan = () => {
    if (raf) return;
    raf = requestAnimationFrame(meet);
    wacht = setTimeout(meet, 120); // een achtergrondtab geeft geen frames: dan toch meten
  };
  const waarnemer = new ResizeObserver(plan);
  [raster, eten, drinken, supplementen].forEach((el) => waarnemer.observe(el));
  breed.addEventListener('change', plan);
  plan();
  return () => {
    waarnemer.disconnect();
    breed.removeEventListener('change', plan);
    cancelAnimationFrame(raf);
    clearTimeout(wacht);
  };
}

export function toon(houder, params = {}) {
  const datum = params.sleutel;
  const toekomst = isToekomst(datum);
  // R5-03: met een vangnet voor als de pagina verdwijnt voor het bewaren klaar is.
  const notitieBewaarder = uitgesteldBewaren((tekst) => zetNotitie(datum, tekst), 400, (tekst) => ({ soort: 'notitie', datum, tekst }));

  const opruimScherm = beheerScherm(houder, async (ctx) => {
    const [maaltijden, dag, ml, doel, dranken, schema, agenda, tijdstippen] = await Promise.all([
      leesMaaltijden(datum),
      leesDag(datum),
      totaalMl(datum),
      leesInstelling('drinken.dagdoelMl'),
      leesDranken(datum),
      schemaVanDag(datum),
      leesAgenda(datum, datum),
      innameTijdstippen(datum),
    ]);
    const opent = !params.bladeren && eersteToon('dagboek:dag');

    const kop = bladerkop({
      titel: datumVoluit(datum), // BESLISSING 489: met het jaar; op een telefoon de korte vorm ("ma 16 november 2026"), de schermlezer hoort de volle
      titelKort: datumKortDag(datum),
      titelNaam: datumVoluit(datum),
      label: datum === vandaag() ? t('tab.vandaag') : undefined,
      opVorige: () => ga(`#/dagboek/dag/${plusDagen(datum, -1)}`),
      opVolgende: () => ga(`#/dagboek/dag/${plusDagen(datum, 1)}`),
    });

    // ---- Eten: de zes maaltijdregels, bewerkbaar en verwijderbaar op elke dag
    const ingevuld = Object.values(maaltijden).filter((m) => m && isIngevuld(m)).length;
    const eten = kaart(
      { klasse: 'maaltijden dag__eten kaart--licht-op', role: 'region', 'aria-label': t('dag.eten') },
      kaartkop({ tegel: begripOpties('eten'), label: t('dag.eten'), eind: t('week.maaltijdStand', { aantal: ingevuld }) }),
      ...maaltijdenRijen({ datum, maaltijden, alleenLezen: toekomst }),
    );

    // ---- Drinken: de stand, de voortgangsbaan, een tik per drank en de dranken van die dag (weghalen kan met Ongedaan maken)
    const baan = drinkbaan(doel > 0 ? ml / doel : 0, doel > 0 && ml >= doel);
    const toevoegen = h(
      'div',
      { class: 'dagdranken' },
      ...DRANKSOORTEN.map((soort) =>
        h(
          'button',
          {
            type: 'button',
            class: 'dagdrank licht-op-icoon',
            disabled: toekomst,
            dataset: { soort },
            onclick: () => {
              tril();
              drankErbij(datum, soort).catch((fout) => {
                console.error(fout);
                strook(t('algemeen.foutOpslag'));
              });
            },
          },
          icoontegel(DRANKICOON[soort], 'drank'),
          h('span', { class: 'dagdrank__naam' }, t(soort === 'water' ? 'drank.waterTegel' : 'drank.' + soort)),
        ),
      ),
    );
    // De dranken van de dag als één rij per soort ("Water  8x · 2 l"); de knop rechts haalt er één van die soort weg (met Terugzetten).
    const groepen = DRANKSOORTEN.map((soort) => {
      const van = dranken.filter((d) => d.soort === soort);
      return { soort, aantal: van.length, ml: van.reduce((som, d) => som + d.ml, 0), laatste: van.at(-1) };
    }).filter((g) => g.aantal > 0);
    const lijst = groepen.length
      ? h(
          'ul',
          { class: 'dagdranklijst' },
          ...groepen.map((g) =>
            h(
              'li',
              { class: 'dagdranklijst__rij', dataset: { soort: g.soort } },
              icoontegel(DRANKICOON[g.soort], 'drank'),
              h('span', { class: 'dagdranklijst__naam' }, t('drank.' + g.soort)),
              h('span', { class: 'dagdranklijst__stand cijfer t-gedempt' }, t('dag.drankStand', { aantal: g.aantal, hoeveelheid: opmaakLiter(g.ml) })),
              toekomst
                ? null
                : icoonknop(ICOON.weghalen.naam, {
                    label: t('dag.drankWeg', { naam: t('drank.' + g.soort).toLowerCase() }),
                    klasse: 'drank__weg',
                    opKlik: () => {
                      verwijderDrank(g.laatste.id);
                      strook(t('drinken.weggehaald'), { duur: 6000, actie: { label: t('drinken.terugzetten'), opKlik: () => zetDrankTerug(g.laatste) } });
                    },
                  }),
            ),
          ),
        )
      : h('p', { class: 't-klein t-gedempt dagdranken__leeg' }, t(datum === vandaag() ? 'drinken.leeg' : 'drinken.leegDag')); // R2-11: "vandaag" alleen op vandaag
    const drinken = kaart(
      { klasse: 'dag__drinken kaart--licht-op', role: 'region', 'aria-label': t('tab.drinken') },
      kaartkop({ tegel: begripOpties('drinken'), label: t('tab.drinken'), eind: t('drinken.stand', { liter: opmaakLiter(ml), doel: opmaakLiter(doel) }) }),
      baan,
      toevoegen,
      lijst,
    );

    // ---- Supplementen: de drie momenten met elk één vinkvak; de stand telt momenten ("2 van 3")
    const momenten = schema.momenten;
    const klaar = momenten.filter((m) => m.items.every((i) => i.genomen)).length;
    const alleKlaar = momenten.length > 0 && klaar === momenten.length;
    const spuiten = agenda[datum] ?? []; // de geplande beurt van een periodiek supplement, onder de dagelijkse momenten (BESLISSING 208)
    // De geplande spuit is een eigen rij, gebouwd als een moment: spuit-tegel, naam, de beurt eronder en rechts hetzelfde vinkvak.
    const spuitRij = (x) => {
      const afgevinkt = x.status === 'afgevinkt';
      const kanAfvinken = datum <= vandaag(); // BESLISSING 286: een afgevinkte beurt is hier ook terug te zetten
      const regel = afgevinkt ? t('agenda.afgevinkt') : [t('agenda.kop'), x.hoeveelheid].filter(Boolean).join(' · ');
      const el = h(
        'button',
        { type: 'button', class: ['vinkvak momentrij licht-op-icoon dag__spuit', afgevinkt && 'is-klaar'], role: 'checkbox', 'aria-checked': String(afgevinkt), 'aria-label': `${t('agenda.afvinken')}: ${x.naam}`, disabled: !kanAfvinken, dataset: { spuit: String(x.supplementId) } },
        begripTegel(x.spuit ? 'spuit' : 'supplementen'), // het spuitje alleen bij een spuit (BESLISSING 275)
        h('span', { class: 'momentrij__tekst' }, h('span', { class: 'rij__titel' }, x.naam), h('span', { class: 'rij__sub' }, regel)),
        h('span', { class: 'vinkvak__vak', 'aria-hidden': 'true' }, h('span', { class: 'vinkje' })),
      );
      if (kanAfvinken) {
        el.addEventListener('click', () => {
          tril();
          zetBeurt({ datum, supplementId: x.supplementId, naam: x.naam, genomen: !afgevinkt });
        });
      }
      return el;
    };
    // De stand ("1 van 3") is tegelijk de weg naar alle supplementen van die dag: zo kost de link geen eigen regel.
    const stand_ = t('supplementen.momentStand', { genomen: klaar, totaal: momenten.length });
    const naarSupp = h(
      'button',
      { type: 'button', class: 'dag__meer cijfer', title: t('dag.supplementenBekijken'), 'aria-label': `${stand_}. ${t('dag.supplementenBekijken')}`, onclick: () => ga(`#/supplementen/${datum}`) },
      stand_,
      begripIcoon('volgende', { grootte: 14 }),
    );
    const supplementen = kaart(
      { klasse: 'dag__supplementen kaart--licht-op', role: 'region', 'aria-label': t('tab.supplementen') },
      kaartkop({ tegel: begripOpties('supplementen'), label: t('tab.supplementen'), eind: momenten.length ? naarSupp : null }),
      ...(momenten.length || spuiten.length
        ? [h('div', { class: 'dag__momenten' }, ...momenten.map((m) => momentRij({ moment: m.moment, items: m.items, datum, alleenLezen: toekomst, tijdstip: tijdstippen?.[m.moment] })), ...spuiten.map(spuitRij))]
        : [legeToestand({ tekst: t('supplementen.leeg'), actie: { label: t('supplementen.eerste'), opKlik: () => ga('#/supplementen') } })]),
    );

    // ---- Stemming en energie: één kaart, dezelfde opbouw als op het hoofdscherm (BESLISSING 237): twee delen met het kopje links en de gekozen waarde
    // in woorden rechts, de gezichtjes en de blaadjes in hetzelfde raster van vijf kolommen. BESLISSING 241: de hint is de laatste regel van de kaart en houdt
    // altijd haar plek (verborgen zolang er niets gekozen is), zodat de kaart niet van hoogte springt.
    // BESLISSING 468: de gekozen waarde staat niet nog eens als sierwoord naast het kopje; de keuze is te zien in de rij eronder (aria-checked op de gekozen knop).
    const stemming = kaart(
      { klasse: 'dag__stemming stemmingkaart kaart--licht-op' },
      kaartkop({ tegel: begripOpties('stemming'), label: t('vandaag.stemmingEnergie') }),
      h(
        'div',
        { class: 'stemming__inhoud' },
        h(
          'div',
          { class: 'stemming__deel stemming__vraag' },
          h('div', { class: 'stemming__kop' }, h('p', { class: 'label' }, t('stemming.vraag'))),
          h('div', { class: 'kaart__inhoud', dataset: { fk: 'stemming' } }, gevoelschaal({ soort: 'stemming', waarde: dag.stemming, alleenLezen: toekomst, opKies: (n) => { zetStemming(datum, n); } })),
        ),
        h('div', { class: 'stemming__lijn', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'stemming__deel vandaag__energie' },
          h('div', { class: 'stemming__kop' }, h('p', { class: 'label' }, t('energie.titel'))),
          energiekiezer({ waarde: dag.energie, woorden: true, alleenLezen: toekomst, opKies: (n) => { zetEnergie(datum, n); } }),
        ),
        toekomst ? null : h('p', { class: ['t-klein t-gedempt dag__wis', dag.stemming == null && dag.energie == null && 'is-leeg'] }, t('dag.wisUitleg')),
      ),
    );

    // ---- Notitie
    const vak = tekstvak({ waarde: dag.notitie, plaats: t('dag.notitiePlaats'), label: t('dag.notitie'), rijen: 7, uitgeschakeld: toekomst, opWijzig: (v) => notitieBewaarder.plan(v) });
    vak.maxLength = MAX_LENGTE.notitie;
    vak.addEventListener('blur', () => notitieBewaarder.nu());
    const notitie = kaart({ klasse: 'dag__notitie kaart--licht-op' }, kaartkop({ tegel: begripOpties('notitie'), label: t('dag.notitieTitel') }), vak);

    // Op een groot scherm twee onafhankelijke kolommen: links Eten en daaronder de Notitie (die de resterende hoogte vult), rechts Drinken en Supplementen,
    // en daaronder Stemming en energie over de volle breedte; op een telefoon één kolom: Eten, Drinken, Supplementen, Stemming en energie, Notitie.
    const links = h('div', { class: 'dag__links' }, eten, notitie);
    const zij = h('div', { class: 'dag__zij' }, drinken, supplementen);
    const kaarten = [eten, drinken, supplementen, stemming, notitie];
    if (opent) komOp(kaarten, { stap: 90 });
    // Een dag waarop alle momenten net afgevinkt zijn: het tegeltje bloeit één keer op.
    if (eerderKlaar.has(datum) && !eerderKlaar.get(datum) && alleKlaar) bloeiOp(supplementen.querySelector('.tegel'));
    eerderKlaar.set(datum, alleKlaar);

    const raster = h('div', { class: 'raster dag__raster is-meet' }, links, zij, stemming);
    ctx.opruim(verdeelKolommen({ raster, links, zij, eten, drinken, supplementen, notitie, vak }));
    const inhoud = h(
      'div',
      { class: 'stapel dag' },
      kop,
      datum !== vandaag() ? h('div', { class: 'dag__naarvandaag' }, knop(t('dag.naarVandaag'), { soort: 'tekst', opKlik: () => ga('#/dagboek/dag/' + vandaag()) })) : null,
      toekomst ? h('p', { class: 'dag__toekomst t-cursief' }, t('dag.toekomst')) : null,
      raster,
    );
    if (params.bladeren) vervaag(inhoud);
    return inhoud;
  });
  const stopHaken = haakUitleg(houder, { haken: [['.dag__eten','dag-stand'],['.dag__drinken','dag-drinken'],['.dag__supplementen','dag-supplementen'],['.dag__stemming','dag-stemming'],['.dag__notitie','dag-notitie']] });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
