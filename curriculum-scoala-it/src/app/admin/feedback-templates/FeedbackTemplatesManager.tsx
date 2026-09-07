'use client';
import { useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, Pencil, Save, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Textarea } from '@/components/ui';
import { updateFeedbackTemplate } from '@/app/admin/actions';
import { COURSES, DIPLOMA_MODULES } from '@/lib/diplomas';
import type { FeedbackTemplate } from '@/lib/types';

/**
 * Acordeon Curs -> Modul -> cele 3 variante de mesaj (vezi pagina "Șabloane Feedback").
 * Editarea e optimistă: textul nou apare instant în listă la "Salvează", înainte ca
 * server action-ul (updateFeedbackTemplate) să confirme - dacă scrierea eșuează (rețea,
 * sesiune expirată), textul vechi e restaurat și eroarea afișată deasupra acordeonului.
 */
export default function FeedbackTemplatesManager({ templates }: { templates: FeedbackTemplate[] }) {
  const [items, setItems] = useState(templates);
  const [openCourses, setOpenCourses] = useState<Set<string>>(new Set());
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleCourse = (id: string) =>
    setOpenCourses((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleModule = (key: string) =>
    setOpenModules((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const startEdit = (t: FeedbackTemplate) => {
    setEditingId(t.id);
    setDraft(t.message_text);
    setError(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const save = (t: FeedbackTemplate) => {
    const text = draft.trim();
    if (!text) {
      setError('Textul nu poate fi gol.');
      return;
    }
    const previous = t.message_text;
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, message_text: text } : x)));
    setEditingId(null);
    setError(null);
    startTransition(async () => {
      const res = await updateFeedbackTemplate(t.id, text);
      if (!res.ok) {
        // Rollback (aparare in adancime): scrierea a esuat, revenim la textul anterior in loc
        // sa lasam UI-ul sa "minta" ca modificarea a fost salvata.
        setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, message_text: previous } : x)));
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 px-4 py-2.5 text-sm text-[#FF6B6B]">
          {error}
        </p>
      )}

      {COURSES.map((course) => {
        const courseTemplates = items.filter((t) => t.course_id === course.id);
        const open = openCourses.has(course.id);
        return (
          <Card key={course.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCourse(course.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-slate-25"
            >
              <span className="flex items-center gap-3">
                <span className="text-lock">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
                <span className="font-display text-lg font-semibold">{course.label}</span>
              </span>
              <Badge>{DIPLOMA_MODULES.length} module</Badge>
            </button>

            {open && (
              <div className="space-y-2 border-t border-line bg-slate-25 px-4 py-4">
                {DIPLOMA_MODULES.map((moduleNumber) => {
                  const moduleKey = `${course.id}-${moduleNumber}`;
                  const variants = courseTemplates
                    .filter((t) => t.module_number === moduleNumber)
                    .sort((a, b) => a.variant_index - b.variant_index);
                  const moduleOpen = openModules.has(moduleKey);
                  return (
                    <div key={moduleKey} className="glass rounded-xl border border-line px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleModule(moduleKey)}
                        aria-expanded={moduleOpen}
                        className="flex w-full items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-lock">
                            {moduleOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <span className="text-[15px] font-medium">Modulul {moduleNumber}</span>
                        </span>
                        <Badge tone="brand">{variants.length} variante</Badge>
                      </button>

                      {moduleOpen && (
                        <div className="mt-3 space-y-3 border-t border-line pt-3">
                          {variants.length === 0 && (
                            <EmptyState title="Niciun șablon încă pentru acest modul — rulează migrarea add_feedback_templates.sql." />
                          )}
                          {variants.map((t) => (
                            <div key={t.id} className="rounded-lg border border-line bg-black/20 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-[12px] font-semibold uppercase tracking-wide text-lock">
                                  Varianta {t.variant_index + 1}
                                </span>
                                {editingId !== t.id && (
                                  <Button size="sm" variant="outline" onClick={() => startEdit(t)}>
                                    <Pencil size={13} /> Editează
                                  </Button>
                                )}
                              </div>

                              {editingId === t.id ? (
                                <div className="space-y-2">
                                  <Textarea rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={pending}>
                                      <X size={13} /> Anulează
                                    </Button>
                                    <Button size="sm" onClick={() => save(t)} disabled={pending}>
                                      <Save size={13} /> Salvează
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{t.message_text}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
