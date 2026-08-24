import { requireAdmin } from '@/lib/auth';
import { getNewUrgentTaskCount } from '@/lib/urgentTasks';
import { getAdminNavItems } from '@/lib/adminNav';
import Shell from '@/components/Shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();
  const newTaskCount = await getNewUrgentTaskCount(profile);
  return (
    <Shell profile={profile} nav={getAdminNavItems(newTaskCount)}>
      {children}
    </Shell>
  );
}
