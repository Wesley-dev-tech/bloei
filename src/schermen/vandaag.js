// Tab Vandaag (E1, E11, E12; BESLISSING 137): een koprij met de begroeting en de voortgang van de dag, en daaronder
// Drinken, Eten, Supplementen en Stemming en energie. Op een telefoon zijn Supplementen en Stemming en energie
// gewone kaarten, op elk scherm open (er zijn nergens uitklapmenu's).
// Opgebouwd zoals sectie 02 van de stijlpagina en HUISSTIJL §2, §7 en §9.
import { h } from '../ui/dom.js';
import { icoon, ICOONNAMEN } from '../ui/iconen.js';
import { logo, beeldmerk, chip, kaart, rij, knop, gevoelschaal, energiekiezer, icoontegel, tril, strook, kaartkop, icoonknop } from '../ui/componenten.js';
import { kalender } from '../ui/kalender.js';
import { standVanDag } from '../ui/maandkalender.js';
import { leesAgenda, leesBeurtTijdstippen } from '../data/agenda.js';
import { zetBeurt } from '../ui/beurt.js';
import { watervulling } from '../ui/watervulling.js';
import { DRANKICOON } from '../ui/beeld.js';
import { maaltijdenRijen, eerstvolgendeOpen } from '../ui/maaltijdregel.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { registreerUitleg } from '../uitleg/rondleiding.js';
import { dagBinder, beheerScherm, toonOngedaanMelding, drankErbij, laatsteWeghalen, drinkbaan } from './hulp.js';
import { kiesZin } from '../logica/motivatie.js';
import { voornaamVan, groetVoor } from '../logica/naam.js';
import { schemaVanDag, zetMoment, zetInname, momentVanNu, innameTijdstippen } from '../data/supplementen.js';
import { isSpuit } from '../logica/supplementen.js';
import { standVan } from './momenten.js';
import { isBijgehouden } from '../logica/bijgehouden.js';
import { ICOON, STEMMING_STAP, begripTegel, begripOpties, begripIcoon } from '../ui/iconenkaart.js';
import { magBewegen, eersteToon, komOp, telOp, bloeiOp, vervaag } from '../ui/beweging.js';
import { medaille, badgeVoortgang } from '../ui/medaille.js';
import { ALLE_BADGES, VERBORGEN } from '../logica/badgeregels.js';
import { leesBadges, leesBadgeStats } from '../data/badges.js';
import { luister } from '../kern/bus.js';
import { invoerBezig } from '../kern/invoer.js';
import { installatiestrook } from '../pwa/installatie.js';
import { t, warmeZin } from '../teksten.js';
import { DAGDEEL_UREN, dagdeel, naarSleutel, nuAlsTijd, opmaakDatum, vandaag, weekStart } from '../kern/datum.js';
import { opmaakLiter, opmaakMl } from '../kern/getal.js';
import { leesInstelling } from '../data/instellingen.js';
import { leesDag, zetStemming, zetEnergie } from '../data/dagen.js';
import { bewaarMaaltijd, leesMaaltijden, zetMaaltijdTerug, MAALTIJDSOORTEN } from '../data/maaltijden.js';
import { leesFavorieten, markeerGebruikt, zetFavorietTerug } from '../data/favorieten.js';
import { totaalMl, leesDranken } from '../data/dranken.js';
import { leesReeks, dagStatus, leesWeekoverzicht, leesMaand, leesMomentopname, dagenSindsVorigeUit } from '../data/statistiek.js';

const GEZICHTEN = STEMMING_STAP;

const ga = (pad) => {
  window.location.hash = pad;
};

// BESLISSING 679: de breedte van de begroeting in em (groet rechtop, naam cursief, Cormorant Garamond 500), gemeten op een canvas zodra de letters
// geladen zijn. De css (scherm-vandaag.css) zet er op de telefoon de lettermaat mee, zodat groet en naam op één regel passen. Zonder lettertypes-api
// of canvas (bv. in de unittests) blijft het aantal tekens de schatting.
const DISPLAY = '"Cormorant Garamond"';
function meetBegroeting(el, groet, voornaam) {
  const letters = document.fonts;
  if (!letters?.load) return;
  Promise.all([letters.load(`500 100px ${DISPLAY}`), voornaam ? letters.load(`italic 500 100px ${DISPLAY}`) : null])
    .then(() => {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return;
      ctx.font = `500 100px ${DISPLAY}`;
      let breedte = ctx.measureText(groet + (voornaam ? ' ' : '')).width;
      if (voornaam) {
        ctx.font = `italic 500 100px ${DISPLAY}`;
        breedte += ctx.measureText(voornaam).width;
      }
      if (breedte > 0) el.style.setProperty('--begroet-em', (breedte / 100).toFixed(3));
    })
    .catch(() => {});
}

// Het peil van het vorige tekenen, zodat het water bij een tik zacht stijgt in plaats van te springen.
let vorigeVulling = null;

// De viering van een gehaald doel speelt alleen als het doel nu gehaald wordt, niet bij elk hertekenen.
let viering = false;
// Een moment dat net is afgevinkt, bloeit één keer op in de hertekening die erop volgt.
const netMomentAf = new Set();
// De schrijfacties van de momentrijen, na elkaar (R2-15).
let momentSchrijfrij = Promise.resolve();

export function toon(houder) {
  // De begroeting beweegt alleen bij het openen van het scherm, niet bij elke hertekening na een tik.
  const staat = { stemmingStandaard: undefined, animeer: true, klaar: null, zin: null, getoondDatum: null, getoondDeel: null };
  const stopViering = luister('doel:gehaald', () => (viering = true));

  const opruim = beheerScherm(houder, async () => {
    const datum = vandaag();
    const schrijfDag = dagBinder(datum);
    // Het dagdeel van deze tekening (R2-01, BESLISSING 411): is er invoer bezig, dan blijft dat van de vorige tekening staan, op dezelfde dag; een nieuwe dag gaat meteen door.
    const deel = staat.getoondDeel !== null && staat.getoondDatum === datum && invoerBezig(houder) ? staat.getoondDeel : dagdeel();
    staat.getoondDatum = datum;
    staat.getoondDeel = deel;
    const na = []; // wat na het plaatsen in het scherm beweegt: alleen bij het openen of als iets net klaar raakte
    const opent = staat.animeer && eersteToon('vandaag:kaarten');
    // BESLISSING 735: de tabellen voor reeks, week, kalender, "welkom terug" en badges worden per tekening één keer gelezen (elk een eigen korte
    // transactie) en daarna in het geheugen doorgerekend, in plaats van dezelfde tabellen vele keren apart te lezen.
    const opname = leesMomentopname();
    const [naam, doel, glas, maaltijden, dag, ml, reeks, schema, status, sindsVorige, groottes, dranken, favorieten, week, tijdstippen, rijen] = await Promise.all([
      leesInstelling('profiel.naam'),
      leesInstelling('drinken.dagdoelMl'),
      leesInstelling('drinken.glasMl'),
      leesMaaltijden(datum),
      leesDag(datum),
      totaalMl(datum),
      opname.then((r) => leesReeks(r)),
      schemaVanDag(datum),
      dagStatus(datum),
      opname.then((r) => dagenSindsVorigeUit(datum, r)),
      leesInstelling('drinken.groottes'),
      leesDranken(datum),
      leesFavorieten(),
      opname.then((r) => leesWeekoverzicht(weekStart(datum), r)),
      innameTijdstippen(datum),
      opname,
    ]);

    // De installatiestrook verschijnt alleen op een iPhone in Safari, buiten het beginscherm.
    const installatie = await installatiestrook();
    const [bewaardeBadges, badgeStats] = await Promise.all([leesBadges(), leesBadgeStats(rijen)]);

    // Begroeting: de blikvanger van Vandaag. Het woord van het moment in de gewone tekstkleur, de voornaam als accent in
    // Cormorant cursief, het beeldmerk als rustig merkelement en de datum eronder.
    // Zonder naam: alleen het woord van het moment, zonder komma en zonder aanspreking.
    const voornaam = voornaamVan(naam);
    const groet = groetVoor(t('begroeting.' + deel, { naam: '\u0001' }).split('\u0001')[0], voornaam);
    const begroeting = h(
      'header',
      { class: 'vandaag__begroeting' },
      h('div', { class: 'vandaag__logo' }, logo({ grootte: 28, link: true })),
      h('div', { class: 'begroeting__merk', 'aria-hidden': 'true' }, beeldmerk({ variant: 'logo', grootte: 72 })),
      h(
        'div',
        { class: 'begroeting__tekst' },
        h('h1', { class: 't-hero begroeting__titel' }, h('span', { class: 'begroeting__groet' }, groet), ...(voornaam ? [' ', h('span', { class: 'begroeting__naam' }, voornaam)] : [])),
        h('p', { class: 'label begroeting__datum' }, opmaakDatum(datum, 'lang', new Date(0))), // referentie 1970: het jaar staat er altijd bij
      ),
      // De knop Delen (naar het verslag voor bv. de diëtiste) staat alleen als het icoon bestaat; op een telefoon alleen het icoon.
      ICOONNAMEN.some((n) => n.endsWith('/arrow-up-from-bracket'))
        ? h('a', { class: 'knop knop--secundair begroeting__delen', href: '#/delen', 'aria-label': t('vandaag.delen') }, begripIcoon('delen'), h('span', { class: 'knop__tekst' }, t('vandaag.delen')))
        : null,
      // Algemeen: op een telefoon staat het niet meer in de balk onderaan (vijf tabbladen), maar hier als tandwiel, als laatste knop na Delen.
      // Vanaf 720 px verbergt de css deze knop: op een tablet staat Algemeen weer in de balk en vanaf 960 px in de zijbalk.
      h('a', { class: 'knop knop--secundair begroeting__delen begroeting__instellingen', href: '#/meer', 'aria-label': t('tab.meer') }, begripIcoon('instellingen'), h('span', { class: 'knop__tekst' }, t('tab.meer'))),
    );

    // Het aantal tekens van de begroeting (groet, spatie, naam): de css (scherm-vandaag.css) rekent er de lettermaat mee uit, zodat ze altijd op één regel past.
    begroeting.style.setProperty('--begroet-tekens', String([...(groet + (voornaam ? ' ' + voornaam : ''))].length));
    // BESLISSING 679: op de telefoon rekent de css met de echte breedte van de begroeting (in em), zodra de letters geladen zijn.
    meetBegroeting(begroeting, groet, voornaam);

    // ---- Drinken
    const vulling = doel > 0 ? ml / doel : 0;
    // De salie-vulling en de zin tonen alleen de huidige stand: zakt het totaal onder het doel, dan is het weer water.
    const gehaald = doel > 0 && ml >= doel;
    const vierNu = viering;
    viering = false;
    const standGetal = h('span', { class: 'cijfer-groot__getal' }, opmaakLiter(ml).slice(0, -2));
    if (opent) na.push(() => telOp(standGetal, ml / 1000, { opmaak: (l) => opmaakLiter(l * 1000).slice(0, -2) }));
    const baan = drinkbaan(vorigeVulling ?? vulling, vorigeVulling == null ? gehaald : false);
    if (vorigeVulling != null && vorigeVulling !== vulling) requestAnimationFrame(() => requestAnimationFrame(() => baan.zet(vulling, gehaald)));
    else baan.zet(vulling, gehaald);
    const glasje = watervulling({ vulling: vorigeVulling ?? vulling, gehaald: vorigeVulling == null ? gehaald : undefined, grootte: 168, label: t('drinken.kan') });
    glasje.style.setProperty('--wv-h', 'var(--glas-h)'); // de hoogte van het glas komt uit de CSS en groeit mee op een breed scherm
    if (vorigeVulling != null && vorigeVulling !== vulling) {
      requestAnimationFrame(() => requestAnimationFrame(() => glasje.zet(vulling, gehaald)));
    } else glasje.zet(vulling, gehaald);
    vorigeVulling = vulling;

    const drinken = kaart(
      { klasse: 'drinkkaart vc--drinken' + (vierNu ? '' : ' stil-bloei') },
      h('a', { class: 'kaartkop drinkkaart__label', href: '#/drinken', 'aria-label': t('tab.drinken') }, begripTegel('drinken'), h('span', { class: 'label' }, t('vandaag.drinkenLabel'))),
      h(
        'div',
        { class: 'drinkkaart__rij' },
        h(
          'div',
          { class: 'drinkkaart__links' },
          h('p', { class: 'label' }, t('vandaag.drinkenVandaag')),
          h(
            'div',
            { class: 'drinkkaart__kern' },
            glasje,
        h(
          'div',
          { class: 'drinkkaart__stand' },
          h('p', { class: 'cijfer-groot' }, standGetal, h('span', { class: 'cijfer-groot__eenheid' }, ' ' + t('drinken.liter'))),
          h('p', { class: 't-klein t-gedempt' }, t('drinken.van', { doel: opmaakLiter(doel) })),
          gehaald ? h('p', { class: 'drinkkaart__gehaald t-cursief' }, t('drinken.doel')) : null,
          baan,
          h(
            'div',
            { class: 'laatst' },
            h('p', { class: 'label' }, t('drinken.laatst')),
            dranken.length
              ? h(
                  'div',
                  { class: 'laatst__chips', role: 'list' },
                  ...dranken
                    .slice(-3)
                    .reverse()
                    .map((d) => h('span', { class: 'laatst__chip', role: 'listitem', title: t('drank.' + d.soort), 'aria-label': `${t('drank.' + d.soort)} ${nuAlsTijd(new Date(d.tijdstip))}, ${opmaakMl(d.ml)}` }, icoon(DRANKICOON[d.soort] ?? 'glass-water', { grootte: 16 }), h('span', { 'aria-hidden': 'true' }, `${nuAlsTijd(new Date(d.tijdstip))} · ${opmaakMl(d.ml)}`)))
                )
              : h('p', { class: 'laatst__leeg t-cursief' }, t('drinken.laatstLeeg')),
          ),
        ),
          ),
        ),
      ),
    );
    // De andere dranken als tegels in dezelfde band (alleen vanaf 720 px in beeld): één tik voegt ze toe.
    const actiesEl = h('div', { class: 'drinkkaart__acties' }, ml > 0 ? knop(t('drinken.laatsteWeg'), { soort: 'tekst', icoon: ICOON.ongedaan.naam, opKlik: () => laatsteWeghalen(schrijfDag()) }) : null);
    drinken.querySelector('.drinkkaart__rij').append(
      h(
        'div',
        { class: 'drinkkaart__andere' },
        h('p', { class: 'label' }, t('drinken.andere')),
        h(
          'div',
          { class: 'drankrij' },
          ...['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'].map((soort) =>
            h(
              'button',
              {
                type: 'button',
                class: 'drankknop licht-op-icoon',
                dataset: { soort },
                'aria-label': `${t(soort === 'water' ? 'drank.waterTegel' : 'drank.' + soort)}, ${opmaakMl(soort === 'water' ? glas : groottes[soort])}`,
                onclick: () => {
                  tril();
                  drankErbij(schrijfDag(), soort);
                },
              },
              icoontegel(DRANKICOON[soort], 'drank', { groot: true }),
              h('span', { class: 'drankknop__naam' }, t(soort === 'water' ? 'drank.waterTegel' : 'drank.' + soort)),
              h('span', { class: 'drankknop__ml cijfer' }, opmaakMl(soort === 'water' ? glas : groottes[soort])),
            ),
          ),
        ),
      ),
    );
    drinken.querySelector('.drinkkaart__links').append(actiesEl);
    drinken.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      tril();
      ga('#/drinken');
    });

    // ---- Eten: dezelfde kop als Supplementen (tegel, label en de stand rechts), altijd open
    // BESLISSING 419: een maaltijd opent als blad boven het scherm (ui/maaltijdregel.js); de kaart Eten verandert nooit van hoogte.
    const uitgelicht = eerstvolgendeOpen(maaltijden);
    const ingevuld = status.maaltijdenIngevuld.length;
    const favorietenRij =
      favorieten.length && uitgelicht
        ? h(
            'div',
            { class: 'eten__favorieten' },
            h('span', { class: 'label' }, t('vandaag.favorieten')),
            h(
              'div',
              { class: 'favorietenlijst' },
              ...favorieten.slice(0, 4).map((f) =>
              chip(f.tekst, {
                opKlik: async () => {
                  // BESLISSING 435: meteen invullen, het blad blijft dicht; Ongedaan maken zet maaltijd en favoriet terug zoals ze waren,
                  // op de dag van de tik (niet op de dag van het moment van ongedaan maken, rond middernacht).
                  const dagVanTik = schrijfDag();
                  const eerderMaaltijd = (await leesMaaltijden(dagVanTik))[uitgelicht];
                  const eerderFavoriet = (await leesFavorieten()).find((x) => x.id === f.id);
                  const ingevuld = await bewaarMaaltijd(dagVanTik, uitgelicht, { tekst: f.tekst });
                  await markeerGebruikt(f.id);
                  strook(t('vandaag.favorietIngevuld', { maaltijd: t('maaltijd.' + uitgelicht), tekst: ingevuld?.tekst ?? f.tekst }), {
                    actie: {
                      label: t('algemeen.ongedaan'),
                      opKlik: async () => {
                        await zetMaaltijdTerug(dagVanTik, uitgelicht, eerderMaaltijd);
                        if (eerderFavoriet) await zetFavorietTerug(eerderFavoriet);
                      },
                    },
                  });
                },
              }),
            ),
              favorieten.length > 4 ? chip(t('vandaag.favorietenMeer'), { opKlik: () => ga('#/meer/favorieten') }) : null,
            ),
          )
        : null;
    const eten = kaart(
      { klasse: 'vc--eten etenkaart' },
      kaartkop({ tegel: begripOpties('eten'), label: t('vandaag.eten'), eind: ingevuld > 0 ? h('span', { class: 'cijfer' }, t('vandaag.etenSamen', { aantal: ingevuld, totaal: 6 })) : null }),
      (() => {
        // Twee kolommen van drie (links ontbijt tot middagmaal, rechts vieruurtje tot late snack); een geopende maaltijd groeit in haar eigen kolom.
        const rijen = maaltijdenRijen({ datum, maaltijden, uitgelicht });
        return h('div', { class: 'maaltijden' }, h('div', { class: 'maaltijden__kol' }, ...rijen.slice(0, 3)), h('div', { class: 'maaltijden__kol' }, ...rijen.slice(3)));
      })(),
      favorietenRij,
    );

    // ---- Kalender (BESLISSING 245): de maand van vandaag met het kalenderonderdeel van het Dagboek; bladeren hertekent alleen de kalender.
    // De gekozen maand is een tijdelijke schermstand: bij een dagwissel (of opnieuw openen) staat de kalender weer op de maand van vandaag.
    if (staat.kalDag !== datum) {
      staat.kalDag = datum;
      staat.kalMaand = null;
    }
    const huidigeMaand = datum.slice(0, 7);
    const verschuifMaand = (jm, n) => {
      const [j, m] = jm.split('-').map(Number);
      const d = new Date(j, m - 1 + n, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    let legendaTekens = { klaar: false, spuit: false, beurt: false }; // welke tekens in de getoonde maand voorkomen (BESLISSING 275, 294)
    // Bij het tekenen uit de momentopname van deze tekening; bij het bladeren (blader) vers uit de database.
    const maakKalender = async (jm, opnameRijen) => {
      const gegevens = await leesMaand(jm, opnameRijen);
      const laatsteDag = naarSleutel(new Date(Number(jm.slice(0, 4)), Number(jm.slice(5)), 0));
      const agenda = await leesAgenda(`${jm}-01`, laatsteDag); // geplande beurten van periodieke supplementen, ook op toekomstige dagen
      const beurtenMaand = Object.values(agenda).flat();
      legendaTekens = { klaar: Object.entries(gegevens).some(([d, g]) => d <= datum && standVanDag(g).supplementen === 'vol'), spuit: beurtenMaand.some((x) => x.spuit), beurt: beurtenMaand.some((x) => !x.spuit) };
      for (const [d, lijst] of Object.entries(agenda)) gegevens[d] = { ...(gegevens[d] ?? {}), spuit: lijst };
      return kalender({ jaarMaand: jm, gegevens, navigatie: true, opKies: (d) => ga(d <= datum ? '#/dagboek/dag/' + d : '#/dagboek/maand/' + d) });
    };
    let kalMaand = staat.kalMaand ?? huidigeMaand;
    const kalHouder = h('div', { class: 'kalkaart__raster' }, await maakKalender(kalMaand, rijen));
    // De legenda toont alleen de tekens die in de getoonde maand voorkomen: het salie bolletje (alle supplementen genomen), het spuitje bij een spuit, het supplement-icoon bij een andere beurt.
    // Komt er geen enkel teken voor, dan staat toch het bolletje met zijn uitleg, zodat de kaart niet verspringt.
    const maakLegendaItems = () => [
      legendaTekens.klaar || !(legendaTekens.spuit || legendaTekens.beurt) ? h('span', { class: 'kalkaart__legendaitem' }, h('span', { class: 'kalender__klaar kalender__klaar--legenda', 'aria-hidden': 'true' }), t('vandaag.kalenderLegendaKlaar')) : null,
      legendaTekens.spuit ? h('span', { class: 'kalkaart__legendaitem' }, h('span', { class: 'kalender__spuit is-gepland', 'aria-hidden': 'true' }, begripIcoon('spuit', { grootte: 12 })), t('vandaag.kalenderLegendaSpuit')) : null,
      legendaTekens.beurt ? h('span', { class: 'kalkaart__legendaitem' }, h('span', { class: 'kalender__spuit is-gepland', 'aria-hidden': 'true' }, begripIcoon('supplementen', { grootte: 12 })), t('vandaag.kalenderLegendaBeurt')) : null,
    ].filter(Boolean);
    const kalLegenda = h('p', { class: 'label kalkaart__legenda', 'aria-label': t('vandaag.kalenderLegendaLabel') }, ...maakLegendaItems());
    const kalTitel = h('span', { class: 'label datumkop kalkaart__maand', 'aria-live': 'polite' }, opmaakDatum(kalMaand, 'maand'));
    const dezeMaandKnop = knop(t('vandaag.kalenderDezeMaand'), { soort: 'tekst', opKlik: () => blader(huidigeMaand) });
    dezeMaandKnop.classList.add('kalkaart__terug');
    const zetTerugKnop = () => {
      const uit = kalMaand === huidigeMaand;
      dezeMaandKnop.classList.toggle('is-verborgen', uit);
      dezeMaandKnop.disabled = uit;
      dezeMaandKnop.tabIndex = uit ? -1 : 0;
    };
    zetTerugKnop();
    let kalTekening = 0;
    async function blader(jm) {
      const mijn = ++kalTekening;
      // De gekozen maand geldt meteen, vóór het lezen: een tweede tik bladert vanaf deze maand verder, en een hertekening van het scherm die
      // intussen start, toont deze maand (anders gaat de tik verloren).
      kalMaand = jm;
      staat.kalMaand = jm === huidigeMaand ? null : jm;
      const nieuw = await maakKalender(jm);
      if (mijn !== kalTekening) return; // intussen is er verder gebladerd
      kalHouder.replaceChildren(nieuw);
      kalLegenda.replaceChildren(...maakLegendaItems());
      kalTitel.textContent = opmaakDatum(jm, 'maand');
      zetTerugKnop();
    }
    const kalenderkaart = kaart(
      { klasse: 'vc--kalender kalkaart', 'data-uitleg': 'vandaag-kalender' },
      kaartkop({
        tegel: begripOpties('dagboek'),
        label: t('vandaag.kalender'),
        eind: h(
          'div',
          { class: 'kalkaart__blader' },
          icoonknop('chevron-left', { label: t('maand.vorige'), opKlik: () => blader(verschuifMaand(kalMaand, -1)) }),
          kalTitel,
          icoonknop('chevron-right', { label: t('maand.volgende'), opKlik: () => blader(verschuifMaand(kalMaand, 1)) }),
        ),
      }),
      kalHouder,
      // De betekenis van de tekens onder de dagen, compact: het salie bolletje van een dag met alles genomen en het spuitje van een geplande beurt
      kalLegenda,
      h('div', { class: 'kalkaart__onder' }, h('a', { class: 'label drinkkaart__link kalkaart__link pijllink', href: '#/dagboek/maand/' + huidigeMaand }, t('vandaag.kalenderLink'), h('span', { class: 'pijllink__pijl', 'aria-hidden': 'true' }, begripIcoon('volgende', { grootte: 10 }))), dezeMaandKnop),
    );

    // ---- Supplementen op Vandaag (BESLISSING 150): alleen afvinken dat het moment is ingenomen, geen namen en geen dosis.
    const nuMoment = momentVanNu();
    const momentRijen = schema.momenten.map((m) => {
      const st = standVan(m.items);
      return { sleutel: m.moment, titel: t('supplementen.moment.' + m.moment), items: m.items, genomen: st.genomen, totaal: st.totaal, klaar: st.genomen === st.totaal, nu: m.moment === nuMoment, periodiek: false };
    });
    // BESLISSING 275: op de dag van een geplande beurt staat die beurt als extra rij onder de momenten, in dezelfde vorm en met hetzelfde vinkvak.
    // Alleen de kaart telt ze mee ("3 van 4"); het salie bolletje in Deze week en de motivator blijven van de drie momenten afhangen (219).
    const beurtTijden = await leesBeurtTijdstippen(datum);
    const beurtRijen = schema.periodiek
      .filter((p) => p.geplandVandaag)
      .map((p) => {
        const tijdMs = beurtTijden[p.supplement.id];
        const tijd = tijdMs ? `${new Date(tijdMs).getHours()}.${String(new Date(tijdMs).getMinutes()).padStart(2, '0')}` : null;
        return { sleutel: 'beurt' + p.supplement.id, id: p.supplement.id, titel: p.supplement.naam, hoeveelheid: p.supplement.hoeveelheid ?? '', spuit: isSpuit(p.supplement), tijd, klaar: p.genomen, nu: false, periodiek: true };
      });
    const suppRijen = [...momentRijen, ...beurtRijen];
    const totaalSupp = momentRijen.length;
    const genomenAantal = momentRijen.filter((r) => r.klaar).length;
    const heeftSupp = totaalSupp > 0;
    const kaartTotaal = suppRijen.length;
    const kaartGenomen = suppRijen.filter((r) => r.klaar).length;
    const maakMomentRij = (r) => {
      // BESLISSING 209: geen aantallen per moment; het tijdvak van het moment, en na het afvinken het tijdstip.
      const tot = { ochtend: DAGDEEL_UREN.middag, middag: DAGDEEL_UREN.avond }[r.sleutel];
      const vinkMs = tijdstippen?.[r.sleutel];
      const tijd = vinkMs ? `${new Date(vinkMs).getHours()}.${String(new Date(vinkMs).getMinutes()).padStart(2, '0')}` : null;
      const regel = r.periodiek ? (r.klaar ? (r.tijd ? t(r.spuit ? 'supplementen.gezetOm' : 'supplementen.genomenOm', { tijd: r.tijd }) : t('agenda.afgevinkt')) : r.hoeveelheid) : r.klaar ? (tijd ? t('supplementen.genomenOm', { tijd }) : '') : t('supplementen.tijdvak.' + r.sleutel, { van: DAGDEEL_UREN[r.sleutel], tot });
      const el = h(
        'button',
        { type: 'button', class: ['momentrij vinkvak licht-op-icoon', r.nu && 'is-nu', r.klaar && 'is-klaar'], role: 'checkbox', 'aria-checked': String(r.klaar), disabled: false, dataset: { moment: r.periodiek ? 'beurt' : r.sleutel, ...(r.periodiek ? { beurt: String(r.id) } : {}) } },
        begripTegel(r.periodiek && r.spuit ? 'spuit' : 'supplementen', { groot: true }),
        h(
          'span',
          { class: 'momentrij__tekst' },
          h('span', { class: 'momentrij__naam rij__titel' }, r.titel, r.nu ? h('span', { class: 'momentrij__nu' }, ' · ' + t('supplementen.nuLabel')) : null),
          regel ? h('span', { class: 'rij__sub momentrij__regel' }, regel) : null,
        ),
        h('span', { class: 'vinkvak__vak', 'aria-hidden': 'true' }, h('span', { class: 'vinkje' })),
      );
      if (netMomentAf.delete(r.sleutel) && r.klaar) na.push(() => bloeiOp(el.querySelector('.vinkvak__vak')));
      // De stand wisselt meteen in de rij zelf (R2-15), zoals afvinkrij: een tweede tik vinkt terug uit, en een schermlezer hoort meteen de nieuwe stand.
      let stand = r.klaar;
      el.addEventListener('click', async () => {
        tril();
        stand = !stand;
        const naar = stand;
        el.setAttribute('aria-checked', String(naar));
        if (naar) netMomentAf.add(r.sleutel);
        else netMomentAf.delete(r.sleutel);
        // De dag van deze tik (BESLISSING 203); Ongedaan maken zet dezelfde dag terug (R2-13).
        const dagVanTik = schrijfDag();
        // Tikken schrijven na elkaar: bij een dubbele tik leest de tweede pas als de eerste geschreven is (anders wint de eerste).
        const vorige = momentSchrijfrij;
        let klaar;
        momentSchrijfrij = new Promise((r) => (klaar = r));
        await vorige;
        try {
          if (r.periodiek) {
            await zetBeurt({ datum: dagVanTik, supplementId: r.id, naam: r.titel, genomen: naar });
          } else {
            const eerder = r.items.map((i) => [i.supplement.id, i.genomen]);
            await zetMoment(dagVanTik, r.sleutel, naar);
            strook(naar ? t('supplementen.momentAf', { moment: r.titel }) : t('supplementen.momentTerug', { moment: r.titel }), {
              actie: { label: t('supplementen.ongedaan'), opKlik: async () => { for (const [id, was] of eerder) await zetInname(dagVanTik, id, r.sleutel, was); } },
            });
          }
        } catch (fout) {
          console.error(fout);
        } finally {
          klaar();
        }
      });
      return el;
    };
    const supplementen = kaartTotaal > 0
      ? kaart(
          { klasse: 'vc--supp suppkaart', 'data-uitleg': 'momenten' },
          kaartkop({ tegel: begripOpties('supplementen'), label: t('supplementen.kaartLabel'), eind: h('span', { class: 'cijfer' }, t('supplementen.momentStand', { genomen: kaartGenomen, totaal: kaartTotaal })) }),
          h('div', { class: 'suppmomenten' }, ...suppRijen.map((r) => h('div', { class: 'momentkant' }, maakMomentRij(r)))),
        )
      : null;

    // ---- Stemming en energie: een gewone, altijd open kaart (ook op een telefoon, ook als beide gekozen zijn)
    // BESLISSING 468: de gekozen waarde staat niet nog eens als sierwoord naast het opschrift; de keuze is te zien in de rij eronder (aria-checked op de gekozen knop)
    const stemming = kaart(
      { klasse: 'vc--stemming stemmingkaart' },
      kaartkop({ tegel: begripOpties('stemming'), label: t('vandaag.stemmingEnergie') }),
      h(
        'div',
        { class: 'stemming__inhoud' },
        // Twee gelijke delen: kopregel (de vraag) en een rij van vijf gelijke kolommen met het woord eronder
        h(
          'div',
          { class: 'stemming__deel stemming__vraag' },
          h('div', { class: 'stemming__kop' }, h('p', { class: 'label' }, t('stemming.vraag'))),
          h('div', { class: 'kaart__inhoud', dataset: { fk: 'stemming' } }, gevoelschaal({ soort: 'stemming', waarde: dag.stemming, opKies: (n) => { zetStemming(schrijfDag(), n); } })),
        ),
        h('div', { class: 'stemming__lijn', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'stemming__deel vandaag__energie' },
          h('div', { class: 'stemming__kop' }, h('p', { class: 'label' }, t('energie.titel'))),
          energiekiezer({ waarde: dag.energie, woorden: true, opKies: (n) => { zetEnergie(schrijfDag(), n); } }),
        ),
        // De regel "nog eens tikken wist" houdt haar plek ook als er niets gekozen is, zodat de kaart niet van hoogte verandert
        h('p', { class: ['t-klein t-gedempt dag__wis', dag.stemming == null && dag.energie == null && 'is-leeg'] }, t('dag.wisUitleg')),
      ),
    );

    // ---- De motivator: vier gelijke vakken met de stand van vandaag, de warme zin en de week. Geen score, geen percentage.
    const etenKlaar = ['ontbijt', 'middagmaal', 'avondmaal'].every((soort) => status.maaltijdenIngevuld.includes(soort));
    const naarKaart = (selector) => () => {
      const el = document.querySelector(selector);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    // Eten: de maaltijd die aan de beurt is gaat open met de cursor in het tekstvak (zijn alle zes ingevuld: de laatste), en de regel komt volledig in beeld.
    const etenDoel = uitgelicht ?? [...MAALTIJDSOORTEN].reverse().find((s) => status.maaltijdenIngevuld.includes(s)) ?? MAALTIJDSOORTEN[0];
    const etenActie = () => {
      const regel = document.querySelector('.vc--eten .maaltijd[data-soort="' + etenDoel + '"]');
      if (!regel?.openMetFocus) return;
      regel.openMetFocus();
      requestAnimationFrame(() => regel.scrollIntoView({ behavior: magBewegen() ? 'smooth' : 'auto', block: 'center' }));
    };
    // Stemming: de kaart in beeld, de focus op de gevoelschaal (gekozen gezichtje, anders het middelste), de rij gezichtjes licht één keer op.
    const stemmingActie = () => {
      const kaartEl = document.querySelector('.vc--stemming');
      kaartEl?.scrollIntoView({ behavior: magBewegen() ? 'smooth' : 'auto', block: 'center' });
      const opties = [...(kaartEl?.querySelectorAll('.stemming__vraag .gevoel__optie') ?? [])];
      const doel = opties.find((o) => o.getAttribute('aria-checked') === 'true') ?? opties[Math.floor(opties.length / 2)];
      doel?.focus({ preventScroll: true });
      const schaal = doel?.parentElement;
      if (schaal) bloeiOp(schaal);
    };
    const delen = [
      { sleutel: 'eten', naam: ICOON.eten.naam, familie: ICOON.eten.familie, label: t('vandaag.eten'), stand: t('vandaag.etenSamen', { aantal: ingevuld, totaal: 6 }), tel: { naar: ingevuld, opmaak: (n) => t('vandaag.etenSamen', { aantal: Math.round(n), totaal: 6 }) }, vol: ingevuld > 0, klaar: etenKlaar, actie: etenActie, tik: etenDoel && status.maaltijdenIngevuld.length === 6 ? 'tikEtenKlaar' : 'tikEten' },
      { sleutel: 'drinken', naam: ICOON.drinken.naam, familie: ICOON.drinken.familie, label: t('tab.drinken'), stand: opmaakLiter(ml), tel: { naar: ml / 1000, opmaak: (l) => opmaakLiter(l * 1000) }, vol: ml > 0, klaar: gehaald, actie: () => ga('#/drinken'), tik: 'tikDrinken' },
      heeftSupp
        ? { sleutel: 'supp', naam: ICOON.supplementen.naam, familie: ICOON.supplementen.familie, label: t('tab.supplementen'), stand: t('supplementen.momentStand', { genomen: genomenAantal, totaal: totaalSupp }), tel: { naar: genomenAantal, opmaak: (n) => t('supplementen.momentStand', { genomen: Math.round(n), totaal: totaalSupp }) }, vol: genomenAantal > 0, klaar: genomenAantal === totaalSupp, actie: () => ga('#/supplementen') , tik: 'tikSupp' }
        : null,
      { sleutel: 'stemming', naam: ICOON.stemming.naam, familie: ICOON.stemming.familie, stijl: ICOON.stemming.stijl, label: t('dag.stemmingTitel'), stand: dag.stemming != null ? t('stemming.' + dag.stemming) : '-', vol: dag.stemming != null, klaar: dag.stemming != null, stap: dag.stemming, actie: stemmingActie, tik: 'tikStemming' },
    ].filter(Boolean);
    // Alleen een onderdeel dat klaar raakt terwijl ze kijkt, bloeit kort op; bij het openen van het scherm of een gewone hertekening niet.
    const netKlaar = new Set();
    if (staat.klaar) for (const d of delen) if (d.klaar && !staat.klaar[d.sleutel]) netKlaar.add(d.sleutel);
    staat.klaar = Object.fromEntries(delen.map((d) => [d.sleutel, d.klaar]));
    if (netKlaar.has('drinken')) na.push(() => bloeiOp(baan)); // de baan bloeit één keer op bij het halen van het dagdoel

    const zin = warmeZin(
      kiesZin({
        dagdeel: deel,
        maaltijden: status.maaltijdenIngevuld.length,
        etenKlaar,
        ml,
        doelMl: doel,
        supplementen: status.supplementen,
        stemming: dag.stemming,
        lopendeReeks: reeks.lopendeReeks,
        dagenBijgehouden: reeks.dagenBijgehouden,
        dagenSindsVorige: sindsVorige,
        datum,
        iets: status.bijgehouden,
      }),
      voornaam,
    );
    const zinWisselt = staat.zin != null && staat.zin !== zin; // een nieuwe zin komt zacht op
    staat.zin = zin;

    const KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
    const weekDagen = h(
      'ul',
      { class: 'motiv__week', 'aria-label': t('vandaag.dezeWeek') },
      ...week.dagen.map((d, i) => {
        // Dezelfde definitie als de reeks en de maand (BESLISSING 168, R2-06): ook energie, een notitie of een weging telt.
        const bijgehouden = isBijgehouden({ maaltijden: d.maaltijden, ml: d.ml, innames: d.supplementen?.genomen ?? 0, stemming: d.stemming, energie: d.energie, notitie: d.notitie, weging: d.weging });
        const inhoudDag = [h('span', { class: 'week__bol', 'aria-hidden': 'true' }), h('span', { class: 'week__letter', 'aria-hidden': 'true' }, KORT[i][0].toUpperCase())];
        return h(
          'li',
          { class: ['week__dag', bijgehouden && 'is-bijgehouden', d.datum === datum && 'is-vandaag', d.datum > datum && 'is-toekomst'] },
          d.datum <= datum
            ? h('a', { class: 'week__link', href: '#/dagboek/dag/' + d.datum, 'aria-label': t('algemeen.dagen.' + (i + 1)) + (bijgehouden ? ', ' + t('vandaag.bijgehouden') : '') }, ...inhoudDag)
            : h('span', { class: 'week__link' }, ...inhoudDag),
        );
      }),
    );
    // ---- De badges, compact en zonder druk: de laatst behaalde medaille en de eerstvolgende met haar ring en haar stand. Eén tikbaar blok.
    const behaaldIds = new Set(bewaardeBadges.map((b) => b.id));
    // De twee laatst behaalde medailles (de nieuwste eerst, bij gelijke tijd de hoogste trap), daarnaast de nog te behalen die het dichtst bij zijn; samen altijd vijf.
    // Zijn er te weinig om te behalen, dan vullen eerder behaalde de rij aan.
    const rangVan = (id) => ALLE_BADGES.findIndex((x) => x.id === id);
    const behaaldGesorteerd = [...bewaardeBadges].sort((a, b) => b.behaaldOp - a.behaaldOp || rangVan(b.id) - rangVan(a.id));
    const kandidaten = ALLE_BADGES.filter((b) => !behaaldIds.has(b.id) && !VERBORGEN.includes(b.id))
      .map((b) => ({ id: b.id, voortgang: badgeVoortgang(b.id, badgeStats) }))
      .sort((x, y) => (y.voortgang?.fractie ?? 0) - (x.voortgang?.fractie ?? 0));
    // Het onderste blok volgt één raster (BESLISSING 215): twee vakjes voor Laatst behaald, drie voor Nog te behalen. Nog niets behaald: alle vijf vakjes zijn voor Nog te behalen.
    const aantalLaatst = Math.min(2, behaaldGesorteerd.length);
    const aantalOpen = Math.min(aantalLaatst ? 3 : 5, kandidaten.length);
    const laatstBehaald = behaaldGesorteerd.slice(0, aantalLaatst);
    const aankomend = kandidaten.slice(0, aantalOpen);
    const laatsteBadge = laatstBehaald[0] ?? null;
    let badgeBlok = null;
    if (laatsteBadge || aankomend.length) {
      const datumLang = (ms) => opmaakDatum(naarSleutel(new Date(ms)), 'lang');
      // Alleen de medailles in één rij, zoals de zeven dagen ernaast: geen tekst of getal ernaast. Bij hover, focus of (op een telefoon) een tik zegt een kaartje wat ze betekent.
      const laatsteEls = [];
      const medailles = [];
      for (const b of laatstBehaald) {
        const el = medaille({ badge: b.id, behaald: true, grootte: 'klein', datum: datumLang(b.behaaldOp), uitlegBijHover: true, href: '#/meer/badges' });
        el.classList.add('badgeblok__laatst');
        laatsteEls.push(el);
      }
      for (const m of aankomend) {
        const el = medaille({ badge: m.id, behaald: false, grootte: 'klein', voortgang: m.voortgang?.fractie ?? null, voortgangTekst: m.voortgang?.tekst ?? '', uitlegBijHover: true, href: '#/meer/badges' });
        el.classList.add('badgeblok__volgende');
        medailles.push(el);
      }
      badgeBlok = h(
        'div',
        { class: ['badgeblok', !laatsteBadge && 'badgeblok--zonder-laatst'], role: 'group', 'aria-label': t('badge.blokLabelGroep'), 'data-uitleg': 'badges' },
        laatsteEls.length ? h('div', { class: 'badgeblok__groep badgeblok__groep--behaald' }, h('span', { class: 'label badgeblok__label' }, t('badge.kopBehaald')), h('span', { class: 'badgeblok__paar' }, ...laatsteEls)) : null,
        laatsteEls.length && medailles.length ? h('span', { class: 'badgeblok__scheiding', 'aria-hidden': 'true' }) : null,
        medailles.length ? h('div', { class: 'badgeblok__groep badgeblok__groep--open' }, h('span', { class: 'label badgeblok__label' }, t('badge.kopNog')), h('span', { class: 'badgeblok__paar' }, ...medailles)) : null,
      );
      // De nieuwe medaille schuift zacht op de plaats van de vorige (de viering speelt zelf al; geen extra beweging)
      if (staat.laatsteBadge != null && laatsteBadge && staat.laatsteBadge !== laatsteBadge.id) na.push(() => vervaag(badgeBlok));
      staat.laatsteBadge = laatsteBadge?.id ?? null;
    }

    const dagen = reeks.dagenBijgehouden;
    const voortgang = kaart(
      { klasse: 'voortgang' },
      h(
        'div',
        { class: 'motiv__vakken' },
        ...delen.map((d) => {
          // De ingevulde stemming krijgt de kleur van de gekozen stap, zodat ze even duidelijk gevuld is als de rest.
          // Stemming is geen maaltijdtegel (HUISSTIJL §5.2): een ronde tegel in de zachte kleur van de gekozen stap, of nog niet gekozen een neutrale ronde tegel.
          const isStemming = d.sleutel === 'stemming';
          const tegel = icoontegel(d.stap ? GEZICHTEN[d.stap - 1] : d.naam, d.familie, { groot: true, gedimd: !d.klaar && !isStemming, stijl: d.stijl });
          if (isStemming) tegel.classList.add('tegel--rond');
          if (d.stap) {
            tegel.style.setProperty('--t-bg', `var(--mood-${d.stap}-soft)`);
            tegel.style.setProperty('--t-fg', `var(--mood-${d.stap})`);
          }
          const vak = h(
            'div',
            {
              class: ['voortgang__deel', 'motiv__vak', 'motiv__vak--info', d.vol && 'is-vol', d.klaar && 'is-klaar'],
              dataset: { deel: d.naam },
            },
            h('span', { class: 'motiv__tegel licht-icoon' }, tegel), // klaar herken je aan de volle kleur van de tegel en de stand eronder, niet aan een vinkje
            h('span', { class: 'voortgang__label motiv__naam' }, d.label),
            h('span', { class: 'motiv__stand cijfer' }, d.stand),
          );
          if (opent && d.tel) na.push(() => telOp(vak.querySelector('.motiv__stand'), d.tel.naar, { opmaak: d.tel.opmaak }));
          if (netKlaar.has(d.sleutel)) na.push(() => bloeiOp(vak.querySelector('.motiv__tegel')));
          return vak;
        }),
      ),
      h('p', { class: ['voortgang__zin', 't-cursief', zinWisselt && 'is-wisselt'] }, zin),
      h('div', { class: 'motiv__lijn', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: ['motiv__onder', !laatsteBadge && 'motiv__onder--zonder-laatst'] },
        badgeBlok,
        badgeBlok ? h('span', { class: 'motiv__scheiding', 'aria-hidden': 'true' }) : null,
        h('div', { class: 'motiv__weekvak' }, h('p', { class: 'label' }, t('vandaag.dezeWeek')), weekDagen),
      ),
    );

    // Geen kaart "Weegdag" op het hoofdscherm (BESLISSING 380): de weegdag staat op het tabblad Gewicht.
    staat.animeer = false;
    const scherm = h(
      'div',
      { class: 'vandaag' },
      installatie,
      begroeting,
      h('div', { class: 'vandaag__rij1' }, voortgang, stemming),
      h('div', { class: 'vandaag__rij2' + (supplementen ? '' : ' vandaag__rij2--alleen') }, drinken, supplementen),
      h('div', { class: 'vandaag__rij3' }, eten, kalenderkaart),
    );
    if (opent) {
      // Bij het openen: de begroeting eerst (het beeldmerk bloeit open), dan de kaarten kort na elkaar, de tellers lopen mee.
      komOp([begroeting], { stap: 0 });
      na.push(() => bloeiOp(begroeting.querySelector('.begroeting__merk')));
      komOp([voortgang, stemming, drinken, supplementen, eten, kalenderkaart], { stap: 80, start: 160 });
    }
    requestAnimationFrame(() => na.forEach((f) => f()));
    return scherm;
  }, { events: ['data:gewijzigd', 'instelling:gewijzigd', 'elders:gewijzigd', 'badge:behaald'], lichtOp: true });
  const stopHaken = haakUitleg(houder, {
    haken: [
      ['.drinkkaart .drankrij', 'glas'],
      ['.maaltijd', 'maaltijd'],
      ['.eten__favorieten', 'favorieten'],
      ['.stemming__vraag .kaart__inhoud', 'stemming'],
      ['.vandaag__energie', 'energie'],
      ['.voortgang', 'voortgang'],
      ['.motiv__weekvak', 'week'],
      ['a.begroeting__delen[href="#/delen"]', 'delen'],
    ],
  });
  // Kijkstand: de eerste maaltijdregel openen zonder te focussen of te bewaren; sluiten herstelt alles.
  const stopUitleg = registreerUitleg('vandaag', {
    openMaaltijd: async () => {
      // BESLISSING 419: het invulvenster is een blad; de rondleiding opent het in kijkstand (zonder focus) en sluit het weer.
      const regel = houder.querySelector('.maaltijd');
      const rij = regel?.openKijkstand?.();
      if (!rij) return () => {};
      const hooks = [
        ['.maaltijd__tekst', 'maaltijd-tekst'],
        ['.maaltijd__veld', 'maaltijd-uur'],
        ['.maaltijd__veld[data-fk^="gevoel-"]', 'maaltijd-gevoel'],
        ['.maaltijd__verwijder', 'maaltijd-wis'],
        ['.maaltijd__hart', 'maaltijd-favoriet'],
      ];
      const gezet = hooks.map(([sel, naam]) => {
        const el = rij.querySelector(sel);
        el?.setAttribute('data-uitleg', naam);
        return el;
      });
      const wis = rij.querySelector('.maaltijd__verwijder');
      const wisWasVerborgen = wis?.hidden;
      if (wis) wis.hidden = false;
      return () => {
        gezet.forEach((el) => el?.removeAttribute('data-uitleg'));
        if (wis) wis.hidden = wisWasVerborgen;
        rij.sluit();
      };
    },
    toonOngedaanMelding: async () => toonOngedaanMelding(),
  });
  return () => {
    stopViering();
    stopHaken();
    stopUitleg();
    opruim();
  };
}
