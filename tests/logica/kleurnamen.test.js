// BESLISSING 648 (namen: BESLISSING 653): een tekst die een kleur noemt, noemt de kleur die op dat scherm en in dat thema echt te zien is.
// (1) Geen vast kleurwoord in een zichtbare tekst van TEKSTEN, STUKKEN of TOESTEL_TEKST; alleen de themanamen in de teksten over het thema.
// (2) Elke plaatshouder {kleur.<rol>} heeft een naam voor elk scherm waarop haar tekst kan verschijnen en voor elk thema.
// (3) vulKleuren vult in, verbuigt, en laat bij een fout nooit een plaatshouder staan.
// De schermtest tests/e2e/c-kleurnamen.spec.js toetst daarna of de naam bij de echte kleur van het element past.
import { describe, it, expect, vi } from 'vitest';
import { TEKSTEN } from '../../src/teksten.js';
import { STAPPEN, STUKKEN, TOESTEL_TEKST, HANDELING_SCHERM, stappenVoor } from '../../src/uitleg/stappen.js';
import { KLEURNAMEN, THEMAS, PLAATSHOUDER, kleurnaam, vulKleuren } from '../../src/uitleg/kleurnamen.js';

const KLEURWOORD = /\b(salie|paarse?|pruimen|pruim|lavendel|lila|roze|abrikoos|abrikozen|oranje|perziken|perzik|groene?|lichtgroene?|blauwgroene?|blauwe?|mist|gele?|geel|gouden|goud|rode?|rood|bruine?|grijze?|grijs|terracotta)\b/gi;
// De themanamen (thema.js): toegelaten met hoofdletter, alleen in een tekst over het thema.
const THEMANAMEN = ['Poeder', 'Salie', 'Nacht'];

function teksten(o, pad, uit) {
  if (typeof o === 'string') uit.push([pad, o]);
  else if (Array.isArray(o)) o.forEach((x, i) => teksten(x, `${pad}[${i}]`, uit));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (typeof v !== 'function') teksten(v, pad ? `${pad}.${k}` : k, uit);
  return uit;
}
const ZICHTBAAR = [...teksten(TEKSTEN, '', []), ...teksten(STUKKEN, 'STUKKEN', []), ...teksten(TOESTEL_TEKST, 'TOESTEL_TEKST', [])].filter(([pad]) => !(pad.startsWith('STUKKEN') && /\.(bij|doel|ook|naam|zonder)$/.test(pad))); // (in STUKKEN: kiezers, geen tekst)

describe('kleurnamen: geen vast kleurwoord in een tekst', () => {
  it('geen kleurwoord buiten de themanamen in de teksten over het thema', () => {
    const fout = [];
    for (const [pad, tekst] of ZICHTBAAR) {
      for (const m of tekst.matchAll(KLEURWOORD)) {
        if (/thema/i.test(pad) && THEMANAMEN.includes(m[0])) continue;
        fout.push(`${pad}: "${m[0]}" in "${tekst.slice(0, 90)}"`);
      }
    }
    expect(fout).toEqual([]);
  });

  it('de toets ziet een vast kleurwoord wel (de oude tekst van het Dagboek)', () => {
    const oud = 'Een salie bolletje betekent dat je die dag al je supplementen nam, een spuitje staat op de dag van een geplande spuit en vandaag is paars.';
    expect([...oud.matchAll(KLEURWOORD)].map((m) => m[0])).toEqual(['salie', 'paars']);
  });

  it('een plaatshouder staat alleen in een tekst die de rondleiding invult', () => {
    const buiten = ZICHTBAAR.filter(([pad, tekst]) => tekst.includes('{kleur.') && !/^(uitleg\.(stap|handeling)[A-Za-z]*\.|STUKKEN|TOESTEL_TEKST)/.test(pad));
    expect(buiten.map(([p]) => p)).toEqual([]);
  });
});

describe('kleurnamen: elke plaatshouder heeft een naam', () => {
  const ALLE_SCHERMEN = ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer', 'delen'];
  // Het scherm waarop de stappen van een rondleiding lopen: een handeling op haar scherm (HANDELING_SCHERM); "hier" en een sleutel zonder
  // eigen scherm (beginscherm) kunnen op elk scherm.
  const schermenVan = (sleutel) => {
    const s = sleutel.startsWith('h:') ? HANDELING_SCHERM[sleutel.slice(2)] : sleutel;
    return !s || s === 'hier' || s === 'beginscherm' ? ALLE_SCHERMEN : [s];
  };
  const TOESTELLEN = [{ android: false, chrome: false, apk: false }, { android: true, chrome: true, apk: false }, { android: true, chrome: true, apk: true }, { android: true, chrome: false, apk: false }];

  // Alle teksten die een stap kan tonen, met het scherm: de gewone tekst, de varianten per toestel en de stukken (afgeronde delen).
  const gevallen = [];
  for (const sleutel of Object.keys(STAPPEN)) {
    for (const o of TOESTELLEN) {
      for (const s of stappenVoor(sleutel, o)) {
        const lijst = [s.titel, s.tekst];
        for (const v of Object.values(TOESTEL_TEKST[s.tekstSleutel] ?? {})) lijst.push(v.titel, v.tekst);
        for (const st of s.stukken?.stukken ?? []) lijst.push(st.titel, st.tekst, st.kort);
        for (const tekst of lijst.filter(Boolean)) for (const scherm of schermenVan(sleutel)) gevallen.push({ wie: `${sleutel}.${s.id}`, tekst, scherm });
      }
    }
  }

  it('de zinnen met een kleur gebruiken de plaatshouders', () => {
    const met = new Set(gevallen.filter((g) => g.tekst.includes('{kleur.')).map((g) => g.wie));
    for (const wie of ['vandaag.kalender', 'dagboek.maand', 'supplementen.week']) expect([...met], wie).toContain(wie);
  });

  it('voor elk scherm en elk thema', () => {
    const fout = [];
    for (const { wie, tekst, scherm } of gevallen) {
      for (const m of tekst.matchAll(PLAATSHOUDER)) {
        for (const thema of THEMAS) if (!kleurnaam(m[1], { scherm, thema }, m[2] ? 'bij' : 'gewoon')) fout.push(`${wie}: ${m[0]} op ${scherm} in ${thema}`);
      }
      expect(tekst, wie).not.toMatch(/\{kleur(?!\.[A-Za-z]+(:bij)?\})/); // een verkeerd geschreven plaatshouder
    }
    expect(fout).toEqual([]);
  });

  it('de tabel heeft voor elke rol en elk scherm alle drie de thema\'s', () => {
    for (const [rol, perScherm] of Object.entries(KLEURNAMEN)) {
      for (const [scherm, perThema] of Object.entries(perScherm)) {
        expect(Object.keys(perThema).sort(), `${rol} op ${scherm}`).toEqual([...THEMAS].sort());
        for (const n of Object.values(perThema)) expect(n.gewoon && n.bij, `${rol} op ${scherm}`).toBeTruthy();
      }
    }
  });
});

describe('vulKleuren', () => {
  it('vult de naam van het scherm en het thema in, ook de verbogen vorm', () => {
    expect(vulKleuren('Een {kleur.klaar} bolletje.', { scherm: 'dagboek/maand', thema: 'poeder' })).toBe('Een bruin bolletje.');
    expect(vulKleuren('Een {kleur.klaar} bolletje.', { scherm: 'dagboek', thema: 'nacht' })).toBe('Een roze bolletje.');
    expect(vulKleuren('Een {kleur.klaar} bolletje.', { scherm: 'vandaag', thema: 'nacht' })).toBe('Een salie bolletje.');
    expect(vulKleuren('Een {kleur.klaar} bolletje.', { scherm: 'supplementen', thema: 'salie' })).toBe('Een salie bolletje.');
    expect(vulKleuren('Het {kleur.klaar:bij} bolletje.', { scherm: 'vandaag', thema: 'poeder' })).toBe('Het salie bolletje.');
    expect(vulKleuren('Het {kleur.vandaag:bij} rondje.', { scherm: 'vandaag' })).toBe('Het paarse rondje.');
    expect(vulKleuren('Vandaag is {kleur.vandaag}.', { scherm: 'dagboek', thema: 'nacht' })).toBe('Vandaag is paars.');
  });

  it('een onbekende rol of een scherm zonder naam: een fout in de console en geen plaatshouder in beeld', () => {
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(vulKleuren('Een {kleur.onbekend} bolletje.', { scherm: 'vandaag' })).toBe('Een bolletje.');
    expect(vulKleuren('Vandaag is {kleur.vandaag}.', { scherm: 'gewicht', thema: 'salie' })).toBe('Vandaag is.');
    expect(fout).toHaveBeenCalledTimes(2);
    expect(String(fout.mock.calls[0][0])).toMatch(/kleur\.onbekend/);
    fout.mockRestore();
  });

  it('een tekst zonder plaatshouder blijft gelijk', () => {
    const x = 'Tik op een dag om hem te openen.';
    expect(vulKleuren(x, { scherm: 'vandaag', thema: 'nacht' })).toBe(x);
  });
});
