// Review R2, herstel in app.js, ui/, vandaag.js en hulp.js. Het gedrag zelf staat in tests/e2e/x-bugs-schermen-b.spec.js; hier alleen
// de teksten die R2-14 nodig heeft (een scherm dat niet laadt: een rustige melding met "Opnieuw proberen").
import { describe, expect, test } from 'vitest';
import { t } from '../../src/teksten.js';

describe('R2-14 teksten voor een scherm dat niet laadt', () => {
  test('de melding en de knop bestaan en verschillen van de melding bij een mislukte opslag', () => {
    expect(t('algemeen.foutLaden')).toBe('Dit scherm kon niet laden. Probeer het nog eens.');
    expect(t('algemeen.opnieuwProberen')).toBe('Opnieuw proberen');
    expect(t('algemeen.foutLaden')).not.toBe(t('algemeen.foutOpslag'));
  });
});
