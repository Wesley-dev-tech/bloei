// Tabkleur (BESLISSINGEN 357, 358 en 359; src/stijl/tabkleur.css): binnen een tabblad draagt alles wat een themakleur heeft de familie van dat tabblad.
//  1. Op elk scherm (behalve Vandaag) komt geen kleur van een ándere familie voor: van elk zichtbaar onderdeel van het scherm en van een open blad
//     of dialoog worden kleur, achtergrond, rand, vulling, lijn en schaduw (ook ::before en ::after) vergeleken met de berekende waarden van de
//     familietokens. Toegelaten uitzonderingen staan in UITZONDERING, met hun reden.
//  2. Icoontegels, vinkvak en schakelaar in de aan-stand, gevulde chips en links horen tot de familie van het scherm, met hun contrast:
//     icoon in de tegel >= 3 : 1, licht teken op een gevuld vlak >= 3 : 1, link >= 4,5 : 1 op zijn achtergrond.
//  3. De kop (BESLISSINGEN 359 en 366): het vraagteken (volle schijf, >= 3 : 1 op de achtergrond), het huisje en de deelknop in de icoontint van de
//     familie, een knop met woord in de tekstvariant (>= 4,5 : 1); op Algemeen en de instellingen ook de terugknop in het roze van een tegelicoon.
//  4. De medailles op Algemeen en Badges (BESLISSING 367) in de familie: behaald de volle schijf met lint, nog te behalen zacht en zonder lint.
//  5. Vandaag (BESLISSINGEN 358 en 370): elke kaart in de familie van haar tabblad (Eten, Stemming en energie, Kalender: Dagboek; Supplementen;
//     Drinken; de bovenste kaart: Vandaag, met haar vier tegels elk in hun onderwerp), en nergens nog het roze accent behalve in de blaadjes
//     van de energie; het bolletje "alles genomen", het spuitje en de stip van vandaag blijven.
//  6. Bediening (BESLISSING 371): niet-gekozen chips, keuzerijen, stappers, invoervakken en kalendercellen en de hoofdknop (volle familiekleur).
//     Een secundaire knop (BESLISSING 537): zacht vlak gelijk aan --knop-zacht-bg van de familie van het scherm (de berekende waarde van het token,
//     gelezen via een proefelement), rand transparant, tekst --c-text die minstens 4,5 : 1 haalt op dat vlak.
import { test, expect } from '@playwright/test';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';

const FAMILIE_VAN = (route) =>
  route.startsWith('dagboek') ? 'dagboek' : route === 'drinken' ? 'drank' : route === 'supplementen' ? 'gezond' : route === 'gewicht' ? 'gewicht' : route === 'delen' ? 'delen' : 'algemeen'; // Algemeen en de instellingen: het accent van het thema (BESLISSING 365)

// [route, naam, extra]
const SCHERMEN = [
  ['dagboek/dag', 'Dagboek dag'],
  ['dagboek/week', 'Dagboek week'],
  ['dagboek/maand', 'Dagboek maand met paneel', 'paneel'],
  ['drinken', 'Drinken'],
  ['supplementen', 'Supplementen'],
  ['supplementen', 'Supplementen met de supplementkaart', 'kaart'],
  ['gewicht', 'Gewicht'],
  ['meer', 'Algemeen'],
  ['meer/instellingen', 'Instellingen Drinken'],
  ['meer/gewicht', 'Instellingen Gewicht'],
  ['meer/vergrendeling', 'Vergrendeling'],
  ['meer/profiel', 'Naam en foto'],
  ['meer/favorieten', 'Favorieten'],
  ['meer/badges', 'Badges'],
  ['meer/meldingen', 'Herinneringen'],
  ['meer/uitleg', 'Rondleiding'],
  ['delen', 'Delen'],
];

// Toegelaten kleuren van een andere familie, met de reden.
const UITZONDERING = [
  ['.medaille__boog', 'de voortgangsring van een nog te behalen medaille blijft zoals hij was (BESLISSING 367): het paars van --c-day'],
  ['.energie, .energie *, .kalender__blad, .kalender__blad *', 'de blaadjes van de energie: hun eigen reeks'],
  ['.gevoel, .gevoel *, .gevoelicoon, .gevoelicoon *', 'de gezichtjes van de stemming: hun eigen reeks'],
  ['.verslagvel, .verslagvel *', 'het lichte vel van het verslag: altijd Poeder (eigen kleuren)'],
  ['.themavoorbeeld, .themavoorbeeld *', 'de themavoorbeelden tonen de kleuren van hun eigen thema'],
  ['.mk__dag.is-vandaag .mk__nr', 'de paarse stip van vandaag (BESLISSINGEN 291 en 292)'],
  ['.logo, .logo *, .beeldmerk, .beeldmerk *, [class*="logo__merk"], [class*="logo__merk"] *, .leeg__merk, .leeg__merk *', 'het logo wordt nooit herkleurd (HUISSTIJL §2); zijn blaadjes hebben toevallig dezelfde waarde als een familiekleur'],
];

const FAMILIES = ['dagboek', 'drank', 'gezond', 'gewicht', 'algemeen', 'delen', 'dag'];

// Vandaag: [kaart, familie, extra uitzonderingen binnen die kaart met hun reden]
const VANDAAG = [
  ['.vandaag .etenkaart', 'dagboek', []],
  ['.vandaag .stemmingkaart', 'dagboek', []],
  // het bolletje "alles genomen" en het spuitje met hun legende houden de kleur van Supplementen; de stip en de ring van vandaag blijven pruim
  ['.vandaag .kalkaart', 'dagboek', ['.kalender__klaar', '.kalender__spuit', '.kalender__spuit *', '.kalender__dag.is-vandaag .kalender__nr', '.kalender__dag.is-gekozen .kalender__nr']],
  ['.vandaag .suppkaart', 'gezond', []],
  ['.vandaag .drinkkaart', 'drank', []],
  // de vier tegels tonen elk hun onderwerp (apart gecontroleerd); de medailles blijven groen (BESLISSING 367)
  ['.vandaag .voortgang', 'dag', ['.motiv__tegel', '.motiv__tegel *', '.medaille', '.medaille *']],
];
const ROLLEN = ['basis', 'zacht', 'icoon', 'tekst', 'gevuld', 'vol', 'vulling', 'op-vulling', 'gehaald'];
// De oorspronkelijke familie- en accenttokens (zoals op :root berekend). --c-day blijft buiten de lijst: het is de stip van vandaag.
const FAMILIETOKENS = [
  '--c-accent', '--c-accent-soft', '--c-accent-text', '--c-accent-text-op-soft', '--tile-meal-bg', '--tile-meal-fg',
  '--c-water', '--c-water-soft', '--c-water-text', '--tile-drink-bg', '--tile-drink-fg', '--drank-gehaald', '--drank-onderweg', '--drank-vlak',
  '--c-health', '--c-health-soft', '--c-health-gevuld', '--c-health-text', '--tile-health-bg', '--tile-health-fg',
  '--c-weight', '--c-weight-soft', '--c-weight-text', '--tile-weight-bg', '--tile-weight-fg',
  '--c-book', '--c-book-soft', '--tile-book-bg', '--tile-book-fg', '--tile-day-bg', '--tile-day-fg',
  '--c-share', '--c-share-soft',
];

async function zetThema(page, thema) {
  await vasteKlok(page, { uur: '10:30', stil: true });
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await page.evaluate(
    (t) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: t });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Testnaam' });
          tx.oncomplete = () => { db.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    thema,
  );
  await vulGegevens(page, 'vol');
}

async function open(page, route, extra) {
  await page.goto('./#/' + route);
  await page.reload();
  await schermKlaar(page, route);
  if (extra === 'paneel') {
    const dag = page.locator('.mk__dag.is-vandaag').first();
    if (await dag.isVisible()) await dag.click();
    await animatiesKlaar(page);
  }
  if (extra === 'kaart') {
    await page.locator('.overzicht__rij .schema__knop, .supplementrij').first().click();
    await page.locator('dialog.supplementkaart').waitFor();
    await animatiesKlaar(page);
  }
}

// Draait in de pagina: de kleurensets en de metingen.
function meet({ familie, families, rollen, familietokens, uitzondering, wortel = null, extra = [] }) {
  // Een kleur uit color-mix() komt terug als color(srgb r g b): alles naar rgb()/rgba() met gehele kanalen, zodat waarden vergelijkbaar zijn.
  const KLEUR = /rgba?\([^)]*\)|color\(srgb[^)]*\)/g;
  const norm = (s) => {
    const m = String(s).match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    const srgb = String(s).startsWith('color(');
    const [r, g, b] = m.slice(0, 3).map((v) => Math.round(srgb ? v * 255 : v));
    const a = m.length > 3 ? m[3] : 1;
    return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
  };
  const sonde = document.createElement('i');
  document.body.append(sonde);
  const los = (waarde) => { sonde.style.color = ''; sonde.style.color = waarde; return norm(getComputedStyle(sonde).color); };
  const eigen = new Set(rollen.map((r) => los(`var(--f-${familie}-${r})`)));
  eigen.add(los(`color-mix(in srgb, var(--f-${familie}-zacht) 50%, var(--c-surface))`));
  eigen.add(los(`var(--f-${familie}-onderweg, var(--f-${familie}-basis))`));
  const bediening = los(`color-mix(in srgb, var(--f-${familie}-zacht) 55%, var(--c-surface))`); // BESLISSING 371: het vlak van een bedieningsonderdeel
  eigen.add(bediening);
  const neutraal = new Set(['--c-text', '--c-text-muted', '--c-surface', '--c-surface-soft', '--c-bg', '--c-line', '--c-on-primary', '--c-primary'].map((n) => los(`var(${n})`)));
  const vreemd = new Map();
  for (const n of familietokens) {
    const k = los(`var(${n})`);
    if (!eigen.has(k) && !neutraal.has(k)) vreemd.set(k, n);
  }
  for (const f of families) for (const r of rollen) {
    const k = los(`var(--f-${f}-${r})`);
    if (!eigen.has(k) && !neutraal.has(k) && !vreemd.has(k)) vreemd.set(k, `--f-${f}-${r}`);
  }
  const tekstkleur = los('var(--c-text)');
  const gedemptekleur = los('var(--c-text-muted)');
  const pagina = los('var(--c-bg)');
  const icoonkleur = los(`var(--f-${familie}-icoon)`);
  const vol = los(`var(--f-${familie}-vol)`);
  sonde.remove();
  // BESLISSINGEN 537, 544 en 546: het zachte vlak en de tekst erop, gelezen via een proefelement binnen het blad of scherm van de knop (met de waarde van de familie daar)
  const zachtVan = (el) => {
    const wortelEl = el.closest('dialog, #scherm') || document.body;
    const proef = document.createElement('i');
    wortelEl.append(proef);
    proef.style.backgroundColor = 'var(--knop-zacht-bg)';
    proef.style.color = 'var(--knop-zacht-fg)';
    const uit = { bg: norm(getComputedStyle(proef).backgroundColor), fg: norm(getComputedStyle(proef).color) };
    proef.remove();
    return uit;
  };
  // Een hoofdknop staat in een groep als er in haar knoppenrij nog een andere knop zichtbaar is (BESLISSING 544): dan is ze het zachte vlak, anders de volle familiekleur
  const HOUDERS = '.maaltijd__acties, .supplementkaart__knoppen, .dialoog__acties, .delen__knoppen, .herstel__keuze, .herstel__knoppen, .slot__acties--kwijt, .welkom__knoppen';
  const inGroep = (k) => {
    const h = k.closest(HOUDERS);
    return !!h && [...h.querySelectorAll('.knop')].filter((x) => x !== k && x.getBoundingClientRect().width > 0 && !x.classList.contains('knop--tekst')).length > 0;
  };

  const rgb = (s) => (s.match(KLEUR) || []).map(norm);
  const kanaal = (s) => { const m = norm(s).match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (a, b) => { const x = lum(kanaal(a)), y = lum(kanaal(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const zichtbaar = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const gedimd = (e) => { for (let p = e; p && p !== document.documentElement; p = p.parentElement) if (Number(getComputedStyle(p).opacity) < 1) return true; return false; };
  const achtergrond = (e) => {
    for (let p = e; p; p = p.parentElement) {
      const b = getComputedStyle(p).backgroundColor;
      if (b && kanaal(b).a > 0.5) return b;
    }
    return pagina;
  };
  const naam = (e) => `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).trim().split(/\s+/).slice(0, 2).join('.')}`;
  const uitz = [...uitzondering.map(([s]) => s), ...extra].join(', ');

  const wortels = wortel ? [...document.querySelectorAll(wortel)] : [document.querySelector('#scherm'), ...document.querySelectorAll('body > dialog[open], body > .blad dialog[open]')].filter(Boolean);
  const fouten = [];
  for (const w of wortels) {
    for (const e of [w, ...w.querySelectorAll('*')]) {
      if (!zichtbaar(e) || e.closest(uitz)) continue;
      for (const pseudo of [null, '::before', '::after']) {
        const s = getComputedStyle(e, pseudo);
        if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
        const eig = ['color', 'background-color', 'fill', 'stroke', 'box-shadow'];
        if (s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) > 0) eig.push('border-top-color');
        if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) eig.push('outline-color');
        for (const p of eig) {
          const v = s.getPropertyValue(p);
          if (p === 'color' && !pseudo && !e.childElementCount && !e.textContent.trim() && !e.matches('svg, svg *, .icoon, .tegel')) continue;
          for (const k of rgb(v)) if (vreemd.has(k)) fouten.push(`${naam(e)}${pseudo || ''} ${p} = ${vreemd.get(k)}`);
        }
      }
    }
  }

  // Positief: tegels, vinkvak en schakelaar aan, gevulde chips, links en de kop
  const familieKleur = (k) => eigen.has(norm(k));
  const contrast = [];
  for (const w of wortels) {
    for (const t of w.querySelectorAll('.tegel')) {
      if (!zichtbaar(t) || t.closest(uitz) || t.classList.contains('tegel--rond') || gedimd(t)) continue;
      const s = getComputedStyle(t);
      if (t.matches('[style*="--t-bg"]')) continue; // een tegel met een eigen inline kleur (de stemming op Vandaag)
      // een tegel zonder vlak (de koptegel van de kaart Kalender op Vandaag is een kaal icoon): alleen het icoon telt
      const vlakOk = kanaal(s.backgroundColor).a < 0.5 || familieKleur(s.backgroundColor);
      if (!familieKleur(s.color) || !vlakOk) fouten.push(`tegel buiten de familie: ${naam(t.parentElement)} ${s.color} op ${s.backgroundColor}`);
      else {
        const onder = kanaal(s.backgroundColor).a < 0.5 ? achtergrond(t) : s.backgroundColor;
        if (cr(s.color, onder) < 3) contrast.push(`icoon in tegel ${cr(s.color, onder).toFixed(2)}: ${naam(t.parentElement)}`);
      }
    }
    for (const v of w.querySelectorAll('.vinkvak[aria-checked="true"] .vinkvak__vak, .schakelaar[aria-checked="true"] .schakelaar__baan')) {
      if (!zichtbaar(v) || gedimd(v)) continue;
      const bg = getComputedStyle(v).backgroundColor;
      const teken = v.matches('.schakelaar__baan') ? getComputedStyle(v.parentElement.querySelector('.schakelaar__knop')).backgroundColor : getComputedStyle(v).color;
      if (!familieKleur(bg)) fouten.push(`aan-stand buiten de familie: ${naam(v)} ${bg}`);
      if (cr(bg, teken) < 3) contrast.push(`teken op aan-stand ${cr(bg, teken).toFixed(2)}: ${naam(v)}`);
    }
    for (const a of w.querySelectorAll('a[href]:not(.tegel):not(.rij), .knop--tekst, .weetje--link .weetje__tekst')) {
      if (!zichtbaar(a) || a.closest(uitz) || gedimd(a) || !a.textContent.trim()) continue;
      const kleur = getComputedStyle(a).color;
      // BESLISSINGEN 519 en 546: "Verwijderen" in de supplementkaart is een tekstknop die gevuld is met het zachte vlak, zoals Bewaren en Annuleren: dan telt
      // het vlak (--knop-zacht-bg) en de tekst erop >= 4,5 : 1 (in plaats van de tekstkleur als link)
      const eigenVulling = getComputedStyle(a).backgroundColor;
      if (a.matches('.knop--tekst') && kanaal(eigenVulling).a > 0.5) {
        // BESLISSING 546: de vulling is het zachte vlak van de familie Supplementen (--knop-zacht-bg), met de tekst --c-text
        const zacht = zachtVan(a);
        if (norm(eigenVulling) !== zacht.bg) fouten.push(`gevulde tekstknop: vulling is niet --knop-zacht-bg (${zacht.bg}): ${naam(a)} ${eigenVulling}`);
        if (norm(kleur) !== tekstkleur) fouten.push(`gevulde tekstknop: tekst niet --c-text: ${naam(a)} ${kleur}`);
        if (cr(kleur, eigenVulling) < 4.5) contrast.push(`gevulde tekstknop ${cr(kleur, eigenVulling).toFixed(2)}: ${naam(a)}`);
        continue;
      }
      if (norm(kleur) === tekstkleur || norm(kleur) === gedemptekleur) continue; // een gewone tekstkleur
      if (!familieKleur(kleur)) fouten.push(`link buiten de familie: ${naam(a)} ${kleur}`);
      const bg = achtergrond(a);
      if (cr(kleur, bg) < 4.5) contrast.push(`link ${cr(kleur, bg).toFixed(2)}: ${naam(a)}`);
    }
    // een gekozen chip: het vlak (::before) in de familie, de tekst erop >= 4,5 : 1
    for (const c of w.querySelectorAll('.chip.is-actief, .segment__deel.is-actief')) {
      if (!zichtbaar(c) || c.closest(uitz) || gedimd(c)) continue;
      const voor = getComputedStyle(c, '::before');
      const heeftVlak = voor.content !== 'none' && voor.content !== 'normal' && voor.display !== 'none' && kanaal(voor.backgroundColor).a > 0.5;
      const eigenVlak = kanaal(getComputedStyle(c).backgroundColor).a > 0.5;
      const vlak = heeftVlak ? voor.backgroundColor : achtergrond(c);
      const bg = vlak;
      if ((heeftVlak || eigenVlak) && !familieKleur(vlak)) fouten.push(`gekozen chip buiten de familie: ${naam(c)} ${vlak}`);
      if (cr(getComputedStyle(c).color, bg) < 4.5) contrast.push(`gekozen chip ${cr(getComputedStyle(c).color, bg).toFixed(2)}: ${naam(c)}`);
    }
    // BESLISSING 371: het vlak van bediening (niet-gekozen chip, spoor van een keuzerij, stapper, invoervak, periode in woorden, kalendercel) en de knoppen
    // in de familie. Bewust niet: de supplementkaart (eigen chips en knop) en de wisdialoog (gevaarlijke actie).
    const bewust = '.supplementkaart, .supplementkaart *, .dialoog--wis, .dialoog--wis *';
    for (const e of w.querySelectorAll('.chip:not(.is-actief), .segment, .veld__invoer, .stapper__knop, .delen__periodewoorden, .mk__dag')) {
      if (!zichtbaar(e) || e.closest(uitz) || e.closest(bewust) || gedimd(e)) continue;
      const vlak = e.matches('.chip') ? getComputedStyle(e, '::before').backgroundColor : getComputedStyle(e).backgroundColor;
      if (kanaal(vlak).a > 0.5 && !familieKleur(vlak)) fouten.push(`bedieningsvlak buiten de familie: ${naam(e)} ${vlak}`);
    }
    for (const k of w.querySelectorAll('.knop--primair, .knop--secundair')) {
      if (!zichtbaar(k) || k.closest(uitz) || k.closest(bewust) || k.disabled || gedimd(k)) continue;
      const s = getComputedStyle(k);
      if (k.matches('.knop--primair') && inGroep(k)) {
        // BESLISSING 544: een hoofdknop in een groep is hetzelfde zachte vlak met dezelfde tekst als haar buren
        const zacht = zachtVan(k);
        if (norm(s.backgroundColor) !== zacht.bg) fouten.push(`hoofdknop in een groep: vlak is niet --knop-zacht-bg (${zacht.bg}): ${naam(k)} ${s.backgroundColor}`);
        if (norm(s.color) !== tekstkleur || zacht.fg !== tekstkleur) fouten.push(`hoofdknop in een groep: tekst niet --c-text: ${naam(k)} ${s.color}`);
        if (cr(s.color, s.backgroundColor) < 4.5) contrast.push(`hoofdknop in een groep ${cr(s.color, s.backgroundColor).toFixed(2)}: ${naam(k)}`);
      } else if (k.matches('.knop--primair')) {
        if (norm(s.backgroundColor) !== vol) fouten.push(`hoofdknop niet in de volle familiekleur: ${naam(k)} ${s.backgroundColor}`);
        if (cr(s.color, s.backgroundColor) < 4.5) contrast.push(`hoofdknop ${cr(s.color, s.backgroundColor).toFixed(2)}: ${naam(k)}`);
      } else {
        // BESLISSING 537: zacht vlak (token --knop-zacht-bg van de familie van het scherm), geen zichtbare rand, tekst --c-text. Het token wordt
        // gelezen via een proefelement in de wortel van het scherm (of het blad), dus met de waarde van de familie daar.
        const proef = document.createElement('i');
        w.append(proef);
        proef.style.backgroundColor = 'var(--knop-zacht-bg)';
        proef.style.color = 'var(--knop-zacht-fg)';
        const zachtBg = norm(getComputedStyle(proef).backgroundColor);
        const zachtFg = norm(getComputedStyle(proef).color);
        proef.remove();
        if (norm(s.backgroundColor) !== zachtBg) fouten.push(`secundaire knop: vlak is niet --knop-zacht-bg (${zachtBg}): ${naam(k)} ${s.backgroundColor}`);
        if (kanaal(s.borderTopColor).a > 0) fouten.push(`secundaire knop: rand niet transparant: ${naam(k)} ${s.borderTopColor}`);
        if (norm(s.color) !== tekstkleur || zachtFg !== tekstkleur) fouten.push(`secundaire knop: tekst niet --c-text: ${naam(k)} ${s.color}`);
        if (cr(s.color, s.backgroundColor) < 4.5) contrast.push(`secundaire knop ${cr(s.color, s.backgroundColor).toFixed(2)}: ${naam(k)}`);
      }
    }
  }
  const kop = [];
  if (wortel) return { fouten: [...new Set(fouten)].slice(0, 25), contrast: [...new Set(contrast)].slice(0, 15), kop, medailles: 0 };
  for (const k of document.querySelectorAll('#scherm .icoonknop.schermkop__uitleg, #scherm .schermkop__home, #scherm .schermkop__delen, #scherm .schermkop .knop--tekst')) {
    if (!zichtbaar(k)) continue;
    const kleur = getComputedStyle(k).color;
    const bg = achtergrond(k);
    const min = k.matches('.knop--tekst') ? 4.5 : 3;
    kop.push(naam(k));
    // BESLISSING 366: het vraagteken en het huisje in de helderheid van een tegelicoon van het tabblad; op Algemeen en de instellingen ook de
    // terugknop "‹ Algemeen" (het roze van een tegelicoon haalt daar als tekst 4,5 : 1); elders blijft een knop met woord de tekstvariant
    const goed = k.matches('.knop--tekst') && familie !== 'algemeen' ? familieKleur(kleur) : norm(kleur) === icoonkleur;
    if (!goed) fouten.push(`kopknop buiten de familie: ${naam(k)} ${kleur}`);
    if (cr(kleur, bg) < min) contrast.push(`kopknop ${cr(kleur, bg).toFixed(2)} < ${min}: ${naam(k)}`);
  }
  // BESLISSING 367: de medailles volgen de familie van het scherm; behaald en nog te behalen verschillen in vulling én lint, niet alleen in kleur
  let medailles = 0;
  for (const m of document.querySelectorAll('#scherm .medaille')) {
    if (!zichtbaar(m)) continue;
    medailles++;
    const schijf = getComputedStyle(m.querySelector('.medaille__schijf')).backgroundColor;
    const icoon = getComputedStyle(m.querySelector('.medaille__icoon')).color;
    const lint = [...m.querySelectorAll('.medaille__lint')].some((l) => getComputedStyle(l).display !== 'none');
    const behaald = m.classList.contains('is-behaald');
    if (!familieKleur(schijf)) fouten.push(`medaille buiten de familie: ${behaald ? 'behaald' : 'open'} ${schijf}`);
    if (behaald && (norm(schijf) !== vol || !lint)) fouten.push(`behaalde medaille niet vol of zonder lint: ${schijf}`);
    if (!behaald && (norm(schijf) === vol || lint)) fouten.push(`nog te behalen medaille vol of met lint: ${schijf}`);
    if (cr(icoon, schijf) < 3) contrast.push(`icoon op medaille ${cr(icoon, schijf).toFixed(2)} (${behaald ? 'behaald' : 'open'})`);
  }
  return { fouten: [...new Set(fouten)].slice(0, 25), contrast: [...new Set(contrast)].slice(0, 15), kop, medailles };
}

const RONDES = [
  ['poeder', 1690, 1230],
  ['poeder', 390, 844],
  ['salie', 1690, 1230],
  ['nacht', 1690, 1230],
];

for (const [thema, b, hgt] of RONDES) {
  test.describe(`${thema} ${b}`, () => {
    test.use({ viewport: { width: b, height: hgt }, isMobile: b < 600, hasTouch: b < 600, reducedMotion: 'reduce' });
    test(`elk scherm in de familie van zijn tabblad`, async ({ page }) => {
      test.setTimeout(240000);
      await zetThema(page, thema);
      const verslag = [];
      for (const [route, wat, extra] of SCHERMEN) {
        await open(page, route, extra);
        const familie = FAMILIE_VAN(route);
        const uit = await page.evaluate(meet, { familie, families: FAMILIES, rollen: ROLLEN, familietokens: FAMILIETOKENS, uitzondering: UITZONDERING });
        if (uit.fouten.length || uit.contrast.length) verslag.push(`${wat} (${familie}):\n  ${[...uit.fouten, ...uit.contrast].join('\n  ')}`);
        if (extra !== 'kaart') expect(uit.kop.length, `${wat}: knoppen in de kop gevonden`).toBeGreaterThan(0);
        if (route === 'meer' || route === 'meer/badges') expect(uit.medailles, `${wat}: medailles gevonden`).toBeGreaterThan(2);
      }
      expect(verslag, verslag.join('\n')).toEqual([]);
    });

    test(`Vandaag: elke kaart in de familie van haar tabblad`, async ({ page }) => {
      await zetThema(page, thema);
      await open(page, 'vandaag');
      const uit = await page.evaluate(() => {
        const sonde = document.createElement('i');
        document.body.append(sonde);
        const los = (w) => { sonde.style.color = w; return getComputedStyle(sonde).color; };
        const set = (f) => new Set(['basis', 'zacht', 'icoon', 'tekst', 'gevuld', 'vol', 'vulling', 'op-vulling', 'gehaald'].map((r) => los(`var(--f-${f}-${r})`)));
        const boek = set('dagboek');
        const gezond = set('gezond');
        const drank = set('drank');
        const accent = los('var(--c-accent)');
        sonde.remove();
        const kleur = (sel, eig = 'color') => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => getComputedStyle(e)[eig]);
        return {
          kalLink: kleur('.vandaag .kalkaart .kalkaart__link').map((k) => boek.has(k)),
          kalPijl: kleur('.vandaag .kalkaart .kalkaart__blader .icoonknop').map((k) => boek.has(k)),
          kalKlaar: kleur('.vandaag .kalkaart .kalender__klaar', 'backgroundColor').map((k) => gezond.has(k)),
          drinkTegel: kleur('.vandaag .drinkkaart .kaartkop .tegel').map((k) => drank.has(k)),
          suppTegel: kleur('.vandaag .suppkaart .kaartkop .tegel').map((k) => gezond.has(k)),
          suppAan: kleur('.vandaag .suppkaart .vinkvak[aria-checked="true"] .vinkvak__vak', 'backgroundColor').map((k) => gezond.has(k)),
          // de pijltjes van de kaart Kalender waren het accent (oudroze): niet meer
          kalNietAccent: kleur('.vandaag .kalkaart .kalkaart__blader .icoonknop').every((k) => k !== accent),
        };
      });
      expect(uit.kalLink.length).toBeGreaterThan(0);
      expect(uit.kalLink.every(Boolean), 'link "Naar het Dagboek" in de familie van het Dagboek').toBe(true);
      expect(uit.kalPijl.length).toBe(2);
      expect(uit.kalPijl.every(Boolean), 'maandpijltjes in de familie van het Dagboek').toBe(true);
      expect(uit.kalNietAccent).toBe(true);
      expect(uit.kalKlaar.every(Boolean), 'het bolletje "alles genomen" blijft salie').toBe(true);
      expect(uit.drinkTegel.length).toBeGreaterThan(0);
      expect(uit.drinkTegel.every(Boolean), 'de kaart Drinken in de drink-familie').toBe(true);
      expect(uit.suppTegel.every(Boolean) && uit.suppTegel.length > 0, 'de kaart Supplementen in de gezondheidsfamilie').toBe(true);
      expect(uit.suppAan.every(Boolean), 'afgevinkt op de kaart Supplementen in de gezondheidsfamilie').toBe(true);

      // BESLISSING 370: elke kaart volledig in haar familie
      const verslag = [];
      for (const [kaart, familie, extra] of VANDAAG) {
        const m = await page.evaluate(meet, { familie, families: FAMILIES, rollen: ROLLEN, familietokens: FAMILIETOKENS, uitzondering: UITZONDERING, wortel: kaart, extra });
        if (m.fouten.length || m.contrast.length) verslag.push(`${kaart} (${familie}):\n  ${[...m.fouten, ...m.contrast].join('\n  ')}`);
      }
      // de vier tegels van de bovenste kaart: elk in de familie van hun onderwerp (de stemming houdt haar eigen kleur)
      const tegels = await page.evaluate(() => {
        const sonde = document.createElement('i');
        document.body.append(sonde);
        const los = (w) => { sonde.style.color = w; return getComputedStyle(sonde).color; };
        const fam = { maaltijd: 'dagboek', drank: 'drank', gezondheid: 'gezond' };
        const uit = [];
        for (const t of document.querySelectorAll('.vandaag .voortgang .motiv__tegel .tegel:not(.tegel--rond)')) {
          const f = Object.keys(fam).find((k) => t.classList.contains('tegel--' + k));
          if (!f) continue;
          const s = getComputedStyle(t);
          if (s.backgroundColor !== los(`var(--f-${fam[f]}-zacht)`) || s.color !== los(`var(--f-${fam[f]}-icoon)`)) uit.push(`${f}: ${s.color} op ${s.backgroundColor}`);
        }
        sonde.remove();
        return uit;
      });
      expect([...verslag, ...tegels], [...verslag, ...tegels].join('\n')).toEqual([]);

      // nergens op Vandaag nog het roze accent (de kleur van Algemeen), behalve in de blaadjes van de energie en het logo
      const roze = await page.evaluate(() => {
        const sonde = document.createElement('i');
        document.body.append(sonde);
        const los = (w) => { sonde.style.color = w; return getComputedStyle(sonde).color; };
        const accent = new Set(['--c-accent', '--c-accent-soft', '--c-accent-text', '--c-accent-text-op-soft', '--tile-meal-bg', '--tile-meal-fg'].map((n) => los(`var(${n})`)));
        sonde.remove();
        const uitz = '.energie, .energie *, .kalender__blad, .kalender__blad *, .logo, .logo *, .beeldmerk, .beeldmerk *, .begroeting__merk, .begroeting__merk *';
        const uit = [];
        for (const e of document.querySelectorAll('#scherm *')) {
          if (e.closest(uitz) || e.getBoundingClientRect().width < 1) continue;
          const s = getComputedStyle(e);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          for (const p of ['color', 'backgroundColor', 'fill', 'stroke', 'borderTopColor']) {
            if (p === 'color' && !e.matches('svg, svg *, .icoon, .tegel') && !e.textContent.trim()) continue;
            if (p === 'borderTopColor' && (s.borderTopStyle === 'none' || parseFloat(s.borderTopWidth) === 0)) continue;
            if (accent.has(s[p])) uit.push(`${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]} ${p}`);
          }
        }
        return [...new Set(uit)].slice(0, 20);
      });
      // in Salie is het accent groen en valt zijn zachte tint samen met die van Supplementen: daar zegt deze telling niets (de meting per kaart hierboven geldt wel)
      if (thema !== 'salie') expect(roze, roze.join('\n')).toEqual([]);
    });
  });
}
