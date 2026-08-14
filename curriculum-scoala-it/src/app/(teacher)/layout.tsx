import { ClipboardList, GraduationCap, Library, Map, PiggyBank, Rocket, Star, TrendingDown } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getEnabledFeatureModules } from '@/lib/featureAccess';
import Shell from '@/components/Shell';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const enabledModules = await getEnabledFeatureModules(profile);
  const nav = [
    { href: '/curriculum', label: 'Curriculum', icon: <Library size={16} /> },
    { href: '/progress', label: 'Progress Tracker', icon: <Rocket size={16} /> },
    { href: '/registru', label: 'Registru', icon: <ClipboardList size={16} /> },
    { href: '/diplome', label: 'Diplome', icon: <GraduationCap size={16} /> },
    { href: '/recompense', label: 'Recompense', icon: <Star size={16} /> },
    { href: '/roadmap', label: 'Roadmap', icon: <Map size={16} /> },
    // Module noi, randate condiționat - activate per profesor de Super Admin
    // (vezi src/lib/featureAccess.ts si /admin/teachers/[id] -> "Module noi").
    ...(enabledModules.has('subscriptions')
      ? [{ href: '/abonamente', label: 'Abonamente', icon: <PiggyBank size={16} /> }]
      : []),
    ...(enabledModules.has('dropout_analytics')
      ? [{ href: '/analytics', label: 'Rata de Abandon', icon: <TrendingDown size={16} /> }]
      : []),
    ...(profile.role === 'admin'
      ? [{ href: '/admin/curriculum', label: 'Administrare', icon: <Library size={16} /> }]
      : []),
  ];
  return <Shell profile={profile} nav={nav}>{children}</Shell>;
}
