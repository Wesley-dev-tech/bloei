// Tab Drinken (BESLISSING 257): drie rijen die de breedte vullen. Rij 1 de dag (het glas dat vult en de zes dranktegels), rij 2 het verloop
// van vandaag (de hele dag per soort, met weghalen) en rij 3 de week met kerncijfers uit haar eigen gegevens; onderaan "Goed om te weten".
// Het glas blijft bestaan tussen twee tikken, zodat het water zacht stijgt en de viering bij een gehaald doel maar één keer speelt.
import { h } from '../ui/dom.js';
import { kaart, kaartkop, knop, icoonknop, icoontegel, strook, tril, schermkop, kerncijfer } from '../ui/componenten.js';
import { watervulling } from '../ui/watervulling.js';
import { ICOON, begripTegel, begripOpties, begripIcoon } from '../ui/iconenkaart.js';
import { toonHetMe } from '../ui/weetjes.js';
import { DRANKICOON } from '../ui/beeld.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { registreerUitleg } from '../uitleg/rondleiding.js';
import { dagBinder, lichtOp, toonOngedaanMelding, drankErbij, laatsteWeghalen, geldigeDatum, zetHashRecht, drinkbaan } from './hulp.js';
import { t } from '../teksten.js';
import { luister } from '../kern/bus.js';
import { isToekomst, opmaakDatum, plusDagen, vandaag, weekStart } from '../kern/datum.js';
import { opmaakLiter, opmaakMl } from '../kern/getal.js';
import { leesInstelling } from '../data/instellingen.js';
import { leesDranken, leesDrankenBereik, verwijderDrank, zetDrankTerug } from '../data/dranken.js';
import { leesWeekoverzicht } from '../data/statistiek.js';
import { drinkWeekKaart } from './weekkaart.js';
import { drinkWeekCijfers, weekAanduiding, stapWeek, reeksVanaf, veegRichting, weekPeriodeTekst } from '../logica/drinken-week.js';
import { eersteToon, komOp, telOp, bloeiOp } from '../ui/beweging.js';

const ANDERE = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];
const REEKS_DAGEN = 60; // zo ver terug kijkt de reeks van dagen op rij

const twee = (n) => String(n).padStart(2, '0');

// De som van de ml per soort, in de volgorde van ANDERE, alleen wat voorkomt.
function perSoort(dranken) {
  const kaartje = new Map();
  for (const d of dranken) {
    const nu = kaartje.get(d.soort) ?? { soort: d.soort, aantal: 0, ml: 0 };
    nu.aantal += 1;
    nu.ml += d.ml;
    kaartje.set(d.soort, nu);
  }
  return ANDERE.filter((s) => kaartje.has(s)).map((s) => kaartje.get(s));
}

const somMl = (dranken) => dranken.reduce((som, d) => som + d.ml, 0);

export function toon(houder, params = {}) {
  if (params.datum !== undefined && !geldigeDatum(params.datum)) zetHashRecht('#/drinken');
  const datum = geldigeDatum(params.datum) ? params.datum : vandaag();
  const eerder = datum !== vandaag();
  const toekomst = isToekomst(datum);
  const schrijfDag = dagBinder(datum);
  let weg = false;
  let timer = null;

  // ---- Rij 1 links: de dag
  const glas = watervulling({ vulling: 0, gehaald: false, grootte: 200, label: t('drinken.kan') });
  glas.style.setProperty('--wv-h', 'var(--glas-h)'); // de hoogte van het glas komt uit de CSS en groeit mee op een breed scherm
  const standGetal = h('span', { class: 'cijfer-groot__getal' }, '0');
  const stand = h('p', { class: 'cijfer-groot' }, standGetal, h('span', { class: 'cijfer-groot__eenheid' }, ' ' + t('drinken.liter')));
  let eerste = eersteToon('drinken:kaarten'); // bij het openen komt alles rustig op en telt de stand op; bij een hertekening niet
  const van = h('p', { class: 't-klein t-gedempt' });
  const gehaaldZin = h('p', { class: 'drinkhoofd__gehaald t-cursief', hidden: true }, t('drinken.doel'));
  const nogZin = h('p', { class: 'drinkhoofd__nog t-cursief' });
  const baan = drinkbaan();
  const hoofdKop = kaartkop({ tegel: begripOpties('drinken'), label: eerder ? t('drinken.dagKop', { datum: opmaakDatum(datum, 'kort') }) : t('drinken.vandaagKop') });
  const hoofd = kaart(
    { klasse: 'drinkhoofd stil-bloei' },
    hoofdKop,
    h('div', { class: 'drinkhoofd__rij' }, glas, h('div', { class: 'drinkhoofd__stand' }, stand, van, gehaaldZin, nogZin, baan)),
  );

  // ---- Rij 1 rechts: voeg toe. Eén tik voegt de drank toe in haar standaardgrootte.
  const mlLabels = {};
  const drankKnoppen = ANDERE.map((soort) => {
    const ml = h('span', { class: 'drankknop__ml cijfer' });
    mlLabels[soort] = ml;
    return h(
      'button',
      { type: 'button', class: 'drankknop licht-op-icoon', disabled: toekomst, dataset: { soort }, onclick: () => { tril(); drankErbij(schrijfDag(), soort); } },
      icoontegel(DRANKICOON[soort], 'drank'),
      h('span', { class: 'drankknop__naam' }, t(soort === 'water' ? 'drank.waterTegel' : 'drank.' + soort)),
      ml,
    );
  });
  const laatsteKnop = knop(t('drinken.laatsteWeg'), { soort: 'tekst', icoon: ICOON.ongedaan.naam, uitgeschakeld: true, opKlik: () => laatsteWeghalen(schrijfDag()) });
  const andere = kaart(
    { klasse: 'drinken__andere' },
    kaartkop({ tegel: begripOpties('drinken'), label: t('drinken.voegToe') }),
    h('div', { class: 'drankrij' }, ...drankKnoppen),
    h('div', { class: 'drinken__laatste' }, h('p', { class: 'drinken__hint t-klein t-gedempt' }, t('drinken.andereHint')), laatsteKnop),
  );

  // ---- Rij 2: de hele dag per soort, één blok per soort die ze dronk (geen onderscheid per moment van de dag)
  const soortenEl = h('div', { class: 'drinken__soorten' });
  const totaalEl = h('span', {});
  const lijst = h(
    'div',
    { class: 'drinken__lijst' },
    kaart(
      { klasse: 'drinken__verloopkaart' },
      kaartkop({ tegel: begripOpties('drinken'), label: eerder ? t('drinken.dagGedronken', { datum: opmaakDatum(datum, 'kort') }) : t('drinken.vandaagGedronken'), eind: totaalEl }),
      soortenEl,
    ),
  );

  // De knop waarmee je een drank weghaalt verdwijnt met zijn blok. Met het toetsenbord gaat de focus dan naar de weghaalknop die op die plek komt (of de laatste),
  // en als er geen meer is naar de eerste drankknop, zodat je niet vooraan de pagina terechtkomt.
  let focusNa = null;
  async function haalWeg(drank, knopEl) {
    const hadFocus = knopEl && document.activeElement === knopEl;
    if (hadFocus) focusNa = [...soortenEl.querySelectorAll('.drank__weg')].indexOf(knopEl);
    await verwijderDrank(drank.id);
    strook(t('drinken.weggehaald'), { actie: { label: t('drinken.terugzetten'), opKlik: () => zetDrankTerug(drank) } });
  }

  const hoeveelheid = (ml) => (ml >= 1000 ? opmaakLiter(ml) : opmaakMl(ml));

  function tekenSoorten(dranken, doel) {
    totaalEl.textContent = dranken.length ? t('drinken.stand', { liter: opmaakLiter(somMl(dranken)), doel: opmaakLiter(doel) }) : '';
    if (!dranken.length) {
      soortenEl.replaceChildren(h('p', { class: 'drinken__nog-niets leeg__tekst t-cursief t-gedempt' }, eerder ? t('drinken.leegDag') : t('drinken.leeg')));
      herstelFocus();
      return;
    }
    const blokken = perSoort(dranken).map((g) => {
      const laatste = [...dranken].reverse().find((d) => d.soort === g.soort);
      const naam = t('drank.' + g.soort);
      return h(
        'div',
        { class: 'soortblok', role: 'group', 'aria-label': t('drinken.soortAlt', { naam, aantal: g.aantal }) + ', ' + hoeveelheid(g.ml), dataset: { soort: g.soort, aantal: String(g.aantal) } },
        icoontegel(DRANKICOON[g.soort] ?? 'glass-water', 'drank'),
        h('div', { class: 'soortblok__tekst' }, h('p', { class: 'soortblok__naam' }, naam), h('p', { class: 'soortblok__hoeveel cijfer' }, t('drinken.soortRegel', { aantal: g.aantal, hoeveelheid: hoeveelheid(g.ml) }))),
        h('button', { type: 'button', class: 'icoonknop drank__weg', 'aria-label': t('drinken.eenWeg', { naam: naam.toLowerCase() }), onclick: (e) => { tril(); haalWeg(laatste, e.currentTarget); } }, begripIcoon('weghalen', { grootte: 16 })),
      );
    });
    soortenEl.dataset.n = String(blokken.length); // de indeling in kolommen volgt het aantal soorten (zie scherm-drinken.css)
    soortenEl.replaceChildren(...blokken);
    herstelFocus();
  }

  function herstelFocus() {
    if (focusNa == null) return;
    const actief = document.activeElement;
    if (actief && actief !== document.body && actief.isConnected) return; // de focus is al ergens, laat hem staan
    const wegKnoppen = soortenEl.querySelectorAll('.drank__weg');
    const doel = wegKnoppen.length ? wegKnoppen[Math.min(focusNa, wegKnoppen.length - 1)] : drankKnoppen[0];
    focusNa = null;
    doel.focus({ preventScroll: true });
  }

  // ---- Rij 3: de week en de kerncijfers
  // BESLISSING 438: de gekozen week (maandag). null = de week van de bekeken dag (bij openen de lopende week); blijft staan bij een dagwissel.
  let gekozenStart = null;
  const toonStart = () => gekozenStart ?? weekStart(datum);
  let verversNr = 0;
  function blader(stap) {
    const nieuw = stapWeek(toonStart(), stap, vandaag());
    if (nieuw === toonStart()) return;
    gekozenStart = nieuw === weekStart(datum) ? null : nieuw;
    ververs();
  }
  const weekEl = h('div', { class: 'drinken__week' });
  const cijfersEl = h('div', { class: 'drinken__cijfers' });

  // BESLISSING 480: de periode rechts in de kop van "Je week in cijfers" in drie vormen (vol, korte maanden, zonder jaartal); css toont de langste die naast de titel past.
  // Een schermlezer leest altijd de volle vorm.
  const periodeVormen = (a) => h('span', { class: 'drinken__aanduiding' }, h('span', { class: 'alleen-lezer' }, a.periode), ...[['vol', a.periode], ['kort', a.kort], ['kortst', a.kortst]].map(([vorm, tekst]) => h('span', { class: 'drinken__aanduiding--' + vorm, 'aria-hidden': 'true' }, tekst)));
  function tekenCijfers({ dagen, doel, bereik, aanduiding, ref }) {
    const dagNaam = (i) => t('algemeen.dagen.' + (i + 1));
    const opDatum = new Map();
    for (const d of bereik) opDatum.set(d.datum, (opDatum.get(d.datum) ?? 0) + d.ml);
    const { gemiddelde, gehaald, van, beste, besteIndex } = drinkWeekCijfers({ dagen, doel, nu: vandaag() });

    // De reeks: dagen op rij met het dagdoel gehaald, terug vanaf de bekeken dag (of gisteren als die nog niet gehaald is). Voor een andere week: zoals ze op het einde van die week stond.
    const haalt = (dag) => doel > 0 && (opDatum.get(dag) ?? 0) >= doel;
    const reeks = reeksVanaf({ haalt, vanaf: ref, dagNogOpen: ref === vandaag(), max: REEKS_DAGEN });

    const getalLiter = (ml) => opmaakLiter(ml).replace(/\s?l$/, '');
    const kern = h(
      'div',
      { class: 'drinken__kern' },
      kerncijfer({ label: t('drinken.gemiddeld'), waarde: gemiddelde == null ? '-' : getalLiter(gemiddelde), eenheid: gemiddelde == null ? null : t('drinken.liter'), tegel: begripOpties('drinken') }),
      kerncijfer({ label: t('drinken.gehaaldKop'), waarde: String(gehaald), eenheid: t('drinken.gehaaldVan', { aantal: van }), tegel: begripOpties('badge') }),
      kerncijfer({ label: t('drinken.besteKop'), waarde: beste ? getalLiter(beste.ml) : '-', eenheid: beste ? `${t('drinken.liter')} · ${dagNaam(besteIndex)}` : null, tegel: begripOpties('drinken') }),
      kerncijfer({ label: t('drinken.reeksKop'), waarde: String(reeks), eenheid: reeks === 1 ? t('drinken.reeksDag') : t('drinken.reeksDagen'), tegel: begripOpties('reeks') }),
    );

    // Wat ze het meest drinkt: de verdeling van deze week per soort, als één balk in de kleur van het begrip.
    const weekDatums = new Set(dagen.map((d) => d.datum));
    const groepen = perSoort(bereik.filter((d) => weekDatums.has(d.datum))).sort((a, b) => b.ml - a.ml);
    const totaal = groepen.reduce((som, g) => som + g.ml, 0);
    let verdeling;
    if (!totaal) {
      verdeling = h('p', { class: 'drinken__meestleeg t-cursief t-gedempt' }, t(aanduiding.soort === 'deze' ? 'drinken.meestLeeg' : 'drinken.meestLeegEerder')); // een voorbije week kan niet meer gevuld worden
    } else {
      const delen = groepen.map((g) => ({ ...g, procent: Math.round((g.ml / totaal) * 100) }));
      const balk = h(
        'div',
        { class: 'verdeling', role: 'img', 'aria-label': t('drinken.verdelingAlt', { delen: delen.map((g) => `${t('drank.' + g.soort)} ${g.procent}%`).join(', ') }) },
        ...delen.map((g, i) => {
          const deel = h('span', { class: `verdeling__deel verdeling__deel--${Math.min(i, 5)}` });
          deel.style.setProperty('--deel', String(g.ml));
          return deel;
        }),
      );
      const legenda = h(
        'ul',
        { class: 'verdeling__legenda' },
        ...delen.map((g, i) => h('li', { class: 'verdeling__item' }, h('span', { class: `verdeling__stip verdeling__deel--${Math.min(i, 5)}`, 'aria-hidden': 'true' }), h('span', {}, t('drank.' + g.soort)), h('span', { class: 'cijfer t-gedempt' }, `${g.procent}%`))),
      );
      verdeling = h('div', { class: 'verdeling__vak' }, balk, legenda);
    }
    cijfersEl.replaceChildren(
      kaart(
        { klasse: 'drinken__cijferkaart' },
        kaartkop({ tegel: begripOpties('drinken'), label: t('drinken.cijfersKop'), eind: aanduiding.soort === 'deze' ? t('drinken.gemiddeldSub') : aanduiding.soort === 'vorige' ? t('drinken.gemiddeldSubVorige') : periodeVormen(aanduiding) }),
        kern,
        h('div', { class: 'drinken__meest' }, h('p', { class: 'label' }, t('drinken.meestKop')), verdeling),
      ),
    );
  }

  // ---- Onderaan: goed om te weten, met de weg naar de instellingen van Drinken
  const weetjes = kaart(
    { klasse: 'drinken__weetjes' },
    kaartkop({ tegel: begripOpties('drinken'), label: t('instellingen.goedOmTeWeten') }),
    h(
      'div',
      { class: 'drinken__weetjesrij' },
      ...['toevoegen', 'badge', 'supplementen'].map((begrip, i) => h('div', { class: 'weetje' }, begripTegel(begrip, { familie: ICOON.drinken.familie }), h('p', { class: 'weetje__tekst' }, t(`drinken.weetje${i + 1}`)))),
      // Het vierde blok van de rij: dezelfde vorm als een weetje (tegel en tekst), maar de hele kolom is de weg naar de instellingen.
      toonHetMe({ familie: ICOON.drinken.familie, begrip: 'instellingen', label: t('drinken.instellingen'), data: 'drinken-instellingen', opKlik: () => (window.location.hash = '#/meer/instellingen') }),
    ),
  );

  // De kaart "Deze week" met pijlen in de kop (iconen uit de huisstijl, zoals de kalender op Vandaag). BESLISSING 471: geen link "Naar deze week" onder de kaart; terug gaat met de pijl rechts, vegen of de pijltjestoetsen.
  // De opmaak (één rij, pijlen zonder extra hoogte, de periode gecentreerd; op een smalle kaart de pijlen met de periode op een eigen regel) staat in scherm-drinken.css.
  function tekenWeek({ dagen, doel, start, aanduiding }) {
    const kaartEl = drinkWeekKaart({ dagen, doel, vandaag: vandaag(), datums: true });
    const lopend = start === weekStart(vandaag());
    const hadFocus = weekEl.contains(document.activeElement) ? document.activeElement.dataset?.richting : null;
    const vorige = icoonknop('chevron-left', { label: t('week.vorige'), opKlik: () => blader(-1), klasse: 'drinken__weekpijl' });
    const volgende = icoonknop('chevron-right', { label: t('week.volgende'), opKlik: () => blader(1), uit: lopend, klasse: 'drinken__weekpijl' });
    vorige.dataset.richting = 'vorige';
    volgende.dataset.richting = 'volgende';
    const eind = kaartEl.querySelector('.kaartkop__eind');
    // BESLISSING 445: tussen de pijlen staat alleen de periode ("16 - 22 november"), in een vaste breedte zodat de pijlen niet verspringen; het dagdoel staat niet in de kop.
    const tekst = h('span', { class: 'label datumkop drinken__weekperiode' }, ...weekPeriodeTekst(start, { jaar: true }).split(' - ').flatMap((deel, i, alle) => [h('span', { class: 'drinken__periodedeel' }, i < alle.length - 1 ? deel + ' -' : deel), i < alle.length - 1 ? ' ' : null]).filter(Boolean)); // BESLISSING 476: met het jaartal; een smalle kop breekt alleen na het streepje
    eind.replaceChildren(vorige, tekst, volgende);
    eind.classList.add('drinken__weekbladeren');
    if (aanduiding.soort === 'vorige') kaartEl.querySelector('.kaartkop__label').textContent = t('drinken.weekVorigeKop');
    else if (aanduiding.soort === 'week') kaartEl.querySelector('.kaartkop__label').textContent = t('drinken.weekAndereKop');
    weekEl.replaceChildren(kaartEl);
    if (hadFocus) {
      const doelKnop = weekEl.querySelector(`[data-richting="${hadFocus}"]`);
      if (doelKnop && !doelKnop.disabled) doelKnop.focus({ preventScroll: true });
    }
  }

  async function ververs() {
    const nr = ++verversNr;
    const start = toonStart();
    const weekEind = plusDagen(start, 6);
    const ref = start === weekStart(datum) ? datum : weekEind < vandaag() ? weekEind : vandaag();
    const eersteVanReeks = plusDagen(ref, -(REEKS_DAGEN - 1));
    const [doel, glasMl, groottes, dranken, week, bereik] = await Promise.all([
      leesInstelling('drinken.dagdoelMl'),
      leesInstelling('drinken.glasMl'),
      leesInstelling('drinken.groottes'),
      leesDranken(datum),
      leesWeekoverzicht(start),
      leesDrankenBereik(eersteVanReeks < start ? eersteVanReeks : start, weekEind > datum ? weekEind : datum),
    ]);
    if (weg || nr !== verversNr) return;
    const ml = somMl(dranken);
    const gehaald = doel > 0 && ml >= doel; // alleen de huidige stand telt, niet wat eerder vandaag al gehaald was
    const getalTekst = opmaakLiter(ml).split(/\s/)[0];
    if (eerste) telOp(standGetal, ml / 1000, { opmaak: (l) => opmaakLiter(l * 1000).slice(0, -2) });
    else standGetal.textContent = getalTekst;
    van.textContent = t('drinken.van', { doel: opmaakLiter(doel) });
    glas.zet(doel > 0 ? ml / doel : 0, gehaald);
    gehaaldZin.hidden = !gehaald;
    // Nog te gaan: in kannen als het een rond aantal is, anders in liters (nooit "nog 0,6 kan").
    const rest = doel > 0 && !gehaald ? doel - ml : 0;
    const nog = rest > 0 && rest % Math.max(1, glasMl) === 0 ? rest / glasMl : 0;
    nogZin.hidden = rest <= 0;
    nogZin.textContent = rest <= 0 ? '' : nog === 1 ? t('drinken.nogEen') : nog > 1 ? t('drinken.nogKannen', { aantal: nog }) : t('drinken.nogLiter', { liter: opmaakLiter(rest) });
    const laatsteHadFocus = document.activeElement === laatsteKnop;
    laatsteKnop.disabled = dranken.length === 0 || toekomst;
    if (laatsteHadFocus && laatsteKnop.disabled) drankKnoppen[0].focus({ preventScroll: true }); // een uitgeschakelde knop houdt de focus niet vast
    baan.zet(doel > 0 ? ml / doel : 0, gehaald);
    for (const soort of ANDERE) {
      // Water gebruikt de ingestelde glasgrootte, de andere dranken hun eigen standaardgrootte.
      const grootte = soort === 'water' ? glasMl : groottes[soort];
      mlLabels[soort].textContent = opmaakMl(grootte);
      mlLabels[soort].closest('button').setAttribute('aria-label', `${t(soort === 'water' ? 'drank.waterTegel' : 'drank.' + soort)},${opmaakMl(grootte)}`);
    }
    tekenSoorten(dranken, doel);
    const dagen = week.dagen.map((d) => ({ datum: d.datum, ml: d.ml }));
    const aanduiding = weekAanduiding(start, vandaag(), { jaar: true, vormen: true });
    tekenWeek({ dagen, doel, start, aanduiding });
    tekenCijfers({ dagen, doel, bereik, aanduiding, ref });
    if (eerste) {
      eerste = false;
      komOp([kop, hoofd, andere, lijst, weekEl, cijfersEl, weetjes]);
    }
  }

  function plan() {
    clearTimeout(timer);
    timer = setTimeout(ververs, 30);
  }

  const kop = h(
    'header',
    { class: 'drinken__kop' },
    schermkop({ titel: t('drinken.titel') }),
    eerder
      ? h(
          'div',
          { class: 'drinken__dag' },
          h('p', { class: 'label' }, opmaakDatum(datum, 'lang')),
          knop(t('dag.naarVandaag'), { soort: 'tekst', opKlik: () => (window.location.hash = '#/drinken') }),
        )
      : null,
    toekomst ? h('p', { class: 'dag__toekomst t-cursief' }, t('dag.toekomst')) : null,
  );

  houder.replaceChildren(h('div', { class: 'stapel stapel--sectie drinken' }, kop, h('div', { class: 'raster drinken__raster' }, hoofd, andere, lijst, weekEl, cijfersEl, weetjes)));

  // Vegen op de weekkaart (touch-action: pan-y in scherm-drinken.css): links vegen = volgende week, rechts vegen = vorige week.
  let veegStart = null;
  let veegGedaan = 0;
  weekEl.addEventListener('touchstart', (e) => { const p = e.touches[0]; veegStart = e.touches.length === 1 ? { x: p.clientX, y: p.clientY } : null; }, { passive: true });
  weekEl.addEventListener('touchend', (e) => {
    if (!veegStart) return;
    const p = e.changedTouches[0];
    const richting = veegRichting(p.clientX - veegStart.x, p.clientY - veegStart.y);
    veegStart = null;
    if (!richting) return;
    veegGedaan = Date.now();
    blader(richting);
  }, { passive: true });
  // Na een veeg geen tik op de dag eronder
  weekEl.addEventListener('click', (e) => { if (Date.now() - veegGedaan < 500) { e.preventDefault(); e.stopPropagation(); } }, true);
  weekEl.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    blader(e.key === 'ArrowLeft' ? -1 : 1);
  });

  lichtOp(houder);
  const lichtWaarnemer = new MutationObserver(() => lichtOp(houder));
  lichtWaarnemer.observe(houder, { childList: true, subtree: true });
  const afmelders = [
    luister('data:gewijzigd', plan),
    luister('instelling:gewijzigd', plan),
    luister('elders:gewijzigd', plan), // een ander tabblad (R5-01)
    // De viering van een gehaald doel speelt alleen als het doel nu gehaald wordt, niet bij herladen.
    luister('doel:gehaald', (d) => {
      if (d?.datum !== datum) return;
      // Het bloeien speelt nu één keer; daarna blijft het stil, ook als het doel later opnieuw gehaald wordt.
      bloeiOp(hoofd);
    }),
  ];
  ververs();

  const stopHaken = haakUitleg(houder, {
    haken: [
      ['.drinken__andere .drankrij', 'drankknoppen'],
      ['.drinken__laatste', 'laatste-weghalen'],
      ['.drinken__lijst .drank__weg', 'drank-regel'],
      ['.drinkhoofd__stand', 'voortgang'],
      ['.drinken__week', 'week'],
    ],
  });
  const stopUitleg = registreerUitleg('drinken', { toonOngedaanMelding: async () => toonOngedaanMelding() });

  return () => {
    weg = true;
    clearTimeout(timer);
    afmelders.forEach((af) => af());
    stopHaken();
    stopUitleg();
    lichtWaarnemer.disconnect();
  };
}
