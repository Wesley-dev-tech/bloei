// Meer · Naam en profielfoto (E8), in de vaste opbouw van een instelscherm (BESLISSING 164): links de rijen Naam en Profielfoto met "Goed om te
// weten", rechts "Zo ziet het eruit": de begroeting zoals ze op Vandaag staat, die meetikt terwijl je typt. De naam bewaart zichzelf
// (400 ms na de laatste toets, bij verlaten) en de begroeting op Vandaag volgt meteen. De foto komt uit de camera of de fotorol; zonder foto de initiaal.
import { haakUitleg } from '../ui/uitleghaken.js';
import { h } from '../ui/dom.js';
import { ICOON, begripOpties } from '../ui/iconenkaart.js';
import { kaart, kaartkop, knop, rij, tekstveld, strook, schermkop, beeldmerk, icoontegel } from '../ui/componenten.js';
import { dagdeel, opmaakDatum, vandaag } from '../kern/datum.js';
import { weetjesVoor } from '../ui/weetjes.js';
import { eersteToon, komOp } from '../ui/beweging.js';
import { profielfoto } from '../ui/beeld.js';
import { beheerScherm, terugKnop, uitgesteldBewaren } from './hulp.js';
import { t } from '../teksten.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { bewaarFoto, wisFoto } from '../data/fotos.js';
import { MAX_LENGTE } from '../data/grenzen.js';
import { voornaamVan, groetVoor } from '../logica/naam.js';

const GEEN_FOTO = { soort: 'figuur', nr: 1 }; // de standaardwaarde: toont de initiaal

export function toon(houder) {
  const naamBewaarder = uitgesteldBewaren((naam) => zetInstelling('profiel.naam', naam.trim()));

  const opruimScherm = beheerScherm(houder, async (ctx) => {
    const [naam, avatar] = await Promise.all([leesInstelling('profiel.naam'), leesInstelling('profiel.avatar')]);
    const heeftFoto = avatar?.soort === 'foto' && avatar.fotoId != null;
    const url = heeftFoto ? await ctx.foto(avatar.fotoId, 'klein') : null;

    const invoer = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    invoer.addEventListener('change', async () => {
      const bestand = invoer.files?.[0];
      if (!bestand) return;
      try {
        const oud = heeftFoto ? avatar.fotoId : null;
        const fotoId = await bewaarFoto(bestand);
        await zetInstelling('profiel.avatar', { soort: 'foto', fotoId });
        if (oud != null) await wisFoto(oud);
      } catch (fout) {
        console.error(fout);
        strook(t('algemeen.foutOpslag'));
      }
      invoer.value = '';
    });

    const veld = tekstveld({
      waarde: naam ?? '',
      plaats: t('profiel.naamPlaats'),
      label: t('profiel.naam'),
      opWijzig: (v) => naamBewaarder.plan(v),
    });
    veld.maxLength = MAX_LENGTE.naam;
    veld.addEventListener('blur', () => naamBewaarder.nu());

    const opent = eersteToon('meer-profiel');

    // ---- Zo ziet het eruit: de begroeting zoals op Vandaag (beeldmerk, groet, voornaam in cursief, datum, foto of initiaal), met daaronder de
    // vier vakken van de motivator. Ze beweegt mee met wat je typt.
    // Zonder naam (het veld is leeg): alleen het woord van het moment, zonder komma, en een neutraal icoon in de cirkel.
    const groetKaal = t('begroeting.' + dagdeel(), { naam: '\u0001' }).split('\u0001')[0];
    const groetWoord = h('span', { class: 'profielvoorbeeld__woord' });
    const begroetNaam = h('span', { class: 'profielvoorbeeld__naam' });
    const naamDeel = h('span', { class: 'profielvoorbeeld__naamdeel' });
    const voorbeeldFoto = h('span', { class: 'profielvoorbeeld__foto' });
    const tekenVoorbeeld = (waarde) => {
      const voornaam = voornaamVan(waarde);
      groetWoord.textContent = groetVoor(groetKaal, voornaam);
      begroetNaam.textContent = voornaam;
      naamDeel.replaceChildren(...(voornaam ? [' ', begroetNaam] : [])); // zonder naam staat er niets, ook geen spatie
      voorbeeldFoto.replaceChildren(profielfoto({ url, naam: voornaam, grootte: 64 }));
    };
    tekenVoorbeeld(naam);
    veld.addEventListener('input', () => tekenVoorbeeld(veld.value));
    const vakken = [
      [ICOON.eten.naam, ICOON.eten.familie, t('vandaag.eten'), t('vandaag.etenSamen', { aantal: 0, totaal: 6 })],
      [ICOON.drinken.naam, ICOON.drinken.familie, t('tab.drinken'), '0 l'],
      [ICOON.supplementen.naam, ICOON.supplementen.familie, t('supplementen.kaartLabel'),t('supplementen.momentStand', { genomen: 0, totaal: 3 })],
      [ICOON.stemming.naam, ICOON.stemming.familie, t('dag.stemmingTitel'), '-'],
    ];
    const voorbeeld = h(
      'aside',
      { class: 'instel__voorbeeld' },
      kaart(
        { klasse: 'profielvoorbeeld' },
        kaartkop({ tegel: begripOpties('vandaag'), label: t('instellingen.zoZietHetEruit') }),
        h(
          'div',
          { class: 'instel__groei instel__voorbeeldinhoud' },
          h(
            'div',
            { class: 'profielvoorbeeld__begroeting' },
            h('span', { class: 'profielvoorbeeld__merk', 'aria-hidden': 'true' }, beeldmerk({ variant: 'logo', grootte: 56 })),
            h(
              'div',
              { class: 'profielvoorbeeld__tekst' },
              h('p', { class: 'profielvoorbeeld__groet' }, groetWoord, naamDeel),
              h('p', { class: 'label profielvoorbeeld__datum' }, opmaakDatum(vandaag(), 'lang')),
            ),
            voorbeeldFoto,
          ),
          h(
            'div',
            { class: 'profielvoorbeeld__vakken', 'aria-hidden': 'true' },
            ...vakken.map(([icoon, familie, label, stand]) =>
              h('span', { class: 'profielvoorbeeld__vak' }, icoontegel(icoon, familie, { groot: true, stijl: icoon === ICOON.stemming.naam ? 'regular' : 'solid' }), h('span', { class: 'label' }, ...[].concat(label)), h('span', { class: 'cijfer t-klein t-gedempt' }, stand)),
            ),
          ),
          h('p', { class: 't-klein t-gedempt profielvoorbeeld__uitleg' }, t('profiel.voorbeeldUitleg')),
        ),
      ),
    );

    // ---- De instellingen: elke instelling één rij, de bediening rechts. De foto of de initiaal staat in de rij zelf.
    const fotoKnoppen = h(
      'div',
      { class: 'profiel__knoppen', dataset: { fk: 'profielfoto' } },
      knop(t('profiel.fotoKiezen'), { soort: 'secundair', icoon: ICOON.foto.naam, opKlik: () => invoer.click() }),
      heeftFoto
        ? knop(t('profiel.fotoWeg'), {
            soort: 'tekst',
            opKlik: async () => {
              await zetInstelling('profiel.avatar', GEEN_FOTO);
              await wisFoto(avatar.fotoId);
            },
          })
        : null,
      invoer,
    );
    const lijst = kaart(
      { klasse: 'instellingen__profiel' },
      kaartkop({ tegel: begripOpties('profiel'), label: t('profiel.titel') }),
      rij({ tegel: begripOpties('profiel'), titel: t('profiel.naam'), tekst: t('profiel.naamUitleg'), eind: h('div', { class: 'profiel__naam' }, veld) }),
      rij({ tegel: profielfoto({ url, naam: naam || '', grootte: 40 }), titel: t('profiel.foto'), tekst: t('profiel.fotoUitleg'), eind: fotoKnoppen }),
    );
    if (opent) komOp([lijst, voorbeeld.firstElementChild], { stap: 90 });

    return h(
      'div',
      { class: 'stapel stapel--sectie meer-sub' },
      schermkop({ titel: t('profiel.titel'), acties: [terugKnop()] }),
      h('div', { class: 'instelscherm' }, h('div', { class: 'instel__lijst' }, lijst, weetjesVoor('profiel', ['vandaag', 'foto'])), voorbeeld),
    );
  }, { lichtOp: true });
  const stopHaken = haakUitleg(houder, { haken: [['.profiel__naam', 'profiel-naam'], ['.profiel__knoppen', 'profiel-foto']] });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
