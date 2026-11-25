// De medaille (BESLISSING 164): een ronde badge opgebouwd uit vormen en een Font Awesome-icoon uit HUISSTIJL §5. Een buitenring, een
// binnenvlak in de kleur van de soort badge (salie, mist of roze, uit de tokens), het icoon in het midden en een lintje met twee staarten.
// Behaald: volle kleur en een glans die één keer over de medaille trekt. Nog niet behaald: dezelfde vorm, omlijnd en gedempt, met een
// voortgangsring eromheen. Geen percentage, geen slotje, geen afbeeldingen, geen emoji. Alle stijl staat in schermen.css; JavaScript zet
// alleen eigenschappen via el.style.setProperty (CSP).
import { h, svg } from './dom.js';
import { icoon } from './iconen.js';
import { ICOON } from './iconenkaart.js';
import { magBewegen } from './beweging.js';
import { t } from '../teksten.js';
import { voortgangVan } from '../logica/badgeregels.js';
import { BADGE_ICOON } from '../logica/badgeiconen.js';

// Soort en icoon per medaille staan in logica/badgeiconen.js: elke medaille haar eigen icoon.
const MEDAILLE = Object.fromEntries(Object.entries(BADGE_ICOON).map(([id, [soort, naam]]) => [id, { soort, icoon: naam, stijl: 'solid' }]));

// { aantal, doel, fractie (0 tot 1), tekst: '1 van 7 dagen' } voor een badge die nog niet behaald is; null als er geen voortgang te berekenen is.
export function badgeVoortgang(id, stats) {
  const v = voortgangVan(id, stats);
  if (!v) return null;
  const tekst = v.doel === 1 ? t('badge.voortgangEen.' + v.eenheid, { aantal: v.aantal }) : t('badge.voortgang.' + v.eenheid, { aantal: v.aantal, doel: v.doel });
  return { ...v, tekst };
}

const GROOTTES = { klein: 52, groot: 96, extra: 132 };

// medaille({ badge: id, behaald, datum (tekst, voor de schermlezer en het bijschrift), voortgang (0 tot 1, alleen als niet behaald),
//            grootte: 'klein' (52 px) | 'groot' (96 px) | 'extra' (132 px), bijschrift: false | true (naam en datum of voortgang eronder),
//            voortgangTekst })
// Geeft een element met .glans() (de glans trekt één keer over een behaalde medaille) en .zetVoortgang(fractie).
export function medaille({ badge, behaald = false, datum, voortgang = null, grootte = 'groot', bijschrift = false, voortgangTekst, uitlegBijHover = false, href = null, alleenHover = false } = {}) {
  const def = MEDAILLE[badge] ?? { soort: 'reeks', icoon: ICOON.badge.naam, stijl: ICOON.badge.stijl };
  const px = GROOTTES[grootte] ?? GROOTTES.groot;
  const naam = t('badge.namen.' + badge);
  const iconPx = Math.round(px * 0.36);
  const heeftRing = !behaald && voortgang != null;

  // De voortgangsring (BESLISSING 199): een baan in een neutrale lijnkleur en een boog in de kleur van de badge, met afgeronde uiteinden.
  const ring = heeftRing
    ? svg('<svg xmlns="http://www.w3.org/2000/svg" class="medaille__voortgang" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="medaille__baan" cx="50" cy="50" r="46.5"/><circle class="medaille__boog" cx="50" cy="50" r="46.5" pathLength="100"/></svg>')
    : null;
  const glans = behaald ? h('span', { class: 'medaille__glans', 'aria-hidden': 'true' }) : null;
  const el = h(
    'span',
    {
      class: ['medaille', 'medaille--' + grootte, 'medaille--' + def.soort, behaald ? 'is-behaald' : 'is-open'],
      role: 'img',
      'aria-label': behaald ? `${naam}, ${datum ? t('badge.behaald', { datum }) : t('badge.behaaldKort')}` : `${naam}, ${voortgangTekst ?? t('badge.nogNiet')}`,
    },
    h('span', { class: 'medaille__lint medaille__lint--l', 'aria-hidden': 'true' }),
    h('span', { class: 'medaille__lint medaille__lint--r', 'aria-hidden': 'true' }),
    ring,
    h(
      'span',
      { class: 'medaille__schijf', 'aria-hidden': 'true' },
      h('span', { class: 'medaille__binnen' }),
      h('span', { class: 'medaille__icoon' }, icoon(def.icoon, { grootte: iconPx, stijl: def.stijl ?? 'solid' })),
      glans,
    ),
  );
  el.style.setProperty('--m', px + 'px');
  el.zetVoortgang = (fractie) => {
    const pct = Math.round(Math.max(0, Math.min(1, fractie)) * 100);
    el.style.setProperty('--v', pct + '%');
    el.style.setProperty('--vn', String(pct));
    el.classList.toggle('is-nul', pct === 0);
  };
  if (heeftRing) el.zetVoortgang(voortgang);
  // De glans trekt één keer over de medaille; bij verminderde beweging gebeurt er niets.
  el.glans = (vertraging = 0) => {
    if (!glans || !magBewegen()) return;
    glans.style.setProperty('--glans-vertraging', vertraging + 'ms');
    glans.classList.remove('is-glans');
    void glans.offsetWidth;
    glans.classList.add('is-glans');
    glans.addEventListener('animationend', () => glans.classList.remove('is-glans'), { once: true });
  };
  // De ring vult zich naar zijn stand: eerst op nul, dan (na een beeld) naar de waarde.
  el.vulRing = (fractie) => {
    if (!heeftRing) return;
    if (!magBewegen()) return el.zetVoortgang(fractie);
    el.style.setProperty('--v', '0%');
    el.style.setProperty('--vn', '0');
    requestAnimationFrame(() => requestAnimationFrame(() => el.zetVoortgang(fractie)));
  };

  const getoond = uitlegBijHover ? metUitleg(el, { badge, behaald, datum, voortgangTekst, href, alleenHover }) : el;
  if (!bijschrift) return getoond;
  const omhulsel = h(
    'span',
    { class: 'medaille-bijschrift' },
    getoond,
    h('span', { class: 'medaille-bijschrift__naam t-h2' }, naam),
    h('span', { class: 'medaille-bijschrift__regel t-klein t-gedempt' }, behaald ? (datum ? t('badge.behaald', { datum }) : '') : (voortgangTekst ?? '')),
  );
  omhulsel.medaille = el;
  omhulsel.glans = el.glans;
  omhulsel.vulRing = el.vulRing;
  return omhulsel;
}

// ---- Het uitlegkaartje (BESLISSING 186): bij hover en bij focus zegt een kaartje wat de medaille betekent: de naam, de uitleg en (behaald) de datum of (nog niet)
// de stand. Op een scherm zonder hover opent een tik hetzelfde kaartje, met een link "Alle badges"; op een scherm met hover gaat een klik naar het badgescherm.
// Het kaartje zweeft boven (of onder) de medaille, binnen het venster, en duwt niets weg. role="tooltip" met aria-describedby; dezelfde tekst staat in het aria-label.
// medaille({ ..., uitlegBijHover: true, href: '#/meer/badges', alleenHover: false }) geeft een element .medaille-hover met de medaille en het kaartje.
let tipTeller = 0;
const zonderHover = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

// De open kaartjes (meestal hoogstens één) en één gedeelde luisteraar op document voor alle medailles (R2-02): een tik buiten het kaartje
// of Escape sluit het. Een medaille zette vroeger zelf twee luisteraars op document die nooit weggingen, bij elke hertekening twee meer.
const openKaartjes = new Set();
let documentLuistert = false;
function luisterOpDocument() {
  if (documentLuistert || typeof document === 'undefined') return;
  documentLuistert = true;
  document.addEventListener('pointerdown', (e) => {
    for (const k of [...openKaartjes]) if (!k.wrapper.isConnected || !k.wrapper.contains(e.target)) k.verberg();
  });
  // Escape sluit het kaartje ook als de focus er niet in staat (bij hover met een muis).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') for (const k of [...openKaartjes]) k.verberg();
  });
}

function metUitleg(el, { badge, behaald, datum, voortgangTekst, href, alleenHover }) {
  const naam = t('badge.namen.' + badge);
  const uitleg = t('badge.voorwaarden.' + badge);
  const regel = behaald ? (datum ? t('badge.behaald', { datum }) : t('badge.behaaldKort')) : (voortgangTekst ?? t('badge.nogNiet'));
  const id = 'medaille-tip-' + ++tipTeller;
  const tip = h(
    'span',
    { class: 'medaille-tip', role: 'tooltip', id },
    h('span', { class: 'medaille-tip__naam' }, naam),
    h('span', { class: 'medaille-tip__uitleg' }, uitleg),
    h('span', { class: 'medaille-tip__regel cijfer' }, regel),
    href && !alleenHover ? h('a', { class: 'medaille-tip__link', href, tabindex: '-1' }, t('badge.alle')) : null,
  );
  const wrapper = h(href && !alleenHover ? 'a' : 'span', { class: 'medaille-hover', 'aria-describedby': id, ...(href && !alleenHover ? { href } : { tabindex: alleenHover ? null : '0' }), 'aria-label': `${naam}. ${uitleg} ${regel}` }, el, tip);
  // De medaille zelf is dan geen losse afbeelding meer voor de schermlezer: het label zit op de wrapper.
  el.removeAttribute('role');
  el.removeAttribute('aria-label');
  el.setAttribute('aria-hidden', 'true');
  let open = false;
  const plaats = () => {
    // Boven de medaille, of eronder als er boven geen plek is; binnen het venster (de verschuiving gaat via een eigenschap, geen style-attribuut)
    tip.style.setProperty('--tip-dx', '0px');
    wrapper.classList.remove('tip-onder');
    // BESLISSING 205: het kaartje blijft binnen de kaart van de motivator (met 16 px binnenruimte), op een telefoon binnen het venster met 16 px marge.
    const r = tip.getBoundingClientRect();
    const w = window.innerWidth;
    const kaart = wrapper.closest('.voortgang, .meer__badges')?.getBoundingClientRect();
    const links = Math.max(16, kaart ? kaart.left + 16 : 0);
    const rechts = Math.min(w - 16, kaart ? kaart.right - 16 : w);
    let dx = 0;
    if (r.left < links) dx = links - r.left;
    else if (r.right > rechts) dx = rechts - r.right;
    tip.style.setProperty('--tip-dx', dx + 'px');
    // De pijl (de aanhechting) wijst naar het midden van de medaille, ook als het kaartje opgeschoven is.
    tip.style.setProperty('--tip-pijl', -dx + 'px');
    // De ondergrens is de bovenkant van de vaste tabbalk (als ze zichtbaar is), anders de onderkant van het venster.
    const tabbalk = document.querySelector('#tabbalk');
    const tabTop = tabbalk && getComputedStyle(tabbalk).display !== 'none' && tabbalk.getBoundingClientRect().height > 0 ? tabbalk.getBoundingClientRect().top : window.innerHeight;
    const onderGrens = Math.min(window.innerHeight, tabTop) - 8;
    const boven = kaart ? Math.max(8, kaart.top + 8) : 8;
    if (r.top >= boven) return; // past boven de medaille
    wrapper.classList.add('tip-onder');
    const onder = tip.getBoundingClientRect();
    if (onder.bottom <= onderGrens) return; // past eronder, boven de tabbalk
    // Het past nergens: de medaille schuift eerst in beeld, zodat het kaartje boven haar (of eronder) helemaal zichtbaar is.
    const m = wrapper.getBoundingClientRect();
    if (m.top - 8 >= onderGrens - m.bottom) {
      wrapper.classList.remove('tip-onder');
      window.scrollBy(0, r.top - boven); // boven de medaille: de bovenkant van het kaartje komt op de bovengrens
    } else {
      window.scrollBy(0, onder.bottom - onderGrens); // onder de medaille: de onderkant van het kaartje komt op de tabbalk
    }
  };
  const toon = () => {
    if (open) return;
    open = true;
    openKaartjes.add(sluiter);
    luisterOpDocument();
    wrapper.classList.add('is-uitleg');
    plaats();
    requestAnimationFrame(() => open && wrapper.classList.add('is-zicht')); // eerst plaatsen, dan zacht opkomen
  };
  const verberg = () => {
    open = false;
    openKaartjes.delete(sluiter);
    wrapper.classList.remove('is-uitleg', 'is-zicht');
  };
  const sluiter = { wrapper, verberg };
  if (!zonderHover()) {
    wrapper.addEventListener('mouseenter', toon);
    wrapper.addEventListener('mouseleave', verberg);
  }
  wrapper.addEventListener('focusin', toon);
  wrapper.addEventListener('focusout', (e) => !wrapper.contains(e.relatedTarget) && verberg());
  wrapper.addEventListener('keydown', (e) => e.key === 'Escape' && verberg());
  // Op een scherm zonder hover: een tik wisselt het kaartje (de stand van vóór de tik telt, want de tik zet ook de focus).
  let stondOpen = false;
  wrapper.addEventListener('pointerdown', () => (stondOpen = open));
  wrapper.addEventListener('click', (e) => {
    if (alleenHover || !zonderHover() || e.target.closest?.('.medaille-tip__link')) return; // met een muis: de klik gaat zijn gang (naar het badgescherm)
    e.preventDefault();
    e.stopPropagation();
    stondOpen ? verberg() : toon();
  });
  wrapper.glans = el.glans;
  wrapper.vulRing = el.vulRing;
  wrapper.medaille = el;
  return wrapper;
}
