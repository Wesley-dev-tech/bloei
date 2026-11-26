// Meer · Drinken: dagdoel en de grootte per drank (water is de glasgrootte), in de vaste opbouw van een instelscherm
// (BESLISSING 164): links elke instelling één rij met de bediening rechts op één lijn, rechts "Zo ziet het eruit" dat meebeweegt.
// Het streefgewicht staat in meer-gewicht.js. Elke wijziging bewaart zichzelf en is meteen zichtbaar op Vandaag, Drinken en Gewicht.
import { h } from '../ui/dom.js';
import { kaart, kaartkop, rij, stapper, icoontegel, schermkop } from '../ui/componenten.js';
import { DRANKICOON } from '../ui/beeld.js';
import { weetjesVoor } from '../ui/weetjes.js';
import { drinkWeekKaart } from './weekkaart.js';
import { leesWeekoverzicht } from '../data/statistiek.js';
import { vandaag, weekStart } from '../kern/datum.js';
import { watervulling } from '../ui/watervulling.js';
import { bloeiOp, eersteToon, komOp, telOp } from '../ui/beweging.js';
import { beheerScherm, terugKnop, uitgesteldBewaren } from './hulp.js';
import { t } from '../teksten.js';
import { opmaakLiter, opmaakMl } from '../kern/getal.js';
import { GRENZEN, STANDAARD, leesInstelling, zetInstelling } from '../data/instellingen.js';
import { begripOpties } from '../ui/iconenkaart.js';
import { haakUitleg } from '../ui/uitleghaken.js';

const ANDERE = ['thee', 'koffie', 'sap', 'frisdrank', 'anders'];

export function toon(houder) {
  // Eén bewaarder per instelling; wat nog wacht wordt bij het verlaten van het scherm bewaard.
  const bewaarder = (sleutel) => uitgesteldBewaren((waarde) => zetInstelling(sleutel, waarde));
  const glasBewaarder = bewaarder('drinken.glasMl');
  const doelBewaarder = bewaarder('drinken.dagdoelMl');
  const groottesBewaarder = bewaarder('drinken.groottes');

  // Geen automatische hertekening: de stappers houden hun eigen stand, de opslag volgt.
  const opruimScherm = beheerScherm(
    houder,
    async () => {
      const [glas0, doel0, groottes, overzicht] = await Promise.all([leesInstelling('drinken.glasMl'), leesInstelling('drinken.dagdoelMl'), leesInstelling('drinken.groottes'), leesWeekoverzicht(weekStart(vandaag()))]);
      const stand = { glas: glas0, doel: doel0, groottes: { ...groottes } };
      const opent = eersteToon('meer-instellingen');

      // ---- Zo ziet het eruit: het glas groot zoals op Drinken, de glazen van de dag en de zes dranktegels zoals ze daar staan
      const glas = watervulling({ vulling: 0.65, grootte: 190, label: t('instellingen.voorbeeldGlas') });
      const glazenRij = h('div', { class: 'drinkvoorbeeld__glazen', 'aria-hidden': 'true' });
      const glazenTekst = h('p', { class: 'drinkvoorbeeld__som' });
      const mlLabels = {};
      const tegels = {};
      const dranksoorten = ['water', ...ANDERE];
      const huidigMl = (soort) => (soort === 'water' ? stand.glas : stand.groottes[soort]);
      const drankRij = h(
        'div',
        { class: 'drankrij drinkvoorbeeld__dranken' },
        ...dranksoorten.map((soort) => {
          const ml = h('span', { class: 'drankknop__ml cijfer' }, opmaakMl(huidigMl(soort)));
          mlLabels[soort] = { el: ml, waarde: huidigMl(soort) };
          tegels[soort] = h('div', { class: 'drankknop drankknop--voorbeeld' }, icoontegel(DRANKICOON[soort], 'drank', { groot: true }), h('span', { class: 'drankknop__naam' }, t(soort === 'water' ? 'drank.waterTegel' : 'drank.' + soort)), ml);
          return tegels[soort];
        }),
      );
      // Een stapper links verandert hier meteen: de tegel die verandert bloeit kort op en het getal telt mee
      function tekenVoorbeeld(gewijzigd) {
        // Het dagdoel in kannen, op een halve kan afgerond ("ongeveer 2,5 kannen van 800 ml").
        const kannen = Math.max(0.5, Math.round((stand.doel / stand.glas) * 2) / 2);
        glazenRij.replaceChildren(...Array.from({ length: Math.min(Math.ceil(kannen), 24) }, () => h('span', { class: 'drinkvoorbeeld__glas' })));
        const aantal = t(kannen === 1 ? 'instellingen.kannenEen' : 'instellingen.kannenMeer', { aantal: String(kannen).replace('.', ',') });
        glazenTekst.textContent = t('instellingen.glazenSom', { aantal, glas: opmaakMl(stand.glas), doel: opmaakLiter(stand.doel) });
        for (const soort of dranksoorten) {
          const nu = huidigMl(soort);
          const label = mlLabels[soort];
          if (label.waarde !== nu) {
            telOp(label.el, nu, { van: label.waarde, opmaak: opmaakMl, duur: 400 });
            label.waarde = nu;
            bloeiOp(tegels[soort]);
          }
        }
        if (gewijzigd === 'glas') bloeiOp(glas);
      }
      // Deze week (de weekkaart van Drinken, zoals ze is) volgt het dagdoel dat je links aanpast
      const weekHouder = h('div', { class: 'drinkvoorbeeld__week' });
      const tekenWeek = () => {
        weekHouder.replaceChildren(drinkWeekKaart({ dagen: overzicht.dagen.map((d) => ({ datum: d.datum, ml: d.ml })), doel: stand.doel, vandaag: vandaag() }));
        // Het voorbeeld is geen bediening (BESLISSING 296): de staven zijn hier geen links.
        for (const staaf of weekHouder.querySelectorAll('.weekstaaf')) {
          staaf.removeAttribute('href');
          staaf.tabIndex = -1;
        }
      };
      tekenWeek();
      glazenTekst.textContent = '';
      tekenVoorbeeld();

      const voorbeeld = h(
        'aside',
        { class: 'instel__voorbeeld' },
        kaart(
          { klasse: 'drinkvoorbeeld' },
          kaartkop({ tegel: begripOpties('drinken'), label: t('instellingen.zoZietHetEruit') }),
          h('div', { class: 'instel__groei instel__voorbeeldinhoud' }, h('div', { class: 'drinkvoorbeeld__glasrij' }, glas, h('div', { class: 'drinkvoorbeeld__tekst' }, glazenTekst, glazenRij)), drankRij, weekHouder),
        ),
      );

      // ---- De instellingen: één deel met twee groepen, elke instelling één rij met de bediening rechts
      const groep = (tekst) => h('p', { class: 'label instel__groep' }, tekst);
      const lijst = kaart(
        { klasse: 'instellingen__drinken' },
        kaartkop({ tegel: begripOpties('drinken'), label: t('drinken.titel') }),
        groep(t('instellingen.dagdoel')),
        rij({
          tegel: begripOpties('drinken'),
          titel: t('instellingen.dagdoel'),
          tekst: t('instellingen.dagdoelHint'),
          eind: stapper({
            waarde: stand.doel,
            stap: GRENZEN.dagdoelMl.stap,
            min: GRENZEN.dagdoelMl.min,
            max: GRENZEN.dagdoelMl.max,
            opmaak: opmaakLiter,
            label: t('instellingen.dagdoel'),
            opWijzig: (n) => {
              stand.doel = n;
              doelBewaarder.plan(n);
              tekenVoorbeeld();
              tekenWeek();
            },
          }),
        }),
        groep(t('instellingen.dranken')),
        rij({
          tegel: { naam: DRANKICOON.water, familie: 'drank' },
          titel: t('drank.water'),
          tekst: t('instellingen.glasHint'),
          eind: stapper({
            waarde: stand.glas,
            stap: GRENZEN.glasMl.stap,
            min: GRENZEN.glasMl.min,
            max: GRENZEN.glasMl.max,
            opmaak: opmaakMl,
            label: t('instellingen.glas'),
            opWijzig: (n) => {
              stand.glas = n;
              glasBewaarder.plan(n);
              tekenVoorbeeld('glas');
            },
          }),
        }),
        ...ANDERE.map((soort) =>
          rij({
            tegel: { naam: DRANKICOON[soort], familie: 'drank' },
            titel: t('drank.' + soort),
            eind: stapper({
              waarde: stand.groottes[soort],
              stap: GRENZEN.drankMl.stap,
              min: GRENZEN.drankMl.min,
              max: GRENZEN.drankMl.max,
              // BESLISSING 705: frisdrank begint op 330 ml, naast het raster van 50. Op een raster kom je wel op 500 uit, en de
              // standaardmaat van de drank blijft een halte, zodat je er altijd naar terug kan.
              raster: true,
              stops: [STANDAARD['drinken.groottes'][soort]],
              opmaak: opmaakMl,
              label: t('drank.' + soort),
              opWijzig: (n) => {
                stand.groottes[soort] = n;
                groottesBewaarder.plan({ ...stand.groottes });
                tekenVoorbeeld();
              },
            }),
          }),
        ),
      );

      const kaarten = [lijst, voorbeeld.firstElementChild];
      if (opent) komOp(kaarten, { stap: 90 });

      return h(
        'div',
        { class: 'stapel stapel--sectie meer-sub' },
        schermkop({ titel: t('drinken.titel'), acties: [terugKnop()] }),
        h('div', { class: 'instelscherm' }, h('div', { class: 'instel__lijst' }, lijst, weetjesVoor('drinken', ['drinken', 'badge', 'supplementen'])), voorbeeld),
      );
    },
    { events: [] },
  );
  const stopHaken = haakUitleg(houder, { haken: [['.instellingen__drinken > .rij','dagdoel-rij',0],['.instellingen__drinken > .rij','groottes-groep',1],['.drinkvoorbeeld__glas','drinkvoorbeeld']], toonHet: 'meer/instellingen' });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
