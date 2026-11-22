// Meer · Favorieten (E3), in de vaste opbouw van een instelscherm (BESLISSING 164): links "Nieuwe favoriet" en de lijst (naam, bij welke maaltijd ze
// hem het vaakst noteerde, aanpassen en weghalen met "Ongedaan maken") met "Goed om te weten"; rechts "Zo ziet het eruit": een maaltijdregel met de
// favorieten als chips, zoals ze op Vandaag verschijnen. Zonder favorieten staat er een rustige lege toestand in de lijst.
import { haakUitleg } from '../ui/uitleghaken.js';
import { h } from '../ui/dom.js';
import { ICOON, begripOpties, begripIcoon } from '../ui/iconenkaart.js';
import { kaart, kaartkop, rij, knop, tekstveld, legeToestand, strook, tril, schermkop, icoonknop } from '../ui/componenten.js';
import { weetjesVoor } from '../ui/weetjes.js';
import { eersteToon, komOp } from '../ui/beweging.js';
import { MAALTIJDICOON } from '../ui/beeld.js';
import { beheerScherm, terugKnop } from './hulp.js';
import { balanceer } from './instel-balans.js';
import { t, TEKSTEN } from '../teksten.js';
import { zend } from '../kern/bus.js';
import { db } from '../data/db.js';
import { MAX_LENGTE } from '../data/grenzen.js';
import { leesFavorieten, voegFavorietToe, verwijderFavoriet, maakSleutel } from '../data/favorieten.js';

// Naam aanpassen: de sleutel volgt de tekst. Bestaat de nieuwe tekst al bij een andere favoriet, dan blijft alles zoals het was.
async function hernoem(favoriet, nieuweTekst) {
  const schoon = String(nieuweTekst ?? '').trim();
  const sleutel = maakSleutel(schoon);
  if (!sleutel || schoon === favoriet.tekst) return 'gelijk';
  const andere = await db.favorieten.where('sleutel').equals(sleutel).first();
  if (andere && andere.id !== favoriet.id) return 'bestaat';
  await db.favorieten.update(favoriet.id, { tekst: schoon, sleutel });
  zend('data:gewijzigd', { store: 'favorieten' });
  return 'ok';
}

// Bij welke maaltijd een favoriet het vaakst staat: uit je eigen maaltijden met dezelfde tekst.
async function maaltijdPerFavoriet(favorieten) {
  const sleutels = new Map(favorieten.map((f) => [f.sleutel, f.id]));
  const telling = new Map();
  await db.maaltijden.each((m) => {
    if (m.voorbeeld) return;
    const id = sleutels.get(maakSleutel(m.tekst));
    if (id == null) return;
    const per = telling.get(id) ?? {};
    per[m.soort] = (per[m.soort] ?? 0) + 1;
    telling.set(id, per);
  });
  const uitvoer = new Map();
  for (const [id, per] of telling) uitvoer.set(id, Object.entries(per).sort((a, b) => b[1] - a[1])[0][0]);
  return uitvoer;
}

export function toon(houder) {
  const staat = { bewerkId: null };
  const opnieuw = () => zend('data:gewijzigd', { store: 'favorieten' });

  const opruimScherm = beheerScherm(houder, async (ctx) => {
    const favorieten = await leesFavorieten();
    const soorten = await maaltijdPerFavoriet(favorieten);
    const opent = eersteToon('meer-favorieten');

    let tekst = '';
    const veld = tekstveld({ plaats: t('favorieten.nieuwPlaats'), label: t('favorieten.nieuw'), opWijzig: (v) => (tekst = v) });
    veld.maxLength = MAX_LENGTE.favoriet;
    const voegToe = async () => {
      if (!tekst.trim()) return;
      await voegFavorietToe(tekst);
    };
    veld.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        voegToe();
      }
    });
    const nieuw = kaart(
      { klasse: 'favorieten__nieuw' },
      kaartkop({ tegel: begripOpties('favoriet'), label: t('favorieten.nieuw') }),
      h('div', { class: 'favoriet__nieuw' }, veld, knop(t('favorieten.toevoegen'), { soort: 'secundair', opKlik: voegToe })),
    );

    const maakRij = (f) => {
      const bewerkt = staat.bewerkId === f.id;
      const soort = soorten.get(f.id);
      let titel = f.tekst;
      if (bewerkt) {
        const invoer = tekstveld({ waarde: f.tekst, label: t('favorieten.bewerk', { tekst: f.tekst }), opWijzig: () => {} });
        invoer.maxLength = MAX_LENGTE.favoriet;
        const bewaar = async () => {
          const waarde = invoer.value;
          staat.bewerkId = null;
          invoer.blur();
          const uitkomst = await hernoem(f, waarde);
          if (uitkomst === 'bestaat') strook(t('favorieten.bestaatAl'));
          else if (uitkomst === 'ok') strook(t('favorieten.aangepast'), { duur: 6000, actie: { label: t('algemeen.ongedaan'), opKlik: () => hernoem({ ...f, tekst: waarde.trim() }, f.tekst).then(opnieuw) } });
          opnieuw();
        };
        invoer.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            bewaar();
          } else if (e.key === 'Escape') {
            staat.bewerkId = null;
            invoer.blur();
            opnieuw();
          }
        });
        invoer.addEventListener('blur', () => setTimeout(() => staat.bewerkId === f.id && bewaar(), 120));
        setTimeout(() => invoer.focus?.(), 0);
        titel = invoer;
      }
      return rij({
        tegel: begripOpties('favoriet'),
        titel,
        tekst: soort ? t('favorieten.bij', { maaltijd: t('maaltijd.' + soort).toLowerCase() }) : t('favorieten.nogNiet'),
        eind: h(
          'span',
          { class: 'favoriet__acties' },
          bewerkt
            ? knop(t('supplementen.klaarMet'), { soort: 'tekst', label: t('favorieten.klaarBewerken'), opKlik: () => opnieuw() })
            : icoonknop(ICOON.bewerken.naam, {
                klasse: 'favoriet__bewerk',
                label: t('favorieten.bewerk', { tekst: f.tekst }),
                opKlik: () => {
                  staat.bewerkId = f.id;
                  opnieuw();
                },
              }),
          h(
            'button',
            {
              type: 'button',
              class: 'icoonknop drank__weg',
              'aria-label': t('favorieten.verwijder', { tekst: f.tekst }),
              onclick: () => {
                tril();
                verwijderFavoriet(f.id);
                strook(t('favorieten.verwijderd'), { duur: 6000, actie: { label: t('algemeen.ongedaan'), opKlik: () => voegFavorietToe(f.tekst) } });
              },
            },
            begripIcoon('weghalen', { grootte: 16 }),
          ),
        ),
      });
    };

    const lijst = favorieten.length
      ? kaart({ klasse: 'favorieten__lijst' }, kaartkop({ tegel: begripOpties('favoriet'), label: t('meer.favorieten'), eind: t('meer.bijFavorieten', { aantal: favorieten.length }) }), ...favorieten.map(maakRij))
      : kaart({ klasse: 'favorieten__lijst' }, kaartkop({ tegel: begripOpties('favoriet'), label: t('meer.favorieten') }), legeToestand({ tekst: t('favorieten.leeg') }));

    // ---- Zo ziet het eruit: een maaltijdregel met de favorieten als chips onder de maaltijden, zoals op Vandaag
    // Alle favorieten staan in het voorbeeld; vanaf vijf scrol je binnen het vak (schermen.css), zodat de kaart niet blijft groeien.
    const chipTekst = favorieten.length ? favorieten.map((f) => f.tekst) : TEKSTEN.favorieten.voorbeeld;
    const maaltijdRegel = (soort) =>
      rij({ tegel: { naam: MAALTIJDICOON[soort], familie: ICOON.eten.familie }, titel: t('maaltijd.' + soort), eind: h('span', { class: 'maaltijd__invullen' }, t('maaltijd.invullen')) });
    // BESLISSING 345: onder 1440 px (960 en breder) toont het voorbeeld zoveel maaltijden als er plaats voor is; er staan er altijd minstens twee (ontbijt, middagmaal).
    const maaltijdRijen = ['ontbijt', 'middagmaal', 'avondmaal', 'tussendoortje', 'vieruurtje', 'latesnack'].map((soort, i) => {
      const r = maaltijdRegel(soort);
      if (i >= 2) r.classList.add('is-weg');
      return r;
    });
    const maaltijden = h('div', { class: 'favorietvoorbeeld__maaltijden', 'aria-hidden': 'true' }, ...maaltijdRijen);
    const vulVoorbeeld = (doel, meet) => {
      let k = 2;
      if (doel != null) {
        for (k = maaltijdRijen.length; k > 2; k--) {
          maaltijdRijen.forEach((r, i) => r.classList.toggle('is-weg', i >= k));
          if (meet() <= doel + 0.5) break;
        }
      }
      maaltijdRijen.forEach((r, i) => r.classList.toggle('is-weg', i >= k));
    };
    const voorbeeld = h(
      'aside',
      { class: 'instel__voorbeeld' },
      kaart(
        { klasse: 'favorietvoorbeeld' },
        kaartkop({ tegel: begripOpties('eten'), label: t('instellingen.zoZietHetEruit') }),
        h(
          'div',
          { class: 'instel__groei instel__voorbeeldinhoud' },
          maaltijden,
          h(
            'div',
            { class: 'eten__favorieten favorietvoorbeeld__chips', 'aria-hidden': 'true' },
            h('span', { class: 'label' }, t('vandaag.favorieten')),
            h('div', { class: 'favorietenlijst' }, ...chipTekst.map((tekstje) => h('span', { class: 'favorietvoorbeeld__chip' }, tekstje))),
          ),
          h('p', { class: 't-klein t-gedempt' }, favorieten.length ? t('favorieten.hoeUitleg') : t('favorieten.voorbeeldNoot')),
        ),
      ),
    );
    if (opent) komOp([nieuw, lijst, voorbeeld.firstElementChild], { stap: 90 });

    const scherm = h('div', { class: 'instelscherm' }, h('div', { class: 'instel__lijst' }, nieuw, lijst, weetjesVoor('favorieten', ['favoriet', 'eten', 'bewerken'])), voorbeeld);
    const balans = balanceer(scherm, { vul: vulVoorbeeld });
    ctx.opruim(balans.stop);
    return h('div', { class: 'stapel stapel--sectie meer-sub' }, schermkop({ titel: t('favorieten.titel'), acties: [terugKnop()] }), scherm);
  }, { lichtOp: true });
  const stopHaken = haakUitleg(houder, { haken: [['.favoriet__nieuw', 'favoriet-nieuw'], ['.favorieten__lijst', 'favoriet-lijst'], ['.favoriet__bewerk', 'favoriet-bewerk'], ['.drank__weg', 'favoriet-weg']] });
  return () => {
    stopHaken();
    opruimScherm();
  };
}
