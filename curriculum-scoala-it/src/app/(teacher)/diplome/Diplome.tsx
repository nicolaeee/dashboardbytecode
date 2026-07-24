'use client';
import { useEffect, useMemo, useState } from 'react';
import { COURSES, DIPLOMA_MODULES, diplomaTemplateUrl, getCourse, starsForModule, todayFormatted } from '@/lib/diplomas';
import type { CourseId } from '@/lib/types';
import { Modal, Button, Field } from '@/components/ui';
import type { DiplomaGroupWithStudents } from './page';

type TeacherOption = { id: string; label: string };

// Cardurile afisate in grid, in ordinea si cu iconitele cerute. "Delighted" nu are card aici
// (nu a fost cerut explicit in grid), dar ramane disponibil ca fallback in alerta de diplome.
const GRID_COURSES: { id: CourseId; emoji: string }[] = [
  { id: 'alfabetizare', emoji: '📖' },
  { id: 'coblocks', emoji: '🧩' },
  { id: 'python', emoji: '🐍' },
  { id: 'roblox', emoji: '🎮' },
  { id: 'unity', emoji: '🕹️' },
];

export default function Diplome({
  viewerId, viewerName, isAdmin, teacherOptions, initialGroups,
}: {
  viewerId: string; viewerName: string; isAdmin: boolean;
  teacherOptions: TeacherOption[]; initialGroups: DiplomaGroupWithStudents[];
}) {
  const [selectedTeacherId, setSelectedTeacherId] = useState(viewerId);
  const [groups, setGroups] = useState<DiplomaGroupWithStudents[]>(initialGroups);
  const [loading, setLoading] = useState(false);

  const [generatingCourse, setGeneratingCourse] = useState<CourseId | null>(null);
  const [mode, setMode] = useState<'group' | 'manual'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualStars, setManualStars] = useState(16);
  const [selectedModule, setSelectedModule] = useState(1);

  useEffect(() => {
    if (selectedTeacherId === viewerId) { setGroups(initialGroups); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/diploma-groups?teacherId=${selectedTeacherId}`)
      .then((r) => r.json())
      .then((data: { groups: DiplomaGroupWithStudents[] }) => { if (!cancelled) setGroups(data.groups ?? []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTeacherId, viewerId, initialGroups]);

  const course = generatingCourse ? getCourse(generatingCourse) : null;
  const relevantGroups = useMemo(() => {
    if (!generatingCourse) return [];
    const matching = groups.filter((g) => g.course === generatingCourse);
    return matching.length > 0 ? matching : groups;
  }, [groups, generatingCourse]);
  const usingFallbackGroups = generatingCourse && relevantGroups.length > 0 && relevantGroups[0]?.course !== generatingCourse;
  const selectedGroup = relevantGroups.find((g) => g.id === selectedGroupId) ?? null;

  function openModal(courseId: CourseId) {
    const matching = groups.filter((g) => g.course === courseId);
    const list = matching.length > 0 ? matching : groups;
    setGeneratingCourse(courseId);
    setMode('group');
    setSelectedGroupId(list[0]?.id ?? '');
    setSelectedStudentId(list[0]?.students[0]?.id ?? '');
    setManualName('');
    setManualStars(16);
    setSelectedModule(1);
  }

  function handleGenerate() {
    if (!generatingCourse) return;
    let studentName: string;
    let stars: number;

    if (mode === 'group') {
      const student = selectedGroup?.students.find((s) => s.id === selectedStudentId);
      if (!student) return;
      studentName = student.name;
      stars = starsForModule(student.progress);
    } else {
      studentName = manualName.trim();
      if (!studentName) return;
      stars = Math.max(0, Math.min(16, Math.round(manualStars)));
    }

    const url = diplomaTemplateUrl(generatingCourse, selectedModule);
    if (!url) return;
    const params = new URLSearchParams({
      elev: studentName,
      profesor: viewerName,
      curs: `Modulul ${selectedModule} - ${course?.label ?? ''}`,
      data: todayFormatted(),
      stelute: String(stars),
    });
    window.open(`${url}?${params.toString()}`, '_blank');
    setGeneratingCourse(null);
  }

  const canGenerate = mode === 'group' ? !!selectedStudentId : manualName.trim().length > 0;

  return (
    <div className="tracker-root -mx-5 -my-7 lg:-mx-10 lg:-my-9 min-h-screen bg-black text-white">
      <header className="glass sticky top-0 z-40 px-4 py-4 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">🎓 Diplome</h1>
            <p className="text-xs text-gray-400 mt-0.5">Generare manuală, oricând — alege cursul, elevul și modulul.</p>
          </div>
          {isAdmin && (
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value={viewerId} className="bg-gray-900 text-white">Eu (propriile grupe)</option>
              {teacherOptions.filter((t) => t.id !== viewerId).map((t) => (
                <option key={t.id} value={t.id} className="bg-gray-900 text-white">{t.label}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full p-4">
        {loading ? (
          <div className="flex justify-center py-16"><div className="tracker-spinner" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {GRID_COURSES.map((c) => {
              const meta = getCourse(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => openModal(c.id)}
                  className="bg-gray-900 border border-gray-700 hover:border-[#C8F023] rounded-3xl p-6 tracker-card-shadow flex flex-col items-center gap-3 text-center transition-colors"
                >
                  <span className="text-5xl">{c.emoji}</span>
                  <span className="font-bold text-sm">{meta?.label}</span>
                  <span className="text-[11px] text-gray-500">Generează diplomă</span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <Modal
        open={!!generatingCourse}
        onClose={() => setGeneratingCourse(null)}
        title={`🎓 Generează diplomă — ${course?.label ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setGeneratingCourse(null)}>Anulează</Button>
            <Button onClick={handleGenerate} disabled={!canGenerate}>Generează</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant={mode === 'group' ? 'primary' : 'outline'} onClick={() => setMode('group')}>
            Din grupă
          </Button>
          <Button type="button" size="sm" variant={mode === 'manual' ? 'primary' : 'outline'} onClick={() => setMode('manual')}>
            Manual
          </Button>
        </div>

        {mode === 'group' ? (
          <>
            {groups.length === 0 ? (
              <p className="text-sm text-lock">Nicio grupă găsită. Adaugă una din Progress Tracker sau completează manual.</p>
            ) : (
              <>
                {usingFallbackGroups && (
                  <p className="text-xs text-lock">
                    Nicio grupă nu are cursul „{course?.label}” setat — alege manual grupa potrivită mai jos (sau setează cursul din Progress Tracker → Editează Clasa).
                  </p>
                )}
                <Field label="Grupă">
                  <select
                    value={selectedGroupId}
                    onChange={(e) => {
                      const g = relevantGroups.find((rg) => rg.id === e.target.value);
                      setSelectedGroupId(e.target.value);
                      setSelectedStudentId(g?.students[0]?.id ?? '');
                    }}
                    className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
                  >
                    {relevantGroups.map((g) => (
                      <option key={g.id} value={g.id} className="bg-night text-ink">{g.group_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Elev">
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
                  >
                    {(selectedGroup?.students.length ?? 0) === 0 && <option value="" className="bg-night text-ink">Niciun elev în grupă</option>}
                    {selectedGroup?.students.map((s) => (
                      <option key={s.id} value={s.id} className="bg-night text-ink">
                        {s.name} — {starsForModule(s.progress)} din 16 steluțe
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </>
        ) : (
          <>
            <Field label="Numele elevului">
              <input
                type="text" value={manualName} onChange={(e) => setManualName(e.target.value)}
                placeholder="Nume elev" className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink placeholder:text-lock/70"
              />
            </Field>
            <Field label="Steluțe colectate (0-16)">
              <input
                type="number" min={0} max={16} value={manualStars}
                onChange={(e) => setManualStars(Number(e.target.value))}
                className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
              />
            </Field>
          </>
        )}

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
          profesorul, modulul și steluțele alese.
        </p>
      </Modal>
    </div>
  );
}
