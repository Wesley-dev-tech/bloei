// SVG-paden als pdf-vectoren: de paden van de Font Awesome-iconen, de blaadjes en het beeldmerk van Bloei, zonder rasterbeeld.
// Ondersteund: M L H V C S Q T A Z (hoofd- en kleine letters). Bogen worden kubische krommen.

const getal = (n) => String(Math.round(n * 1000) / 1000);

// Leest een SVG-pad (het d-attribuut) en geeft absolute segmenten: ['M', x, y] | ['L', x, y] | ['C', x1, y1, x2, y2, x, y] | ['Z'].
export function leesPad(d) {
  const segmenten = [];
  let i = 0;
  const n = d.length;
  const spatie = () => {
    while (i < n && /[\s,]/.test(d[i])) i += 1;
  };
  const getalLezen = () => {
    spatie();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(d.slice(i));
    if (!m) throw new Error('pad: getal verwacht bij ' + i);
    i += m[0].length;
    return Number(m[0]);
  };
  const vlag = () => {
    spatie();
    const c = d[i];
    i += 1;
    return c === '1' ? 1 : 0;
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let vorigeC = null; // tweede controlepunt van de vorige kromme, voor S
  let vorigeQ = null;
  let cmd = '';
  while (true) {
    spatie();
    if (i >= n) break;
    if (/[A-Za-z]/.test(d[i])) {
      cmd = d[i];
      i += 1;
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const dx = rel ? x : 0;
    const dy = rel ? y : 0;
    let nieuweC = null;
    let nieuweQ = null;
    if (C === 'Z') {
      segmenten.push(['Z']);
      x = startX;
      y = startY;
    } else if (C === 'M') {
      x = getalLezen() + dx;
      y = getalLezen() + dy;
      startX = x;
      startY = y;
      segmenten.push(['M', x, y]);
    } else if (C === 'L') {
      x = getalLezen() + dx;
      y = getalLezen() + dy;
      segmenten.push(['L', x, y]);
    } else if (C === 'H') {
      x = getalLezen() + dx;
      segmenten.push(['L', x, y]);
    } else if (C === 'V') {
      y = getalLezen() + dy;
      segmenten.push(['L', x, y]);
    } else if (C === 'C') {
      const x1 = getalLezen() + dx;
      const y1 = getalLezen() + dy;
      const x2 = getalLezen() + dx;
      const y2 = getalLezen() + dy;
      const ex = getalLezen() + dx;
      const ey = getalLezen() + dy;
      segmenten.push(['C', x1, y1, x2, y2, ex, ey]);
      nieuweC = [x2, y2];
      x = ex;
      y = ey;
    } else if (C === 'S') {
      const x1 = vorigeC ? 2 * x - vorigeC[0] : x;
      const y1 = vorigeC ? 2 * y - vorigeC[1] : y;
      const x2 = getalLezen() + dx;
      const y2 = getalLezen() + dy;
      const ex = getalLezen() + dx;
      const ey = getalLezen() + dy;
      segmenten.push(['C', x1, y1, x2, y2, ex, ey]);
      nieuweC = [x2, y2];
      x = ex;
      y = ey;
    } else if (C === 'Q' || C === 'T') {
      let qx;
      let qy;
      if (C === 'Q') {
        qx = getalLezen() + dx;
        qy = getalLezen() + dy;
      } else {
        qx = vorigeQ ? 2 * x - vorigeQ[0] : x;
        qy = vorigeQ ? 2 * y - vorigeQ[1] : y;
      }
      const ex = getalLezen() + dx;
      const ey = getalLezen() + dy;
      segmenten.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      nieuweQ = [qx, qy];
      x = ex;
      y = ey;
    } else if (C === 'A') {
      const rx = getalLezen();
      const ry = getalLezen();
      const hoek = getalLezen();
      const groot = vlag();
      const veeg = vlag();
      const ex = getalLezen() + dx;
      const ey = getalLezen() + dy;
      for (const s of boog(x, y, rx, ry, hoek, groot, veeg, ex, ey)) segmenten.push(s);
      x = ex;
      y = ey;
    } else {
      throw new Error('pad: onbekend commando ' + cmd);
    }
    vorigeC = nieuweC;
    vorigeQ = nieuweQ;
  }
  return segmenten;
}

// Boog (SVG-eindpuntvorm) naar kubische krommen, in stukken van hoogstens 90 graden.
function boog(x1, y1, rx, ry, graden, groot, veeg, x2, y2) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return x1 === x2 && y1 === y2 ? [] : [['L', x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const fi = (graden * Math.PI) / 180;
  const cos = Math.cos(fi);
  const sin = Math.sin(fi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1a = cos * dx + sin * dy;
  const y1a = -sin * dx + cos * dy;
  const lambda = (x1a * x1a) / (rx * rx) + (y1a * y1a) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const teken = groot === veeg ? -1 : 1;
  const teller = rx * rx * ry * ry - rx * rx * y1a * y1a - ry * ry * x1a * x1a;
  const noemer = rx * rx * y1a * y1a + ry * ry * x1a * x1a;
  const f = teken * Math.sqrt(Math.max(0, teller / noemer));
  const cxa = (f * rx * y1a) / ry;
  const cya = (-f * ry * x1a) / rx;
  const cx = cos * cxa - sin * cya + (x1 + x2) / 2;
  const cy = sin * cxa + cos * cya + (y1 + y2) / 2;
  const hoekVan = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = hoekVan(1, 0, (x1a - cxa) / rx, (y1a - cya) / ry);
  let delta = hoekVan((x1a - cxa) / rx, (y1a - cya) / ry, (-x1a - cxa) / rx, (-y1a - cya) / ry);
  if (!veeg && delta > 0) delta -= 2 * Math.PI;
  if (veeg && delta < 0) delta += 2 * Math.PI;
  const stukken = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const stap = delta / stukken;
  const k = (4 / 3) * Math.tan(stap / 4);
  const uit = [];
  let t1 = theta1;
  for (let s = 0; s < stukken; s += 1) {
    const t2 = t1 + stap;
    const kaart = (ux, uy) => [cx + rx * ux * cos - ry * uy * sin, cy + rx * ux * sin + ry * uy * cos];
    const [a1x, a1y] = kaart(Math.cos(t1) - k * Math.sin(t1), Math.sin(t1) + k * Math.cos(t1));
    const [a2x, a2y] = kaart(Math.cos(t2) + k * Math.sin(t2), Math.sin(t2) - k * Math.cos(t2));
    const [ex, ey] = kaart(Math.cos(t2), Math.sin(t2));
    uit.push(['C', a1x, a1y, a2x, a2y, s === stukken - 1 ? x2 : ex, s === stukken - 1 ? y2 : ey]);
    t1 = t2;
  }
  return uit;
}

// Segmenten als pdf-operatoren (zonder vul- of lijnoperator).
export function padOps(segmenten) {
  return segmenten
    .map((s) => {
      if (s[0] === 'M') return `${getal(s[1])} ${getal(s[2])} m`;
      if (s[0] === 'L') return `${getal(s[1])} ${getal(s[2])} l`;
      if (s[0] === 'C') return `${getal(s[1])} ${getal(s[2])} ${getal(s[3])} ${getal(s[4])} ${getal(s[5])} ${getal(s[6])} c`;
      return 'h';
    })
    .join(' ');
}

// De paden (d-attributen) uit SVG-tekst, met hun vulkleur, transformatie en dekking als ze die hebben.
function leesPaden(svgTekst) {
  const uit = [];
  for (const m of svgTekst.matchAll(/<path\b([^>]*?)\/?>/g)) {
    const attr = (naam) => new RegExp(`\\b${naam}="([^"]*)"`).exec(m[1])?.[1] ?? null;
    const d = attr('d');
    if (d) uit.push({ d, fill: attr('fill'), transform: attr('transform'), opacity: attr('opacity') });
  }
  return uit;
}

const leesViewBox = (svgTekst) => (/viewBox="([^"]+)"/.exec(svgTekst)?.[1] ?? '0 0 512 512').split(/[\s,]+/).map(Number);

const hexNaarRgb = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// rotate(hoek cx cy) als pdf-matrix in svg-ruimte
function rotatie(transform) {
  const m = /rotate\(\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(transform ?? '');
  if (!m) return null;
  const a = (Number(m[1]) * Math.PI) / 180;
  const [cx, cy] = [Number(m[2]), Number(m[3])];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, -s, c, cx - cx * c + cy * s, cy - cx * s - cy * c];
}

// Tekent een SVG in een vak: x en yBoven (pdf-punten, bovenkant van het vak), breedte en hoogte van het vak.
// opties: { kleur: [r,g,b] (voor paden zonder eigen vulling), gs(alpha, vermenigvuldig) → naam van een ExtGState }.
// Geeft pdf-operatoren terug.
export function svgOps(svgTekst, { x, yBoven, breedte, hoogte = breedte, kleur = [0, 0, 0], gs = null }) {
  const [vx, vy, vb, vh] = leesViewBox(svgTekst);
  const schaal = Math.min(breedte / vb, hoogte / vh);
  const offX = (breedte - vb * schaal) / 2;
  const offY = (hoogte - vh * schaal) / 2;
  const ops = [`q ${getal(schaal)} 0 0 ${getal(-schaal)} ${getal(x - vx * schaal + offX)} ${getal(yBoven + vy * schaal - offY)} cm`];
  for (const p of leesPaden(svgTekst)) {
    const rgb = hexNaarRgb(p.fill) ?? kleur;
    const rot = rotatie(p.transform);
    const alpha = p.opacity != null ? Number(p.opacity) : 1;
    ops.push('q');
    if (gs && (alpha < 1 || /mix-blend-mode:\s*multiply/.test(svgTekst))) ops.push(`/${gs(alpha, /mix-blend-mode:\s*multiply|class="mengen"/.test(svgTekst))} gs`);
    if (rot) ops.push(`${rot.map(getal).join(' ')} cm`);
    ops.push(`${rgb.map(getal).join(' ')} rg ${padOps(leesPad(p.d))} f Q`);
  }
  ops.push('Q');
  return ops.join('\n');
}
