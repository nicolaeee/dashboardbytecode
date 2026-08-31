'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COURSES, DIPLOMA_MODULES, diplomaTemplateUrl, getCourse, starsForModule, todayFormatted } from '@/lib/diplomas';
import { computeModuleLesson } from '@/lib/lessonNumbering';
import { DIPLOMA_REWARD_TYPES, type CourseId } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { Modal, Button, Field, Textarea } from '@/components/ui';
import type { DiplomaGroupWithStudents } from './page';

/**
 * Pasul de dupa "Genereaza" - cere confirmarea recompensei, identic pentru ambele moduri.
 * - "Din grupa" (studentId != null): trimite automat task-ul catre admin (RPC
 *   finalize_diploma_with_reward) - nu se deschide/descarca nimic aici.
 * - "Manual" (studentId == null, elev fara cont in DB): nu exista niciun student_id de care sa
 *   legam un task pentru admin, deci la "Finalizează" se deschide direct sablonul diplomei
 *   intr-un tab nou (manualStars/manualTotalStars, capturate din formular la "Genereaza" -
 *   RPC-ul real reciteste stelutele din DB pentru un elev real, dar unul manual nu exista acolo).
 */
type FinalizeStep = {
  studentId: string | null; studentName: string; module: number;
  manualStars?: number; manualTotalStars?: number;
};

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

  // BRESA DE NAVIGARE REPARATA: "/diplome" e ascuns intentionat din meniul profesorului (vezi
  // (teacher)/layout.tsx) - accesibil DOAR prin link-ul ghidat din "🚨 Task-uri Urgente"
  // (?studentId=...), niciodata ca sectiune libera de navigat. Un profesor (non-admin) care
  // ajunge aici FARA acel studentId - fie scriind /diplome direct in bara de adrese, fie
  // (cazul raportat) apasand "X"/"Anuleaza" pe modalul deschis din task, ceea ce il lasa pe
  // grila goala de cursuri - trebuie redirectionat instant inapoi la Progress Tracker. Adminul
  // ramane neafectat - el foloseste /diplome si liber, pentru generare ad-hoc (vezi layout-ul).
  useEffect(() => {
    if (!isAdmin && !initialStudentId) router.replace('/progress');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Odata ce grupele profesorului corect sunt incarcate, gasim elevul dupa initialStudentId
  // si deschidem direct modalul pe cursul/grupa/elevul/MODULUL lui.
  //
  // BUG REPARAT (raportat pentru mai multi profesori, ex. Daniel Tăbăcaru): modulul era
  // INTOTDEAUNA precompletat cu 1, indiferent de pragul real aflat in asteptare
  // (pending_diploma_milestone). Pentru al doilea/al treilea modul al unui elev, profesorul nu
  // observa (restul formularului - elev, curs, grupa - era deja corect completat) si genera din
  // greseala diploma pentru Modulul 1. finalize_diploma_with_reward (RPC) goleste
  // pending_diploma_milestone STRICT cand p_module*16 == pragul real - la o nepotrivire, taskul
  // "🚨 Diplomă necesară" din Task-uri Urgente ramanea agatat la nesfarsit, desi o diploma
  // (gresita) tocmai fusese generata si trimisa. Acum modulul se deduce din pragul real (vezi
  // computeModuleLesson), nu mai e niciodata ghicit.
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
        setSelectedModule(
          student.pending_diploma_milestone
            // Clampat la ultimul modul cu sablon de diploma (DIPLOMA_MODULES, momentan 1-4) -
            // un elev putea avansa in Tracker peste modulul 4 (module_count merge pana la 30),
            // dar nu exista sablon de diploma dincolo de 4, deci precompletarea nu trebuie sa
            // aleaga un modul inexistent in dropdown.
            ? Math.min(computeModuleLesson(student.pending_diploma_milestone).module, Math.max(...DIPLOMA_MODULES))
            : 1
        );
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

  // BUG REPARAT (raportat pentru Daniel Tăbăcaru, la 3 elevi diferiti): pragul de mai jos
  // (finalize_diploma_with_reward, RPC) goleste pending_diploma_milestone STRICT cand
  // p_module*16 == pragul real al elevului. Fixul anterior acoperea DOAR intrarea din link-ul
  // "🎓 Genereaza Diploma" (Task-uri Urgente -> initialStudentId) - dar un profesor care alege
  // "Din grupă" direct din grila de cursuri (fara sa vina dintr-un task) sau care schimba
  // manual Grupa/Elevul din dropdown-uri, gasea mereu Modulul precompletat/ramas la 1 (sau la
  // valoarea elevului anterior selectat) si il trimitea nemodificat - diploma se genera, dar
  // pentru modulul gresit, iar taskul "🚨 Diplomă necesară" ramanea agatat la nesfarsit. Acum
  // orice selectare a unui elev REAL (indiferent de cale) recalculeaza automat Modulul din
  // pragul lui real - profesorul poate in continuare sa il schimbe manual daca chiar vrea sa
  // regenereze o diploma pentru un modul anterior.
  function moduleForStudent(student: { pending_diploma_milestone: number | null } | undefined | null): number {
    if (!student?.pending_diploma_milestone) return 1;
    return Math.min(computeModuleLesson(student.pending_diploma_milestone).module, Math.max(...DIPLOMA_MODULES));
  }

  function openModal(courseId: CourseId) {
    const matching = groups.filter((g) => g.course === courseId);
    const list = matching.length > 0 ? matching : groups;
    const firstStudent = list[0]?.students[0];
    setGeneratingCourse(courseId);
    setMode('group');
    setSelectedGroupId(list[0]?.id ?? '');
    setSelectedStudentId(firstStudent?.id ?? '');
    setManualName('');
    setManualStars(16);
    setSelectedModule(moduleForStudent(firstStudent));
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

    // Verificam ca sablonul chiar exista (curs custom fara sablon -> null) INAINTE sa continuam -
    // pentru niciunul dintre moduri nu se deschide/descarca nimic aici, doar la "Finalizează"
    // (pasul 2, identic pentru "Din grupă" si "Manual" - vezi handleFinalizeDiploma).
    const url = diplomaTemplateUrl(generatingCourse, selectedModule);
    if (!url) return;

    setRewardReceived(null);
    setRewardType('');
    setRewardDetails('');
    setFinalizeError(null);
    setFinalizeStep(
      realStudentId
        ? { studentId: realStudentId, studentName, module: selectedModule }
        : { studentId: null, studentName, module: selectedModule, manualStars: stars, manualTotalStars: totalStars }
    );
  }

  function closeModal() {
    if (finalizing) return;
    // BRESA DE NAVIGARE REPARATA: inchiderea modalului ("X"/"Anulează") FARA sa fi finalizat NU
    // trebuie sa lase profesorul (non-admin) pe /diplome gol (grila mare de cursuri) - o pagina
    // la care nu ar trebui sa aiba acces liber deloc (vezi (teacher)/layout.tsx si efectul de
    // mai sus, care acopera si accesul direct pe URL). Il trimitem inapoi la Task-uri Urgente,
    // de unde a pornit. Adminul ramane neafectat - inchide modalul normal, ramane pe /diplome.
    if (!isAdmin && initialStudentId) {
      router.replace(initialTeacherId ? `/progress?teacherId=${initialTeacherId}` : '/progress');
      return;
    }
    setGeneratingCourse(null);
    setFinalizeStep(null);
  }

  // "Finalizeaza generarea diplomei" - vezi validarea din sectiunea 10 a cerintei: DA cere
  // tip + detalii, NU nu cere nimic. RPC-ul reciteste el insusi numele elevului/cursul din DB
  // (nu le trimitem din client) pentru mesajul catre parinte, si creeaza automat un al doilea
  // task, separat, pentru admin ("🪙 Trimite monedele virtuale") doar cand recompensa e bani
  // virtuali.
  async function handleFinalizeDiploma() {
    if (!finalizeStep || !generatingCourse) return;
    if (rewardReceived === null) { setFinalizeError('Alege dacă a câștigat un premiu.'); return; }
    if (rewardReceived && (!rewardType || !rewardDetails.trim())) {
      setFinalizeError('Alege tipul de premiu și completează detaliile.');
      return;
    }
    setFinalizeError(null);

    const studentId = finalizeStep.studentId;
    if (studentId === null) {
      // Mod Manual: elevul nu exista in DB, deci nu exista niciun student_id de care sa legam
      // un RPC/task pentru admin - raspunsul despre premiu ramane doar informativ in acest flux
      // (simetric cu "Din grupă" ca experienta), iar profesorul deschide chiar el sablonul
      // diplomei, precompletat cu ce a introdus la pasul 1.
      const url = diplomaTemplateUrl(generatingCourse, finalizeStep.module);
      if (url) {
        const params = new URLSearchParams({
          elev: finalizeStep.studentName,
          profesor: viewerName,
          curs: `Modulul ${finalizeStep.module} - ${course?.label ?? ''}`,
          data: todayFormatted(),
          stelute: String(finalizeStep.manualStars ?? 0),
          totalStelute: String(finalizeStep.manualTotalStars ?? 0),
        });
        window.open(`${url}?${params.toString()}`, '_blank');
      }
      setFinalizeStep(null);
      setGeneratingCourse(null);
      // BRESA DE NAVIGARE REPARATA: identic cu modul "Din grupă" (vezi mai jos) - un profesor
      // non-admin nu trebuie lasat pe /diplome gol dupa ce a terminat, se intoarce la Task-uri
      // Urgente. Fara flag "diplomaSent" aici - taskul deschis (initialStudentId) e al elevului
      // real din urgent task, nu al acestei diplome manuale separate, deci nu se inchide nimic.
      if (!isAdmin) router.replace(initialTeacherId ? `/progress?teacherId=${initialTeacherId}` : '/progress');
      return;
    }

    setFinalizing(true);
    const { error } = await supabase.rpc('finalize_diploma_with_reward', {
      p_student_id: studentId,
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
        body: JSON.stringify({ studentId, milestone: finalizeStep.module * 16, status: 'completed' }),
      });
    } catch (alertError) {
      console.error('DIPLOMA MILESTONE ALERT ERROR:', alertError);
    }
    // Daca profesorul a ajuns aici din "🚨 Task-uri Urgente" (Progress Tracker → "🎓 Genereaza
    // Diploma"), taskul respectiv tocmai s-a inchis in DB (RPC-ul de mai sus a golit
    // pending_diploma_milestone) - il trimitem direct inapoi acolo, ca sa vada instant lista
    // fara acel task, in loc sa ramana pe /diplome nestiind daca actiunea a avut efect si sa
    // riste sa apese din nou. Generarea "ad-hoc" (din grila de cursuri, fara task de pornit)
    // ramane pe loc, ca inainte - profesorul poate genera diplome pentru mai multi elevi la rand.
    const cameFromUrgentTask = studentId === initialStudentId;
    setFinalizeStep(null);
    setGeneratingCourse(null);
    // BUG REPARAT: cardul din Task-uri Urgente nu disparea la revenire, pentru ca router.push()
    // pornea navigarea (si putea rezolva din Client Router Cache-ul Next.js, care tine
    // instantanee "stale" ale rutelor vizitate recent) INAINTE ca router.refresh() de mai jos sa
    // apuce sa invalideze acel cache - profesorul se intorcea pe /progress cu acelasi instantaneu
    // vechi, dinainte de finalizare. Invalidam cache-ul INTAI, apoi navigam - push() foloseste
    // astfel garantat datele proaspete din DB (pending_diploma_milestone deja golit de RPC).
    router.refresh();
    if (cameFromUrgentTask) {
      // Flag citit o singura data de ProgressTracker la sosire, ca sa arate explicit
      // "Diplomă generată cu succes!" - lista de Task-uri Urgente insasi se corecteaza automat
      // din props-urile proaspete (vezi efectul de resincronizare din ProgressTracker.tsx).
      router.push(`/progress?${new URLSearchParams({ ...(initialTeacherId ? { teacherId: initialTeacherId } : {}), diplomaSent: '1' }).toString()}`);
    } else if (!isAdmin) {
      // BRESA DE NAVIGARE: si un profesor (non-admin) care a schimbat manual Elevul din
      // dropdown (deci a generat pentru un ALT elev decat cel din task-ul de pornire) tot nu
      // trebuie lasat pe /diplome gol - aceeasi regula ca la modul Manual mai sus si la
      // closeModal(). Fara flag "diplomaSent" - niciun task specific din lista initiala nu s-a
      // inchis, deci nu declansam acel toast.
      router.push(initialTeacherId ? `/progress?teacherId=${initialTeacherId}` : '/progress');
    }
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
              {finalizeStep.studentId ? (
                <>Diploma pentru <span className="font-semibold text-ink">{finalizeStep.studentName}</span> e pregătită - nu trebuie să o descarci.
                Confirmă recompensa și finalizează, ca administratorul să o poată descărca și trimite mai departe.</>
              ) : (
                <>Diploma pentru <span className="font-semibold text-ink">{finalizeStep.studentName}</span> e gata de generat.
                Confirmă recompensa și finalizează - se deschide șablonul diplomei într-un tab nou, gata de descărcat sau trimis.</>
              )}
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
                      setSelectedModule(moduleForStudent(g?.students[0]));
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
                    onChange={(e) => {
                      setSelectedStudentId(e.target.value);
                      setSelectedModule(moduleForStudent(selectedGroup?.students.find((s) => s.id === e.target.value)));
                    }}
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
          Următorul pas îți cere să confirmi dacă elevul a câștigat un premiu, înainte de finalizare.
        </p>
          </>
        )}
      </Modal>
    </div>
  );
}
