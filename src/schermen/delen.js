// Delen: een verslag van het dagboek over een periode, op het toestel gemaakt, om zelf te delen (bijvoorbeeld met een diëtiste).
// PLAN.md §16.14, BESLISSING 154 en 155. Periode en onderdelen; de keuze van de onderdelen wordt onthouden (delen.onderdelen).
// Route #/delen, met optioneel #/delen/<van>/<tot> (params.van en params.tot), bijvoorbeeld vanuit de week in het Dagboek.
// BESLISSING 300: twee kolommen. Links "Stel je verslag samen" (periode en onderdelen) en "Bewaren of versturen" (Versturen, Pdf bewaren, Afdrukken),
// rechts het verslag als vel papier dat binnenin scrolt en even hoog is als de linkerkolom. Onderaan "Goed om te weten".
import { h } from '../ui/dom.js';
import { kaart, kaartkop, knop, chips, strook, tekstveld, schermkop, tril } from '../ui/componenten.js';
import { eersteToon, komOp, routeHerkomst } from '../ui/beweging.js';
import { beheerScherm } from './hulp.js';
import { t } from '../teksten.js';
import { naarDatum, opmaakDatum, periodeDelen, plusDagen, vandaag, weekStart } from '../kern/datum.js';
import { vorigeWeekPeriode } from '../logica/drinken-week.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { VERSLAG_ONDERDELEN, MAX_DAGEN, begrensPeriode, schoonOnderdelen, leesVerslag, meldVerslagGemaakt, KEUZE_DEZE_WEEK, KEUZE_VORIGE_WEEK } from '../data/verslag.js';
import { bouwVerslagModel, weekVanTitel } from '../ui/verslag-model.js';
import { tekenVel, tekenLeeg } from '../ui/verslag-vel.js';
import { zetPoeder } from '../ui/pdf-tokens.js';
import { begripOpties, begripTegel, ICOON } from '../ui/iconenkaart.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { startRondleiding } from '../uitleg/rondleiding.js';
import { toonHetMe, uitlijnWeetjes } from '../ui/weetjes.js';

const ONDERDELEN = VERSLAG_ONDERDELEN;
// Elk onderdeel met zijn begrip en dus zijn icoontegel en kleur (zoals op Vandaag, in het Dagboek en in het verslag)
const BEGRIP = { eten: 'eten', drinken: 'drinken', gewicht: 'gewicht', notities: 'notitie' };

const GELDIG = /^\d{4}-\d{2}-\d{2}$/;
const SUB = { eten: 'delen.subEten', drinken: 'delen.subDrinken', gewicht: 'delen.subGewicht', notities: 'delen.subNotities' };
const TEL = { eten: ['delen.telMaaltijd', 'delen.telMaaltijden'], drinken: ['delen.telDag', 'delen.telDagen'], gewicht: ['delen.telWeging', 'delen.telWegingen'], notities: ['delen.telNotitie', 'delen.telNotities'] };

// Het aantal per onderdeel in de periode, uit het verslag dat er al is (niets extra opgevraagd); 0 als het onderdeel uit staat.
function aantalPer(verslag, naam) {
  if (!verslag?.onderdelen?.[naam]) return 0;
  if (naam === 'eten') return verslag.dagen.reduce((som, d) => som + (d.eten?.length ?? 0), 0);
  if (naam === 'drinken') return verslag.dagen.filter((d) => d.drinken?.ml > 0).length;
  if (naam === 'gewicht') return verslag.gewicht?.length ?? 0;
  return verslag.dagen.filter((d) => d.notitie).length;
}

export function aantalDagen(van, tot) {
  return Math.round((naarDatum(tot) - naarDatum(van)) / 86400000) + 1;
}

// De periode in woorden: "ma 9 - zo 15 november 2026". Binnen één maand staat de maand er één keer, anders kort (ma 26 okt - zo 1 nov 2026).
// (Nog voor de melding bij een ingekorte periode; het vak met de gekozen periode toont ze voluit, BESLISSING 473.)
function periodeInWoorden(van, tot) {
  const deel = (s) => {
    const [dag, nr, maandKort] = opmaakDatum(s, 'kort').split(' ');
    const [maand, jaar] = opmaakDatum(s, 'maand').split(' ');
    return { dag, nr, maandKort, maand, jaar };
  };
  const a = deel(van);
  const b = deel(tot);
  if (van === tot) return `${a.dag} ${a.nr} ${a.maand} ${a.jaar}`;
  if (a.maand === b.maand && a.jaar === b.jaar) return `${a.dag} ${a.nr} - ${b.dag} ${b.nr} ${b.maand} ${b.jaar}`;
  if (a.jaar === b.jaar) return `${a.dag} ${a.nr} ${a.maandKort} - ${b.dag} ${b.nr} ${b.maandKort} ${b.jaar}`;
  return `${a.dag} ${a.nr} ${a.maandKort} ${a.jaar} - ${b.dag} ${b.nr} ${b.maandKort} ${b.jaar}`;
}
// De periode bij een keuze: deze week is de week van vandaag (maandag tot en met vandaag), twee weken en een maand lopen tot vandaag.
function periodeVoor(keuze, nu = vandaag()) {
  if (keuze === 'gisteren') return { van: plusDagen(nu, -1), tot: plusDagen(nu, -1) };
  if (keuze === 'vandaag') return { van: nu, tot: nu };
  if (keuze === 'week') return { van: weekStart(nu), tot: nu };
  if (keuze === 'vorige') return vorigeWeekPeriode(nu); // BESLISSING 474: de volle vorige week, maandag tot en met zondag
  if (keuze === 'twee') return { van: plusDagen(nu, -13), tot: nu };
  return { van: plusDagen(nu, -29), tot: nu };
}

// Kan dit toestel een bestand delen? (iPhone: ja, desktop-Chrome vaak ook.)
function kanDelen() {
  try {
    const proef = new File([new Uint8Array(1)], 'proef.pdf', { type: 'application/pdf' });
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [proef] });
  } catch {
    return false;
  }
}

function download(bestand) {
  const url = URL.createObjectURL(bestand);
  const a = h('a', { href: url, download: bestand.name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function toon(houder, params = {}) {
  // Een terugknop naar waar ze vandaan kwam (bepaald één keer, zodat hij na een hertekening blijft): Meer of de week in het Dagboek.
  const vorig = routeHerkomst() ?? '';
  const terug = /^dagboek(\/|$)/.test(vorig) ? { naar: '#/' + vorig, tekst: t('tab.dagboek') } : null;
  const opent = eersteToon('delen');
  // Eén bron van waarheid: dit object. Een tik past het aan, het voorbeeld wordt uit dit object getekend en de opslag volgt.
  // Bewaren gebeurt na elkaar (nooit door elkaar) en schrijft telkens de nieuwste stand: de laatste keuze wint altijd.
  let schrijfKetting = Promise.resolve();
  const bewaarOnderdelen = () => {
    schrijfKetting = schrijfKetting.then(() => zetInstelling('delen.onderdelen', { ...staat.onderdelen })).catch(() => {});
  };
  // Delen opent altijd met Vandaag; de periode wordt niet onthouden (de keuze van de onderdelen wel).
  const staat = { keuze: 'vandaag', ...periodeVoor('vandaag'), onderdelen: null, naam: '' };
  if (GELDIG.test(params.van ?? '') && GELDIG.test(params.tot ?? '') && params.van <= params.tot) {
    // R2-03: ook de route is begrensd: hoogstens MAX_DAGEN dagen (de recentste) en niet voorbij vandaag.
    const periode = begrensPeriode({ van: params.van, tot: params.tot }, vandaag());
    staat.van = periode.van;
    staat.tot = periode.tot;
    // De knop in het Dagboek (dag, week of maand): vandaag, gisteren en de huidige week hebben hun eigen keuze, elke andere periode is 'Aangepast'.
    const gelijk = (k) => staat.van === periodeVoor(k).van && staat.tot === periodeVoor(k).tot;
    // Komt de gebruiker van de week en is die week (op een maandag) één dag lang, dan is het 'Deze week'; anders wint 'Vandaag'.
    // Uit de vorige week van het Dagboek: "Vorige week" (BESLISSING 474); een nog eerdere week blijft "Aangepast".
    staat.keuze = (vorig.startsWith('dagboek/week') ? ['week', 'vorige', 'vandaag', 'gisteren'] : ['vandaag', 'gisteren', 'week', 'vorige']).find(gelijk) ?? 'eigen';
  }

  const opruimScherm = beheerScherm(
    houder,
    async (ctx) => {
      staat.onderdelen ??= schoonOnderdelen(await leesInstelling('delen.onderdelen'));
      staat.naam = await leesInstelling('profiel.naam');

      // ---- Het verslag (voorbeeld) en de knoppen; ververst als de periode of de onderdelen veranderen
      const vel = h('div', { class: 'verslagvel', tabindex: 0, 'aria-label': t('delen.jeVerslag') });
      zetPoeder(vel);
      // Kan dit toestel een bestand delen? Dan is Versturen de hoofdknop (deelmenu met Mail, WhatsApp, Messenger); anders Pdf bewaren.
      const kanNaarDelen = kanDelen();
      const stuurKnop = kanNaarDelen ? knop(t('delen.versturen'), { soort: 'primair', icoon: ICOON.delen.naam, uitgeschakeld: true, opKlik: stuur }) : null;
      const bewaarKnop = knop(t('delen.pdfBewaren'), { soort: kanNaarDelen ? 'secundair' : 'primair', icoon: ICOON.bewaren.naam, uitgeschakeld: true, opKlik: bewaar });
      const printKnop = knop(t('delen.afdrukken'), { soort: 'secundair', icoon: ICOON.verslag.naam, uitgeschakeld: true, opKlik: druk });
      const hintTekst = t(kanNaarDelen ? 'delen.deelHint' : 'delen.bewaarHint');
      const hint = h('p', { class: 'delen__hint t-gedempt' }, hintTekst);
      const knoppen = [stuurKnop, bewaarKnop, printKnop].filter(Boolean);
      const knoppenRij = h('div', { class: 'delen__knoppen' }, ...knoppen);
      const hoofdKnop = stuurKnop ?? bewaarKnop;
      const hoofdTekst = hoofdKnop.querySelector('.knop__tekst');
      const hoofdLabel = hoofdTekst.textContent;

      // De pdf wordt vooraf klaargemaakt zodra periode en onderdelen vaststaan, zodat de tik op Versturen meteen kan delen
      // (de browser eist een gebruikershandeling; een await tussen de tik en share() zou die kwijtraken).
      const paginaRegel = h('span', { class: 'delen__paginas', 'aria-live': 'polite' });
      const samenvattingRegel = h('span', { class: 'delen__samenvatting' });
      const aantalAan = () => ONDERDELEN.filter((n) => staat.onderdelen[n]).length;
      // R2-03: de periode die echt in het verslag komt (hoogstens MAX_DAGEN dagen, de recentste, en niet voorbij vandaag); die tonen en delen we.
      const echt = () => begrensPeriode({ van: staat.van, tot: staat.tot }, vandaag());
      const zetSamenvatting = () => {
        const p = echt();
        const n = aantalDagen(p.van, p.tot);
        samenvattingRegel.textContent = `${t(n === 1 ? 'delen.telDag' : 'delen.telDagen', { n })} · ${t(aantalAan() === 1 ? 'delen.telOnderdeel' : 'delen.telOnderdelen', { n: aantalAan() })}`;
      };
      let nummer = 0;
      let laatste = null;
      let klaarBestand = null;
      let bestandVan = null;
      let bestandTot = null;
      let bestandOnderdelen = null; // de onderdelen van het verslag dat klaarligt, voor de medailles (data/badges.js)
      let klaarVoor = -1; // bij welke stand (nummer) het klaargemaakte bestand hoort
      let voorbereiding = null;
      let uitgeklaard = false;
      let ongeldig = false; // R2-04: van na tot; er is dan geen verslag om te delen
      // R2-03: is de gekozen periode te lang, dan zegt een strook welke periode er echt in het verslag komt (eens per keer dat ze te lang wordt).
      let teLang = false;
      const meldTeLang = () => {
        const p = echt();
        const nu = p.van !== staat.van;
        if (nu && !teLang) strook(t('delen.ingekort', { n: MAX_DAGEN, periode: periodeInWoorden(p.van, p.tot) }), { duur: 6000 });
        teLang = nu;
      };
      const zetKnoppen = () => {
        const klaar = !ongeldig && !!klaarBestand && klaarVoor === nummer;
        if (stuurKnop) stuurKnop.disabled = !klaar;
        bewaarKnop.disabled = !klaar;
        printKnop.disabled = !klaar; // Afdrukken drukt de pagina's van de bewaarde pdf af (BESLISSING 574): pas als die er is
        hoofdTekst.textContent = !klaar && velGevuld && !ongeldig ? t('delen.geduld') : hoofdLabel;
        // zonder inhoud zegt de hint waarom de knoppen uit staan
        hint.textContent = laatste && !velGevuld ? t('delen.knoppenLeeg') : hintTekst;
      };
      let velGevuld = false;
      let inhoudVersie = 0; // telt elke nieuwe inhoud van het vel: dan wordt er altijd opnieuw ingedeeld (plaats)
      let plaatsNu = null; // de meting van de kolommen (hieronder), na elke hertekening van het vel
      const heeftInhoud = (v) => v.samenvatting.ingevuldeDagen > 0 || !!v.gewicht?.length;

      async function bereidVoor(verslag, mijn) {
        try {
          const [{ pdfBestand }] = await Promise.all([import('../ui/verslag-pdf.js'), import('../ui/verslag-afdruk.js')]); // de afdruk ligt dan al klaar voor de tik op Afdrukken
          if (mijn !== nummer || uitgeklaard) return;
          const bestand = await pdfBestand(verslag, staat.naam);
          if (mijn !== nummer || uitgeklaard) return; // intussen is de keuze veranderd: dit bestand hoort er niet meer bij
          klaarBestand = bestand;
          klaarVoor = mijn;
          paginaRegel.textContent = bestand.paginas > 1 ? ' · ' + t('delen.paginasKort', { n: bestand.paginas }) : '';
          bestandVan = verslag.van;
          bestandTot = verslag.tot;
          bestandOnderdelen = verslag.onderdelen;
        } catch {
          klaarBestand = null;
          if (mijn === nummer) strook(t('delen.mislukt'));
        }
        zetKnoppen();
      }

      // R5-10: van na tot. Het voorbeeld en "Wat komt erin" tonen dan niets meer van de vorige periode: een leeg vel met dezelfde zin als
      // de strook, lege aantallen en de knoppen uit.
      // Zolang een datumveld focus heeft, blijft het vel staan (de kaarten verspringen niet terwijl ze een datum kiest, BESLISSING 331);
      // het lege vel volgt zodra de focus de datumvelden verlaat en de keuze dan nog altijd van na tot is.
      function toonOngeldig() {
        laatste = null;
        for (const naam of ONDERDELEN) tellers[naam].textContent = '';
        zetKnoppen();
        if (eigenVelden.contains(document.activeElement)) {
          eigenVelden.addEventListener('focusout', () => setTimeout(() => ongeldig && !eigenVelden.contains(document.activeElement) && toonOngeldig()), { once: true });
          return;
        }
        velGevuld = false;
        inhoudVersie += 1;
        tekenLeeg(vel, t('delen.vanNaTot'));
        zetKnoppen();
        plaatsNu?.();
        bijwerkFade();
      }

      async function ververs() {
        if (ongeldig) {
          toonOngeldig();
          return;
        }
        const mijn = ++nummer;
        klaarBestand = null;
        paginaRegel.textContent = '';
        zetSamenvatting();
        zetKnoppen(); // meteen uit (Even geduld): er is nog geen pdf van deze keuze
        clearTimeout(voorbereiding);
        const geenOnderdeel = !ONDERDELEN.some((n) => staat.onderdelen[n]);
        const periode = echt();
        // De gekozen periode gaat mee (BESLISSING 457): "Deze week" is altijd een weekverslag met noemer 7, ook op maandag; "Aangepast" met dezelfde datums niet.
        const verslag = await leesVerslag({ van: periode.van, tot: periode.tot, onderdelen: staat.onderdelen, keuze: { week: KEUZE_DEZE_WEEK, vorige: KEUZE_VORIGE_WEEK }[staat.keuze] ?? staat.keuze });
        if (mijn !== nummer) return;
        laatste = verslag;
        for (const naam of ONDERDELEN) {
          const n = aantalPer(verslag, naam);
          tellers[naam].textContent = n > 0 ? t(TEL[naam][n === 1 ? 0 : 1], { n }) : '';
        }
        if (geenOnderdeel || !heeftInhoud(verslag)) {
          tekenLeeg(vel, geenOnderdeel ? t('delen.geenOnderdeel') : t('delen.leegPeriode'), geenOnderdeel || aantalDagen(periode.van, periode.tot) >= 30 ? null : t('delen.leegTip'));
          velGevuld = false;
          inhoudVersie += 1;
          zetKnoppen();
          plaatsNu?.();
          bijwerkFade();
          return;
        }
        tekenVel(vel, bouwVerslagModel(verslag, staat.naam));
        vel.scrollTop = 0;
        velGevuld = true;
        inhoudVersie += 1;
        zetKnoppen();
        plaatsNu?.();
        bijwerkFade();
        voorbereiding = setTimeout(() => bereidVoor(verslag, mijn), 250);
      }
      ctx.opruim(() => {
        uitgeklaard = true;
        clearTimeout(voorbereiding);
        import('../ui/verslag-afdruk.js').then((m) => m.ruimAfdrukOp()).catch(() => {});
      });

      // De tik op Versturen roept share() rechtstreeks aan, zonder wachten ertussen.
      function stuur() {
        if (!klaarBestand || klaarVoor !== nummer) return;
        navigator
          .share({ files: [klaarBestand], title: t('delen.verslagTitel') })
          .then(() => {
            strook(t('delen.klaarOmTeDelen'));
            meldVerslagGemaakt({ van: bestandVan, tot: bestandTot, onderdelen: bestandOnderdelen }, 'versturen'); // alleen als de share-belofte vervuld is
          })
          .catch((fout) => {
            if (fout?.name !== 'AbortError') strook(t('delen.mislukt')); // zelf gesloten is geen fout
          });
      }
      // BESLISSING 574: Afdrukken stuurt dezelfde pagina's naar de printer als de pdf van Bewaren (zelfde formaat, richting, marges en indeling).
      async function druk() {
        if (!klaarBestand?.afdruk || klaarVoor !== nummer) return;
        try {
          const { drukAf } = await import('../ui/verslag-afdruk.js');
          await drukAf(klaarBestand.afdruk);
        } catch {
          strook(t('delen.mislukt'));
        }
      }
      function bewaar() {
        if (!klaarBestand || klaarVoor !== nummer) return;
        download(klaarBestand);
        meldVerslagGemaakt({ van: bestandVan, tot: bestandTot, onderdelen: bestandOnderdelen }, 'bewaren');
        strook(t('delen.bewaard'));
      }

      // ---- Periode
      // De plaats is er altijd: de periode in woorden en de twee datumvelden staan in dezelfde cel; wat niet aan de beurt is, blijft onzichtbaar
      // maar houdt zijn plaats, zodat de kaart niet verspringt bij Aangepast.
      const eigenVelden = h('div', { class: 'delen__eigen' });
      const woordenDatum = h('span', { class: 'label delen__periodedatum' });
      const woordenDagen = h('span', { class: 'label delen__periodedagen' });
      const woorden = h('p', { class: 'delen__periodewoorden', 'aria-live': 'polite' }, woordenDatum, woordenDagen);
      const tekenEigen = () => {
        eigenVelden.classList.toggle('is-uit', staat.keuze !== 'eigen');
        woorden.classList.toggle('is-uit', staat.keuze === 'eigen');
        const wasOngeldig = ongeldig;
        ongeldig = staat.van > staat.tot;
        if (ongeldig) {
          // de melding als strook: de hint onder de knoppen blijft staan, zodat de kaarten niet verspringen terwijl het datumveld focus heeft
          if (!wasOngeldig) strook(t('delen.vanNaTot'));
          // R2-04: de knoppen uit en het klaargemaakte bestand van de vorige periode weg; een lopende voorbereiding hoort er niet meer bij.
          nummer += 1;
          klaarBestand = null;
          clearTimeout(voorbereiding);
          paginaRegel.textContent = '';
          toonOngeldig();
          return;
        }
        meldTeLang();
        const p = echt();
        // BESLISSING 487: "Deze week" op een maandag toont dezelfde tekst als het voorbeeld ("Week van maandag 16 november 2026", weekVanTitel uit het model)
        const delen = staat.keuze === 'week' && p.van === p.tot ? [weekVanTitel(p.van)] : periodeDelen(p.van, p.tot);
        woordenDatum.replaceChildren(...delen.flatMap((deel, i) => [i ? ' ' : null, h('span', { class: 'delen__periodedeel' }, deel)]).filter(Boolean)); // BESLISSING 473: voluit, breekt alleen na het streepje
        const n = aantalDagen(p.van, p.tot);
        woordenDagen.textContent = t(n === 1 ? 'delen.telDag' : 'delen.telDagen', { n });
      };
      const kies = (keuze) => {
        staat.keuze = keuze;
        if (keuze !== 'eigen') Object.assign(staat, periodeVoor(keuze));
        tekenEigen();
        ververs();
      };
      const veld = (soort) => {
        const input = tekstveld({
          waarde: staat[soort],
          type: 'date',
          label: t('delen.' + soort),
          opWijzig: (w) => {
            if (!GELDIG.test(w)) return;
            staat[soort] = w;
            tekenEigen();
            if (staat.van <= staat.tot) ververs();
          },
        });
        input.max = vandaag(); // R2-03: geen datum na vandaag in de kiezer
        return h('label', { class: 'delen__datum' }, h('span', { class: 'label' }, t('delen.' + soort)), input);
      };
      eigenVelden.append(veld('van'), veld('tot'));
      tekenEigen();

      // Zeven keuzes in een raster van drie (BESLISSING 474): "Aangepast" staat alleen op de laatste rij, over de volle breedte (klasse delen__chip--breed).
      const periodeKeuzes = chips({
        label: t('delen.periode'),
        keuzes: [
          { id: 'vorige', label: t('delen.vorigeWeek') },
          { id: 'gisteren', label: t('delen.gisteren') },
          { id: 'vandaag', label: t('delen.vandaag') },
          { id: 'week', label: t('delen.dezeWeek') },
          { id: 'twee', label: t('delen.tweeWeken') },
          { id: 'maand', label: t('delen.eenMaand') },
          { id: 'eigen', label: t('delen.eigen') },
        ],
        actief: staat.keuze,
        opKies: kies,
      });
      periodeKeuzes.lastElementChild.classList.add('delen__chip--breed');
      const periodeGroep = h(
        'section',
        { class: 'delen__groep delen__periode' },
        h('p', { class: 'label delen__groeplabel' }, t('delen.periode')),
        periodeKeuzes,
        h('div', { class: 'delen__periodevak' }, woorden, eigenVelden),
      );

      // Wat komt erin: vier rijen zoals elders in de app (tegel, naam, onderregel), rechts het aantal in de periode en het vinkvak op de binnenrand.
      // De hele rij is het tikvlak (role checkbox, naam = het onderdeel).
      const tellers = {};
      const optieRij = (naam) => {
        const teller = h('span', { class: 'delen__tel' });
        tellers[naam] = teller;
        const rij = h(
          'button',
          { type: 'button', class: 'rij vinkvak delen__optie licht-op-icoon', role: 'checkbox', 'aria-checked': String(!!staat.onderdelen[naam]), 'aria-label': t('delen.' + naam) },
          begripTegel(BEGRIP[naam]),
          // De titel met rechts het aantal in de periode, en daaronder de onderregel over de volle breedte van de tekstkolom
          h('span', { class: 'rij__tekst' }, h('span', { class: 'delen__titelrij' }, h('span', { class: 'rij__titel' }, t('delen.' + naam)), teller), h('span', { class: 'rij__sub' }, t(SUB[naam]))),
          h('span', { class: 'vinkvak__vak', 'aria-hidden': 'true' }, h('span', { class: 'vinkje' })),
        );
        rij.addEventListener('click', () => {
          const aan = rij.getAttribute('aria-checked') !== 'true';
          rij.setAttribute('aria-checked', String(aan));
          tril();
          staat.onderdelen = { ...staat.onderdelen, [naam]: aan };
          if (!aan) teller.textContent = '';
          bewaarOnderdelen();
          ververs();
        });
        return rij;
      };
      const onderdeelGroep = h(
        'section',
        { class: 'delen__groep delen__onderdelen' },
        h('p', { class: 'label delen__groeplabel' }, t('delen.onderdelen')),
        h('div', { class: 'delen__vinkjes', role: 'group', 'aria-label': t('delen.onderdelen') }, ...ONDERDELEN.map(optieRij)),
      );

      const samenstelKaart = kaart({ klasse: 'delen__samenstel delen__raster kaart--licht-op' }, kaartkop({ tegel: begripOpties('periode'), label: t('delen.samenstellen') }), periodeGroep, onderdeelGroep);
      const bewaarKaart = kaart({ klasse: 'delen__bewaren delen__raster kaart--licht-op' }, kaartkop({ tegel: begripOpties('delen'), label: t('delen.bewarenKop') }), knoppenRij, hint);

      // Het verslag: het vel scrolt binnenin de kaart; een zachte vervaging onderaan zegt dat er meer volgt.
      const velHouder = h('div', { class: 'delen__velhouder' }, vel);
      const bijwerkFade = () => velHouder.classList.toggle('kan-verder', vel.scrollHeight - vel.scrollTop - vel.clientHeight > 2);
      vel.addEventListener('scroll', bijwerkFade, { passive: true });
      if (typeof ResizeObserver === 'function') {
        const waarnemer = new ResizeObserver(bijwerkFade);
        waarnemer.observe(vel);
        ctx.opruim(() => waarnemer.disconnect());
      }
      zetSamenvatting();
      const verslagKaart = kaart(
        { klasse: 'delen__verslag kaart--licht-op' },
        kaartkop({ tegel: begripOpties('verslag'), label: t('delen.jeVerslag'), eind: h('span', { class: 'delen__eind' }, samenvattingRegel, paginaRegel) }),
        velHouder,
      );

      // Goed om te weten: dezelfde opbouw als op Drinken en Gewicht (BESLISSING 297); "Toon het me" start de rondleiding van Delen.
      const weetjesKaart = kaart(
        { klasse: 'delen__weetjes kaart--licht-op' },
        kaartkop({ tegel: begripOpties('delen'), label: t('instellingen.goedOmTeWeten') }),
        h(
          'div',
          { class: 'delen__weetjesrij' },
          // BESLISSING 567: elk weetje een eigen icoon (het verslag, het delen, de keuze), in de familie van Delen
          ...['verslag', 'profiel', 'instellingen'].map((begrip, i) => h('div', { class: 'weetje' }, begripTegel(begrip, { familie: ICOON.delen.familie }), h('p', { class: 'weetje__tekst' }, t(`delen.weetje${i + 1}`)))),
          toonHetMe({ familie: ICOON.delen.familie, opKlik: () => startRondleiding({ sleutel: 'delen' }) }),
        ),
      );

      const rechts = h('div', { class: 'delen__rechts' }, verslagKaart);
      const kaarten = [samenstelKaart, verslagKaart, bewaarKaart, weetjesKaart];
      if (opent) komOp(kaarten, { stap: 90 });
      ververs();

      // In deze volgorde onder elkaar op een telefoon (samenstellen, verslag, bewaren); op een breed scherm plaatst het raster ze in twee kolommen.
      const kolommen = h('div', { class: 'delen__kolommen' }, samenstelKaart, rechts, bewaarKaart);
      const scherm = h(
        'div',
        { class: 'stapel stapel--sectie delen' },
        schermkop({ titel: t('delen.titel'), delen: false, acties: terug ? [knop(terug.tekst, { soort: 'tekst', icoon: ICOON.terug.naam, opKlik: () => (window.location.hash = terug.naar) })] : [] }),
        h('p', { class: 'delen__uitleg' }, t('delen.uitleg')),
        kolommen,
        weetjesKaart,
      );

      // BESLISSING 331: op een breed scherm eindigen beide kolommen op dezelfde lijn en staat er nergens een leeg vlak. Is het vel korter dan de kaart (er blijft
      // meer dan REST_NA px over), dan verhuist "Goed om te weten" naar de rechterkolom, direct onder het verslag, en vult de resterende hoogte; wat rest
      // wordt begrensd verdeeld (CAP: rijhoogte van de weetjes, de ruimte boven en onder hun rij, de ruimte tussen vel en voet, de rijen van de dagtabel).
      // Past dat niet, of is het vel lang, dan staat "Goed om te weten" onderaan over de volle breedte. Gemeten na het tekenen en bij elke wijziging, vóór
      // het eerste zichtbare frame; nooit terwijl een datumveld of de weetjes focus hebben (dan blijft alles staan).
      const breed = window.matchMedia('(min-width: 1100px)');
      const VARS = ['--vel-rij', '--vel-voet', '--vel-kern', '--vel-titel', '--vel-dagen', '--weetje-rek', '--weetjes-boven', '--weetjes-onder'];
      const CAP = { rij: 6, voet: 16, kern: 16, titel: 20, dagen: 16, weetje: 20, boven: 0, onder: 12 }; // boven de weetjesrij niets: het restant wordt gespreid (align-content), zodat die ruimte niet dubbel telt; weetje en onder ruimer, zodat een kort vel naast de weetjes minder oprekt (BESLISSING 517)
      const REST_NA = 100; // vanaf dit restverschil wordt geprobeerd of "Goed om te weten" naast het kleine vel past (de weetjes zelf hebben ± 160 px nodig)
      const MAX_WEETJE = 72;
      const LINKS_MAX = 48; // zoveel mag de linkerkaart hoger worden om de lijn te halen (verdeeld over haar keuzerijen)
      const SPELING_MAX = 64; // zoveel mogen de weetjes in hun kaart te verdelen krijgen
      // Haalt weg wat de tussenlijn zette, vóór er opnieuw gemeten wordt.
      const losLijn = () => {
        samenstelKaart.style.removeProperty('min-height');
        verslagKaart.style.removeProperty('min-height');
        samenstelKaart.querySelectorAll('.delen__vinkjes > *').forEach((r) => r.style.removeProperty('min-height'));
      };
      let rafId = 0;
      let wacht = 0;
      const zetVar = (naam, px) => rechts.style.setProperty(naam, `${px}px`);
      const naarOnder = () => {
        rechts.classList.remove('is-kort', 'is-strak');
        weetjesKaart.classList.remove('delen__weetjes--rij', 'delen__weetjes--raster', 'is-meet');
        if (weetjesKaart.parentNode !== scherm) scherm.append(weetjesKaart);
      };
      // Rekt het vel (rijen en ruimte voor de voet) om `over` px te vullen, begrensd; geeft terug hoeveel er niet in paste.
      const velCap = (rijen) => CAP.rij * rijen + CAP.voet + (vel.querySelector('.verslagvel__cijfers') ? CAP.kern : 0) + CAP.titel + (vel.querySelector('.verslagvel__dagen') ? CAP.dagen : 0);
      // De ruimte die het vel buiten de rijen nog kan krijgen als "Goed om te weten" niet naast het vel past (BESLISSING 562: de linkerkolom is lager, dus
      // de weetjes passen op een middelbreed scherm niet meer naast een vel van zes maaltijden): de ruimte rond de kop, de kerncijfers, de dagtabel en de
      // voet, hoogstens verdubbeld. De rijen blijven bij hun grens (CAP.rij).
      const EXTRA_MAX = 1.5;
      const velBasis = () => CAP.voet + (vel.querySelector('.verslagvel__cijfers') ? CAP.kern : 0) + CAP.titel + (vel.querySelector('.verslagvel__dagen') ? CAP.dagen : 0);
      const velExtra = () => EXTRA_MAX * velBasis();
      const zetVel = (f, e = 0) => {
        zetVar('--vel-rij', CAP.rij * f);
        zetVar('--vel-voet', CAP.voet * (f + e));
        zetVar('--vel-kern', vel.querySelector('.verslagvel__cijfers') ? CAP.kern * (f + e) : 0);
        zetVar('--vel-titel', CAP.titel * (f + e));
        zetVar('--vel-dagen', vel.querySelector('.verslagvel__dagen') ? CAP.dagen * (f + e) : 0);
      };
      const rekVel = (over, rijen) => {
        const cap = velCap(rijen);
        const extra = velExtra();
        const rest = Math.max(0, over - cap);
        zetVel(over > 0 ? Math.min(1, over / cap) : 0, Math.min(EXTRA_MAX, rest / velBasis()));
        return Math.max(0, rest - extra);
      };
      const deelIn = () => {
        VARS.forEach((naam) => rechts.style.removeProperty(naam));
        losLijn();
        naarOnder();
        if (!breed.matches || !velGevuld) return;
        uitlijnWeetjes(weetjesKaart); // het aantal regels van elk weetje (BESLISSING 565), vóór de hoogtes gemeten worden
        const hoogte = rechts.offsetHeight;
        const rijen = vel.querySelectorAll('.verslagvel__rij').length;
        const chrome = verslagKaart.offsetHeight - velHouder.offsetHeight;
        const over = hoogte - chrome - vel.scrollHeight;
        if (over <= 0) return; // een lang verslag: het vel vult de kaart en scrolt, "Goed om te weten" staat onderaan
        // De tussenlijn (eigenaar, 0.5.8): staat "Goed om te weten" rechts onder het verslag, dan eindigen "Stel je verslag samen" en "Je verslag"
        // op dezelfde hoogte, en zijn "Bewaren of versturen" en "Goed om te weten" dus even hoog. De hoogste van de twee bovenste kaarten bepaalt
        // de lijn; de andere wordt opgevuld: het vel met zijn begrensde rek, de linkerkaart met iets hogere keuzerijen. Kan dat niet zonder een leeg
        // vlak, of passen de weetjes niet in de hoogte van de kaart ernaast, dan staat "Goed om te weten" onderaan en vult het vel de rechterkolom.
        let gekozen = null;
        if (over > REST_NA) {
          rechts.classList.add('is-kort');
          rechts.append(weetjesKaart);
          for (const strak of [false, true]) {
            rechts.classList.toggle('is-strak', strak);
            zetVel(0);
            const samenNat = samenstelKaart.offsetHeight;
            const verslagNat = verslagKaart.offsetHeight;
            const bewaarH = bewaarKaart.offsetHeight;
            const doel = Math.max(samenNat, verslagNat);
            const linksRek = doel - samenNat;
            const velRek = doel - verslagNat;
            if (linksRek > LINKS_MAX || velRek > velCap(rijen) + velExtra()) continue;
            for (const vorm of ['rij', 'raster']) {
              weetjesKaart.classList.remove('delen__weetjes--rij', 'delen__weetjes--raster');
              weetjesKaart.classList.add('delen__weetjes--' + vorm, 'is-meet');
              const weetjesH = weetjesKaart.offsetHeight;
              const hoogsteWeetje = Math.max(...[...weetjesKaart.querySelectorAll('.weetje')].map((e) => e.offsetHeight));
              weetjesKaart.classList.remove('is-meet');
              const speling = bewaarH - weetjesH; // wat de weetjes in hun kaart nog te verdelen krijgen (align-content: space-evenly)
              if (speling < -0.5 || speling > SPELING_MAX || hoogsteWeetje > MAX_WEETJE) continue;
              if (!gekozen || speling < gekozen.speling - 0.5) gekozen = { vorm, strak, doel, linksRek, velRek, speling };
            }
            if (gekozen) break;
          }
          if (gekozen) {
            rechts.classList.toggle('is-strak', gekozen.strak);
            weetjesKaart.classList.remove('delen__weetjes--rij', 'delen__weetjes--raster');
            weetjesKaart.classList.add('delen__weetjes--' + gekozen.vorm);
            // Links: de keuzerijen delen wat de kaart hoger wordt.
            if (gekozen.linksRek > 0.3) {
              const keuzes = [...samenstelKaart.querySelectorAll('.delen__vinkjes > *')];
              const hoogtes = keuzes.map((r) => r.offsetHeight);
              keuzes.forEach((r, i) => (r.style.minHeight = `${hoogtes[i] + gekozen.linksRek / keuzes.length}px`));
            }
            samenstelKaart.style.minHeight = `${gekozen.doel}px`;
            // Rechts: het vel rekt tot de kaart de lijn haalt.
            const cap = velCap(rijen);
            let rek = gekozen.velRek;
            for (let ronde = 0; ronde < 4 && rek > 0.3; ronde += 1) {
              zetVel(Math.min(1, rek / cap), Math.min(EXTRA_MAX, Math.max(0, rek - cap) / velBasis()));
              const tekort = gekozen.doel - verslagKaart.offsetHeight;
              if (Math.abs(tekort) < 0.3) break;
              rek += tekort;
            }
            verslagKaart.style.minHeight = `${gekozen.doel}px`;
          }
        }
        if (!gekozen) {
          naarOnder();
          rekVel(over, rijen);
        }
      };
      // Delen-fout van de eigenaar: met de focus in een datumveld of in "Goed om te weten" sloeg plaats() de indeling altijd over, ook na een
      // andere venstermaat of een ander vel; de indeling van de vorige toestand bleef dan staan (een ingeklapte kaart, een vel zonder scrollen)
      // tot een klik elders de focus wegnam. Nu blijft alles alleen staan als er echt niets veranderde (zelfde venstermaat, zelfde vel): zo
      // verspringen de kaarten niet terwijl iemand een datum kiest. Anders altijd opnieuw indelen, met behoud van de focus en de scrollpositie.
      let vorigeStand = '';
      const plaats = () => {
        cancelAnimationFrame(rafId);
        clearTimeout(wacht);
        rafId = 0;
        wacht = 0;
        if (!scherm.isConnected) return;
        const actief = document.activeElement;
        const stand = `${window.innerWidth}x${window.innerHeight}|${inhoudVersie}`;
        const focusBinnen = actief && actief !== document.body && actief.closest?.('.delen__eigen, .delen__weetjes');
        if (focusBinnen && stand === vorigeStand) return;
        vorigeStand = stand;
        const y = window.scrollY;
        deelIn();
        if (focusBinnen && actief.isConnected && document.activeElement !== actief) actief.focus({ preventScroll: true });
        if (window.scrollY !== y) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      };
      const plan = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(plaats);
        wacht = setTimeout(plaats, 120); // een achtergrondtab geeft geen frames: dan toch meten
      };
      if (typeof ResizeObserver === 'function') {
        const maatWaarnemer = new ResizeObserver(plaats); // vóór het eerste zichtbare frame
        maatWaarnemer.observe(kolommen);
        ctx.opruim(() => maatWaarnemer.disconnect());
      }
      breed.addEventListener('change', plan);
      window.addEventListener('resize', plan);
      scherm.addEventListener('focusout', plan);
      scherm.addEventListener('animationend', plan); // na het opkomen van de kaarten (komOp) nog eens meten
      document.fonts?.ready.then(plan);
      ctx.opruim(() => {
        breed.removeEventListener('change', plan);
        window.removeEventListener('resize', plan);
        cancelAnimationFrame(rafId);
        clearTimeout(wacht);
      });
      plaatsNu = plaats;
      return scherm;
    },
    { events: [] },
  );
  const stopHaken = haakUitleg(houder, { haken: [['.delen__periode .chips','delen-periode'],['.delen__vinkjes','delen-onderdelen'],['.verslagvel','delen-voorbeeld'],['.delen__knoppen','delen-knoppen'],['.delen__hint','delen-standaard']] });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
