'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X as XIcon, RotateCcw, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TrackerGroup, TrackerStudent, TrackerLesson, TrackerAttendance, AttendanceStatus } from '@/lib/types';

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
const MEDAL_CLASSES = ['tracker-medal-gold', 'tracker-medal-silver', 'tracker-medal-bronze'];

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

type ToastItem = { id: string; message: string; type: 'success' | 'error' };
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
  | { type: 'newLesson'; groupId: string }
  | { type: 'recordRecovery'; studentId: string; lessonId: string };

export default function ProgressTracker({
  teacherId, initialGroups, initialStudents, initialLessons, initialAttendance,
}: {
  teacherId: string; initialGroups: TrackerGroup[]; initialStudents: TrackerStudent[];
  initialLessons: TrackerLesson[]; initialAttendance: TrackerAttendance[];
}) {
  const supabase = useMemo(() => createClient(), []);

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

  const [createForm, setCreateForm] = useState<{ name: string; count: number; reward: string; names: string[]; day: string | null; time: string }>(
    { name: '', count: 1, reward: 'stars', names: [''], day: null, time: '' }
  );
  const [editClassName, setEditClassName] = useState('');
  const [editClassDay, setEditClassDay] = useState<string | null>(null);
  const [editClassTime, setEditClassTime] = useState('');
  const [addStudentName, setAddStudentName] = useState('');
  const [editStudentName, setEditStudentName] = useState('');
  const [newModuleReward, setNewModuleReward] = useState('stars');
  const [searchQuery, setSearchQuery] = useState('');
  const [newLessonForm, setNewLessonForm] = useState({ date: nowDate(), time: nowTime() });
  const [recoveryForm, setRecoveryForm] = useState({ date: nowDate(), time: nowTime() });

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
      if (previous) setStudents((ss) => ss.map((s) => (s.id === id ? previous : s)));
      showToast('Eroare', 'error');
      return null;
    }
    setStudents((ss) => ss.map((s) => (s.id === id ? (data as TrackerStudent) : s)));
    return data as TrackerStudent;
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    const name = createForm.name.trim();
    const names = createForm.names.map((n) => n.trim()).filter(Boolean);
    if (!name) return showToast('Introdu numele clasei', 'error');
    if (names.length === 0) return showToast('Adauga cel putin un elev', 'error');
    if (totalDataCount + names.length + 1 >= 999) return showToast('Limita de date atinsa (999)', 'error');

    setBusy(true);
    const { data: group, error } = await supabase.from('tracker_groups')
      .insert({
        teacher_id: teacherId, group_name: name, module_count: 1, reward_type: createForm.reward,
        day_of_week: createForm.day, time_of_day: createForm.time || null,
      })
      .select().single();
    if (error || !group) { setBusy(false); return showToast('Eroare la creare clasa', 'error'); }

    const { data: newStudents, error: sErr } = await supabase.from('tracker_students')
      .insert(names.map((n) => ({ teacher_id: teacherId, group_id: group.id, name: n, progress: 0 })))
      .select();
    setBusy(false);

    setGroups((gs) => [...gs, group as TrackerGroup]);
    if (newStudents) setStudents((ss) => [...ss, ...(newStudents as TrackerStudent[])]);
    if (sErr) showToast('Eroare la creare elevi', 'error');

    setModal({ type: null });
    setCreateForm({ name: '', count: 1, reward: 'stars', names: [''], day: null, time: '' });
    showToast('Clasa creata cu succes!');
  }

  async function handleEditClass(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    const name = editClassName.trim();
    if (!name) return showToast('Introdu numele clasei', 'error');
    const ok = await patchGroup(groupId, { group_name: name, day_of_week: editClassDay, time_of_day: editClassTime || null });
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

    const { data, error } = await supabase.from('tracker_students')
      .insert({ teacher_id: teacherId, group_id: currentGroupId, name, progress: 0 }).select().single();
    if (error || !data) return showToast('Eroare', 'error');
    setStudents((ss) => [...ss, data as TrackerStudent]);
    setModal({ type: null });
    setAddStudentName('');
    showToast('Elev adaugat!');
  }

  async function handleEditStudent(e: React.FormEvent, studentId: string) {
    e.preventDefault();
    const name = editStudentName.trim();
    if (!name) return showToast('Introdu numele elevului', 'error');
    const ok = await patchStudent(studentId, { name });
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

  // Creeaza o lectie noua (sedinta) pentru o grupa - numerotata secvential. Tipul se deduce
  // AUTOMAT din numarul de elevi (1 = individuala, >1 = grup) - fara alegere manuala, si
  // alimenteaza direct Payslip-ul din /registru (pe luna extrasa din data lectiei).
  async function createLesson(groupId: string, lessonDate: string, lessonTime: string) {
    const group = getGroupById(groupId);
    if (!group) return undefined;
    const groupLessons = lessons.filter((l) => l.group_id === groupId);
    const nextNumber = groupLessons.length === 0 ? 1 : Math.max(...groupLessons.map((l) => l.session_number)) + 1;
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

  // Prezenta (status) e complet separata de steluta: schimbarea statusului nu acorda
  // niciodata steluta automat. Daca elevul devine "absent", steluta acordata anterior
  // se retrage (progresul scade), pentru ca ramane consistent cu regula de business.
  // recoveryDate/recoveryTime se completeaza doar cand status = 'made_up' (sesiune 1-la-1) -
  // aceasta data alimenteaza automat coloana "Recuperari" din Payslip-ul din /registru.
  async function setAttendanceStatus(
    studentId: string, lessonId: string, status: AttendanceStatus, recoveryDate?: string, recoveryTime?: string
  ) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const group = getGroupById(student.group_id);
    if (!group) return;
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    const prevStar = current?.has_star ?? false;
    const nextStar = status === 'absent' ? false : prevStar;
    const nextRecoveryDate = status === 'made_up' ? (recoveryDate ?? current?.recovery_date ?? nowDate()) : null;
    const nextRecoveryTime = status === 'made_up' ? (recoveryTime ?? current?.recovery_time ?? null) : null;

    const previousAttendance = attendance;
    if (current) {
      setAttendance((as) => as.map((a) => (a.id === current.id
        ? { ...a, status, has_star: nextStar, recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime } : a)));
    } else {
      const tempId = nextLocalId();
      setAttendance((as) => [...as, {
        id: tempId, teacher_id: group.teacher_id, lesson_id: lessonId, student_id: studentId,
        status, has_star: nextStar, recovery_date: nextRecoveryDate, recovery_time: nextRecoveryTime,
        updated_at: new Date().toISOString(),
      }]);
    }

    const { data, error } = await supabase.from('tracker_attendance')
      .upsert(
        {
          teacher_id: group.teacher_id, lesson_id: lessonId, student_id: studentId, status, has_star: nextStar,
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

    if (prevStar && !nextStar) await applyStarDelta(studentId, -1, group);
  }

  function openNewLessonModal(groupId: string) {
    setNewLessonForm({ date: nowDate(), time: nowTime() });
    setModal({ type: 'newLesson', groupId });
  }

  function openRecoveryModal(studentId: string, lessonId: string) {
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    setRecoveryForm({ date: current?.recovery_date ?? nowDate(), time: current?.recovery_time ?? nowTime() });
    setModal({ type: 'recordRecovery', studentId, lessonId });
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

  // Steluta se acorda strict daca elevul a fost prezent sau a recuperat lectia - niciodata
  // pentru o lectie marcata "absent". Profesorul o poate bifa/debifa oricand, retroactiv.
  async function toggleStar(studentId: string, lessonId: string) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const group = getGroupById(student.group_id);
    if (!group) return;
    const current = attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
    if (!current || current.status === 'absent') {
      return showToast('Elevul trebuie sa fie prezent sau sa fi recuperat lectia', 'error');
    }
    const nextStar = !current.has_star;
    const maxSteps = (group.module_count || 1) * 16;
    if (nextStar && student.progress >= maxSteps) return showToast('Adauga un modul nou pentru a continua!', 'error');

    const previousAttendance = attendance;
    setAttendance((as) => as.map((a) => (a.id === current.id ? { ...a, has_star: nextStar } : a)));
    const { data, error } = await supabase.from('tracker_attendance')
      .update({ has_star: nextStar }).eq('id', current.id).select().single();
    if (error || !data) {
      setAttendance(previousAttendance);
      return showToast('Eroare', 'error');
    }
    setAttendance((as) => as.map((a) => (a.id === current.id ? (data as TrackerAttendance) : a)));
    await applyStarDelta(studentId, nextStar ? 1 : -1, group);
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
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-bold">🚀 Progress Tracker</h1>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-10 h-10 bg-[#C8F023] rounded-xl flex flex-col items-center justify-center gap-1.5 z-50"
            aria-label="Meniu"
          >
            <span className={`burger-line w-5 h-0.5 bg-black rounded transition-all ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`burger-line w-5 h-0.5 bg-black rounded transition-all ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`burger-line w-5 h-0.5 bg-black rounded transition-all ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        {view === 'home' ? (
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
                            setEditClassName(group.group_name); setEditClassDay(group.day_of_week); setEditClassTime(group.time_of_day ?? '');
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
                            setEditClassName(group.group_name); setEditClassDay(group.day_of_week); setEditClassTime(group.time_of_day ?? '');
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
            group={currentGroup}
            students={rankStudents([...getStudentsForGroup(currentGroup.id)].sort((a, b) => b.progress - a.progress))}
            lessons={lessons}
            attendance={attendance}
            onBack={goHome}
            onEditStudent={(s) => { setEditStudentName(s.name); setModal({ type: 'editStudent', studentId: s.id }); }}
            onRequestNewLesson={openNewLessonModal}
            onRequestRecovery={openRecoveryModal}
            onSetAttendanceStatus={setAttendanceStatus}
            onToggleStar={toggleStar}
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
              onCreate={() => { setCreateForm({ name: '', count: 1, reward: 'stars', names: [''], day: null, time: '' }); setModal({ type: 'createClass' }); setMenuOpen(false); }}
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
              onAddStudent={() => { setAddStudentName(''); setModal({ type: 'addStudent' }); setMenuOpen(false); }}
              onTrashStudents={() => { setModal({ type: 'trashStudents' }); setMenuOpen(false); }}
              onDeleteClass={() => { setModal({ type: 'confirmDeleteClass', groupId: currentGroup.id }); setMenuOpen(false); }}
              onGoHome={goHome}
            />
          ) : null}
        </div>
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
              <label className="block text-sm font-semibold mb-2">Numele Lectiei</label>
              <input
                type="text" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ex: M1 - Luni - 19:00" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Ziua saptamanii</label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button" onClick={() => setCreateForm((f) => ({ ...f, day: null }))}
                  className={`py-2 rounded-2xl font-semibold text-xs transition-colors ${createForm.day === null ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-white'}`}
                >
                  Nespecificat
                </button>
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
              <label className="block text-sm font-semibold mb-2">Ora (optional)</label>
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
              <label className="block text-sm font-semibold mb-2">Numele elevului</label>
              <input
                type="text" value={addStudentName} onChange={(e) => setAddStudentName(e.target.value)}
                placeholder="Nume elev" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
              />
            </div>
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
                <label className="block text-sm font-semibold mb-2">Numele Elevului</label>
                <input
                  type="text" value={editStudentName} onChange={(e) => setEditStudentName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white" required autoFocus
                />
              </div>
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
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 rounded-3xl p-6 w-full max-w-md max-h-[90%] overflow-y-auto tracker-card-shadow">
        {children}
      </div>
    </div>
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

function ClassView({
  group, students, lessons, attendance, onBack, onEditStudent, onRequestNewLesson, onRequestRecovery, onSetAttendanceStatus, onToggleStar,
}: {
  group: TrackerGroup; students: (TrackerStudent & { rank: number })[]; lessons: TrackerLesson[]; attendance: TrackerAttendance[];
  onBack: () => void; onEditStudent: (s: TrackerStudent) => void;
  onRequestNewLesson: (groupId: string) => void;
  onRequestRecovery: (studentId: string, lessonId: string) => void;
  onSetAttendanceStatus: (studentId: string, lessonId: string, status: AttendanceStatus) => void;
  onToggleStar: (studentId: string, lessonId: string) => void;
}) {
  const rewardEmoji = getRewardEmoji(group.reward_type);
  const topRanked = students.filter((s) => s.rank <= 3);
  const firstPlaceCount = topRanked.filter((s) => s.rank === 1).length;
  const groupLessons = lessons.filter((l) => l.group_id === group.id);
  const groupLessonIds = new Set(groupLessons.map((l) => l.id));
  const groupAttendance = attendance.filter((a) => groupLessonIds.has(a.lesson_id));
  const attendanceCountFor = (studentId: string) =>
    groupAttendance.filter((a) => a.student_id === studentId && (a.status === 'present' || a.status === 'made_up')).length;

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-[#C8F023] font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity">
        ← Inapoi la Clase
      </button>
      <h2 className="text-xl md:text-2xl font-bold mb-6">📚 {group.group_name}</h2>

      <div className="mb-6 bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-3xl p-4 tracker-card-shadow">
        <h3 className="text-lg font-semibold mb-3">🏆 Clasament</h3>
        {topRanked.length === 0 ? (
          <p className="text-gray-400 text-center py-4">Niciun elev inca</p>
        ) : (
          <div className="space-y-2">
            {topRanked.map((s) => {
              const progressPct = ((s.progress % 16) / 16) * 100;
              return (
                <div key={s.id} className={`${MEDAL_CLASSES[s.rank - 1]} rounded-2xl p-3 text-black`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{MEDALS[s.rank - 1]}</span>
                    <div className="flex-1">
                      <div className="font-bold">{s.name}</div>
                      <div className="text-[11px] font-medium text-black/60">🗓️ {attendanceCountFor(s.id)} prezențe</div>
                      {s.rank === 1 && firstPlaceCount > 1 && (
                        <div className="text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 inline-block px-2 py-0.5 rounded-full text-white">
                          ⚡ Prieteni Fulgeri
                        </div>
                      )}
                    </div>
                    <span className="font-semibold">{s.progress} {rewardEmoji}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-black/15 overflow-hidden">
                    <div className="h-full rounded-full bg-[#C8F023] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AttendanceBoard
        group={group} students={students} lessons={groupLessons} attendance={groupAttendance}
        onRequestNewLesson={onRequestNewLesson} onRequestRecovery={onRequestRecovery}
        onSetStatus={onSetAttendanceStatus} onToggleStar={onToggleStar}
      />

      <div className="space-y-4">
        {students.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Adauga elevi din meniu</p>
        ) : (
          students.map((s, i) => (
            <StudentCard
              key={s.id} student={s} index={i} totalStudents={students.length} moduleCount={group.module_count || 1}
              rewardEmoji={rewardEmoji} attendanceCount={attendanceCountFor(s.id)} onEdit={() => onEditStudent(s)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AttendanceBoard({
  group, students, lessons, attendance, onRequestNewLesson, onRequestRecovery, onSetStatus, onToggleStar,
}: {
  group: TrackerGroup; students: (TrackerStudent & { rank: number })[]; lessons: TrackerLesson[]; attendance: TrackerAttendance[];
  onRequestNewLesson: (groupId: string) => void;
  onRequestRecovery: (studentId: string, lessonId: string) => void;
  onSetStatus: (studentId: string, lessonId: string, status: AttendanceStatus) => void;
  onToggleStar: (studentId: string, lessonId: string) => void;
}) {
  const sortedLessons = [...lessons].sort((a, b) => a.session_number - b.session_number);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(sortedLessons.length > 0 ? sortedLessons[sortedLessons.length - 1].id : null);
  const rewardEmoji = getRewardEmoji(group.reward_type);
  const prevLenRef = useRef(sortedLessons.length);

  // Urmareste lista de lectii a grupei: cand apare una noua (creata din modalul "+ Lectie
  // noua"), sarim automat pe ea. Altfel, daca nu era nimic selectat, luam ultima existenta.
  useEffect(() => {
    const grew = sortedLessons.length > prevLenRef.current;
    if (grew || (!selectedLessonId && sortedLessons.length > 0)) {
      setSelectedLessonId(sortedLessons[sortedLessons.length - 1].id);
    }
    prevLenRef.current = sortedLessons.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedLessons.length]);

  const selectedIndex = sortedLessons.findIndex((l) => l.id === selectedLessonId);
  const selectedLesson = selectedIndex >= 0 ? sortedLessons[selectedIndex] : null;

  function goPrev() { if (selectedIndex > 0) setSelectedLessonId(sortedLessons[selectedIndex - 1].id); }
  function goNext() { if (selectedIndex >= 0 && selectedIndex < sortedLessons.length - 1) setSelectedLessonId(sortedLessons[selectedIndex + 1].id); }

  return (
    <div className="mb-6 bg-gray-900 border border-gray-700 rounded-3xl p-4 tracker-card-shadow">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h3 className="text-lg font-semibold">📋 Prezență &amp; Stelute</h3>
        <button
          onClick={() => onRequestNewLesson(group.id)} title="Adauga lectie noua"
          className="tracker-btn-primary w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Legendă: ✓ = Prezent &nbsp;|&nbsp; ✗ = Absent &nbsp;|&nbsp; 🔄 = Recuperat &nbsp;|&nbsp; ⭐ = Temă
      </p>

      {sortedLessons.length === 0 ? (
        <p className="text-gray-400 text-center py-6 text-sm">Nicio lectie inca. Apasa + pentru a adauga prima lectie.</p>
      ) : selectedLesson && (
        <>
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={goPrev} disabled={selectedIndex <= 0} title="Lectia anterioara"
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <select
              value={selectedLesson.id}
              onChange={(e) => setSelectedLessonId(e.target.value)}
              className="bg-transparent text-center font-bold text-base md:text-lg cursor-pointer focus:outline-none max-w-[220px] truncate"
            >
              {sortedLessons.map((l) => (
                <option key={l.id} value={l.id} className="bg-gray-900 text-white">
                  Lectia {l.session_number} · {new Date(l.lesson_date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}
                </option>
              ))}
            </select>
            <button
              onClick={goNext} disabled={selectedIndex >= sortedLessons.length - 1} title="Lectia urmatoare"
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="space-y-2">
            {students.map((s) => {
              const record = attendance.find((a) => a.lesson_id === selectedLesson.id && a.student_id === s.id);
              const status: AttendanceStatus = record?.status ?? 'absent';
              const hasStar = record?.has_star ?? false;
              const starDisabled = status === 'absent';
              return (
                <div key={s.id} className="flex items-center gap-2 bg-gray-800/70 rounded-2xl px-3 py-2">
                  <span className="flex-1 min-w-0 truncate font-semibold text-sm">{s.name}</span>
                  <div className="flex items-center gap-1.5">
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
                  <button
                    onClick={() => !starDisabled && onToggleStar(s.id, selectedLesson.id)}
                    disabled={starDisabled}
                    title={starDisabled ? 'Elevul trebuie sa fie prezent sau sa fi recuperat lectia' : 'Tema facuta'}
                    className={`ml-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${starDisabled ? 'bg-gray-800 text-gray-700 opacity-40 cursor-not-allowed' : hasStar ? 'bg-[#C8F023] text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {rewardEmoji}
                  </button>
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
  student, index, totalStudents, moduleCount, rewardEmoji, attendanceCount, onEdit,
}: {
  student: TrackerStudent & { rank: number }; index: number; totalStudents: number; moduleCount: number;
  rewardEmoji: string; attendanceCount: number; onEdit: () => void;
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
            <h4 className="text-lg font-bold">{student.name}</h4>
            {totalStudents >= 2 && student.rank <= 3 && <span className="text-3xl ml-2">{MEDALS[student.rank - 1]}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <div className="tracker-level-badge inline-block px-3 py-1 rounded-full text-white text-sm font-semibold">
              Nivel {levelInfo.level} - {levelInfo.name}
            </div>
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
              🗓️ {attendanceCount} prezențe
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

      <div className="flex gap-2">
        <button onClick={onEdit} className="bg-gray-200 hover:bg-gray-300 flex-1 px-3 py-2 rounded-2xl font-semibold text-sm transition-colors">
          ⚙️ Editeaza elev
        </button>
      </div>
    </div>
  );
}
