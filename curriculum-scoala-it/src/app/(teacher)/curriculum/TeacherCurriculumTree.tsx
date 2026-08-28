'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, PlayCircle } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import type { Tree } from '@/lib/types';

export default function TeacherCurriculumTree({ tree }: { tree: Tree }) {
  // Totul pornește pliat (platforme/cursuri/module) - la prima încărcare nu aglomerează
  // vizual pagina; profesorul deschide manual, la click, exact ca înainte (toggle neatins).
  const [open, setOpen] = useState<Set<string>>(new Set());

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
          <div
            onClick={() => toggle(platform.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(platform.id); } }}
            role="button" tabIndex={0} aria-expanded={open.has(platform.id)}
            className="flex cursor-pointer items-start gap-3 border-l-4 px-5 py-4 transition hover:bg-slate-25"
            style={{ borderColor: platform.accent }}
          >
            <span className="mt-0.5 text-lock">
              {open.has(platform.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </span>
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
                  <div
                    onClick={() => toggle(course.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(course.id); } }}
                    role="button" tabIndex={0} aria-expanded={open.has(course.id)}
                    className="-mx-2 flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 transition hover:bg-brand-50"
                  >
                    <span className="mt-0.5 text-lock">
                      {open.has(course.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{course.title}</h3>
                      {course.description && <p className="text-[13px] text-ink/50">{course.description}</p>}
                    </div>
                  </div>

                  {open.has(course.id) && (
                    <ul className="mt-3 space-y-2 pl-6">
                      {course.modules.length === 0 && <li className="text-sm text-lock">Niciun modul publicat.</li>}

                      {course.modules.map((mod) => (
                        <li key={mod.id} className="glass rounded-xl border border-line px-4 py-3">
                          <div
                            onClick={() => toggle(mod.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(mod.id); } }}
                            role="button" tabIndex={0} aria-expanded={open.has(mod.id)}
                            className="-mx-4 -my-3 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition hover:bg-brand-50"
                          >
                            <span className="text-lock">
                              {open.has(mod.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[15px]">{mod.title}</span>
                          </div>

                          {open.has(mod.id) && (
                            <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
                              {mod.lessons.length === 0 && <li className="text-[13px] text-lock">Fără lecții.</li>}

                              {mod.lessons.map((lesson) => (
                                <li key={lesson.id}>
                                  <Link href={`/lectie/${lesson.id}`}
                                    className="flex items-center gap-2 rounded-lg px-1.5 py-2 transition hover:bg-brand-50">
                                    <PlayCircle size={15} className="shrink-0 text-brand-500" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{lesson.title}</span>
                                    <ChevronRight size={15} className="shrink-0 text-lock" />
                                  </Link>
                                </li>
                              ))}
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
