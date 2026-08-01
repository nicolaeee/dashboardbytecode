import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

/**
 * Salveaza/sterge link-ul de calendar recuperari al profesorului logat (buton "📅 Link
 * Recuperari" din dashboard). Clientul admin ocoleste RLS-ul de pe profiles (care permite
 * update doar adminului) - restrictionam totusi explicit la eq('id', profile.id), ca fiecare
 * profesor sa isi poata edita DOAR propriul link, indiferent de ce trimite request-ul.
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`makeup-calendar-link:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { link?: string | null } | null;
  if (!body || (body.link !== null && (typeof body.link !== 'string' || body.link.length > 2000))) {
    return NextResponse.json({ ok: false, error: 'Link invalid' }, { status: 400 });
  }
  const { link } = body;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('profiles')
    .update({ makeup_calendar_link: link })
    .eq('id', profile.id);

  return NextResponse.json({ ok: !error });
}
