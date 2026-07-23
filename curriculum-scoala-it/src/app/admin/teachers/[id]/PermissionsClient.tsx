'use client';
import { useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, Lock, LockOpen } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { setLessonAccess, setModuleAccess } from '@/app/admin/actions';
import type { Tree } from '@/lib/types';

export default function PermissionsClient({
  teacherId, tree, initialModules, initialLessons,
}: { teacherId: string; tree: Tree; initialModules: string[]; initialLessons: string[] }) {
  const [modules, setModules] = useState(new Set(initialModules));
  const [lessons, setLessons] = useState(new Set(initialLessons));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const applyModules = (ids: string[], granted: boolean) => {
    setModules((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (granted ? next.add(id) : next.delete(id)));
      return next;
    });
    startTransition(async () => {
      const res = await setModuleAccess(teacherId, ids, granted);
      if (!res.ok) setError(res.error);
    });
  };

  const applyLesson = (id: string, granted: boolean) => {
    setLessons((prev) => {
      const next = new Set(prev);
      granted ? next.add(id) : next.delete(id);
      return next;
    });
    startTransition(async () => {
      const res = await setLessonAccess(teacherId, [id], granted);
      if (!res.ok) setError(res.error);
    });
  };

  const totalModules = tree.flatMap((p) => p.courses.flatMap((c) => c.modules)).length;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-[#F2D4D0] bg-[#FDF3F2] px-4 py-2.5 text-sm text-[#C0392B]">{error}</p>
      )}

      <div className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
        <p className="text-sm">
          <span className="font-display text-lg font-semibold tabular-nums">{modules.size}</span>
          <span className="text-ink/60"> din {totalModules} module deblocate</span>
          {lessons.size > 0 && <span className="text-ink/60"> · {lessons.size} lecții individuale</span>}
        </p>
        {pending && <span className="text-[13px] text-lock">Se salvează…</span>}
      </div>

      {tree.map((platform) => {
        const platformModules = platform.courses.flatMap((c) => c.modules.map((m) => m.id));
        const allOn = platformModules.length > 0 && platformModules.every((id) => modules.has(id));

        return (
          <Card key={platform.id} className="overflow-hidden">
            <div className="flex items-center gap-3 border-l-4 px-4 py-3" style={{ borderColor: platform.accent }}>
              <button onClick={() => toggleOpen(platform.id)} className="text-lock hover:text-ink" aria-label="Extinde">
                {open.has(platform.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              <h2 className="flex-1 font-display text-lg font-semibold">{platform.name}</h2>
              <Button size="sm" variant="outline" disabled={pending || platformModules.length === 0}
                onClick={() => applyModules(platformModules, !allOn)}>
                {allOn ? 'Blochează tot' : 'Deblochează tot'}
              </Button>
            </div>

            {open.has(platform.id) && (
              <div className="space-y-4 border-t border-line bg-slate-25 px-5 py-4">
                {platform.courses.map((course) => {
                  const courseModules = course.modules.map((m) => m.id);
                  const courseAllOn = courseModules.length > 0 && courseModules.every((id) => modules.has(id));

                  return (
                    <div key={course.id} className="rail">
                      <span className="rail-dot" style={{ background: platform.accent }} />
                      <div className="flex items-center gap-2">
                        <p className="flex-1 font-medium">{course.title}</p>
                        <Button size="sm" variant="ghost" disabled={pending || courseModules.length === 0}
                          onClick={() => applyModules(courseModules, !courseAllOn)}>
                          {courseAllOn ? 'Blochează cursul' : 'Deblochează cursul'}
                        </Button>
                      </div>

                      <ul className="mt-2 space-y-2">
                        {course.modules.map((mod, mi) => {
                          const on = modules.has(mod.id);
                          return (
                            <li key={mod.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                              <div className="flex items-center gap-3">
                                <span className="tag w-7 shrink-0">M{mi + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-[15px]">{mod.title}</span>
                                <Badge tone={on ? 'ok' : 'lock'}>{on ? 'Deblocat' : 'Blocat'}</Badge>
                                <Switch checked={on} disabled={pending}
                                  label={`Acces la ${mod.title}`}
                                  onChange={(v) => applyModules([mod.id], v)} />
                              </div>

                              {mod.lessons.length > 0 && (
                                <div className="mt-2 border-t border-line pt-2">
                                  <button onClick={() => toggleOpen(mod.id)} className="text-[13px] text-brand-600 hover:text-brand-700">
                                    {open.has(mod.id) ? 'Ascunde lecțiile' : `Acces pe lecții (${mod.lessons.length})`}
                                  </button>

                                  {open.has(mod.id) && (
                                    <ul className="mt-2 space-y-1">
                                      {mod.lessons.map((lesson, li) => {
                                        const viaModule = on;
                                        const single = lessons.has(lesson.id);
                                        return (
                                          <li key={lesson.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                                            {viaModule || single
                                              ? <LockOpen size={14} className="text-[#0E7C63]" />
                                              : <Lock size={14} className="text-lock" />}
                                            <span className="tag w-7 shrink-0">L{li + 1}</span>
                                            <span className="min-w-0 flex-1 truncate text-sm">{lesson.title}</span>
                                            {viaModule ? (
                                              <span className="text-[12px] text-lock">prin modul</span>
                                            ) : (
                                              <Switch checked={single} disabled={pending}
                                                label={`Acces la ${lesson.title}`}
                                                onChange={(v) => applyLesson(lesson.id, v)} />
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Switch({
  checked, onChange, disabled, label,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50
        ${checked ? 'bg-brand-500' : 'bg-slate-150'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all
        ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
