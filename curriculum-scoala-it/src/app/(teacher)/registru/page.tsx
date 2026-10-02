import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fetchTeacherRegistry } from '@/lib/registryData';
import Registru from './Registru';

export default async function RegistruPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  // Registrul vine din get_teacher_registry (vezi lib/registryData.ts): lectiile/recuperarile
  // pe care profesorul le-a PREDAT efectiv (taught_by), nu cele ale claselor pe care le detine
  // acum - altfel un transfer de clasa i-ar muta istoricul platit la noul profesor. Include
  // prezenta 'present' (nu doar 'made_up'), ca sa stim care lectii au avut o sedinta LIVE reala
  // (vezi liveLessonIds in lib/registryCalc.ts), plus doar id+name pentru elevi/grupe (GDPR).
  const [registry, teachersRes] = await Promise.all([
    fetchTeacherRegistry(supabase, profile.id),
    isAdmin
      ? supabase.from('profiles').select('id, full_name, email').order('full_name')
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string }[] | null }),
  ]);

  return (
    <Registru
      viewerId={profile.id}
      isAdmin={isAdmin}
      teacherOptions={(teachersRes.data ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }))}
      initialLessons={registry.lessons}
      initialAttendance={registry.attendance}
      initialStudents={registry.students}
      initialGroups={registry.groups}
    />
  );
}
