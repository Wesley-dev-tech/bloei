import { describe, expect, test } from 'vitest';
import { volgBediening } from '../../src/kern/bediening.js';

function nepDoc(aanraak) {
  const luisteraars = {};
  const doc = {
    documentElement: { dataset: {} },
    defaultView: { matchMedia: () => ({ matches: aanraak }) },
    addEventListener: (naam, f) => { luisteraars[naam] = f; },
  };
  return { doc, stuur: (naam, e) => luisteraars[naam](e) };
}

describe('volgBediening', () => {
  test('zonder aanraakscherm staat er bij de start niets', () => {
    const { doc } = nepDoc(false);
    volgBediening(doc);
    expect(doc.documentElement.dataset.bediening).toBeUndefined();
  });
  test('met alleen aanraking staat er bij de start aanraak', () => {
    const { doc } = nepDoc(true);
    volgBediening(doc);
    expect(doc.documentElement.dataset.bediening).toBe('aanraak');
  });
  test('touch en pen zetten aanraak, muis zet muis, Tab zet toetsen', () => {
    const { doc, stuur } = nepDoc(false);
    volgBediening(doc);
    stuur('pointerdown', { pointerType: 'touch' });
    expect(doc.documentElement.dataset.bediening).toBe('aanraak');
    stuur('keydown', { key: 'Tab' });
    expect(doc.documentElement.dataset.bediening).toBe('toetsen');
    stuur('pointerdown', { pointerType: 'mouse' });
    expect(doc.documentElement.dataset.bediening).toBe('muis');
    stuur('pointerdown', { pointerType: 'pen' });
    expect(doc.documentElement.dataset.bediening).toBe('aanraak');
  });
  test('een gewone letter verandert niets; spatie en pijl zetten toetsen', () => {
    const { doc, stuur } = nepDoc(true);
    volgBediening(doc);
    stuur('keydown', { key: 'a' });
    expect(doc.documentElement.dataset.bediening).toBe('aanraak');
    stuur('keydown', { key: ' ' });
    expect(doc.documentElement.dataset.bediening).toBe('toetsen');
    stuur('pointerdown', { pointerType: 'touch' });
    stuur('keydown', { key: 'ArrowDown' });
    expect(doc.documentElement.dataset.bediening).toBe('toetsen');
  });
});
