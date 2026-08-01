import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { checkRateLimit, isSafeString, isSafeOptionalString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

const ADMIN_ALERT_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZTA0M2M1MjY5NTUzNjUxMzIi_pc';

/**
 * Proxy server-side catre Pabbly pentru alertele de status de conectare ("S-a conectat" /
 * "Nu s-a conectat") trimise catre admini din Progress Tracker - vizibil atat pentru admin
 * cat si pentru profesor. Facut server-side (spre deosebire de notificarea catre parinti,
 * care merge direct din browser cu mode: 'no-cors') ca sa putem verifica real raspunsul
 * Webhook-ului si sa logam eventualele erori.
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`admin-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as {
    studentName?: string; teacherName?: string; className?: string; status?: string; parentPhones?: string;
  } | null;
  if (
    !body || !isSafeString(body.studentName) || !isSafeString(body.status, 30)
    || !isSafeOptionalString(body.teacherName) || !isSafeOptionalString(body.className)
    || !isSafeOptionalString(body.parentPhones, 1000)
  ) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }
  const { studentName, teacherName, className, status, parentPhones } = body;

  try {
    const res = await fetch(ADMIN_ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName, teacherName: teacherName ?? '', className: className ?? '', status,
        parentPhones: parentPhones ?? 'Lipsă număr',
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
