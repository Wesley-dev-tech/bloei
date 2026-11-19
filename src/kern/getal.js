// Opmaak en inlezen van ml, liter en kg. Decimaalteken is de komma; tussen getal en eenheid
// staat een vaste spatie.

const SPATIE = ' ';
const MIN = '-';

const komma = (tekst) => tekst.replace('.', ',');

// Afronden op één decimaal (kg). De enige plek voor die afronding: wegingen, gewichtcijfers en de opmaak hieronder.
export const opEenDecimaal = (x) => Math.round(x * 10) / 10;

export function opmaakMl(ml) {
  return `${Math.round(ml)}${SPATIE}ml`;
}

// Hoogstens twee decimalen, zonder nullen achteraan: 0,75 l · 1,5 l · 2 l
export function opmaakLiter(ml) {
  const liter = Math.round(ml / 10) / 100;
  return `${komma(String(liter))}${SPATIE}l`;
}

// Altijd één decimaal: 68,4 kg
export function opmaakKg(kg) {
  return `${komma(kg.toFixed(1))}${SPATIE}kg`;
}

// +0,4 kg · -0,3 kg (gewoon streepje) · 0,0 kg
export function opmaakVerschil(kg) {
  const afgerond = opEenDecimaal(kg);
  const teken = afgerond > 0 ? '+' : afgerond < 0 ? MIN : '';
  return `${teken}${komma(Math.abs(afgerond).toFixed(1))}${SPATIE}kg`;
}

// Aanvaardt komma en punt. Geeft null bij onzin of buiten 20 - 300 kg.
export function leesKg(invoer) {
  const tekst = String(invoer ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d+)?$/.test(tekst)) return null;
  const kg = opEenDecimaal(Number(tekst));
  if (kg < 20 || kg > 300) return null;
  return kg;
}
