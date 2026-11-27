// Meer › Herinneringen (#/meer/meldingen), in de vaste opbouw van een instelscherm (layout.css). BESLISSINGEN 307, 309, 312, 313 en 714.
// Links: bovenaan een hoofdschakelaar (alles aan of uit) en daaronder vier soorten, elk apart aan en uit met hun eigen uren per minuut (BESLISSING 713):
//   Dagboek (tot 2 tijdstippen), Eten en Supplementen (elk tot 3) en Drinken (tot 4). Bij elke soort kiest de gebruiker elk uur zelf, kan ze een tijdstip
//   toevoegen en weghalen, in dezelfde rijen (714). Rechts: "Zo ziet het eruit" met een nagebootste melding. Standaard staat alles uit;
//   elk toestel heeft zijn eigen keuzes.
// Vier toestanden: beschikbaar, niet beschikbaar (geen push-dienst), installeren (iPhone of iPad in Safari) en geweigerd.
import { h } from '../ui/dom.js';
import { beeldmerk, icoonknop, kaart, kaartkop, knop, rij, schakelaar, schermkop, strook, tijdveld } from '../ui/componenten.js';
import { ICOON, begripOpties, begripTegel } from '../ui/iconenkaart.js';
import { terugKnop } from '../schermen/hulp.js';
import { t } from '../teksten.js';
import { leesInstelling, zetInstelling } from '../data/instellingen.js';
import { opmaakDatum, vandaag } from '../kern/datum.js';
import { pushToestand } from './config.js';
import { LIMIETEN, zetMeldingenAan } from './push.js';
import { dagboekLijst, dagboekWaarde, kiesMelding } from './tekst.js';
import { leesMeldingInvoer } from './stand.js';
import { DEMO } from '../kern/demo.js';
import { luister } from '../kern/bus.js';
import { isAndroid, isChromeAndroid, isStandalone } from '../kern/toestel.js';

// De stappen om geweigerde meldingen terug aan te zetten. Op Android (BESLISSING 423, AN-05): in een geïnstalleerde app via App-info,
// in Chrome via Pagina-informatie › Rechten, in een andere browser algemeen. Elders de bestaande zin, ongewijzigd.
export function geweigerdStappenSleutel({ android = isAndroid(), standalone = isStandalone(), chrome = isChromeAndroid() } = {}) {
  if (!android) return 'meldingen.geweigerdStappen';
  if (standalone) return 'meldingen.geweigerdStappenAndroidApp';
  return chrome ? 'meldingen.geweigerdStappenAndroid' : 'meldingen.geweigerdStappenAndroidAnder';
}

// BESLISSING 736: vier soorten, in de volgorde van de begrippen van de app (iconenkaart.js): Dagboek, Eten, Drinken, Supplementen.
export const SOORTEN = ['dagboek', 'eten', 'drinken', 'supplementen'];
const LIJSTEN = { dagboek: 'meldingen.dagboek', eten: 'meldingen.eten', drinken: 'meldingen.drinken', supplementen: 'meldingen.supplementenUren' };
// BESLISSING 714 en 736: elke soort heeft dezelfde rijen, met hoogstens 3 tijdstippen per soort; op vraag van Caroline (0.6.7) Drinken 4
// en Dagboek 2: samen 2 + 3 + 4 + 3 = 12, de grens van de dienst. Een stand met meer dan de grens van een soort: bij het inlezen blijven de eerste tijdstippen
// tot die grens en vervalt de rest, een keer en stil.
export const DAGBOEK_LIMIET = LIMIETEN.dagboek;
export const LIMIET = { dagboek: LIMIETEN.dagboek, eten: LIMIETEN.eten, drinken: LIMIETEN.drinken, supplementen: LIMIETEN.supplementenUren };
const twee = (n) => String(n).padStart(2, '0');

// BESLISSING 713: een herinnering kan op elke minuut van 00:00 tot 23:59. Geeft het uur als 'UU:MM' (seconden vallen weg), of null als
// het geen geldig uur is (leeg, 24:00, 18:60, tekst). Er wordt niets afgerond: wat de gebruiker kiest, blijft staan.
export function geldigUur(waarde) {
  const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(waarde ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1]}:${m[2]}`;
}

// Twee gelijke uren binnen één soort worden één: het eerste blijft staan, en het staat aan als één van beide aan stond.
export function voegSamen(lijst) {
  const uit = [];
  for (const k of lijst) {
    const bestaand = uit.find((x) => x.uur === k.uur);
    if (bestaand) bestaand.aan = bestaand.aan || k.aan;
    else uit.push({ ...k });
  }
  return uit;
}

// Het eerste vrije uur twee uur na het laatste, zodat een nieuw tijdstip nooit meteen met een ander samenvalt. Per minuut (713): na 18:07
// komt 20:07; is dat bezet, dan telkens een kwartier later.
export function nieuwUur(lijst) {
  const gebruikt = new Set(lijst.map((k) => k.uur));
  const [u, m] = (lijst.at(-1)?.uur ?? '10:00').split(':').map(Number);
  for (let stap = 1; stap <= 96; stap += 1) {
    const totaal = (u * 60 + m + (stap === 1 ? 120 : 120 + (stap - 1) * 15)) % 1440;
    const uur = `${twee(Math.floor(totaal / 60))}:${twee(totaal % 60)}`;
    if (!gebruikt.has(uur)) return uur;
  }
  return '12:00';
}

// Het moment van een voorbeeld: vandaag op het gekozen uur.
function voorbeeldMoment(uur) {
  const nu = new Date();
  const [u, m] = uur.split(':').map(Number);
  nu.setHours(u, m, 0, 0);
  return nu;
}

export function toon(houder) {
  let weg = false;
  let teken0 = 0;
  let plaatsNu = null;
  const breed = window.matchMedia('(min-width: 960px)');

  async function teken({ focus = null } = {}) {
    const mijn = ++teken0;
    // BESLISSING 710: de vergrendeling telt niet mee voor de details (schakelaar, ondertitel en voorbeeld); de gebruiker kiest zelf.
    const [dagboek, eten, drinken, supplementen, details, basis] = await Promise.all([
      leesInstelling('meldingen.dagboek'),
      leesInstelling(LIJSTEN.eten),
      leesInstelling(LIJSTEN.drinken),
      leesInstelling(LIJSTEN.supplementen),
      leesInstelling('meldingen.details'),
      leesMeldingInvoer().catch(() => null),
    ]);
    if (weg || mijn !== teken0) return;
    // BESLISSING 714: ook Dagboek is een lijst van tijdstippen (een oude waarde "Om 20:00" wordt "Tijdstip 1, 20:00", zie tekst.js).
    const dagboekUurOud = typeof dagboek?.uur === 'string' ? dagboek.uur : '20:00';
    const stand = { dagboek: voegSamen(dagboekLijst(dagboek)), eten: voegSamen(Array.isArray(eten) ? eten : []), drinken: voegSamen(drinken ?? []), supplementen: voegSamen(supplementen ?? []), details: details === true };
    const toestand = pushToestand();
    // BESLISSING 736: strikt de grens per soort (Dagboek 2, Drinken 4, de rest 3). Een stand met meer wordt hier een keer ingekort en bewaard, zonder melding.
    for (const s of SOORTEN) {
      if (stand[s].length > LIMIET[s]) {
        stand[s] = stand[s].slice(0, LIMIET[s]);
        zetInstelling(LIJSTEN[s], s === 'dagboek' ? dagboekWaarde(stand.dagboek, dagboekUurOud) : stand[s].map((k) => ({ ...k }))).catch(() => {});
      }
    }

    const aanStaat = (soort) => stand[soort].some((k) => k.aan);

    // ---- Zo ziet het eruit: een stapel meldingen, één per tijdstip dat aan staat (in tijdsvolgorde); staat er niets aan, dan de vier voorbeelden, gedempt.
    // Op de telefoon staan alleen de eerste twee in beeld (BESLISSING 751).
    const nu = new Date();
    const klok = h('p', { class: 'meldingen__klok cijfer' }, `${twee(nu.getHours())}:${twee(nu.getMinutes())}`);
    const datumRegel = h('p', { class: 'label meldingen__datum' }, opmaakDatum(vandaag(), 'lang')); // BESLISSING 459: de datum onder de klok als label
    const stapel = h('div', { class: 'meldingen__stapel' });
    const bijschrift = h('div', { class: 'meldingen__bijschrift' });
    bijschrift.hidden = true;
    const nogRegel = h('p', { class: 'meldingen__nog meldingen__nog--vier t-klein t-gedempt' });
    // BESLISSING 751: op de telefoon toont het voorbeeld de eerste twee meldingen. Welke kaartjes dan wegvallen, regelt de css (scherm-algemeen.css,
    // dezelfde grens als telefoon.css), zodat het bij draaien of een andere venstermaat meteen klopt en een verborgen melding ook niet wordt voorgelezen.
    // Deze regel zegt op de telefoon hoeveel echte meldingen er nog zijn; op een breder scherm blijft ze verborgen.
    const nogTelefoon = h('p', { class: 'meldingen__nog meldingen__nog--telefoon t-klein t-gedempt' });
    const samenvatting = h('p', { class: 'meldingen__nog meldingen__samenvatting t-klein t-gedempt' });
    function stapelKaartje(soort, uur, gedempt) {
      const invoer = basis
        ? {
            ...basis,
            nu: voorbeeldMoment(uur),
            // BESLISSING 587: staat er nog niets aan, dan toont het voorbeeld per soort wat er in de melding kan staan (710: ook met de vergrendeling aan)
            details: stand.details || gedempt,
            dagboek: { aan: soort === 'dagboek', uur },
            eten: soort === 'eten' ? [{ aan: true, uur }] : [],
            drinken: soort === 'drinken' ? [{ aan: true, uur }] : [],
            supplementenUren: soort === 'supplementen' ? [{ aan: true, uur }] : [],
          }
        : { nu: voorbeeldMoment(uur), details: false, status: {}, dagboek: { aan: true, uur }, eten: [], drinken: [], supplementenUren: [] };
      const m = kiesMelding(invoer);
      return h(
        'div',
        { class: ['meldingen__melding', gedempt && 'meldingen__melding--gedempt'], role: 'img', 'aria-label': `${uur}. ${m.titel}. ${m.tekst}` },
        h('span', { class: 'meldingen__app', 'aria-hidden': 'true' }, beeldmerk({ variant: 'logo', grootte: 32 })),
        h(
          'span',
          { class: 'meldingen__inhoud' },
          h('span', { class: 'meldingen__kop' }, h('span', { class: 'meldingen__titel' }, m.titel), h('span', { class: 'meldingen__nu t-klein t-gedempt cijfer' }, uur)),
          h('span', { class: 'meldingen__tekst' }, m.tekst),
        ),
      );
    }
    function tekenVoorbeeld() {
      const volgorde = { dagboek: 0, eten: 1, drinken: 2, supplementen: 3 };
      const echt = [];
      if (toestand === 'beschikbaar') {
        for (const s of SOORTEN) for (const k of stand[s]) if (k.aan) echt.push({ soort: s, uur: k.uur });
      }
      const gedempt = echt.length === 0;
      const lijstje = gedempt
        ? [
            { soort: 'dagboek', uur: stand.dagboek[0]?.uur ?? dagboekUurOud },
            { soort: 'eten', uur: stand.eten[0]?.uur ?? '12:30' },
            { soort: 'drinken', uur: stand.drinken[0]?.uur ?? '11:00' },
            { soort: 'supplementen', uur: stand.supplementen[0]?.uur ?? '08:00' },
          ]
        : echt.sort((a, b) => a.uur.localeCompare(b.uur) || volgorde[a.soort] - volgorde[b.soort]);
      // BESLISSING 348: zonder details toont het toestel één melding per tijdstip; het voorbeeld toont precies dat (710: los van de vergrendeling).
      const algemeen = !stand.details && !gedempt;
      const getoond = algemeen ? lijstje.filter((k, i) => lijstje.findIndex((x) => x.uur === k.uur) === i) : lijstje;
      const kaartjes = getoond.map((k) => stapelKaartje(k.soort, k.uur, gedempt));
      // Op een smal scherm (één kolom) hoogstens vier kaartjes, daarna "en nog N".
      const beperkt = !breed.matches && kaartjes.length > 4;
      kaartjes.forEach((k, i) => { k.hidden = beperkt && i >= 4; });
      nogRegel.textContent = beperkt ? t('meldingen.enNog', { n: kaartjes.length - 4 }) : '';
      nogRegel.hidden = !beperkt;
      // 751: de vier gedempte voorbeelden zijn geen echte meldingen; daar staat geen "en nog".
      const meerDanTwee = !gedempt && kaartjes.length > 2;
      nogTelefoon.textContent = meerDanTwee ? t('meldingen.enNog', { n: kaartjes.length - 2 }) : '';
      nogTelefoon.hidden = !meerDanTwee;
      samenvatting.textContent = gedempt ? t('meldingen.samenvattingLeeg') : t(kaartjes.length === 1 ? 'meldingen.samenvattingEen' : 'meldingen.samenvatting', { n: kaartjes.length });
      samenvatting.hidden = true;
      stapel.replaceChildren(...kaartjes, nogRegel, nogTelefoon, samenvatting);
    }
    tekenVoorbeeld();
    const voorbeeld = h(
      'aside',
      { class: 'instel__voorbeeld' },
      kaart(
        { klasse: 'meldingen__voorbeeldkaart' },
        kaartkop({ tegel: begripOpties('herinneringen'), label: t('meldingen.voorbeeld') }),
        h('div', { class: 'instel__groei' }, h('div', { class: 'meldingen__telefoon' }, h('div', { class: 'meldingen__behang', 'aria-hidden': 'true' }), klok, datumRegel, stapel)),
        bijschrift,
      ),
    );

    // ---- De instellingen
    function beschikbaar() {
      // Dagboek wordt bewaard als één object met de lijst erin (tekst.js, dagboekWaarde), Drinken en Supplementen als een lijst.
      const bewaarLijst = (soort) =>
        zetInstelling(LIJSTEN[soort], soort === 'dagboek' ? dagboekWaarde(stand.dagboek, dagboekUurOud) : stand[soort].map((k) => ({ ...k })));
      const bewaarAlles = async () => {
        for (const s of SOORTEN) await bewaarLijst(s);
      };

      // Iets aanzetten vraagt eerst toestemming (de aanroep staat in de tik zelf, zoals iOS het wil). false = niet gelukt, het scherm is dan hertekend.
      async function toestemming(focus) {
        const uitslag = await zetMeldingenAan();
        if (uitslag === 'ok') return true;
        if (uitslag === 'niet-beschikbaar') strook(t('meldingen.mislukt'), { duur: 5000 });
        await teken({ focus });
        return false;
      }
      const hertekenOpGelijkeStand = (focus) => {
        const y = window.scrollY;
        return teken({ focus }).then(() => y > 0 && window.scrollTo({ top: y, left: 0, behavior: 'instant' }));
      };

      async function hoofd(aan) {
        if (aan && !(await toestemming('hoofd'))) return;
        for (const s of SOORTEN) {
          if (aan && stand[s].length === 0) stand[s].push({ aan: true, uur: nieuwUur(stand[s]) });
          stand[s] = stand[s].map((k) => ({ ...k, aan }));
        }
        await bewaarAlles();
        await hertekenOpGelijkeStand('hoofd');
      }

      async function soortWissel(soort, aan) {
        if (aan && !(await toestemming(soort))) return;
        if (aan && stand[soort].length === 0) stand[soort].push({ aan: true, uur: nieuwUur(stand[soort]) });
        stand[soort] = stand[soort].map((k) => ({ ...k, aan }));
        await bewaarLijst(soort);
        await hertekenOpGelijkeStand(soort);
      }

      async function slotWissel(soort, i, aan) {
        if (aan && !(await toestemming(`${soort}-${i}`))) return;
        stand[soort][i] = { ...stand[soort][i], aan };
        await bewaarLijst(soort);
        await hertekenOpGelijkeStand(`${soort}-${i}`);
      }

      async function voegToe(soort) {
        if (stand[soort].length >= LIMIET[soort]) return;
        if (!(await toestemming(soort + '-toevoegen'))) return;
        stand[soort].push({ aan: true, uur: nieuwUur(stand[soort]) });
        await bewaarLijst(soort);
        await hertekenOpGelijkeStand(`${soort}-${stand[soort].length - 1}`);
      }

      async function haalWeg(soort, i) {
        stand[soort].splice(i, 1);
        await bewaarLijst(soort);
        await hertekenOpGelijkeStand(soort);
      }

      // Een uur wijzigen: meteen bewaard (de dienst krijgt de nieuwe lijst, zonder het oude uur); valt het samen met een ander uur van dezelfde soort, dan worden ze één.
      // BESLISSING 713: per minuut (stap 1 = step 60, de standaard van het veld). Vroeger stond hier stap 15 en werd elk gekozen uur in het veld zelf
      // teruggezet op het kwartier ervoor: op de iPhone sprong het wiel van de minuten daardoor terug (18:07 werd 18:00). Het veld wordt nu nooit
      // overschreven terwijl de gebruiker kiest; een ongeldige waarde (bv. leeg na Wissen) wordt genegeerd.
      function uurVeld({ waarde, label, opUur }) {
        return tijdveld({
          waarde,
          stap: 1,
          label,
          opWijzig: (nieuw) => {
            const uur = geldigUur(nieuw);
            if (uur) opUur(uur);
          },
        });
      }

      const hoofdSchakelaar = schakelaar({ label: t('meldingen.hoofd'), uitleg: t('meldingen.hoofdUitleg'), aan: SOORTEN.some(aanStaat), opWissel: hoofd });
      hoofdSchakelaar.dataset.meldingen = 'hoofd';
      const rijen = [h('div', { class: 'rij meldingen__hoofd' }, begripTegel('herinneringen'), hoofdSchakelaar)];

      const soortRij = (soort) => {
        const sw = schakelaar({ label: t('meldingen.' + soort), uitleg: t('meldingen.' + soort + 'Uitleg'), aan: aanStaat(soort), opWissel: (aan) => soortWissel(soort, aan) });
        sw.dataset.meldingen = soort;
        return h('div', { class: 'rij meldingen__soort' }, begripTegel(soort), sw);
      };

      // Elke soort (BESLISSING 714: ook Dagboek, vroeger één rij "Om" met een uur): een lijst van tijdstippen, elk met een eigen schakelaar,
      // uur en kruisje, en "Tijdstip toevoegen" tot het maximum. Dezelfde rijen en dezelfde opmaak voor alle vier.
      for (const soort of SOORTEN) {
        rijen.push(soortRij(soort));
        if (!aanStaat(soort)) continue;
        stand[soort].forEach((k, i) => {
          const sw = schakelaar({ label: t('meldingen.tijdstip', { nr: i + 1 }), aan: k.aan, opWissel: (aan) => slotWissel(soort, i, aan) });
          sw.dataset.meldingen = `${soort}-${i}`;
          sw.setAttribute('aria-label', t('meldingen.tijdstipAan', { nr: i + 1 }));
          const veld = uurVeld({
            waarde: k.uur,
            label: t('meldingen.uurLabel', { soort: `${t('meldingen.' + soort).toLowerCase()} ${i + 1}` }),
            opUur: (q) => {
              stand[soort][i] = { ...stand[soort][i], uur: q };
              const samen = voegSamen(stand[soort]);
              if (samen.length !== stand[soort].length) {
                stand[soort] = samen;
                bewaarLijst(soort).then(() => hertekenOpGelijkeStand(null));
                return;
              }
              bewaarLijst(soort);
              tekenVoorbeeld();
            },
          });
          const weghalen = icoonknop(ICOON.weghalen.naam, { label: t('meldingen.tijdstipWeghalen', { nr: i + 1 }), opKlik: () => haalWeg(soort, i), klasse: 'meldingen__weg' });
          rijen.push(h('div', { class: 'rij meldingen__slot' }, sw, h('span', { class: 'meldingen__slotveld' }, veld), weghalen));
        });
        if (stand[soort].length < LIMIET[soort]) {
          const toe = knop(t('meldingen.tijdstipToevoegen'), { soort: 'tekst', icoon: ICOON.toevoegen.naam, opKlik: () => voegToe(soort) });
          toe.dataset.meldingen = soort + '-toevoegen';
          rijen.push(h('div', { class: 'rij meldingen__toevoegen' }, toe));
        }
      }

      // BESLISSING 335: details in meldingen (standaard uit); puur lokaal, er gaat niets naar de dienst. Zolang niets aan staat valt er niets te kiezen:
      // dan is de schakelaar uitgeschakeld (alleen de schakelaar, de tekst blijft leesbaar).
      // BESLISSING 710: de vergrendeling blokkeert de schakelaar niet meer en verandert de ondertitel niet; de gebruiker kiest zelf.
      const detailsUit = !SOORTEN.some(aanStaat);
      const detailsSchakelaar = schakelaar({
        label: t('meldingen.details'),
        uitleg: t('meldingen.detailsUitleg'),
        aan: stand.details,
        uitgeschakeld: detailsUit,
        opWissel: async (aan) => {
          stand.details = aan;
          await zetInstelling('meldingen.details', aan);
          await hertekenOpGelijkeStand('details');
        },
      });
      detailsSchakelaar.dataset.meldingen = 'details';
      rijen.push(h('div', { class: 'rij meldingen__details' }, begripTegel('uitleg', { familie: 'neutraal' }), detailsSchakelaar));
      return rijen;
    }

    // Zonder werkende schakelaars: de vier soorten als uitgeschakelde, statische rijen, zodat ze ziet wat er komt (geen knop, geen tab, geen hover).
    const nepRijen = () => [
      h('p', { class: 'meldingen__straks t-klein t-gedempt' }, t('meldingen.straks')),
      ...SOORTEN.map((soort) =>
        h(
          'div',
          { class: 'rij meldingen__soort meldingen__nep', 'aria-disabled': 'true' },
          begripTegel(soort),
          h(
            'div',
            { class: 'schakelaar' },
            h('span', { class: 'schakelaar__tekst' }, h('span', { class: 'schakelaar__label' }, t('meldingen.' + soort)), h('span', { class: 'schakelaar__uitleg' }, t('meldingen.' + soort + 'Uitleg'))),
            h('span', { class: 'schakelaar__baan', 'aria-hidden': 'true' }, h('span', { class: 'schakelaar__knop' })),
          ),
        ),
      ),
      h(
        'div',
        { class: 'rij meldingen__details meldingen__nep', 'aria-disabled': 'true' },
        begripTegel('uitleg', { familie: 'neutraal' }),
        h(
          'div',
          { class: 'schakelaar' },
          h('span', { class: 'schakelaar__tekst' }, h('span', { class: 'schakelaar__label' }, t('meldingen.details')), h('span', { class: 'schakelaar__uitleg' }, t('meldingen.detailsUitleg'))),
          h('span', { class: 'schakelaar__baan', 'aria-hidden': 'true' }, h('span', { class: 'schakelaar__knop' })),
        ),
      ),
    ];
    let kaartInhoud;
    if (toestand === 'beschikbaar') {
      kaartInhoud = beschikbaar();
    } else if (toestand === 'geweigerd') {
      kaartInhoud = [rij({ tegel: begripOpties('herinneringen'), titel: t('meldingen.geweigerd'), tekst: t(geweigerdStappenSleutel()) }), ...nepRijen()];
    } else if (toestand === 'installeren') {
      kaartInhoud = [
        rij({ tegel: begripOpties('herinneringen'), titel: t('meldingen.installeerTitel'), tekst: t('meldingen.installeerUitleg') }),
        h(
          'ol',
          { class: 'meldingen__stappen' },
          ...['installeerStap1', 'installeerStap2', 'installeerStap3'].map((s, i) => h('li', { class: 'meldingen__stap' }, h('span', { class: 'meldingen__nr cijfer', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, t('meldingen.' + s)))),
        ),
        ...nepRijen(),
      ];
    } else {
      // In de demo (BESLISSING 364) is de dienst nooit ingesteld (config.js): dezelfde toestand, met een eigen zin.
      kaartInhoud = [rij({ tegel: begripOpties('herinneringen'), titel: DEMO ? t('demo.meldingenUit') : t('meldingen.nietBeschikbaar') }), ...nepRijen()];
    }

    const lijst = kaart({ klasse: 'meldingen__kaart' }, kaartkop({ tegel: begripOpties('herinneringen'), label: t('meldingen.titel') }), h('p', { class: 'meldingen__intro t-klein t-gedempt' }, t('meldingen.uitleg')), ...kaartInhoud);
    // BESLISSING 322: losse kaarten in twee kolommen, elk zo hoog als haar inhoud; rechts het voorbeeld met "Goed om te weten" direct eronder.
    // De vier weetjes staan in één kaart, of (om de kolommen gelijk te laten eindigen) verdeeld over twee kaarten, één per kolom.
    const weetjeNodes = [
      { begrip: 'herinneringen', tekst: t('meldingen.weetjes.1') },
      { begrip: 'profiel', tekst: t('meldingen.weetjes.2') },
      { begrip: 'instellingen', tekst: t('meldingen.weetjes.3') },
      { begrip: 'reeks', tekst: t('meldingen.weetjes.4') },
    ].map((r) => h('div', { class: 'meldingen__weetje' }, begripTegel(r.begrip, { familie: 'neutraal' }), h('p', { class: 'meldingen__weetjetekst' }, r.tekst)));
    // Hoogstens één kaart "Goed om te weten". Het laatste weetje (over het voorbeeld) kan als bijschrift onder de stapel in de kaart "Zo ziet het eruit"
    // staan; de kaart heeft dan drie weetjes. Vormen: 2x2 (vier), drie naast elkaar (drie) of onder elkaar; nooit een rastercel zonder weetje.
    // Twee kaarten met elk een eigen titel ("Goed om te weten" en "Je gegevens"), beide zo hoog als hun inhoud; het laatste weetje (over het voorbeeld)
    // staat als bijschrift in de kaart "Zo ziet het eruit" of bij de eerste kaart. Elke kaart kan in elke kolom staan: de plaats volgt uit de meting.
    const maakGoed = (titel, extra) => {
      const lijstEl = h('div', { class: 'meldingen__weetjes' });
      return { lijstEl, el: h('section', { class: ['meldingen__goed', extra] }, kaart({ klasse: 'meldingen__goedkaart' }, kaartkop({ tegel: begripOpties('uitleg'), label: titel }), lijstEl)) };
    };
    const goedA = maakGoed(t('instellingen.goedOmTeWeten'));
    const goedB = maakGoed(t('meldingen.gegevens'), 'meldingen__goed--gegevens');
    const goeds = [goedA, goedB];
    const verdeelWeetjes = ({ caption, aKolom, aVorm, bKolom }) => {
      const a = caption ? [weetjeNodes[0], weetjeNodes[2]] : [weetjeNodes[0], weetjeNodes[2], weetjeNodes[3]];
      goedA.lijstEl.replaceChildren(...a);
      goedB.lijstEl.replaceChildren(weetjeNodes[1]);
      bijschrift.replaceChildren(...(caption ? [weetjeNodes[3]] : []));
      bijschrift.hidden = !caption;
      goedA.el.classList.toggle('meldingen__goed--raster', aVorm === 'kol' && a.length === 2);
      goedA.el.classList.toggle('meldingen__goed--rij3', aVorm === 'kol' && a.length === 3);
      goedA.el.remove();
      goedB.el.remove();
      (aKolom === 'links' ? links : rechts).append(goedA.el);
      (bKolom === 'links' ? links : rechts).append(goedB.el);
    };
    const OPTIES = [];
    for (const caption of [false, true]) for (const aKolom of ['links', 'rechts']) for (const aVorm of ['lijst', 'kol']) for (const bKolom of ['links', 'rechts']) OPTIES.push({ caption, aKolom, aVorm, bKolom });
    const links = h('div', { class: 'meldingen__links' }, h('div', { class: 'instel__lijst' }, lijst));
    const rechts = h('div', { class: 'meldingen__rechts' }, voorbeeld);
    const inhoud = h(
      'div',
      { class: 'stapel stapel--sectie meer-sub meldingen' },
      schermkop({ titel: t('meldingen.titel'), acties: [terugKnop()] }),
      h('div', { class: 'instelscherm' }, links, rechts),
    );
    houder.replaceChildren(inhoud);
    // "Goed om te weten" staat in de kortste kolom (kleinste verschil tussen de kolomeinden); gemeten vóór het eerste zichtbare frame.
    // BESLISSING 324: op een breed scherm eindigen beide kolommen op dezelfde lijn. Het restverschil wordt onzichtbaar en begrensd verdeeld:
    // eerst over de hoogte van de kaartjes (tot 12 px) en de ruimte ertussen (tot 8 px), dan over de ruimte rond de klok (tot 40 px) als rechts korter is,
    // of over de rijen links (tot 8 px per rij) als links korter is.
    const REK = { kaartje: 8, gat: 12, klok: 100, rij: 6 };
    plaatsNu = () => {
      if (!links.isConnected) return;
      const zet = (el, naam, px) => el.style.setProperty(naam, `${px}px`);
      const wis = () => {
        zet(rechts, '--stapel-hoog', 0);
        zet(rechts, '--stapel-gat', 0);
        zet(rechts, '--klok-lucht', 0);
        zet(links, '--rij-rek', 0);
        for (const g of goeds) zet(g.el, '--weetje-rek', 0);
      };
      wis();
      tekenVoorbeeld();
      if (!breed.matches) {
        verdeelWeetjes({ caption: false, aKolom: 'rechts', aVorm: 'lijst', bKolom: 'rechts' });
        return;
      }
      // Tussenruimtes tussen de weetjes in de kaarten die in een kolom staan (voor de laatste, begrensde verdeling).
      const gatenIn = (kolom) => goeds.filter((g) => g.el.parentNode === kolom).reduce((som, g) => som + (g.el.classList.contains('meldingen__goed--raster') || g.el.classList.contains('meldingen__goed--rij3') ? 0 : Math.max(0, g.lijstEl.children.length - 1)), 0);
      // Naast elkaar alleen als elk weetje minstens ± 170 px krijgt.
      const geldig = (o) => !(o.aVorm === 'kol' && goedA.el.clientWidth - 48 < (goedA.lijstEl.children.length * 170 + (goedA.lijstEl.children.length - 1) * 24));
      // Een weetje over meer dan drie regels kost strafpunten (liever niet, maar de kolommen gelijk laten eindigen gaat voor).
      const lange = () => [...goedA.el.querySelectorAll('.meldingen__weetjetekst'), ...goedB.el.querySelectorAll('.meldingen__weetjetekst'), ...bijschrift.querySelectorAll('.meldingen__weetjetekst')].filter((p) => p.getBoundingClientRect().height > 3 * 23 + 1).length;
      const eind = (el) => el.getBoundingClientRect().bottom;
      const n = stapel.querySelectorAll('.meldingen__melding:not([hidden])').length;
      const rijen = links.querySelectorAll('.meldingen__hoofd, .meldingen__soort, .meldingen__uur, .meldingen__slot, .meldingen__toevoegen, .meldingen__details').length;
      const kaartCap = n * REK.kaartje + Math.max(0, n - 1) * REK.gat;
      const capR = kaartCap + REK.klok;
      const capL = rijen * REK.rij;
      const kies = () => {
        let b = null;
        for (const o of OPTIES) {
          verdeelWeetjes(o);
          if (!geldig(o)) continue;
          const d = eind(links) - eind(rechts);
          const rest = d > 0 ? Math.max(0, d - capR - rijen * 4) : Math.max(0, -d - capL - n * 8);
          const score = rest * 1000 + Math.abs(d) + (o.caption ? 30 : 0) + lange() * 60; // liefst alle vier de weetjes in de kaart
          if (!b || score < b.score) b = { o, score, rest, d };
        }
        return b ?? { o: OPTIES[4], score: Infinity, rest: Infinity, d: 0 };
      };
      let beste = kies();
      // Past het rechts nog niet (te kort), dan staat onder de stapel een rustige regel met een echt gegeven (het aantal meldingen van vandaag);
      // niet samen met het bijschrift (dan zou de boodschap dubbel zijn).
      if (beste.rest > 0 && beste.d > 0) {
        samenvatting.hidden = false;
        const tweede = kies();
        if (tweede.rest < beste.rest && !tweede.o.caption) beste = tweede;
        else samenvatting.hidden = true;
      }
      verdeelWeetjes(beste.o);
      let nodig = 0; // > 0: rechts groeit, < 0: links groeit
      for (let ronde = 0; ronde < 6; ronde += 1) {
        const d = eind(links) - eind(rechts);
        if (Math.abs(d) < 0.4 && ronde > 0) break;
        nodig += d;
        wis();
        if (nodig > 0) {
          const a = Math.min(nodig, kaartCap);
          const f = kaartCap ? a / kaartCap : 0;
          zet(rechts, '--stapel-hoog', REK.kaartje * f);
          zet(rechts, '--stapel-gat', REK.gat * f);
          const klok = Math.min(REK.klok, nodig - a);
          zet(rechts, '--klok-lucht', klok);
          let over = nodig - a - klok;
          // Daarna de ruimte tussen de weetjes rechts (tot 8 px per tussenruimte).
          const gatenR = gatenIn(rechts);
          if (over > 0 && gatenR) {
            const w = Math.min(6 * gatenR, over);
            for (const g of goeds) if (g.el.parentNode === rechts) zet(g.el, '--weetje-rek', w / gatenR);
            over -= w;
          }
          // Rechts kan niet verder: dan worden de rijen links iets lager (tot 4 px).
          if (over > 0 && rijen) zet(links, '--rij-rek', -Math.min(4, over / rijen));
        } else if (nodig < 0) {
          const e = -nodig;
          const rek = rijen ? Math.min(REK.rij, e / rijen) : 0;
          zet(links, '--rij-rek', rek);
          let over = e - rek * rijen;
          // Daarna de ruimte tussen de weetjes links (tot 8 px per tussenruimte; 2x2 telt per rij).
          const gatenL = gatenIn(links);
          if (over > 0 && gatenL) {
            const w = Math.min(6 * gatenL, over);
            for (const g of goeds) if (g.el.parentNode === links) zet(g.el, '--weetje-rek', w / gatenL);
            over -= w;
          }
          // Links kan niet verder: dan worden de kaartjes rechts iets lager (tot 8 px).
          if (over > 0 && n) zet(rechts, '--stapel-hoog', -Math.min(8, over / n));
        }
      }
    };
    plaatsNu();
    // Nadat de lettertypen geladen zijn kunnen regels anders breken: dan opnieuw plaatsen (nooit terwijl er focus in het scherm staat).
    document.fonts?.ready.then(() => {
      if (!weg && mijn === teken0 && !houder.contains(document.activeElement)) plaatsNu?.();
    });
    if (focus) houder.querySelector(`[data-meldingen="${focus}"]`)?.focus({ preventScroll: true });
  }

  // Bij een andere venstergrootte opnieuw plaatsen, maar nooit terwijl een veld of schakelaar focus heeft (dan blijft alles staan).
  const opMaat = () => {
    if (!houder.contains(document.activeElement)) plaatsNu?.();
  };
  breed.addEventListener('change', opMaat);
  window.addEventListener('resize', opMaat);
  // Kon de dienst de uren niet ontvangen? Dan zegt het scherm dat (de app probeert het later opnieuw, zie push.js).
  // De uren staan bewaard op het toestel en gaan vanzelf mee; tot geeft het tijdstip vanaf wanneer (of niets), getoond in lokale tijd als UU:MM.
  const stopMislukt = luister('meldingen:mislukt', ({ tot } = {}) => {
    const d = Number(tot) > Date.now() ? new Date(Number(tot)) : null;
    const uur = d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
    strook(d ? t('meldingen.misluktTot', { uur }) : t('meldingen.misluktLater'), { duur: 5000 });
  });
  teken();
  return () => {
    weg = true;
    stopMislukt();
    breed.removeEventListener('change', opMaat);
    window.removeEventListener('resize', opMaat);
  };
}
