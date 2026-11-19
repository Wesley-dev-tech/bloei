// Vaste tekst wordt nergens afgekapt met puntjes (Delen), en een supplementnaam van een lang woord maakt kaart en pagina niet breder.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { wachtOpRust } from './r-wacht.js';

test.use({ hasTouch: false, isMobile: false });
test.beforeEach(async ({ page }) => {
  await vasteKlok(page, { stil: true });
});

for (const [breedte, hoogte] of [[320, 480], [390, 660]]) {
  test(`Delen op ${breedte}x${hoogte}: geen rij toont afgekapte tekst`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag')).toBeVisible();
    await page.goto('./#/delen');
    await expect(page.locator('.delen__weetjes')).toBeVisible();
    await wachtOpRust(page);
    const subs = await page.locator('.delen .rij__sub').evaluateAll((els) =>
      els.map((e) => ({ tekst: e.textContent, afgekapt: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1 })),
    );
    expect(subs.length).toBeGreaterThanOrEqual(4);
    for (const s of subs) expect(s.afgekapt, `afgekapt: ${s.tekst}`).toBe(false);
  });

  test(`Supplementen op ${breedte}x${hoogte}: een naam van een woord van 61 tekens maakt kaart en pagina niet breder`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag')).toBeVisible();
    const naam = 'Voorbeeld'.repeat(7).slice(0, 61);
    await page.evaluate(
      (n) =>
        new Promise((klaar, fout) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction(['supplementen'], 'readwrite');
            tx.objectStore('supplementen').add({ naam: n, dosis: '', hoeveelheid: n, aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
            tx.oncomplete = () => { idb.close(); klaar(); };
            tx.onerror = () => fout(tx.error);
          };
        }),
      naam,
    );
    await page.reload();
    await page.goto('./#/supplementen');
    await expect(page.getByText(naam).first()).toBeVisible();
    await wachtOpRust(page);
    const m = await page.evaluate(() => ({
      pagina: document.scrollingElement.scrollWidth <= window.innerWidth,
      kaarten: [...document.querySelectorAll('.kaart')].filter((k) => k.scrollWidth > k.clientWidth + 1).length,
      buiten: [...document.querySelectorAll('.kaart *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length,
    }));
    expect(m.pagina, 'pagina niet breder').toBe(true);
    expect(m.kaarten, 'geen kaart breder dan zichzelf').toBe(0);
    expect(m.buiten, 'niets buiten het scherm').toBe(0);
  });
}

// Een gewoon woord breekt nooit midden af (zoals voor 18 november); alleen een uitzonderlijk lang woord (src/kern/langwoord.js) breekt af binnen de cel.
for (const [breedte, hoogte] of [[360, 740], [320, 480], [1366, 1024]]) {
  test(`Supplementen op ${breedte}x${hoogte}: "Magnesiumbisglycinaat" blijft heel, het woord van 61 tekens breekt af binnen de kaart`, async ({ page }, info) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag')).toBeVisible();
    const lang = 'Voorbeeld'.repeat(7).slice(0, 61);
    await page.evaluate(
      (namen) =>
        new Promise((klaar, fout) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction(['supplementen'], 'readwrite');
            namen.forEach((n, i) => tx.objectStore('supplementen').add({ naam: n, dosis: '', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }));
            tx.oncomplete = () => { idb.close(); klaar(); };
            tx.onerror = () => fout(tx.error);
          };
        }),
      ['Magnesiumbisglycinaat', lang],
    );
    await page.reload();
    await page.goto('./#/supplementen');
    await expect(page.locator('.schema__knop', { hasText: 'Magnesiumbisglycinaat' })).toBeVisible();
    await wachtOpRust(page);
    const m = await page.evaluate((lang) => {
      const regels = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
      const gewoon = [...document.querySelectorAll('.schema__knop, .rij__titel')].filter((e) => e.textContent.trim() === 'Magnesiumbisglycinaat' && e.getClientRects().length);
      const lange = [...document.querySelectorAll('.schema__knop, .rij__titel')].filter((e) => e.textContent.trim() === lang && e.getClientRects().length);
      return {
        gewoon: gewoon.map(regels),
        gewoonKlasse: gewoon.filter((e) => e.classList.contains('is-langwoord')).length,
        lang: lange.map((e) => e.classList.contains('is-langwoord')),
        pagina: document.scrollingElement.scrollWidth <= window.innerWidth,
        kaarten: [...document.querySelectorAll('.kaart')].filter((k) => k.scrollWidth > k.clientWidth + 1).length,
      };
    }, lang);
    expect(m.gewoon.length, 'de gewone naam staat op het scherm').toBeGreaterThan(0);
    expect(m.gewoon, 'een gewoon woord op een regel').toEqual(m.gewoon.map(() => 1));
    expect(m.gewoonKlasse, 'een gewoon woord krijgt is-langwoord niet').toBe(0);
    expect(m.lang.length).toBeGreaterThan(0);
    expect(m.lang.every(Boolean), 'het lange woord heeft is-langwoord').toBe(true);
    expect(m.pagina, 'pagina niet breder').toBe(true);
    expect(m.kaarten, 'geen kaart breder dan zichzelf').toBe(0);
    await page.locator('.overzichtkaart').screenshot({ path: info.outputPath(`dagschema-${breedte}.png`) });
  });
}
