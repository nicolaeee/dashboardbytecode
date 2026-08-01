// Utilitare pentru telefoane/email-uri de parinte (parent_phones/parent_emails) - partajate
// intre client (ProgressTracker.tsx, formularele de elev) si server (rutele API care
// retrimit notificari catre Pabbly), ca formatarea sa ramana identica in ambele locuri.

/** Maxim de telefoane/email-uri de parinte per elev (vezi PARTEA 1/2 - camp dinamic). */
export const MAX_CONTACTS = 5;

/**
 * Normalizeaza orice valoare venita din DB/state la un array de string-uri, indiferent
 * daca e deja array, null/undefined (elevi vechi, dinainte de migratie) sau un string
 * simplu ramas dintr-o migrare partiala - niciodata nu lasam un .map() sa crape pe el.
 */
export function asContactList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return value ? [value] : [];
  return [];
}

/** Curata lista pentru salvare: trim + elimina golurile + plafoneaza la MAX_CONTACTS. */
export function cleanContactList(value: unknown): string[] {
  return asContactList(value).map((v) => v.trim()).filter(Boolean).slice(0, MAX_CONTACTS);
}

/**
 * Numerele de telefon curatate (vezi cleanContactList), fiecare cu "+" in fata (adaugat doar
 * daca lipseste) si unite prin rand nou - format gata pentru linkuri apelabile din WhatsApp in
 * payload-urile trimise catre Pabbly. "Lipsă număr" daca lista e goala.
 */
export function formatPhonesForWebhook(value: unknown): string {
  const phones = cleanContactList(value);
  if (phones.length === 0) return 'Lipsă număr';
  return phones.map((p) => (p.startsWith('+') ? p : `+${p}`)).join('\n');
}

/** Lista pentru afisare in formular: mereu cel putin 1 input (gol daca elevul nu are inca date). */
export function toEditableList(value: unknown): string[] {
  const list = asContactList(value);
  return list.length > 0 ? list : [''];
}
