// Het ene ingangspunt van de demo: main.js laadt dit bestand alleen als DEMO waar is (dynamische import).
import { TEKSTEN } from '../teksten.js';
import { dt } from './teksten.js';

// De regel over Profiel verwijderen is in de demo onwaar (de knop wist er niets): alleen hier, in de demobundel, krijgt hij de demotekst.
TEKSTEN.privacy.regel6 = dt('privacyRegel6');

export { startBezoek } from './bezoek.js';
export { toonBalk } from './balk.js';
