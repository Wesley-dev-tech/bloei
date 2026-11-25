// De twee feesten van Bloei: confetti, ballonnen en een slinger op haar verjaardag, en vuurwerk bij de jaarwissel. Hier mag het uitbundig. Dit zijn de enige plekken in Bloei met zo een
// animatie (elders geldt: nooit confetti, nooit geluid). Geluid komt er niet bij, en wie "Verminder beweging" aan heeft staan, krijgt alleen
// de kaart met de wens.
//  - Verjaardag: bij de eerste keer openen op de dag van haar geboortedatum (profiel.verjaardag), één keer per jaar.
//  - Nieuwjaar: precies om middernacht als Bloei op oudejaarsavond openstaat, anders bij de eerste keer openen op 1 januari.
import { h } from './dom.js';
import { knop } from './componenten.js';
import { magBewegen } from './beweging.js';
import { t } from '../teksten.js';
import { luister } from '../kern/bus.js';
import { leesInstelling, zetInstelling, isStartKlaar } from '../data/instellingen.js';
import { isJarig, leeftijdOp } from '../logica/kalender.js';
import { voornaamVan } from '../logica/naam.js';
import { vandaag } from '../kern/datum.js';
import { vraagGeboortedatumEenKeer } from './verjaardag.js';
import { medaille } from './medaille.js';

let open = null;

// ---------------------------------------------------------------- de animatie
// Eén doek (canvas) over het hele scherm, niet honderden losse elementen: zo loopt het op elke telefoon vlot. Alles beweegt op de klok van
// het scherm (requestAnimationFrame) met de echte verstreken tijd, en de animatie meet zelf hoe vlot ze loopt: duurt een beeld te lang, dan
// komen er minder nieuwe deeltjes bij (kwaliteit), nooit haperende beelden.
// Alles volgt echte natuurkunde in het klein, zodat het er echt uitziet: papier dat tuimelt en dwarrelt, ballonnen met licht en schaduw
// die aan hun touwtje opstijgen, vuurpijlen die vertragen tot ze openspatten in een bol van vonken die uitdooft.
const TAU = Math.PI * 2;
const meng = (hex, naar, f) => {
  const n = parseInt(hex.slice(1), 16);
  const k = [n >> 16, (n >> 8) & 255, n & 255].map((c, i) => Math.round(c + (naar[i] - c) * f));
  return `rgb(${k[0]},${k[1]},${k[2]})`;
};
const WIT = [255, 255, 255];
const ZWART = [0, 0, 0];
// Van elke kleur drie tinten: de kant in het licht, de gewone kleur en de kant in de schaduw.
const tinten = (hex) => ({ basis: hex, licht: meng(hex, WIT, 0.38), donker: meng(hex, ZWART, 0.3) });
const PAPIER = ['#e63946', '#f4a300', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5d8f', '#ffd60a', '#52b788'].map(tinten);
// De ultieme medaille (In volle bloei) krijgt haar eigen feest: goud, en bloemblaadjes in de kleuren van Bloei zelf (oudroze, poeder, mist,
// pruim en goud).
const BLOEMEN = ['#b5707c', '#e8b7bd', '#9fbdbf', '#8b5a94', '#e9c46a', '#f1d9a0', '#d98e9a'].map(tinten);
const FOLIE = ['#e9c46a', '#cfd8e3'].map(tinten); // goud- en zilverfolie: die blinkt als ze naar het licht draait
// Vuurwerk: de kleuren van echte sterren [tint, verzadiging]. Elke ster begint witheet, krijgt dan haar kleur en dooft. Boven een donker
// thema (Nacht) zijn de kleuren helder, zoals tegen een nachthemel; boven de lichte thema's dieper, zodat ze ook daar goed afsteken.
const VUUR = [[355, 95], [22, 100], [45, 100], [135, 90], [188, 95], [218, 100], [282, 95], [325, 95]];
const HELDER = [92, 72, 62, 60, 58, 56, 54, 50];
const DIEP = [82, 56, 49, 48, 47, 46, 45, 43];
const paletten = new Map();
const palet = (tint, vers, donker) => {
  const sleutel = tint + '/' + vers + '/' + donker;
  if (!paletten.has(sleutel)) paletten.set(sleutel, (donker ? HELDER : DIEP).map((licht, i) => `hsl(${tint}, ${i === 0 ? Math.min(vers, 60) : vers}%, ${licht}%)`));
  return paletten.get(sleutel);
};

function speel(doek, soort, jaar = null) {
  const ctx = doek.getContext('2d');
  if (!ctx) return () => {};
  let b = 0;
  let hgt = 0;
  let dpr = 1;
  // Boven een licht thema is er geen nachthemel waartegen vuurwerk afsteekt. Daar ligt onder de vonken een tweede doek, waarop rond elke
  // knal even een zachte schemer valt die weer optrekt. De app blijft erdoor zichtbaar, en de kleuren van de vonken springen eruit.
  const donker = document.documentElement.getAttribute('data-theme') === 'nacht';
  const onder = soort === 'vuurwerk' && !donker ? document.createElement('canvas') : null;
  const octx = onder?.getContext('2d') || null;
  if (onder) {
    onder.className = doek.className;
    onder.setAttribute('aria-hidden', 'true');
    doek.before(onder);
  }
  const pasAan = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // scherper dan 2 ziet niemand in een regen van snippers, en het kost veel
    b = window.innerWidth;
    hgt = window.innerHeight;
    doek.width = Math.round(b * dpr);
    doek.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (onder) {
      // de schemer is een zachte vlek: die hoeft niet scherp, dus dit doek blijft klein en licht
      onder.width = Math.round(b / 2);
      onder.height = Math.round(hgt / 2);
      octx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    }
  };
  pasAan();
  window.addEventListener('resize', pasAan);
  const r = (van = 1, tot = null) => (tot == null ? Math.random() * van : van + Math.random() * (tot - van));
  const uit = (lijst) => lijst[Math.floor(r(lijst.length))];
  const delen = [];
  let kwaliteit = 1; // 1 = alles; zakt tot 0,2 op een toestel dat het moeilijk heeft
  let gemiddeld = 16;
  let t = 0;
  let vorige = performance.now();
  let beeld = 0;
  let gestopt = false;
  const boven_ = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
  const plan = []; // [tijdstip in seconden, functie], oplopend
  const op = (wanneer, doe) => plan.push([wanneer, doe]);
  const vuur = soort === 'vuurwerk';
  const bloei = soort === 'bloei';
  const GOUD = palet(donker ? 44 : 38, 100, donker);
  const ZILVER = palet(205, donker ? 30 : 70, donker);
  const dikker = donker ? 1 : 1.35; // boven een licht thema dikkere vonken

  // ---- snippers: stukjes papier en folie. Ze schieten samengepakt weg, de lucht remt ze af, en daarna tuimelen ze naar beneden: plat
  // vallen ze traag, op hun kant sneller, en bij elke tuimeling glijden ze opzij. Kleine snippers liggen verder weg (diepte).
  const snipper = (x, y, vx, vy, vast = null) => {
    const z = r(0.6, 1.25);
    const folie = !vast && Math.random() < 0.16;
    const rond = Math.random() < 0.14;
    const w = r(6, 10) * z;
    delen.push({ soort: 's', x, y, vx, vy, z, w, l: rond ? w : w * r(1.3, 1.9), rond, folie, tint: vast || uit(folie ? FOLIE : PAPIER), rot: r(TAU), spin: r(-4, 4), klap: r(TAU), klapSnel: r(5, 12) * (Math.random() < 0.5 ? -1 : 1), oud: 0 });
  };
  const salvo = (links) => {
    const aantal = Math.round(95 * kwaliteit);
    const kracht = Math.min(1550, hgt * 1.8);
    for (let i = 0; i < aantal; i++) {
      const hoek = links ? r(-1.42, -0.62) : r(-2.52, -1.72); // schuin omhoog, naar binnen
      const snel = r(0.45, 1) * kracht;
      snipper(links ? -10 : b + 10, hgt + 10, Math.cos(hoek) * snel, Math.sin(hoek) * snel);
    }
  };
  // Een salvo van onderaan, recht omhoog in een brede waaier.
  const middenSalvo = (fx, hoeveel) => {
    const kracht = Math.min(1500, hgt * 1.72);
    for (let i = 0; i < Math.round(hoeveel * kwaliteit); i++) {
      const hoek = r(-2.2, -0.94);
      const snel = r(0.4, 1) * kracht;
      snipper(b * fx, hgt + 10, Math.cos(hoek) * snel, Math.sin(hoek) * snel);
    }
  };
  // Een knal van snippers in alle richtingen: van achter de kaart bij de start, en wanneer een ballon openspat (dan in haar kleur).
  const plof = (x, y, hoeveel, kracht, tint = null) => {
    for (let i = 0; i < Math.round(hoeveel * kwaliteit); i++) {
      const hoek = r(TAU);
      const snel = r(0.2, 1) * kracht;
      snipper(x, y, Math.cos(hoek) * snel, Math.sin(hoek) * snel - kracht * 0.25, tint && Math.random() < 0.75 ? tint : null);
    }
    delen.push({ soort: 'o', x, y, leven: 0.32, max: 0.32, straal: kracht * 0.09 });
  };
  // Gouden stralen achter de kaart, die traag ronddraaien: het licht van een medaille van goud.
  const stralen = (zicht) => {
    const mx = b / 2;
    const my = hgt * 0.46;
    const lang = Math.hypot(b, hgt);
    const op = Math.min(1, t / 1.2) * zicht;
    ctx.fillStyle = donker ? 'rgba(246,211,101,.13)' : 'rgba(255,226,140,.24)';
    ctx.globalAlpha = op;
    for (let k = 0; k < 14; k++) {
      const a = t * 0.16 + (k / 14) * TAU;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a - 0.085) * lang, my + Math.sin(a - 0.085) * lang);
      ctx.lineTo(mx + Math.cos(a + 0.085) * lang, my + Math.sin(a + 0.085) * lang);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  // Een bloemblaadje dat naar beneden dwarrelt: het valt en tuimelt als een snipper, maar heeft de vorm van een blaadje.
  const blaadje = (x, y, vx, vy) => {
    const z = r(0.7, 1.3);
    delen.push({ soort: 'q', x, y, vx, vy, z, w: r(7, 11) * z, tint: uit(BLOEMEN), rot: r(TAU), spin: r(-2.5, 2.5), klap: r(TAU), klapSnel: r(3, 7) * (Math.random() < 0.5 ? -1 : 1), oud: 0 });
  };
  // Een fonkeling: een gouden sterretje dat ergens op het scherm even opflitst.
  const fonkel = () => {
    const leven = r(0.45, 0.85);
    delen.push({ soort: 't', x: r(8, b - 8), y: r(8, hgt - 8), leven, max: leven, groot: r(7, 16), draai: r(TAU) });
  };

  // ---- ballonnen: één keer getekend op een eigen doekje (met licht, schaduw en glans), daarna alleen nog verplaatst. Dat is licht werk.
  const ballonBeeld = (tint, straal) => {
    const s = straal;
    const breed = Math.ceil(s * 2.3);
    const hoog = Math.ceil(s * 2.9);
    const c = document.createElement('canvas');
    c.width = Math.ceil(breed * dpr);
    c.height = Math.ceil(hoog * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = breed / 2;
    const cy = s * 1.3;
    const vorm = () => {
      // de druppelvorm van een ballon: bol bovenaan, versmallend naar de knoop
      g.beginPath();
      g.moveTo(cx, cy + s * 1.28);
      g.bezierCurveTo(cx - s * 0.5, cy + s * 1.02, cx - s, cy + s * 0.42, cx - s, cy - s * 0.14);
      g.bezierCurveTo(cx - s, cy - s * 0.86, cx - s * 0.56, cy - s * 1.2, cx, cy - s * 1.2);
      g.bezierCurveTo(cx + s * 0.56, cy - s * 1.2, cx + s, cy - s * 0.86, cx + s, cy - s * 0.14);
      g.bezierCurveTo(cx + s, cy + s * 0.42, cx + s * 0.5, cy + s * 1.02, cx, cy + s * 1.28);
      g.closePath();
    };
    // de knoop
    g.fillStyle = tint.donker;
    g.beginPath();
    g.moveTo(cx - s * 0.13, cy + s * 1.42);
    g.lineTo(cx + s * 0.13, cy + s * 1.42);
    g.lineTo(cx, cy + s * 1.2);
    g.closePath();
    g.fill();
    // het lijf: licht van linksboven, schaduw rechtsonder
    const lijf = g.createRadialGradient(cx - s * 0.38, cy - s * 0.5, s * 0.08, cx - s * 0.1, cy - s * 0.1, s * 1.55);
    lijf.addColorStop(0, tint.licht);
    lijf.addColorStop(0.38, tint.basis);
    lijf.addColorStop(1, tint.donker);
    g.globalAlpha = 0.94; // rubber laat een beetje licht door
    g.fillStyle = lijf;
    vorm();
    g.fill();
    g.globalAlpha = 1;
    g.save();
    vorm();
    g.clip();
    // licht dat door de ballon heen valt, onderaan rechts
    const door = g.createRadialGradient(cx + s * 0.4, cy + s * 0.55, 0, cx + s * 0.4, cy + s * 0.55, s * 0.75);
    door.addColorStop(0, 'rgba(255,255,255,.22)');
    door.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = door;
    g.fillRect(0, 0, breed, hoog);
    // de glans: een zachte vlek en een fel puntje
    const glans = g.createRadialGradient(cx - s * 0.42, cy - s * 0.58, 0, cx - s * 0.42, cy - s * 0.58, s * 0.42);
    glans.addColorStop(0, 'rgba(255,255,255,.85)');
    glans.addColorStop(0.35, 'rgba(255,255,255,.3)');
    glans.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glans;
    g.fillRect(0, 0, breed, hoog);
    g.restore();
    return { c, breed, hoog, cx, cy };
  };
  const ballon = (i, spatOpen = false) => {
    const straal = r(21, 36);
    const x = b * (0.1 + ((i * 0.37 + 0.05) % 0.8));
    delen.push({ soort: 'b', x, y: hgt + straal * 1.6, vx: 0, vy: -r(20, 40), top: r(88, 128) * (0.75 + straal / 110), fase: r(TAU), fase2: r(TAU), straal, tint: PAPIER[(i * 3 + 1) % PAPIER.length], plof: spatOpen ? hgt * r(0.2, 0.62) : null, beeld: ballonBeeld(PAPIER[(i * 3 + 1) % PAPIER.length], straal), sx: x, lengte: straal * r(2.6, 3.4) });
  };

  // ---- vuurwerk: een pijl die opstijgt, vertraagt en op haar hoogste punt openspat. De vonken vertrekken in een bol (van voren gezien een
  // gevulde cirkel), de lucht remt ze, ze zakken en doven. Het doek wordt niet gewist maar vervaagd: zo trekt elke vonk een staart.
  const ster = (x, y, vx, vy, pal, o) => {
    const leven = r(o.leven[0], o.leven[1]);
    delen.push({ soort: 'v', x, y, px: x, py: y, vx, vy, leven, max: leven, pal, sleep: o.sleep, g: o.g, dik: o.dik * dikker, staart: o.staart || 0, twinkel: !!o.twinkel, knetter: !!o.knetter, kruis: !!o.kruis, gensters: o.gensters || 0, teller: 0 });
  };
  const knal = (x, y, kracht, type) => {
    const [tint, vers] = uit(VUUR);
    const pal = palet(tint, vers, donker);
    const n = (basis) => Math.max(10, Math.round(basis * kwaliteit));
    const bol = (aantal, snel, kleuren, o) => {
      for (let i = 0; i < aantal; i++) {
        const z = r(-1, 1);
        const hoek = r(TAU);
        const rand = Math.sqrt(1 - z * z) * snel * r(0.93, 1);
        ster(x, y, Math.cos(hoek) * rand, Math.sin(hoek) * rand, kleuren, o);
      }
    };
    let flits = pal[2];
    if (type === 'wilg') {
      // gouden wilg: trage, zware vonken die in lange bogen naar beneden hangen
      bol(n(70), kracht * 0.8, GOUD, { leven: [2.3, 3.1], sleep: 1.25, g: 125, dik: 2.2, staart: 0.08 });
      flits = GOUD[2];
    } else if (type === 'ring') {
      // een ring, schuin gezien, met een wit hart
      const aantal = n(48);
      const plat = r(0.35, 0.95);
      const draai = r(TAU);
      for (let i = 0; i < aantal; i++) {
        const hoek = (i / aantal) * TAU;
        const rx = Math.cos(hoek) * kracht;
        const ry = Math.sin(hoek) * kracht * plat;
        ster(x, y, rx * Math.cos(draai) - ry * Math.sin(draai), rx * Math.sin(draai) + ry * Math.cos(draai), pal, { leven: [1.3, 1.6], sleep: 2.1, g: 70, dik: 3.2 });
      }
      bol(n(26), kracht * 0.4, ZILVER, { leven: [0.9, 1.3], sleep: 2.1, g: 70, dik: 2.2, twinkel: true });
    } else if (type === 'knetter') {
      // goud dat op het einde knettert
      bol(n(78), kracht * 0.9, GOUD, { leven: [1.0, 1.5], sleep: 2.0, g: 80, dik: 2.6, knetter: true });
      flits = GOUD[2];
    } else if (type === 'kruis') {
      // kruisvuur: dikke vonken die halverwege elk in vier openspatten
      const aantal = n(16);
      for (let i = 0; i < aantal; i++) {
        const hoek = (i / aantal) * TAU + r(-0.1, 0.1);
        ster(x, y, Math.cos(hoek) * kracht * 0.95, Math.sin(hoek) * kracht * 0.95, pal, { leven: [1.25, 1.45], sleep: 2.1, g: 60, dik: 3.8, kruis: true });
      }
    } else if (type === 'palm') {
      // palmboom: een handvol dikke gouden armen die genstertjes achterlaten
      const aantal = Math.max(7, Math.round(10 * kwaliteit));
      for (let i = 0; i < aantal; i++) {
        const hoek = (i / aantal) * TAU + r(-0.15, 0.15);
        const snel = kracht * r(0.85, 1.05);
        ster(x, y, Math.cos(hoek) * snel, Math.sin(hoek) * snel - 60, GOUD, { leven: [2.0, 2.6], sleep: 1.5, g: 120, dik: 4.4, staart: 0.1, gensters: 26 });
      }
      flits = GOUD[2];
    } else if (type === 'hart' || type === 'ster') {
      // een figuur aan de hemel: een hart of een ster. Elke vonk krijgt precies de snelheid van haar plek in de figuur, zodat de vorm blijft.
      const aantal = n(52);
      const kleuren = type === 'hart' ? palet(uit([355, 325]), 95, donker) : GOUD;
      const draai = r(-0.25, 0.25);
      const punt = (k) => {
        const hoek = (k / 10) * TAU - Math.PI / 2;
        const straal = k % 2 ? 0.42 : 1;
        return [Math.cos(hoek) * straal, Math.sin(hoek) * straal];
      };
      for (let i = 0; i < aantal; i++) {
        const u = i / aantal;
        let fx;
        let fy;
        if (type === 'hart') {
          const a = u * TAU;
          fx = (16 * Math.sin(a) ** 3) / 17;
          fy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17;
        } else {
          const k = Math.floor(u * 10);
          const f = u * 10 - k;
          const [x0, y0] = punt(k);
          const [x1, y1] = punt(k + 1);
          fx = x0 + (x1 - x0) * f;
          fy = y0 + (y1 - y0) * f;
        }
        ster(x, y, (fx * Math.cos(draai) - fy * Math.sin(draai)) * kracht, (fx * Math.sin(draai) + fy * Math.cos(draai)) * kracht, kleuren, { leven: [1.7, 1.9], sleep: 2.4, g: 38, dik: 3.4, twinkel: true });
      }
      flits = kleuren[2];
    } else if (type === 'jaar') {
      jaartal(x, y);
      return;
    } else if (type === 'chrysant') {
      // chrysant: lange staarten, en op het einde fonkelen de vonken
      bol(n(95), kracht * 1.05, pal, { leven: [1.6, 2.1], sleep: 2.0, g: 72, dik: 2.6, staart: 0.05, twinkel: true });
    } else {
      // pioen: de klassieke bol, vaak met een hart in een tweede kleur
      bol(n(105), kracht, pal, { leven: [1.2, 1.7], sleep: 2.1, g: 75, dik: 3.1 });
      if (Math.random() < 0.6) {
        const [t2, v2] = uit(VUUR);
        bol(n(30), kracht * 0.45, palet(t2, v2, donker), { leven: [1.0, 1.4], sleep: 2.1, g: 75, dik: 2.4 });
      }
    }
    delen.push({ soort: 'g', x, y, leven: donker ? 0.9 : 1.9, max: donker ? 0.9 : 1.9, kleur: flits, straal: kracht * 0.5 });
  };
  // Een fontein: een straal vonken die van onderaan omhoog spuit en zachtjes heen en weer wiegt.
  const fontein = (fx, duur) => delen.push({ soort: 'f', x: b * fx, leven: duur, max: duur, vonk: 0, fase: r(TAU), pal: Math.random() < 0.35 ? ZILVER : GOUD });
  // Het nieuwe jaar, geschreven in vonken: de cijfers worden onzichtbaar getekend, en elke vonk vliegt van de knal naar haar plek in een
  // cijfer. Daar blijft ze even hangen, fonkelt en dooft.
  const jaartal = (ox, oy) => {
    const tekst = String(jaar);
    const W = 240;
    const H = 86;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 80px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const maat = Math.floor(80 * Math.min(1, (W - 10) / g.measureText(tekst).width));
    g.font = `900 ${maat}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const tb = g.measureText(tekst).width;
    g.fillText(tekst, W / 2, H / 2 + 2);
    const pixels = g.getImageData(0, 0, W, H).data;
    const meeste = Math.max(120, Math.round(250 * kwaliteit));
    let punten = [];
    for (const stap_ of [3, 4, 5, 6, 8]) {
      punten = [];
      for (let py = 1; py < H; py += stap_) for (let px = 1; px < W; px += stap_) if (pixels[(py * W + px) * 4 + 3] > 128) punten.push([px, py]);
      if (punten.length <= meeste) break;
    }
    const breed = Math.min(b * 0.9, 400);
    const schaal = breed / W;
    const KLEUREN = [palet(45, 100, donker), palet(325, 95, donker), palet(188, 95, donker), palet(135, 90, donker)];
    const REM = 3;
    for (const [px, py] of punten) {
      const cijfer = Math.max(0, Math.min(tekst.length - 1, Math.floor(((px - (W - tb) / 2) / tb) * tekst.length)));
      const doelX = b / 2 + (px - W / 2) * schaal;
      const doelY = oy + (py - H / 2) * schaal;
      ster(ox, oy, REM * (doelX - ox), REM * (doelY - oy), KLEUREN[cijfer % KLEUREN.length], { leven: [3.0, 3.6], sleep: REM, g: 6, dik: 3.3, twinkel: true });
    }
    delen.push({ soort: 'g', x: b / 2, y: oy, leven: donker ? 1.1 : 3.8, max: donker ? 1.1 : 3.8, kleur: GOUD[2], straal: breed * 0.34 });
  };
  const ZWAARTE = 620;
  const pijl = (fx, fy, kracht, type) => {
    const stijging = hgt + 10 - hgt * fy;
    delen.push({ soort: 'p', x: b * fx, y: hgt + 10, px: b * fx, py: hgt + 10, vx: r(-26, 26), vy: -Math.sqrt(2 * ZWAARTE * stijging), kracht, type, vonk: 0, fase: r(TAU) });
  };

  if (bloei) {
    // In volle bloei: gouden stralen achter de kaart en een regen van bloemblaadjes, met een wolk blaadjes van achter de kaart bij de start.
    // Geen sterren en geen fonkelingen: het goud zit in de stralen en in de medaille zelf.
    for (let s = 0.4; s < 9.5; s += 0.1) op(s, () => { for (let i = 0; i < Math.round(3 * kwaliteit); i++) blaadje(r(-20, b + 20), -20, r(-50, 50), r(30, 110)); });
    op(1.2, () => { for (let i = 0; i < Math.round(70 * kwaliteit); i++) { const hoek = r(TAU); const snel = r(120, 560); blaadje(b / 2, hgt * 0.46, Math.cos(hoek) * snel, Math.sin(hoek) * snel - 160); } });
  } else if (vuur) {
    // Geen metronoom: de pijlen vertrekken onregelmatig, vaak twee of drie kort na elkaar. Onderaan spuiten fonteinen. Dan de finale, en
    // als slot het nieuwe jaar in vonken, met een gouden regen erachteraan.
    const SOORTEN = ['pioen', 'chrysant', 'kruis', 'wilg', 'hart', 'pioen', 'ring', 'palm', 'knetter', 'chrysant', 'ster', 'pioen', 'kruis', 'wilg', 'ring', 'palm'];
    let nr = 0;
    let kant = 0;
    const schiet = (wanneer, groot) => {
      const type = SOORTEN[nr++ % SOORTEN.length];
      const fx = (kant++ % 2 ? r(0.52, 0.88) : r(0.12, 0.48));
      op(wanneer, () => pijl(fx, r(0.1, 0.4), groot ? r(360, 470) : r(250, 380), type));
    };
    for (let s = 0.15; s < 8.7; s += r(0.36, 0.7)) {
      schiet(s, false);
      if (Math.random() < 0.4) schiet(s + r(0.1, 0.22), false);
      if (Math.random() < 0.12) schiet(s + r(0.25, 0.4), false);
    }
    op(0.3, () => (fontein(0.1, 8.8), fontein(0.9, 8.8)));
    op(4.0, () => fontein(0.5, 4.8));
    for (let i = 0; i < 14; i++) schiet(9.0 + i * 0.11 + r(0, 0.05), true); // de finale
    if (jaar) {
      const hoogte = Math.max(boven_() + 70, hgt * 0.17) / hgt;
      op(10.7, () => {
        delen.push({ soort: 'p', x: b / 2, y: hgt + 10, px: b / 2, py: hgt + 10, vx: 0, vy: -Math.sqrt(2 * ZWAARTE * (hgt + 10 - hgt * hoogte)), kracht: 0, type: 'jaar', vonk: 0, fase: 0, recht: true });
        fontein(0.12, 3.4);
        fontein(0.5, 3.4);
        fontein(0.88, 3.4);
      });
      // de gouden regen: fonkelende vonken die van bovenaf naar beneden dwarrelen
      for (let s = 13.0; s < 15.2; s += 0.06) op(s, () => { for (let i = 0; i < Math.round(3 * kwaliteit); i++) ster(r(0, b), -8, r(-25, 25), r(60, 170), GOUD, { leven: [1.5, 2.3], sleep: 0.9, g: 150, dik: 2, twinkel: true }); });
    }
  } else {
    // Vier kanonnen in de hoeken en onderaan, een knal van achter de kaart, zestien ballonnen (waarvan er vijf openspatten in snippers van
    // hun kleur), gouden fonkelingen en een regen van snippers.
    op(0.15, () => (salvo(true), salvo(false)));
    op(0.45, () => plof(b / 2, hgt * 0.46, 80, 950));
    op(1.4, () => (middenSalvo(0.3, 70), middenSalvo(0.7, 70)));
    op(2.8, () => (salvo(true), salvo(false)));
    op(4.3, () => middenSalvo(0.5, 150));
    op(5.8, () => (salvo(true), salvo(false)));
    op(7.2, () => (middenSalvo(0.25, 80), middenSalvo(0.75, 80)));
    for (let i = 0; i < 16; i++) op(0.5 + i * 0.42 + r(0, 0.2), () => ballon(i, i % 3 === 1));
    // de regen: elke 0,1 s een handvol snippers van bovenaf
    for (let s = 0.9; s < 9; s += 0.1) op(s, () => { for (let i = 0; i < Math.round(4 * kwaliteit); i++) snipper(r(-20, b + 20), -20, r(-40, 40), r(40, 160)); });
    for (let s = 0.6; s < 9.5; s += 0.11) op(s, fonkel);
  }
  plan.sort((x, y) => x[0] - y[0]);
  const einde = vuur ? 15.4 : bloei ? 12 : 11; // daarna geen nieuwe deeltjes meer; de laatste vallen of doven nog

  // De slinger (verjaardag): elf vlaggetjes aan een doorhangend koord. Ze valt binnen en veert even na, en de vlaggetjes wapperen in een
  // briesje dat van links naar rechts trekt. Ze hangt een eind onder de bovenrand, onder de klok en de inkeping van een iPhone
  // (--safe-top), zodat ze helemaal te zien is.
  const boven = boven_() + 34;
  const slinger = () => {
    const val = Math.exp(-5.5 * t) * Math.cos(9 * t) * (boven + 90); // vallen en naveren
    const weg = t > einde - 1 ? Math.max(0, einde - t) : 1;
    if (weg <= 0) return;
    ctx.globalAlpha = weg;
    const zak = 30 + Math.sin(t * 1.3) * 2.5;
    const koord = (u) => boven + zak * 4 * u * (1 - u) - val - 4;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 22; i++) ctx[i ? 'lineTo' : 'moveTo']((b * i) / 22 + (i === 0 ? -6 : i === 22 ? 6 : 0), koord(i / 22));
    ctx.stroke();
    const stap_ = b / 11;
    for (let i = 0; i < 11; i++) {
      const xl = stap_ * i + stap_ * 0.06;
      const xr = stap_ * (i + 1) - stap_ * 0.06;
      const yl = koord(xl / b);
      const yr = koord(xr / b);
      const wind = Math.sin(t * 2.4 - i * 0.8) * 5 + Math.sin(t * 5.3 + i * 1.7) * 1.6;
      const mx = (xl + xr) / 2;
      const my = (yl + yr) / 2;
      const px = mx + wind;
      const py = my + 36 - Math.abs(wind) * 0.35;
      const tint = PAPIER[i % PAPIER.length];
      ctx.fillStyle = tint.basis;
      ctx.beginPath();
      ctx.moveTo(xl, yl);
      ctx.lineTo(xr, yr);
      ctx.lineTo(px, py);
      ctx.closePath();
      ctx.fill();
      // de plooi: de helft die van het licht wegdraait is donkerder
      ctx.fillStyle = wind > 0 ? tint.donker : tint.licht;
      ctx.globalAlpha = weg * (0.28 + Math.min(0.3, Math.abs(wind) * 0.05));
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(xr, yr);
      ctx.lineTo(px, py);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = weg;
    }
    ctx.globalAlpha = 1;
  };

  const stap = (nu) => {
    if (gestopt) return;
    const dt = Math.min(0.034, Math.max(0.001, (nu - vorige) / 1000)); // nooit grote sprongen, ook niet na een hapering
    gemiddeld = gemiddeld * 0.9 + (nu - vorige) * 0.1;
    vorige = nu;
    t += dt;
    // Loopt het stroef (meer dan 22 ms per beeld), dan minder nieuwe deeltjes; loopt het weer vlot, dan langzaam terug omhoog.
    // Hoe stroever, hoe sneller ze zakt: een toestel dat het echt moeilijk heeft, krijgt binnen een halve seconde een lichter feest.
    if (gemiddeld > 30) kwaliteit = Math.max(0.2, kwaliteit - 0.1);
    else if (gemiddeld > 22) kwaliteit = Math.max(0.2, kwaliteit - 0.05);
    else if (gemiddeld < 18) kwaliteit = Math.min(1, kwaliteit + 0.01);
    while (plan.length && plan[0][0] <= t) plan.shift()[1]();
    if (vuur) {
      // vervagen in plaats van wissen: wat er stond dooft uit, en zo krijgt elke vonk haar staart
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-dt * 9.5)).toFixed(3)})`;
      ctx.fillRect(0, 0, b, hgt);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      if (octx) octx.clearRect(0, 0, b, hgt);
    } else {
      ctx.clearRect(0, 0, b, hgt);
      if (bloei) {
        const zicht = t > einde - 1.2 ? Math.max(0, (einde - t) / 1.2) : 1; // op het einde doven de stralen zacht uit
        stralen(zicht);
      } else slinger();
    }
    for (let i = delen.length - 1; i >= 0; i--) {
      const d = delen[i];
      let weg = false;
      if (d.soort === 's') {
        d.oud += dt;
        d.klap += d.klapSnel * dt;
        d.rot += d.spin * dt;
        const c = Math.cos(d.klap);
        const plat = Math.abs(c);
        const rem = (0.9 + 2.2 * plat) * Math.min(1, 0.3 + d.oud); // samengepakt bij het wegschieten, daarna vangt elk stukje lucht
        d.vy += (400 * d.z - rem * d.vy) * dt;
        d.vx += (Math.sin(2 * d.klap) * 190 * d.z * Math.min(1, d.oud * 0.8) - rem * d.vx) * dt; // bij elke tuimeling glijdt het opzij
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        weg = d.y > hgt + 40 || (d.oud > 1 && (d.x < -80 || d.x > b + 80));
        const cr = Math.cos(d.rot) * dpr;
        const sr = Math.sin(d.rot) * dpr;
        ctx.setTransform(cr, sr, -sr * c, cr * c, d.x * dpr, d.y * dpr);
        ctx.fillStyle = d.folie && plat > 0.94 ? '#fff' : c < 0 ? d.tint.donker : plat > 0.8 ? d.tint.licht : d.tint.basis;
        if (d.rond) {
          ctx.beginPath();
          ctx.arc(0, 0, d.w * 0.55, 0, TAU);
          ctx.fill();
        } else ctx.fillRect(-d.w / 2, -d.l / 2, d.w, d.l);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (d.soort === 'b') {
        // opstijgen tot een vaste snelheid, en meedrijven op de lucht
        d.vy += (-d.top - d.vy) * 1.4 * dt;
        d.vx += ((Math.sin(t * 0.9 + d.fase) * 26 + Math.sin(t * 2.3 + d.fase2) * 11) - d.vx) * 2 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        weg = d.y < -d.straal * 5;
        if (d.plof && d.y < d.plof) {
          // pang: de ballon spat open in snippers van haar kleur
          plof(d.x, d.y, 30, 620, d.tint);
          delen.splice(i, 1);
          continue;
        }
        const kanteling = Math.max(-0.28, Math.min(0.28, d.vx * 0.011)); // ze leunt in de richting waarin ze drijft
        const s = d.straal;
        // de knoop, onderaan de gekantelde ballon
        const kx = d.x - Math.sin(kanteling) * s * 1.42;
        const ky = d.y + Math.cos(kanteling) * s * 1.42;
        d.sx += (kx - d.sx) * Math.min(1, 3.2 * dt); // het touwtje volgt met vertraging
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        ctx.bezierCurveTo(kx + Math.sin(t * 2.6 + d.fase) * 5, ky + d.lengte * 0.35, d.sx + Math.sin(t * 2.1 + d.fase2) * 7, ky + d.lengte * 0.7, d.sx, ky + d.lengte);
        ctx.stroke();
        const ck = Math.cos(kanteling) * dpr;
        const sk = Math.sin(kanteling) * dpr;
        ctx.setTransform(ck, sk, -sk, ck, d.x * dpr, d.y * dpr);
        ctx.drawImage(d.beeld.c, -d.beeld.cx, -d.beeld.cy, d.beeld.breed, d.beeld.hoog);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (d.soort === 'p') {
        d.px = d.x;
        d.py = d.y;
        d.vy += ZWAARTE * dt;
        d.x += d.recht ? 0 : (d.vx + Math.sin(t * 9 + d.fase) * 12) * dt;
        d.y += d.vy * dt;
        // de pijl laat een spoor van gloeiende vonkjes achter
        d.vonk += dt * 75 * kwaliteit;
        while (d.vonk >= 1) {
          d.vonk -= 1;
          const leven = r(0.25, 0.55);
          delen.push({ soort: 'r', x: d.x + r(-1.5, 1.5), y: d.y + r(0, 6), vx: r(-16, 16), vy: r(20, 90), leven, max: leven });
        }
        ctx.strokeStyle = '#fff1cf';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(d.px, d.py);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
        if (d.vy > -55) {
          weg = true;
          knal(d.x, d.y, d.kracht, d.type);
        }
      } else if (d.soort === 'r') {
        d.leven -= dt;
        d.vy += 220 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        weg = d.leven <= 0;
        ctx.globalAlpha = Math.max(0, d.leven / d.max) * 0.9;
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
        ctx.globalAlpha = 1;
      } else if (d.soort === 'v') {
        d.leven -= dt;
        d.px = d.x;
        d.py = d.y;
        d.vx -= d.sleep * d.vx * dt;
        d.vy += (d.g - d.sleep * d.vy) * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        weg = d.leven <= 0;
        const deel = Math.max(0, d.leven / d.max);
        if (d.kruis && deel < 0.5) {
          // het kruisvuur: de vonk spat open in vier
          const basis = Math.atan2(d.vy, d.vx) + Math.PI / 4;
          for (let k = 0; k < 4; k++) ster(d.x, d.y, Math.cos(basis + (k * Math.PI) / 2) * 175, Math.sin(basis + (k * Math.PI) / 2) * 175, d.pal, { leven: [0.5, 0.8], sleep: 2.6, g: 60, dik: 2.3 });
          delen.splice(i, 1);
          continue;
        }
        if (d.gensters) {
          d.teller += dt * d.gensters * kwaliteit;
          while (d.teller >= 1) {
            d.teller -= 1;
            const leven = r(0.3, 0.7);
            delen.push({ soort: 'r', x: d.x, y: d.y, vx: r(-22, 22), vy: r(-10, 45), leven, max: leven });
          }
        }
        if (weg && d.knetter) {
          for (let k = 0; k < 2; k++) {
            const leven = r(0.1, 0.35);
            delen.push({ soort: 'k', x: d.x + r(-9, 9), y: d.y + r(-9, 9), leven, max: leven, wacht: r(0, 0.25) });
          }
        }
        if (!(d.twinkel && deel < 0.45 && Math.random() < 0.5)) {
          ctx.globalAlpha = deel < 0.3 ? deel / 0.3 : 1;
          ctx.strokeStyle = d.pal[Math.min(7, Math.floor((1 - deel) * 8))];
          ctx.lineWidth = d.dik * (0.45 + 0.55 * deel);
          ctx.beginPath();
          ctx.moveTo(d.px - d.vx * d.staart, d.py - d.vy * d.staart);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
          if (deel > 0.72) {
            // zolang de vonk heet is, gloeit haar kop wit
            ctx.fillStyle = '#fffdf2';
            ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
          }
          ctx.globalAlpha = 1;
        }
      } else if (d.soort === 'k') {
        // een knettertje: een kort, fel plofje
        if (d.wacht > 0) d.wacht -= dt;
        else {
          d.leven -= dt;
          weg = d.leven <= 0;
          if (Math.random() < 0.7) {
            ctx.fillStyle = '#fff6da';
            ctx.beginPath();
            ctx.arc(d.x, d.y, 1.7, 0, TAU);
            ctx.fill();
          }
        }
      } else if (d.soort === 'q') {
        d.oud += dt;
        d.klap += d.klapSnel * dt;
        d.rot += d.spin * dt;
        const c = Math.cos(d.klap);
        const plat = Math.abs(c);
        const rem = (1.0 + 2.6 * plat) * Math.min(1, 0.35 + d.oud);
        d.vy += (300 * d.z - rem * d.vy) * dt; // een blaadje is lichter dan papier: het valt trager en zwiert breder
        d.vx += (Math.sin(2 * d.klap) * 230 * d.z * Math.min(1, d.oud * 0.8) - rem * d.vx) * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        weg = d.y > hgt + 40 || (d.oud > 1 && (d.x < -80 || d.x > b + 80));
        const cr = Math.cos(d.rot) * dpr;
        const sr = Math.sin(d.rot) * dpr;
        ctx.setTransform(cr, sr, -sr * c, cr * c, d.x * dpr, d.y * dpr);
        ctx.fillStyle = c < 0 ? d.tint.donker : plat > 0.8 ? d.tint.licht : d.tint.basis;
        ctx.beginPath();
        ctx.moveTo(0, -d.w);
        ctx.bezierCurveTo(d.w * 0.85, -d.w * 0.55, d.w * 0.7, d.w * 0.7, 0, d.w);
        ctx.bezierCurveTo(-d.w * 0.7, d.w * 0.7, -d.w * 0.85, -d.w * 0.55, 0, -d.w);
        ctx.fill();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (d.soort === 'f') {
        d.leven -= dt;
        weg = d.leven <= 0;
        const sterkte = Math.max(0, Math.min(1, d.leven / 0.6, (d.max - d.leven) / 0.4)); // ze komt op en dooft uit
        d.vonk += dt * 85 * kwaliteit * sterkte;
        while (d.vonk >= 1) {
          d.vonk -= 1;
          const hoek = -Math.PI / 2 + r(-0.24, 0.24) + Math.sin(t * 1.6 + d.fase) * 0.2;
          const snel = r(0.55, 1) * Math.min(900, hgt * 1.02) * (0.6 + 0.4 * sterkte);
          ster(d.x, hgt + 4, Math.cos(hoek) * snel, Math.sin(hoek) * snel, d.pal, { leven: [0.7, 1.15], sleep: 1.0, g: 680, dik: 2, twinkel: true });
        }
      } else if (d.soort === 'o') {
        // de ring van een plof
        d.leven -= dt;
        weg = d.leven <= 0;
        const deel = 1 - Math.max(0, d.leven) / d.max;
        ctx.globalAlpha = 0.8 * (1 - deel);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3 * (1 - deel) + 0.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.straal * (0.3 + deel * 1.2), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (d.soort === 't') {
        // een fonkeling: een vierpuntig sterretje dat opkomt, draait en weer verdwijnt
        d.leven -= dt;
        weg = d.leven <= 0;
        const deel = 1 - Math.max(0, d.leven) / d.max;
        const maat = Math.sin(Math.PI * deel) * d.groot;
        const hoek = d.draai + deel * 1.2;
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const straal = k % 2 ? maat * 0.24 : maat;
          const a = hoek + (k * Math.PI) / 4;
          ctx[k ? 'lineTo' : 'moveTo'](d.x + Math.cos(a) * straal, d.y + Math.sin(a) * straal);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(d.x, d.y, maat * 0.2, 0, TAU);
        ctx.fill();
      } else if (d.soort === 'g') {
        d.leven -= dt;
        weg = d.leven <= 0;
        const deel = 1 - Math.max(0, d.leven) / d.max;
        const groei = 0.3 + 0.7 * Math.sqrt(deel);
        if (octx) {
          // licht thema: de schemer rond de knal, op het onderste doek. Snel op, traag weer weg.
          const straal = d.straal * 2.7 * groei;
          const schemer = octx.createRadialGradient(d.x, d.y, 0, d.x, d.y, straal);
          schemer.addColorStop(0, 'rgba(38,16,42,1)');
          schemer.addColorStop(0.5, 'rgba(38,16,42,.75)');
          schemer.addColorStop(1, 'rgba(38,16,42,0)');
          octx.globalAlpha = 0.62 * Math.min(1, deel / 0.08) * (1 - deel) ** 1.4;
          octx.fillStyle = schemer;
          octx.beginPath();
          octx.arc(d.x, d.y, straal, 0, TAU);
          octx.fill();
        } else {
          // donker thema: het licht van de knal, een gekleurde gloed die met de bol meegroeit en dooft, zoals rook die oplicht. Het doek
          // wordt niet gewist maar vervaagd, dus de gloed telt beeld na beeld op: per beeld is ze heel zwak.
          const straal = d.straal * groei;
          const gloed = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, straal);
          gloed.addColorStop(0, deel < 0.15 ? '#fff' : d.kleur);
          gloed.addColorStop(0.25, d.kleur);
          gloed.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = Math.max(0, Math.min(0.5, 5.5 * dt * (1 - deel) * (1 - deel)));
          ctx.fillStyle = gloed;
          ctx.beginPath();
          ctx.arc(d.x, d.y, straal, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (weg) delen.splice(i, 1);
    }
    if (t > einde && delen.length === 0 && plan.length === 0) return stop();
    beeld = requestAnimationFrame(stap);
  };
  function stop() {
    if (gestopt) return;
    gestopt = true;
    cancelAnimationFrame(beeld);
    window.removeEventListener('resize', pasAan);
    doek.remove();
    onder?.remove();
  }
  beeld = requestAnimationFrame((nu) => {
    vorige = nu;
    stap(nu);
  });
  return stop;
}

// vier({ soort: 'confetti' | 'vuurwerk', titel, tekst }): de kaart, met de animatie als bewegen mag. Geeft het dialoogvenster terug.
export function vier({ soort = 'confetti', titel, tekst, jaar = null, kop = null }) {
  if (open?.isConnected) return open;
  const beweegt = magBewegen();
  const doek = beweegt ? h('canvas', { class: 'feest__lucht', 'aria-hidden': 'true' }) : null;
  const sluit = () => venster.close();
  const venster = h(
    'dialog',
    { class: ['feest', 'feest--' + soort, beweegt && 'feest--beweegt'], 'aria-labelledby': 'feest-titel' },
    doek,
    h('div', { class: 'feest__kaart kaart' }, kop, h('h2', { class: 't-h1 feest__titel', id: 'feest-titel' }, titel), h('p', { class: 'feest__tekst' }, tekst), knop(t('verjaardag.sluiten'), { soort: 'primair', breed: true, opKlik: sluit })),
  );
  let stop = () => {};
  venster.addEventListener('close', () => {
    stop();
    venster.remove();
    open = null;
  });
  venster.addEventListener('click', (e) => {
    if (e.target === venster) sluit(); // een tik naast de kaart sluit ook
  });
  document.body.append(venster);
  venster.showModal();
  // De animatie stopt vanzelf; de kaart blijft tot ze haar sluit.
  if (doek) stop = speel(doek, soort, jaar);
  open = venster;
  return venster;
}

const metNaam = (sleutel, naam) => (voornaamVan(naam) ? t(sleutel + 'Naam', { naam: voornaamVan(naam) }) : t(sleutel));

export function vierVerjaardag(naam = '', leeftijd = null) {
  return vier({ soort: 'confetti', titel: metNaam('verjaardag.kaartTitel', naam), tekst: leeftijd != null ? t('verjaardag.kaartTekstLeeftijd', { leeftijd }) : t('verjaardag.kaartTekst') });
}
// De ultieme medaille (In volle bloei): alle andere medailles behaald. Ze krijgt haar eigen feest: gouden stralen, een regen van
// bloemblaadjes, en de gouden medaille zelf bovenaan de kaart.
export function vierUltiem(naam = '') {
  const gouden = medaille({ badge: 'verzameling-compleet', behaald: true, grootte: 'extra' });
  const venster = vier({ soort: 'bloei', titel: metNaam('ultiem.kaartTitel', naam), tekst: t('ultiem.kaartTekst'), kop: h('div', { class: 'feest__medaille' }, gouden) });
  setTimeout(() => gouden.glans?.(), 900); // de glans trekt één keer over het goud
  return venster;
}
export function vierNieuwjaar(naam = '', jaar = new Date().getFullYear()) {
  return vier({ soort: 'vuurwerk', titel: metNaam('nieuwjaar.kaartTitel', naam), tekst: t('nieuwjaar.kaartTekst', { jaar }), jaar });
}

// Is er vandaag iets te vieren dat Bloei dit jaar nog niet vierde? Dan nu: eerst haar verjaardag, anders nieuwjaar. De instellingen
// 'profiel.verjaardagGevierd' en 'feest.nieuwjaarGevierd' onthouden het jaar. Geeft true als er een viering openging.
// In de demo zet een nieuwe dag de voorbeeldgegevens terug (demo/bezoek.js), ook die twee instellingen. Daarom onthoudt de app zelf ook
// wat ze sinds het openen al vierde: nooit twee keer hetzelfde feest in één keer openen.
const alGevierd = new Set();
export async function vierAlsHetZoverIs() {
  try {
    if (!isStartKlaar() || open?.isConnected) return false; // nog op het welkomscherm, of er loopt al een viering
    const nu = vandaag();
    const jaar = nu.slice(0, 4);
    const [verjaardag, gevierd, nieuwjaar, naam] = await Promise.all([leesInstelling('profiel.verjaardag'), leesInstelling('profiel.verjaardagGevierd'), leesInstelling('feest.nieuwjaarGevierd'), leesInstelling('profiel.naam')]);
    if (isJarig(verjaardag, nu) && String(gevierd) !== jaar && !alGevierd.has('verjaardag' + jaar)) {
      alGevierd.add('verjaardag' + jaar);
      await zetInstelling('profiel.verjaardagGevierd', jaar);
      // elk jaar dat ze Bloei op haar verjaardag opent telt mee: de medaille Jarig in Bloei behaal je elk jaar opnieuw (data/badges.js)
      const jaren = (await leesInstelling('profiel.verjaardagJaren')) ?? [];
      if (Array.isArray(jaren) && !jaren.includes(jaar)) await zetInstelling('profiel.verjaardagJaren', [...jaren, jaar]);
      vierVerjaardag(naam, leeftijdOp(verjaardag, nu));
      return true;
    }
    if (nu.endsWith('-01-01') && String(nieuwjaar) !== jaar && !alGevierd.has('nieuwjaar' + jaar)) {
      alGevierd.add('nieuwjaar' + jaar);
      await zetInstelling('feest.nieuwjaarGevierd', jaar);
      vierNieuwjaar(naam, Number(jaar));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Wacht tot er geen ander blad meer openstaat (bv. "Nieuw in Bloei"), zodat de twee elkaar niet in de weg zitten.
export async function naAndereBladen() {
  for (let i = 0; i < 120 && document.querySelector('dialog[open]:not(.feest)'); i++) await new Promise((klaar) => setTimeout(klaar, 1000));
  await vraagGeboortedatumEenKeer(); // één keer na de update, voor wie Bloei al gebruikte (ui/verjaardag.js)
  return vierAlsHetZoverIs();
}

let klok = null;
// Op oudejaarsavond: een klok tot precies middernacht, zodat het vuurwerk begint op het moment dat het jaar wisselt.
function zetMiddernachtklok() {
  clearTimeout(klok);
  const nu = new Date();
  if (nu.getMonth() !== 11 || nu.getDate() !== 31) return;
  const middernacht = new Date(nu.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  klok = setTimeout(() => naAndereBladen(), middernacht.getTime() - nu.getTime() + 20);
}

// Eén keer bij de start van de app (main.js): nu nakijken, en opnieuw bij een dagwissel en als ze naar Bloei terugkeert.
let gestart = false;
export function startFeest() {
  if (gestart) return;
  gestart = true;
  naAndereBladen();
  zetMiddernachtklok();
  luister('dag:gewijzigd', () => {
    naAndereBladen();
    zetMiddernachtklok();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    naAndereBladen();
    zetMiddernachtklok();
  });
  // De ultieme medaille is behaald: feest, met de naam uit het profiel.
  luister('badge:behaald', async (d) => {
    if (d?.id !== 'verzameling-compleet' || open?.isConnected) return;
    vierUltiem(await leesInstelling('profiel.naam'));
  });
}
