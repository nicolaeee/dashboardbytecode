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
 * "Ore de liniste" (20:00-8:00, ora Bucuresti) - era verificat DOAR client-side
 * (handleOpenMakeupNotifyConfirm din ProgressTracker.tsx), deci ocolibil printr-un request
 * direct catre aceasta ruta. Acelasi calcul (Intl, hourCycle: 'h23'), reverificat aici.
 */
function isBucharestQuietHours(): boolean {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
    10
  );
  return hour >= 20 || hour < 8;
}

type MakeupAction = 'notify_parent' | 'makeup_scheduled';

/**
 * Proxy server-side catre Pabbly, folosit de DOUA butoane din cardul "🚨 Recuperare necesara"
 * (Task-uri Urgente) - "🔔 Trimite Notificare" (action: notify_parent) si "📅 Programat"
 * (action: makeup_scheduled). Acelasi webhook, acelasi payload de baza (elev, telefoane/
 * email-uri parinte, clasa, teacherName/teacherPhone, calendarLink) - Pabbly ramifica pe
 * campul `action` (ex. notify_parent -> WhatsApp catre parinte, makeup_scheduled -> alerta
 * catre admin ca recuperarea a fost stabilita). Foloseste clientul cu sesiunea profesorului
 * (nu service_role) la citirea/scrierea elevului - RLS-ul de pe tracker_students garanteaza
 * ca profesorul nu poate actiona pentru un elev care nu e al lui.
 *
 * Payload-ul catre Pabbly e construit STRICT server-side, din date reale de baza (nu din ce
 * trimite clientul) - teacherName/teacherPhone/calendarLink vin din profilul profesorului
 * autentificat (requireUser() face deja select('*') pe profiles), iar parentPhones/parentEmails
 * sunt intotdeauna un singur string, separate prin virgula (nu array brut), gata de procesat
 * in automatizari (inclusiv pentru email-uri) - cleanContactList(...).join(',') nu crapa
 * niciodata, chiar daca elevul nu are inca niciun telefon/email de parinte.
 *
 * Cooldown-ul de 48h/max 3 se aplica DOAR pentru notify_parent (evita spam-ul repetat catre
 * parinte) - "Programat" e o singura confirmare, nu o notificare repetabila, deci nu
 * consuma/verifica acel contor.
 *
 * studentName ramane DOAR prenumele/numele scurt (short_name, cu fallback pe numele complet) -
 * folosit de automatizare in textul mesajului WhatsApp trimis parintelui la notify_parent.
 * studentFullName e un camp NOU, cu numele complet, destinat exclusiv identificarii elevului in
 * logurile interne ale adminului (relevant mai ales la makeup_scheduled, care ajunge la admin).
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`makeup-notification-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { studentId?: string; action?: string } | null;
  if (!body || !isSafeString(body.studentId, 100)) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }
  if (body.action !== undefined && body.action !== 'notify_parent' && body.action !== 'makeup_scheduled') {
    return NextResponse.json({ ok: false, error: 'Acțiune invalidă' }, { status: 400 });
  }
  const action: MakeupAction = body.action === 'makeup_scheduled' ? 'makeup_scheduled' : 'notify_parent';

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from('tracker_students')
    .select('id, name, short_name, parent_phones, parent_emails, group_id, pending_makeups, makeup_notification_count, last_makeup_notification, is_scheduled, absence_date')
    .eq('id', body.studentId)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ ok: false, error: 'Elev negăsit' }, { status: 404 });
  }
  if (!student.pending_makeups || student.pending_makeups <= 0) {
    return NextResponse.json({ ok: false, error: 'Nu există o recuperare în așteptare pentru acest elev' }, { status: 400 });
  }
  if (action === 'notify_parent' && isBucharestQuietHours()) {
    return NextResponse.json({ ok: false, error: 'Nu e posibil la ora asta să trimiți notificări. Revino mâine de la 8:00 dimineața.' }, { status: 400 });
  }
  const currentCount = student.makeup_notification_count ?? 0;
  if (action === 'notify_parent' && !canSendMakeupNotification(currentCount, student.last_makeup_notification)) {
    return NextResponse.json({ ok: false, error: 'Limita de notificări sau cooldown-ul de 48h nu au fost respectate' }, { status: 429 });
  }
  // Idempotent: daca s-a apasat deja "Programat" (ex. dublu-click/tab dublu), nu retrimitem
  // alerta catre admin a doua oara - doar confirmam starea deja salvata.
  if (action === 'makeup_scheduled' && student.is_scheduled) {
    return NextResponse.json({ ok: true, is_scheduled: true });
  }

  const { data: group } = await supabase.from('tracker_groups').select('group_name').eq('id', student.group_id).single();
  // La "Programat" nu incrementam contorul de notificari catre parinte - e un pas diferit,
  // nu un nou reminder; trimitem in payload valoarea curenta, neschimbata.
  const notificationStep = action === 'notify_parent' ? currentCount + 1 : currentCount;
  const lastMakeupNotification = new Date().toISOString();

  /**
   * FIX duplicare Notificare (7-8h intre trimiteri, acelasi elev): inainte, contorul se
   * actualiza DUPA fetch-ul catre Pabbly - doua request-uri notify_parent care citesc elevul
   * aproape in acelasi timp (dublu-click, tab dublu, retry din alta sesiune) treceau AMANDOUA
   * de canSendMakeupNotification() de mai sus (inca nu apucase niciunul sa scrie), deci ambele
   * ajungeau sa cheme webhook-ul. Acum "rezervam" pasul ATOMIC in DB, printr-un update
   * conditionat de valoarea EXACTA a contorului citita mai sus (compare-and-swap) - INAINTE
   * de orice fetch. Daca alt request a apucat deja sa modifice contorul intre timp, update-ul
   * de mai jos nu potriveste niciun rand (`claimed` gol) si oprim aici, fara sa mai trimitem
   * inca o data catre Pabbly. Restul fluxului (makeup_scheduled) ramane neatins.
   */
  if (action === 'notify_parent') {
    const { data: claimed, error: claimError } = await supabase
      .from('tracker_students')
      .update({ makeup_notification_count: notificationStep, last_makeup_notification: lastMakeupNotification })
      .eq('id', student.id)
      .eq('makeup_notification_count', currentCount)
      .select('id');
    if (claimError) {
      console.error('MAKEUP NOTIFICATION LOCK ERROR:', claimError);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      // Deja rezervata/trimisa de un alt request concurent - raspundem idempotent, cu starea
      // deja salvata, fara sa mai chemam webhook-ul inca o data.
      return NextResponse.json({ ok: true, makeup_notification_count: currentCount, last_makeup_notification: student.last_makeup_notification });
    }
  }

  try {
    const res = await fetch(MAKEUP_NOTIFICATION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        studentName: student.short_name?.trim() || student.name,
        studentFullName: student.name,
        className: group?.group_name ?? '',
        parentPhones: cleanContactList(student.parent_phones ?? []).join(','),
        parentEmails: cleanContactList(student.parent_emails ?? []).join(','),
        teacherName: profile.full_name || profile.email,
        teacherPhone: profile.phone ?? '',
        calendarLink: profile.makeup_calendar_link ?? '',
        notificationStep,
        deduplication_id: `${student.id}_${student.absence_date ?? 'none'}_notif${notificationStep}`,
      }),
    });
    if (!res.ok) {
      console.error('MAKEUP NOTIFICATION WEBHOOK ERROR:', res.status, await res.text());
      if (action === 'notify_parent') {
        // Rollback: rezervarea de mai sus a "consumat" acest pas, dar trimiterea a esuat -
        // eliberam contorul ca profesorul sa poata incerca din nou.
        await supabase.from('tracker_students').update({ makeup_notification_count: currentCount, last_makeup_notification: student.last_makeup_notification }).eq('id', student.id);
      }
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (error) {
    console.error('MAKEUP NOTIFICATION WEBHOOK ERROR:', error);
    if (action === 'notify_parent') {
      await supabase.from('tracker_students').update({ makeup_notification_count: currentCount, last_makeup_notification: student.last_makeup_notification }).eq('id', student.id);
    }
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  if (action === 'notify_parent') {
    return NextResponse.json({ ok: true, makeup_notification_count: notificationStep, last_makeup_notification: lastMakeupNotification });
  }

  const { error: updateError } = await supabase.from('tracker_students').update({ is_scheduled: true }).eq('id', student.id);
  if (updateError) console.error('MAKEUP SCHEDULED DB UPDATE ERROR:', updateError);
  return NextResponse.json({ ok: true, is_scheduled: true });
}
