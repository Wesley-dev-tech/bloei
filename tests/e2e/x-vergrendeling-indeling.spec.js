// BESLISSING 538: bij Algemeen onder Vergrendeling (#/meer/vergrendeling) staat "Goed om te weten" in de rechtse kolom onder het voorbeeld
// "Zo ziet het eruit" (twee kolommen, vanaf 960 px, slot aan) of links onder de kaart Vergrendeling (slot uit, BESLISSING 545), of na het voorbeeld (een kolom). Geen kaart heeft meer dan 32 px leeg vlak onderaan,
// de kolommen zo gelijk als de inhoud toelaat (nooit door uit te rekken) en "Toon het me" is volledig tikbaar. Op 390, 820, 1280 en 1690 px, slot uit en aan (twee rijen onder Ontgrendelen).
// Schermafbeeldingen alleen op verzoek: SHOTDIR (map buiten de bouwmap), SHOTNAAM (voor of na).
import { test, expect } from '@playwright/test';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { authenticator, rondAf, tik } from './slot-hulp.js';

const CODE = '123456';
const MATEN = process.env.METING_BREEDTES ? process.env.METING_BREEDTES.split(',').map((b) => [Number(b), 900]) : [
  [390, 844],
  [820, 1180],
  [1280, 800],
  [1690, 900],
];
// De grens van het restverschil (px, na meting; zie het rapport bij BESLISSING 545).
// Slot uit: de kaart Vergrendeling links en het voorbeeld rechts (BESLISSING 547); het verschil is gemeten, ook op 1024 px waar de linkse tekst afbreekt.
const GRENS = { uit: 60, aan: 32 };
const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });

// stand: 'uit' of 'aan' (met twee rijen onder Ontgrendelen: Pincode en Herstelcode; zonder platformauthenticator is er geen derde rij, BESLISSING 541)
async function openScherm(page, stand) {
  const aan = stand !== 'uit';
  await authenticator(page, stand === 'aan' ? 'geen' : 'ok');
  await page.goto('./#/meer/vergrendeling');
  await schermKlaar(page, '#/meer/vergrendeling');
  if (aan) {
    await SLOT(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    await rondAf(page, { toestel: 'nee' });
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.strook')).toHaveCount(0);
    await schermKlaar(page, '#/meer/vergrendeling');
  }
  await animatiesKlaar(page);
}

// De metingen, in een keer in de pagina: posities van de kaarten, het voorbeeld, het blok "Goed om te weten" en het leeg vlak onderaan elke kaart.
function meet() {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y + window.scrollY, r: b.right, b: b.bottom + window.scrollY, w: b.width, h: b.height };
  };
  // het lege vlak onderaan: de onderkant van de kaart min de laagste onderkant van wat erin staat
  const leeg = (el) => {
    let laagste = -Infinity;
    for (const k of el.querySelectorAll('*')) {
      const b = k.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) laagste = Math.max(laagste, b.bottom);
    }
    return el.getBoundingClientRect().bottom - laagste;
  };
  const scherm = document.querySelector('.instelscherm');
  const lijst = scherm.querySelector(':scope > .instel__lijst');
  const kaarten = [...lijst.querySelectorAll(':scope > .kaart')];
  const voorbeeld = scherm.querySelector('.instel__voorbeeld');
  const weetjes = scherm.querySelector('.instel__weetjes');
  const toon = weetjes.querySelector('.toonhet');
  toon.scrollIntoView({ block: 'center', behavior: 'instant' });
  const tb = toon.getBoundingClientRect();
  const midden = document.elementFromPoint(tb.x + tb.width / 2, tb.y + tb.height / 2);
  let afgekapt = false;
  for (let o = toon.parentElement; o && o !== document.body; o = o.parentElement) {
    const s = getComputedStyle(o);
    if (/(hidden|clip|auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) {
      const ob = o.getBoundingClientRect();
      if (tb.bottom > ob.bottom + 0.5 || tb.top < ob.top - 0.5 || tb.right > ob.right + 0.5 || tb.left < ob.left - 0.5) afgekapt = true;
    }
  }
  const delen = [
    ...kaarten.map((k, i) => ({ naam: `kaart ${i + 1} (${k.querySelector('.kaartkop')?.textContent.trim()})`, leeg: leeg(k) })),
    { naam: 'voorbeeld (paneel)', leeg: leeg(voorbeeld) },
    { naam: 'voorbeeld (kaart)', leeg: leeg(voorbeeld.querySelector(':scope > .kaart')) },
    { naam: 'Goed om te weten', leeg: leeg(weetjes) },
    { naam: 'het scherm', leeg: leeg(scherm) },
  ];
  return {
    vw: window.innerWidth,
    lijst: r(lijst),
    kaarten: kaarten.map(r),
    voorbeeld: r(voorbeeld),
    weetjes: r(weetjes),
    toon: { ...r(toon), raak: toon.contains(midden), wie: midden ? midden.tagName + '.' + midden.className : 'niets', afgekapt },
    delen,
    // de laatste inhoud van de linkse en de rechtse kolom (de onderkant van het laatste zichtbare kind)
    linksEind: Math.max(...[...lijst.querySelectorAll('*')].filter((k) => k.getBoundingClientRect().height > 0).map((k) => k.getBoundingClientRect().bottom)) + window.scrollY,
    rechtsEind: Math.max(...[...scherm.querySelector(':scope > .instel__rechts').querySelectorAll('*')].filter((k) => k.getBoundingClientRect().height > 0).map((k) => k.getBoundingClientRect().bottom)) + window.scrollY,
    scherm: r(scherm),
    items: [...weetjes.querySelectorAll('.instel__weetjesrij > *')].map((e) => Math.round(e.getBoundingClientRect().top)),
    knop: (() => { const k = document.querySelector('.rij__eind > .knop--secundair'); if (!k) return null; const c = getComputedStyle(k); return { bg: c.backgroundColor, kleur: c.color, b: Math.round(k.getBoundingClientRect().width) }; })(),
    domVolgorde: [lijst, voorbeeld].map((el) => weetjes.compareDocumentPosition(el)),
  };
}

for (const [breed, hoog] of MATEN) {
  for (const stand of ['uit', 'aan']) {
    const aan = stand !== 'uit';
    test.describe(`vergrendeling indeling ${breed}x${hoog}, slot ${stand}`, () => {
      test.use({ viewport: { width: breed, height: hoog } });
      test.beforeEach(async ({ page }) => vasteKlok(page));

      test('Goed om te weten staat onder het voorbeeld, zonder leeg vlak', async ({ page }) => {
        await openScherm(page, stand);
        if (process.env.SHOTDIR && breed !== 820) {
          await page.screenshot({ path: `${process.env.SHOTDIR}/${process.env.SHOTNAAM || 'na'}-slot-${stand}-${breed}.png`, fullPage: true });
        }
        const m = await page.evaluate(meet);
        const twee = m.vw >= 960;
        if (process.env.METING) console.log('METING', breed, stand, 'verschil', Math.round(m.rechtsEind - m.linksEind), 'links', Math.round(m.linksEind), 'rechts', Math.round(m.rechtsEind), 'knop', JSON.stringify(m.knop), 'leeg', JSON.stringify(m.delen.map((d) => d.naam.slice(0, 12) + ':' + Math.round(d.leeg))));
        const wat = (s) => `${breed} px, slot ${stand}: ${s}`;

        // plaats (BESLISSINGEN 538 en 547). Twee kolommen, slot aan: "Goed om te weten" rechts onder het voorbeeld. Twee kolommen, slot uit: onder beide kolommen over de
        // volle breedte. Een kolom: kaarten, voorbeeld, "Goed om te weten", in beide standen.
        if (twee) {
          expect.soft(m.voorbeeld.x, wat('voorbeeld in de rechtse kolom')).toBeGreaterThan(m.lijst.r - 1);
          for (const k of m.kaarten) expect.soft(k.r, wat('kaarten links')).toBeLessThanOrEqual(m.voorbeeld.x + 1);
          if (aan) {
            expect.soft(m.weetjes.y, wat('Goed om te weten onder het voorbeeld')).toBeGreaterThanOrEqual(m.voorbeeld.b - 1);
            expect.soft(Math.abs(m.weetjes.x - m.voorbeeld.x), wat('Goed om te weten in dezelfde kolom als het voorbeeld')).toBeLessThanOrEqual(1);
            expect.soft(m.weetjes.r, wat('Goed om te weten binnen de rechtse kolom')).toBeLessThanOrEqual(m.voorbeeld.r + 1);
          } else {
            // slot uit (BESLISSING 547): onder beide kolommen, over de volle breedte, op de gewone kaartafstand van 24 px
            const onder = Math.max(m.kaarten[0].b, m.voorbeeld.b);
            expect.soft(m.weetjes.y, wat('Goed om te weten onder de kaart en het voorbeeld')).toBeGreaterThanOrEqual(onder - 1);
            expect.soft(Math.abs(m.weetjes.y - onder - 24), wat('gewone kaartafstand (24 px) boven Goed om te weten')).toBeLessThanOrEqual(1.5);
            expect.soft(Math.abs(m.weetjes.x - m.lijst.x), wat('Goed om te weten begint bij de linkse kolom')).toBeLessThanOrEqual(1);
            expect.soft(Math.abs(m.weetjes.r - m.voorbeeld.r), wat('Goed om te weten eindigt bij de rechtse kolom (even breed als de twee kolommen samen)')).toBeLessThanOrEqual(1);
            if (m.weetjes.w >= 800) expect.soft(new Set(m.items).size, wat('vier weetjes naast elkaar op een rij')).toBe(1);
          }
        } else {
          for (const k of m.kaarten) expect.soft(m.voorbeeld.y, wat('voorbeeld na de kaarten')).toBeGreaterThanOrEqual(k.b - 1);
          expect.soft(m.weetjes.y, wat('Goed om te weten na het voorbeeld')).toBeGreaterThanOrEqual(m.voorbeeld.b - 1);
          for (const k of m.kaarten) expect.soft(m.weetjes.y, wat('Goed om te weten na de kaarten')).toBeGreaterThanOrEqual(k.b - 1);
        }
        expect.soft(m.kaarten.length, wat('aantal kaarten links')).toBe(aan ? 2 : 1);
        // leesvolgorde in de DOM, in beide standen: kaarten, voorbeeld, Goed om te weten (2 = gaat vooraf)
        expect.soft(m.domVolgorde[0] & 2, wat('de lijst staat voor Goed om te weten in de DOM')).toBe(2);
        expect.soft(m.domVolgorde[1] & 2, wat('het voorbeeld staat voor Goed om te weten in de DOM')).toBe(2);

        // geen kaart met meer dan 32 px leeg vlak onderaan
        for (const d of m.delen) expect.soft(d.leeg, wat(`leeg vlak onderaan: ${d.naam}`)).toBeLessThanOrEqual(32);

        // De kolommen eindigen zo gelijk als de inhoud toelaat, nooit door een kaart of rij uit te rekken: het restverschil wordt gemeten (METING=1) en begrensd.
        if (twee) expect.soft(Math.abs(m.rechtsEind - m.linksEind), wat('restverschil tussen de onderkanten')).toBeLessThanOrEqual(GRENS[stand]);

        // Toon het me: volledig tikbaar
        expect.soft(m.toon.h, wat('Toon het me minstens 44 px hoog')).toBeGreaterThanOrEqual(43.5);
        expect.soft(m.toon.w, wat('Toon het me minstens 44 px breed')).toBeGreaterThanOrEqual(43.5);
        expect.soft(m.toon.raak, wat('niets ligt over Toon het me: ' + m.toon.wie + ' ' + Math.round(m.toon.y))).toBe(true);
        expect.soft(m.toon.afgekapt, wat('Toon het me niet afgekapt')).toBe(false);
        expect.soft(m.toon.r, wat('Toon het me binnen het scherm')).toBeLessThanOrEqual(m.vw + 0.5);
        if (twee) expect.soft(Math.abs(m.lijst.w - m.voorbeeld.w), wat('linkse en rechtse kolom even breed')).toBeLessThanOrEqual(8);
        // geen horizontale scroll
        expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), wat('geen horizontale scroll')).toBe(true);
      });
    });
  }
}

test.describe('Toon het me op het scherm Vergrendeling', () => {
  test('start de rondleiding van dit scherm', async ({ page }) => {
    await openScherm(page, 'uit');
    await page.locator('.instel__weetjes').getByRole('button', { name: 'Toon het me' }).click();
    await expect(page.getByRole('dialog', { name: 'Het slot aanzetten' })).toBeVisible();
  });
});
