// Het verslag als één document-model, voor het voorbeeld op het scherm, het afdrukken én de pdf: één opbouwfunctie voor de inhoud,
// drie weergaven. PLAN.md §16.14, BESLISSING 154 en 158. Geen oordeel, geen score, geen percentages: alleen wat er is bijgehouden.
//
// bouwVerslagModel(verslag, naam, nu) → {
//   kop: { titel, voornaam, periode },
//   samenvatting: [{ label, waarde }],
//   dagen: [{ datum, titel, leeg, rijen: [Rij], notitie }],
//   gewicht: null | { titel, rijen: [{ label, waarde }] },
//   voet: 'Bloei · gemaakt op ...'
//   Voor de pdf erbij (het vel op het scherm mag ze ook tonen): kerncijfers [{ label, waarde }], dagdoelMl, periodeLang, periodeKort, gemaaktOp,
//   kop.naam (de kale voornaam), per dag titelJaar, datumJaar, drinkenMl, aantalMaaltijden, en bij gewicht wegingen [{ datum, datumTekst, kg, kgTekst, verschil }]
// }
// Rij: { soort: 'eten', icoon, titel, tekst } | { soort: 'drinken', icoon, titel, tekst, detail }
import { t } from '../teksten.js';
import { voornaamVan } from '../logica/naam.js';
import { opmaakDatum } from '../kern/datum.js';
import { opmaakKg, opmaakLiter, opmaakMl, opmaakVerschil } from '../kern/getal.js';
import { ICOON } from './iconenkaart.js';

const MAALTIJDICOON = { ontbijt: 'mug-saucer', tussendoortje: 'apple-whole', middagmaal: 'bowl-food', vieruurtje: 'cookie-bite', avondmaal: 'utensils', latesnack: 'moon' };
const DRANKICOON = { water: 'eigen/kan-water', thee: 'mug-hot', koffie: 'mug-saucer', sap: 'lemon', frisdrank: 'bottle-water', anders: 'glass-water' };
const SOORTEN = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];

const STREEP = '-';
const hoofdletter = (tekst) => tekst.charAt(0).toUpperCase() + tekst.slice(1);
const dagTitel = (datum) => hoofdletter(opmaakDatum(datum, 'lang'));

// Op papier staat het jaar altijd bij de datum (de lange vorm laat het jaar weg als het dit jaar is: een nu uit een ander jaar dwingt het af).
const ANDER_JAAR = new Date(1900, 0, 1);
const datumMetJaar = (datum) => opmaakDatum(datum, 'lang', ANDER_JAAR); // maandag 9 november 2026
// BESLISSING 487: de periode van "Deze week" op een maandag (weekverslag met één getoonde dag); het blokje in Delen toont dezelfde tekst.
export const weekVanTitel = (van) => hoofdletter(t('delen.weekVan', { datum: datumMetJaar(van) })); // Week van maandag 16 november 2026
const datumKortMetJaar =(datum) => `${opmaakDatum(datum, 'kort').split(' ')[0]} ${datumMetJaar(datum).split(' ').slice(1).join(' ')}`; // ma 9 november 2026
const datumKortst = (datum) => `${opmaakDatum(datum, 'kort')} ${datum.slice(0, 4)}`; // ma 9 nov 2026

function dagRijen(dag) {
  const rijen = [];
  // De maaltijden in de vaste volgorde van de dag (ontbijt tot late snack), niet op het ingevulde uur
  const orde = (m) => Object.keys(MAALTIJDICOON).indexOf(m.soort);
  for (const m of [...(dag.eten ?? [])].sort((a, b) => orde(a) - orde(b))) {
    rijen.push({ soort: 'eten', maaltijd: m.soort, icoon: MAALTIJDICOON[m.soort] ?? 'utensils', titel: t('maaltijd.' + m.soort), tekst: m.tekst });
  }
  if (dag.drinken && dag.drinken.ml > 0) {
    const detail = SOORTEN.filter((s) => dag.drinken.perSoort[s]).map((s) => `${t('drank.' + s)} ${opmaakMl(dag.drinken.perSoort[s])}`);
    rijen.push({ soort: 'drinken', icoon: ICOON.drinken.naam, titel: t('tab.drinken'), tekst: opmaakLiter(dag.drinken.ml), detail: detail.length > 1 ? detail.join(' · ') : '', soorten: SOORTEN.filter((s) => dag.drinken.perSoort[s]).map((s) => ({ soort: s, naam: t('drank.' + s), ml: dag.drinken.perSoort[s], aantal: dag.drinken.aantalPerSoort?.[s] ?? 1, mlTekst: opmaakMl(dag.drinken.perSoort[s]) })) });
  }
  return rijen;
}

// naam is de voornaam uit het profiel (mag leeg zijn). nu is de datum van het maken (voor de voet).
export function bouwVerslagModel(verslag, naam = '', nu = new Date()) {
  const voornaam = voornaamVan(naam);
  const s = verslag.samenvatting;
  // BESLISSING 457: "Deze week" (verslag.weekverslag) is altijd een weekverslag, ook op maandag met één getoonde dag: kerncijfers van de week,
  // titel "Week van maandag 16 november 2026". Elke andere periode van één dag is een dagverslag.
  const eenDatum = verslag.van === verslag.tot;
  const weekVanEenDag = eenDatum && Boolean(verslag.weekverslag);
  const enkeleDag = eenDatum && !verslag.weekverslag;
  // Voor één dag valt de samenvatting weg: de dag zelf is het verslag.
  // De noemer van "X van N dagen": 7 voor "Deze week" (BESLISSING 448), anders het aantal dagen van de periode (data/verslag.js, samenvatting.noemer).
  const noemer = s.noemer ?? s.dagen;
  const samenvatting = enkeleDag ? [] : [{ label: t('delen.dagenIngevuld'), waarde: t('delen.dagenIngevuldWaarde', { n: s.ingevuldeDagen, m: noemer }) }];
  if (!enkeleDag && s.gemiddeldMl != null && verslag.onderdelen.drinken) samenvatting.push({ label: t('delen.gemiddeldGedronken'), waarde: t('delen.perDag', { liter: opmaakLiter(s.gemiddeldMl) }) });

  const dagen = verslag.dagen.map((dag) => {
    const rijen = dagRijen(dag);
    return {
      datum: dag.datum,
      titel: dagTitel(dag.datum),
      kort: hoofdletter(opmaakDatum(dag.datum, 'kort')),
      titelJaar: hoofdletter(datumMetJaar(dag.datum)), // voor de pdf: Maandag 9 november 2026
      datumJaar: datumKortMetJaar(dag.datum), // ma 9 november 2026
      drinkenMl: dag.drinken ? dag.drinken.ml : null, // de totale hoeveelheid van die dag (null als Drinken niet in het verslag zit)
      aantalMaaltijden: (dag.eten ?? []).length,
      // de samenvatting rechts in de dagband: "4 maaltijden · 2,98 l gedronken" (alleen wat er is en wat gekozen is)
      bandTekst: [
        verslag.onderdelen?.eten && (dag.eten ?? []).length ? t((dag.eten ?? []).length === 1 ? 'delen.pdfEenMaaltijd' : 'delen.pdfAantalMaaltijden', { n: (dag.eten ?? []).length }) : '',
        verslag.onderdelen?.drinken && dag.drinken?.ml > 0 ? t('delen.pdfGedronkenSom', { liter: opmaakLiter(dag.drinken.ml) }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
      // leeg: er is die dag niets genoteerd (of niets van wat gekozen is)
      leeg: Boolean(dag.leeg) || (!rijen.length && !dag.notitie),
      notitieAanwezig: Boolean(dag.notitie),
      rijen,
      notitie: dag.notitie ?? '',
    };
  });

  const gewicht = verslag.gewicht?.length
    ? {
        titel: t('delen.gewicht'),
        rijen: verslag.gewicht.map((w) => ({ label: opmaakDatum(w.datum, 'kort'), waarde: opmaakKg(w.kg) })),
        // voor de pdf: datum met jaar, het gewicht, het verschil met de vorige weging in de periode en dat met de eerste (de eerste heeft er geen)
        wegingen: verslag.gewicht.map((w, i, lijst) => ({
          datum: w.datum,
          datumTekst: datumKortMetJaar(w.datum),
          kg: w.kg,
          kgTekst: opmaakKg(w.kg),
          verschil: i ? opmaakVerschil(w.kg - lijst[i - 1].kg) : '',
          verschilEerste: i ? opmaakVerschil(w.kg - lijst[0].kg) : '',
        })),
      }
    : null;

  // Kerncijfers, één rij met even brede blokken: alleen feiten (geen score, geen percentage). Elk blok: label, getal (+ eenheid) en een onderregel.
  // Voor één dag staat er een eigen set (hieronder). label/waarde blijven bestaan (waarde = getal en eenheid samen).
  const aan = verslag.onderdelen ?? {};
  const kerncijfers = [];
  const kc = (label, getal, eenheid, onder) => kerncijfers.push({ label, waarde: eenheid ? `${getal} ${eenheid}` : getal, getal, eenheid, onder });
  const vanDagen = t('delen.kcVanDagen', { m: noemer });
  if (!enkeleDag) {
    kc(t('delen.dagenIngevuld'), String(s.ingevuldeDagen), '', vanDagen);
    if (aan.eten) kc(t('delen.pdfMaaltijden'), String(s.maaltijden ?? 0), '', t('delen.kcGenoteerd'));
    if (aan.drinken && s.gemiddeldMl != null) {
      const [liter, ...eenheid] = opmaakLiter(s.gemiddeldMl).split(/\s/);
      kc(t('delen.kcGedronken'), liter, eenheid.join(' '), t('delen.kcGemiddeldPerDag'));
      if (s.dagdoelMl > 0) kc(t('delen.kcDagdoel'), String(s.dagdoelDagen ?? 0), '', vanDagen);
    }
    if (aan.gewicht) {
      const laatste = gewicht?.wegingen.at(-1);
      if (laatste) {
        const [getalKg, ...eenheidKg] = laatste.kgTekst.split(/\s/);
        const delen = datumMetJaar(laatste.datum).split(' '); // maandag 9 november 2026
        kc(t('delen.pdfLaatsteWeging'), getalKg, eenheidKg.join(' '), `${opmaakDatum(laatste.datum, 'kort').split(' ')[0]} ${delen[1]} ${delen[2]}`);
      } else kc(t('delen.pdfLaatsteWeging'), STREEP, '', t('delen.kcNietGewogen'));
    }
  }
  // BESLISSING 331: ook één dag heeft een rij kerncijfers, voor die ene dag: maaltijden (van de zes mogelijke), gedronken met het dagdoel (zonder oordeel) en
  // de weging van die dag. De notitie is geen kerncijfer: ze staat zelf in de tabel.
  if (enkeleDag) {
    const dagGegevens = verslag.dagen[0] ?? {};
    if (aan.eten) kc(t('delen.pdfMaaltijden'), String((dagGegevens.eten ?? []).length), '', t('delen.kcDagMaaltijden', { m: Object.keys(MAALTIJDICOON).length }));
    // BESLISSING 333: getal in de cijferletter, eenheid (l, %, kg) in één kleinere maat erachter; geen woorden in de cijferletter.
    if (aan.drinken) {
      const ml = dagGegevens.drinken?.ml ?? 0;
      const doel = s.dagdoelMl ?? 0;
      const [liter, ...eenheid] = opmaakLiter(ml).split(/\s/);
      kc(t('delen.kcGedronken'), liter, eenheid.join(' '), doel > 0 ? t('delen.kcDagVanDoel', { doel: opmaakLiter(doel) }) : t('delen.kcDagOpDieDag'));
      if (doel > 0) {
        // Onder het doel nooit "100 %" of "nog 0 l": het percentage blijft hoogstens 99 en het restant is minstens 0,01 l; de liters tellen op (0,95 + 1,55 = 2,5)
        const gehaald = ml >= doel;
        const rest = Math.max(10, doel - Math.round(ml / 10) * 10);
        kc(t('delen.kcDagDoelLabel'), String(gehaald ? 100 : Math.min(99, Math.round((ml / doel) * 100))), '%', gehaald ? t('delen.kcDagGehaald') : t('delen.kcDagNog', { liter: opmaakLiter(rest) }));
      }
    }
    // Het gewicht alleen als er die dag gewogen is (een leeg blok is er niet); onderregel: het verschil met de vorige weging
    const weging = aan.gewicht ? gewicht?.wegingen.at(-1) : null;
    if (weging) {
      const [getalKg, ...eenheidKg] = weging.kgTekst.split(/\s/);
      const vorige = verslag.vorigeWeging;
      const onder = vorige ? t('delen.kcDagVerschil', { verschil: opmaakVerschil(weging.kg - vorige.kg), datum: opmaakDatum(vorige.datum, 'kort').split(' ').slice(1).join(' ') }) : t('delen.kcDagWeging');
      kc(t('delen.pdfKolomGewicht'), getalKg, eenheidKg.join(' '), onder);
    }
  }
  // Het gewicht krijgt alleen een tabel bij twee of meer wegingen; één weging zegt het kerncijfer al (zonder kerncijfers blijft de tabel)
  if (gewicht) gewicht.tabel = gewicht.wegingen.length >= 2 || !kerncijfers.length;
  const periodeLang = weekVanEenDag ? weekVanTitel(verslag.van) : hoofdletter(enkeleDag ? datumMetJaar(verslag.van) : `${datumMetJaar(verslag.van)} ${t('delen.pdfTot')} ${datumMetJaar(verslag.tot)}`);
  const periodeKort = eenDatum ? datumKortst(verslag.van) : `${datumKortst(verslag.van)} - ${datumKortst(verslag.tot)}`;
  const gemaaktOp = datumMetJaar(`${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`);

  return {
    kop: { naam: voornaam, titel: t('delen.verslagTitel'), voornaam: voornaam ? t('delen.verslagVan', { naam: voornaam }) : '', periode: hoofdletter(weekVanEenDag ? t('delen.weekVan', { datum: opmaakDatum(verslag.van, 'lang') }) : enkeleDag ? opmaakDatum(verslag.van, 'lang') : t('delen.periodeRegel', { van: opmaakDatum(verslag.van, 'lang'), tot: opmaakDatum(verslag.tot, 'lang') })) },
    samenvatting,
    kerncijfers,
    dagen,
    gewicht,
    gemaaktOp, // de datum van het maken, met jaar (voor de voet van de pdf)
    dagdoelMl: s.dagdoelMl ?? 0,
    periodeLang, // Maandag 9 november 2026 tot zondag 15 november 2026
    periodeKort, // ma 9 nov 2026 - zo 15 nov 2026
    voet: t('delen.voet', { datum: opmaakDatum(`${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`, 'lang', nu) }),
    leeg: dagen.every((d) => d.leeg) && !gewicht,
    // Eén dag: blokken op een staande pagina; twee tot zeven dagen: een weektabel op een liggende pagina; meer dan zeven (twee weken, een maand): een tabel met één rij per dag
    modus: verslag.dagen.length > 7 ? 'overzicht' : enkeleDag ? 'dag' : 'week',
    onderdelen: verslag.onderdelen,
  };
}
