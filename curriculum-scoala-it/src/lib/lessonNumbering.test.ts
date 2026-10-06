import { describe, expect, it } from 'vitest';
import { computeModuleLesson, formatModuleLesson, totalLessonsFor, currentModuleOf, legacyStarsInModule, moduleStarsByStudent, moduleStarsFor } from './lessonNumbering';

describe('computeModuleLesson', () => {
  it('prima lectie a primului modul', () => {
    expect(computeModuleLesson(1)).toEqual({ module: 1, lesson: 1 });
  });

  it('ultima lectie a primului modul (granita 16/17)', () => {
    expect(computeModuleLesson(16)).toEqual({ module: 1, lesson: 16 });
    expect(computeModuleLesson(17)).toEqual({ module: 2, lesson: 1 });
  });

  it('a doua granita de modul (32/33)', () => {
    expect(computeModuleLesson(32)).toEqual({ module: 2, lesson: 16 });
    expect(computeModuleLesson(33)).toEqual({ module: 3, lesson: 1 });
  });

  it('valori <= 0 sunt clampate la minim 1 lectie', () => {
    expect(computeModuleLesson(0)).toEqual({ module: 1, lesson: 1 });
    expect(computeModuleLesson(-5)).toEqual({ module: 1, lesson: 1 });
  });

  it('rotunjeste valorile fractionare', () => {
    expect(computeModuleLesson(16.4)).toEqual({ module: 1, lesson: 16 });
    expect(computeModuleLesson(16.6)).toEqual({ module: 2, lesson: 1 });
  });
});

describe('formatModuleLesson', () => {
  it('afiseaza "M1 / L0" pentru un elev fara nicio lectie', () => {
    expect(formatModuleLesson(0)).toBe('M1 / L0');
    expect(formatModuleLesson(-3)).toBe('M1 / L0');
  });

  it('formateaza corect in interiorul unui modul', () => {
    expect(formatModuleLesson(1)).toBe('M1 / L1');
    expect(formatModuleLesson(16)).toBe('M1 / L16');
  });

  it('trece corect la modulul urmator', () => {
    expect(formatModuleLesson(17)).toBe('M2 / L1');
  });
});

describe('totalLessonsFor', () => {
  it('inversul lui computeModuleLesson pentru valori valide (round-trip)', () => {
    for (let total = 1; total <= 48; total++) {
      const { module, lesson } = computeModuleLesson(total);
      expect(totalLessonsFor(module, lesson)).toBe(total);
    }
  });

  it('clampeaza modulul la minim 1', () => {
    expect(totalLessonsFor(0, 5)).toBe(5);
    expect(totalLessonsFor(-2, 5)).toBe(5);
  });

  it('clampeaza lectia la minim 0 (nu poate scadea sub 0)', () => {
    expect(totalLessonsFor(2, -5)).toBe(16);
  });

  it('modulul 1, lectia 0 inseamna 0 lectii efectuate', () => {
    expect(totalLessonsFor(1, 0)).toBe(0);
  });
});

describe('moduleStarsFor / currentModuleOf', () => {
  // 16 lectii in M1 (L1..L16) + 1 lectie in M2 (L17).
  const lessons = Array.from({ length: 17 }, (_, i) => ({ id: `l${i + 1}`, curriculum_index: i + 1 }));

  it('numara doar temele din lectiile modulului cerut - M2 porneste de la 0', () => {
    const attendance = Array.from({ length: 8 }, (_, i) => ({ lesson_id: `l${i + 1}`, student_id: 's1', star_count: 1 }));
    expect(moduleStarsFor('s1', 1, lessons, attendance)).toBe(8);
    expect(moduleStarsFor('s1', 2, lessons, attendance)).toBe(0);
  });

  it('ignora alti elevi si aduna multiplicatorul 0-3', () => {
    const attendance = [
      { lesson_id: 'l17', student_id: 's1', star_count: 3 },
      { lesson_id: 'l17', student_id: 's2', star_count: 2 },
    ];
    expect(moduleStarsFor('s1', 2, lessons, attendance)).toBe(3);
  });

  it('modulul curent urmeaza cea mai avansata lectie creata', () => {
    expect(currentModuleOf([])).toBe(1);
    expect(currentModuleOf(lessons.slice(0, 16))).toBe(1);
    expect(currentModuleOf(lessons)).toBe(2);
  });

  it('fara lectii, modulul curent cade pe pozitia manuala a elevilor', () => {
    expect(currentModuleOf([], [{ lesson_offset: 0 }, { lesson_offset: 21 }])).toBe(2);
    expect(currentModuleOf(lessons.slice(0, 3), [{ lesson_offset: 40 }])).toBe(1);
  });
});

describe('legacyStarsInModule / moduleStarsByStudent', () => {
  it('steluțele istorice se numara doar in modulul pozitiei manuale', () => {
    const student = { lesson_offset: 10, legacy_module_stars: 7 };
    expect(legacyStarsInModule(student, 1)).toBe(7);
    expect(legacyStarsInModule(student, 2)).toBe(0);
    // M1/L16 -> tot M1; M2 porneste de la 0.
    expect(legacyStarsInModule({ lesson_offset: 16, legacy_module_stars: 5 }, 1)).toBe(5);
    expect(legacyStarsInModule({ lesson_offset: 0, legacy_module_stars: 3 }, 1)).toBe(3);
  });

  it('elev nou cu steluțe istorice si fara lectii apare cu ele pe contor', () => {
    const students = [{ id: 's1', group_id: 'g1', lesson_offset: 21, legacy_module_stars: 6 }];
    expect(moduleStarsByStudent(students, [], []).get('s1')).toBe(6);
  });

  it('aduna steluțele istorice cu temele bifate in acelasi modul', () => {
    const students = [{ id: 's1', group_id: 'g1', lesson_offset: 5, legacy_module_stars: 4 }];
    const groupLessons = [{ id: 'l6', group_id: 'g1', curriculum_index: 6 }];
    const attendance = [{ lesson_id: 'l6', student_id: 's1', star_count: 2 }];
    expect(moduleStarsByStudent(students, groupLessons, attendance).get('s1')).toBe(6);
  });
});
