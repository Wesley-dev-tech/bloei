// Bewaakt de toon van alle teksten (PLAN.md §3.5 en §8.5): geen uitroeptekens, geen emoji
// en geen woorden uit de zwarte lijst. Elke tekst staat in src/teksten.js.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TEKSTEN, t, warmeZin } from '../../src/teksten.js';

// Alle tekstwaarden met hun sleutel, ook in lijsten (zoals de herstelvragen).
function verzamel(waarde, pad = '') {
  if (typeof waarde === 'string') return [[pad, waarde]];
  return Object.entries(waarde).flatMap(([sleutel, deel]) => verzamel(deel, pad ? `${pad}.${sleutel}` : sleutel));
}

const ALLES = verzamel(TEKSTEN);

// Zwarte lijst uit §3.5 (marketingtaal) en §8.5 (oordeel).
const ZWART = [
  /journey/i,
  /wellness/i,
  /geweldig/i,
  /\bsuper\b/i,
  /\bmoet\b/i,
  /\bmoeten\b/i,
  /gemist/i,
  /vergeten/i,
  /calorie/i,
  /\bslecht\b/i,
  // Woorden van de oude schriftmetafoor (huisstijl Bloei, beslissing 125).
  /schrift|bladzijde|kaft|etiket|stempel|veeg|kanttekening/i,
];

describe('teksten', () => {
  it('bevat alle naamruimtes uit het contract', () => {
    const verplicht = [
      'tab', 'begroeting', 'maaltijd', 'gevoel', 'stemming', 'energie', 'dag', 'week', 'maand',
      'drinken', 'drank', 'gewicht', 'meer', 'instellingen', 'profiel', 'favorieten', 'reeks',
      'badge', 'wissen', 'welkom', 'installatie', 'meldingen', 'melding', 'slot',
      'algemeen', 'leeg', 'thema',
    ];
    for (const naam of verplicht) expect(TEKSTEN, naam).toHaveProperty(naam);
  });

  it('heeft geen lege teksten', () => {
    for (const [sleutel, tekst] of ALLES) expect(tekst.trim(), sleutel).not.toBe('');
  });

  // BESLISSING 704: één uitzondering, op vraag van de eigenaar: de balk die vraagt om te updaten. Verder blijft de regel gelden.
  const UITROEP_MAG = ['algemeen.nieuweVersie'];
  it('heeft geen uitroeptekens', () => {
    for (const [sleutel, tekst] of ALLES) {
      if (UITROEP_MAG.includes(sleutel)) continue;
      expect(tekst, sleutel).not.toContain('!');
    }
  });

  it('heeft geen emoji', () => {
    for (const [sleutel, tekst] of ALLES) {
      expect(/\p{Extended_Pictographic}/u.test(tekst), sleutel).toBe(false);
    }
  });

  it('gebruikt geen woorden uit de zwarte lijst', () => {
    for (const [sleutel, tekst] of ALLES) {
      for (const woord of ZWART) expect(woord.test(tekst), `${sleutel}: ${woord}`).toBe(false);
    }
  });

  it('heeft de vaste teksten uit §8.5 letterlijk', () => {
    const vast = {
      'begroeting.ochtend': 'Goeiemorgen, {naam}',
      'begroeting.middag': 'Goeiemiddag, {naam}',
      'begroeting.avond': 'Goeienavond, {naam}',
      'maaltijd.vraag': 'Wat heb je gegeten?',
      'maaltijd.zelfde': 'Zelfde als gisteren',
      'gevoel.vraag': 'Hoe voelde je je erna?',
      'stemming.vraag': 'Hoe was je dag?',
      'energie.vraag': 'Hoeveel fut had je?',
      'dag.notitie': 'Nog iets over vandaag?',
      'dag.toekomst': 'Deze dag is nog niet aan de beurt.',
      'drinken.knop': 'Kan water erbij',
      'drinken.stand': '{liter} van {doel}',
      'drinken.doel': 'Je dagdoel is gehaald.',
      'drinken.leeg': 'Nog niets gedronken vandaag. Eén tik per drank.',
      'drinken.laatsteWeg': 'Laatste weghalen',
      'gewicht.noteren': 'Weging noteren',
      'gewicht.genoteerd': 'Genoteerd.',
      'gewicht.verschil': '{verschil} sinds vorige week',
      'gewicht.vervangen': 'Deze week staat er al {kg}. Vervangen?',
      'gewicht.leeg': 'Hier komt je eerste weging.',
      'reeks.samen': '{dagen} dagen bijgehouden · {reeks} op rij',
      'vandaag.leeg': 'Nog niets genoteerd vandaag.',
      'vandaag.weegdag': 'Het is je weegdag.',
      'wissen.vraag1': 'Alles wat je in Bloei hebt bijgehouden verdwijnt van dit toestel: je maaltijden, drinken, supplementen, wegingen, stemming, notities, badges, je naam en foto en je instellingen. Dit kan je niet ongedaan maken.',
      'wissen.vraag2': 'Je profiel en alles erin worden nu echt verwijderd.',
      'melding.dagboekLeeg': 'Je dag van vandaag is nog leeg. Even bijschrijven?',
      'melding.dagboekOpen': 'Nog open voor vandaag: {open}.',
      'melding.dagboekKlaar': 'Alles staat erin voor vandaag. Slaapwel.',
      'melding.algemeen': 'Bloei ligt klaar.',
      'meldingen.ios': 'Op een iPhone kan dit alleen als Bloei op je beginscherm staat.',
      'slot.passkeyUitleg': 'Je iPhone bewaart hiervoor een sleutel en vraagt je gezicht om Bloei te openen.',
      'installatie.ios': 'Zet Bloei op je beginscherm: tik op Deel en dan op "Zet op beginscherm".',
      'leeg.komtNog': 'Dit deel van Bloei volgt binnenkort.',
    };
    for (const [sleutel, tekst] of Object.entries(vast)) expect(t(sleutel), sleutel).toBe(tekst);
    for (const [i, naam] of ['moe', 'gewoon', 'goed', 'blij', 'stralend'].entries()) {
      expect(t('gevoel.' + (i + 1))).toBe(naam);
    }
    for (const [i, naam] of ['moe', 'gewoon', 'goed', 'blij', 'stralend'].entries()) {
      expect(t('stemming.' + (i + 1))).toBe(naam);
    }
    for (const [i, naam] of ['laag', 'rustig', 'gewoon', 'goed', 'vol'].entries()) {
      expect(t('energie.' + (i + 1))).toBe(naam);
    }
  });

  it('heeft voor elke badge een naam en een uitleg, en geen herstelvragen meer', () => {
    expect(Object.keys(TEKSTEN.badge.namen)).toHaveLength(33);
    expect(Object.keys(TEKSTEN.badge.voorwaarden)).toHaveLength(33);
    expect(Object.keys(TEKSTEN.badge.namen).sort()).toEqual(Object.keys(TEKSTEN.badge.voorwaarden).sort());
    expect(TEKSTEN.slot.herstelVragen).toBeUndefined();
  });

  it('vervangt plaatshouders en meldt een ontbrekende sleutel', () => {
    expect(t('begroeting.ochtend', { naam: 'Testnaam' })).toBe('Goeiemorgen, Testnaam');
    expect(t('drinken.stand', { liter: '0,75 l', doel: '1,5 l' })).toBe('0,75 l van 1,5 l');
    const waarschuwingen = [];
    const oud = console.warn;
    console.warn = (...a) => waarschuwingen.push(a);
    expect(t('bestaat.niet')).toBe('bestaat.niet');
    console.warn = oud;
    expect(waarschuwingen).toHaveLength(1);
  });
});

// Elke sleutel die de code met t('...') opvraagt, bestaat ook echt in teksten.js.
describe('sleutels in de code', () => {
  const bestanden = [];
  const loop = (map) => {
    for (const naam of readdirSync(map)) {
      const pad = join(map, naam);
      if (statSync(pad).isDirectory()) loop(pad);
      else if (pad.endsWith('.js') && !pad.endsWith('teksten.js')) bestanden.push(pad);
    }
  };
  loop(join(import.meta.dirname, '..', '..', 'src'));

  it('vindt voor elke letterlijke t()-sleutel een tekst', () => {
    const ontbreekt = [];
    for (const bestand of bestanden) {
      const tekst = readFileSync(bestand, 'utf8');
      for (const m of tekst.matchAll(/\bt\(\s*'([a-zA-Z]+(?:\.[a-zA-Z0-9-]+)+)'/g)) {
        const waarde = m[1].split('.').reduce((o, d) => (o == null ? o : o[d]), TEKSTEN);
        if (typeof waarde !== 'string') ontbreekt.push(`${bestand}: ${m[1]}`);
      }
    }
    expect(ontbreekt).toEqual([]);
  });

  it('heeft ook de samengestelde sleutels (maaltijd, drank, stemming, gevoel, energie)', () => {
    for (const soort of ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack']) expect(typeof TEKSTEN.maaltijd[soort]).toBe('string');
    for (const soort of ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders']) expect(typeof TEKSTEN.drank[soort]).toBe('string');
    for (const n of [1, 2, 3, 4, 5]) for (const ns of ['gevoel', 'stemming', 'energie']) expect(typeof TEKSTEN[ns][n]).toBe('string');
    for (const d of ['ochtend', 'middag', 'avond']) expect(typeof TEKSTEN.begroeting[d]).toBe('string');
  });
});

// De warme zinnen van de motivatie (BESLISSING 114): per groep precies het afgesproken aantal.
import { GROEPEN, WEEKGROEPEN, kiesZin, kiesWeekZin } from '../../src/logica/motivatie.js';

describe('motivatie', () => {
  const alle = { ...GROEPEN, ...WEEKGROEPEN };

  it('heeft per groep precies het afgesproken aantal zinnen', () => {
    for (const [groep, aantal] of Object.entries(alle)) {
      const zinnen = TEKSTEN.motivatie[groep];
      expect(zinnen, groep).toBeTruthy();
      expect(Object.keys(zinnen), groep).toHaveLength(aantal);
      for (let nr = 1; nr <= aantal; nr++) expect(typeof zinnen[nr], `${groep}.${nr}`).toBe('string');
    }
    expect(Object.keys(TEKSTEN.motivatie).sort()).toEqual(Object.keys(alle).sort());
  });

  it('heeft zinnen zonder gewicht, eten, schuld of bevel (naast de algemene zwarte lijst)', () => {
    for (const [sleutel, tekst] of ALLES.filter(([k]) => k.startsWith('motivatie.'))) {
      expect(tekst, sleutel).not.toMatch(/gewicht|kilo|afgevallen|bijgekomen|je hebt nog niet|nog niet genoeg|moet|\bzou\b/i);
      expect(tekst.length, sleutel).toBeLessThan(110);
    }
  });

  it('zet de voornaam alleen in de vorm ", {naam}" en laat het stuk weg zonder naam', () => {
    for (const [sleutel, tekst] of ALLES.filter(([k]) => k.startsWith('motivatie.'))) {
      // {naam} komt alleen voor in de vorm ", {naam}", nooit aan het begin of los
      expect(tekst.replaceAll(', {naam}', '').includes('{naam}'), sleutel).toBe(false);
      const met = warmeZin(sleutel, 'Testnaam Achternaam');
      const zonder = warmeZin(sleutel, '');
      expect(met, sleutel).not.toContain('{');
      expect(zonder, sleutel).not.toContain('{');
      expect(zonder, sleutel).not.toMatch(/ ,|,\s*[.!?]|,$/);
      if (tekst.includes('{naam}')) {
        expect(met, sleutel).toContain(', Testnaam');
        expect(met, sleutel).not.toContain('Achternaam'); // alleen de voornaam
        expect(zonder.length, sleutel).toBeLessThan(met.length);
      } else {
        expect(met).toBe(zonder);
      }
    }
    expect(warmeZin('motivatie.onderweg.1', 'Testnaam')).toBe('Goed bezig, Testnaam. Beginnen is het moeilijkste, en dat heb je al gedaan.');
    expect(warmeZin('motivatie.onderweg.1', null)).toBe('Goed bezig. Beginnen is het moeilijkste, en dat heb je al gedaan.');
  });

  it('geeft voor elke toestand een bestaande zin en dezelfde zin bij herhaling', () => {
    const basis = { dagdeel: 'ochtend', maaltijden: 0, ml: 0, doelMl: 2000, supplementen: { genomen: 0, totaal: 0 }, stemming: null, lopendeReeks: 0, dagenBijgehouden: 0, dagenSindsVorige: null, datum: '2026-11-13' };
    const gevallen = [
      basis,
      { ...basis, maaltijden: 1 },
      { ...basis, ml: 1600 },
      { ...basis, ml: 2000 },
      { ...basis, supplementen: { genomen: 2, totaal: 2 } },
      { ...basis, maaltijden: 1, ml: 500, supplementen: { genomen: 1, totaal: 2 }, stemming: 3 },
      { ...basis, maaltijden: 1, dagenSindsVorige: 5 },
      { ...basis, maaltijden: 1, lopendeReeks: 7 },
    ];
    for (const status of gevallen) {
      const sleutel = kiesZin(status);
      expect(typeof t(sleutel), sleutel).toBe('string');
      expect(kiesZin(status)).toBe(sleutel);
    }
    for (const dagen of [0, 2, 5, 7]) expect(t(kiesWeekZin(dagen, '2026-11-09'))).not.toContain('motivatie.');
  });
});

// Bevinding van de beveiligingsscan: replaceAll met een tekst als vervanging leest $&, $', $`, $1 en $$ als patroon en verminkt de zin.
// t() en warmeZin() geven de vervanging als functie mee, zodat een profielnaam of supplementnaam letterlijk in de zin komt. Verzonnen namen.
describe('waarden met dollartekens', () => {
  const NAMEN = ['A$&B', "Sof$'ie", 'x$`y', 'Kuur $1', 'twee $$ tekens', '$'];
  it('een profielnaam in de begroeting (t) en in een warme zin (warmeZin)', () => {
    for (const naam of NAMEN) expect(t('begroeting.ochtend', { naam })).toBe(`Goeiemorgen, ${naam}`);
    // warmeZin neemt alleen de voornaam (het eerste woord): namen uit een woord.
    for (const naam of ['A$&B', "Sof$'ie", 'x$`y', 'Kuur$1', '$$', '$']) {
      expect(warmeZin('motivatie.onderweg.1', naam)).toBe(`Goed bezig, ${naam}. Beginnen is het moeilijkste, en dat heb je al gedaan.`);
    }
  });
  it('een supplementnaam in een zin', () => {
    for (const naam of NAMEN) expect(t('supplementen.bewerkSchema', { naam })).toBe(`Schema van ${naam} aanpassen`);
  });
});

// De supplementenlijst als bestand (BESLISSINGEN 696 en 707): geen bestandsnaam met extensie en geen aantallen in een tekst die de
// gebruiker ziet of hoort; geen uitroepteken en geen verboden teken (die laatste twee bewaken ook de algemene tests hierboven).
describe('lijstBestand', () => {
  const zinnen = verzamel(TEKSTEN.lijstBestand, 'lijstBestand');
  it('heeft alle teksten die het onderdeel gebruikt', () => {
    for (const sleutel of ['groep', 'knopBewaren', 'knopBewarenLabel', 'knopOvernemen', 'knopOvernemenLabel', 'knopOvernemenLeeg', 'bewaard', 'bewarenMislukt', 'titel', 'leegVraag', 'knopJa', 'keuzeVraag', 'knopToevoegen', 'knopVervangen', 'knopAnnuleren', 'toevoegenUitleg', 'toevoegenNiets', 'vervangenUitleg', 'vervangenDagboek', 'bezig', 'klaarNieuw', 'klaarToevoegen', 'klaarVervangen', 'mislukt']) {
      expect(TEKSTEN.lijstBestand[sleutel], sleutel).toBeTypeOf('string');
    }
    for (const reden of ['leeg', 'te-groot', 'onleesbaar', 'ander-bestand', 'nieuwere-versie', 'lege-lijst', 'te-veel', 'ongeldig']) expect(TEKSTEN.lijstBestand.reden[reden], reden).toBeTypeOf('string');
  });
  it('noemt geen bestandsnaam, geen extensie en geen aantal', () => {
    for (const [sleutel, tekst] of zinnen) {
      expect(tekst, sleutel).not.toMatch(/json|\.[a-z0-9]{2,4}\b/i);
      expect(tekst, sleutel).not.toMatch(/\d/);
      expect(tekst, sleutel).not.toMatch(/\{[a-z]+\}/i); // geen plaatshouder: er wordt niets ingevuld
    }
  });
  it('de aria-label van een knop begint met de zichtbare tekst (spraakbediening)', () => {
    const l = TEKSTEN.lijstBestand;
    expect(l.knopBewarenLabel.startsWith(l.knopBewaren)).toBe(true);
    expect(l.knopOvernemenLabel.startsWith(l.knopOvernemen)).toBe(true);
  });
  it('de foutmelding verwijst naar de knop zoals ze er staat', () => {
    expect(t('lijstBestand.reden.ander-bestand')).toBe(`Dat is geen supplementenlijst van Bloei. Kies het bestand dat je met Exporteren maakte.`);
  });
});
