import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPhonesForWebhook } from '@/lib/contactList';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

const ADMIN_ALERT_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZTA0M2M1MjY5NTUzNjUxMzIi_pc';

const VALID_STATUSES = new Set(['conectat', 'neconectat']);

/**
 * Proxy server-side catre Pabbly pentru alertele de status de conectare ("S-a conectat" /
 * "Nu s-a conectat") trimise catre admini din Progress Tracker - vizibil atat pentru admin
 * cat si pentru profesor.
 *
 * Audit securitate M-2: ruta primea anterior studentName/className/parentPhones DIRECT din
 * body-ul cererii, fara nicio verificare fata de DB - orice profesor autentificat putea
 * trimite alerte cu date complet fabricate (nume de elevi inexistenti, clasa altui profesor
 * etc). Acum clientul trimite DOAR studentId + status, iar restul campurilor sunt RECITITE
 * din DB prin clientul cu sesiunea profesorului (RLS blocheaza accesul la un elev care nu e
 * al lui - un admin poate citi orice elev, la fel ca inainte). teacherName ramane numele
 * contului autentificat (nu al profesorului vizualizat din dropdown), exact ca in
 * comportamentul anterior. Payload-ul trimis catre Pabbly ramane STRICT identic ca structura
 * (aceleasi chei: studentName, teacherName, className, status, parentPhones).
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`admin-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { studentId?: string; status?: string } | null;
  if (!body || !isSafeString(body.studentId, 100) || !body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }
  const { studentId, status } = body;

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from('tracker_students')
    .select('id, name, parent_phones, group_id')
    .eq('id', studentId)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ ok: false, error: 'Elev negăsit' }, { status: 404 });
  }
  const { data: group } = await supabase.from('tracker_groups').select('group_name').eq('id', student.group_id).single();

  try {
    const res = await fetch(ADMIN_ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: student.name,
        teacherName: profile.full_name || profile.email,
        className: group?.group_name ?? '',
        status,
        parentPhones: formatPhonesForWebhook(student.parent_phones),
      }),
    });
    if (!res.ok) {
      console.error('ADMIN ALERT WEBHOOK ERROR:', res.status, await res.text());
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (error) {
    console.error('ADMIN ALERT WEBHOOK ERROR:', error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
