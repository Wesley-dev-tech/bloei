// Trusted Types (BESLISSING 430, OWASP OW-06): de twee policies, hun controle, de terugval zonder API en de CSP in beide bouwen.
// De echte afdwinging in de browser toetst de schermronde (zie het rapport); hier alles wat zonder browser na te gaan is.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isEigenSvg, _policiesVoor, POLICY_SVG, POLICY_SW, SW_URL } from '../../src/kern/trusted-types.js';
import { cspBeleid, cspKop, inlineScriptHashes } from '../../scripts/csp.mjs';

const WORTEL = join(import.meta.dirname, '..', '..');
const lees = (...pad) => readFileSync(join(WORTEL, ...pad), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Een nagebootste trustedTypes zoals een browser met afdwinging hem heeft: createPolicy geeft een object met de create-functies,
// en die verpakken de uitkomst (zoals TrustedHTML / TrustedScriptURL).
function nepTrustedTypes({ weiger = false } = {}) {
  const namen = [];
  return {
    namen,
    createPolicy(naam, regels) {
      if (weiger) throw new TypeError('Policy ' + naam + ' niet toegelaten');
      namen.push(naam);
      return {
        name: naam,
        createHTML: (s) => ({ soort: 'TrustedHTML', waarde: regels.createHTML(s) }),
        createScriptURL: (s) => ({ soort: 'TrustedScriptURL', waarde: regels.createScriptURL(s) }),
      };
    },
  };
}

describe('de controle van bloei-svg: alleen de eigen vaste svg', () => {
  it('laat de vaste svg-vormen van de app door (icoon, medaille, watervulling, lege grafiek, blad)', () => {
    for (const markup of [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24" fill="currentColor" focusable="false"><path d="M0 0h10v10z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" class="medaille__voortgang" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="medaille__baan" cx="50" cy="50" r="46.5"/><circle class="medaille__boog" cx="50" cy="50" r="46.5" pathLength="100"/></svg>',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 196" focusable="false" aria-hidden="true">
        <defs><clipPath id="wvabc"><path d="M14 8 H106 Z"/></clipPath></defs>
        <g clip-path="url(#wvabc)"><rect x="0" y="0" width="120" height="220"/></g></svg>`,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" preserveAspectRatio="none" class="gewvoorbeeld__grafiek" focusable="false" aria-hidden="true"><line class="gewvoorbeeld__as" x1="8" x2="232" y1="84" y2="84"/></svg>',
    ]) {
      expect(isEigenSvg(markup), markup.slice(0, 60)).toBe(true);
    }
  });

  it('laat elk icoon uit src/iconen door, zoals iconen.js het opbouwt', () => {
    let aantal = 0;
    for (const stijl of readdirSync(join(WORTEL, 'src', 'iconen'))) {
      for (const bestand of readdirSync(join(WORTEL, 'src', 'iconen', stijl))) {
        const tekst = lees('src', 'iconen', stijl, bestand);
        expect(isEigenSvg(tekst), `${stijl}/${bestand} (ruw)`).toBe(true);
        // Dezelfde opbouw als icoon() in src/ui/iconen.js.
        const viewBox = tekst.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 512 512';
        const binnen = tekst.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');
        const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="24" height="24" fill="currentColor" focusable="false">${binnen}</svg>`;
        expect(isEigenSvg(markup), `${stijl}/${bestand}`).toBe(true);
        aantal++;
      }
    }
    expect(aantal).toBeGreaterThan(40);
  });

  it('laat de drie beeldmerken door, na dezelfde schoonmaak als schoonMerk() in componenten.js', () => {
    for (const bestand of ['bloei-mark.svg', 'bloei-mark-nacht.svg', 'bloei-mark-mono.svg']) {
      const markup = lees('bloei-huisstijl', 'logo', bestand)
        .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
        .replace(/\sxmlns:c2pa="[^"]*"/g, '')
        .replace(/\sstyle="mix-blend-mode:multiply"/g, ' class="mengen"')
        .replace(/\srole="img"\saria-label="[^"]*"/, ' aria-hidden="true" focusable="false"')
        .trim();
      expect(isEigenSvg(markup), bestand).toBe(true);
    }
  });

  it('weigert alles wat geen eigen svg is of een script, handler, javascript:, foreignObject of extern adres bevat', () => {
    for (const markup of [
      '<img src=x onerror=alert(1)>',
      '<b>tekst</b>',
      'tekst<svg></svg>',
      '<svg></svg><img src=x onerror=alert(1)>',
      '<svg><script>alert(1)</script></svg>',
      '<svg><SCRIPT>alert(1)</SCRIPT></svg>',
      '<svg onload="alert(1)"><path/></svg>',
      '<svg><path d="M0 0" onclick="x"/></svg>',
      '<svg><path/ONmouseover=x></svg>',
      '<svg><foreignObject><div>x</div></foreignObject></svg>',
      '<svg><a href="javascript:alert(1)"><path/></a></svg>',
      '<svg><use href="https://elders.example/x.svg#a"/></svg>',
      '<svg><use xlink:href="data:image/svg+xml,..."/></svg>',
      '<svg><image href="x.png"/></svg>',
      '<svg><g clip-path="url(https://elders.example/x)"/></svg>',
      '<svg><style>@import "x"</style></svg>',
      '<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>',
      '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>',
      '<svg><iframe srcdoc="x"></iframe></svg>',
      '<?xml version="1.0"?><svg></svg>',
      '<svg><!ENTITY x "y"></svg>',
      '<svg><path/>',
      '',
      null,
      undefined,
      42,
      { toString: () => '<svg></svg>' },
    ]) {
      expect(isEigenSvg(markup), String(markup)).toBe(false);
    }
  });
});

describe('de policies', () => {
  it('maakt met een trustedTypes-API precies bloei-svg en bloei-sw aan, met getypte uitkomsten', () => {
    const tt = nepTrustedTypes();
    const p = _policiesVoor({ trustedTypes: tt });
    expect(tt.namen).toEqual([POLICY_SVG, POLICY_SW]);
    expect(p.svg.createHTML('<svg><path/></svg>')).toEqual({ soort: 'TrustedHTML', waarde: '<svg><path/></svg>' });
    expect(p.sw.createScriptURL(SW_URL)).toEqual({ soort: 'TrustedScriptURL', waarde: './sw.js' });
  });

  it('bloei-svg weigert vreemde markup; bloei-sw weigert elk ander adres dan ./sw.js', () => {
    const p = _policiesVoor({ trustedTypes: nepTrustedTypes() });
    expect(() => p.svg.createHTML('<img src=x onerror=alert(1)>')).toThrow(TypeError);
    for (const adres of ['/sw.js', 'sw.js', './sw.js?x', 'https://elders.example/sw.js', 'data:text/javascript,1', 'javascript:1', './andere.js'])
      expect(() => p.sw.createScriptURL(adres), adres).toThrow(TypeError);
  });

  it('terugval zonder API (Safari vóór 26, Firefox vóór 148): gewone tekst, dezelfde controle', () => {
    const p = _policiesVoor({});
    expect(p.svg.createHTML('<svg><path/></svg>')).toBe('<svg><path/></svg>');
    expect(p.sw.createScriptURL(SW_URL)).toBe('./sw.js');
    expect(() => p.svg.createHTML('<img src=x onerror=alert(1)>')).toThrow(TypeError);
    expect(() => p.sw.createScriptURL('./andere.js')).toThrow(TypeError);
  });

  it('terugval als createPolicy faalt (geweigerd of al bestaand): geen fout naar buiten, dezelfde controle', () => {
    const waarschuwing = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = _policiesVoor({ trustedTypes: nepTrustedTypes({ weiger: true }) });
    expect(waarschuwing).toHaveBeenCalled();
    expect(p.svg.createHTML('<svg><path/></svg>')).toBe('<svg><path/></svg>');
    expect(p.sw.createScriptURL(SW_URL)).toBe('./sw.js');
    expect(() => p.svg.createHTML('<b>x</b>')).toThrow(TypeError);
  });

  it('een trustedTypes zonder createPolicy (half geïmplementeerd) valt ook terug', () => {
    const p = _policiesVoor({ trustedTypes: {} });
    expect(p.sw.createScriptURL(SW_URL)).toBe('./sw.js');
  });
});

describe('svg() en de registratie gebruiken de policies', () => {
  it('svg() zet innerHTML alleen met de uitkomst van de policy, en geeft een leeg svg bij geweigerde markup', async () => {
    const gezet = [];
    const leeg = { leeg: true };
    vi.stubGlobal('document', {
      createElement: () => ({
        set innerHTML(w) {
          gezet.push(w);
        },
        content: { firstElementChild: { echt: true } },
      }),
      createElementNS: () => leeg,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { svg } = await import('../../src/ui/dom.js');
    expect(svg('  <svg><path/></svg>  ')).toEqual({ echt: true });
    expect(svg('<img src=x onerror=alert(1)>')).toBe(leeg);
    expect(gezet).toEqual(['<svg><path/></svg>']);
  });

  it('dom.js en registratie.js halen de html en het adres uit kern/trusted-types.js', () => {
    expect(lees('src', 'ui', 'dom.js')).toMatch(/innerHTML = veiligeSvgHtml\(/);
    expect(lees('src', 'pwa', 'registratie.js')).toMatch(/serviceWorker\.register\(swScriptUrl\(\)/);
    expect(lees('src', 'pwa', 'registratie.js')).not.toMatch(/register\(\s*['"]/);
  });
});

describe('de CSP eist Trusted Types, in de meta en in de kop', () => {
  const RICHTLIJNEN = ["require-trusted-types-for 'script'", 'trusted-types bloei-svg bloei-sw'];

  it('cspBeleid (de meta van de echte bouw, met en zonder meldingsdienst, en van de demo) bevat beide richtlijnen', () => {
    for (const beleid of [cspBeleid({ scriptHashes: ["'sha256-x'"] }), cspBeleid({ connect: ['https://dienst.example'] }), cspBeleid({ connect: [''] })]) {
      for (const r of RICHTLIJNEN) expect(beleid.split('; ')).toContain(r);
    }
  });

  it('de kop in vercel.json (gedeeld door echt en demo) bevat beide richtlijnen, gelijk aan cspKop, frame-ancestors blijft laatst', () => {
    const vercel = JSON.parse(lees('vercel.json'));
    const kop = vercel.headers.find((r) => r.source === '/(.*)').headers.find((k) => k.key === 'Content-Security-Policy').value;
    expect(kop).toBe(cspKop(inlineScriptHashes(lees('index.html'))));
    for (const r of RICHTLIJNEN) expect(kop.split('; ')).toContain(r);
    expect(kop).toMatch(/frame-ancestors 'none'$/);
  });

  it('de policynamen in de CSP zijn precies die in de code (anders weigert de browser createPolicy)', () => {
    const regel = cspBeleid().split('; ').find((r) => r.startsWith('trusted-types '));
    expect(regel.split(' ').slice(1).sort()).toEqual([POLICY_SVG, POLICY_SW].sort());
    expect(regel).not.toContain("'allow-duplicates'");
  });

  it('de csp-plugin zet de richtlijnen in de meta van de echte bouw en van de demo', async () => {
    const { default: maakConfig } = await import('../../vite.config.js');
    for (const mode of ['production', 'demo']) {
      const cfg = maakConfig({ mode, command: 'build' });
      const plugin = cfg.plugins.flat().find((p) => p?.name === 'bloei-csp');
      plugin.configResolved({ env: mode === 'demo' ? { VITE_DEMO: 'true' } : {} });
      const html = plugin.transformIndexHtml.handler('<head><meta charset="utf-8" /><script>x</script></head>');
      const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
      for (const r of RICHTLIJNEN) expect(meta.split('; '), mode).toContain(r);
    }
  });
});
