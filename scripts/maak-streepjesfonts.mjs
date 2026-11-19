// Maakt de drie piepkleine lettertypes met alleen het korte streepje (U+002D), recht en met de maten van het schuine streepje van
// Cormorant Garamond (BESLISSING 460): public/fonts/streepje-500.woff, streepje-600.woff en streepje-500-italic.woff.
// Elk bestand heeft één glyph, een rechthoek, met dezelfde vooruitgang, linkermarge, lengte, dikte en hoogte als het streepje van
// Cormorant in dat gewicht en die stijl (gemeten op 500 px, in 1/1000 em: TEKENS hieronder), en dezelfde regelmaten
// (hhea 924 / -287, geen gap) als Cormorant. Eigen werk, zonder licentie van derden.
// Gebruik: node scripts/maak-streepjesfonts.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

// Eenheden van 1/1000 em. adv = vooruitgang, x0 = linkermarge, lengte, y0/y1 = onder- en bovenkant van het streepje boven de basislijn.
export const TEKENS = {
  'streepje-500': { naam: 'Streepje 500', adv: 323, x0: 28, lengte: 268, y0: 186, y1: 231 },
  'streepje-600': { naam: 'Streepje 600', adv: 323, x0: 28, lengte: 268, y0: 182, y1: 232 },
  'streepje-500-italic': { naam: 'Streepje 500 Italic', adv: 305, x0: 28, lengte: 256, y0: 190, y1: 237 },
};
const UPM = 1000;
const ASC = 924;
const DESC = -287;

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const rij = (...delen) => Buffer.concat(delen);
const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
const som = (b) => { let s = 0; const p = pad4(b); for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0; return s; };

function tabellen({ naam, adv, x0, lengte, y0, y1 }) {
  const x1 = x0 + lengte;
  const dik = y1 - y0;
  // glyph 1: één rechthoek; TrueType wil de buitenlijn met de klok mee
  const glyph = pad4(rij(i16(1), i16(x0), i16(y0), i16(x1), i16(y1), u16(3), u16(0), Buffer.from([1, 1, 1, 1]), i16(x0), i16(0), i16(lengte), i16(0), i16(y0), i16(dik), i16(0), i16(-dik)));
  const glyf = glyph;
  const loca = rij(u16(0), u16(0), u16(glyph.length / 2)); // korte offsets (delen door 2): glyph 0 leeg, glyph 1 = de rechthoek
  const hmtx = rij(u16(500), i16(0), u16(adv), i16(x0));
  const head = rij(u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5), u16(0x000b), u16(UPM), Buffer.alloc(16), i16(0), i16(y0), i16(adv), i16(y1), u16(0), u16(8), i16(2), i16(0), i16(0));
  const hhea = rij(u32(0x00010000), i16(ASC), i16(DESC), i16(0), u16(adv), i16(0), i16(0), i16(x1), i16(1), i16(0), i16(0), Buffer.alloc(8), i16(0), u16(2));
  const maxp = rij(u32(0x00010000), u16(2), u16(4), u16(1), u16(0), u16(0), u16(1), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0));
  const os2 = rij(u16(4), i16(adv), u16(500), u16(5), u16(0), i16(650), i16(600), i16(0), i16(75), i16(650), i16(600), i16(0), i16(350), i16(50), i16(250), i16(0), Buffer.alloc(10), u32(1), u32(0), u32(0), u32(0), Buffer.from('NONE'), u16(0x40), u16(0x2d), u16(0x2d), i16(ASC), i16(DESC), i16(0), u16(1097), u16(283), u32(1), u32(0), i16(0), i16(0), u16(0), u16(0x2d), u16(0));
  const cmap = rij(u16(0), u16(1), u16(3), u16(1), u32(12), u16(4), u16(32), u16(0), u16(4), u16(4), u16(1), u16(0), u16(0x2d), u16(0xffff), u16(0), u16(0x2d), u16(0xffff), i16(1 - 0x2d), i16(1), u16(0), u16(0));
  const tekst = (s) => Buffer.from(s, 'utf16le').swap16();
  const namen = [[1, naam], [2, 'Regular'], [4, naam], [6, naam.replace(/ /g, '-')]];
  const records = rij(...namen.map(([id, s], i) => rij(u16(3), u16(1), u16(0x409), u16(id), u16(tekst(s).length), u16(namen.slice(0, i).reduce((a, [, t]) => a + tekst(t).length, 0)))));
  const nameTabel = rij(u16(0), u16(namen.length), u16(6 + 12 * namen.length), records, ...namen.map(([, s]) => tekst(s)));
  const post = rij(u32(0x00030000), u32(0), i16(-100), i16(50), u32(0), u32(0), u32(0), u32(0), u32(0));
  return { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name: nameTabel, post };
}

export function maakFont(def) {
  const t = tabellen(def);
  const tags = Object.keys(t).sort();
  const n = tags.length;
  let machtVan2 = 1, log2 = 0;
  while (machtVan2 * 2 <= n) { machtVan2 *= 2; log2++; }
  // sfnt (voor de som van head.checkSumAdjustment)
  let offset = 12 + 16 * n;
  const rijen = tags.map((tag) => { const r = { tag, data: t[tag], offset, sum: som(t[tag]) }; offset += pad4(t[tag]).length; return r; });
  const sfntKop = rij(u32(0x00010000), u16(n), u16(machtVan2 * 16), u16(log2), u16(n * 16 - machtVan2 * 16), ...rijen.map((r) => rij(Buffer.from(r.tag), u32(r.sum), u32(r.offset), u32(r.data.length))));
  const sfnt = rij(sfntKop, ...rijen.map((r) => pad4(r.data)));
  const adj = (0xb1b0afba - som(sfnt)) >>> 0;
  const head = Buffer.from(t.head);
  head.writeUInt32BE(adj, 8);
  // woff: elke tabel gecomprimeerd als dat kleiner is
  const headRij = rijen.find((r) => r.tag === 'head');
  headRij.data = head;
  const comp = rijen.map((r) => { const z = deflateSync(r.data, { level: 9 }); return { ...r, z: z.length < r.data.length ? z : r.data }; });
  let o = 44 + 20 * n;
  const woffRijen = comp.map((r) => { const x = { ...r, woffOffset: o }; o += pad4(r.z).length; return x; });
  const kop = rij(Buffer.from('wOFF'), u32(0x00010000), u32(o), u16(n), u16(0), u32(sfnt.length), u16(1), u16(0), u32(0), u32(0), u32(0), u32(0), u32(0));
  const dir = rij(...woffRijen.map((r) => rij(Buffer.from(r.tag), u32(r.woffOffset), u32(r.z.length), u32(r.data.length), u32(r.sum))));
  return rij(kop, dir, ...woffRijen.map((r) => pad4(r.z)));
}

if (import.meta.url === new URL(process.argv[1], 'file:///').href || process.argv[1]?.endsWith('maak-streepjesfonts.mjs')) {
  const map = join(import.meta.dirname, '..', 'public', 'fonts');
  for (const [bestand, def] of Object.entries(TEKENS)) {
    const b = maakFont(def);
    writeFileSync(join(map, bestand + '.woff'), b);
    console.log(bestand + '.woff', b.length, 'bytes');
  }
}
