// De pagina-indeling van de pdf van het verslag (BESLISSING 420): dagen lopen door, elke pagina behalve de laatste is goed gevuld,
// niets breekt midden in een rij, tekstregel, kerncijferblok of dagkop, een dagkop staat nooit alleen onderaan, de laatste pagina is geen
// weeskind, de voet telt juist en elke rij uit het model staat er precies één keer in.
import 'fake-indexeddb/auto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { zetNotitie } from '../../src/data/dagen.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { leesVerslag } from '../../src/data/verslag.js';
import { bouwVerslagModel } from '../../src/ui/verslag-model.js';
import { maakPdf } from '../../src/ui/verslag-pdf.js';
import { maakFont } from '../../src/ui/pdf-fonts.js';
import { zetTokensBron } from '../../src/ui/pdf-tokens.js';

zetTokensBron(readFileSync(new URL('../../bloei-huisstijl/tokens.css', import.meta.url), 'utf8'));
const wortel = new URL('../../node_modules/@fontsource/', import.meta.url);
const lees = (pad) => new Uint8Array(readFileSync(new URL(pad, wortel)));
const FONTS = {
  serif: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff')),
  serifSchuin: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff'), { schuin: -12 }),
  sans: maakFont(lees('jost/files/jost-latin-400-normal.woff')),
  sansMedium: maakFont(lees('jost/files/jost-latin-500-normal.woff')),
};
const H = 841.89;
const MIN_VULLING = 0.8; // elke pagina behalve de laatste
const MIN_LAATSTE = 150; // pt inhoud op de laatste pagina van een verslag van meer dan één pagina

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

const dag = (n) => plusDagen(vandaag(), n);
const lang = (n, woord) => woord.repeat(Math.ceil(n / woord.length)).slice(0, n).trim();
const MAALTIJDEN = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];

// Drie soorten vulling; n is het volgnummer van de dag (0 = de oudste), zodat dagen met weinig en met veel rijen elkaar afwisselen.
const VULLING = {
  // weinig: één of twee maaltijden en water, soms een lege dag; zonder Gewicht en Notities
  weinig: {
    onderdelen: { eten: true, drinken: true, gewicht: false, notities: false },
    async vul(datum, n) {
      if (n % 4 === 3) return;
      await bewaarMaaltijd(datum, 'ontbijt', { tekst: 'brood met kaas', tijd: '08:00' });
      if (n % 2) await bewaarMaaltijd(datum, 'middagmaal', { tekst: 'soep', tijd: '12:00' });
      await voegDrankToe(datum, 'water', 1000 + (n % 3) * 250);
    },
  },
  // gewoon: drie maaltijden, twee dranken, om de drie dagen een korte notitie, wekelijks een weging
  gewoon: {
    onderdelen: { eten: true, drinken: true, gewicht: true, notities: true },
    async vul(datum, n) {
      for (const [i, soort] of ['ontbijt', 'middagmaal', 'avondmaal'].entries()) await bewaarMaaltijd(datum, soort, { tekst: `testmaaltijd ${i + 1} met fruit`, tijd: `${String(8 + i * 5).padStart(2, '0')}:15` });
      await voegDrankToe(datum, 'water', 500 + (n % 4) * 400);
      await voegDrankToe(datum, 'thee', 200);
      if (n % 3 === 0) await zetNotitie(datum, 'Een rustige dag, goed geslapen.');
      if (n % 7 === 0) await bewaarWeging(datum, 68 + (n % 5) * 0.2);
    },
  },
  // vol: zes maaltijden (soms lange teksten), vier dranken, elke dag een notitie, soms een lange of zeer lange notitie, soms een lege dag
  vol: {
    onderdelen: { eten: true, drinken: true, gewicht: true, notities: true },
    async vul(datum, n) {
      if (n % 9 === 8) return;
      for (const [i, soort] of MAALTIJDEN.entries()) {
        const tekst = (n + i) % 4 === 0 ? lang(200, 'groenten met rijst en kip ') : 'havermout met fruit en noten';
        await bewaarMaaltijd(datum, soort, { tekst, tijd: `${String(7 + i * 3).padStart(2, '0')}:15` });
      }
      for (const soort of ['water', 'thee', 'koffie', 'sap']) await voegDrankToe(datum, soort, 250);
      const notitie = n % 11 === 10 ? lang(2500, 'een zeer lange notitie over de dag ') : n % 5 === 0 ? lang(900, 'een lange notitie over de dag ') : 'Een rustige dag, goed geslapen.';
      await zetNotitie(datum, notitie);
      if (n % 7 === 0) await bewaarWeging(datum, 70 - (n % 5) * 0.3);
    },
  },
};
const AANTALLEN = [1, 2, 3, 7, 14, 30, 366];

async function vulAlles(soort) {
  await db.delete();
  await openDb();
  for (let n = 0; n < 366; n += 1) await VULLING[soort].vul(dag(n - 365), n);
}

async function maak(soort, aantal) {
  const doc = bouwVerslagModel(await leesVerslag({ van: dag(-(aantal - 1)), tot: dag(0), onderdelen: VULLING[soort].onderdelen }), 'Marie');
  const pdf = maakPdf(doc, FONTS, { meet: true, nu: new Date(2026, 10, 15) });
  return { doc, pdf, m: pdf.meting };
}

// Vulgraad per pagina: het deel van de inhoudshoogte (tussen kop en voet) dat gebruikt is.
const vulgraad = (m) => m.eindPerPagina.map((eind) => (eind - m.top) / (m.bodem - m.top));

// Wat het model belooft, per dag: de labels van de rijen in volgorde en de tekst van de notitie (zoals verslag-pdf.js ze opbouwt).
function verwachteRijen(doc) {
  const o = doc.onderdelen ?? {};
  if (!doc.dagen.some((d) => !d.leeg)) return new Map();
  return new Map(
    doc.dagen.map((d, i) => {
      const labels = [];
      if (!d.leeg) {
        if (o.eten) {
          const eten = d.rijen.filter((r) => r.soort === 'eten');
          if (eten.length) eten.forEach((r) => labels.push(r.titel));
          else labels.push('Eten');
        }
        if (o.notities && d.notitie) labels.push('Notitie');
        if (o.drinken) labels.push('Drinken');
      }
      return [`dag${i}`, { labels: labels.length ? labels : ['Niets genoteerd'], notitie: o.notities && !d.leeg ? d.notitie : '' }];
    }),
  );
}

// Alle eisen van BESLISSING 420 op één gemeten pdf; geeft een lijst fouten.
function controleerPaginas(doc, m) {
  const fouten = [];
  const kort = m.paginas === 1 && m.h < H - 0.5; // BESLISSING 332: één pagina zo hoog als de inhoud
  const bodem = kort ? m.h - 46 : m.bodem;
  // 1. niets buiten het inhoudsvlak: geen cel (rij, dagkop, kerncijfer) en geen tekstregel over de onderrand of een paginagrens
  for (const c of m.cellen) {
    if (c.y < m.top - 0.5 || c.y + c.h > bodem + 0.5) fouten.push(`cel ${c.soort} "${c.tekst.slice(0, 30)}" op pagina ${c.pagina + 1} van ${c.y.toFixed(1)} tot ${(c.y + c.h).toFixed(1)}`);
  }
  for (const t of m.teksten) {
    const kopOfVoet = t.bottom < 60 || t.top > m.h - 46;
    if (!kopOfVoet && (t.top < m.top - 1 || t.bottom > bodem + 0.5)) fouten.push(`tekst "${t.tekst.slice(0, 30)}" op pagina ${t.pagina + 1} over de rand (${t.top.toFixed(1)}-${t.bottom.toFixed(1)})`);
  }
  // 2. een rij wordt in één keer op één pagina getekend; al haar tekstregels liggen binnen de rij (en de rij binnen de pagina, zie 1)
  const rijen = m.cellen.filter((c) => c.soort === 'rij' && c.kolom !== 0);
  for (const r of rijen) {
    const regels = m.teksten.filter((t) => t.pagina === r.pagina && t.vak && Math.abs(t.vak.top - r.y) < 0.01 && Math.abs(t.vak.bottom - (r.y + r.h)) < 0.01);
    if (!regels.length) fouten.push(`rij "${r.tekst.slice(0, 30)}" zonder tekst op pagina ${r.pagina + 1}`);
    for (const t of regels) if (t.top < r.y - 1.5 || t.bottom > r.y + r.h + 1.5) fouten.push(`regel "${t.tekst.slice(0, 30)}" buiten haar rij`);
  }
  // 3. een dagkop (ook "(vervolg)") of de kop van de gewichttabel staat nooit als laatste op een pagina: er volgen minstens twee rijen (of alle rijen van die dag)
  const verwacht = verwachteRijen(doc);
  for (const kop of m.cellen.filter((c) => c.soort === 'dagkop')) {
    const na = m.cellen.filter((c) => c.soort === 'rij' && c.kolom === 0 && c.tabelId === kop.tabelId && c.pagina === kop.pagina && c.y > kop.y);
    const totaal = m.cellen.filter((c) => c.soort === 'rij' && c.kolom === 0 && c.tabelId === kop.tabelId).length;
    if (na.length < Math.min(2, totaal)) fouten.push(`dagkop "${kop.tekst}" op pagina ${kop.pagina + 1} met ${na.length} rij(en) eronder`);
  }
  for (const kop of m.cellen.filter((c) => c.soort === 'gewichtkop')) {
    const na = m.cellen.filter((c) => c.soort === 'gewicht' && c.pagina === kop.pagina && c.y > kop.y);
    if (na.length < Math.min(2, doc.gewicht?.wegingen.length ?? 0)) fouten.push(`gewichtkop op pagina ${kop.pagina + 1} met ${na.length} rij(en) eronder`);
  }
  // 4. elke pagina behalve de laatste is voor minstens 80 % gevuld; de laatste is geen weeskind
  const v = vulgraad(m);
  v.slice(0, -1).forEach((f, i) => f < MIN_VULLING && fouten.push(`pagina ${i + 1} van ${m.paginas} maar ${(f * 100).toFixed(0)} % gevuld`));
  if (m.paginas > 1 && m.eindPerPagina.at(-1) - m.top < MIN_LAATSTE) fouten.push(`laatste pagina maar ${(m.eindPerPagina.at(-1) - m.top).toFixed(0)} pt inhoud`);
  // 5. de voet: op elke pagina precies één keer "Pagina i van n", met n het echte aantal pagina's
  for (let i = 0; i < m.paginas; i += 1) {
    const voet = m.teksten.filter((t) => t.pagina === i && /^Pagina \d+ van \d+$/.test(t.tekst));
    if (voet.length !== 1 || voet[0].tekst !== `Pagina ${i + 1} van ${m.paginas}`) fouten.push(`voet pagina ${i + 1}: ${voet.map((t) => t.tekst).join(', ')}`);
  }
  // 6. elke rij uit het model precies één keer, in de volgorde van het model; de notitie volledig en niet dubbel
  const volgorde = (a, b) => a.pagina - b.pagina || a.y - b.y;
  for (const [id, { labels, notitie }] of verwacht) {
    const cellen = m.cellen.filter((c) => c.soort === 'rij' && c.tabelId === id).sort(volgorde);
    const links = cellen.filter((c) => c.kolom === 0);
    const rechts = (c) => cellen.find((q) => q.kolom !== 0 && q.pagina === c.pagina && q.y === c.y);
    // een lege dag is één brede rij "Niets genoteerd"; een vervolgstuk van de notitie heeft geen label en telt bij de rij Notitie
    const zonderVervolg = links.map((c) => (rechts(c)?.kolom === 2 ? rechts(c).tekst : c.tekst)).filter((x) => x !== '');
    if (JSON.stringify(zonderVervolg) !== JSON.stringify(labels)) fouten.push(`${id}: rijen ${JSON.stringify(zonderVervolg)} in plaats van ${JSON.stringify(labels)}`);
    if (notitie) {
      const stukken = [];
      let inNotitie = false;
      for (const c of links) {
        if (c.tekst === 'Notitie') inNotitie = true;
        else if (c.tekst !== '') inNotitie = false;
        if (inNotitie) stukken.push(rechts(c).tekst);
      }
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      if (norm(stukken.join(' ')) !== norm(notitie)) fouten.push(`${id}: notitie niet precies één keer volledig (${norm(stukken.join(' ')).length} van ${norm(notitie).length} tekens)`);
    }
    if (doc.dagen.length > 1) {
      const koppen = m.cellen.filter((c) => c.soort === 'dagkop' && c.tabelId === id && !c.tekst.endsWith('(vervolg)'));
      if (koppen.length !== 1) fouten.push(`${id}: ${koppen.length} dagkoppen`);
    }
  }
  // de dagen in hun volgorde
  const eersteKop = [...verwacht.keys()].map((id) => m.cellen.find((c) => c.soort === 'dagkop' && c.tabelId === id)).filter(Boolean);
  for (let i = 1; i < eersteKop.length; i += 1) if (volgorde(eersteKop[i - 1], eersteKop[i]) >= 0) fouten.push(`dag ${i} staat niet na dag ${i - 1}`);
  // het gewicht: elke weging één keer
  if (doc.gewicht?.tabel) {
    const w = m.cellen.filter((c) => c.soort === 'gewicht').map((c) => c.tekst);
    if (JSON.stringify(w) !== JSON.stringify(doc.gewicht.wegingen.map((x) => x.kgTekst))) fouten.push(`wegingen ${w.length} van ${doc.gewicht.wegingen.length}`);
  }
  // en geen kerncijferblok gebroken: alle blokken op pagina 1
  if (m.cellen.some((c) => c.soort === 'kerncijfer' && c.pagina !== 0)) fouten.push('kerncijfers niet op pagina 1');
  return fouten;
}

const UIT = process.env.PAGINA_DIR;
const LABEL = process.env.PAGINA_LABEL ?? 'na';
const meetregels = [];
if (UIT) mkdirSync(UIT, { recursive: true });
afterAll(() => {
  if (UIT) writeFileSync(`${UIT}/meting-${LABEL}.json`, JSON.stringify(meetregels, null, 1));
});

for (const soort of Object.keys(VULLING)) {
  describe(`pagina-indeling met vulling "${soort}" (BESLISSING 420)`, () => {
    beforeAll(() => vulAlles(soort), 120000);
    for (const aantal of AANTALLEN) {
      test(`${aantal} dag(en): goed gevuld, nergens gebroken, alles één keer, voet juist`, async () => {
        const { doc, pdf, m } = await maak(soort, aantal);
        const v = vulgraad(m);
        meetregels.push({ soort, aantal, paginas: m.paginas, vulling: v.map((f) => Math.round(f * 100)), laatstePt: Math.round(m.eindPerPagina.at(-1) - m.top) });
        if (UIT && aantal !== 366) writeFileSync(`${UIT}/${LABEL}-${soort === 'gewoon' ? '' : soort + '-'}${aantal}.pdf`, pdf);
        expect(controleerPaginas(doc, m)).toEqual([]);
        expect(pdf.paginas).toBe(m.paginas);
      }, 60000);
    }
  });
}

describe('de regels van de verdeling', () => {
  beforeAll(async () => {
    await db.delete();
    await openDb();
  });

  // Een dag die niet meer past, schuift alleen heel door als er dan bijna niets leeg blijft (0.5.9); anders wordt ze tussen twee rijen gesplitst
  // en krijgt het vervolg de dagkop opnieuw met "(vervolg)". Een dag langer dan een pagina wordt altijd gesplitst.
  test('een dag langer dan een pagina wordt gesplitst, met de dagkop "(vervolg)" en de kolomkop op de volgende pagina', async () => {
    for (let n = 0; n < 3; n += 1) {
      for (const soort of MAALTIJDEN) await bewaarMaaltijd(dag(n - 2), soort, { tekst: 'havermout met fruit en noten', tijd: '08:00' });
      await voegDrankToe(dag(n - 2), 'water', 1500);
      await zetNotitie(dag(n - 2), n === 1 ? lang(9000, 'een zeer lange notitie over de dag ') : 'Een rustige dag.');
    }
    const doc = bouwVerslagModel(await leesVerslag({ van: dag(-2), tot: dag(0), onderdelen: VULLING.vol.onderdelen }), 'Marie');
    const m = maakPdf(doc, FONTS, { meet: true }).meting;
    expect(controleerPaginas(doc, m)).toEqual([]);
    const vervolg = m.cellen.filter((c) => c.soort === 'dagkop' && c.tekst.endsWith('(vervolg)'));
    expect(vervolg.length).toBeGreaterThanOrEqual(1);
    for (const v of vervolg) {
      expect(v.y).toBeCloseTo(m.top, 1); // bovenaan de pagina
      expect(m.cellen.some((c) => c.soort === 'kop' && c.pagina === v.pagina && Math.abs(c.y - (v.y + 21)) < 0.6)).toBe(true);
    }
  });

  test('dagen lopen door: op een pagina staan meerdere dagen, zonder verplichte nieuwe pagina per dag', async () => {
    await db.delete();
    await openDb();
    for (let n = 0; n < 14; n += 1) await VULLING.gewoon.vul(dag(n - 13), n);
    const { m } = await maak('gewoon', 14);
    expect(m.paginas).toBeGreaterThan(1);
    const perPagina = new Map();
    for (const c of m.cellen.filter((q) => q.soort === 'dagkop')) perPagina.set(c.pagina, (perPagina.get(c.pagina) ?? 0) + 1);
    expect(Math.max(...perPagina.values())).toBeGreaterThan(1);
  });
});
