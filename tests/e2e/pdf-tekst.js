// Leest de tekst uit een pdf van Bloei (eigen schrijver: Flate-streams, Identity-H glyph-ids, ToUnicode per lettertype).
import { inflateSync } from 'node:zlib';

export function pdfTekst(buffer) {
  const tekst = buffer.toString('latin1');
  const objecten = new Map();
  const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj/g;
  let m;
  while ((m = re.exec(tekst))) {
    const woordenboek = m[2];
    const stream = /\/Length (\d+) >>\nstream\n/.exec(woordenboek);
    if (stream) {
      const begin = m.index + `${m[1]} 0 obj\n`.length + stream.index + stream[0].length;
      objecten.set(Number(m[1]), { woordenboek: woordenboek.slice(0, stream.index), data: buffer.subarray(begin, begin + Number(stream[1])) });
      re.lastIndex = begin + Number(stream[1]); // binaire data overslaan
    } else objecten.set(Number(m[1]), { woordenboek, data: null });
  }
  // Per lettertype: naam, dan gid naar teken uit de ToUnicode-stream
  const kaarten = {};
  for (const { woordenboek } of objecten.values()) {
    const f = /\/BaseFont \/Bloei-(\w+) \/Encoding \/Identity-H .*?\/ToUnicode (\d+) 0 R/.exec(woordenboek);
    if (!f) continue;
    const cmap = inflateSync(objecten.get(Number(f[2])).data).toString('latin1');
    const kaart = new Map();
    for (const p of cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]{4})>/g)) kaart.set(parseInt(p[1], 16), String.fromCharCode(parseInt(p[2], 16)));
    kaarten[f[1]] = kaart;
  }
  let uit = '';
  for (const { data, woordenboek } of objecten.values()) {
    if (!data || !/FlateDecode/.test(woordenboek)) continue;
    const inhoud = inflateSync(data).toString('latin1');
    if (!/ Tf /.test(inhoud)) continue;
    for (const t of inhoud.matchAll(/\/(\w+) [\d.]+ Tf (?:[-\d.]+ Tc )?[-\d.]+ [-\d.]+ Td <([0-9a-f]*)> Tj/g)) {
      const kaart = kaarten[t[1]];
      for (let i = 0; i < t[2].length; i += 4) uit += kaart.get(parseInt(t[2].slice(i, i + 4), 16)) ?? '?';
      uit += '\n';
    }
  }
  return uit.replace(/[  ]/g, ' ');
}
