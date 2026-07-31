'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X as XIcon, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, Plus, Video, Pencil, ExternalLink, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TrackerGroup, TrackerStudent, TrackerLesson, TrackerAttendance, AttendanceStatus, CourseId, LessonKind } from '@/lib/types';
import { COURSES } from '@/lib/diplomas';
import { computeModuleLesson, formatModuleLesson, totalLessonsFor } from '@/lib/lessonNumbering';

// ----------------------------------------------------------------------------
// Constante (identice cu tracker-ul original)
// ----------------------------------------------------------------------------
const REWARD_TYPES = [
  { id: 'stars', emoji: '⭐', name: 'Stelute' },
  { id: 'cups', emoji: '🏆', name: 'Cupe' },
  { id: 'hearts', emoji: '💛', name: 'Inimi' },
  { id: 'medals', emoji: '🥇', name: 'Medalii' },
  { id: 'cookies', emoji: '🍪', name: 'Cookie' },
  { id: 'laptops', emoji: '💻', name: 'Laptopuri' },
  { id: 'gamepads', emoji: '🎮', name: 'Gamepad' },
  { id: 'rockets', emoji: '🚀', name: 'Rachete' },
  { id: 'diamonds', emoji: '💎', name: 'Diamante' },
  { id: 'crowns', emoji: '👑', name: 'Coroane' },
  { id: 'flowers', emoji: '🌸', name: 'Flori' },
  { id: 'trophies', emoji: '🎖️', name: 'Trofee' },
];

const LEVELS = [
  'Incepator', 'Explorator', 'Avansat', 'Expert', 'Maestru', 'Campion', 'Legenda', 'Erou',
  'Titan', 'Phoenix', 'Dragon', 'Ninja', 'Samurai', 'Wizard', 'Alchimist', 'Inventator',
  'Architect', 'Vizionar', 'Geniu', 'Profet', 'Zeu', 'Cosmic', 'Infinit', 'Eternal',
  'Suprem', 'Transcendent', 'Divin', 'Absolut', 'Omega', 'Immortal',
];

const BADGES = [
  '🎮 Game Designer', '🎯 Code Master', '🚀 Space Explorer', '💡 Innovator',
  '🎨 Artist', '🔧 Builder', '📚 Scholar', '🎭 Entertainer',
  '🌟 Star Performer', '🏆 Champion', '🎭 Creator', '🔬 Scientist',
  '🎸 Rock Star', '🌈 Rainbow Master', '⚡ Lightning Fast', '🦊 Clever Fox',
  '🦁 Brave Lion', '🦅 Eagle Eye', '🐬 Smart Dolphin', '🦋 Transformer',
  '🌺 Bloomer', '🍀 Lucky One', '🔍 Mystery Solver', '❄️ Ice Breaker',
  '☀️ Sunshine', '🌙 Night Owl', '🎪 Showmaster', '🎯 Precision',
  '💎 Diamond Mind', '🏆 Ultimate Champion',
];

const CELEBRATIONS = ['🎉 Bravo!', '⭐ Super!', '🔥 Excelent!', '🔥 Fantastic!', '💪 Genial!', '✨ Minunat!'];

const PROGRESS_COLORS = [
  'linear-gradient(90deg, #C8F023, #4ade80, #C8F023)',
  'linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6)',
  'linear-gradient(90deg, #ec4899, #f472b6, #ec4899)',
  'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)',
  'linear-gradient(90deg, #8b5cf6, #a78bfa, #8b5cf6)',
  'linear-gradient(90deg, #10b981, #34d399, #10b981)',
  'linear-gradient(90deg, #ef4444, #f87171, #ef4444)',
  'linear-gradient(90deg, #06b6d4, #22d3ee, #06b6d4)',
];

const MEDALS = ['🥇', '🥈', '🥉'];

const LESSON_FORMAT_LABEL: Record<LessonKind, string> = { grup: 'Grup', individual: 'Indiv.' };

const DAYS = [
  { id: 'luni', label: 'Luni' },
  { id: 'marti', label: 'Marți' },
  { id: 'miercuri', label: 'Miercuri' },
  { id: 'joi', label: 'Joi' },
  { id: 'vineri', label: 'Vineri' },
  { id: 'sambata', label: 'Sâmbătă' },
  { id: 'duminica', label: 'Duminică' },
];

function dayLabel(id: string | null) {
  return DAYS.find((d) => d.id === id)?.label ?? null;
}

// ----------------------------------------------------------------------------
// Utilitare pure
// ----------------------------------------------------------------------------
function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let currentIndex = result.length;
  let randomValue = seed;
  while (currentIndex !== 0) {
    randomValue = (randomValue * 1103515245 + 12345) & 0x7fffffff;
    const randomIndex = randomValue % currentIndex;
    currentIndex--;
    [result[currentIndex], result[randomIndex]] = [result[randomIndex], result[currentIndex]];
  }
  return result;
}

function getLevelInfo(progress: number) {
  const level = Math.min(Math.floor(progress / 16) + 1, 30);
  return { level, name: LEVELS[level - 1] || LEVELS[0] };
}

function getBadgesForPerson(personId: string, progress: number) {
  const shuffled = shuffleWithSeed(BADGES, hashString(personId));
  return shuffled.slice(0, Math.floor(progress / 16));
}

function getRewardEmoji(rewardType: string) {
  return REWARD_TYPES.find((r) => r.id === rewardType)?.emoji ?? '⭐';
}

function getRewardName(rewardType: string) {
  return REWARD_TYPES.find((r) => r.id === rewardType)?.name.toLowerCase() ?? 'recompense';
}

/** Comparare fara diacritice/majuscule, pentru cautarea rapida. */
const DIACRITICS_RE = /[̀-ͯ]/g;
function norm(s: string) {
  return s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
}

// Maxim de telefoane/email-uri de parinte per elev (vezi PARTEA 1/2 - camp dinamic).
const MAX_CONTACTS = 5;

/**
 * Normalizeaza orice valoare venita din DB/state la un array de string-uri, indiferent
 * daca e deja array, null/undefined (elevi vechi, dinainte de migratie) sau un string
 * simplu ramas dintr-o migrare partiala - niciodata nu lasam un .map() sa crape pe el.
 */
function asContactList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return value ? [value] : [];
  return [];
}

/** Curata lista pentru salvare: trim + elimina golurile + plafoneaza la MAX_CONTACTS. */
function cleanContactList(value: unknown): string[] {
  return asContactList(value).map((v) => v.trim()).filter(Boolean).slice(0, MAX_CONTACTS);
}

/** Lista pentru afisare in formular: mereu cel putin 1 input (gol daca elevul nu are inca date). */
function toEditableList(value: unknown): string[] {
  const list = asContactList(value);
  return list.length > 0 ? list : [''];
}

/**
 * Valoarea unui input numeric controlat, care poate fi golit complet (fara sa forteze un 0
 * nestergabil pe ecran). Cand campul e gol pastram '' - altfel convertim la Number(...), ceea
 * ce elimina automat zerourile din fata (Number('07') === 7), deci nu mai apare bug-ul de
 * concatenare la tastare peste un 0 existent.
 */
function numericInputValue(raw: string): number | '' {
  return raw === '' ? '' : Number(raw);
}

/** Valoarea trimisa la salvare pentru un input numeric care poate fi gol - '' devine 0. */
function numOrZero(value: number | ''): number {
  return value === '' ? 0 : value;
}

function rankStudents<T extends { progress: number }>(sorted: T[]): (T & { rank: number })[] {
  const ranked: (T & { rank: number })[] = [];
  let currentRank = 1;
  sorted.forEach((student, i) => {
    if (i > 0 && student.progress !== sorted[i - 1].progress) currentRank = i + 1;
    ranked.push({ ...student, rank: currentRank });
  });
  return ranked;
}

let uid = 0;
function nextLocalId() { uid += 1; return `local-${Date.now()}-${uid}`; }

function nowDate() { return new Date().toISOString().slice(0, 10); }
function nowTime() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

const DAY_TO_JS_INDEX: Record<string, number> = { duminica: 0, luni: 1, marti: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6 };

// Numele clasei se genereaza automat din Modul + Ziua + Ora, nu se mai scrie manual.
function buildAutoClassName(moduleNum: number, dayId: string | null, time: string) {
  const parts = [`M${moduleNum}`];
  const dayLabel = DAYS.find((d) => d.id === dayId)?.label;
  if (dayLabel) parts.push(time ? `${dayLabel} la ${time}` : dayLabel);
  else if (time) parts.push(`la ${time}`);
  return parts.join(' ');
}

// Urmatoarea data (azi sau in viitor) care cade pe ziua saptamanii configurata pentru clasa -
// se recalculeaza mereu din setarea curenta a clasei, deci ramane sincronizata daca ziua se schimba.
function nextDateForDay(dayId: string | null) {
  if (!dayId || !(dayId in DAY_TO_JS_INDEX)) return nowDate();
  const target = DAY_TO_JS_INDEX[dayId];
  const d = new Date();
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

type ToastItem = { id: string; message: string; type: 'success' | 'error' };
type ButtonState = 'idle' | 'loading' | 'success';
type CelebrationItem = { id: string; kind: 'text' | 'emoji'; content: string };
type ConfettiItem = { id: string; left: number; duration: number; delay: number; emoji: string };

type ModalState =
  | { type: null }
  | { type: 'createClass' }
  | { type: 'editClass'; groupId: string }
  | { type: 'addStudent' }
  | { type: 'editStudent'; studentId: string }
  | { type: 'trashGroups' }
  | { type: 'trashStudents' }
  | { type: 'confirmDeleteStudent'; studentId: string }
  | { type: 'confirmDeleteClass'; groupId: string }
  | { type: 'confirmDeleteLesson'; lessonId: string }
  | { type: 'newLesson'; groupId: string }
  | { type: 'recordRecovery'; studentId: string; lessonId: string }
  | { type: 'studentHistory'; studentId: string };

export default function ProgressTracker({
  teacherId, teacherName, isAdmin, teacherOptions, initialGroups, initialStudents, initialLessons, initialAttendance,
}: {
  teacherId: string; teacherName: string; isAdmin: boolean; teacherOptions: { id: string; label: string }[];
  initialGroups: TrackerGroup[]; initialStudents: TrackerStudent[];
  initialLessons: TrackerLesson[]; initialAttendance: TrackerAttendance[];
}) {
  const supabase = useMemo(() => createClient(), []);

  // Profesorul ale carui date sunt afisate acum - implicit propriul cont; adminul il
  // poate schimba din dropdown-ul de mai jos, ceea ce reincarca totul pentru acel profesor.
  const [viewedTeacherId, setViewedTeacherId] = useState(teacherId);
  const [teacherSwitchLoading, setTeacherSwitchLoading] = useState(false);
  const [groups, setGroups] = useState<TrackerGroup[]>(initialGroups);
  const [students, setStudents] = useState<TrackerStudent[]>(initialStudents);
  const [lessons, setLessons] = useState<TrackerLesson[]>(initialLessons);
  const [attendance, setAttendance] = useState<TrackerAttendance[]>(initialAttendance);
  const [view, setView] = useState<'home' | 'class'>('home');
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [celebrations, setCelebrations] = useState<CelebrationItem[]>([]);
  const [confetti, setConfetti] = useState<ConfettiItem[]>([]);
  const [magicPopup, setMagicPopup] = useState<{ rewardEmoji: string; rewardType: string; needsNewModule: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const [createForm, setCreateForm] = useState<{ module: number; count: number; reward: string; names: string[]; day: string | null; time: string; course: CourseId | null }>(
    { module: 1, count: 1, reward: 'stars', names: [''], day: 'luni', time: '', course: null }
  );
  const autoClassName = buildAutoClassName(createForm.module, createForm.day, createForm.time);
  const [editClassName, setEditClassName] = useState('');
  const [editClassDay, setEditClassDay] = useState<string | null>(null);
  const [editClassTime, setEditClassTime] = useState('');
  const [editClassCourse, setEditClassCourse] = useState<CourseId | null>(null);
  const [addStudentName, setAddStudentName] = useState('');
  const [addStudentShortName, setAddStudentShortName] = useState('');
  // Telefoane/email-uri parinte - GDPR: completate/editate doar de admin (vezi isAdmin mai jos).
  const [addStudentPhones, setAddStudentPhones] = useState<string[]>(['']);
  const [addStudentEmails, setAddStudentEmails] = useState<string[]>(['']);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentShortName, setEditStudentShortName] = useState('');
  const [editStudentPhones, setEditStudentPhones] = useState<string[]>(['']);
  const [editStudentEmails, setEditStudentEmails] = useState<string[]>(['']);
  // Panoul lateral cu toti copiii profesorului curent (vezi PARTEA 4 - Lista Copiilor).
  const [studentsDrawerOpen, setStudentsDrawerOpen] = useState(false);
  // Stare vizuala per elev pentru cele 2 butoane de notificare din randul elevului.
  const [notifyState, setNotifyState] = useState<Record<string, ButtonState>>({});
  const [connectedState, setConnectedState] = useState<Record<string, ButtonState>>({});
  // Suprascriere manuala a pozitiei elevului (Modul/Lectie) - pentru elevi cu istoric
  // dinainte de Tracker. Devine noul punct de pornire (lesson_offset) la salvare.
  // Toate cele 5 campuri de mai jos permit state '' (input golit complet) - vezi
  // numericInputValue/numOrZero, ca sa nu ramana un 0 nestergabil pe ecran la editare.
  const [editStudentModule, setEditStudentModule] = useState<number | ''>(1);
  const [editStudentLesson, setEditStudentLesson] = useState<number | ''>(0);
  // Steluțe istorice (legacy) - suprascrie direct student.progress, campul deja folosit
  // de Cardul Elevului, bara de progres si parametrul trimis la generarea diplomei.
  const [editStudentStars, setEditStudentStars] = useState<number | ''>(0);
  // Prezente/Absente manuale (legacy) - suprascriu direct presence_count/absence_count,
  // acelasi tipar ca Steluțele de mai sus.
  const [editStudentPresences, setEditStudentPresences] = useState<number | ''>(0);
  const [editStudentAbsences, setEditStudentAbsences] = useState<number | ''>(0);
  const [newModuleReward, setNewModuleReward] = useState('stars');
  const [searchQuery, setSearchQuery] = useState('');
  const [newLessonForm, setNewLessonForm] = useState({ date: nowDate(), time: nowTime() });
  const [recoveryForm, setRecoveryForm] = useState({ date: nowDate(), time: nowTime() });

  // Cand adminul schimba profesorul din dropdown, reincarca datele acelui profesor
  // (acelasi tipar ca in /registru) si reseteaza navigarea, ca sa nu ramana o
  // referinta agatata la o clasa care nu exista in noul set de date.
  useEffect(() => {
    if (viewedTeacherId === teacherId) {
      setGroups(initialGroups); setStudents(initialStudents);
      setLessons(initialLessons); setAttendance(initialAttendance);
      setView('home'); setCurrentGroupId(null); setModal({ type: null });
      return;
    }
    let cancelled = false;
    setTeacherSwitchLoading(true);
    (async () => {
      const [{ data: g }, { data: s }, { data: l }, { data: a }] = await Promise.all([
        supabase.from('tracker_groups').select('*').eq('teacher_id', viewedTeacherId).order('created_at'),
        supabase.from('tracker_students').select('*').eq('teacher_id', viewedTeacherId).order('created_at'),
        supabase.from('tracker_lessons').select('*').eq('teacher_id', viewedTeacherId).order('session_number'),
        supabase.from('tracker_attendance').select('*').eq('teacher_id', viewedTeacherId),
      ]);
      if (cancelled) return;
      setGroups((g ?? []) as TrackerGroup[]);
      setStudents((s ?? []) as TrackerStudent[]);
      setLessons((l ?? []) as TrackerLesson[]);
      setAttendance((a ?? []) as TrackerAttendance[]);
      setView('home'); setCurrentGroupId(null); setModal({ type: null });
      setTeacherSwitchLoading(false);
    })();
    return () => { cancelled = true; };
  }, [viewedTeacherId, teacherId, initialGroups, initialStudents, initialLessons, initialAttendance, supabase]);

  // ---- selectori ----
  const activeGroups = groups.filter((g) => !g.deleted_at);
  const deletedGroups = groups.filter((g) => g.deleted_at);
  const getStudentsForGroup = (groupId: string) => students.filter((s) => s.group_id === groupId && !s.deleted_at);
  const getDeletedStudentsForGroup = (groupId: string) => students.filter((s) => s.group_id === groupId && s.deleted_at);
  const getGroupById = (groupId: string | null) => activeGroups.find((g) => g.id === groupId) ?? null;
  const calcAvgProgress = (groupId: string) => {
    const list = getStudentsForGroup(groupId);
    if (list.length === 0) return 0;
    return Math.round(list.reduce((sum, s) => sum + s.progress, 0) / list.length);
  };

  const currentGroup = getGroupById(currentGroupId);
  const totalDataCount = groups.length + students.length;

  // ---- cautare + organizare pe zile ----
  const searchNorm = norm(searchQuery.trim());
  const searchedGroups = !searchNorm ? activeGroups : activeGroups.filter((g) => {
    if (norm(g.group_name).includes(searchNorm)) return true;
    return getStudentsForGroup(g.id).some((s) => norm(s.name).includes(searchNorm));
  });
  const groupsByDay = DAYS.map((d) => ({
    ...d,
    groups: searchedGroups
      .filter((g) => g.day_of_week === d.id)
      .sort((a, b) => (a.time_of_day || '99:99').localeCompare(b.time_of_day || '99:99')),
  }));
  const unscheduledGroups = searchedGroups.filter((g) => !DAYS.some((d) => d.id === g.day_of_week));

  // ---- toasts / celebrari ----
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = nextLocalId();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }

  function showCelebration(emoji: string) {
    const textId = nextLocalId();
    const emojiId = nextLocalId();
    const text = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
    setCelebrations((c) => [...c, { id: textId, kind: 'text', content: text }, { id: emojiId, kind: 'emoji', content: emoji }]);
    setTimeout(() => setCelebrations((c) => c.filter((x) => x.id !== textId && x.id !== emojiId)), 1000);
  }

  function launchConfetti(rewardEmoji: string) {
    const emojis = ['🎉', '🎊', '✨', '⭐', '🌟', '💫', rewardEmoji];
    const items: ConfettiItem[] = Array.from({ length: 30 }, () => ({
      id: nextLocalId(),
      left: Math.random() * 100,
      duration: 2 + Math.random() * 2,
      delay: Math.random() * 0.5,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setConfetti(items);
  }

  // ---- mutatii Supabase ----
  // Optimist: aplica schimbarea local instant, apoi confirma cu serverul in fundal.
  // Daca serverul refuza, revenim la valoarea dinainte si aratam eroarea.
  async function patchGroup(id: string, patch: Partial<TrackerGroup>) {
    const previous = groups.find((g) => g.id === id) ?? null;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    const { data, error } = await supabase.from('tracker_groups').update(patch).eq('id', id).select().single();
    if (error || !data) {
      if (previous) setGroups((gs) => gs.map((g) => (g.id === id ? previous : g)));
      showToast('Eroare', 'error');
      return null;
    }
    setGroups((gs) => gs.map((g) => (g.id === id ? (data as TrackerGroup) : g)));
    return data as TrackerGroup;
  }

  async function patchStudent(id: string, patch: Partial<TrackerStudent>) {
    const previous = students.find((s) => s.id === id) ?? null;
    setStudents((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { data, error } = await supabase.from('tracker_students').update(patch).eq('id', id).select().single();
    if (error || !data) {
      // Logat integral in consola (mesaj, cod, detalii) - fara asta, singurul semnal era
      // toast-ul generic "Eroare", imposibil de diagnosticat daca o coloana lipseste din DB
      // (migratie nerulata inca) sau orice alt motiv real de refuz din partea Supabase/RLS.
      console.error('CRITICAL UPDATE STUDENT ERROR:', { studentId: id, patch, error });
      if (previous) setStudents((ss) => ss.map((s) => (s.id === id ? previous : s)));
      showToast('Eroare', 'error');
      return null;
    }
    setStudents((ss) => ss.map((s) => (s.id === id ? (data as TrackerStudent) : s)));
    return data as TrackerStudent;
  }

  async function patchLesson(id: string, patch: Partial<TrackerLesson>) {
    const previous = lessons.find((l) => l.id === id) ?? null;
    setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { data, error } = await supabase.from('tracker_lessons').update(patch).eq('id', id).select().single();
    if (error || !data) {
      if (previous) setLessons((ls) => ls.map((l) => (l.id === id ? previous : l)));
      showToast('Eroare', 'error');
      return null;
    }
    setLessons((ls) => ls.map((l) => (l.id === id ? (data as TrackerLesson) : l)));
    return data as TrackerLesson;
  }

  // Notita de tema a lectiei (nu per elev) - salvata la ies din camp (onBlur), nu la fiecare tasta.
  async function saveLessonHomework(lessonId: string, note: string) {
    await patchLesson(lessonId, { homework_note: note.trim() || null });
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    const name = autoClassName;
    const names = createForm.names.map((n) => n.trim()).filter(Boolean);
    if (!name) return showToast('Introdu numele clasei', 'error');
    if (names.length === 0) return showToast('Adauga cel putin un elev', 'error');
    if (totalDataCount + names.length + 1 >= 999) return showToast('Limita de date atinsa (999)', 'error');

    setBusy(true);
    const { data: group, error } = await supabase.from('tracker_groups')
      .insert({
        teacher_id: viewedTeacherId, group_name: name, module_count: createForm.module, reward_type: createForm.reward,
        day_of_week: createForm.day, time_of_day: createForm.time || null, course: createForm.course,
      })
      .select().single();
    if (error || !group) { setBusy(false); return showToast('Eroare la creare clasa', 'error'); }

    const { data: newStudents, error: sErr } = await supabase.from('tracker_students')
      .insert(names.map((n) => ({ teacher_id: viewedTeacherId, group_id: group.id, name: n, progress: 0 })))
      .select();
    setBusy(false);

    setGroups((gs) => [...gs, group as TrackerGroup]);
    if (newStudents) setStudents((ss) => [...ss, ...(newStudents as TrackerStudent[])]);
    if (sErr) showToast('Eroare la creare elevi', 'error');

    setModal({ type: null });
    setCreateForm({ module: 1, count: 1, reward: 'stars', names: [''], day: 'luni', time: '', course: null });
    showToast('Clasa creata cu succes!');
  }

  async function handleEditClass(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    const name = editClassName.trim();
    if (!name) return showToast('Introdu numele clasei', 'error');
    const ok = await patchGroup(groupId, { group_name: name, day_of_week: editClassDay, time_of_day: editClassTime || null, course: editClassCourse });
    if (ok) { setModal({ type: null }); showToast('Clasa actualizata!'); }
  }

  async function softDeleteClass(groupId: string) {
    const now = new Date().toISOString();
    const g = await patchGroup(groupId, { deleted_at: now });
    if (!g) return;
    const { data: updatedStudents } = await supabase.from('tracker_students')
      .update({ deleted_at: now }).eq('group_id', groupId).is('deleted_at', null).select();
    if (updatedStudents) {
      const map = new Map((updatedStudents as TrackerStudent[]).map((s) => [s.id, s]));
      setStudents((ss) => ss.map((s) => map.get(s.id) ?? s));
    }
    setModal({ type: null });
    setView('home');
    setCurrentGroupId(null);
    showToast('Clasa mutata in urna');
  }

  async function restoreGroup(groupId: string) {
    const g = await patchGroup(groupId, { deleted_at: null });
    if (!g) return;
    const { data: updatedStudents } = await supabase.from('tracker_students')
      .update({ deleted_at: null }).eq('group_id', groupId).not('deleted_at', 'is', null).select();
    if (updatedStudents) {
      const map = new Map((updatedStudents as TrackerStudent[]).map((s) => [s.id, s]));
      setStudents((ss) => ss.map((s) => map.get(s.id) ?? s));
    }
    showToast('Clasa restaurata!');
  }

  async function permanentDeleteGroup(groupId: string) {
    await supabase.from('tracker_students').delete().eq('group_id', groupId);
    const { error } = await supabase.from('tracker_groups').delete().eq('id', groupId);
    if (error) return showToast('Eroare', 'error');
    setStudents((ss) => ss.filter((s) => s.group_id !== groupId));
    setGroups((gs) => gs.filter((g) => g.id !== groupId));
    setModal({ type: null });
    showToast('Clasa stearsa permanent');
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    const name = addStudentName.trim();
    if (!name) return showToast('Introdu numele elevului', 'error');
    if (!currentGroupId) return;
    if (totalDataCount >= 999) return showToast('Limita de date atinsa (999)', 'error');

    const patch: Record<string, unknown> = {
      teacher_id: viewedTeacherId, group_id: currentGroupId, name, progress: 0,
      short_name: addStudentShortName.trim() || null,
    };
    // GDPR: campurile sunt ascunse profesorilor in UI, deci nu trimitem niciodata o valoare
    // introdusa de ei - doar adminul poate seta telefoanele/email-urile parintelui la creare.
    if (isAdmin) {
      patch.parent_phones = cleanContactList(addStudentPhones);
      patch.parent_emails = cleanContactList(addStudentEmails);
    }

    const { data, error } = await supabase.from('tracker_students')
      .insert(patch).select().single();
    if (error || !data) return showToast('Eroare', 'error');
    setStudents((ss) => [...ss, data as TrackerStudent]);
    setModal({ type: null });
    setAddStudentName('');
    setAddStudentShortName('');
    setAddStudentPhones(['']);
    setAddStudentEmails(['']);
    showToast('Elev adaugat!');
  }

  // Numarul de lectii efectuate (prezente + recuperari) al unui elev, indiferent de grupa -
  // baza pentru afisarea compacta "M{x} / L{y}" (vezi src/lib/lessonNumbering.ts).
  function studentLessonCount(studentId: string) {
    return attendance.filter((a) => a.student_id === studentId && (a.status === 'present' || a.status === 'made_up')).length;
  }

  async function handleEditStudent(e: React.FormEvent, studentId: string) {
    e.preventDefault();
    const name = editStudentName.trim();
    if (!name) return showToast('Introdu numele elevului', 'error');
    // Suprascrierea manuala de Modul/Lectie devine noul punct de pornire: decalajul se
    // recalculeaza ca diferenta fata de lectiile deja inregistrate automat in aplicatie,
    // ca de acum incolo calculele viitoare sa continue exact de la M/L introdus manual.
    const desiredTotal = totalLessonsFor(numOrZero(editStudentModule), numOrZero(editStudentLesson));
    const lessonOffset = desiredTotal - studentLessonCount(studentId);
    const stars = Math.max(0, Math.round(numOrZero(editStudentStars)));
    const presences = Math.max(0, Math.round(numOrZero(editStudentPresences)));
    const absences = Math.max(0, Math.round(numOrZero(editStudentAbsences)));
    const patch: Partial<TrackerStudent> = {
      name, lesson_offset: lessonOffset, progress: stars, short_name: editStudentShortName.trim() || null,
      presence_count: presences, absence_count: absences,
    };
    // GDPR: un profesor nu vede/editeaza niciodata aceste campuri, deci nu le atingem la
    // salvare decat daca cel logat e admin - altfel am risca sa suprascriem cu starea locala goala.
    if (isAdmin) {
      patch.parent_phones = cleanContactList(editStudentPhones);
      patch.parent_emails = cleanContactList(editStudentEmails);
    }
    const ok = await patchStudent(studentId, patch);
    if (ok) { setModal({ type: null }); showToast('Elev actualizat!'); }
  }

  async function softDeleteStudent(studentId: string) {
    const ok = await patchStudent(studentId, { deleted_at: new Date().toISOString() });
    if (ok) { setModal({ type: null }); showToast('Elev mutat in urna'); }
  }

  async function restoreStudent(studentId: string) {
    const ok = await patchStudent(studentId, { deleted_at: null });
    if (ok) showToast('Elev restaurat!');
  }

  async function permanentDeleteStudent(studentId: string) {
    const { error } = await supabase.from('tracker_students').delete().eq('id', studentId);
    if (error) return showToast('Eroare', 'error');
    setStudents((ss) => ss.filter((s) => s.id !== studentId));
    showToast('Elev sters permanent');
  }

  const NOTIFY_WEBHOOK_URL = 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY5MDYzZTA0MzI1MjZhNTUzMjUxMzUi_pc';

  // Trimite catre Pabbly (Green API) un WhatsApp cu link-ul de conectare al clasei.
  // Necesita cel putin un telefon de parinte, editabil doar de admin - vezi PARTEA 1 (GDPR).
  async function handleSendNotification(student: TrackerStudent) {
    const phones = cleanContactList(student.parent_phones);
    if (phones.length === 0) {
      showToast('Adminul nu a adăugat încă un număr pentru acest elev!', 'error');
      return;
    }
    // Pregatit pentru iteratorul din Pabbly: un singur string, telefoanele separate prin
    // virgula, fiecare cu sufixul Green API adaugat daca lipseste.
    const formattedPhones = phones.map((p) => (p.endsWith('@c.us') ? p : `${p}@c.us`)).join(', ');
    // cleanContactList trece prin asContactList - apara si aici de elevi vechi cu
    // parent_emails null/undefined.
    const formattedEmails = cleanContactList(student.parent_emails).join(', ');

    setNotifyState((s) => ({ ...s, [student.id]: 'loading' }));
    try {
      // "no-cors" face raspunsul opac (nu-i putem citi statusul din JS) - e modul cerut
      // explicit ca sa evitam erorile de CORS in consola. Din aceasi cauza, nu tratam un
      // eventual reject al fetch-ului ca esec real: e un simplu "trimite si uita".
      await fetch(NOTIFY_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nume_copil: student.short_name?.trim() || student.name,
          telefon: formattedPhones,
          email: formattedEmails,
          link_conectare: getGroupById(student.group_id)?.meet_link ?? '',
        }),
      });
    } catch {
      // ignorat intentionat - vezi comentariul de mai sus
    }
    setNotifyState((s) => ({ ...s, [student.id]: 'success' }));
    showToast('Notificare trimisă! Dacă elevul nu se conectează în 5 minute, folosiți butoanele de status de mai jos.');
    setTimeout(() => setNotifyState((s) => ({ ...s, [student.id]: 'idle' })), 3000);
  }

  // Trimite catre admini (prin ruta noastra /api/admin-alerts, care face proxy server-side
  // catre Pabbly) statusul de conectare al elevului - declansat din butoanele "S-a conectat"
  // / "Nu s-a conectat", vizibile atat pentru admin cat si pentru profesor.
  async function handleChildConnectionStatus(student: TrackerStudent, status: 'conectat' | 'neconectat') {
    setConnectedState((s) => ({ ...s, [student.id]: 'loading' }));
    // Telefoanele parintelui, curate (fara sufixul @c.us folosit la Green API) si cu "+" in
    // fata fiecaruia - ca WhatsApp sa le recunoasca drept numere apelabile la click. Fiecare
    // numar pe randul lui (\n) in mesajul trimis. "Lipsă număr" daca elevul nu are niciunul.
    const phones = cleanContactList(student.parent_phones);
    const parentPhones = phones.length > 0
      ? phones.map((p) => (p.startsWith('+') ? p : `+${p}`)).join('\n')
      : 'Lipsă număr';
    try {
      await fetch('/api/admin-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: student.short_name?.trim() || student.name,
          teacherName,
          className: getGroupById(student.group_id)?.group_name ?? '',
          status,
          parentPhones,
        }),
      });
    } catch (error) {
      console.error('ADMIN ALERT REQUEST ERROR:', error);
    }
    setConnectedState((s) => ({ ...s, [student.id]: 'idle' }));
    setNotifyState((s) => ({ ...s, [student.id]: 'idle' }));
    showToast('Alertă trimisă către admini!');
  }

  async function addModule() {
    if (!currentGroup) return;
    const count = currentGroup.module_count || 1;
    if (count >= 30) return showToast('Maxim 30 module', 'error');
    const ok = await patchGroup(currentGroup.id, { module_count: count + 1 });
    if (ok) showToast('Modul adaugat!');
  }

  async function removeModule() {
    if (!currentGroup) return;
    const count = currentGroup.module_count || 1;
    if (count <= 1) return showToast('Minim 1 modul', 'error');
    const ok = await patchGroup(currentGroup.id, { module_count: count - 1 });
    if (ok) showToast('Modul sters!');
  }

  // Salveaza/editeaza/sterge link-ul Google Meet al clasei - refoloseste patchGroup
  // (optimist + rollback la eroare), la fel ca restul campurilor grupei (zi, ora, curs...).
  async function saveMeetLink(groupId: string, meetLink: string | null) {
    const ok = await patchGroup(groupId, { meet_link: meetLink });
    if (ok) showToast(meetLink ? 'Link Meet salvat!' : 'Link Meet șters');
  }

  async function addModuleWithReward() {
    if (!currentGroup) return;
    const count = currentGroup.module_count || 1;
    if (count >= 30) return showToast('Maxim 30 module', 'error');
    const ok = await patchGroup(currentGroup.id, { module_count: count + 1, reward_type: newModuleReward });
    if (ok) { showToast('Modul adaugat!'); setMagicPopup(null); }
  }

  // Ajusteaza progresul (stelutele) unui elev cu +1/-1, tinand cont de plafonul modulelor
  // si declansand celebrarea + popup-ul magic exact la pragul de 16.
  async function applyStarDelta(studentId: string, delta: number, group: TrackerGroup) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const maxSteps = (group.module_count || 1) * 16;
    const newProgress = Math.max(0, Math.min(student.progress + delta, maxSteps));
    if (newProgress === student.progress) return;

    const rewardEmoji = getRewardEmoji(group.reward_type);
    if (delta > 0) showCelebration(rewardEmoji);
    const ok = await patchStudent(studentId, { progress: newProgress });
    if (!ok) return;

    if (delta > 0 && newProgress > 0 && newProgress % 16 === 0) {
      const needsNewModule = newProgress >= maxSteps;
      setTimeout(() => {
        launchConfetti(rewardEmoji);
        setNewModuleReward('stars');
        setMagicPopup({ rewardEmoji, rewardType: group.reward_type, needsNewModule });
      }, 800);
    }
  }

  // Steluta se acorda strict daca elevul a fost prezent sau a recuperat lectia - niciodata
  // pentru o lectie marcata "absent". Profesorul cicleaza valoarea (0 -> 1 -> 2 -> 3 -> 0)
  // din click pe iconita - e un multiplicator, nu doar o bifa facuta/nefacuta.
  async function cycleStar(studentId: string, lessonId: string) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const group = getGroupById(student.group_id);
    if (!group) return;
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    if (!current || current.status === 'absent') {
      return showToast('Elevul trebuie sa fie prezent sau sa fi recuperat lectia', 'error');
    }
    const prevCount = current.star_count ?? 0;
    const nextCount = (prevCount + 1) % 4;
    const delta = nextCount - prevCount;
    const maxSteps = (group.module_count || 1) * 16;
    if (delta > 0 && student.progress >= maxSteps) return showToast('Adauga un modul nou pentru a continua!', 'error');

    const previousAttendance = attendance;
    setAttendance((as) => as.map((a) => (a.id === current.id ? { ...a, star_count: nextCount } : a)));
    const { data, error } = await supabase.from('tracker_attendance')
      .update({ star_count: nextCount }).eq('id', current.id).select().single();
    if (error || !data) {
      setAttendance(previousAttendance);
      return showToast('Eroare', 'error');
    }
    setAttendance((as) => as.map((a) => (a.id === current.id ? (data as TrackerAttendance) : a)));
    await applyStarDelta(studentId, delta, group);
  }

  // Creeaza o lectie noua (sedinta) pentru o grupa - numerotata secvential. Tipul se deduce
  // AUTOMAT din numarul de elevi (1 = individuala, >1 = grup) - fara alegere manuala, si
  // alimenteaza direct Payslip-ul din /registru (pe luna extrasa din data lectiei).
  async function createLesson(groupId: string, lessonDate: string, lessonTime: string) {
    const group = getGroupById(groupId);
    if (!group) return undefined;
    const groupLessons = lessons.filter((l) => l.group_id === groupId);
    // Daca e prima lectie fizica a clasei, nu repornim de la L1: continuam de la cel mai mare
    // istoric manual (lesson_offset) setat pe elevii clasei din Editeaza Elev - altfel o clasa
    // ai carei elevi au deja 7 lectii in spate ar afisa gresit "L1" la prima sedinta noua.
    // De la a doua lectie incolo, baseline-ul e deja "copt" in session_number-urile existente
    // (folosim maximul lor, nu numarul de lectii, ca sa ramana corect si dupa o eventuala
    // stergere de lectie care lasa goluri in secventa).
    const nextNumber = groupLessons.length === 0
      ? Math.max(0, ...getStudentsForGroup(groupId).map((s) => s.lesson_offset)) + 1
      : Math.max(...groupLessons.map((l) => l.session_number)) + 1;
    const activeCount = getStudentsForGroup(groupId).length;
    const format = activeCount <= 1 ? 'individual' : 'grup';
    const { data, error } = await supabase.from('tracker_lessons')
      .insert({
        teacher_id: group.teacher_id, group_id: groupId, session_number: nextNumber,
        lesson_date: lessonDate, lesson_time: lessonTime || null, format,
      })
      .select().single();
    if (error || !data) { showToast('Eroare la crearea lectiei', 'error'); return undefined; }
    setLessons((ls) => [...ls, data as TrackerLesson]);
    showToast(`Lectia ${nextNumber} creata!`);
    return data as TrackerLesson;
  }

  // Sterge definitiv o lectie (si prezentele ei, prin cascade in DB) - butonul de cos din
  // header-ul Prezenta & Stelute, cu confirmare inainte de executie.
  async function deleteLesson(lessonId: string) {
    const { error } = await supabase.from('tracker_lessons').delete().eq('id', lessonId);
    if (error) return showToast('Eroare', 'error');
    setLessons((ls) => ls.filter((l) => l.id !== lessonId));
    setAttendance((as) => as.filter((a) => a.lesson_id !== lessonId));
    showToast('Lectie stearsa');
  }

  // Prezenta (status) e complet separata de steluta: schimbarea statusului nu acorda
  // niciodata steluta automat. Daca elevul devine "absent", steluta(le) acordate anterior
  // se retrag (progresul scade cu tot multiplicatorul), pentru ca ramane consistent cu
  // regula de business. recoveryDate/recoveryTime se completeaza doar cand status =
  // 'made_up' (sesiune 1-la-1) - aceasta data alimenteaza automat coloana "Recuperari"
  // din Payslip-ul din /registru.
  async function setAttendanceStatus(
    studentId: string, lessonId: string, status: AttendanceStatus, recoveryDate?: string, recoveryTime?: string
  ) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const group = getGroupById(student.group_id);
    if (!group) return;
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    const prevStarCount = current?.star_count ?? 0;
    const nextStarCount = status === 'absent' ? 0 : prevStarCount;
    const nextRecoveryDate = status === 'made_up' ? (recoveryDate ?? current?.recovery_date ?? nowDate()) : null;
    const nextRecoveryTime = status === 'made_up' ? (recoveryTime ?? current?.recovery_time ?? null) : null;

    const previousAttendance = attendance;
    if (current) {
      setAttendance((as) => as.map((a) => (a.id === current.id
        ? { ...a, status, star_count: nextStarCount, recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime } : a)));
    } else {
      const tempId = nextLocalId();
      setAttendance((as) => [...as, {
        id: tempId, teacher_id: group.teacher_id, lesson_id: lessonId, student_id: studentId,
        status, star_count: nextStarCount, recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime,
        updated_at: new Date().toISOString(),
      }]);
    }

    const { data, error } = await supabase.from('tracker_attendance')
      .upsert(
        {
          teacher_id: group.teacher_id, lesson_id: lessonId, student_id: studentId, status, star_count: nextStarCount,
          recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime,
        },
        { onConflict: 'lesson_id,student_id' }
      )
      .select().single();

    if (error || !data) {
      setAttendance(previousAttendance);
      return showToast('Eroare', 'error');
    }
    setAttendance((as) => [...as.filter((a) => !(a.lesson_id === lessonId && a.student_id === studentId)), data as TrackerAttendance]);

    if (nextStarCount !== prevStarCount) await applyStarDelta(studentId, nextStarCount - prevStarCount, group);
  }

  function openNewLessonModal(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    setNewLessonForm({ date: nextDateForDay(group?.day_of_week ?? null), time: group?.time_of_day || nowTime() });
    setModal({ type: 'newLesson', groupId });
  }

  function openRecoveryModal(studentId: string, lessonId: string) {
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    setRecoveryForm({ date: current?.recovery_date ?? nowDate(), time: current?.recovery_time ?? nowTime() });
    setModal({ type: 'recordRecovery', studentId, lessonId });
  }

  function openStudentHistory(studentId: string) {
    setModal({ type: 'studentHistory', studentId });
  }

  // Pregateste formularul de editare pentru un elev - refolosita atat din Cardul Elevului
  // (in interiorul unei clase), cat si din panoul "Lista Copiilor" (PARTEA 4), ca ambele
  // sa deschida FIX acelasi modal, pe aceeasi stare globala.
  function openEditStudentModal(s: TrackerStudent) {
    setEditStudentName(s.name);
    setEditStudentShortName(s.short_name ?? '');
    const { module, lesson } = computeModuleLesson(s.lesson_offset + studentLessonCount(s.id));
    setEditStudentModule(module);
    setEditStudentLesson(lesson);
    setEditStudentStars(s.progress);
    setEditStudentPresences(s.presence_count ?? 0);
    setEditStudentAbsences(s.absence_count ?? 0);
    // GDPR: pentru un profesor, aceste campuri nici nu exista in payload (vezi
    // progress/page.tsx) - dar verificam explicit isAdmin ca sa nu se strecoare
    // vreodata in starea locala a formularului pentru rolul de profesor.
    setEditStudentPhones(isAdmin ? toEditableList(s.parent_phones) : ['']);
    setEditStudentEmails(isAdmin ? toEditableList(s.parent_emails) : ['']);
    setModal({ type: 'editStudent', studentId: s.id });
  }

  async function handleSubmitNewLesson(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    setBusy(true);
    const created = await createLesson(groupId, newLessonForm.date, newLessonForm.time);
    setBusy(false);
    if (created) setModal({ type: null });
  }

  async function handleSubmitRecovery(e: React.FormEvent, studentId: string, lessonId: string) {
    e.preventDefault();
    setBusy(true);
    await setAttendanceStatus(studentId, lessonId, 'made_up', recoveryForm.date, recoveryForm.time);
    setBusy(false);
    setModal({ type: null });
  }


  function openClass(groupId: string) {
    setCurrentGroupId(groupId);
    setView('class');
    setMenuOpen(false);
  }
  function goHome() {
    setCurrentGroupId(null);
    setView('home');
    setMenuOpen(false);
  }

  function updateCreateCount(count: number) {
    setCreateForm((f) => {
      const names = Array.from({ length: count }, (_, i) => f.names[i] ?? '');
      return { ...f, count, names };
    });
  }

  // ---- render ----
  return (
    <div className="tracker-root -mx-5 -my-7 lg:-mx-10 lg:-my-9 min-h-screen bg-black text-white flex flex-col overflow-x-hidden">
      <header className="glass sticky top-0 z-40 px-4 py-4 border-b border-white/10">
        <div className="flex items-center justify-between max-w-6xl mx-auto gap-3">
          <h1 className="text-xl md:text-2xl font-bold shrink-0">🚀 Progress Tracker</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select
                value={viewedTeacherId}
                onChange={(e) => setViewedTeacherId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white max-w-[45vw] md:max-w-none"
              >
                <option value={teacherId} className="bg-gray-900 text-white">Eu (propriile clase)</option>
                {teacherOptions.filter((t) => t.id !== teacherId).map((t) => (
                  <option key={t.id} value={t.id} className="bg-gray-900 text-white">{t.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => { setStudentsDrawerOpen(true); setMenuOpen(false); }}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
              title="Toti copiii profesorului curent"
            >
              👶 <span className="hidden sm:inline">Lista Copiilor</span>
            </button>
            <button
              onClick={() => { setMenuOpen((v) => !v); setStudentsDrawerOpen(false); }}
              className="w-10 h-10 bg-[#C8F023] rounded-xl flex flex-col items-center justify-center gap-1.5 z-50 shrink-0"
              aria-label="Meniu"
            >
              <span className={`burger-line w-5 h-0.5 bg-black rounded transition-all ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`burger-line w-5 h-0.5 bg-black rounded transition-all ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`burger-line w-5 h-0.5 bg-black rounded transition-all ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        {teacherSwitchLoading ? (
          <div className="flex justify-center py-20"><div className="tracker-spinner" /></div>
        ) : view === 'home' ? (
          <div>
            <div className="flex justify-between items-center mb-4 gap-3">
              <h2 className="text-lg md:text-xl font-semibold">📚 Clasele Tale</h2>
              <button onClick={() => setModal({ type: 'createClass' })} className="tracker-btn-primary px-4 py-2 rounded-2xl font-semibold text-sm shrink-0">
                ➕ Adauga Clasa
              </button>
            </div>

            <div className="relative mb-6">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
              <input
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cauta o clasa (ex: miercuri la 17) sau un elev..."
                className="w-full bg-gray-900 border border-gray-700 rounded-2xl pl-11 pr-4 py-3 text-white placeholder:text-gray-500"
              />
            </div>

            {activeGroups.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">📚</div>
                <p className="text-gray-400 text-lg">Nicio clasa inca</p>
                <p className="text-gray-500 text-sm mt-2">Apasa butonul de mai sus pentru a adauga prima ta clasa!</p>
              </div>
            ) : searchedGroups.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-gray-400 text-lg">Niciun rezultat pentru &quot;{searchQuery}&quot;</p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupsByDay.filter((d) => d.groups.length > 0).map((d) => (
                  <div key={d.id}>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#C8F023] mb-3">{d.label}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {d.groups.map((group) => (
                        <GroupCard
                          key={group.id} group={group} studentCount={getStudentsForGroup(group.id).length}
                          avgProgress={calcAvgProgress(group.id)}
                          onOpen={() => openClass(group.id)}
                          onEdit={() => {
                            setEditClassName(group.group_name); setEditClassDay(group.day_of_week); setEditClassTime(group.time_of_day ?? ''); setEditClassCourse(group.course ?? null);
                            setModal({ type: 'editClass', groupId: group.id });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {unscheduledGroups.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">Fara zi stabilita</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {unscheduledGroups.map((group) => (
                        <GroupCard
                          key={group.id} group={group} studentCount={getStudentsForGroup(group.id).length}
                          avgProgress={calcAvgProgress(group.id)}
                          onOpen={() => openClass(group.id)}
                          onEdit={() => {
                            setEditClassName(group.group_name); setEditClassDay(group.day_of_week); setEditClassTime(group.time_of_day ?? ''); setEditClassCourse(group.course ?? null);
                            setModal({ type: 'editClass', groupId: group.id });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : currentGroup ? (
          <ClassView
            isAdmin={isAdmin}
            group={currentGroup}
            students={rankStudents([...getStudentsForGroup(currentGroup.id)].sort((a, b) => b.progress - a.progress))}
            lessons={lessons}
            attendance={attendance}
            onBack={goHome}
            onEditStudent={openEditStudentModal}
            onRequestNewLesson={openNewLessonModal}
            onRequestRecovery={openRecoveryModal}
            onSetAttendanceStatus={setAttendanceStatus}
            onCycleStar={cycleStar}
            onDeleteLesson={(lessonId) => setModal({ type: 'confirmDeleteLesson', lessonId })}
            onOpenHistory={openStudentHistory}
            onSaveMeetLink={(meetLink) => saveMeetLink(currentGroup.id, meetLink)}
            onSaveLessonHomework={saveLessonHomework}
            notifyState={notifyState}
            connectedState={connectedState}
            onSendNotification={handleSendNotification}
            onSetConnectionStatus={handleChildConnectionStatus}
          />
        ) : null}
      </main>

      {/* Menu overlay + panel */}
      <div
        onClick={() => setMenuOpen(false)}
        className={`tracker-menu-overlay fixed inset-0 bg-black/70 z-40 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div className={`tracker-menu-panel fixed top-0 right-0 h-full w-80 max-w-full bg-gray-900 z-50 overflow-y-auto transform ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 pt-20">
          {view === 'home' ? (
            <HomeMenu
              recentGroups={[...activeGroups].slice(-5).reverse()}
              deletedCount={deletedGroups.length}
              onOpenClass={openClass}
              onCreate={() => { setCreateForm({ module: 1, count: 1, reward: 'stars', names: [''], day: 'luni', time: '', course: null }); setModal({ type: 'createClass' }); setMenuOpen(false); }}
              onTrash={() => { setModal({ type: 'trashGroups' }); setMenuOpen(false); }}
            />
          ) : currentGroup ? (
            <ClassMenu
              group={currentGroup}
              otherGroups={activeGroups.filter((g) => g.id !== currentGroup.id)}
              deletedStudentsCount={getDeletedStudentsForGroup(currentGroup.id).length}
              onOpenClass={openClass}
              onAddModule={() => { addModule(); setMenuOpen(false); }}
              onRemoveModule={() => { removeModule(); setMenuOpen(false); }}
              onAddStudent={() => { setAddStudentName(''); setAddStudentShortName(''); setAddStudentPhones(['']); setAddStudentEmails(['']); setModal({ type: 'addStudent' }); setMenuOpen(false); }}
              onTrashStudents={() => { setModal({ type: 'trashStudents' }); setMenuOpen(false); }}
              onDeleteClass={() => { setModal({ type: 'confirmDeleteClass', groupId: currentGroup.id }); setMenuOpen(false); }}
              onGoHome={goHome}
            />
          ) : null}
        </div>
      </div>

      {/* PARTEA 4: Lista Copiilor - director global, toti elevii profesorului curent */}
      <div
        onClick={() => setStudentsDrawerOpen(false)}
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity ${studentsDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div className={`fixed top-0 left-0 h-full w-96 max-w-full bg-gray-900 z-50 overflow-y-auto transform transition-transform ${studentsDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <AllStudentsDrawer
          groups={activeGroups}
          students={students.filter((s) => !s.deleted_at)}
          onClose={() => setStudentsDrawerOpen(false)}
          onSelectStudent={(s) => { setStudentsDrawerOpen(false); openEditStudentModal(s); }}
        />
      </div>

      {/* Celebratii plutitoare */}
      <div className="fixed inset-0 pointer-events-none z-30">
        {celebrations.map((c) => (
          <div
            key={c.id}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${c.kind === 'text' ? 'text-4xl font-bold text-black' : 'text-6xl'}`}
            style={c.kind === 'text'
              ? { animation: 'tracker-float-up 1s ease-out forwards', textShadow: '0 0 10px rgba(200,240,35,0.8), 0 0 20px rgba(200,240,35,0.6)' }
              : { animation: 'tracker-star-burst 0.8s ease-out forwards' }}
          >
            {c.content}
          </div>
        ))}
      </div>

      {/* Toasturi */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`tracker-toast px-4 py-3 rounded-2xl font-semibold text-white shadow-lg ${t.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Modaluri */}
      {modal.type === 'createClass' && (
        <ModalShell onClose={() => setModal({ type: null })}>
          <h3 className="text-xl font-bold mb-4 text-[#C8F023]">➕ Creaza Clasa Noua</h3>
          <form onSubmit={handleCreateClass}>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Numele Clasei <span className="text-gray-500 font-normal">(generat automat)</span></label>
              <input
                type="text" value={autoClassName} readOnly
                className="w-full bg-gray-800/60 border border-gray-700 rounded-2xl px-4 py-3 text-gray-300 cursor-not-allowed"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Modul</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((m) => (
                  <button
                    key={m} type="button" onClick={() => setCreateForm((f) => ({ ...f, module: m }))}
                    className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${createForm.module === m ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                  >
                    Modul {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Ziua saptamanii</label>
              <div className="grid grid-cols-4 gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d.id} type="button" onClick={() => setCreateForm((f) => ({ ...f, day: d.id }))}
                    className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${createForm.day === d.id ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Ora</label>
              <input
                type="time" value={createForm.time} onChange={(e) => setCreateForm((f) => ({ ...f, time: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Numar de elevi</label>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n} type="button" onClick={() => updateCreateCount(n)}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-colors ${createForm.count === n ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Aplicatia / Materia (pentru diplome)</label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button" onClick={() => setCreateForm((f) => ({ ...f, course: null }))}
                  className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${createForm.course === null ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                >
                  Nespecificat
                </button>
                {COURSES.filter((c) => c.id !== 'delighted').map((c) => (
                  <button
                    key={c.id} type="button" onClick={() => setCreateForm((f) => ({ ...f, course: c.id }))}
                    className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${createForm.course === c.id ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Tipul de premiu</label>
              <div className="grid grid-cols-4 gap-2">
                {REWARD_TYPES.map((r) => (
                  <button
                    key={r.id} type="button" onClick={() => setCreateForm((f) => ({ ...f, reward: r.id }))}
                    className={`tracker-reward-grid-item border-2 border-gray-300 rounded-2xl p-2 flex flex-col items-center justify-center ${createForm.reward === r.id ? 'selected' : ''}`}
                  >
                    <span className="text-3xl">{r.emoji}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4 space-y-3">
              {createForm.names.map((name, i) => (
                <div key={i}>
                  <label className="block text-sm font-semibold mb-2">Numele elevului {i + 1}</label>
                  <input
                    type="text" value={name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, names: f.names.map((n, idx) => (idx === i ? e.target.value : n)) }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" placeholder="Nume elev" required
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                ✖️ Anuleaza
              </button>
              <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                ✅ Salveaza
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal.type === 'editClass' && (() => {
        const group = getGroupById(modal.groupId);
        if (!group) return null;
        const list = getStudentsForGroup(group.id);
        return (
          <ModalShell onClose={() => setModal({ type: null })}>
            <h3 className="text-xl font-bold mb-4 text-[#C8F023]">⚙️ Editeaza Clasa</h3>
            <form onSubmit={(e) => handleEditClass(e, group.id)}>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Numele Clasei</label>
                <input
                  type="text" value={editClassName} onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Ziua saptamanii</label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button" onClick={() => setEditClassDay(null)}
                    className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${editClassDay === null ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                  >
                    Nespecificat
                  </button>
                  {DAYS.map((d) => (
                    <button
                      key={d.id} type="button" onClick={() => setEditClassDay(d.id)}
                      className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${editClassDay === d.id ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Ora (optional)</label>
                <input
                  type="time" value={editClassTime} onChange={(e) => setEditClassTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Curs (pentru diplome)</label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button" onClick={() => setEditClassCourse(null)}
                    className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${editClassCourse === null ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                  >
                    Nespecificat
                  </button>
                  {COURSES.map((c) => (
                    <button
                      key={c.id} type="button" onClick={() => setEditClassCourse(c.id)}
                      className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${editClassCourse === c.id ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Elevi</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {list.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 bg-gray-800 rounded-2xl px-4 py-3">
                      <span className="flex-1">{s.name}</span>
                      <button
                        type="button" disabled={list.length <= 1}
                        onClick={() => setModal({ type: 'confirmDeleteStudent', studentId: s.id })}
                        className={`text-red-500 hover:text-red-400 ${list.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModal({ type: 'confirmDeleteClass', groupId: group.id })} className="bg-red-500 hover:bg-red-600 px-4 py-3 rounded-2xl font-semibold transition-colors">
                  🗑️
                </button>
                <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                  Anuleaza
                </button>
                <button type="submit" className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                  ✅ Salveaza
                </button>
              </div>
            </form>
          </ModalShell>
        );
      })()}

      {modal.type === 'addStudent' && (
        <ModalShell onClose={() => setModal({ type: null })}>
          <h3 className="text-xl font-bold mb-4 text-[#C8F023]">➕ Adauga Elev</h3>
          <form onSubmit={handleAddStudent}>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Nume Complet <span className="text-gray-500 font-normal">(pentru profesor/registru)</span></label>
              <input
                type="text" value={addStudentName} onChange={(e) => setAddStudentName(e.target.value)}
                placeholder="Nume elev" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Nume Mic <span className="text-gray-500 font-normal">(pentru notificări părinți)</span></label>
              <input
                type="text" value={addStudentShortName} onChange={(e) => setAddStudentShortName(e.target.value)}
                placeholder="ex: Andrei" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
              />
            </div>
            {isAdmin && (
              <>
                <DynamicContactList
                  label="Telefoane parinte" type="tel" values={addStudentPhones} onChange={setAddStudentPhones}
                  placeholder="ex: 40712345678" addLabel="+ Adauga numar"
                />
                <DynamicContactList
                  label="Email-uri parinte" type="email" values={addStudentEmails} onChange={setAddStudentEmails}
                  placeholder="ex: parinte@exemplu.com" addLabel="+ Adauga email"
                />
              </>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                ✖️ Anuleaza
              </button>
              <button type="submit" className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                ✅ Adauga
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal.type === 'editStudent' && (() => {
        const student = students.find((s) => s.id === modal.studentId);
        if (!student) return null;
        return (
          <ModalShell onClose={() => setModal({ type: null })}>
            <h3 className="text-xl font-bold mb-4 text-[#C8F023]">⚙️ Editeaza Elev</h3>
            <form onSubmit={(e) => handleEditStudent(e, student.id)}>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Nume Complet <span className="text-gray-500 font-normal">(pentru profesor/registru)</span></label>
                <input
                  type="text" value={editStudentName} onChange={(e) => setEditStudentName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Nume Mic <span className="text-gray-500 font-normal">(pentru notificări părinți)</span></label>
                <input
                  type="text" value={editStudentShortName} onChange={(e) => setEditStudentShortName(e.target.value)}
                  placeholder="ex: Andrei" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">
                  Poziție manuală (Modul / Lecție) <span className="text-gray-500 font-normal">— pentru elevi cu istoric dinainte de Tracker</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <span className="block text-[11px] text-gray-500 mb-1">Modul</span>
                    <input
                      type="number" min={1} value={editStudentModule}
                      onChange={(e) => setEditStudentModule(numericInputValue(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                  <span className="mt-5 text-gray-500 font-bold">/</span>
                  <div className="flex-1">
                    <span className="block text-[11px] text-gray-500 mb-1">Lecție</span>
                    <input
                      type="number" min={1} max={16} value={editStudentLesson}
                      onChange={(e) => setEditStudentLesson(numericInputValue(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Devine „M{editStudentModule} / L{editStudentLesson}” chiar acum - calculele viitoare (noi prezențe/recuperări) continuă automat de aici.
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">
                  Steluțe colectate <span className="text-gray-500 font-normal">— total istoric (ex: pentru elevi cu istoric dinainte de Tracker)</span>
                </label>
                <input
                  type="number" min={0} value={editStudentStars}
                  onChange={(e) => setEditStudentStars(numericInputValue(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                />
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Suprascrie imediat totalul de steluțe afișat pe Cardul Elevului, pe bara de progres și în textul trimis către diplomă.
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">
                  Prezențe / Absențe <span className="text-gray-500 font-normal">— total istoric (ex: pentru elevi cu istoric dinainte de Tracker)</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <span className="block text-[11px] text-gray-500 mb-1">Prezențe</span>
                    <input
                      type="number" min={0} value={editStudentPresences}
                      onChange={(e) => setEditStudentPresences(numericInputValue(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="block text-[11px] text-gray-500 mb-1">Absențe</span>
                    <input
                      type="number" min={0} value={editStudentAbsences}
                      onChange={(e) => setEditStudentAbsences(numericInputValue(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Suprascrie imediat totalurile manuale (presence_count/absence_count) - separate de prezența înregistrată per lecție in tabelul de mai jos.
                </p>
              </div>
              {isAdmin && (
                <>
                  <DynamicContactList
                    label="Telefoane parinte" type="tel" values={editStudentPhones} onChange={setEditStudentPhones}
                    placeholder="ex: 40712345678" addLabel="+ Adauga numar"
                  />
                  <DynamicContactList
                    label="Email-uri parinte" type="email" values={editStudentEmails} onChange={setEditStudentEmails}
                    placeholder="ex: parinte@exemplu.com" addLabel="+ Adauga email"
                  />
                </>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={getStudentsForGroup(student.group_id).length <= 1}
                  onClick={() => setModal({ type: 'confirmDeleteStudent', studentId: student.id })}
                  className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-2xl font-semibold transition-colors"
                >
                  🗑️
                </button>
                <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                  Anuleaza
                </button>
                <button type="submit" className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                  ✅ Salveaza
                </button>
              </div>
            </form>
          </ModalShell>
        );
      })()}

      {modal.type === 'confirmDeleteStudent' && (
        <ModalShell onClose={() => setModal({ type: null })}>
          <div className="text-center">
            <div className="text-5xl mb-4">🗑️</div>
            <h3 className="text-xl font-bold mb-2">Stergi elevul?</h3>
            <p className="text-gray-400 mb-6">Elevul va fi mutat in urna si poate fi restaurat.</p>
            <div className="flex gap-3">
              <button onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                Anuleaza
              </button>
              <button onClick={() => softDeleteStudent(modal.studentId)} className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-2xl font-semibold transition-colors">
                🗑️ Sterge
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {modal.type === 'confirmDeleteClass' && (() => {
        const group = getGroupById(modal.groupId);
        if (!group) return null;
        return (
          <ModalShell onClose={() => setModal({ type: null })}>
            <div className="text-center">
              <div className="text-5xl mb-4">🗑️</div>
              <h3 className="text-xl font-bold mb-2">Stergi clasa &quot;{group.group_name}&quot;?</h3>
              <p className="text-gray-400 mb-6">Clasa va fi mutata in urna si poate fi restaurata.</p>
              <div className="flex gap-3">
                <button onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                  Anuleaza
                </button>
                <button onClick={() => softDeleteClass(group.id)} className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-2xl font-semibold transition-colors">
                  🗑️ Sterge
                </button>
              </div>
            </div>
          </ModalShell>
        );
      })()}

      {modal.type === 'confirmDeleteLesson' && (
        <ModalShell onClose={() => setModal({ type: null })}>
          <div className="text-center">
            <div className="text-5xl mb-4">🗑️</div>
            <h3 className="text-xl font-bold mb-2">Confirmare Ștergere</h3>
            <p className="text-gray-400 mb-6">Ești sigur că vrei să ștergi această lecție? Datele asociate vor fi pierdute.</p>
            <div className="flex gap-3">
              <button onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                Anulare
              </button>
              <button
                onClick={() => { deleteLesson(modal.lessonId); setModal({ type: null }); }}
                className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-2xl font-semibold transition-colors"
              >
                🗑️ Șterge
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {modal.type === 'newLesson' && (() => {
        const group = getGroupById(modal.groupId);
        if (!group) return null;
        const activeCount = getStudentsForGroup(group.id).length;
        const formatLabel = activeCount <= 1 ? 'Lecție individuală' : 'Lecție de grup';
        return (
          <ModalShell onClose={() => setModal({ type: null })}>
            <h3 className="text-xl font-bold mb-2 text-[#C8F023]">➕ Lecție nouă</h3>
            <p className="text-sm text-gray-400 mb-4">
              Tip dedus automat: <span className="text-white font-semibold">{formatLabel}</span> ({activeCount} {activeCount === 1 ? 'elev' : 'elevi'})
            </p>
            <form onSubmit={(e) => handleSubmitNewLesson(e, group.id)}>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Data</label>
                  <input
                    type="date" value={newLessonForm.date} onChange={(e) => setNewLessonForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Ora</label>
                  <input
                    type="time" value={newLessonForm.time} onChange={(e) => setNewLessonForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                  ✖️ Anuleaza
                </button>
                <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                  ✅ Salveaza
                </button>
              </div>
            </form>
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
                  <input
                    type="time" value={recoveryForm.time} onChange={(e) => setRecoveryForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModal({ type: null })} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
                  ✖️ Anuleaza
                </button>
                <button type="submit" disabled={busy} className="flex-1 tracker-btn-primary py-3 rounded-2xl font-semibold">
                  ✅ Confirma recuperarea
                </button>
              </div>
            </form>
          </ModalShell>
        );
      })()}

      {modal.type === 'studentHistory' && (() => {
        const student = students.find((s) => s.id === modal.studentId);
        if (!student) return null;
        const group = getGroupById(student.group_id);
        const groupLessons = [...lessons]
          .filter((l) => l.group_id === student.group_id)
          .sort((a, b) => a.session_number - b.session_number);
        const history = groupLessons.map((lesson) => ({
          lesson,
          record: attendance.find((a) => a.lesson_id === lesson.id && a.student_id === student.id) ?? null,
        }));
        return (
          <StudentHistoryModal
            student={student}
            group={group}
            history={history}
            onClose={() => setModal({ type: null })}
          />
        );
      })()}

      {(modal.type === 'trashGroups' || modal.type === 'trashStudents') && (
        <ModalShell onClose={() => setModal({ type: null })}>
          {modal.type === 'trashGroups' ? (
            <>
              <h3 className="text-xl font-bold mb-4 text-[#C8F023]">🗑️ Urna Clase</h3>
              {deletedGroups.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Urna este goala</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  {deletedGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-2 bg-gray-800 rounded-2xl px-4 py-3">
                      <span className="flex-1">📖 {g.group_name}</span>
                      <button onClick={() => restoreGroup(g.id)} className="text-green-500 hover:text-green-400 px-2">♻️</button>
                      <button onClick={() => permanentDeleteGroup(g.id)} className="text-red-500 hover:text-red-400 px-2">🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold mb-4 text-[#C8F023]">🗑️ Urna Elevi</h3>
              {(!currentGroupId || getDeletedStudentsForGroup(currentGroupId).length === 0) ? (
                <p className="text-gray-400 text-center py-8">Urna este goala</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  {getDeletedStudentsForGroup(currentGroupId).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 bg-gray-800 rounded-2xl px-4 py-3">
                      <span className="flex-1">{s.name}</span>
                      <button onClick={() => restoreStudent(s.id)} className="text-green-500 hover:text-green-400 px-2">♻️</button>
                      <button onClick={() => permanentDeleteStudent(s.id)} className="text-red-500 hover:text-red-400 px-2">🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <button onClick={() => setModal({ type: null })} className="w-full bg-gray-700 hover:bg-gray-600 py-3 rounded-2xl font-semibold transition-colors">
            Inchide
          </button>
        </ModalShell>
      )}

      {/* Popup magic la finalul unui modul */}
      {magicPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90" />
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {confetti.map((c) => (
              <div
                key={c.id} className="absolute text-2xl"
                style={{ left: `${c.left}%`, animation: `tracker-confetti-fall ${c.duration}s linear ${c.delay}s forwards` }}
              >
                {c.emoji}
              </div>
            ))}
          </div>
          <div className="tracker-magic-popup rounded-3xl p-8 text-center relative z-10 max-w-sm w-full tracker-card-shadow">
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="text-2xl font-bold text-black mb-2">Felicitari!</h3>
            <p className="text-black/90 font-semibold mb-4">
              {magicPopup.rewardType === 'stars'
                ? 'Ura! Ai colectat toate cele 16 steluțe.'
                : `Ura! Ai colectat toate cele 16 ${getRewardName(magicPopup.rewardType)}.`}
            </p>
            {magicPopup.needsNewModule ? (
              <>
                <p className="text-black/80 mb-4">Alege premiul pentru urmatorul modul:</p>
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {REWARD_TYPES.map((r) => (
                    <button
                      key={r.id} type="button" onClick={() => setNewModuleReward(r.id)}
                      className={`tracker-reward-grid-item border-2 border-gray-300 rounded-2xl p-2 flex flex-col items-center justify-center ${newModuleReward === r.id ? 'selected' : ''}`}
                    >
                      <span className="text-3xl">{r.emoji}</span>
                    </button>
                  ))}
                </div>
                <button onClick={addModuleWithReward} className="tracker-btn-primary w-full py-3 rounded-2xl font-semibold">
                  ➕ Adauga Modulul Nou
                </button>
              </>
            ) : (
              <>
                <p className="text-black/80 mb-6">Ai terminat un modul! Continua calatoria!</p>
                <div className="mb-6">
                  <div className="bg-white/80 rounded-2xl p-6 text-center hover:bg-white transition-colors">
                    <div className="text-6xl mb-2">🎮</div>
                    <div className="text-black font-semibold">Joc Magic si Premii</div>
                  </div>
                </div>
                <button onClick={() => setMagicPopup(null)} className="tracker-btn-primary w-full py-3 rounded-2xl font-semibold">
                  ✨ Continua
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Subcomponente
// ----------------------------------------------------------------------------

// Camp dinamic pentru telefoane/email-uri de parinte (PARTEA 2) - 1 input implicit,
// buton "+ Adauga" (dezactivat la MAX_CONTACTS) si o iconita de stergere langa fiecare
// input suplimentar (primul nu se poate sterge, ramane mereu vizibil).
function DynamicContactList({
  label, type, values, onChange, placeholder, addLabel,
}: {
  label: string; type: 'tel' | 'email'; values: string[]; onChange: (next: string[]) => void;
  placeholder: string; addLabel: string;
}) {
  // Defensiv: chiar daca tipul declara string[], datele pot veni direct din DB (elevi
  // vechi cu parent_phones/parent_emails null sau, dintr-o migrare partiala, un string
  // simplu) - normalizam mereu local, ca un .map() sa nu crape niciodata UI-ul.
  const safeValues = asContactList(values);
  const displayValues = safeValues.length > 0 ? safeValues : [''];

  function updateAt(index: number, value: string) {
    onChange(displayValues.map((v, i) => (i === index ? value : v)));
  }
  function removeAt(index: number) {
    onChange(displayValues.filter((_, i) => i !== index));
  }
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold mb-2">
        {label} <span className="text-gray-500 font-normal">— vizibil doar pentru admin</span>
      </label>
      <div className="space-y-2">
        {displayValues.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type={type} value={v} onChange={(e) => updateAt(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white"
            />
            {i > 0 && (
              <button
                type="button" onClick={() => removeAt(i)} title="Sterge"
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => displayValues.length < MAX_CONTACTS && onChange([...displayValues, ''])}
        disabled={displayValues.length >= MAX_CONTACTS}
        className="mt-2 text-xs font-semibold text-[#C8F023] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {addLabel} ({displayValues.length}/{MAX_CONTACTS})
      </button>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 rounded-3xl p-6 w-full max-w-md max-h-[90%] overflow-y-auto tracker-card-shadow">
        {children}
      </div>
    </div>
  );
}

const HISTORY_STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: React.ReactNode; pill: string; dot: string }> = {
  present: { label: 'Prezent', icon: <Check size={14} strokeWidth={3} />, pill: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', dot: 'bg-emerald-500' },
  absent: { label: 'Absent', icon: <XIcon size={14} strokeWidth={3} />, pill: 'bg-red-500/15 text-red-400 border border-red-500/30', dot: 'bg-red-500' },
  made_up: { label: 'Recuperat', icon: <RotateCcw size={13} strokeWidth={2.5} />, pill: 'bg-blue-500/15 text-blue-400 border border-blue-500/30', dot: 'bg-blue-500' },
};

function StudentHistoryModal({
  student, group, history, onClose,
}: {
  student: TrackerStudent; group: TrackerGroup | null;
  history: { lesson: TrackerLesson; record: TrackerAttendance | null }[];
  onClose: () => void;
}) {
  const rewardEmoji = group ? getRewardEmoji(group.reward_type) : '⭐';
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const statusOf = (r: TrackerAttendance | null): AttendanceStatus => r?.status ?? 'absent';
  const filteredHistory = history.filter(({ lesson }) => {
    if (startDate && lesson.lesson_date < startDate) return false;
    if (endDate && lesson.lesson_date > endDate) return false;
    return true;
  });
  // Baseline istoric (presence_count/absence_count, setat manual din formularul Editeaza Elev)
  // - nu are o data proprie, deci il adaugam doar cand nu e activ niciun filtru de perioada
  // (altfel un istoric de "20 prezente" ar umfla artificial un interval de o singura saptamana).
  const showBaseline = !startDate && !endDate;
  const baselinePresences = showBaseline ? student.presence_count : 0;
  const baselineAbsences = showBaseline ? student.absence_count : 0;
  const totalCount = filteredHistory.length + baselinePresences + baselineAbsences;
  const presentCount = filteredHistory.filter((h) => statusOf(h.record) === 'present').length + baselinePresences;
  const notRecoveredCount = filteredHistory.filter((h) => statusOf(h.record) === 'absent').length + baselineAbsences;
  const madeUpCount = filteredHistory.filter((h) => statusOf(h.record) === 'made_up').length;
  const absentCount = notRecoveredCount + madeUpCount;
  const starsCount = filteredHistory.reduce((sum, h) => sum + (h.record?.star_count ?? 0), 0);
  const sortedDesc = [...filteredHistory].sort((a, b) => b.lesson.session_number - a.lesson.session_number);

  // Pozitia "M{x} / L{y}" la FIECARE lectie - nu numarul brut de sedinta al grupei. Se
  // calculeaza cronologic (indiferent de filtrul de date de mai sus), pornind de la decalajul
  // manual (lesson_offset) si avansand cu 1 la fiecare prezenta/recuperare intalnita.
  const moduleLessonByLessonId = new Map<string, string>();
  let runningTotal = student.lesson_offset;
  for (const { lesson, record } of [...history].sort((a, b) => a.lesson.session_number - b.lesson.session_number)) {
    const status = statusOf(record);
    if (status === 'present' || status === 'made_up') runningTotal += 1;
    moduleLessonByLessonId.set(lesson.id, formatModuleLesson(runningTotal));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong tracker-card-shadow border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-white/10 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#C8F023] mb-1">📋 Fișa Elevului</p>
            <h3 className="text-xl font-bold">{student.name}</h3>
            {group && <p className="text-sm text-gray-400 mt-0.5">📖 {group.group_name}</p>}
          </div>
          <button
            onClick={onClose} aria-label="Inchide"
            className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pt-4 shrink-0">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Data Început</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Data Sfârșit</label>
            <input
              type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 p-4 shrink-0">
          <div className="rounded-2xl bg-white/5 border border-white/10 py-3 text-center">
            <div className="text-lg font-bold text-white">{totalCount}</div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total</div>
          </div>
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 py-3 text-center">
            <div className="text-lg font-bold text-emerald-400">{presentCount}</div>
            <div className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wide">✅ Prezențe</div>
          </div>
          <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 py-3 text-center">
            <div className="text-lg font-bold text-blue-400">{madeUpCount}</div>
            <div className="text-[10px] font-semibold text-blue-400/80 uppercase tracking-wide">🔄 Recuperări</div>
          </div>
          <div className="rounded-2xl bg-[#C8F023]/10 border border-[#C8F023]/30 py-3 text-center">
            <div className="text-lg font-bold text-[#C8F023]">{starsCount}</div>
            <div className="text-[10px] font-semibold text-[#C8F023]/80 uppercase tracking-wide">{rewardEmoji} Teme</div>
          </div>
        </div>
        {showBaseline && (baselinePresences > 0 || baselineAbsences > 0) && (
          <p className="px-4 -mt-2 mb-2 text-[11px] text-gray-500 shrink-0">
            Include istoricul manual: +{baselinePresences} prezențe / +{baselineAbsences} absențe (setate din formularul Editează Elev).
          </p>
        )}
        <div className="px-4 pb-4 shrink-0">
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 py-3 px-4 text-center text-sm">
            <span className="font-bold text-red-400">❌ Absențe: {absentCount}</span>
            <span className="text-red-400/70"> (din care {madeUpCount} recuperate, {notRecoveredCount} nerecuperate)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {sortedDesc.length === 0 ? (
            <p className="text-gray-400 text-center py-10 text-sm">
              {history.length === 0 ? 'Nicio lecție inregistrata inca pentru aceasta clasa.' : 'Nicio lecție în intervalul selectat.'}
            </p>
          ) : (
            sortedDesc.map(({ lesson, record }) => {
              const status = statusOf(record);
              const cfg = HISTORY_STATUS_CONFIG[status];
              const starCount = record?.star_count ?? 0;
              const starEligible = status !== 'absent';
              return (
                <div key={lesson.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3 py-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {moduleLessonByLessonId.get(lesson.id)}
                      {' - '}
                      <span className="text-gray-400 font-normal">
                        {new Date(lesson.lesson_date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {lesson.lesson_time ? ` · ${lesson.lesson_time}` : ''}
                      </span>
                    </div>
                    {status === 'made_up' && record?.recovery_date && (
                      <div className="text-[11px] text-blue-400/80 mt-0.5">
                        🔄 Recuperat pe {new Date(record.recovery_date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}
                      </div>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${cfg.pill}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span
                    title={starEligible ? (starCount > 0 ? `Tema facuta x${starCount}` : 'Fara tema') : 'Nu a fost prezent'}
                    className={`h-7 shrink-0 rounded-full flex items-center justify-center gap-0.5 px-2 text-sm ${starCount > 0 ? 'bg-[#C8F023] text-black' : 'w-7 bg-white/5 text-white/20'}`}
                  >
                    {rewardEmoji}{starCount > 1 && <span className="text-[11px] font-bold">×{starCount}</span>}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// PARTEA 4: director global cu toti copiii profesorului curent, din toate clasele -
// cautare live + grupare pe ziua saptamanii (dedusa din grupa fiecarui elev). Click pe
// un rand deschide FIX acelasi modal de editare elev (onSelectStudent -> openEditStudentModal
// din componenta parinte), deci orice salvare se reflecta automat si aici, si in Tracker.
function AllStudentsDrawer({
  groups, students, onClose, onSelectStudent,
}: {
  groups: TrackerGroup[]; students: TrackerStudent[]; onClose: () => void; onSelectStudent: (s: TrackerStudent) => void;
}) {
  const [search, setSearch] = useState('');
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const searchNorm = norm(search.trim());
  const filtered = !searchNorm ? students : students.filter((s) => {
    if (norm(s.name).includes(searchNorm)) return true;
    if (s.short_name && norm(s.short_name).includes(searchNorm)) return true;
    return false;
  });

  function timeOf(s: TrackerStudent) {
    return groupsById.get(s.group_id)?.time_of_day || '99:99';
  }
  function sortByTimeThenName(list: TrackerStudent[]) {
    return [...list].sort((a, b) => {
      const ta = timeOf(a);
      const tb = timeOf(b);
      return ta === tb ? a.name.localeCompare(b.name) : ta.localeCompare(tb);
    });
  }

  const byDay = DAYS.map((d) => ({
    ...d,
    students: sortByTimeThenName(filtered.filter((s) => groupsById.get(s.group_id)?.day_of_week === d.id)),
  })).filter((d) => d.students.length > 0);

  const noDay = sortByTimeThenName(
    filtered.filter((s) => !DAYS.some((d) => d.id === groupsById.get(s.group_id)?.day_of_week))
  );

  return (
    <div className="p-6 pt-20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#C8F023]">👶 Lista Copiilor</h3>
        <button
          onClick={onClose} aria-label="Inchide"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <XIcon size={16} />
        </button>
      </div>

      <div className="relative mb-5">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
          placeholder="Cauta un copil..."
          className="w-full bg-gray-800 border border-gray-700 rounded-2xl pl-11 pr-4 py-3 text-white placeholder:text-gray-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-center py-10 text-sm">Niciun rezultat</p>
      ) : (
        <div className="space-y-6">
          {byDay.map((d) => (
            <div key={d.id}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C8F023] mb-2">{d.label}</h4>
              <div className="space-y-2">
                {d.students.map((s) => (
                  <StudentDirectoryRow key={s.id} student={s} group={groupsById.get(s.group_id) ?? null} onClick={() => onSelectStudent(s)} />
                ))}
              </div>
            </div>
          ))}
          {noDay.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Fara zi stabilita</h4>
              <div className="space-y-2">
                {noDay.map((s) => (
                  <StudentDirectoryRow key={s.id} student={s} group={groupsById.get(s.group_id) ?? null} onClick={() => onSelectStudent(s)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudentDirectoryRow({
  student, group, onClick,
}: { student: TrackerStudent; group: TrackerGroup | null; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-2xl px-4 py-3 transition-colors flex items-center justify-between gap-2"
    >
      <div className="min-w-0">
        <div className="font-semibold truncate">
          {student.name}
          {student.short_name && <span className="text-gray-400 font-normal"> ({student.short_name})</span>}
        </div>
        {group && (
          <div className="text-[11px] text-gray-500 truncate">
            📖 {group.group_name}{group.time_of_day ? ` · ${group.time_of_day}` : ''}
          </div>
        )}
      </div>
      <ChevronRight size={16} className="text-gray-500 shrink-0" />
    </button>
  );
}

function GroupCard({
  group, studentCount, avgProgress, onOpen, onEdit,
}: { group: TrackerGroup; studentCount: number; avgProgress: number; onOpen: () => void; onEdit: () => void }) {
  const rewardEmoji = getRewardEmoji(group.reward_type);
  const day = dayLabel(group.day_of_week);
  return (
    <div className="bg-white text-black rounded-3xl p-5 tracker-card-shadow">
      <h3 className="text-lg font-bold mb-2">📖 {group.group_name}</h3>
      {(day || group.time_of_day) && (
        <p className="inline-flex items-center gap-1 text-xs font-semibold text-black/70 bg-black/5 rounded-full px-2.5 py-1 mb-2">
          🗓️ {day ?? 'Fara zi'}{group.time_of_day ? ` · ${group.time_of_day}` : ''}
        </p>
      )}
      <p className="text-gray-600 text-sm mb-1">👥 {studentCount} elevi</p>
      <p className="text-gray-600 text-sm mb-1">📚 {group.module_count || 1} module</p>
      <p className="text-gray-600 text-sm mb-3">{rewardEmoji} Progres mediu: {avgProgress}%</p>
      <div className="flex gap-2">
        <button onClick={onOpen} className="tracker-btn-primary flex-1 py-2 rounded-2xl font-semibold text-sm">
          🚀 Acceseaza
        </button>
        <button onClick={onEdit} className="bg-gray-200 hover:bg-gray-300 text-black px-3 py-2 rounded-2xl font-semibold text-sm transition-colors">
          ⚙️
        </button>
      </div>
    </div>
  );
}

function HomeMenu({
  recentGroups, deletedCount, onOpenClass, onCreate, onTrash,
}: {
  recentGroups: TrackerGroup[]; deletedCount: number;
  onOpenClass: (id: string) => void; onCreate: () => void; onTrash: () => void;
}) {
  return (
    <>
      <h3 className="text-lg font-bold mb-4 text-[#C8F023]">📚 Meniu Principal</h3>
      {recentGroups.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-400 text-sm mb-2">Clase recente:</p>
          <div className="space-y-2">
            {recentGroups.map((g) => (
              <button key={g.id} onClick={() => onOpenClass(g.id)} className="w-full text-left bg-gray-800 hover:bg-gray-700 px-4 py-3 rounded-2xl transition-colors">
                📖 {g.group_name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-3">
        <button onClick={onCreate} className="w-full tracker-btn-primary py-3 rounded-2xl font-semibold">
          ➕ Adauga Clasa Noua
        </button>
        <button onClick={onTrash} className="w-full bg-gray-800 hover:bg-gray-700 py-3 rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2">
          🗑️ Urna
          {deletedCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{deletedCount}</span>}
        </button>
      </div>
    </>
  );
}

function ClassMenu({
  group, otherGroups, deletedStudentsCount, onOpenClass, onAddModule, onRemoveModule, onAddStudent, onTrashStudents, onDeleteClass, onGoHome,
}: {
  group: TrackerGroup; otherGroups: TrackerGroup[]; deletedStudentsCount: number;
  onOpenClass: (id: string) => void; onAddModule: () => void; onRemoveModule: () => void;
  onAddStudent: () => void; onTrashStudents: () => void; onDeleteClass: () => void; onGoHome: () => void;
}) {
  return (
    <>
      <h3 className="text-lg font-bold mb-4 text-[#C8F023]">📚 {group.group_name}</h3>
      {otherGroups.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-400 text-sm mb-2">Schimba clasa:</p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {otherGroups.map((g) => (
              <button key={g.id} onClick={() => onOpenClass(g.id)} className="w-full text-left bg-gray-800 hover:bg-gray-700 px-4 py-3 rounded-2xl transition-colors text-sm">
                📖 {g.group_name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-3">
        <button onClick={onAddModule} disabled={(group.module_count || 1) >= 30} className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 py-3 rounded-2xl font-semibold transition-colors">
          ➕ Adauga Modul ({group.module_count || 1}/30)
        </button>
        <button onClick={onRemoveModule} disabled={(group.module_count || 1) <= 1} className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 py-3 rounded-2xl font-semibold transition-colors">
          🗑️ Sterge Modul
        </button>
        <button onClick={onAddStudent} className="w-full tracker-btn-primary py-3 rounded-2xl font-semibold">
          ➕ Adauga Elev
        </button>
        <button onClick={onTrashStudents} className="w-full bg-gray-800 hover:bg-gray-700 py-3 rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2">
          🗑️ Urna Elevi
          {deletedStudentsCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{deletedStudentsCount}</span>}
        </button>
        <button onClick={onDeleteClass} className="w-full bg-red-500 hover:bg-red-600 py-3 rounded-2xl font-semibold transition-colors">
          🗑️ Sterge Clasa
        </button>
        <button onClick={onGoHome} className="w-full bg-gray-800 hover:bg-gray-700 py-3 rounded-2xl font-semibold transition-colors">
          🏠 Inapoi la Clase
        </button>
      </div>
    </>
  );
}

// Zona de link Google Meet din antetul clasei: buton subtil cand nu exista link,
// link clickabil (accent #C8F023) + editare inline cand exista - salvare asincrona
// prin onSave (patchGroup optimist), fara reincarcarea paginii.
function MeetLinkControl({
  meetLink, onSave,
}: { meetLink: string | null; onSave: (meetLink: string | null) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meetLink ?? '');
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(meetLink ?? '');
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(meetLink ?? '');
    setEditing(false);
  }

  async function save() {
    const trimmed = draft.trim();
    const normalized = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
    setSaving(true);
    try {
      await onSave(normalized || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 bg-gray-900/70 border border-gray-700 rounded-2xl px-3 py-2 w-full sm:w-auto">
        <Video size={16} className="text-[#C8F023] shrink-0" />
        <input
          type="text" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancelEdit(); }}
          placeholder="https://meet.google.com/xxx-xxxx-xxx"
          className="flex-1 min-w-[200px] bg-transparent text-sm placeholder:text-gray-500 focus:outline-none"
        />
        <button
          onClick={save} disabled={saving} title="Salveaza"
          className="tracker-btn-primary w-7 h-7 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Check size={14} strokeWidth={3} />
        </button>
        <button
          onClick={cancelEdit} disabled={saving} title="Renunta"
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
        >
          <XIcon size={14} strokeWidth={3} />
        </button>
      </div>
    );
  }

  if (!meetLink) {
    return (
      <button
        onClick={startEdit}
        className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-[#C8F023] border border-dashed border-gray-700 hover:border-[#C8F023]/50 rounded-2xl px-3 py-2 transition-colors"
      >
        <Video size={15} /> + Adaugă link Meet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={meetLink} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm font-semibold text-[#C8F023] border border-[#C8F023]/40 hover:border-[#C8F023] hover:bg-[#C8F023]/10 rounded-2xl px-3 py-2 transition-colors max-w-[240px]"
        title={meetLink}
      >
        <Video size={15} className="shrink-0" />
        <span className="truncate">Google Meet</span>
        <ExternalLink size={13} className="shrink-0 opacity-70" />
      </a>
      <button
        onClick={startEdit} title="Editeaza link-ul"
        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

function ClassView({
  isAdmin, group, students, lessons, attendance, onBack, onEditStudent, onRequestNewLesson, onRequestRecovery, onSetAttendanceStatus, onCycleStar, onDeleteLesson, onOpenHistory, onSaveMeetLink, onSaveLessonHomework,
  notifyState, connectedState, onSendNotification, onSetConnectionStatus,
}: {
  isAdmin: boolean;
  group: TrackerGroup; students: (TrackerStudent & { rank: number })[]; lessons: TrackerLesson[]; attendance: TrackerAttendance[];
  onBack: () => void; onEditStudent: (s: TrackerStudent) => void;
  onRequestNewLesson: (groupId: string) => void;
  onRequestRecovery: (studentId: string, lessonId: string) => void;
  onSetAttendanceStatus: (studentId: string, lessonId: string, status: AttendanceStatus) => void;
  onCycleStar: (studentId: string, lessonId: string) => void;
  onDeleteLesson: (lessonId: string) => void;
  onOpenHistory: (studentId: string) => void;
  onSaveMeetLink: (meetLink: string | null) => void | Promise<void>;
  onSaveLessonHomework: (lessonId: string, note: string) => void | Promise<void>;
  notifyState: Record<string, ButtonState>; connectedState: Record<string, ButtonState>;
  onSendNotification: (student: TrackerStudent) => void;
  onSetConnectionStatus: (student: TrackerStudent, status: 'conectat' | 'neconectat') => void;
}) {
  const rewardEmoji = getRewardEmoji(group.reward_type);
  const groupLessons = lessons.filter((l) => l.group_id === group.id);
  const groupLessonIds = new Set(groupLessons.map((l) => l.id));
  const groupAttendance = attendance.filter((a) => groupLessonIds.has(a.lesson_id));
  // Total afisat = istoric (presence_count/absence_count, salvat manual pt elevii cu istoric
  // dinainte de Tracker) + dinamic (calculat din lectiile bifate efectiv in platforma).
  const attendanceCountFor = (studentId: string) => {
    const dynamic = groupAttendance.filter((a) => a.student_id === studentId && (a.status === 'present' || a.status === 'made_up')).length;
    const historic = students.find((s) => s.id === studentId)?.presence_count ?? 0;
    return dynamic + historic;
  };
  const absenceCountFor = (studentId: string) => {
    const dynamic = groupAttendance.filter((a) => a.student_id === studentId && a.status === 'absent').length;
    const historic = students.find((s) => s.id === studentId)?.absence_count ?? 0;
    return dynamic + historic;
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-[#C8F023] font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity">
        ← Inapoi la Clase
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl md:text-2xl font-bold">📚 {group.group_name}</h2>
        <MeetLinkControl meetLink={group.meet_link} onSave={onSaveMeetLink} />
      </div>

      {/* Clasament + Prezenta comasate: fiecare rand = loc in clasament + nume | butoane de
          prezenta (vezi AttendanceBoard mai jos). */}
      <AttendanceBoard
        group={group} students={students} lessons={groupLessons} attendance={groupAttendance}
        onRequestNewLesson={onRequestNewLesson} onRequestRecovery={onRequestRecovery}
        onSetStatus={onSetAttendanceStatus} onCycleStar={onCycleStar} onDeleteLesson={onDeleteLesson}
        onSaveLessonHomework={onSaveLessonHomework} onOpenHistory={onOpenHistory}
      />

      <div className="space-y-4">
        {students.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Adauga elevi din meniu</p>
        ) : (
          students.map((s, i) => (
            <StudentCard
              key={s.id} isAdmin={isAdmin} student={s} index={i} totalStudents={students.length} moduleCount={group.module_count || 1}
              rewardEmoji={rewardEmoji} attendanceCount={attendanceCountFor(s.id)} absenceCount={absenceCountFor(s.id)}
              onEdit={() => onEditStudent(s)}
              onOpenHistory={() => onOpenHistory(s.id)}
              notifyStatus={notifyState[s.id] ?? 'idle'}
              connectedStatus={connectedState[s.id] ?? 'idle'}
              onSendNotification={() => onSendNotification(s)}
              onSetConnectionStatus={(status) => onSetConnectionStatus(s, status)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AttendanceBoard({
  group, students, lessons, attendance, onRequestNewLesson, onRequestRecovery, onSetStatus, onCycleStar, onDeleteLesson, onSaveLessonHomework, onOpenHistory,
}: {
  group: TrackerGroup; students: (TrackerStudent & { rank: number })[]; lessons: TrackerLesson[]; attendance: TrackerAttendance[];
  onRequestNewLesson: (groupId: string) => void;
  onRequestRecovery: (studentId: string, lessonId: string) => void;
  onSetStatus: (studentId: string, lessonId: string, status: AttendanceStatus) => void;
  onCycleStar: (studentId: string, lessonId: string) => void;
  onDeleteLesson: (lessonId: string) => void;
  onSaveLessonHomework: (lessonId: string, note: string) => void | Promise<void>;
  onOpenHistory: (studentId: string) => void;
}) {
  const rewardEmoji = getRewardEmoji(group.reward_type);
  const sortedLessons = [...lessons].sort((a, b) => a.session_number - b.session_number);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(sortedLessons.length > 0 ? sortedLessons[sortedLessons.length - 1].id : null);
  const [lessonMenuOpen, setLessonMenuOpen] = useState(false);
  const prevLenRef = useRef(sortedLessons.length);

  // Urmareste lista de lectii a grupei: cand apare una noua (creata din modalul "+ Lectie
  // noua"), sarim automat pe ea. Daca lectia selectata a fost stearsa (sau nu era nimic
  // selectat), trecem pe ultima ramasa - sau pe null daca nu mai exista nicio lectie.
  useEffect(() => {
    const grew = sortedLessons.length > prevLenRef.current;
    const stillExists = sortedLessons.some((l) => l.id === selectedLessonId);
    if (grew || (!stillExists && sortedLessons.length > 0)) {
      setSelectedLessonId(sortedLessons[sortedLessons.length - 1].id);
    } else if (!stillExists) {
      setSelectedLessonId(null);
    }
    prevLenRef.current = sortedLessons.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedLessons.length]);

  const selectedIndex = sortedLessons.findIndex((l) => l.id === selectedLessonId);
  const selectedLesson = selectedIndex >= 0 ? sortedLessons[selectedIndex] : null;

  // Notita de tema a lectiei selectate - stare locala (salvata la blur), resincronizata
  // ori de cate ori profesorul schimba lectia selectata din navigare.
  const [homeworkDraft, setHomeworkDraft] = useState(selectedLesson?.homework_note ?? '');
  useEffect(() => { setHomeworkDraft(selectedLesson?.homework_note ?? ''); }, [selectedLesson?.id, selectedLesson?.homework_note]);

  function goPrev() { if (selectedIndex > 0) setSelectedLessonId(sortedLessons[selectedIndex - 1].id); }
  function goNext() { if (selectedIndex >= 0 && selectedIndex < sortedLessons.length - 1) setSelectedLessonId(sortedLessons[selectedIndex + 1].id); }

  return (
    <div className="mb-6 bg-gray-900 border border-gray-700 rounded-3xl p-4 tracker-card-shadow">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h3 className="text-lg font-semibold">📋 Prezență &amp; Stelute</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRequestNewLesson(group.id)} title="Adauga lectie noua"
            className="tracker-btn-primary w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          >
            <Plus size={16} strokeWidth={3} />
          </button>
          {selectedLesson && (
            <button
              onClick={() => onDeleteLesson(selectedLesson.id)}
              title="Sterge lectia curenta"
              className="text-gray-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-md transition-colors shrink-0"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Legendă: ✓ = Prezent &nbsp;|&nbsp; ✗ = Absent &nbsp;|&nbsp; 🔄 = Recuperat &nbsp;|&nbsp; ⭐ = Temă
      </p>

      {sortedLessons.length === 0 ? (
        <p className="text-gray-400 text-center py-6 text-sm">Nicio lectie inca. Apasa + pentru a adauga prima lectie.</p>
      ) : selectedLesson && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={goPrev} disabled={selectedIndex <= 0} title="Lectia anterioara"
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLessonMenuOpen((v) => !v)}
                  aria-expanded={lessonMenuOpen}
                  className="flex items-center gap-1 bg-transparent font-bold text-base md:text-lg cursor-pointer focus:outline-none"
                >
                  {formatModuleLesson(selectedLesson.session_number)}
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${lessonMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {lessonMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLessonMenuOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 shadow-xl">
                      {sortedLessons.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => { setSelectedLessonId(l.id); setLessonMenuOpen(false); }}
                          className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm transition-colors ${l.id === selectedLesson.id ? 'bg-gray-800 text-[#C8F023]' : 'text-white hover:bg-gray-800'}`}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {formatModuleLesson(l.session_number)} - {new Date(l.lesson_date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {l.lesson_time ? `, ${l.lesson_time}` : ''}
                          </span>
                          <span className="shrink-0 rounded-md border border-[#C8F023]/40 bg-black px-1.5 py-0.5 text-[10px] font-semibold text-[#C8F023]">
                            {LESSON_FORMAT_LABEL[l.format]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={goNext} disabled={selectedIndex >= sortedLessons.length - 1} title="Lectia urmatoare"
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <input
              type="text"
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              onBlur={() => { if (homeworkDraft !== (selectedLesson.homework_note ?? '')) onSaveLessonHomework(selectedLesson.id, homeworkDraft); }}
              placeholder="Notează tema pentru data viitoare..."
              className="min-w-[160px] flex-1 bg-gray-800/60 border border-gray-700 rounded-xl px-3 py-1.5 text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#C8F023]/50"
            />
          </div>

          {/* Clasament integrat direct in lista de Prezenta - fara panou/bara separata.
              Sortam descrescator dupa steluțe inainte de map, ca rand-ul (locul in clasament)
              afisat in stanga sa fie mereu corect indiferent de ordinea primita ca prop. */}
          <div className="space-y-2">
            {[...students].sort((a, b) => b.progress - a.progress).map((s) => {
              const record = attendance.find((a) => a.lesson_id === selectedLesson.id && a.student_id === s.id);
              const status: AttendanceStatus = record?.status ?? 'absent';
              const starCount = record?.star_count ?? 0;
              const starDisabled = status === 'absent';
              return (
                <div key={s.id} className="flex flex-row items-center justify-between gap-2 px-3 py-2.5 border border-gray-700/60 rounded-2xl bg-gray-800/70">
                  <button
                    type="button" onClick={() => onOpenHistory(s.id)} title="Vezi fisa elevului"
                    className="flex items-center gap-2 min-w-0 text-left group/name"
                  >
                    {s.rank <= 3 ? (
                      <span className="shrink-0 text-2xl leading-none">{MEDALS[s.rank - 1]}</span>
                    ) : (
                      <span className="shrink-0 text-xs font-bold whitespace-nowrap text-gray-400">Locul {s.rank}</span>
                    )}
                    <span className="truncate font-semibold text-sm underline decoration-transparent group-hover/name:decoration-white/40 underline-offset-2">
                      {s.name}
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => !starDisabled && onCycleStar(s.id, selectedLesson.id)}
                      disabled={starDisabled}
                      title={starDisabled ? 'Elevul trebuie sa fie prezent sau sa fi recuperat lectia' : `Tema facuta x${starCount} - click pentru a schimba`}
                      className={`h-8 min-w-8 px-1.5 rounded-full flex items-center justify-center gap-0.5 text-sm font-bold transition-colors ${starDisabled ? 'bg-gray-900 text-gray-700 opacity-40 cursor-not-allowed' : starCount > 0 ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      {rewardEmoji}{starCount > 1 && <span className="text-[11px] font-bold">×{starCount}</span>}
                    </button>
                    <button
                      onClick={() => onSetStatus(s.id, selectedLesson.id, 'present')} title="Prezent"
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${status === 'present' ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}
                    >
                      <Check size={16} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => onSetStatus(s.id, selectedLesson.id, 'absent')} title="Absent"
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${status === 'absent' ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}
                    >
                      <XIcon size={16} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => onRequestRecovery(s.id, selectedLesson.id)} title="Recuperat"
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${status === 'made_up' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}
                    >
                      <RotateCcw size={15} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StudentCard({
  isAdmin, student, index, totalStudents, moduleCount, rewardEmoji, attendanceCount, absenceCount, onEdit, onOpenHistory,
  notifyStatus, connectedStatus, onSendNotification, onSetConnectionStatus,
}: {
  isAdmin: boolean;
  student: TrackerStudent & { rank: number }; index: number; totalStudents: number; moduleCount: number;
  rewardEmoji: string; attendanceCount: number; absenceCount: number; onEdit: () => void; onOpenHistory: () => void;
  notifyStatus: ButtonState; connectedStatus: ButtonState;
  onSendNotification: () => void; onSetConnectionStatus: (status: 'conectat' | 'neconectat') => void;
}) {
  const levelInfo = getLevelInfo(student.progress);
  const badges = getBadgesForPerson(student.id, student.progress);
  const visibleBadges = badges.slice(-5);
  const progressInLevel = student.progress % 16;
  const progressPercent = (progressInLevel / 16) * 100;
  const studentColor = PROGRESS_COLORS[index % PROGRESS_COLORS.length];
  const maxSteps = moduleCount * 16;

  return (
    <div className="bg-white text-black rounded-3xl p-5 tracker-card-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                type="button" onClick={onOpenHistory}
                className="text-lg font-bold underline decoration-transparent hover:decoration-black/40 underline-offset-2 transition-colors text-left"
                title="Vezi fisa elevului"
              >
                {student.name}
              </button>
            ) : (
              <span className="text-lg font-bold">{student.name}</span>
            )}
            {totalStudents >= 2 && student.rank <= 3 && <span className="text-3xl ml-2">{MEDALS[student.rank - 1]}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <div className="tracker-level-badge inline-block px-3 py-1 rounded-full text-white text-sm font-semibold">
              Nivel {levelInfo.level} - {levelInfo.name}
            </div>
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
              🗓️ {attendanceCount} prezențe
            </div>
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-semibold">
              ❌ {absenceCount} absențe
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-[#C8F023]">{student.progress}/{maxSteps}</span>
        </div>
      </div>

      {visibleBadges.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {visibleBadges.map((badge) => (
            <span key={badge} className="tracker-earned-badge text-xs px-2 py-1 rounded-full text-black font-semibold">{badge}</span>
          ))}
          {badges.length > 5 && <span className="text-xs text-gray-400">+{badges.length - 5} mai mult</span>}
        </div>
      )}

      <div className="bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
        <div className="tracker-progress-bar h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, backgroundImage: studentColor, backgroundSize: '200% 100%' }} />
      </div>

      <div className="grid grid-cols-8 gap-1 mb-4">
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${i < progressInLevel ? 'bg-[#C8F023]' : 'bg-gray-700 opacity-50'}`}>
            {rewardEmoji}
          </div>
        ))}
      </div>

      {/* RBAC: Fisa Elevului / Editeaza Elev sunt vizibile DOAR pentru admin - un profesor
          vede doar butoanele de notificare de mai jos. */}
      {isAdmin && (
        <div className="flex gap-2">
          <button onClick={onOpenHistory} className="bg-gray-200 hover:bg-gray-300 flex-1 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors">
            📋 Fisa elevului
          </button>
          <button onClick={onEdit} className="bg-gray-200 hover:bg-gray-300 flex-1 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors">
            ⚙️ Editeaza elev
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onSendNotification}
          disabled={notifyStatus === 'loading'}
          title="Trimite Notificare"
          className={`flex-1 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed ${
            notifyStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-amber-400 hover:bg-amber-300 text-black'
          }`}
        >
          {notifyStatus === 'loading' ? (
            <span className="tracker-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          ) : notifyStatus === 'success' ? (
            'Trimis ✔️'
          ) : (
            '🔔 Trimite Notificare'
          )}
        </button>
      </div>

      {/* Status conectare, trimis catre admini (vezi handleChildConnectionStatus) - vizibil
          pentru admin si profesor deopotriva, la fel ca butonul de notificare de mai sus. */}
      <div className="flex gap-2 w-full mt-2">
        <button
          type="button"
          onClick={() => onSetConnectionStatus('conectat')}
          disabled={connectedStatus === 'loading'}
          title="S-a conectat"
          className="flex-1 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
        >
          {connectedStatus === 'loading' ? (
            <span className="tracker-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          ) : (
            '✅ S-a conectat'
          )}
        </button>
        <button
          type="button"
          onClick={() => onSetConnectionStatus('neconectat')}
          disabled={connectedStatus === 'loading'}
          title="Nu s-a conectat"
          className="flex-1 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed bg-rose-100 hover:bg-rose-200 text-rose-800"
        >
          {connectedStatus === 'loading' ? (
            <span className="tracker-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          ) : (
            '❌ Nu s-a conectat'
          )}
        </button>
      </div>
    </div>
  );
}
