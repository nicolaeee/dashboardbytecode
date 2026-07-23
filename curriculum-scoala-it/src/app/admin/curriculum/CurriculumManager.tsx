'use client';
import { useState, useTransition } from 'react';
import {
  ChevronDown, ChevronRight, Pencil, Plus, Trash2, ArrowUp, ArrowDown, PlayCircle,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { deleteNode, moveNode, saveNode } from '@/app/admin/actions';
import type { EntityKind, Lesson, Tree } from '@/lib/types';

const ACCENTS = ['#F2564B', '#F2A93B', '#12A594', '#D6409F', '#7C5CFF', '#3A55E8'];

type Draft = {
  kind: EntityKind;
  id?: string;
  parentId: string | null;
  values: Record<string, string>;
};

const EMPTY: Record<EntityKind, Record<string, string>> = {
  platform: { name: '', description: '', accent: ACCENTS[0] },
  course: { title: '', description: '' },
  module: { title: '', description: '' },
  lesson: {
    title: '', objective: '', video_url: '', teacher_project_url: '',
    student_project_url: '', notes: '', homework: '', homework_url: '',
  },
};

const PARENT_KEY: Record<EntityKind, string | null> = {
  platform: null, course: 'platform_id', module: 'course_id', lesson: 'module_id',
};

const TITLES: Record<EntityKind, string> = {
  platform: 'platformă', course: 'curs', module: 'modul', lesson: 'lecție',
};

export default function CurriculumManager({ tree }: { tree: Tree }) {
  const [open, setOpen] = useState<Set<string>>(new Set(tree.slice(0, 1).map((p) => p.id)));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const startCreate = (kind: EntityKind, parentId: string | null) =>
    setDraft({ kind, parentId, values: { ...EMPTY[kind] } });

  const startEdit = async (kind: EntityKind, id: string, parentId: string | null, values?: Record<string, string>) => {
    if (kind === 'lesson') {
      const supabase = createClient();
      const { data } = await supabase.from('lessons').select('*').eq('id', id).single();
      const l = data as Lesson;
      setDraft({
        kind, id, parentId,
        values: {
          title: l.title, objective: l.objective ?? '', video_url: l.video_url ?? '',
          teacher_project_url: l.teacher_project_url ?? '', student_project_url: l.student_project_url ?? '',
          notes: l.notes ?? '', homework: l.homework ?? '', homework_url: l.homework_url ?? '',
        },
      });
      return;
    }
    setDraft({ kind, id, parentId, values: { ...EMPTY[kind], ...values } });
  };

  const submit = () => {
    if (!draft) return;
    const key = PARENT_KEY[draft.kind];
    const values = { ...draft.values };
    if (key && draft.parentId) values[key] = draft.parentId;

    startTransition(async () => {
      const res = await saveNode(draft.kind, values, draft.id);
      if (res.ok) { setDraft(null); setError(null); } else setError(res.error);
    });
  };

  const remove = (kind: EntityKind, id: string, label: string) => {
    if (!confirm(`Ștergi „${label}”? Se șterge și tot conținutul din interior.`)) return;
    startTransition(async () => {
      const res = await deleteNode(kind, id);
      if (!res.ok) setError(res.error);
    });
  };

  const move = (kind: EntityKind, id: string, dir: 'up' | 'down', parentId: string | null) =>
    startTransition(async () => {
      const res = await moveNode(kind, id, dir, parentId);
      if (!res.ok) setError(res.error);
    });

  const set = (field: string, value: string) =>
    setDraft((d) => (d ? { ...d, values: { ...d.values, [field]: value } } : d));

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-[#F2D4D0] bg-[#FDF3F2] px-4 py-2.5 text-sm text-[#C0392B]">{error}</p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => startCreate('platform', null)}>
          <Plus size={16} /> Adaugă platformă
        </Button>
      </div>

      {tree.length === 0 && (
        <EmptyState
          title="Nu există încă nicio platformă. Începe cu una — de exemplu Python sau Roblox Studio."
          action={<Button onClick={() => startCreate('platform', null)}><Plus size={16} /> Adaugă platformă</Button>}
        />
      )}

      {tree.map((platform, pi) => (
        <Card key={platform.id} className="overflow-hidden">
          {/* Spina colorată = identitatea platformei, purtată apoi prin tot arborele */}
          <div className="flex items-start gap-3 border-l-4 px-4 py-4" style={{ borderColor: platform.accent }}>
            <button onClick={() => toggle(platform.id)} className="mt-0.5 text-lock hover:text-ink" aria-label="Extinde">
              {open.has(platform.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold">{platform.name}</h2>
                <Badge>{platform.courses.length} cursuri</Badge>
              </div>
              {platform.description && <p className="mt-0.5 text-sm text-ink/55">{platform.description}</p>}
            </div>

            <RowActions
              onAdd={() => startCreate('course', platform.id)}
              addLabel="Curs"
              onEdit={() => startEdit('platform', platform.id, null, {
                name: platform.name, description: platform.description ?? '', accent: platform.accent,
              })}
              onUp={pi > 0 ? () => move('platform', platform.id, 'up', null) : undefined}
              onDown={pi < tree.length - 1 ? () => move('platform', platform.id, 'down', null) : undefined}
              onDelete={() => remove('platform', platform.id, platform.name)}
              disabled={pending}
            />
          </div>

          {open.has(platform.id) && (
            <div className="space-y-3 border-t border-line bg-slate-25 px-5 py-4">
              {platform.courses.length === 0 && (
                <EmptyState title="Platforma nu are cursuri."
                  action={<Button size="sm" variant="outline" onClick={() => startCreate('course', platform.id)}><Plus size={14} /> Adaugă curs</Button>} />
              )}

              {platform.courses.map((course, ci) => (
                <div key={course.id} className="rail">
                  <span className="rail-dot" style={{ background: platform.accent }} />
                  <div className="flex items-start gap-2">
                    <button onClick={() => toggle(course.id)} className="mt-0.5 text-lock hover:text-ink" aria-label="Extinde">
                      {open.has(course.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{course.title}</p>
                      {course.description && <p className="text-[13px] text-ink/50">{course.description}</p>}
                    </div>
                    <RowActions
                      onAdd={() => startCreate('module', course.id)}
                      addLabel="Modul"
                      onEdit={() => startEdit('course', course.id, platform.id, {
                        title: course.title, description: course.description ?? '',
                      })}
                      onUp={ci > 0 ? () => move('course', course.id, 'up', platform.id) : undefined}
                      onDown={ci < platform.courses.length - 1 ? () => move('course', course.id, 'down', platform.id) : undefined}
                      onDelete={() => remove('course', course.id, course.title)}
                      disabled={pending}
                    />
                  </div>

                  {open.has(course.id) && (
                    <div className="mt-3 space-y-2 pl-6">
                      {course.modules.length === 0 && (
                        <EmptyState title="Cursul nu are module."
                          action={<Button size="sm" variant="outline" onClick={() => startCreate('module', course.id)}><Plus size={14} /> Adaugă modul</Button>} />
                      )}

                      {course.modules.map((mod, mi) => (
                        <div key={mod.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <button onClick={() => toggle(mod.id)} className="mt-0.5 text-lock hover:text-ink" aria-label="Extinde">
                              {open.has(mod.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2 text-[15px] font-medium">
                                <span className="tag">M{mi + 1}</span> {mod.title}
                              </p>
                              {mod.description && <p className="text-[13px] text-ink/50">{mod.description}</p>}
                            </div>
                            <RowActions
                              onAdd={() => startCreate('lesson', mod.id)}
                              addLabel="Lecție"
                              onEdit={() => startEdit('module', mod.id, course.id, {
                                title: mod.title, description: mod.description ?? '',
                              })}
                              onUp={mi > 0 ? () => move('module', mod.id, 'up', course.id) : undefined}
                              onDown={mi < course.modules.length - 1 ? () => move('module', mod.id, 'down', course.id) : undefined}
                              onDelete={() => remove('module', mod.id, mod.title)}
                              disabled={pending}
                            />
                          </div>

                          {open.has(mod.id) && (
                            <ul className="mt-2 space-y-1 border-t border-line pt-2">
                              {mod.lessons.length === 0 && (
                                <li className="px-1 py-2 text-[13px] text-lock">Modulul nu are lecții.</li>
                              )}
                              {mod.lessons.map((lesson, li) => (
                                <li key={lesson.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-slate-25">
                                  <PlayCircle size={15} className="shrink-0 text-lock" />
                                  <span className="tag w-8 shrink-0">L{li + 1}</span>
                                  <span className="min-w-0 flex-1 truncate text-sm">{lesson.title}</span>
                                  <RowActions
                                    onEdit={() => startEdit('lesson', lesson.id, mod.id)}
                                    onUp={li > 0 ? () => move('lesson', lesson.id, 'up', mod.id) : undefined}
                                    onDown={li < mod.lessons.length - 1 ? () => move('lesson', lesson.id, 'down', mod.id) : undefined}
                                    onDelete={() => remove('lesson', lesson.id, lesson.title)}
                                    disabled={pending}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {/* ------------------------------------------------ formular creare/editare */}
      <Modal
        open={!!draft}
        onClose={() => { setDraft(null); setError(null); }}
        wide={draft?.kind === 'lesson'}
        title={draft ? `${draft.id ? 'Editează' : 'Adaugă'} ${TITLES[draft.kind]}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>Renunță</Button>
            <Button onClick={submit} disabled={pending}>{pending ? 'Se salvează…' : 'Salvează'}</Button>
          </>
        }
      >
        {draft?.kind === 'platform' && (
          <>
            <Field label="Numele platformei">
              <Input value={draft.values.name} onChange={(e) => set('name', e.target.value)} placeholder="ex: Roblox Studio" autoFocus />
            </Field>
            <Field label="Descriere scurtă">
              <Textarea rows={2} value={draft.values.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Culoare de identitate" hint="Se vede pe toate cursurile și modulele platformei.">
              <div className="flex gap-2">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" onClick={() => set('accent', c)}
                    aria-label={`Culoare ${c}`}
                    className={`h-8 w-8 rounded-lg border-2 transition ${draft.values.accent === c ? 'border-ink' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </Field>
          </>
        )}

        {(draft?.kind === 'course' || draft?.kind === 'module') && (
          <>
            <Field label={draft.kind === 'course' ? 'Titlul cursului' : 'Titlul modulului'}>
              <Input value={draft.values.title} onChange={(e) => set('title', e.target.value)}
                placeholder={draft.kind === 'course' ? 'ex: Alfabetizare / Primii pași în lumi 3D' : 'ex: Modulul 1 / Orientare în spațiu 3D'} autoFocus />
            </Field>
            <Field label="Descriere">
              <Textarea rows={3} value={draft.values.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </>
        )}

        {draft?.kind === 'lesson' && (
          <>
            <Field label="Titlul lecției">
              <Input value={draft.values.title} onChange={(e) => set('title', e.target.value)} placeholder="ex: Lecția 1: Primul meu proiect" autoFocus />
            </Field>
            <Field label="Obiectivul lecției" hint="Ce știe copilul să facă la final.">
              <Textarea rows={3} value={draft.values.objective} onChange={(e) => set('objective', e.target.value)} />
            </Field>
            <Field label="Video explicativ" hint="Link YouTube sau Vimeo — se afișează integrat în pagină.">
              <Input value={draft.values.video_url} onChange={(e) => set('video_url', e.target.value)} placeholder="https://youtube.com/watch?v=…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Proiect profesor">
                <Input value={draft.values.teacher_project_url} onChange={(e) => set('teacher_project_url', e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Proiect copil">
                <Input value={draft.values.student_project_url} onChange={(e) => set('student_project_url', e.target.value)} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Observații importante">
              <Textarea rows={3} value={draft.values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Instrucțiuni pentru clasă, capcane frecvente…" />
            </Field>
            <Field label="Temă pentru acasă">
              <Textarea rows={3} value={draft.values.homework} onChange={(e) => set('homework', e.target.value)} />
            </Field>
            <Field label="Link pentru temă">
              <Input value={draft.values.homework_url} onChange={(e) => set('homework_url', e.target.value)} placeholder="https://…" />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}

function RowActions({
  onAdd, addLabel, onEdit, onUp, onDown, onDelete, disabled,
}: {
  onAdd?: () => void; addLabel?: string; onEdit: () => void;
  onUp?: () => void; onDown?: () => void; onDelete: () => void; disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {onAdd && (
        <Button size="sm" variant="outline" onClick={onAdd} disabled={disabled} className="mr-1">
          <Plus size={14} /> {addLabel}
        </Button>
      )}
      <IconBtn onClick={onUp} disabled={disabled || !onUp} label="Mută mai sus"><ArrowUp size={15} /></IconBtn>
      <IconBtn onClick={onDown} disabled={disabled || !onDown} label="Mută mai jos"><ArrowDown size={15} /></IconBtn>
      <IconBtn onClick={onEdit} disabled={disabled} label="Editează"><Pencil size={15} /></IconBtn>
      <IconBtn onClick={onDelete} disabled={disabled} label="Șterge" danger><Trash2 size={15} /></IconBtn>
    </div>
  );
}

function IconBtn({
  children, onClick, disabled, label, danger,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; label: string; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={`rounded-lg p-1.5 transition disabled:opacity-25
        ${danger ? 'text-lock hover:bg-[#FDF3F2] hover:text-[#C0392B]' : 'text-lock hover:bg-slate-150 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}
