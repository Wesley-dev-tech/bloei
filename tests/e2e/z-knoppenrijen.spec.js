// BESLISSING 522: knoppen die bij elkaar horen (de actieknoppen onderaan een pop-up, blad of bevestigingsvraag) staan gecentreerd en zijn onderling even breed,
// op een telefoon en op een computer, in elke toestand (twee of drie knoppen). De gedeelde regel staat in src/stijl/componenten.css ("Knoppenrij").
// Per plaats uit de inventaris (tests/e2e/knoppenrij-meting.js) en per formaat (360, 390, 1280):
//   even breed (op 1 px), gecentreerd in de houder (op 1 px, per rij), niet uitgesmeerd over de volle breedte, geen afgekapte tekst, tikvlak minstens 44 px.
// Niet bewaakt: de twijfelgevallen voor de eigenaar (Delen, de gekozen weging op Gewicht) en de uitleg en rondleiding (bij het uitleg-teamlid, BESLISSING 523).
import { test, expect } from '@playwright/test';
import { PLAATSEN, zaaiKnoppenrij, meetGroep } from './knoppenrij-meting.js';

const FORMATEN = [
  { naam: 'telefoon 360x740', breed: 360, hoog: 740, touch: true },
  { naam: 'iPhone 390x844', breed: 390, hoog: 844, touch: true },
  { naam: 'desktop 1280x800', breed: 1280, hoog: 800, touch: false },
];
const BEWAAKT = PLAATSEN.filter((p) => !p.twijfel && !p.uitleg);

for (const f of FORMATEN) {
  test.describe(`knoppenrijen ${f.naam}`, () => {
    test.use({ viewport: { width: f.breed, height: f.hoog }, hasTouch: f.touch, isMobile: f.touch });
    for (const p of BEWAAKT) {
      test(`${p.naam}: gecentreerd, even breed, niet uitgesmeerd, niets afgekapt, tikvlak 44 px`, async ({ page }) => {
        await zaaiKnoppenrij(page);
        await p.open(page);
        const m = await meetGroep(page, p.groep);
        expect(m, 'de groep staat in beeld').not.toBeNull();
        const uitleg = JSON.stringify(m);
        expect(m.knoppen.length, uitleg).toBeGreaterThanOrEqual(2);
        expect(m.verschilBreedte, 'even breed: ' + uitleg).toBeLessThanOrEqual(1);
        for (const s of m.scheef) expect(Math.abs(s), 'gecentreerd: ' + uitleg).toBeLessThanOrEqual(1);
        expect(m.uitgesmeerd, 'niet over de volle breedte uitgesmeerd: ' + uitleg).toBe(false);
        expect(m.afgekapt, 'geen afgekapte tekst: ' + uitleg).toEqual([]);
        expect(m.minHoogte, 'tikvlak hoog genoeg: ' + uitleg).toBeGreaterThanOrEqual(44);
        expect(m.minBreedte, 'tikvlak breed genoeg: ' + uitleg).toBeGreaterThanOrEqual(44);
      });
    }
  });
}
