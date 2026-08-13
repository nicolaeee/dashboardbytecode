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
