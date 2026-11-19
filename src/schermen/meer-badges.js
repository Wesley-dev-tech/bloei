// Meer · Badges (E5, BESLISSING 164): bovenaan een brede kaart met de reeks en de laatst behaalde medaille, daaronder een raster van
// medaillekaarten (eerst de behaalde, dan de volgende). Een kaart opent een blad met de medaille groot, wat ze betekent en wanneer ze
// behaald werd of hoe ver ze staat. Alleen gedrag, nooit gewicht of wat ze at; geen percentage, geen "nog x te gaan", geen slotje.
import { haakUitleg } from '../ui/uitleghaken.js';
import { h } from '../ui/dom.js';
import { begripOpties } from '../ui/iconenkaart.js';
import { kaart, kerncijfer, knop, blad, schermkop } from '../ui/componenten.js';
import { eersteToon, komOp, telOp } from '../ui/beweging.js';
import { medaille, badgeVoortgang } from '../ui/medaille.js';
import { beheerScherm, terugKnop } from './hulp.js';
import { ALLE_BADGES, GROEPEN, VERBORGEN, telBadges } from '../logica/badgeregels.js';
import { t } from '../teksten.js';
import { naarSleutel, opmaakDatum } from '../kern/datum.js';
import { leesBadges, markeerGezien, leesBadgeStats } from '../data/badges.js';
import { leesReeks } from '../data/statistiek.js';

const datumTekst = (ms) => opmaakDatum(naarSleutel(new Date(ms)), 'lang');

export function toon(houder) {
  const opruimScherm = beheerScherm(houder, async () => {
    const [bewaard, reeks, stats] = await Promise.all([leesBadges(), leesReeks(), leesBadgeStats()]);
    const behaald = new Map(bewaard.map((b) => [b.id, b]));
    for (const b of bewaard) if (!b.gezien) markeerGezien(b.id).catch(() => {});

    const opent = eersteToon('meer-badges');
    const zichtbaar = ALLE_BADGES.filter((b) => !VERBORGEN.includes(b.id) || behaald.has(b.id)).map((b) => {
      const gehaald = behaald.get(b.id) ?? null;
      const voortgang = gehaald ? null : badgeVoortgang(b.id, stats);
      return { id: b.id, groep: b.groep, gehaald, voortgang };
    });
    // Eerst de behaalde (de nieuwste voorop), dan de volgende: de dichtstbijzijnde eerst.
    const gehaald = zichtbaar.filter((b) => b.gehaald).sort((a, b) => b.gehaald.behaaldOp - a.gehaald.behaaldOp);
    const volgende = zichtbaar.filter((b) => !b.gehaald).sort((a, b) => (b.voortgang?.fractie ?? 0) - (a.voortgang?.fractie ?? 0));

    // Eén medaille met zijn bijschrift (naam en datum of voortgang), gebruikt in de kaarten, de uitgelichte plek en het blad.
    const maakMedaille = (b, grootte, uitleg = false) =>
      medaille({
        uitlegBijHover: uitleg,
        alleenHover: uitleg,
        badge: b.id,
        behaald: Boolean(b.gehaald),
        datum: b.gehaald ? datumTekst(b.gehaald.behaaldOp) : undefined,
        voortgang: b.voortgang?.fractie ?? null,
        voortgangTekst: b.voortgang?.tekst,
        grootte,
      });

    const animaties = [];

    // Bovenaan: de laatst behaalde medaille groot (of, nog zonder badge, de volgende) en de reeks.
    const uitgelicht = gehaald[0] ?? volgende[0] ?? null;
    const dagenKern = kerncijfer({ label: t('badge.dagenLabel'), waarde: reeks.dagenBijgehouden, eenheid: ' ' + t('badge.dagenEenheid'), tegel: begripOpties('reeks') });
    const reeksKern = kerncijfer({ label: t('badge.reeksLabel'), waarde: reeks.lopendeReeks, eenheid: ' ' + t('badge.dagenEenheid'), tegel: begripOpties('reeks') });
    if (opent) {
      animaties.push(() => telOp(dagenKern.getal, reeks.dagenBijgehouden));
      animaties.push(() => telOp(reeksKern.getal, reeks.lopendeReeks));
    }
    const blokVan = (b, label) => {
      const m = maakMedaille(b, 'extra');
      const blok = h(
        'div',
        { class: 'badgehero__laatst' },
        m,
        h(
          'div',
          { class: 'badgehero__tekst' },
          h('p', { class: 'label' }, label),
          h('p', { class: 'badgehero__naam t-h1' }, t('badge.namen.' + b.id)),
          h('p', { class: 't-klein t-gedempt' }, b.gehaald ? t('badge.behaald', { datum: datumTekst(b.gehaald.behaaldOp) }) : (b.voortgang?.tekst ?? t('badge.nogNiet'))),
        ),
      );
      if (opent) animaties.push(() => (m.glans(400), m.vulRing(b.voortgang?.fractie ?? 0)));
      return blok;
    };
    const blokLaatst = uitgelicht ? blokVan(uitgelicht, uitgelicht.gehaald ? t('badge.laatst') : t('badge.volgende')) : null;
    const blokVolgende = gehaald[0] && volgende[0] ? blokVan(volgende[0], t('badge.volgende')) : null;
    const hero = kaart(
      { klasse: 'badgehero' + (blokVolgende ? ' badgehero--drie' : '') },
      blokLaatst ?? h('p', { class: 'week__leeg t-cursief' }, t('badge.leeg')),
      blokVolgende,
      h('div', { class: 'badgehero__reeks' }, h('p', { class: 'badgehero__telling cijfer' }, t('badge.behaaldTelling', telBadges(bewaard.map((b) => b.id)))), dagenKern, reeksKern),
    );

    // Het blad bij een tik: de medaille groot, wat ze betekent en wanneer of hoe ver.
    const openBlad = (b) => {
      const dlg = blad({
        titel: t('badge.namen.' + b.id),
        familie: 'algemeen',
        inhoud: h(
          'div',
          { class: 'medailleblad' },
          (() => {
            const m = maakMedaille(b, 'extra');
            requestAnimationFrame(() => (m.glans(150), m.vulRing(b.voortgang?.fractie ?? 0)));
            return m;
          })(),
          h('p', { class: 't-klein t-gedempt' }, t('badge.betekent')),
          h('p', null, t('badge.voorwaarden.' + b.id)),
          h('p', { class: 'cijfer' }, b.gehaald ? t('badge.behaald', { datum: datumTekst(b.gehaald.behaaldOp) }) : (b.voortgang?.tekst ?? t('badge.nogNiet'))),
        ),
        acties: [knop(t('badge.sluiten'), { soort: 'secundair', opKlik: () => dlg.sluit() })],
      });
      dlg.open();
    };

    let volgnr = 0;
    const maakKaart = (b) => {
      const i = volgnr++;
      const m = maakMedaille(b, 'groot', true); // met een muis zegt een kaartje wat de medaille betekent, naast het blad bij een tik
      if (opent) animaties.push(() => (b.gehaald ? m.glans(500 + Math.min(i, 12) * 90) : m.vulRing(b.voortgang?.fractie ?? 0)));
      return kaart(
        { klasse: 'medaillekaart', opKlik: () => openBlad(b), 'aria-label': t('badge.namen.' + b.id) + ', ' + (b.gehaald ? t('badge.behaald', { datum: datumTekst(b.gehaald.behaaldOp) }) : (b.voortgang?.tekst ?? t('badge.nogNiet'))) },
        m,
        h('span', { class: 'medaillekaart__naam t-h2' }, t('badge.namen.' + b.id)),
        h('span', { class: 't-klein t-gedempt' }, b.gehaald ? t('badge.behaald', { datum: datumTekst(b.gehaald.behaaldOp) }) : (b.voortgang?.tekst ?? t('badge.nogNiet'))),
      );
    };
    // De medailles staan per groep, in de volgorde van de beloning; een groep zonder zichtbare badges ontbreekt.
    const kaarten = [];
    const groepen = GROEPEN.map((groep) => {
      const leden = zichtbaar.filter((b) => b.groep === groep);
      if (!leden.length) return null;
      const kaartjes = leden.map(maakKaart);
      kaarten.push(...kaartjes);
      const klaar = leden.filter((b) => b.gehaald).length;
      return h(
        'section',
        { class: 'badgegroep', 'aria-label': t('badge.groepen.' + groep) },
        h('div', { class: 'badgegroep__kop' }, h('h2', { class: 'label badgegroep__titel' }, t('badge.groepen.' + groep)), h('span', { class: 'badgegroep__telling cijfer t-klein t-gedempt' }, t('badge.behaaldTelling', { behaald: klaar, totaal: leden.length }))),
        h('div', { class: 'medailleraster' }, ...kaartjes),
      );
    }).filter(Boolean);

    const scherm = h(
      'div',
      { class: 'stapel stapel--sectie meer-sub badgescherm' },
      schermkop({ titel: t('badge.titel'), acties: [terugKnop()] }),
      hero,
      ...groepen,
    );
    if (opent) {
      komOp([hero, ...kaarten], { stap: 70 });
      requestAnimationFrame(() => animaties.forEach((f) => f()));
    }
    return scherm;
  }, { lichtOp: true });
  const stopHaken = haakUitleg(houder, { haken: [['.medaille.is-behaald', 'medaille'], ['.medaille.is-open', 'medaille-open'], ['.badgegroep', 'badge-groep']] });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
