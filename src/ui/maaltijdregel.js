// Eén maaltijd als rij in een kaart, met het invulvenster in een blad (HUISSTIJL §5, §6 en §7; PLAN.md §7; BESLISSING 419).
// Dicht: maaltijdtegel, naam van het moment, uur, en tekst.
// Het blad: uur, tekstvak, chips, favoriet en de knoppen Klaar, Annuleren en Verwijderen (zichtbaar zolang er iets staat). Een maaltijd heeft geen foto: de rij toont altijd de maaltijdtegel.
// Alles bewaart zichzelf: tekst 400 ms na de laatste toets en bij verlaten, de rest meteen.
import { h } from './dom.js';
import { icoon } from './iconen.js';
import { rij, tijdveld, tekstvak, chip, icoonknop, knop, bevestig, strook, blad } from './componenten.js';
import { miniatuur } from './beeld.js';
import { ICOON, begripIcoon } from './iconenkaart.js';
import { t } from '../teksten.js';
import { plusDagen, nuAlsTijd, vandaag } from '../kern/datum.js';
import {
  MAALTIJDSOORTEN,
  STANDAARDTIJD,
  bewaarMaaltijd,
  zetMaaltijdTerug,
  leesMaaltijden,
  wisMaaltijd,
  zelfdeAlsGisteren,
  suggesties,
  isIngevuld,
} from '../data/maaltijden.js';
import { leesFavorieten, voegFavorietToe, verwijderFavoriet, markeerGebruikt, maakSleutel, isFavoriet, zetFavorietTerug } from '../data/favorieten.js';
import { uitgesteldBewaren, dagBinder, vergeetMislukt } from '../schermen/hulp.js';
import { bloeiOp } from './beweging.js';
import { MAX_LENGTE } from '../data/grenzen.js';

// Alle schrijfacties van maaltijden na elkaar: lezen-en-schrijven op hetzelfde record mag niet door elkaar lopen.
let keten = Promise.resolve();
const inKeten = (fn) => {
  const volgende = keten.then(fn, fn);
  keten = volgende.catch(() => {});
  return volgende;
};

// Een losse kopie van een maaltijdrecord (of null), voor de stand bij het openen van het venster.
const kopieVan = (m) => (m ? { ...m } : null);

const naarMinuten = (tijd) => {
  const [u, m] = tijd.split(':').map(Number);
  return u * 60 + m;
};

// De eerstvolgende open maaltijd: de eerste niet-ingevulde waarvan het gewone uur nog niet meer dan
// 2 uur voorbij is; anders de eerste niet-ingevulde; zijn ze alle zes ingevuld: geen.
export function eerstvolgendeOpen(maaltijden, nu = new Date()) {
  const open = MAALTIJDSOORTEN.filter((soort) => !isIngevuld(maaltijden[soort]));
  if (!open.length) return null;
  const minuten = nu.getHours() * 60 + nu.getMinutes();
  return open.find((soort) => naarMinuten(STANDAARDTIJD[soort]) + 120 >= minuten) ?? open[0];
}

// De bewaarder van de tekst van één maaltijd (0,4 s na de laatste toets, met vangnet R5-03). typt() onthoudt de dag waarop het typen
// begon: tekst van vóór middernacht blijft bij die dag, in de database en in het vangnet. schrijf(wijziging, opDag) geeft een belofte
// die mislukt als het schrijven mislukt; opFout meldt dat aan de gebruiker en de bewaarder geeft het mislukken door, zodat het vangnet
// blijft liggen (hulp.js). Los van het venster, zodat tests/logica/bewaren-vangnet.test.js het kan vastleggen.
export function maakTekstBewaarder({ soort, dag, schrijf, opFout, ms = 400 }) {
  let typDag = null;
  const bewaarder = uitgesteldBewaren(
    (waarde) => {
      const opDag = typDag ?? dag();
      typDag = null;
      return Promise.resolve(schrijf({ tekst: waarde }, opDag)).catch((fout) => {
        opFout(fout);
        try {
          fout.gemeld = true; // de timer van de bewaarder meldt ze dan niet nog eens
        } catch {
          /* geen object */
        }
        throw fout;
      });
    },
    ms,
    (waarde) => ({ soort: 'maaltijd', datum: typDag ?? dag(), maaltijd: soort, tekst: waarde }), // R5-03: het vangnet bij herladen
  );
  return {
    bewaarder,
    typt() {
      typDag ??= dag();
    },
  };
}

// maaltijdregel({ datum, soort, maaltijd, uitgelicht, alleenLezen }) → de rij van één maaltijd in de kaart Eten.
// BESLISSING 419: een tik op de rij opent het invulvenster als een apart blad boven het scherm (hetzelfde blad als "Weging noteren": titel =
// de naam van de maaltijd, een kruisje, focus gevangen, Escape, gedimde achtergrond, op de telefoon van onderaf). De kaart Eten verandert
// nooit van hoogte; er is geen inline openklappen meer. Het blad hangt niet aan een hertekening van het scherm: het blijft open en blijft
// bewaren, ook als het scherm intussen opnieuw tekent (een tweede tabblad, een dagdeel). Geeft een element met .openMetFocus().
export function maaltijdregel(opties) {
  const { datum, soort, maaltijd, uitgelicht = false, alleenLezen = false } = opties;
  const dag = dagBinder(datum); // op Vandaag: de datum van het moment van bewaren; op een eerdere dag blijft die dag
  let huidig = maaltijd ?? null; // de laatst bewaarde stand van deze maaltijd (de rij volgt die, R5-02)
  let begin = null; // de stand bij het openen van het blad: Annuleren gaat daarnaar terug (BESLISSING 412)

  const naam = t('maaltijd.' + soort);
  const heeftTekst = () => (huidig?.tekst ?? '').trim() !== '';
  const eindVan = (m) =>
    m
      ? h(
          'span',
          { class: 'maaltijd__eind' },
          h('span', { class: 'cijfer' }, m.tijd),
          alleenLezen ? null : h('span', { class: 'maaltijd__wijzig', title: t('maaltijd.wijzig') }, begripIcoon('volgende', { grootte: 14 })),
        )
      : alleenLezen
        ? null
        : h('span', { class: ['maaltijd__invullen', uitgelicht && 'is-uitgelicht'] }, t('maaltijd.invullen'), begripIcoon('volgende', { grootte: 14 }));
  const subVan = (m) => {
    const tekst = (m?.tekst ?? '').trim();
    return tekst ? tekst : uitgelicht && !alleenLezen ? h('span', { class: 'maaltijd__volgende' }, t('maaltijd.volgende')) : null;
  };
  const maakKop = (m) =>
    rij({
      tegel: miniatuur({ soort }),
      titel: naam,
      tekst: subVan(m),
      eind: eindVan(m),
      opKlik: alleenLezen ? null : () => openBlad(),
      label: undefined,
    });

  const kop = maakKop(huidig);
  if (alleenLezen) kop.classList.add('rij--stil');
  else {
    kop.setAttribute('aria-haspopup', 'dialog');
    kop.setAttribute('aria-expanded', 'false');
  }

  // R5-02: na elke bewaarde wijziging toont de rij wat er nu bewaard is (tekst en uur), ook terwijl het blad open is.
  // Dezelfde knop blijft staan (de focus blijft erop); alleen de inhoud wordt vervangen.
  function werkKopBij(m) {
    huidig = m ?? null;
    kop.replaceChildren(...maakKop(huidig).childNodes);
  }

  const el = h('div', { class: ['maaltijd', uitgelicht && 'is-uitgelicht'], dataset: { soort, fk: 'maaltijd-' + soort } }, kop);

  let bladEl = null;
  let paneel = null;
  // kijkstand (de rondleiding): het blad opent zonder focus in het tekstvak.
  function openBlad({ kijkstand = false } = {}) {
    if (alleenLezen || bladEl) return bladEl;
    begin = kopieVan(huidig);
    paneel = bouwPaneel();
    kop.setAttribute('aria-expanded', 'true');
    const b = blad({
      titel: naam,
      inhoud: paneel.el,
      familie: 'dagboek', // een maaltijd is overal de Dagboek-familie, ook op Vandaag (BESLISSING 422)
      // Escape, het kruisje, een tik naast het blad, Klaar of een ander scherm: wat nog wacht wordt bewaard (zoals Klaar) en de focus gaat
      // terug naar de rij (de rij van de laatste tekening, als het scherm intussen opnieuw tekende).
      opSluit: () => {
        bladEl = null;
        paneel?.bewaarNu();
        kop.setAttribute('aria-expanded', 'false');
        focusTerugOpRij();
      },
    });
    b.classList.add('maaltijdblad');
    b.dataset.soort = soort;
    bladEl = b;
    b.open({ modaal: !kijkstand });
    if (!kijkstand && !heeftTekst()) paneel.focus();
    return b;
  }

  // Na het sluiten hoort de focus op de rij van deze maaltijd. Het bewaren laat het scherm opnieuw tekenen (een nieuwe rij); zolang dat
  // gebeurt (hoogstens 1,5 s) en de focus nergens anders naartoe ging, volgt de focus de nieuwe rij.
  function focusTerugOpRij() {
    const zoek = () => (kop.isConnected ? kop : document.querySelector(`#scherm .maaltijd[data-soort="${soort}"] > .rij`));
    zoek()?.focus({ preventScroll: true });
    const scherm = document.getElementById('scherm');
    if (!scherm) return;
    const waarnemer = new MutationObserver(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      zoek()?.focus({ preventScroll: true });
    });
    waarnemer.observe(scherm, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); // ook als een scherm na het meten weer zichtbaar wordt (is-meet)
    setTimeout(() => waarnemer.disconnect(), 1500);
  }

  // Sluiten zoals Klaar of Escape (opSluit zet de focus terug op de rij).
  function sluit() {
    bladEl?.sluit();
  }

  function bouwPaneel() {
    const state = {
      tijd: huidig?.tijd ?? (datum === vandaag() ? nuAlsTijd() : STANDAARDTIJD[soort]),
      tekst: huidig?.tekst ?? '',
    };
    // R5-01: alleen wat in dit venster gewijzigd is, gaat naar de database (op het record zoals het daar nu staat). Het uur gaat mee
    // als het gewijzigd is, of bij een maaltijd die nog niet bestond (dan het uur dat in het venster staat).
    let tijdGewijzigd = !huidig;
    const schrijfKaal = (wijziging, opDag = dag()) =>
      inKeten(() => bewaarMaaltijd(opDag, soort, tijdGewijzigd ? { tijd: state.tijd, ...wijziging } : wijziging))
        .then((m) => {
          if (wijziging.tijd === undefined) tijdGewijzigd = false; // het uur staat nu in de database
          if (opDag === datum) werkKopBij(m);
          return m;
        });
    const meldFout = (fout) => {
      console.error(fout);
      strook(t('algemeen.foutOpslag'));
    };
    const schrijf = (wijziging, opDag) => schrijfKaal(wijziging, opDag).catch(meldFout);

    // Uur
    const uur = h(
      'div',
      { class: 'maaltijd__veld' },
      h('p', { class: 'label' }, t('maaltijd.tijd')),
      tijdveld({
        waarde: state.tijd,
        label: t('maaltijd.tijd'),
        opWijzig: (v) => {
          state.tijd = v;
          tijdGewijzigd = true;
          if (huidig || state.tekst.trim()) schrijf({});
        },
      }),
    );

    // Tekst, met het hartje om de tekst als favoriet te bewaren
    // De fout wordt gemeld zoals altijd (console en strook), maar de bewaarder krijgt ze ook te zien: zo blijft het vangnet liggen.
    const { bewaarder, typt } = maakTekstBewaarder({ soort, dag, schrijf: schrijfKaal, opFout: meldFout });
    // Voor het venster zelf verandert er niets: de fout is al gemeld en het venster gaat verder zoals voorheen.
    const bewaarNu = () => bewaarder.nu().catch(() => {});
    const vak = tekstvak({
      waarde: state.tekst,
      plaats: t('maaltijd.vraag'),
      label: t('maaltijd.vraag'),
      rijen: 2,
      opWijzig: (v) => {
        state.tekst = v;
        typt();
        bewaarder.plan(v);
        zetHart();
        zetVerwijder();
      },
    });
    vak.maxLength = MAX_LENGTE.maaltijd;
    vak.addEventListener('blur', bewaarNu);
    // BESLISSING 434: alles wat dit blad met favorieten deed (hartje aan of uit, een favorietchip gebruikt), in volgorde, zodat Annuleren het
    // in omgekeerde volgorde ongedaan maakt. Elke stap weet hoe hij terug moet.
    const favorietLog = [];
    let isFav = false;
    let favId = null;
    const hart = icoonknop(ICOON.favoriet.naam, { label: t('maaltijd.favorietMaken'), stijl: ICOON.favoriet.stijl, klasse: 'maaltijd__hart', opKlik: wisselFavoriet });
    async function zetHart() {
      const sleutel = maakSleutel(state.tekst);
      const lijst = await leesFavorieten();
      const gevonden = sleutel ? lijst.find((f) => f.sleutel === sleutel) : null;
      isFav = Boolean(gevonden);
      favId = gevonden?.id ?? null;
      hart.replaceChildren(icoon(ICOON.favoriet.naam, { grootte: 20, stijl: isFav ? 'solid' : ICOON.favoriet.stijl }));
      hart.classList.toggle('is-actief', isFav);
      hart.setAttribute('aria-pressed', String(isFav));
      hart.setAttribute('aria-label', isFav ? t('maaltijd.favorietWeg') : t('maaltijd.favorietMaken'));
      hart.disabled = !sleutel;
    }
    async function wisselFavoriet() {
      if (isFav && favId != null) {
        const oud = (await leesFavorieten()).find((f) => f.id === favId);
        await verwijderFavoriet(favId);
        if (oud) favorietLog.push(() => zetFavorietTerug(oud));
      } else if (state.tekst.trim()) {
        const bestond = await isFavoriet(state.tekst);
        const nieuw = await voegFavorietToe(state.tekst);
        if (!bestond) favorietLog.push(() => verwijderFavoriet(nieuw.id));
      }
      zetHart();
    }
    zetHart();

    // Chips: zelfde als gisteren, favorieten, suggesties
    const chipRij = h('div', { class: 'chips maaltijd__chips', hidden: true });
    (async () => {
      const [gisteren, favorieten, voorstellen] = await Promise.all([
        leesMaaltijden(plusDagen(datum, -1)),
        leesFavorieten(),
        suggesties(soort),
      ]);
      const vul = (nieuweTekst, na) => async () => {
        state.tekst = nieuweTekst;
        vak.value = nieuweTekst;
        vak.dispatchEvent(new Event('input'));
        await bewaarNu();
        await na?.();
        zetHart();
        zetVerwijder();
      };
      const items = [];
      if ((gisteren[soort]?.tekst ?? '').trim()) {
        items.push(
          chip(t('maaltijd.zelfde'), {
            opKlik: async () => {
              const m = await inKeten(() => zelfdeAlsGisteren(datum, soort));
              if (m) {
                werkKopBij(m);
                state.tekst = m.tekst;
                vak.value = m.tekst;
                zetHart();
                zetVerwijder();
              }
            },
          }),
        );
      }
      for (const f of favorieten.slice(0, 4)) {
        items.push(
          chip(f.tekst, {
            opKlik: vul(f.tekst, async () => {
              const oud = (await leesFavorieten()).find((x) => x.id === f.id);
              await markeerGebruikt(f.id);
              if (oud) favorietLog.push(() => zetFavorietTerug(oud));
            }),
          }),
        );
      }
      for (const s of voorstellen) items.push(chip(s, { opKlik: vul(s) }));
      if (items.length) {
        chipRij.append(...items);
        chipRij.hidden = false;
      }
    })();

    // Verwijderen: staat in het open paneel zolang er iets staat (tekst), ook als dat pas tijdens het
    // typen in een eerst lege maaltijd gebeurt. Na het verwijderen volgt een strook met Ongedaan maken.
    const verwijderHouder = h('div', { class: 'maaltijd__verwijder' });
    const verwijderKnop = knop(t('maaltijd.verwijderen'), {
      soort: 'secundair',
      opKlik: async () => {
        const ja = await bevestig({
          titel: t('maaltijd.verwijderVraag', { aanduiding: t('maaltijd.aanduiding.' + soort) }),
          tekst: t('maaltijd.verwijderUitleg'),
          ja: t('maaltijd.verwijderJa'),
          nee: t('maaltijd.verwijderNee'),
        });
        if (!ja) return;
        await bewaarNu(); // wat nog wacht, wordt eerst bewaard zodat het niet na het verwijderen terugkomt
        const terug = { tijd: state.tijd, tekst: state.tekst };
        await inKeten(() => wisMaaltijd(datum, soort));
        vergeetMislukt({ soort: 'maaltijd', datum, maaltijd: soort }); // een mislukte tekst komt niet terug uit het vangnet
        werkKopBij(null);
        sluit();
        strook(t('maaltijd.verwijderd'), {
          duur: 6000,
          actie: { label: t('algemeen.ongedaan'), opKlik: () => inKeten(() => bewaarMaaltijd(datum, soort, terug)) },
        });
      },
    });
    verwijderKnop.setAttribute('data-uitleg', 'maaltijd-verwijderen');
    hart.setAttribute('data-uitleg', 'maaltijd-favoriet');
    verwijderHouder.append(verwijderKnop);

    // Klaar (BESLISSING 226 en 412): bewaart wat nog wacht, sluit de regel en toont de maaltijd als ingevuld. Alles bewaart zichzelf al
    // (tekst na 400 ms, de rest meteen); Klaar schrijft dus alleen wat nog wacht, nooit opnieuw de stand van bij het openen (R5-01).
    const bewaarKnop = knop(t('maaltijd.bewaren'), {
      soort: 'primair',
      opKlik: () => bewaarEnSluit(),
    });
    bewaarKnop.prepend(h('span', { class: 'maaltijd__vink', 'aria-hidden': 'true' })); // een getekend vinkje: het iconenpakket (HUISSTIJL §5) heeft er geen
    bewaarKnop.setAttribute('data-uitleg', 'maaltijd-bewaren');
    bewaarKnop.classList.add('maaltijd__bewaar');
    let bezig = false;
    async function bewaarEnSluit({ metBloei = true } = {}) {
      if (bezig) return;
      bezig = true;
      try {
        await bewaarNu(); // wat nog wacht gaat naar de dag waarop het typen begon
        sluit();
        if (metBloei) bloeiOp(el);
      } finally {
        bezig = false;
      }
    }
    // Annuleren (BESLISSING 412): de maaltijd terug naar precies de stand van toen het venster openging (was ze toen leeg, dan weer
    // leeg), en het venster dicht. Wat nog wacht, wordt eerst bewaard, zodat het niet na het terugzetten alsnog binnenkomt.
    const annuleerKnop = knop(t('maaltijd.annuleren'), {
      soort: 'secundair',
      opKlik: async () => {
        if (bezig) return;
        bezig = true;
        try {
          await bewaarNu();
          const terug = begin ?? null;
          await inKeten(() => zetMaaltijdTerug(terug?.datum ?? datum, soort, terug));
          vergeetMislukt({ soort: 'maaltijd', datum: terug?.datum ?? datum, maaltijd: soort }); // idem na het terugzetten
          // BESLISSING 434: ook de favorieten terug, de laatste wijziging eerst.
          while (favorietLog.length) await favorietLog.pop()();
          werkKopBij(terug);
          sluit();
        } catch (fout) {
          console.error(fout);
          strook(t('algemeen.foutOpslag'));
        } finally {
          bezig = false;
        }
      },
    });
    annuleerKnop.classList.add('maaltijd__annuleer');
    // Enter maakt een nieuwe regel in het tekstvak, zodat je een maaltijd over meerdere regels kunt noteren; het blad blijft open.
    // Bewaren en sluiten met het toetsenbord gaat met ctrl of cmd samen met Enter, naast de knop Klaar.
    vak.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
        e.preventDefault();
        if (state.tekst.trim()) bewaarEnSluit();
      }
    });
    function zetVerwijder() {
      verwijderHouder.hidden = state.tekst.trim() === '';
      bewaarKnop.disabled = state.tekst.trim() === '';
    }
    zetVerwijder();

    const paneelEl = h(
      'div',
      { class: 'maaltijd__paneel' },
      uur,
      h('div', { class: 'maaltijd__tekst' }, vak, hart),
      chipRij,
      h('div', { class: 'maaltijd__acties' }, bewaarKnop, annuleerKnop, verwijderHouder), // BESLISSING 417: Klaar, Annuleren, Verwijderen
    );
    // Escape doet hetzelfde als Klaar: bewaren wat wacht, sluiten, de focus terug op de rij (BESLISSING 412; R5-02). Niet annuleren.
    paneelEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      e.preventDefault();
      bewaarEnSluit({ metBloei: false });
    });
    return { el: paneelEl, focus: () => vak.focus({ preventScroll: true }), bewaarNu };
  }

  // Een tik op het vak Eten in de motivator: het blad gaat open met de cursor in het tekstvak.
  el.openMetFocus = () => {
    if (!openBlad()) return;
    paneel?.focus();
  };
  // De rondleiding (kijkstand): het blad open zonder focus; geeft het blad terug (met .sluit()).
  el.openKijkstand = () => openBlad({ kijkstand: true });
  return el;
}

// De zes maaltijdregels van de kaart "Eten". Een maaltijd toont altijd haar tegel, nooit een foto.
// maaltijdenRijen({ datum, maaltijden, uitgelicht, alleenLezen })
export function maaltijdenRijen({ datum, maaltijden, uitgelicht = null, alleenLezen = false }) {
  return MAALTIJDSOORTEN.map((soort) => maaltijdregel({ datum, soort, maaltijd: maaltijden[soort], uitgelicht: uitgelicht === soort, alleenLezen }));
}
