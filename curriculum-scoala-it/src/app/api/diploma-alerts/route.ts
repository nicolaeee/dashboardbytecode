import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, isSafeString, readJsonBody, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

type GroupRow = {
  id: string;
  group_name: string;
  diploma_milestone: number | null;
  course: string | null;
  tracker_lessons: { count: number }[];
};

type StudentRow = { id: string; group_id: string; name: string; progress: number };

/**
 * Grupele carora trebuie sa li se trimita diploma (au atins un nou multiplu de 16 lectii).
 * Adminul foloseste clientul cu service_role (ocoleste RLS) ca sa vada TOATE grupele din
 * scoala, indiferent de profesor - nu doar propriile lui grupe personale din tracker.
 * Profesorul ramane restrictionat explicit la propriile grupe (teacher_id = el insusi).
 * Include cursul grupei + rosterul de elevi (nume + progres), necesare pentru modalul de
 * generare a diplomei (filtrare curs + alegere elev + steluțele lui curente).
 */
export async function GET() {
  const profile = await requireUser();
  const isAdmin = profile.role === 'admin';
  if (!checkRateLimit(`diploma-alerts-get:${profile.id}`, RATE_LIMITS.READ.limit, RATE_LIMITS.READ.windowMs)) {
    return NextResponse.json({ groups: [] }, { status: 429 });
  }

  const supabase = isAdmin ? createAdminClient() : await createClient();
  let query = supabase
    .from('tracker_groups')
    .select('id, group_name, diploma_milestone, course, deleted_at, tracker_lessons(count)')
    .is('deleted_at', null);
  if (!isAdmin) query = query.eq('teacher_id', profile.id);

  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ groups: [] });

  const due = (data as unknown as GroupRow[])
    .map((g) => ({
      id: g.id, group_name: g.group_name, course: g.course,
      diplomaMilestone: g.diploma_milestone ?? 0,
      lessonCount: g.tracker_lessons?.[0]?.count ?? 0,
    }))
    .filter((g) => g.lessonCount >= 16 && Math.floor(g.lessonCount / 16) * 16 > g.diplomaMilestone);

  if (due.length === 0) return NextResponse.json({ groups: [] });

  const { data: studentsData } = await supabase
    .from('tracker_students')
    .select('id, group_id, name, progress')
    .in('group_id', due.map((g) => g.id))
    .is('deleted_at', null);

  const studentsByGroup = new Map<string, { id: string; name: string; progress: number }[]>();
  for (const s of (studentsData ?? []) as StudentRow[]) {
    const list = studentsByGroup.get(s.group_id) ?? [];
    list.push({ id: s.id, name: s.name, progress: s.progress });
    studentsByGroup.set(s.group_id, list);
  }

  const result = due.map((g) => ({
    id: g.id, group_name: g.group_name, lessonCount: g.lessonCount, course: g.course,
    students: studentsByGroup.get(g.id) ?? [],
  }));

  return NextResponse.json({ groups: result });
}

/** Marcheaza diploma trimisa pentru o grupa - aceeasi logica de ocolire RLS pentru admin. */
export async function POST(request: Request) {
  const profile = await requireUser();
  const isAdmin = profile.role === 'admin';
  if (!checkRateLimit(`diploma-alerts-post:${profile.id}`, RATE_LIMITS.WEBHOOK_WRITE.limit, RATE_LIMITS.WEBHOOK_WRITE.windowMs)) {
    return NextResponse.json({ ok: false, error: 'Prea multe cereri, încearcă din nou peste un minut.' }, { status: 429 });
  }

  const body = (await readJsonBody(request)) as { groupId?: string; milestone?: number } | null;
  const { groupId, milestone } = body ?? {};
  if (!isSafeString(groupId, 100) || typeof milestone !== 'number' || !Number.isInteger(milestone) || milestone < 0 || milestone > 100_000) {
    return NextResponse.json({ ok: false, error: 'Date lipsa sau invalide' }, { status: 400 });
  }

  const supabase = isAdmin ? createAdminClient() : await createClient();
  let query = supabase.from('tracker_groups').update({ diploma_milestone: milestone }).eq('id', groupId);
  if (!isAdmin) query = query.eq('teacher_id', profile.id);

  const { error } = await query;
  return NextResponse.json({ ok: !error });
}
