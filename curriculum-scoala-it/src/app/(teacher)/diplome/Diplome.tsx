'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COURSES, DIPLOMA_MODULES, diplomaTemplateUrl, getCourse, starsForModule, todayFormatted } from '@/lib/diplomas';
import { DIPLOMA_REWARD_TYPES, type CourseId } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { Modal, Button, Field, Textarea } from '@/components/ui';
import type { DiplomaGroupWithStudents } from './page';

/** Pasul de dupa "Genereaza" pentru un elev real (mod "Din grupa") - cere confirmarea
 * recompensei si trimite automat task-ul catre admin (vezi finalize_diploma_with_reward).
 * Modul "Manual" (fara elev in DB) nu ajunge niciodata in acest pas - se inchide direct,
 * ca inainte, pentru ca nu exista un student_id de care sa legam un task. */
type FinalizeStep = { studentId: string; studentName: string; module: number };

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
  viewerId, viewerName, isAdmin, teacherOptions, initialGroups, initialStudentId, initialTeacherId,
}: {
  viewerId: string; viewerName: string; isAdmin: boolean;
  teacherOptions: TeacherOption[]; initialGroups: DiplomaGroupWithStudents[];
  // Pre-completare venita din Progress Tracker ("🎓 Genereaza Diploma" din Task-uri Urgente).
  initialStudentId: string | null; initialTeacherId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  // Folosit DOAR ca semnal de invalidare a Router Cache-ului Next.js dupa finalizarea unei
  // diplome (vezi handleFinalizeDiploma) - acelasi tipar ca in ProgressTracker.tsx, ca
  // navigarea inapoi la Progress Tracker sa arate imediat taskul inchis (pending_diploma_
  // milestone = null), nu un instantaneu cache-uit de dinainte de finalizare.
  const router = useRouter();
  const [selectedTeacherId, setSelectedTeacherId] = useState(viewerId);
  const [groups, setGroups] = useState<DiplomaGroupWithStudents[]>(initialGroups);
  const [loading, setLoading] = useState(false);
  // Aplicam pre-completarea o singura data - altfel orice schimbare ulterioara facuta manual
  // de profesor (alta grupa/elev) ar fi suprascrisa la fiecare re-render.
  const appliedPrefillRef = useRef(false);

  const [generatingCourse, setGeneratingCourse] = useState<CourseId | null>(null);
  const [mode, setMode] = useState<'group' | 'manual'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualStars, setManualStars] = useState(16);
  const [selectedModule, setSelectedModule] = useState(1);

  // Pasul 2 (dupa "Genereaza"): confirmarea recompensei si "Finalizeaza generarea diplomei" -
  // vezi FinalizeStep mai sus. null = inca pe formularul de generare (pasul 1).
  const [finalizeStep, setFinalizeStep] = useState<FinalizeStep | null>(null);
  const [rewardReceived, setRewardReceived] = useState<boolean | null>(null);
  const [rewardType, setRewardType] = useState('');
  const [rewardDetails, setRewardDetails] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

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

  // Daca venim din Progress Tracker cu un teacherId diferit (adminul rasfoia clasele altui
  // profesor), incarcam grupele acelui profesor - efectul de mai sus preia automat fetch-ul.
  useEffect(() => {
    if (isAdmin && initialTeacherId && initialTeacherId !== viewerId) setSelectedTeacherId(initialTeacherId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Odata ce grupele profesorului corect sunt incarcate, gasim elevul dupa initialStudentId
  // si deschidem direct modalul pe cursul/grupa/elevul lui - profesorul mai alege doar Modulul.
  useEffect(() => {
    if (appliedPrefillRef.current || loading || !initialStudentId) return;
    for (const g of groups) {
      const student = g.students.find((s) => s.id === initialStudentId);
      if (student && g.course) {
        appliedPrefillRef.current = true;
        setGeneratingCourse(g.course);
        setMode('group');
        setSelectedGroupId(g.id);
        setSelectedStudentId(student.id);
        setManualName(student.name);
        setManualStars(16);
        setSelectedModule(1);
        break;
      }
    }
  }, [groups, loading, initialStudentId]);

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
    let totalStars: number;
    let realStudentId: string | null = null;

    if (mode === 'group') {
      const student = selectedGroup?.students.find((s) => s.id === selectedStudentId);
      if (!student) return;
      studentName = student.name;
      stars = starsForModule(student.progress);
      totalStars = student.progress;
      realStudentId = student.id;
    } else {
      studentName = manualName.trim();
      if (!studentName) return;
      stars = Math.max(0, Math.min(16, Math.round(manualStars)));
      totalStars = stars;
    }

    // Verificam ca sablonul chiar exista (curs custom fara sablon -> null) INAINTE sa continuam,
    // exact ca inainte - doar ca acum, pentru un elev real, nu mai deschidem tab-ul aici.
    const url = diplomaTemplateUrl(generatingCourse, selectedModule);
    if (!url) return;

    if (realStudentId) {
      // Diploma unui elev real (mod "Din grupa") NU se deschide/descarca aici - profesorul nu
      // trebuie sa descarce nimic local (vezi cerinta). Trecem direct la pasul 2 - confirmarea
      // recompensei si "Finalizeaza generarea diplomei" (finalize_diploma_with_reward), care
      // trimite task-ul catre admin. Administratorul deschide/descarca diploma mai tarziu, din
      // Task-uri Urgente, reconstruind acelasi URL (curs+modul+elev+profesor+stelute+data).
      setRewardReceived(null);
      setRewardType('');
      setRewardDetails('');
      setFinalizeError(null);
      setFinalizeStep({ studentId: realStudentId, studentName, module: selectedModule });
    } else {
      // Modul "Manual" (fara elev in DB) ramane exact ca inainte - se deschide tab-ul cu
      // sablonul, nu exista un student_id de care sa legam un task pentru admin.
      const params = new URLSearchParams({
        elev: studentName,
        profesor: viewerName,
        curs: `Modulul ${selectedModule} - ${course?.label ?? ''}`,
        data: todayFormatted(),
        stelute: String(stars),
        totalStelute: String(totalStars),
      });
      window.open(`${url}?${params.toString()}`, '_blank');
      setGeneratingCourse(null);
    }
  }

  function closeModal() {
    if (finalizing) return;
    setGeneratingCourse(null);
    setFinalizeStep(null);
  }

  // "Finalizeaza generarea diplomei" - vezi validarea din sectiunea 10 a cerintei: DA cere
  // tip + detalii, NU nu cere nimic. RPC-ul reciteste el insusi numele elevului/cursul din DB
  // (nu le trimitem din client) pentru mesajul catre parinte, si creeaza automat un al doilea
  // task, separat, pentru admin ("🪙 Trimite monedele virtuale") doar cand recompensa e bani
  // virtuali.
  async function handleFinalizeDiploma() {
    if (!finalizeStep) return;
    if (rewardReceived === null) { setFinalizeError('Alege dacă a câștigat un premiu.'); return; }
    if (rewardReceived && (!rewardType || !rewardDetails.trim())) {
      setFinalizeError('Alege tipul de premiu și completează detaliile.');
      return;
    }
    setFinalizeError(null);
    setFinalizing(true);
    const { error } = await supabase.rpc('finalize_diploma_with_reward', {
      p_student_id: finalizeStep.studentId,
      p_module: finalizeStep.module,
      p_reward_received: rewardReceived,
      p_reward_type: rewardReceived ? rewardType : null,
      p_reward_details: rewardReceived ? rewardDetails.trim() : null,
      // Data locala a profesorului, inghetata pe diploma (vezi coloanele diploma_* din
      // urgent_tasks) - adminul o va vedea identic, indiferent cand deschide taskul.
      p_diploma_date: todayFormatted(),
    });
    setFinalizing(false);
    if (error) {
      console.error('FINALIZE DIPLOMA ERROR:', error);
      setFinalizeError('A apărut o eroare. Încearcă din nou.');
      return;
    }
    // Pastreaza alerta Pabbly existenta ("completed") - inainte se trimitea din butonul
    // "Am trimis diploma" (Progress Tracker), acum de aici, la finalizarea reala a diplomei.
    // Best-effort: daca da eroare, nu blocheaza fluxul (diploma e deja finalizata in DB).
    try {
      await fetch('/api/diploma-milestone-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: finalizeStep.studentId, milestone: finalizeStep.module * 16, status: 'completed' }),
      });
    } catch (alertError) {
      console.error('DIPLOMA MILESTONE ALERT ERROR:', alertError);
    }
    setFinalizeStep(null);
    setGeneratingCourse(null);
    // Invalideaza Router Cache-ul Next.js DUPA ce backend-ul a confirmat finalizarea (RPC-ul
    // de mai sus deja a inchis pending_diploma_milestone pentru acest prag, daca era exact
    // pragul deschis) - altfel, la revenirea pe Progress Tracker, "🚨 Task-uri Urgente" ar putea
    // arata inca vechiul instantaneu cache-uit, cu taskul de diploma inca deschis.
    router.refresh();
  }

  const canGenerate = mode === 'group' ? !!selectedStudentId : manualName.trim().length > 0;
  const canFinalize = rewardReceived !== null && (
    !rewardReceived
    || (!!rewardType && rewardDetails.trim().length > 0)
  );

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
        onClose={closeModal}
        title={finalizeStep ? '🎁 Recompensă & finalizare' : `🎓 Generează diplomă — ${course?.label ?? ''}`}
        footer={
          finalizeStep ? (
            <>
              <Button variant="outline" onClick={closeModal} disabled={finalizing}>Renunță</Button>
              <Button onClick={handleFinalizeDiploma} disabled={finalizing || !canFinalize}>
                {finalizing ? 'Se trimite...' : 'Finalizează generarea diplomei'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={closeModal}>Anulează</Button>
              <Button onClick={handleGenerate} disabled={!canGenerate}>Generează</Button>
            </>
          )
        }
      >
        {finalizeStep ? (
          <>
            <p className="text-sm text-lock">
              Diploma pentru <span className="font-semibold text-ink">{finalizeStep.studentName}</span> e pregătită - nu trebuie să o descarci.
              Confirmă recompensa și finalizează, ca administratorul să o poată descărca și trimite mai departe.
            </p>

            <Field label="A câștigat copilul un premiu?">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={rewardReceived === true ? 'primary' : 'outline'} onClick={() => setRewardReceived(true)}>
                  Da
                </Button>
                <Button type="button" size="sm" variant={rewardReceived === false ? 'primary' : 'outline'} onClick={() => setRewardReceived(false)}>
                  Nu
                </Button>
              </div>
            </Field>

            {rewardReceived && (
              <>
                <Field label="Ce tip de premiu a câștigat?">
                  <div className="grid grid-cols-2 gap-2">
                    {DIPLOMA_REWARD_TYPES.map((r) => (
                      <Button
                        key={r.id} type="button" size="sm" variant={rewardType === r.id ? 'primary' : 'outline'}
                        onClick={() => setRewardType(r.id)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field label="Detalii / Clarificare" hint="Scrie exact ce a câștigat copilul, ex: „500 Robux” sau „Superputerea de a controla timpul”.">
                  <Textarea
                    value={rewardDetails} onChange={(e) => setRewardDetails(e.target.value)} rows={3}
                    placeholder="Detalii premiu..."
                  />
                </Field>
              </>
            )}

            {finalizeError && <p className="text-xs text-[#FF6B6B]">{finalizeError}</p>}
          </>
        ) : (
          <>
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
                onWheel={(e) => e.currentTarget.blur()}
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
          </>
        )}
      </Modal>
    </div>
  );
}
