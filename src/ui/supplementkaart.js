// De supplementkaart (BESLISSINGEN 213 en 214): één pop-upkaart om een supplement toe te voegen of aan te passen. Een echt <dialog> met showModal();
// op een bureaublad een gecentreerde kaart, op een telefoon een blad van onderen. Eén tegelijk.
//   openSupplementkaart({ id = null, opener = null }) → Promise<{ actie: 'bewaard' | 'weggehaald' | 'geannuleerd', id }>
//   sluitSupplementkaart()                              sluit zonder te bewaren (voor de uitleg)
// Bewaren schrijft alles in één keer via voegSupplementToe of wijzigSupplement; weghalen via verwijderSupplement (inactief als er innames zijn).
import { h } from './dom.js';
import { knop, tekstveld, segment, icoonknop } from './componenten.js';
import { begripTegel, ICOON } from './iconenkaart.js';
import { t } from '../teksten.js';
import { vandaag } from '../kern/datum.js';
import { db } from '../data/db.js';
import { bewaakTerug } from '../pwa/terug.js';
import { MAX_LENGTE } from '../data/grenzen.js';
import { MOMENTEN } from '../logica/supplementen.js';
import { controleer, foutVan, formulierVan, isGewijzigd, leegFormulier, naarAanroep } from '../logica/supplementformulier.js';
import { verwijderSupplement, voegSupplementToe, wijzigSupplement, zetInname } from '../data/supplementen.js';

let open = null; // { dlg, sluit(actie), belofte }

export function sluitSupplementkaart() {
  open?.sluit?.('geannuleerd');
}

export function openSupplementkaart({ id = null, opener = null } = {}) {
  if (open) return open.belofte;
  let klaarFn;
  const belofte = new Promise((resolve) => {
    klaarFn = resolve;
  });
  const staat = { dlg: null, belofte };
  open = staat;
  bouw({ id, opener, staat, klaar: klaarFn }).catch((fout) => {
    console.error(fout);
    staat.sluit?.('geannuleerd');
    if (open === staat) open = null;
    klaarFn({ actie: 'geannuleerd', id });
  });
  return belofte;
}

async function bouw({ id, opener, staat, klaar }) {
  const bestaand = id == null ? null : await db.supplementen.get(id);
  const begin = bestaand ? formulierVan(bestaand, vandaag()) : leegFormulier(vandaag());
  const f = { ...begin, momenten: [...begin.momenten] };
  const oud = bestaand ? !('hoeveelheid' in bestaand) : true;
  let bezig = false;
  let gesloten = false;
  let gedwongen = false; // AN-08: de browser sluit de kaart zelf na een cancel die niet te annuleren was
  let terugWacht = null; // AN-06/07: de geschiedenisingang van de kaart (src/pwa/terug.js)

  // ---- de velden
  const veld = (naam, label, inhoud, extra = {}) => {
    const fout = h('p', { class: 'supplementkaart__fout', role: 'alert', hidden: true });
    return { el: h('div', { class: ['supplementkaart__veld', extra.breed && 'supplementkaart__veld--breed'], 'data-uitleg': extra.haak ?? null }, h('p', { class: 'label' }, label), inhoud, fout), fout, naam };
  };
  const naamInv = tekstveld({ waarde: f.naam, label: t('supplementkaart.naam'), plaats: t('supplementkaart.naamPlaats'), opWijzig: (v) => (f.naam = v) });
  const hoeveelInv = tekstveld({ waarde: f.hoeveelheid, label: t('supplementkaart.hoeveelheid'), plaats: t('supplementkaart.hoeveelheidPlaats'), opWijzig: (v) => (f.hoeveelheid = v) });
  const aanwijsInv = tekstveld({ waarde: f.aanwijzing, label: t('supplementkaart.aanwijzing'), plaats: t('supplementkaart.aanwijzingPlaats'), opWijzig: (v) => (f.aanwijzing = v) });
  naamInv.maxLength = MAX_LENGTE.supplementNaam; // dezelfde grenzen als de gegevenslaag (data/grenzen.js)
  hoeveelInv.maxLength = MAX_LENGTE.supplementVeld;
  aanwijsInv.maxLength = MAX_LENGTE.supplementVeld;
  const dagenInv = tekstveld({ waarde: String(f.dagen), label: t('supplementkaart.dagen'), type: 'number', inputmode: 'numeric', opWijzig: (v) => (f.dagen = v) });
  const startInv = tekstveld({ waarde: f.start, label: t('supplementkaart.volgende'), type: 'date', opWijzig: (v) => (f.start = v) });
  const vanafInv = tekstveld({ waarde: f.vanaf, label: t('supplementkaart.vanaf'), type: 'date', opWijzig: (v) => (f.vanaf = v) });
  const totInv = tekstveld({ waarde: f.tot, label: t('supplementkaart.tot'), type: 'date', opWijzig: (v) => (f.tot = v) });

  const naamV = veld('naam', t('supplementkaart.naam'), naamInv, { haak: 'kaart-naam' });
  const hoeveelV = veld('hoeveelheid', t('supplementkaart.hoeveelheid'), hoeveelInv, { haak: 'kaart-hoeveelheid' });
  const aanwijsV = veld('aanwijzing', t('supplementkaart.aanwijzing'), aanwijsInv, { breed: true, haak: 'kaart-aanwijzing' });
  const dagenV = veld('dagen', t('supplementkaart.dagen'), dagenInv, { haak: 'kaart-dagen' });
  const startV = veld('start', t('supplementkaart.volgende'), startInv, { haak: 'kaart-volgende' });
  const vanafV = veld('vanaf', t('supplementkaart.vanaf'), vanafInv);
  const totV = veld('tot', t('supplementkaart.tot'), totInv);

  // Ritme en momenten wisselen mee met de keuze; de rest blijft staan zodat getypte tekst niet verdwijnt.
  const ritmeHouder = h('div', { class: 'supplementkaart__ritme' });
  const momentFout = h('p', { class: 'supplementkaart__fout', role: 'alert', hidden: true });
  const velden = { naam: naamV, hoeveelheid: hoeveelV, aanwijzing: aanwijsV, dagen: dagenV, start: startV, vanaf: vanafV, tot: totV, momenten: { fout: momentFout, el: ritmeHouder } };
  const tekenRitme = () => {
    const ritme = segment({
      keuzes: [
        { id: 'dagelijks', label: t('supplementkaart.ritmeDagelijks') },
        { id: 'interval', label: t('supplementkaart.ritmeInterval') },
        { id: 'maand', label: t('supplementkaart.ritmeMaand') },
      ],
      actief: f.soort,
      label: t('supplementkaart.ritme'),
      opKies: (kies) => {
        f.soort = kies;
        wisFouten();
        tekenRitme();
      },
    });
    const onderdelen = [h('div', { class: 'supplementkaart__veld supplementkaart__veld--breed', 'data-uitleg': 'kaart-ritme' }, h('p', { class: 'label' }, t('supplementkaart.ritme')), ritme)];
    if (f.soort === 'dagelijks') {
      const chips = h(
        'div',
        { class: 'chips', role: 'group', 'aria-label': t('supplementkaart.momenten') },
        ...MOMENTEN.map((m) =>
          h(
            'button',
            {
              type: 'button',
              class: ['chip', f.momenten.includes(m) && 'is-actief'],
              'aria-pressed': String(f.momenten.includes(m)),
              onclick: () => {
                f.momenten = f.momenten.includes(m) ? f.momenten.filter((x) => x !== m) : MOMENTEN.filter((x) => x === m || f.momenten.includes(x));
                wisFouten();
                tekenRitme();
              },
            },
            t('supplementkaart.moment.' + m),
          ),
        ),
      );
      onderdelen.push(h('div', { class: 'supplementkaart__veld supplementkaart__veld--breed', 'data-uitleg': 'kaart-momenten' }, h('p', { class: 'label' }, t('supplementkaart.momenten')), chips, momentFout));
    } else {
      if (f.soort === 'interval') onderdelen.push(dagenV.el);
      onderdelen.push(startV.el);
    }
    ritmeHouder.replaceChildren(...onderdelen);
  };
  tekenRitme();

  const periode = h(
    'div',
    { class: 'supplementkaart__periode', 'data-uitleg': 'kaart-periode' },
    h('p', { class: 'label supplementkaart__periodekop' }, t('supplementkaart.periode')),
    h('p', { class: 't-klein t-gedempt' }, t('supplementkaart.periodeHint')),
    h('div', { class: 'supplementkaart__velden' }, vanafV.el, totV.el),
  );

  const wisFouten = () => {
    for (const v of Object.values(velden)) {
      v.fout.hidden = true;
      v.fout.textContent = '';
    }
  };
  // Zolang er een fout staat, is Bewaren uitgeschakeld (eigenaar, 0.5.8): pas als zij de fout zelf oplost, kan ze bewaren. Annuleren en het
  // kruisje blijven werken. stil: de melding bijwerken terwijl ze typt, zonder de focus te verplaatsen.
  let foutActief = false;
  const toonFout = ({ code, veld: naam }, { stil = false } = {}) => {
    wisFouten();
    const v = velden[naam] ?? velden.naam;
    v.fout.textContent = t('supplementkaart.fout.' + code);
    v.fout.hidden = false;
    foutActief = true;
    bewaarKnop.disabled = true;
    if (stil) return;
    const invoer = { naam: naamInv, hoeveelheid: hoeveelInv, aanwijzing: aanwijsInv, dagen: dagenInv, start: startInv, vanaf: vanafInv, tot: totInv }[naam];
    if (invoer) invoer.focus();
    else (naam === 'momenten' ? ritmeHouder.querySelector('.chip') : null)?.focus();
    v.fout.scrollIntoView?.({ block: 'nearest' });
  };
  // Na elke wijziging in de kaart: is de fout opgelost, dan verdwijnt de melding en kan ze weer bewaren; staat er nog een fout, dan toont de
  // kaart die.
  const herbekijk = () => {
    if (!foutActief || bezig || gesloten) return;
    const fout = controleer(f);
    if (fout) return void toonFout(fout, { stil: true });
    wisFouten();
    foutActief = false;
    bewaarKnop.disabled = false;
  };

  // ---- opbouw van de kaart
  const titel = h('h2', { class: 't-h2 supplementkaart__titel', id: 'supplementkaart-titel' }, bestaand ? bestaand.naam || t('supplementkaart.aanpassen') : t('supplementkaart.nieuw'));
  const kruis = icoonknop(ICOON.weghalen.naam, { label: t('supplementkaart.sluiten'), klasse: 'supplementkaart__kruis', grootte: 20, opKlik: () => vraagSluiten() });
  kruis.setAttribute('data-uitleg', 'kaart-sluiten');
  const kop = h('header', { class: 'supplementkaart__kop' }, begripTegel('supplementen'), titel, kruis);
  const lijst = h('div', { class: 'supplementkaart__binnen' }, h('div', { class: 'supplementkaart__velden' }, naamV.el, hoeveelV.el, aanwijsV.el), ritmeHouder, periode);
  const onder = h('div', { class: 'supplementkaart__onder' });
  const dlg = h(
    'dialog',
    { class: 'dialoog supplementkaart', 'aria-labelledby': 'supplementkaart-titel' },
    kop,
    h('div', { class: 'supplementkaart__lijst' }, lijst),
    onder,
  );
  staat.dlg = dlg;

  // ---- onderaan: de knoppen, of een vraag in de kaart
  const bewaarKnop = knop(t('supplementkaart.bewaren'), { soort: 'primair', opKlik: () => bewaar() });
  bewaarKnop.setAttribute('data-uitleg', 'kaart-bewaren');
  const annuleerKnop = knop(t('supplementkaart.annuleren'), { soort: 'secundair', opKlik: () => vraagSluiten() });
  annuleerKnop.setAttribute('data-uitleg', 'kaart-annuleren');
  const wegKnop = bestaand ? knop(t('supplementkaart.weghalen'), { soort: 'tekst', opKlik: () => vraagWeg() }) : null;
  wegKnop?.setAttribute('data-uitleg', 'kaart-weghalen');
  const toonKnoppen = () => {
    onder.replaceChildren(h('div', { class: 'supplementkaart__knoppen' }, bewaarKnop, annuleerKnop, wegKnop));
  };
  toonKnoppen();

  const toonVraag = (tekst, knoppen) => {
    onder.replaceChildren(h('div', { class: 'supplementkaart__vraag', role: 'group', 'aria-label': tekst }, h('p', { class: 'supplementkaart__vraagtekst' }, tekst), h('div', { class: 'supplementkaart__knoppen' }, ...knoppen)));
    onder.querySelector('button')?.focus();
  };
  function vraagWeg() {
    toonVraag(t('supplementkaart.wegVraag'), [
      knop(t('supplementkaart.wegJa'), { soort: 'primair', opKlik: () => weghalen() }),
      knop(t('supplementkaart.wegNee'), { soort: 'secundair', opKlik: () => { toonKnoppen(); wegKnop?.focus(); } }),
    ]);
  }
  function vraagSluiten() {
    if (bezig) return;
    if (!isGewijzigd(begin, f)) {
      sluit('geannuleerd');
      return;
    }
    toonVraag(t('supplementkaart.wijzigingenVraag'), [
      knop(t('supplementkaart.bewaren'), { soort: 'primair', opKlik: () => bewaar() }),
      knop(t('supplementkaart.nietBewaren'), { soort: 'secundair', opKlik: () => sluit('geannuleerd') }),
      knop(t('supplementkaart.verderAanpassen'), { soort: 'tekst', opKlik: () => { toonKnoppen(); naamInv.focus(); } }),
    ]);
  }

  // ---- bewaren, weghalen, sluiten
  async function bewaar() {
    if (bezig) return;
    const fout = controleer(f);
    if (fout) {
      toonKnoppen();
      toonFout(fout);
      return;
    }
    bezig = true;
    bewaarKnop.disabled = true;
    try {
      const opties = naarAanroep(f, { oud });
      const uit = bestaand ? await wijzigSupplement(bestaand.id, opties) : await voegSupplementToe(opties);
      bezig = false;
      sluit('bewaard', uit.id);
    } catch (e) {
      bezig = false;
      bewaarKnop.disabled = false;
      toonKnoppen();
      const bekend = foutVan(e);
      if (bekend) toonFout(bekend);
      else {
        console.error(e);
        toonFout({ code: 'leeg', veld: 'naam' });
        velden.naam.fout.textContent = t('supplementkaart.fout.onbekend');
        // Een fout die niet aan een veld ligt, kan ze niet zelf oplossen: opnieuw proberen blijft mogelijk.
        foutActief = false;
        bewaarKnop.disabled = false;
      }
    }
  }
  async function weghalen() {
    bezig = true;
    try {
      // Een weggehaald supplement telt vandaag niet meer mee; vroegere dagen blijven staan zoals ze waren.
      for (const m of [...MOMENTEN, 'dag']) await zetInname(vandaag(), bestaand.id, m, false);
      await verwijderSupplement(bestaand.id);
      bezig = false;
      sluit('weggehaald', bestaand.id);
    } catch (e) {
      console.error(e);
      bezig = false;
      toonKnoppen();
    }
  }
  function sluit(actie, uitId = id) {
    if (gesloten) return;
    gesloten = true;
    terugWacht?.los();
    document.documentElement.classList.remove('heeft-supplementkaart');
    if (dlg.open) dlg.close();
    dlg.remove();
    if (open === staat) open = null;
    // De focus keert terug naar wat de kaart opende.
    if (opener?.isConnected) opener.focus?.();
    klaar({ actie, id: uitId ?? null });
  }
  staat.sluit = sluit;

  // Escape en een tik naast de kaart doen hetzelfde als het kruisje.
  // AN-08: een tweede terugveeg op Android zonder tik ertussen is een cancel die niet te annuleren is: de browser sluit de kaart dan
  // zelf. Er mag niets stil verloren gaan: de kaart komt meteen terug, met de vraag of de wijzigingen bewaard moeten worden.
  // Elke invoer, keuze of tik in de kaart kan de fout oplossen: daarna opnieuw bekijken (na de eigen afhandeling van het veld).
  for (const soort of ['input', 'change', 'click']) dlg.addEventListener(soort, () => foutActief && setTimeout(herbekijk, 0));
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!e.cancelable) gedwongen = true;
    vraagSluiten();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) vraagSluiten();
  });
  // Tab en Shift+Tab gaan rond binnen de kaart: na de laatste knop weer naar het eerste veld, en andersom.
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const kan = [...dlg.querySelectorAll('input, button, [tabindex]')].filter((x) => !x.disabled && x.tabIndex >= 0 && x.getClientRects().length > 0);
    if (!kan.length) return;
    const eerste = kan[0];
    const laatste = kan[kan.length - 1];
    if (e.shiftKey && (document.activeElement === eerste || document.activeElement === dlg)) {
      e.preventDefault();
      laatste.focus();
    } else if (!e.shiftKey && document.activeElement === laatste) {
      e.preventDefault();
      eerste.focus();
    }
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'date') {
      e.preventDefault();
      bewaar();
    }
  });

  dlg.addEventListener('close', () => {
    // Alleen na een gedwongen sluiting (hierboven). Het slot sluit de kaart ook stil en zet ze zelf terug: dat blijft zo.
    if (!gedwongen || gesloten) return;
    gedwongen = false;
    if (!dlg.isConnected || dlg.open) return;
    try {
      dlg.showModal();
    } catch {
      /* kan de kaart niet terug, dan blijft ze in de pagina staan met haar invoer */
    }
  });

  document.body.append(dlg);
  document.documentElement.classList.add('heeft-supplementkaart');
  dlg.showModal();
  // AN-06/07: "terug" (Android, Safari, browserknop) doet wat het kruisje doet: zonder wijzigingen dicht, met wijzigingen eerst de vraag
  // (de kaart blijft dan staan en "terug" gooit nooit iets stil weg). src/pwa/terug.js
  terugWacht = bewaakTerug({
    opTerug: () => {
      vraagSluiten();
      return gesloten;
    },
  });
  naamInv.focus();
}
