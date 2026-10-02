import type { TrackerLesson, TrackerAttendance } from './types';

export type RegistryData = {
  lessons: TrackerLesson[];
  attendance: TrackerAttendance[];
  students: { id: string; name: string }[];
  groups: { id: string; group_name: string }[];
};

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Datele registrului (Payslip) unui profesor, dupa cine a PREDAT efectiv (taught_by) - NU dupa
 * teacher_id-ul curent al clasei. Dupa un transfer de clasa, lectiile tinute de vechiul profesor
 * raman in registrul lui, iar cele noi apar la noul profesor (vezi
 * supabase/migrations/add_lesson_taught_by_history.sql, functia get_teacher_registry).
 */
export async function fetchTeacherRegistry(supabase: RpcClient, teacherId: string): Promise<RegistryData> {
  const { data, error } = await supabase.rpc('get_teacher_registry', { p_teacher_id: teacherId });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<RegistryData>;
  return {
    lessons: d.lessons ?? [],
    attendance: d.attendance ?? [],
    students: d.students ?? [],
    groups: d.groups ?? [],
  };
}
