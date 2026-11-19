// Eén vaste klok voor de schermtests (BESLISSING 408): een test die van de datum of het uur afhangt, draait altijd op hetzelfde
// moment, wat de echte klok ook zegt. Standaard donderdag 12 november 2026 om 12:00 in Brussel (een donderdag: er liggen
// drie dagen eerder in de week; 12:00 bepaalt de begroeting en welke maaltijd "Aan de beurt" is).
//
// Gebruik (vóór page.goto, want de klok wordt bij het laden van de pagina geïnstalleerd):
//   import { vasteKlok, VASTE_DATUM } from './vaste-klok.js';
//   await vasteKlok(page);                                   // donderdag 12 november 2026, 12:00
//   await vasteKlok(page, { uur: '07:30' });                  // dezelfde dag, ander uur
//   await vasteKlok(page, { datum: '2026-12-31', uur: '23:59' });
//   await vasteKlok(page, { stil: true });                    // Date.now() blijft stilstaan (page.clock.setFixedTime)
// Zonder stil loopt de tijd vanaf dat moment gewoon door (page.clock.install): timers, animaties en wachttijden werken.
// Roep ze aan in de test zelf of in een test.beforeEach(async ({ page }) => vasteKlok(page)).
// datumVan(dagen) geeft de datum (jjjj-mm-dd) relatief aan de vaste datum, voor het zaaien van gegevens buiten de pagina.
//
// De service worker kent page.clock niet: een test die de service worker laat rekenen met "nu" (pushsignaal) volgt de echte klok.

export const VASTE_DATUM = '2026-11-12';
export const VASTE_UUR = '12:00';
export const TIJDZONE = 'Europe/Brussels'; // ook timezoneId in playwright.config.js

// Het tijdstip (ms) van een lokale datum en een lokaal uur in Brussel, met zomer- en wintertijd.
export function brusselsMoment(datum = VASTE_DATUM, uur = VASTE_UUR) {
  const [j, m, d] = datum.split('-').map(Number);
  const [u, min = 0, s = 0] = uur.split(':').map(Number);
  const gewenst = Date.UTC(j, m - 1, d, u, min, s);
  // Twee rondes: de verschuiving van Brussel op dat moment (+1 of +2 uur) aftrekken.
  let t = gewenst;
  for (let i = 0; i < 2; i += 1) t = gewenst - verschuiving(t);
  return t;
}

function verschuiving(t) {
  const delen = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIJDZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t))
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(delen.year, delen.month - 1, delen.day, delen.hour, delen.minute, delen.second) - Math.floor(t / 1000) * 1000;
}

export async function vasteKlok(page, { datum = VASTE_DATUM, uur = VASTE_UUR, stil = false } = {}) {
  const tijd = brusselsMoment(datum, uur);
  if (stil) await page.clock.setFixedTime(tijd);
  else await page.clock.install({ time: tijd });
  return tijd;
}

// jjjj-mm-dd, `dagen` dagen na (of voor, negatief) de vaste datum: rekent in kalenderdagen, niet in 24 uur.
export function datumVan(dagen = 0, datum = VASTE_DATUM) {
  const [j, m, d] = datum.split('-').map(Number);
  const x = new Date(Date.UTC(j, m - 1, d + dagen));
  return x.toISOString().slice(0, 10);
}
