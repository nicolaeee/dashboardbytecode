import { describe, expect, it } from 'vitest';
import { MAX_CONTACTS, asContactList, cleanContactList, formatPhonesForWebhook, toEditableList } from './contactList';

describe('asContactList', () => {
  it('pastreaza un array de string-uri neschimbat', () => {
    expect(asContactList(['0712345678', '0798765432'])).toEqual(['0712345678', '0798765432']);
  });

  it('filtreaza elementele non-string dintr-un array (date corupte in DB)', () => {
    expect(asContactList(['0712345678', 42, null, {}])).toEqual(['0712345678']);
  });

  it('transforma un string simplu intr-o lista de un element (elevi vechi, dinainte de migratie)', () => {
    expect(asContactList('0712345678')).toEqual(['0712345678']);
  });

  it('un string gol devine o lista goala, nu [""]', () => {
    expect(asContactList('')).toEqual([]);
  });

  it('null/undefined/alte tipuri devin lista goala, fara sa arunce eroare', () => {
    expect(asContactList(null)).toEqual([]);
    expect(asContactList(undefined)).toEqual([]);
    expect(asContactList(42)).toEqual([]);
    expect(asContactList({})).toEqual([]);
  });
});

describe('cleanContactList', () => {
  it('elimina spatiile de la capete', () => {
    expect(cleanContactList(['  0712345678  '])).toEqual(['0712345678']);
  });

  it('elimina intrarile goale dupa trim', () => {
    expect(cleanContactList(['0712345678', '   ', ''])).toEqual(['0712345678']);
  });

  it(`plafoneaza la maxim ${MAX_CONTACTS} contacte`, () => {
    const many = Array.from({ length: 8 }, (_, i) => `07${i}`);
    const result = cleanContactList(many);
    expect(result).toHaveLength(MAX_CONTACTS);
    expect(result).toEqual(many.slice(0, MAX_CONTACTS));
  });
});

describe('formatPhonesForWebhook', () => {
  it('afiseaza "Lipsă număr" cand nu exista niciun telefon', () => {
    expect(formatPhonesForWebhook(null)).toBe('Lipsă număr');
    expect(formatPhonesForWebhook([])).toBe('Lipsă număr');
  });

  it('adauga "+" in fata numerelor care nu il au deja', () => {
    expect(formatPhonesForWebhook(['0712345678'])).toBe('+0712345678');
  });

  it('nu dubleaza "+" daca e deja prezent', () => {
    expect(formatPhonesForWebhook(['+40712345678'])).toBe('+40712345678');
  });

  it('uneste mai multe numere prin linie noua', () => {
    expect(formatPhonesForWebhook(['0712345678', '+40798765432'])).toBe('+0712345678\n+40798765432');
  });
});

describe('toEditableList', () => {
  it('intoarce [""] pentru un elev fara niciun contact, nu o lista goala', () => {
    expect(toEditableList(null)).toEqual(['']);
    expect(toEditableList([])).toEqual(['']);
  });

  it('pastreaza contactele existente neschimbate', () => {
    expect(toEditableList(['0712345678'])).toEqual(['0712345678']);
  });
});
