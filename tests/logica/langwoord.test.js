// heeftLangWoord: alleen een uitzonderlijk lang woord breekt af (klasse is-langwoord); een gewoon woord blijft heel.
import { describe, expect, test } from 'vitest';
import { heeftLangWoord, LANGWOORD_GRENS } from '../../src/kern/langwoord.js';

describe('heeftLangWoord', () => {
  test('gewone namen blijven onder de grens', () => {
    for (const naam of ['Magnesiumbisglycinaat', 'Vitamine D3', 'Methyltetrahydrofolaat', 'Pyridoxaal-5-fosfaat', 'Chondroïtinesulfaat','Omega-3 visolie', 'Volkorenboterham met kaas', 'Methylcobalamine', 'Ijzerbisglycinaat']) {
      expect(heeftLangWoord(naam), naam).toBe(false);
    }
  });
  test('een woord van 61 tekens is lang', () => {
    expect(heeftLangWoord('Voorbeeld'.repeat(7).slice(0, 61))).toBe(true);
    expect(heeftLangWoord('Vitamine ' + 'x'.repeat(LANGWOORD_GRENS + 1))).toBe(true);
  });
  test('de grens zelf is nog gewoon, een teken meer is lang', () => {
    expect(heeftLangWoord('a'.repeat(LANGWOORD_GRENS))).toBe(false);
    expect(heeftLangWoord('a'.repeat(LANGWOORD_GRENS + 1))).toBe(true);
  });
  test('een gewoon streepje splitst woorden', () => {
    expect(heeftLangWoord('a'.repeat(20) + '-' + 'b'.repeat(20))).toBe(false);
  });
  test('een eigen grens en lege waarden', () => {
    expect(heeftLangWoord('abcdef', 5)).toBe(true);
    expect(heeftLangWoord('')).toBe(false);
    expect(heeftLangWoord(null)).toBe(false);
    expect(heeftLangWoord(undefined)).toBe(false);
  });
});
