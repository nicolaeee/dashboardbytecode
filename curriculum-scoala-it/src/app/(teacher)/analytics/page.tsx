import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getEnabledFeatureModules } from '@/lib/featureAccess';
import type { TeacherDropoutStat } from '@/lib/types';
import AnalyticsDropoutClient from './AnalyticsDropoutClient';

const DEFAULT_MONTHS = 4;

export default async function AnalyticsPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  // Verificarea accesului si citirea statisticilor pleaca in paralel (un drum in loc de doua);
  // rezultatul e folosit DOAR daca modulul e activat - altfel redirect, ca inainte.
  const [enabledModules, { data, error }] = await Promise.all([
    getEnabledFeatureModules(profile),
    supabase.rpc('teacher_dropout_stats', { p_months: DEFAULT_MONTHS }),
  ]);
  // Modul nou, activabil per profesor de Super Admin (vezi src/lib/featureAccess.ts) - un
  // profesor caruia nu i s-a acordat acces e redirectionat, la fel ca requireAdmin().
  if (!enabledModules.has('dropout_analytics')) redirect('/progress');

  // teacher_dropout_stats() e security definer si isi restrange singura vizibilitatea (vezi
  // schema.sql): adminul vede toti profesorii, un profesor vede STRICT randul lui - impusa in
  // functia SQL, nu doar aici, ca aparare in adancime.
  if (error) console.error('TEACHER DROPOUT STATS ERROR:', error);

  return (
    <AnalyticsDropoutClient
      isAdmin={profile.role === 'admin'}
      initialMonths={DEFAULT_MONTHS}
      initialStats={(data ?? []) as TeacherDropoutStat[]}
    />
  );
}
