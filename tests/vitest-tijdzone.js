// Vaste tijdzone voor de hele vitest-run (BESLISSING 408): de app rekent met lokale dagen, dus een test mag niet anders
// uitvallen op een machine in UTC (CI) dan in Brussel. vite.config.js (test.env en test.setupFiles) zet TZ; dit bestand
// draait in elke worker vóór de tests en faalt meteen als de tijdzone toch niet klopt.
process.env.TZ = 'Europe/Brussels';
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Winter: +01:00 (getTimezoneOffset -60); de vaste testdatum 12 november 2026 ligt in de wintertijd.
if (zone !== 'Europe/Brussels' || new Date(2026, 10, 12, 12).getTimezoneOffset() !== -60) {
  throw new Error(`vitest draait niet in Europe/Brussels (tijdzone ${zone}); zet TZ=Europe/Brussels`);
}
