// De pure delen van src/thema/thema.js: welke data-theme hoort bij welke keuze en welk toestelthema.
import { describe, it, expect } from 'vitest';
import { THEMAS, KEUZES, normaliseerKeuze, themaVoorKeuze, dataThemaVoor } from '../../src/thema/thema.js';

describe('thema', () => {
  it('kent drie thema\'s en vier keuzes', () => {
    expect(THEMAS).toEqual(['poeder', 'salie', 'nacht']);
    expect(KEUZES).toEqual(['poeder', 'salie', 'nacht', 'auto']);
  });

  it('een vaste keuze geeft altijd dat thema, ook als het toestel donker staat', () => {
    for (const thema of THEMAS) {
      expect(themaVoorKeuze(thema, false)).toBe(thema);
      expect(themaVoorKeuze(thema, true)).toBe(thema);
    }
  });

  it('auto volgt het toestel: licht is Poeder, donker is Nacht', () => {
    expect(themaVoorKeuze('auto', false)).toBe('poeder');
    expect(themaVoorKeuze('auto', true)).toBe('nacht');
  });

  it('een onbekende of ontbrekende keuze wordt Poeder', () => {
    for (const keuze of [undefined, null, '', 'bes', 'avond', 42]) {
      expect(normaliseerKeuze(keuze)).toBe('poeder');
      expect(themaVoorKeuze(keuze, false)).toBe('poeder');
    }
  });

  it('data-theme: Poeder heeft geen attribuut, Salie en Nacht wel', () => {
    expect(dataThemaVoor('poeder')).toBeNull();
    expect(dataThemaVoor('salie')).toBe('salie');
    expect(dataThemaVoor('nacht')).toBe('nacht');
  });
});
