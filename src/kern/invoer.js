// Is er invoer bezig? (R2-01, BESLISSING 411) Eén gedeelde voorwaarde voor de dagwachter (app.js) en voor Vandaag (de begroeting):
// een open venster (een <dialog>, de uitleg) of de focus in een tekstveld binnen het scherm. Dan blijft het dagdeel van de vorige tekening staan.
export const TEKSTVELD = 'textarea, input:not([type="file"]):not([type="checkbox"]):not([type="radio"])';

export function tekstveldActief(schermhouder) {
  return Boolean(schermhouder) && schermhouder.contains(document.activeElement) && Boolean(document.activeElement.matches?.(TEKSTVELD));
}

export function venster() {
  return Boolean(document.querySelector('dialog[open], .uitleg__kaart[role="dialog"]'));
}

export function invoerBezig(schermhouder) {
  return tekstveldActief(schermhouder) || venster();
}
