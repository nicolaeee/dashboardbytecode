import { vi } from 'vitest';
import type { Profile } from '@/lib/types';

// Helper PARTAJAT pentru testele de rute API (src/app/api/**/route.test.ts) - simuleaza
// clientul Supabase, fara sa atinga vreodata o baza de date reala. NU e un fisier de test
// (numele nu se termina in .test.ts), deci vitest nu il ruleaza singur - doar il importa.

type QueryResult<T = unknown> = { data: T | null; error: { message: string } | null };

/**
 * Un "query builder" fals care accepta orice succesiune de apeluri de tip Supabase
 * (.select().eq().order()... etc.) si se rezolva mereu la rezultatul configurat - fie prin
 * `await query` direct (multe rute nu apeleaza `.single()`, ex. la update), fie prin
 * `.single()`. Suficient de simplu ca sa nu simuleze un SGBD real, dar corect pentru rutele
 * din aceasta aplicatie, care fac cate un singur query per tabel per apel.
 */
function fakeQuery<T>(result: QueryResult<T>) {
  const chain: Record<string, unknown> = {};
  const passthroughMethods = ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'update', 'insert', 'delete', 'upsert', 'not'];
  for (const method of passthroughMethods) chain[method] = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: QueryResult<T>) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

/**
 * Client Supabase fals - `responsesByTable` mapeaza numele tabelului la ce trebuie sa
 * intoarca ORICE query facut pe acel tabel. Presupune ca ruta testata face cel mult un singur
 * query "relevant" per tabel (adevarat pentru toate rutele din acest proiect la data scrierii) -
 * daca o ruta noua are nevoie de raspunsuri diferite pentru apeluri succesive pe acelasi tabel,
 * extinde acest helper, nu-l ocoli in testul respectiv.
 */
export function makeFakeSupabase(responsesByTable: Record<string, QueryResult>, options?: { authUserId?: string | null }) {
  return {
    from: vi.fn((table: string) => fakeQuery(responsesByTable[table] ?? { data: null, error: null })),
    // Folosit doar de server actions care fac propriul lor adminGuard() (nu trec prin
    // requireUser() mock-uit) - vezi admin/actions.test.ts.
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: options?.authUserId ? { id: options.authUserId } : null },
        error: null,
      })),
    },
  };
}

export function okResult<T>(data: T): QueryResult<T> {
  return { data, error: null };
}

export function errorResult(message = 'eroare simulata'): QueryResult<never> {
  return { data: null, error: { message } };
}

/** Profil implicit pentru requireUser() in teste - suprascrie doar ce conteaza per test. */
export function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'teacher-1',
    email: 'profesor@test.ro',
    full_name: 'Profesor Test',
    role: 'teacher',
    is_active: true,
    level: 'Junior',
    phone: null,
    makeup_calendar_link: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
