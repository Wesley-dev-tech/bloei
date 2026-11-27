// De glazen druppel rond de actieve tab van de tabbalk (BESLISSING 753, naar het voorbeeld van de tabbalk van de App Store, Liquid Glass van Apple).
// De druppel is één element in de balk; zijn plaats en breedte komen van de actieve tab (--lens-x en --lens-b, via el.style.setProperty,
// want de Content-Security-Policy laat geen style-attributen toe). De opmaak staat in layout.css; de balk zelf verandert niet van maat.
//
// const zetLens = koppelGlaslens(tabbalk);  // eenmaal, bij het bouwen van de schil
// zetLens();                                // na elke wissel van aria-current
//
// De eerste keer (en na een periode zonder zichtbare balk) staat de druppel meteen op zijn plaats; daarna glijdt hij (data-lens="glijdt").
// Verandert de maat van de balk of van een tab (draaien, breekpunt van 720 px, lettergrootte), dan volgt hij zonder te glijden.
export function koppelGlaslens(balk) {
  const lens = document.createElement('span');
  lens.className = 'tabbalk__lens';
  lens.setAttribute('aria-hidden', 'true');
  balk.prepend(lens);

  let geplaatst = false;

  const plaats = (glijden) => {
    const actief = balk.querySelector('.tabbalk__item[aria-current="page"]');
    if (balk.hidden || !actief || !actief.offsetWidth) {
      balk.removeAttribute('data-lens');
      geplaatst = false;
      return;
    }
    if (!glijden || !geplaatst) balk.setAttribute('data-lens', 'vast');
    // De druppel is overal even groot (BESLISSING 753) en ligt rond het icoon van de actieve tab: 14 px links en rechts en 5 px boven en onder het icoon
    // (bij iconen van 24 px dus 52 x 34 px), gecentreerd op het icoon; het label
    // eronder licht op in de kleur van het tabblad. Zo raakt hij nooit een buur, de rand van het glas of zijn eigen label.
    const glas = getComputedStyle(balk, '::before');
    const min = (parseFloat(glas.left) || 0) + 4;
    const max = balk.clientWidth - (parseFloat(glas.right) || 0) - 4;
    const vak = balk.getBoundingClientRect();
    const ic = actief.querySelector('.navicoon').getBoundingClientRect();
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

  return () => plaats(true);
}
