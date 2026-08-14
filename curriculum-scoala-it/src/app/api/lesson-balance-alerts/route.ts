import { after, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

const LESSON_BALANCE_ALERT_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY4MDYzNjA0M2M1MjY1NTUzNTUxMzMi_pc';

/**
 * Proxy server-side catre Pabbly pentru alerta de sold de lectii aproape epuizat: se declanseaza
 * cand total_lessons_remaining ajunge la EXACT 2 sau 0 (vezi applyLessonBalanceDelta din
 * ProgressTracker.tsx, care apeleaza aceasta ruta doar cand tocmai s-a produs o scadere reala -
 * altfel am retrimite alerta la fiecare load, cat timp soldul ramane la 2/0). Acelasi tipar de
 * securitate ca /api/admin-alerts: clientul trimite DOAR studentId, restul (nume elev, nume
 * profesor, sold curent) se RECITESTE din DB prin clientul cu sesiunea utilizatorului - RLS
 * blocheaza accesul la un elev care nu e al lui (un admin poate citi orice elev).
 *
 * Trimiterea catre Pabbly e fire-and-forget (cerinta explicita de business): nu blocheaza
 * raspunsul catre frontend, chiar daca Pabbly raspunde greu sau deloc - foloseste after() din
 * next/server, care continua sa ruleze DUPA ce raspunsul a fost deja trimis (spre deosebire de
 * un simplu fetch neasteptat, care risca sa fie intrerupt in momentul in care functia raspunde).
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`lesson-balance-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { studentId?: string } | null;
  if (!body || !isSafeString(body.studentId, 100)) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }
  const { studentId } = body;

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from('tracker_students')
    .select('id, name, teacher_id, total_lessons_remaining, presence_count, absence_count')
    .eq('id', studentId)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ ok: false, error: 'Elev negăsit' }, { status: 404 });
  }

  // Pragul se verifica pe valoarea REALA din DB (nu pe orice ar trimite clientul in body) -
  // asa evitam sa declansam webhook-uri false daca cineva ar apela ruta direct cu alt studentId.
  if (student.total_lessons_remaining !== 2 && student.total_lessons_remaining !== 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const [{ data: teacher }, { count: consumedCount }] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', student.teacher_id).single(),
    supabase.from('tracker_attendance').select('id', { count: 'exact', head: true })
      .eq('student_id', studentId).in('status', ['present', 'absent']),
  ]);

  const payload = {
    nume_copil: student.name,
    nume_profesor: teacher?.full_name || teacher?.email || '',
    lectii_ramase: student.total_lessons_remaining,
    lectii_efectuate: (consumedCount ?? 0) + (student.presence_count ?? 0) + (student.absence_count ?? 0),
  };

  after(async () => {
    try {
      const res = await fetch(LESSON_BALANCE_ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.error('LESSON BALANCE ALERT WEBHOOK ERROR:', res.status, await res.text());
    } catch (error) {
      console.error('LESSON BALANCE ALERT WEBHOOK ERROR:', error);
    }
  });

  return NextResponse.json({ ok: true });
}
