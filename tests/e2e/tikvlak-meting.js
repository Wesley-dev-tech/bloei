// Meting van het tikvlak van elk tikbaar element (BESLISSING 426: minstens 44 x 44 px, ook op 320 tot 360 px breed).
// Gebruikt door z-tikvlakken-smal.spec.js (en door het meetscript, dat dezelfde functie op meer breedtes draait).
//
// Het TIKVLAK is wat een vinger echt raakt: het element zelf, een vergrotend pseudo-element (::after met negatieve inset), een
// doorzichtige rand, of het omhullende label. Het wordt gemeten met elementFromPoint (stappen van een halve pixel) langs de
// horizontale en de verticale middellijn van het element. Een element dat door iets anders bedekt wordt, krijgt "bedekt".
//
// meetTikvlakken(page) geeft { items, overlappen, overloop, afgekapt, ... }:
//   items      per zichtbaar tikbaar element: naam, klasse, rol, eigen {w,h}, vlak {x,y,w,h}, bedekt, inZin, binnenDialoog
//   overlappen paren tikvlakken die elkaar over meer dan 1,5 x 1,5 px overlappen
//   overloop   tikbare elementen die buiten het scherm vallen
//   afgekapt   tikbare elementen waarvan de tekst wordt afgekapt (scrollWidth > clientWidth bij overflow hidden/clip)
import { naTekenen } from './wacht.js';

export const MIN = 44;
export const ONDERGRENS = 43.5; // dezelfde ondergrens als z-toegankelijkheid.spec.js

// opties.wortel: een css-selector; dan telt alleen wat daarin staat (een melding die snel verdwijnt, de kaart van de rondleiding, het slot).
export async function meetTikvlakken(page, opties = {}) {
  await naTekenen(page);
  return page.evaluate((opt) => {
    const SEL = 'button,a[href],input,select,textarea,summary,label,[role=button],[role=radio],[role=checkbox],[role=switch],[role=tab],[role=link]';
    const ruimte = (s) => s.replace(/\s+/g, ' ').trim();
    const zicht = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden],[inert]');
    };
    const naam = (el) => ruimte(el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || '').slice(0, 40);
    const klasse = (el) => el.tagName.toLowerCase() + (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/).join('.') : '');

    // Een open pop-up legt de rest van de pagina lam: dan telt alleen de bovenste dialoog (en een meldingsstrook).
    const dialogen = [...document.querySelectorAll('dialog[open]')];
    const wortels = opt.wortel ? [...document.querySelectorAll(opt.wortel)] : dialogen.length ? [dialogen[dialogen.length - 1], ...document.querySelectorAll('.strook')] : [document];
    const kandidaten = wortels
      .flatMap((w) => [...w.querySelectorAll(SEL)])
      .filter((el) => {
        if (el.closest('svg') || el.matches('input[type=hidden],main[tabindex="-1"],.sla-over')) return false;
        // een label telt alleen als er een besturing in zit of aan hangt
        if (el.tagName === 'LABEL' && !(el.control || el.querySelector('input,select,textarea,button'))) return false;
        // een onzichtbaar getekende besturing (opacity 0, 1 px, clip) wordt via haar label gemeten
        if (el.matches('input,select,textarea') && el.labels && el.labels.length) {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (r.width < 6 || r.height < 6 || s.opacity === '0' || s.clip !== 'auto') return false;
        }
        return zicht(el);
      });

    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const items = [];
    const afgekapt = [];
    const overloop = [];
    const STAP = 0.5;
    const LIMIET = 120;

    for (const el of kandidaten) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const labels = el.labels ? [...el.labels] : [];
      const eigenaar = (h) => !!h && (el === h || el.contains(h) || labels.some((l) => l.contains(h)) || (el.tagName === 'LABEL' && el.control && (el.control === h || el.control.contains(h))));
      const binnen = (x, y) => x >= 0 && y >= 0 && x < vw && y < vh;
      const raak = (x, y) => binnen(x, y) && eigenaar(document.elementFromPoint(x, y));
      // beginpunt: het midden; is dat bedekt (of een gat in het element), dan een punt vlak bij de linkerbovenhoek
      let cx = r.left + r.width / 2;
      let cy = r.top + r.height / 2;
      let bedekt = false;
      if (!raak(cx, cy)) {
        cx = r.left + Math.min(6, r.width / 2);
        cy = r.top + Math.min(6, r.height / 2);
        if (!raak(cx, cy)) bedekt = true;
      }
      let vlak = { x: r.left, y: r.top, w: 0, h: 0 };
      let uit = { l: 0, t: 0, r: 0, b: 0 };
      if (!bedekt) {
        let x1 = cx, x2 = cx, y1 = cy, y2 = cy;
        while (raak(x1 - STAP, cy) && cx - x1 < LIMIET) x1 -= STAP;
        while (raak(x2 + STAP, cy) && x2 - cx < LIMIET) x2 += STAP;
        while (raak(cx, y1 - STAP) && cy - y1 < LIMIET) y1 -= STAP;
        while (raak(cx, y2 + STAP) && y2 - cy < LIMIET) y2 += STAP;
        let w = x2 - x1 + STAP;
        let h = y2 - y1 + STAP;
        // een tikvlak dat (binnen afronding) gelijk is aan het element: de eigen maat, zonder meetruis
        if (Math.abs(w - r.width) <= 1) w = r.width;
        if (Math.abs(h - r.height) <= 1) h = r.height;
        vlak = { x: x1, y: y1, w, h };
        uit = { l: r.left - x1, t: r.top - y1, r: x2 + STAP - r.right, b: y2 + STAP - r.bottom };
      }
      // Link midden in een zin: de tekst om het element heen is geen ander tikbaar element.
      let inZin = false;
      if (el.matches('a[href]') && el.parentElement) {
        const ouder = el.parentElement;
        const eigen = ruimte(el.textContent);
        const hele = ruimte(ouder.textContent);
        inZin = hele.length > eigen.length + 3 && ![...ouder.children].some((k) => k !== el && k.matches('button,a[href],input,select,textarea'));
      }
      const rij = {
        naam: naam(el),
        klasse: klasse(el).slice(0, 90),
        rol: el.getAttribute('role') || el.tagName.toLowerCase(),
        eigen: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
        vlak: { x: Math.round(vlak.x), y: Math.round(vlak.y), w: Math.round(vlak.w * 10) / 10, h: Math.round(vlak.h * 10) / 10 },
        bedekt,
        inZin,
        binnenDialoog: !!el.closest('dialog'),
        uit,
      };
      items.push(rij);
      el.__tv = rij;
      if (r.left < -0.5 || r.right > vw + 0.5) overloop.push({ naam: rij.naam, klasse: rij.klasse, links: Math.round(r.left), rechts: Math.round(r.right), vw });
      const s = getComputedStyle(el);
      if (/(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !el.matches('input,select,textarea')) {
        afgekapt.push({ naam: rij.naam, klasse: rij.klasse, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }

    // Overlap tussen tikvlakken (niet tussen een element en zijn eigen voorouder of label). Elk tikvlak is het element plus de uitbreiding
    // eromheen; na het terugscrollen krijgt elk element zijn rechthoek terug, zodat ze vergelijkbaar zijn.
    window.scrollTo(0, 0);
    for (const e of document.querySelectorAll('*')) if (e.scrollTop || e.scrollLeft) { e.scrollTop = 0; e.scrollLeft = 0; }
    const dozen = kandidaten.map((el) => {
      const r = el.getBoundingClientRect();
      const v = el.__tv;
      const vast = (() => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; })();
      const scroller = (() => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if (/(auto|scroll)/.test(o) && e.scrollHeight > e.clientHeight) return e; } return null; })();
      return { el, v, vast, scroller, x1: r.left - Math.max(0, v.uit.l), y1: r.top - Math.max(0, v.uit.t), x2: r.right + Math.max(0, v.uit.r), y2: r.bottom + Math.max(0, v.uit.b) };
    });
    const overlappen = [];
    for (let i = 0; i < dozen.length; i++) {
      for (let j = i + 1; j < dozen.length; j++) {
        const A = dozen[i];
        const B = dozen[j];
        const a = A.el;
        const b = B.el;
        if (A.v.bedekt || B.v.bedekt) continue;
        // een vaste balk (kop, tabbalk) en scrollende inhoud overlappen niet: de inhoud schuift eronderdoor
        if (A.vast !== B.vast) continue;
        // twee scrollende gebieden (een pop-up met een vaste voet en schuivende inhoud) zijn niet op één scrollstand te vergelijken
        if (A.scroller !== B.scroller) continue;
        if (a.contains(b) || b.contains(a)) continue;
        if ((a.labels && [...a.labels].includes(b)) || (b.labels && [...b.labels].includes(a))) continue;
        if (a.tagName === 'LABEL' && a.control === b) continue;
        if (b.tagName === 'LABEL' && b.control === a) continue;
        const ow = Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1);
        const oh = Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1);
        if (ow > 1.5 && oh > 1.5) overlappen.push({ a: A.v.naam + ' [' + A.v.klasse + ']', b: B.v.naam + ' [' + B.v.klasse + ']', w: Math.round(ow), h: Math.round(oh) });
      }
    }
    const sch = document.querySelector('#scherm');
    return {
      items: items.map(({ uit, ...rest }) => rest),
      overlappen,
      overloop,
      afgekapt,
      vw,
      paginaOverloop: document.documentElement.scrollWidth - vw,
      schermOverloop: sch ? sch.scrollWidth - sch.clientWidth : 0,
    };
  }, opties);
}

// Classificeert een meting: wat blijft onder de ondergrens, is dat een terechte uitzondering, en welke regel geldt dan.
// Regels (dezelfde als z-toegankelijkheid.spec.js, dat alleen button, a[href], input, select en textarea meet):
//   inline-link   een a[href] midden in een zin (WCAG 2.5.8): de omringende tekst is het enige wat eromheen staat
//   (meer regels staan met reden in EXTRA_UITZONDERINGEN in de spec)
export function sorteer(meting, uitzonderingen = []) {
  const klein = [];
  const uitgezonderd = [];
  for (const it of meting.items) {
    const tekort = it.bedekt || it.vlak.w < ONDERGRENS || it.vlak.h < ONDERGRENS;
    if (!tekort) continue;
    const regel = it.inZin ? 'inline-link' : uitzonderingen.find((u) => u.past(it))?.regel;
    (regel ? uitgezonderd : klein).push({ ...it, regel });
  }
  return { klein, uitgezonderd };
}
