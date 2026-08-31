import { describe, expect, it } from 'vitest';
import { computeLessonBalanceDelta, computeMakeupPatch } from './attendanceTransition';

const TODAY = '2026-08-13';

describe('computeMakeupPatch (alerta "Recuperare necesara")', () => {
  it('REGRESIE: Gol -> Absent declanseaza patch-ul EXACT ca Prezent -> Absent (nu se pierde la prima marcare)', () => {
    const fromEmpty = computeMakeupPatch(undefined, 'absent', 0, TODAY);
    const fromPresent = computeMakeupPatch('present', 'absent', 0, TODAY);

    expect(fromEmpty).toEqual({ pending_makeups: 1, absence_date: TODAY, is_scheduled: false });
    expect(fromPresent).toEqual({ pending_makeups: 1, absence_date: TODAY, is_scheduled: false });
  });

  it('a doua absenta consecutiva (deja 1 in asteptare) incrementeaza pending_makeups fara sa resetezeze absence_date', () => {
    const patch = computeMakeupPatch('present', 'absent', 1, TODAY);
    expect(patch).toEqual({ pending_makeups: 2 });
  });

  it('Absent -> Prezent scade restanta si, la 0, inchide complet alerta', () => {
    const patch = computeMakeupPatch('absent', 'present', 1, TODAY);
    expect(patch).toEqual({
      pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null, is_scheduled: false,
    });
  });

  it('Absent -> Recuperat scade restanta fara sa inchida alerta daca mai raman altele in asteptare', () => {
    const patch = computeMakeupPatch('absent', 'made_up', 2, TODAY);
    expect(patch).toEqual({ pending_makeups: 1 });
  });

  it('pending_makeups nu scade sub 0 chiar daca starea locala era deja inconsistenta', () => {
    const patch = computeMakeupPatch('absent', 'present', 0, TODAY);
    expect(patch).toEqual({
      pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null, is_scheduled: false,
    });
  });

  it('nicio tranzitie reala (Gol -> Prezent, sau Absent -> Absent) nu produce niciun patch', () => {
    expect(computeMakeupPatch(undefined, 'present', 0, TODAY)).toBeNull();
    expect(computeMakeupPatch('absent', 'absent', 1, TODAY)).toBeNull();
  });

  it('BUG REPARAT: o absenta NOUA, intr-o saptamana ulterioara, nu mosteneste "is_scheduled" ramas de la un ciclu anterior deja inchis prin schimbarea directa a statusului (nu prin butoanele din Task-uri Urgente) - trebuie tratata ca pagina goala si sa ceara din nou notificarea', () => {
    // Saptamana 1: absenta -> programata (is_scheduled=true, gestionat separat de handleMarkMakeupScheduled,
    // in afara acestei functii) -> recuperata DIRECT (schimbare status 'absent' -> 'made_up' pe randul
    // din lectie, nu prin "✅ Recuperat" din Task-uri Urgente).
    const week1Resolved = computeMakeupPatch('absent', 'made_up', 1, TODAY);
    expect(week1Resolved).toEqual({ pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null, is_scheduled: false });

    // Saptamana 2: o absenta noua, la o data noua - trebuie sa forteze is_scheduled=false
    // explicit (pagina goala), nu doar sa lase campul neatins.
    const week2New = computeMakeupPatch('present', 'absent', 0, '2026-08-20');
    expect(week2New).toEqual({ pending_makeups: 1, absence_date: '2026-08-20', is_scheduled: false });
  });
});

describe('computeLessonBalanceDelta (sold de lectii, total_lessons_remaining)', () => {
  it('prima marcare (Gol -> *) scade soldul cu 1, indiferent de status', () => {
    expect(computeLessonBalanceDelta(undefined, 'present')).toBe(-1);
    expect(computeLessonBalanceDelta(undefined, 'absent')).toBe(-1);
    expect(computeLessonBalanceDelta(undefined, 'made_up')).toBe(-1);
  });

  it('REGULA CERUTA: o recuperare (Absent -> Recuperat) NU scade soldul a doua oara', () => {
    expect(computeLessonBalanceDelta('absent', 'made_up')).toBe(0);
  });

  it('validare completa: 3 absente consecutive scad soldul cu 3, iar cele 3 recuperari ulterioare nu mai schimba nimic', () => {
    let balance = 10;
    for (let i = 0; i < 3; i++) balance += computeLessonBalanceDelta(undefined, 'absent');
    expect(balance).toBe(7);
    for (let i = 0; i < 3; i++) balance += computeLessonBalanceDelta('absent', 'made_up');
    expect(balance).toBe(7);
  });

  it('comutarea intre Prezent/Absent/Recuperat (fara sa treaca prin Gol) nu produce niciodata dubla taxare', () => {
    expect(computeLessonBalanceDelta('present', 'absent')).toBe(0);
    expect(computeLessonBalanceDelta('present', 'made_up')).toBe(0);
    expect(computeLessonBalanceDelta('made_up', 'present')).toBe(0);
  });
});
