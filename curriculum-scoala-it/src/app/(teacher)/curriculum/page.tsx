import { requireUser } from '@/lib/auth';
import { getAccessMap, getTree } from '@/lib/queries';
import TeacherCurriculumTree from './TeacherCurriculumTree';

export default async function TeacherCurriculumPage() {
  const profile = await requireUser();
  const access = await getAccessMap(profile);
  const tree = await getTree(access);

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header>
        <p className="tag">Materialele mele</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Curriculum</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Vezi întreaga structură a școlii. Modulele cu lacăt nu îți sunt deblocate încă.
        </p>
      </header>

      <TeacherCurriculumTree tree={tree} access={access} />
    </div>
  );
}
