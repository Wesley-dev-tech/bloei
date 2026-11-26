// BESLISSINGEN 412, 417 en 419: een maaltijd invullen gebeurt overal in een apart blad boven het scherm (hetzelfde blad als "Weging noteren"),
// op Vandaag en in Dagboek·Dag, op elke breedte. De kaart Eten verandert nooit van hoogte; er is geen inline openklappen meer.
// Knoppen: Klaar (links), Annuleren (midden), Verwijderen (rechts, alleen als er iets te verwijderen is); het kruisje en Escape doen wat Klaar doet.
// Verwijderen, kruisje, Escape (desktop); geen zijwaartse scroll, het blad binnen het scherm, de pagina erachter schuift niet, de focus terug
// op de rij, de kaart Eten even hoog. Schermafbeeldingen van het open blad: PW_BEELDEN=<map>.
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

const D = '2026-11-12';
const GISTEREN = '2026-11-11';
const DONDERDAG = new Date(2026, 10, 12, 10, 0, 0);
const BEELDEN = process.env.PW_BEELDEN || '';

const rijen = (page, tabel) =>
  page.evaluate(
    (naam) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const vraag = open.result.transaction(naam).objectStore(naam).getAll();
          vraag.onsuccess = () => {
            open.result.close();
            klaar(vraag.result);
          };
        };
      }),
    tabel,
  );
const zetRij = (page, tabel, rij) =>
  page.evaluate(
    ([naam, waarde]) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction(naam, 'readwrite');
          tx.objectStore(naam).put(waarde);
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
    [tabel, rij],
  );
const maaltijd = (page, soort) => rijen(page, 'maaltijden').then((l) => l.find((m) => m.soort === soort && m.datum === D) ?? null);
const record = (soort, tekst, extra = {}) => ({ datum: D, soort, tijd: '12:30', tekst, fotoId: null, voorbeeld: false, gewijzigdOp: 1, ...extra });

const FORMATEN = [
  { naam: 'iPhone 390x844', breed: 390, hoog: 844, touch: true },
  { naam: 'iPhone 360x740', breed: 360, hoog: 740, touch: true },
  { naam: 'iPhone liggend 844x390', breed: 844, hoog: 390, touch: true },
  { naam: 'iPad staand 820x1180', breed: 820, hoog: 1180, touch: true },
  { naam: 'iPad liggend 1180x820', breed: 1180, hoog: 820, touch: true },
  { naam: 'desktop 1280x800', breed: 1280, hoog: 800, touch: false },
  { naam: 'desktop 1690x1230', breed: 1690, hoog: 1230, touch: false },
];
const SCHERMEN = [
  { route: 'vandaag', kaart: '.vandaag .etenkaart', regel: (s) => `.vandaag .maaltijd[data-soort="${s}"]` },
  { route: 'dagboek/dag', kaart: '.dag__eten', regel: (s) => `.dag__eten .maaltijd[data-soort="${s}"]` },
];

for (const f of FORMATEN) {
  test.describe(f.naam, () => {
    test.use({ viewport: { width: f.breed, height: f.hoog }, hasTouch: f.touch, isMobile: f.touch });

    for (const s of SCHERMEN) {
      test(`${s.route}: het maaltijdblad werkt van begin tot einde`, async ({ page }) => {
        await page.clock.setFixedTime(DONDERDAG);
        await page.goto('./#/vandaag');
        await zetRij(page, 'maaltijden', { ...record('ontbijt', 'Muesli met noten'), datum: GISTEREN });
        await zetRij(page, 'maaltijden', record('middagmaal', 'Soep met brood'));
        await page.goto('./#/' + s.route);
        const rij = (soort) => page.locator(s.regel(soort) + ' > .rij');
        await expect(rij('middagmaal')).toContainText('Soep met brood');
        await animatiesKlaar(page); // de kaarten zijn opgekomen
        const tik = (loc) => (f.touch ? loc.tap() : loc.click());
        const blad = page.locator('dialog.dialoog[open]');
        const kaartHoogte = () => page.evaluate((sel) => document.querySelector(sel)?.getBoundingClientRect().height ?? -1, s.kaart);
        const geenZijscroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        const binnenScherm = async () => {
          await animatiesKlaar(page); // het blad is helemaal opgekomen
          const r = await blad.evaluate((e) => ({ ...e.getBoundingClientRect().toJSON(), w: innerWidth, h: innerHeight }));
          expect(r.left).toBeGreaterThanOrEqual(-0.5);
          expect(r.right).toBeLessThanOrEqual(r.w + 0.5);
          expect(r.top).toBeGreaterThanOrEqual(-0.5);
          expect(r.bottom).toBeLessThanOrEqual(r.h + 0.5);
        };
        // De knoprij is bereikbaar: binnen het blad te schuiven tot ze in beeld is, en de drie knoppen staan op één rij zonder afkappen.
        const knoprij = async () => {
          const klaar = blad.getByRole('button', { name: 'Klaar', exact: true });
          await klaar.scrollIntoViewIfNeeded();
          await expect(klaar).toBeInViewport();
          const maten = await blad.locator('.maaltijd__acties .knop:visible').evaluateAll((l) => l.map((k) => ({ t: k.textContent.trim(), top: Math.round(k.getBoundingClientRect().top), past: k.scrollWidth <= k.clientWidth + 1 })));
          expect(maten.map((m) => m.t)).toEqual(maten.length === 3 ? ['Klaar', 'Annuleren', 'Verwijderen'] : ['Klaar', 'Annuleren']);
          for (const m of maten) {
            expect(m.top, m.t).toBe(maten[0].top);
            expect(m.past, m.t).toBe(true);
          }
        };
        const hoogte = await kaartHoogte();
        const schuif = () => page.evaluate(() => scrollY);

        // 1. Ontbijt: openen en typen.
        await tik(rij('ontbijt'));
        await expect(blad).toBeVisible();
        await expect(blad).toHaveAccessibleName('Ontbijt');
        const y = await schuif(); // de pagina erachter schuift niet mee zolang het blad open is
        await expect.poll(kaartHoogte).toBe(hoogte); // de kaart Eten wordt niet hoger door het open blad
        await binnenScherm();
        await geenZijscroll();
        await blad.locator('textarea').fill('Yoghurt met fruit');
        await expect.poll(() => maaltijd(page, 'ontbijt')).toMatchObject({ tekst: 'Yoghurt met fruit' });
        await knoprij();
        // Schuiven in het blad (wiel of veeg tot voorbij het einde) schuift de pagina erachter niet mee.
        const r = await blad.boundingBox();
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.wheel(0, 1500);
        await wachtTotStil(page, () => page.evaluate(() => [scrollY, document.querySelector('dialog.dialoog[open] .dialoog__inhoud')?.scrollTop ?? 0])); // het schuiven is uitgelopen
        expect(await schuif()).toBe(y);
        if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/maaltijdblad-${s.route.replace('/', '-')}-${f.breed}x${f.hoog}.png` });
        await tik(blad.getByRole('button', { name: 'Klaar', exact: true }));
        await expect(blad).toHaveCount(0);
        await expect(rij('ontbijt')).toContainText('Yoghurt met fruit');
        await expect(rij('ontbijt')).toBeFocused();
        // (Na het sluiten kan de pagina een paar pixels verschuiven als de ingevulde rij hoger wordt: dat is de inhoud, niet het blad.)

        // 2. Zelfde als gisteren, dan Annuleren: terug naar de stand bij het openen.
        await tik(rij('ontbijt'));
        await tik(blad.getByRole('button', { name: 'Zelfde als gisteren' }));
        await expect.poll(async () => (await maaltijd(page, 'ontbijt'))?.tekst).toBe('Muesli met noten');
        await blad.getByRole('button', { name: 'Annuleren', exact: true }).scrollIntoViewIfNeeded();
        await tik(blad.getByRole('button', { name: 'Annuleren', exact: true }));
        await expect(blad).toHaveCount(0);
        await expect.poll(() => maaltijd(page, 'ontbijt')).toMatchObject({ tekst: 'Yoghurt met fruit' });
        await expect(rij('ontbijt')).toContainText('Yoghurt met fruit');
        await expect(rij('ontbijt')).toBeFocused();

        // 3. Het kruisje doet wat Klaar doet.
        await tik(rij('middagmaal'));
        await blad.locator('textarea').fill('Soep met brood en kaas');
        await tik(blad.getByRole('button', { name: 'Sluiten', exact: true }));
        await expect(blad).toHaveCount(0);
        await expect.poll(async () => (await maaltijd(page, 'middagmaal'))?.tekst).toBe('Soep met brood en kaas');
        await expect(rij('middagmaal')).toBeFocused();

        // 4. Verwijderen.
        await tik(rij('middagmaal'));
        await blad.getByRole('button', { name: 'Verwijderen', exact: true }).scrollIntoViewIfNeeded();
        await tik(blad.getByRole('button', { name: 'Verwijderen', exact: true }));
        await tik(page.locator('dialog[open]').last().getByRole('button', { name: 'Verwijderen', exact: true }));
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect.poll(() => maaltijd(page, 'middagmaal')).toBeNull();

        // 5. Op de desktop: Escape doet wat Klaar doet.
        if (!f.touch) {
          await rij('vieruurtje').click();
          await blad.locator('textarea').fill('Appel');
          await page.keyboard.press('Escape');
          await expect(blad).toHaveCount(0);
          await expect.poll(async () => (await maaltijd(page, 'vieruurtje'))?.tekst).toBe('Appel');
          await expect(rij('vieruurtje')).toBeFocused();
        }

        // Na het bewaren mag de kaart alleen van hoogte veranderen door de inhoud zelf (een ingevulde rij met tekst), nooit door een open venster.
        await geenZijscroll();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
      });
    }
  });
}

test('een wissel van dagdeel (12 uur) laat het open blad en de invoer staan (R2-01)', async ({ page }) => {
  await page.clock.setFixedTime(DONDERDAG);
  await page.goto('./#/vandaag');
  await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click();
  const blad = page.locator('dialog.dialoog[open]');
  await blad.locator('textarea').fill('Half');
  await page.clock.setFixedTime(new Date(2026, 10, 12, 12, 0, 5));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1200);
  await expect(blad.locator('textarea')).toBeFocused();
  await page.keyboard.type(' en heel');
  await blad.getByRole('button', { name: 'Klaar', exact: true }).click();
  await expect.poll(async () => (await maaltijd(page, 'ontbijt'))?.tekst).toBe('Half en heel');
});

test('de rondleiding (Een maaltijd noteren) opent het blad in kijkstand, blijft bedienbaar en sluit het blad weer', async ({ page }) => {
  await page.goto('./#/meer/uitleg');
  await page.getByRole('button', { name: 'Toon het me: Een maaltijd noteren' }).click();
  const kaart = page.locator('.uitleg__kaart[role="dialog"]');
  await expect(kaart).toBeVisible({ timeout: 10000 });
  const blad = page.locator('dialog.dialoog[open]');
  for (let i = 0; i < 6 && !(await blad.count()); i += 1) {
    const stap = await kaart.locator('.uitleg__stap').textContent();
    await kaart.getByRole('button', { name: 'Volgende' }).click();
    await expect(kaart.locator('.uitleg__stap')).not.toHaveText(stap); // de volgende stap staat er
    await animatiesKlaar(page);
  }
  await expect(blad.locator('textarea')).toBeVisible();
  const stap = await kaart.locator('.uitleg__stap').textContent();
  await kaart.getByRole('button', { name: 'Volgende' }).click(); // de uitlegkaart blijft bedienbaar naast het blad
  await expect(kaart.locator('.uitleg__stap')).not.toHaveText(stap);
  await page.keyboard.press('Escape');
  await expect(kaart).toHaveCount(0);
  await expect(blad).toHaveCount(0);
  expect(await rijen(page, 'maaltijden')).toEqual([]); // kijkstand: er wordt niets bewaard
});

// BESLISSING 422: in elk blad (het gedeelde bladcomponent) staat rechts van de titel een kruisje: een icoonknop met het xmark-icoon, naam "Sluiten",
// tikvlak van minstens 44 px; het blad draagt de kleurfamilie van de kaart die het opent (data-familie op .blad).
const POPUPS = [
  { naam: 'maaltijd', familie: 'dagboek', open: async (page) => { await page.goto('./#/vandaag'); await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click(); } },
  { naam: 'weging', familie: 'gewicht', open: async (page) => { await page.goto('./#/gewicht'); await page.locator('.gewichthoofd .gewicht__actie .knop').click(); } },
];
for (const p of POPUPS) {
  test(`kruisje en familie in het blad: ${p.naam}`, async ({ page }) => {
    await page.clock.setFixedTime(DONDERDAG);
    await p.open(page);
    const blad = page.locator('dialog.dialoog[open]');
    await expect(blad).toBeVisible();
    await expect(page.locator('body > .blad')).toHaveAttribute('data-familie', p.familie);
    const sluit = blad.locator('.blad__kop .blad__sluit');
    await expect(sluit).toHaveAccessibleName('Sluiten');
    await expect(sluit.locator('svg')).toHaveCount(1);
    expect(await sluit.textContent()).not.toContain('\u00d7');
    const r = await sluit.boundingBox();
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    await sluit.click();
    await expect(blad).toHaveCount(0);
  });

  test(`kruisje rechts op de regel van de titel: ${p.naam}`, async ({ page }) => {
    // De opmaak (titelrij flex, kruisje rechts) staat in src/stijl (stijlteamlid).
    await page.clock.setFixedTime(DONDERDAG);
    await p.open(page);
    const blad = page.locator('dialog.dialoog[open]');
    const titel = await blad.locator('.blad__titel').boundingBox();
    const sluit = await blad.locator('.blad__sluit').boundingBox();
    const kader = await blad.boundingBox();
    expect(Math.abs(titel.y + titel.height / 2 - (sluit.y + sluit.height / 2))).toBeLessThanOrEqual(2);
    expect(sluit.x).toBeGreaterThan(titel.x + titel.width - 1);
    expect(sluit.x + sluit.width).toBeLessThanOrEqual(kader.x + kader.width);
  });
}
