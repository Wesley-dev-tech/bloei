// BESLISSING 405: een wachtende nieuwe versie wordt actief bij de volgende start (src/pwa/opstart.js).
import { describe, it, expect } from 'vitest';
import { OPSTART_BERICHT, VLAG, activeerWachtendeBijStart, beslisOpstart } from '../../src/pwa/opstart.js';

function nepOpslag(begin = {}) {
  const m = new Map(Object.entries(begin));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// Een nagebootste navigator.serviceWorker. wisselt: wat de wachtende worker antwoordt ('geen' = hij antwoordt niet).
function nepSw({ controller = true, wachtend = true, wisselt = true, neemtOver = true } = {}) {
  const luisteraars = [];
  const berichten = [];
  const worker = {
    postMessage(bericht, poorten = []) {
      berichten.push(bericht);
      if (wisselt === 'geen') return;
      poorten[0]?.postMessage({ wisselt });
      if (wisselt && neemtOver) setTimeout(() => luisteraars.splice(0).forEach((f) => f()), 5);
    },
  };
  return {
    berichten,
    controller: controller ? {} : null,
    getRegistration: async () => ({ waiting: wachtend ? worker : null }),
    addEventListener: (naam, f) => naam === 'controllerchange' && luisteraars.push(f),
  };
}

const start = (sw, opslag, extra = {}) => {
  let herladen = 0;
  const klaar = activeerWachtendeBijStart({ sw, opslag, herlaad: () => herladen++, antwoordMs: 100, overnameMs: 200, ...extra });
  return klaar.then((uit) => ({ uit, herladen }));
};

describe('beslisOpstart', () => {
  it('activeert alleen met een controller, een wachtende worker en zonder vlag', () => {
    expect(beslisOpstart({ heeftController: true, wachtend: {}, vlag: null })).toBe('activeer');
    expect(beslisOpstart({ heeftController: true, wachtend: {}, vlag: '1' })).toBe('niets');
    expect(beslisOpstart({ heeftController: true, wachtend: null, vlag: null })).toBe('niets');
    expect(beslisOpstart({ heeftController: false, wachtend: {}, vlag: null })).toBe('niets');
  });
});

describe('activeerWachtendeBijStart', () => {
  it('wachtende worker bij de start: vraagt over te nemen, zet de vlag en herlaadt één keer', async () => {
    const sw = nepSw();
    const opslag = nepOpslag();
    const { uit, herladen } = await start(sw, opslag);
    expect(uit).toBe(true);
    expect(herladen).toBe(1);
    expect(sw.berichten).toEqual([{ type: OPSTART_BERICHT }]);
    expect(opslag.getItem(VLAG)).not.toBeNull();
  });

  it('de vlag voorkomt een tweede keer: wacht er na het herladen nog altijd een worker, dan start de app gewoon', async () => {
    const opslag = nepOpslag();
    await start(nepSw(), opslag);
    const sw = nepSw();
    const { uit, herladen } = await start(sw, opslag);
    expect(uit).toBe(false);
    expect(herladen).toBe(0);
    expect(sw.berichten).toEqual([]);
  });

  it('geen wachtende worker: niets, en een oude vlag gaat weg (een volgende versie kan dan weer)', async () => {
    const opslag = nepOpslag({ [VLAG]: '1' });
    const sw = nepSw({ wachtend: false });
    const { uit, herladen } = await start(sw, opslag);
    expect(uit).toBe(false);
    expect(herladen).toBe(0);
    expect(opslag.getItem(VLAG)).toBeNull();
    // en daarna, met een nieuwe wachtende versie, werkt het weer
    expect((await start(nepSw(), opslag)).herladen).toBe(1);
  });

  it('geen controller (eerste bezoek, offline zonder worker): niets', async () => {
    const sw = nepSw({ controller: false });
    const { uit, herladen } = await start(sw, nepOpslag());
    expect(uit).toBe(false);
    expect(herladen).toBe(0);
    expect(sw.berichten).toEqual([]);
  });

  it('een ander venster is nog open (de worker zegt nee): niet herladen, de melding blijft', async () => {
    const { uit, herladen } = await start(nepSw({ wisselt: false }), nepOpslag());
    expect(uit).toBe(false);
    expect(herladen).toBe(0);
  });

  it('de worker antwoordt niet (een oudere versie): niet herladen', async () => {
    const { uit, herladen } = await start(nepSw({ wisselt: 'geen' }), nepOpslag());
    expect(uit).toBe(false);
    expect(herladen).toBe(0);
  });

  it('de wissel blijft uit: na de wachttijd toch één keer herladen, nooit eindeloos wachten', async () => {
    const { uit, herladen } = await start(nepSw({ neemtOver: false }), nepOpslag());
    expect(uit).toBe(true);
    expect(herladen).toBe(1);
  });

  it('geen sessionStorage: nooit automatisch herladen', async () => {
    const { uit, herladen } = await start(nepSw(), null);
    expect(uit).toBe(false);
    expect(herladen).toBe(0);
  });
});
