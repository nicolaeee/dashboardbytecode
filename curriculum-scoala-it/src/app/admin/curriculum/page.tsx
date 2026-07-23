import { requireAdmin } from '@/lib/auth';
import { getAccessMap, getTree } from '@/lib/queries';
import CurriculumManager from './CurriculumManager';

export default async function CurriculumAdminPage() {
  const profile = await requireAdmin();
  const access = await getAccessMap(profile);
  const tree = await getTree(access);

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <p className="tag">Structura conținutului</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Curriculum</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Platformă → Curs → Modul → Lecție. Orice modificare apare instant la profesorii care au acces.
        </p>
      </header>
      <CurriculumManager tree={tree} />
    </div>
  );
}
