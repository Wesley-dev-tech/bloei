// Foto's: verkleinen bij het toevoegen, een miniatuur maken, bewaren en opvragen.
// Het origineel blijft in de fotorol; in de app zit alleen de verkleinde versie (hoogstens 1600 px breed).
import { db } from './db.js';

const MAX_GROOT = 1600; // breedte (HUISSTIJL §6)
const KWALITEIT_GROOT = 0.8;
const MAX_KLEIN = 320;
const KWALITEIT_KLEIN = 0.7;

// maat 'breedte': de foto wordt hoogstens zo breed; 'langste': de langste zijde (miniatuur).
async function naarJpeg(bitmap, maxMaat, kwaliteit, maat = 'langste') {
  const schaal = Math.min(1, maxMaat / (maat === 'breedte' ? bitmap.width : Math.max(bitmap.width, bitmap.height)));
  const breedte = Math.max(1, Math.round(bitmap.width * schaal));
  const hoogte = Math.max(1, Math.round(bitmap.height * schaal));

  const canvas = document.createElement('canvas');
  canvas.width = breedte;
  canvas.height = hoogte;
  const ctx = canvas.getContext('2d');
  // Wit eronder: een doorschijnende PNG wordt anders zwart in JPEG.
  // Hex-code bewust: canvas-tekenwerk kan geen CSS-tokens gebruiken.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, breedte, hoogte);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, breedte, hoogte);

  const blob = await new Promise((klaar) => canvas.toBlob(klaar, 'image/jpeg', kwaliteit));
  if (!blob) throw new Error('foto');
  return { blob, breedte, hoogte };
}

// Geeft het id van de bewaarde foto terug (de profielfoto). Gooit Error('foto') als het bestand geen
// leesbaar beeld is.
export async function bewaarFoto(bestand) {
  let bitmap;
  try {
    // from-image: de foto staat recht, ook als de iPhone ze gedraaid opsloeg.
    bitmap = await createImageBitmap(bestand, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('foto');
  }
  try {
    const groot = await naarJpeg(bitmap, MAX_GROOT, KWALITEIT_GROOT, 'breedte');
    const klein = await naarJpeg(bitmap, MAX_KLEIN, KWALITEIT_KLEIN);
    return await db.fotos.add({
      blob: groot.blob,
      miniatuur: klein.blob,
      breedte: groot.breedte,
      hoogte: groot.hoogte,
      voorbeeld: false,
      aangemaaktOp: Date.now(),
    });
  } finally {
    bitmap.close?.();
  }
}

// Geeft een object-URL. De aanroeper doet URL.revokeObjectURL bij het opruimen.
export async function fotoUrl(id, formaat = 'klein') {
  if (id == null) return null;
  const foto = await db.fotos.get(id);
  if (!foto) return null;
  return URL.createObjectURL(formaat === 'vol' ? foto.blob : foto.miniatuur);
}

export async function wisFoto(id) {
  if (id == null) return;
  await db.fotos.delete(id);
}
