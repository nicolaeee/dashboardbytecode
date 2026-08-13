import { describe, expect, it } from 'vitest';
import { computeMakeupPatch } from './attendanceTransition';

const TODAY = '2026-08-13';

describe('computeMakeupPatch (alerta "Recuperare necesara")', () => {
  it('REGRESIE: Gol -> Absent declanseaza patch-ul EXACT ca Prezent -> Absent (nu se pierde la prima marcare)', () => {
    const fromEmpty = computeMakeupPatch(undefined, 'absent', 0, TODAY);
    const fromPresent = computeMakeupPatch('present', 'absent', 0, TODAY);

    expect(fromEmpty).toEqual({ pending_makeups: 1, absence_date: TODAY });
    expect(fromPresent).toEqual({ pending_makeups: 1, absence_date: TODAY });
  });

  it('a doua absenta consecutiva (deja 1 in asteptare) incrementeaza pending_makeups fara sa resetezeze absence_date', () => {
    const patch = computeMakeupPatch('present', 'absent', 1, TODAY);
    expect(patch).toEqual({ pending_makeups: 2 });
  });

  it('Absent -> Prezent scade restanta si, la 0, inchide complet alerta', () => {
    const patch = computeMakeupPatch('absent', 'present', 1, TODAY);
    expect(patch).toEqual({
      pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null,
    });
  });

  it('Absent -> Recuperat scade restanta fara sa inchida alerta daca mai raman altele in asteptare', () => {
    const patch = computeMakeupPatch('absent', 'made_up', 2, TODAY);
    expect(patch).toEqual({ pending_makeups: 1 });
  });

  it('pending_makeups nu scade sub 0 chiar daca starea locala era deja inconsistenta', () => {
    const patch = computeMakeupPatch('absent', 'present', 0, TODAY);
    expect(patch).toEqual({
      pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null,
    });
  });

  it('nicio tranzitie reala (Gol -> Prezent, sau Absent -> Absent) nu produce niciun patch', () => {
    expect(computeMakeupPatch(undefined, 'present', 0, TODAY)).toBeNull();
    expect(computeMakeupPatch('absent', 'absent', 1, TODAY)).toBeNull();
  });
});
