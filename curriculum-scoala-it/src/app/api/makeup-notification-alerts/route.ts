import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cleanContactList } from '@/lib/contactList';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

const MAKEUP_NOTIFICATION_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZjA0MzQ1MjZmNTUzMjUxMzEi_pc';

const MAX_NOTIFICATIONS = 3;
const COOLDOWN_HOURS = 48;

/**
 * Cooldown-ul (max 3, minim 48h intre trimiteri) era verificat DOAR client-side
 * (canSendMakeupNotification din ProgressTracker.tsx) - un profesor putea ocoli complet
 * limita printr-un request direct catre aceasta ruta (ex. din consola), spamand telefonul
 * unui parinte. Acum e reverificat aici, pe valorile citite direct din DB chiar inainte de
 * trimitere - clientul nu mai poate influenta decizia trimitand alt notificationStep.
 */
function canSendMakeupNotification(count: number, lastSentAt: string | null): boolean {
  if (count >= MAX_NOTIFICATIONS) return false;
  if (count === 0) return true;
  if (!lastSentAt) return true;
  const hoursSinceLast = (Date.now() - new Date(lastSentAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceLast >= COOLDOWN_HOURS;
}

/**
 * Proxy server-side catre Pabbly pentru butonul "Trimite Notificare" din cardul "🚨 Recuperare
 * necesara" (Task-uri Urgente) - trimite parintelui un reminder ca elevul are o recuperare de
 * facut, cu link-ul de calendar al profesorului. Foloseste clientul cu sesiunea profesorului
 * (nu service_role) la citirea/scrierea elevului - RLS-ul de pe tracker_students garanteaza
 * ca profesorul nu poate trimite notificari (sau citi date) pentru un elev care nu e al lui.
 *
 * Payload-ul catre Pabbly e construit STRICT server-side, din date reale de baza (nu din ce
 * trimite clientul) - teacherName/teacherPhone/calendarLink vin din profilul profesorului
 * autentificat (requireUser() face deja select('*') pe profiles), iar parentPhones/parentEmails
 * sunt intotdeauna un singur string, separate prin virgula (nu array brut), gata de procesat
 * in automatizari (inclusiv pentru email-uri) - cleanContactList(...).join(',') nu crapa
 * niciodata, chiar daca elevul nu are inca niciun telefon/email de parinte.
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`makeup-notification-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { studentId?: string } | null;
  if (!body || !isSafeString(body.studentId, 100)) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from('tracker_students')
    .select('id, name, short_name, parent_phones, parent_emails, group_id, pending_makeups, makeup_notification_count, last_makeup_notification')
    .eq('id', body.studentId)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ ok: false, error: 'Elev negăsit' }, { status: 404 });
  }
  if (!student.pending_makeups || student.pending_makeups <= 0) {
    return NextResponse.json({ ok: false, error: 'Nu există o recuperare în așteptare pentru acest elev' }, { status: 400 });
  }
  const currentCount = student.makeup_notification_count ?? 0;
  if (!canSendMakeupNotification(currentCount, student.last_makeup_notification)) {
    return NextResponse.json({ ok: false, error: 'Limita de notificări sau cooldown-ul de 48h nu au fost respectate' }, { status: 429 });
  }

  const { data: group } = await supabase.from('tracker_groups').select('group_name').eq('id', student.group_id).single();
  const notificationStep = currentCount + 1;

  try {
    const res = await fetch(MAKEUP_NOTIFICATION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: student.short_name?.trim() || student.name,
        className: group?.group_name ?? '',
        parentPhones: cleanContactList(student.parent_phones ?? []).join(','),
        parentEmails: cleanContactList(student.parent_emails ?? []).join(','),
        teacherName: profile.full_name || profile.email,
        teacherPhone: profile.phone ?? '',
        calendarLink: profile.makeup_calendar_link ?? '',
        notificationStep,
      }),
    });
    if (!res.ok) {
      console.error('MAKEUP NOTIFICATION WEBHOOK ERROR:', res.status, await res.text());
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (error) {
    console.error('MAKEUP NOTIFICATION WEBHOOK ERROR:', error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const lastMakeupNotification = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('tracker_students')
    .update({ makeup_notification_count: notificationStep, last_makeup_notification: lastMakeupNotification })
    .eq('id', student.id);
  if (updateError) console.error('MAKEUP NOTIFICATION DB UPDATE ERROR:', updateError);

  return NextResponse.json({ ok: true, makeup_notification_count: notificationStep, last_makeup_notification: lastMakeupNotification });
}
