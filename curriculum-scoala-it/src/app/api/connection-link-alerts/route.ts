import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cleanContactList } from '@/lib/contactList';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

const NOTIFY_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZTA0MzI1MjZhNTUzMjUxMzUi_pc';

/**
 * Proxy server-side catre Pabbly (Green API) pentru "🔔 Trimite Notificare" (link de conectare
 * la clasa) din cardul unui elev - MUTAT din client (audit securitate H-1: URL-ul webhook nu
 * mai trebuie sa fie vizibil in bundle-ul JS, unde putea fi extras si folosit ca relay deschis
 * de oricine, chiar neautentificat, pentru a trimite date arbitrare catre Pabbly).
 *
 * Payload-ul catre Pabbly pastreaza cheile trimise anterior din client (nume_copil, telefon,
 * email, link_conectare, in acelasi format) - doar sursa datelor s-a mutat server-side, citite
 * direct din DB prin clientul cu sesiunea profesorului (RLS blocheaza accesul la un elev care
 * nu e al lui).
 *
 * nume_copil ramane DOAR prenumele/numele scurt (short_name, cu fallback pe numele complet) -
 * folosit de automatizare in textul mesajului trimis parintelui, exact ca inainte. studentFullName
 * e un camp NOU, cu numele complet al elevului - destinat exclusiv logurilor interne ale
 * adminului, ca sa poata identifica precis copilul (nu se afiseaza in mesajul catre parinte).
 */
export async function POST(request: Request) {
  const profile = await requireUser();
  if (!checkRateLimit(`connection-link-alerts:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { studentId?: string } | null;
  if (!body || !isSafeString(body.studentId, 100)) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase
    .from('tracker_students')
    .select('id, name, short_name, parent_phones, parent_emails, group_id')
    .eq('id', body.studentId)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ ok: false, error: 'Elev negăsit' }, { status: 404 });
  }

  const phones = cleanContactList(student.parent_phones ?? []);
  if (phones.length === 0) {
    return NextResponse.json({ ok: false, error: 'Adminul nu a adăugat încă un număr pentru acest elev!' }, { status: 400 });
  }
  // Acelasi format ca inainte: fiecare telefon cu sufixul Green API, telefoanele unite prin virgula.
  const formattedPhones = phones.map((p) => (p.endsWith('@c.us') ? p : `${p}@c.us`)).join(', ');
  const formattedEmails = cleanContactList(student.parent_emails ?? []).join(', ');

  const { data: group } = await supabase.from('tracker_groups').select('meet_link').eq('id', student.group_id).single();

  try {
    const res = await fetch(NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nume_copil: student.short_name?.trim() || student.name,
        studentFullName: student.name,
        telefon: formattedPhones,
        email: formattedEmails,
        link_conectare: group?.meet_link ?? '',
      }),
    });
    if (!res.ok) {
      console.error('CONNECTION LINK WEBHOOK ERROR:', res.status, await res.text());
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (error) {
    console.error('CONNECTION LINK WEBHOOK ERROR:', error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
