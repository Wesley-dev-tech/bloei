// Een tik op een melding opent of focust de app op het juiste scherm.
import { describe, it, expect, vi } from 'vitest';
import { opneApp } from '../../src/meldingen/klik.js';

const BEREIK = 'https://voorbeeld.github.io/bloei/';
const nepClients = (vensters) => ({ matchAll: vi.fn(async () => vensters), openWindow: vi.fn(async () => 'nieuw') });

describe('opneApp', () => {
  it('zonder open venster: opent de app op het juiste scherm', async () => {
    const clients = nepClients([]);
    await opneApp(clients, BEREIK, '#/gewicht');
    expect(clients.openWindow).toHaveBeenCalledWith(BEREIK + '#/gewicht');
  });
  it('met een open venster: focus en navigeer, zonder een tweede venster', async () => {
    const venster = { url: BEREIK + '#/vandaag', focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}), postMessage: vi.fn() };
    const clients = nepClients([{ url: 'https://ander.example/', focus: vi.fn() }, venster]);
    await opneApp(clients, BEREIK, '#/supplementen');
    expect(venster.focus).toHaveBeenCalled();
    expect(venster.navigate).toHaveBeenCalledWith(BEREIK + '#/supplementen');
    expect(clients.openWindow).not.toHaveBeenCalled();
  });
  it('kan het venster niet navigeren: de app krijgt een bericht', async () => {
    const venster = { url: BEREIK, focus: vi.fn(async () => {}), navigate: vi.fn(async () => { throw new Error('nee'); }), postMessage: vi.fn() };
    await opneApp(nepClients([venster]), BEREIK, '#/vandaag');
    expect(venster.postMessage).toHaveBeenCalledWith({ soort: 'ga', pad: '#/vandaag' });
  });
});
