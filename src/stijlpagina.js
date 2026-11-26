// De stijlpagina van Bloei (stijl.html): alles uit de huisstijl op één plek, opgebouwd uit de echte
// componenten van src/ui/. Dit is wat de eigenaar beoordeelt. Kleurwaarden worden uitgelezen uit de berekende
// stijl, niet overgetypt.
import 'bootstrap/dist/css/bootstrap-reboot.min.css';
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';

import '../bloei-huisstijl/tokens.css';
import './stijl/afgeleid.css';
import './stijl/basis.css';
import './stijl/componenten.css';
import './stijl/stijlpagina.css';

import appIcoon from '../bloei-huisstijl/logo/bloei-app-icon.svg';

import { h } from './ui/dom.js';
import { icoon } from './ui/iconen.js';
import {
  kaartkop, kerncijfer, uitklapkaart, schermkop, beeldmerk, bevestig, bevestigBlad, bladerkop, chip, chips,
  icoonknop, icoontegel, blad, bladInhoud, kaart, knop, legeToestand, logo, rij, schakelaar, segment, stapper, strook, strookElement,
  tabbalk, tekstveld, tekstvak, tijdveld, vinkvak, zijbalk,
} from './ui/componenten.js';
import { grafiek } from './ui/grafiek.js';
import { watervulling } from './ui/watervulling.js';
import { MAALTIJDICOON, badgeTegel, miniatuur, profielfoto } from './ui/beeld.js';
import { plusDagen, vandaag, weekStart } from './kern/datum.js';
import { bloeiOp, komOp, telOp } from './ui/beweging.js';
import { t } from './teksten.js';
import { openSupplementkaart } from './ui/supplementkaart.js';
import { leesSupplementen } from './data/supplementen.js';

// ---------------------------------------------------------------- thema

const THEMAS = ['poeder', 'salie', 'nacht'];
const wortel = document.documentElement;
const waardeVernieuwers = [];

function zetThema(naam) {
  if (naam === 'poeder') wortel.removeAttribute('data-theme');
  else wortel.setAttribute('data-theme', naam);
  // De waarden onder de kleuren lezen opnieuw uit de berekende stijl.
  requestAnimationFrame(() => waardeVernieuwers.forEach((f) => f()));
}

function leesToken(naam) {
  return getComputedStyle(wortel).getPropertyValue(naam).trim();
}

// ---------------------------------------------------------------- bouwstenen van de pagina

function sectie(nr, titel, uitleg, ...kinderen) {
  return h(
    'section',
    { class: 'sp-sectie', id: 'sectie-' + nr },
    h(
      'header',
      { class: 'sp-sectie__kop' },
      h('p', { class: 'label' }, String(nr).padStart(2, '0')),
      h('h2', { class: 't-h1' }, titel),
      uitleg ? h('p', { class: 'sp-sectie__uitleg' }, uitleg) : null,
    ),
    ...kinderen,
  );
}

// Op brede schermen staan de groepen (een kopje plus inhoud) in twee kolommen.
function kolommen(...kinderen) {
  const groepen = [];
  let huidig = null;
  for (const kind of kinderen) {
    if (!huidig || kind.classList?.contains('sp-sub')) {
      huidig = h('div', { class: 'sp-groep' });
      groepen.push(huidig);
    }
    huidig.append(kind);
  }
  return h('div', { class: 'sp-kolommen' }, ...groepen);
}
const mono = (tekst) => h('code', { class: 'sp-mono' }, tekst);

const sub = (tekst) => h('h3', { class: 't-h2 sp-sub' }, tekst);
const bijschrift = (tekst) => h('p', { class: 'sp-bijschrift' }, tekst);
const veld = (label, ...kinderen) => h('div', { class: 'sp-veld' }, h('p', { class: 'label' }, label), ...kinderen);
const toestand = (naam, ...kinderen) => h('div', { class: 'sp-toestand' }, ...kinderen, h('p', { class: 'sp-bijschrift' }, naam));

// ---------------------------------------------------------------- 1. logo en concept

function maakLogoSectie() {
  // Elke variant staat op de ondergrond waarvoor ze bedoeld is, ongeacht het gekozen thema.
  const vlak = (klasse, bestand, toelichting, ...kinderen) =>
    h('div', { class: 'sp-kolom' }, h('div', { class: ['sp-merk-vlak', klasse], 'data-theme': klasse.includes('nacht') ? 'nacht' : null }, ...kinderen), h('p', { class: 'sp-bijschrift' }, mono(bestand), ' ', toelichting));

  return h(
    'section',
    { class: 'sp-hero', id: 'sectie-1' },
    h('p', { class: 'label' }, '01 · Logo en concept'),
    h('div', { class: 'sp-rij sp-rij--midden' }, logo({ grootte: 64 })),
    h(
      'p',
      { class: 't-cursief', style: { fontSize: 'var(--fs-h1)', maxWidth: '22em', textWrap: 'balance' } },
      'Elke dag een beetje groeien: zacht en vrouwelijk, maar strak en volwassen.',
    ),
    h(
      'div',
      { class: 'sp-grid sp-grid--breed', style: { marginTop: 'var(--s-4)' } },
      vlak('sp-merk-vlak--licht', 'bloei-mark.svg', '(licht, op porselein)', beeldmerk({ variant: 'licht', grootte: 72 })),
      vlak('sp-merk-vlak--nacht', 'bloei-mark-nacht.svg', '(thema Nacht, op de nachtkleur)', beeldmerk({ variant: 'nacht', grootte: 72 })),
      vlak('sp-merk-vlak--accent', 'bloei-mark-mono.svg', '(één kleur, currentColor)', beeldmerk({ variant: 'mono', grootte: 72 })),
      h(
        'div',
        { class: 'sp-kolom' },
        h('div', { class: 'sp-merk-vlak' }, h('img', { class: 'sp-appicoon', src: appIcoon, alt: 'Bloei app-icoon', width: 96, height: 96 })),
        h('p', { class: 'sp-bijschrift' }, mono('bloei-app-icon.svg'), ' (iOS rondt zelf af)'),
      ),
    ),
    h(
      'div',
      { class: 'sp-rij sp-rij--midden', style: { marginTop: 'var(--s-4)' } },
      kaart({}, h('div', { class: 'sp-rij sp-rij--midden' }, logo({ grootte: 28 }), h('span', { class: 'sp-bijschrift' }, 'Klein, 28 px: bovenaan Vandaag'))),
      kaart({}, h('div', { class: 'sp-rij sp-rij--midden' }, (() => { const l = logo({ grootte: 28, link: true }); l.addEventListener('click', (e) => e.preventDefault()); return l; })(), h('span', { class: 'sp-bijschrift' }, 'Aantikbaar: de home-knop naar Vandaag'))),
      kaart({ klasse: '' }, h('div', { 'data-theme': 'nacht' }, h('div', { class: 'sp-rij sp-rij--midden', style: { background: 'var(--c-bg)', padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-sm)' } }, logo({ grootte: 28 }), h('span', { class: 'sp-bijschrift' }, 'In Nacht')))),
    ),
  );
}

// ---------------------------------------------------------------- 2. voorproefje van een scherm

function maakTelefoon(thema) {
  const datum = new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });

  const scherm = h(
    'div',
    { class: 'sp-telefoon__scherm' },
    h('div', { class: 'sp-telefoon__kop' }, logo({ grootte: 28 })),
    h('div', { class: 'sp-hero-tekst' }, h('h3', { class: 't-hero' }, t('begroeting.ochtend', { naam: 'Testnaam' })), h('p', { class: 'label' }, datum)),
    kaart(
      { label: 'Eten' },
      rij({ tegel: { naam: 'mug-saucer', familie: 'maaltijd' }, titel: t('maaltijd.ontbijt'), tekst: 'Havermout met banaan en een handvol bessen', eind: '08:10' }),
      rij({ tegel: { naam: 'apple-whole', familie: 'maaltijd' }, titel: t('maaltijd.tussendoortje'), tekst: 'Een appel en een paar noten', eind: '10:15' }),
      rij({ tegel: { naam: 'bowl-food', familie: 'maaltijd' }, titel: t('maaltijd.middagmaal'), tekst: 'Volkoren boterham met hummus en komkommer', eind: '12:30' }),
    ),
    knop(t('drinken.knop'), { soort: 'primair', icoon: 'glass-water', breed: true, opKlik: () => {} }),
  );
  const { el: balk } = tabbalk({ actief: 'vandaag', voorbeeld: true });
  return h('div', { class: 'sp-telefoon', 'data-theme': thema }, scherm, balk);
}

function maakVoorproefje() {
  return h(
    'section',
    { class: 'sp-sectie', id: 'sectie-2' },
    h(
      'header',
      { class: 'sp-sectie__kop' },
      h('p', { class: 'label' }, '02'),
      h('h2', { class: 't-h1' }, 'Een scherm in de huisstijl'),
      h('p', { class: 'sp-sectie__uitleg' }, 'Zo ziet Vandaag er ongeveer uit in telefoonbreedte. Alles hieronder is bruikbaar.'),
    ),
    h(
      'div',
      { class: 'sp-telefoons' },
      h('div', { class: 'sp-kolom' }, maakTelefoon(null), bijschrift('Volgt het gekozen thema')),
      h('div', { class: 'sp-kolom sp-telefoons__nacht' }, maakTelefoon('nacht'), bijschrift('Hetzelfde scherm in Nacht')),
    ),
  );
}

// ---------------------------------------------------------------- 3. kleuren

function kleurVlak(token, rol) {
  const waarde = h('p', { class: 'sp-kleur__waarde' });
  const vernieuw = () => {
    waarde.textContent = leesToken(token);
  };
  waardeVernieuwers.push(vernieuw);
  vernieuw();
  return h(
    'div',
    { class: 'sp-kleur' },
    h('div', { class: 'sp-kleur__vlak', style: { background: `var(${token})` } }),
    h('p', { class: 'sp-kleur__naam sp-mono' }, token),
    rol ? h('p', { class: 'sp-bijschrift' }, rol) : null,
    waarde,
  );
}

// Elk onderwerp één kleur (BESLISSING 181) en de hoofdknop in die kleur (BESLISSING 184, met het gemeten contrast in afgeleid.css)
const KLEUR_PER_ONDERWERP = [
  ['Vandaag: pruim', '--c-day', 'dag', 'sun', '--knop-mix-dag'],
  ['Dagboek: kasjmier', '--c-book', 'dagboek', 'book-open', '--knop-mix-dagboek'],
  ['Drinken: mist', '--c-water', 'drank', 'glass-water', 'vast:--c-water-vol'], // BESLISSING 531: de hoofdknop van Drinken is een vaste blauwgroene waarde, geen mengsel
  ['Supplementen: salie', '--c-health', 'gezondheid', 'capsules', '--knop-mix-gezondheid'],
  ['Gewicht: duifblauw', '--c-weight', 'gewicht', 'weight-scale', '--knop-mix-gewicht'],
  ['Algemeen: neutraal', '--c-surface-soft', 'neutraal', 'sliders', null],
  ['Delen: aubergine', '--c-share', 'delen', 'arrow-up-from-bracket', null],
];
// De volledige lijst "onderwerp, waar het voorkomt, kleur" (BESLISSING 181); één kleur per onderwerp, overal, uit één token.
const KLEUR_LIJST = [
  ['Vandaag', 'tabblad, tegels op Vandaag, hoofdknop op Vandaag', 'pruim (--c-day)'],
  ['Dagboek', 'tabblad, weekkop, gekozen dag en vandaag in de kalender, hoofdknop', 'kasjmier (--c-book)'],
  ['Drinken', 'tabblad, drankkaart, dranktegels in dag en week, instelscherm Drinken', 'mist (--c-water)'],
  ['Supplementen, reeks, badges, doel gehaald', 'tabblad, momenten, de kaart Badges, afvinken en aan-schakelaars', 'salie (--c-health)'],
  ['Gewicht', 'tabblad, kaarten, grafieklijn en punten, weegkalender, streefgewicht, instelscherm Gewicht, hoofdknop', 'duifblauw (--c-weight)'],
  ['Delen en verslag', 'menu-item Delen, kaarten op Delen, instelscherm Delen, de rij Delen op Algemeen, Versturen', 'aubergine, gevulde tegel (--c-share)'],
  ['Algemeen', 'tabblad, profiel, thema, vergrendeling, back-up, uitleg', 'neutraal (--tile-neutral-*)'],
  ['Eten en favorieten', 'maaltijdtegels, kaart Eten, favorieten', 'poederroze (--tile-meal-*)'],
  ['Medailles', 'badges op Algemeen en het overzicht van badges', 'elke soort zijn eigen kleur'],
];

function kleurOnderwerp(naam, kleur, familie, icoonNaam, mix) {
  const knopEl = knop('Hoofdknop', { soort: 'primair' });
  if (mix?.startsWith('vast:')) knopEl.style.setProperty('--knop-bg', `var(${mix.slice(5)})`);
  else if (mix) knopEl.style.setProperty('--knop-bg', `color-mix(in srgb, var(${kleur}) var(${mix}), var(--c-text))`);
  return h('div', { class: 'sp-paar' }, icoontegel(icoonNaam, familie, { groot: true }), h('div', { class: 'sp-kolom' }, h('p', { class: 'sp-kleur__naam' }, naam), knopEl));
}

function tegelPaar(naam, bg, fg, familie, iconNaam) {
  const w1 = h('span', { class: 'sp-kleur__waarde' });
  const w2 = h('span', { class: 'sp-kleur__waarde' });
  const vernieuw = () => {
    w1.textContent = leesToken(bg);
    w2.textContent = leesToken(fg);
  };
  waardeVernieuwers.push(vernieuw);
  vernieuw();
  return h(
    'div',
    { class: 'sp-paar' },
    icoontegel(iconNaam, familie, { groot: true }),
    h('div', { class: 'sp-kolom', style: { gap: 'var(--s-1)' } }, h('p', { class: 'sp-kleur__naam' }, naam), h('p', { class: 'sp-kleur__waarde' }, mono(bg), ' ', w1), h('p', { class: 'sp-kleur__waarde' }, mono(fg), ' ', w2)),
  );
}

function maakKleuren() {
  const merk = [
    ['--bloei-aubergine', 'tekst, primaire knop, app-icoon'],
    ['--bloei-oudroze', 'accent: iconen, actieve tab, grafieklijn'],
    ['--bloei-poeder', 'zachte vlakken, actieve achtergrond'],
    ['--bloei-salie', 'gezondheid, doel gehaald, streak'],
    ['--bloei-mist', 'drinken en water'],
    ['--bloei-porselein', 'achtergrond'],
  ];
  const rollen = [
    ['--c-bg', 'app-achtergrond'],
    ['--c-surface', 'kaarten'],
    ['--c-surface-soft', 'zachte vlakken, chips, invoer'],
    ['--c-line', '1 px lijnen'],
    ['--c-text', 'hoofdtekst'],
    ['--c-text-muted', 'secundaire tekst'],
    ['--c-accent', 'iconen, actieve tab, grafieklijn'],
    ['--c-accent-text', 'accent als tekst'],
    ['--c-accent-soft', 'actieve achtergrond, voortgangsbaan'],
    ['--c-health', 'doel gehaald, streak, positief'],
    ['--c-health-soft', 'zachte gezondheidsvlakken'],
    ['--c-water', 'drinken'],
    ['--c-water-soft', 'zacht water'],
    ['--c-primary', 'primaire knop'],
    ['--c-on-primary', 'tekst op de primaire knop'],
  ];
  return sectie(
    3,
    'Kleuren',
    'Het palet van de eigenaar met alle rollen. De waarden worden uit de berekende stijl gelezen en volgen dus het gekozen thema. Nooit rood.',
    kolommen(
    sub('Merkpalet'),
    h('div', { class: 'sp-grid' }, ...merk.map(([n, r]) => kleurVlak(n, r))),
    sub('Rollen'),
    h('div', { class: 'sp-grid' }, ...rollen.map(([n, r]) => kleurVlak(n, r))),
    sub('Tegelkleuren'),
    h(
      'div',
      { class: 'sp-grid sp-grid--breed' },
      tegelPaar('maaltijden', '--tile-meal-bg', '--tile-meal-fg', 'maaltijd', 'mug-saucer'),
      tegelPaar('dranken', '--tile-drink-bg', '--tile-drink-fg', 'drank', 'glass-water'),
      tegelPaar('gezondheid', '--tile-health-bg', '--tile-health-fg', 'gezondheid', 'seedling'),
      tegelPaar('neutraal', '--tile-neutral-bg', '--tile-neutral-fg', 'neutraal', 'sliders'),
      tegelPaar('Vandaag', '--tile-day-bg', '--tile-day-fg', 'dag', 'sun'),
      tegelPaar('Dagboek', '--tile-book-bg', '--tile-book-fg', 'dagboek', 'book-open'),
      tegelPaar('Gewicht', '--tile-weight-bg', '--tile-weight-fg', 'gewicht', 'weight-scale'),
      tegelPaar('Delen', '--tile-share-bg', '--tile-share-fg', 'delen', 'arrow-up-from-bracket'),
    ),
    sub('Kleur per onderwerp en de hoofdknop'),
    h('div', { class: 'sp-grid sp-grid--breed' }, ...KLEUR_PER_ONDERWERP.map(([naam, kleur, familie, icoonNaam, mix]) => kleurOnderwerp(naam, kleur, familie, icoonNaam, mix))),
    sub('Onderwerp, waar het voorkomt, kleur'),
    h('div', { class: 'sp-kolom' }, ...KLEUR_LIJST.map(([onderwerp, waar, kleur]) => h('p', { class: 'sp-kleur__waarde' }, h('strong', null, onderwerp), ': ', waar, ', ', kleur))),
    ),
  );
}

// ---------------------------------------------------------------- 4. typografie

function typeRij(spec, voorbeeld) {
  return h('div', { class: 'sp-type' }, h('p', { class: 'sp-type__spec' }, spec), h('div', null, voorbeeld));
}

function maakTypografie() {
  const jost = (gewicht) =>
    typeRij(`Jost ${gewicht} · --fs-body · 16 px`, h('p', { class: 't-body', style: { fontWeight: String(gewicht) } }, 'De kleine dingen tellen mee, ook op een gewone dinsdag.'));
  return sectie(
    4,
    'Typografie',
    'Cormorant Garamond voor titels, begroeting en grote cijfers. Jost voor alle UI-tekst. Beide lokaal meegeleverd, geen enkel extern verzoek.',
    h('div', { class: 'sp-typekolommen' },
    typeRij('Cormorant Garamond 500 · --fs-hero · 44 px', h('p', { class: 't-hero' }, 'Goeiemorgen, Testnaam')),
    typeRij('Cormorant Garamond 600 · --fs-h1 · 32 px', h('p', { class: 't-h1' }, 'Schermtitel')),
    typeRij('Cormorant Garamond 600 · --fs-h2 · 22 px', h('p', { class: 't-h2' }, 'Kaarttitel')),
    typeRij('Cormorant Garamond 500 cursief · 32 px', h('p', { class: 't-cursief', style: { fontSize: 'var(--fs-h1)' } }, 'gewoon, rustig, vol')),
    typeRij('Cormorant Garamond 500 cursief · 22 px', h('p', { class: 't-cursief', style: { fontSize: 'var(--fs-h2)' } }, 'Nog niets genoteerd vandaag.')),
    jost(300),
    jost(400),
    jost(500),
    jost(600),
    typeRij('Jost 400 · --fs-small · 14 px', h('p', { class: 't-klein' }, 'Kleine tekst voor een uitleg onder een kaart of een veld.')),
    typeRij('Label: Jost 500 · 12 px · hoofdletters · 0,12em · --c-text-muted', h('p', { class: 'label' }, 'Drinken · donderdag 12 november')),
    typeRij(
      'Cijfers: tabular-nums (Jost), onder elkaar op dezelfde breedte',
      h(
        'div',
        { class: 'sp-rij' },
        h('p', { class: 'cijfer t-body' }, '111,1 kg', h('br'), '888,8 kg', h('br'), '2 l'),
        h('p', { class: 't-body', style: { fontVariantNumeric: 'proportional-nums' } }, '111,1 kg', h('br'), '888,8 kg', h('br'), '2 l'),
      ),
    ),
    typeRij(
      'Grote cijfers in Cormorant 500 · 44 px',
      h('div', { class: 'sp-rij sp-rij--midden' }, h('span', { class: 'cijfer-groot' }, '2 l'), h('span', { class: 'cijfer-groot' }, '68,4'), h('span', { class: 'cijfer-groot' }, '0,25 l')),
    ),
    ),
  );
}

// ---------------------------------------------------------------- 5. iconen

function maakIconen() {
  const tegelItem = (naam, familie, bijnaam, opties) =>
    h('div', { class: 'sp-icoon' }, icoontegel(naam, familie, opties), h('p', { class: 'sp-naam' }, bijnaam), h('p', { class: 'sp-code sp-mono' }, (opties?.stijl || 'solid') + '/' + naam));
  const navItem = (naam, bijnaam, stijl = 'solid') =>
    h(
      'div',
      { class: 'sp-icoon' },
      h('div', { class: 'sp-nav' }, h('span', { class: 'sp-nav__icoon sp-nav__icoon--uit' }, icoon(naam, { grootte: 24, stijl })), h('span', { class: 'sp-nav__icoon sp-nav__icoon--aan' }, icoon(naam, { grootte: 24, stijl }))),
      h('p', { class: 'sp-naam' }, bijnaam),
      h('p', { class: 'sp-code sp-mono' }, stijl + '/' + naam),
    );
  return sectie(
    5,
    'Iconen',
    'Font Awesome Free 6, alleen deze lijst. Inhoudsiconen staan altijd in een tegel per familie; navigatie en acties staan zonder tegel in currentColor (inactief gedempt, actief oudroze). Er is geen plus, min, kruisje of vinkje: dat zijn lettertekens en een met CSS getekend vinkje.',
    kolommen(
    sub('Maaltijden: één kleur voor alle zes'),
    h(
      'div',
      { class: 'sp-grid' },
      tegelItem('mug-saucer', 'maaltijd', t('maaltijd.ontbijt')),
      tegelItem('apple-whole', 'maaltijd', t('maaltijd.tussendoortje')),
      tegelItem('bowl-food', 'maaltijd', t('maaltijd.middagmaal')),
      tegelItem('cookie-bite', 'maaltijd', t('maaltijd.vieruurtje')),
      tegelItem('utensils', 'maaltijd', t('maaltijd.avondmaal')),
      tegelItem('moon', 'maaltijd', t('maaltijd.latesnack')),
    ),
    sub('Dranken'),
    h(
      'div',
      { class: 'sp-grid' },
      tegelItem('glass-water', 'drank', t('drank.water')),
      tegelItem('mug-hot', 'drank', t('drank.thee')),
      tegelItem('mug-saucer', 'drank', t('drank.koffie')),
      tegelItem('lemon', 'drank', t('drank.sap')),
      tegelItem('glass-water', 'drank', t('drank.anders')),
    ),
    sub('Gezondheid'),
    h(
      'div',
      { class: 'sp-grid' },
      tegelItem('seedling', 'gezondheid', 'Streak'),
      tegelItem('award', 'gezondheid', 'Badge'),
      tegelItem('capsules', 'gezondheid', 'Supplementen'),
      tegelItem('award', 'gezondheid', 'Badge (groot, 56 px)', { groot: true }),
      tegelItem('award', 'neutraal', 'Nog niet behaald (40%)', { groot: true, gedimd: true }),
    ),
    sub('Neutraal: instellingen en hulpfuncties'),
    h(
      'div',
      { class: 'sp-grid' },
      tegelItem('camera', 'neutraal', 'Foto'),
      tegelItem('pen', 'neutraal', 'Notitie'),
      tegelItem('sliders', 'neutraal', 'Instellingen'),
      tegelItem('lock', 'neutraal', 'Vergrendeling'),
      tegelItem('calendar-day', 'neutraal', 'Weegkalender'),
      tegelItem('calendar-days', 'neutraal', 'Periode'),
      tegelItem('user', 'neutraal', 'Profiel'),
      tegelItem('palette', 'neutraal', 'Thema'),
      tegelItem('file-lines', 'neutraal', 'Verslag'),
      tegelItem('circle-info', 'neutraal', 'Uitleg'),
      tegelItem('fingerprint', 'neutraal', 'Toestelcontrole'),
      tegelItem('bullseye', 'neutraal', 'Streefgewicht'),
      tegelItem('floppy-disk', 'neutraal', 'Back-up'),
      tegelItem('plus', 'neutraal', 'Toevoegen'),
      tegelItem('xmark', 'neutraal', 'Weghalen'),
    ),
    sub('Navigatie, zonder tegel: inactief en actief'),
    h(
      'div',
      { class: 'sp-grid' },
      navItem('sun', 'Tab Vandaag'),
      navItem('book-open', 'Tab Dagboek'),
      navItem('glass-water', 'Tab Drinken'),
      navItem('capsules', 'Tab Supplementen'),
      navItem('weight-scale', 'Tab Gewicht'),
      navItem('ellipsis', 'Tab Algemeen'),
    ),
    sub('Acties, zonder tegel'),
    h(
      'div',
      { class: 'sp-grid' },
      navItem('chevron-left', 'Vorige dag'),
      navItem('chevron-right', 'Volgende dag'),
      navItem('rotate-left', 'Ongedaan maken'),
      navItem('house', 'Home (naar Vandaag)'),
      navItem('heart', 'Favoriet', 'regular'),
      navItem('heart', 'Favoriet (gekozen)'),
      navItem('bell', 'Herinnering', 'solid'),
    ),
    sub('Actie-icoon van 20 px in een lijstrij'),
    kaart(
      { label: 'Favorieten' },
      rij({ tegel: { naam: 'mug-saucer', familie: 'maaltijd' }, titel: 'Havermout met banaan', tekst: t('maaltijd.ontbijt'), actie: { icoon: 'heart', stijl: 'regular', label: 'Favoriet', opKlik: () => {} } }),
      rij({ tegel: { naam: 'utensils', familie: 'maaltijd' }, titel: 'Pasta met groenten', tekst: t('maaltijd.avondmaal'), actie: { icoon: 'heart', label: 'Geen favoriet meer', opKlik: () => {} } }),
      rij({ tegel: { naam: 'sliders', familie: 'neutraal' }, titel: t('meer.herinneringen'), tekst: 'Elke dag om 20:00', actie: { icoon: 'bell', stijl: 'solid', label: t('meer.herinneringen'), opKlik: () => {} } }),
    ),
    ),
  );
}

// ---------------------------------------------------------------- 6. componenten

function knopRij(soort, naam) {
  return [
    toestand(naam + ': rust', knop('Kan water erbij', { soort })),
    toestand('ingedrukt', (() => { const k = knop('Kan water erbij', { soort }); k.classList.add('is-ingedrukt'); return k; })()),
    toestand('focus (toetsenbord)', (() => { const k = knop('Kan water erbij', { soort }); k.classList.add('is-focus'); return k; })()),
    toestand('uitgeschakeld', knop('Kan water erbij', { soort, uitgeschakeld: true })),
  ];
}

function maakComponenten() {
  const wijzig = () => {};

  // Dialoog en melding: een vaste weergave plus een echte om uit te proberen.
  const dialoogVast = h('div', { class: 'dialoog dialoog--statisch' }, bevestigBlad({ titel: 'Deze weging wissen?', tekst: 'Je kan ze daarna opnieuw noteren.', ja: 'Wissen', nee: 'Laten staan' }, () => {}));
  const toonDialoog = knop('Dialoog openen', { soort: 'secundair', opKlik: () => bevestig({ titel: 'Deze weging wissen?', tekst: 'Je kan ze daarna opnieuw noteren.', ja: 'Wissen', nee: 'Laten staan' }) });
  const wegingInhoud = () => h('div', { class: 'sp-kolom' }, tijdveld({ waarde: '08:10', opWijzig: wijzig }), stapper({ waarde: 68.4, stap: 0.1, min: 20, max: 300, opmaak: (n) => n.toFixed(1).replace('.', ',') + ' kg', opWijzig: wijzig, label: 'Gewicht' }));
  const bladVast = h('div', { class: 'dialoog dialoog--statisch' }, bladInhoud({ titel: 'Weging noteren', inhoud: wegingInhoud(), acties: [knop('Noteren', { soort: 'primair', breed: true }), knop('Annuleren', { soort: 'secundair', breed: true })] }));
  const toonBlad = knop('Blad met eigen inhoud openen', { soort: 'secundair', opKlik: () => {
    const b = blad({ titel: 'Weging noteren', inhoud: wegingInhoud(), acties: [knop('Noteren', { soort: 'primair', breed: true, opKlik: () => b.sluit() }), knop('Annuleren', { soort: 'secundair', breed: true, opKlik: () => b.sluit() })] });
    b.open();
  } });
  const toonSuppNieuw = knop('Open supplementkaart (nieuw)', { soort: 'secundair', opKlik: () => openSupplementkaart({ opener: document.activeElement }) });
  const toonSuppBestaand = knop('Open supplementkaart (bestaand)', { soort: 'secundair', opKlik: async () => {
    const opener = document.activeElement;
    const lijst = await leesSupplementen({ ookInactief: true });
    if (lijst.length) openSupplementkaart({ id: lijst[0].id, opener });
    else strook('Er is nog geen supplement om te tonen.');
  } });
  const toonMelding = knop('Melding tonen', { soort: 'secundair', opKlik: () => strook('Genoteerd.', { actie: { label: 'Ongedaan maken', opKlik: () => {} }, duur: 4000 }) });

  const alleenTekst = h('div', { class: 'sp-rij' }, knop('Algemeen', { soort: 'tekst' }), knop('Algemeen', { soort: 'tekst', uitgeschakeld: true }));

  return sectie(
    6,
    'Componenten',
    'Elk onderdeel met zijn toestanden: rust, ingedrukt (schaal 0,97), focus, uitgeschakeld. De toestanden ingedrukt en focus zijn hier vastgezet om ze te kunnen zien.',
    kolommen(
    sub('Kaart'),
    h(
      'div',
      { class: 'sp-twee' },
      kaart({ label: 'Vandaag', titel: 'Kaarttitel in Cormorant' }, h('p', { class: 't-body' }, 'Wit, radius 16, padding 20, één zachte schaduw en geen rand. Eén accentkleur per kaart.')),
      kaart(
        { label: 'Drinken' },
        rij({ tegel: { naam: 'glass-water', familie: 'drank' }, titel: 'Water', tekst: '800 ml', eind: '09:05', opKlik: wijzig }),
        rij({ tegel: { naam: 'mug-hot', familie: 'drank' }, titel: 'Thee', tekst: '200 ml', eind: '11:20', opKlik: wijzig }),
      ),
    ),
    sub('Knoppen'),
    h('div', { class: 'sp-toestanden' }, ...knopRij('primair', 'Primair'), ...knopRij('secundair', 'Secundair'), ...knopRij('tekst', 'Tekstknop')),
    h('div', { class: 'sp-rij', style: { marginTop: 'var(--s-4)' } }, knop('Foto erbij', { soort: 'primair', icoon: 'camera' }), knop('Favoriet', { soort: 'secundair', icoon: 'heart' }), icoonknop('rotate-left', { label: t('algemeen.ja'), opKlik: wijzig })),
    sub('Chips en segment'),
    h('div', { class: 'sp-kolom' },
      chips({ label: 'Soort drank', keuzes: [{ id: 'water', label: 'Water' }, { id: 'thee', label: 'Thee' }, { id: 'koffie', label: 'Koffie' }, { id: 'sap', label: 'Sap' }, { id: 'anders', label: 'Glas water' }], actief: 'water' }),
      h('div', { class: 'sp-rij sp-rij--midden' }, segment({ label: 'Periode', keuzes: [{ id: '1m', label: '1M' }, { id: '3m', label: '3M' }, { id: '1j', label: '1J' }], actief: '3m' }), segment({ label: 'Weergave', keuzes: [{ id: 'dag', label: 'Dag' }, { id: 'week', label: 'Week' }, { id: 'maand', label: 'Maand' }], actief: 'week' })),
      h('div', { class: 'sp-rij sp-rij--midden' }, chip('Niet gekozen'), chip('Gekozen', { actief: true }), chip('Uitgeschakeld', { uitgeschakeld: true })),
    ),
    sub('Invoer'),
    h(
      'div',
      { class: 'sp-twee' },
      h('div', { class: 'sp-kolom' },
        veld('Tekstveld', tekstveld({ plaats: 'Bijvoorbeeld havermout met banaan', label: 'Tekstveld' })),
        veld('Gevuld', tekstveld({ waarde: 'Volkoren boterham met hummus', label: 'Gevuld tekstveld' })),
        veld('Tekstvak, groeit mee', tekstvak({ waarde: 'Een rustige dag. Lang gewandeld en vroeg naar bed.', plaats: t('dag.notitiePlaats'), label: t('dag.notitie') })),
        veld('Uitgeschakeld', tekstveld({ waarde: 'Niet te wijzigen', label: 'Uitgeschakeld', uitgeschakeld: true })),
      ),
      h('div', { class: 'sp-kolom' },
        veld('Tijdveld', tijdveld({ waarde: '08:10', opWijzig: wijzig })),
        veld('Stapper (kan, 50 tot 1000 ml)', stapper({ waarde: 800, stap: 50, min: 50, max: 1000, opmaak: (n) => n + ' ml', opWijzig: wijzig, label: 'Grootte van een kan' })),
        veld('Stapper op de grens', stapper({ waarde: 50, stap: 50, min: 50, max: 1000, opmaak: (n) => n + ' ml', label: 'Op het minimum' })),
        veld('Schakelaar', schakelaar({ label: 'Herinnering in de avond', uitleg: 'Elke dag om 20:00', aan: true }), schakelaar({ label: 'Herinnering in de ochtend', aan: false })),
        veld('Vinkvak', vinkvak({ label: 'Gedaan voor vandaag', aan: true }), vinkvak({ label: 'Nog niet', aan: false })),
      ),
    ),
    sub('Dialoog en melding'),
    h(
      'div',
      { class: 'sp-twee' },
      h('div', { class: 'sp-kolom' }, bijschrift('Dialoog: een blad onderaan met radius 24, focus gevangen, Escape sluit.'), dialoogVast, toonDialoog, bijschrift('Blad met eigen inhoud (bv. Weging noteren): zelfde stijl, Escape of een tik ernaast sluit.'), bladVast, toonBlad, bijschrift('De supplementkaart: een dialog om een supplement toe te voegen of aan te passen.'), toonSuppNieuw, toonSuppBestaand),
      h('div', { class: 'sp-kolom' }, bijschrift('Melding onderaan, role="status", met een optionele actie.'), strookElement('Genoteerd.', { label: 'Ongedaan maken' }), strookElement('Je back-up is bewaard.'), toonMelding),
    ),
    sub('Schermkop'),
    h('div', { class: 'sp-kolom' },
      bijschrift('Met huisje (standaard)'),
      kaart({}, schermkop({ titel: 'Supplementen' })),
      bijschrift('Met label en een actie'),
      kaart({}, schermkop({ label: 'Algemeen', titel: 'Instellingen', acties: [knop('Aanpassen', { soort: 'tekst' })] })),
      bijschrift('Zonder huisje (Vandaag heeft geen schermkop)'),
      kaart({}, schermkop({ titel: 'Gewicht', home: false })),
    ),
    sub('Blad en dialoog op een breed scherm'),
    bijschrift('Vanaf 960 px is een blad of dialoog een gecentreerd venster van hoogstens 480 px, met radius 24 rondom en een zwevende schaduw. Op een telefoon is het een blad onderaan.'),
    h('div', { class: 'sp-scrim' }, h('div', { class: 'dialoog dialoog--venster' }, bladInhoud({ titel: 'Deze weging wissen?', inhoud: h('p', { class: 'dialoog__tekst' }, 'Je kan ze daarna opnieuw noteren.'), acties: [knop('Wissen', { soort: 'primair', breed: true }), knop('Laten staan', { soort: 'secundair', breed: true })] }))),
    sub('Bladerkop'),
    h(
      'div',
      { class: 'sp-kolom' },
      kaart({}, bladerkop({ label: 'Dag', titel: 'donderdag 12 november', opVorige: wijzig, opVolgende: wijzig })),
      kaart({}, bladerkop({ titel: 'vandaag', opVorige: wijzig, opVolgende: wijzig, volgendeUit: true })),
    ),
    sub('Lege toestand'),
    kaart({}, legeToestand({ tekst: 'Nog niets genoteerd vandaag.', actie: { label: 'Begin met je ontbijt', opKlik: wijzig } })),
    sub('Tekstknop'),
    alleenTekst,
    ),
  );
}

// ---------------------------------------------------------------- 7. tabbalk en zijbalk

function maakNavigatie() {
  const { el: balk } = tabbalk({ actief: 'dagboek', voorbeeld: true });
  const { el: balk2 } = tabbalk({ actief: 'gewicht', voorbeeld: true });
  const { el: rail } = zijbalk({ actief: 'vandaag', voorbeeld: true });

  const binnen = h(
    'div',
    { class: 'sp-desktop__binnen' },
    rail,
    h(
      'div',
      { class: 'sp-desktop__inhoud' },
      h('div', { class: 'sp-hero-tekst' }, h('h3', { class: 't-hero' }, 'Goeiemorgen, Testnaam'), h('p', { class: 'label' }, 'donderdag 12 november')),
      h(
        'div',
        { class: 'sp-desktop__kolommen' },
        kaart({ label: 'Eten' }, rij({ tegel: { naam: 'mug-saucer', familie: 'maaltijd' }, titel: t('maaltijd.ontbijt'), tekst: 'Havermout met banaan', eind: '08:10' }), rij({ tegel: { naam: 'bowl-food', familie: 'maaltijd' }, titel: t('maaltijd.middagmaal'), tekst: 'Boterham met hummus', eind: '12:30' })),
        h('div', { class: 'sp-kolom' }, kaart({ label: 'Drinken' }, h('p', { class: 't-body' }, '0,75 liter van 2 l'))),
      ),
    ),
  );
  // Zijbalk op ware grootte (248 px) in een kader van 1280 x 800. Op een telefoon scrolt het kader horizontaal.
  const kader = h('div', { class: 'sp-desktop' }, binnen);

  return sectie(
    7,
    'Tabbalk en zijbalk',
    'Op een telefoon een tabbalk onderaan (64 px plus safe-area), vanaf 960 px een zijbalk van 248 px met het logo bovenaan.',
    h(
      'div',
      { class: 'sp-telefoons' },
      h('div', { class: 'sp-kolom' }, bijschrift('Tabbalk, Dagboek actief'), h('div', { class: 'sp-telefoon' }, balk)),
      h('div', { class: 'sp-kolom' }, bijschrift('Tabbalk, Algemeen actief'), h('div', { class: 'sp-telefoon' }, balk2)),
    ),
    sub('Zijbalk'),
    bijschrift('Zijbalk, Vandaag actief, op ware grootte in een kader van 1280 x 800.'),
    kader,
  );
}

// ---------------------------------------------------------------- 8. ritme

function maakRitme() {
  const ruimtes = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const hoeken = [
    ['--r-sm', 'chips, invoer'],
    ['--r-md', 'kaarten'],
    ['--r-lg', 'bladen, grote kaarten'],
    ['--r-pill', 'knoppen'],
    ['--tile-radius', 'icoontegels'],
  ];
  const waardeVan = (token) => {
    const p = h('span', { class: 'sp-code sp-mono' });
    const v = () => (p.textContent = leesToken(token));
    waardeVernieuwers.push(v);
    v();
    return p;
  };
  return sectie(
    8,
    'Ritme',
    'Raster van 4 px. Schermmarge 20, ruimte tussen kaarten 16, tussen secties 32. Overgangen 260 ms met --ease; tikken geeft schaal 0,97.',
    sub('Ruimte'),
    h(
      'div',
      { class: 'sp-kolom' },
      ...ruimtes.map((n) => {
        const blok = h('span', { class: 'sp-ruimte__blok', style: { width: `var(--s-${n})` } });
        return h('div', { class: 'sp-ruimte' }, h('span', { class: 'sp-naam sp-mono', style: { minWidth: '4em' } }, `--s-${n}`), blok, waardeVan(`--s-${n}`));
      }),
    ),
    sub('Hoeken'),
    h(
      'div',
      { class: 'sp-grid' },
      ...hoeken.map(([token, rol]) =>
        h('div', { class: 'sp-hoek' }, h('div', { class: 'sp-hoek__vlak', style: { borderRadius: `var(${token})` } }), h('p', { class: 'sp-naam sp-mono' }, token), h('p', { class: 'sp-bijschrift' }, rol), waardeVan(token)),
      ),
    ),
    sub('Schaduw'),
    h(
      'div',
      { class: 'sp-grid sp-grid--breed' },
      h('div', { class: 'sp-schaduw' }, h('div', { class: 'sp-schaduw__vlak', style: { boxShadow: 'var(--shadow-card)' } }), h('p', { class: 'sp-naam sp-mono', style: { marginTop: 'var(--s-3)' } }, '--shadow-card')),
      h('div', { class: 'sp-schaduw' }, h('div', { class: 'sp-schaduw__vlak', style: { boxShadow: 'var(--shadow-float)' } }), h('p', { class: 'sp-naam sp-mono', style: { marginTop: 'var(--s-3)' } }, '--shadow-float')),
    ),
  );
}

// ---------------------------------------------------------------- 10 tot 13: beeld voor de schermen

function maakWater() {
  const stand = h('span', { class: 'cijfer sp-code' }, '');
  const glas = watervulling({ vulling: 0.5, gehaald: false, grootte: 260, label: 'Watervulling' });
  let gehaald = false;
  const toon = (p) => {
    glas.zet(p / 100, gehaald);
    stand.textContent = Math.round(p) + '%';
  };
  const schuif = h('input', { type: 'range', min: 0, max: 133, value: 50, step: 1, 'aria-label': 'Vulling in procent', class: 'sp-schuif' });
  schuif.addEventListener('input', () => toon(Number(schuif.value)));
  const knopGehaald = knop('Doel gehaald', { soort: 'secundair', opKlik: () => {
    gehaald = !gehaald;
    glas.zet(Number(schuif.value) / 100, gehaald);
  } });
  toon(50);
  const vast = (p, g = false) => toestand(p + '%' + (g ? ', gehaald' : ''), watervulling({ vulling: p / 100, gehaald: g, grootte: 140 }));
  return sectie(
    9,
    'Watervulling',
    'Eén glasvorm. Bij 100% is het glas vol tot bovenaan en daarboven verandert er niets meer: nooit hoger dan vol, nooit buiten de vorm. Doel gehaald maakt de vulling salie en het beeldmerk bloeit.',
    h('div', { class: 'sp-twee' },
      h('div', { class: 'sp-kolom', style: { alignItems: 'flex-start' } }, glas, h('div', { class: 'sp-rij sp-rij--midden', style: { width: '100%' } }, schuif, stand), knopGehaald),
      h('div', { class: 'sp-rij' }, vast(0), vast(25), vast(50), vast(75), vast(100), vast(133), vast(60, true), vast(100, true)),
    ),
  );
}

function demoWegingen(aantal, begin = 68.6) {
  const maandag = weekStart(vandaag());
  const reeks = [];
  for (let i = aantal - 1; i >= 0; i--) {
    const week = plusDagen(maandag, -7 * i);
    reeks.push({ week, datum: plusDagen(week, i % 3), kg: Math.round((begin + Math.sin((aantal - i) * 1.3) * 1.2 - (aantal - i) * 0.12) * 10) / 10, voorbeeld: true, gewijzigdOp: 0 });
  }
  return reeks;
}

function maakGrafieken() {
  const tien = demoWegingen(10);
  const eenWeging = demoWegingen(1);
  const metGat = tien.filter((_, i) => i !== 4 && i !== 5);
  const kaartMet = (label, ...kinderen) => kaart({ label }, h('div', { style: { marginTop: 'var(--s-3)' } }, ...kinderen));
  const jaar = demoWegingen(52);
  const g = grafiek({ wegingen: tien, periode: 'kwartaal', streefKg: 66.5, gekozen: tien[tien.length - 3].week, opKiesPunt: () => {} });
  const periodeKiezer = segment({ label: 'Periode', keuzes: [{ id: 'maand', label: '1M' }, { id: 'kwartaal', label: '3M' }, { id: 'jaar', label: '1J' }], actief: 'kwartaal', opKies: (p) => g.zet({ periode: p }) });
  return sectie(
    10,
    'Gewichtsgrafiek',
    'Dunne lijn in oudroze, punten van 6 px, het streefgewicht als stippellijn in salie en één baseline. Een stijging ziet er hetzelfde uit als een daling. De laagste en hoogste waarde en de maanden staan erbij als kleine labels.',
    h('div', { class: 'sp-twee' },
      h('div', { class: 'sp-kolom' }, kaartMet('Tien wegingen, met streefgewicht', h('div', { class: 'sp-rij', style: { marginBottom: 'var(--s-3)' } }, periodeKiezer), g)),
      h('div', { class: 'sp-kolom' },
        kaartMet('Een jaar, 52 wekelijkse wegingen', grafiek({ wegingen: jaar, periode: 'jaar', streefKg: 64 })),
        kaartMet('Zonder wegingen', grafiek({ wegingen: [], periode: 'kwartaal' })),
        kaartMet('Eén weging', grafiek({ wegingen: eenWeging, periode: 'kwartaal' })),
        kaartMet('Met een gat (lege weken overbrugd)', grafiek({ wegingen: metGat, periode: 'kwartaal', gekozen: metGat[2].week })),
      ),
    ),
  );
}

// Een effen demofoto op een canvas, in de tokenkleuren: geen extern beeld.
function demoFoto() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext('2d');
  ctx.fillStyle = leesToken('--bloei-mist');
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = leesToken('--bloei-poeder');
  ctx.beginPath();
  ctx.arc(320, 250, 150, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL('image/jpeg', 0.9);
}

function maakBeeld() {
  const soorten = Object.keys(MAALTIJDICOON);
  return sectie(
    11,
    'Maaltijdtegel',
    'Bij een maaltijd staat de maaltijdtegel van 56 px: poederroze met een oudroze icoon van het moment. Er zijn geen maaltijdfoto\'s in de app.',
    h('div', { class: 'sp-kolom' },
      kaart(
        { label: 'Maaltijden' },
        ...soorten.map((soort) => rij({ tegel: miniatuur({ soort }), titel: t('maaltijd.' + soort), tekst: 'Een gewone maaltijd', eind: '12:30' })),
      ),
    ),
  );
}

function maakProfielBadge() {
  const url = demoFoto();
  return sectie(
    12,
    'Profielfoto en badges',
    'De profielfoto is rond met een ring van 2 px in de achtergrondkleur en 1 px lijn. Zonder foto staat de initiaal op poederroze. Badges zijn saliegroene tegels; nog niet behaald is een neutrale tegel met het icoon op 40% dekking.',
    h('div', { class: 'sp-twee' },
      h('div', { class: 'sp-kolom' },
        sub('Profielfoto'),
        h('div', { class: 'sp-rij sp-rij--midden' }, profielfoto({ url, naam: 'Testnaam' }), profielfoto({ naam: 'Testnaam' }), profielfoto({ url, naam: 'Testnaam', grootte: 64 }), profielfoto({ naam: 'Testnaam', grootte: 64 }), profielfoto({ naam: 'Testnaam', grootte: 96 })),
      ),
      h('div', { class: 'sp-kolom' },
        sub('Badges'),
        h('div', { class: 'sp-rij sp-rij--midden' }, badgeTegel({ icoon: 'seedling', behaald: true, label: 'Behaald' }), badgeTegel({ icoon: 'award', behaald: true, label: 'Behaald' }), badgeTegel({ icoon: 'seedling', behaald: false, label: 'Nog niet behaald' }), badgeTegel({ icoon: 'award', behaald: false, label: 'Nog niet behaald' })),
      ),
    ),
  );
}

function maakUitklap() {
  const lijst = (aantal) => Array.from({ length: aantal }, (_, i) => vinkvak({ label: ['Multivitamine', 'Kurkuma', 'Vitamine C', 'Voorbeeldspuit', 'Kruidenthee-extract', 'Vezelpoeder'][i % 6], aan: i < 2 }));
  const kaartSupp = uitklapkaart({ label: 'Supplementen', samenvatting: '2 van 6', open: true }, h('div', { class: 'sp-kolom', style: { gap: 0 } }, ...lijst(6)));
  const kaartDrinken = uitklapkaart({ label: 'Drinken', samenvatting: '0,75 liter van 2 l' }, h('p', { class: 't-body' }, 'Hier staat de inhoud van de kaart.'));
  const kaartEten = uitklapkaart(
    { titel: 'Eten', tegel: { naam: 'utensils', familie: 'maaltijd' }, samenvatting: 'Ontbijt, tussendoortje, middagmaal en nog een lange opsomming die netjes afgekapt wordt' },
    rij({ tegel: { naam: 'mug-saucer', familie: 'maaltijd' }, titel: t('maaltijd.ontbijt'), tekst: 'Havermout met banaan', eind: '08:10' }),
    rij({ tegel: { naam: 'bowl-food', familie: 'maaltijd' }, titel: t('maaltijd.middagmaal'), tekst: 'Boterham met hummus', eind: '12:30' }),
  );
  return sectie(
    13,
    'Uitklapkaart',
    'Een inklapbare kaart met een samenvatting in de kop, zodat een scherm kort blijft. De kop is één knop (minstens 56 px hoog); de chevron draait een kwartslag; de inhoud schuift open in 260 ms.',
    h('div', { class: 'sp-twee' },
      h('div', { class: 'sp-kolom' }, kaartDrinken, kaartEten),
      h('div', { class: 'sp-kolom' }, kaartSupp),
    ),
  );
}

function maakBewegingRaster() {
  const demoKaarten = [
    kaart({ klasse: 'sp-demo' }, kaartkop({ tegel: { naam: 'glass-water', familie: 'drank' }, label: 'Drinken', eind: '0,75 liter' }), h('p', { class: 't-body' }, 'Elke kaart begint met dezelfde kop.')),
    kaart({ klasse: 'sp-demo' }, kaartkop({ tegel: { naam: 'utensils', familie: 'maaltijd' }, label: 'Eten', eind: '3 van 6' }), h('p', { class: 't-body' }, 'Gelijke hoogte per rij.')),
    kaart({ klasse: 'sp-demo' }, kaartkop({ tegel: { naam: 'weight-scale', familie: 'gewicht' }, label: 'Gewicht' }), h('p', { class: 't-body' }, 'Een kaart vult zijn rij.')),
  ];
  const cijfer = kerncijfer({ label: 'Laatste weging', waarde: '68,4', eenheid: 'kg', tegel: { naam: 'weight-scale', familie: 'gewicht' } });
  const badge = badgeTegel({ icoon: 'seedling', behaald: true, label: 'Behaald' });
  const speel = knop('Speel af', { soort: 'secundair', icoon: 'rotate-left', opKlik: () => {
    komOp(demoKaarten);
    bloeiOp(badge);
    telOp(cijfer.getal, 68.4, { van: 0, opmaak: (n) => n.toFixed(1).replace('.', ',') });
  } });
  return sectie(
    14,
    'Beweging en raster',
    'Eén bewegingstaal, zichtbaar maar rustig. Kaarten komen 20 px omhoog op in 520 ms, 90 ms na elkaar (hoogstens vijf stappen, alles binnen ongeveer een seconde); een getal telt op in 700 ms; iets nieuws bloeit één keer op (600 ms). Bij een muis beweegt een kaart niet en krijgt ze geen andere schaduw (BESLISSING 195); alles met een icoon (rij, vak, chip, menu-item, themategel) licht alleen op via zijn icoon: de tegel groeit tot 1,07 met een zachte schaduw eronder en de pijl schuift 4 px op, zonder kader rond het element (BESLISSING 190; de gedeelde regel staat onderaan componenten.css); een knop tilt 1 px op met een lichte schaduw en een tekstknop krijgt een onderstreping; nooit een andere achtergrondkleur bij hover of indrukken (BESLISSING 188); drukken is schaal 0,98. Alleen opacity, transform, schaduw, tekstkleur en onderstreping; niets bij een hertekening, en bij verminderde beweging staat het eindbeeld er meteen.',
    h('div', { class: 'sp-kolom' },
      h('div', { class: 'sp-rij sp-rij--midden' }, speel, badge, cijfer),
      sub('Raster van drie kaarten'),
      h('div', { class: 'raster raster--3' }, ...demoKaarten),
      sub('Tikbaar: kaart, rij en chips met hover (muis) en drukstand'),
      h('div', { class: 'raster raster--zij' },
        kaart({ opKlik: () => {}, klasse: 'sp-demo' }, kaartkop({ tegel: { naam: 'award', familie: 'gezondheid' }, label: 'Kaart als knop', eind: 'Bekijk' }), h('p', { class: 't-body' }, 'Beweeg erover: 2 px omhoog met een diepere schaduw. Druk: schaal 0,98.')),
        kaart({}, rij({ tegel: { naam: 'mug-saucer', familie: 'maaltijd' }, titel: 'Rij als knop', tekst: 'Een tint achter de rij', opKlik: () => {} }), h('div', { class: 'chips', style: { marginTop: 'var(--s-3)' } }, chip('Chip'), chip('Gekozen', { actief: true }))),
      ),
    ),
  );
}

// ---------------------------------------------------------------- opbouw

function bouw() {
  const houder = document.getElementById('stijl');

  const themaNamen = THEMAS.map((id) => ({ id, label: t('thema.' + id) }));
  const url = new URLSearchParams(location.search).get('thema');
  const start = THEMAS.includes(url) ? url : 'poeder';
  const kiezer = segment({ label: t('thema.titel'), keuzes: themaNamen, actief: start, opKies: zetThema });

  houder.append(
    h('header', { class: 'sp-kop' }, h('div', { class: 'sp-kop__binnen' }, logo({ grootte: 28 }), kiezer)),
    h('main', { class: 'sp' }, maakLogoSectie(), maakVoorproefje(), maakKleuren(), maakTypografie(), maakIconen(), maakComponenten(), maakNavigatie(), maakRitme(), maakWater(), maakGrafieken(), maakBeeld(), maakProfielBadge(), maakUitklap(), maakBewegingRaster()),
  );
  zetThema(start);
}

bouw();
