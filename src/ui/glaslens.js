// De glazen druppel rond de actieve tab van de tabbalk (BESLISSING 753, naar het voorbeeld van de tabbalk van de App Store, Liquid Glass van Apple).
// De druppel is één element in de balk; zijn plaats en breedte komen van de actieve tab (--lens-x en --lens-b, via el.style.setProperty,
// want de Content-Security-Policy laat geen style-attributen toe). De opmaak staat in layout.css; de balk zelf verandert niet van maat.
//
// const zetLens = koppelGlaslens(tabbalk);  // eenmaal, bij het bouwen van de schil
// zetLens();                                // na elke wissel van aria-current
//
// De eerste keer (en na een periode zonder zichtbare balk) staat de druppel meteen op zijn plaats; daarna glijdt hij (data-lens="glijdt").
// Verandert de maat van de balk of van een tab (draaien, breekpunt van 720 px, lettergrootte), dan volgt hij zonder te glijden.
//
// Vegen (BESLISSING 755): wie zijn vinger op de balk legt en opzij veegt, schuift de druppel mee onder de vinger (hij zwelt dan op, zoals bij
// Apple); bij het loslaten veert hij naar het tabblad onder de vinger en opent dat. Een gewone tik blijft een gewone tik (de link zelf). Alleen in de balk: de balk
// staat het vegen toe (touch-action: none in layout.css), de pagina scrolt zoals altijd.
export function koppelGlaslens(balk) {
  const lens = document.createElement('span');
  lens.className = 'tabbalk__lens';
  lens.setAttribute('aria-hidden', 'true');
  balk.prepend(lens);

  let geplaatst = false;

  const plaats = (glijden, doel = balk.querySelector('.tabbalk__item[aria-current="page"]')) => {
    if (balk.hidden || !doel || !doel.offsetWidth) {
      balk.removeAttribute('data-lens');
      geplaatst = false;
      return;
    }
    if (!glijden || !geplaatst) balk.setAttribute('data-lens', 'vast');
    // De druppel is overal even groot (BESLISSING 753) en ligt rond het icoon van de tab: 14 px links en rechts en 5 px boven en onder het icoon
    // (bij iconen van 24 px dus 52 x 34 px), gecentreerd op het icoon; het label eronder licht op in de kleur van het tabblad.
    // Zo raakt hij nooit een buur, de rand van het glas of zijn eigen label.
    const glas = getComputedStyle(balk, '::before');
    const min = (parseFloat(glas.left) || 0) + 4;
    const max = balk.clientWidth - (parseFloat(glas.right) || 0) - 4;
    const vak = balk.getBoundingClientRect();
    const ic = doel.querySelector('.navicoon').getBoundingClientRect();
    const B = Math.round(ic.height) + 28, H = Math.round(ic.height) + 10;
    const x = Math.min(Math.max(ic.left + ic.width / 2 - vak.left - B / 2, min), max - B);
    const y = ic.top + ic.height / 2 - vak.top - H / 2;
    lens.style.setProperty('--lens-x', `${x}px`);
    lens.style.setProperty('--lens-y', `${y}px`);
    lens.style.setProperty('--lens-b', `${B}px`);
    lens.style.setProperty('--lens-h', `${H}px`);
    if (!geplaatst || !glijden) {
      // Eerst zonder overgang neerzetten; pas twee beeldjes later mag hij weer glijden.
      geplaatst = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (balk.hasAttribute('data-lens')) balk.setAttribute('data-lens', 'glijdt');
      }));
    }
  };

  if (typeof ResizeObserver !== 'undefined') {
    const kijker = new ResizeObserver(() => plaats(false));
    kijker.observe(balk);
    balk.querySelectorAll('.tabbalk__item').forEach((tab) => kijker.observe(tab));
  }

  // Tijdens het vegen: de druppel rechtstreeks onder de vinger (zelfde hoogte en maat), binnen het glas.
  const volg = (clientX) => {
    const glas = getComputedStyle(balk, '::before');
    const min = (parseFloat(glas.left) || 0) + 4;
    const max = balk.clientWidth - (parseFloat(glas.right) || 0) - 4;
    const B = parseFloat(lens.style.getPropertyValue('--lens-b')) || 0;
    const x = Math.min(Math.max(clientX - balk.getBoundingClientRect().left - B / 2, min), max - B);
    lens.style.setProperty('--lens-x', `${x}px`);
  };

  koppelVegen(balk, plaats, volg);
  return () => plaats(true);
}

// Vegen over de balk. Pas na 8 px opzij wordt een aanraking een veeg; daarvoor blijft het een tik. Tijdens het vegen volgt de druppel de vinger
// rechtstreeks (volg, één keer per beeldje) en zwelt hij op (data-veeg op de balk); de tab onder de vinger licht op (data-veeg-doel). Bij het loslaten
// veert de druppel naar die tab en gaat de app erheen; de klik die de browser daarna nog stuurt, valt weg. Wordt de veeg afgebroken (pointercancel),
// dan veert de druppel terug naar de actieve tab.
function koppelVegen(balk, plaats, volg) {
  const DREMPEL = 8;
  let start = null; // { id, x }
  let veegt = false;
  let doel = null;
  let laatsteX = 0;
  let beeldje = 0;

  const tabOnder = (x) => {
    const tabs = [...balk.querySelectorAll('.tabbalk__item')].filter((t) => t.offsetWidth);
    let beste = null, afstand = Infinity;
    for (const t of tabs) {
      const r = t.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < afstand) { afstand = d; beste = t; }
    }
    return beste;
  };
  const zetDoel = (t) => {
    if (t === doel) return;
    doel?.removeAttribute('data-veeg-doel');
    doel = t;
    doel?.setAttribute('data-veeg-doel', '');
  };
  const teken = () => {
    beeldje = 0;
    if (!veegt) return;
    volg(laatsteX);
    zetDoel(tabOnder(laatsteX));
  };
  const stop = () => {
    if (beeldje) cancelAnimationFrame(beeldje);
    beeldje = 0;
    balk.removeAttribute('data-veeg');
    doel?.removeAttribute('data-veeg-doel');
    start = null;
    veegt = false;
    doel = null;
  };

  balk.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start = { id: e.pointerId, x: e.clientX };
  });
  balk.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!veegt) {
      if (Math.abs(e.clientX - start.x) < DREMPEL) return;
      veegt = true;
      balk.setAttribute('data-veeg', '');
      try { balk.setPointerCapture(e.pointerId); } catch { /* niet elke browser */ }
    }
    laatsteX = e.clientX;
    if (!beeldje) beeldje = requestAnimationFrame(teken);
  });
  balk.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!veegt) { stop(); return; } // een gewone tik: de link doet zijn werk
    teken();
    const naar = doel?.getAttribute('href');
    const bestemming = doel;
    // De klik die volgt op een veeg mag niet nog eens navigeren (eenmalig, in de opvangfase, en na een tel opgeruimd).
    const slik = (k) => { k.preventDefault(); k.stopPropagation(); };
    balk.addEventListener('click', slik, { capture: true, once: true });
    setTimeout(() => balk.removeEventListener('click', slik, { capture: true }), 400);
    stop();
    plaats(true, bestemming); // de druppel veert op zijn plaats
    if (naar && window.location.hash !== naar) window.location.hash = naar;
  });
  balk.addEventListener('pointercancel', () => {
    const was = veegt;
    stop();
    if (was) plaats(true);
  });
  // Een link die je met de muis versleept, start anders een sleepactie van de browser (die breekt de veeg af en slikt de klik in).
  balk.addEventListener('dragstart', (e) => e.preventDefault());
}
