// BESLISSING 345: instellingenschermen Gewicht en Favorieten van 960 tot 1440 px. Links de instellingen, rechts het voorbeeld ("Zo ziet het eruit");
import { uitlijnWeetjes } from '../ui/weetjes.js';
// "Goed om te weten" staat in de kolom waar het de kolommen het gelijkst laat eindigen, en het voorbeeld vult de rest met echte inhoud (een grafiek die
// meegroeit, extra maaltijden): geen wit onder het voorbeeld en geen leeg gekleurd vlak. Vanaf 1440 px en op een kleiner scherm doet dit niets.
const BREED = '(min-width: 960px) and (max-width: 1439.98px)';

// scherm: .instelscherm (kinderen: .instel__lijst met .instel__weetjes en aside.instel__voorbeeld).
// opties.vul(doel, meet): optioneel; vult het voorbeeld tot hoogstens `doel` px (meet() geeft zijn natuurlijke hoogte); doel null zet het terug op het minimum.
// Geeft { pas, stop }: pas() meet opnieuw (na een wijziging in het scherm), stop() ruimt op.
export function balanceer(scherm, { vul = null } = {}) {
  const lijst = scherm.querySelector(':scope > .instel__lijst');
  const zijde = scherm.querySelector(':scope > .instel__voorbeeld');
  const weetjes = lijst?.querySelector('.instel__weetjes');
  if (!lijst || !zijde || !weetjes) return { pas() {}, stop() {} };
  const mq = matchMedia(BREED);
  const hoogte = (el) => el.getBoundingClientRect().height;
  let bezig = false;
  let breedte = -1;

  function pas() {
    if (bezig || !scherm.isConnected) return;
    bezig = true;
    try {
      if (!mq.matches) {
        if (weetjes.parentElement !== lijst) lijst.append(weetjes);
        scherm.classList.remove('is-balans', 'is-meet');
        vul?.(null);
        return;
      }
      scherm.classList.add('is-balans', 'is-meet');
      const probeer = (naarZijde) => {
        (naarZijde ? zijde : lijst).append(weetjes);
        uitlijnWeetjes(weetjes); // de teksten van het blok in zijn nieuwe breedte (BESLISSING 565)
        vul?.(null);
        return { naarZijde, l: hoogte(lijst), r: hoogte(zijde) };
      };
      const a = probeer(false);
      const b = probeer(true);
      // het voorbeeld mag korter zijn dan de linkerkolom (het vult het verschil), niet langer
      const geldig = [a, b].filter((c) => c.l >= c.r - 0.5).sort((x, y) => x.l - x.r - (y.l - y.r));
      const keus = geldig[0] ?? a;
      probeer(keus.naarZijde);
      vul?.(keus.l, () => hoogte(zijde));
      scherm.classList.remove('is-meet');
    } finally {
      bezig = false;
    }
  }

  const waarnemer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const b = scherm.clientWidth;
        if (b === breedte) return;
        breedte = b;
        pas();
      })
    : null;
  waarnemer?.observe(scherm);
  const opWijziging = () => pas();
  mq.addEventListener?.('change', opWijziging);
  document.fonts?.ready?.then(opWijziging);
  return {
    pas: () => requestAnimationFrame(pas),
    stop() {
      waarnemer?.disconnect();
      mq.removeEventListener?.('change', opWijziging);
    },
  };
}
