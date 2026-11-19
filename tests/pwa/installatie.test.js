// Detectie van iOS en van "staat op het beginscherm" (src/pwa/installatie.js).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isIos, isGeinstalleerd } from '../../src/pwa/installatie.js';

afterEach(() => vi.unstubAllGlobals());

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

describe('installatie', () => {
  it('herkent een iPhone en geen desktop', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', platform: 'Win32', maxTouchPoints: 0 });
    expect(isIos()).toBe(false);
  });

  it('herkent een iPad die zich als Mac meldt', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
  });

  it('herkent de app op het beginscherm', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE, standalone: true });
    expect(isGeinstalleerd()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: IPHONE, standalone: false });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(isGeinstalleerd()).toBe(false);
    vi.stubGlobal('window', { matchMedia: (q) => ({ matches: q.includes('standalone') }) });
    expect(isGeinstalleerd()).toBe(true);
  });
});
