import { ClipboardList, GraduationCap, Library, Map, Rocket } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import Shell from '@/components/Shell';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const nav = [
    { href: '/curriculum', label: 'Curriculum', icon: <Library size={16} /> },
    { href: '/progress', label: 'Progress Tracker', icon: <Rocket size={16} /> },
    { href: '/registru', label: 'Registru', icon: <ClipboardList size={16} /> },
    { href: '/diplome', label: 'Diplome', icon: <GraduationCap size={16} /> },
    { href: '/roadmap', label: 'Roadmap', icon: <Map size={16} /> },
    ...(profile.role === 'admin'
      ? [{ href: '/admin/curriculum', label: 'Administrare', icon: <Library size={16} /> }]
      : []),
  ];
  return <Shell profile={profile} nav={nav}>{children}</Shell>;
}
