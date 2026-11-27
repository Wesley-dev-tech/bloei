// De pure kant van push.js en config.js: het lichaam van het verzoek (alleen abonnement en uren), kwartieren, het adres van de dienst en
// de herkenning van een iPhone of iPad (ook een iPad die zich als Mac voordoet).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { afmeldLichaam, alleUren, bouwLichaam, kwartier } from '../../src/meldingen/push.js';
import { schoonAdres } from '../../src/meldingen/config.js';
import { isIos, isGeinstalleerd } from '../../src/pwa/installatie.js';

afterEach(() => vi.unstubAllGlobals());

describe('lichaam van een afmelding (BESLISSING 329)', () => {
  it('bevat het endpoint en het auth-geheim, en verder niets (geen p256dh, geen naam)', () => {
    const abonnement = { endpoint: 'https://web.push.apple.com/x', expirationTime: null, keys: { p256dh: 'P', auth: 'A' }, naam: 'Testnaam' };
    expect(afmeldLichaam(abonnement)).toEqual({ endpoint: 'https://web.push.apple.com/x', auth: 'A' });
  });
  it('zonder bewaard geheim alleen het endpoint (de dienst wist dan niets)', () => {
    expect(afmeldLichaam({ endpoint: 'https://web.push.apple.com/x' })).toEqual({ endpoint: 'https://web.push.apple.com/x' });
    expect(afmeldLichaam(null)).toEqual({ endpoint: undefined });
  });
  it('het lichaam van een aanmelding blijft { abonnement, uren }: het geheim zit al in abonnement.keys', () => {
    const lichaam = bouwLichaam({ endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'P', auth: 'A' } }, { dagboek: { aan: true, uur: '20:00' } });
    expect(Object.keys(lichaam).sort()).toEqual(['abonnement', 'uren']);
    expect(lichaam.abonnement.keys.auth).toBe('A');
  });
});

describe('lichaam van het verzoek', () => {
  const abonnement = { endpoint: 'https://web.push.apple.com/x', expirationTime: null, keys: { p256dh: 'P', auth: 'A' }, naam: 'Testnaam' };
  const keuzes = {
    dagboek: { aan: true, uur: '20:00' },
    drinken: [{ aan: true, uur: '11:00' }, { aan: false, uur: '15:00' }, { aan: true, uur: '19:00' }],
    supplementenUren: [{ aan: true, uur: '08:00' }, { aan: false, uur: '13:00' }],
  };
  it('bevat alleen het abonnement en de lijst van kwartieren, zonder soort', () => {
    expect(bouwLichaam(abonnement, keuzes)).toEqual({
      abonnement: { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'P', auth: 'A' } },
      uren: ['08:00', '11:00', '19:00', '20:00'],
    });
  });
  it('wat uit staat telt niet mee; alles uit geeft een lege lijst', () => {
    expect(alleUren({ dagboek: { aan: false, uur: '20:00' }, drinken: [{ aan: false, uur: '11:00' }], supplementenUren: [] })).toEqual([]);
  });
  it('twee gelijke uren zijn één kwartier', () => {
    expect(alleUren({ dagboek: { aan: true, uur: '19:00' }, drinken: [{ aan: true, uur: '19:00' }], supplementenUren: [{ aan: true, uur: '19:00' }] })).toEqual(['19:00']);
  });
  it('een uur wijzigen vervangt het oude kwartier in de lijst', () => {
    const nieuw = { ...keuzes, drinken: [{ aan: true, uur: '11:15' }, keuzes.drinken[1], keuzes.drinken[2]] };
    expect(alleUren(nieuw)).toEqual(['08:00', '11:15', '19:00', '20:00']);
  });
  it('houdt zich aan het maximum van 12 uren', () => {
    const veel = { dagboek: { aan: false }, drinken: Array.from({ length: 20 }, (_, i) => ({ aan: true, uur: `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}` })), supplementenUren: [] };
    // BESLISSING 736: hoogstens drie tijdstippen per soort, bij Drinken vier (0.6.7), dus van een lange lijst Drinken gaan alleen de eerste vier mee.
    expect(alleUren(veel)).toEqual(['08:00', '08:15', '08:30', '08:45']);
    const vol = (u, n = 3) => Array.from({ length: n }, (_, i) => ({ aan: true, uur: `${String(u + i).padStart(2, '0')}:00` }));
    expect(alleUren({ dagboek: { aan: true, uur: '06:00', tijdstippen: vol(6) }, eten: vol(9), drinken: vol(12, 4), supplementenUren: vol(16) })).toHaveLength(12); // Dagboek telt er twee
  });
  it('geeft het uur per minuut door, zonder afronding (BESLISSING 713)', () => {
    expect(alleUren({ ...keuzes, dagboek: { aan: true, uur: '19:59' } })).toContain('19:59');
    expect(alleUren({ dagboek: { aan: true, uur: '25:99' }, drinken: [{ aan: true, uur: 'abc' }], supplementenUren: [] })).toEqual([]);
    expect(alleUren({ dagboek: { aan: true, uur: '19:59' }, drinken: [{ aan: true, uur: '19:59' }], supplementenUren: [{ aan: true, uur: '19:59' }] })).toEqual(['19:59']);
  });
  it('de afronding op het kwartier blijft bestaan voor een oude dienst', () => {
    expect(kwartier('20:07')).toBe('20:00');
    expect(kwartier('08:44')).toBe('08:30');
    expect(kwartier('08:45')).toBe('08:45');
  });
});

describe('adres van de dienst', () => {
  it('alleen https, of localhost bij het ontwikkelen', () => {
    expect(schoonAdres('https://bloei.example.workers.dev/')).toBe('https://bloei.example.workers.dev');
    expect(schoonAdres('http://localhost:8787')).toBe('http://localhost:8787');
    expect(schoonAdres('http://voorbeeld.nl')).toBe('');
    expect(schoonAdres('')).toBe('');
    expect(schoonAdres(undefined)).toBe('');
  });
});

describe('iPhone en iPad', () => {
  const nep = (navigatorDeel, venster = {}) => {
    vi.stubGlobal('navigator', navigatorDeel);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), ...venster });
  };
  it('herkent een iPhone en een iPad met iPad-user-agent', () => {
    nep({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
    nep({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
  });
  it('herkent een iPad die zich als Mac voordoet (iPadOS: desktop-user-agent) aan het aanraakscherm', () => {
    nep({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
  });
  it('een echte Mac zonder aanraakscherm is geen iPad', () => {
    nep({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIos()).toBe(false);
  });
  it('op het beginscherm: navigator.standalone of display-mode standalone', () => {
    nep({ userAgent: '', platform: 'MacIntel', maxTouchPoints: 5, standalone: true });
    expect(isGeinstalleerd()).toBe(true);
    nep({ userAgent: '', platform: 'MacIntel', maxTouchPoints: 5 }, { matchMedia: (q) => ({ matches: q.includes('standalone') }) });
    expect(isGeinstalleerd()).toBe(true);
    nep({ userAgent: '', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isGeinstalleerd()).toBe(false);
  });
});
