// De iconenkaart bewaken (BESLISSING 169): elk begrip heeft één bestaand icoon, twee begrippen delen alleen een icoon als dat een bewuste
// uitzondering is, en in de schermen van spoor B staat geen losse iconennaam meer.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ICOONNAMEN } from '../../src/ui/iconen.js';
import { ICOON, UITZONDERINGEN } from '../../src/ui/iconenkaart.js';
import { MAALTIJDICOON, DRANKICOON } from '../../src/ui/beeld.js';

const FAMILIES = ['maaltijd', 'drank', 'gezondheid', 'dag', 'dagboek', 'gewicht', 'delen', 'neutraal'];
// Een naam met een map erin ('eigen/kan-water') wijst zelf de stijl aan; anders geldt de meegegeven stijl.
const bestaat = (naam, stijl = 'solid') => ICOONNAMEN.includes(naam.includes('/') ? naam : `${stijl}/${naam}`);

describe('iconenkaart', () => {
  it('elk begrip verwijst naar een bestaand icoon, met een familie uit de huisstijl', () => {
    for (const [begrip, b] of Object.entries(ICOON)) {
      expect(bestaat(b.naam, b.stijl), `${begrip}: ${b.stijl}/${b.naam}`).toBe(true);
      expect(FAMILIES, begrip).toContain(b.familie);
    }
    for (const naam of [...Object.values(MAALTIJDICOON), ...Object.values(DRANKICOON)]) expect(bestaat(naam), naam).toBe(true);
  });

  it('elk begrip draagt de familie van zijn onderwerp (de tabel in iconenkaart.js)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/stijl/componenten.css'), 'utf8');
    const bestaat = (familie) => css.includes('.tegel--' + familie + ' ') || css.includes('.tegel--' + familie + '{');
    const VERWACHT = {
      vandaag: 'dag', dagboek: 'dagboek', drinken: 'drank', supplementen: 'gezondheid', reeks: 'gezondheid', badge: 'gezondheid',
      eten: 'maaltijd', favoriet: 'maaltijd', algemeen: 'neutraal', instellingen: 'neutraal', profiel: 'neutraal', thema: 'neutraal',
      vergrendeling: 'neutraal', pincode: 'neutraal', uitleg: 'neutraal',
      // nieuwe families: pas verwacht zodra ze in componenten.css staan
      gewicht: bestaat('gewicht') ? 'gewicht' : 'neutraal', weegdag: bestaat('gewicht') ? 'gewicht' : 'neutraal', streefgewicht: bestaat('gewicht') ? 'gewicht' : 'neutraal',
      delen: bestaat('delen') ? 'delen' : 'neutraal', verslag: bestaat('delen') ? 'delen' : 'neutraal', periode: bestaat('delen') ? 'delen' : 'neutraal',
    };
    for (const [begrip, familie] of Object.entries(VERWACHT)) expect(ICOON[begrip].familie, begrip).toBe(familie);
    for (const b of Object.values(ICOON)) expect(FAMILIES).toContain(b.familie);
  });

  it('favoriet is regular, al het andere solid', () => {
    for (const [begrip, b] of Object.entries(ICOON)) {
      const regular = ['favoriet'].includes(begrip);
      // BESLISSING 606: Face ID is een eigen bestand (buiten Android; daar is het de gevulde vingerafdruk)
      const eigen = begrip === 'gezichtsherkenning' && b.naam === 'face-id';
      expect(b.stijl, begrip).toBe(eigen ? 'eigen' : regular ? 'regular' : 'solid');
    }
  });

  it('herinneringen bestaat en is gevuld, in dezelfde familie als vergrendeling en uitleg', () => {
    expect(ICOON.herinneringen).toBeDefined();
    expect(ICOON.herinneringen.stijl).toBe('solid');
    expect(bestaat(ICOON.herinneringen.naam, 'solid')).toBe(true);
    expect(ICOON.herinneringen.familie).toBe(ICOON.vergrendeling.familie);
    expect(ICOON.herinneringen.familie).toBe(ICOON.uitleg.familie);
  });

  it('twee begrippen delen alleen een icoon als dat een benoemde uitzondering is', () => {
    const perIcoon = new Map();
    for (const [begrip, b] of Object.entries(ICOON)) {
      const sleutel = `${b.stijl}/${b.naam}`;
      perIcoon.set(sleutel, [...(perIcoon.get(sleutel) ?? []), begrip]);
    }
    for (const [sleutel, leden] of perIcoon) {
      if (leden.length < 2) continue;
      const toegestaan = UITZONDERINGEN.some((u) => leden.every((l) => u.includes(l)));
      expect(toegestaan, `${sleutel} wordt gedeeld door ${leden.join(', ')}`).toBe(true);
    }
    // en elke uitzondering is nog nodig (anders weg uit de lijst)
    for (const u of UITZONDERINGEN) {
      const iconen = new Set(u.map((begrip) => `${ICOON[begrip].stijl}/${ICOON[begrip].naam}`));
      expect(iconen.size, u.join(', ')).toBe(1);
    }
  });

});

const ACHTERSTAND_FAMILIE = {"schermen/meer-instellingen.js":3,"schermen/meer.js":2};
// Geen losse iconennaam in een scherm: spoor B is streng, voor A en C staat de achterstand als telling (mag alleen dalen).
const SRC = path.resolve(__dirname, '../../src');
const LOS = [/icoontegel\('[a-z-]+'/g, /naam: '[a-z-]+'/g, /\['[a-z/-]+', '(neutraal|maaltijd|drank|gezondheid)'\]/g, /\bicoon\('[a-z/-]+'/g, /icoon: '[a-z/-]+'/g];
const telLos = (bestand) =>
  fs
    .readFileSync(path.join(SRC, bestand), 'utf8')
    .split(String.fromCharCode(10))
    .filter((regel) => LOS.some((re) => ((re.lastIndex = 0), re.test(regel)))).length; // aantal regels met een losse naam

describe('elk opgevraagd begrip bestaat', () => {
  // Elk letterlijk opgevraagd begrip in src/ (ICOON.x, begripIcoon('x'), begripTegel('x'), begripOpties('x'), weetjesVoor(..., ['x', ...])) staat in de kaart.
  const alle = (map) => fs.readdirSync(map, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? alle(path.join(map, d.name)) : d.name.endsWith('.js') ? [path.join(map, d.name)] : []));
  it('geen enkel bestand vraagt een onbekend begrip op', () => {
    const fouten = [];
    for (const bestand of alle(SRC)) {
      if (bestand.endsWith('iconenkaart.js')) continue;
      const tekst = fs.readFileSync(bestand, 'utf8');
      const gevonden = new Set();
      for (const m of tekst.matchAll(/\bICOON\.([a-zA-Z]+)/g)) gevonden.add(m[1]);
      for (const m of tekst.matchAll(/\bICOON\[\s*'([a-zA-Z]+)'\s*\]/g)) gevonden.add(m[1]);
      for (const m of tekst.matchAll(/begrip(?:Icoon|Tegel|Opties)\(\s*'([a-zA-Z]+)'/g)) gevonden.add(m[1]);
      for (const m of tekst.matchAll(/weetjesVoor\([^,]+,\s*\[([^\]]*)\]/g)) for (const b of m[1].matchAll(/'([a-zA-Z]+)'/g)) gevonden.add(b[1]);
      for (const begrip of gevonden) if (!(begrip in ICOON)) fouten.push(path.relative(SRC, bestand) + ': ' + begrip);
    }
    expect(fouten).toEqual([]);
  });
});

describe('de kleur volgt het begrip', () => {
  // Een begrip met een eigen familie (maaltijd, drank, gezondheid) staat nergens met familie: 'neutraal'.
  const MET_FAMILIE = Object.entries(ICOON).filter(([, b]) => b.familie !== 'neutraal').map(([begrip]) => begrip);
  const alleBestanden = () => [...fs.readdirSync(path.join(SRC, 'schermen')).map((f) => 'schermen/' + f), ...fs.readdirSync(path.join(SRC, 'vergrendeling')).map((f) => 'vergrendeling/' + f), 'ui/componenten.js', 'ui/maaltijdregel.js', 'ui/medaille.js', 'ui/verslag-vel.js'].filter((f) => f.endsWith('.js'));
  const NAAM_FAMILIE = Object.fromEntries(Object.values(ICOON).filter((b) => b.familie !== 'neutraal' && !['seedling', 'award'].includes(b.naam)).map((b) => [b.naam, b.familie]));
  const overschrijft = (regel) =>
    (MET_FAMILIE.some((begrip) => regel.includes(`begripOpties('${begrip}'`) || regel.includes(`begripTegel('${begrip}'`)) && regel.includes("familie: 'neutraal'")) ||
    Object.keys(NAAM_FAMILIE).some((naam) => (regel.includes(`naam: '${naam}'`) || regel.includes(`['${naam}', 'neutraal']`)) && regel.includes("'neutraal'"));
  const tel = (bestand) => fs.readFileSync(path.join(SRC, bestand), 'utf8').split(String.fromCharCode(10)).filter(overschrijft).length;
  const MIJN = ['schermen/vandaag.js', 'schermen/drinken.js', 'schermen/supplementen.js', 'schermen/momenten.js', 'schermen/weekkaart.js', 'schermen/hulp.js', 'schermen/meer-badges.js', 'schermen/meer-profiel.js', 'schermen/meer-favorieten.js', 'ui/maaltijdregel.js', 'ui/medaille.js'];
  it.each(MIJN)('%s overschrijft de familie van een begrip niet', (bestand) => {
    expect(tel(bestand)).toBe(0);
  });
  it('de achterstand van A en C groeit niet (aantal regels per bestand dat een familie overschrijft)', () => {
    for (const f of alleBestanden().filter((x) => !MIJN.includes(x))) expect(tel(f), f).toBeLessThanOrEqual(ACHTERSTAND_FAMILIE[f] ?? 1e9);
  });
});

describe('geen losse iconennamen', () => {
  const STRENG = ['schermen/vandaag.js', 'schermen/drinken.js', 'schermen/supplementen.js', 'schermen/momenten.js', 'schermen/weekkaart.js', 'schermen/hulp.js', 'schermen/meer-badges.js', 'schermen/meer-profiel.js', 'schermen/meer-favorieten.js', 'ui/maaltijdregel.js', 'ui/medaille.js'];
  it.each(STRENG)('%s gebruikt alleen de iconenkaart', (bestand) => {
    expect(telLos(bestand)).toBe(0);
  });

  // Achterstand van A en C (aantal losse namen per bestand op dit moment): hoort naar 0.
  const ACHTERSTAND = {"schermen/dagboek-dag.js":7,"schermen/dagboek-maand.js":6,"schermen/dagboek-week.js":2,"schermen/dagboek.js":1,"schermen/delen.js":5,"schermen/gewicht.js":5,"schermen/meer-delen.js":4,"schermen/meer-gewicht.js":5,"schermen/meer-instellingen.js":4,"schermen/meer.js":13,"vergrendeling/cijferblok.js":1,"vergrendeling/scherm.js":12,"ui/componenten.js":4,"ui/verslag-vel.js":2,"ui/verslag-model.js":2,"ui/verslag-pdf.js":1};
  it('de achterstand van andere sporen groeit niet', () => {
    const bestanden = [...fs.readdirSync(path.join(SRC, 'schermen')).map((f) => 'schermen/' + f), ...fs.readdirSync(path.join(SRC, 'vergrendeling')).map((f) => 'vergrendeling/' + f), 'ui/componenten.js', 'ui/verslag-vel.js', 'ui/verslag-model.js', 'ui/verslag-pdf.js'].filter((f) => f.endsWith('.js') && !STRENG.includes(f));
    for (const f of bestanden) expect(telLos(f), f).toBeLessThanOrEqual(ACHTERSTAND[f] ?? 1e9);
  });
});
