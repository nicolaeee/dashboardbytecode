import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent, TrackerStudentTransfer, StudentStatus } from '@/lib/types';
import { STUDENT_STATUS_LABELS } from '@/lib/types';
import { getCourse } from '@/lib/diplomas';
import { computeModuleLesson } from '@/lib/lessonNumbering';
import { Card, Badge, EmptyState } from '@/components/ui';

/**
 * "Arhivă Clase" (Admin) - clase care au ramas fara niciun elev activ (is_archived, vezi
 * sync_group_archive_status in supabase/migrations/add_group_zero_active_students_archive.sql).
 * Aceste clase au disparut complet din contul profesorului - singurul loc unde mai raman
 * vizibile e aici, cu istoricul complet: cine a facut parte din ele si ce s-a intamplat cu
 * fiecare elev (Abandon = ramane legat de clasa; Transfer = plecat la alta clasa, reconstruit
 * din jurnalul tracker_student_transfers).
 */

type ArchivedStudentRow = {
  id: string;
  name: string;
  short_name: string | null;
  status: StudentStatus;
  progress: number;
  kind: 'member' | 'transferred_out';
  transferredTo?: { teacherName: string; groupName: string; at: string } | null;
};

type ArchivedGroupWithDetails = TrackerGroup & {
  teacher_name: string;
  students: ArchivedStudentRow[];
};

function progressLabel(progress: number) {
  const { module, lesson } = computeModuleLesson(Math.max(progress, 1));
  return `${progress} ⭐ · M${module}/L${lesson}`;
}

export default async function ClaseArhivatePage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: groupsData } = await supabase
    .from('tracker_groups')
    .select('*')
    .eq('is_archived', true)
    .is('deleted_at', null)
    .order('group_name');
  const archivedGroups = (groupsData ?? []) as TrackerGroup[];
  const groupIds = archivedGroups.map((g) => g.id);
  const teacherIds = [...new Set(archivedGroups.map((g) => g.teacher_id))];

  const [{ data: teachers }, { data: members }, { data: transfersOut }] = await Promise.all([
    teacherIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', teacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
    groupIds.length
      ? supabase.from('tracker_students').select('id, group_id, name, short_name, status, progress').in('group_id', groupIds)
      : Promise.resolve({ data: [] as Pick<TrackerStudent, 'id' | 'group_id' | 'name' | 'short_name' | 'status' | 'progress'>[] }),
    groupIds.length
      ? supabase.from('tracker_student_transfers').select('*').in('from_group_id', groupIds).order('transferred_at', { ascending: false })
      : Promise.resolve({ data: [] as TrackerStudentTransfer[] }),
  ]);

  const transferStudentIds = [...new Set((transfersOut ?? []).map((t) => t.student_id))];
  const transferToTeacherIds = [...new Set((transfersOut ?? []).map((t) => t.to_teacher_id))];
  const transferToGroupIds = [...new Set((transfersOut ?? []).map((t) => t.to_group_id))];

  const [{ data: transferredStudents }, { data: toTeachers }, { data: toGroups }] = await Promise.all([
    transferStudentIds.length
      ? supabase.from('tracker_students').select('id, name, short_name, status, progress').in('id', transferStudentIds)
      : Promise.resolve({ data: [] as Pick<TrackerStudent, 'id' | 'name' | 'short_name' | 'status' | 'progress'>[] }),
    transferToTeacherIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', transferToTeacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
    transferToGroupIds.length
      ? supabase.from('tracker_groups').select('id, group_name').in('id', transferToGroupIds)
      : Promise.resolve({ data: [] as { id: string; group_name: string }[] }),
  ]);

  const teacherById = new Map((teachers ?? []).map((t) => [t.id, t.full_name || t.email]));
  const transferredStudentById = new Map((transferredStudents ?? []).map((s) => [s.id, s]));
  const toTeacherById = new Map((toTeachers ?? []).map((t) => [t.id, t.full_name || t.email]));
  const toGroupById = new Map((toGroups ?? []).map((g) => [g.id, g.group_name]));

  const membersByGroup = new Map<string, ArchivedStudentRow[]>();
  for (const s of members ?? []) {
    const list = membersByGroup.get(s.group_id) ?? [];
    list.push({ id: s.id, name: s.name, short_name: s.short_name, status: s.status as StudentStatus, progress: s.progress, kind: 'member' });
    membersByGroup.set(s.group_id, list);
  }

  const transfersByGroup = new Map<string, ArchivedStudentRow[]>();
  for (const t of transfersOut ?? []) {
    if (!t.from_group_id) continue;
    const student = transferredStudentById.get(t.student_id);
    const list = transfersByGroup.get(t.from_group_id) ?? [];
    list.push({
      id: `${t.id}`,
      name: student?.name ?? 'Elev șters',
      short_name: student?.short_name ?? null,
      status: (student?.status as StudentStatus) ?? 'active',
      progress: student?.progress ?? 0,
      kind: 'transferred_out',
      transferredTo: {
        teacherName: toTeacherById.get(t.to_teacher_id) ?? 'Profesor șters',
        groupName: toGroupById.get(t.to_group_id) ?? 'Clasă ștearsă',
        at: t.transferred_at,
      },
    });
    transfersByGroup.set(t.from_group_id, list);
  }

  const groups: ArchivedGroupWithDetails[] = archivedGroups.map((g) => ({
    ...g,
    teacher_name: teacherById.get(g.teacher_id) ?? 'Profesor șters',
    students: [...(membersByGroup.get(g.id) ?? []), ...(transfersByGroup.get(g.id) ?? [])],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">🗄️ Arhivă Clase</h1>
        <p className="mt-1 text-sm text-lock">
          Clase fără niciun elev activ (toți au Abandon sau au fost transferați la altă clasă) - dispărute complet din contul profesorului.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nicio clasă arhivată momentan." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((g) => (
            <Card key={g.id} className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold">{g.group_name}</h3>
                  <p className="text-sm text-lock">Profesor: <span className="font-medium text-ink">{g.teacher_name}</span></p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <Badge tone="lock">🗄️ Arhivată</Badge>
                  {g.course && <Badge tone="brand">{getCourse(g.course)?.label ?? g.course}</Badge>}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm text-lock">Elevi ({g.students.length})</span>
                {g.students.length === 0 ? (
                  <p className="text-xs text-lock">Nu s-a găsit niciun elev asociat acestei clase.</p>
                ) : (
                  <div className="space-y-1.5">
                    {g.students.map((s) => (
                      <div key={`${s.kind}-${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-slate-25 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{s.short_name?.trim() || s.name}</span>
                          <span className="ml-2 text-xs text-lock">{progressLabel(s.progress)}</span>
                          {s.kind === 'transferred_out' && s.transferredTo && (
                            <p className="text-xs text-lock">
                              → {s.transferredTo.teacherName} · {s.transferredTo.groupName} · {new Date(s.transferredTo.at).toLocaleDateString('ro-RO')}
                            </p>
                          )}
                        </div>
                        <Badge tone={s.kind === 'transferred_out' ? 'blue' : s.status === 'dropped_out' ? 'neutral' : 'ok'}>
                          {s.kind === 'transferred_out' ? 'Transferat' : STUDENT_STATUS_LABELS[s.status]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
