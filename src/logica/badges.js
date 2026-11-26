// Pure functies: de oorspronkelijke badges en hun voorwaarde. PLAN.md §6.3, beslissing 47. De groepen en de nieuwe badges staan in badgeregels.js.
// Alleen gedrag: nooit gewicht, nooit wat ze at. Oude voorbeelddata telt nooit mee; dat regelt
// de datalaag (data/statistiek.js, data/badges.js) wanneer ze de Stats samenstelt.

export const BADGES = [
  { id: 'eerste-bladzijde', voorwaarde: (s) => s.dagenBijgehouden >= 1 },
  { id: 'week-vol', voorwaarde: (s) => s.dagenBijgehouden >= 7 },
  { id: 'maand-vol', voorwaarde: (s) => s.dagenBijgehouden >= 30 },
  { id: 'honderd', voorwaarde: (s) => s.dagenBijgehouden >= 100 },
  { id: 'eerste-kan', voorwaarde: (s) => s.doelDagen >= 1 },
  { id: 'tien-kannen', voorwaarde: (s) => s.doelDagen >= 10 },
  { id: 'kanttekening', voorwaarde: (s) => s.notitieDagen >= 5 },
  { id: 'twee-weken', voorwaarde: (s) => s.lopendeReeks >= 14 },
  // Supplementen (113): alleen het bijhouden zelf, nooit wat of hoeveel ze neemt.
  { id: 'eerste-potje', voorwaarde: (s) => (s.innameDagen ?? 0) >= 1 },
  // Veertien dagen vol: telt volgens de momenten van de dag (BESLISSING 150), niet volgens elk supplement afzonderlijk.
  { id: 'trouw', voorwaarde: (s) => (s.volledigeMomentDagen ?? 0) >= 14 },
];

// stats: { dagenBijgehouden, lopendeReeks, doelDagen, notitieDagen, innameDagen, volledigeMomentDagen }
// Geeft de ids van alle badges waarvan de voorwaarde nu klopt, in de volgorde van BADGES. De app gebruikt verdiendAlle (badgeregels.js);
// deze functie leeft alleen nog in tests (reeks.test.js).
export function verdiend(stats) {
  return BADGES.filter((badge) => badge.voorwaarde(stats ?? {})).map((badge) => badge.id);
}
