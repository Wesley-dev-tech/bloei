// BESLISSING 462: geen onderstreping meer op een tekstknop (.knop--tekst), de actie in een melding (.strook__actie) en een link-weetje (.weetje--link).
// Voor elk zichtbaar exemplaar, in rust, bij hover, met toetsenbordfocus en ingedrukt: geen text-decoration-line (ook niet op de tekst erin),
// geen onderrand, geen box-shadow met een verschuiving naar onder (een lijn), geen pseudo-element dat als lijn getekend is.
// Met toetsenbordfocus toont het element wel zijn focusring (outline). Hover zonder vlak blijft bewaakt in tests/ui/hover-zonder-vlak.test.js.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar, animatiesKlaar } from './wacht.js';

const SEL = '.knop--tekst, .strook__actie, .weetje--link';
const SCHERMEN = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'delen', 'meer', 'meer/instellingen', 'meer/gewicht', 'meer/uitleg', 'meer/profiel', 'meer/favorieten', 'meer/meldingen', 'meer/vergrendeling'];

// De lijnen die een element nu toont (leeg = geen); `focus` vraagt ook of de focusring zichtbaar is.
const lijnen = (loc, focus = false) =>
  loc.evaluate((el, metFocus) => {
    const uit = [];
    for (const e of [el, ...el.querySelectorAll('*')]) {
      const s = getComputedStyle(e);
      const naam = e === el ? 'element' : String(e.className?.baseVal ?? e.className) || e.tagName;
      if (s.textDecorationLine && s.textDecorationLine !== 'none') uit.push(`${naam}: text-decoration ${s.textDecorationLine}`);
    }
    const s = getComputedStyle(el);
    if (s.borderBottomStyle !== 'none' && parseFloat(s.borderBottomWidth) > 0 && !(s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) > 0)) uit.push(`onderrand ${s.borderBottomWidth} ${s.borderBottomStyle}`);
    // box-shadow: "kleur x y blur spread" per laag; een laag met y > 0 zonder vervaging is een lijn onder het element
    for (const laag of (s.boxShadow === 'none' ? [] : s.boxShadow.split(/,(?![^(]*\))/))) {
      const px = (laag.match(/-?\d+(\.\d+)?px/g) || []).map(parseFloat);
      if (px.length >= 2 && px[1] > 0 && (px[2] ?? 0) <= 1) uit.push(`box-shadow als lijn: ${laag.trim()}`);
    }
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (ps.content === 'none' || ps.content === 'normal') continue;
      const h = parseFloat(ps.height);
      const b = parseFloat(ps.width);
      const zichtbaar = ps.backgroundColor !== 'rgba(0, 0, 0, 0)' || (ps.borderBottomStyle !== 'none' && parseFloat(ps.borderBottomWidth) > 0) || ps.backgroundImage !== 'none';
      if (zichtbaar && h > 0 && h <= 4 && b > 8) uit.push(`${p} als lijn (${b}x${h})`);
      if (ps.textDecorationLine && ps.textDecorationLine !== 'none') uit.push(`${p}: text-decoration ${ps.textDecorationLine}`);
    }
    // (een uitgeschakelde knop krijgt geen focus: daar valt niets te zien)
    if (metFocus && document.activeElement === el && !(s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0)) uit.push('geen focusring (outline) met toetsenbordfocus');
    return uit;
  }, focus);

async function controleer(page, route, fouten) {
  const elementen = page.locator(SEL).filter({ visible: true });
  const n = await elementen.count();
  for (let i = 0; i < n; i += 1) {
    const el = elementen.nth(i);
    if (!(await el.isVisible())) continue;
    const naam = `${route} #${i} "${((await el.textContent()) || '').trim().slice(0, 30)}"`;
    const weg = (stand, l) => l.forEach((x) => fouten.push(`${naam} (${stand}): ${x}`));
    weg('rust', await lijnen(el));
    await el.scrollIntoViewIfNeeded();
    await el.hover();
    await animatiesKlaar(page);
    weg('hover', await lijnen(el));
    // toetsenbordfocus: na een toets geeft focus() :focus-visible
    await page.mouse.move(0, 0);
    await page.keyboard.press('Shift');
    await el.focus();
    await animatiesKlaar(page);
    weg('focus', await lijnen(el, true));
    // ingedrukt (zonder los te laten, zodat er niets gebeurt)
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      weg('ingedrukt', await lijnen(el));
      await page.mouse.move(0, 0); // los laten buiten het element: geen klik
      await page.mouse.up();
    }
    await el.evaluate((e) => e.blur());
  }
  return n;
}

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test('geen onderstreping of lijn op tekstknoppen, meldingsacties en link-weetjes, in rust, hover, focus en ingedrukt (BESLISSING 462)', async ({ page }) => {
  test.setTimeout(240000);
  await vasteKlok(page);
  const fouten = [];
  let gezien = 0;
  for (const route of SCHERMEN) {
    await page.goto('./#/' + route);
    await schermKlaar(page, route);
    gezien += await controleer(page, route, fouten);
  }
  // Een melding met "Ongedaan maken": een glas water op Drinken
  await page.goto('./#/drinken');
  await schermKlaar(page, 'drinken');
  await page.locator('.drankknop[data-soort="water"]').first().click();
  await expect(page.locator('.strook__actie').first()).toBeVisible();
  gezien += await controleer(page, 'drinken (melding)', fouten);
  expect(gezien, 'er zijn elementen gemeten').toBeGreaterThan(5);
  expect(fouten).toEqual([]);
});
