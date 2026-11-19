// Waar de globale opstart de browserstand "start is voorbij" bewaart: per ronde en per poort, zodat meerdere runs elkaar niet
// storen. playwright.config.js zet PW_RONDE en PW_POORT vóór dit bestand geladen wordt.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const STAND_BESTAND = join(tmpdir(), `bloei-pw-stand-${process.env.PW_RONDE || 'gewoon'}-${process.env.PW_POORT || '4173'}.json`);
