// Het uur in Belgische tijd (Europe/Brussels), zomer- en wintertijd inbegrepen, per minuut (BESLISSING 713; tot 18 november
// rondde de dienst af op het kwartier).
const FORMAAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const MINUUT_MS = 60 * 1000;

// 'UU:MM' in Brussel voor een datum (seconden vallen weg).
export function brusselsUur(datum) {
  const delen = Object.fromEntries(FORMAAT.formatToParts(datum).map((d) => [d.type, d.value]));
  return `${delen.hour}:${delen.minute}`;
}

const naarMinuten = (uur) => Number(uur.slice(0, 2)) * 60 + Number(uur.slice(3, 5));
const naarUur = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Welke uren ('UU:MM') horen bij deze minuut (minuten sinds 1970, UTC)? Meestal precies één. Twee uitzonderingen:
// - de overgang naar winteruur (laatste zondag van oktober): 02:00 tot 02:59 komt twee keer voor. De tweede keer hoort er geen
//   uur bij ([]), zodat een herinnering om 02:30 die nacht één melding geeft en niet twee;
// - de overgang naar zomeruur (laatste zondag van maart): 02:00 tot 02:59 bestaat niet. De minuut van 03:00 krijgt dan ook alle
//   overgeslagen uren, zodat een herinnering om 02:30 die nacht om 03:00 komt (liever wat later dan geen).
export function urenVanMinuut(minuut) {
  const nu = brusselsUur(new Date(minuut * MINUUT_MS));
  if (brusselsUur(new Date((minuut - 60) * MINUUT_MS)) === nu) return [];
  const sprong = (naarMinuten(nu) - naarMinuten(brusselsUur(new Date((minuut - 1) * MINUUT_MS))) + 1440) % 1440;
  if (sprong <= 1) return [nu];
  const uren = [];
  for (let k = sprong - 1; k >= 0; k--) uren.push(naarUur((naarMinuten(nu) - k + 1440) % 1440));
  return uren;
}
