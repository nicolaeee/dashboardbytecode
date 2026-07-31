import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

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
  await requireUser();

  const body = (await request.json().catch(() => null)) as {
    studentName?: string; teacherName?: string; className?: string; status?: string; parentPhones?: string;
  } | null;
  if (!body || !body.studentName || !body.status) {
    return NextResponse.json({ ok: false, error: 'Date lipsa' }, { status: 400 });
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
