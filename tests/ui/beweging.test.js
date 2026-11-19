// De bewegingstaal (src/ui/beweging.js): eersteToon, komOp en telOp, met een kleine nepdocument (Vitest draait zonder DOM).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zend } from '../../src/kern/bus.js';
import { MAX_STAPPEN, eersteToon, komOp, magBewegen, telOp } from '../../src/ui/beweging.js';

function nepElement() {
  const klassen = new Set();
  const stijl = new Map();
  const luisteraars = {};
  return {
    kinderen: [],
    textContent: '',
    className: '',
    attrs: {},
    classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k), contains: (k) => klassen.has(k) },
    style: { setProperty: (k, v) => stijl.set(k, v), removeProperty: (k) => stijl.delete(k) },
    stijl,
    klassen,
    setAttribute(k, v) { this.attrs[k] = v; },
    replaceChildren(...kinderen) { this.kinderen = kinderen; this.textContent = ''; },
    addEventListener(naam, fn) { luisteraars[naam] = fn; },
    klaar(naam = 'animationend') { luisteraars[naam]?.(); },
  };
}

let beweging = true;
let wacht = [];

beforeEach(() => {
  beweging = true;
  wacht = [];
  vi.stubGlobal('matchMedia', () => ({ matches: !beweging }));
  vi.stubGlobal('document', { createElement: () => nepElement() });
  vi.stubGlobal('requestAnimationFrame', (fn) => { wacht.push(fn); return wacht.length; });
  vi.stubGlobal('location', { hash: '#/gewicht' });
});
afterEach(() => vi.unstubAllGlobals());

describe('magBewegen', () => {
  it('is onwaar bij verminderde beweging', () => {
    expect(magBewegen()).toBe(true);
    beweging = false;
    expect(magBewegen()).toBe(false);
  });
});

describe('eersteToon', () => {
  it('is waar bij de eerste aanroep, daarna onwaar tot de volgende routewissel', () => {
    location.hash = '#/een';
    zend('route:gewijzigd', {});
    expect(eersteToon('kaarten')).toBe(true);
    expect(eersteToon('kaarten')).toBe(false); // hertekening na een tik
    expect(eersteToon('grafiek')).toBe(true); // een andere sleutel is een ander onderdeel
    location.hash = '#/twee';
    zend('route:gewijzigd', {});
    expect(eersteToon('kaarten')).toBe(true);
    expect(eersteToon('kaarten')).toBe(false);
  });

  it('telt een scherm dat al getekend werd voor het event niet dubbel', () => {
    location.hash = '#/drie';
    expect(eersteToon('kaarten')).toBe(true); // getekend voor route:gewijzigd
    zend('route:gewijzigd', {});
    expect(eersteToon('kaarten')).toBe(false);
  });
});

describe('komOp', () => {
  it('geeft elk element een klas en een oplopende vertraging, hoogstens 8 stappen', () => {
    const els = Array.from({ length: 12 }, nepElement);
    komOp(els, { stap: 70, start: 100 });
    expect(els.every((e) => e.klassen.has('komop'))).toBe(true);
    expect(els[0].stijl.get('--komop-vertraging')).toBe('100ms');
    expect(els[3].stijl.get('--komop-vertraging')).toBe('310ms');
    const hoogste = Math.max(...els.map((e) => parseInt(e.stijl.get('--komop-vertraging'), 10)));
    expect(hoogste).toBe(100 + MAX_STAPPEN * 70);
    expect(els[11].stijl.get('--komop-vertraging')).toBe(els[8].stijl.get('--komop-vertraging'));
  });

  it('ruimt zijn klasse op na afloop', () => {
    const el = nepElement();
    komOp([el]);
    el.klaar();
    expect(el.klassen.has('komop')).toBe(false);
    expect(el.stijl.has('--komop-vertraging')).toBe(false);
  });

  it('doet niets bij verminderde beweging', () => {
    beweging = false;
    const el = nepElement();
    komOp([el]);
    expect(el.klassen.has('komop')).toBe(false);
  });
});

describe('telOp', () => {
  it('zet bij verminderde beweging meteen de eindwaarde', () => {
    beweging = false;
    const el = nepElement();
    telOp(el, 68.4, { opmaak: (n) => n.toFixed(1) });
    expect(el.textContent).toBe('68.4');
    expect(wacht).toHaveLength(0);
  });

  it('telt op naar de eindwaarde; een schermlezer hoort alleen de eindwaarde', () => {
    const el = nepElement();
    telOp(el, 100, { duur: 600 });
    const [tellend, lezer] = el.kinderen;
    expect(tellend.attrs['aria-hidden']).toBe('true');
    expect(lezer.className).toBe('alleen-lezer');
    expect(lezer.textContent).toBe('100');
    expect(tellend.textContent).toBe('0');
    wacht.shift()(0); // begin
    expect(Number(tellend.textContent)).toBeLessThan(100);
    wacht.shift()(300);
    const half = Number(tellend.textContent);
    expect(half).toBeGreaterThan(50); // zacht afremmend
    expect(half).toBeLessThan(100);
    wacht.shift()(700); // voorbij de duur
    expect(el.textContent).toBe('100');
    expect(wacht).toHaveLength(0);
  });

  it('stopt met een terugvalfunctie op de eindwaarde', () => {
    const el = nepElement();
    const stop = telOp(el, 50);
    stop();
    expect(el.textContent).toBe('50');
  });
});
