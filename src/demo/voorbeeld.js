// Het welkomscherm als voorbeeld (BESLISSING 675). Alleen in de demo geladen (dynamische import in uitleg/scherm.js).
// Onder Rondleiding staat een rij "Zo begint een nieuwe gebruiker" met "Toon het me". Een tik toont het echte welkomscherm (schermen/welkom.js) met zijn
// vier stappen, op de plaats van het scherm en zonder navigatie, zoals bij een eerste start. Er wordt niets bewaard: welkom.js roept bij het einde
// opKlaar() en bij "Vergrendeling instellen" opSlot() (het kaartje "Dit is de demo"); daarna staat het scherm Rondleiding er weer, met Sofie.
// De weg terug staat in de demo-balk ("Terug naar de demo"), Escape en de terugknop van de browser doen hetzelfde. Het adres blijft #/meer/uitleg:
// herladen midden in het voorbeeld toont gewoon Rondleiding. Wisselt het adres (een andere route), dan tekent de app dat scherm en ruimt dit voorbeeld zich op.
import { dt } from './teksten.js';
import { h } from '../ui/dom.js';
import { knop, rij, strook } from '../ui/componenten.js';
import { begripOpties } from '../ui/iconenkaart.js';
import { bewaakTerug } from '../pwa/terug.js';
import { toon as toonWelkom } from '../schermen/welkom.js';
import { zetVoorbeeldBalk } from './balk.js';
import { toonDemoKaartje } from './profiel.js';
import { DEMO_NAAM } from './voorbeelddata.js';

// De rij onder Rondleiding, in dezelfde vorm als "Alle rondleidingen opnieuw tonen" (icoontegel, titel, uitleg, knop in de zachte stijl).
export function voorbeeldRij() {
  const toonKnop = knop(dt('voorbeeldKnop'), { soort: 'secundair', label: dt('voorbeeldKnopLabel'), opKlik: () => startVoorbeeld() });
  toonKnop.classList.add('demo-voorbeeld__knop');
  const el = rij({ tegel: begripOpties('profiel'), titel: dt('voorbeeldTitel'), tekst: dt('voorbeeldTekst'), eind: toonKnop });
  el.classList.add('demo-voorbeeld__rij');
  return el;
}

let bezig = null; // de opruimfunctie van het lopende voorbeeld

export function startVoorbeeld() {
  if (bezig) return;
  const app = document.getElementById('app');
  const scherm = document.getElementById('scherm');
  const tabbalk = document.getElementById('tabbalk');
  const zijbalk = document.getElementById('zijbalk');
  if (!app || !scherm) return;
  const y = window.scrollY;
  const vorig = { nav: app.dataset.nav, scherm: scherm.dataset.scherm, titel: document.title };

  // Zoals app.js het welkomscherm toont: geen tabbalk, geen zijbalk, data-nav="uit" en data-scherm="welkom" (de stijl van het scherm hangt daaraan).
  app.dataset.nav = 'uit';
  if (tabbalk) tabbalk.hidden = true;
  if (zijbalk) zijbalk.hidden = true;
  scherm.dataset.scherm = 'welkom';
  document.documentElement.classList.add('demo-voorbeeld');
  scherm.replaceChildren();
  window.scrollTo({ top: 0, behavior: 'instant' });

  let klaar = false;
  let opruimBalk = () => {}; // zie onderaan: de zwevende stand van de balk
  // Tekent app.js intussen zelf een scherm (een ander adres, de dagwissel), dan is het welkomscherm weg: hier alleen opruimen.
  const wacht = new MutationObserver(() => {
    if (!scherm.querySelector(':scope > .welkom')) stop({ hertekenen: false });
  });
  const terug = bewaakTerug({ opTerug: () => (stop({ viaTerug: true }), true) });
  const herstelBalk = zetVoorbeeldBalk(() => stop());

  function stop({ hertekenen = true, viaTerug = false, gedaan = false } = {}) {
    if (klaar) return;
    klaar = true;
    bezig = null;
    wacht.disconnect();
    herstelBalk();
    opruimBalk();
    document.documentElement.classList.remove('demo-voorbeeld');
    if (!viaTerug) terug.los();
    if (!hertekenen) return;
    // Hetzelfde adres opnieuw tekenen: app.js zet de navigatie, het scherm en de titel terug (dezelfde route, dus geen wissel).
    app.dataset.nav = vorig.nav ?? 'aan';
    if (tabbalk) tabbalk.hidden = false;
    if (zijbalk) zijbalk.hidden = false;
    scherm.dataset.scherm = vorig.scherm ?? '';
    document.title = vorig.titel;
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: location.href, newURL: location.href }));
    window.scrollTo({ top: y, behavior: 'instant' });
    // De focus terug op "Toon het me" van de nieuwe rij (het scherm tekent de rij na het laden van dit bestand: even wachten).
    const zetFocus = (pogingen = 20) => {
      const k = scherm.querySelector('.demo-voorbeeld__knop');
      if (k) {
        k.focus({ preventScroll: true });
        k.closest('.rij')?.scrollIntoView({ block: 'center', behavior: 'instant' });
      } else if (pogingen > 0) requestAnimationFrame(() => zetFocus(pogingen - 1));
    };
    zetFocus();
    if (gedaan) strook(dt('voorbeeldKlaar', { naam: DEMO_NAAM }));
  }

  bezig = () => stop();
  toonWelkom(scherm, {
    voorbeeld: {
      opKlaar: () => stop({ gedaan: true }),
      // Geen cijferblok en geen slot: het kaartje van de demo, daarna is het voorbeeld gedaan (zoals de echte app na het instellen verder gaat).
      opSlot: () => toonDemoKaartje({ tekst: dt('voorbeeldSlot'), opSluit: () => stop({ gedaan: true }) }),
      opSluit: () => stop(),
    },
  });
  wacht.observe(scherm, { childList: true });
  document.title = (scherm.querySelector('h1')?.textContent?.trim() || '') + ' · Bloei';
  // BESLISSING 711: past het welkomscherm met de balk niet in het venster, dan zweeft de weg terug als een klein knopje (demo.css,
  // demo-voorbeeld--zweef). Telkens gemeten met de balk zelf: eerst zonder de klasse, dan pas zetten als de pagina hoger is dan het venster
  // (in hetzelfde beeld, dus zonder flikkeren). Elke meting begint bij dezelfde stand en eindigt bij dezelfde uitkomst: dit gaat niet heen en weer.
  const html = document.documentElement;
  const pasBalkAan = () => {
    if (klaar) return;
    html.classList.remove('demo-voorbeeld--zweef');
    if (html.scrollHeight > window.innerHeight) html.classList.add('demo-voorbeeld--zweef');
  };
  pasBalkAan();
  window.addEventListener('resize', pasBalkAan);
  // De kaart kan later van maat veranderen (lettertypes, een andere stap): ook dan opnieuw meten.
  const kaartMaat = typeof ResizeObserver === 'function' ? new ResizeObserver(pasBalkAan) : null;
  for (const el of scherm.querySelectorAll(':scope > .welkom, .welkom__kaart')) kaartMaat?.observe(el);
  document.fonts?.ready?.then(pasBalkAan);
  opruimBalk = () => {
    window.removeEventListener('resize', pasBalkAan);
    kaartMaat?.disconnect();
    html.classList.remove('demo-voorbeeld--zweef');
  };
}
