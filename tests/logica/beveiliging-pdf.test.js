// Injectie in het verslag (BESLISSING 329): tekst van de gebruiker met html, pdf-tekens ( ) \ , emoji en heel lange reeksen komt
// letterlijk in de pdf, de pdf blijft geldig, en de bestandsnaam bevat nooit tekst van de gebruiker.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { zetNotitie } from '../../src/data/dagen.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegSupplementToe } from '../../src/data/supplementen.js';
import { leesVerslag } from '../../src/data/verslag.js';
import { bouwVerslagModel } from '../../src/ui/verslag-model.js';
import { maakPdf, verslagBestandsnaam } from '../../src/ui/verslag-pdf.js';
import { maakFont } from '../../src/ui/pdf-fonts.js';
import { zetTokensBron } from '../../src/ui/pdf-tokens.js';

zetTokensBron(readFileSync(new URL('../../bloei-huisstijl/tokens.css', import.meta.url), 'utf8'));
const wortel = new URL('../../node_modules/@fontsource/', import.meta.url);
const lees = (pad) => new Uint8Array(readFileSync(new URL(pad, wortel)));
const fonts = () => ({
  serif: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff')),
  serifSchuin: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff'), { schuin: -12 }),
  sans: maakFont(lees('jost/files/jost-latin-400-normal.woff')),
  sansMedium: maakFont(lees('jost/files/jost-latin-500-normal.woff')),
});
const dag = (n) => plusDagen(vandaag(), n);

// Tekens die in een pdf iets betekenen: ( ) \ en een regeleinde; en html.
const HTML = '<img src=x onerror=alert(1)> "><svg onload=alert(2)> <script>alert(3)</script>';
const PDF_TEKENS = String.raw`(haakje) \backslash) /Naam ET BT endstream %%EOF`;
const EMOJI = 'soep 🍲 met brood 🥖';

beforeEach(async () => {
  await db.delete();
  await openDb();
});

function geldigePdf(bytes) {
  const tekst = new TextDecoder('latin1').decode(bytes);
  expect(tekst.startsWith('%PDF-')).toBe(true);
  expect(tekst.trimEnd().endsWith('%%EOF')).toBe(true);
  const start = Number(tekst.match(/startxref\s+(\d+)\s+%%EOF\s*$/)?.[1]);
  expect(tekst.slice(start, start + 4)).toBe('xref');
  // Elke offset in de xref-tabel wijst naar "n 0 obj".
  const tabel = tekst.slice(start).match(/xref\s+0 (\d+)\s+([\s\S]*?)trailer/);
  const rijen = tabel[2].trim().split(/\s*\n\s*/).slice(1);
  rijen.forEach((rij, i) => {
    const offset = Number(rij.slice(0, 10));
    expect(tekst.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`).toBe(true);
  });
  return tekst;
}

describe('injectie in het verslag', () => {
  test('html, pdf-tekens, emoji en lange tekst komen letterlijk in de pdf; de pdf blijft geldig', async () => {
    const lang = 'a'.repeat(3000);
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: HTML, tijd: '08:00', gevoel: 3 });
    await bewaarMaaltijd(dag(-1), 'middagmaal', { tekst: PDF_TEKENS, tijd: '12:00', gevoel: 3 });
    await bewaarMaaltijd(dag(-1), 'avondmaal', { tekst: EMOJI + ' ' + lang, tijd: '18:00', gevoel: 3 });
    await zetNotitie(dag(-1), HTML + '\n' + PDF_TEKENS);
    await voegSupplementToe({ naam: HTML.slice(0, 60), hoeveelheid: PDF_TEKENS.slice(0, 40), aanwijzing: EMOJI, momenten: ['ochtend'] });
    const verslag = await leesVerslag({ van: dag(-1), tot: dag(-1), onderdelen: { eten: true, drinken: true, gewicht: false, notities: true } });
    const doc = bouwVerslagModel(verslag, String.raw`<b>vet</b>(naam)\x tweede`);
    const bytes = maakPdf(doc, fonts(), { meet: true });
    geldigePdf(bytes);

    // Alle getekende tekst achter elkaar, zonder de regeleinden die de opmaak toevoegt.
    const alles = bytes.meting.teksten.map((x) => x.tekst).join('').replace(/\s+/g, '');
    const zonderWit = (s) => s.replace(/\s+/g, '');
    expect(alles).toContain(zonderWit(HTML));
    expect(alles).toContain(zonderWit(PDF_TEKENS));
    expect(alles).toContain(zonderWit('soep 🍲 met brood'));
    // In de kop staat alleen de voornaam (het eerste woord).
    expect(alles).toContain(String.raw`Verslagvan<b>vet</b>(naam)\x`);
    // De tekst zelf staat nooit als leesbare pdf-tekenreeks in de inhoud: alleen als glief-nummers (hex), dus kan ze niets breken.
    const latin = new TextDecoder('latin1').decode(bytes);
    expect(latin).not.toContain('<script>');
    expect(latin).not.toContain(String.raw`\backslash`);
  });

  test('de bestandsnaam bevat alleen datums, nooit tekst van de gebruiker', () => {
    expect(verslagBestandsnaam({ van: '2026-11-15', tot: '2026-11-15' })).toBe('bloei-verslag-2026-11-15.pdf');
    expect(verslagBestandsnaam({ van: '2026-11-09', tot: '2026-11-15' })).toBe('bloei-verslag-2026-11-09-2026-11-15.pdf');
  });

  // Een teken buiten het BMP (een emoji in de naam) moet als surrogaatpaar in de /Title staan (src/ui/verslag-pdf.js, pdfTekst).
  test('de titel van de pdf (metadata) leest een emoji in de naam juist', async () => {
    const verslag = await leesVerslag({ van: dag(-1), tot: dag(-1), onderdelen: { eten: true, drinken: true, gewicht: false, notities: false } });
    const bytes = maakPdf(bouwVerslagModel(verslag, '🌸Naam'), fonts());
    const latin = geldigePdf(bytes);
    const hex = latin.match(/\/Title <([0-9a-f]+)>/i)[1];
    expect(hex.length % 4).toBe(0);
    const tekst = new TextDecoder('utf-16be').decode(Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16))));
    expect(tekst).toContain('🌸Naam');
  });
});
