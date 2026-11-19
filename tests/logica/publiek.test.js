// Wat publiek kan worden, mag nooit persoonsgegevens of sleutels bevatten (BESLISSINGEN 319 en 329; HANDLEIDING-PUBLICEREN.md, deel 1).
// De repo is privé (BESLISSING 338), maar de gebouwde site op Vercel is publiek en wie later toegang tot de repo krijgt, leest alles.
// Deze test doorzoekt elk bestand dat in de repo zou komen (alles wat git kent of zou kennen, min de privébestanden die de
// handleiding buiten de repo houdt) op patronen die er nooit in mogen staan: e-mailadressen, privésleutels en tokens, lange
// sleutelreeksen in configuratie, absolute paden met een gebruikersmap, en metadata in afbeeldingen.
//
// Echte namen staan NIET in deze test. Bestaat het lokale bestand .verboden-woorden.local (door git genegeerd; één woord per regel,
// regels met # zijn commentaar), dan mag geen enkel van die woorden voorkomen, in welke hoofdletters ook, ook niet in een bestandsnaam.
// Ontbreekt dat bestand of is het leeg, dan FAALT die test met een melding: ze slaat nooit stil over (BESLISSING 408).
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const WORTEL = join(import.meta.dirname, '..', '..');

// Wat de handleiding buiten de repo houdt (HANDLEIDING-PUBLICEREN.md, deel 2).
const PRIVE_BESTANDEN = new Set(['CLAUDE.md', 'EISEN.md', 'BESLISSINGEN.md', 'PLAN.md', 'LOGBOEK.md', 'ITERATIES.md', 'skills-lock.json', '.env', '.env.local', '.dev.vars', '.verboden-woorden.local']);
const PRIVE_MAPPEN = ['.git/', 'node_modules/', 'dist/', 'dev-dist/', 'test-results/', 'playwright-report/', 'screenshots/', '.claude/', '.agents/', '.wrangler/', '.vercel/'];

function publiekeBestanden() {
  const uit = execSync('git ls-files --cached --others --exclude-standard -z', { cwd: WORTEL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(uit.split('\0').filter(Boolean))]
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !PRIVE_BESTANDEN.has(basename(p)))
    .filter((p) => !PRIVE_MAPPEN.some((m) => p.startsWith(m) || p.includes('/' + m)))
    .filter((p) => existsSync(join(WORTEL, p)) && statSync(join(WORTEL, p)).isFile());
}

const BESTANDEN = publiekeBestanden();
const TEKST = /\.(js|mjs|cjs|ts|json|md|html|css|svg|txt|toml|ya?ml|example|webmanifest)$|(^|\/)\.gitignore$|(^|\/)\.env\.example$/i;
const BEELD = /\.(png|jpe?g|webp|gif|avif|ico)$/i;
const lees = (p) => readFileSync(join(WORTEL, p), 'utf8');

// Verboden woorden uit het lokale bestand (nooit in de repo).
// VERBODEN_WOORDEN_BESTAND wijst desgewenst naar een lijst buiten de projectmap.
const WOORDEN_PAD = process.env.VERBODEN_WOORDEN_BESTAND || join(WORTEL, '.verboden-woorden.local');
function verbodenWoorden() {
  if (!existsSync(WOORDEN_PAD)) return [];
  return readFileSync(WOORDEN_PAD, 'utf8')
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r && !r.startsWith('#'));
}

// Een e-mailadres, behalve de verzonnen voorbeelddomeinen en de gebruikersnaam in een adres (https://a:b@host).
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const TOEGELATEN_EMAILDOMEIN = /@(?:example\.(?:com|org|net|invalid)|[a-z0-9.-]*\.invalid|users\.noreply\.github\.com|anthropic\.com)$/i;
function emails(tekst) {
  const gevonden = [];
  for (const m of tekst.matchAll(EMAIL)) {
    const ervoor = tekst.slice(Math.max(0, m.index - 200), m.index);
    if (/:\/\/[^\s'"`]*$/.test(ervoor)) continue; // gebruikersnaam in een URL
    if (/^@?[\w.-]+\/[\w.-]+/.test(tekst.slice(m.index + m[0].length - 1))) continue;
    if (TOEGELATEN_EMAILDOMEIN.test(m[0])) continue;
    if (/\.(?:js|css|svg|png|woff2?|json|md)$/i.test(m[0])) continue; // pakketnaam@versie/bestand
    gevonden.push(m[0]);
  }
  return gevonden;
}

// Sleutels en tokens die nergens publiek mogen staan.
const SLEUTELPATRONEN = [
  ['PEM-privésleutel', new RegExp('-----BEGIN ' + '(?:[A-Z]+ )?PRIVATE KEY-----')],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['GitHub-token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS-sleutel', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google-API-sleutel', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack-token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
];
// In configuratie: een waarde van 40 of meer tekens base64/hex hoort daar niet (een VAPID-sleutel, een API-token).
const CONFIG = /\.(toml|ya?ml|env\.example)$|(^|\/)\.env\.example$|(^|\/)package\.json$|(^|\/)wrangler\.toml$/i;
const LANGE_WAARDE = /[=:]\s*["']?([A-Za-z0-9+/_-]{40,}={0,2})["']?\s*$/gm;

// Een absoluut pad met een gebruikersmap (Windows, macOS, Linux).
const GEBRUIKERSPAD = [/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"`]+/i, /(?:^|[\s'"`(])\/Users\/[a-z][\w.-]*\//, /(?:^|[\s'"`(])\/home\/[a-z][\w.-]*\//];

describe('publieke bestanden', () => {
  it('de lijst van publieke bestanden is gevonden en bevat geen privébestanden', () => {
    expect(BESTANDEN.length).toBeGreaterThan(50);
    for (const p of BESTANDEN) {
      expect(PRIVE_BESTANDEN.has(basename(p)), p).toBe(false);
      expect(p.startsWith('.claude/') || p.startsWith('.agents/'), p).toBe(false);
    }
  });

  it('geen e-mailadressen (behalve verzonnen voorbeeldadressen)', () => {
    const fout = [];
    for (const p of BESTANDEN.filter((b) => TEKST.test(b) && !b.endsWith('package-lock.json'))) for (const e of emails(lees(p))) fout.push(`${p}: ${e}`);
    expect(fout).toEqual([]);
  });

  it('geen privésleutels, tokens of lange sleutelreeksen in configuratie', () => {
    const fout = [];
    for (const p of BESTANDEN.filter((b) => TEKST.test(b))) {
      const tekst = lees(p);
      for (const [naam, patroon] of SLEUTELPATRONEN) if (patroon.test(tekst)) fout.push(`${p}: ${naam}`);
      if (CONFIG.test(p))
        for (const m of tekst.matchAll(LANGE_WAARDE)) {
          if (/^VUL_HIER/.test(m[1])) continue;
          // De publieke VAPID-sleutel is publiek (ze staat ook in de gebouwde app); in wrangler.toml hoort ze erbij.
          const regel = tekst.slice(tekst.lastIndexOf('\n', m.index) + 1, m.index);
          if (/(^|\/)wrangler\.toml$/.test(p) && /^\s*VAPID_PUBLIEK\s*$/.test(regel)) continue;
          fout.push(`${p}: lange waarde ${m[1].slice(0, 6)}...`);
        }
    }
    expect(fout).toEqual([]);
  });

  it('geen absolute paden met een gebruikersmap', () => {
    const fout = [];
    for (const p of BESTANDEN.filter((b) => TEKST.test(b))) {
      const tekst = lees(p);
      for (const patroon of GEBRUIKERSPAD) {
        const m = tekst.match(patroon);
        if (m) fout.push(`${p}: ${m[0].trim().slice(0, 12)}...`);
      }
    }
    expect(fout).toEqual([]);
  });

  it('afbeeldingen dragen geen EXIF, GPS of tekstvelden met persoonsgegevens', () => {
    const fout = [];
    for (const p of BESTANDEN.filter((b) => BEELD.test(b))) {
      const b = readFileSync(join(WORTEL, p));
      if (p.toLowerCase().endsWith('.png')) {
        for (let i = 8; i + 8 <= b.length; ) {
          const lengte = b.readUInt32BE(i);
          const soort = b.toString('latin1', i + 4, i + 8);
          if (soort === 'eXIf') fout.push(`${p}: EXIF-blok`);
          if (/^(tEXt|iTXt|zTXt)$/.test(soort)) {
            const inhoud = b.toString('latin1', i + 8, i + 8 + lengte);
            if (/Author|Copyright|GPS|Owner|Artist|Creator(?!Tool)|Comment/i.test(inhoud)) fout.push(`${p}: tekstveld ${inhoud.split('\0')[0]}`);
          }
          i += 12 + lengte;
        }
      } else if (/\.jpe?g$/i.test(p) && b.includes(Buffer.from('Exif\0\0', 'latin1'))) fout.push(`${p}: EXIF-blok`);
    }
    expect(fout).toEqual([]);
  });

  const woorden = verbodenWoorden();
  it(`geen enkel woord uit .verboden-woorden.local (${woorden.length} woorden), ook niet in bestandsnamen of afbeeldingen`, () => {
    // Zonder lijst is er niets gecontroleerd: dat is een fout, geen overgeslagen test (BESLISSING 408).
    expect(
      woorden.length,
      `De lijst met verboden woorden ontbreekt of is leeg (${WOORDEN_PAD}). Maak .verboden-woorden.local in de projectmap ` +
        '(door git genegeerd; één woord per regel, # = commentaar) of wijs met VERBODEN_WOORDEN_BESTAND naar een lijst buiten de map.',
    ).toBeGreaterThan(0);
    const fout = [];
    const patronen = woorden.map((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    for (const p of BESTANDEN) {
      const inhoud = TEKST.test(p) ? lees(p) : BEELD.test(p) ? readFileSync(join(WORTEL, p)).toString('latin1') : '';
      patronen.forEach((patroon, n) => {
        if (patroon.test(p)) fout.push(`${p}: bestandsnaam bevat woord ${n + 1}`);
        else if (patroon.test(inhoud)) {
          const regel = inhoud.split('\n').findIndex((r) => patroon.test(r)) + 1;
          fout.push(`${p}:${regel}: woord ${n + 1}`);
        }
      });
    }
    // De woorden zelf komen niet in de uitvoer: alleen hun volgnummer in het lokale bestand.
    expect(fout).toEqual([]);
  });
});
