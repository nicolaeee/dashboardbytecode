import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DIPLOMA_MILESTONE_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZTA0M2M1MjY0NTUzYzUxM2Ei_pc';

/**
 * Proxy server-side catre Pabbly pentru task-urile "🚨 Task-uri Urgente" de diploma per elev
 * (la fiecare 16 prezente) - status: 'acknowledged' cand profesorul apasa "Am inteles" pe
 * popup-ul de celebrare, 'completed' cand apasa "Am trimis diploma" din dashboard.
 * NU confunda cu /api/diploma-alerts, care e ruta existenta pentru diploma_milestone la
 * nivel de GRUPA (folosita de pagina /diplome) - acesta e un sistem separat, per elev.
 */
export async function POST(request: Request) {
  await requireUser();

  const body = (await request.json().catch(() => null)) as {
    studentName?: string; teacherName?: string; teacherPhone?: string; className?: string;
    milestone?: number; status?: string; moduleName?: string; parentPhones?: string;
  } | null;
  if (!body || !body.studentName || typeof body.milestone !== 'number' || !body.status) {
    return NextResponse.json({ ok: false, error: 'Date lipsa' }, { status: 400 });
  }
  const { studentName, teacherName, teacherPhone, className, milestone, status, moduleName, parentPhones } = body;

  try {
    const res = await fetch(DIPLOMA_MILESTONE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName, teacherName: teacherName ?? '', teacherPhone: teacherPhone ?? 'Lipsă număr',
        className: className ?? '', milestone, status, moduleName: moduleName ?? '',
        parentPhones: parentPhones ?? 'Lipsă număr',
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
