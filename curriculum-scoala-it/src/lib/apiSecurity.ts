/**
 * Utilitare comune de securitate pentru rutele din src/app/api/*: rate limiting simplu
 * (fara dependinte noi/Redis) si validare/parsare stricta a body-ului JSON primit. Fiecare
 * ruta tot trebuie sa apeleze requireUser() ca prim pas (verifica sesiunea curenta prin
 * auth.getUser()) - astea sunt un strat suplimentar, nu un inlocuitor.
 */

type Bucket = { count: number; resetAt: number };

// In-memory, per instanta de server (nu Redis/distribuit) - suficient ca prima linie de
// aparare pentru o aplicatie interna de dimensiuni mici, unde un abuz arata ca "un cont
// trimite sute de cereri pe secunda", nu ca un atac distribuit din mii de IP-uri diferite.
// Limitare cunoscuta: pe un deploy cu mai multe instante server active simultan, fiecare
// isi tine propriul contor, deci limita reala poate fi putin mai mare decat `limit`.
const buckets = new Map<string, Bucket>();

// Plasa de siguranta ca hartia sa nu creasca nelimitat daca apar multi useri/chei diferite -
// se curata oportunist cand se depaseste pragul, nu printr-un cron/interval separat.
const MAX_TRACKED_KEYS = 5000;

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * true = cererea e permisa (si contorizata); false = limita depasita, ruta trebuie sa
 * raspunda cu status 429. `key` e de obicei `${routeName}:${profile.id}` - limitam per cont
 * autentificat, nu per IP (oricum toate rutele cer deja o sesiune valida).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Limite standard, reutilizate de toate rutele - vezi checkRateLimit. */
export const RATE_LIMITS = {
  /** Rute care trimit efectiv un webhook/notificare (actiune declansata de un click uman). */
  WEBHOOK_WRITE: { limit: 20, windowMs: 60_000 },
  /** Rute de citire (GET), folosite la incarcarea paginilor. */
  READ: { limit: 60, windowMs: 60_000 },
  /** Incercari de autentificare (signIn) - protectie de baza contra brute-force/credential
   * stuffing pe /login, cheie pe email (nu exista inca un user.id la acest punct). */
  AUTH_ATTEMPT: { limit: 8, windowMs: 5 * 60_000 },
  /** Server actions de admin (creare/editare/stergere conturi si curriculum) - risc redus
   * (necesita deja un cont de admin autentificat), dar apere in adancime contra unei sesiuni
   * de admin compromise/scriptate care ar rula actiuni in masa. */
  ADMIN_WRITE: { limit: 40, windowMs: 60_000 },
} as const;

const MAX_BODY_BYTES = 20_000; // 20KB - generos pentru payload-urile JSON mici din aceasta aplicatie

/**
 * Parseaza body-ul JSON al request-ului cu o limita stricta de dimensiune (verificata INAINTE
 * de a incepe parsarea, din header-ul Content-Length daca exista, si din nou dupa citirea
 * textului brut daca header-ul lipseste/e incorect) - un payload uriaș (ex. un string de
 * cativa MB intr-un camp text) nu ajunge niciodata sa fie parsat/procesat. Returneaza null
 * daca JSON-ul lipseste, e invalid sau depaseste limita.
 */
export async function readJsonBody(request: Request, maxBytes: number = MAX_BODY_BYTES): Promise<unknown | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > maxBytes) return null;

  const raw = await request.text().catch(() => null);
  if (raw === null) return null;
  if (raw.length > maxBytes) return null;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** String nevid, fara caractere de control, plafonat la maxLength (implicit 300). */
export function isSafeString(value: unknown, maxLength = 300): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;
  // eslint-disable-next-line no-control-regex -- verificare deliberata a caracterelor de control
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(trimmed)) return false;
  return true;
}

/** La fel ca isSafeString, dar accepta si string gol (campuri optionale precum moduleName). */
export function isSafeOptionalString(value: unknown, maxLength = 300): value is string {
  return value === '' || isSafeString(value, maxLength);
}
