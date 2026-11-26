// BESLISSING 188 en 190: bij hover (en bij indrukken) verandert geen enkele kleur, en lichten rijen, vakken, chips, menu-items en tegels niet als
// geheel op: alleen kaarten en knoppen tillen zichzelf op; al het andere licht op via zijn icoon. Deze test leest alle CSS in src/stijl/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const MAP = new URL('../../src/stijl/', import.meta.url);
// Echt noodzakelijke uitzonderingen, met reden: 'bestand: selector'. Liefst leeg.
// BESLISSING 486: de profielfoto in de kaart Naam en profielfoto licht op als een icoon wanneer de muis op haar rij staat.
const UITZONDERINGEN = ['scherm-algemeen.css: .meer__profiel .meer__profielrij:hover .profielfoto', 'scherm-algemeen.css: .meer__favorieten.kaart--knop .meer__link--plus:hover'];

// Geen kleurverandering bij hover of indrukken: alleen transform, box-shadow, filter en text-decoration zonder kleur.
const KLEUR = /(^|;|\s)(background(-color)?|color|fill|stroke|border(-[a-z]+)?-color|outline-color|opacity)\s*:/;
const BEWEGING = /(^|;|\s)(transform\s*:(?!\s*none)|box-shadow\s*:|filter\s*:)/;
// Het laatste deel van een hoverselector mag zelf optillen als het een kaart of een knop is...
const KADER = /\.(knop(--[a-z]+)?|stapper__knop|cijferblok__toets|chip|segment__deel)\b/;
// ...of als het een icoon (of onderdeel van een icoon, een pijl of een getal) is.
const ICOON = /\.(tegel|icoon|navicoon|themavoorbeeld|licht-icoon|rij__pijl|uitklap__pijl|meer__actie|motiv__tegel|medaille|medaille__vorm|kalender__nr|weekdag__bol|weekstaaf__balk)\b/;

// Een kaart (of paneel of vak als kaart) beweegt bij hover niet en krijgt geen andere schaduw (BESLISSING 195); alleen iconen binnenin mogen.
const KAART = /\.(kaart(--[a-z-]+)?|vc|vc--[a-z-]+|paneel[a-z_-]*|maand__paneel|week__kaart)\b/;

function regels(css) {
  const schoon = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const uit = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(schoon))) uit.push({ selectoren: m[1].trim(), inhoud: m[2] });
  return uit;
}

export function overtredingen() {
  const gevonden = [];
  for (const naam of readdirSync(MAP).filter((n) => n.endsWith('.css'))) {
    for (const { selectoren, inhoud } of regels(readFileSync(join(MAP.pathname.replace(/^\/([A-Za-z]:)/, '$1'), naam), 'utf8'))) {
      for (const sel of selectoren.split(',').map((x) => x.trim())) {
        const kaal = sel.replace(/:not\([^)]*\)/g, '');
        if (!/:(hover|active)\b/.test(kaal) || UITZONDERINGEN.includes(`${naam}: ${sel}`)) continue;
        if (KLEUR.test(inhoud)) gevonden.push(`${naam}: ${sel} (kleur)`);
        if (/:hover\b/.test(kaal) && BEWEGING.test(inhoud)) {
          const doel = kaal.split(/[\s>+~]+/).filter(Boolean).pop();
          const opDoelHover = /:hover/.test(doel);
          // Hoverend element zelf (de laatste in de selector heeft :hover) moet een kader of icoon zijn; anders gaat het om een afstammeling.
          if (KAART.test(doel) && !ICOON.test(doel)) gevonden.push(`${naam}: ${sel} (kaart beweegt)`);
          else if (!KADER.test(doel) && !ICOON.test(doel) && opDoelHover) gevonden.push(`${naam}: ${sel} (heel element)`);
          if (!opDoelHover && !ICOON.test(doel) && !KADER.test(doel)) gevonden.push(`${naam}: ${sel} (heel element)`);
        }
      }
    }
  }
  return gevonden;
}

describe('hover en indrukken', () => {
  test('geen kleur bij hover of indrukken, en alleen kaarten, knoppen en iconen bewegen bij hover', () => {
    expect(overtredingen()).toEqual([]);
  });
});
