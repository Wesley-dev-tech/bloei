// Draait de testrondes en faalt bij één rode én bij één overgeslagen test (BESLISSING 408: nul rood, nul overgeslagen).
//   node tests/rondes.mjs gewoon|demo|push [argumenten voor playwright]   één Playwright-ronde (npm run e2e, e2e:demo, e2e:push)
//   node tests/rondes.mjs alles                                           de drie rondes na elkaar (npm run e2e:alles)
//   node tests/rondes.mjs vitest alles                                    eerst vitest, dan de drie rondes (npm run test:alles)
// Elke ronde bouwt zelf (playwright.config.js, PW_RONDE) naar een eigen map en poort. Met PW_POORT gezet krijgen de rondes
// PW_POORT, +1 en +2; met PW_OUTDIR gezet bouwt elke ronde in PW_OUTDIR/<ronde>.
// De uitslag komt uit het json-rapport van Playwright (stats) en van vitest, niet uit de tekst op het scherm.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORTEL = join(import.meta.dirname, '..');
const PLAYWRIGHT = ['gewoon', 'demo', 'push'];
const RAPPORTEN = join(process.env.PW_OUTDIR || join(tmpdir(), 'bloei-pw'), 'rapporten');

const [, , ...argv] = process.argv;
const rondes = [];
const extra = [];
for (const a of argv) {
  if (a === 'alles') rondes.push(...PLAYWRIGHT);
  else if (a === 'vitest' || PLAYWRIGHT.includes(a)) rondes.push(a);
  else extra.push(a);
}
if (!rondes.length) {
  console.error('Gebruik: node tests/rondes.mjs <vitest|gewoon|demo|push|alles>... [argumenten voor playwright]');
  process.exit(2);
}
mkdirSync(RAPPORTEN, { recursive: true });

function draai(opdracht, env) {
  // shell: npx is op Windows een .cmd-bestand.
  const r = spawnSync(opdracht, { cwd: WORTEL, env: { ...process.env, ...env }, stdio: 'inherit', shell: true });
  return r.status ?? 1;
}

const citeer = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function vitest() {
  const rapport = join(RAPPORTEN, 'vitest.json');
  rmSync(rapport, { force: true });
  const code = draai(`npx vitest run --reporter=default --reporter=json --outputFile.json=${citeer(rapport)}`, {});
  if (!existsSync(rapport)) return { naam: 'vitest', code, fout: 'geen json-rapport' };
  const j = JSON.parse(readFileSync(rapport, 'utf8'));
  return { naam: 'vitest', code, geslaagd: j.numPassedTests, rood: j.numFailedTests, overgeslagen: j.numPendingTests + (j.numTodoTests || 0), totaal: j.numTotalTests };
}

function playwright(ronde, index) {
  const rapport = join(RAPPORTEN, `playwright-${ronde}.json`);
  rmSync(rapport, { force: true });
  const env = { PW_RONDE: ronde, PLAYWRIGHT_JSON_OUTPUT_NAME: rapport };
  if (process.env.PW_POORT && rondes.filter((r) => r !== 'vitest').length > 1) env.PW_POORT = String(Number(process.env.PW_POORT) + index);
  if (process.env.PW_OUTDIR) env.PW_OUTDIR = join(process.env.PW_OUTDIR, ronde);
  const code = draai(['npx playwright test --reporter=list,json', ...extra.map(citeer)].join(' '), env);
  if (!existsSync(rapport)) return { naam: ronde, code, fout: 'geen json-rapport' };
  const s = JSON.parse(readFileSync(rapport, 'utf8')).stats;
  return { naam: ronde, code, geslaagd: s.expected, rood: s.unexpected, wisselend: s.flaky, overgeslagen: s.skipped, totaal: s.expected + s.unexpected + s.flaky + s.skipped };
}

const uitslagen = [];
let pw = 0;
for (const r of rondes) uitslagen.push(r === 'vitest' ? vitest() : playwright(r, pw++));

let fout = false;
console.log('\n==== Uitslag (BESLISSING 408: nul rood, nul overgeslagen)');
for (const u of uitslagen) {
  const redenen = [];
  if (u.fout) redenen.push(u.fout);
  if (u.rood) redenen.push(`${u.rood} rood`);
  if (u.wisselend) redenen.push(`${u.wisselend} wisselend (flaky)`);
  if (u.overgeslagen) redenen.push(`${u.overgeslagen} overgeslagen`);
  if (!u.fout && !u.totaal) redenen.push('geen enkele test gedraaid');
  if (u.code !== 0 && !redenen.length) redenen.push(`afgesloten met code ${u.code}`);
  if (redenen.length) fout = true;
  console.log(`${redenen.length ? 'FOUT' : 'OK  '}  ${u.naam.padEnd(7)} ${u.geslaagd ?? '-'} geslaagd, ${u.rood ?? '-'} rood, ${u.overgeslagen ?? '-'} overgeslagen${redenen.length ? '  <- ' + redenen.join(', ') : ''}`);
}
process.exit(fout ? 1 : 0);
