import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getEnabledFeatureModules } from '@/lib/featureAccess';
import AbonamenteClient, { type SubscriptionRow } from './AbonamenteClient';

export default async function AbonamentePage() {
  const profile = await requireUser();
  const enabledModules = await getEnabledFeatureModules(profile);
  // Modul nou, activabil per profesor de Super Admin (vezi src/lib/featureAccess.ts) - un
  // profesor caruia nu i s-a acordat acces e redirectionat, la fel ca requireAdmin().
  if (!enabledModules.has('subscriptions')) redirect('/progress');

  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  // Adminul vede soldul TUTUROR elevilor (din toate clasele) - profesorul vede doar ai lui.
  // Numele profesorului/clasei se rezolva separat mai jos (fara join), ca sa nu depindem de
  // numele exact al constrangerii FK din Supabase.
  let studentsQuery = supabase
    .from('tracker_students')
    .select('id, teacher_id, group_id, name, status, subscription_type, total_lessons_remaining')
    .is('deleted_at', null)
    .order('name');
  if (!isAdmin) studentsQuery = studentsQuery.eq('teacher_id', profile.id);

  let groupsQuery = supabase.from('tracker_groups').select('id, group_name, teacher_id').is('deleted_at', null);
  if (!isAdmin) groupsQuery = groupsQuery.eq('teacher_id', profile.id);

  const [{ data: students }, { data: groups }, teachersRes] = await Promise.all([
    studentsQuery,
    groupsQuery,
    isAdmin
      ? supabase.from('profiles').select('id, full_name, email')
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string }[] | null }),
  ]);

  const groupNameById = new Map((groups ?? []).map((g) => [g.id as string, g.group_name as string]));
  const teacherNameById = new Map((teachersRes.data ?? []).map((t) => [t.id, t.full_name || t.email]));

  const rows: SubscriptionRow[] = (students ?? []).map((s) => ({
    id: s.id as string,
    teacherId: s.teacher_id as string,
    name: s.name as string,
    groupName: groupNameById.get(s.group_id as string) ?? '—',
    teacherName: isAdmin ? (teacherNameById.get(s.teacher_id as string) ?? '—') : null,
    status: s.status as SubscriptionRow['status'],
    subscriptionType: s.subscription_type as SubscriptionRow['subscriptionType'],
    remaining: s.total_lessons_remaining as number,
  }));

  return <AbonamenteClient viewerId={profile.id} isAdmin={isAdmin} initialRows={rows} />;
}
