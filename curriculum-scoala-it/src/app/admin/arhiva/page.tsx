import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent, TrackerStudentTransfer, StudentStatus } from '@/lib/types';
import { attachUrgentTaskDetails } from '@/lib/urgentTasks';
import ArhivaClient, { type ArchivedGroupWithDetails, type ArchivedStudentRow } from './ArhivaClient';

/**
 * "Arhivă" (Admin) - 2 file:
 *  - Clase Arhivate: clase fara niciun elev activ (is_archived, vezi sync_group_archive_status
 *    in supabase/migrations/add_group_zero_active_students_archive.sql) - disparute complet
 *    din contul profesorului, cu istoricul complet al elevilor (Abandon/Transfer).
 *  - Diplome Trimise: istoricul task-urilor de diploma FINALIZATE (status COMPLETED) - dispar
 *    din "Task-uri Urgente" (admin/task-uri-urgente) de indata ce sunt marcate finalizate, si
 *    ajung STRICT aici. Ambele file citesc randuri care raman in DB maxim 4 luni - vezi
 *    cleanup_old_urgent_tasks (supabase/migrations/add_urgent_tasks_cleanup_cron.sql), care
 *    sterge automat, zilnic, orice urgent_task mai vechi de 4 luni (fara filtrare suplimentara
 *    aici - clasele arhivate nu au un asemenea cutoff, raman pana la restaurare manuala).
 */
export default async function ArhivaPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: groupsData }, { data: completedTasks }] = await Promise.all([
    supabase.from('tracker_groups').select('*').eq('is_archived', true).is('deleted_at', null).order('group_name'),
    supabase.from('urgent_tasks').select('*').eq('status', 'COMPLETED').eq('type', 'DIPLOMA_GENERATED').order('completed_at', { ascending: false }),
  ]);

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

  const sentDiplomas = await attachUrgentTaskDetails(supabase, completedTasks ?? []);

  return <ArhivaClient groups={groups} sentDiplomas={sentDiplomas} />;
}
