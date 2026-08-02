import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPhonesForWebhook } from '@/lib/contactList';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

const DIPLOMA_MILESTONE_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZTA0M2M1MjY0NTUzYzUxM2Ei_pc';

const VALID_STATUSES = new Set(['acknowledged', 'completed']);

/**
 * Proxy server-side catre Pabbly pentru task-urile "🚨 Task-uri Urgente" de diploma per elev
 * (la fiecare 16 prezente) - status: 'acknowledged' cand profesorul apasa "Am inteles" pe
 * popup-ul de celebrare, 'completed' cand apasa "Am trimis diploma" din dashboard.
 * NU confunda cu /api/diploma-alerts, care e ruta existenta pentru diploma_milestone la
 * nivel de GRUPA (folosita de pagina /diplome) - acesta e un sistem separat, per elev.
 *
 * Audit securitate M-2: ruta primea anterior studentName/teacherName/teacherPhone/className/
 * parentPhones DIRECT din body, fara nicio verificare fata de DB. Acum clientul trimite doar
 * studentId + milestone + status, iar restul e RECITIT din DB - studentul/clasa prin clientul
 * cu sesiunea profesorului (RLS blocheaza accesul la un elev care nu e al lui), teacherName/
 * teacherPhone direct din profilul autentificat (requireUser() e mereu proaspat, spre
 * deosebire de un prop din client care putea ramane invechit). Payload-ul trimis catre Pabbly
 * ramane STRICT identic ca structura (aceleasi chei, in aceeasi ordine logica).
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`diploma-milestone-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { studentId?: string; milestone?: number; status?: string } | null;
  if (
    !body || !isSafeString(body.studentId, 100) || typeof body.milestone !== 'number' || !Number.isInteger(body.milestone)
    || body.milestone < 0 || body.milestone > 100_000 || !body.status || !VALID_STATUSES.has(body.status)
  ) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }
  const { studentId, milestone, status } = body;

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from('tracker_students')
    .select('id, name, short_name, parent_phones, group_id')
    .eq('id', studentId)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ ok: false, error: 'Elev negăsit' }, { status: 404 });
  }
  const { data: group } = await supabase.from('tracker_groups').select('group_name').eq('id', student.group_id).single();

  try {
    const res = await fetch(DIPLOMA_MILESTONE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: student.short_name?.trim() || student.name,
        teacherName: profile.full_name || profile.email,
        teacherPhone: profile.phone?.trim() || 'Lipsă număr',
        className: group?.group_name ?? '',
        milestone,
        status,
        moduleName: '',
        parentPhones: formatPhonesForWebhook(student.parent_phones),
      }),
    });
    if (!res.ok) {
      console.error('DIPLOMA MILESTONE WEBHOOK ERROR:', res.status, await res.text());
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (error) {
    console.error('DIPLOMA MILESTONE WEBHOOK ERROR:', error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
