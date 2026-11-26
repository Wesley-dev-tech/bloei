// Meer · Gewicht: het streefgewicht (BESLISSING 162 en 164), in de vaste opbouw van een instelscherm: links de instelling als één rij met de
// bediening rechts, rechts "Zo ziet het eruit": een kleine grafiek met de stippellijn van het streefgewicht.
// Zonder oordeel: geen kleur voor "goed" of "slecht", nooit "nog x kg". Elke wijziging bewaart zichzelf en is meteen zichtbaar op Gewicht.
import { h, svg } from '../ui/dom.js';
import { grafiek } from '../ui/grafiek.js';
import { kaart, kaartkop, knop, rij, stapper, schermkop, strook } from '../ui/componenten.js';
import { weetjesVoor } from '../ui/weetjes.js';
import { eersteToon, komOp } from '../ui/beweging.js';
import { beheerScherm, terugKnop, uitgesteldBewaren } from './hulp.js';
import { t } from '../teksten.js';
import { opmaakKg, leesKg } from '../kern/getal.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { laatsteWeging, leesWegingen } from '../data/wegingen.js';
import { begripOpties } from '../ui/iconenkaart.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { balanceer } from './instel-balans.js';

// Het lege assenvlak met alleen de stippellijn van het streefgewicht, zolang er nog geen weging is. Nooit verzonnen punten.
function legeGrafiek(streef) {
  const B = 240;
  const H = 96;
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${B} ${H}" preserveAspectRatio="none" class="gewvoorbeeld__grafiek" focusable="false" aria-hidden="true">
      ${[14, 31, 48, 65].filter((y) => streef == null || y !== 48).map((y) => `<line class="gewvoorbeeld__raster" x1="8" x2="${B - 8}" y1="${y}" y2="${y}"/>`).join('')}
      <line class="gewvoorbeeld__as" x1="8" x2="${B - 8}" y1="${H - 12}" y2="${H - 12}"/>
      ${streef == null ? '' : `<line class="gewvoorbeeld__streef" x1="8" x2="${B - 8}" y1="${H / 2}" y2="${H / 2}"/>`}
    </svg>`,
  );
}

// BESLISSING 493: de kg-stapper van het streefgewicht met een invoerveld tussen min en plus: plus en min werken het veld bij, en je kan er ook
// rechtstreeks een gewicht in typen (komma of punt, leesKg). Bewaren bij blur en Enter; een ongeldige waarde wordt niet bewaard (de melding
// van elders) en het veld valt terug op de laatste geldige. Het gedeelde onderdeel stapper() blijft ongewijzigd: het veld komt in dezelfde plek
// als het getal (zelfde klasse, dus zelfde breedte en hoogte); het getal zelf blijft als verborgen live-gebied bestaan voor de schermlezer.
function kgStapper({ waarde, label, veldLabel, opWijzig }) {
  let geldig = waarde;
  const stap = stapper({
    waarde,
    stap: 0.1,
    min: 20,
    max: 300,
    opmaak: opmaakKg,
    label,
    opWijzig: (n) => {
      geldig = n;
      toonWaarde();
      opWijzig(n, false);
    },
  });
  const uitvoer = stap.querySelector('.stapper__waarde');
  uitvoer.className = 'stapper__lees';
  const veld = h('input', { class: 'streefveld__invoer cijfer', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': veldLabel, maxlength: 7 });
  const eenheid = h('span', { class: 'stapper__eenheid', 'aria-hidden': 'true' }, 'kg');
  const houder = h('span', { class: 'stapper__waarde streefveld' }, veld, eenheid);
  uitvoer.before(houder);
  const getalTekst = (n) => opmaakKg(n).split(/\s/)[0];
  function pasBreedte() {
    veld.style.width = Math.max(veld.value.length, 3) + 'ch';
  }
  function toonWaarde() {
    veld.value = getalTekst(geldig);
    pasBreedte();
  }
  toonWaarde();
  function klaar() {
    const tekst = veld.value.trim();
    const n = leesKg(tekst);
    if (tekst === '' || n == null) {
      if (tekst !== '') strook(t('gewicht.ongeldig'), { duur: 4000 });
      veld.removeAttribute('aria-invalid');
      toonWaarde();
      return;
    }
    veld.removeAttribute('aria-invalid');
    if (n !== geldig) {
      geldig = n;
      stap.zetWaarde(n);
      opWijzig(n, true);
    }
    toonWaarde();
  }
  veld.addEventListener('focus', () => veld.select());
  veld.addEventListener('input', () => {
    pasBreedte();
    const tekst = veld.value.trim();
    if (tekst !== '' && leesKg(tekst) == null) veld.setAttribute('aria-invalid', 'true');
    else veld.removeAttribute('aria-invalid');
  });
  veld.addEventListener('blur', klaar);
  veld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      klaar();
      veld.select();
    } else if (e.key === 'Escape') {
      toonWaarde();
      veld.removeAttribute('aria-invalid');
    }
  });
  return stap;
}

export function toon(houder) {
  const streefBewaarder = uitgesteldBewaren((waarde) => zetInstelling('gewicht.streefKg', waarde));

  // Geen automatische hertekening: de stappers houden hun eigen stand, de opslag volgt.
  const opruimScherm = beheerScherm(
    houder,
    async (ctx) => {
      const [streef0, laatsteKg, wegingen] = await Promise.all([leesInstelling('gewicht.streefKg'), laatsteWeging(), leesWegingen()]);
      const stand = { streef: streef0 };
      const opent = eersteToon('meer-gewicht');

      // ---- Zo ziet het eruit
      const grafiekHouder = h('div', { class: 'gewvoorbeeld__grafiekhouder' });
      const zin = h('p', { class: 'gewvoorbeeld__zin t-cursief' });
      function tekenVoorbeeld() {
        // Haar echte wegingen met de bestaande grafiek in klein formaat; zonder weging het lege assenvlak. Nooit verzonnen punten.
        if (wegingen.length) {
          const gr = grafiek({ wegingen, periode: 'kwartaal', streefKg: stand.streef ?? undefined, vul: true });
          // Een voorbeeld is statisch (BESLISSING 296): geen tabstop, een klik kiest geen punt, de schermlezer slaat het over.
          const echt = h('div', { class: 'gewvoorbeeld__echt', 'aria-hidden': 'true' }, gr);
          echt.setAttribute('inert', '');
          grafiekHouder.replaceChildren(echt);
        } else {
          grafiekHouder.replaceChildren(legeGrafiek(stand.streef), h('p', { class: 'gewvoorbeeld__leeg t-cursief' }, t('instellingen.eersteWeging')));
        }
        zin.textContent = t(stand.streef != null ? 'instellingen.streefStippel' : 'instellingen.streefNogZin');
        balans?.pas(); // BESLISSING 345: de kolommen eindigen ook na een wijziging gelijk
      }
      let balans = null;
      tekenVoorbeeld();
      const voorbeeld = h(
        'aside',
        { class: 'instel__voorbeeld' },
        kaart(
          { klasse: 'gewvoorbeeld' },
          kaartkop({ tegel: begripOpties('gewicht'), label: t('instellingen.zoZietHetEruit') }),
          h('div', { class: 'instel__groei instel__voorbeeldinhoud' }, zin, grafiekHouder),
        ),
      );

      // ---- De instellingen
      // Streefgewicht: rechts de stand en de knoppen op de lijn van de andere bedieningen; nooit "nog x kg"
      const streefHouder = h('div', { class: 'streefrijen', dataset: { fk: 'streef' } });
      function tekenStreef() {
        const gezet = stand.streef != null;
        const eind = gezet
          ? h(
              'div',
              { class: 'streefbediening' },
              kgStapper({
                waarde: stand.streef,
                label: t('instellingen.streef'),
                veldLabel: t('instellingen.streefVeld'),
                opWijzig: (n, getypt) => {
                  stand.streef = n;
                  streefBewaarder.plan(n);
                  if (getypt) streefBewaarder.nu(); // getypt: meteen bewaren (blur of Enter); met plus en min volgt de opslag na een korte rust
                  tekenVoorbeeld();
                },
              }),
              knop(t('instellingen.streefWissen'), {
                soort: 'secundair',
                opKlik: () => {
                  stand.streef = null;
                  streefBewaarder.plan(null);
                  tekenStreef();
                  tekenVoorbeeld();
                },
              }),
            )
          : h(
              'div',
              { class: 'streefbediening' },
              h('span', { class: 't-gedempt' }, t('instellingen.streefNogNiet')),
              knop(t('instellingen.streefZettenKort'), {
                soort: 'secundair',
                opKlik: () => {
                  stand.streef = laatsteKg?.kg ?? 65;
                  streefBewaarder.plan(stand.streef);
                  tekenStreef();
                  tekenVoorbeeld();
                },
              }),
            );
        streefHouder.replaceChildren(rij({ tegel: begripOpties('streefgewicht'), titel: t('instellingen.streef'), tekst: t('instellingen.streefUitleg'), eind }));
      }
      tekenStreef();

      const lijst = kaart({ klasse: 'instellingen__gewicht' }, kaartkop({ tegel: begripOpties('gewicht'), label: t('tab.gewicht') }), streefHouder);
      const kaarten = [lijst, voorbeeld.firstElementChild];
      if (opent) komOp(kaarten, { stap: 90 });

      const scherm = h('div', { class: 'instelscherm' }, h('div', { class: 'instel__lijst' }, lijst, weetjesVoor('gewicht', ['weegkalender', 'streefgewicht', 'gewicht'])), voorbeeld);
      balans = balanceer(scherm);
      ctx.opruim(balans.stop);
      return h('div', { class: 'stapel stapel--sectie meer-sub' }, schermkop({ titel: t('tab.gewicht'), acties: [terugKnop()] }), scherm);
    },
    { events: [] },
  );
  const stopHaken = haakUitleg(houder, { haken: [['.streefbediening', 'streef-bediening']], toonHet: 'meer/gewicht' });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
