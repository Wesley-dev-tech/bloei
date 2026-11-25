// Tab Meer: een raster van kaarten. Profiel met haar eigen cijfers, thema met echte voorbeeldtegels, badges, favorieten,
// instellingen (dagdoel en glasgrootte direct aan te passen) en Over met het logo. Elke kaart begint met dezelfde kaartkop;
// wat iets toont, is tikbaar naar zijn detail. Op een groot scherm vult het raster de hoogte van het venster.
import { h } from '../ui/dom.js';
import { icoon } from '../ui/iconen.js';
import { kaart, kaartkop, kerncijfer, rij, logo, schermkop, icoontegel, knop, tril } from '../ui/componenten.js';
import { profielfoto } from '../ui/beeld.js';
import { medaille, badgeVoortgang } from '../ui/medaille.js';
import { bloeiOp, eersteToon, komOp, telOp } from '../ui/beweging.js';
import { beheerScherm } from './hulp.js';
import { ALLE_BADGES, VERBORGEN, telBadges } from '../logica/badgeregels.js';
import { t } from '../teksten.js';
import { naarSleutel, opmaakDatum } from '../kern/datum.js';
import { leesInstelling } from '../data/instellingen.js';
import { leesFavorieten } from '../data/favorieten.js';
import { leesBadges } from '../data/badges.js';
import { wisAlles } from '../data/wissen.js';
import { leesStats } from '../data/statistiek.js';
import { leesThemaKeuze, zetThema } from '../thema/thema.js';
// Alleen het versienummer: een import van het hele package.json zet de scripts, alle afhankelijkheden en de auteur in de publieke bundel.
import { version as appVersie } from '../../package.json';
import { begripOpties, begripTegel, begripIcoon, ICOON } from '../ui/iconenkaart.js';
import { haakUitleg } from '../ui/uitleghaken.js';
import { openWatIsNieuw } from '../ui/watisnieuw.js';
import { DEMO } from '../kern/demo.js';

const THEMAS = ['poeder', 'salie', 'nacht', 'auto'];
const ga = (pad) => {
  window.location.hash = pad;
};
const pijl = () => h('span', { class: 'rij__pijl' }, begripIcoon('volgende', { grootte: 16 }));
// Een rustige oproep onderaan een tikbare kaart: de echte link van die kaart (R2-10).
const actie = (tekst, naar) => h('a', { class: 'meer__actie', href: naar }, tekst, begripIcoon('volgende', { grootte: 14 }));

// R2-10: een kaart die als geheel tikbaar is (hetzelfde tikvlak en dezelfde hover- en drukstanden als kaart({ opKlik })), maar zelf geen
// knop: er staan links (medailles) en lijsten in. Toetsenbord en schermlezer gebruiken de ene echte link in de kaart.
// Een tik op een link in de kaart volgt die link zelf; een medaille die op een aanraakscherm haar uitleg opent, stopt de tik zelf.
function tikkaart(opties, naar, ...kinderen) {
  const el = kaart({ ...opties, klasse: `${opties.klasse} kaart--knop` }, ...kinderen);
  // zoals een knop: een gewone pijl als cursor en geen tekstselectie bij een tik
  el.style.cursor = 'default';
  el.style.userSelect = 'none';
  el.style.webkitUserSelect = 'none';
  el.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    tril();
    if (!e.target.closest?.('a[href]')) ga(naar);
  });
  return el;
}

// Alles wissen na twee keer bevragen; daarna is het een nieuw begin en toont het scherm zich opnieuw.
// Eén venster, twee vragen; de tweede knop is eerst 2 seconden uitgeschakeld zodat een dubbele tik niets wist.
// Annuleren (knop, Escape of een tik ernaast) laat alles staan.
function wisAllesMetVraag(opener) {
  // BESLISSING 673: in de demo wist deze knop niets; een kaartje legt uit wat hij in de echte app doet (demo/profiel.js, alleen in de demobouw).
  // De voorwaarde staat hier rechtstreeks (zoals in main.js): alleen zo vervangt de bundelaar ze door een vaste waarde en laat hij demo/profiel.js
  // uit de echte bouw. Met DEMO uit kern/demo.js bleef het bestand er als los stuk in.
  if (import.meta.env.VITE_DEMO === 'true') {
    import('../demo/profiel.js').then((m) => m.toonProfielUitleg(opener));
    return;
  }
  const dlg = h('dialog', { class: 'dialoog dialoog--wis', 'aria-labelledby': 'wis-titel' });
  let timer = null;
  let bezig = false; // het wissen loopt: de dialoog blijft open en niets is nog aan te tikken (zie stap2)
  const sluit = () => {
    if (bezig) return;
    clearTimeout(timer);
    if (dlg.open) dlg.close();
    dlg.remove();
    if (opener?.isConnected) opener.focus?.();
  };
  const toon = (titel, tekst, ja, opJa, vertraagd) => {
    const nee = knop(t('wissen.nee'), { soort: 'secundair', breed: true, opKlik: sluit });
    const jaKnop = knop(ja, { soort: 'primair', breed: true, uitgeschakeld: vertraagd, opKlik: opJa });
    if (vertraagd) timer = setTimeout(() => { jaKnop.disabled = false; }, 2000);
    dlg.replaceChildren(
      h('div', { class: 'dialoog__blad' }, h('h2', { class: 't-h2 dialoog__titel', id: 'wis-titel' }, titel), h('p', { class: 'dialoog__tekst' }, tekst), h('div', { class: 'dialoog__acties' }, jaKnop, nee)),
    );
    nee.focus();
  };
  const stap2 = () =>
    toon(t('wissen.titel2'), t('wissen.vraag2'), t('wissen.ja'), async () => {
      // Het afmelden bij de meldingsdienst gebeurt na het leegmaken en kan tot 7 seconden duren (wissen.js). Zolang wisAlles loopt, blijft de modale
      // dialoog open met haar knoppen uitgeschakeld: de rest van de app is zo inert en niets wat nog getikt wordt (een thema, een drank) overleeft de wis.
      // Escape en een tik naast de dialoog doen dan niets (sluit kijkt naar bezig).
      if (bezig) return;
      bezig = true;
      clearTimeout(timer);
      dlg.setAttribute('aria-busy', 'true');
      for (const b of dlg.querySelectorAll('button')) b.disabled = true;
      try {
        await wisAlles();
      } catch (fout) {
        // Mislukt de transactie, dan is er niets gewist (wissen.js): de dialoog gaat dicht en alles blijft staan.
        bezig = false;
        sluit();
        throw fout;
      }
      // BESLISSING 277: de app start opnieuw, op het welkomscherm, met niets in het geheugen van de vorige sessie.
      window.location.hash = '#/welkom';
      window.location.reload();
    }, true);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); sluit(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) sluit(); });
  document.body.append(dlg);
  toon(t('wissen.titel'), t('wissen.vraag1'), t('wissen.doorgaan'), stap2, false);
  dlg.showModal();
  dlg.querySelector('.knop--secundair').focus();
}

// Een miniatuur van een thema, in de kleuren van dat thema: een balk met een accentpunt en twee lijnen, en een kaartstrook.
// Poeder gebruikt de merktokens (het kan niet binnen een ander thema herdefinieerd worden); Salie en Nacht scopen op data-theme.
function themaVoorbeeld(id) {
  const deel = (klasse, attrs = {}) =>
    h('div', { class: ['themavoorbeeld', klasse], ...attrs }, h('span', { class: 'themavoorbeeld__balk' }, h('i'), h('b'), h('b')), h('span', { class: 'themavoorbeeld__strook' }));
  if (id === 'auto') {
    return h('div', { class: 'themavoorbeeld themavoorbeeld--auto', 'aria-hidden': 'true' }, deel('themavoorbeeld--poeder'), deel('themavoorbeeld--nacht', { 'data-theme': 'nacht' }));
  }
  return deel('themavoorbeeld--' + id, id === 'poeder' ? { 'aria-hidden': 'true' } : { 'data-theme': id, 'aria-hidden': 'true' });
}

// Het thema dat net gekozen is: de nieuwe tegel bloeit na het hertekenen één keer op.
let net = null;
function themategel(id, actief, opKies) {
  const el = h(
    'button',
    { type: 'button', class: ['themategel', actief && 'is-actief'], 'aria-pressed': String(actief) },
    themaVoorbeeld(id),
    h('span', { class: 'themategel__naam' }, t('thema.' + id)),
  );
  el.addEventListener('click', () => {
    net = id;
    opKies(id);
  });
  if (net === id && actief) {
    net = null;
    bloeiOp(el);
  }
  return el;
}

export function toon(houder) {
  const opruimScherm = beheerScherm(houder, async (ctx) => {
    const [naam, avatar, keuze, favorieten, badges, stats] = await Promise.all([
      leesInstelling('profiel.naam'),
      leesInstelling('profiel.avatar'),
      leesThemaKeuze(),
      leesFavorieten(),
      leesBadges(),
      leesStats(),
    ]);
    const fotoUrl = avatar?.soort === 'foto' ? await ctx.foto(avatar.fotoId, 'klein') : null;
    const weergaveNaam = String(naam ?? '').trim(); // zonder naam: geen naam in de kaart en een neutraal icoon in de cirkel
    const opent = eersteToon('meer');

    // ---- Profiel: foto of initiaal, naam en haar eigen cijfers (geen oordeel, geen percentages)
    const cijfers = [
      kerncijfer({ label: t('meer.statDagen'), waarde: stats.dagenBijgehouden }),
      kerncijfer({ label: t('meer.statReeks'), waarde: stats.lopendeReeks }),
      kerncijfer({ label: t('meer.statBehaald'), waarde: badges.length }),
    ];
    const profiel = tikkaart(
      { klasse: 'meer__profiel' },
      '#/meer/profiel',
      kaartkop({ tegel: begripOpties('profiel'), label: t('meer.profiel') }),
      h(
        'div',
        { class: 'meer__profielrij' },
        profielfoto({ url: fotoUrl, naam: weergaveNaam, grootte: 72 }),
        h('div', { class: 'meer__profieltekst' }, weergaveNaam ? h('p', { class: 't-h2' }, weergaveNaam) : null, h('p', { class: 't-klein t-gedempt' }, h('a', { href: '#/meer/profiel' }, t('vandaag.profiel')))),
        pijl(),
      ),
      h('div', { class: 'meer__cijfers meer__stats' }, ...cijfers),
    );

    // ---- Thema: echte voorbeeldtegels, een tik wisselt meteen
    const thema = kaart(
      { klasse: 'meer__themakaart kaart--licht-op' },
      kaartkop({ tegel: begripOpties('thema'), label: t('thema.titel') }),
      h('div', { class: 'meer__thema themategels', role: 'group', 'aria-label': t('thema.titel'), dataset: { fk: 'thema' } }, ...THEMAS.map((id) => themategel(id, id === keuze, (nieuw) => zetThema(nieuw)))),
      h('p', { class: 't-klein t-gedempt meer__uitleg' }, t('meer.themaUitleg')),
    );

    // ---- Badges (medailles): de laatst behaalde groot met bijschrift, de eerstvolgende gedempt met haar ring, één rij kleine van de rest
    const behaald = new Map(badges.map((b) => [b.id, b]));
    const zichtbaar = ALLE_BADGES.filter((b) => !VERBORGEN.includes(b.id) || behaald.has(b.id));
    const laatst = [...badges].sort((a, b) => b.behaaldOp - a.behaaldOp)[0] ?? null;
    const datumTekst = (b) => opmaakDatum(naarSleutel(new Date(b.behaaldOp)), 'lang');
    const laatsteMedaille = laatst ? medaille({ badge: laatst.id, behaald: true, datum: datumTekst(laatst), grootte: 'groot', bijschrift: true, uitlegBijHover: true, href: '#/meer/badges' }) : null;
    // De eerstvolgende medailles met hun echte voortgang: samen met de laatst behaalde drie naast elkaar (zonder behaalde: de eerste drie)
    const komende = zichtbaar.filter((b) => !behaald.has(b.id)).slice(0, laatst ? 2 : 3).map((b) => {
      const v = badgeVoortgang(b.id, stats);
      return { v, medaille: medaille({ badge: b.id, behaald: false, voortgang: v?.fractie ?? 0, voortgangTekst: v?.tekst, grootte: 'groot', bijschrift: true, uitlegBijHover: true, href: '#/meer/badges' }) };
    });
    // Alle badges behaald: er is geen "Volgende"; de medaille staat dan naast haar tekst, met een regel die het zegt.
    const alleBehaald = Boolean(laatst) && komende.length === 0;
    if (alleBehaald) laatsteMedaille.append(h('span', { class: 'medaille-bijschrift__regel t-klein t-gedempt meer__allebehaald' }, t('meer.alleBehaald', { aantal: telBadges(badges.map((b) => b.id)).totaal })));
    const labeld = (tekst, el) => h('div', { class: 'meer__medailleplek' }, h('p', { class: 'label meer__medaillelabel' }, tekst), el);
    // Zoveel kleine medailles als in de kaart passen (gemeten aan de breedte van de rij zelf, ook als de kaart in een smalle kolom staat); de rest als "+ x", nooit buiten de kaart
    const alleAnderen = badges.filter((b) => b.id !== laatst?.id).sort((a, b) => b.behaaldOp - a.behaaldOp);
    const kleine = alleAnderen.slice(0, 14).map((b) => medaille({ badge: b.id, behaald: true, datum: datumTekst(b), grootte: 'klein', uitlegBijHover: true, href: '#/meer/badges' }));
    const restTeken = h('span', { class: 'meer__rest cijfer' });
    if (kleine.length) kleine.push(restTeken);
    const kleineRij = kleine.length ? h('div', { class: 'meer__kleinemedailles' }, ...kleine) : null;
    const pasMedailles = () => {
      const breedte = kleineRij.clientWidth;
      if (!breedte) return;
      const medailles = kleine.filter((e) => e !== restTeken);
      for (const e of kleine) e.classList.remove('is-weg');
      const gat = parseFloat(getComputedStyle(kleineRij).columnGap) || 8;
      const w = medailles[0].getBoundingClientRect().width || 52;
      // vanaf 1440 px blijft het zoals het was: hoogstens 7 kleine medailles, ook als er meer in de kaart passen
      let k = Math.min(medailles.length, window.innerWidth >= 1440 ? 7 : 14, Math.floor((breedte + gat) / (w + gat)));
      for (; k > 1; k--) {
        const rest = alleAnderen.length - k;
        restTeken.textContent = rest > 0 ? '+ ' + rest : '';
        if (rest <= 0 || k * (w + gat) + restTeken.getBoundingClientRect().width <= breedte + 0.5) break;
      }
      const rest = alleAnderen.length - k;
      restTeken.textContent = rest > 0 ? '+ ' + rest : '';
      restTeken.setAttribute('aria-label', rest > 0 ? t('meer.nogMeer', { aantal: rest }) : '');
      restTeken.classList.toggle('is-weg', rest <= 0);
      medailles.forEach((e, i) => e.classList.toggle('is-weg', i >= k));
    };
    // R2-17: elke waarnemer wordt losgekoppeld bij het verlaten of bij een nieuwe tekening
    const waarneem = (el, fn) => {
      if (!el || typeof ResizeObserver !== 'function') return;
      const waarnemer = new ResizeObserver(fn);
      waarnemer.observe(el);
      ctx.opruim(() => waarnemer.disconnect());
    };
    waarneem(kleineRij, pasMedailles);
    const badgeKaart = tikkaart(
      { klasse: 'meer__badges' },
      '#/meer/badges',
      kaartkop({ tegel: begripOpties('badge'), label: t('meer.badges'), eind: t('meer.badgeTelling', { aantal: telBadges(badges.map((b) => b.id)).behaald, totaal: telBadges(badges.map((b) => b.id)).totaal }) }),
      laatsteMedaille || komende.length
        ? h('div', { class: ['meer__medailles', alleBehaald && 'meer__medailles--alles'] }, laatsteMedaille ? labeld(t('meer.laatstBehaald'), laatsteMedaille) : null, ...komende.map((k, i) => labeld(i === 0 ? t('meer.volgendeBadge') : ' ', h('div', { class: 'meer__volgende' }, k.medaille))))
        : h('p', { class: 't-cursief meer__leeg' }, t('meer.nogGeenBadge')),
      kleineRij,
      actie(t('meer.alleBadgesTonen'), '#/meer/badges'),
    );

    // ---- Favorieten: de eerste vier, en een duidelijke weg naar toevoegen en beheren
    // Rijen over de volle breedte: de bewaarde favorieten (hoogstens 4), met minder dan 3 aangevuld met de stappen van "hoe het werkt"
    const favRij = (tegel, titel, sub, klasse, eind) =>
      h('li', { class: ['meer__favrij', klasse] }, tegel, h('span', { class: 'meer__favtekst' }, h('span', { class: 'rij__titel' }, titel), h('span', { class: 'rij__sub' }, sub)), eind || null);
    const stapTeksten = [
      [t('meer.favorietStap1'), t('meer.favorietStap1b')],
      [t('meer.favorietStap2'), t('meer.favorietStap2b')],
      [t('meer.favorietStap3'), t('meer.favorietStap3b')],
    ];
    const stappen = stapTeksten.map(([titel, sub], i) =>
      favRij(icoontegel(['heart', 'pen', 'utensils'][i], ICOON.favoriet.familie, { stijl: i === 0 ? 'regular' : 'solid' }), titel, sub, 'meer__favrij--hoe'),
    );
    // De kaart toont minstens de eerste vier favorieten (met minder dan 3 aangevuld met de stappen van "hoe het werkt"); staat ze naast Badges in een rij
    // (720 tot 1440 px), dan verdeelt pasFavorieten de beschikbare hoogte in rijen van 64 tot 80 px: nooit een uitgerekte rij en geen leeg vlak.
    const favoriet = (f) => favRij(icoontegel('utensils', ICOON.favoriet.familie, { stijl: 'solid' }), f.tekst, t('meer.favorietSub'), null, h('span', { class: 'rij__pijl' }, begripIcoon('volgende', { grootte: 16 })));
    const basis = Math.min(4, favorieten.length) + Math.max(0, 3 - favorieten.length);
    // eerst de favorieten (hoogstens 8), dan de stappen: de eerste (3 min het aantal favorieten) staan altijd, de rest alleen als er plek is
    const favorietRijen = [...favorieten.slice(0, 8).map(favoriet), ...stappen];
    const favorietRest = h('span', { class: 'meer__voetrest t-gedempt' });
    const favorietVoet =
      favorieten.length === 0
        ? h('span', { class: 'meer__actie meer__voet' }, h('a', { class: 'meer__link meer__link--plus', href: '#/meer/favorieten' }, begripIcoon('toevoegen', { grootte: 14 }), t('meer.favorietToevoegen')))
        : h('span', { class: 'meer__actie meer__voet' }, h('a', { class: 'meer__link', href: '#/meer/favorieten' }, t('meer.alleFavorieten'), begripIcoon('volgende', { grootte: 14 })), favorietRest);
    const favorietLijst = h('ul', { class: 'meer__favrijen' }, ...favorietRijen);
    const aantalFav = Math.min(favorieten.length, 8);
    const pasFavorieten = () => {
      const tweeKolommen = typeof matchMedia === 'function' && matchMedia('(min-width: 720px) and (max-width: 1439.98px)').matches;
      const hoogte = favorietLijst.clientHeight;
      let k = basis; // het aantal getoonde rijen: de eerste k van de favorieten gevolgd door de stappen
      if (tweeKolommen && hoogte > 0) k = Math.max(Math.min(3, favorietRijen.length), Math.min(favorietRijen.length, Math.floor((hoogte + 0.5) / 64)));
      favorietRijen.forEach((r, i) => r.classList.toggle('is-weg', i >= k));
      const rest = favorieten.length - Math.min(k, aantalFav);
      favorietRest.textContent = rest > 0 ? t('meer.favorietenNog', { aantal: rest }) : '';
    };
    pasFavorieten();
    waarneem(favorietLijst, pasFavorieten);
    const favorietenKaart = tikkaart(
      { klasse: 'meer__favorieten' },
      '#/meer/favorieten',
      kaartkop({ tegel: begripOpties('favoriet'), label: t('meer.favorieten'), eind: t('meer.bijFavorieten', { aantal: favorieten.length }) }),
      favorietLijst,
      favorietVoet,
    );

    // ---- Instellingen: vier gelijke rijen naar hun eigen scherm (BESLISSING 162)
    const instellingen = kaart(
      { klasse: 'meer__menu kaart--licht-op' },
      kaartkop({ tegel: begripOpties('instellingen'), label: t('meer.instellingenKop') }),
      rij({
        tegel: begripOpties('drinken', { familie: 'neutraal' }),
        titel: t('drinken.titel'),
        tekst: t('meer.drinkenSub'),
        eind: pijl(),
        opKlik: () => ga('#/meer/instellingen'),
      }),
      rij({
        tegel: begripOpties('gewicht', { familie: 'neutraal' }),
        titel: t('tab.gewicht'),
        tekst: t('meer.gewichtSub'),
        eind: pijl(),
        opKlik: () => ga('#/meer/gewicht'),
      }),
      rij({
        tegel: begripOpties('herinneringen'),
        titel: t('meldingen.titel'),
        tekst: t('meldingen.rijSub'),
        eind: pijl(),
        opKlik: () => ga('#/meer/meldingen'),
      }),
      rij({
        tegel: begripOpties('vergrendeling'),
        titel: t('slot.titel'),
        tekst: DEMO ? t('demo.slotUit') : t('meer.slotSub'),
        eind: pijl(),
        opKlik: () => ga('#/meer/vergrendeling'),
      }),
      rij({
        tegel: begripOpties('uitleg'),
        titel: t('meer.uitlegTitel'),
        tekst: t('meer.uitlegRij'),
        eind: pijl(),
        opKlik: () => ga('#/meer/uitleg'),
      }),
    );

    // ---- Over: het logo, een korte beschrijving en wie het maakte
    const over = kaart(
      { klasse: 'over kaart--licht-op' },
      kaartkop({ tegel: begripOpties('uitleg'), label: t('meer.over') }),
      h('div', { class: 'over__logo' }, logo({ grootte: 32 })),
      h('p', { class: 'over__tekst' }, t('meer.overTekst')),
      h('p', { class: 't-klein t-gedempt over__liefde' }, t('meer.gemaaktDoor'), ' ', h('span', { class: 'over__hart', 'aria-hidden': 'true' }, begripIcoon('favoriet', { grootte: 12 }))),
      h('p', { class: 't-klein t-gedempt over__liefde' }, t('meer.rechten', { c: String.fromCharCode(0xa9) })),
      // BESLISSING 427 en 436: de versie en, ernaast op dezelfde regel, de licenties van de meegeleverde onderdelen
      // (public/licenties-derden.txt, in een nieuw tabblad). Eén regel, zodat de kaart niet hoger wordt dan haar buur.
      h(
        'p',
        { class: 't-klein t-gedempt over__licenties' },
        h('span', { class: 'cijfer over__versie' }, t('meer.versieTekst', { versie: appVersie })),
        h('span', { class: 'over__punt', 'aria-hidden': 'true' }, ' - '),
        h('a', { href: './licenties-derden.txt', target: '_blank', rel: 'noopener' }, t('meer.licentiesLink')),
      ),
      // BESLISSING 701: "Wat is er nieuw" (dezelfde lijst die na een update één keer vanzelf opengaat) en Alles wissen staan samen op de
      // onderste regel van de kaart. Op een breed scherm naast elkaar: de kaart wordt er geen regel hoger van en blijft even hoog als
      // "Jouw instellingen" ernaast. Op een telefoon onder elkaar, zoals de wisknop er altijd stond.
      // Alles wissen: rustig onderaan, met twee bevestigingen (privacy: ze kan haar gegevens altijd van dit toestel halen).
      h(
        'div',
        { class: 'over__acties' },
        Object.assign(knop(t('watnieuw.knop'), { soort: 'tekst', icoon: ICOON.uitleg.naam, opKlik: () => openWatIsNieuw() }), { className: 'knop knop--tekst over__nieuw' }),
        Object.assign(knop(t('wissen.knop'), { soort: 'tekst', icoon: ICOON.verwijderen.naam, opKlik: (e) => wisAllesMetVraag(e.currentTarget) }), { className: 'knop knop--tekst knop--wis' }),
      ),
    );

    // ---- Privacy: wat de app met je gegevens doet, in zes korte regels (BESLISSING 339)
    const privacyRegels = [
      ['home', t('privacy.regel1')],
      ['herinneringen', t('privacy.regel2')],
      ['weer', t('privacy.regel6')], // de tweede dienst waarmee de app verbindt: de weerdienst, naast die van de herinneringen
      ['verslag', t('privacy.regel3')],
      ['profiel', t('privacy.regel4')], // BESLISSING 567: niet het slotje van de kaartkop
      ['verwijderen', t('privacy.regel5')],
    ];
    const privacy = kaart(
      { klasse: 'privacy' },
      kaartkop({ tegel: begripOpties('vergrendeling'), label: t('privacy.titel') }),
      h(
        'div',
        { class: 'privacy__regels' },
        h('ul', { class: 'privacy__lijst' }, ...privacyRegels.map(([begrip, tekst]) => h('li', { class: 'weetje' }, begripTegel(begrip, { familie: 'neutraal' }), h('p', { class: 'weetje__tekst' }, tekst)))),
      ),
    );

    const kaarten = [profiel, thema, badgeKaart, instellingen, favorietenKaart, over, privacy];
    if (opent) {
      komOp(kaarten, { stap: 90 });
      bloeiOp(over.querySelector('.over__hart')); // het hartje bloeit één keer zacht op
      // De kleine medailles komen één voor één op, na de kaart zelf; op de behaalde trekt één keer een glans
      komOp(badgeKaart.querySelectorAll('.meer__kleinemedailles > *'), { stap: 70, start: 420 });
      laatsteMedaille?.glans?.(700);
      komende.forEach((k) => k.medaille.vulRing?.(k.v?.fractie ?? 0));
      // De cijfers tellen één keer op bij het openen (niet de waarden die ze net zelf aanpast).
      cijfers.forEach((c, i) => telOp(c.getal, [stats.dagenBijgehouden, stats.lopendeReeks, badges.length][i], { duur: 700 }));
    }

    return h(
      'div',
      { class: 'stapel stapel--sectie meer' },
      schermkop({ titel: t('meer.titel') }),
      h('div', { class: 'raster raster--2 meer__raster' }, ...kaarten),
    );
  });
  const stopHaken = haakUitleg(houder, { haken: [['.meer__themakaart','thema'],['.meer__menu > .rij','menu-instellingen'],['.meer__profiel','profiel'],['.meer__badges','badges']] });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
