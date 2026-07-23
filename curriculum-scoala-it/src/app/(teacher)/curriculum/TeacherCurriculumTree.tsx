'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Lock, PlayCircle } from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui';
import { lessonUnlocked } from '@/lib/access';
import type { AccessMap, Tree } from '@/lib/types';

export default function TeacherCurriculumTree({ tree, access }: { tree: Tree; access: AccessMap }) {
  const [open, setOpen] = useState<Set<string>>(new Set(tree.slice(0, 1).map((p) => p.id)));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (tree.length === 0) {
    return <EmptyState title="Curriculumul nu are încă niciun conținut publicat." />;
  }

  return (
    <div className="space-y-4">
      {tree.map((platform) => (
        <Card key={platform.id} className="overflow-hidden">
          <div className="flex items-start gap-3 border-l-4 px-5 py-4" style={{ borderColor: platform.accent }}>
            <button onClick={() => toggle(platform.id)} className="mt-0.5 text-lock hover:text-ink" aria-label="Extinde">
              {open.has(platform.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold">{platform.name}</h2>
              {platform.description && <p className="mt-0.5 text-sm text-ink/55">{platform.description}</p>}
            </div>
          </div>

          {open.has(platform.id) && (
            <div className="space-y-5 border-t border-line bg-slate-25 px-5 py-5">
              {platform.courses.length === 0 && <p className="text-sm text-lock">Niciun curs publicat.</p>}

              {platform.courses.map((course) => (
                <section key={course.id} className="rail">
                  <span className="rail-dot" style={{ background: platform.accent }} />
                  <div className="flex items-start gap-2">
                    <button onClick={() => toggle(course.id)} className="mt-0.5 text-lock hover:text-ink" aria-label="Extinde">
                      {open.has(course.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{course.title}</h3>
                      {course.description && <p className="text-[13px] text-ink/50">{course.description}</p>}
                    </div>
                  </div>

                  {open.has(course.id) && (
                    <ul className="mt-3 space-y-2 pl-6">
                      {course.modules.length === 0 && <li className="text-sm text-lock">Niciun modul publicat.</li>}

                      {course.modules.map((mod, mi) => (
                        <li key={mod.id}
                          className={`glass rounded-xl border px-4 py-3 ${mod.unlocked ? 'border-line' : 'border-dashed border-line opacity-70'}`}>
                          <div className="flex items-center gap-3">
                            <button onClick={() => toggle(mod.id)} className="text-lock hover:text-ink" aria-label="Extinde">
                              {open.has(mod.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
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

                          {open.has(mod.id) && (
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
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
