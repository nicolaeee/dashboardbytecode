import { LayoutGrid, Library, Users } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import Shell from '@/components/Shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();
  return (
    <Shell
      profile={profile}
      nav={[
        { href: '/admin', label: 'Panou', icon: <LayoutGrid size={16} />, exact: true },
        { href: '/admin/curriculum', label: 'Curriculum', icon: <Library size={16} /> },
        { href: '/admin/teachers', label: 'Profesori', icon: <Users size={16} /> },
      ]}
    >
      {children}
    </Shell>
  );
}
