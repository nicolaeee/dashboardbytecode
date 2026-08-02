import { describe, expect, it } from 'vitest';
import { computeModuleLesson, formatModuleLesson, totalLessonsFor } from './lessonNumbering';

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
