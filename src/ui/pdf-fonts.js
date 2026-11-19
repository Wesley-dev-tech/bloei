// Lettertypes voor de pdf: een .woff (woff 1, zlib-gecomprimeerde TrueType) wordt teruggebracht tot een kale TrueType-font die in de
// pdf wordt ingebed, zodat de tekst selecteerbaar en scherp blijft. De fonts komen uit @fontsource (lokaal, in de bundel); er is
// geen extern verzoek. Alleen de nodige tabellen gaan mee: head, hhea, maxp, hmtx, loca, glyf (en cvt, fpgm, prep als ze er zijn).
import { unzlibSync } from 'fflate';

const lees32 = (v, o) => v.getUint32(o);
const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

// woff 1 → { tabellen: { head: Uint8Array, ... } }
function leesWoff(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tag(bytes, 0) !== 'wOFF') throw new Error('geen woff 1');
  const aantal = v.getUint16(12);
  const tabellen = {};
  for (let i = 0; i < aantal; i += 1) {
    const o = 44 + i * 20;
    const naam = tag(bytes, o);
    const offset = lees32(v, o + 4);
    const lengte = lees32(v, o + 8);
    const origineel = lees32(v, o + 12);
    const stuk = bytes.subarray(offset, offset + lengte);
    tabellen[naam] = lengte === origineel ? stuk : unzlibSync(stuk);
  }
  return tabellen;
}

function leesCmap(cmap) {
  const v = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const n = v.getUint16(2);
  let gekozen = null;
  for (let i = 0; i < n; i += 1) {
    const platform = v.getUint16(4 + i * 8);
    const enc = v.getUint16(6 + i * 8);
    const offset = v.getUint32(8 + i * 8);
    if ((platform === 3 && (enc === 10 || enc === 1)) || (platform === 0 && enc >= 3)) {
      if (!gekozen || enc === 10) gekozen = offset;
    }
  }
  if (gekozen == null) throw new Error('geen bruikbare cmap');
  const kaart = new Map();
  const formaat = v.getUint16(gekozen);
  if (formaat === 4) {
    const segs = v.getUint16(gekozen + 6) / 2;
    const eind = gekozen + 14;
    const begin = eind + segs * 2 + 2;
    const delta = begin + segs * 2;
    const bereik = delta + segs * 2;
    for (let s = 0; s < segs; s += 1) {
      const e = v.getUint16(eind + s * 2);
      const b = v.getUint16(begin + s * 2);
      const d = v.getInt16(delta + s * 2);
      const r = v.getUint16(bereik + s * 2);
      for (let c = b; c <= e && c < 0xffff; c += 1) {
        let gid;
        if (r === 0) gid = (c + d) & 0xffff;
        else {
          const p = bereik + s * 2 + r + (c - b) * 2;
          const g = v.getUint16(p);
          gid = g === 0 ? 0 : (g + d) & 0xffff;
        }
        if (gid) kaart.set(c, gid);
      }
    }
  } else if (formaat === 12) {
    const groepen = v.getUint32(gekozen + 12);
    for (let g = 0; g < groepen; g += 1) {
      const o = gekozen + 16 + g * 12;
      const b = v.getUint32(o);
      const e = v.getUint32(o + 4);
      const start = v.getUint32(o + 8);
      for (let c = b; c <= e && c - b < 70000; c += 1) kaart.set(c, start + (c - b));
    }
  } else throw new Error('cmap-formaat ' + formaat);
  return kaart;
}

// De vervangingen van een opmaakfunctie (bv. lnum: lining-cijfers) uit de GSUB-tabel, als Map van glyph naar glyph.
// Alleen enkelvoudige vervangingen (lookup 1, ook via extension lookup 7), genoeg voor lnum.
function leesFeature(gsub, featureTag) {
  const uit = new Map();
  if (!gsub) return uit;
  const v = new DataView(gsub.buffer, gsub.byteOffset, gsub.byteLength);
  const featureLijst = v.getUint16(6);
  const lookupLijst = v.getUint16(8);
  const aantalFeatures = v.getUint16(featureLijst);
  const lookups = new Set();
  for (let i = 0; i < aantalFeatures; i += 1) {
    const rec = featureLijst + 2 + i * 6;
    const naam = String.fromCharCode(gsub[rec], gsub[rec + 1], gsub[rec + 2], gsub[rec + 3]);
    if (naam !== featureTag) continue;
    const ft = featureLijst + v.getUint16(rec + 4);
    const n = v.getUint16(ft + 2);
    for (let k = 0; k < n; k += 1) lookups.add(v.getUint16(ft + 4 + k * 2));
  }
  const dekking = (o) => {
    const lijst = [];
    const formaat = v.getUint16(o);
    if (formaat === 1) {
      const n = v.getUint16(o + 2);
      for (let k = 0; k < n; k += 1) lijst.push(v.getUint16(o + 4 + k * 2));
    } else {
      const n = v.getUint16(o + 2);
      for (let k = 0; k < n; k += 1) {
        const b = v.getUint16(o + 4 + k * 6);
        const e = v.getUint16(o + 6 + k * 6);
        for (let g = b; g <= e; g += 1) lijst.push(g);
      }
    }
    return lijst;
  };
  for (const index of lookups) {
    const lo = lookupLijst + v.getUint16(lookupLijst + 2 + index * 2);
    let soort = v.getUint16(lo);
    const nSub = v.getUint16(lo + 4);
    for (let k = 0; k < nSub; k += 1) {
      let so = lo + v.getUint16(lo + 6 + k * 2);
      if (soort === 7) {
        const echt = v.getUint16(so + 2);
        so += v.getUint32(so + 4);
        if (echt !== 1) continue;
      } else if (soort !== 1) continue;
      const lijst = dekking(so + v.getUint16(so + 2));
      if (v.getUint16(so) === 1) {
        const delta = v.getInt16(so + 4);
        for (const g of lijst) uit.set(g, (g + delta) & 0xffff);
      } else {
        lijst.forEach((g, i) => uit.set(g, v.getUint16(so + 6 + i * 2)));
      }
    }
  }
  return uit;
}

const optellen = (data) => {
  let som = 0;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength - (data.byteLength % 4));
  for (let i = 0; i < v.byteLength; i += 4) som = (som + v.getUint32(i)) >>> 0;
  return som;
};

// Bouwt een kale sfnt uit de gekozen tabellen.
function bouwSfnt(tabellen) {
  const namen = ['cvt ', 'fpgm', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'prep'].filter((n) => tabellen[n]);
  const kop = 12 + namen.length * 16;
  let lengte = kop;
  const plek = namen.map((n) => {
    const o = lengte;
    lengte += Math.ceil(tabellen[n].length / 4) * 4;
    return o;
  });
  const uit = new Uint8Array(lengte);
  const v = new DataView(uit.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, namen.length);
  const entry = 2 ** Math.floor(Math.log2(namen.length));
  v.setUint16(6, entry * 16);
  v.setUint16(8, Math.log2(entry));
  v.setUint16(10, namen.length * 16 - entry * 16);
  namen.forEach((n, i) => {
    const data = n === 'head' ? Uint8Array.from(tabellen[n]) : tabellen[n];
    if (n === 'head') new DataView(data.buffer).setUint32(8, 0); // checkSumAdjustment
    for (let k = 0; k < 4; k += 1) uit[12 + i * 16 + k] = n.charCodeAt(k);
    v.setUint32(12 + i * 16 + 4, optellen(data));
    v.setUint32(12 + i * 16 + 8, plek[i]);
    v.setUint32(12 + i * 16 + 12, data.length);
    uit.set(data, plek[i]);
  });
  return uit;
}

// woff-bytes → font: { programma, upm, aantalGlyphs, gid(codepunt), breedte(gid), tekstBreedte(tekst, grootte), ascent, descent, bbox, capHoogte }
export function maakFont(woffBytes, { schuin = 0 } = {}) {
  const tab = leesWoff(woffBytes);
  const head = new DataView(tab.head.buffer, tab.head.byteOffset);
  const hhea = new DataView(tab.hhea.buffer, tab.hhea.byteOffset);
  const maxp = new DataView(tab.maxp.buffer, tab.maxp.byteOffset);
  const upm = head.getUint16(18);
  const aantalGlyphs = maxp.getUint16(4);
  const metrics = hhea.getUint16(34);
  const hmtx = new DataView(tab.hmtx.buffer, tab.hmtx.byteOffset);
  const breedtes = new Array(aantalGlyphs);
  for (let g = 0; g < aantalGlyphs; g += 1) breedtes[g] = hmtx.getUint16(Math.min(g, metrics - 1) * 4);
  const cmap = leesCmap(tab['cmap']);
  const schaal = 1000 / upm;
  // Cijfers staan in de app als lining-nums (font-variant-numeric); de pdf doet hetzelfde via lnum uit de font zelf.
  const lnum = leesFeature(tab.GSUB, 'lnum');
  const gid = (cp) => {
    const g = cmap.get(cp) ?? cmap.get(0x3f) ?? 0;
    return cp >= 0x30 && cp <= 0x39 ? (lnum.get(g) ?? g) : g;
  };
  const font = {
    programma: bouwSfnt(tab),
    upm,
    aantalGlyphs,
    schuin,
    breedtes1000: breedtes.map((w) => Math.round(w * schaal)),
    gid,
    heeft: (cp) => cmap.has(cp),
    ascent: Math.round(hhea.getInt16(4) * schaal),
    descent: Math.round(hhea.getInt16(6) * schaal),
    bbox: [head.getInt16(36), head.getInt16(38), head.getInt16(40), head.getInt16(42)].map((n) => Math.round(n * schaal)),
    capHoogte: Math.round(upm * 0.65 * schaal),
    // Breedte van een tekst in punten; geen kerning, daarom een tikje ruimer gerekend is niet nodig bij links uitgelijnde tekst.
    tekstBreedte(tekst, grootte, spatiering = 0) {
      let som = 0;
      let n = 0;
      for (const c of tekst) {
        som += breedtes[gid(c.codePointAt(0))] * schaal;
        n += 1;
      }
      return (som * grootte) / 1000 + spatiering * n;
    },
  };
  return font;
}
