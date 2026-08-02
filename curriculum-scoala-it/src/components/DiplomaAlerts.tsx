'use client';
import { useEffect, useState } from 'react';
import { COURSES, diplomaTemplateUrl, getCourse, starsForModule, todayFormatted, DIPLOMA_MODULES } from '@/lib/diplomas';
import { useDiplomaGroupAlerts, completedModuleFor, type DiplomaGroupAlert } from '@/lib/useDiplomaGroupAlerts';
import type { CourseId, Profile } from '@/lib/types';
import { Modal, Button, Field } from './ui';

type DiplomaGroup = DiplomaGroupAlert;

/**
 * Alerta "trebuie sa trimiti diploma" - apare in coltul din stanga-jos al panoului ca o
 * iconita rosie compacta ce palpaie, exact cand o grupa atinge un NOU multiplu de 16 lectii
 * tinute total (16, 32, 48...). Click pe iconita -> lista clara cu fiecare grupa in parte;
 * click pe "Genereaza diploma" -> modal cu cursul auto-filtrat dupa grupa, dropdown de elev
 * (cu steluțele lui curente) si dropdown de modul; la generare se deschide sablonul HTML
 * curatat (fara feedback) intr-un tab nou, precompletat, si se marcheaza diploma trimisa.
 *
 * NEFOLOSIT in prezent (nu mai e montat in Shell.tsx) - continutul a fost centralizat in
 * "🚨 Task-uri Urgente" din ProgressTracker.tsx (vezi useDiplomaGroupAlerts, de unde vine
 * si acest widget). Lasat aici pentru referinta / eventuala reactivare ca widget separat.
 */
export default function DiplomaAlerts({ profile }: { profile: Profile }) {
  const { pending, markSent, busyId } = useDiplomaGroupAlerts(profile.id);
  const [open, setOpen] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<DiplomaGroup | null>(null);
  const [fallbackCourse, setFallbackCourse] = useState<CourseId | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedModule, setSelectedModule] = useState(1);

  useEffect(() => {
    if (pending.length === 0) setOpen(false);
  }, [pending.length]);

  function openGenerateModal(group: DiplomaGroup) {
    setFallbackCourse(null);
    setSelectedStudentId(group.students[0]?.id ?? '');
    setSelectedModule(completedModuleFor(group.lessonCount));
    setGeneratingFor(group);
  }

  function handleGenerate() {
    if (!generatingFor) return;
    const courseId = generatingFor.course ?? fallbackCourse;
    if (!courseId) return;
    const student = generatingFor.students.find((s) => s.id === selectedStudentId);
    if (!student) return;

    const url = diplomaTemplateUrl(courseId, selectedModule);
    if (!url) return;
    const course = getCourse(courseId);
    const params = new URLSearchParams({
      elev: student.name,
      profesor: profile.full_name || profile.email,
      curs: `Modulul ${selectedModule} - ${course?.label ?? ''}`,
      data: todayFormatted(),
      stelute: String(starsForModule(student.progress)),
      totalStelute: String(student.progress),
    });
    window.open(`${url}?${params.toString()}`, '_blank');

    const group = generatingFor;
    setGeneratingFor(null);
    markSent(group);
  }

  if (pending.length === 0) return null;

  const effectiveCourse = generatingFor ? (generatingFor.course ?? fallbackCourse) : null;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-[60] flex flex-col-reverse items-start gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Alerte diplome"
          title="Trebuie sa trimiti diploma pentru una sau mai multe grupe"
          className={`relative grid h-12 w-12 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/50 ring-2 ring-red-400/70 transition-transform hover:scale-105 ${open ? '' : 'animate-pulse'}`}
        >
          <span className="text-2xl font-black leading-none">!</span>
          {pending.length > 1 && (
            <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-red-600 text-[11px] font-bold ring-2 ring-red-600">
              {pending.length}
            </span>
          )}
        </button>

        {open && (
          <div className="flex flex-col gap-2 max-w-xs">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-red-400">
              🎓 Grupe ce necesită diplomă ({pending.length})
            </p>
            {pending.map((g) => (
              <div key={g.id} className="glass-strong rounded-2xl border border-line border-l-4 border-l-red-500 px-4 py-3 shadow-glow-sm">
                <p className="text-[13px] leading-snug text-white">
                  Grupa <span className="font-semibold text-brand-500">{g.group_name}</span> a ajuns la{' '}
                  <span className="font-semibold text-brand-500">M{completedModuleFor(g.lessonCount)} / L16</span> - trebuie să trimiți diploma
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openGenerateModal(g)}
                    className="rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-black transition hover:bg-brand-600"
                  >
                    🎓 Generează diploma
                  </button>
                  <button
                    onClick={() => markSent(g)}
                    disabled={busyId === g.id}
                    className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-white/70 transition hover:text-white disabled:opacity-50"
                  >
                    ✓ Marchează trimisă
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!generatingFor}
        onClose={() => setGeneratingFor(null)}
        title={`🎓 Generează diplomă — ${generatingFor?.group_name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setGeneratingFor(null)}>Anulează</Button>
            <Button onClick={handleGenerate} disabled={!effectiveCourse || !selectedStudentId}>
              Generează diploma
            </Button>
          </>
        }
      >
        {generatingFor && (
          <>
            {generatingFor.course ? (
              <p className="text-sm text-lock">
                Curs: <span className="font-semibold text-ink">{getCourse(generatingFor.course)?.label}</span> (dedus automat din grupă)
              </p>
            ) : (
              <Field label="Curs (grupa nu are un curs setat)" hint="Poți seta cursul permanent din Progress Tracker → Editează Clasa.">
                <div className="grid grid-cols-3 gap-2">
                  {COURSES.map((c) => (
                    <Button
                      key={c.id} type="button" size="sm"
                      variant={fallbackCourse === c.id ? 'primary' : 'outline'}
                      onClick={() => setFallbackCourse(c.id)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Elev">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
              >
                {generatingFor.students.length === 0 && <option value="" className="bg-night text-ink">Niciun elev în grupă</option>}
                {generatingFor.students.map((s) => (
                  <option key={s.id} value={s.id} className="bg-night text-ink">
                    {s.name} — {starsForModule(s.progress)} din 16 steluțe
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Modul">
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(Number(e.target.value))}
                className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
              >
                {DIPLOMA_MODULES.map((m) => (
                  <option key={m} value={m} className="bg-night text-ink">Modulul {m}</option>
                ))}
              </select>
            </Field>

            <p className="text-xs text-lock">
              Se deschide șablonul de diplomă (curățat, fără feedback) într-un tab nou, precompletat cu numele elevului,
              profesorul, modulul și steluțele curente. Grupa e marcată automat ca „diplomă trimisă”.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
