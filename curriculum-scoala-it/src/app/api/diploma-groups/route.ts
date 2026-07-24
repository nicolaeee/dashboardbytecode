import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type GroupRow = { id: string; group_name: string; course: string | null };
type StudentRow = { id: string; group_id: string; name: string; progress: number };

/**
 * Grupele (+ elevii lor) disponibile pentru generarea manuala a diplomelor din /diplome.
 * Profesorul vede strict propriile grupe. Adminul poate cere oricare profesor prin
 * ?teacherId=<id> - foloseste service_role ca sa ocoleasca RLS, la fel ca /api/diploma-alerts.
 */
export async function GET(request: Request) {
  const profile = await requireUser();
  const isAdmin = profile.role === 'admin';
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

  const { data: studentsData } = await supabase
    .from('tracker_students')
    .select('id, group_id, name, progress')
    .in('group_id', groups.map((g) => g.id))
    .is('deleted_at', null)
    .order('name');

  const studentsByGroup = new Map<string, { id: string; name: string; progress: number }[]>();
  for (const s of (studentsData ?? []) as StudentRow[]) {
    const list = studentsByGroup.get(s.group_id) ?? [];
    list.push({ id: s.id, name: s.name, progress: s.progress });
    studentsByGroup.set(s.group_id, list);
  }

  const result = groups.map((g) => ({
    id: g.id, group_name: g.group_name, course: g.course,
    students: studentsByGroup.get(g.id) ?? [],
  }));

  return NextResponse.json({ groups: result });
}
