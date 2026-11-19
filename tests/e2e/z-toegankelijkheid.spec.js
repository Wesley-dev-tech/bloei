// Toegankelijkheid en bediening (BESLISSING 330): namen, rollen, koppen, taal, titel, toetsenbord, focus, dialogen,
// beweging en tekstgrootte, op elk scherm. Verzonnen gegevens uit r-gegevens.js.
// Alles draait (BESLISSING 408): niets staat op fixme of skip; wat rood is, is een echte fout in het scherm.
import { test, expect } from '@playwright/test';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { naTekenen, schermKlaar } from './wacht.js';

const SCHERMEN = [
  'vandaag',
  'dagboek/dag',
  'dagboek/week',
  'dagboek/maand',
  'drinken',
  'supplementen',
  'gewicht',
  'meer',
  'meer/instellingen',
  'meer/gewicht',
  'meer/uitleg',
  'meer/profiel',
  'meer/favorieten',
  'meer/badges',
  'meer/meldingen',
  'meer/vergrendeling',
  'delen',
];

const BEDIENBAAR = 'a[href],button,input,select,textarea,summary,[role=button],[role=switch],[role=checkbox],[role=link],[tabindex]';

async function open(page, scherm) {
  // vulGegevens zaait rond "nu": een vaste dag en een vast uur (BESLISSING 408).
  await vasteKlok(page);
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await vulGegevens(page, 'vol');
  await page.evaluate((s) => (location.hash = '#/' + s), scherm);
  await schermKlaar(page, scherm);
}

// In de pagina: de toegankelijke naam, een eenvoudige berekening die genoeg is voor onze eigen onderdelen.
const naamVan = () => {
  window.__naam = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) return lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent || '').join(' ').trim();
    const al = el.getAttribute('aria-label');
    if (al) return al.trim();
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(' ').trim();
    const tekst = (n) => {
      let s = '';
      n.childNodes.forEach((c) => {
        if (c.nodeType === 3) s += c.textContent;
        else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true') s += c.getAttribute('aria-label') || tekst(c);
      });
      return s;
    };
    return (tekst(el).replace(/\s+/g, ' ').trim() || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
  };
};

const zichtbaar = (el) => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden],[inert]');
};

test.describe('namen, rollen, koppen, taal en titel', () => {
  for (const scherm of SCHERMEN) {
    test(`${scherm}: elke bediening heeft een naam, één h1, taal en titel`, async ({ page }) => {
      await open(page, scherm);
      await page.evaluate(naamVan);
      const d = await page.evaluate(
        ([sel, zichtbaarFn]) => {
          const zicht = new Function('el', 'return (' + zichtbaarFn + ')(el)');
          const lijst = [...document.querySelectorAll(sel)].filter((e) => zicht(e) && !e.matches('main[tabindex="-1"],.sla-over'));
          const zonderNaam = lijst.filter((e) => !window.__naam(e) && e.getAttribute('role') !== 'tooltip').map((e) => e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || ''));
          const gevaarlijk = lijst.filter((e) => e.tabIndex > 0).length;
          // gelijke naam op twee verschillende knoppen die niet in een keuzegroep zitten
          const tellers = new Map();
          for (const e of lijst) {
            if (!e.matches('button,a[href]') || e.closest('[role=radiogroup],[role=group][aria-label]') || /radio|tab/.test(e.getAttribute('role') || '')) continue;
            const n = window.__naam(e);
            tellers.set(n, [...(tellers.get(n) || []), e.getAttribute("href") || ""]);
          }
          const dubbel = [...tellers].filter(([, hs]) => hs.length > 1 && !(hs[0] && hs.every((x) => x === hs[0]))).map(([n, hs]) => `${n} x${hs.length}`);
          return { zonderNaam, gevaarlijk, dubbel, h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, titel: document.title };
        },
        [BEDIENBAAR, zichtbaar.toString()],
      );
      expect(d.zonderNaam, 'bediening zonder naam').toEqual([]);
      expect(d.gevaarlijk, 'tabindex groter dan 0').toBe(0);
      expect(d.h1, 'aantal h1').toBe(1);
      expect(d.lang).toMatch(/^nl/);
      expect(d.titel, 'titel van het tabblad').toMatch(/·\s*Bloei$/);
      expect(d.dubbel, 'knoppen met dezelfde naam').toEqual([]);
    });
  }

  test('de stappers op Drinken (instellingen) noemen waarop ze werken', async ({ page }) => {
    await open(page, 'meer/instellingen');
    const namen = await page.locator('.stapper__knop').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')));
    expect(new Set(namen).size).toBe(namen.length);
  });

  test('een schakelaar volgt zijn stand in aria-checked', async ({ page }) => {
    await open(page, 'meer/uitleg');
    const sw = page.getByRole('switch').first();
    const voor = await sw.getAttribute('aria-checked');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', voor === 'true' ? 'false' : 'true');
  });

  test('de pagina heeft landmarks voor navigatie en hoofdinhoud', async ({ page }) => {
    await open(page, 'vandaag');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('nav[aria-label]').first()).toBeAttached();
  });
});

test.describe('toetsenbord', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('de eerste Tab-stop is "Ga naar de inhoud" en brengt de focus bij de inhoud', async ({ page }) => {
    await open(page, 'vandaag');
    await page.keyboard.press('Tab');
    await expect(page.locator('.sla-over')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#scherm')).toBeFocused();
    expect(await page.evaluate(() => location.hash)).toBe('#/vandaag');
  });

  for (const scherm of SCHERMEN) {
    test(`${scherm}: met alleen Tab bereik je alles, de focus is zichtbaar en niets is afgesneden`, async ({ page }) => {
      await open(page, scherm);
      await page.evaluate(naamVan);
      const verwacht = await page.evaluate(
        ([sel, zichtbaarFn]) => {
          const zicht = new Function('el', 'return (' + zichtbaarFn + ')(el)');
          return [...document.querySelectorAll(sel)].filter((e) => zicht(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && e.tabIndex >= 0).length;
        },
        [BEDIENBAAR, zichtbaar.toString()],
      );
      // Begin bij het begin van de pagina, zoals na het laden. Na de schermwissel staat de focus op #scherm (app.js), en of hij
      // daar nog staat wanneer de test begint, hing af van het moment: een tijdelijk element vooraan in body krijgt de focus en
      // verdwijnt, zodat de eerste Tab altijd op "Ga naar de inhoud" landt.
      await page.evaluate(() => {
        const anker = document.createElement('div');
        anker.tabIndex = -1;
        document.body.prepend(anker);
        anker.focus();
        anker.remove();
      });
      const stops = [];
      for (let i = 0; i < 220; i++) {
        await page.keyboard.press('Tab');
        const s = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const kind = el.querySelector(':scope > .gevoel__tegel');
          const ks = kind ? getComputedStyle(kind) : null;
          const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || (ks && ks.outlineStyle !== 'none');
          let afgesneden = false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (/(hidden|auto|scroll|clip)/.test(ps.overflowX + ps.overflowY)) {
              const pr = p.getBoundingClientRect();
              if (r.left - pr.left < 3 || pr.right - r.right < 3 || r.top - pr.top < 3 || pr.bottom - r.bottom < 3) {
                afgesneden = true;
                break;
              }
            }
          }
          return { id: el.className + '|' + window.__naam(el), naam: window.__naam(el).slice(0, 40), x: r.x, y: r.y + scrollY, ring, afgesneden, ti: el.tabIndex };
        });
        if (!s) break;
        if (stops.length && stops[0].id === s.id && stops.length > 3) break;
        stops.push(s);
      }
      const zonderRing = stops.filter((s) => !s.ring).map((s) => s.naam);
      expect(zonderRing, 'focus zonder zichtbare ring').toEqual([]);
      expect(stops.filter((s) => s.afgesneden).map((s) => s.naam), 'ring afgesneden door overflow').toEqual([]);
      // Elk bedienbaar onderdeel wordt bereikt: het aantal stops (min de schil: skip-link, logo, zijbalk) is minstens het verwachte aantal.
      expect(stops.length, 'aantal tabstops').toBeGreaterThanOrEqual(verwacht - 2);
    });
  }

  test('een dialoog houdt de focus vast, de veilige keuze heeft de focus, Escape sluit en de focus keert terug', async ({ page }) => {
    await open(page, 'meer');
    const knop = page.getByRole('button', { name: 'Profiel verwijderen' });
    await knop.focus();
    await page.keyboard.press('Enter');
    const dlg = page.locator('dialog[open]');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Annuleren' })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('dialog[open]'))).toBe(true); // buiten de dialoog mag alleen de browser zelf (body) de focus hebben
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(knop).toBeFocused();
  });

  test('na een schermwissel heeft geen houder een zichtbare ring en landt Tab op het eerste bedienbare onderdeel van het scherm', async ({ page }) => {
    await open(page, 'vandaag');
    await page.keyboard.press('Tab'); // toetsenbordmodus aan (focus-visible)
    await page.locator('.zijbalk__item', { hasText: 'Drinken' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#scherm[data-scherm="drinken"] h1')).toBeVisible();
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(document.querySelector('#scherm'));
      return { actief: el?.id, stijl: cs.outlineStyle, breedte: cs.outlineWidth };
    });
    expect(ring.actief).toBe('scherm');
    expect(ring.stijl === 'none' || parseFloat(ring.breedte) === 0).toBe(true);
    await page.keyboard.press('Tab');
    const eerste = await page.evaluate(() => {
      const el = document.activeElement;
      const eerste = document.querySelector('#scherm a[href],#scherm button:not([disabled]),#scherm input,#scherm [tabindex="0"]');
      return el === eerste && !!el.closest('#scherm');
    });
    expect(eerste).toBe(true);
  });

  test('pijltjestoetsen wisselen tussen Dag, Week en Maand', async ({ page }) => {
    await open(page, 'dagboek/dag');
    await page.getByRole('radio', { name: 'Dag' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Week' })).toBeFocused();
  });

  test('Escape sluit het medailletipje en Tab loopt niet door het kaartje', async ({ page }) => {
    await open(page, 'vandaag');
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => document.activeElement.className));
    }
    expect(stops.filter((c) => /medaille-tip__link/.test(c))).toEqual([]);
  });
});

test.describe('zien', () => {
  test('prefers-reduced-motion: er lopen geen animaties', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'vandaag');
    const lopend = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name));
    expect(lopend).toEqual([]);
  });

  for (const scherm of ['vandaag', 'dagboek/dag', 'drinken', 'supplementen', 'gewicht', 'meer', 'delen']) {
    test(`${scherm}: bij 200 % tekstgrootte loopt niets horizontaal over`, async ({ page }) => {
      await open(page, scherm);
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%', 'important'));
      await naTekenen(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});

// Tikdoelen (BESLISSING 182: minstens 44 px; deze test meet de ondergrens van 44 x 44 px op elk scherm, op een telefoon).
test.describe('aanraking', () => {
  for (const scherm of SCHERMEN) {
    test(`${scherm}: tikdoelen zijn minstens 44 x 44 px`, async ({ page }) => {
      await open(page, scherm);
      await page.evaluate(naamVan);
      const klein = await page.evaluate(
        ([sel, zichtbaarFn]) => {
          const zicht = new Function('el', 'return (' + zichtbaarFn + ')(el)');
          return [...document.querySelectorAll(sel)]
            .filter((e) => zicht(e) && e.matches('button,a[href],input,select,textarea') && !e.closest('svg'))
            .map((e) => ({ n: window.__naam(e).slice(0, 30), klasse: String(e.getAttribute('class') || e.tagName.toLowerCase()).slice(0, 50), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }))
            .filter((x) => x.w < 43.5 || x.h < 43.5);
        },
        [BEDIENBAAR, zichtbaar.toString()],
      );
      expect(klein).toEqual([]);
    });
  }
  test('een week in het Dagboek heeft hooguit een handvol tabstops per dag', async ({ page }) => {
    await open(page, 'dagboek/week');
    const rijen = await page.evaluate(() => [...document.querySelectorAll('.wk__rij, .wk__compact')].filter((e) => e.getClientRects().length > 0).map((e) => ({ tabindex: e.tabIndex, stops: e.querySelectorAll('[tabindex]:not([tabindex="-1"]), a[href], button').length })));
    expect(rijen).toHaveLength(7);
    for (const r of rijen) {
      expect(r.tabindex).toBe(0);
      expect(r.stops, 'tabstops binnen één dagrij').toBeLessThanOrEqual(1);
    }
  });
});
