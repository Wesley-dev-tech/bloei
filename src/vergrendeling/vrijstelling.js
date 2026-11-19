// Vrijstelling voor systeemvensters: het deelmenu, de bestandskiezer, het afdrukvenster en de vraag van het toestel voor Face ID
// halen de pagina even naar de achtergrond of nemen de focus weg. Zonder vrijstelling zou het slot (bij 'altijd') dan dicht gaan.
// Een vrijstelling is kort, expliciet, geldt alleen voor deze tab (module-staat) en heeft een maximum van enkele minuten.
// Gebruik: await metVrijstelling(() => navigator.share(...)); of installeerVrijstellingen() (de schil doet dat al voor
// navigator.share, window.print en elke bestandskiezer, dus de schermen hoeven niets te doen).

export const MAX_VRIJSTELLING_MS = 3 * 60 * 1000;
const NAZORG_MS = 1500; // een korte marge na afloop: de pagina komt net daarna weer in beeld
// BESLISSING 530: na de vraag van het toestel (Face ID, Windows Hello, vingerafdruk of schermslot) komt de pagina soms pas een paar seconden na het
// sluiten van het systeemvenster weer in beeld of in focus (Chromium op Windows meldt de pagina dan even verborgen). Een langere marge, alleen
// voor die vraag, zodat het slot dan niet dichtgaat en een stap niet opnieuw begint. Blijft de pagina daarna verborgen, dan gaat het slot alsnog dicht.
export const NAZORG_TOESTEL_MS = 5000;

let teller = 0; // hoeveel vrijstellingen lopen
let tot = 0; // het uiterste tijdstip (ms)
const naEinde = new Set(); // wie wil weten dat de laatste vrijstelling voorbij is (slot.js)

export function isVrijgesteld(nu = Date.now()) {
  return teller > 0 && nu < tot;
}

// Beveiliging: loopt de vrijstelling af terwijl de pagina nog op de achtergrond staat (Android: na het deelmenu staat ze in de gekozen app),
// dan moet het slot dat alsnog weten; anders blijft Bloei open tot de volgende keer dat ze naar de achtergrond gaat.
export function naVrijstelling(fn) {
  naEinde.add(fn);
  return () => naEinde.delete(fn);
}

function begin(maxMs, nazorgMs = NAZORG_MS) {
  teller += 1;
  tot = Math.max(tot, Date.now() + maxMs);
  let beeindigd = false;
  return () => {
    if (beeindigd) return;
    beeindigd = true;
    setTimeout(() => {
      teller = Math.max(0, teller - 1);
      if (teller === 0) {
        tot = 0;
        for (const fn of naEinde) fn();
      }
    }, nazorgMs);
  };
}

// Voert fn uit terwijl het slot niet dichtgaat voor de systeemvensters die fn opent.
// nazorgMs: hoe lang de vrijstelling na afloop nog geldt (standaard 1,5 s; de vraag van het toestel: NAZORG_TOESTEL_MS).
export async function metVrijstelling(fn, { maxMs = MAX_VRIJSTELLING_MS, nazorgMs = NAZORG_MS } = {}) {
  const einde = begin(maxMs, nazorgMs);
  try {
    return await fn();
  } finally {
    einde();
  }
}

// Een gestarte vrijstelling die je zelf beëindigt (voor een bestandskiezer, waar geen belofte van terugkomt).
export function startVrijstelling(maxMs = MAX_VRIJSTELLING_MS) {
  const einde = begin(maxMs);
  const stop = setTimeout(einde, maxMs);
  return () => {
    clearTimeout(stop);
    einde();
  };
}

let geinstalleerd = false;
// Zet de vrijstelling vanzelf rond navigator.share, window.print en elke bestandskiezer.
export function installeerVrijstellingen() {
  if (geinstalleerd) return;
  geinstalleerd = true;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const echt = navigator.share.bind(navigator);
    navigator.share = (gegevens) => metVrijstelling(() => echt(gegevens));
  }
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    const echt = window.print.bind(window);
    window.print = () => {
      const einde = startVrijstelling();
      try {
        echt();
      } finally {
        einde();
      }
    };
  }
  // Een bestandskiezer opent bij een klik op een file-invoer; hij is klaar bij change, cancel of als de pagina de focus terugkrijgt.
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'file') return;
      const einde = startVrijstelling();
      let geblurd = false;
      const opBlur = () => {
        geblurd = true;
      };
      // De kiezer is klaar bij change of cancel, of als de pagina de focus terugkrijgt nadat ze hem verloor.
      const opFocus = () => {
        if (geblurd) klaar();
      };
      const klaar = () => {
        el.removeEventListener('change', klaar);
        el.removeEventListener('cancel', klaar);
        window.removeEventListener('blur', opBlur);
        window.removeEventListener('focus', opFocus);
        einde();
      };
      el.addEventListener('change', klaar);
      el.addEventListener('cancel', klaar);
      window.addEventListener('blur', opBlur);
      window.addEventListener('focus', opFocus);
    },
    true,
  );
}
