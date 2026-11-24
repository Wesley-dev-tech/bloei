// Dagboek · Week (BESLISSING 253): bovenaan een samenvatting van de week in kerncijfers (eten, drinken, supplementen, stemming, gewicht),
// daaronder het weekschema: één kaart met een tabel van zeven rijen (maandag tot zondag) en een kolom per onderwerp. Op een telefoon
// geen brede tabel maar zeven compacte rijen onder elkaar. Alles komt uit de opslag; wat ontbreekt toont "-". Geen oordeel, geen vergelijking.
// Supplementen tellen hier momenten (BESLISSING 150) en geen aantallen van supplementen (BESLISSING 209); een geplande beurt staat apart.
// Dagen in de toekomst zijn gedempt, leeg en niet tikbaar.
import { h } from '../ui/dom.js';
import { kaart, bladerkop, knop, energieschaal } from '../ui/componenten.js';
import { gevoelIcoon } from '../ui/maaltijdregel.js';
import { eersteToon, komOp, vervaag } from '../ui/beweging.js';
import { beheerScherm } from './hulp.js';
import { weekPeriodeTekst } from '../logica/drinken-week.js';
import { motivatieZin, t } from '../teksten.js';
import { kiesWeekMotivatie } from '../logica/motivatie.js';
import { leesWeekVerleden } from '../data/verleden.js';
import { leesAgenda } from '../data/agenda.js';
import { leesDag } from '../data/dagen.js';
import { leesDranken } from '../data/dranken.js';
import { leesInstelling } from '../data/instellingen.js';
import { MAALTIJDSOORTEN, isIngevuld, leesMaaltijden } from '../data/maaltijden.js';
import { innameTijdstippen, schemaVanDag } from '../data/supplementen.js';
import { vorigeWeging, wegingVanWeek } from '../data/wegingen.js';
import { leesWeekoverzicht } from '../data/statistiek.js';
import { MOMENTEN } from '../logica/supplementen.js';
import { WEEKDAGEN } from '../logica/drinken-week.js';
import { opmaakDatum, plusDagen, vandaag, weekStart, weekdag, weekVoluit } from '../kern/datum.js';
import { opmaakKg, opmaakLiter, opmaakVerschil } from '../kern/getal.js';
import { begripTegel, begripIcoon } from '../ui/iconenkaart.js';

const KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const ga = (pad) => {
  window.location.hash = pad;
};

const dagNaam = (datum) => KORT[weekdag(datum) - 1];
const dagDatum = (datum) => `${datum.slice(8, 10)}/${datum.slice(5, 7)}`;
const liter = (ml) => opmaakLiter(ml).replace(/\s*l$/, '');
const eersteRegel = (tekst) => (tekst ?? '').split('\n').map((x) => x.trim()).find(Boolean) ?? '';
const verborgen = (tekst) => h('span', { class: 'wk__sr' }, tekst);
const uur = (tijd) => String(tijd).replace(':', '.');
const uurVanMs = (ms) => `${new Date(ms).getHours()}.${String(new Date(ms).getMinutes()).padStart(2, '0')}`;

// ---- Het uitlegkaartje (BESLISSING 263): één klein kaartje in de huisstijl, dekkend, binnen de kaart waar het teken staat.
// Een teken met een tip is zelf geen tabstop: met het toetsenbord is de dagrij de ene stop en haar samenvattende label (rijLabel) vertelt wat de tips tonen.
// De tip zelf verschijnt bij hover en bij een tik.
const metTip = (el, tekst) => {
  if (!el || !tekst) return el;
  el.dataset.tip = tekst;
  return el;
};

// Eén zin in gewone taal per dagrij, opgebouwd uit dezelfde teksten als de tips: alleen wat er is.
function rijLabel(d, doel, spuiten) {
  const lang = opmaakDatum(d.datum, 'lang');
  const kop = d.datum === vandaag() ? `${lang} (${t('week.vandaagMerk')})` : lang;
  if (d.datum > vandaag()) return `${kop}: ${t('week.toekomst')}`;
  const delen = [];
  const maaltijden = d.maaltijdLijst.filter((m) => m.ingevuld).length;
  if (maaltijden > 0) delen.push(`${t('dag.eten')}: ${t('week.maaltijdStand', { aantal: maaltijden })}`);
  if (d.ml > 0) delen.push(`${t('tab.drinken')}: ${t(d.ml >= doel ? 'week.tip.drinkGehaald' : 'week.tip.drinkStand', { liter: opmaakLiter(d.ml), doel: opmaakLiter(doel) })}`);
  const gepland = d.momenten.filter((m) => m.gepland);
  if (gepland.length) delen.push(`${t('tab.supplementen')}: ${t('supplementen.momentStand', { genomen: gepland.filter((m) => m.klaar).length, totaal: gepland.length })}`);
  if (d.stemming) delen.push(t('week.tip.stemming', { woord: t('stemming.' + d.stemming) }));
  if (d.energie) delen.push(t('week.tip.energie', { woord: t('energie.' + d.energie), n: d.energie }));
  if (d.notitieTekst) delen.push(`${t('week.kolNotitie')}: ${d.notitieTekst}`);
  for (const x of spuiten) delen.push(spuitTekst(x));
  return delen.length ? `${kop}. ${delen.join('. ')}` : `${kop}: ${t('week.sLeeg')}`;
}
// Geeft de opruimfunctie terug (R2-07): die hoort bij deze tekening en loopt via ctx.opruim bij het verlaten of bij een nieuwe tekening.
function tipRegelaar(wortel) {
  const kaartje = h('div', { class: 'wk__tip', role: 'tooltip', id: 'wk-tip' });
  let huidig = null;
  const verberg = () => {
    if (!huidig) return;
    huidig.removeAttribute('aria-describedby');
    huidig = null;
    kaartje.remove();
  };
  const toonTip = (el) => {
    if (!el || huidig === el) return;
    const kader = el.closest('.kaart');
    if (!kader) return;
    huidig = el;
    kaartje.textContent = el.dataset.tip;
    kader.append(kaartje);
    const k = kader.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const breed = kaartje.offsetWidth;
    const hoog = kaartje.offsetHeight;
    const x = Math.max(8, Math.min(r.left - k.left + r.width / 2 - breed / 2, k.width - breed - 8));
    let y = r.top - k.top - hoog - 8;
    if (y < 8) y = r.bottom - k.top + 8;
    y = Math.max(8, Math.min(y, k.height - hoog - 8));
    kaartje.style.setProperty('--tip-x', `${Math.round(x)}px`);
    kaartje.style.setProperty('--tip-y', `${Math.round(y)}px`);
    el.setAttribute('aria-describedby', 'wk-tip');
  };
  const vanTip = (e) => e.target.closest?.('[data-tip]');
  const over = (e) => e.pointerType === 'mouse' && toonTip(vanTip(e));
  const uit = (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = vanTip(e);
    if (el && !el.contains(e.relatedTarget)) verberg();
  };
  const focus = (e) => toonTip(vanTip(e));
  const blur = (e) => vanTip(e) && verberg();
  const tik = (e) => toonTip(vanTip(e));
  const buiten = (e) => !e.target.closest?.('[data-tip]') && verberg();
  const toets = (e) => e.key === 'Escape' && verberg();
  wortel.addEventListener('pointerover', over);
  wortel.addEventListener('pointerout', uit);
  wortel.addEventListener('focusin', focus);
  wortel.addEventListener('focusout', blur);
  wortel.addEventListener('click', tik);
  document.addEventListener('pointerdown', buiten);
  document.addEventListener('keydown', toets);
  return () => {
    document.removeEventListener('pointerdown', buiten);
    document.removeEventListener('keydown', toets);
    verberg();
  };
}

const leesStand = (x) => t(x.status === 'afgevinkt' ? 'agenda.afgevinkt' : x.status === 'gepland' ? 'agenda.gepland' : 'agenda.nietAfgevinkt');

// Alles wat een rij van de week toont, voor één dag
async function leesDagGegevens(d) {
  const [maaltijden, dag, schema, dranken, tijdstippen] = await Promise.all([leesMaaltijden(d.datum), leesDag(d.datum), schemaVanDag(d.datum), leesDranken(d.datum), innameTijdstippen(d.datum)]);
  const momenten = MOMENTEN.map((moment) => {
    const m = schema.momenten.find((x) => x.moment === moment);
    return { moment, gepland: Boolean(m), klaar: Boolean(m) && m.items.every((i) => i.genomen) };
  });
  return {
    ...d,
    maaltijdLijst: MAALTIJDSOORTEN.map((soort) => ({ soort, ingevuld: isIngevuld(maaltijden[soort]), tekst: (maaltijden[soort]?.tekst ?? '').trim(), tijd: maaltijden[soort]?.tijd ?? '' })),
    soorten: dranken.reduce((som, x) => ({ ...som, [x.soort]: (som[x.soort] ?? 0) + 1 }), {}),
    tijdstippen,
    notitieVolledig: (dag.notitie ?? '').trim(),
    momenten,
    notitieTekst: eersteRegel(dag.notitie),
  };
}

// ---- De kleine tekens
const maaltijdTekst = (m) => {
  const naam = t('maaltijd.' + m.soort);
  if (!m.ingevuld) return t('week.tip.maaltijdLeeg', { naam });
  if (!m.tekst) return t('week.tip.maaltijdZonderTekst', { naam, tijd: uur(m.tijd) });
  return t('week.tip.maaltijd', { naam, tijd: uur(m.tijd), tekst: m.tekst });
};
const maaltijdTeken = (m) =>
  metTip(h(
    'span',
    { class: ['wk__teken', 'wk__teken--eten', m.ingevuld && 'is-aan'], role: 'img' },
    verborgen(m.ingevuld ? (m.tekst ? t('week.maaltijdMet', { naam: t('maaltijd.' + m.soort), tekst: m.tekst }) : t('week.maaltijdIngevuld', { naam: t('maaltijd.' + m.soort) })) : t('week.maaltijdLeeg', { naam: t('maaltijd.' + m.soort) })),
  ), maaltijdTekst(m));

const momentTekst = (m, tijdstippen) => {
  const moment = t('supplementen.moment.' + m.moment);
  if (!m.gepland) return t('week.tip.momentGeen', { moment });
  if (!m.klaar) return t('week.tip.momentNiet', { moment });
  return tijdstippen[m.moment] ? t('week.tip.momentGenomen', { moment, tijd: uurVanMs(tijdstippen[m.moment]) }) : t('week.tip.momentAfgevinkt', { moment });
};
const momentTeken = (m, tijdstippen = {}) =>
  metTip(h(
    'span',
    { class: ['wk__teken', 'wk__teken--moment', m.klaar && 'is-aan', !m.gepland && 'is-geen'], role: 'img' },
    h('span', { 'aria-hidden': 'true' }, t('supplementen.moment.' + m.moment).slice(0, 1)),
    verborgen(t(m.klaar ? 'week.momentKlaar' : m.gepland ? 'week.momentOpen' : 'week.momentGeen', { moment: t('supplementen.moment.' + m.moment) })),
  ), momentTekst(m, tijdstippen));

const stemTekst = (stemming) => t('week.tip.stemming', { woord: t('stemming.' + stemming) });
const gezichtje = (stemming) =>
  stemming
    ? metTip(h('span', { class: 'wk__gezicht' }, h('span', { class: 'wk__gezichttegel', 'aria-hidden': 'true', dataset: { stap: stemming } }, gevoelIcoon(stemming, 20)), h('span', { class: 'wk__gezichtwoord' }, t('stemming.' + stemming))), stemTekst(stemming))
    : h('span', { class: 'wk__leeg' }, '-');

const spuitTekst = (x) => [x.naam, x.hoeveelheid, leesStand(x)].filter(Boolean).join(' · ');
const spuitTeken = (x) =>
  metTip(h(
    'span',
    { class: 'wk__spuit' },
    h('span', { class: ['kalender__spuit', 'is-' + (x.status === 'afgevinkt' ? 'afgevinkt' : x.status === 'gepland' ? 'gepland' : 'gemist')], role: 'img', 'aria-label': t(x.status === 'afgevinkt' ? 'agenda.ariaAfgevinkt' : x.status === 'gepland' ? 'agenda.ariaGepland' : 'agenda.ariaNiet', { naam: x.naam }) }, begripIcoon(x.spuit ? 'spuit' : 'supplementen', { grootte: 12 })),
    h('span', { class: 'wk__spuitnaam' }, x.naam),
  ), spuitTekst(x));

function drankTekst(d, doel) {
  if (!(d.ml > 0)) return t('week.tip.drinkNiets');
  const kop = t(d.ml >= doel ? 'week.tip.drinkGehaald' : 'week.tip.drinkStand', { liter: opmaakLiter(d.ml), doel: opmaakLiter(doel) });
  const soorten = Object.entries(d.soorten).map(([soort, n]) => `${t('drank.' + soort)} ${n}x`).join(', ');
  return soorten ? `${kop}\n${soorten}` : kop;
}
function drankStand(d, doel, toekomst) {
  if (toekomst || !(d.ml > 0)) return h('span', { class: 'wk__leeg' }, '-');
  const gehaald = d.ml >= doel;
  return metTip(
    h(
      'span',
      { class: 'wk__drank', role: 'img', 'aria-label': t('week.drinkStand', { liter: opmaakLiter(d.ml), doel: opmaakLiter(doel) }) },
      h('progress', { class: ['wk__balk', gehaald && 'is-gehaald'], max: doel, value: Math.min(d.ml, doel), 'aria-hidden': 'true' }),
      h('span', { class: ['wk__liter', 'cijfer', gehaald && 'is-gehaald'] }, opmaakLiter(d.ml)),
    ),
    drankTekst(d, doel),
  );
}

// ---- De tabel (breed scherm)
function rijVan(d, doel, spuiten, metBeurt) {
  const toekomst = d.datum > vandaag();
  const isVandaag = d.datum === vandaag();
  const lang = opmaakDatum(d.datum, 'lang');
  const naam = h(
    'th',
    { scope: 'row', class: 'wk__dagcel' },
    h('span', { class: 'wk__dagnaam' }, h('span', { class: 'wk__dagkort' }, dagNaam(d.datum)), ' ', h('span', { class: 'wk__datum cijfer' }, dagDatum(d.datum))),
    isVandaag ? h('span', { class: 'wk__vandaag' }, t('week.vandaagMerk')) : null,
  );
  const tr = h(
    'tr',
    { class: ['wk__rij', isVandaag && 'is-vandaag', toekomst && 'is-toekomst'], 'aria-current': isVandaag ? 'date' : null, tabindex: '0', 'aria-label': rijLabel(d, doel, spuiten), dataset: { datum: d.datum } },
    naam,
    h('td', { class: 'wk__c-eten' }, h('span', { class: 'wk__tekens' }, ...(toekomst ? [] : d.maaltijdLijst.map(maaltijdTeken)), toekomst ? h('span', { class: 'wk__leeg' }, '-') : null)),
    h('td', { class: 'wk__c-drinken' }, drankStand(d, doel, toekomst)),
    h('td', { class: 'wk__c-supp' }, toekomst ? h('span', { class: 'wk__leeg' }, '-') : h('span', { class: 'wk__tekens' }, ...d.momenten.map((m) => momentTeken(m, d.tijdstippen)))),
    h('td', { class: 'wk__c-stemming' }, toekomst ? h('span', { class: 'wk__leeg' }, '-') : gezichtje(d.stemming)),
    h('td', { class: 'wk__c-energie' }, !toekomst && d.energie ? metTip(energieschaal({ waarde: d.energie }), t('week.tip.energie', { woord: t('energie.' + d.energie), n: d.energie })) : h('span', { class: 'wk__leeg' }, '-')),
    h('td', { class: 'wk__c-notitie' }, !toekomst && d.notitieTekst ? metTip(h('span', { class: 'wk__notitie' }, d.notitieTekst), d.notitieVolledig.length > 300 ? `${d.notitieVolledig.slice(0, 300)}...` : d.notitieVolledig) : h('span', { class: 'wk__leeg' }, '-')),
    metBeurt ? h('td', { class: 'wk__c-beurt' }, spuiten.length ? h('span', { class: 'wk__tekens' }, ...spuiten.map(spuitTeken)) : h('span', { class: 'wk__leeg' }, '-')) : null,
  );
  return tr;
}

function tabel(dagen, doel, agenda) {
  const metBeurt = dagen.some((d) => (agenda[d.datum] ?? []).length > 0);
  const kop = (klasse, begrip, tekst) => h('th', { scope: 'col', class: klasse }, h('span', { class: 'wk__kolkop' }, begrip ? begripTegel(begrip, { label: undefined }) : null, h('span', null, tekst)));
  return h(
    'table',
    { class: 'wk__tabel' },
    h('caption', { class: 'wk__sr' }, t('week.schema')),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { scope: 'col', class: 'wk__dagcel' }, h('span', { class: 'wk__kolkop' }, h('span', null, t('week.kolDag')))),
        kop('wk__c-eten', 'eten', t('dag.eten')),
        kop('wk__c-drinken', 'drinken', t('tab.drinken')),
        kop('wk__c-supp', 'supplementen', t('tab.supplementen')),
        kop('wk__c-stemming', 'stemming', t('week.kolStemming')),
        kop('wk__c-energie', 'energie', t('energie.titel')),
        kop('wk__c-notitie', 'notitie', t('week.kolNotitie')),
        metBeurt ? kop('wk__c-beurt', 'spuit', t('week.kolBeurt')) : null,
      ),
    ),
    h('tbody', null, ...dagen.map((d) => rijVan(d, doel, agenda[d.datum] ?? [], metBeurt))),
  );
}

// ---- De compacte rijen (telefoon)
function compactRij(d, doel, spuiten) {
  const toekomst = d.datum > vandaag();
  const isVandaag = d.datum === vandaag();
  const gehaald = d.ml >= doel;
  const inhoud = [
    h(
      'span',
      { class: 'wk__linksbl' },
      h('span', { class: 'wk__dagnaam' }, h('span', { class: 'wk__dagkort' }, dagNaam(d.datum)), ' ', h('span', { class: 'wk__datum cijfer' }, dagDatum(d.datum))),
      isVandaag ? h('span', { class: 'wk__vandaag' }, t('week.vandaagMerk')) : null,
      ...spuiten.map(spuitTeken),
    ),
    toekomst
      ? h('span', { class: 'wk__rechtsbl' }, h('span', { class: 'wk__leeg' }, t('week.toekomst')))
      : h(
          'span',
          { class: 'wk__rechtsbl' },
          h('span', { class: 'wk__tekens wk__tekens--eten' }, ...d.maaltijdLijst.map(maaltijdTeken)),
          metTip(h('span', { class: ['wk__liter', 'cijfer', !(d.ml > 0) && 'is-leeg', gehaald && 'is-gehaald'] }, d.ml > 0 ? opmaakLiter(d.ml) : '-'), drankTekst(d, doel)),
          h('span', { class: 'wk__tekens wk__tekens--moment' }, ...d.momenten.map((m) => momentTeken(m, d.tijdstippen))),
          d.stemming ? metTip(h('span', { class: 'wk__gezichttegel', 'aria-hidden': 'true', dataset: { stap: d.stemming } }, gevoelIcoon(d.stemming, 18)), stemTekst(d.stemming)) : h('span', { class: 'wk__gezichttegel is-leeg' }, '-'),
        ),
  ];
  const klasse = ['wk__compact', isVandaag && 'is-vandaag', toekomst && 'is-toekomst'];
  return h('li', { class: 'wk__compactitem' }, h('div', { class: klasse, role: 'group', tabindex: '0', 'aria-label': rijLabel(d, doel, spuiten), dataset: { datum: d.datum } }, ...inhoud));
}

// ---- De samenvatting: een kaartje per onderwerp
function sKaart(klasse, begrip, label, waarde, eenheid, sub, tegelEl) {
  const k = kaart(
    { klasse: `wk__skaart ${klasse}` },
    h('div', { class: 'wk__skop' }, tegelEl ?? begripTegel(begrip), h('p', { class: 'label wk__slabel' }, label)),
    h('p', { class: 'wk__swaarde' }, h('span', { class: 'wk__sgetal cijfer' }, String(waarde)), eenheid ? ' ' : null, eenheid ? h('span', { class: 'wk__seenheid' }, eenheid) : null),
    h('p', { class: 'wk__sub' }, sub),
  );
  return k;
}

// De tegel Gewicht krijgt een tweede blok: het verschil met de vorige weging (BESLISSING 501). Alleen zichtbaar waar de tegel over de volle breedte loopt.
function gewichtKaart(weging, vorige) {
  const k = sKaart('wk__skaart--gewicht', 'gewicht', t('tab.gewicht'), weging ? opmaakKg(weging.kg).replace(/\s*kg$/, '') : '-', weging ? 'kg' : null, weging ? t('week.sGewichtSub') : t('week.sGewichtLeeg'));
  const verschil = weging && vorige ? opmaakVerschil(weging.kg - vorige.kg).replace(/\s*kg$/, '') : null;
  k.append(
    h(
      'div',
      { class: 'wk__sextra' },
      h('p', { class: 'wk__swaarde' }, h('span', { class: 'wk__sgetal cijfer' }, verschil ?? '-'), verschil ? ' ' : null, verschil ? h('span', { class: 'wk__seenheid' }, 'kg') : null),
      h('p', { class: 'wk__sub' }, t('week.sGewichtVerschilSub')),
    ),
  );
  return k;
}

export function toon(houder, params = {}) {
  const start = weekStart(params.sleutel);
  const volgendeStart = plusDagen(start, 7);

  return beheerScherm(houder, async (ctx) => {
    const [overzicht, agenda, doelInstelling, weging, naam, weekVerleden] = await Promise.all([
      leesWeekoverzicht(start),
      leesAgenda(start, plusDagen(start, 6)),
      leesInstelling('drinken.dagdoelMl'),
      wegingVanWeek(start),
      leesInstelling('profiel.naam'),
      leesWeekVerleden(start), // voor de zin van de week: hoe ze zich verhoudt tot de weken ervoor (alleen als dat gunstig is)
    ]);
    // BESLISSING 501: het verschil met de vorige weging vult de brede tegel Gewicht op een telefoon
    const vorige = weging ? await vorigeWeging(weging) : null;
    const dagen = await Promise.all(overzicht.dagen.map(leesDagGegevens));
    const doel = Number(doelInstelling) || 2500;
    const opent = !params.bladeren && eersteToon('dagboek:week');
    const kop = bladerkop({
      // BESLISSINGEN 461 en 489: dezelfde bereiktekst als op Drinken, met het jaar ("16 - 22 november 2026", in labelvorm); op een telefoon de korte vorm
      // ("16 - 22 nov 2026"); de schermlezer hoort de volledige vorm met het jaar
      titel: weekPeriodeTekst(start, { jaar: true }),
      titelKort: weekPeriodeTekst(start, { jaar: true, kort: true }),
      titelNaam: weekVoluit(start),
      opVorige: () => ga(`#/dagboek/week/${plusDagen(start, -7)}`),
      opVolgende: () => ga(`#/dagboek/week/${volgendeStart}`),
      volgendeUit: volgendeStart > vandaag(),
    });

    // ---- Wat is er te berekenen
    // BESLISSING 448: de tellers lopen over de dagen tot en met vandaag, de noemers over de volle week (maandag tot zondag), ook in de lopende week.
    const verleden = dagen.filter((d) => d.datum <= vandaag());
    const maaltijden = verleden.reduce((som, d) => som + d.maaltijdLijst.filter((m) => m.ingevuld).length, 0);
    const mogelijk = WEEKDAGEN * MAALTIJDSOORTEN.length;
    const totaalMl = verleden.reduce((som, d) => som + d.ml, 0);
    const doelDagen = verleden.filter((d) => d.ml >= doel).length;
    // Supplementen: de noemer is het aantal dagen van de week MET een schema (hoogstens 7), ook de dagen die nog komen; een supplement dat maar op
    // sommige dagen gepland is, telt alleen die dagen (een dag telt één keer, hoeveel momenten er ook gepland zijn). De teller: dagen tot vandaag met alles afgevinkt.
    const dagenMetSchema = dagen.filter((d) => d.momenten.some((m) => m.gepland));
    const suppVol = dagenMetSchema.filter((d) => d.datum <= vandaag() && d.momenten.filter((m) => m.gepland).every((m) => m.klaar)).length;
    const metLijst = verleden.filter((d) => d.momenten.some((m) => m.gepland)); // is er tot vandaag iets te tonen

    const kaartjes = [
      sKaart('wk__skaart--eten', 'eten', t('dag.eten'), maaltijden > 0 ? maaltijden : '-', maaltijden > 0 ? t('week.sEtenEenheid', { totaal: mogelijk }) : null, maaltijden > 0 ? t('week.sEtenSub') : t('week.sLeeg')),
      sKaart('wk__skaart--drinken', 'drinken', t('tab.drinken'), totaalMl > 0 ? liter(totaalMl) : '-', totaalMl > 0 ? t('week.sDrinkenEenheid') : null, totaalMl > 0 ? t('week.sDrinkenSub', { aantal: doelDagen, totaal: WEEKDAGEN }) : t('week.sLeeg')),
      sKaart('wk__skaart--supp', 'supplementen', t('tab.supplementen'), metLijst.length ? suppVol : '-', metLijst.length ? t(dagenMetSchema.length === 1 ? 'week.sSuppEenheidEen' : 'week.sSuppEenheid', { totaal: dagenMetSchema.length }) : null, metLijst.length ? t('week.sSuppSub') : t('week.sLeeg')),
      sKaart(
        'wk__skaart--stemming',
        'stemming',
        t('week.kolStemming'),
        overzicht.stemming ? t('stemming.' + overzicht.stemming) : '-',
        null,
        overzicht.stemming ? t('week.sStemmingSub') : t('week.sStemmingLeeg'),
        overzicht.stemming ? h('span', { class: 'wk__gezichttegel wk__gezichttegel--groot', dataset: { stap: overzicht.stemming } }, gevoelIcoon(overzicht.stemming, 22)) : null,
      ),
      gewichtKaart(weging, vorige),
    ];
    const samenvatting = h('div', { class: 'wk__samenvatting' }, ...kaartjes);

    const zin = h('p', { class: 'week__zin t-cursief' }, overzicht.ingevuldeDagen > 0 || overzicht.stemming || overzicht.energie ? motivatieZin(kiesWeekMotivatie(overzicht.ingevuldeDagen, start, weekVerleden), naam) : t('week.leeg'));
    const schema = kaart(
      { klasse: 'wk__schemakaart' },
      h('div', { class: 'wk__tabelhouder' }, tabel(dagen, doel, agenda)),
      h('ul', { class: 'wk__compactlijst', 'aria-label': t('week.schema') }, ...dagen.map((d) => compactRij(d, doel, agenda[d.datum] ?? []))),
      zin,
    );

    if (opent) komOp([...kaartjes, schema], { stap: 70 });

    const inhoud = h(
      'div',
      { class: 'stapel week wk' },
      kop,
      start !== weekStart(vandaag()) ? h('div', { class: 'dag__naarvandaag' }, knop(t('week.naarDezeWeek'), { soort: 'tekst', opKlik: () => ga('#/dagboek/week/' + weekStart(vandaag())) })) : null,
      samenvatting,
      schema,
    );
    ctx.opruim(tipRegelaar(inhoud));
    // Pijl omhoog en omlaag gaan van dagrij naar dagrij (zoals in de maandkalender); Tab blijft gewoon werken.
    inhoud.addEventListener('keydown', (e) => {
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const rij_ = e.target.closest?.('.wk__rij, .wk__compact');
      if (!rij_ || e.target !== rij_) return;
      const rijen = [...inhoud.querySelectorAll('.wk__rij, .wk__compact')].filter((r) => r.getClientRects().length > 0);
      const buur = rijen[rijen.indexOf(rij_) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!buur) return;
      e.preventDefault();
      buur.focus();
    });
    if (params.bladeren) vervaag(inhoud);
    return inhoud;
  });
}
