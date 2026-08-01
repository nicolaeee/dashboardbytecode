import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

/**
 * Salveaza/sterge link-ul de calendar recuperari al unui profesor (buton "📅 Link Recuperari"
 * din dashboard) - coloana e STRICT per profesor (profiles.makeup_calendar_link), nu globala.
 * Clientul admin ocoleste RLS-ul de pe profiles (care permite update doar adminului).
 *
 * teacherId din body e onorat DOAR daca cel ce apeleaza e admin (previzualizeaza dashboard-ul
 * altui profesor din dropdown) - altfel e ignorat complet si targetul e mereu profile.id, ca
 * un profesor obisnuit sa nu poata edita, prin niciun request, linkul altcuiva.
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`makeup-calendar-link:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { link?: string | null; teacherId?: string } | null;
  if (!body || (body.link !== null && (typeof body.link !== 'string' || body.link.length > 2000))) {
    return NextResponse.json({ ok: false, error: 'Link invalid' }, { status: 400 });
  }
  const { link } = body;
  const targetTeacherId = profile.role === 'admin' && isSafeString(body.teacherId, 100) ? body.teacherId : profile.id;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('profiles')
    .update({ makeup_calendar_link: link })
    .eq('id', targetTeacherId);

  return NextResponse.json({ ok: !error });
}
