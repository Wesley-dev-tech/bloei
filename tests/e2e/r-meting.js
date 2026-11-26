// Metingen voor de responsive-tests (BESLISSING 308). Elke functie draait in de pagina en geeft een lijst met bevindingen terug (leeg = goed).
import { wachtTotStil } from './r-wacht.js';

const KLIKBAAR = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary';

// Horizontale scroll van de pagina.
export const horizontaleScroll = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth > window.innerWidth + 1 ? [`scrollWidth ${d.scrollWidth} > ${window.innerWidth}`] : [];
  });

// Elementen die rechts (of links) buiten het venster vallen, behalve die in een bewust scrollende of afkappende houder.
export const buitenVenster = (page) =>
  page.evaluate(() => {
    const b = window.innerWidth;
    const uit = [];
    const klipt = (e) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible' || s.clipPath !== 'none') {
          const r = p.getBoundingClientRect();
          if (r.right <= b + 1 && r.left >= -1) return true;
        }
      }
      return false;
    };
    for (const e of document.querySelectorAll('#scherm *, #tabbalk *')) {
      const s = getComputedStyle(e);
      if (s.position === 'fixed' || s.visibility === 'hidden' || s.display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if ((r.right > b + 1 || r.left < -1) && !klipt(e)) uit.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return uit.slice(0, 12);
  });

// Tekst die midden in een woord afbreekt (een woord dat over twee regels loopt), tekst die wordt afgekapt (overflow), en regels van tekst die over een icoon lopen.
export const afbrekingen = (page, wortel = '#scherm') =>
  page.evaluate((sel) => {
    const uit = [];
    const houder = document.querySelector(sel);
    const lopen = document.createTreeWalker(houder, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = lopen.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest('textarea, [hidden], .is-meet, .alleen-lezer')) continue;
      const stijl = getComputedStyle(el);
      if (stijl.visibility === 'hidden' || stijl.display === 'none') continue;
      const t = n.textContent;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(t))) {
        const bereik = document.createRange();
        bereik.setStart(n, m.index);
        bereik.setEnd(n, m.index + m[0].length);
        const rects = [...bereik.getClientRects()].filter((r) => r.width > 0);
        if (rects.length > 1 && Math.abs(rects[0].top - rects[rects.length - 1].top) > 4) {
          if (el.closest('.maand__notitie, .veld__vak')) continue;
          uit.push(`woord afgebroken: "${m[0]}" in ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
        }
      }
    }
    // afgekapte tekst: een element met overflow dat meer inhoud heeft dan ruimte, in koppen, labels, knoppen en rijtitels
    for (const e of houder.querySelectorAll('h1, h2, h3, button, .label, .rij__titel, .rij__sub, .kaartkop *, .tab, .knop, .dagdrank__naam, .momentrij *, a')) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || e.getBoundingClientRect().width < 1 || e.closest('.alleen-lezer')) continue; // BESLISSING 495: de volle periode voor een schermlezer is niet zichtbaar
      if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && (s.overflowX !== 'visible' || s.textOverflow === 'ellipsis')) {
        uit.push(`afgekapt (overflow): ${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} "${(e.textContent || '').trim().slice(0, 30)}" ${e.scrollWidth}>${e.clientWidth}`);
      }
    }
    return uit.slice(0, 15);
  }, wortel);

// Labels naast elkaar (zelfde rij) met een ongelijk aantal regels.
export const ongelijkeLabels = (page) =>
  page.evaluate(() => {
    const uit = [];
    for (const groep of document.querySelectorAll('.dagdranken, .drankrij, .motiv__vakken')) {
      const regels = [...groep.querySelectorAll('.dagdrank__naam, .drankknop__naam, .motiv__label')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
        const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2;
        return Math.round(e.getBoundingClientRect().height / lh);
      });
      if (regels.length > 1 && new Set(regels).size > 1) uit.push(`${groep.className}: ${regels.join(',')} regels`);
    }
    return uit;
  });

// Tikdoelen kleiner dan 44 px of dichter dan 8 px op elkaar. Een verborgen invoerveld in een groter label telt niet.
export const tikdoelen = (page, { minimum = 44, wortel = 'body' } = {}) =>
  page.evaluate(
    ([sel, min, houder]) => {
      const uit = [];
      const lijst = [];
      for (const e of document.querySelector(houder).querySelectorAll(sel)) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || s.pointerEvents === 'none') continue;
        let r = e.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) continue;
        if ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label, button')) {
          const l = e.closest('label, button');
          r = l.getBoundingClientRect();
        }
        if (e.closest('[hidden], .is-meet')) continue;
        // een onzichtbare laag (::after) van minstens het minimum is het tikvlak
        const na = getComputedStyle(e, '::after');
        if (na.position === 'absolute' && na.content !== 'none' && parseFloat(na.width) >= min - 0.5 && parseFloat(na.height) >= min - 0.5) continue;
        // buiten het zichtbare deel van een scrollende houder telt niet
        lijst.push({ e, r });
        // een kalendercel mag 40 px zijn (BESLISSING 308); in de slide-over van 320 px laat de schermmarge van 20 px (layout.css) geen 40 px toe: daar 34 px
        // de drie icoonknoppen in de compacte schermkop (Rondleiding, Delen, huisje) zijn sinds 0.3.8 met opzet 40 px (eigenaar, 26 november 2026)
        const eis = e.matches('.kalender__dag, .mk__dag') ? (window.innerWidth < 340 ? 34 : 40) : e.matches('.schermkop .icoonknop') ? Math.min(min, 40) : min;
        // BESLISSING 524: de zeven week-stippen op een rij zijn onder 370 px zo breed als hun kolom (minstens 32 px), minstens 43,5 px hoog (z-tikvlakken-smal.spec.js)
        const eisB = e.matches('a.week__link') && window.innerWidth < 370 ? 32 : eis;
        if (r.width < eisB - 0.5 || r.height < eis - 0.5) uit.push(`klein ${Math.round(r.width)}x${Math.round(r.height)}: ${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}"`);
      }
      for (let i = 0; i < lijst.length; i++) {
        for (let j = i + 1; j < lijst.length; j++) {
          const a = lijst[i];
          const b = lijst[j];
          if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
          if (a.e.matches('.kalender__dag, .mk__dag') && b.e.matches('.kalender__dag, .mk__dag')) continue; // het raster van een kalender heeft zijn eigen tussenruimte
          // BESLISSING 524: de week-stippen onder 370 px liggen naast elkaar in hun eigen kolom, zonder overlap (z-tikvlakken-smal.spec.js bewaakt dat)
          if (window.innerWidth < 370 && a.e.matches('a.week__link') && b.e.matches('a.week__link')) continue;
          // twee volledige tikvlakken (minstens 44 px) die elkaar bijna raken, zoals rijen in een lijst, zijn geen probleem; een klein doel dicht bij een ander wel
          if (Math.min(a.r.width, a.r.height) >= min && Math.min(b.r.width, b.r.height) >= min) continue;
          const dx = Math.max(a.r.left - b.r.right, b.r.left - a.r.right);
          const dy = Math.max(a.r.top - b.r.bottom, b.r.top - a.r.bottom);
          if (dx < 8 && dy < 0 && dx > 0.5) uit.push(`dicht (${Math.round(dx)} px): ${a.e.className.toString().split(' ')[0]} / ${b.e.className.toString().split(' ')[0]}`);
          else if (dy < 8 && dx < 0 && dy > 0.5) uit.push(`dicht (${Math.round(dy)} px): ${a.e.className.toString().split(' ')[0]} / ${b.e.className.toString().split(' ')[0]}`);
        }
      }
      return uit.slice(0, 20);
    },
    [KLIKBAAR, minimum, wortel],
  );

// Scrolt naar onder en meet of de onderkant van de laatste kaart boven de tabbalk (of het venster) blijft.
export const laatsteKaartZichtbaar = async (page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // meten als de pagina niet meer schuift (een vlotte scroll of een kop die meeschuift; geen vaste wachttijd)
  return wachtTotStil(page, () => page.evaluate(() => {
    const kaarten = [...document.querySelectorAll('#scherm .kaart')].filter((k) => k.offsetParent !== null && k.getBoundingClientRect().height > 0);
    if (!kaarten.length) return [];
    const onder = Math.max(...kaarten.map((k) => k.getBoundingClientRect().bottom));
    const tab = document.querySelector('#tabbalk');
    const grens = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : window.innerHeight;
    return onder > grens + 0.5 ? [`laatste kaart eindigt op ${Math.round(onder)}, tabbalk/venster begint op ${Math.round(grens)}`] : [];
  }));
};

// Kaarten in één rij (zelfde bovenkant) die niet gelijk eindigen.
export const ongelijkeRijen = (page) =>
  page.evaluate(() => {
    const uit = [];
    const kaarten = [...document.querySelectorAll('#scherm .kaart')]
      .filter((k) => k.offsetParent !== null && !k.parentElement.closest('.kaart') && k.getBoundingClientRect().height > 0)
      .map((k) => ({ k, r: k.getBoundingClientRect() }));
    for (let i = 0; i < kaarten.length; i++) {
      for (let j = i + 1; j < kaarten.length; j++) {
        const a = kaarten[i].r;
        const b = kaarten[j].r;
        const naastElkaar = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 20 && (a.right <= b.left + 1 || b.right <= a.left + 1);
        if (naastElkaar && Math.abs(a.top - b.top) <= 2 && Math.abs(a.bottom - b.bottom) > 2) {
          const nm = (k) => k.className.split(' ').filter((c) => c !== 'kaart').slice(0, 2).join('.') || 'kaart';
          uit.push(`${nm(kaarten[i].k)} (${Math.round(a.bottom)}) / ${nm(kaarten[j].k)} (${Math.round(b.bottom)})`);
        }
      }
    }
    return uit;
  });

// De "te brede telefoonrij": een rij breder dan 720 px (zo breed worden telefoonrijen op een tablet niet bedoeld).
export const teBreedRij = (page, max = 740) =>
  page.evaluate((m) => {
    const uit = [];
    for (const e of document.querySelectorAll('#scherm .rij, #scherm .momentrij, #scherm .maaltijd > .rij, #scherm .dagdranklijst__rij, #scherm .afvinkrij')) {
      const r = e.getBoundingClientRect();
      if (r.width > m && e.offsetParent !== null) uit.push(`${e.className.toString().split(' ')[0]} ${Math.round(r.width)} px`);
    }
    return uit.slice(0, 8);
  }, max);

// Alle kaarten van het scherm met hun plaats en maat, voor de vergelijking vóór en na op 1690 px.
export const kaartPlaatsen = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#scherm .kaart, #scherm h1, #scherm .schermkop')]
      .filter((k) => k.getBoundingClientRect().width > 0)
      .map((k) => {
        const r = k.getBoundingClientRect();
        return `${k.className.toString().split(' ').slice(0, 2).join('.') || k.tagName} ${Math.round(r.left)},${Math.round(r.top + window.scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      }),
  );
