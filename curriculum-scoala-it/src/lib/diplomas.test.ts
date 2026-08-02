import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COURSES, diplomaTemplateUrl, getCourse, starsForModule, todayFormatted } from './diplomas';

describe('getCourse', () => {
  it('gaseste un curs cunoscut dupa id', () => {
    expect(getCourse('python')?.label).toBe('Python');
  });

  it('intoarce null pentru un curs custom/necunoscut', () => {
    expect(getCourse('scratch-curs-nou')).toBeNull();
  });

  it('intoarce null pentru null/undefined (clasa fara curs setat)', () => {
    expect(getCourse(null)).toBeNull();
    expect(getCourse(undefined)).toBeNull();
  });
});

describe('diplomaTemplateUrl', () => {
  it('construieste URL-ul sablonului pentru un curs cunoscut', () => {
    expect(diplomaTemplateUrl('python', 2)).toBe('/diplome/Python/Diploma_modulul2_Python.html');
  });

  it('intoarce null pentru un curs custom, fara sablon de diploma', () => {
    // 'scratch-curs-nou' e un id in afara listei COURSES (curs custom, text liber) - CourseId
    // il accepta la nivel de tip, dar getCourse/diplomaTemplateUrl trebuie sa-l trateze grafios.
    expect(diplomaTemplateUrl('scratch-curs-nou', 1)).toBeNull();
  });

  it('fiecare curs cunoscut produce un URL valid pentru toate cele 4 module', () => {
    for (const course of COURSES) {
      for (const moduleNumber of [1, 2, 3, 4]) {
        expect(diplomaTemplateUrl(course.id, moduleNumber)).toBe(
          `/diplome/${course.folder}/Diploma_modulul${moduleNumber}_${course.fileSuffix}.html`
        );
      }
    }
  });
});

describe('starsForModule', () => {
  it('0 progres = 0 steluțe', () => {
    expect(starsForModule(0)).toBe(0);
  });

  it('progres normal, in interiorul modulului', () => {
    expect(starsForModule(5)).toBe(5);
    expect(starsForModule(17)).toBe(1);
  });

  it('exact 16 (un modul complet) ramane 16, nu 0 (cazul special de rest 0)', () => {
    expect(starsForModule(16)).toBe(16);
    expect(starsForModule(32)).toBe(16);
  });

  it('progres chiar sub un prag de 16', () => {
    expect(starsForModule(31)).toBe(15);
  });
});

describe('todayFormatted', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formateaza data curenta ca DD.MM.YYYY', () => {
    vi.setSystemTime(new Date(2026, 2, 5)); // 5 martie 2026 (luna 0-indexata)
    expect(todayFormatted()).toBe('05.03.2026');
  });

  it('adauga zero in fata pentru zi/luna cu o singura cifra', () => {
    vi.setSystemTime(new Date(2026, 0, 1)); // 1 ianuarie 2026
    expect(todayFormatted()).toBe('01.01.2026');
  });
});
