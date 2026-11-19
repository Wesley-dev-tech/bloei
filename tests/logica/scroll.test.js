// BESLISSING 465: de pure keuzes achter "terugkeren op de plaats waar je was" (src/kern/scroll.js).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { herstelPositie, isTerugkeer, isVoorouder, leesStand, maakNavigatie, nodigeHoogte, zetScroll } from '../../src/kern/scroll.js';

const komtVan = new Map([['meer/instellingen', 'meer'], ['delen', 'dagboek']]);

describe('isTerugkeer', () => {
  test('een stap in de geschiedenis is altijd een terugkeer', () => {
    expect(isTerugkeer({ viaTerug: true, vooruit: false, vorigePad: 'meer/instellingen', pad: 'meer', komtVan })).toBe(true);
  });
  test('de terugknop van de schermkop naar het ouderscherm is een terugkeer', () => {
    expect(isTerugkeer({ viaTerug: false, vooruit: false, vorigePad: 'meer/instellingen', pad: 'meer', komtVan })).toBe(true);
    expect(isTerugkeer({ viaTerug: false, vooruit: false, vorigePad: 'delen', pad: 'dagboek', komtVan })).toBe(true);
  });
  test('een tik op een tabblad of het huisje is vooruit', () => {
    expect(isTerugkeer({ viaTerug: false, vooruit: true, vorigePad: 'meer/instellingen', pad: 'meer', komtVan })).toBe(false);
  });
  test('een ander scherm dan het ouderscherm is vooruit', () => {
    expect(isTerugkeer({ viaTerug: false, vooruit: false, vorigePad: 'meer', pad: 'meer/badges', komtVan })).toBe(false);
    expect(isTerugkeer({ viaTerug: false, vooruit: false, vorigePad: 'meer/instellingen', pad: 'vandaag', komtVan })).toBe(false);
  });
  test('zelfde scherm of de eerste tekening is geen terugkeer', () => {
    expect(isTerugkeer({ viaTerug: true, vooruit: false, vorigePad: 'meer', pad: 'meer', komtVan })).toBe(false);
    expect(isTerugkeer({ viaTerug: true, vooruit: false, vorigePad: null, pad: 'meer', komtVan })).toBe(false);
  });
});

describe('leesStand en nodigeHoogte', () => {
  test('de stand van de ingang telt alleen voor hetzelfde pad', () => {
    const state = { bloeiScroll: { pad: 'meer', y: 412 }, bloeiVenster: 5 };
    expect(leesStand(state, 'meer')).toBe(412);
    expect(leesStand(state, 'vandaag')).toBeNull();
    expect(leesStand(null, 'meer')).toBeNull();
    expect(leesStand({ bloeiScroll: { pad: 'meer', y: 'x' } }, 'meer')).toBeNull();
  });
  test('de pagina moet minstens stand plus venster hoog zijn', () => {
    expect(nodigeHoogte(412.4, 844)).toBe(1257);
  });
});

// BESLISSING 695: een tik op het tabblad van het deel waarin ze al zit, is terugkeren naar het beginscherm van dat tabblad.
describe('isTerugkeer met viaTab en zelfdeTab', () => {
  const keten = new Map([['meer/profiel', 'meer'], ['meer/instellingen', 'meer'], ['meer/drinken', 'meer/instellingen'], ['delen', 'dagboek']]);
  const tik = (extra) => isTerugkeer({ viaTerug: false, vooruit: true, viaTab: true, zelfdeTab: true, vorigePad: 'meer/profiel', pad: 'meer', komtVan: keten, ...extra });

  test('zelfde tabblad en het beginscherm opende het vertrekscherm: terugkeer', () => {
    expect(tik({})).toBe(true);
  });
  test('ook langs een tussenscherm (kleinkind) is het een terugkeer', () => {
    expect(tik({ vorigePad: 'meer/drinken' })).toBe(true);
  });
  test('zelfde tabblad maar het scherm opende het vertrekscherm niet: vooruit', () => {
    expect(tik({ pad: 'meer/badges' })).toBe(false);
    expect(tik({ vorigePad: 'meer/profiel', pad: 'meer/instellingen' })).toBe(false); // zusterscherm
    expect(tik({ vorigePad: 'meer', pad: 'meer/profiel' })).toBe(false); // omgekeerd: een ouder is geen kind van zijn kind
  });
  test('een ander tabblad blijft vooruit, ook als het scherm een ouder is', () => {
    expect(tik({ zelfdeTab: false })).toBe(false);
    expect(tik({ zelfdeTab: false, vorigePad: 'delen', pad: 'dagboek' })).toBe(false);
  });
  test('het huisje (vooruit zonder viaTab) blijft vooruit, ook als het scherm een ouder is', () => {
    expect(tik({ viaTab: false })).toBe(false);
    expect(tik({ viaTab: false, zelfdeTab: false })).toBe(false);
  });
  test('viaTab en zelfdeTab hebben zonder vooruit geen invloed: de regel van de teruglink geldt', () => {
    expect(isTerugkeer({ viaTerug: false, vooruit: false, viaTab: false, zelfdeTab: false, vorigePad: 'meer/profiel', pad: 'meer', komtVan: keten })).toBe(true);
    expect(isTerugkeer({ viaTerug: false, vooruit: false, viaTab: true, zelfdeTab: true, vorigePad: 'meer/badges', pad: 'meer', komtVan: keten })).toBe(false);
  });
  test('de terugknop van de browser blijft altijd terugkeren, ook bij een tik op een ander tabblad', () => {
    expect(isTerugkeer({ viaTerug: true, vooruit: true, viaTab: true, zelfdeTab: false, vorigePad: 'meer/badges', pad: 'vandaag', komtVan: keten })).toBe(true);
  });
  test('zonder komtVan of zonder vermelding is een tik op het tabblad vooruit', () => {
    expect(tik({ komtVan: undefined })).toBe(false);
    expect(tik({ komtVan: new Map() })).toBe(false);
  });
  test('zelfde scherm of de eerste tekening blijft geen terugkeer', () => {
    expect(tik({ vorigePad: 'meer', pad: 'meer' })).toBe(false);
    expect(tik({ vorigePad: null })).toBe(false);
    expect(tik({ vorigePad: undefined })).toBe(false);
  });
  test('randgeval: een scherm dat via een rechtstreeks adres geopend werd heeft geen komtVan, dus het tabblad begint bovenaan', () => {
    // Na een herlaadbeurt op #/meer/profiel is komtVan leeg: een tik op Algemeen telt dan als vooruit (bovenaan). Verwacht gedrag.
    expect(tik({ komtVan: new Map() })).toBe(false);
  });
  test('randgeval: een verouderde vermelding in komtVan telt mee', () => {
    // Mogelijk fout, gemeld aan de teamlead: komtVan wordt nooit opgeruimd. Een vermelding uit een eerdere reis blijft gelden: heeft
    // 'meer/badges' ooit uit 'meer' geopend en ze komt er later op een andere manier weer (bijvoorbeeld een rechtstreeks adres, waarbij
    // komtVan niet bijgewerkt wordt), dan keert het tabblad Algemeen toch terug naar de oude stand. Dat lijkt gewenst, maar het huidige
    // gedrag wordt hier vastgelegd.
    const oud = new Map([['meer/badges', 'meer']]);
    expect(tik({ komtVan: oud, vorigePad: 'meer/badges' })).toBe(true);
  });
  test('randgeval: Algemeen > Profiel > tabblad Algemeen > tabblad Algemeen opnieuw', () => {
    // Eerste tik: terugkeer; app.js zet bij een terugkeer geen komtVan, dus de vermelding meer/profiel > meer blijft staan.
    expect(tik({})).toBe(true);
    // Tweede tik: pad en vorigePad zijn beide 'meer' (geen wissel van route): geen terugkeer.
    expect(tik({ vorigePad: 'meer', pad: 'meer' })).toBe(false);
    // Daarna opnieuw Profiel openen en met het tabblad terug werkt nog.
    expect(tik({})).toBe(true);
  });
});

describe('isVoorouder', () => {
  const komtVan = new Map([['c', 'b'], ['b', 'a'], ['x', 'y']]);
  test('een rechtstreeks kind', () => expect(isVoorouder(komtVan, 'b', 'a')).toBe(true));
  test('een kleinkind', () => expect(isVoorouder(komtVan, 'c', 'a')).toBe(true));
  test('de tussenstap is ook een voorouder', () => expect(isVoorouder(komtVan, 'c', 'b')).toBe(true));
  test('zichzelf is geen voorouder', () => {
    expect(isVoorouder(komtVan, 'a', 'a')).toBe(false);
    expect(isVoorouder(komtVan, 'c', 'c')).toBe(false);
  });
  test('het ouderscherm is geen kind van zijn kind', () => expect(isVoorouder(komtVan, 'a', 'c')).toBe(false));
  test('een scherm uit een ander deel', () => {
    expect(isVoorouder(komtVan, 'c', 'y')).toBe(false);
    expect(isVoorouder(komtVan, 'x', 'a')).toBe(false);
  });
  test('een onbekend pad of lege invoer', () => {
    expect(isVoorouder(komtVan, 'onbekend', 'a')).toBe(false);
    expect(isVoorouder(komtVan, 'c', 'onbekend')).toBe(false);
    expect(isVoorouder(new Map(), 'c', 'a')).toBe(false);
    expect(isVoorouder(undefined, 'c', 'a')).toBe(false);
    expect(isVoorouder(null, 'c', 'a')).toBe(false);
    expect(isVoorouder(komtVan, undefined, 'a')).toBe(false);
    expect(isVoorouder(komtVan, 'c', undefined)).toBe(false);
    expect(isVoorouder(komtVan, null, null)).toBe(false);
  });
  test('een lus in komtVan blijft niet hangen', () => {
    const lus = new Map([['a', 'b'], ['b', 'c'], ['c', 'b']]);
    expect(isVoorouder(lus, 'a', 'zzz')).toBe(false);
    expect(isVoorouder(lus, 'a', 'c')).toBe(true);
  });
  test('randgeval: bij een lus (a, b, a) is een scherm zijn eigen voorouder', () => {
    // Mogelijk fout, gemeld aan de teamlead: zichzelf is alleen geen voorouder zolang komtVan geen lus heeft. isTerugkeer wordt
    // beschermd door pad === vorigePad, dus waarschijnlijk geen gevolg in de praktijk. Het huidige gedrag wordt vastgelegd.
    const lus = new Map([['a', 'b'], ['b', 'a']]);
    expect(isVoorouder(lus, 'a', 'a')).toBe(true);
  });
});

// maakNavigatie en zetScroll draaien in een node-omgeving: window, document, history en location worden nagebootst.
describe('maakNavigatie: de tik op een tabblad onthouden', () => {
  let klik;
  let nav;
  const TAB = '#tabbalk a, #zijbalk a';
  const doelVan = (soort) => ({
    closest: (s) => {
      if (s.includes('.schermkop__home')) return soort === 'tab' || soort === 'huisje' ? {} : null;
      if (s === TAB) return soort === 'tab' ? {} : null;
      return null;
    },
  });
  const tikOp = (soort) => klik({ target: doelVan(soort) });

  beforeEach(() => {
    vi.useFakeTimers();
    const luisteraars = {};
    vi.stubGlobal('history', {
      state: null,
      replaceState(s) {
        this.state = s;
      },
    });
    vi.stubGlobal('location', { hash: '#/meer' });
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('document', {
      addEventListener: (type, f) => {
        luisteraars[type] = f;
      },
      scrollingElement: { scrollTop: 0 },
      documentElement: { style: {} },
      visibilityState: 'visible',
    });
    nav = maakNavigatie({ contains: () => false });
    klik = luisteraars.click;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('zonder tik is er geen richting', () => {
    expect(nav.neemRichting()).toEqual({ viaTerug: false, vooruit: false, viaTab: false });
  });
  test('een tik op een tabblad is vooruit via een tabblad', () => {
    tikOp('tab');
    expect(nav.neemRichting()).toEqual({ viaTerug: false, vooruit: true, viaTab: true });
  });
  test('een tik op het huisje is vooruit, maar niet via een tabblad', () => {
    tikOp('huisje');
    expect(nav.neemRichting()).toEqual({ viaTerug: false, vooruit: true, viaTab: false });
  });
  test('de onthouden tik is na gebruik vergeten', () => {
    tikOp('tab');
    nav.neemRichting();
    expect(nav.neemRichting()).toEqual({ viaTerug: false, vooruit: false, viaTab: false });
  });
  test('een tweede navigatie zonder tabblad erft de vlag niet', () => {
    tikOp('tab');
    nav.neemRichting();
    tikOp('huisje');
    expect(nav.neemRichting().viaTab).toBe(false);
    tikOp('overig');
    expect(nav.neemRichting()).toEqual({ viaTerug: false, vooruit: false, viaTab: false });
  });
  test('een tik op een tabblad na een tik op het huisje wordt weer via een tabblad', () => {
    tikOp('huisje');
    tikOp('tab');
    expect(nav.neemRichting().viaTab).toBe(true);
  });
  test('een tik op het huisje wist de vlag van een eerdere tik op een tabblad die nog niet gebruikt werd', () => {
    tikOp('tab');
    tikOp('huisje');
    expect(nav.neemRichting().viaTab).toBe(false);
  });
  test('na 600 ms is de tik vergeten', () => {
    tikOp('tab');
    vi.advanceTimersByTime(599);
    expect(nav.neemRichting().viaTab).toBe(true);
    tikOp('tab');
    vi.advanceTimersByTime(600);
    expect(nav.neemRichting()).toEqual({ viaTerug: false, vooruit: false, viaTab: false });
  });
  test('een ingang met merkteken is een stap in de geschiedenis', () => {
    history.state = { bloeiId: 'x' };
    expect(nav.neemRichting()).toEqual({ viaTerug: true, vooruit: false, viaTab: false });
    tikOp('tab');
    expect(nav.neemRichting()).toEqual({ viaTerug: true, vooruit: true, viaTab: true });
  });
  test('een tik buiten tabbalk, zijbalk en huisje verandert niets', () => {
    tikOp('overig');
    expect(nav.neemRichting().vooruit).toBe(false);
  });
});

describe('zetScroll', () => {
  let html;
  let scroller;
  let aanroepen;
  beforeEach(() => {
    html = { style: { scrollBehavior: 'smooth' } };
    scroller = { scrollTop: 0 };
    aanroepen = [];
    vi.stubGlobal('document', { documentElement: html, scrollingElement: scroller });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('scrolt meteen en zonder glijden, en zet scroll-behavior daarna terug', () => {
    let tijdens;
    vi.stubGlobal('window', {
      scrollTo: (...a) => {
        tijdens = html.style.scrollBehavior;
        aanroepen.push(a);
        scroller.scrollTop = 300;
      },
    });
    zetScroll(300);
    expect(aanroepen).toEqual([[{ top: 300, left: 0, behavior: 'instant' }]]);
    expect(tijdens).toBe('auto');
    expect(html.style.scrollBehavior).toBe('smooth');
  });
  test('een browser die scrollTo met opties niet kent: terugval op scrollTo(0, y)', () => {
    vi.stubGlobal('window', {
      scrollTo: (...a) => {
        if (typeof a[0] === 'object') throw new TypeError('geen opties');
        aanroepen.push(a);
        scroller.scrollTop = a[1];
      },
    });
    zetScroll(450);
    expect(aanroepen).toEqual([[0, 450]]);
    expect(html.style.scrollBehavior).toBe('smooth');
  });
  test('doet scrollTo niets, dan zet het scrollTop zelf', () => {
    vi.stubGlobal('window', { scrollTo: () => {} });
    zetScroll(120);
    expect(scroller.scrollTop).toBe(120);
  });
  test('scrollTop dat al binnen 1 px klopt, blijft ongemoeid', () => {
    scroller.scrollTop = 120.5;
    vi.stubGlobal('window', { scrollTo: () => {} });
    zetScroll(120);
    expect(scroller.scrollTop).toBe(120.5);
  });
  test('een lege scroll-behavior wordt ook leeg teruggezet', () => {
    html.style.scrollBehavior = '';
    vi.stubGlobal('window', { scrollTo: () => {} });
    zetScroll(10);
    expect(html.style.scrollBehavior).toBe('');
  });
});

describe('herstelPositie: een tik van de gebruiker stopt het vasthouden zonder terug te zetten', () => {
  let luisteraars;
  let scroller;
  let zetten;
  beforeEach(() => {
    luisteraars = {};
    scroller = { scrollTop: 0 };
    zetten = [];
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('document', { documentElement: { style: {} }, scrollingElement: scroller });
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: (type, f) => {
        luisteraars[type] = f;
      },
      removeEventListener: (type) => {
        delete luisteraars[type];
      },
      scrollTo: (o, y2) => {
        const y = typeof o === 'object' ? o.top : y2;
        zetten.push(y);
        scroller.scrollTop = y;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const houder = () => ({ style: { minHeight: '', removeProperty() {} }, children: [], querySelectorAll: () => [] });

  test('de tik (pointerdown) zet de pagina niet nog eens op de oude hoogte', () => {
    herstelPositie({ houder: houder(), y: 500 });
    expect(scroller.scrollTop).toBe(500);
    scroller.scrollTop = 480; // de gebruiker staat intussen een eind verder
    const voor = zetten.length;
    luisteraars.pointerdown();
    expect(zetten.length).toBe(voor);
    expect(scroller.scrollTop).toBe(480);
    expect(luisteraars.pointerdown).toBeUndefined();
  });

  test('stopt de app het zelf (de teruggegeven functie), dan staat de stand er wel', () => {
    const stop = herstelPositie({ houder: houder(), y: 500 });
    scroller.scrollTop = 480;
    stop();
    expect(scroller.scrollTop).toBe(500);
  });
});
