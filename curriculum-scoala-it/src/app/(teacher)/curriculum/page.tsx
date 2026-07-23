import Link from 'next/link';
import { ChevronRight, Lock, PlayCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getAccessMap, getTree, lessonUnlocked } from '@/lib/queries';
import { Badge, Card, EmptyState } from '@/components/ui';

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

      {tree.length === 0 && <EmptyState title="Curriculumul nu are încă niciun conținut publicat." />}

      {tree.map((platform) => (
        <Card key={platform.id} className="overflow-hidden">
          <div className="border-l-4 px-5 py-4" style={{ borderColor: platform.accent }}>
            <h2 className="font-display text-xl font-semibold">{platform.name}</h2>
            {platform.description && <p className="mt-0.5 text-sm text-ink/55">{platform.description}</p>}
          </div>

          <div className="space-y-5 border-t border-line bg-slate-25 px-5 py-5">
            {platform.courses.length === 0 && <p className="text-sm text-lock">Niciun curs publicat.</p>}

            {platform.courses.map((course) => (
              <section key={course.id} className="rail">
                <span className="rail-dot" style={{ background: platform.accent }} />
                <h3 className="font-medium">{course.title}</h3>
                {course.description && <p className="text-[13px] text-ink/50">{course.description}</p>}

                <ul className="mt-3 space-y-2">
                  {course.modules.map((mod, mi) => (
                    <li key={mod.id}
                      className={`rounded-xl border px-4 py-3 ${mod.unlocked ? 'border-line bg-white' : 'border-dashed border-line bg-white/50'}`}>
                      <div className="flex items-center gap-3">
                        <span className="tag w-7 shrink-0">M{mi + 1}</span>
                        <span className={`min-w-0 flex-1 truncate text-[15px] ${mod.unlocked ? '' : 'text-lock'}`}>
                          {mod.title}
                        </span>
                        {mod.unlocked
                          ? <Badge tone="ok">Acces</Badge>
                          : <span className="inline-flex items-center gap-1.5 text-[12px] text-lock">
                              <Lock size={13} /> Blocat
                            </span>}
                      </div>

                      <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
                        {mod.lessons.length === 0 && <li className="text-[13px] text-lock">Fără lecții.</li>}

                        {mod.lessons.map((lesson, li) => {
                          const canOpen = lessonUnlocked(access, lesson);
                          const label = (
                            <>
                              <span className="tag w-7 shrink-0">L{li + 1}</span>
                              <span className="min-w-0 flex-1 truncate text-sm">{lesson.title}</span>
                            </>
                          );
                          return (
                            <li key={lesson.id}>
                              {canOpen ? (
                                <Link href={`/lectie/${lesson.id}`}
                                  className="flex items-center gap-2 rounded-lg px-1.5 py-2 transition hover:bg-brand-50">
                                  <PlayCircle size={15} className="shrink-0 text-brand-500" />
                                  {label}
                                  <ChevronRight size={15} className="shrink-0 text-lock" />
                                </Link>
                              ) : (
                                <div className="flex items-center gap-2 px-1.5 py-2 text-lock"
                                  title="Nu ai permisiunea de a accesa acest conținut.">
                                  <Lock size={14} className="shrink-0" />
                                  {label}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                  {course.modules.length === 0 && <li className="text-sm text-lock">Niciun modul publicat.</li>}
                </ul>
              </section>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
