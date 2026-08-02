import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, isSafeOptionalString, isSafeString, readJsonBody } from './apiSecurity';

describe('isSafeString', () => {
  it('accepta un string normal, nevid', () => {
    expect(isSafeString('Ioana Popescu')).toBe(true);
  });

  it('respinge un string gol sau doar spatii', () => {
    expect(isSafeString('')).toBe(false);
    expect(isSafeString('   ')).toBe(false);
  });

  it('respinge orice tip non-string (posibil manipulat din request)', () => {
    expect(isSafeString(42)).toBe(false);
    expect(isSafeString(null)).toBe(false);
    expect(isSafeString(undefined)).toBe(false);
    expect(isSafeString(['x'])).toBe(false);
    expect(isSafeString({ toString: () => 'x' })).toBe(false);
  });

  it('respinge un string mai lung decat maxLength', () => {
    expect(isSafeString('a'.repeat(301))).toBe(false);
    expect(isSafeString('a'.repeat(300))).toBe(true);
    expect(isSafeString('a'.repeat(11), 10)).toBe(false);
  });

  it('respinge caractere de control (posibil payload malformat/injectie)', () => {
    expect(isSafeString('nume\x00cu-null-byte')).toBe(false);
    expect(isSafeString('nume\x1bcu-escape')).toBe(false);
  });

  it('accepta diacritice romanesti normale', () => {
    expect(isSafeString('Măriuța Ștefănescu')).toBe(true);
  });
});

describe('isSafeOptionalString', () => {
  it('accepta string gol (spre deosebire de isSafeString)', () => {
    expect(isSafeOptionalString('')).toBe(true);
  });

  it('accepta un string valid nevid', () => {
    expect(isSafeOptionalString('ceva')).toBe(true);
  });

  it('respinge in continuare un string prea lung sau cu caractere de control', () => {
    expect(isSafeOptionalString('a'.repeat(11), 10)).toBe(false);
    expect(isSafeOptionalString('a\x00b')).toBe(false);
  });
});

describe('checkRateLimit', () => {
  // Fiecare test foloseste o cheie unica (nu se reseteaza Map-ul intern intre teste).

  it('permite cererile pana la limita, apoi le respinge', () => {
    const key = 'test-basic-limit';
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(false); // a 4-a cerere, limita e 3
  });

  it('chei diferite au contoare complet independente', () => {
    expect(checkRateLimit('test-key-a', 1, 60_000)).toBe(true);
    expect(checkRateLimit('test-key-a', 1, 60_000)).toBe(false);
    // 'test-key-b' nu e afectata de epuizarea lui 'test-key-a'
    expect(checkRateLimit('test-key-b', 1, 60_000)).toBe(true);
  });

  it('reseteaza limita dupa expirarea ferestrei de timp', () => {
    vi.useFakeTimers();
    try {
      const key = 'test-window-reset';
      vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
      expect(checkRateLimit(key, 1, 1000)).toBe(true);
      expect(checkRateLimit(key, 1, 1000)).toBe(false);

      // Inainte de expirare, ramane blocat.
      vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0, 500));
      expect(checkRateLimit(key, 1, 1000)).toBe(false);

      // Dupa expirarea ferestrei (peste 1000ms de la prima cerere), fereastra se reseteaza.
      vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 1, 100));
      expect(checkRateLimit(key, 1, 1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('SECURITATE (audit R-3): o cheie care include IP-ul izoleaza atacatorul de victima', () => {
    // Simuleaza exact scenariul din auth-actions.ts: cheia e pe (ip, email), nu doar pe email -
    // un atacator care epuizeaza limita pentru propriul IP nu blocheaza IP-ul victimei.
    const email = 'admin@scoala.ro';
    const attackerKey = `signin:1.2.3.4:${email}`;
    const victimKey = `signin:9.9.9.9:${email}`;

    for (let i = 0; i < 8; i++) checkRateLimit(attackerKey, 8, 5 * 60_000);
    expect(checkRateLimit(attackerKey, 8, 5 * 60_000)).toBe(false);
    // Victima, de pe alt IP, cu acelasi email, nu e deloc afectata.
    expect(checkRateLimit(victimKey, 8, 5 * 60_000)).toBe(true);
  });
});

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/test', { method: 'POST', body, headers });
}

describe('readJsonBody', () => {
  it('parseaza un body JSON valid', async () => {
    const result = await readJsonBody(makeRequest(JSON.stringify({ studentId: 'abc' })));
    expect(result).toEqual({ studentId: 'abc' });
  });

  it('intoarce null pentru JSON invalid', async () => {
    const result = await readJsonBody(makeRequest('{ nu e json valid'));
    expect(result).toBeNull();
  });

  it('intoarce null pentru body complet gol', async () => {
    const result = await readJsonBody(makeRequest(''));
    expect(result).toBeNull();
  });

  it('respinge un body prea mare conform header-ului Content-Length, fara sa-l mai citeasca', async () => {
    const body = JSON.stringify({ ok: true });
    const req = makeRequest(body, { 'content-length': '999999' });
    const result = await readJsonBody(req, 10); // maxBytes mic, intentionat
    expect(result).toBeNull();
  });

  it('respinge un body prea mare si cand Content-Length lipseste/e incorect (verificare pe continutul real)', async () => {
    const body = JSON.stringify({ studentId: 'un-id-destul-de-lung-ca-sa-depaseasca-limita' });
    const req = makeRequest(body); // fara header Content-Length
    const result = await readJsonBody(req, 10); // maxBytes mic, intentionat
    expect(result).toBeNull();
  });

  it('accepta un body normal, sub limita implicita', async () => {
    const result = await readJsonBody(makeRequest(JSON.stringify({ a: 1, b: 'text' })));
    expect(result).toEqual({ a: 1, b: 'text' });
  });
});
