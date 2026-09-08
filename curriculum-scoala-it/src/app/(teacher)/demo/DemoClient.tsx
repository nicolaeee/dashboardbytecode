'use client';
import { useState } from 'react';
import { ClassView, ModalShell, GroupRecoveryFormModal, StudentHistoryModal, TimeInput } from '../progress/ProgressTracker';
import { GRID_COURSES } from '../diplome/Diplome';
import { computeModuleLesson } from '@/lib/lessonNumbering';
import { DIPLOMA_MODULES, diplomaTemplateUrl, getCourse, starsForModule } from '@/lib/diplomas';
import { Modal, Button, Field, Textarea } from '@/components/ui';
import {
  DIPLOMA_REWARD_TYPES, PACKAGE_TIER_LESSONS,
  type AttendanceStatus, type CourseId, type StudentStatus, type StudyMode,
  type SubscriptionType, type TrackerAttendance, type TrackerGroup, type TrackerLesson,
  type TrackerLessonTransaction, type TrackerStudent,
} from '@/lib/types';

// ============================================================================
// SECȚIUNE DEMO — tutorial ghidat, pe exerciții. Reutilizează LITERAL componentele reale din
// progress/ProgressTracker.tsx (ClassView, ModalShell, GroupRecoveryFormModal,
// StudentHistoryModal, TimeInput - exportate acolo cu o simplă adăugare de `export`, fără nicio
// altă modificare) și din diplome/Diplome.tsx (GRID_COURSES), hrănite cu date demo (max 3 elevi).
// NU citește si NU scrie NIMIC in Supabase - izolat complet de datele reale, resetabil oricand.
// Un "motor de exerciții" mic (EXERCISES + check-uri pure) deasupra acestor componente decide
// cand exercitiul curent e rezolvat corect, fara sa schimbe deloc cum arata/functioneaza ele.
// ============================================================================

type ButtonState = 'idle' | 'loading' | 'success';
type SubscriptionHistoryEntry = TrackerLessonTransaction & { package_tier: SubscriptionType };
type ModalState =
  | { type: null }
  | { type: 'recoveryTypeChoice'; studentId: string; lessonId: string }
  | { type: 'recordRecovery'; studentId: string; lessonId: string }
  | { type: 'recordGroupRecovery'; studentId: string; lessonId: string }
  | { type: 'studentHistory'; studentId: string };

const DEMO_TEACHER_ID = 'demo-teacher';
const DEMO_GROUP_ID = 'demo-group-1';
const NOW_ISO = '2026-08-01T00:00:00.000Z';

function baseStudent(overrides: Partial<TrackerStudent> & Pick<TrackerStudent, 'id' | 'name' | 'progress'>): TrackerStudent {
  return {
    teacher_id: DEMO_TEACHER_ID, group_id: DEMO_GROUP_ID, lesson_offset: 0,
    presence_count: 0, absence_count: 0, pending_diploma_milestone: null, last_diploma_issued_milestone: 0,
    pending_diploma_milestone_at: null, diploma_overdue_alert_sent_at: null, last_diploma_message_variant: null,
    pending_makeups: 0, absence_date: null, makeup_notification_count: 0, last_makeup_notification: null,
    is_scheduled: false, short_name: null, parent_phones: [], parent_emails: [],
    status: 'active', status_changed_at: null, status_changed_by: null, status_note: null,
    subscription_type: null, study_mode: null, total_lessons_remaining: 0, total_package_lessons: 0,
    already_completed_lessons: 0, pending_subscription_alert: false, deleted_at: null,
    created_at: NOW_ISO,
    ...overrides,
  };
}

function initialGroup(): TrackerGroup {
  return {
    id: DEMO_GROUP_ID, teacher_id: DEMO_TEACHER_ID, group_name: 'Python — Clasă Demo (Marți 18:00)',
    module_count: 1, reward_type: 'stars', day_of_week: 'marti', time_of_day: '18:00',
    diploma_milestone: 0, course: 'python', meet_link: null, is_archived: false, deleted_at: null, created_at: NOW_ISO,
  };
}

// Maximum 3 elevi, exact numele cerute. NICIO data calendaristica nu apare in text - toate
// exercitiile se raporteaza STRICT la numarul lectiei din tracker (curriculum_index == session_
// number aici, deci headerul real "M1 / L{n}" din AttendanceBoard corespunde mereu 1:1 cu
// "Lectia {n}" din text). Pozitii de pornire:
// - Lectia 2: Maria SI Elena absente (neresolvat) - recuperare de grup.
// - Lectia 3: Andrei absent (neresolvat) - recuperare individuala.
// - Lectia 6 (ultima, selectata implicit de AttendanceBoard): Maria si Andrei nemarcati -
//   prezenta/absenta/steluta/tema.
// pending_diploma_milestone = 16 pe Maria/Elena: la fel ca in aplicatia reala, diploma NU se
// genereaza liber din clasa - apare ca task in "🚨 Task-uri Urgente" STRICT cand elevul a
// efectuat exact 16 lectii (vezi banner-ul mai jos in JSX). Maria are putine steluțe (progress
// mic) - "nu a colectat suficiente steluțe"; Elena are toate cele 16 - "a câștigat premiul".
function initialStudents(): TrackerStudent[] {
  return [
    baseStudent({ id: 'maria', name: 'Maria Popescu', progress: 9, pending_diploma_milestone: 16 }),
    baseStudent({ id: 'andrei', name: 'Andrei Ionescu', progress: 12 }),
    baseStudent({ id: 'elena', name: 'Elena Matei', progress: 16, pending_diploma_milestone: 16 }),
  ];
}

// lesson_date exista doar pentru ca TrackerLesson o cere (coloana reala din schema) - nu apare
// nicaieri in textul exercitiilor si nu e folosita de niciun check(), STRICT numarul lectiei.
function initialLessons(): TrackerLesson[] {
  const mk = (id: string, n: number): TrackerLesson => ({
    id, teacher_id: DEMO_TEACHER_ID, group_id: DEMO_GROUP_ID, session_number: n, curriculum_index: n,
    lesson_date: `2026-08-${String(n).padStart(2, '0')}`, lesson_time: '18:00', format: 'grup', is_taught: true, homework_note: null, created_at: NOW_ISO,
  });
  return [mk('l1', 1), mk('l2', 2), mk('l3', 3), mk('l4', 4), mk('l5', 5), mk('l6', 6)];
}

function initialAttendance(): TrackerAttendance[] {
  const mk = (student: string, lesson: string, status: AttendanceStatus, star = 0): TrackerAttendance => ({
    id: `att-${student}-${lesson}`, teacher_id: DEMO_TEACHER_ID, lesson_id: lesson, student_id: student,
    status, star_count: star, recovery_date: null, recovery_time: null, recovery_group_id: null, updated_at: NOW_ISO,
  });
  return [
    // Maria: absenta neresolvata la Lectia 2 (recuperare de grup) - nemarcata la Lectia 6.
    mk('maria', 'l1', 'present'), mk('maria', 'l2', 'absent'), mk('maria', 'l3', 'present'), mk('maria', 'l4', 'present'), mk('maria', 'l5', 'present'),
    // Andrei: absent neresolvat la Lectia 3 (recuperare individuala) - nemarcat la Lectia 6.
    mk('andrei', 'l1', 'present'), mk('andrei', 'l2', 'present'), mk('andrei', 'l3', 'absent'), mk('andrei', 'l4', 'present'), mk('andrei', 'l5', 'present'),
    // Elena: absenta neresolvata la Lectia 2 (recuperare de grup, alaturi de Maria).
    mk('elena', 'l1', 'present'), mk('elena', 'l2', 'absent'), mk('elena', 'l3', 'present'), mk('elena', 'l4', 'present'), mk('elena', 'l5', 'present'), mk('elena', 'l6', 'present'),
  ];
}

function rankStudents(sorted: TrackerStudent[]): (TrackerStudent & { rank: number })[] {
  const ranked: (TrackerStudent & { rank: number })[] = [];
  let currentRank = 1;
  sorted.forEach((s, i) => {
    if (i > 0 && s.progress !== sorted[i - 1].progress) currentRank = i + 1;
    ranked.push({ ...s, rank: currentRank });
  });
  return ranked;
}

function attOf(attendance: TrackerAttendance[], studentId: string, lessonId: string) {
  return attendance.find((a) => a.student_id === studentId && a.lesson_id === lessonId) ?? null;
}

type Category = 'attendance' | 'recovery' | 'groupRecovery' | 'star' | 'homework' | 'connection' | 'diploma';
type DiplomaOutcome = { rewardReceived: boolean; rewardType: string; rewardDetails: string };
type ExerciseState = {
  students: TrackerStudent[]; lessons: TrackerLesson[]; attendance: TrackerAttendance[];
  connectionReport: Record<string, 'conectat' | 'neconectat'>; notifyCount: Record<string, number>;
  diplomaOutcomes: Record<string, DiplomaOutcome>;
};
// targetStudentId e folosit STRICT ca implicit de UI (ex: pe cine preselecteaza modalul de
// diploma la deschidere) - validarea reala traieste integral in check(), care verifica exact
// combinatia Elev + Lectie + Actiune + Situatie ceruta de fiecare exercitiu, nu doar "a facut ceva".
type Exercise = { title: string; prompt: string; help: string; category: Category; targetStudentId?: string; check: (s: ExerciseState) => boolean };

const EXERCISES: Exercise[] = [
  {
    title: 'Prezență', category: 'attendance', targetStudentId: 'maria',
    prompt: 'La Lecția 6, marchează-o pe Maria ca prezentă.',
    help: 'Navighează (dacă e nevoie) la Lecția 6 cu săgețile ◀ ▶ din antetul tabelului „📋 Prezență & Stelute”, găsește-o pe Maria Popescu și apasă pe bifa verde ✓ din dreptul ei.',
    check: (s) => attOf(s.attendance, 'maria', 'l6')?.status === 'present',
  },
  {
    title: 'Absență', category: 'attendance', targetStudentId: 'andrei',
    prompt: 'La Lecția 6, marchează-l pe Andrei ca absent.',
    help: 'Rămâi la Lecția 6 și apasă pe X-ul roșu ✗ din dreptul lui Andrei Ionescu.',
    check: (s) => attOf(s.attendance, 'andrei', 'l6')?.status === 'absent',
  },
  {
    title: 'Recuperare', category: 'recovery', targetStudentId: 'andrei',
    prompt: 'Andrei a fost absent la Lecția 3. Programează-i o recuperare.',
    help: 'Navighează înapoi cu săgeata ◀ până la Lecția 3 (acolo unde Andrei apare Absent), apasă 🔄 în dreptul lui, alege „Individual”, completează data/ora și confirmă.',
    check: (s) => attOf(s.attendance, 'andrei', 'l3')?.status === 'made_up',
  },
  {
    title: 'Recuperare de grup', category: 'groupRecovery', targetStudentId: 'elena',
    prompt: 'Maria și Elena au fost ambele absente la Lecția 2. Plasează o recuperare de grup pentru ele.',
    help: 'Navighează la Lecția 2 (acolo unde Elena și Maria apar Absente), apasă 🔄 în dreptul Elenei, alege „Grup”, bifeaz-o pe Maria Popescu ca participantă, apoi confirmă.',
    check: (s) => {
      const e = attOf(s.attendance, 'elena', 'l2');
      const m = attOf(s.attendance, 'maria', 'l2');
      return !!e && !!m && e.status === 'made_up' && m.status === 'made_up' && !!e.recovery_group_id && e.recovery_group_id === m.recovery_group_id;
    },
  },
  {
    title: 'Steluță', category: 'star', targetStudentId: 'maria',
    prompt: 'La Lecția 6, acordă-i Mariei o steluță.',
    help: 'Rămâi la Lecția 6 (unde Maria e deja Prezentă) și apasă pe iconița ⭐ din dreptul ei.',
    check: (s) => (attOf(s.attendance, 'maria', 'l6')?.star_count ?? 0) > 0,
  },
  {
    title: 'Temă', category: 'homework',
    prompt: 'La Lecția 6, adaugă tema pentru acasă pentru toată grupa.',
    help: 'Rămâi la Lecția 6 și scrie ceva în câmpul „Notează tema pentru data viitoare...” de lângă selectorul de lecție, apoi apasă în afara câmpului ca să se salveze - tema e a întregii grupe, nu a unui singur elev.',
    check: (s) => {
      const l6 = s.lessons.find((l) => l.id === 'l6');
      return !!l6?.homework_note && l6.homework_note.trim().length > 0;
    },
  },
  // Exercitiile 7-9 reproduc EXACT fluxul real de conectare: la minutul 1 de lectie, daca
  // elevul nu e conectat -> Trimite Notificare (mesaj catre parinte); daca tot nu s-a conectat
  // dupa 5 minute -> Nu s-a conectat (ca staff-ul sa poata suna parintele); S-a conectat se
  // apasa DOAR ca sa inchizi o situatie deja semnalata (notificare sau "nu s-a conectat"), NU
  // pentru un elev conectat de la inceput (acela nu cere nicio actiune).
  {
    title: 'Notificare', category: 'connection', targetStudentId: 'andrei',
    prompt: 'La începutul lecției, Andrei nu este conectat. Trimite-i o notificare.',
    help: 'Pe cardul lui Andrei din lista elevilor (mai jos), apasă „🔔 Trimite Notificare” - exact ce faci în primul minut de lecție, dacă un copil nu e conectat.',
    check: (s) => (s.notifyCount['andrei'] ?? 0) > 0,
  },
  {
    title: 'Neconectare', category: 'connection', targetStudentId: 'andrei',
    prompt: 'Au trecut 5 minute și Andrei tot nu s-a conectat. Marchează-l ca „Nu s-a conectat”.',
    help: 'Pe cardul lui Andrei, apasă „❌ Nu s-a conectat” - la 5 minute de la începutul lecției, ca și colegii tăi să poată suna părintele.',
    check: (s) => s.connectionReport['andrei'] === 'neconectat',
  },
  {
    title: 'Conectare', category: 'connection', targetStudentId: 'andrei',
    prompt: 'Andrei tocmai s-a conectat. Confirmă asta din interfață.',
    help: 'Pe cardul lui Andrei, apasă „✅ S-a conectat” - se apasă doar ca să închizi o situație deja semnalată (notificare trimisă sau „Nu s-a conectat”), nu și pentru un elev conectat de la început.',
    check: (s) => s.connectionReport['andrei'] === 'conectat',
  },
  // Exercitiile 10-11: diploma se genereaza STRICT din "🚨 Task-uri Urgente" (nu din clasa),
  // si STRICT cand elevul a atins exact 16 lectii efectuate (pending_diploma_milestone). Ca in
  // aplicatia reala, profesorul NU vede/descarca niciodata diploma - doar confirma recompensa;
  // administratorul e cel care o descarca si o trimite mai departe (vezi Modalul de mai jos).
  {
    title: 'Diplomă', category: 'diploma', targetStudentId: 'maria',
    prompt: 'Generează diploma pentru Maria și marchează că nu a câștigat premiul, deoarece nu a colectat suficiente steluțe.',
    help: 'Găsește cardul „🎓 Diplomă necesară” al Mariei din secțiunea 🚨 Task-uri Urgente de mai jos, apasă „🎓 Generează Diplomă” (elevul/cursul/modulul sunt deja precompletate), apoi la pasul de recompensă alege „Nu” și finalizează.',
    check: (s) => s.diplomaOutcomes['maria']?.rewardReceived === false,
  },
  {
    title: 'Diplomă', category: 'diploma', targetStudentId: 'elena',
    prompt: 'Generează diploma pentru Elena și marchează că a câștigat premiul: Robux.',
    help: 'Găsește cardul „🎓 Diplomă necesară” al Elenei din 🚨 Task-uri Urgente, apasă „🎓 Generează Diplomă”, la pasul de recompensă alege „Da” → „🪙 Bani virtuali”, scrie „Robux” la detalii și finalizează.',
    check: (s) => {
      const o = s.diplomaOutcomes['elena'];
      return !!o && o.rewardReceived === true && o.rewardType === 'virtual_money' && o.rewardDetails.toLowerCase().includes('robux');
    },
  },
];

export default function DemoClient({ isAdmin }: { isAdmin: boolean }) {
  const [group, setGroup] = useState<TrackerGroup>(initialGroup);
  const [students, setStudents] = useState<TrackerStudent[]>(initialStudents);
  const [lessons, setLessons] = useState<TrackerLesson[]>(initialLessons);
  const [attendance, setAttendance] = useState<TrackerAttendance[]>(initialAttendance);
  const [subscriptionHistories, setSubscriptionHistories] = useState<Record<string, SubscriptionHistoryEntry[]>>({});
  const [notifyState, setNotifyState] = useState<Record<string, ButtonState>>({});
  const [connectedState, setConnectedState] = useState<Record<string, ButtonState>>({});
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [recoveryForm, setRecoveryForm] = useState({ date: new Date().toISOString().slice(0, 10), time: '17:00' });
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'success' | 'info' }[]>([]);

  // ---- Motorul de exercitii ----
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [lastActionCategory, setLastActionCategory] = useState<Category | null>(null);
  // connectionReport/notifyCount sunt PERSISTENTE (spre deosebire de notifyState/connectedState
  // de mai jos, care sunt doar animatia tranzitorie idle->loading->success a butoanelor) - au
  // nevoie sa ramana adevarate dupa ce animatia revine la idle, ca exercitiile 7-9 sa poata
  // verifica exact ce s-a raportat pentru Andrei.
  const [connectionReport, setConnectionReport] = useState<Record<string, 'conectat' | 'neconectat'>>({});
  const [notifyCount, setNotifyCount] = useState<Record<string, number>>({});
  const [diplomaOutcomes, setDiplomaOutcomes] = useState<Record<string, DiplomaOutcome>>({});
  const [helpOpen, setHelpOpen] = useState(false);

  const isDone = exerciseIndex >= EXERCISES.length;
  const currentExercise = !isDone ? EXERCISES[exerciseIndex] : null;
  const exerciseState: ExerciseState = { students, lessons, attendance, connectionReport, notifyCount, diplomaOutcomes };
  const succeeded = !!currentExercise?.check(exerciseState);
  const showRetry = !isDone && !succeeded && lastActionCategory === currentExercise?.category;
  const progressPct = isDone ? 100 : (exerciseIndex / EXERCISES.length) * 100;

  function handleNextExercise() {
    setExerciseIndex((i) => i + 1);
    setLastActionCategory(null);
    setHelpOpen(false);
  }

  // Diploma - flux separat (ui.tsx Modal), la fel ca in aplicatia reala (Diplome.tsx e o pagina
  // separata de Progress Tracker). diplomaStep 'done' NU arata diploma insasi (nici macar in
  // preview) - la fel ca in aplicatia reala, profesorul NU vede/descarca niciodata diploma,
  // doar confirma recompensa; task-ul de descarcat/trimis ii revine strict administratorului.
  const [diplomaOpen, setDiplomaOpen] = useState(false);
  const [diplomaStudentId, setDiplomaStudentId] = useState('maria');
  const [diplomaCourse, setDiplomaCourse] = useState<CourseId>('python');
  const [diplomaModule, setDiplomaModule] = useState(1);
  const [diplomaStep, setDiplomaStep] = useState<'form' | 'reward' | 'done'>('form');
  const [rewardReceived, setRewardReceived] = useState<boolean | null>(null);
  const [rewardType, setRewardType] = useState('');
  const [rewardDetails, setRewardDetails] = useState('');

  function showToast(message: string, tone: 'success' | 'info' = 'success') {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }

  function resetDemo() {
    setGroup(initialGroup());
    setStudents(initialStudents());
    setLessons(initialLessons());
    setAttendance(initialAttendance());
    setSubscriptionHistories({});
    setNotifyState({});
    setConnectedState({});
    setModal({ type: null });
    setDiplomaOpen(false);
    setConnectionReport({});
    setNotifyCount({});
    setDiplomaOutcomes({});
    setExerciseIndex(0);
    setLastActionCategory(null);
    setHelpOpen(false);
    showToast('Demo resetat - Exercițiul 1 din nou.', 'info');
  }

  function upsertAttendance(studentId: string, lessonId: string, patch: Partial<TrackerAttendance>): TrackerAttendance {
    const current = attendance.find((a) => a.student_id === studentId && a.lesson_id === lessonId);
    const next: TrackerAttendance = current
      ? { ...current, ...patch, updated_at: new Date().toISOString() }
      : {
          id: `att-${studentId}-${lessonId}`, teacher_id: DEMO_TEACHER_ID, lesson_id: lessonId, student_id: studentId,
          status: 'present', star_count: 0, recovery_date: null, recovery_time: null, recovery_group_id: null,
          updated_at: new Date().toISOString(), ...patch,
        };
    setAttendance((prev) => (current ? prev.map((a) => (a.id === next.id ? next : a)) : [...prev, next]));
    return next;
  }

  // ---- Prezență / Absență (✓ / ✗ din AttendanceBoard) - Exercitiile 1 si 2 ----
  function handleSetAttendanceStatus(studentId: string, lessonId: string, status: AttendanceStatus) {
    const current = attendance.find((a) => a.student_id === studentId && a.lesson_id === lessonId);
    const patch: Partial<TrackerAttendance> = { status, star_count: status === 'absent' ? 0 : (current?.star_count ?? 0) };
    if (status !== 'made_up') { patch.recovery_date = null; patch.recovery_time = null; patch.recovery_group_id = null; }
    upsertAttendance(studentId, lessonId, patch);
    const student = students.find((s) => s.id === studentId);
    showToast(status === 'present' ? `${student?.name} marcat Prezent.` : `${student?.name} marcat Absent.`);
    setLastActionCategory('attendance');
  }

  // ---- Steluță (⭐ din AttendanceBoard) - Exercitiul 5 ----
  function handleCycleStar(studentId: string, lessonId: string) {
    const current = attendance.find((a) => a.student_id === studentId && a.lesson_id === lessonId);
    if (!current || (current.status !== 'present' && current.status !== 'made_up')) return;
    const next = (current.star_count + 1) % 4;
    upsertAttendance(studentId, lessonId, { star_count: next });
    setLastActionCategory('star');
  }

  // ---- Recuperare individuală - Exercitiul 3 ----
  function handleSubmitRecovery(e: React.FormEvent, studentId: string, lessonId: string) {
    e.preventDefault();
    upsertAttendance(studentId, lessonId, { status: 'made_up', recovery_date: recoveryForm.date, recovery_time: recoveryForm.time || null, recovery_group_id: null });
    setModal({ type: null });
    showToast(`Recuperare confirmată pentru ${students.find((s) => s.id === studentId)?.name}.`);
    setLastActionCategory('recovery');
  }

  // ---- Recuperare de grup - Exercitiul 4 ----
  function handleSubmitGroupRecovery(e: React.FormEvent, studentId: string, lessonId: string, otherStudentIds: string[]) {
    e.preventDefault();
    const ids = [studentId, ...otherStudentIds];
    for (const id of ids) upsertAttendance(id, lessonId, { status: 'made_up', recovery_date: recoveryForm.date, recovery_time: recoveryForm.time || null });
    if (ids.length >= 2) {
      const groupId = `demo-recovery-${Date.now()}`;
      setAttendance((prev) => prev.map((a) => (ids.includes(a.student_id) && a.lesson_id === lessonId ? { ...a, recovery_group_id: groupId } : a)));
    }
    setModal({ type: null });
    showToast(ids.length >= 2 ? `Recuperare de grup salvată (${ids.length} elevi).` : 'Recuperare salvată.');
    setLastActionCategory('groupRecovery');
  }

  // ---- Temă pentru acasă - Exercitiul 6 ----
  function handleSaveLessonHomework(lessonId: string, note: string) {
    setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, homework_note: note.trim() || null } : l)));
    showToast(note.trim() ? 'Temă salvată și atribuită clasei.' : 'Temă ștearsă.');
    setLastActionCategory('homework');
  }

  // ---- Restul actiunilor din ClassView, in afara celor 11 exercitii - simulate/informative
  // (adaugarea/stergerea de lectii e dezactivata in acest ghid, ca sa nu strice navigarea intre
  // lectiile L1-L6 pe care se bazeaza exercitiile 1-6). ----
  function handleSaveMeetLink(meetLink: string | null) {
    setGroup((g) => ({ ...g, meet_link: meetLink }));
    showToast(meetLink ? 'Link Meet salvat.' : 'Link Meet șters.');
  }
  // ---- Notificare parinte / status conectare - Exercitiile 7-9 ----
  function handleSendNotification(student: TrackerStudent) {
    setNotifyState((s) => ({ ...s, [student.id]: 'loading' }));
    setTimeout(() => {
      setNotifyState((s) => ({ ...s, [student.id]: 'success' }));
      setNotifyCount((c) => ({ ...c, [student.id]: (c[student.id] ?? 0) + 1 }));
      showToast(`Notificare simulată trimisă către părintele lui ${student.name} (demo).`, 'info');
      setLastActionCategory('connection');
      setTimeout(() => setNotifyState((s) => ({ ...s, [student.id]: 'idle' })), 2000);
    }, 500);
  }
  function handleSetConnectionStatus(student: TrackerStudent, status: 'conectat' | 'neconectat') {
    setConnectedState((s) => ({ ...s, [student.id]: 'loading' }));
    setTimeout(() => {
      setConnectedState((s) => ({ ...s, [student.id]: 'success' }));
      setConnectionReport((r) => ({ ...r, [student.id]: status }));
      showToast(`${student.name}: status „${status}” înregistrat (demo).`, 'info');
      setLastActionCategory('connection');
      setTimeout(() => setConnectedState((s) => ({ ...s, [student.id]: 'idle' })), 2000);
    }, 400);
  }
  function handleChangeStatus(studentId: string, status: StudentStatus) {
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status, status_changed_at: new Date().toISOString() } : s)));
    showToast(status === 'dropped_out' ? 'Elev marcat ca abandon (demo).' : status === 'paused' ? 'Abonament întrerupt (demo).' : 'Elev reactivat (demo).');
  }
  function handleRenewSubscription(studentId: string, mode: StudyMode, tier: SubscriptionType) {
    const amount = PACKAGE_TIER_LESSONS[tier];
    if (!amount) return;
    const student = students.find((s) => s.id === studentId);
    const nextRemaining = (student?.total_lessons_remaining ?? 0) + amount;
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, total_lessons_remaining: nextRemaining, study_mode: mode, subscription_type: tier, total_package_lessons: amount } : s)));
    const entry: SubscriptionHistoryEntry = {
      id: `demo-tx-${Date.now()}`, student_id: studentId, teacher_id: DEMO_TEACHER_ID, delta: amount, reason: 'purchase',
      balance_after: nextRemaining, package_tier: tier, study_mode: mode, note: null, created_by: DEMO_TEACHER_ID, created_at: new Date().toISOString(),
    };
    setSubscriptionHistories((prev) => ({ ...prev, [studentId]: [...(prev[studentId] ?? []), entry] }));
    showToast(`Abonament reînnoit: +${amount} lecții (demo).`);
  }
  function handleDeleteSubscriptionTransaction(studentId: string, txId: string) {
    const list = subscriptionHistories[studentId] ?? [];
    const tx = list.find((t) => t.id === txId);
    if (!tx) return;
    const isCurrent = list[list.length - 1]?.id === txId;
    const nextList = list.filter((t) => t.id !== txId);
    setSubscriptionHistories((prev) => ({ ...prev, [studentId]: nextList }));
    if (isCurrent) {
      const prevTx = nextList[nextList.length - 1] ?? null;
      setStudents((prev) => prev.map((s) => {
        if (s.id !== studentId) return s;
        const nextRemaining = Math.max(0, (s.total_lessons_remaining ?? 0) - tx.delta);
        return prevTx
          ? { ...s, subscription_type: prevTx.package_tier, study_mode: prevTx.study_mode, total_package_lessons: PACKAGE_TIER_LESSONS[prevTx.package_tier] ?? 0, total_lessons_remaining: nextRemaining }
          : { ...s, subscription_type: null, study_mode: null, total_package_lessons: 0, total_lessons_remaining: nextRemaining };
      }));
    }
    showToast('Abonament șters din istoric (demo).');
  }

  // ---- Diplomă - Exercitiile 10-11 - deschisă STRICT dintr-un card din "🚨 Task-uri Urgente"
  // (vezi pendingDiplomaStudents/JSX mai jos), niciodata liber din clasă. ----
  const pendingDiplomaStudents = students.filter((s) => !s.deleted_at && s.pending_diploma_milestone);
  function openDiplomaFor(studentId: string) {
    const student = students.find((s) => s.id === studentId);
    const { module } = computeModuleLesson(student?.pending_diploma_milestone ?? 16);
    setDiplomaStudentId(studentId);
    setDiplomaCourse(group.course ?? 'python');
    setDiplomaModule(Math.min(module, Math.max(...DIPLOMA_MODULES)));
    setDiplomaStep('form');
    setRewardReceived(null);
    setRewardType('');
    setRewardDetails('');
    setDiplomaOpen(true);
  }
  function handleGenerateDiploma() {
    if (!diplomaTemplateUrl(diplomaCourse, diplomaModule)) { showToast('Acest curs nu are șablon de diplomă.', 'info'); return; }
    setDiplomaStep('reward');
  }
  function handleFinalizeDiploma() {
    const student = students.find((s) => s.id === diplomaStudentId);
    if (!student || !diplomaTemplateUrl(diplomaCourse, diplomaModule)) return;
    setDiplomaOutcomes((prev) => ({ ...prev, [diplomaStudentId]: { rewardReceived: !!rewardReceived, rewardType, rewardDetails } }));
    // La fel ca RPC-ul real (finalize_diploma_with_reward): taskul se inchide - dispare din
    // "🚨 Task-uri Urgente" - iar diploma insasi pleaca direct catre administrator, niciodata
    // vazuta de profesor.
    setStudents((prev) => prev.map((s) => (s.id === diplomaStudentId ? { ...s, pending_diploma_milestone: null } : s)));
    setDiplomaStep('done');
    showToast(`Diplomă generată pentru ${student.name} — trimisă către administrator.`);
    setLastActionCategory('diploma');
  }
  const canFinalizeDiploma = rewardReceived !== null && (!rewardReceived || (!!rewardType && rewardDetails.trim().length > 0));

  const rankedStudents = rankStudents([...students].sort((a, b) => b.progress - a.progress));

  return (
    <div className="tracker-root -mx-5 -my-7 lg:-mx-10 lg:-my-9 min-h-screen bg-black text-white flex flex-col overflow-x-hidden">
      {/* Antet - aceeasi structura/clase ca antetul real din ProgressTracker.tsx (glass sticky,
          max-w-6xl, buton bg-gray-800), doar continutul difera. */}
      <header className="glass sticky top-0 z-40 px-4 py-4 border-b border-white/10">
        <div className="flex items-center justify-between max-w-6xl mx-auto gap-3 flex-wrap gap-y-2">
          <h1 className="text-xl md:text-2xl font-bold shrink-0">🧪 Demo — Exerciții ghidate</h1>
          <button
            onClick={resetDemo}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
          >
            🔄 Resetează
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <p className="text-xs text-gray-500 mb-3">
          🧪 Toate datele de mai jos sunt fictive (Maria, Andrei, Elena) — nimic nu se salvează în baza de date reală. Restul aplicației nu e afectat în niciun fel.
        </p>

        {/* Progres - bara reutilizeaza EXACT clasa .tracker-progress-bar (shimmer) deja definita
            in globals.css pentru progresul elevilor din StudentCard, nu una noua. */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {isDone ? 'Demo finalizat' : `Exercițiul ${exerciseIndex + 1} din ${EXERCISES.length}`}
            </span>
            <span className="text-xs font-semibold text-[#C8F023]">{Math.round(progressPct)}%</span>
          </div>
          <div className="bg-gray-800 rounded-full h-2.5 overflow-hidden mb-3">
            <div
              className="tracker-progress-bar h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundImage: 'linear-gradient(90deg, #C8F023, #4ade80, #C8F023)', backgroundSize: '200% 100%' }}
            />
          </div>

          {!isDone && currentExercise ? (
            <div className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${succeeded ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{currentExercise.title}</p>
                  <button
                    type="button" onClick={() => setHelpOpen(true)} title="Cum fac asta?"
                    className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                  >
                    ?
                  </button>
                </div>
                <p className="text-sm mt-1">{currentExercise.prompt}</p>
                {succeeded && <p className="text-xs font-semibold text-emerald-400 mt-2">✅ Corect!</p>}
                {showRetry && <p className="text-xs font-semibold text-red-400 mt-2">Nu este acțiunea corectă. Încearcă din nou.</p>}
              </div>
              <button
                type="button"
                disabled={!succeeded}
                onClick={handleNextExercise}
                className={`shrink-0 px-4 py-2 rounded-2xl font-semibold text-sm transition-colors ${succeeded ? 'tracker-btn-primary' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
              >
                {exerciseIndex === EXERCISES.length - 1 ? '🎉 Finalizează' : 'Următorul exercițiu →'}
              </button>
            </div>
          ) : (
            <div className="text-center py-12 rounded-3xl border border-gray-700 bg-gray-900 tracker-card-shadow">
              <div className="text-6xl mb-4">🎉</div>
              <p className="text-lg font-bold">Felicitări! Ai finalizat toate exercițiile.</p>
              <p className="text-gray-400 text-sm mt-1">{EXERCISES.length} / {EXERCISES.length} exerciții finalizate</p>
              <button type="button" onClick={resetDemo} className="tracker-btn-primary mt-5 px-5 py-2.5 rounded-2xl font-semibold text-sm">
                🔄 Reia demo-ul
              </button>
            </div>
          )}
        </div>

        {/* "🚨 Task-uri Urgente" - JSX/clase identice cu sectiunea reala din ProgressTracker.tsx
            (home view): asa se genereaza diploma in aplicatia reala - STRICT de aici, STRICT
            la 16 lectii efectuate, NICIODATA liber din clasa. */}
        {pendingDiplomaStudents.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-400 mb-3">
              <span className="inline-block animate-bounce">🚨</span> Task-uri Urgente
            </h3>
            <div className="space-y-2">
              {pendingDiplomaStudents.map((s) => {
                const { module, lesson } = computeModuleLesson(s.pending_diploma_milestone ?? 0);
                return (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
                    <p className="text-sm break-words whitespace-normal min-w-0">
                      🎓 Diplomă necesară: Elevul <span className="font-semibold">{s.name}</span>
                      {' '}(Grupa <span className="font-semibold">{group.group_name}</span>)
                      {' '}a ajuns la <span className="font-semibold">M{module} / L{lesson}</span>
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 mt-3 w-full justify-end">
                      <button
                        type="button" onClick={() => openDiplomaFor(s.id)}
                        title="Deschide generatorul de diplome, precompletat cu cursul si elevul - alege doar recompensa"
                        className="block w-full sm:w-auto sm:inline-block bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-2xl font-semibold text-sm transition-colors text-center"
                      >
                        🎓 Generează Diplomă
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Exact componenta ClassView din Progress Tracker - acelasi cod, alimentat cu date demo. */}
        <ClassView
          isAdmin={isAdmin}
          group={group}
          students={rankedStudents}
          lessons={lessons}
          attendance={attendance}
          onBack={() => showToast('În Progress Tracker, acest buton te-ar întoarce la lista claselor tale.', 'info')}
          onEditStudent={() => showToast('Editarea fișei elevului nu face parte din acest ghid demo.', 'info')}
          onRequestNewLesson={() => showToast('Adăugarea de lecții noi nu face parte din acest ghid demo.', 'info')}
          onRequestRecovery={(studentId, lessonId) => setModal({ type: 'recoveryTypeChoice', studentId, lessonId })}
          onSetAttendanceStatus={handleSetAttendanceStatus}
          onCycleStar={handleCycleStar}
          onDeleteLesson={() => showToast('Ștergerea lecțiilor nu face parte din acest ghid demo.', 'info')}
          onOpenHistory={(studentId) => setModal({ type: 'studentHistory', studentId })}
          onSaveMeetLink={handleSaveMeetLink}
          onSaveLessonHomework={handleSaveLessonHomework}
          notifyState={notifyState}
          connectedState={connectedState}
          onSendNotification={handleSendNotification}
          onSetConnectionStatus={handleSetConnectionStatus}
        />
      </main>

      {/* Toasturi - acelasi stil/animatie ca in Progress Tracker (.tracker-toast). */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`tracker-toast px-4 py-3 rounded-2xl font-semibold text-white shadow-lg text-sm max-w-xs ${t.tone === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* ---- "?" Ajutor - explicatia exercitiului curent, in acelasi ModalShell real folosit
           peste tot in Progress Tracker. ---- */}
      {helpOpen && currentExercise && (
        <ModalShell onClose={() => setHelpOpen(false)}>
          <h3 className="text-xl font-bold mb-2 text-[#C8F023]">❓ Cum fac asta?</h3>
          <p className="text-sm text-gray-400 mb-1">{currentExercise.title}</p>
          <p className="text-sm text-gray-200">{currentExercise.help}</p>
        </ModalShell>
      )}

      {/* ---- Recuperare individuală/de grup - JSX identic cu cel din ProgressTracker.tsx
           (aceleasi 2 pasi: alegere tip, apoi formular), randat cu ModalShell/TimeInput/
           GroupRecoveryFormModal REALE (importate mai sus), nu reconstruite. ---- */}
      {modal.type === 'recoveryTypeChoice' && (() => {
        const student = students.find((s) => s.id === modal.studentId);
        if (!student) return null;
        return (
          <ModalShell onClose={() => setModal({ type: null })}>
            <h3 className="text-xl font-bold mb-2 text-[#C8F023]">🔄 Tip Recuperare</h3>
            <p className="text-sm text-gray-400 mb-6">
              Recuperare pentru <span className="text-white font-semibold">{student.name}</span> - a fost o
              sesiune 1 la 1 sau de grup, cu mai mulți colegi?
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setModal({ type: 'recordRecovery', studentId: modal.studentId, lessonId: modal.lessonId })}
                className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 py-4 rounded-2xl font-semibold text-left px-4 transition-colors"
              >
                👤 Individual
                <span className="block text-xs text-gray-400 font-normal mt-0.5">Sesiune 1 la 1, doar pentru acest elev</span>
              </button>
              <button
                type="button"
                onClick={() => setModal({ type: 'recordGroupRecovery', studentId: modal.studentId, lessonId: modal.lessonId })}
                className="w-full tracker-btn-primary py-4 rounded-2xl font-semibold text-left px-4"
              >
                👥 Grup
                <span className="block text-xs opacity-70 font-normal mt-0.5">Sesiune comună cu alți colegi din grupă</span>
              </button>
            </div>
          </ModalShell>
        );
      })()}

      {modal.type === 'recordRecovery' && (() => {
        const student = students.find((s) => s.id === modal.studentId);
        if (!student) return null;
        return (
          <ModalShell onClose={() => setModal({ type: null })}>
            <h3 className="text-xl font-bold mb-2 text-[#C8F023]">🔄 Înregistrare Recuperare</h3>
            <p className="text-sm text-gray-400 mb-4">
              Sesiune 1 la 1 pentru <span className="text-white font-semibold">{student.name}</span>
            </p>
            <form onSubmit={(e) => handleSubmitRecovery(e, modal.studentId, modal.lessonId)}>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Data</label>
                  <input
                    type="date" value={recoveryForm.date} onChange={(e) => setRecoveryForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Ora</label>
                  <TimeInput
                    value={recoveryForm.time} onChange={(v) => setRecoveryForm((f) => ({ ...f, time: v }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                  ✖️ Anuleaza
                </button>
                <button type="submit" className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                  ✅ Confirma recuperarea
                </button>
              </div>
            </form>
          </ModalShell>
        );
      })()}

      {modal.type === 'recordGroupRecovery' && (() => {
        const student = students.find((s) => s.id === modal.studentId);
        const lesson = lessons.find((l) => l.id === modal.lessonId);
        if (!student || !lesson) return null;
        const otherStudents = students.filter((s) => s.group_id === lesson.group_id && s.id !== modal.studentId && !s.deleted_at);
        return (
          <GroupRecoveryFormModal
            student={student}
            otherStudents={otherStudents}
            date={recoveryForm.date}
            time={recoveryForm.time}
            busy={false}
            onDateChange={(v) => setRecoveryForm((f) => ({ ...f, date: v }))}
            onTimeChange={(v) => setRecoveryForm((f) => ({ ...f, time: v }))}
            onClose={() => setModal({ type: null })}
            onSubmit={(e, otherIds) => handleSubmitGroupRecovery(e, modal.studentId, modal.lessonId, otherIds)}
          />
        );
      })()}

      {/* ---- Fișa Elevului - exact StudentHistoryModal din Progress Tracker. ---- */}
      {modal.type === 'studentHistory' && (() => {
        const student = students.find((s) => s.id === modal.studentId);
        if (!student) return null;
        const studentLessons = [...lessons].filter((l) => l.group_id === student.group_id).sort((a, b) => a.session_number - b.session_number);
        const history = studentLessons.map((lesson) => ({ lesson, record: attendance.find((a) => a.lesson_id === lesson.id && a.student_id === student.id) ?? null }));
        return (
          <StudentHistoryModal
            student={student}
            group={group}
            history={history}
            isAdmin={isAdmin}
            subscriptionHistory={subscriptionHistories[student.id] ?? []}
            onClose={() => setModal({ type: null })}
            onChangeStatus={(status) => handleChangeStatus(student.id, status)}
            onRenewSubscription={(mode, tier) => handleRenewSubscription(student.id, mode, tier)}
            onDeleteSubscriptionTransaction={(txId) => handleDeleteSubscriptionTransaction(student.id, txId)}
            onOpenTransfer={() => showToast('Transferul elevilor la alt profesor nu face parte din acest ghid demo.', 'info')}
          />
        );
      })()}

      {/* ---- Diplomă - refolosește Modal/Button/Field/Textarea din ui.tsx și GRID_COURSES/
           DIPLOMA_MODULES/DIPLOMA_REWARD_TYPES reale, EXACT ca Diplome.tsx. Pasul final ('done')
           NU arata diploma - doar confirma ca a plecat catre administrator, la fel ca in
           aplicatia reala (profesorul nu o vede niciodata). ---- */}
      <Modal
        open={diplomaOpen}
        onClose={() => setDiplomaOpen(false)}
        title={diplomaStep === 'done' ? '✅ Diplomă trimisă' : diplomaStep === 'reward' ? '🎁 Recompensă & finalizare' : `🎓 Generează diplomă — ${getCourse(diplomaCourse)?.label ?? ''}`}
        footer={
          diplomaStep === 'done' ? (
            <Button onClick={() => setDiplomaOpen(false)}>Am terminat</Button>
          ) : diplomaStep === 'reward' ? (
            <>
              <Button variant="outline" onClick={() => setDiplomaStep('form')}>← Înapoi</Button>
              <Button onClick={handleFinalizeDiploma} disabled={!canFinalizeDiploma}>Finalizează generarea diplomei</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setDiplomaOpen(false)}>Anulează</Button>
              <Button onClick={handleGenerateDiploma}>Generează</Button>
            </>
          )
        }
      >
        {diplomaStep === 'form' ? (
          <>
            <Field label="Copil">
              <select
                value={diplomaStudentId}
                onChange={(e) => setDiplomaStudentId(e.target.value)}
                className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
              >
                {students.map((s) => <option key={s.id} value={s.id} className="bg-night text-ink">{s.name} — {starsForModule(s.progress)} din 16 steluțe</option>)}
              </select>
            </Field>
            <Field label="Curs">
              <div className="grid grid-cols-3 gap-2">
                {GRID_COURSES.map((c) => (
                  <button
                    key={c.id} type="button" onClick={() => setDiplomaCourse(c.id)}
                    className={`py-2 rounded-xl font-semibold text-xs transition-colors flex flex-col items-center gap-1 ${diplomaCourse === c.id ? 'bg-brand-500 text-black' : 'glass text-ink border border-line'}`}
                  >
                    <span className="text-lg leading-none">{c.emoji}</span>
                    {getCourse(c.id)?.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Modul">
              <select
                value={diplomaModule}
                onChange={(e) => setDiplomaModule(Number(e.target.value))}
                className="glass h-10 w-full rounded-xl border border-line px-3 text-sm text-ink"
              >
                {DIPLOMA_MODULES.map((m) => <option key={m} value={m} className="bg-night text-ink">Modulul {m}</option>)}
              </select>
            </Field>
            <p className="text-xs text-lock">Următorul pas îți cere să confirmi dacă elevul a câștigat un premiu, înainte de finalizare — la fel ca în aplicația reală.</p>
          </>
        ) : diplomaStep === 'done' ? (
          <p className="text-sm text-lock">
            ✅ Diploma pentru <span className="font-semibold text-ink">{students.find((s) => s.id === diplomaStudentId)?.name}</span> a fost generată
            și trimisă către administrator - la fel ca în aplicația reală, tu (profesorul) nu vezi și nu descarci diploma direct; administratorul e cel
            care o descarcă și o trimite mai departe către părinte.
          </p>
        ) : (
          <>
            <p className="text-sm text-lock">
              Diploma pentru <span className="font-semibold text-ink">{students.find((s) => s.id === diplomaStudentId)?.name}</span> e pregătită - nu trebuie să o descarci.
              Confirmă recompensa și finalizează, ca administratorul să o poată descărca și trimite mai departe.
            </p>
            <Field label="A câștigat copilul un premiu?">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={rewardReceived === true ? 'primary' : 'outline'} onClick={() => setRewardReceived(true)}>Da</Button>
                <Button type="button" size="sm" variant={rewardReceived === false ? 'primary' : 'outline'} onClick={() => setRewardReceived(false)}>Nu</Button>
              </div>
            </Field>
            {rewardReceived && (
              <>
                <Field label="Ce tip de premiu a câștigat?">
                  <div className="grid grid-cols-2 gap-2">
                    {DIPLOMA_REWARD_TYPES.map((r) => (
                      <Button key={r.id} type="button" size="sm" variant={rewardType === r.id ? 'primary' : 'outline'} onClick={() => setRewardType(r.id)}>{r.label}</Button>
                    ))}
                  </div>
                </Field>
                <Field label="Detalii / Clarificare" hint='Ex: „500 Robux” sau „Superputerea de a controla timpul”.'>
                  <Textarea value={rewardDetails} onChange={(e) => setRewardDetails(e.target.value)} rows={3} placeholder="Detalii premiu..." />
                </Field>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
