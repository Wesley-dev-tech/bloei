// BESLISSING 522: knoppen die bij elkaar horen, staan gecentreerd en zijn onderling even breed. Gedeelde hulp voor de meting (inventaris) en de bewaking
// (z-knoppenrijen.spec.js): de plaatsen waar zo'n groep staat, hoe je ze opent, en de meting van een groep.
//
//   PLAATSEN                         [{ naam, open(page), groep, kader }] groep = de houder van de knoppen, kader = het venster of de kaart (voor een beeld)
//   zaaiKnoppenrij(page)             gegevens om alle groepen te kunnen openen (twee maaltijden, supplementen, drie wegingen met een in deze week, geen streefgewicht)
//   meetGroep(page, groep)           per groep: breedte en hoogte van elke knop, ruimte links en rechts in de houder, volle breedte, afgekapte tekst, rijen
import { expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { vulGegevens } from './r-gegevens.js';
import { schermKlaar, animatiesKlaar, naTekenen } from './wacht.js';

export async function naar(page, route) {
  await page.goto('about:blank'); // een nieuwe pagina: geen venster van een vorige plaats blijft open
  await page.goto('./#/' + route);
  await schermKlaar(page, route);
}

// Drie wegingen (de laatste in de week van de vaste klok) en geen streefgewicht; daarbovenop de gewone dag van r-gegevens.js.
export async function zaaiKnoppenrij(page) {
  await vasteKlok(page);
  await page.goto('./#/vandaag');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await vulGegevens(page, 'gewoon');
  await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const tekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['wegingen', 'instellingen'], 'readwrite');
          [70, 69.2, 68.4].forEach((kg, i) => {
            const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 7 * (2 - i));
            const maandag = new Date(d);
            maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            tx.objectStore('wegingen').put({ week: tekst(maandag), datum: tekst(d), kg, voorbeeld: false, gewijzigdOp: Date.now() });
          });
          tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: null });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
  await page.reload();
}

const bovenste = (page) => page.locator('dialog[open]').last();
const maaltijd = (page, soort) => page.locator(`body > .blad.maaltijdblad[data-soort="${soort}"] > dialog.dialoog[open]`);
const supp = (page) => page.locator('dialog.supplementkaart[open]');
const streefZetten = async (page, kg) => {
  await page.evaluate(
    (waarde) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde });
          tx.oncomplete = () => (open.result.close(), klaar());
        };
      }),
    kg,
  );
};
async function klaarOm(page, loc) {
  await expect(loc).toBeVisible();
  await animatiesKlaar(page);
}

// De plaatsen met een groep van twee of meer knoppen, in de gewone app. Elke open() begint met een eigen page.goto (de gegevens van zaaiKnoppenrij staan er al).
// soort: 'popup' (blad, bevestiging, kaart) of 'kaart' (een groep onder een kaart, een rondleidingkaartje). twijfel: voor de eigenaar, niet gewijzigd.
export const PLAATSEN = [
  {
    naam: 'maaltijd toevoegen (Klaar, Annuleren)',
    kort: 'maaltijd-nieuw',
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.locator('.vandaag .maaltijd[data-soort="avondmaal"] > .rij').click();
      await klaarOm(page, maaltijd(page, 'avondmaal'));
    },
    groep: 'body > .blad.maaltijdblad > dialog[open] .maaltijd__acties',
    kader: 'body > .blad.maaltijdblad > dialog[open]',
  },
  {
    naam: 'maaltijd bewerken (Klaar, Annuleren, Verwijderen)',
    kort: 'maaltijd-bewerk',
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click();
      await klaarOm(page, maaltijd(page, 'ontbijt').getByRole('button', { name: 'Verwijderen', exact: true }));
    },
    groep: 'body > .blad.maaltijdblad > dialog[open] .maaltijd__acties',
    kader: 'body > .blad.maaltijdblad > dialog[open]',
  },
  {
    naam: 'bevestiging maaltijd verwijderen (Verwijderen, Laten staan)',
    kort: 'bevestig-maaltijd',
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click();
      await maaltijd(page, 'ontbijt').getByRole('button', { name: 'Verwijderen', exact: true }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(2);
      await animatiesKlaar(page);
    },
    groep: 'body > dialog.dialoog[open] .dialoog__acties',
    kader: 'body > dialog.dialoog[open]',
  },
  {
    naam: 'weging noteren (Noteren, Annuleren)',
    kort: 'weging',
    open: async (page) => {
      await naar(page, 'gewicht');
      await page.getByRole('button', { name: /Weging noteren/ }).first().click();
      await klaarOm(page, page.locator('.wegingblad dialog[open]'));
    },
    groep: '.wegingblad dialog[open] .maaltijd__acties',
    kader: '.wegingblad dialog[open]',
  },
  {
    naam: 'bevestiging Vervangen? (Vervangen, Laten staan)',
    kort: 'bevestig-vervangen',
    open: async (page) => {
      await naar(page, 'gewicht');
      await page.getByRole('button', { name: /Weging noteren/ }).first().click();
      const b = page.locator('.wegingblad dialog[open]');
      await klaarOm(page, b);
      await b.getByRole('button', { name: 'Noteren', exact: true }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(2);
      await animatiesKlaar(page);
    },
    groep: 'body > dialog.dialoog[open] .dialoog__acties',
    kader: 'body > dialog.dialoog[open]',
  },
  {
    naam: 'streefgewicht zetten (Klaar, Annuleren)',
    kort: 'streef-nieuw',
    open: async (page) => {
      await streefZetten(page, null);
      await naar(page, 'gewicht');
      await page.locator('.gewichtstreef .gewicht__actie .knop').click();
      await klaarOm(page, page.locator('.streefblad dialog[open]'));
    },
    groep: '.streefblad dialog[open] .maaltijd__acties',
    kader: '.streefblad dialog[open]',
  },
  {
    naam: 'streefgewicht aanpassen (Klaar, Annuleren, Verwijderen)',
    kort: 'streef-bewerk',
    open: async (page) => {
      await streefZetten(page, 65);
      await naar(page, 'gewicht');
      await page.locator('.gewichtstreef .gewicht__actie .knop').click();
      await klaarOm(page, page.locator('.streefblad dialog[open]').getByRole('button', { name: 'Verwijderen', exact: true }));
    },
    groep: '.streefblad dialog[open] .maaltijd__acties',
    kader: '.streefblad dialog[open]',
  },
  {
    naam: 'bevestiging streefgewicht wissen (Wissen, Laten staan)',
    kort: 'bevestig-streef',
    open: async (page) => {
      await streefZetten(page, 65);
      await naar(page, 'gewicht');
      await page.locator('.gewichtstreef .gewicht__actie .knop').click();
      await page.locator('.streefblad dialog[open]').getByRole('button', { name: 'Verwijderen', exact: true }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(2);
      await animatiesKlaar(page);
    },
    groep: 'body > dialog.dialoog[open] .dialoog__acties',
    kader: 'body > dialog.dialoog[open]',
  },
  {
    naam: 'gekozen weging onder de grafiek (Aanpassen, Verwijderen als tekstknop)',
    kort: 'gewicht-gekozen',
    twijfel: true,
    soort: 'kaart',
    open: async (page) => {
      await naar(page, 'gewicht');
      await page.locator('.grafiek__tikgroep').last().click();
      await klaarOm(page, page.locator('.gewicht__acties'));
    },
    groep: '.gewicht__acties',
    kader: '.gewicht__gekozen',
  },
  {
    naam: 'bevestiging weging verwijderen (Wissen, Laten staan)',
    kort: 'bevestig-weging',
    open: async (page) => {
      await naar(page, 'gewicht');
      await page.locator('.grafiek__tikgroep').last().click();
      await page.locator('.gewicht__acties').getByRole('button', { name: 'Verwijderen', exact: true }).click();
      await klaarOm(page, bovenste(page));
    },
    groep: 'body > dialog.dialoog[open] .dialoog__acties',
    kader: 'body > dialog.dialoog[open]',
  },
  {
    naam: 'supplement toevoegen (Bewaren, Annuleren)',
    kort: 'supp-nieuw',
    open: async (page) => {
      await naar(page, 'supplementen');
      await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
      await klaarOm(page, supp(page));
    },
    groep: 'dialog.supplementkaart[open] .supplementkaart__knoppen',
    kader: 'dialog.supplementkaart[open]',
  },
  {
    naam: 'supplement aanpassen (Bewaren, Annuleren, Verwijderen)',
    kort: 'supp-bewerk',
    open: async (page) => {
      await naar(page, 'supplementen');
      await page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' }).first().click();
      await klaarOm(page, supp(page).getByRole('button', { name: 'Verwijderen', exact: true }));
    },
    groep: 'dialog.supplementkaart[open] .supplementkaart__knoppen',
    kader: 'dialog.supplementkaart[open]',
  },
  {
    naam: 'supplement: vraag verwijderen (Verwijderen, Annuleren)',
    kort: 'supp-wegvraag',
    open: async (page) => {
      await naar(page, 'supplementen');
      await page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' }).first().click();
      await supp(page).getByRole('button', { name: 'Verwijderen', exact: true }).click();
      await klaarOm(page, supp(page).locator('.supplementkaart__vraag'));
    },
    groep: 'dialog.supplementkaart[open] .supplementkaart__vraag .supplementkaart__knoppen',
    kader: 'dialog.supplementkaart[open]',
  },
  {
    naam: 'supplement: vraag wijzigingen (Bewaren, Niet bewaren, Verder aanpassen)',
    kort: 'supp-wijzigvraag',
    open: async (page) => {
      await naar(page, 'supplementen');
      await page.locator('.momentkaart .supplementrij', { hasText: 'Magnesium' }).first().click();
      await supp(page).getByRole('textbox', { name: 'Naam' }).fill('Magnesium plus');
      await supp(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
      await klaarOm(page, supp(page).locator('.supplementkaart__vraag'));
    },
    groep: 'dialog.supplementkaart[open] .supplementkaart__vraag .supplementkaart__knoppen',
    kader: 'dialog.supplementkaart[open]',
  },
  {
    naam: 'profiel verwijderen, stap 1 (Ja, verwijder mijn profiel, Annuleren)',
    kort: 'wis-1',
    open: async (page) => {
      await naar(page, 'meer');
      await page.getByRole('button', { name: 'Profiel verwijderen' }).click();
      await klaarOm(page, page.locator('dialog.dialoog--wis[open]'));
    },
    groep: 'dialog.dialoog--wis[open] .dialoog__acties',
    kader: 'dialog.dialoog--wis[open]',
  },
  {
    naam: 'profiel verwijderen, stap 2 (Ja, verwijder mijn profiel, Annuleren)',
    kort: 'wis-2',
    open: async (page) => {
      await naar(page, 'meer');
      await page.getByRole('button', { name: 'Profiel verwijderen' }).click();
      const d = page.locator('dialog.dialoog--wis[open]');
      await d.locator('.knop--primair').click();
      await expect(d.locator('.knop--primair')).toBeDisabled();
      await animatiesKlaar(page);
    },
    groep: 'dialog.dialoog--wis[open] .dialoog__acties',
    kader: 'dialog.dialoog--wis[open]',
  },
  {
    naam: 'Delen: Bewaren, Afdrukken (of Versturen erbij)',
    kort: 'delen',
    twijfel: true,
    soort: 'kaart',
    open: async (page) => {
      await naar(page, 'delen');
      await klaarOm(page, page.locator('.delen__knoppen'));
    },
    groep: '.delen__knoppen',
    kader: '.delen__knoppen',
  },
  {
    naam: 'rondleiding, stap 2 (Vorige, Volgende)',
    kort: 'rondleiding',
    soort: 'kaart',
    uitleg: true, // bij het uitleg-teamlid (BESLISSING 523): alleen in de inventaris, niet in de bewaking
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.getByRole('button', { name: 'Rondleiding van dit scherm' }).first().click();
      const k = page.locator('.uitleg > .uitleg__kaart').first();
      await klaarOm(page, k);
      await k.getByRole('button', { name: 'Volgende', exact: true }).click();
      await klaarOm(page, k.getByRole('button', { name: 'Vorige', exact: true }));
    },
    groep: '.uitleg > .uitleg__kaart:not(.uitleg__kaart--welkom) .uitleg__acties',
    kader: '.uitleg > .uitleg__kaart:not(.uitleg__kaart--welkom)',
  },
  {
    naam: 'welkomstkaartje van de rondleiding (Liever niet, Toon het me)',
    kort: 'rondleiding-welkom',
    soort: 'kaart',
    uitleg: true,
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.evaluate(() => localStorage.setItem('bloei-uitleg', JSON.stringify({ echt: true })));
      await page.reload();
      await klaarOm(page, page.locator('.uitleg--welkom .uitleg__kaart'));
    },
    na: async (page) => {
      await page.evaluate(() => localStorage.removeItem('bloei-uitleg'));
    },
    groep: '.uitleg--welkom .uitleg__acties',
    kader: '.uitleg--welkom .uitleg__kaart',
  },
];

// Meet de zichtbare groep (de laatste die past) en haar houder (het ouderelement, binnen zijn padding).
export async function meetGroep(page, groep) {
  await naTekenen(page);
  return page.evaluate((sel) => {
    const zichtbaar = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const g = [...document.querySelectorAll(sel)].filter(zichtbaar).at(-1);
    if (!g) return null;
    const houder = g.parentElement;
    const cs = getComputedStyle(houder);
    const hr = houder.getBoundingClientRect();
    const binnenL = hr.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const binnenR = hr.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const knoppen = [...g.querySelectorAll('.knop')].filter(zichtbaar);
    const rects = knoppen.map((k) => k.getBoundingClientRect());
    const links = Math.min(...rects.map((r) => r.left));
    const rechts = Math.max(...rects.map((r) => r.right));
    const rond = (x) => Math.round(x * 10) / 10;
    const afgekapt = knoppen
      .filter((k) => {
        const kr = k.getBoundingClientRect();
        return [...k.querySelectorAll('.knop__tekst, .knop__vol, .knop__kort')].filter(zichtbaar).some((s) => {
          const sr = s.getBoundingClientRect();
          return s.scrollWidth > s.clientWidth + 1 || sr.left < kr.left - 0.5 || sr.right > kr.right + 0.5;
        });
      })
      .map((k) => k.textContent.trim());
    // De ondergrens van een knop in deze groep (--rij-min, anders de gewone minimumbreedte van een knop): een groep die de houder vult met knoppen op of onder
    // die ondergrens is niet uitgesmeerd maar gekrompen (drie knoppen op een smalle telefoon).
    const peil = document.createElement('div');
    peil.style.width = 'var(--rij-min, var(--knop-min-b))';
    peil.style.position = 'absolute';
    g.append(peil);
    const vloer = peil.getBoundingClientRect().width;
    peil.remove();
    // Per rij gecentreerd: de knoppen van elke rij (bovenkant op 2 px gelijk) staan met gelijke ruimte links en rechts in de houder.
    const perRij = {};
    rects.forEach((r) => {
      const sleutel = Object.keys(perRij).find((k) => Math.abs(Number(k) - r.top) <= 2) ?? r.top;
      (perRij[sleutel] ??= []).push(r);
    });
    const rijen = Object.keys(perRij).length;
    const scheef = Object.values(perRij).map((rij) => {
      const l = Math.min(...rij.map((r) => r.left)) - binnenL;
      const rr = binnenR - Math.max(...rij.map((r) => r.right));
      return rond(l - rr);
    });
    return {
      knoppen: knoppen.map((k, i) => ({ tekst: k.textContent.trim(), breed: rond(rects[i].width), hoog: rond(rects[i].height) })),
      houderBreed: rond(binnenR - binnenL),
      groepBreed: rond(rechts - links),
      ruimteLinks: rond(links - binnenL),
      ruimteRechts: rond(binnenR - rechts),
      scheef,
      volleBreedte: rechts - links >= binnenR - binnenL - 2,
      vloer: rond(vloer),
      uitgesmeerd: rechts - links >= binnenR - binnenL - 2 && Math.min(...rects.map((r) => r.width)) > vloer + 1,
      afgekapt,
      rijen,
      verschilBreedte: rond(Math.max(...rects.map((r) => r.width)) - Math.min(...rects.map((r) => r.width))),
      // het tikvlak: de knop zelf, of een onzichtbare laag (::after) die hoger is (de knoppen van 40 px in de bladen van Gewicht, 0.6.3)
      minHoogte: rond(Math.min(...knoppen.map((k, i) => { const na = getComputedStyle(k, '::after'); const laag = na.position === 'absolute' && na.content !== 'none' ? parseFloat(na.height) || 0 : 0; return Math.max(rects[i].height, laag); }))),
      minBreedte: rond(Math.min(...rects.map((r) => r.width))),
      groepRect: (() => { const r = g.getBoundingClientRect(); return [rond(r.left), rond(r.top), rond(r.width), rond(r.height)]; })(),
    };
  }, groep);
}

// De bounding box van het kader (venster of kaart) en van zijn directe kinderen: voor de vóór/na-vergelijking.
export async function meetKader(page, kader) {
  return page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].at(-1);
    if (!el) return null;
    const rond = (x) => Math.round(x * 10) / 10;
    const box = (e) => { const r = e.getBoundingClientRect(); return [rond(r.left), rond(r.top), rond(r.width), rond(r.height)]; };
    const kinderen = [...el.querySelectorAll(':scope > *, :scope > * > *')].map((k) => [k.className?.toString?.() || k.tagName, ...box(k)]);
    return { kader: box(el), kinderen };
  }, kader);
}
