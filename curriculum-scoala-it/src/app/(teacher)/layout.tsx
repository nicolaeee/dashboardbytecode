import { ClipboardList, GraduationCap, Library, Map, PiggyBank, Rocket, Star, TrendingDown } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getEnabledFeatureModules } from '@/lib/featureAccess';
import { getNewUrgentTaskCount } from '@/lib/urgentTasks';
import { getAdminNavItems } from '@/lib/adminNav';
import Shell from '@/components/Shell';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();

  // Adminul foloseste EXACT acelasi sidebar ca in admin/layout.tsx (nu unul "asemanator") -
  // altfel, cum /progress, /diplome, /registru etc. sunt randate de acest layout (diferit de
  // admin/layout.tsx, care randeaza /admin/*), sidebar-ul isi schimba continutul la fiecare
  // navigare intre cele doua grupuri de rute (ex: "Profesori" disparea la accesarea "Progress
  // Tracker"). Un singur array sursa (getAdminNavItems) elimina complet acest bug.
  if (profile.role === 'admin') {
    const newTaskCount = await getNewUrgentTaskCount(profile);
    return <Shell profile={profile} nav={getAdminNavItems(newTaskCount)}>{children}</Shell>;
  }

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
  ];
  return <Shell profile={profile} nav={nav}>{children}</Shell>;
}
