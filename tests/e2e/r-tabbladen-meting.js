// Hulp voor r-tabbladen-navigatie.spec.js (BESLISSING 308): verzonnen gegevens in drie soorten (leeg, gewoon, vol) voor Drinken,
// Supplementen en Gewicht, en een meting van de pagina die alles terugmeldt wat een responsive indeling kan misdoen.
// Het hulpbestand heeft geen tests; het wordt ook door een los verkenningsscript gebruikt.

export const SOORTEN = ['leeg', 'gewoon', 'vol'];

// Schrijft rechtstreeks in de opslag en herlaadt. De app moet één keer geopend zijn zodat de database bestaat.
export async function vulTabbladen(page, soort) {
  await page.evaluate(
    (s) =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const tekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const vandaag = tekst(nu);
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const winkels = ['dranken', 'wegingen', 'supplementen', 'momentinnames', 'instellingen'];
          const tx = idb.transaction(winkels, 'readwrite');
          for (const w of winkels.slice(0, 4)) tx.objectStore(w).clear();
          const soorten = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];
          const aantalD = s === 'vol' ? 14 : s === 'gewoon' ? 3 : 0;
          for (let i = 0; i < aantalD; i++) {
            tx.objectStore('dranken').add({ datum: vandaag, tijdstip: nu.getTime() - (aantalD - i) * 60000, soort: soorten[i % 6], ml: 200 + (i % 3) * 50, voorbeeld: false });
          }
          const aantalW = s === 'vol' ? 20 : s === 'gewoon' ? 5 : 0;
          for (let i = 0; i < aantalW; i++) {
            const d = new Date(nu);
            d.setDate(d.getDate() - 7 * (aantalW - 1 - i));
            const maandag = new Date(d);
            maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            tx.objectStore('wegingen').put({ week: tekst(maandag), datum: tekst(d), kg: 72 - i * 0.3 + Math.round(Math.sin(i) * 10) / 10, voorbeeld: false, gewijzigdOp: Date.now() });
          }
          const namen = ['Magnesiumbisglycinaat met extra vitamine B6 en zink', 'Vitamine D3', 'Omega 3 visolie met hoge dosis EPA en DHA', 'IJzer bisglycinaat', 'Foliumzuur', 'Probiotica voor de darmflora', 'Vitamine C met rozenbottel', 'Collageen peptiden poeder', 'Q10', 'Zink', 'Curcuma met zwarte peper', 'Vitamine B12 methylcobalamine', 'Selenium', 'Melatonine'];
          const momenten = ['ochtend', 'middag', 'avond'];
          const aantalS = s === 'vol' ? 14 : s === 'gewoon' ? 4 : 0;
          for (let i = 0; i < aantalS; i++) {
            const m = s === 'vol' ? (i % 4 === 3 ? ['middag', 'avond'] : [momenten[i % 3]]) : [momenten[i % 3]];
            tx.objectStore('supplementen').add({ naam: s === 'vol' ? namen[i] : namen[i].split(' ')[0], dosis: s === 'vol' ? '500 mg' : '', hoeveelheid: s === 'vol' ? '2 capsules' : '1 tablet', aanwijzing: s === 'vol' && i % 2 ? 'Bij de maaltijd innemen, niet samen met koffie' : '', momenten: m, ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          }
          if (s === 'vol') {
            tx.objectStore('supplementen').add({ naam: 'Spuit ijzer met een lange naam erbij', dosis: '', hoeveelheid: 'een volledige ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: vandaag }, volgorde: 99, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          }
          if (s !== 'leeg') {
            tx.objectStore('momentinnames').add({ datum: vandaag, supplementId: 1, moment: 'ochtend', tijdstip: Date.now(), voorbeeld: false });
            tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: 65 });
          } else {
            tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: null });
          }
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    soort,
  );
  await page.reload();
}

// Meet de pagina in één keer. Geeft een lijst "fouten" (korte tekst) en de ruwe tellingen terug.
export function meetPagina(page) {
  return page.evaluate(() => {
    const fouten = [];
    const breed = document.documentElement.clientWidth;
    const hoog = window.innerHeight;
    const zichtbaar = (e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const s = getComputedStyle(e);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const kort = (e) => {
      const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '';
      return `${e.tagName.toLowerCase()}${c ? '.' + c : ''}${e.id ? '#' + e.id : ''}`;
    };
    // Is e binnen een houder die bewust scrolt of afknipt?
    const inScrollHouder = (e) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX) && p.scrollWidth <= p.clientWidth + 1 === false) return true;
        if (['auto', 'scroll'].includes(s.overflowX)) return true;
      }
      return false;
    };
    const wortel = document.querySelector('#app') ?? document.body;
    const alle = [...wortel.querySelectorAll('*')].filter((e) => !e.closest('svg') || e.tagName.toLowerCase() === 'svg');

    // 1. horizontale scroll
    if (document.documentElement.scrollWidth > breed + 1) fouten.push(`horizontale scroll: ${document.documentElement.scrollWidth} > ${breed}`);

    // 2. buiten het venster
    for (const e of alle) {
      if (!zichtbaar(e)) continue;
      const r = e.getBoundingClientRect();
      if ((r.right > breed + 1 || r.left < -1) && !inScrollHouder(e) && getComputedStyle(e).position !== 'fixed') {
        fouten.push(`buiten venster: ${kort(e)} ${Math.round(r.left)}..${Math.round(r.right)} (venster ${breed})`);
        if (fouten.length > 40) break;
      }
    }

    // 3. afgekapte tekst en 4. een woord dat midden afbreekt
    const tekstElementen = alle.filter((e) => zichtbaar(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0));
    for (const e of tekstElementen) {
      const s = getComputedStyle(e);
      if (['hidden', 'clip'].includes(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && !e.closest('.sr-only, .visueel-verborgen') ) {
        fouten.push(`afgekapt: ${kort(e)} "${e.textContent.trim().slice(0, 30)}" ${e.scrollWidth}>${e.clientWidth}`);
      }
      if (['hidden', 'clip'].includes(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && s.webkitLineClamp === 'none') {
        fouten.push(`afgekapt hoogte: ${kort(e)} "${e.textContent.trim().slice(0, 30)}"`);
      }
      for (const n of e.childNodes) {
        if (n.nodeType !== 3) continue;
        const t = n.textContent;
        if (t.trim().length < 4 || t.length > 400) continue;
        const rg = document.createRange();
        let vorigeTop = null;
        let vorigeTeken = '';
        for (let i = 0; i < t.length; i++) {
          rg.setStart(n, i);
          rg.setEnd(n, i + 1);
          const rs = rg.getClientRects();
          if (!rs.length) { vorigeTeken = t[i]; continue; }
          const top = Math.round(rs[0].top);
          if (vorigeTop !== null && top > vorigeTop + 4 && /[\p{L}\p{N}]/u.test(t[i]) && /[\p{L}\p{N}]/u.test(vorigeTeken)) {
            fouten.push(`woord afgebroken: ${kort(e)} "${t.slice(Math.max(0, i - 8), i + 8)}"`);
            break;
          }
          if (!/\s/.test(t[i])) vorigeTop = top;
          vorigeTeken = t[i];
        }
      }
    }

    // 5. tikdoelen: minstens 44 x 44 (de onzichtbare tikvlakken van ::after tellen niet; die staan dan in "klein" voor handwerk)
    const klein = [];
    // Wat in een scrollende houder buiten haar zichtbare vlak ligt (de lange lijst van wegingen), telt niet mee.
    const afgeknipt = (e) => {
      const r = e.getBoundingClientRect();
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY) && p.scrollHeight > p.clientHeight + 1) {
          const pr = p.getBoundingClientRect();
          if (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) return true;
        }
      }
      return false;
    };
    const doelen = alle.filter((e) => !afgeknipt(e) && e.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=radio], [role=tab], [role=checkbox], summary') && zichtbaar(e));
    for (const e of doelen) {
      if (e.closest('[hidden]')) continue;
      // een omhullend label met invoer ervoor telt als één doel
      const r = e.getBoundingClientRect();
      let b = r.width;
      let hh = r.height;
      // een ::after-tikvlak dat buiten de knop reikt, telt mee; een tabelrij met een knop erin is zelf het tikdoel
      const na = getComputedStyle(e, '::after');
      if (na.content !== 'none' && na.position === 'absolute') {
        b = Math.max(b, parseFloat(na.width) || 0);
        hh = Math.max(hh, parseFloat(na.height) || 0);
      }
      const tr = e.closest('.overzicht__rij');
      if (tr) {
        const tb = tr.getBoundingClientRect();
        b = Math.max(b, tb.width);
        hh = Math.max(hh, tb.height);
      }
      const l = e.closest('label');
      if (l && l !== e) { const lr = l.getBoundingClientRect(); b = Math.max(b, lr.width); hh = Math.max(hh, lr.height); }
      if (b < 43.5 || hh < 43.5) klein.push(`${kort(e)} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}"`);
    }
    // 6. tikdoelen dichter dan 8 px op elkaar (zichtbare randen, naburige doelen)
    const dicht = [];
    const rechthoeken = doelen.filter((e) => !e.closest('label') || e.tagName !== 'INPUT').map((e) => [e, e.getBoundingClientRect()]);
    for (let i = 0; i < rechthoeken.length; i++) {
      for (let j = i + 1; j < rechthoeken.length; j++) {
        const [a, ra] = rechthoeken[i];
        const [c, rc] = rechthoeken[j];
        if (a.contains(c) || c.contains(a)) continue;
        if (a.closest('#tabbalk') !== c.closest('#tabbalk')) continue; // de vaste tabbalk ligt over scrollende inhoud: dat meet "onder de tabbalk" apart
        const dx = Math.max(rc.left - ra.right, ra.left - rc.right, 0);
        const dy = Math.max(rc.top - ra.bottom, ra.top - rc.bottom, 0);
        if (dx === 0 && dy === 0) {
          const ox = Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left);
          const oy = Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top);
          if (ox > 1 && oy > 1) dicht.push(`overlap ${kort(a)} / ${kort(c)}`);
          continue;
        }
        if (dx < 8 && dy < 8 && Math.hypot(dx, dy) < 8 && (dx === 0 || dy === 0 || true)) dicht.push(`${Math.round(Math.hypot(dx, dy))}px: ${kort(a)} / ${kort(c)}`);
      }
    }

    // 7. kaarten in één rij eindigen gelijk (zelfde ouder, zelfde top)
    const rijen = [];
    const kaarten = [...wortel.querySelectorAll('.kaart')].filter(zichtbaar);
    const perOuder = new Map();
    for (const k of kaarten) {
      const o = k.parentElement;
      if (!perOuder.has(o)) perOuder.set(o, []);
      perOuder.get(o).push(k);
    }
    for (const lijst of perOuder.values()) {
      for (const k of lijst) {
        const rk = k.getBoundingClientRect();
        for (const m of lijst) {
          if (m === k) continue;
          const rm = m.getBoundingClientRect();
          if (Math.abs(rm.top - rk.top) <= 2 && rm.left > rk.left + 20 && Math.abs(rm.bottom - rk.bottom) > 2) rijen.push(`ongelijk: ${kort(k)} ${Math.round(rk.bottom)} / ${kort(m)} ${Math.round(rm.bottom)}`);
        }
      }
    }

    // 8. tabbalk: labels
    const tabbalk = document.querySelector('#tabbalk');
    const tabs = tabbalk && zichtbaar(tabbalk) ? [...tabbalk.querySelectorAll('.tabbalk__item')].filter((e) => e.getClientRects().length > 0).map((e) => { const r = e.getBoundingClientRect(); const lab = e.querySelector('.tabbalk__label, span:last-child'); return { b: Math.round(r.width), h: Math.round(r.height), over: lab ? lab.scrollWidth > lab.clientWidth + 1 : false, tekst: (e.textContent || '').trim() }; }) : [];

    return { fouten, klein, dicht, rijen, tabs, breed, hoog, scrollHoogte: document.documentElement.scrollHeight, tabbalkTop: tabbalk && zichtbaar(tabbalk) ? Math.round(tabbalk.getBoundingClientRect().top) : null };
  });
}

// Leeg vlak per kaart: dezelfde meting als leeg-vlak.js (die niet wijzigt), maar over de hele pagina.
export function meetLeegVlak(page, wortel = '#scherm') {
  return page.evaluate((sel) => {
    const houder = document.querySelector(sel);
    const kaarten = [...houder.querySelectorAll('.kaart')].filter((k) => k.offsetParent !== null && !k.closest('.instelscherm'));
    return kaarten
      .map((k) => {
        const r = k.getBoundingClientRect();
        const stijl = getComputedStyle(k);
        const binnenTop = r.top + parseFloat(stijl.paddingTop);
        const binnenBodem = r.bottom - parseFloat(stijl.paddingBottom);
        const blokken = [];
        for (const e of k.querySelectorAll('*')) {
          if (e.closest('.kaartkop') && !e.classList.contains('kaartkop')) continue;
          const b = e.getBoundingClientRect();
          if (b.width < 1 || b.height < 1) continue;
          const kop = e.classList.contains('kaartkop');
          const toont = kop || e.children.length === 0 || ['svg', 'textarea', 'input', 'button'].includes(e.tagName.toLowerCase());
          if (!toont) continue;
          const onder = kop ? b.bottom + parseFloat(getComputedStyle(e).marginBottom) : b.bottom;
          blokken.push([Math.max(b.top, binnenTop), Math.min(onder, binnenBodem)]);
        }
        blokken.sort((a, b) => a[0] - b[0]);
        let gat = 0;
        let tot = binnenTop;
        for (const [van, naar] of blokken) {
          if (naar <= van) continue;
          gat = Math.max(gat, van - tot);
          tot = Math.max(tot, naar);
        }
        gat = Math.max(gat, binnenBodem - tot);
        const naam = [...k.classList].filter((c) => c !== 'kaart').join('.') || k.className;
        return { naam, gat: Math.round(gat), hoogte: Math.round(r.height), top: Math.round(r.top + window.scrollY), links: Math.round(r.left), breed: Math.round(r.width) };
      })
      .filter((m) => m.gat > 32);
  }, wortel);
}

// De posities en maten van de kaarten, de zijbalk en de kop (voor het bewijs dat 1690 px niet verschuift).
export function meetPosities(page) {
  return page.evaluate(() => {
    const uit = {};
    const noteer = (sleutel, e) => {
      if (!e) return;
      const r = e.getBoundingClientRect();
      uit[sleutel] = [Math.round(r.left * 10) / 10, Math.round((r.top + window.scrollY) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
    };
    noteer('zijbalk', document.querySelector('#zijbalk'));
    noteer('kop', document.querySelector('.schermkop'));
    noteer('scherm', document.querySelector('#scherm'));
    document.querySelectorAll('.schermkop button, .schermkop a, .schermkop h1').forEach((e, i) => noteer(`kop-${i}`, e));
    document.querySelectorAll('#zijbalk a, #zijbalk button').forEach((e, i) => noteer(`zij-${i}`, e));
    [...document.querySelectorAll('#scherm .kaart')].filter((k) => k.offsetParent !== null).forEach((k, i) => noteer(`kaart-${i}-${[...k.classList].filter((c) => c !== 'kaart')[0] ?? ''}`, k));
    return uit;
  });
}
