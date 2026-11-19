// Het verslag als vel papier op het scherm en bij het afdrukken (BESLISSING 306): dezelfde opbouw, volgorde, teksten en getallen als de pdf
// (verslag-pdf.js), als één doorlopend blad zonder pagina's. Het model komt uit verslag-model.js, de teksten zijn die van de pdf (delen.pdf*).
// Geen style-attributen (de CSP in de build): alle opmaak staat in scherm-algemeen.css; de Poeder-tokens gaan via el.style.setProperty.
import { h } from './dom.js';
import { beeldmerk, icoontegel } from './componenten.js';
import { MAALTIJDICOON } from './beeld.js';
import { zetPoeder } from './pdf-tokens.js';
import { ICOON } from './iconenkaart.js';
import { opmaakLiter } from '../kern/getal.js';
import { t } from '../teksten.js';

const STREEP = '-';
const gedempt = (tekst) => h('span', { class: 'verslagvel__gedempt' }, tekst);

// Eén rij van de dagtabel: onderdeel (met tegel) en wat, op vaste kolommen.
function rij({ tegel, label, wat, klasse = null }) {
  return h(
    'div',
    { class: ['verslagvel__rij', klasse], role: 'row' },
    h('span', { class: 'verslagvel__onderdeel', role: 'cell' }, tegel, h('span', { class: 'verslagvel__naam' }, label)),
    h('span', { class: 'verslagvel__wat', role: 'cell' }, ...[].concat(wat)),
  );
}

// Het drinken van één dag, de afgescheiden voetrij van de tabel: het totaal tegenover het dagdoel, "· dagdoel gehaald" en rechts een dunne balk,
// en op een tweede regel de soorten.
function drinkRij(dag, doel, kort = false) {
  const r = dag.rijen.find((q) => q.soort === 'drinken');
  const tegel = icoontegel(ICOON.drinken.naam, 'delen');
  if (!r) return rij({ tegel, label: t('tab.drinken'), klasse: 'verslagvel__rij--drinken', wat: gedempt(STREEP) });
  // BESLISSING 333: bij één dag staan totaal, doel en "gehaald" in de kerncijfers; in de tabel alleen de verdeling per drank (zonder balk)
  if (kort) return rij({ tegel, label: t('tab.drinken'), klasse: 'verslagvel__rij--drinken', wat: r.soorten.length > 1 ? r.soorten.map((q) => `${q.naam} ${opmaakLiter(q.ml)}`).join(' · ') : r.soorten[0]?.naam ?? STREEP });
  const ml = dag.drinkenMl ?? 0;
  const gehaald = doel > 0 && ml >= doel;
  const hoofd = doel > 0 ? t('delen.pdfVanDoel', { ml: opmaakLiter(ml), doel: opmaakLiter(doel) }) : opmaakLiter(ml);
  const soorten = r.soorten.length > 1 ? r.soorten.map((q) => `${q.naam} ${opmaakLiter(q.ml)}`).join(' · ') : '';
  return rij({
    tegel,
    label: t('tab.drinken'),
    klasse: 'verslagvel__rij--drinken',
    wat: [
      h('span', { class: 'verslagvel__drinktekst' }, h('span', { class: 'verslagvel__hoofd' }, hoofd), gehaald ? ' ' : null, gehaald ? h('span', { class: 'verslagvel__gehaald' }, `· ${t('delen.pdfDoelGehaald')}`) : null),
      h('progress', { class: 'verslagvel__balk', max: doel > 0 ? doel : 1, value: doel > 0 ? Math.min(ml, doel) : 0, 'aria-hidden': 'true' }),
      soorten ? h('span', { class: 'verslagvel__soorten' }, soorten) : null,
    ],
  });
}

// Eén dag: een band met de datum en rechts het aantal maaltijden (of "Niets genoteerd"), en daaronder de tabel. Een lege dag is alleen de band.
function dag(doc, d, metBand) {
  const o = doc.onderdelen ?? {};
  const rijen = [];
  if (!d.leeg) {
    if (o.eten) {
      const eten = d.rijen.filter((r) => r.soort === 'eten');
      if (!eten.length) rijen.push(rij({ tegel: icoontegel(ICOON.eten.naam, 'delen'), label: t('dag.eten'), wat: gedempt(STREEP) }));
      for (const r of eten) {
        rijen.push(rij({ tegel: icoontegel(MAALTIJDICOON[r.maaltijd] ?? ICOON.eten.naam, 'delen'), label: r.titel, wat: r.tekst || gedempt(STREEP) }));
      }
    }
    if (o.notities && d.notitie) rijen.push(rij({ tegel: icoontegel(ICOON.notitie.naam, 'delen'), label: t('dag.notitieTitel'), wat: h('span', { class: 'verslagvel__notitie' }, d.notitie) }));
    if (o.drinken) rijen.push(drinkRij(d, doc.dagdoelMl, doc.modus === 'dag'));
  }
  // Een dag zonder gegevens: de band en één rij "Niets genoteerd", in hetzelfde kader
  const leeg = !rijen.length;
  return h(
    'section',
    { class: ['verslagvel__dag', leeg && 'is-leeg'] },
    metBand ? h('div', { class: 'verslagvel__band' }, h('h3', { class: 'label verslagvel__dagtitel' }, d.titelJaar), d.bandTekst ? h('span', { class: 'verslagvel__bandeind' }, d.bandTekst) : null) : null,
    leeg ? null : dagKop(o.eten ? t('delen.pdfKolomMaaltijd') : t('delen.kolomOnderdeel')),
    h(
      'div',
      { class: 'verslagvel__tabel', role: 'table', 'aria-label': d.titelJaar },
      ...(leeg ? [h('div', { class: 'verslagvel__rij verslagvel__rij--leeg', role: 'row' }, h('span', { class: 'verslagvel__wat verslagvel__wat--breed verslagvel__gedempt', role: 'cell' }, t('delen.pdfNietsGenoteerd')))] : rijen),
    ),
  );
}

// De kolomkoprij van een dagtabel (Maaltijd | Wat): in elke dagtabel, met een lichte achtergrond.
const dagKop = (eerste) =>
  h(
    'div',
    { class: 'verslagvel__kolomkop', role: 'presentation' },
    h('span', null, eerste),
    h('span', null, t('delen.pdfKolomWat')),
  );

// Het gewicht, alleen bij twee of meer wegingen: een tabel over de volle breedte met Datum, Gewicht, Verschil met de vorige en Verschil met de eerste,
// getallen rechts uitgelijnd onder hun kop. De korte koppen voor een smal vel staan in data-kort (CSS), de tekst blijft dezelfde als in de pdf.
function gewicht(g) {
  const kop = (tekst, kort = null) => h('span', { 'data-kort': kort }, tekst);
  return h(
    'section',
    { class: 'verslagvel__gewicht' },
    h('h3', { class: 'verslagvel__sectietitel' }, g.titel),
    h(
      'div',
      { class: 'verslagvel__gewichttabel', role: 'table', 'aria-label': g.titel },
      h('div', { class: 'verslagvel__gewichtrij verslagvel__gewichtrij--kop', role: 'row' }, kop(t('delen.pdfKolomDatum')), kop(t('delen.pdfKolomGewicht')), kop(t('delen.pdfKolomVorige'), t('delen.pdfKolomVorigeKort')), kop(t('delen.pdfKolomEerste'), t('delen.pdfKolomEersteKort'))),
      ...g.wegingen.map((w) =>
        h(
          'div',
          { class: 'verslagvel__gewichtrij', role: 'row' },
          h('span', { role: 'cell' }, w.datumTekst),
          h('span', { class: 'verslagvel__kg', role: 'cell' }, w.kgTekst),
          h('span', { role: 'cell' }, w.verschil || gedempt(STREEP)),
          h('span', { role: 'cell' }, w.verschilEerste || gedempt(STREEP)),
        ),
      ),
    ),
  );
}

// De lege toestand van het vel (BESLISSING 300): het beeldmerk, één zin en een rustige suggestie, midden in het vel; geen lege band.
export function tekenLeeg(vel, tekst, tip) {
  zetPoeder(vel);
  vel.classList.add('verslagvel--leeg');
  vel.replaceChildren(h('div', { class: 'verslag__leeg' }, beeldmerk({ variant: 'licht', grootte: 48 }), h('p', { class: 'verslag__leegtekst' }, tekst), tip ? h('p', { class: 'verslag__leegtip' }, tip) : null));
}

// Vult (en legt de Poeder-tokens op) het element `vel` met het document.
export function tekenVel(vel, doc) {
  zetPoeder(vel);
  vel.classList.remove('verslagvel--leeg');
  const cijfers = doc.leeg ? [] : doc.kerncijfers ?? [];
  const wie = doc.kop.naam ? t('delen.pdfKop', { naam: doc.kop.naam }) : t('delen.pdfKopZonderNaam');
  const heeftDagen = doc.dagen.some((d) => !d.leeg);
  // Zonder lege onderdelen: replaceChildren(null) zou de tekst "null" in het vel zetten.
  const delen = [
    h(
      'header',
      { class: 'verslagvel__kop' },
      h('div', { class: 'verslagvel__merk' }, beeldmerk({ variant: 'licht', grootte: 24 }), h('span', { class: 'verslagvel__woord' }, 'bloei')),
      h('p', { class: 'verslagvel__wie' }, h('span', { class: 'verslagvel__naamkop' }, wie)), // BESLISSING 490: alleen "Verslag van <naam>"; de periode staat onder de titel
    ),
    // BESLISSING 461: het woord "Verslag" als grote titel (h2) en eronder de periode als label (hoofdletters via .label, een bereik met " - "), net als in de pdf
    h('h2', { class: 'verslagvel__titel' }, t('delen.verslagTitel')),
    h('p', { class: 'label verslagvel__periode' }, String(doc.periodeLang ?? '').replace(` ${t('delen.pdfTot')} `, ' - ')),
    cijfers.length &&
      h(
        'div',
        { class: ['verslagvel__cijfers', 'verslagvel__cijfers--n' + cijfers.length] },
        ...cijfers.map((c) =>
          h(
            'div',
            { class: 'verslagvel__cijfer' },
            h('span', { class: 'verslagvel__cijferlabel' }, c.label),
            h('span', { class: 'verslagvel__cijferwaarde' }, h('span', { class: 'verslagvel__cijfergetal' }, c.getal), c.eenheid ? h('span', { class: 'verslagvel__cijfereenheid' }, ' ' + c.eenheid) : null), // een smalle spatie voor de eenheid (ook voor wie de tekst leest of kopieert)
            h('span', { class: 'verslagvel__cijferonder' }, c.onder),
          ),
        ),
      ),
    doc.gewicht?.tabel ? gewicht(doc.gewicht) : null,
    heeftDagen
      ? h('div', { class: 'verslagvel__dagen' }, ...doc.dagen.map((d) => dag(doc, d, doc.dagen.length > 1)))
      : !doc.gewicht
        ? h('p', { class: 'verslagvel__geen' }, t('delen.leegPeriode'))
        : null,
    h('footer', { class: 'verslagvel__voet' }, t('delen.pdfGemaakt', { datum: doc.gemaaktOp })),
  ];
  vel.replaceChildren(...delen.filter(Boolean));
}
