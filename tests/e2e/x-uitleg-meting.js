// Metingen voor de rondleidingen (BESLISSING 523), gedeeld door x-uitleg-uitlichting.spec.js en c-uitleg.spec.js.
//
// meetStap (in de pagina, via page.evaluate): het gat, de kaart, de knoppen en hun kleuren, de focus, en het ZICHTBARE doel. Het zichtbare
// doel is wat je ziet, niet het tikvlak: een geschilderd vlak met zijn rand (met een doorzichtige rand en background-clip: padding-box het vak
// binnen die rand), een geschilderde ::before of ::after die het grootste deel beslaat (de zwevende balk onderaan), een houder waarvan elk
// zichtbaar kind een vlak is (een groep knoppen: hun omhulsel), anders het element. Bedekt: zonder de uitleglaag kijken wat er op vijf
// punten van het doel bovenop ligt (een vaste kop, de balk onderaan).
// referentie (in de pagina): de kleuren van een gevulde, een secundaire en een tekstknop in de familie van het scherm (op Vandaag in de
// bovenste kaart, BESLISSING 370), gemeten op een onzichtbare proefknop vóór de rondleiding start.
// toetsStap (in node): de lijst afwijkingen voor één stap.

export const MAAT = { marge: 8, margeTelefoon: 12, afstand: 14, rand: 12 };

// Genoeg gegevens om elke voorwaardelijke stap te laten verschijnen (zoals zaai() in c-uitleg.spec.js): supplementen met een spuit vandaag,
// een streefgewicht, drie wegingen, vier dagen met stemming, drank en een maaltijd. Daarna herladen.
export function zaaiUitleg(page, { wegingen = 3, streef = true, spuit = true } = {}) {
  return page.evaluate(
    (o) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = async () => {
          const db = open.result;
          const schrijf = (store, rij, wijze = 'put') =>
            new Promise((ok, no) => {
              const tx = db.transaction(store, 'readwrite');
              tx.objectStore(store)[wijze](rij);
              tx.oncomplete = ok;
              tx.onerror = () => no(tx.error);
            });
          const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
          const nu = new Date();
          try {
            await schrijf('supplementen', { naam: 'Vitamine D', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }, 'add');
            await schrijf('supplementen', { naam: 'Magnesium', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['avond'], ritme: { soort: 'dagelijks' }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 2 }, 'add');
            if (o.spuit) await schrijf('supplementen', { naam: 'IJzer spuit', dosis: '1 spuit', hoeveelheid: '1 spuit', aanwijzing: '', momenten: [], ritme: { soort: 'maand', start: iso(nu) }, volgorde: 3, actief: true, voorbeeld: false, aangemaaktOp: 3 }, 'add');
            if (o.streef) await schrijf('instellingen', { sleutel: 'gewicht.streefKg', waarde: 62 });
            for (let w = 0; w < o.wegingen; w++) {
              const x = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - w * 7, 12);
              const maandag = new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7), 12);
              await schrijf('wegingen', { week: iso(maandag), datum: iso(x), kg: 70 - (o.wegingen - 1 - w) * 0.6, voorbeeld: false, gewijzigdOp: Date.now() });
            }
            for (let k = 0; k < 4; k++) {
              const x = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - k, nu.getHours(), nu.getMinutes());
              const ds = iso(x);
              await schrijf('dagen', { datum: ds, notitie: k % 2 ? 'Rustige dag.' : '', stemming: 3 + (k % 3), energie: 2 + (k % 3), doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
              for (const [soort, ml] of [['water', 800], ['thee', 200], ['water', 800]]) await schrijf('dranken', { datum: ds, tijdstip: x.getTime() - 3600e3, soort, ml, voorbeeld: false }, 'add');
              await schrijf('maaltijden', { datum: ds, soort: 'ontbijt', tekst: 'havermout met banaan', fotoId: null, gevoel: 4, voorbeeld: false, gewijzigdOp: 1 });
            }
            db.close();
            klaar();
          } catch (e) {
            fout(e);
          }
        };
      }),
    { wegingen, streef, spuit },
  );
}

export function referentie() {
  const scherm = document.getElementById('scherm');
  const vandaag = scherm?.dataset.scherm === 'vandaag';
  const houder = (vandaag && scherm.querySelector('.voortgang')) || scherm;
  const maak = (klas) => {
    const b = document.createElement('button');
    b.className = 'knop ' + klas;
    b.textContent = 'x';
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.style.setProperty('position', 'absolute');
    b.style.setProperty('visibility', 'hidden');
    houder.append(b);
    const s = getComputedStyle(b);
    const o = { bg: s.backgroundColor, fg: s.color, rand: s.borderTopColor };
    b.remove();
    return o;
  };
  // BESLISSINGEN 528, 537 en 542: de andere knoppen van de kaart zijn het zachte vlak van een omrande knop van hetzelfde scherm.
  const secundair = maak('knop--secundair');
  window.__uitlegRef = { primair: maak('knop--primair'), secundair, zacht: secundair };
  return window.__uitlegRef;
}

export function meetStap({ doel, ook }) {
  const kleur = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    return (css) => {
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = '#000';
      x.fillStyle = css;
      x.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: Math.round((a / 255) * 100) / 100 };
    };
  })();
  const doorzichtig = (c) => kleur(c).a === 0;
  const zicht = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  };
  const geschilderd = (s) => !doorzichtig(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s['border' + k + 'Width']) > 0 && !doorzichtig(s['border' + k + 'Color']));
  const straalPx = (s, w, h) => {
    const ruw = s.borderTopLeftRadius || '0';
    const n = parseFloat(ruw) || 0;
    return ruw.trim().endsWith('%') ? (n / 100) * Math.min(w, h) : n;
  };
  const pseudo = (el, r, s, p) => {
    const ps = getComputedStyle(el, p);
    if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') return null;
    if (!['absolute', 'fixed'].includes(ps.position) || !geschilderd(ps)) return null;
    const [L, T, W, H] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(ps[k]));
    if (![L, T, W, H].every(Number.isFinite)) return null;
    const bl = parseFloat(s.borderLeftWidth) || 0;
    const bt = parseFloat(s.borderTopWidth) || 0;
    return { l: r.left + bl + L, t: r.top + bt + T, r: r.left + bl + L + W, b: r.top + bt + T + H, straal: straalPx(ps, W, H) };
  };
  function vlakVan(el, diep = 0) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (geschilderd(s)) {
      const rw = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(s['border' + k + 'Width']) || 0);
      const weg = ['Top', 'Right', 'Bottom', 'Left'].every((k, i) => rw[i] === 0 || doorzichtig(s['border' + k + 'Color']));
      if (weg && s.boxShadow === 'none' && s.backgroundClip === 'padding-box' && rw.some((x) => x > 0)) {
        return { l: r.left + rw[3], t: r.top + rw[0], r: r.right - rw[1], b: r.bottom - rw[2], straal: Math.max(0, straalPx(s, r.width, r.height) - Math.max(rw[0], rw[3])), vlak: true, bron: 'binnen de doorzichtige rand' };
      }
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, straal: straalPx(s, r.width, r.height), vlak: true, bron: 'eigen vlak' };
    }
    for (const p of ['::before', '::after']) {
      const v = pseudo(el, r, s, p);
      if (v && (v.r - v.l) * (v.b - v.t) >= 0.4 * r.width * r.height) return { ...v, vlak: true, bron: p };
    }
    if (diep < 3) {
      const kinderenVan = (e) => [...e.children].flatMap((k) => (getComputedStyle(k).display === 'contents' ? kinderenVan(k) : [k])); // display: contents telt niet zelf
      const kinderen = kinderenVan(el).filter(zicht).map((k) => vlakVan(k, diep + 1));
      if (kinderen.length === 1 && kinderen[0].vlak) return { ...kinderen[0], bron: 'enig kind' };
      if (kinderen.length > 1 && kinderen.every((k) => k.vlak)) {
        return { l: Math.min(...kinderen.map((k) => k.l)), t: Math.min(...kinderen.map((k) => k.t)), r: Math.max(...kinderen.map((k) => k.r)), b: Math.max(...kinderen.map((k) => k.b)), straal: Math.max(...kinderen.map((k) => k.straal)), vlak: false, bron: 'groep van vlakken' };
      }
    }
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, straal: straalPx(s, r.width, r.height), vlak: false, bron: 'element' };
  }
  const vind = (sel) => {
    if (!sel) return null;
    try {
      return [...document.querySelectorAll(sel)].find(zicht) || null;
    } catch {
      return null;
    }
  };
  // De onderkant van de vaste balken bovenaan en de bovenkant van het vlak onderaan.
  const kopOnder = (() => {
    let o = 0;
    for (const e of document.querySelectorAll('.demo-balk, .schermkop, .dagboek > .dagboek__kop, .vandaag > .vandaag__begroeting > .vandaag__logo')) {
      if (e.closest('dialog') || !zicht(e)) continue;
      const s = getComputedStyle(e);
      if (s.position !== 'sticky' && s.position !== 'fixed') continue;
      const r = e.getBoundingClientRect();
      if (r.top > innerHeight / 3) continue;
      const p = pseudo(e, r, s, '::before');
      o = Math.max(o, r.bottom, p ? p.b : 0);
    }
    return o;
  })();
  const tab = document.getElementById('tabbalk');
  const balk = tab && getComputedStyle(tab).display !== 'none' && zicht(tab) ? vlakVan(tab) : null;
  const zb = document.getElementById('zijbalk');

  const laag = document.querySelector('.uitleg[data-uitleg-laag]');
  const kaartEl = laag?.querySelector('.uitleg__kaart[role="dialog"]');
  if (!kaartEl) return { geenKaart: true };
  const gatEl = laag.querySelector('.uitleg__gat');
  const gs = getComputedStyle(gatEl);
  const g = gatEl.getBoundingClientRect();
  const k = kaartEl.getBoundingClientRect();
  const ks = getComputedStyle(kaartEl);
  const schaduw = gs.boxShadow.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]+)/i);
  const knoppen = [...kaartEl.querySelectorAll('.uitleg__acties > button')].filter((b) => !b.hidden && zicht(b)).map((b) => {
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    const tk = b.querySelector('.knop__tekst');
    const afgekapt = Boolean(tk && tk.scrollWidth > tk.clientWidth + 1) || b.scrollWidth > b.clientWidth + 1;
    return { tekst: b.textContent.trim(), klas: b.className, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, bg: s.backgroundColor, fg: s.color, rand: s.borderTopColor, afgekapt };
  });
  const uit = {
    kant: kaartEl.dataset.kant,
    midden: laag.classList.contains('is-midden'),
    gat: { l: g.left, t: g.top, r: g.right, b: g.bottom, straal: parseFloat(gs.borderTopLeftRadius) || 0 },
    gatKader: [gs.borderTopWidth, gs.outlineStyle === 'none' ? '0px' : gs.outlineWidth].some((w) => parseFloat(w) > 0) || !doorzichtig(gs.backgroundColor),
    kaart: { l: k.left, t: k.top, r: k.right, b: k.bottom, padL: parseFloat(ks.paddingLeft), padR: parseFloat(ks.paddingRight), bg: kleur(ks.backgroundColor) },
    sluier: schaduw ? kleur(schaduw[1]) : null,
    knoppen: knoppen.map((b) => ({ ...b, bg: kleur(b.bg), fg: kleur(b.fg), rand: kleur(b.rand) })),
    label: kaartEl.querySelector('.uitleg__stap')?.textContent?.trim(),
    labelKleur: kleur(getComputedStyle(kaartEl.querySelector('.uitleg__stap')).color),
    focusInKaart: kaartEl.contains(document.activeElement),
    naam: document.getElementById(kaartEl.getAttribute('aria-labelledby') || '')?.textContent?.trim() || kaartEl.getAttribute('aria-label'),
    modaal: kaartEl.getAttribute('aria-modal'),
    live: Boolean(kaartEl.querySelector('[aria-live]')),
    familie: laag.dataset.familie || null,
    ref: window.__uitlegRef ? Object.fromEntries(Object.entries(window.__uitlegRef).map(([n, o]) => [n, { bg: kleur(o.bg), fg: kleur(o.fg), rand: kleur(o.rand) }])) : null,
    zone: { top: kopOnder, bottom: balk ? balk.t : innerHeight },
    balk: balk ? { l: balk.l, t: balk.t, r: balk.r, b: balk.b } : null,
    zijbalk: zb && getComputedStyle(zb).display !== 'none' ? zb.getBoundingClientRect().right : 0,
    venster: { b: innerWidth, h: innerHeight },
  };
  if (!doel) return uit;
  const el = vind(doel);
  if (!el) return { ...uit, kwijt: true };
  let v = vlakVan(el);
  const ander = ook ? vind(ook) : null;
  if (ander && ander !== el) {
    const w = vlakVan(ander);
    v = { l: Math.min(v.l, w.l), t: Math.min(v.t, w.t), r: Math.max(v.r, w.r), b: Math.max(v.b, w.b), straal: Math.max(v.straal, w.straal), vlak: false, bron: 'twee onderdelen' };
  }
  uit.doel = v;
  let vast = false;
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const p = getComputedStyle(e).position;
    if (p === 'fixed' || p === 'sticky' || (e.tagName === 'DIALOG' && e.open)) vast = true;
  }
  uit.vast = vast;
  uit.inDialog = Boolean(el.closest('dialog'));
  uit.inKop = Boolean(el.closest('.demo-balk, .schermkop, .dagboek__kop, .vandaag__begroeting, #zijbalk, #tabbalk'));
  uit.doelKader = getComputedStyle(el).outlineStyle !== 'none' && parseFloat(getComputedStyle(el).outlineWidth) > 0;
  // Bedekt? Zonder de laag (en zonder inert) kijken wat er op vijf punten van het zichtbare doel ligt.
  const oud = laag.style.getPropertyValue('visibility');
  laag.style.setProperty('visibility', 'hidden');
  const inert = [...document.querySelectorAll('[inert]')];
  for (const x of inert) x.inert = false;
  const bedekt = [];
  for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) {
    const x = v.l + (v.r - v.l) * fx;
    const y = v.t + (v.b - v.t) * fy;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit || el.contains(hit) || hit.contains(el) || (ander && (ander.contains(hit) || hit.contains(ander)))) continue;
    // Twee onderdelen samen (ook): wat tussen de twee in hun gemeenschappelijke houder staat, hoort bij het uitgelichte vlak.
    if (ander && ander !== el) {
      let ouder = el.parentElement;
      while (ouder && !ouder.contains(ander)) ouder = ouder.parentElement;
      if (ouder && ouder.contains(hit) && !['fixed', 'sticky'].includes(getComputedStyle(hit).position)) continue;
    }
    // Binnen een blad: wat er ook bovenop ligt (de balk onderaan, de kop).
    if (el.closest('dialog')) bedekt.push(hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0]);
  }
  // Een vaste kop of de balk onderaan over het onderdeel (een onderdeel in de kop of de balk zelf telt niet). Geometrisch: de balk onderaan
  // laat tikken door zijn lege randen heen (pointer-events: none), dus elementFromPoint ziet hem daar niet.
  // (toetsStap rekent dat uit voor het deel dat uitgelicht is: bij een te hoog onderdeel alleen het gat.)
  // Een vaste melding ("Nieuwe badge") die zichtbaar over het onderdeel ligt.
  for (const vm of document.querySelectorAll('.vieringhouder > *')) {
    if (getComputedStyle(vm.parentElement).opacity === '0' || getComputedStyle(vm).visibility === 'hidden' || !zicht(vm)) continue;
    const r = vm.getBoundingClientRect();
    if (r.left < v.r && r.right > v.l && r.top < v.b && r.bottom > v.t) bedekt.push('de melding Nieuwe badge');
  }
  uit.geometrisch = !el.closest('.demo-balk, .schermkop, .dagboek__kop, .vandaag__begroeting, #zijbalk, #tabbalk') && !el.closest('dialog');
  for (const x of inert) x.inert = true;
  if (oud) laag.style.setProperty('visibility', oud);
  else laag.style.removeProperty('visibility');
  uit.bedekt = [...new Set(bedekt)];
  return uit;
}

// Wacht tot het gat en de kaart stilstaan (acht beelden niet bewogen) en geen eindige animatie meer loopt.
export const uitlegRust = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar) => {
        const begin = performance.now();
        let vorige = '';
        let stil = 0;
        const kijk = () => {
          const g = document.querySelector('.uitleg__gat')?.getBoundingClientRect();
          const k = document.querySelector('.uitleg__kaart')?.getBoundingClientRect();
          const nu = JSON.stringify([g && [g.x, g.y, g.width, g.height], k && [k.x, k.y, k.width, k.height], scrollY]);
          const bezig = document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime));
          stil = nu === vorige && !bezig ? stil + 1 : 0;
          vorige = nu;
          if (stil >= 8 || performance.now() - begin > 6000) klaar();
          else requestAnimationFrame(kijk);
        };
        requestAnimationFrame(kijk);
      }),
  );

const lum = ({ r, g, b }) => {
  const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const gelijk = (a, b) => Boolean(a && b) && Math.abs(a.r - b.r) <= 2 && Math.abs(a.g - b.g) <= 2 && Math.abs(a.b - b.b) <= 2;
const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('') : '-');

// De afwijkingen van één stap. stap: uit stappenVoor (doel, midden). Geeft { fouten, afgesneden }.
// naScrollen: de gebruiker scrolde zelf; dan telt alleen dat het gat het onderdeel volgt (in beeld blijven hoeft niet).
export function toetsStap(m, stap, { naScrollen = false } = {}) {
  const f = [];
  if (m.geenKaart) return { fouten: ['geen kaart'], afgesneden: false };
  const { b: vb, h: vh } = m.venster;
  const k = m.kaart;
  // De kaart: volledig in het venster, met de marge.
  if (k.l < MAAT.rand - 1 || k.r > vb - MAAT.rand + 1 || k.t < MAAT.rand - 1 || k.b > vh - MAAT.rand + 1) f.push(`kaart niet volledig in beeld (${k.l.toFixed(0)},${k.t.toFixed(0)} tot ${k.r.toFixed(0)},${k.b.toFixed(0)})`);
  // BESLISSING 750 (K2): onder 600 px zichtbare hoogte mag de kaart over de gedimde vaste kop, zoals over de balk onderaan (570).
  if (!m.midden && vh >= 600 && k.t < m.zone.top - 1) f.push(`kaart over de vaste kop (${k.t.toFixed(0)} < ${m.zone.top.toFixed(0)})`);
  if (vb >= 720 && m.zijbalk && k.l < m.zijbalk + MAAT.rand - 1) f.push('kaart over de zijbalk');
  // Toegankelijkheid
  if (!m.focusInKaart) f.push('de focus staat niet in de kaart');
  if (!m.naam) f.push('de kaart heeft geen naam');
  if (m.modaal !== 'true') f.push('de kaart is geen modale dialog');
  if (!m.live) f.push('geen aria-live voor de stap');
  if (m.gatKader) f.push('het gat heeft een rand, outline of vlak');
  // De sluier is neutraal.
  if (m.sluier && Math.max(m.sluier.r, m.sluier.g, m.sluier.b) - Math.min(m.sluier.r, m.sluier.g, m.sluier.b) > 6) f.push(`de sluier heeft een kleur (${hex(m.sluier)})`);
  // De knoppen: familiekleur, contrast, tikvlak, gecentreerd en even breed.
  const vol = m.knoppen.find((b) => /uitleg__volgende/.test(b.klas));
  const tek = m.knoppen.find((b) => /uitleg__overslaan/.test(b.klas));
  if (!vol || !tek) f.push('Volgende of Overslaan ontbreekt');
  // BESLISSINGEN 528 en 544: alle knoppen van de kaart (ook Volgende en Klaar) zijn het zachte vlak van een omrande knop van het scherm, nooit
  // wit of doorzichtig op de witte kaart: vlak tegenover de kaart minstens 1,3 : 1, tekst op het vlak minstens 4,5 : 1.
  for (const b of m.knoppen) {
    if (b.bg.a < 1) f.push(`${b.tekst} heeft geen eigen vlak (doorzichtig)`);
    if (m.ref && !gelijk(b.fg, m.ref.zacht.fg)) f.push(`tekst van ${b.tekst} ${hex(b.fg)} i.p.v. ${hex(m.ref.zacht.fg)}`);
    if (m.ref && !gelijk(b.bg, m.ref.zacht.bg)) f.push(`${b.tekst} ${hex(b.bg)} i.p.v. het zachte vlak ${hex(m.ref.zacht.bg)} van het scherm`);
    if (contrast(b.bg, k.bg) < 1.3) f.push(`${b.tekst}: vlak tegenover de kaart ${contrast(b.bg, k.bg).toFixed(2)} (minstens 1,3)`);
    if (contrast(b.fg, b.bg) < 4.5) f.push(`${b.tekst}: tekst op het vlak ${contrast(b.fg, b.bg).toFixed(2)}`);
    if (vol && Math.abs(b.h - vol.h) > 1) f.push(`${b.tekst} is niet even hoog als Volgende`);
  }
  for (const b of m.knoppen) if (b.afgekapt) f.push(`de tekst van ${b.tekst} is afgekapt`);
  if (contrast(m.labelKleur, k.bg) < 4.5) f.push(`contrast Stap n van m ${contrast(m.labelKleur, k.bg).toFixed(2)}`);
  for (const b of m.knoppen) if (b.h < 44 || b.w < 44) f.push(`tikvlak ${b.tekst} ${b.w.toFixed(0)}x${b.h.toFixed(0)}`);
  // Rijen: knoppen waarvan het midden minder dan 12 px verschilt (een knop onder de muis staat 1 px hoger, BESLISSING 188: een lichte lift).
  const rijen = new Map();
  for (const b of [...m.knoppen].sort((x, y) => x.t + x.b - (y.t + y.b))) {
    const midden = (b.t + b.b) / 2;
    const rij = [...rijen.keys()].find((k) => Math.abs(k - midden) < 12);
    if (rij === undefined) rijen.set(midden, [b]);
    else rijen.get(rij).push(b);
  }
  for (const rij of rijen.values()) {
    const ws = rij.map((b) => b.w);
    if (Math.max(...ws) - Math.min(...ws) > 1) f.push(`knoppen niet even breed (${rij.map((b) => b.tekst + ' ' + b.w.toFixed(1)).join(', ')})`);
    const links = Math.min(...rij.map((b) => b.l)) - (k.l + k.padL);
    const rechts = k.r - k.padR - Math.max(...rij.map((b) => b.r));
    if (Math.abs(links - rechts) > 1) f.push(`knoppen niet gecentreerd (links ${links.toFixed(1)}, rechts ${rechts.toFixed(1)})`);
  }
  if (!stap || stap.midden) return { fouten: f, afgesneden: false };
  if (m.kwijt) return { fouten: [...f, 'het onderdeel is niet gevonden'], afgesneden: false };
  if (m.doelKader) f.push('het onderdeel heeft een outline');
  // Het gat tegenover het zichtbare doel: een vlak precies op zijn rand, een groep met een gelijke marge van 6 (telefoon) of 8 px. Een stap
  // kan een eigen marge meegeven (stappen.js).
  const d = m.doel;
  const marge = stap.marge ?? (d.vlak ? 0 : vb < 720 ? MAAT.margeTelefoon : MAAT.marge);
  const verwacht = { l: d.l - marge, t: d.t - marge, r: d.r + marge, b: d.b + marge };
  const g = m.gat;
  // Te hoog onderdeel: het past zelfs met de kaart over de balk onderaan niet in het vrije deel. Dan staat het bovenaan in het vrije deel
  // en stopt het gat vlak boven de kaart. Dat mag alleen als het echt niet anders kan.
  const vrij = k.t - MAAT.afstand - (m.vast ? 0 : m.zone.top + MAAT.rand);
  // Ook: een vast onderdeel (in de kop, in een open blad) dat onderaan staat en waarboven de kaart niet past (een telefoon liggend).
  const kaartPastErbovenNiet = m.vast && k.b - k.t + MAAT.afstand > verwacht.t - (m.zone.top + MAAT.rand);
  const afgesneden = ['vast', 'vast-onder'].includes(m.kant) && g.b < verwacht.b - 2 && Math.abs(g.b - (k.t - MAAT.afstand)) <= 2 && (verwacht.b - verwacht.t > vrij - 2 || kaartPastErbovenNiet || naScrollen);
  for (const z of ['l', 't', 'r']) if (Math.abs(g[z] - verwacht[z]) > 2) f.push(`gat ${z} ${g[z].toFixed(1)} i.p.v. ${verwacht[z].toFixed(1)} (${d.bron})`);
  // BESLISSING 548: een afgesneden (half omkaderd) onderdeel is op een telefoon altijd een fout. Alleen liggend (844 x 390, geen staande telefoon)
  // mag een onderdeel in een open blad nog afgesneden zijn; dat komt als uitzondering in het rapport (afgesneden: true). Op tablet en desktop
  // (hoger dan 560 px) blijft de oude regel: alleen als het echt niet anders kan.
  const telefoonStaand = vb < 720;
  const liggend = !telefoonStaand && vh < 560;
  if (afgesneden && !naScrollen && (telefoonStaand || (liggend && !m.inDialog))) f.push(`onderdeel afgesneden: het gat stopt op ${g.b.toFixed(1)} boven de kaart, het onderdeel loopt tot ${verwacht.b.toFixed(1)} (${d.bron})`);
  else if (afgesneden) {
    if (Math.abs(g.b - (k.t - MAAT.afstand)) > 2) f.push(`afgesneden gat stopt op ${g.b.toFixed(1)}, niet ${MAAT.afstand} px boven de kaart`);
  } else if (Math.abs(g.b - verwacht.b) > 2) f.push(`gat b ${g.b.toFixed(1)} i.p.v. ${verwacht.b.toFixed(1)} (${d.bron})`);
  // Telefoon (staand of liggend): het zichtbare onderdeel staat volledig in het vrije vlak, tussen de vaste kop en de balk onderaan (een
  // onderdeel in de kop, de balk of een open blad: in het venster), en de kaart ligt er niet over. De rondleiding scrolde zelf.
  if (!naScrollen && (telefoonStaand || liggend) && !(liggend && afgesneden && m.inDialog)) {
    const los = m.inKop || m.inDialog;
    const boven = los ? 0 : m.zone.top;
    const onder = los ? vh : m.zone.bottom;
    if (!m.vast || los) {
      if (d.t < boven - 1 || d.b > onder + 1 || d.l < -1 || d.r > vb + 1) f.push(`onderdeel niet volledig in het vrije vlak (${d.t.toFixed(0)} tot ${d.b.toFixed(0)}, vrij ${boven.toFixed(0)} tot ${onder.toFixed(0)})`);
    }
    if (!(k.r <= d.l + 1 || k.l >= d.r - 1 || k.b <= d.t + 1 || k.t >= d.b - 1)) f.push(`kaart over het onderdeel (${d.t.toFixed(0)} tot ${d.b.toFixed(0)}, kaart ${k.t.toFixed(0)} tot ${k.b.toFixed(0)})`);
  }
  const verwachtStraal = Math.min(stap.straal ?? d.straal + marge, (g.r - g.l) / 2, (g.b - g.t) / 2);
  if (Math.abs(g.straal - verwachtStraal) > 2) f.push(`afronding van het gat ${g.straal.toFixed(1)} i.p.v. ${verwachtStraal.toFixed(1)} (${d.bron})`);
  if (naScrollen) return { fouten: f, afgesneden };
  // De kaart staat nooit over het (zichtbare deel van het) doel.
  if (g.r - g.l > 0 && !(k.r <= g.l + 1 || k.l >= g.r - 1 || k.b <= g.t + 1 || k.t >= g.b - 1)) f.push(`kaart over het onderdeel (kant ${m.kant})`);
  // Over de balk onderaan alleen als het onderdeel anders niet boven de kaart past.
  if (m.balk && !m.vast && k.b > m.balk.t + 1 && k.t < m.balk.b) {
    const nodig = verwacht.b - verwacht.t + MAAT.afstand + (k.b - k.t);
    // Mag wel: de kaart staat vlak onder of boven het onderdeel (de pagina kon niet verder schuiven), of het onderdeel past echt niet.
    const ernaast = Math.abs(k.t - (g.b + MAAT.afstand)) <= 2 || Math.abs(k.b - (g.t - MAAT.afstand)) <= 2;
    if (!ernaast && nodig <= m.zone.bottom - MAAT.rand - (m.zone.top + MAAT.rand) + 1) f.push('kaart over de balk onderaan terwijl het onderdeel ook zo past');
  }
  // In beeld en niet bedekt.
  if (m.vast) {
    if (verwacht.b < 0 || verwacht.t > vh) f.push('vast onderdeel buiten beeld');
  } else if (['rechts', 'links'].includes(m.kant) && verwacht.b - verwacht.t > m.zone.bottom - m.zone.top - 2 * MAAT.rand) {
    // Hoger dan het venster, met de kaart ernaast: het onderdeel begint bovenaan in het vrije deel.
    if (g.t < m.zone.top - 1 || g.t > m.zone.top + MAAT.rand + 2) f.push(`hoog onderdeel staat niet bovenaan in beeld (${g.t.toFixed(0)}, vrij vanaf ${m.zone.top.toFixed(0)})`);
  } else if (g.t < m.zone.top - 1 || (!afgesneden && g.b > Math.max(m.zone.bottom, k.t) + 1)) f.push(`onderdeel niet volledig in beeld (${g.t.toFixed(0)} tot ${g.b.toFixed(0)}, vrij ${m.zone.top.toFixed(0)} tot ${m.zone.bottom.toFixed(0)})`);
  const bedekt = [...m.bedekt];
  if (m.geometrisch) {
    const teHoogNaast = ['rechts', 'links'].includes(m.kant) && verwacht.b - verwacht.t > m.zone.bottom - m.zone.top - 2 * MAAT.rand;
    const v = afgesneden ? { l: g.l, t: g.t, r: g.r, b: g.b } : teHoogNaast ? { ...d, b: Math.min(d.b, m.zone.bottom) } : d;
    if (Math.min(v.b, m.zone.top) - v.t > 1) bedekt.push('de vaste kop');
    if (m.balk && Math.min(v.b, m.balk.b) - Math.max(v.t, m.balk.t) > 1 && v.r > m.balk.l && v.l < m.balk.r) bedekt.push('de balk onderaan');
  }
  if (bedekt.length) f.push(`onderdeel bedekt door ${bedekt.join(', ')}`);
  return { fouten: f, afgesneden };
}

// ============================================================ de strenge meting (BESLISSINGEN 548, 570, 590 en 591)
// Per stap, in de pagina: (1) geen zichtbaar element (tekst, icoon, beeld, knop, geschilderd vlak of ::before/::after) wordt door een rand van
// het vak doorsneden, ook niet door een ronde hoek; (2) het vak en de uitlegkaart staan volledig tussen de vaste kop en de balk (op een lage
// telefoon mag de kaart over de balk), zonder overlap; (3) geen kop van de kaart buiten het vak terwijl de rest erin zit; (4) niets van dezelfde
// kaart steekt vlak boven of onder het vak half uit (half onder de kop, de balk of de uitlegkaart); (5) evenveel lucht links als rechts en boven
// als onder, gemeten vanaf de zichtbare inhoud; (6) geen vak zonder afronding; (7) het vak is helder (geen filter, geen vlak).
// Geeft { titel, tekst, label, deel, fouten, info }.
export function meetStreng() {
  const zicht = (e) => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && e.getClientRects().length > 0)) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05;
  };
  const doorz = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const geschilderd = (s) => !doorz(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && !doorz(s[`border${k}Color`]));
  const vind = (sel) => {
    if (!sel) return null;
    try { return [...document.querySelectorAll(sel)].find(zicht) || null; } catch { return null; }
  };
  const laag = document.querySelector('.uitleg[data-uitleg-laag]');
  const kaartEl = laag?.querySelector('.uitleg__kaart[role="dialog"]');
  if (!kaartEl) return { geenKaart: true };
  const gr = laag.querySelector('.uitleg__gat').getBoundingClientRect();
  const kr = kaartEl.getBoundingClientRect();
  const G = { l: gr.left, t: gr.top, r: gr.right, b: gr.bottom };
  const K = { l: kr.left, t: kr.top, r: kr.right, b: kr.bottom };
  const uit = { titel: kaartEl.querySelector('.uitleg__titel')?.textContent.trim(), tekst: kaartEl.querySelector('.uitleg__tekst')?.textContent.trim(), label: kaartEl.querySelector('.uitleg__stap')?.textContent.trim(), doel: kaartEl.dataset.doel || null, ook: kaartEl.dataset.ook || null, deel: kaartEl.dataset.deel || null, G, K, midden: laag.classList.contains('is-midden'), fouten: [], info: [] };
  if (uit.deel && / heel$/.test(uit.deel) && !uit.deel.startsWith('1/1 ')) uit.fouten.push('deel zonder eigen tekst (de hele tekst van de stap)');
  if (uit.deel && / vervolg$/.test(uit.deel)) uit.info.push('deel met vervolgtekst');
  if (uit.midden) return uit;
  // zone
  let kop = 0;
  for (const e of document.querySelectorAll('.demo-balk, .schermkop, .dagboek > .dagboek__kop, .vandaag > .vandaag__begroeting > .vandaag__logo')) {
    if (e.closest('dialog') || !zicht(e)) continue;
    const s = getComputedStyle(e);
    if (s.position !== 'sticky' && s.position !== 'fixed') continue;
    const r = e.getBoundingClientRect();
    if (r.top > innerHeight / 3) continue;
    let b = r.bottom;
    const ps = getComputedStyle(e, '::before');
    if (ps.content && ps.content !== 'none' && ps.position === 'absolute') {
      const T = parseFloat(ps.top), H = parseFloat(ps.height);
      if (Number.isFinite(T) && Number.isFinite(H)) b = Math.max(b, r.top + T + H);
    }
    kop = Math.max(kop, b);
  }
  const tab = document.getElementById('tabbalk');
  let balk = innerHeight;
  if (tab && getComputedStyle(tab).display !== 'none' && zicht(tab)) {
    const ps = getComputedStyle(tab, '::before');
    const r = tab.getBoundingClientRect();
    const T = parseFloat(ps.top);
    balk = ps.content && ps.content !== 'none' && Number.isFinite(T) ? Math.min(r.bottom, r.top + T) : r.top;
  }
  const el = vind(uit.doel);
  if (!el) { uit.fouten.push('doel niet gevonden'); return uit; }
  const ander = vind(uit.ook);
  const inDialog = el.closest('dialog');
  const inBalk = el.closest('#tabbalk, #zijbalk, .schermkop, .vandaag__begroeting, .dagboek__kop');
  const zone = inDialog || inBalk ? { t: inBalk && !el.closest('#tabbalk') ? 0 : kop, b: inDialog ? innerHeight : balk } : { t: kop, b: balk };
  if (el.closest('#tabbalk')) zone.b = innerHeight;
  uit.zone = zone;
  const tol = 1.5;
  if (G.t < zone.t - tol || G.b > zone.b + tol || G.l < -tol || G.r > innerWidth + tol) uit.fouten.push(`gat buiten de vrije zone (${G.t.toFixed(0)}-${G.b.toFixed(0)}, zone ${zone.t.toFixed(0)}-${zone.b.toFixed(0)})`);
  const kz = { t: (inBalk && !el.closest('#tabbalk')) || innerHeight < 600 ? 0 : kop, b: inDialog || innerHeight < 700 ? innerHeight : balk }; // BESLISSING 570: op een lage telefoon mag de kaart over de balk; BESLISSING 750 (K2): onder 600 px hoogte ook over de gedimde vaste kop
  if (K.t < kz.t - tol || K.b > kz.b + tol) uit.fouten.push(`uitlegkaart buiten de vrije zone (${K.t.toFixed(0)}-${K.b.toFixed(0)}, zone ${kz.t.toFixed(0)}-${kz.b.toFixed(0)})`);
  const over = (a, b, m = 1) => a.l < b.r - m && a.r > b.l + m && a.t < b.b - m && a.b > b.t + m;
  if (over(G, K)) uit.fouten.push('gat en uitlegkaart overlappen');
  // doelvak tegenover gat: het doel moet volledig in het gat
  // visuele eenheden
  const voorouders = new Set();
  for (const x of [el, ander]) for (let e = x?.parentElement; e; e = e.parentElement) voorouders.add(e);
  if (uit.deel) voorouders.add(el); // een deel: het doel is de hele kaart
  const vastO = (x) => { for (let e = x; e && e !== document.body; e = e.parentElement) { if (e.tagName === 'DIALOG' && e.open) return e; const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e; } return null; };
  const elVast = vastO(el);
  const scope = inDialog || elVast || document.getElementById('app');
  const eenheden = [];
  // (T2) het zichtbare deel binnen de schuivende houders (overflow auto of scroll) tot de scope: wat een houder buiten zijn venster houdt of
  // achter de vaste voet of kop van het blad laat schuiven (het lijf van de supplementkaart onder Bewaren), is niet te zien en telt niet als doorsneden.
  const inRol = (e, R) => {
    let r = { ...R };
    for (let x = e.parentElement; x && x !== scope.parentElement; x = x.parentElement) {
      const sx = getComputedStyle(x);
      if (!/auto|scroll/.test(sx.overflowX + ' ' + sx.overflowY)) continue;
      const q = x.getBoundingClientRect();
      const l = q.left + x.clientLeft, t = q.top + x.clientTop;
      r = { l: Math.max(r.l, l), t: Math.max(r.t, t), r: Math.min(r.r, l + x.clientWidth), b: Math.min(r.b, t + x.clientHeight) };
    }
    return r;
  };
  // (T6) de scheidingslijnen die op een telefoon niet als eenheid tellen; ze tellen wel mee voor de marge als ze BINNEN de inhoud liggen
  const lijnenTel = [];
  // (T3) een vlak of knop zonder vulling en schaduw, alleen geschilderd door een rand aan één of enkele kanten (een rij met een lijn erboven)
  const alleenRand = (s) => doorz(s.backgroundColor) && s.backgroundImage === 'none' && s.boxShadow === 'none' && !['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s[`border${k}Width`]) > 0 && !doorz(s[`border${k}Color`]));
  for (const e of scope.querySelectorAll('*')) {
    if (voorouders.has(e) || e.closest('.uitleg, svg > *, .uitleg__ruimte')) continue;
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    const tag = e.tagName.toLowerCase();
    let soort = null;
    const vlakE = geschilderd(getComputedStyle(e));
    if (['img', 'svg', 'canvas', 'input', 'textarea', 'select', 'video'].includes(tag) || (tag === 'button' && vlakE)) soort = tag;
    else if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) soort = 'tekst';
    else if (vlakE) soort = 'vlak';
    // een geschilderde ::before of ::after (het rondje van vandaag), met zijn verschuiving
    if (zicht(e)) for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(e, p);
      if (!ps.content || ps.content === 'none' || ps.content === 'normal' || !['absolute', 'fixed'].includes(ps.position) || !geschilderd(ps)) continue;
      const r0 = e.getBoundingClientRect();
      const [L, T, Wd, H] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(ps[k]));
      if (![L, T, Wd, H].every(Number.isFinite)) continue;
      const mt = /^matrix\(([^)]+)\)$/.exec(ps.transform || '');
      const [dx, dy] = mt ? mt[1].split(',').slice(4).map(parseFloat) : [0, 0];
      const l0 = r0.left + (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) + L + dx, t0 = r0.top + (parseFloat(getComputedStyle(e).borderTopWidth) || 0) + T + dy;
      eenheden.push({ e, soort: 'vlak' + p, R: { l: l0, t: t0, r: l0 + Wd, b: t0 + H } });
    }
    if (!soort || !zicht(e)) continue;
    // binnen een knop telt de knop
    const kn = e.parentElement?.closest('button');
    // (T3) op een telefoon telt een knop die alleen een lijn heeft (button.rij in Algemeen) niet als volle doos: dan tellen zijn tekst en icoon zelf
    if (kn && !voorouders.has(kn) && geschilderd(getComputedStyle(kn)) && !(innerWidth < 720 && alleenRand(getComputedStyle(kn)))) continue;
    // de balk en de koppen zelf (vast) tellen niet voor een doel in de pagina
    const r = e.getBoundingClientRect();
    let R = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    if (soort === 'tekst') {
      const rg = document.createRange();
      rg.selectNodeContents(e);
      const rr = rg.getBoundingClientRect();
      if (rr.width > 0) R = getComputedStyle(e).overflow === 'visible' ? { l: rr.left, t: rr.top, r: rr.right, b: rr.bottom } : { l: Math.max(rr.left, r.left), t: Math.max(rr.top, r.top), r: Math.min(rr.right, r.right), b: Math.min(rr.bottom, r.bottom) };
      // BESLISSING 592, op een telefoon: wat een ouder met overflow: hidden afknipt (een tweede regel "Aan de beurt" in een smalle rij), is niet te zien
      if (innerWidth < 720) for (let x = e.parentElement; x && x !== scope; x = x.parentElement) { const sx = getComputedStyle(x); if (/hidden|clip/.test(sx.overflowX) || /hidden|clip/.test(sx.overflowY)) { const q = x.getBoundingClientRect(); R = { l: Math.max(R.l, q.left), t: Math.max(R.t, q.top), r: Math.min(R.r, q.right), b: Math.min(R.b, q.bottom) }; } }
    }
    if (R.b <= 0 || R.t >= innerHeight) continue;
    // BESLISSING 592, op een telefoon: wat je echt ziet. Een element dat alleen door een rand aan één of enkele kanten geschilderd is (een rij met
    // een lijn erboven), telt met die randen; een scheidingslijn van hoogstens 2 px zonder tekst telt niet (zoals in meetMaten en rondleiding.js).
    // (T3) ook een knop met alleen een lijn (button.rij): zijn tekst en icoon tellen dan zelf (hierboven), de knop alleen met zijn randen.
    if (innerWidth < 720 && (soort === 'vlak' || soort === 'button')) {
      const s = getComputedStyle(e);
      const kant = ['Top', 'Right', 'Bottom', 'Left'].map((k) => (parseFloat(s[`border${k}Width`]) > 0 && !doorz(s[`border${k}Color`]) ? parseFloat(s[`border${k}Width`]) : 0));
      if (alleenRand(s)) {
        const [bt, br, bb, bl] = kant;
        const delen = [bt && { l: R.l, t: R.t, r: R.r, b: R.t + bt }, bb && { l: R.l, t: R.b - bb, r: R.r, b: R.b }, bl && { l: R.l, t: R.t, r: R.l + bl, b: R.b }, br && { l: R.r - br, t: R.t, r: R.r, b: R.b }].filter(Boolean);
        for (const D of delen) {
          if (Math.min(D.r - D.l, D.b - D.t) > 2.01) eenheden.push({ e, soort: 'rand', R: D });
          else lijnenTel.push(D);
        }
        continue;
      }
    }
    if (innerWidth < 720 && soort !== 'tekst' && Math.min(R.r - R.l, R.b - R.t) <= 2.01) {
      lijnenTel.push(R);
      continue;
    }
    eenheden.push({ e, soort, R });
  }
  const naam = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')) + (e.textContent?.trim() ? ` "${e.textContent.trim().slice(0, 24)}"` : '');
  const vastHouder = inBalk || null;
  const m = 2.5;
  const buitenDoel = eenheden.filter(({ e, R }) => (el.contains(e) || (ander && ander.contains(e))) && !(R.l < G.r - m && R.r > G.l + m && R.t < G.b - m && R.b > G.t + m));
  if (buitenDoel.length && !uit.deel) uit.fouten.push('doel niet volledig in het gat: ' + buitenDoel.slice(0, 3).map((x) => naam(x.e)).join(' | '));
  const doorsneden = [];
  // BESLISSINGEN 651 en 656: een deel van de maandkalender wordt per ontwerp tussen twee weken gesneden. Een geschilderd vlak (het raster) dat de
  // boven- of onderrand van het vak kruist, telt dan niet als doorsneden, maar ALLEEN in een deel, alleen boven of onder, en alleen als die rand
  // in de tussenruimte valt: geen enkele eenheid binnen het vlak steekt meer dan 2 px over die lijn. Een snede DOOR een rij blijft een fout.
  const tussenSnede = (e, soort, R) => {
    if (!uit.deel || soort !== 'vlak' || R.l < G.l - m || R.r > G.r + m) return false;
    const lijnen = [G.t, G.b].filter((y) => R.t < y - m && R.b > y + m);
    const kind = eenheden.filter((u) => u.e !== e && e.contains(u.e));
    return lijnen.length > 0 && kind.length > 0 && lijnen.every((y) => kind.every(({ R: Q }) => Q.b <= y + 2 || Q.t >= y - 2));
  };
  for (const { e, soort, R: R1 } of eenheden) {
    const R = inRol(e, R1); // (T2) alleen het zichtbare deel
    if (R.r - R.l <= 0.5 || R.b - R.t <= 0.5) continue;
    const binnen = R.l < G.r - m && R.r > G.l + m && R.t < G.b - m && R.b > G.t + m;
    const buiten = R.l < G.l - m || R.r > G.r + m || R.t < G.t - m || R.b > G.b + m;
    if (binnen && buiten) {
      // een vast element (balk, kop) dat over de pagina ligt, telt niet voor een doel in de pagina
      if (!inDialog && !inBalk && e.closest('#tabbalk, #zijbalk, .schermkop, .vandaag__begroeting, .dagboek__kop')) continue;
      if (!elVast && vastO(e)) continue;
      if (vastHouder && !vastHouder.contains(e)) continue;
      if (tussenSnede(e, soort, R)) { uit.info.push(`snede tussen twee rijen van ${naam(e).split(' ')[0]}`); continue; }
      doorsneden.push(`${soort} ${naam(e)}`);
    }
  }
  // De ronde hoeken van het gat: snijdt een hoek iets af dat binnen het gat staat?
  const rad = parseFloat(getComputedStyle(laag.querySelector('.uitleg__gat')).borderTopLeftRadius) || 0;
  if (rad > 2) {
    const hoeken = [[G.l + rad, G.t + rad, -1, -1], [G.r - rad, G.t + rad, 1, -1], [G.l + rad, G.b - rad, -1, 1], [G.r - rad, G.b - rad, 1, 1]];
    for (const { e, R } of eenheden) {
      if (!(R.l >= G.l - m && R.r <= G.r + m && R.t >= G.t - m && R.b <= G.b + m)) continue;
      const es = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0;
      const inz = Math.min(es * 0.3, (R.r - R.l) / 2, (R.b - R.t) / 2) + 1.5;
      const punten = [[R.l + inz, R.t + inz], [R.r - inz, R.t + inz], [R.l + inz, R.b - inz], [R.r - inz, R.b - inz]];
      const af = punten.some(([x, y]) => hoeken.some(([cx, cy, sx, sy]) => (x - cx) * sx > 0 && (y - cy) * sy > 0 && Math.hypot(x - cx, y - cy) > rad + 1));
      if (af) doorsneden.push(`hoek van het gat over ${naam(e)}`);
    }
  }
  if (doorsneden.length) uit.fouten.push(`doorsneden:${doorsneden.slice(0, 6).join(' | ')}${doorsneden.length > 6 ? ` (+${doorsneden.length - 6})` : ''}`);
  // de kaart van het doel
  let kaart = null;
  for (let e = el; e && e !== scope && e !== document.body; e = e.parentElement) {
    if (e.matches('dialog, #scherm, #app')) break;
    const s = getComputedStyle(e);
    if (geschilderd(s) && !['fixed', 'sticky'].includes(s.position)) { kaart = e; break; }
    if (e.matches('.kaart, [class*="kaart"]:not([class*="__"])')) { kaart = e; break; }
  }
  if (kaart) {
    const k = kaart.getBoundingClientRect();
    uit.kaart = naam(kaart).split(' ')[0];
    const heel = k.top >= G.t - 3 && k.bottom <= G.b + 3 && k.left >= G.l - 3 && k.right <= G.r + 3;
    if (!heel) {
      uit.info.push(`deel van ${uit.kaart}`);
      const kopEl = kaart.querySelector(':scope > .kaartkop, :scope > header, :scope > h2, :scope > h3, :scope > [class*="__kop"]');
      if (!uit.deel && kopEl && kopEl !== el && !el.contains(kopEl) && !kopEl.contains(el) && !(ander && (ander === kopEl || kopEl.contains(ander)))) {
        const kk = kopEl.getBoundingClientRect();
        const inG = kk.top >= G.t - 3 && kk.bottom <= G.b + 3;
        const ov = Math.max(0, Math.min(k.bottom, G.b) - Math.max(k.top, G.t)) / k.height;
        if (!inG && ov > 0.5) uit.fouten.push(`kop buiten het vak (${naam(kopEl)})`);
      }
      const half = [];
      for (const { e, R } of eenheden) {
        if (!kaart.contains(e)) continue;
        if (over(R, G, 0)) continue;
        if (!((R.b > G.t - 24 && R.t < G.t + 1) || (R.t < G.b + 24 && R.b > G.b - 1))) continue; // alleen vlak boven of onder het vak
        // BESLISSING 656: in een deel is de buurrij die net niet in het vak zit (hoogstens 3 px van de rand: de helft van de tussenruimte, met
        // afronding) het begin van het volgende deel, niet half uitstekend. Een element dat verder weg half onder de kaart ligt, blijft een fout.
        if (uit.deel && (R.t >= G.b - 0.5 && R.t - G.b <= 3 || R.b <= G.t + 0.5 && G.t - R.b <= 3)) continue;
        // zichtbaar deel: zonder wat de vaste kop, de balk en de uitlegkaart afdekken
        const dek = [[-1e6, zone.t], [zone.b, 1e6], ...(R.r > K.l && R.l < K.r ? [[K.t, K.b]] : [])].sort((a, b) => a[0] - b[0]);
        let zichtH = R.b - R.t, tot = R.t;
        for (const [a, z] of dek) { const van = Math.max(a, tot), naar = Math.min(z, R.b); if (naar > van) { zichtH -= naar - van; tot = naar; } }
        if (zichtH > 2 && zichtH < R.b - R.t - 1) half.push(naam(e));
      }
      if (half.length) uit.fouten.push(`half uitstekend van dezelfde kaart: ${half.slice(0, 4).join(' | ')}${half.length > 4 ? ` (+${half.length - 4})` : ''}`);
    }
  }
  // BESLISSING 590: geen recht vak, en evenveel lucht links als rechts en boven als onder, gemeten vanaf de zichtbare inhoud
  // (R6) een gat dat na zelf scrollen 0 hoog (of smaller dan 2 px) is, kan geen afronding van 1 px tonen: er is geen vak te zien
  // (T2, BESLISSING 628) de zijbalk (of de tabbalk) die vast tegen de schermrand ligt, licht recht op, gelijk met die rand, zoals goedgekeurd:
  // alleen als het vak precies op die balk valt en de balk de rand van het scherm raakt. Een rij in de inhoud blijft een fout.
  const opRandBalk = ['zijbalk', 'tabbalk'].some((id) => {
    const b = document.getElementById(id);
    if (!b || !zicht(b) || !['fixed', 'sticky'].includes(getComputedStyle(b).position)) return false;
    const r = b.getBoundingClientRect();
    const opBalk = Math.abs(r.left - G.l) < 1.5 && Math.abs(r.right - G.r) < 1.5 && Math.abs(r.top - G.t) < 1.5 && Math.abs(r.bottom - G.b) < 1.5;
    return opBalk && (r.left <= 0.5 || r.top <= 0.5 || r.right >= innerWidth - 0.5 || r.bottom >= innerHeight - 0.5);
  });
  if (rad < 1 && Math.min(G.r - G.l, G.b - G.t) >= 2 && !opRandBalk) uit.fouten.push('vak zonder afronding');
  const elR = el.getBoundingClientRect();
  const opRand = geschilderd(getComputedStyle(el)) && Math.abs(elR.left - G.l) < 1.5 && Math.abs(elR.right - G.r) < 1.5 && Math.abs(elR.top - G.t) < 1.5 && Math.abs(elR.bottom - G.b) < 1.5;
  // (T2) ook hier alleen het zichtbare deel: wat achter de voet van een blad schuift, is geen inhoud van het vak
  const binnenG = eenheden.map((u) => ({ ...u, R: inRol(u.e, u.R) })).filter(({ R }) => R.r - R.l > 0.5 && R.b - R.t > 0.5 && R.l >= G.l - 1 && R.r <= G.r + 1 && R.t >= G.t - 1 && R.b <= G.b + 1);
  if (!opRand && !inBalk && binnenG.length) {
    let c = binnenG.reduce((a, { R }) => ({ l: Math.min(a.l, R.l), t: Math.min(a.t, R.t), r: Math.max(a.r, R.r), b: Math.max(a.b, R.b) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
    // (T6) een scheidingslijn BINNEN de inhoud (de lijn onder de kop van een kaart) hoort bij de breedte, zoals in rondleiding.js (inktVan) en M3 van
    // meetMaten; een lijn op de buitenrand (boven een rij) niet. Anders telt "Zo ziet het eruit" rechts 17,6 waar het oog 12 en 12 ziet.
    const k0 = { ...c };
    for (const R of lijnenTel) {
      if (!(R.l >= G.l - 1 && R.r <= G.r + 1 && R.t >= G.t - 1 && R.b <= G.b + 1)) continue;
      const liggend = R.b - R.t <= R.r - R.l;
      if (liggend ? R.t > k0.t + 0.5 && R.b < k0.b - 0.5 : R.l > k0.l + 0.5 && R.r < k0.r - 0.5) c = { l: Math.min(c.l, R.l), t: Math.min(c.t, R.t), r: Math.max(c.r, R.r), b: Math.max(c.b, R.b) };
    }
    const [ml, mr, mt, mb] = [c.l - G.l, G.r - c.r, c.t - G.t, G.b - c.b];
    uit.marges = [ml, mr, mt, mb].map((x) => Math.round(x * 10) / 10);
    // Valt een kant van het vak op de rand van de kaart (of van het geschilderde doel), dan is de marge daar 0 tegenover die rand en dat is juist:
    // dat paar (links/rechts of boven/onder) wordt dan niet vanaf de inhoud vergeleken. Alleen bij een echte samenval (1,5 px) met een rand die het
    // vak ook raakt; een vak met 8 links en 20 rechts dat op geen kaartrand valt, blijft een fout.
    const randen = [kaart, el, ander].filter((x) => x && geschilderd(getComputedStyle(x))).map((x) => x.getBoundingClientRect());
    const op = {
      l: randen.some((q) => Math.abs(q.left - G.l) < 1.5 && q.top < G.b - 1 && q.bottom > G.t + 1),
      r: randen.some((q) => Math.abs(q.right - G.r) < 1.5 && q.top < G.b - 1 && q.bottom > G.t + 1),
      t: randen.some((q) => Math.abs(q.top - G.t) < 1.5 && q.left < G.r - 1 && q.right > G.l + 1),
      b: randen.some((q) => Math.abs(q.bottom - G.b) < 1.5 && q.left < G.r - 1 && q.right > G.l + 1),
    };
    // BESLISSING 656: in een deel valt de snede tussen twee rijen (weken) per ontwerp; die kant is dan ook geen marge vanaf de inhoud. Alleen als
    // het doel voorbij die kant doorloopt, de inhoud hoogstens 3 px van de snede eindigt en de volgende rij binnen 3 px na de snede begint.
    const binnenEl = eenheden.filter((u) => el.contains(u.e));
    if (uit.deel && !op.b && elR.bottom > G.b + m && mb <= 3 && binnenEl.some((u) => u.R.t >= G.b - 0.5 && u.R.t <= G.b + 3)) op.b = 'snede';
    if (uit.deel && !op.t && elR.top < G.t - m && mt <= 3 && binnenEl.some((u) => u.R.b <= G.t + 0.5 && u.R.b >= G.t - 3)) op.t = 'snede';
    uit.opKaartRand = op;
    if ((!op.l && !op.r && Math.abs(ml - mr) > 1.5) || (!op.t && !op.b && Math.abs(mt - mb) > 1.5)) uit.fouten.push(`ongelijke marge (links ${ml.toFixed(1)}, rechts ${mr.toFixed(1)}, boven ${mt.toFixed(1)}, onder ${mb.toFixed(1)})`);
  }
  const gs = getComputedStyle(laag.querySelector('.uitleg__gat'));
  if ((gs.backdropFilter && gs.backdropFilter !== 'none') || !doorz(gs.backgroundColor)) uit.fouten.push(`gat niet helder: backdrop-filter ${gs.backdropFilter}, vlak ${gs.backgroundColor}`);
  return uit;
}

// ============================================================ de vaste maten van de aanduiding (BESLISSING 592)
// Per stap, in de pagina, als getallen (getallen) en fouten met de regel vooraan (M1 tot M7):
//  M1 gatKaart: de zichtbare ruimte tussen het vak en de uitlegkaart als ze boven elkaar staan: 12 px (11 tot 13). Meer alleen bij een vast
//     onderdeel (de balk, de kop, een blad dat niet verder kan schuiven) of als de pagina niet verder kan schuiven.
//  M2 gatKop en gatBalk: minstens 12 px (11) tot de vaste kop en tot de balk onderaan als de kaart daar niet tussen ligt; minstens 8 px tot de
//     zijranden van het scherm; in een blad minstens 8 px tot de randen van het venster.
//  M3 lucht links, rechts, boven en onder: van de uiterste zichtbare inkt binnen het vak (tekst, icoon, beeld, veld, tegel met haar vlak, een
//     rand van minstens 3 px) tot de rand van het vak: alle vier 12 px (11 tot 13) of alle vier 6 px (5 tot 7). Een scheidingslijn (een rand of
//     element van hoogstens 2 px dik, zonder tekst) is geen inkt en geen buur. Valt het vak op de rand van een geschilderd vlak (een hele kaart,
//     de balk), dan geldt de binnenruimte van dat vlak (opKaart) en de straal van dat vlak.
//  M4 straal: alle vier de hoeken even rond: 16 px, of de straal van het vlak waarop het vak valt.
//  M5 niets doorsneden (ook geen scheidingslijn die de zijkant kruist), en wat van dezelfde kaart buiten het vak valt, is ofwel helemaal te zien
//     op minstens 12 px (11) van het vak, ofwel helemaal verborgen (achter de vaste kop, de balk, de uitlegkaart of buiten beeld).
//  M6 de tekst noemt geen rij of kop van dezelfde kaart die niet in het vak staat.
//  M7 de uitlegkaart staat links en rechts even ver van de schermrand; onderaan (of bovenaan) staat ze even ver van de balk (of de kop) als van
//     de zijrand, tenzij ze voor M5 moest wijken (info: kaart verschoven).
// Geeft { getallen, fouten, info }. Alleen op een telefoon (smaller dan 720 px) worden de regels getoetst; op een groter scherm alleen gemeten.
export function meetMaten() {
  const W = innerWidth;
  const H = innerHeight;
  const laag = document.querySelector('.uitleg[data-uitleg-laag]');
  const kaartEl = laag?.querySelector('.uitleg__kaart[role="dialog"]');
  if (!kaartEl) return { geenKaart: true, fouten: ['geen kaart'], info: [] };
  const uit = { fouten: [], info: [], getallen: {} };
  if (laag.classList.contains('is-midden')) return uit;
  const telefoon = W < 720;
  const doorz = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const zicht = (e) => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && e.getClientRects().length > 0)) return false;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden') return false;
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) if (parseFloat(getComputedStyle(x).opacity) <= 0.05) return false;
    return true;
  };
  const px = (v) => parseFloat(v) || 0;
  const rd = (x) => Math.round(x * 10) / 10;
  const gatEl = laag.querySelector('.uitleg__gat');
  const gs = getComputedStyle(gatEl);
  const gr = gatEl.getBoundingClientRect();
  const kr = kaartEl.getBoundingClientRect();
  const G = { l: gr.left, t: gr.top, r: gr.right, b: gr.bottom };
  const K = { l: kr.left, t: kr.top, r: kr.right, b: kr.bottom };
  const tekst = (kaartEl.querySelector('.uitleg__tekst')?.textContent || '').trim();
  const vind = (sel) => {
    if (!sel) return null;
    try {
      return [...document.querySelectorAll(sel)].find(zicht) || null;
    } catch {
      return null;
    }
  };
  const el = vind(kaartEl.dataset.doel);
  if (!el) {
    uit.fouten.push('M0 doel niet gevonden');
    return uit;
  }
  const ander = vind(kaartEl.dataset.ook);
  const vastO = (x) => {
    for (let e = x; e && e !== document.body; e = e.parentElement) {
      if (e.tagName === 'DIALOG' && e.open) return e;
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') return e;
    }
    return null;
  };
  const blad = el.closest('dialog[open]');
  const vast = vastO(el);
  // de vaste kop en de balk onderaan (zoals rondleiding.js ze leest)
  let kop = 0;
  for (const e of document.querySelectorAll('.demo-balk, .schermkop, .dagboek > .dagboek__kop, .vandaag > .vandaag__begroeting > .vandaag__logo')) {
    if (e.closest('dialog') || !zicht(e)) continue;
    const s = getComputedStyle(e);
    if (s.position !== 'sticky' && s.position !== 'fixed') continue;
    const r = e.getBoundingClientRect();
    if (r.top > H / 3) continue;
    let b = r.bottom;
    const ps = getComputedStyle(e, '::before');
    if (ps.content && ps.content !== 'none' && ps.position === 'absolute') {
      const T = parseFloat(ps.top);
      const Hh = parseFloat(ps.height);
      if (Number.isFinite(T) && Number.isFinite(Hh)) b = Math.max(b, r.top + T + Hh);
    }
    kop = Math.max(kop, b);
  }
  const tab = document.getElementById('tabbalk');
  let balk = H;
  if (tab && getComputedStyle(tab).display !== 'none' && zicht(tab)) {
    const ps = getComputedStyle(tab, '::before');
    const r = tab.getBoundingClientRect();
    const T = parseFloat(ps.top);
    balk = ps.content && ps.content !== 'none' && Number.isFinite(T) ? Math.min(r.bottom, r.top + T) : r.top;
  }
  // ---- de zichtbare inkt van een element: een lijst van { R, soort } (tekst, beeld, vlak, rand, lijn)
  const rect = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  // wat het element zelf (een tekst met een beletselteken) of een ouder met overflow afknipt (een scrollvak in een blad)
  const knip = (e, R, alleenZelf = false) => {
    let r = { ...R };
    for (let x = e; x && x !== document.body; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      // alleenZelf: alleen wat echt weg is (overflow: hidden of clip); wat een schuivende houder buiten beeld houdt, telt M5 met de randen van het blad
      if (alleenZelf && !(/hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY))) continue;
      const q = x.getBoundingClientRect();
      r = { l: Math.max(r.l, q.left), t: Math.max(r.t, q.top), r: Math.min(r.r, q.right), b: Math.min(r.b, q.bottom) };
      if (x.tagName === 'DIALOG') break;
    }
    return r;
  };
  function inkt(e) {
    const lijst = [];
    const tag = e.tagName.toLowerCase();
    if (tag !== 'svg' && e.closest('svg')) return lijst;
    if (!zicht(e)) return lijst;
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const vol = !doorz(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none';
    const zijden = ['Top', 'Right', 'Bottom', 'Left'].map((k) => (px(s[`border${k}Width`]) > 0 && !doorz(s[`border${k}Color`]) ? px(s[`border${k}Width`]) : 0));
    // een vulling alleen binnen een doorzichtige rand (background-clip: padding-box, de ronde knoppen in een tikvlak van 48 px): het vak binnen die rand
    const doorzRand = ['Top', 'Right', 'Bottom', 'Left'].map((k) => (doorz(s[`border${k}Color`]) ? px(s[`border${k}Width`]) : 0));
    if (vol && s.backgroundClip === 'padding-box' && s.boxShadow === 'none' && doorzRand.some((z) => z > 0) && zijden.every((z) => z === 0)) {
      const [bt, br, bb, bl] = doorzRand;
      lijst.push({ R: { l: r.left + bl, t: r.top + bt, r: r.right - br, b: r.bottom - bb }, soort: 'vlak', straal: Math.max(0, px(s.borderTopLeftRadius) - Math.max(bt, bl)) });
    } else if (['img', 'svg', 'canvas', 'video', 'input', 'textarea', 'select'].includes(tag) || vol || zijden.every((z) => z > 0)) {
      lijst.push({ R: rect(r), soort: vol || zijden.every((z) => z > 0) ? 'vlak' : 'beeld', straal: px(s.borderTopLeftRadius) });
    } else if (zijden.some((z) => z > 0)) {
      const [bt, br, bb, bl] = zijden;
      if (bt) lijst.push({ R: { l: r.left, t: r.top, r: r.right, b: r.top + bt }, soort: 'rand' });
      if (bb) lijst.push({ R: { l: r.left, t: r.bottom - bb, r: r.right, b: r.bottom }, soort: 'rand' });
      if (bl) lijst.push({ R: { l: r.left, t: r.top, r: r.left + bl, b: r.bottom }, soort: 'rand' });
      if (br) lijst.push({ R: { l: r.right - br, t: r.top, r: r.right, b: r.bottom }, soort: 'rand' });
    }
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(e, p);
      if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || !['absolute', 'fixed'].includes(ps.position)) continue;
      if (doorz(ps.backgroundColor) && ps.backgroundImage === 'none' && ps.boxShadow === 'none' && !['Top', 'Right', 'Bottom', 'Left'].some((k) => px(ps[`border${k}Width`]) > 0 && !doorz(ps[`border${k}Color`]))) continue;
      const bl = px(s.borderLeftWidth);
      const bt = px(s.borderTopWidth);
      const bB = r.width - bl - px(s.borderRightWidth);
      const bH = r.height - bt - px(s.borderBottomWidth);
      const [L, Rr, T, B, Wd, Hh] = ['left', 'right', 'top', 'bottom', 'width', 'height'].map((k) => parseFloat(ps[k]));
      const l0 = Number.isFinite(L) ? L : Number.isFinite(Rr) && Number.isFinite(Wd) ? bB - Rr - Wd : NaN;
      const t0 = Number.isFinite(T) ? T : Number.isFinite(B) && Number.isFinite(Hh) ? bH - B - Hh : NaN;
      const w0 = Number.isFinite(Wd) ? Wd : bB - L - Rr;
      const h0 = Number.isFinite(Hh) ? Hh : bH - T - B;
      if (![l0, t0, w0, h0].every(Number.isFinite) || w0 <= 0 || h0 <= 0) continue;
      const m = /^matrix\(([^)]+)\)$/.exec(ps.transform || '');
      const [dx, dy] = m ? m[1].split(',').slice(4).map(parseFloat) : [0, 0];
      const L2 = r.left + bl + l0 + (dx || 0);
      const T2 = r.top + bt + t0 + (dy || 0);
      lijst.push({ R: { l: L2, t: T2, r: L2 + w0, b: T2 + h0 }, soort: 'vlak', pseudo: p, straal: px(ps.borderTopLeftRadius) });
    }
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) if (q.width > 0.5 && q.height > 0) lijst.push({ R: rect(q), soort: 'tekst' });
    }
    return lijst
      .map((x) => ({ ...x, R0: knip(e, x.R, true), R: knip(e, x.R) }))
      .filter((x) => x.R.r - x.R.l > 0.5 && x.R.b - x.R.t > 0.5)
      .map((x) => ({ ...x, soort: x.soort !== 'tekst' && Math.min(x.R.r - x.R.l, x.R.b - x.R.t) <= 2.01 ? 'lijn' : x.soort }));
  }
  const naam = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '')) + (e.textContent?.trim() ? ` "${e.textContent.trim().slice(0, 20)}"` : '');
  // alle eenheden in de houder van het doel (een blad, een vaste balk, anders de app zonder wat vast over de pagina ligt)
  // (een element dat zelf plakt, zoals de knoppen in de kop van Vandaag: zijn buren staan in de vaste kop eromheen)
  const houder = blad || (vast && (el.closest('#tabbalk, #zijbalk, .schermkop, .vandaag__begroeting, .dagboek__kop, .demo-balk') || vast.parentElement)) || document.getElementById('app') || document.body;
  // het zichtbare deel van een blad dat schuift (wat erbuiten valt, is verborgen)
  let rol = null;
  if (blad) {
    for (let x = el.parentElement; x; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (/(auto|scroll|hidden)/.test(s.overflowY)) {
        const q = x.getBoundingClientRect();
        rol = { top: Math.max(0, q.top + x.clientTop), bottom: Math.min(H, q.top + x.clientTop + x.clientHeight), x };
        break;
      }
      if (x === blad) break;
    }
  }
  const units = [];
  for (const e of [houder, ...houder.querySelectorAll('*')]) {
    if (e.closest('.uitleg, .uitleg__ruimte')) continue;
    if (!vast && vastO(e)) continue;
    for (const x of inkt(e)) units.push({ e, ...x });
  }
  const tol = 1;
  const binnen = (R) => R.l >= G.l - tol && R.r <= G.r + tol && R.t >= G.t - tol && R.b <= G.b + tol;
  const raakt = (R, m = 2.5) => R.l < G.r - m && R.r > G.l + m && R.t < G.b - m && R.b > G.t + m;
  const omvat = (R) => R.l <= G.l + tol && R.r >= G.r - tol && R.t <= G.t + tol && R.b >= G.b - tol;
  // ---- M4 de straal van elke hoek
  const straal = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => rd(px(gs[`border${k}Radius`])));
  // ---- opKaart: het vak valt op de rand van een geschilderd vlak
  const opVlak = units.find((u) => u.soort === 'vlak' && Math.abs(u.R.l - G.l) <= 1.5 && Math.abs(u.R.r - G.r) <= 1.5 && Math.abs(u.R.t - G.t) <= 1.5 && Math.abs(u.R.b - G.b) <= 1.5);
  // ---- M3 de lucht: van de uiterste inkt in het vak (een scheidingslijn alleen als ze BINNEN de inkt ligt: de lijn onder een kop telt mee voor
  // de breedte, een lijn op de rand niet)
  const inVak0 = units.filter((u) => binnen(u.R) && !omvat(u.R) && u.soort !== 'lijn');
  let c = inVak0.length ? inVak0.reduce((a, { R }) => ({ l: Math.min(a.l, R.l), t: Math.min(a.t, R.t), r: Math.max(a.r, R.r), b: Math.max(a.b, R.b) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 }) : null;
  const inVak = [...inVak0];
  if (c) {
    const k0 = { ...c };
    for (const u of units) {
      if (u.soort !== 'lijn' || !binnen(u.R) || omvat(u.R)) continue;
      const R = u.R;
      const liggend = R.b - R.t <= R.r - R.l;
      if (liggend ? R.t > k0.t + 0.5 && R.b < k0.b - 0.5 : R.l > k0.l + 0.5 && R.r < k0.r - 0.5) {
        inVak.push(u);
        c = { l: Math.min(c.l, R.l), t: Math.min(c.t, R.t), r: Math.max(c.r, R.r), b: Math.max(c.b, R.b) };
      }
    }
  }
  const lucht = c ? [c.l - G.l, G.r - c.r, c.t - G.t, G.b - c.b].map(rd) : null;
  // ---- M1 en M2
  const naast = !(K.l >= G.r - 1 || K.r <= G.l + 1); // horizontaal overlappend: ze staan boven elkaar
  const kaartOnder = naast && K.t >= G.b - 1;
  const kaartBoven = naast && K.b <= G.t + 1;
  const gatKaart = kaartOnder ? K.t - G.b : kaartBoven ? G.t - K.b : K.l >= G.r ? K.l - G.r : G.l - K.r;
  const wortel = document.scrollingElement || document.documentElement;
  const maxScroll = wortel.scrollHeight - wortel.clientHeight;
  // de randen waartegen het vak minstens 12 px moet blijven: de vaste kop en de balk; in een blad de randen van zijn zichtbare deel
  const boven = rol ? rol.top : blad ? 0 : kop;
  const onder = rol ? rol.bottom : blad ? H : balk;
  const g = (uit.getallen = {
    gatKaart: rd(gatKaart),
    gatKop: (!vast || rol) && !kaartBoven ? rd(G.t - boven) : null,
    gatBalk: (!vast || rol) && !kaartOnder && onder < H + 0.5 && (rol || balk < H) ? rd(onder - G.b) : null,
    zijL: rd(G.l),
    zijR: rd(W - G.r),
    lucht,
    straal,
    opKaart: opVlak ? naam(opVlak.e) + (opVlak.pseudo || '') : null,
    kaartL: rd(K.l),
    kaartR: rd(W - K.r),
    kaartOnder: kaartOnder ? rd((H < 700 && K.b > balk + 1) || blad ? H - K.b : balk - K.b) : null,
    kaartBoven: kaartBoven ? rd(H < 600 && K.t < kop - 1 ? K.t : K.t - kop) : null, // (BESLISSING 750: onder 600 px hoogte mag de kaart over de vaste kop)
    kant: kaartEl.dataset.kant,
    scrollY: rd(wortel.scrollTop),
    maxScroll: rd(maxScroll),
    vast: blad ? 'blad' : vast ? 'vast' : null,
  });
  if (!telefoon) return uit;
  // M1
  if (!kaartOnder && !kaartBoven) uit.fouten.push('M1 vak en uitlegkaart staan niet boven elkaar of overlappen');
  else if (gatKaart < 10.95) uit.fouten.push(`M1 vak en uitlegkaart te dicht (${rd(gatKaart)} px)`);
  else if (gatKaart > 13.05) {
    let mag = false;
    let waarom = '';
    if (blad) {
      // een blad: mag alleen als het blad zelf niet verder kan schuiven in de richting die het vak naar de kaart brengt
      const sc = rol && rol.x.scrollHeight > rol.x.clientHeight + 1 ? rol.x : null;
      mag = !(sc && (kaartOnder ? sc.scrollTop > 0.5 : sc.scrollTop < sc.scrollHeight - sc.clientHeight - 0.5));
      waarom = 'blad dat niet verder schuift';
    } else if (vast) {
      mag = true;
      waarom = 'vast onderdeel';
    } else {
      mag = kaartOnder ? wortel.scrollTop <= 0.5 : wortel.scrollTop >= maxScroll - 0.5;
      waarom = 'pagina kan niet verder schuiven';
    }
    if (mag) uit.info.push(`M1 ruimer (${rd(gatKaart)} px): ${waarom}`);
    else uit.fouten.push(`M1 vak en uitlegkaart te ver uit elkaar (${rd(gatKaart)} px)`);
  }
  // M2
  if (g.gatKop != null && g.gatKop < 11) uit.fouten.push(`M2 vak te dicht bij de ${blad ? 'bovenrand van het blad' : 'vaste kop'} (${g.gatKop} px)`);
  if (g.gatBalk != null && g.gatBalk < 11) uit.fouten.push(`M2 vak te dicht bij de ${blad ? 'onderrand van het blad' : 'balk onderaan'} (${g.gatBalk} px)`);
  // (niet voor een vak op de rand van een vaste balk die zelf tot bij de zijrand loopt: het vak kan niet kleiner zijn dan die balk)
  if ((G.l < 7.5 || W - G.r < 7.5) && !(opVlak && vast)) uit.fouten.push(`M2 vak te dicht bij de zijrand (links ${g.zijL}, rechts ${g.zijR})`);
  // M3 en M4
  if (opVlak) {
    const verwacht = Math.min(opVlak.straal ?? 16, (G.r - G.l) / 2, (G.b - G.t) / 2);
    if (straal.some((s) => Math.abs(s - verwacht) > 0.6)) uit.fouten.push(`M4 straal ${straal.join('/')} op een vlak met straal ${rd(verwacht)}`);
    uit.info.push(`M3 op de rand van ${g.opKaart}`);
  } else {
    if (!lucht) uit.fouten.push('M3 geen inkt in het vak');
    else {
      // boven en onder evenveel; links en rechts: de kleinste even groot als boven en onder (een label mag links tot de lucht lopen)
      const band = (x) => (x >= 11 && x <= 13 ? 12 : x >= 5 && x <= 7 ? 6 : null);
      const zij = Math.min(lucht[0], lucht[1]);
      if (band(lucht[2]) == null || band(lucht[2]) !== band(lucht[3]) || band(zij) !== band(lucht[2])) uit.fouten.push(`M3 lucht links ${lucht[0]}, rechts ${lucht[1]}, boven ${lucht[2]}, onder ${lucht[3]}`);
      // Een raster (minstens drie even grote tegels naast elkaar, zoals de dranken): links en rechts evenveel ruimte tussen de tegels en de rand van
      // het vak, hoogstens 2 px verschil (melding van de eigenaar over de tegels van Drinken). Tekst onder een tegel telt hier niet: die is per
      // tegel anders breed.
      const tegels = inVak0.filter((u) => u.soort === 'vlak' && u.R.r - u.R.l >= 24 && u.R.b - u.R.t >= 24);
      const rijen = [];
      for (const u of tegels.sort((p, q) => p.R.t - q.R.t)) {
        const rij = rijen.find((r) => Math.abs(r.t - u.R.t) <= 2 && Math.abs(r.w - (u.R.r - u.R.l)) <= 2 && Math.abs(r.h - (u.R.b - u.R.t)) <= 2);
        if (rij) rij.units.push(u);
        else rijen.push({ t: u.R.t, w: u.R.r - u.R.l, h: u.R.b - u.R.t, units: [u] });
      }
      for (const rij of rijen) {
        if (rij.units.length < 3) continue;
        const l = Math.min(...rij.units.map((u) => u.R.l)) - G.l;
        const r = G.r - Math.max(...rij.units.map((u) => u.R.r));
        g.raster = [rd(l), rd(r)];
        if (Math.abs(l - r) > 2) uit.fouten.push(`M3 raster niet gecentreerd in het vak (links ${rd(l)}, rechts ${rd(r)})`);
      }
      // de eis van de teamlead (17 november): minstens 12 px van inkt tot vakrand aan elke kant; 592 laat 6 px toe als 12 niet past: gemeld, geen fout
      if (lucht.some((x) => x < 11)) uit.onder12 = lucht;
    }
    if (straal.some((s) => Math.abs(s - 16) > 0.6)) uit.fouten.push(`M4 straal ${straal.join('/')} i.p.v. 16`);
  }
  // M5 doorsneden: een eenheid die de rand van het vak kruist (een scheidingslijn alleen als ze er echt doorheen loopt)
  const sneden = units.filter((u) => raakt(u.R) && !binnen(u.R) && !omvat(u.R) && !(u.soort === 'lijn' && !raakt(u.R, 0.5)));
  const echt = sneden.filter((u) => !(u.e.contains(el) || (ander && u.e.contains(ander))) || u.soort === 'tekst');
  if (echt.length) uit.fouten.push(`M5 doorsneden: ${[...new Set(echt.map((u) => naam(u.e)))].slice(0, 4).join(' | ')}`);
  // ... en de ronde hoeken over iets wat in het vak staat
  const rad = straal[0];
  if (rad > 1) {
    const hoeken = [[G.l + rad, G.t + rad, -1, -1], [G.r - rad, G.t + rad, 1, -1], [G.l + rad, G.b - rad, -1, 1], [G.r - rad, G.b - rad, 1, 1]];
    const af = inVak0.filter(({ R, straal: es = 0 }) => {
      const inz = Math.min(es * 0.3, (R.r - R.l) / 2, (R.b - R.t) / 2) + 1;
      return [[R.l + inz, R.t + inz], [R.r - inz, R.t + inz], [R.l + inz, R.b - inz], [R.r - inz, R.b - inz]].some(([x, y]) => hoeken.some(([cx, cy, sx, sy]) => (x - cx) * sx > 0 && (y - cy) * sy > 0 && Math.hypot(x - cx, y - cy) > rad + 0.5));
    });
    if (af.length) uit.fouten.push(`M5 een ronde hoek snijdt ${naam(af[0].e)}`);
  }
  // M5 dezelfde kaart buiten het vak: helemaal te zien op minstens 12 px, of helemaal verborgen. Wat de opmaak van de app zelf dichter dan
  // lucht + 12 px bij de inkt van het blok zet, kan geen plaatsing oplossen: dat staat apart als M5L (de ruimte in de opmaak), met de maat.
  // (een onderdeel in de vaste kop of de balk: die kop of balk is zijn kaart)
  // (in een blad: de rij of het veld waarin het onderdeel staat, de eerste ouder over de volle breedte van een houder met minstens drie
  // zichtbare blokken onder elkaar; zoals kaartVan in rondleiding.js)
  let rijInBlad = null;
  if (blad && !el.closest('.kaart')) {
    const kinderenVan = (x) => [...x.children].flatMap((k) => (getComputedStyle(k).display === 'contents' ? kinderenVan(k) : [k]));
    for (let e = el; e && e !== blad; e = e.parentElement) {
      const ouder = e.parentElement;
      if (!ouder || ouder === blad) break;
      if (kinderenVan(ouder).filter(zicht).length >= 3 && e.getBoundingClientRect().width >= 0.9 * ouder.getBoundingClientRect().width) {
        rijInBlad = e;
        break;
      }
    }
  }
  let kaart = rijInBlad || blad || (vast && el.closest('#tabbalk, #zijbalk, .schermkop, .vandaag__begroeting, .dagboek__kop, .demo-balk')) || null;
  if (!kaart) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.matches('#scherm, #app')) break;
      const s = getComputedStyle(e);
      if (e.matches('.kaart') || (e !== el && !doorz(s.backgroundColor) && !['fixed', 'sticky'].includes(s.position))) {
        kaart = e;
        break;
      }
    }
  }
  if (kaart) {
    const dek = [[-1e6, rol ? rol.top : blad || vast ? 0 : kop], [rol ? rol.bottom : blad || vast ? H : balk, 1e6], [-1e6, 0], [H, 1e6]];
    const C = opVlak || !c ? G : c;
    // onoplosbaar: dichter dan de kleinste lucht (6, of 0 op de rand van een kaart) plus de kleinste ruimte tot de uitlegkaart (11) min 1 px
    const drempel = (opVlak ? 0 : 6) + 11 - 1;
    const half = [];
    const dicht = [];
    const opmaak = [];
    // (T5) de inkt van een regel tekst, niet haar regelhoogte: een tekstvak loopt van de hoogste tot de laagste rand van het lettertype, maar de
    // letters zelf beginnen lager (bij een schuine Cormorant enkele px). Valt alleen die lege strook achter de kop (24,2 van 26 px bij een volledig
    // leesbare zin), dan is niets half te zien. Gemeten met de hoogste en laagste letter van de hele tekst (ruim: de inkt is nooit kleiner dan echt).
    // Klopt de hoogte van het tekstvak niet met het lettertype (afgeknipt), dan blijft het hele tekstvak tellen.
    const meetCtx = document.createElement('canvas').getContext('2d');
    const inktRegel = (e, R) => {
      const s = getComputedStyle(e);
      let woorden = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
      if (s.textTransform === 'uppercase') woorden = woorden.toUpperCase();
      if (!woorden) return R;
      meetCtx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const m = meetCtx.measureText(woorden);
      const fa = m.fontBoundingBoxAscent;
      const fd = m.fontBoundingBoxDescent;
      if (![fa, fd, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent].every(Number.isFinite) || Math.abs(fa + fd - (R.b - R.t)) > 1.5) return R;
      const basis = R.t + fa;
      return { ...R, t: Math.max(R.t, basis - m.actualBoundingBoxAscent), b: Math.min(R.b, basis + m.actualBoundingBoxDescent) };
    };
    for (const u of units) {
      if (!kaart.contains(u.e) || u.soort === 'lijn' || binnen(u.R) || raakt(u.R) || omvat(u.R) || u.e.contains(el) || (ander && u.e.contains(ander))) continue;
      if (vast && !blad && !vastO(u.e)) continue; // wat in de vaste kop staat maar met de pagina meeschuift (de begroeting), hoort niet bij de kop
      const R = u.R0 || u.R; // het hele element: wat een blad afknipt, is verborgen (dek), niet weg
      const d = [...dek, ...(R.r > K.l && R.l < K.r ? [[K.t, K.b]] : [])].sort((a, b) => a[0] - b[0]);
      const Ri = u.soort === 'tekst' ? inktRegel(u.e, R) : R; // (T5) half zichtbaar: de inkt, niet de regelhoogte
      let zichtH = Ri.b - Ri.t;
      let tot = Ri.t;
      for (const [a, z] of d) {
        const van = Math.max(a, tot);
        const naar = Math.min(z, Ri.b);
        if (naar > van) {
          zichtH -= naar - van;
          tot = naar;
        }
      }
      if (zichtH <= 1.5) continue; // een strook van hoogstens 1,5 px (afronding, onder de schaduw van de uitlegkaart) is niet te zien
      const ruimte = Math.max(C.t - R.b, R.t - C.b, C.l - R.r, R.l - C.r);
      const tekst = (lijst, x) => lijst.push(`${naam(u.e)} (${x})`);
      if (zichtH < Ri.b - Ri.t - 1.5) {
        // een buur NAAST het blok die verder doorloopt dan de 12 px tot de uitlegkaart, wordt altijd door de kaart gesneden
        const naastBlok = R.t < G.b && R.b > G.t && (kaartOnder ? R.b > G.b + 12 : kaartBoven ? R.t < G.t - 12 : false);
        if (ruimte < drempel || naastBlok) tekst(opmaak, naastBlok ? 'naast het blok, door de uitlegkaart gesneden' : `half, ${rd(ruimte)} px van de inkt`);
        else tekst(half, `${rd(zichtH)} van ${rd(Ri.b - Ri.t)} px`);
        continue;
      }
      const afstand = Math.max(G.t - R.b, R.t - G.b, G.l - R.r, R.l - G.r);
      if (afstand < 11) {
        // helemaal te zien: onoplosbaar als ze dichter staat dan de kleinste lucht plus 11 px
        if (ruimte < drempel + 1) tekst(opmaak, `${rd(afstand)} px van het vak, ${rd(ruimte)} px van de inkt`);
        else tekst(dicht, `${rd(afstand)} px`);
      }
    }
    if (half.length) uit.fouten.push(`M5 half zichtbaar van dezelfde kaart: ${[...new Set(half)].slice(0, 4).join(' | ')}`);
    if (dicht.length) uit.fouten.push(`M5 te dicht bij het vak, van dezelfde kaart: ${[...new Set(dicht)].slice(0, 4).join(' | ')}`);
    if (opmaak.length) uit.uitzonderingen = [`M5L de opmaak zet een buur te dicht bij het blok: ${[...new Set(opmaak)].slice(0, 4).join(' | ')}`];
    // M6 de tekst noemt een rij, een knop of een naam van dezelfde kaart die niet in het vak staat
    const klein = tekst.toLowerCase();
    const genoemd = [];
    for (const n of kaart.querySelectorAll('.rij__titel, .momentrij__naam, [class*="__naam"], button, a')) {
      const woord = [...n.querySelectorAll('*'), n]
        .flatMap((x) => [...x.childNodes].filter((y) => y.nodeType === 3))
        .map((x) => x.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (woord.length < 4 || /^[\d\s,.]+$/.test(woord)) continue;
      // in het vak: de letters zelf (een kop is als link soms breder dan zijn tekst)
      const rg = document.createRange();
      rg.selectNodeContents(n);
      const letters = rg.getBoundingClientRect();
      if (zicht(n) && binnen(letters.width > 0 ? rect(letters) : rect(n.getBoundingClientRect()))) continue;
      const veilig = woord.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^a-z\\u00e0-\\u00ff])${veilig}([^a-z\\u00e0-\\u00ff]|$)`).test(klein)) genoemd.push(woord);
    }
    if (genoemd.length) uit.fouten.push(`M6 de tekst noemt ${[...new Set(genoemd)].join(', ')}, niet in het vak`);
  }
  // M7
  if (Math.abs(K.l - (W - K.r)) > 1) uit.fouten.push(`M7 uitlegkaart niet gecentreerd (links ${g.kaartL}, rechts ${g.kaartR})`);
  if (g.kaartOnder != null && Math.abs(g.kaartOnder - K.l) > 1) uit.info.push(`M7 kaart verschoven (onderaan ${g.kaartOnder} px, zijkant ${g.kaartL})`);
  if (g.kaartBoven != null && Math.abs(g.kaartBoven - K.l) > 1) uit.info.push(`M7 kaart verschoven (bovenaan ${g.kaartBoven} px, zijkant ${g.kaartL})`);
  return uit;
}
