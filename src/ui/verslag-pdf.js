// De pdf van het verslag (BESLISSING 154 en 158), op het toestel gemaakt met een klein eigen pdf-schrijver: geen bibliotheek erbij,
// geen extern verzoek, geen eval, geen inline stijl, geen worker en geen blob-adres nodig om te maken.
// Huisstijl: altijd het thema Poeder (kleuren uit tokens.css), Cormorant Garamond en Jost ingebed uit @fontsource (woff, lokaal),
// de Font Awesome-iconen, de blaadjes en het beeldmerk als vector. A4 staand, marges van 18 mm.
// Dit bestand wordt pas geladen als het scherm Delen een pdf maakt (dynamische import).
import { zlibSync } from 'fflate';
import { t } from '../teksten.js';
import { bouwVerslagModel } from './verslag-model.js';
import { papierKleuren } from './pdf-tokens.js';
import { svgOps } from './pdf-vector.js';
import { maakFont } from './pdf-fonts.js';
import { iconenBron } from './iconen.js';
import markLicht from '../../bloei-huisstijl/logo/bloei-mark.svg?raw';
import serifUrl from '../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff?url';
import serifSchuinUrl from '../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff?url';
import sansUrl from '../../node_modules/@fontsource/jost/files/jost-latin-400-normal.woff?url';
import sansMediumUrl from '../../node_modules/@fontsource/jost/files/jost-latin-500-normal.woff?url';
import { ICOON } from './iconenkaart.js';
import { MAALTIJDICOON } from './beeld.js';
import { opmaakLiter } from '../kern/getal.js';

const B = 595.28; // A4 staand
const H = 841.89;
const RAND = 51; // 18 mm links en rechts
const KOP_LIJN = 58; // de lijn onder de koptekst
const INHOUD_TOP = 76; // waar de inhoud op elke pagina begint
const VOET_LIJN = H - 46; // de lijn boven de voet
const INHOUD_BODEM = H - 62;
const VOET_RUIMTE = 24; // tussen de laatste inhoud en de voetlijn bij een kort verslag (BESLISSING 332)
const MAX_KORT = 0.85; // een verslag van één pagina dat meer dan dit deel van een A4 vult, blijft een gewone A4
// Lettermaten (pt): titel, dagkop, tabelkop, tekst, voettekst. Eén regelafstand en één rijmarge voor alle tabellen.
const MAAT = { titel: 22, dagkop: 8.5, sectie: 14, tekst: 9, label: 7.5, klein: 8, kerncijfer: 22, eenheid: 12 };
const LH = 12.4; // regelafstand van de tekst
const PAD = 2.5; // boven en onder in een tabelrij

// BESLISSING 460: Cormorant tekent het koppelteken schuin; in een schreeftekst komt elk "-" (U+002D) uit de sans-letter, op dezelfde grootte en basislijn.
// stukken('serif', '-0,7') → [['sans', '-'], ['serif', '0,7']]
export function stukken(fontNaam, tekst) {
  if ((fontNaam !== 'serif' && fontNaam !== 'serifSchuin') || !tekst.includes('-')) return [[fontNaam, tekst]];
  return tekst.split(/(-+)/).filter(Boolean).map((s) => [s[0] === '-' ? 'sans' : fontNaam, s]);
}

// BESLISSING 459: een datum als kop of label staat in hoofdletters, in de vorm van de labels (Jost medium, gespatieerd). Een pdf kent geen css:
// de tekst wordt hier omgezet (Nederlandse regels) en de breedte wordt op de omgezette tekst gemeten. Een bereik is " - " (BESLISSING 446).
export const alsLabel = (tekst) => String(tekst ?? '').toLocaleUpperCase('nl-BE');
export const periodeAlsLabel = (periodeLang) => alsLabel(String(periodeLang ?? '').replace(` ${t('delen.pdfTot')} `, ' - '));
const LABEL_SPATIERING = 0.12; // em, zoals --ls-label

const getal = (n) => String(Math.round(n * 1000) / 1000);
const kleurOps = (c) => c.map(getal).join(' ');

// ------------------------------------------------------------------ lettertypen laden (één keer per sessie)

let fontsBelofte = null;
function laadFonts() {
  fontsBelofte ??= Promise.all([serifUrl, serifSchuinUrl, sansUrl, sansMediumUrl].map((url) => fetch(url).then((r) => r.arrayBuffer()))).then(([a, b, c, d]) => ({
    serif: maakFont(new Uint8Array(a)),
    serifSchuin: maakFont(new Uint8Array(b), { schuin: -12 }),
    sans: maakFont(new Uint8Array(c)),
    sansMedium: maakFont(new Uint8Array(d)),
  }));
  return fontsBelofte;
}

// ------------------------------------------------------------------ het document

class Schrijver {
  constructor() {
    this.delen = [];
    this.lengte = 0;
    this.plek = [];
    this.voeg('%PDF-1.7\n%âãÏÓ\n');
  }

  voeg(deel) {
    const bytes = typeof deel === 'string' ? Uint8Array.from(deel, (c) => c.charCodeAt(0) & 0xff) : deel;
    this.delen.push(bytes);
    this.lengte += bytes.length;
  }

  // Object n met een woordenboek en eventueel een stream (bytes).
  object(n, woordenboek, stream = null) {
    this.plek[n] = this.lengte;
    if (stream) {
      this.voeg(`${n} 0 obj\n<< ${woordenboek} /Length ${stream.length} >>\nstream\n`);
      this.voeg(stream);
      this.voeg('\nendstream\nendobj\n');
    } else {
      this.voeg(`${n} 0 obj\n${woordenboek}\nendobj\n`);
    }
  }

  einde(wortel, info) {
    const xref = this.lengte;
    const aantal = this.plek.length;
    let tabel = `xref\n0 ${aantal}\n0000000000 65535 f \n`;
    for (let n = 1; n < aantal; n += 1) tabel += `${String(this.plek[n]).padStart(10, '0')} 00000 n \n`;
    tabel += `trailer\n<< /Size ${aantal} /Root ${wortel} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    this.voeg(tabel);
    const uit = new Uint8Array(this.lengte);
    let o = 0;
    for (const d of this.delen) {
      uit.set(d, o);
      o += d.length;
    }
    return uit;
  }
}

class Pagina {
  constructor() {
    this.ops = [];
    this.lettertypen = new Set();
    this.toestanden = new Set();
    this.svg = []; // dezelfde tekening als vectorlijst, bovenaf geteld: Afdrukken tekent hieruit (verslag-afdruk.js), dus altijd dezelfde pagina's als de pdf
  }
}

// Het tekenvlak: coördinaten zijn van boven naar beneden (y = afstand tot de bovenrand van de pagina), eenheid punt. Altijd een staande A4.
class Tekenaar {
  constructor(fonts, kleuren, meet = false) {
    this.meet = meet;
    this.log = []; // alleen met meet: wat er getekend is, voor de test
    this.cellen = []; // alleen met meet: de cellen van de tabellen
    this.b = B;
    this.h = H;
    this.voetLijn = VOET_LIJN; // bij een kort verslag op één pagina schuift de voet mee omhoog (BESLISSING 332)
    this.rand = RAND;
    this.top = INHOUD_TOP;
    this.fonts = fonts;
    this.k = kleuren;
    this.paginas = [];
    this.gebruikt = Object.fromEntries(Object.keys(fonts).map((naam) => [naam, new Map()])); // gid → codepunt
    this.toestanden = new Map(); // sleutel → naam
    this.p = null;
  }

  get breedte() {
    return this.b - 2 * this.rand;
  }

  get bodem() {
    return INHOUD_BODEM;
  }

  // Wit papier: geen gekleurde achtergrond (dat kost inkt bij het afdrukken).
  nieuwePagina() {
    this.p = new Pagina();
    this.paginas.push(this.p);
  }

  op(regel) {
    this.p.ops.push(regel);
  }

  toestand(alpha, vermenigvuldig) {
    const sleutel = `${alpha}|${vermenigvuldig}`;
    if (!this.toestanden.has(sleutel)) this.toestanden.set(sleutel, { naam: `GS${this.toestanden.size + 1}`, alpha, vermenigvuldig });
    const naam = this.toestanden.get(sleutel).naam;
    this.p.toestanden.add(naam);
    return naam;
  }

  // Een rechthoek, eventueel met afgeronde hoeken (straal r). y is de bovenkant.
  pad(x, y, w, h, r = 0) {
    const yb = this.h - y - h;
    if (!r) return `${getal(x)} ${getal(yb)} ${getal(w)} ${getal(h)} re`;
    r = Math.min(r, w / 2, h / 2);
    const c = r * 0.5523;
    const x2 = x + w;
    const y2 = yb + h;
    return [
      `${getal(x + r)} ${getal(yb)} m ${getal(x2 - r)} ${getal(yb)} l`,
      `${getal(x2 - r + c)} ${getal(yb)} ${getal(x2)} ${getal(yb + r - c)} ${getal(x2)} ${getal(yb + r)} c`,
      `${getal(x2)} ${getal(y2 - r)} l`,
      `${getal(x2)} ${getal(y2 - r + c)} ${getal(x2 - r + c)} ${getal(y2)} ${getal(x2 - r)} ${getal(y2)} c`,
      `${getal(x + r)} ${getal(y2)} l`,
      `${getal(x + r - c)} ${getal(y2)} ${getal(x)} ${getal(y2 - r + c)} ${getal(x)} ${getal(y2 - r)} c`,
      `${getal(x)} ${getal(yb + r)} l`,
      `${getal(x)} ${getal(yb + r - c)} ${getal(x + r - c)} ${getal(yb)} ${getal(x + r)} ${getal(yb)} c h`,
    ].join(' ');
  }

  vlak(x, y, w, h, kleur, hoekig = false, r = 0) {
    this.op(`${kleurOps(kleur)} rg ${this.pad(x, y, w, h, hoekig ? 0 : r)} f`);
    this.p.svg.push({ t: 'r', x, y, w, h, r: hoekig ? 0 : Math.min(r, w / 2, h / 2), vul: kleur });
  }

  kader(x, y, w, h, kleur, r = 0, dikte = 0.7) {
    this.op(`${kleurOps(kleur)} RG ${getal(dikte)} w ${this.pad(x, y, w, h, r)} S`);
    this.p.svg.push({ t: 'r', x, y, w, h, r: Math.min(r, w / 2, h / 2), lijn: kleur, dikte });
  }

  lijn(x1, y, x2, kleur, dikte = 0.6) {
    this.op(`${kleurOps(kleur)} RG ${getal(dikte)} w ${getal(x1)} ${getal(this.h - y)} m ${getal(x2)} ${getal(this.h - y)} l S`);
    this.p.svg.push({ t: 'l', x1, y1: y, x2, y2: y, lijn: kleur, dikte });
  }

  verticaal(x, y1, y2, kleur, dikte = 0.5) {
    this.op(`${kleurOps(kleur)} RG ${getal(dikte)} w ${getal(x)} ${getal(this.h - y1)} m ${getal(x)} ${getal(this.h - y2)} l S`);
    this.p.svg.push({ t: 'l', x1: x, y1, x2: x, y2, lijn: kleur, dikte });
  }

  // Een cel van een tabel (voor de test): de rechthoek en wat erin hoort.
  cel(soort, kolom, x, y, w, h, tekst = '') {
    if (this.meet) this.cellen.push({ soort, kolom, x, y, w, h, tekst, pagina: this.paginas.indexOf(this.p), tabelId: this.tabelId ?? null });
  }

  // Tekst met een ingebed lettertype; y is de basislijn. Een koppelteken in een schreeftekst komt uit de sans-letter (zie stukken).
  tekst(fontNaam, grootte, x, y, tekst, kleur, spatiering = 0, vak = null) {
    if (!tekst) return;
    if (this.meet) {
      const b = this.breedte_(fontNaam, grootte, tekst, spatiering);
      this.log.push({ tekst, pagina: this.paginas.indexOf(this.p), x0: x, x1: x + b, top: y - grootte * 0.8, bottom: y + grootte * 0.22, vak: vak ? { x0: vak.x, x1: vak.x + vak.w, top: vak.y, bottom: vak.y + vak.h } : null });
    }
    let xx = x;
    for (const [naam, stuk] of stukken(fontNaam, tekst)) {
      const font = this.fonts[naam];
      const kaart = this.gebruikt[naam];
      let hex = '';
      for (const c of stuk) {
        const cp = c.codePointAt(0);
        const gid = font.gid(cp);
        kaart.set(gid, cp);
        hex += gid.toString(16).padStart(4, '0');
      }
      this.p.lettertypen.add(naam);
      if (this.meet) (this.lopen ??= []).push({ font: naam, tekst: stuk });
      this.p.svg.push({ t: 't', font: naam, grootte, x: xx, y, spatiering, vul: kleur, tekst: stuk });
      this.op(`BT ${kleurOps(kleur)} rg /${naam} ${getal(grootte)} Tf ${getal(spatiering)} Tc ${getal(xx)} ${getal(this.h - y)} Td <${hex}> Tj ET`);
      xx += font.tekstBreedte(stuk, grootte, spatiering);
    }
  }

  breedte_(fontNaam, grootte, tekst, spatiering = 0) {
    return stukken(fontNaam, tekst).reduce((som, [naam, stuk]) => som + this.fonts[naam].tekstBreedte(stuk, grootte, spatiering), 0);
  }

  // (oude naam, nog overal in gebruik)
  tb(fontNaam, grootte, tekst, spatiering = 0) {
    return this.breedte_(fontNaam, grootte, tekst, spatiering);
  }

  // Breekt tekst in regels die in max punten passen, op woordgrenzen; een woord dat zelf te lang is breekt met een koppelteken.
  breek(fontNaam, grootte, tekst, max) {
    const regels = [];
    for (const alinea of String(tekst).split(/\r?\n/)) {
      let regel = '';
      for (const woord of alinea.split(/\s+/).filter(Boolean)) {
        const proef = regel ? `${regel} ${woord}` : woord;
        if (this.tb(fontNaam, grootte, proef) <= max) {
          regel = proef;
          continue;
        }
        if (regel) regels.push(regel);
        regel = '';
        let rest = woord;
        while (this.tb(fontNaam, grootte, rest) > max && rest.length > 2) {
          let n = rest.length - 1;
          while (n > 1 && this.tb(fontNaam, grootte, rest.slice(0, n) + '-') > max) n -= 1;
          regels.push(rest.slice(0, n) + '-');
          rest = rest.slice(n);
        }
        regel = rest;
      }
      regels.push(regel);
    }
    return regels;
  }

  // Een icoon als vector: in een vak van grootte x grootte, linksboven (x, y), in de gegeven kleur.
  icoon(naam, stijl, x, y, grootte, kleur) {
    const bron = iconenBron(naam, stijl);
    if (!bron) return;
    this.p.svg.push({ t: 'i', naam, stijl, x, y, grootte, vul: kleur });
    this.op(svgOps(bron, { x, yBoven: this.h - y, breedte: grootte, hoogte: grootte, kleur }));
  }

  // Een afgeronde tegel in zacht lavendel, met het icoon erin in donker lavendel (BESLISSING 373: voor elk onderdeel dezelfde kleur).
  tegel(naam, x, y, grootte = TEGEL, stijl = 'solid', rond = false) {
    this.vlak(x, y, grootte, grootte, this.k.lavendel.zacht, false, rond ? grootte / 2 : grootte * 0.35);
    const i = grootte * 0.5;
    this.icoon(naam, stijl, x + (grootte - i) / 2, y + (grootte - i) / 2, i, this.k.lavendel.donker);
  }

  beeldmerk(x, y, grootte) {
    this.p.svg.push({ t: 'm', x, y, grootte });
    this.op(svgOps(markLicht, { x, yBoven: this.h - y, breedte: grootte, hoogte: grootte, gs: (alpha, mengen) => this.toestand(alpha, mengen) }));
  }

}

// ------------------------------------------------------------------ de opmaak (BESLISSING 302)
//
// Eén staand A4-document voor elke periode, op wit papier (de kleuren van Poeder alleen voor tekst, lijnen en een lichte band):
//  - op elke pagina een koptekst (merk, "Verslag van {voornaam}", de periode) en een voet (gemaakt op, pagina x van y);
//  - op de eerste pagina de titel met de periode en één rij kerncijfers;
//  - per dag een band met de datum en daaronder een rij per maaltijd (maaltijd, wat), het drinken tegenover het dagdoel en de notitie;
//    de kolommen staan op dezelfde x in het hele document, een lege maaltijd blijft weg en een lege dag is één regel;
//  - de dagen lopen door over de pagina's; een dag blijft bij voorkeur heel, een kop staat nooit alleen onderaan en de kolomkop komt op elke
//    pagina terug (zie verdeel, BESLISSING 420);
//  - het gewicht (als dat onderdeel aanstaat) als korte tabel achteraan.
const STREEP = '-';
const hoofdletter = (tekst) => tekst.charAt(0).toUpperCase() + tekst.slice(1);
const regelBasis = (g) => (LH - g) / 2 + g * 0.85; // basislijn ten opzichte van de bovenkant van een tekstregel
const vak = (x, y, w, h) => ({ x, y, w, h });

// De vaste kolommen van de dagtabel (BESLISSING 316, 336): Maaltijd 24 %, Wat de rest, van de rand van het kader tot de andere rand, in elke
// dagtabel op dezelfde x. xr0/xr1 zijn de randen van het kader, x0/x1 de randen van de inhoud (6 pt naar binnen), xA de kolomlijn.
function kolommen(tk) {
  const x0 = tk.rand + 6;
  const x1 = tk.b - tk.rand - 6;
  const xA = tk.rand + tk.breedte * 0.24;
  const xWat = xA + 6;
  return { xr0: tk.rand, xr1: tk.b - tk.rand, x0, x1, xA, xWat, wWat: x1 - xWat };
}

// De rand van een tabel: links en rechts bij elk onderdeel, boven bij het eerste en onder bij het laatste van de tabel op die pagina (ctx).
function kaderRand(tk, kol, y, h, ctx) {
  const c = tk.k.lijnSterk;
  tk.verticaal(kol.xr0, y, y + h, c, 0.8);
  tk.verticaal(kol.xr1, y, y + h, c, 0.8);
  if (ctx?.boven) tk.lijn(kol.xr0, y, kol.xr1, c, 0.8);
  if (ctx?.onder) tk.lijn(kol.xr0, y + h, kol.xr1, c, 0.8);
}

// De verticale kolomlijn tussen Maaltijd | Wat.
function kolomLijnen(tk, kol, y1, y2) {
  tk.verticaal(kol.xA, y1, y2, tk.k.lijnSterk, 0.5);
}

const BAND_H = 21;
const KOP_H = 15.5;

// De bovenkant van een dagtabel: de dagband (datum links, samenvatting rechts) en de kolomkoprij (Maaltijd | Wat) in kleine hoofdletters.
// Bij een breuk over een pagina komt ze bovenaan het vervolg terug, met "(vervolg)" achter de datum (vervolg: true).
function tabelKop(tk, kol, { id, titel, bandTekst = '', metBand = true, metKop = true, vervolg = false, eersteKolom }) {
  const k = tk.k;
  const koppen = [[kol.x0, eersteKolom], [kol.xWat, t('delen.pdfKolomWat')]];
  const h = (metBand ? BAND_H : 0) + (metKop ? KOP_H : 0);
  return {
    h,
    isKop: true,
    keepNext: true,
    tabelId: id,
    teken(y, ctx) {
      let yy = y;
      if (metBand) {
        const tekst = vervolg ? `${titel} ${t('delen.pdfVervolg')}` : titel;
        tk.cel('dagkop', 0, kol.xr0, y, kol.xr1 - kol.xr0, BAND_H, tekst);
        tk.vlak(kol.xr0, y, kol.xr1 - kol.xr0, BAND_H, k.lavendel.zacht);
        // BESLISSING 459: de dagkop in labelvorm (hoofdletters, gespatieerd); de cel houdt de gewone tekst
        tk.tekst('sansMedium', MAAT.dagkop, kol.x0, y + 13.6, alsLabel(tekst), k.gedempt, MAAT.dagkop * LABEL_SPATIERING, vak(kol.x0, y, kol.xr1 - kol.x0 - 6, BAND_H));
        if (bandTekst && !vervolg) {
          const w = tk.tb('sansMedium', MAAT.klein, bandTekst);
          tk.tekst('sansMedium', MAAT.klein, kol.x1 - w, y + 14.2, bandTekst, k.gedempt, 0, vak(kol.x1 - w, y, w, BAND_H));
        }
        yy += BAND_H;
      }
      if (metKop) {
        koppen.forEach(([x, tekst], i) => {
          tk.cel('kop', i, x, yy, 0, KOP_H, tekst);
          tk.tekst('sansMedium', MAAT.label, x, yy + 10.6, tekst.toUpperCase(), k.gedempt, 0.6);
        });
        if (metBand) tk.lijn(kol.xr0, yy, kol.xr1, k.lijnSterk, 0.5);
        tk.lijn(kol.xr0, yy + KOP_H, kol.xr1, k.lijnSterk, 0.8);
        kolomLijnen(tk, kol, yy, yy + KOP_H);
      }
      kaderRand(tk, kol, y, h, ctx);
    },
  };
}

// Een rij van de dagtabel. regels: tekst of { tekst, font, kleur }; icoon: { naam, stijl }; extra(y, h) tekent er nog iets bij.
// Een lange tekst wordt in stukken van enkele regels gedeeld, zodat ze over een paginagrens kan lopen: alleen het eerste stuk heeft ruimte
// boven, alleen het laatste ruimte en een lijn onder (eerste/laatste).
// voet: de afgescheiden voetrij (Drinken); breed: één cel over alle kolommen (lege dag).
function maakRij(tk, kol, { icoon = null, label = '', regels, extra = null, tabel = null, tabelId = null, keepNext = false, eerste = true, laatste = true, voet = false, breed = false }) {
  const k = tk.k;
  const lijst = regels.map((r) => (typeof r === 'string' ? { tekst: r } : r));
  const boven = eerste ? PAD : 0;
  const h = Math.max(1, lijst.length) * LH + boven + (laatste ? PAD : 0);
  const labelB = kol.xA - kol.x0 - 17 - 6;
  const xTekst = breed ? kol.x0 : kol.xWat;
  const wTekst = breed ? kol.x1 - kol.x0 : kol.wWat;
  return {
    h,
    h0: h,
    boven,
    boven0: boven,
    // een vervolgstuk van een lange tekst dat bovenaan een pagina onder de kolomkop komt, krijgt dezelfde ruimte boven als een eerste rij (zie pagineer)
    naKop: eerste ? 0 : PAD,
    tabel,
    tabelId,
    keepNext,
    teken(y, ctx) {
      const h = this.h;
      const top = y + this.boven;
      const basis = top + regelBasis(MAAT.tekst);
      tk.cel('rij', 0, kol.x0, y, kol.xA - kol.x0, h, label);
      tk.cel('rij', breed ? 2 : 1, xTekst, y, wTekst, h, lijst.map((r) => r.tekst).join(' '));
      if (icoon) tk.tegel(icoon.naam, kol.x0, top + (LH - 12) / 2, 12, icoon.stijl ?? 'solid', Boolean(icoon.rond));
      if (label) tk.tekst('sansMedium', MAAT.tekst, kol.x0 + 17, basis, label, k.tekst, 0, vak(kol.x0 + 17, y, labelB, h));
      lijst.forEach((r, i) => tk.tekst(r.font ?? 'sans', MAAT.tekst, xTekst, basis + i * LH, r.tekst, r.kleur ?? k.tekst, 0, vak(xTekst, y, wTekst, h)));
      extra?.(y, h);
      if (!breed) kolomLijnen(tk, kol, y, y + h);
      if (voet && eerste) tk.lijn(kol.xr0, y, kol.xr1, k.lijnSterk, 0.9);
      if (laatste) tk.lijn(kol.xr0, y + h, kol.xr1, k.lijnSterk, 0.35);
      kaderRand(tk, kol, y, h, ctx);
    },
  };
}

// Het drinken van één dag: het totaal tegenover het dagdoel, een dunne balk, en per soort als er meer dan één is.
function drinkRij(tk, kol, dag, doel, tabel, tabelId, kort = false) {
  const k = tk.k;
  const icoon = ICOON.drinken;
  const r = dag.rijen.find((q) => q.soort === 'drinken');
  if (!r) return maakRij(tk, kol, { icoon, label: t('tab.drinken'), regels: [{ tekst: STREEP, kleur: k.gedempt }], tabel, tabelId, voet: true });
  // BESLISSING 333: bij één dag staan totaal, doel en "gehaald" in de kerncijfers; in de tabel alleen de verdeling per drank (zonder balk)
  if (kort) {
    const verdeling = r.soorten.length > 1 ? r.soorten.map((q) => `${q.naam} ${opmaakLiter(q.ml)}`).join('  ·  ') : r.soorten[0]?.naam ?? STREEP;
    return maakRij(tk, kol, { icoon, label: t('tab.drinken'), regels: tk.breek('sans', MAAT.tekst, verdeling, kol.wWat).map((tekst) => ({ tekst })), tabel, tabelId, voet: true });
  }
  const ml = dag.drinkenMl ?? 0;
  const gehaald = doel > 0 && ml >= doel;
  const hoofd = doel > 0 ? t('delen.pdfVanDoel', { ml: opmaakLiter(ml), doel: opmaakLiter(doel) }) : opmaakLiter(ml);
  const balk = 96;
  const hoofdB = tk.tb('sansMedium', MAAT.tekst, hoofd);
  // Op de eerste regel staat het totaal, daarna (als het past) "· dagdoel gehaald" en rechts de balk; op de tweede regel de soorten als opsomming.
  const soorten = r.soorten.length > 1 ? r.soorten.map((q) => `${q.naam} ${opmaakLiter(q.ml)}`).join('  ·  ') : '';
  const gehaaldTekst = gehaald ? t('delen.pdfDoelGehaald') : '';
  const ruimte = kol.wWat - balk - 12 - hoofdB - 12; // naast het totaal, links van de balk
  let naast = '';
  let tweede = soorten;
  if (gehaaldTekst) {
    if (tk.tb('sans', MAAT.tekst, `·  ${gehaaldTekst}`) <= ruimte) naast = `·  ${gehaaldTekst}`;
    else tweede = [gehaaldTekst, soorten].filter(Boolean).join('  ·  ');
  }
  const eronder = tweede ? tk.breek('sans', MAAT.tekst, tweede, kol.wWat) : [];
  return maakRij(tk, kol, {
    icoon,
    label: t('tab.drinken'),
    regels: [{ tekst: hoofd, font: 'sansMedium' }, ...eronder.map((tekst) => ({ tekst }))],
    tabel,
    tabelId,
    voet: true,
    extra(y) {
      const top = y + PAD + (LH - 4.5) / 2;
      if (naast) tk.tekst('sans', MAAT.tekst, kol.xWat + hoofdB + 10, y + PAD + regelBasis(MAAT.tekst), naast, k.tekst, 0, vak(kol.xWat + hoofdB + 10, y, ruimte + 2, LH + 2 * PAD));
      tk.vlak(kol.x1 - balk, top, balk, 4.5, k.lavendel.zacht, false, 2.25);
      if (doel > 0 && ml > 0) tk.vlak(kol.x1 - balk, top, Math.max(4.5, balk * Math.min(1, ml / doel)), 4.5, k.lavendel.vol, false, 2.25);
      tk.kader(kol.x1 - balk, top, balk, 4.5, k.lijnSterk, 2.25, 0.5);
    },
  });
}

// Eén dag: een band met de datum en de rijen eronder. Een lege dag is alleen de band.
function dagGroep(tk, doc, dag, kol, index, voor, metBand = true) {
  const k = tk.k;
  const o = doc.onderdelen ?? {};
  const id = `dag${index}`;
  const eersteKolom = o.eten ? t('delen.pdfKolomMaaltijd') : t('delen.kolomOnderdeel');
  const opties = { id, titel: dag.titelJaar, bandTekst: dag.bandTekst, metBand, eersteKolom };
  // Bij één dag is de titel van de pagina de datum: dan geen band
  const rijen = [];
  const vervolg = tabelKop(tk, kol, { ...opties, vervolg: true });
  if (!dag.leeg) {
    if (o.eten) {
      const eten = dag.rijen.filter((r) => r.soort === 'eten');
      if (!eten.length) rijen.push(maakRij(tk, kol, { icoon: ICOON.eten, label: t('dag.eten'), regels: [{ tekst: STREEP, kleur: k.gedempt }], tabel: vervolg, tabelId: id }));
      for (const r of eten) {
        rijen.push(
          maakRij(tk, kol, {
            icoon: { naam: MAALTIJDICOON[r.maaltijd] ?? ICOON.eten.naam },
            label: r.titel,
            regels: r.tekst ? tk.breek('sans', MAAT.tekst, r.tekst, kol.wWat) : [{ tekst: STREEP, kleur: k.gedempt }],
            tabel: vervolg,
            tabelId: id,
          }),
        );
      }
    }
    if (o.notities && dag.notitie) {
      const regels = tk.breek('sans', MAAT.tekst, dag.notitie, kol.wWat);
      // Een lange notitie in stukken van zes regels; een stukje van één regel alleen aan het eind blijft bij het vorige stuk.
      const stukken = [];
      for (let i = 0; i < regels.length; i += 6) stukken.push(regels.slice(i, i + 6));
      if (stukken.length > 1 && stukken.at(-1).length < 2) stukken.splice(-2, 2, stukken.at(-2).concat(stukken.at(-1)));
      stukken.forEach((stuk, i) =>
        rijen.push(maakRij(tk, kol, { icoon: i ? null : ICOON.notitie, label: i ? '' : t('dag.notitieTitel'), regels: stuk, tabel: vervolg, tabelId: id, eerste: i === 0, laatste: i === stukken.length - 1 })),
      );
    }
    // Drinken is de afgescheiden voetrij van de tabel
    if (o.drinken) rijen.push(drinkRij(tk, kol, dag, doc.dagdoelMl, vervolg, id, doc.modus === 'dag'));
  }
  // Een dag zonder gegevens: de band en één rij "Niets genoteerd", in hetzelfde kader
  if (!rijen.length) {
    const leeg = maakRij(tk, kol, { regels: [{ tekst: t('delen.pdfNietsGenoteerd'), kleur: k.gedempt }], tabelId: id, breed: true });
    return { voor, items: [tabelKop(tk, kol, { ...opties, metKop: false, metBand: true }), leeg] };
  }
  return { voor, items: [tabelKop(tk, kol, opties), ...rijen] };
}

// De titel met de periode en de rij kerncijfers (alleen feiten).
function titelGroep(tk, doc) {
  const k = tk.k;
  // BESLISSING 461: bovenaan het woord "Verslag" als grote titel en eronder de periode als label in hoofdletters (op één regel; past ze niet, dan breekt ze na " - ").
  const titel = t('delen.verslagTitel');
  const periode = periodeAlsLabel(doc.periodeLang);
  const sp = MAAT.dagkop * LABEL_SPATIERING;
  const regels = tk.tb('sansMedium', MAAT.dagkop, periode, sp) <= tk.breedte || !periode.includes(' - ') ? [periode] : periode.split(' - ').map((deel, i) => (i ? '- ' + deel : deel));
  const items = [
    {
      // even hoog als de vroegere titel van één regel (42 pt): de pagina-indeling (BESLISSING 420) verandert niet
      h: 30 + regels.length * 12,
      keepNext: true,
      teken(y) {
        const hoogte = 30 + regels.length * 12;
        tk.tekst('serif', MAAT.titel, tk.rand, y + 20, titel, k.tekst, 0, vak(tk.rand, y, tk.breedte, hoogte));
        regels.forEach((regel, i) => tk.tekst('sansMedium', MAAT.dagkop, tk.rand, y + 33.5 + i * 12, regel, k.gedempt, sp, vak(tk.rand, y, tk.breedte, hoogte)));
      },
    },
  ];
  const cijfers = doc.leeg ? [] : doc.kerncijfers ?? [];
  if (cijfers.length) {
    // Exact even brede blokken over de volle breedte: het eerste op de linkermarge, het laatste tot de rechtermarge, scheidingslijnen op gelijke afstand.
    // In elk blok dezelfde drie lijnen: het label, het getal in de grote letter met de eenheid klein erachter, en een onderregel.
    const bw = tk.breedte / cijfers.length;
    const inspring = 12; // tussen een scheidingslijn en de tekst (het eerste blok begint op de marge)
    // een onderregel die niet past, breekt in twee even lange regels (niet met één woord op de tweede)
    const onderRegels = cijfers.map((c, i) => {
      const max = bw - (i ? inspring : 0) - 4;
      const volledig = tk.tb('sans', MAAT.label, c.onder ?? '');
      return tk.breek('sans', MAAT.label, c.onder ?? '', volledig > max ? Math.min(max, volledig / 2 + 8) : max);
    });
    const regelsMax = Math.max(1, ...onderRegels.map((r) => r.length));
    const hoogte = 52 + regelsMax * 10;
    items.push({
      h: hoogte,
      teken(y) {
        tk.lijn(tk.rand, y, tk.b - tk.rand, k.lijnSterk, 0.8);
        tk.lijn(tk.rand, y + hoogte, tk.b - tk.rand, k.lijnSterk, 0.8);
        cijfers.forEach((c, i) => {
          const x = tk.rand + i * bw + (i ? inspring : 0);
          const vakBreedte = bw - (i ? inspring : 0);
          tk.cel('kerncijfer', i, tk.rand + i * bw, y, bw, hoogte, c.waarde);
          if (i) tk.verticaal(tk.rand + i * bw, y + 9, y + hoogte - 9, k.lijnSterk, 0.4);
          tk.tekst('sansMedium', MAAT.label, x, y + 17, c.label.toUpperCase(), k.gedempt, 0.5, vak(x, y, vakBreedte, hoogte));
          tk.tekst('serif', MAAT.kerncijfer, x, y + 39, c.getal, k.tekst, 0, vak(x, y, vakBreedte, hoogte));
          if (c.eenheid) tk.tekst('sans', MAAT.eenheid, x + tk.tb('serif', MAAT.kerncijfer, c.getal) + 3, y + 39, c.eenheid, k.tekst, 0, vak(x, y, vakBreedte, hoogte));
          onderRegels[i].forEach((regel, n) => tk.tekst('sans', MAAT.label, x, y + 53 + n * 10, regel, k.gedempt, 0, vak(x, y, vakBreedte, hoogte)));
        });
      },
    });
  }
  return { voor: 0, items };
}

// Het gewicht: een korte tabel (datum, kg, verschil met de vorige weging), neutraal.
// De kolommen staan op 34, 50, 76 en 100 % van de breedte; de getallen staan rechts uitgelijnd
// onder hun kop, 6 pt voor de rechterrand van hun kolom. Alleen bij twee of meer wegingen (doc.gewicht.tabel).
function gewichtGroep(tk, doc, kol) {
  const k = tk.k;
  const W = tk.breedte;
  const rechtsRand = [0.5, 0.76, 1].map((f) => kol.xr0 + W * f - 6);
  const koppen = [t('delen.pdfKolomGewicht'), t('delen.pdfKolomVorige'), t('delen.pdfKolomEerste')];
  const id = 'gewicht';
  const rechts = (font, tekst, x, basis, kleur, v) => tk.tekst(font, MAAT.tekst, x - tk.tb(font, MAAT.tekst, tekst), basis, tekst, kleur, 0, v);
  const kop = {
    h: KOP_H,
    isKop: true,
    keepNext: true,
    tabelId: id,
    teken(y, ctx) {
      tk.cel('gewichtkop', 0, kol.x0, y, 0, KOP_H, '');
      tk.tekst('sansMedium', MAAT.label, kol.x0, y + 10.6, t('delen.pdfKolomDatum').toUpperCase(), k.gedempt, 0.6);
      koppen.forEach((tekst, i) => tk.tekst('sansMedium', MAAT.label, rechtsRand[i] - tk.tb('sansMedium', MAAT.label, tekst.toUpperCase(), 0.6), y + 10.6, tekst.toUpperCase(), k.gedempt, 0.6));
      tk.lijn(kol.xr0, y + KOP_H, kol.xr1, k.lijnSterk, 0.8);
      kaderRand(tk, kol, y, KOP_H, ctx);
    },
  };
  const items = [
    {
      h: 26,
      keepNext: true,
      teken(y) {
        tk.tekst('serif', MAAT.sectie, tk.rand, y + 17, doc.gewicht.titel, k.tekst);
      },
    },
    kop,
  ];
  doc.gewicht.wegingen.forEach((w, i, lijst) => {
    const h = LH + 2 * PAD;
    items.push({
      h,
      tabel: kop,
      tabelId: id,
      keepNext: i < 1 || i === lijst.length - 2, // de eerste rij blijft bij de kop, de laatste twee bij elkaar
      teken(y, ctx) {
        const basis = y + PAD + regelBasis(MAAT.tekst);
        tk.cel('gewicht', 0, kol.x0, y, 0, h, w.kgTekst);
        tk.tekst('sans', MAAT.tekst, kol.x0, basis, w.datumTekst, k.tekst, 0, vak(kol.x0, y, rechtsRand[0] - kol.x0 - 60, h));
        rechts('sansMedium', w.kgTekst, rechtsRand[0], basis, k.tekst, vak(rechtsRand[0] - 70, y, 70, h));
        rechts('sans', w.verschil || STREEP, rechtsRand[1], basis, w.verschil ? k.tekst : k.gedempt, vak(rechtsRand[0] + 4, y, rechtsRand[1] - rechtsRand[0] - 4, h));
        rechts('sans', w.verschilEerste || STREEP, rechtsRand[2], basis, w.verschilEerste ? k.tekst : k.gedempt, vak(rechtsRand[1] + 4, y, rechtsRand[2] - rechtsRand[1] - 4, h));
        tk.lijn(kol.xr0, y + h, kol.xr1, k.lijnSterk, 0.35);
        kaderRand(tk, kol, y, h, ctx);
      },
    });
  });
  return { voor: 22, items };
}

function opmaak(tk, doc) {
  const kol = kolommen(tk);
  const groepen = [titelGroep(tk, doc)];
  const heeftDagen = doc.dagen.some((d) => !d.leeg);
  // Het gewicht staat vóór de dagen: een korte tabel die niet alleen op een bijna lege laatste pagina terechtkomt
  const metTabel = Boolean(doc.gewicht?.tabel);
  if (metTabel) groepen.push(gewichtGroep(tk, doc, kol));
  if (heeftDagen) {
    doc.dagen.forEach((dag, i) => groepen.push(dagGroep(tk, doc, dag, kol, i, i ? 12 : 22, doc.dagen.length > 1)));
  } else if (!doc.gewicht) {
    groepen.push({
      voor: 8,
      items: [{ h: 26, teken: (y) => tk.tekst('sans', 10.5, tk.rand, y + 17, t('delen.leegPeriode'), tk.k.gedempt) }],
    });
  }
  return groepen;
}

// ---- de pagina's: wat past waar (BESLISSING 420)
//
// Alle onderdelen van alle groepen (titel en kerncijfers, gewicht, de dagen) staan achter elkaar; een pagina is een stuk van die rij tussen
// twee breekpunten. Een breekpunt ligt altijd tussen twee onderdelen, dus nooit midden in een rij, een tekstregel, het kerncijferblok of een kop.
//  - tussen twee groepen mag altijd gebroken worden (behalve direct na de titel);
//  - binnen een tabel (een dag, het gewicht) alleen tussen twee rijen, met minstens twee rijen van die tabel boven en twee onder de breuk
//    (een kop staat nooit alleen onderaan, het vervolg is geen weeskind) en niet na een onderdeel dat bij het volgende moet blijven (keepNext);
//    het vervolg begint met de kop opnieuw: bij een dag de band met "(vervolg)" en de kolomkop, bij het gewicht de kolomkop.
// Van alle mogelijke indelingen kiezen we, in deze volgorde:
//  1. zo weinig mogelijk pagina's;
//  2. zo weinig mogelijk tekort: elke pagina behalve de laatste minstens voor VOL gevuld, en de laatste pagina
//     van een verslag van meer dan één pagina minstens MIN_LAATSTE hoog (geen weeskind);
//  3. zo weinig mogelijk lege ruimte en dan zo weinig mogelijk gesplitste dagen: een dag die niet meer past, schuift alleen heel door als er
//     daardoor bijna niets leeg blijft (rond een twintigste), en wordt anders tussen twee rijen gesplitst. Een dag langer dan een pagina
//     wordt altijd gesplitst.
// Het zoeken is een kortste-pad over de breekpunten (zoals een zetprogramma alinea's breekt): exact en snel, ook voor 366 dagen.
// Eigenaar, 0.5.9: geen wit onderaan een pagina. Een dag die niet meer past, wordt tussen twee rijen gesplitst zodra er anders meer dan
// ongeveer een twintigste van de pagina leeg zou blijven; het vervolg begint met de kop en "(vervolg)".
const VOL = 0.93;
const MIN_LAATSTE = 150;
const SPLITS = 0.3; // de prijs van een gesplitste dag, tegenover 100 x (leeg deel van de pagina)²: 5,5 procent leeg kost evenveel
const LEEG = 100;

function verdeel(groepen) {
  const A = INHOUD_BODEM - INHOUD_TOP;
  const rij = [];
  groepen.forEach((g, gi) => {
    const kop = g.items.findIndex((x) => x.isKop);
    g.items.forEach((item, i) => rij.push({ item, g, gi, i, kop }));
  });
  const N = rij.length;
  const hoogte = (item, naKop) => (item.naKop !== undefined ? item.h0 + (naKop ? item.naKop : 0) : item.h);
  // soort breekpunt vóór onderdeel k: 'groep' (tussen twee groepen), 'splits' (binnen een tabel) of null (verboden)
  const breek = (k) => {
    if (k === N) return 'groep';
    const { i, kop, g } = rij[k];
    const vorige = rij[k - 1].item;
    if (i === 0) return vorige.keepNext && !vorige.tabelId ? null : 'groep';
    if (kop < 0 || vorige.keepNext || i - kop < 3 || g.items.length - i < 2) return null;
    return 'splits';
  };
  const soort = Array.from({ length: N + 1 }, (_, k) => (k === 0 ? 'groep' : breek(k)));
  // kosten als [pagina's, tekort, rest], lexicografisch vergeleken
  const kleiner = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const beste = Array(N + 1).fill(null);
  const van = Array(N + 1).fill(-1);
  beste[0] = [0, 0, 0];
  for (let a = 0; a < N; a += 1) {
    if (!beste[a] || !soort[a]) continue;
    const start = rij[a];
    const vervolg = start.i > 0 && start.item.tabel && !start.item.isKop ? start.item.tabel : null;
    let y = vervolg ? vervolg.h : 0;
    let naKop = Boolean(vervolg);
    let gevonden = false;
    for (let b = a + 1; b <= N; b += 1) {
      const r = rij[b - 1];
      if (b - 1 > a && r.i === 0) y += r.g.voor;
      y += hoogte(r.item, naKop);
      naKop = Boolean(r.item.isKop);
      const past = y <= A + 0.5;
      if (!past && gevonden) break;
      if (!soort[b]) continue;
      // een vervolg binnen dezelfde tabel heeft ook minstens twee rijen
      if (soort[b] === 'splits' && start.i > 0 && rij[b].gi === start.gi && b - a < 2) continue;
      const laatste = b === N;
      let tekort = past ? 0 : 1e6 + y; // past zelfs het kleinste stuk niet, dan toch (één onderdeel hoger dan een pagina)
      if (!laatste && y < VOL * A) tekort += VOL * A - y;
      if (laatste && a > 0 && y < MIN_LAATSTE) tekort += 4 * (MIN_LAATSTE - y);
      const rest = (laatste ? 0 : LEEG * ((A - Math.min(y, A)) / A) ** 2) + (soort[b] === 'splits' ? SPLITS : 0);
      const kost = [beste[a][0] + 1, beste[a][1] + tekort, beste[a][2] + rest];
      if (!beste[b] || kleiner(kost, beste[b]) < 0) {
        beste[b] = kost;
        van[b] = a;
      }
      gevonden = true;
      if (!past) break;
    }
  }
  const grenzen = [];
  for (let b = N; b > 0; b = van[b]) grenzen.unshift([van[b], b]);
  // de pagina's opbouwen: y per onderdeel, de kop bovenaan een vervolg, de extra ruimte na een kop
  const paginas = [];
  const eindPagina = [];
  for (const [a, b] of grenzen) {
    const p = { items: [], eind: INHOUD_TOP };
    let y = INHOUD_TOP;
    const zet = (item) => {
      if (item.naKop !== undefined) {
        const extra = p.items.at(-1)?.item.isKop ? item.naKop : 0;
        item.h = item.h0 + extra;
        item.boven = item.boven0 + extra;
      }
      p.items.push({ y, item });
      y += item.h;
      p.eind = y;
    };
    if (rij[a].i > 0 && rij[a].item.tabel && !rij[a].item.isKop) zet(rij[a].item.tabel);
    for (let k = a; k < b; k += 1) {
      if (k > a && rij[k].i === 0) y += rij[k].g.voor;
      zet(rij[k].item);
      eindPagina[rij[k].gi] = paginas.length;
    }
    paginas.push(p);
  }
  return { paginas, eindPagina };
}

// De koptekst en de voet van elke pagina.
function paginaKop(tk, doc, eerste = false) {
  const k = tk.k;
  tk.beeldmerk(tk.rand, 33, 18);
  tk.tekst('serifSchuin', 14.5, tk.rand + 23, 47, 'bloei', k.tekst);
  const wie = doc.kop.naam ? t('delen.pdfKop', { naam: doc.kop.naam }) : t('delen.pdfKopZonderNaam');
  const ww = tk.tb('sansMedium', MAAT.klein, wie);
  if (doc.modus === 'dag' || eerste) {
    // bij één dag volstaat de titel; BESLISSING 490: ook op pagina 1 (daar staat de titel met de volle periode), alleen de volgende pagina's houden de korte periode
    tk.tekst('sansMedium', MAAT.klein, tk.b - tk.rand - ww, 45, wie, k.tekst);
  } else {
    // BESLISSING 459: de korte periode is een label (hoofdletters, gespatieerd); gemeten op de omgezette tekst
    const periode = alsLabel(doc.periodeKort);
    const sp = MAAT.label * LABEL_SPATIERING;
    const pw = tk.tb('sansMedium', MAAT.label, periode, sp);
    tk.tekst('sansMedium', MAAT.label, tk.b - tk.rand - pw, 45, periode, k.gedempt, sp);
    tk.tekst('sansMedium', MAAT.klein, tk.b - tk.rand - pw - 14 - ww, 45, wie, k.tekst);
    tk.verticaal(tk.b - tk.rand - pw - 7, 36, 47, k.lijnSterk, 0.5);
  }
  tk.lijn(tk.rand, KOP_LIJN, tk.b - tk.rand, k.lijnSterk, 0.6);
}

function paginaVoet(tk, doc, n, m) {
  const k = tk.k;
  const lijn = tk.voetLijn;
  tk.lijn(tk.rand, lijn, tk.b - tk.rand, k.lijnSterk, 0.5);
  tk.tekst('sans', MAAT.klein, tk.rand, lijn + 14, t('delen.pdfGemaakt', { datum: doc.gemaaktOp }), k.gedempt);
  const nr = t('delen.pagina', { n, m });
  tk.tekst('sans', MAAT.klein, tk.b - tk.rand - tk.tb('sans', MAAT.klein, nr), lijn + 14, nr, k.gedempt);
}

// ------------------------------------------------------------------ de pdf zelf

// maakPdf(doc, fonts, { titel, meet, nu }) → Uint8Array. doc komt uit bouwVerslagModel; fonts uit laadFonts().
// Met meet: true staat in bytes.meting wat er gemeten en getekend is (voor de test).
export function maakPdf(doc, fonts, { titel = null, meet = false, nu = new Date() } = {}) {
  const tk = new Tekenaar(fonts, papierKleuren(), meet);
  const groepen = opmaak(tk, doc);
  const { paginas, eindPagina } = verdeel(groepen);
  // BESLISSING 332: een verslag dat op één pagina past en die niet vult, krijgt een blad zo hoog als zijn inhoud: de voet staat een vaste ruimte
  // (VOET_RUIMTE) onder de laatste tabel, niet onderaan een leeg blad. Vult de inhoud meer dan 85 % van een A4, dan blijft het een gewone A4-pagina.
  if (paginas.length === 1) {
    const hoogte = Math.round(paginas[0].eind + VOET_RUIMTE + (H - VOET_LIJN));
    if (hoogte <= H * MAX_KORT) {
      tk.h = hoogte;
      tk.voetLijn = hoogte - (H - VOET_LIJN);
    }
  }
  paginas.forEach((pagina, i) => {
    tk.nieuwePagina();
    paginaKop(tk, doc, i === 0);
    // boven/onder: het eerste en het laatste onderdeel van een tabel op deze pagina tekenen de rand van het kader
    pagina.items.forEach(({ y, item }, n, lijst) => {
      tk.tabelId = item.tabelId ?? null; // alleen voor de meting: bij welke tabel een cel hoort
      item.teken(y, { boven: Boolean(item.tabelId) && lijst[n - 1]?.item.tabelId !== item.tabelId, onder: Boolean(item.tabelId) && lijst[n + 1]?.item.tabelId !== item.tabelId });
    });
    paginaVoet(tk, doc, i + 1, paginas.length);
  });

  const documentTitel = titel ?? `${doc.kop.naam ? t('delen.pdfKop', { naam: doc.kop.naam }) : t('delen.pdfKopZonderNaam')}, ${doc.periodeKort}`;
  const bytes = schrijf(tk, documentTitel, nu);
  bytes.paginas = tk.paginas.length;
  bytes.afdruk = { b: tk.b, h: tk.h, paginas: tk.paginas.map((p) => p.svg) }; // dezelfde pagina's als de pdf, voor Afdrukken
  if (meet) bytes.meting = { paginas: tk.paginas.length, teksten: tk.log, lopen: tk.lopen ?? [], cellen: tk.cellen, b: tk.b, h: tk.h, rand: tk.rand, bodem: INHOUD_BODEM, top: INHOUD_TOP, eindPerPagina: paginas.map((p) => p.eind), groepPagina: eindPagina };
  return bytes;
}

function toUnicode(kaart) {
  const regels = [...kaart.entries()].sort((a, b) => a[0] - b[0]);
  const hex = (n) => n.toString(16).padStart(4, '0');
  const uni = (cp) => (cp > 0xffff ? hex(0xd800 + ((cp - 0x10000) >> 10)) + hex(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex(cp));
  let uit = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n';
  for (let i = 0; i < regels.length; i += 100) {
    const stuk = regels.slice(i, i + 100);
    uit += `${stuk.length} beginbfchar\n${stuk.map(([gid, cp]) => `<${hex(gid)}> <${uni(cp)}>`).join('\n')}\nendbfchar\n`;
  }
  return uit + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
}

const bytesVan = (tekst) => Uint8Array.from(tekst, (c) => c.charCodeAt(0) & 0xff);
const pdfTekst = (tekst) => {
  // UTF-16BE met BOM, hexadecimaal: veilig voor elke titel
  let hex = 'feff';
  for (const c of tekst) {
    const cp = c.codePointAt(0);
    // boven U+FFFF een surrogaatpaar (anders staan er vijf hexcijfers en is de titel ongeldig)
    if (cp > 0xffff) hex += (0xd800 + ((cp - 0x10000) >> 10)).toString(16).padStart(4, '0') + (0xdc00 + ((cp - 0x10000) & 0x3ff)).toString(16).padStart(4, '0');
    else hex += cp.toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
};

// D:20261115143000+01'00' voor de metadata
function pdfDatum(nu) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const verschil = -nu.getTimezoneOffset();
  const teken = verschil < 0 ? '-' : '+';
  return `D:${nu.getFullYear()}${p(nu.getMonth() + 1)}${p(nu.getDate())}${p(nu.getHours())}${p(nu.getMinutes())}${p(nu.getSeconds())}${teken}${p(Math.floor(Math.abs(verschil) / 60))}'${p(Math.abs(verschil) % 60)}'`;
}

function schrijf(tk, titel, nu = new Date()) {
  const w = new Schrijver();
  const namen = Object.keys(tk.fonts);
  // Nummering: 1 catalogus, 2 pagina's, 3 info, 4 ExtGStates; per lettertype 5 objecten; daarna per pagina 2
  const toestanden = [...tk.toestanden.values()];
  let n = 5;
  const fontId = {};
  for (const naam of namen) {
    fontId[naam] = { type0: n, cid: n + 1, beschrijving: n + 2, bestand: n + 3, unicode: n + 4 };
    n += 5;
  }
  const eerstePagina = n;

  w.object(1, '<< /Type /Catalog /Pages 2 0 R /Lang (nl-BE) /ViewerPreferences << /DisplayDocTitle true >> >>');
  w.object(2, `<< /Type /Pages /Count ${tk.paginas.length} /Kids [${tk.paginas.map((_, i) => `${eerstePagina + i * 2} 0 R`).join(' ')}] >>`);
  w.object(3, `<< /Title ${pdfTekst(titel)} /Producer ${pdfTekst('Bloei')} /Creator ${pdfTekst('Bloei')} /CreationDate (${pdfDatum(nu)}) /ModDate (${pdfDatum(nu)}) >>`);
  w.object(4, `<< ${toestanden.map((s) => `/${s.naam} << /Type /ExtGState /ca ${s.alpha} /CA ${s.alpha} /BM /${s.vermenigvuldig ? 'Multiply' : 'Normal'} >>`).join(' ')} >>`);

  for (const naam of namen) {
    const f = tk.fonts[naam];
    const id = fontId[naam];
    const basis = `Bloei-${naam}`;
    const breedtes = `[0 [${f.breedtes1000.join(' ')}]]`;
    w.object(id.type0, `<< /Type /Font /Subtype /Type0 /BaseFont /${basis} /Encoding /Identity-H /DescendantFonts [${id.cid} 0 R] /ToUnicode ${id.unicode} 0 R >>`);
    w.object(id.cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${basis} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${id.beschrijving} 0 R /CIDToGIDMap /Identity /DW 500 /W ${breedtes} >>`);
    w.object(id.beschrijving, `<< /Type /FontDescriptor /FontName /${basis} /Flags 4 /FontBBox [${f.bbox.join(' ')}] /ItalicAngle ${f.schuin} /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.capHoogte} /StemV 80 /FontFile2 ${id.bestand} 0 R >>`);
    w.object(id.bestand, `/Filter /FlateDecode /Length1 ${f.programma.length}`, zlibSync(f.programma, { level: 9 }));
    const cmap = bytesVan(toUnicode(tk.gebruikt[naam]));
    w.object(id.unicode, '/Filter /FlateDecode', zlibSync(cmap));
  }

  tk.paginas.forEach((pagina, i) => {
    const pid = eerstePagina + i * 2;
    const letters = [...pagina.lettertypen].map((naam) => `/${naam} ${fontId[naam].type0} 0 R`).join(' ');
    const staten = [...pagina.toestanden].length ? ` /ExtGState 4 0 R` : '';
    w.object(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${tk.b} ${tk.h}] /Resources << /Font << ${letters} >>${staten} >> /Contents ${pid + 1} 0 R >>`);
    w.object(pid + 1, '/Filter /FlateDecode', zlibSync(bytesVan(pagina.ops.join('\n'))));
  });
  return w.einde(1, 3);
}

export const verslagBestandsnaam = ({ van, tot }) => (van === tot ? `bloei-verslag-${van}.pdf` : `bloei-verslag-${van}-${tot}.pdf`);

// Het verslag als pdf-bestand, klaar om te delen of op te slaan.
export async function pdfBestand(verslag, naam = '') {
  const fonts = await laadFonts();
  const bytes = maakPdf(bouwVerslagModel(verslag, naam), fonts);
  const bestand = new File([bytes], verslagBestandsnaam(verslag), { type: 'application/pdf' });
  bestand.paginas = bytes.paginas; // het voorbeeld zegt het als het er meer dan één zijn
  bestand.afdruk = bytes.afdruk; // Afdrukken tekent deze pagina's: zelfde formaat en indeling als de pdf
  return bestand;
}
