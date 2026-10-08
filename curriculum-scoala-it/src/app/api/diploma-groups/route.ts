import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/apiSecurity';
import { moduleStarsByStudent } from '@/lib/lessonNumbering';

export const dynamic = 'force-dynamic';

type GroupRow = { id: string; group_name: string; course: string | null };
type StudentRow = { id: string; group_id: string; name: string; progress: number; lesson_offset: number; legacy_module_stars: number; legacy_stars_module: number | null };

/**
 * Grupele (+ elevii lor) disponibile pentru generarea manuala a diplomelor din /diplome.
 * Profesorul vede strict propriile grupe. Adminul poate cere oricare profesor prin
 * ?teacherId=<id> - foloseste service_role ca sa ocoleasca RLS.
 */
export async function GET(request: Request) {
  const profile = await requireUser();
  const isAdmin = profile.role === 'admin';
  if (!checkRateLimit(`diploma-groups:${profile.id}`, RATE_LIMITS.READ.limit, RATE_LIMITS.READ.windowMs)) {
    return NextResponse.json({ groups: [] }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const requestedTeacherId = searchParams.get('teacherId');
  const targetTeacherId = isAdmin && requestedTeacherId ? requestedTeacherId : profile.id;

  const supabase = isAdmin ? createAdminClient() : await createClient();

  const { data: groupsData } = await supabase
    .from('tracker_groups')
    .select('id, group_name, course')
    .eq('teacher_id', targetTeacherId)
    .is('deleted_at', null)
    .order('group_name');

  const groups = (groupsData ?? []) as GroupRow[];
  if (groups.length === 0) return NextResponse.json({ groups: [] });

  let studentsQuery = supabase
    .from('tracker_students')
    .select('id, group_id, name, progress, lesson_offset, legacy_module_stars, legacy_stars_module')
    .in('group_id', groups.map((g) => g.id))
    .is('deleted_at', null);
  // Elevii "Abandon" nu mai apar la profesor (vezi progress/page.tsx) - adminul ii vede in continuare.
  if (!isAdmin) studentsQuery = studentsQuery.neq('status', 'dropped_out');
  const { data: studentsData } = await studentsQuery.order('name');

  const groupIds = groups.map((g) => g.id);
  const [{ data: lessonsData }, { data: starredAttendance }] = await Promise.all([
    supabase.from('tracker_lessons').select('id, group_id, curriculum_index').in('group_id', groupIds),
    supabase.from('tracker_attendance').select('lesson_id, student_id, star_count').eq('teacher_id', targetTeacherId).gt('star_count', 0),
  ]);
  const moduleStars = moduleStarsByStudent((studentsData ?? []) as StudentRow[], lessonsData ?? [], starredAttendance ?? []);

  const studentsByGroup = new Map<string, { id: string; name: string; progress: number; module_stars: number }[]>();
  for (const s of (studentsData ?? []) as StudentRow[]) {
    const list = studentsByGroup.get(s.group_id) ?? [];
    list.push({ id: s.id, name: s.name, progress: s.progress, module_stars: moduleStars.get(s.id) ?? 0 });
    studentsByGroup.set(s.group_id, list);
  }

  const result = groups.map((g) => ({
    id: g.id, group_name: g.group_name, course: g.course,
    students: studentsByGroup.get(g.id) ?? [],
  }));

  return NextResponse.json({ groups: result });
}
