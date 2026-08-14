import type { AttendanceStatus } from './types';

export type MakeupPatch = {
  pending_makeups: number;
  absence_date?: string | null;
  makeup_notification_count?: number;
  last_makeup_notification?: string | null;
};

/**
 * Task-uri Urgente de recuperare: marcarea explicita "Absent" adauga o restanta; anularea ei
 * (trecerea la Prezent/Recuperat dintr-un rand deja marcat Absent) o scade la loc (fara sa
 * scada sub 0). `previousStatus` trebuie sa fie statusul PRECEDENT real (undefined cand nu
 * exista inca niciun rand in tracker_attendance pentru elev/lectie), NU eticheta vizuala
 * implicita din UI - un elev nemarcat inca apare vizual ca "absent", dar aici NU e tratat ca
 * atare, altfel prima marcare directa pe Absent (fara sa treaca prin Prezent) ar fi confundata
 * cu "absent -> absent" si nu ar mai declansa alerta de recuperare.
 */
export function computeMakeupPatch(
  previousStatus: AttendanceStatus | undefined,
  nextStatus: AttendanceStatus,
  pendingMakeups: number,
  nowDateStr: string
): MakeupPatch | null {
  const wasAbsent = previousStatus === 'absent';
  const willBeAbsent = nextStatus === 'absent';

  if (willBeAbsent && !wasAbsent) {
    const nextPending = pendingMakeups + 1;
    const patch: MakeupPatch = { pending_makeups: nextPending };
    if (nextPending === 1) patch.absence_date = nowDateStr;
    return patch;
  }

  if (!willBeAbsent && wasAbsent) {
    const nextPending = Math.max(0, pendingMakeups - 1);
    const patch: MakeupPatch = { pending_makeups: nextPending };
    if (nextPending === 0) {
      patch.absence_date = null;
      patch.makeup_notification_count = 0;
      patch.last_makeup_notification = null;
    }
    return patch;
  }

  return null;
}

/**
 * Contribuția unui singur status la soldul de lecții (total_lessons_remaining): 'present',
 * 'absent' și 'made_up' consumă TOATE exact 1 lecție din sold - un elev absent tot a "folosit"
 * slotul orar, iar o recuperare (made_up) e aceeași lecție ratată, doar mutată în timp, nu una
 * nouă. `undefined` (niciun rând încă în tracker_attendance) nu consumă nimic.
 */
function lessonBalanceContribution(status: AttendanceStatus | undefined): number {
  return status === undefined ? 0 : -1;
}

/**
 * Câte lecții trebuie scăzute (sau restituite) din total_lessons_remaining la tranziția de
 * status a UNUI rând din tracker_attendance. Pentru că present/absent/made_up au aceeași
 * contribuție (-1), doar PRIMA marcare a rândului (venind din `undefined`) produce un delta
 * real (-1) - orice schimbare ulterioară ÎNTRE cele trei statusuri (ex: Absent -> Recuperat la
 * "✅ Recuperare efectuata" din Task-uri Urgente) produce delta 0, deci NU taxează a doua oară
 * aceeași lecție. Exemplu de validare (regulă cerută explicit): 3 absențe -> sold -3; cele 3
 * recuperări marcate ulterior 'made_up' -> sold rămâne -3 (nu -6, nu revine la 0).
 */
export function computeLessonBalanceDelta(
  previousStatus: AttendanceStatus | undefined,
  nextStatus: AttendanceStatus
): number {
  return lessonBalanceContribution(nextStatus) - lessonBalanceContribution(previousStatus);
}
