// Het weerbericht op Vandaag: een kaart naast de motivator (op een telefoon helemaal onderaan)
// (data/weer.js, logica/weer.js). Alleen op het hoofdscherm.
// Van boven naar onder:
//   nu        het weerbeeld (icoon en naam), de temperatuur en hoe het aanvoelt;
//   vandaag   tien vakken, elk een woord met één waarde: de laagste en de hoogste temperatuur, de kans op regen, de hoeveelheid neerslag,
//             de wind (kracht en richting), de windsnelheid, zon op, zon onder, de uv-index en de luchtvochtigheid;
//   de week   zeven dagen vanaf vandaag: per dag het weerbeeld, de hoogste en de laagste temperatuur en de kans op regen.
// De kaart houdt altijd dezelfde opbouw en dezelfde hoogte, en er staat nooit een zin dat het niet lukt: zolang er geen weer is, staan
// de vakken en de dagen er met een streepje. Zo verspringt Vandaag niet als het weer binnenkomt, en blijft de kaart even hoog als de
// motivator ernaast. data/weer.js zorgt dat er altijd weer is zodra dit toestel één keer een weerbericht kreeg (de plek van het
// toestel, anders de noodplek, anders het bewaarde weerbericht).
// weerkaart(stand) → { el, teken(stand) }: teken past de kaart ter plaatse aan bij 'weer:gewijzigd'.
import { WEEKDAGEN, uvWoord, weerBeeld, windkracht, windrichting } from '../logica/weer.js';
import { naarDatum, plusDagen, vandaag } from '../kern/datum.js';
import { t } from '../teksten.js';
import { h } from './dom.js';
import { icoontegel, kaart, kaartkop } from './componenten.js';
import { icoon } from './iconen.js';

// Een hoeveelheid zoals ze hier gelezen wordt: 2 mm, 12 mm, 0,4 mm.
const hoeveel = (x) => (Number.isInteger(x) || x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace('.', ','));
const LEEG = '-';
// De dag van de week bij een datum: 1 (maandag) tot 7 (zondag), zoals TEKSTEN.algemeen.dagen.
const dagNr = (datum) => ((naarDatum(datum).getDay() + 6) % 7) + 1;
const dagNaam = (datum) => t('algemeen.dagen.' + dagNr(datum));
const graden = (x) => (x == null ? LEEG : t('weer.graden', { aantal: x }));
// Hoe ver de inkt van het eerste teken van de temperatuur van de linkerrand van zijn vak af staat, in em van het sierlettertype (gemeten per
// cijfer). De kaart schuift de temperatuur zoveel naar links: zo begint het cijfer precies op de lijn waarop de V van "Voelt als" eronder begint.
const INKT_LINKS = { 0: 0.04, 1: 0.0825, 2: 0.0575, 3: 0.0775, 4: 0.04, 5: 0.0725, 6: 0.0575, 7: 0.07, 8: 0.045, 9: 0.0525, '-': 0.0275, '\u2212': 0.0275 };
const inktLinks = (tekst) => INKT_LINKS[String(tekst).trim()[0]] ?? 0.06;

// Het weer in het kort, onder de datum op Vandaag. Alleen op een telefoon (de css verbergt de regel vanaf 720 px): daar staat de kaart
// helemaal onderaan, en zo ziet ze het weer toch meteen. Eén regel in een afgeronde pil, even breed als de kaart eronder: het weerbeeld
// (als icoon, zonder naam: die staat in de kaart), de temperatuur van nu, de laagste en de hoogste temperatuur, de kans op regen (of
// sneeuw) en de hoeveelheid, gelijk verdeeld over de breedte met een puntje ertussen. Er valt nooit iets weg en er steekt nooit iets
// buiten de pil: past alles niet met de gewone letters, dan wordt de hele pil kleiner (pas). Eén tik brengt haar naar de kaart (naar).
// Zolang er geen weer is, staan er streepjes, nooit een zin.
// weerregel(stand, { naar }) -> { el, teken(stand) }
export function weerregel(stand, { naar } = {}) {
  const pil = h('span', { class: 'weerregel__pil', 'aria-hidden': 'true' });
  const knop = h('button', { type: 'button', class: 'weerregel__knop' }, pil);
  knop.addEventListener('click', () => naar?.());
  // De rij, de knop en de pil zijn zo breed als de kolom, net als de kaart eronder.
  const el = h('div', { class: 'weerregel' }, knop);
  const deel = (woord, waarde) => h('span', null, h('span', { class: 'weerregel__woord' }, woord), ' ', h('span', { class: 'cijfer' }, waarde ?? LEEG));
  const punt = () => h('span', { class: 'weerregel__punt' });
  // Alles blijft altijd staan, op één regel en binnen de pil. Past de tekst met de gewone letters niet (een lange naam, een smalle
  // telefoon), dan krimpen eerst de tussenruimtes tot een smal puntje en daarna de hele pil: letters, icoon, binnenruimte en hoogte hangen
  // allemaal aan één lettermaat (em, scherm-vandaag.css) en worden samen net zoveel kleiner als nodig. Zo blijft de pil één geheel.
  // Omdat alles meekrimpt, volstaat één meting. Is er ruimte over, dan verdelen de puntjes ze gelijk.
  const pas = () => {
    if (!el.isConnected) return;
    el.style.fontSize = '';
    const plaats = el.clientWidth;
    if (!plaats) return; // vanaf 720 px staat de regel er niet
    pil.classList.add('is-meten'); // de kleinste breedte met deze lettermaat: niets rekt, de puntjes op hun smalst
    const nodig = pil.getBoundingClientRect().width;
    const basis = Number.parseFloat(getComputedStyle(pil).fontSize);
    pil.classList.remove('is-meten');
    if (!(nodig > plaats + 0.25) || !basis) return;
    el.style.fontSize = `${Math.floor(((basis * plaats) / nodig) * 20) / 20}px`; // naar beneden afgerond op 0,05 px: nooit te breed
  };
  // De kolom wordt breder of smaller (het toestel draait, het venster verandert) of de letters komen binnen: opnieuw passen.
  if (typeof ResizeObserver === 'function') new ResizeObserver(pas).observe(el);
  globalThis.document?.fonts?.ready?.then(pas);
  const teken = (s = { fase: 'laden' }) => {
    const w = s.fase === 'klaar' && weerBeeld(s.weer) ? s.weer : null;
    const beeld = w ? weerBeeld(w) : null; // dezelfde naam als op de kaart: wat de weerdienst meldt (de weercode), geen eigen regels
    const naam = beeld ? t('weer.' + beeld.naam) : null;
    const sneeuw = !!w && Number.isFinite(w.sneeuw) && w.sneeuw > 0;
    const hoeveelheid = w ? (sneeuw ? w.sneeuw : w.mm) : null;
    const heeftHoeveel = Number.isFinite(hoeveelheid);
    el.dataset.fase = w ? 'klaar' : 'laden';
    // Een schermlezer hoort het weer in gewone zinnen, en waar de knop naartoe gaat.
    knop.setAttribute(
      'aria-label',
      (w
        ? [
            t('weer.label', { naam, aantal: w.temp }),
            w.min != null && w.max != null && t('weer.labelBereik', { min: w.min, max: w.max }),
            w.kans != null && t(sneeuw ? 'weer.labelKansSneeuw' : 'weer.labelKansRegen', { aantal: w.kans }),
            heeftHoeveel && t(sneeuw ? 'weer.labelVerwachtSneeuw' : 'weer.labelVerwachtRegen', { aantal: hoeveel(hoeveelheid) }),
            t('weer.naarKaart'),
          ]
        : [t('weer.laden'), t('weer.naarKaart')]
      )
        .filter(Boolean)
        .join(' '),
    );
    pil.replaceChildren(
      icoon(beeld?.icoon ?? 'cloud-sun', { grootte: 18 }),
      h('span', { class: 'weerregel__graden cijfer' }, w ? graden(w.temp) : LEEG),
      // De delen staan gelijk verdeeld over de breedte van de pil: de puntjes ertussen nemen elk evenveel van de vrije ruimte
      // (scherm-vandaag.css). De naam van het weer staat hier niet: het weerbeeld is het icoon, de naam staat in de kaart Het weer.
      h(
        'span',
        { class: 'weerregel__delen' },
        punt(),
        deel(t('weer.min'), w?.min != null ? graden(w.min) : null),
        punt(),
        deel(t('weer.max'), w?.max != null ? graden(w.max) : null),
        w?.kans != null ? [punt(), h('span', { class: 'cijfer' }, t(sneeuw ? 'weer.kansSneeuw' : 'weer.kansRegen', { aantal: w.kans }))] : null,
        heeftHoeveel ? [punt(), h('span', { class: 'cijfer' }, t(sneeuw ? 'weer.cm' : 'weer.mm', { aantal: hoeveel(hoeveelheid) }))] : null,
      ),
    );
    pas();
  };
  teken(stand);
  return { el, teken };
}

export function weerkaart(stand) {
  const binnen = h('div', { class: 'weerkaart__binnen' });
  // De kop (tegel en "Het weer") staat er alleen waar de kaart tussen andere kaarten met een kop staat: op een telefoon en een tablet. Naast
  // de motivator, die zelf geen kop heeft, verbergt de css hem (scherm-vandaag.css): zo zijn de twee kaarten van nature even hoog.
  const el = kaart(
    { klasse: 'weerkaart', tag: 'section', 'aria-label': t('weer.titel'), 'data-uitleg': 'weer' },
    kaartkop({ tegel: { naam: 'cloud-sun', familie: 'dag' }, label: t('weer.titel') }),
    binnen,
  );

  // Eén vak: het woord, en eronder één regel met de waarde. bij: een kleine toevoeging achter de waarde (0,4 mm, matig).
  const vak = (klasse, label, waarde, bij) =>
    h(
      'div',
      { class: ['weerkaart__vak', klasse && 'weerkaart__vak--' + klasse] },
      h('span', { class: 'weerkaart__woord' }, label),
      h('span', { class: 'weerkaart__waarde cijfer' }, waarde ?? LEEG, waarde != null && bij ? h('span', { class: 'weerkaart__bij' }, bij) : null),
    );

  const teken = (s = { fase: 'laden' }) => {
    const w = s.fase === 'klaar' && weerBeeld(s.weer) ? s.weer : null;
    const fase = w ? 'klaar' : 'laden';
    el.dataset.fase = fase;
    el.setAttribute('aria-busy', String(fase === 'laden'));

    // ---- vandaag: acht vakken
    // Valt er vandaag sneeuw, dan gaat het vak over sneeuw (met de centimeters); anders over regen (met de millimeters).
    const sneeuw = !!w && Number.isFinite(w.sneeuw) && w.sneeuw > 0;
    const hoeveelheid = w ? (sneeuw ? w.sneeuw : w.mm) : null;
    const kracht = w ? windkracht(w.wind) : null;
    const streek = w ? windrichting(w.richting) : null;
    const uv = w ? uvWoord(w.uv) : null;
    const hoeveelTekst = Number.isFinite(hoeveelheid) ? t(sneeuw ? 'weer.cm' : 'weer.mm', { aantal: hoeveel(hoeveelheid) }) : null;
    // Tien vakken, elk met één waarde. Op een smalle kaart staan ze als een lijst in twee kolommen van vijf (het woord links, de waarde
    // rechts); op een brede kaart in vijf kolommen op twee rijen (het woord boven de waarde). Zo is het raster altijd helemaal gevuld.
    const vakken = h(
      'div',
      { class: 'weerkaart__cijfers', 'aria-hidden': 'true' },
      vak('min', t('weer.min'), w?.min != null ? graden(w.min) : null),
      vak('max', t('weer.max'), w?.max != null ? graden(w.max) : null),
      vak('regen', t(sneeuw ? 'weer.sneeuw' : 'weer.regen'), w?.kans != null ? t('weer.procent', { aantal: w.kans }) : null),
      vak('neerslag', t('weer.neerslag'), w ? hoeveelTekst : null),
      vak('wind', t('weer.wind'), kracht != null ? [t('weer.bft', { aantal: kracht }), streek].filter(Boolean).join(' ') : null),
      vak('snelheid', t('weer.snelheid'), w?.wind != null ? t('weer.kmu', { aantal: w.wind }) : null),
      vak('zonop', t('weer.zonOp'), w?.zonOp ?? null),
      vak('zononder', t('weer.zonOnder'), w?.zonOnder ?? null),
      vak('uv', t('weer.uv'), w?.uv != null ? String(w.uv) : null, uv ? t('weer.' + uv) : null),
      vak('vocht', t('weer.vocht'), w?.vocht != null ? t('weer.procent', { aantal: w.vocht }) : null),
    );

    // ---- de week: zeven dagen vanaf vandaag. Zonder weer staan de dagen er al, met een streepje.
    const eerste = vandaag();
    const dagen = w?.dagen?.length >= WEEKDAGEN ? w.dagen.slice(0, WEEKDAGEN) : Array.from({ length: WEEKDAGEN }, (_, i) => ({ datum: plusDagen(eerste, i), ...(w?.dagen?.[i] ?? {}) }));
    const week = h(
      'div',
      { class: 'weerkaart__week' },
      h('p', { class: 'label weerkaart__weekkop' }, t('weer.week')),
      h(
        'ul',
        { class: 'weerweek' },
        ...dagen.map((d, i) => {
          const beeld = weerBeeld({ code: d.code });
          const naam = beeld ? t('weer.' + beeld.naam) : '';
          const voorLezer = beeld
            ? [`${i === 0 ? t('weer.vandaag') : dagNaam(d.datum)}: ${naam}`, d.max != null && d.min != null && t('weer.labelDag', { min: d.min, max: d.max }), d.kans != null && t('weer.labelKansDag', { aantal: d.kans })].filter(Boolean).join(', ')
            : dagNaam(d.datum);
          return h(
            'li',
            { class: ['weerweek__dag', i === 0 && 'is-vandaag'], role: 'img', 'aria-label': voorLezer },
            h('span', { class: 'label weerweek__naam', 'aria-hidden': 'true' }, dagNaam(d.datum).slice(0, 2)),
            icoontegel(beeld?.icoon ?? 'cloud', beeld ? 'dag' : 'neutraal', { gedimd: !beeld }),
            h('span', { class: 'weerweek__max cijfer', 'aria-hidden': 'true' }, graden(d.max)),
            h('span', { class: 'weerweek__min cijfer', 'aria-hidden': 'true' }, graden(d.min)),
            h('span', { class: 'weerweek__kans cijfer', 'aria-hidden': 'true' }, d.kans != null ? t('weer.procent', { aantal: d.kans }) : LEEG),
          );
        }),
      ),
    );

    if (!w) {
      // Nog geen weer: dezelfde kaart met streepjes, zonder zin. Een schermlezer hoort dat het weer wordt opgehaald.
      binnen.replaceChildren(
        h('p', { class: 'alleen-lezer' }, t('weer.laden')),
        h('div', { class: 'weerkaart__nu', 'aria-hidden': 'true' }, icoontegel('cloud-sun', 'neutraal'), h('p', { class: 'cijfer-groot weerkaart__graden' }, LEEG), h('div', { class: 'weerkaart__waar' })),
        vakken,
        week,
      );
      return;
    }

    const beeld = weerBeeld(w);
    const naam = t('weer.' + beeld.naam);
    // Een schermlezer krijgt het weer van nu en van vandaag in gewone zinnen; de tekens en cijfers zelf leest hij niet voor.
    const voorLezer = [
      t('weer.label', { naam, aantal: w.temp }),
      w.gevoel != null && t('weer.labelVoelt', { aantal: w.gevoel }),
      w.min != null && w.max != null && t('weer.labelBereik', { min: w.min, max: w.max }),
      w.kans != null && t(sneeuw ? 'weer.labelKansSneeuw' : 'weer.labelKansRegen', { aantal: w.kans }),
      Number.isFinite(hoeveelheid) && t(sneeuw ? 'weer.labelVerwachtSneeuw' : 'weer.labelVerwachtRegen', { aantal: hoeveel(hoeveelheid) }),
      kracht != null && t('weer.labelWind', { aantal: kracht, kmu: w.wind }),
      w.zonOp && w.zonOnder && t('weer.labelZon', { op: w.zonOp, onder: w.zonOnder }),
      w.uv != null && uv && t('weer.labelUv', { aantal: w.uv, woord: t('weer.' + uv) }),
      w.vocht != null && t('weer.labelVocht', { aantal: w.vocht }),
    ];
    // Alleen in de demo staat er achter de gevoelstemperatuur dat het een voorbeeld is. Verder ziet de kaart er altijd hetzelfde uit,
    // of het weer nu van de plek van het toestel komt, van de noodplek of uit het bewaarde weerbericht.
    const bij = s.voorbeeld ? t('weer.voorbeeld') : null;
    binnen.replaceChildren(
      h('p', { class: 'alleen-lezer' }, voorLezer.filter(Boolean).join(' ')),
      h(
        'div',
        { class: 'weerkaart__nu', 'aria-hidden': 'true' },
        icoontegel(beeld.icoon, 'dag'),
        h('p', { class: 'cijfer-groot weerkaart__graden', style: `--weer-inkt: ${inktLinks(t('weer.graden', { aantal: w.temp }))}em` }, t('weer.graden', { aantal: w.temp })),
        h(
          'div',
          { class: 'weerkaart__waar' },
          // De langste naam (Onweer met zware hagel) krijgt op het smalste toestel iets kleinere letters, zodat hij op één regel blijft
          // en de kaart even hoog (scherm-vandaag.css).
          h('p', { class: ['weerkaart__beeld', naam.length > 18 && 'weerkaart__beeld--lang'] }, naam),
          // De delen staan met een puntje ertussen. Past de toevoeging niet meer op de regel, dan gaat ze als geheel naar de volgende,
          // zonder puntje vooraan (scherm-vandaag.css).
          h('p', { class: 'weerkaart__voelt cijfer' }, h('span', { class: 'weerkaart__voeltrij' }, w.gevoel != null ? h('span', null, t('weer.voelt', { aantal: w.gevoel })) : null, bij ? h('span', null, bij) : null)),
        ),
      ),
      vakken,
      week,
    );
  };
  teken(stand);
  return { el, teken };
}
