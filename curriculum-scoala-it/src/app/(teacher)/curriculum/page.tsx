import { requireUser } from '@/lib/auth';
import { filterTreeForTeacher } from '@/lib/access';
import { getAccessMap, getTree } from '@/lib/queries';
import TeacherCurriculumTree from './TeacherCurriculumTree';

export default async function TeacherCurriculumPage() {
  const profile = await requireUser();
  const isAdmin = profile.role === 'admin';
  const access = await getAccessMap(profile);
  const fullTree = await getTree(access);
  // "Strict necesar": profesorul vede doar ce are voie sa deschida - restul dispare
  // complet din listă, nu mai apare cu lacăt. Adminul continuă să vadă tot, nefiltrat.
  const tree = isAdmin ? fullTree : filterTreeForTeacher(fullTree, access);

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header>
        <p className="tag">Materialele mele</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Curriculum</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          {isAdmin
            ? 'Vezi și gestionează întreaga structură a școlii.'
            : 'Acestea sunt materialele și cursurile la care ai acces pentru a preda.'}
        </p>
      </header>

      <TeacherCurriculumTree tree={tree} />
    </div>
  );
}
